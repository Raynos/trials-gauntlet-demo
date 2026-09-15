# What we are building — the plans and where each stands

**Standing goal (set by the user 2026-09-14 evening): overnight build until every plan in this folder is complete and ready for `project/archive/`.** Completion = each plan's own done lines, judged by evidence (gate, strangers, blind critic, device report), never by the parent's feeling.

One page, kept current by the parent at every commit. The bars no plan can close (wowed vs the real game, PS4 picture, the hero as a person, desktop-high at 60 on a phone, sound as a recording, fun) live in `docs/mission.md`; plans carry their measurable proxies. Percentages are against each plan's own
"done" lines, not a feeling. Live build: https://trials-gauntlet-demo.vercel.app · pinned v0.1.0:
https://trials-gauntlet-v0-1-0.vercel.app · `RELEASES.md` has the ledger.

| plan | file | goal | status | % | next gate |
|---|---|---|---|---|---|
| **The brief** | `README.md` | a 2.5D Trials-quality bike game, deterministic, 60 fps, desktop + iOS Safari | in build | — | — |
| **Mega plan (v0.2.0)** | `docs/plans/MEGA_PLAN.md` | five pillars: hero motion, world as place, clearable by people, complete game, evidence | wave 3 | ~70 | e3 re-author + stranger re-run → blind critic r3 → pin v0.2.0 |
| **Physics v2** | `docs/plans/physics-v2.md` + status in `docs/design/physics.md` | ground-up two-body physics: validated per tick, learnable, reproducible | R5 shipped, default since `9b4275c` | ~85 vs the plan, ~75 vs "learnable by a human" (strangers pass b1–e2) | e3 + medium stranger round → freeze tag `physics-v2-r5` |
| **Rider on Glass** | `docs/plans/RIDER_ON_GLASS.md` | the rider and bike are the hero; the game is proven on a phone | round 1 (H1 rider kit landed `47f0455`) | 15 | H3 hero shadow + G4 stamped auto-deploy, then device report #1 |
| **Perf (60 on high, on a phone)** | `docs/plans/PERF.md` (being written) | a benchmark suite and a 100× plan, then a measure → cut → measure loop until an iPhone holds 60 fps on `high`; 10× fallback | phase 1: bench + plan | 0 | bench repeatable ±5 %, plan sums to 100× on paper, first cut |
| **P0 task** | `docs/tasks/touch-navigation-invariant.md` | nothing tappable unless drawn | landed `18df821` (5184-tap grid, 0 ghosts) | 95 | the user confirms on the phone |

## Decisions taken by the user

| date | decision |
|---|---|
| 09-14 | Main menu → **B Broadcast** (`assets/design/menu/B-broadcast.jpg`, SPEC in `assets/design/menu/SPEC.md`) — core-game builds it |
| 09-14 | Plans live in `docs/plans/`; completed/stale docs go to `project/archive/` |
| 09-14 | Phones are **not** pinned to low in Auto — a perf owner makes the tiers fast instead (60 on high is the goal) |

## Status per pillar (mega plan)

| pillar | % | what is left |
|---|---|---|
| P0 physics v2 | 80 | human-rate learnability (R5 → strangers), lab hop air margin |
| P1 hero moves like 145 kg | 65 | blind critic r3 on v2 + render r11/r12 (moved to Rider on Glass H5) |
| P2 world reads as a place | 60 | per-biome blind verdict; exteriors need the track on structure over terrain |
| P3 clearable by real people | 60 | **strangers r4 pass b1–e2 on v2** (1 · 2.5 · 3 · 5.5 · 6.5), e3 fails 15.5 → tracks r8; reflex `average` in band 8/16; user cleared b1, b2 on the phone (2026-09-14) |
| P4 complete game | 80 | audio mix round, local per-track leaderboard, onboarding proof with a stranger |
| P5 evidence | 60 | blind critic lapsed since render r8 (cadence rule now written); v0.2.0 not pinned; the final 38-pair battery not run |
| P6 sound at AAA (added) | 25 | mix tuned to v1; no crowd / ambience / music; no blind audio A/B |

## Field reports from the phone (the user's iPhone, LTE)

| date | report | fix | commit |
|---|---|---|---|
| 09-14 | loads twice back to back | SW `clients.claim()` controllerchange reload only on the toast's Reload | `145ae28` |
| 09-14 | desktop legend / desktop onboarding on mobile | mux presumes touch on coarse pointer; applied at start | `145ae28`, `45f6b62` |
| 09-14 | game shown in portrait instead of rotate prompt | rotate prompt above the onboarding card | `31e9019` |
| 09-14 | loader stuck at 94 %, script-parse never ✓ | reporter rebind, capped art waits, two honest bars, background group | `45f6b62`, `e55c4dd`, `e05153e`, `cf13f8b` |
| 09-14 | touch zones gone / an unseen pause button | device applied at start | `45f6b62` |
| 09-14 | settings rows unlabeled, "reload twice" | lab HUD `.lab` class collision | `e55c4dd` |
| 09-14 | scroll in settings → track select; taps hit hidden buttons | hidden screens out of hit-testing; hidden replay bar was live at z 5; **P0 invariant task open** | `e55c4dd`, `cf13f8b` |
| 09-14 | not 60 fps, drops from 30 to 24–28 on a flagship, meter "H" | FPS meter; phone starts low; render r12 fill-rate cuts; stored `high` ignored on phones | `733c830`, `12a29f2`, this commit |
| 09-14 | cleared b1 and b2 on the phone; recovery feels hard | R5 airborne limit; strangers r4 pass b1–e2 | `e8f2ec7`, `166d4d7` |
| 09-14 | taps on invisible buttons navigate (results Menu under the gas thumb) | the `.live` invariant, 5184-tap grid | `18df821` |
