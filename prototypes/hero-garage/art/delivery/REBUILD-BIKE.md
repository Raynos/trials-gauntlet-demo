# Rebuild the reviewed bike

Run from repository root. Blender 5.2.1 LTS and the existing Node/Three.js dependencies are required; no download or additional compression step is used.

```sh
python3 prototypes/hero-garage/tools/build-bike-delivery.py
python3 prototypes/hero-garage/tools/build-bike-delivery.py --execute --repeat 2
```

Default invocation performs a read-only dependency preflight. Execution runs five existing recipes serially: bike-detail → bike-finish → bike-paint → bike-contours → bike-exhaust. It overwrites their generated Blender sources, maps, reports and GLBs. The frozen starting inputs are `assets/blender/source/bike.blend` and `art/bike-refine/bike-refined.blend`; regenerating that accepted refinement from earlier experiments is outside this runner.

Every run records input, recipe and output SHA-256 hashes, byte sizes, Blender version, timings and individual logs in `art/delivery/bike-runs/<run-id>/manifest.json`. Shared `assets/blender/common.py` and mechanical verifier dependencies are fingerprinted. Source blends contain the accepted packed materials/images; generated paint PNGs are explicit later-stage inputs. Python errors produce a nonzero Blender exit code. The runner verifies frozen/shared inputs did not change.

The reviewed `public/assets/street01-bike-exhaust.glb` is preserved as `street01-bike-reviewed-backup.glb` before execution. A backup with the wrong reviewed hash is rejected. Final outputs are copied into each run directory. If a rebuilt GLB differs from the reviewed hash, the runner restores the reviewed canonical filename and leaves the different candidate in its run directory for diagnosis; it does not change the catalog. Each successful chain runs the existing suspension/contact verifier.

Two complete runs with the final runner on 2026-09-17 were byte-identical to each other and the reviewed asset: 5,682,208 bytes, SHA-256 `7877404ef7e9e2f5f25550a7d979b8f62e6e20774109294221a14e9877c8d9de`. Evidence: `reports/bike-delivery-repeatability.json` and `art/delivery/bike-runs/20260917T025134Z-05f1523e/manifest.json`. Both mechanical verifications passed; frozen sources stayed unchanged. Intermediate `.blend` serialization need not be byte-identical; the reviewed final GLB was measured exactly.

No extra repacking is adopted: the reviewed bike already uses Blender's meshopt export. These checks establish reproducibility and mechanical regression preservation, not new visual approval or actual iPhone performance.
