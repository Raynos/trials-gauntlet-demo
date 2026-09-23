/**
 * The native gate's iOS leg: a dedicated simulator (`rockhop-gate`, an iPhone 17 Pro Max — the 6.9" class the App
 * Store screenshots need), booted headless (no Simulator.app window, AGENTS.md), the store debug .app installed and
 * launched with `-rockhopGate '<json>'`. The in-app runner (src/platform/gate.ts) writes each result to the app's
 * `Documents/gate/<name>.json`, read back through `simctl get_app_container`. The ride is recorded with
 * `simctl io recordVideo` (the panel is portrait; the clip is rotated upright afterwards).
 *
 * Silent: the shell makes `navigator.webdriver` true for a gate launch, so the game opens no AudioContext; the run
 * reports the count of AudioContexts constructed (must be 0).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../lib/paths';
import { APP_ID, armFor, freshOutDir, contactSheet, OUT, readManifest, sh, sleep, until, uprightVideo, type GateArm, type GateMessages, type PlatformRun } from './lib';

export const IOS_DEVICE_NAME = 'rockhop-gate';
const DEVICE_TYPE = 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max';

export function iosAppPath(): string {
  return path.join(REPO_ROOT, 'store', 'build', 'ios-derived', 'Build', 'Products', 'Debug-iphonesimulator', 'App.app');
}

interface SimDevice {
  udid: string;
  name: string;
  state: string;
  isAvailable: boolean;
}

/** Our own simulator, created on first use: other sessions' booted devices are never touched. */
export function ensureDevice(name = IOS_DEVICE_NAME): string {
  const list = JSON.parse(sh('xcrun', ['simctl', 'list', 'devices', 'available', '--json'])) as { devices: Record<string, SimDevice[]> };
  for (const [runtime, devs] of Object.entries(list.devices)) {
    const d = devs.find((x) => x.name === name && x.isAvailable);
    if (d && runtime.includes('iOS')) return d.udid;
  }
  const runtimes = JSON.parse(sh('xcrun', ['simctl', 'list', 'runtimes', '--json'])) as { runtimes: { identifier: string; isAvailable: boolean; platform?: string }[] };
  const rt = runtimes.runtimes.findLast((r) => r.isAvailable && r.identifier.includes('iOS'));
  if (!rt) throw new Error('no iOS simulator runtime installed');
  return sh('xcrun', ['simctl', 'create', name, DEVICE_TYPE, rt.identifier]).trim();
}

export async function bootDevice(udid: string): Promise<void> {
  sh('xcrun', ['simctl', 'boot', udid], { allowFail: true }); // "already booted" is fine
  sh('xcrun', ['simctl', 'bootstatus', udid, '-b']);
  // Silence belt-and-braces: the game opens no AudioContext under the gate, and the simulator's own UI sounds go off.
  sh('xcrun', ['simctl', 'spawn', udid, 'defaults', 'write', 'com.apple.preferences.sounds', 'keyboard-audio', '-bool', 'false'], { allowFail: true });
}

function dataDir(udid: string): string {
  return sh('xcrun', ['simctl', 'get_app_container', udid, APP_ID, 'data']).trim();
}

function readMessages(dir: string): GateMessages {
  const out: GateMessages = {};
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as GateMessages[string];
      out[m.name] = m;
    } catch {
      /* mid-write */
    }
  }
  return out;
}

export async function runIos(opts: { arm?: Partial<GateArm>; record?: boolean; timeoutS?: number; tag?: string } = {}): Promise<PlatformRun> {
  const t0 = Date.now();
  const app = iosAppPath();
  if (!fs.existsSync(app)) throw new Error(`no ${path.relative(REPO_ROOT, app)}: run \`node scripts/store-build.mjs debug --ios\``);
  const arm = armFor(readManifest(), opts.arm);
  const udid = ensureDevice();
  await bootDevice(udid);
  sh('xcrun', ['simctl', 'terminate', udid, APP_ID], { allowFail: true });
  sh('xcrun', ['simctl', 'install', udid, app]);
  const gateDir = path.join(dataDir(udid), 'Documents', 'gate');
  fs.rmSync(gateDir, { recursive: true, force: true });
  const outDir = freshOutDir(path.join(OUT, `ios${opts.tag ? `-${opts.tag}` : ''}`));
  const raw = path.join(outDir, 'raw.mov');
  const clip = path.join(outDir, 'clip.mp4');
  let rec: ReturnType<typeof spawn> | null = null;
  if (opts.record !== false) {
    fs.rmSync(raw, { force: true });
    rec = spawn('xcrun', ['simctl', 'io', udid, 'recordVideo', '--codec=h264', '--mask=ignored', '--force', raw], { stdio: 'ignore' });
    await sleep(1500);
  }
  const launched = spawn('xcrun', ['simctl', 'launch', '--console-pty', '--terminate-running-process', udid, APP_ID, '-rockhopGate', JSON.stringify(arm)], { stdio: ['ignore', 'pipe', 'pipe'] });
  const log: string[] = [];
  launched.stdout?.on('data', (b: Buffer) => log.push(b.toString()));
  launched.stderr?.on('data', (b: Buffer) => log.push(b.toString()));
  let messages: GateMessages = {};
  const notes: string[] = [];
  try {
    await until('iOS gate done', () => {
      messages = readMessages(gateDir);
      return messages['done'] ?? messages['error'];
    }, (opts.timeoutS ?? 900) * 1000, 1000);
    await sleep(1500); // the clip ends on the last restart settling
  } catch (e) {
    notes.push(String(e));
  } finally {
    if (rec) {
      rec.kill('SIGINT');
      await new Promise((r) => rec!.once('exit', r));
    }
    launched.kill('SIGTERM');
    sh('xcrun', ['simctl', 'terminate', udid, APP_ID], { allowFail: true });
    fs.writeFileSync(path.join(outDir, 'console.log'), log.join(''));
  }
  let clipOut: string | null = null;
  if (rec && fs.existsSync(raw)) {
    uprightVideo(raw, clip, 2);
    contactSheet(clip, path.join(outDir, 'sheet.jpg'), 12);
    fs.rmSync(raw, { force: true });
    clipOut = clip;
  }
  for (const [name, m] of Object.entries(messages)) fs.writeFileSync(path.join(outDir, `${name}.json`), `${JSON.stringify(m, null, 1)}\n`);
  const runtime = sh('xcrun', ['simctl', 'list', 'devices', '--json']).includes(udid) ? udid : 'unknown';
  return { platform: 'ios', device: `iOS Simulator ${IOS_DEVICE_NAME} (iPhone 17 Pro Max, ${runtime})`, ok: !messages['error'] && !!messages['result'], messages, clip: clipOut, wallS: Math.round((Date.now() - t0) / 1000), notes };
}
