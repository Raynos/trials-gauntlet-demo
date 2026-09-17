# Bench — ask43 r4 setTier whenReady — 4f27f47 (dirty tree)

2026-09-17 07:26 UTC · 300 frames/run (60 fps, 2 ticks/frame) · GPU proxy 10 isolated synced frames at the full canvas · CPU pass at a ¼-size canvas (CPU submit is pixel-independent) · 1.2 min wall · loadavg per row · deltas vs `street-r4`. **SwiftShader raster ms are a proxy, not phone ms.** Phone ms = model (`harness/bench/model.ts`, recalibrated from device report #1: 4.4·effMpx + 0.02·calls + 0.004·ktris + 1; ±25 %). Phone geometry = 874×330 @ 3 with the phone device class since 2026-09-15 (was 932×430).

## Idle screens (phone geometry) — the fixed per-frame cost

The garage / menu frame moves nothing; whatever it costs is paid by every riding frame too. `raf` = the live RAF loop's rendered callbacks (CPU, everything the app does per frame); `render` = ThreeRenderer.render; `game` = Game.render minus the renderer (HUD DOM, audio, getState); `app` = input poll + flow (`app.frame()`).

| screen · tier | raf p50 / p95 / max | render p50 | draws | traverse | shadow | hero | post | other | game | app | hud | raster p50 | calls | tris | meshes | rt Mpx | canvas | model phone ms | heap/600 | load |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| garage · high | 1.34 / 297.19 / 297.2 (-0.33 -20% ↓) | 0.01 (=) | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.01 | 0.00 | 0.1 (=) | 115 (+11 +11% ↑) | 208k | 74 | 2.08 | 1092×412 | 13.3 (+4.4 +49% ↑) | +1.62 | 6.6 |
| menu · high | 0.00 / 0.00 / 0.0 (=) | 0.00 (=) | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.1 (=) | 115 (+11 +11% ↑) | 208k | 809 | 1.59 | 1311×495 | 9.1 (+0.2 +2% ↑) | +0.10 | 6.5 |

## phone — riding, golden replay from tick 0

| tier · track | submit p50 / p95 | draws | traverse | shadow | hero | post | game | physics | raster p50 / p95 | calls | tris | prog | tex MB | rt Mpx / MB | hero tris | shadow | canvas | wMB | model gpu | model phone ms | heap | blk | load |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| high · b1 | 0.94 (+0.04 +4% ↑) / 1.24 | 0.53 | 0.14 | 0.07 | 0.10 | 0.08 | 0.00 | 0.01 | 97.6 (-19 -17% ↓) / 479.9 | 142 (+3 +2% ↑) | 85k (-155 -65% ↓) | 52 | 77.5 | 1.59 / 9.7 (=) | 14k | 512 | 1311×495 | 14.4 | 3.88 | 9.2 (-0.5 -5% ↓) | +0.47 | 0 | 7.6 |

Per-tier means (phone): **high** submit 0.94 ms · raster 97.6 ms · 142 calls · 85k tris · 1.59 Mpx · model phone 9.2 ms

## Columns

- **submit** ThreeRenderer.render CPU ms (`window.__render.render`, wrapped); **draws** = `renderBufferDirect` outside the shadow pass (material + uniform setup + the GL call); **traverse** = scene-pass `renderer.render` − shadow − draws (projectObject, cull, sort, lights); **shadow** = `WebGLShadowMap.render` CPU; **hero** = bike + rider `update`; **post** = the composer's quad passes (CPU); **game** = hook total − render (Game.render: HUD DOM, audio, getState); **physics** = 2 ticks.
- **raster** SwiftShader ms for one isolated frame (queue drained → render → 1×1 readPixels, minus the submit) at the full canvas. Monotone in fragment + vertex work; ≈ 100× a phone GPU and ~3× a pipelined SwiftShader frame.
- **wMB / model gpu** the GPU work model: Σ pass px × bytes × weight (scene 2.5, composite 1.6, ao 1.5, bloom 1–1.2, shadow 0.5) → ms = 0.2·wMB + 0.0035·ktris + 0.005·calls.
- **heap** JS heap delta over the CPU pass with a forced GC before and after (the hook path: game + renderer). **blk** frames over 20 ms in the CPU pass (GL ring back-pressure, not JS).
- **calls / tris** are the GPU pass' median frame (all passes, shadow included); **rt Mpx / MB** every render-target write per frame incl. the shadow map.
