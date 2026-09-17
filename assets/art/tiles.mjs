#!/usr/bin/env node
// Cut the level-select tiles (round 5, ask 44): the five seam / cliff strips, the massif rock tile and the three dressing
// sprites, from assets/art/raw/tiles/<name>.png (the codex image_gen outputs — briefs in
// assets/design/tracks/round4/build/briefs/, runner build/gen.sh) into public/art/tiles/*.webp, plus tiles.json (the
// per-asset record build.mjs folds into public/art/manifest.json). The six round-3 plates already in the folder are
// recorded as-is (their raw sources were never committed).
//   node assets/art/tiles.mjs
// Same tiers as the plates: every file lazy (never on the boot set; `art.probe` on first show of the track select),
// alpha WebP, ≤ 1024 px, capped per kind (seam ≤ 110 KB, massif ≤ 60 KB, sprite ≤ 56 KB) by stepping quality down.
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const raw = join(here, 'raw/tiles');
const out = join(repo, 'public/art/tiles');
const tmp = join(process.env.TMPDIR || '/tmp', 'trials-art-tiles');
mkdirSync(tmp, { recursive: true });
mkdirSync(out, { recursive: true });
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
const dims = (f) => sh('magick', ['identify', '-format', '%w %h', f]).split(' ').map(Number);

function webpAlpha(inFile, outFile, { w, q = 80, lossless = false } = {}) {
  const t = join(tmp, 'wa.png');
  const args = [inFile, '-strip'];
  if (w) args.push('-filter', 'Lanczos', '-resize', `${w}x>`);
  args.push('PNG32:' + t);
  sh('magick', args);
  sh('cwebp', ['-quiet', ...(lossless ? ['-lossless'] : ['-q', String(q), '-alpha_q', '90']), '-m', '6', '-metadata', 'none', '-exact', t, '-o', outFile]);
}
function capped(inFile, outFile, { w, q, maxBytes, minQ = 40 }) {
  for (let quality = q; quality >= minQ; quality -= 6) {
    webpAlpha(inFile, outFile, { w, q: quality });
    if (statSync(outFile).size <= maxBytes) return { q: quality, over: false };
  }
  return { q: minQ, over: true };
}
// The bottom `frac` of the strip fades to transparent so it dissolves onto the terrace / massif below.
function alphaFadeBottom(inFile, outPng, frac) {
  const [w, h] = dims(inFile);
  const fh = Math.round(h * frac);
  sh('magick', [inFile, '-alpha', 'set', '(', '-size', `${w}x${h - fh}`, 'xc:white', '-size', `${w}x${fh}`, 'gradient:white-black', '-append', ')', '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', 'PNG32:' + outPng]);
}
// Key a flat black background: flood fill from the edges (interior darks survive), then feather.
function keyBlack(inFile, fuzz = '12%') {
  const t = join(tmp, 'kb.png');
  const [w, h] = dims(inFile);
  const pts = [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2], [Math.floor(w / 2), 1], [Math.floor(w / 2), h - 2], [1, Math.floor(h / 2)], [w - 2, Math.floor(h / 2)]];
  sh('magick', [inFile, '-alpha', 'set', '-channel', 'RGBA', '-fuzz', fuzz, '-fill', 'none', ...pts.flatMap(([x, y]) => ['-draw', `color ${x},${y} floodfill`]), '+channel', '-channel', 'A', '-morphology', 'Erode', 'Disk:1.0', '-blur', '0x0.7', '+channel', 'PNG32:' + t]);
  return t;
}
// Key a green screen globally (also the cabin's key-coloured smoke), with despill, then trim.
function keyGreen(inFile) {
  const t = join(tmp, 'kg.png');
  const m = join(tmp, 'kg-mask.png');
  const d = join(tmp, 'kg-despill.png');
  sh('magick', [inFile, '-colorspace', 'sRGB', '-fx', '1-min(1,max(0,(g-max(r,b)-0.06)/0.28))', '-morphology', 'Erode', 'Disk:1.0', '-blur', '0x0.6', m]);
  sh('magick', [inFile, '-colorspace', 'sRGB', '-channel', 'G', '-fx', 'min(g,max(r,b))', '+channel', d]);
  sh('magick', [d, m, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', '-trim', '+repage', 'PNG32:' + t]);
  return t;
}
// Combine an existing alpha with a green key (sprites that came on black but carry key-green smoke).
function keyBoth(inFile) {
  const b = keyBlack(inFile);
  const t = join(tmp, 'kbg.png');
  const m = join(tmp, 'kbg-mask.png');
  const a = join(tmp, 'kbg-alpha.png');
  const am = join(tmp, 'kbg-am.png');
  const d = join(tmp, 'kbg-despill.png');
  sh('magick', [b, '-alpha', 'off', '-colorspace', 'sRGB', '-fx', '1-min(1,max(0,(g-max(r,b)-0.06)/0.28))', '-morphology', 'Erode', 'Disk:1.0', '-blur', '0x0.6', m]);
  sh('magick', [b, '-alpha', 'extract', a]);
  sh('magick', [a, m, '-compose', 'Multiply', '-composite', am]);
  sh('magick', [b, '-alpha', 'off', '-colorspace', 'sRGB', '-channel', 'G', '-fx', 'min(g,max(r,b))', '+channel', d]);
  sh('magick', [d, am, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', '-trim', '+repage', 'PNG32:' + t]);
  return t;
}

const SEAMS = [
  { name: 'seam-quay', lower: 'island', upper: 'industrial' },
  { name: 'seam-industrial-canyon', lower: 'industrial', upper: 'canyon' },
  { name: 'seam-canyon-snow', lower: 'canyon', upper: 'snow' },
  { name: 'seam-snow-nightcity', lower: 'snow', upper: 'nightCity' },
  { name: 'seam-nightcity-foundry', lower: 'nightCity', upper: 'foundry' },
];
const SPRITES = [
  { name: 'sprite-chairlift', key: 'black', w: 448 },
  { name: 'sprite-cabin', key: 'both', w: 384 },
  { name: 'sprite-waterfall', key: 'green', w: 320 },
];
const tiles = [];
const rec = (id, file, kind, tags) => {
  const [w, h] = dims(file);
  const bytes = statSync(file).size;
  tiles.push({ id, path: 'art/tiles/' + id + '.webp', kind, tier: 'lazy', w, h, bytes, ...tags });
  console.log(id.padEnd(30), `${w}x${h}`.padEnd(10), (bytes / 1024).toFixed(0) + ' KB', tags.q ? `q${tags.q}` : '', tags.over ? 'OVER CAP' : '');
};

for (const s of SEAMS) {
  const src = join(raw, s.name + '.png');
  if (!existsSync(src)) { console.warn('missing raw', src); continue; }
  const faded = join(tmp, s.name + '-faded.png');
  alphaFadeBottom(src, faded, 0.15);
  const dst = join(out, s.name + '.webp');
  const enc = capped(faded, dst, { w: 1024, q: 78, maxBytes: 110 * 1024 });
  rec(s.name, dst, 'seam', { lower: s.lower, upper: s.upper, alpha: true, alphaFadeBottom: 0.15, cap: '110KB', q: enc.q, over: enc.over, src: s.name });
}
{
  const src = join(raw, 'massif.png');
  if (existsSync(src)) {
    const dst = join(out, 'massif.webp');
    const t = join(tmp, 'massif.png');
    sh('magick', [src, '-strip', '-filter', 'Lanczos', '-resize', '512x512', 'PNG24:' + t]);
    let q = 72;
    for (; q >= 40; q -= 6) {
      sh('cwebp', ['-quiet', '-q', String(q), '-m', '6', '-metadata', 'none', t, '-o', dst]);
      if (statSync(dst).size <= 60 * 1024) break;
    }
    rec('massif', dst, 'massif', { tileXY: true, cap: '60KB', q, src: 'massif' });
  }
}
for (const sp of SPRITES) {
  const src = join(raw, sp.name + '.png');
  if (!existsSync(src)) { console.warn('missing raw', src); continue; }
  const keyed = sp.key === 'green' ? keyGreen(src) : sp.key === 'both' ? keyBoth(src) : keyBlack(src);
  const trimmed = join(tmp, sp.name + '-trim.png');
  sh('magick', [keyed, '-trim', '+repage', 'PNG32:' + trimmed]);
  const dst = join(out, sp.name + '.webp');
  const enc = capped(trimmed, dst, { w: sp.w, q: 76, maxBytes: 56 * 1024 });
  rec(sp.name, dst, 'sprite', { alpha: true, key: sp.key, cap: '56KB', q: enc.q, over: enc.over, src: sp.name });
}
// The six round-3 plates, recorded as they are.
for (const f of readdirSync(out).filter((f) => f.startsWith('tile-') && f.endsWith('.webp')).sort()) {
  const id = f.replace(/\.webp$/, '');
  rec(id, join(out, f), 'tile', { page: id.replace('tile-', ''), alpha: true, src: 'round3 codex (A3e night), cut by hand' });
}
const total = tiles.reduce((a, t) => a + t.bytes, 0);
writeFileSync(join(out, 'tiles.json'), JSON.stringify({ generatedAt: new Date().toISOString(), tier: 'lazy', note: 'level select only; probed on first show, never on the boot set', totalBytes: total, tiles }, null, 1));
console.log('\ntiles total', (total / 1024).toFixed(0), 'KB in', tiles.length, 'files');
