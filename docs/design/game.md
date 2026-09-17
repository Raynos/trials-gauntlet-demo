# Game layer — run state machine, clock, inputs, HUD, mobile

Owner: core-game. Binding numbers come from `CONTRACT.md` §1 (timer), §2.7–2.9 (interfaces, rules,
hook). Everything below is measured in **physics ticks** (120 Hz), never wall time, so a recording
replays to the same phases, banners and auto-restarts tick for tick.

## 1. Run state machine

```
menu ──load──▶ countdown ──GO──▶ riding ◀──reset──┐
                                  │  fault(crash/oob/hazard/timeout)
                                  ▼                │
                               crashed ────────────┘ (tap restart, or auto after 120 ticks)
                                  │
                       riding ──finish──▶ finished ──retry──▶ countdown
```

| phase | physics stepping | run clock | leaves on |
|---|---|---|---|
| `menu` | not ticking | frozen | `loadTrack` / `startRun` |
| `countdown` | steps with `NEUTRAL_INPUT` (bike alive, settles at sag; throttle ignored) | 0 | tick 360 → GO |
| `riding` | steps with the player's frame | +1/tick | `fault` event → `crashed`; `finish` event → `finished` |
| `crashed` | steps with the frame minus `restart` (ragdoll keeps simulating) | +1/tick (Trials rule) | restart edge, or 120 ticks after the fault → `physics.reset(cp)` → `riding` |
| `finished` | steps with the **game's** frame: throttle 0, lean 0, brake 0 → 0.6 over 1.0 s (`FINISH_BRAKE_S`); a post-line fault undoes that tick and freezes the world | frozen at the finish tick | restart tap → full restart (`countdown`) |

**Countdown (fresh load / full restart).** Events `countdown n=3` at countdown tick 0, `n=2` at 120,
`n=1` at 240, `go` at 360 (1.0 s cadence). On GO the game calls `physics.reset(-1)` and swallows the
events that reset produces, so the physics state at GO is byte-identical to a fresh load — a replay
therefore always starts at GO with physics tick 0 (`skipCountdown()` just jumps there). In harness
mode (`?harness=1`) `loadTrack` and full restarts skip the countdown by default; `?countdown=1` keeps it
so a capture can show it.

**Checkpoint restart (tap).** Restart edge while `riding`: game emits `fault{reason:'restart'}`,
calls `physics.reset(lastCheckpoint)`, does **not** step physics that tick (`tick===0` after exactly
one game tick, ship-gate G5), no countdown, run clock keeps running. Physics never sees `restart` —
the game strips it from every frame it forwards, so no double-counting if physics also implements it.

**Crash → auto-respawn.** On a `fault` with any reason other than `restart` the phase becomes
`crashed`. A restart edge during `crashed` respawns immediately with **no additional fault** (the crash
already counted); otherwise the game respawns at crash tick + 120 (1.0 s). Either way it is
`physics.reset(cp)` + a `restart{checkpoint}` event, one tick, hard cut.

**Hold to full-restart.** `restart` held for 72 consecutive ticks (0.6 s) → `restartFromStart()`: faults
0, run clock 0, physics `reset(-1)`, phase `countdown` (or GO directly in harness mode). The tap at the
press edge still fires first (Rising behaviour). Release re-arms.

**Finish.** `finish` event: run clock stops at that tick (`runTime()` == `PhysicsState.finishTime` when the
run had no restart, since both count ticks from GO/last reset). Results panel is shown 48 ticks (0.4 s)
after the finish. **Finish flow (round 6; user: "going off the end and crashing — it goes absolutely nuts"):**
from the line on the player's frame is ignored and the game drives the bike itself (`stepFinishCoast`):
throttle 0, lean 0, brake ramping 0 → 0.6 over 1.0 s on the 1/255 grid, so it coasts and stops upright on
the run-out the tracks add past every finish (flat-test, 13.8 m/s at the line: stopped at +11.5 m after 1.8 s;
faster tracks roll further). Each finished tick snapshots physics first (two typed-array copies); if the step
produces a `fault` (old track without run-out, a cliff) the snapshot is restored and `finishFrozen` is set —
no fault event reaches the HUD / renderer / listeners, no ✕, no ragdoll, no respawn, no camera change, and
physics is not stepped again until the restart. `effectiveInput()` (the coast frame while finished) is what
the audio hears, so a pinned throttle does not rev under the results. Test: `game.test.ts` "finish: the game
owns the input …" — timeline t=0 line · +0.5 s brake 0.3 · +1.0 s brake 0.6 · run-out fault swallowed, hash
frozen, `faults()` 0, restart tap still works. Medal vs `meta.targetTimeS` (T): platinum ≤ 0.85·T & 0 faults, gold ≤ T & ≤ 1 fault,
silver ≤ 1.25·T & ≤ 5 faults, bronze = finished. Best time per track in `localStorage`
(`trials.best.<trackId>` → `{ time, faults, medal }`).

**Faults / attempts.** `faults()` = count of `fault` events (every reason, manual restart included).
`attempts = 1 + faults`. Reset to 0 only by a full restart. **Timeout**: none in the game layer; physics
may emit it.

**Pause.** Esc / Start / the touch pause button (top-left) open the menu overlay and stop ticking (`paused()` is a flag,
`phase()` is unchanged; the run clock is tick-driven so it stops with the ticks). `visibilitychange` →
hidden pauses. Harness mode never pauses.

### 1a. Track entry hold (render r14 → core 13; `Game.beginRun`, `entryHeld`, `RunInfo.entry`)

The renderer's `setTrack` compiles the new biome behind a fog placeholder in ≤ 16 ms tasks (`beginEntry`,
rendering.md §11i) and `whenReady()` resolves after it; `render()` paints the placeholder while
`debugInfo().entering` is true. Before this round the HUD timer counted "3-2-1" over that fog — the user's e2
screenshot: a running countdown on a black world. Now `beginRun` (every load path and full restart that is not
harness-mode) reads `debugInfo().entering` once: **when the renderer is entering, the countdown phase is entered but
held** — `countdownTick` does not advance, no beat is emitted, the run clock stays 0 — until `whenReady()` resolves;
the release emits the `3` and the countdown runs exactly as before. A token drops a stale release (a newer
`loadTrack`, `skipCountdown` / GO, or `toMenu` in between). A restart in place (no `setTrack`) or a stub renderer is
not entering and counts down synchronously, as every existing test expects (`entry.test.ts`). Physics still steps
neutral input during the hold, as it does through the countdown; GO resets it either way, so nothing
determinism-relevant depends on the hold's length.

While held the game writes `RunInfo.entry = { biome, ms }` (the biome id from `track.meta`, wall ms since the hold began —
a loader clock, a label only) and the HUD shows `Loading canyon… 1.2 s` (`.hud .entry`, tenths, one text write per
100 ms) where the `3` will land; `hook.info().entryHold` and `?perf=1`'s `entry … ms (holding)` expose the same state.
Proof (`pnpm harness:e2e --only=entry`, `flowEntry`): boot to the menu (industrial hall prepared), `app.play('e1-uphill-weight')`
(canyon — a biome change), sample every RAF through `hook.info()` for 90 frames after GO: frames after GO with the
placeholder (`render.entering`) up = **0**, no countdown digit drawn while entering, run clock 0 and phase `countdown` for
every held frame, the HUD label seen, `entryMs` reported (SwiftShader: 137 frames sampled, 28 held, entryMs 9508;
the phone's number is rendering.md §11i's table, 237 ms first draw on canyon).

## 2. Determinism rules for this layer

- All timers (`countdownTick`, `crashTicks`, `holdTicks`, `resultsTicks`, `runTicks`) are integers
  advanced only inside `Game.tick()`.
- Inputs are quantized (`quantizeInput`) at `setInput()`; the recorder stores the quantized frame **as
  the player sent it** (including `restart` held across the hold window), and `runRecording` feeds
  the same frames through the same `tick()` — the auto-respawn, the hold-restart and the countdown
  all reproduce.
- `snapshot()` = physics snapshot + this layer's counters (phase, runTicks, faults, timers, latch);
  `restore()` puts both back so `restore(snapshot())` + step×m hashes like the straight run.
- Bounded queues: `drainEvents` buffer 256, HUD banner list 8, event listeners deliver synchronously.

## 3. Inputs (`src/game/input/`)

One `InputMux` reads every device each rendered frame, quantizes, and hands `Game.setInput` a single
`InputFrame`. Throttle/brake = max over devices, lean = clamped sum, restart = OR. The last device that
produced a non-neutral frame is the **active device** (HUD indicator, hint glyph set). There is **no hop
button** anywhere: the hop is preload (lean back + throttle) then snap forward, done in physics.

| action | keyboard | gamepad (standard mapping) | touch |
|---|---|---|---|
| throttle | ↑ / W | RT (button 7, analog) | right half, right zone |
| brake | ↓ / S | LT (button 6, analog) | right half, left zone |
| lean back | ← / A | left stick x < −0.18 (analog, deadzone re-scaled) | left half, left zone |
| lean forward | → / D | left stick x > +0.18 | left half, right zone |
| restart (tap / hold 0.6 s) | Enter / R / Backspace | B / circle (button 1) | top-right button (≥ 44 pt) |
| pause / menu | Esc | Start (button 9) | top-left button |
| menu confirm / back | Enter / Esc | A / B | tap |
| menu focus movement | arrows / WASD | d-pad, left stick (0.6 threshold, edge-triggered) | — |

Menus use spatial focus navigation (`spatialMove`: nearest visible button along the axis, same
row/column preferred), so a pad or the keyboard can reach every track card, the quality segment,
the sound toggle and the pause actions; confirm clicks the focused control.

Touch: pointer events on a full-screen overlay with `touch-action: none`; each pointer id is tracked
independently so lean + throttle + brake can all be down at once; zones are split at 50 % width and
25 % / 75 % for the sub-zones, buttons carved out of the top edge respecting safe-area insets.
**Multi-touch rule (P0, round 3):** Safari fires its proprietary `gesturestart` / `gesturechange` the moment a
*second* finger lands — for GAS + LEAN, not only for a pinch — whatever `touch-action` and the touch handlers
did. Those events are `preventDefault`'d and otherwise ignored; a pointer leaves the map only through its own
end event, the raw stream saying zero fingers, focus loss or the watchdog. (The old handler called
`releaseAll` on `gesturestart`, which dropped GAS the instant LEAN was pressed.) Verified with Chromium CDP
`Input.dispatchTouchEvent` two- and three-point sequences and jsdom (`touch.test.ts`). Hit-testing runs in
the *logical* frame (`toLogical`, §11 — identity today; rotate-to-play).
**Touch controls: the strip with keys** (`assets/design/controls/SPEC.md` § Round 2, direction G; the user's pick). While touch
is the active device the bottom edge carries one continuous dark-glass strip — `3.33rem` + the home-indicator inset (`--sab`):
52 px at 932×430, 48 px at 844×390, i.e. 12 % of the height, always under the wheel line — at 40 % opacity idle, 30 % three
seconds after GO (`settled`), with a 2 px amber seam at the 50 % line (the two-thumbs split a finger never crosses). Four key caps
sit inset in it, one centred per quarter at 75 % of the quarter's width (175×40 px at 932×430; radius 8; bevelled): **◀ bike LEAN
BACK** · **LEAN FWD bike ▶** (inline-SVG bike glyphs — rear wheel down / nose down — with the chevrons on the *outside* so the pair
reads as a mirror) · **disc BRAKE** · **grip GAS**, glyph 22 px, label `.72rem` tracking .2em. Colours: the two LEAN keys share **one
neutral scheme of equal weight** — cool steel `#d7e3ef` — neither primary nor secondary; BRAKE `#ff5a5a`; GAS `#5aff8c`. Idle,
a key shows its colour on glyph + label over a 10 % white cap; **held**, the key goes solid in its colour with a black glyph,
presses to `scale(.96)` and glows, and the key's *whole quarter column* takes an 8 % wash of the same colour fading to nothing
by 55 % of the height, so the state reads in the periphery without looking down. Onset 40 ms, release fades over 80 ms; the
settled state dims the strip only, never a held key. Feedback is driven by the existing per-frame `held` set (`paint()` toggles
`.held` on the quarter column) — no timers, no new state. **The hit areas are unchanged**: the four full-height quarters
(`zoneAt`), a thumb anywhere in the quarter lights that quarter's key; the strip is drawn by the layer root's pseudo-elements
(`pointer-events: none`, not a hit rect, so no `.live` of its own) and hides under pause / results with the zones
(`under-overlay`). The corner buttons (top-left ❚❚ pause, top-right ↻ Restart) are untouched, `.live`-gated as before, and the
HUD top band shifts to clear them. Keyboard and gamepad never see the strip; they keep the HUD hints. Enforced by
`harness/e2e/touch.mts` R7 (strip ≤ 13 % of the height, four keys, held colours, wash, hidden under the overlay) on both
phone geometries.

## 4. HUD (`src/ui/`)

Layout constraints: nothing over the bike's usual screen position (x ≈ 30 %, y ≈ 55 %); all text
crisp at DPR 1–3 (DOM/CSS, no canvas text), min 12 px at phone width, 1 rem = clamp(13px, 1.25vw + 4px, 18px).

- **Top centre**: run timer `mm:ss.mmm` (tabular numerals, 2.6 rem, heavy italic) with the fault
  counter in a pill to its right (`✕ n`; flips orange for 0.3 s on the respawn frame, not the fault
  frame — Evolution rule). At the finish the timer freezes green, the strip / track plate fade to 28 %, no
  split or delta floats under it (the old "+0:00.000" was the delta against the PB the run had just set);
  the PB delta is stated once, in the results headline. When the results frame arrives (0.4 s) the whole top
  band hides (`.hud.results-on`); the pause overlay hides it the same way (`.hud.under-overlay`).
- **Top right**: checkpoint progress strip (Rising) — marks from `track.checkpoints`/`finishX`, rider
  pin from `bike.pos.x`, passed marks fill.
- **Top left**: track name · tier; the active-device pill shows only when the device changes, for 1.5 s.
- **Kinetic banners** (centre, y ≈ 32 %, never over the bike): 3 / 2 / 1 squash-pop, GO scale-out,
  CRASH! stamp 0.2 s after the fault (rotated −6°, red on dark slab), checkpoint flash (thin green
  line sweep + "CHECKPOINT n"), TRACK FINISHED! ribbon. Banners are DOM nodes recycled from a pool of 8.
- **Results frame** (0.4 s after finish) and **pause overlay**: one frame, `assets/design/pause/SPEC.md`
  (direction A, "low action bar") — see §10 *Pause* / *Results*.
- **Main menu**: title, tracks grouped by tier with best time + medal, quality tier selector
  (auto/low/medium/high), audio toggle.
- **Countdown only**: one technique line (first of `meta.hints`, else `meta.technique`); nothing floats over play after GO (§10).

## 5. Quality tiers and mobile

- DPR cap: 2 on desktop, 1.5 on phones (`pointer: coarse` and `min(innerWidth, innerHeight) < 500` CSS px).
- Tier probe: median RAF interval over the first 60 frames after GO → ≤ 17.5 ms (60 fps) `high`, ≤ 34 ms
  `medium`, else `low`. Applied once via `setQuality`; a manual choice in the menu (`localStorage trials.quality`)
  wins over the probe.
- `index.html`: `viewport-fit=cover`, `user-scalable=no`, `overscroll-behavior: none`, `touch-action:
  none`, safe-area padding on every HUD edge, landscape prompt overlay in portrait on coarse pointers (§11).
- Audio `unlock()` on the first pointerdown/keydown; `visibilitychange` hidden → pause + audio ducked.
- Memory: no per-frame allocations in the HUD update path beyond string formatting; event queues bounded.

## 6. Hook (`window.__trials`)

Implements `TrialsHook` in full (`src/core/types.ts`): scaffold surface + §2.9 additions. `snapshot()`
is base64 of `[u32 v=2, physF64Len, physU8Len, gameLen][phys f64][phys u8][game JSON]`.
`hook.audio` is present only when the audio module exports `renderOffline`.

## 7. Boot order (harness mode)

`installHook` runs at module-evaluation time with a thunk that composes the game (renderer +
WebGL context, physics, audio, HUD) on first use; the composition and `loadTrack` run in the next
macrotask, so `__trials.ready` is observable before any of it and every hook call is still correct
regardless of task order. No frame is rendered on the boot path: the first frame (shader compile,
texture upload) is the harness's own `render()`, which the gate times as "first frame". Measured
page-side: `ready` at ≈30 ms after navigation start, compose ≈30 ms (renderer 27 ms), `loadTrack`
15–21 ms; the harness's nav→ready number adds ~150–200 ms of Playwright/CDP polling latency.
`hook.info()` reports `readyAtMs` (page time the hook was installed), `loadTrackMs`, `lastRender`
(`{ hudMs, submitMs, syncMs }` of the most recent render) and `modules` (which physics/render/audio
implementations are composed). The restart → synced-frame budget splits as: `restart()` 0.1–0.2 ms,
HUD DOM ≤ 0.2 ms, renderer submit ≈ 1 ms, GPU sync (SwiftShader raster) 64–72 ms at 1280×720 — the
same as a steady-state frame, i.e. the restart itself adds nothing.
`main.ts` composes the real modules when their barrels export them (`createBikePhysics` /
`bikePhysicsFactory`, `createRenderer` / `ThreeRenderer`, `WebAudioSystem`) with `?physics=mock` and
`?audio=0` as fallbacks.

## 8. PB ghost and splits

- On a personal best the run's `InputRecording` (JSON, recorded from GO to the finish by the game's
  own recorder, restarted at every GO) and its per-checkpoint run clock (`splits`) are stored with the
  best time (`trials.best.<trackId>` → `{ time, faults, medal, splits, recording }`).
- `GhostRunner` (`src/game/ghost.ts`) replays that recording in a second, independent physics world
  built from the same factory `main.ts` uses, stepped once per game tick from GO. It keeps its own
  tick counter (== live `runTicks`): live restarts never touch it (Trials rule). It mirrors the game's
  riding/crashed rules (restart edge → reset to last checkpoint; crash → auto-respawn after 120 ticks or
  on the next edge) so the recorded run reproduces bit-for-bit (tested: ghost hash == PB run hash every
  100 ticks and at its finish). After a snapshot `restore` the ghost re-seeks to `runTicks`.
- **Solver stamp (core round 7, physics v2 default).** Every recording header carries `physics: 'v1' | 'v2'`
  (`PhysicsVersion`, `src/core/types.ts`; JSON field, binary second trailer byte after the bike byte — 1 v1,
  2 v2; absent = recorded before the flip = v1). `Game` takes `physicsVersion` from `main.ts` (`'v1'` when
  `?physics=v1` resolved `createBikePhysicsV1`, else `'v2'`; undefined for the mock) and stamps the PB recorder
  and `startRecording`. `Game.recordingMatchesPhysics(json)` gates the ghost (`spawnGhost`) and the App's
  `playableBest` strips `recording` from what the front sees (card `▶ Watch`, `watchPb`) when the stamp
  differs, so a v1 PB is **never** ghosted or replayed under v2 (the same inputs ride to a different finish)
  while its medal, time and splits stay exactly where they were — the PB key is unchanged (`trials.best.<id>`
  / `@pro`), nothing is cleared. The next clear under v2 that beats the v1 time overwrites the entry with a v2
  recording and the ghost returns. `runRecording` / `startPlayback` themselves stay ungated (harness paths).
  Tested in `game.test.ts` ("physics version stamp") and `replay.test.ts` (both encodings).
- Exposed as `GameRenderer.setGhost(state | null)` (called every render, defensively), `hook.ghost()`,
  and a grey pin on the HUD progress strip. Toggle in the menu (`trials.ghost`, default on); harness
  mode defaults it off (`?ghost=1` to enable) so physics µs/tick measures one world.
- Splits: at each checkpoint the delta vs the PB's split (`runTime − pb.splits[i]`) is a kinetic
  label beside the timer for 1.5 s (green ahead / red behind, sim-clocked); the finish shows the delta
  vs the PB time under the timer.
- Kinetic feedback (per reference/notes/crash-restart-ui.md): fault digit flips orange ×1.35 for 0.3 s
  on the respawn frame (never the impact frame); CRASH! stamp 0.2 s after the fault, 60→100 % over
  0.25 s, −6°; checkpoint = green line sweep + short green edge flash (0.3 s); finish = white burst
  (0.35 s) + streak-in ribbon; results reveal in stages at 0 / 0.15 / 0.35 / 0.6 (earned medal burst) /
  0.9 (PB line) / 1.1 s (actions), stage state sim-driven, easing CSS.

## 9. Per-tick cost and how to measure it

Measured in Chromium through the hook (round 4, load average 13–22): the whole game path
(`setInput` + `step(1)`: quantize, PB recorder push, physics step, event drain/fan-out) costs
**1.8–3.6 µs/tick** with the real physics and ghost off (mock physics: 0.4–1.3 µs, i.e. the game layer
itself is ≈ 0.5 µs), **2.2–4.8 µs/tick** with the ghost world on, node measures the same physics at
2.4 µs. Two things made the ship gate read 100 µs/tick:

1. `performance.now()` is coarsened to **100 µs** unless the page is cross-origin isolated, so a
   2-tick block reads 0 or 0.1 ms. `vite.config.ts` now sends COOP/COEP on dev and preview servers
   (`crossOriginIsolated === true`, timer resolution 5 µs). Static hosts need the same two headers.
2. The first JS after a synced frame (`render(true)` = readPixels) pays the post-sync wake-up: even a
   trivial `setInput` reads 45–50 µs p95 there, and ticks measured right after it read 7–15 µs p50
   regardless of physics (mock included). Time µs/tick over ≥ 12-tick blocks, or exclude the first
   tick after a synced frame.

State is cloned lazily once per tick (`getState()` hands out the same object until the next tick),
nothing hashes per tick, and events fan out synchronously per *event* (checkpoint/fault/land are
rare) — those were the suspects and they are not on the profile.

## 10. Front end (main menu → track select → run)

Flow (`App.screen`): boot lands on `menu` → `tracks` | `garage` | `review` | `settings` | `credits`; `run`
(countdown…) → pause overlay → results. **There is no title screen**: the user asked whether the start
screen and the main menu need to be different screens and the answer was no — the "press any key" step
was a second tap that did nothing the menu's first tap can't do (audio unlock, PWA toast, rotate prompt all
hang off the App, not a screen). `TitleScreen` is retired; `App.screen` has no `title`. Routing is pure
(`src/game/flow.ts`, tested): `?harness=1` never builds the front end (hook-only; a track is loaded in the
boot macrotask as before — verified in the built page: zero `.screen` nodes, `phase()==='riding'`),
`?track=<id>` skips straight into that track, `?dev=1` unlocks every tier and lists the harness `*-test`
strips. Everything else opens the menu.

Design rule (user): "less buttons, more design". Menu = direction B "Broadcast" from
`assets/design/menu/SPEC.md` (user's pick): one band of controls in the thumb arc under full-bleed key art.
Track select = the pins on the tiles are the interface. Settings = one panel of segmented rows. No control that can be
removed stays.

- **Backdrop**: `b1-first-ride` loaded and held in the `menu` phase (nothing ticks, renderer's idle 3/4
  camera) under the menu. Entering the menu from a run (`quit`) calls `startRun()` (physics
  `reset(-1)` + a `restart{-1}` event so the renderer cuts ragdoll/particles) then `toMenu()`, with the
  master volume muted for 60 ms so the countdown cue the reset emits stays silent — the bike always sits
  upright at the start line, never a frozen crash (verified: play → crash → pause → Main menu capture).
  The renderer's menu camera is static, so the *canvas* drifts (`#app.drift canvas`, 12 s eased scale
  1.06→1.14 with a +13 % x offset; +20 % on short phones) — visible only until the key art plate decodes over
  it (and in the Garage, which shows the scene).
- **Main menu — "Broadcast"** (`MainMenuScreen` + `FocusList`, `.menu-*` rules in `styles.ts`; mockup
  `assets/design/menu/B-broadcast.jpg` is a direction study, not pixel truth). A TV sports package:
  - *Key art* (`.menu-keyart`): the industrial plate (`kind:'keyart'`, `2x` on DPR > 1.5 / wide) full-bleed
    *over* the canvas (the WebGL canvas is opaque so "behind" is impossible), mirrored (`scaleX(-1)`) so the
    rider lands right of the badge, `cover` at `50% 10%` so the helmet clears the top on 16:9 / 19.5:9 crops,
    a soft top + bottom vignette (`::after`) for the badge and band, a 28 s Ken Burns (`scale 1 → 1.06`,
    off under `prefers-reduced-motion`). Until the plate decodes the live 3D scene shows through (the
    biome tint is the `background-image` fallback, set as `backgroundImage` — never the `background`
    shorthand, which resets `background-size` and drew the plate at natural size, a 2× zoom); a 404 leaves
    the scene, never a broken image. The live scene above the band on wide screens was considered and not
    done: the still covers the canvas, and a second layout for one geometry is not worth the split (SPEC's
    honest note). The band covers the plate's floor, not its hero.
  - *Lower third* (`.menu-band`): a dark slab in the bottom quarter (`--tab-h` = clamp 52–92 px by 15 vh
    + `--ticker-h` 24–30 px + safe-area bottom; 92 / 84 / 122 px at 932×430 / 844×390 / 1280×720), a 2 px
    amber top edge, left inset 7 vw. The `FocusList` renders horizontally (`axis 'x'`): **PLAY · GARAGE · REVIEW ·
    SETTINGS** in the display face (clamp 1.7–2.6 rem, 1.45–2.1 rem short; the rule is `#ui .menu-item` —
    `#ui button { font: inherit }` outranks a bare class), each tab ≥ 88 × 44 (measured 93 × 65 / 89 × 59 /
    119 × 92 for PLAY), gap 40 px (24 px short) so one thumb never spans two; CREDITS as a `minor` item in
    small caps pushed to the band's right end. The amber `.menu-bar` is the active tab's **underline**
    (4 px, slides at `--t1`, takes the tab's width). Keyboard / pad: ←/→ (and ↑/↓) move, Enter/A confirm;
    hover-focus with tick cues. Esc/B on the menu does nothing (boot screen: nowhere further back).
  - *Ticker* (`.menu-ticker`, `pointer-events: none`, never a control): `BEST TIMES · FIRST RIDE 0:34.230 ·
    LEAN BACK --:-- · …` from `bestOf()` over `shipTracks()` in tier order, rebuilt on every `show`. After
    layout the screen measures the row: wider than the screen → the row is duplicated and translates by
    −50 % at ≈ 60 px/s (`--ticker-s`), a seamless loop; narrower → static. Paused under
    `prefers-reduced-motion`.
  - *Badge* (`.menu-badge` → `.menu-plate` + `.wordmark` + `.menu-build`): the wordmark **TRIALS GAUNTLET**
    (Barlow Condensed 900 italic, amber gradient fill + bevel; `public/fonts/*.woff2`, OFL) on a dark
    slanted plate top-left (`clip-path: polygon(0 0, 100% 0, calc(100% - .7em) 100%, 0 100%)`, a 5 px amber
    leading edge as an inset shadow — the gradient text is its own `background-clip: text`, so the plate
    is a wrapper, not the wordmark's own background). Under it the build stamp, tiny at 55 %:
    `BUILD <sha7> · <date>` (`BUILD_STAMP_SHORT`; the sha is `git rev-parse --short HEAD` via Vite `define`,
    `dev` only when git is unavailable — the still at 932×430 reads the HEAD of the build that made it).
  - *Chip* (`.menu-chip`, top-right, `pointer-events: none`): `● ROOKIE BIKE` / `● PRO BIKE`, the class in
    effect (`MainMenuScreen.setBike`, called from `applyBike` so a Garage change updates it live). The
    mockup's `● LIVE` word is dropped: the menu is a still, and "LIVE" would be a claim; the pulsing amber
    dot stays as the decoration.
  - *First-tap duties the title used to hold*: audio unlock is the App's first `pointerdown` / `keydown`
    anywhere (unchanged); the onboarding flag is untouched; the PWA update toast (`.toast`, z 30) and the
    portrait rotate prompt (`.rotate`, z 28) sit above the menu as before. The ticker and chip never take
    pointers, so the only tappables on the boot screen are the four tabs.
  - *Invariant* (`src/ui/live.ts`): the screen root goes through `reveal()`; nothing in the band is
    hit-testable until the root has been drawn ≥ .5 for 150 ms. `harness/e2e/touch.mts` `toMenu` asserts
    boot lands on `menu`, then `checkPlayReveal`: re-enter the menu through `goto` and, in the same
    evaluate, PLAY is not inside a `.live` element, a tap at its point (dispatched at the hit-tested element,
    as a finger would land) leaves `screen === 'menu'`, PLAY is ≥ 88 × 44 and its centre is below 70 % of
    the height; once `.menu-screen.live`, the hit at PLAY's centre is PLAY at opacity 1.
- **Track select** (`TrackSelectScreen` over `src/ui/trackMap.ts`, ask 38 — round 4 C "Ascent"): one
  continuous world map under a 2-D camera. The six isometric night plates (`PAGE_ORDER`: the proving-ground
  apron — Lab + playgrounds, no medals — then Industrial, Canyon, Snow, Night City, Foundry) are laid out in
  world space (`PLATE_OFFSET`, `WORLD`, 600×400 units per plate) as one mountain: the apron at the foot,
  Industrial straight above it over a quay wall, then each biome one iso step + a cliff band (`ISO_STEP`,
  `CLIFF`, the `.tseam` pieces and one `.tmass` under the stack) up-and-right to the Foundry summit, in
  campaign / biome order (M1 on the Industrial terraces — the tier rides on the pin's code letter and the
  altimeter). One scene root (`.tscene`) carries every `.tregion` plate, one trail (`worldRoute`: an SVG
  polyline in world units through every campaign pin, every leg out of a medalled pin lit), the `.tpin`
  posts at `worldOf(pinAnchors)` (code, name plate, 44 px medal disc, Ghost / Pro tags; locked = padlock +
  `unlockRule`) and the tier gate as a hazard-tape barrier across the trail at the seam (`gateAnchor`,
  `.gate`: tier + rule on the tape, the next locked track under it). The camera is one
  `translate(...) scale(...)` on the scene root — nothing scrolls, no page scroll: one finger / the mouse
  drags (inertia), a pinch / the wheel / a Safari gesture zooms about the pointer between the fit zoom
  (`fitZoom`: the whole mountain) and `ZOOM.max` (about one biome). Pins counter-scale by 1 / (s0 × zoom) so
  the disc is 44 screen px at every working zoom; below `ZOOM.plates` they drop their name plates, below
  `ZOOM.pinMin` they fold to dots and take no pointer (a tap on the map then flies to the nearest pin), and
  a pin under the card / the altimeter / the MENU pill is `.shaded` (dim, no pointer) so no tappable hides
  under another. Opens on the current track (last played if open, else `nextTrack()`, `defaultPin`) with its
  region framed at the largest zoom ≤ `ZOOM.open` at which the region's pins fit the free box between the
  card and the altimeter (never below `ZOOM.plates`; else the pin at `ZOOM.open`) — a subset of the map,
  never all of it. The vertical altimeter (`.tmini .tm`, the summit on top) lists every region with its
  `n / m`, medal dots and padlocks inside the right safe area under the MENU pill; a rung flies there. The
  focused pin's card (`.tcard`, bottom-left: RIDE, GHOST, REVIEW, top-5) is screen space. ←→ step the pins
  along the trail (past the last: the next region), ↓ reaches the card's actions then the next region up, the
  camera follows the focused pin into the middle 60 % of the free box; confirming the focused pin launches
  (`play()` at 180 ms, screen gone at 420 ms), a locked one shakes and states its rule. Lock rule
  (`src/ui/progress.ts`, tested): a tier opens when every authored track of every earlier tier holds a
  medal. The world model is pure data (`buildPages`, `worldRoute`, `gateAnchor`, `fitZoom`, `pinsInView`;
  `trackMap.test.ts` proves no two pins overlap at any working zoom); `docs/evidence/level-select/round4`
  holds the played clip and the measurements (no scroll axis, 0 px page overflow, every tappable ≥ 44 px,
  0 overlaps in every state on Chromium and WebKit at 932×430 and 844×390, 4 pins on screen at open, the
  fit zoom 0.20, B1 in two taps once focused).
- **Settings** (`SettingsScreen`): one column of rows — Quality, Sound, Volume (−/+ 10 %), Ghost,
  Rider / Bike (only when the renderer exports `setModels`; feature-detected in `main.ts`), Reset progress
  (two presses within 3 s). Up/down = row, left/right = value, confirm = cycle / fire. Footer: one quiet
  controls line (every device's bindings, hidden on short phones) and the build stamp. No diagrams, no
  dev switches (`physics=mock`, `audio=0`, `touchdebug`, `ghost`, `countdown` stay URL-only).
- **Pause** (round 6, `assets/design/pause/SPEC.md` — user: "too busy, all cramped on the left"): a
  full-frame grid (`.overlay`: flat `rgba(6,7,9,.5)` scrim, no left gradient, safe-area padding, 4 px backdrop
  blur on non-short only) — title block top-left (`PAUSED · TIER` kicker, track name, `TIME · FAULTS`;
  `CRASHED` in red + `CHECKPOINT n OF m` when opened over a crash), **Visuals** chip row top-right
  (`VISUALS · RIDER [Procedural|Modelled] · BIKE […]`, only with `renderer.setModels`, flips live behind the
  scrim), three tiles `RESUME / RESTART / QUIT` (`src/ui/tiles.ts`, 240×128 desktop / 160×92 `html.short`,
  centred on the viewport in the lower third for landscape-phone thumbs, exactly one amber = focused), Reload as
  a two-press armed corner link bottom-left (`⟳ RELOAD` → `⟳ TAP/PRESS AGAIN TO RELOAD`, 2 s), device legend
  bottom-right (hidden on touch). Focus rows: segs ⇅ tiles ⇅ reload; ←/→ moves tiles or flips a segment;
  Enter/A picks; Esc/B/Start resume; `R` restarts. While up: HUD top band + hints hidden, touch layer inert
  (`.touch-layer.under-overlay`), `#app.dim` on the canvas. In 240 ms (tiles rise with 0/40/80 ms stagger);
  resume fades out over 120 ms while the HUD fades back over 240 ms; restart / quit are a hard cut.
  Kinetic banners (CRASH!) stay crisp above the scrim (`.hud` stacks over `.overlay`; it takes no pointer
  events itself).
- **In-run HUD changes**: the floating hint strip is gone — one technique line shows during the countdown
  only (first authored hint, else `meta.technique`, else one device keycap pair) and is hidden at GO. The
  device pill shows only when the active device changes, for 1.5 s of sim time. Touch zone outlines drop
  to 30 % (55 % while held) 3 s after GO (`TouchInput.setSettled`), re-armed by every countdown. The
  top-right touch button reads "↻ Restart" (tap = checkpoint, hold = track).
- **Reload game**: on the portrait prompt (§11), the last row of the pause menu and the last row of Settings
  ("⟳ Reload game"; `hardReload` clears SW caches + sessionStorage and reloads with a cache-busting query —
  home-screen standalone mode has no browser chrome). Never top-right: the in-run top-right ↻ is restart and
  nothing else lives up there. The build stamp stays on the prompt, in Settings and under the menu badge.
- **Screen-change grace**: for 250 ms after any screen change the shell drops confirm/back/nav edges
  (`SCREEN_GRACE_MS`), so the key that changed screens never acts twice; taps are governed by the invariant
  above (`.live`), not by a timer.
- **Menu first**: `loadBackdrop` calls `DomHud.hideNow()` after `toMenu()` — HUD hidden with no fade and the
  countdown banner the backdrop load spawned retired — so neither the boot crossfade nor run → menu ever shows a
  HUD frame under the menu (`?harness=1` still builds zero screens). The menu is shown before the loader
  goes out, so it is already live when the loader lifts; the loader's "Key art" step prefetches the plate so
  the first frame after the loader is usually the still, not the scene.
- **Run → menu** (`quit`, from pause or the results panel): exactly the cold-boot path — `loadTrack(b1)`
  afresh (renderer `setTrack`: world rebuilt, particles / finish flash cleared, camera cut to the idle
  framing), `toMenu()`, HUD `hidden`, touch layer off (`.tz` outlines and buttons only render while the layer
  is `.on`, i.e. during a run). Re-arming the finished track in place (`startRun`) left its frozen finish state
  and the touch buttons under the menu (user screenshot, round 3).
- **Results**: the same frame as pause (`.results`, inside the HUD root): kicker `TRACK CLEARED · TIER`
  (green when a medal above bronze was earned), track name, `PB · TARGET` stats; headline centred in the free
  band — time 6.6 rem / 4.4 rem short, `✕ n FAULTS`, PB line (`−0:02.410 · NEW PERSONAL BEST` green /
  `+0:01.120 · BEST 0:34.230` / `FIRST CLEAR`), four medal discs (art via `DomHud.setMedalArt`, thresholds
  under each on desktop only); tiles `RETRY / NEXT TRACK / MENU` (NEXT disabled when the next track is locked
  or there is none — `App.nextTrackEnabled`, recomputed in `onResults` since the clear may unlock it; default
  focus NEXT when live, else RETRY). Staged, sim-clocked: title block 0 · time .15 · faults .35 · medals + tiles
  + scrim .35 at .6 · PB line + earned pop .9 s. Keyboard / pad once the tiles are up (`resultsInteractive`):
  ←/→ move, Enter/A pick, throttle *edge* = retry; Esc/Start = MENU from the line on; R / B / Backspace retry
  through the game's own restart edge at any time. Retry / next / menu are a hard cut.
- **Sound cues** (`src/ui/sfx.ts`): synthesised tick / confirm / back / launch through the audio system's
  `AudioContext` when it exposes one (single output graph), else a private context; obeys the Sound
  setting and volume; silent until the first gesture unlocks audio.
- **Tokens** (`src/ui/styles.ts` `TOKENS_CSS`): colours `--amber/--amber-2/--amber-ink/--ink/--ink-dim/
  --ink-mute/--bg/--slab/--slab-2/--slab-3/--line/--line-2` + medal colours; spacing `--s1…--s6` =
  4/8/12/16/24/40; radii `--r1…--r3` = 6/10/16; motion `--t1/--t2/--t3` = 120/240/400 ms with the single
  easing `--ease: cubic-bezier(.2,.8,.2,1)`; faces `--display` (Trials Display = Barlow Condensed 900
  italic) and `--font` (Trials UI = Barlow Condensed 500/700). Every front-end rule uses them.
- **Storage**: `trials.sound`, `trials.volume`, `trials.lastTrack` join `trials.quality`, `trials.ghost`,
  `trials.riderModel`, `trials.bikeModel`; Reset progress clears only `trials.best.*`.
- **Art manifest** (`src/ui/art.ts`, tested against the shipped pack shape): `art/manifest.json`
  fetched once at App construction; `{assets:[…]}`, an array, or an id map; an entry needs `kind` +
  `path|file|url` (`src` in the pack is the generation name, used only when it looks like a URL) and
  carries `track` / `tier` / `biome` / `medal` / `variant`. Every lookup is nullable and every image is
  decoded before it is applied, so a 404 or a missing manifest leaves the tinted fallback — never a broken
  image. Title-critical bytes: fonts 45 KB + key art 92 KB (`1x`) / 263 KB (`2x`) ≪ 2.5 MB; cards, medals
  and plates are only fetched when track select / results need them.
- **Caching**: `index.html` is served `no-store` (vercel.json `/` and `/index.html` rules; assets stay
  immutable-hashed) so a home-screen install picks up new builds on reload.
- **Phone**: `max-height: 500px` rules shrink the wordmark, list, cards and settings rows so each screen
  fits 844×390 above the fold; every target ≥ 44 px; safe-area insets on every edge; DPR crisp (DOM text).
- **Capture note**: with the free-running RAF, Playwright screenshots under SwiftShader take 1–30 s
  (machine-load dependent). The evidence scripts run the page on a virtual clock (RAF, `performance.now`,
  `setTimeout` advanced 100 ms per frame; CSS animations paused between frames via CDP
  `Animation.setPlaybackRate`) — `?harness=1` is unaffected (no RAF).

## 11. Orientation: rotate-to-play (forced landscape tried and abandoned)

Round 3 built **forced landscape** — on a coarse-pointer portrait viewport, `#app` laid out at
`{ w: innerHeight, h: innerWidth }` and turned 90° (`rotate(90deg) translateY(-100%)`), touch `clientX/Y`
mapped back through `toLogical` (`lx = py`, `ly = innerWidth − px`), safe-area insets remapped — so the game
would play under the iOS rotation lock. The user's verdict from the phone: *"too many bugs — the dismiss/swipe
edge is on the wrong side of the phone, screenshots come out portrait. Abandon it, go back to rotate-to-play."*
It is removed: nothing applies `html.forced-landscape`, there is no such CSS, and `applyOrientation`
(`src/ui/orientation.ts`) only sets the `html.short` / `html.narrow` layout classes from the viewport size and
returns the size the renderer uses. The mapping helpers (`toLogical` / `logicalRect`) remain as identity
utilities the touch layer and `spatialMove` route through (their rotated branch is unit-tested via a test hook
only).

- **Portrait prompt** (restored, `mountRotatePrompt`): wordmark, rotating phone glyph, "Rotate to landscape",
  the "⟳ Reload game" button, build stamp at 40 %. CSS-gated: `@media (orientation: portrait) and (pointer:
  coarse) and (max-width: 900px)`. Reload also lives as the last row of the pause menu and of Settings.
- Viewport units stay as the `--vw` / `--vh` tokens (`1vw` / `1vh`; harmless) and the phone rules stay
  class-scoped (`html.short` ≤ 500 px tall, `html.narrow` ≤ 720 px wide, set on every `fit()`), equivalent to
  the old media queries in every non-rotated case (verified 844×390 and 1280×720).
- The multi-touch gesture fix (§3) and the run → menu cold-boot path (§10) are kept.
- Native-style landscape lock is not available to a web app on iOS (no `screen.orientation.lock()` outside
  fullscreen video); if it is ever wanted again, the whole rotation lives in orientation.ts + one CSS rule.

## 12. Loading screen (`src/boot/**`, `index.html`, `vite.config.ts` `trials:load-manifest`)

> **Progress is the boot sequence's own declaration of work done over work declared, and the loader can
> only display it.** (project/archive/loading-progress-invariant.md — the seven-incident review that led here.)

Two numbers, DOWNLOAD and SETUP (the user's decision: "B Odometer" with both tracks kept, `assets/design/loading/SPEC.md`
§B), each an arithmetic identity over one typed table, each non-decreasing by construction and each exactly 1 when
`done()` is called — not by policy, by `Σx/Σx`.

- **The plan** (`src/boot/plan.ts`, `createBootPlan`). `steps.ts` declares every await of the boot once:
  `STEP_INFO` (17 keys in run order, label + SETUP weight; `core` weighs 0), `BYTE_INFO` (the three DOWNLOAD
  sources — `core`, `heroModels`, `bootArt` — each with the step whose completion *closes* it), `PREPARE_STEPS`
  (the eight the renderer runs), `AFTER_KEYS` (background items: key art, per-track art).
  `setup = Σ w·f / Σ w` where a step's `f` is 1 once its `work()` resolved (finishing IS reporting), its clamped
  monotone sub-progress `done / (total + 1)` while running (completion is the last unit, so a running step never
  reads complete — no "100 % but not done"), 0 before. `download = Σ credited / Σ total` over byte sources whose
  totals are declared before the first byte; `credited` grows only by the deltas the reader that reads the bytes adds
  (`plan.reader(key).add(n)`) and becomes `total` when the closing step completes. `done()` requires every step
  complete and throws otherwise, so both sums are 1 by arithmetic; nothing is reclassified, capped, timed out or
  flagged "needed" — a source is in the number because it is in the table, complete because its step is.
  `Math.max(prev, next)` on both published fractions is the assertion that no later edit can make the screen run
  backwards; the property test proves the arithmetic never needs it.
- **Exhaustive by type.** `Plan<Remaining>`: `plan.step(key, work)` returns `Plan<Exclude<Remaining, key>> & { value }`,
  and `done` is typed `never` until `Remaining` is `never` — a step dropped from `main.ts` is "This expression is not
  callable"; a repeated step is "not assignable". The renderer's eight steps are delegated (`delegate(plan,
  PREPARE_STEPS, body)`): `prepare(run)` receives a `StepRunner<PrepareStep>` that accepts only those keys, and the
  delegate throws if it resolves with any of them incomplete (runtime; the property test covers it). There is no
  reporter field to rebind (incident (a)): a `StepProgress` is bound to its step and ignores reports after completion.
- **Bytes come from the reader that reads them.** The inline script streams the core set (entry, three, CSS, fonts —
  the list and its byte total compiled in by the build) with a `ReadableStream` and adds each chunk; the art library's
  own read loop (`readBlob`, `src/render/art/library.ts`) adds each chunk of the boot set; three's `FileLoader`
  `onProgress` adds the hero glTF bytes (`loadGltf(url, quiet, bytes)`). Both needed downloads start in the renderer
  constructor (`heroBytes`, `artBytes` options) so they run under every boot step. Resource Timing,
  `PerformanceObserver('resource')`, `byTail`, `take()`, buffer sizing, the `need` map and the done-time
  reclassification are gone; the long-task observer stays only to put a red mark on the step's row in the log.
- **Declared totals from the build.** `trials:load-manifest` walks `public/` and writes `src/boot/plan.generated.ts`
  (`PUBLIC_BYTES`, literal keys: models by path, art by `art:<id>`; committed, deterministic, regenerated every build /
  dev start). `src/boot/totals.ts` sums it through `HERO_URLS` + `lodUrl` (`src/render/hero/urls.ts`) and `BOOT_IDS`
  (`src/render/art/boot-set.ts`) — typed lookups, so a renamed glb or a dropped art id fails `pnpm typecheck`. The
  plugin computes the same two sums for the inline (`__BOOT_TOTALS__`; `totals.test.ts` holds them equal) and compiles
  the core list (`__BOOT_CORE__`) and the sha (`__BOOT_BUILD__`; a production build with no sha fails rather than
  stamping `dev`). `dist/load-manifest.json` is still emitted — it is the service worker's precache list, not the loader's.
- **Caps became decisions.** The boot art set and the hero glTF are *needed*: steps `bootArt` / `heroModels`, awaited
  with no cap. Key art and per-track art are *background*: `plan.after(key, done, total)` items rendered under
  "Streams in after start", never in a number, and there is no flag that could promote one. Fonts: `document.fonts.ready`,
  no timeout (the files are in the core set already). No `setTimeout` race decides whether any step is done.
- **The inline loader is TypeScript** (`src/boot/inline.ts` → bundled by esbuild through the plugin into
  `<script id="boot">`, ≤ 8 KB minified, asserted by the build; 8.2 KB today). It paints with the first HTML bytes
  (markup + CSS in `index.html`, system font, no art), creates THE plan, runs `core` and starts `evaluate` (script
  parse + evaluate — it ends when `main.ts` calls `takeBootPlan()`, `src/boot/handoff.ts`), then `main.ts` continues
  the same plan object: renderer · physics · audio · game · front · track · [heroMeshes · lighting · postChain ·
  materials · heroModels · bootArt · shaders · firstFrame] · fonts · `done()`. `?harness=1`: loader removed, entry
  inserted, no plan (the harness owns the clock). Dev server: same script with an empty core list.
- **The renderer** (`src/boot/render.ts`, `createLoaderRenderer`) is a dumb painter of `ProgressView`: wordmark badge
  (the Broadcast plate) with the build sha; two three-quarter-ring gauges with drum digits (three columns of 0–9,
  translated one way only), DOWNLOAD amber / SETUP blue; one live line each (`core bundle · 729 KB / 1.53 MB`;
  `World textures · dirt 512² 1/11 · 41 %`); done steps folded into `✓ 12 of 17 done`; the full row log (one row per
  step key, ms when done, `after` rows with ↓, never ✓) inside a native `<details>` closed by default; error text +
  Retry replaces the live line. Percentages are `Math.floor(× 100)`: 100 exactly when the fraction is 1, never a
  rounded 99.6. The digits move only when a number changes; the footer clock is the only thing on a timer. It
  publishes what it painted as `#loader[data-download]`, `[data-setup]`, `[data-done]` for the tests.
- **Tests.** `src/boot/plan.test.ts` — the invariant as a property over 3 000 random event sequences (starts in any
  order, sub-progress with restarts / total 0 / NaN / negative / late, byte deltas of any sign, `after` noise):
  both fractions non-decreasing at every published view, `setup` < 1 until the last weighted step, both exactly 1 on
  `done()`, `done()` throws while a step is open, a delegate that skips a key throws, `after` never moves a fraction
  (identical fraction sequences with and without them). `src/boot/render.test.ts` (jsdom, the real `index.html` markup)
  — integers only, 100 only at fraction 1, lines and count follow the view, `after` rows never done-styled.
  `harness/e2e/boot.mts` (`pnpm harness:e2e --only=boot`) — headless boots of `dist/` at LTE (12 Mbps / 70 ms) and 3G
  (750 kbps / 100 ms) × service worker absent / installed (second load) × art pack present / absent (a copy of dist
  with `art/` renamed), sampling the painted integers every 50 ms: B1 non-decreasing; B2 100/100 and `data-done` on
  the last sample before the loader leaves; B3 the stuck detector — DOWNLOAD unchanged for > 2 s of live page time
  while ≥ 64 KB of the bytes it counts arrived at the browser (CDP `Network.dataReceived`, a test instrument), and a
  5 s nothing-moves hang rule; B5 no page error, no ✓ on an `after` row. "Live page time" is the loader's own footer
  clock, so a main-thread freeze (SwiftShader's WebGL context, the first track) is reported, not judged — a frozen page
  paints nothing, so nothing on it can lie. Leave time and time-to-DOWNLOAD-100 are reported (headless numbers are
  SwiftShader's; the phone clip is the phone's). Three stills (portrait 430×932) at SETUP ≥ 20 / 70 % and at 100/100 in
  `harness/out/boot/`.
- **Known costs, not lies** (measured in the boot e2e): the two heroes load sequentially in `setModels`
  (`src/render/index.ts`, render's), and menu / key / track art (`after`) share the link with the needed bytes — on a
  throttled LTE the needed 3.6 MB get roughly half the bandwidth. Both are wall-time work for their owners; the number
  is honest either way.

## 13. Garage and the two bikes (wave 1, MEGA_PLAN P1/P4)

- `BikeClass = 'rookie' | 'pro'` lives in `src/core/types.ts` (`BIKE_CLASSES`, `DEFAULT_BIKE = 'rookie'`).
  Physics owns the presets (`BIKE_PRESETS`, physics round 11) and takes the class at
  `loadTrack(track, seed, { bike })`; the game passes `Game.currentBike` on every load (`Game.setBike`
  reloads the world in place while nothing races — menu backdrop, countdown — so the Garage preview and the
  countdown show the chosen bike). The ghost world loads with the PB recording's own `header.bike`.
- **Garage** (`src/ui/garage.ts`, main menu item between Play and Settings, note = current bike): two cards
  (`BIKE_SPECS`: name, one-line character, stat strip power / grip / weight feel, rule note; Rookie amber,
  Pro `--blue`; art round 2: `bikeArt(class)` render at the top of each card, `garage-plate` masked behind the card column; track cards prefer `trackThumb` real renders, credits sit on `results-credits`) on the left, the live 3D bike on the right is the preview (`#app.garage canvas` scales the
  idle camera 1.25× and carries the bike right of the cards; **`Game.loadTrack` calls
  `renderer.setBikeClass?.(bike)` on every load** — garage preview reload, track launch, `hook.setBike` +
  `loadTrack`, a replay's `header.bike` — so the render round-11 liveries (Rookie blue / plate #7, Pro
  charcoal / plate #1) follow the class everywhere; a renderer without the method keeps its default and the
  card tint carries the colour. `App.play` also signals `onBikeChange` on every launch). Focus previews
  (`previewBike`, the backdrop reloads with that class), confirm commits (`trials.bikeClass`), Esc previews
  back to the committed class.
- **Copy = physics v2 R3** (physics.md "v2 status — R3"; `BIKE_SPECS`): Rookie — *Never loops at neutral.
  Forgiving landings, 0→16 in 4.0 s, tops 20 m/s.* / note *Loops only leaning back · standard medal targets*;
  Pro — *Loops at neutral under full gas in ~1 s. 21 m/s, sharper throttle, higher hop.* / note *Raw · medal
  targets 10 % tighter*. The old "wheelie assist" wording is gone: v2 has no assist, the Rookie's 0.15 s
  throttle filter is what keeps the launch kick from lifting the front. **Balance hint** (`BALANCE_HINT`):
  *Wheelie balance point: ~50° at neutral · lean back and it moves to 69°, forward to 24°* (the R3
  coasting-balance row, lean −1 / 0 / +1) is shown exactly twice — the garage header (`garage-tip`, hidden on
  `html.short`) and the first-run card (`ob-tip`) — never floated during play.
- **Default rule** (`defaultBikeForTier`, tested): beginner / easy → Rookie, hard / extreme → Pro, medium →
  the last bike ridden this session (else Rookie). The default applies only until the player has picked once
  in the Garage; a stored choice persists across every track.
- **Medal targets per class** (`targetForBike`): Pro rides against `0.9 × meta.targetTimeS`
  (`PRO_TARGET_SCALE`); `RunResult.targetTimeS` is the effective target and `RunResult.bike` the class.
  The results stats line reads `PB · TARGET · BIKE Rookie|Pro`; the NEXT TRACK tile carries the next track's
  name (`DomHud.setNextEnabled(on, name)`).
- **PB per bike class per track** (`src/ui/best.ts`): Rookie keeps the legacy key `trials.best.<id>` (pre-garage
  PBs read back as Rookie), Pro is `trials.best.<id>@pro`. `BestTimes.get(id, bike)` is that class's entry
  (ghost, splits, PB delta); `get(id)` is the track's best across classes — higher medal, then time — which is
  what cards, tier locks and the career line read. Cards show a `Pro` tag when the best is a Pro PB.
- Recording header gains `bike?: BikeClass` (`RecordingHeader`); `runRecording` loads the header's class.
  `hook.info().bike` reports the class, `hook.setBike(b)` picks it (harness: Pro runs).
- Locked track cards state the rule on the card itself (`Locked · medal every <prev tier> track`), not only in
  the row head.
- **Onboarding** (`src/ui/cards.ts` `OnboardingCard`): first launch only (`trials.onboarded`), shown over the
  first countdown with the game paused — gas / brake / lean in the active device's vocabulary, the no-hop-button
  line, one button. Any confirm / back / gas edge dismisses it.

## 14. Telemetry (local run log) and `?perf=1`

- `RunTelemetry` (`src/core/types.ts`): `{ at, track, bike, attempts, faults, physics, time, timeToClear, medal,
  deaths: [{ x, reason, checkpoint }], device, quality, qualityWhy, fps: { p50, p95 }, frameMs: { p50, p95 },
  build }` — `physics` is the solver stamp (`'v2'` from the flip on, `'v1'` under `?physics=v1`; absent in
  entries logged before core round 7 = v1), so a phone session's `attempts` per track read against the
  solver they were ridden on. **Copy run log** runs `navigator.clipboard.writeText` synchronously inside the
  button's click handler (the JSON is built before the first `await`), which is what iOS Safari's
  user-gesture rule needs; the hidden-textarea `execCommand('copy')` fallback sits in the same handler. `RunLog` (`src/game/telemetry.ts`) appends one per finished run to `localStorage['trials.runlog']`,
  bounded to 200 entries; `RunCollector` gathers the run (deaths at the fault tick's bike x, frame-time
  percentiles over the run, the quality tier and why). `timeToClear` = wall seconds from the first GO on that
  track load to the results panel (full restarts stay inside the window; launching another track abandons it).
- Default ON; Settings → **Run log** On/Off (`trials.telemetry`), **Export run log** Copy (clipboard JSON,
  `{ kind: 'trials-runlog', v: 1, build, exportedAt, runs }`) / Share (Web Share API text — iOS share sheet;
  the button is hidden where `navigator.share` is absent). Nothing leaves the device otherwise.
- `?perf=1` (`src/ui/perf.ts`, **§ perf overlay**): a monospace box top-left under the pause button: `FPS · frame
  ms p50/p95`, `PHYS µs/tick p50/p95` (`Game.perfTiming` times each `physics.step` only with the flag on —
  no per-tick `performance.now` otherwise), `DRAW calls · tris · MB tex` from `stats()`, `TIER · dpr · why` (the
  governor's last decision string, `App.qualityWhy` — `governor start high (held last session)` / `governor ↓ medium
  (p95 38.1 ms, drops 21 %)` / `governor ↑ high (p95 12.0 ms held 8 s)` / `manual (settings)`), then three `RENDER`
  lines from the renderer's `debugInfo()` scalars (`Game.rendererDebug()`, core round 13): `tier · deviceClass/profile ·
  dpr · canvasW×H`, `calls · tris · rt Mpx · passes · shadow`, `hero tris · skipped (frames not drawn) · stale (programs)
  · entry ms` with ` (holding)` while the countdown waits on the track entry (§ entry hold). **Dirty-checked**: the
  sample is taken every `PERF_PAINT_MS` = 500 ms and the `<pre>` is written only when the text changed, so ≤ 2 DOM
  writes/s (`PerfOverlay.writes` counts them; `perf.test.ts` pins the lines). `hook.info()` carries the same values —
  `render` (the scalars), `qualityWhy`, `quality`, `entryHold` — so a headless run asserts them; the e2e `entry` flow
  checks the field set and that the overlay text changed ≤ 2×/s over the ride. Hidden under pause / results / menus.
  Headless note: `--disable-frame-rate-limit` makes RAF fire back-to-back so headless FPS reads are not evidence;
  the phone capture (WebKit iPhone 14: 60 fps, 16.6 / 18.7 ms, PHYS 20 / 60 µs at 5 µs resolution) is.
- `?bench=1` (`src/game/bench.ts`; how the user runs it: `docs/device/README.md`) — the on-device benchmark (Rider on
  Glass G2). A START card over the menu (the tap unlocks audio), then eight scenarios with no input, 20 s each after a
  2 s settle: `menu` (canvas covered, render off), `garage`, `b1 start line`, `b1 ride` (the committed bot-3 golden
  through `Game.startPlayback`; served from `public/bench/b1-bot-3.json`, a copy `bench.test.ts` holds equal to
  `harness/inputs/b1-first-ride/bot-3.json`), `b1 ride` at low / medium / high forced, `b1 ride` at cap 60.
  `&quick=1` = menu + garage at 3 s (the e2e). Toggles honoured inside the same list so runs compare row for row:
  `&no=audio` (skip `audio.update`, suspend the context), `&no=hud` (no HUD DOM writes), `&no=render` (skip
  `renderer.render`), `&no=touch`, `&cap=60`. Per rendered frame the app records `FrameSplit` — `App.tickFrame` is
  bracketed into poll / advance / other and `Game.render` into prep / hud / audio / submit (`Game.lastRender`,
  `Game.lastAdvance`: four `performance.now()` calls each, a reused object, no allocation) — plus every RAF
  callback's interval (the display's cadence, 120 on ProMotion), long tasks (`PerformanceObserver`, Chrome only),
  heap (Chrome only). Per scenario: fps, fps first / last 5 s (the thermal proxy, quoted for `b1 ride · high`),
  dropped (> 1.5 × the cap period), worst, p50 / p95 / max of the interval and each leg, `debugInfo()` scalars
  (tier, dpr, canvas, calls, tris, rtMpx; calls / tris 0 when nothing rendered). The report (`BenchReport`, `kind:
  'trials-bench'`) is shown as a table in the game's face with **Copy report** (`src/ui/clipboard.ts`, the same
  gesture-safe path as the run log) and **Share**, as one string = markdown table + a fenced JSON block
  (`formatReport`), appended to `localStorage['trials.benchlog']` (last 10) and exported with the run log as
  `bench`. `window.__trials.bench = { start, state, report, text }` drives it headlessly; `pnpm harness:e2e
  --only=bench` proves the instrument (the START tap, both scenarios, the panel, Copy `.live`, every field, the
  toggles changing the split), `--only=benchfull` runs all eight once. The FPS meter stays up throughout; a status
  line under it (two dirty-checked writes per second) shows scenario / tier / cap / seconds.
- Frame cap cadence (`src/game/cadence.ts`, `FrameCadence`): the RAF loop renders when `now >= nextDue − slack`
  and then `nextDue += period` — phase-locked, so a frame that overruns its slot is followed by an early one and a
  30 cap holds 30 on a 60 or 120 Hz display; slack = half the measured RAF interval (EMA) so a due time between two
  slots takes the earlier; more than two periods behind (tab hidden, a long task) resyncs to `now` instead of
  bursting. The old rule (`now − lastRenderAt >= period − 2`) re-based on whatever late slot it landed on and lost a
  slot for good each time (`cadence.test.ts`: the same overrun pattern gives 300 vs < 290 frames in 10 s).

## 15. PWA: manifest, icons, service worker, update toast

- `public/manifest.webmanifest`: `standalone`, `orientation: landscape`, `background #07080a`, `theme #0b0d10`,
  icons from the art owner's `public/art/icons/` (`icon-192/512/1024` any, `icon-maskable-192/512`), `og.jpg` as
  the wide screenshot. `index.html`: `<link rel=manifest>`, `apple-touch-icon` (180), SVG + 32/16 favicons,
  `apple-mobile-web-app-title`, OG / Twitter card metas pointing at `https://trials-gauntlet-demo.vercel.app/art/og.jpg`.
- Service worker source is `src/pwa/sw.js`; the `trials:pwa` Vite plugin emits `dist/sw.js` with the build id
  baked into the cache name (`trials-<sha>-<stamp>`), so every deploy is a byte-different worker. Install
  precaches the load manifest's `core` + `title` phases (+ index, manifest); fetch is cache-first for
  `/assets/*-<hash>.*`, fonts, art, models; network-first with cache fallback for `index.html`,
  `load-manifest.json`, `sw.js`, the web manifest; `?harness=1` requests and cross-origin are untouched.
  `activate` drops every other cache and claims clients.
- Registration (`src/game/pwa.ts`) only in production builds, never in harness mode, `?sw=0` opts out; it
  re-checks on every return to the foreground. A worker that reaches `installed` behind a controlled page →
  `App.showUpdate(reload)` → the **Update available → ⟳ Reload** toast (`UpdateToast`); Reload posts
  `SKIP_WAITING`, `controllerchange` reloads once. `?updatetoast=1` shows the toast for QA. Verified
  end-to-end against the frozen preview: install → 54 precached entries → controlled after reload → byte-different
  `sw.js` → toast → Reload → new worker active, old cache gone.
- Storage keys added: `trials.bikeClass`, `trials.telemetry`, `trials.runlog`, `trials.onboarded`,
  `trials.best.<id>@pro`. Reset progress clears `trials.best.*` (both classes) only.

## 16. Replay viewer (wave 2, MEGA_PLAN P4)

- **Entry**: results panel → fourth tile `WATCH REPLAY` (disabled when the run has no recording); track card →
  the PB tag reads `PB ghost · ▶ Watch` (click, `V`, pad Y) and plays the stored PB. `window.__trials.replay`
  (`open(json?)`, `seek(tick)`, `info()`, `close()`) and `__trials.lastRun()` drive it headless.
- **Playback = the live `Game`** (`src/game/game.ts` `startPlayback / seekPlayback / stopPlayback`): the
  recording is the player — `tick()` takes `frames[runTicks]` as its input, so restart taps, crashes, the
  auto-respawn and the finish coast reproduce through the same code as live play. `publishResults` is a
  no-op in playback (nothing stored, logged or shown); the HUD timer / faults / strip read the replayed run.
  **Scrub = re-simulation**: `seekPlayback(n)` rewinds to GO (`resetToGo`: the same `physics.reset(-1)` as
  `go()`) and steps n ticks — ≈ 3 µs/tick, ghost world included, never interpolated. Test: hashes equal the
  live run at every 100 ticks and after seeks in any order (`game.test.ts` "replay viewer playback").
- **Ghost**: the PB rides alongside unless the recording *is* the PB (`isPb`), and the ghost world is reused
  across seeks (`ghostSource`; `GhostRunner.seek(0)`), so a scrub never rebuilds a world.
- **Transport** (`src/ui/replay.ts` `ReplayBar`, `src/game/replay.ts` `ReplaySession`): play/pause, restart,
  scrub track (pointer capture; live seeks while down, paused meanwhile, resumes on release), `¼× ½× 1×`
  (`Game.playbackSpeed` scales the wall seconds fed to the loop), cameras, exit. Keyboard: Space/Enter
  play-pause, held ←/→ scrub at 2.5 s/s, ↑/↓ speed, `V` camera, `R` restart, Esc/Backspace exit; pad: A,
  stick/d-pad, Y, B. Scrub re-simulations are muted (`App.replayMuted`) and their banners dropped
  (`Hud.clearBanners`). The replay ends when the finish coast has settled (1 s past the brake ramp): playback
  pauses, the play button reads ↺.
- **Cameras**: `game` (the rig as is), `follow-wide` (a full-track `CameraKey` with `zoomBias: 0.4` — more
  puts the camera at the hall's roof / z clamp, 30 m out, where the fog washes the frame), `fixed` (the rig's
  `bounds` clamped to the camera's current x/y; when `bikeScreenX` leaves [0.06, 0.94] the clamp releases for
  one frame and re-locks — a cut, like TV coverage). Both drive the rig's public `bounds` / `setKeys` through
  `renderer.debug.rig`; a renderer that exports `setCameraOverride(o | null)` (`CameraOverride` in types) is
  preferred when present — request to the render owner.
- **Exit** restores what it interrupted: from results, the finished run's physics snapshot + game counters
  come back and the results panel re-shows (`App.replayReturn`); from a card, the menu backdrop and track
  select. **Last run**: `Game.lastRunRecording()` (every finished run, PB or not) is stored per track in
  `trials.lastrun.<id>` (`LastRuns`, `src/ui/best.ts`); Reset progress leaves it alone.

## 17. Physics lab HUD, input trace, physics switch

- **Lab** (`lab-*` tracks or `?lab=1`; `src/ui/lab.ts`, physics-v2.md §15): bottom-right monospace panel (the bike rides at x ≈ 30 %; the left third stays clear) —
  pitch / rate / speed / rear slip, compression %, COM (`rider.lean` / crouch), hop phase, airtime, attempt
  (`1 + faults`); gauges: rear / front compression with the bump-stop zone (`tuning.stopStart`, default 0.8)
  marked, `τ_att` signed bar, gas / brake bars, balance bar `d/h` vs `a/g` (red once a/g passes d/h),
  **R3 servo rows** `INTENT` (`debug().rider.intent`, 0..1 — 1 while the pose target itself is moving, i.e. a
  hop's snap gets F_max both ways; 0 while a pose is held, a landing absorbs at 0.3 F_max; magenta above 0.5)
  and `LEG` (`rider.legLen` m · `rider.legFrac` % of F_max the leg length allows), a side
  schematic with the COM dot and pose-target (hollow) vs body (filled) markers; last-hop stats held 3 s after
  a landing; a 3 s trace of pitch (±90°) and both compressions. Samples come per tick from `Game.tickTap`
  (120 Hz, rings), drawn decimated ×2 at ≤ 30 Hz; the text repaints at 10 Hz. `debug()` fields (`attTorque`,
  `poseTarget`, `comDH`, `lastHop`) are read defensively — missing = grey gauge. **Ghost of the last attempt**:
  in lab mode the ghost slot shows the previous attempt from its own spawn (`GhostRunner` with an
  `AttemptSource`), started when the live bike respawns; the PB ghost is not shown on lab tracks.
- **`?trace=1`** (`src/ui/trace.ts`): three bars under the timer (gas amber, brake red, lean bipolar) fed
  `Game.effectiveInput()` each frame; hidden under pause. **Telemetry**: every death now carries `trace` —
  the last ≤ 120 ticks of quantized input before the fault, RLE like a recording (`Game.recentInput()`,
  `DeathRecord.trace`), so a run log reads back as technique failures, not just x positions.
- **`?physics=v1|v2`** picks `createBikePhysicsV1` / `createBikePhysicsV2` from the physics barrel when
  exported (else `createBikePhysics`, which is **v2** since the R3 flip); `?dev=1` shows a Physics row in
  Settings that reloads with the choice and states the live solver in its subtitle (*Live solver: V2 · dev
  A/B — reloads the page*; the Default option reads *Default (V2)*). `hook.info().modules.physics` names the
  factory used (`createBikePhysicsV1` under `?physics=v1`). PBs and ghosts are per solver — see §8.

## 18. Local per-track leaderboard (MEGA_PLAN P4; `src/ui/best.ts` `BestTimes.board / record`)

- **Store** (additive; the PB entries and every reader of `get()` are untouched): `trials.best.<trackId>#board` and
  `trials.best.<trackId>@pro#board` hold `BoardEntry[]` = `{ time, faults, medal, at }` (ISO finish time, `''` for a
  seeded row), fastest first, ties by fewer faults, at most `BOARD_SIZE` = 5. The key sits under the best-times prefix
  so **Reset progress** (`clearAllBest`) wipes it with the PBs; a corrupt value reads as an empty board. A track with
  a PB from before the board existed shows that PB as its one row (seeded on first read), so old progress is never a
  blank board. Nothing leaves the device: no network, no identity.
- **Recording**: `Game.publishResults` offers every clear to `bestTimes.record(track, result)` (optional on
  `BestTimeStore`) *before* it stores a new PB — the seed must still be the previous PB — and writes the 1-based
  place into `RunResult.rank` (null when outside the top 5 or without a store).
- **Results panel** (`DomHud.renderBoard`, `.results .board`, top-right of the title band, revealed with the medals
  at stage 3): `TOP 5 · ROOKIE · #2`, rows `n · medal dot · time · faults✕`, this run's row marked `.you`. The HUD gets
  the source as `new DomHud(ui, bestOf, (id, bike) => bestTimes.board(id, bike))` (`main.ts`).
- **Track card** (`TrackSelectScreen.boardHtml`, `.tcard .board` — the focused pin's card): the class the next launch rides
  (`FrontState.bikeClass`) as up to five medal-coloured chips `1 0:42.36 · 2 0:44.10 …`; hidden when the board is empty;
  lab cards carry none. There is no Watch popover on the card (the `▶ PB` tag opens the replay viewer directly), so no
  "your runs" list was added there; the `LastRuns` store (§16) still holds the last finished run for the viewer.
- Tests: `best.test.ts` (ranking, per-class boards, persistence, the PB seed without a duplicate, ties, reset, corrupt
  data); the shape is asserted by the desktop / run e2e through the results panel's `.board` rows.

## 19. Desktop proof (MEGA_PLAN P3 amendment; `harness/e2e/desktop.mts`, `pnpm harness:e2e --only=desktop`)

Desktop is a target too: the suite runs the same screens as the touch flow at **1280×720 and 1920×1080** in a
desktop Chromium context (no touch, fine pointer) twice — a **keyboard** flow (real `page.keyboard` presses: menu →
tracks → run → crash → restart → finish → results → next; Esc pauses / resumes) and a **gamepad** flow with a
synthetic pad: Playwright cannot emulate one, so the harness defines `navigator.getGamepads` to return a scripted
`Gamepad` (standard mapping; A confirm, B back / restart, Start pause, RT gas, d-pad nav) the way the live-keys instrument
injects keys, and edges it through the app's own poll. Asserted: the expected single front screen after every
transition and none during a run, the legends carry keyboard `<kbd>` glyphs / pad `.pad` glyphs for the active device
(front screens, pause, results), the touch strip / layer is never `.on` on desktop, faults / clock / phase per step. It
is part of the default `pnpm harness:e2e` list (front / run / entry / hitrects / grid / bench / boot / desktop) and the
ship gate's e2e row.

## 20. Audio hooks (audio round 3, additive)

`Game.loadTrack` calls `audio.setBike?.(bike)` after the renderer's `setBikeClass` (every load path: launch, garage
preview reload, replay header, `hook.setBike`); `App.setAudioScene` calls `audio.setScene?.(scene)` deduplicated —
`menu` from `goto()` (every front screen), `run` from `play()`, the replay viewer, and the `countdown` / `riding` phase
inside a run (retry / next out of the results), `results` when `onResults` fires. Both are optional on `AudioSystem`;
`NullAudio` and older systems are no-ops.

## 21. Level reviewer (core #10; `src/game/review.ts`, `src/ui/review.ts`, `harness/e2e/review.mts`)

The user's ask: "go into the level and kind of play it, see it, jump around, pan around, and then annotate comments on
the segments of the level — break each level up into six segments, let me annotate comments on the segments, and let
you iterate and rebuild the levels." It is a **first-class screen, not a URL**: a top-level **REVIEW** tab on the
Broadcast menu (PLAY · GARAGE · REVIEW · SETTINGS · credits; the five tabs step the tab font down one notch so they fit
at 844 px, every tab still ≥ 88 × 44) opens the **level picker** (`ReviewPickScreen`, `.review-pick-screen`: one row per
track — curriculum, playgrounds `p<n>-*`, lab — with its tier, id and `n / 6 noted`), and a row opens the **review UI**
(`ReviewPanel`, `.review-ui`) on that track. ‹ Tracks returns to the picker, ‹ Menu to the menu, all through `goto` /
the `.live` rule. `?review=<track>` deep-links to the same UI (the e2e uses it); nothing hides behind `?dev=1`.

**The world under it.** `ReviewSession.open` loads the track and calls `Game.setParked(true)`: the `countdown` phase
with the entry hold pinned — physics steps with neutral input, nothing counts (no faults, no run clock, no 3-2-1), the
HUD is off (`Hud.setReview`). The bike is the **probe**: it is parked at the segment start (`Game.teleportBike(x)`: rear
wheel on the authored profile, angle from the local slope, at rest, on the v2 world's `teleport`) and re-pinned every
frame, so a tick inside an obstacle or a slope never moves it.

**Camera, honestly.** The renderer has no free-camera hook (`GameRenderer.setCameraOverride` is still unimplemented), so
"pan" moves the probe and the rig follows it — that is why the world must be held rather than paused: the rig smooths in
sim time, and a paused world (dt = 0) never moves the camera at all (a > 6 m teleport is a hard cut; small ones froze —
the first e2e run caught it). Zoom drives the rig's public `setKeys` (one full-track `CameraKey` with `dist` 5–34 m)
through `renderer.debug.rig`, the replay viewer's seam; the track's own keys are restored on exit. **Vertical pan is not
offered** — it needs the render hook. One finger / mouse drag pans along the track (1.1 × dist metres per view width),
pinch / wheel / −+ zoom, **FLY** advances the probe at 8 m/s to the finish, **RIDE** starts a run at the probe (GO, no
countdown, the strip enabled, the HUD back) and a crash's respawn or R returns the bike to the segment start; **PARK**
(the same button) holds the world again where the bike is. Keyboard: held lean pans, ←/→ jump a segment, Enter =
ride / park, V = fly, Esc = back to the picker.

**Six segments.** `reviewSegments(def, placed)`: a playground's `meta.segments` (`segmentsOf`), else the ship table
(`SHIP_SEGMENTS`, `src/tracks/segments.ts`: six labelled beats per curriculum track), else six equal x-ranges start →
finish. Each segment counts the compiled `placed` kinds inside it (most frequent first) — the notes card shows them under
the label and range. The strip along the top (1–6, 44 px, tap to jump, the current one amber, a green dot on noted ones)
and the card (bottom-left, ≤ 40 % of the width, two-line kinds on short phones) never cover the track centre; the toolbar
sits bottom-right (Notes · Fly · Ride · − · +).

**Annotations.** Per segment: rating 1–5 (★, tap again to clear), quick tags `too hard` · `too easy` · `boring` ·
`unreadable` · `camera` · `asset missing` · `fun`, a comment box (the keyboard input ignores editable targets — before
this, typing `a d w s r space` in the box fed the game). Saved to `localStorage` `trials.review.<track>` → `{ [i]:
{rating, tags, comment, at} }` on every tap / 400 ms after typing / blur / segment change; empties are dropped. **Copy
review** puts one string on the clipboard (`copyText`, iOS-safe): a markdown table, then the JSON in a fence —
`{track, name, build, segments:[{i, from, to, label, rating, tags, comment}], at}`; **Share** goes through
`navigator.share` when present. The parent files it under `docs/reviews/levels/<track>.md` and re-authors from it.

**Harness.** `window.__trials.review` = `{open, close, active, view, jump, pan(m), zoom, fly, ride, export}`;
`pnpm harness:e2e --only=review` (phone 932×430 + 844×390, desktop 1280×720): the REVIEW tab is on the menu and the five
tabs fit → picker rows with `n / 6 noted` → First Ride → six buttons, tap 4 → segment 4 current, in range, titled → rate
4 ★, tag, type → the strip's noted dot → Copy → the clipboard's JSON (`segments[3]`) carries the note → localStorage →
a finger drag moves the probe and the camera (+x for a leftward drag) → FLY advances → RIDE drops the bike at the probe
(< 3 m) and 1.5 s of held gas moves it → PARK → ‹ Tracks (the row now `1 / 6 noted`) → ‹ Menu → `?review=` deep link;
desktop: mouse drag pans, wheel zooms, Esc leaves. `--only=` takes a comma list (`--only=review,front,run`).

**Owed to render.** `setCameraOverride({mode:'free', x, y, dist})` — with it the probe stays parked where it is, the
drag pans both axes, and the world can be paused for real; `src/game/review.ts` switches on the hook's presence the way
`src/game/replay.ts` does.
