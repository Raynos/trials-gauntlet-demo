# Smooth wrist rib boundary candidate

Uses `art/sleeve-shape-final/sleeve-source.blend` (accepted stage39 inner-shell repair) as immutable source. The old rib material's boundary traversed irregular triangles, creating a stepped colour boundary. Each wrist's 44 authored transition edges establish a median boundary plane perpendicular to its rest forearm. A 2 mm smooth transition is rasterized through the existing evaluated UVs onto the accepted cotton atlas. Existing darker rib colour and roughness remain inside that band. Six texels of island padding prevent texture seam whitening. The waist and pocket retain their original rib material.

Only 624 cuff polygon material assignments and local cuff albedo/roughness pixels change. `geometry-verification.json` compares every exported triangle against the stage39 donor: positions, normals, UVs, joints and weights are exactly identical for all seven nodes. The assembler preserves the incoming animation, skin and original binary prefix; no contact geometry or motion changes.

From repository root:

```sh
ART_IMAGE_PYTHON=/path/to/python-with-numpy-and-pillow /Applications/Blender.app/Contents/MacOS/Blender -b --python prototypes/hero-garage/art/cuff-band-final/build.py
/path/to/python-with-numpy prototypes/hero-garage/art/cuff-band-final/assemble.py -- --base prototypes/hero-garage/public/assets/street01-rider-sleeve-shape-final-study.glb --out prototypes/hero-garage/public/assets/street01-rider-cuff-band-final-study.glb
/path/to/python-with-numpy prototypes/hero-garage/art/cuff-band-final/verify.py
```

`ART_IMAGE_PYTHON` currently defaults to `/tmp/fs-venv/bin/python`, the existing local image environment. No new dependencies are downloaded. Parent visual approval is required. This is a material transition, not a newly modeled seam.
