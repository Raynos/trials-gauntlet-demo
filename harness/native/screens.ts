/**
 * Store screenshots from played runs (docs/plans/STORE_RELEASE.md Phase 6: "taken from played runs, never posed").
 *
 *   node scripts/store-build.mjs debug --ios                  # the debug bundle carries every golden under gate/
 *   npx tsx harness/native/screens.ts ios  [--shots <spec>] [--final]
 *   npx tsx harness/native/screens.ts play [--shots <spec>] [--final]
 *
 * <spec> = `track/bot-3.json@0.3,0.62;other/bot-3.json@0.5` — a recording under harness/inputs and where in the run
 * to shoot (fractions of the run, or ticks when > 1). The in-app runner (src/platform/gate.ts `shots`) replays each one
 * paced and rendered and holds still at every mark while the frame is grabbed. The frame is whatever the ride shows at
 * that tick.
 *
 *   ios   the `rockhop-gate` simulator (iPhone 17 Pro Max): `simctl io screenshot` of the panel (1320×2868), turned
 *         upright to 2868×1320 — App Store Connect's 6.9" landscape size, exactly.
 *   play  headless Chromium as a phone (touch, coarse pointer: the game's phone layout) at 960×540 CSS px × DPR 2 =
 *         1920×1080: Play's 16:9 phone screenshot at the size its promotion surfaces ask for. The same store bundle
 *         the Android shell wraps; the emulator is off-limits on this host (harness/native/README.md load rule).
 *
 * Output: harness/out/native/screens/<platform>/NN-<track>-t<tick>.png; `--final` also copies them to
 * store/screenshots/<app-store-6.9|play-phone>/ (only once the reskin has landed — the parent says when).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { REPO_ROOT } from '../lib/paths';
import { APP_ID, OUT, sh, sleep, until, type GateMessages } from './lib';
import { bootDevice, ensureDevice, iosAppPath } from './ios';
import { serveWebDir } from './web';

const args = process.argv.slice(2);
const platform = args[0];
const opt = (n: string): string | undefined => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

/** Default set: one run per zone once the ROCKHOP tracks have goldens, else the curriculum's first tracks. */
function defaultSpec(): string {
  const zones = ['c2-crane-hop', 'a3-timberline', 'd2-conveyor', 's2-cornice', 'c3-hull-breach', 'd3-rope-walk'];
  const have = zones.filter((t) => fs.existsSync(path.join(REPO_ROOT, 'harness', 'inputs', t, 'bot-3.json')));
  const tracks = have.length >= 4 ? have : ['b1-first-ride', 'e3-stairway', 'm3-see-saw', 'h2-gap-chain', 'x1-vertical-limit'];
  return tracks.map((t) => `${t}/bot-3.json@0.55`).join(';');
}

function parseSpec(spec: string): { recording: string; at: number[] }[] {
  return spec
    .split(';')
    .filter(Boolean)
    .map((part) => {
      const [file, at] = part.split('@');
      const [track, name] = file!.split('/');
      if (!fs.existsSync(path.join(REPO_ROOT, 'harness', 'inputs', track!, name!))) throw new Error(`no harness/inputs/${file}`);
      return { recording: `gate/${track}.${name}`, at: (at ?? '0.5').split(',').map(Number) };
    });
}

async function shootIos(shots: { recording: string; at: number[] }[], outDir: string): Promise<string[]> {
  const app = iosAppPath();
  if (!fs.existsSync(app)) throw new Error('run `node scripts/store-build.mjs debug --ios` first');
  const udid = ensureDevice();
  await bootDevice(udid);
  // A clean status bar is not needed (the game hides it), but a fixed clock keeps the panel identical run to run.
  sh('xcrun', ['simctl', 'status_bar', udid, 'override', '--time', '9:41'], { allowFail: true });
  sh('xcrun', ['simctl', 'terminate', udid, APP_ID], { allowFail: true });
  sh('xcrun', ['simctl', 'install', udid, app]);
  const gateDir = path.join(sh('xcrun', ['simctl', 'get_app_container', udid, APP_ID, 'data']).trim(), 'Documents', 'gate');
  fs.rmSync(gateDir, { recursive: true, force: true });
  const launched = spawn('xcrun', ['simctl', 'launch', '--terminate-running-process', udid, APP_ID, '-rockhopGate', JSON.stringify({ shots, holdMs: 3000 })], { stdio: 'ignore' });
  const files: string[] = [];
  try {
    for (let n = 0; ; n++) {
      const got = await until(`shot ${n}`, () => {
        for (const name of [`shot-${n}`, 'done', 'error']) {
          const f = path.join(gateDir, `${name}.json`);
          if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')) as GateMessages[string];
        }
        return null;
      }, 300_000, 150);
      if (got.name !== `shot-${n}`) {
        if (got.name === 'error') throw new Error(String(got['error']));
        break;
      }
      const out = path.join(outDir, `${String(n + 1).padStart(2, '0')}-${String(got['trackId'])}-t${String(got['tick'])}.png`);
      // The shell's own WKWebView snapshot (RockhopViewController GateSink), already upright at native pixels. A
      // panel grab is the fallback: it carries the simulator's Dynamic Island overlay and is portrait.
      const snap = path.join(gateDir, `shot-${n}.png`);
      if (fs.existsSync(snap)) {
        execFileSync('magick', [snap, '-alpha', 'off', out]);
      } else {
        await sleep(300);
        const raw = path.join(outDir, `raw-${n}.png`);
        sh('xcrun', ['simctl', 'io', udid, 'screenshot', '--type=png', '--mask=ignored', raw]);
        execFileSync('magick', [raw, '-rotate', '-90', '-alpha', 'off', out]);
        fs.rmSync(raw);
      }
      files.push(out);
    }
  } finally {
    launched.kill();
    sh('xcrun', ['simctl', 'terminate', udid, APP_ID], { allowFail: true });
    sh('xcrun', ['simctl', 'status_bar', udid, 'clear'], { allowFail: true });
  }
  return files;
}

async function shootPlay(shots: { recording: string; at: number[] }[], outDir: string): Promise<string[]> {
  const server = await serveWebDir();
  // The Mac's GPU by default (the load rule, harness/native/README.md); SwiftShader elsewhere or when asked.
  const metal = (process.env['TRIALS_BROWSER_BACKEND'] ?? (process.platform === 'darwin' ? 'metal' : 'swiftshader')) === 'metal';
  const backend = metal ? ['--use-angle=metal'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const browser = await chromium.launch({ headless: true, args: ['--ignore-gpu-blocklist', ...backend] });
  const files: string[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const pending: GateMessages[string][] = [];
    await page.exposeFunction('__rockhopGateSink', (s: string) => pending.push(JSON.parse(s) as GateMessages[string]));
    await page.addInitScript((arm) => {
      const g = window as unknown as Record<string, unknown>;
      g['__rockhopGate'] = arm;
      g['__rockhopGatePost'] = (m: unknown) => (g['__rockhopGateSink'] as (s: string) => void)(JSON.stringify(m));
    }, { platform: 'web', shots, holdMs: 2500 });
    await page.goto(server.url);
    for (;;) {
      const m = await until('the next shot', () => pending.shift() ?? null, 300_000, 100);
      if (m.name === 'error') throw new Error(String(m['error']));
      if (m.name === 'done') break;
      if (!m.name.startsWith('shot-')) continue;
      const n = Number(m['index']);
      const out = path.join(outDir, `${String(n + 1).padStart(2, '0')}-${String(m['trackId'])}-t${String(m['tick'])}.png`);
      await page.screenshot({ path: out, type: 'png' });
      execFileSync('magick', [out, '-alpha', 'off', out]);
      files.push(out);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return files;
}

async function main(): Promise<void> {
  if (platform !== 'ios' && platform !== 'play') throw new Error('usage: screens.ts <ios|play> [--shots spec] [--final]');
  const shots = parseSpec(opt('shots') ?? defaultSpec());
  const outDir = path.join(OUT, 'screens', platform);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const files = platform === 'ios' ? await shootIos(shots, outDir) : await shootPlay(shots, outDir);
  const want = platform === 'ios' ? '2868x1320' : '1920x1080';
  for (const f of files) {
    const size = execFileSync('magick', ['identify', '-format', '%wx%h', f], { encoding: 'utf8' }).trim();
    console.info(`${size === want ? 'OK  ' : 'SIZE'} ${size}  ${path.relative(REPO_ROOT, f)}`);
    if (size !== want) process.exitCode = 1;
  }
  if (args.includes('--final')) {
    const dest = path.join(REPO_ROOT, 'store', 'screenshots', platform === 'ios' ? 'app-store-6.9' : 'play-phone');
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    for (const f of files) fs.copyFileSync(f, path.join(dest, path.basename(f)));
    console.info(`final: ${path.relative(REPO_ROOT, dest)} (${files.length})`);
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 2;
});
