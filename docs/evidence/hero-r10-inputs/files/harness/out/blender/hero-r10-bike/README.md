# R10 spoke blur source candidate

## Finding

The accepted source has 32 spokes, diameter 3.6 mm. Their time-integrated projected circumference coverage is approximately `32 * .0036 / (2*pi*radius)`: about 8–15% across the visible outer/middle annulus. The prior blur image used 30–60% alpha per card. There are two authored annular surfaces, and runtime multiplies opacity by .9, giving approximately 47–79% combined opacity. Its bright radial stripes therefore read as a solid fan.

## One bounded correction

`author-spoke-card.py` copies the accepted protected source and replaces only the shared spoke-card RGBA image. Alpha follows radial spoke coverage, compensating for two surfaces and the existing .9 runtime factor. Color is uniform aluminium gray, with only small angular alpha variation rather than bright fan wedges. The texture uses the midpoint front/rear rim normalization (.245 m), so the shared image approximates each wheel within about 7% rather than requiring separate materials. Geometry and renderer are untouched.

The original source hash remains unchanged. New editable source: `source/bike.blend`. Full/LOD are generated with ordinary `bike_asset.py export` commands; saved AO policy remains intact. No export wrapper is needed.

```sh
blender -b --python-exit-code 1 --python assets/blender/bike_asset.py -- export \
 --source harness/out/blender/hero-r10-bike/source/bike.blend \
 --models harness/out/blender/hero-r10-bike/models \
 --textures harness/out/blender/hero-r10-bike/textures \
 --generated harness/out/blender/hero-r10-bike/generated
# Add --lod for LOD.
```

## Validation

- Full: 29,940 triangles, 1,394,072 bytes, SHA `7f849529195be0acb0f3031ee0defbfb6a4c93519cf7e235042757f0f94cedec`.
- LOD: 5,710 triangles, 485,656 bytes, SHA `007a9069412f899b8548429be499f5b82a54ea2e3e33022392a7228f1d4f2081`.
- Production-decoded vertex attributes match accepted full/LOD exactly; exact node names, zero marker displacement, all finite data.
- Every embedded image except the spoke card is byte-identical to the corresponding accepted asset.
- Counts unchanged: 23 mesh primitives, 5 materials, 9 images, 11 texture objects. Card retains glTF BLEND.
- Source hash unchanged by full and LOD exports.

Evidence: `coverage.json`, `validation.json`, `texture-validation.json`, `models/*.source.json`. Parent owns played wheel-speed/low-speed comparison. This candidate does not change hub, rim, rotor, tyre or actual spoke geometry.
