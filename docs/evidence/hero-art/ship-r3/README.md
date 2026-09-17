# Hero art — third-round ship gate on HEAD `4f27f47` (ask 43, 2026-09-17 01:20–01:48)

Build frozen from the commit, not the tree: `git archive 4f27f47 | tar -x -C <scratch>`, `node_modules` symlinked,
`VERCEL_GIT_COMMIT_SHA=4f27f476869947e7d3f6d2aa212fc10b8db340da npx vite build --logLevel error` (the config refuses
to stamp a build without a sha; git is absent inside an archive). `dist/index.html` reads `4f27f47`; 58 model files.
The node side of every check is the working tree's `src/physics` / `src/core` / `src/game` (fingerprint `4b9bc981`,
unchanged by the render owner's boot edits); D3 / `mismatchedTick` would have caught a drift.

- `npx tsx harness/hero-ship.mts <frozen>/dist harness/inputs/b1-first-ride/bot-3.json harness/out/hero-ship-r3/b1-<backend> <backend>`
  — **WebKit 26.5 (Apple GPU): PASS**, cold boot 4226 ms, b1 cleared 40.558 s / 0 faults, 4867 ticks with no mismatched
  tick, crash at tick 92 → restart 1 tick later, restart command 0.30 ms / frame 18.7 ms, bike moving after 1 tick,
  glError 0, `bike rider`. **Chromium 151 on ANGLE Metal (M5 Max): PASS**, cold boot 3461 ms, same clear / crash /
  restart, command 0.25 ms / frame 17.8 ms. Both served `bike-rookie(-lod)` + `rider-street-mustard(-lod)` byte-proven,
  build unchanged under the run (`b1-webkit.json`, `b1-metal.json`; full reports in `harness/out/hero-ship-r3/`).
- `pnpm harness:gate` (full, the frozen dist copied over `dist/`; loadavg 17–40 / 18 — another owner's A/B ran
  alongside): **26/30**; `heap.growthMBPer60s = −6.61 MB` (limit 5; round-1 reading was +5.39 on the dirty tree),
  bundle 533.07 KB gz / 600, boot ready p50 in limit, clear / Pro clears / crash / fault→control / restart / D1–D8 all
  PASS; the three SwiftShader timing rows FAIL as always (first frame 12.1 s, restart frame p95 1.72 s, synced render
  18.4 s — 2–3× round 1 under this load); **`camera.box` FAIL is a harness flake**, not a camera miss: the child
  wrote `harness/out/gate/clip-b3-kicker-row/clip.json` with `outOfBoxRiding 0 / 672`, roll 2.8e-17, then exited 1 on
  a socket/pipe error at teardown (`ship-gate-4f27f47.json`).
