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
| `finished` | steps with the frame minus `restart` (bike keeps rolling under the results) | frozen at the finish tick | restart tap → full restart (`countdown`) |

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
after the finish. Medal vs `meta.targetTimeS` (T): platinum ≤ 0.85·T & 0 faults, gold ≤ T & ≤ 1 fault,
silver ≤ 1.25·T & ≤ 5 faults, bronze = finished. Best time per track in `localStorage`
(`trials.best.<trackId>` → `{ time, faults, medal }`).

**Faults / attempts.** `faults()` = count of `fault` events (every reason, manual restart included).
`attempts = 1 + faults`. Reset to 0 only by a full restart. **Timeout**: none in the game layer; physics
may emit it.

**Pause.** Esc / Start / the touch pause button (top-left) open the menu overlay and stop ticking (`paused()` is a flag,
`phase()` is unchanged; the run clock is tick-driven so it stops with the ticks). `visibilitychange` →
hidden pauses. Harness mode never pauses.

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
Zone outlines fade in on first touch and stay at ~35 % opacity while touch is the active device; the HUD top band and hint strip shift to clear the two touch buttons.

## 4. HUD (`src/ui/`)

Layout constraints: nothing over the bike's usual screen position (x ≈ 30 %, y ≈ 55 %); all text
crisp at DPR 1–3 (DOM/CSS, no canvas text), min 12 px at phone width, 1 rem = clamp(13px, 1.25vw + 4px, 18px).

- **Top centre**: run timer `mm:ss.mmm` (tabular numerals, 2.6 rem, heavy italic) with the fault
  counter in a pill to its right (`✕ n`; flips orange for 0.3 s on the respawn frame, not the fault
  frame — Evolution rule). Frozen and turned green at finish; a PB delta appears under the timer.
- **Top right**: checkpoint progress strip (Rising) — marks from `track.checkpoints`/`finishX`, rider
  pin from `bike.pos.x`, passed marks fill.
- **Top left**: track name · tier, active device glyph (fades after 1.5 s of idle).
- **Kinetic banners** (centre, y ≈ 32 %, never over the bike): 3 / 2 / 1 squash-pop, GO scale-out,
  CRASH! stamp 0.2 s after the fault (rotated −6°, red on dark slab), checkpoint flash (thin green
  line sweep + "CHECKPOINT n"), TRACK FINISHED! ribbon. Banners are DOM nodes recycled from a pool of 8.
- **Results panel** (0.4 s after finish): time, faults, medal, PB flag, `Retry` / `Next` / `Menu`.
- **Main menu**: title, tracks grouped by tier with best time + medal, quality tier selector
  (auto/low/medium/high), audio toggle. **Pause**: resume / restart track / quit to menu.
- **Beginner tier**: bottom button-hint strip from `meta.hints` (glyph set follows the active device).

## 5. Quality tiers and mobile

- DPR cap: 2 on desktop, 1.5 on phones (`pointer: coarse` and `min(innerWidth, innerHeight) < 500` CSS px).
- Tier probe: median RAF interval over the first 60 frames after GO → ≤ 17.5 ms (60 fps) `high`, ≤ 34 ms
  `medium`, else `low`. Applied once via `setQuality`; a manual choice in the menu (`localStorage trials.quality`)
  wins over the probe.
- `index.html`: `viewport-fit=cover`, `user-scalable=no`, `overscroll-behavior: none`, `touch-action:
  none`, safe-area padding on every HUD edge, landscape prompt overlay in portrait on coarse pointers.
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
