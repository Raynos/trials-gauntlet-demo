/**
 * CPU profile of the frame: `pnpm harness:bench:profile [--tiers high,low] [--track b1] [--frames 300] [--geom phone]`
 *
 * Replays the golden through the hook for `frames` frames with the V8 sampling profiler on
 * (CDP `Profiler`, 100 µs interval) and, in a second pass, the sampling heap profiler
 * (`HeapProfiler.startSampling` including objects collected by minor and major GC — every allocation
 * site, not the survivors). Drawn on a ¼-size canvas so SwiftShader's raster queue never blocks
 * the main thread mid-sample (CPU work is pixel-independent).
 *
 * Output: harness/out/bench/profile-<sha>-<tier>-<track>.json (raw) and profile-latest.md — the top
 * 20 self-time functions with file:line, the share of the sampled window each takes, and the top
 * allocation sites (bytes per frame, by stack top → its caller).
 */
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_PHYSICS_HZ, type QualityTier } from '../../src/core/types';
import { expandFrames } from '../../src/core/replay';
import { flagNum, flagStr, flagBool, parseArgs } from '../lib/args';
import { launchBrowser } from '../lib/browser';
import { chooseGolden } from '../lib/golden';
import { HookClient, openGame } from '../lib/hook';
import { REPO_ROOT } from '../lib/paths';
import { loadRecording } from '../lib/recording';
import { ensureOut, writeJson } from '../lib/report';
import { startServer } from '../lib/server';
import { GEOMETRIES, TRACKS } from './bench';
import { PAGE_BENCH_SRC } from './page';

// Minimal CDP shapes (playwright-core's protocol.d.ts is not hoisted under pnpm).
interface CallFrame {
  functionName: string;
  url: string;
  lineNumber: number;
}
interface ProfileNode {
  id: number;
  callFrame: CallFrame;
}
interface CpuProfile {
  nodes: ProfileNode[];
  samples?: number[];
  timeDeltas?: number[];
}
interface HeapNode {
  callFrame: CallFrame;
  selfSize: number;
  children: HeapNode[];
}
interface HeapProfile {
  head: HeapNode;
}

interface FnRow {
  fn: string;
  where: string;
  selfMs: number;
  pct: number;
  perFrameUs: number;
}

interface AllocRow {
  site: string;
  caller: string;
  bytes: number;
  bytesPerFrame: number;
  count: number;
}

function shortUrl(url: string): string {
  if (!url) return '(native)';
  try {
    const u = new URL(url);
    return u.pathname.split('/').slice(-1)[0] ?? url;
  } catch {
    return url;
  }
}

aggregateCpu.lastExcluded = [] as FnRow[];
function aggregateCpu(profile: CpuProfile, frames: number): { rows: FnRow[]; totalMs: number; byFile: { file: string; ms: number; pct: number }[] } {
  const byId = new Map<number, ProfileNode>();
  for (const n of profile.nodes) byId.set(n.id, n);
  const self = new Map<number, number>();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  let total = 0;
  for (let i = 0; i < samples.length; i++) {
    const dt = (deltas[i] ?? 0) / 1000;
    total += dt;
    self.set(samples[i]!, (self.get(samples[i]!) ?? 0) + dt);
  }
  const byFn = new Map<string, FnRow>();
  const byFile = new Map<string, number>();
  // The bench's own drain (`readPixels` every 30 frames) and shader-compile checks are not frame cost: list them apart, rank the rest.
  const EXCLUDE = new Set(['readPixels', 'getProgramInfoLog', 'getShaderInfoLog', 'getShaderParameter', 'getProgramParameter', '(idle)']);
  for (const [id, ms] of self) {
    const n = byId.get(id)!;
    const cf = n.callFrame;
    const fn = cf.functionName || '(anonymous)';
    const file = shortUrl(cf.url);
    const where = cf.url ? `${file}:${cf.lineNumber + 1}` : fn === '(garbage collector)' || fn === '(program)' || fn === '(idle)' ? '' : '(native)';
    const key = `${fn}@${where}`;
    const row = byFn.get(key) ?? { fn, where, selfMs: 0, pct: 0, perFrameUs: 0 };
    row.selfMs += ms;
    byFn.set(key, row);
    if (!(EXCLUDE.has(fn) && !cf.url)) byFile.set(file, (byFile.get(file) ?? 0) + ms);
  }
  const excluded = [...byFn.values()].filter((r) => EXCLUDE.has(r.fn) && r.where === '(native)' || r.fn === '(idle)');
  const kept = [...byFn.values()].filter((r) => !excluded.includes(r));
  const keptTotal = kept.reduce((a, r) => a + r.selfMs, 0);
  const rows = kept.sort((a, b) => b.selfMs - a.selfMs);
  for (const r of rows) {
    r.pct = keptTotal ? (r.selfMs / keptTotal) * 100 : 0;
    r.perFrameUs = (r.selfMs / frames) * 1000;
  }
  for (const r of excluded) r.perFrameUs = (r.selfMs / frames) * 1000;
  total = keptTotal;
  aggregateCpu.lastExcluded = excluded;
  const files = [...byFile.entries()].map(([file, ms]) => ({ file, ms, pct: total ? (ms / total) * 100 : 0 })).sort((a, b) => b.ms - a.ms);
  return { rows, totalMs: total, byFile: files };
}

function aggregateAlloc(profile: HeapProfile, frames: number): { rows: AllocRow[]; totalBytes: number } {
  const rows = new Map<string, AllocRow>();
  let total = 0;
  const walk = (n: HeapNode, parent: HeapNode | null): void => {
    if (n.selfSize > 0) {
      const cf = n.callFrame;
      const site = `${cf.functionName || '(anonymous)'} ${shortUrl(cf.url)}:${cf.lineNumber + 1}`;
      const pc = parent?.callFrame;
      const caller = pc ? `${pc.functionName || '(anonymous)'} ${shortUrl(pc.url)}:${pc.lineNumber + 1}` : '';
      const key = `${site}<${caller}`;
      const row = rows.get(key) ?? { site, caller, bytes: 0, bytesPerFrame: 0, count: 0 };
      row.bytes += n.selfSize;
      row.count += 1;
      rows.set(key, row);
      total += n.selfSize;
    }
    for (const c of n.children) walk(c, n);
  };
  walk(profile.head, null);
  const out = [...rows.values()].sort((a, b) => b.bytes - a.bytes);
  for (const r of out) r.bytesPerFrame = r.bytes / frames;
  return { rows: out, totalBytes: total };
}

async function main(): Promise<void> {
  const { flags } = parseArgs();
  const tiers = flagStr(flags, 'tiers', 'high,low').split(',') as QualityTier[];
  const track = flagStr(flags, 'track', 'b1');
  const trackId = TRACKS[track] ?? track;
  const frames = flagNum(flags, 'frames', 300);
  const geom = GEOMETRIES[flagStr(flags, 'geom', 'phone')] ?? GEOMETRIES.phone!;
  const tpf = DEFAULT_PHYSICS_HZ / 60;
  const sha = (() => {
    try {
      return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    } catch {
      return 'nogit';
    }
  })();
  const golden = chooseGolden(trackId);
  if (!golden) throw new Error(`no golden for ${trackId}`);
  const inputs = expandFrames(loadRecording(golden.file)).slice(0, frames * tpf);
  const outDir = ensureOut('bench');
  const md: string[] = [`# Frame CPU profile — ${sha} — ${trackId} @ ${geom.name} (¼ canvas), ${frames} frames, loadavg ${os.loadavg()[0]!.toFixed(0)}`, ''];
  // Vite dev server by default: unminified modules, real function names (`--dist` profiles the build).
  const dist = flagBool(flags, 'dist');
  const server = await startServer(dist ? { forceBuild: flagBool(flags, 'build'), freeze: true } : { dev: true });
  const launched = await launchBrowser({ width: geom.cssW, height: geom.cssH });
  try {
    const { page } = launched;
    await openGame(page, server.url);
    await page.evaluate(PAGE_BENCH_SRC);
    const hook = new HookClient(page);
    const cdp = await page.context().newCDPSession(page);
    for (const tier of tiers) {
      // -- CPU sampling profile --
      await hook.loadTrack(trackId);
      await page.evaluate(([t, w, h, d]) => window.__bench!.setTier(t as QualityTier, w as number, h as number, d as number), [tier, Math.round(geom.cssW / 4), Math.round(geom.cssH / 4), geom.dpr] as const);
      await page.evaluate(() => window.__bench!.install());
      await page.evaluate(() => window.__bench!.warm(30));
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
      await cdp.send('Profiler.start');
      const cpu = await page.evaluate(([ins, k, n]) => window.__bench!.cpuPass(ins as unknown[], k as number, n as number, 30, 1e9, 1e9), [inputs, tpf, frames] as const);
      const { profile } = (await cdp.send('Profiler.stop')) as { profile: CpuProfile };
      await cdp.send('Profiler.disable');
      const agg = aggregateCpu(profile, frames);
      // -- allocation sampling profile --
      await hook.loadTrack(trackId);
      await page.evaluate(([t, w, h, d]) => window.__bench!.setTier(t as QualityTier, w as number, h as number, d as number), [tier, Math.round(geom.cssW / 4), Math.round(geom.cssH / 4), geom.dpr] as const);
      await page.evaluate(() => window.__bench!.warm(30));
      await cdp.send('HeapProfiler.enable');
      await cdp.send('HeapProfiler.collectGarbage');
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: 512, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      await page.evaluate(([ins, k, n]) => window.__bench!.cpuPass(ins as unknown[], k as number, n as number, 30, 1e9, 1e9), [inputs, tpf, frames] as const);
      const { profile: heap } = (await cdp.send('HeapProfiler.stopSampling')) as { profile: HeapProfile };
      const alloc = aggregateAlloc(heap, frames);
      const submit = (() => {
        const n = 15;
        const col: number[] = [];
        for (let r = 0; r < cpu.frames; r++) col.push(cpu.data[r * n + 1]!);
        col.sort((a, b) => a - b);
        return col[col.length >> 1]!;
      })();
      writeJson(path.join(outDir, `profile-${sha}-${tier}-${track}.json`), { sha, tier, trackId, frames, geom, submitP50: submit, cpu: agg, alloc: { totalBytes: alloc.totalBytes, rows: alloc.rows.slice(0, 60) }, loadavg: os.loadavg() });
      md.push(`## ${tier} — sampled ${agg.totalMs.toFixed(0)} ms of JS + GL submit over ${frames} frames (${(agg.totalMs / frames).toFixed(2)} ms/frame incl. physics + measurement; render() p50 ${submit.toFixed(2)} ms) · allocations ${(alloc.totalBytes / 1048576).toFixed(1)} MB = ${(alloc.totalBytes / frames / 1024).toFixed(1)} KB/frame · excluded from the ranking: ${aggregateCpu.lastExcluded.map((r) => `${r.fn} ${r.selfMs.toFixed(0)} ms`).join(', ')}`);
      md.push('');
      md.push('| # | self ms | % | µs/frame | function | where |');
      md.push('|---|---|---|---|---|---|');
      agg.rows.slice(0, 20).forEach((r, i) => md.push(`| ${i + 1} | ${r.selfMs.toFixed(1)} | ${r.pct.toFixed(1)} | ${r.perFrameUs.toFixed(0)} | \`${r.fn}\` | ${r.where} |`));
      md.push('');
      md.push('By file: ' + agg.byFile.slice(0, 8).map((f) => `${f.file} ${f.pct.toFixed(0)} %`).join(' · '));
      md.push('');
      md.push('| # | KB/frame | count | allocation site | caller |');
      md.push('|---|---|---|---|---|');
      alloc.rows.slice(0, 20).forEach((r, i) => md.push(`| ${i + 1} | ${(r.bytesPerFrame / 1024).toFixed(2)} | ${r.count} | \`${r.site}\` | ${r.caller} |`));
      md.push('');
      console.log(md.slice(-26 - alloc.rows.slice(0, 20).length).join('\n'));
    }
    await cdp.detach();
  } finally {
    await launched.close();
    await server.close();
  }
  const file = path.join(outDir, 'profile-latest.md');
  const fs = await import('node:fs');
  fs.writeFileSync(file, md.join('\n') + '\n');
  console.log(`wrote ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
