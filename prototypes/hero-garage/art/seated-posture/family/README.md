# Shared settled-neutral animation family

Parameterized build and verifier, run from repository root:

```sh
Blender -b --python prototypes/hero-garage/art/seated-posture/family/build.py -- --base /absolute/current-garment-study.glb --out /absolute/family-study.glb
Blender -b --python prototypes/hero-garage/art/seated-posture/family/verify.py -- --base /absolute/current-garment-study.glb --candidate /absolute/family-study.glb
```

The recipe inspects actual first/last bone matrices against original `sit_cruise`, rather than assuming loop behaviour. All six current source clips actually begin and end at neutral. Seated torso stays10degreesforward. Other clips start with the same offset and ease it tozero over15frames/0.5seconds; clips verified to return to neutral ease back to10degrees over their last15frames. Existing target/hold phases between those windows remain unchanged to export floating-point precision.

Pelvis, lower body, feet and hand world transforms remain their original per-frame values; existingIKsolves arms. Current750frame exported validation reports maximum grip/sole displacement2.07micrometres, zero-offset whole-skeleton difference below1.85e-6, initial/ending shared-neutral matrix difference below2.70e-6. Meshes, skins, scene nodes and original binary prefix remain unchanged.

No UI crossfade or game changes. Parent visual acceptance required. Re-run against the final garment study rather than an obsolete anatomy snapshot.
