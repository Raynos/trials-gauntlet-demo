# Physics design: bike + rider

Owner: physics. Scope: `src/physics/**` (implements the existing `PhysicsWorld`
contract in `src/physics/index.ts`, consumes `src/core/types.ts` unchanged).
Reference numbers come from `reference/notes/*.md` (frame-counted footage of
Trials Evolution / Rising). Units: metres, kilograms, seconds, radians; x along
the course, y up; angles CCW-positive, so **nose-up pitch is positive**.

## 1. Goals and non-goals

- The metric is attempts-to-clear and restart latency. Physics must be (a) fun
  to fail in, (b) readable (pitch drifts, never snaps), (c) totally reset-able
  in one tick, (d) bit-identical on replay.
- Feel targets lifted from the corpus: throttle from rest lifts the front in
  ~0.3 s; rear-wheel balance is held for seconds at 40-50 deg (rider back) or
  65-75 deg (rider forward) with +/-5 deg wobble at ~1 s period; landings are
  rear-first with a 0.25 s compress / 0.4 s extend settle; a stationary hop
  has ~0.6 s airtime; a 60 deg plank is climbable at ~1 wheelbase/s and a
  failed climb rolls back instead of crashing; big-air is 2.4-3.2 s.
- Non-goals: lateral dynamics (the world is 2D), gears, clutch input, tyre
  temperature, soft-body terrain. Camera and particles read `PhysicsState`
  only; they are not simulated here.

## 2. Custom solver vs Rapier / planck.js

We build a custom 2D sequential-impulse solver (~1.2 kLOC TS). Reasons, then
the honest cost:

| | Rapier (wasm) | planck.js (Box2D port) | Custom |
|--|--|--|--|
| Determinism | Yes with `enhanced-determinism`, but wasm init is async (~10-30 ms) and the 1.5-2 MB bundle hurts the 40-80 ms cold boot we measured | Yes on one engine; uses `Math.sin/cos/atan2` internally (ulp differences across engines) | Yes; we ban transcendental `Math.*` in the hot path (section 9) |
| Tyre model | Contact friction is a Coulomb clamp; a slip-curve tyre means fighting the solver | Same; `WheelJoint` is a car-suspension joint, no slip curve | Tyre is a first-class constraint with our own `mu(kappa)` |
| Tuning surface | Generic joint/contact params | Generic | Every number in section 4 is ours and named |
| Cost | 0 physics code, +collision, +ragdoll for free | Small bundle, generic shapes | We write circle/capsule/polygon vs segment/circle/box and 4 ragdoll revolute joints; no broadphase generality, no CCD beyond speculative contacts |

Trade-off stated plainly: a library gives us robust stacking, CCD and shape
generality on day one; we need none of those (3-4 bodies while riding, <=10
while ragdolling, all against static geometry) and we do need control of
solve order, effective-mass coupling of the rear tyre to engine torque, and a
single deterministic arithmetic path. If the custom solver is not stable and
bit-exact by the end of milestone M2 (section 12) we fall back to planck.js
with a custom friction callback and accept engine-specific replays.

## 3. Bodies, geometry, coordinate frames

All positions in world space; each body carries `pos`, `vel`, `angle`,
`angVel`, `invMass`, `invInertia`. State is stored SoA in one `Float64Array`
(section 9) so a snapshot is a copy.

| Body | Mass (kg) | Inertia (kg m^2) | Shape (local, m) |
|--|--|--|--|
| `frame` (chassis + engine + fuel) | 56 | 9.0 | Convex 7-gon: (-0.75,-0.10) (-0.45,-0.30) (0.45,-0.32) (0.85,-0.05) (0.70,0.25) (0.20,0.45) (-0.40,0.35) |
| `rearWheel` | 7 | 0.9 (incl. reflected flywheel) | circle r=0.34 |
| `frontWheel` | 7 | 0.45 | circle r=0.34 |
| `rider` (while riding) | 75 | point mass (pose is derived) | capsule for crash test: hips at COM-(0,0.30) to head at COM+(0,0.40), r=0.15 |

Total 145 kg. Frame local origin is the frame COM, which sits 0.585 m ahead of
the rear axle and 0.55 m above ground at zero suspension compression.

```
wheelbase L        = 1.30          wheel radius r      = 0.34
rear axle (local)  = (-0.585,-0.21) front axle (local) = (+0.715,-0.21)
rear susp axis     = norm(+0.17, 0.985)   // swingarm arc: up + slightly fwd
front susp axis    = norm(-0.42, 0.91)    // 25 deg rake fork: up + back
rider neutral anchor (local) = (-0.035, 0.50)   // rider COM 1.05 m above ground
rider lean range   = -0.35 m (back) .. +0.45 m (fwd) along frame x
rider crouch       = -0.30 m ; hop extension = +0.25 m along frame y
```

Ground truth for the balance analysis (section 6): combined COM at neutral is
0.573 m ahead of the rear axle and 0.788 m above ground (0.448 m above the
axle).

## 4. Tuning table (initial values)

Everything below is one `BikeTuning` object (`src/physics/tuning.ts`);
`DEFAULT_TUNING` is frozen and hashed into `HookInfo.version` so a replay
records which tuning it was made with.

```ts
export interface BikeTuning {
  gravity: number;               // 9.81   (world scale 1.0; big air comes from speed, not low g)
  frame: { mass: 56; inertia: 9.0; poly: Vec2[] };
  wheel: { radius: 0.34; mass: 7; inertiaRear: 0.9; inertiaFront: 0.45 };
  suspension: {
    rear:  { axis: Vec2; travel: 0.22; k: 12000; cComp: 650; cReb: 1100; preload: 0.02; kStop: 60000; stopStart: 0.80 };
    front: { axis: Vec2; travel: 0.20; k: 10500; cComp: 550; cReb: 950;  preload: 0.02; kStop: 60000; stopStart: 0.80 };
  };
  tyre: { muPeak: 1.6; B: 10; C: 1.3; E: 0.97; vRef: 1.0; rollRes: 0.015; restitution: 0 };
  engine: {
    idleRpm: 1500; limiterRpm: 10500; limiterResetRpm: 10000;
    peakTorqueNm: 27;                     // at the crank
    curve: [number, number][];            // [rpm, fraction of peak], piecewise linear
    gearRatio: 15.5; efficiency: 0.92;    // -> 385 N m peak at the wheel, 1132 N drive force
    engineBrakeFrac: 0.08;                // drag torque at zero throttle, scaled by rpm/limiter
    throttleRise: 40; throttleFall: 60;   // 1/s slew on the *effective* throttle (fuel lag ~25 ms)
  };
  brakes: { frontMaxNm: 900; rearMaxNm: 600; bias: 0.6 /* fraction of input to front */ };
  rider: {
    mass: 75; k: 6000; c: 740; kLanding: 40000 /* cubic term, section 7.3 */;
    leanBack: 0.35; leanFwd: 0.45; leanRate: 6 /* per s: full swing 0.17 s */;
    crouch: 0.30; hopExtend: 0.25; kHop: 25000; hopPreloadMin: 0.12; hopPreloadMax: 0.45; hopPushTime: 0.20;
    tetherMax: 0.45; ejectForce: 7500;    // N, sustained >= 2 ticks -> crash
  };
  aero: { dragCoef: 0.40 /* N s^2/m^2, F = -c v|v| */ };
  solver: { velocityIters: 8; positionIters: 3; slop: 0.005; baumgarte: 0.2; speculativeMargin: 0.01 };
  crash: { headRadius: 0.15; overRotationRad: null /* backflips are legal */; oobDepth: 5 };
  ragdoll: { sleepAfter: 3.0; restitution: 0.15; mu: 0.6 };
}
```

Engine curve (rpm, fraction): `[1500,.55] [3000,.75] [5000,.92] [6500,1.0]
[8000,.95] [9500,.78] [10500,.60]`; above the limiter torque is 0 until rpm
falls under `limiterResetRpm` (the audible bounce). Engine rpm is
`max(idleRpm, wheelOmega * gearRatio * 60/2pi)`; the auto-clutch is implied
(no stall, no clutch input). Top speed is limiter-bound at ~24 m/s (wheel
omega 70.6 rad/s), not drag-bound: at 22 m/s drag is 194 N vs 850 N of thrust.

Sanity checks on the table: static sag rear = 782 N / 12000 = 0.065 m (30% of
travel), front 640 N / 10500 = 0.061 m; sprung natural frequency
`sqrt(12000/72) = 12.9 rad/s = 2.05 Hz`, damping ratio 0.35 in compression /
0.6 in rebound. Rider spring `sqrt(6000/75) = 8.9 rad/s`, zeta 0.55, so a
lean step is 90% realised in ~0.2 s: the "body lags input by 100-150 ms"
observation, without scripting it.

## 5. Integration scheme and tick order

Fixed `dt = 1/120`. Semi-implicit (symplectic) Euler for bodies, sequential
impulses for constraints, non-linear Gauss-Seidel for position error. Fixed
iteration counts, no tolerance early-outs, constraints solved in a fixed order
(by constraint kind, then body id) so the floating-point sequence is
identical every run.

```
step(input):
 1  restart edge   -> fault('restart') + reset(checkpoint), return
 2  if faulted     -> ragdoll/free-bike sim only (steps 5-9 with rider bodies), tick++, return
 3  input          -> effective throttle slew; brake torques; lean target slew (leanRate);
                      hop state machine edge (section 7.4)
 4  forces         -> gravity; suspension spring/damper along axis (preload, bump stop);
                      rider spring/damper (nonlinear); engine torque on rearWheel and -torque
                      on frame; engine braking; rolling resistance; aero drag on frame
 5  v += F/m dt, w += tau/I dt            (all bodies)
 6  collide        -> wheels, frame poly, rider capsule vs static shapes (speculative margin
                      = max(0.01, |v_n| dt)); rider contact => crash flag (section 8)
 7  velocity solve -> 8 iterations over: slider joints, slider limits, rider tether,
                      contacts (normal, then tyre/friction), brake torque clamp
 8  x += v dt, angle += w dt, spin += spinVel dt
 9  position solve -> 3 NGS iterations: slider perpendicular error, limits, contact penetration
10  derive         -> compression, grounded, rider pose, checkpoint/finish, crash resolution,
                      events, tick++, time = tick*dt
```

Brake torque is applied as a clamped impulse inside the velocity solve (max
|dw| such that spin cannot reverse within a tick), which is what makes a brake
at 0.5 m/s stop the wheel dead instead of oscillating.

### 5.1 Constraints

- **Slider (suspension)**: wheel centre stays on the line through the axle
  rest point along `axis` (in frame space). 1-DOF constraint on the
  perpendicular; effective mass includes the frame's angular term
  `1/(1/m_f + 1/m_w + (r_perp x n)^2 / I_f)`. Along the axis: soft spring
  force (step 4) + unilateral limit impulses at compression 0 and `travel`.
  Compression above `stopStart` adds `kStop*(c-stopStart*travel)` (bump stop).
- **Rider tether**: while the rider is a point mass it is coupled with the
  nonlinear spring (step 4) and a hard max-distance constraint at
  `tetherMax` from the anchor. The tether impulse is accumulated; if the
  equivalent force exceeds `ejectForce` for 2 consecutive ticks the rider is
  ejected (crash). The spring reaction is applied to the frame at the anchor,
  so weight shift is a real force with a real moment arm.
- **Contact**: non-penetration with restitution 0 (wheels) / 0.15 (frame,
  ragdoll), Baumgarte-free (position error fixed by NGS). Friction: tyre
  model for wheels (section 5.2), Coulomb mu 0.6 for everything else.
- **Revolute** (ragdoll only): 2-DOF point constraint + angular limit.

### 5.2 Tyre model

Per grounded wheel, with contact normal `n`, tangent `t`, normal impulse
`lambda_n` from the same iteration:

```
v_c    = v_wheel + w x r_vec                // contact patch velocity
slip   = (w * r) - dot(v_c - v_ground, t)   // + = wheel spinning faster than rolling
kappa  = slip / max(|dot(v_c, t)|, vRef)    // vRef = 1 m/s keeps standstill finite
mu     = muPeak * grip(material) * sin(C * atan(B*kappa - E*(B*kappa - atan(B*kappa))))
lambda_t = clamp(-m_eff_t * slip, -mu*lambda_n, +mu*lambda_n)   // rolling constraint, cone-clamped
```

`m_eff_t = 1/(1/m_w + r^2/I_w + coupling)`; the coupling to the frame comes
for free from iterating with the slider joint. The curve peaks at
kappa ~0.15 with `mu = 1.6` and settles to `1.6*sin(1.3*pi/2) = 1.42` when
fully spinning. Because the sticking case is an impulse (not a stiff spring)
there is no chatter at 120 Hz; the explicit alternative has a 0.4 ms time
constant and is unstable at this dt. Material grip: dirt 1.0, wood 0.95,
concrete 1.05, metal 0.75, rubber (drums) 1.10, mud 0.60, ice 0.25.

Drive: engine torque `tau` on `rearWheel` (spinning it CW for +x travel) and
`-tau` on `frame`. The reaction is what pitches the nose up; the drive force
at the patch is what accelerates. In the air, throttle spins the rear wheel
up and (via `-tau`) rotates the frame nose-up; brake does the reverse. With
`inertiaRear = 0.9` a 0.5 s full brake from 30 rad/s transfers 27 N m s to a
frame with ~15 kg m^2 pitch inertia (frame+rider hanging on): about -20 deg
of pitch, which is the Trials mid-air correction.

## 6. Balance point analysis (wheelie equilibrium)

With the rear wheel on the ground and the front in the air the bike is an
inverted pendulum about the rear contact patch. Let `(d, h)` be the combined
COM relative to the rear axle in frame space at zero pitch, `lambda` the
effective lean in [-1, 1], `a` the longitudinal acceleration.

```
d(lambda) = 0.573 + 0.233*max(lambda,0) + 0.181*min(lambda,0)   // 75 kg * 0.45 m fwd / 0.35 m back, over 145 kg
h         = 0.448                  (rider crouch lowers it: -0.155 * crouch)
phi       = atan2(h, d)            // COM elevation angle in frame space
theta_bal = pi/2 - phi + atan(a/g) // pitch at which gravity torque about the patch is zero
```

| lean | d (m) | theta_bal, a=0 | theta_bal, a=+3 m/s^2 |
|--|--|--|--|
| -1 (back)  | 0.392 | 41.2 deg | 58.2 deg |
| 0          | 0.573 | 52.0 deg | 69.0 deg |
| +1 (fwd)   | 0.806 | 60.9 deg | 77.9 deg |

So full lean authority moves the equilibrium by ~20 deg (41 -> 61) and throttle
(acceleration) moves it by `atan(a/g)`, 17 deg at 3 m/s^2. Read it as the
corpus does: the slow 30-45 deg cruising wheelie at 4.1 m/s is a rider hanging
back with small throttle pulses (a > 0 keeps the effective balance above the
actual pitch, then coasting brings it back); the 65-75 deg stationary balance
is a rider standing forward over the bars.

Stability: it is unstable with growth rate `sigma = sqrt(g/l)`, `l = 0.974 m`
from the patch to the COM, so `sigma = 3.17 /s`, e-fold 0.315 s; a 1 deg
error becomes 15 deg in ~0.85 s with no input. That is the "pitch drifts,
gets corrected" feel, and it fixes the controller requirement: a human with
~150 ms reaction can hold it (feel test F4 proves a bot with 100 ms latency
can). The linearised pitch dynamics the bot and the tests use:

```
I_p * theta'' = M g l sin(theta_bal(lambda,a) - theta)   +   tau_engine - tau_brake  - (rider spring transient)
I_p ~ M l^2 + I_frame + I_rider_offset ~ 145*0.949 + 9 + 3 ~ 150 kg m^2
```

Lean does two things: statically it moves `theta_bal` (table above); dynamically the
rider spring reaction pushes the frame the opposite way for ~0.2 s (a lean-back
step first gives a small nose-*down* kick of ~2 deg before the COM shift takes
over). F5 measures both. Launch check: at rest with neutral lean the drive force
1132 N at height 0.788 m gives 892 N m of nose-up moment vs 145*9.81*0.573 = 815
N m of gravity, so full throttle from a standstill *does* lift the front with no
lean (F2), and with lean back (d=0.392, 558 N m) it lifts in well under 0.3 s.

## 7. Rider model

### 7.1 Weight shift as a force
Input `lean` in [-1,1] is slewed at `leanRate` into `leanEff`. The anchor target
in frame space is `(-0.035 + leanOffset(leanEff), 0.50 - crouch*0.30 + hop*0.25)`.
The rider point mass is pulled toward the world-space anchor by
`F = -k*dx - c*dv - kLanding*|dx|^2*dx/|dx|` (cubic term stiffens legs under
landing loads); `-F` is applied to the frame at the anchor. Nothing else
moves the bike when you lean: no direct torque, no fake angular velocity.

### 7.2 Derived pose (for the renderer, not simulated)
```
rider.lean       = leanEff
rider.crouch     = clamp(-(riderRelY - neutralY)/0.30, 0, 1)      // actual compression, so landings squash
rider.torsoPitch = clamp(-0.35*leanEff - 0.15*frame.angle, -0.9, 0.9)
rider.armExtend  = clamp(max(0, -leanEff) + 0.5*max(0, frame.angle - 0.6), 0, 1)
```

### 7.3 Landing recovery
Rear-first landings at +25..35 deg relative to the surface are ideal by
construction: the rear suspension takes the first hit, the rider spring
compresses (crouch rises over ~0.1-0.15 s), gravity torque about the rear
patch drops the front over 0.2-0.4 s, the front suspension lands a second,
smaller hit, and the rider spring re-extends over ~0.4 s (zeta 0.55 at 8.9
rad/s gives exactly that). Nose-first below about -20 deg pushes the combined
COM ahead of the front patch: the frame pitches forward faster than the rider
spring can follow, the tether saturates, `ejectForce` trips or the head capsule
hits: crash. The envelope is measured in F6 and is the primary tuning gate for
`kLanding`, `ejectForce`, `tetherMax`.

### 7.4 Bunny hop (preload + release)
`hop` is edge-triggered. State machine (all times sim time):
```
IDLE --hop down--> PRELOAD: crouch target -> 1 at rate 1/0.25 s (rider drops 0.30 m,
                            suspension loads up); held while hop stays true, min 0.12 s
PRELOAD --hop up (or 0.45 s cap)--> PUSH: anchor target jumps to +0.25 m, k -> kHop (25000)
                            for hopPushTime (0.20 s); rider mass drives frame into the ground,
                            ground reaction + suspension rebound launches the whole system
PUSH --timer--> RECOVER: k -> 6000, crouch target -> 0, back to IDLE when both wheels grounded
```
Combined with lean it produces the corpus sequence: lean back during PRELOAD
lifts the front, PUSH lifts the rear ~0.3-0.6 s later, land rear-first. Target
for a neutral-lean stationary hop: rear wheel apex 0.30-0.50 m, airtime 0.45-0.70 s
(F7). Hop is an internal force pair; total vertical momentum still comes from
the ground, so a hop in mid-air only shuffles the rider (legal, harmless).

## 8. Crash detection and ragdoll

Crash (`fault('crash')`) fires when any of:
1. **Rider contact**: the rider capsule (hips->head, r 0.15) or head sphere
   touches any static shape (the bike's own bodies are excluded).
2. **Ejection**: tether force >= `ejectForce` for 2 consecutive ticks, or rider
   distance from anchor > `tetherMax*1.3` after position solve (solver gave up).
3. **Out of bounds**: any body below `min(profile.y) - oobDepth`, or x outside
   `[profile[0].x - 5, profile[last].x + 5]` -> `fault('out-of-bounds')`.
Over-rotation is *not* a crash rule (flips are legal); an upside-down landing
crashes through rule 1. Frame-vs-ground contact (bash plate, bars) is a normal
contact, not a crash, matching "failed climb rolls back".

On crash: `finished = true`, `faulted = 'crash'`, `finishTime` stays null,
engine torque is cut, brakes released. The rider point mass is replaced by a
5-body ragdoll (head 5 kg r 0.12; torso capsule 0.45 m r 0.14, 32 kg; upper legs
0.42 m, 18 kg; lower legs 0.42 m, 12 kg; arms 0.55 m, 8 kg) joined by revolute
joints with limits (neck +/-40 deg, hip -20..110, knee 0..140, shoulder -60..170),
seeded from the rider's velocity plus the frame's angular contribution plus a
deterministic +/-0.3 m/s spread from `Rng(seed ^ imul(checkpoint+2, 0x9e3779b9) ^ tick)`.
The bike continues as free bodies (wheels keep spinning, mu 0.6 sliding). After
`sleepAfter = 3 s` every ragdoll/bike velocity is zeroed so the hash and cost
stop changing. The whole thing is interruptible: `reset()` on the next tick is
the single-frame hard cut the corpus demands (respawn <= 1 tick, camera/HUD are
the game layer's problem).

`reset(checkpoint)` rebuilds *all* physics state from the checkpoint spawn +
tuning (no carried-over velocities, contacts, RNG position, hop state, throttle
slew). F10 asserts `hash(reset)` == `hash(loadTrack + reset)`.

## 9. Determinism rules

- No `Math.random`, `Date`, `performance`, frame delta. `Rng` from `src/core/rng`
  only, reseeded on reset, consumed only for ragdoll spread (one `nextU32` per
  tick regardless of use, so the stream position is part of the hashed surface
  as in `MockPhysics`).
- No `Math.sin/cos/tan/atan/atan2/exp/pow/hypot` in `src/physics` (an ESLint
  `no-restricted-properties` rule guards it). `src/physics/dmath.ts` provides
  `sin/cos` (range-reduced degree-9/8 minimax polynomials), `atan/atan2`
  (degree-11 odd polynomial on [-1,1] with argument folding), all built from
  `+ - * /` and `Math.sqrt`, which are correctly rounded under IEEE-754 in every
  engine. Max error ~2e-9 rad, irrelevant for feel, exact across V8/JSC/SpiderMonkey.
- Fixed iteration counts, fixed constraint order (kind, then body id), no
  data-dependent early exits, no `Map`/`Set` iteration over object identity,
  no `Array.sort` with unstable comparators (broadphase buckets are built by
  index arithmetic).
- All state lives in one `Float64Array` (`WorldBuffer`, ~180 doubles while
  riding, ~320 with ragdoll) plus a handful of integer flags; `getState()`
  copies out the `PhysicsState` fields (plain objects, structured-clone-safe,
  `-0` normalised to `0` where it can arise: spins and slews).
- Inputs are already quantised (`quantizeInput`); physics never sees a raw float.
- The same TS runs in node (vitest) and the browser; F10 compares hashes across
  the two, which also catches accidental engine-specific paths.

## 10. Collision against track geometry

`compileTrack(track: TrackDef): StaticShapes` at `loadTrack`:
- `profile` polyline -> `Segment[]` with material `dirt` (or per-point
  `params.material` later). A `gap` obstacle (`{x0,x1}`) removes the profile
  segments in that span; the kill plane below handles falls.
- Obstacle vocabulary the tracks builder can use (`params` per kind):
  `ramp {w,h,curve?}` -> segments (curve sampled at 0.15 m), `plank {len,angle,thick}`
  and `box {w,h,angle}` -> OBB, `drum {r}` -> Circle (material rubber), `pipe {r}`
  -> Circle concave side unsupported (inside is a segment chain), `pit` = gap.
  Unknown kinds are ignored by physics (render-only props).
- Shapes are bucketed into a uniform grid along x (cell 2 m); a query for a
  circle of radius r at x hits cells `[floor((x-r-m)/2) .. floor((x+r+m)/2)]`.
- Primitives: circle-vs-segment/circle/OBB (closest point), capsule-vs-* (two
  circles + swept segment), convex-poly-vs-segment/OBB (SAT over edge normals,
  deepest point). Each returns `{point, normal, depth, material}`; speculative
  margin makes 17 cm/tick at 20 m/s safe against a 3 cm plank edge.
- Wheels get at most 2 contacts each per tick (deepest two by manifold id);
  frame polygon up to 2; rider capsule any (a hit is a crash, count irrelevant).

## 11. API surface

Implements the existing contract exactly; extras live on a subtype so `Game`
and the hook need no change.

```ts
// src/physics/index.ts (existing) — unchanged:
export interface PhysicsWorld { readonly physicsHz; loadTrack(track, seed); reset(cp); step(input); getState(); drainEvents(); }
export type PhysicsFactory = (physicsHz: number) => PhysicsWorld;

// src/physics/bike.ts
export interface BikePhysicsWorld extends PhysicsWorld {
  readonly tuning: Readonly<BikeTuning>;
  /** Copy of the raw world buffer; loadSnapshot restores it bit-exactly (tests, rollback). */
  saveSnapshot(): Float64Array;
  loadSnapshot(buf: Float64Array): void;
  /** Rich read-only view for tests/debug draw; NOT part of the hash. */
  debug(): PhysicsDebug;
  /** Balance pitch for the current lean/crouch and an assumed acceleration (section 6). */
  balancePitch(lean: number, accel?: number): number;
  /** Place the bike in a given pose (used by feel tests to start from a balanced wheelie). */
  teleport(pose: { pos: Vec2; angle: number; vel?: Vec2; angVel?: number; rearOnly?: boolean }): void;
}
export interface PhysicsDebug {
  bodies: { id: 'frame'|'rearWheel'|'frontWheel'|'rider'|`rag:${string}`; pos: Vec2; vel: Vec2; angle: number; angVel: number }[];
  contacts: { body: string; point: Vec2; normal: Vec2; lambdaN: number; lambdaT: number; slip: number; mu: number }[];
  engine: { rpm: number; torqueNm: number; limiter: boolean; throttleEff: number };
  suspension: { rear: SuspDebug; front: SuspDebug };       // compression m, force N, velocity
  rider: { anchor: Vec2; offset: Vec2; tetherForce: number; hopPhase: 'idle'|'preload'|'push'|'recover' };
  balancePitch: number;                                      // for the current lean, a=0
}
export function createBikePhysics(physicsHz: number, tuning: Partial<BikeTuning> = {}): BikePhysicsWorld;
export const bikePhysicsFactory: PhysicsFactory = (hz) => createBikePhysics(hz);
```

`getState()` fills `PhysicsState` as specified in `types.ts`: `bike.pos/vel/
angle/angVel` are the frame body; `wheels.*.compression = c/travel`;
`grounded` = normal impulse > 0 this tick; `rider` per 7.2; `checkpoint`
advances when the front axle x crosses `checkpoints[i].x`; `finished/
finishTime` when the front axle x crosses `finishX`; events as `GameEvent`.
Wiring: `src/main.ts` swaps `new MockPhysics(hz)` for `bikePhysicsFactory(hz)`
(one line, owned by game; the mock stays for harness smoke tests).

### 11.1 Bot input protocol

Bots are closed-loop controllers that run against the physics directly in
node (vitest, ~1e5 ticks/s) and, for cross-runtime checks, in the browser
through `window.__trials.setInput/step`. A bot never sees hidden state: it
gets `PhysicsState` plus a few derived scalars, at a decision rate and with a
latency, and its output goes through `quantizeInput` like a human's.

```ts
export interface BotObservation {
  state: PhysicsState; t: number;
  pitchDeg: number; pitchRateDeg: number; speed: number;
  rearGrounded: boolean; frontGrounded: boolean; airborne: boolean;
  balancePitchDeg: number;          // world.balancePitch(currentLean, 0), the only "cheat", and it is public
}
export type Bot = (obs: BotObservation) => Partial<InputFrame>;
export interface BotRunOptions { decisionHz?: number /*60*/; latencyMs?: number /*100*/; maxTicks: number; stopWhen?: (s: PhysicsState) => boolean }
export function runBot(world: BikePhysicsWorld, bot: Bot, opts: BotRunOptions): { states: PhysicsState[]; recording: Recording; ticks: number };
```
`runBot` records every quantised frame into the existing RLE `Recording`
format so any bot run can be replayed byte-for-byte in the browser hook
(`runRecording`) and captured to mp4. Reference bots (`src/physics/bots/`):
`fullThrottle`, `wheeliePD` (lean = clamp(Kp*(target - pitch) - Kd*pitchRate),
Kp = 2.5/rad, Kd = 0.5 s/rad, throttle 0.35 + 0.4*speedError), `airPitch`
(in air: lean/brake/throttle to hit a target landing pitch), `hopper`,
`climber` (lean +0.6, throttle modulated by rear slip > 0.25).

## 12. Feel tests (measurable, run in vitest at 120 Hz)

Each test starts from `loadTrack(flat-test or a purpose track) + reset(-1)`,
uses `teleport` where a pose is needed, and asserts bands. Bands are the
first-draft tuning gate; they tighten as clips are compared side by side.

| # | Test | Procedure | Pass band |
|--|--|--|--|
| F1 | Static settle | zero input 2 s | rear compression 0.27-0.34, front 0.26-0.34; pitch within 0.5 deg; every body speed < 1e-4 m/s; hash identical on 3 fresh worlds and after `loadSnapshot(saveSnapshot())` |
| F2 | Wheelie launch | throttle 1, lean 0, from rest | front leaves ground at 0.20-0.40 s; pitch 45 deg at 0.9-1.4 s; loops out (crash by ejection/head) at 1.4-2.4 s; with lean -1 front lifts <= 0.25 s |
| F3 | Zero-input hold from balance | teleport rear-only at `balancePitch(0)+0.5 deg`, v=4 m/s, throttle = value that holds speed (computed by a 2 s pre-run), lean 0 | time to leave +/-15 deg of balance: 0.7-1.6 s (drift, never snap); fall direction matches sign of the initial error |
| F4 | Bot balance | `wheeliePD`, 60 Hz, 100 ms latency, 12 s, target 45 deg, v 4 m/s | wheelie held >= 10 s; pitch RMS error < 6 deg; dominant wobble period 0.7-1.5 s; lean saturated < 20% of ticks |
| F5 | Lean authority | from F3 initial state, step lean to -1 (then +1 in a second run) | pitch rate reaches <= -40 deg/s (resp. >= +40) within 0.35 s; static `balancePitch(+1) - balancePitch(-1)` in 16-24 deg; initial reaction kick opposite in sign and < 3 deg |
| F6 | Landing envelope | teleport airborne at 2.0 m, vx 6, pitch sweep -30..+60 deg step 5, lean 0 | rides away (no fault, both wheels grounded within 0.6 s of first contact) for every pitch in [-5, +40]; crashes for every pitch <= -25; rear touches first for pitch >= +10; rear compression peak 0.05-0.15 s after touchdown, front touchdown 0.15-0.45 s later, `rider.crouch` back < 0.1 within 0.6 s |
| F7 | Bunny hop | stationary flat, hop true for 0.25 s then false, lean 0 | both wheels airborne; rear apex 0.30-0.50 m; airtime 0.45-0.70 s; with lean -0.5 during preload the front lifts 0.2-0.5 s before the rear and lands 0.1-0.4 s after it |
| F8 | Steep climb | 3 m plank at 55 deg then 65 deg, run-in 5 m/s, `climber` bot | 55: reaches top, mean speed along plank 1.5-2.5 wheelbase/s (2.0-3.3 m/s); 65: stalls and rolls back >= 1 m with no fault |
| F9 | Brakes | 10 m/s flat, brake 1 | stops in 5-8 m; front compression peak 0.7-0.95; pitch dip -5..-12 deg; no fault. Airborne level at 1 m: brake 1 for 0.5 s -> pitch -10..-25 deg; throttle 1 for 0.5 s -> +8..+20 deg |
| F10 | Reset, replay, perf | crash 3 times, `reset(cp)`; `runBot` 60 s recording replayed in node and chromium | `hash(reset)` == `hash(loadTrack+reset)` every time; node hash == chromium hash == `.bin` hash; finish times equal to the bit; step p95 < 40 us riding, < 80 us ragdolling (node, 10k ticks warm) |

Airtime cross-check (not a gate): a 45 deg kicker exit at 20 m/s gives
vy 14.1 m/s and 2.9 s of air at g 9.81, inside the corpus 2.4-3.2 s band; with
the bike's angular momentum alone the pitch drifts ~8-15 deg per second of
air, so the "30 deg over the arc unless leaned" observation is met without an
air-damping hack.

## 13. Build plan

Milestones are ordered; each has an acceptance test that becomes a permanent
vitest. One commit per milestone; subject states the measured finding.

| M | Deliverable | Acceptance |
|--|--|--|
| M0 | `dmath.ts`, `WorldBuffer` SoA bodies, semi-implicit integrator, circle-vs-segment contact + NGS, flat `compileTrack` | Dropped frame polygon settles on flat ground: no jitter (max speed < 1e-6 after 1.0 s), penetration < 5 mm, hash stable across 3 runs; `dmath` vs `Math` max error < 5e-9 over 1e6 samples; ESLint bans `Math.sin` & co. in `src/physics` |
| M1 | Wheels, slider joints, spring/damper, limits, bump stop | F1 passes; drop from 1 m lands without bottoming, from 4 m bottoms and recovers; suspension frequency measured 1.9-2.2 Hz from the rear compression trace |
| M2 | Engine curve, limiter, auto-clutch rpm, tyre model, brakes, drag, rolling resistance | Locked-rider variant (rider fused to frame): 0-20 m/s in 4-6 s; slip ratio stays < 0.2 on dirt at full throttle above 5 m/s and spins on ice; F9 flat-brake half passes; step cost < 25 us. **Go/no-go for custom solver vs planck fallback (section 2)** |
| M3 | Rider point mass, lean, anchor slew, `balancePitch`, `teleport`, bots `fullThrottle`/`wheeliePD` | F2, F3, F4, F5 pass; balance table in section 6 reproduced by `balancePitch` within 1 deg |
| M4 | Full `compileTrack` (ramps, planks, boxes, drums, gaps), broadphase, frame polygon and capsule collision, speculative contacts | F8 passes; 20 m/s over a 3 cm plank edge never tunnels (1000 random-seeded approach offsets, deterministic seeds); airtime cross-check |
| M5 | Landing spring nonlinearity, hop state machine, `airPitch`/`hopper` bots | F6, F7 pass; F9 airborne half passes |
| M6 | Crash detection, ragdoll bodies + revolute joints, sleep, total `reset` | F10 reset/hash part; crash-to-`reset` is 1 tick; ragdoll hash stable after 3 s; fault events carry the correct tick/time |
| M7 | Wire `bikePhysicsFactory` into `main.ts`, harness replay/capture of a bot recording, node-vs-chromium hash | F10 full; `pnpm harness:all` green with the real physics; a 30 s clip of `wheeliePD` + a clear of `flat-test` captured for the judge |
| M8 | Tuning pass against clips 03/05/12/14 (balance wobble period, landing settle, hop timing, wheelie cadence) | Every F-band re-measured and tightened by >= 30%; `DEFAULT_TUNING` hash bumped; findings recorded in this doc's section 4 table |

Budget guardrail: if M2 slips past its own acceptance twice, switch to the
planck.js fallback the same day; everything above M2 (rider, hop, crash, bots,
tests) is written against `BikePhysicsWorld`, not the solver, and survives.
