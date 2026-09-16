# Bench — render15-port-after — 5b6d21c (dirty tree)

2026-09-16 03:00 UTC · 300 frames/run (60 fps, 2 ticks/frame) · GPU proxy 4 isolated synced frames at the full canvas · CPU pass at a ¼-size canvas (CPU submit is pixel-independent) · 6.5 min wall · loadavg per row · deltas vs `cut3 phone-high`. **SwiftShader raster ms are a proxy, not phone ms.** Phone ms = model (`harness/bench/model.ts`, recalibrated from device report #1: 4.4·effMpx + 0.02·calls + 0.004·ktris + 1; ±25 %). Phone geometry = 874×330 @ 3 with the phone device class since 2026-09-15 (was 932×430).

## phone — riding, golden replay from tick 0

| tier · track | submit p50 / p95 | draws | traverse | shadow | hero | post | game | physics | raster p50 / p95 | calls | tris | prog | tex MB | rt Mpx / MB | hero tris | shadow | canvas | wMB | model gpu | model phone ms | heap | blk | load |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| high · b1 | 0.87 (+0.13 +17% ↑) / 1.17 | 0.48 | 0.13 | 0.06 | 0.09 | 0.09 | 0.00 | 0.02 | 160.6 (+56 +53% ↑) / 1053.6 | 128 (+2 +2% ↑) | 156k (-22 -12% ↓) | 51 | 66.5 | 1.59 / 9.7 (=) | 50k | 512 | 1311×495 | 14.4 | 4.06 | 9.2 (=) | +0.53 | 0 | 21.7 |
| high · h3 | 1.73 (+0.65 +59% ↑) / 2.19 | 1.02 | 0.17 | 0.10 | 0.13 | 0.26 | 0.00 | 0.03 | 237.9 (+132 +124% ↑) / 529.2 | 152 (+1 +1% ↑) | 170k (=) | 53 | 68.2 | 1.59 / 9.7 (=) | 50k | 512 | 1311×495 | 14.4 | 4.23 | 9.7 (=) | +0.20 | 0 | 86.3 |
| medium · b1 | 0.94 (+0.14 +18% ↑) / 1.31 | 0.36 | 0.24 | 0.12 | 0.13 | 0.06 | 0.00 | 0.01 | 596.4 (+400 +203% ↑) / 3240.7 | 151 (-15 -9% ↓) | 206k (+66 +47% ↑) | 72 | 66.5 | 2.08 / 15.9 (=) | 50k | 1024 | 1092×412 | 20.7 | 5.61 | 14.0 (=) | +0.13 | 0 | 72.9 |
| medium · h3 | 1.00 (-0.13 -11% ↓) / 1.42 | 0.40 | 0.29 | 0.14 | 0.11 | 0.05 | 0.00 | 0.01 | 242.5 (+29 +13% ↑) / 461.5 | 181 (-4 -2% ↓) | 165k (+60 +57% ↑) | 76 | 68.2 | 2.08 / 15.9 (=) | 50k | 1024 | 1092×412 | 20.7 | 5.62 | 14.4 (+0.1 +1% ↑) | +0.04 | 0 | 56 |
| low · b1 | 0.45 (+0.01 +1% ↑) / 0.67 | 0.18 | 0.13 | 0.04 | 0.09 | 0.00 | 0.00 | 0.01 | 68.0 (-25 -26% ↓) / 116.0 | 97 (-8 -8% ↓) | 152k (+64 +72% ↑) | 80 | 39.5 | 0.55 / 4.2 (=) | 50k | 512 | 874×330 | 6.5 | 2.32 | 6.0 (+0.1 +2% ↑) | +0.10 | 0 | 47.2 |
| low · h3 | 0.51 (+0.04 +7% ↑) / 0.75 | 0.22 | 0.15 | 0.04 | 0.08 | 0.00 | 0.00 | 0.01 | 63.1 (-21 -25% ↓) / 67.0 | 108 (-5 -4% ↓) | 166k (+57 +52% ↑) | 74 | 40.7 | 0.55 / 4.2 (=) | 50k | 512 | 874×330 | 6.5 | 2.42 | 6.2 (+0.1 +2% ↑) | +0.19 | 0 | 43.2 |

Per-tier means (phone): **high** submit 1.30 ms · raster 199.3 ms · 140 calls · 163k tris · 1.59 Mpx · model phone 9.4 ms · **medium** submit 0.97 ms · raster 419.4 ms · 166 calls · 186k tris · 2.08 Mpx · model phone 14.2 ms · **low** submit 0.47 ms · raster 65.5 ms · 103 calls · 159k tris · 0.55 Mpx · model phone 6.1 ms

## Columns

- **submit** ThreeRenderer.render CPU ms (`window.__render.render`, wrapped); **draws** = `renderBufferDirect` outside the shadow pass (material + uniform setup + the GL call); **traverse** = scene-pass `renderer.render` − shadow − draws (projectObject, cull, sort, lights); **shadow** = `WebGLShadowMap.render` CPU; **hero** = bike + rider `update`; **post** = the composer's quad passes (CPU); **game** = hook total − render (Game.render: HUD DOM, audio, getState); **physics** = 2 ticks.
- **raster** SwiftShader ms for one isolated frame (queue drained → render → 1×1 readPixels, minus the submit) at the full canvas. Monotone in fragment + vertex work; ≈ 100× a phone GPU and ~3× a pipelined SwiftShader frame.
- **wMB / model gpu** the GPU work model: Σ pass px × bytes × weight (scene 2.5, composite 1.6, ao 1.5, bloom 1–1.2, shadow 0.5) → ms = 0.2·wMB + 0.0035·ktris + 0.005·calls.
- **heap** JS heap delta over the CPU pass with a forced GC before and after (the hook path: game + renderer). **blk** frames over 20 ms in the CPU pass (GL ring back-pressure, not JS).
- **calls / tris** are the GPU pass' median frame (all passes, shadow included); **rt Mpx / MB** every render-target write per frame incl. the shadow map.
