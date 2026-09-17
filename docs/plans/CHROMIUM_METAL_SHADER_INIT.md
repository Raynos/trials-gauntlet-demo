# Chromium/Metal shader initialization

Split out of `project/archive/HERO_OPEN_WORK.md` §3 on 2026-09-16. Owner: the perf / render owner
(`src/render/index.ts`, `resourceRetirement.ts`). One bug with its own ship gate; closes in one round if it no longer
reproduces. The tracker is [README.md](README.md).

## The defect

On the R15 frozen build, Chromium on Metal logged twelve `GL_INVALID_VALUE: glGetProgramiv: Program object expected`
warnings with GL error 1281 first checked at replay tick 2. Per-query measurement placed the error after
`getProgramInfoLog` in Three's `WebGLProgram.onFirstUse` under `CubeCamera.update`, but queued errors mean that is
not proven to be the generator. Full write-up: [gl-investigation.md](../evidence/hero-r15/gl-investigation.md).

Tried and rejected: a log-query ordering change (failed in isolation, run 07); forced synchronous `LINK_STATUS` after
every `linkProgram` (passed, run 08, but it is a linking-timing diagnostic, not a startup-performance-preserving fix);
`getError` after every GL call (passed by changing timing — not admissible). SwiftShader repro was cancelled for
duration, not concluded. Desktop WebKit gates pass and prove nothing about this.

## Why it may already be closed

Render r15 (`5b56431`) ported Astra's `ResourceRetirement`: detached owners' programs are retired through their
async link, with context-loss and program-release handling — the exact path the investigation circled. Nothing has
re-checked the error on a build with that layer.

## Sequence

1. Reproduce on the current build: Chromium (Metal, not SwiftShader), `harness/inputs/b1-first-ride/bot-3.json`, no
   diagnostic wrappers, console + `getError` at the existing checkpoints only. Record the result either way in
   `docs/evidence/chromium-metal/`.
2. If it reproduces: bisect the first async-link consumer (`CubeCamera` / env-map prewarm vs the hero's material
   compile) and fix at the source — the fix must keep shader diagnostics and startup time (bench `stalePrograms` row
   unchanged, boot-to-first-frame within the current gate).
3. Ship gate on Chromium/Metal **and** WebKit: cold boot, clear, crash, one-tick restart; bench + WebKit hero gate
   (G11 rows) unchanged.

## Done when

Zero GL errors on a Chromium/Metal cold boot → clear → crash → restart of b1 on an unmodified build, with the
perf rows unchanged; or a recorded non-repro on the current build, in which case this plan closes as
"fixed by r15" with the evidence linked.
