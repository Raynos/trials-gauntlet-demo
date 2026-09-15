# R10 Race construction candidate

One integrated review source: `race-surface-v2.blend`. Full and LOD models are in `models/`. Parent must judge played motion; these checks do not imply visual acceptance.

## Changes

- Twelve physically inset crown vent cells, 3 mm deep, with dark floors and retained shell rims. Enamel roughness .30, eyeport polymer .48, soft foam/strap .88, smoke lens .13 roughness/.12 metallic. Existing class colors and authored shell graphics retained. The lens is opaque tinted reflective material within the current single-draw baked renderer, not transparent glass.
- Four compact aluminium buckle frames and latch bars seat over existing boot closures. Low-profile sole/shin edge construction follows existing material boundaries. Base boots, sole contact plane, all base vertices/weights and pants remain exact; no invented large tread or enlarged boots.
- Unequal localized diagonal waist and inside-elbow jersey tension folds, maximum displacement 1.96 mm. Low-profile stitched panel edges follow garment boundaries and carry original local bone weights. Existing calm 0.5 mm technical knit micro-normal and class palette are retained. No diffuse dirt/noise or repeating radial folds were added.

Helmet head-axis extents remain exactly **31.062 × 23.672 × 27.200 cm**, including peak. Human face and eyes remain unchanged. Added seams are authored construction geometry, not scanned clothing. Original source material graphs remain unchanged; helmet variants use local material copies.

## Verification

`race-surface-v2.json`: exact rig/actions/sockets invariant; fixed geometry/weights/material assignments for boots, pants, knee construction, gloves, human head/eyes; 24 action samples with finite evaluated geometry and zero helmet/human crossings. Original source SHA remains unchanged. Changed meshes have zero degenerate faces.

`focused-checks.json`: unchanged compact helmet bounds; zero additional detail/human surface crossings at rest. Manufactured seam, buckle and gasket overlaps with their host surfaces are deliberate. This is not a complete garment self-collision simulation.

Standard exporter decoder checks passed for both models: 19 bones, eight clips, two variants, normalized skin weights and one skinned draw. Saved source AO policy is `{"distance":0.025,"samples":32,"strength":0.8}`. `ao-bindings.json` verifies the AO and metallic/roughness references use the same packed ORM texture for each class; four embedded images per model.

| Model | Triangles | Bytes | SHA256 |
|---|---:|---:|---|
| Full | 51,996 | 1,736,300 | `c3b5aec7b20ef808d7cbba4e6e6308a5a91f9c545a0f64e839df3bb7fdc485b0` |
| LOD | 5,871 | 616,700 | `7fd860d0a56c1c8503af6ef615e3c5363274ea5273dfc50910e1b03acb146190` |

Source SHA256: `7cc326b400630bb3b4fecb7b5c2829e0fd92a470db9fa6dd31387610b5c34d51`.

## Reproduce from repository root

`build.py` requires a fresh output path; it reads the R9 packed source `harness/out/blender/race-head/finished-race/race-assembled-v1.blend`. Preserve this immutable input. To rebuild an existing candidate, set `OUT` to a fresh scratch name, then point export/check commands to that name.

```sh
blender -b --python-exit-code 1 --python harness/out/blender/hero-r10-race/build.py
blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- export --outfit race --source harness/out/blender/hero-r10-race/race-surface-v2.blend --models harness/out/blender/hero-r10-race/models --textures harness/out/blender/hero-r10-race/textures --generated harness/out/blender/hero-r10-race/generated
blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- export --outfit race --lod --source harness/out/blender/hero-r10-race/race-surface-v2.blend --models harness/out/blender/hero-r10-race/models --textures harness/out/blender/hero-r10-race/textures --generated harness/out/blender/hero-r10-race/generated
blender -b --python-exit-code 1 --python harness/out/blender/hero-r10-race/check_source.py
```

No third-party assets were added in this pass. Inherited anatomical geometry provenance and precise CC0 versus separate Rain Rig license scope are recorded in `docs/evidence/hero-r9-inputs/THIRD-PARTY.md`. No canonical files were modified.
