/**
 * Normalize clips for blind A/B comparison (docs/design/harness-metrics.md §4.1).
 *
 * Both clips -> same size (letterbox, never stretch), same fps, h264 yuv420p,
 * silent, and exactly the same frame count. ffprobe asserts the last part.
 *
 * CLI: tsx harness/compare/normalize.ts <a.mp4> <b.mp4> [--out dir] [--align a:b] [--fps 30] [--width 640] [--height 360]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flagNum, flagStr, parseArgs } from '../lib/args';
import { probeVideo, resolveFfmpeg } from '../lib/ffmpeg';
import { fail, printKV } from '../lib/report';
import { runFfmpeg } from './ffrun';

export interface NormalizeOptions {
  /** Output length in seconds; the encoder is capped at round(durationS * fps) frames. */
  durationS: number;
  fps?: number;
  width?: number;
  height?: number;
  /** Source time to start at. May be negative: the first frame is cloned to fill. */
  startS?: number;
}

export const DEFAULT_FPS = 30;
export const DEFAULT_WIDTH = 640;
export const DEFAULT_HEIGHT = 360;

/** Anchor window around an align time (impact / GO / touchdown), seconds. */
export const ALIGN_BEFORE_S = 1.0;
export const ALIGN_AFTER_S = 2.5;

export function frameCountFor(durationS: number, fps: number): number {
  return Math.max(1, Math.round(durationS * fps));
}

/**
 * Re-encode one clip: trim, letterbox, constant fps, strip audio. If the source
 * runs out before `durationS`, the last frame is cloned so the frame count is
 * still exact.
 */
export async function normalizeClip(input: string, out: string, opts: NormalizeOptions): Promise<void> {
  const fps = opts.fps ?? DEFAULT_FPS;
  const width = opts.width ?? DEFAULT_WIDTH;
  const height = opts.height ?? DEFAULT_HEIGHT;
  const startS = opts.startS ?? 0;
  const frames = frameCountFor(opts.durationS, fps);

  const vf: string[] = [];
  if (startS < 0) vf.push(`tpad=start_mode=clone:start_duration=${(-startS).toFixed(3)}`);
  vf.push(
    `fps=${fps}`,
    `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=bicubic`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    'setsar=1',
    `tpad=stop_mode=clone:stop_duration=${opts.durationS.toFixed(3)}`,
  );

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  if (startS > 0) args.push('-ss', startS.toFixed(3));
  args.push(
    '-i', input,
    '-an',
    '-vf', vf.join(','),
    '-frames:v', String(frames),
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-r', String(fps),
    out,
  );
  await runFfmpeg(resolveFfmpeg(), args);
}

export interface NormalizePairOptions {
  /** Anchor time in clip A (seconds). Both anchors required to use the align window. */
  alignA?: number;
  alignB?: number;
  fps?: number;
  width?: number;
  height?: number;
  /** Basenames for the outputs inside outDir. */
  nameA?: string;
  nameB?: string;
}

export interface NormalizedPair {
  a: string;
  b: string;
  durationS: number;
  frames: number;
  fps: number;
  width: number;
  height: number;
  startA: number;
  startB: number;
}

/**
 * Normalize two clips to identical length. Length = min(len(a), len(b)) unless
 * both align anchors are given, then each clip is cut to [t0 - 1.0, t0 + 2.5].
 */
export async function normalizePair(a: string, b: string, outDir: string, opts: NormalizePairOptions = {}): Promise<NormalizedPair> {
  const fps = opts.fps ?? DEFAULT_FPS;
  const width = opts.width ?? DEFAULT_WIDTH;
  const height = opts.height ?? DEFAULT_HEIGHT;
  for (const f of [a, b]) if (!fs.existsSync(f)) throw new Error(`normalizePair: missing input ${f}`);

  let durationS: number;
  let startA = 0;
  let startB = 0;
  if (opts.alignA !== undefined && opts.alignB !== undefined) {
    durationS = ALIGN_BEFORE_S + ALIGN_AFTER_S;
    startA = opts.alignA - ALIGN_BEFORE_S;
    startB = opts.alignB - ALIGN_BEFORE_S;
  } else {
    const [pa, pb] = await Promise.all([probeVideo(a), probeVideo(b)]);
    if (!pa || !pb) throw new Error('normalizePair: ffprobe unavailable or unreadable input');
    durationS = Math.min(pa.durationSec, pb.durationSec);
    if (!(durationS > 0)) throw new Error(`normalizePair: non-positive duration (${pa.durationSec}, ${pb.durationSec})`);
  }
  // Snap to whole frames so both encoders get the same -frames:v.
  const frames = frameCountFor(durationS, fps);
  durationS = frames / fps;

  fs.mkdirSync(outDir, { recursive: true });
  const outA = path.join(outDir, opts.nameA ?? 'norm-a.mp4');
  const outB = path.join(outDir, opts.nameB ?? 'norm-b.mp4');
  await normalizeClip(a, outA, { durationS, fps, width, height, startS: startA });
  await normalizeClip(b, outB, { durationS, fps, width, height, startS: startB });

  const [qa, qb] = await Promise.all([probeVideo(outA), probeVideo(outB)]);
  if (!qa || !qb) throw new Error('normalizePair: ffprobe failed on outputs');
  if (qa.frames !== qb.frames) {
    throw new Error(`normalizePair: frame count mismatch a=${qa.frames} b=${qb.frames} (expected ${frames})`);
  }
  if (qa.frames !== frames) {
    throw new Error(`normalizePair: got ${qa.frames} frames, expected ${frames}`);
  }
  if (qa.width !== width || qa.height !== height || qb.width !== width || qb.height !== height) {
    throw new Error(`normalizePair: size mismatch a=${qa.width}x${qa.height} b=${qb.width}x${qb.height}`);
  }
  return { a: outA, b: outB, durationS, frames, fps, width, height, startA, startB };
}

/** Parse `--align a:b` into two seconds values. */
export function parseAlign(s: string | undefined): { alignA: number; alignB: number } | null {
  if (!s) return null;
  const [x, y] = s.split(':');
  const alignA = Number(x);
  const alignB = Number(y);
  if (!Number.isFinite(alignA) || !Number.isFinite(alignB)) throw new Error(`--align must be <a_s>:<b_s>, got ${s}`);
  return { alignA, alignB };
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs();
  const [a, b] = positional;
  if (!a || !b) fail('usage: normalize.ts <a.mp4> <b.mp4> [--out dir] [--align a:b] [--fps 30] [--width 640] [--height 360]');
  const outDir = flagStr(flags, 'out', path.join(process.cwd(), 'harness', 'out', 'compare', 'norm'));
  const align = parseAlign(typeof flags['align'] === 'string' ? flags['align'] : undefined);
  const res = await normalizePair(a, b, outDir, {
    ...(align ?? {}),
    fps: flagNum(flags, 'fps', DEFAULT_FPS),
    width: flagNum(flags, 'width', DEFAULT_WIDTH),
    height: flagNum(flags, 'height', DEFAULT_HEIGHT),
  });
  printKV('normalized', {
    a: res.a,
    b: res.b,
    frames: res.frames,
    durationS: res.durationS.toFixed(3),
    size: `${res.width}x${res.height}@${res.fps}`,
    startA: res.startA,
    startB: res.startB,
  });
}

const isEntry = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
}
