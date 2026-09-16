# Final hero bike candidate package

Editable master: `source/bike.blend`.
Derived runtime files: `models/bike.glb`, `models/bike-lod.glb`.
Packed generated Blender copies: `generated/`.
Baked texture files: `textures/`.

The master stores `heroLocalAO` JSON: distance 0.025 metres, 32 samples, strength 0.8. `bike_asset.py` validates and reads these settings. Old sources without this field explicitly export with AO disabled; no process-global wrapper is needed.

## Reproduce from this source

From repository root:

```sh
blender -b --python-exit-code 1 --python assets/blender/bike_asset.py -- export \
  --source harness/out/blender/mega-bike/final-candidate/source/bike.blend \
  --models harness/out/blender/mega-bike/final-candidate/models \
  --textures harness/out/blender/mega-bike/final-candidate/textures \
  --generated harness/out/blender/mega-bike/final-candidate/generated

# Same command with --lod added produces the LOD.
```

For adopting a different authored source, `adopt --input INPUT --source NEW_SOURCE --ao-distance .025 --ao-samples 32 --ao-strength .8` persists the selected AO policy on a new copy. Existing sources are never replaced by adoption. Export rejects AO command-line overrides so saved source policy remains authoritative.

## Verified output

| Asset | Triangles | Bytes | SHA-256 |
|---|---:|---:|---|
| Full | 29,940 | 1,414,848 | f18bfc01cb478a79555a2c4096342fe0b827670271f6c8ce7e0c3d42a1cb33d2 |
| LOD | 5,710 | 506,428 | 7a31cd455aba85cfccaf08e0dccd740d7a21a89dd8281b3865d50e02e7d10fa3 |

Source SHA-256: `498c778ae2e496fd0d9af2a71a27340c0173117951a50d1ea6f15e1007b49025`.

- Source hash unchanged by both exports.
- Full decoded vertex attributes and embedded image bytes are identical to the parent-played AO candidate; only packaging metadata differs.
- LOD decoded vertex attributes match the prior source-derived LOD exactly. This finishing task introduced no geometry change.
- Production GLTF/Meshopt decoder passes exact node names, custom metadata, finite positions/UVs/indices and transforms. Both have 23 mesh primitives, 9 images and 11 texture objects.
- All three atlas materials use the same texture index for occlusion and metallic/roughness.
- Both retain material variants, mechanical anchors, chain/hose topology and deformation metadata.

Evidence: `validation.json`, `package-verification.json`, and `models/*.source.json`. Parent still owns played LOD review and promotion. No canonical source/public model has been changed by this package preparation.
