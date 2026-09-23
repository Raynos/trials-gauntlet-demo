/**
 * Camera probe (render round 15): drive a recording through the page like `harness/capture.ts` but
 * grab no pixels — per rendered frame record the rig's `camera()` (dist, bikeHeightFrac, bike screen
 * x / y, yaw, pitch, state, clamped, fovBoost) and `debugInfo().occluder` (query ms, tested, hits).
 * Prints the landing / air / lead beats as they happen so a motion-table change is measurable
 * without a critic.
 *
 *   pnpm exec tsx harness/bench/camprobe.ts <recording> [--from-tick N] [--to-tick N] [--fps 60]
 *        [--quality high] [--width 1280] [--height 720] [--out file.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandFrames } from '../../src/core/replay';
import { flagNum, flagStr, parseArgs } from '../lib/args';
import { launchBrowser } from '../lib/browser';
import { HookClient, openGame } from '../lib/hook';
import { loadRecording } from '../lib/recording';
import { fail } from '../lib/report';
import { startServer } from '../lib/server';
import type { InputFrame, QualityTier } from '../../src/core/types';

interface Row {
  frame: number;
  tick: number;
  t: number;
  x: number;
  y: number;
  speed: number;
  air: boolean;
  dist: number;
  hf: number;
  sx: number;
  sy: number;
  yaw: number;
  pitch: number;
  state: string;
  clamped: boolean;
  fovBoost: number;
  occMs: number;
  occTested: number;
  occHits: number;
  occCount: number;
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const file = positional[0];
  if (!file) fail('usage: camprobe.ts <recording> [--from-tick N] [--to-tick N] [--fps 60] [--quality high] [--out file.json]');
  const rec = loadRecording(path.resolve(file));
  const frames: InputFrame[] = expandFrames(rec);
  const hz = rec.header.physicsHz;
  const fps = flagNum(flags, 'fps', 60);
  const ticksPerFrame = Math.max(1, Math.round(hz / fps));
  const width = flagNum(flags, 'width', 1280);
  const height = flagNum(flags, 'height', 720);
  const quality = flagStr(flags, 'quality', 'high') as QualityTier;
  const from = Math.max(0, Math.floor(flagNum(flags, 'from-tick', 0) / ticksPerFrame) * ticksPerFrame);
  const to = Math.min(frames.length, flagNum(flags, 'to-tick', frames.length));
  const out = flagStr(flags, 'out', '');

  const server = await startServer({ dev: false, forceBuild: false });
  const launched = await launchBrowser({ width, height, logConsole: false });
  const rows: Row[] = [];
  try {
    const { page } = launched;
    await openGame(page, server.url);
    const hook = new HookClient(page);
    if (rec.header.bike && rec.header.bike !== 'rookie') await hook.setBike(rec.header.bike);
    if (!(await hook.loadTrack(rec.header.trackId, rec.header.seed))) throw new Error(`unknown track ${rec.header.trackId}`);
    await hook.resize(width, height);
    await hook.setQuality(quality);
    for (let t = 0; t < from; t += hz * 5) {
      const slice = frames.slice(t, Math.min(from, t + hz * 5));
      await page.evaluate((inputs) => {
        const tr = window.__rockhop!;
        for (const f of inputs) {
          tr.setInput(f);
          tr.step(1);
        }
      }, slice);
    }
    for (let k = from / ticksPerFrame; k * ticksPerFrame < to; k++) {
      const slice = frames.slice(k * ticksPerFrame, (k + 1) * ticksPerFrame);
      const r = await page.evaluate(
        ([inputs, n]) => {
          const tr = window.__rockhop!;
          for (const f of inputs) {
            tr.setInput(f);
            tr.step(1);
          }
          if (inputs.length < n) tr.step(n - inputs.length);
          tr.render();
          const s = tr.getState();
          /* oxlint-disable typescript/no-explicit-any -- private renderer handles, as capture.ts */
          const c = (tr as any).camera() as Record<string, number | string | boolean>;
          const d = (window as any).__render?.debugInfo?.() as { occluder?: { ms: number; tested: number; hits: number; count: number } } | undefined;
          /* oxlint-enable typescript/no-explicit-any */
          const o = d?.occluder ?? { ms: 0, tested: 0, hits: 0, count: 0 };
          return {
            tick: s.tick,
            t: s.time,
            x: s.bike.pos.x,
            y: s.bike.pos.y,
            speed: Math.hypot(s.bike.vel.x, s.bike.vel.y),
            air: !s.wheels.rear.grounded && !s.wheels.front.grounded,
            dist: c.dist as number,
            hf: c.bikeHeightFrac as number,
            sx: c.bikeScreenX as number,
            sy: c.bikeScreenY as number,
            yaw: c.yaw as number,
            pitch: c.pitch as number,
            state: String(c.state),
            clamped: c.clamped === true,
            fovBoost: (c.fovBoostDeg as number) ?? 0,
            occMs: o.ms,
            occTested: o.tested,
            occHits: o.hits,
            occCount: o.count,
          };
        },
        [slice, ticksPerFrame] as const,
      );
      rows.push({ frame: k - from / ticksPerFrame, ...r });
    }
  } finally {
    await launched.close();
    await server.close();
  }
  // Beats.
  let prevAir = false;
  let airStart = -1;
  const lines: string[] = [];
  let maxOcc = 0;
  let sumOcc = 0;
  let hitFrames = 0;
  let maxYawStep = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    sumOcc += r.occMs;
    if (r.occMs > maxOcc) maxOcc = r.occMs;
    if (r.occHits > 0) hitFrames++;
    if (i > 0) maxYawStep = Math.max(maxYawStep, Math.abs(r.yaw - rows[i - 1]!.yaw));
    if (r.air && !prevAir) airStart = r.t;
    if (!r.air && prevAir && airStart >= 0) {
      const airS = r.t - airStart;
      const before = rows[Math.max(0, i - 1)]!;
      const seq = rows.slice(i, i + 60).map((q) => q.dist.toFixed(1));
      lines.push(`touchdown f${r.frame} t=${r.t.toFixed(2)} air ${airS.toFixed(2)} s: dist before ${before.dist.toFixed(2)} → next 1.0 s [${seq.filter((_, j) => j % 6 === 0).join(' ')}] sy ${before.sy.toFixed(3)} → ${rows[Math.min(rows.length - 1, i + 18)]!.sy.toFixed(3)}`);
    }
    prevAir = r.air;
  }
  const riding = rows.filter((r) => r.state !== 'crash' && r.state !== 'finish' && r.state !== 'countdown');
  const sx = riding.map((r) => r.sx);
  const sy = riding.map((r) => r.sy);
  const hf = riding.map((r) => r.hf);
  const summary = {
    recording: file,
    track: rec.header.trackId,
    frames: rows.length,
    from,
    to,
    bikeScreenX: [Math.min(...sx), Math.max(...sx)],
    bikeScreenY: [Math.min(...sy), Math.max(...sy)],
    heightFrac: [Math.min(...hf), Math.max(...hf)],
    dist: [Math.min(...rows.map((r) => r.dist)), Math.max(...rows.map((r) => r.dist))],
    clamped: rows.filter((r) => r.clamped).length,
    maxYawStepDeg: (maxYawStep * 180) / Math.PI,
    occluder: { count: rows[0]?.occCount ?? 0, meanMs: sumOcc / Math.max(1, rows.length), maxMs: maxOcc, hitFrames, maxTested: Math.max(...rows.map((r) => r.occTested)) },
    beats: lines,
  };
  console.log(JSON.stringify(summary, null, 1));
  if (out) fs.writeFileSync(out, JSON.stringify({ summary, rows }, null, 0));
}

const isEntry = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) main().catch((e) => fail(String(e instanceof Error ? e.stack ?? e.message : e)));
