# Mobile texture tier

This candidate changes embedded bike image payloads only. Bike color maps are 1024 square; bike normal and ORM maps are 512 square. Smaller chain/spoke images remain unchanged. Rider textures already meet those limits, so the rider mobile GLB is an exact copy of the active rider.

The bike's existing meshopt streams are preserved byte-for-byte. No new lossy geometry compression or LOD is applied. Meshes, six rider clips, skeleton, sockets, material variants and texture transforms are unchanged. All non-image payloads and corresponding JSON structures are directly compared. Numerical geometry/animation change is exactly zero.

Bike file size falls from 6,053,376 to 3,645,880 bytes. All embedded bike images' base-level RGBA8 estimate falls from 67,182,592 to 16,850,944 bytes (includes both color variants; excludes mipmaps and renderer allocations). Rider stays 2,760,380 bytes, with 10,485,760 bytes of embedded base-level RGBA8 images. Actual resident GPU memory depends on loaded variants and runtime allocations.

`build.py` requires Python with Pillow; it directly repacks GLB buffer views and preserves fallback buffer declarations and compressed stream offsets. No inference framework is used. Normal/ORM images are resized as linear data and stored as PNG. `verify.py` runs in Blender, reimports both outputs and samples all 750 rider frames against a 1 mm contact threshold. Texture fidelity and actual mobile performance require parent browser/device review.
