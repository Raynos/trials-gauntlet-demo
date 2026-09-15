# R10 hero input snapshot

This package records one coordinated Street, Race and bike surface pass. It contains the exact three authoring scripts, local Python dependencies, builder reports, source/export audits and six-model integration manifest. It is a reproducibility snapshot, not a visual acceptance or canonical promotion. Parent owns the combined played review and ship gate evidence.

Large packed `.blend` sources, their R9 prerequisites, generated textures and GLBs remain at their recorded workspace paths; none are duplicated here. A clean checkout cannot rebuild from this package alone until those ignored packed inputs are restored from retained storage. `manifest.json` pins their bytes and SHA-256 values and maps every copied file to its original path.

## Final sources and outputs

| Candidate | Packed source | Export directory |
|---|---|---|
| Street | `harness/out/blender/hero-r10-street/street-r10-v1.blend` | `harness/out/blender/hero-r10-street/models` |
| Race | `harness/out/blender/hero-r10-race/race-surface-v2.blend` | `harness/out/blender/hero-r10-race/models` |
| Bike | `harness/out/blender/hero-r10-bike/source/bike.blend` | `harness/out/blender/hero-r10-bike/models` |

All six output hashes and decoded counts are in `manifest.json`. The original `mega-v10-models.json` is copied under `files/harness/out/blender/`. Builder-specific READMEs, reports and commands live beside their copied scripts.

## Reproduce

Work from the repository root with the matching repository dependencies installed and Blender 5.2.1 LTS. Restore copied `files/` paths to a separate reproduction checkout, preserving the same relative layout, and restore large prerequisites by hash. Do not overwrite current shared workspace files simply to replay a snapshot.

The Street and Race authoring scripts require fresh output filenames. The bike script writes its designated scratch output; use a fresh scratch root for replay. Existing R10 packed sources can be exported directly without rerunning authoring:

```sh
blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- export --outfit street --source harness/out/blender/hero-r10-street/street-r10-v1.blend --models harness/out/blender/hero-r10-street/models --textures harness/out/blender/hero-r10-street/textures --generated harness/out/blender/hero-r10-street/generated
blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- export --outfit street --lod --source harness/out/blender/hero-r10-street/street-r10-v1.blend --models harness/out/blender/hero-r10-street/models --textures harness/out/blender/hero-r10-street/textures --generated harness/out/blender/hero-r10-street/generated
blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- export --outfit race --source harness/out/blender/hero-r10-race/race-surface-v2.blend --models harness/out/blender/hero-r10-race/models --textures harness/out/blender/hero-r10-race/textures --generated harness/out/blender/hero-r10-race/generated
blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- export --outfit race --lod --source harness/out/blender/hero-r10-race/race-surface-v2.blend --models harness/out/blender/hero-r10-race/models --textures harness/out/blender/hero-r10-race/textures --generated harness/out/blender/hero-r10-race/generated
blender -b --python-exit-code 1 --python assets/blender/bike_asset.py -- export --source harness/out/blender/hero-r10-bike/source/bike.blend --models harness/out/blender/hero-r10-bike/models --textures harness/out/blender/hero-r10-bike/textures --generated harness/out/blender/hero-r10-bike/generated
blender -b --python-exit-code 1 --python assets/blender/bike_asset.py -- export --lod --source harness/out/blender/hero-r10-bike/source/bike.blend --models harness/out/blender/hero-r10-bike/models --textures harness/out/blender/hero-r10-bike/textures --generated harness/out/blender/hero-r10-bike/generated
```

All sources save AO distance `.025`, samples `32`, strength `.8`. Standard export reads this policy, stages/bakes/decodes each output and checks source immutability. Generated bake files are derivatives, not authoring inputs. Blender re-saves or fresh bakes may produce different container hashes; recorded candidate hashes identify the exact played bytes and should not be replaced by assumptions of deterministic export.

Verify the package and optional retained workspace inputs:

```sh
python3 docs/evidence/hero-r10-inputs/verify.py
python3 docs/evidence/hero-r10-inputs/verify.py --workspace .
```

## Third-party inheritance

No new external assets were acquired in R10. Anatomical geometry and packed cotton/denim inherit the [R9 third-party record](../hero-r9-inputs/THIRD-PARTY.md), [license notices and provenance manifest](../hero-r9-inputs/manifest.json). Preserve that package with this one. Its explicit distinction between the Blender human-base bundle's CC0 statement and the separate Rain Rig CC-BY notice remains applicable: selected realistic geometry/eyes were used with the game's own rig, not the Rain rig. R10 construction and the regenerated spoke coverage texture are locally authored. No target image is integrated as a model texture.

Canonical promotion requirements are documented separately in [PROMOTION.md](PROMOTION.md); no promotion was performed by this packaging task.
