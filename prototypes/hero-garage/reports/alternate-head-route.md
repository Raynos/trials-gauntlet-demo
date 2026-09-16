# Alternate head route: Lee Perry-Smith scan

Status: downloaded and technically inspected, September 16, 2026. Available as one changed source/method if the Human Base Meshes candidate plateaus. **Not admitted as target identity and not substituted into the garage.** No spending, hosted job or account signup.

## Source and allowed use

The official three.js r186 distribution includes the *Infinite, 3D Head Scan* by Lee Perry-Smith, credited to work at triplegangers.com. Its [asset-specific license](https://github.com/mrdoob/three.js/blob/r186/examples/models/gltf/LeePerrySmith/LeePerrySmith_License.txt) explicitly names **Creative Commons Attribution 3.0 Unported**; this conclusion does not rely on the three.js code license. [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) permits adaptation and redistribution, including personal and commercial use, with attribution, license link and derivative-change notice. Retain the supplied title and source credit; do not imply endorsement.

Attribution for any derivative: “Adapted from *Infinite, 3D Head Scan*, Lee Perry-Smith, based on work at triplegangers.com; sourced from three.js r186; CC BY 3.0. Changes: [enumerate sculpt, eye, texture and groom changes].”

Files were fetched from the [official pinned r186 directory](https://github.com/mrdoob/three.js/tree/r186/examples/models/gltf/LeePerrySmith). Raw assets remain local and ignored in `art/sources/alternates/lee-perry-smith/`. That directory retains small versionable `provenance.json`, the exact license text, `inspect.py` and `inspection.json`. Provenance records full source URLs, SHA-256 hashes and byte counts. `git check-ignore` confirms the raw GLB is ignored.

## Measured source properties

Headless Blender **5.2.1 LTS** imported the GLB successfully. Inspection script is reproducible with Blender `--background --python`.

| Property | Measured result |
|---|---:|
| GLB download | 404,976 bytes |
| Meshes / vertices / triangles | 1 / 9,279 / 17,684 |
| UV layers / materials | 1 / 1 |
| Armatures / shape keys | 0 / 0 |
| Color, tangent normal, specular maps | Three 1024 × 1024 JPEG images |
| Displacement map | One 4096 × 4096 JPEG image |
| All downloaded files including license | 2,134,797 bytes |

GLB SHA-256: `402b8a8ac9f03232e6d64b5962929703a069daf99d3c49ac8eb0e48bedc9c576`.

Image residency estimate if all four sources upload as RGBA8 with full mip chains is about **101.33 MiB**, before render targets or geometry. The 4K displacement contributes about 85.33 MiB and should remain a Blender source/bake input for an initial runtime trial. Three 1K maps alone are about 16 MiB. No KTX2 or compressed GPU format is assumed.

## Suitability and required repair

Direct atlas inspection shows real skin-color variation, localized facial stubble, distinct brows and lip color. This provides a materially different starting method from a uniformly vertex-colored generic base. It also contains a different person's identity; it does not recover the original reference's face.

The source is bald and its atlas depicts closed eyelids. It supplies no separate eyeballs, groom, rig or deformation correctives. A viable trial must open/rebuild eye sockets and lids, author separate eyes, reshape jaw/nose/brow to the frozen target, then add the approved dark irregular curl design. The provided specular map is not a ready-made metal/roughness texture: author/test a conversion rather than plugging it blindly into roughness. Inspect neutral relighting before accepting photographed color as illumination-free albedo.

The imported object dimensions are in arbitrary scan units. Measure and normalize to the existing head/neck fit; never infer centimetres from the imported size. UV presence and a light mesh do not establish animation edge flow. Retopology and skinning inspection remain necessary.

Bounded next trial if selected: prepare only this head with separate eyes and mapped skin in Blender; export a separate candidate; play a same-framing neutral/orbit/relight comparison. Parent chooses whether anatomy and material response justify further sculpting. Do not overwrite the current hero or claim Milestone A from source availability.
