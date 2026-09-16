# Art handoff — round 26

Owner split: this task produces Blender art and review exports. Claude + Opus own game integration. Current catalog is authoritative.

## Active assets

- Rider: `public/assets/street01-rider-collar-uv.glb`, SHA `67302f649eff8f536e17f99c55c15c673503bf3ccdf8e64f97ca87ec41d69e3c`. Rebuild using `art/full-rider-identity/build.py`, then `art/collar-uv-repair/build.py`, with background Blender from repository root. Dense local file is ignored; saved face, curls and beard preserved.
- Bike: `public/assets/street01-bike-refined.glb`, SHA `5fac61e4fb12a2425bb3d3f519fe90d8047c593f99096da5fed71b595771b012`. Editable `art/bike-refine/bike-refined.blend`; recipe in that directory. Both review tiers currently use this bike.
- Viewer rebuild: run `npm run build` inside the prototype, then `node tools/package-runtime.mjs`. This packages local assets; it does not deploy.

## Rig and mechanics

See `art/rig-contract/README.md` and `reports/rig-contract.json` for the original body contract; its declared source hash is historical, not a verification of the latest assembled rider. Six clips: sit_cruise, forward_attack, hang_back, compression, extension, landing_absorption. glTF is Y-up; saved portrait faces +X after assembly. Root placement and asset transforms are recorded in the catalog. Existing prototype suspension is authored kinematics, not game physics. Bike material changes preserve geometry, nodes and attachments; `reports/bike-refine-mechanics.json` verifies suspension and contacts.

## Art still required

The hoodie remains the largest visible weakness. Two new collar-transition attempts did not pass visual review. Rebuild the joined shoulder/hood/neck surface from editable source, rather than another collar-only patch. Clothing folds, hands, shoes, materials and final reference fidelity remain open. Dense groom optimization, final continuous garment unwrap and actual iPhone performance are unproven.

## Provenance and delivery

Saved head/groom terms remain in `art/sources/replacement-hair/` and `art/head-authored/`; existing local/personal-use restrictions remain. No public distribution clearance is implied. No game files were changed in this art round.

## Allowance

Latest user authorization lowers the floor to2% and gives flexible art-first priorities. Account usage monitoring currently fails with Transport closed; last verified20% reading predates this push. Resume sustained work when a fresh reading is available.
