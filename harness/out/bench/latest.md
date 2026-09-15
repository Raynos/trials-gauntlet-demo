# Bench — cut1 skip — cfc98f8 (dirty tree)

2026-09-15 19:32 UTC · 300 frames/run (60 fps, 2 ticks/frame) · GPU proxy 6 isolated synced frames at the full canvas · CPU pass at a ¼-size canvas (CPU submit is pixel-independent) · 0.6 min wall · loadavg per row · deltas vs `cut0 churn`. **SwiftShader raster ms are a proxy, not phone ms.** Phone ms = model (`harness/bench/model.ts`: 0.9·rtMpx + 0.03·calls + 0.006·ktris + 0.02·texMB/2 + 5.5; ±40 % until the device report).

## Idle screens (phone geometry) — the fixed per-frame cost

The garage / menu frame moves nothing; whatever it costs is paid by every riding frame too. `raf` = the live RAF loop's rendered callbacks (CPU, everything the app does per frame); `render` = ThreeRenderer.render; `game` = Game.render minus the renderer (HUD DOM, audio, getState); `app` = input poll + flow (`app.frame()`).

| screen · tier | raf p50 / p95 / max | render p50 | draws | traverse | shadow | hero | post | other | game | app | hud | raster p50 | calls | tris | meshes | rt Mpx | canvas | model phone ms | heap/600 | load |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| garage · high | 1.69 / 1.82 / 1.8 (+0.31 +23% ↑) | 0.01 (-1.06 -100% ↓) | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.01 | 0.00 | 0.1 (-537 -100% ↓) | 0 (-192 -100% ↓) | 0k | 698 | 10.07 | 1864×860 | 15.1 (-6.9 -31% ↓) | +0.67 | 6.6 |
| menu · high | 0.00 / 0.00 / 0.0 (=) | 0.00 (=) | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.01 | 0.00 | 0.1 (=) | 0 (-112 -100% ↓) | 0k | 698 | 10.07 | 1864×860 | 15.1 (-3.9 -21% ↓) | +0.08 | 9.2 |
| garage · low | 1.20 / 1.35 / 1.4 (-0.16 -11% ↓) | 0.01 (-0.72 -99% ↓) | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.01 | 0.00 | 0.1 (-198 -100% ↓) | 0 (-112 -100% ↓) | 0k | 575 | 0.66 | 932×430 | 6.5 (-3.9 -38% ↓) | +1.21 | 5.4 |
| menu · low | 0.00 / 0.00 / 0.0 (=) | 0.00 (=) | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.01 | 0.00 | 0.1 (=) | 0 (-112 -100% ↓) | 0k | 576 | 0.66 | 932×430 | 6.5 (-3.9 -38% ↓) | +0.05 | 8.2 |

## Columns

- **submit** ThreeRenderer.render CPU ms (`window.__render.render`, wrapped); **draws** = `renderBufferDirect` outside the shadow pass (material + uniform setup + the GL call); **traverse** = scene-pass `renderer.render` − shadow − draws (projectObject, cull, sort, lights); **shadow** = `WebGLShadowMap.render` CPU; **hero** = bike + rider `update`; **post** = the composer's quad passes (CPU); **game** = hook total − render (Game.render: HUD DOM, audio, getState); **physics** = 2 ticks.
- **raster** SwiftShader ms for one isolated frame (queue drained → render → 1×1 readPixels, minus the submit) at the full canvas. Monotone in fragment + vertex work; ≈ 100× a phone GPU and ~3× a pipelined SwiftShader frame.
- **wMB / model gpu** the GPU work model: Σ pass px × bytes × weight (scene 2.5, composite 1.6, ao 1.5, bloom 1–1.2, shadow 0.5) → ms = 0.2·wMB + 0.0035·ktris + 0.005·calls.
- **heap** JS heap delta over the CPU pass with a forced GC before and after (the hook path: game + renderer). **blk** frames over 20 ms in the CPU pass (GL ring back-pressure, not JS).
- **calls / tris** are the GPU pass' median frame (all passes, shadow included); **rt Mpx / MB** every render-target write per frame incl. the shadow map.
