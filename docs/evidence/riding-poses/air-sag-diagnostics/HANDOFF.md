# Read-only air, sag, ECU, braking and inertia diagnostics

No runtime or test edits, no commits. Parent judges. All results use `createBikePhysicsV2` factory overrides; `sweep.ts` extracts the exact source-test scenarios. Run `pnpm exec tsx docs/evidence/riding-poses/air-sag-diagnostics/sweep.ts MODE` with air, sag, ramp, ecu, brake, combined, or inertia. A result is diagnostic, not the full-suite or played qualification.

## Recommended small changes

- Rookie Katt 300 → 280, retaining cAtt33 and Pro260/29. All feel speeds8/14/20 pass: back38.17/38.74/37.99°, forward−29.50/−28.78/−29.38°. K290 alone fails14m/s40.203°; K290/c35 narrowly passes39.946°. K280 gives useful margin.
- Rookie rear spring10500 →10450 gives28.1145% sag (10400 gives28.2558%). Preserve Pro12000. No preload change needed. All sag row speed/pitch constraints pass.
- Both classes wheelieControl margin0 .25, margin1 .4, leanFull .15. Changing margin alone kills Rookie−.25 open-loop divergence; earlier partial sweep omitted this cell. Full ECU family includes both-class lean ladders, ramps at0/.2/.4/1, instant/1s/2s neutral launches and40° holds. At .25/.4/.15, Rookie−.25 loop1.8833s, Pro1.225s; neutral Pro29.72°, holds10.575/12.408s. .1 leanFull gives more divergence margin but is a larger change. Forward fade unchanged.
- BrakeTau .015 (from .03) removes lingering brace-on/off stoppie-duration difference: standalone Rookie .9583/.9583s, Pro1.4083/1.4083s. All neutral6/10/15 stops stay upright, pitch≥−15°, rear-off<.4s. Tau .02 passes with Pro .0167s delta, .025 fails .0333s. Reducing lag makes brake response faster globally; recheck reverse/air-brake and complete braking suite. Mechanism: current brace reads lagged brake after both brake and +1 lean release, allowing a transient rear brace which is absent in brace-off control.
- Chassis inertia11 →12: latest pinned-source full touchdown matrix max58.8438°/s (baseline62.6715), Rookie forward ramp speed minus neutral+.09187m/s (baseline−.00933). Pro ramp20.5417°. Rookie air all speeds passes; both-class negative lean ladders and40°holds pass (10.608/12.417s). Inertia11.5 still fails touchdown62.3927;12.5 passes58.8106;13 fails71.3397. Property equilibrium inversion remains1.7444°>1.5 at throttle.4; inertia is not its solution.

## Provenance and limitations

`source-start.json`/`source-end.json` record source hashes. Impact owner edited source concurrently between early processes, so early air/sag/ramp baseline values are not mutually composable. Each process imports fixed module content. `ecu-bike-source.txt`/`ecu-tuning-source.txt` and `inertia-bike-source.txt`/`inertia-tuning-source.txt` pin later source. The source also changed between first and expanded ramp sweeps; the final ramp JSON is the expanded sweep.

`combined-pro280-results.json` intentionally preserves an INVALID intended-combination experiment: factory overrides set Katt280 and rear spring10400 on Pro too. `combined-results.json` corrects Pro Katt but STILL applies Rookie spring10400 to Pro. Neither combined file qualifies a class-preserving candidate. Use independent families and owner's final full source validation. Later ECU/inertia families preserve all class defaults and are the reliable cross-family checks.

## Exact assertions and historical counterfactuals

R4 prose says +1m/s forward advantage but actual assertion is strictly forward lipV > neutral lipV. Never claim +1m/s from these results. R8 prose mentions .3s release in one title; actual fixture releases after .2s. R5 continuity requires36 consecutive zero-limit ticks after touchdown; this remains a positive current recovery bar.

Historical counterfactuals for parent judgment, not edited here: R5 former press.rate05 < pressRaw.rate05 requires a particular phase ordering at exactly500ms (positive limited kick caps and held authority are independent). R6 Pro at100ms<−5° requires the historical bad initial inversion; current−.7855° is less inverted, while held±25–40° authority and early raw-swing rate are independent bars. R6 q15<.15 tests an override servoIntentBackM=.15; shipped value is0. Its hard absolute hop ceiling is a characterization of an unshipped gate, while shipped hop monotonicity and gate activation/recovery retain independent positive tests. These differ from negative-lean open-loop divergence: that is expressly a design contract and must remain passing.

## Later refinement / corrections (supersedes inertia12 recommendation)

Owner full-suite caught two omissions in my initial inertia12 summary: throttle-only air at8m/s7.99034° fails8° lower bound, and Pro mild40° slam faults. The earlier “all air passes” claim meant held-lean values and was too broad. Corrected `fine`/`mono`/`mono2` modes explicitly preserve all measured air fields and severe/mild impacts.

Rookie inertia11.9 gives touchdown59.4667°, throttle8m/s8.00515°, forward ramp advantage+.03361m/s. Pro need not change inertia: its11 baseline touchdown55.375° already passed. Pro mild slam still faults at inertia11; owner attributes it to earlier stiffness/rebound changes and handles independently. No full combined acceptance is claimed.

Rookie targetRateAng3.5 +kd4500 at inertia11.9 yields equilibrium inversions[1.4861,1.3727,.8099] at throttle[.4,.7,1], all≤1.5. Throttle8m/s8.00646°, forward ramp advantage+.08104m/s, touchdown59.4667°. This remains a candidate pending owner's hop/complete suite. Rate3.5/kd4200 fails1.5128;3.75/kd4500 fails1.5096. Larger damping alone and angular stiffness alone did not pass. Owner may preserve Pro angularrate/damping because property test is Rookie-only.

Later runtime changed between source snapshots: fine source records inertia12; mono2 runs started as owner applied split Rookie11.9/Pro11. Both have matching corresponding base rows. Main reproducibility authority is the owner's final retained source and complete suite.
