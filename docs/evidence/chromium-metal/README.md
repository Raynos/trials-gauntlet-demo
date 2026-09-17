# Chromium/Metal GL 1281 — non-repro, 2026-09-16

Question from `CHROMIUM_METAL_SHADER_INIT.md`: does the `GL_INVALID_VALUE: glGetProgramiv: Program object expected`
startup error (twelve warnings, first checked at replay tick 2, seen 2026-09-15 20:49–20:54 on Astra's frozen
`r15-r7-dist`) still occur on the current build?

**No — and it no longer occurs on the original build either.** 18/18 unmodified `hero-ship.mts` runs on real Metal
(`ANGLE Metal Renderer: Apple M5 Max`, Chromium 151.0.7922.34 — the same Chromium as the failing runs) with zero GL
errors, b1 cleared, crash at tick 90/92, one-tick restart, `glError 0` at finish. Rows in
[runs-2026-09-16.json](runs-2026-09-16.json); one full HEAD report in [head-2720070-metal-report.json](head-2720070-metal-report.json).

| build | condition | runs | result |
|---|---|---|---|
| HEAD `2720070` (git-archive export, `vite build`) | warm cache, idle | 5 | pass |
| HEAD | Pro recording `bot-3-pro.json` | 1 | pass |
| HEAD | app-level Metal shader cache denied via `sandbox-exec` (cold boot 4.2–4.5 s vs 2.5 s warm) | 3 | pass |
| HEAD | 14 busy loops + a SwiftShader gate, load average 37 → 105 | 2 | pass |
| `11eaca5` = `5b56431^` (the commit before render r15's `ResourceRetirement`) | warm, idle | 1 | pass |
| `r15-r7-dist` — the exact build that failed 5/5 on 09-15 | warm, idle | 4 | pass |
| `r15-r7-dist` | three gates concurrently (cold boot up to 8.9 s) | 3 | pass |

So the defect is **not** attributable to code: the commit before r15 passes, and the bytes that failed on 09-15 pass
today under the same browser. It was machine state on the evening of 09-15 (Astra's Blender renders, several
SwiftShader gates and browser sessions running at once). Neither CPU starvation nor Metal contention alone brings it
back today.

**Residual, untested:** a *fully* cold `MTLCompilerService` cache. The sandbox only denied the app-level cache
(`$DARWIN_USER_CACHE_DIR/com.google.chrome.for.testing.helper/com.apple.metal`); the compiler service's own cache
(`$DARWIN_USER_CACHE_DIR/com.apple.metal`, 1.7 GB) is a separate process and was warm for every run. Testing it means
moving those two directories aside (they regenerate), which the commit guard refuses for an agent — the recipe is
in `project/human-in-the-loop/QUEUE.md`. If a first-ever Chrome/macOS visit is the trigger, it would show there.

The original `r15-r7-dist` and its nine diagnostic runs lived in the `trials-gauntlet-blender` worktree, which was
removed during this session; their conclusions survive in [hero-r15/gl-investigation.md](../hero-r15/gl-investigation.md).
