# Labs and standing-forward review — asks 78–80

## Delivered for local review

- Container Step (`lab-box-climb`): 33m, vertical +0.65m and +0.60m container steps,
  red/ivory panels, timber exit. No checkpoint skips the maneuver.
- Timber Launch (`lab-ramp-jump`): 38m, 0.65m approach ramp, concave 2.4m timber
  takeoff, 3m dry gap and raised landing. Dimensions adapted to our bike; not a
  measured reconstruction or copied asset. Both are accessible as Labs map markers.
- Stand-and-lean candidate: rise first, tall 48deg torso, shoulder behind grip,
  forward-only elbow branch so forearms reach toward bars. Backward/neutral endpoint
  definitions and their elbow pole are unchanged. Backward dynamics can differ due
  to earlier forward input; this does not assert pixel-identical transitions.

User explicitly rejected the earlier forward pose as impossible elbows/pancake
folding. Parent also rejected candidate1 closeup, despite contact tests passing.
Candidate2 closeups and chronological decoded gameplay frames are substantially
more upright with forward-reaching arms. Human motion acceptance is still open.
Blender was authorized if useful; the actual fault was shared joint targets/pole,
so this correction was made in the game's shared physical/render geometry.
No Blender authoring or generated reference animation is claimed.

## Played evidence

Review: `harness/out/labs-evolution/index.html`. Source and hashes: `videos.json`.
Videos show real gameplay; slow repeats duplicate frames, never synthesize poses.
Three-column forward/back clips: original baseline / rejected round3 / new candidate.
Each has identical input timing: neutral1s, fulllean1s, release1s. Viewport,
class, outfit and quality match. 'Before' means preserved pre-work baseline,
not an independently established yesterday build.

Final bot clears: Container4.750s, Timber5.508333333333333s, zero faults each,
first attempt each. Headless WebKit matches complete state hashes and finish/run
clock IEEE bytes (`webkit-clears.json`). Three Metal captures replay in production
Node with all549 sampled full states/hash/clocks exact (`capture-replays.json`).
Captures include real finish/result screens. Byte evidence compressed losslessly.

Independent AI stranger tested candidate1 (fingerprint ad49be92), not final:
box8attempts/no clear/bestx15.5; ramp1attempt/5.9083s. Both sessions finalized.
This is a challenging-box vs easy-ramp observation, not a human usability result.
Their reports retained under candidate1; no final-candidate stranger claim.

## Known regressions — NOT a release checkpoint

Final full suite:1097pass,10fail,2skip,86files. Typecheck/build/scopedlint pass.
125 targeted geometry/contact/cloth/snapshot/R9 tests pass. Existing bars unchanged.

Seven failures are real handling regressions: three assertions of reference hop
0.405m vs0.45 minimum; slower snap0.337m vs0.38; 35degcrawl stalls85%; 40degcrawl
stalls70% and45degfaults; raw Rookie rampfrontlift32.28deg vs>35.
Three R7/R8 tests first stop on old B1 recordings no longer finishing. This is not
just stale recordings: diagnostics additionally show383recovered R7ticks outside
band (maxCOM.166m vs.15), R8M3Pro COM>.35m for.74s vs.50, minhipY-.238 vs.12floor.
No limits were relaxed or recordings replaced to conceal these concerns.

Next: user judges the new motion; preserve accepted silhouette while restoring
hop/climb and recovery capability, then regenerate/requalify curriculum recordings.
The older paused riding-pose qualification no longer validates this new candidate.
No deploy or push. Local candidate remains explicitly unqualified for release.
