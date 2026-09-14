/**
 * Ship gate (CONTRACT §3, harness-metrics.md §5). One command, one JSON,
 * exit code = number of failed checks.
 *
 *   pnpm harness:gate [--track flat-test] [--build] [--dev] [--heap-seconds 60] [--quick] [--pin]
 *
 *   G1 cold boot        3 fresh contexts: nav -> __trials.ready p50; ready -> first synced frame
 *   G2 clear a track    golden replay (inputs/<track>/bot-oracle.json): finishTime bit-equal + hash vs expected.json
 *   G3 crash            inputs/<track>/crash.json: a non-restart fault within crash.faultWithinS
 *   G4 fault -> control after the crash: throttle until the bike moves again (ms)
 *   G5 restart latency  20 reps: restart edge -> tick 0 after exactly one tick; -> synced frame ms
 *   G6 no countdown     throttle held from the first tick after restart rolls the bike within restart.movesWithinTicks
 *                       (the clutch model needs a few ticks from idle; a countdown would hold it 360+)
 *   G7 heap + perf      N s of play: heap growth, draw calls, tris, textures, physics us/tick, render submit ms
 *   G8 bundle           gzip of dist/assets/*.js
 *   G9 determinism      gate/determinism.ts on the golden recording
 *   G10 stranger        out/metrics/{b1,b2,b3,e1}.stranger.json: median attempts of completed sessions on the
 *                       working tree's src fingerprint vs 1.5 x meta.attemptsBand[1]. Informational until all
 *                       four tracks have >= 2 such sessions (stranger.minSessions); then a real check.
 *
 * Every threshold lives in gate/thresholds.json. Output harness/out/metrics/ship-gate.json.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { expandFrames, type InputRecording } from '../../src/core/replay';
import type { FaultReason } from '../../src/core/types';
import { flagBool, flagNum, flagStr, parseArgs } from '../lib/args';
import { openGame, readHeap } from '../lib/hook';
import { pickGolden } from '../lib/golden';
import { percentileOf, runMeta, srcFingerprint } from '../lib/metrics';
import { DIST_DIR, HARNESS_DIR, REPO_ROOT } from '../lib/paths';
import { loadRecording } from '../lib/recording';
import { writeJson } from '../lib/report';
import type { DeterminismReport, GateCheck, GateReport, GateReflexRow, GateStrangerRow, ReflexTrackMetrics } from '../lib/schema';
import { createSim } from '../lib/sim';
import { synthesizeRecording } from '../lib/synth';
import { BrowserVerifier } from '../lib/verify';
import { loadExpected, runDeterminism, saveExpected } from './determinism';

export const THRESHOLDS_FILE = path.join(HARNESS_DIR, 'gate', 'thresholds.json');
export type Thresholds = Record<string, number | boolean | string>;

/** Ship targets + the SwiftShader overrides (applied when the renderer string says SwiftShader). */
export function loadThresholds(): { ship: Thresholds; swiftshader: Record<string, number> } {
  const raw = JSON.parse(fs.readFileSync(THRESHOLDS_FILE, 'utf8')) as Record<string, unknown>;
  const swiftshader = (raw.swiftshader as Record<string, number> | undefined) ?? {};
  const ship: Thresholds = {};
  for (const [k, v] of Object.entries(raw)) if (k !== '$comment' && k !== 'swiftshader') ship[k] = v as number | boolean | string;
  return { ship, swiftshader };
}

/**
 * G10 second row: the reflex bot (harness/reflex, a real-time controller with human limits) at `average`
 * on the same four tracks — median attempts over the seeds recorded on the working tree's src fingerprint.
 * Informational until every track has >= minSeeds such seeds; then all four within factor x band top and cleared.
 */
export function reflexRows(tracks: readonly string[], factor: number, skill: 'novice' | 'average' | 'good' = 'average'): GateReflexRow[] {
  const fp = srcFingerprint();
  const rows: GateReflexRow[] = [];
  for (const trackId of tracks) {
    const file = path.join(HARNESS_DIR, 'out', 'metrics', `${trackId}.reflex.json`);
    if (!fs.existsSync(file)) continue;
    const m = JSON.parse(fs.readFileSync(file, 'utf8')) as ReflexTrackMetrics;
    const row = m.bySkill.find((r) => r.skill === skill);
    const fresh = m.srcFingerprint === fp && row ? row : null;
    const band = m.attemptsBand ?? null;
    const limit = band ? factor * band[1] : null;
    rows.push({
      trackId,
      skill,
      attemptsBand: band,
      limit,
      srcFingerprint: m.srcFingerprint,
      seedsFresh: fresh ? fresh.seeds.length : 0,
      medianAttempts: fresh ? fresh.medianAttempts : null,
      medianFinishTime: fresh ? fresh.medianFinishTime : null,
      allCleared: fresh ? fresh.clears === fresh.seeds.length : false,
      pass: fresh && limit !== null ? fresh.medianAttempts <= limit && fresh.clears === fresh.seeds.length : null,
      deadliest: fresh?.deaths[0] ? `${fresh.deaths[0].obstacle} ×${fresh.deaths[0].count}` : null,
    });
  }
  return rows;
}

/** The tracks a stranger round judges (harness-metrics.md §3). */
export const STRANGER_TRACKS = ['b1-first-ride', 'b2-lean-back', 'b3-kicker-row', 'e1-uphill-weight'] as const;

/**
 * One row per stranger metrics file: median attempts over the sessions completed on the
 * working tree's src fingerprint (the file's own medians may be from an older run of `report`).
 */
export function strangerRows(tracks: readonly string[], factor: number): GateStrangerRow[] {
  const fp = srcFingerprint();
  const rows: GateStrangerRow[] = [];
  for (const trackId of tracks) {
    const file = path.join(HARNESS_DIR, 'out', 'metrics', `${trackId}.stranger.json`);
    if (!fs.existsSync(file)) continue;
    const m = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      attemptsBand?: [number, number] | null;
      sessions: Array<{ sessionId: string; status: string; srcFingerprint: string | null; strangerAttempts: number; cleared: boolean }>;
    };
    const fresh = m.sessions.filter((x) => x.status === 'done' && x.srcFingerprint === fp);
    const attempts = fresh.map((x) => x.strangerAttempts).sort((a, b) => a - b);
    const median = attempts.length ? (attempts.length % 2 ? attempts[(attempts.length - 1) / 2]! : (attempts[attempts.length / 2 - 1]! + attempts[attempts.length / 2]!) / 2) : null;
    const band = m.attemptsBand ?? null;
    const limit = band ? factor * band[1] : null;
    rows.push({
      trackId,
      attemptsBand: band,
      limit,
      completedFresh: fresh.length,
      completedAny: m.sessions.filter((x) => x.status === 'done').length,
      medianAttempts: median,
      allCleared: fresh.length > 0 && fresh.every((x) => x.cleared),
      pass: median === null || limit === null ? null : median <= limit && fresh.every((x) => x.cleared),
      sessions: fresh.map((x) => x.sessionId),
    });
  }
  return rows;
}

function dirBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirBytes(p) : fs.statSync(p).size;
  }
  return total;
}

function jsGzipBytes(dir: string): number {
  const assets = path.join(dir, 'assets');
  if (!fs.existsSync(assets)) return 0;
  let total = 0;
  for (const f of fs.readdirSync(assets)) if (f.endsWith('.js')) total += gzipSync(fs.readFileSync(path.join(assets, f))).length;
  return total;
}

/** Cold-boot samples: `runs` fresh contexts, nav -> ready ms and ready -> first synced frame ms. */
async function bootSamples(launched: Awaited<ReturnType<BrowserVerifier['open']>>['launched'], url: string, runs: number): Promise<{ bootRuns: number[]; firstFrameMs: number[] }> {
  const bootRuns: number[] = [];
  const firstFrameMs: number[] = [];
  for (let i = 0; i < runs; i++) {
    const ctx = await launched.browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const timing = await openGame(page, url);
    bootRuns.push(timing.bootMs);
    firstFrameMs.push(await page.evaluate(() => window.__trials!.render(true)));
    await ctx.close();
  }
  return { bootRuns, firstFrameMs };
}

async function main(): Promise<void> {
  const { flags } = parseArgs();
  const started = new Date();
  const trackId = flagStr(flags, 'track', 'flat-test');
  const quick = flagBool(flags, 'quick');
  const heapSeconds = flagNum(flags, 'heap-seconds', quick ? 10 : 60);
  const thAll = loadThresholds();
  const th = thAll.ship;
  let softwareGL = false; // set once the browser is up
  /** Effective limit: the SwiftShader override when running on SwiftShader, else the ship target. */
  const num = (k: string): number => (softwareGL && k in thAll.swiftshader ? thAll.swiftshader[k]! : Number(th[k]));
  const checks: GateCheck[] = [];
  const check = (c: GateCheck): void => {
    const shipLimit = Number(th[c.id]);
    if (softwareGL && c.id in thAll.swiftshader && typeof c.value === 'number') {
      c.shipLimit = shipLimit;
      c.shipPass = c.value <= shipLimit;
      c.note = `${c.note ? `${c.note}; ` : ''}SwiftShader limit; ship target ${shipLimit}${c.unit ?? ''} ${c.shipPass ? 'met' : 'NOT met (informational on this machine)'}`;
    }
    checks.push(c);
    const v = typeof c.value === 'number' ? (Number.isInteger(c.value) ? String(c.value) : c.value.toFixed(2)) : String(c.value);
    console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.id.padEnd(28)} ${v}${c.unit ?? ''}  (limit ${c.limit === null ? 'n/a' : String(c.limit)}${c.unit ?? ''})${c.note ? `  ${c.note}` : ''}`);
  };

  // G0 build
  const t0 = performance.now();
  const indexPath = path.join(DIST_DIR, 'index.html');
  let buildMs = 0;
  if (flagBool(flags, 'build') || !fs.existsSync(indexPath)) {
    try {
      await build({ root: REPO_ROOT, configFile: path.join(REPO_ROOT, 'vite.config.ts'), logLevel: 'error' });
    } catch (err) {
      console.error(`build failed (${err instanceof Error ? err.message.split('\n')[0] : String(err)}); using existing dist if present`);
    }
    buildMs = performance.now() - t0;
  }
  const distBytes = dirBytes(DIST_DIR);
  const gz = jsGzipBytes(DIST_DIR);

  const physicsName = (await createSim(trackId)).physicsName;
  console.log(`gate ${trackId}: physics=${physicsName} thresholds=${path.relative(REPO_ROOT, THRESHOLDS_FILE)}`);
  const verifier = new BrowserVerifier({ dev: flagBool(flags, 'dev'), verbose: flagBool(flags, 'verbose') });
  const report: Partial<GateReport> = {};
  try {
    const { server, launched } = await verifier.open();
    softwareGL = /swiftshader|llvmpipe|software/i.test(launched.probe.renderer);
    console.log(`renderer: ${launched.probe.renderer} -> ${softwareGL ? 'SwiftShader limits apply for ' + Object.keys(thAll.swiftshader).join(', ') : 'ship limits'}`);

    // G1 cold boot: 5 fresh contexts (3 with --quick). The check is on p50, the min is
    // reported beside it. A p50 miss while the machine is loaded (1-min loadavg > cores)
    // is re-sampled once and the better batch kept: contention is not a boot regression.
    const bootRunsN = quick ? 3 : 5;
    const cores = os.cpus().length;
    const load1 = (): number => Math.round((os.loadavg()[0] ?? 0) * 100) / 100;
    let { bootRuns, firstFrameMs } = await bootSamples(launched, server.url, bootRunsN);
    let bootP50 = percentileOf(bootRuns, 50);
    let bootRetried = false;
    if (bootP50 > num('boot.readyP50Ms') && load1() > cores) {
      console.log(`      boot p50 ${bootP50.toFixed(0)} ms over limit with loadavg ${load1()} > ${cores} cores: re-sampling ${bootRunsN} runs`);
      const again = await bootSamples(launched, server.url, bootRunsN);
      const p50Again = percentileOf(again.bootRuns, 50);
      bootRetried = true;
      if (p50Again < bootP50) {
        ({ bootRuns, firstFrameMs } = again);
        bootP50 = p50Again;
      }
    }
    const bootMin = Math.min(...bootRuns);
    report.boot = { runs: bootRuns, p50: bootP50, min: bootMin, max: Math.max(...bootRuns), firstFrameMs, loadavg1: load1(), cores, retried: bootRetried };
    check({ id: 'boot.readyP50Ms', value: bootP50, limit: num('boot.readyP50Ms'), pass: bootP50 <= num('boot.readyP50Ms'), unit: 'ms', note: `runs ${bootRuns.map((b) => b.toFixed(0)).join('/')} min ${bootMin.toFixed(0)} loadavg ${load1()}/${cores}${bootRetried ? ' re-sampled under load' : ''}` });
    const ff = percentileOf(firstFrameMs, 50);
    check({ id: 'boot.firstFrameMs', value: ff, limit: num('boot.firstFrameMs'), pass: ff <= num('boot.firstFrameMs'), unit: 'ms', note: 'ready -> first synced frame' });

    // G2 clear a track by golden replay
    const goldenFile = pickGolden(trackId, (l) => console.log(`      ${l}`));
    let golden: InputRecording | null = null;
    let goldenHash: string | null = null;
    report.clear = { recording: goldenFile, finishTime: null, expected: null, hash: null, expectedHash: null, faults: 0, hashOk: null };
    if (!goldenFile) {
      check({ id: 'clear.golden', value: false, limit: true, pass: false, note: `no golden recording under harness/inputs/${trackId}/ — run pnpm harness:bot ${trackId} --oracle` });
    } else {
      golden = loadRecording(goldenFile);
      const r = await verifier.run(golden);
      goldenHash = r.hash;
      const expected = loadExpected();
      const entry = (expected[trackId] ??= {});
      const finishRun = r.finishTime === null ? null : r.runTime;
      if (!entry.golden || flagBool(flags, 'pin') || entry.golden.file !== path.basename(goldenFile) || entry.golden.physics !== physicsName) {
        entry.golden = { file: path.basename(goldenFile), finishTime: r.finishTime, hash: r.hash, ticks: r.state.tick, physics: physicsName };
        saveExpected(expected);
      }
      report.clear = { recording: goldenFile, finishTime: r.finishTime, expected: entry.golden.finishTime, hash: r.hash, expectedHash: entry.golden.hash, faults: r.faults, hashOk: r.hash === entry.golden.hash };
      const cleared = r.finishTime !== null && r.faults === 0;
      check({ id: 'clear.golden', value: cleared, limit: true, pass: cleared, note: `${path.basename(goldenFile)} finish=${r.finishTime} run=${finishRun?.toFixed(3)} faults=${r.faults}` });
      check({ id: 'clear.finishTimeBitEqual', value: r.finishTime === entry.golden.finishTime, limit: true, pass: r.finishTime === entry.golden.finishTime, note: `expected ${entry.golden.finishTime}` });
      check({ id: 'clear.hashOk', value: r.hash === entry.golden.hash, limit: true, pass: r.hash === entry.golden.hash, note: `${r.hash} vs pinned ${entry.golden.hash}` });
    }

    // G3 crash + G4 fault -> control
    const crashFile = path.join(HARNESS_DIR, 'inputs', trackId, 'crash.json');
    report.crash = { recording: fs.existsSync(crashFile) ? crashFile : null, faultTick: null, faultTime: null, reason: null };
    report.fault = { toControlTicks: null, toControlMs: null, autoRespawnTicks: null, autoRespawnMs: null };
    if (!fs.existsSync(crashFile)) {
      check({ id: 'crash.faultWithinS', value: null, limit: num('crash.faultWithinS'), pass: false, unit: 's', note: `no ${path.relative(REPO_ROOT, crashFile)} — run pnpm harness:bot ${trackId} --crash-probe (the mock never crashes)` });
      check({ id: 'fault.toControlMs', value: null, limit: num('fault.toControlMs'), pass: false, unit: 'ms', note: 'needs a crash' });
    } else {
      const crash = loadRecording(crashFile);
      const page = await launched.context.newPage();
      await openGame(page, server.url);
      const crashFrames = expandFrames(crash);
      const r = await page.evaluate(
        ([fr, id, seed, hz]) => {
          const t = window.__trials!;
          const res: {
            faultTick: number | null;
            faultTime: number | null;
            reason: string | null;
            faultAtFrame: number;
            manualTicks: number | null;
            autoTicks: number | null;
          } = { faultTick: null, faultTime: null, reason: null, faultAtFrame: -1, manualTicks: null, autoTicks: null };
          // Pass 0: manual restart mash on the tick after the crash. Pass 1: no input, the
          // game's auto-respawn. (No inner functions here: tsx's keepNames helper breaks evaluate.)
          for (let pass = 0; pass < 2; pass++) {
            t.loadTrack(id, seed);
            t.skipCountdown();
            t.drainEvents();
            let hit = false;
            for (let i = 0; i < fr.length && !hit; i++) {
              t.setInput(fr[i]!);
              t.step(1);
              const ev = t.drainEvents();
              for (const e of ev) {
                if (e.type === 'fault' && e.reason !== 'restart') {
                  res.faultTick = e.tick;
                  res.faultTime = e.time;
                  res.reason = e.reason;
                  res.faultAtFrame = i;
                  hit = true;
                  break;
                }
              }
            }
            if (!hit) return res;
            let ticks = 0;
            if (pass === 0) {
              t.setInput({ restart: true });
              t.step(1);
              ticks++;
            }
            t.setInput({ restart: false, throttle: 1 });
            for (let i = 0; i < 3 * hz; i++) {
              t.step(1);
              ticks++;
              const s = t.getState();
              if (t.phase() === 'riding' && s.bike.vel.x > 0.05) {
                if (pass === 0) res.manualTicks = ticks;
                else res.autoTicks = ticks;
                break;
              }
            }
          }
          return res;
        },
        [crashFrames, crash.header.trackId, crash.header.seed, crash.header.physicsHz] as const,
      );
      await page.close();
      report.crash = { recording: crashFile, faultTick: r.faultTick, faultTime: r.faultTime, reason: r.reason as FaultReason | null };
      const within = r.faultTime !== null && r.faultTime <= num('crash.faultWithinS');
      check({ id: 'crash.faultWithinS', value: r.faultTime, limit: num('crash.faultWithinS'), pass: within, unit: 's', note: `reason=${r.reason}` });
      const hzc = crash.header.physicsHz;
      const manualMs = r.manualTicks === null ? null : (r.manualTicks * 1000) / hzc;
      const autoMs = r.autoTicks === null ? null : (r.autoTicks * 1000) / hzc;
      report.fault = { toControlTicks: r.manualTicks, toControlMs: manualMs, autoRespawnTicks: r.autoTicks, autoRespawnMs: autoMs };
      check({ id: 'fault.toControlMs', value: manualMs, limit: num('fault.toControlMs'), pass: manualMs !== null && manualMs <= num('fault.toControlMs'), unit: 'ms', note: `crash tick -> restart mash on the next tick -> bike moving; auto-respawn path ${autoMs === null ? 'never' : autoMs.toFixed(0) + ' ms'} (CONTRACT §2.8: 1.0 s)` });
    }

    // G5 restart latency + G6 no countdown
    {
      const page = await launched.context.newPage();
      await openGame(page, server.url);
      const r = await page.evaluate(
        ([id]) => {
          const t = window.__trials!;
          t.loadTrack(id);
          t.skipCountdown();
          t.setInput({ throttle: 1 });
          t.step(360);
          t.render(true); // warm
          const wallMs: number[] = [];
          const frameMs: number[] = [];
          let ticksOk = true;
          let movesOnFirstTick = true;
          // Ticks of held throttle after the restart tick until the bike rolls (vel.x > 0). A
          // countdown would hold it for 360+; the clutch model needs a few ticks from idle.
          let movesAfterTicks = 0;
          for (let rep = 0; rep < 20; rep++) {
            t.setInput({ throttle: 1 });
            t.step(120);
            const a = performance.now();
            t.setInput({ restart: true });
            t.step(1);
            t.setInput({ restart: false });
            const b = performance.now();
            const st = t.getState();
            if (st.tick !== 0 || st.faulted !== null) ticksOk = false;
            t.render(true);
            const c = performance.now();
            wallMs.push(b - a);
            frameMs.push(c - a);
            t.setInput({ throttle: 1 });
            t.step(1);
            if (!(t.getState().bike.vel.x > 0)) movesOnFirstTick = false;
            let n = 1;
            while (!(t.getState().bike.vel.x > 0) && n < 120) {
              t.step(1);
              n++;
            }
            if (n > movesAfterTicks) movesAfterTicks = n;
          }
          return { wallMs, frameMs, ticksOk, movesOnFirstTick, movesAfterTicks, phase: t.phase(), faults: t.faults() };
        },
        [trackId] as const,
      );
      await page.close();
      const movesOk = r.movesAfterTicks <= num('restart.movesWithinTicks');
      report.restart = { ticks: r.ticksOk ? 1 : null, wallMs: r.wallMs, frameMs: r.frameMs, noCountdown: movesOk, movesOnFirstTick: r.movesOnFirstTick, movesAfterTicks: r.movesAfterTicks };
      check({ id: 'restart.ticks', value: r.ticksOk ? 1 : -1, limit: num('restart.ticks'), pass: r.ticksOk, note: 'tick==0 && faulted==null after exactly one tick, 20 reps' });
      const w95 = percentileOf(r.wallMs, 95);
      check({ id: 'restart.wallMsP95', value: w95, limit: num('restart.wallMsP95'), pass: w95 <= num('restart.wallMsP95'), unit: 'ms' });
      const f95 = percentileOf(r.frameMs, 95);
      check({ id: 'restart.frameMsP95', value: f95, limit: num('restart.frameMsP95'), pass: f95 <= num('restart.frameMsP95'), unit: 'ms', note: 'restart -> synced frame' });
      check({ id: 'restart.noCountdown', value: r.movesAfterTicks, limit: num('restart.movesWithinTicks'), pass: movesOk, unit: ' ticks', note: `worst of 20 reps: held throttle after the restart tick until the bike rolls (a countdown would be 360+); first-tick roll ${r.movesOnFirstTick ? 'yes' : 'no'}; game faults=${r.faults}` });
    }

    // G7 heap + perf over N seconds of play
    {
      const page = await launched.context.newPage();
      await openGame(page, server.url);
      const fps = 60;
      const hz = 120;
      const tpf = hz / fps;
      const rec = synthesizeRecording({ trackId, seed: 1, physicsHz: hz, seconds: heapSeconds, style: 'wiggle' });
      const frames = expandFrames(rec);
      await page.evaluate(([id]) => {
        const t = window.__trials!;
        t.loadTrack(id);
        t.resize(640, 360); // heap/perf counters do not depend on the viewport; SwiftShader raster cost does
        for (let i = 0; i < 5; i++) t.render(true);
      }, [trackId] as const);
      const heapBefore = await readHeap(page);
      const physicsMs: number[] = [];
      const submitMs: number[] = [];
      const syncedMs: number[] = [];
      for (let s = 0; s < heapSeconds; s++) {
        const slice = frames.slice(s * hz, (s + 1) * hz);
        const r = await page.evaluate(
          ([ins, n, sync]) => {
            const t = window.__trials!;
            const pm: number[] = [];
            const sm: number[] = [];
            const ym: number[] = [];
            for (let i = 0; i < ins.length; i += n) {
              const p0 = performance.now();
              for (let j = i; j < i + n && j < ins.length; j++) {
                t.setInput(ins[j]!);
                t.step(1);
              }
              pm.push(performance.now() - p0);
              sm.push(t.render(false));
              if (i === 0 && sync) ym.push(t.render(true));
            }
            // Keep the run going: if it finished or faulted, restart in-band.
            const st = t.getState();
            if (st.finished) {
              t.setInput({ restart: true });
              t.step(1);
              t.setInput({ restart: false });
            }
            return { pm, sm, ym };
          },
          [slice, tpf, s % 10 === 0] as const,
        );
        physicsMs.push(...r.pm);
        submitMs.push(...r.sm);
        syncedMs.push(...r.ym);
      }
      const heapAfter = await readHeap(page);
      const stats = await page.evaluate(() => window.__trials!.stats());
      await page.close();
      const growthMB = (heapAfter.jsHeapUsed - heapBefore.jsHeapUsed) / (1024 * 1024);
      report.heap = { beforeMB: heapBefore.jsHeapUsed / 1048576, afterMB: heapAfter.jsHeapUsed / 1048576, growthMB, seconds: heapSeconds };
      const physUs = physicsMs.map((m) => (m * 1000) / tpf);
      report.perf = {
        drawCalls: stats.calls,
        triangles: stats.triangles,
        texturesMB: stats.texturesMB,
        physicsUsPerTickP95: percentileOf(physUs, 95),
        renderSubmitMsP95: percentileOf(submitMs, 95),
        renderSyncedMsP95: percentileOf(syncedMs, 95),
      };
      const limitGrowth = num('heap.growthMBPer60s');
      check({ id: 'heap.growthMBPer60s', value: growthMB, limit: limitGrowth, pass: growthMB <= limitGrowth, unit: 'MB', note: `over ${heapSeconds}s of play${heapSeconds < 60 ? ' (--quick: shorter than the 60 s the threshold is written for)' : ''}` });
      check({ id: 'perf.drawCallsMax', value: stats.calls, limit: num('perf.drawCallsMax'), pass: stats.calls <= num('perf.drawCallsMax') });
      check({ id: 'perf.trianglesMax', value: stats.triangles, limit: num('perf.trianglesMax'), pass: stats.triangles <= num('perf.trianglesMax') });
      check({ id: 'perf.texturesMBMax', value: stats.texturesMB, limit: num('perf.texturesMBMax'), pass: stats.texturesMB <= num('perf.texturesMBMax'), unit: 'MB' });
      check({ id: 'perf.physicsUsPerTickP95', value: report.perf.physicsUsPerTickP95, limit: num('perf.physicsUsPerTickP95'), pass: report.perf.physicsUsPerTickP95 <= num('perf.physicsUsPerTickP95'), unit: 'us' });
      check({ id: 'perf.renderSubmitMsP95', value: report.perf.renderSubmitMsP95, limit: num('perf.renderSubmitMsP95'), pass: report.perf.renderSubmitMsP95 <= num('perf.renderSubmitMsP95'), unit: 'ms' });
      check({ id: 'perf.renderSyncedMsP95', value: report.perf.renderSyncedMsP95, limit: num('perf.renderSyncedMsP95'), pass: report.perf.renderSyncedMsP95 <= num('perf.renderSyncedMsP95'), unit: 'ms', note: 'render + readPixels sync' });
    }

    // G8 bundle
    const gzKB = gz / 1024;
    check({ id: 'bundle.jsGzipKB', value: gzKB, limit: num('bundle.jsGzipKB'), pass: gz > 0 && gzKB <= num('bundle.jsGzipKB'), unit: 'KB', note: `dist ${(distBytes / 1024).toFixed(0)} KB raw` });

    // G9 determinism on the golden recording
    let det: DeterminismReport | null = null;
    if (golden && goldenFile) {
      det = await runDeterminism(golden, goldenFile, { loads: 2, pin: flagBool(flags, 'pin'), verifier, log: (l) => console.log(`      ${l}`) });
      check({ id: 'determinism.pass', value: det.pass, limit: true, pass: det.pass, note: `${det.checks.filter((c) => c.pass).length}/${det.checks.length} checks` });
    } else {
      check({ id: 'determinism.pass', value: null, limit: true, pass: false, note: 'no golden recording' });
    }

    // G10 stranger: the four judged tracks, on the physics in the working tree right now.
    const stranger = strangerRows(STRANGER_TRACKS, num('stranger.attemptsBandFactor'));
    const minSessions = num('stranger.minSessions') || 2;
    const armed = stranger.length === STRANGER_TRACKS.length && stranger.every((r) => r.completedFresh >= minSessions);
    const allPass = stranger.every((r) => r.pass === true);
    const summary = stranger.map((r) => `${r.trackId.split('-')[0]} ${r.medianAttempts ?? '-'}/${r.limit ?? '-'}${r.completedFresh < minSessions ? ` (${r.completedFresh} fresh)` : ''}`).join(' · ');
    check({
      id: 'stranger.medianAttempts',
      value: summary || 'no stranger metrics',
      limit: num('stranger.attemptsBandFactor'),
      pass: armed ? allPass : true,
      note: `median attempts / (${num('stranger.attemptsBandFactor')} x band top) on src ${srcFingerprint()}; ${armed ? `armed: ${allPass ? 'all four within band' : 'outside band'}` : `informational until every track has >= ${minSessions} completed sessions on this src`}`,
    });
    report.stranger = { srcFingerprint: srcFingerprint(), armed, minSessions, rows: stranger };

    // G10, second row: the reflex bot (average) on the same tracks, seeds recorded on this src.
    const reflex = reflexRows(STRANGER_TRACKS, num('reflex.attemptsBandFactor') || 1.5);
    const minSeeds = num('reflex.minSeeds') || 3;
    const reflexArmed = reflex.length === STRANGER_TRACKS.length && reflex.every((r) => r.seedsFresh >= minSeeds);
    const reflexPass = reflex.every((r) => r.pass === true);
    const reflexSummary = reflex.map((r) => `${r.trackId.split('-')[0]} ${r.medianAttempts ?? '-'}/${r.limit ?? '-'}${r.seedsFresh < minSeeds ? ` (${r.seedsFresh} fresh)` : ''}`).join(' · ');
    check({
      id: 'reflex.medianAttempts',
      value: reflexSummary || 'no reflex metrics',
      limit: num('reflex.attemptsBandFactor') || 1.5,
      pass: reflexArmed ? reflexPass : true,
      note: `reflex bot (average) median attempts / (${num('reflex.attemptsBandFactor') || 1.5} x band top) on src ${srcFingerprint()}; ${reflexArmed ? `armed: ${reflexPass ? 'all four within band' : 'outside band'}` : `informational until every track has >= ${minSeeds} seeds on this src (pnpm harness:reflex --all-tracks --seeds 3)`}`,
    });
    report.reflex = { srcFingerprint: srcFingerprint(), armed: reflexArmed, minSeeds, rows: reflex };

    const failed = checks.filter((c) => !c.pass).length;
    const full: GateReport = {
      ...runMeta('gate', started, { chromium: launched.browser.version() }),
      kind: 'gate',
      trackId,
      thresholdsFile: path.relative(REPO_ROOT, THRESHOLDS_FILE),
      softwareGL,
      build: { distBytes, jsGzipBytes: gz, buildMs },
      browser: { version: launched.browser.version(), renderer: launched.probe.renderer, flagSet: launched.flagSet },
      checks,
      failed,
      pass: failed === 0,
      boot: report.boot!,
      clear: report.clear!,
      crash: report.crash!,
      restart: report.restart!,
      fault: report.fault!,
      heap: report.heap!,
      perf: report.perf!,
      determinism: det,
      stranger: report.stranger!,
      reflex: report.reflex!,
    };
    if (goldenHash) full.clear.hash = goldenHash;
    const out = path.join(HARNESS_DIR, 'out', 'metrics', 'ship-gate.json');
    writeJson(out, full);
    console.log(`\n${failed === 0 ? 'SHIP' : 'NO-SHIP'}: ${checks.length - failed}/${checks.length} checks pass, track=${trackId}, physics=${physicsName}, wall=${(full.wallMs / 1000).toFixed(0)}s`);
    console.log(`report: ${out}`);
    process.exitCode = failed;
  } finally {
    await verifier.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
