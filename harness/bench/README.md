# `harness/bench` — the perf bench (performance owner)

Repeatable, deterministic, comparable across commits. Every number in `project/archive/PERF.md` comes from here.

| command | what | output |
|---|---|---|
| `pnpm harness:bench` | idle screens (garage, menu × tier, phone context) then the matrix tier × track × geometry: golden replay from tick 0, 600 frames at 60 fps | `harness/out/bench/latest.md`, `ledger.jsonl` (tracked), `<sha>-<tier>-<track>-<geom>.json` (per-frame, untracked) |
| `pnpm harness:bench --repeat 2` | the same twice in one process + a spread table (the ±5 % proof) | `latest.md` gains a Repeatability section |
| `pnpm harness:bench --tiers low --tracks b1,h3 --geoms phone --frames 300 --no-idle` | a subset (any flag) | |
| `pnpm harness:bench:profile [--tiers high,low] [--track b1] [--frames 300] [--dist]` | V8 sampling CPU profile + sampling heap (allocation) profile of the frame, against the Vite dev server (real names) | `profile-latest.md`, `profile-<sha>-<tier>-<track>.json` |
| `pnpm exec tsx harness/bench/webkit.ts [--track b1] [--tiers low,medium,high] [--frames 240] [--geom phone]` | Metal-path proxy: Playwright WebKit (ANGLE-on-Metal, this Mac's GPU), every frame synced — tier ratios on the same driver family as iOS Safari | `webkit-latest.md` |
| `pnpm exec tsx harness/bench/det.ts [--track b1] [--tiers high,low] [--geom desktop\|phone] [--label X]` | determinism pair: two fresh pages, canvas md5 at 15 ticks per tier, stills at first / middle / last | `det/<label>/` |
| `pnpm exec tsx harness/bench/ab.ts [--switch skinArray\|merge] [--track b1] [--tiers high,medium,low] [--geom phone\|desktop] [--ticks 400,800,1200]` | in-page A/B of a cut behind a harness switch (cut #4b's skin array, cut #4a's merge): same page, same golden, off then on, calls / tris / GL error per tick + the pixel diff (px differing, px beyond 8/255, max delta, bbox) — the pixel-neutrality comparator | stdout, stills in `ab/<switch>-<track>-<geom>/` |
| `pnpm exec tsx harness/bench/diag-programs.ts [--track b1] [--tiers high,low]` | program-churn diagnostic: which materials make three re-acquire a program per draw, and why (two-pass DoubleSide, shared across instanced/plain/skinned, needsUpdate) | stdout |

Flags: `--quick` (loop preset: phone geometry, b1/h3/e2, 300 frames, 6 GPU samples — ≈ 12 min at loadavg 30) · `--report-only [--label X]` (rebuild `latest.md` from the ledger without running) · `--tiers high,medium,low` · `--tracks b1,b3,e2,m2,h1,h3,x1` (short ids, or full track ids) · `--geoms phone,desktop,<w>x<h>@<dpr>` · `--frames 600` · `--gpu-samples 10` · `--full` (CPU pass at the full canvas) · `--label "…"` · `--build` (rebuild dist first) · `--dev` (vite dev server) · `--no-idle` · `--no-matrix` · `--drain-every 30` · `--sample-every 30`.

## What is measured, and how (`page.ts`)

The page hook `window.__render` (the `ThreeRenderer`) is wrapped in place — `frames.build`, `rig.update`, `bike/rider.update`, `renderer.render`, `renderer.renderBufferDirect`, `renderer.shadowMap.render` — with `performance.now()` timers; nothing in the render path changes and the per-frame records are preallocated typed arrays.

- **CPU pass**: 600 frames through the hook's `render(false)`; per frame the split `build / rig / hero / shadow / draws / traverse / post / other / game / physics`, draw calls, triangles; `debugInfo()` every 30th frame; JS heap delta with a forced GC before and after. It runs on a **¼-size canvas**: CPU submit does not depend on pixel count, and at the full canvas SwiftShader's raster queue (0.2–0.7 s per high frame on this host) blocks the main thread — `blk` counts frames over 20 ms so a polluted run is visible. `--full` runs it at the full canvas.
- **GPU pass**: 10 isolated frames spread over the window at the **full** geometry, each `finish → render → finish` (1×1 readPixels) — SwiftShader raster ms for one frame. Not phone ms: a monotone proxy for fragment + vertex work. The pass list (`rtPasses`), canvas size, calls/tris and the GPU work model come from this pass.
- **Idle screens** (`idle.ts`): the front page in an emulated phone context (932×430, coarse pointer, iPhone UA → `isPhone()`: 30 cap, `low` default), `goto('garage')` / `goto('menu')`, each tier: 2.5 s of the app's own RAF loop timed by a `requestAnimationFrame` shim (host-bound: the compositor syncs each rendered frame to SwiftShader, so `raf` p50 ≈ raster ms — trust the held numbers), then the loop held and the frame decomposed by hand (`app.frame()` poll + flow, `render(false)` split, `hudMs`, six synced frames, heap over 120 frames, a mesh census).

Geometries: `phone` = 932×430 CSS @ DPR 3 (the user's iPhone class; the tier caps it: low → DPR 1 = 932×430, medium 1.25 = 1165×537, high 2 = 1864×860); `desktop` = 1280×720 @ 1.

Tier order is high → medium → low with the tracks inside: `setQuality('low')` halves the hero atlases for the rest of the session. The track is re-loaded between the two passes (the clean reset of rig / particles / frame history).

## Models (`model.ts`)

- **GPU work model**: Σ pass px × bytes × weight (scene 2.5, composite 1.6, ao 1.5, bloom 1–1.2, shadow 0.5) = weighted MB → `0.2·wMB + 0.0035·ktris + 0.005·calls` ms on an A17-class GPU.
- **Phone frame model**: `0.9·rtMpx + 0.03·calls + 0.006·ktris + 0.02·texMB/2 + 5.5` ms, ±40 % — two calibration points from the user's iPhone (PERF.md §2). Refit when the `?bench=1` device report lands (`RECALIBRATE_NOTE`).

## Reading `latest.md`

Rows are grouped by `--label` when one is given (a named baseline may span several of the parent's commits — the tree is dirty during a round anyway) else by sha. Deltas are against the same key's newest row from the previous group in `ledger.jsonl` (`↓` better, `↑` worse). Loadavg sits beside every row; anything measured above 20 is re-run before it is quoted. SwiftShader ms scale with host load — the calls / tris / Mpx / MB columns and the CPU split ratios are the stable comparators.
