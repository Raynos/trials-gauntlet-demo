# Device reports — `?bench=1` on the phone

The headless bench (`harness/bench`, `project/archive/PERF.md`) measures the frame on this machine's SwiftShader; the
phone's floor (24–28 fps in the garage at a 30 cap, worst frame 66 ms — `PERF.md` §0) is somewhere it cannot
see. `?bench=1` is the instrument that runs **on the device** and hands back the numbers. One report per round
is filed here as `docs/device/<date>-<sha>.md` (Rider on Glass G2); the ship gate reads the latest (G5).

## How to run it (the user, ~3 minutes)

1. On the phone, open **https://trials-gauntlet-demo.vercel.app/?bench=1** (or a preview deploy with the same query).
   Landscape, screen brightness as you play, nothing else running. Let it boot to the menu.
2. A card says *Device bench · 8 scenarios · ~3 min · no input needed*. Tap **Start**. That tap also unlocks the audio
   context, so the audio leg of the frame is real.
3. Leave the phone alone and keep the screen on. The status line under the fps meter shows `bench 3/8 · b1 start line · L cap 30 · 12 / 20 s`.
   The scenarios, 20 s each after a 2 s settle:

   | # | scenario | what it isolates |
   |---|---|---|
   | 1 | `menu` | the key art covers the canvas: render is off — anything left is the page itself (RAF, compositor, audio, shell) |
   | 2 | `garage` | the idle bike on the b1 backdrop, nothing moving — the screen that reads 24–28 fps |
   | 3 | `b1 start line` | after the countdown, no input: HUD on, touch layer on, physics ticking |
   | 4 | `b1 ride` | the committed bot-3 golden replayed through the playback path, at the tier Auto picked |
   | 5–7 | `b1 ride · low / medium / high` | the same 20 s at each tier forced: fill cost vs fixed cost |
   | 8 | `b1 ride · cap 60` | the cap lifted: what the phone can actually do at the current tier |

4. At the end the game returns to the menu with the **Bench report** panel over it. Tap **Copy report** (or **Share** to
   AirDrop / Notes), paste it to the parent. The parent files it under `docs/device/<date>-<sha>.md` verbatim.

The report is also kept on the device (`localStorage['trials.benchlog']`, last 10) and rides along in Settings →
**Export run log** as `bench: [...]`.

## Bisecting on the device (A/B toggles)

Each toggle runs the *same* scenario list, so a toggled run is directly comparable to the baseline row for row:

| URL | what changes |
|---|---|
| `?bench=1&no=audio` | `audio.update` skipped and the AudioContext suspended (the worklet stops) |
| `?bench=1&no=hud` | no HUD DOM writes (`setRun` / `update`) |
| `?bench=1&no=render` | `renderer.render` skipped — everything else runs; if this is still not flat 30, the WebGL frame was never the cost |
| `?bench=1&no=touch` | the touch layer hidden |
| `?bench=1&cap=60` | every scenario at cap 60 (the last row is always cap 60 anyway) |
| `?bench=1&no=audio,hud,touch` | several at once |
| `?bench=1&quick=1` | menu + garage, 3 s each (the headless e2e uses this; fine for a 10 s sanity check) |

Also worth one run each, no code needed: iOS Settings → Accessibility → Motion → **Reduce Motion** on (the report
records `reduceMotion`), Low Power Mode on (`battery` is in the report where the browser exposes it; iOS Safari does not),
and the game added to the Home Screen (`standalone`).

## Reading the report

One row per scenario, from the app's own RAF loop — nothing is sampled by a timer:

- **fps** = rendered frames / window; **fps 0–5 s / last 5 s** = the thermal proxy (the `b1 ride · high` pair is quoted
  in the header as `thermal proxy`); **dropped** = rendered-frame intervals > 1.5 × the cap period; **worst ms** = the
  longest gap between two rendered frames.
- **raf Hz** = the display's RAF cadence over the window (every callback, rendered or skipped): 120 on ProMotion, 60
  otherwise. A 30 cap on 120 Hz renders every fourth callback.
- **tick p50 / p95** = the whole `App.tickFrame` (main-thread JS the game spends per rendered frame), split into
  **poll** (`InputMux.poll`), **physics** (fixed-step ticks; `(n)` = ticks per frame — 4 at 30 fps, 0 in menus),
  **hud** (DOM writes), **audio** (`audio.update` → worklet message), **submit** (`renderer.render`, i.e. three.js
  traverse + draws + the GL command encode; the GPU's own time is *not* here — it shows up as the gap between
  `tick` and the frame interval), **other** (the shell: touch settle, run info, ghost, panels).
- **long tasks** — Chrome / Android only (`PerformanceObserver('longtask')`; iOS Safari reports `n/a`).
- **calls / tris / Mpx** — the renderer's `debugInfo()` at the end of the window (0 / 0 when render was off).
- **heap MB** — Chrome only.

The number that settles `PERF.md` §0: if `tick p50` in the garage is ~2 ms and the interval is still 40 ms, the
30 ms are outside the game's JavaScript (compositor, the RAF cadence, the GPU); if `tick` itself is 30 ms, the split
says which leg. The `&no=…` runs confirm it.

## Headless proof of the instrument

`pnpm harness:e2e --only=bench` runs `?bench=1&quick=1` on `dist/` at the iPhone 15 Pro Max geometry: the START card
goes live and a tap starts it, both scenarios run, the report renders, Copy is `.live`, the JSON has every field, the
toggles change the split (`&no=render` → submit 0, `&no=hud,audio` → hud 0 and audio 0). `--only=benchfull` runs all
eight scenarios once (~4 min) and writes `harness/out/bench/device-full.md`. SwiftShader's numbers are this host's,
not a phone's — the assertions are about the instrument, never the fps.
