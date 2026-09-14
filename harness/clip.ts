/**
 * Clip evidence per track: the bot's best recording (or a given one) rendered at
 * 1280x720 / 60 fps with setQuality('high'), plus a contact sheet.
 *
 *   pnpm harness:clip <trackId> [--recording <path> | --fresh [--skill 3] [--track-wall-s 120]]
 *                     [--at-x <m> [--before 1.5] [--after 3]] [--from-tick N] [--to-tick N]
 *                     [--fps 60] [--quality high] [--tail 1] [--build]
 *   pnpm harness:clip --tile a,b,c,d [--recapture | --fresh [--skill 3]] [--out harness/out/capture/tile.jpg]
 *
 * Writes harness/out/capture/<trackId>/{clip.mp4,sheet.jpg,clip.json}. The recording is
 * chosen among harness/inputs/<trackId>/{bot-oracle,bot-3..0,stranger-*}.json by replaying
 * each in node: finished > fewer attempts > faster finish; ties prefer the one stamped with
 * the working tree's src fingerprint. `--at-x` renders only the window around the first
 * tick the bike passes x (manoeuvre clips for harness:pair). `--fresh` runs the bot first, in
 * this process, so the recording is of the physics on disk *now* (in a shared checkout the
 * goldens go stale within minutes) and captures it straight away; it implies --build.
 * `--tile` samples 4 frames from
 * each track's clip.mp4 (capturing it first when missing) into one 4x4 sheet, one row per
 * track, for the parent to judge in a single image.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandFrames, frameCount, type InputRecording } from '../src/core/replay';
import type { QualityTier } from '../src/core/types';
import { build } from 'vite';
import { runOnce } from './bot/bot';
import { captureClip } from './capture';
import { extractFrames } from './compare/ffrun';
import { flagBool, flagNum, flagStr, parseArgs } from './lib/args';
import { contactSheet, probeVideo } from './lib/ffmpeg';
import { recordingFingerprint } from './lib/golden';
import { attemptsFromEvents, freshFingerprint, srcFingerprint, type TimedEvent } from './lib/metrics';
import { HARNESS_DIR, OUT_DIR, REPO_ROOT } from './lib/paths';
import { loadRecording, saveRecording } from './lib/recording';
import { fail, printKV, writeJson } from './lib/report';
import type { Skill } from './lib/schema';
import { createSim } from './lib/sim';

export const CAPTURE_DIR = path.join(OUT_DIR, 'capture');

export interface RecordingSummary {
  file: string;
  attempts: number;
  finishTime: number | null;
  finished: boolean;
  ticks: number;
  stamp: string | null;
  fresh: boolean;
  /** Tick at which each x milestone is first reached, filled by `tickAtX`. */
  hash: string;
}

/** Replay a recording in node: attempts, finish, hash (the same numbers the browser must reproduce). */
export async function summarizeRecording(file: string): Promise<RecordingSummary> {
  const rec = loadRecording(file);
  const sim = await createSim(rec.header.trackId, rec.header.seed, rec.header.physicsHz);
  const frames = expandFrames(rec);
  const timed: TimedEvent[] = [];
  for (let i = 0; i < frames.length; i++) for (const event of sim.step(frames[i]!)) timed.push({ event, runTick: i + 1 });
  const st = sim.state();
  const stamp = recordingFingerprint(file);
  // Run clock (continuous through faults), frozen at the finish — the game's finish time, not the segment's.
  return { file, attempts: attemptsFromEvents(timed), finishTime: st.finished ? sim.runTime() : null, finished: st.finished, ticks: frames.length, stamp, fresh: stamp === srcFingerprint(), hash: sim.hash() };
}

export function candidateRecordings(trackId: string): string[] {
  const dir = path.join(HARNESS_DIR, 'inputs', trackId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^(bot-(oracle|[0-3])|stranger-.*)\.json$/.test(f))
    .map((f) => path.join(dir, f));
}

/** finished > fewer attempts > faster finish > fresh stamp > higher skill (file order). */
export async function pickBestRecording(trackId: string, log: (l: string) => void = () => undefined): Promise<RecordingSummary | null> {
  const files = candidateRecordings(trackId);
  const sums: RecordingSummary[] = [];
  for (const f of files) {
    try {
      sums.push(await summarizeRecording(f));
    } catch (err) {
      log(`skip ${path.basename(f)}: ${(err as Error).message}`);
    }
  }
  const rank = (f: string): number => {
    const b = path.basename(f);
    return b === 'bot-oracle.json' ? 0 : b.startsWith('bot-') ? 4 - Number(b.charAt(4)) : 9;
  };
  sums.sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.attempts !== b.attempts) return a.attempts - b.attempts;
    const fa = a.finishTime ?? Infinity;
    const fb = b.finishTime ?? Infinity;
    if (fa !== fb) return fa - fb;
    if (a.fresh !== b.fresh) return a.fresh ? -1 : 1;
    return rank(a.file) - rank(b.file);
  });
  for (const s of sums) log(`${path.basename(s.file).padEnd(44)} finished=${s.finished ? 'yes' : 'no '} attempts=${s.attempts} finish=${s.finishTime?.toFixed(3) ?? '-'} src=${s.stamp ?? 'unstamped'}${s.fresh ? ' (current)' : ''}`);
  return sums[0] ?? null;
}

/** First tick at which bike.x >= x (or null). */
export async function tickAtX(rec: InputRecording, x: number): Promise<number | null> {
  const sim = await createSim(rec.header.trackId, rec.header.seed, rec.header.physicsHz);
  const frames = expandFrames(rec);
  for (let i = 0; i < frames.length; i++) {
    sim.step(frames[i]!);
    if (sim.state().bike.pos.x >= x) return i + 1;
  }
  return null;
}

export interface ClipOptions {
  trackId: string;
  recording?: string;
  /** Run the bot now (skill, wall cap) and clip that recording: out/capture/<track>/fresh-skill<k>.json. */
  fresh?: { skill: Skill; trackWallS: number };
  fps?: number;
  quality?: QualityTier;
  tailSeconds?: number;
  atX?: number;
  beforeS?: number;
  afterS?: number;
  fromTick?: number;
  toTick?: number;
  build?: boolean;
  outDir?: string;
  log?: (l: string) => void;
}

export interface ClipReport {
  trackId: string;
  recording: string;
  summary: RecordingSummary;
  window: { startTick: number; endTick: number | null; atX: number | null };
  mp4: string;
  sheet: string;
  frames: number;
  seconds: number;
  finishTime: number | null;
  finalHash: string;
  quality: QualityTier;
  fps: number;
  size: string;
  srcFingerprint: string;
  wallMs: number;
}

export async function makeClip(o: ClipOptions): Promise<ClipReport> {
  const log = o.log ?? ((l: string) => console.log(`  ${l}`));
  const outDir = o.outDir ?? path.join(CAPTURE_DIR, o.trackId);
  let summary: RecordingSummary | null;
  let built = false;
  if (o.fresh) {
    // Build dist first so the page and this process's already-imported src are as close in
    // time as a shared checkout allows (the bot below runs on the module loaded at startup).
    await build({ root: REPO_ROOT, configFile: path.join(REPO_ROOT, 'vite.config.ts'), logLevel: 'error' });
    built = true;
    const seed = (await createSim(o.trackId)).seed;
    log(`fresh: bot skill=${o.fresh.skill} seed=${seed} wall<=${o.fresh.trackWallS}s on src=${srcFingerprint()} ...`);
    const r = await runOnce(o.trackId, seed, o.fresh.skill, { maxWallMs: o.fresh.trackWallS * 1000 });
    const file = path.join(outDir, `fresh-skill${o.fresh.skill}.json`);
    saveRecording(file, r.recording);
    log(`fresh: outcome=${r.report.outcome} attempts=${r.report.attempts} maxX=${r.report.maxX.toFixed(1)} finish=${r.report.finishTime ?? '-'} -> ${path.relative(REPO_ROOT, file)}`);
    summary = await summarizeRecording(file);
  } else if (o.recording) summary = await summarizeRecording(path.resolve(o.recording));
  else summary = await pickBestRecording(o.trackId, log);
  if (!summary) throw new Error(`no recording for ${o.trackId} under harness/inputs/${o.trackId}/ — run pnpm harness:bot ${o.trackId}`);
  if (!summary.fresh) log(`WARNING ${path.basename(summary.file)} is stamped src=${summary.stamp ?? 'unstamped'}, working tree is ${srcFingerprint()}: the clip shows today's physics driving yesterday's inputs`);
  const rec = loadRecording(summary.file);
  if (rec.header.trackId !== o.trackId) throw new Error(`${summary.file} is a ${rec.header.trackId} recording, not ${o.trackId}`);
  const hz = rec.header.physicsHz;
  let startTick = o.fromTick ?? 0;
  let endTick: number | null = o.toTick ?? null;
  let atX: number | null = null;
  if (o.atX !== undefined) {
    const t = await tickAtX(rec, o.atX);
    if (t === null) throw new Error(`the bike never reaches x=${o.atX} m in ${path.basename(summary.file)} (recording ends at ${frameCount(rec)} ticks)`);
    atX = o.atX;
    startTick = Math.max(0, t - Math.round((o.beforeS ?? 1.5) * hz));
    endTick = Math.min(frameCount(rec), t + Math.round((o.afterS ?? 3) * hz));
    log(`x=${o.atX} m first reached at tick ${t} (${(t / hz).toFixed(2)} s); window ticks ${startTick}..${endTick}`);
  }
  const quality = o.quality ?? 'high';
  const fps = o.fps ?? 60;
  const outMp4 = path.join(outDir, 'clip.mp4');
  const res = await captureClip({
    recording: rec,
    outMp4,
    fps,
    width: 1280,
    height: 720,
    quality,
    tailSeconds: o.tailSeconds ?? 1,
    startTick,
    ...(endTick !== null ? { endTick } : {}),
    build: (o.build ?? false) && !built,
    sheetCols: 4,
    sheetRows: 2,
  });
  const report: ClipReport = {
    trackId: o.trackId,
    recording: path.relative(REPO_ROOT, summary.file),
    summary,
    window: { startTick, endTick, atX },
    mp4: res.mp4,
    sheet: res.sheet,
    frames: res.frames,
    seconds: res.seconds,
    finishTime: res.finishTime,
    finalHash: res.finalHash,
    quality,
    fps,
    size: '1280x720',
    srcFingerprint: srcFingerprint(),
    wallMs: res.wallMs,
  };
  if (endTick === null && res.finishTime !== null && summary.finishTime !== null && Math.abs(res.finishTime - summary.finishTime) > 1e-9) {
    log(`WARNING browser finish ${res.finishTime} != node finish ${summary.finishTime}: node and page disagree (stale dist? pass --build)`);
  }
  if (freshFingerprint() !== report.srcFingerprint) log(`WARNING src/physics|tracks changed on disk while this clip ran (${report.srcFingerprint} now ${freshFingerprint()}); node ran the old code, the page may run the new one`);
  writeJson(path.join(outDir, 'clip.json'), report);
  return report;
}

/** 4x4 sheet: one row per track (4 evenly spaced frames from its clip.mp4). >4 tracks -> several sheets. */
export async function tileTracks(trackIds: string[], o: { recapture?: boolean; out?: string; build?: boolean; fresh?: ClipOptions['fresh'] }): Promise<string[]> {
  const sheets: string[] = [];
  const legend: { sheet: string; row: number; trackId: string; clip: string; frames: number[] }[] = [];
  const work = path.join(CAPTURE_DIR, 'tile-work');
  fs.mkdirSync(work, { recursive: true });
  for (let s = 0; s < trackIds.length; s += 4) {
    const group = trackIds.slice(s, s + 4);
    const pngs: string[] = [];
    const out = o.out && trackIds.length <= 4 ? path.resolve(o.out) : path.join(CAPTURE_DIR, `tile${trackIds.length > 4 ? `-${s / 4 + 1}` : ''}.jpg`);
    for (const [row, id] of group.entries()) {
      const clip = path.join(CAPTURE_DIR, id, 'clip.mp4');
      if (o.recapture || o.fresh || !fs.existsSync(clip)) {
        console.log(`tile: capturing ${id} (${o.fresh ? '--fresh' : o.recapture ? '--recapture' : 'no clip yet'})`);
        await makeClip({ trackId: id, build: (o.build ?? false) && sheets.length === 0 && row === 0, ...(o.fresh ? { fresh: o.fresh } : {}) });
      }
      const probe = await probeVideo(clip);
      if (!probe) throw new Error(`ffprobe failed on ${clip}`);
      // 10 / 37 / 63 / 90 % of the clip: skips the stationary first frame and the frozen tail.
      const idx = [0.1, 0.37, 0.63, 0.9].map((f) => Math.min(probe.frames - 1, Math.round(f * (probe.frames - 1))));
      pngs.push(...(await extractFrames(clip, work, id, idx)));
      legend.push({ sheet: out, row: row + 1, trackId: id, clip, frames: idx });
    }
    // contactSheet samples evenly across the list; with exactly cols*rows frames it keeps them all in order.
    await contactSheet({ frames: pngs, out, cols: 4, rows: group.length, tileWidth: 480 });
    sheets.push(out);
  }
  writeJson(path.join(CAPTURE_DIR, 'tile.json'), { at: new Date().toISOString(), srcFingerprint: srcFingerprint(), tracks: trackIds, sheets, legend });
  return sheets;
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs();
  const tile = typeof flags['tile'] === 'string' ? flags['tile'].split(',').map((s) => s.trim()).filter(Boolean) : null;
  if (tile) {
    const out = typeof flags['out'] === 'string' ? flags['out'] : undefined;
    const k = Math.max(0, Math.min(3, Math.round(flagNum(flags, 'skill', 3)))) as 0 | 1 | 2 | 3;
    const fresh = flagBool(flags, 'fresh') ? { skill: k, trackWallS: flagNum(flags, 'track-wall-s', 120) } : undefined;
    const sheets = await tileTracks(tile, { recapture: flagBool(flags, 'recapture'), build: flagBool(flags, 'build'), ...(out ? { out } : {}), ...(fresh ? { fresh } : {}) });
    console.log(`tile: ${sheets.join(', ')} (rows top->bottom: ${tile.join(', ')}; legend in ${path.join(CAPTURE_DIR, 'tile.json')})`);
    return;
  }
  const trackId = positional[0];
  if (!trackId) fail('usage: harness/clip.ts <trackId> [--recording <path> | --fresh [--skill 3]] [--at-x m --before s --after s] [--from-tick N --to-tick N] [--fps 60] [--quality high] [--build] | --tile a,b,c,d');
  const quality = flagStr(flags, 'quality', 'high');
  if (quality !== 'low' && quality !== 'medium' && quality !== 'high') fail('--quality must be low|medium|high');
  const opts: ClipOptions = { trackId: trackId!, fps: flagNum(flags, 'fps', 60), quality, tailSeconds: flagNum(flags, 'tail', 1), build: flagBool(flags, 'build') };
  if (typeof flags['recording'] === 'string') opts.recording = flags['recording'];
  if (flagBool(flags, 'fresh')) {
    const k = Math.max(0, Math.min(3, Math.round(flagNum(flags, 'skill', 3)))) as 0 | 1 | 2 | 3;
    opts.fresh = { skill: k, trackWallS: flagNum(flags, 'track-wall-s', 120) };
  }
  if (flags['at-x'] !== undefined) {
    opts.atX = flagNum(flags, 'at-x', 0);
    opts.beforeS = flagNum(flags, 'before', 1.5);
    opts.afterS = flagNum(flags, 'after', 3);
  }
  if (flags['from-tick'] !== undefined) opts.fromTick = flagNum(flags, 'from-tick', 0);
  if (flags['to-tick'] !== undefined) opts.toTick = flagNum(flags, 'to-tick', 0);
  if (typeof flags['out'] === 'string') opts.outDir = path.resolve(flags['out']);
  console.log(`clip ${trackId}: candidates under harness/inputs/${trackId}/`);
  const r = await makeClip(opts);
  printKV('clip', {
    recording: r.recording,
    'node attempts / finish': `${r.summary.attempts} / ${r.summary.finishTime ?? '-'}`,
    window: `${r.window.startTick}..${r.window.endTick ?? 'end'}${r.window.atX !== null ? ` (x=${r.window.atX} m)` : ''}`,
    mp4: r.mp4,
    sheet: r.sheet,
    'frames / seconds': `${r.frames} / ${r.seconds.toFixed(2)}`,
    'browser finish': r.finishTime,
    quality: r.quality,
    'wall s': (r.wallMs / 1000).toFixed(1),
  });
}

const isEntry = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
