# Cache policy (`vercel.json`) — ask 58, `docs/plans/PWA_OFFLINE.md` §4

Vercel's `vercel.json` schema rejects unknown keys, so the rationale that used to live in `$comment` keys lives here.
Keep this file and `vercel.json` in step.

- **`(file)`** — Cache policy (ask 58, docs/plans/PWA_OFFLINE.md §4). Vercel applies every matching rule and the LAST match wins per header key, so this file reads top to bottom: the catch-all, then the long-lived classes, then the four files that must never be cached. Cross-origin isolation (COOP same-origin + COEP require-corp) is on the catch-all and is never overridden — the harness's 5 µs performance.now() depends on it, and a response replayed from Cache Storage carries the headers it was stored with. Everything under /art/ and /models/ is versioned: models by their path (/models/<16hex>/<name>-<16hex>.glb), art by a ?v=<8 hex of the file> the manifest carries (src/ui/art.ts) and the world-map plates by the build's hash of public/art/worldmap (src/ui/worldMap.ts). The two indexes that hand out those versions revalidate every time, which is what keeps a month-long cache honest.
- **`/assets/(.*)`** — Content-hashed by filename: safe forever.
- **`/models/(.*)`** — /models/<16hex>/<name>-<16hex>.glb — content-addressed twice over (src/boot/model-catalog.ts).
- **`/fonts/(.*)`** — One month, the user's call: 'maybe max-age one month, so that it does get garbage collected eventually'. Was max-age=0, must-revalidate — a conditional round trip per font on every load.
- **`/art/manifest.json`** — The indexes that carry the ?v= versions: cached for a month, they would pin a month-old art pack.
- **`/`** — The service worker owns the document; a cached index.html would pin an old build id and an old entry chunk.
- **`/sw.js`** — sw.js and load-manifest.json are how a new build is discovered and named. A cached copy of either is an update the player can never take.
