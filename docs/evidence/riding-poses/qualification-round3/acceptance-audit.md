# Parent acceptance audit — qualification still running

Implementation is `2dece1ce`, simulation `1255af7f`. This table records what is
implemented and inspected; it does not close the plan while handling and cohort
qualification remain unfinished.

| Required behavior | Implementation and evidence | Parent finding |
|---|---|---|
| Seated neutral | Shared mass/anatomy targets and actual GLB stance/contact tests; all 20 lean-transition clips in `visual-review.json` | Pelvis sits on the saddle in neutral on both classes; no separate draw-only standing mass frame. |
| Forward rise and torso lean | Target hip rise 20.8 cm, actual bone/COM tests and each transition clip | Whole body rises and chest moves toward the bars; the old authored-clip dead zone is removed. |
| Rearward hips and extended arms | Continuous shared target, contact tests and both half/full rearward inputs in each transition clip | Pelvis moves behind the saddle and arms extend without stretching their bone lengths. |
| Natural elbows | Two-segment anatomical solve, continuous bounded arm-plane alignment and garment skin conditioning | The inspected forward/back/reversal sequences no longer show the rejected sleeve craters or a chicken-wing elbow silhouette. |
| Contacts and explicit release | Ordinary riding remains within the existing 2 cm bar; actual-skin/rig contact tests; strict same-tick release test and 40 impact/release clips | Hands and boots retain believable ordinary contact. In real crash/thrown events the rider separates and slumps independently; restart restores the riding chain in one input tick. |
| Runtime clothing | All five outfits, high/low meshes, both classes across transitions, hops, flat/sloped impacts, crash/restart | No visible gross tearing, elbow collapse or sustained body/fender intersection in inspected sequences. The actual-skin thrown audit reaches -2.38 mm signed clearance, inside the declared 5 mm numerical envelope, rather than mathematically zero intersection. |

The visual instrument is parent inspection of temporally ordered decoded frames
from actual 30 fps input-driven MP4s, including denser release frames. Full clips
are retained under `harness/out/riding-poses-round3/`; `captures.json` fingerprints
them. It is not human continuous-video viewing, and does not close the broader
subjective mission bars. Headless WebKit confirms the phone layout and GPU
compatibility on this Mac; no actual iPhone performance result is inferred.

`all-capture-replays.json` independently matches all 14,810 sampled states across
62 captures: full JSON state, physics hash, run-clock and displayed simulation time.
The three large actual-skin reports are losslessly gzipped with round-trip SHA-256
records in `compressed-evidence.json`. Scripts still generate ordinary JSON.

All 48 goldens and twelve independent stranger replays are now qualified. The full
Metal gate passes 31/31. Serial suite: 1,078 passes, one R8 recovery-measurement
failure and two skips; CPU timing bars pass. The user requested a pause before
resolving that last finding and final acceptance. See `PAUSE.md` and
`r8-diagnostic/README.md`. No completion claim is made.
