# World map — round 1 (plates + camera + markers), ask 54

The painted continent as the level select (`project/archive/WORLD_MAP.md`), played headless on Chromium / SwiftShader from `dist/` (`npx vite build`), seeded 6 / 15 (B1 gold, B2 silver, B3 bronze, E1 silver, E2 bronze, E3 silver on Pro). Everything here was played by `harness/e2e/worldmap-{stills,clip,frames}.mts`, never posed.

## The clip

`clip-menu-play-pan-pinch-nightcity-h1-b1-ride-quit-932x430.mp4` (65 s; `clip-sheet-932x430.jpg` is one frame every 2.2 s): boot → menu → PLAY → the map opens on M1 (the seeded next track) at region zoom 0.8 with the Industrial + Canyon plates decoded → one-finger drag from the docks up the road into the Canyon → two pinches out to the whole continent (zoom 0.607, the plates fold, the diamonds stop taking taps) → a tap on Night City flies to its nearest marker, H1, at region zoom → a tap on H1 (locked) shakes it: `Medal every Medium track` on its plate, `Locked · Medal every Medium track` on the card, `Hard · Medal every Medium track / Next unlock · Rooftop Wire` on the gate, the RIDE pill disabled with the rule → the gate's chevrons → nine key steps back along the road to B1 → RIDE → countdown → 3.5 s of throttle on B1 (bike at x = 21.7) → pause → Quit → menu. `clip-timings.json`: PLAY + RIDE = **2 taps** to riding B1 once it is focused; RIDE tap → run screen 3.7 s under SwiftShader; quit → menu 2.4 s.

## Stills

`<state>-chromium-<geom>.jpg` at 932×430, 844×390 (phone, DPR 2) and 1280×720 (desktop, mouse): `1-open` (M1, region zoom), `2-pan`, `3-far` (the continent), `4-nightcity`, `5-locked-h1`, `6-focused-b1`. `side-by-side-mockup-vs-built-region-932x430.jpg` is the A mockup's region view over the built screen opened on B1 (last played) at the same geometry; `side-by-side-mockup-vs-built-world-932x430.jpg` the A world view over the built continent view.

## Measured (`measure.json`)

- Every state, every geometry: **0 scroll axes, 0 px page overflow, 0 tappables under 44 px, 0 overlaps**; the gate on screen wherever the road into Night City is; all 5 region plates decoded.
- Opening camera: zoom 0.8 on the current track; 15 markers on screen at 932×430, 12 at 844×390, 22 at 1280×720. Fit (continent) zoom 0.607 / 0.549 / 0.8.
- Frame time (rAF intervals, SwiftShader — relative): idle p50 8.3 / p90 10.0 ms, drag p50 8.3 / p90 25, inertia p50 8.3 / p90 25, pinch p50 8.7 / p90 170 (the plates re-rasterise at the new scale); one camera push 14 µs; 418 scene nodes, 22 markers.
- Plates (`public/art/worldmap/`, lazy, never on the boot set): world 331 KB (2x, 1536) / 212 KB (1x, 1024); regions 2x: Industrial 302 KB (2 KB over the 300 KB cap at q48 — a width step follows), Canyon 296, Snow 269, Night City 279, Foundry 243; 1x: 260 / 266 / 187 / 211 / 166. 3 028 KB in 12 files; a phone at region zoom fetches the world plate + the five region plates = 1.72 MB.

## Open vs the mockup (for R2 / R3)

Name plates and the gate plate fold away at the continent zoom (the mockup keeps them small); the route and the beacon are bolder in the mockup; no cloud-shadow drift measured on a device yet; the old diorama code and tiles are still in the tree (R4 retires them).
