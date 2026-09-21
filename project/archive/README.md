# Archive

Completed plans and Markdown that is permanently stale or no longer relevant live here, moved
with `git mv` so history follows them. Nothing in this folder is a source of truth; if a file here
is needed again it moves back out.

Rules
- A plan moves here when its tracker row in `docs/plans/README.md` reads done and the pin/tag that
  closed it is named at the top of the file (add a one-line "Closed: <date> · <commit/tag>" header).
- A design or research doc moves here when the thing it describes is gone from the code (not when
  it is merely old); leave a one-line pointer in the doc that superseded it.
- Status docs (`docs/design/*.md` round logs, `harness-metrics.md`) never move — they are the record.
- Never archive by copying; never archive scratch (`harness/out`, scratchpads are not in the repo).

Contents
- `PERF.md` — the perf plan, closed 2026-09-15 at cut #4b (`831e9c4`); the live remainder is `docs/plans/PERF-BACKLOG.md`.
- `physics-v2.md` — the physics v2 design, closed 2026-09-15 at tag `physics-v2-final` (R6); status lives on in `docs/design/physics.md`.
- `MEGA_PLAN.md` — the v0.1.0 → v0.2.0 mega build, closed 2026-09-15 at tag `v0.2.0` (`b52dfd0`); the numbers are in `RELEASES.md`.
- `CLOSEOUT.md` — the 3-hour close-out contract of 2026-09-15; ran to its outcome.
- `BLENDER_HERO.md` — Astra's branch plan; the branch is on `main`; its remainder went to `HERO_OPEN_WORK.md`, now also here.
- `HERO_OPEN_WORK.md` — the post-merge hero handoff, closed 2026-09-16 by splitting into `docs/plans/RIDING_POSES.md`, `CHROMIUM_METAL_SHADER_INIT.md` and `HERO_ART_INTEGRATION.md`.
- `loading-progress-invariant.md`, `touch-navigation-invariant.md` — the two P0 task docs, both landed and holding.
- `RIDER_ON_GLASS.md` — the second mega plan, closed 2026-09-16 at `f00724e` (G 100 %; H on the user's decision with the whole Astra branch merged).
- `blender-branch-merge.md` — the merge rules and the three test merges; the branch is on `main` in full.
- `CHROMIUM_METAL_SHADER_INIT.md` — the GL 1281 startup bug, closed 2026-09-16 as non-repro (18/18 clean Metal gates incl. the original failing build; evidence `docs/evidence/chromium-metal/`).
- `HERO_GARAGE_PRODUCTION.md` — Astra's Blender art plan, closed 2026-09-17 with ask 43: delivery integrated, prototype retired; the recipe lives in `assets/blender/hero-art/`, the handoff in `docs/evidence/hero-art/delivery/`.
- `PWA_OFFLINE.md` — offline PWA plan, closed 2026-09-21 at tag `pwa-offline-complete`: origin-down headless gate proved an offline B1 finish, and the user confirmed the PWA works offline on the actual phone.
