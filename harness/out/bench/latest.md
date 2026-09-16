# Bench — cut4b OFF baseline (same tree) — d588b1a (dirty tree)

2026-09-15 22:46 UTC · 300 frames/run (60 fps, 2 ticks/frame) · GPU proxy 10 isolated synced frames at the full canvas · CPU pass at a ¼-size canvas (CPU submit is pixel-independent) · 3.5 min wall · loadavg per row · deltas vs `cut3 phone-high`. **SwiftShader raster ms are a proxy, not phone ms.** Phone ms = model (`harness/bench/model.ts`, recalibrated from device report #1: 4.4·effMpx + 0.02·calls + 0.004·ktris + 1; ±25 %). Phone geometry = 874×330 @ 3 with the phone device class since 2026-09-15 (was 932×430).

## phone — riding, golden replay from tick 0

| tier · track | submit p50 / p95 | draws | traverse | shadow | hero | post | game | physics | raster p50 / p95 | calls | tris | prog | tex MB | rt Mpx / MB | hero tris | shadow | canvas | wMB | model gpu | model phone ms | heap | blk | load |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| high · b1 | 1.17 (=) / 1.53 | 0.73 | 0.18 | 0.07 | 0.04 | 0.13 | 0.00 | 0.01 | 197.8 (-550 -74% ↓) / 1311.5 | 136 (+13 +11% ↑) | 92k (=) | 47 | 66.5 | 1.59 / 9.7 (=) | 17k | 512 | 1311×495 | 14.4 | 3.88 | 9.1 (+0.3 +3% ↑) | +0.42 | 0 | 53.6 |
| high · h3 | 1.38 (-0.08 -5% ↓) / 1.70 | 0.89 | 0.14 | 0.07 | 0.03 | 0.21 | 0.00 | 0.02 | 203.0 (-152 -43% ↓) / 463.0 | 153 (+3 +2% ↑) | 112k (-1 -0% ↓) | 48 | 68.2 | 1.59 / 9.7 (=) | 17k | 512 | 1311×495 | 14.4 | 4.03 | 9.5 (+0.1 +1% ↑) | +0.13 | 0 | 48.9 |
| medium · b1 | 0.80 (+0.07 +9% ↑) / 1.06 | 0.34 | 0.25 | 0.12 | 0.03 | 0.04 | 0.00 | 0.01 | 196.9 (-226 -53% ↓) / 1188.0 | 166 (+23 +16% ↑) | 140k (-1 -1% ↓) | 66 | 66.5 | 2.08 / 15.9 (=) | 17k | 1024 | 1092×412 | 20.7 | 5.46 | 14.0 (+0.4 +3% ↑) | +0.09 | 0 | 47.2 |
| medium · h3 | 1.14 (+0.23 +26% ↑) / 1.55 | 0.47 | 0.35 | 0.17 | 0.03 | 0.06 | 0.00 | 0.02 | 214.0 (-4 -2% ↓) / 397.0 | 185 (+5 +3% ↑) | 105k (-1 -1% ↓) | 68 | 68.2 | 2.08 / 15.9 (=) | 17k | 1024 | 1092×412 | 20.7 | 5.43 | 14.3 (+0.1 +1% ↑) | +0.08 | 0 | 48.4 |
| low · b1 | 0.44 (+0.03 +6% ↑) / 0.78 | 0.23 | 0.15 | 0.04 | 0.02 | 0.00 | 0.00 | 0.01 | 92.5 (-18 -17% ↓) / 108.2 | 105 (+13 +14% ↑) | 88k (=) | 72 | 39.5 | 0.55 / 4.2 (=) | 17k | 512 | 874×330 | 6.5 | 2.13 | 5.9 (+0.3 +5% ↑) | +0.04 | 0 | 44.5 |
| low · h3 | 0.47 (-0.13 -21% ↓) / 0.70 | 0.24 | 0.16 | 0.04 | 0.01 | 0.00 | 0.00 | 0.01 | 84.1 (-47 -36% ↓) / 96.9 | 113 (+3 +3% ↑) | 109k (-1 -0% ↓) | 66 | 40.7 | 0.55 / 4.2 (=) | 17k | 512 | 874×330 | 6.5 | 2.25 | 6.1 (=) | +0.23 | 0 | 42.7 |

Per-tier means (phone): **high** submit 1.27 ms · raster 200.4 ms · 145 calls · 102k tris · 1.59 Mpx · model phone 9.3 ms · **medium** submit 0.97 ms · raster 205.4 ms · 176 calls · 123k tris · 2.08 Mpx · model phone 14.2 ms · **low** submit 0.45 ms · raster 88.3 ms · 109 calls · 99k tris · 0.55 Mpx · model phone 6.0 ms

## Columns

- **submit** ThreeRenderer.render CPU ms (`window.__render.render`, wrapped); **draws** = `renderBufferDirect` outside the shadow pass (material + uniform setup + the GL call); **traverse** = scene-pass `renderer.render` − shadow − draws (projectObject, cull, sort, lights); **shadow** = `WebGLShadowMap.render` CPU; **hero** = bike + rider `update`; **post** = the composer's quad passes (CPU); **game** = hook total − render (Game.render: HUD DOM, audio, getState); **physics** = 2 ticks.
- **raster** SwiftShader ms for one isolated frame (queue drained → render → 1×1 readPixels, minus the submit) at the full canvas. Monotone in fragment + vertex work; ≈ 100× a phone GPU and ~3× a pipelined SwiftShader frame.
- **wMB / model gpu** the GPU work model: Σ pass px × bytes × weight (scene 2.5, composite 1.6, ao 1.5, bloom 1–1.2, shadow 0.5) → ms = 0.2·wMB + 0.0035·ktris + 0.005·calls.
- **heap** JS heap delta over the CPU pass with a forced GC before and after (the hook path: game + renderer). **blk** frames over 20 ms in the CPU pass (GL ring back-pressure, not JS).
- **calls / tris** are the GPU pass' median frame (all passes, shadow included); **rt Mpx / MB** every render-target write per frame incl. the shadow map.
