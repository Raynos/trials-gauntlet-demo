# Assembled Race jersey candidate

Editable source: **race-assembled-v1.blend**. Standard full and LOD: **models/rider-race.glb**, **models/rider-race-lod.glb**.

The Race jersey now uses the fitted connected anatomical torso/arm shell from `street-head/finished-street/street-assembled-v3.blend` on the identical rig. Slightly reduced jersey ease brings the sampled upper-arm maximum radius from **7.13 to 6.42 cm**. It adds no periodic folds, radial padded bands or primitive sleeve shells. No Street hood, pouch, hair or garment details were imported. Obsolete upper torso armour, bulky jersey and upper-only panel extras were removed.

A blue torso with white forearm/side panels distinguishes Rookie; Pro uses charcoal with yellow panels. Dark underarm/inside-elbow stretch regions and close collar/cuffs finish the construction. These are material assignments on the continuous garment surface. Class palettes use new jersey-only CW keys; existing helmet/pants/boot/glove keys are unchanged. The shader has flat class albedo, matte cloth roughness and a restrained **0.5 mm knit micro-normal** (0.03 mm bump distance, strength 0.12), with no diffuse noise, dirt or fake print. This is a defined procedural knit scale, not a claim of scanned polyester.

Compact anatomical Race headgear, human face/eyes/neck, pants, articulated boots, knee construction and gloves retain their exact mesh/weight/material-assignment signatures. All original material graphs, bones/rest matrices, actions and sockets were checked unchanged before standard class application. Both source inputs remain immutable.

## Checks

- Connected jersey: zero degenerate faces and zero nonmanifold interior edges.
- 24 samples across eight actions: finite evaluated jersey vertices.
- Production decoder checks passed for full and LOD: 19 bones, eight clips, two class variants, normalized skin weights.
- Saved `heroLocalAO` JSON: `{"distance":0.025,"samples":32,"strength":0.8}`. Both exports used this source policy through the standard exporter.
- Both exports have four images; each class material's occlusionTexture and metallicRoughnessTexture refer to the same packed ORM texture (`ao-bindings.json`).

| Export | Triangles | Bytes | SHA256 |
|---|---:|---:|---|
| Full | 44,796 | 1,514,536 | `f660ac40b063d2a317502c27827dca834c4d9efd32751c1a54efa3e4dbc12c33` |
| LOD | 5,877 | 571,952 | `e095ee00a701cf806d875f1725c4fcc536a6676eeb1db5879f36967de6894aab` |

Source SHA256: `55e182127b465ded031c618f1ea56d37e5ae1134bdd44ae838d7fc7bce58a8c2`.

## Reproduce

`build.py` reads immutable inputs and requires a fresh `OUT`; set a fresh output name for reruns. Then:

```sh
blender -b --python assets/blender/rider_asset.py -- export --outfit race --source harness/out/blender/race-head/finished-race/race-assembled-v1.blend --models harness/out/blender/race-head/finished-race/models --textures harness/out/blender/race-head/finished-race/textures --generated harness/out/blender/race-head/finished-race/generated
blender -b --python assets/blender/rider_asset.py -- export --outfit race --lod --source harness/out/blender/race-head/finished-race/race-assembled-v1.blend --models harness/out/blender/race-head/finished-race/models --textures harness/out/blender/race-head/finished-race/textures --generated harness/out/blender/race-head/finished-race/generated
```

This is one coherent whole-Race review candidate, not a canonical promotion or visual acceptance claim. Parent must play and judge it.
