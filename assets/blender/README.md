# Blender hero assets: rider + bike (glTF)

This directory builds the two glTF assets the render can load instead of the procedural
Three.js bike/rider, to be compared side by side by a blind critic. Everything is generated
by Python from scratch on every run (no hand-edited .blend); the .blend files are outputs.

```
assets/blender/
  common.py        primitives, material helpers, object-space decal projection, colourway (CW_*) nodes,
                   UV atlas, Cycles bake (one albedo per colourway), KHR_materials_variants, LOD decimate, export
  decals.py        -> textures/decals.png: the fictional sponsor set + class digits, rendered from Blender
                   text objects (Impact / DIN Condensed / Arial Black); cells in decals.CELLS
  build_bike.py    -> public/models/bike.glb  (+ `-- --lod` -> bike-lod.glb), bike.blend, textures/bike_*.jpg
  build_rider.py   -> public/models/rider.glb (+ `-- --lod` -> rider-lod.glb), rider.blend, textures/rider_*.jpg
  preview.py       Eevee renders of the EXPORTED .glb files -> previews/*.png (per colourway / LOD)
  textures/        baked atlases (JPEG), decals.png, chain_links.png, bike_spokecard.png
  previews/        turntables, rider-poses, composite-*, garage-*, compare-reference (suffix -pro / -lod)
```

## Rebuild

```
blender -b --python assets/blender/build_bike.py                 # ~6 s: two 1024 atlases, 3 albedo bakes
blender -b --python assets/blender/build_bike.py  -- --lod       # bike-lod.glb  (<= 6k tris, 512 atlases)
blender -b --python assets/blender/build_rider.py                # ~3 s: 1024 atlas, 2 albedo bakes
blender -b --python assets/blender/build_rider.py -- --lod       # rider-lod.glb (<= 6k tris, 512 atlas)
blender -b --python assets/blender/preview.py -- all             # ~1.5 min; --quick = 8 spp
blender -b --python assets/blender/preview.py -- garage --variant pro     # any of bike|rider|composite|compare|garage
blender -b --python assets/blender/preview.py -- composite --lod
blender -b --python assets/blender/decals.py                     # re-render the decal sheet (auto if missing)
```
Options after `--`: `--no-bake` (flat materials, fast), `--size N` (atlas px), `--no-meshopt`, `--lod`,
rider only: `--decimate 0.55` (body collapse ratio). Blender 5.2 at `/opt/homebrew/bin/blender`.
Everything regenerates from scratch; `textures/decals.png` is rebuilt if absent.

## Budgets (measured)

| file | tris | bytes (meshopt) | textures |
|---|---|---|---|
| `public/models/bike.glb` | 29 740 (wheels 6.6k + 7.2k incl. knobs, frame 3.1k, engine 2.1k, spokes 2 × 256, blur cards 2 × 128) | 1 180 724 | `bike_body_{rookie,pro}_albedo` 1024² JPEG, `bike_body_normal` / `_orm` 512², `bike_mech_albedo` 1024², `bike_mech_normal` / `_orm` 512², chain 64×32 PNG, spokecard 128² PNG |
| `public/models/rider.glb` | 11 694  5 934 verts  19 joints  8 clips | 861 596 | `rider_{rookie,pro}_albedo` 1024² JPEG, `rider_normal` / `_orm` 512² |
| `public/models/bike-lod.glb` | 5 824 (no knob geometry: the tread is in the normal map; 16 spokes) | 431 068 | same set at 512² albedo / 256² normal + ORM |
| `public/models/rider-lod.glb` | 5 530  2 852 verts, same bones / clips | 493 436 | 512² albedo × 2 / 256² normal + ORM |

Hero pair 1.95 MB / 41.4k tris; LOD pair 0.90 MB / 11.4k tris. Normal + ORM are baked at half the
albedo size because `shrinkTextures` caps them at 512² anyway. Textures never exceed 1024².

All four files use **`EXT_meshopt_compression`**: three.js needs
`loader.setMeshoptDecoder(MeshoptDecoder)` with
`import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'`.

## Colourways (contract for the render owner)

Both files carry **`KHR_materials_variants`** — two baked colourways matching `src/render/bike/livery.ts`:

| variant (rider.glb / rider-lod.glb) | variant (bike.glb / bike-lod.glb) | look |
|---|---|---|
| `rider_rookie` → material `rider_rookie` | `bike_rookie` → `bike_body_rookie` on `frame`, `bodywork`, `fork_upper` | white / blue suit, white helmet with blue stripe, blue-tint visor, **#7**; metallic blue bike, white plates, black 7 |
| `rider_pro` → material `rider_pro` | `bike_pro` → `bike_body_pro` on the same three meshes | charcoal / yellow suit, charcoal helmet with yellow stripe, gold mirror visor, **#1**; charcoal plastics, gunmetal frame, yellow plates, red 1 |

The default (slot) material is the rookie one. The variants differ only in the albedo image; normal and
ORM are shared, so switching is one texture swap. three's `GLTFLoader` exposes the mapping in
`mesh.userData.gltfExtensions.KHR_materials_variants.mappings` (`[{material, variants:[idx]}]`) and the
variant names in `gltf.userData.gltfExtensions.KHR_materials_variants.variants`; to select:

```ts
const ext = gltf.userData.gltfExtensions?.KHR_materials_variants;
const idx = ext?.variants.findIndex((v) => v.name === `rider_${cls}`);   // or `bike_${cls}`
scene.traverse(async (o) => {
  const m = o as THREE.Mesh; const map = m.userData.gltfExtensions?.KHR_materials_variants?.mappings;
  const hit = map?.find((mp) => mp.variants.includes(idx));
  if (m.isMesh && hit) m.material = await gltf.parser.getDependency('material', hit.material);
});
```
(userData survives `scene.clone(true)`; run this before `prepareHeroMaterials` / the ghost clones.)
Once the variant is selected, **do not multiply the atlas colour** (`gltfBody` / `gltfFrame` tints
in livery.ts) — the pro albedo is already charcoal / gunmetal and a multiply would turn its white
sponsor decals brown — and the procedural add-on `plates` group is redundant: the class digit is baked
on both side plates (rear fender flanks, x -0.59 / y 0.445 / z ±0.09 axle-frame) and the front plate.

Materials: `rider_rookie` / `rider_pro` (one draw), `bike_body_*` (frame, bodywork, fork_upper),
`bike_mech` (everything else), `chain_links`, `bike_spokecard` (alphaMode BLEND, double sided).
PBR metal/rough, ORM packed glTF-style (R unused=1, G roughness, B metallic). Visor / goggle lens:
metalness 1, roughness 0.06 — it needs the PMREM environment (`envMapIntensity` ≥ 0.8) to read.

Sponsors (all fictional, `public/art/manifest.json` set): VORTEX OIL (chest, shrouds), NORDVIK (back,
swingarm, front fender nose), APEX (thighs, rear fender, helmet trimark), BOLT ENERGY (belly, tank top),
KESTREL TYRES (upper arms), IRONWORKS (boot shin plates, fork guards). Numbers: back panel 0.14 × 0.21 m,
right chest, both side plates, front plate.

## Frames and units

* Metres. glTF is exported Y-up: **+x forward along the course, +y up, +z toward the camera**
  (= the rider's LEFT). Same as CONTRACT §1 / `src/render/frame.ts`.
* **Origin of both files = the REAR AXLE at static sag.** The render's `BikeModel.frame` group
  origin is the axle midpoint, so add the scene with `position.x = -0.65` inside `frame`
  (`frame.add(gltf.scene); gltf.scene.position.set(-0.65, 0, 0)`). Front axle = (1.30, 0, 0).
  Wheel radius 0.34, so the ground is at y = -0.34.
* All the render's `BIKE` constants apply after that shift: grips (0.27, 0.78, ±0.33) axle-frame =
  (0.92, 0.78, ±0.33) file-frame; pegs (-0.14, 0.02) = (0.51, 0.02), pegHalfWidth 0.20.
* Chain, front sprocket, silencer, front brake disc, clutch-side kick start are on the correct real
  sides: chain/silencer/front disc on +z (camera), rear disc/kick start on -z.

## bike.glb — object names, origins, how to drive them

Every part is a separate node under the root node `bike` (identity). Origins are the pivots.

| node | origin (file frame) | rigid to | drive |
|---|---|---|---|
| `frame` | (0,0,0) | frame | — (spars, head tube, downtube, cradle, subframe, bash plate, radiator) |
| `bodywork` | (0,0,0) | frame | — (tank→seat unit, seat pad, body-colour rear mudguard, shrouds, side plates) |
| `engine` | (0,0,0) | frame | — (cases, covers, finned cylinder, head, carb, boot, levers) |
| `exhaust` | (0,0,0) | frame | — (header from the port under the engine on +z, silencer under the seat) |
| `handlebar` | (0.96, 0.77, 0) = `barCentre` | frame | — (bar, grips, levers, clamp) |
| `pegs` | (0.51, 0.02, 0) = `pegs` | frame | — |
| `fork_upper` | (1.08, 0.50, 0) = `headBottom` | frame | — (clamps, stanchions, risers, number plate, **front fender**) |
| `fork_lower` (+ fork guards with IRONWORKS) | (1.30, 0, 0) = front axle | slides | `position = frontAxleLocal`, rotation identity (rake 23.75° from vertical is baked in: the sliders point from the axle toward `headBottom`). Sliders are 0.42 long, stanchions overlap them so any travel 0–0.15 m looks right. |
| `swingarm` | (0.43, 0.10, 0) = `swingPivot` | rotates | `rotation.z = atan2(ra.y-0.10, ra.x-0.43) - atan2(-0.10, -0.43)` (rest angle -2.913 rad; the rest arm points at the rear axle) |
| `shock_body` | (0.60, 0.52, 0) = `shockTop` | rotates | local **-y runs down the shock** from the top mount to the swingarm link (link = pivot + 0.55·(axle-pivot) + (0, 0.03)); rest length **0.6027**. Set `quaternion.setFromUnitVectors((0,-1,0), dir(top→link))` (the exported rotation is exactly that for the rest link). |
| `shock_spring` | same as `shock_body` | rotates + scales | same quaternion; the coil occupies local y ∈ [-0.05, -0.38], so `scale.y = len / 0.6027` keeps it seated at the top; clamp 0.55–1.25 like the procedural one. |
| `wheel_front` | (1.30, 0, 0) | spins | `position = frontAxleLocal`, `rotation.z = spin` in the physics' CCW convention (a wheel rolling toward +x turns clockwise seen from the camera, i.e. a decreasing angle; if it visibly counter-rotates, negate). Tyre, rim, hub, disc. |
| `wheel_front_spokes` | child of `wheel_front` | with the wheel | 32 geometric spokes (`bike_mech`). Hide above the blur speed. |
| `wheel_front_blur` | child of `wheel_front` | with the wheel | flat annulus hub → rim, both faces, `bike_spokecard` radial-streak alpha card (alpha 0.3–0.6). Show above ~6 rad/s, cross-fade with the spokes over ~4 rad/s (`material.opacity` on the card; it is already transparent). |
| `wheel_rear` | (0, 0, 0) | spins | same; `sprocket_rear`, `wheel_rear_spokes`, `wheel_rear_blur` are its children |
| `sprocket_rear` | (0, 0, 0.092) child of `wheel_rear` | — | r 0.105, 42 teeth |
| `sprocket_front` | (0.47, 0.135, 0.105) | spins | r 0.036, 11 teeth; `rotation.z = -spin · 0.101/0.033` if you bother |
| `chain` | (0,0,0) | frame | UV u is in **link units** (1 link = 0.0127 m); scroll `material.map.offset.x = (rearSpin · 0.101) / 0.0127` (wrap REPEAT is set). Runs rear sprocket (r 0.101) → front (r 0.033) at z = +0.092. |

Wheel construction: tyre carcass with 3 rows of geometric knobs (30/26 per row) plus a knob-row
bump in the rubber's normal map (the LOD tyre has only the map), channel-section rim (front 21"
r 0.262 / rear 18" r 0.228), 32 cross-2 spokes (own mesh), hub, 6-arm rotor carrier, drilled brake
disc r 0.105 (two rings of holes in the normal / albedo), red calipers front and rear.

Materials baked into the atlases: colourway metallic paint with Pointiness edge wear + flake
(plastics) and a second paint for the frame, brushed alloy (rims/hubs/clamps/bar), swingarm alloy
with a NORDVIK decal, cast alloy (engine), black anodised (fork lowers, pegs, clamps), gold anodised
stanchions, rubber (knob bump), heat-tinted steel header, grippy seat, colourway plates with the
class digit, black fender / fork guards with decals, red anodised accents, drilled rotor steel.

## rider.glb — skeleton, rest pose, actions

Nodes: `rider_rig` (armature; the bone nodes hang under it) and `rider` (skinned mesh, one
primitive, material `rider_rookie`, variant `rider_pro`). Skin = 19 joints, ≤ 4 influences per vertex.

**Bone names (exactly the joint set the render drives), `.L` = rider's left = camera side (+z):**

```
pelvis (root)
└ spine └ chest ├ neck └ head
                ├ shoulder.L └ upperArm.L └ forearm.L └ hand.L
                └ shoulder.R └ upperArm.R └ forearm.R └ hand.R
pelvis ├ thigh.L └ shin.L └ foot.L
       └ thigh.R └ shin.R └ foot.R
```

Every bone's local **+y runs head → tail** (Blender bone convention, kept by the exporter).
Rest pose = `stand_attack` of RIDER_CHAIN.md (reference-measured attack stance: hips over the seat
rear, torso 40 deg, elbows forward-up-out, knees over the pegs), evaluated in the file frame. Rest head → tail positions (x, y_up, z_camera),
metres, file frame (rear axle origin) — for `.R` negate z:

| bone | head | tail | length |
|---|---|---|---|
| pelvis | (0.355, 0.837, -0.000) | (0.447, 0.914, -0.000) | 0.120 |
| spine | (0.447, 0.914, -0.000) | (0.584, 1.030, -0.000) | 0.180 |
| chest | (0.584, 1.030, -0.000) | (0.768, 1.184, -0.000) | 0.240 |
| neck | (0.768, 1.184, -0.000) | (0.809, 1.276, -0.000) | 0.100 |
| head | (0.809, 1.276, -0.000) | (0.915, 1.513, -0.000) | 0.260 |
| shoulder.L | (0.768, 1.174, 0.040) | (0.768, 1.184, 0.210) | 0.170 |
| upperArm.L | (0.768, 1.184, 0.210) | (0.949, 1.057, 0.442) | 0.320 |
| forearm.L | (0.949, 1.057, 0.442) | (0.920, 0.780, 0.330) | 0.300 |
| hand.L | (0.920, 0.780, 0.330) | (0.911, 0.697, 0.297) | 0.090 |
| thigh.L | (0.370, 0.850, 0.090) | (0.671, 0.503, 0.115) | 0.460 |
| shin.L | (0.671, 0.503, 0.115) | (0.520, 0.110, 0.200) | 0.430 |
| foot.L | (0.520, 0.110, 0.200) | (0.710, 0.035, 0.200) | 0.204 |

Torso at rest = 40 deg from horizontal (hips (-0.28, 0.85) axle-frame), head/neck direction 66 deg. The full pose chain, measured from the reference, is **`assets/blender/RIDER_CHAIN.md`** (canonical poses, joint tables, elbow/knee pole rules) — that file is now the anatomy contract; the render should drive bones from it, not from the old `poseRider` chain.

**Driving the rig from the render's chain (recommended):** capture each bone's rest world quaternion
`q0[b]` once after load (skeleton in bind pose). Per frame, for each bone in the order above, take
the chain's joint positions (hips, shoulders, head, elbow, grip, knee, ankle — the same IK the
procedural model does), form the target direction `d1 = normalize(tail − head)`, the rest direction
`d0` from the table, and set the bone's **world** rotation `q = setFromUnitVectors(d0, d1) · q0[b]`,
then `bone.quaternion = parentWorldQ⁻¹ · q`. Set `pelvis.position` (world) = chain hips − 0.02·torsoDir;
all other bones keep their rest local positions. That is exactly how the 8 clips were authored
(`pose_from_joints` in build_rider.py), so a chain-driven pose and a clip pose are interchangeable.

**Ragdoll:** the 7 physics bodies map to: torso → `spine`+`chest` (hips→shoulders), pelvis →
`pelvis`, head → `neck`+`head`, upper arm → `upperArm.*`, forearm → `forearm.*` (+`hand.*`),
thigh → `thigh.*`, shin → `shin.*` (+`foot.*`); body local +y is distal→proximal (physics.md §7.7),
i.e. the reverse of the bone direction for the limbs.

**Actions** (30 fps, exported as glTF animations, all channels sampled, names as listed; each clip
starts from the rest pose unless stated so they blend from `stand_attack`):

| name | frames | what |
|---|---|---|
| `stand_attack` | 1–30 (0.97 s) | rest pose held (RIDER_CHAIN `stand_attack`) |
| `hang_back` | 1–30 | stand_attack → `hang_back` at f15 (hips (-0.57, 0.60), arms straight, torso 55 deg) → hold |
| `forward_attack` | 1–30 | stand_attack → `forward_attack` at f15 (hips (-0.22, 0.90), torso 26 deg, elbows 73 deg high and out) → hold |
| `crouch` | 1–30 | stand_attack → `crouch` at f15 (hips (-0.38, 0.78), torso 28 deg, knees 71 deg) → hold |
| `extend` | 1–20 (0.63 s) | `crouch` → `extend` at f8 (hips (-0.14, 0.96), knees 31 deg, elbows 133 deg) → stand_attack at f20 |
| `land_absorb` | 1–30 | `extend` → `land_absorb` at f8 (hips (-0.40, 0.70), knees 85 deg) → stand_attack at f30 |
| `idle_breathe` | 1–121 (4.0 s loop) | stand_attack ± 1.5 cm hips, ± 1.5 deg torso, ± 2 deg head; cyclic |
| `sit_cruise` | 1–30 | stand_attack → `sit_cruise` at f15 (hips on the seat (-0.30, 0.62), torso 60 deg, knees 104 deg) → hold |

Every key is a canonical pose from RIDER_CHAIN.md (`POSES` + `pose_chain()` in build_rider.py: hips,
torso angle, head angle → 3D two-bone IK with the elbow pole (0.6, 0.5, ±1.0) and knee pole
(1, 0.2, ∓0.15), hands pinned to the grips with the reach slide); clips are Bezier blends between them.

**Mesh:** body = skin-modifier stick figure (27 verts, per-vertex radii) + subdivision ×2, collapsed
to 0.55 (≈3.1k tris, continuous surface through hips/shoulders); gear merged into the same mesh:
helmet (shell, chin bar, mouth vent, peak, goggle frame + proud mirrored lens, strap, rear vent), neck
brace, collar, back-protector hump, shoulder caps, gloves (4 finger rings, coloured palm/cuff +
strap), boots (shaft, foot, toe, sole, heel cup, coloured shin plate, 3 alloy buckles), knee braces
(cup, shell, 2 hinges). Suit graphics are object-space in the bake materials: jersey main colour
with side panels, a chest chevron and a shoulder yoke in the panel colour, coloured upper-arm
sleeves with a cuff band on the forearms, pants with an outer-seam stripe, a dark belt / hem line,
diagonal weave bump + low-frequency grime; sponsors and numbers are `decals.png` cells projected
planar in object space (`common.decal`: patch axes, size, facing, depth bound). Skin (warm tone,
noise) on the neck between collar and helmet.

Weights: envelope blend (influence 1/(d/r)^4 over each bone segment, top 4, normalised) for the
body skin; rigid groups for helmet (`head`), gloves (`hand.*`, cuff 70/30 with `forearm.*`), boots
(`foot.*`, shaft `shin.*`), knee braces 50/50 `thigh.*`/`shin.*`, hump/collar/decals (`chest`).
Checked in previews/rider-poses.png: no tearing at armpits/knees in any of the 8 clips.

## Previews (assets/blender/previews)

Files carry a suffix per colourway / LOD: none = rookie hero, `-pro`, `-lod`, `-pro-lod`.

* `bike-turntable*.png` — side (yaw 20°, pitch 15°), front 3/4, rear 3/4, top.
* `rider-turntable*.png` — same 4 views of the rest pose; `rider-poses*.png` — one frame of each of the 8 actions.
* `garage*.png` — the garage close-up: 3/4 front, side, rear 3/4, helmet, studio grey (rookie + pro).
* `composite*.png` — rider on bike at the reference camera; `composite-15pct*.png` (rider ≈ 15 % of
  the 720 frame = the riding zoom), `-25pct`, `-40pct`, and `composite-gamesize*.png` (centre crops ×2).
  Judge at 15 % / 25 %.
* `compare-reference.png` — the two-up: ours next to reference crops for the same pose and camera:
  start-gate attack (3/4 front), finish-line side, GO hang-forward, wheelie hang-back (bike +38 deg).

Lighting in previews: one 4 W/m² sun + fill, AgX; the game's own grade will differ.

## Known limits / next steps for a second pass

* The rest pose no longer equals the physics crash-sensor chain (physics.md §7.7 hips 0.74, torso
  0.62 rad); physics/render should re-derive the sensors from RIDER_CHAIN.md `stand_attack`.
* Normal maps are subtle (JPEG, 512²); most surface read comes from albedo + roughness.
* No morph targets, no facial anything (helmet + goggles); the lens is part of the one rider mesh.
* Body is still a smooth skin-modifier tube: no cloth folds, no jersey hanging loose, no gloves with
  articulated fingers; the sleeve / pants seams are colour, not geometry.
* Bike: no headlight (trials bikes do not have one), no brake lines/cables; the bake margin is 4 px,
  so a few island edges show a dark seam on the LOD at 512².
* Decal sheet is 1024² for 14 cells: the 4-tile logo strips are ~460 px wide, so a 3 cm sponsor
  (boot plate, fork guard) is legible only in the garage view.
