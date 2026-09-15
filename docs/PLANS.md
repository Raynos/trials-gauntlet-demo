# What we are building — the plans and where each stands

One page, kept current by the parent at every commit. Percentages are against each plan's own
"done" lines, not a feeling. Live build: https://trials-gauntlet-demo.vercel.app · pinned v0.1.0:
https://trials-gauntlet-v0-1-0.vercel.app · `RELEASES.md` has the ledger.

| plan | file | goal | status | % | next gate |
|---|---|---|---|---|---|
| **The brief** | `README.md` | a 2.5D Trials-quality bike game, deterministic, 60 fps, desktop + iOS Safari | in build | — | — |
| **Mega plan (v0.2.0)** | `docs/MEGA_PLAN.md` | five pillars: hero motion, world as place, clearable by people, complete game, evidence | wave 3 | ~65 | strangers r4 in band on beginner + easy → blind critic r3 → pin v0.2.0 |
| **Physics v2** | `docs/design/physics-v2.md` + status in `docs/design/physics.md` | ground-up two-body physics: validated per tick, learnable, reproducible | R5 shipped, default since `9b4275c` | ~80 vs the plan, ~60 vs "learnable by a human" | reflex `average` in band b1–b3 + strangers r4 → freeze tag |
| **Rider on Glass** | `docs/RIDER_ON_GLASS.md` | the rider and bike are the hero; the game is proven on a phone | round 1 | 5 | H3 hero shadow + G4 stamped auto-deploy, then device report #1 |
| **P0 task** | `docs/tasks/touch-navigation-invariant.md` | nothing tappable unless drawn | in flight (core-game #4) | — | tap-grid test green, the user confirms on the phone |

## Status per pillar (mega plan)

| pillar | % | what is left |
|---|---|---|
| P0 physics v2 | 80 | human-rate learnability (R5 → strangers), lab hop air margin |
| P1 hero moves like 145 kg | 65 | blind critic r3 on v2 + render r11/r12 (moved to Rider on Glass H5) |
| P2 world reads as a place | 60 | per-biome blind verdict; exteriors need the track on structure over terrain |
| P3 clearable by real people | 40 | reflex `average` in band 1/16 → R5 result pending; strangers r4 running; user cleared b1, b2 on the phone (2026-09-14) |
| P4 complete game | 80 | audio mix round, local per-track leaderboard, onboarding proof with a stranger |
| P5 evidence | 70 | blind critic lapsed since render r8; v0.2.0 not pinned |

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
| 09-14 | cleared b1 and b2 on the phone; recovery feels hard | — (R5 airborne limit shipped; strangers r4 measuring) | `e8f2ec7` |
