# Resume checkpoint — user-requested pause, 2026-09-21

The user asked to wrap at a good pause point because usage was running low.
Do not resume autonomous work until requested. The active goal is paused, not done.

## Saved implementation and validation

- Round 1 `4fa79c3e`: Wildshard-style HDR/SMAA, phone DPR 1.5, Snow obstacle-batch fix.
- Round 2 `2dece1ce`: shared rider anatomy/physical mass/sensors/render, forward rise,
  rearward transfer, landing response, anatomical elbows, sleeve conditioning,
  support/suspension closure, explicit same-tick ragdoll release.
- Frozen simulation fingerprint `1255af7f`. Current built output is
  `/tmp/trials-poses-round3/dist`; repo `dist/` has the same production implementation.
- `../goldens-round3/browser-all.json`: 48 exact complete golden replays. Forty-three
  selected runs have no faults; five have one. Snow Rookie uses explicitly labeled
  skill-3 + parent PD + skill-3 controls. Earlier failed searches are retained.
- `../strangers-round3/`: all twelve independent players cleared with exact complete
  replay proofs. Attempts: B1 [1,1], B2 [1,2], B3 [3,2], E1 [4,2], E2 [1,2], E3 [1,1].
  E2/E3 are under the intended difficulty bands; do not relabel them as in-band.
- `visual-review.json`: all 60 required class/outfit/detail/motion combinations
  reviewed via ordered frames from actual input-driven clips, plus Snow phone play.
  `captures.json`: 63 full MP4s/evidence hashes under ignored
  `harness/out/riding-poses-round3/`. `all-capture-replays-with-snow.json`: 15,020
  sampled states match independent production replay. No human continuous-video
  viewing or actual iPhone performance is claimed.
- `webkit-clears.json`: B1/E2 on both bikes match exact WebKit finish/run clocks and
  hashes. `hero-webkit.json`: current low/high harness and live rendering pass.
- `metal-ship-gate.json`: full 31/31 pass, including cold boot/clear/crash/restart,
  offline play, render p95 5.06ms, restart frame p95 5.47ms. Raw-heap and SwiftShader
  failures are retained. Heap measurement now collects garbage at both endpoints;
  the original 5MB limit is unchanged. Five-minute raw/retained diagnostic included.
- `full-suite-serial-initial.log`: 1,078 pass, one failure, two preexisting skips.
  R3/R5 CPU limits pass at 3.893/4.458 microseconds. Typecheck/build pass; scoped
  changed-code/evidence lint passes. Full repo lint has documented preexisting
  evidence/art-script failures; no blanket clean-lint claim.

## Exact remaining blocker

Read `r8-diagnostic/README.md` first. Only M1 Rookie fails the R8 recovery band:
20 ticks (3866–3885), max COM error 0.237794m, no faults. The test calls these
recovered using a constant 4000N capacity. A new airborne lean command followed by
touchdown instead has about 1200N actual capacity under the intended landing cap;
target demand exceeds that cap during this window. Comparing against the actual
cap leaves zero violations over all 48 goldens and 29,309 recovered ticks, but this
is **diagnostic, not an accepted test rewrite**. Review six-tick demand-window
alignment and the state-dependent cap carefully. Keep the 60-tick recovery period,
0.15m COM / 0.35rad angle bands, support/reach bounds and coverage floor unchanged.
Do not choose easier controls or raise limits just to hide the failure.

No runtime/test changes were made for this finding. No source changes occurred
after the frozen qualification. If a justified instrumentation correction is
accepted, run targeted R8 then the full serial suite; if physics changes, preserve
all old evidence and requalify fresh source/replays rather than relabeling it.

Then finish the six-row acceptance audit, update asks 73/74 and plan index, archive
only when actually complete, and handle delivery. No push or deployment occurred
in this task. HR-14 is optional subjective phone review, not another benchmark ask.
All new worker agents/searches are stopped; no pending approval or user decision.
