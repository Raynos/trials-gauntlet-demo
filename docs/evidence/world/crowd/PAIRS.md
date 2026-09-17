# Ask 62 — blind world pairs, before / after (2026-09-17)

Six sealed pairs (`pnpm harness:pair … --mask`, seeds 621–626), one fresh critic each, handed the
`harness:critic-prompt` text verbatim, logged as `critic-ask62-<before|after>-<track>` in
`harness/out/metrics/compare.jsonl`. Scores are the critic's 1–5 per `general` criterion for **our**
side (the reference's in brackets): weight-and-mass · contact-not-floating · camera-motion-motivated
· cut-timing · motion-continuity.

| cell | pair id | ours on | winner (conf) | ours: weight · contact · camera · cut · continuity | Σ ours (ref) |
|---|---|---|---|---|---|
| b1 before (ticks 1800–2280 vs eg10 4.0–8.0) | `world-industrial-20260917-084509-e371` | B | ref 0.60 | 3 · 4 · 4 · 5 · 5 | 21 (21) |
| b1 after | `world-industrial-20260917-084525-5dc9` | B | ref 0.55 | 4 · 4 · 4 · 5 · 5 | 22 (22) |
| p1 before (cp 2 @ x 160 vs eg10 4.0–8.0) | `world-industrial-20260917-084514-0874` | B | ref 0.60 | 4 · 4 · 4 · 4 · 5 | 21 (22) |
| p1 after | `world-industrial-20260917-084531-c133` | A | ref 0.75 | 3 · 3 · 3 · 4 · 4 | 17 (20) |
| p2 before (cp 2 @ x 182 vs rv02 5.2–8.0) | `world-canyon-20260917-084520-b2aa` | A | ref 0.85 | 2 · 3 · 3 · 4 · 4 | 16 (23) |
| p2 after | `world-canyon-20260917-084538-2a46` | A | ref 0.80 | 2 · 3 · 2 · 4 · 4 | 15 (20) |

Running tag totals after these six: `world-industrial` ours 0 / 9, `world-canyon` ours 0 / 7 (the
reviewer's "0 for 5" was the state before this round: 0 / 5 and 0 / 5).

**Reading.** The verdicts did not move, and they were never going to: the rubric scores motion
(weight, contact, camera, cut, continuity) and every cell is the same recording, physics and
camera on both sides — the critics' reasons name the flat ride, the rigid rider and the bolted
camera, never the crowd. The b1 cell drifted +1 (weight 3 → 4), p1 −4 and p2 −1 with the same
inputs: that spread is critic noise on one clip, not a signal. Not one of the twelve verdicts (six
here, six earlier rounds) mentions the spectators either way, so the "cloned cut-outs" read the
reviewer had is not something this judge measures; the clips in this folder are the evidence for
that ask. What would move the world pairs is on the physics / camera side (the critics' `nonAAA`
lines: "sprite on rails", "no compression, no settle", "camera bolted / dollies without a cause").
