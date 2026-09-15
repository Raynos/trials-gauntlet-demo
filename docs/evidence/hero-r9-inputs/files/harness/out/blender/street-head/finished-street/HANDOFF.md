# Assembled Street candidate — target1 provisional, parent played review pending

## Files

- Editable source: **street-assembled-v3.blend** (saved AO policy plus geometry/materials identical to v2).
- Immediate full preview: **models-final/rider-street.glb** (AO wrapper export from v2; same appearance as v3).
- **Final standard full/LOD exports: `models-standard/rider-street.glb` and `models-standard/rider-street-lod.glb`.**
- Reproduction: `build.py` from immutable `../street-head-v1.blend`, then `save_ao_policy.py`; both require fresh output names. Use the standard rider exporter with v3 afterward.

## Whole-character assembly

The accepted23.34cm anatomical face/head remains unchanged. The torso/arms now use a slimmer set-in sweatshirt envelope on the same connected anatomical topology and skin weights: source shoulder radius10.07→7.13cm, confirmed against the actual decoded played pose as10.10→7.27cm. The forearm maximum drops6.42→5.54cm; joint positions and the32/27cm arm lengths remain unchanged. Hem/collar fit, a refitted functional front pouch and true rear jean pockets establish garment construction. Modest folds replace the earlier padded rings.

Photographed [Cotton Jersey](https://polyhaven.com/a/cotton_jersey) and [Denim Fabric03](https://polyhaven.com/a/denim_fabric_03), photographed by colormass and processed by Rico Cilliers, supply measured-scale micro normal and roughness through the shared scratch helper. Their26.37/27.12cm tile dimensions are respected. The class-color albedo graph remains independent of outfit. Images are packed in the editable source; license/hashes live in `harness/out/blender/hero-fabrics/license-manifest.json`.

A tight scalp surface and modest directional short-hair clumps add actual silhouette and surface shape. Measured chin-to-hair-crown is **23.73cm**; this does not recreate an oversized headgear shell. Actual face, lips, ears, eyes and neck are retained. Bareheaded remains provisional; compact open-face gear can fit this same foundation later.

## AO and source policy

`heroLocalAO` is saved as JSON `{distance:0.025,samples:32,strength:0.8}`. It bakes short-distance occlusion into the existing ORM red channel. Both exported class materials bind their occlusionTexture to the same ORM texture as metallicRoughnessTexture. Full output still has only4 images, with no separate AO texture/draw.

## Checks

- Every source mesh: zero degenerate faces and zero nonmanifold interior edges.
- Original rig/rest matrices/actions/sockets and all non-cloth/non-hair geometry/weights compare unchanged; `street-head-v1.blend` remains immutable.
- Actual production decoder:19 bones,8 clips,2 class variants, normalized skinning weights.
- Actual frame40 production-pose reproduction confirms smaller sleeve envelope around unchanged joints (`posed-arm-fit.json`).
- Full:44,734 triangles /1,488,216 bytes. SHA-256 `5a9a8f35782420dcdc62e2e44872cb3eb067e7af3af4d1b8502bc27859f8b481`.
- Source v3 SHA-256 `673617def879f5615a4ea72120705fd5be2c7e77d694d474bd30fae3d2971220`.

This remains a scratch review candidate, not a canonical promotion, visual win or mobile performance verdict. Parent judges the assembled played footage; no physics/pose tuning changed. Earlier assembled v1 is an internal hair-winding check and is superseded; use v3 source and the paths above.


## Standard full/LOD export verification

The final standard full export matches the earlier played-review candidate's **decoded vertex/index attributes, skin/bind data, all animation tracks, embedded JPEG images and material bindings exactly**. Its only JSON difference is saved `scenes[0].extras.heroLocalAO`; that metadata changes the container SHA-256. See `standard-comparison.json` and `metadata-difference.json`.

| asset | triangles | bytes | SHA-256 |
|---|---:|---:|---|
| standard full |44,734 |1,488,288 |`df6f3d4cf513dc9df54da0f95a656e8bdbec6bcfe5691da9a05c22a03d300853` |
| standard LOD |5,880 |549,956 |`f6772e5459a5cb0b13a01e688dd6013f6cc8a8801af1ca067a4de5190d20e45e` |

Both passed the actual production decoder and retain19 bones/eight clips/two class variants. Both source reports match the unchanged v3 source SHA-256 exactly and record the saved AO policy. LOD is newly derived and requires its own parent played review.

Standard reproduction (add `--lod` for the second file):

```sh
blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- export --outfit street --source harness/out/blender/street-head/finished-street/street-assembled-v3.blend --models harness/out/blender/street-head/finished-street/models-standard --textures harness/out/blender/street-head/finished-street/textures-standard --generated harness/out/blender/street-head/finished-street/generated-standard
```
