# Bench — 539e500 (dirty tree) — smoke2

2026-09-15 03:07 UTC · 120 frames/run (60 fps, 2 ticks/frame) · GPU proxy 4 isolated synced frames at the full canvas · CPU pass at a ¼-size canvas (CPU submit is pixel-independent) · 2.3 min wall · loadavg per row · deltas vs nothing (first ledger entry). **SwiftShader raster ms are a proxy, not phone ms.** Phone ms = model (`harness/bench/model.ts`: 0.9·rtMpx + 0.03·calls + 0.006·ktris + 0.02·texMB/2 + 5.5; ±40 % until the device report).

## Idle screens (phone geometry) — the fixed per-frame cost

The garage / menu frame moves nothing; whatever it costs is paid by every riding frame too. `raf` = the live RAF loop's rendered callbacks (CPU, everything the app does per frame); `render` = ThreeRenderer.render; `game` = Game.render minus the renderer (HUD DOM, audio, getState); `app` = input poll + flow (`app.frame()`).

| screen · tier | raf p50 / p95 / max | render p50 | draws | traverse | shadow | hero | post | other | game | app | hud | raster p50 | calls | tris | meshes | rt Mpx | canvas | model phone ms | heap/600 | load |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| garage · low | 165.57 / 393.45 / 393.4 | 0.79 | 0.34 | 0.25 | 0.10 | 0.05 | 0.00 | 0.01 | 0.00 | 0.01 | 0.01 | 163.2 | 113 | 99k | 575 | 0.66 | 932×430 | 10.5 | +1.02 | 32.1 |
| menu · low | 1.27 / 350.52 / 402.5 | 0.74 | 0.33 | 0.24 | 0.10 | 0.04 | 0.00 | 0.01 | 0.00 | 0.01 | 0.01 | 235.1 | 113 | 99k | 575 | 0.66 | 932×430 | 10.5 | +0.99 | 35.5 |

## Columns

- **submit** ThreeRenderer.render CPU ms (`window.__render.render`, wrapped); **draws** = `renderBufferDirect` outside the shadow pass (material + uniform setup + the GL call); **traverse** = scene-pass `renderer.render` − shadow − draws (projectObject, cull, sort, lights); **shadow** = `WebGLShadowMap.render` CPU; **hero** = bike + rider `update`; **post** = the composer's quad passes (CPU); **game** = hook total − render (Game.render: HUD DOM, audio, getState); **physics** = 2 ticks.
- **raster** SwiftShader ms for one isolated frame (queue drained → render → 1×1 readPixels, minus the submit) at the full canvas. Monotone in fragment + vertex work; ≈ 100× a phone GPU and ~3× a pipelined SwiftShader frame.
- **wMB / model gpu** the GPU work model: Σ pass px × bytes × weight (scene 2.5, composite 1.6, ao 1.5, bloom 1–1.2, shadow 0.5) → ms = 0.2·wMB + 0.0035·ktris + 0.005·calls.
- **heap** JS heap delta over the CPU pass with a forced GC before and after (the hook path: game + renderer). **blk** frames over 20 ms in the CPU pass (GL ring back-pressure, not JS).
- **calls / tris** are the GPU pass' median frame (all passes, shadow included); **rt Mpx / MB** every render-target write per frame incl. the shadow map.
