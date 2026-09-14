# Reflex bot — skill average, 2 seed(s), physics bikePhysicsFactory, src 52950b2d, 2026-09-14T14:01:12.651Z, wall 3 s

Reaction 180–220 ms, glances 25 Hz, pitch noise ±2°, speed noise ±5%, taps 80 ms, lapses every ~10 s. attempts = 1 + faults (all reasons); cap 50; sim cap 300 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 1, 1 | 1 | 2/2 | 11.2 s | 100% | — |
| gap-test | beginner | 1–3 | 1, 1 | 1 | 2/2 | 6.8 s | 100% | — |
| b1-first-ride | beginner | 1–1 | 1, 1 | 1 | 2/2 | 55.8 s | 100% | — |
| b2-lean-back | beginner | 1–2 | 1, 2 | 1.5 | 2/2 | 63.0 s | 100% | ground @ 45 m ×1 (air-brake-nose-down) |
| b3-kicker-row | beginner | 1–2 | 2, 2 | 2 | 2/2 | 55.9 s | 100% | box @ 368.0 m ×2 (air-gas-nose-up) |
| e1-uphill-weight | easy | 2–4 | 1, 1 | 1 | 2/2 | 61.3 s | 100% | — |
| e2-rear-wheel-first | easy | 3–5 | 3, 5 | 4 | 2/2 | 90.2 s | 100% | ramp @ 66.0 m ×2 (air-gas-nose-up); ramp @ 57.0 m ×1 (air-gas-nose-up); ramp @ 265.2 m ×1 (nose-high) |
| e3-stairway | easy | 3–6 | 3, 4 | 3.5 | 2/2 | 71.2 s | 100% | stair @ 402.3 m ×2 (air-brake-nose-down); ground @ 85 m ×1 (air-gas-nose-up); stair @ 164.2 m ×1 (air-gas-nose-up) |
| m1-hop-up | medium | 5–9 | 8, 14 | 11 | 2/2 | 137.4 s | 100% | ledge @ 309.3 m ×4 (nose-high); ledge @ 21.0 m ×3 (nose-high); ledge @ 119.0 m ×2 (stuck-restart) |
| m2-drum-roll | medium | 6–12 | 10, 3 | 6.5 | 2/2 | 98.1 s | 100% | ramp @ 430.8 m ×3 (air-brake-nose-down); ramp @ 422.4 m ×2 (air-brake-nose-down); logpile @ 425.4 m ×2 (nose-high) |
| m3-see-saw | medium | 8–12 | 4, 11 | 7.5 | 2/2 | 111.8 s | 100% | ramp @ 406.4 m ×2 (air-brake-nose-down); plank @ 414.4 m ×2 (cruise); box @ 420.9 m ×2 (drop-ahead-lean-back) |
| h1-wheelie-wire | hard | 10–18 | 38, 42 | 40 | 0/2 | — | 92% | wall @ 175.8 m ×25 (nose-high); wall @ 530.2 m ×18 (stuck-restart); ramp @ 172.8 m ×12 (stuck-restart) |
| h2-gap-chain | hard | 14–22 | 48, 46 | 47 | 0/2 | — | 48% | ramp @ 265.8 m ×41 (air-gas-nose-up); ramp @ 255.8 m ×14 (air-gas-nose-up); ramp @ 275.8 m ×14 (air-gas-nose-up) |
| h3-fire-line | hard | 18–25 | 13, 5 | 9 | 2/2 | 113.2 s | 100% | gap @ 489.2 m ×5 (hop-preload); ground @ 470 m ×4 (air-brake-nose-down); barrel @ 460.6 m ×2 (hop-preload) |
| x1-vertical-limit | extreme | 30–45 | 43, 40 | 41.5 | 0/2 | — | 13% | ramp @ 44.0 m ×59 (stuck-restart); plank @ 45.2 m ×19 (air-brake-nose-down); ramp @ 52.1 m ×1 (air-brake-nose-down) |
| x2-pipe-dream | extreme | 40–60 | 51, 46 | 48.5 | 0/2 | — | 72% | drum @ 366.1 m ×46 (air-gas-nose-up); drum @ 369.4 m ×18 (air-gas-nose-up); drum @ 250.7 m ×11 (air-gas-nose-up) |
| x3-gauntlet | extreme | 60–80 | 38, 28 | 33 | 0/2 | — | 62% | ramp @ 464.7 m ×21 (air-gas-nose-up); ramp @ 455.2 m ×5 (air-gas-nose-up); plank @ 376.0 m ×4 (air-level) |

## Calibration against the stranger sessions

| track | band | stranger median attempts (sessions, src) | reflex average median (seeds) | ratio | stranger time to clear | reflex time to clear | stranger deaths (top) | reflex deaths (top) |
|---|---|---|---|---:|---:|---:|---|---|
| b1-first-ride | 1–1 | 2 (5, d698717f/73762476/c83b6ca8) | 1 (1, 1) | 0.50 | 54.8 s | 55.8 s | ground ×1 | — |
| b2-lean-back | 1–2 | 3 (2, 73762476) | 1.5 (1, 2) | 0.50 | 49.0 s | 63.0 s | drum @ 36.0 m ×1; ramp @ 314.2 m ×1; ramp @ 322.2 m ×1 | ground @ 45 m ×1 |
| b3-kicker-row | 1–2 | 8 (4, 73762476/c83b6ca8) | 2 (2, 2) | 0.25 | 77.8 s | 55.9 s | ground ×4; ramp @ 384.0 m ×1; ramp @ 178.0 m ×1 | box @ 368.0 m ×2 |
| e1-uphill-weight | 2–4 | 8 (4, 73762476/c83b6ca8) | 1 (1, 1) | 0.13 | 99.9 s | 61.3 s | ramp @ 445.0 m ×4; plank @ 436.0 m ×2; ground ×1 | — |
