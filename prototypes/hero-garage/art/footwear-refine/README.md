# Footwear source refinement

Run from repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python prototypes/hero-garage/art/footwear-refine/build.py
python3 prototypes/hero-garage/art/footwear-refine/verify.py
```

Protected source: `assets/blender/source/rider-street.blend`. Editable output: `footwear-refined-source.blend` (procedural materials and atlas UVs before bake replacement). Output: `public/assets/street01-footwear-refined.glb`.

Upper subdivided and sole bevelled, then per-foot object extents restored exactly. Existing reinforcement, welt, toe details and foot-only laces remain; hoodie drawcords excluded. Neutral grey upper, suede quarters, ivory sole and laces have lossless 1K albedo, normal and ORM bakes. No downloaded content or new licenses.

Parent merge must remove the original four source subsets identified by `source-removal-triangles.json` before inserting this candidate. Triangle positions use Blender Z-up source coordinates; protected source has no UVs. Match original positions against a baked source to recover atlas UV correspondence if needed. The original19joint rig is exported with source8animations solely to retain glTF skin data. Parent retains its accepted six animation clips, not these source clips.

Static verification covers every exported vertex, finite positions, single foot-bone weighting and PNG textures. Full assembled motion review and visual acceptance remain parent-owned; no quality acceptance claimed here.
