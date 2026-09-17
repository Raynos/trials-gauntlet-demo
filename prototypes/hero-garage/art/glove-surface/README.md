# Flexible glove surface study

Source is cuff3's editable Blender file. Run `build.py`, then `verify-contact.py` in Blender from repository root. Only264dorsal finger-tube vertices change, compressed45%toward original centerlines, at most3.6mm. Opposing thumbs and inward-facing finger surfaces (580vertices), palm and sleeve-derived cuff coordinates/weights remain unchanged. Exact changed vertex coordinates are recorded in `changed-dorsal-vertices.json`.

Short separate knuckle pads now have0.45–1mm relief; glove materials use matched dark textile tones and roughness0.91 rather than rubber highlights. No full mitten bridge is added.

Actual accepted sixclip animation verification samples all580protected surface points at nine times per clip, with0m change. This proves contact geometry preservation, not contact-pressure simulation or visual acceptance.

Donor: `street01-gloves-surface.glb`. Parameterized `assemble.py -- --base ... --out ...` replaces only the three existing named glove nodes, preserving other meshes and binary data. Parent judges the resulting rendered appearance.
