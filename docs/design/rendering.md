# Rendering design — Trials Rising-on-PS4 look in Three.js at 60 fps

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

## 0. Budgets and where they stand (round 4, flat-test, industrial, `high`; single-track session)

| Budget | Cap | Round 1 | Where measured |
|---|---|---|---|
| Draw calls | 300 (400 with an AO pre-pass) | round 7 flat-test `high` 194 riding (set pieces +≈20, AO +2); e1 156, m2 146, h1 155, h3 217 — 202 idle / ≈215 riding (+62 with the ghost; round 5 added 8 skin batches + 5 prop types + deck AO) — bike frame and rider segments are merged per material (`util/merge.ts`) | `renderer.info.render.calls` (accumulated over all passes; `info.autoReset=false`) |
| Triangles | 500 k | round 7: 332 k flat-test, 489 k e1, 250 k m2, 207 k h1, **639 k h3** (shadow pass counted; see gaps) — 326 k (deck on a continuous container + pallet base, three container rows, hall structure; shadow pass counted) | `renderer.info.render.triangles` |
| Texture memory | 96 MB | round 7: 44.0 industrial, 46.1 canyon, 41.8 snow, 59.4 nightCity (3 facades + shops + neon + masks), 46.0 foundry | `estimateTextureMB` (all maps incl. mips, env, canvas textures) |
| Track + obstacles | 20 calls / 80 k tris | 11 calls / 5.1 k tris (12-kind synthetic track) | `debugInfo().trackCalls/trackTris` |
| Texture generation | 400 ms desktop, after first frame | ≈330–400 ms in headless Chromium (SwiftShader host) | `debugInfo().textureGenMs` |
| Shader programs | 40 (raised round 5) | round 7: 37 flat-test `high` (AO +2, crowd card +1), 32/29/34/37 on e1/m2/h1/h3, 19 on `low`; 34 on flat-test after the round-6 hero (riderCloth reuses the vertex-colour variant; +0 programs) | `info.programs` |
| Restart → frame | 1 frame | 1 frame; no rebuild on restart | capture scene detector, scratch `restart.mts` |
| Synced frame, SwiftShader | p95 250 ms | `high` p50 134 ms, `low` p50 75 ms (56 %) | scratch `timing.mts`, 24 frames after warm-up |
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
| riding | 2.2–10 m/s | 0.26 | 0.30 | 0.56 | 15° | 11° |
| pull-back | 10 → 18 m/s, `smoothstep` | 0.26 → 0.14 | 0.28 | 0.56 | 17° | 13° |
| fast / air | speed > 18, or airTime > 0.25 s (70 % of the way) | 0.14 | 0.28 | 0.53 | 17° | 13° (+4° airborne) |

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
1 s, then `heightFrac` creeps 2.5 %/s; pitch 14°, yaw 12°, bike at x 0.45. **Finish**: follow
half-life → 1.5 s, pitch drops 15° over 1 s, heightFrac ≥ 0.2. **Restart**: hard cut (every
smoother snapped). **Countdown/menu** (`setRunInfo.phase`): idle params held.

`meta.camera` keys: while `bikeX ∈ [x0, x1]` a per-key weight follows 1 (half-life `blend/3`,
or snaps when `cut`); `yaw/pitch/roll` override, `zoomBias` scales heightFrac by `1 − 0.6·bias`,
`dist` converts to a heightFrac at the current fov. Modes: `side` (5°/4°), `side-tight` (+bias
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

| Tier | Bloom | Bloom res | Shadows | Internal resolution | Particles | SwiftShader synced p50 (1280×720) |
|---|---|---|---|---|---|---|
| low | off | — | **off** (materials recompiled) | 0.75× (composite upscales) | ½ counts | 60 ms |
| medium | on | 480×270 | 2048² | ≤ 1.5× DPR | full | 125 ms |
| high | on | 640×360 | 2048² | ≤ 2× DPR | full | 95–137 ms |

Smear is off on `low`. Contact: no SSAO yet; instead each tyre carries a projected contact-shadow
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

## 12. Known gaps after round 7 (what still reads non-AAA)

- **Foundry** is still dark-and-dim rather than the reference's warm, readable red-orange hall: the
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
- h3-fire-line (foundry) sits at ≈640 k tris with the shadow pass (500 k cap): the hall kit's pallets /
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
