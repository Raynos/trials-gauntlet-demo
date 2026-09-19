# Trials Gauntlet — the 15 s cut (ask 63)

Round 1 of this cut was all front end, and the reply was *"shows no gameplay, it should be at least
50% wheelies and jumps and backflips."* Round 2 is **58 % riding** (4.5 of the 7.75 bars), with the
two screens that are genuinely new since the v0.2.0 trailer — the world map (ask 54) and the garage
explorer (50/51/52) — carrying one bar between them.

Output: `harness/out/trailer/trailer-ui-15s.mp4` 1280×720 @ 30 fps (+ `-1080p`, `-web` ~4 MB,
`-sheet.jpg`, `.cutlist.json`), 15.08 s, AAC 48 kHz, loudnorm −14 LUFS. Music: the v0.1.0 15 s bed
(`music-15.wav`, 124 BPM, drops at bars 0 and 5) — every cut lands on a half-bar.

Re-render: `harness/trailer/capture-ui.sh <sha7>`.

## The cut

| # | t (s) | Bars | Beat | What it is | Source |
|---|---|---|---|---|---|
| 0 | 0.00–0.97 | 0.5 | title | Key art + wordmark, "A PHYSICS TRIALS GAME" | `keyart-nalati-1920`, the plate the live menu shows (already hero-right, hence `--keyart-noflip`) |
| 1 | 0.97–2.90 | 1 | **wheelie** | H1 Pro off the start gate: **2.52 s on the rear wheel** along the night-city rooftops, the longest wheelie in any golden | `bot-3-pro.json` ticks 0–350 |
| 2 | 2.90–3.87 | 0.5 | **bigair** | X3 Pro: **2.33 s of air, 10.5 m apex** out over the foundry pour, tracked punch-in | `bot-3-pro.json` ticks 520–890 |
| 3 | 3.87–5.81 | 1 | map | The painted continent mid-pan, then the wheel out until Snow and Foundry come into frame. Overlay "A HAND-PAINTED WORLD" | `capture-ui.ts`, 120 frames |
| 4 | 5.81–8.71 | 1.5 | **BACKFLIP** | **349° off the X1 summit at 15.1 m, landed clean.** Slowed to 0.45× through the rotation with the tracked punch-in, back to full speed for the landing | `trailer-flip.json` (authored — see below), captured at 60 fps for the slow-mo |
| 5 | 8.71–9.68 | 0.5 | garage | Astra's authored hero on the shutter-door stage over the wet floor, orbiting to the front three-quarter. Overlay "FIVE OUTFITS, TWO BIKES" | `capture-ui.ts`, 100 frames |
| 6 | 9.68–10.65 | 0.5 | **firejump** | H3 Pro over the foundry fire line, in on the landing (gamma 1.35 — the foundry is very dark) | `bot-3-pro.json` ticks 500–870 |
| 7 | 10.65–11.61 | 0.5 | **canyonair** | E1's 2.23 s / 9.8 m gap across the canyon mesas — the one warm daylight shot in a cut that is otherwise night city, foundry and snow | `bot-3.json` ticks 4212–4610 |
| 8 | 11.61–12.58 | 0.5 | results | The finish: TRACK FINISHED, 0:40.558, 0 faults, FIRST CLEAN, the medal row and the four tiles | `bot-3.json` ticks 4820–5260 |
| 9 | 12.58–15.08 | 2.5 s | end | Wordmark · `build <sha>` · trials-gauntlet-demo.vercel.app | — |

Every riding beat carries its own rendered game audio (`render-audio.ts`); the two screen beats are
silent and the music carries them.

## The backflip had to be authored

**No golden contains a flip.** The bot rides for time, and `survey.ts` measures its largest airborne
rotation anywhere across all 15 tracks at **40°**. So `make-flip.ts` follows the X1 golden to the
summit launch, then sweeps 972 combinations of *when* to start the lean-back, *how long* to hold it,
throttle, and landing attitude — keeping whichever rotates furthest and still lands. 405 land clean;
the winner rotates **349°** at a 15.1 m apex and rides away. (The wildest rotates 543° — a flip and a
half — and crashes.)

Two bugs in that tool, both of which made it claim a landing it did not have:

- **The settle must match the tail.** The search called a flip landed if it was upright 0.4 s after
  touchdown, while the emitted recording carried 2 s — so flips that landed and *then* looped out
  scored as landed. Search and emit now use the same settle.
- **Recordings quantise input.** `src/core/replay.ts` stores throttle/brake as u8 and lean as i8, so a
  plan value of `-0.8` is written as `-102/127 = -0.80315`. Stepping the search with the raw float
  meant the sim saw a lean the file cannot hold, and a marginal flip that landed in the search
  replayed as a crash. Everything now steps through `quantizeInput` first.

`harness/inputs/x1-vertical-limit/trailer-flip.json` replays independently to 0 faults, still riding.

`survey.ts` grew the two measurements this needed: `WHEELIE` windows (rear contact only, ≥ 0.6 s) and
net airborne rotation per air, flagged `FLIP` past 180°. That is how the beats above were picked.

## How the screen beats are captured

`capture-beats.ts` replays a *recording*; there was nothing that drove the *UI*. The obvious route —
`recordVideo`, as `harness/e2e/worldmap-clip.mts` uses for evidence — records the wall clock, and the
wall clock on SwiftShader is a 3–4 fps game: every tween stutters.

`capture-ui.ts` instead installs Playwright's fake clock, lets it run in real time through boot, then
**pauses it** and makes every output frame exactly one `clock.runFor(1000/fps)` — one rAF, one app
frame. The page may take two seconds to paint; the clip is still a clean 30 fps, and the same shot
script gives the same frames. Four things this cost:

- **Waits must pump the clock.** `.live` is set 150 ms after a screen is drawn (`src/ui/live.ts`), a
  world-map fly is a 380 ms rAF tween. Under a frozen clock those timers never fire, so a plain
  `waitForFunction` deadlocks. `pumpUntil` steps a frame between polls.
- **CSS transitions do not obey the fake clock** — it fakes `Date`/timers/rAF, not the compositor
  timeline, so a 380 ms transition would finish inside one captured frame. Shots set `cssRate: 0.03`
  (CDP `Animation.setPlaybackRate`). The game's own camera work is rAF and unaffected.
- **The fps meter is drawn on every screen except the menu** (ask 45 only covered the menu), so the
  capture injects a style that hides it.
- **A mouse click is not a tap.** The world map focuses whatever marker the pointer moves over, so a
  mouse click aimed at a marker arrives when that marker is already focused — and an already-focused
  marker *launches the track*. The first cut of that shot rode off into B3's countdown. The `tapAt`
  step clicks open land while zoomed out instead, and `mapcard` steps focus with `ArrowLeft`.

`shots-ui.json` also holds `menu`, `mapcard` and `phone` shots (the phone one at 932×430, DPR 2, for
`edit.py`'s device-bezel `phonecard` card). They are not in this cut — round 2 spent their bars on
riding — but they are scripted and ready if the balance changes.

## Notes

- Beats are `edit.py` beat directories (`frame-NNNNN.png` + `log.json` + `audio.wav`), so the cut
  reuses the v0.1.0 editor's cards, music mix, ducking and contact sheet unchanged. `capture-beats.ts`
  logs `cam` per frame, which is what lets `punch=True` track the bike on the air beats.
- **The garage is not showing a placeholder.** The Race outfits look flat next to the Street ones,
  which reads like the ask 29/40 procedural stand-in. It is not: `debugInfo().heroDoc` is
  `bike rider` (the authored document) on all five outfits with zero refetches, and Race is simply a
  lower-poly authored model — 77 300 tris against Street's 92 171, being a full-face helmet with no
  face or hair to carry. It reads flat only from behind, so the shot orbits to the front.
- The save is seeded (`capture-ui.ts` `SEED`, the same six PBs `worldmap-clip.mts` uses) so the map
  reads mid-career — `6 / 15 CLEARED`, medium open, hard still gated. `?dev=1` would have unlocked
  everything and littered the map with `-test` markers.
- `edit.py` could not render a card on a stock Pillow: its bundled FreeType has no brotli, so the
  game's shipped `.woff2` faces raise "unknown file format". The same faces are vendored as `.ttf`
  under `fonts/` (regenerate with `fonts/woff2ttf.py public/fonts harness/trailer/fonts`).
- `edit.py --cut ui` also gained `push=(z0, z1)` (a slow linear zoom for a beat whose screen barely
  moves) and `overlay_y` / `overlay_size`. The push is unused in round 2 — every beat moves now — but
  when the menu beat needed it, 1.07 clipped the wordmark and the PLAY tile: keep any push ≤ 1.03,
  because every one of these screens anchors its UI to the frame edge.
- `brand-gate.sh` skips `*.map` as well as `*.md`. A source map carries every comment in the tree,
  including `src/physics/v2/tuning.ts`'s R10 reverse note citing the genre's reference games; that
  file is inside the harness src fingerprint, so rewording a comment there would restale all 47
  committed goldens to silence a string no frame can render.
- The end card reads `build <sha>`, not a version — this is a cut of HEAD, not of a pinned release.
- Captured frames and the cuts are gitignored: `harness/out/trailer/` is otherwise tracked, and the
  video blobs already in it are half of why main cannot be pushed (HR-11). The flip *recording* is
  committed — it is input, not video, and it is the only source in the cut that cannot be
  regenerated from an existing golden.
