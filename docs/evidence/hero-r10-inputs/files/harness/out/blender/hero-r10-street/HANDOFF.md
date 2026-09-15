# R10 Street garment surface candidate — one coordinated pass

Review **models/rider-street.glb** and **models/rider-street-lod.glb**. Editable source: **street-r10-v1.blend**; reproduction script: **build.py**. Nothing was promoted or changed outside this scratch directory.

## Scope and construction

The accepted face, hair, anatomy proportions and pose remain the foundation. This pass adds only garment surface/construction:

- A few tapered asymmetric compression creases localized to the elbow, waist and knee. They follow seam/compression directions and stop around the surface rather than making periodic padded rings.
- One sewn folded-edge treatment at each actual collar/cuff/hem opening; the existing connected turned edges remain intact.
- The existing front pouch and rear pockets follow their parent cloth deformation with exact original topology/weights.
- Broad restrained crease/seam/worn-knee tone and roughness variation complements the already packed photographed cotton/denim micro surfaces. Attribute zero is neutral on other material users. Existing independent class-color graphs and saved short-range AO remain intact.

Maximum original-surface displacement: **cotton4.27mm, denim2.75mm**. The pass does not rescale the silhouette or alter the skeletal pose. This is a surface-finish candidate, not another anatomy rebuild or lighting change.

## Verification

- Exact original vertex weights compare equal for every pre-existing mesh.
- Face/hair/non-garment geometry, rig/rest matrices, actions, sockets and contact geometry compare unchanged.
- Every source mesh has zero degenerate faces and zero nonmanifold interior edges.
-24 source clip/frame deformation samples are finite.
- Both standard exports pass the production meshopt decoder:19 bones,8 clips,2 class variants, normalized weights, one skinned primitive.
- Both keep4 embedded images, with occlusion sharing the existing ORM; saved AO policy remains2.5cm/32 samples/0.8 strength.
- Both `.source.json` files match the unchanged editable source SHA-256.

| output | triangles | bytes | SHA-256 |
|---|---:|---:|---|
| full |47,838 |1,575,688 |`45b228d094234adcd0d08d2bd2a1429678f7adf29426b84b75555ed090d385ae` |
| LOD |5,879 |555,996 |`1ec3ba061c2c194e368917bfab75a9f88792e6b3f0a4949927f85cb5ab5dbd06` |

Source SHA-256: `230ac42c9195ade85bc4c225d4c5b777332a6b85c042f57e2a6f839bebc714bd`.

## Reproduce

`build.py` reads immutable `street-head/finished-street/street-assembled-v3.blend` and refuses an existing output; choose a fresh `OUT` for a replay. Export through the standard pipeline, adding `--lod` for the second file:

```sh
blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- export --outfit street --source harness/out/blender/hero-r10-street/street-r10-v1.blend --models harness/out/blender/hero-r10-street/models --textures harness/out/blender/hero-r10-street/textures --generated harness/out/blender/hero-r10-street/generated
```

This is technical verification, not a visual acceptance or a claimed improvement against the reference. Parent must judge the combined full/LOD normal-camera and close played result. No further pass is implied by this handoff.
