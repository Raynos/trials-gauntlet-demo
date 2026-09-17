# Sleeve-derived glove cuff

Run `extract.py`, then `build.py` using Blender from repository root. Extraction reads the actual evaluated sweatshirt in `art/hoodie-finish/cloth28-source.blend`, disabling Solidify and Armature to recover the outer rest boundary and subdivided skin weights. Each cuff uses all88 boundary points, inset2.2mm radially and1.5mm inside the sleeve, then lofted to the preserved palm with matching rear weights. The2mm inward sleeve shell leaves0.2mm nominal inner radial clearance.

`verify-interface.py` imports the actual accepted six animations from `street01-rider-cloth28.glb`, then measures176 paired actual sleeve/cuff boundary points at nine times per clip. This verifies the rear interface's signed radial clearance, not entire cuff/sleeve intersection absence. Rendered acceptance remains parent-owned.

Original844finger/thumb positions and weights are unchanged. Cuff1 and cuff2 donors are preserved. Distinct donor: `street01-gloves-cuff3.glb`. Assembly requires explicit `--base` and `--out`; no catalog mutation.
