# R13 arm diagnosis: reject small elbow fairing

No runtime or physics bug was demonstrated in the sampled played states. One local sleeve fairing study was measured and rejected. It was not exported, captured, promoted or presented as a visual improvement. The procedural reconstruction remains stopped; this study does not bypass that decision.

## Recorded motion

`measure-traces.mts` reads the parent's canonical Street normal-camera `arms-r13/before-hop` recording and the prior openface crash trace. It applies their actual state snapshots through production `FrameBuilder`, `GltfRider` and the production GLTF decoder. Images are omitted from the CPU decoder only. Outputs retain capture paths and hashes. Four actual hop deformation samples are written into scratch storage for the mesh measurement.

- Ordinary hop 180–360: elbow interior angle 55.92–137.51°, actual grip error below 0.000000234m. The acute elbow is a real reachable triangle.
- Crash tick 348: sagittal shoulder extension 18.50°, elbow interior168.50°. This extension alone is not proof of invalid anatomy and does not justify changing crash timing.
- The earlier suspected singular-pole fallback and too-close debug error are not triggered by these ridden states: crash-prefix pole height stays above 29mm versus the 1 mm fallback threshold; wrist reach stays well above the 50 mm inner triangle limit.
- Physical posing bypasses additive clips. Changing the clip animation cannot repair this riding pose. The elbow pole is fixed in chassis space in `src/physics/v2/rider.ts`; modifying it only in the renderer would violate the shared physical mass-map contract.

## Sleeve measurement

The source sleeve is already authored with bent elbows. The runtime-to-Blender bind-matrix discrepancy was at most 3.88e-7. Measurements cover the sleeve vertices within 120 mm of either elbow whose upper-arm plus forearm weight is at least 0.95: 1695 vertices / 3218 triangles.

| Hop tick | Interior elbow | Minimum blended-transform determinant | Original nonadjacent intersection pairs |
|---|---:|---:|---:|
|242|79.05°|0.9981|261|
|292|55.92°|0.9459|279|
|316|66.17°|0.8941|329|
|336|96.67°|0.9839|227|

At tick 292, median triangle area ratio was 1.0000 and its fifth percentile 0.9175. There is no evidence of broad linear-blend collapse **in these sampled poses**. This does not establish quality across all animations, remove the visible sharp silhouette, or rule out localized deformation defects. The determinant describes a blended transform's local volume scale, not a watertight garment-volume measurement. BVH intersection counts are diagnostic pairs, not visually weighted severity; 251 pairs already exist in the rest surface.

## Rejected candidate

`harness/out/blender/arms-r13/street-elbow-v1.blend` changes 1137 sleeve vertices by at most 3 mm, tapering to zero 90 mm from the elbow. Four fairing iterations preserve weights, topology, materials, rig, actions, sockets, other meshes and every vertex outside the selected region. The source hash and candidate hash are in `candidate-provenance.json`. No third-party inputs were added; inherit [R9 provenance](../hero-r9-inputs/THIRD-PARTY.md).

The small intersection reduction does not justify this edit:

| Tick | Intersection pairs before→after | Worst area ratio before→after | Largest area ratio before→after |
|---|---:|---:|---:|
|292|279→274|0.476→0.453|1.869→2.771|
|316|329→321|0.252→0.228|1.449→2.362|

This worsens the worst triangle distortion and does not address elbow direction or the garment's large-scale silhouette. No further small fairing iteration is recommended. Any larger motion/garment redesign needs its own bounded proposal and played review; this report is not permission to change physics or resume the stopped reconstruction.

## Reproduction

From the repository root:

```sh
pnpm exec tsx docs/evidence/hero-r13-arms/measure-traces.mts
blender -b --python-exit-code 1 --python docs/evidence/hero-r13-arms/inspect_elbow.py
blender -b --python-exit-code 1 --python docs/evidence/hero-r13-arms/inspect_elbow.py -- harness/out/blender/arms-r13/street-elbow-v1.blend harness/out/blender/arms-r13/after-inspection.json
```

`fair_elbow.py` reproduces the single rejected source study from the canonical Street source and deliberately refuses to overwrite its candidate. It is included for provenance, not as a recommendation. Full per-vertex measurements and actual deformation matrices remain under `harness/out/blender/arms-r13`; compact measurements, scripts and hashes are preserved here. The existing played baseline was reused; no duplicate footage was recorded.
