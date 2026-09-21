# Golden refresh handoff

Simulation fingerprint `ae2c0bca`, unchanged throughout these searches. Agent retires at the response cap; this is **not** a completion claim.

- All 47 old recordings preserved verbatim in `before/`. Initial refresh: none still finished.
- 46/47 existing goldens now genuinely clear from new played controls. Full two-worker search logs retained. Mostly first-attempt clears; final browser rows provide authoritative fault counts.
- Remaining x3 Pro search timed out at 92%, zero faults; genuine-prefix continuation started with `continue.mts` under terminal session **24743**, output `x3-gauntlet-pro-continued.{log,json,rec.json}`. No physics teleport; full concatenated input replay must match every tick.
- Added missing x1 Pro **cleared first attempt**,51.55833333333333s run clock, physics hash `1e8c2788527a0e3e`; session29675 completed. Thus47/48 full-matrix records now fresh; only x3Pro continuation remains.
- Main batch session **64234** completed. Its `search-remaining.json` marks the pre-continuation x3 Pro timeout stale, correctly retained.
- After both final searches land, run `pnpm exec tsx docs/evidence/riding-poses/goldens-final/verify.mts docs/evidence/riding-poses/goldens-final/browser-all-final.json` to verify every existing bot-3 recording (expected48). Script compares exact hash, state finish bits, run-clock bits and faults; it never edits inputs. Existing16 core recordings (8 tracks ×2 classes) already passed browser checks in `browser-rookie-core-v2.json` and `browser-pro-core.json`.
- `public/bench/b1-bot-3.json` copied from fresh b1 as parent requested; bench test passes.
- Scoped bench+R7+R8:11/13 pass. **R7/R8 b1 recovery band still fails**:2 recovered ticks, max COM .166m >.15m. Parent diagnosing. `replay-tests-prequalification.log` preserves exact failure; no bars weakened.
- If physics changes, all fresh recordings must be re-proven; do not assume hash equivalence.

## Strangers

Parent's fresh b1_a and this agent's fresh b1_b both completed first-attempt:

- `b1-first-ride-20260921-051433`:46.333333333333336s.
- `b1-first-ride-20260921-051948`:47.925s.

Both browser replays pass exact hashes/finish/run clocks/faults in `browser-stranger-b1.json`. b1_b was fork-none, full protocol verbatim + track line only; no hints or source shared. Both agents retired. Ten fresh strangers (two each b2,b3,e1,e2,e3) remain; parent explicitly requested holding next spawn until sleeve worker retires, so a dedicated fresh coordinator can use the freed slot.

## Owned changes

Golden `harness/inputs/*/bot-3*.json`, new b1 stranger recording, `public/bench/b1-bot-3.json`, this evidence directory. CLI also wrote its standard ignored reports/metrics. No runtime/test edits. Evidence scripts lint passed after removing unused import. `README.md` describes exact methodology and the rejected initial checker that compared different clock fields.
