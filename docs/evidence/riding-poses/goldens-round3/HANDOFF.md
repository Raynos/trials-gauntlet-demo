# Golden qualification handoff

- Frozen fingerprint `1255af7f`; 48/48 current `harness/inputs/*/bot-3{,-pro}.json` finish and pass exact Node/browser hash, state-finish bytes, run-clock bytes, and fault counts. `browser-all.json` is authoritative; all current recording SHA-256s were rechecked against it after search stopped.
- Eight same-controls clears; forty replaced with actual new played controls. All48 prior inputs preserved verbatim in `before/`.
- Final selected recordings:43 zero-fault, five one-fault (e1Pro,m2Rookie,m2Pro,p3Pro,x1Pro). These selected-run counts do not erase preceding failed searches.
- `public/bench/b1-bot-3.json` matches fresh b1 byte-for-byte.
- x3Pro historical blocker genuinely clears first attempt42.88333333333333s, hash028a7030a27250b1.
- p3Rookie required parent input-only PD candidate search. Mixed PD+skill3 provenance retained in final recording header. Final clear39.59166666666667s, hash e32b658b3395b2cc, zero faults, every continuation tick replayed identically. Parent knows final input stable for phone clip.
- p3Rookie failed original300s search(14attempts), failed pure skill3 continuation(33total attempts), and failed seed+1 search(15attempts) all retained. Parent's three PD candidates live under qualification-round3/p3-probe; full failures were not replaced with success claims.
- Production reports/controls copied into `played-searches/` (41search reports +41recordings). Extra continuation reports/controls are in this directory. `search-remaining.json` correctly retains p3Rookie's original failure despite its later mixed-method success.
- Owned only goldens, publicbenchcopy, and this evidence directory (production CLI also generated its routine metrics/reports). No source/test edits. Evidence `.mts` scripts ESLint passed.
- All sustained search/browser-verification workers stopped. Parent is free to run quiet CPU suite. No outstanding golden work or running sessions; parent owns final round judgment/commit/plans.
