# Physical landing absorption retune — 2026-09-21

Retained runtime candidate, uncommitted. Parent owns acceptance and played cloth/contact review. No test assertions, geometry endpoints, anatomical lengths, collision support surfaces, crouch normalization, sensors, or goldens were changed by this worker. Runtime is frozen at handoff.

## Mechanical finding and retained change

The neutral rider sits on the physical saddle. The previous independent stiff COM and torso springs allowed only 5.65 mm pelvic movement and 7.14° torso fold during the R2 1.5 m drop: maximum COM sink 15.30 mm, crouch .05101. Lowering angular stiffness alone did not solve this: the translational COM spring lifted the pelvis as the torso folded. Even kpsi=0/cpsi=30 gave only45mm COM sink with a nearly horizontal torso. Uniformly reducing translational stiffness also produced invalid deep static pelvis sag; those candidates are rejected.

`bike.ts` now permits coupled linear/angular muscle compliance under suspension compression. The continuous load fraction rises from zero at35% to full at60% compression; it is multiplied by the absence of existing pose intent and the upright seated target fraction (torso55→65°). At full load linear stiffness is20%, angular stiffness zero. Compressive damping can fall to15%, smoothly with downward COM velocity / forward torso rotation; full damping opposes recovery. The existing ground-started throw retains its one-twelfth damping factor. Target positions, force/torque caps and equal/opposite body pairs remain. No new persistent state or cross-tick cache is used.

Final exact R2 fixture: Rookie COM sink **68.537mm**, crouch **.228456**, torso minimum37.314°, hips minimumY .710376m; no fault. At3m sink98.933mm, torso18.041°. Pro1.5m sink56.652mm / crouch.188841, torso41.728°; Pro3m sink93.677mm / .312256, torso20.915°. The existing absorption assertion is Rookie; do not claim Pro exceeded .2. All R3 landing survival/rebound rows pass. These are simulated fixture measurements, not played garment acceptance.

## Retained tuning changes from incoming transfer candidate

- Rookie/default kp45000→42000: bounds all one-quantum response and position-projection conservation. Pro retains45000:42000 made the mild40° rear-first impact hit a sensor late;45000 survives.
- kd4200→4400; angular target rate6→3.3rad/s: restores monotone lean response without breaking hop learnability. Angular rate3.5/kd4500 passed handling but caused a30-tick perturbation divergence on the60°plank;3.3/4400 passes the full unchanged property suite.
- Rookie/default chassis inertia11→11.9kg m²: reduces pitched touchdown below60°/s. Pro retains11. Inertia12 on Rookie missed the8° throttle-air minimum by.00966°; Pro12 spoiled the mild40° impact.
- Rookie rear spring10500→10450 restores static sag≥28%; Pro retains12000.
- Rookie Katt300→280; Pro retains260. Restores held-back air authority≤40° while preserving other air controls.
- Both ECU margin0 .2→.25, leanFull .2→.15. Ramp pitch/speed pass and the negative-lean launch ladder remains monotone. Margin change alone prevented the-.25 launch from looping and was rejected.
- Pro rear/front rebound damping350→425; Rookie remains350. Required to keep the now-compliant neutral3m Pro drop below.15m rebound. Increasing both classes was unnecessary and affected other responses.

No brake tuning changes were taken from the diagnostic agent; current braking positives pass.

## Verification and remaining gaps

`combined-6-full.log`: **99 passed /7 failed /106 tests** at that point in the parent's test-review work. All positive handling assertions exercised by feel, R2, R3 except cost, R4, R5 except cost, and R8 ordinary impact/braking pass. Property bounded response, monotone responses and conservation all pass. Shared geometry and snapshot tests pass. Runtime ESLint passes.

- Reference Rookie hop .477m; all hop depth/rate, timing, limiter parity and half-rate rows pass.
- Both classes clear the unchanged lab at8/9m/s:4/4. No +.1m clear-air acceptance claim.
- Wheelie hold and climbs pass.
- R8 severe physical fault, mild40° survival and explicit overload thrown fixture pass on both classes.
- Remaining failures: R6 historical initial Pro nose-dip characterization and gate counterfactual under parent review; three old golden-finish rows needing fresh search; two parallel-suite cost rows.
- Dedicated agreed quiet window: R3p50 **4.816µs passes** (`combined-6-r3-cost-quiet.log`;p95 8.506informational). R5 full-file p50 **5.625µs fails** (`combined-6-r5-file-quiet.log`). Earlier dedicated R5 whole-file5.416µs; isolated360-tick test16.542µs has cold-JIT cost. Do not claim timing passed. Potential optimization is100nm COM-inverse tolerance rather than10nm, or analytic mass-map derivatives; neither was attempted and both require renewed correctness/replay checks.

Current motion needs the parent's new played garment/contact audit and browser byte replay. Static rear-fender clearance evidence is not proof of this new landing fold. No rendered clips or browser runs were produced by this worker.

## Evidence and reproduction

- `impact-bike.patch`, `impact-tuning.patch`: exact worker delta from incoming runtime, including small final comment cleanup.
- `combined-6-impact.json.gz`: lossless per-tick full state, debug, applied input and tuning for both classes ×1.5/3m neutral drops; corresponding summary JSON is readable. Reproduce with unique `POSE_LABEL=... pnpm exec tsx docs/evidence/riding-poses/impact-retune/current-impact.ts`.
- Baseline/angular and linear sweeps plus rejected early load-compliance trajectories are retained losslessly as `*.json.gz`; readable `*-summary.json` files accompany them. `measure.ts` / `measure-linear.ts` generate these. Use unique POSE_LABEL to avoid overwriting.
- Rebound sweep and Pro mild-impact sweep retain every candidate outcome.
- Nearby angular-rate/damping grid logs preserve all unchanged39-test runs, including failed candidates. `candidate.config.ts` is intentionally outside normal test inclusion; `POSE_ANG=3.3 POSE_KD=4400 pnpm exec vitest run --config docs/evidence/riding-poses/impact-retune/candidate.config.ts`.
- `load-compliance-4-tests.log` records a rejected accidental edit to the air-limiter multiplier alongside the intended seated compliance gate; fixed before candidate5. Never use it as evidence for retained air handling.
- Temporary source snapshots remain `/tmp/impact-*.ts`. No commits or subagents were created by this worker.

## Requested inverse-accuracy experiment (rejected and reverted)

Parent requested trying100nm instead of10nm COM inversion convergence after the handoff. The squared threshold1e-16→1e-14 preserved all60 actual rendered physical tests and the unchanged handling positives, but failed the explicit R9 inverse residual<1e-8 assertion (actual3.364e-8). Quiet R3p50 4.798µs passed; R5whole-file5.458µs still failed. `inverse-100nm-*.log` retains the complete attempt. No assertion was loosened. `src/core/riderGeometry.ts` was restored byte-for-byte from `/tmp/impact-geometry-10nm.ts`; the retained candidate remains10nm and its earlier99/106 evidence applies.
