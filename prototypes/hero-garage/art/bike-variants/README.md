# Upgraded existing bike liveries

The repository defines **two** bike identities, Rookie and Pro, in `src/render/bike/livery.ts`, `assets/blender/build_bike.py`, and `assets/blender/author_bike_hero.py`. Five existing outfits do not imply five authored bike skins. No additional palettes were invented.

- `public/assets/variants/bike-rookie-art.glb` is byte-identical to the reviewed clean blue/white bike, including refined fender, controls, mechanical connections and warm steel exhaust.
- `public/assets/variants/bike-pro-art.glb` retains that complete accepted geometry and material quality, with authored charcoal plastics, gunmetal frame, yellow numberboard/side fields and red **1**. Shared alloy, rubber and exhaust finishes stay intact.

From repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python prototypes/hero-garage/art/bike-variants/bake.py
python3 prototypes/hero-garage/art/bike-variants/build.py
/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python prototypes/hero-garage/art/bike-variants/verify-source.py
```

`bike-pro-paint-source.blend` is the editable material/bake source. `bake.py` loads the accepted exhaust source and imports canonical original procedural paint/decal graphs, preserving all UVs and geometry. `build.py` replaces only image descriptors and two plain-material colors on the original compressed GLB. All original geometry buffers, indices, attributes, hierarchy, sockets and animations remain exact. Rookie is copied without modification. PNGs, source hashes and outputs are recorded in `bake-report.json` and `report.json`.

A discovered source bug left the front digit at7: `apply_colourway` changes `CW_num_u` but ignores Blender duplicates `.001` and `.002`. The local recipe explicitly sets all three digit projections to the authored **d1** sheet cell at(.25,.25). `digit-verification.json` checks all six U/V values on the actual front-plate source material. Shared source recipes were not edited.

From `prototypes/hero-garage`:

```sh
node --experimental-strip-types art/bike-variants/verify.mjs rookie
node --experimental-strip-types art/bike-variants/verify.mjs pro
node tools/export-rig-contract.mjs --bike variants/bike-pro-art.glb --out art/bike-variants/pro-rig-contract.json
node tools/capture-art-sequence.mjs --name variants-bike-pro-motion --bike variants/bike-pro-art.glb --lights neutral,garage --cameras bike
```

Both variants pass the existing101-stroke suspension and18 clip/time contact-baseline checks; `*-mechanics.json` records limits. `pro-rig-contract.json` measures the current accepted rider against this Pro bike at every exported clip frame. Timed headless WebKit capture goes to `captures/variants-bike-pro-motion/`, with asset hashes and errors in `reports/variants-bike-pro-motion.json`. Parent judges actual recorded output. The unchanged capture overlay may still describe the default blue/white catalog identity; the report asset URL/hash identifies the actual Pro override.

No game integration, physics, catalog or licensing changes. Pro preserves old image payloads in its binary to keep the assembly simple and geometry-exact; it is larger than Rookie. This pass does not establish physical iPhone performance or human visual acceptance.
