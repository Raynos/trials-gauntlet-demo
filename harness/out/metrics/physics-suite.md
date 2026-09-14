# Physics suite — v1-42bdfe0: bikePhysicsFactory, src 4c6d9739, git 1d7d448, 2026-09-14T19:24:55.905Z

REJECT — 20 pass, 3 fail, 9 info. Bikes rookie + pro. Wall 2042 s, loadavg 18.7 → 10.7 on 18 cores.

| section | check | verdict | value | note |
|---|---|---|---|---|
| identity | physics | INFO | bikePhysicsFactory | src 4c6d9739; bike classes exported: rookie,pro |
| feel | vitest | FAIL | 4 passed, 2 failed | src/physics tests exit 1 (1 s) |
| feel | envelope | FAIL | 41/45 in band, 70 info | out of band: governor.thr0.3.top=10.963 [11-13 m/s]; wheelie.openLoopLeave.+0.5=0.775 [1-2 s]; wheelie.openLoopLeave.-0.5=0.767 [1-2 s]; air.brake0.5s.pitchDeg=-13.480 [-10..-30] |
| determinism | rookie.D1-D8 | PASS | 9/9 | bot-3.json D1 D2 D3 D4 D4c D4b D5 D7 D8 |
| determinism | rookie.snapshot-probe | PASS | 600 | 600 ticks: rollouts + restore never change the next tick (x=78.2) |
| determinism | pro.D1-D8 | PASS | 9/9 | bot-3-pro.json D1 D2 D3 D4 D4c D4b D5 D7 D8 |
| determinism | pro.snapshot-probe | PASS | 600 | 600 ticks: rollouts + restore never change the next tick (x=92.8) |
| sweep | rookie.skill2 | INFO | 17/19 tracks cleared | 90 s wall per track, 1 seed; not cleared: h2-gap-chain 1% @542m crash, x2-pipe-dream 1% @447m crash |
| clears | rookie.b1 | PASS | 1 attempt(s), 33.933 s | node 23c14756113930bc browser 23c14756113930bc IDENTICAL; 115 s wall |
| clears | rookie.e1 | PASS | 1 attempt(s), 36.250 s | node 5fee60338c9f8333 browser 5fee60338c9f8333 IDENTICAL; 97 s wall |
| clears | rookie.m1 | PASS | 1 attempt(s), 29.050 s | node d41d81a43e8f1e44 browser d41d81a43e8f1e44 IDENTICAL; 81 s wall |
| clears | rookie.h1 | PASS | 1 attempt(s), 38.575 s | node 78a009e7ecdbdc4a browser 78a009e7ecdbdc4a IDENTICAL; 120 s wall |
| clears | rookie.x1 | INFO | maxAttempts at 54% | 458 s wall |
| clears | pro.b1 | PASS | 1 attempt(s), 27.325 s | node 6e9c13b78af852ff browser 6e9c13b78af852ff IDENTICAL; 96 s wall |
| clears | pro.e1 | PASS | 1 attempt(s), 29.492 s | node 1278ec52e0e54717 browser 1278ec52e0e54717 IDENTICAL; 80 s wall |
| clears | pro.m1 | PASS | 1 attempt(s), 23.608 s | node e0b94c883c7f04dd browser e0b94c883c7f04dd IDENTICAL; 65 s wall |
| clears | pro.h1 | PASS | 2 attempt(s), 32.958 s | node e840e1b9839f8adb browser e840e1b9839f8adb IDENTICAL; 97 s wall |
| clears | pro.x1 | PASS | 1 attempt(s), 41.367 s | node 7a9ba781f3cc77e9 browser 7a9ba781f3cc77e9 IDENTICAL; 111 s wall |
| reflex | rookie.b1 | PASS | 1,1,2 → 1 | band 1–1, 3/3 cleared, 55.1 s; died: crash @ 574 m ×1 |
| reflex | rookie.b2 | PASS | 1,2,1 → 1 | band 1–2, 3/3 cleared, 59.6 s; died: crash @ 586 m ×1 |
| reflex | rookie.b3 | PASS | 2,2,1 → 2 | band 1–2, 3/3 cleared, 56.0 s; died: crash @ 363 m ×1; crash @ 147 m ×1 |
| reflex | rookie.e1 | PASS | 3,12,1 → 3 | band 2–4, 3/3 cleared, 66.9 s; died: ramp @ 310 m ×5; ramp @ 309 m ×4; ramp @ 308 m ×1 |
| reflex | rookie.e2 | PASS | 1,4,12 → 4 | band 3–5, 3/3 cleared, 83.8 s; died: ramp @ 515 m ×3; ramp @ 66 m ×2; ramp @ 65 m ×2 |
| reflex | rookie.e3 | PASS | 1,2,3 → 2 | band 3–6, 3/3 cleared, 63.9 s; died: stair @ 61 m ×1; stair @ 60 m ×1; stair @ 67 m ×1 |
| reflex | pro.b1 | INFO | 1,3,1 → 1 | band 1–1, 3/3 cleared, 51.7 s; died: crash @ 94 m ×1; crash @ 265 m ×1 (Pro: informational, the band is Rookie’s) |
| reflex | pro.b2 | INFO | 2,5,7 → 5 | band 1–2, 3/3 cleared, 76.1 s; died: crash @ 435 m ×2; crash @ 286 m ×1; crash @ 375 m ×1 (Pro: informational, the band is Rookie’s) |
| reflex | pro.b3 | INFO | 7,6,3 → 6 | band 1–2, 3/3 cleared, 74.4 s; died: crash @ 336 m ×2; crash @ 350 m ×1; ramp @ 388 m ×1 (Pro: informational, the band is Rookie’s) |
| reflex | pro.e1 | INFO | 11,33,51 → 33 | band 2–4, 2/3 cleared, 193.8 s; died: crash @ 78 m ×7; crash @ 82 m ×5; crash @ 313 m ×5 (Pro: informational, the band is Rookie’s) |
| reflex | pro.e2 | INFO | 12,22,24 → 22 | band 3–5, 3/3 cleared, 168.5 s; died: ramp @ 175 m ×8; ramp @ 176 m ×5; ramp @ 178 m ×4 (Pro: informational, the band is Rookie’s) |
| reflex | pro.e3 | INFO | 11,10,20 → 11 | band 3–6, 3/3 cleared, 116.2 s; died: stair @ 404 m ×4; stair @ 401 m ×3; crash @ 428 m ×2 (Pro: informational, the band is Rookie’s) |
| camera | b3 | FAIL | null | no camera line; clip exit 1: camera assertion FAILED: camera: FAIL 889 frames, bike x 0.206..0.779 y 0.2..0.621 (box 0.2..0.8; out 37, riding 37), clamped 193 (21.7%), max\|roll\| 2.8e-17, states fast:815 riding:39 finish:30 idle:5; first: f414@t1660 (0.227,0.2) fast, f415@t1664 (0.22,0.2) fast, f417@t1672 (0.212,0.2) fast (clip written; pass --no-camera-assert to ignore) |
| stranger | smoke | PASS | 8/8 calls ok | start look play play restart play reset status; no recording written |

## Feel envelope (`vitest run src/physics`: 4 passed, 2 failed)

| quantity | value | band | in band |
|---|---:|---|---|
| settle.pitchDeg | 0.790 | |pitch| < 1 | yes |
| settle.rearComp | 0.271 | 0.08-0.35 | yes |
| settle.frontComp | 0.254 | 0.03-0.35 | yes |
| settle.speed | 0.000 | < 0.01 | yes |
| launch.t16 | 2.192 | <= 3.5 s | yes |
| launch.topSpeed | 20.351 | 19-21 m/s | yes |
| launch.maxPitchDeg | 8.340 | info | info |
| stranger.thr1.lean0.4.finish | 7.042 | > 0, no fault | yes |
| wheelieControl.thr1.lean0.maxPitchDeg | 38.033 | 25-42 (a wheelie, not a loop) | yes |
| wheelieControl.thr1.lean0.plateauDeg | 37.5..38.0 | info (pitch band after 3 s) | info |
| wheelieControl.thr1.lean0.finish | 9.308 | > 0, no fault (120 m) | yes |
| wheelieControl.thr1.lean0.top | 13.914 | info (the wheelie costs top speed) | info |
| wheelieControl.thr1.lean-0.3.maxPitchDeg | 39.176 | 25-42 | yes |
| wheelieControl.thr1.lean-0.3.finish | 9.042 | > 0, no fault | yes |
| loop.thr1.leanBack.at | 2.492 | loops (design ~0.7-1.2 s; 2.4: the preload crouch delays it, 12.4 (0b)) | info |
| loop.thr1.lean-0.5.at | 1.367 | loops <= 1.5 s | info |
| loop.thr0.7.lean0.maxPitchDeg | 6.992 | < 15 (front stays down) | yes |
| governor.thr0.3.top | 10.963 | 11-13 m/s | **no** |
| governor.thr0.6.top | 17.801 | 16-18 m/s | yes |
| governor.thr1.top | 18.656 | 18-21 m/s (lean +1: the rear is nearly unloaded at speed and spins, round 9: the drag field acts through the low lean-+1 COM) | yes |
| governor.thr1.lean1.t16 | 2.983 | <= 4.5 s (full forward lean unloads the rear off the line) | yes |
| pro.thr1.lean0.loopAt | 1.467 | >= 1.2 s (Rookie: never, 38 deg wheelie) | yes |
| pro.thr1.lean0.4.maxPitchDeg | 7.523 | < 15, finishes | yes |
| pro.thr1.lean0.4.t16 | 1.400 | <= 3.0 s | yes |
| pro.thr1.lean0.4.top | 22.072 | 21-23 m/s (limiter at 22.0) | yes |
| pro.thr1.lean0.2.maxPitchDeg | 8.903 | info | info |
| pro.thr1.lean1.top | 21.126 | info | info |
| pro.thr0.3.top | 21.987 | no governor: reaches the limiter (Rookie 11 m/s) | info |
| brake.stopDist.leanBack | 3.140 | <= 4.5 m | yes |
| brake.minPitchDeg.leanBack | -7.582 | > -30 | yes |
| brake.stopDist.lean0 | 5.087 | info | info |
| hop.rearApex | 0.671 | 0.55-0.75 m | yes |
| hop.airtime | 0.525 | 0.45-0.9 s | yes |
| hop.phases | idle>preload>push>recover | idle>preload>push>recover | info |
| ledge.0.9.made | yes | yes | info |
| ledge.0.9.rearLiftAtWall | 1.063 | info (>= 0.9 needed: the plate no longer hooks the edge) | info |
| ledge.0.9.landPitchDeg | -11.061 | info | info |
| ledge.0.9.rideAway | yes | yes | info |
| ledge.0.9.fault | none | none | info |
| pro.climb.55 | true 1.02 s | top (Rookie 1.77 s) | info |
| pro.climb.60 | true 2.27 s | top (Rookie 2.91 s) | info |
| pro.climb.65 | false maxY 0.26 | stalls | info |
| pro.hop.rearApex | 0.687 | 0.6-0.7 m (Rookie 0.676) | yes |
| pro.ledge0.9 | made | made (10 of 36 hopper combos; Rookie 12 of 36) | info |
| ledge.0.5.made | yes | yes | info |
| climb.55.top | yes | yes | info |
| climb.55.time | 1.775 | info (4 m plank) | info |
| climb.55.fault | none | none | info |
| pd.rookie.held | 12.0 s at 11.2 m/s | >= 10 s | info |
| pd.pro.held | 4.2 s at 22.0 m/s | >= 3.5 s, drops at the limiter (~22 m/s) | info |
| climb.60.maxY | 3.464 | >= 2.5 m of 3.46 | yes |
| climb.60.top | yes | yes | info |
| climb.60.time | 2.908 | info (4 m plank) | info |
| climb.60.fault | none | none | info |
| climb.65.top | no | no | info |
| climb.65.rollback | 0.397 | > 0.2 m (stalls at the base corner, comes back down on the front wheel) | yes |
| climb.65.fault | none | none | info |
| climb.70.top | no | no | info |
| wheelie.balanceDeg.lean0 | 48.442 | 40-50 | yes |
| wheelie.balanceDeg.leanBack | 38.055 | < lean0 | info |
| wheelie.balanceDeg.leanFwd | 70.197 | > lean0 | info |
| wheelie.balanceDeg.accel3 | 36.120 | < lean0 (gas lifts the nose) | info |
| crest.rookie.maxPitchDeg | 42.281 | <= 45, no fault (round 10: 43 with the front memory, 60-120 on b1 per the strangers) | yes |
| crest.pro | crash max 142 | loops | info |
| wheelie.openLoopLeave.+0.5 | 0.775 | 1-2 s | **no** |
| wheelie.openLoopLeave.-0.5 | 0.767 | 1-2 s | **no** |
| wheelie.pdHeld | 12.000 | >= 10 s (44 deg target, lean -0.5: the pure plant, control off) | yes |
| wheelie.pdRmsErrDeg | 6.431 | < 12 (a real balance-point hold) | yes |
| wheelie.pdBandDeg | 35.4..54.5 | info (after 2 s) | info |
| wheelie.pdLeanSaturated | 0.000 | < 0.2 | yes |
| wheelie.pdNeutral.held | 12.000 | info (45 deg target parks the lean at -0.3: the wheelie control holds it) | info |
| wheelie.pdNeutral.bandDeg | 16.1..32.2 | info (the control plateau, below the 45 asked) | info |
| kicker4x0.8.8.rookie | rides away max 65 | no fault (the 50-65 deg peak is the ballistic launch attitude; the asked <= 45 is open) | info |
| kicker4x0.8.8.pro | crash max 128 | loops | info |
| kicker4x0.8.11.rookie | rides away max 65 | no fault (the 50-65 deg peak is the ballistic launch attitude; the asked <= 45 is open) | info |
| kicker4x0.8.11.pro | crash max 132 | loops | info |
| drumRow@12.rookie | crash pitch -130..20 | info (round 10: the same) | info |
| drumRow@30.rookie | crash pitch -123..35 | info (round 10: the same) | info |
| landing.survivablePitchDeg | -30..60 | includes -5..35 (design asks 40) | info |
| landing.rearFirstFrom | -10.000 | info | info |
| landing.noseDown.-20.free | rides away pitch -3..4 rate 428 | rides away (vertical impulse ahead of the COM pitches nose-up) | info |
| landing.noseDown.-20.brake | rides away pitch -15..2 | dives past -15, rides away (round 11; -40 in round 9) | info |
| landing.noseDown.-40.free | rides away pitch -23..6 rate 510 | rides away (vertical impulse ahead of the COM pitches nose-up) | info |
| landing.noseDown.-40.brake | rides away pitch -34..4 | dives past -30 (round 11: the air-dragged front meets the ground spinning; round 9 endoed) | info |
| air.brake0.5s.pitchDeg | -13.480 | -10..-30 | **no** |
| air.throttle0.5s.pitchDeg | 14.831 | +5..+30 | info |
| air.leanBack0.5s.pitchDeg | 26.745 | > 0 | yes |
| air.controlledLandingPitchDeg | 13.561 | 15 +- 15 | info |
| airtime.hop | 0.525 s at 0.67 m | 0.45-0.7 s, 0.6-0.7 m (was 0.56 s / 0.62 m at 9.81) | info |
| airtime.kicker45.1m.6ms | 0.600 s (lip 3.4 m/s, launch pitch 83, drift -83 deg, crash) | info (was 1.06 / 1.49 at 9.81) | info |
| airtime.kicker45.1m.10ms | 0.892 s (lip 6.5 m/s, launch pitch 53, drift 49 deg, crash) | 1.0-1.2 s (was 1.40 at 9.81) | info |
| airtime.kicker45.1m.14ms | 1.058 s (lip 9.4 m/s, launch pitch 40, drift 25 deg, lands) | info (was 1.06 / 1.49 at 9.81) | info |
| airtime.drop2m | 0.508 | ~0.5 s (was 0.62 at 9.81) | info |
| susp.sag | R 0.273 F 0.253 | 0.25-0.30 (was 0.10 / 0.24) | info |
| susp.drop1.5 | peak R 0.90 F 0.97, rebound to 0.20 at +0.31 s, back to sag at +0.38 s | peak >= 0.8, rebound below sag, one cycle ~0.5 s | info |
| susp.drop3.buck | bottom 0 ticks, chassis lift 18.7 cm, pitch kick 14.3 deg | bottoms; lift 5-25 cm (asked 5-10; the whole bike hops off a 9 m/s impact); kick 3-15 deg | info |
| susp.squat | sag 0.27 -> peak 0.83, >= sag+0.20 for 0.80 s | >= +0.20 for >= 0.3 s | info |
| susp.dive | sag 0.25 -> peak 0.69 (lean 0) | >= 0.50 | info |
| wedge.9ms | on 34 fell 11 hang 0 of 45 | hang 0 | info |
| golden.rookie.flat-test.bot-3 | 468698322c4ed60d finish 7.091666666666667 fault null | d2b082502561bc00 | info |
| pose.lean.t90.fwd | 0.267 | 0.15-0.35 s (design asked 0.10-0.15; the brace cap sets it) | yes |
| pose.lean.overshoot.fwd | 0.000 | 0-0.1 (slight) | yes |
| pose.lean.t90.back | 0.250 | 0.15-0.35 s | yes |
| pose.lean.overshoot.back | 0.000 | 0-0.1 | yes |
| pose.torso.transientPeak.fwd | 0.273 | info (rad; the swing lagging the lean, + = pitched forward) | info |
| pose.torso.transientPeak.back | -0.287 | info | info |
| pose.torso.settleT.fwd | 0.508 | < 0.75 s (back within 0.02 rad) | yes |
| pose.torso.settled.fwd | 0.001 | |x| < 0.03 (no steady lean bias; was -0.34 per unit lean) | yes |
| pose.torso.settled.back | -0.012 | |x| < 0.03 | yes |
| pose.crouch.leanOnly.fwd | 0.000 | 0 (a lean is not a crouch; was 1.0 at lean >= 0.6) | info |
| pose.crouch.leanOnly.back | 1.000 | 0 (was 0.67 at lean -1; throttle 0.3 is the hop threshold, lean -1 preloads) | info |
| pose.lean.settle.fwd | 0.982 | 0.9-1 | yes |
| pose.crouch.leanSweep | 0.000 | 0 (lean -1 then +1 at 9 m/s, throttle 0.25: no hop, no crouch) | info |
| pose.crouch.preload0.3s | 1.000 | 0.9-1 (0.3 s into a preload: crouchTime 0.25 s, eased) | yes |
| golden.pro.flat-test.bot-3 | ff507f3cfe5bc77a finish 6.441666666666666 fault null | 32a467457c497e2c | info |

## Determinism — rookie (harness/inputs/flat-test/bot-3.json)

| check | pass | hashes | note |
|---|---|---|---|
| D1 cross-load | PASS | 468698322c4ed60d 468698322c4ed60d | 3 loads, finish=7.091666666666667 |
| D2 cross-encoding | PASS | 468698322c4ed60d 468698322c4ed60d |  |
| D3 node-vs-browser | PASS | 468698322c4ed60d 468698322c4ed60d | physics=bikePhysicsFactory |
| D4 snapshot-node | PASS | 5fae06557e1fc424 05d65e6a6b900022 |  |
| D4c foreign-snapshot | PASS | 5fae06557e1fc424 05d65e6a6b900022 |  |
| D4b snapshot-browser | PASS | 5fae06557e1fc424 05d65e6a6b900022 |  |
| D5 chunking | PASS | 468698322c4ed60d 468698322c4ed60d | chunks 1,7,15,120 + runRecording |
| D7 no-state-leak | PASS | 468698322c4ed60d 468698322c4ed60d |  |
| D8 pinned-hash | PASS | f687ce0364160cb0 f687ce0364160cb0 | pinned physics=bikePhysicsFactory |

snapshot-probe: PASS — 600 ticks: rollouts + restore never change the next tick (x=78.2)

## Determinism — pro (harness/inputs/flat-test/bot-3-pro.json)

| check | pass | hashes | note |
|---|---|---|---|
| D1 cross-load | PASS | 0b43233b0a69890a 0b43233b0a69890a | 3 loads, finish=6.141666666666667 |
| D2 cross-encoding | PASS | 0b43233b0a69890a 0b43233b0a69890a |  |
| D3 node-vs-browser | PASS | 0b43233b0a69890a 0b43233b0a69890a | physics=bikePhysicsFactory |
| D4 snapshot-node | PASS | 8e8dd34322afab8d 03ea398f7f854643 |  |
| D4c foreign-snapshot | PASS | 8e8dd34322afab8d 03ea398f7f854643 |  |
| D4b snapshot-browser | PASS | 8e8dd34322afab8d 03ea398f7f854643 |  |
| D5 chunking | PASS | 0b43233b0a69890a 0b43233b0a69890a | chunks 1,7,15,120 + runRecording |
| D7 no-state-leak | PASS | 0b43233b0a69890a 0b43233b0a69890a |  |
| D8 pinned-hash | PASS | 7070fc237cbc78c7 | pinned now (first run) |

snapshot-probe: PASS — 600 ticks: rollouts + restore never change the next tick (x=92.8)

## Naive sweep — rookie, skill 2, 90 s wall per track

| track | tier | best % | clears | attempts | finish | first blocker |
|---|---|---:|---|---|---|---|
| flat-test | beginner | 1% | 1/1 | 1 | 7.1 | — |
| gap-test | beginner | 1% | 1/1 | 1 | 4.3 | — |
| b1-first-ride | beginner | 1% | 1/1 | 1 | 34.4 | — |
| b2-lean-back | beginner | 1% | 1/1 | 1 | 34.7 | — |
| b3-kicker-row | beginner | 1% | 1/1 | 2 | 32.9 | crash @ 56.8 m (ramp @ 58.0) |
| e1-uphill-weight | easy | 1% | 1/1 | 1 | 37.1 | — |
| e2-rear-wheel-first | easy | 1% | 1/1 | 1 | 38.2 | — |
| e3-stairway | easy | 1% | 1/1 | 1 | 34.5 | — |
| m1-hop-up | medium | 1% | 1/1 | 1 | 30.1 | — |
| m2-drum-roll | medium | 1% | 1/1 | 1 | 34.5 | — |
| m3-see-saw | medium | 1% | 1/1 | 2 | 37.1 | crash @ 204.1 m (ramp @ 204.6) |
| h1-wheelie-wire | hard | 1% | 1/1 | 1 | 39.0 | — |
| h2-gap-chain | hard | 1% | 0/1 | 41 | — | crash @ 541.8 m (box @ 542.1) |
| h3-fire-line | hard | 1% | 1/1 | 1 | 36.0 | — |
| x1-vertical-limit | extreme | 1% | 1/1 | 1 | 48.1 | — |
| x2-pipe-dream | extreme | 1% | 0/1 | 50 | — | crash @ 447.2 m |
| x3-gauntlet | extreme | 1% | 1/1 | 3 | 46.1 | crash @ 62.0 m (box @ 68.2) |
| lab-physics-test | medium | 1% | 1/1 | 1 | 6.4 | — |
| lab-flat-200 | beginner | 1% | 1/1 | 1 | 11.2 | — |

## Bot skill 3 clears (browser-verified)

| bike | track | attempts | outcome | finish | progress | node == browser | wall |
|---|---|---:|---|---:|---:|---|---:|
| rookie | b1-first-ride | 1 | finished | 33.933 | 100% | yes | 115 s |
| rookie | e1-uphill-weight | 1 | finished | 36.250 | 100% | yes | 97 s |
| rookie | m1-hop-up | 1 | finished | 29.050 | 100% | yes | 81 s |
| rookie | h1-wheelie-wire | 1 | finished | 38.575 | 100% | yes | 120 s |
| rookie | x1-vertical-limit | 50 | maxAttempts | — | 54% | — | 458 s |
| pro | b1-first-ride | 1 | finished | 27.325 | 100% | yes | 96 s |
| pro | e1-uphill-weight | 1 | finished | 29.492 | 100% | yes | 80 s |
| pro | m1-hop-up | 1 | finished | 23.608 | 100% | yes | 65 s |
| pro | h1-wheelie-wire | 2 | finished | 32.958 | 100% | yes | 97 s |
| pro | x1-vertical-limit | 1 | finished | 41.367 | 100% | yes | 111 s |

## Reflex bot `average`

| bike | track | band | attempts | median | clears | time to clear | where it died |
|---|---|---|---|---:|---|---:|---|
| rookie | b1-first-ride | 1–1 | 1, 1, 2 | 1 | 3/3 | 55.1 s | crash @ 574 m ×1 |
| rookie | b2-lean-back | 1–2 | 1, 2, 1 | 1 | 3/3 | 59.6 s | crash @ 586 m ×1 |
| rookie | b3-kicker-row | 1–2 | 2, 2, 1 | 2 | 3/3 | 56.0 s | crash @ 363 m ×1; crash @ 147 m ×1 |
| rookie | e1-uphill-weight | 2–4 | 3, 12, 1 | 3 | 3/3 | 66.9 s | ramp @ 310 m ×5; ramp @ 309 m ×4; ramp @ 308 m ×1 |
| rookie | e2-rear-wheel-first | 3–5 | 1, 4, 12 | 4 | 3/3 | 83.8 s | ramp @ 515 m ×3; ramp @ 66 m ×2; ramp @ 65 m ×2 |
| rookie | e3-stairway | 3–6 | 1, 2, 3 | 2 | 3/3 | 63.9 s | stair @ 61 m ×1; stair @ 60 m ×1; stair @ 67 m ×1 |
| pro | b1-first-ride | 1–1 | 1, 3, 1 | 1 | 3/3 | 51.7 s | crash @ 94 m ×1; crash @ 265 m ×1 |
| pro | b2-lean-back | 1–2 | 2, 5, 7 | 5 | 3/3 | 76.1 s | crash @ 435 m ×2; crash @ 286 m ×1; crash @ 375 m ×1 |
| pro | b3-kicker-row | 1–2 | 7, 6, 3 | 6 | 3/3 | 74.4 s | crash @ 336 m ×2; crash @ 350 m ×1; ramp @ 388 m ×1 |
| pro | e1-uphill-weight | 2–4 | 11, 33, 51 | 33 | 2/3 | 193.8 s | crash @ 78 m ×7; crash @ 82 m ×5; crash @ 313 m ×5 |
| pro | e2-rear-wheel-first | 3–5 | 12, 22, 24 | 22 | 3/3 | 168.5 s | ramp @ 175 m ×8; ramp @ 176 m ×5; ramp @ 178 m ×4 |
| pro | e3-stairway | 3–6 | 11, 10, 20 | 11 | 3/3 | 116.2 s | stair @ 404 m ×4; stair @ 401 m ×3; crash @ 428 m ×2 |

## Camera box — b3-kicker-row

no camera line
clip: /private/tmp/claude-501/-Users-raynos-projects-game-demos-trials-gauntlet-demo/f8d5e168-4022-47f3-b796-362acd49ca35/scratchpad/harness6/tree/harness/out/physics-suite/clip-b3-kicker-row/clip.mp4

## Stranger smoke — session physics-suite-20260914T192455Z: PASS

| call | ok | ms | summary |
|---|---|---:|---|
| start | yes | 143 | x=0.57 runTime=0 cleared=false finishTime=null |
| look | yes | 128 | x=0.57 runTime=0 cleared=false finishTime=null |
| play g8 gb4 c2 | yes | 145 | runTime=2.533 faulted={"reason":"crash","at":12.06,"respawnedAt":0.57,"respawnAfterS":1} |
| play gb40 (crash → auto-respawn) | yes | 144 | runTime=6.025 faulted={"reason":"crash","at":28.76,"respawnedAt":0.57,"respawnAfterS":1} |
| restart | yes | 129 | runTime=6.042 |
| play g16 | yes | 137 | runTime=8.042 |
| reset | yes | 134 | runTime=8.65 |
| status | yes | 129 | x=0.57 runTime=8.65 cleared=false finishTime=null |
