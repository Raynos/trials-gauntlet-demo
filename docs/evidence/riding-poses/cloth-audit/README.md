# Runtime garment diagnostics — riding poses

This is **open defect triage, not cloth acceptance**. The parent must judge played clips. `audit.ts` uses the
production GLB decoder, actual skin weights/bind matrices and `GltfRider.update()` on the shared physical target
path. It evaluates all five outfits, full and LOD, at nine lean values. It does not edit assets or runtime code.

Run from the repository root:

```sh
pnpm exec tsx docs/evidence/riding-poses/cloth-audit/audit.ts
```

`report.json.gz` records source hashes, source-code stability during the run, per-region deformation, sampled bike
intrusions and candidate coordinates. Coordinates are metres in the axle-centered bike frame, not world space.
`hipResidual` independently checks the actual pelvis bone against the requested hips (6 mm fixture error limit).
The diagnostic self-test checks an independently constructed cube's interior/exterior/depth and a collapsed triangle.

## What is measured

- Actual CPU-skinned triangles, not bone positions alone. Triangle area below 10% of its initial decoded area and
  edge stretch above 2× trigger inspection. These are triage thresholds, not approved garment quality bars.
- The same triangle is compared with the delivered authored clip blend (`sit_cruise`, `hang_back`, `forward_attack`
  at 1.75 seconds). New threshold crossings distinguish runtime deformation from already present authored strain;
  they do not automatically prove a defect, because the target poses themselves differ.
- UV/seam vertices coincident within 1 micrometre in the source position buffer are tested for separation above
  2 mm. This catches cracks created by different weights at a shared position. It cannot detect every preexisting
  opening, and does not prove all meshes meet continuously.
- A six-axis ray visibility probe labels candidate points either exposed along at least one axis or occluded in
  all six. This distinguishes likely buried garment overlaps from inspection candidates. It is not the game camera,
  includes neither textures nor transparency, and cannot certify visibility through a moving sequence.
- Every eighth rider vertex is tested against actual static bike `bodywork`, `engine` and `frame` triangles for both
  Rookie and Pro files. Three non-axis ray parity tests must agree, then the closest surface must be more than
  5 mm away. Open/nonmanifold or intersecting bike components can confuse parity. Wheels, suspension travel, bars,
  every unsampled vertex and swept collision are not covered. Counts are penetration candidates, not hard verdicts.

The final rider GLBs have a merged `rider_body`; original hoodie, hood, jersey and underlying anatomy are not
individually named meshes. Region labels use the strongest weight of the first triangle vertex. Thus `chest` or
`upperArm` can contain both hidden body and outer cloth. Material maps are omitted by the Node loader; material
opacity and appearance need the played renderer. The script does not claim garment/body self-intersection coverage.

## Capture targets from the corrected shared-target run

Half-forward (`lean=+0.5`) creates many more new deformation alarms than full forward. Inspect the transition, not
only the endpoints. The first fixture run omitted the chassis-to-axle offset; it was discarded and replaced. The
report now includes the independent hip-frame check to prevent that error recurring.

| Outfit / target | Candidate | Why inspect it |
|---|---|---|
| Street Mustard full, +0.5 | Right forearm near `(0.240, 0.882, -0.079)` | An exposed candidate edge stretches about 4.37× initial length versus 2.16× in authored blend; look for sleeve pinching/spikes during forward rise. |
| Street Mustard full, +1 | Right upper arm near `(0.478, 0.823, -0.195)` | Exposed candidate edge about 2.35× versus authored 0.90×; inspect elbow/arm contour from the near side. |
| Race Blue/White full, +0.5 | Both shoulder roots and neck, approximately `(0.14, 1.16, ±0.16)` | Strong new strain, but the largest examples are occluded along all six axes; do not call them visible tearing without a clip. |
| Both families, -1 → 0 → +1 | Chest/bodywork and thigh/seat contacts | Sampled surface intrusion candidates remain; use changing views to distinguish buried body geometry from exposed clothing. |

For +0.5, new collapse / new stretch threshold crossings versus authored blend were:

| Asset | New collapsed triangles | New stretched triangles |
|---|---:|---:|
| Street Mustard full / LOD | 144 / 14 | 1054 / 74 |
| Street Charcoal full / LOD | 144 / 14 | 1054 / 74 |
| Street Openface full / LOD | 149 / 17 | 1076 / 78 |
| Race Bluewhite full / LOD | 126 / 17 | 479 / 69 |
| Race Charcoalyellow full / LOD | 126 / 17 | 479 / 69 |

No tested coincident-vertex seam pair separated by more than 2 mm in this target sweep. Existing authored geometry
already has substantial strain, including buried shoulder/arm components. Neither fact closes the clothing row.
The report's samples are capped inspection examples; per-region counts cover every nondegenerate triangle.

## Remaining evidence

Real ridden impact/hop/crash states, each outfit/LOD in motion, full garment/body self-intersection, camera-visible
cloth/bike penetration and iOS Safari appearance remain the parent acceptance work. This static target sweep is
instrumentation to choose closeups and identify regression candidates. It does not replace those requirements.

## Played rear-fender overlap: confirmed candidate defect

The parent's played sequence (`/tmp/trials-poses-round2-visual/controls/evidence.json`, 4.5–4.7 s) showed the rider
sinking into the rear fender. The closed-volume parity probe above did **not** reliably flag the pelvic region:
bodywork includes open surfaces. A separate direct upper-surface probe is therefore required.

`rear-support.ts` reconstructs the actual physical body from each recorded state, skins the real garment, and casts
vertical rays onto the bike's double-sided bodywork at the same `(x,z)`. It examines all vertices with at least 50%
combined pelvis/thigh influence in `x=[-0.9,-0.5]`, `|z|≤0.2`. This includes buried as well as outer geometry;
it establishes occupied-envelope overlap, not closed-solid intersection or final camera visibility. Paired with the
parent's played footage it localizes the failure. Fender support itself was sampled at `|z|≤0.14`.

```sh
AUDIT_RIDER=rider-street-mustard.glb AUDIT_BIKE=rookie \
  pnpm exec tsx docs/evidence/riding-poses/cloth-audit/rear-support.ts \
  /tmp/trials-poses-round2-visual/controls/evidence.json
```

- Rookie rear-fender upper surface spans **0.4794–0.5504 m** over the sampled band.
- At played time **4.533 s**, the worst tested Street Mustard vertex is `(-0.65494,0.27037,-0.00598)`;
  matching fender top is `0.52330`, a **252.9 mm** vertical overlap. 625/792 tested vertices lie >5 mm below top.
- Static full-back hips `(-0.66,0.46)`, torso 40°, give 218.5 mm overlap. Raising only to `hipY=0.65` still
  leaves 44.7 mm overlap. These candidates cannot satisfy rear garment clearance.
- Testing hips `(-0.66,0.72)`, torso 40°, across all ten rider files and both bike classes gives positive clearance:
  Street Openface full **6.70 mm** (limiting case), Street full **13.06 mm**, Street LOD **12.85 mm**, Race full
  **19.35 mm**, Race LOD **31.27 mm**. Rookie and Pro rear bodywork produce the same values here.

All twenty per-rider/per-bike reports are `rear-support-rider-*.json`. `rear-support.json` is the initial Mustard
played-state measurement before adding the 0.72 m candidate; it remains a record of that first focused run.
A raised target is not a complete fix: actual impact excursion must obey support too, and the minimum positive
candidate clearance is small. Physics owner must retune and parent must replay the same sequence before acceptance.

## Candidate follow-up: physical playback and garage independence (2026-09-21)

The first shoulder conditioning candidate left large chest/neck seam outliers. Its results are preserved in
`report-2026-09-21-roll-shoulder-candidate.json.gz`. The file named `report-support-pre-twist-unverified.json.gz`
was later found to have the **same renderer hash**, so it is not an independent pre-change baseline.
`report-pre-support-failed.json.gz` remains the older failed physical-pose snapshot.
`report-2026-09-21-neck-seam-candidate.json.gz` includes the subsequent retained-neck-influence correction.
Static audit geometry retains original mesh partitions but omits material assignments; the played and stage
probes below retain the original material table and run `prepareHero`, matching production grouping.

`played-audit.ts` runs the two committed `lean-transitions-{rookie,pro}.json` recordings through actual `Game`
and V2 physics, builds production frames, and updates production `GltfRider` at all 120 input ticks/second.
It skins every vertex and checks every nondegenerate triangle at **12 geometry samples/second**, including the
first tick. All ten outfit/detail files run for both classes. The time values are input tick/120, which can be
aligned with the parent's clips. Rear clearances use the actual skin and bodywork upper surface at matching
bike-local `(x,z)` over `x=[-0.95,-0.5]`, `|z|≤0.2`; all pelvis/thigh-majority vertices are considered.
This open-surface envelope detects the original fender defect that parity-based solid tests missed.

Stretch candidates include chest, spine, neck, head and arm regions. Their axis-exposure labels are inspection
hints, not camera visibility: garment-hidden anatomy may still be counted, and a top-100 strain shortlist can
omit smaller exposed defects. Twelve-Hz samples can miss brief excursions; neither target-grid statistics nor
this sampled numerical playback substitutes for the required played visual review. Hand/boot contact and mass
agreement are independently covered by the renderer owner's tests.

`stage-audit.ts` compares production `setStage(true)` geometry against the untouched original GLB weights and
original `sit_cruise` clip, through the same material-preserving preparation. It hashes original weights before
and after construction to catch accidental source mutation. The first candidate changed vertices by up to22mm
and introduced collapse/stretch threshold crossings; that failure is retained as
`stage-2026-09-21-conditioned-garage-regression.json`. With conditioning restricted to riding, all ten stage
fixtures have unchanged original weights, zero new threshold crossings, and at most **44.56 micrometres** of
vertex difference from original clip playback (the renderer normalizes quantized animation rotations).

The bounded Openface support probe includes reachable hips x=-.70/-.60/-.55 and torso20/30/40/50/60 degrees.
A fixed0.12m support radius failed by21.15mm at x=-.60,20 degrees; its report remains
`rear-support-support-sweep-fixed-radius-failed.json`. The revised angle-dependent support adds up to30mm at
20 degrees, fading to zero at40 degrees. All nine reachable sampled cases then have positive skin clearance,
minimum **2.85mm**, in `rear-support-support-sweep-rider-street-openface-rookie.json`.
This bounded check is not a proof across all angles, outfits, impacts or continuous time.

```sh
pnpm exec tsx docs/evidence/riding-poses/cloth-audit/played-audit.ts
pnpm exec tsx docs/evidence/riding-poses/cloth-audit/stage-audit.ts
AUDIT_SUPPORT_SWEEP=1 AUDIT_RIDER=rider-street-openface.glb \
  pnpm exec tsx docs/evidence/riding-poses/cloth-audit/rear-support.ts
```

The largest remaining played edge-ratio candidates need scale-aware inspection. The Street merged
`rider_body` triangle25589 has original edges0.812/2.697/3.306mm; Race triangles15596/15599 share a1.357mm
edge. Their high ratios can describe approximately centimetre-scale local deformation, not a large limb spike.
`edge-scale-probe.ts` reports the original edge lengths without changing source data. Triangle IDs in the
material-preserving played report can differ from raw-partition static IDs; use mesh, outfit and center together.

The final frozen-source run is `played-candidate-report.json.gz` (generated2026-09-21T09:07:53Z; all four
recorded code hashes stable). Its compact table is [PLAYED-CANDIDATE.md](PLAYED-CANDIDATE.md): **20subjects,
840riding ticks and85geometry samples each; no ragdoll ticks; zero sampled rear-envelope overlaps beyond5mm**.
The minimum sampled rear clearance is **8.226mm at4.333s**, Pro Street. This is a sampled-clearance finding,
not completion of garment visual review. The immediately preceding pre-cache-optimization run is retained in
`played-2026-09-21-pre-cache-optimization.json.gz`; its source-stability flag is false because the renderer owner's
cache optimization landed during the run, so use the frozen report for claims.

Capture review candidates remain Street forearm.L near6.167s/4.167s and Race upperArm.R near3.583s/5.583s;
coordinates, triangle IDs and perclass times are in the compact table and raw report. All requested production
input phases were replayed without manufactured pose states. Any later physics or renderer change requires
regenerating these records or explicitly treating them as historical.
