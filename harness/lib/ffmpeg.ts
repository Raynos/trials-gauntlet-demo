/**
 * ffmpeg/ffprobe resolution and thin wrappers for encoding evidence clips.
 */
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const CANDIDATES = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'];

function playwrightFfmpeg(): string | null {
  const cache = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  if (!fs.existsSync(cache)) return null;
  const dirs = fs
    .readdirSync(cache)
    .filter((d) => d.startsWith('ffmpeg-'))
    .sort()
    .reverse();
  for (const d of dirs) {
    for (const bin of ['ffmpeg-mac', 'ffmpeg-linux', 'ffmpeg-mac-arm64']) {
      const p = path.join(cache, d, bin);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function which(bin: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const p = path.join(dir, bin);
    if (dir && fs.existsSync(p)) return p;
  }
  return null;
}

let cachedFfmpeg: string | null = null;
export function resolveFfmpeg(): string {
  if (cachedFfmpeg) return cachedFfmpeg;
  const found =
    (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH) ? process.env.FFMPEG_PATH : null) ??
    CANDIDATES.find((c) => fs.existsSync(c)) ??
    which('ffmpeg') ??
    playwrightFfmpeg();
  if (!found) throw new Error('ffmpeg not found (tried /opt/homebrew/bin, PATH, Playwright cache)');
  cachedFfmpeg = found;
  return found;
}

/** ffprobe lives next to a system ffmpeg; Playwright's bundle has none. */
export function resolveFfprobe(): string | null {
  if (process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)) return process.env.FFPROBE_PATH;
  const ff = resolveFfmpeg();
  const sibling = path.join(path.dirname(ff), 'ffprobe');
  if (fs.existsSync(sibling)) return sibling;
  return which('ffprobe');
}

export interface EncodeOptions {
  fps: number;
  /** Printf pattern for input frames, e.g. frame-%05d.png */
  pattern: string;
  out: string;
  crf?: number;
  preset?: string;
}

function run(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(bin)} exited ${code}\n${stderr.slice(-2000)}`));
    });
  });
}

/** PNG sequence → H.264 MP4 (yuv420p, faststart) at a fixed fps. */
export async function encodeMp4(opts: EncodeOptions): Promise<void> {
  const ffmpeg = resolveFfmpeg();
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  await run(ffmpeg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', String(opts.fps),
    '-i', opts.pattern,
    '-c:v', 'libx264',
    '-preset', opts.preset ?? 'medium',
    '-crf', String(opts.crf ?? 18),
    '-pix_fmt', 'yuv420p',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-movflags', '+faststart',
    '-r', String(opts.fps),
    opts.out,
  ]);
}

export interface ContactSheetOptions {
  /** Ordered list of frame PNG paths to sample from. */
  frames: string[];
  out: string;
  cols?: number;
  rows?: number;
  /** Per-tile width; height follows aspect. */
  tileWidth?: number;
}

/** Evenly sampled frames → cols x rows JPEG contact sheet. Returns picked paths. */
export async function contactSheet(opts: ContactSheetOptions): Promise<string[]> {
  const cols = opts.cols ?? 4;
  const rows = opts.rows ?? 2;
  const n = cols * rows;
  if (opts.frames.length === 0) throw new Error('contactSheet: no frames');
  const picked: string[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.min(opts.frames.length - 1, Math.round((i * (opts.frames.length - 1)) / Math.max(1, n - 1)));
    picked.push(opts.frames[idx]!);
  }
  const ffmpeg = resolveFfmpeg();
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  const inputs = picked.flatMap((p) => ['-i', p]);
  const tw = opts.tileWidth ?? 480;
  const scaled = picked.map((_, i) => `[${i}:v]scale=${tw}:-2,setsar=1[v${i}]`).join(';');
  const filter = `${scaled};${picked.map((_, i) => `[v${i}]`).join('')}concat=n=${n}:v=1:a=0,tile=${cols}x${rows}:padding=4:margin=4:color=0x101418[out]`;
  await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[out]', '-frames:v', '1', '-q:v', '3', opts.out]);
  return picked;
}

export interface ProbeResult {
  durationSec: number;
  fps: number;
  width: number;
  height: number;
  codec: string;
  frames: number;
  sizeBytes: number;
}

export async function probeVideo(file: string): Promise<ProbeResult | null> {
  const ffprobe = resolveFfprobe();
  if (!ffprobe) return null;
  const { stdout } = await execFileP(ffprobe, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-count_frames',
    '-show_entries', 'stream=codec_name,width,height,r_frame_rate,nb_read_frames:format=duration',
    '-of', 'json',
    file,
  ]);
  const j = JSON.parse(stdout) as {
    streams?: Array<{ codec_name: string; width: number; height: number; r_frame_rate: string; nb_read_frames: string }>;
    format?: { duration: string };
  };
  const s = j.streams?.[0];
  if (!s) return null;
  const [num, den] = s.r_frame_rate.split('/').map(Number);
  return {
    durationSec: Number(j.format?.duration ?? 0),
    fps: den ? (num ?? 0) / den : 0,
    width: s.width,
    height: s.height,
    codec: s.codec_name,
    frames: Number(s.nb_read_frames),
    sizeBytes: fs.statSync(file).size,
  };
}
