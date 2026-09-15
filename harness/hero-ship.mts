import type { HeroHarnessWindow } from './hero-browser';
/** Round gate against a frozen build: real models, full production replay bytes, crash, restart. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { decodeJSON, iterateFrames } from '../src/core/replay';
import { encodeSnapshot } from '../src/game/hook';
import { createProductionSim } from './lib/production-sim';
import { startServer } from './lib/server';

const inputFile = process.argv[2] ?? 'harness/out/blender/fresh-play/b1-first-ride-rookie.rec.json';
const inputBytes = await readFile(inputFile), rec = decodeJSON(inputBytes.toString());
if (rec.header.physics !== 'v2' || rec.header.physicsHz !== 120) throw new Error('A V2/120Hz recording is required');
const sim = createProductionSim(rec.header.trackId, rec.header.bike ?? 'rookie', rec.header.seed, rec.header.physicsHz);
const frames = [...iterateFrames(rec)], expected: string[] = [];
for (const frame of frames) { sim.step(frame); const snap = sim.snap(); expected.push(encodeSnapshot(snap.physics, snap.counters)); }
if (!sim.game.cleared()) throw new Error('Input does not clear on the current source');
const server = await startServer({ freeze: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const bootAt = performance.now();
  await page.goto(`${server.url}?harness=1&physics=v2&hz=120&outfit=street`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__trials?.ready);
  await page.evaluate(async header => {
    const t = window.__trials!; t.setBike!(header.bike ?? 'rookie');
    if (!await t.loadTrack(header.trackId, header.seed)) throw new Error('Track failed to load');
    t.skipCountdown(); await (window as unknown as HeroHarnessWindow).__render.whenReady(); t.render(true);
    const info = t.info(), r = (window as unknown as HeroHarnessWindow).__render.debug;
    if (info.physicsHz !== header.physicsHz || info.modules?.physics !== 'createBikePhysicsV2' || info.bike !== (header.bike ?? 'rookie') || info.seed !== header.seed) throw new Error('Replay metadata mismatch');
    if (!r.rider.source?.scene || !r.bike.source?.scene) throw new Error('Procedural model fallback');
  }, rec.header);
  const coldBootMs = performance.now() - bootAt;
  // Compare every tick, including complete Game counters. No old expected golden is repinned.
  let mismatchedTick: number | null = null;
  for (let start = 0; start < frames.length; start += 600) {
    const states = await page.evaluate(batch => {
      const t = window.__trials!;
      return batch.map(frame => { t.setInput(frame); t.step(1); return t.snapshot(); });
    }, frames.slice(start, start + 600));
    for (let i = 0; i < states.length; i++) if (states[i] !== expected[start + i] && mismatchedTick === null) mismatchedTick = start + i + 1;
  }
  const clear = await page.evaluate(() => ({ cleared: window.__trials!.cleared(), time: window.__trials!.runTime(), faults: window.__trials!.faults() }));
  if (!clear.cleared || mismatchedTick !== null) throw new Error(`Production replay disagreement at ${mismatchedTick}, clear=${clear.cleared}`);
  const restart = await page.evaluate(async () => {
    const t = window.__trials!; t.setBike!('rookie'); await t.loadTrack('flat-test', 1); t.skipCountdown();
    t.setInput({ throttle: 1, lean: -1 });
    let crashTick = 0;
    while (t.phase() !== 'crashed' && crashTick < 1200) { t.step(1); crashTick++; }
    if (t.phase() !== 'crashed') throw new Error('Crash probe did not crash');
    t.render(true);
    const faults = t.faults(), start = performance.now();
    t.setInput({ restart: true }); t.step(1);
    const commandMs = performance.now() - start, state = t.getState(), phase = t.phase();
    t.render(true);
    const frameMs = performance.now() - start;
    t.setInput({ restart: false, throttle: 1, lean: 0 });
    let movesAfterTicks = 0;
    while (t.getState().bike.vel.x <= 0 && movesAfterTicks < 120) { t.step(1); movesAfterTicks++; }
    return { crashTick, crashToRestartTicks: 1, restartStateTick: state.tick, restartPhase: phase, faultsBefore: faults, faultsAfter: t.faults(),
      commandMs, frameMs, movesAfterTicks, heroDoc: (window as unknown as HeroHarnessWindow).__render.debugInfo().heroDoc };
  });
  const pass = restart.restartStateTick === 0 && restart.restartPhase === 'riding' && restart.faultsAfter === restart.faultsBefore
    && restart.movesAfterTicks <= 30 && restart.commandMs < 16.7 && errors.length === 0;
  const output = 'harness/out/blender/resume-ship'; await mkdir(output, { recursive: true });
  const report = { pass, browser: browser.version(), renderer: await page.evaluate(() => window.__trials!.stats().renderer),
    inputFile, inputSha256: createHash('sha256').update(inputBytes).digest('hex'), inputTicks: frames.length, mismatchedTick, coldBootMs,
    clear, restart, errors, note: 'Headless Chromium/SwiftShader; GPU wall time is not actual phone performance. Played capture is a separate artifact.' };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
  if (!pass) throw new Error('Round boot/clear/crash/restart gate failed; inspect report');
} finally { await browser.close(); await server.close(); }
