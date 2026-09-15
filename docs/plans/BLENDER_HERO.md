# Blender hero — rider, bike, and Three.js integration

Owner: Codex Blender session. Branch: `blender-work`, in the explicitly authorized
`trials-gauntlet-blender` worktree. Baseline: `56e3883` (2026-09-15).

Status: first rig/integration repair implemented and checked; visual rebuild,
mechanical reconstruction and final merge handoff remain open. Track this plan
in `PLANS.md` at every commit.

## Mandate and boundaries

The user assigned this session all Blender rider/bike work and its Three.js
integration. Trials Fusion / Trials Rising gameplay is the quality reference.
Replace the existing model if its construction limits the result. Judge the
hero in played gameplay, including close views, rather than posed turntables.

This plan owns `assets/blender/**`, `public/models/**`, the hero rendering and
pose integration, their tests, and the evidence needed to verify them. Physics,
tracks, audio, navigation, and broad world rendering remain trunk concerns.
Preserve replay trajectories and clock bytes. The first integration round also
publishes the already-defined `riderBody` field from the physics getter; this is
an interface repair, with no solver/tuning/layout change. Do not merge into
trunk or deploy from this branch.

The quality bars are `docs/mission.md` sections 1, 3, and 4. This plan supplies
measurable gates; passing them does not by itself establish AAA quality.

## Repository map and prior work

- `src/core` defines state, units, fixed ticks and replay serialization.
  `src/physics/v2` owns the current simulation, including a separate rider body.
- `src/render/frame.ts` interpolates physics; `bike/bikeModel.ts` places the
  visual chassis; `hero/gltfBike.ts` drives mechanical nodes;
  `rider/pose.ts` and `hero/gltfRider.ts` map the rider into the exported skeleton.
- `hero/gltf.ts` / `lod.ts` handle meshopt decoding, material variants, textures,
  spoke blur and whole-document LOD selection. `src/render/index.ts` integrates
  live/ghost instances, lighting, quality changes and replacement.
- `assets/blender/build_{rider,bike}.py` and `common.py` generate geometry,
  skinning, clips, atlases, `.blend` files and compressed GLBs. The `.blend`
  files currently are generated outputs: regeneration overwrites hand edits.
- `harness` supplies recorded input, bots, strangers, deterministic replay,
  played captures, comparisons and the ship gate. Reference video manifests
  are tracked; their actual videos are ignored and were absent in this worktree.
- `MEGA_PLAN.md` covers the overall game; `RIDER_ON_GLASS.md` carries hero and
  device gates; `physics-v2.md` is the historical design, with shipped status in
  `docs/design/physics.md`; `PERF.md` contains a measured performance plan.
  Some tracker rows and older design sections lag subsequent commits.
- `docs/design/CONTRACT.md` and executable types take precedence over old
  descriptive tables. `project/archive/README.md` governs archive moves; status
  documents remain in place. Nothing is ready for archival from this audit.

Relevant hero history, oldest first:

| commit | finding or change |
|---|---|
| `5c3c343` | procedural hero reconstruction and shared grip/peg geometry |
| `2fd0a62` | Blender GLBs, 19 rider joints, 8 clips, named bike parts |
| `623639f` / `7bf8cab` | reference pose chain, elbow pole, lean/crouch mapping |
| `17abb96` | live glTF integration; later fixes normalize sanitized bone names |
| `47f0455` | suit graphics, material variants, low-detail assets, spoke cards |
| `71d1988` | state-driven landing/hop, LOD and hero shadows |
| `0486dcc` | unsafe shader-program pruning removed; arm IK after additive clips |
| `6081104` | lofted body and helmet volume on the same rig and clips |

## Baseline findings

The existing skeleton's canonical poses are substantially sound. The current
animation integration can corrupt that skeleton over time; rebuilding geometry
alone would retain those defects.

1. **Idle shoulder drift, reproduced using the real GLB and runtime class.**
   Additive translation tracks accumulate because only pelvis position resets.
   A shoulder moves 27.4 cm over 3,600 updates / 60 simulated seconds; a cut
   retains the error. Arm IK keeps the wrist on its grip, hiding the distortion
   from the existing contact diagnostic.
2. **Landing lifts feet.** Arms are solved again after additive motion; legs
   are not. At summed compression 1.6, an actual foot-bone anchor moves 13.9 cm
   off its target in one frame. Test exported joints, not only `pose.ts` output.
3. **Mechanical nodes disconnect.** A numeric probe of actual exported node
   transforms and current runtime/physics found up to 3.72 cm swingarm/axle,
   12.27 cm shock/linkage, 26.93 cm chain/sprocket and 2.32 cm fork-axis error
   during a flat run with a lean reversal. These are attachment measurements,
   not aesthetic judgments.
4. **Coordinate and instance errors.** Wheel world rotation includes chassis
   pitch twice; shock aiming discards authored roll (90 degrees at rest).
   Live and ghost share a mutable chain texture. Ghost material replacement
   leaves spoke fades pointing at old materials. Contact-blob resources are
   not disposed on bike replacement.
5. **Surface and asset limitations to judge in motion.** Disconnected garment
   shells, rounded helmet forms, missing bike control cables, no baked AO,
   absent hero self-shadow, and all-double-sided materials warrant a visual
   reconstruction review. The full bike spends about 46% of its 29,740 triangles
   on the two wheel bodies. LOD reduces triangles but retains 20 primitives.

Baseline `pnpm check`: 37 test files, 577 passed, 11 todo; typecheck, lint and
build passed. Those tests did not catch the actual-GLB defects above.

### Deeper audit: the descriptions and checks were not the behavior

- **V2 never exported `riderBody`.** The type and renderer path existed, but the
  getter omitted it. Actual V2 play used the legacy pose follower and timed
  clips. Existing tests compared `undefined` to `undefined`; the H2 table in
  `rendering.md` described a path that was not active.
- **Transient reference poses were wrong for additive use.** `land_absorb`
  starts in extension; `extend` starts in crouch. Subtracting those openings
  before layering onto an unrelated live pose roughly doubled displacement
  versus a shared neutral reference. Quantized quaternion samples also needed
  normalization to preserve bone lengths; fixed scale alone did not prove this.
- **Rotating-frame velocity was incomplete.** Subtracting only chassis-origin
  velocity made a rigidly attached rider appear to extend at 1.68 m/s in a
  -6 rad/s rotation. Relative up velocity must subtract chassis angular
  velocity times local rider X. A finite-difference trajectory test checks it.
- **The saved Blender pose is not the exported bind pose.** The source retains
  nonidentity poses after action construction; the GLB exports armature rest
  position. Bind weights, transforms and ordinary linear skinning are sound.
  The rider has 51 connected components and no twist bones or corrective
  shapes. Reference prose and canonical elbow/torso angles also disagree.
- **Inherited capture timestamps and history are unreliable.** Its alpha=0
  shows a prior rendered pose while reporting the current tick. Skipped prefix
  rendering changes camera/air/animation history. Odd input windows overshoot,
  and `ticksSimulated` is actually resettable segment tick.
- **Inherited rule and hash checks miss real disagreement.** The Node rule
  mirror erases faults on a restart before checkpoint 1; production Game keeps
  them. Physics hashes exclude those counters. A Pro-only replay helper skips
  rate validation. Some browser paths ignore a recording's solver version.
- **Inherited comparisons can fabricate duration.** Normalization can repeat
  15 source frames into 105 output frames. Default 30 fps drops half a native
  60 fps reference. No fallback-asset assertion or content-hash binding exists.
  Therefore no fresh H5 win rate is claimed from that inherited pipeline.

The user explicitly required first-principles verification. New probes use
production Game, raw snapshot/counter bytes, the real compressed GLBs, actual
bone matrices and frozen-build response bytes. The probes themselves received
independent review: fresh output directories, exact frame limits, solver/rate/
class/seed checks, fatal execution errors, and explicit `(from,to]`, 30 fps,
alpha=1 sampling semantics. Bone origins are **rig anchors**, not a measurement
of glove/boot surface contact. Native iOS and production interpolation remain
separate checks.

## Work sequence

| round | deliverable | gate |
|---|---|---|
| 1 | restore rig transforms per evaluation; constrain actual hand/foot contacts after secondary motion | real full/LOD GLB regression tests; idle/cut stability; landing/hop contact error under 1 cm; played before/after clips |
| 2 | coherent mechanical articulation, physical-to-visual rider mapping and independent live/ghost state | authored attachment markers; closed fork, swingarm, shock and chain through travel; world wheel phase; drawn hips/torso versus actual body; no resource growth on replacement |
| 3 | rider/bike art direction and authoring sources that preserve hand edits | reference motion comparison; editable source distinct from generated exports; cold boot, clear, crash and instant restart |
| 4+ | replace inadequate forms/topology; garment deformation, helmet, gloves/boots, bike detailing and PBR materials | gameplay and close-view motion; full/LOD class parity; measured draw/texture/triangle cost; repeat named-tell review |
| final | integrated branch and concise trunk-agent handoff | complete check, replay equality, desktop and phone-geometry clips, explicit actual-iOS evidence status, merge instructions with known limitations |

Each round is one commit whose subject states its finding. Update this plan and
the tracker with evidence and remaining work. Repeated visual tells require a
different construction approach, not indefinite small tweaks.

## Evidence and reproducibility

### Round 1 results

- `pnpm check`: 40 files, 596 tests passed, 11 todo; typecheck, lint and build pass.
- Two independent production-Game comparisons prove unchanged solver bytes and
  clocks: Node through complete ridden trajectories, and frozen browser builds
  at every one of 23,017 input ticks. Publishing `riderBody` expands canonical
  hashes; it does not change trajectories, finish events or same-field clock bytes.
- Full/LOD real-rig tests cover history invariance, fixed segment lengths,
  contacts, transient reference semantics and ragdoll/reset. Separate review
  scanned 23,100 pose combinations and found the rotating-frame velocity issue;
  that issue was fixed before this round's final capture.
- `r1-reviewed-landing` and `r1-reviewed-landing-b`: 88 captured PNGs all
  byte-identical, with identical encoded MP4s. Consumed GLBs match frozen-file
  SHA-256 hashes; the live scene uses the actual `bike rider` documents.
- The independent landing trace's worst measured wrist/ankle anchor errors
  are 2.11e-7 / 1.73e-7 m. These are bone-origin errors, not glove/sole geometry.
- `r1-reviewed-crash`: 117 frames at 30 fps, actual crash and riding phases,
  with restored riding anchors after restart. This input pattern is explicitly
  stamped V2 in `crash-v2.json`; the old unstamped fixture otherwise means V1.
- Deliberately failing the rider request rejects capture with `procedural
  fallback, no parsed asset`; no misleading replacement clip is emitted.
- Played before/after footage supports the contact repair. The helmet/brace,
  garment construction and physical pose approximation still need reconstruction;
  H1/H5 and the actual-device gate remain open.

Use ignored `harness/out/blender/` for current footage, probes and reports. A
frozen baseline build is kept there. Explicitly rebuild after GLB changes;
the harness's source fingerprint does not identify renderer or asset changes.
Record commit and model hashes with every comparison.

Proven zero-fault baseline recordings, with identical state hashes at every tick
across two fresh Node simulations:

| recording | finish seconds | final state hash |
|---|---:|---|
| b1 Rookie bot-3 | 41.55833333333333 | `14f314acf2c5be93` |
| b3 Rookie bot-3 | 33.06666666666667 | `c24caa6771450950` |
| e2 Rookie bot-3 | 44.175 | `39238928bb85d7e7` |
| m1 Rookie bot-3 | 34.583333333333336 | `6c61583f2a7c685b` |

Useful capture windows: b3 ticks 655–1138 (air/landing/wheelie), e2 430–780
(drop/landing), m1 1940–2276 (hop), flat-test crash 0–468 (crash/restart).
The current h1 bot recordings fail and must not be described as successful
wheelie goldens. Historical reference measurements include withdrawn readings;
read the revision notice in `docs/research/frame-analysis.md` first.

Reference motion is recovered from the exact sources and windows in
`reference/techniques/manifest.json` and `reference/rising-visuals/manifest.json`.
Start with University of Trials' [bunny-hop lesson](https://www.youtube.com/watch?v=-a_ulossbyc)
and [landing lesson](https://www.youtube.com/watch?v=HU5qgS4DhwE), then wheelie,
crash/restart and the start close-up listed in those manifests.

Phone-sized headless Chromium evidence is not actual iOS Safari performance
evidence. Preserve that distinction in the final handoff and device report.
