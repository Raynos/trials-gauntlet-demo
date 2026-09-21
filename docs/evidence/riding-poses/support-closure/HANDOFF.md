# Physical support and suspension closure

Retained `src/physics/v2/bike.ts` SHA256: `eb23305db1e71ff18fe77219d1001650f7e58a5defa9e832ef7237f8239f9153`.
Only runtime file edited: bike.ts. No tuning, geometry, rendering or test thresholds changed.

## Underside trap

The previous seat/fender support was a thin two-sided signed box. In the parent's saved H1 Pro tick 3918 the pelvis support centre was (-0.661, 0.390), below the fender midline 0.5304. Its normal therefore pointed down. A 22.17 Ns support impulse opposed a 3975 N upward servo, leaving the hips near y=0.453 instead of their ordinary target.

Seat and fender are now finite-width top supports extending downward. Their rounded corner gradients and torso-dependent radii remain, but the vertical gradient cannot point down. The original finite horizontal width still permits the pelvis to move behind the support. These are physical forces and mass-weighted corrections; drawing remains untouched.

`probe.mts` replays the preserved input through the preserved pre-fix implementation, saves its trapped snapshot at tick 3918, restores exactly the same snapshot into the candidate, and holds the same half-back/gas input for 180 ticks. At tick 16 candidate hips y=0.731 vs baseline 0.453, debug servo lag 0.126 vs 0.208 m, support impulse 0 vs 17.93 Ns. At tick 180 candidate lag 0.146 vs baseline 0.224 m, both nonfaulted. Debug lag is the solver's diagnostic value; it is not relabeled as the R7 post-step COM measurement.

Run from repository root: `pnpm exec tsx docs/evidence/riding-poses/support-closure/probe.mts`. It reconstructs the compressed baseline module in a temporary directory and resolves its imports against the current source dependencies. The preserved input and baseline bike source are gzip files. Other dependencies must remain those of the same candidate round for the exact baseline values. Output is `recovery-isolation.json`.

## Joint closure

Contact and rider-support position rows ran after suspension projection, so their final chassis displacement reopened the physical front-slider constraint by 1.999 mm in the fresh B3 recording. Added a simultaneous two-row mass-weighted suspension block after the position pass. It accounts for the shared chassis translation and angular coupling, changes actual chassis and wheel positions, and preserves positional centre of mass. It does not reposition a rendered wheel.

Skip corrections when both residuals are below 0.25 mm, with at most two nonlinear iterations. This leaves margin to the unchanged 1 mm physical residual assertion. The correction is disabled when position iterations are disabled, preserving the velocity-only conservation test. No claim of snapshot equivalence with the previous solver: this intentionally changes physics and all goldens/stranger sessions need fresh qualification.

## Validation and limits

`final-tests.log`: full v2 plus actual GLB bike geometry: **129 pass, 3 fail, 2 skipped**. All positive hop, landing, air response, wheelie, surface, conservation and actual bike mechanism assertions pass. Three failures are stale golden finish assertions in R7/R8; the existing recordings no longer clear after the physics changes. Aggregate R7 diagnostics also print 305 recovered-band violations during these now-faulting recordings, which must be investigated rather than hidden by the first finish assertion. Parent is reviewing post-respawn target history initialization.

Earlier logs preserve rejected intermediate results: closure originally ran even with posIters=0, failing the velocity-only conservation test; fixed before final validation. A previous full run also failed R5 timing at 6.75 us. The final shared-host run passed timing, but this is not a quiet performance qualification and does not close the outstanding cost issue. Typecheck and scoped ESLint passed.

`source-current.patch` is only this subtask's delta against the compressed pre-fix source, not the complete uncommitted round. Parent must judge played clips, repeat genuine clear/replay qualification, review recovery across successful fresh inputs, and determine acceptance.
