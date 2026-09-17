# Riding poses round 1 (ask 51) — garage `sit_cruise`, in-level authored stances — played on WebKit

Tree: `7573b06` + the pose owner's ask-51 build and the render owner's ask-50 resident hero pool (uncommitted),
`dist/` rebuilt 2026-09-17 (`npx vite build --logLevel error`). WebKit (Apple GPU), 874×330 CSS px, DPR 3, touch UA.

| file | what | how |
| --- | --- | --- |
| `webkit-phone-garage-b1.mp4` (100 s) | boot → GARAGE → 5 outfits × (Pro, Rookie) tapped → ‹ Menu → b1 Rookie golden as Street mustard (finish 40.558 s) → b1 Pro golden as Race blue/white (finish 37.967 s), real time | `npx tsx harness/e2e/hero-art-clip.mts --out=harness/out/hero-art-clip/pose-r1` — the per-rAF garage probe now asserts `__render.debug.rider.debug.stageClip === 'sit_cruise'` on every settled frame of every swap; the rides record `stance` / `wristErr` / `stageClip` per rendered frame |
| `sheet-phone-clip.jpg`, `sheet-phone-garage-sit-cruise.jpg` | the clip every 2 s; the garage every 0.8 s (hero side ×1.5) | ffmpeg tiles |
| `zoom-garage-mustard-dpr3.jpg` | the settled mustard rider at DPR 3, `sit_cruise` | crop of the tool's device-pixel still |
| `phone-clip-log.json` | swaps (frames with `stageClip` / `stanceOn`), rides (hashes, `pose` summary) | by the tool |
| `pose-frames-<ride>.json` | per rendered frame: tick, `stanceOn`, `pose`, `blend`, `wristErr[2]`, `stageClip` | by the tool |
| `webkit-720p-b1-<ride>.mp4`, `sheet-720p-<ride>.jpg`, `zoom-720p-<ride>-old-worst-windows.jpg` | the byte-proof 720p close-ups, ticks (0, 1800]; the zoom = frames 30, 150, 180, 210, 240, 279 (ticks 62–560: the old launch/tuck window), 671, 685, 698 (ticks 1344–1398), 745, 800, 848 (ticks 1492–1698), left→right top→bottom | `npx tsx harness/hero-capture.mts dist harness/inputs/b1-first-ride/bot-3[-pro].json harness/out/hero-art-capture/pose-r1/<ride> 0 1800 high <outfit> 60 1280x720 webkit` |

## Instruments

- **Garage**: all 15 swaps flash-free; `stageClip === 'sit_cruise'` on every settled frame of every swap (0 violations
  in 640 probed frames), `stance.on === false` in the garage. Swaps settle in 4–19 ms (the resident pool: no fetch
  on any tap). `heroDoc` is now **`bike rider`** in the garage (authored bike too — hero tris 92 171 Street / 77 296
  Race vs 64 769 / 49 886 in round 2 with the LOD bike).
- **Level**: `stance.on === true` on 2434/2434 (rookie) and 2278/2278 (pro) rendered frames; poses rookie `back`
  2186 / `forward` 248, pro `back` 1732 / `forward` 546; **`wristErr` 0.0000 on every frame** (the IK reach shortfall —
  hands reach the grips on every frame; the 720p captures' `gripErr` max 0.001 cm, `handOnGrip` true throughout).
  `stageClip` null in level (the authored clip is the garage's only). Hashes unchanged: rookie `389a5dc6c07ab8c3` =
  node, pro `f0549ee508d870ed` = node = pin. The in-clip rides ran on profile `phone-high` → `bike-lod rider-lod`
  (the 720p captures on `high` → `bike rider`).

## Frames (elbows / hands; the old worst windows)

Rookie `zoom-720p-mustard-rookie-old-worst-windows.jpg`: frame 150 (tick 302, the launch tuck) — torso folded over the
tank but the head stays above the bar line and the elbows bend outward, no longer above the helmet; frames 180–279
(ticks 362–560) — elbows bent, below the shoulder line, hands on the grips in all five; frames 671–698 (ticks
1344–1398, the old 11.8 cm window) — hang-back with straight arms, hands on the grips, elbows at shoulder height, no
overreach; frames 745–848 fine. Pro `…bluewhite-pro…`: frames 150–240 (ticks 302–482) — the wheelie launch, elbows
bent and outward, rear boot on the peg (the old "boot under the exhaust" is gone at frames 150 / 200); frames 745–848
(ticks 1492–1698, the old 14.6 cm window) — arms extended forward but the hands sit on the grips, no straight-past-the-
bar reach. Remaining note: the `back` stance dominates both rides (90 % / 76 % of frames) — the seated `sit_cruise`
never shows in level, and on the flat run-in the rider looks perched behind the seat (frames 671–698).
Garage `zoom-garage-mustard-dpr3.jpg`: seated, elbows relaxed, both hands on the bars — the prototype's pose.

Neither the boot nor the garage misbehaved under the ask-50 pool: no page errors, no procedural frames.
