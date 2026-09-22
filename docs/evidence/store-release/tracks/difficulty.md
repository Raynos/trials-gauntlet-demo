# ROCKHOP difficulty curve (store release bar 4)

Reflex bot (harness/reflex, the primary attempts-to-clear instrument), Rookie, 45 seeds per track and skill (the track's own seed + 0..44), attempts cap 50, sim cap 600 s (extreme 1800 s), on a clean `git archive HEAD` export plus the tracks owner's files (src fingerprint 2fbcfa8e; taken before 52f65bfa, whose src/physics differs only by one comment line), never the shared working tree's uncommitted physics. Physics: bikePhysicsFactory-v2. Every run's recording replays in a fresh sim to its play hash (replayFaithful: all).

Bar 4 reading, skill `average`: mean attempts strictly rising C1 -> S3 **yes**, median non-decreasing **yes**; every track cleared on every `average` seed **yes**.

| track | avg median | avg mean | avg clears | novice median / mean (clears) | good median / mean | avg time to clear (s) | skill-3 golden | top death sites (avg) |
|---|---:|---:|---|---|---|---:|---|---|
| c1-low-tide | 1 | 1.07 | 45/45 | 1 / 1.18 (45/45) | 1 / 1.04 | 43.1 | 30.008 s, 1 att | ground@110:air-short x2; ground@105:air-gas-nose-up x1 |
| c2-crane-hop | 1 | 1.16 | 45/45 | 1 / 1.40 (45/45) | 1 / 1.13 | 38.1 | 25.258 s, 1 att | ramp@313:climbing x1; ramp@313:cruise x1 |
| c3-hull-breach | 2 | 1.58 | 45/45 | 2 / 2.18 (45/45) | 1 / 1.11 | 49.5 | 30.800 s, 1 att | ramp@362:climbing x6; ramp@362:air-gas-nose-up x5 |

Goldens: `harness/inputs/<id>/bot-3.json` (skill-3 search bot, 1 attempt each), each proven by `harness:determinism --loads 2 --tail-s 3` on a build of the same tree: D1 cross-load, D2 json/bin, D3 node == browser, D4/D4b/D4c snapshots, D5 chunking, D7 no state leak, D8 pin — 9/9 on every track.
