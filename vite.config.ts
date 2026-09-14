import { gzipSync } from 'node:zlib';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, transformWithEsbuild, type Plugin } from 'vite';

/** CONTRACT §3: JS bundle ≤ 600 KB gzipped. Fails the build when exceeded. */
const BUNDLE_BUDGET_GZ_BYTES = 600 * 1024;

function bundleBudget(): Plugin {
  return {
    name: 'trials:bundle-budget',
    apply: 'build',
    generateBundle(_options, bundle) {
      let total = 0;
      const rows: string[] = [];
      for (const [name, item] of Object.entries(bundle)) {
        if (item.type !== 'chunk') continue;
        const gz = gzipSync(Buffer.from(item.code)).length;
        total += gz;
        rows.push(`  ${name.padEnd(40)} ${(gz / 1024).toFixed(1).padStart(8)} KB gz`);
      }
      const ok = total <= BUNDLE_BUDGET_GZ_BYTES;
      const line = `bundle budget: ${(total / 1024).toFixed(1)} KB gz of ${(BUNDLE_BUDGET_GZ_BYTES / 1024).toFixed(0)} KB — ${ok ? 'OK' : 'OVER BUDGET'}`;
      this.info(`\n${rows.join('\n')}\n${line}`);
      if (!ok) this.error(line);
    },
  };
}

/**
 * Load manifest for the inline loader in index.html (docs/design/game.md §12):
 * every emitted chunk / asset plus the public-dir files the first screens need,
 * with raw and gzip bytes and a phase tag. The loader streams the `core` set
 * with byte counting before it inserts the entry module script; the HTML's
 * own module script / modulepreload tags are stripped so nothing downloads
 * twice, and the entry URL travels in `#loader[data-entry]`.
 *
 *   core           entry chunk, three chunk, CSS, fonts
 *   title          key art (1x / 2x), wordmark plate, art manifest
 *   menu           tier / track cards, medals, results backgrounds
 *   world          renderer plates, skies, stencils, banners, crowds (fetched by the renderer)
 *   models         glTF rider / bike
 *   audio-worklet  the worklet chunk
 */
interface LoadItem {
  path: string;
  bytes: number;
  gz: number;
  phase: 'core' | 'title' | 'menu' | 'world' | 'models' | 'audio-worklet' | 'other';
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
  const models = path.join(pub, 'models');
  if (fs.existsSync(models)) {
    const walk = (dir: string, rel: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(dir, e.name), `${rel}/${e.name}`);
        else {
          const b = fs.statSync(path.join(dir, e.name)).size;
          items.push({ path: `./models${rel}/${e.name}`, bytes: b, gz: b, phase: 'models', label: e.name });
        }
      }
    };
    walk(models, '');
  }
  return items;
}

function loadManifest(): Plugin {
  let root = process.cwd();
  return {
    name: 'trials:load-manifest',
    configResolved(c) {
      root = c.root;
    },
    generateBundle(_o, bundle) {
      const items: LoadItem[] = [];
      for (const [name, item] of Object.entries(bundle)) {
        if (name.endsWith('.map')) continue;
        const buf = item.type === 'chunk' ? Buffer.from(item.code) : Buffer.isBuffer(item.source) ? item.source : Buffer.from(item.source);
        const gz = /\.(png|webp|jpg|woff2|glb)$/.test(name) ? buf.length : gzipSync(buf).length;
        let phase: LoadItem['phase'] = 'core';
        if (/worklet/.test(name)) phase = 'audio-worklet';
        else if (/\.(glb|gltf)$/.test(name)) phase = 'models';
        const label = /three/.test(name) ? 'three.js' : item.type === 'chunk' && item.isEntry ? 'game (index.js)' : name.replace(/^assets\//, '');
        items.push({ path: `./${name}`, bytes: buf.length, gz, phase, label });
      }
      items.push(...publicItems(root));
      const sum = (ph: LoadItem['phase']): number => items.filter((i) => i.phase === ph).reduce((n, i) => n + i.bytes, 0);
      this.info(`load manifest: core ${(sum('core') / 1024).toFixed(0)} KB, title ${(sum('title') / 1024).toFixed(0)} KB, menu ${(sum('menu') / 1024).toFixed(0)} KB, world ${(sum('world') / 1024).toFixed(0)} KB, models ${(sum('models') / 1024).toFixed(0)} KB`);
      this.emitFile({ type: 'asset', fileName: 'load-manifest.json', source: JSON.stringify({ generatedAt: new Date().toISOString(), items }) });
    },
    // Preview mirrors the production host: hashed assets are immutable, so the loader's streamed
    // fetch and the module script it inserts afterwards share one cached body.
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && /^\/assets\/.+-[\w-]{8}\.\w+$/.test(req.url.split('?')[0] ?? '')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        next();
      });
    },
    transformIndexHtml: {
      order: 'post',
      async handler(html, ctx) {
        // Minify the inline loader in production (≤ 6 KB budget); the source stays readable.
        if (ctx.bundle) {
          const m = /<script>([\s\S]*?)<\/script>/.exec(html);
          if (m) {
            const out = await transformWithEsbuild(m[1]!, 'loader.js', { minify: true, target: 'es2017', sourcemap: false, loader: 'js' });
            html = html.replace(m[0], `<script>${out.code.trim()}</script>`);
          }
        }
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

/** Short git sha for the title-screen build stamp; `dev` when git is unavailable. */
function buildId(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId()), __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z') },
  // Relative base so the built bundle also works when served from a subpath
  // (Vercel preview folders, file listings, the harness preview server).
  base: './',
  plugins: [bundleBudget(), loadManifest()],
  build: {
    target: 'es2022',
    sourcemap: true,
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
