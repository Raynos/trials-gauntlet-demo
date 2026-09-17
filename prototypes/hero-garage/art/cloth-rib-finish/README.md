# Authored rib-region material finish

Run `build.py` in Blender from repository root. Immutable source is `art/garment-hem/hem-fitted-source.blend`. Existing authored `hero knitted rib` regions identify900shirt faces and132pocket piping faces; no new bands are painted by height or position.

Rib material uses the accepted cotton atlas with linear albedo multiplied0.74/0.72/0.70 and roughness0.93. The original accepted fine normal map is retained unchanged, avoiding broad noise or displacement. Cotton outside those exact regions remains on the accepted atlas.

All geometry, topology, UV coordinates, skin weights and source bytes are verified unchanged. Editable source: `cloth-rib-source.blend`; donor `street01-cloth-rib-donor.glb`.

Parameterized `assemble.py -- --base INPUT.glb --out OUTPUT.glb` redirects matching clothing nodes only. Current study is `street01-rider-rib-study.glb`, built over canonical delivery raw. Parent must judge full views plus cuffs/hem closeups before adoption.
