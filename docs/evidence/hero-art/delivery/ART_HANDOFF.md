<!-- Archived from prototypes/hero-garage/art/ART_HANDOFF.md at 9b09013 for the hero-art integration record (ask 43); links rewritten to docs/evidence/hero-art/delivery/, assets/blender/hero-art/ or the archived prototype path. -->

# Hero garage art handoff

This delivery covers Blender art, editable sources and review exports. Claude + Opus own game integration. The current catalog is round 33, provisionally accepted after the combined six-clip review. The editable master, retained actions, materials, exports and local review evidence are ready for handoff. Final visual approval belongs to the user. This document does not claim finished production quality.

## Find the current assets

Use [the review catalog](variants-manifest.json) as the authoritative rider/bike selection. Do not select a file merely because its name contains a later round or because a newer candidate exists. Asset identities and acceptance evidence are recorded in [the round 33 review](art-round33-review.json); subsequent accepted review reports supersede it.

The generated rider filenames `street01-rider-delivery-raw.glb`, `street01-rider-delivery-pruned.glb` and `street01-rider-delivery-lossless.glb` are build outputs, not independent approval records. A later rebuild may overwrite them before catalog promotion. Dense generated assets and large Blender files may be Git-ignored; preserve local sources and reproduce them using the recorded pipeline.

The editable consolidated scene is [hero-garage-master.blend](../../../../assets/blender/hero-art/masters/README.md). Check [delivery-master.json](delivery-master.json) against current catalog hashes before treating the master as current. Regenerate it whenever the accepted catalog changes. It contains the rider, bike, retained animation actions and a separate studio collection; exclude the studio from asset exports. Component recipes remain canonical: re-exporting this imported master is not promised to reproduce identical GLB bytes.

## Rebuild and inspect

Run the canonical rider pipeline from the repository root. Start with read-only preflight:

```sh
python3 prototypes/hero-garage/tools/build-art-delivery.py --stage 41 --prune --pack
```

Add `--execute` to rebuild. Stage 41 includes the fitted hem, settled clip family, rib trim, lacing, repaired inner sleeve shell, quieter denim normal and smooth cuff texture boundary. `--prune --pack` removes unused resources and writes the lossless Meshopt export; promotion still requires rendered review. Do not run a full rebuild while another builder is editing its component sources in this shared checkout.

[REBUILD.md](../../../../assets/blender/hero-art/masters/REBUILD.md) documents rider stages, dependencies, frozen seeds and command behavior. [REBUILD-BIKE.md](../../../../assets/blender/hero-art/masters/REBUILD-BIKE.md) documents the independent bike chain: `python3 prototypes/hero-garage/tools/build-bike-delivery.py --execute`. Two complete bike rebuilds matched the reviewed GLB byte for byte. Each executed run writes a manifest, source/recipe/output hashes and logs under `art/delivery/runs/`. A failed run does not validate an older output left on disk. Two complete stage-41 runs produced byte-identical final pruned/packed GLBs. Raw append-only intermediates differed in discarded payloads. This is not a cross-machine or cross-version determinism guarantee.

Editable production sources include:

- [Garment shape](../../../../prototypes/hero-garage/art/garment-shape/ "archived prototype path; not copied"), [fitted hem](../../../../prototypes/hero-garage/art/garment-hem/ "archived prototype path; not copied"), [inner-shell repair](../../../../prototypes/hero-garage/art/sleeve-shape-final/ "archived prototype path; not copied") and [continuous cuff bands](../../../../prototypes/hero-garage/art/cuff-band-final/ "archived prototype path; not copied"), derived from the continuous sweatshirt, hood and sleeve sources.
- [Indigo denim surface](../../../../prototypes/hero-garage/art/denim-surface-final/ "archived prototype path; not copied"), [fitted footwear](../../../../prototypes/hero-garage/art/footwear-finish/ "archived prototype path; not copied"), [visible lacing](../../../../prototypes/hero-garage/art/footwear-lacing/ "archived prototype path; not copied") and [glove surface](../../../../prototypes/hero-garage/art/glove-surface/ "archived prototype path; not copied"); their build reports identify retained geometry and contact constraints.
- [Saved head and curls](../../../../prototypes/hero-garage/art/head-groom/ "archived prototype path; not copied") and [identity assembly](../../../../prototypes/hero-garage/art/full-rider-identity/ "archived prototype path; not copied"). Preserve the user's preferred face, beard and curly groom.
- [Bike exhaust finish](../../../../prototypes/hero-garage/art/bike-exhaust/ "archived prototype path; not copied") and its earlier contour, paint, structural-finish and mechanical-detail source chain.
- [Settled animation family](../../../../prototypes/hero-garage/art/seated-posture/family/ "archived prototype path; not copied"), with explicit base/output arguments so it can be applied to the final garment assembly.

Regenerate the consolidated master from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python prototypes/hero-garage/art/delivery/build_master.py
```

The recipe reads the catalog, decodes its Meshopt-compressed assets into temporary uncompressed GLBs using [unpack-art-lossless.mjs](../../../../assets/blender/unpack_meshopt.mjs), imports those exact decoded assets and removes the temporary files. Direct import of the compressed rider fails in the current Blender 5.2 importer. Do not work around that failure by substituting an older raw asset. The decoder uses Three.js MeshoptDecoder, preserves retained buffer-view data and scene/accessor metadata, and records catalog and decoded hashes. The master report compares imported action durations with the actual catalog samplers.

For local Three.js review, run `npm run build` in the prototype. `node tools/package-runtime.mjs` creates the local review package; it does not publish or integrate the assets into the game. Use the repository's headless capture harness for recorded review.

## Materials and dependencies

[material-contract.json](material-contract.json) records actual material names, PBR factors, image hashes, texture slots, color-space semantics and active mesh bindings from the catalog exports. Base color and emissive maps are color data; normals, occlusion, roughness and metallic channels are linear data. Preserve glTF texture transforms and material extensions. The Three.js loader must use MeshoptDecoder for these GLBs.

Local recipes use Blender 5.2.1, Node with the prototype lockfile dependencies, and Python 3.14 with pinned NumPy/Pillow for the cuff texture helper. The master packs its images; the full component recipe inputs remain in the repository.

## Rig and coordinate contract

The retained rider skeleton has **19 bones**, with **26 documented sockets**. [The rig contract](RIG_CONTRACT.md) explains names, inverse binds and contact measurements. Regenerate `reports/rig-contract.json` from the current catalog with `node tools/export-rig-contract.mjs` inside the prototype; its hashes must match the assets being integrated. Three.js may sanitize punctuation in names, for example `gripSocket.L` to `gripSocketL`.

The six clips are:

| Clip | Duration at 30 fps | Purpose |
|---|---:|---|
| `sit_cruise` | 59/30 s | Settled seated neutral |
| `forward_attack` | 119/30 s | Forward rise and return |
| `hang_back` | 119/30 s | Rearward shift and return |
| `compression` | 149/30 s | Compression cycle |
| `extension` | 149/30 s | Extension cycle |
| `landing_absorption` | 149/30 s | Landing absorption and recovery |

The accepted settled family shares the forward-leaning neutral entry/exit pose. Its other clips ease that added torso offset away over the first 0.5 seconds and restore it over the final 0.5 seconds; existing middle target poses are preserved. The family verifier checks all 750 exported frames, protected lower-body/hand transforms and shared initial/final poses.

Blender uses metres, **Z up and +X forward**. glTF uses metres, **Y up and +X forward**. Both catalog assets use placement `[0, 0.34, 0]` in glTF coordinates. Common floor grounding and garage suspension are separate viewer operations. Evaluate the rider animation before the shared chassis/suspension transformation.

Grip and sole sockets describe attachment relationships. Sole sockets intentionally sit approximately **11 mm above peg centres**. Socket agreement alone does not prove that shoes, fingers, cloth or seat surfaces make correct contact or avoid penetration. Refer to the component surface/contact reports and recorded motion for those claims. The rig has no independent finger or forearm-twist chains. Existing game physics/body-mass mapping must govern integration; these preview clips are not a replacement physics system.

## Verification boundaries and remaining work

Accepted changes have recorded full-scene and detail reviews under garage and neutral lighting. Asset assembly, contact-preservation, suspension, packing and animation reports establish their specific measured invariants; they do not establish final art quality. Historical reports remain evidence for their recorded hashes only.

Remaining quality work includes final garment silhouette/fold approval, collar and hem finish, close-up material consistency and reference resemblance. The fitted hem and final trim/surface corrections are accepted provisionally. Shoulder/elbow folds and glove/thumb shapes remain stylized; broader anatomical sculpting is still needed to approach the reference. The dense groom remains expensive; lossless packing reduces transfer/storage size without reducing its geometric workload. No actual iPhone performance pass is established for the current dense rider. The final 30-second desktop WebKit mobile proxy rendered without errors and matched deterministic canvas replay, but measured 18 ms p95 and did not meet the separate 16.7 ms desktop wall-clock gate. This is not a GPU timing or physical-device result. The garage target remains 30 fps, with physical-device validation still required. Game integration and its acceptance belong to the separate integration task.

Delivery files: [local ZIP](../../../../prototypes/hero-garage/art/delivery/hero-garage-handoff.zip "archived prototype path; not copied"), [full/detail screenshots](../../../../prototypes/hero-garage/captures/delivery-stills/ "archived prototype path; not copied"), [all six clips under two lights](../../../../prototypes/hero-garage/captures/delivery-motion/six-clips.webm "archived prototype path; not copied"), and [chained pose transitions](../../../../prototypes/hero-garage/captures/delivery-transitions/transitions.webm "archived prototype path; not copied"). The ZIP includes the editable master, exports, reference, review images/video, rig/material reports and source notices. Full rebuild inputs remain in this repository.

The final rider is 60,161,596 bytes; bike is 5,682,208 bytes. The selected assets total 3,694,836 triangles. The all-image RGBA8+mip estimate is about 309 MiB, excluding geometry, render targets and driver allocations; it is not measured GPU residency. The 71.54 MB local runtime package excludes the large source studies. These are dense appearance assets, with phone suitability still unproven.

The reopened Blender master retains all six actions, 19 bones, the seated default and 39 packed images;750bone-frame samples are finite. See [reopen verification](../../../../prototypes/hero-garage/reports/delivery-master-reopen.json "archived prototype path; not copied"). Component skin/surface checks and Three.js motion evidence remain separate from that structural check.

The whole production plan remains open. Preserve the distinction between a successful rebuild, a technically verified export, provisional visual acceptance and the user's final approval.

## Source terms and attribution

This is a local personal-project delivery. Preserve source notices and provenance alongside derivatives:

- Original editable body and bike sources: `assets/blender/source/` at repository root; retain repository/source notices.
- MPFB/MakeHuman generated head and core asset data, including the selected skin pack: **CC0-1.0**, as recorded in [authored-human provenance](provenance/authored-human/provenance.json) and its asset license files. Tool/code licensing is separate from generated asset licensing.
- Grinsegold beard and moustache: the official asset pack says **CC-BY**, while embedded MHCLO headers contain **AGPL** notices. [Authored-beard source records](provenance/authored-beard/) retain that unresolved conflict. Do not infer public-distribution clearance from local use.
- Curly hair derives from **Daniel Bystedt's Hair Styles Blender demo**, **CC BY-SA**, with the version unspecified in the saved upstream evidence. [Replacement-hair provenance](provenance/replacement-hair/provenance.json) records the source. Preserve attribution and applicable share-alike obligations.

Neither Hunyuan nor TRELLIS output is part of this delivery. Their stopped experiments are independent of the authored asset pipeline. No public release or blanket redistribution clearance is claimed.
