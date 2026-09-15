# Rider on Glass — the second mega plan

Two themes from the outside review (Fable 5.1, 2026-09-14 evening), built in parallel with
`docs/plans/MEGA_PLAN.md` (v0.2.0) and `project/archive/physics-v2.md`: **the rider and bike are the hero**, and
**the game is proven on a phone, not a laptop**. "Rider on Glass": the thing in the middle of the
screen, on the piece of glass in the player's hand.

Safety net unchanged: v0.1.0 is pinned at https://trials-gauntlet-v0-1-0.vercel.app.

## Why (the review, verbatim in substance)

> **Make the rider and bike the hero.** Every blind-critic loss is about the thing in the middle of the
> screen: a uniform yellow mannequin, spokes razor-sharp at speed, pitch frozen in the air, no squash
> on landing. The world around it has caught up; the hero has not. The build: a real rider with suit,
> helmet, visor and shading; bike and rider animation driven entirely from physics state (fork and
> shock travel, wheel blur, pose lag, landing compression, dust); a directional key light so the hero
> casts a shadow; a camera that never loses the bike. Judged only by blind clip-versus-clip pairs every
> round, since the plan's own done line is the critic picking ours at least 2 of 6.

> **Ship phone-first, and prove it on a phone.** The brief says iOS at 60 fps. Today the phone runs at a
> 30 fps cap that nobody measured, taps on empty screen navigate the game, no real device has ever
> produced a number, and production is a commit behind and stamped `dev`. The build: a device loop
> where every round ends with a real iPhone run that records fps, thermal and the touch log; the input
> invariant and its tap-grid test as a gate; 60 fps on the low tier as a hard threshold; deploys stamped
> with the commit and automatic.

## Two ledgers (2026-09-15): Opus owns G, Astra owns H

| half | owner | % | closes when |
|---|---|---|---|
| **Pillar G — glass** | Opus 5 (this session) | **100** | G1 ✓ (`18df821`), G2 ✓ (`cfc98f8`, device report #1 filed), G3 ✓ (60 fps on the default tier measured on the user's iPhone: low 59.5; the governor climbs to phone-high, `ed0cf50`/`682d05c`), G4 ✓ (commit-stamped clean-HEAD deploys), G5 ✓ (ship-gate G11: `device.fpsLow60` 59.5, `device.thermalDropPct` −0.7, `device.worstMsHigh` 81 from the newest `docs/device` report — informational until three reports — and `hero.webkit.driftMaxMm` 2.1 ≤ 5 as a real check; `harness/gate/device-rows.ts`). **Pillar G closed.** |
| **Pillar H — the hero** | Codex Astra 6, branch `blender-work` | Astra reports | the branch merges under `docs/tasks/blender-branch-merge.md` (physics tests green) and a blind critic round picks ours ≥ 2/6 on the merged hero with no weight/suspension/lag/camera tell |

The plan archives when both halves are closed.

## Pillar H — the hero

Owners: render (hero materials, lighting, camera, secondary animation), blender (`assets/blender`,
the glTF rider/bike sources), pose (`src/render/rider/pose.ts`), harness (blind pairs).

| item | done means |
|---|---|
| H1 A real rider | glTF rider with a textured suit (fictional sponsor set), helmet with visor reflection, gloves/boots, skin shading with a proper normal/roughness set; no flat colour at riding distance; body/limb volume and a chunkier helmet so the riding-distance two-up no longer reads "tube figure" (round 2). The bar — a critic cannot tell which rider is ours — is `docs/mission.md` §3 |
| H2 Everything from physics state | fork + shock travel from `suspension.*.compression`, wheel blur from wheel ω, rider pose lag from `riderBody` (v2's simulated rider — the drawn rider *is* the simulated one), landing squash from the compression spike, dust from tyre slip × load, chain/sprocket from wheel ω; a table in `rendering.md` mapping each visible motion to the state field that drives it, none from timers |
| H3 The hero casts a shadow on every tier | one directional key light per biome; on `low` a hero-only shadow (a 512² caster-limited map or a projected contact blob that follows compression), never "no shadow" |
| H4 Camera never loses the bike | the gate's camera box row green on every track at every tier; air camera keeps the landing zone in frame; no frame in a stranger session with the bike outside [0.2, 0.8]² |
| H5 Blind pairs every round | `harness/compare` runs wheelie / landing / crash / hop pairs against the reference corpus every render or physics round; the round's verdict and tells are logged in `rendering.md`; **done = ours picked ≥ 2/6 with no tell naming weight, suspension, rider lag or camera** |

## Pillar G — glass

Owners: core-game (device loop, stamp, bench), render (60 fps low tier), harness (gates), parent
(automatic deploys).

| item | done means |
|---|---|
| G1 The input invariant | `docs/tasks/touch-navigation-invariant.md` closed: nothing is hit-testable unless drawn at ≥ 0.5 opacity for ≥ 150 ms; the tap-grid transition test in `harness/e2e` is a ship-gate row |
| G2 A device loop | `?bench=1` runs a fixed 30 s replay on b1 on the device and shows fps p50/p95/min, worst frame, tier, DPR, render-target Mpx, JS heap, a thermal proxy (fps at 0–5 s vs 25–30 s) and the touch/navigation log on screen with a **Copy report** button; the report also lands in the run telemetry. Every round ends with a report from the user's iPhone pasted into `docs/device/<date>-<commit>.md` |
| G3 60 fps on the phone's default tier | on the reference device (the user's iPhone) the bench shows p95 ≤ 16.7 ms on the tier Auto picks, for 30 s with no thermal fall-off; the phone default cap moves 30 → 60 only when the device report says so. `PERF.md` climbs from there toward medium and a phone-`high`; the desktop-high-at-60 bar is `docs/mission.md` §4 |
| G4 Stamped, automatic deploys | the build stamp is the commit (`BUILD <sha7> · <date>`), never `dev`, from `git rev-parse` at build time; `pnpm deploy` does the clean-`git archive HEAD` production deploy and appends the sha + URL to `RELEASES.md`'s live line; the parent runs it after every commit on `main` |
| G5 Real numbers in the gate | ✓ ship-gate G11 (`harness/gate/device-rows.ts`): `device.fpsLow60` / `device.thermalDropPct` / `device.worstMsHigh` from the newest `docs/device` report, informational until `device.minReports` = 3 reports exist, then `thresholds.json` limits (55 fps, 10 %); `hero.webkit.driftMaxMm ≤ 5` is a real check whenever a `pnpm harness:hero-webkit` run exists. (`navWithoutTarget` is the NavLog's own e2e row, `harness/e2e/touch.mts --only=grid`, already in the gate flow.) |

## Sequence (overnight, parallel with MEGA_PLAN wave 3 and physics R6+)

| round | H (render / blender / pose) | G (core-game / harness) | parent |
|---|---|---|---|
| 1 | H3 key light + hero shadow on low; H2 table + wheel blur + landing squash from state; H4 camera box per tier | G1 invariant (in flight, core-game #4); G4 stamp + `pnpm deploy` | first blind-pair round on the current hero (baseline) |
| 2 | H1 rider suit / helmet / visor from blender + garage close-up; H2 pose lag from `riderBody`, dust from slip | G2 `?bench=1` + Copy report; the user runs it once | device report #1 filed; deploys automatic |
| 3 | H5 blind pairs; fix the named tells | G3 measure 60 on low; render cuts if p95 > 16.7 (hero LOD, medium textures) | cap decision from the report; G5 rows |
| 4 | repeat H5 until ≥ 2/6 | G5 thresholds; e2e grid in the gate | v0.2.0 pin includes the device report |

Rules unchanged from AGENTS.md: owners own paths, the parent commits per round with the finding as the
subject, evidence is played never posed, the phone is the ground truth.
