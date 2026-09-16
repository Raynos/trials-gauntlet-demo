# Legacy rider arm hotfix

## Current main already fixes accumulation

**Do not apply the original four-line patch on top of current main.** Since the first experiment, main independently added `restorePositions()` at `update()` entry. A fresh 12-run Node matrix confirms that current implementation fixes the idle-history drift too. No main files were edited by this task.

[main-arm-reset.patch](main-arm-reset.patch) preserves the original tested fix for an unpatched renderer: restore each bone's captured bind-local position at entry to `poseFromChain()`. Additive clip translations otherwise accumulate on shoulders across draws and cuts. It changes no physics, assets, public API or draw pipeline.

[current-main-ragdoll-preserve.patch](current-main-ragdoll-preserve.patch) is the applicable follow-up for the current main file: move its existing reset call and explanation into `poseFromChain()`; do not add another reset. A direct transform audit with real B1 crashes found that update-entry reset changes the pelvis before ragdoll handover snapshots it: **382.7 mm** displacement at both 30/60 FPS in full/LOD models. The relocated-call candidate preserves that snapshot exactly (0 displacement), including the first crash pose. The parent played both local browser intervention clips in QuickTime. The relocation preserves the handover numerically; both clips still show abrupt crash motion, so no broader crash-quality improvement is claimed. Both variants restore a fresh pose on restart.

The current-main source differs from the original tested source only by that update-entry reset and its helper (imports normalized for the scratch comparison). The original deployed-bundle videos below establish the old drift's cause; they do not claim to test current main. Both source hashes and separate experiments are recorded in [manifest.json](manifest.json). Apply checks are read-only; no patch was applied or committed in main.

## Evidence and limits

- Node regression: actual legacy full/LOD GLBs, 30/60 FPS, cold/22-second/44-second idle histories and cuts. Candidate anchors **and skinned arm surface** match cold replay exactly across histories. A real physics-produced ragdoll followed by reattachment and restart restores the fresh neutral pose. Untouched controls fail the history/reset checks. All 12 replay end-state hashes match; finish time stays **41.55833333333333 s**.
- Played evidence, judged by the parent in native QuickTime: contiguous 12-second trims from video second 160 of each real eight-stage benchmark. Baseline arm mesh trails behind the bike at simulation times 1.958 and 8.275 s; candidate stays at the bars at 1.792 and 5.242 s. No repeated frames were authored. Full reports contain 350/348 samples, no errors, and identical hashes for all nine consumed responses. Candidate prototype patch was installed once and called 9,088 times.
- Browser validation used headless Chromium/Metal at phone-like geometry, **not on-device iOS Safari**. The deployed build was unchanged; the candidate was a local in-page method wrapper matching the patch.
- **Extreme reach remains: 127.1 mm maximum sampled patched-browser wrist error versus 2.4848 m baseline.** Node probe found no falsely-green hand-contact result above 1 cm. This repairs accumulating translations, not every unreachable pose.

## Reproduction and provenance

Large videos, reports and scratch harnesses remain in ignored `harness/out/blender/` paths. [manifest.json](manifest.json) binds their bytes, source hashes and parent review observations. Paths are repository-relative. Run `python3 docs/evidence/arms-hotfix/verify.py` to verify retained artifacts (missing ignored files fail clearly).

Existing numeric reproduction: `pnpm exec tsx harness/out/blender/arms-hotfix/probe.ts`, then `pnpm exec tsx harness/out/blender/arms-hotfix/regression.ts`. They contain scratch baseline/candidate renderer copies, resolved imports to the original main checkout, and material-free in-memory GLB decoding. On another machine, replace `/Users/raynos/projects/game-demos/trials-gauntlet-demo` in the scratch TypeScript files with the intended main checkout path. These scripts do not edit that checkout. Hashes describe the completed run; rerunning against changed dependencies is a new experiment.

The browser reproduction scripts and both reviewed clips are listed in the manifest. Only this small patch and provenance are durable here; the parent owns plan status and the branch commit.

Current-main numeric matrix: `pnpm exec tsx harness/out/blender/arms-hotfix/current-main/probe.ts`, then `pnpm exec tsx harness/out/blender/arms-hotfix/current-main/regression.ts`. Crash snapshot comparison: `pnpm exec tsx harness/out/blender/arms-hotfix/current-main/continuity.ts` (exact current renderer versus exact relocated-call copy).

Short crash-placement videos are now recorded under `harness/out/blender/arms-hotfix/current-main/crash-video/{update,poseFromChain}/review.mp4`. They use the unchanged live legacy bundle with a local wrapper matching each placement; actual RAF advances physics and renders each sampled state. Both reach crash tick 90 at 0.741667 s; browser snapshot displacement is 382.697 mm versus zero, with no page errors. Parent playback review is pending for these two clips. They include boot plus 4.5 seconds of gameplay, with no authored repeated frames.
