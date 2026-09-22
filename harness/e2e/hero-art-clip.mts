/**
 * Played hero-art clip (ask 43, project/archive/HERO_ART_INTEGRATION.md step 5): one WebKit page at phone geometry,
 * recorded start to finish —
 *   boot → menu → GARAGE (tapped) → every outfit tapped, and on each outfit the Pro then the Rookie chip (15 hero swaps;
 *   a per-rAF probe watches every frame of every swap for the ask 29/40 grey flash: the stage dropping, a procedural
 *   stand-in, a frame with no rider) → back to the menu → the same page re-entered in harness mode → b1 from the
 *   Rookie golden as the Street-mustard rider, then b1 from the Pro golden as the Race blue/white rider, every physics
 *   tick from the recording, rendered at 60 fps, the finish-state hash checked against the node replay of the same
 *   golden (the gate's D3) and, for the Pro golden, its pinned finish hash — so the ride on the new hero is the ride the
 *   gate proves; the hero is render-only and any drift is a finding.
 * WebKit here is Playwright's macOS build: WebKit + ANGLE-on-Metal, the iOS Safari stack (harness/hero-webkit.mts).
 *   npx tsx harness/e2e/hero-art-clip.mts [--out=DIR] [--engine=webkit|chromium] [--geom=874x330] [--dpr=3]
 *                                         [--ride-ticks=N (per ride; default the whole golden)] [--quality=high] [--garage-quality=high] [--fast]
 * Writes <out>/clip.webm (+ clip.mp4 when ffmpeg is present), sheet.jpg, log.json (every swap's frames, the ride
 * samples, the hashes) and one device-pixel still per settled swap (`garage-<outfit>[-<bike>].png`, DPR × viewport)
 * — evidence is judged from the clip, the JSON only says what to look at, the stills are for pixel-level inspection.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit, type Page } from 'playwright';
import { startServer } from '../lib/server';
import { loadRecording } from '../lib/recording';
import { createSimFor } from '../lib/sim';
import { REPO_ROOT } from '../lib/paths';
import { resolveFfmpeg } from '../lib/ffmpeg';
import { spawnSync } from 'node:child_process';
import { expandFrames } from '../../src/core/replay';
import { AVAILABLE_RIDER_PRESETS, type RiderOutfit } from '../../src/core/riderPresets';
import type { BikeClass } from '../../src/core/types';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const out = path.resolve(args.get('out') ?? path.join(REPO_ROOT, 'harness', 'out', 'hero-art-clip'));
const engine = args.get('engine') ?? 'webkit';
const [W, H] = (args.get('geom') ?? '874x330').split('x').map(Number) as [number, number];
const DPR = Number(args.get('dpr') ?? 3);
const rideTicksCap = Number(args.get('ride-ticks') ?? 0);
const quality = args.get('quality') ?? 'high';
const fast = args.has('fast');
/** `--garage-quality=high`: pin the garage tier for pixel inspection of the authored rider (the phone's own tier is the governor's; say so in the evidence). */
const garageQuality = args.get('garage-quality');
fs.mkdirSync(out, { recursive: true });

const expected = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'harness', 'gate', 'expected.json'), 'utf8')) as Record<string, Record<string, { hash: string; file?: string; finishTime?: number; ticks?: number }>>;
const RIDES: { outfit: RiderOutfit; bike: BikeClass; golden: string; pinKey: string }[] = [
  { outfit: 'street-mustard', bike: 'rookie', golden: 'bot-3.json', pinKey: 'b1-first-ride' },
  { outfit: 'race-bluewhite', bike: 'pro', golden: 'bot-3-pro.json', pinKey: 'b1-first-ride:pro' },
];

interface SwapFrame { i: number; ms: number; heroDoc: string; outfit: string | null; garageOn: boolean; hidden: number; calls: number; tris: number; status: string; entering: boolean; stageClip: string | null; stanceOn: boolean | null }
interface Swap { kind: 'outfit' | 'bike'; target: string; tapMs: number; settledMs: number; frames: SwapFrame[]; flash: string[] }

const server = await startServer({ freeze: true });
const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, recordVideo: { dir: out, size: { width: W, height: H } },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
await ctx.addInitScript(() => localStorage.setItem('trials.onboarded', '1'));
const page: Page = await ctx.newPage();
const t0 = Date.now();
const now = (): number => Date.now() - t0;
const log: Record<string, unknown> = { engine, geom: `${W}x${H}@${DPR}`, quality, build: server.url, sha: gitSha() };
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(`${now()} ms: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`${now()} ms: console.error ${m.text()}`); });
const marks: Record<string, number> = {};
const mark = (k: string): void => { marks[k] = now(); };
const centre = (sel: string) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const tap = async (sel: string): Promise<void> => { const c = await centre(sel); if (!c) throw new Error(`no element for ${sel}`); await page.touchscreen.tap(c.x, c.y); };

function gitSha(): string {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'unknown';
}

/** Per-rAF probe of the hero and the stage: installed before a tap, read after the swap settled (+ `tail` frames). */
const PROBE_SRC = `window.__swapProbe = (function () {
  var frames = [], on = true, i = 0, start = performance.now();
  function snap() {
    var r = window.__render, d = r.debugInfo();
    var rd = r.debug && r.debug.rider && r.debug.rider.debug ? r.debug.rider.debug : null;
    frames.push({ i: i++, ms: Math.round(performance.now() - start), heroDoc: d.heroDoc, outfit: d.riderOutfit, garageOn: d.garage.on, hidden: d.garage.hidden,
      calls: d.calls, tris: d.tris, status: (document.querySelector('.outfit-current') || {}).textContent || '', entering: d.entering,
      stageClip: rd ? (rd.stageClip === undefined ? null : rd.stageClip) : null, stanceOn: rd && rd.stance ? !!rd.stance.on : null });
    if (on) requestAnimationFrame(snap);
  }
  requestAnimationFrame(snap);
  return { stop: function () { on = false; return frames; } };
})();`;

const swaps: Swap[] = [];
let currentOutfit = 'boot';
async function swapTo(kind: 'outfit' | 'bike', target: string): Promise<void> {
  await page.evaluate(PROBE_SRC);
  const tapMs = now();
  await tap(kind === 'outfit' ? `button[data-outfit="${target}"]` : `button[data-bike="${target}"]`);
  if (kind === 'outfit') {
    await page.waitForFunction((id) => localStorage.getItem('trials.riderOutfit') === id && (window as unknown as { __render: { debugInfo(): { riderOutfit: string | null } } }).__render.debugInfo().riderOutfit === id
      && !/Loading/.test(document.querySelector('.outfit-current')?.textContent ?? ''), target, { timeout: 60_000 });
  } else {
    await page.waitForFunction((id) => document.querySelector(`button[data-bike="${id}"]`)?.getAttribute('aria-pressed') === 'true', target, { timeout: 60_000 });
    // The livery is a document swap under the live family: wait for the renderer to have nothing in flight.
    await page.evaluate(async () => { await (window as unknown as { __render: { whenReady(): Promise<void> } }).__render.whenReady(); });
  }
  const settledMs = now();
  // Hold the settled hero for a beat so the clip shows it, and the probe gets its tail frames.
  await page.waitForTimeout(700);
  const frames = await page.evaluate(() => (window as unknown as { __swapProbe: { stop(): SwapFrame[] } }).__swapProbe.stop());
  // A device-pixel still of the settled hero (DPR × viewport): the close-up the video (CSS px) cannot give — mirror twin, hair shell, beard edges.
  if (kind === 'outfit') currentOutfit = target;
  await page.screenshot({ path: path.join(out, `garage-${currentOutfit}${kind === 'bike' ? `-${target}` : ''}.png`), animations: 'disabled' });
  const flash: string[] = [];
  for (const f of frames) {
    if (!f.garageOn) flash.push(`frame ${f.i} (${f.ms} ms): garage stage OFF`);
    if (/proc/.test(f.heroDoc)) flash.push(`frame ${f.i} (${f.ms} ms): procedural stand-in ${f.heroDoc}`);
    if (f.outfit === null) flash.push(`frame ${f.i} (${f.ms} ms): no glTF rider`);
  }
  // Ask 51: the garage plays the authored `sit_cruise` clip on every frame once the hero is settled (the tail after the swap).
  const tail = frames.filter((f) => f.ms >= (settledMs - tapMs) + 100);
  const notCruise = tail.filter((f) => f.stageClip !== 'sit_cruise');
  if (notCruise.length) flash.push(`${notCruise.length}/${tail.length} settled frames not on sit_cruise (first: frame ${notCruise[0]!.i}, stageClip ${notCruise[0]!.stageClip})`);
  swaps.push({ kind, target, tapMs, settledMs, frames, flash });
  console.log(`swap ${kind} ${target}: ${settledMs - tapMs} ms to settle, ${frames.length} frames probed${flash.length ? `, FLASH: ${flash[0]}` : ''}`);
}

interface RideSample { tick: number; x: number; phase: string; heroDoc: string; calls: number; tris: number; ms: number }
/** Ask 51: per rendered frame — the stance the level pose is on, its blend, and the hand-to-grip residual. */
interface PoseFrame { tick: number; stanceOn: boolean; pose: string; blend: number; wristErr: [number, number]; stageClip: string | null }
interface RideResult { outfit: RiderOutfit; bike: BikeClass; golden: string; ticks: number; frames: number; wallMs: number; finishTime: number | null; nodeFinishTime: number | null; hashAt1200: string | null; hashEnd: string; nodeHash: string; nodeMatch: boolean; pin: string | null; pinMatch: boolean | null; samples: RideSample[]; heroDocs: string[]; pose: { frames: number; stanceOnFrames: number; stanceOffFrames: number[]; maxWristErr: number; wristOver1cm: number[]; poses: Record<string, number>; stageClipFrames: number } }

async function ride(spec: typeof RIDES[number]): Promise<RideResult> {
  const rec = loadRecording(path.join(REPO_ROOT, 'harness', 'inputs', 'b1-first-ride', spec.golden));
  const inputs = expandFrames(rec);
  const hz = rec.header.physicsHz, ticksPerFrame = hz / 60;
  const total = rideTicksCap ? Math.min(inputs.length, rideTicksCap) : inputs.length;
  // The node replay of the same ticks: what the browser must hash to (gate D3).
  const sim = await createSimFor(rec);
  const node = sim.run(inputs.slice(0, total));
  const nodeFinishTime = sim.rules.phase() === 'finished' ? sim.rules.runTicks() / hz : null;
  await page.evaluate(async ({ outfit, bike, trackId, seed, quality }) => {
    const w = window as unknown as { __trials: { setBike(b: string): void; loadTrack(id: string, seed: number): Promise<boolean> | boolean; skipCountdown(): void; setQuality(t: string): void; resize(w: number, h: number): void; info(): { bike: string; seed: number } }; __render: { whenReady(): Promise<void>; setRiderOutfit(o: string): Promise<boolean> } };
    await w.__render.whenReady();
    if (!await w.__render.setRiderOutfit(outfit)) throw new Error(`outfit ${outfit} did not load`);
    w.__trials.setBike(bike);
    await w.__render.whenReady();
    if (!await w.__trials.loadTrack(trackId, seed)) throw new Error('track did not load');
    await w.__render.whenReady();
    w.__trials.setQuality(quality);
    await w.__render.whenReady();
    w.__trials.skipCountdown();
    if (w.__trials.info().bike !== bike || w.__trials.info().seed !== seed) throw new Error('class/seed mismatch');
  }, { outfit: spec.outfit, bike: spec.bike, trackId: rec.header.trackId, seed: rec.header.seed, quality });
  const started = now();
  const samples: RideSample[] = [];
  const heroDocs = new Set<string>();
  let hashAt1200: string | null = null, frames = 0;
  const poseFrames: PoseFrame[] = [];
  for (let tick = 0; tick < total; tick += ticksPerFrame) {
    const s = await page.evaluate(({ batch, sample }) => {
      const w = window as unknown as { __trials: { setInput(f: unknown): void; step(n: number): void; render(sync: boolean): void; getState(): { tick: number; bike: { pos: { x: number } } }; phase(): string; hashState(): string }; __render: { debugInfo(): { heroDoc: string; calls: number; tris: number; profile: string; tier: string } } };
      for (const f of batch) { w.__trials.setInput(f); w.__trials.step(1); }
      w.__trials.render(true);
      const st = w.__trials.getState(), d = w.__render.debugInfo();
      const rd = (w.__render as unknown as { debug?: { rider?: { debug?: { stance?: { on: boolean; pose: string; blend: number }; wristErr: number[]; stageClip: string | null } } } }).debug?.rider?.debug;
      const pose = rd ? { stanceOn: !!rd.stance?.on, pose: rd.stance?.pose ?? '-', blend: rd.stance?.blend ?? 0, wristErr: [rd.wristErr[0] ?? 0, rd.wristErr[1] ?? 0] as [number, number], stageClip: rd.stageClip ?? null } : null;
      return { tick: st.tick, x: Math.round(st.bike.pos.x * 100) / 100, phase: w.__trials.phase(), heroDoc: d.heroDoc, calls: d.calls, tris: d.tris, hash: sample || st.tick === 1200 ? w.__trials.hashState() : null, profile: d.profile, tier: d.tier, pose };
    }, { batch: inputs.slice(tick, tick + ticksPerFrame), sample: frames % 60 === 0 });
    frames++;
    heroDocs.add(s.heroDoc);
    if (s.pose) poseFrames.push({ tick: s.tick, ...s.pose });
    // Real-time pacing: the video is wall-clock, so a frame may not land before its 60 fps slot (`--fast` skips this).
    if (!fast) { const ahead = frames * (1000 / 60) - (now() - started); if (ahead > 2) await page.waitForTimeout(ahead); }
    if (s.tick === 1200) hashAt1200 = s.hash;
    if (s.hash !== null || s.tick === 1200) samples.push({ tick: s.tick, x: s.x, phase: s.phase, heroDoc: s.heroDoc, calls: s.calls, tris: s.tris, ms: now() - started });
    if (samples.length === 1) log[`profile.${spec.bike}`] = `${s.profile}/${s.tier}`;
  }
  const end = await page.evaluate(() => { const t = (window as unknown as { __trials: { hashState(): string; finishTime(): number | null; phase(): string; getState(): { tick: number } } }).__trials; return { hash: t.hashState(), finishTime: t.finishTime(), phase: t.phase(), tick: t.getState().tick }; });
  // The gate's golden pin (finish hash) when the whole golden was ridden and a pin exists for this class.
  const pin = total === inputs.length && expected[spec.pinKey]?.['golden']?.file === spec.golden ? expected[spec.pinKey]!['golden']!.hash : null;
  const pinMatch = pin ? end.hash === pin : null;
  const riding = poseFrames.filter((f) => f.tick > 0);
  const poses: Record<string, number> = {};
  for (const f of riding) poses[f.pose] = (poses[f.pose] ?? 0) + 1;
  const poseSummary = { frames: riding.length, stanceOnFrames: riding.filter((f) => f.stanceOn).length, stanceOffFrames: riding.filter((f) => !f.stanceOn).map((f) => f.tick).slice(0, 40), maxWristErr: riding.reduce((m, f) => Math.max(m, f.wristErr[0], f.wristErr[1]), 0), wristOver1cm: riding.filter((f) => Math.max(f.wristErr[0], f.wristErr[1]) > 0.01).map((f) => f.tick).slice(0, 60), poses, stageClipFrames: riding.filter((f) => f.stageClip !== null).length };
  const result: RideResult = { outfit: spec.outfit, bike: spec.bike, golden: spec.golden, ticks: total, frames, wallMs: now() - started, finishTime: end.finishTime, nodeFinishTime, hashAt1200, hashEnd: end.hash, nodeHash: node.hash, nodeMatch: end.hash === node.hash, pin, pinMatch, samples, heroDocs: [...heroDocs], pose: poseSummary };
  fs.writeFileSync(path.join(out, `pose-${spec.outfit}-${spec.bike}.json`), JSON.stringify(poseFrames));
  console.log(`ride ${spec.outfit}/${spec.bike}: ${frames} frames of ${total} ticks in ${(result.wallMs / 1000).toFixed(1)} s, phase ${end.phase} finish ${end.finishTime} (node ${nodeFinishTime}), hash ${end.hash} node ${node.hash} match=${result.nodeMatch}${pin ? ` pin ${pin} match=${pinMatch}` : ''}, heroDoc ${[...heroDocs].join(' | ')}; pose: stance on ${result.pose.stanceOnFrames}/${result.pose.frames} frames (${JSON.stringify(result.pose.poses)}), max wristErr ${(result.pose.maxWristErr * 100).toFixed(2)} cm, ${result.pose.wristOver1cm.length} frames > 1 cm, stageClip on ${result.pose.stageClipFrames} frames`);
  return result;
}

try {
  await page.goto(`${server.url}?sw=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.getElementById('loader') || document.getElementById('loader')?.getAttribute('data-done') === '1', null, { timeout: 180_000 });
  await page.waitForFunction(() => !!document.querySelector('.menu-screen.live'), null, { timeout: 60_000 });
  mark('menuLive');
  await page.waitForTimeout(800);
  await tap('.menu-screen.live .menu-item[data-id=garage]');
  await page.waitForSelector('.garage-screen.live', { timeout: 30_000 });
  await page.evaluate(async () => { await (window as unknown as { __render: { whenReady(): Promise<void> } }).__render.whenReady(); });
  mark('garageLive');
  if (garageQuality) await page.evaluate(async (q) => { (window as unknown as { __trials: { setQuality(t: string): void } }).__trials.setQuality(q); await (window as unknown as { __render: { whenReady(): Promise<void> } }).__render.whenReady(); }, garageQuality);
  log['garageBoot'] = await page.evaluate(() => { const d = (window as unknown as { __render: { debugInfo(): Record<string, unknown> } }).__render.debugInfo(); return { heroDoc: d['heroDoc'], outfit: d['riderOutfit'], calls: d['calls'], tris: d['tris'], heroTris: d['heroTris'], garage: d['garage'], tier: d['tier'], profile: d['profile'], dpr: d['dpr'], canvas: `${String(d['canvasW'])}x${String(d['canvasH'])}` }; });
  await page.waitForTimeout(1000);
  // Every outfit; on each, Pro then Rookie so both liveries are seen under every outfit (15 swaps).
  for (const preset of AVAILABLE_RIDER_PRESETS) {
    await swapTo('outfit', preset.id);
    await swapTo('bike', 'pro');
    await swapTo('bike', 'rookie');
  }
  mark('garageDone');
  log['garageStats'] = await page.evaluate(() => { const d = (window as unknown as { __render: { debugInfo(): Record<string, unknown> } }).__render.debugInfo(); return { heroDoc: d['heroDoc'], outfit: d['riderOutfit'], calls: d['calls'], tris: d['tris'], heroTris: d['heroTris'], garage: d['garage'], tier: d['tier'], profile: d['profile'], dpr: d['dpr'], canvas: `${String(d['canvasW'])}x${String(d['canvasH'])}` }; });
  await tap('.garage-screen.live .backbtn');
  await page.waitForFunction(() => !!document.querySelector('.menu-screen.live'), null, { timeout: 20_000 });
  mark('backInMenu');
  await page.waitForTimeout(600);
  // The rides: the same page in harness mode (the harness owns the clock; every tick from the golden).
  await page.goto(`${server.url}?harness=1&sw=0&rider=gltf&bike=gltf&hz=120&physics=v2&outfit=${RIDES[0]!.outfit}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as unknown as { __trials?: { ready?: boolean } }).__trials?.ready === true, null, { timeout: 120_000 });
  mark('harnessReady');
  const rides: RideResult[] = [];
  for (const spec of RIDES) {
    rides.push(await ride(spec));
    mark(`ride.${spec.outfit}.${spec.bike}`);
    await page.waitForTimeout(500);
  }
  log['rides'] = rides;
} catch (error) {
  log['failure'] = error instanceof Error ? error.message : String(error);
  console.error(log['failure']);
} finally {
  log['marks'] = marks;
  log['swaps'] = swaps;
  log['flashes'] = swaps.flatMap((s) => s.flash.map((f) => `${s.kind} ${s.target}: ${f}`));
  log['errors'] = errors;
  const video = page.video();
  await page.close();
  await ctx.close();
  await browser.close();
  await server.close();
  const p = await video?.path();
  if (p) {
    const dst = path.join(out, 'clip.webm');
    fs.renameSync(p, dst);
    log['clip'] = dst;
    try {
      const ffmpeg = resolveFfmpeg();
      const mp4 = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', dst, '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(out, 'clip.mp4')], { encoding: 'utf8' });
      if (mp4.status === 0) log['mp4'] = path.join(out, 'clip.mp4');
      // Contact sheet: one frame every 2 s, 6 columns.
      const sheet = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', dst, '-vf', `fps=1/2,scale=${Math.round(W * 0.5)}:-2,tile=6x10:padding=3:margin=3:color=0x101418`, '-frames:v', '1', '-q:v', '3', path.join(out, 'sheet.jpg')], { encoding: 'utf8' });
      if (sheet.status === 0) log['sheet'] = path.join(out, 'sheet.jpg');
    } catch (e) { log['ffmpeg'] = e instanceof Error ? e.message : String(e); }
  }
  fs.writeFileSync(path.join(out, 'log.json'), JSON.stringify(log, null, 1));
  console.log(JSON.stringify({ marks, flashes: log['flashes'], errors, clip: log['clip'], mp4: log['mp4'], sheet: log['sheet'], failure: log['failure'] }, null, 1));
  const rides = (log['rides'] as RideResult[] | undefined) ?? [];
  if (log['failure'] || (log['flashes'] as string[]).length || errors.length || rides.some((r) => !r.nodeMatch || r.pinMatch === false)) process.exitCode = 1;
}
