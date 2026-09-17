# Garage outfit / livery swaps — BEFORE baseline (ask 50), HEAD `fb947d4`

WebKit (Apple GPU) at 874×330 CSS px, DPR 3, touch UA, `?sw=0`, real time, `dist/` built from the tree at the run
(`npx vite build --logLevel error`). Boot → GARAGE (the tile tap did not open the garage within 10 s — opened through
`app.goto('garage')`; a menu finding, logged) → every outfit × bike combination tapped through the rail, the set twice:
round 1 = first taps of each combination, round 2 = repeat taps. Governor tier `low` (the phone's own), `heroDoc`
`bike-lod rider` throughout (authored rider, LOD bike). No `debugInfo().heroSwap` hook exists yet (`heroSwapHook: false`),
so the phase breakdown column is empty — the tool reads it the moment the render owner adds it.

Tool: `npx tsx harness/e2e/garage-swap-clip.mts --out=harness/out/garage-swap-clip/swap-r0` (new; `harness/README.md`).
Files: `webkit-phone-garage-swaps.mp4` (the run), `sheet-swaps.jpg` (one frame per 1.5 s, hero side), `swap-log.json`
(per tap: requests with ms-from-tap and bytes, rAF samples, gaps, install / settle), `table.md` (below).

## Per tap

`install` = tap → first rendered frame with the new document installed (`riderDocumentOutfit` / `bikeDocumentClass`
flipped and `heroLoading` 0, per rAF; ±1 frame). `longest rAF gap` = the biggest frame-to-frame gap from the tap to
500 ms after the install — the hitch the finger feels. Requests: end time in ms from the tap.

| # | round | tap | combination after | install ms | settle ms | longest rAF gap ms | gaps ≥ 34 ms | requests (ms from tap) | MB | heroSwap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | outfit street-mustard | street-mustard × rookie | 3 | 3 | 20 | 0 | — | 0.00 | — |
| 2 | 1 | outfit street-openface | street-openface × rookie | 68 | 68 | 178.9 | 1 | rider-street-openface 48, rider-street-openface-lod 250, rider-street-openface-lod 275 | 5.34 | — |
| 3 | 1 | outfit race-bluewhite | race-bluewhite × rookie | 30 | 30 | 132.7 | 2 | rider-race-bluewhite 26, rider-race-bluewhite-lod 182, rider-race-bluewhite-lod 184 | 3.72 | — |
| 4 | 1 | outfit street-charcoal | street-charcoal × rookie | 44 | 44 | 113.6 | 2 | rider-street-charcoal 36, rider-street-charcoal-lod 175, rider-street-charcoal-lod 203 | 6.27 | — |
| 5 | 1 | outfit race-charcoalyellow | race-charcoalyellow × rookie | 27 | 27 | 104.6 | 2 | rider-race-charcoalyellow 28, rider-race-charcoalyellow-lod 148, rider-race-charcoalyellow-lod 156 | 3.57 | — |
| 6 | 1 | bike pro | race-charcoalyellow × pro | 15 | 15 | 120.2 | 1 | bike-pro-lod 20, bike-pro 125, bike-pro 155 | 5.41 | — |
| 7 | 1 | outfit street-mustard | street-mustard × pro | 68 | 68 | 74.7 | 1 | rider-street-mustard-lod 22 | 1.61 | — |
| 8 | 1 | outfit street-openface | street-openface × pro | 58 | 58 | 71.7 | 1 | rider-street-openface-lod 88 | 1.32 | — |
| 9 | 1 | outfit race-bluewhite | race-bluewhite × pro | 57 | 57 | 69.1 | 1 | rider-race-bluewhite-lod 79 | 0.79 | — |
| 10 | 1 | outfit street-charcoal | street-charcoal × pro | 73 | 73 | 74.5 | 1 | rider-street-charcoal-lod 22 | 1.56 | — |
| 11 | 1 | outfit race-charcoalyellow | race-charcoalyellow × pro | 61 | 61 | 68.6 | 1 | rider-race-charcoalyellow-lod 16 | 0.76 | — |
| 12 | 2 | bike rookie | race-charcoalyellow × rookie | 67 | 67 | 72.3 | 1 | bike-rookie 92 | 2.28 | — |
| 13 | 2 | outfit street-mustard | street-mustard × rookie | 66 | 66 | 75.6 | 1 | rider-street-mustard-lod 91 | 1.61 | — |
| 14 | 2 | outfit street-openface | street-openface × rookie | 68 | 68 | 74.3 | 1 | rider-street-openface-lod 92 | 1.32 | — |
| 15 | 2 | outfit race-bluewhite | race-bluewhite × rookie | 70 | 70 | 77.4 | 1 | rider-race-bluewhite-lod 18 | 0.79 | — |
| 16 | 2 | outfit street-charcoal | street-charcoal × rookie | 57 | 57 | 74.8 | 1 | rider-street-charcoal-lod 84 | 1.56 | — |
| 17 | 2 | outfit race-charcoalyellow | race-charcoalyellow × rookie | 52 | 52 | 69.6 | 1 | rider-race-charcoalyellow-lod 77 | 0.76 | — |
| 18 | 2 | bike pro | race-charcoalyellow × pro | 56 | 56 | 71.4 | 1 | bike-pro 84 | 2.27 | — |
| 19 | 2 | outfit street-mustard | street-mustard × pro | 65 | 65 | 84.6 | 1 | rider-street-mustard-lod 86 | 1.61 | — |
| 20 | 2 | outfit street-openface | street-openface × pro | 70 | 70 | 88.7 | 1 | rider-street-openface-lod 98 | 1.32 | — |
| 21 | 2 | outfit race-bluewhite | race-bluewhite × pro | 66 | 66 | 70.9 | 1 | rider-race-bluewhite-lod 21 | 0.79 | — |
| 22 | 2 | outfit street-charcoal | street-charcoal × pro | 63 | 63 | 72.6 | 1 | rider-street-charcoal-lod 19 | 1.56 | — |
| 23 | 2 | outfit race-charcoalyellow | race-charcoalyellow × pro | 46 | 46 | 65.8 | 1 | rider-race-charcoalyellow-lod 73 | 0.76 | — |

round 1: 11 taps, install median 57 ms / max 73 ms, longest gap median 74.7 ms / max 178.9 ms, 20 requests / 30.3 MB
round 2: 12 taps, install median 66 ms / max 70 ms, longest gap median 74.3 ms / max 88.7 ms, 12 requests / 16.6 MB

## What the baseline says

1. **Every tap costs one ~70 ms main-thread gap, first or repeat** (round 2: median 74 ms, 66–89 ms; nothing is
   fetched for the drawn document — the parsed GLTF is cached in `loadGltf`, so the ~70 ms is the swap itself:
   `applyModels` rebuilding the hero + material compile / upload, not the network). On a 60 fps phone that is 4
   dropped frames per tap — the user's "sluggish repeat taps".
2. **First taps add the parse**: round 1 outfit taps 105–179 ms longest gap (authored file 2–3.3 MB fetched in
   26–48 ms on localhost, then decoded on the main thread); the bike livery 120 ms. The user's 102 ms tap.
3. **Every swap re-requests the LOD twin** (`rider-<outfit>-lod` 0.76–1.6 MB, twice in round 1: prefetch + parse,
   once in round 2) even when it was fetched before — `scheduleTwin` sees an empty slot after `riderStale` nulls
   the pair, and `prefetchModel` goes to the HTTP cache each time. 12 requests / 16.6 MB in round 2 for zero new
   bytes; harmless on Wi-Fi, a cost on the phone's radio.
4. Boot on this page fetched the LOD pair (2.5 MB) and then the authored pair twice (5.5 MB ×2: the twin prefetch
   and its parse) — the round-4 contract, but the second fetch of each authored file is the same cache re-read as (3).
