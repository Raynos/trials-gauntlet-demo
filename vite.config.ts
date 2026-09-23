import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { HERO_FILES_BY_OUTFIT } from './src/render/hero/urls';
import { declaredBootTotals, emptyBootTotals, offlinePackBytes, type DeclaredBootTotals } from './src/boot/asset-totals';
import { modelAssetsPlugin, type ModelAsset } from './src/boot/model-catalog';
import { REGIONS } from './src/ui/worldMap';

/** esbuild's own API (bundling the inline loader). Not a direct dependency: resolved through Vite's, so the two never disagree. */
interface Esbuild {
  build(o: { entryPoints: string[]; bundle: boolean; write: false; format: 'iife'; platform: 'browser'; target: string; minify: boolean; charset: 'utf8'; legalComments: 'none'; define: Record<string, string> }): Promise<{ outputFiles: { text: string }[] }>;
  transform(code: string, o: { minify: boolean; format: 'esm'; target: string; sourcemap: boolean; charset: 'utf8' }): Promise<{ code: string; map: string }>;
}
const esbuild = createRequire(createRequire(import.meta.url).resolve('vite'))('esbuild') as Esbuild;

/**
 * `pnpm build:store` (docs/plans/STORE_RELEASE.md P0.3): the App Store / Google Play bundle. The game reads the
 * same flag as `import.meta.env.VITE_STORE` (src/core/release.ts); here it drops the service worker, the version
 * probe and the inline loader's `?harness=1` route. `VITE_STORE_DEBUG=1` keeps the automation hook (native gate).
 */
const STORE_BUILD = process.env['VITE_STORE'] === '1';
const STORE_DEBUG = process.env['VITE_STORE_DEBUG'] === '1';

/**
 * `src/core/release.ts` as literal constants for this build. The module itself reads `import.meta.env` (so vitest
 * and the tsx harness get a normal build), but a derived const is not something Rollup folds at every import
 * site; literal exports are, so each `if (DEV_SURFACES)` / `AUTOMATION_HOOK &&` branch is dropped whole.
 */
function releaseFlags(): Plugin {
  let file = path.resolve('src', 'core', 'release.ts');
  return {
    name: 'rockhop:release-flags',
    enforce: 'pre',
    configResolved(c) {
      file = path.resolve(c.root, 'src', 'core', 'release.ts');
    },
    load(id) {
      if (path.resolve(id.split('?')[0]!) !== file) return null;
      return `export const STORE = ${STORE_BUILD};\nexport const DEV_SURFACES = ${!STORE_BUILD};\nexport const AUTOMATION_HOOK = ${!STORE_BUILD || STORE_DEBUG};\n`;
    },
  };
}

/**
 * Store release Phase 3: the retired tracks (curriculum, `p<n>-*` playgrounds, Labs) leave the entry chunk.
 * `src/tracks/courses/eager.ts` is the registry's only static edge to them; in a production build it loads as
 * empty arrays, one `export const <name> = [];` per name it re-exports. The web build then carries the set as the
 * lazy dev chunk `assets/retired-*.js` (`loadRetiredTracks()`, fetched only by a `?` dev URL); the store build folds
 * that import away and has no retired course at all. `vite dev`, vitest and the tsx harness keep the real module.
 */
function retiredTracksLazy(): Plugin {
  let file = path.resolve('src', 'tracks', 'courses', 'eager.ts');
  return {
    name: 'rockhop:retired-tracks-lazy',
    apply: 'build',
    enforce: 'pre',
    configResolved(c) {
      file = path.resolve(c.root, 'src', 'tracks', 'courses', 'eager.ts');
    },
    load(id) {
      if (path.resolve(id.split('?')[0]!) !== file) return null;
      const src = fs.readFileSync(file, 'utf8').replace(/\/\*[^]*?\*\//g, '');
      const names = [...src.matchAll(/export\s*\{([^}]*)\}/g)].flatMap((m) => m[1]!.split(',').map((n) => n.trim()).filter(Boolean));
      if (!names.length || names.some((n) => !/^[A-Z_]+$/.test(n))) throw new Error(`retiredTracksLazy: ${file} must re-export UPPER_CASE track arrays only, got ${names.join(', ') || 'none'}`);
      return names.map((n) => `export const ${n} = [];`).join('\n') + '\n';
    },
  };
}

/** The lazy dev chunk of the retired tracks (`retiredTracksLazy`): never fetched by a player, never in a store build. */
const DEV_CHUNK = /^assets\/retired-[\w-]+\.js$/;

/** The inline loader script (`src/boot/inline.ts` bundled) must paint with the first HTML bytes: ≤ 8 KB minified. */
const INLINE_BUDGET_BYTES = 8 * 1024;

/**
 * CONTRACT §3: JS bundle ≤ 600 KB gzipped. Fails the build when exceeded.
 *
 * Ask 84 §3 made the game's own chunks ship with their real identifiers (`readableStacks` below): +29.6 KB gz
 * on the entry chunk, measured A/B on one tree (570.0 → 599.8 KB by this plugin's count, which leaves out the
 * audio-worklet asset the ship gate's `bundle.jsGzipKB` also sums). The +30 KB is real, so the build's budget
 * moves by 40 KB (the delta plus the headroom it ate); the gate's threshold and the CONTRACT line are the
 * parent's call.
 */
const BUNDLE_BUDGET_GZ_BYTES = 640 * 1024;

function bundleBudget(): Plugin {
  return {
    name: 'rockhop:bundle-budget',
    apply: 'build',
    generateBundle(_options, bundle) {
      let total = 0;
      const rows: string[] = [];
      for (const [name, item] of Object.entries(bundle)) {
        if (item.type !== 'chunk') continue;
        const gz = gzipSync(Buffer.from(item.code)).length;
        // The retired tracks' dev chunk is fetched only by a `?` dev URL and absent from the store build: listed, not budgeted.
        const dev = DEV_CHUNK.test(name);
        if (!dev) total += gz;
        rows.push(`  ${name.padEnd(40)} ${(gz / 1024).toFixed(1).padStart(8)} KB gz${dev ? '  (dev-only, not budgeted)' : ''}`);
      }
      const ok = total <= BUNDLE_BUDGET_GZ_BYTES;
      const line = `bundle budget: ${(total / 1024).toFixed(1)} KB gz of ${(BUNDLE_BUDGET_GZ_BYTES / 1024).toFixed(0)} KB — ${ok ? 'OK' : 'OVER BUDGET'}`;
      this.info(`\n${rows.join('\n')}\n${line}`);
      if (!ok) this.error(line);
    },
  };
}

/**
 * Load manifest + boot plan tables (docs/design/game.md §12, docs/tasks/loading-progress-invariant.md).
 *
 *   dist/load-manifest.json        every emitted chunk / asset plus the public-dir files, with raw and
 *                                  gzip bytes and a phase tag — the service worker's precache list
 *                                  (`core` + `title`). The loader no longer reads it.
 *   src/boot/plan.generated.ts     `PUBLIC_BYTES`: byte size per public file the boot may read (models by
 *                                  path, art by id) with literal keys, so `src/boot/steps.ts` sums the
 *                                  declared DOWNLOAD totals at compile time and a renamed file fails
 *                                  `pnpm typecheck`. Committed; regenerated by every build / dev start.
 *   index.html                     `src/boot/inline.ts` bundled by esbuild (TypeScript, ≤ 8 KB) replaces the
 *                                  `<script id="boot">` tag, with the core file list (entry, three, CSS,
 *                                  fonts — what the inline streams) and the build sha compiled in. The HTML's
 *                                  own module script / modulepreload tags are stripped so nothing downloads
 *                                  twice; the entry URL travels in `#loader[data-entry]`.
 */
interface LoadItem {
  path: string;
  bytes: number;
  gz: number;
  phase: 'core' | 'title' | 'menu' | 'world' | 'worldmap' | 'models' | 'models-lod' | 'audio-worklet' | 'other' | 'dev';
  label?: string;
}

const ART_PHASE: Record<string, LoadItem['phase']> = { keyart: 'title', 'plate-menu': 'title', 'track-card': 'menu', 'tier-card': 'menu', medal: 'menu', 'results-bg': 'menu' };

function publicItems(root: string): LoadItem[] {
  const items: LoadItem[] = [];
  const pub = path.join(root, 'public');
  const stat = (rel: string): number => {
    try {
      return fs.statSync(path.join(pub, rel)).size;
    } catch {
      return 0;
    }
  };
  const fontsDir = path.join(pub, 'fonts');
  for (const f of fs.existsSync(fontsDir) ? fs.readdirSync(fontsDir) : []) {
    if (f.endsWith('.woff2')) items.push({ path: `./fonts/${f}`, bytes: stat(`fonts/${f}`), gz: stat(`fonts/${f}`), phase: 'core', label: `font ${f.replace(/BarlowCondensed-|\.woff2/g, '')}` });
  }
  try {
    const raw = fs.readFileSync(path.join(pub, 'art', 'manifest.json'));
    const m = JSON.parse(raw.toString('utf8')) as { assets?: Array<{ path?: string; kind?: string; bytes?: number; id?: string }> };
    items.push({ path: './art/manifest.json', bytes: raw.length, gz: gzipSync(raw).length, phase: 'title', label: 'art manifest' });
    for (const a of m.assets ?? []) {
      if (!a.path) continue;
      const bytes = a.bytes ?? stat(a.path);
      items.push({ path: `./${a.path}`, bytes, gz: bytes, phase: (a.kind && ART_PHASE[a.kind]) || 'world', label: a.id ?? a.path });
    }
  } catch {
    /* no art pack */
  }
  // The world map's plates are `<img>`-loaded by src/ui/worldMapScreen.ts, never listed in the art
  // manifest — so until this walk existed the service worker could not even name them (plan §2.1(d)).
  const wm = path.join(pub, 'art', 'worldmap');
  for (const f of (fs.existsSync(wm) ? fs.readdirSync(wm) : []).sort()) {
    const b = stat(`art/worldmap/${f}`);
    if (b) items.push({ path: `./art/worldmap/${f}`, bytes: b, gz: b, phase: 'worldmap', label: `worldmap ${f}` });
  }
  // iOS launch images (assets/art/splash.mjs): iOS fetches these itself when the app is added to the
  // home screen, so nothing in the page requests them -- they are listed so the worker can name them
  // and so the deploy's byte table is honest, not so the boot spends 1.2 MB on them.
  const splash = path.join(pub, 'art', 'splash');
  for (const f of (fs.existsSync(splash) ? fs.readdirSync(splash) : []).sort()) {
    const b = stat(`art/splash/${f}`);
    if (b) items.push({ path: `./art/splash/${f}`, bytes: b, gz: b, phase: 'title', label: `splash ${f}` });
  }
  for (const f of ['manifest.webmanifest', 'offline.html', 'art/icons/icon-192.png', 'art/icons/icon-maskable-192.png', 'art/icons/apple-touch-icon.png', 'art/icons/apple-touch-icon-152.png', 'art/icons/apple-touch-icon-167.png', 'art/icons/favicon-32.png', 'art/icons/favicon.svg']) {
    const b = stat(f);
    if (b) items.push({ path: `./${f}`, bytes: b, gz: b, phase: 'title', label: f });
  }
  // `public/models/**` is deliberately NOT walked (ask 59.1): those flat files are the SOURCE the catalog
  // snapshots, not a deployed URL. The runtime fetches only the content-addressed copies the catalog emits
  // (`models/<pair>/<name>-<digest>.glb`), which reach this manifest through the bundle walk above — listing
  // the flat copies too both named files nothing requests and double-counted 26.9 MB of models.
  return items;
}


/** `src/boot/plan.generated.ts` from a walk of public/ — deterministic (sorted keys, no timestamp), so it only changes when the files do. */
export function writeBootPlanTable(root: string, modelAssets?: readonly ModelAsset[]): DeclaredBootTotals {
  const pub = path.join(root, 'public');
  const rows = new Map<string, number>();
  const models = path.join(pub, 'models');
  if (fs.existsSync(models)) {
    const walk = (dir: string, rel: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(dir, e.name), `${rel}${e.name}/`);
        else rows.set(`models/${rel}${e.name}`, fs.statSync(path.join(dir, e.name)).size);
      }
    };
    walk(models, '');
  }
  // Model denominators describe the exact byte snapshots emitted/served by the catalog plugin,
  // even if a source file is replaced while the rest of this table is being assembled.
  for (const asset of modelAssets ?? []) rows.set(asset.logical, asset.bytes.length);
  // Ask 59: the pack's `kind` / `variant` are what `packMembership` buckets the offline pack by (og.jpg is
  // never fetched; a `1x`/`2x` pair is fetched by half the devices). Only the build has read the manifest,
  // so it classifies once here and writes the three sums into the generated table.
  const facets = new Map<string, { kind?: string; variant?: string }>();
  try {
    const m = JSON.parse(fs.readFileSync(path.join(pub, 'art', 'manifest.json'), 'utf8')) as { assets?: Array<{ id?: string; path?: string; bytes?: number; kind?: string; variant?: string }> };
    for (const a of m.assets ?? []) {
      if (!a.id || !a.path) continue;
      let bytes = a.bytes ?? 0;
      try {
        bytes = fs.statSync(path.join(pub, a.path)).size;
      } catch {
        /* manifest bytes */
      }
      rows.set(`art:${a.id}`, bytes);
      facets.set(a.id, { ...(a.kind ? { kind: a.kind } : {}), ...(a.variant ? { variant: a.variant } : {}) });
    }
  } catch {
    /* no art pack: the table has no art keys and steps.ts fails to typecheck — a boot that awaits art it cannot have is a build error, not a 44 % */
  }
  // Ask 58: the world map's plates are `<img>`-loaded and are in no manifest the boot reads, so they are
  // put in the byte table here — one key per file; `platePackMembership` splits the two tiers, and a
  // device fetches the one `worldMapUrls()` names.
  const wm = path.join(pub, 'art', 'worldmap');
  for (const f of fs.existsSync(wm) ? fs.readdirSync(wm).sort() : []) rows.set(`art/worldmap/${f}`, fs.statSync(path.join(wm, f)).size);
  const pack = offlinePackBytes(rows, (id) => facets.get(id) ?? {}, REGIONS.map((r) => r.id));
  const keys = [...rows.keys()].sort();
  const body = keys.map((k) => `  ${JSON.stringify(k)}: ${rows.get(k)},`).join('\n');
  const src = [
    '// generated by vite.config.ts rockhop:load-manifest from public/ — do not edit.',
    '// Committed so `pnpm typecheck` needs no build; regenerated by every `vite build` / `vite dev` and it only changes when public/ files do.',
    '// Byte size per file the boot may read: models by path, art by `art:<id>`. Literal keys: src/boot/steps.ts indexes these at compile time.',
    'export const PUBLIC_BYTES = {',
    body,
    '} as const;',
    '',
    '// The offline pack as each device tier downloads it (`packMembership`, src/boot/asset-totals.ts):',
    '// tier-free assets in both, og.jpg in neither, one of the 1x/2x pair each. Generated, so the module',
    '// path and `__BOOT_TOTALS__` are the same numbers rather than two sums that could drift (totals.ts).',
    `export const OFFLINE_PACK_BYTES = { '1x': ${pack['1x']}, '2x': ${pack['2x']} };`,
    '',
  ].join('\n');
  const out = path.join(root, 'src', 'boot', 'plan.generated.ts');
  if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== src) fs.writeFileSync(out, src);
  // The inline needs one hero total per outfit and the shared art total, not the whole byte table.
  const need = (k: string): number => {
    const b = rows.get(k);
    if (b === undefined) throw new Error(`boot plan: ${k} is awaited by the boot but missing from public/`);
    return b;
  };
  // The offline pack's denominator: every art asset the boot set does not already cover, plus every
  // world-map plate (`offlinePackBytes`, the same rule `src/boot/totals.ts` applies to the generated
  // table). `src/boot/offline-pack.ts` names the same two sets at runtime; the step closes the source
  // when it completes, so a manifest that has drifted degrades the picture, never the number.
  return declaredBootTotals(need, pack);
}

/** Bundle + (in build) minify `src/boot/inline.ts` with the core file list and the build sha compiled in. */
export async function buildInline(root: string, core: LoadItem[], totals: DeclaredBootTotals, minify: boolean, id: string): Promise<string> {
  const res = await esbuild.build({
    entryPoints: [path.join(root, 'src', 'boot', 'inline.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    minify,
    charset: 'utf8',
    legalComments: 'none',
    define: { __BOOT_CORE__: JSON.stringify(core.map((i) => [i.path, i.bytes])), __BOOT_TOTALS__: JSON.stringify(totals), __BOOT_BUILD__: JSON.stringify(id), __BOOT_SW__: JSON.stringify(minify && !STORE_BUILD), __BOOT_HOOK__: JSON.stringify(!STORE_BUILD || STORE_DEBUG) },
  });
  const code = res.outputFiles[0]?.text.trim() ?? '';
  if (minify && Buffer.byteLength(code) > INLINE_BUDGET_BYTES) throw new Error(`inline loader is ${Buffer.byteLength(code)} B, budget ${INLINE_BUDGET_BYTES} B`);
  return code;
}

function loadManifest(id: string): Plugin[] {
  let root = process.cwd();
  let coreItems: LoadItem[] = [];
  let totals: DeclaredBootTotals = emptyBootTotals();
  const required = [...new Set(Object.values(HERO_FILES_BY_OUTFIT).flat())];
  const modelAssets = modelAssetsPlugin(required, (assets, catalogRoot) => { totals = writeBootPlanTable(catalogRoot, assets); });
  return [modelAssets, {
    name: 'rockhop:load-manifest',
    configResolved(c) {
      root = c.root;
    },
    generateBundle(_o, bundle) {
      const items: LoadItem[] = [];
      for (const [name, item] of Object.entries(bundle)) {
        if (name.endsWith('.map') || name === 'version.json') continue; // version.json is network-only (src/pwa/sw.js), never precached
        const buf = item.type === 'chunk' ? Buffer.from(item.code) : Buffer.isBuffer(item.source) ? item.source : Buffer.from(item.source);
        const gz = /\.(png|webp|jpg|woff2|glb)$/.test(name) ? buf.length : gzipSync(buf).length;
        let phase: LoadItem['phase'] = 'core';
        // Lazy chunks (the review inbox sheet) are fetched on demand, never streamed by the boot; the offline pack
        // warms every `other` item (src/main.ts). The retired tracks' dev chunk is `dev`: only a `?` dev URL fetches it.
        if (name === 'model-catalog.json' || name.startsWith('assets/inbox-')) phase = 'other';
        else if (DEV_CHUNK.test(name)) phase = 'dev';
        else if (/worklet/.test(name)) phase = 'audio-worklet';
        else if (/\.(glb|gltf)$/.test(name)) phase = /-lod-[a-f0-9]{16}\.glb$/.test(name) ? 'models-lod' : 'models';
        const label = /three/.test(name) ? 'three.js' : item.type === 'chunk' && item.isEntry ? 'game (index.js)' : name.replace(/^assets\//, '');
        items.push({ path: `./${name}`, bytes: buf.length, gz, phase, label });
      }
      items.push(...publicItems(root));
      coreItems = items.filter((i) => i.phase === 'core');
      const sum = (ph: LoadItem['phase']): number => items.filter((i) => i.phase === ph).reduce((n, i) => n + i.bytes, 0);
      this.info(`load manifest: core ${(sum('core') / 1024).toFixed(0)} KB, title ${(sum('title') / 1024).toFixed(0)} KB, menu ${(sum('menu') / 1024).toFixed(0)} KB, world ${(sum('world') / 1024).toFixed(0)} KB, models ${(sum('models') / 1024).toFixed(0)} KB`);
      this.emitFile({ type: 'asset', fileName: 'load-manifest.json', source: JSON.stringify({ generatedAt: new Date().toISOString(), items }) });
    },
    // Preview mirrors the production host: hashed assets are immutable, so the loader's streamed
    // fetch and the module script it inserts afterwards share one cached body.
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0] ?? '';
        if (/^\/assets\/.+-[\w-]{8}\.\w+$/.test(pathname) || /^\/models\/.+\/[\w-]+-[a-f0-9]{16}\.glb$/.test(pathname)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        next();
      });
    },
    transformIndexHtml: {
      order: 'post',
      async handler(html, ctx) {
        // The inline loader: TypeScript, bundled; minified with the core list compiled in for the build (≤ 8 KB budget asserted).
        const code = await buildInline(root, ctx.bundle ? coreItems : [], totals, !!ctx.bundle, id);
        if (!html.includes('<script id="boot"></script>')) throw new Error('index.html: <script id="boot"></script> missing');
        // Function replacer: a string replacement would interpret `$&` / `$'` inside the minified code
        // (the 2026-09-15 audit's P1 — `$&&t++` re-inserted the placeholder markup into the script).
        html = html.replace('<script id="boot"></script>', () => `<script>${code}</script>`);
        if (/<script>[^]*?<script id="boot">/.test(html)) throw new Error('index.html: loader insertion corrupted');
        // Take over the entry: the loader inserts it once the core set is in cache (dev: straight away).
        let entry: string | null = null;
        html = html.replace(/\s*<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (m, src: string) => {
          if (/@vite\/client/.test(src)) return m; // dev HMR client stays
          entry = src;
          return '';
        });
        html = html.replace(/\s*<link rel="modulepreload"[^>]*>/g, '');
        if (entry) html = html.replace('data-entry="/src/main.ts"', `data-entry="${entry}"`);
        return html;
      },
    },
  }];
}

/** `<name>:<bytes>` over a sorted file list, hashed — deterministic, and it moves only when bytes do. */
function contentStamp(rows: string[]): string {
  return createHash('sha256').update(rows.sort().join('\n')).digest('hex').slice(0, 10);
}

/** `<rel>:<size>` for every file under public/<sub>, sorted — the unhashed assets the static cache holds. */
function publicStamp(root: string, subs: string[]): string[] {
  const rows: string[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), `${rel}${e.name}/`);
      else rows.push(`${rel}${e.name}:${fs.statSync(path.join(dir, e.name)).size}`);
    }
  };
  for (const sub of subs) {
    const dir = path.join(root, 'public', sub);
    if (fs.existsSync(dir)) walk(dir, `${sub}/`);
  }
  return rows;
}

/**
 * PWA: emit `sw.js` from `src/pwa/sw.js` with two stamps baked in.
 *
 *   __BUILD_ID__  `<git sha>-<hash of every emitted file + the public assets>`. A deploy that changes
 *                 bytes is a byte-different worker (the browser installs it and the boot adopts it);
 *                 a REBUILD OF THE SAME TREE is the same worker. The old `Date.now()` stamp made
 *                 every rebuild a new cache name, and `activate` then wiped the player's 31 MB.
 *   __ASSET_ID__  a hash of public/fonts + public/art alone, so the static cache (7 MB of unhashed
 *                 art) survives a JS-only deploy instead of being re-downloaded.
 */
/**
 * Ask 59.1: `public/models/**` is the model catalog's SOURCE, not a deployed URL.
 *
 * Vite's publicDir copy lands a flat copy of every file in it in `dist/models/` — 26.88 MB of GLB plus the
 * `.source.json` provenance sidecars — while the game only ever fetches the content-addressed snapshots the
 * catalog emits (`models/<pairHash>/<name>-<digest>.glb`; `src/render/hero/gltf.ts` is the single fetch
 * boundary and always resolves through `modelAssetUrl`). Nothing — game, boot, service worker, harness, e2e —
 * names a flat path, so those bytes were uploaded by every deploy and read by nobody. The copy happens in
 * Vite's `prepareOutDir` (before any bundle is written), so removing the flat FILES here, after the write,
 * leaves the hashed pair folders alone.
 *
 * If `public/models` ever moves to a non-published source dir, this plugin becomes a no-op and can go.
 */
function pruneFlatModels(): Plugin {
  return {
    name: 'rockhop:prune-flat-models',
    apply: 'build',
    enforce: 'post',
    writeBundle(options) {
      const dir = path.join(options.dir ?? path.join(process.cwd(), 'dist'), 'models');
      if (!fs.existsSync(dir)) return;
      let bytes = 0;
      let n = 0;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!e.isFile()) continue; // the `<pairHash>/` folders the runtime actually fetches stay
        const p = path.join(dir, e.name);
        bytes += fs.statSync(p).size;
        n += 1;
        fs.rmSync(p);
      }
      if (n) this.info(`pruned ${n} unrequested flat model copies from dist/models (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
    },
  };
}

/**
 * Store release P0.2: production source maps never deploy. They are built `hidden` (no `sourceMappingURL`
 * comment) and then moved out of the output dir to `<outDir>-maps/` — Vercel builds remotely and serves
 * `dist/`, and the store shells bundle `dist/`, so neither ever carries the source and its comments. The
 * crash screen shows the raw (unmangled, `readableStacks`) stack; a stack is symbolicated locally against
 * `dist-maps/` when it has to be.
 */
function sourcemapsOut(): Plugin {
  let outDir = 'dist';
  return {
    name: 'rockhop:sourcemaps-out',
    apply: 'build',
    enforce: 'post',
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
    },
    writeBundle() {
      const dest = `${outDir}-maps`;
      fs.rmSync(dest, { recursive: true, force: true });
      let n = 0;
      const walk = (dir: string): void => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) walk(p);
          else if (e.name.endsWith('.map')) {
            const to = path.join(dest, path.relative(outDir, p));
            fs.mkdirSync(path.dirname(to), { recursive: true });
            fs.renameSync(p, to);
            n += 1;
          }
        }
      };
      walk(outDir);
      if (n) this.info(`moved ${n} source maps out of the deploy to ${path.relative(process.cwd(), dest) || dest}`);
    },
  };
}

/**
 * Store build only: `public/` files a store bundle must not carry. `bench/b1-bot-3.json` is the on-device bench's
 * golden (`?bench=1`, src/game/bench.ts) — the web build keeps it, the store build has no bench.
 */
function storePrune(): Plugin {
  let outDir = 'dist';
  return {
    name: 'rockhop:store-prune',
    apply: 'build',
    enforce: 'post',
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
    },
    writeBundle() {
      for (const rel of ['bench']) fs.rmSync(path.join(outDir, rel), { recursive: true, force: true });
    },
  };
}

function pwa(id: string): Plugin {
  let root = process.cwd();
  return {
    name: 'rockhop:pwa',
    apply: 'build',
    configResolved(c) {
      root = c.root;
    },
    generateBundle(_o, bundle) {
      const src = fs.readFileSync(path.join(root, 'src', 'pwa', 'sw.js'), 'utf8');
      const assetRows = publicStamp(root, ['fonts', 'art']);
      const assets = contentStamp(assetRows);
      const emitted = Object.entries(bundle)
        .filter(([name]) => !name.endsWith('.map') && name !== 'sw.js')
        .map(([name, item]) => `${name}:${item.type === 'chunk' ? Buffer.byteLength(item.code) : Buffer.byteLength(item.source as string | Uint8Array)}`);
      const stamp = `${id}-${contentStamp([...emitted, ...assetRows])}`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src.replaceAll('__BUILD_ID__', stamp).replaceAll('__ASSET_ID__', assets) });
      this.info(`sw.js emitted (rockhop-shell-${stamp}, rockhop-static-${assets}, rockhop-immutable)`);
    },
  };
}

/**
 * Ask 84 §3: a stack a phone can read. The crash screen (src/ui/errorModal.ts) shows `error.stack` raw, and a
 * phone cannot resolve a source map, so production keeps identifiers unmangled (`esbuild.minifyIdentifiers:
 * false` in the config below; whitespace and syntax are still minified). `keepNames` is NOT used: it only sets
 * `fn.name`, which V8 prints and JavaScriptCore — every iPhone browser — ignores (docs/evidence/cd-update-error/
 * names-probe.mjs), so it would cost 15 KB gz for desktop-only names.
 *
 * The vendor chunk (three.js) is re-minified WITH identifier mangling here: its frames are library internals,
 * its class methods keep their names regardless (property names are never mangled), and unmangled it costs
 * another 21.6 KB gz. So is the audio worklet (`worker.plugins`): it runs on the audio thread, whose errors never
 * reach the crash screen. Measured A/B on one tree, plugin count: fully minified 570.1 KB; every chunk unmangled
 * 621.4; this split 599.8 (the entry chunk alone +29.6).
 */
function readableStacks(mangle: (chunkName: string) => boolean): Plugin {
  return {
    name: 'rockhop:readable-stacks',
    apply: 'build',
    async renderChunk(code, chunk) {
      if (!mangle(chunk.name)) return null;
      const r = await esbuild.transform(code, { minify: true, format: 'esm', target: 'es2022', sourcemap: true, charset: 'utf8' });
      return { code: r.code, map: r.map };
    },
  };
}

/**
 * `/version.json` — which build the SERVER has live, for the "new build" pill (src/ui/updatePill.ts). An iOS
 * home-screen install has no address bar and no reload gesture, so without this a player sits on a stale
 * build until iOS evicts the page. `build` is exactly the running page's `__BUILD_ID__` (the pill compares the
 * two), `sha` the full commit, `time` the build time. Emitted LAST (see `plugins` order): the load manifest must
 * not list it (the worker never caches it) and it must not move the worker's content stamp (`time` differs
 * every build, and a rebuild of the same tree has to stay the same worker). Served no-store: vercel.json, the
 * preview middleware below and the dev middleware.
 */
function versionJson(id: string): Plugin {
  const body = (): string => JSON.stringify({ build: id, sha: fullSha() || id, time: new Date().toISOString() });
  const isVersion = (url: string | undefined): boolean => (url ?? '').split('?')[0]!.endsWith('/version.json');
  return {
    name: 'rockhop:version-json',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: body() });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!isVersion(req.url)) return next();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(body());
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (isVersion(req.url)) res.setHeader('Cache-Control', 'no-store');
        next();
      });
    },
  };
}

/**
 * Cross-origin isolation gives `performance.now()` 5 µs resolution instead of
 * Chromium's default 100 µs coarsening, which is what the harness needs to time
 * a handful of 2–3 µs physics ticks. Every asset is same-origin, so COEP costs
 * nothing. (Vercel/static hosts need the same two headers in their config.)
 */
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

/**
 * Short git sha for the build stamp (menu badge, loader badge). `VERCEL_GIT_COMMIT_SHA` when git is not on
 * the build host; a production build with neither fails rather than stamping `dev`.
 */
/** The full commit sha for `/version.json`, or '' (the short `buildId()` is what the page compares). */
function fullSha(): string {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return process.env['VERCEL_GIT_COMMIT_SHA'] ?? '';
  }
}

function buildId(): string {
  let sha = '';
  try {
    sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    sha = (process.env['VERCEL_GIT_COMMIT_SHA'] ?? '').slice(0, 7);
  }
  if (sha) return sha;
  if (process.argv.includes('build')) throw new Error('build id: no git sha (git unavailable and VERCEL_GIT_COMMIT_SHA unset) — a production build never stamps "dev"');
  return 'dev';
}

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId()), __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z'), __WORLDMAP_V__: JSON.stringify(contentStamp(publicStamp(process.cwd(), ['art/worldmap'])).slice(0, 8)) },
  // Relative base so the built bundle also works when served from a subpath
  // (Vercel preview folders, file listings, the harness preview server).
  base: './',
  // versionJson last: its `generateBundle` must run after the load manifest and the worker stamp are taken.
  // A store build has no service worker and no update probe (Apple 2.5.2: nothing loads code from a server).
  plugins: [releaseFlags(), retiredTracksLazy(), readableStacks((name) => name === 'three'), bundleBudget(), ...loadManifest(buildId()), ...(STORE_BUILD ? [] : [pwa(buildId())]), pruneFlatModels(), ...(STORE_BUILD ? [storePrune()] : [versionJson(buildId())]), sourcemapsOut()],
  // Unmangled identifiers in production: the crash screen's stack must name functions on a phone (`readableStacks`).
  esbuild: { minifyIdentifiers: false },
  worker: { plugins: () => [readableStacks(() => true)] },
  build: {
    target: 'es2022',
    sourcemap: 'hidden',
    chunkSizeWarningLimit: 700,
    // three is large; a dedicated chunk keeps the game bundle cacheable.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    strictPort: false,
    headers: ISOLATION_HEADERS,
  },
  preview: {
    host: '127.0.0.1',
    strictPort: false,
    headers: ISOLATION_HEADERS,
  },
});
