# Rendering design — Trials Rising-on-PS4 look in Three.js at 60 fps

Scope: `src/render/**` only. Consumes `PhysicsState`, `TrackDef`, `GameEvent` from
`src/core/types.ts`; implements the existing `GameRenderer` contract in
`src/render/index.ts` (canvas, `setTrack`, `render(state, alpha)`, `finish`,
`resize`, `stats`, `framesRendered`, `dispose`). Nothing here touches physics
determinism: the renderer is a pure function of (state history, events, sim clock).

Sources for every number: `reference/notes/{rising-visuals,techniques,evolution-gameplay,crash-restart-ui}.md`.
three 0.186.0 addons used: `EffectComposer, RenderPass, UnrealBloomPass, GTAOPass, ShaderPass, FXAAPass, LUTPass (logic inlined), csm/CSM, geometries/RoundedBoxGeometry`.

## 0. Targets and hard budgets

| Budget | Target | Hard cap | Where measured |
|---|---|---|---|
| Frame time, integrated GPU (Intel Iris Xe / Apple M1), 1080p | 12 ms | 16.6 ms | `harness:perf` synced p95 (SwiftShader: trend only) |
| Draw calls | 120–180 | 300 | `renderer.info.render.calls` |
| Triangles | 250k | 500k | `renderer.info.render.triangles` |
| Texture memory (incl. mips, render targets excluded) | 96 MB | 256 MB | `estimateTextureMB` |
| Render targets at 1080p | ~60 MB | 90 MB | computed from the chain in §6 |
| Shader programs | ≤ 24 | 32 | `info.programs.length` |
| JS heap growth per 10 min | 0 (pooled) | 8 MB | perf harness |
| Cold boot → first frame (procedural textures built) | < 900 ms | 1500 ms | `harness:boot` |
| Restart → first frame at checkpoint | 1 frame | 1 frame | capture scene detector |

Frame-time split at 1080p on Iris Xe (ms): main pass 6.0, shadow pass 1.8, GTAO
half-res 1.6 (high tier only), bloom 1.2, final composite 0.6, particles 0.5,
parallax layers 0.4, slack 3.9.

## 1. Coordinate frame and what the renderer consumes

Physics is 2D in the XY plane: +x along the course, +y up, angles CCW. Render adds
z: track centreline at z = 0, rideable ribbon spans z ∈ [-3, +3], props and crowd at
z ∈ [-14, -4] (behind; the camera sits at +z), foreground occluders at z ∈ [+4, +9],
parallax layers at z ∈ [-40, -350].

The renderer receives `render(state, alpha)`. It keeps the previous `PhysicsState`
internally and interpolates every transform by `alpha` (positions, `angle`,
`wheels.*.spin`, `rider.*`). Everything time-based (camera springs, particle ages,
kinetic text) is clocked off **simulated time**
`tSim = prev.time + alpha * (state.time - prev.time)`, never `performance.now()`, so a
harness capture at fixed cadence is frame-reproducible and two captures of the same
recording diff to zero.

Cues the snapshot does not carry are derived from consecutive states so they stay
deterministic:

```ts
// src/render/cues.ts
export interface RenderCues {
  speed: number;             // |bike.vel|
  groundSpeed: number;       // vel projected on the bike x axis
  rearSlip: number;          // rear.spinVel*R - groundSpeed, >0 = wheelspin  (dirt kick)
  rearImpulse: number;       // d(compression)/dt on the tick rear.grounded flips false->true (landing puff)
  frontImpulse: number;
  throttleGuess: number;     // clamp(d(rear.spinVel)/dt / 40, 0, 1)  (exhaust puff)
  airborne: boolean;         // !rear.grounded && !front.grounded
  airTime: number;           // seconds since both wheels left the ground
  justLanded: boolean;
  justLaunched: boolean;
  crashed: boolean;          // state.faulted === 'crash'  (ragdoll active)
  finished: boolean;
}
export function deriveCues(prev: PhysicsState, cur: PhysicsState, wheelRadius: number, out: RenderCues): void;
```

Requested (optional, hash-neutral) additions to `PhysicsState` for the physics owner:
`input?: {throttle, brake}` (replaces `throttleGuess`) and
`contacts?: {rear: SurfaceKind | null, front: SurfaceKind | null}` (dirt/wood/metal
particle choice). Until then the renderer looks the surface up from
`TrackDef.profile` / `obstacles` under the wheel x.

Events: `GameRenderer` gains `onEvent(e: GameEvent): void` (additive; the scaffold's
`Game` already emits them). `restart` → camera hard cut + particle flush + ragdoll
reset; `fault` with `reason 'crash'` → ragdoll spawn + camera retarget to rider;
`finish` → confetti + white flash + camera stop-follow; `checkpoint` → gate flash +
flame jets.

## 2. Module layout — `src/render`

```
src/render/
  index.ts              GameRenderer interface (+onEvent, setQuality, camera) and ThreeRenderer facade
  frame.ts              RenderFrame: interpolated state + cues + tSim (built once per frame, pooled)
  cues.ts               deriveCues()
  camera/
    rig.ts              CameraRig: follow / lookahead / zoom-state springs, shake, hard cut
    spline.ts           Track-authored camera overrides (per-x yaw/pitch/dist/roll, blend or cut)
  lighting/
    sun.ts              Directional sun + shadow frustum following the camera target, texel snapping
    environment.ts      Procedural sky → PMREM env; 3-tier fog shader chunk
  materials/
    texgen.ts           Procedural texture generator (noise → albedo / normal / ORM)
    library.ts          MaterialLibrary: named MeshStandard/MeshPhysical set, onBeforeCompile hooks
    wheelBlur.ts        Spoke blur disc shader (spin-rate driven)
  post/
    chain.ts            EffectComposer wiring by quality tier
    CompositePass.ts    ACES + LUT + vignette + chromatic + dither + flash in one pass
    DirectionalSmearPass.ts  Background-only directional blur, speed-gated
    lut.ts              Per-biome 32^3 LUT built procedurally (lift/gamma/gain + hue curves)
  world/
    track.ts            Ground ribbon from profile (UVs, worn-line decal, vertex AO, surfaceId)
    obstacles.ts        Obstacle kind → mesh builders (ramp, plank, drum, crate, container, gap)
    biome.ts            Biome descriptor + factory (industrial, canyon, snow, nightCity)
    parallax.ts         3 depth-tier billboard strips with per-tier fog and smear layer mask
    props.ts            InstancedMesh prop kit (barrels, tyres, pallets, cones, lamps, crowd)
    gates.ts            Checkpoint / finish gates with emissive state
  bike/
    bikeModel.ts        Frame, swingarm, forks, bars, tank, engine, exhaust, chain
    wheel.ts            Rim + tyre + 32 spokes + blur disc, spin-driven
    suspension.ts       Fork / shock pose from wheel compression
  rider/
    riderModel.ts       10-segment articulated rider; pose solver from RiderPose (2-bone IK)
    ragdoll.ts          Cosmetic Verlet ragdoll (seeded), spawned on 'crash'
  fx/
    ParticleSystem.ts   InstancedBufferGeometry pool per material (dust, smoke, sparks, exhaust, confetti, snow)
    emitters.ts         Rules mapping RenderCues / events → bursts
    text.ts             Kinetic text quads (READY / GO / CRASH! / countdown) + full-screen flash driver
  debug/
    stats.ts            RenderStats + assertBudget() (throws in harness when caps exceeded)
```

Facade contract (extends the scaffold; `Game` only needs `onEvent` wired):

```ts
export type QualityTier = 'low' | 'medium' | 'high';
export type BiomeId = 'industrial' | 'canyon' | 'snow' | 'nightCity';
export interface ThreeRendererOptions {
  antialias?: boolean; pixelRatio?: number; preserveDrawingBuffer?: boolean;
  quality?: QualityTier;          // default: auto from GPU string + first 30 frames
  biome?: BiomeId;                // default: TrackDef.obstacles kind 'biome' param, else 'industrial'
  deterministic?: boolean;        // harness: tSim clock, seeded fx rng, tier pinned
}
export interface CameraDebug {
  pos: Vec3; target: Vec3; fov: number; state: 'idle' | 'riding' | 'fast' | 'crash' | 'finish' | 'countdown';
  bikeScreen: { x: number; y: number; heightFrac: number };   // NDC→[0,1], bike+rider bbox height / frame height
}
export interface GameRenderer {
  /* scaffold members unchanged ... */
  onEvent(e: GameEvent): void;
  setQuality(t: QualityTier): void;
  camera(): Readonly<CameraDebug>;
}
```

`render()` per frame: `frame.build(prev, state, alpha)` → `rig.update(frame)` →
`sun.follow(rig)` → `bike.pose(frame)` → `rider.pose(frame) | ragdoll.step(frame)` →
`emitters.tick(frame)` → `particles.upload()` → `composer.render()`. No allocation
after `setTrack`.

## 3. Camera rig

Perspective, vertical FOV 34° (riding) → 28° (idle). Camera sits at +z looking at the
track, yawed toward travel and pitched down; parallax comes from real perspective.

Three zoom states blended by speed (bike+rider height as fraction of frame height;
techniques obs. 1, rising obs. 1, crash-restart obs. 15):

| State | Trigger | Bike height | Distance d | Yaw | Pitch | Bike screen x | Bike screen y |
|---|---|---|---|---|---|---|---|
| idle | speed < 1.5 m/s | 40 % | 5.5 m | 5° | 3° | 45 % | 55 % |
| riding | 1.5–9 m/s | 24 % | 9.5 m | 20° | 22° | 32 % | 53 % |
| fast / air | speed > 9 m/s or airTime > 0.25 s | 9 % | 24 m | 24° | 30° (airborne 45°, high 3/4) | 28 % | 50 %, landing kept in bottom third |

Blend: `zoomT = smoothstep(1.5, 9, speed)`, `airT = smoothstep(0, 0.7, airTime)`
(pull-back launch→apex 0.7 s). Every target parameter (`d, yaw, pitch, fov, screenX,
screenY, roll`) is followed by an exponential smoother with its own half-life:

```ts
// src/render/camera/rig.ts
interface Smooth { x: number; halfLife: number }
const HALF_LIFE = { pos: 0.12, lookahead: 0.25, dist: 0.35, yaw: 0.45, pitch: 0.45, fov: 0.30, roll: 0.60 };
function follow(s: Smooth, target: number, dt: number): number {
  s.x += (target - s.x) * (1 - Math.pow(0.5, dt / s.halfLife));   // frame-rate independent
  return s.x;
}
```

Lookahead: `targetX = bike.x + clamp(vel.x * 0.55, -1.5, 6.0)` (≈2/3 of the frame ahead
at riding speed), `targetY = bike.y + 0.9 - 0.4 * airT`, vertical half-life 0.18 s with a
0.6 m dead-zone so hops don't bob the frame. Airborne: target blends 50 % toward the
predicted landing point (ballistic solve against the profile each frame) so the
landing stays in the bottom third (evolution obs. 17).

Landing shake: on `justLanded`, amplitude `a = clamp(rearImpulse * 0.02, 0, 0.12)` m as
`a·e^(-t/0.18)·sin(2π·9t)` on camera y plus roll `±0.8°` with the same envelope.
Crash: target → ragdoll pelvis, follow decelerates over 1 s (pos half-life 0.12 → 1.0),
then creep `d *= 1 - 0.025·dt` (2–3 %/s, techniques obs. 4). Restart: **hard cut** —
every smoother snapped to its target; the checkpoint frame renders at rest offset on
frame N+1 (all four corpora). Finish: follow freezes at `finishX + 6`, pitch drops 15°
over 1 s, physics keeps rendering under it.

Track-authored overrides (`camera/spline.ts`): `TrackObstacle` with `kind: 'camera'` and
`params {x0, x1, yaw, pitch, dist, roll, blend = 1.5, cut = false}`. While bike x ∈
`[x0, x1]` the state table values are replaced, blended over `blend` s (Rising: continuous
dolly) or cut (Evolution: 3–4 cuts per track). "Sun behind rider on the big jump" is one
such override with yaw chosen so the sun disc sits behind the bike.

Countdown: static close-up (idle params, d 4.5 m, bike 35 % width) held through
3-2-1-GO; first forward motion releases the smoothers (1.5 s pull-out, rising obs. 4).

Determinism: `dt = tSim - tSimPrev` (alpha-only frames still advance). `camera()` exposes
`bikeScreen` so the harness asserts framing.

## 4. Lighting and shadows

One key light + one environment per biome, no hemisphere light (env supplies ambient
so shading stays PBR-consistent):

```ts
// src/render/world/biome.ts
export interface BiomeLighting {
  sunDir: [number, number, number];   // unit vector toward the scene; canyon (-0.35, 0.55, -0.75)
  sunColor: number; sunIntensity: number;   // DirectionalLight 2.5–4.0
  skyZenith: number; skyHorizon: number; groundBounce: number; sunDiscIntensity: number;
  envIntensity: number;                // envMapIntensity 0.6–1.2
  exposure: number;                    // 0.8–1.3
  fogTiers: [near: number, mid: number, far: number];   // view distance for 100 / 50 / 15 % contrast
  fogColor: number;
  floorFog?: { h0: number; hs: number; density: number };
}
```

Environment: procedural sky (zenith→horizon→ground gradient, sun disc with intensity
up to 40 in HDR, horizon haze band) drawn to a 256×128 float16 equirect `DataTexture`
and run through `PMREMGenerator` once per biome (≈4 ms). The sun disc in the env is
what makes chrome read as chrome and gives the anamorphic streak something to bloom.

Shadows: a single 2048² directional shadow map (`PCFSoftShadowMap`, `radius 3`,
`bias -0.0004`, `normalBias 0.02`), orthographic frustum `28 × 18 m` that follows the
camera **target** (covers riding view plus 1.5 bike lengths of long low-sun shadow);
`48 × 30 m` in the fast/air state. Frustum origin snapped to texel increments
(`28 / 2048 = 1.37 cm`) so edges don't crawl as the camera pans. `csm/CSM` with 2
cascades (12 m / 60 m) sits behind the `high` tier for nightCity where lamp-post
shadows matter; default stays the single snapped map — integrated GPUs pay per pass.
Casters: bike, rider, obstacles, props within 30 m of the target; ground receives only;
parallax layers neither.

Local lights: at most 2 `PointLight` + 1 `SpotLight` in the frame. Headlight
(nightCity only): 28° cone, pool ≈ 2 bike lengths ahead. Barrel fires: point lights with
flicker `1 + 0.15·sin(23t)·sin(7.3t)`. Checkpoint gates: emissive only, no light.

Fog: three's fog cannot do the 3-tier look; a custom chunk via `onBeforeCompile` maps
view distance through a 3-stop curve (`fogTiers`) toward `fogColor`, weighted by
`exp(-max(0, y - h0) / hs)` for floor fog in industrial and snow. Parallax tiers use the
same function so backdrop and geometry agree (rising obs. 12).

## 5. Materials — all procedural at load

No downloads. Textures are generated by a fragment shader into a `WebGLRenderTarget`
(canvas fallback), read once, uploaded as RGBA8 with mips, anisotropy 4, sRGB on
albedo only. Seeded by `TrackDef.seed` so a track always looks identical.

```ts
// src/render/materials/texgen.ts
export interface TexSpec {
  size: 256 | 512 | 1024;
  layers: NoiseLayer[];                        // fbm | worley | ridged | stripes | bricks | planks | grid: {scale, octaves, gain, warp}
  albedo: { ramp: ColorStop[]; dirt: number; edgeWear: number };
  height: { from: 'sum' | 'layer'; index?: number; amplitude: number };  // → normal via Sobel, strength 0.5–3
  roughness: { base: number; byHeight: number; noise: number };
  ao: { fromHeight: number };
  tile: boolean;                               // periodic noise so 1×1 wraps
}
export interface TexSet { map?: Texture; normalMap: Texture; ormMap: Texture }   // ORM = AO.R, roughness.G, metalness.B
export function generate(gl: WebGLRenderer, spec: TexSpec, seed: number): TexSet;
```

Material set (≈ 60 MB with mips, well under the 256 MB cap):

| Material | Tex | Size | Notes |
|---|---|---|---|
| dirt (canyon / industrial ground) | A/N/ORM | 1024 | fbm + worley pebbles; worn-line decal blended by uv2 mask |
| concrete / asphalt | A/N/ORM | 1024 | ridged cracks, oil stains |
| snow | A/N/ORM | 512 | sparkle roughness noise; `MeshPhysicalMaterial.sheen 0.4` as subsurface fake |
| weathered plank (rideable) | A/N/ORM | 1024 | pale high-luminance wood, grain + knots (readability rule, techniques obs. 19) |
| corrugated steel / container | A/N/ORM | 512 | ribbed normal, rust mask; painted colour via per-instance `color` |
| rubber tyre | N/ORM | 512 | tread blocks radially mapped |
| painted metal (bike frame) | ORM | 256 | flat colour, `clearcoat 1.0`, `clearcoatRoughness 0.08` |
| chrome (forks, exhaust, rims) | — | — | metalness 1, roughness 0.12, relies on the env sun disc |
| rider jersey / leather | N/ORM | 512 | weave normal, roughness 0.85 |
| parallax silhouettes | A (alpha) | 2048×512 × 3 tiers | painted per biome (§7) |
| particle atlas | A | 512 | 4×4 cells: soft dust, smoke curl, spark streak, confetti, ember, flame slice |
| decal atlas (worn line, red X, arrows, stencils, sponsor banners) | A | 1024 | shared |
| LUT | 3D 32³ | — | per biome, 128 KB |

Saturation rule (techniques obs. 20): bike frame `#1e6fff` or `#ff3b1f`, jersey
`#ffd400`, helmet white; no environment surface exceeds chroma 0.12 in OKLCh, so the
bike is findable at the 9 % zoom state.

## 6. Post-processing chain

`EffectComposer`, `HalfFloatType` targets, renderer tone mapping **off** (done in the
composite). Order and cost at 1080p on Iris Xe:

1. `RenderPass` — MSAA 4× via `renderTarget.samples = 4` on medium+; FXAA on low. Depth texture attached.
2. `GTAOPass` half-res, 8 slices, radius 0.6 m — **high only** (1.6 ms). Medium/low use baked
   vertex AO on ribbon + obstacles (16 hemisphere rays vs profile + obstacle AABBs at
   `setTrack`, ~30 ms for 120 m) plus a soft contact-shadow blob quad under each wheel.
3. `DirectionalSmearPass` — background layer only (§6.1), 0.4 ms.
4. `UnrealBloomPass` at 1/4 res, `threshold 1.0` in HDR (only emissive / sun / sparks
   cross it), `strength 0.9`, `radius 0.35`, 3 mips (1.2 ms). Diffuse surfaces never bloom
   (rising obs. 13). Anamorphic: extra 1/8-res 15-tap horizontal blur of the bright mask,
   weight 0.35, enabled only while the sun disc is on screen.
5. `CompositePass` (one full-screen shader, 0.6 ms): ACES filmic → 32³ LUT grade →
   vignette `1 - 0.35·smoothstep(0.45, 1.1, r)` → chromatic aberration
   `0.0015·smoothstep(8, 16, speed)` → flash uniform (finish / impact) → 1/255 triangular
   dither → sRGB encode.

| Tier | AA | AO | Bloom | Smear | Shadow | Parallax tiers | Pixel ratio cap |
|---|---|---|---|---|---|---|---|
| low | FXAA | baked | 1/4 res, 2 mips | off | 1024², PCF | 2 | 1.0 |
| medium | MSAA 4× | baked | 1/4 res, 3 mips | on | 2048², PCFSoft | 3 | 1.5 |
| high | MSAA 4× | GTAO half-res | + anamorphic | on | 2048² or 2-cascade CSM | 3 + volumetric shaft quads | 2.0 |

Auto-tier: start `medium`; after 30 frames if p95 > 15 ms drop a tier, if p95 < 8 ms
for 5 s raise. Off in `deterministic` mode (harness pins a tier).

### 6.1 Cheap motion blur (evolution obs. 19, rising obs. 16)

No velocity buffer. Two effects:
- **Wheel blur**: spoke material opacity fades 1 → 0 over `|spinVel| ∈ [12, 30] rad/s`
  while the `wheelBlur.ts` disc (2 triangles; radial gradient with 12 rotating streak
  lobes, `opacity 0.35`, depth-write off) fades 0 → 1. Frame and rider stay sharp.
- **Background smear**: parallax strips and props at z < -4 are on `camera.layers` bit 1
  and rendered to a mask; `DirectionalSmearPass` blurs them with 7 taps along the
  screen-space travel direction, length `px = clamp((speed - 9) · 1.4, 0, 14)` — zero
  below 9 m/s so casual riding shows none, the expert run smears.

## 7. Environment kit — 4 biomes

Biome = lighting block + material bindings + prop palette + 3 parallax strips + LUT.
One dominant hue, one accent (rising obs. 11):

| Biome | Dominant / accent | Sun | Fog tiers (m) | Parallax (z -40 / -120 / -350) | Hero props |
|---|---|---|---|---|---|
| `industrial` (HD Warehouse) | amber `#d8a24a` / cyan neon `#3ff2ff` | 3000 K through skylights, elev 55° | 25 / 60 / 140 + floor fog h0 0.3, hs 1.2 | shelving racks · girders + blown-out windows (emissive) · far wall gradient | pallets, drums, cable spools, containers, chain-link, 300 dust motes, 4 volumetric shaft quads |
| `canyon` (desert) | peach `#e9b48c` / dark rock `#3a2b25`, red-white ramp stripes | 5000 K, elev 22°, disc in frame on jumps | 40 / 110 / 260 | rock stacks · mesa silhouettes · sky + sun glow | cactus occluder z +6, tyres, hay bales, oil-rig lattice, worn-line decal |
| `snow` (village) | blue-white `#c9d8ee` / warm window `#ffb648` | 6500 K overcast, elev 35°, shadow radius 6 | 18 / 45 / 80 | pines · chalets w/ lit windows · white | crates, fences, lamp posts, 600-pt snowfall at 0.6 m/s |
| `nightCity` | grey-green `#5d6a5f` / orange `#ff7a1a` | moon `#3a5a8a` at 0.25; headlight spot | 30 / 90 / 200 | storefronts · towers w/ emissive window grid · sky + moon | fire barrels (2 point lights), cones, truck occluder, pink flares + smoke ribbons |

Parallax (`world/parallax.ts`): each tier is one `PlaneGeometry` strip 600 × 150 m
tiled along x (3 unique silhouettes per tier, chosen per repeat by a seeded hash in the
shader) with a `texgen` alpha texture (skyline / tree / rock generators). Fog tier colour
is baked per strip through the same 3-stop function, so the far tier sits at 15 %
contrast. Strips ride real perspective plus a 1.3× depth exaggeration on the far tier
(`x += (camX - trackMid) · 0.3`) for the "painted backdrop" feel. 3 draw calls.

Props (`world/props.ts`): one `InstancedMesh` per type (≤ 14 types), seeded scatter
along the profile at z ∈ [-12, -4] and [+4, +8], 2.5 m keep-out from the ribbon,
density 0.6/m. Track-authored obstacles are separate meshes (≤ 60, merged per material
when static). Crowd: 2 instanced billboard rows (60 quads, 4-frame wave atlas) at
checkpoints and finish. Set-dressing motion (evolution obs. 22): propane fireball
timers, a swinging barrel, one rolling tyre — cosmetic, seeded, no physics.

Ground ribbon (`world/track.ts`): profile extruded to a 6 m ribbon, 4 lengthwise
segments (0.6 m bevelled edges), resampled so no segment exceeds 0.5 m (vertex AO,
smooth normals). `uv.u = arcLength / 2 m`, `uv.v` across; `uv2` drives the 0.8 m worn-line
decal centred on the rideable line. Per-span surface kind (`TrackObstacle.params.surface`
or biome default) goes into a `surfaceId` vertex attribute selecting a slice of a
`DataArrayTexture` (3 albedo/normal/ORM sets) — the whole ribbon is one draw call.

## 8. Particles

One `ParticleSystem` per material (additive: sparks / embers / flame; alpha: dust /
smoke / exhaust / confetti / snow) = 6 draw calls. Each is an `InstancedBufferGeometry`
quad with per-instance `pos0, vel0, birth, life, size0, size1, rot, seed, tint`; the vertex
shader integrates ballistics + drag analytically from `tSim`, so there is no per-particle
CPU update — spawning writes a ring buffer and uploads the dirty range. Soft particles
fade over 0.35 m against the depth texture. Pools: dust 2048, smoke 512, sparks 1024,
exhaust 256, confetti 1024, snow 1024. Rng: `core/rng` sfc32 seeded by `track.seed ^ tick`.

```ts
// src/render/fx/ParticleSystem.ts
export interface Burst { pos: Vec3; count: number; life: [number, number]; size: [number, number];
  vel: Vec3; spread: number; gravity: number; drag: number; tint: number; cell: number; stretch?: number }
export class ParticleSystem { constructor(atlas: Texture, blend: 'alpha' | 'add', capacity: number);
  emit(b: Burst, tSim: number, rng: Rng): void; setTime(tSim: number): void; flush(): void; readonly mesh: Mesh }
```

Emitter rules (`fx/emitters.ts`), numbers from the corpus:

| Cue | Emitter | Count | Life | Size | Motion |
|---|---|---|---|---|---|
| `rearSlip > 1.5` on dirt | dirt kick behind rear contact | 6 per tick · slip | 0.3 s puff, 1.5 s billow tail | 0.15 → 0.9 m | `-travel·2 + up·1.2`, drag 3, tint = ground albedo |
| `justLanded` | landing puff at contact, delayed 0.1 s | 40 · impulse | dirt 1.2 s / snow 0.7 s / wood 0.4 s (+8 hard splinter chips) | 0.3 → 1.6 m (bike-sized) | radial 1.5 m/s, up 0.8, gravity -0.5 |
| `throttleGuess > 0.6` rising edge | exhaust puff at pipe tip | 8 | 0.5 s | 0.15 → 0.35 m (≈1 wheel dia) | back 1.2 m/s, up 0.3 |
| metal contact and `rearSlip > 3` | sparks | 20 | 0.25–0.6 s | 2 px streak, stretched by velocity | 4–7 m/s cone, gravity -9.8, bounce 0.3 |
| barrel drive-through | fireball 24 × 0.2 s + smoke 40 × 1.5 s + embers 60 × 1.5 s | | | fireball 0.3 → 2.5 m | 2-stage (crash-restart obs. 21) |
| `checkpoint` | 2–4 flame jets at gate edge | 30 per jet | 0.9 s, full height in 0.2 s | 0.3 × 2.4 m column | up 6 m/s, additive orange core |
| `finish` | Composite flash 1.0 → 0 over 0.2 s + confetti 400 | | 2 s | | blue/white, gravity -2, flutter |
| `crash` | white flash sprite 0.12 s at pelvis + dust 30 | | | 0.4 m | |
| ambient | industrial dust motes 300, snowfall 600, nightCity embers 40/s | | | | |

## 9. Bike model (primitives; reads at 9 % frame height and at the idle close-up)

Dimensions match the scaffold placeholder so contact points stay put: wheelbase
1.30 m, wheel radius 0.34 m (rim 0.24), seat 0.85 m, bars 1.05 m. Parts sit in one
`Group` at `bike.pos` rotated by `angle`; wheels are placed at `wheels.*.pos` from
physics so suspension travel is exact.

| Part | Geometry | Tris | Material |
|---|---|---|---|
| twin-spar frame + downtube | `TubeGeometry` on Catmull-Rom (8 pts, r 0.028, 8 radial) × 2 mirrored + 1 | 3.2k | paint clearcoat |
| swingarm | `ExtrudeGeometry` tapered outline, depth 0.05; aimed at rear axle each frame | 600 | paint |
| forks × 2 | upper `CylinderGeometry` (chrome r 0.024) + lower (black r 0.03); lower slides `front.compression · 0.11 m` | 500 | chrome + rubber-black |
| rear shock | cylinder + 6-turn coil `TubeGeometry`; length from `rear.compression` (stroke 0.09 m) | 900 | chrome + red spring |
| tank + seat + side panels | `LatheGeometry` (12 pts) + extruded profiles | 2.4k | paint / matte black |
| engine + cases | 3 × `RoundedBoxGeometry` + lathe clutch cover | 1.2k | rough metal 0.5 |
| exhaust | `TubeGeometry` header r 0.02 → lathe muffler r 0.05 × 0.35 m | 1.1k | chrome, heat-tint gradient via `onBeforeCompile` |
| chain | `TubeGeometry` loop around sprockets r 0.04 / 0.11, 320 segs; UV scrolls with `rear.spin · 0.11` | 2.6k | dark metal, link normal |
| bars, levers, pegs, number plate | cylinders / boxes | 700 | chrome / black / white + decal |
| wheel × 2 | tyre `TorusGeometry(0.34, 0.06, 12, 40)` + rim torus + hub lathe + 32 spoke cylinders + blur disc | 6.8k each | rubber N/ORM / chrome / spoke / blur |

Total ≈ 27k tris, 14 draw calls (frame + tank + panels merged into one geometry).
`wheel.rotation.z = -spin` interpolated; spokes cross-fade to the blur disc (§6.1).
Chain sag: lower-run mid control point offset `-(0.02 + 0.02·sin(3·spin))`.

## 10. Rider: articulated from `RiderPose`, ragdoll on crash

Ten segments (capsules + helmet sphere + boot boxes, ≈ 9k tris, plain hierarchy — no
skinning): pelvis → torso → head; torso → upperArm × 2 → forearm × 2 (hands pinned to
bar ends); pelvis → thigh × 2 → shin × 2 (feet pinned to pegs). Two-bone analytic IK per
limb:

```ts
// src/render/rider/riderModel.ts
export interface RiderTargets { pelvis: Vec2; torsoPitch: number; barL: Vec2; barR: Vec2; pegL: Vec2; pegR: Vec2 }
export function solvePose(pose: RiderPose, cues: RenderCues, out: RiderTargets): void;
// pelvis (bike space) = seat + (-0.22·lean, 0.10 + 0.32·(1 - crouch)); stands when crouch < 0.3 && airborne
// torsoPitch = pose.torsoPitch + 0.15·lean; arms 2-bone IK to bar ends, elbows out of plane 0.12 m, armExtend scales reach
// legs 2-bone IK feet → pegs, knees forward; crouch lowers pelvis so knees bend
```

`RiderPose` already carries lean / crouch / torsoPitch / armExtend smoothed by physics
(the 100–150 ms lag and 0.3–0.4 s crouch→stand are physics' job). Render adds a 40 ms
overshoot on torso pitch and a lateral sway `0.05·sin(0.5·spin)` at speed. Helmet white,
jersey yellow, the rest near-black so the silhouette reads (rising obs. 17).

Ragdoll (`rider/ragdoll.ts`) is cosmetic and render-side because physics only exposes
`faulted === 'crash'`: a Verlet chain of the same 10 segments (11 points, 12 distance
constraints, 6 angle limits) stepped at 120 Hz sub-steps from `tSim` with the seeded
rng; initial velocities `bike.vel + angVel × r + 2 m/s toss`; collides with the track
profile (restitution 0.25, friction 0.6), 2–3 decaying bounces over ~1 s. The bike keeps
rendering at the physics pose (physics decides where the wreck lies); the free wheel's
spin decays `e^(-t/0.8)` for the 1–2 s the corpus shows. On `restart` the ragdoll is
discarded and the seated pose renders on the same frame as the cut. Camera target
switches to ragdoll pelvis the frame the ragdoll spawns (crash-restart obs. 1).

## 11. Kinetic text and flashes (render-side; the HUD owner keeps timer / faults)

READY / GO / CRASH! / BAILOUT! / TRACK FINISHED! and countdown numerals are camera-space
quads (SDF text baked once per string into a 1024×256 canvas) drawn in an overlay layer
so they receive bloom but not fog. READY: streak-in 0.1 s (`scaleX 3 → 1`), hold 0.5 s,
skew-rotate out 0.25 s. GO: shrink + fade 0.6 s, drift up-right 40 px. CRASH!: slab
270×60 px at `x 50 %, y 10 %`, rotated -6°, scale 0.6 → 1 in 0.25 s, hold 0.6 s, red italic
with dark outline. Countdown: `x 62 %, y 25 %`, 1.0 s cadence, visible 0.5 s, squash-stretch
0.15 s. Exposed as `renderer.text.show(kind)`; the game layer decides timing.

## 12. Determinism, harness and budget enforcement

- `deterministic: true` → `tSim` clock, seeded fx rng, tier pinned, no `Math.random`, no
  `performance.now` in any update path. Two captures of one recording produce identical
  frame hashes (`harness:capture` compares md5 of every 30th frame).
- `stats()` extended with `passes`, `particlesAlive`, `shadowCasters`; `assertBudget(stats)`
  throws when `calls > 300 || triangles > 500k || texturesMB > 256`, so `harness:perf` fails loud.
- `camera().bikeScreen` for framing assertions.
- All geometry / texture creation happens in the constructor and `setTrack`; `render`
  allocates nothing (pools, static scratch `Vector3`s).
- SwiftShader: MSAA and float targets run but slowly — timing runs pin `low`, look
  captures pin `medium`; trend `renderer.info` counters, not ms.

## 13. Build plan

Ordered so every milestone is capturable with the existing harness. "Clip" =
`pnpm harness:capture harness/inputs/<file>.json` at 1280×720 60 fps; framing checks read
`camera()` through `window.__trials` per frame in a small harness script.

1. **Frame + cues + interpolation** (`frame.ts`, `cues.ts`, `onEvent`, `camera()` stub).
   Accept: `deriveCues` unit tests for slip / impulse / justLanded on synthetic states;
   `flat-test-clear.json` clip has no stutter (bike screen-x per-frame delta σ < 0.4 px at
   constant speed); `renderer.info` unchanged from the scaffold (≤ 12 calls); typecheck 0.
2. **Camera rig** (`camera/rig.ts`, `spline.ts`).
   Accept: riding bike screen x ∈ [0.25, 0.40], y ∈ [0.48, 0.58], heightFrac 0.20–0.26;
   idle 0.36–0.42; a synthetic 2.5 s jump pulls back to ≤ 0.10 within 0.7 s of launch and
   keeps the landing point in the bottom third; `restart` frame N+1 camera error vs rest
   pose = 0; landing shake < 1 px within 0.5 s.
3. **Lighting, environment, shadow follow** (`lighting/*`).
   Accept: shadow under the rear contact ≤ 60 % luminance of lit ground in every frame of
   the clear clip; static scene + panning camera shows < 0.5 % changed shadow pixels per
   frame (no crawl); PMREM build < 8 ms; calls ≤ 20.
4. **Procedural materials + ground ribbon + worn line** (`materials/*`, `world/track.ts`).
   Accept: full texture set builds < 600 ms, `texturesMB` ≤ 96; per-material lit-sphere
   contact sheet produced for the parent to judge; ribbon = 1 draw call; vertex AO darkens
   ramp bases (sampled luminance at base < 80 % of flat).
5. **Bike model + wheel blur + suspension** (`bike/*`).
   Accept: ≤ 14 calls, ≤ 30k tris; spokes discrete at spinVel < 12 and a disc at > 30 in a
   two-frame comparison; fork compresses 11 cm at `compression 1`; chain UV scroll equals
   rear spin (no sprocket slip) in a slow-mo capture.
6. **Rider IK + ragdoll** (`rider/*`).
   Accept: hands on bar ends and feet on pegs within 1 cm over an 11×11 lean × crouch grid
   (unit test); crash clip shows a detached tumbling rider with the camera on the rider and
   the free wheel spinning; `restart` renders the seated rider on frame N+1 (scene detector
   fires on exactly one frame).
7. **Post chain + LUT + smear** (`post/*`).
   Accept: bloom only on emissive / sun (a 0.8-albedo grey quad gains < 2 % luminance with
   bloom on vs off); LUT switch moves mean hue per biome table; smear = 0 px below 9 m/s and
   ≥ 8 px at 16 m/s on the parallax layer while the bike edge gradient is unchanged; medium
   tier calls ≤ 40; SwiftShader synced ms ≤ 2× scaffold (trend).
8. **Biome kit: industrial, then canyon, snow, nightCity** (`world/*`).
   Accept per biome: 3 parallax tiers at ≈ 100 / 50 / 15 % contrast (measured on the strips);
   calls ≤ 180, tris ≤ 300k, textures ≤ 128 MB; no prop AABB intersects the ribbon; a 10 s
   clip + contact sheet per biome placed beside the matching reference sheet for the parent.
9. **Particles + kinetic text + finish / crash beats** (`fx/*`).
   Accept: dirt landing spawns a ≥ 1-bike-length puff within 0.1 s, gone by 2 s; exhaust
   puff visible on a throttle blip in the idle capture; finish frame mean luminance > 0.9
   then confetti for 2 s; CRASH! slab visible 0.2–0.8 s after fault; heap growth 0 over 600
   frames.
10. **Ship gate: budgets, tiers, determinism** (`debug/stats.ts`, `index.ts`).
    Accept: `harness:all` green; `assertBudget` passes on all four biomes; two captures of
    one recording are frame-hash identical; cold boot → first frame < 900 ms with all
    textures generated; auto-tier drops to `low` under a synthetic 20 ms stall and recovers;
    `pnpm typecheck` and `pnpm test` clean.
