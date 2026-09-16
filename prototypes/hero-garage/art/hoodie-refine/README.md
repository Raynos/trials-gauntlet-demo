# Unadopted hoodie transition study

Run `build.py`, `assemble.py`, and `verify.py` with background Blender from the repository root. The body source is the frozen seated rider; the saved groom source is unchanged. `hoodie-refine.blend` is editable.

Six collar strips replace the earlier two-strip repair, with continuous UVs, welded front strip ends, smoother boundary and interpolated skin weights. Attempt one cleared original split normals and was rejected; attempt two preserves original keyed normals and lowers collar material brightness. All six clips pass the existing exported contact/loop checks, but this is not an art pass.

Parent rejected both candidates: the broad band and shoulder opening still read as patched construction. Do not switch the active rider to this study. Change method next: rebuild the joined hoodie surface/shoulder region from the authored garment source instead of another collar-only patch. Keep the current saved face/curls/beard.
