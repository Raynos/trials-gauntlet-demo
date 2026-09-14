#!/usr/bin/env node
// Build public/art/** from raw generations.
// usage: node assets/art/build.mjs <rawRoot>       (rawRoot/<name>/<name>.png as written by generate.mjs)
// Reads assets/art/selection.json (which raw candidate each asset uses + per-asset crop hints) and
// assets/art/prompts.mjs (the prompt text), writes public/art/{menu,world,plates}/* and public/art/manifest.json,
// and copies each accepted raw PNG into assets/art/raw/.
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import jobs, { TRACKS } from './prompts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const rawRoot = resolve(process.argv[2] || join(here, 'raw'));
const pub = join(repo, 'public/art');
const rawKeep = join(here, 'raw');
const sel = JSON.parse(readFileSync(join(here, 'selection.json'), 'utf8'));
const jobByName = Object.fromEntries(jobs.map(j => [j.name, j]));
const primary = jobs.filter(j => !/-v\d+$/.test(j.name));   // v2/v3 are alternate sources, selected via selection.json
const tmp = join(process.env.TMPDIR || '/tmp', 'trials-art-build');
mkdirSync(tmp, { recursive: true });
for (const d of ['menu', 'world', 'plates']) mkdirSync(join(pub, d), { recursive: true });
mkdirSync(rawKeep, { recursive: true });

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
const dims = f => sh('magick', ['identify', '-format', '%w %h', f]).split(' ').map(Number);
const src = id => {
  const s = sel.assets[id];
  const name = (s && s.src) || id;
  const f = join(rawRoot, name, name + '.png');
  if (!existsSync(f)) throw new Error(`missing raw for ${id}: ${f}`);
  return { file: f, name, hint: s || {} };
};

const manifest = [];
function record(id, rel, kind, tags, name) {
  const f = join(pub, rel);
  const [w, h] = dims(f);
  const job = jobByName[name];
  manifest.push({ id, path: 'art/' + rel, kind, ...tags, w, h, bytes: statSync(f).size, src: name, prompt: job ? job.prompt : sel.assets[id]?.prompt || '' });
  if (job) copyFileSync(join(rawRoot, name, name + '.png'), join(rawKeep, name + '.png'));
  console.log(rel.padEnd(44), `${w}x${h}`.padEnd(10), (statSync(f).size / 1024).toFixed(0) + ' KB');
}

// --- encoders -------------------------------------------------------------------------------------
function webp(inFile, outRel, { w, q = 80, extra = [] } = {}) {
  const t = join(tmp, 'w.png');
  const args = [inFile, '-strip'];
  if (w) args.push('-filter', 'Lanczos', '-resize', `${w}x`);
  args.push(...extra, 'PNG32:' + t);
  sh('magick', args);
  sh('cwebp', ['-quiet', '-q', String(q), '-m', '6', '-metadata', 'none', t, '-o', join(pub, outRel)]);
}
function webpAlpha(inFile, outRel, { w, q = 80 } = {}) {
  const t = join(tmp, 'wa.png');
  const args = [inFile, '-strip'];
  if (w) args.push('-filter', 'Lanczos', '-resize', `${w}x>`);
  args.push('PNG32:' + t);
  sh('magick', args);
  sh('cwebp', ['-quiet', '-q', String(q), '-alpha_q', '90', '-m', '6', '-metadata', 'none', '-exact', t, '-o', join(pub, outRel)]);
}
function pngAlpha(inFile, outRel, { w } = {}) {
  const out = join(pub, outRel);
  const args = [inFile, '-strip'];
  if (w) args.push('-filter', 'Lanczos', '-resize', `${w}x${w}`);
  args.push('PNG32:' + out);
  sh('magick', args);
  sh('pngquant', ['--force', '--quality', '70-95', '--speed', '1', '--strip', '--output', out, out]);
  sh('oxipng', ['-q', '-o', '4', '--strip', 'all', out]);
}

// Key a flat black background: flood fill from the four corners (interior darks survive), then feather.
function keyBlack(inFile, fuzz = '14%') {
  const t = join(tmp, 'kb.png');
  const [w, h] = dims(inFile);
  sh('magick', [inFile, '-alpha', 'set', '-channel', 'RGBA', '-fuzz', fuzz, '-fill', 'none',
    '-draw', 'color 1,1 floodfill', '-draw', `color ${w - 2},1 floodfill`, '-draw', `color 1,${h - 2} floodfill`, '-draw', `color ${w - 2},${h - 2} floodfill`,
    '-draw', `color ${Math.floor(w / 2)},1 floodfill`, '-draw', `color ${Math.floor(w / 2)},${h - 2} floodfill`, '-draw', `color 1,${Math.floor(h / 2)} floodfill`, '-draw', `color ${w - 2},${Math.floor(h / 2)} floodfill`,
    '+channel', '-channel', 'A', '-morphology', 'Erode', 'Disk:1.0', '-blur', '0x0.7', '+channel', 'PNG32:' + t]);
  return t;
}
// Key a green screen globally (gaps between figures are enclosed, so no flood fill), with despill.
function keyGreen(inFile) {
  const t = join(tmp, 'kg.png');
  const m = join(tmp, 'kg-mask.png');
  const d = join(tmp, 'kg-despill.png');
  // alpha = 1 - clamp((g - max(r,b) - 0.06) / 0.28): green dominance -> transparent
  sh('magick', [inFile, '-colorspace', 'sRGB', '-fx', '1-min(1,max(0,(g-max(r,b)-0.06)/0.28))', '-morphology', 'Erode', 'Disk:1.0', '-blur', '0x0.6', m]);
  // despill: green may never exceed max(r,b)
  sh('magick', [inFile, '-colorspace', 'sRGB', '-channel', 'G', '-fx', 'min(g,max(r,b))', '+channel', d]);
  sh('magick', [d, m, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', '-trim', '+repage', 'PNG32:' + t]);
  return t;
}
// Horizontal tile fix: roll by half width so the old edges meet in the middle, then blend the middle
// strip with its own mirror so the seam becomes symmetric (continuous). Edges now come from the image centre.
function tileX(inFile, outPng, blendFrac = 0.18) {
  const [w, h] = dims(inFile);
  const bw = Math.round(w * blendFrac);
  const half = Math.floor(w / 2);
  const mask = join(tmp, 'tile-mask.png');
  const rolled = join(tmp, 'tile-rolled.png');
  // mask: 0 everywhere, ramping 0 -> 0.5 -> 0 across the centre 2*bw columns (peak at the old seam)
  sh('magick', ['-size', `${bw}x${h}`, '-define', 'gradient:direction=East', 'gradient:black-white', '(', '+clone', '-flop', ')', '+append',
    '-evaluate', 'multiply', '0.5', '-background', 'black', '-gravity', 'Center', '-extent', `${w}x${h}`, mask]);
  sh('magick', [inFile, '-roll', `+${half}+0`, 'PNG32:' + rolled]);
  // rolled = image with the old left/right edges meeting at x = w/2; blend that strip with its own mirror
  sh('magick', [rolled, '(', rolled, '-flop', mask, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', ')', '-compose', 'Over', '-composite', 'PNG32:' + outPng]);
}
function alphaFadeBottom(inFile, outPng, frac = 0.22) {
  const [w, h] = dims(inFile);
  const fh = Math.round(h * frac);
  sh('magick', [inFile, '-alpha', 'set', '(', '-size', `${w}x${h - fh}`, 'xc:white', '-size', `${w}x${fh}`, 'gradient:white-black', '-append', ')',
    '-compose', 'CopyOpacity', '-composite', 'PNG32:' + outPng]);
}

// --- 1. menu ----------------------------------------------------------------------------------------
for (const id of sel.keyart) {
  const { file, name } = src(id);
  webp(file, `menu/${id}-1920.webp`, { w: 1920, q: 82 });
  record(`${id}-1920`, `menu/${id}-1920.webp`, 'keyart', { biome: jobByName[name].biome, variant: '2x' }, name);
  webp(file, `menu/${id}-960.webp`, { w: 960, q: 80 });
  record(`${id}-960`, `menu/${id}-960.webp`, 'keyart', { biome: jobByName[name].biome, variant: '1x' }, name);
}
{
  const { file, name } = src('wordmark-plate');
  webp(file, 'menu/wordmark-plate.webp', { w: 1536, q: 78 });
  record('wordmark-plate', 'menu/wordmark-plate.webp', 'plate-menu', { use: 'title-background' }, name);
}
{
  const { file, name } = src('loading-plate');
  webp(file, 'menu/loading-plate.webp', { w: 1536, q: 76 });
  record('loading-plate', 'menu/loading-plate.webp', 'plate-menu', { use: 'loading' }, name);
}
for (const tier of ['beginner', 'easy', 'medium', 'hard', 'extreme']) {
  const { file, name } = src(`tier-${tier}`);
  webp(file, `menu/tier-${tier}.webp`, { w: 768, q: 78 });
  record(`tier-${tier}`, `menu/tier-${tier}.webp`, 'tier-card', { tier, biome: jobByName[name].biome }, name);
}
for (const t of TRACKS) {
  const { file, name } = src(`track-${t.id}`);
  webp(file, `menu/track-${t.id}.webp`, { w: 768, q: 74 });
  record(`track-${t.id}`, `menu/track-${t.id}.webp`, 'track-card', { track: t.id, tier: t.tier, biome: t.biome }, name);
}
for (const m of ['bronze', 'silver', 'gold', 'platinum']) {
  const { file, name, hint } = src(`medal-${m}`);
  const keyed = keyBlack(file, hint.fuzz || '14%');
  pngAlpha(keyed, `menu/medal-${m}.png`, { w: 256 });
  record(`medal-${m}`, `menu/medal-${m}.png`, 'medal', { medal: m }, name);
}
for (const b of ['industrial', 'canyon', 'snow', 'nightCity', 'foundry']) {
  const { file, name } = src(`results-${b}`);
  webp(file, `menu/results-${b}.webp`, { w: 1152, q: 68 });
  record(`results-${b}`, `menu/results-${b}.webp`, 'results-bg', { biome: b }, name);
}

// --- 2. world -----------------------------------------------------------------------------------------
for (const j of primary.filter(j => j.kind === 'stencil')) {
  const { file, name } = src(j.name);
  webp(file, `world/${j.name}.webp`, { w: 1024, q: 78, extra: ['-colorspace', 'Gray'] });
  record(j.name, `world/${j.name}.webp`, 'stencil', { tint: 'white-on-black' }, name);
}
for (const j of primary.filter(j => j.kind === 'mask')) {
  const { file, name } = src(j.name);
  webp(file, `world/${j.name}.webp`, { w: 1024, q: 78, extra: ['-colorspace', 'Gray'] });
  record(j.name, `world/${j.name}.webp`, 'mask', { tint: 'white-on-black' }, name);
}
for (const j of primary.filter(j => j.kind === 'sign')) {
  const { file, name } = src(j.name);
  webp(file, `world/${j.name}.webp`, { w: 512, q: 78 });
  record(j.name, `world/${j.name}.webp`, 'sign', {}, name);
}
for (const j of primary.filter(j => j.kind === 'graffiti')) {
  const { file, name, hint } = src(j.name);
  const keyed = keyBlack(file, hint.fuzz || '12%');
  webpAlpha(keyed, `world/${j.name}.webp`, { w: 768, q: 76 });
  record(j.name, `world/${j.name}.webp`, 'graffiti', { alpha: true }, name);
}
for (const j of primary.filter(j => j.kind === 'banner')) {
  const { file, name } = src(j.name);
  webp(file, `world/${j.name}.webp`, { w: 1024, q: 76 });
  record(j.name, `world/${j.name}.webp`, 'banner', {}, name);
}
for (const j of primary.filter(j => j.kind === 'crowd')) {
  const { file, name } = src(j.name);
  const keyed = keyGreen(file);
  webpAlpha(keyed, `world/${j.name}.webp`, { w: 1024, q: 80 });
  record(j.name, `world/${j.name}.webp`, 'crowd', { alpha: true, time: j.time, figures: 8 }, name);
}

// --- 3. plates ----------------------------------------------------------------------------------------
for (const j of primary.filter(j => j.kind === 'plate-far')) {
  const { file, name, hint } = src(j.name);
  const [w, h] = dims(file);
  const bandH = Math.round(w / 4);
  const y = hint.bandY ?? Math.round((h - bandH) / 2);
  const crop = join(tmp, 'crop.png'), tiled = join(tmp, 'tiled.png'), faded = join(tmp, 'faded.png');
  sh('magick', [file, '-crop', `${w}x${bandH}+0+${y}`, '+repage', '-filter', 'Lanczos', '-resize', '2048x512!', 'PNG32:' + crop]);
  tileX(crop, tiled);
  alphaFadeBottom(tiled, faded, hint.fade ?? 0.22);
  webpAlpha(faded, `plates/${j.name}.webp`, { q: 80 });
  record(j.name, `plates/${j.name}.webp`, 'plate-far', { biome: j.biome, tileX: true, alphaFadeBottom: hint.fade ?? 0.22 }, name);
}
for (const j of primary.filter(j => j.kind === 'sky')) {
  const { file, name, hint } = src(j.name);
  const [w, h] = dims(file);
  const bandH = Math.round(w / 2);
  const y = hint.bandY ?? Math.round((h - bandH) / 2);
  const crop = join(tmp, 'scrop.png'), tiled = join(tmp, 'stiled.png');
  sh('magick', [file, '-crop', `${w}x${bandH}+0+${y}`, '+repage', '-filter', 'Lanczos', '-resize', '2048x1024!', 'PNG32:' + crop]);
  tileX(crop, tiled, 0.22);
  webp(tiled, `plates/${j.name}.webp`, { q: 76 });
  record(j.name, `plates/${j.name}.webp`, 'sky', { biome: j.biome, tileX: true }, name);
}

// --- manifest -----------------------------------------------------------------------------------------
const folders = {};
for (const m of manifest) { const f = m.path.split('/')[1]; folders[f] = (folders[f] || 0) + m.bytes; }
const MENU_CRITICAL = new Set(['keyart', 'tier-card', 'track-card', 'medal']);
const menuCritical = manifest.filter(m => MENU_CRITICAL.has(m.kind) || m.id === 'wordmark-plate');
const out = { generatedAt: new Date().toISOString(), generator: 'OpenAI image generation via Codex CLI; optimised with ImageMagick + cwebp + pngquant + oxipng', counts: { total: manifest.length, byFolder: Object.fromEntries(Object.entries(folders).map(([k]) => [k, manifest.filter(m => m.path.split('/')[1] === k).length])) }, bytesByFolder: folders, totalBytes: Object.values(folders).reduce((a, b) => a + b, 0), menuCritical: { note: 'first menu screen: key art, wordmark plate, tier + track cards, medals', count: menuCritical.length, bytes: menuCritical.reduce((a, m) => a + m.bytes, 0) }, rejected: sel.rejected, assets: manifest };
writeFileSync(join(pub, 'manifest.json'), JSON.stringify(out, null, 1));
console.log('\nbytes by folder', folders, 'total', out.totalBytes, 'menu-critical', out.menuCritical.bytes);
