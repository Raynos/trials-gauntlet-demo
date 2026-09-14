# Reflex bot — skill novice / average / good, 3 seed(s), bikes rookie + pro, src 93e6caa5, 2026-09-14T22:49:45.317Z, wall 41 s

attempts = 1 + faults (all reasons); cap 50; sim cap 300 s. Rookie = `<track>.reflex.json`, Pro = `<track>.pro.reflex.json`; the band is authored for the tier's default bike (average). Death sites: nearest placed obstacle (name @ x) with the rule the rider was executing.

## Rookie bike — skill novice, 3 seed(s), physics bikePhysicsFactory-v2, src 93e6caa5, 2026-09-14T22:49:45.317Z, wall 7 s

Reaction 230–280 ms, glances 20 Hz, pitch noise ±3°, speed noise ±7%, taps 100 ms, lapses every ~6 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 1, 1, 1 | 1 | 3/3 | 13.3 s | 100% | — |
| gap-test | beginner | 1–3 | 2, 2, 6 | 2 | 3/3 | 11.5 s | 100% | ground @ 15 m ×2 (nose-high); ground @ 40 m ×2 (touchdown); ground @ 10 m ×1 (air-brake-nose-down) |
| b1-first-ride | beginner | 1–1 | 3, 3, 1 | 3 | 3/3 | 71.6 s | 100% | ground @ 5 m ×1 (air-brake-nose-down); ground @ 10 m ×1 (nose-high); ground @ 85 m ×1 (nose-low) |
| b2-lean-back | beginner | 1–2 | 19, 9, 23 | 19 | 3/3 | 252.7 s | 100% | ground @ 290 m ×4 (air-brake-nose-down); ground @ 295 m ×3 (air-brake-nose-down); ground @ 355 m ×3 (air-brake-nose-down) |
| b3-kicker-row | beginner | 1–2 | 27, 38, 36 | 36 | 1/3 | 240.3 s | 100% | ground @ 345 m ×11 (air-brake-nose-down); ramp @ 334.8 m ×10 (air-brake-nose-down); ground @ 170 m ×6 (air-brake-nose-down) |
| e1-uphill-weight | easy | 2–4 | 31, 34, 31 | 31 | 0/3 | — | 81% | ramp @ 75.2 m ×14 (air-gas-nose-up); ramp @ 211.0 m ×8 (air-gas-nose-up); ramp @ 300.0 m ×7 (nose-high) |
| e2-rear-wheel-first | easy | 3–5 | 41, 43, 43 | 43 | 0/3 | — | 43% | ramp @ 57.0 m ×21 (nose-high); box @ 183.2 m ×15 (air-brake-nose-down); ramp @ 66.0 m ×12 (air-brake-nose-down) |
| e3-stairway | easy | 3–6 | 38, 39, 46 | 39 | 0/3 | — | 77% | stair @ 164.5 m ×51 (nose-high); box @ 168.1 m ×20 (stuck-restart); stair @ 262.4 m ×9 (ramp-ride) |
| m1-hop-up | medium | 5–9 | 51, 51, 50 | 51 | 0/3 | — | 65% | ledge @ 280.3 m ×52 (nose-low); ledge @ 119.0 m ×43 (nose-low); ledge @ 285.3 m ×15 (air-brake-nose-down) |
| m2-drum-roll | medium | 6–12 | 42, 40, 38 | 40 | 0/3 | — | 97% | drum @ 53.2 m ×16 (air-gas-nose-up); drum @ 40.0 m ×15 (nose-high); drum @ 58.8 m ×13 (air-brake-nose-down) |
| m3-see-saw | medium | 8–12 | 39, 39, 28 | 39 | 1/3 | 244.6 s | 100% | ramp @ 45.8 m ×13 (nose-low); seesaw @ 46.6 m ×12 (air-brake-nose-down); ramp @ 202.6 m ×12 (air-brake-nose-down) |
| h1-wheelie-wire | hard | 10–18 | 45, 47, 48 | 47 | 0/3 | — | 40% | wall @ 175.8 m ×50 (nose-low); ramp @ 172.8 m ×41 (nose-high); gap @ 184.8 m ×24 (air-brake-nose-down) |
| h2-gap-chain | hard | 14–22 | 45, 51, 49 | 49 | 0/3 | — | 15% | ramp @ 62.0 m ×48 (air-gas-nose-up); ramp @ 73.0 m ×18 (air-gas-nose-up); box @ 54.0 m ×15 (air-gas-nose-up) |
| h3-fire-line | hard | 18–25 | 36, 37, 45 | 37 | 0/3 | — | 89% | ramp @ 236.8 m ×16 (air-gas-nose-up); ledge @ 252.8 m ×11 (nose-low); ledge @ 389.6 m ×10 (air-gas-nose-up) |
| x1-vertical-limit | extreme | 30–45 | 36, 36, 35 | 36 | 0/3 | — | 53% | ramp @ 227.9 m ×30 (stuck-restart); plank @ 230.3 m ×19 (nose-high); box @ 232.8 m ×7 (air-brake-nose-down) |
| x2-pipe-dream | extreme | 40–60 | 41, 41, 36 | 41 | 0/3 | — | 52% | ramp @ 74.6 m ×24 (air-brake-nose-down); ramp @ 52.6 m ×15 (nose-high); ramp @ 62.6 m ×15 (air-gas-nose-up) |
| x3-gauntlet | extreme | 60–80 | 34, 33, 36 | 34 | 0/3 | — | 32% | ramp @ 60.2 m ×27 (air-gas-nose-up); ground @ 90 m ×10 (air-brake-nose-down); box @ 52.2 m ×9 (air-brake-nose-down) |
| lab-physics-test | medium | 3–8 | 1, 4, 2 | 2 | 3/3 | 15.7 s | 100% | ground @ 15 m ×2 (nose-high); ground @ 25 m ×1 (nose-high); ground @ 85 m ×1 (air-gas-nose-up) |
| lab-flat-200 | beginner | 1–1 | 1, 3, 1 | 1 | 3/3 | 21.5 s | 100% | ground @ 10 m ×1 (nose-high); ground @ 15 m ×1 (nose-high) |

## Rookie bike — skill average, 3 seed(s), physics bikePhysicsFactory-v2, src 93e6caa5, 2026-09-14T22:49:52.435Z, wall 6 s

Reaction 180–220 ms, glances 25 Hz, pitch noise ±2°, speed noise ±5%, taps 80 ms, lapses every ~10 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 1, 1, 1 | 1 | 3/3 | 11.5 s | 100% | — |
| gap-test | beginner | 1–3 | 1, 1, 1 | 1 | 3/3 | 7.4 s | 100% | — |
| b1-first-ride | beginner | 1–1 | 2, 6, 4 | 4 | 3/3 | 96.1 s | 100% | ground @ 575 m ×3 (air-gas-nose-up); ground @ 90 m ×1 (air-gas-nose-up); ground @ 110 m ×1 (air-gas-nose-up) |
| b2-lean-back | beginner | 1–2 | 3, 19, 8 | 8 | 3/3 | 118.1 s | 100% | ground @ 295 m ×3 (air-brake-nose-down); ground @ 285 m ×2 (air-gas-nose-up); ground @ 365 m ×2 (nose-low) |
| b3-kicker-row | beginner | 1–2 | 9, 27, 12 | 12 | 3/3 | 137.6 s | 100% | ground @ 325 m ×6 (nose-high); ramp @ 423.8 m ×5 (air-brake-nose-down); ramp @ 334.8 m ×4 (air-brake-nose-down) |
| e1-uphill-weight | easy | 2–4 | 35, 15, 31 | 31 | 1/3 | 191.5 s | 100% | ramp @ 211.0 m ×15 (nose-low); ground @ 215 m ×7 (air-brake-nose-down); ramp @ 273.0 m ×7 (air-brake-nose-down) |
| e2-rear-wheel-first | easy | 3–5 | 36, 38, 45 | 38 | 0/3 | — | 93% | ramp @ 57.0 m ×21 (air-gas-nose-up); ramp @ 66.0 m ×20 (air-brake-nose-down); box @ 72.0 m ×9 (air-brake-nose-down) |
| e3-stairway | easy | 3–6 | 44, 46, 42 | 44 | 0/3 | — | 85% | stair @ 164.5 m ×73 (stuck-restart); box @ 168.1 m ×18 (air-gas-nose-up); box @ 411.6 m ×13 (air-gas-nose-up) |
| m1-hop-up | medium | 5–9 | 51, 49, 51 | 51 | 0/3 | — | 65% | ledge @ 119.0 m ×55 (air-brake-nose-down); ledge @ 280.3 m ×41 (nose-low); ledge @ 285.3 m ×26 (air-brake-nose-down) |
| m2-drum-roll | medium | 6–12 | 40, 44, 37 | 40 | 0/3 | — | 90% | ramp @ 311.2 m ×14 (air-gas-nose-up); drum @ 53.2 m ×13 (air-brake-nose-down); ramp @ 328.8 m ×8 (touchdown) |
| m3-see-saw | medium | 8–12 | 38, 37, 38 | 38 | 1/3 | 295.8 s | 100% | ground @ 410 m ×27 (air-brake-nose-down); ground @ 405 m ×9 (nose-high); ramp @ 202.6 m ×7 (air-brake-nose-down) |
| h1-wheelie-wire | hard | 10–18 | 37, 46, 51 | 46 | 0/3 | — | 63% | wall @ 175.8 m ×42 (air-gas-nose-up); ramp @ 172.8 m ×19 (air-brake-nose-down); gap @ 356.0 m ×14 (nose-low) |
| h2-gap-chain | hard | 14–22 | 50, 46, 51 | 50 | 0/3 | — | 13% | ramp @ 62.0 m ×54 (air-gas-nose-up); box @ 54.0 m ×21 (air-brake-nose-down); box @ 65.0 m ×16 (air-brake-nose-down) |
| h3-fire-line | hard | 18–25 | 40, 40, 37 | 40 | 0/3 | — | 90% | ledge @ 389.6 m ×15 (nose-low); ramp @ 467.2 m ×10 (air-level); gap @ 489.2 m ×10 (air-gas-nose-up) |
| x1-vertical-limit | extreme | 30–45 | 33, 34, 33 | 33 | 0/3 | — | 53% | ramp @ 227.9 m ×40 (stuck-restart); plank @ 230.3 m ×13 (air-brake-nose-down); box @ 232.8 m ×13 (nose-high) |
| x2-pipe-dream | extreme | 40–60 | 43, 39, 35 | 39 | 0/3 | — | 52% | box @ 227.8 m ×26 (nose-high); ramp @ 74.6 m ×19 (air-brake-nose-down); ramp @ 62.6 m ×14 (air-gas-nose-up) |
| x3-gauntlet | extreme | 60–80 | 35, 37, 37 | 37 | 0/3 | — | 28% | ramp @ 60.2 m ×42 (air-gas-nose-up); box @ 52.2 m ×10 (air-brake-nose-down); ramp @ 48.0 m ×9 (nose-high) |
| lab-physics-test | medium | 3–8 | 2, 3, 2 | 2 | 3/3 | 14.8 s | 100% | ground @ 20 m ×1 (nose-high); ground @ 25 m ×1 (nose-high); ground @ 85 m ×1 (air-brake-nose-down) |
| lab-flat-200 | beginner | 1–1 | 2, 1, 1 | 1 | 3/3 | 18.1 s | 100% | ground @ 25 m ×1 (nose-high) |

## Rookie bike — skill good, 3 seed(s), physics bikePhysicsFactory-v2, src 93e6caa5, 2026-09-14T22:49:58.913Z, wall 6 s

Reaction 150–170 ms, glances 30 Hz, pitch noise ±1.5°, speed noise ±4%, taps 70 ms, lapses every ~20 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 1, 2, 2 | 2 | 3/3 | 13.5 s | 100% | ground @ 15 m ×1 (nose-high); ground @ 20 m ×1 (nose-high) |
| gap-test | beginner | 1–3 | 2, 4, 1 | 2 | 3/3 | 13.3 s | 100% | ground @ 55 m ×3 (nose-high); ground @ 50 m ×1 (nose-high) |
| b1-first-ride | beginner | 1–1 | 1, 6, 1 | 1 | 3/3 | 51.2 s | 100% | ground @ 90 m ×2 (air-gas-nose-up); ground @ 95 m ×1 (nose-high); ground @ 110 m ×1 (air-gas-nose-up) |
| b2-lean-back | beginner | 1–2 | 7, 2, 3 | 3 | 3/3 | 66.5 s | 100% | ground @ 50 m ×2 (air-brake-nose-down); ground @ 590 m ×2 (air-gas-nose-up); ramp @ 60.6 m ×1 (air-gas-nose-up) |
| b3-kicker-row | beginner | 1–2 | 24, 17, 15 | 17 | 3/3 | 180.3 s | 100% | ground @ 165 m ×5 (air-gas-nose-up); ground @ 180 m ×4 (nose-high); ground @ 240 m ×4 (air-brake-nose-down) |
| e1-uphill-weight | easy | 2–4 | 14, 27, 31 | 27 | 3/3 | 230.8 s | 100% | ramp @ 211.0 m ×10 (air-gas-nose-up); plank @ 201.0 m ×5 (nose-high); box @ 205.0 m ×5 (nose-high) |
| e2-rear-wheel-first | easy | 3–5 | 31, 18, 12 | 18 | 2/3 | 162.1 s | 100% | ramp @ 506.4 m ×10 (nose-high); ramp @ 514.9 m ×7 (air-brake-nose-down); ramp @ 57.0 m ×5 (nose-high) |
| e3-stairway | easy | 3–6 | 49, 41, 48 | 48 | 0/3 | — | 38% | stair @ 164.5 m ×94 (nose-high); box @ 168.1 m ×33 (stuck-restart); ground @ 75 m ×2 (touchdown) |
| m1-hop-up | medium | 5–9 | 42, 28, 49 | 42 | 1/3 | 206.2 s | 100% | ledge @ 285.3 m ×40 (nose-low); ledge @ 280.3 m ×31 (air-gas-nose-up); gap @ 123.0 m ×9 (air-brake-nose-down) |
| m2-drum-roll | medium | 6–12 | 42, 37, 15 | 37 | 2/3 | 211.0 s | 100% | ramp @ 311.2 m ×12 (air-gas-nose-up); ramp @ 431.4 m ×10 (air-brake-nose-down); seesaw @ 432.2 m ×9 (air-brake-nose-down) |
| m3-see-saw | medium | 8–12 | 40, 33, 33 | 33 | 1/3 | 274.8 s | 100% | ground @ 410 m ×16 (touchdown); box @ 438.9 m ×10 (air-gas-nose-up); ramp @ 202.6 m ×8 (air-brake-nose-down) |
| h1-wheelie-wire | hard | 10–18 | 51, 51, 51 | 51 | 0/3 | — | 44% | wall @ 175.8 m ×86 (nose-low); ramp @ 172.8 m ×31 (nose-high); gap @ 184.8 m ×15 (air-brake-nose-down) |
| h2-gap-chain | hard | 14–22 | 47, 41, 46 | 46 | 0/3 | — | 44% | ramp @ 265.8 m ×36 (air-gas-nose-up); ramp @ 73.0 m ×16 (air-gas-nose-up); ramp @ 62.0 m ×14 (air-gas-nose-up) |
| h3-fire-line | hard | 18–25 | 39, 41, 16 | 39 | 1/3 | 155.1 s | 100% | ledge @ 252.8 m ×11 (air-gas-nose-up); ledge @ 389.6 m ×10 (air-gas-nose-up); ramp @ 467.2 m ×9 (air-brake-nose-down) |
| x1-vertical-limit | extreme | 30–45 | 33, 34, 33 | 33 | 0/3 | — | 53% | ramp @ 227.9 m ×23 (stuck-restart); plank @ 230.3 m ×15 (air-brake-nose-down); ramp @ 390.6 m ×15 (stuck-restart) |
| x2-pipe-dream | extreme | 40–60 | 50, 51, 42 | 50 | 0/3 | — | 73% | drum @ 370.0 m ×35 (air-gas-nose-up); drum @ 366.7 m ×29 (air-gas-nose-up); box @ 227.8 m ×10 (nose-high) |
| x3-gauntlet | extreme | 60–80 | 26, 29, 33 | 29 | 0/3 | — | 32% | ramp @ 60.2 m ×26 (air-brake-nose-down); box @ 143.0 m ×10 (ramp-ride); box @ 72.2 m ×8 (nose-high) |
| lab-physics-test | medium | 3–8 | 1, 1, 1 | 1 | 3/3 | 10.0 s | 100% | — |
| lab-flat-200 | beginner | 1–1 | 1, 1, 1 | 1 | 3/3 | 15.9 s | 100% | — |

## Pro bike — skill novice, 3 seed(s), physics bikePhysicsFactory-v2, src 93e6caa5, 2026-09-14T22:50:04.931Z, wall 7 s

Reaction 230–280 ms, glances 20 Hz, pitch noise ±3°, speed noise ±7%, taps 100 ms, lapses every ~6 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 1, 5, 6 | 5 | 3/3 | 32.0 s | 100% | ground @ 5 m ×2 (air-brake-nose-down); ground @ 10 m ×2 (air-brake-nose-down); ground @ 25 m ×2 (air-gas-nose-up) |
| gap-test | beginner | 1–3 | 2, 13, 4 | 4 | 3/3 | 17.1 s | 100% | ramp @ 30.0 m ×4 (air-brake-nose-down); ground @ 50 m ×4 (air-gas-nose-up); ground @ 5 m ×2 (nose-high) |
| b1-first-ride | beginner | 1–1 | 19, 26, 1 | 19 | 3/3 | 246.9 s | 100% | ground @ 575 m ×6 (nose-low); ground @ 430 m ×5 (air-brake-nose-down); ground @ 460 m ×3 (nose-low) |
| b2-lean-back | beginner | 1–2 | 24, 33, 38 | 33 | 1/3 | 234.2 s | 100% | box @ 271.8 m ×8 (air-brake-nose-down); ledge @ 68.6 m ×7 (air-brake-nose-down); ground @ 150 m ×5 (nose-low) |
| b3-kicker-row | beginner | 1–2 | 45, 43, 42 | 43 | 0/3 | — | 56% | ramp @ 36.0 m ×20 (nose-high); ramp @ 150.0 m ×10 (air-brake-nose-down); ground @ 50 m ×8 (air-gas-nose-up) |
| e1-uphill-weight | easy | 2–4 | 32, 43, 37 | 37 | 0/3 | — | 32% | ramp @ 75.2 m ×19 (air-gas-nose-up); ground @ 80 m ×11 (nose-high); plank @ 62.0 m ×10 (nose-high) |
| e2-rear-wheel-first | easy | 3–5 | 43, 47, 43 | 43 | 0/3 | — | 21% | ramp @ 57.0 m ×38 (nose-high); ramp @ 66.0 m ×33 (air-brake-nose-down); box @ 72.0 m ×19 (air-brake-nose-down) |
| e3-stairway | easy | 3–6 | 45, 48, 42 | 45 | 0/3 | — | 39% | stair @ 164.5 m ×56 (air-brake-nose-down); box @ 168.1 m ×26 (stuck-restart); ground @ 180 m ×7 (nose-low) |
| m1-hop-up | medium | 5–9 | 50, 51, 51 | 51 | 0/3 | — | 67% | ledge @ 119.0 m ×55 (air-brake-nose-down); ledge @ 280.3 m ×26 (nose-low); gap @ 123.0 m ×15 (air-gas-nose-up) |
| m2-drum-roll | medium | 6–12 | 45, 43, 44 | 44 | 0/3 | — | 46% | drum @ 47.6 m ×31 (air-gas-nose-up); drum @ 40.0 m ×20 (air-brake-nose-down); drum @ 53.2 m ×19 (air-brake-nose-down) |
| m3-see-saw | medium | 8–12 | 43, 45, 43 | 43 | 0/3 | — | 67% | ramp @ 45.8 m ×20 (air-brake-nose-down); ramp @ 202.6 m ×20 (air-brake-nose-down); ground @ 35 m ×9 (nose-high) |
| h1-wheelie-wire | hard | 10–18 | 48, 50, 51 | 50 | 0/3 | — | 38% | wall @ 175.8 m ×55 (air-gas-nose-up); ramp @ 172.8 m ×30 (air-brake-nose-down); gap @ 184.8 m ×20 (air-brake-nose-down) |
| h2-gap-chain | hard | 14–22 | 47, 45, 47 | 47 | 0/3 | — | 14% | ramp @ 62.0 m ×37 (air-gas-nose-up); ramp @ 73.0 m ×17 (air-gas-nose-up); box @ 65.0 m ×16 (air-brake-nose-down) |
| h3-fire-line | hard | 18–25 | 37, 42, 49 | 42 | 0/3 | — | 50% | ramp @ 62.0 m ×16 (air-brake-nose-down); ground @ 65 m ×11 (air-gas-nose-up); ground @ 70 m ×11 (air-gas-nose-up) |
| x1-vertical-limit | extreme | 30–45 | 38, 40, 43 | 40 | 0/3 | — | 31% | plank @ 230.3 m ×17 (air-brake-nose-down); ramp @ 227.9 m ×16 (stuck-restart); ground @ 200 m ×10 (air-brake-nose-down) |
| x2-pipe-dream | extreme | 40–60 | 43, 42, 45 | 43 | 0/3 | — | 31% | ramp @ 62.6 m ×29 (air-gas-nose-up); ramp @ 74.6 m ×29 (air-brake-nose-down); box @ 48.6 m ×18 (air-brake-nose-down) |
| x3-gauntlet | extreme | 60–80 | 44, 36, 38 | 38 | 0/3 | — | 30% | ramp @ 60.2 m ×33 (air-brake-nose-down); ramp @ 48.0 m ×16 (nose-high); box @ 52.2 m ×13 (air-gas-nose-up) |
| lab-physics-test | medium | 3–8 | 12, 1, 12 | 12 | 3/3 | 61.2 s | 100% | ground @ 50 m ×7 (air-gas-nose-up); ramp @ 40.0 m ×4 (nose-high); gap @ 46.3 m ×4 (air-brake-nose-down) |
| lab-flat-200 | beginner | 1–1 | 4, 5, 6 | 5 | 3/3 | 35.6 s | 100% | ground @ 10 m ×3 (air-brake-nose-down); ground @ 55 m ×2 (nose-high); ground @ 65 m ×2 (air-brake-nose-down) |

## Pro bike — skill average, 3 seed(s), physics bikePhysicsFactory-v2, src 93e6caa5, 2026-09-14T22:50:12.429Z, wall 7 s

Reaction 180–220 ms, glances 25 Hz, pitch noise ±2°, speed noise ±5%, taps 80 ms, lapses every ~10 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 2, 2, 2 | 2 | 3/3 | 14.3 s | 100% | ground @ 10 m ×3 (nose-high) |
| gap-test | beginner | 1–3 | 2, 9, 5 | 5 | 3/3 | 24.1 s | 100% | ramp @ 30.0 m ×6 (nose-high); ground @ 10 m ×2 (nose-high); ground @ 40 m ×2 (air-brake-nose-down) |
| b1-first-ride | beginner | 1–1 | 6, 9, 6 | 6 | 3/3 | 101.0 s | 100% | ground @ 10 m ×4 (nose-high); ground @ 425 m ×3 (air-brake-nose-down); ground @ 75 m ×2 (air-brake-nose-down) |
| b2-lean-back | beginner | 1–2 | 8, 29, 24 | 24 | 3/3 | 199.1 s | 100% | ground @ 35 m ×3 (nose-high); box @ 104.6 m ×3 (nose-high); ground @ 265 m ×3 (air-brake-nose-down) |
| b3-kicker-row | beginner | 1–2 | 44, 39, 42 | 42 | 1/3 | 290.6 s | 100% | ground @ 325 m ×11 (touchdown); ramp @ 36.0 m ×9 (nose-high); ground @ 170 m ×8 (nose-high) |
| e1-uphill-weight | easy | 2–4 | 38, 38, 38 | 38 | 0/3 | — | 43% | ramp @ 75.2 m ×12 (nose-low); ground @ 85 m ×12 (nose-high); ramp @ 211.0 m ×11 (air-gas-nose-up) |
| e2-rear-wheel-first | easy | 3–5 | 41, 37, 45 | 41 | 0/3 | — | 53% | ramp @ 57.0 m ×19 (nose-high); box @ 72.0 m ×19 (air-brake-nose-down); ramp @ 66.0 m ×14 (air-brake-nose-down) |
| e3-stairway | easy | 3–6 | 43, 43, 51 | 43 | 0/3 | — | 40% | stair @ 164.5 m ×79 (air-gas-nose-up); box @ 168.1 m ×32 (stuck-restart); ground @ 10 m ×2 (air-brake-nose-down) |
| m1-hop-up | medium | 5–9 | 47, 51, 49 | 49 | 0/3 | — | 66% | ledge @ 119.0 m ×36 (air-gas-nose-up); ledge @ 280.3 m ×30 (air-gas-nose-up); ledge @ 285.3 m ×28 (air-brake-nose-down) |
| m2-drum-roll | medium | 6–12 | 42, 41, 43 | 42 | 0/3 | — | 69% | drum @ 53.2 m ×17 (air-brake-nose-down); drum @ 47.6 m ×15 (air-gas-nose-up); drum @ 186.0 m ×12 (air-brake-nose-down) |
| m3-see-saw | medium | 8–12 | 42, 44, 41 | 42 | 0/3 | — | 72% | ramp @ 202.6 m ×21 (air-brake-nose-down); ramp @ 45.8 m ×15 (air-brake-nose-down); ramp @ 211.6 m ×13 (air-gas-nose-up) |
| h1-wheelie-wire | hard | 10–18 | 41, 51, 51 | 51 | 0/3 | — | 33% | wall @ 175.8 m ×51 (nose-low); ramp @ 172.8 m ×14 (nose-high); gap @ 184.8 m ×12 (air-brake-nose-down) |
| h2-gap-chain | hard | 14–22 | 51, 51, 49 | 51 | 0/3 | — | 12% | ramp @ 62.0 m ×60 (air-gas-nose-up); box @ 65.0 m ×26 (air-brake-nose-down); ramp @ 73.0 m ×14 (air-gas-nose-up) |
| h3-fire-line | hard | 18–25 | 41, 45, 44 | 44 | 0/3 | — | 72% | ramp @ 236.8 m ×24 (air-level); ledge @ 252.8 m ×17 (nose-low); ground @ 210 m ×10 (air-brake-nose-down) |
| x1-vertical-limit | extreme | 30–45 | 36, 36, 37 | 36 | 0/3 | — | 39% | ramp @ 227.9 m ×38 (stuck-restart); plank @ 230.3 m ×19 (nose-high); box @ 232.8 m ×10 (nose-low) |
| x2-pipe-dream | extreme | 40–60 | 39, 43, 39 | 39 | 0/3 | — | 49% | ramp @ 62.6 m ×29 (air-brake-nose-down); ramp @ 74.6 m ×29 (air-brake-nose-down); box @ 48.6 m ×11 (air-gas-nose-up) |
| x3-gauntlet | extreme | 60–80 | 37, 37, 39 | 37 | 0/3 | — | 31% | ramp @ 60.2 m ×29 (air-brake-nose-down); box @ 52.2 m ×10 (air-gas-nose-up); box @ 72.2 m ×9 (touchdown) |
| lab-physics-test | medium | 3–8 | 9, 18, 8 | 9 | 3/3 | 43.3 s | 100% | ground @ 55 m ×8 (nose-high); ground @ 50 m ×7 (air-level); gap @ 46.3 m ×4 (air-brake-nose-down) |
| lab-flat-200 | beginner | 1–1 | 6, 2, 2 | 2 | 3/3 | 21.1 s | 100% | ground @ 60 m ×3 (nose-high); ground @ 5 m ×2 (air-brake-nose-down); ground @ 10 m ×1 (air-brake-nose-down) |

## Pro bike — skill good, 3 seed(s), physics bikePhysicsFactory-v2, src 93e6caa5, 2026-09-14T22:50:19.466Z, wall 7 s

Reaction 150–170 ms, glances 30 Hz, pitch noise ±1.5°, speed noise ±4%, taps 70 ms, lapses every ~20 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 4, 2, 2 | 2 | 3/3 | 13.1 s | 100% | ground @ 10 m ×5 (nose-high) |
| gap-test | beginner | 1–3 | 5, 2, 2 | 2 | 3/3 | 10.0 s | 100% | ground @ 10 m ×4 (nose-high); ground @ 15 m ×1 (nose-high); ground @ 20 m ×1 (air-brake-nose-down) |
| b1-first-ride | beginner | 1–1 | 2, 4, 2 | 2 | 3/3 | 53.5 s | 100% | ground @ 10 m ×3 (touchdown); ground @ 425 m ×1 (nose-high); ground @ 575 m ×1 (air-gas-nose-up) |
| b2-lean-back | beginner | 1–2 | 5, 19, 7 | 7 | 3/3 | 85.2 s | 100% | ground @ 280 m ×3 (air-gas-nose-up); ramp @ 401.2 m ×3 (air-gas-nose-up); box @ 411.2 m ×3 (air-brake-nose-down) |
| b3-kicker-row | beginner | 1–2 | 21, 19, 26 | 21 | 3/3 | 153.4 s | 100% | ramp @ 150.0 m ×10 (nose-high); ground @ 170 m ×5 (nose-high); ground @ 10 m ×4 (air-brake-nose-down) |
| e1-uphill-weight | easy | 2–4 | 39, 41, 36 | 39 | 0/3 | — | 100% | ramp @ 211.0 m ×12 (touchdown); ground @ 220 m ×7 (air-brake-nose-down); ramp @ 300.0 m ×7 (nose-high) |
| e2-rear-wheel-first | easy | 3–5 | 35, 38, 33 | 35 | 1/3 | 295.6 s | 100% | ramp @ 506.4 m ×12 (air-brake-nose-down); ramp @ 514.9 m ×9 (air-level); box @ 72.0 m ×8 (air-brake-nose-down) |
| e3-stairway | easy | 3–6 | 45, 46, 40 | 45 | 0/3 | — | 40% | stair @ 164.5 m ×66 (nose-high); box @ 168.1 m ×45 (stuck-restart); stair @ 69.8 m ×3 (air-brake-nose-down) |
| m1-hop-up | medium | 5–9 | 44, 51, 47 | 47 | 0/3 | — | 70% | ledge @ 285.3 m ×46 (air-gas-nose-up); ledge @ 280.3 m ×33 (air-gas-nose-up); ledge @ 119.0 m ×15 (air-gas-nose-up) |
| m2-drum-roll | medium | 6–12 | 49, 43, 47 | 47 | 0/3 | — | 90% | ramp @ 311.2 m ×40 (air-gas-nose-up); ramp @ 295.0 m ×10 (nose-high); drum @ 303.6 m ×7 (air-gas-nose-up) |
| m3-see-saw | medium | 8–12 | 45, 35, 43 | 43 | 0/3 | — | 93% | ramp @ 202.6 m ×16 (air-brake-nose-down); ramp @ 211.6 m ×11 (air-gas-nose-up); ground @ 410 m ×10 (air-brake-nose-down) |
| h1-wheelie-wire | hard | 10–18 | 51, 51, 51 | 51 | 0/3 | — | 60% | wall @ 175.8 m ×50 (air-gas-nose-up); ramp @ 172.8 m ×20 (nose-high); wall @ 348.0 m ×20 (air-gas-nose-up) |
| h2-gap-chain | hard | 14–22 | 44, 48, 43 | 44 | 0/3 | — | 46% | ramp @ 265.8 m ×27 (air-gas-nose-up); ramp @ 73.0 m ×18 (air-gas-nose-up); ramp @ 246.8 m ×10 (nose-high) |
| h3-fire-line | hard | 18–25 | 44, 44, 43 | 44 | 0/3 | — | 90% | ledge @ 252.8 m ×13 (touchdown); ramp @ 367.6 m ×8 (touchdown); ledge @ 389.6 m ×7 (air-brake-nose-down) |
| x1-vertical-limit | extreme | 30–45 | 38, 38, 37 | 38 | 0/3 | — | 53% | ramp @ 227.9 m ×29 (stuck-restart); box @ 232.8 m ×16 (air-brake-nose-down); plank @ 230.3 m ×15 (air-brake-nose-down) |
| x2-pipe-dream | extreme | 40–60 | 42, 42, 40 | 42 | 0/3 | — | 52% | box @ 227.8 m ×24 (nose-high); ramp @ 74.6 m ×18 (air-brake-nose-down); ramp @ 62.6 m ×12 (nose-high) |
| x3-gauntlet | extreme | 60–80 | 36, 35, 38 | 36 | 0/3 | — | 32% | ramp @ 60.2 m ×39 (air-brake-nose-down); box @ 72.2 m ×11 (air-brake-nose-down); ground @ 65 m ×7 (nose-high) |
| lab-physics-test | medium | 3–8 | 3, 2, 2 | 2 | 3/3 | 11.7 s | 100% | ground @ 10 m ×4 (nose-high) |
| lab-flat-200 | beginner | 1–1 | 2, 3, 3 | 3 | 3/3 | 21.5 s | 100% | ground @ 10 m ×4 (air-brake-nose-down); ground @ 15 m ×1 (nose-high) |

## Calibration against the stranger sessions (Rookie)

| track | band | stranger median attempts (sessions, src) | reflex average median (seeds) | ratio | stranger time to clear | reflex time to clear | stranger deaths (top) | reflex deaths (top) |
|---|---|---|---|---:|---:|---:|---|---|
| b1-first-ride | 1–1 | 2 (7, d698717f/73762476/c83b6ca8/68e975a6) | 4 (2, 6, 4) | 2.00 | 57.0 s | 96.1 s | — | ground @ 575 m ×3; ground @ 90 m ×1; ground @ 110 m ×1 |
| b2-lean-back | 1–2 | 3.5 (4, 73762476/81ade223/68e975a6) | 8 (3, 19, 8) | 2.29 | 57.2 s | 118.1 s | — | ground @ 295 m ×3; ground @ 285 m ×2; ground @ 365 m ×2 |
| b3-kicker-row | 1–2 | 4.5 (6, 73762476/c83b6ca8/68e975a6/d39d492b) | 12 (9, 27, 12) | 2.67 | 62.3 s | 137.6 s | — | ground @ 325 m ×6; ramp @ 423.8 m ×5; ramp @ 334.8 m ×4 |
| e1-uphill-weight | 2–4 | 8 (6, 73762476/c83b6ca8/51d42b25/5394d725) | 31 (35, 15, 31) | 3.88 | 103.1 s | 191.5 s | — | ramp @ 211.0 m ×15; ground @ 215 m ×7; ramp @ 273.0 m ×7 |
