# ROCKHOP difficulty curve (store release bar 4)

Reflex bot (harness/reflex, the primary attempts-to-clear instrument), Rookie, 45 seeds per track and skill (the track's own seed + 0..44), attempts cap 50, sim cap 600 s (extreme 1800 s), on a clean `git archive HEAD` export plus the tracks owner's files (src fingerprint 2fbcfa8e; taken before 52f65bfa, whose src/physics differs only by one comment line), never the shared working tree's uncommitted physics. Physics: bikePhysicsFactory-v2. Every run's recording replays in a fresh sim to its play hash (replayFaithful: all).

Bar 4 reading, skill `average`: mean attempts strictly rising C1 -> S3 **yes**, median non-decreasing **yes**; every track cleared on every `average` seed **yes**.

| track | avg median | avg mean | avg clears | novice median / mean (clears) | good median / mean | avg time to clear (s) | skill-3 golden | top death sites (avg) |
|---|---:|---:|---|---|---|---:|---|---|
| c1-low-tide | 1 | 1.09 | 45/45 | 1 / 1.18 (45/45) | 1 / 1.00 | 42.9 | 30.117 s, 1 att | ground@110:air-short x2; ground@105:air-gas-nose-up x1; ground@380:nose-low x1 |
| c2-crane-hop | 1 | 1.16 | 45/45 | 1 / 1.40 (45/45) | 1 / 1.13 | 38.1 | 25.258 s, 1 att | ramp@313:climbing x1; ramp@313:cruise x1 |
| c3-hull-breach | 2 | 1.58 | 45/45 | 2 / 2.18 (45/45) | 1 / 1.11 | 49.5 | 30.800 s, 1 att | ramp@362:climbing x6; ramp@362:air-gas-nose-up x5 |
| a1-sawdust | 2 | 1.73 | 45/45 | 2 / 2.24 (45/45) | 1 / 1.53 | 45.3 | 26.483 s, 1 att | ramp@320:air-gas-nose-up x3; ramp@146:air-gas-nose-up x3 |
| a2-log-jam | 2 | 2.44 | 45/45 | 2 / 2.84 (45/45) | 2 / 2.04 | 50.6 | 31.467 s, 1 att | ground@50:air-short x11; ground@330:nose-low x7 |
| a3-timberline | 2 | 2.82 | 45/45 | 3 / 3.64 (45/45) | 3 / 3.33 | 45.8 | 22.575 s, 1 att | ledge@31:stuck-restart x12; ledge@261:air-short x8 |
| d1-dust-devil | 3 | 3.82 | 45/45 | 4 / 4.29 (45/45) | 2 / 2.96 | 53.9 | 25.808 s, 1 att | ledge@266:stuck-restart x19; ledge@31:stuck-restart x10 |
| d2-conveyor | 4 | 4.22 | 45/45 | 5 / 5.24 (45/45) | 4 / 4.49 | 73.4 | 34.917 s, 1 att | ledge@238:stuck-restart x51; ledge@55:stuck-restart x38 |
| d3-rope-walk | 4 | 4.64 | 45/45 | 2 / 2.73 (45/45) | 5 / 5.16 | 64.8 | 33.392 s, 1 att | gap@200:air-short x36; gap@200:nose-low x18 |
| s1-lift-line | 5 | 5.80 | 45/45 | 7 / 7.20 (45/45) | 5 / 5.13 | 70.1 | 30.683 s, 1 att | pole@357:air-gas-nose-up x51; pole@170:air-gas-nose-up x18 |
| s2-cornice | 7 | 7.20 | 45/45 | 7 / 7.51 (45/45) | 7 / 8.18 | 89.7 | 34.875 s, 1 att | ramp@55:air-short x24; ledge@249:stuck-restart x22 |
| s3-whiteout | 9 | 9.69 | 45/45 | 8 / 15.27 (40/45) | 7 / 7.11 | 107.8 | 29.633 s, 1 att | gap@55:air-short x48; pole@339:air-gas-nose-up x44 |

**C1 re-measured after stranger round rockhop-r1** (src fingerprint 56482684, same physics, same seeds; every other row is unchanged). The stranger crashed Low Tide once, at full gas on the container steps (x 327.7): the pallet ramp's top floats a 17 m/s bike onto the end of the first container, the front wheel hits the bare 0.3 m face and the bike endoes into the next step. Each step is now a 4 m pallet wedge (4.3 deg); container 2 is 6 m, container 3 8 m. A fixed-policy battery through the causeway (approach at 6 / 8 / 10 / 12 / 14 m/s or full gas, then held gas, coasting, gas or coast with a lean back when the nose drops, a lean forward when it rises, both; plus a standing respawn at checkpoint 2) went from 22/36 + 4/6 clean to 36/36 + 6/6; held gas from the start line now finishes in 31.0 s with no fault. Reflex: the good bot's two container deaths are gone (1.04 -> 1.00), novice is unchanged (1.18), and average moves 1.07 -> 1.09 on one seed whose bot stood the bike on its front wheel down the gangway and fell at the rollers (x 380). The curve still rises strictly (C1 1.09 < C2 1.16).

**Beginner hints checked against the physics** (the same battery at every hinted feature; a wrong hint is worse than none). C1: all four hints hold (held gas and coasting both clear every section); "Roll the step on the containers" becomes "Stay on the gas up the containers". C2: "Gas up the pier, off at the lip" read as off the gas, and coasting off either pier lip at full speed crashes (x 74, x 139), so it becomes "Hold the gas off the pier lip"; "Lean forward to level" becomes "Lean back if the nose drops" (leaning back when the nose drops never crashed; leaning forward when it rises crashes pier 2 at 12 m/s and up); "Land on the ramp down" and "Full speed for the barge" hold. Playgrounds (also beginner tier): P-C's pier needs the same lean back at 18 m/s ("Gas up the pier, lean back if the nose drops"); P-S "Gas to the ramp, off at the lip" becomes "Hold the gas over the ice gap" (coasting off at 7 m/s lands short); P-A and P-D hints hold (leaning back up P-D's belt crashes at every speed, forward never does).

Zone playgrounds (free ride, beginner pace):

| playground | avg median | avg mean | avg clears | novice | good | avg time to clear (s) | skill-3 golden | top death sites |
|---|---:|---:|---|---|---|---:|---|---|
| p-coast | 1 | 1.16 | 45/45 | 1 / 1.62 (45/45) | 1 / 1.02 | 35.1 | 23.842 s, 1 att | ground@160:air-short x2; box@191:air-gas-nose-up x1 |
| p-alpine | 1 | 1.09 | 45/45 | 1 / 1.18 (45/45) | 1 / 1.04 | 34.1 | 23.367 s, 1 att | ground@40:air-short x2; ground@50:nose-low x1 |
| p-quarry | 1 | 1.04 | 45/45 | 1 / 1.22 (45/45) | 1 / 1.24 | 40.1 | 27.192 s, 1 att | ledge@282:nose-low x1; ground@350:nose-low x1 |
| p-snowline | 1 | 1.02 | 45/45 | 1 / 1.13 (45/45) | 1 / 1.09 | 31.9 | 21.367 s, 1 att | ground@170:touchdown x1 |

Goldens: `harness/inputs/<id>/bot-3.json` (skill-3 search bot, 1 attempt each), each proven by `harness:determinism --loads 2 --tail-s 3` on a build of the same tree: D1 cross-load, D2 json/bin, D3 node == browser, D4/D4b/D4c snapshots, D5 chunking, D7 no state leak, D8 pin — 9/9 on every track.
