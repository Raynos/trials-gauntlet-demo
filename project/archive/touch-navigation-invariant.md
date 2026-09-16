# Task: touch navigation — nothing is tappable unless it is drawn

**Closed: 2026-09-15.** `.live` rule + NavLog + the 5184-tap grid (0 ghosts) landed in `18df821`; the user then cleared 6 / 15 tracks on the phone with no further button reports — taken as the phone confirmation. The rule lives on in `src/ui/live.ts` and `harness/e2e/touch.mts --only=grid`.

Status: FIXED IN CODE, AWAITING THE PHONE (2026-09-14, core-game). Instrument, helper, five instances and the grid test are in; the human's confirmation on the iPhone is the open item.
Owner: core-game. Priority: P0 — the human tester cannot play through a run on the phone.

## The report

On iPhone Safari, landscape: "the touch control buttons keep glitching or breaking; I keep
pressing a button that doesn't exist on screen and it brings me back to main menu or level
select."

## The flaw (one, not four)

Visibility and hit-testing are decoupled everywhere in the UI layer, and every overlay goes
live the instant it exists rather than when it is on screen. Opacity is being used as a
visibility state; opacity does not stop clicks. Every previous fix (watchdog, per-frame
recompute, 250 ms swallow, gesture swallow, reporter rebind) closed one repro and left the
invariant unstated. There is no test that taps during a phase transition and asserts the
screen did not change.

## Confirmed instances (all read from source at bdf9f0c)

1. **Results tiles are clickable while invisible, and Menu sits under the gas thumb.**
   `.results.show { pointer-events: auto }` from stage-0 (`src/ui/styles.ts:508`,
   `src/ui/hud.ts:426`) while `.results .tiles { opacity: 0 }` until stage-3
   (`styles.ts:530`, `hud.ts:385`) — 0.6 s of live, unseen tiles. `TileRow` fires `pick()` on
   any click with no stage check (`src/ui/tiles.ts:46`); `resultsInteractive()` gates only the
   keyboard/pad path (`src/game/app.ts:923-926`). On an 844×390 phone the row is centred in the
   lower third, Menu rightmost at x ≈ 600–760; the gas zone starts at x = 633. The held thumb
   is force-released when the panel appears (`app.ts:449` → `touch.ts:131`); the next tap there
   picks Menu → `quit()` → main menu.
2. **Pause during the finish window is an unconfirmed quit.** In the `finished` branch
   `if (meta.pause) this.quit()` (`app.ts:925`). Between the line and `publishResults`
   (0.4 s, `RESULTS_DELAY_S`) the touch layer is still `.on`, so a top-left tap exits with no
   overlay. The top-right restart in the same window is a restart edge → full restart with
   countdown, which reads as "kicked back to the level".
3. **Corner buttons fade to 30 % after 3 s by a specificity accident; hit rects never check
   visibility.** `.touch-layer.on.visible.settled .tz { opacity: .3 }` (`styles.ts:554`,
   specificity 0,5,0) beats `.touch-layer.on.visible .tz-btn { opacity: .9 }` (`:565`,
   0,4,0). Hit rects stay 56×44 (`:561,567,568`) via `getBoundingClientRect`
   (`orientation.ts:147`); `zoneAt` never consults `.visible` (`touch.ts:156-165`). If the mux
   flips the active device off touch (`mux.ts:54-60` → `app.ts:983 setVisible(false)`), the
   buttons are opacity 0 and fully tappable. Pause fires on pointerdown (`touch.ts:191`).
4. **The 250 ms one-gesture-one-screen swallow covers `.screen` only** (`app.ts:218`), not
   `.overlay` or `.results`. `togglePause()` never sets `screenAt`.
5. **The restart button latches to the finger** (`touch.ts:163-164`): a touch that lands on ↻
   stays `restart` wherever it slides until lift, so sliding into gas is a 0.6 s hold → full
   restart.

"Level select" is most likely the follow-on tap landing on the main menu's Play.

## Do this, in this order

Do NOT add another timer, swallow, or watchdog. Fix the invariant, then prove it.

### 1. Instrument first (before any fix)

Log to the `?touchdebug=1` overlay AND to the run telemetry every call to `quit()`,
`togglePause()`, `goto()`, `restartFromStart()` with: trigger (device, meta flag, click target
element + class list), screen, phase, results stage, ms since `screenAt`, last pointerdown
x/y. Reproduce the report from that log on an iPhone-sized viewport. Do not guess.

### 2. The invariant, in one place

> Nothing is hit-testable unless it is drawn at ≥ 0.5 opacity and has been for ≥ 150 ms.

Implement as a single helper that toggles a `live` class after the reveal, and make every
overlay / tile / button rule use `visibility: hidden; pointer-events: none` until `.live`.
Opacity alone is never a visibility state. Remove the per-widget special cases the helper
makes redundant.

### 3. Close the five instances through the helper

1. Results tiles: `.live` only from stage-3; gate `onPick` on `resultsInteractive()` too.
2. `app.ts:925`: pause in `finished` opens the pause overlay (or is ignored). Arm the results
   overlay on the `finished` phase change in `onPhase`, not 0.4 s later.
3. Fix the specificity at `styles.ts:554/565`; `zoneAt` skips the pause/restart rects unless
   the layer is `.visible`; pause fires on pointerup.
4. Grace swallow covers `.screen, .overlay, .results`; `togglePause()` stamps `screenAt`.
5. Release the restart latch when the finger leaves the button rect.

### 4. The test (Playwright, headless, iPhone viewport; must pass before commit)

For each transition — ride→crash, ride→finish, finish→results stage 0..5, pause open, pause
close, results→menu, menu→tracks — tap a 12×6 grid of points at 0, 50, 100, 200, 400, 800 ms
after the transition. Assert the screen and phase change only when the tapped point is inside
an element that is `.live` with computed opacity ≥ 0.5. Also assert every pause/restart hit
rect equals its drawn rect.

## Definition of done

- The test passes.
- The instrument shows zero navigations without a live, visible target across one full
  stranger session on an iPhone-sized viewport.
- The human confirms on the phone.
- The commit message names the invariant, not the symptom.

## Result (2026-09-14, core-game)

**Finding:** hit-testability was never a state of its own — `.show` (drawn) was standing in for it — so every
overlay took taps from the frame it existed; the fix gives it one: `.live`, set by `src/ui/live.ts` only after
the surface has been observed drawn at ≥ .5 opacity for 150 ms, and every screen / overlay / tile / button is
`pointer-events: none` until then.

### 1. Instrument (`src/game/navlog.ts`)

Every `quit` / pause / resume / `goto` / full restart is recorded with its trigger (DOM event + target, or the
polled meta flag + device), screen, phase, results stage, ms since `screenAt`, the last pointerdown, the
target's effective opacity and whether it was `.live` (`targetLive: false` = a ghost navigation). Surfaces: the
`?touchdebug=1` overlay (last six lines under the frame), `RunTelemetry.nav` (every navigation during the run),
`window.__trials.navLog()`.

Reproduction on 844×390 (Playwright, coarse pointer, SwiftShader), before the fix — each line is the log:

| instance | log line |
|---|---|
| 2 pause corner tapped 0 ms after the line | `quit poll:touch:pause @run/finished (stage -1) down 30,30 on div.touch-layer.visible.on — GHOST` → main menu |
| 1 Menu tile tapped when the panel appears | `quit click button.tile.on[menu] @run/finished/s2 opacity 0 — GHOST` → main menu |
| 3 settled corner buttons | `.tz-pause` / `.tz-restart` computed opacity 0.3, hit rects 56×44 / 80×44 still taken |
| 5 finger from ↻ slid into gas, held 0.9 s | `restart poll:touch:restart-hold @run/riding — GHOST` ×2 (full restart, then again) |
| bonus | `goto→tracks click button.menu-item.on[play] opacity 0.27 — GHOST`: a Play tap landing while the menu was at 27 % (the fade had not run yet under a main-thread stall — a timer would have called it ready) |

### 2. The invariant (`src/ui/live.ts`, `src/ui/styles.ts`)

`reveal(el, { surface?, when? })` starts a watch after a surface's `show`; on the first frame the surface has been
drawn (effective opacity ≥ .5, ancestors multiplied, hidden = 0) for ≥ 150 ms and `when()` holds, `.live` lands.
`conceal(el)` drops it synchronously (a fading-out overlay is dead from its first frame). One CSS block states it:
`.screen, .overlay, .onboard, .results, .replay, .toast` and every descendant are `pointer-events: none`
(`!important` on descendants) until `.live`; hidden surfaces are also `visibility: hidden`. Every per-widget
`.show { pointer-events: auto }` is gone. The touch layer's ❚❚ / ↻ rects obey the same helper: `zoneAt` takes a
button only while the layer is `.live` AND the button is drawn ≥ .5 right now.

### 3. The five instances

1. Results: `.live` only once the TILES are drawn (stage-3 + 150 ms; the watch surface is `.tiles`), and
   `TileRow.onPick` is gated on `resultsInteractive()`.
2. The touch layer goes inert on the `finished` phase change (`onPhase`), not when the panel lands 0.4 s later; a
   pause press before the tiles are up is ignored (once they are, Esc / Start = MENU as SPEC §5 says).
3. `.touch-layer.on.visible.settled .tz-btn` keeps `.9` (the `.settled .tz` rule no longer wins); the buttons are
   hit-tested through the helper; pause fires on pointerUP inside the rect (a tap, not a touch-down).
4. The 250 ms click swallow is REMOVED (the grid test passes without it: a click within 150 ms of a screen change
   lands on a non-live screen). `togglePause` / `resume` stamp `screenAt`. The polled-meta grace for keyboard /
   pad edges (`SCREEN_GRACE_MS`) stays: it is an input-edge rule, not a visibility one.
5. A finger that leaves ❚❚ / ↻ is dead until it lifts — it never becomes gas.

Also: `Game.publishResults` anchors the HUD's results clock at the publish tick (it read the last render's sim
time, which under a stepped sim jumped the panel to stage 5 on its first render).

### 4. The test (`harness/e2e/touch.mts`, rule R6; `pnpm harness:e2e --only=grid`)

12 transitions (ride→crash, ride→finish, finish→results stage 0..5, pause open, pause close, results→menu,
menu→tracks) × 72 grid points × 6 offsets (0/50/100/200/400/800 ms) = 5184 taps per geometry; a state change
(screen / phase group / pause) with no live, drawn tap among the slot's points is a violation. Transitions are
driven through `window.__trials` (sim stepped in one evaluate, `app.frame()` one synchronous input poll) and the
grid taps are dispatched in-page at the browser's own hit-test (a real-finger CDP tap waits ~300 ms on
SwiftShader per event). `hitrects` asserts the ❚❚ / ↻ hit rects equal their drawn rects (inner corners act, 6 px
outside does not, hidden under the overlay does not). Result on iphone13 (844×390): 5184 taps, 6 state
changes, 6 legitimate, 0 ghost; `hitrects` 40/40 on both geometries; the whole suite 163/163 (front 46+, run,
hitrects, grid). The grid needs `__trials.app`, so it cannot be run against the old build; the old build's
ghosts are the instrument's lines above.

### Kept / removed

Removed: the 250 ms capture-phase click swallow. Kept: the touch layer's 400 ms pointer watchdog (a stuck-finger
release, unrelated), the keyboard / pad `SCREEN_GRACE_MS` meta gate. Not added: any timer, swallow or watchdog —
the helper's frame poll reads the fade, it does not race it.

Open: the human on the phone.
