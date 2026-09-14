# Binding contract between areas

This file wins over every other doc in `docs/design/`. Where a design doc
disagrees with this file, the design doc is wrong; owners update their doc to
match. The TypeScript in `src/core/types.ts` and the barrels
(`src/physics/index.ts`, `src/render/index.ts`, `src/audio/index.ts`,
`src/ui/index.ts`, `src/tracks/index.ts`) are the executable form of this file.
Only the **core-game owner** edits `src/core/**`; others request changes.

## 0. Ownership (one checkout, no worktrees, builders never touch another owner's paths)

| owner | paths | also owns |
|---|---|---|
| core-game | `src/core/**`, `src/game/**`, `src/ui/**`, `src/main.ts`, `index.html`, `public/**`, `package.json`, `vite.config.ts`, `tsconfig*.json`, eslint config | `docs/design/game.md`, run clock, fault counter, countdown, auto-respawn, input devices (keyboard/gamepad/touch), quality tiers, menus, HUD |
| physics | `src/physics/**` | `docs/design/physics.md`, all feel numbers |
| tracks | `src/tracks/**` | `docs/design/tracks.md`, `compileTrack`, curriculum, per-track metrics targets |
| render | `src/render/**` | `docs/design/rendering.md`, track/obstacle meshes, bike, rider, ragdoll visuals, camera, post, particles, biomes |
| audio | `src/audio/**` | `docs/design/audio.md` |
| harness | `harness/**`, `reference/**` | `docs/design/harness-metrics.md`, bot, stranger, blind compare, ship gate, thresholds |

The parent commits. Nobody runs `git commit`. Nobody uses `rm -r`/`rm -rf`/`find -delete`
(a guard hook prompts the human) — overwrite in place or use `trash <path>`.

## 1. Units, frames, time

- SI. Metres, seconds, kg, radians (degrees only in authoring params named `*Deg`).
- Physics is 2D in XY: +x along the course, +y up, angles CCW, 0 = level facing +x.
- Render adds z: centreline z = 0, rideable ribbon z ∈ [-1.5, +1.5] (3 m wide, the
  collision width is irrelevant — physics is 2D), decorative apron to ±3 m, props behind
  at z ∈ [-14, -4], foreground occluders z ∈ [+4, +9], parallax layers z ∈ [-40, -350].
  Camera sits at +z.
- Fixed physics step, 120 Hz (`DEFAULT_PHYSICS_HZ`). No `performance.now`, `Date`,
  unseeded `Math.random`, or frame delta anywhere in `src/physics`, `src/tracks`,
  `src/audio/model`, or in anything the renderer uses to decide *what* to draw.
  Render effects are clocked from simulated time `tSim = prev.time + alpha*(cur.time-prev.time)`
  plus the game's run clock.
- **Timer semantics (C1).** `PhysicsState.tick/time` reset to 0 on every `reset()` — they are
  segment time. The **game** owns the **run clock**: starts at GO, runs continuously through
  crashes and restarts (Trials rule), stops at finish. `PhysicsState.finishTime` is the segment
  time at the finish crossing; `Game.runTime()` / `hook.runTime()` is what the HUD shows and what
  every metric calls "finish time". The **game** owns the **fault counter**: +1 per `fault`
  event of any reason including manual `restart` (Trials rule). `attempts = 1 + faults`.

## 2. Shared types (authoritative copy lives in `src/core/types.ts`)

Additions to the scaffold types; nothing existing is removed.

```ts
export type SurfaceKind = 'dirt'|'wood'|'metal'|'concrete'|'rubber'|'grate'|'stone'|'snow';
export type BiomeId = 'industrial'|'canyon'|'snow'|'nightCity'|'foundry';

export interface CameraKey {           // authored per track by tracks; consumed by render only
  x0: number; x1: number;              // world x range this key applies to (blend outside)
  mode?: 'side'|'side-tight'|'high34'|'low';
  yaw?: number; pitch?: number; dist?: number; roll?: number;   // radians / metres, override mode
  zoomBias?: number;                   // -1..1, tighter/wider than the speed-driven default
  blend?: number;                      // seconds to blend into this key (default 0.7)
  cut?: boolean;                       // hard cut instead of blend
}
export interface TrackMeta {
  biome: BiomeId;
  technique: string;                   // the one thing this track teaches
  demands?: string;                    // the thing it then demands
  camera?: CameraKey[];
  attemptsBand?: [number, number];     // stranger attempts-to-clear target band
  targetTimeS?: number;
  hints?: string[];                    // HUD button hints (beginner tier only)
}
// TrackDef gains: meta?: TrackMeta
```

### 2.1 Obstacle vocabulary (C8) — tracks authors, tracks compiles, nobody else parses params

`TrackObstacle.kind` ∈ `ramp | plank | drum | gap | wall | seesaw | logpile | stair | box | pole | barrel | ledge`.
**`loop` is cut** (no reference footage). Params use full words:
`length height width depth radius angleDeg thickness curve count spacing surface`.
Every kind has documented defaults in `src/tracks/kinds.ts`. The surface key is `surface: SurfaceKind`.

### 2.2 Compiled track (C9) — the only thing physics, render and audio read

```ts
export interface ColliderBase { id: number; surface: SurfaceKind; obstacleIndex: number | -1 }
export interface ColliderPolyline extends ColliderBase { kind: 'polyline'; points: Vec2[]; oneWay?: boolean }
export interface ColliderCircle   extends ColliderBase { kind: 'circle'; center: Vec2; radius: number; rolls?: boolean /* drum spins under the tyre */ }
export interface ColliderBox      extends ColliderBase { kind: 'box'; center: Vec2; halfW: number; halfH: number; angle: number }
export interface ColliderSeesaw   extends ColliderBase { kind: 'seesaw'; pivot: Vec2; halfLength: number; thickness: number; maxAngle: number; mass: number }
export type Collider = ColliderPolyline | ColliderCircle | ColliderBox | ColliderSeesaw;
export interface HazardZone { id: number; kind: 'fire'|'water'|'kill'; min: Vec2; max: Vec2 }
export interface PlacedObstacle { kind: string; pos: Vec2; params: Record<string, number|string|boolean>; colliderIds: number[] }
export interface CompiledTrack {
  def: TrackDef;
  colliders: Collider[];               // exact rideable geometry; render draws THESE surfaces
  hazards: HazardZone[];
  placed: PlacedObstacle[];            // resolved params (defaults filled) for render bodies
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  oobY: number;                        // bounds.minY - 6; below this = 'out-of-bounds'
  hash: string;                        // FNV-1a over colliders; golden-tested per track
}
export function compileTrack(def: TrackDef): CompiledTrack;   // src/tracks/compile.ts, pure, deterministic
```

Rules: polylines are oriented with the **solid on the right of travel** (ground runs +x, so
its normal points +y); `oneWay` polylines collide only from their normal side. Obstacle
`pos.y` is the base reference — heights are `pos.y + height`. Seesaw is the only dynamic collider; drums with `rolls` spin about their centre with an
inertia physics chooses (they do not translate). Polylines are the ground profile plus every
static obstacle outline, merged so no surface is double-registered. `obstacleIndex` points into
`def.obstacles` (-1 = ground profile).

### 2.3 Physics world (C10, C16, C17)

```ts
export interface PhysicsWorld {
  readonly physicsHz: number;
  loadTrack(track: CompiledTrack, seed: number): void;
  reset(checkpoint: number): void;     // -1 = start. Places bike per 2.4. tick=0.
  step(input: InputFrame): void;
  getState(): PhysicsState;
  drainEvents(): GameEvent[];
  snapshot(): PhysicsSnapshot;         // MUST include rng, latches, contact caches, seesaw/drum state
  restore(s: PhysicsSnapshot): void;   // restore(snapshot()) then step×m hashes == straight run
}
export type PhysicsSnapshot = { v: 1; f64: Float64Array; u8: Uint8Array };
```

`PhysicsState` additions (all plain data, all hashed):

```ts
input: { throttle: number; brake: number; lean: number };   // the quantized input applied this tick
engine: { rpm: number; throttleEff: number; limiter: boolean };
contacts: { rear: SurfaceKind | null; front: SurfaceKind | null };
rearSlip: number;                    // rear.spinVel*R - groundSpeed along bike x, m/s, >0 = wheelspin
hopPhase: 'idle'|'preload'|'push'|'recover';
ragdoll: RagdollBody[] | null;       // non-null from the crash tick until reset; render draws exactly this
seesaws: { id: number; angle: number; angVel: number }[];
drums:   { id: number; spin: number }[];
```
```ts
export interface RagdollBody { id: 'head'|'torso'|'pelvis'|'upperArm'|'forearm'|'thigh'|'shin'; pos: Vec2; angle: number }
```
`FaultReason` gains `'hazard'`. `GameEvent` gains `{type:'countdown'; n: 3|2|1}`, `{type:'go'}`,
`{type:'land'; impulse: number; wheel: 'rear'|'front'; surface: SurfaceKind}` (physics emits `land`;
the game emits countdown/go).

Engine numbers are physics' (idle 1500 rpm, redline 10 000, limiter cuts at 10 000 / re-arms 9 500);
audio consumes `state.engine`, never re-derives rpm. There is **one ragdoll** — the physics one —
and render draws `state.ragdoll`. Render's cosmetic Verlet ragdoll is cut.

### 2.4 Spawn (M3)

`TrackCheckpoint.spawn.pos` and `TrackDef.start.pos` are the **rear wheel contact point on the
ground**; `angle` is the frame angle. Physics places rear wheel centre at `pos + n*R`, front wheel
`wheelbase` further along the frame axis, and frame/rider at static sag; `reset(-1)` == start.
Tracks guarantees the ground under both wheels at a spawn is a single flat polyline segment.

### 2.5 Feel envelope (C2–C7) — physics owns the numbers; tracks authors to these until measured

| quantity | value |
|---|---|
| total mass | 145 kg (bike 70, rider 75), COM 0.45 m above axle line at neutral lean |
| wheelbase / wheel radius | 1.30 m / 0.34 m |
| 0 → 16 m/s on flat dirt | ≤ 3.5 s (≈ 5 m/s² average, more off the line) |
| top speed (limiter) | 20 m/s |
| brake from 10 m/s, dirt | stop in ≤ 4.5 m (≥ 11 m/s²) |
| stationary bunny hop | rear-wheel apex 0.55–0.75 m above take-off; with 5 m/s run-up a 0.9 m ledge is makeable |
| climb | sustained on ≤ 60° with lean forward; 65° stalls and rolls back; > 70° needs a hop |
| wheelie balance | balance pitch 40–50° at lean 0; PD controller holds indefinitely; open-loop diverges in 1–2 s |
| crash | head or torso contacts any collider; ANY body incl. wheels enters a hazard zone (fire/water/kill); `y < oobY`. Over-rotation alone is NOT a crash |
| restart → riding | one physics tick; one rendered frame (hard cut, no fade) |

Tracks' section 0 must be regenerated from physics' F-tests once physics M2 lands; until then
author with 20 % margin against this table. The bot, not the author, decides whether a track is clearable.

### 2.6 Track meta consumers (C13, C14, C15)

Render and audio read `def.meta.biome` (5 biomes, render adds `foundry`). Render reads
`def.meta.camera`. There is **one** track mesh builder, owned by **render**, in
`src/render/world/{track,obstacles}.ts`, consuming `CompiledTrack` (colliders for the exact ridden
surfaces so what you see is what you ride; `placed` for bodies/decoration). Budget per loaded
track: ≤ 80 k triangles, ≤ 20 draw calls for track+obstacles.

### 2.7 Renderer / audio / HUD interfaces

```ts
interface GameRenderer {                 // existing +
  setTrack(track: CompiledTrack): void;  // was TrackDef
  onEvent(e: GameEvent): void;
  setQuality(tier: 'low'|'medium'|'high'): void;
  camera(): { pos: Vec2; dist: number; bikeScreenX: number; bikeScreenY: number; bikeHeightFrac: number };
  setRunInfo(info: { runTime: number; phase: GamePhase }): void;   // for kinetic text
  setGhost?(state: PhysicsState | null): void;  // PB ghost bike, drawn translucent; game steps it in lockstep
}
interface AudioSystem {                  // existing +
  update(state: PhysicsState, dt: number, input: InputFrame): void;
  renderOffline?(recordingJson: string, seconds: number): Promise<Float32Array>;  // harness
}
interface Hud {                          // existing +
  setRun(info: { runTime: number; faults: number; phase: GamePhase; checkpoint: number; checkpointCount: number }): void;
}
export type GamePhase = 'menu'|'countdown'|'riding'|'crashed'|'finished';
```

### 2.8 Game rules (M1) — core-game owns; harness gates against these

- Track start: 3-2-1-GO at 1.0 s cadence (`countdown` events, then `go`). Bike is held until GO;
  throttle before GO does nothing (no jump-start penalty).
- Checkpoint restart: instant, no countdown, run clock keeps running.
- Crash: physics ragdolls; game injects a restart **1.0 s** after the crash unless the player
  restarts earlier. Manual restart is available from the crash tick.
- Restart tap = last checkpoint. Restart **hold 0.6 s** = full track restart (run clock and
  faults reset, countdown again).
- Finish: run clock stops; results (time, faults, medal vs `meta.targetTimeS`) after 0.4 s.
- Inputs: keyboard (↑/W throttle, ↓/S brake, ←/A lean back, →/D lean forward, Enter/R/Backspace
  restart, Esc menu); gamepad (RT throttle, LT brake, left stick x lean, B/circle restart);
  touch (left half: two lean zones, right half: brake left / throttle right; restart button
  top-right; ≥ 44 pt targets). There is **no hop button** — the hop is a technique (preload by
  leaning back with throttle, snap forward) implemented in physics from `lean`/`throttle`.
- Mobile: DPR cap 2 (1.5 on phones), `setQuality` auto-selected from a first-frames probe,
  audio unlocked on first touch/key, `viewport-fit=cover`, no scroll/zoom, landscape prompt in portrait.

### 2.9 Hook additions (`window.__trials`)

```ts
snapshot(): string;  restore(b64: string): void;   drainEvents(): GameEvent[];
runTime(): number;   faults(): number;  phase(): GamePhase;
marks(): { checkpoints: number[]; finishX: number; start: number };
camera(): ReturnType<GameRenderer['camera']>;
setQuality(t: 'low'|'medium'|'high'): void;
audio?: { renderOffline(recordingJson: string, seconds: number): Promise<Float32Array> };
skipCountdown(): void;   // harness convenience; a replay records ticks from GO
```

## 3. Evaluation (C11, C12, C18) — harness owns

- **One bot**: `harness/bot/**` per harness-metrics.md §2 (beam search over 15-tick action
  atoms, skill levels 0–3 + oracle, in-band restart). Physics' closed-loop controllers move to
  `src/physics/controllers/` and are used only by physics F-tests. `pnpm harness:bot <trackId>`.
- **One stranger**: `harness/stranger/**` per harness-metrics.md §3; budget 150 calls or 25 min;
  pass = median attempts ≤ 1.5 × `meta.attemptsBand[1]`.
- **attempts** = 1 + fault events (all reasons, including manual restarts; the auto-restart after a
  crash is not a second fault). Metrics JSON committed under `harness/out/metrics/`.
- **Thresholds** live only in `harness/gate/thresholds.json`: boot `ready` p50 ≤ 300 ms, first frame
  ≤ 900 ms; textures ≤ 96 MB; draw calls ≤ 300; triangles ≤ 500 k; physics µs/tick p95 ≤ 60
  (≤ 80 while ragdolling); restart → synced frame ≤ 33 ms; heap growth ≤ 5 MB over 60 s of play;
  JS bundle ≤ 600 KB gzipped; determinism: two replays hash-identical, `restore(snapshot())` identical.
- Texture generation happens **after** `installHook` and is budgeted (≤ 400 ms total on desktop).
- Corpus gaps: harness sources seesaw + stairs reference clips; `loop` is cut from the curriculum.

## 4. Round protocol

Each owner works in rounds. A round = build → own verification (typecheck, vitest, the harness
command for your area) → report to the parent with the *finding* (one sentence) and the evidence
path (clip/sheet/JSON). The parent commits once per round with the finding as the subject. Every
third round the parent runs the ship gate: cold boot, clear a track by replay, crash, instant restart.
Clips, not stills, are evidence: if you changed how something moves, capture a clip of it moving.
