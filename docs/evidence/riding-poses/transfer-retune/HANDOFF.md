# Physical forward-transfer retune — 2026-09-21

Runtime candidate is retained, incomplete, uncommitted. Parent judges played clips and owns remaining handling qualifications. No geometry endpoints, anatomical lengths, garment code, goldens, or positive assertions were changed by this worker.

## Retained change

`bike.ts` owns six new snapshot scalars: transfer blend, captured applied lean, physical hips X/Y, physical torso, and forward-input progress. A supported positive reversal from an actual rear preload captures the physical shared geometry. The target follows a quartic ease-out extension from that captured pose to the existing forward pose rather than commanding a seated neutral pause mid-throw. Each target COM is recomputed from the exact shared segment mass map. Existing linear/angular rate limits and force caps still apply.

Eligibility is smooth in input velocity (zero through 2 lean units/s, full at 6) and preload depth (zero at -.25, full at -.5). Single input quanta and shallow wheelie corrections do not trigger a throw. A held pose returns to the static target over .3 s; a target still traveling toward held full-forward finishes its rate-limited extension first. Strong reverse input cancels the throw. Active transfer reduces physical linear damping by at most 11/12, from4200 to350 N s/m, then restores it; no extra force, impulse or render clamp. The force remains the existing bounded equal/opposite pair.

`rider.ts` adds an optional requested physical target to `advanceTarget`. `world.test.ts` explicitly enumerates the new slots. `snapshot.test.ts` adds both-class midpoint-transfer, reverse cancellation, foreign-state restore and restart/load byte equality. `placeBike` clears transfer scalars, including teleport.

## Verification

Final full source command: `pnpm exec vitest run src/physics/v2`; `pose-transfer-handoff-full2.log`: **85 pass /21 fail /106 total**. Two new tests explain total104→106. Runtime/test ESLint passes.

- R2 hop matrix, monotonicity, instant/fast parity, timing continuity pass unchanged.
- R5 instant .518m, slow8 .462m, half-preload16 .463m; limit-on/off identity passes.
- Half target-rate .315/.529=60% (bar>50%); slow1.5m/s .099m and less than half-rate.
- R3 reference Rookie~.518m/Pro~.54m, both front first and landing within±20°; full landing matrix remains passing.
- Same .8m snapLead lab8/9m/s clears4/4. These remain corner-roll clears; old +.1m clear-air claim must not be substituted.
- Wheelie raw45 hold Rookie11.51s/Pro12.23s >=10; shipped40 rows pass.
- Transfer snapshot tests pass on both classes; no browser replay claim from this node test.

## Remaining work

Positive failures remain: air held-back41.097° (>40); rear sag27.9746% (<28); input-quantum angular step~.0925–.0935rad/s (> .09); monotone equilibrium pitch inversion~.016°; split-position momentum leak.15478 (> .15); absorption riderSink.051 (> .2); R4 touchdown62.164°/s (>60), Pro ramp28.127° (>25), forward ramp speed7.957 (<neutral+1=8.09); R5 zero-limit dwell24 (<36); R8 cap-on/off rear-off delta.0583s (> .02). Old golden clears are still unqualified. R5/R6 historical negative-characterization rows still need parent review. Parallel cost runs fail; arrange a quiet dedicated run.

Actual path changes require new played garment/contact audit and parent clip review. Existing static geometry endpoint audits remain about those same endpoints, not the new transient path. Preserve exact failed recordings. The parent's previous input recording before transfer is not current evidence.

## Rejected experiments and evidence

Physical gains alone reached slow8 .253m. Static neutral-torso/hip-path changes reached .272m but harmed landing pitch. Smooth concentrated static response reached .344m and broke monotonicity. Target-velocity feedforward alone reached .272m. Stateless torso-only bypass reached .296m; higher forces .313m while instant exceeded .8m. Early whole-body stateless extension proved feasibility but needed low global damping. All those runtime variants were reverted before the retained snapshot-owned implementation.

Early owned transfer armed on single positive quanta and created2+rad/s steps; rejected. Smooth speed/depth eligibility restores prior .093-level miss. Long decay without reverse cancellation spoiled tuck and slow8. Requiring both wheels grounded disabled the real preloaded hop (front is already unloading); rejected. Shallow-.1 eligibility spoiled raw45 wheelie hold; current smooth-.25 threshold restores it.

JSON sweep outputs and failed full logs are preserved here. `transfer-runtime.patch` is this worker's delta from its initial runtime handoff, excluding earlier shared-geometry changes. Disposable diagnostic scripts are preserved at `/tmp/pose-transfer-experiment-scripts/`; their relative imports need restoring beside the earlier geometry evidence if re-run. Previous source snapshots are `/tmp/pose-owned-bike-*.ts`; current source is the retained candidate. No subagent was spawned.
