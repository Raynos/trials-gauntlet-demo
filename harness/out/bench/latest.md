# Bench — cut3 phone-high — 2931750 (dirty tree)

2026-09-15 20:52 UTC · 600 frames/run (60 fps, 2 ticks/frame) · GPU proxy 10 isolated synced frames at the full canvas · CPU pass at a ¼-size canvas (CPU submit is pixel-independent) · 0.0 min wall · loadavg per row · deltas vs `cut1 skip`. **SwiftShader raster ms are a proxy, not phone ms.** Phone ms = model (`harness/bench/model.ts`, recalibrated from device report #1: 4.4·effMpx + 0.02·calls + 0.004·ktris + 1; ±25 %). Phone geometry = 874×330 @ 3 with the phone device class since 2026-09-15 (was 932×430).

## Idle screens (phone geometry) — the fixed per-frame cost

The garage / menu frame moves nothing; whatever it costs is paid by every riding frame too. `raf` = the live RAF loop's rendered callbacks (CPU, everything the app does per frame); `render` = ThreeRenderer.render; `game` = Game.render minus the renderer (HUD DOM, audio, getState); `app` = input poll + flow (`app.frame()`).

| screen · tier | raf p50 / p95 / max | render p50 | draws | traverse | shadow | hero | post | other | game | app | hud | raster p50 | calls | tris | meshes | rt Mpx | canvas | model phone ms | heap/600 | load |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| garage · high | 1.72 / 1.82 / 1.8 (+0.03 +2% ↑) | 0.01 (=) | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.01 | 0.00 | 0.1 (=) | 0 (=) | 0k | 1106 | 2.08 | 1092×412 | 1.0 (-14.1 -93% ↓) | +0.76 | 12.6 |
| menu · high | 0.00 / 0.00 / 0.0 (=) | 0.00 (=) | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.01 | 0.00 | 0.1 (=) | 0 (=) | 0k | 1075 | 1.59 | 1311×495 | 1.0 (-14.1 -93% ↓) | +0.06 | 13.1 |
| garage · medium | 2.48 / 2.90 / 2.9 (+0.91 +58% ↑) | 0.01 (-1.04 -100% ↓) | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.01 | 0.00 | 0.1 (-185 -100% ↓) | 0 (-165 -100% ↓) | 0k | 1106 | 2.08 | 1092×412 | 1.0 (-12.8 -93% ↓) | +0.15 | 13.1 |
| menu · medium | 0.00 / 0.00 / 0.0 (=) | 0.00 (=) | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.01 | 0.00 | 0.1 (=) | 0 (-112 -100% ↓) | 0k | 1075 | 1.59 | 1311×495 | 1.0 (-11.1 -92% ↓) | +0.08 | 13.1 |
| garage · low | 3.07 / 3.22 / 3.2 (+1.87 +157% ↑) | 0.01 (=) | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.01 | 0.00 | 0.1 (=) | 0 (=) | 0k | 1106 | 2.08 | 1092×412 | 1.0 (-5.5 -85% ↓) | +0.40 | 12.2 |
| menu · low | 0.00 / 0.00 / 0.0 (=) | 0.00 (=) | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.01 | 0.00 | 0.1 (=) | 0 (=) | 0k | 871 | 0.55 | 874×330 | 1.0 (-5.5 -85% ↓) | +0.01 | 14.1 |

## phone — riding, golden replay from tick 0

| tier · track | submit p50 / p95 | draws | traverse | shadow | hero | post | game | physics | raster p50 / p95 | calls | tris | prog | tex MB | rt Mpx / MB | hero tris | shadow | canvas | wMB | model gpu | model phone ms | heap | blk | load |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| high · b1 | 1.20 (+0.26 +27% ↑) / 1.74 | 0.69 | 0.21 | 0.07 | 0.04 | 0.14 | 0.00 | 0.03 | 116.2 (-211 -64% ↓) / 962.2 | 148 (-46 -24% ↓) | 86k (-69 -45% ↓) | 47 | 66.5 | 1.59 / 9.7 (-8.48 -84% ↓) | 17k | 512 | 1311×495 | 14.4 | 3.92 | 9.3 (-12.8 -58% ↓) | +0.42 | 0 | 13.1 |
| high · e2 | 0.81 (+0.02 +2% ↑) / 1.24 | 0.51 | 0.09 | 0.06 | 0.02 | 0.10 | 0.00 | 0.02 | 64.7 (-196 -75% ↓) / 74.9 | 114 (-45 -28% ↓) | 84k (-63 -43% ↓) | 54 | 48.5 | 1.59 / 9.7 (-8.48 -84% ↓) | 17k | 512 | 1311×495 | 14.4 | 3.74 | 8.6 (-12.2 -59% ↓) | +0.20 | 0 | 12.5 |
| high · h3 | 1.25 (-0.07 -6% ↓) / 1.78 | 0.73 | 0.15 | 0.07 | 0.03 | 0.21 | 0.00 | 0.02 | 99.1 (-215 -68% ↓) / 441.2 | 171 (-44 -20% ↓) | 103k (-40 -28% ↓) | 48 | 68.2 | 1.59 / 9.7 (-8.48 -84% ↓) | 17k | 512 | 1311×495 | 14.4 | 4.09 | 9.8 (-12.9 -57% ↓) | +0.13 | 0 | 13.5 |
| medium · b1 | 0.83 (-0.37 -31% ↓) / 1.37 | 0.32 | 0.28 | 0.12 | 0.03 | 0.05 | 0.00 | 0.01 | 90.8 (-115 -56% ↓) / 1028.9 | 169 (-2 -1% ↓) | 130k (+29 +29% ↑) | 78 | 66.5 | 2.08 / 15.9 (-0.40 -16% ↓) | 17k | 1024 | 1092×412 | 20.7 | 5.44 | 14.1 (=) | +0.21 | 0 | 11.7 |
| medium · e2 | 0.49 (-0.27 -35% ↓) / 0.93 | 0.23 | 0.12 | 0.07 | 0.01 | 0.04 | 0.00 | 0.01 | 60.8 (-40 -40% ↓) / 103.0 | 132 (+4 +3% ↑) | 83k (+6 +8% ↑) | 84 | 48.5 | 2.08 / 15.9 (-0.40 -16% ↓) | 17k | 1024 | 1092×412 | 20.7 | 5.09 | 13.1 (+0.6 +5% ↑) | +0.06 | 0 | 11.4 |
| medium · h3 | 0.97 (-0.26 -21% ↓) / 1.54 | 0.38 | 0.35 | 0.14 | 0.02 | 0.05 | 0.00 | 0.01 | 89.8 (-84 -48% ↓) / 318.5 | 212 (+18 +9% ↑) | 96k (+5 +6% ↑) | 78 | 68.2 | 2.08 / 15.9 (-0.40 -16% ↓) | 17k | 1024 | 1092×412 | 20.7 | 5.53 | 14.8 (=) | +0.23 | 0 | 10.9 |
| low · b1 | 0.45 (-0.09 -16% ↓) / 0.84 | 0.22 | 0.16 | 0.04 | 0.02 | 0.00 | 0.00 | 0.01 | 51.3 (-14 -22% ↓) / 57.5 | 118 (+8 +7% ↑) | 83k (+3 +4% ↑) | 91 | 39.5 | 0.55 / 4.2 (-0.11 -17% ↓) | 17k | 512 | 874×330 | 6.5 | 2.18 | 6.1 (-4.2 -41% ↓) | +0.11 | 0 | 11.9 |
| low · e2 | 0.36 (=) / 0.76 | 0.20 | 0.10 | 0.04 | 0.01 | 0.00 | 0.00 | 0.01 | 36.1 (-5 -13% ↓) / 44.9 | 100 (+6 +6% ↑) | 82k (+5 +7% ↑) | 84 | 33.0 | 0.55 / 4.2 (-0.11 -17% ↓) | 17k | 512 | 874×330 | 6.5 | 2.09 | 5.8 (-3.9 -40% ↓) | +0.03 | 0 | 13.5 |
| low · h3 | 0.54 (-0.22 -29% ↓) / 0.99 | 0.25 | 0.20 | 0.04 | 0.01 | 0.00 | 0.00 | 0.01 | 48.7 (-50 -51% ↓) / 53.2 | 129 (+9 +8% ↑) | 100k (+6 +7% ↑) | 86 | 40.7 | 0.55 / 4.2 (-0.11 -17% ↓) | 17k | 512 | 874×330 | 6.5 | 2.29 | 6.4 (-4.3 -40% ↓) | +0.11 | 0 | 13.5 |

Per-tier means (phone): **high** submit 1.08 ms · raster 93.3 ms · 144 calls · 91k tris · 1.59 Mpx · model phone 9.2 ms · **medium** submit 0.76 ms · raster 80.5 ms · 171 calls · 103k tris · 2.08 Mpx · model phone 14.0 ms · **low** submit 0.45 ms · raster 45.4 ms · 116 calls · 88k tris · 0.55 Mpx · model phone 6.1 ms

## Columns

- **submit** ThreeRenderer.render CPU ms (`window.__render.render`, wrapped); **draws** = `renderBufferDirect` outside the shadow pass (material + uniform setup + the GL call); **traverse** = scene-pass `renderer.render` − shadow − draws (projectObject, cull, sort, lights); **shadow** = `WebGLShadowMap.render` CPU; **hero** = bike + rider `update`; **post** = the composer's quad passes (CPU); **game** = hook total − render (Game.render: HUD DOM, audio, getState); **physics** = 2 ticks.
- **raster** SwiftShader ms for one isolated frame (queue drained → render → 1×1 readPixels, minus the submit) at the full canvas. Monotone in fragment + vertex work; ≈ 100× a phone GPU and ~3× a pipelined SwiftShader frame.
- **wMB / model gpu** the GPU work model: Σ pass px × bytes × weight (scene 2.5, composite 1.6, ao 1.5, bloom 1–1.2, shadow 0.5) → ms = 0.2·wMB + 0.0035·ktris + 0.005·calls.
- **heap** JS heap delta over the CPU pass with a forced GC before and after (the hook path: game + renderer). **blk** frames over 20 ms in the CPU pass (GL ring back-pressure, not JS).
- **calls / tris** are the GPU pass' median frame (all passes, shadow included); **rt Mpx / MB** every render-target write per frame incl. the shadow map.
