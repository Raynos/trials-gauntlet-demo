# Garage outfit / livery swaps — AFTER (ask 50 resident hero pool + ask 51 poses + ask 60), same protocol as `swap-r0`

Tree: HEAD + the render owner's ask-50 edits (boot loads all 14 hero files into a resident pool, `debugInfo().heroSwap`
hook), the pose owner's drift fix, ask 60 (authored pair in level). `dist/` rebuilt at the run. WebKit (Apple GPU),
874×330 CSS px, DPR 3, touch UA, `?sw=0`, real time, governor tier `low` in the garage.

Tools: `npx tsx harness/e2e/garage-swap-clip.mts --rounds=2 --out=harness/out/garage-swap-clip/swap-r1` (the per-tap
`heroSwap` column now holds the hook's entries stamped after the tap: `swaps[]` build / first-frame / programs /
textures, `loads[]` fetch / parse / prepare per file) and `npx tsx harness/e2e/hero-art-clip.mts --out=…/swap-r1`
(garage all five outfits × both bikes → b1 Rookie golden as mustard → b1 Pro golden as blue/white).
Files: `webkit-phone-garage-swaps.mp4`, `sheet-swaps.jpg`, `swap-log.json`, `table.md`; `webkit-phone-garage-b1.mp4`,
`sheet-phone-clip.jpg`, `phone-clip-log.json`.

## Before → after

| | BEFORE `swap-r0` (`fb947d4`) | AFTER `swap-r1` |
| --- | --- | --- |
| round 1 (first taps, 11): install median / max | 57 / 73 ms | **11 / 16 ms** |
| round 1: longest rAF gap median / max | 75 / 179 ms | **20.9 / 22.5 ms** (0 gaps ≥ 34 ms on any tap) |
| round 1: requests / bytes | 20 / 30.3 MB | **0 / 0** |
| round 2 (repeats, 12): install median / max | 66 / 70 ms | **11 / 19 ms** |
| round 2: longest gap median / max | 74 / 89 ms | **21.6 / 28 ms** (0 ≥ 34 ms) |
| round 2: requests / bytes | 12 / 16.6 MB | **0 / 0** |
| `heroSwap` per tap | no hook | `buildMs` 0.5–0.7, `firstFrameMs` 4.9–10.3, `programsAdded` 0 (1 on the first openface), `texturesAdded` 0, `loads` [] |
| garage `heroDoc` | `bike-lod rider` | `bike rider` (authored pair; hero tris 77 296 on Race) |
| b1 in level (`phone-high`) | `bike-lod rider-lod` | **`bike rider`** — 154 calls / 261 k tris rookie, 119 / 232 k pro (ask 60) |

The one ~70 ms gap every tap carried is gone: no tap in 23 exceeds two 60 fps frames, none fetches, the swap is a
0.6 ms rebuild and a 5–10 ms first frame. The cost moved to boot: the pool parsed 14 files / 25.8 MB at boot,
`parseMs` summing to 8.85 s (max 980 ms for one Street rider) — the 3G row's budget (see the informational 3G rows
in `harness/e2e/boot.mts`). Rides still hash to node (`389a5dc6c07ab8c3`, `f0549ee508d870ed` = pin), stance on every
frame, `wristErr` 0. Menu note unchanged: the GARAGE tile tap did not open the garage within 10 s (fell back to
`app.goto`).

## Per tap

| # | round | tap | combination after | install ms | settle ms | longest rAF gap ms | gaps ≥ 34 ms | requests (ms from tap) | MB | heroSwap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | outfit street-mustard | street-mustard × rookie | 4 | 4 | 22.1 | 0 | — | 0.00 | — |
| 2 | 1 | outfit street-openface | street-openface × rookie | 4 | 4 | 20.5 | 0 | — | 0.00 | build 0.6 / firstFrame 7.8 / programsAdded 1.0 / texturesAdded 0.0 |
| 3 | 1 | outfit race-bluewhite | race-bluewhite × rookie | 12 | 12 | 20.9 | 0 | — | 0.00 | build 0.6 / firstFrame 6.0 / programsAdded 0.0 / texturesAdded 0.0 |
| 4 | 1 | outfit street-charcoal | street-charcoal × rookie | 14 | 14 | 22.5 | 0 | — | 0.00 | build 0.6 / firstFrame 7.5 / programsAdded 0.0 / texturesAdded 0.0 |
| 5 | 1 | outfit race-charcoalyellow | race-charcoalyellow × rookie | 15 | 15 | 20.5 | 0 | — | 0.00 | build 0.7 / firstFrame 7.0 / programsAdded 0.0 / texturesAdded 0.0 |
| 6 | 1 | bike pro | race-charcoalyellow × pro | 5 | 5 | 22.2 | 0 | — | 0.00 | build 0.6 / firstFrame 7.0 / programsAdded 0.0 / texturesAdded 0.0 |
| 7 | 1 | outfit street-mustard | street-mustard × pro | 10 | 10 | 21.8 | 0 | — | 0.00 | build 0.6 / firstFrame 6.7 / programsAdded 0.0 / texturesAdded 0.0 |
| 8 | 1 | outfit street-openface | street-openface × pro | 11 | 11 | 19.1 | 0 | — | 0.00 | build 0.5 / firstFrame 6.7 / programsAdded 0.0 / texturesAdded 0.0 |
| 9 | 1 | outfit race-bluewhite | race-bluewhite × pro | 16 | 16 | 20.6 | 0 | — | 0.00 | build 0.6 / firstFrame 4.9 / programsAdded 0.0 / texturesAdded 0.0 |
| 10 | 1 | outfit street-charcoal | street-charcoal × pro | 9 | 9 | 19.7 | 0 | — | 0.00 | build 0.5 / firstFrame 7.9 / programsAdded 0.0 / texturesAdded 0.0 |
| 11 | 1 | outfit race-charcoalyellow | race-charcoalyellow × pro | 14 | 14 | 21.5 | 0 | — | 0.00 | build 0.6 / firstFrame 5.7 / programsAdded 0.0 / texturesAdded 0.0 |
| 12 | 2 | bike rookie | race-charcoalyellow × rookie | 4 | 4 | 23.3 | 0 | — | 0.00 | build 0.5 / firstFrame 5.3 / programsAdded 0.0 / texturesAdded 0.0 |
| 13 | 2 | outfit street-mustard | street-mustard × rookie | 15 | 15 | 20.7 | 0 | — | 0.00 | build 0.6 / firstFrame 6.8 / programsAdded 0.0 / texturesAdded 0.0 |
| 14 | 2 | outfit street-openface | street-openface × rookie | 19 | 19 | 18.7 | 0 | — | 0.00 | build 0.7 / firstFrame 5.8 / programsAdded 0.0 / texturesAdded 0.0 |
| 15 | 2 | outfit race-bluewhite | race-bluewhite × rookie | 4 | 4 | 20.9 | 0 | — | 0.00 | build 0.6 / firstFrame 5.8 / programsAdded 0.0 / texturesAdded 0.0 |
| 16 | 2 | outfit street-charcoal | street-charcoal × rookie | 17 | 17 | 20.5 | 0 | — | 0.00 | build 0.7 / firstFrame 8.2 / programsAdded 0.0 / texturesAdded 0.0 |
| 17 | 2 | outfit race-charcoalyellow | race-charcoalyellow × rookie | 4 | 4 | 21.4 | 0 | — | 0.00 | build 0.5 / firstFrame 5.4 / programsAdded 0.0 / texturesAdded 0.0 |
| 18 | 2 | bike pro | race-charcoalyellow × pro | 13 | 13 | 21.6 | 0 | — | 0.00 | build 0.6 / firstFrame 6.4 / programsAdded 0.0 / texturesAdded 0.0 |
| 19 | 2 | outfit street-mustard | street-mustard × pro | 11 | 11 | 20.2 | 0 | — | 0.00 | build 0.6 / firstFrame 8.9 / programsAdded 0.0 / texturesAdded 0.0 |
| 20 | 2 | outfit street-openface | street-openface × pro | 17 | 17 | 27.5 | 0 | — | 0.00 | build 0.7 / firstFrame 9.5 / programsAdded 0.0 / texturesAdded 0.0 |
| 21 | 2 | outfit race-bluewhite | race-bluewhite × pro | 6 | 6 | 22.1 | 0 | — | 0.00 | build 0.6 / firstFrame 7.4 / programsAdded 0.0 / texturesAdded 0.0 |
| 22 | 2 | outfit street-charcoal | street-charcoal × pro | 9 | 9 | 28 | 0 | — | 0.00 | build 0.6 / firstFrame 10.3 / programsAdded 0.0 / texturesAdded 0.0 |
| 23 | 2 | outfit race-charcoalyellow | race-charcoalyellow × pro | 10 | 10 | 27.7 | 0 | — | 0.00 | build 0.6 / firstFrame 6.9 / programsAdded 0.0 / texturesAdded 0.0 |

round 1: 11 taps, install median 11 ms / max 16 ms, longest gap median 20.9 ms / max 22.5 ms, 0 requests / 0.0 MB
round 2: 12 taps, install median 11 ms / max 19 ms, longest gap median 21.6 ms / max 28 ms, 0 requests / 0.0 MB
