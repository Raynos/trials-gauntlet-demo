/* Trials Gauntlet service worker (docs/design/game.md §14).
 *
 * Emitted by the `trials:pwa` Vite plugin with `__BUILD_ID__` replaced per build, so every
 * deploy is a byte-different worker → the browser installs it → the page shows
 * "Update available → Reload" (the standalone-PWA reload problem: no browser chrome).
 *
 *   install   precache the load manifest's `core` + `title` phases (entry, three, fonts, key art)
 *   fetch     hashed assets / fonts / art / models: cache-first (immutable);
 *             index.html, load-manifest.json, sw.js: network-first, cache fallback (offline boot);
 *             `?harness=1` and cross-origin: untouched.
 *   message   { type: 'SKIP_WAITING' } → activate now (the toast's Reload button).
 */
const BUILD = '__BUILD_ID__';
const CACHE = `trials-${BUILD}`;
const PRECACHE_PHASES = new Set(['core', 'title']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch('./load-manifest.json', { cache: 'no-cache' });
        if (res.ok) {
          const manifest = await res.clone().json();
          const urls = (manifest.items || []).filter((i) => PRECACHE_PHASES.has(i.phase)).map((i) => i.path);
          await Promise.all(urls.map((u) => cache.add(u).catch(() => undefined)));
          await cache.put('./load-manifest.json', res);
        }
      } catch {
        /* offline install: the fetch handler fills the cache lazily */
      }
      await cache.add('./index.html').catch(() => undefined);
      await cache.add('./manifest.webmanifest').catch(() => undefined);
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

const IMMUTABLE = /\/assets\/.+-[\w-]{8}\.\w+$|\/fonts\/|\/art\/|\/models\//;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.searchParams.get('harness') === '1') return; // the evidence harness measures the network, not the cache
  const isDoc = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  const isManifest = url.pathname.endsWith('/load-manifest.json') || url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/manifest.webmanifest');
  if (isDoc || isManifest) {
    event.respondWith(networkFirst(req, isDoc ? './index.html' : undefined));
    return;
  }
  if (IMMUTABLE.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }
  event.respondWith(networkFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone()).catch(() => undefined);
  return res;
}

async function networkFirst(req, fallbackKey) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone()).catch(() => undefined);
    return res;
  } catch (e) {
    const hit = (await cache.match(req, { ignoreSearch: true })) || (fallbackKey ? await cache.match(fallbackKey) : undefined);
    if (hit) return hit;
    throw e;
  }
}
