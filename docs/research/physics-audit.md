# Audit of the v1 bike physics (rounds 1–11) against Trials

Author: physics architect (research/design role). Scope: `src/physics/**` at commit `42bdfe0` plus the
working tree of 2026-09-14, `docs/design/physics.md` (all eleven round blocks), `docs/design/CONTRACT.md`
§2.3–2.5. The Trials reference this is judged against is `docs/research/trials-bike-physics.md` (Part 1);
section numbers of the form R§n point there. Raw probe output is in
`docs/research/physics-audit-probe-output.md`; the probe itself is `harness/out/parent/physarch-probe.ts`
(read-only against the shipped solver, re-runnable in ~40 s).

## 0. Verdict

The v1 solver is a good *deterministic rigid-body engine* wrapped around a *wrong rider model*, and eleven
rounds of tuning have been spent adding controllers, blends, memories and thresholds to hide what the wrong
rider model does. It is bit-reproducible (P2, P8 below: identical hashes on repeat and across a
mid-hop `restore(snapshot())`), but it is not **per-tick validated** in the sense the brief means — bounded,
monotone, learnable responses — and it does not reproduce the three behaviours the brief names:

1. **Snapping weight forward does not correct a rising front.** On the Pro (the "honest" preset) a full
   forward lean applied when the nose passes 20 deg under full throttle makes the loop *worse* (pitch 20 →
   43 → crash); at 30 deg it is 30 → 130 deg in 0.5 s. What saves the bike in v1 is cutting the throttle
   (P5 vs P5b). On the Rookie it is the ECU wheelie assist that saves it, not the rider. The reason is
   structural (§2.1): lean is a *force on a tethered point mass*, and a forward step first pitches the frame
   nose-**up** for 0.1 s (P10: +1.7..+1.9 deg) because the brace reaction acts 0.38 m above the frame COM.
2. **The bunny hop is inverted and cliff-edged.** The apex is *higher the less the rider snaps forward*
   (snap to lean +1: 0.74 m; +0.5: 1.00 m; +0.1: 1.13 m — P2) and *higher the slower the snap* (ramp over
   0.008 s: 0.74 m; over 0.52 s: 1.04 m; over 0.58 s: no hop at all — P4). One input quantum decides
   between a 0.53 m hop and nothing (lean −64/127 vs −63/127; throttle 77/255 vs 76/255 — P3). One tick of
   preload decides between nothing and a 0.10 m hop (14 vs 15 ticks — P1).
3. **Accelerating with weight forward is not the stable regime it is in Trials; the whole envelope is
   a patchwork.** The Pro constant-input grid (P6) is non-monotone in lean: full gas at lean −0.5 loops
   at 1.78 s, at lean −1 it does not loop (21 deg), at lean −0.3 it does not (16 deg), at lean 0 it loops
   at 2.30 s — because the hop state machine engages at lean ≤ −0.5 and changes the leg forces, so "lean
   −1" is a different plant from "lean −0.3".

Everything below is the itemised case. The recommendation is the rewrite in `docs/design/physics-v2.md`,
keeping the parts of v1 that are genuinely good (§5).

## 1. What v1 is (as built)

Custom 2D sequential-impulse solver, 120 Hz, semi-implicit Euler, 8 velocity iterations, Baumgarte, speculative
contacts (`bike.ts` ~2.4 kLOC; `physics.md` §2). Bodies: frame (56 kg, I 14 kg m²), two wheels (7 kg,
I 0.7/0.5), **rider as a point mass (75 kg) tethered to a frame-space anchor by a spring/damper**, plus a
**hidden rider angular DOF (I 20 kg m²) driven by a torque-limited motor** toward `lean × 1.5 rad`
("torso store"). Gravity is **9.81 × 1.4 = 13.73 m/s²** with every rider/engine force scaled by 1.4
(round 6). Suspension: two sliders with spring/damper, bump stop with restitution. Tyre: μ 2.1 × surface
× shape(κ), κ from the previous tick's resolved slip. Engine: torque curve × gear 17.5, crank state with
spin-up/spin-down rates, centrifugal clutch cap, limiter, **ECU-style wheelie control** (Rookie),
**4.2 kg/m aero drag as a uniform deceleration field** (Rookie; 0.45 on Pro). Brakes: torque-capped
locks with an **anti-endo feed-forward cap** on the front, an **air cap** of 60 Nm. Rider input model:
`lean` → slewed `leanEff` → anchor x offset (0.60 m back / 0.73 m fwd) **and y drop** (0.20 back /
0.50 fwd) × an **airborne blend `S_AIR`**; a **hop state machine** (idle/preload/push/recover) keyed on
`lean ≤ −0.5 && throttle ≥ 0.3`, with `preloadSlack`, a leg actuator of 4500 N at the pegs, a
legs-straight stop, and abort/timeout lines. Crash: drawn-chain head/torso sensors, tether distance,
tether force > 30 kN for 2 ticks past 45 deg nose-down, hazard, OOB.

## 2. Findings against Trials behaviour

Each finding: what Trials does (R§), what v1 does, the evidence, where it came from, severity
(**S1** decides the rewrite; **S2** must change; **S3** should change).

### 2.1 S1 — Lean is a force on a point mass, so "weight forward" has the wrong sign for 0.1 s and the wrong magnitude for ever

*Trials:* the rider is a mass whose position on the bike the player controls directly; leaning forward
moves the centre of mass toward the front contact and — done fast — exchanges angular momentum with the
frame so a rising front comes down (R§4.2, R§4.6). The response is immediate and monotone in the input.

*v1:* `lean` sets the target of a spring/damper (`kAlong` 28 kN/m, capped at `shiftForce` 2800 N) pulling
a 75 kg point mass toward an anchor (`bike.ts:1256-1332`). The reaction is applied to the frame **at the
anchor** (0.38 m above the frame origin, `braceX/Y`), so accelerating the mass forward puts a *forward*
force on the frame above its COM: a nose-**up** couple for as long as the mass accelerates. Measured
(P10, 8 m/s, both presets): a step to lean +1 gives **+1.7..+1.9 deg at 0.1 s**, then −8.7..−9.6 deg at
0.5 s, then back to −3 deg. Non-minimum-phase, as the round-11 owner also found for the wheelie PD ("the
lean is non-minimum-phase, the mass shift nose-dives first" — same phenomenon, other sign convention in
their sentence). In the air the shift is *scaled down to 25 %* (`airShift`, round 10) precisely because
the point mass translating relative to the frame counter-rotates it "the wrong way" (`physics.md` round
10: lean −1 with the shift on was +12 deg, without +31; lean +1 was −1.4 vs −35).

Consequence (P5): on the Pro, snapping to lean +1 at 20 deg of pitch under full gas ends in a crash
(3.95 s); at 30 deg, 130 deg in 0.5 s. Cutting the throttle at 30 deg saves it (P5b: 35.5 max, no fault).
So in v1 the *correction* for a rising front is the throttle, and the user's stated Trials behaviour —
"snapping weight forward tends to correct the front raising up" — is false in the honest preset and
outsourced to an ECU in the assisted one.

Introduced: round 1 (`4eb0b12`, "deterministic bike+rider sim") as the rider model; `kAlong`/`shiftForce`
retuned rounds 2–6. Why: a point mass on a spring was the cheapest thing that produced a moving COM.

### 2.2 S1 — The hidden torso angular-momentum store gives lean a second, unrelated meaning in the air

*Trials:* leaning back in the air rotates the bike nose-up, leaning forward nose-down, and *the same
input does the same thing on the ground* — on the ground the tyres resist it, that is all (R§4.7).

*v1:* a hidden rider angular DOF with **I = 20 kg m²** (a human torso about the hips is ~2–3 kg m²; 20 is a
flywheel) is spun by a 400 Nm motor to `lean × 1.5 rad` (`bike.ts:1702-1709`, `1861-1873`). Its angular
momentum, 30 N m s per unit lean, is what rotates the frame in the air (+25 deg in 0.5 s). It is never
drawn (`torsoPitch` is a separate cosmetic), so the visible rider and the dynamic rider disagree. On the
ground the store adds ~+4 deg for lean −1 (P10) — the same input is 6× stronger in the air, and the
hand-over is a blend (§2.3). Round 2's version was a spring and "swung 40 deg past its target and the
return stroke pushed the nose 5–8 deg up — that was the 60 deg stall" (`physics.md` §7.4): the store has
been a source of unexplained pitch since it existed.

Introduced: round 2 (`e692bf2`) as "torso spring"; motorised round 3 (`ea32412`). Why: a point mass cannot
rotate the bike in the air.

### 2.3 S1 — `S_AIR`: a 12-tick, two-ramp, phase-gated blend that changes what `lean` means

`bike.ts:1044-1061`. The lean's mass shift and its drops are multiplied by `1 − S_AIR·0.75`; engine braking
fades to 0 on the same signal; the blend starts only after **both wheels have been off for 12 ticks**
(0.1 s) and no frame hard point is loaded, ramps up over 0.10 s, down over 0.12 s, and **holds its value
through the hop's push and recover phases** (because engaging it mid-snap "pitched the stationary hop 13
deg nose-down"). The owner's own note explains why 12 ticks and not 6: "at 6 ticks the 60 deg plank's
base-corner transition saw a 3 % blend and the knife-edge crest went 2.91 → 3.86 s". That is a knife
edge on the blend delay of a blend that exists to hide the point-mass counter-rotation of §2.1. A player
leaning back 0.09 s after leaving a lip gets one bike; 0.11 s after, another.

Introduced: round 10 (`d98236a`). Why: air-lean authority was +12/−1 deg and the parent asked for ±20–30.

### 2.4 S1 — The bunny hop is a scripted state machine with six thresholds, and its output is inverted

`bike.ts:1063-1109`, `1286-1346`, tuning `rider.hop*`. IDLE → PRELOAD needs `lean ≤ −0.5 && throttle ≥ 0.3
&& rear grounded`; PRELOAD → PUSH needs `t ≥ 0.12 s && (lean rate ≥ 4/s || lean > 0)`; PRELOAD aborts at
`t > 1.5 s || lean > −0.25 || throttle < 0.15`; PUSH ends at legs straight or 0.35 s; RECOVER 0.6 s. In
PRELOAD the legs go slack to 15 % of weight (`preloadSlack`), in PUSH a 4500 N actuator fires at
`hopPegX`, the spring drops to 500 N/m and the damper to 10 %.

Measured against the brief's "learnable, reproducible, proportional":

| probe | result | what a Trials player would expect |
|--|--|--|
| P3: preload lean −64/127 vs −63/127 | 0.53 m hop vs **no hop** | continuous |
| P3: preload throttle 77/255 vs 76/255 | 0.80 m vs **0.00 m** | continuous |
| P1: preload 14 vs 15 ticks | 0.00 vs 0.10 m | continuous |
| P1: preload 181 vs 190 ticks | 0.68 m vs 0.00 m (timeout) | a long crouch is still a crouch |
| P1: preload 0.4–1.0 s | max pitch 18 → 60 deg *during the preload* | the preload lifts the front a little, it does not loop |
| P2: snap to lean +1 / +0.5 / +0.1 / 0 | 0.74 / 1.00 / **1.13** / 1.08 m | harder snap = higher hop (R§4.3) |
| P4: snap ramp 8 ms / 0.33 s / 0.52 s / 0.58 s | 0.74 / 0.79 / **1.04** / **0.00** m | faster snap = higher hop; a slow lean is a smaller hop, not a cancelled one |
| P9: rolling 8 m/s, snap +1 vs +0.5 | 0.68 / 0.82 m, landing −16 / −36 deg | snap forward lands nose-down proportionally, not 36 deg from half a lean |
| P2: 1 tick late / 1 tick early snap | +0.025 / −0.021 m | proportional — **this one is fine** |

The inversion comes from the anchor geometry: at lean +1 the anchor is 0.73 m forward *and 0.50 m lower*
(`leanCrouchFwd`), so a full snap throws the mass forward-and-down over the front axle while the push acts
at the pegs — the rear gets less of the yank (the owner noticed: "a yank there lifted the front and left the
rear 0.15 m short", §7.5) and the frame's forward pitch from the mass shift subtracts. A half snap keeps the
mass higher and further back, so more of the leg impulse lifts the rear. The v1 hop is a *leg press*, not the
Trials hop (spring energy + rider COM velocity + angular momentum exchange, R§4.3).

Introduced: round 1 (`4eb0b12`), thresholds retuned rounds 3, 4, 7, 10 (`hopLeanBack` −0.6 → −0.5,
`hopPreloadMin`, `hopSnapRate`, the airborne hold). Why: "no hop button" (CONTRACT §2.8) implemented as a
gesture recogniser rather than as physics.

### 2.5 S1 — The ECU wheelie control (Rookie) makes throttle→thrust depend on remembered terrain

`bike.ts:1134-1178`, `2146-2200`; tuning `engine.wheelieControl` (13 parameters). Positive torque is
multiplied by a function of `rel + lead` where `rel` = frame angle − max(remembered rear slope, remembered
front slope), the memories relax at 0.7 rad/s (`groundRelax`) or 1.5 rad/s once unloaded ≥ 12 ticks
(`airRelax`), faces steeper than 66 deg are never remembered (`maxSlopeDeg`), `lead` = 0.35 s × pitch rate
faded in over the first 10 deg, the taper runs 1.0 → 0.3 → 0 across 25 / 40 / 50 deg, is gated to 0 at
lean ≤ −0.5, and in the air the drive may exceed road speed by 1 m/s only when the nose is past 25 deg
and no hop is in progress.

This is hidden state that changes the meaning of the throttle: two identical input sequences over two
different surfaces 0.5 s ago produce different thrust now. It parks the wheelie at 33–37 deg at lean ≥
−0.3 "whatever the PD asks" (`physics.md` §12 balance row) — the 45–50 deg balance point that Trials play
lives at (R§4.5; clips 03, 05, 14) is *unreachable on the throttle* on the Rookie. And it still needed
three new special cases in round 11 (crest, lip, air spin) after three strangers looped on b1/b2/b3. The
owner's sweep in §12.5 says it plainly: `rateLead 0 → loops 2.3–3.2 s whatever the pitch band` — the
Rookie does not loop only because a rate term reads the future.

Introduced: round 8 (`2df0b0d`) after eight strangers all looped at x ≈ 24 m at full gas / neutral lean;
patched round 11 (`42bdfe0`). Why: the honest plant loops at neutral lean in ~2.3 s (P6: Pro thr 1 lean 0
loops at 2.30 s). In Trials the honest plant *does not* (R§4.6) — see §2.7.

### 2.6 S1 — 1.4 g with every force rescaled is a time-warp that was tuned against the wrong measurement

Round 6 (`16a31f2`) set `gravityScale` 1.4 (13.73 m/s²) and multiplied engine torque, brakes, hop forces,
leg/brace/landing springs by 1.4 — but not masses, inertias, geometry or the torso motor (400 Nm, "560
broke the wheelie PD hold"). The stated evidence was a blind critic's "2.2 s of airtime with frozen pitch
off a 45 deg ramp" and "reference big jumps ~1.0 s, stationary hop ~0.6 s".

- The 2.2 s flight was a *test-geometry and launch-speed* problem (a 45 deg 1 m kicker at 14 m/s is a
  10 m/s vertical launch: 2.0 s at 9.81 on any planet), which the round-7 owner then documented as
  "the launch attitude off a 45 deg face is the face angle; no honest change puts it at 25–35 deg". Trials
  kickers are 15–30 deg (R§5) and Trials flights on medium tracks are **2.4–3.2 s** in the project's own
  corpus (`reference/notes/evolution-gameplay.md` obs 12) — Trials does not run heavy gravity, it runs
  low kickers and moderate speeds.
- A 0.6 s stationary-hop airtime at 9.81 m/s² is a 0.44 m rear apex (h = gT²/8); at 13.73 it is 0.62 m.
  The frame analysis (R§6) gives the corpus hop's apex and airtime together; they are consistent with ~1 g
  and a ~0.45 m rear-wheel rise, not with 0.62–0.75 m — the CONTRACT's "0.55–0.75 m" hop band was
  asserted, not measured, and 1.4 g was chosen to make a too-tall hop end in the right time.
- Scaling g and forces by s is a time rescale by 1/√s only if *everything* scales; leaving inertias and
  the torso motor alone changes the dynamics, which is why the wheelie PD, the 60 deg crest and the
  lean-0 loop all moved in round 6 (loop 1.54 → 1.11 s; crest hung). Every later round tuned against a
  plant whose natural frequencies had been shifted by 18 % in some subsystems and not in others.
- 1.4 g raises the thrust a 60 deg plank needs by 1.4 (1725 N at the rim), which raised `peakTorqueNm` to
  52 and put the launch at a/g ≈ 0.99 at the clutch — the owner's own "knife edge set by the launch
  transient: 51.5 never lifts the front, 52 loops at 1.1 s, 53 at 1.05" (`physics.md` §4). Heavy gravity
  is the *amplifier* of the loop-out problem, not the fix for airtime.

### 2.7 S1 — Neither preset has Trials' stability under acceleration; the honest one loops at neutral lean in 2.3 s

*Trials:* full throttle from rest at neutral lean lifts the front into a wheelie that the rider can hold or
put down by leaning; looping requires leaning back or a very powerful bike (R§4.6; R§2 bike notes). Every
competent rider *launches in a wheelie* (evolution-gameplay obs 8). Stability comes from the rider mass
being far forward and high relative to the rear contact when standing in the attack position, from a
torque curve whose *thrust falls with speed* (so a/g drops as the balance pitch is approached), and from
the fact that the player's forward lean moves the COM toward the front axle by a large fraction of the
wheelbase.

*v1 Pro (P6):* thr 1 / lean 0 loops at 2.30 s; thr 1 / lean −0.5 at 1.78 s; thr 1 / lean −1 **does not**
(the hop state machine's `preloadSlack` unloads the bike). The rows are not monotone in lean, so the
player cannot form the rule "more back = more wheelie". *v1 Rookie:* nothing loops at lean ≥ −0.3 because
of §2.5, so the player learns nothing about the bike either.

The combined COM at neutral lean is 0.76 m ahead of the rear patch and 0.68 m up (`physics.md` §2.1) —
the round-2 owner moved the rider anchor forward and low "so that 1440 N does not loop the bike at lean 0
within 1.5 s", i.e. the pose was bent to the problem instead of the model. The critical launch
acceleration g·d/h = 11 m/s² is then compared with a rim thrust of 1970 N / 145 kg = 13.6 m/s² off the
clutch: v1 *is designed* to loop at neutral lean and then prevented from doing so by governor, ECU and
clutch spin-up rate (round 7: "the loop time is a step in the spin-up rate").

### 2.8 S2 — The drag governor (Rookie 4.2 kg/m) is nine times physical and doubles as a wheelie brake

`aero.dragCoef` 4.2 (1.7 kN at 20 m/s; a real CdA 0.75 m² is 0.45). Rounds 2–6 used it so that partial
throttle "tops out" (thr 0.3 → 11 m/s), and rounds 7–11 discovered it was also propping up the wheelie PD
"hold" (parks the bike at 11 m/s so the accelerating bang-bang PD looks like a hold) and the 55/60 deg
climbs. Round 9's rewrite as a *uniform deceleration field* across four bodies (`bike.ts:1404-1417`)
removed the nose-down couple it had produced when applied to the frame alone — correct as far as it goes,
but a field that decelerates the rider without a force path through the bars/pegs is not a model of
anything; it is a speed limiter dressed as air. The torque curve above the clutch was then edited to be
"the round-8 NET thrust (its curve minus the drag)" so the ground acceleration envelope would not change
(round 9) — the engine curve is now a tuning artefact, not an engine.

### 2.9 S2 — Lean also crouches the rider (0.50 m at lean +1), which is why braking, drag and stability all depend on lean in the wrong way

`leanCrouchFwd` 0.50 / `leanCrouch` 0.20 (`bike.ts:1264`). At lean +1 the rider COM is 0.5 m lower than
neutral: the combined COM height goes 0.68 → 0.44 m. Round 9 traced the airborne nose-over "fix" to this
("lean +1 'fixed' it because the lean-+1 anchor sits 0.5 m lower, so the same brace reaction acted below
the frame COM"). Round 10 decoupled the *drawn* crouch from it (`crouchIsHopOnly`), so the dynamics still
drop a mass the renderer does not draw dropping. A real rider leaning over the bars lowers his COM by
perhaps 0.15 m; the hang-back pose in RIDER_CHAIN.md lowers the hips 0.25 m. The 0.5 m was a lever to
keep the front loaded on climbs.

### 2.10 S2 — The legs act along frame-up, so the hop axis is wrong at pitch and the rear-wheel bounce cannot exist

Round 11 status block: "the hop push and the legs-straight stop act along frame-up; at a 60–70 deg
rear-wheel stand frame-up is 60–70 deg from vertical, so a push there is mostly a horizontal pair". The
Trials rear-wheel hop (clips 03, 04, 18, 19; R§4.4) is *the* intermediate technique and v1 cannot express
it. The fix the owner names ("make the leg axis follow the hip → peg line") "moves every hop" — which is
the tell that the hop is a tuned artefact rather than an emergent behaviour.

### 2.11 S2 — Brakes are modulated by hidden rider logic

`bike.ts:1987-2000`: the front brake torque is capped by a feed-forward computed from `comDH(leanEff)` so
that 4 % of the weight stays on the rear, then faded by measured rear load with a 0.7 floor; a wheel off
the ground last tick is capped at 60 Nm (`airNm`, round 11) because "the full 700 Nm dumped the rear's
41 N m s into the frame in 0.06 s (−36 deg in 0.5 s)". Trials' front brake endos you if you grab it with
weight forward and the in-air brake pitches the nose down at a rate the player learns (R§4.8); neither is
something the bike does *for* you. The 41 N m s figure is itself a symptom: the pitch inertia the wheel
dumps into is too small (frame 14 kg m² about its own COM + a point-mass rider; a rider's own body
inertia is absent), so the wheel's spin is an outsized share of the system's angular momentum.

### 2.12 S2 — The one-way "straddle" rule decides a wheel's side by the frame origin and lifts it at 2.5 m/s

`collision.ts:281-314`, `bike.ts:1653-1655`, round 11. A rear wheel whose centre arrives under a one-way
board while the frame is above it is given a manifold "through the board" with the lift rate capped at
`STRADDLE_LIFT` 2.5 m/s. This is a position teleport with a speed limit. The real defect is that one-way
polylines have **open ends** and the compiled track has no end-cap rule; the design must state one (v2 §7.4:
a one-way segment's end vertex is a two-sided point collider within one tyre radius, and the side test uses
the wheel's *previous* centre, which is what every 2D platformer does).

### 2.13 S2 — Crash proxies: tether distance and tether force

`bike.ts:1315-1325`, `2255`. "Rider 1.3 × 0.5 m from the anchor" and "≥ 30 kN of tether force for 2
ticks while past 45 deg nose-down" are stand-ins for "the rider left the bike". Round 9 had to add the 45
deg qualifier because the 22.4 kN rule "fired on ordinary lip hits and plank feet, a stranger's level 4×0.8
kicker at 11.6 m/s among them". Trials crashes on **body contact** (head, torso, and in later games any
limb touching the world) and on nothing else (R§4.9); with a rider whose position is a bounded kinematic
offset (v2) no force proxy is needed.

### 2.14 S3 — Tyre κ from the previous tick, μ 2.1

`bike.ts:1661-1670`. κ uses the previous tick's resolved slip — one tick of hidden state — because the
pre-solve velocity "carries this tick's unconstrained engine spin-up". μ_peak 2.1 (× 0.95 on wood = 2.0)
was set so tan 60 = 1.73 holds and tan 65 = 2.14 never does: the climb ridge is a friction number, which is
fine and Trials-like (rear grip in Trials is very high on every surface, R§4.10) — but it should be a
*designed* number with a slip curve that is evaluated from this tick's pre-impulse patch velocity with the
engine's torque already limited by the friction cone (v2 §6), not a memory.

### 2.15 S3 — Engine tuned as an anti-loop device

`crankSpinUp` 8000 rpm/s, `clutchCap` 0.8, `clutchThrottle` 0.25 (round 7): "12 000 rpm/s gives 1.67 s,
9000 gives 1.57, the loop time is a step in the spin-up rate". The engine is physically plausible but its
numbers were chosen to move a loop time, and the same round reports the cost: "the wheelie PD hold fell to
6 s: the spin-up is a throttle lag below 7 m/s". Every Trials technique at walking pace (rear-wheel hop,
log lift, plank crawl) lives below 7 m/s and needs an instant, proportional throttle (R§4.4).

### 2.16 S3 — The two-bike split is an admission, not a design

Rookie = governor + ECU + soft clutch; Pro = five numbers changed and the ECU off, "the loop is the
rider's at every lean" — but P5 shows the rider *has no tool* to correct it except the throttle, and P6
shows the loop envelope is not monotone. Trials' beginner bike (Squid/Donkey) differs from the expert bike
(Mantis/Phoenix) in **mass, power, gearing, wheelbase and suspension** (R§2), not in whether the game
intervenes. One honest model with Trials-like stability makes the assist unnecessary; the classes become
parameter rows.

### 2.17 S3 — CONTRACT rows that were wrong and were "PASSED" anyway

- "COM 0.45 m above the axle line": built at 0.34, marked *note*.
- "PD holds a wheelie indefinitely": marked PASS in rounds 6–10, found in round 11 to be the drag parking
  the bike at 11 m/s.
- "stationary hop 0.55–0.75 m": asserted; frame analysis (R§6) puts the corpus hop lower.
- "0 → 16 m/s ≤ 3.5 s": 1.40–2.19 s, which is a 0–58 km/h time faster than a 450 cc motocross bike on
  dirt and the direct cause of the loop-out (a/g ≈ 1 off the clutch).

## 3. Knife-edge and hack register

"Knife edge" = a parameter or threshold where the owner's own notes, or the probe, show a discontinuous or
disproportionate response. "Hack" = a mechanism that exists to hide another mechanism's behaviour.

| # | mechanism | where | round / commit | why it was added | what it breaks |
|--|--|--|--|--|--|
| K1 | `hopLeanBack` −0.5 / `hopThrottle` 0.3 entry thresholds | `bike.ts:1074` | r1 `4eb0b12`, retuned r3 | gesture recogniser for "no hop button" | one input quantum = hop / no hop (P3) |
| K2 | `hopPreloadMin` 0.12 s | `bike.ts:1081` | r1 | avoid accidental hops | 14 vs 15 ticks: 0 vs 0.10 m (P1) |
| K3 | `hopPreloadMax` 1.5 s abort | `bike.ts:1086` | r1 | stop a held lean-back staying armed | hop vanishes at tick 181 → 190 (P1); lean −1 full gas "no loop on Pro" only because the preload times out (§12.6) |
| K4 | `hopSnapRate` 4/s and the abort line lean > −0.25 | `bike.ts:1081,1086` | r1, r3 | detect the snap | ramp 0.52 s hops 1.04 m, 0.58 s hops 0 (P4) |
| K5 | `preloadSlack` 0.85 | `bike.ts:1307` | r3 `ea32412` | make the preload compress the suspension | changes the plant at lean ≤ −0.5: P6 non-monotone lean rows |
| K6 | hop push at `hopPegX`, `kPush` 500, damper ×0.1, `hopForce` 4500 / `hopMaxForce` 5300 | `bike.ts:1295-1346` | r1, r4, r6 (×1.4) | make the rear come up | inverted apex vs snap magnitude (P2, P9) |
| K7 | `airShift` 0.25 + `airDelay` 12 + `airRise` 0.10 + `airFall` 0.12 + hold through push/recover + `U_FRAME_GND` | `bike.ts:1044-1061` | r10 `d98236a` | point-mass shift cancels the torso store in the air | lean means two things; owner: 6 ticks moved the 60 deg crest 2.91 → 3.86 s |
| K8 | torso store I 20, swing 1.5, 400 Nm motor, bang-bang rate | `bike.ts:1702-1709,1861-1873` | r2, r3 | air rotation | unphysical inertia; not drawn; 560 Nm "breaks the PD hold" |
| K9 | `leanCrouch` 0.2 / `leanCrouchFwd` 0.5 | `bike.ts:1264` | r2, r3 (halved back) | keep the front loaded on climbs | COM height depends on lean 0.68 → 0.44 m; pose/dynamics split (r10) |
| K10 | `gravityScale` 1.4 with partial rescale | `tuning.ts` | r6 `16a31f2` | "airtime" | shifts natural frequencies; thrust/g knife edge (51.5 / 52 / 53 Nm) |
| K11 | `aero.dragCoef` 4.2 as governor; net-thrust torque curve | `tuning.ts`, r9 curve edit | r2, r6, r9 | part-throttle top speed; PD "hold"; climbs | 9× physical; the curve is no longer an engine |
| K12 | wheelie control (13 params) incl. slope memories, rate lead, air spin cap | `bike.ts:1134-1178`, `2146-2200` | r8 `2df0b0d`, r11 `42bdfe0` | strangers looped at x 24 m | hidden state in throttle→thrust; wheelie parked at 33–37 deg; `rateLead 0 → loops whatever the band` |
| K13 | soft clutch numbers as loop timer | `tuning.ts engine.crank*` | r7 `2bdd175` | loop guarantee 1.5 s | throttle lag below 7 m/s; "loop time is a step in the spin-up rate" |
| K14 | rear spring 12 000 / preload 0 "just under the bump stop in a wheelie" | `tuning.ts` | r6 | avoid sitting on the stop | 9500 "PD hold 4 s, climb 0.7 m" — discontinuous in k |
| K15 | anti-endo feed-forward cap, floor 0.7, `rearLoadMin` 0.04 | `bike.ts:1987-2000` | r3, r4, r8 | stop endos | hidden modulation; 0.8 → 0.7 "stoppied over in 1.5 s at lean 0" |
| K16 | `airNm` 60 in-air brake cap | `bike.ts:1986` | r11 | −36 deg in 0.5 s at 20 m/s | brake is a rate, not the wheel's momentum |
| K17 | `engineBrakeAir` 0 faded over 3 ticks after `airDelay` | `bike.ts:1184` | r10 | −11 deg no-input drift | more phase-gated behaviour; "a faster fade moved the 60 deg base-corner transition" |
| K18 | one-way straddle by frame origin + `STRADDLE_LIFT` 2.5 m/s | `collision.ts:281-314`, `bike.ts:1655` | r11 | m3 wedge | position teleport; open-end geometry unsolved |
| K19 | tether-force crash 30 kN × 2 ticks past 45 deg nose-down; tetherDist 1.3× | `bike.ts:1325`, `2255` | r1, r9 | "over the bars" | force proxy for a contact rule; fired on kickers |
| K20 | κ from previous tick's slip | `bike.ts:1661` | r3 | pre-solve spin-up judged sliding | one tick of memory in the friction cone |
| K21 | bash plate moved 0.11 → 0.24 m below origin | `tuning.ts frame.circles` | r4 `eb6be42` | hooked every edge | fine in itself; the 0.9 m ledge then "needs a real 0.9 m rear lift" — geometry chasing hop numbers |
| K22 | climber controller `hover` 8 → 10 deg | controllers | r9 | 60 deg crest hung "on the drag's line of action" | the test controller was retuned to pass the plant |
| K23 | wheelie PD gains kp 0.1 / kd 0.03 "from that exact start" | controllers / tests | r6, r7 | prove a hold | "revving for 0.3 s before the teleport drops it to 1.3 s" — the test was the knife edge |
| K24 | rider anchor moved forward/low (0.21, 0.50) → (0.33, 0.38) | `tuning.ts rider.anchor` | r2 | not loop at lean 0 | attack pose bent to the plant; COM 0.34 m above axle vs CONTRACT 0.45 |

Twenty-four items across eleven rounds; every round after round 2 added at least one, and the round-11
block adds four (K12 patches, K16, K18, `airSpin`). The trend is the diagnosis.

## 4. Is v1 "per-tick validated"?

Definition used (from the brief): for every tick, a bounded input change produces a bounded, same-signed
output change; identical inputs produce identical trajectories; behaviour depends only on visible state.

| property | v1 |
|--|--|
| identical input → identical trajectory | **yes** (P2 repeat hash; P8 restore-fork hash; `world.test.ts`, `snapshot.test.ts`) |
| `restore(snapshot())` complete | **yes** since round 5 (`86fd137`) |
| no hidden state affecting input→response | **no**: `S_AIR`, `S_REAR_SLOPE`/`S_FRONT_SLOPE`, `S_RPM` spin-up, `S_HOP_TIMER`/`U_HOP`, `S_REAR_SLIP` (κ), `U_FRAME_GND`, brake `S_BRAKE_EFF` slew — all legitimate *dynamic* state in a simulation, but several (`S_AIR`, slope memories, hop phase) are *mode switches* that change the input mapping |
| bounded response to a one-quantum input change | **no** (K1, K2, K4: 0 ↔ 0.5–1.0 m) |
| monotone throttle → acceleration | on the Pro yes; on the Rookie no (the ECU can cut torque to 0 as pitch rises with throttle held) |
| monotone lean → pitch | **no** (P6 rows; P10 initial sign) |
| one-tick-late snap → proportionally lower hop | yes locally (±0.02 m per tick) but the *direction* of the lean magnitude effect is inverted (P2) |

## 5. What v1 got right (keep in v2)

- The **determinism substrate**: all state in `F`/`U` typed arrays, `dmath.ts` (bit-identical transcendental
  functions across V8/JSC), fixed iteration counts and order, index-arithmetic broadphase, seeded RNG in
  the hash surface, `snapshot.test.ts`'s foreign-snapshot and beam-search-load probes. v2 keeps the file
  layout and the tests.
- **Sequential impulses with speculative contacts** at 120 Hz: adequate and fast (2–4 µs/tick).
- `collision.ts` primitives and grid; seesaw as a pinned body with angle limits; rolling drums; the
  round-4 *analysis* of drum geometry (86 deg contact normal) is correct and belongs in the tracks doc.
- **Ragdoll spawn continuity** from the drawn chain and the `riderChain()` port of `src/render/rider/pose.ts`
  (round 10): v2's rider model is defined *in terms of that chain*, which removes the pose/dynamics split.
- The round-11 findings themselves (PD "hold" was acceleration; lean is non-minimum-phase; legs act along
  frame-up) — each is a correct diagnosis of the point-mass rider, and each is resolved by replacing it
  rather than patching it.
- The test discipline: every round measured. The numbers are why this audit can be specific.

## 6. Answer to the coordinator's question: one bike or two?

One honest model. The Trials games differ their bikes by mass, power curve, gearing, wheelbase, COM height
and suspension rates (R§2), and every bike in every Trials game obeys the same rider model; the beginner
bike is *slower and more forgiving*, not *assisted*. The v1 split exists because the point-mass rider
cannot make neutral-lean full gas survivable without an ECU. In v2 (§5 of the design) the accelerating bike
with the rider in the attack position is a stable equilibrium because (a) the rider mass is a kinematic
offset the player moves directly, so a forward lean moves the COM toward the front axle *immediately* and
with the right sign, (b) the rider body has its own inertia and exchanges angular momentum with the frame
when moved fast, so a snap forward *rotates the frame nose-down*, and (c) thrust falls with speed on a real
curve so a/g falls as the balance pitch approaches. The Rookie/Pro presets survive as parameter rows
(mass, torque, gear, wheelbase, spring rates) with `wheelieControl`, `aero` governor, `airShift`, the hop
machine and the brake caps deleted.

## 7. Probe index

`docs/research/physics-audit-probe-output.md` sections: P1 hop apex vs preload ticks; P2 one-quantum and
one-tick perturbations; P3 entry thresholds; P4 snap speed; P5/P5b snap-forward vs throttle-cut on a rising
front (both presets); P6 Pro constant-input grid; P7 crest at full gas; P8 snapshot/restore mid-hop; P9
rolling hop; P10 lean step on the ground. All at 120 Hz on `makeTrack()` flat dirt, quantised inputs via
`quantizeInput`, seed 1, 60 settle ticks.
