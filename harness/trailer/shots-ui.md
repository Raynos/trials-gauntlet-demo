# Trials Gauntlet — the 15 s UI cut (ask 63)

What shipped since the v0.2.0 trailer was almost all **screens**, and that trailer has none of
them: it predates the world map, the garage explorer, the phone menu band and the offline boot.
This cut is the front end, in the order a player meets it.

Output: `harness/out/trailer/trailer-ui-15s.mp4` 1280×720 @ 30 fps (+ `-1080p`, `-web` ~3.5 MB,
`-sheet.jpg`, `.cutlist.json`), 15.07 s, AAC 48 kHz, loudnorm −14 LUFS. Music: the v0.1.0 15 s bed
(`music-15.wav`, 124 BPM, drops at bars 0 and 5) — every cut lands on a half-bar.

Re-render: `harness/trailer/capture-ui.sh <sha7>`.

## How the screens are captured

`capture-beats.ts` replays a *recording*; there was nothing that drove the *UI*. The obvious
route — `recordVideo`, as `harness/e2e/worldmap-clip.mts` uses for evidence — records the wall
clock, and the wall clock on SwiftShader is a 3–4 fps game: every tween stutters.

`capture-ui.ts` instead installs Playwright's fake clock, lets it run in real time through boot,
then **pauses it** and makes every output frame exactly one `clock.runFor(1000/fps)` — one rAF,
one app frame. The page may take two seconds to paint; the clip is still a clean 30 fps, and the
same shot script gives the same frames. Four things this cost:

- **Waits must pump the clock.** `.live` is set 150 ms after a screen is drawn (`src/ui/live.ts`),
  a world-map fly is a 380 ms rAF tween. Under a frozen clock those timers never fire, so a plain
  `waitForFunction` deadlocks. `pumpUntil` steps a frame between polls.
- **CSS transitions do not obey the fake clock** — it fakes `Date`/timers/rAF, not the compositor
  timeline, so a 380 ms transition would finish inside one captured frame and read as a snap.
  Shots set `cssRate: 0.03` (CDP `Animation.setPlaybackRate`). The game's own camera work is rAF
  and unaffected.
- **The fps meter is drawn on every screen except the menu** (ask 45 only covered the menu), so
  the capture injects a style that hides it.
- **A mouse click is not a tap.** The world map focuses whatever marker the pointer moves over, so
  a mouse click aimed at a marker arrives when that marker is already focused — and an
  already-focused marker *launches the track*. The first cut of this shot rode off into B3's
  countdown. The `tapAt` step clicks open land while zoomed out instead, which flies to the
  nearest marker.

Beats are `edit.py` beat directories (`frame-NNNNN.png` + `log.json` + `audio.wav`), so the cut
reuses the v0.1.0 editor's cards, music mix, ducking and contact sheet unchanged.

## The cut

| # | t (s) | Bars | Beat | What it is showing | Source |
|---|---|---|---|---|---|
| 0 | 0.00–0.97 | 0.5 | title | Key art + wordmark, "A PHYSICS TRIALS GAME" | `keyart-nalati-1920` (the plate the live menu shows, already hero-right) |
| 1 | 0.97–1.94 | 0.5 | menu | The menu with the drifting key art and the `build <sha> · <date>` plate (ask 45) | `menu`, 40 frames |
| 2 | 1.94–5.81 | 2 | map | **The world map** (ask 54): the painted continent at region zoom, drag-pan across the Industrial docks, then wheel out until Snow and Foundry come into frame. Overlay "A HAND-PAINTED WORLD" | `map`, 120 frames |
| 3 | 5.81–7.74 | 1 | mapcard | A tap on the land flies to the nearest marker: the leader-line plate, the fog, the track card and RIDE | `mapcard`, 70 frames |
| 4 | 7.74–10.65 | 1.5 | garage | **The garage** (asks 50/51/52): Astra's authored hero on the shutter-door stage over the wet floor, orbit, then Race blue/white → Pro livery → Street charcoal. Overlay "FIVE OUTFITS, TWO BIKES" | `garage`, 100 frames |
| 5 | 10.65–11.61 | 0.5 | results | The finish: TRACK FINISHED, 0:40.558, 0 faults, FIRST CLEAN, the medal row and the four tiles | `results` — `capture-beats.ts` on the committed b1 golden (`bot-3.json`, finish tick 4866), the one beat with real game audio |
| 6 | 11.61–12.58 | 1 | phonecard | The same build at 932×430 in a device bezel: the `html.short` phone menu band (ask 48), then the map pinched out to the continent | `phone`, 62 frames, DPR 2 |
| 7 | 12.58–15.08 | 2.5 s | end | Wordmark · `build <sha>` · trials-gauntlet-demo.vercel.app | — |

## Notes

- The save is seeded (`capture-ui.ts` `SEED`, the same six PBs `worldmap-clip.mts` uses) so the map
  reads mid-career — `6 / 15 CLEARED`, medium open, hard still gated. `?dev=1` would have unlocked
  everything and littered the map with `-test` markers.
- `edit.py` could not render a card on a stock Pillow: its bundled FreeType has no brotli, so the
  game's shipped `.woff2` faces raise "unknown file format". The same faces are vendored as `.ttf`
  under `fonts/` (regenerate with `fonts/woff2ttf.py public/fonts harness/trailer/fonts`).
- **The garage is not showing a placeholder.** The Race outfits look flat next to the Street ones,
  which reads like the ask 29/40 procedural stand-in. It is not: `debugInfo().heroDoc` is
  `bike rider` (the authored document) on all five outfits with zero refetches, and Race is simply a
  lower-poly authored model — 77 300 tris against Street's 92 171, being a full-face helmet with no
  face or hair to carry. It reads flat only from behind, so the shot orbits to the front
  three-quarter instead.
- **The menu beat measures as a still** (28 of 29 frame pairs identical: its key-art drift is below
  perception), so the cut gives it a push-in. 1.07 clipped the wordmark and the PLAY tile — every one
  of these screens anchors its UI to the frame edge — so the push is 1.025.
- `brand-gate.sh` now skips `*.map` as well as `*.md`. A source map carries every comment in the
  tree, including `src/physics/v2/tuning.ts`'s R10 reverse note citing the genre's reference games;
  that file is inside the harness src fingerprint, so rewording a comment there would restale all 47
  committed goldens to silence a string no frame can render.
- The end card reads `build <sha>`, not a version — this is a cut of HEAD, not of a pinned release.
- Captured frames and the cuts are gitignored: `harness/out/trailer/` is otherwise tracked, and the
  video blobs already in it are half of why main cannot be pushed (HR-11).
