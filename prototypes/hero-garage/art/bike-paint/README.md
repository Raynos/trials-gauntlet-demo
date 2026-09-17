# Clean blue and white paint study

Candidate follows `bike-finish` while retaining its exact geometry, hierarchy, transforms and texture UV coordinates. Only the original tank paint, factory race field and numberboard polygon regions receive newly baked materials: 244 bodywork polygons and 54 front-numberboard polygons.

The original source decal image nodes and their projection graphs remain intact. Procedural flake/wear noise and pointiness contributions are disabled. Blue plastic has roughness 0.38 and metallic 0.06; white plastic has roughness 0.47 and metallic 0. Painted-region maps are dedicated lossless PNG (2K color, 1K normal/ORM), baked onto the existing UV footprints so no geometry or UV changes are needed.

Run `build.py` with Blender from repository root, then `node --experimental-strip-types art/bike-paint/verify.mjs` from the prototype directory. The packed procedural source is `bike-paint-source.blend`. Source files are hash-checked unchanged.

Parent review: compare bike-camera shots under neutral and garage lighting, then recorded orbit/relight motion. Look for cleaner white shrouds and blue tank response, retained VORTEX and numberboard graphics, and no flat dark baked areas. Mechanical checks cover 101 suspension samples and six rider clips; they do not establish aesthetic acceptance.
