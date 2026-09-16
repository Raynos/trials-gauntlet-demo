# Reflex bot — skill average, 9 seed(s), bikes rookie, src 24a246e0, 2026-09-16T04:10:25.499Z, wall 3 s

attempts = 1 + faults (all reasons); cap 50; sim cap 300 s (extreme tier 1800 s). Rookie = `<track>.reflex.json`, Pro = `<track>.pro.reflex.json`; the band is authored for the tier's default bike (average). Death sites: nearest placed obstacle (name @ x) with the rule the rider was executing.

## Rookie bike — skill average, 9 seed(s), physics bikePhysicsFactory-v2, src 24a246e0, 2026-09-16T04:10:25.499Z, runs wall 34 s (16 workers)

Reaction 180–220 ms, glances 25 Hz, pitch noise ±2°, speed noise ±5%, taps 80 ms, lapses every ~10 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 1, 1, 1, 1, 1, 1, 1, 1, 1 | 1 | 9/9 | 11.5 s | 100% | — |
| gap-test | beginner | 1–3 | 1, 1, 1, 1, 1, 1, 1, 1, 1 | 1 | 9/9 | 7.0 s | 100% | — |
| b1-first-ride | beginner | 1–1 | 2, 1, 2, 1, 1, 1, 2, 1, 1 | 1 | 9/9 | 56.6 s | 100% | ground @ 90 m ×1 (air-short); ground @ 100 m ×1 (air-short); ground @ 565 m ×1 (air-short) |
| b2-lean-back | beginner | 1–2 | 2, 2, 1, 3, 7, 1, 1, 6, 5 | 2 | 9/9 | 62.8 s | 100% | ground @ 35 m ×6 (air-short); ground @ 250 m ×2 (nose-low); ground @ 580 m ×2 (air-short) |
| b3-kicker-row | beginner | 1–2 | 4, 1, 2, 4, 3, 3, 1, 1, 2 | 2 | 9/9 | 61.5 s | 100% | ramp @ 409.8 m ×3 (air-gas-nose-up); ground @ 325 m ×2 (touchdown); ground @ 85 m ×1 (air-short) |
| e1-uphill-weight | easy | 2–4 | 4, 7, 7, 2, 6, 5, 5, 7, 4 | 5 | 9/9 | 101.7 s | 100% | ramp @ 75.2 m ×7 (nose-low); ramp @ 149.2 m ×6 (air-short); ground @ 345 m ×3 (air-short) |
| e2-rear-wheel-first | easy | 3–5 | 3, 1, 1, 5, 3, 2, 5, 4, 2 | 3 | 9/9 | 85.5 s | 100% | ramp @ 57.0 m ×2 (nose-low); ramp @ 66.0 m ×2 (air-gas-nose-up); box @ 72.0 m ×2 (air-short) |
| e3-stairway | easy | 3–6 | 2, 1, 1, 3, 1, 3, 1, 2, 3 | 2 | 9/9 | 64.4 s | 100% | ground @ 230 m ×2 (nose-low); ground @ 65 m ×1 (air-short); ground @ 235 m ×1 (nose-low) |
| m1-hop-up | medium | 5–9 | 9, 8, 23, 7, 2, 19, 11, 16, 12 | 11 | 9/9 | 114.0 s | 100% | ledge @ 109.0 m ×62 (stuck-restart); ledge @ 272.3 m ×10 (nose-low); gap @ 113.0 m ×7 (climbing) |
| m2-drum-roll | medium | 6–12 | 9, 6, 10, 2, 1, 6, 8, 6, 3 | 6 | 9/9 | 98.6 s | 100% | drum @ 53.2 m ×9 (nose-low); ramp @ 431.4 m ×9 (launch); drum @ 58.8 m ×6 (air-short) |
| m3-see-saw | medium | 8–12 | 17, 1, 5, 4, 4, 2, 5, 3, 3 | 4 | 9/9 | 80.4 s | 100% | box @ 438.9 m ×9 (air-gas-nose-up); ground @ 230 m ×3 (air-short); ramp @ 430.4 m ×3 (climbing) |
| h1-wheelie-wire | hard | 10–18 | 16, 13, 2, 4, 17, 13, 14, 16, 19 | 14 | 9/9 | 161.2 s | 100% | gap @ 219.3 m ×8 (air-short); gap @ 515.0 m ×8 (air-short); gap @ 222.3 m ×7 (nose-high) |
| h2-gap-chain | hard | 14–22 | 8, 10, 6, 4, 13, 8, 5, 10, 4 | 8 | 9/9 | 122.3 s | 100% | ramp @ 591.6 m ×6 (climbing); ramp @ 446.6 m ×5 (air-gas-nose-up); ramp @ 76.0 m ×4 (air-short) |
| h3-fire-line | hard | 18–25 | 4, 2, 6, 3, 3, 2, 9, 7, 4 | 4 | 9/9 | 90.0 s | 100% | ledge @ 520.0 m ×14 (nose-low); arch @ 517.0 m ×6 (nose-low); ground @ 105 m ×2 (air-short) |
| x1-vertical-limit | extreme | 30–45 | 12, 9, 10, 9, 11, 5, 6, 4, 7 | 9 | 9/9 | 132.5 s | 100% | pole @ 114.3 m ×16 (air-gas-nose-up); ramp @ 104.1 m ×7 (air-short); pole @ 428.9 m ×7 (air-gas-nose-up) |
| x2-pipe-dream | extreme | 40–60 | 9, 7, 11, 5, 16, 6, 9, 12, 6 | 9 | 9/9 | 125.7 s | 100% | ledge @ 464.4 m ×27 (air-gas-nose-up); ramp @ 74.6 m ×13 (air-short); box @ 48.6 m ×5 (air-brake-nose-down) |
| x3-gauntlet | extreme | 60–80 | 7, 3, 7, 26, 30, 4, 10, 6, 19 | 7 | 9/9 | 127.3 s | 100% | ledge @ 192.9 m ×50 (stuck-restart); gap @ 312.5 m ×5 (air-short); ground @ 375 m ×5 (air-short) |
| p1-container-yard | beginner | 1–2 | 3, 1, 1, 11, 3, 2, 4, 2, 3 | 3 | 9/9 | 63.4 s | 100% | ground @ 130 m ×7 (nose-low); ground @ 135 m ×5 (nose-high); drum @ 125.0 m ×4 (air-short) |
| p2-canyon-run | beginner | 1–2 | 3, 3, 2, 2, 2, 3, 5, 2, 7 | 3 | 9/9 | 58.8 s | 100% | ground @ 205 m ×6 (air-short); ledge @ 234.0 m ×3 (nose-low); ground @ 100 m ×2 (nose-low) |
| p3-snow-line | beginner | 1–2 | 3, 2, 3, 2, 6, 1, 1, 1, 2 | 2 | 9/9 | 56.1 s | 100% | ground @ 130 m ×2 (air-short); ground @ 175 m ×2 (air-short); drum @ 222.4 m ×2 (air-short) |
| p4-night-circuit | beginner | 1–2 | 2, 4, 4, 1, 2, 1, 2, 1, 2 | 2 | 9/9 | 65.2 s | 100% | ground @ 225 m ×3 (nose-low); ledge @ 39.0 m ×1 (nose-low); ground @ 150 m ×1 (nose-high) |
| p5-foundry-floor | beginner | 1–2 | 1, 5, 1, 2, 2, 3, 2, 4, 3 | 2 | 9/9 | 56.5 s | 100% | ground @ 170 m ×4 (air-short); ground @ 175 m ×2 (nose-low); tunnel @ 210.0 m ×2 (nose-low) |
| lab-physics-test | medium | 3–8 | 1, 1, 2, 2, 1, 1, 2, 1, 1 | 1 | 9/9 | 9.9 s | 100% | ground @ 65 m ×2 (nose-high); ground @ 80 m ×1 (air-short) |
| lab-flat-200 | beginner | 1–1 | 1, 2, 1, 1, 1, 1, 1, 1, 1 | 1 | 9/9 | 18.3 s | 100% | ground @ 155 m ×1 (nose-low) |

## Calibration against the stranger sessions (Rookie)

| track | band | stranger median attempts (sessions, src) | reflex average median (seeds) | ratio | stranger time to clear | reflex time to clear | stranger deaths (top) | reflex deaths (top) |
|---|---|---|---|---:|---:|---:|---|---|
| b1-first-ride | 1–1 | 1 (18, d698717f/73762476/c83b6ca8/605a8174/2503f384/089e0885/24a246e0/68e975a6/3d5fd16f/74f5de4d) | 1 (2, 1, 2, 1, 1, 1, 2, 1, 1) | 1.00 | 45.0 s | 56.6 s | — | ground @ 90 m ×1; ground @ 100 m ×1; ground @ 565 m ×1 |
| b2-lean-back | 1–2 | 2 (15, 73762476/605a8174/2503f384/089e0885/24a246e0/81ade223/68e975a6/3d5fd16f/74f5de4d) | 2 (2, 2, 1, 3, 7, 1, 1, 6, 5) | 1.00 | 49.4 s | 62.8 s | — | ground @ 35 m ×6; ground @ 250 m ×2; ground @ 580 m ×2 |
| b3-kicker-row | 1–2 | 2 (17, 73762476/c83b6ca8/605a8174/2503f384/089e0885/24a246e0/68e975a6/d39d492b/3d5fd16f/74f5de4d) | 2 (4, 1, 2, 4, 3, 3, 1, 1, 2) | 1.00 | 45.7 s | 61.5 s | ramp @ 334.8 m ×1 | ramp @ 409.8 m ×3; ground @ 325 m ×2; ground @ 85 m ×1 |
| e1-uphill-weight | 2–4 | 5 (15, 73762476/c83b6ca8/605a8174/2503f384/089e0885/24a246e0/51d42b25/5394d725/3d5fd16f) | 5 (4, 7, 7, 2, 6, 5, 5, 7, 4) | 1.00 | 66.8 s | 101.7 s | ground ×2; plank @ 436.5 m ×1 | ramp @ 75.2 m ×7; ramp @ 149.2 m ×6; ground @ 345 m ×3 |
