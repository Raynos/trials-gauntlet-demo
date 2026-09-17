# Open-face helmet construction candidate

Built from the existing project-authored target02 helmet frame and original 19-bone rig. `build.py` produces a compact lower crown, four actual recessed ventilation channels, a 1.6 mm aperture trim, a thin nearly level short peak, flush ear hardware, flat forked chin webbing and a small release buckle. The shell has restrained .55 roughness. Actual saved round33 face triangles are tested independently with a BVH; final fit has **zero helmet/head triangle crossing pairs in rest**. The forehead shell is moved 9 mm forward locally for clearance. This is a rest collision check, not a substitute for the recorded motion review.

`openface-remaster-source.blend` is editable; original source is immutable. `assemble.py` preserves accepted round33 rider mesh data, six clips and skin, recolours only its three cloth albedos to the already accepted charcoal palette, adds the new rigid-head helmet, and hides only the scalp-groom node. Saved face, eyebrows, beard, body and contact geometry are unchanged. No existing variant is overwritten.

Rebuild from repository root (Python needs NumPy/Pillow):

```sh
node prototypes/hero-garage/tools/unpack-art-lossless.mjs prototypes/hero-garage/public/assets/street01-rider-round33-lossless.glb /tmp/street-r33-decoded.glb
/Applications/Blender.app/Contents/MacOS/Blender -b --python prototypes/hero-garage/art/helmet-remaster/build.py
/path/to/python prototypes/hero-garage/art/helmet-remaster/assemble.py
```

Then from `prototypes/hero-garage`:

```sh
node art/helmet-remaster/pack.mjs public/assets/variants/street-openface-remaster-raw.glb public/assets/variants/street-openface-remaster.glb
node tools/capture-art-sequence.mjs --name helmet-remaster-motion2 --rider variants/street-openface-remaster.glb --cameras full,face --lights neutral,garage
```

The lossless pack report proves exact retained geometry and animation accessor bytes. Rig report: `reports/street-openface-remaster-rig.json`. Evidence: `captures/helmet-remaster-final2/` and timed full/face recordings across all six clips under both lights in `captures/helmet-remaster-motion2/`. Parent/user visual approval remains required. Original helmet and source-head licensing/provenance remain as documented in the existing art handoff. No performance or final art completion claim.
