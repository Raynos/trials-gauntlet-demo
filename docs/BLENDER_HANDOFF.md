# Blender hero handoff — active WIP

**2026-09-15. The user resumed work from the pause checkpoint. Round 4 integration is verified below,
with remaining failures preserved. This branch is not ready
to merge or deploy. The hero/physics mission is unfinished.**

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
- The latest instruction is to read this handoff and continue. The persistent
  rider/bike/animation/texture goal is active; the old follow-up automation remains paused.

Read [the plan](plans/BLENDER_HERO.md), [plan status](plans/PLANS.md),
`AGENTS.md` and `docs/mission.md` before resuming. The user supplied
[this finish-screen bug](evidence/rear-wheel-first-finish-arms.jpg): arms folded
backward on Rear Wheel First, 1:18.433 and four faults. It is a symptom to
reproduce; this checkpoint does **not** prove that specific finish bug fixed.

## Round 4 continuation — current evidence

The current tracked physics has a **35-degree minimum elbow opening**. This
excludes the fixed-pole singularity while retaining the authored poses and pole.
Failed inverse recovery now uses consistent bounded translation and angular
COM derivatives. Six focused elbow tests and the 32-test rider/position group
pass. Fifty recordings / 206,359 ticks repeat with exact final raw physics and
complete Game counter bytes; maximum inverse residual is below 1e-9 m.

Remaining anatomical deficits are explicit: gap-test Pro ankle minimum is
-0.0026824963 rad at tick 616 and hip minimum is -0.0020886820 rad at tick 617;
H3 Rookie arm maximum is -2.2243376e-6 m at tick 4467. The ankle/hip deficits
were introduced by the extra coupling. A bounded coupled continuation that
activates only after the existing solve leaves a gap below -1e-6 closes the
scratch census, but **is not in production**. Research and exact reproduction
commands: `harness/out/rig-physics/ROUND4_RIDER_RESEARCH.md`.

The bot now admits wheelie-hold only from a moving rear-wheel balance, retains
distinct physical rider/pitch states, and commits only evaluated macro prefixes.
The score and bike dynamics were not changed for the bot repair. Six fresh
production-Game searches clear on attempt one with zero faults; all **25,576
recorded ticks** replay with identical physics/counter bytes:

| Track | Pro | Rookie fresh replacement |
| --- | ---: | ---: |
| B1 | 37.116667 s | — |
| B3 | 32.875 s | 33.808333 s |
| E2 | 42.425 s | — |
| M1 | 31.583333 s | 35.325 s |

Old round-3 B3/M1 Rookie inputs no longer clear under the new stop; they remain
intact. New inputs are in `harness/inputs/hero-r4/`. Search results depend on a
wall-clock deadline; serialized playback itself is deterministic. Two fresh B3
strangers both clear first attempt with zero faults, in 36.216667 / 37.233333 s;
median attempts 1, within the 1–2 band. Two fresh M1 strangers each clear in eight
attempts / seven faults, 133.383333 / 87.091667 s; median attempts 8, within 5–9.
All four verify raw production replay. The second M1 session's wall time includes
an initial wait for an agent slot; it is not a reaction-time measurement.

The bike seat was buried in the bodywork near x=.50 m (old seat top .602 m,
body top .610 m). Its loft now clears the body without changing mechanical
markers. Full/LOD assets and catalog were rebuilt; 16 actual GLB geometry tests
pass. The parent played `r4-seat-hop-street/clip.mp4` and accepts the more
readable pad silhouette as an incremental improvement.

Connected shoulder/elbow candidates were played in native Blender for both
outfits. All 19 bones, eight actions, sockets and material graphs are retained.
Their measured 35–175-degree elbow sweeps have no sampled regional crossings.
Both protected rider masters and all four public full/LOD GLBs are now promoted
after native and actual game playback. Normal exports from the promoted masters
are byte-identical to the reviewed scratch GLBs. Connected trousers are rejected
for now: street/race landing
still has 4/7 saddle crossings; inherited knee folds also remain. The hood,
waist and cloth material/detail still need work.

`hero-capture.mts` retains SwiftShader by default and supports explicit Metal,
recording actual renderer/browser identity and failing on any WebGL error.
A 190-frame Metal hop passes asset proofs and matches all 280 simulation samples
from the SwiftShader clip. Some initial Metal captures fail at tick 2 with
`glGetProgramiv: Program object expected`. Confirmed compilation defects are
corrected: actual material batches replace ineffective visibility masking,
compiler jobs serialize, and the render target restores before asynchronous
waits. Three regressions fail on the baseline and pass with the patch. Three
rapid-transition runs per build still reproduce GL1281 on both baseline and
final; simultaneous compiles fall from two (four in the pilot) to one. No
JavaScript query after program deletion was found. Scratch raw-WebGL controls
point to pending asynchronous link/deletion on the Metal backend: waiting for
completion before deletion prevents the warning. This is a round-5 lead, not
an implemented fix. The visual harness now waits
for scene readiness between setup changes; this does not exercise rapid changes.
No actual iOS or sustained 60 fps claim follows from capture.

The parent also played round-3 `r3-e2-finish-street/clip.mp4`: this 44.741667 s,
zero-fault finish keeps normal arm attachment/bending through the camera move.
It is not the user's exact 78.433 s / four-fault reproduction.

Current integration check: **18 failed, 686 passed, 11 todo**, six failed / 50
passed files. TypeScript and ESLint pass; separate production build passes.
The failed tests remain explicit physics behavior and cost requirements. No
thresholds or golden recordings were relaxed. The actual exported model census
covers **58 recordings / 255,345 input ticks** in two disjoint batches, all
finite with unchanged source hashes; all 69 shared source hashes agree.
Worst rendered whole-body COM mismatch is **0.114 micrometres**, down
from round 3's 1.897 millimetres. Hand/sole errors remain below 0.256 / 0.189
micrometres; no backward-pole elbow appears. Physical rear/front attachment
maxima are 90.89 / 66.73 micrometres, both inside the existing 0.2 mm bar.

See [round 4 evidence](evidence/blender-r4.json). The final build is frozen in
`harness/out/blender/r4-dist`; the earlier asset-only review build is
`r4-elbows-dist`. The parent also played final-build low-quality Race at
844×390 and a high-quality B3 Street stranger takeoff/landing. Four stream-copy
repeats made each short clip easier to review; original cadence and input
windows remain separate in the manifest. Both retain normal limb attachment.
B3 still reports 145,668 track triangles against the 80,000 cap. Round 4 is a
verified WIP checkpoint; the remaining GPU warning and anatomy deficits carry
into round 5.

## Round 3 continuation — committed evidence

See [the durable evidence manifest](evidence/blender-r3.json) for source/model/build
hashes, exact clocks, worst-case witnesses and replay results. Round 2 numbers
below are historical and do not override this section.

- TypeScript and repository ESLint pass. Combined tests: **18 failed, 673 passed,
  11 todo**, six failed / 47 passed files. Separate production build passes.
  Seventeen failures reproduce in the owned physics suites; the combined loaded
  host also fails the ragdoll timing test, which passes in the sequential sample.
  No green full-check claim, golden replacement or performance waiver is made.
- Implicit spring/damping rows and a coupled bounded rider wrench now solve with
  contacts. Rear/front sag is 29.31% / 27.19%; neutral drift is below 0.04 mm/s.
  Coupled wheel/contact position projection closes joints without changing any
  velocity bytes. Inverse COM recovery no longer silently drops all limit rows.
- The production-Game census covers **40 recordings / 165,355 input ticks** and
  actual full/LOD bikes plus both outfits. Every sample is finite. Worst physical
  rear/front joint errors are 117.46 / 107.66 micrometres. Exported nodes agree
  within separately derived float32 rounding budgets. Real socket errors stay
  below 0.26 micrometres; no backwards-pole elbow was recorded.
- **Open rider defect:** X1 Pro input tick 413 has a 1.896541 mm physical inverse
  COM residual, matching 1.896586 mm independently measured rendered COM error.
  A tightly folded arm aligns with the fixed elbow pole, making its projected
  direction singular. The anatomical rows lack a minimum elbow opening. A
  continuous-basis prototype is promising but is not in current physics yet.
- Fresh Rookie bot B1/B3/E2/M1 clears all succeed on attempt one with zero faults:
  42.375 / 33.575 / 44.741667 / 37.925 seconds. The serialized inputs replay with
  identical raw physics arrays, complete Game counters and finish-clock bytes.
  New recordings live in `harness/inputs/hero-r3/`; older inputs remain intact.
- Pro B1/M1 bot searches fail after 15 attempts. They incorrectly launch using
  wheelie-hold from rest. A separate binary full-gas/forward launch reaches 30 m
  safely. Fix and remeasure controller entry before inferring a Pro launch defect.
- **Two fresh B1 strangers both clear on attempt one**, in 50.4 / 53.9 seconds;
  both recorded sessions verify raw production-Game replay. Their median attempts
  is 1, within the 1–1 band. Other tracks/classes still need fresh strangers.
  Two earlier empty sessions were rejected after a briefing edit, preserved as
  stale, and excluded; neither contains riding.
- `hero-ship.mts` passes cold boot, complete B1 clear with browser/Node equality at
  all 5,085 ticks, crash and next-tick restart. Restart command 0.23 ms, resumed
  movement next tick, fault retained. Software-GPU render latency was 136.8 ms;
  this does not establish instant presentation or actual iOS performance.
- Garage download failure now retains the installed outfit and saved selection;
  retries fetch both full/LOD files. A real headless UI outage/retry test passes,
  including Race persistence on Pro and low quality. Failed GLB cache entries
  are evicted instead of preventing retries forever.
- Fresh 60 fps hop and crash/restart clips from frozen `r3-dist` were played in
  QuickTime. They render the full prefix at alpha 1, bind consumed GLB hashes,
  and reject procedural fallback. Binary hop: rear/front apex 0.500 / 0.721 m,
  0.450 s continuous flight, 14.5-degree landing, no fault. The exact user's
  78.433-second/four-fault finish remains unreproduced without its recording.
- `author_garments.py` creates connected torso/sleeve candidates while retaining
  the original rig/actions/materials. Street v6 hang-back and landing were played
  in native Blender. Shoulder seams are continuous; elbow folds and hood overlap
  remain. Candidates are **not yet promoted** to the protected sources or public
  models. All previous source/public asset hashes remain unchanged this round.

Sequential cost on Apple M5 Max / Node 24.18.1: world tick p95 36.292 us against
10; R3 block p50 12.894 us against 5; R5 flight/landing p50 38.042 us against 5.
Ragdoll p95 66.83 us passes 80 in that sample. Own heavy jobs were idle, but
unrelated desktop/trunk workloads remained; the failed costs still require work.

Current local reports: `harness/out/physics-resume/REPORT.md`,
`harness/out/rig-physics/X1_COM_ANALYSIS.md`,
`harness/out/stranger/PRODUCTION-HANDOFF.md`,
`harness/out/blender/resume-check.log`, `resume-final-build.log`,
`resume-ship/report.json`, `hero-contracts-resume.json`,
`r3-hop-street/evidence.json`, `r3-crash-street/evidence.json`.
These large local artifacts are ignored; their durable summary and fingerprints
are committed in `docs/evidence/blender-r3.json`.

## Historical round 2 checkpoint validation

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

## Historical round 2 implementation notes

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

## Continue in this order

1. Implement and verify the bounded anatomy convergence continuation researched
   in round 4. Preserve the existing solution when all gaps meet the bar;
   measure conservation, contact closure, invalid-state recovery and replay
   bytes. Do not hide the introduced ankle/hip deficits with relaxed tolerances.
2. Fix the independently reproduced pending-program deletion warning. Retain
   asynchronous compilation and resource cleanup, then repeat actual rapid
   transitions on Metal and SwiftShader with errors visible.
3. Continue native Blender garment work from the promoted connected shoulder/
   elbow masters. Rejected trousers still pinch at the saddle and knees.
   Hood/neck, waist, cloth folds and material detail need played reference
   comparisons before further promotion. Investigate remaining physics behavior
   requirements separately: braking, drop attitude, touchdown, lab hop/climb,
   air limits and solver cost.
4. Rerun real-GLB census and fresh bot/stranger attempts on the next frozen solver.
   Use `harness/lib/production-sim.ts` and the corrected stranger schema, not the
   legacy RunRules mirror. Keep session fingerprints fixed through `done`.
5. Keep full checks and each third-round cold-boot/clear/crash/restart gate visible.
   Actual iOS Safari, complete hero reference comparisons and integration review
   remain necessary. Do not merge, push or deploy this WIP branch.

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
