# Audit: Astra's direct-to-main commits `f452c24`, `ecee659`, `0bcd861` (2026-09-15 22:31–22:35)

Reviewer: the parent. Method: clean `git archive HEAD` export of `0bcd861`, no working-tree state.

## Verdict

**Accepted on `main`.** Every gate is green on the exact revision; nothing regresses the invariants. Two design
findings need the user's call (below) and one housekeeping item is filed.

| check | result |
|---|---|
| `tsc` app + harness configs | clean |
| `eslint .` | clean |
| `vitest run` | **836 / 836** (70 files) — Astra's own note of "822 / 14 failed" was the concurrently changing working tree (physics R9 in flight), not this revision |
| production build | bundle 555.6 KB gz of 600; inline loader 8 179 B of 8 192 (after `b006ad9`, which put the `img2Rider` chunk in phase *other*) |
| touch e2e `--only=front,run` (iPhone 13 + 15 Pro Max) | **737 / 737** — the touch-navigation invariant holds with the new menu panel |
| `sw.js` precache | 0 img2 entries — the 45 textures and the experiment module load on demand, as claimed |
| default rider | unchanged: `img2` only via `?rider=img2` or an explicit menu pick; the stored choice round-trips |

## What landed

1. **`docs/plans/USE_A_REAL_PHYSICS_LIBRARY.md`** (`f452c24`, `ecee659`) — a P0–P5 plan to ship a second, library-backed
   physics engine (Rapier 2D first, Planck comparison) **selectable from the main menu next to Custom v2**, with
   per-engine records, snapshot/restore and replay contracts, and a real gate. Status: planned, no code. It names the
   parent as owner and adds itself to the plan index.
2. **`0bcd861` — main + pause menus gain a "Rider model" (Blender / Classic / Img2 experiment) row and a five-outfit
   row**; selecting an outfit switches to Blender; the `img2Rider` adapter conditions a generated mesh's skeleton and
   garment weights for the game rig; 45 PBR textures (6.9 MB) + a hashed manifest in `public/`; an e2e
   (`harness/e2e/experimental-rider.mts`); evidence with stills, a WebKit report and a parent-reviewed clip. Astra's own
   framing: "accepted as a selectable experiment only … not AAA art acceptance, not real-device performance proof."

## Findings for the user

- **F1 — the main menu.** The user's decision on 2026-09-14 was **B Broadcast** with the four pills (PLAY / GARAGE /
  REVIEW / SETTINGS) and a clean key-art stage. `0bcd861` puts a two-row rider/outfit panel *on the main menu*
  (`docs/evidence/hero-img2-menu/main-img2.png`), duplicating the Garage's job and covering the lower third of the key
  art. Recommendation: keep the rows in the **Garage** (and the pause menu, where a mid-session swap is handy) and take
  them off the main menu, or make it the user's explicit decision to change B. Not changed by this audit.
- **F2 — a fifth plan.** `USE_A_REAL_PHYSICS_LIBRARY.md` is a large new plan in `docs/plans/` under the standing goal
  "build every plan to completion and archive it". It should either be inside the goal (then it is the next big
  build after Rider on Glass closes) or be marked as Astra's proposal outside it. Two factual nits inside it: the
  "R6 hop-force assertion fails 1 398 vs 1 280" row is pre-R8 (R8 set the bound to 0.5 F_max, measured 1 399 N; the
  suite is 164/164), and the "48 / 48 vs 46 / 48" prose is resolved in `physics.md` R8 (Pro x1/x3 open, in R9).

## Housekeeping

- H1: the 45 textures sit loose in `public/` root (`cotton_*`, `denim_*`, `eye_*`, `glove_*`, `hair_*`, `rubber_*`,
  `shoe_*`, `skin_*`, `thread_*`). They belong under `public/img2/` (or `public/models/img2/`) with the manifest;
  same bytes, cleaner root, and the boot plan's phase rule can match one prefix. For Astra.
- H2: `docs/evidence/hero-img2-menu/README.md` cites "822 passed / 14 failed" — note that this was the working tree,
  not the revision (HEAD is 836 / 836).
