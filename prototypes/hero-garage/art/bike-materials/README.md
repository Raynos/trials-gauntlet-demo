# Bike material rebake

Run `build.py` with Blender from repository root. It reads the protected authored bike source and checks its hash remains unchanged. No geometry builder runs. UV islands are repacked with larger gutters; mesh topology and attachments remain source-derived.

Color is baked at 2048px; tangent normals and ORM at 1024px. Normal/ORM PNGs come directly from the original bake pixels, not transcoded JPEGs. JPEG intermediates are preserved for reproducibility but the GLB uses the lossless data maps. The editable packed Blender scene and all textures are retained.

The active rider and this bike total approximately 98.76 MiB of estimated RGBA8 images with mip chains. That excludes renderer allocations and is not an iPhone memory/performance pass. Material appearance requires whole-scene review; no final-production acceptance is inferred.
