/**
 * The native gate's Android leg: our own AVD (`rockhop_api36`, Android 16 / API 36 — Play's target level) on a
 * headless emulator (`-no-window -no-audio`, its own console port so other sessions' emulators are never touched),
 * the store debug .apk installed and started with `--es rockhopGate '<json>'`. The shell arms the in-app runner
 * (src/platform/gate.ts) through a document-start script; the harness attaches to the WebView over CDP
 * (`adb forward` to `webview_devtools_remote_<pid>`, then plain CDP `Runtime.evaluate` over the page's WebSocket —
 * Playwright's `connectOverCDP` needs browser-context management a WebView does not implement) and reads
 * `window.__rockhopGateResults`. The ride is recorded with `adb shell screenrecord`.
 *
 * Silent twice over: the emulator has no audio device (`-no-audio`), and the page opens no AudioContext
 * (`navigator.webdriver` is true under the gate; the run reports the count constructed — must be 0).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../lib/paths';
import { APP_ID, armFor, freshOutDir, contactSheet, OUT, readManifest, sh, sleep, until, type GateArm, type GateMessages, type PlatformRun } from './lib';

const SDK = process.env['ANDROID_HOME'] ?? path.join(process.env['HOME'] ?? '', 'Library', 'Android', 'sdk');
const ADB = path.join(SDK, 'platform-tools', 'adb');
const EMULATOR = path.join(SDK, 'emulator', 'emulator');
const AVDMANAGER = path.join(SDK, 'cmdline-tools', 'latest', 'bin', 'avdmanager');
const JAVA_HOME = process.env['JAVA_HOME'] ?? '/Users/raynos/Library/Java/JavaVirtualMachines/jdk-21.0.12.1+1/Contents/Home';
export const AVD = 'rockhop_api36';
const PORT = 5584;
const SERIAL = `emulator-${PORT}`;
const IMAGE = 'system-images;android-36;google_apis;arm64-v8a';
const CDP_PORT = 9384;

export function apkPath(): string {
  return path.join(REPO_ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
}

const adb = (a: string[], allowFail = false): string => sh(ADB, ['-s', SERIAL, ...a], { allowFail });

export function ensureAvd(): void {
  const list = sh(EMULATOR, ['-list-avds']);
  if (list.split('\n').includes(AVD)) return;
  sh(AVDMANAGER, ['create', 'avd', '-n', AVD, '-k', IMAGE, '-d', 'pixel_7', '--force'], { input: 'no\n', env: { JAVA_HOME } });
}

/** Boots the emulator headless unless it is already up on our port. Returns true when this call started it. */
export async function bootEmulator(): Promise<boolean> {
  if (sh(ADB, ['devices']).includes(`${SERIAL}\tdevice`)) return false;
  ensureAvd();
  const child = spawn(EMULATOR, ['-avd', AVD, '-port', String(PORT), '-no-window', '-no-audio', '-no-boot-anim', '-no-snapshot-save', '-gpu', 'swiftshader_indirect', '-memory', '4096'], { stdio: 'ignore', detached: true });
  child.unref();
  await until('the emulator on adb', () => sh(ADB, ['devices']).includes(`${SERIAL}\tdevice`), 180_000, 2000);
  await until('boot_completed', () => adb(['shell', 'getprop', 'sys.boot_completed'], true).trim() === '1', 300_000, 2000);
  // Landscape, no rotation from the (absent) sensor, and never sleep while the gate runs.
  adb(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0'], true);
  adb(['shell', 'settings', 'put', 'system', 'user_rotation', '1'], true);
  adb(['shell', 'svc', 'power', 'stayon', 'true'], true);
  adb(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'], true);
  return true;
}

export function killEmulator(): void {
  sh(ADB, ['-s', SERIAL, 'emu', 'kill'], { allowFail: true });
}

async function webviewSocket(pid: string): Promise<string> {
  return until('the WebView devtools socket', () => {
    const unix = adb(['shell', 'cat', '/proc/net/unix'], true);
    const m = new RegExp(`@(webview_devtools_remote_${pid})\\b`).exec(unix);
    return m?.[1] ?? null;
  }, 60_000, 1000);
}

/** The smallest CDP client that works against an Android WebView: `/json` for the page, `Runtime.evaluate` over its socket. */
async function cdpEvaluate<T>(port: number, expression: string): Promise<T | null> {
  const pages = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as { type: string; url: string; webSocketDebuggerUrl?: string }[];
  const page = pages.find((p) => p.type === 'page' && p.url.startsWith('https://localhost') && p.webSocketDebuggerUrl);
  if (!page?.webSocketDebuggerUrl) return null;
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  try {
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('CDP socket error'));
    });
    const reply = await new Promise<{ result?: { result?: { value?: unknown } } }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP evaluate timed out')), 15_000);
      ws.onmessage = (e) => {
        const m = JSON.parse(String(e.data)) as { id?: number };
        if (m.id !== 1) return;
        clearTimeout(timer);
        resolve(m as { result?: { result?: { value?: unknown } } });
      };
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    });
    return (reply.result?.result?.value ?? null) as T | null;
  } finally {
    ws.close();
  }
}

export async function runAndroid(opts: { arm?: Partial<GateArm>; record?: boolean; timeoutS?: number; keepEmulator?: boolean; tag?: string } = {}): Promise<PlatformRun> {
  const t0 = Date.now();
  const apk = apkPath();
  if (!fs.existsSync(apk)) throw new Error(`no ${path.relative(REPO_ROOT, apk)}: run \`node scripts/store-build.mjs debug --android\``);
  const arm = armFor(readManifest(), opts.arm);
  const started = await bootEmulator();
  const notes: string[] = [];
  const outDir = freshOutDir(path.join(OUT, `android${opts.tag ? `-${opts.tag}` : ''}`));
  adb(['shell', 'am', 'force-stop', APP_ID], true);
  adb(['install', '-r', '-t', apk]);
  adb(['shell', 'pm', 'clear', APP_ID], true); // a cold start: no WebView cache, no storage from the last run
  adb(['logcat', '-c'], true);
  // screenrecord stops at 180 s: record in back-to-back segments and join them afterwards.
  let recording = opts.record !== false;
  const segments: string[] = [];
  let rec: ReturnType<typeof spawn> | null = null;
  const nextSegment = (): void => {
    if (!recording) return;
    const remote = `/sdcard/rockhop-gate-${segments.length}.mp4`;
    segments.push(remote);
    rec = spawn(ADB, ['-s', SERIAL, 'shell', 'screenrecord', '--bit-rate', '6000000', '--time-limit', '170', remote], { stdio: 'ignore' });
    rec.once('exit', () => nextSegment());
  };
  if (recording) {
    adb(['shell', 'rm', '-f', '/sdcard/rockhop-gate-*.mp4'], true);
    nextSegment();
    await sleep(1000);
  }
  // `am start` goes through the device shell: single-quote the JSON (it holds no single quotes).
  const json = JSON.stringify(arm);
  if (json.includes("'")) throw new Error('gate arm JSON must not contain single quotes');
  adb(['shell', `am start -W -n ${APP_ID}/.MainActivity --es rockhopGate '${json}'`]);
  const pid = await until('the app pid', () => adb(['shell', 'pidof', APP_ID], true).trim() || null, 30_000, 500);
  const socket = await webviewSocket(pid);
  sh(ADB, ['-s', SERIAL, 'forward', `tcp:${CDP_PORT}`, `localabstract:${socket}`]);
  let messages: GateMessages = {};
  try {
    await until('Android gate done', async () => {
      const r = await cdpEvaluate<GateMessages>(CDP_PORT, 'window.__rockhopGateResults || null').catch(() => null);
      if (r) messages = { ...messages, ...r };
      return messages['done'] ?? messages['error'];
    }, (opts.timeoutS ?? 1200) * 1000, 2000);
    await sleep(1500);
  } catch (e) {
    notes.push(String(e));
  } finally {
    sh(ADB, ['-s', SERIAL, 'forward', '--remove', `tcp:${CDP_PORT}`], { allowFail: true });
    fs.writeFileSync(path.join(outDir, 'logcat.txt'), adb(['logcat', '-d', '-s', 'Capacitor/Console:*', 'RockhopGate:*', 'chromium:*'], true));
  }
  let clip: string | null = null;
  if (segments.length) {
    recording = false;
    const last = rec as ReturnType<typeof spawn> | null;
    adb(['shell', 'pkill', '-INT', 'screenrecord'], true);
    if (last && last.exitCode === null) await new Promise((r) => last.once('exit', r));
    await sleep(1500);
    const parts: string[] = [];
    for (const [i, remote] of segments.entries()) {
      const local = path.join(outDir, `seg-${i}.mp4`);
      sh(ADB, ['-s', SERIAL, 'pull', remote, local], { allowFail: true });
      if (fs.existsSync(local) && fs.statSync(local).size > 0) parts.push(local);
    }
    if (parts.length) {
      const list = path.join(outDir, 'segments.txt');
      fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
      const local = path.join(outDir, 'clip.mp4');
      sh('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-an', local]);
      for (const p of parts) fs.rmSync(p, { force: true });
      fs.rmSync(list, { force: true });
      contactSheet(local, path.join(outDir, 'sheet.jpg'), 12);
      clip = local;
    }
  }
  adb(['shell', 'am', 'force-stop', APP_ID], true);
  for (const [name, m] of Object.entries(messages)) fs.writeFileSync(path.join(outDir, `${name}.json`), `${JSON.stringify(m, null, 1)}\n`);
  if (started && !opts.keepEmulator) killEmulator();
  const release = adb(['shell', 'getprop', 'ro.build.version.release'], true).trim();
  return { platform: 'android', device: `Android emulator ${AVD} (API 36${release ? `, Android ${release}` : ''}, SwiftShader GL, headless)`, ok: !messages['error'] && !!messages['result'], messages, clip, wallS: Math.round((Date.now() - t0) / 1000), notes };
}
