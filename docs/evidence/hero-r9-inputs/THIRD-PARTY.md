# Third-party provenance

## Blender Human Base Meshes 1.4.1 — CC0

Source: [official Blender asset bundles](https://www.blender.org/download/demo-files/#assets), [versioned ZIP](https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip).

ZIP SHA256: `811f43accbb31a88266d932f8f5563b2d13586fca0ba2693aad1f5fe582b3515`.

Used assets: `GEO-body_male_realistic` for the connected upper body/arms; `GEO-head_animation_realistic` and its sclera/iris child meshes for human head/eyes. Original asset collection metadata credits **Dan Ulrich** for both realistic body and animation head. Blender Studio/community distribute the bundle. `Blender-asset-metadata.json` preserves collection metadata; no source character rig, animation or stylized Rain/Snow meshes were imported.

`Blender-bundle-README.txt` is copied verbatim from the downloaded `.blend` and states that all provided assets are CC0. The same file also contains a separate text block named License that refers specifically to **Rain Rig**, CC-BY 4.0. That text is preserved unedited as `Blender-bundle-License.txt` for provenance; it is not the selected realistic base-mesh asset or the game's custom rig. These distinct notices must not be silently conflated.

Adaptations: extract base topology and authored face-set labels, fit torso/arms onto existing game skeleton, tailor garment shell, fit anatomical head/neck and eyes onto existing head/neck bones. Later jersey, helmet and hairstyle construction is recorded in copied author scripts.

## Poly Haven photographic fabrics — CC0

- [Cotton Jersey](https://polyhaven.com/a/cotton_jersey): colormass, photography; Rico Cilliers, processing. Source tile 263.603 × 263.800 mm.
- [Denim Fabric 03](https://polyhaven.com/a/denim_fabric_03): same credits. Source tile 271.428 × 271.000 mm.

Both are publicly unlocked assets under [Poly Haven's CC0 asset license](https://polyhaven.com/license). The copied fabric `license-manifest.json` records individual 2K PNG URLs, byte sizes, provider MD5 and acquired SHA256. Copied official metadata preserves dimensions and authors. The active height/roughness maps are packed into the final Street authoring source; original diffuse/OpenGL-normal maps were acquired but the conservative helper does not connect them to albedo/tangents. Runtime maps are baked derivatives.

Street uses measured-scale photographed height-derived normals and roughness while retaining the authored class palette. Race's final jersey instead uses a defined 0.5 mm procedural knit micro-normal and flat class colors; it is not represented as scanned polyester. The custom bike uses no newly acquired third-party geometry from this research.

## Terms and excluded research

[CC0 1.0 legal terms](https://creativecommons.org/publicdomain/zero/1.0/legalcode) permit copyright reuse and commercial redistribution; attribution is not required under CC0, but the source credits above are retained. CC0 does not waive trademark/patent rights.

The BlenderKit hoodie scan and Sketchfab KTM researched earlier were **not acquired or integrated** and impose no license dependency on these six candidate GLBs. AI-generated target concepts are review references, not texture or geometry sources in these artifacts.
