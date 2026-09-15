# Task: merging the Codex `blender-work` branch (Astra 6) into `main`

Status: OPEN (filed 2026-09-15 13:55 by the parent). Owner: parent (merge), Astra 6 (branch).

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
   theirs to resolve against `docs/plans/PERF.md` (performance wins are not reverted for looks).
4. Nothing from the branch is deployed until it is on `main`; deploys stay clean-`git archive HEAD` of `main`.

## To close

- [ ] Astra: split the physics changes into (a) export-only (merge) and (b) dynamics (a physics-owner
      round with the R-tables re-run), or drop (b).
- [ ] Parent: merge the render/asset/garage set; run the gate and a critic round on the merged hero.
- [ ] Record the merge commit and the critic verdict in `docs/plans/PLANS.md`.
