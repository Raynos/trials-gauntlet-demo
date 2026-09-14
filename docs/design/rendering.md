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

## 0. Budgets and where they stand (round 1, flat-test, industrial, `high`)

| Budget | Cap | Round 1 | Where measured |
|---|---|---|---|
| Draw calls | 300 | 160–210 | `renderer.info.render.calls` (accumulated over all passes; `info.autoReset=false`) |
| Triangles | 500 k | 64–77 k | `renderer.info.render.triangles` |
| Texture memory | 96 MB | 38.8 MB | `estimateTextureMB` (all maps incl. mips, env, canvas textures) |
| Track + obstacles | 20 calls / 80 k tris | 11 calls / 5.1 k tris (12-kind synthetic track) | `debugInfo().trackCalls/trackTris` |
| Texture generation | 400 ms desktop, after first frame | ≈330–400 ms in headless Chromium (SwiftShader host) | `debugInfo().textureGenMs` |
| Shader programs | 32 | 32 (industrial; every MeshStandardMaterial carries the same map set) | `info.programs` |
| Restart → frame | 1 frame | 1 frame; the restart frame costs the same as any frame (no rebuild: p50 93 ms vs 95 ms normal on SwiftShader `high`, 48 vs 60 on `low`) | capture scene detector, scratch `restart.mts` |
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
  world/track.ts          Ribbons from polyline colliders (bevels, aprons, vertex AO shade), merged per surface
  world/obstacles.ts      Bodies for the 12 placed kinds + unclaimed box/circle/seesaw colliders + hazards
  world/gates.ts          Checkpoint gates (posts, beam, lamp, hanging zone plaque D1…A3), finish arch + checkered banner
  world/props.ts          PropBatch (InstancedMesh) + geometry recipes (container, pallet, drum, tyres, column, truss, lamp, rack, rock, pine, bale, cone, building, pipe)
  world/biomeKit.ts       Per-biome world: interior shell (industrial, foundry) or terrain + 3 parallax silhouette tiers, seeded props, shafts, lights
  biomes/index.ts         Biome descriptors (5): sun, hemi, sky, fog tiers, floor fog, grade, bloom, ambient particles
  bike/bikeModel.ts       Bike (tube/lathe/primitives) + Wheel (tyre, rim, hub, disc, 32 spokes, blur disc)
  rider/riderModel.ts     Articulated rider (2-bone IK arms/legs) + ragdoll drawn from state.ragdoll
  particles/ParticleSystem.ts  GPU-integrated THREE.Points pools (ballistics + drag in the vertex shader from uTime = tSim)
  particles/emitters.ts   Cue/event → burst rules, seeded by track.seed ^ tick
  post/chain.ts           EffectComposer: RenderPass (HalfFloat) → UnrealBloom → Composite (smear, ACES, grade, vignette, chroma, flash, dither, sRGB)
```

`render()` per frame: `frames.build` → (frame 2 only) `lib.generateTextures()` → `rig.update` →
`lighting.follow(rig.target)` → `bike.update` → `rider.update` → seesaw/drum/lamp/flicker updates
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
| idle / countdown | speed < 1.5 | 0.40 | 0.45 | 0.55 | 5° | 3° |
| riding | 1.5–9 m/s | 0.24 | 0.30 | 0.53 | 15° | 17° |
| fast / air | speed > 9 or airTime > 0 | 0.09 | 0.28 | 0.50 | 18° | 24° (+6° airborne) |

**Roll is always 0** (Euler YXZ from yaw/pitch keeps the camera right vector horizontal; the
landing shake moves y only). Only a `CameraKey.roll` can roll. `camera()` reports the measured
`roll` (angle of the camera right vector to the horizontal) plus `yaw`, `pitch`, `state`, so the
harness can assert `|roll| < 1e-6` on flat-test (round 2: 0.0 on every sampled frame).

`zoomT = smoothstep(1.5, 9, speed)`, `fastT = smoothstep(9, 15, speed)`, `airT = smoothstep(0, 0.7, airTime)`,
`wideT = max(fastT, airT)`. Moving left mirrors screenX and yaw. Each parameter is followed by an
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
fog **desaturated grey** `0x5a5654` tiers 90/200/380 m, floor fog density 0.025, bloom 0.45.
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
| industrial | brick back wall with two 4×3.4 m window banks per 12 m bay (canvas albedo + emissive map, sills at 6.2 m), side walls, roof plane with emissive skylight strips, trusses every 12 m, I-columns | containers (6 colours, some stacked), shelving racks with boxes, pallet stacks, drums (red/white/blue), tyre stacks | hanging sodium lamps (emissive discs) every 9 m, 2 additive light-shaft quads every 24 m, dust motes |
| foundry | same shell, red panes and brick | + molten pillars (flickering emissive), pipe runs | 1 point light, embers |
| canyon | 3 mesa silhouette tiers at z −45/−130/−340 | rocks (displaced icosahedra, 0.8–3.2 m), hay bales, tyres, white drums; occasional foreground rock | — |
| snow | pine tiers + far hills | pines, crates, lamp posts with warm heads | snowfall (10/0.1 s) |
| nightCity | city-skyline tiers with an emissive window grid on the nearer two | building blocks (window-grid emissive), cones, fire barrels (flicker), drums | 1 orange point light at the start, embers |

Fog tiering falls out of real depth: the silhouette planes sit at real distances and the fog
curve does the 100/50/15 % contrast.

## 8. Track and obstacles (`world/track.ts`, `world/obstacles.ts`, `world/gates.ts`)

**Ribbons.** Every polyline collider becomes a ribbon along its exact points (resampled to
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
what physics says.

Parts: twin-spar frame + downtube + subframe (`TubeGeometry` on Catmull-Rom), head tube, tank
(lathe), seat, fenders, side panels, number plate, engine cases + cylinder + clutch/ignition
covers, exhaust header (tube) + muffler (lathe) on the camera side, bars + grips + triple clamps,
pegs, forks (chrome uppers, black sliders, caliper), swingarm + brace, shock + red spring,
chain loop (`TubeGeometry` around the sprockets on the far side; link texture offset scrolls
`spin·0.11/0.0127` so links move at ground speed), rear sprocket. Wheels: tyre torus (outer
0.34, tube 0.075), rim torus, lathe hub, brake disc, 32 crossed spokes; spokes fade 1 → 0.15
over |spinVel| 12–30 rad/s while a translucent ring fades in (0.35). All parts cast shadows.

## 10. Rider (`rider/riderModel.ts`)

Full-gear rider built from a parts kit per segment (`Segment` = group whose +y runs joint→joint,
scaled to the IK length): helmet shell + dark visor band + peak + chin bar + goggle strap + neck;
torso capsule widened across the shoulders with chest plate, spine protector and shoulder pads;
upper arms with elbow pads; forearms with gloves; pelvis block + belt; thighs with knee armour;
shins with shin guards, boots, soles and buckles. Materials: helmet white, jersey yellow, armour
near-black gloss, pants dark blue, gloves/boots black.

Pose (`poseRider`): a smoothed `stand` factor (half-life 0.25 s from tSim) is 1 when moving
> 1.2 m/s, airborne, crouching or leaning hard, else 0 (seated at idle). Hips
`x = pegs.x − 0.02 − 0.28·back − 0.3·armExtend + 0.14·fwd − 0.06·crouch − 0.16·(1−stand)`,
`y = lerp(seat + 0.1, pegs.y + 0.76 − 0.4·crouch, stand)`. Torso from vertical
`0.62·stand + 0.3·(1−stand) + torsoPitch + 0.3·fwd + 0.5·crouch − 0.5·back − 0.35·armExtend`
(attack position standing; arms go straight naturally when the hips are back because the IK
saturates at full reach; a crouch drops the hips and folds the torso). Head continues the torso at
45 %. Arms: 2-bone IK shoulders → grips with the elbow **above** the shoulder–hand line and out of
plane (motocross elbows-up); legs: hips → pegs, knees forward.

Ragdoll: while `state.ragdoll` is non-null the seated hierarchy hides and the seven physics
bodies are drawn exactly at `pos/angle` (arm and leg bodies drawn twice at z ±0.14). The
render-side Verlet ragdoll from the earlier draft is **cut** per CONTRACT §2.3.

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

## 12. Known gaps after round 1 (what still reads non-AAA)

- Synced render time on SwiftShader is ≈150 ms/frame at `high` (2048² shadow + bloom + HalfFloat
  1280×720); the perf harness should pin `low` for timing runs (harness owner).
- No SSAO; contact is blobs + tyre squash only. No worn-line decal on the ribbon.
- Windows still blow out to pure white (p99 0.98); the reference keeps pane texture at ~0.85.
- Rider is a parts kit, not a skinned mesh: no fingers, no cloth folds, joints are hard.
- Canyon reads as flat orange ground with visible dirt tiling; nightCity building windows are
  still large; foundry is a red wash — first passes only.
- Light shafts are additive quads (no occlusion by the bike); dust motes are unlit points.
- Textures generate on the very first `render()` (≈330–400 ms in headless Chromium) so no capture
  frame is ever untextured; boot's first-frame budget must absorb it.
- Kinetic text (READY/GO/CRASH) is the HUD owner's; the renderer only supplies the flash.

## 13. Verification recipe

```
pnpm typecheck && pnpm build
pnpm harness:capture harness/inputs/flat-test-clear.json --keep-frames   # clip + sheet
pnpm harness:perf                                                        # calls / tris / textures / heap
# determinism: capture twice, `md5 clip.mp4` and `cmp` frames must match
```
Scratch scripts used in round 1 (synthetic 12-kind track per biome, lighting probes) live in the
render owner's scratchpad, not in the repo.
