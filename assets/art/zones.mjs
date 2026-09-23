#!/usr/bin/env node
// ROCKHOP zone backdrops (store release Phase 2, World owner): cut the far plates and sky panoramas of the four
// zones from their codex image_gen raws (assets/design/store-release/world/gen/*.png, briefs + gen.sh beside them)
// into public/art/plates/{plate,sky}-<zone>.webp, and add / replace their rows in both art manifests
// (assets/art/manifest.json full, public/art/manifest.json runtime). Same recipe as build.mjs §3 (tileX seam blend,
// alpha fade at the plate's foot), with a per-plate band because each painting puts its horizon elsewhere.
//   node assets/art/zones.mjs
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FULL_MANIFEST, writeManifests } from './runtime-manifest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const gen = join(repo, 'assets/design/store-release/world/gen');
const pub = join(repo, 'public/art/plates');
const tmp = join(process.env.TMPDIR || '/tmp', 'rockhop-zone-art');
mkdirSync(tmp, { recursive: true });
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
const dims = (f) => sh('magick', ['identify', '-format', '%w %h', f]).split(' ').map(Number);

/** The picked raw per asset + the source band (rows) that becomes the 4:1 plate / 2:1 sky. */
export const ZONE_ART = [
  { id: 'plate-coast', src: 'plate-coast-b', kind: 'plate-far', biome: 'coast', y: 290, h: 430, fade: 0.2 },
  { id: 'plate-alpine', src: 'plate-alpine-b', kind: 'plate-far', biome: 'alpine', y: 330, h: 500, fade: 0.22 },
  { id: 'plate-quarry', src: 'plate-quarry-a', kind: 'plate-far', biome: 'quarry', y: 170, h: 470, fade: 0.2 },
  { id: 'plate-snowline', src: 'plate-snowline-b', kind: 'plate-far', biome: 'snow', y: 280, h: 500, fade: 0.22 },
  { id: 'sky-coast', src: 'sky-coast-a', kind: 'sky', biome: 'coast', y: 40, h: 768 },
  { id: 'sky-alpine', src: 'sky-alpine-a', kind: 'sky', biome: 'alpine', y: 40, h: 768 },
  { id: 'sky-quarry', src: 'sky-quarry-a', kind: 'sky', biome: 'quarry', y: 40, h: 768 },
  { id: 'sky-snowline', src: 'sky-snowline-a', kind: 'sky', biome: 'snow', y: 40, h: 768 },
];

function tileX(inFile, outPng, blendFrac) {
  const [w, h] = dims(inFile);
  const bw = Math.round(w * blendFrac);
  const mask = join(tmp, 'mask.png');
  const rolled = join(tmp, 'rolled.png');
  sh('magick', ['-size', `${bw}x${h}`, '-define', 'gradient:direction=East', 'gradient:black-white', '(', '+clone', '-flop', ')', '+append', '-evaluate', 'multiply', '0.5', '-background', 'black', '-gravity', 'Center', '-extent', `${w}x${h}`, mask]);
  sh('magick', [inFile, '-roll', `+${Math.floor(w / 2)}+0`, 'PNG32:' + rolled]);
  sh('magick', [rolled, '(', rolled, '-flop', mask, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', ')', '-compose', 'Over', '-composite', 'PNG32:' + outPng]);
}
function fadeBottom(inFile, outPng, frac) {
  const [w, h] = dims(inFile);
  const fh = Math.round(h * frac);
  sh('magick', [inFile, '-alpha', 'set', '(', '-size', `${w}x${h - fh}`, 'xc:white', '-size', `${w}x${fh}`, 'gradient:white-black', '-append', ')', '-compose', 'CopyOpacity', '-composite', 'PNG32:' + outPng]);
}

const rows = [];
for (const a of ZONE_ART) {
  const file = join(gen, a.src + '.png');
  if (!existsSync(file)) {
    console.warn('missing raw', file);
    continue;
  }
  const [w] = dims(file);
  const crop = join(tmp, 'crop.png');
  const tiled = join(tmp, 'tiled.png');
  const out = join(pub, a.id + '.webp');
  const size = a.kind === 'sky' ? '2048x1024!' : '2048x512!';
  sh('magick', [file, '-crop', `${w}x${a.h}+0+${a.y}`, '+repage', '-filter', 'Lanczos', '-resize', size, 'PNG32:' + crop]);
  tileX(crop, tiled, a.kind === 'sky' ? 0.22 : 0.18);
  if (a.kind === 'sky') sh('cwebp', ['-quiet', '-q', '74', '-m', '6', '-metadata', 'none', tiled, '-o', out]);
  else {
    const faded = join(tmp, 'faded.png');
    fadeBottom(tiled, faded, a.fade);
    sh('cwebp', ['-quiet', '-q', '78', '-alpha_q', '90', '-m', '6', '-metadata', 'none', '-exact', faded, '-o', out]);
  }
  copyFileSync(file, join(here, 'raw', a.src + '.png'));
  const [ow, oh] = dims(out);
  const bytes = statSync(out).size;
  const tags = a.kind === 'sky' ? { biome: a.biome, tileX: true } : { biome: a.biome, tileX: true, alphaFadeBottom: a.fade };
  rows.push({ id: a.id, path: `art/plates/${a.id}.webp`, kind: a.kind, ...tags, w: ow, h: oh, bytes, src: a.src, prompt: `assets/design/store-release/world/briefs/${a.src.replace(/-[ab]$/, '')}.md`, v: createHash('sha256').update(readFileSync(out)).digest('hex').slice(0, 8) });
  console.log(a.id.padEnd(18), `${ow}x${oh}`.padEnd(10), (bytes / 1024).toFixed(0) + ' KB');
}
const full = JSON.parse(readFileSync(FULL_MANIFEST, 'utf8'));
const ids = new Set(rows.map((r) => r.id));
full.assets = [...full.assets.filter((a) => !ids.has(a.id)), ...rows];
writeManifests(full);
console.log(`zone art: ${rows.length} assets, ${(rows.reduce((s, r) => s + r.bytes, 0) / 1024).toFixed(0)} KB`);
