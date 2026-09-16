# Hero work still open after the branch merge

Updated September 16, 2026. Scope: the rider/bike visual-quality work, riding feedback, and fresh garage prototype requested by the user. This is the actionable handoff; [PLANS.md](PLANS.md) remains the project-wide status index.

## Current state — read this first

The five-outfit asset integration landed on local main in `62c003d`, with handoff updates in `3e05e58`. That integration passed 814 tests, 20 outfit/bike/LOD combinations with missing-file recovery, and desktop WebKit flat/B1 byte-identical replay, clear, crash and next-tick restart checks. These results describe that revision, not later uncommitted changes.

Main has since advanced to `e59d00b` at the start of this handoff. Its physics R8 and render r15 work is actively changing the working tree. Coordinate with those owners; do not replace their files or apply the saved pose patch wholesale. Their new work has not been independently accepted by this document.

**The merge did not finish the elbows, seated neutral, leaning behavior, or AAA-quality character.** The fresh garage prototype is planned, not built. There are five outfit presets, three rider asset families, and two bike classes sharing bike geometry—not five distinct finished bikes.

## 1. Finish the riding poses and elbows — gameplay priority

### Required behavior

- [ ] Neutral: visibly seated, with the pelvis supported by the seat.
- [ ] Forward: rise from the seat and lean the torso forward.
- [ ] Back: shuffle the hips rearward and extend the arms toward the handlebars.
- [ ] Elbows: natural bend beside the torso; eliminate the outward chicken-wing silhouette throughout transitions.
- [ ] Hands and feet: maintain believable bar/peg contact during ordinary riding; define a physical release/fault for impacts beyond reach.
- [ ] Clothing: prevent obvious shoulder/hood tearing, elbow collapse and body/bike penetration during these motions.

### Existing candidate and why it is not live

A shared anatomical profile was implemented against R7, including center-of-mass targets and matching collision-sensor geometry. Parent playback showed a much closer seated → forward → back sequence. Six geometry tests and 36 renderer tests passed, but the broader physics/hero suite had **15 failures**: hop height, landing survival, climbing, bounded response and recorded clears, plus a timing-sensitive row.

The back target moved the center of mass up about 10 cm and forward about 8.5 cm; back-to-forward vertical travel fell about 36%. This materially changes the forces driving hops and pitch. It needs physical retuning, not a rendering-only disguise. One impact recording still produced about 6 cm of grip separation.

- Exact candidate: [seated-candidate.patch](../evidence/hero-r15/seated-candidate.patch), based on `2f3d3dc`.
- Results: [candidate summary](../evidence/hero-r15/seated-candidate.json), [test output](../evidence/hero-r15/candidate-tests.txt), [parent played review](../evidence/hero-r15/parent-pose-review.json).
- Control recording: `harness/inputs/hero-r15/seated-forward-back.json`.
- Candidate clip, only in the original Blender checkout: `/Users/raynos/projects/game-demos/trials-gauntlet-blender/harness/out/blender/r15-pose-played/clip.mp4`.
- Candidate frozen build, same checkout: `harness/out/blender/r15-pose-dist`.

### Next implementation sequence

1. Coordinate with the active R8 physics owner. Inspect their landing/seat/tank/reach constraints, thrown-rider fault and brake bracing before changing the shared profile.
2. Measure target-table changes separately from collision-sensor changes. Preserve the intended visible poses while measuring their actual center of mass, reach and seat contact.
3. Retune physical control and hop response against the existing handling requirements. Do not hide excursions by clamping only the rendered body or loosen tests merely to admit the candidate.
4. Match physics, collision sensors and the exported rider rig to the same geometry. The physical riding path currently overrides Blender animation clips; editing those clips alone will not fix it.
5. Play neutral/forward/back transitions, hops, landing impacts and crash/restart on both bike classes and every rider family/LOD. Parent review must judge moving clips.

**Done when:** the user's four pose requirements are visibly met in played clips; ordinary contacts remain believable; impact reach behavior is explicit; handling tests pass; changed physics has fresh goldens, byte-identical browser replay and bot/stranger attempts-to-clear evidence. Follow the [physics merge protocol](../tasks/blender-branch-merge.md). Static poses or geometry checks alone cannot close this item.

## 2. Finish the active landing and camera work — coordinate, do not duplicate

Main's latest critic round preferred the game in only 2/12 comparisons, both crash cells. The remaining reported problems include the rider collapsing onto/through the tank during landing and camera framing/occlusion. See [Rider on Glass](RIDER_ON_GLASS.md).

- [ ] Physics R8: verify seat/tank/reach constraints, thrown-rider behavior, braking stability, refreshed goldens and stranger coverage. Work was in progress when this handoff was written.
- [ ] Render r15: verify camera lead, landing framing, foreground occlusion and near-plane popping. Work was in progress.
- [ ] Repeat the blind played comparison after both changes land; record the actual verdict against the plan's acceptance bar.

These tasks overlap the pose work above. A successful R8 constraint pass does not automatically establish natural elbow anatomy or seated neutral.

## 3. Resolve Chromium/Metal shader initialization

- [ ] Reproduce the `GL_INVALID_VALUE` / error 1281 initialization failure on the current integrated build.
- [ ] Identify a fix that preserves shader diagnostics and startup performance; verify it without diagnostic wrappers that alter timing.
- [ ] Re-run cold boot, clear, crash and restart on Chromium/Metal and WebKit, plus applicable performance checks.

Frozen R15 diagnostics did not support deleted-program reuse. Forced synchronous linking prevented the error in a diagnostic run but risks startup performance; that workaround was rejected. A narrow log-query ordering change failed. SwiftShader investigation was cancelled without a pass. Desktop WebKit gates passed, but do not prove this Chromium issue fixed or establish real iPhone performance.

Evidence: [GL investigation](../evidence/hero-r15/gl-investigation.md), [flat WebKit gate](../evidence/hero-r15/ship-flat-webkit.json), [B1 WebKit gate](../evidence/hero-r15/ship-b1-webkit.json).

## 4. Build the high-fidelity garage prototype — separate art milestone

Follow [HERO_GARAGE_PRODUCTION.md](HERO_GARAGE_PRODUCTION.md). Start with one mustard-hoodie, bareheaded rider and one bike, using target 01. Do not expand to five outfits before the first character passes visual review.

- [ ] Create the independent `prototypes/hero-garage/` Three.js viewer with fixed comparison cameras and a simple garage lighting setup.
- [ ] Establish the recognizable face and tousled curly hair in the actual browser first: anatomy, eyes/lids, jaw, ears, beard and authored curl clumps.
- [ ] Build the dressed body: tailored hoodie and jeans, convincing folds/seams, hands and footwear, coherent proportions.
- [ ] Finish the hero bike's silhouette, mechanical details and materials at the same viewing scale.
- [ ] Produce editable Blender sources, retopologized meshes, UVs, baked/painted textures, rig and corrective deformation; export verified runtime GLBs.
- [ ] Prove orbit quality and animation, then measure load cost, rendering and memory against the production plan's budgets.
- [ ] After the first hero is accepted, derive the remaining outfits and integrate with the game's physical pose system.

**Pipeline clarification:** current game assets are real Blender-exported GLBs, many authored through Python; the old procedural fallback/toggle remains. The separate img2threejs reconstruction experiment never shipped and is stopped. A Blender file or high triangle count does not by itself create high-fidelity character art. The new route requires deliberate sculpting, grooming, clothing, texturing and deformation review. Image-to-mesh may provide raw material, but is not the acceptance criterion.

**Done when:** the browser-rendered hero convincingly matches the reference's identity, hair, clothing and bike design at comparable framing, also holds up from other angles and in motion, and meets the agreed runtime budgets. An AI mockup, procedural stand-in or larger screenshot is not completion. Use the staged acceptance gates in the production plan.

## 5. Release and evidence follow-through

- [ ] After current main work settles, run checks against that exact revision; do not reuse the 814-test result as proof of subsequent changes.
- [ ] Capture fresh actual-game clips/stills for the five outfits, both bike classes and relevant LODs. Label concept art separately and update the shareable gallery only with accepted results.
- [ ] Verify the selected release on actual iOS Safari and desktop; keep device performance and touch behavior distinct from desktop WebKit automation.
- [ ] Coordinate any remote push/game deployment with the main release owner. This hero integration task performed neither; inspect current release state before repeating anything.
- [ ] Keep [PLANS.md](PLANS.md), [BLENDER_HANDOFF.md](../BLENDER_HANDOFF.md) and release evidence current as these items close.

## Recommended order and stopping point

**Gameplay:** finish the active R8/render-r15 work → integrate/retune the intended poses → played review and physics/browser/device gates → release evidence.

**Art, independently:** garage viewer → accepted face and curly hair → dressed rider and bike → rigged motion/performance → other outfits → game integration.

Close the gameplay milestone when the riding checklist and its evidence pass. Close the garage milestone only at its explicit visual and performance gates. Report checklist status, not an invented overall completion percentage. The user's weekly usage floor is 30%; check current usage before a sustained build and do not spend merely to reach the floor.
