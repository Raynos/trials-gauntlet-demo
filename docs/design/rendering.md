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
| Draw calls | 300 | 172 idle / ≈215 riding (+62 with the ghost) — bike frame and rider segments are merged per material (`util/merge.ts`) | `renderer.info.render.calls` (accumulated over all passes; `info.autoReset=false`) |
| Triangles | 500 k | 301 k (deck on a continuous container + pallet base, three container rows, hall structure; shadow pass counted) | `renderer.info.render.triangles` |
| Texture memory | 96 MB | 38.3 MB industrial, 34.8–43.9 MB other biomes | `estimateTextureMB` (all maps incl. mips, env, canvas textures) |
| Track + obstacles | 20 calls / 80 k tris | 11 calls / 5.1 k tris (12-kind synthetic track) | `debugInfo().trackCalls/trackTris` |
| Texture generation | 400 ms desktop, after first frame | ≈330–400 ms in headless Chromium (SwiftShader host) | `debugInfo().textureGenMs` |
| Shader programs | 32 | 29 (31 with the ghost); every library material is `fogify`'d and carries the same map set, every batch material takes vertex colours | `info.programs` |
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
  world/gates.ts          Checkpoint gates (posts, beam, lamp, hanging zone plaque D1…A3), finish arch + checkered banner
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
  post/chain.ts           EffectComposer: RenderPass (HalfFloat) → UnrealBloom → Composite (smear, ACES, grade, vignette, chroma, flash, dither, sRGB)
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
`material.color` or per-instance colour), rubber 256 (tyre, normal+ORM only), paintedMetal 256
(frame), fabric 256 (jersey/pants, normal+ORM only), rock 512, snow 256. ≈ 21 MB; total scene
texture footprint incl. canvas textures (wall bays, plaques, banner, silhouettes) and the env
is 38.8 MB.

`MaterialLibrary` creates every material flat (colour only) so the first frame draws
immediately; `generateTextures()` binds maps to the named materials and to every clone made
via `lib.derive(name)` (ribbons need `vertexColors`, so they are derived clones). Saturation
rule: bike frame `#1646d8`, white plastics (fenders, side panels, number plate), jersey `#ffcf1a`, helmet white, armour near-black; the environment stays low-chroma.

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

## 9. Bike (`bike/bikeModel.ts`)

Frame-local coordinates: origin = axle midpoint at static sag, calibrated from the first
grounded frame (`bike.pos → axle midpoint` offset), so whatever physics uses as `bike.pos`
the model sits on its wheels. Wheels are placed at the physics wheel positions; the swingarm
aims at the rear axle, the fork lowers slide along the fork axis to the front axle, the shock
stretches between its frame mount and 55 % along the swingarm — suspension travel is exactly
what physics says, plus a ×1.3 visual exaggeration: the frame sinks 3 cm per unit of summed
compression toward the wheels and pitches 0.05 rad × (rear − front compression), and the tyre
squashes up to 10 % on load, so travel reads at 24 % frame height.

Read (round 4, against the reference bike): **dark-blue frame** (`framePaint 0x1a3fb8`), blue body
plastics (`bodyPaint 0x2456d6`: tank, radiator shrouds, side panels, fenders), **black engine mass**
(`engine 0x2c2e33`: cases, finned cylinder with an alloy head, black radiators), alloy covers / triple
clamps / kick lever, silver forks and rims, dusty lower parts (`engineDusty 0x4a423a`: sump, fork
sliders), and white only on two small side number plates + a small front plate. The static frame parts
are merged into one mesh per material (`mergeStaticChildren`); swingarm, fork lowers, shock, spring and
chain stay separate.

Parts: twin-spar frame + downtube + subframe (`TubeGeometry` on Catmull-Rom), head tube, tank
(lathe), seat, fenders, shrouds + radiators, side panels + plates, engine cases + sump + fins + head +
clutch/ignition covers + kick lever, exhaust header (tube) + muffler (lathe) on the camera side, bars + grips + triple clamps,
pegs, forks (chrome uppers, dusty sliders, caliper), swingarm + brace, shock + red spring,
chain loop (`TubeGeometry` around the sprockets on the far side; link texture offset scrolls
`spin·0.11/0.0127` so links move at ground speed), rear sprocket. Wheels: tyre torus (outer
0.34, tube 0.075), rim torus, lathe hub, brake disc, 32 crossed spokes; spokes fade 1 → 0.15
over |spinVel| 12–30 rad/s while a translucent ring fades in (0.35). All parts cast shadows.

## 10. Rider (`rider/riderModel.ts`)

Full-gear rider built from a parts kit per segment (`Segment` = group whose +y runs joint→joint,
scaled to the IK length): helmet shell + **mirrored visor** (metalness 1, roughness 0.06 — it picks up
the windows) + peak + chin bar + goggle strap + neck; torso capsule widened across the shoulders with
chest plate, spine protector, shoulder pads, **shoulder caps** and a **numbered patch ("27", canvas)**
on the back and chest; upper arms with elbow pads; forearms with a sleeve cuff, glove wrist and a
**fist (torus) closed around the grip** + thumb; pelvis block + belt + hip spheres; thighs with knee
armour; shins with a knee ball, shin guards, boots, soles and buckles. Joint fillers (caps, hip and knee
spheres, cuffs) overlap the neighbouring segment so joints read as folds, not seams. Each segment is
merged to one mesh per material. Materials: helmet white, jersey yellow, armour near-black gloss, pants
dark blue, gloves/boots black.

**Hands stay on the grips at every lean.** If the shoulder–grip distance exceeds 98.5 % of arm reach,
the whole upper body (hips + shoulders) slides toward the bars along that line before the IK runs, so
the arms lock straight instead of the IK letting go of the grips (round 3 lost the grips hanging back).

Pose (`poseRider`): a smoothed `stand` factor (half-life 0.25 s from tSim) is 1 when moving
> 1.2 m/s, airborne, crouching or leaning hard, else 0 (seated at idle). Hips
`x = pegs.x − 0.02 − 0.28·back − 0.3·armExtend + 0.14·fwd − 0.06·crouch − 0.16·(1−stand)`,
`y = lerp(seat + 0.1, pegs.y + 0.76 − 0.4·crouch, stand)`. Torso from vertical
`0.62·stand + 0.3·(1−stand) + torsoPitch + 0.3·fwd + 0.5·crouch − 0.5·back − 0.35·armExtend`
(attack position standing; arms go straight naturally when the hips are back because the IK
saturates at full reach; a crouch drops the hips and folds the torso). Head continues the torso at
45 % and **counter-rotates to stay level in the world** (±25°). Pose inputs (`lean`, `torsoPitch`,
`armExtend`, `crouch`) get an ≈80 ms **lead** (round 4: `target + v·0.08·1.15`, velocity smoothed with a
40 ms half-life) because physics' `RiderPose` already lags input by ≈0.28 s t90 — the round-1 240 ms
second-order spring double-lagged. Wheel spin and the spoke→disc blur come straight from
`state.wheels.*.spin/spinVel`, so a stalled crashed bike stops its wheels on screen. Proportions: head r
0.108 (≈7.5 heads), torso capsule r 0.105 × z 1.45, knees pulled to z ±0.15 to grip the tank,
hips 6 cm forward when standing so the elbows bend. Arms: 2-bone IK shoulders → grips with the elbow **above** the shoulder–hand line and out of
plane (motocross elbows-up); legs: hips → pegs, knees forward.

Ragdoll: while `state.ragdoll` is non-null the seated hierarchy hides and the seven physics
bodies are drawn exactly at `pos/angle` (arm and leg bodies drawn twice at z ±0.14). The
render-side Verlet ragdoll from the earlier draft is **cut** per CONTRACT §2.3.

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

## 12. Known gaps after round 4 (what still reads non-AAA)

- No SSAO (a pass would cost 3–4 programs against a 32 cap); contact is baked vertex AO on the kit,
  tyre blobs and tyre squash. Corners between deck and containers still lack a proper AO gradient.
- The roof structure only enters the frame in the idle 3/4 view and on wide pull-backs; the riding
  frame tops out at the window heads (pitch 11°). The reference gets trusses in frame because its tracks
  hang higher in the hall; a track-authored `high34`/`low` key does the same here.
- Light shafts are additive quads (no occlusion by the bike or containers); dust motes are unlit points.
- Rider is still a parts kit: no fingers beyond the fist torus, no cloth simulation, helmet has no
  decals; the jersey number is a flat patch, not printed on the fabric UVs.
- Bike: no cables, no chain guide, no tread pattern on the tyre (normal map only), no mud splatter map.
- Canyon strata are boxes with a banded albedo (no erosion silhouette); heat haze is not implemented.
  nightCity buildings are still boxes with a window texture; wet-asphalt reflections are env-only
  (the neon does not reflect). Foundry remains a red wash in most frames — the hall's orange panes and the
  red fog dominate; it needs its own shell (dark steel, fewer windows, more emissive sources).
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
