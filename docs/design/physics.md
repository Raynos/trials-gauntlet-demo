# Physics design: bike + rider

Owner: physics. Scope: `src/physics/**`. Where this file disagrees with
`docs/design/CONTRACT.md`, the CONTRACT wins and this file is wrong.
Units: metres, kilograms, seconds, radians; +x along the course, +y up;
angles CCW-positive, so **nose-up pitch is positive**. Fixed step 1/120 s.

Status: **round 11 — wave 1 of the mega build** (eleventh physics owner; P1 of `docs/MEGA_PLAN.md`). Shipped:
(1) **Two bikes** as tuning presets: `BikeClass = 'rookie' | 'pro'`, `BIKE_PRESETS`, `bikeTuning(cls, over?)` in `tuning.ts`;
`loadTrack(track, seed, opts?: { bike?: BikeClass })` (additive on `PhysicsWorld`, default `'rookie'`; `BikePhysicsWorld.bike`
reports it). **Rookie** is the round-10 table (ECU wheelie control, the 4.2 kg/m drag governor, soft clutch): the flat-test
golden `d2b082502561bc00` replays byte-identical. **Pro** differs in five numbers: `aero.dragCoef` **0.45** (CdA 0.75 m², 180 N at
20 m/s, still the uniform field through the combined COM), `gearRatio` **16.2** (limiter at **22.0 m/s**), `peakTorqueNm` **56.2**
and `clutchRpm` **3240** (both scaled by 17.5/16.2 so the rim thrust at the clutch — the 60 deg plank's 1970 N — and at every road
speed below 16 m/s is Rookie's; at 3500 the taller gear cost the low-speed wheelie 20 % of its thrust), a flatter curve
(`[1500,.68] [3240,.8] [6020,.8] [7400,.86] [9500,.8] [10000,.72]`: the 8000-rpm 1.0 was the governor's counterpart — with the drag
gone it is 17 m/s² at 16 m/s and lean 0 looped at 1.6 s), and `wheelieControl.enabled` **false**. No governor: thr 0.3 reaches the
limiter (Rookie 11 m/s) — on the Pro speed is the rider's. Measured (`classes.test.ts`, table in 12): 0 → 16 **1.40 s** (fullThrottle
controller 1.93), top 22.07, lean 0.4 / 0.2 full gas never lift past 7.5 / 8.9 deg and finish, **lean 0 loops at 1.47 s** (the
skill), 55 / 60 deg planks top in **1.02 / 2.27 s**, 65 stalls at 0.26 m, hop **0.687 m**, the 0.9 m ledge at 5 m/s made (10 of 36
hopper combos; Rookie 12), landing 2 m at 6 m/s rides away −30..+45 (Rookie ..+50), air control identical to Rookie (the field has
no moment). **The wheelie PD hold is the finding**: the throttle-only PD (60 Hz / 100 ms, `wheeliePD`) is a 0/1 bang-bang whose
mean thrust accelerates — Rookie "holds 12 s" because the drag parks it at 11 m/s; the Pro runs to the limiter at 22 m/s in 4.2 s
and the cut drops the nose. Neither bike holds 10 s at a *held* speed with any gain pair (`scratch pdsweep2/3/4`: throttle ceiling
closing with speed ≤ 8.7 s on Rookie, ≤ 4.9 s on Pro; the rear brake as the negative half 0.6 s; a lean-actuated PD 2.2 s — the lean
is non-minimum-phase, the mass shift nose-dives first). The CONTRACT's "PD holds indefinitely" was measured against the governor;
the honest Pro number is 4.2 s to the limiter (12.4 (0)). (2) **Rookie wheelie control on crests, bumps and lips** (coordinator,
three strangers on b1/b2/b3): the control's ground reference stays max(rear, front memories) but a face steeper than
`maxSlopeDeg` 66 never becomes the reference (a 4×0.8 kicker's drop face read as a 90 deg climb and the control fed full gas into
the flight), an unloaded rear's memory relaxes toward level at `airRelax` 1.5 rad/s once off for `airDelay` 12 ticks (a skip at a
lip is not flight), the taper continues from `minFrac` at `pitchMin` 40 to **zero at `pitchCut` 50** (an ECU past the balance
point cuts), and with the rear airborne ≥ 12 ticks, the nose past `pitchFull` and no hop in progress the drive may spin the rear
at most `airSpin` 1 m/s over road speed (off the lip the rear spun to the limiter and its reaction rotated the bike +57 deg/s to
the landing; a blip on a nose-down flight is untouched: F9 throttle +14.8). Full gas at lean 0: 20×2 m cosine crest **42 deg
max, no fault** (43 before, with the 60–120 the strangers saw on b1's real crest not reproduced here), 4×0.8 kicker at 8 / 11 m/s
**lands at 65 deg peak and rides away** (was 128 deg loops); the 65 is the ballistic launch attitude off a 4 m ramp ridden in a
wheelie and is not ≤ 45 (open). The 0.3 m-proud drum row at full gas is a **nose-over at 13–17 m/s in both builds** (the rear
kicked off the bump), not a wheelie-control case — reported. Flat table, hop, climbs, PD unchanged to the digit; **Rookie goldens
other than flat-test change** (m3, e3, h2, x3, b3, gap-test: the bots brake and gas in the air) — regenerate. Naive sweep: equal
or better on every track (e2 92 → 97 %, m2 42 → 50, h2 42 → 87). (3) **One-way plank straddle** (tracks.md 6.1): the hang was not
the edge — a rear wheel whose centre arrived below the board's surface passed under the leading edge (the one-way test rejects a
centre on the back side), the frame came to rest on the board on its plate / tail with the rear wheel *through* the board, v 0, no
contact, no fault. Fix in `collision.ts`: a wheel decides a one-way segment's side by the **frame origin** (`queryCircle` /
`circleVsPrim` take a reference point); a wheel centre on the back side within one radius of the surface and within the segment's
extent ± R, with the frame on the front side, is a **straddle**: the manifold is the board's plane (normal up, separation through
the board, `Manifold.straddle`) and bike.ts caps its Baumgarte lift at `STRADDLE_LIFT` 2.5 m/s. 45 pitched arrivals at 9 m/s (rear
0.7 m below to 0.4 above the board, 0.6–1.2 m back): **0 hang** (was 9), 34 on / 11 fell. A 2R-deep two-sided end cap was built
first and rejected: the rear pressed against the cap with the front on top and hung there (20 of 45), and its top corner duplicated
the board's vertex contact and moved m3 / x3. Residual at 3–5 m/s: the bike beaches on its plate on the board's end with the rear
wheel short of it (rim < board start) — a real beaching, not the wedge. Every golden byte-identical to this change alone.
(4) **Air brake** `brakes.airNm` 60: a wheel off the ground (last derive) is dragged, not locked. Brake at 8 / 14 / 20 m/s, 0.5 s:
**−13.5 / −18.6 / −20.5** (was −15.6 / −26.2 / −36.3; asked −15..−25 at ≥ 14). Cost: the brake-grabbed nose-down 3.5 m landing
dives to −15 / −34 at −20 / −40 deg and rides away (round 9: −40 / endo) — the front meets the ground spinning and the anti-endo
cap has a rear load to read. (5) `wheeliePD` gained `ks / bias / kv / kb` (defaults byte-identical) and `wheelieLean` (the
reference's lean-actuated balance, measured and not usable at 100 ms); `trackSweep.ts` takes `TRIALS_BIKE=pro`. **Not done: the
rear-wheel bounce / drum pump** (deliverable 2). Analysis before building: the hop push and the legs-straight stop act along
**frame-up**; at a 60–70 deg rear-wheel stand frame-up is 60–70 deg from vertical, so a push there is mostly a horizontal pair
(rider back, bike forward) — the drawn chain's hip → peg line at hang_back is 37 deg forward of frame-down, i.e. ~28 deg past
vertical at 65 deg pitch, which is the honest axis; making the leg axis follow the chain (or blend toward world-up past ~45 deg
pitch) is the plant change the pump needs, and it moves every hop. A round of its own (12.4 (7)). 70 tests green (10 new in
`classes.test.ts`: presets, Pro envelope, PD finding, crest / kicker / drum row, straddle sweep, per-class golden hashes
`d2b082502561bc00` / `32a467457c497e2c` on flat-test bot-3); snapshot / foreign-snapshot / determinism untouched (no new state:
the class is a table swap at `loadTrack`, the straddle reads this tick's positions, the control reads existing `F` slots).

Round 10 (tenth physics owner). Three asks: airborne lean authority, the pose couplings the
rider-pose owner documented, and the crash/ragdoll chain re-matched to the drawn rider. (1) **Air lean.** Decomposed by
switching subsystems off at 14 m/s (`scratch decomp`): the torso store alone gives **+32.5 / −33.8 deg** in 0.5 s for lean
−1 / +1 — the asked band exactly — and the lean's **mass shift** eats it: the 75 kg point mass translating 0.6 m back /
0.73 m forward relative to the frame ~0.5 m above its COM is angular momentum the frame must return (torso off: lean −1 is
**−36**, lean +1 **+19**; both the wrong way), the lean drops' arm pull (`fUp < 0` at the lean-shifted anchor) takes −1 / −12
more, engine braking −7. On the ground the shift is a lever braced against the tyres (brake 3.2 m, the balance table, the
climbs); in the air nothing braces it and the drawn hang-back only moves the hips 0.29 m. Shipped: an **airborne blend
`S_AIR`** (in `F`; toward 1 over `airRise` 0.10 s once both wheels have been off the ground for `airDelay` 12 ticks and no
frame hard point carries load, back toward 0 over `airFall` 0.12 s the tick a wheel touches) that scales the lean's shift
and drops to **`airShift` 0.25** of their ground travel — airborne the lean is the torso swing — and fades the **engine
braking to 0** after the same delay (a rider in the air pulls the clutch; the free-wheeling rear no longer bleeds its
41 N m s into the frame). The blend **holds through a hop's push and recover**: the forward snap there is the legs
throwing the body over the bars at ground travel, and an anchor retreating under a mass already thrown forward pitched
the stationary hop 13 deg nose-down (rear apex 0.68 → 0.78 m, a ground guarantee) — held, the hop is byte-identical. The
12-tick delay is what keeps the ground byte-identical: at 6 ticks the 60 deg plank's base-corner transition (both wheels
off ~10 ticks) saw a 3 % blend and the knife-edge crest went 2.91 → 3.86 s, and a constant lean bounced over the 0.3 m
log at 5 m/s; the frame-contact test is a bike hung on its bash plate over that log, which is not flying. Measured
(`scratch airprobe2`, level launch, rider settled at lean 0, Δpitch at 0.5 / 0.6 s): **lean −1 +26.7 / +25.6 / +24.4,
lean +1 −20.8 / −21.6 / −22.5, no input −2.2 / −3.2 / −4.3** at 8 / 14 / 20 m/s (was +14 / +12 / +10, −0.3 / −1.4 /
−2.4, −3.7 / −5.9 / −8.1); throttle and brake unchanged. Every ground number is unchanged to the printed digit (the
climbs hash-identical to 2 s; hop 0.68 / ledge 1.06 / brake 3.16 / PD 12 s / loop table); what moved is in the air:
drops land with the wheel still at road speed (the 3 m buck 17.0 → 18.7 cm, the 3.5 m / +40 landing peaks at 54 instead of
50 deg, all still ride away). (2) **Pose couplings**: `RiderPose.crouch` is the eased hop-preload state (`S_CROUCH`), not
the mass's drop — a lean is no longer a crouch (was 1.0 at lean ≥ 0.6, 0.67 at lean −1); `torsoPitch` is the torso store's
**transient** (its lag behind the lean target, ±0.27 rad peak on a full step, back within 0.02 rad in 0.5 s) plus the
frame-pitch term — no steady −0.34·lean bias. Render should pass `crouchIsHopOnly: true, torsoPitchLeanBias: 0`. (3)
**Chain**: `riderChain()` is a port of `src/render/rider/pose.ts` (RIDER_CHAIN.md segment lengths, canonical corners,
parameter curves, leg / reach slides, 3D two-bone IK with the forward-up-out elbow and forward-in knee poles, projected
to the plane); checked against RIDER_CHAIN.md's own joint tables, not against a copy: stand_attack / hang_back /
forward_attack / hang_back + crouch within **0.5 cm / 0.5 deg**, hands on the grips and ankles on the pegs to 0.0 mm.
Ragdoll rods re-sized to the projected segments (arm 0.26 / 0.28, thigh 0.46, shin 0.42) and the joint anchors to the
chain (torso ±0.26, neck 0.22); spawn continuity 0.21 cm / 0.35 deg. 60 tests green (one new: the crouch coupling);
snapshot / foreign-snapshot / determinism untouched (`S_AIR` slot 47, `U_FRAME_GND` slot 13 — both in the hash surface).

Round 9 (ninth physics owner). P0 from a real stranger, confirmed by the parent's probe: airborne at
20 m/s with no input the bike pitched nose-down at ~100 deg/s (−53 deg in 0.6 s), lean back made it worse (−46) and lean
forward levelled it. Cause, traced by switching subsystems off: the **aero drag** (4.2 v|v|, 1.7 kN at 20 m/s) was applied to
the 56 kg frame alone at the frame origin, while the 75 kg rider was not dragged and pushed forward on the frame through the
fore-aft brace at the anchor 0.38 m above the frame COM — a nose-down couple of ~300 Nm that exists only when nothing else
holds the frame, i.e. in the air (drag off: −53 → −11 deg). Lean forward "fixed" it because the lean-+1 anchor sits 0.5 m
lower, so the same brace reaction acted below the frame COM. Second contributor: **engine braking** (8 % of peak × rpm: 66 Nm at
20 m/s, real but heavy on a 14 kg m² frame) reacting on the frame (−11 deg / 0.6 s at 20 m/s, −5 at 8). Third: `teleport()`
left the torso at 0 with a stale `leanEff`, and the motor's swing on the next ticks pitched the placed bike ~10 deg (the
parent's probe rode at lean 0.5 before teleporting). Shipped: the drag is a **uniform deceleration field** over frame,
wheels and rider (each body its mass share of −4.2 v|v| at the frame's velocity) — it acts through the combined COM, no
pitch moment, no tether load — and `teleport()` places the torso at its lean target. The magnitude stays 4.2 (§3): the
real CdA (0.45, ~180 N) was built and measured — with the round-8 net thrust folded into the torque curve so the ground
acceleration envelope kept — and it costs the PD wheelie hold (12 → 4 s), the 55/60 deg climbs (the climber tops the 55
plank and flies off the test track; the 60 hangs on the lip) and the lean −1 deliberate loop (the bike hits the limiter
before the preload times out); that is a round of its own (12.4 (0e)). The tether-force crash rule is now an
over-the-bars qualifier (§8): 30 kN for 2 ticks **and** the frame past 45 deg nose-down; a level 4×0.8 kicker at 8–17 m/s
never crashes at any input (max tether 4.8–7.7 kN) and a plain full brake at 10–20 m/s at lean −1..+0.4 dives 8–20 deg,
lifts the rear for 0.4–1.5 s and never flips (12). Air-control table before/after in §12; the climber's `hover` moved 8 → 10
(the 60 deg crest was a knife edge on the drag's line of action and stalled at the lip with the rear spinning).

Round 8 (eighth physics owner). The stranger measurement (eight fresh players, every first attempt
a loop at x ≈ 24 m holding full gas from the line at neutral lean) was traced: it was never the launch — the soft
clutch fixed that in round 7 — it is the **torque peak at 8000 rpm arriving at 15-17 m/s**: at 10 m/s² the balance
pitch at lean 0 is 48 − atan(a/g) = 12 deg, the frame is already at 13-16 deg from the squat, and the nose runs away
at 1.5-1.9 s (x 13-18 m), over at 2.26 s. Shipped one physical change: a **pitch-aware drive** (an ECU-style wheelie
control, `engine.wheelieControl`, section 3): with the front wheel up and the rider not sat back (leanEff ≥ −0.3;
blends out to nothing at ≤ −0.5) positive drive torque is tapered with the frame pitch **relative to the ground the
bike is on** — full to 25 deg, 30 % from 40 deg — plus a 0.35 s pitch-rate lead that fades in over the first 10 deg
of nose-up (the lead is what catches the runaway: at 17 m/s the nose goes 25 → 47 deg in 0.2 s, and a pitch-only
taper starting at 25 lets it through; 50 deg / no lead looped at 2.9-3.2 s). The ground reference is the steeper of
the two wheels' last loaded **surface** normals (`S_REAR_SLOPE`, `S_FRONT_SLOPE`, in F: read by the next tick's
`controls()`), taken from the segment's own normal, not the manifold's — a vertex contact at 17 m/s read a 6 deg
descent as a 20 deg climb — and the lifted front's memory relaxes toward the rear's at 0.7 rad/s. In a plank's base
corner the front is on the face while the rear is still on the flat and the frame rotates up at 120 deg/s: the
face is the reference and the lead is faded, so the push into the corner is never starved (the first build tapered
there and the 60 deg climb died at 1.0 m). Measured: **thr 1 / lean 0 from rest lifts to a 36.8 deg wheelie, holds
35.6-36.8 for the whole run and finishes 120 m in 8.07 s at 16.8 m/s**; lean −0.3 the same (37.9); lean −0.5
loops at 1.43 s and lean −1 at 2.4 s (deliberate; the preload crouch, unchanged, 12.4 (0b)); lean ≥ 0.2 unchanged
(front stays at 8-9 deg); partial throttle untouched (thr 0.7 lean 0: 7.0 deg); 0 → 16 m/s 2.19 s; top speed,
governor, brakes, hop apex 0.676 m, the 0.9 m ledge hop, drums, seesaws, landings byte-identical. 55 deg climb
1.61 → 1.72 s; **60 deg crest 3.04 → 2.73 s** (the climber's corner transition rides in cleaner). The wheelie PD
now holds: a 44 deg balance-point wheelie at lean −0.5 (control off — the pure plant) **12 s, RMS 6.9 deg** with
kp 0.1 / kd 0.03; at neutral-ish lean the control itself parks the nose at 33-37 deg whatever the PD asks (the
round-7 `it.fails` is a passing test). Cost, stated plainly: at lean ≥ −0.3 the 45-50 deg balance point is no
longer reachable on the throttle — the control holds the nose below it; a rider who wants 45+ sits back past −0.4.
Second: the **drawn rider chain is written in the render's axle frame** (7.7): the render's grips (0.27, 0.78),
ankles (−0.13, 0.11), pinned-shoulder hang-off, 0.28 m / 0.35 rad crouch, leg and reach slides; the ragdoll hand-over
vs the render's own `poseRider` (re-derived in `world.test.ts` with the origin calibrated the render's way,
(0.054, −0.142) — the render measured (0.055, −0.144)) is **0.00 cm / 0.00 deg** on the crash tick (hang-off
loop, plant, endo). 59 tests green; snapshot / foreign-snapshot / determinism untouched (two new F slots).

Round 7 (seventh physics owner) took the parent's four decisions and measured
each before building. (1) **The load-dependent drive cannot be a cap on rear normal load**: on the flat launch the
rear carries 1900-2800 N within 0.1 s (the front unloads at once) against 1870 N of thrust (thrust/N 0.7-0.95),
while on the 60 deg plank the rear carries 700-1165 N (W cos 60) against 1700-1960 N (thrust/N 1.9) — the cos
theta inverts the parent's premise, so any k that lets the plank hold lets the launch have everything. What the
launch and the climb share is the slipping clutch at 3500 rpm; what differs is that the launch starts from idle.
Shipped: a **soft clutch off idle** — the crank has inertia (`crankSpinUp` 8000 rpm/s: idle to 3500 in 0.25 s,
`crankSpinDown` 2000, a flywheel) and the centrifugal auto-clutch passes torque in proportion to crank speed
(`clutchCap` 0.8 of peak at 3500, the curve's value there, so a settled throttle is never capped; `clutchThrottle`
0.25: a quarter throttle revs to engagement speed, a rider keeping the revs up). Above `clutchRpm` the wheel drives
the crank (locked) and the rpm is the wheel's — a spinning tyre that grips again drags the crank down with it, or
the limiter would have stayed on. Lean-0 full-throttle stranger: **2.26 s** (was 1.11; 12 000 rpm/s gives 1.67,
9000 gives 1.57, the loop time is a step in the spin-up rate); lean −1 now 2.4 s (sitting back at full throttle IS
the hop preload and the crouched rider loops when he stands up); 0 → 16 m/s 2.19 s; governor/top speed/brakes/hop
unchanged. Cost: the **wheelie PD hold fell to 6 s** (`it.fails`, 12.4): the spin-up is a throttle lag below 7 m/s
and the throttle-only PD cannot balance through it — and the round-6 12 s hold was a knife edge (with the instant
plant only kp 0.08 / kd 0.03 from that exact start holds; revving for 0.3 s before the teleport drops it to 1.3 s).
The reference balances with lean (techniques obs 8), not throttle blips. (2) **Kicker lip**: traced tick by tick on
the 45 deg 1 m test plank (12.4 (0c) numbers): the base corner spins the bike at 300 deg/s off a 7-12 kN front hit
with the fork bottomed, the rear entering the corner stops it (13-20 kN), the bike then rides the 1.41 m face at
47-49 deg with the front already past the lip — a wheelie on a 45 deg face, where the throttle's F·h is the only
moment (rate 1 → 22 deg/s at lean 0, 23 → 100 at lean 0.4 in 0.07 s) — and in the air the wheel spinning to the
limiter (Δω ≈ 40 rad/s × 0.7 kg m²) adds +30 deg/s. Rear rebound damping ×5 changes nothing; slack legs (k 2000)
lower the launch pitch 6-10 deg (they absorb the base) and leave the rate. The launch attitude off a 45 deg face is
the face angle; no honest change puts it at 25-35 deg, and the parent's beginner (lean 0.4, throttle 0.6) cannot
land it at ≤ 10 m/s — while on the **curriculum's own kickers (17-22 deg, curve 0.3) that beginner lands every
one** (launch 15-27 deg, nose-down rate, landing −25..−1 deg; table in 12.4). No plant change. (3) **Buck**: the 3 m
bottom-out was not the bump stop (restitution 0-0.3 × kStop 30-120 kN/m all gave 19-21 cm / 11-12 deg) but the
rider's legs: `kLanding` stores ~1 kJ at 0.3 m with ζ 0.3 and fires the bike back up. Shipped `cLanding` 8000 (leg
damping per metre of compression, like the spring): lift **19.8 → 11.6 cm**, 2.5 m 22.5 → 17.2, kick 10.9 → 10.6
deg (the kick is the two ends' differential rebound; high-speed rebound damping saturates at the rate-reversal
clamp and kills the 1.5 m rebound cycle, not taken); hop, landing envelope unchanged; the 0.9 m ledge rides away
again and a constant-lean rider now bounces over the 0.3 m log at 8 m/s. (4) **60 deg crest**: the hang was the
climber's lip phase chopping the throttle at the balance pitch with the front already over the flat (speed
1.2 → 0.4 m/s, then a floored throttle spun the tyre at 20 m/s of slip and the plate rested on the edge); driving
through the lip (feather at > 3 m/s slip, ease only past balance + 4 deg, no brake) **crests 3.46 m in 3.04 s**
(reference clip 06 ≈ one wheelbase per second → 2.7 s), exit pitch −1..6 deg; 55 deg 2.4 → 1.61 s. 57 tests green,
snapshot / foreign-snapshot / determinism untouched (the crank state is `S_RPM`, already in `F`; the new leg damper
reads this tick's rates only).

Round 6 (sixth physics owner) answered the second blind-critic pass, whose
verdicts were all weight: "2.2 s of airtime with frozen pitch off a 45 deg ramp", "no squat, no compression
or rebound at touchdown", "limbs pop at the crash tick". Finding: the airtime was gravity (9.81 with a
bike that hops 0.62 m is a 1.4 s flight off a 1 m kicker), the suspension was critically damped
(rebound zeta 1.0) with 10 % rear sag so it never came back past sag, and the ragdoll was spawned on
a hand-placed figure (arm at 45 deg, shin straight down, pelvis 5 cm off) that was never the drawn one.
Shipped: (1) **`gravityScale` 1.4** (13.7 m/s²) with every rider/engine force retuned to it (peak torque
38 -> 52 Nm, drag 3.2 -> 4.2, brakes 640/500 -> 900/700, hop 3200/3800 -> 4500/5300 N, legs/brace/landing
springs x1.4; torso motor stays 400 Nm — 560 broke the wheelie PD hold): hop 0.68 m in 0.53 s (was 0.62 m /
0.56 s), 2 m drop 0.52 s (0.62), 45 deg 1 m kicker at 10 m/s **0.87 s** (1.40), at 14 m/s 1.10 s (1.49);
0 -> 16 m/s 2.08 s, top 20.4, brake 3.2 m; (2) **suspension that reads**: sag 27 % / 25 % (10 / 24),
damping ratios 0.3 / 0.45 (0.6 / 1.0), a 1.5 m drop compresses to 0.93 and rebounds to 0.14 at +0.35 s and is
back at sag at +0.44 s (one visible cycle; the old one went 0.93 -> 0.03 and stayed extended), full throttle
squats the rear +0.53 of travel for 0.9 s, a hard front brake dives the front to 0.71 (lean 0) / 0.91 (lean back), and the bump stop has
restitution (`stopRestitution` 0.3 above 1 m/s of closing rate) so a 3 m flat landing bucks: the chassis
hops 20 cm and the pitch kicks 11 deg; (3) **ragdoll spawn continuity**: the ragdoll is placed on the drawn
chain including the render's two-bone IK to the grips and pegs (`debug().riderChain`), with the frame's
rigid velocity field plus the rider mass's relative motion — every body within **0.45 cm / 0.39 deg** of
the previous tick's chain carried through the frame's one-tick motion (`RAGDOLL spawn continuity`); the
render's `poseRagdoll` still draws limb axes as `(cos a, sin a)` where physics (and the render's own
posed head) use `(-sin a, cos a)`: a 90 deg pop that is render's to fix (section 7.7). Costs, all measured:
the lean-0 stranger loops at **1.11 s** (1.54 at 9.81; time-scales to 1.30 — the extra is the softer rear's
squat pitch; peak torque below 51.5 Nm stops it looping at all but leaves the 60 deg plank 5 % of thrust)
and the 60 deg plank is climbed to **2.96 of 3.46 m** and then hangs at the lip (an `it.fails`; 12.4).
57 physics tests green, snapshot/foreign-snapshot/determinism untouched (the new stop restitution uses
this tick's pre-impulse rate, nothing new crosses a tick). Round 5 fixed the harness's blocking finding: beam
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
  instead of crashing; big air is ~1.0 s (techniques clip 07; the 2.4-3.2 s of
  evolution-gameplay obs 12 are Evolution's tallest ramps at speed). Round 6 runs
  gravity at 1.4 x 9.81 to get there: Trials-style physics is heavier than Earth.
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
before it is read inside the same `step()`, or it lives in `F`/`U`. The
cross-tick reads — the hop state machine's `riderExt()` uses the legs-straight
stop of the *last* force pass, (round 7) `controls()` reads the last tick's crank speed to slew it, and (round 8) the
wheelie control reads the ground slopes the last `derive()` saw under each wheel — are why `S_LEG_STOP_X/Y`,
`S_ANCHOR_X/Y`, `S_RPM`, `S_REAR_SLOPE` and `S_FRONT_SLOPE` are in `F` (round 5; `snapshot.test.ts` is the audit).
Round 10 adds `S_AIR` (the airborne blend, slewed from its own last value) and `U_FRAME_GND` (a frame hard point loaded
last tick), both read by the next tick's `controls()`. `driveFrac` and the chain scratch (`chX/chY`) are write-before-read diagnostics. Rapier/planck
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
   compression rate in a tick. The top limit is a **bump stop with restitution**
   (round 6): when it is reached while closing faster than `stopBounceRate` 1 m/s
   the limit's target rate is `stopRestitution` 0.3 of the closing rate as
   extension (the check is `room - closing*dt < 2 mm`, because the speculative
   limit would otherwise stop the wheel dead over the approach tick and never see
   a closing rate). That is the hard-landing buck.
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

`rpm = max(crank, ω_rear·gearRatio·60/2π)` — idle 1500, slipping auto-clutch 3500 under throttle, **limiter cuts at
10 000 and re-arms below 9 500** (CONTRACT). Round 7: the **crank is a state** (`S_RPM`): while the clutch slips
(wheel below `clutchRpm`) it revs toward `idle + min(1, thr/clutchThrottle)·(clutchRpm − idle)` at `crankSpinUp`
8000 rpm/s up (idle → 3500 in 0.25 s) and coasts down at `crankSpinDown` 2000; once the wheel is above `clutchRpm`
the clutch is locked and the crank is the wheel's speed. The centrifugal clutch passes at most
`clutchCap·peak·(rpm − idle)/(clutchRpm − idle)` below `clutchRpm` — equal to the curve's 0.8 at engagement, so a
settled throttle is never capped and only the launch from idle gets its thrust over the spin-up (the soft clutch
off the line: lean-0 stranger loop 1.11 → 2.26 s, everything at speed unchanged). Torque curve (rpm, fraction), **soft off idle** so a full-throttle launch does
not loop at neutral lean:
`[1500,.68] [3500,.80] [5000,.85] [6500,1] [8000,.95] [9500,.85] [10000,.8]`,
peak 38 Nm × gear 17.5 × η 0.92 = 612 Nm at the wheel = 1800 N of thrust
(**1440 N** off the line through the slipping clutch; round 1 had 1170 N, which is less than
the 1232 N = m g sin 60 a 60 deg plank needs just to hold, so nothing steeper than ~50 deg
could ever be climbed. The corner at a plank base is not a solver problem: a wheel in a 60 deg
concave corner lifts out exactly when the rim thrust exceeds m g sin 60).
**Pitch-aware drive (round 8, `engine.wheelieControl`)**: after the clutch cap, positive torque is multiplied by
`1 − gate·(1 − frac)` where `gate = clamp((leanEff − leanOff)/(leanOn − leanOff))` (leanOn −0.3, leanOff −0.5: sat
back past −0.5 the control is gone and looping is the rider's) and `frac` runs from 1 at `pitchFull` 25 deg to
`minFrac` 0.3 at `pitchMin` 40 deg of `rel + lead`, `rel` = frame angle − max(rear ground slope, front ground slope)
and `lead = rateLead 0.35 s × ω × clamp(rel / rateLeadFrom 10 deg)`. It is skipped while the front wheel was
grounded last tick (no wheelie to control; the plank corner, the ledge top) but NOT while the rear is off the
ground: an IMU control does not know about the tyre, and the rear spun to the limiter in the air is the +30 deg/s
that loops a lip launch. Engine braking (negative torque) is never tapered. The steady state on the flat is a
36-37 deg wheelie at 16.8 m/s: thrust tapered to where the balance pitch at the resulting acceleration equals the
pitch. Engine braking 8 % of peak scaled by rpm off throttle — **on the ground**: round 10 fades it to `engineBrakeAir` 0
over 3 ticks once both wheels have been off for `rider.airDelay` 12 ticks (a rider in the air pulls the clutch; the
0.7 kg m² rear at 59 rad/s bleeding 66 Nm into the frame was −11 deg / 0.6 s of no-input nose-down at 20 m/s), back the
tick a wheel or a frame hard point touches. Throttle slews at 40/s up, 60/s down. Top speed is limiter-bound at 20.4 m/s (measured 20.45).
Engine torque goes on the rear wheel and its reaction on the frame, so the
pitch-up moment is F·h as it should be; in the air throttle pitches nose-up
and brake nose-down through wheel angular momentum (section 12, F9).

Brakes: front 900 Nm, rear 700 Nm. Aero drag F = −4.2·v|v| — deliberately large: it is the speed governor that makes
partial throttle top out (thr 0.3 → 11.0 m/s, 0.6 → 17.8, 1.0 → limiter at 20.4). **Round 9: it is a uniform
deceleration field** — every riding body (frame, both wheels, rider) gets its mass share, computed from the frame's
velocity — so it acts through the combined COM with no pitch moment and no load on the rider brace. Round 8 put all of it
on the frame at the frame origin: in the air the un-dragged rider pushed the frame forward at the anchor 0.38 m above the
frame COM and the bike nosed over at 100 deg/s (the P0 of round 9). Consequences of the line of action moving from the
frame origin (0.55 m) to the combined COM (0.68 at lean 0, 0.44 at lean +1): at lean +1 the drag no longer loads the rear
through its moment about the contact patch, so full throttle at lean +1 spins the rear at speed and tops out at 18.7 m/s
(was 20.4); the brake-grabbed −20 deg landing from 3.5 m at 8 m/s dives to −40 and rides away (was an endo; −40 still endos);
the 3 m flat drop peaks at 0.96 of travel instead of touching the stop (buck 17 cm / 12.8 deg, was 11.6 / 10.6). A real
CdA 0.75 (0.45 kg/m, 180 N at 20 m/s) was measured this round: see 12.4 (0e).

## 4. Tuning table

`src/physics/tuning.ts` `DEFAULT_TUNING` (frozen); `createBikePhysics(hz,
partial)` deep-merges. Values as shipped in round 6 (round 4 values in brackets where changed;
everything a rider or engine can push scales with `gravityScale`, so the knob alone changes only how
the bike falls):

```
gravity 9.81  gravityScale 1.4  (g_eff 13.73)
frame   mass 56  inertia 14  comHeight 0.55  mu 0.6  bash plate (-0.05,-0.14) r 0.10
wheel   radius 0.34  mass 7  inertiaRear 0.7  inertiaFront 0.5  wheelbase 1.30
susp rear  axle (-0.585,-0.210) axis norm(0.17,0.985) travel 0.22 k 12000 cComp 400 [650] cReb 600 [1100] preload 0.00 [0.02] kStop 60000 @0.8 stopRestitution 0.3 stopBounceRate 1.0
susp front axle (+0.715,-0.215) axis norm(-0.42,0.91) travel 0.20 k 13700 [10500] cComp 400 [550] cReb 520 [950] preload 0.02 kStop 60000 @0.8 stopRestitution 0.3 stopBounceRate 1.0
tyre    muPeak 2.1 kappaPeak 0.15 slideFrac 0.92 vRef 1.0 rollRes 0.012 (kappa from the previous tick's resolved slip)
engine  idle 1500 clutch 3500 limiter 10000/9500 peak 52 Nm [38] gear 17.5 eff 0.92 engineBrake 0.08 (engineBrakeAir 0, round 10) slew 40/60
        curve [1500,.68] [3500,.80] [6500,.80] [8000,1] [9500,.9] [10000,.8]  (flat from the clutch to 6500; was .85 @5000, 1.0 @6500)
        crankSpinUp 8000 rpm/s  crankSpinDown 2000  clutchCap 0.8  clutchThrottle 0.25   (round 7: soft clutch off idle)
        wheelieControl enabled pitchFull 25 deg pitchMin 40 minFrac 0.3 rateLead 0.35 s rateLeadFrom 10 deg groundRelax 0.7 rad/s leanOn -0.3 leanOff -0.5  (round 8)
                       maxSlopeDeg 66 airRelax 1.5 rad/s airSpin 1.0 m/s pitchCut 50 deg  (round 11; Pro: enabled false)
brakes  front 900 [640] rear 700 [500] antiEndo 0.05 antiEndoFloor 0.7 [0.8] rearLoadMin 0.04 rise 60/s fall 40/s airNm 60 (round 11: a wheel off the ground is dragged, not locked)
rider   mass 75 anchor (+0.33,+0.38) k 8400 [6000] c 875 [740] kAlong 28000 [20000] cAlong 2130 [1800] shiftForce 2800 [2000] kLanding 56000 [40000] cLanding 8000 (round 7)
        armPull 420 [300]
        leanBack 0.60 leanFwd 0.73 leanRate 6 leanCrouch 0.20 (back) leanCrouchFwd 0.50
        airShift 0.25 airDelay 12 ticks airRise 0.10 s airFall 0.12 s  (round 10: the lean's shift and drops airborne; engine.engineBrakeAir 0)
        crouch 0.30 crouchTime 0.25 preloadSlack 0.85 hopExtend 0.15 hopForce 4500 [3200] hopMaxForce 5300 [3800] kPush 500 hopPegX 0.08
        hopPreloadMin 0.12 hopPreloadMax 1.5 hopPushTime 0.35 hopRecoverTime 0.6
        hopLeanBack -0.5 hopThrottle 0.3 hopSnapRate 4
        tetherMax 0.5 ejectForce 30000 [22400; round 9: only past 45 deg nose-down] legSlack 0.05
        headRadius 0.15 torsoRadius 0.13 torsoFollow 0.5
        torso inertia 20 swing 1.5 maxRate 7 maxTorque 400 (motor; NOT scaled: 560 breaks the wheelie PD hold, 12 s -> 3 s)
aero    dragCoef 4.2 [3.2]  (round 9: a uniform field over frame + wheels + rider; was on the frame alone)
Pro preset (round 11, BIKE_PRESETS.pro): dragCoef 0.45  gearRatio 16.2  peakTorqueNm 56.2  clutchRpm 3240  curve [1500,.68] [3240,.8] [6020,.8] [7400,.86] [9500,.8] [10000,.72]  wheelieControl.enabled false
solver  velocityIters 8 slop 0.005 baumgarte 0.2 jointBaumgarte 0.3 speculativeMargin 0.02
ragdoll sleepAfter 3.0 restitution 0.15 mu 0.6 spread 0.3 (limb spin only since round 6) jointDamping 3 Nm s crashRearBrake 1 crashFrontBrake 0.5
drum    density 60
```

Static checks (1.4 g): rear sag 0.271·0.22 = 60 mm, front 0.254·0.20 = 51 mm; frame level
within 0.8 deg at rest; rear wheel mode ~0.35 s period, rider legs 10.6 rad/s (0.6 s cycle: the
reference's 0.25 s crouch + 0.4 s extend); in a wheelie the rear carries 1990 N = 0.75 of travel,
just under the bump stop, which is why the rear spring is 12000 with zero preload and not softer
(9500 sat on the stop in every wheelie and on the 60 deg face: PD hold 4 s, climb 0.7 m).

Engine at 1.4 g: peak 52 Nm × 17.5 × 0.92 / 0.34 = 2460 N at the rim, 1970 N off the line through the
clutch (0.80) against the 1725 N a 60 deg plank needs to hold (14 % margin; round 4 had 17 %). The
lean-0 stranger at full throttle: 51.5 Nm never lifts the front, 52 loops at 1.1 s, 53 at 1.05 — a
knife edge set by the launch transient (the soft rear squats +0.5 of travel in 0.1 s = 9 deg of nose-up)
and a/g at the clutch of 0.99. Anti-squat (rear axis tilted back, thrust extends the slider) buys 1.5 s
but costs the visible squat and the wheelie hold (the throttle then extends the rear under the rider),
so the slider stays pro-squat.

## 5. Tick order

```
step(input):
 1  restart edge      -> fault('restart') + reset(checkpoint), return (latched until released)
 2  asleep            -> tick++ only (ragdoll settled)
 3  controls          -> throttle/lean/brake slew, airborne blend (S_AIR), hop state machine, engine rpm/limiter/torque
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
from looping and shortens the braking distance); up `−k_up·ext − c_up·ėxt + m g`, where `k_up = k + kLanding·|d|` and `c_up = c + cLanding·|d|`
in compression (legs, stiffening under landing loads and — round 7 — damping with them: a rider absorbs a
landing, he does not store it in a spring and fire the bike back up; that was the 20 cm bottom-out buck); **while preloading with
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

**Airborne (round 10)**: `leanOff` and the lean drops are multiplied by `1 − S_AIR·(1 − airShift)` — 0.25 of the ground
travel with the blend at 1 (0.15 m back, 0.18 m forward, the drops 0.05 / 0.13). The ground shift is a lever braced
against the tyres; in the air it is angular momentum the frame has to return, and it cancelled most of the torso store's
authority (7.4). `S_AIR` slews toward 1 over `airRise` 0.10 s once both wheels have been off the ground for `airDelay` 12
ticks and no frame hard point carries load (`U_FRAME_GND`), toward 0 over `airFall` 0.12 s the tick that stops being
true, and holds through a hop's push and recover (7.5). The anchor's travel moving 0.45 m in 0.1 s is force-capped by the
brace (`shiftForce`); `riderPose()` normalises the mass offset by the same scale so the drawn lean reads the input.

### 7.2 Derived pose (renderer and crash sensors) — from the rider mass and the hop machine
`riderPose()`: `lean` = the point mass's fore-aft offset from the neutral anchor in frame space over the lean travel in
force this tick (`leanFwd` 0.73 / `leanBack` 0.60, scaled by the airborne blend, 7.1); **`crouch` = the eased hop-preload
state** `S_CROUCH` (round 10; it was the mass's drop below the neutral height, which folded the lean drops in — every
lean ≥ 0.6 read as a full crouch and lean −1 as 0.67, hop or no hop; RIDER_CHAIN.md "What was wrong"); **`torsoPitch` =
`clamp(−0.35·(swing − leanEff) − 0.15·wrap(angle), ±0.9)`** — the torso store's transient (its lag behind the lean target,
+ = pitched forward relative to the frame) plus the frame-pitch term, zero once any lean has settled (round 10; it was
−0.35·swing, a steady −0.34 rad per unit lean that pitched the hang-back torso 12 deg forward); `armExtend` as before.
Measured (`FEEL pose.*`): a lean step reaches 90 % of the pose in **0.27 s** forward / 0.25 back, no overshoot; the
torso transient peaks at **+0.27 rad** on a forward step (−0.29 back) and is back within 0.02 rad at 0.51 s; settled
torsoPitch 0.001 / −0.012 at lean ±1; crouch 0 through a lean −1 → +1 sweep at throttle 0.25 and 1.00 0.3 s into a
preload. The crash sensors (`riderChain`, 7.7) are built from the same pose, so what is drawn is what crashes. The
design asked for a 0.10-0.15 s pose lag with a slight overshoot; the render's `PoseFollower` adds that on top (12.4 (2)).

### 7.3 Landing recovery
Measured (F6): from a 2 m drop at 6 m/s the bike rides away for every pitch in
**−30..+35 deg**; +40 loops out, ≤ −35 is not tested. Rear touches first from
−15 deg up. The eject rule is 1.3·tetherMax, or 30 kN sustained 2 ticks with the frame past 45 deg nose-down (round 9, §8).

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
visual). Measured (round 10, 14 m/s, 0.5 s): lean back **+25.6 deg**, lean forward **−21.6**, throttle +9.1, brake −26.2; the
store alone (mass shift, drops and engine braking off) is +32.5 / −33.8, and with the ground mass shift left on in the
air it was +12 / −1.4 (round 9) — see 7.1 and the air table in 12. Note the pure mass shift of leaning back gives
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
The airborne blend (7.1) holds its value through PUSH and RECOVER: the snap is the legs throwing the body over the bars
at ground travel, and a blend engaging mid-snap retreated the anchor under a mass already moving forward at 3 m/s — the
brace reversed and the stationary hop pitched 13 deg nose-down (rear apex 0.78 m, front 0.53; held: 0.68 / 0.65, byte-
identical to round 9). A rider holding lean back off a lip is in PRELOAD, which is not exempt.
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
The dynamics point mass sits low and far forward at full lean (it is a lever, not a body). Crash sensors therefore live
on the body the renderer draws, and since round 10 `riderChain()` is a **port of `src/render/rider/pose.ts` `riderChain`**
— the reference-measured chain of `assets/blender/RIDER_CHAIN.md` — written in the render's AXLE frame (origin = axle
midpoint at static sag, `axleOrigin()`, (0.054, −0.142) from `bike.pos`; the render calibrates the same from the spawn
pose). Segment lengths torso 0.52, neck 0.22, upper arm 0.32, forearm 0.30, thigh 0.46, shin 0.43, shoulder half-width
0.21, hip 0.09; left grip (0.27, 0.78, 0.33), left peg (−0.14, 0.02, 0.20), ankle = peg + (0.01, 0.09). Body parameters
(hips x, y; torso and head angles above horizontal) are blended in parameter space between the canonical corners
stand_attack (−0.28, 0.85; 40 / 66 deg), hang_back (−0.57, 0.60; 55 / 75), forward_attack (−0.22, 0.90; 26 / 42),
crouch (−0.38, 0.78; 28 / 40) with `sb = 1 − (1 − back)^1.3`, the hop crouch as a delta on top of the lean pose shrinking
with `back`, then `torso −= 0.6·torsoPitch`, torso clamped 12..80 deg, head ≥ torso + 12; **leg slide** (hips within
0.985·(thigh + shin) of the ankles, pulled in along the hip → ankle line, shoulders follow) and **reach slide** (shoulders
within 0.985·(upper arm + forearm) of the grip measured in 3D — shoulder joint at z 0.21, grip at 0.33 — never closer
than 0.18 m; the whole upper body slides along the shoulder → grip line) keep the feet on the pegs and the hands on the
grips in every pose. Elbows and knees by the **3D two-bone IK** with the reference poles — elbow forward-up-out
(0.6, 0.5, ±1.0), knee forward-in (1, 0.2, ∓0.15) — projected to the plane (the left side). The render's touchdown
absorb (`crouchExtra`, render-driven) is not in the physics chain: a crash during a landing absorb is the one hand-over
residual left (up to 0.12 / 0.15 m of hips at land 1). Sensors: head r 0.15 at the helmet centre, torso r 0.13 at 0.14
and 0.38 up the torso from the hips. The ragdoll spawns **on** the chain: every body centred on its segment with its
local +y (distal → proximal) along it (torso hips → shoulders, pelvis centre 0.1 below the hips, head on the shoulders →
head direction, upper arm elbow → shoulder, forearm grip → elbow, thigh knee → hip, shin ankle → knee); the joint
anchors are the chain's joints (torso ±0.26, neck 0.22 on the head, elbow ±0.13 / 0.14, hip 0.23, knee ±0.23 / 0.21).
The ragdoll rods are the side view of the arm: upper arm 0.26 and forearm 0.28 (the 3D arm projects to 0.17-0.30 /
0.26-0.30 across the poses, the elbow being 0.11-0.27 m out of the plane), thigh 0.46, shin 0.42 — where the projected
segment differs from the rod at the spawn the joint Baumgarte pulls the anchors together over ~10 ticks rather than
snapping. Velocities are the frame's rigid field at each body plus the rider mass's motion relative to the frame; the
rng spread is on limb spin only. `debug().riderChain` exposes hips, shoulders, head, elbow, hand, knee, foot (= ankle)
and the torso / head directions. Measured (`world.test.ts`): against **RIDER_CHAIN.md's own joint tables** (not a copy
of the render), the physics chain in axle coords at a settled lean 0 / −1 / +1 and a held preload at lean −1 (the
table's −1 × 1 row): hips / shoulders / head / elbow / knee within **0.5 cm**, torso and head angles within **0.5 deg**,
hands on the grips and ankles on the pegs to 0.0 mm; spawn continuity against the chain of the tick before, carried
through the frame's one-tick motion, **0.21 cm / 0.35 deg** (loop-out at 7 m/s), 0.12 cm / 0.24 deg (nose plant).
Convention: `RagdollBody.angle` is the body's local +y measured CCW from world +y, the same as the frame angle and as
the render's posed head (`rotation.z = −headA`).

## 8. Crash detection and ragdoll

Fault when any of: head/torso sensor circle touches any collider (rule 1,
`debug().crashCause = 'sensor'`); rider 1.3·tetherMax from the anchor ('tetherDist'); ≥ `ejectForce` 30 kN
of tether force for 2 ticks **while the frame is past 45 deg nose-down** ('tetherForce'; round 9 — it was 22.4 kN
unconditional and fired on ordinary lip hits and plank feet, a stranger's level 4×0.8 kicker at 11.6 m/s among them:
a crash is the body hitting something or leaving the bike, and a violent front impact only counts as an over-the-bars); any bike
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
lets it roll back; at the lip — front over the flat, rear below it — it drives through: feather at > 3 m/s of
slip, ease only past balance + 4 deg, no brake (round 7: the round-6 chop at the balance pitch was the 60 deg
hang)), plus `runController` (decision Hz, latency queue in ticks,
quantized like a human) and `stepN`. `Observation.balanceAt(lean)` exposes the
static balance map. `src/physics/tools/trackSweep.ts` runs four naive
controllers over the 15 curriculum tracks and prints progress and first-fault
cause per track.

## 12. Measured envelope (round 10, 1.4 g) vs CONTRACT §2.5

From `pnpm test src/physics` (`FEEL …` lines in `feel.test.ts`, `LAND …` landing audit, `DRUM …` / `SEESAW …` rows, `PERF …` and `RAGDOLL …` in `world.test.ts`).

| quantity | CONTRACT | measured | |
|--|--|--|--|
| total mass / wheelbase / radius | 145 kg / 1.30 / 0.34 | 145 / 1.30 / 0.34 | PASS |
| COM above axle line, neutral | 0.45 m | 0.34 m (rider forward/low so 1440 N does not loop at lean 0) | note |
| gravity | — | **9.81 × 1.4 = 13.7 m/s²** (`gravityScale`) | round 6 |
| 0 → 16 m/s, flat dirt | ≤ 3.5 s | **2.19 s** anti-loop launch (2.08 with the instant clutch); 2.24 s at thr 1 / lean +1 | PASS |
| loop-out envelope | lean ≥ +0.4 never; lean 0 ≥ 1.5 s; lean −1 ~0.8 s | **lean 0 never loops**: the front lifts to a self-limiting **36.8 deg** wheelie (35.6-36.8 after 3 s) and the bike finishes 120 m in 8.07 s at 16.8 m/s (round 7: head-hit at 2.26 s / x 24 m — the stranger measurement); lean −0.3 37.9 deg, finishes; lean 0.4 finishes (7.1 s, 7.4 deg); lean −0.5 loops at **1.43 s**, lean −1 at **2.4 s** (deliberate; full throttle + lean −1 is the hop preload, the crouched rider loops when he stands back up, 12.4 (0b)). Full table in 12.5 | PASS (lean −1 note) |
| speed governor | thr 0.3 ≈ 11-13, 0.6 ≈ 16-17, 1.0 = 20 | 10.9 / 17.7 / 20.37 (limiter) | PASS |
| top speed | 20 m/s | 20.37 m/s, limiter-bound | PASS |
| brake from 10 m/s | ≤ 4.5 m | **3.16 m** lean back, −8.1 deg dive; 5.1 m at lean 0 (round 9). Full brake from 10 / 12 / 15 / 18 / 20 m/s at lean −1 / 0 / +0.4 / +1: stops in 3.9–20.8 m, dive −8..−20 deg, rear off the ground 0.35–1.5 s, **never flips** (stranger finding "a plain brake at 12 m/s endos" does not reproduce on flat dirt: 7.9 m, −9.4 deg, rear off 0.63 s). Round 8: **3.22 m** lean back, −8.8 deg dive, no endo; 5.3 m at lean 0, −7.4 deg (anti-endo floor 0.8 → 0.7: at 0.8 the soft fork's grab lofted the rear and the bike stoppied over in 1.5 s at lean 0) | PASS |
| stationary hop rear apex | 0.55-0.75 m | **0.68 m**, airtime 0.53 s (0.62 m / 0.56 s at 9.81); round 10: unchanged — the airborne blend holds through push / recover (with it engaging the hop went nose-down 13 deg and the rear apex to 0.78) | PASS |
| 5 m/s run-up, 0.9 m ledge | makeable | **made, rear lifts 1.06 m at the wall, lands −11 deg, rides away** (round 10, unchanged from round 9's build; the 0.90 / −3 of the round-8 text was stale) (`ledgeHopper(20,5,8,1.3,45)`; 6 of 80 parameter combos make it, was 29 of 300); 0.5 m ledge clean | PASS |
| climb 55 deg | sustained | tops a 4 m plank in **1.72 s** (1.61 in round 7, 2.4 in round 6), no fault; the wheelie control never fires on the face (frame at the face angle + 8) | PASS |
| climb 60 deg | sustained | **crests 3.46 m in 2.91 s** (measured by the feel test's start/top marks; round 7: 3.04; reference clip 06 ≈ one wheelbase per second → 2.7 s), exit pitch −1..6 deg, no fault; the first round-8 build tapered the push into the base corner (frame rotating up at 120 deg/s with the rear still on the flat) and died at 1.0 m — the face under the front is the reference and the rate lead fades in over the first 10 deg of nose-up | PASS |
| climb 65 deg | stalls, rolls back | stalls at 0.3 m, rolls back 0.33 m, no fault (tan 65 = 2.14 > peak grip 2.0) | PASS |
| climb > 70 deg | needs a hop | not ridden | PASS |
| balance pitch, lean 0 | 40-50 deg | 48.4 static (38.1 back, 70.2 fwd, 36.1 at +3 m/s²); **on the throttle at lean ≥ −0.3 the wheelie control parks the nose at 33-40 deg below it** (round 8) | PASS (note) |
| open-loop divergence | 1-2 s | 0.83 / 0.80 s (σ = √(g/l) is √1.4 faster; test band 0.6-2.5) | note |
| PD hold | indefinitely | **12 s (full run), RMS 6.9 deg, band 34-47** at a 44 deg target with the lean parked at −0.5 (control off: the pure plant) with kp 0.1 / kd 0.03 (0.08 / 0.03: 7.1 s; kp 0.1 kd 0.02: 12 s RMS 8.3; warm or cold start alike); at 45-50 deg targets (lean −0.3..0) the control holds the nose at 27-36 deg for 12 s whatever the PD asks (RMS 12-22 vs the target); at lean ≤ −0.65 (targets ≤ 42) the throttle-only PD drops the front in 0.6 s — the round-7 crank-lag finding stands there | PASS |
| landing recovery (2 m, 6 m/s) | design: −5..+40 | −30..+50 rides away, rear-first from −5; falls in 0.52 s (0.62) | PASS |
| **airtime** (round 6) | hop ≈ 0.6 s; big jump ≈ 1.0 s (clip 07) | hop 0.53 s at 0.68 m; 45 deg 1 m kicker: 6 m/s 0.53 s* / **10 m/s 0.87 s** / 14 m/s 1.10 s (9.81: 1.06 / 1.40 / 1.49); 2 m drop 0.52 s. *at ≤ 10 m/s the bike leaves the 45 deg face at 47-66 deg (the face angle plus the throttle's on-face rotation) and no constant lean lands it — see 12.4 (0c) for the table and why it is the test geometry, not the plant | PASS (12.4 for the kicker) |
| **suspension** (round 6) | sag 25-30 %; 1.5 m drop ≥ 80 % + rebound; 3 m buck; squat ≥ 20 %; dive ≥ 50 % | sag R 0.27 / F 0.25; 1.5 m: peak 0.93, rebound to 0.14 at +0.35 s, back at sag +0.44 s; 3 m: bottoms 3 ticks, chassis hops **11.6 cm** (round 6: 19.8; `cLanding` 8000 — the buck was the rider's legs storing ~1 kJ, not the bump stop: restitution 0-0.3 × kStop 30-120 kN/m all gave 19-21 cm), pitch kicks 10.6 deg (asked 6-10 cm / 3-6 deg; the kick is the two ends' differential rebound off full travel and is not damping-limited); 1.5 m rebound now to 0.21 at +0.29 s (0.14 at +0.35); squat sag 0.27 → 0.80 for 0.93 s; dive 0.25 → 0.71 (lean 0) / 0.91 (lean back) | PASS |
| **ragdoll spawn continuity** (round 6/8/10) | no pop | 0.21 cm / 0.35 deg (loop-out), 0.12 cm / 0.24 deg (nose plant) vs the physics chain of the tick before; **the chain vs RIDER_CHAIN.md's canonical joint tables: 0.5 cm / 0.5 deg** at stand_attack, hang_back, forward_attack, hang_back + crouch, hands / ankles on grips / pegs to 0.0 mm (round 10; round 8 measured 0.00 against a copy of the old render pose); velocity = frame field + rider relative (1.7 m/s) | PASS |
| nose-down 3.5 m at 8 m/s | should endo (critic) | free front wheel: rides away from −20..−50 deg (nose whips up at ~400 deg/s, both ends bottom out); **brake grabbed on landing: endo at every nose-down angle** | note (12.1) |
| rider pose lag | 0.10-0.15 s + slight overshoot (critic) | pose from the mass: t90 **0.27 s**, no overshoot; torso transient peak ±0.27 rad, gone in 0.51 s; **crouch = hop preload only, torsoPitch has no lean bias** (round 10) | note (7.2) |
| crashed bike scrub | 1-1.5 m from 7 m/s (critic) | **2.6 m** at 1.4 g (3.2 at 9.81), at rest in 1.1 s; limbs spread 92 deg, hip swing 101 | note (8) |
| drums / seesaw | (bot sweep: parks) | see 12.3 | measured |
| air control 0.5 s (8 m/s, F9 test) | — | brake −15.6, throttle +14.8, **lean back +26.7, lean fwd −20.8** (round 10; was +14.3 / −0.3); airPitch lands 12.6 deg for a 15 deg target from −5 deg | PASS |
| **air control by speed** (round 10; level launch, rider settled at lean 0, 0.6 s, no ground; Δpitch at 0.5 / 0.6 s, rate at 0.6 s) | no input ±5 deg / ±15 deg/s; lean −1 +20..30; lean +1 −20..−30; throttle +8..15; brake −15..−25 | **lean −1 +24..27, lean +1 −21..−23, no input −2..−4 at 0.5 s** (table below); throttle +15 / +9 / 0 (limiter at 20 m/s); brake −16 / −26 / −36 (the rear wheel's angular momentum, scales with speed) | PASS except the brake at ≥ 14 m/s and throttle at 20 |
| crash rules | head/torso, hazard, oobY | all three tested on the drawn body; over-rotation alone never faults; the tether-force rule needs 45 deg nose-down (round 9): a level 4×0.8 / 4×1.2 / 5×2 / 8×1.8 kicker at 8–17 m/s with thr 0.6 at lean 0 / 0.4 never crashes on the tether (max 4.8–16.9 kN); its crashes are sensor hits after a loop (5×2 at ≥ 11.6 m/s, lean 0) or a coasted nose-plant | PASS |
| ragdoll vs bike | (visible in clips) | limbs rest on tyres/frame | PASS |
| restart → riding | 1 tick | `reset()` is one call, `tick = 0` | PASS |
| determinism | two runs equal; restore(snapshot()) equal | equal over 3000 ticks incl. crash+restart; forks at 5 points × 500 ticks equal; search-load probe 2600 ticks × 7 rollouts every 15 ticks equal; 13 foreign-snapshot forks × 400 ticks equal | PASS |
| µs/tick p95 | ≤ 60 riding, ≤ 80 ragdoll | 2.4-3.5 riding, 9-16 ragdolling (node, 20k ticks, vitest, noisy under the full suite) | PASS |

**Air control, round 9 → round 10** (`scratch airprobe2`: teleport to 6 m up at v with 3 m/s of rise, rider settled at lean 0,
no ground for 0.6 s; the round-9 column is the shipped round-9 build measured the same way; the asked band in the last column):

| speed | input | round 9: pitch 0.5 / 0.6 s (rate) | round 10: pitch 0.5 / 0.6 s (rate) | asked |
|--|--|--|--|--|
| 8 m/s | none | −3.7 / −4.7 (−11/s) | **−2.2 / −2.5 (−3/s)** | ±5 |
| 8 | lean −1 | +14.3 / +11.1 (−38) | **+26.7 / +25.5 (−15)** | +20..30 |
| 8 | lean +1 | −0.3 / +1.4 (+18) | **−20.8 / −19.1 (+19)** | −20..−30 |
| 8 | throttle | +14.8 / +18.1 (+33) | +14.8 / +18.1 (+33) | +8..15 |
| 8 | brake | −15.6 / −18.6 (−30) | −15.6 / −18.6 (−30) | −15..−25 |
| 8 | brake + lean +1 | −7.0 / −5.6 (+14) | −30.8 / −30.8 (−1) | |
| 14 | none | −5.9 / −7.7 (−20) | **−3.2 / −3.7 (−5)** | ±5 |
| 14 | lean −1 | +12.0 / +8.1 (−47) | **+25.6 / +24.1 (−18)** | +20..30 |
| 14 | lean +1 | −1.4 / +0.1 (+15) | **−21.6 / −20.1 (+17)** | −20..−30 |
| 14 | throttle | +9.1 / +11.1 (+20) | +9.1 / +11.1 (+20) | +8..15 |
| 14 | brake | −26.2 / −31.4 (−53) | −26.2 / −31.4 (−53) | −15..−25 |
| 14 | brake + lean +1 | −13.1 / −12.6 (+4) | −37.3 / −38.7 (−13) | |
| 20 | none | −8.1 / −10.7 (−28) | **−4.3 / −5.0 (−8)** | ±5 |
| 20 | lean −1 | +9.8 / +5.1 (−55) | **+24.4 / +22.6 (−20)** | +20..30 |
| 20 | lean +1 | −2.4 / −1.3 (+11) | **−22.5 / −21.1 (+15)** | −20..−30 |
| 20 | throttle | 0.0 / +0.2 (+2) | 0.0 / +0.2 (+2) — the wheel is on the limiter | +8..15 |
| 20 | brake | −36.3 / −43.8 (−75) | −36.3 / −43.8 (−75) | −15..−25 |
| 20 | brake + lean +1 | −19.1 / −19.6 (−6) | −44.9 / −47.9 (−30) | |

Decomposition at 14 m/s, 0.5 s, on the round-9 build (`scratch decomp`; lean −1 / lean +1): baseline +12.0 / −1.4; torso
motor off **−36.5 / +19.6** (the mass shift alone rotates the bike the wrong way); no lean drops +13.2 / −12.1; no arm pull
+11.1 / +0.8; no mass shift **+31.1 / −35.2**; no shift and no drops +27.4 / −38.8; torso alone (no shift, drops, engine
braking) **+32.5 / −33.8**; no engine braking +17.3 / +1.2; torso inertia 30 / torque 600 +22.8 / −8.7. The round-9 note
blamed the arm-pull reaction point (grips vs anchor: +32 / −12); the pull is −1 / −12 of it — the mass shift is the term.
Sweep of the shipped knob (0.5 s, 8 / 14 / 20 m/s, before the delay): `airShift` 0.5 → +27 / +26 / +26 and −17 / −18 / −18;
0.35 → +29 / +28 / +28 and −23 / −24 / −24; 0.25 → +30 / +30 / +29 and −27 / −28 / −28; with `airDelay` 12 and `airRise`
0.10 in place 0.35 gives +25 / +23 / +22 and −15 / −16 / −17, 0.25 the table above. The residual **no-input drift** is the
12 ticks + 3 of engine braking before the clutch pull (−0.7 with none at all); the **brake at 14 / 20 m/s** is the rear
wheel's angular momentum (41 N m s at 20 m/s into ~45 kg m²) and unchanged; **throttle at 20 m/s** is the limiter. The
round-9 lever list stands as measured (reacting the pull at the grips, `engineBrakeFrac` 0.025) — neither was needed.
The parent's probe (`harness/out/parent/air.ts`, rides at lean 0.5 then teleports at 19.5 m/s, pitch at 0.6 s): lean 0 /
no throttle **+2.7 deg** (round 9: −2.8), lean −1 **+30.3** (+6.0), lean +1 **−11.7** (−6.1; it starts from lean 0.5, so the
swing to +1 is half of one, and its peak is −15.8 at 0.4 s), throttle +6.7 (+6.7), lean −1 + throttle +30.4.

### 12.1 Landing envelope audit (`LAND` rows; drop h at speed v and pitch p onto flat dirt, throttle 0.2; round 6 at 1.4 g)

| drop | result |
|--|--|
| 1.5 m, any v, −20..+40 | all ride away; rear-first from 0 deg up (front-first at −20); peak compression R 0.93 / F 0.96, no bottom-out |
| 2.5 m, any v, −20..+40 | all ride away (the +40 / 0 m/s loop-out of round 4 now lands: the shorter, harder fall gives the nose less time to keep rising); front bottoms out at 0 and +20, rear 0.89-1.00 |
| 3.5 m, any v, −20..+20 | all ride away, both ends bottom out, pitch swings −19..+20 at 8 m/s / −20 deg |
| 3.5 m, +40 deg, 0 m/s | loops out (the one failure of 36) |

Versus the reference (techniques.md obs 7-10, evolution-gameplay obs 11): rear-first with a compress/extend
settle — yes; bottom-out on 2.5 m+ flats — survivable, and it should read as violent: `land` impulses are
emitted for audio/particles, but there is no extra buck (the bump stop's rebound is the only kick). Round 4
audited the **nose-down landing at speed**: with a free front wheel −20 / −30 / −40 / −50 deg at 8 and 12 m/s
from 3.5 m all ride away — the front impulse acts ahead of the COM and whips the nose up at ~400 deg/s
(pitch −16..+14 for −20 deg at 8 m/s), which is what a rigid front wheel does on flat ground; the endo the
critic expects happens when the rider is **on the brake** as the front lands: crash at every nose-down angle
(`FEEL landing.noseDown.*`). An endo without the brake needs a rising landing or an edge under the front.

### 12.2 Track smoke sweep (`tools/trackSweep.ts`, four naive controllers, best per track)

Round 10 (the tracks owner re-authored in the same tree during the round — b2 is longer, m1's first ledge moved 21 → 34 m,
so the percentages are not the round-9 track lengths; round 9 in brackets): b1 CLEARED (CLEARED), b2 43 (60; cruise
reaches 256 m vs 249), b3 CLEARED (CLEARED), e1 58 (58; the loop at ramp@309 unchanged), **e2 92 (89)**, e3 31 (28),
**m1 27 (6)** — full throttle now rides to ledge@130 instead of endoing at the first ledge, m2 42 (35), **m3 CLEARED (42)**,
h1 29 (29), **h2 71 (14)** — the fixed-input strangers no longer loop off box@60-70, they fly it, **h3 46 (47)**, **x1 53
(17)**, x2 13 (14), **x3 30 (15)**. Every first fault is still a naive controller endoing into a step or looping a kicker
at full gas; what moved is that a held lean now does something in the air. The bot is the judge.

Round 9 (round 8 in brackets; the tracks owner is re-authoring in the same tree): **b1 CLEARED (98 %)**, b2 60 (60), **b3 CLEARED**
(CLEARED), **e1 58 (38)** — the 48 deg plank foot at 19.8 m/s no longer snaps the tether; the first fault is now a loop at
ramp@309; e2 89 (89), e3 28 (28), m1 6 (6), m2 35 (35), **m3 42 (72)** — ground hit at plank@167 at −15 deg, 6.1 m/s, the
kicker-landing attitude moved with the drag's line of action; h1 29 (29), h2 14 (17), h3 47 (47), x1 17 (10), x2 14 (14),
x3 15 (15).

Round 8 (round 7 in brackets; the tracks owner was re-authoring in the same working tree during the run, so e2/e3 moved
between two runs minutes apart): **b1 98 % (51)** — the stranger no longer loops at ramp@68, it rides 560 m and runs
out of the 40 s budget; b2 60 (60); **b3 CLEARED (88)**; **e1 38 (81)** — full throttle now reaches the 48 deg plank
foot at 200 m at 19.8 m/s and the tether snaps (12 kN, 2 ticks); round 7 arrived at 19.6 m/s and survived by 0.2 m/s
(the control is not active there, the front is on the ground: a knife edge on the tether rule at a speed no rider
takes into a 48 deg plank); e2 89 (88); e3 28 (28); m1 6 (9); m2 35 (35); **m3 72 (45)**; h1 29 (29); h2 17 (15);
h3 47 (47); x1 10 (7); x2 14 (14); x3 15 (17). Constant full gas at lean 0 (the measured stranger): b1 crashes at
150 m instead of 24 — through the 0.28 m speed-bump row at 18.5 m/s, nose-down (the control is at 1.00 there, the
wheelie is 8-10 deg at that speed); at lean 0.4 it finishes b1 (40.5 s) and b3 (31.2 s).

Round 7 (round 6 in brackets; the tracks owner is again re-authoring in the same working tree): b1 51 % (57 — the
stranger now loops off ramp@68 at 11.7 m/s instead of on flat ground at 286 m; cruise stalls at 255 m both rounds),
b2 60 (62), **b3 88 (35)** — the stranger rides the kicker row to ramp@357, e1 81 (81), e2 88 (88), e3 28 (28), m1 9
(9), m2 35 (35), m3 45 (45), h1 29 (30), h2 15 (14), h3 47 (47), x1 7 (9), x2 14 (14), x3 17 (18). The first faults
are now mostly endos into steps and nose-down landings; the flat-ground loops are gone.

Round 6, at 1.4 g **and against tracks the tracks owner was re-authoring at the same time** (so not
comparable line by line with round 4): b1 57 % (was CLEARED; loops out at 14 m/s on flat ground —
the stranger at lean 0.4 now loops off a lip), b2 62 % (22), b3 35 % (CLEARED; loops at ramp@145 at
2 m/s), e1 81 % (79), e2 88 % (57), e3 28 % (53), m1 9 % (32), m2 35 % (30), m3 45 % (57), h1 30 % (43),
h2 14 % (47), h3 47 % (91), x1 9 % (25), x2 14 % (18), x3 18 % (27). The naive controllers were written
for 9.81: two thirds of the first faults are now "looped out (nose up)" off a kicker or lip — the lip
kicks the nose up harder relative to the shorter flight — and the rest are endos into steps. The bot
is the judge; the tracks owner should expect kickers to want the brake in the air and less speed.

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

### 12.5 Constant-input loop / wheelie table (round 8; flat-test 120 m, 15 s, from rest; `scratch grid`)

Held throttle × lean from the start line: max pitch before a fault, loop time, finish time, top speed. Round 7 in
brackets where different.

| lean | thr 0.5 | thr 0.7 | thr 1 |
|--|--|--|--|
| −1 | 12.9 deg, finish 9.48 s | 114 deg, **loops 4.51 s** | 115 deg, **loops 2.40 s** (preload crouch; 12.4 (0b)) |
| −0.7 | 11.3, 9.48 | 19.8, 7.82 | 119, **loops 2.54** |
| −0.5 | 9.7, 9.48 | 11.1, 7.83 | 118, **loops 1.43** (control off) |
| −0.3 | 6.5, 9.48 | 7.0, 7.83 | **37.9 deg wheelie, finish 8.05 s**, 19.5 m/s (looped 3.17 s) |
| −0.2 | 5.7, 9.48 | 6.4, 7.83 | 9.6, 7.01, 20.4 |
| 0 | 5.8, 9.48 | 7.0, 7.83 | **36.8 deg wheelie (35.6-36.8 after 3 s), finish 8.07 s**, 16.8 m/s (looped 2.26 s at x 24 m) |
| +0.2 | 6.0, 9.48 | 7.6, 7.83 | 8.8, 7.05, 20.4 |
| +0.4 | 4.1, 9.48 | 5.6, 7.83 | 7.4, 7.07, 20.4 |
| +1 | 2.7, 9.49 | 3.1, 7.82 | 4.2, 7.47, 20.4 |

Everything but the thr 1 / lean −0.3 and 0 cells is byte-identical to round 7 (the control needs the front up and
`rel + lead` past 25 deg). Parameter sweep behind the shipped numbers (lean 0, thr 1): rateLead 0 → loops 2.3-3.2 s
whatever the pitch band; rateLead 0.2-0.5 with pitchMin 40 → 34-37 deg max, finishes; pitchMin 50 → 42-50 (over the
42 band); minFrac 0.15 → 29-34 deg but a deeper cut; leanOn −0.2 leaves lean −0.3 looping at 3.3 s, −0.3 holds it.

### 12.6 Rookie vs Pro (round 11; `classes.test.ts`, `scratch envelope.ts`)

| quantity | Rookie (round-10 table) | Pro |
|--|--|--|
| drag / gear / limiter speed | 4.2 kg/m governor / 17.5 / 20.4 m/s | 0.45 kg/m (CdA 0.75) / 16.2 / 22.0 m/s |
| wheelie control | on (crest / lip rules, round 11) | off |
| 0 → 16 m/s (fullThrottle ctrl / thr 1 lean 0.4) | 2.19 / 1.68 s | 1.93 / 1.40 s |
| top speed | 20.35 | 22.07 |
| thr 1 lean 0 from rest | 38 deg self-limiting wheelie, finishes 120 m in 9.3 s | **loops at 1.47 s** |
| thr 1 lean −0.3 / 0.2 / 0.4 / 1 | 39 deg wheelie / 8.8 / 7.4 / 2.9 deg | 12.5 / 8.9 / 7.5 / 2.9 deg, all finish |
| thr 1 lean −0.5 / −1 | loop 1.37 / 2.49 s | loop 1.35 s / **no loop** (limiter at 1.4 s, before the preload times out) |
| thr 0.3 / 0.6 top | 11.0 / 17.8 (governor) | 22.0 / 22.0 (no governor) |
| brake from 10 m/s, lean −1 / 0 | 3.30 / 5.30 m | 3.66 / 6.10 m |
| brake from 20 m/s, lean −1 / 0 | 9.95 / 15.5 m | 13.2 / 24.0 m (no drag to help) |
| stationary hop / 0.9 m ledge at 5 | 0.676 m / made (12 of 36) | 0.687 m / made (10 of 36) |
| climb 55 / 60 / 65 | 1.77 s / 2.91 s / stalls 0.35 m | 1.02 s / 2.27 s / stalls 0.26 m |
| PD hold 44 deg, kp 0.1 kd 0.03 | 12 s (accelerating to the drag limit, 11 m/s) | 4.2 s (accelerating to the limiter, 22 m/s) |
| landing 2 m at 6 m/s rides away | −30..+50 deg | −30..+45 |
| air 0.5 s at 8 / 14 / 20: lean −1 | +26.8 / +25.6 / +24.4 | +26.9 / +25.7 / +24.6 |
| air: lean +1 | −20.8 / −21.6 / −22.5 | −20.7 / −21.5 / −22.3 |
| air: throttle | +14.6 / +8.9 / +1.9 | +16.6 / +10.7 / +1.8 |
| air: brake (round 11, `airNm` 60) | −13.5 / −18.6 / −20.5 | same |
| crest 20×2 full gas lean 0 | 42 deg, no fault | loops |
| kicker 4×0.8 at 8 / 11 full gas lean 0 | 65 / 65 deg peak, rides away | loops |
| naive sweep clears | b1, b3, m3 (e2 97 %, h2 87 %) | b1, b3, e2 (h2 88 %, m3 42 %) |

### 12.4 Open list, in order

(0, round 11) **Wheelie PD hold is an acceleration, not a hold** — see the status block: 12 s on Rookie is the drag limit, 4.2 s on
Pro is the limiter; no throttle-only PD at 100 ms holds ≥ 10 s at a held speed on either bike (best 8.7 s Rookie / 4.9 s Pro with a
speed-closing throttle ceiling). A rear-brake-modulated or lean-modulated hold needs a better rider model than a PD (the lean is
non-minimum-phase through the mass shift). The CONTRACT row should read "balanceable by a PD while accelerating".
(7, round 11) **Rear-wheel bounce / drum pump** not built: the leg axis is frame-up (status block); the pump needs the leg line to
follow the drawn chain (hip → peg) or blend toward world-up past ~45 deg of pitch, and that moves every hop's numbers.
(8, round 11) **Kicker launch attitude at full gas**: the Rookie control keeps the 4×0.8 lip from looping (65 deg peak, rides away)
but the asked ≤ 45 is the ramp wheelie's ballistic attitude — the control would have to taper on the ramp by absolute pitch, which
starves the 55–60 deg faces unless keyed on ground slope < 30 deg. The 0.3 m-proud drum row at full gas from rest is a nose-over at
13–17 m/s (both builds), and b2's real geometry was not reproduced. (9, round 11) Rookie goldens other than flat-test moved
(brake / gas in the air) — regenerate; the m3 straddle residual at 3–5 m/s is a beaching on the plate, not the wedge.

(0) **Wheelie PD hold** — closed in round 8 for the 44 deg / lean −0.5 case (12 s, RMS 6.9). What remains: at
lean ≤ −0.65 (balance ≤ 42 deg) the throttle-only PD still drops the front in 0.6 s — the round-7 crank-lag finding
(the crank spin-up is a throttle lag below 7 m/s). A lean-loop controller (reference obs 8) is still the honest fix
for low balance points. (0a) **The wheelie control caps the neutral-lean wheelie at 33-40 deg**: the 45-50 deg
balance point at lean ≥ −0.3 is not reachable on the throttle any more — that is the loop guarantee, but a track that
wants a 45 deg wheelie held at lean 0 (h1-wheelie-wire?) now wants the rider sat back to −0.4..−0.5. Tracks/bot
should know.
(0b) **Lean −1 deliberate loop at 2.4 s** (parent asked ≤ 1.2). Full throttle with lean ≤ −0.5 is the hop preload
(7.5): the front lifts to 20 deg at 0.4 s, then the preload catch (the rider dropping 0.5 m onto the pegs, 0.3 m
ahead of the rear contact) pushes the nose back to 5 deg and the crouched COM sits below the loop; the loop comes
when the preload times out at 1.5 s and the rider stands. Measured this round: shortening `hopPreloadMax` 1.5 → 1.0 /
0.8 / 0.5 s gives 1.91 / 1.72 / 1.44 s (hop apex and the 0.9 m ledge unchanged) — not ≤ 1.2 at any timeout, and the
timeout is the ledge hopper's wheelie window; not taken. Lean −0.5 loops at 1.43 s. The honest route to a fast
deliberate loop is a hang-off that moves the rider COM behind the rear axle (`leanBack` 0.60 → ~0.9), which moves
the brake, hop and balance tables — a round of its own.
(0c) **Kicker launch pitch on the 45 deg 1 m plank** — measured, no plant change, the tracks owner should read
this. Beginner = constant lean, throttle 0.6 on the face and (a) held / (b) closed in the air; launch pitch (rate)
at the last rear contact, airtime, landing pitch:

| v | lean 0 | lean 0.4 | lean 1 |
|--|--|--|--|
| 6 m/s | 66 deg (+123/s), 0.7 s, crash (a,b) | 75 (+139), 0.5 s, crash (a,b) | stalls on the face |
| 8 m/s | 56 (+52), 0.82 s, crash (a) / lands at 101 → crash (b) | 65 (+123), 0.76 s, crash (a,b) | −28 (−257), nose plant |
| 10 m/s | 49 (+15), 0.9 s, lands at 110 (a) / 78 (b): crash | 52 (+39), 0.85 s, crash (a,b); air lean −1 / +1 does not save it | 24 (+77), front catches the lip edge |
| 14 m/s | 37 (−52), 1.0 s, 65 crash (a) / **30 lands (b)** | 43 (−20), 1.0 s, crash (a) / 98 crash (b) | 21 (+8), 0.64 s, 64 crash (a) / **57 lands (b)** |

Anatomy (10 m/s, lean 0, traced): the base corner (a 45 deg face rising straight off the flat) hits the front with
7-12 kN, bottoms the fork and spins the bike at +300 deg/s; the rear entering the corner stops it (13-20 kN); the
bike then rides the 1.41 m face at 47-49 deg with the front already past the lip (wheelbase 1.30) — a wheelie on a
45 deg face where the throttle's F·h is the only moment (rate 1 → 22 deg/s at lean 0, 23 → 100 at lean 0.4 over
0.07 s; lean 0.4 puts the anchor 0.29 m forward and the armPull cap lifts the frame ahead of the COM); at the exit
the free wheel spins to the limiter (Δω ≈ 40 rad/s × 0.7 kg m² → +30 deg/s on the frame) and the edge adds the
rest. Levers tried: rear rebound damping ×5 (no change), rear wheel inertia 0.35 (−16 deg/s in the air), brace
kAlong 7000 (+4 deg), slack legs k 2000 (launch −6..−10 deg: they absorb the base, not the lip; rate unchanged).
The launch attitude off a 45 deg face is the face angle, and a beginner holding the gas up a 45 deg plank is doing a
power wheelie on it; the parent's "lip absorb" (legs slack when the front unloads) works against the goal here —
the rider's weight ahead of the rear contact is what holds the nose down on the face. What lands it: lean +1 at the
lip (14-24 deg launch) or the throttle closed at the lip at ≥ 14 m/s. **On the curriculum's kickers** (17-22 deg
ramps 4-8 m long with `curve` 0.3) the same beginner (lean 0.4, throttle 0.6 held through the air) lands every one:
4×1.2 at 9 / 12 m/s launch 19 / 21 deg (−76 deg/s), lands −20 / −1; 5×2.0 at 12 / 14 m/s launch 24 / 27 (−95 / −88),
lands −25 / −18; 8×1.8 at 12 m/s launch 15, lands −15. There the stranger's problem is a nose-down landing at
speed, not a loop. A 45 deg plank one wheelbase long is not a curriculum shape; if one is wanted, it wants a
`curve` fillet, and the feel test's kicker should get one too.
(0e) **Real aero drag** (parent, round 9): CdA 0.75 → `dragCoef` 0.45 (180 N at 20 m/s, 1.2 m/s² of in-air deceleration
instead of 11.6). Built and measured this round with the round-8 *net* thrust folded into the torque curve
(`[1500,.68] [3500,.80] [4500,.70] [5500,.61] [6500,.565] [8000,.56] [9000,.43] [9500,.33] [10000,.22]`, so 0 → 16 m/s stays
2.16 s and the 60 deg plank keeps its clutch-rpm thrust) and a throttle-position rev-target governor for the part-throttle
tops (thr 0.3 → 11.7, 0.6 → 16.4). Air control is identical to the field at 4.2 (the field has no moment either way); what
moves is everything the drag's *moment* was doing on the ground: the PD wheelie hold at lean −0.5 falls 12 → 4.3 s (the
drag's nose-up moment about the contact patch, 1.1 kN × 0.55 m at 16 m/s, was part of the plant the PD balanced), the lean-0
stranger's power wheelie drops from 38 to 14 deg (the same moment was most of the round-8 "torque peak at 8000 rpm" loop),
the 55 deg climber tops the plank and flies off the test track (out-of-bounds), the 60 deg plank hangs at the lip, the
lean −1 / thr 1 deliberate loop vanishes (the bike reaches the limiter at 1.7 s, before the preload times out), and every
jump gets longer. Closing the throttle at 20 m/s then decelerates at 2.5 m/s² instead of 12.9 — the tracks were authored
against the latter. Worth doing, with the climber, hopper and PD retuned and the tracks re-swept: a round.
(0f) **Arm-pull reaction point** — closed in round 10 without it: the airborne lean authority was the mass shift, not the
pull's reaction point (decomposition in 12); the pull stays at the anchor (collinear, no invented couple).
(0g) **Airborne blend seams** (round 10). The blend is by contact, not by load: `airDelay` 12 ticks (0.1 s) before the
lean travel starts to shorten, so the first 0.1-0.2 s of every flight has round-9 authority (lean −1 at 0.5 s is +24..27,
not the +30 the blend gives from t 0); it holds through a hop's push and recover, so a hop-then-lean gets its authority
only after `hopRecoverTime` 0.6 s or the landing (a rider holding lean back off a lip is in preload, not exempt); a bike
resting on its bash plate is grounded. A load-based blend (rider weight carried by the tyres) would remove the delay but
the 60 deg crest is a knife edge on the base-corner transition (both wheels off ~10 ticks): at `airDelay` 6 it went
2.91 → 3.86 s. Also open: the render's touchdown absorb (`crouchExtra`) is not in the physics chain (7.7), and the ragdoll
arm rods (0.26 / 0.28) are a side-view compromise for a 3D arm (the elbow is 0.11-0.27 m out of the plane).
(0d) Hand-over: the chain now IS the render's pose in the render's frame (0.00 cm on the crash tick, 7.7); what the
render still sees is its own ~80 ms pose lead and frame interpolation. If the render changes `poseRider`, the
`RAGDOLL hand-over vs render pose` test in `world.test.ts` carries the copy to update.
(1) Browser tick cost: the harness's 100 us p95 is `Game.stepTicks` on a stale `dist/` (the bot warned
`dist/ is older than src/`); rebuild and split the measurement into physics / rules / hash before touching
the solver — in node the physics is 1.4 us p50 and the hash 3 us. The physics side that remained was
`getState()`'s output tree (~14 objects; now sized up front, 0.11 us/call).

(2) Rider pose lag 0.28 s vs the 0.10-0.15 s + overshoot the critic asked for: a faster shift needs a
higher `shiftForce` cap or a lower `cAlong`, both of which move the launch/hop/climb envelope; try a
pose-only lead (render the arms/torso ahead of the mass) rather than moving the mass faster. (2b) Bottom-out
buck 11.6 cm / 10.6 deg vs the asked 6-10 / 3-6: `cLanding` saturates at 8000 (11.5 cm at 12 000 and 20 000); the
rest is the two ends rebounding off full travel — high-speed rebound damping (rate-squared) saturates at the
damper's rate-reversal clamp and kills the 1.5 m rebound cycle (0.25 vs the 0.22 the visible cycle needs), so
it was not taken. A softer bump stop over more travel (stopStart 0.7) did nothing either. What remains is honest:
a 9 m/s flat impact with 0.22 m of travel. (3) Crashed-bike scrub 3.2 m vs 1-1.5 m: the bike lands on its wheels in 2D; a side-slide μ
0.7 would need the bike to leave the wheel line, which the plane cannot express — the stalled-engine brake
is the honest 2D version. (4) `climb.55.time` 1.61 s for 4 m (clips ~2 s; round 6 had 2.4 with the lip chop) — closed. (5) Drums r ≥ 0.6 on flat ground: unrideable by geometry; tracks must sink, kicker or box them.
(6) The stationary hop apex dropped 0.64 → 0.62 with the plate move (the plate used to rest on the ground
during the preload crouch); still inside the band.
