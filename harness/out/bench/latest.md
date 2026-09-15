# Bench — cut5 matrices — 5649aa6 (dirty tree)

2026-09-15 19:57 UTC · 300 frames/run (60 fps, 2 ticks/frame) · GPU proxy 6 isolated synced frames at the full canvas · CPU pass at a ¼-size canvas (CPU submit is pixel-independent) · 3.5 min wall · loadavg per row · deltas vs `cut1 skip`. **SwiftShader raster ms are a proxy, not phone ms.** Phone ms = model (`harness/bench/model.ts`: 0.9·rtMpx + 0.03·calls + 0.006·ktris + 0.02·texMB/2 + 5.5; ±40 % until the device report).

## phone — riding, golden replay from tick 0

| tier · track | submit p50 / p95 | draws | traverse | shadow | hero | post | game | physics | raster p50 / p95 | calls | tris | prog | tex MB | rt Mpx / MB | hero tris | shadow | canvas | wMB | model gpu | model phone ms | heap | blk | load |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| high · b1 | 0.94 (+0.19 +26% ↑) / 1.46 | 0.35 | 0.30 | 0.17 | 0.04 | 0.06 | 0.00 | 0.02 | 326.8 (+33 +11% ↑) / 785.0 | 194 (=) | 156k (=) | 36 | 78.5 | 10.07 / 73.8 (=) | 41k | 2048 | 1864×860 | 91.1 | 19.74 | 22.1 (=) | +0.31 | 0 | 11.1 |
| high · e2 | 0.80 (+0.26 +49% ↑) / 1.23 | 0.31 | 0.17 | 0.17 | 0.03 | 0.07 | 0.00 | 0.02 | 260.2 (+46 +21% ↑) / 311.7 | 159 (=) | 146k (=) | 56 | 60.5 | 10.07 / 73.8 (=) | 41k | 2048 | 1864×860 | 91.1 | 19.53 | 20.8 (=) | +0.20 | 0 | 13.2 |
| high · h3 | 1.32 (+0.44 +50% ↑) / 1.92 | 0.49 | 0.45 | 0.23 | 0.03 | 0.07 | 0.00 | 0.03 | 313.8 (+32 +11% ↑) / 624.4 | 215 (=) | 143k (=) | 48 | 80.2 | 10.07 / 73.8 (=) | 41k | 2048 | 1864×860 | 91.1 | 19.80 | 22.7 (=) | +0.11 | 0 | 13.5 |
| medium · b1 | 1.20 (+0.45 +60% ↑) / 1.73 | 0.47 | 0.40 | 0.18 | 0.04 | 0.07 | 0.00 | 0.02 | 205.3 (+88 +75% ↑) / 793.0 | 171 (=) | 101k (=) | 56 | 66.5 | 2.48 / 18.9 (=) | 17k | 1024 | 1165×537 | 27.2 | 6.64 | 14.1 (=) | +0.20 | 0 | 14.1 |
| medium · e2 | 0.76 (+0.29 +62% ↑) / 1.10 | 0.33 | 0.18 | 0.12 | 0.03 | 0.07 | 0.00 | 0.01 | 100.8 (+28 +38% ↑) / 193.1 | 128 (=) | 77k (=) | 58 | 48.5 | 2.48 / 18.9 (=) | 17k | 1024 | 1165×537 | 27.2 | 6.35 | 12.5 (=) | +0.04 | 0 | 13.1 |
| medium · h3 | 1.23 (+0.36 +41% ↑) / 1.85 | 0.48 | 0.42 | 0.18 | 0.03 | 0.07 | 0.00 | 0.02 | 173.7 (+73 +73% ↑) / 538.7 | 194 (=) | 91k (=) | 59 | 68.2 | 2.48 / 18.9 (=) | 17k | 1024 | 1165×537 | 27.2 | 6.73 | 14.8 (=) | +0.20 | 0 | 14.4 |
| low · b1 | 0.53 (+0.07 +14% ↑) / 0.74 | 0.24 | 0.20 | 0.05 | 0.02 | 0.00 | 0.00 | 0.01 | 65.5 (-2 -3% ↓) / 256.0 | 110 (=) | 80k (=) | 73 | 39.5 | 0.66 / 5.1 (=) | 17k | 512 | 932×430 | 8.6 | 2.56 | 10.3 (=) | +0.10 | 0 | 13.3 |
| low · e2 | 0.36 (+0.03 +9% ↑) / 0.54 | 0.20 | 0.11 | 0.04 | 0.01 | 0.00 | 0.00 | 0.01 | 41.4 (+2 +5% ↑) / 49.6 | 94 (=) | 77k (=) | 84 | 33.0 | 0.66 / 5.1 (=) | 17k | 512 | 932×430 | 8.6 | 2.47 | 9.7 (=) | +0.04 | 0 | 13.7 |
| low · h3 | 0.76 (+0.29 +62% ↑) / 1.02 | 0.33 | 0.31 | 0.07 | 0.02 | 0.00 | 0.00 | 0.01 | 98.7 (+41 +72% ↑) / 113.9 | 120 (=) | 94k (=) | 77 | 40.7 | 0.66 / 5.1 (=) | 17k | 512 | 932×430 | 8.6 | 2.66 | 10.7 (=) | +0.15 | 0 | 14.2 |

Per-tier means (phone): **high** submit 1.02 ms · raster 300.3 ms · 189 calls · 148k tris · 10.07 Mpx · model phone 21.9 ms · **medium** submit 1.06 ms · raster 159.9 ms · 164 calls · 90k tris · 2.48 Mpx · model phone 13.8 ms · **low** submit 0.55 ms · raster 68.5 ms · 108 calls · 84k tris · 0.66 Mpx · model phone 10.2 ms

## Columns

- **submit** ThreeRenderer.render CPU ms (`window.__render.render`, wrapped); **draws** = `renderBufferDirect` outside the shadow pass (material + uniform setup + the GL call); **traverse** = scene-pass `renderer.render` − shadow − draws (projectObject, cull, sort, lights); **shadow** = `WebGLShadowMap.render` CPU; **hero** = bike + rider `update`; **post** = the composer's quad passes (CPU); **game** = hook total − render (Game.render: HUD DOM, audio, getState); **physics** = 2 ticks.
- **raster** SwiftShader ms for one isolated frame (queue drained → render → 1×1 readPixels, minus the submit) at the full canvas. Monotone in fragment + vertex work; ≈ 100× a phone GPU and ~3× a pipelined SwiftShader frame.
- **wMB / model gpu** the GPU work model: Σ pass px × bytes × weight (scene 2.5, composite 1.6, ao 1.5, bloom 1–1.2, shadow 0.5) → ms = 0.2·wMB + 0.0035·ktris + 0.005·calls.
- **heap** JS heap delta over the CPU pass with a forced GC before and after (the hook path: game + renderer). **blk** frames over 20 ms in the CPU pass (GL ring back-pressure, not JS).
- **calls / tris** are the GPU pass' median frame (all passes, shadow included); **rt Mpx / MB** every render-target write per frame incl. the shadow map.
