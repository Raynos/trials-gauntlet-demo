# Shared pose candidate sweep

This is a **candidate for migration, not a passing implementation**. It changes no runtime files. `sweep.ts` injects alternate tuning tables through `createBikePhysicsV2(120, overrides)`, using the existing r3 reference-hop/drop measurements. `candidate.test.ts` imports the existing handling assertions unchanged and wraps only that factory in a local Vitest mock. Its separate config keeps the experiment out of the normal suite. Do not call the old fixed hold/sensor geometry correct because a reference hop passes.

Commands:

```
pnpm exec tsx docs/evidence/riding-poses/current-geometry/sweep.ts
pnpm exec vitest run --config docs/evidence/riding-poses/current-geometry/candidate.config.ts
POSE_CANDIDATE=balanced pnpm exec vitest run --config docs/evidence/riding-poses/current-geometry/candidate.config.ts
```

The final sweep samples 84 candidates that retain monotone COM-x and reachable arms/legs throughout the geometric trajectory (21 samples per segment, maximum reach ratio .98). All 84 meet r3 reference-hop requirements on both bikes. That narrow result does **not** cover the r2 upper hop bound, learnability, response or courses.

## Proposed geometric starting contract

Use the existing declared 75 kg skeleton mass map, driven from these axle-local hips and torso directions, with the same map feeding physical targets, inverse current-body pose, hold anchors, sensors and render:

| Lean | Hips x | Hips y | Torso | Chassis COM x | Chassis COM y | Physical angle relative to seated |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| -1 | -.660 | .460 | 40° | -.299864 | .381576 | -.436332 rad |
| -.5 | -.600 | .732 | 40° | -.251191 | .578132 | -.436332 rad |
| 0 | -.340 | .732 | 65° | -.087493 | .617794 | 0 |
| +.5 | -.230 | .816 | 44.5° | .052919 | .639391 | -.357792 rad |
| +1 | -.120 | .900 | 24° | .168788 | .643803 | -.715585 rad |

Back must first shuffle behind the seat and then lower. A straight interpolation to the lowered back endpoint drives the pelvis through the seat, even when hands and feet are reachable. The half-back waypoint avoids that by holding hip height until hip x=-.60. At neutral the profile's pelvis bottom is y=.568865, matching seat top .5686 to .3 mm. Forward raises hips .168 m and advances them .220 m. Arm reach ratios at the five knots are .885/.876/.902/.644/.544; leg ratios are .724/.885/.748/.811/.896. This is anatomical reach evidence, not a natural-elbow or garment verdict.

For the sweep each half-lean segment uses smoothstep hip/torso interpolation and is sampled every .05 lean into a 41-row physical COM table. Runtime should evaluate the shared geometric function directly if possible; interpolating COM knots is a numerical approximation, not the exact nonlinear mass map. The inverse must reconstruct the actual current physical COM and angle, without clamping visible excursions. Smoothstep has zero speed at knots; this prevents geometric derivative jumps but its extra easing may be undesirable for fine control. The broad tests below show the complete response needs retuning and should drive that choice.

The proposed seated 65° physical angle origin must be migrated explicitly: current mass-map/rest-angle and fixed hold-chest calculations use 40°. The table-only experiment intentionally does not pretend its old anchors describe the new geometry. The profile head function should also be replaced by an explicit shared head/gaze contract if reference motion calls for it.

## Measured outcomes

At unchanged gains (Fmax 3200 N, linear target rate 5 m/s), the balanced candidate above produces reference hop .602 m Rookie/.644 m Pro, front first, landing 3.393°/4.339° (see exact JSON; values may be read directly rather than rounded here). The highest min-apex candidate instead uses back(-.62,.40,50°), forward(-.12,.94,24°), yielding .666/.721 m; it **exceeds r2's .65 m Rookie bound**. The 72 force/rate experiments on high-hop candidates are diagnostics, not selected settings. Raising Fmax generally adds hop height and landing rebound; there is no evidence to increase it before migrating anchors.

Full unchanged handling experiment:

- Highest min-apex candidate: **48 passed / 20 failed**, `candidate-handling.log`.
- Balanced candidate: **53 passed / 15 failed**, `balanced-handling.log`.
- Untouched runtime baseline: **106/106** in the full physics directory; the candidate wrappers exercise its 68 handling tests, not all 106.

Specific balanced failures guide the next stage: rear sag 27.896% is below 28%; back lean in air is 47.36° versus the 25–40° bound; a preload quantum changes hop by 4.28 cm versus <3 cm; some depth/rate combinations lose monotonicity; lab lip hops no longer clear; old goldens no longer finish. The repeated-replay hash assertion passes before its test fails because the B1 golden no longer finishes—this log does **not** demonstrate nondeterminism. Air-release, pose recovery and envelope tests also remain red. Several historical tests deliberately assert old poor-response characterizations (e.g. failed recovery at a 30° wheelie), so inspect the actual assertion instead of labeling every red row a worsened behavior. Do not weaken handling bands.

## Migration and retuning order

1. Adopt or refine shared *geometry*, then migrate body-angle origin and all physical hold/force/sensor anchors. Use actual shoulder-to-grip and hip-to-ankle distances/gradients for constraints; `.03,.1` COM-to-hips and `.368,.234` COM-to-chest are not valid constants for this geometry.
2. Re-run the unchanged handling suite before tuning. Avoid optimizing around the old inaccurate anchors. Preserve the 0.27 m authored forearm and both socket targets in the shared geometry.
3. Recover partial-preload monotonicity and quantum continuity by tuning the back trajectory and target velocity first. The .5 back waypoint holds height; if it suppresses half-preload energy, shift the clearance waypoint earlier (with reach/seat checks) instead of introducing a render-only offset. Geometry motion must remain continuous and its applied impulse opposed on the bike.
4. Restore air authority with the physical pose rate/attitude response after the migrated angle/anchors; do not use a visual lean multiplier. Restore sag with load distribution/suspension preload after neutral mass is final. Keep closing-speed cap/intent gate for landing absorption; increasing Fmax did not solve broad behavior.
5. Only after these rows pass, re-search changed goldens and run actual geometry/cloth/release motion plus browser deterministic replay, bot and stranger completion gates. The sweep cannot close any visual-quality requirement.
