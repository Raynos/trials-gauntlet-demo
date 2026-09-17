# Level select round 4 — one continuous world map (C "Ascent", ask 38)

The six round-3 diorama plates as one mountain under a 2-D camera (`src/ui/trackMap.ts` world layer,
`TrackSelectScreen` in `src/ui/front.ts`, `TRACK_MAP_CSS` in `src/ui/styles.ts`). Everything here is played
from the seeded 6 / 15 state (B1 gold, B2 silver, B3 bronze, E1 silver, E2 bronze, E3 silver on Pro), headless,
iPhone UA, dpr 2, against `vite preview` of `pnpm build`.

| File | What |
|---|---|
| `clip-menu-play-pan-pinch-h1-b1-ride-quit-932x430.mp4` | **The played clip** (Chromium / SwiftShader): menu → PLAY → opens on M1 with Industrial framed → one-finger drag-pan up the trail → two pinches out to the fit zoom (the whole mountain, pins folded to dots) → a tap on the map flies into Snow → NIGHT CITY rung → tap H1 (locked: shake, the rule on the pin, the card and the hazard barrier) → INDUSTRIAL rung → tap B1 (focus) → tap B1 (launch) → ride 3 s → pause → Quit. `harness/e2e/tracks-clip.mts`. |
| `clip-timings.json` | The camera at each step, taps, `runScreen − tapB1` = 1 063 ms under SwiftShader, `runTimeAfter3s`. |
| `sheet-{chromium,webkit}-{932x430,844x390}.jpg` | Seven states per engine and geometry: open, pan, far, near, locked H1, focused B1, the apron (WebKit: five — the drag / pinch go through CDP touch, Chromium only; `near` is the Canyon rung there). `harness/e2e/tracks-stills.mts --seed=1`. |
| `open-*.jpg`, `far-chromium-932x430.jpg`, `locked-chromium-844x390.jpg` | Full-size keys. |
| `measure-{chromium,webkit}.json` | Per state: camera (zoom, x, y, far), pins whose disc is on screen, scroll axes, page overflow, tappables (count, < 44 px, overlaps), the altimeter / card / MENU boxes, the gate. |
| `frames-chromium-932x430.json` | rAF intervals idle / dragging / inertia, the per-move camera-push cost, scene nodes, plate bytes. |

## Numbers

- **Opens on the current level, a subset of the map**: M1 focused (the seeded `nextTrack()`), Industrial framed
  at zoom 1.127 (932×430) / 1.065 (844×390) — the largest zoom ≤ 1.3 at which the region's four pins fit between
  the card and the altimeter — **4 pins on screen** (B1 B2 B3 M1), all tappable. 22 pins in the world.
- **Zoom range**: fit **0.202** (the whole mountain; 18 of 22 pins inside the map box, the rest under the
  head) · working 1.0–1.3 · max 2.0. Below 1.0 the pins drop their name plates, below 0.62 they fold to dots
  and take no pointer.
- **Taps**: B1 from the menu **3** (PLAY · B1 focus · B1 launch) when M1 is the opening focus; **2** (PLAY · RIDE)
  when B1 was last played — as round 3. H1's rule: 2 (PLAY · NIGHT CITY rung) reads it on the barrier from
  Snow, or on the pin itself after the rung.
- **Invariants, every state, both engines, both geometries**: 0 scroll axes (the camera is a transform),
  0 px page overflow, 0 tappables under 44 px, 0 overlaps (a pin under the card / altimeter / MENU pill is
  shaded and takes no pointer).
- **Frames** (Chromium headless, 120 Hz rAF; the front end does not render the scene): idle p50 8.3 ms,
  drag p50 8.3 / p90 9.9 ms (worst 201 ms, a SwiftShader stall), inertia p50 8.3 / p90 9.9 ms; one camera push
  (transform + pin shading) 12–25 µs; 183 scene nodes. `?bench=1` does not cover this screen.
- **Budgets**: bundle gz 334.96 kB (≤ 600), loader unchanged; the six plates are round 3's files (547 kB, probed
  through the art manifest as before); no new art bytes — the seams, quay and massif are CSS.
- **Suites**: `vitest run src/ui` (trackMap 12, trackSelect 8), `pnpm harness:e2e --only=front` 745/745
  (iphone13 + iphone15promax), `--only=run` 108/108, `--only=desktop` 188/188 (188/188 before).
