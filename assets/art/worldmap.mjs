#!/usr/bin/env node
// Cut the world-map terrain plates (project/archive/WORLD_MAP.md § 3, ask 54): the world plate and the five region
// plates, from assets/design/worldmap/build/{world/world-plate,regions/<id>}.png (codex image_gen outputs — briefs
// beside them, runner build/gen-regions.mjs) into public/art/worldmap/*.webp at two tiers (2x = the 1536 source,
// 1x = 1024 wide), plus worldmap.json (the per-asset record build.mjs folds into the art manifests).
//   node assets/art/worldmap.mjs
// Every file is lazy (never on the boot set; the world map probes them on first show). Caps: world ≤ 350 KB per
// tier, region ≤ 300 KB per tier, by stepping quality down (never below q 48), then a 2x region steps its width to 1408.
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const src = join(repo, 'assets/design/worldmap/build');
const out = join(repo, 'public/art/worldmap');
const tmp = join(process.env.TMPDIR || '/tmp', 'trials-art-worldmap');
mkdirSync(tmp, { recursive: true });
mkdirSync(out, { recursive: true });
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
const dims = (f) => sh('magick', ['identify', '-format', '%w %h', f]).split(' ').map(Number);

function webp(inFile, outFile, { w, q }) {
  const t = join(tmp, 'w.png');
  sh('magick', [inFile, '-strip', '-filter', 'Lanczos', '-resize', `${w}x>`, 'PNG24:' + t]);
  sh('cwebp', ['-quiet', '-q', String(q), '-m', '6', '-sharp_yuv', '-metadata', 'none', t, '-o', outFile]);
}
function capped(inFile, outFile, { w, q, maxBytes, minQ = 48, fallbackW = [] }) {
  for (const width of [w, ...fallbackW]) {
    for (let quality = q; quality >= minQ; quality -= 6) {
      webp(inFile, outFile, { w: width, q: quality });
      if (statSync(outFile).size <= maxBytes) return { q: quality, w: width, over: false };
    }
  }
  return { q: minQ, w: [w, ...fallbackW].pop(), over: true };
}

/** The ROCKHOP zones and their crops of the world plate (map units = world-plate pixels); mirror src/ui/worldMap.ts REGIONS. */
const ZONES = [
  { id: 'coast', crop: { x: 0, y: 330, w: 700, h: 467 } },
  { id: 'alpine', crop: { x: 430, y: 300, w: 720, h: 480 } },
  { id: 'quarry', crop: { x: 900, y: 190, w: 636, h: 424 } },
  { id: 'snowline', crop: { x: 1080, y: 140, w: 456, h: 304 } },
];
const REGIONS = ZONES.map((z) => z.id);

const TIERS = [
  { variant: '2x', w: 1536 },
  { variant: '1x', w: 1024 },
];
// Store release (ROCKHOP): `--store` re-encodes the world plate from assets/design/store-release/world/world-plate.png
// (the W-worldmap repaint; round 2 outpainted its top / bottom 158 rows, brief world/briefs/map3.md) and, with
// `--regions`, cuts the four zone plates out of it at the ZONES crops. `--index` only rewrites worldmap.json from
// the plates on disk (the world plate and the four zones). The retired five regions are gone (Brand/UI cutover).
const STORE_PLATE = join(repo, 'assets/design/store-release/world/world-plate.png');
if (process.argv.includes('--store') || process.argv.includes('--index')) {
  const plates = [];
  const rec = (id, file, tags) => {
    const [w, h] = dims(file);
    plates.push({ id, path: 'art/worldmap/' + id + '.webp', kind: 'worldmap', tier: 'lazy', w, h, bytes: statSync(file).size, ...tags });
  };
  const encode = process.argv.includes('--store');
  for (const t of TIERS) {
    const dst = join(out, `world-${t.w}.webp`);
    if (encode) capped(STORE_PLATE, dst, { w: t.w, q: 82, maxBytes: 350 * 1024 });
    rec(`world-${t.w}`, dst, { plate: 'world', variant: t.variant, cap: '350KB', src: 'store-release/world/world-plate' });
  }
  for (const z of ZONES) {
    for (const t of TIERS) {
      const id = `region-${z.id}-${t.w}`;
      const dst = join(out, id + '.webp');
      if (encode && process.argv.includes('--regions')) {
        const cut = join(tmp, `${z.id}.png`);
        const { x, y, w, h } = z.crop;
        sh('magick', [STORE_PLATE, '-crop', `${w}x${h}+${x}+${y}`, '+repage', '-filter', 'Lanczos', '-resize', '1536x', 'PNG24:' + cut]);
        capped(cut, dst, { w: t.w, q: 80, maxBytes: 300 * 1024, fallbackW: t.variant === '2x' ? [1408] : [] });
      }
      rec(id, dst, { plate: 'region', region: z.id, variant: t.variant, cap: '300KB', src: `store-release/world/world-plate@${z.id}` });
    }
  }
  const total = plates.reduce((a, t) => a + t.bytes, 0);
  writeFileSync(join(out, 'worldmap.json'), JSON.stringify({ generatedAt: new Date().toISOString(), tier: 'lazy', note: 'world map (level select) only; probed on first show, never on the boot set', totalBytes: total, plates }, null, 1));
  console.log('worldmap.json:', plates.length, 'plates,', (total / 1024).toFixed(0), 'KB');
  process.exit(0);
}
const plates = [];
const rec = (id, file, kind, tags) => {
  const [w, h] = dims(file);
  const bytes = statSync(file).size;
  plates.push({ id, path: 'art/worldmap/' + id + '.webp', kind, tier: 'lazy', w, h, bytes, ...tags });
  console.log(id.padEnd(28), `${w}x${h}`.padEnd(10), (bytes / 1024).toFixed(0).padStart(4) + ' KB', `q${tags.q}`, tags.over ? 'OVER CAP' : '');
};

{
  const f = join(src, 'world/world-plate.png');
  if (!existsSync(f)) console.warn('missing', f);
  else
    for (const t of TIERS) {
      const id = `world-${t.w}`;
      const dst = join(out, id + '.webp');
      const enc = capped(f, dst, { w: t.w, q: 82, maxBytes: 350 * 1024 });
      rec(id, dst, 'worldmap', { plate: 'world', variant: t.variant, cap: '350KB', q: enc.q, over: enc.over, src: 'world/world-plate' });
    }
}
for (const r of REGIONS) {
  const f = join(src, 'regions', r + '.png');
  if (!existsSync(f)) {
    console.warn('missing region plate', f);
    continue;
  }
  for (const t of TIERS) {
    const id = `region-${r}-${t.w}`;
    const dst = join(out, id + '.webp');
    const enc = capped(f, dst, { w: t.w, q: 80, maxBytes: 300 * 1024, fallbackW: t.variant === '2x' ? [1408] : [] });
    rec(id, dst, 'worldmap', { plate: 'region', region: r, variant: t.variant, cap: '300KB', q: enc.q, over: enc.over, src: `regions/${r}` });
  }
}
const total = plates.reduce((a, t) => a + t.bytes, 0);
writeFileSync(join(out, 'worldmap.json'), JSON.stringify({ generatedAt: new Date().toISOString(), tier: 'lazy', note: 'world map (level select) only; probed on first show, never on the boot set', totalBytes: total, plates }, null, 1));
console.log('\nworldmap total', (total / 1024).toFixed(0), 'KB in', plates.length, 'files');
