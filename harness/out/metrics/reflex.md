# Reflex bot — skill average, 3 seed(s), physics bikePhysicsFactory, src e20969c7, 2026-09-14T13:17:45.308Z, wall 9 s

Reaction 180–220 ms, glances 25 Hz, pitch noise ±2°, speed noise ±5%, taps 80 ms, lapses every ~10 s. attempts = 1 + faults (all reasons); cap 50; sim cap 300 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 1, 1, 1 | 1 | 3/3 | 11.1 s | 100% | — |
| gap-test | beginner | 1–3 | 1, 1, 1 | 1 | 3/3 | 6.5 s | 100% | — |
| b1-first-ride | beginner | 1–1 | 1, 1, 1 | 1 | 3/3 | 55.0 s | 100% | — |
| b2-lean-back | beginner | 1–2 | 4, 8, 5 | 5 | 3/3 | 89.7 s | 100% | ramp @ 123.0 m ×3 (nose-low); ramp @ 45.0 m ×2 (air-gas-nose-up); ground @ 95 m ×1 (air-gas-nose-up) |
| b3-kicker-row | beginner | 1–2 | 2, 3, 3 | 3 | 3/3 | 65.7 s | 100% | ramp @ 58.0 m ×1 (air-brake-nose-down); ground @ 75 m ×1 (air-gas-nose-up); ramp @ 186.0 m ×1 (nose-high) |
| e1-uphill-weight | easy | 2–4 | 4, 1, 11 | 4 | 3/3 | 74.2 s | 100% | ramp @ 445.0 m ×9 (air-brake-nose-down); ground @ 80 m ×1 (air-gas-nose-up); ramp @ 308.8 m ×1 (air-brake-nose-down) |
| e2-rear-wheel-first | easy | 3–5 | 23, 45, 13 | 23 | 2/3 | 151.9 s | 100% | ground @ 415 m ×28 (air-gas-nose-up); box @ 149.0 m ×16 (air-gas-nose-up); box @ 401.0 m ×12 (air-gas-nose-up) |
| e3-stairway | easy | 3–6 | 51, 49, 50 | 50 | 0/3 | — | 28% | stair @ 100.5 m ×95 (stuck-restart); stair @ 44.0 m ×52 (steep-ahead) |
| m1-hop-up | medium | 5–9 | 40, 43, 42 | 42 | 0/3 | — | 79% | ledge @ 223.0 m ×67 (stuck-restart); ledge @ 285.0 m ×35 (cruise); ledge @ 21.0 m ×7 (stuck-restart) |
| m2-drum-roll | medium | 6–12 | 47, 9, 37 | 37 | 2/3 | 191.9 s | 100% | ramp @ 123.0 m ×38 (stuck-restart); ramp @ 303.9 m ×21 (stuck-restart); ramp @ 213.7 m ×8 (air-gas-nose-up) |
| m3-see-saw | medium | 8–12 | 40, 2, 45 | 40 | 0/3 | — | 88% | seesaw @ 336.2 m ×24 (climbing); ramp @ 160.4 m ×19 (nose-high); plank @ 167.4 m ×15 (air-gas-nose-up) |
| h1-wheelie-wire | hard | 10–18 | 50, 49, 45 | 49 | 0/3 | — | 29% | wall @ 138.0 m ×137 (stuck-restart); gap @ 61.0 m ×2 (air-gas-nose-up); gap @ 68.5 m ×2 (hop-snap) |
| h2-gap-chain | hard | 14–22 | 51, 51, 51 | 51 | 0/3 | — | 44% | box @ 60.0 m ×50 (air-gas-nose-up); box @ 52.0 m ×36 (climbing); box @ 197.5 m ×20 (air-gas-nose-up) |
| h3-fire-line | hard | 18–25 | 51, 51, 51 | 51 | 0/3 | — | 87% | barrel @ 57.0 m ×84 (air-level); ground @ 60 m ×15 (air-level); barrel @ 406.4 m ×15 (air-brake-nose-down) |
| x1-vertical-limit | extreme | 30–45 | 43, 40, 41 | 41 | 0/3 | — | 11% | ramp @ 44.0 m ×91 (stuck-restart); plank @ 45.2 m ×30 (stuck-restart) |
| x2-pipe-dream | extreme | 40–60 | 42, 49, 51 | 49 | 0/3 | — | 31% | ramp @ 47.6 m ×107 (nose-high); logpile @ 49.1 m ×17 (air-gas-nose-up); box @ 35.6 m ×10 (air-gas-nose-up) |
| x3-gauntlet | extreme | 60–80 | 31, 27, 35 | 31 | 0/3 | — | 22% | ramp @ 85.0 m ×21 (steep-ahead); plank @ 86.2 m ×17 (stuck-restart); box @ 54.0 m ×15 (air-gas-nose-up) |

## Calibration against the stranger sessions

| track | band | stranger median attempts (sessions, src) | reflex average median (seeds) | ratio | stranger time to clear | reflex time to clear | stranger deaths (top) | reflex deaths (top) |
|---|---|---|---|---:|---:|---:|---|---|
| b1-first-ride | 1–1 | 2 (5, d698717f/73762476/c83b6ca8) | 1 (1, 1, 1) | 0.50 | 54.8 s | 55.0 s | ground ×1 | — |
| b2-lean-back | 1–2 | 3 (2, 73762476) | 5 (4, 8, 5) | 1.67 | 49.0 s | 89.7 s | drum @ 36.0 m ×1; ramp @ 314.2 m ×1; ramp @ 322.2 m ×1 | ramp @ 123.0 m ×3; ramp @ 45.0 m ×2; ground @ 95 m ×1 |
| b3-kicker-row | 1–2 | 8 (4, 73762476/c83b6ca8) | 3 (2, 3, 3) | 0.38 | 77.8 s | 65.7 s | ground ×4; ramp @ 384.0 m ×1; ramp @ 178.0 m ×1 | ramp @ 58.0 m ×1; ground @ 75 m ×1; ramp @ 186.0 m ×1 |
| e1-uphill-weight | 2–4 | 8 (4, 73762476/c83b6ca8) | 4 (4, 1, 11) | 0.50 | 99.9 s | 74.2 s | ramp @ 445.0 m ×4; plank @ 436.0 m ×2; ground ×1 | ramp @ 445.0 m ×9; ground @ 80 m ×1; ramp @ 308.8 m ×1 |
