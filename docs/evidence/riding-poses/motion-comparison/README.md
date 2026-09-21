# Ask 77 — motion comparison, no implementation changes

The user rejects the current forward lean as worse than the pre-work version and
prefers the rearward pose. Forward pose visual acceptance is explicitly reopened.
Main implementation remains paused. These clips support the next human review.

Outputs: `harness/out/pose-motion-review/index.html`, `forward-before-after.mp4`,
`backward-before-after.mp4`, and `full-sequence-before-after.mp4`.
Before is left; current is right. Each direction plays three seconds real time,
then the same frames at half speed (nine seconds total). No interpolated poses.
Both builds replay exactly the same recorded input: settle neutral two seconds,
forward one second, neutral one second, back one second, neutral one second.
Capture excludes the first settling second; all prefix ticks were simulated and
rendered. Both use high quality, Rookie, mustard, 1280x720, 30fps, Metal.
Identical render settings do not imply identical rendering code: AA was changed.
Both captures produced 150 frames with zero recorded errors and matching input SHA.

Before is `/tmp/trials-poses-aa-baseline/dist`; current is frozen round-three
`/tmp/trials-poses-round3/dist`. The baseline predates this work; its calendar date
is not claimed to be yesterday. Captures and full byte proofs remain in the output
folder. `sources.json` records their hashes, frame bounds and output durations.

Review of chronological decoded gameplay frames: current forward position folds
the torso lower and draws the elbows down more strongly; the rearward hips travel
farther back. This supports investigating the reported forward visual regression;
mechanical/contact qualification did not establish human visual acceptance.

Evolution reference clips retain the surrounding riding context. D License
30.5–37.0s shows weight shifts; A License 58–65s shows climbing transfer. Inputs
are unknown and terrain/camera differ; neither is advertised as a controlled
neutral-to-full-lean test. Full source links are in the review page and manifest.

Reproduce capture with `npx tsx harness/hero-capture.mts BUILD
harness/inputs/hero-r15/seated-forward-back.json OUT 120 720 high street-mustard
30 1280x720 metal` for each frozen build. Assemble using `make-review.py`.
