# Hero work still open after the branch merge

Updated September 16, 2026. Scope: the rider/bike visual-quality work, riding feedback, and fresh garage prototype requested by the user. This is the actionable handoff; [docs/plans/README.md](README.md) remains the project-wide status index.

## Status update by the parent — 2026-09-15 22:12 (read before "Current state")

What changed on `main` since this handoff was written (`5b6d21c`, `e59d00b` at the time):

- **The user's decision (2026-09-15 evening):** the blind-critic bar is dropped. Rider on Glass Pillar H closes when
  "the whole Astra branch" is on `main`; further critic-driven hero rounds are not planned. Astra's remaining
  items in this file are a separate track, owned by Astra.
- **Merged state:** the branch tip `3e05e58` is on `main` (merge #3 `12e818b` took the hero/assets/garage on main's
  terms; Astra's rebase `afeb5c9…3e05e58` followed). Two pieces from the pre-rebase branch (`405f894`) were still
  only in history and are being ported now, adopt-by-default, through the owner protocol:
  - **Physics R8 (running):** Astra's hinged rear-wheel path + fork axis, rider mass frame, elbow stop and Rookie
    brake lift control, **and the §1 seated-pose candidate** (`docs/evidence/hero-r15/seated-candidate.patch`)
    — ported onto R7's linkage couple + `riderBody` export, with the servo / pose table retuned so the hop and
    landing rows hold the seated geometry (Astra's rule: retune, do not loosen tests). Also R8's own items: the
    one-sided seat/peg/grip constraint with a thrown-rider fault (the "rider through the tank" landing tell), the
    15 m/s brake endo, strangers n ≥ 2 on b1–e3. Goldens re-searched + browser-proved, gate re-pinned.
  - **Render r15 (running):** Astra's `ResourceRetirement` / context-loss / program-release layer onto today's
    `src/render/index.ts` (perf cuts #0–#4b kept), proved with the bench's `stalePrograms` row and the WebKit hero
    gate; plus `setCameraOverride` for the reviewer and the playground set pieces. The camera-for-the-critic work
    (§2 second bullet) was stopped by the user's decision.
- **Docs:** the tracker is now `docs/plans/README.md` (was `PLANS.md`); `BLENDER_HERO.md`, `CLOSEOUT.md`,
  `MEGA_PLAN.md`, `physics-v2.md`, `PERF.md` and the two P0 task docs are in `project/archive/`. Physics R7
  (`fe50df5`) exported `riderBody` — the rig is proven live (`harness/capture.ts --rider-probe`: torso std
  0.085 rad, r = −0.98 to the physics body; harness-metrics.md Round 13b).
- **Release:** `main` deploys after every parent commit (last: `fe50df5`-era + docs); v0.2.0 is pinned at
  `b52dfd0` (`RELEASES.md`); release media at https://trials-gauntlet-media.vercel.app. The parent runs deploys —
  §5's "coordinate any push/deploy" stands.

Item-by-item against the checklists below: §1 — in R8's hands this round (result to be reported here by the
parent); §2 — first bullet in R8, second bullet **dropped**, third bullet **dropped** (no further critic rounds);
§3 — open, Astra's; §4 — open, Astra's, not started; §5 — fresh checks and clips owed on the R8/r15 revision
(the parent will run the gate + captures when they land), real-iOS verification stays with the user's phone.

## Current state — read this first

**Menu integration update:** both main and pause menus now expose the existing img2 mustard rider experiment, Classic and Blender, plus all five Blender outfits. Outfit selection switches to Blender. The generated source is preserved and its clothing is bound to the runtime rig. [Evidence](../evidence/hero-img2-menu/README.md) covers persistence, every outfit in both menus, mobile pause and resumed gameplay. This rescues the experiment for selection; it does not establish target-image fidelity or close the pose checklist below.

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

**Done when:** the user's four pose requirements are visibly met in played clips; ordinary contacts remain believable; impact reach behavior is explicit; handling tests pass; changed physics has fresh goldens, byte-identical browser replay and bot/stranger attempts-to-clear evidence. Follow the [physics merge protocol](../../project/archive/blender-branch-merge.md). Static poses or geometry checks alone cannot close this item.

## 2. Finish the active landing and camera work — coordinate, do not duplicate

Main's latest critic round preferred the game in only 2/12 comparisons, both crash cells. The remaining reported problems include the rider collapsing onto/through the tank during landing and camera framing/occlusion. See [Rider on Glass](../../project/archive/RIDER_ON_GLASS.md).

- [ ] Physics R8: seat/tank/reach constraints, thrown-rider fault, braking stability, refreshed goldens and stranger coverage — **running**, and it now carries Astra's `405f894` mechanisms + the §1 seated candidate (see the status update).
- [x] ~~Render r15: verify camera lead, landing framing, foreground occlusion and near-plane popping.~~ **Dropped** by the user's decision (critic bar removed); r15 now ports Astra's perf layer + the free camera + playground set pieces.
- [x] ~~Repeat the blind played comparison after both changes land.~~ **Dropped** — no further critic rounds; Rider on Glass H closes on the merge.

These tasks overlap the pose work above. A successful R8 constraint pass does not automatically establish natural elbow anatomy or seated neutral.

## 3. Resolve Chromium/Metal shader initialization

- [ ] Reproduce the `GL_INVALID_VALUE` / error 1281 initialization failure on the current integrated build.
- [ ] Identify a fix that preserves shader diagnostics and startup performance; verify it without diagnostic wrappers that alter timing.
- [ ] Re-run cold boot, clear, crash and restart on Chromium/Metal and WebKit, plus applicable performance checks.

Frozen R15 diagnostics did not support deleted-program reuse. Forced synchronous linking prevented the error in a diagnostic run but risks startup performance; that workaround was rejected. A narrow log-query ordering change failed. SwiftShader investigation was cancelled without a pass. Desktop WebKit gates passed, but do not prove this Chromium issue fixed or establish real iPhone performance.

Evidence: [GL investigation](../evidence/hero-r15/gl-investigation.md), [flat WebKit gate](../evidence/hero-r15/ship-flat-webkit.json), [B1 WebKit gate](../evidence/hero-r15/ship-b1-webkit.json).

## 4. Build the high-fidelity garage prototype — separate art milestone

Tracked in [HERO_GARAGE_PRODUCTION.md](HERO_GARAGE_PRODUCTION.md) ("Status checklist" at the top) — one place, no
duplicate list here. Start with one mustard-hoodie, bareheaded rider and one bike (target 01); do not expand to five
outfits before the first character passes visual review.

## 5. Release and evidence follow-through

- [ ] After current main work settles, run checks against that exact revision; do not reuse the 814-test result as proof of subsequent changes.
- [ ] Capture fresh actual-game clips/stills for the five outfits, both bike classes and relevant LODs. Label concept art separately and update the shareable gallery only with accepted results.
- [ ] Verify the selected release on actual iOS Safari and desktop; keep device performance and touch behavior distinct from desktop WebKit automation.
- [ ] Coordinate any remote push/game deployment with the main release owner. This hero integration task performed neither; inspect current release state before repeating anything.
- [ ] Keep [docs/plans/README.md](README.md), [BLENDER_HANDOFF.md](../BLENDER_HANDOFF.md) and release evidence current as these items close.

## Recommended order and stopping point

**Gameplay:** finish the active R8/render-r15 work → integrate/retune the intended poses → played review and physics/browser/device gates → release evidence.

**Art, independently:** garage viewer → accepted face and curly hair → dressed rider and bike → rigged motion/performance → other outfits → game integration.

Close the gameplay milestone when the riding checklist and its evidence pass. Close the garage milestone only at its explicit visual and performance gates. Report checklist status, not an invented overall completion percentage. The user's weekly usage floor is 30%; check current usage before a sustained build and do not spend merely to reach the floor.
