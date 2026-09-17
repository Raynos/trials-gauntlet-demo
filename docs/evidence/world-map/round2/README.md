# World map — round 2 (route on the roads, markers on landmarks, fog as haze, five zones, the diorama retired), ask 54

Played headless on Chromium / SwiftShader from `dist/`, seeded 6 / 15, by `harness/e2e/worldmap-{stills,clip,frames}.mts`; nothing posed. What changed since round 1, against the parent's judgement of the R1 side-by-side: the route is traced off the painted plate (`ROAD` in `src/ui/worldMap.ts`: per-leg waypoints along the pier and coast road, the hill road to the river bridge, the canyon's north-bank road and mesa tops, the snow-foot road to the lifts, the pass into Night City, the streets to the waterfront, the climb to the Foundry and its shore road — no leg crosses water) with a soft blurred glow instead of a beam; every marker re-sat on its landmark (B1 on the pier's east end, B2 on the coast road, B3 on the hill road, M1 on the highway north of the bridge, P2 on the west mesas, M2 under the lifts, P3 at the lodge, H2 on the far waterfront, P4 on the elevated loop, M3 / X2 / H3 / X3 / P5 on the works, the mill, the slag river, the stacks, the shore); small name plates and the gate plate stay at the continent zoom; fog is a lighter haze (locked land dimmed and desaturated, the city readable); fog lifts over 1.4 s when a tier opens. The diorama is gone from the tree (see the plan's status).

## The clip

`clip-menu-play-pan-pinch-five-zones-nightcity-h1-b1-ride-quit-932x430.mp4` (186 s; `clip-sheet-932x430.jpg` one frame per 8 s): boot → menu → PLAY → opens on M1 at region zoom 0.8 → drag-pan from the docks into the Canyon → two pinches out to the continent (0.607) → **each of the five zones**: the region's name dragged into view and tapped (flies to its nearest marker), a pinch in to zoom 2.6 filling the view with that region's plate (Industrial at P1, Canyon at E2, Snow at X1, Night City at H1, Foundry at X3), pinches back out → Night City → tap H1 (locked: the rule on the plate, the card, the gate `Hard · Medal every Medium track / Next unlock · Rooftop Wire`, the RIDE pill disabled) → the gate's chevrons → the road back to B1 → RIDE → 2.8 s of throttle on B1 (x = 16.0) → pause → Quit → menu. **2 taps** (PLAY + RIDE) to riding B1 once focused; RIDE → run 4.1 s under SwiftShader; quit → menu 1.9 s. `clip-timings.json` has every camera state and the plate bytes fetched (world 340 KB, regions 250–310 KB, 2x).

## Stills and side-by-sides

`<state>-chromium-<geom>.jpg` at 932×430, 844×390 and 1280×720. `side-by-side-mockup-vs-built-{region,world}-{932x430,844x390}.jpg`: the A mockup's region view over the built screen opened on B1 (last played), and the A world view over the built continent view, at each phone geometry.

## Measured (`measure.json`)

- 18 states across the three geometries: 0 scroll axes, 0 px page overflow, 0 tappables under 44 px, 0 overlaps; 5 region plates decoded in every state; the gate on screen wherever the road into Night City is.
- Frames (SwiftShader, relative; this run overlapped the desktop stills): idle p50 8.3 / p90 25 ms, drag 8.4 / 33.5, inertia 8.4 / 115, pinch 16 / 375; an idle-machine run of the same build gave idle 8.3 / 9.3, drag 8.3 / 9.8, inertia 8.3 / 10, pinch 8.4 / 150 (`docs/plans/WORLD_MAP.md` status). One camera push 17 µs; 418 scene nodes.
- Plates: 12 lazy files, 3 011 KB, none over cap (Industrial 2x now 1408 wide, 284 KB).
- e2e on this build: `--only=front` 365/365, `--only=run` 90/90, `--only=desktop` 188/188.

## Open vs the mockup (R3)

The region view opens centred on the focused track rather than framing Industrial + Canyon together (the mockup's composition) — a region-framing fly like the old screen's would match it; the mockup's marker plates are a touch smaller; no device frame time yet (the WebKit proxy renders identically; the user's iPhone is the bar).
