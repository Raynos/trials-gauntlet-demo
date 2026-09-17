# Art handoff — round 27

This task owns Blender art and review exports. Claude + Opus own game integration. The catalog selects the provisionally accepted assets; final visual approval belongs to the user.

## Active assets and rebuild

- Rider: `/assets/street01-rider-tailored.glb`, SHA `d6122a389e38cf7ea209b00b386efe6f12a8d48357fef1f969345ccc90938bec`. The dense local GLB is ignored by Git. From repository root, run background Blender with `art/full-rider-identity/build.py`, then `art/hoodie-shell/build.py`, then `art/hoodie-shell/assemble.py` (all under this prototype). The saved face, curls and beard are retained. Editable clothing: `art/hoodie-shell/hoodie-source.blend`; supporting recipes preserve the original source and use a continuous control cage.
- Bike: `/assets/street01-bike-detail.glb`, SHA `dc70ee964be894777a344a8c343cdeec42e81dfd0f5fa5a2055c695037b96cf9`. Editable `art/bike-detail/bike-detail.blend`; `art/bike-detail/build.py` derives it from the previous refined bike. Clamp shells rotate around fixed fork centres; number-board mounts are added. Joint hierarchy and attachment transforms are preserved.
- Build the review viewer with `npm run build` inside this prototype. `node tools/package-runtime.mjs` packages a local review bundle; it does not deploy. Tool dependencies are pinned in the package lock. Source scripts use local Blender 5.2.1, its Python/numpy, and repository `assets/blender/common.py` / `rider_asset.py`.

## Rig, sockets, clips and conventions

`art/rig-contract/README.md` and `tools/export-rig-contract.mjs` describe and regenerate the actual catalog contract: 19 joints, inverse-bind matrices, sockets, materials, clip channels and per-frame contact samples. Earlier hashes are historical until regenerated. The six retained clips are `sit_cruise`, `forward_attack`, `hang_back`, `compression`, `extension`, `landing_absorption`.

Source Blender coordinates are metres, Z up, +X forward; glTF is metres, Y up, +X forward. Both assets have catalog offset `[0, .34, 0]`. Viewer grounding and suspension are separate authored kinematics. Evaluate the rider animation before applying the shared bike/chassis motion. Grip sockets coincide closely; sole sockets intentionally sit approximately11mm above peg centres. Socket agreement is not proof of surface contact. No finger/twist chain has been added.

## Verification and outstanding art

`reports/art-round27-review.json` records adoption; `captures/art-round27-adopted/` contains all six clips under neutral and garage lighting. Hood vs sweatshirt checks sampled54poses with no segment/triangle crossings and minimum1.42mm clearance, excluding coplanar/tangent cases. Existing identity, animation and skin payloads are retained by assembly assertions. The frozen game ship check passed; this is not game integration validation.

Footwear and denim candidates remain unadopted: shoe reinforcement intersects the new upper, and denim changed some sampled saddle gaps. Next work: fix these, glove protection placement, continuous garment UVs, cloth thickness and materials. Final resemblance, broad folds, silhouette and close-up finish remain open. Dense hair optimization and actual iPhone performance are unproven; old mobile memory numbers do not describe this preview.

## Sources and licensing

The original body/bike sources remain in `assets/blender/source/`. The MPFB-based head, skin and beard provenance is in `art/sources/authored-human/` and `art/sources/authored-beard/`; conflicting skin metadata remains restricted to the existing personal local trial. Curly hair is derived from Daniel Bystedt's Blender demo under CC-BY-SA (version unspecified in saved evidence): `art/sources/replacement-hair/provenance.json`. Preserve attribution and share-alike terms. No public distribution clearance is implied.

## Allowance

`openusage codex --force` provides fresh usage JSON even when the app usage tool is unavailable. Latest verified reading:17% weekly remaining, September17UTC. Stop sustained work at2%; do not mark the art complete merely because that floor is reached.
