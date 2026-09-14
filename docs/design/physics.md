# Physics design: bike + rider

Owner: physics. Scope: `src/physics/**`. Where this file disagrees with
`docs/design/CONTRACT.md`, the CONTRACT wins and this file is wrong.
Units: metres, kilograms, seconds, radians; +x along the course, +y up;
angles CCW-positive, so **nose-up pitch is positive**. Fixed step 1/120 s.

Status: **round 5 complete** (fifth physics owner). The round fixed the harness's blocking finding: beam
search restored a snapshot and resumed a *different* world than the one `snapshot()` saw, so the bot's
committed play diverged from a replay of its own recording (`playReplayDivergence`, flat-test tick 346, e1
tick 376). Finding: the divergence was not the brake filter, the seesaw warm start or a contact cache (those
are recomputed or zeroed inside every `step()`); it was the **legs-straight stop** (`legStopX/Y`), written by
`applyForces()` and read by the *next* tick's hop state machine (`riderExt()`, the push -> recover edge) — an
instance field, so `restore()` left the previous world's value in place and the first tick after a restore
during a hop `push` forked. Shipped: (1) `legStop` and the rider `anchor` moved into `F` (`S_LEG_STOP_*`,
`S_ANCHOR_*`, NSCALAR 44 -> 48), the redundant `brakeIn` mirror removed (the solver reads `S_BRAKE_EFF`);
every remaining instance scalar is documented as write-before-read within one step (section 2); (2)
`snapshot.test.ts`: the harness probe's access pattern in-process (root snapshot, 7 macro-action rollouts,
restore, compare every tick) over a 2600-tick trajectory that covers brake, hop preload/push/recover, seesaw,
drum, crash, ragdoll-to-sleep and restart; a foreign-snapshot test (run to k, restore snapshots from other
trajectories/worlds and step them, restore k, 400 ticks hash-equal to the straight run) at 13 segment ticks;
and a used-world test (other track, crash, restart, snapshot/restore, then `loadTrack` of the same track
replays hash-equal to a fresh world, and `reset(-1)` equals a fresh load); (3) `getState()` allocation
trimmed (no closure, arrays sized up front, shared frozen empties for tracks without dynamic bodies): GC
scavenges per 2M calls 87 -> 71 riding, 101 -> 78 ragdolling; 0.29 -> 0.11 us/call riding. The browser's
100 us/tick p95 is measured through `Game.stepTicks` (rules, ghost, hashing, audio) on a stale `dist/`,
not through `physics.step()`, which is 1.4 us p50 in node with `getState()` included; hashing a state costs
~3 us, twice the physics. `harness:snapshot-probe` flat-test/bot-2 and e1-uphill-weight/bot-3 PASS; the bot
on e1 skill 3 reports `playReplayDivergence: null` (every earlier run had one). 52 physics tests green; no
feel number changed (the move is byte-preserving on a straight run: `feel.test.ts` untouched).

Round 4 (fourth physics owner) built the drum and seesaw test cases the
bot sweep asked for and found that the "bike parks against the drum" is geometry, not the solver: a drum
of radius r standing on the ground is 2r tall and meets the 0.34 m wheel at `acos((R-r)/(R+r))` from
vertical (86 deg for a 0.3 m log), so every bare drum is a wall to a constant lean; a 0.3 m log crosses
with a front lift (`drumLifter`) or a held lean-back at >= 5 m/s, and drums with r >= 0.45 bulge into
the frame's underside and need a hop, a kicker or a sunk base (section 12.3, table). Shipped: (1) the
**bash plate moved to trials-bike clearance** (bottom 0.24 m below the frame origin, ~0.3 m off the
ground; it was 0.11 m and hooked every edge as a third contact) — this **crests the 60 deg lip** (the
round-3 known gap), lets the 0.45 m drum hop over and takes the naive sweep from 9 to 11 tracks with
progress, at the cost of the 0.9 m ledge hop needing a real 0.9 m rear lift (it has 1.45 m with a
1.0 m snap); (2) **rider pose from the rider mass** (`RiderPose.lean` = the point mass's fore-aft offset,
`torsoPitch` = the torso DOF's swing, `crouch` = the mass's drop; the crash sensors use the same pose),
t90 0.28 s for a full shift; (3) ragdoll joint damping and a **stalled-engine rear brake on the crashed
bike** (travel from 7 m/s 5.3 -> 3.2 m); (4) **brake 4.47 m** (lever squeeze 60/s, 4 % rear-load floor),
closing the second round-3 gap; (5) seesaw audited on the compiled kind: rides on, does not move before
the pivot, tips in 0.4-1.0 s, rides off at 3/5/8 m/s for every curriculum board; (6) nose-down landings:
a free front wheel recovers from -50 deg at 12 m/s (the vertical impulse ahead of the COM whips the nose
up at ~400 deg/s), the brake grabbed on landing endos at every nose-down angle. 49 tests green, no
`it.fails` left. Track smoke sweep: `npx tsx src/physics/tools/trackSweep.ts`.
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
No warm starting, so there are no contact caches to snapshot: every accumulated
impulse (`tetherLambda`, `legLambda`, `torsoLambda`, `ragLambda`, `seesawLambda`)
is zeroed at the top of `solve()`, and every rider geometry point the forces need
is recomputed in `applyForces()`. **Invariant:** an instance field is written
before it is read inside the same `step()`, or it lives in `F`/`U`. The one
cross-tick read — the hop state machine's `riderExt()` uses the legs-straight
stop of the *last* force pass — is why `S_LEG_STOP_X/Y` and `S_ANCHOR_X/Y` are
in `F` (round 5; `snapshot.test.ts` is the audit). Rapier/planck
were rejected for bundle size, async wasm init and the lack of a first-class
tyre model; see the git history of this file for the comparison table.

All mutable state lives in one `Float64Array F` (48 scalars + SoA bodies:
`px py vx vy angle angVel invMass invInertia`) and one `Uint8Array U` (16
flags/enums). `snapshot()` is two typed-array copies; `restore()` is bit-exact
by construction (`world.test.ts` forks at ticks 200, crash-5, crash, crash+1,
crash+200 and compares 500-tick hash traces; `snapshot.test.ts` does the same
under beam-search load and from foreign snapshots). `restore()` does not touch
the event queue: drain after restoring (the harness `Sim.restore` does).

### 2.1 Bodies

| index | body | mass (kg) | inertia (kg m²) | collision shape |
|--|--|--|--|--|
| 0 | frame | 56 | 14 | 4 hard-point circles (bash plate, tail, fork crown, bars), μ `frame.mu` 0.6; the plate bottom sits 0.24 m below the frame origin (~0.3 m ground clearance at sag, a trials bike) |
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
   at `brakeEff·maxNm·dt` (`brakeEff` slews at 60/s up, 40/s down: the lever
   squeeze); the front cap is the torque that keeps `rearLoadMin` of the weight
   on the rear for the current lean's COM geometry, times a feedback fade with
   floor `antiEndoFloor` (7.6). A crashed bike keeps the rear locked
   (`crashRearBrake` 1: stalled engine in gear) and half a front brake, so it
   scrubs to rest on its tyres instead of free-wheeling away from the rider.

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
partial)` deep-merges. Values as shipped in round 4:

```
gravity 9.81
frame   mass 56  inertia 14  comHeight 0.55  mu 0.6  bash plate (-0.05,-0.14) r 0.10 (was (-0.05,-0.30) r 0.12)
wheel   radius 0.34  mass 7  inertiaRear 0.7  inertiaFront 0.5  wheelbase 1.30
susp rear  axle (-0.585,-0.210) axis norm(0.17,0.985) travel 0.22 k 12000 cComp 650 cReb 1100 preload 0.02 kStop 60000 @0.8
susp front axle (+0.715,-0.215) axis norm(-0.42,0.91) travel 0.20 k 10500 cComp 550 cReb 950  preload 0.02 kStop 60000 @0.8
tyre    muPeak 2.1 kappaPeak 0.15 slideFrac 0.92 vRef 1.0 rollRes 0.012 (kappa from the previous tick's resolved slip)
engine  idle 1500 clutch 3500 limiter 10000/9500 peak 38 Nm gear 17.5 eff 0.92 engineBrake 0.08 slew 40/60 (curve: section 3, 0.80 at the clutch)
brakes  front 640 rear 500 antiEndo 0.05 antiEndoFloor 0.8 rearLoadMin 0.04 rise 60/s fall 40/s
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
ragdoll sleepAfter 3.0 restitution 0.15 mu 0.6 spread 0.3 jointDamping 3 Nm s crashRearBrake 1 crashFrontBrake 0.5
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

### 7.2 Derived pose (renderer and crash sensors) — from the rider mass, not the input
`riderPose()` reads the dynamics: `lean` = the point mass's fore-aft offset from the neutral
anchor in frame space divided by the lean travel (`leanFwd` 0.73 / `leanBack` 0.60), `crouch`
= `clamp((anchor.y − riderLocalY)/0.30)`, `torsoPitch = clamp(−0.35·swing − 0.15·wrap(angle), ±0.9)`
with `swing` the torso DOF's angle relative to the frame over `torso.swing`, `armExtend =
clamp(max(0, −lean) + 0.5·max(0, wrap(angle) − 0.6), 0, 1)`. The lag is physical: input slew
(6/s), the 2 kN fore-aft brace cap moving 75 kg through 0.73 m, and the torque-limited torso
motor. Measured (`FEEL pose.*`): a lean step reaches 90 % of the pose in **0.28 s** (both ways), no
overshoot (the brace is force-capped and ζ 0.73; dropping `cAlong` to 1200 gives 0.22 s but breaks
the hop apex, the 60 deg crest and the air controller), the torso swing reaches 90 % in 0.43 s, the pose
settles exactly at the input. The crash sensors (`riderChain`, 7.7) are built from the same pose, so
what is drawn is what crashes. The design asked for 0.10-0.15 s with a slight overshoot; that would
need a rider who can shift 0.73 m in a tenth of a second — open, see 12.4.

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
Brake input slews at 60/s (lever squeeze, round 4: was 30/s; a one-tick full clamp on the
rear still locks the wheel, but the front cap below is what stops the endo). The front cap is a
feed-forward from the COM geometry of the current lean: the torque that keeps
`rearLoadMin` 4 % of the weight on the rear (`(W(L−d) − 0.04WL)/h − μN_rear`),
times the feedback fade `clamp(N_rear/(0.05·W), 0.8, 1)`. Full brake at neutral
lean stops from 10 m/s in 7.7 m with −7.5 deg of dive and no endo; leaning back
**4.47 m** (CONTRACT ≤ 4.5; round 3 had 4.54 with rise 30/s and a 5 % floor).

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
lands on the machine instead of falling through it. Joints carry an implicit
angular damper (`jointDamping` 3 Nm s, applied once per tick before the limits) so
limbs flop and settle rather than spin; the crashed bike keeps its rear wheel locked
and half a front brake (7.6). Measured (`RAGDOLL` row, `world.test.ts`): a 7 m/s
loop-out crash — bike travel 3.2 m and at rest 1.1 s after the fault (5.3 m / 1.5 s
without the crash brakes), limb angle spread 129 deg, hip swing 110 deg, head thrown
2.1 m. `reset()` rebuilds everything from the spawn in one tick.

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
`airPitch`, `hopper`, `ledgeHopper`, `drumLifter(centreX, r, speed)` (log crossing by a front lift, 12.3), `climber(slopeDeg, baseX, {topX})` (three
latched phases: approach with a 15 deg front pop so the wheel meets the face,
transition walking the rear into the corner at 1.8 m/s, climb with the lean
chosen so the balance pitch sits 10 deg above the slope and the throttle
holding the frame 8 deg above the slope; balance guard chops the throttle and
lets it roll back), plus `runController` (decision Hz, latency queue in ticks,
quantized like a human) and `stepN`. `Observation.balanceAt(lean)` exposes the
static balance map. `src/physics/tools/trackSweep.ts` runs four naive
controllers over the 15 curriculum tracks and prints progress and first-fault
cause per track.

## 12. Measured envelope (round 4) vs CONTRACT §2.5

From `pnpm test src/physics` (`FEEL …` lines in `feel.test.ts`, `LAND …` landing audit, `DRUM …` / `SEESAW …` rows, `PERF …` and `RAGDOLL …` in `world.test.ts`).

| quantity | CONTRACT | measured | |
|--|--|--|--|
| total mass / wheelbase / radius | 145 kg / 1.30 / 0.34 | 145 / 1.30 / 0.34 | PASS |
| COM above axle line, neutral | 0.45 m | 0.34 m (rider forward/low so 1440 N does not loop at lean 0) | note |
| 0 → 16 m/s, flat dirt | ≤ 3.5 s | 2.51 s anti-loop launch; 2.81 s at thr 1 / lean +1 | PASS |
| loop-out envelope | lean ≥ +0.4 never; lean 0 ≥ 1.5 s; lean −1 ~0.8 s | lean 0.4 finishes (7.2 s); lean 0 head-hits at 1.54 s; lean −1 at 0.84 s | PASS |
| speed governor | thr 0.3 ≈ 11-13, 0.6 ≈ 16-17, 1.0 = 20 | 11.4 / 17.1 / 20.35 (limiter) | PASS |
| top speed | 20 m/s | 20.35 m/s, limiter-bound | PASS |
| brake from 10 m/s | ≤ 4.5 m | **4.47 m** lean back, −8.1 deg dive, no endo; 7.7 m at lean 0 (round 3: 4.54) | PASS |
| stationary hop rear apex | 0.55-0.75 m | **0.62 m**, airtime 0.56 s (0.64 with the low plate) | PASS |
| 5 m/s run-up, 0.9 m ledge | makeable | **made, rear lifts 1.45 m at the wall, lands −32 deg, rides away** (`ledgeHopper(20,5,8,1.0,40)`; 29 of 300 parameter combos make it, the plate no longer hooks the edge); 0.5 m ledge clean | PASS |
| climb 55 deg | sustained | tops a 4 m plank in 2.9 s (was 5.3), no fault | PASS |
| climb 60 deg | sustained | rear climbs the whole 3.46 m face and **crests the lip in 2.95 s** for the 4 m plank (the round-3 hang was the low bash plate hooking the edge) | PASS |
| climb 65 deg | stalls, rolls back | stalls at 1.6 m, rolls back 1.76 m, no fault (tan 65 = 2.14 > peak grip 2.0) | PASS |
| climb > 70 deg | needs a hop | not ridden | PASS |
| balance pitch, lean 0 | 40-50 deg | 47.1 (36.7 back — was 42 with the deeper lean crouch — 68.7 fwd, 30.1 at +3 m/s²) | PASS |
| open-loop divergence | 1-2 s | 0.88 / 0.86 s (test band 0.6-2.5) | note |
| PD hold | indefinitely | **12 s** (whole run) at 60 Hz / 100 ms latency, RMS 11.3 deg (visible 35-55 deg wander, like the clips), lean never saturates | PASS |
| landing recovery (2 m, 6 m/s) | design: −5..+40 | −30..+50 rides away, rear-first from −5 | PASS |
| nose-down 3.5 m at 8 m/s | should endo (critic) | free front wheel: rides away from −20..−50 deg (nose whips up at ~400 deg/s, both ends bottom out); **brake grabbed on landing: endo at every nose-down angle** | note (12.1) |
| rider pose lag | 0.10-0.15 s + slight overshoot (critic) | pose from the mass: t90 **0.28 s**, no overshoot, torso 0.43 s | note (7.2) |
| crashed bike scrub | 1-1.5 m from 7 m/s (critic) | **3.2 m**, at rest in 1.1 s (5.3 m without the stalled-engine brake); limbs spread 129 deg | note (8) |
| drums / seesaw | (bot sweep: parks) | see 12.3 | measured |
| air control 0.5 s | — | brake −19, throttle +8.5, lean back +12.6, lean fwd 0; airPitch lands 2.7 deg for a 15 deg target | PASS |
| crash rules | head/torso, hazard, oobY | all three tested on the drawn body; over-rotation alone never faults | PASS |
| ragdoll vs bike | (visible in clips) | limbs rest on tyres/frame | PASS |
| restart → riding | 1 tick | `reset()` is one call, `tick = 0` | PASS |
| determinism | two runs equal; restore(snapshot()) equal | equal over 3000 ticks incl. crash+restart; forks at 5 points × 500 ticks equal; search-load probe 2600 ticks × 7 rollouts every 15 ticks equal; 13 foreign-snapshot forks × 400 ticks equal | PASS |
| µs/tick p95 | ≤ 60 riding, ≤ 80 ragdoll | 2.9 riding, 13.9 ragdolling (node, 20k ticks, vitest); step+getState 1.4 p50 / 1.8 p95 isolated, hashing the state +3 | PASS |

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
emitted for audio/particles, but there is no extra buck (the bump stop's rebound is the only kick). Round 4
audited the **nose-down landing at speed**: with a free front wheel −20 / −30 / −40 / −50 deg at 8 and 12 m/s
from 3.5 m all ride away — the front impulse acts ahead of the COM and whips the nose up at ~400 deg/s
(pitch −16..+14 for −20 deg at 8 m/s), which is what a rigid front wheel does on flat ground; the endo the
critic expects happens when the rider is **on the brake** as the front lands: crash at every nose-down angle
(`FEEL landing.noseDown.*`). An endo without the brake needs a rising landing or an edge under the front.

### 12.2 Track smoke sweep (`tools/trackSweep.ts`, four naive controllers, best per track)

Round 4 (round 3 in brackets): b1 **CLEARED** (cleared), b2 22 % (19, stalls at the first 0.3 m log — a wall
to a constant lean, 12.3), b3 **CLEARED** (62 %), e1 79 % (55), e2 57 % (57, hazard at box@99), e3 53 % (53,
endo at stair@51 at 1 m/s), m1 32 % (32, endo at ledge@33), m2 30 % (30, looped at drum@36), m3 57 % (58),
h1 43 % (43), h2 47 % (47), h3 91 % (61), x1 25 % (25), x2 18 % (18, endo at ramp@27 — the first drum is a bare
1.6 m cylinder at 28.5 m), x3 27 % (14). No track got worse; the plate change is what moved b3, e1, h3, x3.
Every first fault is still a naive controller riding into a step at walking pace and endoing or holding full
throttle into a loop; none is a solver impossibility. The harness bot is the judge.

### 12.3 Drums, logs and the seesaw (round 4; `DRUM` / `SEESAW` rows in `feel.test.ts`)

Geometry first. A drum of radius r standing on the ground is 2r tall, and a wheel of radius R = 0.34 rolling
into it meets it where the contact normal is `acos((R − r)/(R + r))` from vertical: 57 deg for r 0.1, 75 deg
for r 0.2, **86 deg for a 0.3 m log**, and past 90 deg (an overhang) for r > R. Pushing a wheel over a corner
of angle θ needs `P/W > tan θ` (P the horizontal push the rear can deliver, ≤ ~1.4 kN; W the front load,
~0.6 kN), so r ≤ 0.15 rolls; anything larger stops the bike dead — the normal impulse is horizontal and
inelastic, the whole 145 kg goes to zero in two ticks, and the friction throws the light front wheel up the
face (it reached 1.03 m on the 0.3 m log, 0.3 m short of the top with no forward speed left). That is the
"parks against the drum" the bot saw: a wedge, not a tyre-model or torque problem (κ uses `vRef` 1 m/s, so
grip is at peak at zero speed). The second wall is the frame underside: with the front on top of an r ≥ 0.45
drum the bike is pitched 45-65 deg and the drum's face bulges into the line from the rear contact to the
front axle, so the bash plate catches the face before the rear reaches it (the exact 60 deg-lip hang of round
3, and the reason the plate was moved to trials-bike clearance; a slippery plate, `frame.mu` 0.35, was tried
first and helped nothing — the 0.9 m ledge lost its hook and the 60 deg lip still hung). Matrix, flat approach, 60 Hz / 50 ms
controller (`const` = throttle 0.6 + lean 0.4; `lean-1` = throttle 0.5 + lean −1 held; `lift` =
`drumLifter`: pop the front to `asin(2r/1.3) + 8 deg` against lean −0.4 — above `hopLeanBack`, so no preload
fires — then hang forward and drive the rear up; `hop` = `ledgeHopper`-style rolling hop, best of 324 combos):

| drum | 3 m/s | 5 m/s | 8 m/s |
|--|--|--|--|
| r 0.5 sunk 0.7 (M2 speed bump, 0.3 m proud) | const OVER | const OVER | const OVER (launches, lands) |
| r 0.3 log (b2), fixed | const parks (5.3 s), lean-1 crash, **lift OVER** | const parks, **lean-1 OVER, lift OVER** | const crash, lean-1 OVER, lift OVER |
| r 0.3 log, rolls | lift OVER, drum spins 35 rad | lift OVER, 26 rad | — |
| r 0.45 (0.9 m) | const crash, lift crash, hop 24/324 combos | const crash, lift crash | const crash, lift OVER (plate skims), hop OVER |
| r 0.6 (1.2 m) | const/lift crash | lift parks (plate on the face) | lift parks; hop 0/324 (front 6 cm under the top, rear meets the face below the drum centre) |
| r 0.9 (1.8 m) | parks / crash | parks | parks; hop 0/324 |

A rolling drum spins under the tyre (tens of rad for a 0.3 m log) and the crossing is passable; the spin
makes the exit wobbly rather than blocking it. What this means for authoring: a bare drum is a log for
r ≤ 0.3 (front lift or a held lean-back at ≥ 5 m/s, never a constant lean), a 0.45 m drum is a knife-edge
hop, and r ≥ 0.6 on flat ground is unrideable — sink it (`depth`), kicker it (`kickerDrum`) or start from a
box at the drum's centre height (M2's box → drum). x2's first obstacle is a bare 1.6 m drum at 28.5 m.

Seesaw (the compiled `seesaw` kind through `compileTrack`, cruise 0.3 lean at 3/5/8 m/s, 60 Hz / 50 ms):
every curriculum board (L6 h0.8/1.0/1.5, L8 h1.2/2.0, L5 h1.0, bare and `seesawEntry`) rides on, the board
does not move before the front passes the pivot (0.00 deg; it rests on its stop), tips in **0.4-1.0 s**
(clips 16/17: ~0.5 s; the 29 deg L8 h2.0 board takes 1.0 s), reaches its far limit and the bike rides off
without a fault; the 0.12 m board-thickness lip at the resting end never parks the bike (0.0 s). At 8 m/s
the bike leaves the board before it finishes tipping. The one stall in the 60-case matrix is the 29 deg
board at 3 m/s with the rider sitting back on 0.2 throttle over the pivot — a stall, not a wall.

### 12.4 Open list, in order

(0) Browser tick cost: the harness's 100 us p95 is `Game.stepTicks` on a stale `dist/` (the bot warned
`dist/ is older than src/`); rebuild and split the measurement into physics / rules / hash before touching
the solver — in node the physics is 1.4 us p50 and the hash 3 us. The physics side that remained was
`getState()`'s output tree (~14 objects; now sized up front, 0.11 us/call).

(1) Rider pose lag 0.28 s vs the 0.10-0.15 s + overshoot the critic asked for: a faster shift needs a
higher `shiftForce` cap or a lower `cAlong`, both of which move the launch/hop/climb envelope; try a
pose-only lead (render the arms/torso ahead of the mass) rather than moving the mass faster. (2) Bottom-out
buck: no rebound impulse beyond the bump stop's; a short pitch kick on `land` impulses over ~8 kN would
read better. (3) Crashed-bike scrub 3.2 m vs 1-1.5 m: the bike lands on its wheels in 2D; a side-slide μ
0.7 would need the bike to leave the wheel line, which the plane cannot express — the stalled-engine brake
is the honest 2D version. (4) `climb.55.time` 2.9 s for 4 m (clips ~2 s): the corner entry still walks at
1.8 m/s. (5) Drums r ≥ 0.6 on flat ground: unrideable by geometry; tracks must sink, kicker or box them.
(6) The stationary hop apex dropped 0.64 → 0.62 with the plate move (the plate used to rest on the ground
during the preload crouch); still inside the band.
