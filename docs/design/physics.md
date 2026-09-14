# Physics design: bike + rider

Owner: physics. Scope: `src/physics/**`. Where this file disagrees with
`docs/design/CONTRACT.md`, the CONTRACT wins and this file is wrong.
Units: metres, kilograms, seconds, radians; +x along the course, +y up;
angles CCW-positive, so **nose-up pitch is positive**. Fixed step 1/120 s.

Status: **round 3 complete** (third physics owner). Shipped this round: (1) the torso is a
**torque-limited motor** (velocity constraint with a bang-bang rate profile), not a saturated spring,
so a corner hit is absorbed instead of stored and returned; (2) tyre grip is judged on the previous
tick's **resolved slip** (the pre-solve contact velocity carried the engine's unconstrained spin-up
and marked every driven tyre as sliding, costing 10 % of grip under throttle); `muPeak` 2.1,
`slideFrac` 0.92 so tan 60 deg (1.73) sits under the sliding grip on wood (1.84) and tan 65 (2.14)
above the peak (2.0); (3) hop legs act on the **pegs** and push until **legs straight** (the stop is
now the fixed leg length above the neutral anchor, not 5 cm above the crouched target, which used to
yank the whole bike up on every crouch and lean-back); (4) preload = slack legs (rider drops at
~0.85 g, bike unloads) then a stiff catch; (5) arms can pull the bike up by at most 300 N outside a
hop; (6) brake input slews (lever squeeze) and the rider caps the front brake from the COM geometry so
5 % of the weight stays on the rear; (7) `leanCrouch` 0.4 -> 0.2 so a preload wheelie at speed can
lift the front (the crouched lean-back COM sat below the axle line). Results: **60 deg sustained
climb** (rear climbs the whole 3.46 m face at ~3 m/s, hangs on the lip: known gap), **0.9 m ledge at
5 m/s made and ridden away**, hop apex 0.64 m, PD wheelie 12 s, b1 cleared by the naive sweep
controller. 39 tests green, 2 `it.fails` (60 deg lip, brake 4.54 vs 4.5 m), see section 12.
Track smoke sweep: `npx tsx src/physics/tools/trackSweep.ts`.
Not yet wired into `src/main.ts` (core-game owner swaps `new MockPhysics(hz)` for `bikePhysicsFactory(hz)`).

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
| 3 | rider | 75 | 15 (hidden torso DOF, section 7.4) | none of its own: the 3 crash sensors (head r 0.15, torso 2× r 0.13) sit on the **drawn** body chain (7.7) — a touch is a crash, never a contact |
| 4-10 | ragdoll head/torso/pelvis/upperArm/forearm/thigh/shin | 5/30/12/5/3/12/8 | rod | 1-2 circles per limb, μ 0.6, e 0.15 |
| 11+ | one pinned body per seesaw, then per rolling drum | ∞ | seesaw m·L²/3; drum ½(60·r²)·r² | box / circle owned by the body |

Total 145 kg; combined COM at neutral lean is 0.76 m ahead of the rear axle and
0.68 m above ground (0.34 m above the axle line; CONTRACT says 0.45). Round 2 moved the
rider anchor from (0.21, 0.50) to (0.33, 0.38): the neutral attack position is forward and
low so that 1440 N of low-rpm thrust (needed for the 60 deg plank) does not loop the bike at
lean 0 within 1.5 s — the critical launch acceleration is g·d/h = 11 m/s².

### 2.2 Constraints, in solve order

1. Suspension sliders (rear, front): wheel centre on the line `axle + axis·c` in
   frame space (bilateral perpendicular constraint) plus unilateral travel
   limits at c = 0 and c = travel. Spring/damper along the axis is a force
   (section 4) with the damping impulse clamped so it can never reverse the
   compression rate in a tick.
2. Rider tether: radial max-distance (`tetherMax` 0.5 m) and the
   **legs-straight stop**: the rider cannot rise more than `legSlack` (5 cm)
   above the **neutral anchor height + hop extension** along frame-up (a fixed
   leg length above the pegs; the crouch lowers the target, not the limit). The
   stop is what lets a hop lift the bike; it reacts on the pegs (`hopPegX`).
2b. Torso motor: torque-limited (`maxTorque`) velocity constraint driving the
   rider's angular DOF to `lean*swing` relative to the frame along a bang-bang
   optimal rate profile (never overshoots; frame rotation under it is absorbed).
3. Ragdoll revolute joints (6, point + angular range about the spawn pose).
4. Seesaw angle limits (±`maxAngle`).
5. Contacts: normal (accumulated, ≥ 0, restitution 0 for bike, 0.15 ragdoll)
   then friction (tyre model for wheels, Coulomb 0.6 otherwise).
6. Brakes: angular constraint locking wheel spin to the frame, impulse-capped
   at `brakeEff·maxNm·dt` (`brakeEff` slews at 30/s up, 40/s down: the lever
   squeeze); the front cap is the torque that keeps `rearLoadMin` of the weight
   on the rear for the current lean's COM geometry, times a feedback fade with
   floor `antiEndoFloor` (7.6).

### 2.3 Tyre

Contact-point friction is the rolling constraint (the patch velocity already
includes ω×r). `κ = |slip_prev| / max(|v_t|, 1 m/s)` where `slip_prev` is the
**previous tick's resolved slip** (`PhysicsState.rearSlip`), never the pre-solve
contact velocity (that carries this tick's unconstrained engine spin-up of the
0.7 kg m² wheel, ~2 m/s per tick at full torque, and judged every driven tyre as
sliding); μ = `muPeak`·grip(surface)·shape(κ) with shape = 1 for κ ≤ 0.15
falling linearly to `slideFrac` 0.92 at κ ≥ 1. `muPeak` 2.1 (wood: peak 2.0,
sliding 1.84, so tan 60 deg = 1.73 holds even spinning and tan 65 = 2.14 never
does — the CONTRACT's 60/65 ridge is a tyre number); grip dirt 1.0, wood 0.95, concrete 1.05, metal 0.75,
rubber 1.1, grate 0.9, stone 1.0, snow 0.5. Rolling resistance 0.012·N·R.

## 3. Engine, brakes, aero

`rpm = max(idle + throttleEff·(clutchRpm − idle), ω_rear·gearRatio·60/2π)`
— idle 1500, slipping auto-clutch 3500 under throttle, **limiter cuts at
10 000 and re-arms below 9 500** (CONTRACT). Torque curve (rpm, fraction), **soft off idle** so a full-throttle launch does
not loop at neutral lean:
`[1500,.68] [3500,.80] [5000,.85] [6500,1] [8000,.95] [9500,.85] [10000,.8]`,
peak 38 Nm × gear 17.5 × η 0.92 = 612 Nm at the wheel = 1800 N of thrust
(**1440 N** off the line through the slipping clutch; round 1 had 1170 N, which is less than
the 1232 N = m g sin 60 a 60 deg plank needs just to hold, so nothing steeper than ~50 deg
could ever be climbed. The corner at a plank base is not a solver problem: a wheel in a 60 deg
concave corner lifts out exactly when the rim thrust exceeds m g sin 60).
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
partial)` deep-merges. Values as shipped in round 3:

```
gravity 9.81
frame   mass 56  inertia 14  comHeight 0.55
wheel   radius 0.34  mass 7  inertiaRear 0.7  inertiaFront 0.5  wheelbase 1.30
susp rear  axle (-0.585,-0.210) axis norm(0.17,0.985) travel 0.22 k 12000 cComp 650 cReb 1100 preload 0.02 kStop 60000 @0.8
susp front axle (+0.715,-0.215) axis norm(-0.42,0.91) travel 0.20 k 10500 cComp 550 cReb 950  preload 0.02 kStop 60000 @0.8
tyre    muPeak 2.1 kappaPeak 0.15 slideFrac 0.92 vRef 1.0 rollRes 0.012 (kappa from the previous tick's resolved slip)
engine  idle 1500 clutch 3500 limiter 10000/9500 peak 38 Nm gear 17.5 eff 0.92 engineBrake 0.08 slew 40/60 (curve: section 3, 0.80 at the clutch)
brakes  front 640 rear 500 antiEndo 0.05 antiEndoFloor 0.8 rearLoadMin 0.05 rise 30/s fall 40/s
rider   mass 75 anchor (+0.33,+0.38) k 6000 c 740 (legs, frame-up) kAlong 20000 cAlong 1800 shiftForce 2000 (fore-aft brace, capped) kLanding 40000
        armPull 300 (max upward pull on the bike outside a hop)
        leanBack 0.60 leanFwd 0.73 leanRate 6 leanCrouch 0.20 (back) leanCrouchFwd 0.50
        crouch 0.30 crouchTime 0.25 preloadSlack 0.85 hopExtend 0.15 hopForce 3200 hopMaxForce 3800 kPush 500 hopPegX 0.08
        hopPreloadMin 0.12 hopPreloadMax 1.5 hopPushTime 0.35 hopRecoverTime 0.6
        hopLeanBack -0.5 hopThrottle 0.3 hopSnapRate 4
        tetherMax 0.5 ejectForce 16000 legSlack 0.05
        headRadius 0.15 torsoRadius 0.13 torsoFollow 0.5
        torso inertia 20 swing 1.5 maxRate 7 rad/s maxTorque 400 (motor)
aero    dragCoef 3.2
solver  velocityIters 8 slop 0.005 baumgarte 0.2 jointBaumgarte 0.3 speculativeMargin 0.02
ragdoll sleepAfter 3.0 restitution 0.15 mu 0.6 spread 0.3
drum    density 60
```

Static checks: rear sag 0.097·0.22 = 21 mm, front 0.240·0.20 = 48 mm (rider forward);
frame level within 0.8 deg at rest; sprung frequency ~2 Hz; rider legs 8.9 rad/s ζ 0.55,
fore-aft 16 rad/s ζ 0.73.

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
`h` above. `balancePitch(lean, a) = π/2 − atan2(h, d) − atan(a/g)`, computed
from the tuning masses with the rider at the lean-shifted anchor. **Forward
acceleration lowers the balance pitch** (the pseudo-force at the COM is a
nose-up moment: gas lifts the nose; round 1 had the sign the other way).

| lean | d (m) | h (m) | balance pitch | measured |
|--|--|--|--|--|
| −1 (back) | 0.45 | 0.63 | 37 deg | 36.7 (round 3: lean crouch 0.2, rider sits higher) |
| 0 | 0.76 | 0.68 | 48 deg | 47.1 |
| +1 (fwd) | 1.14 | 0.44 | 69 deg | 68.7 |
| 0, a = +3 m/s² | | | 30 deg | 30.1 |

The static figure is optimistic by 2-4 deg on a plank: rear squat and fork
extension pitch the frame nose-up relative to the wheel line (the torso motor
no longer returns the corner hit, 7.4).
Instability: σ = √(g/l), l ≈ 1.0 m → e-fold 0.32 s; a 0.5 deg error leaves
±15 deg in **0.85 s** open loop (CONTRACT band 1-2 s, measured 0.87 / 0.84).
The same geometry bounds the climb: at lean +1 the front stays loaded up to
~66 deg (measured), so 55 deg is climbable with the front hovering, 60 deg is
2-3 deg from the edge and stalls when the torso swing kicks, 65 deg stalls in
the base corner.

## 7. Rider model

### 7.1 Weight shift as a force
`lean` is slewed at `leanRate` into `leanEff`. The anchor in frame space is
`(0.33 + leanOff, 0.38 − leanCrouch − crouch·0.30 + hopExt·0.15)` with
`leanOff = leanEff·0.73` forward, `leanEff·0.60` back, `leanCrouch = 0.50·lean`
forward / `0.20·|lean|` back: leaning also crouches (sit back / hang over the
bars). Round 3 halved the lean-back crouch: with 0.40 plus the preload crouch the
rider COM sat 0.23 m above the ground (below the axle line), total h 0.37 m, and
1440 N of thrust could not lift the front at speed — the rolling ledge hop needs a
wheelie held during the preload. `leanFwd` is capped by the flat: at 0.73 the lean-+1 COM is 0.16 m
behind the front contact; at 0.9 a full-throttle launch at lean +1 endos. The
rider point mass is pulled toward the anchor by a spring/damper decomposed in
frame axes: along-bike `−kAlong·x − cAlong·ẋ` (20 kN/m: a standing rider
braces fore-aft with arms and legs, which is what keeps the neutral launch
from looping and shortens the braking distance); up `−k_up·ext − c·ėxt + m g`, where `k_up = k + kLanding·|d|`
in compression (legs, stiffening under landing loads); **while preloading with
the rider above the anchor the legs go slack**: `fUp = m g·(1 − preloadSlack)`
so the rider drops into the crouch at ~0.85 g and the bike unloads, then the
stiff catch below the anchor loads it (that is the preload). Outside a hop the
frame can be pulled **up** by at most `armPull` 300 N (feet on pegs: only the
arms can lift the bike). The fore-aft brace is capped at `shiftForce` 2000 N.
The brace reacts at the anchor (tried at the pegs: a non-collinear pair with the
rider's inertia force is a couple, and the bike pitched nose-down under every
acceleration — the wheelie balance point moved and the PD hold fell to 1 s). Every rider force reacts on the frame **at the anchor**, so
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

### 7.4 Torso angular momentum store (motor)
A point-mass rider cannot rotate the bike in the air the way Trials does
(pulling the bars). The rider carries a hidden angular DOF (inertia 20 kg m²)
driven toward `lean·swing` (swing 1.5 rad) relative to the frame by a
**torque-limited motor** solved as a velocity constraint: desired rate
`sign(err)·min(maxRate, sqrt(2·0.8·maxTorque/I·|err|))` (bang-bang optimal, so
it decelerates before the target and never overshoots), impulse clamped at
`maxTorque·dt` = 400 Nm. Round 2's spring had the damping inside the torque
clamp: after a corner hit the torso swung 40 deg past its target and the return
stroke pushed the nose 5-8 deg up — that was the 60 deg stall. Angular momentum
is conserved (the torso angle is never rendered; `torsoPitch` above is the
visual). Measured: 0.5 s of lean back in the air = **+12.6 deg**, lean forward
0, throttle +8.5, brake −19. Note the pure mass shift of leaning back gives
nose-DOWN (the rider's mass moves back above the bike COM); the torso is what
gives nose-up, as on a real bike (the bars, not the seat).

### 7.5 Bunny hop (technique, no button)
```
IDLE    --lean <= -0.5 && throttle >= 0.3 && rear grounded-->  PRELOAD (t=0)
PRELOAD crouch -> 1 over 0.25 s (eased); lean back lifts the front (7.1 + 7.4)
        --t >= 0.12 s && (lean rate >= +4/s || lean > 0)-->      PUSH
        --t > 1.5 s || lean released || throttle dropped-->       RECOVER
PUSH    anchor jumps to +hopExtend, spring -> kPush, damper x0.1, leg actuator +hopForce 3200
        (capped hopMaxForce) at the PEGS (hopPegX 0.08) until the legs are straight (rider at
        the leg stop) or 0.35 s
RECOVER hopExt, crouch decay; -> IDLE after 0.6 s or when both wheels are down again
```
Preload: the legs go slack, the rider drops ~0.5 m into the crouch and the
catch compresses the suspension. Push: the actuator accelerates the rider up at
~30 m/s²; the legs-straight stop then yanks the frame up **through the pegs**
(the lean-+1 anchor is almost over the front axle; a yank there lifted the
front and left the rear 0.15 m short). Measured stationary hop (0.3 s preload):
rear apex **0.64 m**, front 0.54, airtime 0.58 s, phases idle>preload>push>recover.
Rolling hop onto a 0.9 m ledge at 5 m/s (`ledgeHopper`): wheelie held at 40 deg
from 8 m out so the front meets the lip, snap 0.8 m before the wall, rear
follows, lands at −33 deg and rides away.

### 7.6 Braking (see also 7.7)
Brake input slews at 30/s (lever squeeze; a one-tick full clamp on the rear
locked the wheel and lifted the rear on its own). The front cap is a
feed-forward from the COM geometry of the current lean: the torque that keeps
`rearLoadMin` 5 % of the weight on the rear (`(W(L−d) − 0.05WL)/h − μN_rear`),
times the feedback fade `clamp(N_rear/(0.05·W), 0.8, 1)`. Full brake at neutral
lean stops from 10 m/s in 7.7 m with −7.5 deg of dive and no endo; leaning back
**4.54 m** (CONTRACT ≤ 4.5, 4 cm short): the lean-back shove (75 kg moved 0.6 m
in 0.17 s, reacting at the anchor 0.93 m up) unloads the rear for ~0.15 s
before the brakes bite. `leanRate` 8 closes it (4.46) but breaks the hop and
the 60 deg climb; a fade floor of 0.9 makes lean-0 braking chaotic (10.7 m).

### 7.7 Drawn body chain: crash sensors and ragdoll spawn
The dynamics point mass sits low and far forward at full lean (it is a
lever, not a body). Crash sensors therefore live on the body the renderer
draws (`riderModel.ts` poseRider, standing): hips at frame-local
`(−0.12 − 0.28·back + 0.14·fwd − 0.06·crouch, 0.74 − 0.4·crouch)`, torso
0.5 m long pitched `0.62 + torsoPitch + 0.3·fwd + 0.5·crouch − 0.5·back −
0.35·armExtend` rad forward of frame-up, head 0.195 m beyond the shoulders at
`0.45·torsoA − 0.1`. Sensors: head r 0.15, torso r 0.13 at 0.14 and 0.38 up
the torso. What you see hit is what crashes; a loop-out now faults at ~115 deg
of pitch (the head reaches the ground) instead of 195 deg. The ragdoll spawns
from the same chain with the frame's velocity at the hips plus half the point
mass's relative velocity.

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
every velocity is zeroed and the world sleeps. Ragdoll limb circles collide
with the tyres (μ rubber) and the four frame hard points as well as the track
(fixed order: limb, wheel, frame circle; `collideRagdollVsBike`), so the rider
lands on the machine instead of falling through it. `reset()` rebuilds everything
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
(anti-loop launch), `cruise`, `wheeliePD` (lean parked where the static
balance equals the target, throttle is the whole fast loop: kp 0.08 kd 0.03),
`airPitch`, `hopper`, `ledgeHopper`, `climber(slopeDeg, baseX, {topX})` (three
latched phases: approach with a 15 deg front pop so the wheel meets the face,
transition walking the rear into the corner at 1.8 m/s, climb with the lean
chosen so the balance pitch sits 10 deg above the slope and the throttle
holding the frame 8 deg above the slope; balance guard chops the throttle and
lets it roll back), plus `runController` (decision Hz, latency queue in ticks,
quantized like a human) and `stepN`. `Observation.balanceAt(lean)` exposes the
static balance map. `src/physics/tools/trackSweep.ts` runs four naive
controllers over the 15 curriculum tracks and prints progress and first-fault
cause per track.

## 12. Measured envelope (round 3) vs CONTRACT §2.5

From `pnpm test src/physics` (`FEEL …` lines in `feel.test.ts`, `LAND …` landing audit, `PERF …` in `world.test.ts`).

| quantity | CONTRACT | measured | |
|--|--|--|--|
| total mass / wheelbase / radius | 145 kg / 1.30 / 0.34 | 145 / 1.30 / 0.34 | PASS |
| COM above axle line, neutral | 0.45 m | 0.34 m (rider forward/low so 1440 N does not loop at lean 0) | note |
| 0 → 16 m/s, flat dirt | ≤ 3.5 s | 2.51 s anti-loop launch; 2.81 s at thr 1 / lean +1 | PASS |
| loop-out envelope | lean ≥ +0.4 never; lean 0 ≥ 1.5 s; lean −1 ~0.8 s | lean 0.4 finishes (7.2 s); lean 0 head-hits at 1.54 s; lean −1 at 0.84 s | PASS |
| speed governor | thr 0.3 ≈ 11-13, 0.6 ≈ 16-17, 1.0 = 20 | 11.4 / 17.1 / 20.35 (limiter) | PASS |
| top speed | 20 m/s | 20.35 m/s, limiter-bound | PASS |
| brake from 10 m/s | ≤ 4.5 m | **4.54 m** lean back, −7.5 deg dive, no endo; 7.7 m at lean 0 (was 4.47 / 7.3) | FAIL by 0.04 (`it.fails`) |
| stationary hop rear apex | 0.55-0.75 m | **0.64 m**, front 0.54, airtime 0.58 s (was 0.55 at the band edge) | PASS |
| 5 m/s run-up, 0.9 m ledge | makeable | **made, lands −33 deg, rides away** (`ledgeHopper(20,5,8,0.8,40)`); 0.5 m ledge clean | PASS (was FAIL) |
| climb 55 deg | sustained | tops a 4 m plank in 2.9 s (was 5.3), no fault | PASS |
| climb 60 deg | sustained | rear climbs the whole 3.46 m face at ~3 m/s (maxY 3.48), no stall, no fault; **hangs on the lip** (front on top, bash plate on the edge, rear 0.2 m off the face) | PASS sustain / FAIL top (`it.fails`) |
| climb 65 deg | stalls, rolls back | stalls at 1.6 m, rolls back 1.76 m, no fault (tan 65 = 2.14 > peak grip 2.0) | PASS |
| climb > 70 deg | needs a hop | not ridden | PASS |
| balance pitch, lean 0 | 40-50 deg | 47.1 (36.7 back — was 42 with the deeper lean crouch — 68.7 fwd, 30.1 at +3 m/s²) | PASS |
| open-loop divergence | 1-2 s | 0.88 / 0.86 s (test band 0.6-2.5) | note |
| PD hold | indefinitely | **12 s** (whole run) at 60 Hz / 100 ms latency, RMS 11.3 deg (visible 35-55 deg wander, like the clips), lean never saturates | PASS |
| landing recovery (2 m, 6 m/s) | design: −5..+40 | −30..+50 rides away, rear-first from −5 | PASS |
| air control 0.5 s | — | brake −19, throttle +8.5, lean back +12.6, lean fwd 0; airPitch lands 2.7 deg for a 15 deg target | PASS |
| crash rules | head/torso, hazard, oobY | all three tested on the drawn body; over-rotation alone never faults | PASS |
| ragdoll vs bike | (visible in clips) | limbs rest on tyres/frame | PASS |
| restart → riding | 1 tick | `reset()` is one call, `tick = 0` | PASS |
| determinism | two runs equal; restore(snapshot()) equal | equal over 3000 ticks incl. crash+restart; forks at 5 points × 500 ticks equal | PASS |
| µs/tick p95 | ≤ 60 riding, ≤ 80 ragdoll | 3.5 riding, 13.0 ragdolling (node, 20k ticks; torso motor + brake cap added ~0.7 µs) | PASS |

### 12.1 Landing envelope audit (`LAND` rows; drop h at speed v and pitch p onto flat dirt, throttle 0.2)

| drop | result |
|--|--|
| 1.5 m, any v, −20..+40 | all ride away; rear-first from 0 deg up (front-first at −20); peak compression R 0.9 / F 0.9, no bottom-out; +40 at 0 m/s settles from 58 deg |
| 2.5 m, any v, −20..+20 | all ride away; **both ends bottom out** (R 1.00 / F 1.00) at 0 and +20 deg; −20 deg front-first, F 0.95-1.00 |
| 2.5 m, +40 deg, 0 m/s | loops out (rear lands, nose keeps rising to 160 deg → head hits) — at 4 and 8 m/s it rides away from 58 deg |
| 3.5 m, any v, −20..+20 | all ride away, both ends bottom out, pitch swings −4..+37; 8 m/s at −20 dives to −16 deg and recovers |
| 3.5 m, +40 deg, 0 m/s | loops out |

Versus the reference (techniques.md obs 7-10, evolution-gameplay obs 11): rear-first with a compress/extend
settle — yes; bottom-out on 2.5 m+ flats — survivable, and it should read as violent: `land` impulses are
emitted for audio/particles, but there is no buck yet; a **nose-down landing at speed should endo** and
currently does not (−20 deg at 8 m/s from 3.5 m rides away) — the front dives to F 1.00 and the bump
stop returns it; open.

### 12.2 Track smoke sweep (`tools/trackSweep.ts`, four naive controllers, best per track)

b1 **CLEARED** (rider heuristic; round 2: 88 % loop-out at the ledge). b2 19 % (looped at 6.8 m/s by the constant
stranger), b3 62 % (endo into the ramp at 88 m at 2 m/s), e1 55 % (endo into box@60), e2 57 % (hazard at box@99),
e3 53 % (endo at stair@51 at 0.8 m/s), m1 32 % (endo at ledge@33), m2 30 % (looped at drum@36 at 2.6 m/s),
m3 58 % (looped at plank@80 at 6.5 m/s), h1 43 %, h2 47 %, h3 61 %, x1 25 % (stalled), x2 18 %, x3 14 %.
Every first fault is a naive controller riding into a step at walking pace and endoing, or holding full
throttle into a loop; none is a solver impossibility. The harness bot is the judge.

Known gaps, in order: (1) **60 deg lip**: the climb sustains (the round-2 stall is gone) but the bike hangs
with the front on the top, the bash plate on the edge and the rear 0.2 m off the 60 deg face; the `climber`
needs a lip technique (sit back to drop the rear onto the face, or carry more speed — arriving at 0.5 m/s is
the cause; the corner-entry stall guard costs the speed). (2) **brake 4.54 m** at lean back (see 7.6).
(3) **Drums / seesaw lip** (bot sweep: x2, x3 park against the drum; m3 parks at the seesaw's raised end):
not investigated this round — physics has no test track case yet; the circle collider is an ordinary contact
with the same tyre model, so a front-wheel lift onto the drum should work like the ledge lip; suspect the
controller/authoring (approach speed, no front lift), not the solver. (4) Landing feel: no bottom-out buck,
nose-down at speed does not endo (12.1). (5) Blind-critic items not done: `RiderPose` from the actual rider
mass state with a measured ~120 ms lag, ragdoll joint damping/floppiness, bike-on-its-side scrub friction.
(6) `climb.55.time` 2.9 s for 4 m (clips ~2 s): the corner entry still walks at 1.8 m/s.
