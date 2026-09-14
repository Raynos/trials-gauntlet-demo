# Physics design: bike + rider

Owner: physics. Scope: `src/physics/**`. Where this file disagrees with
`docs/design/CONTRACT.md`, the CONTRACT wins and this file is wrong.
Units: metres, kilograms, seconds, radians; +x along the course, +y up;
angles CCW-positive, so **nose-up pitch is positive**. Fixed step 1/120 s.

Status: **round 2 (partial)** — loop-out envelope and partial-throttle speed governor done (soft off-idle torque curve, aero governor 3.2 N s²/m²), 39 tests green; items 3-7 of the round-2 list remain (climb corner, brake 4.5 m, 0.9 m ledge, wheeliePD, ragdoll-vs-bike). Round 1 shipped — `createBikePhysics(hz, tuning?)` /
`bikePhysicsFactory` in `src/physics/bike.ts`, 36 vitest tests green,
measured envelope in section 12. Not yet wired into `src/main.ts` (core-game
owner swaps `new MockPhysics(hz)` for `bikePhysicsFactory(hz)`).

## 1. Goals and non-goals

- The metric is attempts-to-clear and restart latency. Physics must be (a) fun
  to fail in, (b) readable (pitch drifts, never snaps), (c) reset-able in one
  tick, (d) bit-identical on replay and after `restore(snapshot())`.
- Feel targets are the CONTRACT §2.5 table (measured in section 12) plus the
  corpus: throttle from rest lifts the front in ~0.3 s; wheelie balance is held
  for seconds at 40-50 deg; landings are rear-first with a compress/extend
  settle; a stationary hop has ~0.6 s airtime; a failed climb rolls back
  instead of crashing; big air is 2.4-3.2 s.
- Non-goals: lateral dynamics (the world is 2D), gears, clutch input, tyre
  temperature, soft-body terrain.

## 2. Solver

Custom 2D sequential-impulse solver (`src/physics/bike.ts`, ~1.4 kLOC).
Semi-implicit Euler, 8 velocity iterations per tick in a fixed order, Baumgarte
position correction (β 0.2 contacts with 5 mm slop, 0.3 joints), speculative
contacts (margin 2 cm + |v|·dt) so a 20 m/s wheel never tunnels a plank edge.
No warm starting, so there are no contact caches to snapshot. Rapier/planck
were rejected for bundle size, async wasm init and the lack of a first-class
tyre model; see the git history of this file for the comparison table.

All mutable state lives in one `Float64Array F` (40 scalars + SoA bodies:
`px py vx vy angle angVel invMass invInertia`) and one `Uint8Array U` (16
flags/enums). `snapshot()` is two typed-array copies; `restore()` is bit-exact
by construction (`world.test.ts` forks at ticks 200, crash-5, crash, crash+1,
crash+200 and compares 500-tick hash traces).

### 2.1 Bodies

| index | body | mass (kg) | inertia (kg m²) | collision shape |
|--|--|--|--|--|
| 0 | frame | 56 | 14 | 4 hard-point circles (bash plate, tail, fork crown, bars) |
| 1 | rearWheel | 7 | 0.7 | circle r 0.34 (tyre) |
| 2 | frontWheel | 7 | 0.5 | circle r 0.34 (tyre) |
| 3 | rider | 75 | 15 (hidden torso DOF, section 7.4) | 3 sensor circles: head r 0.15, torso 2× r 0.13 — a touch is a crash, never a contact |
| 4-10 | ragdoll head/torso/pelvis/upperArm/forearm/thigh/shin | 5/30/12/5/3/12/8 | rod | 1-2 circles per limb, μ 0.6, e 0.15 |
| 11+ | one pinned body per seesaw, then per rolling drum | ∞ | seesaw m·L²/3; drum ½(60·r²)·r² | box / circle owned by the body |

Total 145 kg; combined COM at neutral lean is 0.70 m ahead of the rear axle and
0.74 m above ground (0.40 m above the axle line; CONTRACT says 0.45 — the
0.05 m went into `leanCrouch`, see 7.1, so the neutral figure is what the
40-50 deg balance requires).

### 2.2 Constraints, in solve order

1. Suspension sliders (rear, front): wheel centre on the line `axle + axis·c` in
   frame space (bilateral perpendicular constraint) plus unilateral travel
   limits at c = 0 and c = travel. Spring/damper along the axis is a force
   (section 4) with the damping impulse clamped so it can never reverse the
   compression rate in a tick.
2. Rider tether: radial max-distance (`tetherMax` 0.5 m) and the
   **legs-straight stop**: the rider cannot rise more than `legSlack` (5 cm)
   above the anchor along frame-up. The stop is what lets a hop lift the bike.
3. Ragdoll revolute joints (6, point + angular range about the spawn pose).
4. Seesaw angle limits (±`maxAngle`).
5. Contacts: normal (accumulated, ≥ 0, restitution 0 for bike, 0.15 ragdoll)
   then friction (tyre model for wheels, Coulomb 0.6 otherwise).
6. Brakes: angular constraint locking wheel spin to the frame, impulse-capped
   at `brake·maxNm·dt`; the front cap fades with rear-wheel unload (7.6).

### 2.3 Tyre

Contact-point friction is the rolling constraint (the patch velocity already
includes ω×r). `κ = |slip| / max(|v_t|, 1 m/s)`; μ = `muPeak`·grip(surface)·
shape(κ) with shape = 1 for κ ≤ 0.15 falling linearly to `slideFrac` 0.9 at
κ ≥ 1. `muPeak` 2.0; grip dirt 1.0, wood 0.95, concrete 1.05, metal 0.75,
rubber 1.1, grate 0.9, stone 1.0, snow 0.5. Rolling resistance 0.012·N·R.

## 3. Engine, brakes, aero

`rpm = max(idle + throttleEff·(clutchRpm − idle), ω_rear·gearRatio·60/2π)`
— idle 1500, slipping auto-clutch 3500 under throttle, **limiter cuts at
10 000 and re-arms below 9 500** (CONTRACT). Torque curve (rpm, fraction), **soft off idle** so a full-throttle launch does
not loop at neutral lean:
`[1500,.55] [3500,.65] [5000,.85] [6500,1] [8000,.95] [9500,.85] [10000,.8]`,
peak 38 Nm × gear 17.5 × η 0.92 = 612 Nm at the wheel = 1800 N of thrust
(1170 N off the line through the slipping clutch).
Engine braking 8 % of peak scaled by rpm off throttle. Throttle slews at 40/s
up, 60/s down. Top speed is limiter-bound at 20.4 m/s (measured 20.45).
Engine torque goes on the rear wheel and its reaction on the frame, so the
pitch-up moment is F·h as it should be; in the air throttle pitches nose-up
and brake nose-down through wheel angular momentum (section 12, F9).

Brakes: front 640 Nm, rear 500 Nm. Aero drag F = −3.2·v|v| on the frame — deliberately
large: it is the speed governor that makes partial throttle top out (thr 0.3 → 11.3 m/s,
0.6 → 17.1, 1.0 → limiter at 20.4).

## 4. Tuning table

`src/physics/tuning.ts` `DEFAULT_TUNING` (frozen); `createBikePhysics(hz,
partial)` deep-merges. Values as shipped in round 1:

```
gravity 9.81
frame   mass 56  inertia 14  comHeight 0.55
wheel   radius 0.34  mass 7  inertiaRear 0.7  inertiaFront 0.5  wheelbase 1.30
susp rear  axle (-0.585,-0.210) axis norm(0.17,0.985) travel 0.22 k 12000 cComp 650 cReb 1100 preload 0.02 kStop 60000 @0.8
susp front axle (+0.715,-0.215) axis norm(-0.42,0.91) travel 0.20 k 10500 cComp 550 cReb 950  preload 0.02 kStop 60000 @0.8
tyre    muPeak 2.0 kappaPeak 0.15 slideFrac 0.9 vRef 1.0 rollRes 0.012
engine  idle 1500 clutch 3500 limiter 10000/9500 peak 38 Nm gear 17.5 eff 0.92 engineBrake 0.08 slew 40/60 (curve: section 3)
brakes  front 640 rear 500 antiEndo 0.05
rider   mass 75 anchor (+0.21,+0.50) k 6000 c 740 kLanding 40000
        leanBack 0.60 leanFwd 0.85 leanRate 6 leanCrouch 0.30
        crouch 0.30 crouchTime 0.25 hopExtend 0.15 hopForce 2600 hopMaxForce 3200 kPush 500
        hopPreloadMin 0.12 hopPreloadMax 1.5 hopPushTime 0.35 hopRecoverTime 0.6
        hopLeanBack -0.5 hopThrottle 0.3 hopSnapRate 4
        tetherMax 0.5 ejectForce 12000 legSlack 0.05 armFrac 0.3
        headRadius 0.15 torsoRadius 0.13 torsoFollow 0.5
        torso inertia 15 swing 1.2 k 4000 c 390 maxTorque 300
aero    dragCoef 3.2
solver  velocityIters 8 slop 0.005 baumgarte 0.2 jointBaumgarte 0.3 speculativeMargin 0.02
ragdoll sleepAfter 3.0 restitution 0.15 mu 0.6 spread 0.3
drum    density 60
```

Static checks: rear sag 0.125·0.22 = 27 mm, front 0.206·0.20 = 41 mm (the
raked fork carries less of its load axially); frame level within 0.24 deg at
rest; sprung frequency ~2 Hz; rider spring 8.9 rad/s, ζ 0.55.

## 5. Tick order

```
step(input):
 1  restart edge      -> fault('restart') + reset(checkpoint), return (latched until released)
 2  asleep            -> tick++ only (ragdoll settled)
 3  controls          -> throttle/lean slew, hop state machine, engine rpm/limiter/torque, brake input
 4  forces            -> gravity; suspension geometry+rates (pass 1) then impulses (pass 2);
                         rider spring/actuator/weight at the anchor; torso torque pair; engine; drag
 5  collide           -> wheels, frame hard points, rider sensors (riding) or ragdoll circles (crashed)
 6  solve             -> 8 iterations in the order of 2.2
 7  integrate         -> x += v dt, angle += ω dt
 8  derive            -> compression, grounded/surface, land events, slip, checkpoint/finish,
                         crash rules -> ragdoll spawn, sleep, rng advance, tick++
```

Suspension rates are read for **both** wheels before either spring impulse is
applied (a rate read after the other wheel's impulse produced a phantom 0.14
m/s damper velocity at rest in the first build).

## 6. Balance point

Combined COM in frame space relative to the rear contact patch: `d` ahead,
`h` above. `balancePitch(lean, a) = π/2 − atan2(h, d) + atan(a/g)`, computed
from the tuning masses with the rider at the lean-shifted anchor.

| lean | d (m) | h (m) | balance pitch | measured |
|--|--|--|--|--|
| −1 (back) | 0.39 | 0.59 | 32 deg | 32.4 |
| 0 | 0.70 | 0.74 | 43 deg | 42.4 |
| +1 (fwd) | 1.14 | 0.59 | 62 deg | 62.0 |
| 0, a = +3 m/s² | | | 59 deg | 59.5 |

Instability: σ = √(g/l), l ≈ 1.02 m → e-fold 0.32 s; a 0.5 deg error leaves
±15 deg in **1.0 s** open loop (measured 1.02 / 0.98 s), inside the CONTRACT's
1-2 s. The same geometry fixes the climb: moment about the rear contact
`m g (d cos θ − h sin θ)` keeps the front wheel loaded up to 62 deg at full
forward lean, so 60 deg is climbable and 65 loops — the CONTRACT bands.

## 7. Rider model

### 7.1 Weight shift as a force
`lean` is slewed at `leanRate` into `leanEff`. The anchor in frame space is
`(0.21 + leanOff, 0.50 − |leanEff|·0.30 − crouch·0.30 + hopExt·0.15)` with
`leanOff = leanEff·0.85` forward, `leanEff·0.60` back: leaning also crouches
(sit back low / hang over the bars). The rider point mass is pulled toward
the anchor by a spring/damper decomposed in frame axes: along-bike
`−k·x − c·ẋ`; up `−k_up·ext − c·ėxt + m g`, where `k_up = k + kLanding·|d|`
in compression (legs, stiffening under landing loads) and `k·armFrac` in
extension **only while preloading** (legs relax so the crouch does not yank
the bike up). Every rider force reacts on the frame **at the anchor**, so
weight shift is a real moment with the arm the CONTRACT wants and nothing is
invented: in free fall the rider floats `m g / k` = 0.12 m above the anchor
and the frame feels no force.

### 7.2 Derived pose (renderer only)
`lean = leanEff`, `crouch = clamp((0.50 − riderLocalY)/0.30, 0, 1)`,
`torsoPitch = clamp(−0.35·lean − 0.15·wrap(angle), ±0.9)`,
`armExtend = clamp(max(0, −lean) + 0.5·max(0, wrap(angle) − 0.6), 0, 1)`.

### 7.3 Landing recovery
Measured (F6): from a 2 m drop at 6 m/s the bike rides away for every pitch in
**−30..+35 deg**; +40 loops out, ≤ −35 is not tested. Rear touches first from
−15 deg up. The eject rule is 12 kN sustained 2 ticks or 1.3·tetherMax.

### 7.4 Torso angular momentum store
A point-mass rider cannot rotate the bike in the air the way Trials does
(pulling the bars). The rider carries a hidden angular DOF (inertia 15 kg m²)
coupled to the frame by a torque pair `τ = clamp(k·(lean·swing − rel) −
c·relRate, ±300 Nm)`: leaning back swings the torso and the equal-and-opposite
torque pitches the frame nose-up. Angular momentum is conserved (the torso
angle is never rendered; `torsoPitch` above is the visual). Measured: 0.5 s of
lean back in the air = **+15 deg**, throttle +14, brake −17.

### 7.5 Bunny hop (technique, no button)
```
IDLE    --lean <= -0.5 && throttle >= 0.3 && rear grounded-->  PRELOAD (t=0)
PRELOAD crouch -> 1 over 0.25 s (eased); lean back lifts the front (7.1 + 7.4)
        --t >= 0.12 s && (lean rate >= +4/s || lean > 0)-->      PUSH
        --t > 1.5 s || lean released || throttle dropped-->       RECOVER
PUSH    anchor jumps to +hopExtend, spring -> kPush, damper x0.1, leg actuator +hopForce
        (capped hopMaxForce) until the rider passes the anchor (legs straight) or 0.35 s
RECOVER hopExt, crouch decay; -> IDLE after 0.6 s or when both wheels are down again
```
The actuator accelerates the rider up at ~30 m/s²; the legs-straight stop
then yanks the frame up through the anchor and the recovering anchor pulls
the frame up further. Measured stationary hop (0.3 s preload): rear apex
**0.69 m**, airtime 0.85 s, phases idle>preload>push>recover.

### 7.6 Braking
Front brake torque fades with rear-wheel unload (`antiEndo`: factor
`clamp(N_rear / (0.05·W), 0.25, 1)`) — the rider modulating a stoppie. Full
brake at neutral lean stops in 8.0 m with −7.5 deg of dive and no endo;
leaning back stops from 10 m/s in **5.2 m** (CONTRACT asks ≤ 4.5, see 12).

## 8. Crash detection and ragdoll

Fault when any of: head/torso sensor circle touches any collider (rule 1,
`debug().crashCause = 'sensor'`); rider 1.3·tetherMax from the anchor or
≥ 12 kN of tether force for 2 ticks ('tetherDist'/'tetherForce'); any bike
body below `track.oobY` → `out-of-bounds`; any bike body inside a hazard AABB
→ `hazard`. Over-rotation alone is not a crash; frame hard points touching the
ground are ordinary contacts. On fault: `finished = true`, engine cut, rider
point mass parked, 7-body ragdoll spawned from the rider pose with the rider's
velocity + ½ frame spin + ±0.3 m/s `Rng` spread (one `nextU32` per tick keeps
the stream in the hash surface), bike continues as free bodies. After 3 s
every velocity is zeroed and the world sleeps. `reset()` rebuilds everything
from the spawn in one tick (`world.test.ts`).

## 9. Determinism rules

No `Math.random`, `Date`, `performance`, frame delta. `src/physics/dmath.ts`
provides `sin cos atan atan2` from `+ − × ÷ sqrt` only (Taylor with range
folding, |err| < 1e-9, tested against `Math` over 4e5 samples) so V8 and JSC
agree bit-for-bit. Fixed iteration counts, fixed constraint order, grid
broadphase by index arithmetic, no `Map` iteration, no sorting. Two worlds
hash identically over 3000 ticks including a crash and a restart.

## 10. Collision against track geometry

`src/physics/collision.ts` turns `CompiledTrack.colliders` into primitives:
polyline → segments with left normal (`oneWay` segments only from their normal
side, per CONTRACT §2.2), circle → static circle or drum body, box → OBB,
seesaw → OBB owned by a pinned body (rests tipped toward −x at its limit).
Uniform 2 m grid on x; every moving thing is a circle so the narrowphase is
circle-vs-{segment, circle, OBB}. Hazards are AABBs checked in `derive`.

## 11. API surface

```ts
export function createBikePhysics(physicsHz: number, tuning?: PartialTuning): BikePhysicsWorld;
export const bikePhysicsFactory: PhysicsFactory;
export interface BikePhysicsWorld extends PhysicsWorld {
  readonly tuning: Readonly<BikeTuning>;
  debug(): PhysicsDebug;            // bodies, contacts (λn, λt, μ, surface), engine, suspension, rider, balancePitch, crashCause
  balancePitch(lean: number, accel?: number): number;
  teleport(pose: { pos: Vec2 /* rear wheel centre */; angle: number; vel?: Vec2; angVel?: number }): void;
}
```
`getState()` fills every `PhysicsState` field: `wheels.*.spinVel` is positive
when rolling forward (mock convention, so `rearSlip = spinVel·R − groundSpeed`
holds), `contacts` name the surface under each grounded wheel, `land` events
fire when a wheel regrounds after ≥ 6 airborne ticks with the normal impulse.

Controllers (`src/physics/controllers/`, tests only): `fullThrottle`
(anti-loop launch), `cruise`, `wheeliePD`, `airPitch`, `hopper`,
`ledgeHopper`, `climber(slopeDeg)`, plus `runController` (decision Hz,
latency, quantized like a human) and `stepN`.

## 12. Measured envelope (round 1) vs CONTRACT §2.5

From `pnpm test` (`FEEL …` lines in `feel.test.ts`, `PERF …` in `world.test.ts`).

| quantity | CONTRACT | measured | |
|--|--|--|--|
| total mass / wheelbase / radius | 145 kg / 1.30 / 0.34 | 145 / 1.30 (1.28 at sag) / 0.34 | PASS |
| COM above axle line, neutral | 0.45 m | 0.40 m (0.05 traded into lean crouch) | note |
| 0 → 16 m/s, flat dirt | ≤ 3.5 s | 2.84 s anti-loop launch; 2.13 s at thr 1 / lean 1 | PASS |
| loop-out envelope (round 2) | lean ≥ +0.4 never; lean 0 ≥ 1.5 s; lean −1 ~0.8 s | lean ≥ 0.4 finishes (7.4 s); lean 0.2 loops 3.4 s; lean 0 loops 1.98 s; lean −1 loops 1.67 s | PASS / PASS / partial |
| speed governor (round 2) | thr 0.3 ≈ 11-13, 0.6 ≈ 16-17, 1.0 = 20 | 11.3 / 17.1 / 20.35 (limiter) | PASS |
| top speed | 20 m/s | 20.35 m/s, limiter-bound | PASS |
| brake from 10 m/s | ≤ 4.5 m | 4.66 m lean back (no endo) | FAIL (close) |
| stationary hop rear apex | 0.55-0.75 m | 0.74 m, airtime 0.87 s | PASS |
| 5 m/s run-up, 0.9 m ledge | makeable | rear reaches the top, run ends in a crash; 0.5 m ledge clean | FAIL |
| climb 55 / 60 deg | sustained | rear wheel wedges at the base corner (no fault) | FAIL |
| climb 65 deg | stalls, rolls back | stalls (0.4 m back) then loops and head-hits | FAIL |
| climb > 70 deg | needs a hop | not ridden | PASS |
| balance pitch, lean 0 | 40-50 deg | 42.4 (32.4 back, 62.0 fwd, 59.5 at +3 m/s²) | PASS |
| open-loop divergence | 1-2 s | 1.02 / 0.98 s | PASS |
| PD hold | indefinitely | 1.7 s (controller, not physics: lean authority is slow, 100 ms latency) | FAIL |
| landing recovery (2 m, 6 m/s) | design: −5..+40 | −30..+45 rides away | PASS |
| air control 0.5 s | — | brake −17, throttle +14, lean back +15 deg | PASS |
| crash rules | head/torso, hazard, oobY | all three tested; over-rotation alone never faults | PASS |
| restart → riding | 1 tick | `reset()` is one call, `tick = 0`, events `fault,restart` | PASS |
| determinism | two runs equal; restore(snapshot()) equal | equal over 3000 ticks incl. crash+restart; forks at 5 points × 500 ticks equal | PASS |
| µs/tick p95 | ≤ 60 riding, ≤ 80 ragdoll | 3.3 riding, 7.2 ragdolling (node, 20k ticks) | PASS |

Known gaps for round 2, in order: (1) climb — the rear wheel sits in the
concave flat/plank corner with two contacts and spins; needs either a
compliant tyre (soft contact) or a corner-rolling fix in the narrowphase, then
the 65 deg roll-back needs the climber to brake instead of looping; (2) brake
distance — traction/ramp-limited at ~11 m/s², needs the rider mass lower under
braking or a stiffer initial bite; (3) `wheeliePD` — retune with throttle as
the fast loop (the physics holds a wheelie fine: open-loop 1 s divergence);
(4) 0.9 m ledge — the manual + hop reaches the height, the landing on the top
needs the recover phase to level the bike; (5) ragdoll does not collide with
the bike bodies (passes through the frame).
