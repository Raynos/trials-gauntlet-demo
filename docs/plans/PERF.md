# PERF — 60 fps on `high` on a phone

Owner: the performance owner (persistent agent). Bench: `pnpm harness:bench` (`harness/bench/README.md`); numbers below are from `harness/out/bench/latest.md` unless marked *phone*. Ledger at the bottom — one row per loop iteration, the parent commits each.

**The goal, in the user's words:** aggressively benchmark and optimise the FPS. 60 fps on `high` on mobile. Write benchmarks and loop to optimise them. Write a plan for 100×. When the 100× plan fails, make it 10× faster.

**Status (2026-09-15, phase 2 iteration 5):** cut #4 part 1 landed (row 5: same-material batches baked per chunk, b1 148 → 134, h3 171 → 147); next: #4b container atlas (−20), the bloomer list, #5's culling half, the program dispose. Earlier: cut #3 (phone-high) landed — ledger row 4; the model (§2, recalibrated) puts it at 9.3 ms on the user's iPhone and WebKit/Metal measures it ≤ medium; next: #4 draw calls (148 → ≤ 100 on b1), then #5's culling half, then the program dispose (device report item 5). Earlier: cuts #0, #1 and the matrix half of #5 landed (ledger rows 1–3); #2 re-scoped (see its row); next: #3 the phone-high tier (needs `setDeviceClass`, request below), then #4 draw calls, then #5's culling half. Method note: cross-run CPU ms on this shared host move ±25 % with load; counts (calls / tris / Mpx / programs / re-acquisitions) and interleaved in-page A/Bs are the comparators for sub-0.2 ms cuts. Phase 1 (09-14) delivered bench + cost model + profile + plan. First phone rung: a flat 30 in the garage, then a measured 60 there. Bench caveat: the full matrix took 60 min on this host at loadavg 30–65 (not the 15 min asked) — SwiftShader rasterises the 2048² shadow map even on the ¼ canvas, ~100 ms per high frame; on a quiet host expect ~20 min; `--quick` (phone geometry, b1/h3/e2, 300 frames) is the loop preset at ~12 min. Repeatability (`--repeat 2`, b1 high + low, loadavg 35): calls / tris / Mpx / model ms identical run to run; CPU `render()` p50 within 1.3 % on high (1.60 vs 1.58 ms) and 10 % on low (0.67 vs 0.61 — sub-ms under a loaded host); the SwiftShader raster proxy ±36 % with load. The comparators for the loop are the counts and the CPU split; raster is quoted with its loadavg and re-run above 20.

---

## 0. The finding that reorders the plan: the floor is fixed cost, not action

The user's iPhone, 2026-09-14, **garage screen** (menu → garage; b1 backdrop, bike idle, nothing moving), tier `low`, 30 fps cap: **24, 28, 26, 28, 30, 30, 28, 26, 26, 30 fps, worst frame 66 ms**. A static frame that cannot hold 33 ms on a flagship.

The same frame on the bench host (headless Chromium + SwiftShader, loadavg 30) — `idle garage · low` in `latest.md`:

| | CPU ms (this host, Apple-silicon core under load) | what |
|---|---|---|
| ThreeRenderer.render | **0.79** | of which draws 0.35 (113 `renderBufferDirect`), traverse 0.25 (projectObject over 575 visible / 705 meshes, 816 objects), shadow 0.10 (hero-only 512² pass), hero 0.05, other 0.02 |
| Game.render minus renderer (HUD DOM, audio, getState) | ≈ 0.00 (`hudMs` 0.005) | |
| app shell (`app.frame()`: input poll + flow) | 0.01 | |
| GPU work | 0.66 Mpx, one pass to the canvas (932×430) + 512² shadow, 113 calls, 99 k tris | ≈ 2–3 ms on an A17 by any model |
| heap | +1.0 MB retained per 600 frames after a forced GC | something accumulates ~1.7 KB per idle frame |

So the WebGL frame the page contains costs ~1 ms of JS and ~2–3 ms of GPU on the phone. The phone spends ≥ 33 ms. **The 30 ms are outside the WebGL frame or are pathological on Safari**; the bench cannot see them, only the device can. Ranked hypotheses, each with the on-device test that settles it (all go into the `?bench=1` device report):

| # | hypothesis | why | test on the phone |
|---|---|---|---|
| F1 | **CSS on the canvas layer**: `#app.drift canvas { animation: drift 12s … transform }` runs continuously in menus / garage; `#app.dim canvas { filter: saturate brightness }` in runs; `#app.garage canvas { transform: scale(1.25) }`; `.garage-screen` full-screen translucent gradient over it; `.garage-plate` `mask-image`. On iOS a WebGL canvas with an animated transform / filter is re-composited through an offscreen pass at **device** resolution (2796×1290 px, the CSS size × DPR 3 — not the 932×430 drawing buffer) every vsync | the only per-frame work that scales with the *screen*, not the tier — matches "low ≈ medium ≈ garage" | **iOS Settings → Accessibility → Motion → Reduce Motion ON** (styles.ts:645 disables `drift`): if the garage goes flat 30, F1 is the floor. Then a build with `dim` / gradient removed |
| F2 | **Main-thread JS on Safari ≫ this host**: Safari's JIT on three.js hot paths (`projectObject`, `setProgram`, uniform uploads) is 2–4× V8 here; ×2 for a phone core → 3–6 ms, not 30 | scales with calls/meshes (113 / 705) — same on every tier → consistent with "tier makes no difference" but too small alone | `?bench=1`: `render()` ms p50 on the device (the hook's `lastRender.submitMs`) in the garage |
| F3 | **GC / allocation spikes** → the 66 ms worst frame: 1 MB / 600 frames retained + churn (see §4 profile) → periodic minor GCs; a major GC on iOS is 30–70 ms | explains the *worst* frame, not the average | `?bench=1`: JS heap trace; count frames > 40 ms vs heap sawtooth |
| F4 | **RAF pacing**: the 30 cap renders on every 2nd RAF (`now − lastRenderAt < 33.3 − 2`); any rendered frame that overruns 16.7 ms (JS + compositor + GPU present) skips to the 3rd → 20 fps instant; the meter averages 24–28 | mechanism, not cause: it turns a 17–20 ms frame into 24–28 fps | the device report's frame-time histogram, cap off (60) |
| F5 | **Texture / shader work per frame**: a `CanvasTexture` with `needsUpdate` every frame, `gl.getError`/`getParameter` in the loop, program switches (20 programs on low) | none found in the render path by reading; SwiftShader would show it as draws ms | `?bench=1` `calls`/`programs` steady; Safari Web Inspector timeline if F1–F3 clear |
| F6 | **120 Hz ProMotion RAF** (iOS 18+ Safari runs RAF at 120 Hz on ProMotion): the cap's "2 ms slack" arithmetic assumes 60; at 120 Hz the render lands on every 4th RAF — fine — but the meter's "worst ms" and the probe's `elapsed` see 8.3 ms intervals | would make 30 cap land at 30 flat, so likely not it; noted | the report logs RAF interval p50 |

**What this does to the plan:** the first rung is not fewer pixels; it is *no work when nothing changes* and *no work outside the frame*. §3 puts those first. The 100× arithmetic in §3 counts against the measured phone floor (≥ 33 ms garage) as well as against the model's `high`.

---

## 1. Where every millisecond goes (the budget per tier)

Bench geometry `phone` = 932×430 CSS @ DPR 3 (the iPhone class); the tier caps the drawing buffer — low DPR 1 (932×430), medium 1.25 (1165×537), high 2 (1864×860). Riding frames = the bot-3 golden from tick 0, 600 frames; b1 as the reference; the seven-track means in `latest.md`.

Baseline `phase1 baseline` (shas c2c61b9 / 20d463d / 058333f, dirty tree, host loadavg 30–65 — three other owners' headless Chromiums; SwiftShader raster ms scale with load, the counts and the CPU split ratios do not):

| tier (phone geometry) | canvas | RT writes / frame | calls | tris | programs | tex MB | CPU `render()` p50 (host) — draws / traverse / shadow / hero / post | raster p50 (SwiftShader, proxy) | **model phone ms** = fill + draws + tris + tex + E |
|---|---|---|---|---|---|---|---|---|---|
| **high** b1 | 1864×860 | **10.07 Mpx / 73.8 MB** (shadow 2048² 4.2 Mpx · scene HDR 1.6 · AO ½-res ×2 0.8 · bloom 13 passes 0.7 · composite 1.6) | 205 | 179 k | 39 | 78.5 | 1.44 = 0.63 / 0.41 / 0.24 / 0.04 / 0.07 | 522 ms | **22.6** = 9.1 + 6.2 + 1.1 + 0.8 + 5.5 |
| high, 7-track mean | ″ | 10.07 Mpx | 193 | 151 k | 39–82 | 48–80 | 1.20 | 843 ms | **21.9** |
| **medium** b1 | 1165×537 | **2.48 Mpx / 18.9 MB** (shadow 1024² 1.05 · scene HDR 0.63 · bloom ¼-frame 0.17 · composite 0.63) | 186 | 111 k | 73 | 66.5 | 1.36 = 0.65 / 0.36 / 0.20 / 0.04 / 0.07 | 349 ms | **14.6** = 2.2 + 5.6 + 0.7 + 0.7 + 5.5 |
| medium, mean | ″ | 2.48 Mpx | 169 | 90 k | 70–82 | 36–68 | 1.09 | 291 ms | **13.9** |
| **low** b1 | 932×430 | **0.66 Mpx / 5.1 MB** (shadow 512² hero-only 0.26 · scene→canvas 0.40) | 116 | 84 k | 95 | 39.5 | 0.69 = 0.34 / 0.23 / 0.07 / 0.03 / 0 | 147 ms | **10.5** = 0.6 + 3.5 + 0.5 + 0.4 + 5.5 |
| low, mean | ″ | 0.66 Mpx | 115 | 87 k | 90–121 | 26–41 | 0.65 | 106 ms | **10.4** |
| **idle garage** low | 932×430 | 0.66 Mpx | 114 | 99 k | — | — | 0.76 = 0.33 / 0.26 / 0.09 / 0.04 / 0 (+ game 0.00, app 0.01) | 270 ms | **10.5** — *phone reads ≥ 33* |
| idle garage high | 1864×860 | 10.07 Mpx | 201 | 192 k | — | — | 1.29 = 0.56 / 0.30 / 0.24 / 0.06 / 0.07 | 962 ms | 22.3 |

Heaviest tracks: h3 (238 calls high, 135 low — the foundry supports), b3 (220). Desktop 1280×720 @ 1 sits between: high 7.57 Mpx / 196 calls (`latest.md` second table). Physics: 0.01–0.03 ms per frame (2 ticks) — not in the budget.

Reading the split (CPU, this host; ×2–3 for Safari on a phone core): **draws** (`renderBufferDirect` = three's per-draw material/uniform/state work) and **traverse** (`projectObject` + frustum cull + sort over ~800 objects, done every frame although ~700 of them never move) are the two CPU halves; the shadow pass adds its own traversal + caster draws. On the GPU side the shadow map is the biggest single write on `high` (2048² × 8 B = 4.2 Mpx, half the frame's pixels — for a light that follows the camera and casters that never move) and the HDR chain triples the canvas pixels (HalfFloat scene + composite + bloom + SSAO).

The heap grows ~1 MB per 600 frames retained (forced GC either side) on every tier — the game layer's per-frame objects (§4).

---

## 2. Frame-cost model calibrated to the phone

**Recalibrated 2026-09-15 from device report #1** (`docs/device/2026-09-15-5649aa6.md`, iPhone iOS 18.7, 874×330 @ 3): `low` at cap 60 holds 59.5 fps with a **2.1 ms JS tick** (116 calls / 125 ktris / 0.55 Mpx); `high` at cap 30 sits at interval p95 47 ms (207 / 262 k / 6.57 Mpx with the 2048² shadow, SSAO, HDR); `medium` holds 30 (184 / 191 k / 2.08 Mpx), unmeasured at 60. The cap-30 `submit` of ~5 ms is driver back-pressure, not JS. So: **A = 4.4 ms per effective Mpx** (from (≈ 40 − 6) / (6.57 − 0.55); the shadow map counts at face value — a depth-only 2048² is not free on this GPU), **B = 0.02 ms/draw, C = 0.004 ms/ktris, D = 0, E = 1.0** (2.1 ms JS − B·116), ±25 %. Cross-checks: low 6.1 ms ✓ (holds 60), medium 14.1 (borderline at 60 — consistent with unmeasured), old high 35 (does not hold 30 ✓), **phone-high 9.3**. The idle-garage gap of §0 is closed: it was the free-running cap and the CSS on the canvas (parent's `0f14d3d` + `cfc98f8`), the garage is a flat 30 now and draws nothing after cut #1.

The original (pre-report) calibration is kept below for the record.


`ms_phone ≈ A·rtMpx + B·calls + C·ktris + D·texMB_touched + E`

| coefficient | value | meaning | provenance |
|---|---|---|---|
| A | **0.9 ms / Mpx** | render-target pixels written per frame, pass-averaged (scene 2.5× a copy, composite 1.6, AO 1.5, bloom 1–1.2, shadow 0.5 — `model.ts passWeight`) | pinned by the two phone readings: pre-r12 low (5.17 Mpx) and post-r12 medium (7.64 Mpx) both ≈ 17–19 ms → the 2.5 Mpx gap is worth ≈ 2 ms |
| B | **0.03 ms / draw** | main-thread per draw (three.js `setProgram` + uniforms + ANGLE-on-Metal encode) | prior: three.js on A-series Safari 20–40 µs/draw; the bench measures 3 µs/draw here → ×10 for Safari + phone is the same range |
| C | **0.006 ms / ktris** | vertex + raster setup, skinned share | prior (≈ 170 Mtri/s effective) |
| D | **0.02 ms / MB touched** | texture bandwidth; touched ≈ resident × 0.5 | prior |
| E | **5.5 ms** | Game.render + HUD DOM + audio + Safari RAF / compositor per frame — *the term §0 says is really 20–30 ms in the garage* | residual of the two readings |
| confidence | **±40 %** | two points, five unknowns | recalibrate from the device report: b1 low / medium / high at cap 60, b1 low at DPR 0.5 (isolates A), h3 medium (287 calls, pins B) — `model.ts RECALIBRATE_NOTE` |

Model outputs for b1 at the phone geometry (`latest.md` "model phone ms"): high **22.6 ms** (≈ 44 fps; ±40 % → 14–32), medium **14.6** (≈ 68 fps), low **10.5** (≈ 95 fps), idle garage low 10.5. So by the model the current `low` should already hold 60 on that phone and `medium` should hold ~60 — the user's 24–28 fps readings on both say the model's E is wrong by 10–20 ms on the device, exactly the §0 gap.

The GPU-only half (the work model): high 19.9 ms, medium 6.8, low 2.6 of A17 GPU time — the pass list is what makes `high` GPU-bound on a phone (91 weighted MB per frame), `low` is not.

**Honesty check against §0:** the model puts the *idle garage on low* at ≈ 10.5 ms (E 5.5 + draws 3.4 + fill 0.6 + tris 0.6 + tex 0.4) and the phone reads ≥ 33. Either E is ~25 ms on this phone in menus (F1/F2) or a spike term is missing (F3). The device report decides; until then every phone estimate below carries that caveat, and the plan does not depend on the pixel term being right.

GPU work model (the second model, `model.ts gpuWork`): Σ pass px × bytes × weight → weighted MB (`wMB` column) → `0.2·wMB + 0.0035·ktris + 0.005·calls` ms of A17 GPU time. It is the fill-rate ledger for the pass-list cuts (§3).

---

## 3. The plan

### 3.1 What `high` must become on a phone (a tier definition, not a compromise on the name)

Today `high` = desktop: DPR ≤ 2, HalfFloat HDR scene with a depth texture, half-res SSAO, bloom from ½ frame (13 passes), 2048² shadow with every caster, full-res composite with smear / chroma / grade, all volumetrics, 40 m prop chunks, 70 MB of textures, 39–47 programs. On the iPhone class that is a 1864×860 canvas and **10.1 Mpx of RT writes / 201 calls / 158 k tris per frame**.

Physics-of-light floor on that phone: the canvas must be written once at the tier's DPR. At DPR 2 that is 1.6 Mpx of PBR shading ≈ **1.5 ms** on an A17 (≈ 2 Gpx/s shaded), at DPR 3 (the native 2796×1290) 3.6 Mpx ≈ 3.3 ms. Everything above that is optional work. `high` on a phone therefore means:

- **DPR 2, one LDR pass to the canvas** (tone map + grade in-material, as `low` already does), MSAA off (three's `antialias` on the default framebuffer is 4× the tile store on a TBDR — the LOD hero at 180 px does not need it; if it does, FXAA in the composite is cheaper),
- **bloom from an emissive-only pass**: the bloom casters (lamps, bulbs, sun disc, brake light, sparks — a dozen draws) rendered into a ¼-res target, blurred (5 mips), added over the canvas with an additive quad. No full-res HDR target, no full-res composite. Same look on the things that bloom; the "scene-wide" HDR overflow is gone (it clipped to white on low anyway),
- **shadows: 1024² hero-first cascade**, updated only when something in it moved (§3.2 #2),
- **no SSAO**: the deck AO skirt + baked vertex AO on the props give the contact darkening; the 16-tap depth AO + blur + the depth-texture attachment (which forces the depth store on a TBDR) go,
- **smear / chroma / heat haze / flash** in the same composite-free world: smear and chroma need the scene as a texture. On phone-high they become a *conditional* pass — only while `speed > 9 m/s` or a flash is live, the frame renders to an RGBA8 (not HalfFloat) target and one 1864×860 quad does smear + chroma + bloom-add. Below 9 m/s (most of a beginner track) the pass is skipped,
- **volumetrics, decals, scatter**: kept, but instanced by material across chunks (§3.2 #4), and the volumetric cones half-res (a 0.4 Mpx layer composited additively — they are the overdraw),
- **textures ≤ 24 MB** via KTX2 (ASTC 6×6 on iOS) — the same images at ¼ the memory and bandwidth,
- **≤ 70 draws, ≤ 110 k tris, ≤ 16 programs** (§3.2 #4, #5, #9).

Model for that tier on b1: fill 0.9 × (1.6 + 0.1 shadow amortised + 0.15 bloom + 0.4 volumetric layer) ≈ 2.0 ms, draws 0.03 × 70 = 2.1, tris 0.7, tex 0.25, E 5.5 → **≈ 10.5 ms ≈ 95 fps model**; with the conditional smear pass on (+1.6 Mpx RGBA8 ≈ +1.0 ms) 11.5 ms. Headroom under 16.7 ms only if E really is ~5 ms — which is the §0 question, hence #1 first.

**Landed (iteration 4):** `setDeviceClass` (CONTRACT §2.7, wired by the parent in a20509c; renderer side in `index.ts applyQuality`). What phone-high became, against the §3.1 sketch: DPR 1.5 (not 2 — the model says DPR 2 + any world shadow misses 60), hero-only 512² shadow (the 1024² world cascade costs 4.6 ms by the model — it returns when #4 pays for it), emissive-only bloom at 1/8 res (not ¼), no conditional smear pass (deferred), volumetrics on but the hall's eight shafts off. Model 9.3 ms on b1; the bench and WebKit rows are in ledger row 4.

### 3.2 The cuts, ranked by factor ÷ effort

"Factor" is on the term the cut touches, in the model (phone ms) and in the bench's own units (calls, tris, Mpx, CPU ms). "Frame factor" is the whole-frame effect on today's phone-geometry `high` (model 22 ms; measured garage floor ≥ 33 ms). E = effort in loop iterations (one iteration = one cut → bench → two md5-identical captures → clip → commit).

| # | cut | touches | today → after | term factor | frame factor (cumulative, high) | E | owner / files |
|---|---|---|---|---|---|---|---|
| 0 | **Stop the per-frame program churn** (§4): `forceSinglePass = true` on the transparent double-sided materials (shafts, lamp cones, deck AO skirt, spokes, blur discs), a cloned `darkSteel` for the plain meshes, per-kind `customDepthMaterial` for the shadow pass | draws CPU, calls, allocations | 30 → 0 program re-acquisitions / frame on high (11 → 0 low); 205 → ~181 calls; 219 → ~90 KB/frame garbage | 1.5× on draws CPU; 1.1× calls | 22.0 → 21.0 model (Safari: −2–5 ms real) | **1** | render/world (hall.ts, props.ts, deck.ts), render/hero/lod.ts, render/bike, render/index.ts — **the first phase-2 iteration** |
| 1 | **Static-frame skip**: a frame whose inputs (interpolated state, camera, tSim-driven uniforms, particles alive, HUD state) equal the last drawn frame's is not drawn — the RAF returns after the poll. Menus, garage, pause, results, countdown hold, the finish hold. Riding frames are never equal | everything, on idle screens | garage: 0.8 ms CPU + 0.66 Mpx → **0**; riding: 0 | ∞ on idle frames | the phone's garage from ≥ 33 → whatever F1 leaves; **the first rung** | 1 | render (`render()` early-out on a frame hash) + game (`advance` in menu phase calls `loop.renderOnce()` every frame) — needs the parent |
| 1b | **F1 on the device**: `drift` / `dim` / gradient / mask off the canvas layer (CSS `will-change: transform` on the canvas or moving the effect to a sibling div; `dim` as a scene-side exposure uniform instead of a CSS filter) | Safari compositor | unknown — the Reduce-Motion test says | ? | possibly the whole garage gap | 1 | ui/styles.ts + app.ts — the parent, after the test |
| 2 | ~~Shadow map only when it changed~~ **Re-scoped (iteration 2):** three has one map per light and the hero moves every riding frame; a cached world depth needs a second light (double lighting, or an invisible shadow at intensity 0) or a custom shadow pass without a depth attachment (hero shadows through walls). Idle frames are free after #1. What survives: the world map on the **phone-high** tier is 1024² with medium's caster list and the 28 m frustum (folded into #3), and `shadow.needsUpdate` gating for the finish / countdown holds (already skipped whole by #1). The original row is kept below for the record. |||||||
| 2 (orig.) | **Shadow map only when it changed**: `renderer.shadowMap.autoUpdate = false`, `needsUpdate` when a caster inside the frustum moved or the light frustum crossed a chunk. Hero-only map (low): every riding frame (the hero moves) — but skip while idle; world cascade (medium / high): the light follows the camera → fix the cascade to the current 40 m chunk and re-render on chunk change (1 in ~40 frames at 20 m/s), the hero in its own 512² map every frame | rtMpx, shadow CPU | high: 4.19 Mpx → 0.26 + 0.1 (2048² / 40 + 512²) ; medium 1.05 → 0.29; shadow CPU 0.1–0.4 ms → 0.05 | 16× on the shadow term; whole-frame fill 10.1 → 6.2 Mpx | 22.0 → 18.5 ms | 1 | render/lighting |
| 3 | **Phone-high tier (§3.1)**: single LDR pass, emissive-only bloom, no SSAO, no HalfFloat, conditional smear | rtMpx, passes, programs | high: 6.2 → 2.3 Mpx (canvas 1.6 + bloom 0.15 + shadow 0.36 + volumetric layer 0.2); passes 17 → 4; RT MB 92 → 11 | 2.7× fill | 18.5 → 15.0 ms | 3 | render/post, render/lighting (grade in material exists), materials |
| 4 | **Draw calls 200 → 60**: props instanced *per material across chunks* (one InstancedMesh per prop material with a per-chunk visibility range, not one per chunk × material); deck chunks merged per material into one indexed buffer with per-chunk draw ranges (`BufferGeometry.groups` + `drawRange` — one draw per visible material); gates + lamps + plaques merged; hero static parts by material (15 → 6 scene draws, 16 → 6 shadow) | calls, draws CPU, traverse CPU | b1 high 201 → ~60; h3 321 → ~90; draws CPU 0.45 → 0.15 ms; visible meshes 575 → ~120 | 3.3× on the draw term | 15.0 → 10.8 ms | 3 | render/world (props.ts, deck.ts, gates.ts), render/hero |
| 5 | **No traversal of the static world** — *iteration 3 landed the matrix half only (−0.04 ms host); the culling half (cached render lists) is still open* —: `matrixAutoUpdate = matrixWorldAutoUpdate = false` on every world object after build (three still walks 800 nodes in `updateMatrixWorld` and `projectObject` each frame); static world in its own `Group` with a cached render list (`renderer.renderLists` is rebuilt per frame — keep a pre-culled list per chunk and toggle `visible` on chunk change only); `sortObjects = false` for the opaque world (pre-sorted by material at build); no `traverse` in `render()` (none today; `debugInfo()`'s `staleProgramCount` stays out of the frame) | traverse CPU | 0.25–0.45 ms → 0.05 ms (host) ≈ 1–2 ms → 0.2 on Safari | 5× | 10.8 → 9.8 (E shrinks) | 2 | render/index.ts, render/world |
| 6 | **Triangles 158 k → 90 k**: hero LOD document at the riding zoom on every tier (41 k → 11 k; the authored hero only in the garage close-up and the finish camera), deck AO skirt dropped where baked AO exists (28 k), prop LOD by distance (instanced batches carry a far variant), wheel spokes → the blur card above 4 rad/s on all tiers | tris | 158 → 90 k | 1.75× | 9.8 → 9.4 | 2 | render/hero, render/world |
| 7 | **Textures 70 → 20 MB**: KTX2 / Basis (UASTC → ASTC 6×6 on iOS, 4× smaller than RGBA8 in memory and bandwidth, no mip generation at load), medium/high skins 512×256 like low, one atlas per biome kit | texMB, level-entry spikes | 70 → ~20 MB resident; upload at load 70 MB → 20 | 3.5× | 9.4 → 9.0 | 3 | assets/art pipeline + render/art (the art owner) |
| 8 | **Half-rate updates**: bloom every 2nd frame (reuse the mip texture; imperceptible on a 2 px blur), particles simulate at 60 but upload at 30, gate crowd anim uniforms at 30, melt/lamp light re-pick every 10 frames | fill, CPU other | bloom 0.15 → 0.08 Mpx/frame; other 0.1 → 0.05 ms | small | 9.0 → 8.8 | 1 | render/post, render/particles |
| 9 | **Programs 39–47 → ≤ 16** and **warm the exact variants**: one material recipe per surface class (the round-14 finding: a rebuilt LOD hero compiled a second variant), `renderer.compileAsync` (KHR_parallel_shader_compile) during the loader against the *real* target state, textures `initTexture`d during the loader — this is the **level-entry spike** (Metal shader compile 50–200 ms × N programs + 70 MB of uploads on the first frames) | first-frame ms, probe honesty | entry spikes 200–1000 ms → < 50; the probe stops reading compiles as a slow tier | — | spikes, not steady state | 2 | render/materials, render/index.ts prepare() |
| 10 | **No per-frame allocations, no GC sawtooth**: `getState()` copy per frame → a reused state object; `runInfo` / HUD strings only on change; the 1 MB/600 frames retained (§4 names it) | E, worst frame | worst frame 66 ms → the render cost; heap flat | — | the p95 / worst, not the p50 | 1 | game + render (the parent) |
| 11 | **Occlusion by track z-order**: the game is 2.5D — a prop whose bounds are entirely behind the deck / hall wall at the same x and below the camera's line to the deck edge cannot be seen; cull per chunk at build (a static list) and per frame by camera y | calls, overdraw | h3 −30 %, b1 −10 % calls; volumetric overdraw −30 % | 1.2–1.4× | 8.8 → 8.3 | 2 | render/world |
| 12 | **OffscreenCanvas + worker render**: three.js runs in a worker (`canvas.transferControlToOffscreen`, iOS 16.4+), the main thread keeps input, physics (2–5 µs/tick) and the DOM; state → worker by `SharedArrayBuffer` or a per-frame `postMessage` of the 200-byte state | main-thread E; not total CPU | main-thread render 0 ms; GC in the worker never blocks a tap | 1× total, ∞ on main-thread jank | the 66 ms worst frame stops being a dropped input | 5 | render + game + main.ts + hook (deterministic captures must still work: the harness renders synchronously — keep a same-thread path) |
| 13 | **WebGPU path** (`WebGPURenderer`, Safari 26 / iOS 26 ships WebGPU; the user's flagship qualifies): render bundles cut per-draw CPU 3–5×, no ANGLE translation, compute for particles | B | draws 0.03 → 0.008 ms/call | 4× on the draw term | 8.3 → 7.0 | 8+ (post chain, custom materials, KHR variants all re-done) | render/** — a new renderer behind a flag |

**Sum on paper.** Cumulative on the model's `high` at the phone geometry: 22 → ≈ 7 ms model with #2–#13 = **3.1×**; the physics-of-light floor at DPR 2 is ~1.5 ms GPU + ~1 ms JS + E, so no plan reaches 100× *in frame time* on a 1.6 Mpx canvas — the arithmetic does not allow it and the plan says so. Where 100× is real:

- **idle frames** (#1): 0.8 ms CPU + 0.66 Mpx → 0 — unbounded; on the phone, from ≥ 33 ms to the compositor floor. This is the rung the user sees first,
- **level-entry spike** (#9 + #7): 200–1000 ms first frames → < 10 ms (20–100×),
- **draw calls** as a unit: 200 → 60 (#4) → 12 (WebGPU render bundles make the *cost* of a draw ≈ 0) — 16× on the term that dominates the phone's JS,
- **RT bytes** as a unit: pre-r12 `high` 171 MB / frame → phone-high 11 MB (§3.1) → 15×; against today's 140 MB, 13×.

Against the *measured* phone: garage ≥ 33 ms → #1 + #1b: the compositor floor (≈ 1–3 ms) = **10–30×**. That is the honest 100×-plan verdict: 100× exists on the fixed cost and on the pass list, not on a lit 1.6 Mpx frame.

### 3.3 The 10× fallback — what gets a phone to 60 fps at ≤ 12 ms with headroom

The subset, in order, each an iteration with a bench row and two identical captures:

| step | cut | model b1 high (phone geom) after | gate |
|---|---|---|---|
| 0 | device report #1 (`?bench=1`, core-game): garage + b1 per tier at cap 60, Reduce Motion A/B | — | E and F1 known; refit A–E |
| 1 | #0 program churn (one iteration, render-only) | 21.0 ms | re-acquisitions/frame 0 (`diag-programs.ts`), calls −24, captures md5-identical |
| 1b | #1 static-frame skip (+ #1b if F1) | idle: 0 | **garage flat 30 on the phone; then 60 with the cap lifted for the test** |
| 2 | #2 shadow only on change | 18.5 ms | `rtMpx` high 10.1 → 6.2; captures md5-identical on b1 |
| 3 | #3 phone-high tier | 15.0 | passes 17 → 4; the blind critic's b1 clip on phone-high judged against desktop high |
| 4 | #4 draw calls 200 → 60 | 10.8 | calls ≤ 70 on b1, ≤ 100 on h3 |
| 5 | #5 static world, no traversal | 9.8 | traverse ≤ 0.05 ms host |
| 6 | #6 tris, #10 allocations | 9.2 | heap flat over 600 frames; worst frame = p95 + 5 ms |
| 7 | #9 programs + warm | 9.2 (spikes gone) | first 10 frames after GO ≤ 2× the p50 |
| — | device report #2 | ≤ 12 ms p95 on b1 high on the phone at cap 60 | **60 fps on high** |

10× where it is measured: the garage / idle frame (≥ 33 → ≤ 3 ms), the level-entry worst frame (66+ → ≤ 6 ms), RT MB per frame on high (140 → 11). On the riding p50, 22 → 9 ms model is 2.4×; the remaining 9 ms are the canvas, 60 draws and E.

### 3.4 Trade-offs the tiers carry (what the user sees)

- **DPR 0.8–1.0 on `low`** made the crowd / banner cards pixelated on the phone (user, 2026-09-14). A sharper DPR needs the fixed cost gone first (#1, #2, #4, #5); after that `low` can go to DPR 1.25 (+56 % pixels ≈ +0.6 ms model) or the cards can be drawn through a screen-space sharp path (SDF text for the banners). Logged as the cost of the r12 cut.
- **Emissive-only bloom** (#3): the sun and the sky no longer bloom over the horizon; only lamps, bulbs, sparks and the brake light do. Judged by the blind critic before it lands on desktop `high`; the phone-high tier takes it first.
- **Shadow on change** (#2): a moving world caster (drums, see-saws) must mark the map dirty — the bench's e2/m2/x1 rows and the m2 clip prove it.
- **Static-frame skip** (#1): anything time-driven that should animate on an idle screen (gate flicker, crowd sway, scroll textures, ambient motes) stops — decide per screen: the garage keeps the hero idle breathing (a frame every 100 ms is still 10× fewer), the menu's backdrop drifts by CSS not by GL.

---

## 4. CPU profile of `render()` — b1, phone geometry, 300 frames

`pnpm harness:bench:profile` (V8 sampling profiler at 100 µs against the Vite dev server for real names; ¼ canvas; 300 frames of the b1 golden; host loadavg 32). Full tables: `harness/out/bench/profile-latest.md`.

**Top 20 self time, `high`** — 596 ms of JS + GL submit over 300 frames = 1.99 ms/frame (render() p50 1.49; the rest is physics + the bench's own timers):

| # | µs/frame | % | function | what it is |
|---|---|---|---|---|
| 1 | 369 | 18.6 | `(program)` | V8 native / GL binding glue between JS samples |
| 2 | **142** | 7.1 | `getParameters` (WebGLPrograms) | **program re-acquisition — should be 0 in steady state, see below** |
| 3 | 128 | 6.4 | `projectObject` | scene traversal + frustum cull, ~816 objects every frame |
| 4 | 115 | 5.8 | `WebGLRenderer.renderBufferDirect` | per-draw setup (205 draws) |
| 5 | 108 | 5.4 | `update` (WebGLAttributes) | vertex buffer bookkeeping per draw |
| 6 | 102 | 5.1 | `updateMatrixWorld` | world matrices for ~816 objects, ~700 of them static |
| 7 | 57 | 2.9 | `multiplyMatrices` | ″ |
| 8 | 51 | 2.5 | `renderObject` | |
| 9 | 48 | 2.4 | `gl.renderBufferDirect` (native) | the GL draw call itself |
| 10 | 41 | 2.1 | `intersectsFrustum` | cull |
| 11 | 39 | 2.0 | `upload` (WebGLUniforms) | uniform uploads |
| 12 | 37 | 1.9 | `bindVertexArray` (native) | |
| 13 | 30 | 1.5 | `getProgram` | re-acquisition |
| 14 | 29 | 1.5 | `setProgram` | |
| 15 | 24 | 1.2 | `getProgramCacheKey` | re-acquisition |
| 16 | 24 | 1.2 | `arraysEqual` (WebGLUniforms) | uniform diffing |
| 17 | 24 | 1.2 | `now` (native) | the bench's timers |
| 18 | 22 | 1.1 | `update` (WebGLObjects) | |
| 19 | 20 | 1.0 | `refreshUniformsCommon` | |
| 20 | 19 | 0.9 | `copyArray` | uniform cache |

By file: three.js 65 %, bike.ts (physics) 2 %, render/index.ts 1 %, hud.ts 1 %, game.ts 1 %, gltfRider.ts 1 %, rig.ts < 1 % — **the game's own render code is ~3 % of the frame; the frame is three.js's per-object and per-draw machinery.** `low` is the same shape at 1.30 ms/frame (render() p50 0.89): `updateMatrixWorld` 126 µs, `projectObject` 87, `getParameters` 38, `(garbage collector)` 51 µs/frame.

**Allocations per frame** (sampling heap profiler, every allocation including the collected): **high 219 KB/frame, low 105 KB/frame.** Top sites, high: `getParameters` 87 KB (each call builds a ~140-field object), `getProgramCacheKey`'s `join` 27 KB, `getProgramCacheKeyParameters` 14 KB, `setValueM4` 15 KB (uniform cache copies), `setValueV3f` 11 KB, `setProgram` 5 KB, for-of iterators in `render()`'s world updates ~8 KB, `painterSortStable`/`sort` 4 KB, physics `derive` 2 KB, `rig.update` 1.6 KB. Nothing is retained (the CPU pass shows +0.05–0.2 MB per 600 frames after a forced GC; the first run on a page +0.57 MB is warm-up) — it is churn, and churn is what a minor GC on iOS turns into the 66 ms worst frame.

**Root cause of #2 / #13 / #15 and the top three allocation rows (`harness/bench/diag-programs.ts`):** three r186 re-acquires a material's program (getParameters + cache key + `updateCommonMaterialProperties` + a full uniform re-bind) whenever `setProgram` finds the material's recorded state disagreeing with the object drawing it. On b1 that happens **30× per frame on `high`, 11× on `low`**:

| cause | materials | re-acquisitions / frame (high · low) | fix |
|---|---|---|---|
| **three's own two-pass transparent DoubleSide path**: `renderObject` sets `side = BackSide; needsUpdate = true`, draws, `side = FrontSide; needsUpdate = true`, draws, for every transparent double-sided material with `forceSinglePass === false` — two draws and two program lookups per object per frame | `fx:shaft` (7 hall shafts), `props:lampcone` (2 batches), `deck:ao` (2 skirt chunks), the wheel spokes `bike_mech` ×2, the blur discs `bike_spokecard` ×2 (`hero/lod.ts:255` sets DoubleSide), one unnamed basic | **24 · 6** (and the same number of extra draws) | `material.forceSinglePass = true` on each (one pass, both faces; these are additive / multiply quads where the back-to-front split buys nothing) |
| a material shared by an `InstancedMesh` and a plain `Mesh` | `darkSteel` (purlins, crane rail, trusses instanced + 3 plain meshes) | 2 · 2 | clone the material for the plain meshes |
| three's single shared shadow `MeshDepthMaterial` flipping between skinned / instanced / plain casters | the shadow pass | 6 · 2 | `customDepthMaterial` per object kind (three instances) |

Expected from that one iteration: draws CPU 0.63 → ~0.40 ms on high (0.34 → ~0.25 on low) on this host, −24 draw calls, −130 KB/frame of garbage on high — and on Safari, where `getParameters` is 3–5× dearer, 2–5 ms per frame. It is §3.2 #0 below.

---

## 5. Ledger

| iteration | commit | cut | bench delta (b1 high phone: submit / raster / calls / tris / rtMpx / model ms) | captures | phone |
|---|---|---|---|---|---|
| 1 | (pending) | **#0 program churn**: `util/materialKinds.ts stabilizePrograms` after every build / hero swap / tier change — `forceSinglePass` on the 74 transparent DoubleSide materials, per-kind clones for materials shared across instanced / plain / skinned (darkSteel), a `customDepthMaterial` per (material, kind) for the shadow pass | re-acquisitions/frame **30 → 0** (high), **11 → 0** (low); b1 high phone: draws CPU 0.63 → 0.47 ms (−25 %), calls 205 → 194, submit 1.44 → 1.40; medium b1: draws 0.65 → 0.41 (−35 %), calls 186 → 171, submit 1.36 → 1.10 (−19 %); h3 calls 238 → 215; idle garage high render 1.29 → 1.06 ms; raster proxy moved with host load (27–47), not quotable | det pair 15/15 identical on high and low (`out/bench/det/cut0`); A/B single-pass vs two-pass at t800: high 445 of 921 600 px differ by 1/255, low 0 px | idle menu after the parent's 0f14d3d: 0 rendered frames in 2.5 s (was 20); garage low unchanged 0.73 ms / 112 calls — still the fixed cost |
| 2 | (pending) | **#1 static-frame skip** (`render()` early-out on an unchanged frame key: tick, alpha, tSim, phase, runTime, checkpoint, ghost tick, camera pose; `invalidate()` at every scene mutation; a 30-frame valve) | idle garage on the phone context: **~75 → 2 drawn frames per 2.5 s**, `render()` 0.73 → 0.005 ms, 112 → 0 calls, 0.66 → 0 Mpx (low; the same on high: 1.06 → 0.005 ms, 192 → 0 calls); riding rows unchanged in every count (194 / 215 / 159 calls high b1 / h3 / e2); CPU ms of this run are at loadavg 7–13 (high b1 0.75, low 0.46) — not comparable to cut 0's 27–47 | det pair 15/15 identical on high and low **and equal to cut 0's hashes** (`det/cut1` vs `det/cut0`); b1 clip camera PASS 0/2553 | the garage's remaining phone cost is now the app loop + HUD DOM + compositor — the device report tells |
| 3 | (pending) | **#5 static-world matrices**: `world.group.updateMatrixWorld(true)` once, `matrixWorldAutoUpdate = false`; see-saws / drums / picked lights update their own matrices when they change | `scene.updateMatrixWorld()` 0.12 → 0.08 ms per frame on this host (isolated, 300 calls; the hero rig's ~50 nodes remain) ≈ −3 % of `render()` — smaller than row #5 promised: the 1 240-node **culling** walk (`projectObject`, 87–128 µs) is untouched and needs cached per-chunk render lists; the cross-run bench CPU columns moved +25 % between the cut-1 and cut-5 runs from host load alone (draws, which matrices cannot touch, moved with them) — sub-0.1 ms effects are measured in-page and interleaved from now on | det pair 15/15 on b1 high + low, equal to cut 1's hashes; m2 drums 15/15; A/B static vs auto matrices at 13 sample ticks on m2 / m3 / h3: 0 channels differ; b1 clip camera PASS 0/2553 on both variants | |
| 4 | (pending) | **#3 phone-high tier** (`setDeviceClass` renderer side; `post/emissiveBloom.ts`; `PostChain.setQuality(tier, phoneHigh)`; `tierPixelRatio` cap 1.5; `tierHides` phone rule; `applyQuality`): on a phone `high` = LDR straight to the canvas at DPR 1.5 (874 CSS → 1311×495), the hero-only 512² shadow, an emissive-only bloom (32 sources on b1: bulbs, gate lamps, melt, neon, sparks) at 1/8 res thresholded like the bright pass + one additive quad, no SSAO / HDR / composite, volumetrics + decals on, no scatter, no hall shafts, 80 m chunks, LOD hero, full textures | b1: **148 calls / 86 k tris / 1.59 raw (1.14 effective) Mpx / 5 passes** vs desktop-high-on-phone 205 / 179 k / 6.57 / 17 and medium 169 / 130 k / 2.08; **model 9.3 ms (≈ 107 fps) vs medium 14.1 and old high 35** (recalibrated coefficients, §2); h3 171 calls / 9.8 ms, e2 114 / 8.6. **WebKit ANGLE-Metal, every frame synced (this Mac's GPU): low 1.60 / medium 1.92 / phone-high 1.88 ms p50; p95 2.54 / 3.68 / 3.08** — phone-high ≤ medium on the Metal path, and medium holds 30 with margin on the device | det pairs 15/15 on phone-high, medium, low at 874×330@3 and on desktop high + low (desktop hashes == cut 5: the desktop tiers are untouched); stills `out/bench/det/cut3-phone/b1-high-t{100,800,1500}.png` | the governor now lands on ≈ 9 ms model on that phone; the two remaining terms are draws (148 × 0.02 = 3 ms → #4) and fill (1.14 × 4.4 = 5 ms) |
| 5 | (pending) | **#4 draw calls, part 1** — `world/props.ts buildBatches`: batches that share one material instance (and the same tier / shadow rule) bake into one mesh per chunk (matrices into positions, instance colours into vertex colours; per-chunk culling kept; `PropBatch.MERGE` is the A/B switch); unnamed world meshes (gate plaques) stop casting under the hero-only shadow | bench medians (phone): phone-high b1 **148 → 134**, h3 **171 → 147**, e2 114 → 104; medium 169 → 155 / 212 → 191; low 118 → 104 / 129 → 109; desktop high (diag) 202 → 186. Model phone-high b1 9.3 → 9.0 ms. In-page A/B merge on/off at t400/800/1200: desktop low 90 → 78, phone-high 145 → 130, desktop high 188 → 174 calls with ≤ 353 of 921 600 px differing, ≤ 1 px beyond 8/255 (an edge crack); the cut-3 → cut-4 still diffs (1 100 px on low) are Astra's arms fix 2b48370, in the rider's bbox. WebKit p50 low 1.66 / medium 2.62 / phone-high 2.66 at loadavg 26–30 (cut 3 ran at ~11: 1.60 / 1.92 / 1.88) — phone-high ÷ low = **1.18 in both runs**. Targets ≤ 100 / ≤ 120 **not reached**: what is left per frame on b1 is the 8 per-skin container batches (~20 draws: an atlas + per-instance UV offset, `#4b`), the 3-chunk neighbour visibility of 80 m chunks (~15), decals / volumetrics with distinct textures (~15), 16 hero + rider shadow draws (hero, Astra), gates (~14) | det pairs 15/15 on phone-high / medium / low and desktop high / low; churn 0; b1 clip camera PASS (row updated when the run ends) | |
| 0 | (phase 1) | bench + model + plan + profile; no render edits | baseline b1 high phone: submit 1.44 ms / raster 522 ms / 205 calls / 179 k tris / 10.07 Mpx / model 22.6 ms; low: 0.69 / 147 / 116 / 84 k / 0.66 / 10.5; idle garage low 0.76 ms CPU / 270 ms raster / 114 calls | — | garage low 24–30 fps @ cap 30, worst 66 ms (user) |
