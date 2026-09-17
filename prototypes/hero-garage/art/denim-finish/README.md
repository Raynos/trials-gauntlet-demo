# Target01 dark-indigo denim

Color-only material candidate based on the accepted dedicated denim source. Target01 uses a dark indigo trouser rather than the pale blue of the current neutral-lit study. The original indigo shader base is multiplied by linear RGB `(0.26, 0.27, 0.34)`; pockets use `(0.29, 0.30, 0.37)`. Tobacco topstitch remains unchanged. No new noise is introduced, and the accepted normal/ORM PNG maps are reused byte-for-byte.

Run `build.py` with Blender from repository root, then `node art/denim-finish/verify.mjs` from the prototype directory. The packed editable source is `denim-finish-source.blend`. Assembly is parameterized:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python prototypes/hero-garage/art/denim-finish/assemble.py -- --base /absolute/rider-study.glb --out /absolute/indigo-study.glb
```

Assembly identifies the unique 8,068-triangle accepted denim payload rather than assuming a mesh index. It preserves all node descriptors, other meshes, accepted skin and six animations. The donor verifier compares all 24,204 exported triangle corners: positions, normals, UVs and named joint/weight values are exactly identical to the accepted textured denim.

Parent matched full-scene and close denim views under neutral and garage lighting must decide appearance acceptance.
