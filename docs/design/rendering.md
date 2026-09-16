# Rendering design — Trials Rising-on-PS4 look in Three.js at 60 fps

Current hero findings and corrections to older reports: **§14, Blender branch round 1**.

Scope: `src/render/**` only. Consumes `CompiledTrack`, `PhysicsState`, `GameEvent`
from `src/core/types.ts`; implements CONTRACT §2.7 `GameRenderer` in `src/render/index.ts`
(`setTrack(CompiledTrack)`, `render(state, alpha)`, `onEvent`, `setQuality`, `camera()`,
`setRunInfo`, plus the scaffold's `finish/resize/stats/framesRendered/dispose`).
Where this doc and `CONTRACT.md` disagree, the contract wins.

The renderer is a pure function of (state history, events, simulated time). Nothing in
`render()` reads the wall clock to decide what to draw; two captures of one recording are
byte-identical (verified round 1: `md5` of the mp4 and `cmp` of PNG frames match).

Sources for the numbers: `reference/notes/{rising-visuals,techniques,evolution-gameplay,crash-restart-ui}.md`.
three 0.186.0 addons used: `EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, BufferGeometryUtils`.

## 0. Budgets and where they stand (round 9 figures in bold where re-measured; one track per session)

| Budget | Cap | Round 1 | Where measured |
|---|---|---|---|
| Draw calls | 300 (400 with an AO pre-pass) | round 7 flat-test `high` 194 riding (set pieces +≈20, AO +2); e1 156, m2 146, h1 155, h3 217 — 202 idle / ≈215 riding (+62 with the ghost; round 5 added 8 skin batches + 5 prop types + deck AO) — bike frame and rider segments are merged per material (`util/merge.ts`) | `renderer.info.render.calls` (accumulated over all passes; `info.autoReset=false`) |
| Triangles | 500 k | **round 9: b1 290 k, e1 195 k, m2 266 k, h1 148 k, h3 230 k, x1 356 k** (shadow pass counted; instanced batches chunked per 40 m and frustum-culled — b1 read 1.05 M before) — round 7: 332 k flat-test, 489 k e1, 250 k m2, 207 k h1, 639 k h3 | `renderer.info.render.triangles` |
| Texture memory | 96 MB | round 7: 44.0 industrial, 46.1 canyon, 41.8 snow, 59.4 nightCity (3 facades + shops + neon + masks), 46.0 foundry | `estimateTextureMB` (all maps incl. mips, env, canvas textures) |
| Track + obstacles | 20 calls / 80 k tris | 11 calls / 5.1 k tris (12-kind synthetic track) | `debugInfo().trackCalls/trackTris` |
| Texture generation | 400 ms desktop, after first frame | ≈330–400 ms in headless Chromium (SwiftShader host) | `debugInfo().textureGenMs` |
| Shader programs | 40 (raised round 5) | **round 9, one track per session: b1 38, e1 35, m2 31, h1 37, h3 39** (the round-8 "50 / 53" were one session accumulating five tracks) — round 7: 37 flat-test `high`, 19 on `low` | `info.programs` (accumulates per session — measure one track per session) |
| Restart → frame | 1 frame | 1 frame; no rebuild on restart | capture scene detector, scratch `restart.mts` |
| Boot (`prepare`) | no task > 50 ms except GPU compiles; boot art ≤ 1 MB | round 9: every JS task ≤ 42 ms (bike kit 42, rider 33, materials ≤ 12 ms slices, shaders 2 materials/task, art rebuild 380 ms → see gaps); boot art 0.99 MB (was 2.77) | scratch `render6/prepare.mts` (harness) and `boot.mts` (real loader) |
| Synced frame, SwiftShader | p95 250 ms | round 9 (b1, load 17): `high` p50 160–175 / p95 247–257 ms, `low` p50 69–71 / p95 114–117 ms (**41–44 %**); round 6 (quiet): `high` p50 134 ms, `low` p50 75 ms (56 %) | scratch `timing.mts`, 24 frames after warm-up |
| JS heap growth | 5 MB / 60 s | −1.8 MB | `harness:perf` |

## 1. Frame and cues (`frame.ts`)

`FrameBuilder.build(cur, alpha)` keeps the previous `PhysicsState` and interpolates every
transform (`bike.pos/angle`, wheels `pos/spin/spinVel/compression`, `rider.*`) by `alpha`.
`tSim = lerp(prev.time, cur.time, alpha)`; `dt = tSim − tSimPrev` (0 on a cut). A **cut** is
declared when `cur.tick < prev.tick` or `cur.time < prev.time` (a `reset()`), on `setTrack`,
and on a `restart` event: every smoother snaps, particles flush, interpolation is disabled
for that frame — so the checkpoint frame renders at rest on frame N+1.

Cues derived per frame: `speed`, `groundSpeed`, `airborne`, `airTime`, `justLanded` (a wheel
grounded flip after air or with `vel.y < −1.5`), `landImpulse`, `crashed`
(`faulted ∈ {crash, hazard}` or `ragdoll !== null`), `finished`. Direct reads from the contract
state: `input.throttle`, `engine.throttleEff/rpm`, `contacts.rear/front`, `rearSlip`, `ragdoll`,
`seesaws`, `drums`, `checkpoint`.

Events (`onEvent`): `land{impulse,wheel,surface}` → landing dust; `checkpoint{index}` → flame
jets; `finish` → confetti + white flash; `fault{crash|hazard}` → crash dust; `restart` → cut.
When no `land` event arrives (mock physics) the derived `justLanded` cue fires the puff instead.

## 2. Module layout — `src/render` (as built)

```
src/render/
  index.ts                GameRenderer interface, ThreeRenderer facade, describeRenderer, estimateTextureMB, RENDER_BUDGET
  frame.ts                FrameBuilder: interpolated state + cues + tSim (pooled)
  camera/rig.ts           CameraRig: zoom states, framing, lookahead, shake, crash/finish beats, CameraKeys, camera() debug
  lighting/environment.ts LightingRig: sun + snapped shadow frustum, hemisphere, procedural equirect sky → PMREM, fog chunks
  materials/texgen.ts     Periodic value/ridged/Worley noise → albedo + Sobel normal + ORM DataTextures; 10 painters
  materials/library.ts    MaterialLibrary: ~45 named MeshStandardMaterials, SurfaceKind→material, derive(), generateTextures()
  world/track.ts          Ribbon geometry helpers (bevels, aprons, vertex shade) + profileY
  world/deck.ts           Built ride surfaces per collider.surface × biome (boards, dirt bed, kerbs, paint lines) + supports
  world/obstacles.ts      Bodies for the 12 placed kinds + unclaimed box/circle/seesaw colliders + hazards
  world/gates.ts          Set pieces: start gate + crowd, checkpoint gates (numbered plaque lights green), finish arch, flags, sponsor barriers, crowd shader
  world/props.ts          PropBatch (InstancedMesh) + geometry recipes (container, pallet, drum, tyres, column, truss, lamp, rack, rock, pine, bale, cone, building, pipe)
  world/biomeKit.ts       Per-biome world: calls hall.ts for interiors; terrain + 3 parallax silhouette tiers + kits for canyon / snow / nightCity
  world/hall.ts           The industrial hall (industrial + foundry): shell, roof structure, crane, lamps on chains, three container rows, shafts, AO bakes
  world/canvasTex.ts      canvas → CanvasTexture helpers
  util/merge.ts           mergeStaticChildren: one mesh per material for static bike / rider parts
  biomes/index.ts         Biome descriptors (5): sun, hemi, sky, fog tiers, floor fog, grade, bloom, ambient particles
  bike/bikeModel.ts       Bike (tube/lathe/primitives) + Wheel (tyre, rim, hub, disc, 32 spokes, blur disc)
  rider/riderModel.ts     Articulated rider (2-bone IK arms/legs) + ragdoll drawn from state.ragdoll
  particles/ParticleSystem.ts  GPU-integrated THREE.Points pools (ballistics + drag in the vertex shader from uTime = tSim)
  particles/emitters.ts   Cue/event → burst rules, seeded by track.seed ^ tick
  post/chain.ts           EffectComposer: RenderPass (HalfFloat + depth tex on high) → AOPass (half-res SSAO, high only) → UnrealBloom → Composite (heat haze, AO, smear, ACES, grade, vignette, chroma, flash, dither, sRGB)
```

**Boot (round 9).** The constructor makes the WebGL context, the material table (flat colours), the
camera rig, the frame builder and the particle pools — nothing else. `prepare(report)` builds the
rest in ≤ 16 ms tasks (art boot set · bike kit · rider kit · lighting · post chain · painters in
12 ms row bands · glTF hero · shaders two materials per `compileAsync` · first frame in two rows);
`render()` before that finishes paints a fog-colour placeholder in play mode (the loader covers the
canvas; it also starts `prepare()` if nobody has) and builds everything synchronously in harness mode
(`preserveDrawingBuffer`), so a capture's first frame is final. `debugInfo().prepare` is the
timeline (step, ms, bytes).

`render()` per frame: `frames.build` → (frame 2 only) `lib.generateTextures()` → `rig.update` →
`lighting.follow(rig.target)` → `bike.update` → `rider.update` → ghost (`ghostFrames.build` + its own bike/rider) → seesaw/drum/lamp/flicker updates
→ `emitters.update` → `post.setDynamics` → `post.render()`. `renderer.info` is reset once per
frame so `stats()` counts every pass.

Debug (not contract): `window.__render` is the renderer; `renderer.debug` exposes scene, renderer,
lighting, post, lib, rig, THREE; `renderer.debugInfo()` reports biome, zoom state, tier,
track calls/tris, texture-gen ms, pass count.

## 3. Camera rig (`camera/rig.ts`)

Perspective, vertical FOV 28° (idle) → 34° (riding). Bike+rider height is taken as 1.9 m; the
distance is solved from the target height fraction: `d = (1.9 / hf / 2) / tan(fov/2)`.

| State | Trigger | heightFrac | screenX (moving right) | screenY | yaw | pitch |
|---|---|---|---|---|---|---|
| idle / countdown | speed < 1.0 (enter riding at 2.2) | 0.40 | 0.45 | 0.55 | 20° | 10° (3/4 view: depth reads before GO) |
| riding | 2.2–10 m/s | 0.26 | 0.34 | 0.56 | 18° | 18° (round 11; every course's `side` key overrides to 16° / 21°) |
| pull-back | 10 → 18 m/s, `smoothstep` | 0.26 → 0.16 | 0.36 | 0.56 | 19° | 22° |
| fast / air | speed > 18, or airTime > 0.25 s (70 % of the way) | 0.16 | 0.36 | 0.53 | 19° | 22° |

Round 4 measured on `flat-test-clear` (`camera().bikeHeightFrac`, smoothers included): 0.399 idle;
0.288 @ 8.7 m/s; 0.278 @ 10.3; 0.268 @ 11.9; 0.234 @ 14.9 (t = 1.8 s); 0.189 @ 17.1; 0.147 @ 19.5;
0.136 at the 20 m/s limiter. Round 3 stepped to 0.14 at 11 m/s, which made every riding frame a wide
frame (bike ≈ 15 % of frame height at 1.85 s against the reference's ≈ 25 %).

**Roll is always 0** (Euler YXZ from yaw/pitch keeps the camera right vector horizontal; the
landing shake moves y only). Only a `CameraKey.roll` can roll. `camera()` reports the measured
`roll` (angle of the camera right vector to the horizontal) plus `yaw`, `pitch`, `state`, so the
harness can assert `|roll| < 1e-6` on flat-test (round 2: 0.0 on every sampled frame).

`zoomT/fastT` are 0/1 from the state machine, `airT = smoothstep(0, 0.7, airTime)`. Moving left mirrors screenX and yaw. Each parameter is followed by an
exponential smoother (half-lives: follow x 0.12 s, follow y 0.18 s with a 0.6 m dead-zone on the
ground, lookahead 0.25, heightFrac 0.35, screenX/Y 0.5, yaw/pitch 0.45, roll 0.6, fov 0.3).
Lookahead `clamp(vel.x·0.15, −1.5, 2.5)` on top of the screen offset.

The camera is composed from yaw/pitch/roll (Euler YXZ) → view dir; the aim point is offset along
the camera right/up axes so the followed bike point lands at (screenX, screenY); the camera sits
`d` back along the view dir. `camera()` projects the bike centre (`bikeY + 0.45`) and a 1.9 m
vertical segment through the real camera matrices → `bikeScreenX/Y`, `bikeHeightFrac`. Measured
round 1: idle 0.45 / 0.55 / 0.399; riding at 8.6 m/s 0.40 / 0.55 / 0.30; fast 0.30 / 0.54 / 0.089.

Beats: **landing shake** `a = clamp(impulse·0.02, 0, 0.12) · e^(−t/0.18) · sin(2π·9t)` on y plus
±0.8° roll. **Crash**: target → ragdoll pelvis (or bike), follow half-lives ramp 0.12 → 1.0 over
1 s, then `heightFrac` creeps 2.5 %/s; pitch 14°, yaw 12°, bike at x 0.45. **Finish** (round 9): the game cuts throttle and auto-brakes on a 30 m run-out; the x-follow
half-life eases 0.12 → 1.0 s over 1.5 s onto the **midpoint between the finish gate and the bike**
(the y-follow stays at 0.18 s with no dead-zone — run-outs slope), the frame widens so gate + bike +
6 m fit (heightFrac `min(hold, 1.9·aspect / need)`, floor 0.13), screenX → 0.5, and a 3 s dolly runs
yaw 15° → 28°, pitch 11° → 7°, hold 0.24 → 0.17, then everything holds. Lookahead is 0 after the
line. `index.ts` passes speed 0 to the composite after the line: **no smear, no chromatic aberration**.
A crash past the line freezes physics at the tick before (`f.crashed` stays false), so the same hold
runs. Evidence: `scratchpad/render6/finish/b1-finish-6s.mp4` + `finish-sheet.jpg`. **Restart**: hard cut (every
smoother snapped). **Countdown/menu** (`setRunInfo.phase`): idle params held.

`meta.camera` keys: while `bikeX ∈ [x0, x1]` a per-key weight follows 1 (half-life `blend/3`,
or snaps when `cut`); `yaw/pitch/roll` override, `zoomBias` scales heightFrac by `1 − 0.6·bias`,
`dist` converts to a heightFrac at the current fov. Modes (round 11): `side` (16°/21° — the reference riding camera; every course authors it), `side-tight` (14°/19°, bias
−0.5), `high34` (30°/48°), `low` (14°/−8°).

## 4. Lighting, shadows, fog (`lighting/environment.ts`, `biomes/index.ts`)

Per biome: one `DirectionalLight` sun + one `HemisphereLight` + `scene.environment` from a
procedural 256×128 float equirect sky (zenith→horizon→ground gradient, horizon haze band, sun
disc up to intensity 40 + glow) run through `PMREMGenerator` (row 0 = nadir; the sky was upside
down until that was fixed — the tell was a bright floor lit "from the sky below"). The same sky
is `scene.background`. Renderer tone mapping is **off**; ACES + exposure live in the composite.

Industrial numbers as tuned (round 2, matched against `reference/techniques/clips/01` and `07`
frames: median luminance 0.19–0.27 vs 0.28–0.29 reference, 1st percentile 0.01–0.06 vs 0.09–0.12,
mean HSV saturation 0.39–0.41 vs 0.19–0.30): warm key `0xffe2c4` × 3.2 from (−0.45, 0.78, −0.30),
**neutral-cool skylight fill** hemi `0x9cb6d8` × 0.65, env 0.4, exposure 1.25, contrast 1.16
(power curve about 18 % grey), saturation 0.95, no global tint (gain 1.02/1.0/0.98, lift 0),
fog **desaturated warm grey** `0x6a625a` tiers **16/55/110 m** (round 4: the hall is 60 m deep, so the far wall sits at ≈45 % haze and each container row is a visible step nearer), floor fog density 0.035 sitting on the hall floor (`LightingRig.setFloor(groundFloorY)`), bloom 0.45.
The round-1 sepia came from an amber fog colour + amber gain + orange dirt; colour separation now
comes from the materials themselves (per-instance container colours, white bike plastics, blue
frame, yellow jersey, dark armour, grey concrete, red/blue drums).

Shadows: one 2048² `PCFShadowMap` (`PCFSoftShadowMap` no longer exists in r186), bias −0.0004,
normalBias 0.03; orthographic frustum 28×18 m (48×30 m when the camera distance > 20 m) centred
on the camera target and snapped to texel increments (1.37 cm) so edges do not crawl. Casters:
bike, rider, obstacles, props; ground/ribbons receive only.

Fog: the stock `fog_*` shader chunks are replaced once at startup with a three-stop curve
(0 at `fogNear`, 0.5 at mid, 0.85 at `fogFar`, 1 at 1.6·far) plus exponential floor fog
`density · e^(−max(0, y−h0)/hs) · (1 − e^(−depth/mid))`. The extra parameters travel through
one shared uniform attached by `fogify(material)`; every world material goes through it.
Bike/rider materials are deliberately not fogified (they are always near the camera).

## 5. Materials — all procedural at load (`materials/*`)

No downloads. `texgen.generate(size, seed, painter, normalStrength)` runs a painter over a
tile producing albedo (sRGB), a Sobel normal map from the painted height, and an ORM texture
(AO.r / roughness.g / metalness.b) bound to `aoMap/roughnessMap/metalnessMap` at once. Noise is
periodic value noise on a seeded permutation table (fbm, ridged, Worley F1), so every tile wraps.

Jobs (frame 2, synchronous so the frame they appear on is identical in every capture):
dirt 512, plank 512 (rotated 90° so planks run across the track), concrete 512, rust 256
(steelPlate/rustSteel/grate/darkSteel), corrugated 512 (containers/barrels, colour via
`material.color` or per-instance colour), rubber 256 (tyre, normal+ORM only), paintMetallic 256
(frame paint, body plastics, helmet: flake + edge chips), brushed 256 (alloy/anodised/rim, normal+ORM
only), fabric 256 (jersey/pants/gloves/riderCloth, normal+ORM only; round 6 weave amplitude ÷5 so
sleeves stop reading as ribbed), rock 512, snow 256. ≈ 21 MB; total scene
texture footprint incl. canvas textures (wall bays, plaques, banner, silhouettes) and the env
is 38.8 MB.

`MaterialLibrary` creates every material flat (colour only) so the first frame draws
immediately; `generateTextures()` binds maps to the named materials and to every clone made
via `lib.derive(name)` (ribbons need `vertexColors`, so they are derived clones). Saturation
rule (round 6): bike frame `#1d4fd8` + plastics `#2158e0` (metallic blue), engine/lowers black, alloy
brushed, white only on the number plates; jersey `#f5c518`, pants dark blue, helmet blue `#1c48d4`,
boots/gloves black; the environment stays low-chroma.

**One program variant.** `MaterialLibrary.complete(m)` gives every `MeshStandardMaterial` the full
map set (2×2 neutral white albedo / flat normal / ORM = 1 for untextured ones, plus a white
emissiveMap), so the albedo/normal/roughness/metalness/AO/emissive-map defines are identical across
the library and the world materials (`setTrack` traverses the world and completes them). Remaining
variants are instancing, vertex colours and instance colour. Result: 32 programs on industrial
(was 39–58).

## 6. Post chain (`post/chain.ts`)

`EffectComposer` on a HalfFloat target: `RenderPass` → `UnrealBloomPass` (threshold 1.25 in
linear HDR so only emissive/sun/sparks cross it, strength per biome 0.5–0.8, radius 0.3) →
`Composite` ShaderPass: background smear (5 taps along the screen-space travel direction,
length `clamp((speed−9)·1.1, 0, 8)` px, masked to zero within 0.12–0.34 of the bike's screen
position so bike and rider stay sharp) → exposure → ACES → lift/gain grade + saturation →
vignette → chromatic aberration `0.006·smoothstep(8,16,speed)` → flash → 1/255 dither → sRGB.

| Tier | Chain | Bloom mips from | Shadows | Canvas pixel ratio | Particles |
|---|---|---|---|---|---|
| low | **none** — scene straight to the canvas, grade as `CustomToneMapping` (round 12, §11g) | — | **off** (materials recompiled) | ≤ 1.0 and ≤ 1600 px wide | ½ counts, no ambient |
| medium | HDR composer, no SSAO | ¼ frame | 1024², deck-level casters | ≤ 1.25 | full |
| high | HDR composer + SSAO | ½ frame | 2048² | ≤ 2 | full |

Smear, chroma and heat haze are off on `low`. The bloom result is sampled by the composite (`tBloom`),
not blended back over the HDR buffer (round 12). Round-11 SwiftShader synced p50 at 1280×720 were
low 60 / medium 125 / high 95–137 ms; those are not phone numbers (§11g). Contact: no SSAO yet; instead each tyre carries a projected contact-shadow
blob (radial-gradient plane at the ground point, opacity 0.55 + 0.3·compression, fading over 0.6 m
of hover using the profile height under the wheel) and the tyre torus squashes toward the ground by
`5.5 % · (0.4 + compression)` inside a non-rotating parent group so the contact patch flattens.

## 7. World kit — 5 biomes (`world/biomeKit.ts`, `world/props.ts`)

Common: a terrain strip along the profile beyond the ribbon apron (interior: flat concrete
floor at `min(profile.y) − 0.42`; exterior: profile-following, falling away 2.5 m over 30 m
with a gentle wave). Props are `InstancedMesh` batches seeded from `track.seed ^ 0x5bd1e995`
at z ∈ [−16, −4.5], rare low foreground occluders at z ∈ [+5, +8.5]; nothing within |z| < 3.5.

| Biome | Shell / backdrop | Props | Lights & particles |
|---|---|---|---|
| industrial (`hall.ts`) | **The track is built ≈3 m above the hall floor** (`groundFloorY`: min profile − 3.01 m; deck.ts puts a continuous row of cross-wise containers + pallets under it). Back wall at z −30, 16 m tall: brick bays with an 8×7 m window bank (sill 3.5 m, 5×8 panes) + clerestory, emissive 1.3; side walls; roof at 16 m with skylight strips; trusses every 12 m spanning the 60 m depth, purlins, I-columns at the wall / mid-hall / foreground; gantry crane rails at 12 m with a bridge, trolley, cable and hook block; catwalk under the windows | three container rows: far (z −25, 2–4 high, 25 % gaps), mid (z −15, 1–3 high, 35 % gaps, some turned), near (z −7.5, singles, sparse); racks against the wall, pallet stacks, drums, tyres, cones on the floor; foreground (z 4.5–8) columns, drums, tyres, pallets; **vertex-baked AO** on every prop (`bakeAO`: dark at the base, darker undersides) | high-bay lamps on 6–7 m chains over the mid hall every 12 m; foreground chains that slide past the camera ending in hook tyres just above deck height (a few carry a lamp); one 8.5×30 m light-shaft quad per second bay from the window bank along the sun (alpha 0.075); dust motes |
| foundry | same hall: dim orange panes (emissive 0.7), darker brick, molten emissive 4.5 | + molten pillars (flicker), pipe runs, ladles with a melt disc, a molten channel along the floor | 1 point light, embers |
| canyon | 3 mesa silhouette tiers at z −45/−130/−340 | **sandstone strata slabs** (banded canvas albedo) in two rows at z −12 (2–4.5 m, 30 % gaps) and z −25 (6–14 m) plus a low foreground slab now and then; rocks (AO-baked), dry scrub (olive icosahedra, also in the foreground), bales, tyres, drums | warm low sun, peach haze |
| snow | pine tiers + far hills; sky blue-grey `0x8fa4bf` | pines with **white snow caps** (second batch), crates with snow lids, warm lamp posts, low fences | snowfall, floor fog, exposure 1.3, saturation 0.82 |
| nightCity | city-skyline tiers with an emissive window grid on the nearer two | buildings set back at z −22..−38 (+ taller ones 16 m behind), 22 % lit windows at metre scale; **neon signs** (`MOTO / TRIALS / GARAGE / 24H`, magenta / cyan / yellow / orange, emissive 2.2) on posts at z −7..−11 with ≤ 2 coloured point lights; street lights every 12–17 m with an emissive head and a soft light cone; fire barrels (flicker), drums, cones; **wet asphalt** ride surface (`asphaltWet`, roughness 0.35) | embers |

Fog tiering falls out of real depth: the silhouette planes sit at real distances and the fog
curve does the 100/50/15 % contrast.

## 8. Track and obstacles (`world/deck.ts`, `world/track.ts`, `world/obstacles.ts`, `world/gates.ts`)

**Built ride surfaces (round 3).** The surface comes from `collider.surface`, the construction
from `meta.biome`:

| surface | construction |
|---|---|
| wood | individual 0.22 m boards across the track (per-board hue/wear via vertex colour, plank slice per board, 2 cm gaps), lengthwise plywood edge boards, steel joists underneath |
| dirt, interior | contained 3.2 m dirt bed with a darker worn line, plywood kerb boards both sides — never a wide brown road |
| dirt, canyon | wide ribbon with rock edging (instanced rocks at z ±1.7–2.3 every 2.6 m) |
| concrete | slab + painted edge lines (nightCity asphalt look) |
| metal / grate | steel plate + angle-iron edges (foundry) |
| snow | packed snow with dark apron |

Interior biomes get the structure under the ground profile down to the hall floor (round 4: the
floor is 3.01 m below the lowest profile point): every 2.5 m a cross-wise container (6.06 m across
the track, so it sticks out 1.5 m each side as a ledge) per 2.59 m of height, topped with 2-wide
low-poly pallets to the exact deck height; 1.3–2.5 m gets a steel frame, < 1.3 m pallet stacks. On
flat-test the dirt bed sits on one container + two pallet layers — the reference "elevated track in a
huge hall" read, and the camera looks down into the space beside the deck.

**Worn line.** Every ground polyline that is not an interior dirt bed carries a 0.36 m translucent dark
strip (`rubberMat` derivation, opacity 0.22, polygon offset) down the ridden path (reference obs. 19).

**Ribbons (legacy helper).** Every polyline collider becomes a ribbon along its exact points (resampled to
≤ 0.75 m). Ground profile (`obstacleIndex = −1`): 9-row section — flat top z ∈ [−1.5, 1.5],
bevel to ±1.75 (−0.16 m), apron to ±3 (−0.42 m). Obstacle polylines: 5-row 3 m board with a
5 cm chamfer, lifted 4 mm. Drops are applied along the surface normal so bevels stay bevels on
slopes. UVs: `u = arcLength / tile`, `v = z / tile` (tile per surface: dirt 2.5, wood 1.5, metal
1.5, concrete 3, …). Vertex colour bakes apron darkening and a small steep-face shade. Merged
per `SurfaceKind` → one draw per surface.

**Bodies** (`placed`, params read with defaults `length height width depth radius angleDeg
thickness count spacing surface`):

| kind | body |
|---|---|
| ramp / stair / ledge / wall | polyline outline extruded to the ground profile ("skirt"), 3 m deep; stairs get steel nosings |
| plank | board of `thickness` (0.08) under the polyline; steel trestles every 2.5 m when elevated |
| drum | cable spool (rim, flanges, hub, wrapped cable, white flange stripe) + cradle; own mesh, `rotation.z = state.drums[id].spin` |
| barrel | ribbed drum on its side, red/blue alternating |
| logpile | one log per circle collider (or a skirt for an outline) |
| pole | post from the circle down to the ground + hazard-tape cap |
| box | box collider as a container/plywood crate |
| gap | nothing (hazard draws water/fire) |
| seesaw | plank + chrome axle in a pivot group (`rotation.z = state.seesaws[id].angle`) + triangular stand |

Static bodies merge per material; dynamic ones (drums with `rolls`, seesaws) stay separate.
Colliders no `placed` entry claims still get a body (compiler stub safety). Hazards: water =
dark glossy plane, fire = emissive grate strip.

**Gates.** Checkpoint: two posts at z ±2, beam, lamp (dark red → green once `state.checkpoint ≥ i`),
hanging plaque with the zone label (D1…A3 from the checkpoint index) angled toward the camera.
Finish: tall posts, arch, checkered `FINISH` banner, white lamp. Flame-jet emitter positions
are the four gate corners.

## 9. Bike (`bike/bikeModel.ts`) — round 6 hero rebuild

Frame-local coordinates: origin = axle midpoint at static sag, x forward, y up, z toward the camera
(the rider's left). `originOffset` (bike.pos → axle midpoint, calibrated on the first grounded frame;
measured `(0.055, −0.144)` on flat-test) is public because the rider's crash hand-over needs it.
Wheels sit at the physics wheel positions; the swingarm aims at the rear axle, the fork lowers group
slides along the fork axis to the front axle, the shock stretches to 55 % along the swingarm and its
**coil compresses** (`scale.y = len/len0`). Visual exaggeration is now ≤ ×1.3 of the physics travel
(sink 3 cm per unit of summed compression, pitch 0.05 rad × (rear − front), landing overshoot ≤ 4 cm):
physics at 1.4 g compresses to 0.8–0.93 and rebounds by itself.

Layout (m, axle coords): wheelbase 1.30, wheel r 0.34 (front 21" rim r 0.262 × 2.75" section, rear
18" r 0.228 × 4.00"), swingarm pivot (−0.22, 0.10), head tube (0.43, 0.50)→(0.35, 0.68) collinear with
the fork axis (24° rake), grips (0.27, 0.78) z ±0.33 (bar width 0.80), pegs (−0.14, 0.02) z ±0.20.
Parts: **twin 40 mm spars** (tube on Catmull-Rom, head → over the engine → pivot plates), downtube,
twin cradle tubes + bash plate in the dusted paint variant, seat rails + struts, head gusset; slim
**tank** (rounded box) → black seat on a dark seat base → **rear mudguard**; small side panels with a
white oval plate, small shrouds off a radiator under the head tube; **engine**: rounded crankcase,
finned cylinder leaning forward with an alloy head cover + plug, carb + intake boot, clutch / ignition /
sprocket covers, water pump, kick lever (far side), brake pedal (near), shifter (far), airbox under the
seat; **exhaust**: header from the cylinder front down under the engine and back up to a black
silencer under the seat on the camera side (`exhaustTip` (−0.83, 0.41, 0.15)); bars (brushed) with
crossbar + pad, risers, grips + bar ends, brake/clutch perches + levers, three cables (brake hose down
the near fork leg, clutch cable, throttle), front number plate, triple clamps; **forks**: black uppers,
chrome stanchions with dust seals, anodised lathe sliders with blue fork guards, caliper, front fender
(flat torus arc hugging the tyre, on the lowers); **swingarm**: tapered brushed-alloy arms, cross brace,
axle blocks, chain guide, shock linkage; **shock**: anodised body + reservoir, chrome shaft, red coil
(helix TubeGeometry, 7.5 turns); **chain** on the camera side (z 0.135) with the scrolling link texture,
front sprocket + rear sprocket ring with 42 teeth; **wheels**: torus carcass + **40 rows of geometric
knobs** (centre block / two shoulder blocks alternating) so the silhouette is knobbly, alloy rim +
rim bed + lathe hub, wave-edged brake disc with 6 bolts (front disc near side, rear far side), 32
crossed spokes fading to the blur disc over |spinVel| 12–30 rad/s, contact blob.

Materials (all `MeshStandardMaterial`, no new program): `framePaint` 0x1d4fd8 and `bodyPaint`
0x2158e0 with the **`paintMetallic`** painter (flake in roughness, wear-noise chips go bare metal via the
ORM, albedo only darkens at chips — no noise albedo, the round-5 "camo"), `framePaintLow` dusted blue
for the cradle/bash plate, `engine` black, `alloyBrushed` + `anodised` + `rim` with the **`brushed`**
painter (anisotropic scratches), `chrome`, `tyre` (rubber normal/ORM), `disc`, `shockSpring` red,
`numberPlate`. Static frame parts merge to one mesh per material (10 draws); swingarm 3, fork upper 2,
fork lower 2, shock 2 + coil, chain 1, per wheel tyre / rim+hub / disc+bolts(+sprocket) / spokes /
blur (hidden when slow) / contact. Bike alone: **≈30 meshes, 31.4 k tris**.

## 10. Rider (`rider/riderModel.ts`) — round 6 hero rebuild

7.5-head body at 1.78 m: torso 0.50 (hips → shoulder line), head centre 0.195 above the shoulders,
helmet shell r 0.125 (≈0.26 m tall with the chin bar), upper arm 0.30, forearm 0.27 to the **grip
centre**, thigh 0.44, shin 0.43 to an ankle 0.09 above the peg, shoulders ±0.20, hips ±0.09.
Segments (`Segment`: group whose +y runs joint→joint, scaled to the IK length, merged to one mesh per
material): torso = lathe body (wider across the shoulders, 0.72 front-back) + shoulder caps + dark
collar + neck brace torus + back hump + number patches ("27" canvas, front and back) **+ the pelvis**
(pants block, belt, hip spheres hanging under the torso base — it tilts with the torso, so it lives in
the torso segment); head = helmet shell + chin bar + mouth vent + goggle frame with **mirrored lens**
(`visor`) + strap + peak + white centre stripe + rear vent + neck; upper arm = tapered lathe sleeve +
shoulder root sphere + sleeve fold + elbow sphere; forearm = tapered sleeve ending 3 cm before the
grip + glove cuff + cuff strap **+ the fist** (four finger tori around the bar axis, palm, thumb —
flattened into the forearm group so the segment is one draw); thigh = lathe + hip root sphere + knee
brace cup + hinge discs; shin = knee sphere + tall boot lathe + shin plate + three buckles; foot = a
separate level group at the ankle (boot body, toe, sole, heel cup). Everything cloth-like (jersey
0xf5c518, pants 0x1c2a4e, gloves, boots, sole, armour, buckles) is one **vertex-coloured
`riderCloth`** material (fabric normal/ORM, the existing vertex-colour program variant); helmet, visor,
helmet trim and the number patch keep their own materials. Posed rider: **16 meshes, 19.5 k tris**.
`util/merge.ts` now keeps the `color` attribute when every part of a slot carries it.

**Always standing on the pegs** (Trials riders never sit; the round-5 seated idle is gone). Pose =
physics' drawn chain (physics.md §7.7) evaluated in frame-local coords: hips
`(−0.12 − 0.28·back + 0.14·fwd − 0.06·crouch, 0.74 − 0.28·crouch)`, torso from frame-up
`0.62 + torsoPitch + 0.3·fwd + 0.35·crouch − 0.1·back − 0.1·armExtend`, head at `0.45·torsoA − 0.1`,
**no world-level counter-rotation** (the ragdoll head carries none). Two departures from the chain,
both requested of physics: (1) **hanging off the back** the chain's `−0.5·back − 0.35·armExtend` lays
the torso flat and puts the shoulders 1.1 m from the grips, so the shoulders are pinned at arm's reach
from the grip (`φ = 0.32 + 0.15·crouch` above the bar line, weight `back`) with the torso near the attack
angle and the hips hanging from them — butt over the rear fender, arms straight; (2) the crouch drops
0.28 m / folds 0.35 rad (chain 0.40 / 0.50), which keeps the chest above the bars. Safety clamps:
hips never beyond thigh+shin from the ankles; shoulders never beyond 98.5 % of arm reach from the
grip (the whole upper body slides toward the bars) nor closer than 0.30 m (the IK degenerates when a
folded crouch puts the shoulder on the grip). Arms: two-bone IK shoulders → grip centre, elbows up and
out (z ±0.30); the forearm segment always ends on the grip, so **hands are on the grips in every
posed frame** (`debug.armStretch` = forearm actual/nominal length: 1.006 max over a 690-frame run,
the 3D z-offset). Legs: hips → ankles, knees forward at z ±0.16, boots level. The ≈80 ms pose lead
from round 4 is kept.

**Ragdoll hand-over.** `poseRagdoll` draws each body with local +y = `(−sin a, cos a)` (physics
convention; up for torso/pelvis/head, distal→proximal for limbs — round 5 drew `(cos a, sin a)`, a 90°
pop), arms/legs twice at z ±0.15, fists at the forearm ends and boots at the shin ends. The frame
builder now **interpolates ragdoll bodies** like every other transform (`FrameBuilder.ragdoll`). On
the spawn frame the last posed joints (kept frame-local, carried to world with the *current* frame
matrix so the bike's own travel is not counted) are compared with the physics bodies:
`debug.ragdollResidual` (torso/pelvis endpoints) and `debug.ragdollDetail` (every body). The drawn
endpoints blend posed → physics over 2 frames for a residual < 10 cm, 3 / 4 / 5 frames at 20 / 30 / 30+
cm. Measured on flat-test loop-outs: angles coincide (head Δ 0.05–0.27 rad), positions differ by a
rigid offset of **0.28–0.48 m** = the physics chain being expressed in `bike.pos` coordinates without
the axle-origin offset (`originOffset` (0.055, −0.144)) plus the render's reach slide / pinned
shoulders at full lean-back (the chain's shoulders are 1.1 m from the grips there). The blend hides
it in 4–5 frames; the fix is on the physics side (below).

## 10a. Ghost (`index.ts setGhost`, CONTRACT §2.7)

`setGhost(state | null)` keeps the state; `render()` builds it through a second `FrameBuilder` with the
same `alpha`, so the ghost interpolates and cuts exactly like the live bike. It is a second `BikeModel`
+ `RiderModel` whose materials are library derivations set to `transparent`, opacity 0.35 (the wheel's
own spoke/blur fades are capped at 0.35 each frame), `depthWrite=false`, colour lerped 65 % toward
`0x9aa4b4`, emissive off, metalness ≤ 0.3; no shadows, contact blobs removed, `renderOrder −1`, depth-tested
so the live bike and the world occlude it. It emits no particles and nothing else reads it. Cost:
+62 calls, +16 k tris, +2 programs (31 total). Verified with a scratch state offset 1.8 m ahead
(`scratchpad/render2/ghost.png`).

## 11. Particles (`particles/*`)

Six `THREE.Points` pools (dust 2048, smoke 512, sparks 1024 additive, flame 1024 additive,
confetti 1024, ambient 1024). Per particle: `pos0, vel0, birth, life, size0/1, colour, gravity
scale`; the vertex shader integrates `x = x0 + v0(1 − e^(−kt))/k + ½ g t²` from `uTime = tSim`,
so spawning is the only CPU work. Point size is world-metres via `uScale = viewportPx / (2 tan(fov/2))`.
Rng: `core/rng` sfc32 reseeded per burst with `track.seed ^ tick ^ salt`.

| Cue | Burst |
|---|---|
| `rearSlip > 1.2` on dirt/snow/stone, rear grounded | 2–10 dust every 30 ms behind the contact, life 0.4–1.2 s, 0.12 → 0.55 m, back + up |
| same on metal/grate, slip > 2.5 | 8 sparks every 40 ms, gravity, 2.5 m/s cone |
| `land` event / derived landing | dust 8–40 by impulse (wood 40 %), life by surface (snow 0.4–0.9, wood/concrete 0.3–0.6, dirt 0.8–1.6); sparks on metal |
| `throttleEff > 0.15` | exhaust puff at the muffler tip every 0.3 s (0.12 s above 0.6), grey, 0.12 → 0.3–0.5 m |
| `checkpoint` | 4 flame jets: 6 staggered bursts of 8 over 0.7 s, 6.5 m/s up, orange/yellow, + smoke |
| `finish` | 400 blue/white confetti from both posts + composite flash 1 → 0 over 0.2 s |
| `fault crash/hazard` | 30 dust at the bike |
| ambient | motes (industrial), snowfall, embers (nightCity/foundry) around the camera target |

## 11a. Round 5 (hero asset + critic round 2) — what landed

- **Containers**: 8 skin variants (rust level × logo × door side × hazard stripe) as 8 batches over one
  program; stack layers turn 180° at random; 9 instance colours. **New prop types**: cable reels, scaffold
  towers, hanging tarps, forklifts, signage boards (`hall.ts`).
- **Windows**: wall emissive 1.3 → 0.95 so the brightest window pixel stops clipping at 1.0.
- **Contact / AO under the deck**: a vertical dark gradient ribbon (0.7 → 0 over 1.4 m) on both deck
  edges plus a 1.3 m skirt across the container ledge (`deck:ao`), the corner SSAO would darken.
  **SSAO itself is not in**: `SSAOPass`/`GTAOPass` re-render the scene for normals+depth, which doubles
  draw calls (174 → ≈350) against the 300 cap; the programs relief (40) does not help with that.
- **Rider**: sleeve fold rings on upper arms and forearms, back-protector hump, three alloy boot buckles,
  knee-brace hinge plates. **Bike**: clutch/brake levers, chain guide. (The full re-proportioned rider and
  the modern-trials bike rebuild remain open — see gaps.)
- **Suspension (critic 3)**: chassis sink ×2 (0.06 m per unit compression), pitch ×2 (0.1 rad), tyre
  squash 0.1, and a rebound overshoot after a landing with impulse > 1.5: `−amp·e^(−t/0.14)·cos(2π·4.5t)`,
  amp ≤ 6 cm, so the frame bottoms and springs back over ≈2 frames.
- **Air camera (critic 1)**: while airborne the followed point drops by half the height above the landing
  zone (ground sampled 0.6 s of x-velocity ahead) and `heightFrac` scales by `1.9 / (1.9 + 0.9·h)`
  (floor 0.45): the camera pulls back with apex height and keeps the ground line in the bottom third.
- **Crash camera (critic 6)**: the creep-in now starts at the crash tick (4 %/s) while the follow
  half-lives ramp 0.12 → 1.0 s, so the camera decelerates and closes during the 1 s before respawn.
- **Landing dust (critic 4)**: 16–64 particles 0.25 → 0.6–1.6 m, spread 1.8, per-surface colour; wood
  adds a fine pale "plank thud" burst; metal/grate keep sparks. Slip trail unchanged (`rearSlip > 1.2`).
- Not addressed this round: checkpoint lurch (critic 2 — keys already blend with half-life `blend/3`;
  needs a repro clip with the key list), ragdoll spawn pop (critic 5 — the posed rider and the physics
  ragdoll bodies have not been compared at the crash tick; a 2-frame blend is not implemented).

## 11b. Round 7 — the other four biomes, set pieces, SSAO, air camera

**SSAO (`post/chain.ts` `AOPass`, `high` only).** No second geometry pass: on `high` the composer's
scene targets carry a `DepthTexture` (attached/detached in `setQuality`; both composer buffers are
disposed so three re-allocates them). The pass reconstructs view position from depth, the normal
from the smaller-difference depth neighbours (no silhouette halos), takes 8 hemisphere taps
(radius 0.7 m, strength 1.6, 4×4 interleaved rotation from `gl_FragCoord` — deterministic), then a
depth-weighted 4×4 blur, all at half resolution; the composite multiplies it in before exposure.
Fades out beyond 40–90 m. Cost on flat-test: +2 calls, +2 programs (37), no change to tris. Measured
with/without (`scratchpad/render4/ao/diff.png`): contact under the tyres, the deck edge, container
seams and the crowd's feet darken; mean frame luminance −1.6/255 (subtle by design).

**Heat haze (composite).** `Biome.heatHaze / heatHazeV`: a two-frequency sine warp of the sample
uv growing toward the bottom of the frame, clocked from `tSim` (`PostChain.setTime`). Canyon 0.0022
from v 0.38, foundry 0.0032 from v 0.42.

**Canyon.** Sandstone formations are `mesaGeometry` terraced mounds (16 rings × 12 layers, cliff /
ledge rhythm per variant, per-column erosion noise, flat normals, banded vertex colour with base AO
and under-ledge shade) in three variants at z −13 (2.4–5 m), z −27 (7–15 m) and low foreground
outcrops; scrub is `scrubGeometry` (six lobes + twigs, olive→khaki, dark base); boulders sit in
hollows; `dust` ambient (0.25–0.8 m tan motes low over the ground); sky gets a few sun-lit cumulus
(`Biome.clouds`, painted into the equirect); the far mesa tier is 80 m tall / −18 m so sky shows
above it; the ride surface is `RUT_SECTION` dirt (ruts at z ±0.4 sunk 3 cm, pale crown) with a warm
ochre vertex tint and lighter, sparser rock edging (detail-1 icosahedra, 45 %); the terrain strip is a
warm derived dirt.

**Snow.** `conifer()` five-tier drooping cones with a snow load per tier (two batches, vertex-coloured,
memoised per seed); `snowBankGeometry` lumpy half-ellipsoids (white top → blue-grey base) on the far
side at z −3..−4.2 and small ones on the near side at z +3.6..+4.6 (the round-7a version put 2.6 m
banks on the camera side and hid the track); a **dirt ground profile in the snow biome renders as
the packed-snow trail** (physics surface untouched): two faint ruts, dark trodden edges past |z| 1.35,
a dark dirt lip under the snow edge and split-log kerbs (`logs()`, `pallet` material) both sides.

**nightCity.** Three facade textures (`facadeTexture`: office curtain wall / apartment with balconies /
brick, 4 bays × 4 floors, 30–40 % lit windows, some cool) on three building batches (repeat 2.5×4),
`rooftopGeometry` parapets + water tank + AC boxes + stair head on every block, ground-floor
`shopfrontTexture` boxes (awning, lit window, coloured sign; two shops per box), streetlights carry a
real additive **light cone** (`lightConeGeometry`, vertex alpha fading apex→ground) plus a wet-road
streak on the asphalt, and every neon sign gets a **mirrored, stretched reflection** on the road: the
sign's emissive texture flipped in v on a 9 m ground quad toward the camera, additive at 0.32, masked
along the streak by `reflectionMaskTexture` through `uv1` (`alphaMap.channel = 1`). The terrain strip
is `asphaltWet`; the ride surface adds 0.9 m concrete **kerb stones** with per-block tint.

**Foundry.** Its own shell: riveted steel plate over the brick, vent louvres, one narrow sooty
clerestory instead of the window banks (`warehouseWall(…, foundry)`), roof/side emissive 0.15–0.18,
light shafts at 0.03; no container rows (a sparse mid row only). Emissive kit every 9–14 m:
**pouring ladles** (tapered bucket, trunnions, block, cable to the crane rail) with a thick molten
stream into a floor mould, **furnaces on plinths** so the mouth glows at deck height with a pool in
front, **chimney stacks** and vertical pipe against the wall, more pipe runs; two molten channels
(2 m behind, 1.2 m foreground) in steel troughs. The melt is `moltenTexture` (crust + bright streaks)
as albedo and emissive, **scrolled from tSim** (`BiomeKit.scroll`: channels along x at 0.07/s, pours
along y at −0.9/s; `index.ts` sets `offset` per frame). **Spark fountains** (`BiomeKit.fountains`) at
every pour landing and furnace mouth: 6 sparks every 60 ms per fountain within 30 m of the camera,
45 % duty, seeded by tick. Grade: steep warm sun `0xffa860 × 2.2`, hemi `0x5a4038 / 0x7a2c10 × 1.6`
(the ground colour is the melt's up-light — there is no GI), fog `0x2a140c` 20/65/140, exposure 1.45,
contrast 1.18; terrain strip is steel plate, the ride surface adds grating strips at z ±0.95–1.45.
Still the weakest biome (see gaps).

**Set pieces (`world/gates.ts`, every track).** Start gate at `start.x − 1` (posts, beam, blue START
banner, three marshal lights) with a 30-person crowd; every checkpoint gets 7 spectators and a flag;
the finish gets 34 people, four flags and two confetti cannons. **Crowd** = one `crowdAtlas`
(8 painted figures × 2 poses, 64×256 cells) on instanced 0.62×1.9 m cards; the atlas cell rides in the
instance's z-scale (a plane has no depth), the shader (`cardMaterial`, one `onBeforeCompile` shared by
crowd and flags via `uMode`) switches to the arms-up pose and bobs each figure by 16 cm on
`sin(7t + phase)` while `uCheer = 1` (3.5 s after GO and through the finish; `runTime` from
`setRunInfo`), sways gently otherwise; flags are 2×2 team-flag cells waving with `uv.x`. Sponsor
barriers (rail, posts, a 0.8 m board strip with 4 boards per 8 m) front every crowd zone; interior
biomes put the crowd on a steel grandstand at deck height. Checkpoint plaques now read **CP n** with an
emissive number map that lights green (`Gates.plaques`) when `state.checkpoint ≥ i`. Pyro: 7 bursts
over 0.4 s, life 0.2–0.34 s, 9.5 m/s, spread 0.14 (thin 3–4 m columns) then one smoke wisp. Finish:
confetti + three firework shells (110 sparks each, gold / blue / pink) at +0.3 / 0.75 / 1.2 s with a
white pop. Cost on flat-test: +≈20 calls (crowd 1, flags 1, poles 1, barrier 2, stage 1, strips 1,
start gate 7, cannons 2), +1 program (the card shader), +2.3 MB textures.

**Air camera (coordinator, stranger b3 clips: only ceiling for 2.5 s of a 3.4 s flight).** (a) Hard
constraint: after smoothing, the bike centre's screen position is estimated from the aim offset
(roll is 0: world x → screen right by cos yaw, world y → screen up by cos pitch); more than 0.3 off
centre first **widens** (heightFrac ÷ up to 2.5) and anything outside [0.2, 0.8] moves the followed
point so it lands on the edge — so `camera().bikeScreenX/Y` stay inside the central 70 % box on every
frame. (b) The airborne aim point still sits halfway to the landing zone (ground sampled 0.6 s ahead)
so the ground line stays in the bottom third. (c) The +4° airborne pitch-up is gone; the pull-back
now ramps in 0.2 s (was 0.7), floors at 0.3 (was 0.45) and the y-follow / heightFrac smoothers run
2.5× faster in the air. Check: `scratchpad/render4/airrec.mts <recording> <dir>` replays a recording
frame by frame and reports `outFrames` (bike outside [0.15, 0.85]²), longest flight, max height and
the worst frame; full-throttle b3: 278 airborne frames, 0 out, worst offset 0.21.

**Budget cuts.** Deck support pallets/stacks no longer cast shadows, tyre stacks 6×14 tori (was 8×20),
canyon edge rocks detail 1 at 45 %, scrub lobes detail 0.

## 11c. Round 8 — art pack, glTF hero, camera bounds, brands, foreground rule

**Brands audit (P0).** `gates.ts` and `hall.ts` carried `FOX`, `REDLYNX`, `MAERSK` (real
companies) on the sponsor boards, flags and container logos. Gone: the renderer's only sponsor
strings are the art pack's fictional brands (`VORTEX OIL`, `KESTREL TYRES`, `NORDVIK`, `APEX
SUSPENSION`, `BOLT ENERGY`, `IRONWORKS TRIALS SERIES`) plus generic text (`TRIALS`, `START`,
`FINISH`, `CP n`, `BAY n`, shop names, `MOTO / GARAGE / 24H`). Container fallback owner codes are
`NORDVIK / HKR / OCTU / TARO / APEX / KESTREL` (the stencil set). Audit: `grep -rniE
"redlynx|fox|maersk|ubisoft|ktm|honda|yamaha|red ?bull|monster" src/render` → nothing.

**ArtLibrary (`art/library.ts`).** Loading starts in the `ThreeRenderer` constructor:
`art/manifest.json`, then every `world/` + `plates/` asset (44 files, 2.77 MB delivered; menu art
is the UI owner's) is fetched and decoded with `createImageBitmap({imageOrientation:'flipY'})`
in parallel (≈310 ms on the loaded headless host). `renderer.ready` now also requires
`art.settled` (loaded *or* failed — a missing file just keeps that item procedural) and any
requested glTF hero; `renderer.whenReady()` is the promise. **Determinism rule:** the world is
built from whatever is present at `setTrack`; if the pack settles later it is rebuilt **only if no
frame has been drawn with that world** (`World.builtAtFrame === frameCount`), so a capture is
all-art or all-procedural and never changes mid-run. The harness's `openGame` waits for
`__trials.ready`, which the hook sets at install time — before the renderer exists — so
`pnpm harness:capture` renders its first frame before the pack settles and stays procedural until
the game/hook awaits `renderer.whenReady()` in `loadTrack` (request to core-game, one line;
`page.evaluate` awaits a returned promise so the harness needs no change). The round-8 evidence
scripts await `whenReady()` themselves. Budget rule (coordinator): art textures count at their
**delivered compressed size** (`texture.userData.deliveredBytes`, honoured by `estimateTextureMB`);
GPU footprint is the RGBA estimate as before for everything else.

Where the pack lands (procedural fallback in brackets):

| asset | use |
|---|---|
| `plate-{canyon,snow,nightcity}` 2048×512 α | far layer at z −200, 720 m of world per repeat (city 560), horizon band (v ≈ 0.45) 8 m under the floor line so the riding camera's 11° down-pitch keeps it in the upper third; the −130/−340 silhouette tiers are gone, the near tier (z −45) stays for the mid-ground step [three silhouette tiers] |
| `sky-*` 2048×1024 | 2:1 panorama on a quad at z −330 (2 km per repeat) **and** `scene.background` (equirect clone) for exteriors [procedural gradient] |
| `plate-industrial` / `plate-foundry` | the hall's **end walls** (x0 + 2, x1 − 2) so the hall reads as continuing past its ends [window-bay wall repeat] |
| `stencil-*` (6 of 8; `apex`/`taro` were rejected by the art owner) | container owner markings, screen-blended white paint, one big + one small per skin variant |
| `mask-edge-grime`, `mask-rust-streaks`, `mask-grime-spatter`, `mask-rivet-drips` | tinted rust/grime layers on the 8 container skins by rust level (`tintMask`: luminance → alpha, colour fill) |
| `poster-*`, `sign-*`, `graffiti-*` | wall decals on the back wall between the window bays (posters 1.2×1.8 m low, signs 0.9 m at 4–5 m, graffiti 2.6 m at the floor), one `PropBatch` per texture |
| `banner-*` | barrier strip (4 boards per 8 m, centre 2:1 crop of the 3:2 banner) and the 2×2 flag atlas |
| `crowd-day` / `crowd-night` | the crowd card sheet: 8 photo figures, one pose (cheer = bob only), card 0.51×1.9 m; night sheet for nightCity + foundry [painted 8×2 atlas] |
| `tyremark-arc`, `tyremark-straight` | alpha-masked dark decals on flat deck stretches every 9–16 m (never inside a spawn keep-out) |

**Foreground occluder rule (user's b2 frame: a hall column + hook chain through the bike at a
spawn).** `foregroundKeepOut(track)`: nothing at z > +3 within [spawn − 10, spawn + 14] of the
start, any checkpoint or the finish; foreground chains one per 34–48 m (was 15–24) and their hook
tyres end at deck + 3.0–4.2 m (above the rider's head; was 0.8–1.8 = through him); **no
floor-to-roof columns in the foreground** at all; floor clutter every 14–22 m (was 9–16). The
exterior kits apply the same keep-out to the canyon outcrops/scrub/rocks, the snow banks and the
foreground pines (also thinned 22 → 12 %).

**Camera bounds (user's b3 frame: the apex pull-back put the camera above the roof).**
`CameraRig.bounds` per track: interiors `[floor + 1.5, roof − 1.0]` in y, `[wallZ + 1, frontZ − 1]`
in z, the hall span in x; exteriors a sky box (`floor + 60`). After every smoother the camera
**position is hard-clamped**; when the clamp binds the framing widens instead of moving through
geometry: the bike is re-projected from the clamped position, the FOV grows (≤ +12°) until it is
back inside the [0.2, 0.8] band, and if that is not enough the pitch tilts so the bike sits on the
band edge. `camera()` now reports `clamped`, `posZ`, `fovBoostDeg`. The hall's roof and floor are
planes, so the plane clamp *is* the geometry test; a sloped roof would need the segment test.
Evidence: scratch `camcheck.mts` over the b3 bot + stranger recordings (numbers in §12 table).
**Note (round 9):** the reframe step never ran until the depth-sign fix in §11d — the round-8
numbers only show the clamp, not the widen.

**Industrial key-art pass.** High-bay lamps carry the city kit's additive volumetric cone
(`lightConeGeometry`, now in `props.ts`) from the shade to the floor, a dark glossy puddle
(roughness 0.08, metalness 0.6, 80 % opaque — reflects the env/window bank) and a lamp streak
toward the camera under each; grade lift 0/0/0 (was 0.018), skylight fill cooler `0x8cb0e4 × 1.05`,
contrast 1.15, bloom 0.55.

**Foundry.** Shadow-culled: racks, scaffolds, stacks, pipes (all behind z −12) no longer cast;
deck support pallets are 3-layer stacks (÷3 instances). The two point lights now **follow the
camera**: each frame the two melt sources (pours / furnace mouths) nearest the camera target get
the lights (intensity 140, distance 34, flicker from tSim) — a pure function of state.

**glTF hero (`hero/gltf.ts`, `gltfBike.ts`, `gltfRider.ts`).** `GLTFLoader` + `MeshoptDecoder`
(three's module), one parsed document per file, cloned per instance (`SkeletonUtils.clone` for
the rider). Bike: the scene sits at x −0.65 inside the axle-midpoint `frame`; wheels at the
physics positions (`rotation.z = −spin`), `fork_lower` at the front axle, `swingarm` aimed at the
rear axle (rest angle from the pivot), `shock_body`/`shock_spring` quaternion from (0,−1,0) to
top→link with the coil `scale.y = len / 0.6027`, front sprocket at the 0.101/0.033 ratio, chain
`map.offset.x` in link units; frame placement + visual suspension + contact blobs are the shared
`FramePlacer` / `ContactBlob` (also used by the procedural bike). Rider: rest world quaternions
and rest directions (local +y) are read from the loaded bind pose; per frame each bone gets
`setFromUnitVectors(d0, d1) · q0` in hierarchy order (pelvis/spine/chest = torso dir, neck/head =
head dir, upper arm/forearm/thigh/shin = chain joint→joint, shoulder/hand rigid to their parent,
boots level), pelvis position = hips − 0.02·torsoDir. Clips are **additive** (bone-local delta from
each clip's first frame): `idle_breathe` blended in at rest (speed < 1.5, no lean, no crouch),
`land_absorb` ×0.45 over its length after a landing with impulse > 1.5, `extend` ×0.5 on the hop
`push` phase (`RenderFrame.hopPhase`). Ragdoll: the rig re-parents to the world; bones take their
physics body's direction (README body → bone map, limbs reversed), the pelvis bone follows the
pelvis body. Materials go through `lib.complete` (same standard program + the skinning variant).

**`setModels({riderModel, bikeModel})` (hot swap).** Builds the requested kit (loading the glTF
first if needed; `whenReady` waits), copies the calibrated frame origin and landing state
(`FramePlacer.copyFrom`), re-attaches the rider to the new frame and swaps the scene roots; the
next `render()` poses everything from the same physics state, so pose and wheel spin carry over.
Physics, camera and particles are untouched; the ghost is rebuilt with the same choice (ghost
tint works for both kits: library materials derive, glTF materials clone). Constructor options
`riderModel` / `bikeModel` (`?rider=gltf&bike=gltf`) call it at boot.

**One rider chain.** `riderModel.ts` no longer owns pose math: `solveChain()` adapts the pose
owner's `rider/pose.ts` (`riderChain`, canonical poses from `assets/blender/RIDER_CHAIN.md`,
physics lean→crouch coupling removed) into the render joint set, and both the procedural kit and
the glTF rig pose from it. The kit is built at the chain's proportions (`SEG`: torso 0.52, neck
0.22, upper arm 0.32, forearm 0.30, thigh 0.46, shin 0.43, shoulders ±0.21). The render adds
`crouchExtra` from the landing impulse (0.18 × impulse, half-sine over 0.5 s).


### Round 8 status table (measured 2026-09-14, host load average 20–34 — another owner's headless Chromium; timings are not comparable to round 6)

| track (biome) | calls | tris | programs* | texMB (art at delivered size) |
|---|---|---|---|---|
| flat-test (industrial, high, riding, proc) | 206–220 | 304 k | 41–42 | 45.9 |
| flat-test, glTF bike + rider | 149–163 | 297 k | 47 (session incl. proc) | — |
| e1 (canyon) | 157 | 476 k | 37 (see note) | 35.8 |
| m2 (snow) | 147 | 244 k | 37 (see note) | 31.5 |
| h1 (nightCity) | 155 | 208 k | 50 (see note) | 49.2 |
| h3 (foundry) | 231 | 591 k before the support-stack cut (not re-measured) | 53 (see note) | 69.6 |

Note: `info.programs` accumulates over a session; the e1/m2/h1/h3 figures were taken in ONE
session after other tracks (per-track ≈ 37–42). Hero: glTF bike 29 356 tris / rider 11 718
(proc 31 444 / 19 532). Art pack: 44 assets, 2.77 MB delivered, 310–710 ms to decode.
`prepare()` on flat-test (glTF requested): 4–16 s wall on SwiftShader; long tasks 52–65 ms (three
512² painter jobs) and one 4–11 s task = the GLSL compile of the standard program + post chain,
which software GL does synchronously (a real driver compiles in parallel; not splittable from JS).

Camera bounds evidence (b3 bot recording, 1706 frames, new physics): camera y max 5.59 vs roof
limit 8.29 (never bound in y), z clamp bound on 31 frames at the hall front (z 29), 561 airborne
frames, 0 outside [0.15, 0.85]², worst offset 0.284; max bike apex 3.17 m. Stranger recordings not
run (25 s wall per clip second on this host).

## 11d. Round 9 — boot cost, finish camera, culling, glTF wrist / hand-over, snow mid-tier

**Boot cost (user on 3G: title at ≈ 70 s).** Three causes, three fixes:

1. *The constructor fetched the whole pack (2.77 MB).* `ArtLibrary` now loads in tiers: `load()` =
   manifest + the **boot set** (`BOOT_IDS`: banners ×6, crowd-day, tyremark-arc, the six accepted
   stencils, edge-grime + spatter masks, plate-industrial — **0.99 MB**, what the title's industrial
   backdrop shows at the start gate); `request(ids, label)` fetches anything else on demand, queued
   behind the boot set. `setTrack` requests `idsFor(biome)` (industrial adds the 12 back-wall decals
   = 1.07 MB; canyon/snow/nightCity their plate + sky ≈ 0.05–0.09 MB; foundry/nightCity the night
   crowd) and reports it through the loader callback as `World art · <biome> (n MB) k/n (a / b MB)`.
   `whenReady()` waits for the boot set, the current track's request and the glTF hero, so frame 0 is
   art-complete once `hook.loadTrack` awaits it. The five rejected assets (`stencil-apex/taro`,
   `tyremark-straight`, `mask-rivet-drips/rust-streaks`) are never fetched. **All-or-nothing**: the
   world uses the pack only once the biome's whole set has settled (a partial set made two captures
   differ by which files had landed — found by the two-capture gate this round); an undrawn world is
   rebuilt on settle. Skies for industrial/foundry are unused and never loaded.
2. *The constructor built the hero, lighting (sky PMREM) and post chain, and the loader could not
   split them.* They are lazy (`ensureHero / ensureLighting / post` getters) and `prepare()` builds
   them as separate reported tasks. Painters run as `TexGenJob.step(budgetMs)` row bands (paint
   pass then Sobel pass), so the 512² jobs that were 50–65 ms tasks are ≤ 12 ms slices with
   identical output. The real front end renders the menu backdrop before `main.ts` calls
   `prepare()`; a play-mode `render()` before boot paints a placeholder instead of doing the
   synchronous build (that alone put the whole build into the first rAF and defeated the chunking).
3. *Tinted grime masks were recomputed per skin* (16 × 512² `getImageData`): memoised per
   (mask, colour, strength) — the art rebuild task 962 → 380 ms on the loaded host.

Real-boot timeline (`boot.mts`, play mode, b1 backdrop, SwiftShader, **load average 29–36**; the JS
numbers are the ones that transfer to a real GPU, the GPU ones do not):

| step | ms | bytes | note |
|---|---|---|---|
| art:start | 3 | — | fetch kicked off |
| hero:bike | 42 | — | procedural bike geometry |
| hero:rider | 33 | — | procedural rider geometry |
| lighting | 1 | — | sky + PMREM issued; SwiftShader compiles it at the next flush (a 6.0–6.7 s task landing in the materials phase) |
| post:create | 1 | — | |
| materials | 360 CPU (6.6–8.1 s wall incl. the PMREM flush) | 26.0 MB GPU | 11 jobs in 12 ms slices, ≈ 30 slices |
| art:settled | 0 | 2.06 MB (boot 0.99 + industrial decals 1.07) | both sets in by then on the LAN |
| shaders | 900–1200 | — | 93 materials, 2 per `compileAsync`; SwiftShader ≈ 20 ms/program |
| firstframe:world | 9 945 | — | SwiftShader pipeline JIT for every program (real driver: tens of ms) |
| firstframe:post | 711–796 | — | composer programs |

Long tasks over the whole boot: module evaluate ≈ 1.0 s and compose ≈ 0.9 s (three.js parse, WebGL
context — the loader's own rows), loadTrack 132 ms, the art rebuild 380 ms, and the three GPU
compiles; **no other task > 50 ms**. The 3G title cost is now core JS + 0.99 MB instead of + 2.77 MB.
Harness-path probe (`prepare.mts`, b1, load 16–17): constructor 151 ms (the WebGL context; 182 with
everything in it before), loadTrack 64 ms, prepare 8.8 s of which 2.6 s (PMREM flush) + 4.5 s
(first draw) are the SwiftShader compiles, long tasks = those two + one 274 ms (post first frame),
`whenReady` wait after prepare 0 ms, 38 programs.

**Culling (the real triangle bug).** `PropBatch.build()` returned one unculled `InstancedMesh` per
batch, so a 600 m course drew every support, drum and catwalk instance every frame, twice with the
shadow pass: b1 read **1 045 k** tris (346 k of it 1 920 support-pallet stacks — a 2.5 m remainder
under the deck was filled 18 pallets high). Now: one `InstancedMesh` per 40 m of x with a computed
bounding sphere and `frustumCulled = true` (three culls the shadow pass the same way); deck fills of
0.45–1.3 m are one plywood crate, 1.3–2.5 m a steel frame, pallets only for the last 0.45 m; drums
168 tris (was 280); hall floor clutter behind the deck (z < −4) in shadow-culled batches with the
low pallet. Per-track numbers in §0 (b1 1 045 k → 290 k; h3 743 k → 230 k). The static `trackTris`
(`debugInfo`) still counts the whole merged deck + supports (b1 136 k, h3 158 k): the ride surface
meshes are one merged mesh per material and are not chunked yet.

**Programs.** Fresh session per track: b1 38, e1 35, m2 31, h1 37, h3 39 — all ≤ 40. The round-8
50 / 53 readings were one session accumulating five tracks (`info.programs` never shrinks). One real
leak found: the pre-compile in `prepare()` ran `compileAsync` (and a plain warm-up draw) against
the **canvas**, whose sRGB output is a program parameter, so every material got a second variant
that the composer never uses (56–59 programs after a loader boot). Both now bind the composer's HDR
scene target (`PostChain.sceneTarget`, `renderSceneOnly`) → 38 after boot, same as the direct path.

**Determinism.** Two captures of `flat-test-clear` (90 frames, `high`): 0 differing frames, mp4 md5
identical (`render6/determinism.mts`). The first run of the gate caught the partial-art race above.

**glTF rider.** Arms are now a two-bone IK in the *rig's* bone lengths (bind-pose world distances:
0.32 + 0.30 = 0.62, same reach as the chain) from the rig's posed shoulder joint to the chain's grip
point, with the chain's elbow as the pole — `debug.wristErr` is 0.000 m in every pose of the hero
grid (round 8: ≤ 3.5 cm). **Ragdoll hand-over**: on the ragdoll's first frame the last posed
bone-local quaternions and the pelvis' world pose are snapshotted before the re-parent and slerped
out over 2 / 3 / 4 / 5 frames for a pelvis residual < 0.1 / 0.2 / 0.3 / more m (measured 0.36–0.44 m
on flat-test loop-outs → 5 frames; `debug.ragdollResidual / ragdollBlend`). `land_absorb` weight
scales with the landing impulse (0.35 at 1.5 → 0.9 at 4+), `extend` 0.5 → 0.7 on the hop push.

**Snow.** The near pine silhouette strip (flat `0x2c3a34` plane at z −40) is gone when the plate is
present; a sparse row of 1.25–1.9× conifers at z −27…−38 gives the mid-ground step and the
mountain plate reads between them (`render6/snow-m2b.png`).

**Camera-bound reframe (post-commit fix, trailer shoot on b3's 1.0 s kicker).** The round-8 reframe
that widens / tilts when the position clamp binds was dead code: it took `zv = −v·dir` (the negated
view depth) and gated on `zv > 0.5`, so `fovBoostDeg` stayed 0 and the bike left the top of the frame
(`bikeScreenY` −0.26 for ≈ 0.9 s at t 13.6–14.6 s, z clamp bound at 29). With the sign fixed the
order is as designed: FOV +≤ 12° first, then the pitch tilts so the bike sits on the 0.2 band edge.
Per-frame box check `[0.15, 0.85]²` on the trailer goldens (`render6/camcheck.mts`, 60 fps):
**b3-kicker-row 0 / 1733 frames out** (clamped on 390, boost reaches the 12° cap, min screen y
0.200), h2-gap-chain 0 / 2517, e2-rear-wheel-first 0 / 2264 (never clamped; unchanged).

**Evidence.** Finish: `render6/finish/b1-finish-6s.mp4` (+ `finish-sheet.jpg`). Hero:
`render6/hero-grid-r9.jpg` (top proc, bottom glTF: idle / riding / wheelie ; crouch / lean-fwd /
crash), `render6/hero-proc/hero-proc-4s.mp4`, `render6/hero-gltf/hero-gltf-4s.mp4`.

## 11e. Round 10 (mega build wave 1) — industrial to the bar, glTF hero default

### Biome recipe — "industrial to the bar" (`biomes/index.ts`, `world/hall.ts`, `world/deck.ts`, `index.ts`)

The written recipe; every other biome gets the same five parts in wave 2. Numbers are the
shipped industrial values; the *measure* column is how each part is checked, not eyeballed.

| part | rule | industrial numbers | measure |
|---|---|---|---|
| **1 · one key + real local pools** | One shadow-casting key from the **camera side** (the faces that face the camera — bike, rider, container fronts — are the lit ones; shadows fall behind). The biome's point sources are **real lights, not just emissive**: two `SpotLight`s (no shadow map) park on the two kit lamps nearest the camera target every frame (`Biome.lampLights`, `World.lampLights`, `BiomeKit.lamps`), a pure function of state. Fill is cool and low so the pools read; **lift 0**; bloom threshold 1.6 HDR so only bulbs / sun / sparks bloom, never a lit surface. | sun `0xffe2c4 × 3.0` from `(−0.4, 0.8, 0.42)` (was `z −0.3`: the bike was backlit and the light shafts already leaned the other way); hemi `0x8cb0e4 / 0x3a342e × 0.8` (was 1.05); env 0.4; lamps `0xffb257`, 340 cd, 26 m, half-angle 0.5 rad, penumbra 0.7, decay 2 — hung at **z −3.5** just behind the deck at deck + 5.4–6.4 m every 12 m (a sparser row at z −11 every 24 m); exposure 1.5, contrast 1.1, saturation 0.88, vignette 0.28 | lamp on/off diff (`render7/lamp-onoff.jpg`): mean frame luminance +1.3/255, pool on the deck and the container fronts; luminance histogram vs techniques 01/07 (below) |
| **2 · contact shadows under everything** | SSAO on `high` (unchanged) **plus a contact-shadow decal under every prop that stands on something** (`contactshadow` batch: black radial disc, `map` alpha, opacity 0.6, polygon offset) and the hero's per-tyre blobs. The under-deck AO skirt drops to 0.45 (it was a black void once real AO existed). | 1 batch, 0 programs (shares the lamp-streak MeshBasic+map program) | `propsInFrame().structure` counts them; visible in every two-up |
| **3 · 20–50 lit props in every riding frame, at deck level** | Density is placed **where the riding camera looks**: the reference frames are dense because the clutter is *at* the track, not on the floor 3 m below it. Three shelves (`dressDeckLevel`): (a) the **far support ledge** (z −1.7…−3.0, the container roof 0.4 m under the deck) — a cluster on 55 % of 2.5 m slots, tall things allowed, raised on a stored pallet stack to deck − 0.45 where the deck climbs; (b) the **near ledge** (z +1.7…+3.0) — only things ≤ 0.6 m (flat tyres, cones, plank bundles, lying drums, tool boxes) so nothing ever reaches the wheels, none inside a spawn keep-out; (c) **adjacent containers on the floor** at z −5.2 (mid tier, 1–2 high, 25 % end-on, clutter on the roofs, hooks and chains above) and z +5 (foreground singles outside keep-outs, 6–7 m in front of the riding camera, under the deck line). Prop kit: drums (standing / lying), pallets, tyre stacks / flat tyres, crates, plank bundles / loose plank ends, tool carts, gas bottles, cable reels, cones, racks; all instanced, AO-baked, seeded by the track seed. | b1 riding frame: **37 props** (+ 151 structure / decal / scatter instances) within 60 m; b3 riding **51**; idle 10–18 (the start gate's crowd and barriers fill the idle frame) | `renderer.propsInFrame(60)` (debug): instanced props with their origin inside the frustum, by batch, structure separated |
| **4 · ground decals and scatter, edge wear on every plank** | On the deck: oil stains (dark, roughness 0.22 — they catch the lamps), bolts and gravel along the plywood edges, the art pack's tyre marks. On every shelf and container roof: paper / cardboard sheets, gravel, bolts, plank ends. **Every board of a wood deck darkens at both ends** (per-end random 0.5–0.85, boards are now 4-segment boxes so the middle stays pale) and lifts 6 % on the worn line. | `oilstain`, `paper`, `gravel`, `bolt`, `plankend` batches; +24 tris per board | visible in the b3 two-up; tri budget below |
| **5 · three fog / depth tiers, each carrying detail** | Near = the ledges and the hero; mid = the adjacent container roofs and stacks at z −5…−16 with the lamps hanging in front of them; far = the back wall, whose **window bank now sits above eye level** (sill 6.4 m = deck + 3.4 m, emissive 0.55 — it used to start at 3.5 m at 0.95 and was the brightest thing in every riding frame). Fog `0x45494e` (cool grey; the pools stay the only warm thing) at **14 / 44 / 96 m**, so the wall ≈ 42 m from the riding camera sits at 50 % haze; floor fog unchanged. Lamp cones are a hint (alpha 0.018), not the solid triangles they were. | | luminance histogram vs 01/07 |
| **camera** | Riding pitch **15°** (was 11°), yaw 18° (was 15°), idle pitch 11°, and the fast / air pull-back **looks down 21°** (was 13°) so the wide frame shows the deck and the hall floor instead of a band of window wall. Reference riding frames sit 20–25° down. | | `render7/camcheck*.log` (60 fps, box [0.15, 0.85]²): b1 bot-3 **0 / 2045** out, e1 bot-3 **0 / 2180**, b3 bot-3 **0 / 1733** (clamped 13 frames at the hall front; round 9: 390) |

**Two-ups and histograms** (`render7/twoup-*.jpg`, `twoup.py`; luminance of the frame below the HUD band,
reference cell from the techniques sheet):

| frame | lum p1 / p50 / p99 | pixels < 0.08 | pixels > 0.9 | mean HSV sat |
|---|---|---|---|---|
| round 9 baseline, b1 riding | 0.024 / 0.306 / 0.876 | 8.0 % | 0.5 % | 0.41 |
| round 10 b1 riding (before the grade pass) | 0.000 / 0.203 / 0.788 | 17.4 % | 0.2 % | 0.49 |
| round 10 b1 riding (shipped, `final-b1-ride.png`) | 0.000 / 0.230 / 0.753 | 17.8 % | 0.1 % | 0.36 |
| round 10 b3 riding (shipped, `final-b3-ride.png`) | 0.001 / 0.256 / 0.827 | 21.4 % | 0.4 % | 0.34 |
| reference techniques 01 cell 5 | 0.015 / 0.284 / 0.876 | 2.4 % | 0.5 % | 0.28 |
| reference techniques 07 cell 9 | 0.011 / 0.223 / 0.849 | 1.7 % | 0.6 % | 0.22 |

Reading: the median is in band, the highlights are in band (nothing but the bulbs clips), the
**shadow floor is not** — 16–21 % of our pixels sit under 0.08 against the reference's 2 %; the
reference's blacks are a lifted grey haze. The remaining black is the under-deck support wall and the
hall floor in the bottom third; what would fix it is the floor fog lifting those (density 0.035 →
≈ 0.08 with a cooler colour) or a small lift (0.01) — left for the critic round, since the outside
review asked for lift 0. Saturation is still 1.5× the reference (the sodium pools + the deeper
container palette); a further 0.1 off the grade is the likely move after the blind verdict.

### Round 10 status table (one track per session, glTF hero + art, riding frame, `high`; host load 30–45)

| track (biome) | calls | tris | programs | texMB | props in frame (60 m) |
|---|---|---|---|---|---|
| b1-first-ride (industrial) | 177 | 304 k | 45 | 49.1 | 72 (idle 40) |
| b3-kicker-row (industrial) | 208 | 262 k | 47 | 49.5 | 74 |
| h3-fire-line (foundry) | 204 | 260 k | 45 | 50.8 | 56 |
| e1-uphill-weight (canyon) | 96 | 188 k | 39 | 49.5 | 9 |
| m2-drum-roll (snow) | 113 | 244 k | 35 | 39.8 | 31 |
| h1-wheelie-wire (nightCity) | 135 | 129 k | 41 | 62.2 | 17 |
| x1-vertical-limit (snow) | 97 | 364 k | 36 | 39.5 | 19 |

Calls ≤ 300, tris ≤ 500 k, textures ≤ 96 MB everywhere. **Programs 45–47 on the hall tracks and
41 on nightCity are over the 40 cap**: the glTF hero brings the skinning variant + its own material
set (+3–4 over the procedural kit, which measured 38 in round 9), the two follow spots add the
`NUM_SPOT_LIGHTS` variant, and the round-10 batches share the existing MeshBasic+map / standard
programs (the oil / shadow decals were moved from `alphaMap` to `map` for exactly that reason). Cut
list for wave 2: fold the hero's bodywork / engine / exhaust materials into one (−2), drop the
`lampstreak` MeshBasic variant by drawing streaks with the cone material (−1), and the ghost's two
derived variants when no ghost is set (−2). Hero clips in one flat-test session read 48 programs and
**texMB 48.8 → 70.1 on the second `loadTrack` of the same session** (accumulation across reloads —
the ghost's cloned material set or an un-disposed skin canvas; per-track numbers above are clean).

### Texture budget (`hero/gltf.ts shrinkTextures`, `hall.ts warehouseWall`)

The glTF hero shipped 2048² albedo + 1024² normal / ORM sets: **bike 32 MB, rider 16 MB** at RGBA8 +
mips (round 8 never measured `texMB` with the glTF on; b1 read **90.5 MB** against the 96 cap, and
foundry would have been ≈ 115). At load every hero albedo is capped at 1024² and normal / ORM at 512²
(canvas downsample, deterministic) → 16 MB; the wall bay texture goes 1024 → 512 px per 12 m bay
(43 px/m for a wall ≥ 30 m from any camera; 14.2 → 3.6 MB). b1 with the glTF hero + art: **49 MB**.

### Art-pack determinism bugs found by the tally (`art/library.ts`, `index.ts`)

`debugInfo().art.inWorld` was **false on every harness capture of the industrial hall** — the world
was procedural (no stencils, no wall decals) while the title backdrop had the pack. Two causes:
(1) `ArtLibrary.request()` for ids another request was already fetching returned at once instead of
waiting for them, so a second `setTrack` for the same biome resolved `whenReady()` before the decals
had landed; (2) a throwing loader progress callback could reject `request()` before `fetchOne` ran
(swallowed by the `.catch`). Both fixed (in-flight fetches are awaited, progress callbacks are
guarded and logged), and `whenReady()` now performs the undrawn-world rebuild itself. `debugInfo().art`
reports `builtAtFrame` / `frames` so the tally can prove it.

### Evidence (scratch `render7/`)

- Two-ups: `twoup-final-b1-vs-01.jpg`, `twoup-final-b3-vs-07.jpg` (ours | reference cell), `twoup-base-vs-01.jpg` (round 9 baseline); `lamp-onoff.jpg` (spots on / off); `r4-b1-both.jpg` (ride + idle).
- Hero clips, glTF, 60 fps 4 s: `hero/wheelie-4s.mp4` (the lean-back plan loops out at 1.6 s on the wave-1 physics — it is a second crash clip; `+strip.jpg`), `hero/crash-4s.mp4` (loop-out → ragdoll → `CRASH!` → hard cut at 3.2 s → riding), `hero/kicker-landing-4s.mp4` (b3 bot-3 from tick 249, first flight at tick 369). Wrist error ≤ 0.05 m over the three (0.000 posed, the 0.02–0.05 is the ragdoll frames), hand-over 2 frames, pelvis residual 0.32–0.38 m on the glTF rig (the rig's pelvis bone origin vs the physics body centre — a constant rig offset, to be measured against the posed→ragdoll bone motion rather than this number).
- Determinism: `det/` — flat-test-clear 90 frames × 2 captures, 0 differing, mp4 md5 `5ee39513…` both.
- Camera: `camcheck.log`, `camcheck-b3-p21.log`. Budgets: `budgets.log`, `shot2.mts` output above.

### glTF hero default (`index.ts`)

`riderModel` / `bikeModel` default to `'gltf'` when the option is absent; `?rider=proc&bike=proc`
forces the kit; a glTF that fails to load resolves null and the procedural kit stays (unchanged
fallback path). **Note for core-game:** `main.ts` always passes an explicit choice
(`loadModelChoice()` returns `'proc'` when nothing is stored), so the game still boots procedural
until that default flips to `'gltf'` — one-line change on their side. Ragdoll hand-over on the glTF
rig is a fixed **2-frame** slerp (3 above a 0.25 m pelvis residual; physics' crash chain is now a
port of `pose.ts`).

## 11f. Round 11 (mega build wave 2) — the world reads as a place, every biome

**Finding:** every course authors `camera: { mode: 'side' }` over almost its whole length and `side`
meant yaw 5° / pitch 4°, so the round-10 recipe's 15° riding pitch never reached a real track (b1
bot-3 measured **pitch 4°**, bike 13 % of frame height at 16.6 m/s, on the 0.20 edge of the gate
box); `side` is now the reference riding camera (yaw 16° / pitch 21°), the rig aims for an inner
[0.24, 0.76] band so the harness's [0.2, 0.8] gate passes with margin, and the five biomes carry the
industrial recipe (real lamp / fire pools, 40–140 lit props in the riding frame, contact shadows,
three tiers with content, a set piece per track, event gates) with programs at 39 (cap 40) and the
"texture accumulation" traced to the session's first world drawing skinless containers.

### Camera (`camera/rig.ts`)

- `MODE.side = { yaw 16°, pitch 21° }`, `side-tight = { 14°, 19°, zoomBias −0.5 }` (were 5°/4° and
  4°/2°); `high34` / `low` unchanged. State table: riding pitch 15° → **18°**, fast 21° → 22°,
  pull-back floor heightFrac 0.14 → **0.16**, moving-right screenX 0.30/0.28 → 0.34/0.36, lookahead
  capped at 8 % of the visible width (2.5 m was 12 % of a wide frame and pushed the bike itself onto
  the box edge). Measured b1 bot-3 t700 (16.6 m/s): before pitch 4°, hf 0.133, bx 0.20 → after pitch
  21°, hf 0.153, bx 0.29, by 0.53.
- **Camera box reconciled with the harness.** `harness/capture.ts CAMERA_BOX` = [0.2, 0.8] (strict
  `<`), the predecessor measured against [0.15, 0.85]. The round-10 clamp reframe tilted the bike onto
  the 0.2 edge *exactly* (`edge = atan(0.6·tan(fov/2))`), so float jitter put 37 b3 frames at 0.1999 →
  `camera.b3 FAIL`. The rig now slides / widens / tilts to `BAND_LO/HI = 0.24 / 0.76`. Harness clip on
  the b3 golden, 20 fps `low`: **PASS 0/593 out (riding 0), bike y 0.24..0.649, x 0.314..0.793**,
  clamped 207 (34.9 %; the camera sits higher now and the hall roof bound binds more — the FOV boost
  path keeps the bike in box; not a failure). **Recommended gate box: keep [0.2, 0.8] on
  `bikeScreenX/Y` while `phase === 'riding'`, settle-excluded, roll < 1e-6; do not gate on `clamped`.**
- The high camera made the hall's front crane rail (z +12, floor + 12.2) a black band across the
  upper third of every industrial frame: rail moved to z +2, bridge 26.5 m centred z −11, the
  foreground hanging lamps / hook-tyres at z 4.5–7 disabled (`FOREGROUND_HANGS`). Rule: with the
  riding camera ≈ 7.5 m above the bike and 18 m out, foreground (z > +3) elements above deck + 2 m
  occlude — keep the foreground low.

### Liveries — `setBikeClass(c)` (`bike/livery.ts`, `bike/bikeModel.ts`, `hero/gltfBike.ts`, CONTRACT §2.7)

Rookie = the round-6 blue hero, white plate **#7**; Pro = charcoal plastics, gunmetal spars, raw-alloy
cradle, yellow plate with a red **#1**. Procedural bike: four per-instance paint materials via
`MaterialLibrary.deriveHero()` (not fogified, maps back-filled only where missing, colour /
roughness never copied over — `derive()` would have wiped them when the textures generated). glTF
bike: `bodywork` / `frame` get their own atlas clones tinted by multiplication (the atlas blue lives
mostly on `frame`: body ×(0.7, 0.4, 0.06), frame ×(0.5, 0.36, 0.08) → dark), plus add-on plates (front
off the bars, one per side) sharing the atlas's double-sided program. `setBikeClass` is safe before
the hero exists (`ensureHero` / `applyModels` read `bikeClass`); the ghost keeps its grey derive.
Evidence: `render5/livery/livery-sheet.jpg` (b1 bot-3 t330, both kits × both classes),
`livery-gltf-idle.jpg`. Programs: +0 (probe: 45 → 45 across the call).

### Programs 45–48 → 39 with the glTF hero (`index.ts harmonizeUv1 / pruneStalePrograms`, `props.ts`, `livery.ts`)

The census (`render5/programs.mts`: material → `renderer.properties.get(m).programs`, cache-key diff
per pair) found the over-cap was **duplicate variants of the same materials**, not too many materials:
(1) three's key bit `instancingColor` — one library material shared by a coloured `PropBatch` and an
uncoloured one compiled twice (darkSteel, barrelRed) → every chunk now carries `instanceColor`
(white when unused); (2) key bit `vertexUv1s` (= a texture of the material uses uv channel 1, which
`lib.complete`'s `aoMap` does) split the big standard+vertexColour world variant in two → every world
geometry carries `uv1` as an alias of `uv` (same BufferAttribute, no memory); (3) three keeps every
program a material ever compiled with until the material is disposed, and `deck:ao`, the light shafts
and the lamp cones each held a dead program from boot / the art-landed rebuild → once per world, three
frames after it is built, `pruneStalePrograms()` drops each material's non-current programs;
(4) the plate material is double-sided so it shares the atlas variant. b1 47 → 42 → **39**, h3 39,
h1 39 (one track per session, glTF hero, three renders). Per-session accumulation across biomes is
still real (b1 → e1 → h3 → b1 read 61): the cap is defined per track.

### "Texture accumulation" (49 → 70 MB on a second `loadTrack`) — not a leak (`materials/library.ts`, `hall.ts`)

`texseq.mts` (one session, uuid-diffed tallies) showed the **first** industrial world of a session had
no container skins at all: the eight 1024×512 skins are painted onto `lib.derive('container')`
materials, and when `generateTextures()` ran afterwards its `copyMaps` replaced `map` with the
generic container map (skin 0 was painted onto the shared library material itself and then leaked
into every other biome). `copyMaps` now keeps an albedo the derived material set itself
(`mapAtDerive`), every skin derives. b1 reads **70.5 MB on every load** (was 49 skinless / 70 with);
b1 → e1 → h3 → b1 → m2 → h1: 70.5 / 52.5 / 72.2 / 70.5 / 40.2 / 60.0 — no growth, all under 96.

### Biomes (builders: interiors, exteriors, city; numbers from `ride.mts` on the bot-3 goldens, `high`, glTF hero)

| track (biome) | tick | props in frame before → after | calls / tris / programs / texMB after | lum p1 / p50 / p99 · <0.08 · sat · edge (after) | reference cell | two-up |
|---|---|---|---|---|---|---|
| b1 (industrial) | 700 | 72 → **139** (+139 structure) | 210 / 356 k / 45→39 / 49→70.5 | 0.076 / 0.203 / 0.532 · **2.0 %** · **0.279** · 0.042 (before 0.037 / 0.243 / 0.769 · 7.1 % · 0.270) | techniques 01 c5: 0.015 / 0.284 / 0.876 · 2.4 % · 0.279 · 0.013 | `render5/interiors/after/twoup-b1-vs-01.jpg` |
| b3 (industrial) | 900 | 82 → 62 (+215) | 256 / 276 k / 39 / 49.6 | 0.078 / 0.206 / 0.565 · **1.4 %** · 0.270 · 0.043 | techniques 07 c9: 0.011 / 0.223 / 0.849 · 1.7 % · 0.217 | `interiors/after/twoup-b3-vs-07.jpg` |
| h3 (foundry) | 700 | 87 → **94** (+145) | 234 / 288 k / 39 / 50.9 | 0.041 / **0.103** / 0.790 · 31.3 % · **0.731** · 0.047 (before p50 0.070 · 64.8 % · 0.955) | rising 12 c5: 0.013 / 0.106 / 0.780 · 27.1 % · 0.704 | `interiors/after/twoup-h3-vs-12c5.jpg` |
| e1 (canyon) | 600 | 23 → **90** (+62) | 187 / 275 k / 36 / 52.5 | 0.077 / 0.278 / 0.683 · 1.3 % · 0.527 · 0.039 | rising 03 c6: 0.011 / 0.305 / 0.763 · 2.6 % · 0.499 | `exteriors/final/twoup-e1-t600.jpg` |
| m2 (snow) | 600 | 24 → 46 (t1200: 95) | 157 / 275 k / 37 / 40.2 | 0.091 / 0.555 / 0.790 · 0.3 % · 0.354 · 0.048 (before p50 **0.842** · sat 0.133, 9 % blown) | rising 15 c1: 0.030 / 0.474 / 0.712 · 1.2 % · 0.389 | `exteriors/r4/twoup-m2-drum-roll-t600.jpg` |
| x1 (snow) | 1200 | 24 → 92 | 180 / 368 k / 36 / 39.8 | 0.086 / 0.598 / 0.957 · 0.6 % · 0.280 · 0.077 | rising 15 c1 | `exteriors/r4/twoup-x1-vertical-limit-t1200.jpg` |
| h1 (nightCity) | 1200 | 24 → 42 (t2700: 67) | 204 / 153 k / 40→39 / 62.2→60.0 | 0.049 / 0.119 / 0.969 · 15.3 % · 0.511 · 0.045 | rising 05 c6: 0.007 / 0.291 / 0.486 · 3.0 % · 0.640 | `city/twoup-h1-t1200-vs-05c6.jpg` |
| h2 (nightCity) | 1200 | 26 → 48 | 178 / 222 k / 39 / 59.6 | 0.049 / 0.250 · 10.3 % · 0.482 | rising 05 c6 | `city/twoup-h2-t1200-vs-05c6.jpg` |

What each biome got (details in the builders' blocks of `hall.ts`, `deck.ts`, `biomeKit.ts`, `gates.ts`,
`biomes/index.ts`, `props.ts` append): **industrial** — irregular mid-tier row (25 % gaps, 18 % end-on,
32 % yawed, 28 % two-high, ladders / planks / pallets leaning, tarps, a low sodium lamp hung *in front*
every third unit), I-section under-deck steel with bracing / gussets / base plates (1 call per track,
no shadow), floor fog 0.035 → 0.085 + a 0.0075 grade lift + lighter support palette (shadow floor
26 % → 2 %), lamps count 3, set pieces b1 jib gantry / b2 container arch / b3 crane hook with a drum
sling / m1 forklift lane, scaffold stand + banner tarp + gate lamp at start/finish. **foundry** — warm
fill (hemi 0x7a5648 / 0x9a4020 × 2.4, exposure 1.7), four camera-following melt lights
(`Biome.meltLights`), baked up-light (`PropBatch.tintNear`) over every batch near a source, slag pots on
the far ledge, set pieces h3 pouring ladle over the line / m3 rolling mill / x2 pipe rack + launder /
x3 furnace wall, red beacons at the gates, saturation pulled back to 0.70. **canyon** — sun from the
camera side, cool fill, peach fog 50/130/300, boulders / snags / split-rail fence / tyre walls /
spools / hay at deck level, strata silhouette tiers at z −95 / −150, terrain vertex colours, set
pieces water tower / windmill / pickup / mine portal, light towers (real spots) + braziers + bleachers
at the gates. **snow** — cold key, blue-white fog 13/36/72, exposure 0.8, seven-tier conifers with
snow loads (≈ 440 tris, instanced, far rows no shadow), cabins / lift station with glowing windows,
lanterns as real pools, braziers, log piles / sleds / pylons / chairs on a cable / ice curtain.
**nightCity** — shop row moved to z −12, street kit z −12…+8 (cars, box truck as the foreground
occluder, dumpsters, bollards, hydrants, scaffold hoardings, fire escapes, awnings, AC units,
traffic lights, bus shelter, food cart), four nearest street lamps as real spots over the deck
edge, fire barrels as melt lights, police lightbars / beacon flicker, lit 1024×256 skyline at z −85,
lighting truss + LED wall + par-can beams at start/finish, set pieces viaduct + train (h1) / tower
crane + site (h2); texMB 62.2 → 60.0.

### Renderer plumbing this round (`index.ts`, `biomes/index.ts`, `props.ts`)

`Biome.lampLights.count` and `Biome.meltLights { color, intensity, distance, count }` — N
camera-following spots / points on the N nearest `kit.lamps` / `kit.fountains` (`nearestK`, no
per-frame allocation). `PropBatch.build()` gives a vertex-coloured material on a geometry without a
`color` attribute a white one (the canyon edge rock rendered as black rings — GL's last generic
attribute value). `harmonizeUv1`, `pruneStalePrograms` as above.

### Evidence (scratch `render5/`)

`before/` (b1 t700 + two-up), `cam/` (camera-only b1 frames, `clip-b3.log` harness camera line),
`livery/`, `interiors/`, `exteriors/`, `city/` (per-builder before / after frames and two-ups),
`final/` (determinism pair `det-a` / `det-b` md5, b3 clip, `perf.log`), tooling `ride.mts` (played
frames from a recording at given ticks + stats), `programs.mts` (program census), `texseq.mts`
(session texture tally), `budget.mts`, `twoup.py`, `withlock.sh` (serial captures on the shared host).

## 11g. Round 12 — mobile budget (`low` draws to the canvas, the tier owns the resolution)

**Finding:** the phone's frame was fill-rate, not geometry — at 2000×920 CSS px / DPR 1.5 every tier
wrote the composite to a **3000×1380 canvas** (`low` rendered the scene at 0.75× and upscaled *into*
that), `medium`'s "480×270" bloom really ran at **1500×690** (`EffectComposer.setSize` hands
`UnrealBloomPass` the full frame and it halves it; `setQuality` calls `setSize` last, so the
`resolution` it was built with never applied), UnrealBloom's last step is a full-resolution HalfFloat
additive blend back over the scene, and the merged ride surfaces (`deck:rustSteel` 51 k, `deck:plywood`
45 k, `deck:ao` 28 k tris on b1) had no frustum culling. `low` on that phone wrote **5.2 Mpx / 27.6 MB**
of render targets per frame; it now writes **1.18 Mpx / 9 MB** (4.4× / 3.1× less), draws 100 calls /
106 k tris on b1 with 37 MB of textures, and renders through one pass.

Numbers are headless (Playwright + SwiftShader). **SwiftShader ms are not phone ms**: the budget is the
pixel / draw / triangle / texture counts and the CPU submit time (three's command encoding, which *is*
the same work on the phone's main thread); the GPU cost is inferred from pixels written. Host load
average 4–12 during the before runs, 10–20 during the after runs (another owner's headless Chromium).

### What each tier is now (`post/chain.ts tierPixelRatio`, `setQuality`, `world/props.ts tierHides / tierCasts`)

| | `low` (phone default) | `medium` (phone step-up) | `high` (desktop) |
|---|---|---|---|
| canvas pixel ratio | ≤ 1.0 **and ≤ 1600 px wide** (that phone: 0.8 → 1600×736) | ≤ 1.25 (2500×1150) | ≤ 2 |
| scene target | **the canvas** (RGBA8 + depth; no HDR target, no composer) | HalfFloat + depth | HalfFloat + depth texture |
| tone map + grade | three `CustomToneMapping` inside every material: the composite's ACES fit → contrast → lift / gain → saturation → vignette → flash → dither, per-biome values through `gradeUniforms` (deltas; a material without the hook gets plain ACES) — fog is folded in *before* the tone map (`tonemapping_fragment` override) so the mix stays linear like the HDR path | composite pass | composite pass |
| bloom | off | mips from **¼ frame** (625×288 on the phone); result sampled by the composite (`tBloom`) | mips from ½ frame; `tBloom` |
| SSAO | off | off | half-res, as before |
| shadow map | off | **1024²**, casters = hero + deck + deck-level volumes only (`tierCasts`: containers, drums, pallets, crates, tyres, vehicles, foundry pots) | 2048², every caster |
| smear / chroma / heat haze | off | on | on |
| volumetrics (lamp + street cones, par-can beams, lamp streaks, puddles, oil stains, hall light shafts `fx:shaft`) | **hidden** | on | on |
| deck scatter (gravel, bolts, paper, plank ends, leaves) | hidden | hidden | on |
| art decals (posters, signs, graffiti, tyre marks) | **not built** (world built on low) / hidden | on | on |
| textures | hero albedo 512², normal / ORM 256²; container skins 512×256; every canvas / art map halved (`shrinkTextures` on the world group) | as built | as built |
| prop chunk | 80 m | 40 m | 40 m |
| ambient motes / snow / embers | off | on | on |
| particle systems | drawn only while something is alive (`ParticleSystem.cull`) — all tiers | | |

**Deleted overdraw on the HDR tiers too:** `BloomPass` (a subclass) stops after the mip composite; the
composite shader adds `tBloom` inside `scene()` (also under the smear taps), so the maths is the
addon's — one full-frame HalfFloat read + write fewer on `medium` and `high` (on the phone geometry:
2500×1150×8 B ≈ 22 MB / frame on medium, 3000×1380×8 B ≈ 32 MB on high).

**Ride surfaces chunked** (`util/merge.ts chunkByX`, `deck.ts`): every merged deck material and the
under-deck AO skirt are split per 40 m of x by triangle centroid (re-indexed, all attributes kept), so
three's frustum cull applies. `trackCalls` / `trackTris` stay the whole-track figures (the contract
budget); the riding frame draws 2–3 chunks of each. b1 high went **348 k → 172 k tris** with no visual
change; the round-10 gap "deck:rustSteel is one unchunked 51 k-tri mesh" is closed.

**Determinism:** `render()` allocates nothing per frame now (`rig.bikeScreen(out)` replaced the
per-frame `debug()` object). Two low captures of the b1 bot-3 golden (frames every 100 ticks to 1500,
canvas PNG md5): all 15 hashes identical, `t700` md5 `3b1ae20c27fe325da0d1ace7fec39b52` both runs.

### Before → after, riding frame on the phone geometry (2000×920 CSS @ DPR 1.5; b1 t700, e1 t600, m2 t600, h1 t1200, h3 t700; glTF hero; one track per session)

RT = render-target pixels written per frame, all passes incl. the shadow map; MB counts colour + depth
bytes (HalfFloat 8 + depth 4 for the HDR target, 8 per bloom mip, 4 + 4 for the canvas, 8 for the
shadow map). Submit = CPU ms of `render()` without a sync (median of 20).

**low**

| track | calls | tris | programs | texMB | RT Mpx | RT MB | submit ms | canvas |
|---|---|---|---|---|---|---|---|---|
| b1 | 157 → **100** | 234 k → **106 k** | 21 → 15 | 70.5 → **37.0** | 5.17 → **1.18** | 27.6 → **9.0** | 1.19 → 0.52 | 3000×1380 → **1600×736** |
| e1 | 104 → **86** | 148 k → **94 k** | 18 → 17 | 52.5 → **31.0** | 5.17 → **1.18** | 27.6 → **9.0** | 0.47 → 0.38 | ″ |
| m2 | 135 → **105** | 189 k → **109 k** | 18 → 16 | 40.2 → **24.6** | 5.17 → **1.18** | 27.6 → **9.0** | 0.59 → 0.48 | ″ |
| h1 | 109 → **73** | 92 k → **70 k** | 22 → 19 | 60.0 → **38.4** | 5.17 → **1.18** | 27.6 → **9.0** | 0.58 → 0.41 | ″ |
| h3 | 235 → **162** | 197 k → **159 k** | 22 → 16 | 72.2 → **38.7** | 5.17 → **1.18** | 27.6 → **9.0** | 1.49 → 0.71 | ″ |

Targets: pixels ≤ 1.0 DPR-equivalent ✓ (0.8 on that phone), textures ≤ 40 MB ✓ on all five, calls ≤ 110
✓ except **h3 162** (foundry: 64 pallet stacks + 16 containers under the deck in one 80 m chunk plus the
melt kit; the census is in `render6/after/census-h3-low.txt`), tris ≤ 150 k ✓ except **h3 159 k**. The
h3 frame's remaining cost is the hero (≈ 45 k tris — the glTF rider is 11.7 k, each wheel 7 k) and the
support stacks (11.5 k); a low-LOD hero is the next cut, not more world culling.

**medium**

| track | calls | tris | programs | texMB | RT Mpx | RT MB | submit ms | canvas |
|---|---|---|---|---|---|---|---|---|
| b1 | 232 → **207** | 348 k → **164 k** | 37 → 36 | 70.5 | 21.44 → **7.64** | 163.6 → **58.3** | 1.40 → 1.31 | 3000×1380 → **2500×1150** |
| e1 | 181 → **150** | 253 k → **146 k** | 34 → 33 | 52.5 | ″ | ″ | 0.68 → 0.64 | ″ |
| m2 | 192 → **169** | 288 k → **151 k** | 34 → 33 | 40.2 | ″ | ″ | 0.80 → 0.72 | ″ |
| h1 | 172 → **134** | 141 k → **110 k** | 38 → 37 | 60.0 | ″ | ″ | 0.90 → 0.80 | ″ |
| h3 | 314 → **287** | 312 k → **209 k** | 38 → 37 | 72.2 | ″ | ″ | 2.08 → 1.60 | ″ |

(The RT figures are `debugInfo().rtMpx / rtMB`, which count the bloom blend as gone; the scratch probe's
own walker still adds UnrealBloom's blend pass and reads 10.51 / 80.2 — the table above is the real
frame. Medium textures are the built set; on a phone that stepped up from `low` the world keeps the
halved bitmaps until the next `setTrack`.)

**high** (desktop; unchanged by design except the chunked decks and the bloom blend)

| track | calls | tris | programs | texMB | RT Mpx | RT MB | submit ms |
|---|---|---|---|---|---|---|---|
| b1 | 234 → 231 | 348 k → **172 k** | 39 → 38 | 70.5 | 23.51 → **19.37** | 171.5 → **139.9** | 1.56 → 1.34 |
| e1 | 183 → 178 | 253 k → **172 k** | 36 → 35 | 52.5 | ″ | ″ | 0.75 → 0.67 |
| m2 | 194 → 194 | 288 k → **161 k** | 36 → 35 | 40.2 | ″ | ″ | 0.85 → 0.77 |
| h1 | 174 → 170 | 141 k → **117 k** | 40 → 39 | 60.0 | ″ | ″ | 0.88 → 0.82 |
| h3 | 316 → 321 | 312 k → **218 k** | 40 → 39 | 72.2 | ″ | ″ | 2.12 → 1.40 |

**Heap** (b1, 1280×720, 60 s of simulated play at 30 fps through `Game.renderOnce`, GC forced before
and after): low +1.52 MB, high +2.09 MB, physics-only +0.09 MB; **1800 direct `renderer.render()`
calls on a frozen state: +0.04 MB** — the renderer allocates nothing per frame; the 1.2–2 MB over a
minute is the game layer's `renderOnce` path (`lastRender` / loop bookkeeping) and under the 5 MB cap.

### What each cut costs visually (stills: `render6/after/still-{b1-first-ride,e1-uphill-weight}-{low,medium,high}.png`, sheets `tiers-*.jpg`)

- **Low, no HDR / bloom**: bulbs and the sun clip to white instead of blooming; lamps lose their halo.
  The grade (lift / gain / saturation / contrast / vignette) matches the composite's numbers; the
  frame reads brighter (b1 riding p50 **0.302 vs 0.224** on high, `<0.08` 5.1 % vs 3.1 %) because
  the shadow pass and the SSAO darkening are gone, not because of the tone map. `scene.background`
  (three's own material, no hook) gets plain ACES — visible only as a slightly more saturated sky on
  the exterior biomes.
- **Low, no volumetrics**: the hall loses its window shafts and lamp cones (the warm haze around each
  bulb); the city loses the street-lamp cones and wet-street reflections; the pools on the deck stay
  (they are real spots). This is the largest single look change and the largest overdraw saving.
- **Low, half textures**: container skins and the hero atlas soften at the riding zoom (≈ 180 px
  hero); the 1600 px canvas hides most of it. Posters / signs / graffiti are gone from the wall.
- **Low, 80 m chunks / no scatter**: none at the riding zoom; the near ledge keeps its props (b1 riding
  frame still counts 114 lit props within 60 m).
- **Medium**: bloom at ¼ frame is softer around the bulbs (the blur radius in screen space doubles);
  1024² shadows over 28 m are 2.7 cm texels — soft but not blocky (PCF radius 1.5); chains, rails,
  trusses and lamps no longer cast, which the phone frame does not miss.
- **High**: the bloom now enters through the composite — no visible change (same maths, sampled at the
  same mip); deck chunking is invisible.

### `?perf=1` fields (`renderer.debugInfo()`, round 12)

`dpr` (effective canvas pixel ratio), `devicePixelRatio` (what the host passed), `canvasW` / `canvasH`
(drawing-buffer px), `calls`, `tris` (last frame, all passes), `rtMpx`, `rtMB` (render-target pixels /
MB written per frame incl. the shadow map), `rtPasses` (the list, e.g. `shadow 1024×1024 | scene:hdr
2500×1150 | bloom:bright 625×288 | … | composite→canvas 2500×1150`), `shadowMap` (edge px, 0 when
off), plus the existing `tier`, `passes`, `trackCalls`, `trackTris`. A phone screenshot of the overlay
with `tier`, `dpr`, `canvasW×H`, `calls`, `tris`, `rtMpx` tells us the budget the frame ran.

### What still costs the most on a phone, and the next cut

1. **The hero at 45 k tris** (glTF rider 11.7 k, each wheel 7 k with spokes, frame 3 k) is 40 % of a low
   frame's triangles on b1 and the only skinned draw. A 12 k LOD from the art owner (or decimating the
   wheels' spokes to a card at the riding zoom) is the next triangle cut.
2. **h3 / the foundry** still draws 160 calls on low: 64 pallet stacks + containers as deck supports in
   one chunk and the melt kit. Merging `support-*` into the deck chunks would take it under 110.
3. **Medium's 2500×1150 HDR scene** is still 2.9 Mpx × 12 B; a 2023 phone can fill it at 30 fps but with
   little headroom under bloom + shadows. If the FPS meter says medium drops, cap medium at 1.0 DPR
   (`tierPixelRatio`) before touching anything else.
4. The probe can only step *up*; there is no step *down* from medium if a later track (h3) is heavier
   than the probe's first 60 frames — `app.ts` owner.
5. `texturesMB` on medium is still the 70 MB set on the hall tracks; the container skins (8 × 1024×512)
   are the bulk. A 512×256 skin set for medium too would put every phone tier under 40 MB.

### Evidence (scratch `render6/`)

`before/table.jsonl`, `before/census-b1-low.txt` (per-draw + texture census, old low), `after/table.jsonl`,
`after/table-medium2.jsonl`, `after/table-720.jsonl`, `after/census-{b1-low,b1-medium,h3-low}.txt`,
`after/phone-<track>-<tier>.png` (15 riding frames at the phone geometry), `after/still-*` + `tiers-*.jpg`
(1280×720 per-tier stills, b1 and e1), `after/twoup-b1-low-high.jpg`, `after/det-a`, `det-b` (hash lists +
t700 PNGs), tooling `budget12.mts` (the budget probe), `census.mts` (renderBufferDirect census), `det.mts`
(determinism pair), `withlock.sh` (serial captures).

## 11h. Round 13 (Rider on Glass H2 / H3 / H4 / G3) — the hero casts a shadow on every tier, moves from state, and draws its LOD on the phone

**Finding:** the low tier's hero was a texture-less mannequin for a reason that predates this round —
the glTF materials never got the biome grade uniforms (`fogify`), so the direct-to-canvas tier graded
the world with the biome's gain / lift and the hero with neutral deltas; on the canyon that blew the
suit and the plastics out to white (the r12 `still-e1-*-low.png` shows it). With the grade attached,
the art build's `-lod.glb` twins instantiated whole on `low` / `medium` (11.4 k hero triangles instead
of 41.4 k), a hero-only 512² shadow map on `low` (casters = bike + rider, receivers = the ride
surfaces, a 4 m light-space box centred on the bike), spokes that fade into the art build's blur card
with ω, the timed landing rebound and the timed absorb / extend clips replaced by the compression
spike and the rider body's relative velocity, and the class colourways switched through
`KHR_materials_variants`, b1 `low` at the phone geometry draws **107 → 112 calls / 82–86 k tris /
1.44 Mpx / 39 MB** (r12: 100 / 106 k / 1.18 Mpx / 37 MB — the +12 calls and +0.26 Mpx are the hero's
shadow pass, the −20 k tris the LOD), and two captures of the same recording are md5-identical.

Numbers are headless (Playwright + SwiftShader) on a host at load average **28–65** all round (four
other owners' headless Chromiums); CPU submit ms are not comparable to round 12's, only within-run
ratios and counts are.

### H2 — every hero motion and the state field that drives it

| visible motion | driven by | where | note |
|---|---|---|---|
| frame position / pitch | `bike.pos`, `bike.angle` (interpolated) | `FramePlacer.place` | air pitch is the body angle every frame — never held |
| fork travel | `wheels.front.pos` vs the frame (`fork_lower` slides to the physics axle) | `GltfBike.update` | the physics travel itself, 1 : 1 |
| shock / swingarm travel | `wheels.rear.pos` (swingarm aims at the axle; coil scales with the top-mount → link length) | `GltfBike.update` | 1 : 1 |
| visual sink + pitch exaggeration | `suspension.rear/front.compression` (3 cm per unit of summed compression, 0.05 rad × (rear − front)) | `FramePlacer.place` | ≤ ×1.3 of the physics travel |
| landing squash / recovery (bike) | the compression spike — the frame sinks with it and recovers as the springs rebound | `FramePlacer.place` | **round 13: the timed `exp · cos` rebound (0.5 s, 4.5 Hz) is gone** |
| landing squash (rider) | `land_absorb` pose (its frame 8 / 30) weighted by `Σ compression` above the ridden sag: `(Σc − 0.9) / 0.7`, max 0.9 | `GltfRider.update` | **round 13: was a 1 s half-sine timer from `justLanded`** |
| hop extension (rider) | `extend` pose (frame 8 / 20) weighted by the rider body's velocity relative to the chassis along its up axis, `(v − 0.25) / 1.2`, max 0.7 | `GltfRider.update`, `frame.riderBody.relUp` | **round 13: was a 0.63 s half-sine timer from `hopPhase`** |
| rider pose (lean / crouch / torso / arms) | `state.rider` — physics v2 derives it from `riderBody` (lean = body x through the pose table, crouch = height below the servo target, torsoPitch = the body angle's lag behind its target, armExtend = drawn hips → grip) | `solveChain` + `poseFromChain` | **round 13: the drawn rider is the simulated one — the 80 ms velocity lead only runs when `riderBody` is absent (v1 / mock)**; the lag you see is the body's lag |
| wheel spin | `wheels.*.spin` | `GltfBike.update` | |
| spoke blur | `wheels.*.spinVel`: spokes' opacity `1 − k`, blur card opacity `0.9 k`, `k = smoothstep(8, 32 rad/s)` (2.7 → 11 m/s) | `SpokeBlur.update` | the art build's `wheel_*_spokes` / `wheel_*_blur` children; files without them are split by radius band |
| chain scroll / front sprocket | `wheels.rear.spin` × (rear / front sprocket radius) | `GltfBike.update` | |
| contact blobs | `wheels.*.compression`, grounded, height above the profile | `ContactBlob.set` | |
| dirt kick | `rearSlip` (> 1.2 m/s, rear grounded) × tyre load (`0.5 + rear.compression`) — count and speed | `Emitters.update` | **round 13: × load added**; the 30 ms cadence is a rate limiter, not an animation |
| landing dust | `justLanded` × `landImpulse`, surface | `Emitters.landing` | one burst on the touchdown tick |
| exhaust puffs | `engine.throttleEff` (cadence and strength) | `Emitters.update` | |
| ragdoll | `state.ragdoll` bodies, 2-frame hand-over | `GltfRider.poseRagdoll` | |
| crowd cheer / sway | `phase`, `runTime`, `tSim` | `render()` | not the hero |

Deviations, listed: (1) `idle_breathe` has no state field — it is sampled at `tSim`, gated to
speed < 1.5 m/s with a neutral pose (deterministic, never wall-clock); (2) the procedural fallback kit
(`bike/bikeModel.ts Wheel`, `rider/riderModel.ts`) keeps its round-6 timers — it draws only when a glTF
fails to load; (3) on v1 / mock physics (no `riderBody`) the rider keeps the round-9 timed envelopes,
because there the pose fields are the servo target and carry no lag of their own.

**Landing, measured** (e2 bot-3 golden, the 1.1 m drop at t647, the clip `r13-landing-*`): touchdown at
clip frame 82, summed compression 0.07 → 1.01 in 9 ticks (75 ms), a second rise to the peak **1.53 at
+30 ticks (250 ms)** as the front follows the rear, recovering to 1.1 by +80 ticks; the rider's
absorb weight follows it (0 → 0.14 → 0.81 → 0.26). In wheel radii the frame sinks 0.03 × 1.53 = 4.6 cm
= 0.14 R on top of the physics travel. The reference (evolution-gameplay notes 11 / 14, clip 12 at
10 fps): rear tyre touches, the rider crouches over 2–3 frames (≈ 0.25 s), the front comes down and
the dust puff spawns ≈ 0.1 s after touchdown, the rider extends back over ≈ 0.4 s. Ours: rear then
front over 0.25 s to the peak, dust on the touchdown tick, recovery ≈ 0.4–0.6 s — the timing matches
the reference's two-stage settle; the depth in wheel radii was not measured on the reference frames
this round (the clip is 720p at ~12 % frame height), that is H5's blind pair.

### H3 — the hero casts a shadow on every tier

`low` keeps the renderer's shadow map on with a **512² map over a 4 × 4 m light-space box centred on
the bike** (`LightingRig.setQuality('low')` → `heroOnly`; `follow(bikeX, bikeY)` from `render()`; texel
0.8 cm, PCF radius 1, bias −0.0002 / normal 0.015). Casters on low = the hero only (`applyTierVisibility`:
every `props:` / `deck:` / `obstacles:` / `ribbon:` mesh stops casting; the small hero parts — chain,
sprockets, shock, pegs, spokes — too, `HERO_SMALL`); receivers on low = `deck:*` (not the AO skirt),
`obstacles:*`, `ribbon:*` only, so no other material samples the map (three re-keys programs on
`receiveShadow`, no needsUpdate pass). Cost on b1 low: **+1 pass of 0.26 Mpx (2 MB), +12 draws
(36 casters / 63 receivers of 592 meshes)**. `medium` / `high` unchanged (1024² / 2048² world maps).
Stills: `render7/r13/still-b1-{low,medium,high}.png`, hero crops side by side in
`sheet-b1-tiers-hero.png` (+ the Pro colourway on low) — the bike's shadow sits on the deck on all
three; on low it is the crispest of the three (0.8 cm texels).

### H4 — camera box per track per tier

The rig has no tier input (`camera/rig.ts` reads neither `tier` nor `quality`), so one tier's numbers
are every tier's; `low` was run on all 19 goldens and `high` on six as the control. Box 0.2..0.8,
riding frames only, first 0.5 s excluded (the ship-gate's `camera.box` definition). Worst = max over
riding frames of max(|sx − 0.5|, |sy − 0.5|); 0.3 is the box edge. 

| track | riding frames | out of box (riding) | clamped % | sx | sy | worst offset | high control (worst / out) |
|---|---|---|---|---|---|---|---|
| b1-first-ride | 1676 | **0** | 0 | 0.36..0.47 | 0.49..0.62 | 0.141 | — |
| b2-lean-back | 1500 | **0** | 0 | 0.35..0.47 | 0.49..0.60 | 0.149 | — |
| b3-kicker-row | 1427 | **0** | 14 | 0.34..0.47 | 0.24..0.59 | 0.257 | — |
| e1-uphill-weight | 1830 | **0** | 0 | 0.35..0.46 | 0.35..0.59 | 0.155 | — |
| e2-rear-wheel-first | 1888 | **0** | 0 | 0.35..0.47 | 0.46..0.59 | 0.152 | — |
| e3-stairway | 1662 | **0** | 0 | 0.36..0.47 | 0.49..0.58 | 0.144 | — |
| flat-test | 480 | **0** | 0 | 0.39..0.46 | 0.54..0.58 | 0.115 | — |
| gap-test | 239 | **0** | 0 | 0.39..0.46 | 0.49..0.57 | 0.115 | — |
| h1-wheelie-wire | 1968 | **0** | 0 | 0.35..0.47 | 0.47..0.61 | 0.15 | — |
| h2-gap-chain | 2255 | **0** | 0 | 0.35..0.47 | 0.50..0.61 | 0.154 | — |
| h3-fire-line | 2202 | **0** | 10 | 0.22..0.47 | 0.26..0.60 | 0.28 | — |
| lab-flat-200 | 722 | **0** | 0 | 0.39..0.46 | 0.54..0.59 | 0.115 | — |
| lab-physics-test | 462 | **0** | 0 | 0.38..0.46 | 0.47..0.61 | 0.119 | — |
| m1-hop-up | 2068 | **0** | 1 | 0.37..0.46 | 0.50..0.67 | 0.167 | — |
| m2-drum-roll | 2925 | **0** | 0 | 0.35..0.46 | 0.42..0.68 | 0.177 | — |
| m3-see-saw | 2702 | **0** | 7 | 0.24..0.46 | 0.38..0.65 | 0.259 | — |
| x1-vertical-limit | 3352 | **0** | 0 | 0.35..0.46 | 0.24..0.73 | 0.257 | — |
| x2-pipe-dream | 3098 | **0** | 9 | 0.30..0.46 | 0.24..0.66 | 0.26 | — |
| x3-gauntlet | 1916 | **0** | 5 | 0.26..0.47 | 0.31..0.59 | 0.239 | — |

Every measured row is green (riding frames out of the box = 0); the worst offset is 0.28 (h3-fire-line: the foundry's low camera key at sx 0.22 / sy 0.26, still inside 0.2..0.8); b3 clamps 14 % and h3 10 % of frames at the hall roof bound (reported, not gated).

### G3 — low tier budget, b1 riding frame (phone geometry 2000×920 @ DPR 1.5 → 1600×736 canvas)

| | r12 | r13 | target |
|---|---|---|---|
| draw calls | 100 | **112** (94 scene + 16 hero shadow + 2 blur cards) | ≤ 80 ✗ |
| triangles | 106 k | **86 k** (hero 11.4 k) | ≤ 70 k ✗ |
| hero triangles | 45 k (41.4 k glTF + plates) | **11.4 k** (`bike-lod` 5.8 k + `rider-lod` 5.5 k) | ≤ 12 k ✓ |
| RT Mpx / MB | 1.18 / 9.0 | **1.44 / 11.0** (512² shadow + canvas) | ≤ 1.0 ✗ (the canvas alone is 1.18 at DPR 0.8) |
| textures MB | 37.0 | **39.0** | ≤ 40 ✓ |
| programs | 15 | 20–21 | |
| submit ms (median of 20) | 0.52 @ load 10–20 | 1.32–1.48 @ load 28–57 | ≤ 2.5 (this host) ✓ but not comparable |

At 1280×720 / DPR 1 (the harness geometry) b1 low is 107 calls / 81.5 k tris / 1.18 Mpx. What is left
on low is the world: 75–80 of the calls are instanced prop batches drawn once per 80 m chunk (`:-1`
neighbours), 28 k of the tris the deck AO skirt — the next cut is the world owner's (merge chunk pairs
on low, drop the skirt on low). The RT target of 1.0 Mpx is not reachable at DPR 0.8 on that phone
without DPR 0.75 (1500×690 = 1.04 Mpx) — left for the device report to decide. A per-substep CPU
split of `render()` was not taken this round: the host sat at load 28–65 the whole time, so any
sub-millisecond split would be noise.

### H1 (consumed) — colourways and the LOD documents

`loadGltf` loads `models/<hero>.glb` and `models/<hero>-lod.glb` together (`lodUrl`, quiet on a missing
LOD → the authored file on every tier). `low` / `medium` instantiate the LOD document whole —
geometry and its own 512² atlases (a geometry-only swap under the full atlas mis-mapped every texel:
the LOD uv layout is re-baked). A tier change runs `applyModels`, which rebuilds the instance when its
`source` document differs (placer calibration and ground callback carried over, ghost rebuilt).
`setBikeClass` now selects the `KHR_materials_variants` material per mesh (`variantMaterialsFor`,
pre-resolved at load since the parser's getter is async): `bike_rookie` / `bike_pro` on frame,
bodywork, fork_upper; `rider_rookie` / `rider_pro` on the rider. The round-11 multiply tints and the
procedural plates group are gone from the glTF path (`livery.ts` still serves the procedural kit).

### Evidence (scratch `render7/r13/`, clips under `harness/out/capture/r13-*`)

Clips (60 fps, 1280×720, `pnpm harness:clip --recording … --from-tick … --to-tick … --quality <tier>`),
each at `low` and `high`: `r13-wheelie-<tier>/clip.mp4` (b3 bot-3 t520–720, the 0.63 s wheelie),
`r13-landing-<tier>` (e2 bot-3 t500–760, the 1.1 m drop), `r13-crash-<tier>` (b1 bot-3 t940–1160, the
loop-out at t1081), `r13-hop-<tier>` (lab-physics-test bot-3 t400–700, four gas-hops + the 0.38 m
landing). Every clip's camera line is PASS (riding 0 out of box). Determinism: `r13-det-a` / `r13-det-b`
(the landing clip captured twice) md5 `3d6cbeeaa6cf862b5a9f7c90f4a1aef2` both. Stills:
`still-b1-{low,medium,high}.png`, `still-b1-low-pro.png`, `sheet-b1-tiers-hero.png`, `phone-b1-*.png`
(2000×920 phone geometry), `land/strip-low.png` (landing frames 68–110). Tooling: `probe13.mts`
(budget + still + hero census), `camcheck13.mts` (H4), `events13.mts` (manoeuvre windows from the
headless sim), `clips13.sh`.

Note for the harness owner: every bot-3 golden crashes early in the current physics (b1 t1081, h1
t1114, e2 t827, b3 t917 in `events13.mts` and in the browser) — the goldens are stale against the
working-tree physics; the round's clips use windows before those ticks (the b1 one is the crash clip).

### Known gaps after round 13

- Low is 112 calls, not 80: the world's per-chunk prop batches. The hero is 15 scene + 16 shadow draws;
  merging the static bike parts by material (bodywork + frame + fork_upper; engine + exhaust +
  handlebar + pegs) would take 6 + 6 more.
- The blur card is the art build's card at 0.9 × k opacity; its streak texture has not been judged
  against the reference at 20 m/s yet (H5's job).
- The Pro rider's gold visor needs the PMREM env (`envMapIntensity 0.8` on every hero material) — it
  reads on high; on low the sky PMREM is the same, so it should too; not verified in a close-up.
- Garage close-up per class: not captured this round (the garage is the app's screen, not a harness
  state); the riding-distance Pro still is `still-b1-low-pro.png`.

## 11i. Round 14 — the phone's three live bugs (rider arms, track entry, replay white-out), the air camera, the low budget

**Finding:** all three bugs the user's iPhone showed were renderer state, not assets or physics: the
round-11 program prune handed three a destroyed GL program (bind-pose arms on `medium` / `low`), a
biome's shaders compiled at the countdown's first draw (black frames with the HUD running), and the
finish flash's clock ran backwards into the replay (`uFlash` 20–200 → a white frame with cyan specks).
Numbers are headless (Playwright + SwiftShader, host load average 17–48 — other owners' headless
Chromium the whole round); SwiftShader ms are not phone ms, the counts are.

### The rider's arms on `medium` / `low` — `pruneStalePrograms` (`index.ts`, `hero/lod.ts`, `hero/gltfRider.ts`)

The phone drew the rider with both arms as rigid tubes out to the side and, in one frame, the torso
facing backwards — the skinned mesh in its bind pose. `rider-lod.glb` was the suspect (round 13 put the
LOD document on the phone tiers); it is clean: byte-identical joint order, bind rotations, inverse bind
matrices, hierarchy and the 8 clips against `rider.glb`; decoded meshopt skin weights sum to 1 with the
same per-joint bounding boxes; the live deploy's file md5 matched the tree; and the hands-on-grips probe
(hand-bone world position against the chain's grip point in bike-frame coordinates, b1 bot-3 golden,
105 samples to t1050) puts the LOD and the full rider within **0.7 mm** of each other at `low` and
`medium`.

The cause was the loader. Round 11's `pruneStalePrograms` (three frames after each world build)
spliced `renderer.info.programs` and called `program.destroy()` on every program a scene material held
but was not currently drawing with. three r186 also keeps a private `programsMap` (cacheKey → program)
that the prune could not reach, so the destroyed wrapper stayed acquirable: the next material that hit
that cacheKey — an instanced prop batch, the spoke material, the LOD hero rebuilt on a tier change —
was handed a wrapper whose `program` was `undefined`; three bound no program, and every uniform and VAO
upload after it ran against corrupt state. On the app's real boot path (loader → `prepare()` → menu →
play; iPhone geometry; `trials.quality=medium`) Chromium logs 12 × `INVALID_OPERATION: no valid shader
program in use` / `uniformMatrix4fv: location is not from the associated program` starting exactly the
frame after the prune, and 0 with the prune stubbed. SwiftShader drops those draws; the phone's ANGLE
on Metal drew the skinned rider with stale attribute state. It never reproduced in the harness because
the harness never runs `prepare()`'s compile pass, so no material ever had a stale program to prune;
`high` on the phone was luck of which cacheKeys were re-acquired.

- The prune is gone. `debugInfo().stalePrograms` counts the same programs read-only (memory only;
  nothing releases a program mid-session any more).
- Hotfix rule: the rider draws the full `rider.glb` on every tier (`lodChoice(tier, 'rider')`,
  `riderLodEnabled` default off, `ThreeRenderer.setRiderLod(true)` to flip; the bike LOD has no skin
  and stays). The rider LOD returns to the phone tiers on the first device report after this deploy.
- Found by the gate: round 13's additive landing squash (`land_absorb` at weight ≤ 0.9 from the
  compression spike) and hop extension were blended *after* the arm IK and lifted both hands up to
  18 cm off the grips around a hard landing (b1 golden t720, full and LOD rider alike). `update()` now
  poses the chain, blends the clips onto torso / legs / head (`ARM_CHAIN` skipped), then re-solves
  both arms from the posed shoulders (`refreshWorldQ` → `solveArm`): landing frames are back to 0 cm.
- Still open (pose / physics owners): at the hop push (b1 t150–170, t900–920) the physics rider body
  rises until the grips are 5–12 cm beyond the rig's 62 cm arm reach — pure `wristErr`, identical on
  both documents. The gate criterion is therefore "0 cm whenever reachable; LOD within 1 mm of full".

### Track entry — the biome compiles behind the placeholder, not under the countdown (`index.ts beginEntry`)

Entering e2 from the menu, the HUD timer ran at 0:02 over a black world for seconds (24 fps / worst
64 ms on `low`): boot had prepared the industrial hall; a biome change at `setTrack` compiled the
canyon's programs and uploaded its textures at the first draw. Now `setTrack` builds the world and
starts `beginEntry()`: the world's textures (`renderer.initTexture`, ≤ 12 ms per task), then its
materials through the shared `compileMaterials` (two per task, `compileAsync` against the tier's scene
target — the canvas on `low`, the HDR target above), then one warm-up scene pass with frustum culling
off and a `finish()` (a driver that builds its pipelines at the first draw — SwiftShader, ANGLE's
per-state pipeline objects — does it here, for every mesh), cleared to the fog placeholder before the
task yields so it is never composited. A newer `setTrack` cancels the job by token. `whenReady()`
resolves after it; while it runs, `render()` in play mode paints the fog placeholder (the harness path
keeps its synchronous first frame). `debugInfo().entryMs` and `entry` (compile / texture / warm-up ms,
textures and MB uploaded, materials, programs before → after) are the loader's numbers; the core-game
owner holds the countdown on `whenReady()`.

Per-biome entry, `low`, 1280×720, one session entering each biome from the previous one (host load
24–42). "First draw" is the first `render()` after `whenReady()` — the frame the countdown would have
shown; "steady" the one after it.

| biome (track) | before: first draw | after: first draw | steady | entry job ms = compile + textures + warm-up | materials | programs | textures uploaded |
|---|---|---|---|---|---|---|---|
| industrial (b1, boot) | 6491 | 862 | 253 | 4423 = 462 + 0 + 3867 | 58 | 10 → 30 | 32 (13.8 MB) |
| canyon (e2) | 8267 | 237 | 145 | 6435 = 373 + 0 + 5952 | 54 | 28 → 38 | 43 (27.0 MB) |
| snow (m2) | 2828 | 228 | 100 | 1971 = 383 + 0 + 1463 | 52 | 31 → 37 | 39 (20.7 MB) |
| foundry (h3) | 5953 | 244 | 135 | 4469 = 744 + 0 + 3637 | 89 | 40 → 54 | 53 (33.2 MB) |
| nightCity (h1) | 8103 | 125 | 100 | 6155 = 538 + 0 + 5494 | 69 | 53 → 66 | 52 (34.5 MB) |
| industrial again (b2) | 1908 | 197 | 173 | 1832 = 501 + 0 + 1250 | 63 | 56 → 67 | 51 (31.7 MB) |

On this host the warm-up dominates because SwiftShader JIT-compiles every pipeline at its first draw;
on the phone the same cost is the Metal shader compile at link, which `compileMaterials` spreads over
≤ 16 ms tasks. The texture column is ≈ 0 ms because the world's bitmaps are already GPU-resident from
the procedural set; a fresh boot's upload (29 textures, 33 MB) measured 3.06 s in the boot entry.

### Replay white-out on `medium` — the finish flash's clock (`index.ts render`, `post/chain.ts`, `lighting/environment.ts`)

The composite ends with `mix(col, 1, uFlash)`; `uFlash = 1 − (tSim − flashT) / 0.2` with `flashT` set at
the finish event and cleared only by `setTrack`. Opening the replay of the run just finished restarts
`tSim` at 0 with `flashT` still at the finish time — for a 5 s run `uFlash = 21`, for a 40 s run 201:
the whole HDR frame mixes past white, and channels of the brightest emissives overshoot negative and
clamp to 0 — the user's "pure white with cyan / blue specks, HUD intact" (`render8/white-medium-before.png`:
mean luminance 1.000, 100 % of 288 samples white; `flash14.mts` runs the golden to t600, fires
`finish`, restarts, samples). `low` has the same `mix` inside every material's tone map but its sky
background bypasses it, so it never went *fully* white. Fixed at the source and guarded downstream:

- the flash follows the sim clock forward only (`since < 0 || since ≥ 0.2` ends it) and a `restart`
  event clears `flashT` (a restart is a time cut) — replay frame back to mean 0.244 (`medium`) /
  0.274 (`low`), the finish flash itself still 1.0 at the finish instant;
- every per-frame composite uniform is finite and in range before it reaches a shader
  (`setDynamics`: chroma, bike UV, smear, flash — a NaN bike UV from a bike behind a replay camera
  falls back to the centre);
- the composite's `scene()` drops a non-finite texel to black (`isnan` / `isinf` under GLSL ES 3.0)
  and caps the HDR sample at 64× white (already fully white after ACES — no visible frame changes);
  `uFlash` and `uGradeC.w` are clamped to [0, 1] in GLSL too.

The replay camera modes were not the cause: a 30 s app-path run through game → wide → fixed with two
seeks (`replay14.mts`, 343 frames sampled) never exceeded mean luminance 0.376 once the flash was fixed.

### Speed smear and aberration on `medium` (`post/chain.ts`, `index.ts`)

Every b3 frame above 12 m/s read as the whole frame doubled: the chromatic aberration reached 15 px at
the edge of the 2500 px medium canvas and the 5-tap smear (8 px) ran over the whole frame outside the
bike mask. Both halved (`uChroma` 0.006 → 0.003, smear 8 → 4 px max) and confined to the rim by a
radial falloff (smear from 0.3 to 0.7 of the half-diagonal, aberration from 0.35 to 0.7): the bike and
the near track are sharp at any speed; only the frame's rim streaks. `low` was never smeared.

### Air camera — ≤ 20 % pull-back, the bike climbs the box (`camera/rig.ts`)

On the b3 flights the rig pulled back until the bike was ≈ 4 % of the frame: the `above`-driven
height-fraction factor (to ×3.3 distance) stacked with the box clamp's "first widen" snap (k to 2.5)
and the air state's wide framing (0.26 → 0.19). Now: the air adds nothing to the wide state; the air
pull-back is capped at ×1.2 distance; airborne, the box clamp never widens but slides the aim after the
bike (it climbs to the top band and the camera follows it up); the landing zone enters by look-ahead
(doubled in the air, ≤ 16 % of the width) rather than by distance. Pitch and roll are untouched by the
air; the pitch tilt remains only as the last resort when the hall roof clamps the camera (b3 apex),
because a clamped camera cannot slide. H4 re-run below.

H4 after the change, `low`, 1280×720, every golden (19 tracks; b1–e3 at 1280×720, the rest at 640×360; host load 21–43): **0 riding frames out of the box** in total.

| track | frames | riding | riding out of box | clamped % | bike sx | bike sy | worst offset |
|---|---|---|---|---|---|---|---|
| b1-first-ride | 2494 | 2463 | 0 | 0 | 0.35..0.46 | 0.49..0.66 | 0.164 |
| b2-lean-back | 2316 | 1905 | 0 | 0 | 0.31..0.47 | 0.44..0.62 | 0.187 |
| b3-kicker-row | 2053 | 1723 | 0 | 12 | 0.30..0.47 | 0.34..0.60 | 0.205 |
| e1-uphill-weight | 2971 | 2848 | 0 | 0 | 0.28..0.47 | 0.22..0.72 | 0.285 |
| e2-rear-wheel-first | 2651 | 2620 | 0 | 0 | 0.33..0.46 | 0.40..0.64 | 0.172 |
| e3-stairway | 2509 | 2478 | 0 | 0 | 0.33..0.46 | 0.40..0.66 | 0.166 |
| flat-test | 514 | 483 | 0 | 0 | 0.38..0.46 | 0.53..0.58 | 0.119 |
| gap-test | 345 | 314 | 0 | 0 | 0.33..0.46 | 0.43..0.59 | 0.166 |
| h1-wheelie-wire | 2869 | 2838 | 0 | 0 | 0.33..0.46 | 0.37..0.67 | 0.174 |
| h2-gap-chain | 3012 | 2981 | 0 | 0 | 0.29..0.46 | 0.40..0.63 | 0.206 |
| h3-fire-line | 2530 | 2499 | 0 | 10 | 0.29..0.46 | 0.24..0.63 | 0.26 |
| lab-flat-200 | 757 | 726 | 0 | 0 | 0.38..0.46 | 0.53..0.59 | 0.119 |
| lab-physics-test | 493 | 462 | 0 | 0 | 0.35..0.46 | 0.47..0.61 | 0.146 |
| m1-hop-up | 2075 | 2044 | 0 | 0 | 0.34..0.46 | 0.46..0.67 | 0.169 |
| m2-drum-roll | 2957 | 2925 | 0 | 0 | 0.30..0.46 | 0.32..0.68 | 0.201 |
| m3-see-saw | 2734 | 2702 | 0 | 0 | 0.29..0.46 | 0.33..0.65 | 0.205 |
| x1-vertical-limit | 3383 | 3352 | 0 | 0 | 0.28..0.46 | 0.22..0.74 | 0.275 |
| x2-pipe-dream | 3130 | 3098 | 0 | 3 | 0.31..0.46 | 0.24..0.67 | 0.26 |
| x3-gauntlet | 2894 | 2863 | 0 | 6 | 0.30..0.46 | 0.22..0.64 | 0.276 |

### Low budget — every golden at the phone geometry (2000×920 @ DPR 1.5 → 1600×736), riding frame

New cut this round: the under-deck AO skirt is hidden on `low` (`tierHides deck:ao`; 28 k transparent
tris on b1). Not taken: merging the per-chunk prop batches (the remaining 75–80 calls are one instanced
draw per prop kind per 80 m chunk with its `:-1` neighbour; a per-chunk merge by material is the world
owner's next cut) and a medium-tier container skin set.

`low`, phone geometry 2000×920 @ DPR 1.5 (canvas 1600x736), glTF hero (full rider, bike LOD), riding frame; SwiftShader submit ms are this host's at the load shown. Calls 81–127, textures 26.3–41.4 MB.

| track | tick | calls | tris | hero tris | RT Mpx / MB | textures MB | programs | submit ms (med / p95) | speed m/s | load |
|---|---|---|---|---|---|---|---|---|---|---|
| b1-first-ride | 700 | 109 | 97.3 k | 17.5 k | 1.44 / 11 | 39 | 30 | 0.88 / 1.28 | 14.5 | 41.2 |
| b2-lean-back | 700 | 121 | 95.4 k | 17.5 k | 1.44 / 11 | 39.4 | 29 | 0.85 / 1.45 | 14.9 | 38.9 |
| b3-kicker-row | 700 | 106 | 115.4 k | 17.5 k | 1.44 / 11 | 39.4 | 30 | 0.56 / 0.99 | 17.5 | 35.3 |
| e1-uphill-weight | 600 | 109 | 94.1 k | 17.5 k | 1.44 / 11 | 33 | 25 | 0.74 / 1.34 | 13 | 32.3 |
| e2-rear-wheel-first | 700 | 84 | 100.9 k | 17.5 k | 1.44 / 11 | 33 | 26 | 0.65 / 1.22 | 13.4 | 28.7 |
| e3-stairway | 700 | 81 | 90.9 k | 17.5 k | 1.44 / 11 | 37 | 26 | 0.7 / 1.29 | 13.7 | 25.7 |
| m1-hop-up | 700 | 99 | 104.3 k | 17.5 k | 1.44 / 11 | 39.4 | 30 | 0.48 / 0.75 | 14.2 | 26.4 |
| m2-drum-roll | 600 | 113 | 100.4 k | 17.5 k | 1.44 / 11 | 26.6 | 25 | 0.53 / 0.95 | 14.3 | 24.7 |
| m3-see-saw | 700 | 100 | 96.1 k | 17.5 k | 1.44 / 11 | 36.7 | 30 | 0.62 / 1.01 | 13.2 | 21.6 |
| h1-wheelie-wire | 700 | 88 | 59.1 k | 17.5 k | 1.44 / 11 | 40.4 | 30 | 0.5 / 0.81 | 14 | 18.7 |
| h2-gap-chain | 700 | 94 | 66.3 k | 17.5 k | 1.44 / 11 | 40.1 | 30 | 0.62 / 0.78 | 14.6 | 16.3 |
| h3-fire-line | 700 | 125 | 120.5 k | 17.5 k | 1.44 / 11 | 40.7 | 30 | 0.66 / 1.05 | 14.1 | 14.4 |
| x1-vertical-limit | 700 | 98 | 101.7 k | 17.5 k | 1.44 / 11 | 26.3 | 25 | 0.65 / 1.23 | 8.7 | 13.5 |
| x2-pipe-dream | 700 | 104 | 104.0 k | 17.5 k | 1.44 / 11 | 40.7 | 30 | 0.63 / 1 | 15.2 | 13.8 |
| x3-gauntlet | 700 | 104 | 99.0 k | 17.5 k | 1.44 / 11 | 41.4 | 30 | 0.66 / 1.31 | 7.7 | 12.5 |
| flat-test | 700 | 127 | 122.6 k | 17.5 k | 1.44 / 11 | 38.7 | 30 | 0.53 / 0.82 | 18.4 | 11.4 |

### Determinism, checks

Determinism: captures of the b1 bot-3 golden on `low` (15 canvas PNGs, every 100 ticks to 1500; four runs on the final build, t700 `d2665d5bf840493d3b2e4d679343b3c4`) hash `dc63947be93236a9860565ca17752f00` / `dc63947be93236a9860565ca17752f00` (identical); e2 on `medium` `a924fcf844c91565cf5c28c5a1d8c2e2` / `a924fcf844c91565cf5c28c5a1d8c2e2` (identical; t700 `a6fcd8546b9813531a261f3d5d221fdf`). One low capture in the first pair differed before the chunk compile went synchronous (see `compileMaterials`); after it, 3 / 3 identical. The budget table has 16 of the 17 rows: the chain was killed before `gap-test`. `pnpm typecheck`, `pnpm lint`, `pnpm vitest run src/render` (16) green.

### Evidence (scratch `render8/`)

`app/medfix-03.png`, `app/lowfix-*.png` (b1 riding stills on the app path at the iPhone geometry after
the fix, hands on the grips), `still-b1-medium-before.png` (harness path, LOD rider — already correct
there, which is what pointed at the app-only path), `white-medium-before.png` / `white-{medium,low}-after.png`,
`still-b3-medium-speed.png` (medium at speed after the smear cut), `still-b3-low-air.png`,
`phone-e2-low.png`, `camcheck14-low.log`, `table14-low.jsonl`, `det/`. Tooling: `app14.mts` (app-path
probe with GL-error stacks, `--audit` lists the prune's victims, `--noprune`), `grip14.mts` (hands-on-
grips gate, `--riderlod`, `--switch-from`), `entry14.mts` (per-biome entry cost, `--before`),
`flash14.mts`, `replay14.mts`, `glbdiff.mjs` / `skindiff.mjs` / `layout.mjs` (rider vs rider-lod:
skeleton, decoded skin weights, buffer layout), `chain14.sh` (serial captures).

### Blind critic round 3 (six critics, r13 hero, harness r10; tally 2/6) — the tells, answered

1. *big-jump-landing (ref 0.90): "camera runs away from the action: an unmotivated, ever-widening pull-out
   to a top-down angle shrinks the bike to a dot, so the landing has no readable pitch, compression,
   rebound or dust — the camera never eases back in to sell the touchdown."* — The air camera above. By
   construction the bike now stays ≥ 0.26 / 1.2 = **21.7 % of frame height** through any flight (the
   roof-clamp FOV boost of +12° can take that to 15.6 % on b3's apex; the ≥ 8 % floor holds either way),
   the pitch never changes with the air, and the pull-back is a function of height above the landing
   ground, so it eases back continuously on the way down — the touchdown is framed at the riding
   distance. b3 riding frames now sit at sy 0.34–0.60 (was 0.24–0.59), worst offset 0.205 (was 0.257).
2. *world-canyon (ref 0.72): "one-frame checkpoint push-in with a scene-wide blur burst — the camera changes
   scale instantly instead of easing."* — Not closed this round. The instant scale change is a
   track-authored `CameraKey.cut` (the key snaps its weight) and the round-11 "first widen" snap of the
   box clamp on the ground; the blur burst is the composite smear over a frame whose scale just
   changed. Proposed: ease authored cuts over 0.25 s unless the key is a real cut (a respawn), and hold
   the smear at 0 for 0.3 s after any snap. Render owner, next round.
3. *fault-respawn: "after the cut the camera is still sliding into the checkpoint frame for over a second
   and the bike is not yet moving — the restart reads late."* — A respawn that keeps the run clock never
   registered as a cut (`frame.ts` cut = clock went backwards). A teleport now is one: more than 6 m
   between consecutive states snaps the rig, the pose lead and the interpolation. Not yet judged on a
   clip (the goldens fault late; the harness owner's respawn clip is the evidence to take).
4. *world-industrial (ref 0.75): "it casts no shadow… a sprite on a rail" at `high` on b1 dirt.* — Not
   investigated this round (the round went to the phone's three live bugs). Suspects in order: the
   2048² map over the whole caster set puts ≈ 14 mm per texel under the bike on b1, the dirt deck's
   normal-mapped roughness lifts the shadowed texel, and `shadow.bias` was tuned against the round-12
   hero-only map. Render owner: a `high` b1 still with the hero shadow measured (contact-shadow contrast
   under the rear wheel) before anything is retuned.
5. *three pairs: the rider is rigid — "no sway / lag / crouch", "rider never moves relative to the frame".*
   — Wired in round 13 (H2: lean = rider body x, crouch = height below the servo target, torso pitch =
   the body angle's lag) but its amplitude has not been measured in a clip. This round's grip probe saw
   `armStretch` move only 0.705–0.717 over the b1 golden. Pose / physics owners: the rider body's
   travel on the b1 golden (x, height, angle) against the reference's, then the pose table's gain.
6. *"no dust at the rear patch after touchdown."* — Emitters: the landing burst keys off `justLanded` /
   `landImpulse`; on `low` the ambient set is off and `countScale` is 0.5, and the burst is culled with
   the system when nothing is alive. Not touched this round; a landing clip at `low` and `high` with
   the particle census is the next check (render owner).

### Known gaps after round 14

- The rider LOD is off on the phone tiers until a device report confirms the prune fix (hero 17 k tris
  on `low` instead of 11.4 k).
- Hop-push reach: the rider body rises past the arm's 62 cm on the push (5–12 cm `wristErr`, b1
  t160 / t910) — pose / physics owners.
- Entry's warm-up + `finish()` is one task (the phone's per-pipeline builds for one frame); the
  loader covers it, but it is the one non-16 ms step left in a track change.
- The medium smear / aberration cut is judged on one still; H5's blind pairs should include a 12+ m/s
  medium frame.

## 12. Known gaps after round 11 (what still reads non-AAA)

### Blender branch round 6 — restored motion and knee diagnosis, 2026-09-15

Parent played high Street and low Race hops through an explicit context loss at
input 370. Both resume with coherent assets, lighting and motion, GL0 and 190
unique simulation frames. Restoration wall time is omitted from those fixed-rate
clips; they do not measure interruption length or actual iOS presentation.
Repeated-generation, real loading interruption and disposal-while-lost controls
now pass. Normal asynchronous program retirement retains its prior stress gates.

The connected Street trouser candidate has smoother knee folds through native
landing and seated animation, but still reads as smooth tubes around the waist
and legs. It is not promoted: 801 sampled gameplay poses self-intersect, and fresh
production/GLB/Blender checks trace extreme cases to the shared inward knee pole.
Round 7 must repair the shared body geometry and mass map before garment approval.
The existing helmet/material/detail and reference-comparison gaps remain.
See [Round 6 evidence](../evidence/blender-r6.json).

### Blender branch round 5 — played hero review, 2026-09-15

The compact Street hood now folds below the helmet and keeps a coherent back
silhouette through crouch, extension and landing. Connected shoulders/elbows
remain intact. Authored control cables add a small mechanical detail; the front
brake hose follows suspension travel without visible popping. Parent played
scratch full/LOD and final high Street / low Race clips before this checkpoint.
The Race clip includes an endo, ragdoll and return to attached riding after
checkpoint restart. These are incremental improvements, not a reference win.

The strongest remaining tells are smooth cloth with shallow folds, unresolved
jeans/crotch/knee construction and waistband silhouette, and simplified helmet,
glove/boot forms and material detail. The camera pulls away markedly during
riding. World/track complexity remains trunk scope; low M1 still reports 146,344
track triangles against 80,000. Actual iOS performance remains unmeasured.
The final 38-pair/reference battery has not been run for this branch.

All 340,983 corpus ticks repeat exactly with finite actual full/LOD models;
worst rendered COM mismatch is 0.115 micrometres and grip/sole errors stay below
0.256/0.189 micrometres. Decoded hose endpoints stay below 1.39 micrometres.
These numerical contracts support attachment; they do not establish art quality.
See [Round 5 evidence](../evidence/blender-r5.json) for hashes and played windows.

Normal pending-program retirement now passes Metal and SwiftShader stress with
complete reclamation. Whole-renderer context restoration remains faulty because
some surviving resources retain disposal listeners for the lost GL generation.
Both baseline and candidate reproduce this distinct failure. The headless
desktop WebKit control does not establish actual-iOS or pending-link race coverage.

### Blender branch round 3 — played hero review, 2026-09-15

The final-solver street hop and crash/restart clips were played at 60 fps, followed
by the Rising canyon start/launch at its native 60000/1001 cadence (source seconds
719–727). This is a parent review, not a blind-critic score. Rider contacts now
remain attached through the hop and restore on restart. The reference still
reads more convincingly as clothing: shoulder, cuff and waist folds retain
distinct planes while ours remains smooth and tubular at riding distance. The
hood/neck overlap and elbow folds remain visible construction limits. The
reference bike also has stronger seat/panel shapes and clearer material contrast;
our reflective mechanical pieces do not yet produce the same finish.

Connected torso/sleeve street v6 was played in native Blender through hang-back
and landing absorption. Its armholes stay continuous, but this prototype is not
yet in the public GLBs and does not close the art gate. Next: accept/reject the
final street/race topology in motion, export through the protected sources,
then judge garment folds and materials in the actual game. Evidence identity and
remaining physical/phone gaps: `docs/evidence/blender-r3.json`.

- **Industrial mids / highlights**: p50 0.20 vs 0.284, p99 0.53 vs 0.876 — with the high camera the
  window bank is out of frame and nothing pale is lit by the key; the far stacks (z −15 / −25) are a flat
  blue-grey wash. Wants pale lit surfaces at deck level and a far tier with structure. The b1 jib gantry
  beam sits at the top of the frame around x 110 (drop to floor + 9). Under-deck `deck:rustSteel` is one
  unchunked 51 k-tri mesh on b1 (same known gap as the ride surfaces).
- **Foundry**: uniform pink-red haze in the mid tier; the reference has deeper darks *between* saturated
  glows; slag pots are bake-only. `<0.08` 31 % vs 27 % reference.
- **Canyon**: mesas are still terraced "cakes" (banded now, regular rhythm); the far strata planes hide
  behind the mesa shoulders in most riding frames; the `dirt` albedo reads dark and stippled under a low
  sun (a ~1.4× brighter, lower-frequency dirt map would put the terrain median at the reference 0.305);
  the idle frame is dim (sun behind the crowd).
- **Snow**: cabins are plain dark boxes (one 512² plank map would fix it); string lights read as dots at
  riding distance; crowd sheet is the summer row (request to art: `crowd-winter`).
- **nightCity**: the lower 40 % of the riding frame (deck + wet asphalt) stays under 0.08 outside the lamp
  pools (10–26 % vs 3 %); facades still read as flat window grids; the viaduct / train hides behind the
  shop row at the 21° camera; screen-space blur at 20 m/s smears every neon edge.
- **Camera**: clamped 35 % of b3 frames (the hall roof bound with the higher camera) — in box, but the
  FOV boost widens those frames; a lower `maxY` bias for kicker tracks or an authored `low` key would
  hold the tight frame. The `fast` pull-back (hf 0.15–0.16) still shrinks the near kit to specks; the
  riding-state frames are where the density reads.
- ~~(round 12)~~ Under-deck `deck:rustSteel` unchunked / ride surfaces span the whole track — chunked per 40 m (`chunkByX`).
- **Programs**: 39 per track with the glTF hero; a session that visits several biomes accumulates (61
  after four loads across three biomes) because each biome's one-off materials add live variants. The
  post chain is 12–13 of the 39 (UnrealBloom's five blur kernels): a two-program bloom is the next cut
  if the cap tightens.
- **Liveries**: the glTF Pro tint is a multiply on the atlas (dark charcoal-navy, not a repaint); a
  second atlas from the art owner would give a true colourway. Plates are add-on quads on the glTF.
- `twoup.py` assumes 4×4 sheets; the rising-visuals sheets are 4×2 (builders used tiled copies).

### Carried from round 10


- ~~(round 11)~~ **Industrial, honest read of the final two-up:** the mid-tier container row still reads as a flat wall (uniform height, front faces evenly lit — needs gaps, turned units, things leaning on them and the lamps hanging *in front* of them); the under-deck steel frames read as thin sticks; the shadow floor is 17–21 % of pixels under 0.08 against the reference 2 % (floor fog lift or a 0.01 grade lift); saturation 1.3× the reference; the reference camera sits 20–25° down against our 15°. Wave-2 targets before propagating the recipe.
- ~~(round 11)~~ **Programs 45–47 with the glTF hero** (cap 40) — cut list in §11e.
- ~~(round 11)~~ **Session texture accumulation**: texMB 48.8 → 70.1 on a second `loadTrack` of the same session (hero-clip run); per-track numbers are clean.
- **core-game**: `loadModelChoice()` still returns `proc` when nothing is stored, so the shipped game boots procedural until that default flips; `hook.loadTrack` still does not await `renderer.whenReady()` (`whenReady` now rebuilds an undrawn world itself, so scripts that await it are safe).
- The wheelie evidence plan needs retuning for the wave-1 physics (throttle 1 + lean −1 loops out in 0.5 s).


- **3G first run**: the title now waits for 0.99 MB of art, but an industrial run's `whenReady`
  still waits for the 12 back-wall decals (1.07 MB, six 768² graffiti = 0.79 MB of it). Request to
  the art owner: graffiti / posters re-encoded ≤ 40 KB each (lossy webp with alpha), or a 512²
  variant for the pack — the render side needs no change.
- **Loader `report` order**: `main.ts` calls `prepare((done, total, label) => …)`; the renderer now
  reports in that order (round 8 reported `(name, done, total)` — the loader showed the name as the
  count).
- `setTrack` is still one synchronous task (contract): 132 ms procedural, 380 ms with the art
  (container skins: 8 × 1024×512 canvases + decal batches) on the loaded host. Splitting it needs an
  async `setTrack` or a pre-baked skin sheet from the art owner.
- The merged ride-surface meshes span the whole track (`deck:plywood` 45 k, `deck:dirt` 24 k on
  b1) — chunk them per 40 m like the props to bring `trackTris` per frame under the 80 k contract
  figure on long courses.
- SwiftShader's first-draw pipeline JIT (6–10 s tasks) cannot be split from JS; a real driver
  compiles in parallel under `compileAsync`. The loader rows show it as `First frame · …`.
- `low` = 41–44 % of `high` at load 17; a quiet-machine measurement (load < 8) has not been possible
  this round (load average 17–36 all day).
- ~~(round 11)~~ Foundry / nightCity / canyon looks unchanged from round 8 (§12 items below still stand).

- glTF rider: `idle_breathe`/`land_absorb`/`extend` are additive deltas tuned by eye, not against the
  reference clips. The glTF bike's chain scroll direction is unverified. GLTFLoader sanitises bone
  names (`shoulder.L` -> `shoulderL`): `boneName()` normalises. Harness captures still render before
  the pack settles until `hook.loadTrack` awaits `renderer.whenReady()` (core-game; the renderer side
  is done).
- nightCity reflections are still the sign/lamp streak decals only; canyon far tier is the plate.
- Perf numbers this round were taken at load 20–34; only within-run ratios are trustworthy.


- ~~(round 11)~~ **Foundry** is still dark-and-dim rather than the reference's warm, readable red-orange hall: the
  emissive sources light nothing (no GI, two point lights per track), so the rust structure only shows
  where the sun's steep key lands. It needs baked up-light in the vertex colours near every melt
  source and/or a third/fourth point light attached to the two nearest sources as the camera moves.
- **Crowd** figures are painted cards (flat colour, no shading); they read at riding distance but look
  like paper at the start close-up. The art owner's imposter sheets (`public/art/`) should replace the
  atlas — the card shader already takes any 16-cell strip.
- **Art manifest not wired** (coordinator request, out of budget this round): `public/art/manifest.json`
  (stencils, grime masks, posters, graffiti, banners/flags, tyre decals, crowd sheets, far backdrop +
  sky plates) should load through one async `ArtLibrary` awaited before the first `render()` so the
  first textured frame stays identical across captures, with the procedural versions as fallbacks;
  targets: container skins, wall bays, barrier strips, flag atlas, crowd atlas, the far silhouette
  tier and `scene.background`.
- **Industrial key art** (`scratchpad/imgtest/keyart-test.png`): not matched this round — wants
  sodium lamps as the key (warm volumetric cones like the nightCity ones, dust in the shafts), cooler
  skylight fill, wet floor patches, deeper blacks (lift 0). The lamp cones exist in the city kit and can
  be reused on the hall's high-bay lamps.
- nightCity reflections are the sign/lamp streak decals only (no reflection of the buildings' windows).
- Snow conifers are still cone stacks; canyon far tiers are silhouettes without strata.
- Perf numbers this round were taken on a machine at load 20–25 (another owner's headless Chromium
  at 13 cores) and are 1.8–2× the round-6 values on every tier; the within-run `low/high` ratio (48 %)
  is the only trustworthy figure. Heap growth read 6.3 MB / 60 s under the same load (round 6: −1.8).
- ~~(round 11)~~ h3-fire-line (foundry) sits at ≈640 k tris with the shadow pass (500 k cap): the hall kit's pallets /
  drums / tyres dominate; the fix is lower-poly deck supports and a shadow cull on props behind z −12.

- ~~No SSAO~~ (round 7: depth-only AO on `high`).
- The roof structure only enters the frame in the idle 3/4 view and on wide pull-backs; the riding
  frame tops out at the window heads (pitch 11°). The reference gets trusses in frame because its tracks
  hang higher in the hall; a track-authored `high34`/`low` key does the same here.
- Light shafts are additive quads (no occlusion by the bike or containers); dust motes are unlit points.
- Rider (round 6): still a segment kit — joints are overlapping spheres, not skinned; fingers are four
  tori, no cloth wrinkles beyond a fold ring, no helmet decals; the forearm/fist reads chunky at 40 %.
- Bike (round 6): the rear plastics (side panel + seat base + mudguard) still read as one blue slab;
  no decals/sponsor graphics on the tank and plates; tyre knobs are boxes (no sipes); the edge wear is
  a wrap-around noise, not curvature-driven; no per-run mud accumulation.
- Hero draw calls: ≈47 meshes per pass (bike 30 incl. 2 contact blobs + 2 spoke meshes, rider 16) against
  the 40 target; the remaining cuts are the wheel disc/bolt/hub materials (−4) and a vertex-coloured
  dark-metal material for the bike's black parts (−4).
- Physics chain mismatch (request to physics): express the drawn chain in the render's axle-origin
  frame (`bike.pos` → axle midpoint offset (0.055, −0.144)), adopt the pinned-shoulder hang-off and the
  0.28 m / 0.35 rad crouch, and add the reach slide; then the hand-over residual drops to the 80 ms lead.
- ~~Canyon strata boxes / nightCity boxes / foundry red wash~~ (round 7, see §11b; foundry still weak).
- Synced render time on SwiftShader `high` is ≈134 ms p50 (2048² shadow + bloom + HalfFloat 1280×720);
  under the 250 ms SwiftShader gate but the perf harness should still pin `low` for timing runs.
- `renderer.ready` is true once textures exist and one frame was drawn; textures generate on the very
  first `render()` (≈330–400 ms in headless Chromium) so no capture frame is untextured.
- Kinetic text (READY/GO/CRASH) is the HUD owner's; the renderer only supplies the flash.

## 13. Verification recipe

```
pnpm typecheck && pnpm build
pnpm harness:capture harness/inputs/flat-test-clear.json --keep-frames   # clip + sheet
pnpm harness:perf                                                        # calls / tris / textures / heap
# determinism: capture twice, `md5 clip.mp4` and `cmp` frames must match
```
Scratch scripts (snap / probe / timing / ghost / biome grid / camera curve) live in the render
owner's scratchpad (`scratchpad/render2/*.mts`), not in the repo.

## 14. Blender branch round 1 — the rig drifted and the V2 animation path was never active

2026-09-15, baseline `56e3883`, branch `blender-work`. Full audit and next work:
`project/archive/BLENDER_HERO.md`. This is an integration repair, not a hero-art completion.

**Correction to round 13's H2 claims:** V2's getter did not publish `riderBody`,
although the type and render consumer existed. Real V2 play therefore took the
legacy spring/timed-clip path. The getter now copies the existing rider SoA
values; no physics solver, tuning, snapshot layout or hash algorithm changed.

The real compressed rider exposed errors that the procedural chain tests missed:
tiny shoulder translation samples accumulated to 27.4 cm over a minute; landing
layers moved ankle anchors 13.9 cm off their targets. Fixed joint translations
now reset from the bind rig and only pelvis translation is layered. Rotations
are normalized. Full-pose landing and extension clips now use `stand_attack` as
their common additive reference, rather than subtracting their crouch/extension
opening poses. Both arms and legs solve with actual exported segment lengths;
unreachable extra motion is attenuated toward the base pose. `ankleErr` and
`additiveWeight` expose the result instead of hard-coding successful contacts.

Independent review also reproduced false extension during rigid chassis
rotation: local X -0.28 m at -6 rad/s yielded 1.68 m/s of apparent upward motion.
`FrameBuilder` now subtracts angular point velocity; finite-difference trajectory
tests verify zero extension for rigid motion and retain real relative movement.

Validation: **40 test files, 596 passed, 11 todo**, with typecheck/lint/build
passing. New tests load both committed GLBs through MeshoptDecoder and check
bone matrices across 30/60/120 fps histories, 60-second idle, repeated timestamps,
ragdoll/reset, actual wrist/ankle origins, bind-derived segment lengths, scales
and transient-reference semantics. An independent reviewer scanned 23,100 pose
combinations without contact errors over 0.1 mm.

An independent browser comparison of the actual compiled **Game** checked
**23,017 V2 input ticks** across b1/b3/e2/m1 Rookie, b3 Pro and two crash/restart
patterns. Every solver snapshot byte, Game counter, clock byte, phase and fault
count matched baseline. The published state differs only by `riderBody`;
canonical hashes intentionally change because the hasher already includes that
optional field. Old hash pins require an explicit schema-aware migration, not
blind regeneration. Run-clock finish values remain byte-identical. B3's physics
finish field and Game run clock differ by one ULP in **both** versions because
one multiplies by 1/120 and the other divides by 120; compare like fields.

The inherited evidence harness also has proven clock/history, fault-counter,
solver-selection, fallback and frame-padding defects; a passing old gate is not
used as proof of this repair. The ignored `harness/out/blender` probes serve
frozen content-hashed builds, verify consumed model bytes and actual glTF
instances, preserve the rendered lead-in and explicitly sample alpha=1 at
30 fps. They record state time, displayed time and actual rig anchors. These
are controlled renderer checks, not proof of production interpolation, glove/
boot surface contact, blind AAA preference, or iOS device performance.

The played landing comparison still shows the rounded helmet/brace, simplified
garments and limited physical pose read. Art, mechanical attachment defects,
physical-to-visual pose mapping, actual-device validation and a trustworthy
blind comparison pipeline remain open. No H5 win-rate increase is claimed.

## 15. Blender branch round 4 — connected sleeves and physical attachment

The parent played native Blender hang-back/landing actions and actual exported
Street/Race hop clips. Connected armholes remove the former overlapping sleeve
join. Wider graded elbow loops keep a continuous bend through compression and
extension. These are accepted incremental improvements and are now in both
protected rider sources plus all four full/LOD exports. Nineteen bones, eight
actions and four sockets retain exact bind/action data. The game still needs
cloth folds, material variation, a better hood/neck overlap, waist and knee work;
this is not an AAA verdict or a new blind-critic score.

The parent's played Pro Rear Wheel First finish (42.425 s, zero faults) keeps
normal arm attachment through the result-camera move. The 35-degree physical
elbow stop excludes the earlier fixed-pole singularity. Across 58 recordings /
255,345 ticks, actual full/LOD rendered COM mismatch is at most 0.114 micrometres;
hand/sole errors stay below 0.256 / 0.189 micrometres. The exact user's older
78.433 s / four-fault finish still lacks matching inputs.

The bike pad previously disappeared into the blue body. Raising its loft makes
the black seat readable during played takeoff/landing without moving mechanical
markers. Full/LOD geometry tests retain their original physical tolerances.

Connected trouser prototypes remain rejected: landing still has four street /
seven race saddle crossing pairs, and inherited knees fold through themselves.
The promoted rider sources retain the previous trousers. Reference cloth planes
and detailed bike material separation still set the visual target.

Shader warmup now builds actual two-material batches, preserving skinning,
instancing and real scene lighting. It no longer leaves live visibility or the
render target changed over asynchronous waits; jobs serialize. The three new
deferred regressions fail against the old implementation and pass with this
change. Rapid transitions still produce Metal invalid-program warnings in all
three runs of each frozen build. Raw WebGL controls identify pending parallel
link/deletion as a sufficient trigger; diagnostic deletion deferral prevents
all warnings in six game stress runs. That workaround is not in production.
Capture records the actual GPU/backend, awaits settled
setup and rejects WebGL errors; headless desktop evidence is not an iOS result.

Exact source/model/build hashes, played clips and open limits are in
`docs/evidence/blender-r4.json`. Full check: 18 failed / 686 passed / 11 todo;
typecheck, lint and separate build pass.
