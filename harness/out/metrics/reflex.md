# Reflex bot — skill novice / average / good, 3 seed(s), bikes rookie + pro, src 74f5de4d, 2026-09-15T00:27:37.388Z, wall 42 s

attempts = 1 + faults (all reasons); cap 50; sim cap 300 s. Rookie = `<track>.reflex.json`, Pro = `<track>.pro.reflex.json`; the band is authored for the tier's default bike (average). Death sites: nearest placed obstacle (name @ x) with the rule the rider was executing.

## Rookie bike — skill novice, 3 seed(s), physics bikePhysicsFactory-v2, src 74f5de4d, 2026-09-15T00:27:37.388Z, wall 7 s

Reaction 230–280 ms, glances 20 Hz, pitch noise ±3°, speed noise ±7%, taps 100 ms, lapses every ~6 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 1, 1, 1 | 1 | 3/3 | 13.4 s | 100% | — |
| gap-test | beginner | 1–3 | 1, 1, 1 | 1 | 3/3 | 7.6 s | 100% | — |
| b1-first-ride | beginner | 1–1 | 1, 2, 2 | 2 | 3/3 | 69.5 s | 100% | ground @ 90 m ×1 (air-gas-nose-up); ground @ 575 m ×1 (nose-low) |
| b2-lean-back | beginner | 1–2 | 12, 3, 2 | 3 | 3/3 | 77.3 s | 100% | ground @ 360 m ×3 (air-gas-nose-up); ground @ 35 m ×2 (air-brake-nose-down); drum @ 27.0 m ×1 (air-gas-nose-up) |
| b3-kicker-row | beginner | 1–2 | 10, 9, 4 | 9 | 3/3 | 115.2 s | 100% | ramp @ 423.8 m ×7 (air-brake-nose-down); box @ 415.8 m ×3 (air-brake-nose-down); ground @ 80 m ×2 (air-gas-nose-up) |
| e1-uphill-weight | easy | 2–4 | 13, 18, 24 | 18 | 2/3 | 251.2 s | 100% | ground @ 155 m ×5 (nose-low); ramp @ 75.2 m ×4 (nose-low); ground @ 170 m ×4 (nose-low) |
| e2-rear-wheel-first | easy | 3–5 | 26, 13, 36 | 26 | 1/3 | 174.8 s | 100% | ramp @ 506.4 m ×13 (air-brake-nose-down); ramp @ 191.2 m ×9 (air-brake-nose-down); box @ 183.2 m ×7 (air-brake-nose-down) |
| e3-stairway | easy | 3–6 | 19, 32, 18 | 19 | 2/3 | 220.5 s | 100% | box @ 411.6 m ×29 (stuck-restart); stair @ 406.8 m ×14 (stuck-restart); gap @ 425.6 m ×8 (air-brake-nose-down) |
| m1-hop-up | medium | 5–9 | 43, 46, 51 | 46 | 0/3 | — | 65% | ledge @ 119.0 m ×53 (nose-low); ledge @ 280.3 m ×48 (nose-low); ledge @ 285.3 m ×17 (nose-low) |
| m2-drum-roll | medium | 6–12 | 20, 25, 31 | 25 | 3/3 | 224.9 s | 100% | ramp @ 431.4 m ×11 (air-brake-nose-down); ramp @ 422.4 m ×8 (air-gas-nose-up); ramp @ 311.2 m ×7 (air-gas-nose-up) |
| m3-see-saw | medium | 8–12 | 35, 5, 34 | 34 | 1/3 | 93.9 s | 100% | ground @ 410 m ×8 (air-brake-nose-down); ramp @ 45.8 m ×6 (nose-low); ramp @ 202.6 m ×5 (air-brake-nose-down) |
| h1-wheelie-wire | hard | 10–18 | 45, 46, 37 | 45 | 0/3 | — | 92% | wall @ 175.8 m ×44 (nose-low); ramp @ 172.8 m ×22 (air-brake-nose-down); gap @ 184.8 m ×17 (air-brake-nose-down) |
| h2-gap-chain | hard | 14–22 | 44, 42, 35 | 42 | 0/3 | — | 69% | ramp @ 62.0 m ×42 (air-gas-nose-up); ramp @ 73.0 m ×15 (air-gas-nose-up); box @ 65.0 m ×13 (air-brake-nose-down) |
| h3-fire-line | hard | 18–25 | 31, 34, 35 | 34 | 0/3 | — | 90% | ledge @ 389.6 m ×22 (nose-low); gap @ 489.2 m ×8 (touchdown); ledge @ 252.8 m ×7 (air-gas-nose-up) |
| x1-vertical-limit | extreme | 30–45 | 30, 31, 27 | 30 | 0/3 | — | 64% | ramp @ 227.9 m ×25 (stuck-restart); plank @ 393.0 m ×19 (air-brake-nose-down); ramp @ 390.6 m ×14 (nose-high) |
| x2-pipe-dream | extreme | 40–60 | 38, 42, 40 | 40 | 0/3 | — | 72% | drum @ 370.0 m ×30 (air-gas-nose-up); drum @ 366.7 m ×21 (air-gas-nose-up); ramp @ 74.6 m ×12 (air-gas-nose-up) |
| x3-gauntlet | extreme | 60–80 | 23, 27, 23 | 23 | 0/3 | — | 32% | ramp @ 60.2 m ×11 (air-brake-nose-down); stair @ 138.2 m ×8 (nose-high); gap @ 157.0 m ×7 (air-brake-nose-down) |
| lab-physics-test | medium | 3–8 | 3, 1, 2 | 2 | 3/3 | 13.3 s | 100% | ground @ 70 m ×2 (air-gas-nose-up); ground @ 65 m ×1 (air-gas-nose-up) |
| lab-flat-200 | beginner | 1–1 | 1, 1, 1 | 1 | 3/3 | 21.2 s | 100% | — |

## Rookie bike — skill average, 3 seed(s), physics bikePhysicsFactory-v2, src 74f5de4d, 2026-09-15T00:27:44.605Z, wall 6 s

Reaction 180–220 ms, glances 25 Hz, pitch noise ±2°, speed noise ±5%, taps 80 ms, lapses every ~10 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 1, 1, 1 | 1 | 3/3 | 11.3 s | 100% | — |
| gap-test | beginner | 1–3 | 1, 1, 1 | 1 | 3/3 | 7.6 s | 100% | — |
| b1-first-ride | beginner | 1–1 | 1, 1, 1 | 1 | 3/3 | 56.7 s | 100% | — |
| b2-lean-back | beginner | 1–2 | 2, 1, 1 | 1 | 3/3 | 57.7 s | 100% | ground @ 575 m ×1 (air-gas-nose-up) |
| b3-kicker-row | beginner | 1–2 | 7, 12, 3 | 7 | 3/3 | 86.7 s | 100% | ground @ 170 m ×4 (air-brake-nose-down); ramp @ 334.8 m ×3 (nose-high); ground @ 235 m ×2 (nose-high) |
| e1-uphill-weight | easy | 2–4 | 4, 7, 8 | 7 | 3/3 | 109.5 s | 100% | ramp @ 445.9 m ×5 (air-brake-nose-down); ground @ 155 m ×3 (air-gas-nose-up); ground @ 215 m ×2 (air-brake-nose-down) |
| e2-rear-wheel-first | easy | 3–5 | 10, 10, 36 | 10 | 2/3 | 141.5 s | 100% | ramp @ 506.4 m ×20 (air-brake-nose-down); ramp @ 514.9 m ×10 (air-gas-nose-up); box @ 498.4 m ×4 (air-gas-nose-up) |
| e3-stairway | easy | 3–6 | 26, 35, 36 | 35 | 1/3 | 254.3 s | 100% | box @ 411.6 m ×34 (stuck-restart); stair @ 406.8 m ×19 (air-brake-nose-down); ground @ 180 m ×12 (air-gas-nose-up) |
| m1-hop-up | medium | 5–9 | 22, 49, 51 | 49 | 1/3 | 177.0 s | 100% | ledge @ 119.0 m ×53 (air-brake-nose-down); ledge @ 280.3 m ×37 (nose-low); ledge @ 285.3 m ×15 (air-brake-nose-down) |
| m2-drum-roll | medium | 6–12 | 6, 8, 7 | 7 | 3/3 | 102.3 s | 100% | drum @ 53.2 m ×3 (air-gas-nose-up); ramp @ 431.4 m ×3 (launch); drum @ 58.8 m ×2 (nose-low) |
| m3-see-saw | medium | 8–12 | 35, 9, 10 | 10 | 2/3 | 117.6 s | 100% | ground @ 410 m ×12 (air-brake-nose-down); ramp @ 211.6 m ×5 (nose-high); ground @ 195 m ×4 (touchdown) |
| h1-wheelie-wire | hard | 10–18 | 50, 51, 38 | 50 | 0/3 | — | 92% | wall @ 175.8 m ×65 (nose-low); ramp @ 172.8 m ×20 (air-brake-nose-down); gap @ 184.8 m ×10 (air-gas-nose-up) |
| h2-gap-chain | hard | 14–22 | 43, 43, 44 | 43 | 0/3 | — | 45% | ramp @ 62.0 m ×32 (air-gas-nose-up); ramp @ 265.8 m ×21 (air-gas-nose-up); ramp @ 73.0 m ×16 (air-gas-nose-up) |
| h3-fire-line | hard | 18–25 | 31, 31, 33 | 31 | 0/3 | — | 92% | gap @ 489.2 m ×24 (air-gas-nose-up); ledge @ 494.2 m ×21 (air-gas-nose-up); ledge @ 389.6 m ×12 (air-gas-nose-up) |
| x1-vertical-limit | extreme | 30–45 | 31, 32, 32 | 32 | 0/3 | — | 72% | ramp @ 227.9 m ×22 (stuck-restart); plank @ 230.3 m ×22 (air-gas-nose-up); plank @ 393.0 m ×17 (air-brake-nose-down) |
| x2-pipe-dream | extreme | 40–60 | 38, 35, 46 | 38 | 0/3 | — | 72% | drum @ 370.0 m ×44 (air-gas-nose-up); gap @ 368.5 m ×12 (cruise); box @ 227.8 m ×9 (stuck-restart) |
| x3-gauntlet | extreme | 60–80 | 35, 30, 31 | 31 | 0/3 | — | 32% | ramp @ 60.2 m ×47 (air-brake-nose-down); box @ 72.2 m ×10 (air-brake-nose-down); ground @ 95 m ×9 (air-gas-nose-up) |
| lab-physics-test | medium | 3–8 | 1, 1, 1 | 1 | 3/3 | 9.8 s | 100% | — |
| lab-flat-200 | beginner | 1–1 | 1, 1, 1 | 1 | 3/3 | 18.1 s | 100% | — |

## Rookie bike — skill good, 3 seed(s), physics bikePhysicsFactory-v2, src 74f5de4d, 2026-09-15T00:27:50.697Z, wall 5 s

Reaction 150–170 ms, glances 30 Hz, pitch noise ±1.5°, speed noise ±4%, taps 70 ms, lapses every ~20 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 1, 1, 1 | 1 | 3/3 | 10.2 s | 100% | — |
| gap-test | beginner | 1–3 | 1, 2, 1 | 1 | 3/3 | 6.6 s | 100% | ground @ 40 m ×1 (air-brake-nose-down) |
| b1-first-ride | beginner | 1–1 | 1, 1, 1 | 1 | 3/3 | 50.8 s | 100% | — |
| b2-lean-back | beginner | 1–2 | 1, 2, 1 | 1 | 3/3 | 51.8 s | 100% | ground @ 370 m ×1 (air-gas-nose-up) |
| b3-kicker-row | beginner | 1–2 | 4, 3, 7 | 4 | 3/3 | 69.3 s | 100% | ground @ 325 m ×3 (air-brake-nose-down); ground @ 240 m ×2 (nose-high); ground @ 50 m ×1 (nose-high) |
| e1-uphill-weight | easy | 2–4 | 13, 8, 5 | 8 | 3/3 | 102.1 s | 100% | ramp @ 445.9 m ×7 (air-brake-nose-down); ground @ 450 m ×6 (air-brake-nose-down); ground @ 455 m ×4 (air-brake-nose-down) |
| e2-rear-wheel-first | easy | 3–5 | 6, 7, 15 | 7 | 3/3 | 111.1 s | 100% | ramp @ 191.2 m ×6 (air-brake-nose-down); ramp @ 506.4 m ×5 (air-brake-nose-down); ramp @ 514.9 m ×3 (air-brake-nose-down) |
| e3-stairway | easy | 3–6 | 16, 8, 14 | 14 | 3/3 | 143.6 s | 100% | box @ 411.6 m ×7 (stuck-restart); barrel @ 177.1 m ×5 (air-brake-nose-down); box @ 266.0 m ×4 (nose-high) |
| m1-hop-up | medium | 5–9 | 42, 2, 17 | 17 | 2/3 | 108.2 s | 100% | ledge @ 285.3 m ×21 (nose-low); ledge @ 280.3 m ×19 (air-gas-nose-up); ramp @ 27.0 m ×4 (nose-high) |
| m2-drum-roll | medium | 6–12 | 8, 7, 5 | 7 | 3/3 | 91.7 s | 100% | drum @ 53.2 m ×2 (nose-low); ramp @ 188.2 m ×2 (touchdown); ground @ 190 m ×2 (touchdown) |
| m3-see-saw | medium | 8–12 | 14, 5, 11 | 11 | 3/3 | 145.3 s | 100% | ground @ 410 m ×4 (air-brake-nose-down); box @ 438.9 m ×3 (nose-low); ground @ 190 m ×2 (touchdown) |
| h1-wheelie-wire | hard | 10–18 | 45, 50, 51 | 50 | 0/3 | — | 91% | wall @ 175.8 m ×68 (air-gas-nose-up); wall @ 531.2 m ×22 (nose-low); ramp @ 172.8 m ×17 (air-brake-nose-down) |
| h2-gap-chain | hard | 14–22 | 42, 42, 43 | 42 | 0/3 | — | 71% | ramp @ 265.8 m ×25 (air-gas-nose-up); ramp @ 437.6 m ×19 (air-gas-nose-up); ramp @ 73.0 m ×16 (air-gas-nose-up) |
| h3-fire-line | hard | 18–25 | 33, 8, 15 | 15 | 2/3 | 147.2 s | 100% | gap @ 489.2 m ×21 (air-gas-nose-up); ledge @ 494.2 m ×12 (nose-low); ledge @ 252.8 m ×4 (nose-low) |
| x1-vertical-limit | extreme | 30–45 | 31, 33, 32 | 32 | 0/3 | — | 72% | ramp @ 227.9 m ×25 (launch); plank @ 393.0 m ×14 (air-brake-nose-down); plank @ 230.3 m ×13 (stuck-restart) |
| x2-pipe-dream | extreme | 40–60 | 43, 33, 30 | 33 | 0/3 | — | 86% | drum @ 370.0 m ×21 (air-brake-nose-down); box @ 230.8 m ×11 (air-brake-nose-down); drum @ 373.3 m ×9 (air-brake-nose-down) |
| x3-gauntlet | extreme | 60–80 | 31, 38, 29 | 31 | 0/3 | — | 28% | ramp @ 60.2 m ×35 (air-brake-nose-down); ground @ 95 m ×13 (air-gas-nose-up); ground @ 90 m ×8 (air-brake-nose-down) |
| lab-physics-test | medium | 3–8 | 1, 1, 1 | 1 | 3/3 | 9.1 s | 100% | — |
| lab-flat-200 | beginner | 1–1 | 1, 1, 1 | 1 | 3/3 | 15.9 s | 100% | — |

## Pro bike — skill novice, 3 seed(s), physics bikePhysicsFactory-v2, src 74f5de4d, 2026-09-15T00:27:55.959Z, wall 8 s

Reaction 230–280 ms, glances 20 Hz, pitch noise ±3°, speed noise ±7%, taps 100 ms, lapses every ~6 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 1, 4, 2 | 2 | 3/3 | 17.9 s | 100% | ground @ 10 m ×2 (air-brake-nose-down); ground @ 5 m ×1 (air-brake-nose-down); ground @ 25 m ×1 (air-gas-nose-up) |
| gap-test | beginner | 1–3 | 3, 25, 3 | 3 | 3/3 | 15.1 s | 100% | ramp @ 30.0 m ×6 (air-brake-nose-down); gap @ 34.0 m ×5 (nose-high); ground @ 40 m ×5 (air-gas-nose-up) |
| b1-first-ride | beginner | 1–1 | 1, 1, 9 | 1 | 3/3 | 64.6 s | 100% | ground @ 85 m ×3 (nose-high); ground @ 80 m ×1 (air-gas-nose-up); ground @ 95 m ×1 (air-brake-nose-down) |
| b2-lean-back | beginner | 1–2 | 29, 30, 36 | 30 | 1/3 | 277.3 s | 100% | box @ 104.6 m ×6 (nose-low); ramp @ 114.6 m ×6 (nose-low); ramp @ 60.6 m ×5 (nose-high) |
| b3-kicker-row | beginner | 1–2 | 41, 42, 39 | 41 | 1/3 | 293.9 s | 100% | ramp @ 150.0 m ×15 (nose-high); ground @ 325 m ×11 (air-brake-nose-down); ramp @ 334.8 m ×8 (air-brake-nose-down) |
| e1-uphill-weight | easy | 2–4 | 35, 42, 36 | 36 | 0/3 | — | 49% | ground @ 55 m ×11 (nose-high); ramp @ 75.2 m ×11 (air-brake-nose-down); ground @ 50 m ×8 (nose-high) |
| e2-rear-wheel-first | easy | 3–5 | 39, 46, 46 | 46 | 0/3 | — | 57% | box @ 183.2 m ×22 (air-brake-nose-down); ramp @ 191.2 m ×14 (air-brake-nose-down); ramp @ 57.0 m ×10 (air-brake-nose-down) |
| e3-stairway | easy | 3–6 | 44, 47, 51 | 47 | 0/3 | — | 82% | stair @ 406.8 m ×20 (nose-high); ground @ 50 m ×13 (air-brake-nose-down); stair @ 262.4 m ×11 (nose-high) |
| m1-hop-up | medium | 5–9 | 51, 51, 49 | 51 | 0/3 | — | 66% | ledge @ 119.0 m ×62 (nose-low); ledge @ 280.3 m ×20 (air-brake-nose-down); ledge @ 21.0 m ×11 (nose-low) |
| m2-drum-roll | medium | 6–12 | 41, 43, 40 | 41 | 0/3 | — | 72% | drum @ 47.6 m ×22 (air-gas-nose-up); drum @ 53.2 m ×17 (air-brake-nose-down); drum @ 40.0 m ×12 (nose-high) |
| m3-see-saw | medium | 8–12 | 41, 40, 33 | 40 | 0/3 | — | 90% | ground @ 410 m ×9 (air-brake-nose-down); ramp @ 179.8 m ×6 (respawn); ground @ 55 m ×5 (touchdown) |
| h1-wheelie-wire | hard | 10–18 | 41, 51, 47 | 47 | 0/3 | — | 60% | wall @ 175.8 m ×33 (nose-low); ramp @ 172.8 m ×26 (air-brake-nose-down); gap @ 184.8 m ×14 (air-brake-nose-down) |
| h2-gap-chain | hard | 14–22 | 50, 46, 49 | 49 | 0/3 | — | 17% | ramp @ 62.0 m ×37 (air-gas-nose-up); box @ 54.0 m ×22 (air-brake-nose-down); ramp @ 57.5 m ×20 (air-gas-nose-up) |
| h3-fire-line | hard | 18–25 | 39, 41, 49 | 41 | 0/3 | — | 90% | ledge @ 252.8 m ×12 (air-gas-nose-up); ramp @ 236.8 m ×11 (air-gas-nose-up); ground @ 210 m ×8 (air-brake-nose-down) |
| x1-vertical-limit | extreme | 30–45 | 38, 43, 35 | 38 | 0/3 | — | 35% | ramp @ 227.9 m ×33 (nose-high); plank @ 230.3 m ×12 (air-brake-nose-down); box @ 44.1 m ×10 (air-brake-nose-down) |
| x2-pipe-dream | extreme | 40–60 | 46, 45, 40 | 45 | 0/3 | — | 51% | ramp @ 62.6 m ×25 (air-brake-nose-down); ramp @ 74.6 m ×16 (air-brake-nose-down); ramp @ 52.6 m ×13 (air-gas-nose-up) |
| x3-gauntlet | extreme | 60–80 | 41, 50, 46 | 46 | 0/3 | — | 57% | ramp @ 48.0 m ×26 (air-brake-nose-down); ramp @ 60.2 m ×18 (air-brake-nose-down); ledge @ 189.0 m ×16 (nose-low) |
| lab-physics-test | medium | 3–8 | 2, 14, 14 | 14 | 3/3 | 68.3 s | 100% | ground @ 50 m ×12 (air-brake-nose-down); ramp @ 40.0 m ×4 (air-brake-nose-down); ground @ 55 m ×2 (air-brake-nose-down) |
| lab-flat-200 | beginner | 1–1 | 5, 3, 4 | 4 | 3/3 | 33.1 s | 100% | ground @ 10 m ×3 (air-brake-nose-down); ground @ 5 m ×2 (air-brake-nose-down); ground @ 20 m ×1 (nose-high) |

## Pro bike — skill average, 3 seed(s), physics bikePhysicsFactory-v2, src 74f5de4d, 2026-09-15T00:28:04.370Z, wall 8 s

Reaction 180–220 ms, glances 25 Hz, pitch noise ±2°, speed noise ±5%, taps 80 ms, lapses every ~10 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 2, 2, 2 | 2 | 3/3 | 14.2 s | 100% | ground @ 10 m ×3 (nose-high) |
| gap-test | beginner | 1–3 | 5, 11, 7 | 7 | 3/3 | 27.9 s | 100% | ramp @ 30.0 m ×10 (nose-high); ground @ 10 m ×3 (nose-high); ground @ 55 m ×2 (nose-high) |
| b1-first-ride | beginner | 1–1 | 4, 10, 9 | 9 | 3/3 | 102.1 s | 100% | ground @ 10 m ×4 (nose-high); ground @ 75 m ×3 (air-brake-nose-down); ground @ 95 m ×3 (nose-low) |
| b2-lean-back | beginner | 1–2 | 6, 18, 13 | 13 | 3/3 | 122.3 s | 100% | drum @ 18.0 m ×3 (nose-high); ground @ 35 m ×2 (air-gas-nose-up); ledge @ 68.6 m ×2 (nose-high) |
| b3-kicker-row | beginner | 1–2 | 22, 38, 25 | 25 | 3/3 | 184.6 s | 100% | ramp @ 150.0 m ×13 (nose-high); ground @ 325 m ×10 (touchdown); box @ 415.8 m ×6 (air-gas-nose-up) |
| e1-uphill-weight | easy | 2–4 | 31, 32, 32 | 32 | 3/3 | 260.1 s | 100% | ramp @ 445.9 m ×15 (air-brake-nose-down); ground @ 425 m ×6 (nose-high); plank @ 62.0 m ×5 (nose-high) |
| e2-rear-wheel-first | easy | 3–5 | 38, 41, 36 | 38 | 0/3 | — | 100% | ramp @ 506.4 m ×21 (air-brake-nose-down); ramp @ 514.9 m ×17 (air-gas-nose-up); ramp @ 483.4 m ×7 (nose-high) |
| e3-stairway | easy | 3–6 | 35, 44, 46 | 44 | 0/3 | — | 80% | stair @ 164.5 m ×27 (air-brake-nose-down); stair @ 406.8 m ×19 (nose-high); box @ 168.1 m ×13 (stuck-restart) |
| m1-hop-up | medium | 5–9 | 48, 46, 49 | 48 | 0/3 | — | 65% | ledge @ 285.3 m ×39 (nose-low); ledge @ 119.0 m ×32 (nose-low); ledge @ 280.3 m ×32 (air-gas-nose-up) |
| m2-drum-roll | medium | 6–12 | 44, 44, 37 | 44 | 0/3 | — | 92% | ramp @ 311.2 m ×22 (air-gas-nose-up); ramp @ 295.0 m ×11 (nose-high); box @ 315.2 m ×9 (air-brake-nose-down) |
| m3-see-saw | medium | 8–12 | 44, 40, 46 | 44 | 1/3 | 285.4 s | 100% | ramp @ 45.8 m ×23 (air-brake-nose-down); ramp @ 202.6 m ×17 (air-brake-nose-down); ramp @ 211.6 m ×9 (air-gas-nose-up) |
| h1-wheelie-wire | hard | 10–18 | 45, 50, 49 | 49 | 0/3 | — | 61% | wall @ 175.8 m ×47 (nose-low); gap @ 184.8 m ×25 (air-brake-nose-down); ramp @ 172.8 m ×19 (air-brake-nose-down) |
| h2-gap-chain | hard | 14–22 | 46, 43, 50 | 46 | 0/3 | — | 46% | ramp @ 62.0 m ×38 (air-gas-nose-up); ramp @ 73.0 m ×18 (air-gas-nose-up); box @ 65.0 m ×14 (nose-high) |
| h3-fire-line | hard | 18–25 | 43, 47, 46 | 46 | 0/3 | — | 77% | ledge @ 252.8 m ×18 (air-gas-nose-up); ground @ 345 m ×14 (nose-high); ramp @ 236.8 m ×12 (air-gas-nose-up) |
| x1-vertical-limit | extreme | 30–45 | 38, 38, 35 | 38 | 0/3 | — | 41% | ramp @ 227.9 m ×35 (air-brake-nose-down); plank @ 230.3 m ×17 (air-gas-nose-up); box @ 44.1 m ×11 (air-brake-nose-down) |
| x2-pipe-dream | extreme | 40–60 | 35, 38, 41 | 38 | 0/3 | — | 72% | ramp @ 74.6 m ×19 (air-gas-nose-up); box @ 48.6 m ×11 (air-gas-nose-up); box @ 230.8 m ×10 (air-brake-nose-down) |
| x3-gauntlet | extreme | 60–80 | 44, 38, 37 | 38 | 0/3 | — | 31% | ramp @ 60.2 m ×36 (air-brake-nose-down); ramp @ 48.0 m ×25 (stuck-restart); box @ 52.2 m ×6 (nose-low) |
| lab-physics-test | medium | 3–8 | 2, 3, 1 | 2 | 3/3 | 12.6 s | 100% | ground @ 5 m ×1 (air-brake-nose-down); ground @ 10 m ×1 (air-brake-nose-down); ground @ 65 m ×1 (nose-high) |
| lab-flat-200 | beginner | 1–1 | 2, 4, 2 | 2 | 3/3 | 21.1 s | 100% | ground @ 5 m ×2 (air-brake-nose-down); ground @ 10 m ×1 (air-brake-nose-down); ground @ 100 m ×1 (nose-low) |

## Pro bike — skill good, 3 seed(s), physics bikePhysicsFactory-v2, src 74f5de4d, 2026-09-15T00:28:12.065Z, wall 7 s

Reaction 150–170 ms, glances 30 Hz, pitch noise ±1.5°, speed noise ±4%, taps 70 ms, lapses every ~20 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 4, 2, 2 | 2 | 3/3 | 13.1 s | 100% | ground @ 10 m ×3 (nose-high); ground @ 15 m ×1 (nose-high); ground @ 25 m ×1 (nose-high) |
| gap-test | beginner | 1–3 | 1, 6, 4 | 4 | 3/3 | 16.5 s | 100% | ground @ 10 m ×2 (nose-high); ramp @ 30.0 m ×2 (nose-high); gap @ 34.0 m ×1 (nose-high) |
| b1-first-ride | beginner | 1–1 | 2, 2, 2 | 2 | 3/3 | 52.5 s | 100% | ground @ 10 m ×3 (air-brake-nose-down) |
| b2-lean-back | beginner | 1–2 | 5, 7, 11 | 7 | 3/3 | 100.5 s | 100% | drum @ 18.0 m ×2 (nose-high); box @ 271.8 m ×2 (nose-high); ground @ 10 m ×1 (air-brake-nose-down) |
| b3-kicker-row | beginner | 1–2 | 20, 16, 37 | 20 | 3/3 | 166.0 s | 100% | ramp @ 36.0 m ×11 (nose-high); ramp @ 150.0 m ×10 (nose-high); ramp @ 423.8 m ×6 (air-brake-nose-down) |
| e1-uphill-weight | easy | 2–4 | 35, 16, 20 | 20 | 2/3 | 133.7 s | 100% | ground @ 425 m ×9 (nose-high); ramp @ 445.9 m ×9 (air-brake-nose-down); ground @ 455 m ×5 (air-brake-nose-down) |
| e2-rear-wheel-first | easy | 3–5 | 22, 34, 13 | 22 | 3/3 | 195.1 s | 100% | ramp @ 191.2 m ×13 (air-brake-nose-down); ground @ 10 m ×5 (nose-high); ramp @ 40.0 m ×5 (nose-high) |
| e3-stairway | easy | 3–6 | 35, 42, 31 | 35 | 1/3 | 234.7 s | 100% | stair @ 262.4 m ×17 (nose-high); box @ 168.1 m ×13 (ramp-ride); gap @ 425.6 m ×13 (air-gas-nose-up) |
| m1-hop-up | medium | 5–9 | 48, 51, 43 | 48 | 0/3 | — | 70% | ledge @ 285.3 m ×49 (nose-high); ledge @ 280.3 m ×44 (nose-low); ledge @ 119.0 m ×14 (air-brake-nose-down) |
| m2-drum-roll | medium | 6–12 | 27, 27, 19 | 27 | 3/3 | 217.5 s | 100% | ramp @ 311.2 m ×8 (air-gas-nose-up); seesaw @ 432.2 m ×8 (air-brake-nose-down); ramp @ 400.8 m ×5 (air-brake-nose-down) |
| m3-see-saw | medium | 8–12 | 41, 30, 33 | 33 | 2/3 | 237.7 s | 100% | ramp @ 202.6 m ×16 (air-brake-nose-down); ramp @ 45.8 m ×8 (nose-high); ground @ 225 m ×6 (air-brake-nose-down) |
| h1-wheelie-wire | hard | 10–18 | 42, 51, 43 | 43 | 0/3 | — | 91% | wall @ 175.8 m ×43 (nose-low); gap @ 184.8 m ×17 (air-brake-nose-down); ramp @ 172.8 m ×9 (nose-high) |
| h2-gap-chain | hard | 14–22 | 44, 43, 41 | 43 | 0/3 | — | 71% | ramp @ 265.8 m ×18 (air-gas-nose-up); ramp @ 73.0 m ×17 (air-gas-nose-up); ramp @ 62.0 m ×12 (air-gas-nose-up) |
| h3-fire-line | hard | 18–25 | 41, 39, 39 | 39 | 0/3 | — | 92% | ledge @ 494.2 m ×13 (nose-low); gap @ 489.2 m ×12 (air-gas-nose-up); ledge @ 252.8 m ×8 (nose-low) |
| x1-vertical-limit | extreme | 30–45 | 33, 35, 41 | 35 | 0/3 | — | 62% | ramp @ 227.9 m ×14 (launch); ramp @ 390.6 m ×14 (launch); plank @ 393.0 m ×14 (air-brake-nose-down) |
| x2-pipe-dream | extreme | 40–60 | 37, 44, 43 | 43 | 0/3 | — | 74% | box @ 227.8 m ×32 (nose-high); box @ 230.8 m ×17 (air-brake-nose-down); drum @ 228.8 m ×14 (air-brake-nose-down) |
| x3-gauntlet | extreme | 60–80 | 38, 45, 32 | 38 | 0/3 | — | 31% | ramp @ 60.2 m ×58 (air-brake-nose-down); box @ 72.2 m ×13 (nose-high); stair @ 138.2 m ×8 (air-gas-nose-up) |
| lab-physics-test | medium | 3–8 | 3, 2, 2 | 2 | 3/3 | 11.9 s | 100% | ground @ 10 m ×4 (air-brake-nose-down) |
| lab-flat-200 | beginner | 1–1 | 2, 3, 3 | 3 | 3/3 | 21.5 s | 100% | ground @ 10 m ×3 (air-brake-nose-down); ground @ 15 m ×1 (nose-high); ground @ 20 m ×1 (nose-high) |

## Calibration against the stranger sessions (Rookie)

| track | band | stranger median attempts (sessions, src) | reflex average median (seeds) | ratio | stranger time to clear | reflex time to clear | stranger deaths (top) | reflex deaths (top) |
|---|---|---|---|---:|---:|---:|---|---|
| b1-first-ride | 1–1 | 2 (7, d698717f/73762476/c83b6ca8/68e975a6) | 1 (1, 1, 1) | 0.50 | 57.0 s | 56.7 s | — | — |
| b2-lean-back | 1–2 | 3.5 (4, 73762476/81ade223/68e975a6) | 1 (2, 1, 1) | 0.29 | 57.2 s | 57.7 s | — | ground @ 575 m ×1 |
| b3-kicker-row | 1–2 | 4.5 (6, 73762476/c83b6ca8/68e975a6/d39d492b) | 7 (7, 12, 3) | 1.56 | 62.3 s | 86.7 s | — | ground @ 170 m ×4; ramp @ 334.8 m ×3; ground @ 235 m ×2 |
| e1-uphill-weight | 2–4 | 8 (6, 73762476/c83b6ca8/51d42b25/5394d725) | 7 (4, 7, 8) | 0.88 | 103.1 s | 109.5 s | — | ramp @ 445.9 m ×5; ground @ 155 m ×3; ground @ 215 m ×2 |
