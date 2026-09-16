# Saved identity on the full rider

The user explicitly requested attaching the saved curly hair and beard, superseding the paused-head assembly choice. `build.py` combines `street01-rider-garment-repair.glb` and the exact `street01-head-groom.glb` shown in `head-groom-a3`. Original body attributes and six animation payloads are retained; 11,341 old head-weighted faces are removed from the index list. The saved face, eyes, brows, beard/moustache and curly groom receive rigid head-joint weights.

Reproduce from repository root before building the viewer:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python prototypes/hero-garage/art/full-rider-identity/build.py
```

The generated 173 MB GLB is local/ignored, not committed or deployed. The retained source GLBs and recipe reproduce it. Full-scale geometry is intentional for this requested appearance preview; the previous mobile memory budget does not apply to this assembled rider. Both local viewer tiers use the same appearance mesh. Neck/collar seams and head fit remain provisional.

Head/groom provenance is inherited from `art/sources/replacement-hair/` and `art/head-authored/`: Daniel Bystedt curly groom CC BY-SA, with existing face/beard source records and local-use restrictions unchanged. No public distribution clearance is claimed.

Parent verified real Three.js full/portrait captures and inspected sequential decoded frames of a forward-rise orbit. The head remains attached in sampled motion. All six clips load; no browser errors; deterministic canvas replay matches. Evidence: `reports/full-rider-saved-identity-a1.json` and `reports/full-rider-saved-identity-motion.json`.
