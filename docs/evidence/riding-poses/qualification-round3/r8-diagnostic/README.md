# R8 recovery diagnostic at the round-three pause

Frozen candidate: commit `2dece1ce`, simulation `1255af7f`. Diagnostic only: no runtime,
production test, or golden changes; no passing-suite claim. Parent review remains open.

`probe.ts` copies R8's demand and envelope measurement, runs all 48 current golden
recordings, and records every failing recovery tick rather than stopping at the
first assertion. Run with `pnpm exec tsx docs/evidence/riding-poses/qualification-round3/r8-diagnostic/probe.ts`.
`summary.json` contains every row; per-recording JSON includes the selected windows.

## Finding

Only `m1-hop-up/bot-3.json` (Rookie) violates the existing recovery assertion:
20 consecutive ticks, 3866–3885 (32.217–32.375 s), peak COM error 0.237794 m at
3874. The recording has zero faults. Last globally over-demand tick is 3787;
the failing ticks are 79–98 ticks later. This is neither initial spawn history
nor a post-fault reset artifact. All 48 finish; every other recovery row passes.
All original envelope and excursion counters remain in the data.

At tick 3841 the rider commands lean −0.496→+1 while airborne. The target travels
0.433341 m from ticks 3840→3874 (0.2833 s), initially at 0.8 m/s and reaching
2.350022 m/s as rear-wheel support intermittently returns around 3855.
The air-edge flag remains set and transfer blend remains zero. The deliberate
anti-coasting-hop rule prevents this air-commanded target travel earning intent
after touchdown. Consequently the physical Hill force cap is commonly 0.3 ×
4000 N = 1200 N, while R8 calls demand feasible against the full 4000 N.

Examples (linear acceleration including gravity, in g):

| Tick | R8 desired demand | Actual available cap | R8 fixed cap |
| --- | ---: | ---: | ---: |
| 3856 | 3.171 | 1.770 | 5.437 |
| 3860 | 3.972 | 2.264 | 5.437 |
| 3864 | 1.954 | 1.669 | 5.437 |
| 3868 | 1.866 | 1.631 | 5.437 |
| 3876 | 2.604 | 1.631 | 5.437 |
| 3880 | 2.468 | 1.631 | 5.437 |

A diagnostic alternate classifier multiplies the original `Fmax / (mass * G)`
by the physical `debug().rider.legFrac`, leaving the original six-tick demand
window, angular threshold, 60-tick recovery interval, 0.15 m COM and 0.35 rad
angle bars unchanged. Every original bad tick is only 0–6 ticks after an
available-cap exceedance. All 48 recordings have zero alternate-classifier
violations; 29,309 ticks still qualify as recovered (original: 34,285), well above
the existing 5,000-tick coverage floor. This is evidence for review, not a test
change or proof that every moving-target case is qualified. The existing
post-fault history handling was not revised in this diagnostic.

## Mechanism controls and recommendation

`counterfactual.ts` resumes three simulations from the same tick-3840 snapshot,
runs only the next 90 ticks, and changes tuning in those isolated in-memory
simulations. It does not edit runtime tuning or goldens. `counterfactual.json`:

| Control | Maximum COM error | Ticks above 0.15 m |
| --- | ---: | ---: |
| Actual production physics | 0.237794 m | 20 |
| Hill cap disabled | 0.127310 m | 0 |
| Ground target speed held at air speed | 0.053513 m | 0 |

The lag is real, but the assertion credits recovery across a fresh demand that
exceeds the actual force ceiling. This is a concrete demand-cap instrumentation
mismatch, not evidence of failure to recover after 60 ticks of physically
feasible demand. Do not disable the physical cap or air-edge intent rule merely
to make R8 pass: those rules preserve the landing/pogo and no-coasting-hop bars.

Minimal justified next step: parent review a demand classifier using the
mechanism's actual available force ceiling (with direct cap/intent coverage),
retaining every positive numerical bar and the recovered-tick coverage floor.
Consider window/instantaneous-cap alignment explicitly before landing that
change: current demand is a six-tick average while `legFrac` is per-tick, and
cap availability itself depends on physical closing velocity. Retain a focused
reproduction of this new air-command-to-touchdown transition so an availability
classifier cannot hide arbitrary loss of tracking. Until reviewed and tested,
R8 remains unresolved and the full suite remains 1078 pass / 1 fail / 2 skip.
