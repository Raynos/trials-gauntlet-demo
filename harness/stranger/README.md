# Stranger harness (parent-side notes)

**What this instrument measures (round 11, audit §3).** A stranger is a fresh AI agent driving the node physics through
1/8 s command slots (with the hop / wheelie / climb macros of `bot/actions.ts`) and reading exact telemetry plus an ASCII
side-view; it is briefed with `PROTOCOL.md`'s technique notes. Its attempts-to-clear measures **solvability and adaptation by
a player who knows the controls and the feel notes but not the track** — not unaided human discovery, visual readability,
input timing on a keyboard or a phone, onboarding or enjoyment. Human sessions on the real desktop and phone interfaces are a
separate instrument (the parent's device reports); do not read a stranger median as a human one.

**The verdict (round 11, audit §4).** `report` counts completed sessions on the current src fingerprint and the tier's default
bike (`defaultBikeForTier`; `--bike` overrides) and prints a census: `n`, the censored sessions (in progress / abandoned — never
in a median), stale-src and other-bike exclusions, and the exact bound asserted. Verdict: `PASS` (n >= 2, every counted session
cleared, band[0] <= median <= 1.5 x band[1]) · `FAIL` (median above the limit or a counted session did not clear) · `UNDER-BAND`
(all cleared, median below the authored floor — easier than authored; within the ship limit, a tracks note) · `INSUFFICIENT`
(n < 2) · `n/a` (no band).

1. Either create the session yourself (`pnpm harness:stranger start --track <id> --agent <name>` prints the session id and the first `look`) or let the stranger do it — PROTOCOL.md's Setup section tells it to run `start` on `b1-first-ride` unless you name another track. Node physics only, no browser; state lives in `harness/out/stranger/<track>/<id>/` (`state.json`, `attempts/NNN.json`, `log.txt`).
2. Spawn a **fresh** agent (no repo context, no `src/`, no bot output). Its whole prompt is `PROTOCOL.md` verbatim, optionally plus one line naming the track (and the session id if you created it). Nothing else.
3. It plays with `pnpm harness:stranger <cmd> --session <id>` (env `TRIALS_STRANGER_SESSION=<id>` also works). Every call reloads the sim from the snapshot, so calls are independent processes but the run is continuous; there is no undo.
4. Budget: 150 calls / 25 min from `start` (`TRIALS_STRANGER_BUDGET_CALLS`, `TRIALS_STRANGER_BUDGET_MINUTES` override for tests). `play`/`restart`/`reset` exit 2 with `{"budget":"exhausted"}` afterwards; `look`/`status`/`done` still work. Errors exit 1 with `{error}` and still count.
5. Read results in `harness/out/stranger/<track>/<id>/session.json` (`StrangerSession`): `strangerAttempts` = 1 + counted faults (`harness/lib/metrics.ts` rule: the restart mash right after a crash is not a second fault), `attempts[]` (one entry per crash/restart/reset; the successful run is not an entry), `cleared`, `finishTime` (continuous run clock), `faultsByCheckpoint`, `firstCheckpointCalls`, `log`.
6. `done` also merges `harness/out/metrics/<track>.stranger.json` (`sessions[]`, `census`, `asserted`, `verdict`, `medianAttempts`; `pass` is `verdict === 'PASS'`, `null` when INSUFFICIENT / no band) and prints one line: `stranger <track> session=<id> attempts=N cleared=yes/no finish=<s> calls=N wall=<s>`.
7. Verify the log with the browser: `pnpm harness:replay harness/inputs/<track>/stranger-<id>.json` (the recording is the whole session's input stream; then set `replayVerified`/`replayFaults` yourself). Restarts and post-crash respawns are in the recording as a real restart press; a `reset` (back to the start line) is the game's 0.6 s hold-restart, also in the recording, so a replay reproduces the whole session. `forcedResets > 0` would mean the rule layer disagreed with the game — report it.
8. Run >= 2 strangers per track (independent agents, different `--seed` for cosmetics only) before judging a track; `median` is over all sessions in the metrics file, so `trash` stale sessions from it before re-judging.
9. Do not read the stranger's calls while it plays and do not answer its questions about the track: the point is what a player who only knows the controls can do.
10. Files: `cli.ts` (commands), `session.ts` (persistence, budget, attempt log), `view.ts` (ASCII side-view), `PROTOCOL.md` (the stranger's only briefing).
