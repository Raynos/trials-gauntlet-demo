# Elbow inner-shell miter repair

The source is `../cloth-rib-finish/cloth-rib-source.blend` (the actual filename).
The source's2mm inward shell uses even-offset miters.15 evaluated inner vertices
near the elbows extend more than5mm; eight extend more than10mm and the worst
extends148.232mm. Blender's thickness clamp did not limit these artifacts.
`diagnosis.json` and `clamp-diagnosis.json` record the measurements.

`build.py` preserves the entire control cage, UVs, weights and outer surface.
It adds editable Geometry Nodes between Solidify and Armature, correcting only
those15 exceptional inner vertices to the bounded2mm normal-offset positions.
Every other evaluated vertex is asserted unchanged, including contact rims,
neck, cuffs and hem. `sleeve-source.blend` keeps this source and correction stack.
Broad angular outer silhouette and stair-stepped rib material boundaries are
unchanged. No cosmetic texture or facial/groom edits are included.

`assemble.py` requires `--base` and `--out`. The candidate
`street01-rider-sleeve-shape-final-study.glb` was assembled over the stable
stage38 raw delivery. `verify-motion.py` compares all six actual clips at nine
times each. `comparison.json` finds no new denim intersections at any pose,
zero hood/shirt or cord/shirt crossings, zero degenerate triangles and zero
nonfinite vertices. It does not prove absence of self-intersections or contact
with every other scene component. Parent must judge played motion before
promotion. No runner or canonical source edits were made.
