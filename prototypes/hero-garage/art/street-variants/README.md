# Street outfit variants from accepted round33

`public/assets/variants/street-charcoal.glb` retains all accepted round33 rider geometry, saved curls/face/beard, garment construction, footwear, gloves, 19 joints, sockets and six motion clips. Only the three existing mustard cloth albedo textures are converted to cool neutral charcoal; normal and roughness maps remain unchanged. Rib boundaries and colour value variation survive the conversion. Denim, skin and all other materials are unchanged.

`street-openface.glb` adds the original authored 3,942-vertex open-face helmet from `assets/blender/source/rider-openface.blend`, rigidly weighted to the existing head joint. Its inverse bind matrices agree with round33 within 3.28 micrometres. The barehead scalp-groom node is hidden under the helmet to eliminate shell/peak intersections; its saved mesh payload remains in the GLB. Face, eyebrows, beard and moustache remain identical. The helmet is not a colour-only substitute. `openface-helmet-source.blend` is the isolated editable helmet/rig source; original source is unchanged.

## Rebuild

From repository root, with a Python environment containing NumPy and Pillow:

```sh
node prototypes/hero-garage/tools/unpack-art-lossless.mjs prototypes/hero-garage/public/assets/street01-rider-round33-lossless.glb /tmp/street-r33-decoded.glb
/Applications/Blender.app/Contents/MacOS/Blender -b --python prototypes/hero-garage/art/street-variants/helmet.py
/path/to/python prototypes/hero-garage/art/street-variants/build.py --base /tmp/street-r33-decoded.glb
```

Then from `prototypes/hero-garage`:

```sh
node art/street-variants/pack.mjs public/assets/variants/street-charcoal-raw.glb public/assets/variants/street-charcoal.glb
node art/street-variants/pack.mjs public/assets/variants/street-openface-raw.glb public/assets/variants/street-openface.glb
node tools/capture-art-sequence.mjs --name street-charcoal-review --rider variants/street-charcoal.glb --cameras full --lights neutral,garage
node tools/capture-art-sequence.mjs --name street-openface-review --rider variants/street-openface.glb --cameras full --lights neutral,garage
```

`build-report.json` records exact geometry/rig/animation preservation; individual `*.pack.json` reports prove all retained accessor bytes match after independent Meshopt decoding. `reports/street-charcoal-rig.json` and `street-openface-rig.json` record exported skeleton, sockets and clip durations. Recorded six-clip orbits under both lights are in `captures/street-charcoal-review/` and `street-openface-review/`; full/detail stills are in corresponding `*-final/` folders. Source licenses inherit the current art handoff (including saved groom/beard notices); the helmet is original project geometry.

These are provisional art candidates, subject to parent and user visual approval. No game integration or actual iPhone validation is claimed. The original helmet silhouette/materials are preserved rather than newly redesigned. The scalp groom is intentionally hidden only for the helmet variant.
