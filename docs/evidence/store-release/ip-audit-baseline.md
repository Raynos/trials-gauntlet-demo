# IP audit: store build (store release bar 1)

Command: `pnpm build:store && node scripts/ip-audit.mjs --strict`. The result is **0 hits** in the 91 files of `dist/`, `ios/`,
`android/` and `store/` (2026-09-22, Cleanup round). CI now runs both ip-audit steps in `deploy.yml` with `--strict`.
Those are the store build's `dist/`, and the store bundle plus the shells' copies of it plus `store/metadata`. Any hit
fails the run.

| term | P0 baseline | after round 1 (`ab8c7af4`) | after the cutover (`90b641a2`) | now (strict) |
|---|---:|---:|---:|---:|
| trials | 95 | 24 | 0 | 0 |
| gauntlet | 34 | 16 | 8 | 0 |
| demo | 7 | 2 | 0 | 0 |
| rising | 4 | 7 | 7 | 0 |
| ubisoft, redlynx, evolution, fusion, no fear | 0 | 0 | 0 | 0 |
| retired level names | 123 | 127 | 108 | 0 |
| **total** | **263** | **176** | **123** | **0** |

What took it from 123 to 0:

| hits | cause | fix |
|---:|---|---|
| ~100 | The retired curriculum, playgrounds and Labs were statically registered in `src/tracks/index.ts`, and `SHIP_SEGMENTS` (their review segments) was bundled too. | `src/tracks/courses/eager.ts` is the registry's only static edge to the retired set. A production build stubs it to empty arrays (`vite.config.ts` `retiredTracksLazy`). The web build lazy-loads `assets/retired-*.js` only for a `?` dev URL (`loadRetiredTracks()`, awaited in `src/main.ts`). The store build has no retired chunk at all. Node, vitest and `vite dev` still register the retired set eagerly. |
| 15 | `x3-gauntlet`, See-Saw and Stairway were in `art/manifest.json` and `load-manifest.json`. These were the 15 real-render thumbs of the retired curriculum. | Dropped the 15 `thumb-*` ids from `public/art/thumbs` and both manifests (`assets/art/runtime-manifest.mjs` `RETIRED`). |
| 2 | "ar**ising**" in the two OFL licence texts. | Whole-word matching (`scripts/ip-audit-rules.mjs`). |
| ~10 | Generic riding words in hints ("Lean back …") and the fixture names. | Level names now come from `RETIRED_TRACKS`, matched case-sensitively. The nine generic names count only as a title. |
| 3 | Real hits in ROCKHOP copy: the p-coast set piece "The Stack" (the retired X3's name), S3's "a rising ice-shelf chain", and a shipped CSS comment "beacon rising". | Changed to "The Sea Stack", "a climbing ice-shelf chain" and "beacon climbing". |

Precision check: the P0 script (substring matching, names walked from `src/tracks/courses`) finds 16 hits in today's
store `dist/`, all of them false positives. There are 10 × "Lean Back" in hints, "First Ride" and "Uphill Weight" in
tutorial copy, the two fixture names, and 2 × "arising". The strict rules find 0. The matching rules are written up in
`scripts/ip-audit-rules.mjs`, and `scripts/ip-audit.test.mjs` pins the edge cases.

Bundle, gz (`vite build` budget plugin):

| build | before (`45bf4219`) | after |
|---|---:|---:|
| web, budgeted | 636.4 KB (entry 444.9) | 626.9 KB (entry 435.5) |
| web, retired dev chunk (not budgeted, not in the offline pack) | — | 10.1 KB |
| store | 627.7 KB (entry 434.4) | 619.1 KB (entry 425.7) |

The A/B is measured on the `45bf4219` tree. Rebased onto `bb9d0e57` (World's zone props, +2.8 KB) the numbers are web
629.7 KB and store 621.9 KB.
