# IP audit baseline (store release P0.4, 2026-09-22)

`pnpm build:store && node scripts/ip-audit.mjs` after Phase 0 (P0.1–P0.3 landed): **263 hits in 21 of 27
scanned files** of `dist/`. CI reports it on every push (`deploy.yml`, non-blocking); bar 1 is `--strict` = 0
before Phase 6.

| term | hits | where |
|---|---:|---|
| trials | 95 | the name (`index.html` ×13, webmanifest, offline page, bundle strings, `trials.*` storage keys, `trials-synth` worklet); the provenance extras in every bike/rider GLB ("angular factory trials reconstruction") |
| gauntlet | 34 | the name; the `x3-gauntlet` track id (art thumbs, load manifest) |
| rising | 4 | "The Rising Pillars" set piece (X1) and one generic use |
| demo | 7 | `trials-gauntlet-demo` URL in `index.html`; "physics trials-bike demo" in the credits |
| ubisoft, redlynx, evolution, fusion, no fear | 0 | — the credits "Thanks" line, the source-naming comments and the No Fear graffiti are gone |
| retired level names (26 in `src/tracks`) | 123 | track names and set-piece copy; "See-Saw", "Lean Back", "Stairway" also match tutorial text |

Expected residue per the plan: the name (Phase 1 R3), the levels (Phase 3), in-world text. Labs names are 0:
the store build does not contain them.
