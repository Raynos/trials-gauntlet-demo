/**
 * Render/physics cost under simulated play with the following camera.
 *
 *   pnpm harness:perf [--seconds 10] [--fps 60] [--width 1280] [--height 720]
 *                     [--track flat-test] [--json] [--dev]
 *
 * Timing is measured *in page* with performance.now around renderer.render
 * and around physics stepping — never from screenshot wall clock. SwiftShader
 * is a CPU rasterizer, so absolute ms are pessimistic; the GPU-independent
 * numbers (draw calls, triangles, textures, programs) are the ones to trend.
 */
import path from 'node:path';
import { DEFAULT_PHYSICS_HZ } from '../src/core/types';
import { expandFrames } from '../src/core/replay';
import { seedFromString } from '../src/core/rng';
import { flagBool, flagNum, flagStr, parseArgs } from './lib/args';
import { launchBrowser } from './lib/browser';
import { HookClient, openGame, readHeap } from './lib/hook';
import { ensureOut, mb, percentile, printKV, writeJson } from './lib/report';
import { startServer } from './lib/server';
import { synthesizeRecording } from './lib/synth';

async function main(): Promise<void> {
  const { flags } = parseArgs();
  const seconds = flagNum(flags, 'seconds', 10);
  const fps = flagNum(flags, 'fps', 60);
  const width = flagNum(flags, 'width', 1280);
  const height = flagNum(flags, 'height', 720);
  const trackId = flagStr(flags, 'track', 'flat-test');
  const hz = DEFAULT_PHYSICS_HZ;
  if (hz % fps !== 0) throw new Error(`physicsHz ${hz} must be a multiple of fps ${fps}`);
  const ticksPerFrame = hz / fps;

  const rec = synthesizeRecording({ trackId, seed: seedFromString(trackId), physicsHz: hz, seconds, style: 'wiggle' });
  const frames = expandFrames(rec);

  const server = await startServer({ dev: flagBool(flags, 'dev'), forceBuild: flagBool(flags, 'build') });
  const launched = await launchBrowser({ width, height, logConsole: flagBool(flags, 'verbose') });
  try {
    const { page } = launched;
    await openGame(page, server.url);
    const hook = new HookClient(page);
    await hook.loadTrack(trackId);
    await hook.resize(width, height);
    // Warm-up: shader compile + first-frame allocations are not steady state.
    for (let i = 0; i < 5; i++) await hook.render();
    const heapBefore = await readHeap(page);

    // Run in chunks of one simulated second to keep evaluate payloads small.
    const renderMs: number[] = [];
    const syncMs: number[] = [];
    const physicsMs: number[] = [];
    const chunk = fps;
    const totalFrames = Math.floor(frames.length / ticksPerFrame);
    for (let start = 0; start < totalFrames; start += chunk) {
      const end = Math.min(totalFrames, start + chunk);
      const inputs = frames.slice(start * ticksPerFrame, end * ticksPerFrame);
      const r = await page.evaluate(
        ([ins, tpf]) => {
          const t = window.__rockhop!;
          const rm: number[] = [];
          const sm: number[] = [];
          const pm: number[] = [];
          for (let i = 0; i < ins.length; i += tpf) {
            const p0 = performance.now();
            for (let j = i; j < i + tpf && j < ins.length; j++) {
              t.setInput(ins[j]!);
              t.step(1);
            }
            pm.push(performance.now() - p0);
            // Submit-only cost first, then a synced frame that includes the raster work.
            rm.push(t.render(false));
            sm.push(t.render(true));
          }
          return { rm, sm, pm };
        },
        [inputs, ticksPerFrame] as const,
      );
      renderMs.push(...r.rm);
      syncMs.push(...r.sm);
      physicsMs.push(...r.pm);
    }
    const heapAfter = await readHeap(page);
    const stats = await hook.stats();
    const state = await hook.getState();

    const sorted = [...renderMs].sort((a, b) => a - b);
    const psorted = [...physicsMs].sort((a, b) => a - b);
    const ssorted = [...syncMs].sort((a, b) => a - b);
    const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);
    const report = {
      config: { seconds, fps, width, height, trackId, physicsHz: hz, ticksPerFrame, frames: renderMs.length },
      webgl: launched.probe,
      render: {
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        max: sorted[sorted.length - 1] ?? 0,
        mean: renderMs.length ? sum(renderMs) / renderMs.length : 0,
      },
      renderSynced: {
        p50: percentile(ssorted, 50),
        p95: percentile(ssorted, 95),
        p99: percentile(ssorted, 99),
        max: ssorted[ssorted.length - 1] ?? 0,
        mean: syncMs.length ? sum(syncMs) / syncMs.length : 0,
      },
      physicsPerFrame: {
        p50: percentile(psorted, 50),
        p95: percentile(psorted, 95),
        p99: percentile(psorted, 99),
        perTickMeanUs: physicsMs.length ? (sum(physicsMs) / physicsMs.length / ticksPerFrame) * 1000 : 0,
      },
      heap: { before: heapBefore.jsHeapUsed, after: heapAfter.jsHeapUsed, growth: heapAfter.jsHeapUsed - heapBefore.jsHeapUsed },
      gpuIndependent: {
        drawCalls: stats.calls,
        triangles: stats.triangles,
        lines: stats.lines,
        points: stats.points,
        geometries: stats.geometries,
        textures: stats.textures,
        texturesMB: stats.texturesMB,
        programs: stats.programs,
      },
      finalState: { tick: state.tick, x: state.bike.pos.x, finished: state.finished, finishTime: state.finishTime },
    };
    const outFile = path.join(ensureOut('perf'), 'perf.json');
    writeJson(outFile, report);
    if (flagBool(flags, 'json')) console.log(JSON.stringify(report));
    else {
      printKV('config', { ...report.config });
      printKV('webgl', { renderer: launched.probe.renderer, context: launched.probe.kind });
      printKV('render ms — CPU submit only (three + WebGL command encoding)', {
        p50: report.render.p50.toFixed(2),
        p95: report.render.p95.toFixed(2),
        p99: report.render.p99.toFixed(2),
        max: report.render.max.toFixed(2),
        mean: report.render.mean.toFixed(2),
      });
      printKV('render ms — synced via readPixels (SwiftShader CPU raster, pessimistic)', {
        p50: report.renderSynced.p50.toFixed(2),
        p95: report.renderSynced.p95.toFixed(2),
        p99: report.renderSynced.p99.toFixed(2),
        max: report.renderSynced.max.toFixed(2),
        mean: report.renderSynced.mean.toFixed(2),
      });
      printKV('physics ms per video frame', {
        p50: report.physicsPerFrame.p50.toFixed(3),
        p95: report.physicsPerFrame.p95.toFixed(3),
        p99: report.physicsPerFrame.p99.toFixed(3),
        'per tick mean (us)': report.physicsPerFrame.perTickMeanUs.toFixed(1),
      });
      printKV('heap', { before: mb(report.heap.before), after: mb(report.heap.after), growth: mb(report.heap.growth) });
      printKV('gpu-independent', { ...report.gpuIndependent, texturesMB: report.gpuIndependent.texturesMB.toFixed(2) });
      console.log(`report: ${outFile}`);
    }
  } finally {
    await launched.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
