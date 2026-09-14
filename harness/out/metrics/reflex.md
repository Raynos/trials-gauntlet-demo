# Reflex bot — skill average, 3 seed(s), physics bikePhysicsFactory, src 9d316566, 2026-09-14T16:25:46.450Z, wall 5 s

Reaction 180–220 ms, glances 25 Hz, pitch noise ±2°, speed noise ±5%, taps 80 ms, lapses every ~10 s. attempts = 1 + faults (all reasons); cap 50; sim cap 300 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 1, 1, 1 | 1 | 3/3 | 11.1 s | 100% | — |
| gap-test | beginner | 1–3 | 1, 1, 1 | 1 | 3/3 | 6.6 s | 100% | — |
| b1-first-ride | beginner | 1–1 | 1, 1, 1 | 1 | 3/3 | 55.3 s | 100% | — |
| b2-lean-back | beginner | 1–2 | 1, 2, 2 | 2 | 3/3 | 65.9 s | 100% | ground @ 45 m ×1 (air-brake-nose-down); ground @ 450 m ×1 (nose-high) |
| b3-kicker-row | beginner | 1–2 | 2, 3, 2 | 2 | 3/3 | 64.5 s | 100% | ground @ 240 m ×1 (nose-low); gap @ 305.8 m ×1 (air-gas-nose-up); gap @ 325.8 m ×1 (drop-ahead-lean-back) |
| e1-uphill-weight | easy | 2–4 | 1, 1, 2 | 1 | 3/3 | 61.5 s | 100% | ramp @ 445.0 m ×1 (air-brake-nose-down) |
| e2-rear-wheel-first | easy | 3–5 | 3, 5, 1 | 3 | 3/3 | 88.8 s | 100% | ramp @ 66.0 m ×2 (air-gas-nose-up); ramp @ 57.0 m ×1 (air-gas-nose-up); ramp @ 265.2 m ×1 (nose-high) |
| e3-stairway | easy | 3–6 | 3, 4, 9 | 4 | 3/3 | 73.8 s | 100% | stair @ 164.2 m ×6 (air-brake-nose-down); gap @ 418.4 m ×3 (nose-high); stair @ 402.3 m ×2 (air-brake-nose-down) |
| m1-hop-up | medium | 5–9 | 9, 14, 10 | 10 | 3/3 | 114.5 s | 100% | ledge @ 309.3 m ×6 (nose-high); ledge @ 21.0 m ×4 (nose-high); ledge @ 280.3 m ×4 (air-brake-nose-down) |
| m2-drum-roll | medium | 6–12 | 10, 3, 7 | 7 | 3/3 | 94.6 s | 100% | ramp @ 311.2 m ×4 (nose-low); logpile @ 425.4 m ×3 (nose-high); ramp @ 430.8 m ×3 (air-brake-nose-down) |
| m3-see-saw | medium | 8–12 | 25, 6, 8 | 8 | 3/3 | 106.1 s | 100% | box @ 423.9 m ×7 (air-gas-nose-up); ramp @ 416.4 m ×6 (air-level); seesaw @ 390.4 m ×3 (climbing) |
| h1-wheelie-wire | hard | 10–18 | 38, 42, 41 | 41 | 0/3 | — | 92% | wall @ 175.8 m ×47 (stuck-restart); ramp @ 172.8 m ×28 (stuck-restart); wall @ 530.2 m ×18 (stuck-restart) |
| h2-gap-chain | hard | 14–22 | 48, 46, 45 | 46 | 0/3 | — | 69% | ramp @ 265.8 m ×43 (air-gas-nose-up); ramp @ 275.8 m ×19 (air-gas-nose-up); ramp @ 427.6 m ×18 (air-gas-nose-up) |
| h3-fire-line | hard | 18–25 | 13, 5, 31 | 13 | 3/3 | 139.2 s | 100% | gap @ 489.2 m ×10 (hop-preload); ramp @ 467.2 m ×6 (air-brake-nose-down); ground @ 470 m ×6 (air-brake-nose-down) |
| x1-vertical-limit | extreme | 30–45 | 30, 30, 32 | 30 | 0/3 | — | 79% | ramp @ 527.6 m ×38 (stuck-restart); plank @ 530.0 m ×34 (air-brake-nose-down); ramp @ 235.2 m ×4 (air-brake-nose-down) |
| x2-pipe-dream | extreme | 40–60 | 51, 46, 48 | 48 | 0/3 | — | 72% | drum @ 366.1 m ×63 (air-gas-nose-up); drum @ 369.4 m ×25 (air-gas-nose-up); drum @ 250.7 m ×18 (air-gas-nose-up) |
| x3-gauntlet | extreme | 60–80 | 28, 38, 33 | 33 | 0/3 | — | 94% | ramp @ 465.5 m ×36 (stuck-restart); plank @ 466.7 m ×15 (air-brake-nose-down); wall @ 277.0 m ×9 (nose-high) |

## Calibration against the stranger sessions

| track | band | stranger median attempts (sessions, src) | reflex average median (seeds) | ratio | stranger time to clear | reflex time to clear | stranger deaths (top) | reflex deaths (top) |
|---|---|---|---|---:|---:|---:|---|---|
| b1-first-ride | 1–1 | 2 (5, d698717f/73762476/c83b6ca8) | 1 (1, 1, 1) | 0.50 | 54.8 s | 55.3 s | — | — |
| b2-lean-back | 1–2 | 3 (2, 73762476) | 2 (1, 2, 2) | 0.67 | 49.0 s | 65.9 s | drum @ 36.0 m ×1; ramp @ 314.2 m ×1; ramp @ 322.2 m ×1 | ground @ 45 m ×1; ground @ 450 m ×1 |
| b3-kicker-row | 1–2 | 8 (4, 73762476/c83b6ca8) | 2 (2, 3, 2) | 0.25 | 77.8 s | 64.5 s | ground ×4; ramp @ 384.0 m ×1; ramp @ 178.0 m ×1 | ground @ 240 m ×1; gap @ 305.8 m ×1; gap @ 325.8 m ×1 |
| e1-uphill-weight | 2–4 | 8 (4, 73762476/c83b6ca8) | 1 (1, 1, 2) | 0.13 | 99.9 s | 61.5 s | ramp @ 445.0 m ×4; plank @ 436.0 m ×2; ground ×1 | ramp @ 445.0 m ×1 |
