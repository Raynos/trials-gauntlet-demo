# R15 integration update — September 16, 2026

Completed local integration: main fast-forwarded `998c429` → `62c003d`, with its unrelated capture edit preserved. User-authorized asset merge is done; no game deployment or remote push.
`blender-work` now contains main through `998c429`. `src/physics/**`, main game/track/bot/golden state and main performance work are preserved. Five-outfit assets and selection are ready: 814 checks, 20 outfit combinations/outage/retry, WebKit byte-identical flat/B1 clear/crash/restart. Detailed reports and exclusions: `docs/BLENDER_HANDOFF.md` and `docs/evidence/hero-r15/`.

**Do not interpret this as a pose/AAA sign-off.** The shared seated profile produced 15 handling failures and is retained only as a rejected-candidate patch/evidence. Retuning must use the physics-owner protocol below. Metal shader-query initialization remains a documented browser-specific issue; desktop WebKit passes do not establish real iOS performance.

---

# Task: merging the Codex `blender-work` branch (Astra 6) into `main`

Status: MERGE #3 READY on branch `astra-merge` (2026-09-15, merge owner) — see "Merge #3" below; the parent fast-forwards `main` if green. Owner: parent (merge), Astra 6 (branch).

## What the branch is

`/Users/raynos/projects/game-demos/trials-gauntlet-blender`, branch `blender-work`, branched from `56e3883`
(tracks r9). The user handed "max out the graphics and make the rider and bike look AAA" to a Codex Astra 6
agent working there. Rounds 3–4 are committed (`e3eef69`); round 5 is in progress, uncommitted.

## Test merge, 2026-09-15 13:50 (scratch clone, `main` = `e0f1670`)

- **Git merge is clean** — zero conflicts today. It will not stay that way: the perf owner is now editing
  `src/render/index.ts`, `src/render/hero/*`, `src/render/post/*` on `main`, and the branch rewrites
  `src/render/hero/gltfBike.ts`, `gltfRider.ts`, `index.ts` (+130/−), `frame.ts`, `urls.ts`.
- **The merged tree fails 17 physics acceptance tests** (`feel` 3, `r2` 3, `r3` 4, `r4` 2, `r5` 4,
  `world` 1): the branch changes the solver — a hinged rear-wheel path and fork axis, a rider mass frame,
  an elbow stop, a Rookie brake "lift control" (`src/physics/v2/{bike,tuning,rider}.ts`, +2 101/−415).
  Those tests are the rows strangers were measured against (beginner/easy/medium in band, hard r9).
  Astra's own handoff says "some broader physics tests remain red".

## Test merge #2, 2026-09-15 18:40 (`main` = `ce9fca3` / v0.2.0, branch = `405f894` + 7 uncommitted files)

- `blender-work` is **35 commits behind `main`** and has never merged it. The merge now **conflicts in 16 files**:
  `src/game/app.ts`, `src/physics/v2/{bike,tuning}.ts`, `src/physics/v2/feel.test.ts`, `src/render/index.ts`,
  `src/render/post/chain.ts`, `src/render/hero/gltfRider.test.ts`, `harness/stranger/{cli,report}.ts`,
  `docs/plans/README.md` and six stranger metrics files.
- The branch's physics footprint grew to **18 files, +6 704 / −415** in `src/physics/v2` (bike.ts, rider.ts, tuning.ts
  rewritten; `feel`/`r2`/`r3`/`r4` tests edited — a test edit is a numbered deviation under rule 1, not a merge).
  With the conflicts left unresolved, 15 of 21 physics test files fail on the merged tree.
- Since `main` pinned v0.2.0 on physics R6 (tag `physics-v2-final`, goldens + strangers + battery all measured on it),
  **the branch's dynamics changes cannot land as-is**. Rule 1 stands: export-only physics additions merge; dynamics
  changes are a physics-owner round with the R-tables, goldens and strangers re-run — or they are dropped.
- Next step is Astra's (rule 3): merge `main` into `blender-work`, keep `main`'s `src/physics/**` wholesale (take
  "ours" from `main` for every physics conflict), keep `main`'s `src/render/index.ts` perf cuts (#0–#4b) and the
  reviewer/menu work in `src/game/app.ts`, then re-run `pnpm typecheck && pnpm lint && pnpm vitest run`. When that is
  green the parent merges the hero/assets/garage set and runs the critic round (Pillar H, `RIDER_ON_GLASS.md`).

## Merge #3, 2026-09-15 19:10 (`main` = `63e6b25`, branch = `405f894`; branch `astra-merge` in the main repo, for the parent to fast-forward)

Done in a scratch clone by the merge owner, on `main`'s terms: `git merge blender-work` (16 conflicts, as merge #2 listed), then
every conflict and every out-of-contract file resolved by side, then the hero fixed to compile against `main`'s physics.

### What came from where

| side | paths |
|---|---|
| **`main`, wholesale** | `src/physics/**` (byte-identical; the branch's 12 new physics tests / fixtures dropped — they test dynamics `main` does not have), `harness/bot/**`, `harness/stranger/**` (the branch's `controls.ts` / `provenance.ts` / `session.test.ts` and 14 stranger recordings dropped), `harness/out/metrics/**`, `harness/inputs/{b1,b3,m1}/**`, `harness/gate/expected.json`, `src/tracks/golden.json`, `docs/plans/README.md`, `src/game/**`, `src/ui/**` except the garage / outfit files, `src/render/index.ts`, `src/render/post/chain.ts`, `src/render/world/**` |
| **branch, wholesale** | `src/render/hero/**` (12 files rewritten + 9 new tests / utils), `assets/blender/**` (37 MB), `assets/design/hero-targets/**` (10.7 MB), `public/models/**` (bike + bike-lod re-exported, `rider-{street,race}[-lod].glb` + `.source.json`: 2.8 → 7.0 MB), `src/ui/{garage,outfit}*`, `src/boot/{asset-totals,model-catalog,outfit}*` + `plan.generated.ts` / `totals.ts` / `handoff.ts` / `inline.ts`, `vite.config.ts` (the model catalog plugin, content-hashed model URLs, per-outfit hero totals), `harness/hero-{browser,capture,contracts,play,ship}.*`, `harness/lib/production-sim*`, `harness/inputs/hero-r*/**`, `harness/e2e/{engine-replay,outfits}.mts`, `docs/BLENDER_HANDOFF.md`, `project/archive/BLENDER_HERO.md`, `docs/evidence/**`, `src/render/frame.ts` (`relUp` now subtracts the chassis's rotation at the rider, + `frame.test.ts`), `src/render/lighting/environment.ts` (shadow-map dispose), `src/render/art/library.ts` (`releaseGPU`) |
| **`main` + the branch's hooks re-applied by hand** | `src/render/index.ts`: `RiderOutfit` option, `setRiderOutfit()`, `setModels()` loading `riderUrl(outfit)` for both detail levels, `riderDocumentOutfit` + `riderOutfit` in `debugInfo()`, `HERO_SMALL` gaining `shock_(shaft\|clevis)`. **Not taken**: the branch's `ResourceRetirement` / context-loss / `sceneEpoch` / `compileAsync` layer (`resourceRetirement.ts`, `contextResources.ts`, `compilation.test.ts`, `harness/e2e/render-{context-loss,retirement}.mts` dropped) — it rewrote the `compileMaterials` that perf cut #1 / round 14 made synchronous and is not hero work. `src/render/post/chain.ts`: `main`'s + one line, `this.composite.dispose()` (the composite ShaderPass was never released). `src/game/app.ts` / `src/main.ts` / `src/core/types.ts` / `src/ui/styles.ts`: `main`'s + the additive outfit plumbing (`RiderOutfit`, `riderOutfit` / `onRiderOutfitChange` options, `garage.show(bike, outfit)`, the garage outfit CSS) |
| **new, render-side** | `src/render/hero/riderRig.ts` — the branch's rider anatomy profile and forward / inverse COM ↔ hips map, moved out of `physics/v2/rider.ts` unchanged (pure geometry); `src/render/hero/assetFrame.ts` — the branch's `BIKE_GEOMETRY_V2` (the glb's authored attachment frame) + a straight-axis `suspensionPoint`, moved out of `physics/v2/tuning.ts`; `src/render/hero/gltfRiderAdditive.test.ts` — `main`'s arms-regression test kept under its own name next to the branch's `gltfRider.test.ts` |

### The physics-export gap list (what the hero asked of the branch's physics and how it is met on `main`)

1. **`PhysicsState.riderBody` — the headline gap.** The branch's rider is posed from the simulated body (`GltfRider.chainFromBody` →
   `riderRigFromCOM`); `main`'s R6 solver has that body (`px[RIDER]`, `an[RIDER]`) and exposes it in `debug().rider.body` but has
   **never** exported it in `getState()` (`git log -S"riderBody:" -- src/physics/v2/bike.ts` is empty), even though `core/types.ts`,
   `core/hash.ts`, `render/frame.ts` and rendering.md's round-13 H2 table all anticipate it. Exporting it is one line — and
   `hashPhysicsState` hashes `riderBody` whenever present, so it would move every v2 golden (`gate/expected.json`, every `bot-3*.json`
   hash): a physics-owner round, not this merge. **Merged behaviour: `f.riderBody.present` is false, the rider poses through the
   spring path from `state.rider` (lean / crouch / torsoPitch / armExtend) exactly as `main` does today; the branch's physical-pose
   path is live code proven by `gltfRiderPhysical.test.ts` (which injects `debug().rider.body`) and dormant in the game.** Note for
   the physics owner: on the E2 bot replays that test replays, `main`'s internal body winds past π at tick 682 (Rookie) / 539 (Pro),
   reaches 144 rad / 36 rad, and sinks 1.0 m / 0.56 m below the chassis COM while the run stays `riding` with no fault — `main`'s
   own `debug().riderChain` saturates at the arm's 0.599 m reach the same way. Exporting the body as-is would draw that.
2. **`rider.ts` rig helpers** (`RIDER_PROFILE`, `makeRiderRigPose`, `riderRigFromHips`, `riderRigFromCOM`, `RIDER_TORSO_REST`) →
   `src/render/hero/riderRig.ts`, unchanged. `main`'s ψ = 0 is the 40° stand-attack torso, the same zero. Differences kept on the
   render side: the branch's `forearm` 0.27 m (what the glb was fitted with) vs `main`'s `CH.forearm` 0.30 m — it only steers the
   elbow pole, the bone lengths come from the glb; `main`'s body COM is the pose-table COM (lean 0 at chassis (−0.12, 0.62)), not the
   de Leva mass map's, so the inverse map would seat the hips a few cm from `canonicalPose` (moot while gap 1 stands).
3. **`tuning.ts` `BIKE_GEOMETRY_V2` / `suspensionPoint` / `SuspensionV2.hinge`** → `src/render/hero/assetFrame.ts`. The glb was
   authored so its reference axles are `main`'s rest axles: Rookie rear (−0.585, −0.21) exact, front 5.0 mm off ((0.715, −0.21) vs
   (0.715, −0.215)); Pro (wheelbase 1.28 vs the asset's 1.30) 1.0 cm inboard at the rear, 1.12 cm at the front. Under travel `main`'s
   rear wheel moves on the straight axis (0.12, 0.99), a chord of the swingarm arc (meets it at compression 0 and 0.303 m): the wheel
   leaves the arm's end by the sagitta — **29.4 mm worst over the b3 golden** (`GltfBike.debug.armLengthError`; the swingarm still
   aims at the wheel), 26.6 mm at 0.15 m compression; the front wheel sits ≤ 2.6 mm off the glb fork line. `gltfBike.test.ts`
   asserts these numbers instead of the branch's hinge closure (< 0.2 mm); a future hinge makes them tighten.
4. **`Sim.rules`** — `main`'s bot `Sim` type lists `rules` (the branch's `plan()` took `Omit<Sim, 'rules'>`); `hero-play.ts` casts
   at its one call site, `main`'s bot never reads it.
5. **Additive clips** — both sides fixed the 5649aa6 shoulder drift: `main` re-sets bone-local positions each frame, the branch
   layers rotations only and ignores every non-pelvis position track. `main`'s test 1 ("shoulder rises 1 cm") is re-expressed as
   chest rotation 0.050 rad + shoulder position at bind; its drift tests 2–3 pass unchanged.
6. **`hero-webkit.mts` hand probe** — the branch's rider holds the bar through `gripSocket.<L|R>` (a palm child of the hand bone,
   |wristFromGrip| = 6.04 cm); the probe read the wrist bone and reported 6.04 cm on every leg. It now reads the socket (harness fix,
   no rider change).

### Every check (scratch clone, `dist/` built once from the merged tree)

| check | result |
|---|---|
| `tsc -p tsconfig.json` / `tsc -p tsconfig.harness.json` / `eslint .` | clean / clean / clean |
| `vitest run` | 62 files, **781 / 781**; `vitest run src/physics` **157 / 157** on a `src/physics` byte-identical to `main`; `harness/gate/expected.json` and `src/tracks/golden.json` unchanged |
| `harness:hero-webkit --engine both` | **PASS**: grip max 0 cm, IK residual 0 cm, reach err 0 cm, drift floor / max 0 / 0 mm, GPU mask overhang ≤ 0.5 px on webkit + chromium × low + high harness legs and webkit low + high live-app legs; webkit vs chromium hand rows Δ 0.00 cm |
| two `harness:capture` runs of the b1 golden | mp4 md5 `61f9cbeaec3aec0bd38ef53c79d83b88` both; the 638-frame PNG sets md5 `58ed9c448ca21a696a5d41cb8c2963ba` both; finish 41.558 s, hash `c8ab25a7673f4e06` (`main`'s `b1-first-ride.json`) |
| six battery-window clips (`harness:clip`, high) | camera PASS on all six; every `finalHash` byte-identical to round 12's battery cell on `main` (7575ebaf… d50ea864… 8a8274e5… 8d51439e… ec20f8ed… f8189f3c…) |
| `harness:e2e --only=front,run` | **399 / 399** (4 flows, iphone13 + iphone15promax, 63 s wall) |
| deliverables | `harness/out/capture/merge3-hero-b1/clip.mp4` 932×430 @ 60, 6.0 s, ticks 1800–2520, camera PASS 0/360; stills at 1 / 3 / 5 s |

### Blind critic round (Pillar H, merged hero `high` vs the round-12 references, same windows, fresh critic per pair, `--mask`)

Pairs `harness/out/compare/merge3/pair-<tag>-20260915-1902xx-*`, seeds 301–306, verdicts `critic-merge3-*` in `harness/out/metrics/compare.jsonl`
(ours sat on A five times, B once). Round 12's verdict on the same six cells with `main`'s hero is in the last column.

| pair (cell vs reference) | ours | pick | conf | the tell (verbatim `nonAAA`, abridged) | round 12 |
|---|---|---|---:|---|---|
| wheelie-launch (b3 wheelie-industrial vs Evolution gold run) | A | **ref** | 0.86 | "the rider is a frozen pose welded to a bike that is already wheelieing at t=0 — no throttle beat, no rider lag, no settle"; "single-frame black wedges popping into the top-left at 0.57 / 1.30 / 1.37 s"; "camera is an unmotivated distant orbit" | ref 0.62 |
| fault-respawn (m2 crash-snow vs Evolution tumble hard-cut) | A | **ref** | 0.60 | "rider and bike stay one rigid object as they land upside down, nothing tumbles, nothing kicks up, and the scene is cut away six frames later — a scripted teleport"; `bike-becomes-debris` A 2 / B 5; ours wins `back-in-control-under-1s` 5 / 2 | ref 0.70 |
| big-jump-landing (m2 landing-snow vs Evolution A-licence descent) | A | **ref** | 0.60 | "landing over-rotates into a near-loop with a fast, undamped pitch and no suspension settle; the camera never pulls out for the air" (ours had the dust puff 3 frames after touchdown; the reference had 8 frozen frames before its cut) | ref 0.55 |
| bunny-hop (h2 hop-nightcity vs drum-spool hop) | A | **ref** | 0.62 | "camera hides the manoeuvre: a top-down wide frame in which the bike moves like a small cursor across crates, no readable preload crouch, apex, compression or settle" | ref 0.78 |
| world-industrial (b1 riding vs Evolution warehouse) | A | **ref** | 0.60 | "constant-velocity glide, rider locked in one pose, zero pitch or suspension response over four seconds — a scrolling diorama" | ref 0.72 |
| world-canyon (e1 riding vs Rising canyon) | B | **ref** | 0.80 | "moves like a cursor on rails: camera welded to the bike, rider frozen, no suspension event or settle" | ref 0.82 |

**Tally: ours 0 / 6** (round 12 on the same cells: 0 / 6). Pillar H's bar (≥ 2 / 6) is not met by this merge. The rider tells are the round-12
tells unchanged — "statue rider", "rider and bike tumble as one" — which is gap 1 made visible: with `riderBody` unexported the merged
rider is posed by the same `state.rider` spring path as `main`'s, so the branch's skinned rider, outfits, IK and materials land while the
motion the critics judge does not change. The new asset brought no new tell (no arm, hand or wheel misplacement named on any pair; the
b3 "black wedge" is the round-12 world tell (4), foreground geometry crossing the near plane). What would move the count is the physics
owner's `riderBody` export (with the E2 wind-up understood) plus the camera items the round-12 battery already lists.

### To close (updated)

- [x] Merge owner: the render / asset / garage set merged on `main`'s terms (this section); every gate item above green; critic round 0 / 6 (Pillar H stays open on gap 1).
- [ ] Physics owner: export `riderBody` in `getState()` (one line, re-hash the v2 goldens, strangers unchanged) **after** the rider body's
      wind-up / sink on E2 (gap 1) is understood — then the hero's physical-pose path switches on by itself (`frame.ts` already reads it).
- [ ] Physics owner, optional: a hinged rear wheel (gap 3) closes the 29 mm arm-length error; a Pro wheelbase of 1.30 or a Pro glb closes the 1 cm.
- [ ] Parent: fast-forward `main` to `astra-merge`; record the merge commit and the critic verdict in `docs/plans/README.md`.

## Rules for the merge (so the hero work lands without losing the physics evidence)

1. **Physics changes come through the physics owner's protocol or not at all.** A change to
   `src/physics/**` on the branch merges only with `pnpm vitest run src/physics` green (no test weakened
   without a numbered deviation in `docs/design/physics.md`), the harness goldens regenerated and
   browser-verified, and a stranger re-run on b1–e3 in band. If the branch needs a rider body / joint frame
   *exported* for rendering, that is a `PhysicsState`/`debug()` addition (allowed) — not a change to
   dynamics.
2. **Render / assets / garage merge on their own once green**: the parent cherry-picks or merges
   `assets/blender/**`, `public/models/**`, `src/render/hero/**`, `src/ui/{garage,outfit}*`,
   `harness/hero-*` when `pnpm typecheck && pnpm lint && pnpm vitest run` pass on the merged tree and two
   captures of the b1 golden are md5-identical; the blind critic's next round judges the result.
3. **Astra merges `main` into `blender-work` at least once per round** (the perf owner's cuts and the
   loader/menu/controls work must not be redone on the branch); conflicts in `src/render/index.ts` are
   theirs to resolve against `project/archive/PERF.md` (performance wins are not reverted for looks).
4. Nothing from the branch is deployed until it is on `main`; deploys stay clean-`git archive HEAD` of `main`.

## To close

- [ ] Astra: split the physics changes into (a) export-only (merge) and (b) dynamics (a physics-owner
      round with the R-tables re-run), or drop (b).
- [ ] Parent: merge the render/asset/garage set; run the gate and a critic round on the merged hero.
- [ ] Record the merge commit and the critic verdict in `docs/plans/README.md`.
