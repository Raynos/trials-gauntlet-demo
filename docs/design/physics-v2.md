# Physics v2: bike + rider, from the ground up

Owner: physics (to be built by the next physics owner from this document). Author: physics architect.
Status: **design — not built**. Where this file disagrees with `docs/design/CONTRACT.md`, the CONTRACT wins;
§16 lists the CONTRACT rows this design asks the core-game owner to amend. Evidence base:
`docs/research/trials-bike-physics.md` (R§n), `docs/research/physics-audit.md` (A§n),
`docs/research/physics-audit-probe-output.md`, and the toy model `scratchpad/physarch/toy-v2.ts` (T-n rows
in `toy-run3.md`). Units SI; +x along the course, +y up, CCW positive, nose-up pitch positive. Fixed step.

## 0. The ten decisions

1. **Rider is a rigid body** (75 kg, I ≈ 9 kg m² about its COM) attached to the chassis by a *pose servo*:
   `lean` sets a **target pose** (COM offset + body angle in chassis space, from the drawn chain), the target
   moves toward the input at a **finite rate**, and bounded internal forces drive the body to the target.
   No point mass on a spring, no hidden flywheel, no airborne blend. (R§1 "the rider pulls the handlebars for
   real", R§8; A§2.1–2.3.)
2. **Every rider force is an internal pair** except one declared, bounded, memoryless **attitude torque**
   `τ_att = −K_att · lean − c_att · ω` on the chassis (the "in-air control" stat every Trials bike has, R§2
   Foxbat / Frontier "lean"). It is the only non-conservative rider term, it is the same on the ground and in
   the air, and it is printed on the HUD.
3. **Gravity 9.81 m/s², real masses, no rescaling.** Airtime comes from launch speed and ramp angle (R§5).
4. **Thrust falls with speed** (torque curve × gear, constant-power region above ~8 m/s, limiter at the top);
   a/g off the line 0.62 for the mid bike. Full gas at *neutral* lifts the front into a **self-limiting
   wheelie that never loops** (thrust falls as speed builds); a quarter of forward lean keeps it down; hard
   back loops. That ladder — not a governor, an ECU or a drag field — is the Trials stability (§10). Stability under throttle is geometry + falling thrust (§10),
   not a governor, an ECU or a drag field. **No wheelie control, no speed governor, no clutch spin-up
   timer.** Real aero drag only (CdA 0.75 m²).
5. **Bunny hop, rear-wheel hop and landing absorption are emergent**: rear spring energy + rider COM velocity
   + angular momentum exchange. **No hop state machine, no thresholds, no timers.** Legs push along the
   body's hip→peg line, so the pogo at 60–80 deg works.
6. **Tick 120 Hz, semi-implicit Euler, sequential impulses, 6 velocity iterations + 2 position iterations
   (split impulses), warm starting OFF, speculative contacts.** Inputs quantised to the recording format
   *before* the step. Everything cross-tick lives in `F`/`U` (kept from v1).
7. **Tyre: brush model** — longitudinal force = `min(C_s · slip_v, μ N)` with μ from surface × load
   sensitivity, evaluated from *this tick's* pre-impulse patch velocity; engine torque is applied to the wheel
   and the friction cone limits it (no κ memory).
8. **Brake = one input, both wheels**, torque-capped locks; front/rear split is a bike constant (60/40);
   **no anti-endo, no air cap** — the wheel's spin momentum reacts on the frame as it should.
9. **Crash = head or torso sensor contact** (existing drawn-chain sensors), hazard, OOB. No tether-force or
   tether-distance proxies; over-rotation alone never faults.
10. **One model, N bikes.** Rookie/Pro (and any later class) are rows in the parameter table: mass, torque,
    gearing, wheelbase, COM height, spring rates, K_att. Nothing in the solver reads the class.

## 1. Bodies and degrees of freedom

| body | mass | inertia (about own COM) | shape | notes |
|--|--|--|--|--|
| chassis `C` | 58 kg | 11 kg m² | 4 hard-point circles (bash plate, tail, fork crown, bars) | includes engine, tank, swingarm, forks (unsprung mass folded into wheels) |
| rear wheel `Wr` | 8 kg | 0.55 kg m² spin | circle r 0.34 | on a slider (§5), drives |
| front wheel `Wf` | 7 kg | 0.45 kg m² spin | circle r 0.34 | on a slider, brakes only |
| rider `R` | 75 kg | 9 kg m² | none (sensors on the drawn chain) | rigid torso-pelvis mass; limbs are kinematic (drawn chain) |
| seesaw / drum bodies | per collider | | box / circle | as v1 |
| ragdoll (crashed) | as v1 | | | spawned on the drawn chain, as v1 |

**Why a rigid rider body and not a point mass or a separate ragdoll.** The behaviours that define Trials are
angular-momentum exchanges between rider and bike (snap-forward levels a wheelie, R§4.6; the tuck lifts the
rear, R§4.3; leaning rotates the bike in the air, R§4.7) and load transfers from the rider's *velocity*
(hop, R§4.3; landing absorption, R§4.8). A point mass has no angular momentum of its own and its translation
reacts on the chassis at a single point, which gives the wrong sign for the first 0.1 s of a lean (A§2.1) and
cancels the rotation the torso should give (A§2.2). A full active ragdoll (what RedLynx describe for HD) is
the other end: 6–8 bodies with motors, hard to tune and hard to make deterministic and fast. A single rigid
body with mass and inertia driven to a pose target captures every documented effect (T2, T3, T5), is one
body in the solver, and the drawn limbs follow it kinematically through the existing chain (`riderChain()`),
so what is drawn is what crashes. Wheels are separate bodies so that spin momentum is real (in-air throttle
and brake pitch the bike through it, R§4.7) and so that suspension is a real slider.

**DOFs:** C (x, y, θ) · Wr (x, y, φ) · Wf (x, y, φ) · R (x, y, ψ) = 12, with 2 slider constraints removing 2,
leaving 10 free. Rider ↔ chassis is *not* a constraint: it is a servo (§9), so the rider can be thrown.

## 2. Frames, geometry, gravity

- World: SI, g = **9.81**. Chassis frame: origin at the chassis COM, x along the frame axis. Axle rest points
  (zero compression) `rear (−0.585, −0.21)`, `front (+0.715, −0.215)` (kept from v1: wheelbase 1.30 at zero
  compression, 1.30 ± 0.02 through travel). Chassis COM sits 0.55 m above ground at zero compression.
- Render axle frame (RIDER_CHAIN.md) origin = axle midpoint at static sag = chassis-frame `(0.065, −0.213 −
  sag)`; `axleOrigin()` computes it as in v1 (round 8/10) so the chain and the render agree.
- **Combined COM at neutral (attack) pose:** target d ≈ 0.55 m ahead of the rear contact, h ≈ 0.79 m above
  ground (CONTRACT's "0.45 m above the axle line"). Hard-back: d ≈ 0.32, h ≈ 0.64; hard-forward: d ≈ 0.68,
  h ≈ 0.80 (from the pose table §9.1; the toy's realised values were 0.31/0.63 · 0.47/0.78 · 0.57/0.81, T0 —
  the pose table below is shifted 0.08 m forward vs the toy to hit the targets).

## 3. Integrator, tick rate, tick order

**Rate.** RedLynx ran one physics step per 60 Hz frame (R§1). We keep **120 Hz** (CONTRACT): a 1.3 m
wheelbase at 20 m/s moves 0.17 m per 120 Hz tick (0.33 at 60), the rear spring's period (~0.35 s) gets 42
ticks, and the rider snap (~0.15–0.25 s) gets 18–30 ticks so a one-tick-late snap is a ~4 % change, not 8 %.
240 Hz buys nothing visible and doubles the harness's hashing cost. Inputs are sampled once per tick; the
game may repeat a 60 Hz input for two ticks (it already does through `quantizeInput` + the recorder).

**Integration.** Semi-implicit Euler: forces → velocities, constraints on velocities, then positions. Position
error is corrected by **split impulses** (a separate position pass that does not inject energy), not by
Baumgarte in the velocity pass — v1's Baumgarte β 0.2 is a hidden energy source under bump-stop hits and
plank corners and is the origin of several "buck" findings (physics.md rounds 6–7).

**Tick order** (`step(input)`):

```
0  restart edge → fault('restart'), reset(checkpoint), return
1  input      quantised (u8/u8/i8) — the applied values are stored in F (S_IN_*)
2  rider pose target update (rate-limited toward the lean's pose; §9.2)     [reads F only]
3  forces     gravity; suspension spring/damper (both wheels read pre-impulse rates first, as v1);
              engine torque on Wr (+ reaction on C); engine braking; aero drag on C at its COM
              plus on R at its COM (two real forces, no field); rider servo force/torque pairs (§9.3);
              attitude torque τ_att on C (§9.4); rolling resistance
4  collide    wheels vs track, chassis hard points vs track, rider sensors vs track (crash test only),
              seesaw/drum bodies; speculative margin 2 cm + |v|dt
5  solve      velocity pass, 6 iterations, fixed order: sliders (bilateral) → slider travel limits →
              seesaw limits → contacts (normal then tyre friction) → brakes (spin locks) → ragdoll joints
6  integrate  x += v dt; θ += ω dt
7  position   2 iterations of split-impulse correction for penetrations > slop (5 mm) and slider drift
8  derive     compression, grounded flags, land events, slip, checkpoint/finish, crash → ragdoll, sleep,
              rng advance, tick++
```

No warm starting (no accumulated impulses cross a tick; v1 rule kept). Anything read in step k that was
written in step k−1 is in `F`/`U` and is enumerated in §12.

## 4. Constraint solver

Sequential impulses, as v1 (`bike.ts` §2.2 style), with these changes:

- **Sliders** (wheel on a line in chassis space): bilateral perpendicular constraint; travel limits are
  unilateral with a *restitution-free* bump stop — the stop is a stiff spring segment in the force pass
  (§5), not a velocity clamp with restitution. Position drift of the slider is fixed in the position pass.
- **Contacts**: accumulated normal impulse ≥ 0, restitution 0 for bike bodies, 0.15 ragdoll; friction after
  normal within each iteration; tyre contacts use the brush model (§6) as the friction bound.
- **Brakes**: angular constraint wheel↔chassis, impulse-capped at `brake · maxNm_i · dt` (§8).
- **Rider servo is not a constraint** (forces in step 3). This keeps the rider soft under impact (he can be
  thrown, which is the crash) and avoids the v1 tether/leg-stop unilateral constraints and their hidden
  `legLambda` state.
- Iterations: 6 velocity, 2 position. Fixed counts, fixed order, no early-out.

## 5. Suspension

Per wheel, along the slider axis, force on the chassis (reaction on the wheel):

`F_s = k·(c + c_pre) + c_damp(ċ)·ċ + k_stop·max(0, c − 0.85·travel)³/travel²`

| | rear | front |
|--|--|--|
| axis (chassis frame, wheel moves this way when compressing) | norm(0.12, 0.99) | norm(−0.40, 0.92) |
| travel | 0.26 m | 0.24 m |
| k | 8 500 N/m | 7 500 N/m |
| preload `c_pre` | 0.02 m | 0.02 m |
| c_damp compression / rebound | 650 / 950 N s/m | 550 / 800 N s/m |
| bump stop `k_stop` (cubic, from 85 % travel) | 250 kN/m | 250 kN/m |
| static sag at neutral pose (target) | 30 % (78 mm) | 26 % (62 mm) |
| loaded natural frequency (sprung share on that wheel) | ≈ 1.6 Hz | ≈ 1.7 Hz |

Rationale: a soft, long-travel rear with ~30 % sag is what "load the suspension… when it's at its maximum
release" (R§4.3) needs — the hop's stored energy is ½ k c² ≈ ½ · 8500 · 0.2² ≈ 170 J at 0.2 m, i.e. ~0.23 m
of lift for 75 kg, before the rider's own velocity is added. Damping ratios ~0.35 compression / 0.5 rebound
(one visible rebound cycle, evolution-gameplay obs 11). The damper impulse is clamped so it cannot reverse
the compression rate within a tick (v1 rule kept). Anti-squat: the rear axis tilted 7 deg back so thrust
mildly extends the rear (real chain pull); v1's finding that anti-squat "costs the visible squat" was at 1.4 g
with a 12 kN/m spring — at these rates the squat under full gas is ~35 % of travel and visible.

## 6. Tyre and contact

**Geometry.** Wheels are circles (r 0.34) against polylines (segments with left normals, solid on the right
of travel), circles (static or rolling drums) and OBBs, via the v1 `collision.ts` grid and narrowphase. Manifold
normal from the segment (not the vertex) whenever the wheel centre projects inside the segment; vertex normals
only at true corners.

**One-way polylines and the open end (A§2.12).** A one-way segment collides when the wheel centre was on the
normal side *at the previous tick* (`U_PREV_SIDE_*` per wheel per segment id is not needed: store the wheel's
previous centre `F` and re-test against the segment each tick — position history, no per-segment memory). The
**end vertex** of a one-way polyline is a two-sided point collider of radius 0 within one tyre radius of the
end (a wheel arriving at the board's end from below is stopped by the end, not passed through and lifted),
and the board's underside beyond that is not solid. The tracks compiler must guarantee one-way boards are
≥ 0.02 m thick in `placed` so the render matches the collision: what you see is what you ride. No
`STRADDLE_LIFT`.

**Brush model (longitudinal).** For a grounded wheel with normal load N (this tick's accumulated normal
impulse / dt from the *previous iteration*, first iteration uses the spring force projected on the normal):

```
v_slip = ω·r − v_patch·t            (>0 wheelspin, <0 lock-up)
μ      = μ_surface · (1 − 0.12·clamp(N/(m_total·g) − 0.5, 0, 1))   (mild load sensitivity)
F_t    = clamp(C_s · v_slip, −μN, +μN)
```

`C_s` = 9 000 N per m/s (soft enough that the friction cone, not the stiffness, sets the peak); no sliding
fall-off (Trials grip is flat and high, R§4.10 — walls are ridden). `μ_surface`: dirt 1.9, wood 1.8,
concrete 2.0, rubber 2.1, metal 1.4, grate 1.7, stone 1.9, snow 0.9. tan 60 = 1.73 < 1.8 (60 deg planks are
sustained), tan 65 = 2.14 > 2.0 (65 stalls) — the CONTRACT ridge, as a designed number. Rolling resistance
0.012 N r. Chassis hard points: Coulomb μ 0.5, no restitution.

Applied as the friction bound inside the contact iteration; the engine's torque is on the wheel body already,
so a spinning tyre is a wheel whose ω outran the cone — no previous-tick κ.

## 7. Engine, gearing, limiter, clutch, airborne

- **Rim thrust curve** (what the player feels; torque = thrust × r / gear is the engine's business):
  `F_rim(v_wheel) = throttleEff · F_peak · f(v)`, with `f` piecewise linear on wheel-rim speed:

  | v (m/s) | 0 | 4 | 8 | 12 | 17 | 20 (limiter) |
  |--|--|--|--|--|--|--|
  | mid bike `f` | 0.85 | 1.0 | 1.0 | 0.70 | 0.48 | 0.35 → 0 |

  `F_peak` mid bike **880 N** (a_peak/g = 0.62 at 145 kg). Toy, run 5 (`toy-v2/run5-…`): 0–16 m/s in
  **4.0 / 3.9 / 3.7 s at lean +0.25 / +0.5 / +1**, top 20.0; at lean 0 the front lifts into a 58 deg
  wheelie that does not loop and the bike reaches 15.5 m/s in 6 s. (Run 4 at 780 N with the curve falling
  from 4 m/s: no lift at lean 0, 0–16 in 5.1 s — the calmer alternative, kept as the Rookie row.) Top
  20 m/s. **[R§2, R§5]** "the 450 takes a second or two longer to get up to speed". The curve is
  constant-power-like above 8 m/s (F·v ≈ 8–9 kW at the rim, a 25–30 hp trials engine after losses).
  a_peak/g = 0.62 is just below the neutral pose's static d/h = 0.67 (T0 run 4), but the squat and the
  rider's lag under acceleration lower the dynamic threshold, so full gas at lean 0 *does* lift the front —
  deliberately (§10).
- **Throttle**: quantised input → `throttleEff` with a first-order lag τ = 40 ms (fuel/airbox), no other
  shaping. Idle 1500 rpm, redline 10 000, limiter cut at 10 000 / re-arm 9 500 (CONTRACT; audio consumes
  `state.engine`). rpm = `max(idle, ω_rear·gear·60/2π)` with `gear` chosen so 20 m/s = 10 000 rpm
  (gear ≈ 17.8); below 7 m/s a slipping-clutch rpm `idle + throttleEff·(3500 − idle)` is *reported* for
  audio and has no dynamic effect — the thrust curve already encodes low-speed torque.
- **Engine braking**: off throttle, torque on the rear `−0.06 · F_peak · r · clamp(v/5, −1, 1) · (1 −
  throttleEff)`; on the ground and in the air alike (R§4.10 "accelerating downhill acts like braking").
- **Reaction**: every engine torque on `Wr` has its equal and opposite on `C` — this is the in-air nose-up of
  throttle (R§4.7) and the squat on the ground. When the rear is off the ground the wheel spins up to the
  limiter in ~0.4 s (I 0.55, torque ~265 N m): the nose-up impulse is bounded by the limiter (≈ +14 deg in
  0.5 s at 8 m/s in the toy, T5), then nothing — matches v1's and the community's observation that throttle
  at top rpm does nothing in the air.
- **Reverse**: not in v2 (no documented technique needs it); brake held at rest does nothing.

## 8. Brakes

One input `brake` (quantised, ≥ 3 levels honoured), first-order lag 30 ms, split **front 55 % / rear 45 %**
of `brakeMaxNm` = **560 Nm total** (front 310, rear 250). Toy: at 520 Nm / 60-40 a full brake from 10 m/s
stopped in 5.7 m hard-back / 7.0 m neutral and endoed hard-forward (T6 run 4); at 650 Nm / 60-40 it stopped
in 5.3 m hard-back but **stoppied at neutral** (rear off 2.5 s, −58 deg, 13 m — T6 run 5). The static
rear-lift threshold is a/g = (L − d)/h = 1.01 at neutral and 1.53 hard-back, so any brake that meets the
CONTRACT's 4.5 m (1.13 g average) *must* lift the rear at neutral — the CONTRACT number is a hard-back
number (§16). 560 Nm total is ≈ 1.15 g of torque capacity; the front's share (0.63 g alone) keeps a neutral
full grab a settling stoppie rather than an endo, and hard-back stops in ≈ 5 m. Applied as a torque-capped lock between wheel and
chassis (v1 mechanism). **No anti-endo cap, no air cap, no load feed-forward.** Consequences, by design:

- On the ground, full brake from 10 m/s at neutral pose stops in ≈ 4.5–5 m with the rear light; hard-forward
  pose + full brake lifts the rear (the endo, R§4.10 — "a hard stab flips you forward"); hard-back keeps it
  down. Trials' "pump the brake in light rapid taps" is the player's job.
- In the air, braking a wheel spinning at road speed dumps `I ω` into the chassis: rear 0.55 × 59 rad/s
  (20 m/s) = 32 N m s, front 27, total 59 N m s over ~90 kg m² ≈ −37 deg/s worth — spread over the brake's
  lock time. Toy: −17 deg in 0.5 s at 8 m/s (T5). At 20 m/s it is roughly 2.5× that. This *is* Trials'
  "hit brake off a jump to pitch the front end down", and it scaling with speed is correct.

## 9. Rider model

### 9.1 Pose table (targets, chassis frame; from RIDER_CHAIN.md canonical poses)

The rider body's COM is 0.10 m above and 0.03 m ahead of the hips; body angle ψ is the torso angle from
horizontal minus 45 deg (so ψ = 0 is the attack torso). Chassis-frame = axle-frame − (0.065, −0.213 − sag).

| lean | pose | hips (axle x, y) | COM offset from chassis COM (x, y) | ψ (rad) |
|--|--|--|--|--|
| −1.0 | hang_back | (−0.57, 0.60) | (−0.44, 0.37) | +0.17 |
| −0.5 | (blend) | (−0.43, 0.73) | (−0.30, 0.50) | +0.08 |
| 0.0 | stand_attack | (−0.28, 0.85) | (−0.15, 0.62) | 0.00 |
| +0.5 | (blend) | (−0.25, 0.88) | (−0.12, 0.65) | −0.12 |
| +1.0 | forward_attack | (−0.22, 0.90) | (−0.09, 0.67) | −0.24 |

Blending is linear in lean between rows (the chain's `backEase` is a render curve and stays in the render;
physics targets are linear so the response is monotone). **There is no lean-crouch** (A§2.9): the hips drop
0.25 m from attack to hang-back because that is the drawn pose, and rise 0.05 m to forward-attack. The
"crouch" the render draws is the *measured* rider height below target (§9.5), not an input.

### 9.2 Target motion: rate limit and hysteresis-free

The pose target `T = (x_t, y_t, ψ_t)` moves toward the lean's pose `P(lean)` each tick with a speed cap:
linear **3.0 m/s**, angular **6 rad/s** (a full back→forward swing of 0.35 m / 0.41 rad takes ≈ 0.12 s at
the cap; the *body* lags behind by the servo dynamics below, giving the observed 0.10–0.15 s pose lag and
0.2–0.3 s snap). A digital input therefore produces a bounded body motion, an analogue input a slower one;
Rising's five "positions" (R§3) fall out: releasing the stick from −1 sends T back toward 0 at the cap.

### 9.3 Servo: bounded internal forces

Force on the rider (reaction on the chassis at the target point, i.e. where hands and feet attach):

```
F = k_p (T_world − x_R) + k_d (v_T − v_R)         |F| ≤ F_max
τ = k_ψ (θ_C + ψ_t − ψ_R) + c_ψ (ω_C − ω_R)        |τ| ≤ τ_max
```

`k_p` 45 000 N/m, `k_d` 4 200 N s/m, **`F_max` 2 600 N** (≈ 3.5 × body weight — what legs and arms can push),
`k_ψ` 2 500 Nm/rad, `c_ψ` 180 Nm s, `τ_max` 300 Nm. The reaction force acts on the chassis at the target
point; the reaction torque on the chassis about its COM. Both are pairs: momentum and angular momentum of
rider+bike are conserved by the servo. **Legs line:** the linear force's *point of application on the
chassis* is the peg point (axle-frame (−0.14, 0.02)) for the component along the hip→peg direction, and the
grip point (0.27, 0.78) for the remainder — so a push "down the legs" at 70 deg of pitch reacts on the pegs,
which is what makes the rear-wheel pogo (R§4.4) and the hop's rear lift work without a special axis.

Why a force cap and not a constraint: (a) the rider can be *thrown* — over the bars or off the back — which
is the honest crash trigger; (b) a bounded force makes the response to a one-quantum input change bounded
(§14.1); (c) landing loads above 2 600 N compress the rider toward the bike (absorption) instead of
transmitting a spike.

**Free fall:** the servo keeps the rider at the target relative to the chassis; the pair does nothing to the
system. A pose *change* in the air redistributes angular momentum: T2/T5 show −38 deg (lean +1) and +34
deg (lean −1) in 0.5 s at 8 m/s with the attitude torque, and the pure-servo share of that is ≈ ±12–20 deg
(toy-run2 T5: −21 / +12 before τ_att was added; sign there was dominated by the COM translation, which is why
§9.4 exists).

### 9.4 The declared attitude torque

`τ_att = −K_att · lean − c_att · ω_C`, on the chassis about its COM, **not paired** (external). `K_att` mid
bike **180 Nm**, `c_att` 20 Nm s. It exists because Trials' air control (R§4.7: sustained flips by holding
lean; "the longer you hold it, the faster your rotation") cannot come from internal forces (angular momentum
conservation gives a finite angle per pose change, not a rate), and every Trials bike has this as a stat
(Foxbat "fantastic in-air control", Frontier "lean"). Design rules: it is *always on* (no air/ground mode;
on the ground 180 Nm is ~20 % of the thrust moment at full gas, so lean-back helps a wheelie exactly as the
lessons say), it is *linear in lean*, it is *damped* (flips saturate at ~2 rev/s, `K/c` = 9 rad/s), and it is
*shown* (HUD, §15). With `K_att` = 0 the model is fully conservative and still hops, wheelies and lands; K_att
is the one feel knob that is admitted to be a game rule.

### 9.5 Emergent techniques (how each falls out; targets in §14.2)

- **Wheelie / balance.** Throttle moment F·h vs gravity moment m g d(θ); lean moves d by ±0.13 m and h by
  ∓0.12 m (table 9.1) — 45–75 deg balance points are reachable with lean −0.5…−1 (T1: lean −0.5 tops at 44
  deg then holds; lean −1 at 71). Throttle in the balance band changes the rear load and F·h — the fast loop.
- **Bunny hop** (R§4.3). Lean −1 with throttle: T drops 0.25 m and back 0.29 m; the body follows at ≤ 3 m/s
  with |F| ≤ 2.6 kN; stopping 75 kg falling at ~1.5 m/s in ~0.1 s adds ~1.1 kN to the rear through the pegs;
  the rear spring compresses to 60–80 % of travel and the front lifts. Snap to +1: T rises 0.30 m and moves
  forward 0.35 m; the servo pushes the body up-and-forward at up to 2.6 kN, the reaction pushes the chassis
  down-and-back *until the body passes the target* (≈ 0.15 s), then pulls the chassis up after the body while
  the rear spring returns its stored energy; the forward body rotation (+0.41 rad in ≈ 0.1 s) exchanges angular
  momentum and drops the nose. Toy at the design parameters (T4 run 4, no tuning): rear apex **0.32–0.40 m**,
  front 0.3–0.9 m depending on throttle through the snap, both-wheels-off ≤ 0.05 s (the front stays up
  longer than the rear comes off — the front-wheel-lift shape of clip 01, where the rear pops ≤ 4 cm);
  **ordering correct everywhere**:
  monotone in preload to ~0.45 s (0.16 → 0.40 m), in snap speed to 3 m/s (0.12 → 0.33 m), in snap magnitude
  (−0.5 → +1: 0.10 → 0.33 m), and throttle through the snap adds height (0.27 → 0.34 m). The apex is below
  the §14.2 target (0.45–0.65 m rear); the levers, in order, are `F_max` (2 600 → up to 3 200 N, still
  ≤ 4.4 × body weight), the pose travel (hang_back → forward_attack is fixed by the chain; the *target*
  may overshoot the chain pose by ≤ 0.05 m for ≤ 0.1 s), `targetRateLin` (3 → 4 m/s) and rear `k`. With
  the earlier stronger servo (run 3: `F_max` 4 000, rate 4.5, throttle 0.8 through) the toy gave 0.50–0.53 m
  rear and 0.3 s both-off, so the target is reachable inside the model's own rules. Tuck (second lean −1 in
  the air) raises the rear ~0.1 m relative to the COM path (the servo pulls the chassis up toward the body
  while the body is the reference).
- **Rear-wheel hop.** At 60–80 deg pitch the hip→peg line is within ~20 deg of vertical; a −1→+1 snap pushes
  the rear into the ground along that line and the spring returns it: 0.15–0.3 m pogo hops at a 0.7–1 s
  cadence (R§4.4, Evolution clip 05), and with a full 0.33 s pre-load and throttle a single hop of ≥ 1 m
  onto a platform (clip 04: 1.1 s airtime). The clip-04 rise reads 1.6–2.3 m if the pixel scale is right,
  which a 75 kg rider pushing 2.6 kN for 0.2 s cannot give (Δv ≈ 3.5 m/s on the system → 0.6 m); if that
  number survives a re-measure with a known length in frame, the model's honest levers are `F_max` (to
  ≈ 3.5 kN) and the spring's stored energy, not gravity (R§9). No special axis.
- **Landing absorption.** Rear-first at 20–30 deg nose-up: the rear spring takes the vertical momentum; the
  servo's cap (2.6 kN) means the rider "sinks" toward the bike above ~3.5 × body weight — the crouch the render
  draws — and returns at the servo's natural rate (~0.3 s). Lean forward at touchdown moves d ahead so the
  nose-down rotation stops at level; lean back leaves it behind and the rebound + thrust loops it (R§4.8).
- **Snap-forward corrects a rising front** (R§4.6). T2 run 4: full-throttle wheelie from hard-back, snap to
  +1 with the throttle *held* when the pitch passes 20 / 30 / 40 / 50 / 60 deg: the nose peaks 0.1 s later at
  34 / 42 / 51 / 62 / 71 deg, is at 25 / 32 / 37 / 35 / 28 by 0.25 s and at −3 / 2 / 2 / −11 / −3 by 0.5 s,
  no loop from any angle up to 60. From lean −0.5 at 30 / 40: 39 / 49 peak, 3 / −6 at 0.5 s. Two effects:
  the body rotation's angular impulse and the attitude torque (fast), then d/h (slow). v1 could not do this
  at any angle ≥ 20 deg on the honest preset (A§2.1).
- **Climbs.** tan 60 < μ_wood: sustained with the rider hard-forward (front hovering, d/h = 0.86 in the
  slope frame); 65 deg stalls on grip and rolls back; the base corner is a real corner (the round-4 drum
  geometry note holds).
- **Wall techniques** (R§4.10) become possible with μ ≥ 1.8 and the rider body able to hang over the front;
  not a target for the curriculum but not forbidden by the model.

## 10. Stability analysis of the accelerating bike with weight forward

Rigid-body about the rear contact P (both wheels down, front just lifting): let the combined COM be at
(d, h) from P in the world frame, thrust F at P, normal N_f at the front. Front lifts when N_f → 0:
`F·h = m g d` at the moment of lift (a = F/m, so **a_crit = g·d/h**). Once lifting, with θ the pitch, `d(θ)
= d₀ cos θ − h₀ sin θ`, `h(θ) = d₀ sin θ + h₀ cos θ`, and the pitch equation about P is

`I_P θ̈ = F(v)·h(θ) − m g d(θ)`  (I_P ≈ 145 kg × (d₀² + h₀²) + own inertias ≈ 130 kg m²).

Equilibrium: `F(v) = m g d(θ*)/h(θ*)`. Since d/h decreases monotonically with θ (from d₀/h₀ at θ = 0 to 0 at
the balance angle tan θ_b = d₀/h₀), and F(v) *decreases with v* (§7), the equilibrium pitch **falls with
speed**: a full-throttle launch lifts the front to θ* where `F(v)/(m g) = d(θ*)/h(θ*)`, and as v rises θ*
comes back down — a self-limiting wheelie. Linearising about θ*: `I_P δθ̈ = [F h'(θ*) − m g d'(θ*)] δθ` with
`h' = d`, `d' = −h`: coefficient `F d + m g h > 0` → the equilibrium is *unstable in pitch alone* (as for any
wheelie), with e-fold time `√(I_P/(F d + m g h))` ≈ 0.33 s at lean 0. What makes riding stable is the
*controller*, and the design gives the controller three properties: (1) the lean input moves d₀/h₀ from 0.57
(hard-back) through 0.67 (neutral) to 0.78 (hard-forward) (T0 run 4). With the table's 880 N engine (T1
run 5): **lean +0.25 / +0.5 / +1 never lift** (6.6 / 6.0 / 5.9 deg, 0–16 in 4.0 / 3.9 / 3.7 s); **lean 0
lifts into a 58 deg wheelie that does not loop** and rides on at 5 m/s, settling as speed builds; lean −0.25
wheelies to 73 deg and holds; lean −0.5 loops after 3.4 s; **lean −1 loops in 0.7 s**. (With the calmer 780 N
Rookie curve, run 4: lean 0 tops at 6.5 deg, −0.25 at 40, −0.5 at 57 and holds, −1 loops.) That is the Trials
ladder in the sources: "apply full gas… you'll often find yourself flipping over. Try to get in the habit of
applying some forward lean" (Mantis), "lean back with a little throttle" for the wheelie, "if you find
yourself flipping backwards, lean forward a little" (R§4.1–4.2), and it is *monotone in lean* — the property
v1 lacked (A§2.7, P6); (2) a forward pose
change also removes angular momentum (§9.3) and the attitude torque reverses sign — a derivative-like action
that is what makes the T2 recoveries possible; (3) thrust falls with v, so any lift decays as speed builds.
Full gas from rest at neutral lean **never loops** on the mid bike (it wheelies and self-limits); the
wheelie is held or put down by leaning — Trials' described behaviour (R§4.2, R§4.6). The Rookie row (0.53 g,
curve falling from 4 m/s) does not lift at neutral at all; the Pro row (0.70 g) lifts harder and loops at
neutral if held ("Simply holding accelerate from a starting point will tip the bike over" — Donkey), which is
a bike property, not a mode. The linearised e-fold time at the balance point is ≈ 0.33 s
(σ = √((F d + m g h)/I_P)); the lean input's authority (d/h span 0.21 ≈ ±1.1 m/s² of a_crit, plus
±180 Nm ≈ ±1.4 rad/s² directly) is an order of magnitude more than the drift over one human reaction time
(0.2 s → e^0.6 ≈ 1.8× of a 1 deg error), so a player closes the loop at 5–10 Hz decision rates with margin
— that is the "learnable" balance, and the v1 CONTRACT row "PD holds indefinitely" is replaced by a
lean-actuated controller test (§14.2).

## 11. Crash rules

Fault when: head sensor (r 0.15) or either torso sensor (r 0.13) on the **drawn chain** touches any collider
(the v1 chain port and sensor placement are kept); any body inside a hazard AABB; any body below `oobY`;
`checkpoint`/`finish` semantics unchanged. **Removed:** tether-distance and tether-force rules. A rider thrown
off the bike is detected by the sensors within a few ticks (the body falls into the ground or the bike);
until then it is not a fault, which matches Trials' "rug burn" and fender-grab edge cases (R§4.9). Ragdoll
spawn from the chain with the rider body's actual velocity (no ½ frame spin heuristic needed: the rider body
has its own ω).

## 12. Determinism and snapshot rules

- All mutable state in `F` (Float64Array) and `U` (Uint8Array), SoA bodies, as v1. Cross-tick scalars in `F`:
  tick, time, checkpoint, finishTime, throttleEff, brakeEff, pose target (x_t, y_t, ψ_t), rear/front
  compression and rate of last tick (for the damper clamp only), air-tick counters (for `land` events only —
  they change no force), rng (4), crash timer, ragdoll rest counters, previous wheel centres (one-way side
  test). **Nothing else.** In particular no hop phase, no slope memories, no airborne blend, no κ memory, no
  leg stop. `U`: finished, fault, limiter latch, restart latch, grounded flags, surface ids, ragdoll, asleep.
- `snapshot()` = copies of `F`,`U`; `restore()` bit-exact; `snapshot.test.ts` (beam-search load, foreign
  snapshots, used worlds) kept verbatim as the acceptance test.
- Math: `dmath.ts` for sin/cos/atan2/sqrt-free paths; fixed iteration counts and order; no `Map` iteration,
  no sorting, no `Math.random`, no time.
- Inputs are quantised (u8 throttle, u8 brake, i8 lean) *before* `step()`; `state.input` reports the applied
  quanta. The physics never sees a float the recording cannot store.
- Restart: `reset(cp)` rebuilds every body from the spawn in one tick (v1 `placeBike` kept; the rider is
  placed at the neutral target with zero relative velocity).

## 13. Parameter table (initial values; `tuning.ts` v2)

```
gravity 9.81
chassis  mass 58  inertia 11  hardpoints as v1 (plate (−0.05,−0.14) r0.10, tail, crown, bars)  mu 0.5
wheel    r 0.34  rear mass 8 / I 0.55   front mass 7 / I 0.45   wheelbase 1.30
susp rear  axle (−0.585,−0.21) axis norm(0.12,0.99)  travel 0.26 k 8500 pre 0.02 cComp 650 cReb 950 kStop 250e3@0.85
susp front axle (+0.715,−0.215) axis norm(−0.40,0.92) travel 0.24 k 7500 pre 0.02 cComp 550 cReb 800 kStop 250e3@0.85
tyre     Cs 9000 N/(m/s)  loadSens 0.12  rollRes 0.012
         mu: dirt 1.9 wood 1.8 concrete 2.0 rubber 2.1 metal 1.4 grate 1.7 stone 1.9 snow 0.9
engine   Fpeak 880 N  curve v[0,4,8,12,17,20] f[.85,1,1,.70,.48,.35]  throttleTau 0.040  engineBrake 0.06
         idle 1500 limiter 10000/9500 gear 17.8 (reported rpm; audio)
brakes   total 560 Nm split F 0.55 / R 0.45  brakeTau 0.030
aero     CdA 0.75 (rho 1.225): F = 0.46 v|v| N, 60 % on chassis COM, 40 % on rider COM
rider    mass 75  inertia 9  pose table §9.1 (linear in lean)
         targetRateLin 3.0 m/s  targetRateAng 6 rad/s
         kp 45000 kd 4200 Fmax 2600   kpsi 2500 cpsi 180 tauMax 300
         legLine: peg (−0.14,0.02) grip (0.27,0.78) axle frame
         Katt 180 Nm  cAtt 20 Nm s
         sensors head r0.15, torso 2×r0.13 on the drawn chain (as v1)
solver   velIters 6  posIters 2  slop 0.005  specMargin 0.02  restitution 0 (bike) 0.15 (ragdoll)
ragdoll  as v1 (sleepAfter 3, mu 0.6, jointDamping 3, crash brakes 1 / 0.5)
drum     density 60
```

**Bike classes** (rows; the solver never branches on class):

| class | mass C | F_peak | top (m/s) | k rear/front | K_att | wheelbase | note |
|--|--|--|--|--|--|--|--|
| Rookie ("Squid/Rhino") | 62 | 780 (0.53 g), curve f[.85,1,.9,.62,.42,.30] at v[0,4,7,12,17,20] (run 4) | 18 | 8500 / 7500 | 150 | 1.32 | heavier, softer, slower, calmer; does not lift at neutral (6.5 deg), wheelies at −0.25 |
| mid (reference row above) | 58 | 880 (0.62 g) | 20 | 8500 / 7500 | 180 | 1.30 | the numbers every FEEL row is stated for |
| Pro ("Mantis/Phoenix") | 54 | 1000 (0.70 g) | 21 | 9500 / 8500 | 220 | 1.28 | lifts the front at neutral full gas (a_crit 0.67 g); "get in the habit of applying some forward lean" |

## 14. Validation suite (`src/physics/*.test.ts`, v2)

### 14.1 Per-tick property tests (run on flat dirt, a 30 deg kicker, the 60 deg plank and the test level)

- **Determinism**: two worlds, same inputs, hash-equal every tick for 3000 ticks incl. crash+restart;
  `restore(snapshot())` at 13 points then 400 ticks hash-equal; foreign snapshots (v1 tests kept).
- **Bounded response**: for 200 random reachable states s and every input quantum perturbation δ ∈ {±1
  throttle, ±1 brake, ±1 lean}, `‖step(s, u+δ) − step(s, u)‖` ≤ ε per tick (ε: 0.02 m/s in COM velocity,
  0.05 rad/s in ω) and the 30-tick trajectory divergence ≤ 10 × that. No mode switches means this holds
  everywhere; the test is the proof.
- **Monotone throttle → acceleration** at fixed pose on flat ground, all speeds 0–19 m/s, both wheels down.
- **Monotone lean → equilibrium pitch** under constant throttle (0.4, 0.7, 1.0) from rest over 4 s: max
  pitch non-decreasing as lean goes +1 → −1 (A§2.7's P6 must pass).
- **No hidden state**: the `F` slot list of §12 is asserted in `snapshot.test.ts`; adding a slot fails the
  test until it is justified in this file.
- **Conservation**: in free flight with `K_att` = 0 and throttle/brake 0, total angular momentum of
  C+Wr+Wf+R about the system COM is constant to 1e−6 over 1 s under any lean sequence.

### 14.2 Feel envelope (targets from R§5–6; the test prints `FEEL name = value [band]` as v1)

| quantity | target | source |
|--|--|--|
| static sag rear / front | 28–32 % / 24–28 % | §5 |
| 0 → 16 m/s, mid bike, lean +0.25 (the launch pose) | 3.5–4.2 s | CONTRACT ≤ 3.5 (amend, §16); R§2; T1 run 5 (4.0 s) |
| top speed | 20 ± 0.5 m/s | CONTRACT |
| full throttle from rest, lean ≥ +0.25 | front lifts ≤ 10 deg, finishes 120 m | T1 run 5 (6.6 deg) |
| full throttle from rest, lean 0 | wheelie tops 45–65 deg, **never loops**, settles below 20 deg by 16 m/s | R§4.2; T1 run 5 (58 deg) |
| full throttle, lean −0.25 / −0.5 / −1 | 60–75 deg and holds ≥ 3 s / loops after ≥ 2 s / loops within 1 s (deliberate, monotone in lean) | T1 run 5 (73 / 3.4 s / 0.7 s); clip 03 |
| lean-actuated wheelie hold | a 10 Hz / 100 ms-latency controller acting on lean only (throttle fixed 0.5) holds 45 ± 8 deg for ≥ 10 s at 3–6 m/s | R§4.1 (corrections are body motion); §10 |
| snap-forward from a 30 deg wheelie, throttle held | pitch back below 15 deg within 0.5 s, no loop | R§4.6; T2 |
| brake 10 → 0 m/s, hard-back | ≤ 5.0 m, rear stays down or lifts ≤ 0.3 s | CONTRACT 4.5 (amend); T6 run 5 (5.3 m at 650 Nm) |
| brake 10 → 0 m/s, neutral | ≤ 7 m; rear lifts ≤ 0.6 s, pitch ≥ −25 deg, settles (a stoppie, not an endo) | R§4.10 "pump the brake"; T6 |
| brake, hard-forward | endos (rider over the bars) — the documented failure | R§4.10 |
| stationary flat hop, best preload (0.25–0.45 s) | rear apex **0.45–0.65 m**, front 0.6–0.9 m, both-off 0.35–0.6 s | inferred (no flat-ground rear-wheel hop in the corpus; `frame-analysis.md` revision note) |
| front-wheel lift onto a ledge at 1.5–2.5 m/s (the lesson-7 move) | crouch 0.6–0.8 s, extension 0.3–0.5 s, front reaches 18–25 deg at ≈ 15 deg/s, rear pops ≤ 0.1 m and lands first, front down ≈ 0.7 s later | clip 01 tracked: 0.73 / 0.40 s, 18 deg, ≤ 4 cm, 0.73 s |
| rear-wheel hop at 60 deg onto a platform (pole tops) | pre-load 0.25–0.4 s; airtime **≥ 0.8 s**; rear-axle rise ≥ 1.0 m with the pitch held 55–65 deg; rider dip → full extension at take-off | clip 04 tracked: 0.33 s, 1.1 s, 1.6–2.3 m (±25 %) — the upper number is the open question in R§9; 1.0 m is the floor the model must reach |
| hop monotonicity | apex increases with snap speed (1 → 4 m/s target rate) and with snap magnitude (0 → +1); one tick late/early changes apex ≤ 5 % | R§4.3, R§7; A§2.4 must not recur |
| rolling hop at 5 m/s onto a 0.9 m ledge | makeable with a held wheelie + snap; lands ≤ 30 deg nose-down | CONTRACT |
| rear-wheel pogo at 65 deg | ≥ 3 consecutive hops of ≥ 0.15 m at 0.7–1.2 s cadence with a scripted −1/+1 rhythm | R§4.4; Evolution clip 05 (a hop every 0.4–0.5 s) |
| rear-wheel balance, scripted lean only, throttle 0.3 | holds 30–45 deg for ≥ 3 s with corrections every 0.8–1.0 s | clips 03 (0.9 s live at 30–45), 14 (0.8–1.0 s cycle) |
| plank-to-plank jump: 49 deg plank, 4.5 m/s, throttle blip at the lip | nose drops ≈ 10 deg in the last 0.15 s on the plank as the front unloads; airtime 0.5–0.75 s; lands **front-first within ±10 deg of level** with no input; no rebound | clip 07 tracked (10 deg / 5 frames, 0.62 s, −5 deg) |
| drop-in, 2 treads (~2.5 m) with a ~9 m/s vertical launch | airtime 2.0–2.3 s; rear-first at 35–45 deg; front down within 0.15 s | clip 18 (2.13 s, timer) |
| 30 deg 1 m kicker at 10 m/s | airtime 0.9–1.2 s, launch pitch 30–40 deg, lands rear-first with lean 0 | inferred from the ballistics; Evolution obs 12 for the long flights |
| air control 0.5 s at 8 / 14 / 20 m/s | lean −1 +25…+40 deg; lean +1 −25…−40; throttle +8…+15 (0 at limiter); brake −12…−40 rising with speed; none ±5 | R§4.7; T5 |
| landing from 2 m at 6 m/s | rides away for pitch −20…+40; rear-first from 0 up; rider sinks 0.10–0.25 m, back in 0.3–0.5 s | R§4.8; evolution obs 11 |
| climb 55 / 60 / 65 deg wood plank | sustained / sustained (~1 wheelbase/s) / stalls and rolls back, no fault | clip 06; CONTRACT |
| µs/tick p95 | ≤ 40 riding, ≤ 80 ragdoll | CONTRACT |

### 14.3 Learnable tests

- **Same input → identical trajectory** (hash), including after `loadTrack` of the same track in a used world.
- **Proportional failure**: the reference hop script delayed by 1, 2, 4, 8 ticks gives apexes that decrease
  smoothly (each step ≤ 8 % lower, none a crash); the reference snap at half rate gives 55–75 % of the apex.
- **No knife edge in the input space**: sweep preload lean over {−1 … −0.3} in quanta and throttle over {0.2
  … 0.6}: apex is a continuous function (max jump between neighbours ≤ 0.03 m).
- **Same move, same result on any surface** (dirt/wood/concrete): apex within 5 %.

## 15. Physics test level (`lab-physics-test`)

**Geometry (≤ 120 m, flat dirt, one obstacle):**

```
x   0 –  40 m   run-up, flat, start at x = 2 (spawn on the flat, countdown as usual)
x  40 –  46 m   take-off: 6 m ramp rising 1.2 m (11.3 deg) with a 0.3 m flat lip at 46–46.3 m, wood
x  46.3–49.3 m  GAP, 3.0 m wide, floor at −1.5 m (hazard: none — landing short is a fall onto a
                mattress at −1.5 m, 'rubber' surface, and a ride back up a 15 deg return ramp to the run-up;
                no fault unless the rider hits the far wall's face with his body)
x  49.3 m       LANDING LEDGE: top at +1.6 m (0.4 m above the lip), 12 m long, concrete; its near face is
                vertical from −1.5 m to +1.6 m
x  61 – 100 m   run-out, flat at +1.6 m, dirt, with a 20×0.6 m cosine crest at 70–90 m (the "full gas over
                a crest" check) and the finish at x = 100
checkpoints:    x = 30 (before the ramp), x = 62 (after the ledge)
```

Why these numbers: at the lip, a rider arriving at 8–9 m/s who *rolls* leaves at 11 deg and clears 3.0 m
horizontally in 0.4 s while dropping 0.5 m → lands on the face 0.3 m below the ledge top: **rolling it fails,
survivably**. A correct hop from the lip (rear apex ≥ 0.45 m, front placed on the ledge) clears the 0.4 m
step with ≥ 0.1 m of margin at 6–9 m/s; a late/weak hop puts the rear on the ledge edge (a fender-grab-like
save is possible with throttle) or drops the rider onto the mattress. The crest at 70–90 m is where full gas
at neutral must not loop (A§2.5, P7) and where a lean-back wheelie over the crest is the fun line.
Attempts-band target: strangers median ≤ 4 attempts; bot skill 2 clears.

**HUD on this level only** (`meta.hints` = `['physics']`, read by the core-game owner's HUD):

- pitch (deg, signed), pitch rate (deg/s), speed (m/s) — numeric, top-left, monospace;
- rear / front compression bars (0–100 % travel) with the bump-stop zone marked, drawn beside each wheel;
- **rider COM offset**: a dot at the combined COM in world space plus a bar showing `d/h` vs the current
  thrust's `a/g` (the front lifts when the bar crosses) — the balance readout;
- pose target vs body: two small markers on the rider (target = hollow, body = filled), so lag is visible;
- `τ_att` as a signed bar (the declared torque), throttle and brake as bars, rear slip (m/s) numeric;
- last hop: preload depth (% travel), snap duration (ms), rear apex (m), airtime (s), landed pitch — held for
  3 s after each landing;
- everything is derived from `PhysicsState` + `debug()`; nothing is computed in the HUD.

## 16. Migration plan

1. **Interface unchanged.** `PhysicsWorld` (CONTRACT §2.3) is implemented by `createBikePhysics(hz, tuning)`
   with the same `PhysicsState`, events, `snapshot/restore`, `teleport`, `debug()`, `balancePitch()` (now
   computed from the pose table). `hopPhase` is kept in `PhysicsState` for wire compatibility and derived
   (`'preload'` while the pose target is below the neutral height and the rear compression is rising,
   `'push'` while the rider body's vertical velocity relative to the chassis is > 0.5 m/s and rising,
   `'recover'` for 0.4 s after both wheels leave, else `'idle'`) — audio/render consumers keep working.
   `RiderPose` (`lean`, `crouch`, `torsoPitch`, `armExtend`) is derived from the rider body: `lean` = body
   COM offset mapped back through the pose table, `crouch` = body height below the neutral target / 0.30,
   `torsoPitch` = ψ_R − ψ_t (the lag), `armExtend` from the hips→grip distance. Render's `PoseFollower` stays.
2. **Files.** New `src/physics/v2/` (`bike.ts`, `rider.ts`, `tyre.ts`, `engine.ts`, `tuning.ts`) behind the
   same barrel; `collision.ts`, `dmath.ts`, `testTracks.ts`, `controllers/` reused; `createBikePhysics` picks
   v2; v1 stays importable as `createBikePhysicsV1` for two rounds so the harness can A/B, then is deleted.
3. **Goldens.** Every replay golden changes (different plant). Protocol: freeze v2 after §14 passes, then the
   harness regenerates goldens with the bot and re-pins the gate; the *determinism* goldens (two runs equal,
   restore equal, foreign snapshots) carry over unchanged because they compare v2 with itself.
4. **Tracks.** The tracks owner re-measures section 0 of `tracks.md` from §14.2's printed FEEL numbers (hop
   apex, 0–16, brake distance, climb table) and re-authors kickers to 15–30 deg where they were built for the
   1.4 g plant. `lab-physics-test` is authored first and gates every later physics round (MEGA_PLAN P0).
5. **Rider chain.** `src/render/rider/pose.ts` and RIDER_CHAIN.md are unchanged; physics' `riderChain()` port
   now takes its hips from the rider body's actual position (not from a pose parameter), so the drawn rider
   *is* the simulated one and the crash sensors sit on him. The chain's torso angle comes from ψ_R.
6. **CONTRACT amendments to request** (core-game owner): §2.5 rows "COM 0.45 m above axle" (keep), "0 → 16
   ≤ 3.5 s" → "≤ 4.2 s at the launch pose (lean +0.25); v1's 1.4–2.2 s was a/g ≈ 1 and the loop-out cause",
   "stationary hop 0.55–0.75 m" → "0.45–0.65 m rear apex on flat ground, 0.35–0.6 s both-wheels-off; a
   rear-wheel hop at 60 deg rises ≥ 1.0 m in ≥ 0.8 s (clip 04)", "PD holds a wheelie indefinitely" → "a constant-input
   lean-back wheelie holds ≥ 3 s; a lean-actuated controller holds indefinitely", "brake ≤ 4.5 m" → "≤ 5.0 m
   hard-back; ≤ 7 m neutral with a settling stoppie; hard-forward endos", "climb" rows keep; `PhysicsState`
   gains `rider.body: {pos, angle, vel, angVel}` and `debug()` gains `attTorque`, `poseTarget`, `comDH` for
   the lab HUD. Nothing is removed.
7. **Order of work** (three rounds): R1 bodies, sliders, tyre, engine, brakes, rider servo, crash, snapshot
   tests green, flat-ground FEEL rows; R2 hop/pogo/landing rows, kicker, climbs, lab level with the tracks
   owner, HUD with core-game; R3 classes, bot/stranger on b1–b3 + lab, goldens regenerated, v1 removed.

## 17. What is deliberately not in v2

Wheelie control, speed governor, drag field, airborne blend, hop state machine, lean-crouch, torso store,
anti-endo cap, in-air brake cap, engine-brake fade, slope memories, κ memory, tether rules, straddle lift,
clutch spin-up timer, gravity scale, per-class solver branches. Each is named in `physics-audit.md` §3 with
the round that added it and the behaviour it hid; every one of those behaviours is now either a property of
the honest model (§9.5, §10) or a bike parameter (§13).
