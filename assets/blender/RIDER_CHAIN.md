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
