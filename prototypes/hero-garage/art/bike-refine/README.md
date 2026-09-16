# Bike finish candidate

From repository root run Blender with `--background --python prototypes/hero-garage/art/bike-refine/build.py`. This reads the protected authored bike and baked materials scene, verifies exact polygon correspondence, assigns blue clearcoat to 86 front-fender polygons and satin dark aluminium to 196 engine-edge polygons. Geometry, object matrices, parent relationships and source files are asserted unchanged. The original baked textures remain on all other surfaces. Both existing colourway mappings are retained; the front fender stays blue for this target01 candidate.

Editable result: `bike-refined.blend`. Runtime result: `public/assets/street01-bike-refined.glb` (6.06 MB). Separate materials add two draw calls and turn engine/fork_lower into glTF multi-primitive groups; suspension operates on the parent transforms and has been tested successfully.

From prototype root run `node --experimental-strip-types art/bike-refine/verify.mjs`. It checks 101 suspension samples, exact neutral restoration, tyre bounds and grip/sole distance preservation through 18 clip/time samples against the existing garment-repair rider. It is not the new dense rider appearance gate. Parent must judge a recorded whole-scene orbit before adoption. Catalog and active assets are untouched.
