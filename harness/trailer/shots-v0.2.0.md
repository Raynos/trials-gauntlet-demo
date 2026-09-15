# Trials Gauntlet — v0.2.0 trailer shot list (as cut)

Output: `harness/out/trailer/trailer-v0.2.0.mp4` 1920x1080 @ 30 fps (lanczos from the 1280x720 master
`trailer-v0.2.0-720p.mp4`), 56.8 s (53.8 s cut + the 3 s progress-timelapse splice), AAC 48 kHz, -13.7 LUFS measured; also `trailer-v0.2.0-web.mp4` (<= 25 MB),
`trailer-v0.2.0-15s.mp4`, `trailer-v0.2.0-sheet.jpg`. Captured headless (SwiftShader, quality `high`) from a clean
`git archive HEAD` export of **90f0622** built with `VERCEL_GIT_COMMIT_SHA` (the menu plate shows `build 90f0622`).
Music: the v0.1.0 124 BPM bed (`music.wav`: drops at bars 4 and 15, breaks at 12 and 23, end 26); every cut lands on a
bar or half-bar; the crash gag's respawn hard cut IS drop 2.

Recordings (`harness/out/trailer/recordings-v0.2.0/`): the harness owner's fresh skill-3 goldens on physics v2
(`src=6412a755`) — rookie `bot-3.json` for b1/m1/e2, **Pro `bot-3-pro.json` for h1/h2/h3/x1/x3** (the r9 storyboard set
pieces are Pro lines) — and one deliberate crash from `make-crash.ts` (x1 Pro golden to 42.3 s, then gas + lean back:
the summit landing at 44.37 s, 1.0 s ragdoll, restart). NOTE: HEAD's *committed* Pro goldens are restamped copies that do
not replay on HEAD (they crash at x~30); the working-tree goldens replay to a finish on the HEAD export byte-for-byte with
the working tree (`survey.ts` timelines identical). x2's Pro golden faults 14x and is not in the cut.

| #  | t (s)         | Bars | Beat                                                                 | Track / biome / bike            | Source (rec s)  |
|----|---------------|------|----------------------------------------------------------------------|---------------------------------|-----------------|
| 0  | 0.00-0.97     | 0.5  | Black; engine idle + crowd under                                     | —                               | —               |
| 1  | 0.97-5.81     | 2.5  | COLD OPEN: gate, photo crowd, NORDVIK / APEX / VORTEX OIL / KESTREL TYRES banners, 3-2-1-GO, launch | b1 First Ride / industrial / rookie | countdown + 0-4.8 |
| 2  | 5.81-7.74     | 1    | TITLE: key art + wordmark, "A PHYSICS TRIALS GAME"                   | —                               | —               |
| 3  | 7.74-8.71     | 0.5  | THE HOP: v2 preload + hop onto the ledge (drop 1)                    | m1 Hop Up / industrial / rookie | 9.2-10.2        |
| 4  | 8.71-10.65    | 1    | 1.24 s table-top air, the clean 2 m rear-wheel landing (imp 58)      | e2 Rear Wheel First / canyon    | 13.5-15.4       |
| 5  | 10.65-13.55   | 1.5  | PRO WHEELIE: 2.7 s on the rear wheel along the rooftop onto The Wire | h1 Rooftop Wire / nightCity / Pro | 40.6-43.5     |
| 6  | 13.55-15.48   | 1    | THE ASCENT: Face 1, 1.37 s air up the 45 deg face, snow             | x1 Vertical Limit / snow / Pro  | 4.2-6.1         |
| 7  | 15.48-20.32   | 2.5  | THE STACK: 1.82 s / 9 m drop, SLOW-MO x0.3 through the apex, tracked punch-in | x3 Gauntlet / foundry / Pro | 44.4-47.6   |
| 8  | 20.32-22.26   | 1    | THE CRANE JUMP: 1.0 s air over the container yard, night city        | h2 Gap Chain / nightCity / Pro  | 28.2-30.1       |
| 9  | 22.26-24.19   | 1    | Canyon table-top, sunset mesas                                       | e2 / canyon                     | 35.4-37.4       |
| 10 | 24.19-26.13   | 1    | CARD: 15 TRACKS · 5 BIOMES · 2 BIKES (break, bar 12)                | —                               | —               |
| 11 | 26.13-29.03   | 1.5  | THE JOKE: the summit launch, 1.9 s of air from 15 m, lands on the head at 28.20, CRASH banner, ragdoll, music cut | x1 / snow / Pro (make-crash) | 42.3-45.2 |
| 12 | 29.03-30.97   | 1    | HARD CUT: respawned at CP3, pulls away + "EVERY CRASH IS A RESTART" (drop 2) | x1 / snow                | 45.7-47.6       |
| 13 | 30.97-33.87   | 1.5  | THE DROP: 40 deg rooftop roll-off, 0.9 s air into the scaffold tunnel, out the far end | h1 / nightCity / Pro | 46.3-49.2 |
| 14 | 33.87-37.74   | 2    | THE POUR: the tunnel rows under the ladles, then the 1.6 s fire jump (gamma 1.22) | h3 Fire Line / foundry / Pro | 37.5-41.4 |
| 15 | 37.74-39.68   | 1    | Wheelie up the 45 deg face                                           | x1 / snow / Pro                 | 5.9-7.8         |
| 16 | 39.68-42.58   | 1.5  | THE BROADCAST MENU: slow push-in on the live menu plate (build 90f0622 stamp, ticker, PLAY / GARAGE / SETTINGS) | — | menu-plate.ts |
| 17 | 42.58-43.55   | 0.5  | Second canyon jump                                                   | e2 / canyon                     | 37.2-38.2       |
| 18 | 43.55-44.52   | 0.5  | Off the ledge                                                        | m1 / industrial                 | 9.5-10.5        |
| 19 | 44.52-46.45   | 1    | CARD: PLAYS IN YOUR BROWSER / DESKTOP · iPHONE · GAMEPAD, with the live iPhone-geometry capture (932x430, the G touch controls) in a device bezel | h2 / phone | 27.9-29.7 |
| 20 | 46.45-50.32   | 2    | FINISH: the h1 finish arch, fireworks, TRACK FINISHED, results panel | h1 / nightCity / Pro            | 51.3-55.2       |
| 21 | 50.32-53.82   | 3.5 s| END CARD: wordmark · v0.2.0 · 90f0622 · trials-gauntlet-demo.vercel.app | —                            | —               |

`harness/out/timelapse/progress-wave4.mp4` existed by the time the parent ran the edit: its last 3 s are spliced at
50.32-53.32 before the end card (`edit.py --timelapse`). The end card reads `v0.2.0 · 9979b1b` (the sha the parent passed
at edit time); the export the frames were captured from was built at 90f0622 (the menu plate's `build 90f0622` stamp).

Known gaps: the iPhone-geometry capture (beat 19) runs in a Playwright mobile context (coarse pointer, hasTouch) but the
touch-layer zone glyphs are not legible in the frames — the hook feeds input directly, so the mux never sees a touch
pointer and the layer stays at its unsettled/faint state; a follow-up should force `touch.setVisible(true)` (or tap once)
before the capture. No fireworks are visible at the h1 finish in the r14 render under SwiftShader (the arch, crowd and
results panel are).

15 s social cut (`--cut v2-social`, music-15 drops 0 & 5): title 0.5 b · hop 0.5 b · landing 0.5 b · stack slow-mo 2 b ·
crash 1.5 b · respawn + card 0.5 b · rooftop drop 1 b · end card 2.5 s = 15.1 s.

## Re-render (one shot)
```
git archive HEAD | tar -x -C <export> && cd <export> && pnpm install --offline && VERCEL_GIT_COMMIT_SHA=$(git rev-parse HEAD) pnpm build
cp -R harness/out/trailer/recordings-v0.2.0 <export>/harness/out/trailer/ ; cp harness/out/trailer/music*.wav <export>/harness/out/trailer/
PY=<venv with pillow numpy brotli> harness/trailer/capture-v2.sh <export> <sha7>
```
Cost on the shared host at loadavg ~60: 1283 frames at 1280x720 ~ 45 min (2 s/frame; 1080p measured 4 s/frame, which is
why the master is 720p upscaled), audio ~1 min, edit ~2 min per cut. Brand gate: `harness/trailer/brand-gate.sh <export>`
(bundle + src + art names + trailer scripts; the only allowlisted match is the Credits panel's Thanks line).
