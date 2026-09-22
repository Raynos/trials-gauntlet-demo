/**
 * Ask 84 §3 cost check: does shipping unmangled identifiers (bigger JS to parse) move the boot numbers the ship gate
 * reads? Two builds of ONE tree, served the same way, booted alternately in fresh contexts:
 *
 *   npx tsx docs/evidence/cd-update-error/boot-ab.mts --a=<mangled dist> --b=dist [--runs=5] [--engines=chromium,webkit]
 *
 *   ready    `?harness=1&audio=0`: navigation → `window.__trials.ready` (the gate's `boot.readyMs`, CONTRACT ≤ 300 ms p50)
 *   menu     `?sw=0&audio=0`: navigation → the menu live with the loader gone (the player's cold boot, 27 MB of models)
 *
 * Silent: `?audio=0` on every URL, Chromium `--mute-audio`. Prints a table and writes <out>/boot-ab.json.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium, webkit, type Browser } from 'playwright';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const DIRS = { a: path.resolve(args.get('a') ?? ''), b: path.resolve(args.get('b') ?? 'dist') };
const RUNS = Number(args.get('runs') ?? 5);
const ENGINES = (args.get('engines') ?? 'chromium,webkit').split(',');
const OUT = path.resolve(args.get('out') ?? 'docs/evidence/cd-update-error');

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
async function serve(root: string): Promise<{ url: string; close(): void }> {
  const s = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return void res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] ?? 'application/octet-stream', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(s.address() as { port: number }).port}`, close: () => s.close() };
}

const p50 = (xs: number[]): number => {
  const s = [...xs].sort((x, y) => x - y);
  return s.length ? s[Math.floor((s.length - 1) / 2)]! : NaN;
};

async function once(browser: Browser, url: string, kind: 'ready' | 'menu'): Promise<number> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  if (kind === 'ready') {
    await page.goto(`${url}/?harness=1&audio=0`, { waitUntil: 'commit' });
    await page.waitForFunction(() => (window as unknown as { __trials?: { ready?: boolean } }).__trials?.ready === true, null, { timeout: 60000 });
  } else {
    await page.goto(`${url}/?sw=0&audio=0`);
    await page.waitForFunction(() => !document.getElementById('loader') && !!document.querySelector('.menu-screen.live'), null, { timeout: 240000 });
  }
  const ms = Date.now() - t0;
  await ctx.close();
  return ms;
}

const servers = { a: await serve(DIRS.a), b: await serve(DIRS.b) };
const out: Record<string, Record<string, { a: number[]; b: number[]; p50a: number; p50b: number }>> = {};
for (const engine of ENGINES) {
  const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ args: ['--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  out[engine] = {};
  for (const kind of ['ready', 'menu'] as const) {
    const a: number[] = [];
    const b: number[] = [];
    await once(browser, servers.a.url, kind); // warm the disk cache for both, uncounted
    await once(browser, servers.b.url, kind);
    for (let i = 0; i < RUNS; i++) {
      // Alternate the order so drift on a shared host lands on both.
      if (i % 2) {
        b.push(await once(browser, servers.b.url, kind));
        a.push(await once(browser, servers.a.url, kind));
      } else {
        a.push(await once(browser, servers.a.url, kind));
        b.push(await once(browser, servers.b.url, kind));
      }
    }
    out[engine][kind] = { a, b, p50a: p50(a), p50b: p50(b) };
    console.log(`${engine} ${kind}: mangled p50 ${p50(a)} ms ${JSON.stringify(a)} | unmangled p50 ${p50(b)} ms ${JSON.stringify(b)}`);
  }
  await browser.close();
}
servers.a.close();
servers.b.close();
fs.writeFileSync(path.join(OUT, 'boot-ab.json'), JSON.stringify({ a: 'fully mangled (pre-ask-84 minifier)', b: 'shipped (entry chunk unmangled)', runs: RUNS, out }, null, 2) + '\n');
