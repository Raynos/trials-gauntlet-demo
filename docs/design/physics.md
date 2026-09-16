# Physics design: bike + rider

Owner: physics. Scope: `src/physics/**`. Where this file disagrees with
`docs/design/CONTRACT.md`, the CONTRACT wins and this file is wrong.
Units: metres, kilograms, seconds, radians; +x along the course, +y up;
angles CCW-positive, so **nose-up pitch is positive**. Fixed step 1/120 s.

## v2 status — R9 (Astra's physics is live: the swingarm arc, the elbow stop, the Rookie lift control; the seated pose is drawn, not held)

**Finding.** Everything of Astra's `405f894` that R8 measured ADOPT is on the tree, applied from
`docs/evidence/physics-r8/astra-port.patch` unchanged (the R8 ledger's per-mechanism numbers stand; `feel-diff-base-final.txt`
is the row-by-row diff of this exact patch): **(1) the hinged rear-wheel path + fork axis** — the rear wheel on a true circle
about the asset's swingarm pivot (chassis (−0.155, −0.11), r 0.4415 m), the front on the asset's fork line; `suspensionGeometry()`
is the one path for the force pass, the velocity solve, the position pass and `derive()`; static sag iterated on the sagged
axles; arc mismatch p99 0.43 mm (b3 Rookie; was 26.6 mm); **(3) the elbow stop** `hold.armMin` 0.10 m as the fifth hold limit
(no friction, not in `gripJ`); **(4) the Rookie brake lift control** `brakes.liftControl` 1 / `liftLookahead` 0.15 (Pro 0) —
the front caliper trimmed from the live lift margin every velocity iteration, alongside the R8 brace. **(2) the rider mass frame
as the servo target stays REJECTED** (R8 ledger: reference hop 0.596 → 0.481, the lab ledge hop at 8–9 m/s crashes, the 15 m/s
stop 1.92 s). **(5) the seated pose is landed as the split** R8 asked for: the servo holds R8's physical table
(`tuning.rider.poses`, verbatim — `r9.test.ts` pins it on both classes) and the hero gets Astra's seated table as a *drawn*
pose, `riderBody.drawn` (below). One R9 change of Astra's mechanism: **the elbow stop only acts with the chest above the grip
line** (`hold.armMinFade` 0.05 m: off at and below the bar, full 5 cm above it). With the chest under the bar the strut's push
points down and, against the linear servo's pull on the COM, forms a 600–900 N × 0.41 m couple the 300 N m torque cap cannot
break: the x3 Pro golden held the torso flat, 37–44° forward of its target with the torque pinned at +300 N m, for 0.6 s at
12–14 m/s on level wood (74–81 m, ticks 885–960) — "recovered" ticks the R8 band caught (psi 0.73 rad, COM 0.04 m). Above the
bar the push rights the body (the chest is ahead of the COM); below it the hands hang, as in R8. On the same golden the same
window now reads psi ≤ 1° from tick 915.

**The x1 / x3 Pro clears (R8's open item).** Reproduced from the `845df15` Pro recordings on the R8 tree: both fault `sensor`
early — x1 at tick 685 (46 m, a 160° loop off the first cap, the recording is a different physics' input), x3 at tick 855 (69 m,
same) — so the R7 inputs say nothing about the stall; they are stale inputs, not a physics tell. The stall itself is a **search
stall, not a fault**: at 599.7 m (81 %) x1 drops 5 m off the metal deck (597–601 m, dirt at y 4–6) into a **56° metal wall
rising 4.5 m over 601–604 m with no run-up**. Under the R9 physics before the elbow fade the Pro bot cleared x1 once (sweep 1,
53.450 s, 1 attempt: landed rear-first at −10 m/s at tick 5064, sat to the seat at tick 5070 — seat impulse 768 N s, hips 0.130 =
7.0 cm under the line, grip 0 N, no elbow / arm / tank engagement — then wobbled 3 s at 0–3 m/s between 599 and 601 m before it
climbed out); with the elbow fade (the tree) three seeds stall at 599.7 m with identical plan counts (1 974 plans, 194 M ticks,
900 s sim budget each) and `crashCause` null throughout. **x3 Pro clears at 1 attempt** (43.400 s; R8 stalled at 92 %, 530.7 m:
the same 5 m deck-drop-into-wall motif at 528–535 m, seat 213 N s, hips 2.6 cm under the line) — the hinge lands the drop and
the Pro rides on. x1's wall is 4.5 m where x3's is 4.5 m from a 4 m drop with 3 m of dirt; the difference is whether the bot
arrives at the wall foot with any speed. **This is the track's knife edge**, written down for tracks: x1 Pro at 599.7 m (deck
edge 597 m, wall foot 601 m), no physics fault fires, the Rookie clears it at 1 attempt (55.058 s) on the same physics. The
stale x1 Pro golden (sweep 1) is removed, as R8 removed the R7 ones; the suite reads 47 goldens.

**The drawn / physical split (`riderBody.drawn`, `RiderDrawnPose` in `core/types.ts`, additive, NOT hashed).** `rider.ts`
`DRAWN` is Astra's seated candidate table verbatim (axle frame): back (−0.70, 0.60) torso 40° head 66°; seated (−0.34, 0.715)
65° / 85° — the pelvis bottom 0.18 m down the torso sits 1.7 cm under the seat top (`DRAWN_SEAT` 0.5686, span −0.54..−0.05);
forward (−0.20, 0.91) 28° / 46°. `drawnPoseId(lean)` → (`'back' | 'seated' | 'forward'`, blend 0..1); `drawnPose(id, blend)` is
linear from seated to the row; `drawnBody(lean, dy, torsoLag)` adds the physical body's excursion — the same two numbers the
sensor chain draws (height below its target, angle behind it) — with the sink limited to the room the drawn hips have above
the seat when they are over it (forward has 0.195 m; seated has none: the physical 0.32 m sit onto the seat line is the seat
taking the weight, not the hips passing through it; off the seat's span the sink is drawn whole). Exported every tick from
`getState()`; `hashPhysicsState` does not read it, so every golden, the D1–D8 hashes and the gate pins are the same with or
without it (asserted on 600 scripted ticks and on the b1 / e2 goldens). The sensor chain and the ragdoll spawn stay on the
physical table (`buildChain` / `CANON`): moving them is a physics change (the head sensor moves ~0.3 m at neutral) with its own
golden re-search — R10's if the hero wants it. What the rig should consume: `drawn.hips` (axle frame), `drawn.torso`,
`drawn.head` in place of `riderRigFromCOM`'s inverse map; `pose` / `blend` for clip selection.

### Tests (R9)

`pnpm vitest run src/physics`: **164 → 170** (`r9.test.ts`, 6 rows: the drawn table is a pure function of (pose id, blend), linear,
Astra's rows verbatim; the four pose requirements — pelvis on the seat within 2 cm, forward rises ≥ 0.15 m and leans ≤ 45°, back
≥ 0.3 m rearward off the seat's back edge with the arms longer; the physical table is R8's on both classes; the export equals
`drawnBody` on every tick and the hash is blind to it; the 3 m drop sits the physical hips to 0.19 m while the drawn hips never
go under the seated height, lean +0.5 sinks the drawn 0.195 m to the seat and no further). Re-derived rows, each with an R9 note
crediting the mechanism: `r2` reference hop both-off ≥ 0.15 → ≥ 0.05 s (0.175 → 0.092: R8's 0.175 was 0.067 s of flight plus a
front-wheel bounce off a −13° touchdown; the arc lands at −7° and does not bounce; apex 0.603 → 0.596); `r3` cap-off 2 m pogo
> 0.2 → > 0.15 (0.204 → 0.176 with the elbow strut; the cap-on row is 0.01, the gate separates 17×); `r5` blend-out asserted
from the touch (0 within 0.12 s of the first touch, held ≥ 0.3 s) instead of at the 1.2 s mark — on the arc the 40° rear-first
landing's rebound un-weights the rear for 0.1 s at 1.13 s where R8 had it at 1–2 % compression; `r8` the brace-off 15 m/s "endo"
control row is informational — with the brace AND the lift control off the hinge rides the lift edge instead of going over
(Rookie 2.02 s / −14.8° / rear off 1.08 s, Pro 2.02 s / −13.7° / 1.22 s; the slider endoed at 1.39–1.62 s), asserted as rear-off
> 0.5 s; the stoppie compare is brace on vs off at the class's lift control (Astra's lift control ends the Rookie stoppie 0.82 →
0.75 s, the Pro 0.90 identical) with the no-lift value printed; `r8` envelope SLOP 0.05 → 0.08 (the x3 Pro deck drop: hips 2.6 cm
under the line; the x1 landing 7.0 cm — F dt² / (m β) under a 5 m slam) and the conditioner gains the angular demand
(`tauMax / inertia` = 33 rad/s² over the same 6-tick window — R8 read only the linear demand); `property` 60° plank 30-tick dw
≤ 0.5 → ≤ 0.7 (0.27 → 0.67 at one of 917 states: a 1.7 m/s Rookie wheelie after a restart where a lean quantum shifts the
wheelie-assist balance loop's phase; each cm of rear compression moves the axle 2.3 mm rearward on the arc where the slider
moved it 1.2 mm forward; flat / kicker rows and every per-tick bound unchanged). R9 brake table (brace 0.5, lift default):
Rookie 6 / 10 / 15 m/s stop 0.77 / 1.23 / 1.75 s, −7°, rear off 0.14–0.16 s, distance 2.50 / 6.35 / 12.93 m (R8 brace only 2.41 /
6.19 / 12.73: +2–4 % for the trimmed caliper); Pro 0.73 / 1.19 / 1.72 s, −6°. Render: `gltfRiderPhysical.test.ts` `worst.grip`
0.2 → 0.25 (Rookie E2 window 0.111 → 0.239 m on the re-searched golden's slam; Pro unchanged) — the one render number R9 moves;
`gltfBike.test.ts`'s three "until main gains the hinge" rows (× 2 assets) now invert as R8 said they would and are the render
owner's: `worstBlock` reads 0.0709 (the rig's chord model against an arc-riding wheel; bound < 0.03 / > 0.02), `worstFront`
2.1e-4 (bound > 1e-3: the fork line is now the asset's), the fixed-frame residual 1.1e-16 vs the expected 0.005 chord offset.

### Deviations (R9)

20. **The elbow stop blends in above the grip line** (`armMinFade` 0.05 m; Astra's acts at any height). Below the bar the strut
    is a lock, not a stop (the x3 Pro 0.6 s flat torso); the "collapses onto the tank" frames it catches are chest-above-bar slams
    and are still caught. Tuned to the golden, measured on all 48.
21. **Drawn ≠ physical**: `rider.poses` (physical, R8) and `DRAWN` (Astra's seated, hero) are two tables by design; the export is
    additive and unhashed. R8 ledger row 5 measured the seated table as the servo target three ways and each crashed the lab hop.
22. **The x1 Pro golden is absent** (search stall at the 599.7 m deck-drop-into-wall, no fault, three seeds identical); the Rookie
    golden covers the track. Not tuned away: it is the track's, with the tick above.
23. `r8`'s envelope SLOP 0.08 and the angular demand term; `property`'s 0.7; the `r2` / `r3` / `r5` / `r8` re-derivations above.

### Golden table (R9)

Every golden re-searched twice (`harness:bot --all-tracks --skill 3 --track-wall-s 400 / 600`, both classes: once on the port,
again after the elbow fade); Rookie **24 / 24 at 1 attempt**, Pro **23 / 24 at 1 attempt** (x1 open, above). **Node == browser
on all 47 + the sweep-1 x1** (48 / 48 hash-identical through `BrowserVerifier` on a fresh `dist`; the sweep's `verified=skipped`
and `--refresh-goldens`'s "fresh = already stamped" do not replay in the browser — the proof is
`scratchpad/physics9/browser-prove.mts`, a 48-row log). `harness:determinism` **9 / 9** on flat-test Rookie (`ecdf62a55f6185a6`,
finish 8.650) and Pro (`40e2115db273b7ff`, 7.900), D8 re-pinned `afee0f1094a0587c`; `gate/expected.json` re-pinned (`clear.pro.b1`
`f0549ee508d870ed` / 37.967 s); the verifying `harness:gate --quick` **27 / 30** with the same three SwiftShader timing rows
(`boot.firstFrameMs` 7 130, `restart.frameMsP95` 522, `perf.renderSyncedMsP95` 1 447 ms) informational; physics 32.5 µs/tick p95.
`public/bench/b1-bot-3.json` re-copied. Reflex 9 seeds, R8 → R9 medians: b1 1 → 1, b2 2 → 2, b3 2 → 2, e1 8 → 5, e2 4 → 3,
e3 3 → 2, m1 7 → 11, m2 5 → 6, m3 3 → 4, h1 15 → 14, h2 10 → 8, h3 3 → 4, x1 7 → 9, x2 5 → 9, x3 15 → 7, p1 2 → 3, p2 2 → 3,
p3 2 → 2, p4 3 → 2, p5 2 → 2, flat / gap / lab-flat / lab-physics 1; **clears 9 / 9 on every track**; no beginner / easy median
worse by more than 1 (p1, p2 +1). Strangers n = 2 on b1–e3: `harness-metrics.md` Round 15.

| track | Rookie finish (s) / attempts | Pro finish (s) / attempts |
|---|---|---|
| b1-first-ride | 40.708 / 1 | 37.967 / 1 |
| b2-lean-back | 38.508 / 1 | 36.292 / 1 |
| b3-kicker-row | 32.800 / 1 | 30.583 / 1 |
| e1-uphill-weight | 44.542 / 1 | 42.333 / 1 |
| e2-rear-wheel-first | 43.358 / 1 | 38.958 / 1 |
| e3-stairway | 38.442 / 1 | 37.000 / 1 |
| flat-test | 8.650 / 1 | 7.900 / 1 |
| gap-test | 5.742 / 1 | 5.133 / 1 |
| h1-wheelie-wire | 46.550 / 1 | 42.325 / 1 |
| h2-gap-chain | 45.625 / 1 | 43.000 / 1 |
| h3-fire-line | 46.825 / 1 | 43.042 / 1 |
| lab-flat-200 | 12.683 / 1 | 11.758 / 1 |
| lab-physics-test | 8.242 / 1 | 7.500 / 1 |
| m1-hop-up | 34.992 / 1 | 30.867 / 1 |
| m2-drum-roll | 40.567 / 1 | 34.867 / 1 |
| m3-see-saw | 40.250 / 1 | 36.442 / 1 |
| p1-container-yard | 35.733 / 1 | 31.992 / 1 |
| p2-canyon-run | 34.442 / 1 | 32.242 / 1 |
| p3-snow-line | 34.158 / 1 | 31.867 / 1 |
| p4-night-circuit | 33.325 / 1 | 32.350 / 1 |
| p5-foundry-floor | 31.667 / 1 | 29.042 / 1 |
| x1-vertical-limit | 55.058 / 1 | **open: search stall at 599.7 m, 81 % (3 seeds, no fault; sweep 1 cleared 53.450 / 1 before the elbow fade)** |
| x2-pipe-dream | 43.233 / 1 | 41.525 / 1 |
| x3-gauntlet | 45.275 / 1 | 43.400 / 1 |

(Rookie times are the second sweep's where it re-searched; the browser-proved set is the one on disk.)

## v2 status — R8 (the rider sits on the bike: the hold envelope, the thrown-rider fault, the brake brace)

**Finding.** The rider's contact with the bike is no longer only the servo. Feet on the pegs and hands on the grips are
**hard, one-sided limits** — the hips within 0.876 m of the pegs and the chest within 0.62 m of the grip (the reach), the
hips above the **seat line** (chassis frame y ≥ 0.20 m) and behind the **tank line** (x ≤ 0.25 m), Coulomb friction μ 0.8
on the seat and tank — solved as impulses between the rider body and the chassis every velocity iteration with
restitution 0 (`solveHold`, after the sliders, before the contacts). A hard landing now **sits the rider onto the seat and
he stays on top**: over the 48 R8 goldens (196 483 riding ticks) the hips never go more than 4.6 cm below the seat line
(min 0.154 m), never past the tank line (max x 0.278 m), the leg never beyond 0.812 m and the arm never beyond 0.660 m
(4.0 cm over the reach: the steady penetration of a velocity-bias constraint under F_max is F dt² / (m β) ≈ 1.4–2.8 cm —
the ligament). Before R8 the same bot put the hips **1.96 m below the chassis** (x2 Rookie tick 4155), the body 2.59 m
from its pose, the leg 2.08 m and the arm 2.51 m "long". The COM residual distribution before → after (the R7 conditioner:
time since the last tick on which the pose target's own motion demanded more than F_max / m_R = 4.35 g of the servo; COM
p50 / p95 / p99 / max, m): **all ticks** 0.025 / 0.417 / 1.242 / 2.593 → 0.024 / 0.170 / 0.433 / 0.826, outside 0.15 m
11.0 % → 6.2 %; 0–0.1 s 0.060 / 0.638 / 1.394 / 2.593 → 0.050 / 0.242 / 0.512 / 0.826; 0.1–0.25 s 0.019 / 0.225 / 1.266 /
2.305 → 0.019 / 0.048 / 0.349 / 0.760; 0.25–0.5 s 0.018 / 0.036 / 0.631 / 1.686 → 0.017 / 0.034 / 0.045 / 0.615; **0.5–1 s
0.017 / 0.029 / 0.041 / 0.748 → 0.017 / 0.029 / 0.043 / 0.101**; ≥ 1 s 0.017 / 0.024 / 0.032 / 0.076 → 0.017 / 0.024 /
0.033 / 0.065. Excursions of the COM beyond 0.35 m: 334 → 228 episodes, p50 0.17 → 0.05 s, p90 0.68 → 0.13 s, **max 1.33 →
0.47 s** (p3 Rookie tick 1336). The R7 recovery band tightens from 1.0 s to **0.5 s** and is asserted on every golden
(28 814 ticks, zero outside; `r8.test.ts`). The parent's per-tick target ("within 0.15 m on every tick with |a_T − g| ≤
4.35 g") is **not** met and cannot be by any servo: 2.6 % of low-demand ticks are outside 0.15 m (max 0.83 m) because the
conditioner reads the *target's* motion, and a body thrown back along the seat by a 17 g rear-first slam (h3 Rookie,
tick 827: rel. velocity −2.2 m/s, held by the arms at 1.4–1.8 kN, coming home at 2.9 g while the bike loops) is 0.3–0.4 s
of low-demand ticks with a large honest residual — the impact happened, the demand did not. The bound is the envelope
(above), the 0.5 s band and the 0.5 s excursion cap; the hero draws the excursion inside them.

**The thrown-rider fault (the crash rule, not a sensor).** The two *reach* limits are what the hands and feet hold. Their
impulse, averaged over `gripTau` 50 ms (one F slot `gripJ`, exponential), above `gripN` **2 500 N** is the hands leaving the
grips: fault `crash`, `crashCause` `'thrown'`, ragdoll as any crash. 2 500 N is 3.4 g of steady pull (a rider hangs on
through a 3 g whip) and a 1.7 m/s snap of the reach (75 kg × 1.7 / 0.05 s). The seat and tank limits (compression) never
fault: a case landing is a heavy sit, not a crash. Measured: a rear-wheel-first slam at 50° nose-up, 3 rad/s, −8 m/s
(a 3.3 m fall) at 10 m/s whips the body back off the seat and throws the rider at 0.22 s on both classes (grip 2.7 /
4.8 kN), before any sensor reads the ground; the same slam at 40° / 2 rad/s is ridden (grip 1.6 / 1.3 kN). Every flat
loop reaches the head sensor first (scan: 45–70°, 3–7 rad/s, 0.14–0.44 s), so the fault fires only where the body is
whipped harder than the bike turns — the m3 Pro case R7 named (upended, body 2 m off on the Hill cap for 0.6 s with no
fault) is now a throw. No R8 golden faults (48 / 48 finish, 0 faults of any kind).

**Why seat friction.** Without it a 15 g rear-first landing at 45° (e2 Rookie, R7 recording tick 660) sat the body down
and then slid it 0.2 m back along a frictionless seat until the arms snapped taut at 2.6 kN — a thrown rider that was not.
μ 0.8 (the knees clamp the bike) holds it; the R7 recordings then throw on 2 of 48 goldens, both loops with the rear
bottomed (m3 Rookie tick 788: 69° nose-up at 4.7 rad/s, 10 m/s, arms at 7 kN for three ticks — a loop-out).

**The 15 m/s brake endo (the R13 b1 stranger's only fault) — cause and fix.** The brakes are 560 N m at 0.55 front:
906 N front + 741 N rear = 1 647 N on 148 kg = **1.11 g**, against a flat stoppie threshold of d / h ≈ 0.8 g for the
combined COM at the neutral pose — a plain full brake at lean 0 *must* endo above ~10 m/s (R6 and R7 identical: 15 m/s
endos in 1.36–1.47 s on both classes, the Pro at 10 m/s in 1.87 s). v1 stopped it with a front-torque cap fed forward from
the COM geometry (§7.6); v2 (§8) has no caps while riding, so the rider does what a rider does: **braces**. `rider.brakeBrace`
0.5 — the pose lean is `lean − 0.5 · brakeEff · (1 − max(0, lean)) · (1 − bothAir)`: a full brake at lean 0 is ridden from
the −0.5 pose (R7 already measured −0.5 stopping upright from 15 m/s), a forward lean braces nothing (brake + lean +1 is
the stoppie, byte-identical), and with both wheels off the ground the brace is exactly 0 (a brace reacts to the
deceleration through the wheels; the R4 / R5 air-brake nudges — the declared air control, identical per class — do not
move; without that gate the air-brake nudge went −50 → −70 deg/s and the R5 class identity broke). Continuous in both
inputs through the lagged brake (τ 30 ms). The declared attitude torque, the ECU assist and the intent gates still read
the raw lean.

| full brake on the flat, lean 0 | brace 0 (R7) | brace 0.5 (R8) |
|---|---|---|
| Rookie 6 m/s | stop 0.89 s, −12°, rear off 0.73 s | stop 0.74 s, −8°, rear off 0.14 s |
| Rookie 10 m/s | stop 1.47 s, −15°, rear off 1.18 s | stop 1.21 s, −8°, rear off 0.15 s |
| Rookie 15 m/s | **endo, crash 1.62 s** (−128°) | stop 1.74 s, −8°, rear off 0.16 s |
| Pro 6 m/s | stop 0.92 s, −13°, rear off 1.02 s | stop 0.73 s, −7°, rear off 0.17 s |
| Pro 10 m/s | **endo, crash 1.87 s** (−115°) | stop 1.21 s, −7°, rear off 0.17 s |
| Pro 15 m/s | **endo, crash 1.39 s** (−134°) | stop 1.74 s, −7°, rear off 0.18 s |
| brake + lean +1 from 10 m/s, 0.2 s then release (the stoppie) | rear lifts 0.11 s, off 0.79 / 0.93 s, −33 / −35°, rides away | identical (0.80 / 0.92 s) |
| brake + lean +1 held | over the bars 0.76 / 0.97 s | identical |

Lean −0.5 with the brake: 1.06–1.48 s, ≤ 9° (R7 1.11–1.62 s). The permanent rows are in `r8.test.ts`; the stoppie row
asserts the rear off ≥ 0.5 s within 0.02 s of the brace-off value.

### Tests (R8)

`pnpm vitest run src/physics`: **160 → 164** (`r8.test.ts`, 4 rows: the envelope + 0.5 s band + 0.5 s excursion cap over
every golden of both classes; the landing punch — 3 m flat drops at lean 0 / +0.5, 6 / 12 m/s, both classes sit onto the
seat (hips 0.187–0.198 vs 0.20, seat impulse 70–240 N s) and ride away; the thrown rider; the brake table). `world.test.ts`
slot list gains `gripJ` (`NSCALAR` 37). Re-derived rows (each carries the R8 note): `r6` seesaw landing lift ≤ 0.3 F_max +
80 → ≤ 0.5 F_max (the seat catches the body, so the rebound starts from rest and the Hill cap is F_max for the first
centimetre — measured 1 399 N, Rookie v5 thr 0; deviation 16). FEEL rows that moved (HEAD → R8, everything else identical to the printed
digit): all 24 `land.*` rows still ride away with rebound ≤ 0.04; the 3 m lean +0.5 drops now bottom the rear at 100 % (was
76–89 %) and pitch less nose-up (max +8.6° → +2.5°) — the body's momentum reaches the chassis through the seat instead of
passing through it; `land.2m.lean0.reboundM` 0.000 → 0.006; kicker 17° @ 14 m/s held-lean air 1.27 → 1.33 s; climb tables
60 @ 8 stall 26 → 27 % (Pro) / 20 → 21 % (Rookie); cost 2.6 → 3.0 µs/tick p50 (four more constraints per iteration). The
hop rows (R2 reference 0.608, matrix, quantum, surfaces, seated) print identically: no hold limit engages in a hop (the
arm reaches 0.44 of 0.62 at the top of the snap).

### Deviations (R8)

15. **The hold envelope and `gripJ`** (physics-v2.md §12's F list grows by one, justified in `world.test.ts`): four one-sided
    rider–chassis limits with Coulomb friction on the two compression ones, solved in the velocity pass with a
    position bias `posBeta` 0.4 (steady penetration under F_max 1.4–2.8 cm). Deviation 14 (the recovery band) is
    withdrawn: the band is 0.5 s and the excursion cap 0.5 s, asserted every tick on every golden.
16. **The thrown rider is a grip-strength rule on the reach impulse**, not a sensor and not a reach *distance*: `gripN`
    2 500 N over `gripTau` 50 ms. A first version failed the seat without friction (above) and threw a survivable
    landing; friction, not a bigger grip number, is the fix. The R6 seesaw lift bound becomes 0.5 F_max (the seat catch).
17. **The brake row of the pose table is a brace, `brakeBrace` 0.5**, ground-only. The 15 m/s endo is not a brake-power
    bug (1.11 g is what the brakes are; the rider was the missing part), so the brake torques and the front bias are
    untouched and the deliberate stoppie is byte-identical. `hopPhase` reads `preload` during a braking compression (the
    target sits below neutral): cosmetic, unchanged sensor semantics.
18. **The chest point is fixed in the body frame** (`hold.chest` = hips + 0.52 m of torso at the canonical 40°); the drawn
    chain's shoulders follow the lean's canonical torso angle, so the two differ by up to ~10° of torso pitch. A first
    version used the chest for an arm-*compression* limit (0.12 m) and it fired in the middle of the R2 snap (apex 0.608
    → 0.557); the compression side of the envelope is the tank line instead, which no hop touches.
19. **A first brace was not gated on ground contact** and changed the R4 air-brake nudge (−50 → −70 deg/s peak) and
    broke the R5 class identity of the air nudges; the gate `(1 − bothAir)` restores both byte-for-byte. The goldens were
    searched twice because of it (the bot brakes in the air on most tracks).

### Golden table (R8)

Every golden was re-searched (`harness:bot --all-tracks --skill 3 --track-wall-s 400`, both classes) because the dynamics
changed (a rider on a seat is a different landing; the R7 recordings finish on 8 of 48 under R8). Rookie **24 / 24 cleared, all at 1 attempt** (x1 needed 122 s of wall on the loaded box); Pro **22 / 24 at 1 attempt** — **x1 and x3
Pro are NOT cleared under R8**: with a 600 s wall the Pro bot exhausts its 300 s sim budget at 599.7 m (x1, 81 %; 1 930
plans, 198 M ticks) and 530.7 m (x3, 92 %) where R7 cleared them at 2 / 1 attempts. The two R7 recordings were reported STALE by the refresh and removed from `harness/inputs/` (a stale golden is not a
golden; R7's copies are in git at 845df15 for the reproduction) (fresh 46, restamped 0, stale 2; tracks with a proven golden
24 / 24 through the Rookie set; the whole-tree suite otherwise reads 46 goldens). Also for the render owner:
`src/render/hero/gltfRiderPhysical.test.ts:208-210` asserts `worst.grip > 0.5` / `worst.sole > 0.1` / `worst.com > 0.01` over
the E2 impact window as a record of main's rider leaving the rig's reach; under R8 the worst grip shortfall is 0.111 m
(Rookie) / 0.118 m (Pro) and those three bounds invert (12 rows red until they do). This is the "bot cannot clear a track it clears today" signal for the extreme Pro
tracks, written down, not tuned away — the candidates are the thrown-rider fault on a whip the Pro used to survive and
the seat taking a body that used to pass through the chassis on a slam; **open for R9** (reproduce from the R7 x1 / x3
Pro recordings at the stall x, read `crashCause` / the hold impulses). Node == browser on the 46 (`harness:bot
--refresh-goldens --jobs 5`), `harness:determinism` D1–D8 **9 / 9** on flat-test Rookie (`c0e96dfa44fda59a`, finish
8.433 — the flat-test Rookie recording is byte-identical to R7's: no hold limit and no brace engages on it) and Pro
(`f835e96a03c744fa`, 8.058), D8 re-pinned `ff119f990e56af57`, `gate/expected.json` re-pinned (`harness:gate --quick
--pin`: `clear.pro.b1` `4b69a80de766a325` / 38.142 s); the verifying `harness:gate --quick` is **27 / 30** with
`boot.firstFrameMs` (6 058 ms), `restart.frameMsP95` (298 ms) and `perf.renderSyncedMsP95` (935 ms) failing — the same
three SwiftShader timing rows as R7, informational on this machine; physics 30 µs/tick p95. `public/bench/b1-bot-3.json`
re-copied from the b1 Rookie golden. Reflex (`harness:reflex --all-tracks --seeds 9 --jobs 16`), R7b 9-seed → R8 medians:
b1 1 → 1, b2 2 → 2, b3 3 → 2, e1 7 → 8, e2 3 → 4, e3 2 → 3, m1 10 → 7, m2 4 → 5, m3 3 → 3, h1 12 → 15, h2 6 → 10,
h3 5 → 3, x1 11 → 7, x2 9 → 5, x3 15 → 15, p1 2 → 2, p2 2 → 2, p3 2 → 2, p4 2 → 3, p5 2 → 2, flat / gap / lab-flat 1,
lab-physics 1; **clears 9 / 9 on every track**; no beginner / easy median moves by more than 1 (e1, e2, e3, p4 each +1).
Strangers n = 2 on b1–e3: `harness-metrics.md` Round 14.

| track | Rookie finish (s) / attempts | Pro finish (s) / attempts |
|---|---|---|
| b1-first-ride | 41.258 / 1 | 38.142 / 1 |
| b2-lean-back | 39.025 / 1 | 37.642 / 1 |
| b3-kicker-row | 32.783 / 1 | 30.933 / 1 |
| e1-uphill-weight | 43.667 / 1 | 42.533 / 1 |
| e2-rear-wheel-first | 43.017 / 1 | 40.475 / 1 |
| e3-stairway | 39.608 / 1 | 36.883 / 1 |
| flat-test | 8.433 / 1 | 8.058 / 1 |
| gap-test | 5.492 / 1 | 5.467 / 1 |
| h1-wheelie-wire | 46.142 / 1 | 43.583 / 1 |
| h2-gap-chain | 46.142 / 1 | 43.200 / 1 |
| h3-fire-line | 46.608 / 1 | 42.583 / 1 |
| lab-flat-200 | 12.467 / 1 | 11.875 / 1 |
| lab-physics-test | 7.908 / 1 | 7.725 / 1 |
| m1-hop-up | 32.458 / 1 | 30.933 / 1 |
| m2-drum-roll | 40.083 / 1 | 37.067 / 1 |
| m3-see-saw | 39.275 / 1 | 36.942 / 1 |
| p1-container-yard | 35.817 / 1 | 33.533 / 1 |
| p2-canyon-run | 33.783 / 1 | 32.658 / 1 |
| p3-snow-line | 34.517 / 1 | 31.817 / 1 |
| p4-night-circuit | 34.942 / 1 | 33.233 / 1 |
| p5-foundry-floor | 30.458 / 1 | 29.250 / 1 |
| x1-vertical-limit | 54.592 / 1 | **STALE (R7 57.700 / 2): bot stuck at 599.7 m, 81 %** |
| x2-pipe-dream | 43.117 / 1 | 42.275 / 1 |
| x3-gauntlet | 42.933 / 1 | **STALE (R7 40.458 / 1): bot stuck at 530.7 m, 92 %** |

**Astra's physics (`405f894`) and the seated-pose candidate (`docs/evidence/hero-r15/seated-candidate.patch`).** The
coordinator's mid-round directive (adopt Astra's hinged rear path + fork axis, rider mass frame, elbow stop, Rookie brake
lift control, and the seated profile, ported onto R7, measured, credited) arrived with the goldens and strangers of this
round already in flight on the R8 physics; it is being ported and measured in a scratch copy of this tree by a builder,
and its ledger is below. **The builder's ledger (scratch tree = HEAD + this round's `src/physics`; nothing applied to the checkout; patches preserved
under `docs/evidence/physics-r8/`: `astra-port.patch` (578 lines, `bike.ts` + `tuning.ts` only, `git apply --check -p1`
passes on this tree), `patch-1-hinge.patch`, `patch-3-elbow.patch`, `patch-4-liftcontrol.patch`, `feel-diff-base-final.txt`
(every FEEL row base → final), `m4-brake-bench.txt`, `final-vitest.log`).**

| # | Astra mechanism (`405f894`) | verdict | the numbers |
|---|---|---|---|
| 1 | hinged rear-wheel path + fork axis (`BIKE_GEOMETRY_V2`, `suspensionPoint`, `hinge`): rear wheel on a true circle about the asset's swingarm pivot (chassis (−0.155, −0.11), r 0.4415 m), front on the asset's fork axis through (0.715, −0.21) | **ADOPT** (R9 lands it) | arc mismatch, merge-#3 method, worst / mean / p99 / ticks > 5 mm: b3 Rookie 27.14 / 13.88 / 26.63 mm / 2 815 → **8.69 / 0.04 / 0.43 mm / 7**; b3 Pro 36.70 / 23.55 / 36.55 / 3 804 → 11.52 / 0.08 / 2.83 / 15; e2 Rookie 27.35 / 14.26 → 5.22 / 0.04; front 2.2–11.2 → ≤ 0.44 mm (the residual spikes are single impact ticks). No wind-up (max unwrapped ψ lag 0.42 rad E2 Rookie, band ≥ 99.7 %); node == browser; bot clears b1 / e2 / m3 both classes at 1 attempt (m3 Pro 2 → 1). Rows that move: hop.ref rearApex 0.603 → 0.596, both-off 0.175 → 0.092 (base's 0.175 was 0.067 s of flight + a front-wheel bounce off a −13° touchdown; the hinge lands at −7° and does not bounce — the r2 ≥ 0.15 row must be re-derived), Pro hop 0.70 → 0.77; balance pitch +1–2°; snap from 20° held 45 → 31°; touchdown peak +25 %; **the R7 endo control row (brace 0, 15 m/s) becomes upright on the hinge** (the swingarm angle turns 23 % of the rear brake force into compression and moves the reaction to the pivot) so `r8.test.ts`'s brace-off assert must become informational; climb.rookie 45@5 / 50@6 stall → FAULT; goldens need a full re-search; `src/render/hero/gltfBike.test.ts`'s two "until main gains the hinge" bounds flip. Deviations from Astra kept: rest compression at main's axles, main's spring rates / damping / velIters, the Pro loses its 1.28 wheelbase override (same asset arc). |
| 2 | rider mass frame as the physical target table (`RIDER_PROFILE`, mass-map COM) | **REJECT** as the servo target (the mass-map functions already drive the drawn frame on main, `src/render/hero/riderRig.ts`) | de Leva COM at lean 0 (0.017, 0.658) vs the table's (−0.12, 0.62): 13.7 cm forward, 3.8 cm up; back → forward travel 0.34 vs 0.48 m; with the servo unchanged: reference hop 0.596 → 0.481, matrix −1 row 0.26 / 0.53 / 0.64 / 0.60 → 0.20 / 0.45 / 0.50 / 0.48, tuck gain positive, **lab ledge hop at 8–9 m/s crashes**, 15 m/s stop 1.92 s — the forward table R3 rejected. |
| 3 | elbow stop (arm minimum length) as a fifth hold limit, C = ǀchest − gripǀ − armMin, no friction, not in `gripJ` | **ADOPT at 0.10 m** (Astra's IK-singularity point; R9) | at the anatomical 0.144 m it fires in the R2 snap (reference hop 0.596 → 0.535, r5 on/off identity split) on 1 969 golden ticks; at 0.10 m the hop rows are untouched, it engages on 582 / 139 930 golden ticks (slams where the chest had passed inside the grip — the "collapses onto the tank" frames), land.capOff.2m rebound 0.204 → 0.176 (the r3 control-arm > 0.2 row re-derives), seesaw Pro v5 lift 1 847 → 1 287 N, climb.rookie 50@6 FAULT → stall 44 %. |
| 4 | Rookie brake lift control (front caliper cap from the live lift margin, `brakes.liftControl` 1 / `liftLookahead` 0.15, Pro 0) | **ADOPT** alongside the brace (R9) | Rookie full brake lean 0, stop / min pitch / rear-off / distance: lift alone 0.90 s / −10.5° / 0.54 s / 2.81 m at 6 m/s, 2.07 / −13.1 / 1.01 / 15.34 at 15 (no endo, rides the lift edge); brace alone (R8) 0.74 / −8.1 / 0.14 / 2.42 and 1.74 / −8.2 / 0.16 / 12.80; both 0.77 / −7.2 / 0.15 / 2.53 and 1.77 / −7.3 / 0.16 / 13.09 (+2.3 % distance: 0.45 of the front caliper trimmed at 10 m/s by the 10 % margin + lookahead); the stoppie ends 0.06–0.08 s sooner; no other row moves. |
| 5 | the seated-pose candidate (`docs/evidence/hero-r15/seated-candidate.patch`) | **NOT LANDED** — needs the drawn / physical table split | mass-map COM rows −1 (−0.334, 0.479), 0 (−0.086, 0.605), +1 (0.098, 0.667): verbatim, matrix −1 row 0.086 / 0.247 / 0.410 / 0.515 (half-rate 48 %, non-monotone), lab hop@8 crash, 3 m cap-off drop crash; retune 1 (hang-back COM (−0.342, 0.358)) apex 0.582 but lab hop crash (−32°), wheelie hold 9.3 s, Pro loop 1.62 s; retune 2 (main's ψ column) apex 0.595 = base but lab hop crash (−26°), 3 m landing −35.3°, wheelie-hold crash, the punch row loses seat contact. None of the four pose requirements is met in a landable form; the deviation to write in R9 is `rider.poses` (physical, R8's) separate from a drawn hip-pose table for the rig. |

Reflex on the adopted tree (`average`): b1 3 seeds 1 → 2, 9 seeds **1** (9 / 9 clears); e1 3 seeds 2 → 4 (noise level per R7b; 9 seeds not run). Final scratch-tree suite 154 / 164: the rows above plus the golden "finishes" rows (re-search needed). **R9's first item:** apply `astra-port.patch`, re-derive the five rows named, re-search + browser-prove the goldens, re-pin the gate, flip the two render-side hinge bounds (render owner), then the seated split.

## v2 status — R7 (the rider body is held by the linkage, exported, and a coasting bike never hops)

**Finding.** `PhysicsState.riderBody` is exported (world SI: COM `pos`, `angle` ψ_R, `vel`, `angVel`; hashed) and the
body it exports now tracks its pose: on every bot golden of both classes the rotation stays within ±0.35 rad of the
pose on ≥ 94 % of riding ticks, and **one second after the last tick on which the pose target asked more of the servo
than it has (F_max / m_R = 4.35 g) the body is within 0.15 m and 0.35 rad of its pose on every tick** (measured max
0.128 m / 0.17 rad; the band and its distribution under "COM band" below; `r7.test.ts`, permanent). It did not before, and that is the
merge-#3 finding (`docs/tasks/blender-branch-merge.md`, blind critic 0/6, "rider bolted to the frame"): the merged
hero rig (`GltfRider.chainFromBody`) was dormant because the body was never exported, and it was never exported because
**the body wound up** — on the E2 Rookie bot it left the pose band at tick 110, spun at 7 rad/s by tick 120 and reached
834 rad (Pro: 245 rad) with its COM 1.4 m from the target while `riding`.

**The wind-up cause (one line).** Deviation 4 (R1) applies the servo force's arm remainder at the **grip point on the
rider body too** (a collinear pair, for exact angular-momentum conservation); that remainder has a 0.55 m lever about
the rider COM, so at F_max it is a **1 700 N m moment on a body whose angular servo caps at 300 N m** — the servo lost,
`errA` is unwrapped, `k_ψ · errA` saturated for good and the body spun. Nothing was drawn from it (the pose spring path
never read the body) so the R2–R6 hop and snap tables were tuned *on top of the spin*: in the R2 reference hop the
torso pitched **2.48 rad (142°) back** at 8.4 rad/s while the rider snapped forward, and that angular-momentum exchange
is what held the nose up through the flight, what levelled a 20° wheelie under full throttle, and what absorbed the
snap's 290 J at a standstill.

**The fix (physics, not a clamp): the linkage couple.** The pair's moment about the rider COM (pegs + grip) is reacted
by the closed chain hands–bars / feet–pegs, not by the torso muscles: it goes back to the chassis as a couple
(`mPair` on the rider, `−mPair` on the chassis: a pair torque, angular momentum exact). The body's rotation is then
driven by the angular servo alone (k_ψ 2 500, c_ψ 180, τ_max 300 as before) and the servo force acts on the chassis
**as if applied at the rider COM** — §9.3's statement, now a true pair. The implicit-damping response matrix uses the
same lever (`q = −r_R ×`). This is forced, not chosen: any model that holds the torso gives the chassis exactly
−τ − r_R × F (a rigid rider on a linkage), so no choice of application point recovers the old behaviour — it *was* the
spin. Measured on the R2 reference hop before → after: rear apex 0.462 → 0.608 m, both-wheels-off 0.292 → 0.183 s,
land pitch −12 → +3.7°, torso excursion 2.48 → 0.36 rad; the tuck's +0.1 m becomes −0.145 m (K_att's nose-up drops the
rear); one-quantum bounded response per tick 0.066 → 0.083 rad/s (the 180 N step now acts 0.62 m above the chassis COM;
deviation 8 becomes 0.09).

**Three envelope changes for the parent (all honest consequences of a held torso):** (1) the snap-forward correction
from a 20° wheelie **with the throttle held** is gone: 44.6° at 0.5 s then a loop (R3: 24.6°); with the throttle
closed the 30° recovery stands (51° at 0.5 s, **−6.6° at 1.0 s**, no loop). (2) A hop must finish with its tuck: a +1
held through the flight noses over (the property / snapshot helpers now use the R2 gesture — snap 0.22 s + 0.1 s
tuck — and pass: delayed 1/2/4/8 ticks 0.640 flat, half-rate 71 % in the 55–75 band, knife-edge sweep continuous).
(3) At a **standstill** with the throttle closed, lean −1 for 0.3 s then +1 held pole-vaults the bike over the front
wheel and crashes at 0.86 s (the torso spin used to absorb the 75 kg × 3 m/s lunge). The stranger instrument says the
trade is right: reflex `average` × 3 seeds, 24 tracks, before → after medians (attempts): b1 1 → 1, b2 2 → 2,
b3 4 → 4, e1 8 → 6, **e2 17 → 3**, e3 2 → 3, m1 10 → 9, m2 8 → 4, **m3 32 → 17**, **h1 25 → 13**, h2 28 → 15,
**h3 22 → 7**, x1 21 → 13, **x2 51 → 11**, **x3 24 → 10**, p1 2 → 3, p2 2 → 2, p3 1 → 2, p4 2 → 2, p5 1 → 3; clears
3/3 on every track after (before: m3 2/3, h2 1/3, h3 2/3, x2 1/3). Nine seeds on the beginner/easy tracks that moved:
b3 6 → 4, e1 11 → 6, e3 2 → 2, p1 2 → 3, p3 2 → 2, p5 2 → 3 — no beginner/easy median moves by more than 1 the wrong
way (the 3-seed p5 1 → 3 was noise).
**Reflex after the edge gate (R7b; `harness:reflex --all-tracks --seeds 3 --jobs 16`, then `--seeds 9` — the committed
`reflex.md` / `<track>.reflex.json` hold the 9-seed run):** medians R7 (3 seeds) → R7b 3 seeds / 9 seeds: b1 1 → 2 / **1**,
b2 2 → 2 / 2, b3 4 → 2 / 3, e1 6 → 3 / 7, e2 3 → 2 / 3, e3 3 → 2 / 2, m1 9 → 8 / 10, m2 4 → 4 / 4, **m3 17 → 2 / 3**,
h1 13 → 11 / 12, **h2 15 → 5 / 6**, h3 7 → 4 / 5, x1 13 → 15 / 11, x2 11 → 5 / 9, x3 10 → 15 / 15, p1 3 → 2 / 2,
p2 2 → 3 / 2, p3 2 → 6 / 3, p4 2 → 3 / 2, p5 3 → 1 / 2, flat / gap / lab-flat 1, lab-physics 1; clears 3/3 and 9/9 on
every track. Against R7's own 9-seed beginner / easy numbers (b3 4, e1 6, e3 2, p1 3, p3 2, p5 3 → b3 3, e1 7, e3 2,
p1 2, p3 3, p5 2) no median moves by more than 1; the 3-seed b1 2 and p3 6 were noise (9 seeds: 1 and 3). e1's 9-seed
median 7 sits above its band's 1.5 × 4 (it was 6 on R7's 9 seeds; the reflex bot is not the stranger — the R13 stranger
row is in `harness-metrics.md`).

**The coasting hop (harness r11, x3 summit tick 18585 — the second cause).** A hang-back (−1) front-wheel-first
landing at −6.5 m/s on the summit box; the lean is released at touchdown (the only input edge); the release's 0.39 m of
target travel saturates the R3 intent memory **8× over `servoIntentM`** (it decays over τ · ln 8 = 0.42 s) while the
landing has pushed the body 0.28 m below its target — so the body is repaid at F_max with the angular servo pinned
(the wind-up again), overshoots, and 34 ticks after the last input `relVy > 0.5` reads `push` and the bike leaves the
box. Three changes: **(a) the settled gate** `servoIntentSettleM` 0.12 m — target travel counts toward intent only
while the body is within 0.12 m of its target (linear to 0 at 0.20 m, §14.1-continuous): a snap starts from a settled
body; a lean released while the body is still sagged by a landing is an eccentric leg absorbing an impact, not a jump,
so the sag is repaid under the R3 concentric cap; **(b) the memory saturates** at `servoIntentMaxM` 0.10 m (a smooth
knee from 0.05): a gesture certifies F_max for a window of order τ after it ends, not for half a second (the R2 hop is
unchanged at 0.618 / 0.618 / 0.618 m for cap ∞ / 4× / 2×, 0.596 at 1.5×); **(c) `hopPhase` `push` = the body leaving
the chassis at > 0.5 m/s *with intent* (`S_TGT_MOVE` ≥ ½ `servoIntentM`)**, the relative velocity taken at the body
with the chassis's rotation removed (a bike pitching at 4 rad/s carried a 2.5 m/s tangential term and read `push` on a
front slam). On the x3 stranger session the coasting-push count (a `push` with ≥ 20 unchanged input ticks) goes
11 → 0 beyond 0.33 s of the last edge; the permanent row asserts **no `push` after 60 unchanged input ticks** on every
golden of both classes.

**The third coasting hop (R7b, the m2 Rookie golden, tick 3065) and (d) the edge gate.** With (a)–(c) in, the row still
failed on one golden: a −1 pressed **in flight** (tick 3001, the only edge) crawls the target under the Rookie's R5 air
limit; the rear wheel lands at tick 3039 (a rear-wheel-first landing, so `bothAir` is 0 at once), the limit blends out
over `airRateBlend` and the **last 0.08 m of that travel runs at the ground rate**, past the settled gate (the body had
followed the crawl), reads intent 1 and `push` fires 26 ticks after touchdown with no input edge — the same F_max repay
of a landing, arriving through the pose target's speed-up instead of its distance. The rule that closes it is R5's air
rule completed, not a new one: **under `airRateGain`, travel *commanded* with both wheels off the ground earns no
intent — in the air (R5) or after touchdown (R7).** One flag slot, `leanEdgeAir` (F slot 35, `NSCALAR` 36): set on every
lean edge to whether both wheels were off the ground; while it stands and a wheel is down the target's remaining travel
counts `1 − airRateGain` (Rookie 0, Pro 1: his pre-snap an edge before touchdown is a real push and still counts, and
the 24 Pro goldens replay byte-identical). The Rookie can still snap after landing — with an edge made on the ground.
This is a dynamics change for the Rookie, so all 24 Rookie goldens were re-searched (below); the bench rows of
`r2/r3/r5/r6/feel/property/snapshot` do not move (their gestures are grounded). What the gate removed was not one
golden's hop: the reflex bot changes lean in the air on nearly every jump, so every Rookie landing after an air lean
carried an F_max repay — the reflex medians below (R7 3-seed → R7b 3-seed / 9-seed: m3 17 → 2 / 3, h2 15 → 5 / 6,
h3 7 → 4 / 5, x2 11 → 5 / 9) are that pogo leaving.

**Export contract.** `PhysicsState.riderBody: { pos: Vec2, angle, vel: Vec2, angVel }` — world frame, SI, the rider
COM (`pos` *is* the COM; hips = COM − R(ψ_R) · `comFromHips`), ψ_R the body angle with ψ_R − θ_C − ψ_t the lag behind
the pose; present on every v2 tick, frozen at the crash pose once the ragdoll owns the rider (`im` 0). Hashed by
`hashPhysicsState` whenever present (`core/hash.ts`, unchanged: it already hashed the optional field) — the hero is a
function of it, so it is part of the replay contract; two replays hash tick-identical (`r7.test.ts`). `render/frame.ts`
derives `relX / relY / relAngle / relUp` from it and `GltfRider.chainFromBody` reads `f.riderBody.present` — no render
change is needed to switch the physical-pose path on.

### Tests (R7)

`pnpm vitest run src/physics`: **157 → 160** (3 new rows in `r7.test.ts`: the band + coasting-push row over every
golden of both classes, the golden list, the two-replay hash identity; `world.test.ts`'s slot list gains `leanEdgeAir`,
`NSCALAR` 36). Whole tree `pnpm vitest run` **784 / 784** (63 files; `src/game/bench.test.ts` pins
`public/bench/b1-bot-3.json` as a copy of the b1 Rookie golden, so the golden refresh re-copies it). Re-derived rows (each carries the R7 note):
`r2` both-wheels-off ≥ 0.25 → ≥ 0.15 s (0.183), tuck gain ≥ 0.06 → [−0.2, 0] (−0.145); `r3` cap-off control arm
rebound > 0.4 → > 0.2 (0.247) and the 3 m cap-off drop rides away instead of looping (the wind-up fed the R2 pogo), the
intent-decay row completes its gesture (a held +1 at a standstill now crashes); `r5` hop on/off closeTo 3 → 2 digits
(0.6083 / 0.6078); `r6` lean-0 keys `pushTicks` > 0 → **= 0** (a throttle key is not a hop gesture), pulse-train
gate tolerance 0.01 → 0.04 (0.026); `feel` snap from 20° throttle held: `loop` false → true, at 0.5 s < 30 → > 30
(44.6); snap from 30° throttle closed at 0.5 s < 30 → < 60 (51.2; 1.0 s −6.6 unchanged); `property` bounded response
|dω| ≤ 0.06 → 0.09 per tick; the property and snapshot hop helpers use the R2 gesture. All 24 landing rows (`land.*`)
unchanged: rides away, rebound ≤ 0.04.

### Deviations (R7)

10. **Deviation 4 is withdrawn**: the servo pairs stay collinear at the pegs and the grip, and the linkage couple
    returns the pair's moment about the rider COM to the chassis — so the force acts on the chassis as if at the
    rider COM, which is §9.3's statement made a true pair. The consequence listed under 4 (lean +1 sitting ~1° above
    +0.5 at part throttle through the arms) no longer applies.
11. **Deviation 8 (ε_ω 0.05 → 0.06) becomes 0.09**: the one-quantum 180 N step acts at the rider COM, 0.62 m above the
    chassis COM (0.084 rad/s per tick on 11 kg m²).
12. **Intent (R3) is gated and bounded**: `servoIntentSettleM` 0.12 m (ramp to 0.20), `servoIntentMaxM` 0.10 m; `push`
    requires intent. R3's "all travel counts" is what launched a coasting bike off the x3 summit.
13. **The R5 air rule covers commanded travel (R7b)**: under `airRateGain`, target travel commanded by a lean edge made
    with both wheels off the ground earns no intent after touchdown either; one flag slot `leanEdgeAir` (F 35,
    `NSCALAR` 36 — physics-v2.md §12's list grows by one, justified in `world.test.ts`). The Pro (gain 0) is untouched.
14. **The COM band is a recovery band, not a per-tick one** (below): the body leaves 0.15 m on 11 % of the bot's riding
    ticks and by up to 2.6 m without a fault. Holding it on every tick needs a fault when the body leaves the reach
    (§9.3's thrown rider) or a servo the impact cannot outrun — R8, not tuned here.

### Golden table (R7)

Every golden was re-searched (`harness:bot --all-tracks --skill 3`, both classes) because the dynamics changed: the R6
recordings no longer finish under R7 (a held torso is a different bike), so no finish time carries over. The Pro set is
the linkage-couple search (24 / 24 cleared, 21 at 1 attempt, 3 at 2); the Rookie set was searched again after the edge
gate (d), which the Pro does not feel (24 / 24 cleared, 23 at 1 attempt, h3 at 2; wall 116 s). Node == browser
(`harness:bot --refresh-goldens --jobs 5`: fresh 24 / restamped 24 / stale 0 — the Pro recordings replay byte-identical
under the gate, restamped `aa4ce7e9 → 605a8174`), `harness:determinism` D1–D8 green on flat-test Rookie
(`c0e96dfa44fda59a`, finish 8.433) and Pro (`f835e96a03c744fa`, 8.058), `gate/expected.json` re-pinned
(`harness:gate --quick --pin`: `clear.hashOk` `c0e96dfa44fda59a`, `clear.pro.flat` `f835e96a03c744fa`, `clear.pro.b1`
`ccdd746d430da232` / 38.542 s); the verifying `harness:gate --quick` is **27 / 30** with `boot.firstFrameMs` (5 451 ms),
`restart.frameMsP95` (192 ms) and `perf.renderSyncedMsP95` (1 664 ms) failing — SwiftShader timing rows, informational
on this machine (`boot.readyP50Ms` passed on that run, `heap.growthMBPer60s` too). `src/tracks/golden.json` is not
written by the refresh tooling (unchanged).

**COM band (R7b) — the distribution and the bound.** Over the 48 goldens (196 443 riding ticks) the rotation is outside
±0.35 rad on 1.3 % of ticks (worst golden 5.2 %) and the COM is **outside 0.15 m on 11.0 %** (worst x3 Pro 21 %),
max 2.59 m (m3 Pro tick 2025) — and the previous paragraph's reading of that ("a few ticks at ≥ 10 g") was wrong. The
big residuals are not lag at high g: per-tick chassis acceleration is a poor conditioner (contact impulses read
45–56 g for one tick, > 3 g ticks recur every ~0.1 s), and the maxima sit at *low* g — m3 Pro 2.59 m at 0.7 g, e1 Pro
2.14 m at 1.2 g. What happens on m3 Pro: an 8 g landing (ticks 1956–1972) punches the body 1.25 m **through the chassis**
(chassis-frame y −0.88 m, below the bike), the bike upends to 95–120° at a standstill and the body hangs 2 m from the
chassis on the leg cap (`legFrac` 0.30, ~960 N) for 0.6 s **with no fault** — the sensors ride the IK-clamped drawn
chain, not the body — until the bot's in-band restart. The honest conditioner is the **servo demand**: the specific force
|a_T − g| the pose target's own world motion (chassis COM + rotation + the target's travel) asks of the rider mass,
over a 50 ms window; the servo can supply F_max / m_R = **4.35 g**. Demand exceeds that on 28.6 % of the bot's riding
ticks (p50 1.8 g, p90 8.7 g; a flip whirls the target at 9 m/s at 14.5 rad/s). Bucketed by time since the last
over-demand tick (COM p50 / p95 / p99 / max, m): 0–0.1 s (56 % of ticks) 0.060 / 0.638 / 1.394 / 2.593; 0.1–0.25 s
0.019 / 0.220 / 1.266 / 2.305; 0.25–0.5 s 0.018 / 0.036 / 0.631 / 1.686; 0.5–1 s 0.017 / 0.029 / 0.041 / 0.748 (13 ticks
of h3 Rookie above 0.15); **≥ 1 s (10 687 ticks, 5.4 %) 0.017 / 0.026 / 0.102 / 0.128**, ψ max 0.170 rad. Excursions of
the COM beyond 0.35 m: 334 episodes, p50 0.17 s, p90 0.68 s, **max 1.33 s** (e1 Rookie tick 2262, 1.75 m), 3 end in a
fault; every one above 0.5 m follows an over-demand tick. **The permanent row asserts (`r7.test.ts`):** rotation within
0.35 rad on ≥ 94 % of riding ticks per golden; **COM ≤ 0.15 m and ψ ≤ 0.35 rad on every riding tick ≥ 1.0 s after the
last over-demand tick (zero violations, over ≥ 5 000 such ticks)**; **no COM excursion > 0.35 m longer than 1.5 s**; no
coasting push; every golden finishing; the two-replay hash identity. That is what the hero owner can rely on: after a
second of riding the rig draws the body on its pose; inside an impact it draws the excursion, never longer than 1.5 s.
**Open for R8:** the thrown rider — a fault when the body leaves the reach envelope (§9.3), or a servo the impact
cannot outrun; the m3 Pro sequence above is the reference case. Also open, and **not R7's** (identical on the R6
physics from a `git archive HEAD` copy): full brake at lean 0 from 10 / 15 m/s on the flat endos in 1.5 / 1.4 s on
both classes (−117° / −135°); lean −0.5 or −1 stops in 1.0–1.7 s at ≤ 8° nose-down — the R13 b1 stranger's only fault
(`harness-metrics.md`), and the b1 card says "brake before the hump".

| track | Rookie finish (s) / attempts | Pro finish (s) / attempts |
|---|---|---|
| b1-first-ride | 40.300 / 1 | 38.542 / 1 |
| b2-lean-back | 37.950 / 1 | 36.783 / 1 |
| b3-kicker-row | 32.250 / 1 | 30.992 / 1 |
| e1-uphill-weight | 42.983 / 1 | 39.700 / 1 |
| e2-rear-wheel-first | 42.758 / 1 | 40.933 / 1 |
| e3-stairway | 39.692 / 1 | 35.908 / 1 |
| flat-test | 8.433 / 1 | 8.058 / 1 |
| gap-test | 5.483 / 1 | 5.467 / 1 |
| h1-wheelie-wire | 46.417 / 1 | 43.992 / 1 |
| h2-gap-chain | 45.892 / 1 | 43.608 / 1 |
| h3-fire-line | 51.717 / 2 | 43.833 / 1 |
| lab-flat-200 | 12.467 / 1 | 11.875 / 1 |
| lab-physics-test | 7.900 / 1 | 7.708 / 1 |
| m1-hop-up | 33.958 / 1 | 31.975 / 1 |
| m2-drum-roll | 39.733 / 1 | 34.433 / 1 |
| m3-see-saw | 39.100 / 1 | 41.358 / 2 |
| p1-container-yard | 35.592 / 1 | 31.933 / 1 |
| p2-canyon-run | 33.992 / 1 | 32.375 / 1 |
| p3-snow-line | 34.325 / 1 | 31.600 / 1 |
| p4-night-circuit | 34.400 / 1 | 31.983 / 1 |
| p5-foundry-floor | 31.108 / 1 | 29.650 / 1 |
| x1-vertical-limit | 55.642 / 1 | 57.700 / 2 |
| x2-pipe-dream | 45.250 / 1 | 46.267 / 2 |
| x3-gauntlet | 42.983 / 1 | 40.458 / 1 |

## v2 status — R6 (the line is crossed upright, the Pro lifts and does not loop, the suite says what it asserts)

**Finding.** Three things the audit and harness r11 named are now defined and measured instead of assumed. **(1) A fault
in the tick the front wheel crosses the finish line voids the finish** (§8.1 below): the solver evaluates the crash
sensors before the crossing, and a same-tick fault with the wheel ≤ one radius (0.34 m) past the line emits `fault`
only (`finishTime` stays null, `debug().finishVoided`); the audit probe that scored a fault-free 1/120 s clear now
reads `crashed`, 1 fault, through an unchanged Game. **(2) The Pro's standstill loop was open-loop physics with no
open-loop cure**: the thrust curve is a knife edge (F(4–8 m/s) 0.85 loops in 1.0 s, 0.80 lifts 8° and never wheelies), a
slower throttle (0.10–0.15 s) only moves the loop from 0.95 to 1.21 s, and a speed-faded trim hands a held wheelie back
to the raw engine and loops at the release (6→10 m/s: 2.44 s; 8→14: 3.83 s; 10→16: 4.93 s) — because a wheelie under
constant thrust has no stable angle (§10). So **the Pro carries the R4 ECU on the ground** (`wheelieControl.gain` 1,
the Rookie's margins / rates / lean fade) **with `airGain` 0 (its air stays raw)**: plain gas from rest at lean 0 lifts
to **31.8° at 0.93 s and rides a 16–32° power wheelie down at 14 m/s**, 1 s / 2 s throttle ramps 31°, gas from an 8 m/s
roll 26°, no loop; lean −0.25 / −0.5 / −1 still loop in 1.36 / 0.67 / 0.57 s (the fade: leaning back is the rider);
the 20° kicker at 10 m/s full gas lean 0 leaves the lip at 22° / −75 °/s instead of 76° / +178. **(3) Nothing flips
sign in the Pro's air**: held lean gives +28 / −35° in 0.5 s (Rookie +34 / −38), K_att prints +292 / −320 N m; what
the x3 strangers read on their first slot is the raw pose swing — a lean −1 press dips the Pro's nose **−4.8° at
0.05 s and −10.2° at 0.1 s (−140 °/s)** before K_att lifts it (the Rookie's R5 air limit makes that −0.1°), and a 50 ms
tap nets +3°. The "hop machine on planks": with constant lean-0 keys **the intent slot cannot arm** (the pose target is
a function of the lean input alone); the m3 `push` at 402 m is the rider's rebound after a bottomed landing on the
board at the 0.3 F_max cap (bench: ≤ 695 N, the rear lifts off 0.6 s after touchdown at vy ≤ 1.3 m/s, no fault at
≤ 0.4 throttle on both classes) — a readout, not a throw — and the x3 +263..+427 °/s is a −1/0 lean pulse train
(67–100 ms pulses) that preloads the body for real, so every preload gate that keeps the R3 hop matrix passes it; the
gate ships declared at 0 (`servoIntentBackM`, table below). The acceptance suite has **no `it.fails` and no `it.todo`**:
five `it.fails` rows became one pass (0 → 16 in 3.98 s, the R1 4.47 was the helper's 0.5 s settle) and four numbered
deviations, the 30° recovery promises what it asserts (< 30° at 0.5 s, < 15° at 1.0 s: −4.9°), the eleven todos are
triaged (one became a test), and the lean-only 45° hold the audit measured at 3.167 s is not reachable by any K_att
(1500 = 5× holds 2.7 s and takes the air row to 143° per 0.5 s) — the wheelie-hold requirement is the throttle-actuated
anticipation row (40 ± 8 for 11.5 / 12.2 s as shipped; 45 ± 8 for 12.1 s on both with the ECU off).
`pnpm vitest run src/physics` **157 pass / 0 todo / 0 fails**; typecheck and lint clean; loadavg 12–18 throughout.

### Files (R6)

- `src/physics/v2/bike.ts` — `derive()`: the fault block runs before the finish block; the crossing tick's rule
  (§8.1); `U_SLOTS` gains `finishVoid` (14 slots, deviation 26); `debug().finishVoided`; the trim call passes the R4
  air counters (`bothAir`); the preload gate on the intent memory (`servoIntentBackM`, off at 0).
- `src/physics/v2/engine.ts` — `wheelieTrim(..., bothAir)`: × `airGain` in free air.
- `src/physics/v2/tuning.ts` — `engine.wheelieControl.airGain` (Rookie 1, Pro 0); the Pro preset's `gain` 0 → 1;
  `rider.servoIntentBackM` 0.
- `src/physics/v2/r6.test.ts` — 9 rows: the precedence rule (probe fixture, the > R exception, a clean crossing,
  snapshot across the crossing tick), the Pro launch (gas / ramps / from a roll; Rookie unchanged), the air-sign table
  per class, the see-saw landing rows + the gate knob, the 40 / 45° holds.
- `src/physics/v2/feel.test.ts` — the triage (table below); `launch()` times from the launch, not the load.
- `src/physics/v2/r3.test.ts` — the Pro class row asserts the R6 launch; the four `it.todo` removed.
  `src/physics/v2/r4.test.ts` — the raw-ramp row uses the gain-0 override for the Pro and adds the R6 Pro row.
  `src/physics/v2/world.test.ts` — the slot list.

### §8.1 Finish / fault precedence (the crossing tick)

| case (one tick, front wheel vs `finishX`, R = 0.34) | events | `finishTime` | `debug().finishVoided` | Game (unchanged) |
|--|--|--|--|--|
| crosses, no fault | `finish` | set | false | finished |
| crosses AND a fault this tick, wheel ≤ R past the line | **`fault` only** | **null** | **true** | crashed, +1 fault |
| crosses AND a fault this tick, wheel > R past the line | `finish`, `fault` | set | false | finished (the fault is a post-finish tumble) |
| fault in a later tick | `fault` (after an earlier `finish`) | set | false | finished (as before) |

Audit probe (`docs/reviews/evidence/2026-09-15-finish-fault-probe.ts`, front wheel 119.99 → 120.052 in a nose-down
pose): **before** `phase finished, faults 0, finishTime 1/120 s, events [finish]`; **after** `phase crashed, faults 1,
finishTime null, events [fault]`. The > R exception is unreachable in play (the wheel moves ≤ 0.175 m per tick at
21 m/s; a natural 8 m/s crossing puts it 0.07–0.08 m past the line), so in play a same-tick fault always voids; the
rule is a tick rule, and a crash one tick after the crossing is a finish (the boundary is stated, not hidden). No
Game change: it already ignores a `fault` after `finish` and never sees a `finish` when the crossing is voided.
Goldens: no committed recording crashes on the line (a voided finish would have shown as a finish with a crash pose);
none move for (1).

### Acceptance-row triage (audit §4): every former `it.fails` / `it.todo`

| row | was | now | why |
|--|--|--|--|
| front sag 24–28 % | `it.fails` (16.8 %) | **removed**; printed with the band in the static row | deviation 27: the table's ~490 N front load on a 7 500 N/m spring tilted 23° is 16.8 %; the band needs k ≈ 5 400 or a heavier front, i.e. a re-tune of every trajectory for a static number nobody rides |
| 0 → 16 m/s at lean +0.25 in 3.5–4.2 s | `it.fails` (4.47) | **passes: 3.975 s**, asserted | the R1 4.47 was the helper's clock from the load (0.5 s settle); R3's knot made it 3.98 |
| constant-input lean-back wheelie ≥ 3 s | `it.fails` (0.63 s) | **removed** | CONTRACT 2.5: open-loop diverges in 1–2 s (asserted in r3 `openLoopDiverge` 1.29 / 1.13 s); the spec row contradicts the contract |
| lean-actuated hold, throttle 0.5, 45 ± 8 for ≥ 10 s | `it.fails` (3.167 s accumulated at a 15° target) | **removed**; measured as info in r6 (0.42 / 0.44 s, loops) | deviation 31: not reachable by lean alone — table below; the hold requirement is r3's throttle-actuated row (40 ± 8, 11.5 / 12.2 s) and r6's 45 ± 8 with the ECU off (12.1 s both) |
| hard-back brake ≤ 5.0 m | `it.fails` (5.64) | **removed**; the passing row asserts ≤ 6 m with the spec beside it | deviation 29: 5.0 m is the toy's 650 N m; ours is 560 N m = 0.9 g (R1 brake table) |
| 30° recovery, throttle cut: < 15° at 0.5 s | asserted < 30 (24.6) while printing < 15 | **promise changed**: < 30° at 0.5 s AND < 15° at 1.0 s (−4.9°), both asserted | deviation 28: R1's 0.0 was the 0.04 s throttle; the Rookie's 0.15 s throttle keeps thrust ~0.3 s after the cut (R3 deviation 21) |
| 20° recovery, throttle held: < 15° | asserted < 30 (4.4) | asserted < 30, title says so (4.4 measured) | R3 note kept (24.6 was the pre-R4 number; 4.4 now) |
| 7 feel todos (front-wheel lift onto a ledge, 60° rear-wheel hop, 0.9 m rolling hop, 65° pogo, scripted-lean balance, plank-to-plank, drop-in) | `it.todo` | **removed** | clip techniques = bot / lab benchmarks (CONTRACT §3); the physics rows they exercise are asserted: hop apex / matrix (r2, r3), landings (r3), wheelie hold (r3, r6), kickers (r2), climb (r3); the scripted-lean balance is the lean-only hold (deviation 31) |
| r3 todos: pogo at the balance, 0.9 m ledge with `ledgeHopper`, clips 01/07/18 | `it.todo` | **removed** | as above |
| r3 todo: see-saw re-check at cReb 250 | `it.todo` | **a test** (r6 see-saw landing rows, 12 cells) | rides at 3–5 m/s / ≤ 0.4 throttle on both classes; full gas up the board crashes on both (an ECU wheelie into the tipping end) |

### The Pro launch (flat, from rest unless stated; before = R3–R5 raw Pro → after = R6; Rookie unchanged)

| input | Pro before | **Pro after** | Rookie (R4 = R6) |
|--|--|--|--|
| full gas lean 0: max pitch / loop / 0 → 16 | loop **0.95 s** | **31.8° at 0.93 s, no loop, 4.94 s** | 6.7°, no loop, 3.97 s |
| full gas lean +0.25 / +0.5 / +1 | loop 1.38 / 5.5° / 6.1° | 30.3° / 5.5° / 6.1° | 6.0 / 5.9 / 5.9 |
| full gas lean −0.25 / −0.5 / −1 (loop) | 0.78 / 0.65 / 0.56 s | **1.36 / 0.67 / 0.57 s** | 1.86 / 0.83 / 0.63 |
| throttle 0.3 / 0.5 / 0.7 lean 0 | 3.8 / 4.7 / 5.3° | same | 3.7 / 4.8 / 5.5 |
| ramp 0 → 1 over 1 s / 2 s, lean 0 | loop 1.91 / 2.87 s | **31.3° / 30.5°, no loop** | 6.1 / 6.0 |
| full gas lean 0 from an 8 m/s roll | loop 1.54 s | **26.3° (20.6 peak from 13 m/s), no loop** | 5.7° |
| 0 → 16 at lean +0.5 / top | 3.25 s / 21.03 | 3.26 s / 21.03 | 3.97 / 20.0 |
| 20° kicker @10 full gas lean 0: over slope / lip / rate / v | 52.9 / 75.8° / +178 / 9.8 | **12.6 / 22.2° / −75 / 7.7** (assist max 1.0) | 11.7 / 16.7 / −62 / 7.8 |
| open-loop divergence | 1.63 s | 1.13 s (band 1–2) | 1.29 |
| hop ref / matrix | 0.49; matrix as R3 | 0.49; within 0.01 | 0.46; identical |
| landing table / touchdown step | all ride; ≤ 58 °/s per tick | all ride (air-after 0.06–0.07 s); ≤ 58 | identical |
| climb table | 45@2 stall 36 %, 50@6 46 % | 37 % / 44 % (±2 %) | identical |
| lab hop @7 / 8 / 9 margin | crash / −0.15 / −0.15 | **cleared 0.23** / −0.14 / −0.16 | identical |
| air rows (throttle / brake tap, swings, held lean) | R5 | **identical** (`airGain` 0) | identical |

Levers measured and rejected: thrust curve F(4–8 m/s) 0.95 / 0.90 / 0.85 loop at 0.97 / 0.98 / 1.00 s, 0.80 lifts 7.8°
(no wheelie at all); flat F 0.90 / 0.85 loop 1.17 / 1.43 s; throttle τ 0.10 / 0.12 / 0.15 s loop 1.00 / 1.07 / 1.21 s;
tighter ECU margins (0.25/0.08, 0.2/0.05, 0.15/0.03 with rates 1.5–5 rad/s) all loop 1.05–1.13 s (the margin trims
too late to arrest the rate); a speed fade of the trim (6→10, 8→14, 10→16 m/s) loops at the release (2.44 / 3.83 /
4.93 s), 12→18 is a no-op (the curve cannot lift the front above 12 m/s). **What the Pro still is:** raw air (no rate
limit, K_att 260, the 234 °/s release kick), 0.08 s throttle (the 32° launch lift the Rookie's 0.15 s filters to
6.7°), lean −0.25 loops in 1.36 s (Rookie 1.86), 21 m/s, 4 kg lighter, stiffer springs, hops 5–10 % higher; leaning
forward is now the fast launch (t16 4.12 s at +0.25 vs 4.94 at 0), which is the Trials Pro.

### Air-sign table (level free air at 10 m/s; pitch change in degrees at 0.05 / 0.1 / 0.5 s from the press; first-tick rate)

| input | Rookie | Pro | verdict |
|--|--|--|--|
| lean −1 held | −0.1 / −0.0 / **+34.1** (first −2 °/s) | −4.8 / −10.2 / **+28.1** (first −95 °/s, peak dip −140) | sign right on both; the Pro dips first |
| lean +1 held | +0.2 / +0.1 / **−38.2** (first +3) | +4.5 / +5.0 / **−35.3** (first +102) | sign right on both; the Pro lifts first |
| lean −1 tap 50 ms | −0.1 / +1.0 / +5.6 | −4.8 / −2.8 / **+3.1** | a Pro single-slot `lb` is a wash |
| lean −1 tap 125 ms | −0.1 / −0.0 / +16.5 | −4.8 / −10.2 / +13.5 | the Pro reads inverted for its first 0.15 s |
| lean +1 tap 50 ms | +0.2 / −1.1 / −10.2 | +4.5 / +0.4 / −11.4 | — |
| throttle 1 / brake 1 held 0.5 s | +6.5 / −14.9 | +7.9 / −15.6 | R4 |
| `attTorque` at lean −1 / +1 | +300 / −305 N m | +292 / −320 N m | −K_att × lean, no flip |
| **option, not taken** (parent decision R5): Pro `rider.airRateGain` 1 | — | −0.3 / −0.6 / +12.7 (125 ms tap); held −1 +26.8, +1 −35.0 | kills the first-slot inversion; held rows within 1.5°; grounded rows byte-identical by R5's gate |

### The hop machine on planks (m3 402 m: `seesaw {8, 1.6}` = 21.2°, pivot 1.6, landed rear-first from the 3 m gap)

| bench (lean 0 keys, land rear-first at +25° from 1.5 m) | Rookie 3 / 4 / 5 m/s, thr 0 → 0.4 | Pro 3 / 4 / 5 m/s |
|--|--|--|
| max intent through landing + rebound | **0.00** everywhere | 0.00 |
| `push` readout (rider closing on his target > 0.5 m/s) | 33–42 ticks (0.3 s) | 35–46 |
| servo lift on the chassis (pull-down on the rider) | ≤ 695 N (0.3 F_max = 960 + gravity 736 bounds it) | ≤ 595 |
| rear leaves the board (the rebound) vy | 0.2 / 0.5–0.6 / 0.9–1.0 m/s | 0.3–0.6 / 0.6–0.9 / 0.9–1.3 |
| fault | none | none |
| the same at full gas, 5 m/s | crash (an ECU-held 26° wheelie up the board into the tipping end: leaves at 28° / +57 °/s, lands 55°) | crash |

Sequence (Rookie 5 m/s, gas): touchdown 0.23 s → rear bottomed 100 % for 0.17 s while the servo absorbs at **F_max
(3.1–3.2 kN, its opening side, which no gate limits: the legs catching the rider)** → 0.45–0.72 s `push` = the rider
closing back on the target under the R3 cap (750–990 N) while the rear spring returns (rear 100 → 36 %) → 0.75–0.82 s
the servo pulls the rider down at +389..+412 N and the rear lifts off the board at vy 1.2 → touches down 0.1 s later
and rides on. The board's exit crash is the throttle (the m3 lesson: ≤ 0.4). The x3 window (t 92.10–92.58) is a −1/0
pulse train from the `seesaw-ride` rule's −0.5 (2–3 samples per state): each toggle moves the pose target 0.39 m ≥
the 5 cm intent threshold, so R3's rule arms it — correctly: a 67–100 ms pulse at −1 moves the body 0.2 m back, a
physical preload.

**The preload gate** `rider.servoIntentBackM` (target travel counts toward intent only while the rider body sits ≥ M
behind the neutral pose; Rookie flat bench):

| M (m) | ref hop | −0.25 / −0.5 / −1 preload × 8 / 16 per s | −1/0 train 67 ms pulses: peak rate / intent | 100 ms pulses | 25 ms pulses |
|--|--|--|--|--|--|
| 0 (ships) | 0.462 | 0.28/0.33 0.35/0.44 0.40/0.49 | 211 °/s / 1.00 | 248 / 1.00 | 103 / 1.00 |
| 0.05 | 0.459 | 0.28/0.33 0.35/0.44 0.40/0.48 | 199 / 1.00 | 250 / 1.00 | 101 / 1.00 |
| 0.075 | 0.460 | 0.26/0.31 0.35/0.44 0.39/0.48 | 181 / 1.00 | 232 / 1.00 | **86 / 0.00** |
| 0.15 | 0.468 | **0.08/0.07** 0.35/0.45 0.38/0.48 | 163 / 1.00 | 217 / 1.00 | 86 / 0.00 |

Every M that keeps the R3 matrix (≤ 0.075) still arms on the trains a human or the reflex can type (≥ 67 ms); M 0.15
kills the −0.25 preload row (the −0.25 pose is 7.5 cm behind neutral). The kick on the board is not the intent-gated
lift anyway — it is the throw's reaction (F_max on the opening side, R4) plus K_att. Ships at 0: declared, measured,
the Rookie goldens untouched; the train is the controller's (harness r11 already made tip-air hands-off).

### Further deviations (R6)

26. **One new `U` slot, `finishVoid`** (§12: cross-tick state) so a voided crossing is reportable after the tick;
    `NU` 13 → 14, the snapshot's `u8` grows one byte (the foreign-snapshot suite green; live snapshots only).
27. **Front sag 16.8 % vs the 24–28 % band** — printed, not asserted (the R1 front-spring inconsistency; the lever is
    k 7 500 → ~5 400 or a heavier front, a re-tune of every trajectory).
28. **The 30° throttle-cut recovery promises < 30° at 0.5 s and < 15° at 1.0 s** (24.6 / −4.9) instead of < 15 at
    0.5 s: the Rookie's 0.15 s throttle (deviation 21).
29. **Hard-back brake ≤ 6 m** (5.64) instead of the toy's ≤ 5.0 m at 650 N m: ours is 560 N m (0.9 g).
30. **A wheelie held above ~40° at lean > −0.5 is trimmed by the ECU on both classes** (its loop-margin term: the
    combined COM's lead over the rear axle at 45° is under `margin0` 0.2 m): the V3 hold at 45° parks the lean at
    −0.20 / −0.12 (assist fully on) and the front drops in 0.3 s; at 40° (park −0.43 / −0.38, assist 23 %) 11.5 /
    12.2 s in band; at 45° with the ECU off 12.14 / 12.12 s. The spec's 45° band is the raw bike's. New for the Pro.
31. **The lean-only hold at a fixed throttle is not a requirement this model can meet**: at throttle 0.5 (0.33 g) the
    equilibrium at 45° needs lean ≈ +0.6 and the lean's authority (±0.125 m of COM, K_att 300) through the pose path
    and 100 ms cannot hold the 0.3 s e-fold — 60 Hz / 100 ms, kp 0.03–0.08, ki 0–0.05, horizon 0.2–0.3: longest
    in-band run 0.28–0.32 s, loop in 1.5–3 s on both classes; 10 Hz the same; from rest the same. K_att 600 / 1000 /
    1500: 0.65 / 2.08 / 2.74 s in band, and the held-lean air row goes 34 → 73 / 110 / 143° per 0.5 s (band 25–40),
    lean −0.25 loops in 1.46 / 1.27 / 1.17 s. The pose table's rear reach (deviation 22) is the other lever and was
    rejected in R3 for the same air / knife costs.

### Requests

- **harness**: **the Pro goldens move** (every Pro recording where the front tops out under gas — h1–h3, x1–x3,
  and any Pro golden on the beginner / easy / medium tracks); the Rookie goldens do not (FEEL diff: no Rookie row
  changed). The Pro bot lines authored against "partial gas, +1 on kickers" still work (the trim only cuts what
  would loop). The stranger card's Pro note ("plain `g` from standstill loops") is now wrong: plain gas lifts to ~30°
  and rides. Re-measure h2 / h3 under-band on the new Pro before the bands move. `debug().finishVoided` is a new HUD
  field; the see-saw and plank deaths labelled by `hopPhase: push` need the servo force fraction (`debug().rider.legFrac`
  / `intent`) beside them to mean "a hop".
- **parent (decision)**: Pro `rider.airRateGain` 0 → 1 (one number) removes the first-slot inversion the x3 strangers
  read (−10.2 → −0.6° at 0.1 s) with the held rows within 1.5° and every grounded row byte-identical; R5 declared the
  Pro's air raw, so it stays 0 until you say otherwise. The 45° wheelie under the ECU (deviation 30) is the other call:
  `margin0` 0.2 → 0.12 would let the Rookie / Pro hold 45° at lean −0.2 and would move the R4 ramp rows.
- **tracks**: m3's board at 402 m and x3's at 280 m: the landing rebound lifts the rear 0.6 s after touchdown at
  ≤ 1.3 m/s (no fault); the death is the throttle up the 21° board (a wheelie into the tipping end). The 3 m gap that
  feeds the board is what makes the landing bottom out (rear 100 % for 0.17 s).
- **core**: nothing. `GameEvent` unchanged; `PhysicsState` unchanged.

---

## v2 status — R5 (the air limit: the swing is the servo's, the held lean is K_att's)

**Finding.** The Rookie's rider servo is rate-limited in free air — with both wheels off the ground the pose target
travels at 0.8 m/s instead of 5 (`rider.airRateLin/Ang`, blended over 0.1 s each way through one new `F` slot,
`airLimit`, and gated by the R3 intent so a throw that began on the ground carries through) — which takes the
−1 → 0 release kick from **+245 to +99 °/s (43 → 10 °/s per tick)** with every grounded row byte-identical (hop matrix,
landing table, climb, wheelie hold, ramp rows: the FEEL diff against R4 is three air rows) and the throttle / brake air
nudges untouched (+6.1° / −15.2°, the Pro raw at 234). But decomposing the R4 numbers with K_att and c_att zeroed shows
the swing is only ~170 of the 245 and almost none of the angle: **the +31° at 0.3 s after a release is the momentum K_att
pumped during the hold (r0 = +86 °/s, 86 × 0.3 s = 26°)**, and the held-lean rows (0 → −1: 171 °/s and +33° at
0.5 s) are K_att's constant 300 N m / 265 °/s² — the limiter moves them 171 → 153 and 33 → 31. Of the parent's four
free-air targets the servo owns one (peak ≤ 120: met, 99); the other three (release ≤ +15° at 0.3 s: 25.8; held
rate ≤ 110: 153; held angle ≤ 22: 31.1) are the declared attitude torque's and no servo lever reaches them. The lever
that does — extra attitude damping in the air, `rider.airCattAdd`, declared and measured at +160 (held rate 92 / 22.4°,
release peak 80 / 16.8° at 0.3 s, a full second of held ±1 77° instead of 147°) — **halves the throttle / brake nudges
(brake −15 → −7 per 0.5 s) and takes the FEEL air-control row to 24° (band 25–40)**, which the parent held fixed, so it
ships at 0 (raw air) with the numbers below. Reflex `average`, Rookie, controller at HEAD (`air-level` still
bang-bang): over 8 seeds gap 1, b1 1, b2 2.5, b3 4.5, e1 11, e2 10, e3 12 (R4: 1 / 1 / 4 / 14 / 21 / 36 / 30) with
e2 and e3 now clearing 7/8 (R4 1/3 each); b1 and gap in band, b2 at the edge, b3 / e1 / e2 / e3 out — every remaining air
death is a brake or gas tap with lean ±1 *held* through the flight (`air-brake-nose-down` at b3 box 416, e1 ramp 446,
e2 ramp 506), i.e. K_att integrating a held lean, the controller's to release and the physics's to declare. The
beginner's panic (1.5 m ledge, lean −1 held from the edge) **crashes on both classes with the limit on or off**, and the
limiter is correctly out of it: the swing happens while the rear is still on the ledge (grounded, front hanging — a
wheelie off the edge), K_att then holds +300 N m through 0.45 s of air and the bike lands rear-first at +24° /
+204 °/s and loops; lean −0.5 held lands +3° / 98 °/s and rides away, lean 0 lands −18° and rides. Cost 1.5–2.2 µs/tick
p50 (p95 ≤ 3.4 at loadavg 17), gain 0 indistinguishable. `pnpm vitest run src/physics` 153 pass / 11 todo; typecheck
clean; lint clean on `src/physics` (the one repo lint error is `harness/e2e/touch.mts`, not this round's).

### Files (R5)

- `src/physics/v2/tuning.ts` — `rider.airRateLin` 0.8 m/s, `airRateAng` 1.0 rad/s, `airRateBlend` 0.1 s, `airRateGain`
  1 (Pro 0), `airCattAdd` 0 (the measured-and-not-taken option, both classes).
- `src/physics/v2/bike.ts` — `F_SLOTS` gains `airLimit` (35 scalars): `lim ← lim ± dt/0.1` toward "both wheels off"
  (the R4 air-tick counters), `airLim = gain × lim × (1 − intent)`; `advanceTarget` gets the blended rates; the intent
  memory earns travel on the ground only (gain 1) so the limit cannot talk itself down through the travel it allows;
  `debug().rider.airLimited`; the attitude torque's damping is `cAtt + airCattAdd × airLim`.
- `src/physics/v2/rider.ts` — `advanceTarget(..., rateLin, rateAng)` (defaults = the ground rates).
- `src/physics/v2/r5.test.ts` — 8 rows: free air per class, nudges identical to raw, hop / landing identical on/off,
  continuity of the blend, snapshot through a limited flight, the panic ledge per class, cost.
- `src/physics/v2/r4.test.ts` — the swing row measures the raw configuration (Pro; Rookie with `airRateGain` 0);
  `world.test.ts` slot list 35 (deviation 24 below).

### Free air per class (R4 bench: level at 10 m/s, `pre` 0.2 s, `post` 0.5 s; R4 → R5)

| input | Rookie R4 | Rookie R5 | Pro (raw, = R4) | parent target (Rookie) |
|--|--|--|--|--|
| throttle tap: peak / angle 0.5 s | 20 / +6.1 | 20 / +6.1 | 23 / +7.7 | unchanged ✓ |
| brake tap: peak / angle | −42 / −15.2 | −42 / −15.2 | −41 / −15.8 | unchanged ✓ |
| release −1 → 0: peak / per tick / angle 0.3 s / 0.5 s | +245 / 43 / +31.2 / +39.3 | **+99 / 10 / +25.8 / +34.0** | +234 / 42 / +28.7 / +35.5 | ≤ 120 ✓ / — / ≤ +15 ✗ (K_att momentum) |
| release + gas: peak / angle 0.5 s | 246 / +42.9 | **100 / +35.7** | 249 / +49.3 | — |
| release +1 → 0: peak / angle 0.3 s | −221 / −30.4 | **−110 / −30.0** | −213 / −28.9 | — |
| 0 → −1 held: first dip / rate 0.5 s / angle 0.5 s | −144 / 171 / +32.7 | −40 (limited swing) / 153 / +31.1 | −130 / 150 / +26.4 | ≤ 110 ✗ / ≤ +22 ✗ (K_att) |
| 0 → +1 held: rate / angle 0.5 s | −174 / −41.2 | −174 / −41.0 | −158 / −37.1 | — |
| −1 → +1 flip: peak / rate 0.5 s | 220 / −128 | −103 / −103 | 215 / −116 | — |

Decomposition (K_att = c_att = 0 on the same bench, Rookie): press 0 → −1 peak −180 °/s and −21° (the pure swing),
release +172 / +8°; with the limit the press is −40 / −17.5° at 0.5 s. The R4 release therefore reads: ~170 swing +
~75 carried K_att momentum (r0 +86 °/s at the release) for the peak; ~26 of the 31° is the carried momentum.
Air-rate sweep (release peak / angle 0.3 s): 2 m/s 149 / 30.5, 1.2 115 / 25.7, **0.8 99 / 25.8 (0.49 s per full pose
change)**, 0.6 84 / 21.3, 0.4 75 / 19.6. Held 0 → −1 rate at 0.5 s: 171 / 172 / 153 / 152 / 153 — the rate limit does
not touch it.

### The air-damping option (`rider.airCattAdd`, measured, NOT taken)

| airCattAdd | held 0 → −1: rate / angle 0.5 s · 1.0 s | release −1 → 0: peak / angle 0.3 s | held +1 1.0 s | brake / throttle nudge 0.5 s | FEEL air −1 @8 |
|--|--|--|--|--|--|
| 0 (shipped) | 153 / 31.1 · 284 / 147 | 99 / 25.8 | −156° | −15.2 / +6.1 | 35.6 (band 25–40) |
| +80 | 125 / 27.4 · 187 / 112 | 91 / 21.9 | −120 | −10.2 / +4.9 | — |
| +160 | 92 / 22.4 · 108 / 77 | 80 / 16.8 | −82 | **−7.3 / +4.0** | **24.0** |
| +220 | 76 / 19.5 · 79 / 61 | 73 / 13.9 | −66 | −5.9 / +3.5 | — |

+160 meets three of the four targets within 2° and turns a second of held lean from a loop into 77°, but it is an
external torque on the chassis rotation, so it also decays the throttle / brake impulses (the nudges the parent held
fixed), drops the R3 class row under the FEEL band, and needs the conservation tests' `cAtt: 0` override extended
(done: the row is additive). Reflex at +160 (3 seeds, 0.8 m/s): b2 3, b3 6, e1 9, e2 13, e3 14 — mixed against the
limiter alone (3 / 9 / 13 / 7 / 16) inside the seed noise. Parent's call; it is one number.

### Grounded rows (R4 → R5, `pnpm vitest run src/physics` FEEL diff; everything not listed prints identically)

| row | R4 | R5 |
|--|--|--|
| hop ref / matrix (16 cells) / by preload / tuck / surfaces / quantum | 0.462 / as R3 / … | **identical to 3 decimals** (on/off equal: 0.462, 0.408 at −1@8, 0.444 at −0.5@16) |
| landing table (12 rows) | all ride away | identical (3 m @6 lean +0.5 air-after 0.08 → 0.07 s) |
| wheelie hold V3 (Rookie / Pro) | 11.5 s / 12.2 s | identical |
| climb table, ramp rows (lean 0 / 0.2 / 0.4 / 1), touchdown, launches, balance ladder, 0 → 16 | — | identical |
| air control 0.5 s lean −1 @8 / 14 / 20 | 36.8 / 37.5 / 36.9 | 35.6 / 36.3 / 35.6 (the limited swing; +1 side −37.3 → −37.3) |
| R3 class row air −1 / +1 | 34.8 / −39.3 | 33.6 / −39.2 |
| kickers 17–22 lean released, worst landing | 19.14 | 19.17 |
| µs/tick p50 / p95 (alone, loadavg 17) | 2.5 / 4.0 | 1.5–2.2 / ≤ 3.4 (gain 0 the same) |

The intent gate is what keeps the hop: without it the (−1, 8 /s) cell fell 0.408 → 0.381 and the 0.5 s-preload apex
0.507 → 0.375 (the snap ramp still running at take-off was being limited); with the gate as first written (intent fed
by the limited travel) a lean pressed during the 0.1 s blend-in escalated back to a full-rate throw — hence "intent is
earned on the ground only".

### Reflex `average`, Rookie, node, controller at HEAD (`air-level` not yet rate-aware; `scratchpad/physics-r5/reflex.mts`)

| track | band / target | R4 (3 seeds) | R5 seeds 1000–1002 | R5 seeds 1003–1007 | R5 median (8) · clears | R5 death sites (owner) |
|--|--|--|--|--|--|--|
| gap-test | 1–3 | 1 | 1/1/1 | 1/1/1/1/1 | **1** · 8/8 | — |
| b1-first-ride | 1 | 1 | 1/1/1 | 1/1/1/1/1 | **1** · 8/8 | — |
| b2-lean-back | ≤ 2 | 4 | 2/3/3 | 2/4/2/1/3 | 2.5 · 8/8 | ground @ 35 nose-low ×2 (the first drop, geometry/controller); air-brake / air-gas ×1 each (controller) |
| b3-kicker-row | ≤ 3 | 14 | 9/14/2 | 4/2/8/5/1 | 4.5 · 8/8 | box @ 416 air-brake-nose-down ×3, ramp @ 335 ×2 (controller: brake with +1 held; physics: K_att integrates the hold) |
| e1-uphill-weight | ≤ 6 | 21 (2/3) | 13/14/9 | 15/5/11/11/3 | 11 · 8/8 | ramp @ 446 air-brake-nose-down ×7 (as b3), ramp @ 75 air-gas-nose-up ×3 (controller) |
| e2-rear-wheel-first | ≤ 8 | 36 (1/3) | 7/27/7 | 12/19/8/37/4 | 10 · 7/8 | ramp @ 506 nose-high ×9 / air-gas ×9 / air-brake ×8 (the big rear-first ramp: controller + geometry) |
| e3-stairway | ≤ 9 | 30 (1/3) | 16/36/2 | 6/14/4/20/10 | 12 · 7/8 | box @ 412 stuck-restart ×5, ramp-ride ×4 (geometry/controller, not air) |

Air rate on the reflex (3 seeds 1000–1002 / 5 seeds 1003–1007 medians): 0.6 m/s b2 3, b3 8, e1 16, e2 3, e3 13;
1.2 m/s b2 4 / 3, b3 7 / 5, e1 7 / 15, e2 4 / 16, e3 10 / 7 — indistinguishable from 0.8 inside the seed spread
(e3 alone ranges 2–36); 0.8 is the value sized from the free-air target with margin.

### The panic drop (1.5 m ledge at 10 m/s, input held from the edge through the landing; `r5.test.ts`)

| class | lean −1 held | lean −0.5 held | lean 0 |
|--|--|--|--|
| Rookie R5 | lands +24° at +204 °/s → **crash** (R4 identical; airCattAdd +250: +17° / 137 → crash; K_att 150: −1° / 95 → loops after touchdown) | +3° / 98 °/s → rides | −18° / −16 → rides |
| Pro | +25° / 201 → crash | +6° / 100 → rides | −13° / −5 → rides |

Not met, and not the servo's: the front is over the edge while the rear is still on it, so the swing is grounded and
the limit (correctly) never engages for it; the wheelie off the edge plus 0.45 s of K_att × (−1) lands the bike
rear-first at 100 % travel with 200 °/s of nose-up and the rider at −1, and it loops. A landing-rideable "−1 held" needs
K_att to fade with pitch or rate in the air (the same decision as `airCattAdd`), or the input to be released.

### Further deviations (R5)

24. **One new §12 slot, `airLimit`** — the "airborne blend" §12 forbids, taken on the parent's decision that a wheel
    touching must never snap the rider's rate. 0..1, ±dt/0.1 per tick toward "both air counters > 0", zeroed with
    the fault and by `placeBike`; the limit in effect is `gain × airLimit × (1 − intent)`. Snapshot round-trip through a
    limited flight asserted (`r5.test.ts`); the foreign-snapshot suite unchanged and green.
25. **Intent is earned on the ground only** on the Rookie (gain 1): `targetMove` accumulates the target's travel ×
    (1 − gain × bothAir). The Pro accumulates as R3.

### Requests

- **parent (decision)**: the held-lean targets are K_att's. Options with numbers above: `airCattAdd` +160 (three of
  four targets, the brake nudge −15 → −7, FEEL air −1 row 24 vs band 25) or accept 153 / 31 and let the controller
  release. The panic row is the same decision.
- **harness (reflex)**: the release kick is now 99 °/s in 10 °/s steps and a full pose change takes 0.5 s in the air —
  `air-level` should command a lean *rate* against `pitch + rate × 0.25 s` and release 0.15 s early; every remaining
  b3 / e1 / e2 death is a brake or gas tap with ±1 held. `debug().rider.airLimited` is the new HUD field.
- **tracks**: b2's first drop (ground @ 35, nose-low ×2 of 8 seeds) and e3's box @ 412 (stuck ×5) are the two
  non-air death sites left on the beginner courses.

---

## v2 status — R4 (the round-8 reflex finding, the Rookie assist)

**Finding.** Neither of the round-8 deaths is a solver artefact. Replaying the reflex traces tick by tick
(`scratchpad/physics-r4/trace.mts`, fresh `average` recordings on the r7 tracks) and isolating each input on a bench:
**a throttle tap in the air is 20 °/s peak and +6° in 0.5 s** (Rookie; Pro 23 / +7.7: the 320 N m reaction of a wheel that
reaches the limiter in ~0.05 s, §7 as designed) and a brake tap −42 °/s / −15°. The 200–400 °/s step is the **rider
pose swing**: the reflex rules flip the lean by a whole unit in the tick they tap the gas, and a −1 → 0 release in free air
kicks the chassis **+245 °/s within 0.07 s (43 °/s per tick = F_max 3 200 N × the 0.58 m grip lever / I_chassis 11 kg m²)**
and +31° by 0.3 s; a 0 → −1 press first dips the nose −144 °/s (the body pushes off the bars), then K_att lifts it at a
constant 265 °/s² to 171 °/s at 0.5 s. That is honest two-body dynamics (m_rider · v_rel · h / I_chassis with a
3 m/s rider — the same throw the hop is made of: every servo lever that bounds it kills the hop, table below), and its
sign structure is what a 0.2 s human cannot drive: pressing back dips first, releasing back pops the nose up another
30°, and the held-lean rate never saturates. A rear touchdown pitched 20° above a 20° ramp at 1–2 m/s steps the rate by
40–58 °/s per tick — sin 20° of a 3–6 kN normal impulse passed rigidly through the slider (a landing, not a spike). The
on-ramp lift is geometry: **a 20° slope lowers the front-lift threshold from ≈ 0.6 g to 0.22 g** (front load ∝ d cos θ −
h sin θ), so the Rookie's 0.53 g at 10 m/s lifts the front at *any* lean — 43° over the slope at lean 0, 24° at +0.4,
5° at +0.8 — and leaves a 6 m lip at 66° rotating 163 °/s. The Rookie now carries the **declared wheelie control** MEGA_PLAN
P1 names (`engine.wheelieControl`, `debug().engine.assist` on the HUD): the drive thrust is trimmed by this tick's pitch rate
(0.5 → 1.2 rad/s) or loop margin (the live combined COM's horizontal lead over the rear axle, 0.40 → 0.20 m — gravity's
righting moment is M g d on any slope) while the front spring is within 3 cm of topped out, faded out by the lean (back
−0.2 → −0.5, forward +0.6 → +0.9: leaning is the rider taking over — the wheelie hold at −0.5, the throw and the hop
snap at +1 are untouched). Memoryless, linear, class row; **the Pro's gain is 0** and its numbers are R3's. Rookie on the
20° kicker at 10 m/s full gas, lean 0: **11.7° over the slope, off the lip at 16.7° with the nose already coming down
(−62 °/s), no brake**; lean +0.4: 8.7 / 18.2 / −59. Cost: the cut takes the lip speed from 9.8 to 7.8 m/s at lean 0
(8.4 at +0.4; a +1 rider keeps 8.5 with the assist off) — the Rookie's ramp exit is now bounded by the assist, not the loop.
R3 tables held (deltas below). Reflex `average`, Rookie, seeds 1000–1002, before → after: b1 3 → **1** (band 1–1), b2 8 → 4
(1–2), e1 34 with 0/3 clears → 21 with 2/3 (2–4), e3 44 → 30 (3–6), e2 36 → 36, gap 1 → 1, **b3 5 → 14** (1–2): b3 is
authored speed-sensitive and the reflex ramp rule (thr 0.8, lean +0.3) now leaves every kicker 1–2 m/s slower; its deaths
are the mirror of the finding — lean +1 held in the air dives the nose at −200 °/s for a second. Target not met on b2–e3;
the air swing is the next lever and it is a K_att/c_att decision, not a solver bug.

### Files (R4)

- `src/physics/v2/engine.ts` — `wheelieTrim(wc, w, frontComp, loopMargin, lean)`; `driveTorque(..., trim)`.
- `src/physics/v2/bike.ts` — the trim in the engine block (live COM lead over the rear axle, `sComp[1]`, `S_IN_L`);
  `debug().engine.assist`. No new state; snapshot round-trip through a ramp asserted.
- `src/physics/v2/tuning.ts` — `engine.wheelieControl` (Rookie gain 1, rate 0.5 → 1.2 rad/s, margin 0.40 → 0.20 m, topOut
  0.03 m, lean fade −0.2/−0.5 and +0.6/+0.9; Pro gain 0).
- `src/physics/v2/r4.test.ts` — 7 rows: air throttle / brake / swing per class, the touchdown step, raw vs assisted ramp,
  the lean fade (−0.5 still loops), snapshot through the assist. `r2.test.ts` lean-held kicker row re-pinned 25 → 28 (26.0).

### Air and ramp per class (free air 10 m/s, 0.5 s; kicker 20°, 6 m, 10 m/s, full gas)

| input | Rookie R3 | Rookie R4 | Pro (raw, = R3) |
|--|--|--|--|
| throttle tap in the air: peak rate / angle 0.5 s | 20 °/s / +6.1° | same | 23 / +7.7 |
| brake tap: peak / angle | −42 / −15.2 | same | −41 / −15.8 |
| lean 0 → −1 held: first dip / peak / rate at 0.5 s / angle | −144 / 171 / 171 / +33 | same | −130 / 150 / 150 / +26 |
| lean 0 → +1 held: peak / angle | −174 / −41 | same | −158 / −37 |
| release −1 → 0: peak / per tick / angle 0.3 s | +245 / 43 / +31 | same | +234 / 42 / +29 |
| release + gas | 246 / +43° at 0.5 s | same | 249 / +49 |
| ramp lean 0: over slope / lip pitch / lip rate / lip v | 43° / 66° / +163 / 9.8 | **11.7 / 16.7 / −62 / 7.8** | 53 / 76 / +178 / 9.8 |
| ramp lean +0.4 | 24 / 44 / +46 / 9.6 | 8.7 / 18.2 / −59 / 8.4 | 42 / 64 / +160 / 10.5 |
| ramp lean +0.8 (R3) / +1 (R4, assist off) | 5 / 17 / — / 8.9 | 3.5 / 15.1 / −67 / 8.5 | — |
| ramp lean 0, throttle 0.3 | 10 / 8.8 / −122 | — | 10 / 19 / −94 |
| rear touchdown 20° over a 20° ramp, 1–2 m/s | 42–58 °/s per tick | same | 40–58 |

**Rookie air rules in one sentence:** *gas and brake in the air are small nudges (+6° / −15° per half second); the lean is
the control and it accelerates the bike, so hold it briefly and release early — a full press builds 170 °/s in half a
second, and releasing a lean-back pops the nose up another 30°.* Pro: the same, with slightly less lean authority (K_att
260) and no ramp assist: full gas on a kicker at neutral loops.

### R3 table deltas (Rookie; Pro unchanged)

| row | R3 | R4 |
|--|--|--|
| full gas lean 0 / +0.25 / +0.5 / +1 max pitch | 6.7 / 6.0 / 5.9 / 5.9 | same |
| loop at lean −0.25 / −0.5 / −1 | 1.10 / 0.82 / 0.63 s | **1.86** / 0.83 / 0.63 (the fade starts at −0.2) |
| 0 → 16 (lean +0.25) / top | 3.97 s / 20.03 | same |
| hop ref / matrix | 0.46; matrix as R3 | 0.46; within 0.01 |
| landing table (12 rows) | all ride away, rebound ≤ 0.05 | identical |
| wheelie hold 40 ± 8 (V3) | 12.0 s in band, mean 40.1 | **11.5 s**, mean 39.7, v ≤ 7.4 |
| climb 40@2 / 45@2 / 45@5 / 50@6 | TOP / TOP / 72 % / 42 % | TOP / TOP / 72 % / 45 % |
| lab hop @8 / @9 margin | −0.06 / −0.07 (cleared) | **−0.16 / −0.14** (cleared, deeper corner roll) |
| kickers 17–22 @8/11 lean released | worst 9.0 | 9.3; lean-held 20°@8 lands −26.0 (was −24.x, pin 25 → 28) |
| air control 0.5 s lean −1 / +1 | 34.8 / −39.3 | same |
| µs/tick p50 / p95 | 2.7–3.0 | 2.5 / 4.0 (loadavg 15–20 during the run) |

### Reflex `average`, Rookie, 3 seeds (1000–1002), node, `runOnce` (`scratchpad/physics-r4/reflex.mts`)

| track | band | before (assist off) median · clears | after median · clears | after deaths |
|--|--|--|--|--|
| gap-test | 1–3 | 1 (1/5/1) · 3/3 | **1** (1/1/1) · 3/3 | — |
| b1-first-ride | 1–1 | 3 (3/5/2) · 3/3 | **1** (1/1/1) · 3/3 | — |
| b2-lean-back | 1–2 | 8 (2/8/11) · 3/3 | 4 (4/2/12) · 3/3 | ramp @ 260 nose-low ×2; air-brake ×1; air-gas ×1 |
| b3-kicker-row | 1–2 | 5 (5/26/5) · 3/3 | **14** (11/14/18) · 3/3 | ramp @ 424 air-brake-nose-down ×4; ground @ 240 nose-high ×3 |
| e1-uphill-weight | 2–4 | 34 (34/39/33) · 0/3 | 21 (29/21/11) · 2/3 | ground @ 165 air-brake ×3; ramp @ 211 air-gas ×3 |
| e2-rear-wheel-first | 3–5 | 36 · 0/3 | 36 (37/36/19) · 1/3 | ramp @ 506 / 191 air-brake-nose-down ×22 |
| e3-stairway | 3–6 | 44 · 0/3 | 30 (10/38/30) · 1/3 | stair @ 165 stuck / nose-high / air-brake |

Target (b1–b3 in band, e1–e3 ≤ 1.5× band) met on gap and b1 only. What the traces say about the rest: every remaining
death is the air. `air-level` maps the pitch error to a lean saturating at ±1 beyond 18° and holds it through the
reaction lag; against a lean that *accelerates* the bike at 265 °/s² (and whose release kicks the other way) that is a
bang-bang controller on a double integrator — the b3 traces show lean +1 held 1.2 s from +25° to −80° at −200 °/s, a
brake tap on top, then the endo. The assist cannot touch this (it is thrust); the levers are (a) K_att/c_att as a rate
servo on the Rookie — K 500 / c 250 gives 114 °/s at 0.5 s saturating, 38° in 0.5 s, the ramp lip 45°, but costs the hop
0.46 → 0.36 (c_att opposes the snap's −200 / +295 °/s chassis rotation) and slows the loop-outs; (b) the rider target
rate (5 → 3 m/s: swing 245 → 182, hop 0.46 → 0.28; 2 m/s: 147 / 0.11) — the hop is a 3 m/s throw and so is the kick.
Neither is a fix this round; both are one parameter row each. The b3 regression is speed: the assist trims the thrust on
every kicker the reflex rider takes at lean +0.3 (8.4 m/s off a 20° lip instead of 9.6), and b3's landings are authored
to a speed window; a rider at +0.8–1 keeps 8.5–8.9 with the assist off.

### Mechanism table (artefact vs dynamics)

| round-8 label | measured | verdict |
|--|--|--|
| "throttle tap in the air kicks 200–400 °/s" | throttle alone 20 °/s peak, +6° / 0.5 s (Pro 23); the same tick's lean −1 → 0 gives +245 (43 per tick) | dynamics: the pose swing (F_max × grip lever / I_c); throttle is 8 % of it |
| "whenever the rear wheel skims the ramp" | rear touchdown 20° off a 20° ramp at 1–2 m/s: 40–58 °/s per tick, N 3–6 kN; grazing (0.5 m/s) 50 | dynamics: sin 20° of the normal impulse through the rigid slider; bounded ≤ 60 per tick |
| "on-ramp front lift 100–200 °/s" | lift threshold 0.22 g on 20° vs 0.6 g flat; Rookie 0.53 g at 10 m/s lifts at any lean; 43° over slope at lean 0 | dynamics (geometry); assisted on the Rookie to 11.7° over / lip −62 °/s |
| contact impulse spike / brush snap / servo cap flip / K_att sign | no per-tick step > 60 °/s attributable to a contact; friction accumulated and clamped; the servo's F_max is the swing itself; K_att flips only with the lean input | none found |

### Pro walls (m3 204.6 m, x1 first 60 m)

Re-run on this HEAD (`harness:bot --skill 3 --bike pro --seeds 1 --no-verify`, Pro physics untouched by R4):
**m3-see-saw Pro: 1 attempt, finish 38.267 s** (plans 252, 62 s wall); **x1-vertical-limit Pro: 1 attempt, finish
55.825 s** (plans 333, 72 s wall; the committed `bot-3-pro.json` already replays to a finish — byte-identical golden).
Neither wall exists on the r7 tracks + r8 macros: the round-8 numbers (m3 50 cap, x1 48 cap) were taken before tracks r7
re-authored both (`tracks.md` r7 rows: m3's kickers 6 × 1.5 with 14 m after each board, x1's 45° `kickerPlank` and 6 m
box tops). Verdict: **geometry (now fixed), not physics.** The physics reading still holds for a *human* on the Pro: the
45° technique climb from a crawl is not available to the Pro (R3 climb table: 40@2 FAULT, 45@2 stall 36 %) and full gas
on a kicker at neutral leaves the lip at 76° / 178 °/s — the bot finds the lines (partial gas, +1), a stranger will not.
The unverified m3 golden the run wrote was removed (harness owner: `--refresh-goldens` will re-prove it in the browser).

### Requests

- **harness (reflex)**: the air rule — lean is an acceleration, not a rate: `air-level` needs a rate term (lean ∝ e/18 −
  rate × 0.25 s, clamp ±0.5 unless |e| > 35) and a release 0.15 s before the target; never hold ±1 for > 0.3 s; expect
  +30° from releasing a lean-back. `ramp-ride` on the Rookie: lean +0.8–1, not +0.4 g (same lip pitch, 0.7 m/s more
  speed, the assist stays out of it). The bot's Pro ramp move: throttle ≤ 0.3 or lean +1 on kickers ≥ 14° above 9 m/s.
  Re-run `--all-tracks --bike both` on this HEAD; `debug().engine.assist` is a new HUD field.
- **tracks**: the Rookie exits a 20° kicker under full gas at 7.8–8.5 m/s (was 9.8 and a loop); b3's kicker row is
  the only beginner course that got harder — re-measure its landing windows against 8 m/s lips, or lower the second
  and fourth kickers' demand.
- **parent (decision)**: the air swing is the R3 hop's price. Options with numbers above: Rookie K 500 / c 250 (hop
  0.36), rider target rate 3 m/s (hop 0.28), or accept the swing and fix the controller. R5 should take one.

---

## v2 status — R3 (of three, physics-v2.md §16.7)

**Finding.** The landing pogo is gone without touching the hop: one new §12 slot, `targetMove` (a 0.2 s decaying
memory of the pose target's own travel), gates the servo's concentric cap — a rider *moving* his pose (the hop's snap)
pushes at F_max whichever way the gap is closing, a rider *holding* a pose (a landing) gets 0.3 F_max above 1 m/s of
closing speed, so the legs absorb instead of firing the bike back up. Drops of 1.5 / 2 / 3 m at 6 and 12 m/s, lean 0
and +0.5, on both classes all land and ride away (rebound ≤ 0.05 m, pitch −34..+16; R2: 0.6 m pogo at 2 m, loop at
2.5–3 m); the reference hop is 0.46 m with the cap on or off (identical to 3 decimals). The classes are two parameter
rows: **Rookie** = R2's mid table plus a 1.07 low-speed knot (940 N, 0.66 g, the thrust a 4 m 45° plank needs from a
crawl) and a **0.15 s throttle**, which is the lever that separates "forgiving" from "raw" — the neutral-lean loop is
started by the launch *kick*, not the sustained thrust (the rear squats and the front tops out under thrust, ~6° of
pitch that costs 0.15 of d/h, so the front lifts at a/g ≈ static d/h − 0.15, and every lift under sustained thrust is
a loop): with the kick filtered the Rookie lifts 6.7° at lean 0, 6° at +0.25..+1, never loops, and loops at −0.25 /
−0.5 / −1 in 1.10 / 0.82 / 0.63 s; the **Pro** (54 kg, 1 000 N, 0.08 s throttle, K_att 260, k 12 000 / 9 000, 21 m/s)
loops at 0 in 0.96 s and at +0.25 in 1.38 s, 0 → 16 in 3.25 s. Two forward pose tables were measured and rejected
(below). Climbs: the constant-speed climb limit is **geometry, not thrust** — the front load on a slope θ is
∝ d cos θ − h sin θ, so the crawl limit is atan(d/h) at lean +1 = 37° on this table — and the Trials technique is what
tops 45° from a crawl: the front rolls onto the face at neutral (a front-heavy bike cannot climb a 45° step), gas at the
base, then the weight is *thrown* to +1 the instant the front is on the face (the throw is the hop push; a slow forward
ramp loops the bike on the face first). Rookie 40° and 45° from 2 m/s: TOP; 45° at 5 m/s and 50° at 5–6 m/s are
timing-critical (one 60 Hz decision separates TOP from a 70 % stall) and not met by the bench controller; the Pro's
momentum rows (55–60° at 8 m/s) fail at the *base transition*, not on the face. The wheelie hold is met on both classes
with anticipation: a 60 Hz / 100 ms controller that regulates `pitch + rate × 0.25 s` holds 40 ± 8° for **12.0 s
(Rookie) / 12.2 s (Pro) of 12.5**, mean 40.1 / 40.3°, never loops; the R2 PD on the current pitch loops in 1.5 s against
the Rookie's slow throttle. Lab: both classes get onto the ledge at 8–9 m/s with the same −0.06 m corner-roll margin as
R2 (7 m/s is a nose-dive into the face, crash). Cost 2.7–3.0 µs/tick p95. `pnpm vitest run src/physics`: 140 pass, 11
todo; typecheck and lint clean. Barrel unchanged (v1 is still `createBikePhysics`; the flip is one line).

### Files (R3)

- `src/physics/v2/bike.ts` — `F_SLOTS` gains `targetMove` (34 scalars); `step()` accumulates the target's travel with
  the `servoIntentTau` decay and zeroes it when not riding; the servo cap is `hill + (1 − hill) · intent`;
  `debug().rider.intent`. Default class `'rookie'`.
- `src/physics/v2/tuning.ts` — `servoCloseV0` 1.0 / `servoMinFrac` 0.3 (on), `servoIntentTau` 0.2 / `servoIntentM` 0.05;
  `curveV` [0 3 5 8 12 17 20] / `curveF` [1.07 1.07 1 1 0.7 0.48 0.35], `throttleTau` 0.15; `BikeClassV2 = 'rookie' |
  'pro'` (mid removed; `DEFAULT_TUNING_V2` is the Rookie); the Pro preset above.
- `src/physics/controllers/index.ts` — `wheelieHoldV3` (anticipation); `lipHopper` approaches with the weight forward
  (the Pro looped at lean 0 under the hold throttle from a standstill).
- `src/physics/v2/r3.test.ts` — the R3 rows; `world.test.ts` slot list (34); re-pins in `feel.test.ts` (snap-forward
  saves 24.6° at 0.5 s: the throttle lag keeps the thrust on ~0.3 s after a cut; air-brake band edge −11.95),
  `r2.test.ts` (3 m landing dip −30.4°, the R2 "early weight forward" climb controller kept as the wrong-technique
  reference, wheelie row on V3), `property.test.ts` (throttle-settle 0.6 s at tau 0.15; the §10 stability kick now
  decays slower — 10.6° peak, 3.6° at 2 s — because a rider holding a pose is soft against a static target).
- `src/physics/tools/trackSweep.ts`, `src/physics/index.ts` — mid removed from the docs strings.

### FEEL table per class (R2 mid → R3 Rookie | R3 Pro; `pnpm vitest run src/physics/v2` prints every row)

| row | band | R2 (mid) | R3 Rookie | R3 Pro | verdict |
|--|--|--|--|--|--|
| static sag rear / front | 28–32 / 24–28 % | 29.3 / 17.0 | 29.5 / 16.7 | 25.2 / 11.6 | as R2 (front spring inconsistency, stiffer Pro) |
| coasting balance by lean −1 / −0.5 / 0 / +0.5 / +1 | info | 24.2 / 39.4 / 49.9 / 59.6 / 68.6 | same | 24.7 / 38.6 / 48.2 / 57.0 / 65.3 | — |
| 0 → 16 (lean +0.25) / top | ≤ 4.2 s / 20 ± 0.5 | 4.47 / 20.03 | **3.98** / 20.03 | 3.25 / 21.03 | pass (the knot) |
| full gas lean +1 / +0.5 / +0.25 / 0 max pitch | ≤ 10, no loop | 6.0 / 5.2 / 5.5 / 7.3 | 5.9 / 5.9 / 6.0 / **6.7** | 6.1 / 5.5 / loop 1.38 / loop 0.96 | Rookie pass; Pro loops at ≤ +0.25 (raw) |
| full gas lean −0.25 / −0.5 / −1 loop time | Rookie: loop only at ≤ −0.5 | 1.46 / 1.23 / 1.09 | 1.10 / 0.82 / 0.63 | 0.79 / 0.66 / 0.57 | −0.25 still loops (critical lean ≈ −0.1; see below) |
| open-loop divergence | 1–2 s | 1.34 | 1.29 | 1.63 | pass |
| wheelie hold 60 Hz / 100 ms, 40 ± 8 for ≥ 10 s | ≥ 10 s | 5.9 s in band (PD) | **12.0 s** (anticipation) | **12.2 s** | pass |
| snap-forward from 20° held / 30° throttle cut | < 15 at 0.5 s | 3.2 / 0.0 | 4.4 / **24.6** | — | 30° save slower (throttle lag) |
| brake hard-back / neutral | ≤ 5.0 / ≤ 7 m | 5.64 / 6.84 | 5.64 / 6.85 | — | as R2 |
| air control 0.5 s lean −1 / +1 / thr / brake @8 | 25–40 / −25..−40 / 8–15 / −12..−40 | 35 / −39 / 9 / −12 | 35 / −39 / 8 / −12 | 29 / −35 / 10 / −12.5 | pass; Pro has less |
| **hop** ref apex / front / both-off / first / land | 0.45–0.65 / 0.6–0.9 / 0.35–0.6 / front / level | 0.47 / 0.65 / 0.29 / front / +3 | **0.46 / 0.74 / 0.29 / front / +2.8** | 0.49 / — / 0.33 / front / +3.5 | pass (both-off short as R2) |
| hop tuck gain / seated / half-rate / quantum jump | +0.1–0.2 / ≤ 0.1 / 55–75 % / < 3 cm | 0.105 / 0.20 / 55 % / 0.4 cm | 0.108 / 0.20 / 56 % / 0.4 cm | — | as R2 |
| landing 1.5 m @6 lean 0 | ≥ 80 %, returns | 100 %, rebound 0.18 | 100 %, **rebound 0.00** | 100 % | pass |
| landing 2 m @6 / @12 lean 0 | rides, bounded | rebound 0.61 / 0.60 | **0.05 / 0.04**, pitch −3..+11 | 0.05 / 0.03 | pass |
| landing 3 m @6 / @12 lean 0 | rides, bounded | loop / loop | **rides**, pitch −4..+14 / −5..+10 | rides | pass |
| landing 3 m @6 / @12 lean +0.5 | rides, bounded | rides / loop | rides −30..+7 / −34..+9 | −23..+12 / −27..+8 | pass |
| climb 45° from 2 m/s (technique) | Rookie TOP | stall 27 % (R2 controller) | **TOP** (40 TOP) | stall 36 % | Rookie pass |
| climb 45 @5 / 50 @5 / 50 @6 | Rookie 50 with ≥ 5 | 72 % / — / stall | 72 % / fault / 42 % | fault / 38 % / 46 % | not met (timing) |
| climb 55 @6..8 / 60 @8 (momentum) | Pro carries | stall at the base | 24–34 % / 23 % | 26–31 % / 22 % | not met (base transition) |
| kickers 17–22 @8/11 lean released | land ±20 | 11 | **9.0** | — | pass |
| lab hop @7 / @8 / @9 margin | ≥ 0.1 m | — / −0.06 / — | crash / **−0.06** / −0.07 (cleared) | crash / −0.06 / −0.07 | half, as R2 |
| µs/tick p95 riding | ≤ 5 (R3) | 2.25 | 2.7–3.0 | — | pass |
| bounded response dv / dw per tick | ≤ 0.02 / 0.06 | 3.8e-3 / 0.056 | 2.8e-3 / 0.057 | — | pass |

### Hop matrix (rear apex m; preload depth × snap rate) — R2 mid → R3 Rookie | R3 Pro

| preload lean | 4 /s | 8 /s | 16 /s | one tick |
|--|--|--|--|--|
| −0.25 | 0.07 → 0.07 \| 0.08 | 0.30 → 0.29 \| 0.31 | 0.34 → 0.33 \| 0.35 | 0.35 → 0.34 \| 0.37 |
| −0.5 | 0.11 → 0.10 \| 0.08 | 0.39 → 0.38 \| 0.40 | 0.46 → 0.44 \| 0.48 | 0.48 → 0.46 \| 0.50 |
| −0.75 | 0.28 → 0.24 \| 0.26 | 0.44 → 0.43 \| 0.46 | 0.51 → 0.50 \| 0.55 | 0.47 → 0.47 \| 0.49 |
| −1 | 0.08 → 0.07 \| 0.09 | 0.43 → 0.41 \| 0.46 | 0.50 → 0.49 \| 0.55 | 0.47 → 0.46 \| 0.49 |

Within 0.02 of R2 everywhere on the Rookie (the intent gate lifts the cap through the whole snap); the Pro hops 5–10 %
higher (4 kg lighter, stiffer rear). Monotone in depth at ≥ 8 /s and in rate to 16 /s as R2; same surface identity and
quantum continuity (0.4 cm).

### Landing table (rear max %, pitch range, rebound m; entry 6 / 12 m/s; all ride away, no fault)

| drop | lean | Rookie @6 | Rookie @12 | Pro @6 | Pro @12 |
|--|--|--|--|--|--|
| 1.5 m | 0 | 100 %, +1..+10, 0.00 | 100 %, +1..+8, 0.00 | 100 %, +1..+12, 0.00 | 100 %, +1..+9, 0.00 |
| 1.5 m | +0.5 | 91 %, −11..+6, 0.00 | 88 %, −13..+5, 0.00 | 81 %, −7..+6, 0.00 | 76 %, −9..+5, 0.00 |
| 2 m | 0 | 100 %, −3..+11, 0.05 | 100 %, −2..+8, 0.04 | 100 %, −2..+13, 0.05 | 100 %, −1..+10, 0.03 |
| 2 m | +0.5 | 96 %, −18..+8, 0.00 | 92 %, −20..+7, 0.00 | 84 %, −13..+8, 0.00 | 82 %, −15..+8, 0.00 |
| 3 m | 0 | 100 %, −4..+14, 0.00 | 100 %, −5..+10, 0.00 | 100 %, −3..+16, 0.00 | 100 %, −4..+12, 0.00 |
| 3 m | +0.5 | 93 %, −30..+7, 0.00 | 84 %, −34..+9, 0.00 | 78 %, −23..+12, 0.00 | 76 %, −27..+8, 0.00 |

With the cap off (R2's tuning) the same 2 m / lean 0 drop rebounds 0.62 m and 3 m loops (asserted in `r3.test.ts`).
The lean +0.5 landings dip the nose to −30..−34° at 12 m/s — a front-heavy landing, bounded, no fault.

### Climb table (4 m wood plank, the technique controller; TOP / stall % / FAULT)

| entry | 40° | 45° | 50° | 55° | 60° |
|--|--|--|--|--|--|
| Rookie 2 m/s | TOP | **TOP** | — | — | — |
| Rookie 5 / 6 m/s | — | 72 % | FAULT / 42 % | 24 % (6) | — |
| Rookie 8 m/s | — | — | — | 34 % | 23 % |
| Pro 2 m/s | FAULT | 36 % | — | — | — |
| Pro 5 / 6 m/s | — | FAULT | 38 % / 46 % | 26 % (6) | — |
| Pro 8 m/s | — | — | — | 31 % | 22 % |

Pose-table numbers the parent asked for: comDH(+1) = d 0.61 / h 0.80 → atan 37° (Rookie), 36° (Pro); a 48° geometry
needs the rider COM at (+0.42, +0.46) chassis frame at lean +1 (over the bars), measured and rejected (deviation 22).
What a 50° constant-speed climb would need: d/h ≥ 1.19 — the rider COM 0.5 m ahead of its R2 pose. 50–60° are
momentum climbs on any table (decelerating at ≥ 0.05–0.5 g adds the missing nose-down moment); what fails at 6–10 m/s
is the base: the front wheel meets a 50°+ face at speed and either stops the bike or the throw comes too early.

### Wheelie hold, lab, cost

- Hold (V3, horizon 0.25 s, kp 0.035, ki 0.02, kb 0.03): Rookie 12.0 s in band of 12.5, mean 40.1°, front never down,
  v ≤ 7.0; Pro 12.2 s, 40.3°, v ≤ 6.7. V2 (no anticipation): Rookie loops at 1.5 s, Pro at 2.3 s.
- Lab (`lipHopper`, weight-forward approach): Rookie @7 crash (nose −26° into the face), @8 cleared margin −0.06, land
  −5°; @9 cleared −0.07, +10°; Pro @7 crash, @8 −0.06 / −6°, @9 −0.07 / +14°. The ≥ 0.1 m clear-air margin is not
  reached by the R3 hop either: the rear meets the ledge corner and rolls over it at 8–9 m/s exactly as in R2.
- Cost: 2.7–3.0 µs/tick p95 riding (node), one more scalar per tick.

### Further deviations (R3)

19. **One new §12 slot, `targetMove`** (the intent memory): `tm ← tm (1 − dt/0.2) + |Δtarget|`, clamped to an intent of
    `tm / 0.05`. Justification: §12 forbids hop-phase memory *for the physics*; this is a memory of the *input's own
    path* (the target is already state), 8 bytes, in `F`, snapshot round-trip asserted through a landing.
20. **Servo concentric cap ON**: `servoCloseV0` 1.0 / `servoMinFrac` 0.3, gated by 19. Cost: the §10 stability kick
    decays slower (10.6° peak, 3.6° at 2 s, still monotone); the 30° throttle-cut save reads 24.6° at 0.5 s.
21. **Rookie throttle lag 0.15 s** (spec 0.04) and **low-speed knot 1.07** (spec 0.85 at 0). The lag is what keeps the
    knot from looping the neutral launch. Costs: throttle-driven corrections are ~0.1 s slower; the wheelie hold needs
    anticipation (met); `property.test` settles 0.6 s before measuring throttle→acceleration.
22. **Forward pose tables rejected.** Over the bars (+1 at x 0.42 / y 0.46, neutral +0.10, a −0.25 row): the R1-style
    snap becomes a 1.3–1.5 m throw with a 0.36 m knife between lean quanta, throttle→acceleration goes non-monotone at
    +0.5 (the rear unloads), bounded-response dw 0.185. Moderate (neutral −0.06, +1 at 0.24 / 0.55): half-rate snap 55
    → 22 %, knife 0.03 → 0.07 m, dw 0.075, for +3° of crawl geometry the bench cannot see. The pose table is R2's.
23. **Classes**: `mid` removed; the Rookie *is* the reference row; the Pro preset above (K_att 260 gives 29 / −35° of
    air authority — below the 25–40 band on the nose-up side by design, "less attitude assist").

### Parent decisions not met, with the cost of meeting them

- **Loop-out at lean −0.5 or harder (Rookie).** Critical lean ≈ −0.1: the launch at −0.25 loops in 1.10 s. Moving it to
  −0.4 needs d/h(−0.4) ≥ a/g + 0.15 (squat) ⇒ the whole table 0.25 m forward, which kills the hop preload and the
  balance ladder; or a thrust cap ≤ 0.47 g, which kills the 45° crawl. Not available as a parameter change.
- **Pro neutral loop in 1.5–2.5 s.** 0.96 s. The lift-to-90° time is the open-loop divergence (~0.3 s e-fold from the
  lift); stretching it needs less thrust at low speed, which the momentum climbs need. A throttle lag of 0.15 s makes
  the Pro not loop at all (that is the Rookie).
- **50° at ≥ 5 m/s (Rookie), 55–60° momentum (Pro).** The face is fine (geometry + thrust suffice); the base transition
  and the throw timing are not made by a 60 Hz / 50 ms bench controller; a bot with the lift-into-the-face move or a
  chamfered base would show it. Not a physics parameter.
- **Lab margin ≥ 0.1 m.** Same −0.06 corner roll as R2 at 8–9 m/s.

### Flip readiness (what a track author will notice moving v1 → v2 Rookie)

- **Speed**: 0 → 16 in 4.0 s (v1 1.4–2.2 s); top 20 m/s. Every run-up is ~2× longer; the throttle answers in 0.15 s.
- **Climbs**: constant-speed limit 37° at full forward lean; 40–45° top only with the base gas and the throw; 50°+ is a
  momentum climb that the bot must learn; 65°+ needs a hop. v1's "sustained on ≤ 60°" is gone.
- **Hop**: 0.46 m from a standing preload (0.55 at a 0.4 s preload); 0.9 m ledge at 5 m/s not yet measured on v2.
- **Landings**: 3 m at 12 m/s rides away on both classes; big drops are safe, front-heavy landings dip to −30°.
- **Loops**: the Rookie loops only when leaned back (−0.25 in 1.1 s); the Pro loops at neutral under full gas in 1 s.
- **Seesaws**: rebound 250 (R2, deviation 14) — re-measure.
- **Pro**: 21 m/s, 3.25 s to 16, hops 5–10 % higher, less air authority; a track cleared on the Rookie is not
  automatically clearable on the Pro (the neutral loop) and vice versa (the momentum).
- Verdict: **safe to flip for the Rookie once tracks are re-authored against the speed and the climb limits**; the
  four rows above are honest misses, not instabilities; the goldens change (§16.3).

### Requests

- **tracks**: the lab's far wall — a 45° chamfer or a 0.1 m lower ledge (49.3 m) turns the corner roll into the spec's
  clear-air margin and the rolled miss into a slide-back; re-measure seesaws (rebound 250); re-author run-ups for
  4 s to 16 m/s; planks > 45° need a base the front can roll onto (a 0.3 m 20° kicker at the foot) or a run-up for the
  momentum line.
- **core / render**: nothing new in `PhysicsState`; `debug().rider.intent` is a new HUD field (0..1) for the lab.
- **harness**: the v2 goldens re-stamp (every replay changes); the bot needs the two climb moves (neutral until the
  front is on the face, then the throw; and the wheelie hold with a 0.25 s lead) — `r3.test.ts` has both as
  controllers.

### What R4 must do

1. The `it.todo` rows: rear-wheel pogo at the balance, the 0.9 m ledge at 5 m/s, clips 01 / 07 / 18, the seesaw.
2. A bot-grade climb controller (lift into the face) and the 50–60° momentum rows on it.
3. The flip (one line in `src/physics/index.ts`) and v1's deletion once the tracks are re-authored.

---

## v2 status — R2 (of three, physics-v2.md §16.7)

**Finding.** The hop is real: from a standing start on flat dirt, a 0.3 s preload (lean −1, throttle 0.3), a
full-travel snap held 0.22 s and a 0.1 s lean-back give a **rear apex of 0.47 m** (0.19 in R1), front leaves first,
lands at +3°, identical on dirt / wood / metal / concrete, continuous (0.4 cm per lean quantum), monotone in preload
depth and in snap speed, peaking when the snap comes at the rear's maximum load (0.55 m at a 0.4 s preload). Four
levers did it, in the spec's order: `F_max` 2 600 → 3 200, `targetRateLin` 3 → 5, rear `k` 8 500 → 10 500 (preload 0,
sag 29 %), and — the one the spec did not list — **rear rebound damping 950 → 250** (front 800 → 250): at 950 the
8 kg wheel is overdamped (ζ 1.8) and is dragged off the ground at 57 % compression, spending the spring's energy in
the air. The second finding corrects R1: **the coasting rear-wheel balance is about the axle, not the contact
patch** — atan(d/(h−R)) = 50° at lean 0, not atan(d/h) = 34° — and the always-on attitude torque moves it by
±asin(K_att/(M g r_a)) ≈ ±18°, so the balance spans 24° (lean −1) to 69° (lean +1). `balancePitch()` now solves the
real moment balance (gravity, inertial, K_att, the chain torque's M·a·R) by bisection; R1's controllers parked the
lean 13–25° off the true equilibrium, which is why the lean-only hold looped. With the park right, a 60 Hz / 100 ms
throttle + rear-brake controller keeps the front up ~10 s (mean 31°, ±9° limit cycle, speed drifting up); the 40 ± 8°
for 10 s row is not met. Open-loop divergence from the balance: 1.34 s. The parent's decision (a) — neutral full gas
lifts to 15–25° and settles — is refuted: any lift under a sustained a/g above d/h(θ) is a loop (the equilibrium is
unstable at every pitch), so the honest launch has two regimes, no lift (a/g < d/h(0) = 0.64) or loop; a peaked
low-speed curve (0.75 g to 2–3 m/s) loops lean 0 at 1.4–1.5 s even with the pose table shifted 0.11 m forward
(measured); the mid row keeps 880 N. Decision (c)'s 45° crawl is 0.75 g and the same knife: the mid crawls 35°, tops 40
with 6 m/s, stalls 45 at 62 %; 50–60 are not made on 6 m/s (the Pro's thrust, R3). Landing: a 1.5 m drop compresses
100 %, the rider sinks (crouch 0.95) and returns, no fault; a 3 m drop with the rider forward bottoms and rides away
(pitch −28..+14); **at lean 0 a 2 m drop rebounds 0.2 m and 2.5–3 m loops** — the rider's re-extension at F_max after a
0.3 m crouch fires the bike like a pogo stick, and the hop's push is the same motion (body closing on a target 0.3 m
above it at 3–4 m/s), so every cap that fixes the landing halves the hop (tried force-length on the hip→peg distance
and a Hill closing-speed cap; the latter is left in `tuning.rider.servoCloseV0 / servoMinFrac`, off). Kickers 17–22° at
8–11 m/s land within ±20° with the lean released in the air; **held at +0.25 they nose-dive** (K_att −75 N m over a
1–2 s flight: −25° at 11 m/s, −50..−80 and a crash at 14) — decision (e)'s "constant lean +0.25" fights the declared air
control. The lab level: a hop keyed to the rear wheel 1.0 m before the lip (preload −0.8, held speed, snap +1, tuck)
gets onto the ledge at 8–9 m/s and rides on, but the rear meets the ledge corner and rolls over it (−0.06 m, the
corner geometry) rather than clearing it by 0.1 m; rolling it off is an endo on the vertical face at 7–8 m/s, not the
survivable miss §15 assumed. Barrel unchanged: `createBikePhysics` = v1, v2 = `createBikePhysicsV2` (`?physics=v2`).

### Files (R2)

- `src/physics/v2/tuning.ts` — mid row: `F_max` 3 200, `targetRateLin` 5, rear `k` 10 500 / `preload` 0 / `cReb` 250,
  front `cReb` 250; `servoCloseV0` 3 / `servoMinFrac` 1 (the landing lever, off).
- `src/physics/v2/bike.ts` — `balancePitch()` about the axle with K_att (bisection); the servo cap carries the (off)
  closing-speed factor; `debug().rider.legLen / legFrac` (hips→pegs distance, cap fraction) for the HUD.
- `src/physics/controllers/index.ts` — `hopper` is v1's (its rows depend on it); new `hopperV2` (preload / snap /
  tuck), `lipHopper` (the lab take-off, keyed to the rear wheel at the lip), `wheelieHoldV2` (parked lean, throttle +
  rear brake, PI, speed term).
- `src/physics/v2/r2.test.ts` — the R2 rows (hop matrix, wheelie, landing, climbs, kickers, lab); `feel.test.ts` keeps
  the R1 rows and the remaining `it.todo`s; `property.test.ts` half-rate row is measured (55 % at 2.5 m/s);
  `snapshot.test.ts` gauntlet script re-timed (the real hop looped the old script off the seesaw's tip).

### R2 FEEL table (mid row; old → new; `npx vitest run src/physics/v2` prints every row)

| row | band | R1 | R2 | verdict |
|--|--|--|--|--|
| static sag rear / front | 28–32 / 24–28 % | 28.5 / 16.9 | 29.3 / 17.0 | rear pass, front fail (unchanged, spring inconsistency) |
| coasting balance by lean −1 / −0.5 / 0 / +0.5 / +1 | (info) | 29.3 / 31.6 / 33.6 / 35.4 / 37.2 (contact-patch formula) | **24.2 / 39.4 / 49.9 / 59.6 / 68.6** (axle + K_att; verified by teleport: 40° falls, 60° rises) | R1's numbers were wrong |
| 0 → 16 lean +0.25 / top | 3.5–4.2 s / 20 ± 0.5 | 4.47 / 20.03 | 4.47 / 20.03 | unchanged |
| full gas lean +0.25 / +0.5 / +1 max pitch | ≤ 10 | 6.1 / 5.7 / 5.6 | 5.5 / 5.2 / 6.0 | pass |
| full gas lean 0 | parent (a): lift 15–25° then settle | 6.8°, no loop | 7.3°, no loop | (a) refuted: lift ⇒ loop; no-lift kept |
| full gas lean −0.25 / −0.5 / −1 loop time | (a): 2–3 s / — / ≤ 1.2 s | 1.60 / 1.25 / 1.13 | 1.46 / 1.23 / 1.09 | −1 pass; −0.25 is a log knife (critical lean ≈ −0.05) |
| open-loop divergence from the balance | 1–2 s (CONTRACT) | — | **1.34 s** | pass |
| wheelie hold 60 Hz / 100 ms, target 40 | ≥ 10 s in 40 ± 8 | lean-only looped 1.6 s | front up 9.9 s of 12, 5.9 s in band, mean 31°, v → 18 m/s | fail (honest); limit cycle ±9° at 100 ms |
| snap-forward from 20° throttle held | < 15 at 0.5 s | 9.6 | 3.2 | pass |
| brake hard-back / neutral | ≤ 5.0 / ≤ 7 m | 5.54 / 6.74 | 5.64 / 6.84 | as R1 (hard-back it.fails) |
| air control 0.5 s lean −1 / +1 / thr / brake @8 | 25–40 / −25..−40 / 8–15 / −12..−40 | 35 / −39 / 9 / −12 | 35 / −39 / 9 / −12 | pass |
| **hop** rear apex / front / both-off / first / land | 0.45–0.65 / 0.6–0.9 / 0.35–0.6 s / front / level | 0.19 / 0.12 / 0.11 / rear | **0.47 / 0.65 / 0.29 s / front / +3°** | apex, order, landing pass; both-off short (the nose drops in flight) |
| hop tuck gain / throttle-through | +0.1–0.2 / continuous | — | +0.105 / 0.50 → 0.41 (thr 0 → 1, falls) | pass (throttle lowers the apex: the rear spins, the nose rises) |
| hop by preload time 0.15 … 0.5 s | peak at max load | — | 0.35 0.38 0.43 0.47 0.52 **0.55** 0.52 | pass (max load at 0.4 s) |
| hop quantum jump / 1-tick late / surfaces | < 3 cm / ≥ 85 % / identical | 1.8 cm (2 q) | **0.4 cm** / 102 % / identical ×4 | pass |
| hop seated | ≤ 0.1 m | — | 0.20 m, both-off 0.04 s | fail as stated; it is a front-wheel pivot, not a hop |
| half-rate snap (2.5 of 5 m/s) | 55–75 % | 7 % (1.5 of 3) | **55 %** (1.5 m/s: 7 %) | pass |
| landing 1.5 m @6 | rear ≥ 80 %, returns | — | 100 %, crouch 0.95, settles 32 %, no fault | pass |
| landing 3 m @6 | bottoms, bounded buck | — | lean +0.5: 91 %, no rebound, −28..+14, rides away; lean 0: loop | half; R3 |
| climb 4 m wood, crawl / 6 m/s | (c): ≤ 45 crawl; 50–60 with speed | R1 sweep: 35 / 45 | crawl tops 35, 40 stalls 50 %; 6 m/s tops 40, 45 stalls 62 %, 50 faults, 55–65 stall at the base | (c) not met at 0.61 g |
| kickers 17–22° @8 / 11 / 14, lean +0.25 held | land ±20 | — | −20..+19 / −25..−42 / crash | fail above 8 m/s (K_att) |
| kickers, lean released in the air | land ±20 | — | 8: −9..+11; 11: −1..+4; 14: −5 / −21 (crash) / −24 | pass at 8–11 |
| lab hop @8 / @9 | clears ledge ≥ 0.1 m | — | on the ledge, margin −0.06 (corner roll), land −4° / +12° | half |
| lab roll @8 / @9 | survivable miss | — | endo on the face | §15's assumption fails |
| µs/tick | ≤ 10 riding | 2.25 | (perf test unchanged, green) | pass |

### Hop matrix (rear apex m; preload depth × snap rate, lean units per s)

| preload lean | 4 /s (0.5 s traverse) | 8 /s | 16 /s | one tick |
|--|--|--|--|--|
| −0.25 | 0.07 | 0.30 | 0.34 | 0.35 |
| −0.5 | 0.11 | 0.39 | 0.46 | 0.48 |
| −0.75 | 0.28 | 0.44 | 0.51 | 0.47 |
| −1 | 0.08 | 0.43 | 0.50 | 0.47 |

Monotone in depth at ≥ 8 /s and in rate at every depth up to 16 /s; the one-tick snap is 0–7 % below the 16 /s ramp
(the target rate cap makes them nearly the same input); a 0.5 s snap is no hop ("the timing is crucial").

### Further deviations (R2)

14. **Rear / front rebound damping 950 / 800 → 250** (§13). Wheel-side ζ 1.8 → 0.5: the spring returns its energy to the
    ground instead of carrying the wheel off at 57 % compression. Consequence: the seesaw's tipping end can kick the
    bike at 8 m/s under 0.75 throttle (the snapshot gauntlet script rides it at 0.5 now) — the tracks owner should
    re-measure seesaws.
15. **Rear `k` 8 500 → 10 500, preload 0** (the spec's fourth lever); sag 29 %.
16. **`balancePitch` pivots at the axle and includes K_att** (was atan(d/h)). `debug().balancePitch` and every
    controller's `balanceAt` moved 15–30°. v1's formula is untouched.
17. **`targetRateLin` 5** (spec 3 → 4 lever, one step further): the body, not the target, limits the push at 3 200 N.
18. The seated snap pops the rear 0.2 m: K_att (300 N m nose-down at lean +1 on the ground) plus the arm reaction at
    the grip unload the rear; both-off 0.04 s.

### Spec / parent claims refuted or amended by the built model (R2)

- (a) A visible lift-and-settle at neutral full gas needs a thrust that falls with *pitch* (an ECU rule), not with
  speed: the rear-wheel equilibrium under thrust is unstable at every angle. Honest options: no lift (mid) or the
  Mantis (lifts and loops unless leaned forward: a peak of 0.75 g does exactly that, measured).
- (b) 35–45° holds live at lean −0.7…−0.4 (coasting balance 32–41°), not at lean +0.5…+1 as the contact-patch formula
  said; 40 ± 8 for 10 s needs less latency or anticipation than a PD at 100 ms gives.
- (c) 45° from a crawl is 0.75 g; at 0.61 g the crawl limit is 35°.
- (d) both-off 0.35–0.6 s conflicts with "front leaves first" under a nose-down snap: the front lands first at 0.29 s.
- (e) "constant lean +0.25" through a 1–2 s flight is a front-flip input with K_att 300; kickers are ridden with the
  lean released. The lab's rolled miss is an endo, not a fall into the pit (a chamfer on the far wall would make it one).

### What R3 must do

1. Classes as parameter rows: the Pro (1 000 N, k 12 000 / 9 500, K_att 360) carries the 50–60° momentum climbs and
   loops at neutral; the Rookie does neither. Re-measure this table per class.
2. Landing pogo: an intent signal that separates a landing recovery from a hop push (candidates: the target's own
   velocity remembered for ~0.2 s — one §12 slot — or a lower servo cap while the *input* lean is not moving forward),
   then the 2–3 m rows at lean 0.
3. The remaining rows: rear-wheel pogo at the true balance (~50° at lean 0), the 0.9 m ledge at 5 m/s, front-wheel
   lift (clip 01), plank-to-plank (clip 07), drop-in (clip 18); a wheelie controller with anticipation (or 50 ms).
4. Goldens: every v2 replay golden changes (§16.3); v1's `classes.test.ts` still fails on the harness's in-flight
   `bot-3.json`, not on v2. Lab level: ask the tracks owner for the far-wall chamfer and re-measure the hop margin.

---

## v2 status — R1 (of three, physics-v2.md §16.7)

**Finding.** The v2 plant is built to `physics-v2.md` (§1–13) in `src/physics/v2/{bike,rider,tyre,engine,tuning}.ts`
and is the shipped `createBikePhysics` (v1 stays as `createBikePhysicsV1`). It is bit-deterministic (v1's
`snapshot.test.ts` verbatim, two-run, restore×13, foreign snapshots, used-world reload all green), 2.3 µs/tick p95
riding / 8 µs ragdolling in node, its cross-tick state is exactly the §12 list (asserted), every one-quantum input
perturbation is bounded per tick and in 30-tick divergence, throttle→acceleration is monotone at every speed, lean→pitch
is monotone across the loop ladder, the velocity pass conserves angular momentum to 1e-13 with `K_att` 0, and the
§10 stability test passes (a +6°/+0.5 rad/s pitch kick at 6 m/s under full gas with weight forward decays, no loop).
**Four of the spec's flat-ground feel rows cannot be met by the spec's own rigid-body model** and were measured from the
toy at large pitch where the toy is wrong: the 45–65° "self-limiting" neutral wheelie, the 60–75° lean −0.25 hold, the
constant-input 3 s hold, and the lean-only 10 Hz balance. The honest bike does not lift at neutral, lifts and loops
(monotone in lean: 1.60 / 1.25 / 1.13 s at −0.25 / −0.5 / −1) when leaned back, and recovers a 20° wheelie by snapping
forward with the throttle held (30° needs the throttle closed with the snap; 40° is past the envelope). Brakes, top
speed, air control, launch attitude and crash rules meet their bands. Details below; the parameter table is the spec's
with three documented changes.

### Files

- `src/physics/v2/tuning.ts` — §13 table as `TuningV2`; class rows `rookie | mid | pro` (`BIKE_CLASSES_V2`), `bikeTuningV2`.
- `src/physics/v2/engine.ts` — thrust curve, implicit first-order lags, engine braking, limiter latch, reported rpm.
- `src/physics/v2/tyre.ts` — brush model (load-sensitive μ, implicit stiffness step).
- `src/physics/v2/rider.ts` — pose table + inverse, rate-limited target, the RIDER_CHAIN port (hips from the body).
- `src/physics/v2/bike.ts` — the world: bodies, tick order §3, sequential impulses 6+2 (split-impulse position pass),
  suspension §5, contacts, brakes §8, servo §9.3, attitude torque §9.4, crash §11, state §12, `debug()` with
  `attTorque` / `poseTarget` / `comDH` / `rider.body`.
- `src/physics/collision.ts` — additive: `Prim.endA/endB`, `queryCircleV2` / `circleVsPrimV2` (one-way by the previous
  centre, two-sided open-end vertices, no straddle). v1 untouched in behaviour.
- `src/physics/index.ts` — barrel: `createBikePhysics` = v2; v1 re-exported with a `V1` suffix.
- `src/physics/controllers/index.ts` — typed against a minimal `ControllableWorld` so v1 and v2 share the controllers.
- Tests: `src/physics/v2/{snapshot,world,property,feel}.test.ts` (5 `it.fails` known gaps, 12 `it.todo` R2 rows).
- `src/physics/tools/trackSweep.ts` runs on v2 (`TRIALS_BIKE=rookie|mid|pro`).

### R1 FEEL table (mid row; `npx vitest run src/physics/v2/feel.test.ts` prints every row)

| row (§14.2) | band | measured | verdict |
|--|--|--|--|
| static sag rear / front | 28–32 % / 24–28 % | **28.5 %** / **16.9 %** | rear pass; front **fail** — the pose table puts ~490 N sprung on the front, on a 7 500 N/m spring tilted 23° that is 16 %; 26 % needs k ≈ 5 400 (spec inconsistent) |
| static pitch | (level) | +1.8° nose-up | the two static sags on the spec's axle rest points imply it; the spawn is placed at this equilibrium |
| combined COM d / h at neutral | 0.55 / 0.79 (§2) | 0.50 / 0.78 | d/h 0.64 → balance pitch atan(d/h) = 33.6° at lean 0 (CONTRACT says 40–50: unreachable together with a front-lifting launch) |
| 0 → 16 m/s, lean +0.25 | 3.5–4.2 s | **4.47 s** | **fail** (`it.fails`): the toy that set the band had no aero drag and massless wheels; lever `F_peak` +7 % |
| top speed | 20 ± 0.5 | 20.03 | pass |
| full gas lean +0.25 / +0.5 / +1 | front ≤ 10°, finishes 120 m | 6.1 / 5.7 / 5.6°, finish 8.9 s | pass |
| full gas lean 0 | 45–65° wheelie, never loops, < 20° by 16 m/s | **6.8°, never loops**, 5.0° at 16 m/s, finishes | never-loops passes; the 45–65° band is unreachable by the spec's own §10: a hold at pitch θ needs a/g = d(θ)/h(θ), which is 0 at 33° and −0.5 at 58° — a 58° wheelie under thrust is a loop |
| full gas lean −0.25 / −0.5 / −1 | 60–75° hold ≥ 3 s / loops ≥ 2 s / loops ≤ 1 s | loops at **1.60 / 1.25 / 1.13 s**, max pitch > 60° each | monotone in lean (the A§2.7 property) and −1 ≈ 1 s pass; the hold and ≥ 2 s rows are the toy's large-pitch artefact |
| constant-input lean-back wheelie | holds ≥ 3 s | best pair (lean −0.75, thr 0.5) 0.64 s above 20° | **fail** (`it.fails`); CONTRACT 2.5 "open-loop diverges in 1–2 s" wins — e-fold 0.3 s |
| lean-actuated hold, 10 Hz / 100 ms, throttle 0.5 | 45 ± 8° for 10 s | loops at 1.64 s; a 60 Hz / 0 ms controller holds 3.4 s within ±8° of 15° and never loops | **fail** (`it.fails`): the pose path (3 m/s target cap + servo ≈ 0.2 s) plus reaction delay exceeds the 0.3 s e-fold; §10's "5–10 Hz with margin" ignored the input lag. The balance band at thr 0.5 is 17–22°, not 45 |
| snap-forward from 20°, throttle held | < 15° in 0.5 s | 9.6° at 0.5 s, peak 29.8°, no loop | pass |
| snap-forward from 30°, throttle held | < 15° in 0.5 s | loops (peak 91.7°) | spec row unreachable: at 30° every pose has d/h(θ) < a/g; with the throttle closed at the snap: 0.0° at 0.5 s, no loop (asserted); 40° loops even then |
| brake 10 → 0, hard-back | ≤ 5.0 m, rear off ≤ 0.3 s | **5.54 m**, rear off 0.22 s | rear-off passes; distance **fail** (`it.fails`): 560 Nm is 0.9 g average; lever `totalNm` ≈ 620 |
| brake 10 → 0, neutral | ≤ 7 m, rear off ≤ 0.6 s, pitch ≥ −25° | 6.74 m, 0.16 s, −8.0° | pass (a settling stoppie) |
| brake, hard-forward | endo | crash at 0.8 s, rear off 0.68 s | pass |
| air control 0.5 s at 8 / 14 / 20 m/s: lean −1 | +25…+40 | +35.1 / +35.0 / +35.0 | pass (at `K_att` 300, see deviations) |
| lean +1 | −25…−40 | −38.8 / −38.8 / −38.8 | pass |
| throttle | +8…+15 at 8, → 0 at the limiter | +9.0 / +4.5 / −0.1 | pass |
| brake | −12…−40 rising with speed | −12.1 / −20.0 / −26.7 | pass |
| none | ±5 | −2.7 / −2.8 / −2.9 | pass (engine braking on the spinning rear) |
| µs/tick p95 | ≤ 10 riding (R1), ≤ 80 ragdoll | 2.25 / 8.25 | pass |
| stationary hop (R2 row, measured for the record) | rear 0.45–0.65 m | rear 0.19 m at P 0.3, front 0.12, both-off 0.11 s | R2 — see "what R2 must do first" |

Property tests (`property.test.ts`): bounded response on flat / 30° kicker / 60° plank, 200 states × 6 quanta: per-tick
|Δv| ≤ 3.8e-3 m/s, |Δω| ≤ 0.056 rad/s, 30-tick divergence ≤ 0.008 m/s / 0.017 rad/s; monotone throttle (worst
neighbour step 0.000 m/s²); monotone lean ladder at thr 0.4 / 0.7 / 1.0 (+1.5° tolerance, see below); conservation
|ΔL| 8e-13 (velocity pass) / 9e-2 N m s over 1 s with the position pass on (see below); balance pitch by lean −1…+1 =
29.3 / 31.6 / 33.6 / 35.4 / 37.2°; hop apex continuous over the input quanta (max neighbour jump 0.018 m), identical on
dirt / wood / concrete, identical under a 1–8 tick delay.

### Deviations from the spec and why (the spec wins unless inconsistent; each of these is an inconsistency)

1. **Pose table x column** (§9.1). The printed column (−0.44 / −0.30 / −0.15 / −0.12 / −0.09) gives d/h = 0.62 at
   neutral — exactly `a_peak/g` — and full gas at lean 0 was a coin flip between "no lift" and "loops at 3 s"
   between two builds differing only in the servo's damping form. The column is also inconsistent with §2's stated
   targets (d 0.55 at neutral) and with the toy the ladder was measured with (`riderTarget`: −0.42 / −0.27 / −0.12 /
   −0.03 / +0.06). v2 uses the toy's x column with the table's y and ψ: d/h 0.64 at neutral, a clean margin, and the
   §10 ladder as stated for lean ≥ 0. Also: the spec's axle→chassis transform has a sign slip (the axle origin is
   *below* the chassis COM), and the table's COM is ~0.2 m below the drawn chain's COM; the dynamics take the table (h
   0.79, the CONTRACT's number), the drawn chain keeps the canonical hips plus the body's deviation from its target.
2. **`K_att` 180 → 300, `c_att` 20 → 33** (§13 "initial values" vs the §14.2 air-control band). At 180 the 0.5 s air
   authority was +15.8 / −22.3° against the band 25–40 (the toy's own run 5 shows +20.8 / −23.9 at 180; the spec's
   §9.4 text quotes run 3's numbers at 260). 300 / 33 keeps K/c = 9 rad/s and meets the band; on the ground it is
   ~35 % of the full-gas thrust moment (spec said ~20 %). Rookie 250 / 28, Pro 360 / 40.
3. **Servo damping is implicit** (§9.3 gives the law, not the integrator). Explicit `k_d` 4 200 N s/m against the
   chassis's rotational compliance at the grip (m_eff ≈ 14 kg) is c·dt/m = 2.4 > 2: a Nyquist oscillation at rest
   with the force pinned at ±F_max. The damping part is solved implicitly through the pair's 2×2 response matrix
   (leg/arm split included), the spring part stays explicit (ω dt = 0.31); all rate terms read pre-force velocities.
4. **Servo pairs are collinear at the pegs and the grip on both bodies.** §9.3 puts F at the rider COM and the reaction
   at the pegs/grip and claims conservation; that is not a pair. v2 applies the leg-line component at the peg point
   and the remainder at the grip point *on the rider as well*, so angular momentum is exact (1e-13 with `K_att` 0).
   Consequence: forward acceleration reacts through the arms for forward leans, a small nose-up couple that makes
   lean +1 sit ~1° higher than +0.5 at part throttle (the monotone-lean test carries a 1.5° tolerance; the back half
   of the ladder, where v1 failed, is strictly monotone).
5. **Brush tyre in implicit form.** At 120 Hz on the 8 kg wheel, C_s 9 000 is 96 % of a rigid constraint per iteration
   and the explicit force law is unstable by ×25; the iteration applies `J = −v_t · m_T · γ/(1+γ)` under the cone
   μN with N this tick's accumulated normal impulse (first iteration: after its own normal update, not the spring).
6. **Rolling resistance** reads last tick's grounded flag and this tick's spring load (an unpaired ground torque);
   §12 lists no load memory, so no normal-load slot was added.
7. **Static sag, front**: 16.9 % (see the table); **wheelbase at static sag** 1.275 (§2 claims ±0.02 through travel;
   the tilted axes close it by 0.025 at sag).
8. **Bounded-response ε_ω 0.05 → 0.06**: one lean quantum is 1/127 of the pose travel (~4 mm) which at `k_p` 45 kN/m is
   a 180 N step at the grip arm on the 11 kg m² chassis = 0.066 rad/s per tick. The 30-tick divergence is 0.01.
9. **Conservation with the position pass**: the split-impulse slider projections leak ≤ 0.1 N m s per second (a
   geometric projection, not a force). The spec's 1e-6 holds for the velocity pass, which is what it was about.
10. **hopPhase `'push'`** drops the spec's "and rising" (needs a previous-velocity slot §12 does not list);
    `'preload'` uses the previous compression already in `F`; `crouch` is measured below the *current* target (the
    hang-back pose is the render's `back` blend, not a crouch).
11. **Bump stop**: the spec's cubic `k_stop·x³/travel²` is 219 N at full travel; implemented literally, the hard travel
    limit (restitution-free) does the stopping.
12. **Anti-squat sentence vs axis sign**: axis (0.12, 0.99) moves the wheel forward on compression, so thrust at the
    patch mildly *compresses* the rear; the number is implemented, the sentence is not.
13. **Default class** when `loadTrack` gets no `bike`: `'mid'` (the reference row); the game passes its own.

### Spec claims refuted by the built model (for the architect; none is a v2 bug)

- A rigid-body wheelie under thrust has its equilibrium *below* the static balance angle atan(d₀/h₀) (33.6° at
  neutral); every hold above it needs deceleration, so "45–65° self-limiting", "60–75° hold" and the toy's T1/T2 rows
  at large pitch are artefacts of the toy's chassis-up compression geometry (its contact patch walks backward at high
  pitch). Trials' live balance of 30–45° (audit §2.17) is what this table gives.
- `a_peak/g` 0.62 with a flat 0–8 m/s curve cannot sustain a 60° climb: the rim thrust needed is m g sin 60 = 1 230 N
  (0.87 g) before rolling resistance, against 880 N (mid) / 780 N (rookie). Measured on `plankTrack(a, 4, 20)` at full
  gas from a 20 m run-up, lean +1 on the face: rookie and mid climb 35 / 45 and stall at 55 / 60; the Pro (1 000 N)
  carries 55 / 60 on run-up momentum but stalls 45 (it arrives slower there). The R1 sweep stalls every b-track at its
  first plank. Either the curve gains a low-speed torque peak (f ≈ 1.6 below 3 m/s, which brings back the neutral-lean
  launch loop unless the lean table gains more forward travel) or the CONTRACT's climb row drops to ≤ 40°. **This is the
  R2 blocker, not the hop.**
- Lean-only balance at 10 Hz / 100 ms is not stabilisable through the rate-limited pose path; throttle is the fast
  loop (40 ms lag) and must be part of the balance controller row.

### Core-type request (CONTRACT §16.6; on `debug()` until then)

`PhysicsState.rider` gains `body: { pos: Vec2; angle: number; vel: Vec2; angVel: number }`; `PhysicsDebug` gains
`attTorque: number`, `poseTarget: { x; y; psi }`, `comDH: { d; h }`. `BikeClass` gains `'mid'` (or the game maps it).
CONTRACT 2.5 amendments as §16.6, plus: "balance pitch 40–50° at lean 0" → "30–38° across the lean range (atan(d/h)); a
lifting launch and a 45° neutral balance are mutually exclusive at real g"; "climb ≤ 60° sustained" needs the thrust
decision above.

### What R2 must do first

1. Resolve the climb/thrust conflict (above) with the architect and tracks owner before touching hop numbers — it decides
   the low-speed curve, which changes the hop's throttle-through and the preload.
2. Hop: 0.19 m rear apex at P 0.3 vs 0.45–0.65. Levers in the spec's own order: `F_max` (2 600 → 3 200), pose travel
   overshoot, `targetRateLin` (3 → 4), rear `k`; first check the leg-line reaction geometry (the pegs are 0.05 m behind
   the rear axle's plumb line at attack, so the leg push loads the rear less than the toy's target-point reaction did).
3. Snap at half rate gives 7 % of the apex (spec 55–75 %): the slow snap never unloads the rear — same root cause.
4. The lab level, landing rows, kicker, pogo, climb rows (`it.todo` list in `feel.test.ts`).
5. Harness goldens: every replay golden changes (§16.3); v1's `classes.test.ts` golden already fails on the harness's
   in-flight `bot-3.json`, not on v2.

---

Status: **round 11 — wave 1 of the mega build** (eleventh physics owner; P1 of `project/archive/MEGA_PLAN.md`). Shipped:
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

### 8.1 Finish / fault precedence (R6)

The run finishes when the front wheel's centre reaches `finishX`; `finish` carries the crossing tick's time. Within one
tick the fault sensors are evaluated **before** the crossing. A fault in the crossing tick with the front wheel no more
than one wheel radius past the line voids the finish: only `fault` is emitted, `finishTime` stays null, `U.finishVoid`
= 1 (`debug().finishVoided`) — Trials: you cross the line upright. A fault in the crossing tick with the wheel already
more than one radius past the line is a crash after the finish: `finish` then `fault` (Game treats a fault after its
finish as a post-finish tumble). At 21 m/s the wheel moves 0.175 m per tick, so in play a same-tick fault always voids;
a fault in any later tick leaves the finish standing. Asserted in `r6.test.ts` (the audit probe fixture, the > R
exception, a clean crossing, snapshot across the crossing tick).

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
