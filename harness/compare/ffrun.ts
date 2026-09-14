/**
 * Shared ffmpeg process runner + frame extraction for the compare tooling.
 * (harness/lib/ffmpeg.ts keeps its runner private; this mirrors it.)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveFfmpeg } from '../lib/ffmpeg';

export function runFfmpeg(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
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

/** Evenly spaced frame indices, first and last inclusive. */
export function evenFrameIndices(totalFrames: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(Math.min(totalFrames - 1, Math.round((i * (totalFrames - 1)) / Math.max(1, count - 1))));
  }
  return out;
}

/**
 * Extract the given frame indices from a clip as PNGs `<prefix>-01.png`...
 * (one ffmpeg call, `select` filter). Returns the written paths in order.
 */
export async function extractFrames(input: string, outDir: string, prefix: string, indices: number[]): Promise<string[]> {
  fs.mkdirSync(outDir, { recursive: true });
  const expr = indices.map((n) => `eq(n\\,${n})`).join('+');
  const pattern = path.join(outDir, `${prefix}-%02d.png`);
  await runFfmpeg(resolveFfmpeg(), [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', input,
    '-vf', `select='${expr}'`,
    '-fps_mode', 'vfr',
    '-frames:v', String(indices.length),
    pattern,
  ]);
  const files = indices.map((_, i) => path.join(outDir, `${prefix}-${String(i + 1).padStart(2, '0')}.png`));
  for (const f of files) if (!fs.existsSync(f)) throw new Error(`extractFrames: missing ${f}`);
  return files;
}
