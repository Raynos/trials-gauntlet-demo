# Operating rules

- Never your own browser. Headless harness only.
- One checkout, no worktrees. Retire subagents by 150 responses.
- Builders own paths and verify; only the parent judges.
- Evidence is played, never posed — judge clips, not stills.
- The metric is attempts-to-clear and restart latency, from a bot and a stranger.
- A recorded input replays to a byte-identical finish time, or the physics is broken.
- One commit per round; the subject states the finding.
- Ship gate every third round: cold boot, clear a track, crash, instant restart.
- Never announce completion while budget remains.
- This game should be playable on mobile iOS safari & desktop.
- Favor subagents over workflows where possible, as subagents are resumable.
- Plans and their status live in `docs/plans/README.md` (kept current by the parent at every commit); live plans: `docs/plans/PERF-BACKLOG.md`, Astra's `docs/plans/HERO_GARAGE_PRODUCTION.md`, ours `RIDING_POSES.md` / `HERO_ART_INTEGRATION.md`, and the proposed `docs/plans/USE_A_REAL_PHYSICS_LIBRARY.md`; the four closed plans (`MEGA_PLAN.md`, `physics-v2.md`, `PERF.md`, `RIDER_ON_GLASS.md`) are in `project/archive/`.
- Completed plans and permanently stale docs are archived under `project/archive/` (rules in its README); status docs never move.
- `docs/mission.md` holds the bars no plan can close; plans carry measurable proxies and may cite a mission line as their bar.
- Every user ask → a row in `docs/tasks/ASKS.md` before you start; flip it when it lands; rows never leave.
- Only a human can call it → `project/human-in-the-loop/QUEUE.md` (file, don't block; a line is deleted when decided). `.claude/hooks/session-brief.sh` prints that queue + open asks at session start — relay first, zero tool calls.
- Pointers: pins + deploy recipe `RELEASES.md` · claim evidence `docs/evidence/<topic>/` · device reports `docs/device/` · design rounds `assets/design/<screen>/SPEC.md` (recipe in `tracks/SPEC.md`; the user picks) · harness `harness/README.md`, stranger `harness/stranger/PROTOCOL.md`, battery `harness/compare/RUBRIC.md` · design canon `docs/design/CONTRACT.md` · the user's phone notes: `?review=1` in-game → `/drain-inbox`. Markdown budget 80/20: the commit hook refuses a > 40 % md commit unless the subject starts `Design:`/`Docs:`.
