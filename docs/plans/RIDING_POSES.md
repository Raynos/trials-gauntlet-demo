# Riding poses and elbows

Split out of `project/archive/HERO_OPEN_WORK.md` §1–2 on 2026-09-16. Owner: the physics owner (`src/physics/v2/rider.ts`,
`tuning.ts`) with the hero render owner for the drawn chain (`src/render/hero/riderRig.ts`, `gltfRider*.ts`). Gameplay
priority. Sibling plans: [HERO_ART_INTEGRATION.md](../../project/archive/HERO_ART_INTEGRATION.md) (the new assets),
`project/archive/CHROMIUM_METAL_SHADER_INIT.md` (startup bug, closed as non-repro). The tracker is [README.md](README.md).

## Current-build audit — 2026-09-21 (ask 73)

Audited source at `7784f731`. The user prioritizes broken forward lean, requests riding-style research across three Trials games,
and authorizes physics changes. Confirmed reference set: Trials Evolution / Trials Fusion / Trials Rising. The original requirements below remain open; this audit does not
accept the existing poses or narrow the completion bar.

- **The render description below is historical.** `GltfRider.poseFromStance()` now blends the authored
  `sit_cruise`, `forward_attack` and `hang_back` holds, plus landing/extension, before solving contacts. The
  physics COM inverse path is a fallback, not the normal live Astra path. Editing authored stances can now
  affect gameplay rendering, although it cannot by itself align physical mass or crash sensors.
- **Two-segment arms already exist.** `solveArm()` uses the blended clip's elbow as its pole. Sequence step 4
  must audit and improve that implementation rather than introduce a duplicate solver. Bone-level checks do
  not establish a natural shoulder/elbow silhouette or garment integrity.
- **Visual/physical disagreement is still real.** Physics retains the standing target table and a separate
  `DRAWN` seated table. The normal render path additionally clamps vertical excursion to ±0.12 m and torso
  lag to ±0.35 rad, then reduces that excursion until contacts are reachable. The stance test explicitly
  requires this behavior. This conflicts with sequence step 2's prohibition on hiding physical excursions
  only in the drawn body; it is an open design/implementation issue, not evidence of completion.
- **The stance transition has a deliberate dead zone.** Half back lean and small forward lean retain the
  seated clip until the drawn hips leave the seat span/rise threshold. Measure the resulting responsiveness
  and transitions in motion against the user's desired riding style.
- **Crash release has infrastructure but is unproven.** The renderer re-parents the rider into a ragdoll and
  blends the previous pose over two or three frames. Physics seeds the crash from its physical chain, so a
  visible handoff mismatch remains possible; capture impacts and over-reach before calling release done.
- **Current coverage:** five outfit IDs × full/LOD assets; both bike classes. The targeted baseline command
  below passes **121/121** tests. The stance tests cover synthetic pose/load/excursion combinations on all ten
  rider assets, but complete B1 ridden-tick checks use only full-detail Street Mustard on both classes. They
  measure bones/sockets, not skinned cloth or human visual quality. No fresh played-clip, cloth, browser
  determinism, handling-suite or stranger completion evidence was produced by this baseline audit.

Baseline: `pnpm exec vitest run src/render/hero/gltfRiderPhysical.test.ts src/render/hero/gltfRiderStance.test.ts
src/render/hero/gltfRiderAdditive.test.ts src/physics/v2/r9.test.ts` (4 files, 121 tests, passed).

This audit records the starting build. User decisions are resolved and the implementation below supersedes
its next steps, while preserving all six required behaviors.

## Active implementation — ask 73

Decisions resolved: **forward lean first**, style grounded in **Evolution / Fusion / Rising**, physics changes
authorized. [Research](../research/riding-poses-trials.md) includes primary developer/manual/tutorial sources and
timestamped sequences from the local recorded-play corpus. Their common cue is substantial whole-body movement:
pelvis off the saddle and chest over the bars, rearward compression, then extension. Numerical targets below are
our geometry requirements, not purported measurements of the reference games.

[Current-geometry evidence](../evidence/riding-poses/current-geometry/README.md) measures all ten shipped rider
assets on both classes: visible forward rise is only 12.5 cm; neutral head/sensor mismatch is 21.3 cm; half-back
input leaves the visible rider seated while the physical COM shifts 15 cm. Existing physics baseline is 106/106.

1. **Shared geometry and handling (implemented, qualification in progress):** one segment-mass map for servo targets, contact anchors,
   sensor chain, ragdoll spawn and render. Neutral stays seated; rearward motion clears the seat before lowering;
   forward rises at least 15 cm and moves the chest forward. Reach remains a physical constraint, with explicit
   fault/release when exceeded. Retune force, response, hop, brake and landing without weakening handling bars.
2. **Runtime rig (implemented, appearance review in progress):** use the shared physical COM/angle and fixed bone lengths; remove the authored
   stance dead zone and draw-only excursion clipping. Preserve the authored garage display. Verify actual posed
   bone matrices and skinned surfaces, not renderer debug claims or the authored clips alone.
3. **Contacts and cloth:** both classes × five outfits × full/LOD, through neutral/forward/back, rapid reversals,
   hops, flat/sloped impacts, crash and restart. Contacts must remain within the existing 2 cm ordinary-riding
   bar, with tighter numerical checks wherever reachable; no scaling limbs or hiding the physical excursion.
   Review shoulders, hood, elbow fold, waist, boots and bike intersections in the actual runtime garment.
4. **Handling and evidence:** refresh affected goldens only from real clears; exact browser/node replay including
   finish time; bot and fresh strangers on b1–e3 (at least two independent sessions per track); record attempts,
   failures and restart latency. Preserve unsuccessful runs in the evidence. Run the full ship gate every third
   implementation round and before final delivery. Test desktop Chromium and headless WebKit phone geometry.
5. **Completion audit:** every required-behavior checkbox below needs its own evidence, including parent review
   of input-driven moving sequences. Geometry tests and stills do not close appearance or cloth. No old evidence
   is relabeled as verification of the new physics. Actual iPhone claims require an actual device reading.

Round 1 (`4fa79c3e`) separately addresses ask 74's pixelation with HDR/SMAA and repairs Snow Line's missing
obstacle batch; [evidence](../evidence/render-aa/round1/README.md). It does not close any pose requirement.

## Current qualification findings — round 2, not completion

Latest frozen simulation: `1255af7f`. The final one-sided support and suspension
closure fixes invalidate earlier `ae2c0bca` golden/stranger qualification. Eight of
48 old controls still clear; the remainder require fresh played controls. Final
qualification lives in `qualification-round3/`, `goldens-round3/` and
`strangers-round3/` under the riding-poses evidence directory. Earlier numbers below
are explicitly historical where source hashes differ.

The Race sleeve collapse was traced to directed arm-plane twists and corrected with
a continuous bounded alignment plus anatomical elbow skin conditioning. The strict
cloth/physical/release suite passes 94/94; all-outfit played appearance review remains
a separate requirement. The parent reviewed the latest Race forward/back sequence
without the previously rejected outer-arm craters.

- One physical segment/mass model now drives servo targets, anatomy, sensors, render and crash spawn.
  Forward hips rise 20.8 cm from the neutral target; rearward input has no authored-clip dead zone.
  Real hands/soles and snapshot restoration have independent actual-GLB coverage on both classes.
- Continuous rear-to-forward transfer and landing compliance preserve the positive hop, mild-impact,
  air-control, equilibrium, conservation and handling requirements. Obsolete assertions that required
  a bad response were reviewed explicitly in [handling-review.md](../evidence/riding-poses/handling-review.md);
  the new positive bars were not lowered.
- Fresh input-only production recordings produce 0.477 m Rookie / 0.501 m Pro rear-wheel hop height,
  actual crashes, and one-input-tick restart. Recorded Node snapshots match byte for byte.
- Twenty outfit/detail/class transition playbacks (1,700 actual-skin samples) retain at least 8.197 mm
  sampled rear-fender clearance. Parent still rejected the Race sleeve surface in fresh forward motion;
  neither bone agreement nor triangle strain closes clothing.
- Exact CPU optimizations preserve 21,936 recorded full snapshots. R5 5.042µs and R3 5.861µs remain
  over their unchanged 5µs timing bar on this shared host. All 47 old golden recordings became stale;
  fresh bot searches and browser finish-clock verification are underway. No old clear is relabeled.
- Typecheck/build pass. Full lint also finds preexisting errors in art/offline evidence scripts; new
  evidence-script lint errors are being removed. Full fresh suite, strangers, ship gate and garment
  completion review are still required.

## Round 3 checkpoint — paused by the user on 2026-09-21

The user requested a good pause point because of remaining usage. Implementation
remains frozen at `1255af7f`; no completion or deployment is claimed.

- All 48 current golden recordings finish and match browser/Node state hashes and
  exact finish/run-clock bytes. Twelve independent b1–e3 players completed and have
  exact continuous replay proofs. E2/E3 are under their intended difficulty bands;
  those results and every failed search remain explicit.
- Parent reviewed 60 outfit/detail/class/motion combinations and an additional
  Snow Line phone-layout sequence. Across 63 captures, 15,020 sampled states match
  independent production replay. WebKit also exactly replays B1/E2 on both bikes.
- Full Metal ship gate passes 31/31. R3/R5 unchanged CPU limits pass at 3.893/4.458µs
  in the serial suite. Overall: 1,078 passed, one failed, two skipped.
- The remaining R8 failure is 20 ticks on Rookie M1, not a replay or cloth failure.
  Its recovery measurement assumes 4,000 N available, while the deliberate landing
  cap supplies about 1,200 N. A new airborne lean command and touchdown produce
  target demand above the actual cap during the alleged recovered window. No test
  or runtime change has been accepted yet; preserve the 60-tick/0.15m requirements.

Resume from [PAUSE.md](../evidence/riding-poses/qualification-round3/PAUSE.md).
The six checkboxes remain open until the final acceptance audit, and this plan
remains live rather than archived.

## Historical starting point (R9, `f00724e`)

Astra's seated pose landed as a **drawn / physical split**: `riderBody.drawn` (`drawnBody()` in `rider.ts`) is a pure
function of (pose id, blend) plus the body's excursion, unhashed; the servo keeps R8's target table, so every golden
held. The rear wheel rides the swingarm arc and the front the fork line (p99 arc mismatch 0.43 mm); the elbow stop is
0.10 m, blended in only with the chest above the bar; the Rookie brake lift control sits beside the R8 brace. The
mass-frame move stays **REJECTED** (hop 0.596 → 0.481). The one-sided seat/peg/grip constraint with a thrown-rider
fault (the "rider through the tank" landing tell) is R8's.

What that does **not** close: the physical rider still drives the hips the R8 table draws, so forward/back are the
old excursions with a new skin; the elbows are a stop, not an anatomy; contact release on over-reach is a fault, not a
visible let-go; clothing under motion is untested against the R33 garment.

## Required behaviour (the user's four, plus contacts and cloth)

- [ ] **Neutral:** visibly seated, pelvis on the seat (drawn layer: live; physical hips: open).
- [ ] **Forward:** rise off the seat, torso leans forward.
- [ ] **Back:** hips shuffle rearward, arms extend to the bars.
- [ ] **Elbows:** natural bend beside the torso through every transition — no chicken-wing silhouette.
- [ ] **Hands and feet:** believable bar/peg contact in ordinary riding; an explicit, visible release/fault when an
  impact exceeds reach (R8's thrown-rider fault is the physical half; the drawn half is open).
- [ ] **Clothing:** no shoulder/hood tearing, elbow collapse or body/bike penetration during these motions on the
  runtime garment (the source-garment half is Astra's 54-pose audit; this row is the skinned runtime).

## Sequence

1. Measure the drawn table against the physical rider per pose: centre of mass, reach, seat contact — target-table
   changes separately from collision-sensor changes. The rejected seated candidate
   (`docs/evidence/hero-r15/seated-candidate.patch`, +10 cm / +8.5 cm CoM on the back target, −36 % vertical travel,
   15 suite failures) is the cautionary number: a visible pose that moves the CoM re-tunes the hop.
2. Retune servo/hop/landing against the handling rows (hop height, landing survival, climbing, bounded response,
   recorded clears). Astra's rule stands: **retune, never loosen tests**; never hide an excursion by clamping only the
   drawn body.
3. Match physics, sensors and the exported rig to one geometry: the physical path overrides the Blender clips, so
   editing `sit_cruise` / `forward_attack` / `hang_back` alone cannot fix it.
4. Elbows: replace the stop with a two-segment arm solve in the drawn chain (shoulder → elbow → grip, elbow biased
   down and in), checked on both bike classes and every rider family / LOD.
5. Play it: neutral → forward → back, hops, landing impacts, crash / restart, both classes, every family / LOD.
   Parent judges moving clips (`harness/capture.ts --rider-probe`; control recording
   `harness/inputs/hero-r15/seated-forward-back.json`).

## Done when

The four pose requirements are visibly met in played clips on both bike classes; ordinary contacts stay believable
and over-reach is explicit; the handling rows pass; changed physics carries fresh goldens, byte-identical browser
replay and bot + stranger attempts-to-clear on b1–e3 (n ≥ 2). Static poses or geometry checks alone cannot close
this. Physics changes go through the owner protocol (`project/archive/blender-branch-merge.md`).

**Latest visual revision (asks 78–80):** two short Evolution-inspired Labs and a standing forward candidate are available for review. User rejected the previous forward pose; backward is retained. The new candidate passes the two Labs replays but causes hop/climb/recovery regressions (10 full-suite failures), so prior qualification does not apply. See [review checkpoint](../evidence/labs-evolution/README.md). Not release-ready.

**Qualification update, ask 82 (2026-09-22):** the standing-forward candidate has since been retuned and recorded in a silent, aligned before/after clip (`harness/out/pose-motion-review/before-after-release-candidate-labelled-silent.mp4`). Fresh skill-3 recordings cleared all 26 covered tracks on Rookie/Pro where a golden exists: 50/50 exact Node/browser replays on snapshot `2ea9f379`. Two blind strangers per B1–E3 track cleared (12/12) on an earlier pose-equivalent snapshot. A full serial suite still failed nine checks on the first pass: the public B1 bench fixture was stale and is now updated; a one-quantum brake input exposes a discontinuous brace and three bounded-response failures; R7 and R8 found one coasting-push and 17 post-demand angular-band ticks; three CPU measurements exceeded their limits while the host was heavily loaded. A continuous brake experiment passed the bounded-response and stoppie tests but invalidated 9–13 existing golden clears, so it was rejected and the proven input/physics combination restored. Concurrent Rockhop edits/commits have since changed the shared source fingerprint, making the snapshot's goldens stale until they are re-proved on the release commit. A silent Metal gate was stopped when source changed during the run; green CI and production SHA check remain open. This plan is live; do not ship or claim completion from the 50 clears alone.

**Current qualification, same day:** a capped, command-following brake brace passes the bounded-response tests; one-sided seat support closes the deep-under-saddle trap seen in M2 Pro; a snapshot-owned lean-edge recency gate removes the coasting hop; the standing rider reaches into genuine uphill wheel contacts. The 26 pre-Rockhop courses have 50/50 exact Node/silent-browser finishing replays on source `207404d3`, with 47 bot-authored controls and three explicitly stranger-derived qualifying controls (B2 Pro, B3 Rookie, E2 Rookie). A fresh M2 Pro bot cleared after the seat repair. **Twelve new independent blind sessions on this exact source cleared B1–E3, two per track:** medians 1 / 1.5 / 2.5 / 3 / 3.5 / 1 attempts in course order; five are in band and E3 is under-band (too easy, not a fail). Current silent 6 s neutral→forward→back clips for Rookie and Pro are in `harness/out/pose-motion-review/` and each has video only. The integrated full suite last ran at 1,352 passed, eight failed, two skipped: two now-corrected rebrand menu expectations, two R7/R8 checks reading **12 new Rockhop recordings that all fail to finish** on the current pose physics, three CPU timing checks on a loaded host (isolated R3 and world pass, R5 is 0.04–0.54 µs over), and one cloth-test timeout (passes in isolation). Typecheck, lint and build pass after integration fixes. The silent Metal gate reached 25/31: cold boot, clear, crash, one-tick restart, offline play and camera pass; three old physics pins now pass 6/6 after deliberate repinning, heap growth passes in the quiet recheck, but synchronized render readback remains highly variable under GPU contention (45.59–160.28 ms vs 16 ms). Final Rockhop controls, full integrated green suite/Metal gate, CI and production SHA remain release gates. The earlier 50/50 line is historical and should not be read as 50 fresh bot searches.
