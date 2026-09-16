# Mobile UASTC candidate

Run `python3 prototypes/hero-garage/art/ktx-mobile/build.py` from the repository, or invoke its absolute path from another directory. Requires the existing `/opt/homebrew/bin/basisu` v2.50; Python uses only its standard library. Sources are the existing mobile GLBs; generated candidates append `-ktx` to their names. This script does not modify the catalog or original assets.

The 13 embedded images use legacy UASTC LDR 4x4, effort 3, Zstandard supercompression, full mip chains down to 1 px, and no lossy RDO. Image usage is read from actual glTF materials, including both material variants. There are no inconsistent color-space references. Color maps use sRGB transfer/filtering, ORM maps use linear transfer/filtering, and normal maps additionally renormalize vectors after filtering. No swizzling, alpha removal, vertical flipping or image rescaling occurs. Spoke transparency remains present (the validator reports RGBA and `Has Alpha: 1`). JPEG source rider normal/ORM artifacts cannot be restored by this encoding.

Every texture is decoded/transcoded by `basisu -validate`. The builder checks the UASTC DFD model, transfer function and mip count. It directly compares 197 rider and 91 bike nonimage payloads, including compressed meshopt streams. Geometry, animations, skeleton, nodes, materials, variants, samplers and accessors remain unchanged. Image payloads/MIME types and texture source mappings change; `KHR_texture_basisu` becomes required. The runtime must attach a KTX2Loader with compatible Basis transcoder assets.

The rider candidate is 4,179,220 bytes; the bike is 3,263,048 bytes. Combined download is 7,442,268 bytes (versus 6,406,260 source bytes). The rider grows because its source uses JPEG, but GPU block compression targets memory, not guaranteed network reduction.

All embedded images with all mip levels total 9,112,592 bytes (8.69 MiB) assuming 4x4 blocks of 16 bytes, versus 36,448,924 bytes (34.76 MiB) RGBA8. Actual GPU format, active variants and renderer allocations affect real residency. The estimate excludes geometry, shadows and driver overhead. Browser visual fidelity and real iPhone performance remain unproven by this exporter.

`reports/ktx-mobile.json` records exact encoder argv, hashes, dimensions, mip levels, alpha presence and per-image memory estimates. Intermediate source extracts, KTX2 files and encoder/validation logs remain locally available but are ignored as reproducible output; the final GLBs are retained under `public/assets/`.
