# Dedicated denim atlas

The accepted runtime denim geometry is unchanged. Original atlas triangle UV correspondence assigns all 8,068 triangles back to the original procedural indigo twill, pocket and tobacco topstitch materials. A dedicated smart-projected atlas with generous gutters is baked as 2K albedo and 1K normal/ORM, all lossless PNG. The packed Blender source retains the procedural materials and editable dedicated UVs.

Run from repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python prototypes/hero-garage/art/denim-texture/build.py
cd prototypes/hero-garage
node art/denim-texture/verify.mjs
```

Assembly is explicitly parameterized and expects a raw full rider containing the original 8,068 denim triangles. Pass absolute paths after Blender's `--`:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python prototypes/hero-garage/art/denim-texture/assemble.py -- --base /absolute/raw-rider.glb --out /absolute/textured-rider.glb
```

The verifier compares all 24,204 exported triangle corners against the accepted denim donor. Positions, normals, named joint influences and weights are exactly identical; only UVs and texture/material data change. The donor has 19 joints and no animations. Assembly preserves the base's six clips and all other existing mesh payloads. Parent rendered material review remains required.
