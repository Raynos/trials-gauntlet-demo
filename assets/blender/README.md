# Blender hero assets: rider + bike (glTF)

This directory builds the two glTF assets the render can load instead of the procedural
Three.js bike/rider, to be compared side by side by a blind critic. Everything is generated
by Python from scratch on every run (no hand-edited .blend); the .blend files are outputs.

```
assets/blender/
  common.py        primitives (lathe/tube/loft/box), material helpers, UV atlas, Cycles bake, export
  build_bike.py    -> public/models/bike.glb   + bike.blend, textures/bike_*.jpg, bike.stats.txt
  build_rider.py   -> public/models/rider.glb  + rider.blend, textures/rider_*.jpg, rider.stats.txt
  preview.py       Eevee renders of the EXPORTED .glb files -> previews/*.png
  textures/        baked atlases (JPEG) + chain_links.png + rider_number.png
  previews/        bike-turntable.png, rider-turntable.png, rider-poses.png, composite*.png
```

## Rebuild

```
blender -b --python assets/blender/build_bike.py            # ~4 s incl. 2048 bake (CPU Cycles, 1 spp)
blender -b --python assets/blender/build_rider.py           # ~3 s incl. 1024 bake
blender -b --python assets/blender/preview.py -- all        # ~1 min; add --quick for 8 spp
```
Options after `--`: `--no-bake` (flat materials, fast), `--size N` (atlas px), `--no-meshopt`,
rider only: `--decimate 0.55` (body collapse ratio). Blender 5.2 at `/opt/homebrew/bin/blender`.

## Budgets (measured)

| file | tris | bytes | textures |
|---|---|---|---|
| `public/models/bike.glb` | 29 356 (both wheels 14.3k, frame 3.1k, engine 2.1k) | 1 348 068 (meshopt) — 1.89 MB without meshopt | albedo 2048² JPEG, normal 1024², ORM 1024², chain 64×32 PNG |
| `public/models/rider.glb` | 11 578 (body skin 2.9k + gear 8.6k), 5 880 verts, 19 joints, 8 clips | 860 104 (meshopt) — 1.22 MB without | albedo / normal / ORM 1024² JPEG |

Both files use **`EXT_meshopt_compression`**: three.js needs
`loader.setMeshoptDecoder(MeshoptDecoder)` with
`import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'` (ships with
three, no extra public files). Rebuild with `--no-meshopt` if you would rather not.

One material per asset (`bike_atlas`, `rider_atlas`) = one draw per mesh; PBR metal/rough, ORM packed
glTF-style (R unused=1, G roughness, B metallic). The chain has its own `chain_links` material.

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
| `fork_lower` | (1.30, 0, 0) = front axle | slides | `position = frontAxleLocal`, rotation identity (rake 23.75° from vertical is baked in: the sliders point from the axle toward `headBottom`). Sliders are 0.42 long, stanchions overlap them so any travel 0–0.15 m looks right. |
| `swingarm` | (0.43, 0.10, 0) = `swingPivot` | rotates | `rotation.z = atan2(ra.y-0.10, ra.x-0.43) - atan2(-0.10, -0.43)` (rest angle -2.913 rad; the rest arm points at the rear axle) |
| `shock_body` | (0.60, 0.52, 0) = `shockTop` | rotates | local **-y runs down the shock** from the top mount to the swingarm link (link = pivot + 0.55·(axle-pivot) + (0, 0.03)); rest length **0.6027**. Set `quaternion.setFromUnitVectors((0,-1,0), dir(top→link))` (the exported rotation is exactly that for the rest link). |
| `shock_spring` | same as `shock_body` | rotates + scales | same quaternion; the coil occupies local y ∈ [-0.05, -0.38], so `scale.y = len / 0.6027` keeps it seated at the top; clamp 0.55–1.25 like the procedural one. |
| `wheel_front` | (1.30, 0, 0) | spins | `position = frontAxleLocal`, `rotation.z = spin` in the physics' CCW convention (a wheel rolling toward +x turns clockwise seen from the camera, i.e. a decreasing angle; if it visibly counter-rotates, negate) |
| `wheel_rear` | (0, 0, 0) | spins | same; `sprocket_rear` is its child and spins with it |
| `sprocket_rear` | (0, 0, 0.092) child of `wheel_rear` | — | r 0.105, 42 teeth |
| `sprocket_front` | (0.47, 0.135, 0.105) | spins | r 0.036, 11 teeth; `rotation.z = -spin · 0.101/0.033` if you bother |
| `chain` | (0,0,0) | frame | UV u is in **link units** (1 link = 0.0127 m); scroll `material.map.offset.x = (rearSpin · 0.101) / 0.0127` (wrap REPEAT is set). Runs rear sprocket (r 0.101) → front (r 0.033) at z = +0.092. |

Wheel construction: tyre carcass with 3 rows of geometric knobs (30/26 per row), channel-section
rim (front 21" r 0.262 / rear 18" r 0.228), 32 cross-2 spokes, hub, 6-arm rotor carrier,
brake disc r 0.105. Front tyre 0.078 wide, rear 0.112.

Materials baked into the atlas: metallic blue paint with Pointiness edge wear + flake, brushed
alloy (swingarm/rims/hubs/clamps/bar), cast alloy (engine), black anodised (fork lowers, pegs,
clamps), gold anodised stanchions, rubber (noise bump), heat-tinted steel header, grippy seat,
white plates, red anodised accents (chain guide, calipers), rotor steel.

## rider.glb — skeleton, rest pose, actions

Nodes: `rider_rig` (armature; the bone nodes hang under it) and `rider` (skinned mesh, one
primitive, material `rider_atlas`). Skin = 19 joints, ≤ 4 influences per vertex.

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
Rest pose = the render's attack chain (`poseRider` at lean 0, crouch 0, torsoPitch 0, armExtend 0;
physics.md §7.7), evaluated in the file frame. Rest head → tail positions (x, y_up, z_camera),
metres, file frame (rear axle origin) — for `.R` negate z:

| bone | head | tail | length |
|---|---|---|---|
| pelvis | (0.518, 0.724, 0) | (0.588, 0.821, 0) | 0.120 — head sits 0.02 below the hip joint (0.530, 0.740) along the torso axis |
| spine | (0.588, 0.821, 0) | (0.693, 0.968, 0) | 0.180 |
| chest | (0.693, 0.968, 0) | (0.821, 1.147, 0) = shoulders | 0.220 |
| neck | (0.821, 1.147, 0) | (0.837, 1.236, 0) | 0.090 |
| head | (0.837, 1.236, 0) | (0.876, 1.452, 0) | 0.220 — head centre (chain) = (0.855, 1.339) |
| shoulder.L | (0.821, 1.137, 0.040) | (0.821, 1.147, 0.200) | 0.160 (clavicle) |
| upperArm.L | (0.821, 1.147, 0.200) | (1.080, 0.997, 0.300) = elbow | 0.316 (0.30 in XY + the 0.10 z spread) |
| forearm.L | (1.080, 0.997, 0.300) | (0.920, 0.780, 0.330) = grip | 0.272 |
| hand.L | (0.920, 0.780, 0.330) | (0.867, 0.708, 0.340) | 0.090 (continues the forearm; fist is closed round the bar axis z) |
| thigh.L | (0.530, 0.740, 0.090) | (0.825, 0.413, 0.160) = knee | 0.446 |
| shin.L | (0.825, 0.413, 0.160) | (0.520, 0.110, 0.200) = ankle | 0.432 |
| foot.L | (0.520, 0.110, 0.200) | (0.710, 0.035, 0.200) | 0.204 (boot sole sits on the peg at y 0.02) |

Torso direction at rest = 0.62 rad forward of +y; head direction 0.179 rad.

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
| `stand_attack` | 1–30 (0.97 s) | rest pose held (lean 0, crouch 0) |
| `hang_back` | 1–30 | rest → full lean-back at f15 (hips over the rear axle, arms straight, `lean = -1` chain) → hold |
| `forward_attack` | 1–30 | rest → over the bars at f15 (`lean = +1`) → hold |
| `crouch` | 1–30 | rest → hop preload at f15 (`crouch = 1`: hips -0.28 m, torso folds 0.35 rad) → hold |
| `extend` | 1–20 (0.63 s) | starts crouched → legs pushed straight at f8 (`crouch = -0.35`, arms extended) → settle f20 |
| `land_absorb` | 1–30 | starts extended → deep compress at f8 (`crouch 0.9`, lean -0.3) → rest at f30 |
| `idle_breathe` | 1–121 (4.0 s loop) | rest ± 3 cm crouch, ±0.015 rad torso, arm flex; cyclic |
| `sit_cruise` | 1–30 | rest → seated on the seat top (hips (0.33, 0.64), torso 0.30 rad, feet on pegs, hands on grips) at f15 → hold |

The chain parameter sets used for every key are in `build_actions()`; `chain()` in build_rider.py
is a line-for-line port of `poseRider` (hang-off pinned shoulders, leg slide, reach slide, head
0.45·torso − 0.1), so the clips agree with the procedural model's joints to the millimetre.

**Mesh:** body = skin-modifier stick figure (27 verts, per-vertex radii) + subdivision ×2, collapsed
to 0.55 (≈2.9k tris, continuous surface through hips/shoulders); gear merged into the same mesh:
helmet (shell, chin bar, mouth vent, peak, goggle frame + mirrored lens, strap, rear vent), neck
brace, collar, back-protector hump, shoulder caps, gloves (4 finger rings, palm, thumb, cuff +
strap), boots (shaft, foot, toe, sole, heel cup, shin plate, 3 alloy buckles), knee braces (cup,
shell, 2 hinges), number decals (back 0.20 m, chest 0.13 m; texture `rider_number.png` via a
second UV set `UVNum`, baked into the atlas). Materials: `bodycloth` (jersey yellow above the belt
plane, dark-blue pants below, dark hem, dark side panels, white chest band, diagonal weave bump),
gloss blue helmet with white centre stripe, black gloves/boots/armour, alloy buckles.

Weights: envelope blend (influence 1/(d/r)^4 over each bone segment, top 4, normalised) for the
body skin; rigid groups for helmet (`head`), gloves (`hand.*`, cuff 70/30 with `forearm.*`), boots
(`foot.*`, shaft `shin.*`), knee braces 50/50 `thigh.*`/`shin.*`, hump/collar/decals (`chest`).
Checked in previews/rider-poses.png: no tearing at armpits/knees in any of the 8 clips.

## Previews (assets/blender/previews)

* `bike-turntable.png` — side (yaw 20°, pitch 15°), front 3/4, rear 3/4, top.
* `rider-turntable.png` — same 4 views of the rest pose.
* `rider-poses.png` — one frame of each of the 8 actions.
* `composite.png` — rider on bike at the reference camera (yaw 20°, pitch 15° down).
* `composite-25pct.png`, `composite-40pct.png` (1280×720) and `composite-gamesize.png` (centre crops
  ×2) — the pair at the game's ~25 % and ~40 % frame-height sizes; judge at these.

Lighting in previews: one 4 W/m² sun + fill, AgX; the game's own grade will differ.

## Known limits / next steps for a second pass

* Body proportions are the render's chain (deep attack crouch, hips 0.74 above the axle line);
  a taller stance is one number in `chain()` if the physics chain moves.
* Normal maps are subtle (JPEG, 1024²); most surface read comes from albedo + roughness.
* No morph targets, no facial anything (helmet + goggles); no separate visor object.
* Bike: no headlight (trials bikes do not have one), no brake lines/cables.
