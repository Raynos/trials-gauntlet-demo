/**
 * Store screenshots from played runs (docs/plans/STORE_RELEASE.md Phase 6: "taken from played runs, never posed").
 *
 *   node scripts/store-build.mjs debug --ios                  # the debug bundle carries every golden under gate/
 *   npx tsx harness/native/screens.ts ios  [--shots <spec>] [--map] [--play-out] [--hold ms] [--final]
 *   npx tsx harness/native/screens.ts play [--shots <spec>] [--map] [--play-out] [--hold ms] [--final]
 *
 * <spec> = `track/bot-3.json@0.3,0.62;other/bot-3.json@2300,2340!;last/bot-3.json@results` — a recording under
 * harness/inputs and where in the run to shoot (fractions of the run, or ticks when > 1; `!` = at exactly those ticks;
 * `results` = ride it over the line in the app and shoot the results ticket). `--map` plays every recording out to
 * its finish (the save then holds each run's best, as a player's would) and ends on the world map, through the
 * ticket's MAP tile when there is a results run. The in-app runner (src/platform/gate.ts `shots`) replays each one
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
 * store/screenshots/<app-store-6.9|play-phone>/. With no --shots the store set runs (STORE_RIDES); pass --map for it.
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

/**
 * The store set (docs/evidence/store-release/media/README.md): moments picked by scanning 429 frames of the 12 goldens
 * at exact ticks, every one BAILS 0, all four zones. In store order, hero first; then the courses ridden only so the
 * save holds a real best for each (the world map shows 12 / 12); last, Lift Line ridden in the app to the results
 * ticket, whose MAP tile opens the world map. Play takes eight images, so it drops the last two ride shots.
 */
const STORE_RIDES = [
  'd2-conveyor/bot-3.json@2198!', // quarry: off the head pulley, the headframe and the pit behind
  'a2-log-jam/bot-3.json@2164!', // alpine: launched off the teetering log over the logging truck
  'c3-hull-breach/bot-3.json@812!', // coast: off the stern over the harbour, cranes and ships
  's2-cornice/bot-3.json@1428!', // snowline: off the cornice's wind lip, the lift line and the snow-cat
  'd3-rope-walk/bot-3.json@3418!', // quarry: front wheel up across the rope bridge's missing boards
  'c1-low-tide/bot-3.json@906!', // coast: through the buoy gate on the quay
  's2-cornice/bot-3.json@2846!', // snowline: nose-down mid-air over the fence shelf (iOS only)
  'a1-sawdust/bot-3.json@2604!', // alpine: off the flume's lip over the mill pond (iOS only)
];
const STORE_PLAY_OUT = ['c2-crane-hop', 'a3-timberline', 'd1-dust-devil', 's3-whiteout'];
function defaultSpec(): string {
  const rides = platform === 'play' ? STORE_RIDES.slice(0, 6) : STORE_RIDES;
  const ridden = new Set(rides.map((r) => r.split('/')[0]!));
  const rest = [...STORE_RIDES.map((r) => r.split('/')[0]!), ...STORE_PLAY_OUT].filter((t) => !ridden.has(t));
  return [...rides, ...[...new Set(rest)].map((t) => `${t}/bot-3.json@`), 's1-lift-line/bot-3.json@results'].join(';');
}

type Shot = { recording: string; at: number[]; exact?: boolean };

/**
 * `track/file@marks`: marks are fractions (<= 1) or ticks; a trailing `!` shoots each mark at its own tick (default:
 * the next airborne frame after a clean second). `track/file@results` is not a ride shot: that recording is ridden
 * over the line in the app itself (the player's path) and the results ticket is shot. `c3-hull-breach/bot-3.json@2300,2340!`
 */
function parseSpec(spec: string): { shots: Shot[]; results?: string } {
  const shots: Shot[] = [];
  let results: string | undefined;
  for (const part of spec.split(';').filter(Boolean)) {
    const [file, atRaw] = part.split('@');
    const [track, name] = file!.split('/');
    if (!fs.existsSync(path.join(REPO_ROOT, 'harness', 'inputs', track!, name!))) throw new Error(`no harness/inputs/${file}`);
    const recording = `gate/${track}.${name}`;
    let at = atRaw ?? '0.5';
    if (at === 'results') {
      results = recording;
      continue;
    }
    const exact = at.endsWith('!');
    if (exact) at = at.slice(0, -1);
    shots.push({ recording, at: at.split(',').filter(Boolean).map(Number), ...(exact ? { exact } : {}) });
  }
  return { shots, ...(results ? { results } : {}) };
}

/** The gate options every platform passes: hold per shot, play-out, the front-end results + map. */
function gateExtras(spec: { results?: string }): { holdMs: number; playOut: boolean; front: { results?: string; map: boolean } } {
  const map = args.includes('--map');
  return { holdMs: Number(opt('hold') ?? 3000), playOut: args.includes('--play-out') || map, front: { ...(spec.results ? { results: spec.results } : {}), map } };
}

async function shootIos(spec: { shots: Shot[]; results?: string }, outDir: string): Promise<string[]> {
  const app = iosAppPath();
  if (!fs.existsSync(app)) throw new Error('run `node scripts/store-build.mjs debug --ios` first');
  const udid = ensureDevice();
  await bootDevice(udid);
  // A clean status bar is not needed (the game hides it), but a fixed clock keeps the panel identical run to run.
  sh('xcrun', ['simctl', 'status_bar', udid, 'override', '--time', '9:41'], { allowFail: true });
  sh('xcrun', ['simctl', 'terminate', udid, APP_ID], { allowFail: true });
  // A fresh install: a new player's save, so the map and the results ticket show only this run's rides.
  sh('xcrun', ['simctl', 'uninstall', udid, APP_ID], { allowFail: true });
  sh('xcrun', ['simctl', 'install', udid, app]);
  const gateDir = path.join(sh('xcrun', ['simctl', 'get_app_container', udid, APP_ID, 'data']).trim(), 'Documents', 'gate');
  fs.rmSync(gateDir, { recursive: true, force: true });
  const launched = spawn('xcrun', ['simctl', 'launch', '--terminate-running-process', udid, APP_ID, '-rockhopGate', JSON.stringify({ shots: spec.shots, ...gateExtras(spec) })], { stdio: 'ignore' });
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

async function shootPlay(spec: { shots: Shot[]; results?: string }, outDir: string): Promise<string[]> {
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
    }, { platform: 'web', shots: spec.shots, ...gateExtras(spec), holdMs: Number(opt('hold') ?? 2500) });
    await page.goto(server.url);
    for (;;) {
      const m = await until('the next shot', () => pending.shift() ?? null, 300_000, 100);
      if (m.name === 'error') throw new Error(String(m['error']));
      if (m.name === 'done') break;
      if (!m.name.startsWith('shot-')) {
        console.info(`gate ${m.name} ${JSON.stringify(m).slice(0, 400)}`);
        continue;
      }
      const n = Number(m['index']);
      const out = path.join(outDir, `${String(n + 1).padStart(2, '0')}-${String(m['trackId'])}-t${String(m['tick'])}.png`);
      await page.screenshot({ path: out, type: 'png' });
      await page.evaluate((k) => ((window as unknown as { __rockhopGateAck?: number }).__rockhopGateAck = k), n);
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
  const spec = parseSpec(opt('shots') ?? defaultSpec());
  const outDir = path.join(OUT, 'screens', platform);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const files = platform === 'ios' ? await shootIos(spec, outDir) : await shootPlay(spec, outDir);
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
