# PWA offline — round 1 evidence (ask 58)

Headless Chromium (SwiftShader), iPhone geometry 430×932 @ 2, `vite preview` over `dist/` at `c1c9ef6` +
round-1 changes. Profile is a `chromium.launchPersistentContext` directory reused across phases; the browser
process is killed between them, so every phase is a genuine cold start. Wire bytes are counted **in the HTTP
server**, not in the page — the boot's bytes are fetched by the service worker, whose requests belong to the
worker target and never reach a page-level CDP session (the first two attempts at this measurement reported a
false `0`).

Runner: `measure.mts` (a copy of the throwaway used here; the shippable suite is `harness/e2e/offline.mts`, R2).
Raw: `measure.json` (phases 1–3), `measure-update.json` (phase 4), `cache-after-one-load.txt` (every cached URL).

## 1. After exactly ONE online load

| | before (plan §1.1 M1) | after R1 |
|---|---|---|
| Cache Storage entries | 30 | **65** |
| `/models/` entries | **0** | **14** (all five outfits, both liveries, authored + LOD) |
| `/assets/` entries | 2 | 2 (`three`, `index` — the whole JS) |
| `/art/` entries | 22 | 42 |
| bytes held (worker's own `VERSION` count) | — | **32 158 162** |
| `storage.estimate().usageDetails.caches` | 4 068 352 | **33 519 872** |
| caches | one, `trials-<sha>-<Date.now()>` | `trials-shell-c1c9ef6-<hash>` (4) · `trials-static-7f47de05c2` (45) · `trials-immutable` (16) |
| bytes over the wire | — | 30 766 814 in 70 requests |
| loader | 100 / 100, `data-done=1`, gone at 15 955 ms, 0 page errors |

## 2. Cold OFFLINE start after that one load

The **HTTP server is shut down** for this phase. Playwright's `offline` flag does not reach service-worker
fetches (proven here: with the flag set and the server up, six core files still went to the origin and came back
`304`), so an unreachable origin is the only honest aeroplane mode. The context is set offline as well.

| reading | value |
|---|---|
| loader | DOWNLOAD **100**, SETUP **100**, `data-done = 1`, loader gone at **13 306 ms** |
| requests that reached the origin | **0** |
| bytes over the wire | **0** |
| navigation `transferSize` / `workerStart` | **0** / **0.48 ms** |
| page errors | **0** |

Before R1 this was the plan's M3: `#loader.failed`, `Could not load ./assets/index-*.js`, no game — and it took
**two** online visits to fix. It now takes one.

## 3. Warm ONLINE start (full cache, radio on)

0 body bytes. 3 requests, 2 distinct URLs, both `304`: `/` (the document's background revalidate) and `/sw.js`
(the update check). Nothing else leaves the browser.

## 4. Update boot — what adopting a new build actually costs

Build A cached as above; a source edit produced build B; the same profile then booted once, online, on the same
origin. The boot adopted the waiting worker at the very start of the loading screen and reloaded onto it — one
loading screen, no toast, no prompt.

| | bytes | requests |
|---|---|---|
| cold first boot (build A) | 30 766 814 | 70 |
| **update boot (A → B)** | **379 851** | 15 |

**1.2 % of a cold boot.** What was fetched: the entry chunk that actually changed (`index-*.js`, 338 886 B),
`index.html` twice (7 294 B each — install's precache and the document revalidate), `sw.js`, `load-manifest.json`,
`manifest.webmanifest` and four icons. **`three-*.js` was not re-fetched. None of the 14 hero GLBs was
re-fetched** — the immutable cache survived the deploy and `activate` pruned instead of wiping. The icon
re-fetch was removed after this measurement (install now skips what the static cache already holds), so the
real figure is ≈ 364 KB.

Loader: 100 / 100, gone at 14 606 ms, 0 page errors. Cache after: 65 entries, 14 models, same 32 158 162 B.

## The finding that mattered

**`Vary: Origin` silently broke every `cache.match`.** `vite preview` (and any host that adds CORS headers)
answers with `Vary: Origin`; Cache Storage then refuses to match a stored entry against an otherwise identical
later request. Every core file MISSED and went back to the network — and it *looked* like it worked, because the
browser's own HTTP disk cache answered the re-request with a `304`. With the origin actually unreachable the boot
died at DOWNLOAD 0 with `TypeError: Failed to fetch`. The fix is `{ ignoreSearch: true, ignoreVary: true }` on
every match in `src/pwa/sw.js`.

This very likely also explains the plan's M4 ("boots offline after two loads"): that reading was taken with the
preview server still running, so the HTTP cache could have been doing the work.
