# World map R4 — the Canyon back in the phone's opening frame (ask 59, task 4)

**The gap (R3):** the map opens framing the focused track's region, then slides down until the focused marker sits at
the bottom of its 15–68 % band. On a landscape phone that slide ate the top third of Industrial's frame box, so B1's
opening view stopped at map y ≈ 395 — the Canyon mesas sat *just above* the frame.

**The fix (one line of data):** Industrial's `REGIONS[].frame` widened **upward** to the mesa tops —
`{ x: 0, y: 250, w: 1030, h: 495 }` → `{ x: 0, y: 175, w: 1030, h: 570 }` (`src/ui/worldMap.ts`). `frameFor()` is
unchanged; the taller box simply fits at a lower zoom on a short viewport, which is exactly the headroom the band
slide consumes. Nothing in `worldMapScreen.ts` changed, and the other four regions are untouched.

Why not a viewport special case or a camera bias: the marker already sits at the band's lowest legal point (68 %), so
there is no camera headroom left to take — zoom is the only lever. Putting it in the region's data keeps `frameFor()`
pure, leaves the four other regions' framing bit-identical, and states the composition the mockup asks for
("Industrial plus the Canyon above it") where the rest of the map's composition lives.

## Opening camera, before → after (played, `worldmap-stills.mts --states=open --seed=1 --last=b1-first-ride`)

| geometry | zoom before | zoom after | top map row in view | region plates |
| --- | --- | --- | --- | --- |
| 932 × 430 | 0.869 | **0.754** | 395 → **345** | 5 decoded, tier opacity 1.000 |
| 844 × 390 | 0.788 | **0.700** | 395 → **353** | 5 decoded, tier opacity 0.778 |
| 1280 × 720 | 1.243 | **1.243** (unchanged) | 338 (unchanged) | 5 decoded, tier opacity 1.000 |

Desktop's width still binds the fit (1280 / 1030 = 1.243 < 720 / 570 = 1.263), so its camera is identical to R3 —
same zoom, same `x`/`y` (−103 / −420) in both runs. Both phones now hold E1 (the mesa foot) and M1 on screen; the
opening zoom sits 1.24× / 1.28× the continent fit on the phones, in line with desktop's 1.24× (R3: 1.43× on phones —
which is why they lost the Canyon).

844 × 390 lands on `frameFor`'s existing floor (`ZOOM.plates + 0.05` = 0.70), so the region plates cross-fade at
0.778 over the world plate rather than 1.0. They are still the drawn tier (`far` false, all five decoded, terrain
sharp in the still) — the world tier never takes over.

## Files

- `1-open-chromium-<geom>.jpg` — the opening still at 932 × 430, 844 × 390, 1280 × 720.
- `side-by-side-mockup-vs-built-region-<geom>.jpg` — `assets/design/worldmap/A-painted-region.png` over the built view.
- `before-vs-after-<geom>.jpg` — the same played state on the R3 frame box (top) and this one (bottom).
- `measure.json` — the three opening states: 0 scroll axes, 0 px page overflow, 0 tappables under 44 px, 0 overlaps,
  5 region plates decoded at each geometry.

## Gates

`pnpm typecheck` (both configs) · `vitest run src/ui` green, 89 → 90 with the new opening-frame test (it replays
`frameRegion`'s camera math and asserts the band, the Canyon slice, the plate tier and desktop's 1.243) ·
`npx vite build` · `pnpm harness:e2e --only=front` 673/673 on both phone geometries.
