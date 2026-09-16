# R11 Street charcoal palette promotion

**Accepted scope:** charcoal palette correction only. Parent played the complete corrected normal-camera full-detail and forced-LOD inspection hop clips in QuickTime. Realism, anatomy, and complete reference reconstruction remain unaccepted.

The old Street `rider_pro` dye was teal (`JA/JB = [.045,.17,.145]`). The fixed neutral warm charcoal is `[.045,.043,.041]` in scene-linear RGB. These are authored dye values, not calibrated image albedo. Both the packed authoring source and `assets/blender/build_rider.py` Street seed now contain that palette. Race remains unchanged: parent confirmed its broad charcoal/yellow family; white boots and synthetic construction remain separate visual issues.

## Promoted files

- `assets/blender/source/rider-street.blend`
- `public/models/rider-street.glb` and `rider-street-lod.glb`, plus matching source reports
- `assets/blender/build_rider.py` Street pro seed values
- Build-generated model URLs and byte totals

`manifest.json` records source/model/recipe and played-evidence hashes. `promoted-verification.json` records the exact decoder commands and results. No deployment or commit was performed by the builder.

## Exact preservation contract

The source change only changes saved colorway metadata; source mesh/rig/action/socket/material-graph signatures are identical. Source exports were compared to the old models before texture transplantation. All compressed non-image payloads and all accessor/mesh/node/skin/animation records matched exactly.

`replace_palette.py` transplants **only the source-baked pro albedo JPEG** into each original GLB. Original mustard albedo, normal, and ORM image payloads remain byte-identical, as do all geometry/rig/animation payloads. `palette-parity.json` records this proof and old/new hashes. The pro JPEG is rebaked/recompressed as a complete image, so unaffected regions within that image may acquire JPEG quantization differences. Material names are unchanged; selecting a material name alone is not target-color evidence.

The `original` paths in the historical parity JSON describe paths at the time of verification. Their immutable pre-promotion bytes now live under `harness/out/blender/five-presets-palettes/originals/`, preserving the original `public/models/` and `assets/blender/source/` subpaths. The manifest pins them by SHA256. Do not use the newly promoted files as old transplant inputs.

## Reproduction

The copied scripts in this directory contain the exact source/binary recipe; the authoritative accepted packed source is the promoted `.blend`. Scripts use immutable original inputs and write scratch candidates under `harness/out/blender/five-presets-palettes/`.

```sh
blender -b --python-exit-code 1 --python docs/evidence/hero-r11-palettes/prepare_palette.py
blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- export --outfit street --source harness/out/blender/five-presets-palettes/source/rider-street.blend --models harness/out/blender/five-presets-palettes/rebaked-models --textures harness/out/blender/five-presets-palettes/textures --generated harness/out/blender/five-presets-palettes/generated
blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- export --outfit street --lod --source harness/out/blender/five-presets-palettes/source/rider-street.blend --models harness/out/blender/five-presets-palettes/rebaked-models --textures harness/out/blender/five-presets-palettes/textures --generated harness/out/blender/five-presets-palettes/generated
python3.12 docs/evidence/hero-r11-palettes/replace_palette.py
```

The accepted rendered candidates, exact capture commands and consumed-byte proofs are in `harness/out/blender/five-presets-palettes/README.md` and its two `played-charcoal-*` folders. The normal capture uses `harness/hero-capture.mts`; the forced-LOD capture uses the explicitly labelled existing inspection-camera helper. Each replays input ticks 0–360 and captures ticks `(180,360]`, 90 frames at 60 fps. All 180 sampled physics states match the old run byte-for-byte. This is a short riding window, not a track-clear or finish-time claim.

## Licenses

No third-party assets were added. Preserve inherited anatomical/fabric provenance and its license distinctions from [R9 third-party notes](../hero-r9-inputs/THIRD-PARTY.md); this color change introduces no new license claims.
