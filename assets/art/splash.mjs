#!/usr/bin/env node
// iOS launch images (ask 58, docs/plans/PWA_OFFLINE.md §3).
//
// iOS does not use the web manifest's `background_color` for a home-screen app's launch screen: it
// composites the launch screen from `apple-touch-startup-image` links, and with none present the user
// gets a white flash before the loader paints. That white flash is very likely part of the user's
// "I opened it and it didn't load".
//
// Writes public/art/splash/<w>x<h>.png — the loader's own plate on the loader's own background
// (#07080a, the amber leading edge, the wordmark), one per device pixel size in both orientations.
// The <link> tags that select them live in index.html; keep the two in step.
//
//   node assets/art/splash.mjs           (needs ImageMagick — `magick`)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(repo, 'public', 'art', 'splash');

/** Device pixel sizes iOS matches on, portrait (the landscape file is the same numbers swapped). */
export const DEVICES = [
  [750, 1334], // SE 2/3, 8
  [828, 1792], // XR, 11
  [1125, 2436], // X, XS, 11 Pro
  [1170, 2532], // 12, 12 Pro, 13, 13 Pro, 14
  [1179, 2556], // 14 Pro, 15, 15 Pro, 16
  [1206, 2622], // 16 Pro
  [1242, 2688], // XS Max, 11 Pro Max
  [1284, 2778], // 12 Pro Max, 13 Pro Max, 14 Plus
  [1290, 2796], // 14 Pro Max, 15 Pro Max, 16 Plus
  [1320, 2868], // 16 Pro Max
  [1536, 2048], // iPad 9.7 / 10.2
  [1620, 2160], // iPad 10.2 (10th gen)
  [1668, 2388], // iPad Pro 11
  [2048, 2732], // iPad Pro 12.9
];

const BG = '#07080a';
const PLATE = '#12161d';
const AMBER = '#ffb020';
const FONT = 'Helvetica-BoldOblique';
const WORD = 'TRIALS GAUNTLET';

/** The wordmark's rendered width at a given point size — the plate is cut to the text, not guessed. */
function textWidth(size) {
  return Number(execFileSync('magick', ['-font', FONT, '-pointsize', String(size), `label:${WORD}`, '-format', '%w', 'info:']).toString().trim());
}
const W100 = textWidth(100);

/** One launch image: the loader's dark ground, the slanted plate with its amber leading edge, the wordmark. */
function render(w, h) {
  const short = Math.min(w, h);
  // The wordmark fills ~62% of the short side, exactly as `#loader .plate` does with clamp(26px, 6.5vmin, 40px).
  const fontSize = Math.max(12, Math.round((short * 0.62 * 100) / W100));
  const textW = textWidth(fontSize);
  const plateH = Math.round(fontSize * 1.55);
  const padL = Math.round(plateH * 0.42);
  const slant = Math.round(plateH * 0.5);
  const plateW = textW + padL + slant + Math.round(plateH * 0.35);
  const x = Math.round((w - plateW) / 2);
  const y = Math.round((h - plateH) / 2);
  const edge = Math.max(3, Math.round(plateH * 0.07));
  const file = join(out, `${w}x${h}.png`);
  execFileSync('magick', [
    '-size', `${w}x${h}`,
    // Flat, not the loader's radial gradient: a gradient at these sizes is 170 KB of PNG per device
    // (5.3 MB for the set) and the launch screen is on screen for a few hundred milliseconds.
    `xc:${BG}`,
    '-fill', PLATE,
    '-draw', `polygon ${x},${y} ${x + plateW},${y} ${x + plateW - slant},${y + plateH} ${x},${y + plateH}`,
    '-fill', AMBER,
    '-draw', `rectangle ${x},${y} ${x + edge},${y + plateH}`,
    '-font', FONT,
    '-pointsize', String(fontSize),
    '-fill', AMBER,
    '-gravity', 'NorthWest',
    '-annotate', `+${x + padL}+${y + Math.round((plateH - fontSize) / 2) - Math.round(fontSize * 0.06)}`, WORD,
    '-colors', '16',
    '-strip',
    '-define', 'png:compression-level=9',
    file,
  ]);
  return statSync(file).size;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  let total = 0;
  for (const [w, h] of DEVICES) {
    total += render(w, h);
    total += render(h, w);
  }
  console.log(`${readdirSync(out).length} launch images, ${(total / 1024).toFixed(0)} KB total → public/art/splash/`);
}
