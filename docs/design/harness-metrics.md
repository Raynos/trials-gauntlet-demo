# Evaluation harness and metrics

Design for the layer that sits on top of the scaffold harness (`harness/{boot,replay,capture,perf,all}.ts`,
`window.__trials`, `src/core/{types,replay,hash,rng}.ts`). It turns "does the game work" into numbers the
parent can judge from a bot and from a stranger, and turns "does it look like Trials" into a blind
clip-vs-clip verdict. Everything is headless, deterministic and produces JSON under `harness/out/`.

Corpus numbers this design is calibrated against (see `reference/notes/*.md`):

| Reference fact | Number | Consequence for us |
|---|---|---|
| Ragdoll fault -> seated at checkpoint (Evolution) | 0.35 s after impact flash, hard cut | `faultToControlMs` target <= 500 ms sim time |
| Crash -> full restart incl. player reaction (Rising) | 0.75 s, one-frame cut, bike moving within 167 ms | `restartTicks` == 1; restart -> synced frame <= 50 ms wall |
| Re-attempt cadence on a hard obstacle | ~3.0 s fault-to-fault, 3 faults in 7 s | stranger CLI must allow >= 20 attempts/min |
| Countdown on fresh load / none on restart | 1.0 s per beat / GO at +0.9 s | `restart` path never inserts countdown ticks |
| Beginner clean time / medium clean time | 16-19 s / 40-70 s, 0-3 faults | bot search horizon sized for <= 90 s tracks |
| Big-jump airtime | 2.4-3.2 s | beam lookahead must exceed one airtime (>= 3.5 s) |
| Timer never pauses across a fault | 16.95 -> 18.55 through respawn | `finishTime` is wall-of-run; faults cost real time |

## Round 1 status — what is built and where it differs from the design below

Everything under `harness/` in this document exists and runs on whichever physics `src/physics`
exports (`bikePhysicsFactory`/`createBikePhysics`, else the scaffold `MockPhysics`). Reconciled
to CONTRACT.md; where the sections below still describe the original plan, this list wins:

| topic | as built |
|---|---|
| physics API | `snapshot()/restore()` return `{v:1, f64, u8}`; `compileTrack(def)` from `src/tracks` is what the sim loads. `hook.snapshot()` base64 also carries the game counters. |
| **rule layer** (new) | `harness/lib/rules.ts` mirrors `Game.tick()` (riding / crashed / finished, restart edge, 0.6 s hold = full restart, 1.0 s auto-respawn, run clock, fault counter). `Sim.step()` is a *game* tick, not a bare physics tick; `SimSnapshot = {physics, counters}`. Without it node and browser replays diverge at the first crash (D3 caught it). **Requested src change:** core-game exports this state machine renderer-free so the harness imports instead of mirroring. |
| attempts | `1 + fault events` exactly as the game counts (`hook.faults()`); the restart mash after a crash is a free respawn in the rule layer and emits no fault. The bot's browser verification warns when node attempts−1 ≠ browser faults. |
| actions | 13 macro-actions × 15 ticks, **no hop button** (CONTRACT §2.8): `c g gb gf hg hgb hgf b bf bb lb lf t`. Hop = `gb` then `gf`. Same vocabulary for bot and stranger. |
| bot | `harness/bot/{actions,score,beam,play,bot}.ts`; `pnpm harness:bot <track> [--skill N] [--oracle] [--all] [--seeds N] [--budget ms] [--crash-probe]`. Committed play has *player memory*: a fault bans the action prefix that led to it from that state (keyed by state hash), so attempts are not identical repeats. Golden recordings are written only when the browser hash equals the node hash. Output `harness/out/metrics/<track>.json` (curve, par, shaped, singleWall) — committed. |
| stranger | **node CLI, one-shot commands, state persisted between calls** (`harness/stranger/cli.ts`, `session.ts`); no long-lived page/socket. `look` renders an ASCII side-view of the next 40 m from the compiled colliders plus the numbers a player sees; `play` prints a per-slot trace instead of a contact sheet. Recordings replay in the browser. Metrics `harness/out/metrics/<track>.stranger.json`. Full reset uses the 0.6 s hold rule so it stays replayable. |
| compare | 640×360@30 (not 1280×720), `pair.ts` writes `pair-<id>.mp4` (hstack + label bar: 1 square = A, 2 squares = B; no drawtext in this ffmpeg), `pair-<id>-sheet.jpg` 2×8, sealed `pair-<id>.answer.json` (chmod 000). `log.ts` unmasks and appends `out/metrics/compare.jsonl`. The critic is a separate agent the parent runs with `RUBRIC.md`; there is no `critic.ts`. `--mask` blacks out HUD regions (our capture carries a debug HUD strip that would give the side away). |
| gate | `pnpm harness:gate` → `harness/out/metrics/ship-gate.json`, exit code = failed checks. Thresholds are the CONTRACT §3 numbers in `gate/thresholds.json` (below). G7 capture-sanity is not in the gate (capture is its own command). `fault.toControlMs` is the *manual* path (restart mash on the tick after the crash); the auto-respawn path is reported next to it (~1008 ms per CONTRACT §2.8). Pins in `gate/expected.json` are per physics implementation and re-pin automatically when the implementation name changes; a tuning change with the same name fails `clear.*`/D8 on purpose until `harness:bot` is re-run. |
| determinism | D1–D5, D7, D8 as designed plus D4b (snapshot round trip through the page's base64 hook). D6 (live-vs-replay under frame jitter) not built. |
| infra | `BrowserVerifier` serves a **frozen copy of `dist/`** so another builder's rebuild mid-gate cannot change the page, and warns when `dist/` predates `src/`. Corpus: seesaw (16, 17) and stairs (18, 19) clips added to `reference/techniques/` (Trials Fusion; no Rising/Evolution seesaw footage exists). |

## 0. Principles

1. **Search runs in node, verification runs in the browser.** `src/physics` is platform-neutral (plain data,
   no DOM). The bot steps a `PhysicsWorld` directly at ~6 us/tick (measured on MockPhysics; budget 50 us/tick
   for the real sim) and only sends its winning recording through `harness/replay.ts` to prove the browser
   agrees byte-for-byte. A mismatch there is a physics bug, not a bot bug.
2. **A recording is the unit of evidence.** Bot output, stranger output, ship-gate input and capture input
   are all `InputRecording` (`src/core/replay.ts`). Restarts are in-band (`FLAG_RESTART`), so attempts are
   countable from the recording alone: `attempts = 1 + count(restart edges) + count(crash faults)`.
3. **Every number has a source tick.** Latencies are reported in physics ticks (exact) and wall ms
   (measured, noisy). Thresholds are on ticks wherever possible.
4. **The critic never sees which clip is ours.** Masking happens on disk before the critic is invoked, and
   the unmask key lives in a separate file that is unreadable during the critic call.

## 1. File layout

```
harness/
  lib/                        (existing) args browser ffmpeg hook paths recording report server synth
  lib/sim.ts                  node-side createSim: physics factory (resolved at runtime) + compileTrack + rule layer
  lib/rules.ts                mirror of Game.tick(): phases, restart edge/hold, auto-respawn, run clock, faults
  lib/metrics.ts              attempt counting, diffState, percentiles, run ids
  lib/schema.ts               TS types for every JSON written under out/ (section 8)
  lib/verify.ts               BrowserVerifier: frozen-dist server + browser, runRecording per fresh page
  bot/
    actions.ts                13 macro-actions × HOLD=15 ticks, stranger slot codes, parseSlots
    score.ts                  progress heuristic (2.2)
    beam.ts                   beam search core (2.3)
    play.ts                   committed play with player memory; oracle rewinds (2.4)
    bot.ts                    CLI: pnpm harness:bot <trackId> [--skill 0..3] [--oracle] [--all] [--seeds N] [--budget ms] [--crash-probe]
  stranger/
    PROTOCOL.md               text handed verbatim to the stranger
    cli.ts session.ts view.ts one-shot commands, persisted session state, ASCII look
    README.md                 how the parent spawns a stranger and reads results
  compare/
    normalize.ts mask.ts      640x360@30 letterbox, HUD masking
    pair.ts                   CLI: pnpm harness:pair <ours.mp4> <ref.mp4> --tag <manoeuvre> [--seed N] [--mask] [--align a:b]
    log.ts                    CLI: pnpm harness:log-verdict <pair-id> --verdict '<json>' [--critic name]
    RUBRIC.md README.md       what the critic answers, in motion terms
  gate/
    thresholds.json           every threshold, one place (CONTRACT §3)
    expected.json             pinned golden finish/hash + canonical 1200-tick hash, per physics implementation
    determinism.ts            CLI: pnpm harness:determinism <recording> [--loads 3] [--pin]
    ship-gate.ts              CLI: pnpm harness:gate [--track flat-test] [--build] [--quick] [--pin]
  inputs/<trackId>/
    bot-<0..3>.json bot-oracle.json   browser-verified golden recordings per skill
    crash.json                        earliest scripted crash (bot --crash-probe)
    stranger-<sessionId>.json         what a stranger actually played
  out/metrics/                (committed) <trackId>.json <trackId>.stranger.json compare.jsonl ship-gate.json
  out/                        (gitignored) bot/ stranger/ compare/ gate/ boot/ replay/ capture/ perf/
```

Package scripts: `harness:bot harness:stranger harness:pair harness:log-verdict harness:determinism harness:gate`
(plus the scaffold's `boot replay capture perf gen-input all`).

## 2. Bot player

### 2.0 Sim contract (physics per CONTRACT §2.3; rule layer per §2.8)

```ts
// src/physics (CONTRACT §2.3): snapshot()/restore() are plain data
export type PhysicsSnapshot = { v: 1; f64: Float64Array; u8: Uint8Array };

// harness/lib/sim.ts
export interface SimSnapshot { physics: PhysicsSnapshot; counters: RulesCounters }   // rules = harness/lib/rules.ts
export interface Sim {
  world: PhysicsWorld; rules: RunRules; track: TrackDef; compiled: CompiledTrack; hz: number; seed: number;
  physicsName: string;                          // 'bikePhysicsFactory' | 'createBikePhysics' | 'MockPhysics'
  step(input: InputFrame): GameEvent[];         // one GAME tick (rule layer + physics), returns the game events
  run(frames: Iterable<InputFrame>): { state: PhysicsState; events: GameEvent[]; hash: string; ticks: number };
  snap(): SimSnapshot; restore(s: SimSnapshot): void;
  hash(): string; state(): PhysicsState; phase(): GamePhase; faults(): number;
  runTicks(): number; runTime(): number;        // run clock, frozen at finish (== hook.runTime())
  totalTicks(): number; reload(): void;
}
export function createSim(trackId: string, seed?: number, hz = DEFAULT_PHYSICS_HZ): Promise<Sim>;
```

The factory is resolved at runtime: `bikePhysicsFactory` or `createBikePhysics` from `src/physics/index.ts` when
exported, else `MockPhysics` (`TRIALS_PHYSICS=mock` forces the mock). `createSim` == the page's `loadTrack` +
`skipCountdown`: physics `loadTrack` then `reset(-1)`, run clock 0, phase `riding`. Contract test (section 6, D3/D4):
`createSim().run(rec).hash` equals the browser's `runRecording` hash, and `restore(snap())` + step×m equals the
straight run. `hashPhysicsState` is the hash; `diffState()` (harness/lib/metrics.ts) names the differing paths.

### 2.1 Action vocabulary

Physics runs at 120 Hz; searching per tick is hopeless. The bot searches over **macro-actions**: one
quantized `InputFrame` held for `HOLD` ticks. There is **no hop button** (CONTRACT §2.8); the hop is
`gas-back` (preload) then `gas-fwd` (snap). Vocabulary `A` (13 actions), `harness/bot/actions.ts`:

| id | name | code | throttle | brake | lean | hold |
|---|---|---|---|---|---|---|
| 0 | coast | `c` | 0 | 0 | 0 | 15 |
| 1 | gas | `g` | 1 | 0 | 0 | 15 |
| 2 | gas-back | `gb` | 1 | 0 | −1 | 15 |
| 3 | gas-fwd | `gf` | 1 | 0 | +1 | 15 |
| 4 | half-gas | `hg` | 0.5 | 0 | 0 | 15 |
| 5 | half-gas-back | `hgb` | 0.5 | 0 | −0.5 | 15 |
| 6 | half-gas-fwd | `hgf` | 0.5 | 0 | +0.5 | 15 |
| 7 | brake | `b` | 0 | 1 | 0 | 15 |
| 8 | brake-fwd | `bf` | 0 | 1 | +1 | 15 |
| 9 | brake-back | `bb` | 0 | 1 | −1 | 15 |
| 10 | lean-back | `lb` | 0 | 0 | −1 | 15 |
| 11 | lean-fwd | `lf` | 0 | 0 | +1 | 15 |
| 12 | tap-gas | `t` | 1 | 0 | 0 | 4 (+11 coast) |

Every action expands to exactly `HOLD = 15` ticks (125 ms; 8 decisions per second), so the tree is
uniform: depth d = 125 ms × d. Values are on the u8/i8 quantization grid (`quantizeInput` is identity on
them), so recordings round-trip exactly and node and browser see identical bytes. The `code` column is the
stranger's slot code (`parseSlots("g8 gb4 c2")`), so bot and stranger attempts are comparable.

### 2.2 Progress score

```ts
// harness/bot/score.ts
export interface ScoreWeights { progress: number; speed: number; upright: number; airPitch: number; checkpoint: number; finish: number; fault: number }
export const DEFAULT_WEIGHTS: ScoreWeights = { progress: 1, speed: 0.15, upright: 0.5, airPitch: 0.3, checkpoint: 50, finish: 1e6, fault: -1e6 };

export function score(s: PhysicsState, w: ScoreWeights): number {
  if (s.finished && s.finishTime !== null) return w.finish - s.finishTime;   // faster finish wins
  if (s.faulted) return w.fault + s.bike.pos.x;                              // faulted: still ordered by x
  const grounded = s.wheels.rear.grounded || s.wheels.front.grounded;
  const upright = Math.cos(s.bike.angle);                                     // 1 level, 0 vertical, <0 inverted
  const airOver = !grounded && Math.abs(s.bike.angle) > 1.0 ? Math.abs(s.bike.angle) : 0;
  return w.progress * s.bike.pos.x
       + w.speed * Math.max(0, s.bike.vel.x)
       + w.upright * (grounded ? upright : 0)
       - w.airPitch * airOver
       + w.checkpoint * (s.checkpoint + 1);
}
```

Deliberately dumb: x is the objective, the rest are tie-breakers so the beam does not fill with "fast but
about to loop" states. Tuning is by measured `botAttempts` against author `targetAttempts`, never by eye.

### 2.3 Beam search core

```ts
// harness/bot/beam.ts
export interface BeamConfig {
  width: number;          // states kept per depth
  depth: number;          // macro-actions of lookahead (depth * 125 ms)
  commit: number;         // macro-actions actually played from the best plan before re-planning
  cells: [number, number, number]; // x (m), vx (m/s), angle (rad) bucket sizes for dedupe
  budgetMs: number;       // wall clock cap per plan(); depth is cut short when exceeded
}
export interface Plan { actions: number[]; score: number; expanded: number; wallMs: number; finishes: boolean; allFault: boolean }
export function plan(sim: Sim, cfg: BeamConfig, w: ScoreWeights): Plan;
```

Per `plan()`: `root = sim.snap()`; frontier = `[{snap: root, actions: [], score}]`. For each depth, for
each node, for each action: `restore(snap)`, run `HOLD` ticks collecting events; a child with a `fault`
event is kept but its score is already `<= fault + x` so it survives only when every child faults
(`allFault: true` tells the driver the situation is already lost — commit to the best x anyway, the
fault is real). A child with `finish` is terminal: the search returns immediately with the earliest
finish (ties by `finishTime`). Children are deduped by
`(round(x/cells[0]), round(vx/cells[1]), round(angle/cells[2]), grounded)` keeping the best score, then
the top `width` proceed. Expansions per plan = `width * |A| * depth`: width 32, depth 28 (3.5 s), 13
actions = 11 648 rollouts x 15 ticks = 175k ticks, i.e. 1-9 s of node time at 6-50 us/tick. Snapshot
cost matters: a `Float64Array` copy of ~200 doubles is ~1 us; never JSON.

### 2.4 Committed play and attempts-to-clear

```ts
// harness/bot/play.ts
export type Skill = 0 | 1 | 2 | 3 | 'oracle';
export const SKILLS: Record<0 | 1 | 2 | 3, BeamConfig> = {
  0: { width: 4,  depth: 8,  commit: 4, budgetMs: 200,  cells: [0.5, 1, 0.2]    },   // 1.0 s lookahead
  1: { width: 8,  depth: 16, commit: 4, budgetMs: 500,  cells: [0.5, 1, 0.2]    },   // 2.0 s
  2: { width: 16, depth: 24, commit: 2, budgetMs: 1500, cells: [0.25, 0.5, 0.1] },   // 3.0 s
  3: { width: 32, depth: 32, commit: 1, budgetMs: 4000, cells: [0.25, 0.5, 0.1] },   // 4.0 s
};
export interface PlayLimits { maxAttempts: number; maxSimSeconds: number }   // defaults 50, 300
export function playTrack(trackId: string, seed: number, skill: Skill, limits?: PlayLimits): BotRunReport;
```

Loop: `plan()`, play the first `commit` actions for real (frames pushed to an `InputRecorder`), re-plan.
When a `fault` event arrives during committed play the bot **may not rewind**: it pushes one frame with
`restart: true` then one with `restart: false` (a real player's mash), `attempts++`, and continues from
the checkpoint the sim placed it at. `attempts` = faults + 1; a bot that never faults has 1 attempt. The
run ends at `finish`, at `maxAttempts`, or at `maxSimSeconds` (`outcome: 'timeout'`).

`--oracle`: unlimited rewinds. On fault, restore the snapshot taken `2 * commit` actions earlier and
re-plan with that action prefix blacklisted. Produces the **0-fault reference replay** used by the ship
gate and as the "ours" clip in compare. Its `finishTime` is the track's bot par.

**Difficulty curve** = `[attempts(skill0), attempts(skill1), attempts(skill2), attempts(skill3)]`, median
over 3 seeds each. A track is "shaped" when the curve is monotone non-increasing and
`attempts(skill3) <= targetAttempts`. The per-checkpoint fault histogram tells the track builder where
the wall is; `faultsByCheckpoint[i] / sum > 0.7` flags a single-wall track.

Output: `out/bot/<trackId>/<runId>.json` (`BotRunReport`) plus the recording copied to
`inputs/<trackId>/bot-skill<k>.json` / `bot-oracle.json` **only after** `harness:replay` on it passes
(browser hash == node hash, `finishTime` bit-equal). CLI prints one line:
`bot flat-test skill=3 seed=1 attempts=1 finish=9.867 plans=79 ticks=1.2M wall=41s verified=yes`.

## 3. Stranger protocol

The stranger is a fresh sub-agent with no access to `src/`, `reference/`, bot output or this document.
It gets `harness/stranger/PROTOCOL.md` and one CLI. The point is to measure attempts-to-clear and
time-to-clear for someone who knows only the controls, and to catch "the bot can do it but nobody else
can" tracks.

### 3.1 What the stranger is told (PROTOCOL.md skeleton)

```
You are playing a 2D motorbike trials track. Controls per 1/8 s slot: throttle 0..1, brake 0..1,
lean -1..1 (negative = lean back). No hop button: preload (gb) then snap (gf). The bike starts stationary facing +x.
Cross the finish without crashing. A crash returns you to the last checkpoint; the clock keeps running.
Tool: `pnpm harness:stranger <cmd> --session <id>`   (the real text is harness/stranger/PROTOCOL.md)
  look                -> ASCII side-view of the next 40 m + JSON: x, vx, angle_deg, grounded, checkpoint, faults, time, finishX
  status              -> the JSON only
  play "<slots>"      -> apply slots, e.g. "g8 gb4 c2 gf1 g6"  (g gas, gb gas+lean back, gf gas+lean fwd,
                         hg/hgb/hgf half gas, c coast, b brake, bf/bb brake+lean, lb lean back, lf lean fwd,
                         t tap gas; number = slots of 125 ms, max 40 per call)
                         returns summary + events + a per-slot trace (x, vx, angle, ground/air); stops at a crash
  restart             -> back to last checkpoint (counts as an attempt)
  reset               -> back to the start line (counts as an attempt; the 0.6 s hold rule, replayable)
  done                -> end the session
There is no undo. Time only goes forward. Budget: 150 calls or 25 minutes. Say DONE when finished or stuck.
```

### 3.2 CLI and logging

```ts
// harness/stranger/session.ts
export interface SessionState { id: string; trackId: string; seed: number; startedAt: string; calls: number;
  attempts: AttemptLog[]; recorder: InputRecorder; cleared: boolean; finishTime: number | null }
export type Cmd = { kind: 'status' } | { kind: 'play'; slots: string } | { kind: 'restart' } | { kind: 'reset' } | { kind: 'done' };
export interface PlayResult { summary: Summary; events: GameEvent[]; sheet: string; attempt: number; budget: { callsLeft: number; secondsLeft: number } }
```

- `run-stranger.ts` opens one headless page (`openGame`, `harness=1`) and a tiny server on a Unix socket
  at `out/stranger/<id>/sock`; `cli.ts` is a thin client. One page per session, so the stranger cannot
  fork state or peek at the future.
- `play` maps slot codes onto `bot/actions.ts` macros (same vocabulary as the bot, so bot and stranger
  attempts are comparable), steps `HOLD` ticks each via `__trials.step`, drains events, renders 8 frames
  evenly across the call with `render(true)` + `page.screenshot`, tiles them with `contactSheet()` ->
  `sheets/NNN.jpg` with the sim time burnt into each tile. Visual feedback is the sheet; the summary line
  is the only numeric state exposed.
- Every `fault` event and every `restart`/`reset` appends an `AttemptLog`. The stranger cannot edit the
  log; the session owns it and writes `attempts/NNN.json` immediately (crash-safe).
- All inputs go through the same `InputRecorder`, so `session.json` embeds a replayable recording;
  `harness:replay` on it must reproduce the same fault count and finish time (this proves the log).
- Budget: `calls >= 150` or wall >= 25 min -> the CLI answers `{budget: 'exhausted'}` and refuses `play`;
  `run-stranger.ts` then finalizes and kills the page.

### 3.3 Metrics

`strangerAttempts` = number of `AttemptLog` entries, +1 if `cleared` (the final successful attempt).
Also `strangerClearWallMs`, `strangerCalls`, `firstCheckpointCalls`, `faultsByCheckpoint`, `cleared`.
Aggregate over >= 2 strangers per track (independent sub-agent instances, different `seed` for cosmetics
only). Track gate: `median(strangerAttempts) <= 1.5 * targetAttempts` and `cleared` for every stranger.
Output `out/stranger/<trackId>/<sessionId>/session.json` (`StrangerSession`).

## 4. Blind side-by-side clip comparison

Inputs: our clip (from `harness:capture` of a bot/stranger recording, trimmed to the manoeuvre) and a
reference clip from `reference/*/clips/*.mp4` tagged with the same manoeuvre. Manoeuvre tags:
`wheelie-launch`, `fault-respawn`, `countdown-go`, `big-jump-landing`, `finish`, `bunny-hop`,
`rear-wheel-balance`, `steep-climb`.

### 4.1 Normalize (`compare/normalize.ts`)

Both clips -> 1280x720, 30 fps, h264 yuv420p, silent. Duration = `min(len(a), len(b))` unless `--align
<ours_s>:<ref_s>` gives per-clip anchor times (impact frame, GO frame, touchdown), in which case both are
cut to `[t0 - 1.0, t0 + 2.5]` s. Letterbox, never stretch. ffprobe asserts both frame counts equal.

### 4.2 Mask (`compare/mask.ts`)

```ts
export interface MaskResult { runId: string; left: 'ours' | 'ref'; seed: number; abMp4: string; abSheet: string; keyFile: string }
export function maskPair(ours: string, ref: string, seed: number, outDir: string): Promise<MaskResult>;
```

`left = new Rng(seed).next() < 0.5 ? 'ours' : 'ref'`. `ffmpeg -filter_complex hstack` -> `ab.mp4`
(2560x760) with a 40 px label bar reading only "A" (left) and "B" (right). `ab-sheet.jpg`: 2 rows x 12
columns, row A = left clip, row B = right clip, frames at identical timestamps, timestamp burnt into each
tile so timing differences are judgeable from a still. `key.json` `{runId, seed, left}` is written next
to them and `chmod 000` for the duration of the critic call. Each critic call gets its own seed so roughly
half the critics see ours on the left.

### 4.3 Critic (`compare/critic.ts`, `RUBRIC.md`)

The critic is a sub-agent given `ab-sheet.jpg` and the `ab.mp4` path (it may extract more frames with
ffmpeg; it cannot read `key.json`). Prompt shape:

```
Two clips of the same manoeuvre: <manoeuvre>. Decide which looks more like a shipped AAA trials game.
Score each criterion 1-5 for A and B, then pick a winner. Output ONLY JSON:
{ "winner": "A"|"B"|"tie", "confidence": 0..1,
  "criteria": { "<id>": { "A": n, "B": n, "note": "" } }, "reasons": ["..."] }
Criteria: <RUBRIC.md entries for this manoeuvre>
```

RUBRIC.md turns corpus observations into checkable items per manoeuvre:
- `fault-respawn`: `hard-cut-no-fade`, `back-in-control-under-1s`, `camera-already-settled-on-cut`,
  `crash-stamp-0.2-0.6s`, `fault-counter-flips-on-respawn-frame`, `bike-becomes-debris`, `dust-on-impact`.
- `wheelie-launch`: `pitch-back-within-0.3s`, `rider-lean-lags-100-150ms`, `rear-hop-cadence-0.4-0.5s`,
  `exhaust-puff-on-throttle`, `pitch-drifts-and-corrects-not-snaps`.
- `big-jump-landing`: `rear-wheel-first`, `two-stage-settle-0.25s+0.4s`, `dust-0.1s-after-touchdown`,
  `camera-pullback-0.7s-to-apex`, `landing-in-bottom-third`, `airtime-2.4-3.2s`.
- `countdown-go`: `1.0s-beat-spacing`, `numerals-quarter-frame-fade-0.5s`, `bike-live-during-count`,
  `moves-on-go-frame`, `camera-dolly-during-count`.
- `finish`: `timer-freezes-on-line`, `flash-within-0.2s`, `physics-keeps-running`, `plaque-within-1.5s`.

Verdict validation: JSON parses, every criterion present with integers 1-5, `winner` in enum; otherwise
one retry, then logged as `invalid`. `compare.ts` runs `--n` critics (default 4, seeds 1..n), unmasks
each with `key.json`, and writes `compare.json` (`CompareReport`):
`oursWinRate = wins / (n - ties - invalid)`, `positionBias = |P(left wins) - 0.5|` (flagged when > 0.3
and n >= 8), `criteriaDelta[id] = mean(ours - ref)`. A manoeuvre passes at `oursWinRate >= 0.5` and no
criterion with `criteriaDelta < -1.0`. Every verdict keeps `left` so bias is auditable after the fact.

## 5. Ship gate (`gate/ship-gate.ts`)

One command, one JSON, exit code = number of failed checks (0 = ship). Runs against a fresh build
(`--build` implied) and a fresh browser context per phase. Every check has a threshold in
`gate/thresholds.json`; every check prints `PASS|FAIL  <id>  <value><unit>  (limit <threshold>)`.

### 5.1 Phases

| # | Phase | How measured | Fields |
|---|---|---|---|
| G1 | Cold boot | 3 fresh contexts; nav -> `__trials.ready`; then `ready -> first render(true)` | `boot.p50`, `boot.max`, `boot.firstFrameMs` |
| G2 | Clear a track | `runRecording(inputs/<track>/bot-oracle.json)`; `finishTime` bit-equal to `expected.json`, `faulted === null`, `hashState()` equal | `clear.*` |
| G3 | Crash | `runRecording(inputs/<track>/crash.json)` (full gas + lean back into the first obstacle; produced by `bot --crash-probe`, which searches for the earliest `crash` fault); assert `fault{reason:'crash'}` within 8 s sim | `crash.faultTick` |
| G4 | Fault -> control | after G3: `setInput({throttle:1})`, step 1 tick at a time until `state.tick < previous` (respawn happened) AND `bike.vel.x > 0.05`; ticks * 1000/120 = ms | `fault.toControlTicks`, `fault.toControlMs` |
| G5 | Restart latency | at t=3 s of the clear replay, 20 reps: `t0=now; setInput({restart:true}); step(1); setInput({restart:false})`; assert `tick===0`, `checkpoint` correct, `faulted===null` after exactly 1 tick; then `render(true)` timing | `restart.ticks` (1), `restart.wallMs[]`, `restart.frameMs[]` |
| G6 | No countdown on restart | after G5, `setInput({throttle:1}); step(1)` must give `vel.x > 0` | `restart.noCountdown` |
| G7 | Capture sanity | `capture` of the clear replay with `--tail 0`; ffprobe frames == `ceil(ticks*fps/hz)`; end hash == G2 hash | `capture.*` |
| G8 | Perf | 5 s `perf`: draw calls, tris, textures MB, heap growth, physics us/tick, render submit ms | `perf.*` |
| G9 | Determinism | section 6 checks D1-D5, D7, D8 | `determinism.pass` |

### 5.2 Thresholds (`gate/thresholds.json`)

The file is the source of truth (CONTRACT §3); this is a copy:

```json
{
  "$comment": "Single source of truth for ship-gate thresholds (CONTRACT.md §3). Units in the key suffix. Changing a number here is a design decision; the gate reports value vs limit for every check.",
  "boot.readyP50Ms": 300,
  "boot.firstFrameMs": 900,
  "clear.golden": true,
  "clear.finishTimeBitEqual": true,
  "clear.hashOk": true,
  "crash.faultWithinS": 8,
  "fault.toControlMs": 500,
  "restart.ticks": 1,
  "restart.wallMsP95": 5,
  "restart.frameMsP95": 33,
  "restart.noCountdown": true,
  "heap.growthMBPer60s": 5,
  "bundle.jsGzipKB": 600,
  "perf.drawCallsMax": 300,
  "perf.trianglesMax": 500000,
  "perf.texturesMBMax": 96,
  "perf.physicsUsPerTickP95": 60,
  "perf.physicsUsPerTickP95Ragdoll": 80,
  "perf.renderSubmitMsP95": 4,
  "determinism.pass": true,
  "stranger.attemptsBandFactor": 1.5
}
```

`fault.toControlMs 500` is the manual-restart path (crash tick → restart mash → bike moving); it sits between Evolution's 350 ms hard cut and Rising's 750 ms (which includes the player's reaction). The auto-respawn path is reported alongside (CONTRACT §2.8 fixes it at 1.0 s). Scaffold measurements (boot 39-80 ms, restart 0.2 ms, restart -> frame 11.5 ms,
physics 6 us/tick, 9 draw calls) are far inside; the thresholds are where the finished game must still be.
Render `submit` ms is gated; synced ms is reported only, because SwiftShader inflates it ~10x.

`harness:gate --all-tracks` iterates `listTracks()` for G2-G7 (G1, G8, G9 once) and writes
`out/summary.json` with the latest `BotRunReport`, `StrangerSession` and `CompareReport` per track
alongside the gate result.

## 6. Determinism gate (`gate/determinism.ts`)

| # | Check | Assert | Cadence |
|---|---|---|---|
| D1 | Cross-load | same recording in 3 fresh page loads: identical `hashState()`, `finishTime`, `tick` | gate |
| D2 | Cross-encoding | `.json` vs `.bin` of the same recording: identical hash | gate |
| D3 | Node vs browser | `createSim().run(rec).hash` == browser hash (the bot's whole premise) | gate |
| D4 | Snapshot round-trip | node: run k, snap, run m -> h1; restore, run m -> h2; h1 == h2 for (k,m) in {(0,1),(37,7),(500,120),(1000,1200)}; also `restore` from a snapshot serialized through base64 (hook path) | gate |
| D5 | Chunking | browser `step(1)` x N == `step(N)` == `runRecording`; chunk sizes 1, 7, 15, 120 | gate |
| D6 | Live-vs-replay | play `KeyboardInput` in a RAF page under CDP `Emulation.setVirtualTimePolicy` with frame jitter {8,16,33,50} ms, `stopRecording()`, replay in harness mode: same hash | nightly |
| D7 | No state leak | load track B, run 600 ticks, load A, run rec -> same hash as A cold | gate |
| D8 | Pinned hash | 1200-tick canonical run hash equals `gate/expected.json`; changing physics without bumping it fails on purpose | gate |

On mismatch the tool bisects over `step` with hashes (<= 11 extra runs for 1200 ticks), prints
`firstDivergentTick` and `diffState()` paths, exits 1. Output `out/gate/determinism.json`.

## 7. Metric summary

| Metric | Definition | Source | Threshold |
|---|---|---|---|
| `botAttempts[k]` | faults + 1 in committed play at skill k, median of 3 seeds | `harness:bot` | monotone; `botAttempts[3] <= targetAttempts` |
| `botParTime` | oracle `finishTime` | `harness:bot --oracle` | <= 1.3x author par |
| `strangerAttempts` | CLI-logged attempts until clear | `harness:stranger` | median <= 1.5x `targetAttempts`; all clear |
| `strangerClearWallMs` | wall time to first clear | same | <= 20 min |
| `fault.toControlMs` | crash fault -> bike responds to throttle | gate G4 | <= 500 |
| `restart.ticks` / `restart.frameMsP95` | restart input -> reset state / synced frame | gate G5 | 1 / <= 50 |
| `restart.noCountdown` | throttle moves the bike on the first tick after restart | gate G6 | true |
| `boot.p50Ms` / `boot.maxMs` | nav -> `__trials.ready` | gate G1 | 800 / 1500 |
| `oursWinRate[manoeuvre]` | blind critic wins vs reference | `harness:compare` | >= 0.5 per shipped manoeuvre |
| `determinism.pass` | D1-D5, D7, D8 | `harness:determinism` | true |

## 8. JSON schemas (`harness/lib/schema.ts`)

```ts
export interface RunMeta { schema: 1; kind: string; runId: string; startedAt: string; wallMs: number; git: string; node: string; chromium?: string }

export interface FaultEvent { attempt: number; reason: FaultReason; tick: number; simTime: number; x: number; checkpoint: number }

export interface BotRunReport extends RunMeta {
  kind: 'bot'; trackId: string; seed: number; physicsHz: number; skill: Skill;
  config: BeamConfig | null; weights: ScoreWeights;
  outcome: 'finished' | 'maxAttempts' | 'timeout';
  attempts: number; faults: FaultEvent[]; faultsByCheckpoint: number[];
  finishTime: number | null; simSeconds: number; ticks: number;
  search: { plans: number; expandedTotal: number; ticksSimulated: number; planWallMs: { p50: number; p95: number; max: number } };
  recordingFile: string; nodeHash: string; browserHash: string | null; browserVerified: boolean;
}

export interface AttemptLog { n: number; endedBy: 'fault' | 'restart' | 'reset' | 'finish'; reason?: FaultReason;
  checkpoint: number; x: number; simTime: number; wallMs: number; calls: number }

export interface StrangerSession extends RunMeta {
  kind: 'stranger'; sessionId: string; trackId: string; seed: number; agent: string;
  cleared: boolean; attempts: AttemptLog[]; strangerAttempts: number;
  finishTime: number | null; calls: number; budget: { calls: number; minutes: number; exhausted: boolean };
  faultsByCheckpoint: number[]; firstCheckpointCalls: number | null;
  recordingFile: string; replayVerified: boolean; replayFaults: number; sheets: string[];
}

export interface CriticVerdict { i: number; seed: number; left: 'ours' | 'ref';
  winner: 'A' | 'B' | 'tie' | 'invalid'; winnerUnmasked: 'ours' | 'ref' | 'tie' | 'invalid';
  confidence: number; criteria: Record<string, { A: number; B: number; note: string }>; reasons: string[]; agent: string; wallMs: number }

export interface CompareReport extends RunMeta {
  kind: 'compare'; manoeuvre: string;
  ours: { file: string; sha1: string; recording?: string }; ref: { file: string; sha1: string; source: string };
  normalized: { durationS: number; fps: 30; frames: number; align?: [number, number] }; abMp4: string; abSheet: string;
  verdicts: CriticVerdict[]; n: number; wins: number; losses: number; ties: number; invalid: number;
  oursWinRate: number; positionBias: number; criteriaDelta: Record<string, number>; pass: boolean;
}

export interface GateCheck { id: string; value: number | boolean | string; limit: number | boolean | null; pass: boolean; unit?: string; note?: string }

export interface GateReport extends RunMeta {
  kind: 'gate'; trackId: string; build: { distBytes: number; buildMs: number };
  browser: { version: string; renderer: string; flagSet: string };
  checks: GateCheck[]; failed: number;
  boot: { runs: number[]; p50: number; max: number; firstFrameMs: number };
  clear: { finishTime: number; expected: number; hash: string; expectedHash: string; hashOk: boolean };
  crash: { faultTick: number; faultTime: number; reason: FaultReason };
  fault: { toControlTicks: number; toControlMs: number };
  restart: { ticks: number; wallMs: number[]; frameMs: number[]; noCountdown: boolean };
  capture: { frames: number; expectedFrames: number; hash: string; hashOk: boolean; file: string };
  perf: { drawCalls: number; triangles: number; texturesMB: number; heapGrowthMB: number;
          physicsUsPerTickP95: number; renderSubmitMsP95: number; renderSyncedMsP95: number };
  determinism: DeterminismReport;
}

export interface DeterminismReport extends RunMeta {
  kind: 'determinism'; recordingFile: string; ticks: number;
  checks: Array<{ id: 'D1'|'D2'|'D3'|'D4'|'D5'|'D6'|'D7'|'D8'; pass: boolean; hashes: string[]; firstDivergentTick?: number; diffPaths?: string[] }>;
  pass: boolean;
}
```

All reports are written with `writeJson()`, are self-describing (`kind`, `schema`), and use
`runId = <yyyymmdd-hhmmss>-<6 hex>`. `expected.json` shape:
`{ "<trackId>": { "oracle": { "finishTime": 9.8667, "hash": "948ef53c3fcd4ad7", "ticks": 1184 }, "canonical1200": "0143fe65da949eb2" } }`.

## 9. Build plan

Milestones in order; each has one acceptance test the parent runs on this headless machine. A milestone
is not done until its test passes and its outputs exist under `harness/out/`.

**M1 — Sim adapter + snapshot/restore.** `PhysicsWorld.snapshot/restore`, `harness/lib/sim.ts`,
`TrialsHook.snapshot/restore/drainEvents`, `hash.ts diffState`, `gate/determinism.ts` (D1-D5, D7, D8).
Accept: `pnpm harness:determinism harness/inputs/flat-test-clear.json` exits 0 with all 7 checks
`pass: true`; deliberately breaking `restore` (skip the RNG field) makes D4 fail with `diffPaths`
naming that field and a `firstDivergentTick`.

**M2 — Bot oracle.** `bot/{actions,score,beam,play,bot}.ts`, `pnpm harness:bot flat-test --oracle`.
Accept: 0 faults, `finishTime <= 1.05 x 9.8667` (the hand-made clear), search wall <= 30 s,
`browserVerified: true` via `harness:replay`, and `harness:capture` of the recording yields a clip whose
ffprobe frame count equals the expected count.

**M3 — Committed-play skills + difficulty curve.** `--skill 0..3 --seeds 3`, in-band restart, timeout.
Accept: on a track with one deliberate gap (`gap-test`, from the tracks builder) the median
`botAttempts` is monotone non-increasing over skills 0..3, skill 0 >= 2, skill 3 == 1; the recording's
`FLAG_RESTART` rising edges + 1 equals reported `attempts`; `harness:replay` reproduces the same fault
count and finish time.

**M4 — Ship gate v1.** `gate/{thresholds.json,expected.json,ship-gate.ts}`, `bot --crash-probe` writing
`inputs/flat-test/crash.json`, `harness:all` aliased. Accept: `pnpm harness:gate` exits 0 on `flat-test`
with every G1-G9 field populated in `gate.json`; editing `thresholds.json` to `"restart.ticks": 0` makes
it exit 1 with exactly one FAIL line; `rm -rf dist` then `harness:gate` still passes (auto-build).

**M5 — Stranger CLI + protocol.** `stranger/{cli,session,run-stranger}.ts`, `PROTOCOL.md`.
Accept: a scripted fake stranger (shell loop: `play`, `play`, `restart`, `play` into a crash, `done`)
yields `session.json` with `attempts.length == 2`, an embedded recording that passes `harness:replay`
with `replayFaults == 1`, and the 151st call answers `budget: exhausted`. Then one real sub-agent
stranger clears `flat-test` in <= 10 calls with `cleared: true`.

**M6 — Blind compare.** `compare/{normalize,mask,critic,compare}.ts`, `RUBRIC.md`.
Accept: `harness:compare --ours X --ref X --manoeuvre fault-respawn --n 4` with the same file on both
sides gives `ties + invalid == 4` or a reported `positionBias`; with `--ours <capture of flat-test> --ref
reference/crash-restart-ui/clips/02-*.mp4` all 4 verdicts parse, a probe inside the critic sandbox gets
`EACCES` on `key.json`, and `compare.json` shows both `left` values across the 4 seeds.

**M7 — Metrics on real tracks.** With real physics and >= 3 tracks: bot skills 0-3 x 3 seeds, 2
strangers per track, compare on `wheelie-launch`, `fault-respawn`, `countdown-go`.
Accept: each track has 12 `BotRunReport`, 2 `StrangerSession`, 3 `CompareReport` under `out/`; the
round summary quotes `botAttempts`, `strangerAttempts`, `fault.toControlMs`, `oursWinRate` from those
files; at least one track meets every threshold in section 7.

**M8 — Nightly.** D6 live-vs-replay under virtual time, `harness:gate --all-tracks`, `out/summary.json`.
Accept: `--all-tracks` over 5 tracks finishes in <= 10 min and exits with the failed-check count; D6
passes on `flat-test` for jitter {8, 16, 33, 50} ms; `summary.json` has one entry per registered track.
