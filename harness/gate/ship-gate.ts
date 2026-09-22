/**
 * Ship gate (CONTRACT §3, harness-metrics.md §5). One command, one JSON,
 * exit code = number of failed checks.
 *
 *   pnpm harness:gate [--track flat-test] [--build] [--dev] [--heap-seconds 60] [--quick] [--pin]
 *   pnpm harness:gate --only=camera[,clear,...]   one or more sections alone (a row's re-proof); PARTIAL verdict, ship-gate.partial.json
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
 *   G11 device + hero   gate/device-rows.ts: the newest docs/device report (fps on low at cap 60, thermal fall-off,
 *                       high worst ms — informational until device.minReports reports) and the newest WebKit hero
 *                       run (rider drift <= hero.driftMaxMm, a real check when a run exists). Rider on Glass G5.
 *
 * Every threshold lives in gate/thresholds.json. Output harness/out/metrics/ship-gate.json.
 *
 * Wall-clock (round 12). The checks do not share a page, so they run as sections on one Chromium (one context per
 * page): the correctness sections (clear, Pro clears, crash/fault, determinism D1-D8, the camera-box clip child)
 * on a pool of `--jobs` (default (cores - 2) / 3: a SwiftShader page is ~3 cores), and the timing sections (boot, restart, heap/perf) as one serial
 * chain next to them — their notes carry the loadavg; `--quiet-timing` runs that chain after the pool instead.
 * Lines print as sections finish; the report (JSON + the summary block) keeps the G1..G10 order.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { expandFrames, type InputRecording } from '../../src/core/replay';
import { DEFAULT_BIKE, type BikeClass, type FaultReason } from '../../src/core/types';
import { flagBool, flagNum, flagStr, parseArgs } from '../lib/args';
import { closeIsolated, isolatedPage } from '../lib/browser';
import { openGame, readHeap } from '../lib/hook';
import { chooseGolden, pickGolden } from '../lib/golden';
import { gitHead, percentileOf, runMeta, srcFingerprint, fingerprintMatches } from '../lib/metrics';
import { DIST_DIR, HARNESS_DIR, REPO_ROOT } from '../lib/paths';
import { defaultBrowserJobs, loadLine, mapPool } from '../lib/pool';
import { loadRecording } from '../lib/recording';
import { writeJson } from '../lib/report';
import type { DeterminismReport, GateCheck, GateReport, GateReflexRow, GateStrangerRow, ReflexTrackMetrics } from '../lib/schema';
import { createSim } from '../lib/sim';
import { synthesizeRecording } from '../lib/synth';
import { BrowserVerifier } from '../lib/verify';
import { expectedKey, loadExpected, runDeterminism, saveExpected } from './determinism';
import { deviceChecks } from './device-rows';

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
export function reflexRows(tracks: readonly string[], factor: number, skill: 'novice' | 'average' | 'good' = 'average', bike: BikeClass = DEFAULT_BIKE): GateReflexRow[] {
  const fp = srcFingerprint();
  const rows: GateReflexRow[] = [];
  for (const trackId of tracks) {
    const file = path.join(HARNESS_DIR, 'out', 'metrics', `${trackId}${bike === DEFAULT_BIKE ? '' : `.${bike}`}.reflex.json`);
    if (!fs.existsSync(file)) continue;
    const m = JSON.parse(fs.readFileSync(file, 'utf8')) as ReflexTrackMetrics;
    const row = m.bySkill.find((r) => r.skill === skill);
    const fresh = fingerprintMatches(m.srcFingerprint, fp) && row ? row : null;
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
/** The reflex row's four judged tracks (G10 second row; the reflex bot's `average` medians are recorded for these). */
export const REFLEX_TRACKS = ['b1-first-ride', 'b2-lean-back', 'b3-kicker-row', 'e1-uphill-weight'] as const;
/**
 * G10 stranger row (round 11, audit §4): every course with an authored `attemptsBand` — the whole curriculum, every
 * tier — not the first four. Each track arms on its own once >= stranger.minSessions completed sessions exist on this
 * src and the tier's default bike; unarmed tracks are listed as informational in the note, never as a pass.
 */
export const STRANGER_TRACKS = [
  'b1-first-ride', 'b2-lean-back', 'b3-kicker-row',
  'e1-uphill-weight', 'e2-rear-wheel-first', 'e3-stairway',
  'm1-hop-up', 'm2-drum-roll', 'm3-see-saw',
  'h1-wheelie-wire', 'h2-gap-chain', 'h3-fire-line',
  'x1-vertical-limit', 'x2-pipe-dream', 'x3-gauntlet',
] as const;

/** G2b: the tracks the gate clears on the Pro bike by golden replay (round 7). */
export const PRO_CLEAR_TRACKS = ['flat-test', 'b1-first-ride'] as const;

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
      bike?: 'rookie' | 'pro';
      sessions: Array<{ sessionId: string; status: string; srcFingerprint: string | null; strangerAttempts: number; cleared: boolean; bike?: 'rookie' | 'pro' }>;
    };
    // The band is authored for the tier's default bike; the report records which class its medians count.
    const bike = m.bike ?? 'rookie';
    const onBike = m.sessions.filter((x) => (x.bike ?? 'rookie') === bike);
    const fresh = onBike.filter((x) => x.status === 'done' && fingerprintMatches(x.srcFingerprint, fp));
    const censored = onBike.filter((x) => x.status !== 'done').length;
    const attempts = fresh.map((x) => x.strangerAttempts).sort((a, b) => a - b);
    const median = attempts.length ? (attempts.length % 2 ? attempts[(attempts.length - 1) / 2]! : (attempts[attempts.length / 2 - 1]! + attempts[attempts.length / 2]!) / 2) : null;
    const band = m.attemptsBand ?? null;
    const limit = band ? factor * band[1] : null;
    rows.push({
      trackId,
      bike,
      attemptsBand: band,
      limit,
      completedFresh: fresh.length,
      completedAny: onBike.filter((x) => x.status === 'done').length,
      censored,
      medianAttempts: median,
      allCleared: fresh.length > 0 && fresh.every((x) => x.cleared),
      // The ship bound is the upper one: a median under the authored band (UNDER-BAND in the report) is within it.
      pass: median === null || limit === null ? null : median <= limit && fresh.every((x) => x.cleared),
      belowBand: median !== null && band !== null && median < band[0],
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
  // Sections (round 12): each keeps its own check list; `checks` is assembled in SECTION_ORDER at the end.
  const SECTION_ORDER = ['boot', 'clear', 'clearPro', 'crash', 'restart', 'heap', 'bundle', 'determinism', 'offline', 'camera', 'stranger', 'reflex', 'reflexPro', 'device'] as const;
  type SectionName = (typeof SECTION_ORDER)[number];
  const sections = new Map<SectionName, GateCheck[]>(SECTION_ORDER.map((n) => [n, []]));
  const sectionMs = new Map<SectionName, number>();
  const fmtCheck = (c: GateCheck): string => {
    const v = typeof c.value === 'number' ? (Number.isInteger(c.value) ? String(c.value) : c.value.toFixed(2)) : String(c.value);
    return `${c.pass ? 'PASS' : 'FAIL'}  ${c.id.padEnd(28)} ${v}${c.unit ?? ''}  (limit ${c.limit === null ? 'n/a' : String(c.limit)}${c.unit ?? ''})${c.note ? `  ${c.note}` : ''}`;
  };
  const checkInto = (name: SectionName) => (c: GateCheck): void => {
    const shipLimit = Number(th[c.id]);
    if (softwareGL && c.id in thAll.swiftshader && typeof c.value === 'number') {
      c.shipLimit = shipLimit;
      c.shipPass = c.value <= shipLimit;
      c.note = `${c.note ? `${c.note}; ` : ''}SwiftShader limit; ship target ${shipLimit}${c.unit ?? ''} ${c.shipPass ? 'met' : 'NOT met (informational on this machine)'}`;
    }
    sections.get(name)!.push(c);
    console.log(fmtCheck(c));
  };
  /** Run one section, time it, and never let one section's throw take the others down (it becomes a FAIL row). */
  const section = async (name: SectionName, fn: (check: (c: GateCheck) => void) => Promise<void>): Promise<void> => {
    const t0 = performance.now();
    try {
      await fn(checkInto(name));
    } catch (err) {
      checkInto(name)({ id: `${name}.error`, value: null, limit: null, pass: false, note: `section threw: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}` });
    }
    sectionMs.set(name, performance.now() - t0);
    console.log(`      section ${name}: ${((performance.now() - t0) / 1000).toFixed(1)} s, ${loadLine()}`);
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

    // The golden (G2 replays it, G9 proves determinism on it) is chosen once, before the sections start.
    const goldenFile = pickGolden(trackId, (l) => console.log(`      ${l}`));
    const golden: InputRecording | null = goldenFile ? loadRecording(goldenFile) : null;
    let goldenHash: string | null = null;
    let det: DeterminismReport | null = null;
    report.clear = { recording: goldenFile, finishTime: null, expected: null, hash: null, expectedHash: null, faults: 0, hashOk: null };
    const cores = os.cpus().length;
    const load1 = (): number => Math.round((os.loadavg()[0] ?? 0) * 100) / 100;

    // G1 cold boot: 5 fresh contexts (3 with --quick). The check is on p50, the min is
    // reported beside it. A p50 miss while the machine is loaded (1-min loadavg > cores)
    // is re-sampled once and the better batch kept: contention is not a boot regression.
    const runBoot = (check: (c: GateCheck) => void): Promise<void> => (async () => {
    const bootRunsN = quick ? 3 : 5;
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
    })();

    // G2 clear a track by golden replay
    const runClear = (check: (c: GateCheck) => void): Promise<void> => (async () => {
    if (!goldenFile || !golden) {
      check({ id: 'clear.golden', value: false, limit: true, pass: false, note: `no golden recording under harness/inputs/${trackId}/ — run pnpm harness:bot ${trackId} --oracle` });
    } else {
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
    })();

    // G2b clear on the Pro bike: flat-test + b1 by their `bot-3-pro.json` goldens (fingerprint-matched), pinned under `<track>:pro`.
    // The two tracks verify concurrently; their rows are emitted in PRO_CLEAR_TRACKS order.
    const runClearPro = (check: (c: GateCheck) => void): Promise<void> => (async () => {
    const proRows = await mapPool([...PRO_CLEAR_TRACKS], 2, async (proTrack) => {
      const id = `clear.pro.${proTrack.split('-')[0]}`;
      const c = chooseGolden(proTrack, 'pro');
      if (!c) {
        const row = { trackId: proTrack, recording: null, finishTime: null, expected: null, hash: null, expectedHash: null, faults: 0, fresh: null };
        const chk: GateCheck = { id, value: false, limit: true, pass: false, note: `no Pro golden under harness/inputs/${proTrack}/ — run pnpm harness:bot ${proTrack} --bike pro` };
        return { row, chk };
      }
      const rec = loadRecording(c.file);
      rec.header.bike = 'pro';
      const r = await verifier.run(rec);
      const expected = loadExpected();
      const entry = (expected[expectedKey(proTrack, 'pro')] ??= {});
      if (!entry.golden || flagBool(flags, 'pin') || entry.golden.file !== path.basename(c.file) || entry.golden.physics !== physicsName) {
        entry.golden = { file: path.basename(c.file), finishTime: r.finishTime, hash: r.hash, ticks: r.state.tick, physics: physicsName };
        saveExpected(expected);
      }
      const cleared = r.finishTime !== null && r.faults === 0;
      const pinnedOk = r.finishTime === entry.golden.finishTime && r.hash === entry.golden.hash;
      const row = { trackId: proTrack, recording: c.file, finishTime: r.finishTime, expected: entry.golden.finishTime, hash: r.hash, expectedHash: entry.golden.hash, faults: r.faults, fresh: c.fresh };
      const chk: GateCheck = {
        id,
        value: cleared && pinnedOk,
        limit: true,
        pass: cleared && pinnedOk,
        note: `${path.basename(c.file)} (${c.fresh ? 'src matches' : `STALE src=${c.stamp ?? 'unstamped'}`}) finish=${r.finishTime} faults=${r.faults} hash ${r.hash} vs pinned ${entry.golden.hash} (expected finish ${entry.golden.finishTime})`,
      };
      return { row, chk };
    });
    report.clearPro = proRows.map((x) => x.row);
    for (const x of proRows) check(x.chk);
    })();

    // G3 crash + G4 fault -> control
    const runCrash = (check: (c: GateCheck) => void): Promise<void> => (async () => {
    const crashFile = path.join(HARNESS_DIR, 'inputs', trackId, 'crash.json');
    report.crash = { recording: fs.existsSync(crashFile) ? crashFile : null, faultTick: null, faultTime: null, reason: null };
    report.fault = { toControlTicks: null, toControlMs: null, autoRespawnTicks: null, autoRespawnMs: null };
    if (!fs.existsSync(crashFile)) {
      check({ id: 'crash.faultWithinS', value: null, limit: num('crash.faultWithinS'), pass: false, unit: 's', note: `no ${path.relative(REPO_ROOT, crashFile)} — run pnpm harness:bot ${trackId} --crash-probe (the mock never crashes)` });
      check({ id: 'fault.toControlMs', value: null, limit: num('fault.toControlMs'), pass: false, unit: 'ms', note: 'needs a crash' });
    } else {
      const crash = loadRecording(crashFile);
      const page = await isolatedPage(launched);
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
            void t.loadTrack(id, seed);
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
      await closeIsolated(page);
      report.crash = { recording: crashFile, faultTick: r.faultTick, faultTime: r.faultTime, reason: r.reason as FaultReason | null };
      const within = r.faultTime !== null && r.faultTime <= num('crash.faultWithinS');
      check({ id: 'crash.faultWithinS', value: r.faultTime, limit: num('crash.faultWithinS'), pass: within, unit: 's', note: `reason=${r.reason}` });
      const hzc = crash.header.physicsHz;
      const manualMs = r.manualTicks === null ? null : (r.manualTicks * 1000) / hzc;
      const autoMs = r.autoTicks === null ? null : (r.autoTicks * 1000) / hzc;
      report.fault = { toControlTicks: r.manualTicks, toControlMs: manualMs, autoRespawnTicks: r.autoTicks, autoRespawnMs: autoMs };
      check({ id: 'fault.toControlMs', value: manualMs, limit: num('fault.toControlMs'), pass: manualMs !== null && manualMs <= num('fault.toControlMs'), unit: 'ms', note: `crash tick -> restart mash on the next tick -> bike moving; auto-respawn path ${autoMs === null ? 'never' : autoMs.toFixed(0) + ' ms'} (CONTRACT §2.8: 1.0 s)` });
    }
    })();

    // G5 restart latency + G6 no countdown
    const runRestart = (check: (c: GateCheck) => void): Promise<void> => (async () => {
    {
      const page = await isolatedPage(launched);
      await openGame(page, server.url);
      const r = await page.evaluate(
        ([id]) => {
          const t = window.__trials!;
          void t.loadTrack(id);
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
      await closeIsolated(page);
      const movesOk = r.movesAfterTicks <= num('restart.movesWithinTicks');
      report.restart = { ticks: r.ticksOk ? 1 : null, wallMs: r.wallMs, frameMs: r.frameMs, noCountdown: movesOk, movesOnFirstTick: r.movesOnFirstTick, movesAfterTicks: r.movesAfterTicks };
      check({ id: 'restart.ticks', value: r.ticksOk ? 1 : -1, limit: num('restart.ticks'), pass: r.ticksOk, note: 'tick==0 && faulted==null after exactly one tick, 20 reps' });
      const w95 = percentileOf(r.wallMs, 95);
      check({ id: 'restart.wallMsP95', value: w95, limit: num('restart.wallMsP95'), pass: w95 <= num('restart.wallMsP95'), unit: 'ms' });
      const f95 = percentileOf(r.frameMs, 95);
      check({ id: 'restart.frameMsP95', value: f95, limit: num('restart.frameMsP95'), pass: f95 <= num('restart.frameMsP95'), unit: 'ms', note: 'restart -> synced frame' });
      check({ id: 'restart.noCountdown', value: r.movesAfterTicks, limit: num('restart.movesWithinTicks'), pass: movesOk, unit: ' ticks', note: `worst of 20 reps: held throttle after the restart tick until the bike rolls (a countdown would be 360+); first-tick roll ${r.movesOnFirstTick ? 'yes' : 'no'}; game faults=${r.faults}` });
    }
    })();

    // G7 heap + perf over N seconds of play
    const runHeap = (check: (c: GateCheck) => void): Promise<void> => (async () => {
    {
      const page = await isolatedPage(launched);
      await openGame(page, server.url);
      const fps = 60;
      const hz = 120;
      const tpf = hz / fps;
      const rec = synthesizeRecording({ trackId, seed: 1, physicsHz: hz, seconds: heapSeconds, style: 'wiggle' });
      const frames = expandFrames(rec);
      await page.evaluate(([id]) => {
        const t = window.__trials!;
        void t.loadTrack(id);
        t.resize(640, 360); // heap/perf counters do not depend on the viewport; SwiftShader raster cost does
        for (let i = 0; i < 5; i++) t.render(true);
      }, [trackId] as const);
      const heapBefore = await readHeap(page, true);
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
      const heapAfter = await readHeap(page, true);
      const stats = await page.evaluate(() => window.__trials!.stats());
      await closeIsolated(page);
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
      check({ id: 'heap.growthMBPer60s', value: growthMB, limit: limitGrowth, pass: growthMB <= limitGrowth, unit: 'MB', note: `retained heap after GC at both endpoints over ${heapSeconds}s of play${heapSeconds < 60 ? ' (--quick: shorter than the 60 s the threshold is written for)' : ''}` });
      check({ id: 'perf.drawCallsMax', value: stats.calls, limit: num('perf.drawCallsMax'), pass: stats.calls <= num('perf.drawCallsMax') });
      check({ id: 'perf.trianglesMax', value: stats.triangles, limit: num('perf.trianglesMax'), pass: stats.triangles <= num('perf.trianglesMax') });
      check({ id: 'perf.texturesMBMax', value: stats.texturesMB, limit: num('perf.texturesMBMax'), pass: stats.texturesMB <= num('perf.texturesMBMax'), unit: 'MB' });
      check({ id: 'perf.physicsUsPerTickP95', value: report.perf.physicsUsPerTickP95, limit: num('perf.physicsUsPerTickP95'), pass: report.perf.physicsUsPerTickP95 <= num('perf.physicsUsPerTickP95'), unit: 'us' });
      check({ id: 'perf.renderSubmitMsP95', value: report.perf.renderSubmitMsP95, limit: num('perf.renderSubmitMsP95'), pass: report.perf.renderSubmitMsP95 <= num('perf.renderSubmitMsP95'), unit: 'ms' });
      check({ id: 'perf.renderSyncedMsP95', value: report.perf.renderSyncedMsP95, limit: num('perf.renderSyncedMsP95'), pass: report.perf.renderSyncedMsP95 <= num('perf.renderSyncedMsP95'), unit: 'ms', note: 'render + readPixels sync' });
    }
    })();

    // G8 bundle
    const runBundle = (check: (c: GateCheck) => void): Promise<void> => (async () => {
    const gzKB = gz / 1024;
    check({ id: 'bundle.jsGzipKB', value: gzKB, limit: num('bundle.jsGzipKB'), pass: gz > 0 && gzKB <= num('bundle.jsGzipKB'), unit: 'KB', note: `dist ${(distBytes / 1024).toFixed(0)} KB raw` });
    })();

    // G9 determinism on the golden recording
    const runDet = (check: (c: GateCheck) => void): Promise<void> => (async () => {
    if (golden && goldenFile) {
      det = await runDeterminism(golden, goldenFile, { loads: 2, pin: flagBool(flags, 'pin'), verifier, log: (l) => console.log(`      ${l}`) });
      check({ id: 'determinism.pass', value: det.pass, limit: true, pass: det.pass, note: `${det.checks.filter((c) => c.pass).length}/${det.checks.length} checks` });
    } else {
      check({ id: 'determinism.pass', value: null, limit: true, pass: false, note: 'no golden recording' });
    }
    })();

    // G9b camera box (round 8): the b3 golden rendered by the clip renderer in a child process; the bike must
    // stay inside the central [0.2, 0.8] box on bikeScreenX/Y in the riding phase (settle excluded, |roll| < 1e-6);
    // `clamped` (frames the rig hit the track's camera bounds) is reported, not gated. Skipped with --quick
    // (a 30 s clip at 20 fps is ~3 min on SwiftShader).
    const runCamera = (check: (c: GateCheck) => void): Promise<void> => (async () => {
    if (quick) {
      check({ id: 'camera.box', value: null, limit: 0, pass: true, note: 'skipped with --quick' });
    } else {
      const camTrack = 'b3-kicker-row';
      const g = chooseGolden(camTrack, DEFAULT_BIKE);
      const clipDir = path.join(HARNESS_DIR, 'out', 'gate', 'clip-' + camTrack);
      const args = [path.join(HARNESS_DIR, 'clip.ts'), camTrack, '--out', clipDir, '--fps', '20', '--quality', 'low', ...(g ? ['--recording', g.file] : [])];
      const t0 = performance.now();
      const wallStart = Date.now();
      const r = await new Promise<{ code: number | null; out: string }>((resolve) => {
        const child = spawn(path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx'), args, { cwd: REPO_ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        child.stdout.on('data', (d: Buffer) => (out += d.toString()));
        child.stderr.on('data', (d: Buffer) => (out += d.toString()));
        const timer = setTimeout(() => child.kill('SIGKILL'), 20 * 60_000);
        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({ code, out });
        });
      });
      // clip.ts prints the assertion both as a `camera: ...` line and as the `camera  PASS/FAIL ...` row of its summary table.
      let line = /^camera: .*$/m.exec(r.out)?.[0] ?? /camera\s+(?:PASS|FAIL) out-of-box[^\n]*/.exec(r.out)?.[0]?.replace(/^camera\s+/, 'camera: ') ?? null;
      let source = '';
      if (line === null) {
        // Ship round r3 (ask 43): the child once lost its stdout on teardown (a pipe error after the clip was written) and
        // the row failed with "no camera line" although clip.json held a clean camera. The file is the record: read it
        // when THIS run wrote it (mtime after the spawn); the exit code alone never fails the row.
        const clipJson = path.join(clipDir, 'clip.json');
        try {
          if (fs.statSync(clipJson).mtimeMs >= wallStart) {
            const c = (JSON.parse(fs.readFileSync(clipJson, 'utf8')) as { camera?: { pass: boolean; outOfBox: number; outOfBoxRiding: number; frames: number; clamped: number; clampedPct: number; maxAbsRoll: number; rollViolations: number } | null }).camera;
            if (c) {
              line = `camera: ${c.pass ? 'PASS' : 'FAIL'} out-of-box ${c.outOfBox}/${c.frames} (riding ${c.outOfBoxRiding}), clamped ${c.clamped} (${c.clampedPct}%), max|roll| ${c.maxAbsRoll.toExponential(1)}${c.rollViolations ? ` ROLL x${c.rollViolations}` : ''}`;
              source = `from clip.json (stdout lost, clip exit ${r.code}); `;
            }
          }
        } catch { /* no clip.json from this run: the row fails below with the child's tail */ }
      }
      const riding = line ? Number(/riding (\d+)/.exec(line)?.[1] ?? NaN) : NaN;
      const clampedPct = line ? Number(/clamped \d+ \(([\d.]+)%\)/.exec(line)?.[1] ?? NaN) : NaN;
      const rollOk = line ? !/ROLL x/.test(line) : false;
      const pass = line !== null && riding === 0 && rollOk;
      check({ id: 'camera.box', value: Number.isFinite(riding) ? riding : null, limit: 0, pass, unit: 'frames out of box while riding', note: line ? `${g ? path.basename(g.file) : 'no golden'}; clamped ${Number.isFinite(clampedPct) ? clampedPct : '?'} % (reported); ${((performance.now() - t0) / 1000).toFixed(0)} s; ${source}${line.slice(0, 200)}` : `no camera line; clip exit ${r.code}: ${r.out.trim().split('\n').slice(-2).join(' | ').slice(0, 200)}` });
    }
    })();

    // G10 rows are file reads: they run last, in-process, in order.
    const runRows = (check: (c: GateCheck) => void): Promise<void> => (async () => {
    // G10 stranger: every banded course, on the physics in the working tree right now. Each track arms on its own
    // (>= minSessions completed on this src + default bike); the check fails if ANY armed track is outside its
    // limit or did not clear, and the note names the tracks that are still informational and every censored session.
    const stranger = strangerRows(STRANGER_TRACKS, num('stranger.attemptsBandFactor'));
    const minSessions = num('stranger.minSessions') || 2;
    const armedRows = stranger.filter((r) => r.completedFresh >= minSessions);
    const unarmed = STRANGER_TRACKS.filter((t) => !armedRows.some((r) => r.trackId === t));
    const armed = armedRows.length > 0;
    const allPass = armedRows.every((r) => r.pass === true);
    const short = (t: string): string => t.split('-')[0]!;
    const summary = armedRows.map((r) => `${short(r.trackId)} ${r.medianAttempts ?? '-'}/${r.limit ?? '-'} (n=${r.completedFresh}${r.censored ? `, ${r.censored} censored` : ''}${r.belowBand ? ', under band' : ''})`).join(' · ');
    const unarmedNote = unarmed.map((t) => { const r = stranger.find((x) => x.trackId === t); return `${short(t)} ${r ? `${r.completedFresh} fresh${r.censored ? `+${r.censored} censored` : ''}` : 'no report'}`; }).join(', ');
    check({
      id: 'stranger.medianAttempts',
      value: summary || 'no armed track',
      limit: num('stranger.attemptsBandFactor'),
      pass: armed ? allPass : true,
      note: `median attempts / (${num('stranger.attemptsBandFactor')} x band top), every counted session cleared, on src ${srcFingerprint()} and the tier's default bike; armed ${armedRows.length}/${STRANGER_TRACKS.length} tracks (>= ${minSessions} completed)${armed ? `: ${allPass ? 'all armed within the limit' : `OUTSIDE: ${armedRows.filter((r) => r.pass !== true).map((r) => short(r.trackId)).join(', ')}`}` : ''}; informational (unarmed): ${unarmedNote || 'none'}`,
    });
    report.stranger = { srcFingerprint: srcFingerprint(), armed, minSessions, rows: stranger };

    // G10, second row: the reflex bot (average) on the four judged tracks, seeds recorded on this src.
    const reflex = reflexRows(REFLEX_TRACKS, num('reflex.attemptsBandFactor') || 1.5);
    const minSeeds = num('reflex.minSeeds') || 3;
    const reflexArmed = reflex.length === REFLEX_TRACKS.length && reflex.every((r) => r.seedsFresh >= minSeeds);
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

    // G10, third row: the same reflex medians on the Pro bike. Informational by design — the attempts band is
    // authored for the tier's default bike (Rookie on beginner/easy) — but reported per track so a Pro regression is visible.
    const reflexPro = reflexRows(REFLEX_TRACKS, num('reflex.attemptsBandFactor') || 1.5, 'average', 'pro');
    const reflexProArmed = reflexPro.length === REFLEX_TRACKS.length && reflexPro.every((r) => r.seedsFresh >= minSeeds);
    const reflexProSummary = reflexPro.length ? reflexPro.map((r) => `${r.trackId.split('-')[0]} ${r.medianAttempts ?? '-'}/${r.limit ?? '-'}${r.seedsFresh < minSeeds ? ` (${r.seedsFresh} fresh)` : ''}${r.allCleared ? '' : ' (not all cleared)'}`).join(' · ') : 'no <track>.pro.reflex.json yet';
    check({
      id: 'reflex.medianAttempts.pro',
      value: reflexProSummary,
      limit: num('reflex.attemptsBandFactor') || 1.5,
      pass: true,
      note: `reflex bot (average) on the Pro bike, same tracks and band; informational (the band is Rookie's): ${reflexProArmed ? `${reflexPro.filter((r) => r.pass).length}/${reflexPro.length} within band` : `fewer than ${minSeeds} fresh seeds on some track (pnpm harness:reflex --all-tracks --bike pro --seeds 3)`}`,
    });
    report.reflexPro = { srcFingerprint: srcFingerprint(), armed: reflexProArmed, minSeeds, rows: reflexPro };

    // G11: device report + WebKit hero rows (Rider on Glass G5). No browser; reads what the phone and the WebKit gate left.
    const dev = deviceChecks(num, gitHead() === 'unknown' ? null : gitHead());
    for (const c of dev.checks) check(c);
    report.device = dev.device;
    })();

    /** The offline gate's nine checks; `offline.coldStartPlayable` is the judged row, the other eight are its note. */
    const runOffline = async (check: (c: GateCheck) => void): Promise<void> => {
      const { offlineSuite } = await import('../e2e/offline.mjs');
      const r = await offlineSuite({});
      writeJson(path.join(HARNESS_DIR, 'out', 'offline', 'offline.json'), r.measured);
      const cold = r.checks.find((c) => c.id === 'offline.coldStartPlayable');
      const others = r.checks.filter((c) => c.id !== 'offline.coldStartPlayable');
      const failed = others.filter((c) => !c.pass);
      check({
        id: 'offline.coldStartPlayable',
        value: cold ? String(cold.value) : 'suite did not run',
        limit: th['offline.coldStartPlayable'] === undefined ? true : (th['offline.coldStartPlayable'] as boolean),
        pass: !!cold?.pass,
        note: `${r.checks.length - failed.length - (cold?.pass ? 0 : 1)}/${r.checks.length} offline e2e checks pass${failed.length ? `; also failing: ${failed.map((c) => c.id).join(', ')}` : ''}`,
      });
    };

    // Schedule (round 12). Correctness sections on a pool; the timing chain (boot -> restart -> heap/perf) runs
    // next to it by default (their notes carry the loadavg), or after it with --quiet-timing.
    const jobs = defaultBrowserJobs(6, flags);
    const quietTiming = flagBool(flags, 'quiet-timing');
    // `--only=camera,clear`: run those sections alone (a row's re-proof after a harness fix); the rows print and
    // `out/metrics/ship-gate.partial.json` gets them — the full report and its exit code need every section.
    const onlyList = flagStr(flags, 'only', '').split(',').filter(Boolean) as SectionName[];
    const wanted = (n: SectionName): boolean => onlyList.length === 0 || onlyList.includes(n);
    console.log(`sections: pool of ${jobs} (clear, clearPro, crash, determinism, camera, bundle) ${quietTiming ? 'then' : '+'} timing chain (boot, restart, heap), then offline${onlyList.length ? ` — only ${onlyList.join(', ')}` : ''}; ${loadLine()}`);
    const tGate = performance.now();
    const poolSections: [SectionName, (check: (c: GateCheck) => void) => Promise<void>][] = [['camera', runCamera], ['determinism', runDet], ['clear', runClear], ['clearPro', runClearPro], ['crash', runCrash], ['bundle', runBundle]];
    const pool = mapPool<[SectionName, (check: (c: GateCheck) => void) => Promise<void>], void>(
      poolSections.filter(([n]) => wanted(n)),
      jobs,
      ([name, fn]) => section(name, fn),
    );
    const timing = async (): Promise<void> => {
      if (wanted('boot')) await section('boot', runBoot);
      if (wanted('restart')) await section('restart', runRestart);
      if (wanted('heap')) await section('heap', runHeap);
    };
    if (quietTiming) {
      await pool;
      await timing();
    } else await Promise.all([pool, timing()]);
    // G12 offline (docs/plans/PWA_OFFLINE.md): ONE online load, then the origin is shut down and the game
    // must still cold-start. Runs alone, after the pool — it owns a persistent Chromium profile and its own
    // server, which it stops mid-suite. Every other harness entry runs `?sw=0`, so this is the only place a
    // service-worker regression is visible at all.
    if (wanted('offline')) await section('offline', runOffline);
    if (onlyList.length) {
      const partial: GateCheck[] = SECTION_ORDER.flatMap((n) => sections.get(n)!);
      for (const c of partial) console.log(fmtCheck(c));
      const failedPartial = partial.filter((c) => !c.pass).length;
      const outPartial = path.join(HARNESS_DIR, 'out', 'metrics', 'ship-gate.partial.json');
      writeJson(outPartial, { ...runMeta('gate', started, { chromium: launched.browser.version() }), kind: 'gate-partial', only: onlyList, checks: partial, failed: failedPartial });
      console.log(`\nPARTIAL (${onlyList.join(', ')}): ${partial.length - failedPartial}/${partial.length} checks pass — not a ship verdict; report: ${outPartial}`);
      process.exitCode = failedPartial;
      return;
    }
    await section('stranger', runRows);
    // `runRows` emits the stranger, reflex, reflexPro and device rows in one go; split them back into their sections for the order.
    const rowChecks = sections.get('stranger')!.splice(0);
    for (const c of rowChecks) sections.get(c.id.startsWith('stranger') ? 'stranger' : c.id.startsWith('reflex') ? (c.id.endsWith('.pro') ? 'reflexPro' : 'reflex') : 'device')!.push(c);
    const checks: GateCheck[] = SECTION_ORDER.flatMap((n) => sections.get(n)!);
    console.log(`\n== checks in report order (sections wall ${((performance.now() - tGate) / 1000).toFixed(0)} s: ${SECTION_ORDER.filter((n) => sectionMs.has(n)).map((n) => `${n} ${(sectionMs.get(n)! / 1000).toFixed(0)}s`).join(', ')})`);
    for (const c of checks) console.log(fmtCheck(c));

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
      reflexPro: report.reflexPro!,
      ...(report.device ? { device: report.device } : {}),
      clearPro: report.clearPro ?? [],
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
