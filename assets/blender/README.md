# Blender hero assets: rider + bike (glTF)

This directory builds the glTF assets the render loads for the bike and rider. Rider outfits have
protected, editable Blender sources; their runtime GLBs and baked atlases are derived exports.
The legacy `build_rider.py` and bike builder can still generate an initial asset from Python.

```
assets/blender/
  common.py        primitives, material helpers, object-space decal projection, colourway (CW_*) nodes,
                   UV atlas, Cycles bake (one albedo per colourway), KHR_materials_variants, LOD decimate, export
  decals.py        -> textures/decals.png: the fictional sponsor set + class digits, rendered from Blender
                   text objects (Impact / DIN Condensed / Arial Black); cells in decals.CELLS
  build_bike.py    -> public/models/bike.glb  (+ `-- --lod` -> bike-lod.glb), bike.blend, textures/bike_*.jpg
  build_rider.py   -> public/models/rider.glb (+ `-- --lod` -> rider-lod.glb), rider.blend, textures/rider_*.jpg
  rider_asset.py   protected rider seed/export commands; street is the default outfit
  source/         rider-street.blend / rider-openface.blend / rider-race.blend / bike.blend: editable masters
  generated/      rider-{street,openface,race}[-lod].blend: packed, baked export copies
  verify_rider_asset.mjs  production meshopt decoder checks before output publication
  preview.py       Eevee renders of the EXPORTED .glb files -> previews/*.png (per colourway / LOD)
  textures/        baked atlases (JPEG), decals.png, chain_links.png, bike_spokecard.png
  previews/        turntables, rider-poses, composite-*, garage-*, compare-reference (suffix -pro / -lod)
```

## Current authored package (R12 openface integration)

The canonical sources are `source/rider-street.blend`, `source/rider-openface.blend`,
`source/rider-race.blend`, and `source/bike.blend`. Street uses a visible human head and fitted
cotton/denim; openface adds compact original headgear to that body; Race uses the
compact helmet and fitted technical outfit. The bike source retains the rebuilt engine/body
and a translucent spinning-spoke card. Both garage bike classes share geometry and select
independent Rookie/Pro material variants.

These sources supersede procedural seeding for ongoing authoring. Do not regenerate them with
`build_rider.py` or `build_bike.py`. Export riders with the commands below; export the bike with
`blender -b --python-exit-code 1 --python assets/blender/bike_asset.py -- export` (add `--lod`
for reduced detail). All sources save `heroLocalAO` distance .025 m, samples 32, strength .8.
The standard exporters read that policy and pack AO into the existing ORM red channel.

The R10 promotion copied exact reviewed source/model bytes; it was not a new export. Runtime
audit files retain the original report path/hash and explicitly relabel the canonical source.
See `docs/evidence/hero-r10-promotion.json` for lineage. The R9 riders were retained because the
R10 extra garment/gear experiment did not demonstrate enough visible improvement.

Human base geometry/eyes and photographed cotton/denim are third-party inputs. Their provenance,
licenses and scope are preserved in `docs/evidence/hero-r9-inputs/THIRD-PARTY.md`; all needed images
are packed in the editable sources. Detailed recipes and immutable prerequisite hashes are in
that package and `docs/evidence/hero-r10-inputs/`. The source files are the durable authoring masters.

Visual quality still falls below the AI design targets. Actual iOS performance and the remaining
motion/contact issues are open; source promotion is not goal completion.

## Rider authoring and export

Create each source once, then edit its parts, material graphs, and actions in Blender. `seed`
refuses to overwrite an existing source. Only an intentional `seed --replace-source` replaces it.
Street, openface and race sources are separate; the selected outfit must match the source's saved metadata.

```sh
blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- seed --outfit street
blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- seed --outfit race
blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- export --outfit street
blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- export --outfit street --lod
blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- export --outfit race
blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- export --outfit race --lod
```

Omitting `--outfit` selects `street`. Runtime paths are `public/models/rider-street.glb`,
`rider-street-lod.glb`, `rider-openface.glb`, `rider-openface-lod.glb`, `rider-race.glb`, and `rider-race-lod.glb`. All families keep the
`rider_rookie` / `rider_pro` material variants, independently of the outfit selection.

Openface is an original headgear derivative of the packed Street source, authored with
`openface_candidate.py -- --output-dir <fresh-scratch-directory>` rather than `seed`.
Export its canonical source with `rider_asset.py -- export --outfit openface` (add `--lod`
for the companion file). Its selected preset is fixed charcoal (`rider_pro`), independently
of bike class. See [R12 provenance](../../docs/evidence/hero-r12-openface/README.md).

The authoring source retains separate material regions, procedural material graphs, packed image
dependencies, all eight actions, normalized weights, and a clean rest pose with animation disabled.
Export loads that file and never runs the geometry builder or saves over the source. It joins a
working copy, derives LOD by decimation, keeps the strongest four weights and normalizes them,
bakes the material variants, and exports the existing actions. Its generated `.blend` also packs
images, so it remains usable after the temporary bake directory is removed.

The runtime contract is 19 exact deform bones, eight named actions, one skinned draw, and two
material variants. Named empty sockets are retained. Extra deform bones, shape keys, Preserve
Volume skinning, and other unapplied modifiers require an explicit export/runtime change; the
pipeline rejects them. Keep the material graph's `BSDF` and `OUT` nodes used by the bake helper.

Every output is staged first. `verify_rider_asset.mjs` checks the GLB metadata, decodes the actual
meshopt vertex, index, skin, and animation data with the production loader, validates weight sums,
and enforces the 6,000-triangle LOD limit. Only verified files replace final destinations. Each
GLB has a `.source.json` report with source/output SHA-256 hashes and decoded counts. The source
hash is checked again after export, including failure paths. Node.js and the installed repository
dependencies are required; `--node` selects a Node executable.

For a scratch export, set `--source`, `--models`, `--textures`, and `--generated` to paths under
ignored `harness/out/`. `--size 256` is useful for pipeline checks; normal exports use 1024-pixel
atlases, or 512 for LOD. Run the headless source-protection and roundtrip checks with:

```sh
python3 assets/blender/test_rider_asset.py
```

These tests create both sources in ignored temporary directories, add an authored socket, export
full/LOD copies, inspect actual GLBs, and exercise overwrite, source-alias, invalid-weight,
outfit-mismatch, and post-export validation failures. They do not alter committed assets.

## Protected bike sources

`bike_asset.py` copies an authored full assembly into a protected source with
`adopt --input <authored.blend> --source <new-source.blend>`. It refuses replacement
of an existing source. The default protected path is `source/bike.blend`; Round 8
currently has only scratch candidates, so adoption is still pending visual review.

`export --source <source.blend>` derives full output; add `--lod` for a source-derived
LOD, with `--lod-tris 6000` by default. Use `--models`, `--textures` and `--generated`
for scratch destinations. Exports modify working copies only, preserve the 23 named
parts and attachment metadata, stage all files, and use the production Meshopt/GLTF
decoder before publication. The source hash must remain unchanged. Flexible chain,
hose and spoke/card topology are protected during LOD decimation.

Local crease occlusion is opt-in: call
`common.configure_local_ao(distance=0.025, samples=32, strength=0.8)` before export.
It packs same-object, short-range AO into the existing ORM red channel and exports
glTF occlusion using the same texture. Distance zero retains legacy export bytes.
This adds no image or draw but its visual strength requires played evaluation.

## Legacy rebuild and previews

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
Blender 5.2 at `/opt/homebrew/bin/blender`.
These legacy builder commands regenerate their outputs; `textures/decals.png` is rebuilt if absent.
Use the protected workflow above to preserve rider authoring edits.

## Budgets (measured)

Round 5 branch checkpoint (unfinished; see `docs/BLENDER_HANDOFF.md`): bike
30,460 triangles / 1,315,952 bytes; bike LOD 5,720 / 444,248; Street rider
9,269 / 784,284; Street LOD 5,879 / 474,960. Race full/LOD are unchanged from
Round 4; exact counts and hashes are in their `.source.json` reports. Normal
exports reproduce the parent-played scratch assets byte-for-byte.

`author_hood.py` creates the compact folded-back Street hood while preserving
all other geometry, rig, actions, sockets and materials. The protected Street
source now contains that accepted hood. `brake_hose` is a separate authored tube
with `hose_stations`, `hose_length`, `hose_segments` and `hose_radius` metadata.
Runtime bends instance-owned vertices at constant centerline length from fixed
guide to fork caliper. Clutch/throttle lines stay rigid to `handlebar`. This adds
one mesh and uses the existing mechanical material. Actual-model tests cover
full travel, deformation history, UV/topology preservation and disposal.

**The tables and construction notes below are legacy baseline documentation**;
inspect current masters and handoff before treating them as current measurements.

| file | tris | bytes (meshopt) | textures |
|---|---|---|---|
| `public/models/bike.glb` | 29 740 (wheels 6.6k + 7.2k incl. knobs, frame 3.1k, engine 2.1k, spokes 2 × 256, blur cards 2 × 128) | 1 180 724 | `bike_body_{rookie,pro}_albedo` 1024² JPEG, `bike_body_normal` / `_orm` 512², `bike_mech_albedo` 1024², `bike_mech_normal` / `_orm` 512², chain 64×32 PNG, spokecard 128² PNG |
| `public/models/rider.glb` | 11 108 (body 3.6k lofted, gear 7.5k)  5 666 verts  19 joints  8 clips | 865 088 | `rider_{rookie,pro}_albedo` 1024² JPEG, `rider_normal` / `_orm` 512² |
| `public/models/bike-lod.glb` | 5 824 (no knob geometry: the tread is in the normal map; 16 spokes) | 431 068 | same set at 512² albedo / 256² normal + ORM |
| `public/models/rider-lod.glb` | 4 804  2 498 verts, same bones / clips (detail 0.5, no collapse needed) | 464 152 | 512² albedo × 2 / 256² normal + ORM |

Hero pair 1.95 MB / 40.8k tris; LOD pair 0.86 MB / 10.6k tris. Normal + ORM are baked at half the
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

**Mesh (H1 round 2 — volume and silhouette on the same rig):** the body is lofted from measured
cross sections (`loft` / `limb` in build_rider.py), no skin modifier:

* **jersey shell** — 10 elliptical stations from a hem 6.5 cm *below* the belt (half-width 0.185,
  hanging over the pants shell: a real step, dark hem band) through waist 0.166, chest 0.192 /
  back 0.156 (back protector in the section), shoulder line 0.215 wide, traps, neck base;
* **pants shell** — crotch → seat → hips (0.17 half-width) → belt, inside the jersey;
* **arms** — one continuous 18-station tube per arm along shoulder→elbow→wrist (Catmull-Rom),
  radii keyed by arc length: 0.052 inside the shell, deltoid 0.080, bicep 0.071, elbow 0.060 with a
  0.078 guard bulge on the outside of the bend, forearm 0.058, wrist 0.046; sleeve material split at
  the elbow;
* **legs** — hip (0.104 lateral / 0.118 glute) → thigh 0.098 → knee 0.078 with a 0.100 knee-guard
  bulge forward and a 2.2 cm outward shift off the tank → calf 0.070 → into the boot shaft;
* **neck** — skin cylinder between the collar and the helmet;
* **helmet** — shell radius **0.172** (round 4: 0.14; the reference helmet is ~1.25× that head), a
  lathe with the lower half drawn in to the jaw (not a sphere), 200° chin bar flush at the cheeks and
  thrust 5 cm forward at the mouth with a half-buried vent, peak = a 118° annular sector above the
  goggles pitched nose-down, wrap-around goggle frame + proud mirror lens (torus sectors that follow
  the shell), strap, two brow scoops, rear spoiler; the shell is pitched 10° up on the head bone so
  the goggles face the track;
* gear as before with volume: neck brace collar (0.115 ring), gloves = a bevelled **fist** around
  the grip (no finger rings) + knuckle ridge + back plate + thumb + cuff and strap over the sleeve,
  boots with a flared shaft (0.066 → 0.079 at the top, over the pants), ankle bellows, foot block, toe,
  sole, heel cup, three buckles, coloured shin plate. Knee and elbow guards are volume under the
  fabric, not external braces.

Suit graphics are object-space in the bake materials as before (panels, chevron, yoke, sleeves,
seam stripe, hem, weave, grime, projected decals). **Cloth folds are in the normal map**
(`_folds`): sine creases ringing each joint (elbows, wrists, knees, crotch, hips, waist, armpits;
3–4.5 cm spacing, wobbled by noise, gated by distance to the joint) plus a low-frequency wrinkle
field, summed with the weave into one 3.5 mm bump — `rider_normal.jpg` went from 7 KB to 40 KB.

Weights: assigned per loft station — pelvis / spine / chest along the torso, `chest`→`upperArm`
over the first 10 cm of the arm, `upperArm`→`forearm` over ±5.5 cm at the elbow, `pelvis`→`thigh`
at the hip, `thigh`→`shin` over ±6 cm at the knee; rigid groups for helmet (`head`), gloves
(`hand.*`, cuff 70/30 with `forearm.*`), boots (`foot.*`, shaft `shin.*`), collar (`chest`). Checked
in previews/rider-poses.png: no tearing at armpits / knees / elbows in any of the 8 clips (hang_back
knees at 85°, sit_cruise 104°). The rig, rest pose, bone table, clips and variant names are
byte-identical to round 4 (checked field by field against the HEAD glb) and `pnpm vitest run
src/render` (hands on the grips, 16 tests) passes.

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
* Round-2 body: the jersey hem, sleeve cuffs, boot tops and glove cuffs are geometry now, but the
  chin bar is still a torus sweep (a bulge, not a sculpted jaw), the neck brace a plain ring, the
  fist a bevelled block, and the limbs are single tubes — the far elbow / knee crease in a deep bend
  is a smooth fold, not a real crease. Still no fingers, no morphs, no facial anything.
* Bike: no headlight (trials bikes do not have one), no brake lines/cables; the bake margin is 4 px,
  so a few island edges show a dark seam on the LOD at 512².
* Decal sheet is 1024² for 14 cells: the 4-tile logo strips are ~460 px wide, so a 3 cm sponsor
  (boot plate, fork guard) is legible only in the garage view.
