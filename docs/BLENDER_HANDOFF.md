# R15 integration decision — September 16, 2026

User authorized merging verified branch work into trunk and a separate high-fidelity garage production plan. Local main was fast-forwarded from `998c429` to `62c003d`; unrelated uncommitted `harness/capture.ts` was preserved byte-identically. No game deployment or remote push was performed. **The merge does not finish the rider pose or AAA goal.**

- Current candidate is byte-identical to main `998c429` under `src/physics/**`; main performance work retained. All five presets and distinct small openface helmet are included.
- `pnpm check`: 814/814 tests, typecheck, lint and production build pass. Outfit integration: 20 combinations plus two-file outage/retry pass.
- Frozen production WebKit gates pass: flat 1012 exact ticks, 8.433333333333334 s; B1 4836 exact ticks, 40.3 s; zero faults, zero errors, crash then next-tick restart and movement. Reports: `docs/evidence/hero-r15/ship-*-webkit.json`. This is desktop WebKit evidence, not physical iPhone proof.
- Metal Chromium has an unresolved shader-query initialization error. Instrumentation supports linking/driver timing sensitivity; forcing synchronous linking was not retained because it risks startup performance. No errors hidden, no workaround shipped. `gl-investigation.md` records limitations.
- New shared seated/forward/back/elbow design was implemented and played. Visually closer to user intent, but broad tests show 15 failures (hop, landing, climb, bounded response, golden clears). It is **rejected for merge**, not abandoned: exact seven-file patch and test evidence in `docs/evidence/hero-r15/`; stash message `R15 rejected shared seated profile preserved for physics retuning`. Apply patch only as a new physics round. Do not pop older obsolete-architecture stash.
- Candidate clip: `harness/out/blender/r15-pose-played/clip.mp4` (actual control recording). Candidate frozen build: `harness/out/blender/r15-pose-dist`. These are NOT the trunk implementation.
- Next pose work: separate target-table and sensor-map effects; new back target reduces vertical throw 36%, so restore handling with measured physical retuning. Do not fake COM in the renderer or loosen tests to land it. Impact hand release/reach behavior remains open.
- Garage production plan: `docs/plans/HERO_GARAGE_PRODUCTION.md`. One mustard rider and bike, anatomical Blender sculpt, authored curly hair/face/clothes, retopology/UV/textures/rig, real Three.js look development. First head/hair milestone not yet built. Stopped img2threejs experiment remains unshipped.

# R15 trunk reconciliation and resumed user direction

User now explicitly requests merge-ready riding fixes, then merge into trunk; standalone high-fidelity garage plan is separate. Plan `docs/plans/HERO_GARAGE_PRODUCTION.md` delivered. Main35f8 was merged asafeb5c9 (811checks), then mainR7fe50df5/998c429 incorporated (814checks pass). Five-outfit20-combination outage/retry passes. Frozen build `harness/out/blender/r15-r7-dist` fails ship GL1281 atfirstobservedtick2: shader query issue (later diagnostics did NOT support deleted-program reuse); see R15 closeout above. No main merge/push/deploy by this task yet. Main physicsR7 is now committed/clean; prior coordination question resolved.

Hero agent owns seated/lean/elbow candidate against NEW main architecture: shared profile derived targets, minimal sensor mapping, R7servo untouched. Old candidate stash `R14 seated pose candidate and garage plan before trunk reconciliation` retained; do NOT pop it wholesale—it targets obsolete branchphysics. Render currently uses hero/riderRig.ts copy; candidate centralizes this. Parent owns final played review and merge. Prototype image pipeline remains stopped and unshipped; it does not block direct Blender or gameplay work.

# Round 13 — gallery expanded; local sleeve correction rejected

R12 committed `2c0cb90`. R13 arm investigation: canonical Street before-hop captured at ticks180–360, full high Metal, no errors. Trace measurements rule out contact loss in these clips; no broad sleeve volume collapse in sampled poses. A single <=3mm elbow fairing candidate reduced a few crossings but worsened triangle distortion and was rejected before export. No runtime physics or canonical asset edits. Evidence `docs/evidence/hero-r13-arms/`; scratch candidate `harness/out/blender/arms-r13/street-elbow-v1.blend` is NOT approved. Latest budget43% at00:51UTC. Official `next.py` now returns exit3, stopped at blockout3/3 after rejection of neutral06. User input pending to allow one additional correction or leave procedural attempt stopped. No reset or extra correction made. Exact proposed shape fix: `docs/evidence/hero-r12-reconstruction/next-correction.md`. Gallery updated with fifth openface capture at https://trials-rider-progress.vercel.app; anonymous HTML and all17 referenced media verified byte-identical (process30944 completed). Parent also played full normal-camera openface hop in QuickTime; helmet acceptance remains limited, cramped/angular arms require diagnosis. Evidence `docs/evidence/hero-r12-openface/parent-full-hop-review.json`. This stop concerns the procedural run, not a claim the AAA goal is complete.

# Round 12 WIP — September 16

Latest checkpoint 00:40 UTC: fifth openface family integrated; agent reports build/typecheck/80 focused tests and all 20 preset × bike × LOD runtime combinations passed, including two-file outage/retry. Parent verified fresh integrated Metal ship gate PASS: cold boot 1560 ms, 4736 exact ticks, zero-fault 39.466666666667 s clear, crash then next-tick restart/movement, zero errors. Evidence `docs/evidence/hero-r12-openface/ship-report.json`. Canonical GLBs retain played candidate hashes; runtime/source evidence in `docs/evidence/hero-r12-openface/`. No commit or game deployment yet.

Reliable fixed-camera binary silhouette diagnostic now exists at `docs/evidence/hero-r12-reconstruction/front-matte-diagnostic.json`: IoU 0.8674 overall, 0.9052 torso/arms, 0.6479 shoes. Gray-render segmentation had produced misleading earlier low scores. No alignment or mask warping used; reviewed reference-mask uncertainty remains. Difference image is diagnostic only, not a likeness/rig acceptance. Read-only agent diagnosis of section ridges/waist gap is pending. Pipeline build/render checklist now reflects actual generated and captured evidence; correction count remains 2/3. Latest OpenUsage: 44% weekly remaining at 00:36 UTC; floor 30%.

R11 committed baseline70e9a73. Current R12 WIP: openface candidate accepted by parent as first fifth-outfit geometry after actual LOD hop and full crash/restart playback (not AAA or physics acceptance). Agent hero_asset_research is promoting distinct openface source/model family and integrating fifth preset; inspect agent status before builds. Candidate evidence harness/out/blender/openface-r12; source recipe assets/blender/openface_candidate.py. Existing body/rig preserved; source and export topology checks pass. Full normal-camera hop still available for further review.

Procedural coherent shape correction2/3 (total2/6) generated and neutral06 captured. Factorya303b69015d7a97cc97e091f8f3206aa401a515a78fca9fbb5b5d5c339ed4acc. Hoodie and jeans each one indexed closed surface, explicit semantic proxies avoid duplicates. Parent front/side inspection: silhouette more coherent, but ringlike/jagged transitions, primitive mittens/head, hood bulk and low surface fidelity remain. 292,804 visible triangles (316,996 total) vastly exceed budget. NOT accepted or promoted. Current diagnostic source/recipes: reconstruction/shape-fit-r12-handoff.md; playedorbit+4views harness/out/blender/img2-preview/neutral-blockout-06. Scalp crown checks pass only recorded band,14unboundbase-preview skins. Need silhouette diagnostics with reliable rendered foreground masks, parent orbit review, bounded next correction; do not reset limits or declare quality from manifold checks.

Fresh R11-canonical Metal shipgate passed: coldboot1523ms,4736exactticks,39.466666666667s zero-faultclear, crash103+nexttickrestart/movement, noerrors. Evidence docs/evidence/hero-r12-checkpoint-ship.json. Fifth activation will require fresh applicable tests/build/gate. Public gallery updated https://trials-rider-progress.vercel.app with four latestgameplay screenshots; anonymous HTML and15media byte-matches verified, environmentfile404. Gallery-onlydeploy, no gamepublished. docs/evidence/hero-r12-gallery.json. Budget last48% weekly remaining at00:04UTC, floor30%, medium.

---

# Round 11 checkpoint — September 16, 00:13 UTC

R11 promotes four independently selectable supported outfits and the parent-played charcoal palette correction. Fifth open-face outfit remains unavailable. Full/LOD Street source+models+seed recipe now use charcoal, with original mustard/normal/ORM and all geometry/rig payloads unchanged. Durable proof: docs/evidence/hero-r11-palettes. Build/typecheck and59 focused tests pass. Runtime16-combination mechanics proof is separate from target-color acceptance. Parent played corrected full normal-camera and LOD inspection clips; palette only accepted, not overall AAA quality. No game deploy or merge.

Official img2threejs first blockout exists at assets/design/hero-targets/reconstruction/createStreetMustard.ts. Local state is blockout correction1/3 (total1/6), generated from strict-valid spec. Metric SDF bounds and cranium rings corrected initial coarse head/hair; first rendered scale error corrected normalized primitive transform overrides and opaque semantic containers. Latest neutral04 capture has90,304 visible triangles, 14 unbound base-mesh previews, no browser errors. Crown scalp raw/surface samples pass; full form is NOT accepted. Front/side show disconnected shoulder/waist, straight hanging arms, detached hood, box shoes, simplified face/hair. See docs/evidence/hero-r11-reconstruction. Next: record current capture/diagnostics and fit one coherent body/garment silhouette correction, no template pass or rig claim.

Camera remains unsolved; original target01 and intake uncertainties preserved in spec. Projection disabled and materialGate false; rejected de-lit images retain shadows. Material reference crops are heuristic evidence, not measured PBR. Spec/reference/mask/provenance in reconstruction/. Generated supplemental references are design evidence, not game screenshots.

Headless standalone preview tools remain harness/out/blender/img2-preview; no native browser. Rig baseline decode/parity proof remains exact19joints/8clip arrays but no new rig bind/animation gates completed. Public before/after gallery https://trials-rider-progress.vercel.app remains prior build evidence. OpenUsage00:04 UTC:48% weekly remaining, floor30%; medium effort. Goal active, allfive outfits and AAA fidelity unfinished.

---

# Round 10 continuation — authoritative latest status

Canonical assets now contain R9 fitted Street/Race riders and R10 corrected bike/card with protected LOD mechanism interfaces. See `docs/evidence/blender-r10.json` and `hero-r10-promotion.json`. R10 rider surface experiments were NOT selected. Latest build: `harness/out/blender/r10-fixed-dist`; Metal ship report: `r10-fixed-ship-metal/report.json`. Focused asset tests 45/45, typecheck/build pass. Known physics failures and actual iOS verification remain open.

User approved all FIVE target concepts as independent outfits, plus official img2threejs installation/use. Current runtime still has TWO outfits and TWO bike classes. Shared skill `~/.agents/skills/img2threejs` version2.0.0 pinned6e60b5e22419464b4853e01ddb6c0e6f6659a733; character plugin v0.2.0 installed. Continue from `.img2threejs/state.json` with `/opt/homebrew/bin/python3.12 forge/next.py` (system python3 is too old); image analysis, observed landmarks, local evidence search and assessment are recorded under `assets/design/hero-targets/reconstruction/`. Current step: detail-inventory. Twenty observed details have proposed mapping IDs; bind them to actual spec fields before marking the step done. Geometry has not been generated. `src/render/hero/gltfRider.ts` now has an explicit validated material-variant API, with compatibility adapter retained; 40 focused tests pass. This prerequisite is uncommitted and not yet wired to five-preset UI/runtime. Do not generate geometry before required spec gates. The game uses Blender/Three.js, but this requested reconstruction is code-authored with explicit terminal export if needed.

Five-preset integration design: `harness/out/blender/five-outfit-integration.md`. Fire Truck pipeline review: `harness/out/blender/fire-truck-pipeline-review.md`; use measurement/provenance practices, not historical gate bypasses. Current gallery publicly deployed to https://trials-rider-progress.vercel.app, separate from the game. User explicitly rejected download-only delivery. No game merge/push/deployment performed.

Weekly remaining53% at2026-09-15 22:58:11 UTC via OpenUsage. Medium effort. Stop at30% remaining or earlier once accepted; do not burn toward the floor. Parent visual judgment remains below requested AAA quality. Goal is active.

---

## Historical checkpoints (superseded where above differs)

# Round 9 assembled review — September 15

All six final candidate GLBs are integrated in `harness/out/blender/mega-v8-dist`; manifest `mega-v8-models.json`. Canonical sources/models remain R7. Parent played both outfits full and explicitly enabled LOD in QuickTime. Better proportions and connected motion; still below AI target material/cloth finish, so no AAA acceptance or completion claim.

Metal and desktop WebKit ship gates pass: 4,736 exact ticks, clear 39.46666666666667 s / zero faults, crash and restart/movement in one tick. Actual iOS is unverified. Durable evidence: `docs/evidence/blender-r9.json`; source/provenance package `docs/evidence/hero-r9-inputs/`; latest real clips at `harness/out/blender/progress/index.html`.

Normal-camera Street/Race Rookie playback also reviewed: silhouette distinction survives but surface finish remains weak at playing scale. Next: remaining class/outfit combinations and motion/crash review, then accept/promote the complete package or identify one material whole-result gap. Do not resume unbounded physics micro-polish. Weekly remaining 57% at 22:04 UTC; 30% is a spending floor, early stop preferred once accepted.

---

# Blender hero handoff — active WIP

**2026-09-15. Round 8 is an art-direction WIP checkpoint; canonical hero assets
remain Round 7 (`2691c97`). Round 6 is `1555f69`. Remaining failures are preserved below. This branch is not ready
to merge or deploy. The hero/physics mission is unfinished.**

Continue in `/Users/raynos/projects/game-demos/trials-gauntlet-blender`, branch
`blender-work`. This existing worktree was explicitly authorized; do not create
another checkout. The baseline was `56e3883`; the first verified repair is
`53142ab`. This document is included in the subsequent WIP checkpoint; use
`git log -2 --oneline` to identify it. No merge, deployment or push was performed
for this checkpoint. The 12-hour follow-up automation is paused.

## User decisions and scope

- **Latest budget direction, 2026-09-15:** the user wants a finite finish line
  and would prefer stopping well before **30% remaining**. Treat 30% as the
  spending floor, not a target to consume. Choose a generated design target,
  perform one coherent finish pass, then review actual gameplay before further
  iteration. Latest `openusage codex` at 21:23:14 UTC was **59% remaining**. The user selected
  **medium** reasoning and requested medium for teammates; explicitly use medium
  for newly spawned agents. Existing running agents have no in-place effort control.

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

Read [the plan](../project/archive/BLENDER_HERO.md), [plan status](plans/README.md),
`AGENTS.md` and `docs/mission.md` before resuming. The user supplied
[this finish-screen bug](evidence/rear-wheel-first-finish-arms.jpg): arms folded
backward on Rear Wheel First, 1:18.433 and four faults. It is a symptom to
reproduce; this checkpoint does **not** prove that specific finish bug fixed.

## Round 8 — target design and whole-hero candidates

**Current next decision:** the user rejects the large face-hiding Street helmet.
Five requested OpenAI image-generation edits of real screenshots are saved at
`assets/design/hero-targets/index.html`; prompt set and hashes sit alongside them.
These are aspirational targets, not implemented screenshots. The user is choosing
Street 1 (bare head / mustard), 2 (small open-face helmet / charcoal), or 4 (bare
head / charcoal). Parent recommends 1, with 3/5 for Race. Do not keep refining the
rejected Street helmet while this decision is pending. Builders are parked.
The explicit finish checklist is in `project/archive/BLENDER_HERO.md`.

### Actual progress and remaining visual problems

- `harness/out/blender/progress/index.html` contains actual before/after clips.
  `mega-v1-dist` preserves the first whole assembled candidate. Parent played
  Street and Race: angular slim bike body improves silhouette, but the engine
  remained a shiny egg and the hoodie's radial folds looked padded.
- `mega-bike/source-v2/bike-hero.blend` rebuilds engine/exhaust masses. New
  `assets/blender/bike_asset.py` adopts a protected source and derives full/LOD
  without rerunning geometry builders. Scratch protected exports have 29,940 and
  5,710 triangles. Named nodes, mechanical metadata and markers pass production
  decoding checks. The source-derived LOD is distinct from the procedural LOD.
- `mega-outfits/anatomy-v3/street-anatomy-v3d.blend` uses Blender CC0 realistic male
  torso/arm topology, with continuous shoulder/elbow weights. It is not accepted:
  the shoulder/axilla remains too bulky. Runtime frame-262 diagnosis finds correct
  32/27 cm arm segments and no flipped pole or disconnected weighted span. The
  20 cm shoulder envelope and camera foreshortening explain the hanging mass.
  See `anatomy-v3/ARM-DIAGNOSIS.md`; fix tailoring, not physics as a visual disguise.
- Race `anatomy-v3/race-lower/race-lower-v1.blend` has tall articulated boots and
  matching pants. Parent played the close hop at sim 2.683→2.750 s: continuous
  motion/contact, but blunt boot shapes. `race-lower-v2.blend` rounds the main
  boot shell at the same triangle budget and removes noisy old pant graphics;
  its `models-v2/rider-race.glb` passed decoding but is unreviewed.
- `src/render/hero/gltf.ts` now allows hero surfaces to receive scene shadows.
  Parent played it in the close Race candidate. `common.py` adds explicitly
  opt-in same-object short-distance AO in existing ORM red and glTF occlusion
  wiring. Default-disabled output reproduces the previous protected bike bytes.
  `mega-bike/ao-models/bike.glb` has real sampled AO and no extra textures/draws;
  visual strength is unreviewed. See `mega-bike/AO-HANDOFF.md`.
- `hero-fabrics/README.md` has CC0 photographed cotton/denim maps and a helper
  preserving class colors, garment geometry and runtime atlas count. Provider
  hashes and a smoke export pass. Whole-rider integration is still pending.

All abbreviated candidate paths above are under ignored `harness/out/blender/`.
Canonical `assets/blender/source/` and `public/models/` remain Round 7. Candidate
exports, extraction data, cloth inputs and playback footage are retained locally;
do not mistake the tracked author scripts for promoted or fully reproducible
final art. Preserve the needed source inputs with the accepted asset at promotion.

### Frozen assembly and verification

Latest fully captured assembly is `mega-v4-dist`: protected bike exports, Street
v3d full, Race lower-v1 full, prior v2 rider LODs, hero shadow reception enabled.
The rider LODs have not caught up with new full meshes; this is a preview only.
`mega-v4-close-street` and `mega-v4-close-race` contain 190 real frames, 60 fps,
1280×720, full-prefix replay of `(180,560]`. Close capture uses a labelled camera
following current skinned bounds; normal-camera readability is a separate view.
`hero-close-capture.mts` and its README preserve that inspection setup.

Each preview uses `stage-hero-preview.py`: temporary model staging, normal build,
then unconditional exact restoration of all six public GLBs and both generated
tables. R7 and candidate traces through v3 close/shadow have byte-equal recorded
physics JSON, clocks and phases at all 190 sampled ticks. This visual work adds
no physics change. R7's 19 test failures remain explicitly open; do not rerun the
entire physics census merely to assess a material edit. Next formal ship gate is
Round 9; run one integrated asset/gameplay gate before final delivery.

## Round 7 — shared knees, connected trousers and fresh play

See [the durable manifest](evidence/blender-r7.json). Final build:
`harness/out/blender/r7-dist`; final integration details:
`harness/out/blender/r7-final-verification/HANDOFF.md`.

- Replaced the inward projected knee pole with an exact three-dimensional
  two-link construction whose bend stays in the sagittal plane. The same map
  supplies geometry, center of mass and production anatomical limits. Thigh/shin
  lengths remain exact; no limit, tuning or tolerance was loosened. Historical
  invalid-COM fixtures now resolve, so their tests check recovery; a separate
  out-of-domain witness retains coverage of the failed-inverse differential.
- All **84 recordings / 407,983 ticks** repeat raw F64/U8 and complete Game
  counters, preserving velocity bytes through positional repair. The final
  full/LOD bike and Street/Race census stays finite: knee side margin at least
  146.8726 mm, rendered COM error at most 0.111 micrometres, rig grip/sole errors
  below 0.249/0.188 micrometres. These are rig anchors, not glove/boot surfaces.
  Attached constraints stay above -1e-6. Crashed pelvis/seesaw penetration remains
  open, now 99.8575 mm beyond slop; fresh stranger crashes reach 16.8765 mm.
- Changed dynamics are explicit: only 6 of the 20 formerly finishing base-corpus
  recordings still finish, and none of the eight old Round 5 bot recordings do.
  Eight fresh B1/B3/E2/M1 bots clear on both classes; seven take one attempt and
  B1 Pro takes two. All **67,000 fresh bot/stranger ticks** match Node, Chromium
  and desktop WebKit byte for byte. Old recordings were retained unchanged.
- Fresh B3 strangers clear in **1/1 attempts**. M1 takes **10/8 attempts**,
  median **9**, at the edge of the intended 5–9 band. Two samples do not prove a
  robust improvement from 10.5. M1 exploration includes collision faces omitted
  from the ASCII observation. One B3 session includes about 97 seconds of agent
  queue/prompt delay; wall time is not human reaction latency.
- Street/Race trousers now have a connected waist/crotch/knee shell, shaped
  waistband and restrained folds. Each outfit clears all 321 authored frames and
  21,012 sampled corrected riding poses without sampled trouser self-crossings.
  Upper-layer overlap at the waist remains; the changed topology means crossing
  counts are not a physical severity comparison. Parent played both native
  Blender actions and high Street/low Race gameplay hops. Canonical exports
  match all four reviewed GLBs exactly. Parent also played the fresh low Race
  M1 impact and automatic respawn: clothing stays connected and the ridden pose
  returns; the abrupt somersault remains a physics-quality gap. Fabrics, waist and helmet still look
  simplified; this is an incremental improvement, not the AAA bar.
- Final Metal and desktop WebKit cold-boot/clear/crash/restart gates pass. Both
  match every one of 4,736 fresh B1 ticks and clear in 39.466667 s with zero faults.
  The separate crash probe crashes at tick 103, restarts in one tick and moves on
  the next tick. Restart command/first-render CPU times are 0.230/6.195 ms and
  0.220/3.920 ms. These are not GPU presentation or actual iOS measurements.
- Full check remains **19 failed, 714 passed, 11 todo**: 17 inherited failures
  plus two new ones. Rookie binary-hop landing pitch is **21.994 degrees** against
  the unchanged 20-degree bar; neighboring analog preloads jump **47.23 mm** in
  rear-wheel apex against the 40 mm continuity bar. Neither was waived. Frozen
  scratch diagnosis traces the extra pitch to changed hip-limit impulse timing
  and chassis leverage; higher solver iterations and five simple interventions
  failed to repair it. Continue from
  `harness/out/rig-physics/round8-hop-diagnosis/REPORT.md`.

### Live phone arm report and tooling

The user's three new B1 benchmark screenshots are reproduced on the live legacy
build: additive bone translations accumulate across draws and benchmark cuts.
The isolated reset-only candidate stops the backward arm drift in real played
benchmark footage and preserves physics replay bytes. Details and integration
status live in [the arm handoff](evidence/arms-hotfix/HANDOFF.md). Main is changing
concurrently and now contains its own reset; do not blindly apply the older patch
or merge this entire WIP branch to get the hotfix. Exact original iOS behavior
and the older E2 78.433 s / four-fault finish remain separate reproduction gaps.

Official agent-browser 0.37.1 plus Chrome and the upstream skill are installed.
Canonical personal files live in `~/projects/dotfiles`, commit `6d96d38`;
home/project skill links are ignored personal configuration. A named headless
session passed a real fill/click/read smoke check. Use the CLI for exploration;
the deterministic harness still owns physics replay and capture evidence.

Latest user steering: zoom out and build a coherent AAA visual upgrade instead
of spending more rounds on small repairs. Physics investigation is paused with
all failures preserved. Two builders now own the complete outfit and bike visual
rebuild; see the Visual mega build section in `project/archive/BLENDER_HERO.md`.
The curved helmet now has valid Street/Race v2 scratch sources, awaiting parent
played review, with no export/promotion. `author_helmet.py` remains outside this
checkpoint; read `harness/out/blender/r8-helmet/HANDOFF.md`.
The user requested visible progress: `harness/out/blender/progress/index.html`
contains both outfits, before/after videos and the arm fix.
The next formal every-third-round ship gate is Round 9. Actual iOS remains open.

## Round 6 — context recovery and ship gate (historical)

See [the durable manifest](evidence/blender-r6.json). The final integrated build
is `harness/out/blender/r6-dist`; context stress and played captures use the
separately frozen `r6-context-final-dist`. Their compiled application source
contents and assets match exactly; build metadata differs. No physics, protected
Blender source, public model, track, dependency, golden or tolerance changed.

- Lost-context disposal now runs while the original Three allocation managers
  still own their listeners. CPU geometry and images remain available for
  reupload; generated lighting and post targets rebuild after restoration.
  The R5 negative control has 101 stale deletes and GL1282. Three final Metal
  runs each survive two loss/restore generations with zero stale deletes or GL
  errors and 28/28 owners reclaimed. Production `prepare()` interrupted between
  its first scene and post draws recovers; disposal while lost releases its
  readiness waiters. Normal retirement still passes Metal 3/3 and SwiftShader
  3/3. Desktop WebKit and SwiftShader warm restoration pass; actual iOS is open.
- Baseline and final cold-boot/clear/crash/restart gates pass in Metal and desktop
  WebKit. Each replays all 4,767 B1 ticks against Node's physics bytes and complete
  serialized Game counters, clears in 39.725 s with zero faults, crashes at probe
  tick 105, restarts in one tick and moves on the next tick. Final restart commands
  take 0.195/0.180 ms; first-render CPU submissions take 4.01/4.72 ms. These are
  headless measurements, not actual iOS or GPU presentation latency.
- Parent played high Street and low Race hop recovery, inputs (180,560] at 60 fps.
  Each original has 190 unique frames. Context loss is between input 370 and 372;
  simulation pauses while restoration completes, so that wall-time gap is absent
  from the simulation-time clip. Models, lighting and motion remain coherent.
  Four-copy review loops are explicitly repeated footage.
- A connected Street trouser candidate clears all 321 authored frames but fails
  801/4,356 recorded poses. It is **not exported or promoted**. Independent current
  replay proves the shared knee IK turns inward: M1 tick 3319 reverses knee sides;
  E2 tick 4284 leaves only 4.93 mm between centers. Actual GLB and independent
  Blender reconstruction agree within 0.499 micrometres. The pole is not singular.
  `harness/out/blender/r6-trousers/KNEE-DIAGNOSIS.md` contains exact witnesses and a
  shared sagittal bend-basis proposal; its COM and anatomical limits must agree.
- All 17 prior physics assertions remain red: full check is **17 failed, 711
  passed, 11 todo**. TypeScript, lint and separate build pass. Twenty focused
  lifecycle/loading tests pass. Physics diagnosis classifies each failure in
  `harness/out/rig-physics/round6/REPORT.md`; no assertion was waived. Forward-lean
  braking has an isolated external-torque interaction, but its M1 causality is
  unproven and no braking change shipped.

Round 7 priority: repair shared knee construction/COM/limits together, then re-run
raw replay, constraints, actual full/LOD models, trouser audits and clearability.
The Round 5 stranger measurements still apply to unchanged physics: B3 median 1;
M1 median 10.5 remains outside 5–9. Keep all remaining quality/cost/device gaps open.

## Round 5 — verified checkpoint (historical)

See [the durable manifest](evidence/blender-r5.json). The final build is
`harness/out/blender/r5-dist`. No push, merge or deployment.

- Bounded coupled continuation closes the anatomical gaps at the existing
  -1e-6 tolerance after the ordinary solve, preserving velocity bytes. Ordered
  multiplication replaces the progressive stop cubic: the isolated old
  Chromium/WebKit divergence at input 284 disappears. Physics SHA is
  `2099f24bfc7a7e0fcc7a5a1647bd33e55930389c76f56e10d1fd805237f89b47`.
- All **72 recordings / 340,983 ticks** repeat raw F64/U8 and complete Game
  counters exactly. Actual decoded full/LOD bikes and both outfits stay finite;
  rendered COM mismatch peaks at 0.115 micrometres. Physical rear/front joint
  errors stay below 91/67 micrometres. Final batches agree across 181 bound files.
  This does not prove universal nonlinear closure or ragdoll collision repair.
- Eight fresh B1/B3/E2/M1 bots clear on both classes. Seven clear first attempt;
  Rookie M1 takes two attempts / one fault. Inputs are in `harness/inputs/hero-r5/`.
  All **72,525 fresh bot/stranger ticks** compare exactly against Node in
  headless Chromium and desktop WebKit, including crashes and restarts.
- Both fresh B3 strangers clear first attempt. M1 takes **7 and 14 attempts**;
  median **10.5 is outside the intended 5–9 band**. The harness's looser 13.5
  pass threshold is separate. Late failures cluster around the final ledges/gap.
- Renderer-owned retirement waits for all pending material-program variants
  before disposing detached owners. Metal 3/3 and SwiftShader 3/3 pass with GL0
  and full program reclamation; the promoted-asset integration run also passes.
  WebKit reclaims everything but has no unresolved overlap burst, so that race
  coverage is inconclusive. **Inherited context restoration remains broken**:
  old geometry/texture disposal listeners delete lost-context allocations.
  Baseline and candidate reproduce it; candidate has no stale program queries.
  See `harness/out/blender/r5-retirement/REPORT.md`.
- Compact Street hood and control cables are promoted after native Blender and
  gameplay review. Normal full/LOD exports match the reviewed scratch GLBs
  byte-for-byte. Other Street geometry and exact bones/actions/sockets remain;
  Race/legacy are unchanged. The brake hose follows the fork at constant
  centerline length using instance-owned geometry. Actual decoded endpoints
  stay within 1.39 micrometres across the corpus; 98 full-travel poses pass.
  Surface arc error (0.836 micrometres) is separate from internal centerline
  error (0.0341 micrometres). Hood audits cover 321 authored frames and 4,356
  sampled riding poses, with zero sampled crossings; no continuous proof.
- Parent played final high Street hop and low Race M1 endo/ragdoll/restart.
  Attached limbs stay coherent; normal attachment returns after restart. Low M1
  still reports 146,344 track triangles against the 80,000 cap. Review loops are
  explicitly repeated footage, not longer recorded gameplay.
- Full check: **17 failed, 707 passed, 11 todo**; six failed / 54 passed files.
  Application/harness TypeScript and repository lint pass; separate build passes.
  Physics behavior/cost requirements remain red; no tolerance or golden changes.

Remaining: cloth/jeans/waist, helmet/material detail and reference comparison;
braking/drop/hop/climb/air behavior and cost; M1 target-band learnability;
whole-renderer context restoration; inherited crashed pelvis/seesaw penetration
of 99.34 mm beyond slop; actual iOS Safari. No iPhone is connected here. The exact
user E2 78.433 s / four-fault finish remains unreproduced without its inputs.
**Round 6 requires the cold-boot/clear/crash/instant-restart ship gate.**

## Round 4 continuation — committed evidence

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
passed files. TypeScript and lint pass; separate production build passes.
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

- TypeScript and repository lint pass. Combined tests: **18 failed, 673 passed,
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
| Repository lint | Pass |
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

1. Repair the shared knee bend basis and consistent COM/limit derivatives from
   the exact Round 6 witnesses. Do not offset rendered knees independently.
2. Re-audit the connected trouser candidate on the corrected recorded poses,
   then judge native/game motion before promotion. Continue waist/helmet forms
   and cloth/material detail from protected sources.
3. Repair remaining physics behavior/cost from explicit witnesses. M1 strangers
   exceed the target band; separate controller/visibility difficulties from
   solver faults. Tracks and broad world edits remain trunk scope.
4. Preserve Round 6's context-generation and normal pending-program retirement
   regressions. Actual iOS remains a separate gate; no iPhone is connected here.
5. After physics changes, repeat relevant raw bytes, actual model checks and
   fresh clearability on frozen sources. After art changes, rebuild the catalog
   and verify consumed full/LOD bytes. Parent updates evidence/plans and makes
   one commit per round. No merge, push or deployment.

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
