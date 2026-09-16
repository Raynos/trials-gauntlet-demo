/**
 * Perf bench — repeatable, deterministic, comparable across commits.
 *
 *   pnpm harness:bench [--tiers high,medium,low] [--tracks b1,b3,e2,m2,h1,h3,x1] [--geoms phone,desktop]
 *                      [--frames 600] [--gpu-samples 10] [--repeat 1] [--full] [--label txt] [--build] [--dev]
 *
 * For every tier × track × geometry the committed golden (`harness/lib/golden.ts chooseGolden`,
 * bot-3) is replayed from tick 0 for `frames` video frames at 60 fps (2 physics ticks per frame)
 * and two passes are taken:
 *
 *   CPU pass   `frames` frames through the hook's `render(false)`, the split of `render()` per frame
 *              (`page.ts`), draw calls / triangles per frame, `debugInfo()` every 30th frame, the JS
 *              heap delta (GC forced before and after). Drawn on a canvas a quarter of the geometry's
 *              CSS size at the tier's pixel ratio: CPU submit does not depend on pixel count, and at
 *              full size SwiftShader's raster queue (0.2–0.7 s per high frame on this host) would make
 *              the matrix hours long. `--full` runs it at the full canvas (the literal spec).
 *   GPU pass   `gpu-samples` frames spread over the same window, each isolated: queue drained,
 *              render, 1×1 readPixels — SwiftShader raster ms for one frame at the *full* geometry.
 *              Not phone ms: a monotone proxy for fragment + vertex work. The pass list, canvas size
 *              and the GPU work model (`model.ts`) come from this pass.
 *
 * Tier order is high → medium → low with the tracks inside: `setQuality('low')` halves the hero
 * atlases for the rest of the session, so a low run before a high one would under-report texMB.
 * The track is re-loaded between the two passes (the only clean reset of rig / particles / history).
 *
 * Output: harness/out/bench/<sha7>-<tier>-<track>-<geom>.json (per-frame data; untracked),
 *         harness/out/bench/ledger.jsonl (one summary row per run, appended; the cross-sha memory),
 *         harness/out/bench/latest.md (this sha's table with deltas vs the previous sha in the ledger).
 * `--repeat 2` runs the matrix twice in one process and reports the max relative spread per metric
 * (the ±5 % repeatability proof).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright';
import { DEFAULT_PHYSICS_HZ, type QualityTier } from '../../src/core/types';
import { expandFrames } from '../../src/core/replay';
import { flagBool, flagNum, flagStr, parseArgs } from '../lib/args';
import { launchBrowser, type LaunchedBrowser } from '../lib/browser';
import { chooseGolden } from '../lib/golden';
import { HookClient, openGame } from '../lib/hook';
import { REPO_ROOT } from '../lib/paths';
import { loadRecording } from '../lib/recording';
import { ensureOut, percentile, writeJson } from '../lib/report';
import { distIsStale, startServer, type GameServer } from '../lib/server';
import { runIdle, type IdleResult } from './idle';
import { effectiveMpx, gpuWork, phoneEstimate } from './model';
import { FRAME_FIELDS, PAGE_BENCH_SRC, type CpuPassResult, type FrameField, type GpuPassResult } from './page';
import { appendLedger, readLedger, writeLatest, type LedgerRow } from './report';

export const TRACKS: Record<string, string> = {
  b1: 'b1-first-ride',
  b3: 'b3-kicker-row',
  e2: 'e2-rear-wheel-first',
  m2: 'm2-drum-roll',
  h1: 'h1-wheelie-wire',
  h3: 'h3-fire-line',
  x1: 'x1-vertical-limit',
};

export interface Geometry {
  name: string;
  cssW: number;
  cssH: number;
  dpr: number;
}

/** The user's iPhone (device report #1: 874×330 CSS @ 3; was 932×430 before 2026-09-15) and the harness desktop geometry. A `phone` geometry also declares the phone device class (`setDeviceClass`), so `high` is the phone-high profile. */
export const GEOMETRIES: Record<string, Geometry> = {
  phone: { name: 'phone', cssW: 874, cssH: 330, dpr: 3 },
  desktop: { name: 'desktop', cssW: 1280, cssH: 720, dpr: 1 },
};

export interface Summary {
  p50: number;
  p95: number;
  max: number;
  mean: number;
}

export interface RunResult {
  key: string;
  sha: string;
  dirty: boolean;
  label: string;
  at: string;
  tier: QualityTier;
  track: string;
  trackId: string;
  geom: Geometry;
  golden: { file: string; fresh: boolean };
  frames: number;
  ticksPerFrame: number;
  loadavg: { start: number; end: number };
  distStale: boolean;
  cpu: {
    canvas: string;
    blocked: number;
    split: Record<FrameField, Summary>;
    programs: number;
    texturesMB: number;
    heapDeltaMB: number;
    finalHash: string;
    finalTick: number;
    samples: CpuPassResult['samples'];
  };
  gpu: {
    canvas: string;
    dpr: number;
    rasterMs: Summary;
    syncedMs: Summary;
    submitMs: Summary;
    rtMpx: number;
    rtMB: number;
    rtPasses: string;
    shadowMap: number;
    heroTris: number;
    heroDoc: string;
    programs: number;
    texturesMB: number;
    calls: number;
    tris: number;
    samples: GpuPassResult['samples'];
  };
  model: {
    weightedMB: number;
    msGpu: number;
    phoneMs: number;
    phoneFps: number;
    phoneParts: { fill: number; draws: number; tris: number; textures: number; constant: number };
  };
  /** Per-frame CPU records (row-major, FRAME_FIELDS) — kept in the JSON, not the ledger. */
  perFrame?: number[];
}

function summarize(values: number[]): Summary {
  const s = [...values].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return { p50: percentile(s, 50), p95: percentile(s, 95), max: s[s.length - 1] ?? 0, mean: s.length ? sum / s.length : 0 };
}

function gitSha(): { sha: string; dirty: boolean } {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const status = execFileSync('git', ['status', '--porcelain', '--', 'src', 'harness/inputs'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    return { sha, dirty: status.length > 0 };
  } catch {
    return { sha: 'nogit', dirty: true };
  }
}

async function forcedHeap(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('Performance.enable');
    const { metrics } = await cdp.send('Performance.getMetrics');
    return metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0;
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

function spread(frames: number, sampleCount: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < sampleCount; k++) out.push(Math.min(frames - 1, Math.floor(((k + 0.5) * frames) / sampleCount)));
  return out;
}

export interface BenchOptions {
  tiers: QualityTier[];
  tracks: string[];
  geoms: Geometry[];
  frames: number;
  gpuSamples: number;
  full: boolean;
  label: string;
  dev: boolean;
  build: boolean;
  verbose: boolean;
  drainEvery: number;
  sampleEvery: number;
}

export async function runMatrix(opts: BenchOptions, log: (l: string) => void, server: GameServer, launched: LaunchedBrowser): Promise<RunResult[]> {
  const hz = DEFAULT_PHYSICS_HZ;
  const fps = 60;
  const tpf = hz / fps;
  const { sha, dirty } = gitSha();
  const stale = distIsStale().stale && !opts.dev;
  const results: RunResult[] = [];
  {
    const page = await launched.context.newPage();
    try {
      await openGame(page, server.url);
      await page.evaluate(PAGE_BENCH_SRC);
      const hook = new HookClient(page);
      log(`bench sha=${sha}${dirty ? '+dirty' : ''} renderer="${launched.probe.renderer}" frames=${opts.frames} gpuSamples=${opts.gpuSamples} loadavg=${os.loadavg()[0]!.toFixed(1)}`);
      for (const tier of opts.tiers) {
        for (const track of opts.tracks) {
          const trackId = TRACKS[track] ?? track;
          const golden = chooseGolden(trackId);
          if (!golden) throw new Error(`no golden for ${trackId}`);
          const rec = loadRecording(golden.file);
          const inputs = expandFrames(rec).slice(0, opts.frames * tpf);
          if (inputs.length < opts.frames * tpf) log(`WARNING ${trackId}: golden has ${inputs.length} ticks < ${opts.frames * tpf}`);
          for (const geom of opts.geoms) {
            const key = `${tier}-${track}-${geom.name}`;
            const load0 = os.loadavg()[0]!;
            const t0 = performance.now();
            // -- GPU pass (full geometry) --
            await hook.loadTrack(trackId);
            // The harness page re-sizes the renderer at DPR 1 on every window resize event; let that land before setTier.
            await page.setViewportSize({ width: geom.cssW, height: geom.cssH });
            await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [geom.cssW, geom.cssH] as const);
            await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
            const device = geom.name === 'phone' ? 'phone' : 'desktop';
            await page.evaluate(([t, w, h, d, dc]) => window.__bench!.setTier(t as QualityTier, w as number, h as number, d as number, dc as 'phone' | 'desktop'), [tier, geom.cssW, geom.cssH, geom.dpr, device] as const);
            await page.evaluate(() => window.__bench!.install());
            await page.evaluate(() => window.__bench!.warm(8));
            const gpu = await page.evaluate(([ins, k, sf]) => window.__bench!.gpuPass(ins as unknown[], k as number, sf as number[]), [inputs, tpf, spread(opts.frames, opts.gpuSamples)] as const);
            const expectedPr = tier === 'low' ? Math.min(geom.dpr, 1, 1600 / geom.cssW) : tier === 'medium' ? Math.min(geom.dpr, 1.25) : Math.min(geom.dpr, device === 'phone' ? 1.5 : 2);
            if (Math.abs(gpu.dpr - expectedPr) > 0.01) log(`WARNING ${key}: canvas pixel ratio ${gpu.dpr} != tier cap ${expectedPr} (a resize event landed after setTier) — row invalid`);
            // -- CPU pass (quarter canvas unless --full) --
            await hook.loadTrack(trackId);
            const scale = opts.full ? 1 : 0.25;
            await page.evaluate(([t, w, h, d, dc]) => window.__bench!.setTier(t as QualityTier, w as number, h as number, d as number, dc as 'phone' | 'desktop'), [tier, Math.round(geom.cssW * scale), Math.round(geom.cssH * scale), geom.dpr, device] as const);
            await page.evaluate(() => window.__bench!.warm(30));
            const heap0 = await forcedHeap(page);
            const cpu = await page.evaluate(
              ([ins, k, n, de, se, bm]) => window.__bench!.cpuPass(ins as unknown[], k as number, n as number, de as number, se as number, bm as number),
              [inputs, tpf, opts.frames, opts.drainEvery, opts.sampleEvery, 20] as const,
            );
            const heap1 = await forcedHeap(page);
            const nf = FRAME_FIELDS.length;
            const split = {} as Record<FrameField, Summary>;
            FRAME_FIELDS.forEach((f, i) => {
              const col: number[] = [];
              for (let r = 0; r < cpu.frames; r++) col.push(cpu.data[r * nf + i]!);
              split[f] = summarize(col);
            });
            const gCalls = Math.round(summarize(gpu.samples.map((s) => s.calls)).p50);
            const gTris = Math.round(summarize(gpu.samples.map((s) => s.tris)).p50);
            const work = gpuWork(gpu.passes, gCalls, gTris);
            const est = phoneEstimate(effectiveMpx(gpu.passes), gCalls, gTris, gpu.texturesMB);
            const cpuCanvas = cpu.samples[0] ? `${cpu.samples[0].canvasW}×${cpu.samples[0].canvasH}` : '?';
            const res: RunResult = {
              key,
              sha,
              dirty,
              label: opts.label,
              at: new Date().toISOString(),
              tier,
              track,
              trackId,
              geom,
              golden: { file: path.relative(REPO_ROOT, golden.file), fresh: golden.fresh },
              frames: cpu.frames,
              ticksPerFrame: tpf,
              loadavg: { start: load0, end: os.loadavg()[0]! },
              distStale: stale,
              cpu: {
                canvas: cpuCanvas,
                blocked: cpu.blocked,
                split,
                programs: cpu.programs,
                texturesMB: cpu.texturesMB,
                heapDeltaMB: (heap1 - heap0) / 1048576,
                finalHash: cpu.finalHash,
                finalTick: cpu.finalTick,
                samples: cpu.samples,
              },
              gpu: {
                canvas: `${gpu.canvasW}×${gpu.canvasH}`,
                dpr: gpu.dpr,
                rasterMs: summarize(gpu.samples.map((s) => s.rasterMs)),
                syncedMs: summarize(gpu.samples.map((s) => s.syncedMs)),
                submitMs: summarize(gpu.samples.map((s) => s.submitMs)),
                rtMpx: gpu.rtMpx,
                rtMB: gpu.rtMB,
                rtPasses: gpu.rtPasses,
                shadowMap: gpu.shadowMap,
                heroTris: gpu.heroTris,
                heroDoc: gpu.heroDoc,
                programs: gpu.programs,
                texturesMB: gpu.texturesMB,
                calls: gCalls,
                tris: gTris,
                samples: gpu.samples,
              },
              model: { weightedMB: work.weightedMB, msGpu: work.msGpu, phoneMs: est.ms, phoneFps: est.fps, phoneParts: est.parts },
              perFrame: cpu.data,
            };
            results.push(res);
            const secs = ((performance.now() - t0) / 1000).toFixed(0);
            log(
              `${key.padEnd(22)} submit p50 ${split.render.p50.toFixed(2)} p95 ${split.render.p95.toFixed(2)} ms (draws ${split.draws.p50.toFixed(2)} trav ${split.traverse.p50.toFixed(2)} post ${split.post.p50.toFixed(2)} game ${split.game.p50.toFixed(2)}) | raster p50 ${res.gpu.rasterMs.p50.toFixed(0)} ms @ ${res.gpu.canvas} | calls ${gCalls} tris ${(gTris / 1000).toFixed(0)}k rt ${gpu.rtMpx} Mpx tex ${gpu.texturesMB.toFixed(0)} MB | model phone ${est.ms.toFixed(1)} ms | heap ${res.cpu.heapDeltaMB >= 0 ? '+' : ''}${res.cpu.heapDeltaMB.toFixed(2)} MB | blocked ${cpu.blocked} | ${secs}s load ${load0.toFixed(0)}→${res.loadavg.end.toFixed(0)}`,
            );
          }
        }
      }
    } finally {
      await page.close();
    }
  }
  return results;
}

export function toLedgerRow(r: RunResult, repeat: number): LedgerRow {
  return {
    sha: r.sha,
    dirty: r.dirty,
    label: r.label,
    at: r.at,
    repeat,
    key: r.key,
    tier: r.tier,
    track: r.track,
    geom: r.geom.name,
    frames: r.frames,
    loadavg: +r.loadavg.end.toFixed(1),
    submitP50: +r.cpu.split.render.p50.toFixed(3),
    submitP95: +r.cpu.split.render.p95.toFixed(3),
    totalP50: +r.cpu.split.total.p50.toFixed(3),
    gameP50: +r.cpu.split.game.p50.toFixed(3),
    buildP50: +r.cpu.split.build.p50.toFixed(3),
    rigP50: +r.cpu.split.rig.p50.toFixed(3),
    heroP50: +r.cpu.split.hero.p50.toFixed(3),
    shadowP50: +r.cpu.split.shadow.p50.toFixed(3),
    drawsP50: +r.cpu.split.draws.p50.toFixed(3),
    traverseP50: +r.cpu.split.traverse.p50.toFixed(3),
    postP50: +r.cpu.split.post.p50.toFixed(3),
    otherP50: +r.cpu.split.other.p50.toFixed(3),
    physicsP50: +r.cpu.split.physics.p50.toFixed(3),
    rasterP50: +r.gpu.rasterMs.p50.toFixed(1),
    rasterP95: +r.gpu.rasterMs.p95.toFixed(1),
    calls: r.gpu.calls,
    tris: r.gpu.tris,
    programs: r.gpu.programs,
    texMB: +r.gpu.texturesMB.toFixed(1),
    rtMpx: r.gpu.rtMpx,
    rtMB: r.gpu.rtMB,
    heroTris: r.gpu.heroTris,
    shadowMap: r.gpu.shadowMap,
    canvas: r.gpu.canvas,
    heapMB: +r.cpu.heapDeltaMB.toFixed(2),
    blocked: r.cpu.blocked,
    weightedMB: +r.model.weightedMB.toFixed(1),
    modelGpuMs: +r.model.msGpu.toFixed(2),
    phoneMs: +r.model.phoneMs.toFixed(1),
    finalHash: r.cpu.finalHash,
  };
}

async function main(): Promise<void> {
  const { flags } = parseArgs();
  const tiers = flagStr(flags, 'tiers', 'high,medium,low').split(',') as QualityTier[];
  const tracks = flagStr(flags, 'tracks', Object.keys(TRACKS).join(',')).split(',');
  const geoms = flagStr(flags, 'geoms', 'phone,desktop')
    .split(',')
    .map((g) => {
      const known = GEOMETRIES[g];
      if (known) return known;
      const m = /^(\d+)x(\d+)@([\d.]+)$/.exec(g);
      if (!m) throw new Error(`geometry ${g}: use phone | desktop | <w>x<h>@<dpr>`);
      return { name: g, cssW: +m[1]!, cssH: +m[2]!, dpr: +m[3]! };
    });
  // --quick: the loop-iteration preset (≈ 12 min at loadavg 30 on this host): phone geometry, b1 / h3 / e2, 300 frames, 6 GPU samples.
  const quick = flagBool(flags, 'quick');
  const opts: BenchOptions = {
    tiers,
    tracks: quick && !flags.tracks ? ['b1', 'h3', 'e2'] : tracks,
    geoms: quick && !flags.geoms ? [GEOMETRIES.phone!] : geoms,
    frames: flagNum(flags, 'frames', quick ? 300 : 600),
    gpuSamples: flagNum(flags, 'gpu-samples', quick ? 6 : 10),
    full: flagBool(flags, 'full'),
    label: flagStr(flags, 'label', ''),
    dev: flagBool(flags, 'dev'),
    build: flagBool(flags, 'build'),
    verbose: flagBool(flags, 'verbose'),
    drainEvery: flagNum(flags, 'drain-every', 30),
    sampleEvery: flagNum(flags, 'sample-every', 30),
  };
  const repeat = flagNum(flags, 'repeat', 1);
  const idleOn = !flagBool(flags, 'no-idle');
  const matrixOn = !flagBool(flags, 'no-matrix');
  const outDir = ensureOut('bench');
  const log = (l: string): void => console.log(l);
  const wall0 = performance.now();
  const { sha, dirty } = gitSha();
  const stale = distIsStale().stale && !opts.dev;
  if (stale && !opts.build) log(`WARNING dist/ predates a src edit — pass --build (results are of the built dist, not the working tree)`);
  const reportOnly = flagBool(flags, 'report-only');
  const server = reportOnly ? null : await startServer({ dev: opts.dev, forceBuild: opts.build, freeze: !opts.dev });
  const launched = reportOnly ? null : await launchBrowser({ width: 1280, height: 720, logConsole: opts.verbose });
  const all: RunResult[][] = [];
  const idleRows: LedgerRow[][] = [];
  try {
    for (let rep = 0; rep < repeat && server && launched; rep++) {
      if (repeat > 1) log(`== repeat ${rep + 1}/${repeat}`);
      if (idleOn) {
        const idle: IdleResult[] = await runIdle(launched.browser, server.url, { screens: ['garage', 'menu'], tiers: opts.tiers, liveMs: 2500, heldFrames: 120, sha, dirty, label: opts.label, verbose: opts.verbose }, log);
        idleRows.push(idle.map((i) => i.row));
        for (const i of idle) {
          writeJson(path.join(outDir, `${sha}-${i.row.key}${rep ? `-r${rep + 1}` : ''}.json`), { row: i.row, raw: i.raw });
          appendLedger(path.join(outDir, 'ledger.jsonl'), { ...i.row, repeat: rep + 1 });
        }
      }
      if (!matrixOn) continue;
      const results = await runMatrix(opts, log, server, launched);
      all.push(results);
      for (const r of results) {
        writeJson(path.join(outDir, `${r.sha}-${r.tier}-${r.track}-${r.geom.name}${rep ? `-r${rep + 1}` : ''}.json`), r);
        appendLedger(path.join(outDir, 'ledger.jsonl'), toLedgerRow(r, rep + 1));
      }
    }
  } finally {
    await launched?.close();
    await server?.close();
  }
  const ledger = readLedger(path.join(outDir, 'ledger.jsonl'));
  // latest.md = the newest row of every key at this sha (a partial re-run refreshes its rows, the rest stay).
  // Grouped by label when one is given (a named baseline can span the parent's commits), else by sha.
  const group = (r: LedgerRow): string => r.label || r.sha;
  const cur = opts.label || sha;
  const newest = new Map<string, LedgerRow>();
  for (const r of ledger) if (group(r) === cur && (!newest.has(r.key) || r.at > newest.get(r.key)!.at)) newest.set(r.key, r);
  const order = (k: string): number => (k.startsWith('idle-') ? 0 : 1) * 1000 + ['high', 'medium', 'low'].indexOf(k.replace(/^idle-\w+-/, '').split('-')[0]!) * 100 + Object.keys(TRACKS).indexOf(k.split('-')[1]!) + (k.endsWith('desktop') ? 50 : 0);
  const last = [...newest.values()].sort((a, b) => order(a.key) - order(b.key));
  const reps = repeat > 1 ? Array.from({ length: repeat }, (_, i) => [...(idleRows[i] ?? []), ...(all[i] ?? []).map((r) => toLedgerRow(r, 0))]) : null;
  const md = writeLatest(path.join(outDir, 'latest.md'), last, ledger, reps, {
    wallMin: (performance.now() - wall0) / 60000,
    full: opts.full,
    frames: opts.frames,
    gpuSamples: opts.gpuSamples,
  });
  console.log(md);
  console.log(`wrote ${path.join(outDir, 'latest.md')} (${((performance.now() - wall0) / 60000).toFixed(1)} min, loadavg ${os.loadavg().map((x) => x.toFixed(0)).join('/')})`);
  fs.writeFileSync(path.join(outDir, 'last-run.json'), JSON.stringify({ at: new Date().toISOString(), opts, repeat }, null, 2));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
