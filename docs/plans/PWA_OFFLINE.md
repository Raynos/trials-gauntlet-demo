# PWA / offline — the game plays with the radio off (ask 58)

**Goal (the user's words):** "I tried to play the game with no data, no internet, and it doesn't work. I have it saved to the home screen and it didn't load. I want this game, this website, to be a progressive web app — after the first load, I want to be able to play it offline, just like whatever is necessary for a website that works offline. Obviously to play a web game offline you have to load it the first time, I fully understand that."

**The bar (two lines, both measured, neither a feeling):**

- **B-OFF — one load is enough.** Installed to the iOS home screen, aeroplane mode, cold start (app killed, browser process gone): the loader paints, reaches `100 / 100`, the menu draws and **b1 is ridden to the finish**, with no network at all — after **exactly one** prior online visit, not two.
- **B-SLOW — a bad network never blocks a start the cache could have served.** On a throttled or flapping link, a start that could have come from Cache Storage is not held behind a network request. No boot step may block on a fetch whose bytes are already local.

`docs/mission.md` holds the bars no plan closes; this plan closes neither of them — it carries its own two, which are measurable and shippable. The nearest mission line is §4 ("fast loads … are MANDATORY").

Ledger row: `docs/tasks/ASKS.md` ask 58 (in flight).

---

## 1. What is actually there today (measured, not assumed)

This repo **already has** a service worker and a web app manifest. They are not missing — they are wired so that the first load does not fill the cache.

| piece | file | state |
|---|---|---|
| SW source | `src/pwa/sw.js` (3 627 B emitted) | install precaches `core` + `title` phases only; `fetch` is cache-first for `/assets/<hashed>`, `/fonts/`, `/art/`, `/models/`, network-first for the document, `load-manifest.json`, `sw.js`, `manifest.webmanifest`; `?harness=1` passes through untouched |
| SW emit | `vite.config.ts` → `pwa(id)` plugin | `__BUILD_ID__` → `` `${sha}-${Date.now().toString(36)}` `` — **a rebuild of the same commit produces a new cache name** |
| registration | `src/game/pwa.ts`, called from `src/main.ts:354` | `import.meta.env.PROD && params.get('sw') !== '0'`; registers `./sw.js` at the **tail of the `front` boot step**; `visibilitychange` → `reg.update()` |
| update UI | `src/game/app.ts:1008–1012` `showUpdate` / `reloadForUpdate`, `UpdateToast` at `app.ts:408` | Reload button posts `SKIP_WAITING`; `controllerchange` reloads once, guarded by `requested` so the first-visit `clients.claim()` does not double-load |
| manifest | `public/manifest.webmanifest` (1 260 B), linked in `index.html` | `name`, `short_name`, `id`/`start_url`/`scope` `./`, `display: standalone`, `orientation: landscape`, `background_color #07080a`, `theme_color #0b0d10`, 3 `any` icons (192/512/1024) + 2 `maskable` (192/512), one wide screenshot |
| iOS meta | `index.html` head | `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style: black-translucent`, `apple-mobile-web-app-title`, `apple-touch-icon` 180×180 (4 529 B). **No `apple-touch-startup-image` at any size** |
| harness | `harness/e2e/boot.mts` | net `lte`/`3g` × sw `off`/`on` × art `present`/`absent`; the `sw=on` row does one warm load then measures the next. **Nothing in the tree ever calls `context.setOffline(true)`** — `?sw=0` is used by every other harness entry (`harness/bench/idle.ts:153`, `harness/out/round4/cap.mts:30`, …) |
| host | `vercel.json` | `/` and `/index.html` `no-store`; `/assets/(.*)` `max-age=31536000, immutable`; **everything else** `max-age=0, must-revalidate` — including `/models/**` and `/art/**`, which are content-addressed or stable; plus COOP `same-origin` + COEP `require-corp` on every response |

### 1.1 The measured failure (headless, Chromium, `dist/` at `58e63c7` via `vite preview`)

Driven with Playwright, iPhone-sized context (430×932 @ 2), the SW **on** (no `?sw=0`). Cache contents read with `caches.keys()` / `cache.keys()`, storage with `navigator.storage.estimate()`.

| run | what was done | Cache Storage after | usage |
|---|---|---|---|
| **M1** | **one** online load, to `ready` + `serviceWorker.ready` + 5 s | 30 entries — 2 `/assets`, 3 `/fonts`, 22 `/art`, **0 `/models`** | 4 068 352 B |
| **M2** | a **second** online load, same profile | 73 entries — 2 `/assets`, 3 `/fonts`, 50 `/art`, **14 `/models`** | 31 054 336 B |
| **M3** | after M1 only: browser closed, relaunched **offline**, cold navigate | loader enters `#loader.failed` and never leaves. Two observed modes across runs: `Could not load ./assets/index-D6jqMpSb.js` at `DOWNLOAD 6 %`, and `TypeError: Failed to fetch` at `0 %`. Watched 90 s and 120 s. Retry button, no game. | — |
| **M4** | after M2: browser closed, relaunched **offline** (`launchPersistentContext`, `offline: true`), cold navigate | **boots**. `DOWNLOAD 100` (`27.02 MB · complete`), `SETUP 100`, loader gone at **18 541 ms**, 0 page errors | 31 057 963 B |
| **M5** | the same offline switch inside an ephemeral `browser.newContext()` | Cache Storage did not survive; core fetches threw `TypeError: Failed to fetch` with `caches.match` MISS on files a prior dump had shown present | — |

**This is the whole bug, and it is exactly the user's sentence.** The machinery works (M4). What does not work is that **the first load leaves the 24.56 MB the boot just downloaded out of the cache** (M1: 0 models), so the user's one visit → home screen → aeroplane mode → nothing (M3). It takes **two** online visits today.

M5 is a harness constraint, not a product finding: the offline gate must use `chromium.launchPersistentContext`, not `browser.newContext`.

### 1.2 Root causes, named

1. **Registration is too late.** `src/main.ts:354` registers the worker at the end of the `front` step — after the boot has already requested three.js, the game chunk, the fonts, the boot art and all 14 hero GLBs. Install + activate + `clients.claim()` land while the page is already past them, so `cacheFirst` never sees those requests. (It *does* see the post-`ready` art prefetches — that is why M1 has 22 `/art` entries and M2 has 50.)
2. **The precache list is the shell only.** `PRECACHE_PHASES = new Set(['core', 'title'])` in `src/pwa/sw.js`. The `models` (24.56 MB), `menu` and `world` phases are never precached, and the `world`/`worldmap` art is not even in `dist/load-manifest.json` (see §2).
3. **Every deploy wipes everything.** `activate` does `for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)`. The cache name carries `Date.now().toString(36)`, so a rebuild of the same commit is a new name. After any deploy the installed PWA is back at M1 (0 models) and needs another *two* online loads.
4. **Precache failures are silent.** `cache.add(u).catch(() => undefined)` and `await cache.add('./index.html').catch(() => undefined)` — install can "succeed" with an incomplete shell and nothing says so.
5. **No offline knowledge in the boot.** The loader has one failure path: `plan.fail(...)` → `#loader.failed` + Retry (`src/boot/inline.ts:30,44,78`). It cannot say "you are offline and this build was never fully downloaded", and it cannot start a reduced boot.
6. **Host headers fight the worker.** `/models/**` and `/art/**` are `max-age=0, must-revalidate`, so any second request for a hashed, content-addressed GLB is a conditional network round trip rather than a disk-cache hit — which matters the moment the SW wants to precache something the page already fetched.

---

## 2. The byte budget (every number from this repo / this `dist/`)

`dist/` at `58e63c7`. Sizes are raw bytes on disk; `gz` where the build reports it (`dist/load-manifest.json`, written by `vite.config.ts` `trials:load-manifest`).

### 2.1 What each stage costs

| stage | what is fetched | files | bytes | content-hashed? |
|---|---|---|---|---|
| **(a) first paint** | `index.html` (the ≤ 8 192 B inline loader from `src/boot/inline.ts` is compiled into it) | 1 | **19 090 B** | **no** — and `no-store` per `vercel.json` |
| **(b) boot → `ready`** (the one bar) | core `1 817 KB` (`three-*.js` 746 502 · `index-*.js` 1 068 671 · 3 × `BarlowCondensed-*.woff2` 44 KB) + **hero models 24.56 MB** (14 GLB: 7 authored 17.14 MB + 7 LOD 7.42 MB) + boot art 704 KB (the 16 `BOOT_IDS` in `src/render/art/boot-set.ts`) | 5 + 14 + 16 | **27.02 MB** (the loader prints exactly this: `27.02 MB · complete`) | JS yes (`-<8>`), GLB yes (`/models/<16hex>/<name>-<16hex>.glb`), **fonts no**, **art webp no** |
| **(c) menu, after `ready`** | key art + menu plate `1 259 KB` (streamed as the `after` row, `src/main.ts:296`); track cards / tier cards / medals / results backgrounds / thumbs / icons / social `2 790 KB` | ~60 | **4 049 KB** | **no** |
| **(d) world map** | `public/art/worldmap/**` — world plate + 5 region plates × 1536/1024 + `worldmap.json` | **13** | **3 014 KB** (1536 tier 1 705 KB · 1024 tier 1 306 KB) | **no**, and **not listed in `dist/load-manifest.json` at all** (`publicItems()` walks `fonts/`, the art manifest's `assets`, the icons and `models/` — the worldmap folder is in none of them) |
| **(e) first ride, b1 (industrial)** | biome/world art beyond the boot set — the art pack's non-menu kinds total `2 613 KB`, of which the 704 KB boot set is already in (b) | ~55 | **≤ 1 909 KB new** | **no** |
| **(f) garage** | **0 new bytes** — the authored hero is already in (b) and the garage set is procedural (`src/render/**`) | 0 | **0** | — |

### 2.2 The "playable offline" set

| set | bytes | note |
|---|---|---|
| minimum to cold-boot to `ready` | **27.02 MB** | (a) + (b); measured by the loader itself |
| + menu + world map + all biome art (everything a player touches) | **≈ 34.1 MB** | + (c) 4 049 KB + (d) 3 014 KB (one tier is enough: **1 705 KB** at 1536 or 1 306 KB at 1024) + (e) |
| **measured Cache Storage after two online loads** | **31 054 336 B** (73 entries) | M2 — the real number the origin holds today, before the world map or other biomes are visited |
| whole `dist/` minus source maps | **65.02 MB / 193 files** | |
| …of which never requested at runtime | **26.88 MB** | `dist/models/*.glb` + `*.source.json` — the unhashed `public/models` copies. `src/render/hero/models.generated.ts` resolves every logical name to the `/models/<16hex>/…` snapshot, so the flat copies are deployed dead weight |
| honest deployable/offline-relevant total | **≈ 38.1 MB** | 65.02 − 26.88 |

**The headline:** the first load already pulls 27.02 MB. Making that load offline-capable costs **zero extra bytes** — it only has to keep what it already fetched. Everything above 27.02 MB (world map, other biomes, the rest of the menu art: ≈ 7.1 MB) is a separate, explicit decision (§4).

### 2.3 What is hashed and what is not

- **Hashed, safe to cache forever:** `/assets/*-<8>.{js,css}`, `/models/<16hex>/<name>-<16hex>.glb`.
- **Not hashed, must be versioned by the cache name:** `index.html`, `sw.js`, `load-manifest.json`, `manifest.webmanifest`, `/fonts/*.woff2`, **every** `/art/**` file including all 122 manifest assets and the 13 worldmap plates, `/art/icons/*`.

That split is the whole cache-versioning design: hashed files can survive a deploy; unhashed ones cannot, and today the code throws both away together (§1.2.3).

---

## 3. The manifest and the install (iOS is the binding case)

The user has it on the iOS home screen, so iOS Safari's rules decide.

**What iOS honours:** `apple-touch-icon` (180×180 — present) and, since 16.4, the manifest's `icons`; `name` / `short_name`; `start_url` + `scope`; `display: standalone` (and the legacy `apple-mobile-web-app-capable`, also present); `theme_color`; `apple-mobile-web-app-status-bar-style`; service workers and Cache Storage inside the standalone app.

**What iOS does not honour (and what we must therefore not rely on):**
- `orientation: landscape` — a home-screen web app follows the device's rotation lock. The game must keep working from a portrait cold start. (It already handles rotation; the plan only requires that this is *stated*, not *assumed*.)
- `background_color` as a splash background — iOS composites the launch screen from `apple-touch-startup-image` links, and with none present (confirmed: `index.html` has no `apple-touch-startup-image`) the user sees a blank/white flash before the loader paints. **This is very likely part of "it didn't load"** from the user's point of view: a blank screen, then a failed loader.
- `screenshots`, `categories`, `id` semantics — Android/desktop install UI only.
- `beforeinstallprompt` — never fires on iOS; "Add to Home Screen" is manual.

**To add:**
1. `apple-touch-startup-image` links for the device set the user actually holds, dark (`#07080a`, matching `background_color`), with the wordmark plate — landscape and portrait, `media="(device-width:…) and (device-height:…) and (-webkit-device-pixel-ratio:…) and (orientation:…)"`. Generated in the art pipeline (`assets/art/build.mjs` style), output to `public/art/splash/`, added to the SW's `title` phase so the *next* cold start has them.
2. `apple-touch-icon` at 152 / 167 as well as 180 (iPad sizes; iOS downsizes 180 today, which is acceptable but not crisp).
3. Keep `orientation: landscape` in the manifest (Android honours it) and add a one-line comment in `index.html` that iOS does not, so nobody "fixes" the rotation handling away.
4. `display_override: ["standalone"]` is not needed; `"fullscreen"` is not wanted (the safe-area layout depends on the status bar insets already handled by `viewport-fit=cover`).

**Not a code change but a documented fact for the round's evidence:** an iOS home-screen app installed *before* a working SW existed keeps its own storage partition. It will pick up the new `sw.js` on its next **online** launch (the byte-different worker installs), and only then become offline-capable — see the risk in §9.

---

## 4. The service-worker strategy, asset class by asset class

The design principle, stated so the rounds can be judged against it:

> **"The first load" means one online visit that reaches `ready`. After it, everything that visit fetched is in Cache Storage, and everything the *first ride* additionally needs has been pulled in the background. Screens the player has not opened (other biomes, the world map's far tiers) are cached on use, and their absence degrades the picture, never the ride.**

| class | files | strategy | why |
|---|---|---|---|
| **app shell** | `index.html`, `manifest.webmanifest`, `sw.js`, `load-manifest.json`, `/art/icons/**`, `/art/splash/**` | **precache at install**, versioned by build; document served **cache-first with a background revalidate** (today it is network-first, so a flaky link stalls the first paint — that is B-SLOW) | the document must paint with no network; `no-store` on `/` means the HTTP cache is not a fallback, the SW is the only one |
| **content-hashed JS** | `/assets/*-<8>.js` (1 817 KB with fonts) | **precache at install**, cache-first, dropped only when the build's cache is dropped | immutable by construction; already `max-age=31536000, immutable` on Vercel |
| **fonts** | 3 × woff2, 44 KB | precache (part of the `core` phase) | tiny, unhashed → versioned with the build |
| **hero models** | 14 GLB, **24.56 MB** | **cached-on-use during the first boot**, because the boot fetches all of them anyway (`src/boot/asset-totals.ts` `HERO_FILE_SET`, ask 50). Requires the worker to be **controlling before the boot requests them** (§5 R1). Not `addAll`-precached: that would double the first visit's bytes | zero extra bytes; the boot already declares them in the one bar |
| **boot art** | 16 ids, 704 KB | same — cached on use during boot | in the one bar already |
| **menu / results / card art** | ≈ 4 049 KB | **background precache after `ready`**, low priority, one `cache.addAll` in chunks, driven by the `menu` phase of `load-manifest.json` | the player reaches the menu seconds later; this is the "first load" promise |
| **world-map plates** | 13 files, 3 014 KB (one tier 1 705 / 1 306 KB) | **background precache after `ready`, one tier only** (pick by `devicePixelRatio > 1.5 || innerWidth > 1400`, the same rule `worldMapScreen.ts` uses), the other tier cached on use | PLAY goes straight to the world map; a sea-blue continent is the current offline degrade (`this.art.probe(...)` at `worldMapScreen.ts:535` fails soft) |
| **other biomes' world art** | ≤ 1 909 KB | **cached on use** | b1 is industrial; the boot set covers it. Other biomes degrade to the tinted fallback `src/ui/art.ts` already provides |
| **`/api/inbox`** | — | **network-only, never cached**; must fail gracefully | `src/ui/inbox.ts` already queues failed sends in localStorage (`NoteQueue`, `inbox.ts:231`, flushed on `online` and on open, `inbox.ts:446`). The SW must not touch it: today non-GET already returns early (`req.method !== 'GET'`), but a GET `?list=1` would fall into `networkFirst` and throw — add an explicit `/api/` bypass |
| **navigation requests** | any URL in scope | cache-first on `./index.html`, with an **offline fallback document** if even that is missing (a static "this build was never finished downloading — connect once" page, precached, ≤ 2 KB) | the user must never see Safari's error page inside a standalone app, where there is no reload chrome |
| **cross-origin / `?harness=1`** | — | untouched (already) | the harness measures the network |

### 4.1 Storage budget reality on iOS

- Safari's per-origin quota is a share of free disk and is large (the headless Chromium run reported `quota: 10.7 GB`; iOS is smaller but well above our 31–38 MB). **Quota is not the risk. Eviction is.**
- Safari evicts **all** script-writable storage for an origin after **7 days of no user interaction** with that origin. A home-screen web app that the user opens counts as interaction, so a player who plays weekly is fine and a player who plays monthly is not — after eviction they need one online load again. This must be *stated in the plan and to the user*, not hidden.
- `navigator.storage.persist()` is not available on iOS Safari; there is no way to opt out of eviction. We can only keep the set small and re-fill it cheaply.
- ≈ 31 MB (M2) to ≈ 34 MB (with the world map) is a comfortable resident set, but it is **five outfits' worth of hero**. One outfit + one bike class would be 2 authored + 2 LOD ≈ 6.4 MB — see the open question in §9.

---

## 5. What the game must do differently when offline

- **The loader's honesty.** `src/boot/inline.ts` + `src/boot/plan.ts` keep two tracks (DOWNLOAD / SETUP) and a hard invariant that both read 1 at `done()` (`docs/tasks/loading-progress-invariant.md`). Offline, DOWNLOAD's denominator is unchanged (27.02 MB) but every byte comes from the cache — which is correct and stays correct: **`streamBytes` counts bytes it read, not bytes off the wire** (`src/boot/stream.ts`), so a cached boot legitimately reads 100 % in ~2 s (M4 shows `hero models · 24.56 MB / 24.56 MB` at 2 078 ms). No arithmetic changes. What changes is the **failure copy**: when a core/model fetch throws and `navigator.onLine === false`, the error must say so and offer the honest action, not "⟳ Retry" against a dead radio.
- **A reduced offline boot is not needed.** M4 proves the full 27.02 MB boot runs from cache in 18.5 s on SwiftShader (of which 14 s is shader compilation and the first frame, not bytes). No second code path.
- **Review inbox:** already offline-safe — `src/ui/inbox.ts` queues in localStorage and retries on `online` (`NoteQueue.flush`, `inbox.ts:231`; the sheet shows `N queued note(s) will retry on send.`, `inbox.ts:365`). **Verify in the offline e2e** that a note taken offline lands in the queue and that no unhandled rejection reaches the boot plan's `unhandledrejection` handler (`inline.ts:50`), which would paint a false failure over a working game.
- **Best times / ghosts / settings / garage choice:** localStorage throughout (`BestTimes`, `loadBikeChoice`, `loadModelChoice`, `loadHeldTier`, `loadQualityOverride` in `src/ui`), offline already. Assert it in the gate rather than assume it.
- **Fetches with no failure path — the audit list for R1:**
  - `src/boot/stream.ts` `streamBytes` throws on a non-OK or network failure; the core worker's rejection reaches `plan.fail` — *fatal by design*, must gain the offline message.
  - `src/ui/art.ts:87` `fetch(url, { cache: 'no-cache' })` for the art manifest — the `cache: 'no-cache'` mode forces a revalidation; behind the SW it is served from Cache Storage, but the flag should go (it is what it says: never trust the cache) so B-SLOW holds.
  - `src/ui/worldMapScreen.ts:535` `this.art.probe(...)` → fails soft to the tinted sea. Good; keep and cover it.
  - `src/main.ts:296` key-art prefetch `.catch(() => undefined)`. Good.
  - `src/game/pwa.ts` `reg.update()` on `visibilitychange` — already `.catch(() => undefined)`.
  - `/api/inbox` — covered above.

---

## 6. The update story

Today: byte-different `sw.js` per build → install → toast → `SKIP_WAITING` → `controllerchange` → one reload (`src/game/pwa.ts`, `src/game/app.ts:1008`). That part is sound and stays. What changes:

1. **Cache names split in two.** `trials-shell-<build>` (unhashed: document, fonts, art, icons, splash, manifests) and `trials-immutable` (hashed: `/assets/*-<8>.*`, `/models/<16hex>/…`). `activate` deletes only stale **shell** caches, and prunes `trials-immutable` to the URLs named by the new build's `load-manifest.json` + `models.generated.ts`. **A deploy then costs a player the shell (≈ 6 MB of art + 1.8 MB of JS) and keeps whatever hero models the new build still names** — instead of today's full 31 MB wipe (§1.2.3).
2. **No mid-session rug-pull.** `skipWaiting` stays gated behind the toast's Reload; the new worker never claims a live page on its own. An offline player is never interrupted: `reg.update()` fails silently with no radio, and the waiting worker does nothing until the player taps Reload.
3. **The stamp stops being wall-clock.** `vite.config.ts` `pwa(id)` uses `` `${id}-${Date.now().toString(36)}` ``; a rebuild of the same commit becomes a different worker and (today) a full wipe. Make the stamp a hash of the emitted file list so an identical build is an identical worker.
4. **Install must not lie.** `cache.addAll` in chunks with the result checked; a failed shell precache **fails install** (the old worker keeps serving, which is exactly right) and is reported once via `postMessage` so the page can log it.
5. **A version the page can read.** The worker answers `{ type: 'VERSION' }` with its build id and the count/bytes it holds; the loader's details list and the menu build stamp can then state "offline ready · 31.1 MB · build e666b1b" — and the offline e2e can assert it.

---

## 7. Verification the harness can run

### 7.1 `harness/e2e/offline.mts` — the aeroplane-mode gate

Lives beside `harness/e2e/boot.mts`, run as `pnpm harness:e2e --only=offline` (registered in `harness/e2e/touch.mts`'s `--only` dispatch alongside `boot`, `bench`, `desktop`, `review`, `heroart`; documented in the header comment block at `touch.mts:7–25` and in `harness/README.md`).

**It must use `chromium.launchPersistentContext(profileDir, …)`, not `browser.newContext()`** — M5 showed an ephemeral context does not keep Cache Storage across the offline switch, which would make the suite lie in both directions.

Shape, per config:

1. `vite preview` over `dist/` (the `startServer` helper, `harness/lib/server.ts`).
2. **Online pass** — persistent profile, iPhone geometry (430×932 @ 2), **no `?sw=0`**: navigate, wait for the loader to leave, wait for `navigator.serviceWorker.controller` and `serviceWorker.ready`, wait for the post-`ready` background precache to report done (the worker's `VERSION` message, §6.5). Close the context — the browser process ends.
3. **Offline cold start** — relaunch the same profile with `offline: true` **and** `context.setOffline(true)` (belt and braces: Playwright's flag covers the page; the SW's own `fetch()` must also fail, which `setOffline` on the context does), navigate, sample `#loader[data-download]` / `[data-setup]` exactly as `boot.mts` does.
4. **Ride** — from the menu, PLAY → b1 → drive the golden recording (the same input replay `harness/gate/determinism.ts` and `ship-gate.ts` use) to a finish.

| check | assertion |
|---|---|
| `offline.cacheAfterFirstLoad` | after **one** online load: ≥ 14 `/models/` entries and ≥ 5 `/assets/`+`/fonts/` entries in Cache Storage; `storage.estimate().usageDetails.caches` ≥ 27 MB. *(Today: 0 models, 4 068 352 B — this is the check that fails first and closes the ask.)* |
| `offline.coldStartPlayable` | offline cold start: no network request leaves the browser (CDP `Network.requestWillBeSent` with `response` never absent → all served by the worker; assert `transferSize === 0` on the navigation entry and `workerStart > 0`), loader reaches `100 / 100`, `data-done === 1`, loader leaves |
| `offline.firstFrame` | a canvas is present and a frame has been drawn (the `boot.firstFrameMs` instrument) |
| `offline.rideFinishes` | b1 golden replay finishes offline with the **same finish time and hash** as the online run — the determinism rule from `AGENTS.md` ("a recorded input replays to a byte-identical finish time") applied to the offline path |
| `offline.noPageErrors` | 0 page errors, 0 unhandled rejections during the offline boot and ride |
| `offline.worldMapDraws` | offline, PLAY → the world map: the world plate is `.loaded` (its bytes were precached) and ≥ 1 region plate loads; if not precached, the screen still renders with 0 page errors |
| `offline.inboxQueues` | offline, `?review=1` → send a note → it lands in the localStorage queue, sheet says "1 queued note(s) will retry on send.", no unhandled rejection |
| `offline.updateSurvives` | rebuild `sw.js` with a new build id served under the same origin, go online, confirm the toast appears and the *immutable* cache is **not** wiped (model entry count unchanged) |
| `offline.slowStart` (B-SLOW) | with `Network.emulateNetworkConditions` at 3G latency and the cache warm, `ready` is reached within the same wall time as the offline run ± 20 % — no boot step waits on the wire for bytes it already has |

### 7.2 Ship gate

Add one row to `harness/gate/ship-gate.ts` and one threshold to `harness/gate/thresholds.json`:

```
"offline.coldStartPlayable": true
```

printed in the gate table like `clear.golden` / `determinism.pass`. The gate's cold-boot section already owns a `dist/` and a preview server; the offline section reuses `harness/e2e/offline.mts`'s exported runner (as the boot section reuses `bootSuite`). The gate is the AGENTS.md "every third round" gate — a build that cannot cold-start offline should not ship once this plan lands.

### 7.3 What only a human can do

Headless Chromium is not iOS Safari. It cannot prove: the home-screen install, the standalone launch, the splash image, Safari's Cache Storage behaviour and its 7-day eviction, or WebKit's service-worker lifecycle in a standalone app. **Draft HR row (for the parent to add to `project/human-in-the-loop/QUEUE.md` — not added by this plan):**

```
- **HR-12 — The game in aeroplane mode, on your iPhone home screen (ask 58).** Waiting on: you. Open the new
  build in Safari **once**, let it reach the menu (the loading bar now pulls the whole game — about 39 MB —
  so give it the one load it asks for), then Share → Add to Home Screen. Kill Safari and the app from the
  app switcher, turn on **Aeroplane Mode** (Wi-Fi off too), and open the icon. Four readings: (1) what is on
  screen while it starts — it should be the dark plate with the wordmark, not white; (2) does the loader reach
  100/100 and show the menu; (3) can you ride B1 to the finish; (4) in the garage, swap through all five
  outfits and both bikes — every one should appear with no waiting and no grey stand-in. If any of them fails,
  say what was on screen and for how long. Then turn the radio back on and open it again: you should get ONE
  loading screen and come up on the new build — there is no "Update available → Reload" toast any more, on
  purpose.
```

---

## 8. Rounds

**What they became (2026-09-17).** R1 the bug + the update behaviour (the toast is deleted; a waiting build
is adopted at the start of the loading screen). R2 the gate (`harness/e2e/offline.mts`, ten checks,
`offline.coldStartPlayable` in the ship gate). R3 **everything in the first boot** — the user overruled the
background fill: "load everything up front, but aggressively cache it" — plus the offline garage proof. R4
the headers, the `?v=` versioning and the iOS install surface. R5 the gate run, the settings line and HR-12.
The original text below is kept as written; where it and the rounds above disagree, the user's decisions in
`docs/plans/README.md` win.

### R1 — one load is enough (the ask)
- Register the service worker from the inline loader (`src/boot/inline.ts` / `index.html`) **before** the core stream starts, instead of `src/main.ts:354`; keep `?sw=0` and `?harness=1` opting out, keep `import.meta.env.PROD`.
- Wait for control (`navigator.serviceWorker.ready` or a short timeout, whichever first — the boot must never be held hostage to registration) before the first `streamBytes`.
- Split the caches (`trials-shell-<build>` / `trials-immutable`), make `activate` prune instead of wipe, make the build stamp a content hash of the emitted file list (`vite.config.ts` `pwa()`).
- Precache the shell at install with a checked `addAll`; a failed shell fails install.
- Add the `/api/` bypass and the precached offline fallback document.
- Audit the fetches in §5 and give the loader's failure copy an offline branch.
- **Done:** on a persistent profile, **one** online load leaves ≥ 14 `/models/` + the full shell in Cache Storage (`offline.cacheAfterFirstLoad`); a cold offline start after that one load reaches `100 / 100` and draws the menu (`offline.coldStartPlayable`); `pnpm harness:e2e --only=boot` unchanged on every judged row; bundle ≤ 600 KB gz; the inline loader still ≤ 8 192 B.

### R2 — the first load also covers the screens you have not opened
- After `ready`, a background precache of the `menu` phase (≈ 4 049 KB) and **one tier** of the world-map plates (1 705 KB @1536 / 1 306 KB @1024), chunked, cancelled if the page navigates away, never in the boot bar (it is not `after` either — it is invisible).
- `dist/load-manifest.json` grows a `worldmap` phase: `publicItems()` in `vite.config.ts` must walk `public/art/worldmap/` (today it does not, so the worker cannot even name those 13 files).
- Fix `vercel.json`: `/models/(.*)` and `/art/(.*)` → `max-age=31536000, immutable` for the hashed model snapshots and long-but-revalidated for art; leave `/` and `/index.html` `no-store` (the SW owns the document).
- **Done:** offline, PLAY → world map draws its plates (`offline.worldMapDraws`); offline menu art is complete (no tinted fallbacks in the menu stills); total Cache Storage after one online load ≤ **36 MB**, reported in the round; `offline.slowStart` green.

### R3 — the install surface (iOS)
- `apple-touch-startup-image` set generated and linked; `apple-touch-icon` 152 / 167 / 180; the splash files added to the shell precache.
- iOS caveats documented in `index.html` and `docs/design/game.md` §14 (the SW section).
- **Done:** the standalone launch paints the dark plate, not white — proven by an iPhone still from HR-12, not by the harness; every icon/splash file is in the precache list and present offline (assertable headlessly).

### R4 — the update story, proven
- Toast + `SKIP_WAITING` unchanged; `activate` prune proven to keep the immutable cache; the `VERSION` message and the "offline ready · N MB · build <sha>" line in the loader details / menu stamp.
- **Done:** `offline.updateSurvives` green — a new build's worker installs, the toast shows, the player's 24.56 MB of models are **not** re-downloaded when the model set is unchanged; a player mid-ride is never reloaded under them.

### R5 — the gate and the evidence
- `harness/e2e/offline.mts` complete with every check in §7.1; `--only=offline` wired into `harness/e2e/touch.mts` and `harness/README.md`; `offline.coldStartPlayable` added to `harness/gate/ship-gate.ts` + `thresholds.json`.
- Evidence in `docs/evidence/pwa-offline/round<N>/`: the played offline clip (cold start → menu → world map → b1 → finish, with the network off for the whole clip), `measure.json` with the cache dumps and `storage.estimate()` before/after, and the online-vs-offline finish-time/hash pair.
- HR-12 filed; the ask 58 row flipped when the iPhone reading comes back.
- **Done:** gate prints `offline.coldStartPlayable` PASS; the clip exists and was *played*, not posed.

---

## Done (measurable)

- [x] **One online load is enough.** 180 entries, 14 hero GLBs, **41 963 008 B** after one visit (was 4 068 352 B and 0 models). (R1/R3 · `offline.cacheAfterFirstLoad`)
- [x] **Cold offline start is playable.** Browser closed, **origin shut down**, cold navigate: `100 / 100`, `data-done = 1`, first frame painted, 0 page errors, **0 requests and 0 bytes**, `transferSize = 0`, `workerStart = 0.50 ms`, `crossOriginIsolated = true`. (R1 · `offline.coldStartPlayable`, `offline.firstFrame`)
- [x] **A track is ridden offline, byte-identically.** b1's golden replays to `40.5583 s` / `389a5dc6c07a` offline — the same finish time and hash as the online run. (R2 · `offline.rideFinishes`)
- [x] **The screens you have not opened still work.** Offline the world plate and all five region plates draw and the menu art is complete — they are in the first boot now, not a degrade. (R3 · `offline.worldMapDraws`)
- [x] **A deploy does not cost the player 26.71 MB.** An update boot costs **39 829 B — 0.10 % of a cold boot** — and **0 bytes of models**. (R1/R4 · `offline.updateSurvives`)
- [x] **A bad network never blocks a warm start.** 50 kbps / 400 ms RTT, cache warm: the loader leaves in **13 436 ms** against the offline run's 16 882 ms, with **0 bytes** over the wire. (R2 · `offline.slowStart`)
- [~] **Budget.** Bundle **523.3 KB gz** of 600; inline loader **8 165 B** of 8 192 (27 B of headroom — ask 59's tier pick bought its 110 B back out of `selectedBootTotals`, which now spreads `DeclaredBootTotals` instead of naming its three fields); `dist/` **82 MB**. Cache Storage after one online load is **40.01 MB** on a phone, over the ≤ 36 MB line the plan wrote before the user said "load everything up front": the offline set is the whole game, minus the tiers this device does not draw (ask 59 — one world-map tier, one art variant, no `og.jpg`: −1.93 MB on a DPR-2 phone, −3.28 MB on a 1x desktop, `docs/evidence/boot-bytes/round1/`). The 26.88 MB of unrequested duplicate `dist/models/*.glb` copies are still deployed and still dead — explained, not removed (§9.7).
- [x] **Offline is honest, never a lie.** A boot failure with `navigator.onLine === false` says so instead of offering Retry against a dead radio; `/api/**` bypasses the worker and fails into the localStorage queue. (R1 · `offline.inboxQueues`)
- [x] **The gate carries it.** `offline.coldStartPlayable` is a ship-gate row (`harness/gate/ship-gate.ts` section `offline`) with a threshold in `harness/gate/thresholds.json`. (R2)
- [x] **A garage swap never touches the network.** Offline, origin unreachable: **10/10** outfit × livery combinations swapped with 0 model requests and no procedural stand-in. (R3 · `offline.garageSwapsOffline`)
- [ ] **A human proved it on the actual phone.** HR-12 answered: home screen, aeroplane mode, cold start, B1 finished. (R5)

## Status

- **2026-09-17 — R2–R4 built: the gate, everything-up-front, the headers and the iOS surface.**
  Evidence: `docs/evidence/pwa-offline/round2|3|4/`. `harness/e2e/offline.mts` is **10/10** — nine of the
  plan's checks plus `offline.garageSwapsOffline` (the user's "garage swaps needing network is a bug
  anyway"). `--only=offline` is wired into `harness/e2e/touch.mts` and `harness/README.md`, and
  `offline.coldStartPlayable` is a ship-gate row with a threshold.
  **After ONE online load:** 180 cache entries (shell 4 · static 157 · immutable 19), 14 models, the whole
  art pack, both world-map tiers, **41 963 008 B** held, 39 010 615 B over the wire in 184 requests.
  **Cold offline start, origin unreachable:** 100/100, `data-done=1`, gone at 16 882 ms, **0 requests, 0
  bytes**, `transferSize=0`, `workerStart=0.50 ms`, `crossOriginIsolated=true`, 0 page errors; the world
  plate and all five region plates draw; the b1 golden replays to `40.5583 s` / `389a5dc6c07a`, identical
  to online; the garage cycles **10/10** outfit × livery combinations with zero model requests and no
  procedural fallback. **Update boot: 39 829 B — 0.10 % of a cold boot**, zero model bytes.
  R3 dropped the background fill for a new `offlinePack` boot step (`src/boot/offline-pack.ts`): the user
  asked for the game to behave like a game, so the DOWNLOAD denominator grew from 27.02 MB to 38.44 MB and
  covers the whole offline set. Ask 59 narrowed "the whole offline set" to *this device's*: the pack ships
  two resolution tiers of the key art, the garage bikes, the medals and all 12 world-map plates, and a
  115 KB `og.jpg` that only link previews ever see. One rule (`packMembership` + `artTier`,
  `src/boot/asset-totals.ts` / `tier.ts`) now decides what is drawn, what is fetched and what the
  denominator declares, and the build writes the two per-tier sums into `plan.generated.ts` so the module
  path and `__BOOT_TOTALS__` cannot disagree. Wire bytes on a first load: **39.01 MB → 37.08 MB** at
  932×430 DPR 2 and **→ 35.73 MB** at 1280×720 DPR 1. A device that changes DPR after the download asks
  for a tier it has not cached, misses, and draws the one it has. R4 put `?v=<8 hex>` on every art URL (`public/art/manifest.json`,
  `src/ui/art.ts`) and `__WORLDMAP_V__` on the 13 plates, which is what makes `vercel.json`'s one-month
  `/art/**` and `/fonts/**` and one-year immutable `/models/**` safe; `/sw.js` and `/load-manifest.json`
  became `no-store`; COOP/COEP survive and are now asserted on the offline cold start. 28
  `apple-touch-startup-image` files (`assets/art/splash.mjs`, 1.16 MB, not fetched by the boot) and
  `apple-touch-icon` 152/167 close the iOS gaps in §3.
  **Three things the plan did not know.** (1) `Vary: Origin` breaks every `cache.match` — see R1; §1.1's
  M4 was probably the HTTP disk cache, not the worker. (2) The **audio worklet was never in the offline
  set**: it loads on the first gesture, so the boot never fetched it and offline it failed with
  `worklet timeout`. (3) Playwright's `offline` flag does not reach service-worker fetches, so the gate
  has to shut the server down — with the server up, a build that cannot boot offline passes.
- **2026-09-17 — R1 built: one load is now enough.** Evidence: `docs/evidence/pwa-offline/round1/`.
  After **one** online load the cache holds **65 entries / 14 models / 32 158 162 B** (was 30 / 0 / 4 068 352).
  A cold offline start **with the origin unreachable** reaches 100/100, `data-done=1`, loader gone at 13 306 ms,
  **0 requests, 0 bytes, `transferSize=0`, `workerStart=0.48 ms`, 0 page errors**. A warm online start spends
  **0 body bytes** (3 requests, both 304: the document revalidate and the `sw.js` update check). An **update boot
  costs 379 851 B — 1.2 % of a cold boot** (the entry chunk, index.html, sw.js, the manifests; three.js and all
  14 hero GLBs survive the deploy). What changed: registration moved into the inline loader (`src/boot/sw.ts`,
  capped at 2.5 s) so the worker controls the page before the boot asks for 27 MB; three caches
  (`trials-shell-<build>` / `trials-static-<assets>` / `trials-immutable`) with a **pruning** `activate`; the
  stamp is a content hash of the emitted files + `public/`, not `Date.now()`; the world-map plates and
  `offline.html` are in `load-manifest.json`; `/api/` bypass; cache-first document with a background revalidate;
  the loader's failure copy has an offline branch. **The update toast is deleted** (the user: "the update toast
  always felt buggy") — a waiting build is adopted at the very start of the loading screen and the page reloads
  onto it, so the player sees one loading screen.
  **The finding:** `Vary: Origin` (sent by `vite preview` and by any CORS-adding host) makes every `cache.match`
  MISS. It looked like it worked only because the browser's HTTP disk cache answered the re-request with a 304;
  with the origin genuinely down the boot died at DOWNLOAD 0. Fixed with `{ ignoreSearch, ignoreVary }` on every
  match. This probably also explains §1.1's M4 — that reading was taken with the preview server still running.
- **2026-09-17 — planned, nothing built.** Investigation done against `dist/` at `58e63c7`; five headless measurements (M1–M5, §1.1) reproduce the user's failure and locate it: the worker registers too late to catch the boot's own 24.56 MB, so the first load caches 4.07 MB and 0 models, and it takes **two** online visits before an offline cold start works (M4: it then works, 18 541 ms, `27.02 MB · complete`). No code changed. Owner: unassigned.

---

## 9. Risks and open questions

1. **Total bytes vs iOS eviction (not quota).** 31–36 MB is far under any plausible iOS quota (headless Chromium reported 10.7 GB), but Safari clears all script-writable storage for an origin after **7 days without user interaction**, and `navigator.storage.persist()` does not exist on iOS. A player who opens the app weekly is fine; a player who opens it monthly will need one online load again. **Open:** do we tell the user this in the UI (a line on the menu: "offline ready · re-open within 7 days") or only in the release note? A quieter mitigation — the app is opened often enough that the timer never expires — is a hope, not a design.
2. **Five outfits or one?** The boot fetches **all 14** hero files, 24.56 MB, by the user's own choice (ask 50, `src/boot/asset-totals.ts`: "the boot bar covers EVERY hero file … one number, nothing streams after"; `RELEASES.md` v0.3.1: "Boot is 24.7 MB of hero on purpose"). The chosen outfit + class alone is 2 authored + 2 LOD ≈ **6.4 MB** — an offline set of ≈ 13 MB instead of ≈ 34 MB, and a first load 18 MB cheaper on a phone. But then swapping outfits in the garage needs the network, which contradicts ask 50's "one loading bar to start, everything preloaded up front". **This is a user decision, not ours.** Default in this plan: keep all 14 (no change to the boot bar); flag it for the user.
3. **Players who installed before a working SW.** Their home-screen app has its own storage. It becomes offline-capable only after one more **online** launch (the new byte-different `sw.js` installs, then §4's first-load rule applies). There is no way to reach them otherwise. The release note must say "open it once online after this update". Worse: with today's `activate` wipe still in the old worker, that first launch *also* clears whatever they had.
4. **Vercel headers fighting the worker.** `/` and `/index.html` are `no-store`, so the HTTP cache is not a second line of defence — if the SW is missing or evicted, there is nothing. Everything but `/assets/**` is `max-age=0, must-revalidate`, so the hashed, content-addressed `/models/<16hex>/…` files pay a conditional round trip on every request; that is a direct B-SLOW cost and it makes any SW-side re-precache of an already-fetched file a network event. R2 changes those headers. **Risk:** COOP/COEP (`require-corp`) must survive the header edit — the harness's µs-resolution `performance.now()` depends on cross-origin isolation (`vite.config.ts` `ISOLATION_HEADERS`), and a response replayed from Cache Storage carries its stored headers, so the isolation must be verified after the change, not assumed.
5. **The precache competing with the boot.** If install's `addAll` runs while the boot is streaming 27 MB on a 3G link, it can starve the bar and trip `boot.mts`'s B3 stuck detector. Mitigation: install precaches only the shell (the same bytes the loader is already streaming → HTTP-cache hits), and R2's background precache starts strictly after `ready`.
6. **`?sw=0` is everywhere in the harness.** Every other harness entry disables the worker on purpose ("the evidence harness measures the network, not the cache"). The offline suite is the only place the worker runs, so a regression in the worker is invisible to every other suite — which is exactly why `offline.coldStartPlayable` has to be a **gate** row and not a nice-to-have.
7. **The 26.88 MB of unrequested model copies** in `dist/models/*.glb` are dead deploy weight (and part of why the v0.3.0 upload needed `--archive=tgz`, `RELEASES.md`). Removing them is not an offline change, but it halves the deployment and removes a whole class of "which copy did the worker cache?" confusion. Out of scope here; worth its own row.
8. **SwiftShader timings are not phone timings.** M4's 18 541 ms offline boot is ~14 s of shader compilation and first frame on a software GL stack. The phone number is the phone's; nothing in this plan should quote 18.5 s as a user-facing figure.

---

## First round starts here

The exact files a builder touches for R1, in order:

1. `src/boot/inline.ts` — register the worker before the core stream (and `index.html`'s `<script id="boot">` is rebuilt from it by `vite.config.ts` `buildInline`; the ≤ 8 192 B budget is asserted at build, so the registration must be a handful of bytes).
2. `src/game/pwa.ts` — split registration (early, tiny) from the update toast wiring (still owned by `main.ts`); keep the `requested` guard that stops the first-visit `clients.claim()` double-reload.
3. `src/main.ts:354` — remove the late `registerServiceWorker(...)` call, keep the `?sw=0` / `?updatetoast=1` behaviour and the `showUpdate` hookup.
4. `src/pwa/sw.js` — two caches (`trials-shell-<build>` / `trials-immutable`), checked `addAll`, prune-not-wipe `activate`, `/api/` bypass, cache-first document with background revalidate, precached offline fallback, the `VERSION` message.
5. `vite.config.ts` — `pwa(id)`: stamp from a content hash of the emitted file list, not `Date.now()`.

Then the proof, before anything else is built: `harness/e2e/offline.mts` with `offline.cacheAfterFirstLoad` and `offline.coldStartPlayable` — using `chromium.launchPersistentContext`, because `browser.newContext()` does not keep Cache Storage across the offline switch (M5).
