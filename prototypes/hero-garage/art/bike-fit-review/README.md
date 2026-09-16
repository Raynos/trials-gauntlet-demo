# Whole-bike suspension review — round 18

The exported tyres are essentially coplanar: after exact whole-asset grounding the rear is at 0 and the front at 0.488281 mm. That discrepancy does not explain a detached-looking shadow; no corrective assembly pitch was applied for grounding.

The substantive mechanical gap was a stationary bike during compression/landing rider clips. `src/bikeSuspension.ts` now supplies a standalone 25 mm authored kinematic preview. It solves chassis pitch from the front slider and rigid rear arm while keeping both wheels fixed; the rider receives the same chassis transform. The rear shock, chain and constant-length brake hose follow their endpoints. The belt/hose math is adapted locally from the production bike implementation, with no production imports.

Run from `prototypes/hero-garage`:

```sh
node art/bike-fit-review/verify.mjs
npx tsc --noEmit
```

The verifier loads the actual meshopt-compressed bike and rider GLBs and strips only materials in memory. It sweeps 101 stroke samples, checks exact vertex tyre bounds and axle/hinge closure, and requires exact neutral transform/geometry-array restoration. Across all six rider clips at start/mid/end, existing grip/sole distance baselines remain unchanged to floating-point precision. Those baselines are not a claim of exact surface contacts.

This is presentation kinematics, not suspension physics. Parent review of a real recorded clip remains necessary. Raw Blender source bounds can be reproduced with `measure.py` from the repository root; quantized exported bounds in `reports/bike-fit-review.json` are authoritative for runtime.

Parent wired the driver after rider clip evaluation. `node tools/verify-suspension.mjs` passes 750 browser frames across six clips. A 10-second actual WebKit orbit/landing recording is in `captures/whole-suspension-round18/`; sequential decoded frames show the assembly remaining coherent. Retained provisionally, not final art or physics approval.
