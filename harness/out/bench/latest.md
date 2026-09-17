# Bench — riderlod-rule — b0985ee (dirty tree)

2026-09-17 05:23 UTC · 300 frames/run (60 fps, 2 ticks/frame) · GPU proxy 2 isolated synced frames at the full canvas · CPU pass at a ¼-size canvas (CPU submit is pixel-independent) · 1.4 min wall · loadavg per row · deltas vs `hero-tex-half`. **SwiftShader raster ms are a proxy, not phone ms.** Phone ms = model (`harness/bench/model.ts`, recalibrated from device report #1: 4.4·effMpx + 0.02·calls + 0.004·ktris + 1; ±25 %). Phone geometry = 874×330 @ 3 with the phone device class since 2026-09-15 (was 932×430).

## Idle screens (phone geometry) — the fixed per-frame cost

The garage / menu frame moves nothing; whatever it costs is paid by every riding frame too. `raf` = the live RAF loop's rendered callbacks (CPU, everything the app does per frame); `render` = ThreeRenderer.render; `game` = Game.render minus the renderer (HUD DOM, audio, getState); `app` = input poll + flow (`app.frame()`).

| screen · tier | raf p50 / p95 / max | render p50 | draws | traverse | shadow | hero | post | other | game | app | hud | raster p50 | calls | tris | meshes | rt Mpx | canvas | model phone ms | heap/600 | load |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| garage · high | 1.80 / 2.03 / 2.0 (-0.86 -32% ↓) | 0.01 (=) | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.01 | 0.00 | 0.1 (=) | 104 (=) | 208k | 74 | 1.59 | 1311×495 | 8.9 (=) | +1.38 | 15.6 |
| menu · high | 0.00 / 0.00 / 0.0 (=) | 0.00 (=) | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.01 | 0.00 | 0.1 (=) | 104 (=) | 208k | 809 | 1.59 | 1311×495 | 8.9 (=) | +0.02 | 17.1 |

## phone — riding, golden replay from tick 0

| tier · track | submit p50 / p95 | draws | traverse | shadow | hero | post | game | physics | raster p50 / p95 | calls | tris | prog | tex MB | rt Mpx / MB | hero tris | shadow | canvas | wMB | model gpu | model phone ms | heap | blk | load |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| high · b1 | 1.06 (-0.13 -11% ↓) / 1.45 | 0.58 | 0.16 | 0.09 | 0.10 | 0.10 | 0.00 | 0.02 | 106.6 (-16 -13% ↓) / 602.9 | 139 (=) | 82k (-102 -55% ↓) | 51 | 77.5 | 1.59 / 9.7 (=) | 14k | 512 | 1311×495 | 14.4 | 3.86 | 9.1 (-0.4 -4% ↓) | +0.50 | 0 | 16.5 |

Per-tier means (phone): **high** submit 1.06 ms · raster 106.6 ms · 139 calls · 82k tris · 1.59 Mpx · model phone 9.1 ms

## Columns

- **submit** ThreeRenderer.render CPU ms (`window.__render.render`, wrapped); **draws** = `renderBufferDirect` outside the shadow pass (material + uniform setup + the GL call); **traverse** = scene-pass `renderer.render` − shadow − draws (projectObject, cull, sort, lights); **shadow** = `WebGLShadowMap.render` CPU; **hero** = bike + rider `update`; **post** = the composer's quad passes (CPU); **game** = hook total − render (Game.render: HUD DOM, audio, getState); **physics** = 2 ticks.
- **raster** SwiftShader ms for one isolated frame (queue drained → render → 1×1 readPixels, minus the submit) at the full canvas. Monotone in fragment + vertex work; ≈ 100× a phone GPU and ~3× a pipelined SwiftShader frame.
- **wMB / model gpu** the GPU work model: Σ pass px × bytes × weight (scene 2.5, composite 1.6, ao 1.5, bloom 1–1.2, shadow 0.5) → ms = 0.2·wMB + 0.0035·ktris + 0.005·calls.
- **heap** JS heap delta over the CPU pass with a forced GC before and after (the hook path: game + renderer). **blk** frames over 20 ms in the CPU pass (GL ring back-pressure, not JS).
- **calls / tris** are the GPU pass' median frame (all passes, shadow included); **rt Mpx / MB** every render-target write per frame incl. the shadow map.
