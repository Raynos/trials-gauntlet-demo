# Ship gate r4 on `0c2f866` (v0.3.1 candidate: 6c794e9 menu, a32d7e0 garage / pose / hero, 0c2f866 world) — 2026-09-17 09:00–09:15

Frozen per the `harness/README.md` recipe: `git archive 0c2f866 | tar -x -C <scratch>`, `node_modules` symlinked,
`VERCEL_GIT_COMMIT_SHA=0c2f866d72ebd50fab51ab75f1cdcd34da90d3a5 npx vite build --logLevel error`; `dist/index.html`
stamps `0c2f866`. The node side of every check is the working tree's `src/physics` / `src/core` / `src/game` (no
physics change in this round; D3 / `mismatchedTick` would have caught a drift).

- `npx tsx harness/hero-ship.mts <frozen>/dist harness/inputs/b1-first-ride/bot-3.json harness/out/hero-ship-r4/b1-<backend> <backend>`
  — **WebKit 26.5 / Apple GPU: PASS** (cold boot 3273 ms, b1 cleared 40.558 s / 0 faults, 4867 ticks with no mismatched
  tick, crash tick 92 → restart 1 tick later, command 0.20 ms / frame 6.6 ms, moving after 1 tick, glError 0, `bike rider`);
  **Chromium 151 / ANGLE Metal (M5 Max): PASS** (boot 3316 ms, same clear / crash / restart, 0.17 ms / 2.6 ms). Both
  byte-proved `bike-rookie(-lod)` + `rider-street-mustard(-lod)`, build unchanged under the run (`b1-webkit.json`, `b1-metal.json`).
- `npx tsx harness/e2e/garage-swap-clip.mts --rounds=1` on the frozen dist, WebKit 874×330@3 touch: **all 10
  combinations + the opening tap: install 7–18 ms, longest rAF gap 18.7–29.6 ms, 0 gaps ≥ 34 ms, 0 requests / 0 bytes
  on every tap**, `heroDoc bike rider` (`garage-swap-table.md`, `garage-swap-log.json`, `garage-swap-sheet.jpg`). The
  GARAGE menu tile tap again needed the `app.goto` fallback (menu finding, unchanged).
- `pnpm harness:gate` (full, frozen dist over `dist/`, loadavg 11–21 / 18): **26/30** — the three SwiftShader timing
  rows (informational: first frame 9.8 s, restart frame p95 659 ms, synced render 9.9 s) and **`boot.readyP50Ms`
  319 ms vs 300** (runs 304 / 543 / 128 / 319 / 479 at loadavg 13.7; the `--only=boot` re-run right after: **274 ms
  PASS**, runs 1373 / 586 / 274 / 272 / 267 at loadavg 10.9 — a load reading, `ship-gate.partial.json`). Everything
  else PASS: clear / Pro clears / crash / fault→control / restart / D1–D8 9/9 / `camera.box` 0/672 / bundle 537.2 KB gz
  of 600 / **heap −10.8 MB per 60 s** (`ship-gate-0c2f866.json`).

Verdict from the harness: ship — the only non-SwiftShader miss is the boot p50 under load, green on the re-sample.
