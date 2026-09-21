/**
 * Offline end-to-end: the aeroplane-mode gate (docs/plans/PWA_OFFLINE.md §7.1, ask 58).
 *
 *   pnpm harness:e2e --only=offline          (or: tsx harness/e2e/offline.mts [--verbose=1])
 *
 * The bar: **one** online load, then the browser process is gone, the origin is gone, and the game still
 * cold-starts and a track is ridden. Before round 1 it took two online loads and then failed anyway.
 *
 * Three things about this suite are not negotiable, each one a measurement that lied first:
 *
 *  1. **`chromium.launchPersistentContext`, never `browser.newContext()`.** An ephemeral context does not
 *     keep Cache Storage across the offline switch (the plan's M5), so the suite would fail a working build.
 *  2. **The HTTP server is SHUT DOWN for the offline phase.** Playwright's `offline` flag does not reach
 *     service-worker fetches: with the flag set and the server up, six core files still went to the origin
 *     and came back `304`, and the boot "passed" on the browser's HTTP disk cache. An unreachable origin is
 *     the only honest aeroplane mode. (The context is set offline as well — belt and braces.)
 *  3. **Wire bytes are counted in the server, not in the page.** The boot's bytes are fetched by the worker,
 *     whose requests belong to the worker target and never reach a page-level CDP session; a page-side
 *     counter reports a flattering `0` for a boot that actually pulled 30 MB.
 *
 * Every other harness entry runs `?sw=0` on purpose ("the evidence harness measures the network, not the
 * cache"), so this is the ONLY suite in the tree that exercises the service worker — which is why
 * `offline.coldStartPlayable` is a ship-gate row (harness/gate/ship-gate.ts) and not a nice-to-have.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { preview, type PreviewServer } from 'vite';
import { encodeJSON } from '../../src/core/replay';
import { AVAILABLE_RIDER_PRESETS } from '../../src/core/riderPresets';
import { pickGolden } from '../lib/golden';
import { loadRecording } from '../lib/recording';
import { DIST_DIR, OUT_DIR, REPO_ROOT } from '../lib/paths';

export interface OfflineCheck {
  id: string;
  pass: boolean;
  value: string | number | boolean | null;
  note?: string;
}
export interface OfflineReport {
  checks: OfflineCheck[];
  /** Everything measured, for the round's evidence file. */
  measured: Record<string, unknown>;
}

const GOLDEN_TRACK = 'b1-first-ride';
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const GEOM = { viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } as const;
/** SwiftShader boots the whole 27 MB in ~15 s; a throttled row needs a lot more rope than that. */
const BOOT_CAP_MS = 240_000;

// ---------------------------------------------------------------------------------------------------
// The server: wire bytes counted per response, stoppable, and able to serve a "next build" sw.js.
// ---------------------------------------------------------------------------------------------------

interface Wire {
  bytes: number;
  requests: number;
  byUrl: Record<string, number>;
}

class CountingServer {
  readonly wire: Wire = { bytes: 0, requests: 0, byUrl: {} };
  /** When set, `/sw.js` is served with a different build stamp — a deploy, without a second `vite build`. */
  bumpBuild = '';
  private server: PreviewServer | null = null;
  port = 0;

  reset(): void {
    this.wire.bytes = 0;
    this.wire.requests = 0;
    this.wire.byUrl = {};
  }

  snapshot(): Wire {
    return { bytes: this.wire.bytes, requests: this.wire.requests, byUrl: { ...this.wire.byUrl } };
  }

  async start(): Promise<string> {
    const wire = this.wire;
    this.server = await preview({
      root: REPO_ROOT,
      configFile: path.join(REPO_ROOT, 'vite.config.ts'),
      logLevel: 'warn',
      build: { outDir: DIST_DIR },
      preview: { host: '127.0.0.1', port: this.port, strictPort: this.port !== 0 },
      plugins: [
        {
          name: 'trials:offline-e2e',
          configurePreviewServer: (server) => {
            server.middlewares.use((req, res, next) => {
              const url = (req.url ?? '').split('?')[0] ?? '';
              // A "new build": the same worker with a different stamp. The browser sees a byte-different
              // sw.js, installs it, and the boot adopts it — no second `vite build` needed.
              if (this.bumpBuild && url === '/sw.js') {
                const src = fs.readFileSync(path.join(DIST_DIR, 'sw.js'), 'utf8').replace(/^const BUILD = '([^']+)';/m, `const BUILD = '$1-${this.bumpBuild}';`);
                const buf = Buffer.from(src);
                wire.bytes += buf.length;
                wire.requests++;
                wire.byUrl[url] = (wire.byUrl[url] ?? 0) + buf.length;
                res.setHeader('Content-Type', 'text/javascript');
                res.setHeader('Cache-Control', 'no-store');
                res.end(buf);
                return;
              }
              let n = 0;
              const write = res.write.bind(res);
              const end = res.end.bind(res);
              res.write = ((chunk: unknown, ...rest: unknown[]) => {
                if (chunk) n += Buffer.byteLength(chunk as Buffer | string);
                return (write as (...a: unknown[]) => boolean)(chunk, ...rest);
              }) as typeof res.write;
              res.end = ((chunk: unknown, ...rest: unknown[]) => {
                if (chunk && typeof chunk !== 'function') n += Buffer.byteLength(chunk as Buffer | string);
                wire.requests++;
                wire.bytes += n;
                wire.byUrl[url] = (wire.byUrl[url] ?? 0) + n;
                return (end as (...a: unknown[]) => unknown)(chunk, ...rest) as ReturnType<typeof res.end>;
              }) as typeof res.end;
              next();
            });
          },
        },
      ],
    });
    const url = (this.server.resolvedUrls?.local[0] ?? '').replace(/\/$/, '');
    if (!url) throw new Error('offline e2e: vite preview gave no local url');
    this.port = Number(new URL(url).port);
    return url;
  }

  async stop(): Promise<void> {
    const h = this.server?.httpServer;
    this.server = null;
    if (h) await new Promise<void>((r) => h.close(() => r()));
  }
}

// ---------------------------------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------------------------------

interface BootRead {
  leaveMs: number;
  download: number;
  setup: number;
  done: boolean;
  failed: string;
  errors: string[];
}

/** Navigate and sample the loader (the same two painted integers `boot.mts` reads) until it leaves. */
async function bootPage(ctx: BrowserContext, url: string, errors: string[], capMs = BOOT_CAP_MS): Promise<{ page: Page; read: BootRead }> {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const t0 = Date.now();
  let leaveMs = -1;
  let last = { d: 0, s: 0, done: false, err: '' };
  await page.goto(url, { waitUntil: 'commit' }).catch((e: Error) => errors.push(`goto: ${e.message}`));
  while (Date.now() - t0 < capMs) {
    const s = await page
      .evaluate(() => {
        const l = document.getElementById('loader');
        if (!l) return null;
        return {
          d: Number(l.dataset['download']),
          s: Number(l.dataset['setup']),
          done: l.dataset['done'] === '1',
          err: l.classList.contains('failed') ? (l.querySelector('.err span')?.textContent ?? 'failed') : '',
        };
      })
      // A navigation (the boot adopting a new build) destroys the context mid-evaluate: not a failure.
      .catch(() => ({ d: last.d, s: last.s, done: false, err: '' }));
    if (s === null) {
      leaveMs = Date.now() - t0;
      break;
    }
    if (s.err) {
      last = s;
      break;
    }
    last = s;
    await page.waitForTimeout(100);
  }
  return { page, read: { leaveMs, download: last.d, setup: last.s, done: last.done, failed: last.err, errors } };
}

interface CacheDump {
  caches: Record<string, number>;
  entries: number;
  models: number;
  assets: number;
  fonts: number;
  art: number;
  usage: number;
  version: { entries?: number; models?: number; bytes?: number; build?: string } | null;
  urls: string[];
}

async function dumpCache(page: Page): Promise<CacheDump> {
  return page.evaluate(async () => {
    const counts: Record<string, number> = {};
    const urls: string[] = [];
    for (const k of await caches.keys()) {
      const c = await caches.open(k);
      const keys = await c.keys();
      counts[k] = keys.length;
      for (const r of keys) urls.push(new URL(r.url).pathname);
    }
    const est = await navigator.storage.estimate();
    let version: Record<string, unknown> | null = null;
    if (navigator.serviceWorker.controller) {
      version = await new Promise((res) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (e) => res(e.data as Record<string, unknown>);
        navigator.serviceWorker.controller!.postMessage({ type: 'VERSION' }, [ch.port2]);
        setTimeout(() => res(null), 20_000);
      });
    }
    // No named arrow consts inside an evaluate: tsx rewrites them through its `__name` helper, which
    // does not exist in the page (the review-inbox headless script hit the same wall).
    return {
      caches: counts,
      entries: urls.length,
      models: urls.filter((u) => /\/models\//.test(u)).length,
      assets: urls.filter((u) => /\/assets\//.test(u)).length,
      fonts: urls.filter((u) => /\/fonts\//.test(u)).length,
      art: urls.filter((u) => /\/art\//.test(u)).length,
      usage: (est as { usageDetails?: { caches?: number } }).usageDetails?.caches ?? est.usage ?? 0,
      version: version as CacheDump['version'],
      urls,
    };
  });
}

/** The recording, replayed through the page's own solver: the finish time and state hash the gate compares. */
async function replayGolden(page: Page, json: string): Promise<{ hash: string; finishTime: number | null; faults: number } | null> {
  return page
    .evaluate((j) => {
      const t = (window as unknown as { __trials?: { runRecording(j: string): { finishTime: number | null }; hashState(): string; faults(): number; drainEvents(): unknown } }).__trials;
      if (!t) return null;
      t.drainEvents();
      const state = t.runRecording(j);
      return { hash: t.hashState(), finishTime: state.finishTime, faults: t.faults() };
    }, json)
    .catch(() => null);
}

// ---------------------------------------------------------------------------------------------------
// The suite
// ---------------------------------------------------------------------------------------------------

export async function offlineSuite(opts: { verbose?: boolean; stillsDir?: string } = {}): Promise<OfflineReport> {
  const log = (m: string): void => {
    if (opts.verbose) console.log(`    ${m}`);
  };
  const checks: OfflineCheck[] = [];
  const measured: Record<string, unknown> = {};
  const check = (id: string, pass: boolean, value: OfflineCheck['value'], note?: string): void => {
    checks.push({ id, pass, value, ...(note ? { note } : {}) });
    console.log(`  ${pass ? 'PASS' : 'FAIL'} ${id.padEnd(30)} ${String(value)}${note ? `  ${note}` : ''}`);
  };

  const goldenFile = pickGolden(GOLDEN_TRACK, log);
  const goldenJson = goldenFile ? encodeJSON(loadRecording(goldenFile)) : null;
  measured['golden'] = goldenFile ? path.relative(REPO_ROOT, goldenFile) : null;

  const profile = path.join(OUT_DIR, '.offline-profile', String(process.pid));
  fs.rmSync(profile, { recursive: true, force: true });
  fs.mkdirSync(profile, { recursive: true });
  const server = new CountingServer();
  const url = (await server.start()) + '/';
  log(`server ${url}`);
  const open = (offline: boolean): Promise<BrowserContext> => chromium.launchPersistentContext(profile, { headless: true, args: ARGS, ...GEOM, offline });

  try {
    // ---- 1. ONE online load -------------------------------------------------------------------
    server.reset();
    const onlineErrors: string[] = [];
    let onlineRide: { hash: string; finishTime: number | null; faults: number } | null = null;
    {
      const ctx = await open(false);
      const { page, read } = await bootPage(ctx, url, onlineErrors);
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 60_000 }).catch(() => undefined);
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined)).catch(() => undefined);
      await page.waitForTimeout(3000);
      const dump = await dumpCache(page);
      if (goldenJson) onlineRide = await replayGolden(page, goldenJson);
      const wire = server.snapshot();
      measured['online'] = { read: { ...read, errors: undefined }, dump: { ...dump, urls: undefined }, wire: { bytes: wire.bytes, requests: wire.requests }, ride: onlineRide };
      measured['cachedUrls'] = dump.urls.sort();
      log(`online boot ${read.leaveMs} ms, ${wire.bytes} B over the wire`);

      const cacheOk = dump.models >= 14 && dump.assets + dump.fonts >= 5 && dump.usage >= 27e6;
      check('offline.cacheAfterFirstLoad', cacheOk, `${dump.entries} entries · ${dump.models} models · ${(dump.usage / 1e6).toFixed(2)} MB`, `need ≥ 14 models, ≥ 5 assets+fonts, ≥ 27 MB; wire ${(wire.bytes / 1e6).toFixed(2)} MB`);
      await ctx.close();
    }

    // ---- 2. Cold OFFLINE start, origin unreachable ---------------------------------------------
    await server.stop();
    server.reset();
    const offErrors: string[] = [];
    {
      const ctx = await open(true);
      await ctx.setOffline(true);
      const { page, read } = await bootPage(ctx, url, offErrors);
      const wire = server.snapshot();
      const nav = await page
        .evaluate(() => {
          const e = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
          return e ? { transferSize: e.transferSize, workerStart: e.workerStart } : null;
        })
        .catch(() => null);
      // Cross-origin isolation has to survive a document replayed out of Cache Storage: a stored response
      // carries the headers it was stored with, and the whole evidence harness's 5 us performance.now()
      // depends on COOP same-origin + COEP require-corp (vite.config.ts ISOLATION_HEADERS, plan risk 9.4).
      const isolated = await page.evaluate(() => ({ isolated: crossOriginIsolated === true, resolution: performance.now() })).catch(() => null);
      const playable = read.done && read.download === 100 && read.setup === 100 && read.leaveMs > 0 && wire.requests === 0 && !!nav && nav.transferSize === 0 && nav.workerStart > 0 && isolated?.isolated === true;
      check('offline.coldStartPlayable', playable, `${read.download}/${read.setup} done=${read.done} in ${read.leaveMs} ms`, `${wire.requests} origin requests, transferSize ${nav?.transferSize ?? '?'}, workerStart ${(nav?.workerStart ?? 0).toFixed(2)} ms, crossOriginIsolated ${String(isolated?.isolated)}${read.failed ? `, loader: ${read.failed}` : ''}`);

      const frame = await page
        .evaluate(() => {
          const c = document.querySelector('canvas');
          if (!c) return { canvas: false, drawn: false };
          const gl = c.getContext('webgl2') ?? c.getContext('webgl');
          return { canvas: c.width > 0 && c.height > 0, drawn: !!gl };
        })
        .catch(() => ({ canvas: false, drawn: false }));
      check('offline.firstFrame', frame.canvas && frame.drawn, `${frame.canvas ? 'canvas' : 'no canvas'} / ${frame.drawn ? 'context' : 'no context'}`);

      // The world map, offline: PLAY → the plates the boot already pulled.
      const wm = await page
        .evaluate(async () => {
          const t = (window as unknown as { __trials?: { app?: { goto(s: string): void; screen(): string; frame(): void } } }).__trials;
          if (!t?.app) return null;
          t.app.goto('tracks');
          await new Promise((r) => setTimeout(r, 1500));
          return {
            screen: t.app.screen(),
            world: !!document.querySelector('.wm-world.loaded'),
            regions: document.querySelectorAll('.wm-region.loaded').length,
            markers: document.querySelectorAll('.wm-marker').length,
          };
        })
        .catch(() => null);
      // Round 3 put both world-map tiers in the first boot, so offline the plates are not a "degrades
      // gracefully" case any more: they are there, or the offline set is incomplete.
      check('offline.worldMapDraws', !!wm && wm.screen === 'tracks' && wm.markers > 0 && wm.world && wm.regions >= 5, wm ? `${wm.screen}: world ${wm.world ? 'loaded' : 'MISSING'}, ${wm.regions} region plates, ${wm.markers} markers` : 'no world map', 'need the world plate + at least 5 region plates, drawn with the origin unreachable');

      // The review inbox, offline: the note queues in localStorage and says so.
      const inbox = await page
        .evaluate(async () => {
          const t = (window as unknown as { __trials?: { app?: { goto(s: string): void; play(id: string): void; screen(): string } } }).__trials;
          if (!t?.app) return null;
          const before = Object.keys(localStorage).filter((k) => /inbox|note/i.test(k));
          let err = '';
          try {
            await fetch('./api/inbox', { method: 'POST', body: '{}' });
          } catch (e) {
            err = String(e);
          }
          return { before, err, queueKeys: Object.keys(localStorage).filter((k) => /inbox|note/i.test(k)) };
        })
        .catch(() => null);
      check('offline.inboxQueues', !!inbox && inbox.err !== '', inbox ? `POST /api/inbox → ${inbox.err || 'RESOLVED (the worker answered a request that must never be cached)'}` : 'no page', 'the worker bypasses /api/; the queue itself is src/ui/inbox.ts NoteQueue (unit-tested)');

      // The garage, offline: every outfit on both liveries, with the origin gone. The user's rule --
      // "garage swaps needing network is a bug anyway; it should behave like an iOS game -- download once,
      // instant after". A swap that needed a model the cache does not hold shows up twice: as a FAILED
      // request for /models/, and as a procedural stand-in in the renderer's heroDoc.
      const modelFailures: string[] = [];
      page.on('requestfailed', (r) => {
        if (/\/models\//.test(r.url())) modelFailures.push(new URL(r.url()).pathname);
      });
      const combos: { combo: string; heroDoc: string; ok: boolean; tapped: boolean; rect?: unknown }[] = [];
      let garageOk = false;
      // A real emulated finger, not `page.click`: the front end only takes pointers inside a `.live`
      // element (src/ui/live.ts), so a synthetic click on a rail button silently does nothing.
      // A raw emulated finger at the button's centre. NOT `page.tap(selector)`: Playwright's actionability
      // hit-test never passes on this front end (the screens stack and `src/ui/live.ts` gates pointers), so
      // it times out on every button while a coordinate tap lands.
      const tap = async (sel: string): Promise<boolean> => {
        const box = await page
          .$eval(sel, (el) => {
            const r = el.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, disabled: (el as HTMLButtonElement).disabled === true };
          })
          .catch(() => null);
        if (!box || box.w < 2 || box.disabled) return false;
        await page.touchscreen.tap(box.x, box.y);
        return true;
      };
      /** A hero swap on SwiftShader parses and uploads a 3.6 MB glTF; nothing here is fast. */
      const swapped = (outfit: string, bike: string, ms: number): Promise<boolean> =>
        page
          .waitForFunction(
            (o) => {
              const r = (window as unknown as { __render?: { riderDocumentOutfit?: string | null; bikeDocumentClass?: string | null; heroLoading?: number } }).__render;
              return !!r && r.riderDocumentOutfit === o.outfit && r.bikeDocumentClass === o.bike && (r.heroLoading ?? 0) === 0;
            },
            { outfit, bike },
            { timeout: ms },
          )
          .then(() => true, () => false);
      try {
        // The game is landscape (`orientation: landscape`): in portrait the `.rotate` overlay sits above
        // every screen and takes the pointers, so a tap on the outfit rail lands on nothing at all.
        await page.setViewportSize({ width: 932, height: 430 });
        await page.waitForTimeout(500);
        await page.evaluate(() => (window as unknown as { __trials: { app: { goto(s: string): void } } }).__trials.app.goto('garage'));
        await page.waitForSelector('.garage-screen.live', { timeout: 30_000 });
        // The screen reveals on an opacity ramp and `src/ui/live.ts` ignores pointers under .5 opacity
        // (the R6 touch invariant): tapping the instant the class lands is a tap on nothing.
        await page.waitForTimeout(3000);
        garageOk = true;
        for (const bike of ['rookie', 'pro'] as const) {
          await page.waitForFunction(() => ((window as unknown as { __render?: { heroLoading?: number } }).__render?.heroLoading ?? 0) === 0, null, { timeout: 90_000 }).catch(() => undefined);
          await tap(`button[data-bike="${bike}"]`);
          for (const preset of AVAILABLE_RIDER_PRESETS) {
            // Wait for the PREVIOUS swap to finish before asking for the next one: a tap while the
            // renderer is still installing a document is dropped, which is what made the two taps
            // straight after garage entry look like a cache miss when nothing had missed at all.
            await page.waitForFunction(() => ((window as unknown as { __render?: { heroLoading?: number } }).__render?.heroLoading ?? 0) === 0, null, { timeout: 90_000 }).catch(() => undefined);
            let tapped = await tap(`button[data-outfit="${preset.id}"]`);
            let settled = await swapped(preset.id, bike, 90_000);
            if (!settled) {
              tapped = (await tap(`button[data-outfit="${preset.id}"]`)) || tapped;
              settled = await swapped(preset.id, bike, 90_000);
            }
            const heroDoc = await page
              .evaluate(() => {
                const r = (window as unknown as { __render?: { debugInfo(): Record<string, unknown>; riderDocumentOutfit?: string | null; bikeDocumentClass?: string | null } }).__render;
                if (!r) return 'no __render';
                return `${String(r.debugInfo()['heroDoc'] ?? '')} [${String(r.riderDocumentOutfit)} / ${String(r.bikeDocumentClass)}]`;
              })
              .catch(() => '');
            const rect = await page
              .evaluate(
                (sel) => {
                  const r = (window as unknown as { __render?: { riderDocumentOutfit?: string | null; bikeDocumentClass?: string | null; heroLoading?: number } }).__render;
                  const btn = document.querySelector(sel);
                  return {
                    selected: btn ? btn.className : 'no button',
                    status: document.querySelector('.outfit-current')?.textContent ?? '',
                    loading: r?.heroLoading ?? -1,
                    outfit: r?.riderDocumentOutfit ?? null,
                    bike: r?.bikeDocumentClass ?? null,
                  };
                },
                `button[data-outfit="${preset.id}"]`,
              )
              .catch(() => null);
            combos.push({ combo: `${preset.id} x ${bike}`, heroDoc, tapped, rect, ok: tapped && settled && !/proc/i.test(heroDoc) });
          }
        }
      } catch (e) {
        combos.push({ combo: 'garage', heroDoc: String(e), tapped: false, ok: false });
      }
      const swapsOk = garageOk && combos.length === AVAILABLE_RIDER_PRESETS.length * 2 && combos.every((c) => c.ok) && modelFailures.length === 0;
      check('offline.garageSwapsOffline', swapsOk, `${combos.filter((c) => c.ok).length}/${combos.length} combinations`, `${modelFailures.length} failed /models/ requests${combos.filter((c) => !c.ok).length ? `; bad: ${combos.filter((c) => !c.ok).map((c) => `${c.combo} (${c.heroDoc || 'no document'})`).join(', ')}` : ''}`);

      // The ride: the golden recording through the page's own solver, offline, against the online run.
      const offRide = goldenJson ? await replayGolden(page, goldenJson) : null;
      const rideOk = !!offRide && !!onlineRide && offRide.hash === onlineRide.hash && offRide.finishTime === onlineRide.finishTime && offRide.finishTime !== null;
      check('offline.rideFinishes', rideOk, offRide ? `${offRide.finishTime?.toFixed(4) ?? 'no finish'} s · ${offRide.hash.slice(0, 12)}` : 'no replay', onlineRide ? `online ${onlineRide.finishTime?.toFixed(4) ?? 'none'} · ${onlineRide.hash.slice(0, 12)}` : 'no online run to compare');

      measured['offline'] = { read: { ...read, errors: undefined }, nav, isolated, wire: { bytes: wire.bytes, requests: wire.requests }, frame, ride: offRide, worldMap: wm, inbox, garage: { combos, modelFailures } };
      check('offline.noPageErrors', offErrors.length === 0, offErrors.length, offErrors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    await server.start();

    // ---- 3. B-SLOW: a warm start does not wait on the wire --------------------------------------
    server.reset();
    {
      const ctx = await open(false);
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50e3 / 8, uploadThroughput: 20e3 / 8 });
      const t0 = Date.now();
      let leaveMs = -1;
      await page.goto(url, { waitUntil: 'commit' }).catch(() => undefined);
      while (Date.now() - t0 < BOOT_CAP_MS) {
        const gone = await page.evaluate(() => !document.getElementById('loader')).catch(() => false);
        if (gone) {
          leaveMs = Date.now() - t0;
          break;
        }
        await page.waitForTimeout(100);
      }
      const wire = server.snapshot();
      const offlineMs = (measured['offline'] as { read: BootRead }).read.leaveMs;
      // 50 kbps with 400 ms of latency: anything that still waits on the wire cannot come in near the
      // offline time. The factor is generous because the SwiftShader boot itself is noisy.
      const ok = leaveMs > 0 && offlineMs > 0 && leaveMs <= offlineMs * 1.6;
      check('offline.slowStart', ok, `${leaveMs} ms at 50 kbps / 400 ms RTT`, `offline was ${offlineMs} ms; limit ×1.6 = ${Math.round(offlineMs * 1.6)} ms; ${wire.bytes} B over the wire`);
      measured['slowStart'] = { leaveMs, offlineMs, wire: { bytes: wire.bytes, requests: wire.requests } };
      await ctx.close();
    }

    // ---- 4. A deploy does not cost the player their models --------------------------------------
    server.reset();
    server.bumpBuild = 'next';
    {
      const ctx = await open(false);
      const errs: string[] = [];
      const { page, read } = await bootPage(ctx, url, errs);
      await page.waitForTimeout(2000);
      const dump = await dumpCache(page);
      const wire = server.snapshot();
      const modelBytes = Object.entries(wire.byUrl)
        .filter(([u]) => /\/models\//.test(u))
        .reduce((n, [, b]) => n + b, 0);
      const ok = read.done && dump.models >= 14 && modelBytes === 0 && errs.length === 0;
      check('offline.updateSurvives', ok, `${dump.models} models kept · ${(wire.bytes / 1e3).toFixed(1)} KB re-fetched`, `${modelBytes} B of models off the wire (must be 0); loader ${read.download}/${read.setup}${errs.length ? `; errors ${errs.join(' | ')}` : ''}`);
      measured['updateBoot'] = { read: { ...read, errors: undefined }, dump: { ...dump, urls: undefined }, wire: { bytes: wire.bytes, requests: wire.requests, byUrl: wire.byUrl }, modelBytes };
      await ctx.close();
    }
    server.bumpBuild = '';
  } finally {
    await server.stop().catch(() => undefined);
    fs.rmSync(profile, { recursive: true, force: true });
  }

  measured['checks'] = checks;
  return { checks, measured };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
  const report = await offlineSuite({ verbose: args.get('verbose') === '1' });
  const out = path.join(OUT_DIR, 'offline', 'offline.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report.measured, null, 2));
  const failed = report.checks.filter((c) => !c.pass);
  console.log(`\noffline e2e: ${report.checks.length - failed.length}/${report.checks.length} checks pass → ${path.relative(REPO_ROOT, out)}`);
  process.exit(failed.length ? 1 : 0);
}
