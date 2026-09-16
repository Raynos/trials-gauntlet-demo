# Anatomical source selection

Selected the realistic animation head, sculpting alternative and realistic male body from [Blender Human Base Meshes v1.4.1](https://www.blender.org/download/demo-files/). This is a source anatomy selection, not a likeness or art acceptance. The user's expanded free personal/noncommercial license allowance applies; CC0 was not a filter. This source wins because it supplies authored facial loops, eyelids, ears, separate iris/sclera geometry, UVs and editable multiresolution detail with direct Blender import. No account, spending or trial was required.

`art/sources/blender-realistic-anatomy.blend` is a compressed 14MB library of thirteen objects. Append the `GEO-head_animation_realistic` prefix for the first head; the sculpting prefix is an alternative, not an extra layer to render. Preserve relative eye transforms. Upright Z, face forward −Y; glTF's axis conversion produces Y-up/+Z-forward. Exact transforms, mesh counts and UV extents are in `art/sources/anatomy-inspection.json`.

Animation head: 3,242 control vertices, 3,234 faces, one retained multires level and single-tile UVs. Body: 10,582 control vertices, three retained multires levels, UDIM UVs; those body UVs require an atlas/bake decision before glTF use. The source is untextured anatomy and has no groom, target identity, face rig or accepted deformation. Object extraction changes modifier display/render levels for economical inspection, preserving all stored multires data.

A Blender 5.2.1 headless append check verifies thirteen objects, UV data and preserved multires levels. See `source-verification.json`; rerun `blender -b --python prototypes/hero-garage/art/sources/verify_source.py`. This is an import check, not played visual evidence. Parent judges the eventual browser clips.

## Provenance and storage

The official source page identifies this asset bundle as CC0, and the embedded README says all supplied assets are public domain under CC0. Both evidence files and source/archive SHA-256 hashes are preserved alongside the selected blend. A stale unrelated `License` text inside the full bundle names the Rain Rig under CC-BY; that text is not the bundle README and the extracted library includes no Rain Rig. The full source archive and extraction are ignored under `art/sources/raw/`; only the selected editable anatomy is retained in version control. Upstream credits Blender Studio and community contributors; asset metadata names Dan Ulrich for realistic eye/scan anatomy, and the bundle includes other contributors. Preserve this provenance with derivatives.

Reacquire the exact archive from `provenance.json`'s download URL, verify its hash, unzip into `art/sources/raw/`, and run `extract_source.py`. No restricted redistribution source was acquired.

## Focused alternatives

The Blender Studio [realistic human research base](https://studio.blender.org/training/realistic-human-research/use-of-base-meshes/) is a credible related CC-BY route, but the maintained bundle already gives matching head/body topology without a second acquisition. MakeHuman is a fallback if parametric body fitting becomes necessary; it was not installed or claimed inspected. No neural workflow or generic scan download was needed for this first source decision.
