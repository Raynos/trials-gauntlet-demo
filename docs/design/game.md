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
Zone outlines fade in on first touch, sit at ~35 % opacity while touch is the active device and drop to 30 % three seconds after GO (§10); the HUD top band shifts to clear the two touch buttons (top-left ❚❚ pause, top-right ↻ Restart).

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

## 10. Front end (title → menu → track select → run)

Flow (`App.screen`): `title` → `menu` → `tracks` | `settings` | `credits`; `run` (countdown…) → pause
overlay → results. Routing is pure (`src/game/flow.ts`, tested): `?harness=1` never builds the front end
(hook-only; a track is loaded in the boot macrotask as before — verified in the built page: zero `.screen`
nodes, `phase()==='riding'`), `?track=<id>` skips straight into that track, `?dev=1` unlocks every tier and
lists the harness `*-test` strips. Everything else opens the title.

Design rule (user): "less buttons, more design". Title = key art + wordmark + one pulse line. Menu = three
items. Track select = the cards are the interface. Settings = one panel of segmented rows. No control that
can be removed stays.

- **Backdrop**: `b1-first-ride` loaded and held in the `menu` phase (nothing ticks, renderer's idle 3/4
  camera) under title and menu. Entering the menu from a run (`quit`) calls `startRun()` (physics
  `reset(-1)` + a `restart{-1}` event so the renderer cuts ragdoll/particles) then `toMenu()`, with the
  master volume muted for 60 ms so the countdown cue the reset emits stays silent — the bike always sits
  upright at the start line, never a frozen crash (verified: play → crash → pause → Main menu capture).
  The renderer's menu camera is static, so the *canvas* drifts (`#app.drift canvas`, 12 s eased scale
  1.06→1.14 with a +13 % x offset that carries the bike right of the wordmark; +20 % on short phones).
- **Title** (`TitleScreen`): key art (`kind:'keyart'`, biome `industrial`, `2x` variant on DPR > 1.5 or
  wide viewports) *over* the canvas at 55 % — the WebGL canvas is opaque so "behind" is impossible —
  mirrored (`scaleX(-1)`) so its hero lands right of the wordmark, masked clear on the wordmark side,
  bottom-up scrim `linear-gradient(180deg, transparent 35%, rgba(6,7,9,.92))`, faint SVG-noise grain (no
  blend mode — `mix-blend-mode` doubled compositor cost). Wordmark **TRIALS GAUNTLET** (one name; the old
  "Physics trials / Gauntlet" lockup is gone) in Barlow Condensed 900 italic (`public/fonts/*.woff2`,
  15.5 + 14.9 + 14.7 KB latin subsets, OFL), amber gradient fill + `--bevel` + emissive drop-shadow,
  tracking −0.01em. "PRESS ANY KEY · TAP TO START" pulses at 1.6 s. Build stamp (short git sha + build
  time from Vite `define`) bottom-right at 40 %. No buttons. Any key / pad button / stick / tap → 200 ms
  rise-out → menu.
- **Main menu** (`MainMenuScreen` + `FocusList`): Play / Settings / Credits in the display face at 2.4 rem
  (1.6 rem on short phones), amber selection bar sliding at `--t1`, items rising at `--t2` with 40 ms
  stagger, one quiet career line under the list ("n of 15 tracks cleared · next up X"). Focus by arrows /
  d-pad / stick edges / pointer hover with tick cues; confirm / back cues. Esc/B/Backspace → title.
- **Track select** (`TrackSelectScreen`): tier rows as text headings (label, blurb, done/total, padlock
  line when locked) over horizontal card carousels. Card = art (`kind:'track-card'`, fallback tier card,
  fallback biome-tinted gradient with a ghosted tier badge), medal disc (manifest icon, tinted disc, or a
  dashed empty ring), "PB ghost" tag when a recording exists and Ghost is on, name, technique, best vs
  target (green under target). Focus = (row, column) with per-row memory; focused card scales 1.06 with an
  amber ring; locked rows sit at 62 % grey; confirming a locked card shakes it. Lock rule
  (`src/ui/progress.ts`, tested): a tier opens when every authored track of every earlier tier holds a
  medal. Confirm: launch cue, card flies up 400 ms (`cardgo`), `play()` at 180 ms so the new track is
  under the fading screen, screen gone at 420 ms — the countdown starts in the same scene.
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
  nothing else lives up there. The build stamp stays on the prompt, in Settings and on the title corner.
- **Title any-key**: the title leaves on the gesture's *end* (`pointerup`), not `pointerdown`, so the same
  tap's `click` can't land on the menu item that appears under the finger 200 ms later; and for 150 ms after
  any screen change the shell drops confirm/back/nav edges (`SCREEN_GRACE_MS`), so the key that changed
  screens never acts twice.
- **Title first**: `loadBackdrop` calls `DomHud.hideNow()` after `toMenu()` — HUD hidden with no fade and the
  countdown banner the backdrop load spawned retired — so neither the boot crossfade nor run → menu ever shows a
  HUD frame under the title / menu (verified frame by frame: `.hud hidden` opacity 0 from the first HUD frame
  through loader removal, title `.show` before the loader goes `out`; `?harness=1` still builds zero screens).
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

## 12. Loading screen (`index.html` inline loader, `src/ui/loader.ts`, `vite.config.ts` `loadManifest`)

User (3G, round 3): white then black for many seconds. Now:

- **Inline first paint.** `index.html` carries `<style>` + `<div id="loader">` (dark ground, wordmark as plain text
  in the system font, amber bar, KB counter, item list, elapsed s, throughput) and a ≤ 6 KB classic script
  (5.6 KB minified at build by the plugin) — no webfont, no bundle, no art. Verified in WebKit iPhone at
  DOMContentLoaded (≈ 320 ms on the LAN) and Chromium 3G at 0.5 s.
- **Byte-accurate download.** The plugin emits `dist/load-manifest.json`: every chunk/asset + the public files the
  first screens need, with raw and gzip bytes and a `phase` (`core` = entry + three + fonts; `title` = key art,
  wordmark plate, art manifest; `menu` = cards/medals; `world` = renderer plates/skies/stencils; `models`;
  `audio-worklet`). The loader fetches it (`no-cache`), streams the `core` set (4 in flight) with
  `fetch` + `ReadableStream`, counting decoded bytes against the manifest and estimating wire bytes with each
  file's gzip ratio ("Downloading 345 KB / 1.29 MB (≈ 407 KB gz on the wire)", "≈ 715 kbps on the wire"), then
  inserts the entry `<script type="module">`. The build strips Vite's own module/modulepreload tags and puts the
  entry URL in `#loader[data-entry]`; the preview server marks hashed assets immutable like the production host,
  so the module request is a cache hit — measured wire bytes per core file ≈ one gzip copy (three 188 KB vs
  192 KB gz, index 176 vs 178, fonts 15–16). Dev server (no manifest): straight boot. `?harness=1`: loader removed
  before anything else, entry inserted at once.
- **Boot steps** (`main.ts` `bootFront`, `window.__loader.step/progress/done/fail`): WebGL renderer · Physics
  world · Audio · Game + HUD · Front end + first resize · Track: First Ride · First frame (shaders) · World
  textures (`renderer.prepare(report)` when the render owner exports it — forwarded as numeric progress) · Fonts
  (`document.fonts.ready`, 4 s cap) · Title art (key art streamed with KB progress) → `done()` = 240 ms
  crossfade. One `nextPaint()` (rAF + macrotask) between steps so the loader repaints. Background phases
  (`world`, `menu`, `models`) are counted from Resource Timing against the manifest totals as their files
  complete ("World art (renderer, background) 1.2 / 2.77 MB").
- **Freeze detection.** `PerformanceObserver('longtask')` (Chromium) attributes each long task by start time to
  the running step; > 50 ms is logged, > 100 ms puts a red mark on the step. Measured headless (SwiftShader,
  so GPU-bound numbers are inflated): WebGL renderer 125–176 ms, Game + HUD / front end ≈ 0.6–1.0 s (renderer
  resize + post buffers), Track: First Ride 73–101 ms, **First frame (shaders) 8–10 s** under SwiftShader. Those
  freezes are inside other owners' constructors / the GPU driver and cannot be chunked from this layer — the
  red marks are the hand-off to the render / physics owners (`renderer.prepare` yielding between texture jobs).
- **Failure.** Manifest/core fetch error, module error or an unhandled rejection during boot → error text + a
  "⟳ Retry" button (reload); never a blank page.
- **3G measurement** (Chromium, CDP 750 kbps / 100 ms RTT, preview build): loader with numbers at 0.5 s; core
  1.29 MB (407 KB on the wire) done at 4.8 s; title at ≈ 67–73 s in headless — dominated by the renderer's
  2.8 MB of background world art contending for the link (≈ 30 s of 3G on its own) plus SwiftShader frames.
  Recommendation for the render owner: defer / trim world art until after the title, or load the showcase
  biome only.
