/**
 * Blind AUDIO A/B pairs (harness round 11; docs/design/audio.md §10.5 / §10.8 "harness" request).
 *
 *   pnpm harness:audio [--seed N] [--coin balanced|plain] [--lowpass 14000] [--bike pro] [--beats-only | --pairs-only]
 *                      [--out harness/out/compare] [--beats-dir harness/out/audio-beats] [--ref reference/evolution-gameplay/audio]
 *
 * (a) renders the four beats via `npx tsx src/audio/tools/beats.ts <beatsDir> --ref <refDir> [--bike pro]`
 *     and prints its table (ours vs the reference cuts: RMS / peak / crest / centroid);
 * (b) builds six sealed pairs in <out>/, one per row of `AUDIO_PAIRS`:
 *
 *   apair-<id>.mp4          640x384 @ 30 fps, the picture is BLACK by design (the critic judges sound only; any
 *                           picture would leak round 10's visual tells). Only the 24 px label bar is drawn: ONE
 *                           white square while A plays, TWO while B plays, the amber 16-segment clock over the
 *                           whole file. Audio = A, then 1.0 s of silence, then B (sequential: one stream).
 *   apair-<id>-A.wav        A, 48 kHz stereo pcm_s16le, trimmed and loudness-matched (see `normalizeWav`)
 *   apair-<id>-B.wav        B, same treatment
 *   apair-<id>-sheet.jpg    two spectrograms stacked, A top / B bottom, identical axes, no other labelling
 *   apair-<id>.answer.json  PairAnswer (chmod 000): which of A / B is ours
 *
 * id = `<tag>-<yyyymmdd-hhmmss>-<4hex>` with tag `audio-<beat>-<refNN>` (e.g. `audio-wheelie-02`), so
 * `pnpm harness:critic-prompt <id>` and `pnpm harness:log-verdict <id>` work unchanged (both resolve `apair-`).
 *
 * Trim: both sides to min(len A, len B) capped at 8 s from the onset — the reference cut at its start (the manifest
 * window), ours at t = 0 (beats.ts's report carries no onset). Normalisation: integrated loudness (ffmpeg loudnorm's
 * first-pass measurement) matched to TARGET_LUFS with ONE linear gain per clip (`volume=<dB>`), capped so the
 * sample peak stays under PEAK_CAP_DBFS; no compression, dynamics untouched, applied identically to both sides.
 * Side: `--coin balanced` (default) = a seeded shuffle of three `ours` / three `ref` A-sides (`sidesFor(seed, 6)`), so
 * one run can never put ours on the same side six times; `--coin plain` = `coinLeft(seed + k)` for pair k (round 11's
 * first run used plain with --seed 1011 and drew ours = A on all six, a 1-in-32 draw that confounds position with truth).
 */
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Rng } from '../../src/core/rng';
import { flagBool, flagStr, parseArgs } from '../lib/args';
import { resolveFfmpeg, resolveFfprobe } from '../lib/ffmpeg';
import { OUT_DIR, REPO_ROOT } from '../lib/paths';
import { fail, printKV, writeJson } from '../lib/report';
import type { PairAnswer } from '../lib/schema';
import { runFfmpeg } from './ffrun';
import { CLOCK_SEGMENTS, LABEL_BAR_PX, coinLeft, makePairId } from './pair';

const execFileP = promisify(execFile);

export const AUDIO_TAG_PREFIX = 'audio-';
export const BEATS = ['start-gate', 'wheelie', 'landing-2m', 'crash-respawn'] as const;
export type Beat = (typeof BEATS)[number];

/** The six pairs, in order (k is the seed offset). */
export const AUDIO_PAIRS: readonly { beat: Beat; ref: string }[] = [
  { beat: 'wheelie', ref: 'wheelie-02' },
  { beat: 'wheelie', ref: 'wheelie-05' },
  { beat: 'landing-2m', ref: 'landing-12' },
  { beat: 'landing-2m', ref: 'landing-14' },
  { beat: 'crash-respawn', ref: 'crash-04' },
  { beat: 'start-gate', ref: 'start-01' },
];

export const MAX_LEN_S = 8;
export const GAP_S = 1.0;
export const TARGET_LUFS = -23;
export const PEAK_CAP_DBFS = -1;
export const VIDEO_W = 640;
export const VIDEO_H = 360;
export const VIDEO_FPS = 30;

export const DEFAULT_BEATS_DIR = path.join(OUT_DIR, 'audio-beats');
export const DEFAULT_REF_DIR = path.join(REPO_ROOT, 'reference', 'evolution-gameplay', 'audio');

/** `audio-wheelie-02` -> `wheelie`; `audio-landing-2m-14` -> `landing-2m`; anything else -> null. */
export function beatOfAudioTag(tag: string): Beat | null {
  if (!tag.startsWith(AUDIO_TAG_PREFIX)) return null;
  const rest = tag.slice(AUDIO_TAG_PREFIX.length);
  for (const b of BEATS) if (rest === b || rest.startsWith(`${b}-`)) return b;
  return null;
}

/** Pair tag: `audio-<beat>-<NN>` (NN = the reference clip id). */
export function audioTag(beat: Beat, ref: string): string {
  const nn = /-(\d{2})$/.exec(ref)?.[1] ?? ref;
  return `${AUDIO_TAG_PREFIX}${beat}-${nn}`;
}

/**
 * Balanced A-sides for a run of n pairs: ceil(n/2) `ours` and floor(n/2) `ref`, Fisher-Yates shuffled by `Rng(seed)`.
 * Same seed -> same order.
 */
export function sidesFor(seed: number, n: number): ('ours' | 'ref')[] {
  const sides: ('ours' | 'ref')[] = Array.from({ length: n }, (_, i) => (i < Math.ceil(n / 2) ? 'ours' : 'ref'));
  const rng = new Rng(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [sides[i], sides[j]] = [sides[j]!, sides[i]!];
  }
  return sides;
}

/** Strip an `apair-` / `pair-` prefix a caller may have copied from a file name. */
export function bareId(id: string): string {
  return id.replace(/^a?pair-/, '');
}

// ---------------------------------------------------------------------------
// ffmpeg helpers
// ---------------------------------------------------------------------------

export async function probeDurationS(file: string): Promise<number> {
  const ffprobe = resolveFfprobe();
  if (!ffprobe) throw new Error('ffprobe not found');
  const { stdout } = await execFileP(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  const d = Number(stdout.trim());
  if (!Number.isFinite(d)) throw new Error(`ffprobe: no duration for ${file}`);
  return d;
}

export interface Loudness {
  integratedLufs: number;
  truePeakDb: number;
}

/** First-pass loudnorm measurement over [0, lenS) of a WAV. */
/** `lowpass=f=<Hz>,` when a low-pass is asked for (0 = none). Round 12: 14 kHz on BOTH sides by default — the
 * reference captures brick-wall at 12–14 kHz (a codec tell round 11's critics could have named) and ours has a
 * 20 kHz floor; measured AFTER the filter so the −23 LUFS match holds on what the critic hears. */
export function lowpassChain(hz: number): string {
  return hz > 0 ? `lowpass=f=${Math.round(hz)},` : '';
}

export async function measureLoudness(file: string, lenS: number, lowpassHz = 0): Promise<Loudness> {
  const { stderr } = await runFfmpeg(resolveFfmpeg(), [
    '-hide_banner', '-nostats', '-nostdin',
    '-i', file,
    '-af', `atrim=0:${lenS.toFixed(3)},asetpts=PTS-STARTPTS,${lowpassChain(lowpassHz)}loudnorm=print_format=json`,
    '-f', 'null', '-',
  ]);
  const m = /\{\s*"input_i"[\s\S]*?\}/.exec(stderr);
  if (!m) throw new Error(`loudnorm printed no JSON for ${file}\n${stderr.slice(-800)}`);
  const j = JSON.parse(m[0]) as { input_i: string; input_tp: string };
  return { integratedLufs: Number(j.input_i), truePeakDb: Number(j.input_tp) };
}

/** The one linear gain (dB) that puts the clip at TARGET_LUFS, capped so the peak stays under PEAK_CAP_DBFS. */
export function gainDbFor(l: Loudness, target = TARGET_LUFS, peakCap = PEAK_CAP_DBFS): number {
  if (!Number.isFinite(l.integratedLufs) || l.integratedLufs < -70) return 0; // silence: leave it
  const wanted = target - l.integratedLufs;
  const maxGain = peakCap - l.truePeakDb;
  return Math.min(wanted, maxGain);
}

export interface NormalizedWav {
  file: string;
  lenS: number;
  gainDb: number;
  measured: Loudness;
  lowpassHz: number;
}

/** Trim [0, lenS), optional low-pass (both sides get the same one), apply one gain, write 48 kHz stereo pcm_s16le. */
export async function normalizeWav(input: string, out: string, lenS: number, lowpassHz = 0): Promise<NormalizedWav> {
  const measured = await measureLoudness(input, lenS, lowpassHz);
  const gainDb = gainDbFor(measured);
  await runFfmpeg(resolveFfmpeg(), [
    '-y', '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-i', input,
    '-af', `atrim=0:${lenS.toFixed(3)},asetpts=PTS-STARTPTS,${lowpassChain(lowpassHz)}volume=${gainDb.toFixed(3)}dB`,
    '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le',
    out,
  ]);
  return { file: out, lenS, gainDb, measured, lowpassHz };
}

/**
 * The black picture + label bar for a sequential A / gap / B file. Same geometry as pair.ts's bar
 * (24 px, one square = A, two squares = B, amber 16-segment clock along the bar's bottom edge), but
 * the squares SWITCH with the audio instead of splitting the frame: A's square while A plays, B's two
 * squares from the gap's end. Below the bar: black.
 */
export function audioPairFilter(width: number, height: number, lenS: number, gapS: number): string {
  const bar = LABEL_BAR_PX;
  const sq = 12;
  const sy = Math.floor((bar - sq) / 2) - 1;
  const total = 2 * lenS + gapS;
  const aOn = `enable='lt(t\\,${lenS.toFixed(4)})'`;
  const bOn = `enable='gte(t\\,${(lenS + gapS).toFixed(4)})'`;
  const boxes: string[] = [
    `drawbox=x=0:y=0:w=${width}:h=${bar}:color=0x2a2e33@1:t=fill:${aOn}`,
    `drawbox=x=0:y=0:w=${width}:h=${bar}:color=0x44494f@1:t=fill:${bOn}`,
    `drawbox=x=10:y=${sy}:w=${sq}:h=${sq}:color=white@1:t=fill:${aOn}`,
    `drawbox=x=10:y=${sy}:w=${sq}:h=${sq}:color=white@1:t=fill:${bOn}`,
    `drawbox=x=${10 + sq + 6}:y=${sy}:w=${sq}:h=${sq}:color=white@1:t=fill:${bOn}`,
  ];
  const segW = width / CLOCK_SEGMENTS;
  for (let k = 0; k < CLOCK_SEGMENTS; k++) {
    const at = ((k * total) / CLOCK_SEGMENTS).toFixed(4);
    boxes.push(
      `drawbox=x=${Math.round(k * segW)}:y=${bar - 3}:w=${Math.round(segW) - 1}:h=3:color=0xffd166@1:t=fill:enable='gte(t\\,${at})'`,
    );
  }
  return [
    `color=c=black:s=${width}x${height + bar}:r=${VIDEO_FPS}:d=${total.toFixed(3)}[bg]`,
    `[bg]${boxes.join(',')}[v]`,
    `[0:a]apad=pad_dur=${gapS.toFixed(3)}[a0]`,
    '[a0][1:a]concat=n=2:v=0:a=1[a]',
  ].join(';');
}

export async function spectrogram(wav: string, outPng: string, width: number, height: number): Promise<void> {
  await runFfmpeg(resolveFfmpeg(), [
    '-y', '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-i', wav,
    '-lavfi', `showspectrumpic=s=${width}x${height}:legend=0:scale=log:drange=80:limit=-6:fscale=log:start=20:stop=12000:color=intensity`,
    outPng,
  ]);
}

// ---------------------------------------------------------------------------
// Beats
// ---------------------------------------------------------------------------

export function renderBeats(beatsDir: string, refDir: string, bike: string): Promise<string> {
  const args = ['tsx', 'src/audio/tools/beats.ts', beatsDir, '--ref', refDir];
  if (bike !== 'rookie') args.push('--bike', bike);
  return new Promise((resolve, reject) => {
    const child = spawn('npx', args, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString();
      process.stdout.write(d);
    });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`beats.ts exited ${code}`))));
  });
}

// ---------------------------------------------------------------------------
// Pairs
// ---------------------------------------------------------------------------

export interface AudioPairOptions {
  beat: Beat;
  ref: string;
  seed: number;
  /** A-side override (from `sidesFor`); default `coinLeft(seed)`. */
  left?: 'ours' | 'ref';
  bike?: string;
  beatsDir?: string;
  refDir?: string;
  outDir?: string;
  /** Low-pass (Hz) applied to both sides before the loudness match; 0 = none. Default `DEFAULT_LOWPASS_HZ`. */
  lowpassHz?: number;
}

export const DEFAULT_LOWPASS_HZ = 14000;

export interface AudioPairResult {
  id: string;
  tag: string;
  seed: number;
  left: 'ours' | 'ref';
  pairMp4: string;
  sheet: string;
  wavA: string;
  wavB: string;
  answerFile: string;
  lenS: number;
  lenOursS: number;
  lenRefS: number;
  gainOursDb: number;
  gainRefDb: number;
  loudOurs: Loudness;
  loudRef: Loudness;
  lowpassHz: number;
}

export async function buildAudioPair(opts: AudioPairOptions): Promise<AudioPairResult> {
  const outDir = opts.outDir ?? path.join(OUT_DIR, 'compare');
  const bike = opts.bike ?? 'rookie';
  const ours = path.join(opts.beatsDir ?? DEFAULT_BEATS_DIR, `${opts.beat}-${bike}.wav`);
  const ref = path.join(opts.refDir ?? DEFAULT_REF_DIR, `${opts.ref}.wav`);
  for (const f of [ours, ref]) if (!fs.existsSync(f)) throw new Error(`audio pair: missing ${f}`);

  const tag = audioTag(opts.beat, opts.ref);
  const id = makePairId(tag);
  const work = path.join(outDir, 'work', id);
  fs.mkdirSync(work, { recursive: true });

  const [lenOursS, lenRefS] = await Promise.all([probeDurationS(ours), probeDurationS(ref)]);
  const lenS = Math.min(lenOursS, lenRefS, MAX_LEN_S);

  const left = opts.left ?? coinLeft(opts.seed);
  const [srcA, srcB] = left === 'ours' ? [ours, ref] : [ref, ours];
  const wavA = path.join(outDir, `apair-${id}-A.wav`);
  const wavB = path.join(outDir, `apair-${id}-B.wav`);
  const lowpassHz = opts.lowpassHz ?? DEFAULT_LOWPASS_HZ;
  const [normA, normB] = await Promise.all([normalizeWav(srcA, wavA, lenS, lowpassHz), normalizeWav(srcB, wavB, lenS, lowpassHz)]);

  const pairMp4 = path.join(outDir, `apair-${id}.mp4`);
  await runFfmpeg(resolveFfmpeg(), [
    '-y', '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-i', wavA,
    '-i', wavB,
    '-filter_complex', audioPairFilter(VIDEO_W, VIDEO_H, lenS, GAP_S),
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    '-shortest',
    pairMp4,
  ]);

  const pngA = path.join(work, 'a-spec.png');
  const pngB = path.join(work, 'b-spec.png');
  await Promise.all([spectrogram(wavA, pngA, 1280, 360), spectrogram(wavB, pngB, 1280, 360)]);
  const sheet = path.join(outDir, `apair-${id}-sheet.jpg`);
  await runFfmpeg(resolveFfmpeg(), [
    '-y', '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-i', pngA, '-i', pngB,
    '-filter_complex', '[0:v][1:v]vstack=inputs=2[s]',
    '-map', '[s]', '-frames:v', '1', '-q:v', '3',
    sheet,
  ]);

  const answer: PairAnswer = {
    pairId: id,
    tag,
    seed: opts.seed,
    left,
    ours: path.resolve(ours),
    ref: path.resolve(ref),
    pairMp4,
    sheet,
    createdAt: new Date().toISOString(),
  };
  const answerFile = path.join(outDir, `apair-${id}.answer.json`);
  writeJson(answerFile, answer);
  fs.chmodSync(answerFile, 0o000);

  const oursNorm = left === 'ours' ? normA : normB;
  const refNorm = left === 'ours' ? normB : normA;
  return {
    id, tag, seed: opts.seed, left, pairMp4, sheet, wavA, wavB, answerFile,
    lenS, lenOursS, lenRefS,
    gainOursDb: oursNorm.gainDb, gainRefDb: refNorm.gainDb,
    loudOurs: oursNorm.measured, loudRef: refNorm.measured,
    lowpassHz,
  };
}

async function main(): Promise<void> {
  const { flags } = parseArgs();
  const bike = flagStr(flags, 'bike', 'rookie');
  const beatsDir = path.resolve(flagStr(flags, 'beats-dir', DEFAULT_BEATS_DIR));
  const refDir = path.resolve(flagStr(flags, 'ref', DEFAULT_REF_DIR));
  const outDir = path.resolve(flagStr(flags, 'out', path.join(OUT_DIR, 'compare')));
  const seedBase = typeof flags['seed'] === 'string' ? Number(flags['seed']) : Date.now() >>> 0;
  if (!Number.isFinite(seedBase)) fail('--seed must be a number');
  const coin = flagStr(flags, 'coin', 'balanced');
  if (coin !== 'balanced' && coin !== 'plain') fail('--coin must be balanced|plain');
  const lowpassHz = typeof flags['lowpass'] === 'string' ? Number(flags['lowpass']) : DEFAULT_LOWPASS_HZ;
  if (!Number.isFinite(lowpassHz) || lowpassHz < 0) fail('--lowpass must be a frequency in Hz (0 = none)');
  const beatsOnly = flagBool(flags, 'beats-only');
  const pairsOnly = flagBool(flags, 'pairs-only');
  if (beatsOnly && pairsOnly) fail('--beats-only and --pairs-only are exclusive');

  const t0 = performance.now();
  if (!pairsOnly) {
    fs.mkdirSync(beatsDir, { recursive: true });
    await renderBeats(beatsDir, refDir, bike);
    console.log(`\n[audio] beats rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s -> ${beatsDir}`);
  }
  if (beatsOnly) return;

  fs.mkdirSync(outDir, { recursive: true });
  const t1 = performance.now();
  const results: AudioPairResult[] = [];
  const sides = coin === 'balanced' ? sidesFor(seedBase, AUDIO_PAIRS.length) : null;
  for (let k = 0; k < AUDIO_PAIRS.length; k++) {
    const p = AUDIO_PAIRS[k]!;
    const res = await buildAudioPair({
      beat: p.beat, ref: p.ref, seed: seedBase + k, bike, beatsDir, refDir, outDir, lowpassHz,
      ...(sides ? { left: sides[k]! } : {}),
    });
    results.push(res);
    // Never print `left` here: this stdout may be shown to the critic.
    printKV(`apair ${k + 1}/${AUDIO_PAIRS.length}`, {
      id: res.id,
      tag: res.tag,
      seed: res.seed,
      coin,
      lowpassHz: res.lowpassHz,
      lenS: res.lenS.toFixed(3),
      lenOursS: res.lenOursS.toFixed(3),
      lenRefS: res.lenRefS.toFixed(3),
      gainOursDb: res.gainOursDb.toFixed(2),
      gainRefDb: res.gainRefDb.toFixed(2),
      lufsOurs: res.loudOurs.integratedLufs.toFixed(1),
      lufsRef: res.loudRef.integratedLufs.toFixed(1),
      answer: `${res.answerFile} (chmod 000)`,
    });
  }
  console.log(`\n[audio] ${results.length} pairs in ${((performance.now() - t1) / 1000).toFixed(1)} s -> ${outDir}`);
  for (const r of results) console.log(`id: ${r.id}`);
}

const isEntry = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
}
