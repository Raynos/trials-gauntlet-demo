# R15 frozen Metal GL investigation

Frozen build: `harness/out/blender/r15-r7-dist` (unchanged).
Input: `harness/inputs/b1-first-ride/bot-3.json`.

- Original parent diagnostic and scratch runs01/03: twelve `GL_INVALID_VALUE: glGetProgramiv: Program object expected` warnings, first checked GL error1281 at replay tick2. Error may originate in boot and remain queued until first check.
- Instrumented `isProgram` stayed true; `getProgramParameter` returned valid link/attribute/uniform results. No evidence of deleted-program reuse. Existing main stale-program census remains read-only.
- Run04, with per-query error measurement, observed error1281 after `getProgramInfoLog` in Three `WebGLProgram.onFirstUse`, under `CubeCamera.update`. Because earlier GL calls can queue errors, this does not prove getProgramInfoLog is the original generator.
- Run02 adding getError after all relevant GL operations passed, demonstrating instrumentation changes timing. Its result cannot count as normal rendering acceptance.
- Run06 querying LINK_STATUS before log retrieval with other diagnostic wrappers passed; reduced isolated run07 with only that ordering FAILED. Thus a log-only ordering workaround was rejected.
- Run08 forces LINK_STATUS immediately after every linkProgram; frozen Metal clear/crash/restart passes with no console or GL errors and no error draining. This forces synchronous linking, so it is diagnostic evidence for a linking/driver timing problem, not an accepted performance-preserving product fix.
- The provisional product helper and wiring were fully removed. Rejected helper/test are preserved here; no product edits remain.

Live physics was concurrently edited beginning run05. Runs06+ explicitly set `diagnosticOnly:true`, `physicsComparisonValid:false`: frozen browser replay still clears in40.3s/zero faults, but Node snapshot mismatch against current source is expected and NOT a ship/physics pass. Original frozen-build inventories and GL reports remain available per run.

No shader errors were suppressed and no getError drains were used in reduced run07 or synchronous-link run08. No product build was made.

Run09: unmodified GL query behavior on SwiftShader; launched with `unmodified-gl.mts` against same frozen build. At handoff it is still running (session99295), with no result/error report; no alternate-backend pass claimed. The software full4836tick clear can take substantially longer than Metal. Output will be `run-09/report.json` or `failure.json`.
