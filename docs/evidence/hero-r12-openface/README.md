# R12 fifth outfit: compact open-face

The parent played the forced-LOD hop and full-detail crash/restart in QuickTime and accepted this compact helmet as the first implementation of reference 02. The face remains visible and the helmet follows the head. This acceptance does **not** accept overall AAA realism, anatomy or physics.

## Canonical artifacts and selection

- Packed source: `assets/blender/source/rider-openface.blend`.
- Runtime pair: `public/models/rider-openface.glb` and `rider-openface-lod.glb`.
- Preset `street-openface`, model family `openface`, fixed material variant `rider_pro` (charcoal). Both bike classes retain that palette. Street and Race sources and GLBs are unchanged.
- The runtime files are byte-identical copies of the accepted preview pair, renamed from its temporary Street aliases. Sidecars identify the canonical source and this promotion. `source-promotion.json` verifies mesh, weights, material graphs, bones, action curves and sockets across the metadata-only source save/reload.

## Reproduction

The source contains all images and authored geometry. Export from the repository root:

```sh
blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- export --outfit openface
blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- export --outfit openface --lod
```

Use `--models`, `--textures` and `--generated` to send review exports into a fresh scratch directory. The fresh LOD export recorded in `export-check.json` passed the real meshopt decoder. Baking is not claimed byte deterministic; it produced a distinct image payload and was not substituted for the played bytes. The saved AO settings remain distance 0.025 m / 32 samples / strength 0.8.

To reconstruct the added original headgear from the current Street source:

```sh
blender -b --python-exit-code 1 --python assets/blender/openface_candidate.py -- --output-dir harness/out/blender/openface-rebuild
```

The recipe refuses an existing candidate, removes only scalp hair beneath the shell, preserves body/face/eyes/rig/actions/sockets, and authors a double-wall shell, ear flare, peak, rubber rim, hardware and retention straps. Export the resulting source using `--outfit openface --source <path>`. The input Street hash is recorded in the original source report. The reference image informed shape; it was not projected into the model or used as texture data.

## Evidence and scope

`source-report.json` contains dimensions, topology and 24 sampled animation intersection checks. The headgear is approximately 25.27 × 21.66 × 26.94 cm including peak and under-chin straps. Full/LOD are 51,092 / 5,880 triangles, one skinned draw each, 19 bones and eight clips.

`played-report.json` points to the actual recorded-input captures under `harness/out/blender/openface-r12/`: normal-camera full hop, explicitly labelled inspection-camera LOD hop, and full crash/restart. Their capture evidence and hashes are recorded in `manifest.json`; footage remains in scratch storage. The parent owns visual judgment.

Runtime checks: `pnpm typecheck`; focused Vitest UI, boot, outfit loading and physical rider suites; `pnpm build`; `pnpm exec tsx harness/e2e/outfits.mts`. The latter checks five presets × two bike classes × two detail levels, and injects a two-file openface outage before retry. Material-name checks establish selection mechanics, not visual realism or target-color proof; the played review establishes the limited headgear acceptance above.

## Third-party provenance

Inherit the exact [R9 third-party record](../hero-r9-inputs/THIRD-PARTY.md) and [R11 charcoal palette promotion](../hero-r11-palettes/README.md). Human base topology/eyes and photographed fabric inputs are CC0, with creator/archive/hash records preserved there. The separately included Rain Rig CC-BY notice does not license the selected realistic base meshes; Rain geometry/rig was not used. No new third-party geometry or texture was acquired for openface. New headgear is original procedural geometry.
