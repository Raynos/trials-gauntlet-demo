/**
 * HUD masking for blind comparison: black-fill regions where a timer, fault
 * counter or logo would otherwise give away which clip is ours.
 *
 * Regions are fractions of the frame (0..1), so the same set works on any size.
 *
 * CLI: tsx harness/compare/mask.ts <in.mp4> <out.mp4> [--regions x,y,w,h;x,y,w,h]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../lib/args';
import { resolveFfmpeg } from '../lib/ffmpeg';
import { fail } from '../lib/report';
import { runFfmpeg } from './ffrun';

export interface HudRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Top strip (timer / fault counter / track name) + a deeper top-right corner (timer plaques, minimaps). */
export const DEFAULT_HUD_REGIONS: readonly HudRegion[] = [
  { x: 0, y: 0, w: 1, h: 0.12 },
  { x: 0.72, y: 0, w: 0.28, h: 0.22 },
  // Our build draws a control-hint strip along the bottom edge (beginner tier); a giveaway.
  { x: 0, y: 0.92, w: 1, h: 0.08 },
];

function frac(n: number, name: string): number {
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error(`mask region ${name}=${n} out of 0..1`);
  return n;
}

/** Build the drawbox filter chain for a region set. Exported for tests / pair.ts. */
export function maskFilter(regions: readonly HudRegion[]): string {
  return regions
    .map((r) => {
      const x = frac(r.x, 'x');
      const y = frac(r.y, 'y');
      const w = frac(r.w, 'w');
      const h = frac(r.h, 'h');
      return `drawbox=x=iw*${x}:y=ih*${y}:w=iw*${w}:h=ih*${h}:color=black@1:t=fill`;
    })
    .join(',');
}

/** Re-encode `input` with the regions filled black. */
export async function maskHud(input: string, out: string, regions: readonly HudRegion[] = DEFAULT_HUD_REGIONS): Promise<void> {
  if (regions.length === 0) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.copyFileSync(input, out);
    return;
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await runFfmpeg(resolveFfmpeg(), [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', input,
    '-an',
    '-vf', maskFilter(regions),
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    out,
  ]);
}

/** `x,y,w,h;x,y,w,h` -> regions. */
export function parseRegions(s: string): HudRegion[] {
  return s
    .split(';')
    .filter((p) => p.trim().length > 0)
    .map((p) => {
      const [x, y, w, h] = p.split(',').map(Number);
      if ([x, y, w, h].some((v) => v === undefined || !Number.isFinite(v))) throw new Error(`bad region ${p}`);
      return { x: x!, y: y!, w: w!, h: h! };
    });
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs();
  const [input, out] = positional;
  if (!input || !out) fail('usage: mask.ts <in.mp4> <out.mp4> [--regions x,y,w,h;...]');
  const regions = typeof flags['regions'] === 'string' ? parseRegions(flags['regions']) : DEFAULT_HUD_REGIONS;
  await maskHud(input, out, regions);
  console.log(`masked: ${out} (${regions.length} regions)`);
}

const isEntry = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
}
