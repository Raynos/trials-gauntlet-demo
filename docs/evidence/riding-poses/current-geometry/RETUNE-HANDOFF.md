# Shared geometry retune handoff — 2026-09-21

Physics source is stable for the next agent. No commits. This is an incomplete candidate, not an accepted pose/handling build. Parent owns judgment and test-classification decisions; see `../handling-review.md`. Do not loosen positive handling bounds or overwrite failed recordings.

## Landed candidate

`src/core/riderGeometry.ts` is the sole deterministic geometry/mass map, shared with renderer. Physical body position is its segment-mass COM, angle is torso minus 65°. Neutral hips(-.34,.732)/65°, rear(-.66,.725)/40°, waypoint at lean-.5(-.60,.732)/40°, forward(-.12,.94)/24°. Smoothstep interpolation,81derived physical target knots. Anatomical lengths remain authored. Downward arm pole and exact sagittal knee avoid chicken wings/inward knees. **Knee geometry was independently updated by renderer owner during this work; keep it.**

Physical inverse drives held anchors, head sensor, exported hips, and detached ragdoll. No hidden draw clamp. True reach>2cm or residual>1cm explicitly releases; ordinary small penetration is split-position-corrected on real bodies using equal/opposite generalized gradients. Seat/fender rounded-rectangle support is continuous (old binary seat x-span caused a .187m one-quantum hop discontinuity; now .005m). Mass-map Jacobian is cached for identical physical state only; trig caches are pure values, never inverse seeds. Ragdoll uses projected XY lengths/inertia and corresponding joint anchors; forearm endpoint is wrist, not grip. Snapshot-owned inertia reconstructs lengths, so no hidden crash state. Renderer measured detach jumps<3.4µm and no added velocity step.

Tuning now targetRateLin7,Fmax4000,tauMax800,kpsi2500,cpsi180; hold.mu.2,armReach.573,legReach.870,gripN2500/gripTau.05. Both suspension cReb350 (was250). Air/ECU settings otherwise unchanged. Old physical target table and drawn target table are gone. Axle origin is authored chassis(.065,-.21), replacing old static-sag origin.

Fender top.5504m, support circle centre hips-.08*(cos,sin). Radius .12+.03*smoothstep(clamp((40-torsoDeg)/20,0,1)); angle derivative included in constraint. This bounds the Openface jeans across the sampled20–40°support poses: research agent measured minimum+2.85mm actual skinned clearance over9 reachable samples. Source `../cloth-audit/rear-support-support-sweep-rider-street-openface-rookie.json` and adjusted followup. Full actual played 20 asset/bike audit is running with research agent; do not call static sweep a played pass.

Controller `lipHopper` default snapLead .8m (was1m) and recovery continues until rear wheel contact, not first front-only touchdown. Parent approved these input-policy corrections with identical entry speeds, obstacle and survival conditions. Four 8/9 m/s class rows now clear. R3 historical1.6m margin values[-.155,-.132,+.005,-.144] remain negative for three rows; actual obstacle1.5m. These are rolling-corner clears, NOT a+.1m clear-air pass.

Exact old 1 m/new .8 m applied inputs are preserved in `lab-technique-recordings.json.gz` (before angle support) and `lab-technique-recordings-support-angle.json.gz` (current). Includes failures, class/speed/options and results. Both compare policies on candidate physics, not old baseline physics. Never overwrite these recordings with new physics.

## Current verification and real gaps

`handoff-handling.log`: full 12 files, 104 tests, 78 pass/26 fail. `r9.test.ts` shared-geometry consistency 4/4 and snapshot 3/3 pass. Owned runtime ESLint passes. R3 actual landing matrix all survives, rebound<=.12m; standard reference hop Rookie.456m/Pro.49m; lab 4/4 clears; wheelie/climb/brake positive rows largely pass. Parent actual Game 240 tick settle reference Rookie.4437m vs.45bar exposes settle sensitivity (standard 60 tick settle passes). Parent input-only generator is `harness/riding-pose-recordings.ts`.

Remaining positive bars (do not waive):

- Hop ramp sensitivity/learnability is largest issue: full preload 8 units/s apex.180m vsR5>=.38; full 16 .306m; instant .456m. Depth monotonicity fails; fullpreload rate 4 .159 versus half.178. Current rear safe hip height limits verticalCOMloading; changing gains alone has not solved ramp path. Neutral65° torso swing may consume/reverse impulse along transition. Preserve geometry/fender safety while solving.
- Settled reference hop needs>=.45 even after 240 ticks. A modest forward lift .94→.95/.96 is only a hypothesis, not tried; would require renderer/cloth revalidation.
- Air held back Rookie41.097° vs<=40 in feel; R6sample40.084. Static rear sag27.9746 vs>=28.
- Property one-quantum error metric .0935/.0926/.0936 vs<=.09; monotonepitch .016° inversion; position-projection momentum leak .15478 vs<.15. Do not treat these as harmless just because small.
- R4 pitched touchdown62.164°/s jump vs<=60; Pro ECU ramp leaves28.127° vs<=25; forwardlip speed7.957 vs neutral+1=8.090.
- R5 limiter zero dwell24vs36ticks after touchdown; this is NOT flightduration. Inspect actualground/limiter mechanism.
- R2 riderSink scalar.051vs>.2. Parent correctly noted this is absorption/normalization, NOT bad pogo counterfactual. Need measure actual physical pelvis/COM compliance before deciding fixture update.
- R7/R8 old input goldens do not finish; must diagnose/re-record fresh bots after final sim, not falsely stamp old failed inputs. Parent owns harness.
- R8 stoppie cap-on/off rear-off duration differs.0583 vs<=.02; inspectintent/recovery timing. Other visible braking/survival positives pass.

Historical characterization assertions also fail: R3 cap-off demands>.15rebound, actual.04161 (cap-on~.04); R5 limitedfinalpressrate154vsraw151 despite release78°/s and~5°/s steps; R6 halfpreload gate counterfactual <.15apex actual.164; R8 expected thrown event firesactualsensor first (new 2 m level drop in renderer test yields realthrown). Parent is classifying/replacing obsolete mechanisms, not asking physics to reintroduce failures. Parent changed feel held20°required loop into positive recovery; do not touch that file without coordinating.

Cost: quiet dedicated R3 cost before final angle margin passed p50 4.691µs,p958.020(`/tmp/shared-cost3.log`). Fullparallel suite current5.627p50; R5 air6.084. This is not a final quiet costpass. Agree quiet window withparent/research and run dedicatedtests; cache chassis trig/newton pure trig and10nm inverse tolerance brought quiet6.3→4.69. Avoid timing under concurrent skin CPU sweeps.

## Commands and diagnostics

- Full: `pnpm exec vitest run src/physics/v2 > /tmp/retune-full.log 2>&1`.
- Geometry/snapshot: `pnpm exec vitest run src/physics/v2/r9.test.ts src/physics/v2/snapshot.test.ts`.
- Dedicated cost: `pnpm exec vitest run src/physics/v2/r3.test.ts -t 'cost'` and R5 equivalent, in quiet window.
- `migration-tune.ts` runs flat hop/drop factory override sweeps; see `migration-tune.json`. `lab-tune.ts` angular servo override sweep, `controller-tune.ts` PD recovery policy trials, `macro-tune.ts` snapLead/preload policy sweep. Run via`pnpm exec tsx docs/evidence/riding-poses/current-geometry/<name>.ts`. Output files default overwrite: copy/rename before rerun. `POSE_RECORD=<new-unique-label>` on macro preserves applied inputs in suffixed file but updates macro-tune.json.
- `candidate.test.ts`/`candidate.config.ts` wraps existing tests with factory override; `POSE_TUNE=<rowindex>` selects migration-tune.json; `POSE_CANDIDATE=balanced` uses early old candidate map. Do not use balanced as current geometry.
- Baseline106/106 passed atHEAD7784f731928a54a25ef58fed275abeac80293a90; `full-physics-baseline.log`. Old geometry measured via`measure.ts`, `measurements.json`; early hypothetical table sweeps`SWEEP.md` are pre-migration context only.

Rejected experiments NOT retained: binary seat-support x cutoff; hipback.46/.65(garment penetrates);110%reach fault tolerance(visible6–9cmgaps); large kpsi/cpsi-only lab retunes; end snap early afterairborne .08s (did not rescue8m/s); simplePD air policy (did not rescue8m/s). SnapLead.6 also4/4clears but poorerlandedangles; .8selected. No old failing tests were loosened by this agent; only R9obsolete separate draw-map/clamp expectations were replaced by sharedgeometry/sensor/determinism tests.
