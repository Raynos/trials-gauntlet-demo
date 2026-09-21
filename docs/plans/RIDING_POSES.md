# Riding poses and elbows

Split out of `project/archive/HERO_OPEN_WORK.md` §1–2 on 2026-09-16. Owner: the physics owner (`src/physics/v2/rider.ts`,
`tuning.ts`) with the hero render owner for the drawn chain (`src/render/hero/riderRig.ts`, `gltfRider*.ts`). Gameplay
priority. Sibling plans: [HERO_ART_INTEGRATION.md](../../project/archive/HERO_ART_INTEGRATION.md) (the new assets),
`project/archive/CHROMIUM_METAL_SHADER_INIT.md` (startup bug, closed as non-repro). The tracker is [README.md](README.md).

## Where it stands (R9, `f00724e`)

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
