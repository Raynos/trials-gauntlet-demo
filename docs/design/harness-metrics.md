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
  lib/sim.ts                  node-side PhysicsWorld factory + snapshot/restore + event drain   [new]
  lib/metrics.ts              attempt counting, latency extraction from event streams          [new]
  lib/schema.ts               TS types for every JSON written under out/ (section 8)           [new]
  bot/
    actions.ts                macro-action vocabulary (2.1)
    score.ts                  progress heuristic (2.2)
    beam.ts                   beam search core (2.3)
    play.ts                   committed-play driver: search -> commit -> fault -> restart (2.4)
    bot.ts                    CLI: pnpm harness:bot <trackId> [--skill 0..3] [--oracle] [--seeds 3]
  stranger/
    cli.ts                    the ONLY tool a stranger sub-agent gets (3.2)
    session.ts                long-lived page + append-only attempt log + recording assembly
    PROTOCOL.md               text handed verbatim to the stranger
    run-stranger.ts           parent-side: spawns the sub-agent, enforces budget, collects session.json
  compare/
    normalize.ts              trim/scale/pad both clips to 1280x720 @30fps, same duration
    mask.ts                   seeded L/R shuffle, hstack mp4 + 2xN contact sheet, key file
    critic.ts                 builds the critic prompt, parses/validates the verdict JSON
    compare.ts                CLI: pnpm harness:compare --ours a.mp4 --ref b.mp4 --manoeuvre <tag> [--n 4]
    RUBRIC.md                 criteria per manoeuvre handed to the critic (4.3)
  gate/
    thresholds.json           every number in 5.2, one place
    expected.json             pinned finish times + hashes per track (bumped deliberately)
    ship-gate.ts              CLI: pnpm harness:gate [--track flat-test] [--all-tracks]
    determinism.ts            CLI: pnpm harness:determinism <input> [--loads 3]
  inputs/
    <trackId>/bot-oracle.json           0-fault reference replay (bot, unlimited rewinds)
    <trackId>/bot-skill<k>.json         committed-play replays, k = 0..3
    <trackId>/stranger-<sessionId>.json what the stranger actually played
    <trackId>/crash.json                deterministic crash for the gate
  out/                        (gitignored)
    bot/<trackId>/<runId>.json
    stranger/<trackId>/<sessionId>/{session.json,attempts/NNN.json,sheets/NNN.jpg}
    compare/<manoeuvre>/<runId>/{ab.mp4,ab-sheet.jpg,verdict-<i>.json,key.json,compare.json}
    gate/gate.json  gate/determinism.json  summary.json
```

New package scripts: `harness:bot harness:stranger harness:stranger-cli harness:compare harness:gate
harness:determinism`. `harness:all` becomes an alias of `harness:gate`.

## 2. Bot player

### 2.0 Sim contract additions (owned by physics, required by the bot)

```ts
// src/physics/index.ts (additions)
export interface PhysicsWorld {
  // ...existing loadTrack / reset / step / getState / drainEvents
  /** Opaque, plain-data, structured-cloneable. Must include RNG state, latches, contact caches. */
  snapshot(): PhysicsSnapshot;
  restore(s: PhysicsSnapshot): void;
}
export type PhysicsSnapshot = { v: 1; f64: Float64Array; u8: Uint8Array };
```

Contract test (section 6, D4): `restore(snapshot())` then `step x m` hashes identically to the straight
run. `TrialsHook` gains `snapshot(): string` (base64) / `restore(b64: string)` / `drainEvents(): GameEvent[]`
so the stranger CLI and gate can use them from the browser too. `hash.ts` gains
`diffState(a, b): string[]` (dotted paths of differing fields) for failure reports.

```ts
// harness/lib/sim.ts
export interface Sim {
  world: PhysicsWorld; track: TrackDef; hz: number;
  step(input: InputFrame): GameEvent[];        // one tick, returns drained events
  run(frames: Iterable<InputFrame>): { state: PhysicsState; events: GameEvent[]; hash: string };
  snap(): PhysicsSnapshot; restore(s: PhysicsSnapshot): void;
  hash(): string;                              // hashPhysicsState(world.getState())
}
export function createSim(trackId: string, seed: number, hz = DEFAULT_PHYSICS_HZ): Sim;
```

### 2.1 Action vocabulary

Physics runs at 120 Hz; searching per tick is hopeless. The bot searches over **macro-actions**: one
quantized `InputFrame` held for `HOLD` ticks. Vocabulary `A` (13 actions):

```ts
// harness/bot/actions.ts
export interface Macro { id: number; name: string; frame: InputFrame; holdTicks: number }
export const HOLD = 15;                                   // 125 ms; 8 decisions per second
export const ACTIONS: Macro[] = [
  m('coast',         { throttle: 0,   brake: 0, lean: 0    }),
  m('gas',           { throttle: 1,   brake: 0, lean: 0    }),
  m('gas-back',      { throttle: 1,   brake: 0, lean: -1   }),   // wheelie launch
  m('gas-fwd',       { throttle: 1,   brake: 0, lean: 1    }),   // climb, nose down
  m('half-gas',      { throttle: 0.5, brake: 0, lean: 0    }),
  m('half-gas-back', { throttle: 0.5, brake: 0, lean: -0.5 }),
  m('brake',         { throttle: 0,   brake: 1, lean: 0    }),
  m('brake-fwd',     { throttle: 0,   brake: 1, lean: 1    }),
  m('lean-back',     { throttle: 0,   brake: 0, lean: -1   }),
  m('lean-fwd',      { throttle: 0,   brake: 0, lean: 1    }),
  m('hop',           { throttle: 0.6, brake: 0, lean: -0.6, hop: true }, 6),  // 6 ticks hop edge, 9 coast
  m('gas-hop',       { throttle: 1,   brake: 0, lean: 0,    hop: true }, 6),
  m('tap-gas',       { throttle: 1,   brake: 0, lean: 0    }, 4),             // 33 ms blip, 11 coast
];
```

Every action expands to exactly `HOLD` ticks (short ones padded with `coast`) so the tree is uniform:
depth d = 125 ms * d. Values are on the u8/i8 quantization grid (`quantizeInput` is identity on them),
so recordings round-trip exactly and node and browser see identical bytes.

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
lean -1..1 (negative = lean back), hop. The bike starts stationary at x=0 facing +x.
Cross the finish without crashing. A crash returns you to the last checkpoint; the clock keeps running.
Tool: `pnpm harness:stranger-cli <cmd>`
  status              -> JSON: x, vx, angle_deg, grounded, checkpoint, faults, time, finishX
  play "<slots>"      -> apply slots, e.g. "g8 gb4 c2 h1 g6"   (g gas, gb gas+lean back, gf gas+lean fwd,
                         hg half gas, c coast, b brake, bf brake+lean fwd, lb lean back, lf lean fwd,
                         h hop, gh gas+hop, t tap gas; number = slots of 125 ms, max 40 per call)
                         returns summary + events + path of an 8-frame contact sheet of what happened
  restart             -> back to last checkpoint (counts as an attempt)
  reset               -> back to the start line (counts as an attempt)
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

```json
{
  "boot.p50Ms": 800,            "boot.maxMs": 1500,          "boot.firstFrameMs": 400,
  "clear.finishTimeBitEqual": true, "clear.hashOk": true,
  "crash.faultWithinS": 8,
  "fault.toControlMs": 500,
  "restart.ticks": 1,           "restart.wallMsP95": 5,      "restart.frameMsP95": 50,
  "restart.noCountdown": true,
  "capture.framesOk": true,     "capture.hashOk": true,
  "perf.drawCallsMax": 400,     "perf.trianglesMax": 600000, "perf.texturesMBMax": 96,
  "perf.heapGrowthMBPer10s": 4, "perf.physicsUsPerTickP95": 60, "perf.renderSubmitMsP95": 4,
  "determinism.pass": true
}
```

`fault.toControlMs 500` sits between Evolution's 350 ms hard cut and Rising's 750 ms (which includes the
player's reaction). Scaffold measurements (boot 39-80 ms, restart 0.2 ms, restart -> frame 11.5 ms,
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
