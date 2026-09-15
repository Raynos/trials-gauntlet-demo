# Reflex bot — skill novice / average / good, 3 seed(s), bikes rookie + pro, src db68bbeb, 2026-09-15T03:04:35.331Z, wall 94 s

attempts = 1 + faults (all reasons); cap 50; sim cap 300 s. Rookie = `<track>.reflex.json`, Pro = `<track>.pro.reflex.json`; the band is authored for the tier's default bike (average). Death sites: nearest placed obstacle (name @ x) with the rule the rider was executing.

## Rookie bike — skill novice, 3 seed(s) (9 on e2-rear-wheel-first, e3-stairway, m1-hop-up, m3-see-saw), physics bikePhysicsFactory-v2, src db68bbeb, 2026-09-15T03:04:35.331Z, wall 15 s

Reaction 230–280 ms, glances 20 Hz, pitch noise ±3°, speed noise ±7%, taps 100 ms, lapses every ~6 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 1, 1, 1 | 1 | 3/3 | 13.5 s | 100% | — |
| gap-test | beginner | 1–3 | 1, 1, 4 | 1 | 3/3 | 7.7 s | 100% | ground @ 50 m ×2 (air-short); ground @ 40 m ×1 (air-short) |
| b1-first-ride | beginner | 1–1 | 1, 1, 5 | 1 | 3/3 | 64.5 s | 100% | ground @ 95 m ×2 (air-short); ground @ 85 m ×1 (nose-low); ground @ 100 m ×1 (air-short) |
| b2-lean-back | beginner | 1–2 | 2, 2, 2 | 2 | 3/3 | 71.0 s | 100% | ground @ 30 m ×1 (air-gas-nose-up); ground @ 35 m ×1 (air-short); ground @ 165 m ×1 (air-short) |
| b3-kicker-row | beginner | 1–2 | 11, 8, 3 | 8 | 3/3 | 103.0 s | 100% | ground @ 355 m ×3 (air-short); ramp @ 423.8 m ×3 (air-short); ramp @ 334.8 m ×2 (air-short) |
| e1-uphill-weight | easy | 2–4 | 20, 5, 17 | 17 | 3/3 | 211.6 s | 100% | ramp @ 309.7 m ×4 (air-short); ground @ 320 m ×3 (air-short); ground @ 345 m ×3 (air-short) |
| e2-rear-wheel-first | easy | 3–5 | 15, 9, 25, 34, 15, 18, 11, 16, 26 | 16 | 8/9 | 191.2 s | 100% | ramp @ 191.2 m ×21 (air-short); box @ 505.4 m ×20 (air-short); box @ 183.2 m ×12 (air-short) |
| e3-stairway | easy | 3–6 | 1, 1, 1, 2, 3, 3, 1, 2, 1 | 1 | 9/9 | 63.9 s | 100% | ramp @ 178.8 m ×1 (nose-high); box @ 255.6 m ×1 (air-short); ground @ 385 m ×1 (nose-low) |
| m1-hop-up | medium | 5–9 | 25, 12, 12, 4, 7, 11, 12, 9, 10 | 11 | 9/9 | 119.5 s | 100% | ledge @ 109.0 m ×43 (stuck-restart); ledge @ 272.3 m ×17 (nose-low); ledge @ 280.3 m ×9 (nose-high) |
| m2-drum-roll | medium | 6–12 | 10, 4, 9 | 9 | 3/3 | 124.4 s | 100% | ramp @ 431.4 m ×8 (air-short); ramp @ 422.4 m ×4 (air-short); ramp @ 412.4 m ×3 (air-gas-nose-up) |
| m3-see-saw | medium | 8–12 | 32, 11, 36, 34, 34, 33, 32, 34, 34 | 34 | 1/9 | 133.4 s | 100% | ground @ 410 m ×79 (air-short); ramp @ 421.4 m ×32 (nose-high); ramp @ 202.6 m ×22 (air-short) |
| h1-wheelie-wire | hard | 10–18 | 37, 38, 40 | 38 | 0/3 | — | 92% | wall @ 175.8 m ×24 (air-short); wall @ 531.2 m ×20 (air-short); gap @ 538.2 m ×15 (air-short) |
| h2-gap-chain | hard | 14–22 | 40, 43, 39 | 40 | 0/3 | — | 44% | ramp @ 265.8 m ×20 (air-gas-nose-up); ramp @ 62.0 m ×18 (air-gas-nose-up); box @ 65.0 m ×16 (air-short) |
| h3-fire-line | hard | 18–25 | 32, 27, 7 | 27 | 2/3 | 195.3 s | 100% | ledge @ 389.6 m ×13 (air-short); ledge @ 252.8 m ×7 (nose-low); gap @ 489.2 m ×7 (nose-low) |
| x1-vertical-limit | extreme | 30–45 | 27, 28, 28 | 28 | 0/3 | — | 53% | ramp @ 227.9 m ×46 (stuck-restart); plank @ 230.3 m ×18 (stuck-restart); ramp @ 390.6 m ×8 (air-short) |
| x2-pipe-dream | extreme | 40–60 | 43, 43, 41 | 43 | 0/3 | — | 72% | drum @ 370.0 m ×34 (air-gas-nose-up); drum @ 366.7 m ×24 (air-short); ramp @ 74.6 m ×11 (air-short) |
| x3-gauntlet | extreme | 60–80 | 35, 43, 40 | 40 | 0/3 | — | 58% | ledge @ 189.0 m ×25 (nose-low); ground @ 265 m ×20 (air-short); gap @ 193.0 m ×14 (air-gas-nose-up) |
| lab-physics-test | medium | 3–8 | 2, 1, 1 | 1 | 3/3 | 11.6 s | 100% | ground @ 65 m ×1 (air-short) |
| lab-flat-200 | beginner | 1–1 | 1, 1, 1 | 1 | 3/3 | 21.2 s | 100% | — |

## Rookie bike — skill average, 3 seed(s) (9 on e2-rear-wheel-first, e3-stairway, m1-hop-up, m3-see-saw), physics bikePhysicsFactory-v2, src db68bbeb, 2026-09-15T03:04:50.406Z, wall 14 s

Reaction 180–220 ms, glances 25 Hz, pitch noise ±2°, speed noise ±5%, taps 80 ms, lapses every ~10 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 1, 1, 1 | 1 | 3/3 | 11.4 s | 100% | — |
| gap-test | beginner | 1–3 | 1, 2, 2 | 2 | 3/3 | 11.1 s | 100% | ground @ 40 m ×1 (air-short); ground @ 50 m ×1 (nose-low) |
| b1-first-ride | beginner | 1–1 | 1, 1, 1 | 1 | 3/3 | 56.7 s | 100% | — |
| b2-lean-back | beginner | 1–2 | 2, 2, 1 | 2 | 3/3 | 65.3 s | 100% | ground @ 155 m ×1 (air-short); ground @ 575 m ×1 (air-short) |
| b3-kicker-row | beginner | 1–2 | 3, 4, 6 | 4 | 3/3 | 67.9 s | 100% | ground @ 355 m ×2 (nose-high); ramp @ 409.8 m ×2 (air-gas-nose-up); ramp @ 423.8 m ×2 (air-short) |
| e1-uphill-weight | easy | 2–4 | 6, 10, 8 | 8 | 3/3 | 102.8 s | 100% | ramp @ 449.9 m ×11 (air-short); ramp @ 75.2 m ×2 (air-short); ground @ 80 m ×1 (air-short) |
| e2-rear-wheel-first | easy | 3–5 | 8, 24, 17, 1, 5, 10, 6, 5, 21 | 8 | 9/9 | 111.7 s | 100% | ramp @ 191.2 m ×16 (air-short); box @ 505.4 m ×13 (air-short); box @ 72.0 m ×9 (air-short) |
| e3-stairway | easy | 3–6 | 3, 2, 1, 4, 3, 2, 1, 3, 1 | 2 | 9/9 | 64.1 s | 100% | box @ 424.5 m ×2 (nose-low); ramp @ 428.5 m ×2 (air-short); stair @ 31.0 m ×1 (air-short) |
| m1-hop-up | medium | 5–9 | 10, 6, 10, 6, 13, 9, 5, 7, 8 | 8 | 9/9 | 89.4 s | 100% | ledge @ 109.0 m ×21 (nose-low); gap @ 113.0 m ×9 (air-short); ledge @ 272.3 m ×7 (nose-high) |
| m2-drum-roll | medium | 6–12 | 8, 6, 12 | 8 | 3/3 | 100.4 s | 100% | ramp @ 431.4 m ×8 (air-short); ramp @ 328.8 m ×4 (air-short); ramp @ 311.2 m ×3 (air-short) |
| m3-see-saw | medium | 8–12 | 28, 15, 36, 25, 36, 22, 38, 37, 34 | 34 | 5/9 | 230.2 s | 100% | ground @ 410 m ×67 (air-short); ramp @ 421.4 m ×34 (air-short); box @ 438.9 m ×24 (air-gas-nose-up) |
| h1-wheelie-wire | hard | 10–18 | 51, 51, 37 | 51 | 0/3 | — | 92% | wall @ 175.8 m ×71 (nose-low); ramp @ 172.8 m ×25 (air-short); wall @ 531.2 m ×9 (air-short) |
| h2-gap-chain | hard | 14–22 | 39, 38, 41 | 39 | 0/3 | — | 71% | ramp @ 275.8 m ×24 (air-gas-nose-up); ramp @ 265.8 m ×20 (air-gas-nose-up); ramp @ 73.0 m ×12 (air-gas-nose-up) |
| h3-fire-line | hard | 18–25 | 24, 22, 14 | 22 | 3/3 | 222.3 s | 100% | gap @ 489.2 m ×23 (air-short); ledge @ 389.6 m ×10 (air-short); ledge @ 494.2 m ×9 (air-short) |
| x1-vertical-limit | extreme | 30–45 | 29, 30, 29 | 29 | 0/3 | — | 71% | ramp @ 390.6 m ×22 (launch); plank @ 393.0 m ×17 (air-short); plank @ 230.3 m ×11 (stuck-restart) |
| x2-pipe-dream | extreme | 40–60 | 50, 47, 34 | 47 | 0/3 | — | 86% | drum @ 370.0 m ×67 (hop-preload); drum @ 373.3 m ×11 (air-gas-nose-up); gap @ 441.9 m ×11 (air-short) |
| x3-gauntlet | extreme | 60–80 | 26, 44, 34 | 34 | 0/3 | — | 57% | ramp @ 60.2 m ×25 (air-short); ledge @ 189.0 m ×17 (nose-low); gap @ 193.0 m ×8 (air-gas-nose-up) |
| lab-physics-test | medium | 3–8 | 1, 1, 1 | 1 | 3/3 | 9.8 s | 100% | — |
| lab-flat-200 | beginner | 1–1 | 1, 1, 1 | 1 | 3/3 | 18.0 s | 100% | — |

## Rookie bike — skill good, 3 seed(s) (9 on e2-rear-wheel-first, e3-stairway, m1-hop-up, m3-see-saw), physics bikePhysicsFactory-v2, src db68bbeb, 2026-09-15T03:05:04.823Z, wall 11 s

Reaction 150–170 ms, glances 30 Hz, pitch noise ±1.5°, speed noise ±4%, taps 70 ms, lapses every ~20 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 1, 1, 1 | 1 | 3/3 | 10.2 s | 100% | — |
| gap-test | beginner | 1–3 | 1, 1, 1 | 1 | 3/3 | 6.6 s | 100% | — |
| b1-first-ride | beginner | 1–1 | 1, 1, 1 | 1 | 3/3 | 50.9 s | 100% | — |
| b2-lean-back | beginner | 1–2 | 1, 3, 1 | 1 | 3/3 | 51.3 s | 100% | ground @ 35 m ×2 (nose-low) |
| b3-kicker-row | beginner | 1–2 | 1, 3, 5 | 3 | 3/3 | 64.5 s | 100% | ramp @ 409.8 m ×2 (air-short); ramp @ 423.8 m ×2 (air-short); ground @ 105 m ×1 (air-short) |
| e1-uphill-weight | easy | 2–4 | 16, 15, 16 | 16 | 3/3 | 167.7 s | 100% | ramp @ 211.0 m ×11 (air-short); ramp @ 449.9 m ×11 (air-short); ground @ 215 m ×3 (air-short) |
| e2-rear-wheel-first | easy | 3–5 | 7, 6, 4, 8, 6, 12, 26, 7, 4 | 7 | 9/9 | 102.8 s | 100% | ramp @ 191.2 m ×27 (nose-high); ramp @ 76.0 m ×6 (air-short); box @ 183.2 m ×6 (nose-high) |
| e3-stairway | easy | 3–6 | 3, 6, 3, 1, 2, 2, 1, 2, 8 | 2 | 9/9 | 59.3 s | 100% | box @ 424.5 m ×4 (air-short); ramp @ 420.5 m ×3 (air-short); ground @ 270 m ×2 (nose-high) |
| m1-hop-up | medium | 5–9 | 11, 6, 7, 10, 5, 5, 10, 6, 6 | 6 | 9/9 | 82.7 s | 100% | ledge @ 109.0 m ×12 (stuck-restart); ramp @ 27.0 m ×9 (air-short); ledge @ 280.3 m ×9 (nose-high) |
| m2-drum-roll | medium | 6–12 | 16, 6, 16 | 16 | 3/3 | 153.6 s | 100% | ramp @ 311.2 m ×6 (air-short); ramp @ 188.2 m ×4 (air-short); drum @ 53.2 m ×3 (air-short) |
| m3-see-saw | medium | 8–12 | 18, 38, 21, 10, 22, 14, 37, 11, 8 | 18 | 7/9 | 154.8 s | 100% | ground @ 410 m ×40 (touchdown); ramp @ 421.4 m ×20 (nose-high); ground @ 190 m ×14 (touchdown) |
| h1-wheelie-wire | hard | 10–18 | 47, 47, 51 | 47 | 0/3 | — | 92% | wall @ 531.2 m ×50 (air-short); wall @ 175.8 m ×40 (air-short); gap @ 538.2 m ×28 (nose-low) |
| h2-gap-chain | hard | 14–22 | 40, 41, 40 | 40 | 0/3 | — | 71% | ramp @ 265.8 m ×32 (air-gas-nose-up); ramp @ 275.8 m ×22 (air-gas-nose-up); ramp @ 437.6 m ×19 (air-gas-nose-up) |
| h3-fire-line | hard | 18–25 | 16, 34, 7 | 16 | 2/3 | 139.3 s | 100% | gap @ 489.2 m ×17 (air-short); ledge @ 494.2 m ×10 (nose-low); ground @ 260 m ×6 (air-short) |
| x1-vertical-limit | extreme | 30–45 | 30, 31, 32 | 31 | 0/3 | — | 53% | ramp @ 227.9 m ×23 (launch); ramp @ 390.6 m ×15 (launch); ramp @ 50.1 m ×10 (air-short) |
| x2-pipe-dream | extreme | 40–60 | 48, 47, 51 | 48 | 0/3 | — | 73% | drum @ 370.0 m ×72 (air-brake-nose-down); drum @ 373.3 m ×45 (air-gas-nose-up); gap @ 371.8 m ×8 (air-brake-nose-down) |
| x3-gauntlet | extreme | 60–80 | 37, 33, 40 | 37 | 0/3 | — | 58% | ground @ 265 m ×18 (air-short); wall @ 284.1 m ×16 (air-gas-nose-up); ramp @ 60.2 m ×14 (air-short) |
| lab-physics-test | medium | 3–8 | 1, 1, 1 | 1 | 3/3 | 9.0 s | 100% | — |
| lab-flat-200 | beginner | 1–1 | 1, 1, 1 | 1 | 3/3 | 15.9 s | 100% | — |

## Pro bike — skill novice, 3 seed(s) (9 on e2-rear-wheel-first, e3-stairway, m1-hop-up, m3-see-saw), physics bikePhysicsFactory-v2, src db68bbeb, 2026-09-15T03:05:15.791Z, wall 17 s

Reaction 230–280 ms, glances 20 Hz, pitch noise ±3°, speed noise ±7%, taps 100 ms, lapses every ~6 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 1, 4, 2 | 2 | 3/3 | 17.0 s | 100% | ground @ 10 m ×2 (air-short); ground @ 5 m ×1 (air-short); ground @ 25 m ×1 (air-short) |
| gap-test | beginner | 1–3 | 2, 5, 5 | 5 | 3/3 | 20.1 s | 100% | ground @ 10 m ×2 (air-short); ground @ 15 m ×2 (air-short); ramp @ 30.0 m ×2 (air-short) |
| b1-first-ride | beginner | 1–1 | 9, 2, 2 | 2 | 3/3 | 79.2 s | 100% | ground @ 15 m ×2 (air-short); ground @ 5 m ×1 (nose-high); ground @ 10 m ×1 (air-short) |
| b2-lean-back | beginner | 1–2 | 8, 10, 24 | 10 | 3/3 | 146.4 s | 100% | box @ 411.2 m ×4 (nose-high); ground @ 5 m ×3 (nose-high); ramp @ 114.6 m ×3 (air-short) |
| b3-kicker-row | beginner | 1–2 | 25, 42, 15 | 25 | 2/3 | 162.9 s | 100% | box @ 415.8 m ×8 (air-short); ramp @ 334.8 m ×7 (nose-high); ramp @ 314.8 m ×5 (nose-high) |
| e1-uphill-weight | easy | 2–4 | 40, 43, 35 | 40 | 0/3 | — | 52% | ramp @ 211.0 m ×18 (air-short); ground @ 215 m ×11 (air-short); plank @ 62.0 m ×7 (air-short) |
| e2-rear-wheel-first | easy | 3–5 | 40, 39, 38, 39, 38, 37, 44, 41, 40 | 39 | 1/9 | 281.7 s | 100% | ramp @ 57.0 m ×39 (air-short); box @ 183.2 m ×29 (air-short); box @ 72.0 m ×27 (air-short) |
| e3-stairway | easy | 3–6 | 21, 33, 25, 39, 23, 32, 21, 35, 34 | 32 | 8/9 | 246.1 s | 100% | stair @ 151.2 m ×20 (air-short); stair @ 400.2 m ×17 (air-short); stair @ 250.8 m ×13 (air-short) |
| m1-hop-up | medium | 5–9 | 36, 51, 13, 34, 51, 16, 41, 15, 48 | 36 | 5/9 | 128.8 s | 100% | ledge @ 109.0 m ×120 (nose-high); gap @ 113.0 m ×30 (air-short); ledge @ 21.0 m ×14 (air-gas-nose-up) |
| m2-drum-roll | medium | 6–12 | 45, 43, 44 | 44 | 0/3 | — | 92% | ramp @ 311.2 m ×14 (air-short); drum @ 40.0 m ×10 (air-short); drum @ 47.6 m ×10 (air-short) |
| m3-see-saw | medium | 8–12 | 44, 43, 43, 42, 48, 44, 47, 45, 41 | 44 | 0/9 | — | 88% | ramp @ 45.8 m ×46 (air-short); ramp @ 335.6 m ×32 (air-short); ramp @ 202.6 m ×27 (air-short) |
| h1-wheelie-wire | hard | 10–18 | 43, 47, 49 | 47 | 0/3 | — | 60% | wall @ 175.8 m ×38 (air-short); gap @ 184.8 m ×28 (air-short); ramp @ 172.8 m ×22 (air-short) |
| h2-gap-chain | hard | 14–22 | 40, 46, 48 | 46 | 0/3 | — | 21% | ramp @ 62.0 m ×31 (air-gas-nose-up); ramp @ 73.0 m ×24 (air-gas-nose-up); box @ 54.0 m ×13 (air-short) |
| h3-fire-line | hard | 18–25 | 43, 46, 46 | 46 | 0/3 | — | 73% | ramp @ 236.8 m ×29 (air-short); ledge @ 252.8 m ×22 (nose-low); ground @ 35 m ×9 (air-short) |
| x1-vertical-limit | extreme | 30–45 | 42, 40, 35 | 40 | 0/3 | — | 53% | ramp @ 227.9 m ×21 (stuck-restart); ground @ 200 m ×15 (air-short); plank @ 230.3 m ×14 (stuck-restart) |
| x2-pipe-dream | extreme | 40–60 | 43, 40, 38 | 40 | 0/3 | — | 72% | ramp @ 74.6 m ×24 (air-short); ramp @ 62.6 m ×16 (air-short); box @ 230.8 m ×9 (air-short) |
| x3-gauntlet | extreme | 60–80 | 41, 37, 38 | 38 | 0/3 | — | 40% | ramp @ 60.2 m ×33 (air-short); box @ 52.2 m ×12 (air-short); box @ 72.2 m ×8 (nose-high) |
| lab-physics-test | medium | 3–8 | 7, 1, 8 | 7 | 3/3 | 39.1 s | 100% | ground @ 10 m ×2 (air-short); ground @ 15 m ×2 (nose-high); ramp @ 40.0 m ×2 (air-short) |
| lab-flat-200 | beginner | 1–1 | 2, 3, 2 | 2 | 3/3 | 25.3 s | 100% | ground @ 10 m ×2 (nose-high); ground @ 5 m ×1 (nose-high); ground @ 115 m ×1 (nose-high) |

## Pro bike — skill average, 3 seed(s) (9 on e2-rear-wheel-first, e3-stairway, m1-hop-up, m3-see-saw), physics bikePhysicsFactory-v2, src db68bbeb, 2026-09-15T03:05:33.117Z, wall 21 s

Reaction 180–220 ms, glances 25 Hz, pitch noise ±2°, speed noise ±5%, taps 80 ms, lapses every ~10 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 2, 2, 2 | 2 | 3/3 | 14.2 s | 100% | ground @ 10 m ×3 (air-short) |
| gap-test | beginner | 1–3 | 2, 7, 4 | 4 | 3/3 | 17.9 s | 100% | ramp @ 30.0 m ×4 (air-short); ground @ 10 m ×3 (air-short); gap @ 34.0 m ×1 (air-short) |
| b1-first-ride | beginner | 1–1 | 2, 8, 2 | 2 | 3/3 | 59.2 s | 100% | ground @ 10 m ×4 (nose-high); ground @ 75 m ×1 (nose-high); ground @ 85 m ×1 (touchdown) |
| b2-lean-back | beginner | 1–2 | 7, 6, 9 | 7 | 3/3 | 85.9 s | 100% | drum @ 18.0 m ×3 (nose-high); box @ 271.8 m ×3 (nose-high); ground @ 10 m ×2 (nose-high) |
| b3-kicker-row | beginner | 1–2 | 9, 12, 16 | 12 | 3/3 | 106.0 s | 100% | ramp @ 423.8 m ×6 (air-short); box @ 415.8 m ×4 (air-short); ground @ 10 m ×3 (nose-high) |
| e1-uphill-weight | easy | 2–4 | 33, 44, 36 | 36 | 0/3 | — | 92% | ramp @ 75.2 m ×10 (air-short); plank @ 62.0 m ×9 (air-short); ramp @ 449.9 m ×8 (air-short) |
| e2-rear-wheel-first | easy | 3–5 | 33, 37, 34, 24, 28, 27, 36, 29, 25 | 29 | 8/9 | 243.3 s | 100% | ramp @ 191.2 m ×22 (air-short); box @ 505.4 m ×17 (air-short); box @ 72.0 m ×16 (air-short) |
| e3-stairway | easy | 3–6 | 12, 19, 19, 15, 10, 17, 10, 25, 13 | 15 | 9/9 | 132.6 s | 100% | stair @ 151.2 m ×16 (nose-high); stair @ 400.2 m ×11 (nose-high); gap @ 419.0 m ×9 (air-short) |
| m1-hop-up | medium | 5–9 | 26, 26, 26, 37, 22, 51, 42, 30, 22 | 26 | 8/9 | 190.4 s | 100% | ledge @ 109.0 m ×77 (air-short); gap @ 113.0 m ×32 (air-gas-nose-up); ledge @ 280.3 m ×14 (air-short) |
| m2-drum-roll | medium | 6–12 | 24, 48, 38 | 38 | 1/3 | 190.5 s | 100% | drum @ 47.6 m ×16 (air-short); ramp @ 431.4 m ×16 (air-short); drum @ 53.2 m ×14 (air-short) |
| m3-see-saw | medium | 8–12 | 43, 24, 42, 40, 39, 43, 41, 32, 45 | 41 | 3/9 | 250.6 s | 100% | ground @ 410 m ×42 (air-short); ramp @ 45.8 m ×33 (air-short); ramp @ 202.6 m ×29 (air-short) |
| h1-wheelie-wire | hard | 10–18 | 51, 46, 51 | 51 | 0/3 | — | 67% | wall @ 175.8 m ×71 (air-short); ramp @ 172.8 m ×25 (nose-high); gap @ 356.0 m ×16 (air-short) |
| h2-gap-chain | hard | 14–22 | 45, 48, 45 | 45 | 0/3 | — | 45% | ramp @ 265.8 m ×26 (air-gas-nose-up); ramp @ 246.8 m ×12 (nose-high); box @ 65.0 m ×10 (air-short) |
| h3-fire-line | hard | 18–25 | 41, 40, 40 | 40 | 0/3 | — | 90% | gap @ 489.2 m ×11 (air-short); ramp @ 236.8 m ×9 (air-short); ledge @ 252.8 m ×9 (stuck-restart) |
| x1-vertical-limit | extreme | 30–45 | 34, 38, 36 | 36 | 0/3 | — | 53% | ramp @ 227.9 m ×29 (stuck-restart); plank @ 230.3 m ×15 (air-short); ramp @ 50.1 m ×8 (air-short) |
| x2-pipe-dream | extreme | 40–60 | 43, 41, 39 | 41 | 0/3 | — | 72% | ramp @ 74.6 m ×21 (air-short); box @ 227.8 m ×13 (air-short); box @ 48.6 m ×10 (air-gas-nose-up) |
| x3-gauntlet | extreme | 60–80 | 46, 37, 48 | 46 | 0/3 | — | 58% | ledge @ 189.0 m ×19 (air-short); ramp @ 60.2 m ×18 (air-short); gap @ 193.0 m ×11 (air-short) |
| lab-physics-test | medium | 3–8 | 2, 2, 1 | 2 | 3/3 | 12.3 s | 100% | ground @ 5 m ×1 (air-short); ground @ 10 m ×1 (air-short) |
| lab-flat-200 | beginner | 1–1 | 2, 2, 2 | 2 | 3/3 | 20.7 s | 100% | ground @ 5 m ×2 (air-short); ground @ 10 m ×1 (air-short) |

## Pro bike — skill good, 3 seed(s) (9 on e2-rear-wheel-first, e3-stairway, m1-hop-up, m3-see-saw), physics bikePhysicsFactory-v2, src db68bbeb, 2026-09-15T03:05:53.722Z, wall 15 s

Reaction 150–170 ms, glances 30 Hz, pitch noise ±1.5°, speed noise ±4%, taps 70 ms, lapses every ~20 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 2, 2, 2 | 2 | 3/3 | 12.8 s | 100% | ground @ 10 m ×3 (nose-high) |
| gap-test | beginner | 1–3 | 2, 5, 2 | 2 | 3/3 | 10.1 s | 100% | ground @ 10 m ×2 (air-short); ramp @ 30.0 m ×2 (air-short); ground @ 5 m ×1 (nose-high) |
| b1-first-ride | beginner | 1–1 | 2, 2, 2 | 2 | 3/3 | 52.2 s | 100% | ground @ 10 m ×3 (air-short) |
| b2-lean-back | beginner | 1–2 | 5, 6, 12 | 6 | 3/3 | 74.3 s | 100% | box @ 271.8 m ×4 (nose-high); drum @ 18.0 m ×2 (nose-high); ground @ 265 m ×2 (air-short) |
| b3-kicker-row | beginner | 1–2 | 7, 10, 16 | 10 | 3/3 | 89.8 s | 100% | ramp @ 150.0 m ×4 (nose-high); ground @ 10 m ×3 (nose-high); ramp @ 314.8 m ×3 (nose-high) |
| e1-uphill-weight | easy | 2–4 | 35, 20, 24 | 24 | 3/3 | 174.5 s | 100% | ramp @ 300.0 m ×11 (nose-high); ramp @ 449.9 m ×9 (air-short); ramp @ 211.0 m ×6 (air-short) |
| e2-rear-wheel-first | easy | 3–5 | 33, 36, 17, 15, 33, 25, 36, 23, 33 | 33 | 8/9 | 232.1 s | 100% | ramp @ 191.2 m ×28 (air-short); box @ 505.4 m ×22 (air-short); box @ 183.2 m ×15 (air-short) |
| e3-stairway | easy | 3–6 | 7, 9, 7, 16, 13, 8, 11, 10, 12 | 10 | 9/9 | 97.3 s | 100% | stair @ 151.2 m ×12 (air-short); stair @ 250.8 m ×11 (nose-high); ground @ 10 m ×8 (air-short) |
| m1-hop-up | medium | 5–9 | 10, 23, 7, 20, 24, 26, 12, 16, 20 | 20 | 9/9 | 145.5 s | 100% | ledge @ 109.0 m ×20 (air-short); ledge @ 363.3 m ×12 (air-short); ramp @ 27.0 m ×10 (air-short) |
| m2-drum-roll | medium | 6–12 | 24, 33, 22 | 24 | 2/3 | 181.6 s | 100% | seesaw @ 432.2 m ×12 (air-short); ramp @ 431.4 m ×8 (touchdown); ramp @ 311.2 m ×6 (air-short) |
| m3-see-saw | medium | 8–12 | 33, 43, 40, 41, 45, 39, 30, 44, 44 | 41 | 2/9 | 238.0 s | 100% | ground @ 410 m ×43 (air-short); ramp @ 421.4 m ×33 (air-short); ramp @ 202.6 m ×31 (air-short) |
| h1-wheelie-wire | hard | 10–18 | 49, 50, 45 | 49 | 0/3 | — | 92% | gap @ 356.0 m ×38 (air-short); wall @ 348.0 m ×22 (nose-low); gap @ 538.2 m ×21 (nose-low) |
| h2-gap-chain | hard | 14–22 | 42, 45, 47 | 45 | 0/3 | — | 46% | ramp @ 73.0 m ×21 (air-gas-nose-up); ramp @ 62.0 m ×18 (air-gas-nose-up); box @ 65.0 m ×12 (air-short) |
| h3-fire-line | hard | 18–25 | 47, 41, 38 | 41 | 1/3 | 299.5 s | 100% | ramp @ 236.8 m ×20 (air-short); ledge @ 389.6 m ×19 (nose-low); ledge @ 252.8 m ×12 (air-short) |
| x1-vertical-limit | extreme | 30–45 | 38, 39, 34 | 38 | 0/3 | — | 54% | ramp @ 227.9 m ×20 (launch); plank @ 393.0 m ×18 (air-short); ramp @ 390.6 m ×11 (stuck-restart) |
| x2-pipe-dream | extreme | 40–60 | 43, 40, 41 | 41 | 0/3 | — | 73% | box @ 227.8 m ×22 (touchdown); box @ 230.8 m ×19 (air-short); drum @ 370.0 m ×12 (air-gas-nose-up) |
| x3-gauntlet | extreme | 60–80 | 48, 43, 45 | 45 | 0/3 | — | 58% | ramp @ 60.2 m ×55 (air-short); ground @ 265 m ×9 (air-short); ground @ 65 m ×8 (air-short) |
| lab-physics-test | medium | 3–8 | 2, 2, 2 | 2 | 3/3 | 11.5 s | 100% | ground @ 10 m ×3 (air-short) |
| lab-flat-200 | beginner | 1–1 | 2, 3, 2 | 2 | 3/3 | 18.5 s | 100% | ground @ 10 m ×3 (touchdown); ground @ 15 m ×1 (nose-high) |

## Calibration against the stranger sessions (Rookie)

| track | band | stranger median attempts (sessions, src) | reflex average median (seeds) | ratio | stranger time to clear | reflex time to clear | stranger deaths (top) | reflex deaths (top) |
|---|---|---|---|---:|---:|---:|---|---|
| b1-first-ride | 1–1 | 1 (2, 74f5de4d) | 1 (1, 1, 1) | 1.00 | 44.2 s | 56.7 s | — | — |
| b2-lean-back | 1–2 | 2 (2, 74f5de4d) | 2 (2, 2, 1) | 1.00 | 52.6 s | 65.3 s | ground ×2 | ground @ 155 m ×1; ground @ 575 m ×1 |
| b3-kicker-row | 1–2 | 3 (2, 74f5de4d) | 4 (3, 4, 6) | 1.33 | 52.3 s | 67.9 s | ground ×4 | ground @ 355 m ×2; ramp @ 409.8 m ×2; ramp @ 423.8 m ×2 |
| e1-uphill-weight | 2–4 | 8 (6, 73762476/c83b6ca8/51d42b25/5394d725) | 8 (6, 10, 8) | 1.00 | 103.1 s | 102.8 s | — | ramp @ 449.9 m ×11; ramp @ 75.2 m ×2; ground @ 80 m ×1 |
