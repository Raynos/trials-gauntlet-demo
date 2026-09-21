# Riding poses: round 3 fresh strangers

Physics fingerprint `1255af7f` was checked before the cohort, in every recording,
before/after each browser verification, and after these twelve sessions. Browser
replay uses the frozen `/tmp/trials-poses-round3/dist` build, with file hashes
preserved in each proof and checked for changes. Previous `ae2c0bca` evidence in
`strangers-final/` remains historical and is excluded by the standard census.

| Session | Attempts | Exact continuous finish clock | Calls | Whole-session replay |
|---|---:|---:|---:|---|
| b1-first-ride-20260921-061537 | 1 | 46.016666666666666 s | 12 | exact |
| b1-first-ride-20260921-061643 | 1 | 47.175 s | 13 | exact |
| b2-lean-back-20260921-062226 | 1 | 40.975 s | 12 | exact |
| b2-lean-back-20260921-062324 | 2 | 55.141666666666666 s | 16 | exact |
| b3-kicker-row-20260921-063235 | 3 | 52.525 s | 22 | exact |
| b3-kicker-row-20260921-063438 | 2 | 48.86666666666667 s | 26 | exact |
| e1-uphill-weight-20260921-064121 | 4 | 72.625 s | 23 | exact |
| e1-uphill-weight-20260921-064306 | 2 | 63.40833333333333 s | 21 | exact |
| e2-rear-wheel-first-20260921-065047 | 1 | 46.833333333333336 s | 20 | exact |
| e2-rear-wheel-first-20260921-065226 | 2 | 53.81666666666667 s | 26 | exact |
| e3-stairway-20260921-065902 | 1 | 41.208333333333336 s | 11 | exact |
| e3-stairway-20260921-070002 | 1 | 41.9 s | 12 | exact |

All twelve cleared on Rookie; no forced resets or censored sessions in this cohort.
Every whole-session replay matched state hash, segment finish float bytes,
continuous run-clock float bytes, and all fault counts. Every failed attempt is retained with its prefix recording and full log. All nine
crashes in this cohort respawned after 120 ticks (1 second). No manual restart latency was observed;
simulation ticks do not measure browser input-to-visible-ready wall latency.

Each player was an independent `fork_turns=none` agent given the full unchanged
protocol plus one naming line; second players used cosmetic seed 2. The first
player naming lines specify track and agent label; second-player lines specify
track and prestarted session. There were no track hints beyond the protocol, no
advice, and no coordinator observation of calls while playing. Each agent was
retired after completion. Protocol, prompt, source fingerprint, complete state,
recording, failed attempts, and replay proof are preserved per session.

The b1 census has attempts [1,1], median 1, harness PASS; b2 has [1,2], median 1.5,
harness PASS. Historical census is retained without cherry-picking: b1 has 2
abandoned zero-call sessions and 20 stale exclusions; b2 has 2 abandoned zero-call
sessions and 17 stale exclusions. These measurements concern informed AI
solvability through command slots. Human discovery, visual readability and mobile
control usability remain separate instruments. Only the parent judges acceptance.

The b3 census has attempts [3,2], median 2.5, harness PASS; e1 has [4,2],
median 3, harness PASS. b3 retains 18 stale exclusions and two abandoned zero-call
sessions; e1 retains 15 stale exclusions and two abandoned zero-call sessions.
The second coordinator preserved seven crash attempts across these four players,
with no forced resets or censored new players.

The e2 census has attempts [1,2], median 1.5, harness UNDER-BAND; e3 has
[1,1], median 1, harness UNDER-BAND. Both have an asserted lower bound of 3
attempts, so these results do not meet the difficulty band. The full census keeps
e2's 11 stale exclusions and two abandoned zero-call sessions, and e3's 15 stale
exclusions and two abandoned zero-call sessions. The final four players add one
crash, preserved in full, with a 120-tick automatic respawn. None was censored.

## Handoff

All twelve requested fresh players are archived, with no active players or
prestarted sessions remaining. `coordinator-one-summary.json`,
`coordinator-two-summary.json`, and `coordinator-three-summary.json` are the
immutable four-session handoffs for b1/b2, b3/e1, and e2/e3 respectively. The
third coordinator changed evidence and corresponding recordings/metrics only;
physics and runtime remain unchanged. Only the parent judges acceptance.

Every `replay.json` uses identical frozen build hashes and fingerprint
`1255af7f`. Whole-session proofs match the browser state hash, segment finish
float bytes, continuous run-clock float bytes, and fault counts. No manual restart
was attempted, so manual restart latency remains unobserved.
