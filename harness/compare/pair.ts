/**
 * Build one blind A/B pair (docs/design/harness-metrics.md §4.2).
 *
 *   tsx harness/compare/pair.ts <ours.mp4> <ref.mp4> --tag <manoeuvre> [--seed N] [--mask] [--align a:b] [--out harness/out/compare]
 *
 * Outputs in <out>/:
 *   pair-<id>.mp4          1280x384: 24 px label bar (A = one square, left; B = two squares, right;
 *                          thin 16-segment clock along the bar's bottom edge) over the hstacked clips
 *   pair-<id>-sheet.jpg    2 rows x 8 frames at identical timestamps; row 1 = A (left), row 2 = B (right)
 *   pair-<id>.answer.json  PairAnswer, chmod 000 so a critic cannot read which side is ours
 *
 * Last three stdout lines: `pair: <mp4>`, `sheet: <jpg>`, `id: <id>`.
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Rng } from '../../src/core/rng';
import { flagBool, flagNum, flagStr, parseArgs } from '../lib/args';
import { contactSheet, probeVideo, resolveFfmpeg } from '../lib/ffmpeg';
import { OUT_DIR } from '../lib/paths';
import { fail, printKV, writeJson } from '../lib/report';
import type { PairAnswer } from '../lib/schema';
import { evenFrameIndices, extractFrames, runFfmpeg } from './ffrun';
import { DEFAULT_HUD_REGIONS, maskHud, type HudRegion } from './mask';
import { normalizePair, parseAlign, type NormalizedPair } from './normalize';

export const LABEL_BAR_PX = 24;
export const SHEET_COLS = 8;
export const CLOCK_SEGMENTS = 16;

export interface PairOptions {
  tag: string;
  seed?: number;
  mask?: boolean;
  maskRegions?: readonly HudRegion[];
  alignOurs?: number;
  alignRef?: number;
  outDir?: string;
}

export interface PairResult {
  id: string;
  seed: number;
  left: 'ours' | 'ref';
  pairMp4: string;
  sheet: string;
  answerFile: string;
  normalized: NormalizedPair;
  pairFrames: number;
}

/** `<tag>-<yyyymmdd-hhmmss>-<4hex>` */
export function makePairId(tag: string, now = new Date()): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  const safeTag = tag.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  return `${safeTag}-${stamp}-${randomBytes(2).toString('hex')}`;
}

/** The coin. Same seed -> same side, so a run is reproducible. */
export function coinLeft(seed: number): 'ours' | 'ref' {
  return new Rng(seed).next() < 0.5 ? 'ours' : 'ref';
}

/**
 * Label bar + hstack filter. The bar is text-free (this ffmpeg has no drawtext):
 *   left half  darker grey, ONE white square at the far left   -> A
 *   right half lighter grey, TWO white squares at its far left -> B
 *   1 px light divider between the halves; bottom 3 px of the bar fill left->right as a clock.
 */
export function pairFilter(width: number, height: number, durationS: number): string {
  const W = width * 2;
  const bar = LABEL_BAR_PX;
  const sq = 12;
  const sy = Math.floor((bar - sq) / 2) - 1;
  const boxes: string[] = [
    `drawbox=x=0:y=0:w=${width}:h=${bar}:color=0x2a2e33@1:t=fill`,
    `drawbox=x=${width}:y=0:w=${width}:h=${bar}:color=0x44494f@1:t=fill`,
    `drawbox=x=${width - 1}:y=0:w=2:h=${bar + height}:color=0xd0d4d8@1:t=fill`,
    // A: one square
    `drawbox=x=10:y=${sy}:w=${sq}:h=${sq}:color=white@1:t=fill`,
    // B: two squares
    `drawbox=x=${width + 10}:y=${sy}:w=${sq}:h=${sq}:color=white@1:t=fill`,
    `drawbox=x=${width + 10 + sq + 6}:y=${sy}:w=${sq}:h=${sq}:color=white@1:t=fill`,
  ];
  const segW = W / CLOCK_SEGMENTS;
  for (let k = 0; k < CLOCK_SEGMENTS; k++) {
    const at = ((k * durationS) / CLOCK_SEGMENTS).toFixed(4);
    boxes.push(
      `drawbox=x=${Math.round(k * segW)}:y=${bar - 3}:w=${Math.round(segW) - 1}:h=3:color=0xffd166@1:t=fill:enable='gte(t\\,${at})'`,
    );
  }
  return [
    '[0:v]setpts=PTS-STARTPTS[a]',
    '[1:v]setpts=PTS-STARTPTS[b]',
    '[a][b]hstack=inputs=2[row]',
    `[row]pad=${W}:${height + bar}:0:${bar}:color=0x2a2e33[p]`,
    `[p]${boxes.join(',')}[out]`,
  ].join(';');
}

export async function buildPair(ours: string, ref: string, opts: PairOptions): Promise<PairResult> {
  const outDir = opts.outDir ?? path.join(OUT_DIR, 'compare');
  const seed = opts.seed ?? (Date.now() >>> 0);
  const id = makePairId(opts.tag);
  const work = path.join(outDir, 'work', id);
  fs.mkdirSync(work, { recursive: true });

  const alignOpts =
    opts.alignOurs !== undefined && opts.alignRef !== undefined ? { alignA: opts.alignOurs, alignB: opts.alignRef } : {};
  const normalized = await normalizePair(ours, ref, work, { ...alignOpts, nameA: 'ours-norm.mp4', nameB: 'ref-norm.mp4' });

  let oursClip = normalized.a;
  let refClip = normalized.b;
  if (opts.mask) {
    const regions = opts.maskRegions ?? DEFAULT_HUD_REGIONS;
    oursClip = path.join(work, 'ours-masked.mp4');
    refClip = path.join(work, 'ref-masked.mp4');
    await Promise.all([maskHud(normalized.a, oursClip, regions), maskHud(normalized.b, refClip, regions)]);
  }

  const left = coinLeft(seed);
  const leftClip = left === 'ours' ? oursClip : refClip;
  const rightClip = left === 'ours' ? refClip : oursClip;

  const pairMp4 = path.join(outDir, `pair-${id}.mp4`);
  await runFfmpeg(resolveFfmpeg(), [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', leftClip,
    '-i', rightClip,
    '-filter_complex', pairFilter(normalized.width, normalized.height, normalized.durationS),
    '-map', '[out]',
    '-frames:v', String(normalized.frames),
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-r', String(normalized.fps),
    pairMp4,
  ]);
  const probe = await probeVideo(pairMp4);
  if (!probe) throw new Error('pair: ffprobe failed on pair mp4');
  if (probe.frames !== normalized.frames) throw new Error(`pair: ${probe.frames} frames, expected ${normalized.frames}`);

  // Sheet: identical frame indices in both clips; row 1 = A (left), row 2 = B (right).
  const idx = evenFrameIndices(normalized.frames, SHEET_COLS);
  const framesA = await extractFrames(leftClip, work, 'a', idx);
  const framesB = await extractFrames(rightClip, work, 'b', idx);
  const sheet = path.join(outDir, `pair-${id}-sheet.jpg`);
  await contactSheet({ frames: [...framesA, ...framesB], out: sheet, cols: SHEET_COLS, rows: 2, tileWidth: 320 });

  const answer: PairAnswer = {
    pairId: id,
    tag: opts.tag,
    seed,
    left,
    ours: path.resolve(ours),
    ref: path.resolve(ref),
    pairMp4,
    sheet,
    createdAt: new Date().toISOString(),
  };
  const answerFile = path.join(outDir, `pair-${id}.answer.json`);
  writeJson(answerFile, answer);
  fs.chmodSync(answerFile, 0o000);

  return { id, seed, left, pairMp4, sheet, answerFile, normalized, pairFrames: probe.frames };
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs();
  const [ours, ref] = positional;
  if (!ours || !ref) fail('usage: pair.ts <ours.mp4> <ref.mp4> --tag <manoeuvre> [--seed N] [--mask] [--align a:b] [--out dir]');
  const tag = flagStr(flags, 'tag', '');
  if (!tag) fail('--tag <manoeuvre> is required (see harness/compare/RUBRIC.md for the tag list)');
  const align = parseAlign(typeof flags['align'] === 'string' ? flags['align'] : undefined);
  const seed = flagNum(flags, 'seed', Date.now() >>> 0);

  const res = await buildPair(ours, ref, {
    tag,
    seed,
    mask: flagBool(flags, 'mask'),
    outDir: path.resolve(flagStr(flags, 'out', path.join(OUT_DIR, 'compare'))),
    ...(align ? { alignOurs: align.alignA, alignRef: align.alignB } : {}),
  });

  // Never print `left` here: this stdout may be shown to the critic.
  printKV('pair', {
    id: res.id,
    tag,
    seed: res.seed,
    frames: res.pairFrames,
    durationS: res.normalized.durationS.toFixed(3),
    size: `${res.normalized.width * 2}x${res.normalized.height + LABEL_BAR_PX}@${res.normalized.fps}`,
    mask: flagBool(flags, 'mask'),
    align: align ? `${align.alignA}:${align.alignB}` : 'min-length',
    answer: `${res.answerFile} (chmod 000)`,
  });
  console.log(`pair: ${res.pairMp4}`);
  console.log(`sheet: ${res.sheet}`);
  console.log(`id: ${res.id}`);
}

const isEntry = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
}
