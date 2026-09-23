# ROCKHOP difficulty curve (store release bar 4)

**Re-proof on the riding-poses physics (a736a26f, "Pose seat support prevents under-saddle traps").** That commit changed
`src/physics/v2/bike.ts` and `src/core/riderGeometry.ts`; every ROCKHOP course had been authored and proven on the
physics before it (e5c1ce1a), and on a736a26f all sixteen skill-3 goldens stopped finishing in a node replay (1-10
faults each). Everything below is re-measured on a clean `git archive` export of 8b66b1cb plus this round's
files (goldens' src fingerprint 2249b7bb, 1d1e72eb). The physics was not touched.

Reflex bot (harness/reflex, the primary attempts-to-clear instrument), Rookie, 45 seeds per track and skill (the
track's own seed + 0..44), attempts cap 50, sim cap 600 s (extreme 1800 s). Every run's recording replays in a fresh
sim to its play hash (replayFaithful: all).

Bar 4 reading, skill `average`: mean attempts strictly rising C1 -> S3 **yes**, median
non-decreasing **yes**; every course cleared on every `average` seed **yes**.

On a736a26f with the old geometry three things broke (average, 45 seeds): Timberline's mean rose 2.82 -> 3.84, above
Dust Devil's 3.82 (the 0.4 m hop onto the log load flipped a ~4 m/s bike over its front wheel at x 261,
its top death site); Rope Walk's median fell 4 -> 3, under Conveyor's 4 (23 of 45 seeds at <= 3); and one Whiteout seed of 45 hit the
50-attempt cap at the summit towers (44/45 clears). Three minimal geometry changes, each keeping the course's idea and
set piece: A3's log load 0.4 -> 0.38 m (its landing lip 2 cm taller, so the deck stays at 1.6 m) -> mean 3.51; D3's
slot row after the first cut 6 -> 7 missing boards -> median 4, mean 4.73; S3's four summit tower caps 2.6 -> 2.55 m
(0.35 m over the shelf) -> 45/45, mean 9.56, worst seed 30 attempts. Nothing else moved; originality after the
change: A3 0.409, D3 0.458, S3 0.423 (< 0.6).

| track | before (e5c1ce1a) avg median / mean | avg median | avg mean | avg clears | novice median / mean (clears) | good median / mean | avg time to clear (s) | skill-3 golden | geometry change | top death sites (avg) |
|---|---|---:|---:|---|---|---|---:|---|---|---|
| c1-low-tide | 1 / 1.09 | 1 | 1.09 | 45/45 | 1 / 1.33 (45/45) | 1 / 1.07 | 43.1 | 29.717 s | - | ground@395:air-short x1; ground@395:nose-low x1 |
| c2-crane-hop | 1 / 1.16 | 1 | 1.20 | 45/45 | 2 / 1.87 (45/45) | 1 / 1.09 | 38.1 | 25.050 s | - | box@319:air-short x2; box@217:air-short x2 |
| c3-hull-breach | 2 / 1.58 | 1 | 1.53 | 45/45 | 2 / 2.02 (45/45) | 1 / 1.22 | 47.0 | 30.808 s | - | ramp@362:air-gas-nose-up x5; ramp@362:climbing x4 |
| a1-sawdust | 2 / 1.73 | 2 | 2.16 | 45/45 | 3 / 3.16 (45/45) | 1 / 1.87 | 47.3 | 26.533 s | - | ground@190:air-short x4; ground@190:nose-low x4 |
| a2-log-jam | 2 / 2.44 | 3 | 2.91 | 45/45 | 3 / 3.44 (45/45) | 1 / 1.80 | 55.3 | 29.983 s | - | ground@50:air-short x11; ground@330:air-short x9 |
| a3-timberline | 2 / 2.82 | 3 | 3.51 | 45/45 | 6 / 6.91 (45/45) | 3 / 3.13 | 49.0 | 23.750 s | log load 0.4 -> 0.38 m | ledge@261:nose-low x13; ledge@181:stuck-restart x10 |
| d1-dust-devil | 3 / 3.82 | 3 | 3.82 | 45/45 | 8 / 8.67 (45/45) | 4 / 4.13 | 57.1 | 25.950 s | - | ledge@189:air-gas-nose-up x9; ledge@91:air-gas-nose-up x8 |
| d2-conveyor | 4 / 4.22 | 4 | 4.18 | 45/45 | 5 / 5.62 (45/45) | 4 / 4.04 | 78.0 | 33.842 s | - | ledge@55:stuck-restart x39; ledge@238:stuck-restart x38 |
| d3-rope-walk | 4 / 4.64 | 4 | 4.73 | 45/45 | 4 / 3.91 (45/45) | 5 / 5.31 | 68.5 | 33.558 s | first slot row 6 -> 7 missing boards | gap@200:air-short x25; gap@200:nose-low x12 |
| s1-lift-line | 5 / 5.80 | 4 | 5.31 | 45/45 | 7 / 7.02 (45/45) | 5 / 5.62 | 66.2 | 30.500 s | - | pole@357:air-gas-nose-up x59; pole@357:air-short x12 |
| s2-cornice | 7 / 7.20 | 6 | 6.27 | 45/45 | 7 / 8.04 (45/45) | 8 / 8.58 | 80.6 | 35.542 s | - | pole@384:air-gas-nose-up x27; ramp@55:air-short x20 |
| s3-whiteout | 9 / 9.69 | 7 | 9.56 | 45/45 | 12 / 17.98 (40/45) | 7 / 8.20 | 87.4 | 29.408 s | summit tower caps 2.6 -> 2.55 m | gap@55:air-short x35; pole@339:air-gas-nose-up x34 |

Zone playgrounds (free ride, beginner pace; P-C and P-D geometry and goldens are the playground plain-gas fix,
129ed9c0, measured here on the same physics). **P-A and P-S under the same rule** (free ride never punishes plain
gas): on a736a26f held full gas from the start line crashed each once, both at the see-saw. P-A's log pivoted 1.2 m up
(a 17 deg board); held gas meets it at 16.2 m/s, its rising end throws the bike ~3 m up for 1.2 s while the gas
rotates the nose up to 62 deg, and it loops out on the flat (x 172.7). P-S's board is the same see-saw at 18.8 m/s:
1.4 s in the air, a rear-first landing at 44 deg, then an endo in the bump row (x 202.2). Both boards now pivot 0.8 m
up (11 deg), which throws nobody: held gas finishes P-A in 24.1 s and P-S in 22.3 s with no fault. Riding-style grid
through each see-saw and what follows (approach at 6 / 8 / 10 / 12 / 14 m/s or full gas x held gas / coast / lean
back when the nose drops / lean forward when it rises / both, plus a respawn row), before -> after: P-A 42/48 ->
48/48 (+ respawn 8/8; before, held gas crashed from 14 m/s up); P-S 49/56 -> 56/56.

| playground | before avg median / mean | avg median | avg mean | avg clears | novice | good | avg time to clear (s) | skill-3 golden | geometry change | top death sites |
|---|---|---:|---:|---|---|---|---:|---|---|---|
| p-coast | 1 / 1.16 | 1 | 1.27 | 45/45 | 1 / 1.44 (45/45) | 1 / 1.13 | 36.0 | 24.492 s | 129ed9c0 plain-gas fix | drum@160:nose-low x2; ground@165:air-short x2 |
| p-alpine | 1 / 1.09 | 1 | 1.09 | 45/45 | 1 / 1.24 (45/45) | 1 / 1.11 | 34.0 | 22.617 s | teetering log pivot 1.2 -> 0.8 m (17 -> 11 deg) | ground@40:nose-low x2; ground@295:air-gas-nose-up x1 |
| p-quarry | 1 / 1.04 | 1 | 1.09 | 45/45 | 1 / 1.64 (45/45) | 1 / 1.07 | 40.1 | 27.392 s | 129ed9c0 plain-gas fix | ground@340:air-short x1; ground@75:touchdown x1 |
| p-snowline | 1 / 1.02 | 1 | 1.18 | 45/45 | 1 / 1.20 (45/45) | 1 / 1.07 | 31.7 | 21.383 s | lift-line board pivot 1.2 -> 0.8 m (17 -> 11 deg) | box@88:air-short x6; ramp@94:air-short x1 |

Goldens: `harness/inputs/<id>/bot-3.json` (skill-3 search bot, 1 attempt, 0 faults each), re-recorded on a736a26f
(P-C / P-D by 129ed9c0), each proven by `harness:determinism --loads 2 --tail-s 3` on a dist built from the same
tree (D1 cross-load, D2 json/bin, D3 node == browser, D4/D4b/D4c snapshots, D5 chunking, D7 no state leak, D8 pin).
`src/tracks/rockhop/goldens.test.ts` now replays every one of them in node in CI and fails if any stops finishing
clean, the gap that let a736a26f ship without a red test.

Medal targets (gold = skill-3 golden x 1.6, rounded up to 5 s, non-decreasing C1 -> S3; OBSIDIAN 0.85 x, silver
1.25 x), recomputed from the new goldens: C1-C3 50 / 50 / 50, A1-A3 50 / 50 / 50 (A2, A3 were 55), D1-D3 50 / 55 / 55
(were 55 / 60 / 60), S1-S3 55 / 60 / 60 (S1 was 60).

## History

The first two paragraphs were measured on the physics before a736a26f (e5c1ce1a); the P-C / P-D fix on a736a26f.

**C1 re-measured after stranger round rockhop-r1** (src fingerprint 56482684, same physics, same seeds; every other row is unchanged). The stranger crashed Low Tide once, at full gas on the container steps (x 327.7): the pallet ramp's top floats a 17 m/s bike onto the end of the first container, the front wheel hits the bare 0.3 m face and the bike endoes into the next step. Each step is now a 4 m pallet wedge (4.3 deg); container 2 is 6 m, container 3 8 m. A fixed-policy battery through the causeway (approach at 6 / 8 / 10 / 12 / 14 m/s or full gas, then held gas, coasting, gas or coast with a lean back when the nose drops, a lean forward when it rises, both; plus a standing respawn at checkpoint 2) went from 22/36 + 4/6 clean to 36/36 + 6/6; held gas from the start line now finishes in 31.0 s with no fault. Reflex: the good bot's two container deaths are gone (1.04 -> 1.00), novice is unchanged (1.18), and average moves 1.07 -> 1.09 on one seed whose bot stood the bike on its front wheel down the gangway and fell at the rollers (x 380). The curve still rises strictly (C1 1.09 < C2 1.16).

**Beginner hints checked against the physics** (the same battery at every hinted feature; a wrong hint is worse than none). C1: all four hints hold (held gas and coasting both clear every section); "Roll the step on the containers" becomes "Stay on the gas up the containers". C2: "Gas up the pier, off at the lip" read as off the gas, and coasting off either pier lip at full speed crashes (x 74, x 139), so it becomes "Hold the gas off the pier lip"; "Lean forward to level" becomes "Lean back if the nose drops" (leaning back when the nose drops never crashed; leaning forward when it rises crashes pier 2 at 12 m/s and up); "Land on the ramp down" and "Full speed for the barge" hold. Playgrounds (also beginner tier): P-C's pier needs the same lean back at 18 m/s ("Gas up the pier, lean back if the nose drops"); P-S "Gas to the ramp, off at the lip" becomes "Hold the gas over the ice gap" (coasting off at 7 m/s lands short); P-A and P-D hints hold (leaning back up P-D's belt crashes at every speed, forward never does).

**P-C and P-D re-measured after the playground plain-gas fix** (on a736a26f's physics, the seat-support commit; src fingerprint 1d1e72eb; every other row predates that physics and is being re-measured by the re-proof owner). Free ride must never punish plain gas, and before this fix (0d46e860) held full gas from the start line crashed Harbour Yard at the pier (x 139), the pallet kerb (x 229) and then the container step on every respawn (x 288, never finishing), and Quarry Floor at the second terrace (x 284.5). Fixes: every step up is a 4 m wedge (4.3 deg) as on C1's causeway, i.e. P-C's pallet kerb, the step between its two containers, and both of P-D's 0.3 m terraces (cut-stone wedges; the stepped benches stay); P-C's pier is a 12 m ramp onto a 10 m pier (was 10 m onto 6 m, which an 18 m/s bike floated end to end and landed on the kicker's foot), its kicker 3 x 0.3 (was 3 x 0.5) and the gangway runs straight down from the lip, 18 x 1.3 (was 14 x 1.0 from 0.5 m below it). Held gas now finishes P-C in 24.3 s and P-D in 29.5 s with no fault.

Riding-style grid (the C1 battery: approach at 6 / 8 / 10 / 12 / 14 m/s or full gas, then held gas, coasting, gas or coast with a lean back when the nose drops in the air, a lean forward when it rises, both; plus a standing respawn at the checkpoint before; a crash or a stall on a bare face is a fail), before -> fix: P-C pier 52/56 -> 56/56, pallet kerb 44/48 -> 48/48, container stack 36/48 (+ respawn row 3/8) -> 48/48 (+ 8/8), the tyre line after the new pier 48/48; P-D terraces 26/48 (every style crashed at 14 m/s and full gas; coasting stalled on the faces at 6-8 m/s) -> 48/48, respawn row 8/8 both. One cell stays red on both sides and is the gap, not a step: coasting into P-C's 2.5 m pontoon gap at 6 m/s lands in it.

Reflex, 45 seeds, old geometry -> fix on the same physics: P-C average 1.31 -> 1.27, novice 1.69 -> 1.44, good 1.07 -> 1.13 (the pier, kerb and container deaths are gone; what remains is the bot braking and leaning forward in the air off the sunk tyres, x 160-170, and the pontoon-gap landing); P-D average 1.27 -> 1.09, novice 1.76 -> 1.64, good 1.20 -> 1.07 (every terrace death gone). Skill-3 goldens P-C 24.492 s, P-D 27.392 s, determinism 9/9 each.
