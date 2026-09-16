# Whole-garment candidate

Input: frozen `street01-rider-posed.glb`; untouched. Run `build.py` then `verify.py` with Blender in background from repository root.

This bounded pass changes only existing sweatshirt/denim vertices identified against the protected Blender source within 1 mm. It gives coincident garment UV seam vertices identical normalized skin weights, smooths shading normals across those splits, smooths local surface positions by at most 2 mm, and tapers the upper neckline width by up to 20%. Maximum combined displacement 33.85 mm occurs at the neckline. No added subdivision or topology. It does not claim garment openings are watertight; source connected-armhole recipe requires an older topology and was not applied blindly. Head/hair/face geometry and custom normals remain unchanged.

Forward/rear clips now preserve original 40-frame outward motion and 20-frame target hold, reverse over 40 frames, and hold neutral 20 frames. Reimport frames 0–119 are verified for all 3 clips; neutral is steady. Loop endpoint bone matrices match within numerical precision, avoiding the prior target-to-neutral wrap. Skeleton and contact targets remain unchanged. Texture bytes are preserved and triangles remain 44,734.

Actual garment silhouette, shoulder integrity, seated support and motion require parent judgment of recorded Three.js playback. Numerical checks do not confer a visual pass.
