/* ROCKHOP service worker (docs/design/game.md §14, docs/plans/PWA_OFFLINE.md).
 *
 * Emitted by the `rockhop:pwa` Vite plugin with `__BUILD_ID__` / `__ASSET_ID__` replaced per build.
 * `__BUILD_ID__` is `<git sha>-<content hash of every emitted + public file>`: a deploy that changes
 * bytes is a byte-different worker (the browser installs it); a rebuild of the same tree is the SAME
 * worker, so a rebuild no longer throws the player's 31 MB away.
 *
 * THREE caches, because they expire on three different clocks (plan §2.3):
 *   rockhop-immutable          content-addressed, therefore forever: /assets/*-<8>.{js,css} and
 *                             /models/<16hex>/<name>-<16hex>.glb. `activate` PRUNES it to the URLs
 *                             the new build's load-manifest names — it never deletes it wholesale.
 *   rockhop-static-<assets>   unhashed but rarely edited: /fonts/**, /art/**. Keyed by a hash of
 *                             public/ alone, so a JS-only deploy does NOT re-download 7 MB of art.
 *   rockhop-shell-<build>     the ~25 KB that changes every build: index.html, offline.html,
 *                             manifest.webmanifest, load-manifest.json.
 *   rockhop-audio             the recorded music (/audio/<cue>-<8 hex>.m4a, src/audio/music/cues.ts):
 *                             content-addressed, cache-first from the FIRST play, never precached (6.5 MB
 *                             the player may never hear). Not in the load-manifest, so the immutable prune
 *                             would drop it: its own cache, which keeps one file per cue (a new hash of
 *                             `menu` replaces the old one when it is first fetched).
 *
 *   install   precache the critical shell (strict — a failed shell fails install, so the old worker
 *             keeps serving) plus the icons (tolerant: the `art=absent` harness config has none).
 *   activate  drop stale shell/static caches, prune (never wipe) the immutable cache, claim.
 *   fetch     hashed assets / models: cache-first into rockhop-immutable;
 *             fonts / art / flat models: cache-first into the static cache;
 *             the document: cache-first with a background revalidate (a flapping link must never
 *             hold the first paint — the plan's B-SLOW), offline.html as the last resort;
 *             load-manifest.json / sw.js / manifest.webmanifest: network-first, cache fallback;
 *             version.json: network-only, never cached (the "new build" pill must hear the server);
 *             /api/**, cross-origin and `?harness=1`: untouched.
 *   message   { type: 'SKIP_WAITING' } → activate now (the boot's start-of-load update, src/boot/sw.ts)
 *             { type: 'VERSION' }      → what this worker holds, back on the message port.
 *
 * There is no background/just-in-time fill: the user's rule is "load everything up front, but
 * aggressively cache it". The boot fetches the whole offline set inside its own bars and every one
 * of those requests passes through `cacheFirst` below, so the second boot is all cache.
 */
const BUILD = '__BUILD_ID__';
const ASSETS = '__ASSET_ID__';
const SHELL = `rockhop-shell-${BUILD}`;
const STATIC = `rockhop-static-${ASSETS}`;
const IMMUTABLE_CACHE = 'rockhop-immutable';
const AUDIO_CACHE = 'rockhop-audio';
const KEEP = [SHELL, STATIC, IMMUTABLE_CACHE, AUDIO_CACHE];
/** The pre-rebrand name of the immutable cache: carried over once so the rename costs a returning player no re-download. */
const LEGACY_IMMUTABLE = 'trials-immutable';

/** Install fails without these: an incomplete shell must not pretend to be installed. */
const SHELL_CRITICAL = ['./index.html', './offline.html', './manifest.webmanifest'];
/** Nice to have at install; absent in the harness's `art=absent` configuration, so never fatal. */
const SHELL_OPTIONAL = ['./art/icons/apple-touch-icon.png', './art/icons/favicon.svg', './art/icons/favicon-32.png', './art/icons/icon-192.png', './art/icons/icon-maskable-192.png'];

const IMMUTABLE_RE = /\/assets\/.+-[\w-]{8}\.\w+$|\/models\/[a-f0-9]{16}\/[\w-]+-[a-f0-9]{16}\.glb$/;
const STATIC_RE = /\/fonts\/|\/art\/|\/models\//;
/** A music cue: `/audio/<cue>-<8 hex>.m4a`; group 1 is the cue, the part two builds of the same cue share. */
const AUDIO_RE = /\/audio\/([\w-]+)-[a-f0-9]{8}\.m4a$/;

const cacheFor = (pathname) => (IMMUTABLE_RE.test(pathname) ? IMMUTABLE_CACHE : STATIC);

/**
 * `ignoreVary` is not an optimisation, it is the whole thing working. `vite preview` (and any host
 * that adds CORS headers) answers with `Vary: Origin`; Cache Storage then refuses to match a stored
 * entry against an otherwise identical later request, so every single core file MISSED and went back
 * to the network — which looked like a working offline boot only because the HTTP disk cache was
 * quietly answering. With the origin actually unreachable it failed at DOWNLOAD 0. We key these
 * caches by URL and never store content-negotiated variants, so Vary has nothing to tell us.
 *
 * `ignoreSearch` is deliberately NOT set: since round 4 the art pack's version travels in the query
 * (`?v=<8 hex>`, src/ui/art.ts), and ignoring the query would serve last month's plate for a new URL.
 */
const MATCH_OPTS = { ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // The manifest is the worker's only name for the rest of the build; it is cached, never derived.
      try {
        const res = await fetch('./load-manifest.json', { cache: 'no-cache' });
        if (res.ok) await cache.put('./load-manifest.json', res.clone());
      } catch {
        /* offline install (an evicted worker re-installing with no radio): `fetch` fills lazily */
      }
      await cache.addAll(SHELL_CRITICAL); // throws → install fails → the old worker keeps serving
      const statics = await caches.open(STATIC);
      // Only what is missing: when the asset stamp is unchanged these are already held, and a deploy
      // must not spend the player's bytes re-fetching bytes it still has.
      await Promise.all(SHELL_OPTIONAL.map(async (u) => ((await statics.match(new URL(u, self.registration.scope).href, MATCH_OPTS)) ? undefined : statics.add(u).catch(() => undefined))));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await adoptLegacyImmutable();
      for (const k of await caches.keys()) if (!KEEP.includes(k)) await caches.delete(k);
      await pruneImmutable();
      await self.clients.claim();
    })(),
  );
});

/** Copy the old-named immutable cache into the new one (content-addressed: same URL, same bytes), then drop it. */
async function adoptLegacyImmutable() {
  if (!(await caches.has(LEGACY_IMMUTABLE))) return;
  const from = await caches.open(LEGACY_IMMUTABLE);
  const to = await caches.open(IMMUTABLE_CACHE);
  for (const req of await from.keys()) {
    if (await to.match(req, MATCH_OPTS)) continue;
    const res = await from.match(req, MATCH_OPTS);
    if (res) await to.put(req, res);
  }
  await caches.delete(LEGACY_IMMUTABLE);
}

/** Drop only the content-addressed entries this build no longer names. No manifest → no prune (never a wipe). */
async function pruneImmutable() {
  const names = await manifestPaths();
  if (!names) return;
  const cache = await caches.open(IMMUTABLE_CACHE);
  for (const req of await cache.keys()) {
    const p = new URL(req.url).pathname;
    if (IMMUTABLE_RE.test(p) && !names.has(p)) await cache.delete(req);
  }
}

/** The cached manifest's item paths as absolute pathnames, or null when it was never cached. */
async function manifestPaths() {
  const list = await manifestItems();
  if (!list) return null;
  const out = new Set();
  for (const i of list) out.add(new URL(i.path, self.registration.scope).pathname);
  return out;
}

async function manifestItems() {
  const cache = await caches.open(SHELL);
  const res = await cache.match(new URL('./load-manifest.json', self.registration.scope).href, MATCH_OPTS);
  if (!res) return null;
  try {
    return (await res.json()).items || [];
  } catch {
    return null;
  }
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  else if (data.type === 'VERSION') event.waitUntil(reply(event, version()));
});

async function reply(event, work) {
  const payload = await work.catch((e) => ({ error: String(e) }));
  const port = event.ports && event.ports[0];
  if (port) port.postMessage(payload);
  else if (event.source) event.source.postMessage(payload);
}

/** What this worker holds, so the page (and the offline gate) can state it rather than guess. */
async function version() {
  let entries = 0;
  let bytes = 0;
  let models = 0;
  for (const name of KEEP) {
    const cache = await caches.open(name);
    for (const req of await cache.keys()) {
      entries++;
      if (/\/models\//.test(new URL(req.url).pathname)) models++;
      const res = await cache.match(req, MATCH_OPTS);
      if (!res) continue;
      const len = res.headers.get('content-length');
      bytes += len ? Number(len) : (await res.clone().arrayBuffer()).byteLength;
    }
  }
  return { type: 'VERSION', build: BUILD, caches: KEEP, entries, models, bytes };
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return; // the review inbox: network-only, queued in localStorage when it fails
  if (url.searchParams.get('harness') === '1') return; // the evidence harness measures the network, not the cache
  // Network-only, never cached: the "new build" pill (src/ui/updatePill.ts) asks the SERVER which build is live.
  // A cached answer would be this worker's own build and the pill could never light; offline it fails and stays dark.
  if (url.pathname.endsWith('/version.json')) return;
  const isDoc = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  if (isDoc) {
    event.respondWith(documentResponse(event, req));
    return;
  }
  if (url.pathname.endsWith('/load-manifest.json') || url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/manifest.webmanifest')) {
    event.respondWith(networkFirst(req, SHELL));
    return;
  }
  const cue = AUDIO_RE.exec(url.pathname);
  // A Range request (an <audio> element seeking) cannot be answered from, or stored into, Cache Storage whole:
  // leave it to the network. The game fetches cues whole and decodes them (src/audio/music).
  if (cue && !req.headers.has('range')) {
    event.respondWith(audioFirst(req, cue[1]));
    return;
  }
  if (IMMUTABLE_RE.test(url.pathname) || STATIC_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(req, cacheFor(url.pathname)));
    return;
  }
  event.respondWith(networkFirst(req, STATIC));
});

/**
 * The document, cache-first with a background revalidate. Network-first here is the B-SLOW bug: a
 * flapping radio holds the first paint behind a request whose bytes are already on disk, and `/` is
 * `no-store` on the host so the HTTP cache is not a second line of defence. A new build arrives by
 * its own worker installing and the boot activating it (src/boot/sw.ts), never by this revalidate.
 */
async function documentResponse(event, req) {
  const cache = await caches.open(SHELL);
  const hit = (await cache.match('./index.html', MATCH_OPTS)) || (await cache.match(req, MATCH_OPTS));
  if (hit) {
    event.waitUntil(
      fetch(req)
        .then((res) => (res.ok ? cache.put('./index.html', res.clone()) : undefined))
        .catch(() => undefined),
    );
    return hit;
  }
  try {
    const res = await fetch(req);
    if (res.ok) cache.put('./index.html', res.clone()).catch(() => undefined);
    return res;
  } catch (e) {
    const fallback = await cache.match('./offline.html', MATCH_OPTS);
    if (fallback) return fallback;
    throw e;
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, MATCH_OPTS);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone()).catch(() => undefined);
  return res;
}

/** Cache-first for a music cue; a first fetch also drops the cue's older hashes, so the cache holds one file per cue. */
async function audioFirst(req, cue) {
  const cache = await caches.open(AUDIO_CACHE);
  const hit = await cache.match(req, MATCH_OPTS);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.status === 200) {
    const keep = new URL(req.url).pathname;
    cache
      .put(req, res.clone())
      .then(async () => {
        for (const old of await cache.keys()) {
          const p = new URL(old.url).pathname;
          const m = AUDIO_RE.exec(p);
          if (m && m[1] === cue && p !== keep) await cache.delete(old);
        }
      })
      .catch(() => undefined);
  }
  return res;
}

async function networkFirst(req, name) {
  const cache = await caches.open(name);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone()).catch(() => undefined);
    return res;
  } catch (e) {
    const hit = await cache.match(req, MATCH_OPTS);
    if (hit) return hit;
    throw e;
  }
}
