#!/usr/bin/env node
// Native icon / launch / store-graphic pipeline for the Rockhop shells (docs/plans/STORE_RELEASE.md Phase 5–6).
//
//   node scripts/store-assets.mjs [--icon <1024² png>] [--wordmark <png, transparent>] [--feature <png>]
//
// One master per role in, every platform size out — so when the Brand/UI owner's masters land in `assets/brand/`
// this is re-run and nothing else changes. Sources, first that exists wins:
//   icon      --icon · assets/brand/icon-1024.png · assets/design/store-release/round2/I1.png (D23: icon I1)
//   wordmark  --wordmark · assets/brand/wordmark.png · cropped from assets/design/store-release/round1/A-brand.png
//   feature   --feature · assets/brand/feature-graphic.png · assets/design/store-release/round2/F1.png (D23: F1)
//
// Writes:
//   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png   1024², no alpha (App Store rule)
//   ios/App/App/Assets.xcassets/Wordmark.imageset/wordmark@{1,2,3}x.png  the launch storyboard's wordmark
//   android/app/src/main/res/mipmap-*/ic_launcher{,_round,_foreground}.png  legacy + adaptive layers
//   android/app/src/main/res/values/ic_launcher_background.xml          the adaptive background colour
//   android/app/src/main/res/drawable{,-land-*,-port-*}/splash.png       pre-Android-12 launch image
//   store/play/icon-512.png · store/play/feature-graphic-1024x500.png · store/app-store/icon-1024.png
//
// Needs ImageMagick 7 (`magick`) on PATH. Deterministic for a given input + ImageMagick version.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? resolve(args[i + 1]) : null;
};
const first = (...paths) => paths.filter(Boolean).map((p) => resolve(repo, p)).find((p) => existsSync(p)) ?? null;

/** Brand palette (assets/design/store-release/round1/A-brand): sandstone cream, deep teal. */
const CREAM = '#EFE3C8';
/** I1's own field teal (sampled at its edges), so the adaptive icon's margin never shows a seam. */
const ICON_TEAL = '#0B5F67';

const magick = (...a) => execFileSync('magick', a.map(String), { stdio: ['ignore', 'pipe', 'inherit'] });
const out = (rel) => {
  const p = join(repo, rel);
  mkdirSync(dirname(p), { recursive: true });
  return p;
};

const icon = first(arg('icon'), 'assets/brand/icon-1024.png', 'assets/design/store-release/round2/I1.png');
const feature = first(arg('feature'), 'assets/brand/feature-graphic.png', 'assets/design/store-release/round2/F1.png');
let wordmark = first(arg('wordmark'), 'assets/brand/wordmark.png');
if (!icon || !feature) throw new Error('store-assets: icon or feature master missing');

const tmp = join(repo, 'node_modules', '.cache', 'store-assets');
mkdirSync(tmp, { recursive: true });
if (!wordmark) {
  // Placeholder until assets/brand/wordmark.png lands: A-brand's primary wordmark, its cream field keyed out.
  wordmark = join(tmp, 'wordmark-from-A-brand.png');
  magick(join(repo, 'assets/design/store-release/round1/A-brand.png'), '-crop', '836x165+28+92', '+repage', '-fuzz', '14%', '-transparent', 'rgb(238,225,201)', '-trim', '+repage', wordmark);
}
console.info(`store-assets: icon ${icon}\n              wordmark ${wordmark}\n              feature ${feature}`);

// ── iOS ────────────────────────────────────────────────────────────────────────────────────────────────────────
const appicon = 'ios/App/App/Assets.xcassets/AppIcon.appiconset';
for (const f of readdirSync(join(repo, appicon))) if (f.endsWith('.png')) rmSync(join(repo, appicon, f));
magick(icon, '-resize', '1024x1024!', '-background', ICON_TEAL, '-alpha', 'remove', '-alpha', 'off', `PNG24:${out(`${appicon}/AppIcon-1024.png`)}`);
writeFileSync(out(`${appicon}/Contents.json`), `${JSON.stringify({ images: [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2)}\n`);

const splashSet = join(repo, 'ios/App/App/Assets.xcassets/Splash.imageset');
if (existsSync(splashSet)) rmSync(splashSet, { recursive: true });
const wm = 'ios/App/App/Assets.xcassets/Wordmark.imageset';
// The launch storyboard draws the wordmark at half the screen's long side: ≤ 480 pt on an iPhone.
for (const s of [1, 2, 3]) magick(wordmark, '-filter', 'Lanczos', '-resize', `${480 * s}x`, out(`${wm}/wordmark@${s}x.png`));
writeFileSync(out(`${wm}/Contents.json`), `${JSON.stringify({ images: [1, 2, 3].map((s) => ({ filename: `wordmark@${s}x.png`, idiom: 'universal', scale: `${s}x` })), info: { author: 'xcode', version: 1 } }, null, 2)}\n`);

// ── Android ────────────────────────────────────────────────────────────────────────────────────────────────────
const res = 'android/app/src/main/res';
const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENSITY)) {
  const legacy = Math.round(48 * k);
  const layer = Math.round(108 * k);
  // Legacy (API < 26) square and round icons.
  magick(icon, '-resize', `${legacy}x${legacy}`, out(`${res}/mipmap-${d}/ic_launcher.png`));
  magick(icon, '-resize', `${legacy}x${legacy}`, '(', '-size', `${legacy}x${legacy}`, 'xc:none', '-fill', 'white', '-draw', `circle ${legacy / 2 - 0.5},${legacy / 2 - 0.5} ${legacy / 2 - 0.5},0`, ')', '-compose', 'DstIn', '-composite', out(`${res}/mipmap-${d}/ic_launcher_round.png`));
  // Adaptive foreground: the whole icon over the 72 dp the launcher mask can show (plus 4 dp bleed), on a 108 dp layer.
  const inner = Math.round(76 * k);
  magick('-size', `${layer}x${layer}`, 'xc:none', '(', icon, '-resize', `${inner}x${inner}`, ')', '-gravity', 'center', '-composite', out(`${res}/mipmap-${d}/ic_launcher_foreground.png`));
}
writeFileSync(out(`${res}/values/ic_launcher_background.xml`), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${ICON_TEAL}</color>\n</resources>\n`);

// Pre-Android-12 launch window background: cream, the wordmark at half the long side. (12+ draws the system
// splash from the launch theme: cream + the icon, android/app/src/main/res/values/styles.xml.)
const SPLASH = { mdpi: [480, 320], hdpi: [800, 480], xhdpi: [1280, 720], xxhdpi: [1600, 960], xxxhdpi: [1920, 1280] };
const splash = (w, h, file) => magick('-size', `${w}x${h}`, `xc:${CREAM}`, '(', wordmark, '-filter', 'Lanczos', '-resize', `${Math.round(Math.max(w, h) / 2)}x`, ')', '-gravity', 'center', '-composite', out(file));
for (const [d, [w, h]] of Object.entries(SPLASH)) {
  splash(w, h, `${res}/drawable-land-${d}/splash.png`);
  splash(h, w, `${res}/drawable-port-${d}/splash.png`);
}
splash(480, 320, `${res}/drawable/splash.png`);

// ── Store graphics ─────────────────────────────────────────────────────────────────────────────────────────────
magick(icon, '-resize', '1024x1024!', '-background', ICON_TEAL, '-alpha', 'remove', '-alpha', 'off', `PNG24:${out('store/app-store/icon-1024.png')}`);
magick(icon, '-resize', '512x512', `PNG32:${out('store/play/icon-512.png')}`);
// F1 is a 1536×1024 canvas with a 2.048:1 band between black bars (rows 137–886): crop 2 px inside the band on every
// side (the bars' anti-aliased edge) and scale to Play's 1024×500. A brand master of the right size is used as is.
const [fw, fh] = magick('identify', '-format', '%w %h', feature).toString().trim().split(' ').map(Number);
if (fw === 1024 && fh === 500) magick(feature, '-alpha', 'off', `PNG24:${out('store/play/feature-graphic-1024x500.png')}`);
else if (fw === 1536 && fh === 1024) magick(feature, '-crop', '1528x746+4+139', '+repage', '-filter', 'Lanczos', '-resize', '1024x500!', '-alpha', 'off', `PNG24:${out('store/play/feature-graphic-1024x500.png')}`);
else throw new Error(`store-assets: feature master ${fw}×${fh} is neither 1024×500 nor the F1 1536×1024 canvas`);
console.info('store-assets: done');
