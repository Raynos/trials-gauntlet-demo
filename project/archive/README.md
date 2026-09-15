# Archive

Completed plans and Markdown that is permanently stale or no longer relevant live here, moved
with `git mv` so history follows them. Nothing in this folder is a source of truth; if a file here
is needed again it moves back out.

Rules
- A plan moves here when its tracker row in `docs/plans/PLANS.md` reads done and the pin/tag that
  closed it is named at the top of the file (add a one-line "Closed: <date> · <commit/tag>" header).
- A design or research doc moves here when the thing it describes is gone from the code (not when
  it is merely old); leave a one-line pointer in the doc that superseded it.
- Status docs (`docs/design/*.md` round logs, `harness-metrics.md`) never move — they are the record.
- Never archive by copying; never archive scratch (`harness/out`, scratchpads are not in the repo).

Contents
- `PERF.md` — the perf plan, closed 2026-09-15 at cut #4b (`831e9c4`); the live remainder is `docs/plans/PERF-BACKLOG.md`.
- (next: `docs/plans/physics-v2.md` at the `physics-v2-final` tag, `docs/plans/MEGA_PLAN.md` at the v0.2.0 pin,
  `docs/tasks/touch-navigation-invariant.md` once the user confirms it on the phone)
