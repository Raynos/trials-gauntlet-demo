# Photographed cloth inputs — scratch material helper

Two actual photographed CC0 PBR fabrics from Poly Haven, **colormass (photography), Rico Cilliers (processing)**:

- [Cotton Jersey](https://polyhaven.com/a/cotton_jersey): source tile 263.603×263.800 mm.
- [Denim Fabric 03](https://polyhaven.com/a/denim_fabric_03): source tile 271.428×271.000 mm.

Both were publicly unlocked September 5, 2025. Provider [CC0 license](https://polyhaven.com/license) allows reuse and redistribution, including game assets. `license-manifest.json` records source URLs, exact dimensions, author credits, source MD5 and acquired SHA256. `official-info.json` and `official-files.json` retain provider metadata. All eight original 2K PNG diffuse, displacement, roughness and OpenGL-normal images passed provider MD5 checks. No login or purchase. The newer Denim 03 was chosen because its photographic provenance and physical tile dimensions are explicitly documented; no need to add the older Denim 02 as a redundant dependency.

## Integrate in an existing Blender authoring script

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path('harness/out/blender/hero-fabrics').resolve()))
import fabrics
fabric_report = fabrics.apply_existing()
# Save a fresh scratch source, then use the existing rider_asset.py export unchanged.
```

Targets confirmed with mega_outfits: `hero heavy cotton`, `hero indigo twill`, `hero denim pocket`. Unused pocket material can still exist; applying to it is harmless. Ribbed cuffs, stitching, guards, gloves and every other material remain unchanged. Race technical polyester has deliberately not been labelled cotton or denim.

Standalone invocation from repo root:

```sh
blender -b harness/out/blender/mega-outfits/anatomy-v3/street-anatomy-v3d.blend --python harness/out/blender/hero-fabrics/apply_source.py -- --output harness/out/blender/hero-fabrics/street-fabric-candidate.blend
```

`apply_source.py` only permits a fresh output in this scratch folder. Importing `fabrics.py` itself does not load/save any source. Active source paths may change as parent iterates; integrate into the accepted current source only.

## Material contract

- Entire existing **Base Color graph, CW JA/PA links and class palettes are retained exactly**. No additional diffuse tint, synthetic noise, dirt or scratch overlay is introduced. Original diffuse images are acquired for provenance/reference but unused by this conservative integration.
- Replace existing procedural micro bump and roughness with photographed height and roughness. Keep source garment geometry, seams, folds, stitch geometry, weights and rig untouched.
- Height image becomes a surface normal via Blender Bump; BOX projection with 0.2 blending uses object coordinates in metres. Provider's nearly square tile dimensions are converted to one geometric-mean tile size, under 0.1% axis scale discrepancy. Object scale must be applied; nonunit source object scales are rejected.
- No UV-map dependency: the later exporter can regenerate/pack UVs. OpenGL normal files are included but not plugged directly into arbitrary atlas tangents, which would rotate the weave incorrectly between repacked islands.
- Cotton bump distance 0.18 mm; denim 0.15 mm; strength 0.65. **Relief amplitude is an explicit restrained artistic setting, not a claimed source measurement.** Roughness is the actual image with a cotton 0.72/denim 0.64 floor. Old nodes remain disconnected for inspection. Optional `preserve_existing_normal=True` keeps a real authored macro-normal input; default replaces old procedural micro-noise.
- Four active images pack into saved source `.blend` files. Production export still bakes into its existing normal/ORM atlas, adding no runtime texture samplers or materials.

## Verification

`blender -b --python harness/out/blender/hero-fabrics/smoke_bake.py`

Completed two 0.15 m swatches through unmodified `common.bake_atlas`/`atlas_material`/`export_glb`, 512 px shared atlas. Base colors unchanged; four active source images packed; exported GLB contains both normal and metallic/roughness texture references. `smoke-validation.json` records exact inputs and output hash. `smoke/fabric.glb`: 84,708 bytes, SHA256 `aba1af5368ed090f2e8341e32d2f89324090ea5e9b9f95ff74d7ba1d35565883`.

This validates the bake/export path, **not the visual result on the current rider**. A whole-rider 512 px normal atlas cannot resolve all real submillimetre yarn detail: expect restrained close-view material response, not enlarged visible weave. Keep physical scale; parent must judge an exported gameplay clip. No canonical source or moving outfit candidate was edited/baked.
