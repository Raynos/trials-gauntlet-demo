# Hero art round 4 — the twin streams after `ready` (ask 43), played on the phone tier

Tree: `4f27f47` + the render owner's uncommitted round-4 edits (boot fetches the drawn pair only, the twin prefetched
after ready and parsed off-track), `dist/` rebuilt 2026-09-17 07:20 with `npx vite build --logLevel error`. WebKit
(Apple GPU) at 874×330 CSS px, DPR 3, touch UA, `?sw=0`, real time.

## Files

| file | what | how |
| --- | --- | --- |
| `webkit-phone-boot-b1-garage.mp4` (60 s) | cold boot → menu (held 6 s) → b1 launched → ridden on a held GAS zone (real time, 0 faults, **finish 38.975 s**) → results → MENU tile → GARAGE tile | `npx tsx harness/e2e/hero-boot-clip.mts --out=harness/out/hero-boot-clip/round4` (new; `harness/README.md`) |
| `sheet-boot-clip.jpg` | one frame every 2 s, left→right top→bottom | by the script |
| `sheet-boot-finish-garage.jpg` | boot 0–11 s and finish → results → garage 47–60 s, every 1.5 s | `ffmpeg select … fps=1/1.5 tile=4x4` |
| `boot-clip-log.json` | every model / chunk request (ms from navigation start, bytes, app phase + screen at the start, before / after `ready`), the renderer's hero-document slots sampled per rAF (`bike / bikeLod / rider / riderLod`, `twinPending`, `heroDoc`) with the phase at every fill, every rAF gap ≥ 40 ms with the phase | by the script (page probe from document start + Playwright request log) |
| `bench-latest-r4.md` | `pnpm harness:bench --tiers high --tracks b1 --geoms phone --frames 300` after the `setTier` fix | see below |

## What the log proves (`boot-clip-log.json.verdict`)

- **Boot fetched only the LOD pair**: `bike-rookie-lod` 870 440 B and `rider-street-mustard-lod` 1 608 420 B, both
  requested at 107 ms and done by 135 ms (localhost), before `ready` (menu live at 361 ms). Chunks: `index` 1.07 MB
  and `three` 0.75 MB at 8 ms; the audio worklets at 10.6 s (track launch).
- **The authored twin arrived after `ready`**: `bike-rookie` 2 283 040 B + `rider-street-mustard` 3 267 248 B requested
  at 367 ms on the menu, done at 586 / 598 ms; `twinPending` set at 557 ms.
- **Never parsed mid-run**: the document slots stayed `-b-r` (LOD only) through the menu, countdown and the whole
  ride; `BbRr` (all four) at **49 612 ms = the finish** (`finished/run`), and the parse re-requested both files
  (33 / 63 ms — the HTTP cache) at 49 528 ms. 0 fills and 0 rAF gaps ≥ 100 ms while riding.
- **Garage entry: 0 fetches**; `heroDoc bike-lod rider` (authored rider, LOD bike) on tier `low`, 88 calls, 206 117 tris,
  hero 64 769.

## Findings (ranked)

1. **The twin is NOT parsed on the menu.** `twinPending` sat from 557 ms to the finish (49.6 s): the B Lobby menu covers
   the canvas (`Game.renderEnabled = false`), so `Game.render` never calls `renderer.setRunInfo` there and the
   renderer's `phase` field keeps its initial `'riding'` (`src/render/index.ts:293`) → `parseTwinIfIdle` sees "riding"
   and skips. The first off-track moment it sees is the finish. On a phone that plays one track and enters the
   garage, the authored rider is parsed at that finish — fine — but a player who goes menu → garage before any run gets
   the on-demand parse at garage entry instead of the prefetched-and-parsed one. Render owner: seed `phase` from the
   game (or call `parseTwinIfIdle` from `setGarageStage` / the menu's `renderOnce`).
2. rAF gaps on the **menu** after ready: 188 ms (557 ms, the prefetch landing), 197 ms (822 ms), 170 ms (2.5 s),
   106 ms (3.3 s); countdown 157 ms (6 996 ms — the track entry, before GO). All off-track. The finish parse itself
   cost one 70 ms gap at 49 596 ms; menu→garage 142 + 131 ms (stage build). Nothing in the ride ≥ 40 ms.
3. The finish parse fetches the twin again (2 × HTTP requests, cache-fast) instead of decoding the prefetched
   bytes — correct, but the request log will always show four authored fetches per session.

## Bench after the `setTier` fix (`harness/bench/page.ts`, `ab.ts`, `idle.ts` now await `whenReady()` after the tier switch)

`?harness=1` rows (no governor), loadavg 6.5–7.6:

| row | calls | tris | programs | hero tris | model phone ms |
| --- | --- | --- | --- | --- | --- |
| b1 · phone-high (LOD pair, as the phone rides) | **142** | **85 k** | **52** | 14 k | **9.2** |
| garage · high (authored rider) | 115 | 208 k | — | — | 13.3 |
| menu · high | 115 | 208 k | — | — | 9.1 |

The previous b1 row measured the authored pair (185 k tris) because `setTier` returned before the async hero load.
