# Blender hero handoff — paused WIP

**2026-09-15. The user requested a pause and checkpoint commit. This branch is
not ready to merge or deploy. The hero/physics mission is unfinished.**

Continue in `/Users/raynos/projects/game-demos/trials-gauntlet-blender`, branch
`blender-work`. This existing worktree was explicitly authorized; do not create
another checkout. The baseline was `56e3883`; the first verified repair is
`53142ab`. This document is included in the subsequent WIP checkpoint; use
`git log -2 --oneline` to identify it. No merge, deployment or push was performed
for this checkpoint. The 12-hour follow-up automation is paused.

## User decisions and scope

- Codex owns Blender rider/bike assets, animation and their Three.js integration.
  Trials Fusion / Rising gameplay is the reference. Rebuild inadequate geometry.
- **Street hoodie and jeans is the default. Keep both street and race outfits,
  selectable in the garage.** Outfit and Rookie/Pro bike class are independent.
- The user explicitly authorized physics repairs after the rider-body mismatch
  was demonstrated. Changed physics may change finish times; repeated inputs on
  the corrected solver must still produce byte-identical results.
- Audit inherited scripts, tests and documentation before relying on them.
  Browser evidence uses the headless harness; native Blender is authorized.
  Judge played clips, not posed stills. Actual iOS Safari remains a separate gate.
- The latest instruction is to pause, preserve in-progress work, write this
  handoff and commit. Do not describe that as mission completion.

Read [the plan](plans/BLENDER_HERO.md), [plan status](plans/PLANS.md),
`AGENTS.md` and `docs/mission.md` before resuming. The user supplied
[this finish-screen bug](evidence/rear-wheel-first-finish-arms.jpg): arms folded
backward on Rear Wheel First, 1:18.433 and four faults. It is a symptom to
reproduce; this checkpoint does **not** prove that specific finish bug fixed.

## Checkpoint validation

The parent froze implementations, ran `pnpm check`, then separately ran
`pnpm build` because the failed tests stop the chained check before its build.

| Check | Result |
|---|---|
| Application + harness TypeScript | Pass |
| Repository ESLint | Pass |
| Full Vitest run | **22 failed, 618 passed, 11 todo; 7 failed / 40 passed files** |
| Separate production build | Pass; JavaScript 453.7 / 600 KB gzip |
| Inline loader budget | 8,191 / 8,192 bytes — only one byte of headroom |
| Final played gameplay / fresh clears / actual iOS | Outstanding |

Failures are intentionally preserved; no golden inputs were repinned and no
test tolerances were relaxed to produce a green checkpoint.

| Failing file | Count | What needs investigation |
|---|---:|---|
| `src/physics/v2/feel.test.ts` | 4 | Static sag (25.15% vs 28–32%), snap-forward recovery, braking crash, air control |
| `src/physics/v2/r2.test.ts` | 2 | Reference hop (0.212 m vs 0.45–0.65 m) and tuck gain |
| `src/physics/v2/r3.test.ts` | 5 | Landing recovery, old intent-cap behavior, hop matrix, climb, tick cost |
| `src/physics/v2/r4.test.ts` | 3 | Old pose swing, touchdown impulse, on-ramp lift |
| `src/physics/v2/r5.test.ts` | 5 | Air limit, raw Pro response, hop/landing parity, blend, tick cost |
| `src/physics/v2/world.test.ts` | 1 | Tick cost: p95 23.958 microseconds vs 10 on this host |
| `src/render/hero/gltfBike.test.ts` | 2 | Full/LOD replay fork alignment: `2.0904009273570168e-8` vs `<1e-8` |

Some old physics assertions encode the prior mechanism, including its excessive
pose-swing torque. Review each against a physical or gameplay requirement;
do not blanket remove them. Braking, hop, recovery, clearability and performance
still need real validation. The bike discrepancy is near float32 precision;
establish an error budget before changing its tolerance, then run the complete
replay census. Neither failure category is waived here.

Earlier component checks passed: 16 rider servo/profile/state tests, 14 focused
real-bike geometry tests, 30 boot/UI tests, and the protected rider pipeline's
source-preservation/export/failure-isolation tests. Those component results do
not override the combined failures or establish visual quality.

The complete local logs are ignored files:
`harness/out/blender/checkpoint/check.log` and `build.log`. They are available
in this checkout, not carried by Git. Reproduce with the commands above.

## What is committed at this pause

### 1. Verified first repair — `53142ab`

Actual GLB tests exposed 27.4 cm of shoulder drift over 60 seconds and 13.9 cm
of landing foot displacement. Runtime additive translations accumulated, clips
used inconsistent reference poses, and legs were not re-constrained. V2 also
never published its existing `riderBody` field, so the intended physical-pose
render path was dormant. Relative rider velocity omitted the chassis angular
point velocity, producing a false hop signal during rigid rotation.

That commit repaired those issues with real full/LOD GLB regression tests.
Its check passed 596 tests, with 11 todo. Production Game comparisons across
23,017 ticks preserved snapshot/counter and same-field clock bytes. Repeated
landing captures had 88 byte-identical PNG frames and identical MP4s; landing
and crash/restart footage was played. These are **round-one results**, not proof
for this checkpoint's changed solver, new outfits or final mechanical frame.

### 2. Rider sources and exports

**Authoritative, editable files:**

- `assets/blender/source/rider-street.blend`
- `assets/blender/source/rider-race.blend`

Edit these in Blender, then use `rider_asset.py export`. Do not regenerate them
casually: `seed` refuses overwrite unless `--replace-source` is explicit.
`assets/blender/generated/` contains disposable baked copies and is ignored.
The legacy `rider.blend`, `rider.glb` and `rider-lod.glb` remain for baseline
comparison/tests; they are not the new outfit masters.

See [the asset workflow](../assets/blender/README.md). On this machine:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 \
  --python assets/blender/rider_asset.py -- export --outfit street
/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 \
  --python assets/blender/rider_asset.py -- export --outfit street --lod
```

Repeat with `race`. The exporter loads the source without saving over it,
stages outputs, bakes material variants, normalizes LOD skin weights, validates
actual Meshopt-decoded data, then publishes GLBs and `.source.json` provenance.
It retains sockets, 19 exact core bones and eight actions. Extra deform bones,
shape keys, Preserve Volume and unsupported modifiers require explicit
pipeline/runtime support; they currently fail validation. The source-protection
suite is `python3 assets/blender/test_rider_asset.py`.

Street has hoodie, denim and trainers; race has jersey and boots. The new forms
include an eyeport/chin guard, goggles, peak, curled fingers, opposing thumb,
shaped soles and laces. They remain procedurally assembled overlapping garment
parts. **Connected armholes/crotch, joint topology, deformation and material
polish are unfinished; this is not an AAA-quality verdict.**

There is one seed-generator-only finger-radius adjustment made after master
creation. It is not in the protected masters/current exports. Apply deliberately
to authored sources if useful, or remove it; never assume reseeding preserves
the current art. A local voxel/QuadriFlow experiment was not adopted: QuadriFlow
failed on manifold/normals despite script exit zero. Do not use that scratch
file as finished retopology.

| Runtime asset | Triangles | Bytes |
|---|---:|---:|
| `rider-street.glb` | 8,621 | 794,352 |
| `rider-street-lod.glb` | 5,879 | 477,164 |
| `rider-race.glb` | 10,621 | 934,136 |
| `rider-race-lod.glb` | 5,879 | 527,912 |
| `bike.glb` | 29,780 | 1,290,148 |
| `bike-lod.glb` | 5,716 | 442,688 |

Native Blender was left on an ignored scratch probe, not an unsaved master.
Open the authoritative file explicitly when resuming.

### 3. Shared rider physics and pose — WIP

`src/physics/v2/{rider,bike,tuning}.ts` replaces the conflicting grip/peg force
servo with a bounded coupled COM/relative-angle wrench. The original impact
witness generated about +2,275 Nm from positional forces against only −300 Nm
of angular correction. The new solve couples effective mass, caps force and
torque, and has conservation/passivity tests. A whole-body segment mass profile
provides shared forward/inverse COM maps, contacts and anatomical constraints.
The neutral aggregate inertia is a fixed approximation, 8.5055 kg m².

The new API is `makeRiderRigPose`, `riderRigFromCOM`, `riderRigFromHips`,
`RIDER_PROFILE` and `RIDER_TORSO_REST`. Positions are in the bike's reference
axle frame; returned elbow/knee/wrist/ankle/grip are left (+Z), mirrored for the
right. Torso angle is 40 degrees plus the wrapped rider-body angle relative to
the physical chassis. Arm lengths are .32/.27 m, legs .46/.43 m, torso .52 m;
the anatomical wrist is offset from the grip by (−.025,+.055) m.

**Known numerical gap:** preparation skips a constraint row if the inverse
mass-map residual exceeds `1e-4` or its Jacobian is singular. Covered poses and
the impact witness pass, but out-of-domain behavior needs an explicit robust
policy. This guard is not proof that limbs always stay attached.

The final suspension correction keeps spring force explicit and applies
implicit damping only to relative motion, including angular effective mass.
It removed a neutral-rest jitter in the focused tests. Full feel, energy,
convergence, clearability and cost still need work. The saved E2 pre-impact
fixture is a diagnostic witness, not a successful finish recording.

`src/render/hero/gltfRider.ts` uses this inverse COM map for new socket-equipped
outfits with `riderBody`, then poses the bones without legacy additive pelvis
motion. Authored `gripSocket.L/R` and `soleSocket.L/R` distinguish contact from
bone origin; hand orientation is held in the bind grip frame. Debug fields
include `physicalPose`, `comResidual`, `gripErr` and `gripAngleErr`.
**The old GLB tests still load legacy rider files. Add actual street/race,
full/LOD pose-grid and playback coverage before trusting this new path.**

### 4. Bike mechanics and matching physics frame — WIP

`build_bike.py`, `gltfBike.ts` and the physics now share a fixed frame; the
interim dynamic chassis fitting was removed. Contract v3 uses
`attach_chassis_com` at file (.585,.21,0), `attach_frame_origin` at (.65,0,0),
and a chassis-to-asset offset (.065,−.21). Neutral axles are (−.65,0)/(+.65,0).
The rear hinge is at (−.22,.10), radius `hypot(.43,.10)`; the front fork axis
is `normalize(−.22,.50)`. Physics uses the real rear arc and front slider.

Export/runtime changes include split shock body/shaft/clevis/spring with
authored roll, lower-fork fender motion, deforming coplanar chain, correct world
wheel phase, instance-isolated chain texture phase, exhaust marker and resource
disposal. Geometry quantization was increased locally during bike export and
restored afterward; `common.py` was not modified.

Previous large censuses validated a superseded dynamic-fit prototype and must
not be cited for the fixed-frame implementation. Re-run production trajectories
and measure real joints, fork/hinge residuals and shock stroke through crashes.

### 5. Garage, asynchronous loading and cache-safe assets

`src/ui/outfit.ts`, `garage.ts`, `src/game/app.ts` and `src/main.ts` implement
default street, persisted selection, URL override, and keyboard/gamepad/touch
outfit controls with the existing `.live` interaction gate.

`src/render/index.ts` loads the selected full/LOD pair and checks request
identity before replacing shared documents, preventing a late earlier request
from overwriting the selection. **Remaining failure case:** an asset load can
log an error and retain the previous model while the preference/UI already
shows the newly selected outfit. Add honest failure/retry behavior.

`vite.config.ts` snapshots model bytes before compilation and emits
`models/<pair-hash>/<stem>-<file-hash>.glb` plus `dist/model-catalog.json`.
Full and LOD share a directory hash, so changing either changes both URLs.
`modelAssetUrl` resolves the generated runtime catalog; dev serves exact
aliases and returns 404 for unknown hashes. This avoids the existing service
worker's `ignoreSearch:true` cache behavior; the service worker itself is
unchanged. Query-string cachebusters alone would be insufficient.

Boot inline/fallback/main share outfit resolution and byte totals. Street hero
downloads total 3,004,352 bytes, race 3,194,884, plus 840,284 shared boot-art
bytes. Eight logical model files, including legacy rider assets, have verified
content-addressed build outputs. Keep the one-byte inline budget margin in mind.

## Resume in this order

1. Establish static equilibrium, suspension passivity and constraint behavior
   with the final hinge/fork/contact solver. Resolve the inverse-map failure
   policy and investigate every failed physics requirement. Measure cost.
2. Run the complete real-bike geometry tests and fresh production replay census
   against those exact physics/assets. Do not fit the rendered chassis to hide
   attachment disagreement. Derive any float tolerance from export precision.
3. Cover actual new street/race GLBs, both LODs/classes, with independent mass,
   socket and joint checks. Reproduce the user's finish pose, landings, hops,
   wheelies and crash/restart. Verify the rendered body follows the physical COM.
4. Rebuild inadequate garment topology/deformations in the protected sources;
   judge gameplay and close-view motion against native-rate reference clips.
5. Record fresh actual-Game B1/B3/E2/M1 and Pro attempts, repeated-input raw-byte
   replay, finish/counter equality and restart latency. Then a stranger and an
   actual iOS Safari performance/playability report. No final solver clear has
   yet been established; old input scripts may need new control strategies.
6. Resolve outfit-load failure behavior, re-run `pnpm check`, cold boot, clear,
   crash, instant restart, and full/LOD/cache-switch checks. Update the plan and
   handoff with fresh commit/asset fingerprints before considering integration.

### Evidence pitfalls and local continuity

The inherited Node RunRules mirror resets faults before checkpoint 1 while
production Game keeps them. Hashes omit some Game counters. Alpha=0 captures
show the prior rendered state; omitted prefix renders change camera/animation
history. Some recordings omit solver/rate validation. Window padding and video
normalization can repeat frames or discard native 60 fps. Missing GLBs silently
fall back to procedural models. Renderer/asset changes are absent from the old
source fingerprint. Audit these paths instead of accepting a green report.

Ignored `harness/out/blender/verify-capture.mts` is an independent prototype
that renders the full prefix, uses explicit `(from,to]`/30 fps/alpha=1 sampling,
checks actual GLTF instances and response hashes, and rejects fallback assets.
It needs adaptation for the new hashed outfit catalog. Independent production
trajectory scripts preserve IEEE754 bytes (JSON alone loses negative zero).
Compare the same clock field: Physics.finishTime and Game.runTime can differ
by one ULP through multiplication versus division.

Additional ignored local notes are `harness/out/rig-physics/HANDOFF-WIP.md`,
`harness/out/blender/bike-pause-status.md` and
`harness/out/model-integration/STATUS.md`. Some report pre-final fingerprints;
this parent checkpoint's combined result takes precedence. Experimental B1
clear (40.9167 s) and near-finish E2 searches predate the final hinge and are
**not current clearability evidence**. Scratch captures, baseline builds and
videos are local conveniences, not committed proof.

Reference source/window manifests are in `reference/techniques/` and
`reference/rising-visuals/`. Local recovered footage includes bunny-hop,
landing, wheelie and crash/restart lessons plus the Rising start close-up.
The latter was recovered from native 1080p59.94 (format 299), not the older
30 fps download described in its README. Inspect source frame rate and unique
frames when making comparisons; read the correction notice in
`docs/research/frame-analysis.md` before using old angle tables.

## Instructions for the trunk owner

Keep trunk running independently; **do not merge this WIP checkpoint yet**.
Continue the authorized branch, preserve its editable sources and regression
witnesses, and finish the gates above. Coordinate conflicts in physics,
renderer, garage and boot/catalog code against current trunk; do not accept
one side wholesale. Regenerate the model catalog from the final GLB bytes.

Once the branch is reviewed and gates pass, merge `blender-work` through the
normal integration process from the trunk checkout. Include both branch commits
and all source/assets; cherry-picking only the public models omits required
rig, frame, socket and URL contracts. Re-run checks and the ship gate on the
merged tree. Revisit replay/versioning compatibility because this checkpoint
intentionally changes dynamics. Do not publish merely because the build passes.
