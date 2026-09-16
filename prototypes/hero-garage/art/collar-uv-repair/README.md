# Collar texture-coordinate repair

Run the full-rider-identity builder first, then run this directory's `build.py` and `verify.py` with background Blender from the repository root. The active catalog loads the resulting local `street01-rider-collar-uv.glb`; its source remains `street01-rider-identity.glb`. Both dense files are generated and ignored.

584 degenerate collar UV triangles are remapped to an inset triangle within the authored heavy-cotton atlas island. Blender V coordinates are converted to glTF V coordinates. The patch comes from the UV-matched source probe retained here. Each repaired triangle receives duplicate vertices so adjacent garment UVs remain untouched. Per-triangle patch reuse is an interim texture repair, not a continuous final garment unwrap. Positions, normals, weights and six clips remain identical.

Parent reviewed the matched portrait and sequential frames decoded from the recorded forward-rise orbit. Dark texture streaks improve; rough collar geometry, front seam and final garment quality remain open. The first experiment omitted the V conversion and sampled the wrong atlas region; it was rejected. Final evidence: `reports/collar-uv-round25-review.json`.
