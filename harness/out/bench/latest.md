# Bench — cut4 draws — 682d05c (dirty tree)

2026-09-15 21:15 UTC · 300 frames/run (60 fps, 2 ticks/frame) · GPU proxy 6 isolated synced frames at the full canvas · CPU pass at a ¼-size canvas (CPU submit is pixel-independent) · 4.0 min wall · loadavg per row · deltas vs `cut3 phone-high`. **SwiftShader raster ms are a proxy, not phone ms.** Phone ms = model (`harness/bench/model.ts`, recalibrated from device report #1: 4.4·effMpx + 0.02·calls + 0.004·ktris + 1; ±25 %). Phone geometry = 874×330 @ 3 with the phone device class since 2026-09-15 (was 932×430).

## phone — riding, golden replay from tick 0

| tier · track | submit p50 / p95 | draws | traverse | shadow | hero | post | game | physics | raster p50 / p95 | calls | tris | prog | tex MB | rt Mpx / MB | hero tris | shadow | canvas | wMB | model gpu | model phone ms | heap | blk | load |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| high · b1 | 1.58 (+0.38 +32% ↑) / 2.08 | 0.92 | 0.24 | 0.10 | 0.05 | 0.18 | 0.00 | 0.03 | 247.4 (+131 +113% ↑) / 1549.2 | 134 (-14 -9% ↓) | 93k (+7 +8% ↑) | 47 | 66.5 | 1.59 / 9.7 (=) | 17k | 512 | 1311×495 | 14.4 | 3.87 | 9.0 (-0.3 -3% ↓) | +0.42 | 0 | 13.5 |
| high · e2 | 1.10 (+0.29 +36% ↑) / 1.63 | 0.71 | 0.12 | 0.07 | 0.04 | 0.13 | 0.00 | 0.03 | 123.6 (+59 +91% ↑) / 139.4 | 104 (-10 -9% ↓) | 86k (+2 +3% ↑) | 53 | 48.5 | 1.59 / 9.7 (=) | 17k | 512 | 1311×495 | 14.4 | 3.70 | 8.4 (-0.2 -2% ↓) | +0.19 | 0 | 19.6 |
| high · h3 | 1.85 (+0.60 +49% ↑) / 2.50 | 1.11 | 0.22 | 0.10 | 0.04 | 0.30 | 0.00 | 0.03 | 186.4 (+87 +88% ↑) / 558.7 | 147 (-24 -14% ↓) | 112k (+9 +9% ↑) | 48 | 68.2 | 1.59 / 9.7 (=) | 17k | 512 | 1311×495 | 14.4 | 4.01 | 9.4 (-0.4 -4% ↓) | +0.11 | 0 | 17.8 |
| medium · b1 | 0.94 (+0.11 +14% ↑) / 1.42 | 0.39 | 0.29 | 0.14 | 0.03 | 0.06 | 0.00 | 0.02 | 193.0 (+102 +113% ↑) / 1757.8 | 155 (-14 -8% ↓) | 140k (+10 +8% ↑) | 75 | 66.5 | 2.08 / 15.9 (=) | 17k | 1024 | 1092×412 | 20.7 | 5.40 | 13.8 (-0.3 -2% ↓) | +0.20 | 0 | 18.5 |
| medium · e2 | 0.69 (+0.20 +40% ↑) / 1.07 | 0.33 | 0.15 | 0.10 | 0.03 | 0.06 | 0.00 | 0.01 | 78.3 (+18 +29% ↑) / 139.2 | 125 (-7 -5% ↓) | 86k (+3 +3% ↑) | 85 | 48.5 | 2.08 / 15.9 (=) | 17k | 1024 | 1092×412 | 20.7 | 5.06 | 13.0 (-0.1 -1% ↓) | +0.09 | 0 | 19.4 |
| medium · h3 | 0.99 (+0.02 +2% ↑) / 1.57 | 0.41 | 0.32 | 0.14 | 0.03 | 0.06 | 0.00 | 0.01 | 115.9 (+26 +29% ↑) / 392.9 | 191 (-21 -10% ↓) | 106k (+10 +10% ↑) | 77 | 68.2 | 2.08 / 15.9 (=) | 17k | 1024 | 1092×412 | 20.7 | 5.46 | 14.4 (-0.4 -3% ↓) | +0.17 | 0 | 18.6 |
| low · b1 | 0.57 (+0.13 +29% ↑) / 0.84 | 0.29 | 0.18 | 0.06 | 0.03 | 0.00 | 0.00 | 0.01 | 70.7 (+19 +38% ↑) / 74.4 | 104 (-14 -12% ↓) | 90k (+7 +8% ↑) | 92 | 39.5 | 0.55 / 4.2 (=) | 17k | 512 | 874×330 | 6.5 | 2.13 | 5.9 (-0.2 -3% ↓) | +0.10 | 0 | 18.5 |
| low · e2 | 0.53 (+0.17 +47% ↑) / 0.90 | 0.30 | 0.14 | 0.05 | 0.03 | 0.00 | 0.00 | 0.01 | 55.2 (+19 +53% ↑) / 67.7 | 90 (-10 -10% ↓) | 85k (+2 +3% ↑) | 84 | 33.0 | 0.55 / 4.2 (=) | 17k | 512 | 874×330 | 6.5 | 2.05 | 5.6 (-0.2 -3% ↓) | +0.03 | 0 | 28.9 |
| low · h3 | 0.64 (+0.10 +20% ↑) / 0.98 | 0.32 | 0.22 | 0.06 | 0.02 | 0.00 | 0.00 | 0.01 | 118.4 (+70 +143% ↑) / 147.3 | 109 (-20 -16% ↓) | 109k (+9 +9% ↑) | 86 | 40.7 | 0.55 / 4.2 (=) | 17k | 512 | 874×330 | 6.5 | 2.23 | 6.0 (-0.4 -6% ↓) | +0.12 | 0 | 21.4 |

Per-tier means (phone): **high** submit 1.51 ms · raster 185.8 ms · 128 calls · 97k tris · 1.59 Mpx · model phone 8.9 ms · **medium** submit 0.87 ms · raster 129.1 ms · 157 calls · 111k tris · 2.08 Mpx · model phone 13.7 ms · **low** submit 0.58 ms · raster 81.4 ms · 101 calls · 95k tris · 0.55 Mpx · model phone 5.8 ms

## Columns

- **submit** ThreeRenderer.render CPU ms (`window.__render.render`, wrapped); **draws** = `renderBufferDirect` outside the shadow pass (material + uniform setup + the GL call); **traverse** = scene-pass `renderer.render` − shadow − draws (projectObject, cull, sort, lights); **shadow** = `WebGLShadowMap.render` CPU; **hero** = bike + rider `update`; **post** = the composer's quad passes (CPU); **game** = hook total − render (Game.render: HUD DOM, audio, getState); **physics** = 2 ticks.
- **raster** SwiftShader ms for one isolated frame (queue drained → render → 1×1 readPixels, minus the submit) at the full canvas. Monotone in fragment + vertex work; ≈ 100× a phone GPU and ~3× a pipelined SwiftShader frame.
- **wMB / model gpu** the GPU work model: Σ pass px × bytes × weight (scene 2.5, composite 1.6, ao 1.5, bloom 1–1.2, shadow 0.5) → ms = 0.2·wMB + 0.0035·ktris + 0.005·calls.
- **heap** JS heap delta over the CPU pass with a forced GC before and after (the hook path: game + renderer). **blk** frames over 20 ms in the CPU pass (GL ring back-pressure, not JS).
- **calls / tris** are the GPU pass' median frame (all passes, shadow included); **rt Mpx / MB** every render-target write per frame incl. the shadow map.
