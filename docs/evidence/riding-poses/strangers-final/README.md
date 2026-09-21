# Fresh riding-pose stranger sessions

**Historical candidate only.** The later support/suspension correction changed the simulation to `1255af7f`; current qualification is in the corresponding `*-round3/` folder. These results are preserved and are not current-build passes.

Snapshot: physics fingerprint `ae2c0bca`. Each player was a new `fork_turns=none`
agent given the unchanged `PROTOCOL.md` plus one naming line. The coordinator did
not observe calls during play or provide advice. This measures informed AI
solvability with command slots, not human discovery, visual readability, or mobile
control usability. The parent judges acceptance.

| Track / session suffix | Attempts | Continuous finish clock | Calls | Complete input replay |
|---|---:|---:|---:|---|
| b2 / 20260921-055045 | 1 | 42.375 s | 16 | exact hash, finish bits, clock bits, 0 faults |
| b2 / 20260921-055219 | 2 | 51.458333333333336 s | 18 | exact hash, finish bits, clock bits, 1 fault |
| b3 / 20260921-055813 | 2 | 44.275 s | 18 | exact hash, finish bits, clock bits, 1 fault |

All three cleared on Rookie; no forced resets and no censored sessions in this
fresh cohort. Both observed crashes respawned after 120 simulation ticks (1 s).
No manual restart latency was observed in this cohort. Simulation tick latency
does not measure browser input-to-visible-ready wall time.

Each session directory contains its full state, log, failed attempt prefix
recordings, whole input recording, briefing, provenance, and headless browser
replay proof. Replay compares the complete stream, including crash/respawn, not
just the winning attempt. The `finishTime` field in `session.json` is the rounded
continuous clock; `replay.json` keeps exact continuous and segment clock bytes.

The harness b2 census reports n=2, attempts [1,2], median 1.5, PASS against [1,3].
The b3 census reports n=1, attempts [2], INSUFFICIENT. Census files preserve all
history: b2 has 2 abandoned historical zero-call sessions and 15 stale exclusions;
b3 has 2 abandoned historical zero-call sessions and 17 stale exclusions. Nothing
was trashed to improve the result.

Remaining: one fresh b3 player, two fresh players each for e1-uphill-weight,
e2-rear-wheel-first, e3-stairway. Parent requested a temporary hold before further
spawns while diagnosing independent suite failures. Existing evidence remains
valid for ae2c0bca; a simulation change requires explicit revalidation.
