# Reflex bot — skill average, 3 seed(s), physics bikePhysicsFactory, src c83b6ca8, 2026-09-14T12:38:34.213Z, wall 8 s

Reaction 180–220 ms, glances 25 Hz, pitch noise ±2°, speed noise ±5%, taps 80 ms, lapses every ~10 s. attempts = 1 + faults (all reasons); cap 50; sim cap 300 s.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 1, 1, 1 | 1 | 3/3 | 11.2 s | 100% | — |
| gap-test | beginner | 1–3 | 2, 1, 1 | 1 | 3/3 | 7.3 s | 100% | ground @ 45 m ×1 (nose-low) |
| b1-first-ride | beginner | 1–1 | 1, 1, 1 | 1 | 3/3 | 55.5 s | 100% | — |
| b2-lean-back | beginner | 1–2 | 2, 3, 5 | 3 | 3/3 | 58.5 s | 100% | ramp @ 322.2 m ×2 (air-gas-nose-up); ground @ 100 m ×1 (air-gas-nose-up); ground @ 220 m ×1 (air-gas-nose-up) |
| b3-kicker-row | beginner | 1–2 | 2, 3, 5 | 3 | 3/3 | 70.2 s | 100% | box @ 368.0 m ×2 (air-level); ground @ 70 m ×1 (air-gas-nose-up); ground @ 110 m ×1 (air-brake-nose-down) |
| e1-uphill-weight | easy | 2–4 | 1, 3, 4 | 3 | 3/3 | 79.3 s | 100% | ramp @ 445.0 m ×2 (nose-high); ground @ 165 m ×1 (air-gas-nose-up); ramp @ 308.8 m ×1 (air-gas-nose-up) |
| e2-rear-wheel-first | easy | 3–5 | 14, 13, 51 | 14 | 2/3 | 127.2 s | 100% | box @ 149.0 m ×50 (air-gas-nose-up); ground @ 415 m ×7 (air-gas-nose-up); box @ 401.0 m ×4 (air-brake-nose-down) |
| e3-stairway | easy | 3–6 | 48, 46, 49 | 48 | 0/3 | — | 28% | stair @ 100.5 m ×138 (stuck-restart); stair @ 44.0 m ×2 (nose-high) |
| m1-hop-up | medium | 5–9 | 46, 51, 51 | 51 | 1/3 | 292.6 s | 100% | ledge @ 87.0 m ×92 (stuck-restart); ledge @ 223.0 m ×23 (nose-low); ledge @ 285.0 m ×15 (stuck-restart) |
| m2-drum-roll | medium | 6–12 | 46, 36, 45 | 45 | 0/3 | — | 91% | ramp @ 123.0 m ×86 (stuck-restart); ramp @ 303.9 m ×21 (stuck-restart); logpile @ 124.5 m ×5 (climbing) |
| m3-see-saw | medium | 8–12 | 45, 42, 39 | 42 | 0/3 | — | 88% | gap @ 164.4 m ×32 (air-gas-nose-up); ramp @ 160.4 m ×26 (climbing); plank @ 167.4 m ×24 (air-gas-nose-up) |
| h1-wheelie-wire | hard | 10–18 | 47, 49, 49 | 49 | 0/3 | — | 44% | wall @ 138.0 m ×132 (stuck-restart); gap @ 58.5 m ×3 (air-gas-nose-up); gap @ 61.0 m ×2 (air-gas-nose-up) |
| h2-gap-chain | hard | 14–22 | 51, 51, 51 | 51 | 0/3 | — | 14% | box @ 60.0 m ×72 (air-gas-nose-up); box @ 52.0 m ×49 (climbing); gap @ 57.0 m ×13 (air-gas-nose-up) |
| h3-fire-line | hard | 18–25 | 51, 51, 51 | 51 | 0/3 | — | 87% | barrel @ 57.0 m ×109 (air-level); ground @ 60 m ×27 (air-level); ramp @ 413.0 m ×6 (air-brake-nose-down) |
| x1-vertical-limit | extreme | 30–45 | 43, 43, 44 | 43 | 0/3 | — | 15% | ramp @ 44.0 m ×85 (stuck-restart); plank @ 45.2 m ×39 (stuck-restart); box @ 48.1 m ×1 (nose-high) |
| x2-pipe-dream | extreme | 40–60 | 45, 48, 41 | 45 | 0/3 | — | 35% | ramp @ 47.6 m ×114 (nose-high); logpile @ 49.1 m ×11 (nose-low); box @ 35.6 m ×3 (air-gas-nose-up) |
| x3-gauntlet | extreme | 60–80 | 29, 32, 31 | 31 | 0/3 | — | 24% | plank @ 86.2 m ×24 (climbing); ramp @ 85.0 m ×20 (steep-ahead); ground @ 60 m ×18 (air-gas-nose-up) |

## Calibration against the stranger sessions

| track | band | stranger median attempts (sessions, src) | reflex average median (seeds) | ratio | stranger time to clear | reflex time to clear | stranger deaths (top) | reflex deaths (top) |
|---|---|---|---|---:|---:|---:|---|---|
| b1-first-ride | 1–1 | 2 (5, d698717f/73762476/c83b6ca8) | 1 (1, 1, 1) | 0.50 | 54.8 s | 55.5 s | ground ×1 | — |
| b2-lean-back | 1–2 | 3 (2, 73762476) | 3 (2, 3, 5) | 1.00 | 49.0 s | 58.5 s | drum @ 36.0 m ×1; ramp @ 314.2 m ×1; ramp @ 322.2 m ×1 | ramp @ 322.2 m ×2; ground @ 100 m ×1; ground @ 220 m ×1 |
| b3-kicker-row | 1–2 | 11.5 (2, 73762476) | 3 (2, 3, 5) | 0.26 | 107.1 s | 70.2 s | ramp @ 31.0 m ×5; ramp @ 145.0 m ×4; ramp @ 133.0 m ×4 | box @ 368.0 m ×2; ground @ 70 m ×1; ground @ 110 m ×1 |
| e1-uphill-weight | 2–4 | 12 (2, 73762476) | 3 (1, 3, 4) | 0.25 | 119.7 s | 79.3 s | ground ×7; plank @ 302.0 m ×6; ramp @ 221.8 m ×2 | ramp @ 445.0 m ×2; ground @ 165 m ×1; ramp @ 308.8 m ×1 |
