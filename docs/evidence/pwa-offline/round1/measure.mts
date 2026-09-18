/** R1 measurement: one online load → cache; cold offline start; warm-start wire bytes. */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { preview, type PreviewServer } from 'vite';
import { DIST_DIR, REPO_ROOT } from '../../lib/paths';

/** Wire bytes counted at the HTTP server — the only honest place: the boot's bytes are fetched by the
 *  service worker, whose requests belong to the worker target and never reach a page-level CDP session. */
const wire = { bytes: 0, requests: 0, byUrl: {} as Record<string, number> };
async function countingPreview(port: number): Promise<PreviewServer> {
  return preview({
    root: REPO_ROOT,
    configFile: path.join(REPO_ROOT, 'vite.config.ts'),
    logLevel: 'warn',
    build: { outDir: DIST_DIR },
    preview: { host: '127.0.0.1', port, strictPort: port !== 0 },
    plugins: [
      {
        name: 'trials:wire-count',
        configurePreviewServer(server) {
          server.middlewares.use((req, res, next) => {
            const url = (req.url ?? '').split('?')[0]!;
            let n = 0;
            const write = res.write.bind(res);
            const end = res.end.bind(res);
            res.write = ((chunk: unknown, ...rest: unknown[]) => {
              if (chunk) n += Buffer.byteLength(chunk as Buffer | string);
              return (write as (...a: unknown[]) => boolean)(chunk, ...rest);
            }) as typeof res.write;
            res.end = ((chunk: unknown, ...rest: unknown[]) => {
              if (chunk && typeof chunk !== 'function') n += Buffer.byteLength(chunk as Buffer | string);
              if (res.statusCode !== 304) {
                wire.bytes += n;
                wire.requests++;
                wire.byUrl[url] = (wire.byUrl[url] ?? 0) + n;
              } else {
                wire.requests++;
                wire.byUrl[url] = wire.byUrl[url] ?? 0;
              }
              return (end as (...a: unknown[]) => unknown)(chunk, ...rest) as ReturnType<typeof res.end>;
            }) as typeof res.end;
            next();
          });
        },
      },
    ],
  });
}

const PROFILE = process.env['PROFILE'] ?? '/tmp/tg-offline-profile';
const OUT = process.env['OUT'] ?? `/tmp/tg-offline-measure${process.env['PHASE'] ? '-' + process.env['PHASE'] : ''}.json`;
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const GEOM = { viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function open(offline: boolean): Promise<BrowserContext> {
  return chromium.launchPersistentContext(PROFILE, { headless: true, args: ARGS, ...GEOM, offline });
}

interface Dump { caches: Record<string, number>; urls: string[]; models: number; assets: number; art: number; usage: number; version: unknown }

async function dump(page: Page): Promise<Dump> {
  return page.evaluate(async () => {
    const out: Record<string, number> = {};
    const urls: string[] = [];
    for (const k of await caches.keys()) {
      const c = await caches.open(k);
      const keys = await c.keys();
      out[k] = keys.length;
      for (const r of keys) urls.push(new URL(r.url).pathname);
    }
    const est = await navigator.storage.estimate();
    let version: unknown = null;
    if (navigator.serviceWorker.controller) {
      version = await new Promise((res) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (e) => res(e.data);
        navigator.serviceWorker.controller!.postMessage({ type: 'VERSION' }, [ch.port2]);
        setTimeout(() => res(null), 15000);
      });
    }
    return {
      caches: out,
      urls,
      models: urls.filter((u) => /\/models\//.test(u)).length,
      assets: urls.filter((u) => /\/assets\//.test(u)).length,
      art: urls.filter((u) => /\/art\//.test(u)).length,
      usage: (est as { usageDetails?: { caches?: number } }).usageDetails?.caches ?? est.usage ?? 0,
      version,
    };
  });
}

/** Loads the page, samples the loader until it leaves, and reports wire bytes + errors. */
async function load(ctx: BrowserContext, url: string, capMs: number): Promise<{ leaveMs: number; last: { d: number; s: number; done: boolean }; wire: number; requests: number; errors: string[]; byUrl: Record<string, number>; page: Page }> {
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  wire.bytes = 0;
  wire.requests = 0;
  wire.byUrl = {};
  const t0 = Date.now();
  let leaveMs = -1;
  let last = { d: -1, s: -1, done: false };
  await page.goto(url, { waitUntil: 'commit' }).catch((e: Error) => errors.push(`goto: ${e.message}`));
  while (Date.now() - t0 < capMs) {
    const s = await page
      .evaluate(() => {
        const l = document.getElementById('loader');
        if (!l) return null;
        return { d: Number(l.dataset['download']), s: Number(l.dataset['setup']), done: l.dataset['done'] === '1', err: l.classList.contains('failed') ? (l.querySelector('.err span')?.textContent ?? 'failed') : '' };
      })
      .catch(() => ({ d: -1, s: -1, done: false, err: 'navigating' }));
    if (s === null) {
      leaveMs = Date.now() - t0;
      break;
    }
    if (s.err && s.err !== 'navigating') {
      errors.push(`loader failed: ${s.err}`);
      break;
    }
    last = { d: s.d, s: s.s, done: s.done };
    await page.waitForTimeout(100);
  }
  return { leaveMs, last, wire: wire.bytes, requests: wire.requests, errors, byUrl: { ...wire.byUrl }, page };
}

let server = await countingPreview(Number(process.env['PORT'] ?? 0));
const url = (server.resolvedUrls?.local[0] ?? '').replace(/\/$/, '') + '/';
const port = Number(new URL(url).port);
const stop = async (): Promise<void> => {
  const h = server.httpServer;
  await new Promise<void>((r) => h.close(() => r()));
};
const report: Record<string, unknown> = { url };
try {
  if (process.env['PHASE'] !== 'update') fs.rmSync(PROFILE, { recursive: true, force: true });

  // 1. ONE online load.
  if (process.env['PHASE'] !== 'update') {
    const ctx = await open(false);
    const r = await load(ctx, url, 240_000);
    const page = r.page;
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 }).catch(() => undefined);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined)).catch(() => undefined);
    await page.waitForTimeout(4000);
    const d = await dump(page);
    report['load1'] = { ...r, page: undefined, dump: { ...d, urls: undefined }, entries: Object.values(d.caches).reduce((a, b) => a + b, 0) };
    fs.writeFileSync('/tmp/tg-cache-urls-load1.txt', d.urls.sort().join('\n'));
    await ctx.close();
  }

  // 2. Cold OFFLINE start, same profile, browser process gone. The SERVER IS DOWN for this phase:
  //    Playwright's offline emulation does not reach service-worker fetches, so an unreachable origin
  //    is the only honest aeroplane mode. Belt and braces: the context is offline too.
  if (process.env['PHASE'] !== 'update') {
    await stop();
    const ctx = await open(true);
    await ctx.setOffline(true);
    const r = await load(ctx, url, 180_000);
    const page = r.page;
    const nav = page ? await page.evaluate(() => {
      const e = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      return e ? { transferSize: e.transferSize, workerStart: e.workerStart } : null;
    }).catch(() => null) : null;
    report['coldOffline'] = { ...r, page: undefined, nav };
    await ctx.close();
    server = await countingPreview(port);
  }

  // 3. Warm ONLINE start (wire bytes with a full cache) — or, with PHASE=update, the first boot
  //    after a new build was deployed under the same origin: what does adopting it actually cost?
  {
    const ctx = await open(false);
    const r = await load(ctx, url, 180_000);
    const d = await dump(r.page).catch(() => null);
    report[process.env['PHASE'] === 'update' ? 'updateBoot' : 'warmOnline'] = { ...r, page: undefined, dump: d ? { ...d, urls: undefined } : null };
    if (d) fs.writeFileSync(`/tmp/tg-cache-urls-${process.env['PHASE'] ?? 'warm'}.txt`, d.urls.sort().join('\n'));
    await ctx.close();
  }
} finally {
  await stop().catch(() => undefined);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
