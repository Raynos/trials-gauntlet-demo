# Hero art integration — round 1 played evidence (ask 43)

Astra's per-outfit riders and per-class bikes (`ASTRA_HERO` in `src/render/hero/urls.ts`) played in the game on the
iOS-Safari stack: Playwright's macOS **WebKit** (ANGLE-on-Metal, `Apple GPU`), headless. Everything here is played —
every physics tick comes from a golden recording or from taps on the real UI; nothing is posed. Build: **`45f4afd`**
working tree with the ask-43 src edits uncommitted (the garage badge in the clip reads `BUILD 45F4AFD 2026-09-17`),
`dist/` built 2026-09-17 00:11 by `npx vite build --logLevel error`.

## Files

| file | what | how |
| --- | --- | --- |
| `webkit-phone-garage-b1.mp4` (100 s, 874×330 CSS px, DPR 3 = the user's iPhone landscape) | **The clip.** 0–3 s boot → menu · 4–17 s GARAGE tapped, then every outfit tapped and on each outfit the PRO then the ROOKIE chip (15 hero swaps, 0.7 s hold each) · 17 s ‹ Menu · 17.6–60 s **b1 from the Rookie golden as Street mustard on the rookie bike** (finish 40.558 s) · 60.6–99 s **b1 from the Pro golden as Race blue/white on the pro bike** (finish 37.967 s). The rides are paced to real time (60 fps slots) | `npx tsx harness/e2e/hero-art-clip.mts --out=harness/out/hero-art-clip/round1` (new; WebKit, `?sw=0` live app for the garage, the same page re-entered with `?harness=1` for the rides). Re-encoded from the recorder's webm at crf 30 |
| `sheet-phone-clip.jpg` | one frame every 2 s of the clip, 6 columns, left→right top→bottom | `ffmpeg fps=1/2 tile=6x10` (done by the script) |
| `sheet-phone-garage-swaps.jpg` | the garage section, one frame every 0.8 s from 5.0 s, hero side of the screen ×1.5 — the five outfits and both liveries as they were tapped | `ffmpeg select between(t,5,17.5) fps=1/0.8 crop=560:330:0:0 scale=840 tile=4x4` |
| `zoom-phone-garage-livery.jpg` | four hero close-ups ×3 across the first Pro / Rookie taps (4.6–7.4 s): rookie blue → pro yellow → rookie blue | `crop=300:200:280:20 scale=900 tile=2x2` |
| `phone-clip-log.json` | every swap's per-rAF probe (heroDoc, outfit, stage on/off, hidden count, draw calls), the two rides' hashes and samples, wall marks | written by the script |
| `webkit-720p-b1-mustard-rookie.mp4`, `webkit-720p-b1-bluewhite-pro.mp4` (15 s, 1280×720, 60 fps, exactly one rendered frame per two physics ticks) | **The hero close-up rides**, for judging arms / feet / hair: ticks (0, 1800] of the same two goldens, screenshot per frame, quality `high`, with the consumed-model byte proofs (`capture-720p-*.json`: every served file hashed against the frozen build, every `.glb` body hashed in-page against `model-catalog.json`) | `npx tsx harness/hero-capture.mts dist harness/inputs/b1-first-ride/bot-3.json harness/out/hero-art-capture/mustard-rookie 0 1800 high street-mustard 60 1280x720 webkit` and `… bot-3-pro.json … bluewhite-pro 0 1800 high race-bluewhite 60 1280x720 webkit` (hero-capture now takes the files from `heroFiles(outfit, header.bike)`); re-encoded at crf 28 |
| `sheet-720p-<ride>.jpg` | 12 hero-centred crops, frames n = 0, 75, 150 … 825 (tick = 2·(n+1): 2, 152, 302 … 1652), left→right top→bottom | `select not(mod(n,75)) crop=440:360:340:180 tile=4x3` |
| `zoom-720p-<ride>.jpg` | six ×2 close-ups at frames 30, 150, 330, 480, 600, 780 (ticks 62, 302, 662, 962, 1202, 1562) | `crop=300:260:420:280 scale=600 tile=3x2` |
| `zoom-720p-<ride>-worst-wrist.jpg` | the two frames with the largest hand-to-grip error the capture reported (mustard 210 / 690 = ticks 422 / 1382; blue/white 200 / 800 = ticks 402 / 1602) | same crop |
| `capture-720p-*.json` | the capture's evidence.json without the per-frame state dumps: build / served / asset hashes, graphics identity, per-frame phase, hash, heroDoc, `wristErr`, camera box | trimmed from `harness/out/hero-art-capture/*/evidence.json` |

## What the instruments say

- **No grey flash on any of the 15 swaps** (ask 29/40 bar): the per-rAF probe saw every frame of every swap with the
  garage stage on, `hidden` constant at 575, the rider always a glTF document (`bike-lod rider-lod`), never a
  procedural stand-in; outfit swaps settled in 105–165 ms after the tap (file already cached: 4 ms), livery swaps in
  7–75 ms. A luminance scan of the garage section of the video (326 frames) found no frame-to-frame jump > 12/255.
- **The garage on this phone proxy runs at tier `low`** (`profile: low`, governor), so the garage shows the **LOD**
  documents (`bike-lod rider-lod`, 88 draw calls, 52.7 k tris, hero 13.6 k). The full-detail rider is only in the
  rides (`heroDoc: bike rider`, tier `high`). Finding for the plan: the garage clip never shows the full-res rider.
- **Determinism on the new hero**: the WebKit ride of the Rookie golden hashed `389a5dc6c07ab8c3` at the finish, the
  node replay of the same ticks `389a5dc6c07ab8c3`, finish 40.558 s both; the Pro golden `f0549ee508d870ed` = node =
  the gate's pinned `b1-first-ride:pro.golden.hash`. `pnpm harness:determinism` D1–D8 PASS on both goldens.
- **Hand-to-grip error** (`wristErr`, metres, from the rig's own debug): 0 while seated; runs up to **11.8 cm**
  (mustard, ticks 1344–1398) and **14.6 cm** (blue/white, ticks 1492–1698) in the hang-back / launch frames — the
  chain's reach error the WebKit gate reports but does not gate (`harness/hero-webkit.mts`: "the pose table's, not the
  renderer's"). The worst frames are in `zoom-720p-*-worst-wrist.jpg`.

## What I saw (frames inspected, not a verdict)

`zoom-720p-mustard-rookie.jpg` frames 30/150/330/480/600/780 and the 12-frame sheet; `zoom-720p-bluewhite-pro.jpg`
same frames; `zoom-phone-garage-livery.jpg`; `sheet-phone-garage-swaps.jpg` all 15 tiles.

1. Both riders load with hair, beard, hoodie / jersey, jeans / race pants, trainers / boots; the liveries are the file
   (rookie blue, pro yellow) and the outfit swaps are visibly different garments in the garage tiles.
2. **Elbows above the helmet in the attack pose** — mustard frames 330, 480, 600, 780 (ticks 662–1562): the upper arm
   points up and the elbow peaks above the head line; the blue/white rider shows the same at frames 480 / 600. Real
   MX form is elbows-up, but here the apex sits higher than the helmet; whether that is the pose table or the rig is
   the render owner's call.
3. **Launch tuck** — mustard frame 150 (tick 302): the head is below the bar line and the torso folds flat over the
   tank.
4. **Rear boot hanging under the exhaust in hang-back** — blue/white frames 150 and 200 (ticks 302, 402): the white
   boot sits below the peg line behind the engine; on the mustard rider the trainer is hidden by the bike in the same
   window.
5. **Straight arms past the bar** — blue/white frame 780–800 (ticks 1562–1602): the arms are fully extended
   forward, the hands at the grip's far side (the 14.6 cm `wristErr` window).
6. Garage mirror floor: no z-fighting visible at 874×330 ×3 over the 15 swaps; the reflection follows the livery.
   Not inspected at higher resolution.

Nothing in the run raised a page error; the only console warning was the known `[render] track budget` line.

## Gates at this build (2026-09-17 00:12–01:05, loadavg 12–25 / 18 cores)

- `pnpm harness:determinism harness/inputs/b1-first-ride/bot-3.json --tail-s 3` and `… bot-3-pro.json`: D1–D8 all
  PASS (rookie `0e0307687d5be04c` with the 3 s coast, pro `f0549ee508d870ed`; the pro run pinned its first
  `canonical1200` = `0779c85170cde8e2` into `harness/gate/expected.json`).
- `pnpm harness:gate` (full, 60 s heap, camera box): **26/30** — the three SwiftShader timing rows as always
  (`boot.firstFrameMs` 8568 ms, `restart.frameMsP95` 424 ms, `perf.renderSyncedMsP95` 6359 ms, informational) and
  **`heap.growthMBPer60s` 5.39 MB (limit 5)**, marginal, one run; every clear / crash / restart / determinism / camera
  / bundle (533 KB gz of 600) row PASS.
- `pnpm harness:e2e` (full): **1153/1154** — the one fail is `boot 3g/sw=off/art=present: B3 DOWNLOAD held at 58 for
  2024 ms while 101 KB of counted files arrived`; `pnpm harness:e2e --only=boot` alone reproduces it (held at 59 for
  2205 ms at t ≈ 63.6 s, 4 main-thread freezes totalling 19.2 s). All other boot cells, bench, desktop, review, front /
  run / entry / hitrects and the transition grid pass.
- `pnpm exec tsx harness/e2e/outfits.mts` (Chromium): PASS — outage / retry on `rider-street-openface`, five presets ×
  two classes × full / LOD, live material names (`rider_body` on Street, `race-<outfit> technical fabric…` on Race),
  every outfit's and class's own full + LOD file fetched (14 model files).

## Round 2 re-cut on `3af533e` (`lodChoice`: authored rider in the garage on every tier, LOD in-level on phone tiers)

Same tool, `dist/` rebuilt 2026-09-17 01:02; files suffixed `-r2`. `pnpm harness:e2e --only=heroart` now runs the same
clip as an opt-in flow (1/1 pass, 129 s). Both rides still hash to the node replay (`389a5dc6c07ab8c3` /
`f0549ee508d870ed`), no flash on any of the 15 swaps (probe: stage on, `hidden` 575, never procedural).

| where | tier / profile | canvas | heroDoc | calls | tris (hero) |
| --- | --- | --- | --- | --- | --- |
| garage, phone proxy (governor) | `low` / `low` | 874×330 @ dpr 1 (upscaled ×3 by the phone) | **`bike-lod rider`** (authored rider, LOD bike) | 88 Street / 73 Race | 206 117 (**64 769** Street) / 161 468 (**49 886** Race) |
| garage, `--garage-quality=high` (inspection, first outfit only — the governor dropped it to `low` within the run) | `high` / `phone-high` | 1311×495 @ dpr 1.5 | `bike-lod rider` | 88 | 206 117 (64 769) |
| b1 ride, `high` (the evidence clip) | `high` / `high` | 874×330 | `bike rider` | 200 / 196 | 297 603 / 264 303 |
| b1 ride, `medium` (= phone-high's document choice; `--quality=medium --ride-ticks=600`) | `medium` / `medium` | 874×330 | **`bike-lod rider-lod`** | 166 / 157 | 121 857 / 122 203 |

Round 1 had `bike-lod rider-lod` / 13.6 k hero tris in the garage; the authored rider is now up there on `low`.

**DPR-3 inspection of the authored rider in the garage** (`still-garage-mustard-dpr3-low-r2.jpg` = the whole 2622×990
screenshot; `zoom-garage-heads-dpr3-low-r2.jpg` = mustard / open-face / charcoal / blue-white heads ×2;
`zoom-garage-mirror-low-r2.jpg` and `zoom-garage-mirror-phonehigh-r2.jpg` = the floor under the pro bike, mustard;
`zoom-garage-head-phonehigh-r2.jpg` = mustard head ×3 nearest-neighbour at phone-high):

1. **The phone's own garage tier renders at dpr 1** (874×330 backing store on a 2622×990 screen): every device-pixel
   still is a ×3 upscale, so hair-shell / beard alpha edges and mirror z-fighting cannot be judged at DPR 3 on the
   tier the phone actually runs — they are 3-px blocks. At phone-high (dpr 1.5) it is ×2. Finding for the render
   owner: the garage close-up is a 1× canvas on the phone.
2. Hair shell: at both tiers the hair reads as a solid dark cap with a blocky silhouette (mustard, charcoal,
   open-face all in `zoom-garage-heads-dpr3-low-r2.jpg`); no light halo or sorting popping against the sky window
   in any of the 15 stills; the beard / moustache are not distinguishable from the jaw shadow at this resolution.
3. Mirror floor: the reflection is a soft blurred twin (rookie blue / pro yellow follow the livery); no striping or
   z-fight banding in either mirror crop; the reflection sits offset below the bike by ~40 css px (a gap between the
   tyre and its twin) in both tiers — a stage / mirror-plane offset, not a fight.
4. The pro / rookie taps still repaint the livery only (`zoom-phone-garage-livery.jpg` behaviour unchanged).
