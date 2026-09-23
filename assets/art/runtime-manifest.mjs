// The art pack's two manifests (docs/plans/STORE_RELEASE.md P0.2).
//
//   assets/art/manifest.json   the full record: generator, per-asset prompt / source name / notes, rejected
//                              candidates. Development only — never in a bundle.
//   public/art/manifest.json   what the game reads at runtime (src/ui/art.ts, src/render/art/library.ts,
//                              vite.config.ts's boot byte table): ids, paths, sizes, versions and the tags the
//                              lookups filter on. Nothing else — no prompt text ships.
//
// build.mjs writes both through `writeManifests`; `node assets/art/runtime-manifest.mjs` re-derives the runtime
// copy from the full one (after a hand edit).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const FULL_MANIFEST = join(here, 'manifest.json');
export const RUNTIME_MANIFEST = resolve(here, '../../public/art/manifest.json');

/** Retired from the shipped world (store release P0.2): Trials-coded or a real brand. build.mjs never emits them. */
export const RETIRED = new Set([
  'graffiti-nofear',
  'graffiti-rise',
  'poster-trials-night',
  'banner-ironworks-series',
  // Store release Phase 3: the real-render thumbs of the retired curriculum (assets/art/thumbs.mts THUMB_X). Those
  // tracks are dev-only now (src/tracks `RETIRED_TRACKS`), so their cards never show; the ids and file names carried
  // retired level names ("x3-gauntlet", "see-saw", "stairway") into both manifests.
  ...['b1-first-ride', 'b2-lean-back', 'b3-kicker-row', 'e1-uphill-weight', 'e2-rear-wheel-first', 'e3-stairway', 'm1-hop-up', 'm2-drum-roll', 'm3-see-saw', 'h1-wheelie-wire', 'h2-gap-chain', 'h3-fire-line', 'x1-vertical-limit', 'x2-pipe-dream', 'x3-gauntlet'].map((id) => `thumb-${id}`),
]);

/** Per-asset fields the runtime reads. Anything else (prompt, src, note, shot, recording, …) stays in the full manifest. */
const RUNTIME_FIELDS = ['id', 'path', 'kind', 'w', 'h', 'bytes', 'v', 'biome', 'track', 'tier', 'medal', 'variant', 'bike', 'tileX', 'alpha', 'alphaFadeBottom', 'time', 'figures'];

const folderOf = (m) => (m.path.split('/').length > 2 ? m.path.split('/')[1] : 'root');
const MENU_CRITICAL = new Set(['keyart', 'tier-card', 'track-card', 'medal']);

/** The full manifest's summary block around an asset list (counts and bytes by folder, the first-menu set). */
export function fullManifest(assets, rejected, generatedAt = new Date().toISOString()) {
  const folders = {};
  for (const m of assets) folders[folderOf(m)] = (folders[folderOf(m)] || 0) + m.bytes;
  const menuCritical = assets.filter((m) => MENU_CRITICAL.has(m.kind) || m.id === 'wordmark-plate');
  return {
    generatedAt,
    generator: 'OpenAI image generation via Codex CLI; optimised with ImageMagick + cwebp + pngquant + oxipng',
    counts: { total: assets.length, byFolder: Object.fromEntries(Object.keys(folders).map((k) => [k, assets.filter((m) => folderOf(m) === k).length])) },
    bytesByFolder: folders,
    totalBytes: Object.values(folders).reduce((a, b) => a + b, 0),
    menuCritical: { note: 'first menu screen: key art, wordmark plate, tier + track cards, medals', count: menuCritical.length, bytes: menuCritical.reduce((a, m) => a + m.bytes, 0) },
    rejected,
    assets,
  };
}

/** The runtime manifest: the asset list with only `RUNTIME_FIELDS`, retired ids dropped. */
export function runtimeManifest(full) {
  const assets = full.assets.filter((a) => !RETIRED.has(a.id)).map((a) => Object.fromEntries(RUNTIME_FIELDS.filter((k) => a[k] !== undefined).map((k) => [k, a[k]])));
  return { assets };
}

export function writeManifests(full) {
  writeFileSync(FULL_MANIFEST, JSON.stringify(full, null, 1));
  writeFileSync(RUNTIME_MANIFEST, JSON.stringify(runtimeManifest(full), null, 1));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const full = JSON.parse(readFileSync(FULL_MANIFEST, 'utf8'));
  const kept = full.assets.filter((a) => !RETIRED.has(a.id));
  writeManifests(kept.length === full.assets.length ? full : fullManifest(kept, full.rejected, full.generatedAt));
  console.log(`art manifests: ${kept.length} assets (full ${FULL_MANIFEST}, runtime ${RUNTIME_MANIFEST})`);
}
