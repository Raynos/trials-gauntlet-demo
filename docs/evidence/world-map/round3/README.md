# World map — round 3 (the mockup's framing at open, the hill road, smaller plates, the label, a WebKit 30 fps proxy), ask 54

Played headless from `dist/` (Chromium / SwiftShader for the stills and the clip; Playwright WebKit as the iOS proxy for frame time), seeded 6 / 15, by `harness/e2e/worldmap-{stills,clip,frames}.mts`; nothing posed. The parent's R2 judgement, applied:

1. **Opens framing the region with its neighbour**, as `A-painted-region.png` does — `REGIONS[].frame` (Industrial's box holds every Canyon marker too) fitted by `frameFor()` (zoom between the plate tier + 0.05 and 1.3), then the camera slides only as far as it must to keep the focused marker inside 15–68 % of the view with its card beside it. Opening zoom 0.869 at 932×430, 0.788 at 844×390, 1.243 at 1280×720. The docks, the hill road up to M1 and Night City's shore are in the frame; the Canyon mesas sit just above it on a phone (the plate stacks the Canyon straight north of the docks, taller than a phone at plate zoom) — one drag up shows them. The card no longer carries the technique line (the mockup's card is code · tier · region / name / best · target / GHOST) and stands above its marker when the marker is in the lowest 20 % of the view.
2. **The leg B3 → M1 re-traced** along the painted switchbacks from the docks to the river bridge (`ROAD`, seven waypoints; B2 / B3 re-sat on that road). The vertical beam in the R2 far view was the focused marker's beacon — at the continent tier it is now 110 px and softer.
3. **Marker plates ~15 % smaller** at every zoom (17 px tall, 10 px type; the rule line 14 px; the gate plate 9 px type); the 46 px hit box is unchanged, so every target still measures ≥ 44 px.
4. **NIGHT CITY** sits on the bay south of the city; the gate plate (on the pass from Snow) and the label both read.
5. **WebKit frame proxy** (`worldmap-frames.mts --engine=webkit --geom=844x390`): synthetic pointer gestures one step per rAF — drag p50 16.6 / p90 18.7 ms, inertia p90 18.8, pinch p50 17.6 / p90 34.4 (three runs: 31.8 / 36.1 / 34.4). Drag and inertia clear the 33.4 ms 30 fps bar; the pinch — six plates re-rasterising at a new scale in software — sits on it (a GPU composites those as textures; the user's iPhone is the real bar, HR).

## The clip

`clip-menu-play-pan-pinch-five-zones-nightcity-h1-b1-ride-quit-932x430.mp4` (138 s; `clip-sheet-932x430.jpg` one frame per 8 s): boot → menu → PLAY → opens framing Industrial at 0.869 on M1 → drag into the Canyon → pinches out to the continent (0.607) → **each zone** (P1 / E2 / X1 / H2 / X3 at zoom 2.6, out again between) → Night City → tap H1 (locked: rule on plate, card, gate, pill) → the gate's chevrons → the road back to B1 → RIDE → 2.9 s on B1 (x = 18.4) → pause → Quit → menu. **2 taps** to riding B1 once focused; RIDE → run 2.7 s (SwiftShader); quit → menu 1.6 s.

## Stills, side-by-sides, measure

`<state>-chromium-<geom>.jpg` at 932×430, 844×390, 1280×720; `side-by-side-mockup-vs-built-{region,world}-{932x430,844x390}.jpg` (the mockup's region view over the built open-on-B1 view, the mockup's world view over the built continent view). `measure.json`: 18 states — 0 scroll axes, 0 px page overflow, 0 tappables under 44 px, 0 overlaps, 5 plates decoded everywhere; Chromium frames idle p50 8.3 / p90 9.5, drag 8.3 / 9.9, inertia 8.3 / 9.5, pinch 8.3 / 284 (SwiftShader re-raster); one camera push 13 µs (Chromium) / 206 µs (WebKit); plates 12 files, 3 011 KB, none over cap. e2e on this build: `--only=front` 476/476, `--only=run` 90/90, `--only=desktop` 188/188.

## Open

The Canyon mesas above the opening frame on a phone (a taller-than-wide plate vs a wide screen); the WebKit software pinch on the bar; the user's iPhone reading (HR).
