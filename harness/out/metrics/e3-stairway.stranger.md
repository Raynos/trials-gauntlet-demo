# Stranger — e3-stairway (bikePhysicsFactory-v2, src 65175e2d, 2026-09-15T19:32:09.420Z, medians on rookie)

**FAIL** — n = 8 completed on rookie (min 2) · cleared 7/8 · median attempts 5.5 · asserted 3 ≤ median ≤ 9.0 (1.5 × band top 6) and every counted session cleared · censored 2 (e3-stairway-r4-s1-20260914-164224 abandoned at attempt 1; e3-stairway-r4-s2-20260914-164224 abandoned at attempt 1) · excluded: 0 stale src, 0 other bike · median time to clear 55.0 s · median calls 24.5 · median wall 7.7 min

| session | agent | bike | status | attempts | cleared | time to clear | calls | wall | 1st cp call | died at | best attempt |
|---|---|---|---|---:|---|---:|---:|---:|---:|---|---|
| e3-stairway-r3-s1-20260914-113731 | s1 | rookie | done (stale src) | 8 | yes | 108.5 s | 44 | 14.1 min | 3 | crash@170m, crash@176m (ramp), crash@271m, crash@267m (stair), crash@276m, restart@402m (stair), crash@414m (stair) | #8 clear ticks 11166–13211 |
| e3-stairway-r3-s2-20260914-113731 | s2 | rookie | done (stale src) | 8 | yes | 92.3 s | 38 | 12.4 min | 3 | crash@83m, crash@70m, crash@174m (ramp), crash@174m (ramp), crash@174m (ramp), crash@422m (gap), crash@414m (stair) | #8 clear ticks 9257–11262 |
| e3-stairway-r4-s1-20260914-164224 | s1 | rookie | abandoned | 1 | no | — | 0 | 1309.7 min | — | — | — |
| e3-stairway-r4-s1-20260914-191143 | s1 | rookie | done (stale src) | 20 | yes | 184.6 s | 68 | 19.5 min | 2 | crash@72m, crash@66m, crash@64m, crash@177m (ramp), crash@168m, crash@164m (stair), crash@178m (ramp), crash@277m, crash@416m (gap), crash@411m (stair), restart@409m (box), hazard@427m (box), hazard@427m (box), hazard@427m (box), crash@430m (ramp), crash@431m (ramp), crash@430m (ramp), crash@431m (ramp), crash@430m (ramp) | #20 clear ticks 20224–22482 |
| e3-stairway-r4-s2-20260914-164224 | s2 | rookie | abandoned | 1 | no | — | 0 | 1309.7 min | — | — | — |
| e3-stairway-r4-s2-20260914-191143 | s2 | rookie | done (stale src) | 11 | no | — | 33 | 24.4 min | 2 | crash@78m, crash@71m, crash@176m (ramp), crash@165m (stair), restart@166m (stair), restart@166m (stair), crash@412m (stair), crash@415m (gap), crash@415m (gap), crash@420m (gap) | #10 420 m ticks 12736–13498 |
| e3-stairway-r6-s1-20260914-215808 | s1 | rookie | done (stale src) | 3 | yes | 55.0 s | 16 | 3.0 min | 2 | crash@418m (gap), restart@415m (gap) | #3 clear ticks 4876–6932 |
| e3-stairway-r6-s2-20260914-215808 | s2 | rookie | done (stale src) | 1 | yes | 42.1 s | 11 | 1.1 min | 2 | — | #1 clear ticks 0–5405 |
| e3-stairway-r6-s3-20260914-215808 | s3 | rookie | done (stale src) | 1 | yes | 42.2 s | 11 | 1.4 min | 2 | — | #1 clear ticks 0–5413 |
| e3-stairway-r6-s4-20260914-215808 | s4 | rookie | done (stale src) | 1 | yes | 42.4 s | 11 | 1.2 min | 2 | — | #1 clear ticks 0–5435 |

Where they died (45 ended attempts over counted sessions):

| obstacle | deaths | x (m) |
|---|---:|---|
| ground | 12 | 170.4, 271, 275.8, 82.8, 69.6, 71.9, 66.2, 64.3, 167.6, 277, 78.3, 71.5 |
| ramp @ 178.8 m | 7 | 175.9, 174.2, 173.5, 173.9, 177.3, 177.5, 176.1 |
| gap @ 422.2 m | 7 | 422.2, 416.1, 414.6, 414.6, 420.2, 417.9, 415 |
| ramp @ 431.7 m | 5 | 430, 430.7, 429.8, 431.2, 430.3 |
| stair @ 412.2 m | 4 | 413.6, 413.5, 411.1, 411.9 |
| stair @ 165.2 m | 4 | 164.5, 164.8, 166.4, 165.9 |
| box @ 427.7 m | 3 | 427.5, 426.8, 427.1 |
| stair @ 266.8 m | 1 | 267.2 |
| stair @ 400.2 m | 1 | 401.7 |
| box @ 408.2 m | 1 | 409.1 |

by reason: crash 37, restart 5, hazard 3 · by checkpoint segment: [0, 7, 13, 4, 21]
