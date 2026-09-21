# Round 3 support-closure golden qualification

Frozen simulation fingerprint: `1255af7f`. **All 48 recordings finish and pass exact Node/headless-browser qualification** in `browser-all.json`. Every current input file's SHA-256 was independently rechecked against that report after search stopped; the public b1 bench recording is byte-identical to its fresh golden.

All 48 incoming recordings are preserved verbatim under `before/`. `refresh.mts` replayed identical controls first: eight still finished and forty needed new played controls. Only actual finishes were restamped. `refresh.json` retains every initial result.

`search.py` ran two independent production skill-3 searches with a 300-second maximum per search, stopping on each first finish. Parent authorization later raised concurrency to four: `search-priority.py` added two workers on the trailing extreme/bonus Pro tracks. Full search logs and all 41 production search reports plus actual recorded controls are retained under `played-searches/`. No runtime, track, or acceptance threshold was changed by this work. Production search reports measure all search attempts; a qualified golden's fault count describes that selected recording, not total search effort.

Snow Line Rookie was the only base-seed initial search failure: 14 attempts, 238.005 m of 488.278 m, 300-second cap. Its genuine-prefix skill-3 continuation also timed out, reaching 33 total attempts with zero replay mismatches. Seed +1 independently timed out after 15 attempts at the same blocker. All three failures and controls are preserved.

The parent then searched three input-only PD candidates from genuine prefix tick 1773 (x≈196 m). The third crossed the blocker to x255 without a fault; two failed candidates are retained in `../qualification-round3/p3-probe/`. `p3-snow-line-rookie-pd-continued.*` continues that real prefix with unchanged skill-3 search, records every actual input, and checks every continuation tick against a fresh full replay. It finished in 39.59166666666667 s with zero faults, hash `e32b658b3395b2cc`, no replay mismatches. Its golden header explicitly preserves **mixed PD diagnostic + skill-3 prefix/continuation** provenance; it is not claimed as a pure skill-3 clear.

`verify.mts` serves the parent-supplied frozen `/tmp/trials-poses-round3/dist` build in headless Chromium. A pass requires a current source stamp, an actual finish, identical physics hashes, identical state-finish IEEE-754 bytes, identical run-clock IEEE-754 bytes, and equal fault counts. The two clock fields are compared separately with their counterparts. `watch-verify.py` serially qualified newly available recordings into individual `verified-*.json` reports and aggregated all 48 rows into `browser-all.json`. All final file SHA-256s match those qualified bytes. Evidence `.mts` scripts pass ESLint.

The final selected recordings comprise 43 zero-fault clears and five one-fault clears: e1 Pro, m2 Rookie, m2 Pro, p3 Pro, and x1 Pro. Historical x3 Pro now clears on the first attempt in 42.88333333333333 s, hash `028a7030a27250b1`, exact in both runtimes.

All search and verification processes stopped before the parent's quiet CPU-cost suite. This is golden qualification evidence; only the parent judges the round and user-facing completion.
