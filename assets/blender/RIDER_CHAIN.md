# Rider chain (measured from the reference, owned by assets/blender)

Rider 1.78 m at 7.5 heads (head 0.237). AXLE coordinates: origin = axle midpoint at static sag, x forward, y up, z toward the camera (rider's LEFT = +z). Grips fixed at (0.27, 0.78, +-0.33), pegs at (-0.14, 0.02, +-0.20); ankles = pegs + (0.01, 0.09).

## Segment lengths (m)

| segment | length | note |
|---|---|---|
| torso (hip joint -> shoulder line) | 0.52 | acromion height for 1.78 m |
| neck (shoulder line -> head/helmet centre) | 0.22 | helmet radius 0.13; helmet bottom sits 0.09 above the shoulder line = a visible neck |
| upper arm | 0.32 | shoulder joint -> elbow |
| forearm (elbow -> grip centre, fist included) | 0.30 | |
| thigh | 0.46 | hip joint -> knee |
| shin (knee -> ankle) | 0.43 | ankle 0.09 above the peg, boot on the peg |
| shoulder half width | 0.21 | biacromial 0.42 |
| hip half width | 0.09 | |

Measured on reference/techniques/clips 13 (countdown, GO, wheelie), 06/07 (hang-forward climb, landing), 03 (rear-wheel balance), rising-visuals 02 (start gate idle) and the hero crop grid: attack torso 45-50 deg from horizontal, upper arm 25-35 deg below horizontal going FORWARD and OUT, elbow interior 125-130 deg, forearm ~70 deg down to the bar; thigh 65-70 deg below horizontal, knee flexion 35-45 deg, shin 12-18 deg from vertical (foot behind the knee); hang-forward: torso 20-30, elbows 85-95 high and out; hang-back: arms straight (~170), shoulders ~25 deg above the bar line, torso 50-60, knees 80-95; countdown crouch: torso 20-30, elbows 60-75, knees 100-110; elbows ~0.2 m outside the shoulders in 3/4 views, knees on the tank sides.

## Bend-direction rules (pole vectors for a 2-bone IK)

Two-bone IK in 3D: `u = normalize(B - A)`, `x = (l1^2 - l2^2 + d^2) / 2d`, `h = sqrt(l1^2 - x^2)`, joint `= A + u*x + h * normalize(pole - u*(pole.u))`. Reach is clamped to 0.995*(l1+l2); if the shoulder is farther than 0.985*(l1+l2) from the grip the WHOLE upper body slides toward the grip along the shoulder->grip line (hands never leave the grips), and away if closer than 0.18 m; the hips never go beyond 0.985*(thigh+shin) from the ankles.

* **Elbow pole = forward-up-out:** `pole = (0.6, 0.5, sign(side)*1.0)` in axle coords (side = +1 for .L/+z, -1 for .R). In attack the elbow ends ~0.18 m ahead of, ~0.14 m below and ~0.22 m outside the shoulder (upper arm ~27 deg below horizontal going forward and out, elbow ~0.28 m above the grip), the forearm angles ~70 deg down and in to the grip: one wide S from shoulder to bar. A pure up-or-out pole is WRONG: it folds the elbow sideways and the arm reads as hanging straight from the side view. Never below the bar line, never behind the shoulder.
* **Knee pole = forward-and-slightly-in:** `pole = (1, 0.2, -sign(side)*0.15)`; clamp `|knee.z| >= 0.08` so the knees hug the tank sides (tank half width 0.10) without crossing. Knee ends ahead of the hip and roughly above the peg; the shin is 10-20 deg from vertical in attack.
* Torso: hips -> shoulders at the torso angle from horizontal; head/helmet centre = shoulders + 0.22 at the head angle (always more upright than the torso: the rider looks ahead). Shoulder joints at z = +-0.21 on the shoulder line; hips at z = +-0.09.

## Canonical poses (AXLE coords, metres; .L side listed, .R mirrors z)

| pose | hips (x,y) | torso deg | head deg | interior elbow | knee flexion |
|---|---|---|---|---|---|
| stand_attack | (-0.28, 0.85) | 40 | 66 | 93 | 62 |
| hang_back | (-0.57, 0.60) | 55 | 75 | 156 | 83 |
| forward_attack | (-0.22, 0.90) | 26 | 42 | 73 | 51 |
| crouch | (-0.38, 0.78) | 28 | 40 | 65 | 71 |
| sit_cruise | (-0.30, 0.62) | 60 | 80 | 91 | 104 |
| extend | (-0.14, 0.96) | 46 | 70 | 133 | 31 |
| land_absorb | (-0.40, 0.70) | 30 | 45 | 60 | 85 |

### stand_attack

| joint | x | y | z |
|---|---|---|---|
| hips | -0.280 | 0.850 | -0.000 |
| chest | 0.007 | 1.091 | -0.000 |
| shoulders (centre) | 0.118 | 1.184 | -0.000 |
| shoulder.L | 0.118 | 1.184 | +0.210 |
| elbow.L | 0.299 | 1.057 | +0.442 |
| hand.L (grip) | 0.270 | 0.780 | +0.330 |
| hip.L | -0.280 | 0.850 | +0.090 |
| knee.L | 0.021 | 0.503 | +0.115 |
| ankle.L | -0.130 | 0.110 | +0.200 |
| head (helmet centre) | 0.208 | 1.385 | -0.000 |

### hang_back

| joint | x | y | z |
|---|---|---|---|
| hips | -0.570 | 0.600 | -0.000 |
| chest | -0.355 | 0.907 | -0.000 |
| shoulders (centre) | -0.272 | 1.026 | -0.000 |
| shoulder.L | -0.272 | 1.026 | +0.210 |
| elbow.L | 0.015 | 0.938 | +0.321 |
| hand.L (grip) | 0.270 | 0.780 | +0.330 |
| hip.L | -0.570 | 0.600 | +0.090 |
| knee.L | -0.117 | 0.521 | +0.080 |
| ankle.L | -0.130 | 0.110 | +0.200 |
| head (helmet centre) | -0.215 | 1.238 | -0.000 |

### forward_attack

| joint | x | y | z |
|---|---|---|---|
| hips | -0.220 | 0.900 | -0.000 |
| chest | 0.117 | 1.064 | -0.000 |
| shoulders (centre) | 0.247 | 1.128 | -0.000 |
| shoulder.L | 0.247 | 1.128 | +0.210 |
| elbow.L | 0.379 | 1.016 | +0.479 |
| hand.L (grip) | 0.270 | 0.780 | +0.330 |
| hip.L | -0.220 | 0.900 | +0.090 |
| knee.L | 0.016 | 0.507 | +0.122 |
| ankle.L | -0.130 | 0.110 | +0.200 |
| head (helmet centre) | 0.411 | 1.275 | -0.000 |

### crouch

| joint | x | y | z |
|---|---|---|---|
| hips | -0.380 | 0.780 | -0.000 |
| chest | -0.049 | 0.956 | -0.000 |
| shoulders (centre) | 0.079 | 1.024 | -0.000 |
| shoulder.L | 0.079 | 1.024 | +0.210 |
| elbow.L | 0.272 | 1.048 | +0.464 |
| hand.L (grip) | 0.270 | 0.780 | +0.330 |
| hip.L | -0.380 | 0.780 | +0.090 |
| knee.L | -0.007 | 0.511 | +0.104 |
| ankle.L | -0.130 | 0.110 | +0.200 |
| head (helmet centre) | 0.248 | 1.166 | -0.000 |

### sit_cruise

| joint | x | y | z |
|---|---|---|---|
| hips | -0.300 | 0.620 | -0.000 |
| chest | -0.113 | 0.944 | -0.000 |
| shoulders (centre) | -0.040 | 1.070 | -0.000 |
| shoulder.L | -0.040 | 1.070 | +0.210 |
| elbow.L | 0.186 | 1.048 | +0.435 |
| hand.L (grip) | 0.270 | 0.780 | +0.330 |
| hip.L | -0.300 | 0.620 | +0.090 |
| knee.L | 0.123 | 0.440 | +0.092 |
| ankle.L | -0.130 | 0.110 | +0.200 |
| head (helmet centre) | -0.002 | 1.287 | -0.000 |

### extend

| joint | x | y | z |
|---|---|---|---|
| hips | -0.140 | 0.960 | -0.000 |
| chest | 0.120 | 1.229 | -0.000 |
| shoulders (centre) | 0.221 | 1.334 | -0.000 |
| shoulder.L | 0.221 | 1.334 | +0.210 |
| elbow.L | 0.308 | 1.074 | +0.375 |
| hand.L (grip) | 0.270 | 0.780 | +0.330 |
| hip.L | -0.140 | 0.960 | +0.090 |
| knee.L | -0.016 | 0.519 | +0.132 |
| ankle.L | -0.130 | 0.110 | +0.200 |
| head (helmet centre) | 0.296 | 1.541 | -0.000 |

### land_absorb

| joint | x | y | z |
|---|---|---|---|
| hips | -0.400 | 0.700 | -0.000 |
| chest | -0.076 | 0.887 | -0.000 |
| shoulders (centre) | 0.050 | 0.960 | -0.000 |
| shoulder.L | 0.050 | 0.960 | +0.210 |
| elbow.L | 0.227 | 1.046 | +0.463 |
| hand.L (grip) | 0.270 | 0.780 | +0.330 |
| hip.L | -0.400 | 0.700 | +0.090 |
| knee.L | 0.015 | 0.501 | +0.094 |
| ankle.L | -0.130 | 0.110 | +0.200 |
| head (helmet centre) | 0.206 | 1.116 | -0.000 |

`extend` (hop push) and `land_absorb` (touchdown) are the two transient poses the clips pass through; `stand_attack` is the rest pose of rider.glb.

## Clips = blends between canonical poses (30 fps)

stand_attack: hold. hang_back / forward_attack / crouch / sit_cruise: stand_attack -> pose at f15 -> hold to f30. extend: crouch -> extend at f8 -> stand_attack at f20. land_absorb: extend -> land_absorb at f8 -> stand_attack at f30. idle_breathe: stand_attack with hips +-1.5 cm, torso +-1.5 deg, head +-2 deg over 4 s (cyclic).

## Curves between the canonical poses (owned by `src/render/rider/pose.ts`, measured in `assets/blender/pose-study/`)

`riderChain(pose, opts)` reproduces the four canonical corners above to < 1 cm / 2 deg (`pose.test.ts`: stand_attack at lean 0, hang_back at lean -1, forward_attack at lean +1, crouch at crouch 1) and owns how the body travels between them. Inputs: `lean` -1..1 (`back = max(0, -lean)`, `fwd = max(0, lean)`), `crouch` 0..1 = the HOP PRELOAD ONLY, `crouchExtra` 0..1 = touchdown absorb, `torsoPitch` rad (+ = pitched forward relative to the frame).

### What was wrong (frame strips `ours-leanback.jpg`, `ours-leanforward.jpg`, logs `ours-*-log.json`)

flat-test, 9 m/s, throttle 0.25 (below the hop threshold, `hopPhase` idle throughout), lean ramped 0 -> -1 in 0.5 s, held, -> +1 in 1 s, held:

| input lean | physics `lean` | physics `crouch` | `torsoPitch` | what the round-8 render drew |
|---|---|---|---|---|
| -1.00 (held) | -1.00 | **0.67-0.71** | +0.34 | squat behind the seat, head at bar height |
| +1.00 (held) | +1.00 | **1.00** | -0.34 | prone along the tank, helmet on the bars |

Physics derives `crouch` from the rider MASS's drop below its anchor (`riderPose()` in bike.ts), and the mass target is lowered `lean * leanCrouchFwd` = 0.5 m at full forward lean and `-lean * leanCrouch` = 0.2 m at full back lean for the COM dynamics, over a `crouch` travel of 0.3 m: every forward lean >= 0.6 reads as a full crouch and every lean back as two thirds of one, hop or no hop. The render then folded the torso 0.35 rad and dropped the hips 0.28 m per unit crouch. `torsoPitch` rests at -0.34 rad per unit lean (anti-lean) once the lean settles, with no visible transient in the log, so the old chain also pitched the torso 12 deg FORWARD at full lean back. Both couplings are removed in `pose.ts` (`hopCrouch()` rescales the remainder above the lean-induced drop to 0..1; `TORSO_PITCH_LEAN_BIAS` is added back) until physics reports the hop preload (`F[S_CROUCH]`) and the torso transient alone — pass `crouchIsHopOnly: true, torsoPitchLeanBias: 0` then.

### Body parameter curves (`bodyParams()`)

Hips (x, y) and the torso / head angles above horizontal (deg) are blended in PARAMETER space, then the limbs are solved by the 2-bone IK above, so hands and feet never leave the grips and pegs. `sb = 1 - (1 - back)^1.3` (the hips leave a little faster than linear: clip 03 f2-f4 the arms lock straight before the hips have finished travelling).

| parameter | lean back (back 0..1) | lean forward (fwd 0..1) | hop crouch (c 0..1, on top of the lean pose) | touchdown absorb (land 0..1) |
|---|---|---|---|---|
| hips x | -0.28 - 0.29 sb | -0.28 + 0.06 fwd | - 0.10 c (1 - 0.7 back) | - 0.12 land |
| hips y | 0.85 - 0.25 sb - 0.03 sin(pi back) | 0.85 + 0.05 fwd | - 0.07 c (1 - 0.3 back) | - 0.15 land |
| torso deg | 40 + 15 back | 40 - 14 fwd | - 12 c (1 - 0.55 back) | - 10 land |
| head deg | 66 + 9 back | 66 - 24 fwd | - 26 c | - 21 land |

then `torso -= 0.6 * torsoPitch(deg)`, `torso` clamped to 12..80, `head = max(head, torso + 12)`; leg slide (hips within 0.985 (thigh + shin) of the ankles) and reach slide (shoulders within 0.985 (upper arm + forearm) of the grip in 3D, never closer than 0.18 m) as above. Lean back is a STANDING pose: the knee opens to 97 deg interior, the arms go straight (156 deg), the head stays 0.46 m above the bar; lean forward RISES (hips +5 cm) and pitches the chest over the bar clamp (torso 26 deg) with the head still 0.5 m above the grips; the hop preload is the only thing that drops the rider.

### Joint table, lean x crouch (AXLE coords, .L side; torsoPitch 0; chest = hips + 0.72 (shoulders - hips))

| lean | crouch | hips | chest | shoulders | head | elbow.L | knee.L | torso° | head° | elbow° | knee flex° | hip flex° |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| -1 | 0 | (-0.570, +0.600) | (-0.355, +0.907) | (-0.272, +1.026) | (-0.215, +1.238) | (+0.015, +0.938, +0.321) | (-0.117, +0.521, +0.080) | 55 | 75 | 156 | 83 | 115 |
| -0.5 | 0 | (-0.452, +0.672) | (-0.199, +0.948) | (-0.101, +1.055) | (-0.027, +1.262) | (+0.139, +1.034, +0.421) | (-0.021, +0.511, +0.088) | 48 | 71 | 101 | 85 | 112 |
| 0 | 0 | (-0.280, +0.850) | (+0.007, +1.091) | (+0.118, +1.184) | (+0.208, +1.385) | (+0.299, +1.057, +0.442) | (+0.021, +0.503, +0.115) | 40 | 66 | 93 | 62 | 91 |
| 0.5 | 0 | (-0.250, +0.875) | (+0.064, +1.079) | (+0.186, +1.158) | (+0.315, +1.336) | (+0.344, +1.039, +0.462) | (+0.021, +0.504, +0.118) | 33 | 54 | 82 | 57 | 93 |
| 1 | 0 | (-0.220, +0.900) | (+0.117, +1.064) | (+0.247, +1.128) | (+0.411, +1.275) | (+0.379, +1.016, +0.479) | (+0.016, +0.507, +0.122) | 26 | 42 | 73 | 51 | 95 |
| -1 | 1 | (-0.600, +0.551) | (-0.357, +0.836) | (-0.263, +0.947) | (-0.158, +1.141) | (+0.016, +0.935, +0.367) | (-0.142, +0.518, +0.080) | 50 | 62 | 134 | 86 | 126 |
| -0.5 | 1 | (-0.517, +0.612) | (-0.225, +0.847) | (-0.112, +0.938) | (+0.027, +1.108) | (+0.100, +1.001, +0.441) | (-0.067, +0.517, +0.080) | 39 | 51 | 88 | 87 | 129 |
| 0 | 1 | (-0.380, +0.780) | (-0.049, +0.956) | (+0.079, +1.024) | (+0.248, +1.166) | (+0.272, +1.048, +0.464) | (-0.007, +0.511, +0.104) | 28 | 40 | 65 | 71 | 116 |
| 0.5 | 1 | (-0.350, +0.805) | (-0.000, +0.939) | (+0.135, +0.991) | (+0.320, +1.111) | (+0.312, +1.041, +0.472) | (+0.002, +0.509, +0.108) | 21 | 33 | 53 | 68 | 119 |
| 1 | 1 | (-0.320, +0.830) | (+0.043, +0.921) | (+0.185, +0.956) | (+0.382, +1.052) | (+0.347, +1.031, +0.475) | (+0.008, +0.508, +0.112) | 14 | 26 | 43 | 65 | 121 |

hand.L = (0.270, 0.780, +0.330) and ankle.L = (-0.130, 0.110, +0.200) in every row; hip.L / shoulder.L = hips / shoulders at z +0.09 / +0.21. Guaranteed on a 9 x 5 lean x crouch grid (`pose.test.ts`): limb stretch <= 1, elbow 20-170 deg, knee 40-175 deg, hip flexion <= 130 deg, torso > 8.6 deg above horizontal, head above the bar at lean <= 0.7, hips 0.27 m behind the seat centre at lean -1 and 0.08 m in front of it at lean +1, hips monotonic in lean.

### Lag and overshoot (`PoseFollower`)

Reference: the torso arrives 100-150 ms after the bike moves (clip 03 f3-f5, clip 13 at GO) with a small overshoot. Physics' own lean slew (6/s) and the 16 rad/s fore-aft brace already put the reported pose ~100 ms behind the input (`ours-lean-log.json`: input reaches -1 at t = 0.80 s, `lean` is -0.90 there and -1.00 at t = 1.00 s), so the render adds a second-order follower of omega 60 rad/s, zeta 0.7: 90 % of a step in 50 ms, ~5 % overshoot on the unclamped channels (torsoPitch), lean / crouch clamped to their domains, snapped on a cut. This REPLACES the round-6 `spring()` in `riderModel.ts`, which applied an 80 ms LEAD with 15 % overshoot — the opposite of the reference.

### Frame strips (`assets/blender/pose-study/`)

`compare-leanback.jpg` (rows: ours round 8 in-game, `pose.ts` chain, clip 03 0.3-1.7 s, clip 13 3.4-4.6 s), `compare-leanforward.jpg` (ours, chain, clip 06 0.8-2.8 s), `compare-crouch.jpg` (ours hop preload at lean -0.6 / throttle 0.5, chain, clip 01 0.0-1.2 s); `ref-land.jpg` clip 07 0.6-2.2 s. `ours-frames.txt` lists input / physics pose / hopPhase per column. Tools: `tools/capture-poses.ts` (drives flat-test through the harness hook, screenshots every 60 fps frame + pose log), `tools/strip.mjs` (bike-tracked crops), `tools/render-chain.ts` (stick render of the chain for the same log frames), `tools/refstrip.sh`.
