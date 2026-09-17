# Bench — ask61-62 world crowd+tarp — 7573b06 (dirty tree)

2026-09-17 13:53 UTC · 600 frames/run (60 fps, 2 ticks/frame) · GPU proxy 10 isolated synced frames at the full canvas · CPU pass at a ¼-size canvas (CPU submit is pixel-independent) · 3.5 min wall · loadavg per row · deltas vs `ask60-authored-in-level`. **SwiftShader raster ms are a proxy, not phone ms.** Phone ms = model (`harness/bench/model.ts`, recalibrated from device report #1: 4.4·effMpx + 0.02·calls + 0.004·ktris + 1; ±25 %). Phone geometry = 874×330 @ 3 with the phone device class since 2026-09-15 (was 932×430).

## Idle screens (phone geometry) — the fixed per-frame cost

The garage / menu frame moves nothing; whatever it costs is paid by every riding frame too. `raf` = the live RAF loop's rendered callbacks (CPU, everything the app does per frame); `render` = ThreeRenderer.render; `game` = Game.render minus the renderer (HUD DOM, audio, getState); `app` = input poll + flow (`app.frame()`).

| screen · tier | raf p50 / p95 / max | render p50 | draws | traverse | shadow | hero | post | other | game | app | hud | raster p50 | calls | tris | meshes | rt Mpx | canvas | model phone ms | heap/600 | load |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| garage · high | 2.21 / 2.29 / 2.3 (-0.47 -18% ↓) | 0.02 (=) | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.01 | 0.00 | 0.01 | 0.01 | 0.2 (=) | 115 (+11 +11% ↑) | 290k | 74 | 2.08 | 1092×412 | 13.6 (+4.4 +48% ↑) | +1.60 | 43.9 |
| menu · high | 0.00 / 0.00 / 0.0 (=) | 0.00 (=) | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.01 | 0.00 | 0.1 (=) | 89 (=) | 286k | 474 | 1.59 | 1311×495 | 8.9 (=) | +0.10 | 43.3 |
| garage · low | 1.51 / 1.56 / 1.6 (+0.06 +4% ↑) | 0.02 (+0.01 +300% ↑) | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.01 | 0.00 | 0.01 | 0.00 | 0.2 (=) | 89 (=) | 286k | 74 | 0.55 | 874×330 | 6.3 (=) | +0.18 | 44.2 |
| menu · low | 0.00 / 0.00 / 0.0 (=) | 0.00 (=) | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.01 | 0.00 | 0.1 (=) | 89 (=) | 286k | 505 | 2.08 | 1092×412 | 13.1 (+6.8 +108% ↑) | +0.16 | 42.5 |

## phone — riding, golden replay from tick 0

| tier · track | submit p50 / p95 | draws | traverse | shadow | hero | post | game | physics | raster p50 / p95 | calls | tris | prog | tex MB | rt Mpx / MB | hero tris | shadow | canvas | wMB | model gpu | model phone ms | heap | blk | load |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| high · b1 | 1.80 (-0.23 -11% ↓) / 2.73 | 0.97 | 0.28 | 0.14 | 0.18 | 0.17 | 0.00 | 0.04 | 225.2 (-469 -68% ↓) / 1845.9 | 145 (+6 +4% ↑) | 251k (+12 +5% ↑) | 54 | 83.1 | 1.59 / 9.7 (=) | 92k | 512 | 1311×495 | 14.4 | 4.48 | 9.9 (+0.2 +2% ↑) | +0.74 | 0 | 34.1 |
| low · b1 | 0.77 (+0.07 +10% ↑) / 1.25 | 0.30 | 0.20 | 0.09 | 0.14 | 0.00 | 0.00 | 0.02 | 81.3 (+25 +45% ↑) / 145.6 | 102 (-6 -6% ↓) | 102k (+24 +30% ↑) | 45 | 52.4 | 0.55 / 4.2 (=) | 14k | 512 | 874×330 | 6.5 | 2.17 | 5.9 (=) | +0.16 | 0 | 30.8 |

Per-tier means (phone): **high** submit 1.80 ms · raster 225.2 ms · 145 calls · 251k tris · 1.59 Mpx · model phone 9.9 ms · **low** submit 0.77 ms · raster 81.3 ms · 102 calls · 102k tris · 0.55 Mpx · model phone 5.9 ms

## Columns

- **submit** ThreeRenderer.render CPU ms (`window.__render.render`, wrapped); **draws** = `renderBufferDirect` outside the shadow pass (material + uniform setup + the GL call); **traverse** = scene-pass `renderer.render` − shadow − draws (projectObject, cull, sort, lights); **shadow** = `WebGLShadowMap.render` CPU; **hero** = bike + rider `update`; **post** = the composer's quad passes (CPU); **game** = hook total − render (Game.render: HUD DOM, audio, getState); **physics** = 2 ticks.
- **raster** SwiftShader ms for one isolated frame (queue drained → render → 1×1 readPixels, minus the submit) at the full canvas. Monotone in fragment + vertex work; ≈ 100× a phone GPU and ~3× a pipelined SwiftShader frame.
- **wMB / model gpu** the GPU work model: Σ pass px × bytes × weight (scene 2.5, composite 1.6, ao 1.5, bloom 1–1.2, shadow 0.5) → ms = 0.2·wMB + 0.0035·ktris + 0.005·calls.
- **heap** JS heap delta over the CPU pass with a forced GC before and after (the hook path: game + renderer). **blk** frames over 20 ms in the CPU pass (GL ring back-pressure, not JS).
- **calls / tris** are the GPU pass' median frame (all passes, shadow included); **rt Mpx / MB** every render-target write per frame incl. the shadow map.
