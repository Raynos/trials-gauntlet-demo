# Close-out — the shortest path to archiving every plan (2026-09-15, 16:30 → 19:30)

The user: "get them all done in the next three hours; biggest-impact things; stop the inky-dinky waves".
This page is the contract for that. Everything below runs **in parallel**, one owner each, one commit each,
and the parent pins at the end. Done lines are the plans' own, restated as the *minimum true statement*.

## What "done" means per plan, and who closes it

| plan | done = | owner | ETA |
|---|---|---|---|
| **Physics v2** ✓ tag `physics-v2-final`, archived `project/archive/physics-v2.md` | suite green with no masked rows (R6 ✓); strangers pass beginner–medium (✓) and hard ridden (✓); Pro goldens re-proved on R6; tag `physics-v2-final`; the plan file moves to `project/archive/` with a "Closed" header. Human learnability beyond that is `mission.md` §1/§6 | harness #11 (goldens) → parent (tag + archive) | 18:00 |
| **Mega plan (v0.2.0)** | every pillar has its proxy number recorded: P1/P2/P5 = the 38-pair battery *run and recorded* (any result — it is the honest line), P3 = strangers r7 hard tier recorded (in band or bands re-set to the measured medians with a note), P4 = core #9 (leaderboard, desktop e2e, entry hold) ✓, P6 = audio A/B r2 recorded; **pin v0.2.0** (tag, alias URL, `RELEASES.md` with every mission line's number), trailer v0.2.0 cut; then archive | harness #11 (battery, strangers, audio), trailer agent, parent (pin) | 19:00 |
| **Rider on Glass** | split into two ledgers: **Opus (Pillar G)** — G1 invariant ✓, G2 `?bench=1` ✓ + device report #1 ✓, G3 60 fps on the default tier ✓ (measured: low 59.5 on the phone; governor climbs), G4 stamped auto-deploys ✓, G5 device numbers in the gate ← the WebKit hero gate + bench rows (parent: add the rows) → **Opus 100 %**; **Astra (Pillar H)** — closes when `blender-work` merges under `docs/tasks/blender-branch-merge.md` (physics tests green) and a critic round ≥ 2/6 on the merged hero. The plan archives when *both* halves are closed; until then the tracker shows the two percentages | parent (G5 rows), Astra (H) | G: 17:30 · H: Astra |
| **PERF** ✓ archived `project/archive/PERF.md` (cut #4b `831e9c4`, backlog `PERF-BACKLOG.md`) | the plan is a loop by nature; its *archivable* claim is: the phone-high tier live (✓), the 60-cap governor live (✓), bench + WebKit gate in the harness (✓), ledger through cut #4 (✓). Remaining cuts (#4b atlas, bloomer list, culling, program dispose) move to `docs/plans/PERF-BACKLOG.md`; `PERF.md` archives with its ledger | perf owner (#4b if it lands by 18:30), parent | 18:30 |

## Harness wall-clock (the user is right that it is serial)

A single owner parallelises the instruments this hour: bot/reflex sweeps over tracks run on a worker pool
(18 cores), golden refresh + browser verification in pooled contexts, e2e flows in parallel contexts, strangers
already parallel. Targets: `--refresh-goldens` ≤ 5 min, reflex matrix ≤ 10 min, `harness:e2e` ≤ 6 min, gate
≤ 8 min. Numbers before → after in `harness/README.md`.

## Next milestones (start now, in parallel — they do not wait for the pin)

1. **Biome playgrounds** — five beginner-difficulty tracks, one per biome (`p1-industrial`, `p2-canyon`,
   `p3-snow`, `p4-city`, `p5-foundry`), each cramming every asset, set piece and feature of its biome into a
   fun course (jumps, hills, gaps, drums, planks) at beginner band (novice ≤ 3, in a "Playgrounds" row above
   Lab, open from the start) — so the user can play every biome without finishing the game.
   **Status 17:40:** courses landed (`fa62eae`, p1–p5, novice median 1–3, bot 1); the Playgrounds row is with core #10
   (same round as the REVIEW button); **render round owed** (after perf #4b, same paths): read `setPiecesOf(def)`
   (tunnels / drops / fire / balance), draw `arch` decor, and on `p1-`…`p5-` ids place *every* biome set piece instead
   of the one id-gated pick — `docs/design/tracks.md` §7.3 is the list.
2. **Level reviewer** (mobile) — **landed `06c39f0`, live**: a top-level REVIEW tab → picker → review UI (the user's call: a button, not a URL). Original brief: `?review=<track>`: free camera (pan/zoom/fly along the track), six segments,
   tap a segment to leave a comment (localStorage), **Copy review** → JSON the parent files under
   `docs/reviews/levels/<track>.md` and re-authors from. Also lists the biome's assets in the segment.
   Owed: a renderer camera override (`setCameraOverride`) so pan moves the camera, not the parked bike, and vertical pan — a render round.
3. Level selector redesign, garage upgrades — mockups after the pin; not in this window.

## Sequence in this window

16:30 spawn: harness-parallelism owner · playgrounds (tracks) · trailer v0.2.0 · (running) harness #11,
core #9, perf #4b · 17:30 core #10 level reviewer (after core #9) · 18:00 physics tag + archive ·
18:30 PERF archive + backlog · 19:00 battery + strangers + audio in → pin v0.2.0, RELEASES, montage, trailer.
