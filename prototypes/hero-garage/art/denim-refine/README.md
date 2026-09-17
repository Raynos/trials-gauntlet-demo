# Denim refinement candidates

## Current candidate: preserve accepted runtime surface

Run `build-accepted.py`, `assemble-accepted.py`, then `verify-motion-accepted.py` using Blender from repository root. These produce the standalone denim donor and `street01-rider-art27-denim-accepted.glb`. Editable packed source: `denim-accepted-source.blend`.

This method extracts exactly 8,068 accepted denim/pocket triangles by their original atlas UV correspondence. It retains accepted rig weights, texture UVs and the complete pelvis-influenced surface. Only distal thigh/knee vertices with effectively zero pelvis influence receive bounded relaxation (maximum 1.947 mm), and normals are smoothed across coincident UV corners. No global subdivision or saddle reconstruction is used.

The six-clip, nine-time-per-clip saddle audit measures socket delta zero and maximum same-ray clearance change below 3 micrometres. This proves the sampled seat preservation, not arbitrary full-body collision freedom. Parent rendered motion review remains required.

## Earlier candidates retained for diagnosis

`build.py` / `assemble.py`: source-derived Catmull–Clark plus restored original contact pins. `build-v2.py` / `assemble-v2.py`: SIMPLE subdivision with interpolated contact children pinned. Both preserved original vertices but changed the actual posed saddle-ray distribution by about 0.1 m, and are not recommended. Reports retain those failed measurements.

Existing source licensing is unchanged. These scripts do not modify game integration or catalogue selection.
