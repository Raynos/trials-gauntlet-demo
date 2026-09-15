# Hero R9 reproduction inputs and provenance

Frozen recipe/license package for the six files listed in the parent’s `mega-v8-models.json`: Street full/LOD, Race full/LOD and bike full/LOD. This package records the review candidates; it does not promote canonical assets or claim AAA acceptance.

## What is retained

- `files/` contains exact, unedited copies at their original repository-relative paths: Street/Race finishing scripts, anatomical extraction/fitting recipes, fabric helper and license manifest, current source export/helpers, source/model audits and bike reproduction README.
- `manifest.json` records every copied file’s SHA256, original paths, all six actual GLB hashes and the three packed final-source hashes. It also inventories large prerequisite sources, extracted anatomy data, the official bundle and acquired fabric images by hash, without duplicating their bytes.
- `THIRD-PARTY.md`, original Blender text blocks and original asset metadata preserve attribution/license scope.

This is **not a self-contained backup of the large assets**. Retain the hash-matched packed `.blend` paths in the manifest, or restore the prerequisite files from an asset archive. Remote provenance can recover the public anatomy/fabric originals, not the project-authored baseline meshes. The final packed sources are the shortest path to faithful re-export.

## Re-export the final packed sources

Run from repository root with Blender 5.2.1 LTS, Node 24.18.1 and the repository’s locked dependencies. All three final sources store `heroLocalAO` JSON `{distance:0.025,samples:32,strength:0.8}`. Standard exporters read this policy; no AO wrapper is needed.

```sh
blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- export --outfit street --source harness/out/blender/street-head/finished-street/street-assembled-v3.blend --models harness/out/blender/r9-repro/street/models --textures harness/out/blender/r9-repro/street/textures --generated harness/out/blender/r9-repro/street/generated
blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- export --outfit race --source harness/out/blender/race-head/finished-race/race-assembled-v1.blend --models harness/out/blender/r9-repro/race/models --textures harness/out/blender/r9-repro/race/textures --generated harness/out/blender/r9-repro/race/generated
blender -b --python-exit-code 1 --python assets/blender/bike_asset.py -- export --source harness/out/blender/mega-bike/final-candidate/source/bike.blend --models harness/out/blender/r9-repro/bike/models --textures harness/out/blender/r9-repro/bike/textures --generated harness/out/blender/r9-repro/bike/generated
```

Run each command again with `--lod` to generate its low-detail counterpart. Output directories above are deliberately separate from reviewed artifacts. The packed-source and frozen-GLB hashes establish artifact identity; a new Blender save/export may change wrapper metadata, so a different whole-file hash alone does not prove geometry or image differences.

## Authoring chain

- Street anatomy: bundle extraction `inspect.py` + `facesets.py`, `build_prototype.py`, then `build_street_fit.py`; `author_street_head.py` attaches the independently extracted realistic head/eyes. Final Street `build.py` fits torso/arms, pockets, hair and photographed fabric; `save_ao_policy.py` records AO in v3.
- Race: `build_race_lower.py` + `build_race_lower_v2.py` prepare pants/boots; `fit_race_helmet.py` fits compact helmet/human head. Final Race `build.py` transfers only the finished Street anatomical top onto the same rig and creates the technical jersey/class panels. It preserves headgear, pants, boots and hands.
- Bike: the copied final-candidate README provides exact adoption/export commands for its packed source; the exporter does not regenerate geometry.

Copied scratch scripts contain their original paths and fresh-output guards. To rerun upstream authoring, restore hash-matched prerequisites at those paths and choose new output names; do not blindly execute the archival copy as a self-contained tool. Import paths expect the repository layout. Current exporter/helper copies are included to identify this version, not to override future code.

## Verify

```sh
python3 docs/evidence/hero-r9-inputs/verify.py
python3 docs/evidence/hero-r9-inputs/verify.py --workspace .
```

First command verifies small package contents. Second also verifies retained large workspace files and six GLBs. No rendering, output mutation, source promotion or purchase occurs. Parent owns played review, gallery and commit.
