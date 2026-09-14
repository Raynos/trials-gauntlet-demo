# Track system and curriculum

Status: design, v1. Owner: tracks builder. Consumers: physics, render, harness, game.
Fits the scaffold in `src/core/types.ts` (`TrackDef`, `TrackObstacle`, `TrackCheckpoint`,
`PhysicsWorld`) and the `flat-test` registry in `src/tracks/index.ts`. Everything below is
metres, seconds, radians unless stated. +x is track direction, +y up, +z toward the camera.

## 0. Numbers the design is built on

Bike (mock constants promoted to spec): wheelbase 1.30, wheel radius 0.34, bike+rider mass
~200 kg, CG 0.75 above axle line. Top speed 16 m/s on flat (mock has 14; raise), accel
~9 m/s^2 from rest (front lifts at >6 m/s^2 rear thrust — the corpus "wheelie launch in
~0.3 s"). Brake decel 16 m/s^2. Sustained wheelie speed ~4 m/s at 30-45 deg. Stationary
bunny hop: 0.9 m rise, 1.2 m forward reach, 1.2 s total (corpus clip 01). Rolling hop at
6 m/s: 1.1 m rise, 3.5 m reach. Climb speed: ~2 wheelbase/s on 50 deg, ~1 on 60 deg,
stall (roll back, no fault) above ~68 deg without a hop. Loop: r = 3.5 needs >= 13.1 m/s at
entry (v_top >= sqrt(g r) = 5.9). Jump table (flat landing, launch angle theta, speed v):

| v m/s | theta | range m | airtime s |
|------:|------:|--------:|----------:|
| 8 | 25 | 5.0 | 0.69 |
| 10 | 30 | 8.8 | 1.02 |
| 12 | 30 | 12.7 | 1.22 |
| 14 | 35 | 18.8 | 1.64 |
| 16 | 40 | 25.7 | 2.10 |

Fault rules (physics owns them, tracks depend on them): `crash` = rider head/torso capsule
touches any collider, or bike |pitch| > 100 deg with a wheel grounded. `out-of-bounds` =
bike centre enters a kill volume (every gap has one; the whole track has one at
y < min(profile.y) - 6). `restart` = player edge. Timer runs through faults (Evolution
rule, no +5 s); fault count is the co-headline. Respawn is a hard cut in one physics tick.

## 1. Track definition

### 1.1 Data model (extends core, all additions optional so `flat-test` still type-checks)

```ts
// src/tracks/schema.ts
import type { TrackDef, TrackObstacle, Vec2 } from '../core/types';

export type Surface = 'dirt' | 'wood' | 'metal' | 'concrete' | 'rubber';
// friction mu: dirt 0.9 (dust), wood 1.0 (tan puff), metal 0.75 (sparks), concrete 1.1, rubber 1.3

export interface Ramp      extends TrackObstacle { kind: 'ramp';    params: { length: number; height: number; curve?: number /* 0 flat, +1 quarter-pipe concave, -1 roller convex */; surface: Surface } }
export interface Plank     extends TrackObstacle { kind: 'plank';   params: { length: number; angleDeg: number; thickness?: number /* 0.15 */; surface: Surface } }
export interface Drum      extends TrackObstacle { kind: 'drum';    params: { radius: number; rolling: boolean; mass?: number /* 120 */; surface: Surface } }
export interface Gap       extends TrackObstacle { kind: 'gap';     params: { width: number; depth?: number /* kill volume 2 m below lip; default 3 */ } }
export interface Wall      extends TrackObstacle { kind: 'wall';    params: { height: number; width: number; lip?: number /* 0.1 grabbable ledge depth */; surface: Surface } }
export interface SeeSaw    extends TrackObstacle { kind: 'seesaw';  params: { length: number; pivotHeight: number; mass?: number /* 60 */; restTiltDeg?: number /* -12 = near end down */ } }
export interface LogPile   extends TrackObstacle { kind: 'logpile'; params: { logRadius: number; rows: number /* 3 -> 3+2+1 */ } }
export interface Stair     extends TrackObstacle { kind: 'stair';   params: { steps: number; rise: number; run: number; dir: 'up' | 'down'; surface: Surface } }
export interface Loop      extends TrackObstacle { kind: 'loop';    params: { radius: number; surface: Surface } }
export interface Box       extends TrackObstacle { kind: 'box';     params: { width: number; height: number; surface: Surface } }   // tabletop / container
export interface Pole      extends TrackObstacle { kind: 'pole';    params: { height: number; capRadius: number } }                 // pole-top hop target, r 0.25
export interface Barrel    extends TrackObstacle { kind: 'barrel';  params: { dynamic: boolean; burning?: boolean } }                // decor + hazard, r 0.3 h 0.9
export type Obstacle = Ramp | Plank | Drum | Gap | Wall | SeeSaw | LogPile | Stair | Loop | Box | Pole | Barrel;

export type CameraMode = 'side' | 'side-tight' | 'high34' | 'low' | 'top';
export interface CameraKey { x: number; mode: CameraMode; cut?: boolean; zoomBias?: number /* -1 tighter .. +1 wider */ }

export interface TrackMeta {
  technique: string;                 // "throttle control" — the ONE thing this track teaches
  demands: string;                   // where/how the track then demands it
  targetAttempts: [number, number];  // stranger attempts-to-clear band
  targetClearTime: number;           // competent stranger, seconds
  palette: 'warehouse-amber' | 'county-day' | 'foundry-ember' | 'night-blue' | 'snow-white';
  camera: CameraKey[];
  signs: { x: number; text: string }[];  // in-world plaques (checkpoint numbers, "SLOW", grade)
}
export interface GauntletTrackDef extends TrackDef { obstacles: Obstacle[]; meta: TrackMeta }
```

`TrackObstacle.pos` stays absolute world space (`pos.y` = obstacle base). Authoring helpers
resolve `pos.y` from the ground so authors never type y. `profile` stays piecewise-linear:
curved ground is baked to <= 0.25 m spacing at author time, so physics and render read the
same vertices. Core change requested (additive, optional): `meta?: unknown` on `TrackDef` is
not needed — `GauntletTrackDef` is structurally a `TrackDef`; the registry stores the wider
type and `getTrack()` callers that need meta narrow with `isGauntletTrack()`.

### 1.2 Authoring DSL

```ts
// src/tracks/author.ts
export function track(id: string, name: string, tier: TrackTier): TrackBuilder;

class TrackBuilder {
  // ground: cursor advances in x; y follows
  flat(len: number): this;
  slope(len: number, dy: number): this;                 // linear
  smooth(len: number, dy: number): this;                // cosine ease, baked @0.25 m
  rollers(len: number, amp: number, count: number): this;
  // obstacles at the cursor (advance cursor by footprint unless `{ hold: true }`)
  ramp(p: Ramp['params']): this;      plank(p): this;   drum(p): this;   gap(p): this;
  wall(p): this;  seesaw(p): this;  logpile(p): this;  stair(p): this;  loop(p): this;
  box(p): this;   pole(p): this;    barrel(p): this;
  tabletop(up: number, top: number, height: number, down = up): this; // ramp+box+ramp
  at(x: number): this;                                  // move cursor
  checkpoint(label?: string): this;                     // spawn = ground at cursor, angle = slope
  camera(mode: CameraMode, opts?: { cut?: boolean; zoomBias?: number }): this;
  sign(text: string): this;
  finish(runout = 12): GauntletTrackDef;                // finishX = cursor; adds runout + kill wall
  meta(m: Omit<TrackMeta, 'camera' | 'signs'>): this;
}
```

Invariants checked by `validateTrack(def): Issue[]` (unit-tested for every registered track):
profile x strictly increasing, |slope| <= 75 deg, checkpoint spawns on a collider with local
slope <= 20 deg and 2 m clear ahead, every gap has a kill volume, `finishX` > last
obstacle + 4, total length <= 400, no two static colliders overlap by > 0.02 (z-fighting),
`targetAttempts` band non-decreasing with tier, seed = `seedFromString(id)`.

### 1.3 Compilation: one def -> collision + mesh

```ts
// src/tracks/compile.ts
export type Collider =
  | { t: 'seg';  a: Vec2; b: Vec2; oneSided: boolean; mu: number; surface: Surface; id: number }
  | { t: 'circ'; c: Vec2; r: number; mu: number; surface: Surface; id: number }
  | { t: 'box';  c: Vec2; half: Vec2; angle: number; mu: number; surface: Surface; id: number };
export interface DynamicBodyDef {
  id: number; kind: 'hinge' | 'free';
  shape: Collider; mass: number; inertia: number;
  pivot?: Vec2; limitsDeg?: [number, number]; damping: number;
}
export interface Trigger { t: 'checkpoint' | 'finish' | 'camera' | 'kill'; x0: number; x1: number; y0: number; y1: number; payload: number }
export interface CompiledTrack {
  statics: Collider[];            // sorted by min x; physics broadphase = binary search on x
  dynamics: DynamicBodyDef[];     // fixed order == deterministic
  triggers: Trigger[];
  groundY(x: number): number;     // baked profile with gaps punched out (NaN inside gaps)
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  meshSpec: MeshSpec;             // render input, derived from statics + surfaces + decor seed
}
export function compileTrack(def: GauntletTrackDef): CompiledTrack;
```

Per-kind lowering (the whole contract between tracks and physics/render):
- `ramp`: `curve=0` -> one seg; `curve != 0` -> circular arc in 12 segs (length/height fix
  the chord, curve picks concave/convex). Convex rollers are two-sided.
- `plank`: rotated box `thickness` thick, one-sided top; bike hitting the underside slides.
- `drum`: circ; `rolling` -> `free` dynamic body (mu 0.8 vs ground, angular damping 0.2).
- `gap`: punches `[x, x+width]` out of the ground segs; adds kill trigger at
  `y < groundY - depth`. Lips get a 0.05 m chamfer seg so a wheel catching the edge rolls
  off predictably instead of jamming.
- `wall`: box; `lip` adds a 0.1 m one-sided ledge seg on top-front for the front-wheel
  "grab and pull up" move (Evolution obstacle-climbing clip 05).
- `seesaw`: `hinge` body, plank box length x 0.12, pivot at `pivotHeight`, limits +/-22 deg,
  rests on stop blocks (statics) either end.
- `logpile`: static circs in a pyramid, row pitch 1.9 r.
- `stair`: `steps` boxes; render merges to one stepped mesh.
- `loop`: 48 one-sided arc segs, normals inward, from angle -90 deg through 360 deg; ground
  under the loop stays. Exit == entry x, so the renderer offsets the loop ribbon in z by
  one track width (corkscrew look) while physics remains 2D.
- `box`: static box. `pole`: box shaft + circ cap. `barrel`: `free` body r 0.3 or static
  decor; `burning` adds a 0.6 m kill trigger above it (hazard fault, uses the fade respawn).

Mesh generation (`src/render/trackMesh.ts`): one `BufferGeometry` per surface material,
built by extruding each collider profile along z by track width 3.0 with 0.4 m skirts;
ground ribbon gets `groundY` sampled every 0.5 m, plus seeded (def.seed) side dressing:
tyre stacks, pallets, barrel rows, checkpoint posts (green neon panel + ground decal),
finish gate, number plaques from `meta.signs`. Vertex colour bakes the "worn line" decal
(reddish stripe, 0.6 m wide) down the rideable path. Budget: <= 60k tris, <= 12 draw calls
per track; the harness `stats()` gates it.

### 1.4 Physics contract additions (requested from physics owner)

```ts
export interface PhysicsWorld {
  // existing: loadTrack(def, seed) reset(cp) step(input) getState() drainEvents()
  loadCompiled(track: CompiledTrack, seed: number): void;   // physics never reads TrackDef directly
  saveState(): Uint8Array;  loadState(buf: Uint8Array): void; // bot search + stranger 'undo' are built on this
  contacts(): ReadonlyArray<{ colliderId: number; point: Vec2; impulse: number }>; // particles/audio
}
```

## 2. Curriculum: 5 tiers x 3 tracks

Rule: each track TEACHES one technique in a safe zone with a checkpoint right before it,
repeats it 2-3 times with rising stakes, then DEMANDS it once where failure costs the run
back to a checkpoint 15-30 s earlier. Every track has 2-4 checkpoints; checkpoints sit
on flat ground with 2 m run-in so a respawn is throttle-ready. Times are for a competent
stranger's first clear (with faults); "bot" is the recorded golden run.

Attempts bands: Beginner 1-2 | Easy 2-6 | Medium 5-12 | Hard 10-25 | Extreme 30-80.

### Beginner — palette warehouse-amber, camera mostly `side`, HUD shows button hints

**B1 `b1-first-gear` First Gear** — TEACHES throttle control (go / hold / stop).
Target 1 attempt, clear 16 s (bot 12.5). 130 m. CP at 40, 85.
- x 0-6 start pad, sign "HOLD THROTTLE". x 6-30 flat with painted stripes every 5 m.
- x 30-38 `slope` +1.2 (8.5 deg), 38-48 flat tabletop, 48-54 `smooth` -1.2. CP1 @40.
- x 54-70 `rollers` amp 0.3 count 3 — throttle steady, first suspension squash.
- x 70-80 `ramp` length 6 height 1.0 (9.5 deg) onto `box` 8 x 1.0, `ramp` down 6. CP2 @85.
- DEMANDS x 100-118: sign "SLOW". `slope` -2.0 over 10 (11 deg) into a flat 6 then a
  `wall` 1.2 high at 118 with a `gap`-free finish gate 4 m behind it: a rider who does not
  brake to < 4 m/s bumps the wall; at 6+ m/s the bike pitches over -> crash. Finish @124.
- Fail modes: none likely; the wall is the only fault source. Camera: `side` throughout.

**B2 `b2-lean-back` Lean Back** — TEACHES weight shift (lean back on drops and bumps).
Target 1-2, clear 20 s (bot 15). 150 m. CP at 35, 80, 115.
- x 0-20 flat. x 20-30 `logpile` r 0.3 rows 1 (single log), x 34 another, x 38 two logs
  0.6 apart. Sign "LEAN BACK" at 18. CP1 @35 (between logs, flat).
- x 45-60 `box` 15 x 0.5 with a 0.5 m drop off the end at 60 — first drop, dust puff.
- x 66-80 `box` 14 x 1.0, drop 1.0 at 80. CP2 @80 (landing zone, flat).
- x 88-100 `stair` 4 steps rise 0.3 run 0.6 `down` — lean back, no brake.
- DEMANDS x 108-140: `box` 12 x 1.8 reached by `ramp` 8 x 1.8 (12.7 deg); drop 1.8 at 128
  onto `slope` -1.0 over 6 (downhill landing, nose-over if leaned forward); flat to
  finish @146. CP3 @115 on the box top.
- Fail modes: nose-heavy landing off the 1.8 drop -> crash. Camera: `side`, cut to `low`
  at 105 for the big box, back to `side` at 130.

**B3 `b3-kicker-row` Kicker Row** — TEACHES jumping: hold throttle off a kicker, lean
forward in the air to level, land rear-first. Target 2, clear 24 s (bot 17). 170 m.
CP at 30, 75, 120.
- x 0-30 flat run-up, sign "FULL THROTTLE". CP1 @30.
- x 30-34 `ramp` 4 x 1.2 curve +0.3 (kicker ~20 deg); land on flat at ~40-44 (v ~9).
- x 50-54 kicker 4 x 1.5; `box` landing 56-66 at 0.8 high (uphill landing, lean fwd).
  x 66-70 `ramp` down. CP2 @75.
- x 80-85 kicker 5 x 2.0 (~25 deg) over a `barrel` row (decor, dynamic) at 88-92; landing
  `ramp` -2.0 curve -0.3 (downslope landing) at 94-100. CP3 @120.
- DEMANDS x 125-165: kicker 5 x 2.0 into `gap` width 6 at 130-136 (kill volume 3 m down),
  landing `box` 136-146 at 0.4. Need >= 8 m/s: full throttle from CP3 gives 11. Finish @168.
- Fail modes: throttle off before the lip (short -> gap), over-lean (loop out). Camera:
  `side` then `high34` from 78 (pull back during air), `side` again at 100.

### Easy — palette county-day, no button hints

**E1 `e1-uphill-weight` Uphill Weight** — TEACHES weight shift uphill: lean forward and
pulse throttle so the front stays down on steep planks. Target 2-4, clear 28 s (bot 20).
160 m. CP at 30, 70, 110.
- x 0-30 flat. Sign "LEAN FORWARD". CP1 @30.
- x 32-40 `plank` length 8 angle 30 (rise 4.0) onto `box` 40-48 at 4.0; `stair` 8 steps
  rise 0.5 run 0.5 `down` from 48-52. Flat to CP2 @70.
- x 72-79 `plank` 7 at 40 (rise 4.5) onto `box` 79-86 at 4.5; `ramp` down curve +0.4
  (quarter-pipe) 86-92. Flat, CP3 @110.
- DEMANDS x 112-135: `plank` 6 at 50 (rise 4.6, ~2 wheelbase/s so 2.3 s of climb) with a
  0.8 m `gap` at its foot (x 111-112) so there is no run-up — start from CP3 at 4 m/s,
  hop is not required but the front must be held down. `box` 118-124, `plank` 5 at 45
  down (roll, brake), finish @140.
- Fail modes: loop out (lean back) on the 50 deg plank -> crash; stall -> roll back onto
  the gap lip -> OOB. Camera: `side` with zoomBias -0.4 on the planks so pitch reads.

**E2 `e2-rear-wheel-first` Rear Wheel First** — TEACHES rear-wheel landing across gaps
(lean back in flight so the rear touches first, then throttle to pull the front through).
Target 3-5, clear 32 s (bot 22). 180 m. CP at 25, 70, 120.
- x 0-25 flat. CP1 @25. x 28-32 `ramp` 4 x 0.8 (11 deg), `gap` 3 at 32-35, flat landing.
- x 45-50 `ramp` 5 x 1.2, `gap` 4 at 50-54, landing `ramp` up 54-60 x 1.0 (uphill landing:
  rear-first is mandatory or the front spikes). CP2 @70.
- x 75-80 `ramp` 5 x 1.5, `gap` 6 at 80-86, landing on `box` 86-96 at 1.0 (higher than
  launch: needs v >= 9 -> full throttle from CP2). CP3 @120 after a `ramp` down.
- DEMANDS x 125-165: two gaps in a row: `ramp` 5 x 1.5 @125, `gap` 5 @130-135, landing
  `box` 135-141 at 0.6 only 6 m long, immediately `ramp` 3 x 1.0 @141 and `gap` 6 @144-150
  onto flat. Landing nose-first on the 6 m box kills the speed for gap 2. Finish @175.
- Fail modes: short (OOB), nose-in on the short box then short on gap 2. Camera: `high34`
  over each gap, `side` between; big-air zoom.

**E3 `e3-stairway` Stairway** — TEACHES stairs: throttle pulses up steps (front wheel
tap-tap), and braking on the way down without stoppie. Target 3-6, clear 36 s (bot 25).
170 m. CP at 30, 75, 125.
- x 0-30 flat. CP1 @30. `stair` 5 x (0.30 rise, 0.45 run) `up` @32, `box` top 6 m, `stair`
  5 `down` same. Flat to CP2 @75.
- x 78 `stair` 6 x (0.40, 0.45) `up` (steeper: ~42 deg envelope), `box` 4 m, `stair` 8 x
  (0.35, 0.40) `down` into a `smooth` -1.0 runout. Barrel row decor. CP3 @125.
- DEMANDS x 128-160: `stair` 7 x (0.45, 0.40) `up` (48 deg envelope, needs a hop-less
  wheelie tap on each step), `box` 3 m, then `stair` 10 x (0.40, 0.35) `down` ending in a
  `gap` 2 at 158-160: brake on the stairs, but release before the lip or you drop in.
  Finish @170.
- Fail modes: over-throttle -> loop out up the stairs; over-brake -> stoppie into the step
  edge (crash). Camera: `side-tight` on stairs (zoomBias -0.6).

### Medium — palette warehouse-amber (Bunny Hop lesson look), foundry-ember for M3

**M1 `m1-hop-up` Hop Up** — TEACHES bunny hop onto ledges from standstill (crouch with
`hop` held 0.4 s, release + lean back: front lifts, rear leaves 0.6 s later, land rear on
the ledge). Target 5-9, clear 40 s (bot 26). 160 m. CP at 20, 60, 100.
- x 0-20 flat, sign "HOP: hold + release". CP1 @20. `box` 0.5 high @26-34 (rollable
  without hop — the hop is optional here so the player can feel the timing), drop.
- x 40 `wall` 0.7 x 4 (not rollable: must hop). Drop. CP2 @60.
- x 66 `wall` 0.9 x 4 with lip 0.1 (a mistimed hop can still grab the lip and pull up).
  Drop. x 80 `wall` 0.9 x 1.5 then `gap` 1.5 (hop across from the top). CP3 @100.
- DEMANDS x 105-150: `plank` 6 at 25 onto `box` 111-115 at 2.8, `gap` 2.5 to `pole` cap
  r 0.25 height 2.8 @117.5 (hop, land rear on a 0.5 m target), `gap` 2.5 to `box` 120-126
  at 3.2 (hop up 0.4 across 2.5), drop 3.2 onto `ramp` -1.5 (lean back). Finish @155.
- Fail modes: early release (front only), no lean back (rear catches the wall -> crash),
  pole miss (OOB). Camera: `side-tight` with `cut` at 104 (the tight idle state of clip 08).

**M2 `m2-drum-roll` Drum Roll** — TEACHES drum balance: crawl onto a cylinder top, stay
on it with lean corrections (+/-5 deg wobble, ~1 s period), throttle blip off. Target 6-12,
clear 50 s (bot 30). 170 m. CP at 25, 70, 115.
- x 0-25 flat. CP1 @25. `drum` r 0.8 static @28 sunk 0.3 (a speed bump; roll it). `drum`
  r 0.8 static @36 on the ground: crawl over at <= 3 m/s.
- x 45-50 `logpile` r 0.3 rows 3 (pyramid 1.4 high): throttle pulses over. CP2 @70.
- x 74 `drum` r 1.0 static, x 78 `drum` r 1.0 static 4 m apart (`gap` between with kill 2
  down): drum to drum by hop. x 90 `drum` r 0.9 rolling (spool: it moves under you). CP3 @115.
- DEMANDS x 118-160: `box` 118-122 at 1.6, `drum` r 1.0 rolling @124.5 on a 1.6 shelf
  (hop from box onto a rolling drum, balance while it rolls 2 m to a stop block, hop off to
  `box` 130-134 at 1.6), `logpile` rows 4 (1.9 high) @138, `seesaw` length 6 pivot 1.0
  @148 rest -12 deg as the exit (preview of M3). Finish @170.
- Fail modes: rolling drum scoots the bike off backwards (crash or OOB in the gap), overshoot
  the top. Camera: `side-tight` on every drum (zoom state 40% per clip 03).

**M3 `m3-see-saw` See-Saw** — TEACHES see-saw timing (ride past the pivot slowly, let it
tip, roll off before the far end slams) and precision gaps onto narrow landings.
Target 8-12, clear 55 s (bot 34). 190 m. CP at 30, 80, 135.
- x 0-30 flat. CP1 @30. `seesaw` 6 pivot 0.8 @33: full speed launches you; the lesson is
  4 m/s. `seesaw` 8 pivot 1.2 @45 (slower tip, more airtime if rushed). CP2 @80.
- x 84 `seesaw` 6 pivot 1.5 leading onto `box` 92-96 at 1.5 (tip, roll straight onto the
  box: the far end lands on a stop block level with the box). `gap` 3 @96-99 onto `plank`
  4 at 0 (thin landing, 99-103, at 1.5). `ramp` down. CP3 @135.
- DEMANDS x 138-180: `ramp` 4 x 1.0 @138, `gap` 4 @142-146 onto `seesaw` 6 pivot 2.0 @146
  (land rear-first on the near end of a see-saw: it dips, you roll up, it tips), off its far
  end at 152 across `gap` 3 onto `plank` 3 at 0 (152-158 region at 2.0), `gap` 2.5 onto
  `box` 160-166 at 2.0 (hop), drop onto `smooth` -2.0. Finish @185.
- Fail modes: fast approach -> catapult; landing past the pivot -> slam -> ejected. Camera:
  `side` with `low` cut at 84 and 146 (see-saw silhouette against ember bloom).

### Hard — palette night-blue (H1, H2), foundry-ember (H3); flares mark landings

**H1 `h1-wheelie-wire` Wheelie Wire** — TEACHES sustained wheelie / rear-wheel balance: hold
30-45 deg at ~4 m/s through a low ceiling that clips the front wheel if it drops, and the
static rear-wheel balance on a box lip (Evolution clip 05). Target 10-18, clear 60 s
(bot 40). 200 m. CP at 30, 80, 130, 175.
- x 0-30 flat. CP1 @30. x 34-54: 20 m of `rollers` amp 0.15 count 6 under a ceiling `plank`
  (angle 0, two-sided, underside at 0.9 high): the front wheel must stay DOWN over the
  rollers — throttle modulation warm-up, the opposite skill. Then x 58-78: `plank` 20 at 0
  with a 0.15 m `gap` every 2.5 m (8 rail slots, kill volume 0.5 below): a front wheel on
  the ground drops into a slot -> stoppie crash; ride the section on the rear wheel. CP2 @80.
- x 84-90 `box` 6 at 1.4 with lip: front wheel onto the lip at ~5 m/s, throttle-hop the rear
  up (the "obstacle climb"). x 95-115 wheelie rails again, 3.0 m pitch, with `barrel` bumps.
  CP3 @130.
- x 134 `box` 1.6 with lip, rails 140-160 pitch 2.0 uphill (`slope` +2 over 20). CP4 @175.
- DEMANDS x 178-196: `box` 1.8 lip climb straight into 14 m of rails pitch 2.0 with a
  `gap` 4 at 192-196 that must be cleared from the wheelie (hop from rear wheel, corpus clip
  04 pole-top hops). Finish @204.
- Fail modes: front drops into a rail slot; over-rotate on the lip climb. Camera: `side`,
  zoomBias -0.3 so pitch reads; `low` cut at 178.

**H2 `h2-gap-chain` Gap Chain** — TEACHES precision gaps with speed control: each landing
platform is 3-5 m, each next gap needs a different speed, brake or throttle for <= 1.5 s
between. Target 14-22, clear 70 s (bot 42). 210 m. CP at 30, 90, 150.
- x 0-30 flat. CP1 @30. Chain A (x 32-70): `ramp` 4 x 1.0 / `gap` 4 / `box` 5 at 0.8 /
  `gap` 3 / `box` 4 at 1.2 / `gap` 5 / `box` 5 at 1.0 / `gap` 2 / flat. Speeds needed
  ~8, 6, 9, 5 m/s: read the gap width, set the speed. Flares mark each landing.
- Chain B (x 92-140): same grammar, 6 gaps, widths 5/3/6/2/4/6, platform heights step up
  0.4 each (landing above launch every time -> rear-first mandatory). CP2 @90, CP3 @150.
- DEMANDS x 152-200: chain C, 7 gaps, platforms 3 m (one bike length of slack), widths
  4/6/3/5/2/6/7, last one from a `seesaw` 5 pivot 1.0 launch (tips as you ride out: launch
  angle depends on timing). Finish @212.
- Fail modes: wrong speed (short = OOB, long = overshoot into next gap), nose-in on short
  platforms. Camera: `high34` throughout (landing kept in bottom third), `side` cut at 150.

**H3 `h3-loop-line` Loop Line** — TEACHES the loop (commit to >= 13 m/s, lean neutral, no
brake) and the technical stop straight after it. Target 18-25, clear 75 s (bot 45). 230 m.
CP at 30, 95, 165.
- x 0-30 flat. CP1 @30. x 32-62: 30 m flat run-up (16 m/s reachable), `loop` r 3.0 @62
  (needs 12.1), 12 m runout. Sign "COMMIT".
- x 80 `wall` 1.0 lip (climb) then `plank` 8 at 35 down into a second 22 m run-up and
  `loop` r 3.5 @115 (13.1 m/s; downhill gives it). Runout 8 m then `stair` 6 `down` (brake
  from 13 to 5 in 8 m). CP2 @95 (top of the plank), CP3 @165.
- DEMANDS x 168-220: run-up 18 m from a standing start at CP3 (max reachable ~15.5 m/s),
  `loop` r 3.5 @186, and 4 m after the exit a `gap` 3 onto `plank` 4 at 0 then `wall` 1.2
  with lip at 202: you exit the loop at ~13 m/s and must brake to ~4 in 6 m, hop the gap
  at low speed and grab the lip. Finish @225.
- Fail modes: throttle lift before the loop (fall from the top = inverted crash), no brake
  after (overshoot the plank), too much brake (drop in the gap). Camera: `side` wide
  (zoomBias +0.6) through loops, `top` cut at 60 for 1.5 s per Rising clip 04, `side-tight`
  at 195.

### Extreme — palette foundry-ember, crushed blacks, green checkpoint neon

**X1 `x1-vertical-limit` Vertical Limit** — TEACHES near-vertical planks (60-70 deg: hop at
the foot to convert speed to height, hang over the bars, tap throttle) and pole-top rear-wheel
hops. Target 30-45, clear 90 s (bot 55). 220 m. CP at 25, 70, 120, 170.
- CP1 @25. `plank` 5 at 55 (rise 4.1) onto `box` 4 at 4.1, `plank` 4 at 45 down. `plank` 5
  at 60 (rise 4.3, ~1 wheelbase/s: 3.3 s climbing) with 1.5 m run-in only. CP2 @70.
- x 74 `pole` h 1.2 cap r 0.25, poles every 1.8 m x 5, heights 1.2/1.5/1.8/2.1/2.4 (rear-wheel
  hops, clip 04), `box` 84-90 at 2.4, drop. x 96 `plank` 4 at 65 (rise 3.6) with a `wall` lip
  at the top (front-wheel grab). CP3 @120.
- x 124 `wall` 1.4 lip, `plank` 5 at 68 from its top, `pole` x 4 descending from 5.0 at 2.0 m
  pitch (hop down chain), CP4 @170.
- DEMANDS x 173-212: `plank` 6 at 70 (rise 5.6 — beyond climb speed: must hop at the foot
  from 8 m/s to carry 2 m up the face, then grind), `pole` x 3 at 5.6 pitch 2.2, `gap` 4
  from the last pole onto a `plank` 3 at -30 (downhill thin landing), `stair` 12 `down`
  (0.45/0.35) to the finish @220.
- Fail modes: stall on 70 deg -> roll back onto the run-in barrel (crash), pole miss (OOB),
  over-rotate on the downhill plank. Camera: `side-tight` on planks, `low` on the pole chains.

**X2 `x2-pipe-dream` Pipe Dream** — TEACHES rolling drums as moving platforms combined with
gaps and see-saw drops: land on a drum, ride it rolling to the gap edge, hop off. Target
40-60, clear 120 s (bot 65). 230 m. CP at 25, 75, 125, 180.
- CP1 @25. `drum` r 1.0 rolling @30 on a 6 m shelf between stop blocks, `gap` 3 to `box` at
  1.0. `logpile` rows 4. `drum` r 0.8 rolling on a `slope` -1 over 6 (it rolls away downhill
  as you land: match its speed). CP2 @75.
- x 80 `seesaw` 8 pivot 2.0 dropping onto `drum` r 1.2 static @92 (rear-wheel land on a drum
  top from 2 m), hop to `pole` cap @96 at 1.5, hop to `box` 98-104 at 1.8. `gap` 5 onto
  `drum` r 1.0 rolling in a 4 m trough (stops itself). CP3 @125.
- x 130-170: "the pipe run" — 5 rolling drums r 0.9 at 5 m pitch on individual 3 m shelves
  with 2 m gaps and kill volumes; each drum rolls 1 m before its stop block. Hop-land-ride-hop.
  CP4 @180.
- DEMANDS x 183-224: `seesaw` 6 pivot 2.5 onto `drum` r 1.0 ROLLING on a 4 m shelf (the drop
  starts it rolling toward the gap), `gap` 3 onto `drum` r 0.8 rolling on `slope` -1.5 over
  5 ending in a `gap` 4 (hop from a rolling, descending drum), `plank` 4 at 0 landing at 0,
  `wall` 1.6 lip, finish @232.
- Fail modes: mistimed hop off a rolling drum (drum leaves without you or takes you into
  the gap), drum-top landing bounce. Camera: `side-tight` with `high34` on the pipe run.

**X3 `x3-gauntlet` The Gauntlet** — DEMANDS everything: one instance of each of the 14 taught
techniques in the order they were learned, no teaching zone, checkpoints every 3 obstacles.
Target 60-80, clear 160 s (bot 85). 300 m. CP at 30, 75, 120, 165, 210, 255.
- 30-72: kicker+gap (B3), 50 deg plank (E1), double gap rear-first onto 6 m box (E2). CP2.
- 76-118: stair 7x(0.45,0.40) up, stair down into 2 m gap (E3), hop wall 0.9 then pole
  (M1), rolling drum on a shelf (M2). CP3.
- 122-163: seesaw landing (M3), lip climb into 10 m rails pitch 2.0 (H1), 5-gap chain with
  3 m platforms (H2). CP4.
- 168-208: 18 m run-up loop r 3.5 into brake-hop-lip (H3). CP5.
- 212-252: 70 deg plank with hop-at-foot, 3 poles at 5.6 (X1), seesaw onto rolling drum onto
  descending rolling drum into a 4 m gap (X2). CP6.
- 258-296: the finale, unseen combination: `loop` r 3.0 exiting straight onto a `seesaw` 8
  pivot 1.0 (exit ~12 m/s: it catapults unless you brake to 4 in 5 m), tip onto a `drum` r
  1.0 rolling toward a `gap` 6, hop across onto 3 `pole` caps at 3.0 pitch 2.4, drop 3.0 onto
  `plank` 4 at -35, finish gate @300 with a `wall` 2.0 at 306 (brake or fault after the line
  — the corpus gag).
- Camera: authored per section reusing the source tracks' keys.

### Curriculum summary

| id | technique | attempts | clear s | bot s | len m | CPs |
|---|---|---:|---:|---:|---:|---:|
| b1-first-gear | throttle control | 1 | 16 | 12.5 | 130 | 2 |
| b2-lean-back | weight shift on drops | 1-2 | 20 | 15 | 150 | 3 |
| b3-kicker-row | jump + level in air | 2 | 24 | 17 | 170 | 3 |
| e1-uphill-weight | weight shift uphill | 2-4 | 28 | 20 | 160 | 3 |
| e2-rear-wheel-first | rear-wheel landing | 3-5 | 32 | 22 | 180 | 3 |
| e3-stairway | stair pulses + descent brake | 3-6 | 36 | 25 | 170 | 3 |
| m1-hop-up | bunny hop onto ledges | 5-9 | 40 | 26 | 160 | 3 |
| m2-drum-roll | drum balance | 6-12 | 50 | 30 | 170 | 3 |
| m3-see-saw | see-saw timing, thin landings | 8-12 | 55 | 34 | 190 | 3 |
| h1-wheelie-wire | sustained wheelie, lip climb | 10-18 | 60 | 40 | 200 | 4 |
| h2-gap-chain | precision gaps, speed control | 14-22 | 70 | 42 | 210 | 3 |
| h3-loop-line | loop commit + post-loop stop | 18-25 | 75 | 45 | 230 | 3 |
| x1-vertical-limit | 60-70 deg planks, pole hops | 30-45 | 90 | 55 | 220 | 4 |
| x2-pipe-dream | rolling drums + gaps | 40-60 | 120 | 65 | 230 | 4 |
| x3-gauntlet | everything | 60-80 | 160 | 85 | 300 | 6 |

## 3. Measurement protocol

The metric (AGENTS.md) is attempts-to-clear and restart latency, from a bot and a stranger.
Every number below is produced by a harness command, written to `harness/out/metrics/
<trackId>/<runId>.json`, and judged by the parent from clips, never stills.

### 3.1 Definitions

- **Attempt**: the run segment from a (re)spawn to the next fault or the finish. The whole
  track's attempts-to-clear = `1 + faults` at first finish (any reason: crash, OOB,
  restart). Reported per track and per checkpoint segment (`attemptsByCp[]`), so the
  failing obstacle is named, not just the track.
- **Clear time**: `finishTime` of the first finish (timer runs through faults; respawn
  dead time is the physics tick count, i.e. zero wall). Also report `bestSegmentSum` =
  sum of best per-checkpoint segment times, the theoretical clean time for that player.
- **Restart latency**: three numbers, all measured on the harness. `simTicks` = ticks from
  the tick `restart:true` is applied to the tick where `state.checkpoint` spawn transform
  is in `getState()` (must be 1). `renderMs` = wall from `setInput({restart:true});
  step(1)` to `render(true)` returning (target < 30 ms SwiftShader, < 5 ms real GPU).
  `humanMs` (live mode only, `RafDriver`) = keydown timestamp to the first RAF frame that
  drew the respawned rider, via `performance.mark` pairs the hook exposes as
  `__trials.marks()` — target one frame (<= 16.7 ms at 60 Hz).
- **Cadence**: median fault-to-fault wall time on the hardest segment while the player
  re-attempts (bot: seconds of sim; stranger: wall incl. thinking). Corpus is ~3.0 s;
  the game must allow <= 1.0 s (CRASH! is skippable the moment it appears).

### 3.2 Bot (`pnpm harness:bot <trackId> [--budget N] [--greedy]`)

```ts
// harness/bot.ts — runs in node against the same physics bundle (no browser), then the
// winning recording is verified in the browser via harness:replay for byte-identity.
interface Macro { throttle: 0 | 0.5 | 1; brake: 0 | 1; lean: -1 | -0.5 | 0 | 0.5 | 1; hopAt?: number /* tick offset in the macro, 0..59 */ }
const MACRO_TICKS = 60;                       // 0.5 s at 120 Hz
const LIBRARY: Macro[] = enumerate();         // 3*2*5 + 30 hop variants = 60 macros
function score(s: PhysicsState, cp: CompiledTrack): number {
  if (s.faulted) return -1e9 + s.bike.pos.x;   // progress still breaks ties among deaths
  return s.bike.pos.x * 10 + s.bike.vel.x - Math.abs(s.bike.angle) * 4 + (s.finished ? 1e6 - s.time : 0);
}
// receding-horizon beam search: width W=8, depth D=6 macros (3 s lookahead), commit 1 macro,
// repeat. Rollouts use saveState/loadState; every macro sequence is a legal InputFrame
// stream so the committed path IS the recording.
export async function runBot(track: GauntletTrackDef, opts: { width: number; depth: number; budgetRollouts: number; greedy?: boolean }): Promise<BotResult>;
interface BotResult {
  cleared: boolean; recording: Recording; clearTime: number | null;
  faults: number;                // greedy mode: attempts-to-clear proxy; search mode: 0 expected
  rolloutsUsed: number; hardestSegment: { cp: number; rolloutsToPass: number };
  hash: string;                  // must equal harness:replay hash of `recording` in the browser
}
```

Two bot modes, two numbers per track:
- **search** (`W=8, D=6`, budget 200k rollouts ~ 1 M ticks ~ 10 s of node time at 6 us/tick):
  must clear every track — a track the bot cannot clear does not ship. Output is the golden
  recording `harness/inputs/golden/<trackId>.bin` (replayed in the browser to a byte-identical
  finish time; the physics gate) and `bot s` in the table above. `rolloutsToPass` per segment
  is the bot difficulty curve; it must be monotone-ish across tiers (Spearman rho >= 0.8
  against the stranger medians, else the curriculum is mis-ordered).
- **greedy** (`W=1, D=1`, no rollouts: pick the macro with the best 0.5 s score, online, no
  rewind): a deliberately dumb rider; `faults` before finish (cap 300) is the bot
  attempts-to-clear. Expected roughly 0.5-1x the stranger band; a Beginner track where greedy
  faults > 3 is too hard for Beginner regardless of what strangers do.

### 3.3 Stranger (`pnpm harness:stranger <trackId> --runs 3`)

A fresh sub-agent (no repo access, no design doc, no bot recordings) is spawned per run with
exactly this brief: the controls (throttle 0-1, brake 0-1, lean -1..1 back/forward, hop
edge, restart) and the REPL below. It plays through `harness/play.ts`, a stdin/stdout REPL
over `HookClient` in headless Chromium so the stranger exercises the shipped bundle:

```
> go 30 t=1 l=-0.3          # apply input for 30 ticks (0.25 s); t b l h(op) r(estart)
{ "x": 12.4, "y": 0.34, "v": 6.1, "pitch": 18, "wheels": "RF", "cp": 0, "faults": 0, "time": 2.250, "ahead": "ramp 4x1.2 in 5.6 m, then gap 3 m" }
> look 25                    # next 25 m of track as one text line: obstacle kinds, dims, heights
> snap                       # writes harness/out/stranger/<run>/<n>.png, returns the path (the agent may view it)
> restart                    # counts as a fault
> quit
```

`ahead` and `look` are generated from the def (`describeAhead(compiled, x, range)`), which is
what a human gets from the camera lookahead. Rules: no `saveState`/rewind, one process per
run, cap = 3x the upper target band in attempts or 150 REPL responses, whichever first
(cap hit = "did not clear", counted at the cap). Three runs per track, report median
attempts, median clear time, per-checkpoint attempts, and the stranger's own one-line
"what I was trying to do" per fault (free text, logged; the parent reads these to see whether
the taught technique is what they attempted). The stranger's session is captured as a clip
(`harness:capture` on its recorded inputs) so the parent judges played evidence.

### 3.4 Gates (per track, every round it is touched; ship gate every third round)

1. `validateTrack` no issues; `compileTrack` deterministic (hash of statics == committed).
2. Bot search clears; golden recording replays byte-identical in two fresh browser loads.
3. Restart: `simTicks == 1`, `renderMs < 30`, and a captured clip shows frame N ragdoll /
   frame N+1 upright at checkpoint with camera at rest (no settle wobble > 1 px over 3 frames).
4. Stranger median attempts inside `meta.targetAttempts`; if outside, edit the TRACK (widen
   the platform, lower the plank) and re-run — never the target. Tier medians non-decreasing.
5. Stranger median clear time within 0.7-1.5x `targetClearTime`.
6. Render budget: <= 60k tris, <= 12 draw calls, first-frame heap growth <= 5 MB per track.
7. Ship gate (every third round): cold boot < 100 ms to `ready`, load `x3-gauntlet`, replay
   golden to finish, inject a crash (`setInput` full lean back at 15 m/s), `restart`, all in
   one `harness:all` run with a clip.

## 4. Build plan

Milestones are ordered; each has one acceptance test the harness runs. Paths are the tracks
builder's (`src/tracks/**`, `src/render/trackMesh.ts`, `harness/{bot,stranger,play}.ts`,
`harness/inputs/golden/**`, this doc). Physics additions (1.4) are requested of the physics
owner at M2.

- **M1 Schema + DSL + validator** — `src/tracks/{schema,author,validate}.ts`; `flat-test`
  re-expressed through the DSL byte-identical to the current object. Accept:
  `pnpm test` includes `tracks.test.ts` asserting `validateTrack` returns [] for every
  registered track and rejects 6 crafted bad tracks (unsorted x, spawn in a gap, missing
  kill volume, overlap, finish before last obstacle, slope 80 deg).
- **M2 Compiler** — `compileTrack` for all 12 kinds -> statics/dynamics/triggers/groundY.
  Accept: golden JSON snapshot of `compileTrack(b1)` colliders; property test: for 200 random
  x, `groundY(x)` equals profile interpolation outside gaps and NaN inside; loop arc normals
  all point at the centre; seesaw limits hit stop blocks within 0.01.
- **M3 Beginner tier authored (b1-b3) + mesh** — `trackMesh.ts` builds per-surface
  geometries; ThreeRenderer swaps its ribbon for it. Accept: `harness:capture` of the mock
  physics rolling `b1` shows ramps/box/wall in the sheet; `stats()` <= 12 calls, <= 60k tris;
  the wall at x=118 is visible in the last tile.
- **M4 Bot search + golden recordings for Beginner** — `harness/bot.ts` on the real physics
  (blocked on physics M-contact + saveState). Accept: `harness:bot b1|b2|b3` clears each in
  < 60 s node time; `harness:replay golden/b*.bin` DETERMINISTIC twice; finish times within
  +/-15% of the `bot s` column (else retune the column, log why).
- **M5 Stranger REPL + first measurement** — `harness/play.ts`, `describeAhead`,
  `harness/stranger.ts` spawning the sub-agent. Accept: 3 stranger runs on b1-b3; medians in
  band (1 / 1-2 / 2); restart `simTicks == 1`, `renderMs < 30`; clips attached to the round.
- **M6 Easy + Medium tiers (e1-m3)** — author, compile, bot, stranger. Accept: bot clears all
  six; stranger medians in band for >= 4 of 6, the other two re-tuned within the same round;
  `rolloutsToPass` monotone across b->e->m (rho >= 0.8). Ship gate round.
- **M7 Hard tier (h1-h3)** — includes loop and rails; camera keys drive the renderer's
  track spline. Accept: `h3` loop golden run shows > 300 deg of continuous contact in
  `contacts()` (no fall-through at the top); stranger medians in band or re-tuned; cadence
  on the hardest segment <= 1.5 s bot, <= 3.5 s stranger wall (incl. thinking).
- **M8 Extreme tier (x1-x3)** — rolling drums + poles + composed finale. Accept: bot clears
  x3 within 200k rollouts; strangers hit the cap on at most 1 of 3 runs for x1/x2 and the
  x3 median is 60-80 (else tune down: the 70 deg plank to 66 deg first, then pole caps r 0.3).
- **M9 Ship gate** — full curriculum: 15 golden recordings replay byte-identical in
  `harness:all`; cold boot < 100 ms; per-track metrics JSON committed under
  `harness/out/metrics/` summary; the curriculum table in this doc regenerated from the
  metrics (`pnpm harness:metrics --write-doc`) so the numbers above are measured, not typed.
