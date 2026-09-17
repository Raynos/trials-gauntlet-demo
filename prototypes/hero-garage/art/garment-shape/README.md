# Garment volume candidate

`garment-source.blend` is the editable derivative of the immutable
`../cloth-surface/cotton-source.blend`. `build.py` increases the existing hood's
outer bag volume by at most 34 mm and adds broad diagonal sleeve folds of at most
4.5 mm. The hood's supported half, shirt neck/cuff control coordinates, pocket,
skin weights, topology and UVs remain unchanged. Existing cotton atlas PNGs are
reused. No groom, face, footwear, denim, contacts or clips are authored here.

Run from the repository root with Blender 5.2.1:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python prototypes/hero-garage/art/garment-shape/build.py
/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python prototypes/hero-garage/art/garment-shape/assemble.py -- --base prototypes/hero-garage/public/assets/street01-rider-footwear-finish.glb --out prototypes/hero-garage/public/assets/street01-rider-garment-shape-study.glb
/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python prototypes/hero-garage/art/garment-shape/verify-motion.py
```

The assembly requires explicit base/output paths and redirects only the seven
clothing/drawcord nodes. Existing binary prefix, meshes, skin and animations are
asserted unchanged. The build supports a regenerated cotton source and reads its
three atlas maps from `../cloth-surface/textures/`.

`motion-report.json` samples nine times in each of six actual assembled clips.
The first candidate had zero hood/shirt or cord/shirt triangle crossings,
zero degenerate garment triangles, 1.327 mm minimum hood clearance and 0.458 mm
minimum cord clearance. These geometric checks do not replace parent review of
played motion. Source/assembly hashes identify the measured candidate.

Delivery stage 35 adds this build and assembly after stable stage 34, declares
the regenerated cotton source and all three generated PNGs as inputs, and keeps
the stage 34 recipe exactly unchanged. The shared Blender helpers are already
included in the runner manifest. Read-only preflight:

```sh
python3 prototypes/hero-garage/tools/build-art-delivery.py --stage 35
```

`delivery-preflight.json` and `integration-check.json` record successful
preflight and an isolated build from regenerated cotton. The full stage 35
runner was not executed during integration. Parent owns promotion and judgment.
