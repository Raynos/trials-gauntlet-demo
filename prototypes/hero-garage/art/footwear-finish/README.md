# Dark neutral footwear finish

Material-only study from the accepted fitted footwear source. Blender recipe `build.py` preserves all vertex positions, topology and skin weights, changes canvas/suede to dark neutral grey and restrains sole/lace brightness. Lossless1K maps, editable source and donor `street01-footwear-finish.glb` are provided.

`assemble.py -- --base INPUT.glb --out OUTPUT.glb` replaces only the four existing footwear nodes and preserves all other meshes, original binary prefix and six accepted clips. Current study was assembled over `street01-rider-indigo-study.glb` to `street01-rider-footwear-finish.glb`. Parent rendered acceptance remains required.
