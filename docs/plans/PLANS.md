# What we are building — the plans and where each stands

**Standing goal: build every plan in this folder to completion and archive it. The 3-hour close-out contract is `docs/plans/CLOSEOUT.md` (2026-09-15 16:30).** Completion = each plan's own done lines, judged by evidence (gate, strangers, blind critic, device report), never by the parent's feeling.

One page, kept current by the parent at every commit. The bars no plan can close (wowed vs the real game, PS4 picture, the hero as a person, desktop-high at 60 on a phone, sound as a recording, fun) live in `docs/mission.md`; plans carry their measurable proxies. Percentages are against each plan's own
"done" lines, not a feeling. Live build: https://trials-gauntlet-demo.vercel.app · pinned v0.1.0:
https://trials-gauntlet-v0-1-0.vercel.app · `RELEASES.md` has the ledger.

## Independent audit — 2026-09-15

The [game audit](../reviews/game-audit-2026-09-15.md) and separate [physics-library review](../reviews/physics-library-audit-2026-09-15.md) review `56e3883` plus the existing working-tree changes, physics/track fingerprint `a6d63cfd`. **Release readiness is blocked:** a fresh production build emits an invalid inline loader (`vite.config.ts:228`), and the required test suite has one reflex-memory failure. Development-harness replay passes 9/9 determinism checks; flat-test and b1 clear on both bikes; manual restart returns to riding in one tick. No game fixes landed in this audit round.

The percentages below remain plan estimates, not audited completion of the README. Newer evidence supersedes several older notes: hard AI-stranger runs now exist; X1 has only one completed run; crowd/ambience/music and audio comparisons exist, with all 11 recorded audio verdicts preferring the reference. AI-stranger metrics do not establish human learnability. Auto phones still cap at 30 fps, and current-source real-device 60 fps proof remains outstanding. Next release gate: fix production boot and the failing check, then repeat production startup, crash/restart and real-player/device validation. The proposed engine comparison is research scope only; no migration has been selected.

| plan | file | goal | status | % | next gate |
|---|---|---|---|---|---|
| **The brief** | `README.md` | a 2.5D Trials-quality bike game, deterministic, 60 fps, desktop + iOS Safari | in build | — | — |
| **Mega plan (v0.2.0)** | `docs/plans/MEGA_PLAN.md` | five pillars: hero motion, world as place, clearable by people, complete game, evidence | wave 3 | ~70 | e3 re-author + stranger re-run → blind critic r3 → pin v0.2.0 |
| **Physics v2** | `docs/plans/physics-v2.md` + status in `docs/design/physics.md` | ground-up two-body physics: validated per tick, learnable, reproducible | R5 shipped, default since `9b4275c` | ~85 vs the plan, ~75 vs "learnable by a human" (strangers pass b1–e2) | e3 + medium stranger round → freeze tag `physics-v2-r5` |
| **Rider on Glass** | `docs/plans/RIDER_ON_GLASS.md` | the rider and bike are the hero; the game is proven on a phone | two ledgers | **G (Opus) 100 — closed · H (Astra) — on `blender-work`** | H: the branch merge (`docs/tasks/blender-branch-merge.md`) + a critic round; the plan archives when H closes |
| **Perf (60 on high, on a phone)** | `project/archive/PERF.md` (closed 2026-09-15, `831e9c4`) · live backlog `docs/plans/PERF-BACKLOG.md` | bench + 100× plan, then a cut loop; phone-high tier + 60-cap governor | **done — archived**: phone-high tier live, 60-cap governor live, bench + WebKit gate + ship-gate G11, ledger through cut #4b (b1 phone-high 205 → 123 calls, 6.57 → 1.59 Mpx; model 35 → 8.8 ms on the user's phone) | 100 | the backlog's next cut (#4 remainder, 123 → ≤ 100) whenever a perf owner is spawned |
| **P0 task** | `docs/tasks/touch-navigation-invariant.md` | nothing tappable unless drawn | landed `18df821` (5184-tap grid, 0 ghosts) | 95 | the user confirms on the phone |

## Device instruments on this machine (no more asks to the user)

- `docs/device/2026-09-15-5649aa6.md` — device report #1 (the user's iPhone), the calibration baseline.
- **Playwright WebKit** (`~/Library/Caches/ms-playwright/webkit-2336`) — macOS WebKit renders WebGL through
  ANGLE-on-Metal, the same stack as iOS Safari; `harness/hero-webkit.mts` (in flight) is the hero gate on it.
- **iOS Simulator** — runtime iOS 26.5 installed, device `trials-iphone` (iPhone 16 Pro,
  `F3058DD5-DCB6-4D86-93CC-6E56A785B788`): `xcrun simctl boot … && xcrun simctl openurl … <url> && xcrun simctl io
  … screenshot out.png` gives a real Mobile Safari frame (portrait only from the CLI — it lands on the rotate prompt;
  landscape needs the Simulator UI or a WebDriver session). `agent-browser -p ios` needs `safaridriver --enable`
  (sudo) — not done.
- `agent-browser` (Vercel) — global (`~/Library/pnpm`), dotfiles `agent-browser/install.sh`, devDependency here.

## Decisions taken by the user

| date | decision |
|---|---|
| 09-14 | Main menu → **B Broadcast** (`assets/design/menu/B-broadcast.jpg`, SPEC in `assets/design/menu/SPEC.md`) — core-game builds it |
| 09-14 | Plans live in `docs/plans/`; completed/stale docs go to `project/archive/` |
| 09-15 | **The user runs no more benchmarks**; mobile is capped at 60 with a governor Auto that climbs to high; the machine self-measures (WebKit, simulator, bench) |
| 09-15 | Hero/graphics → Codex Astra 6 on `blender-work`; `main` keeps physics/tracks/harness/core/perf; merge rules in `docs/tasks/blender-branch-merge.md` |
| 09-15 | Touch controls → **G strip with keys** (`assets/design/controls/G-strip-keys.png`, SPEC § Round 2); colours: GAS green, BRAKE red, **the two LEAN keys equal weight in one shared neutral scheme** (neither primary nor secondary) |
| 09-15 | Loading screen → **B Odometer**, but keeping **two bars with two percentages** (DOWNLOAD / SETUP as parallel tracks) and **two detail lines**, one per track; both numbers monotone and ending at 100 by the loader invariant (`docs/tasks/loading-progress-invariant.md`) |
| 09-15 | **Level review is a top-level REVIEW button on the main menu** (next to PLAY / GARAGE / SETTINGS) that opens a review level picker → the review UI (free camera, six segments, comments, Copy review); `?review=<track>` survives only as a deep link for e2e. Core #10 builds it. |
| 09-14 | Phones are **not** pinned to low in Auto — a perf owner makes the tiers fast instead (60 on high is the goal) |

## Parallel branch — `blender-work` (Codex Astra 6, since 2026-09-15)

The user handed the hero (rider + bike look, AAA graphics) to a Codex agent in the worktree
`trials-gauntlet-blender`. Rules and the test-merge result are in `docs/tasks/blender-branch-merge.md`: the
merge is conflict-free today but the branch's solver changes fail 17 physics acceptance tests, so physics
merges only through the physics owner's protocol; render/assets/garage merge once green. Rider on Glass
Pillar H is now Astra's; `main`'s render owner is the perf owner (PERF-BACKLOG.md) and does not touch `src/render/hero/**`.

## Status per pillar (mega plan)

| pillar | % | what is left |
|---|---|---|
| P0 physics v2 | 80 | human-rate learnability (R5 → strangers), lab hop air margin |
| P1 hero moves like 145 kg | 70 | blind critic r3: ours 2/6 (count met), tells still name camera pull-out, hero shadow on high, rigid rider → render r14 |
| P2 world reads as a place | 60 | per-biome blind verdict; exteriors need the track on structure over terrain |
| P3 clearable by real people | 85 | strangers pass beginner, easy, medium; **hard ridden (r6, Pro default): h1 16 in band, h2 10 / h3 16 / x1 18.5 / x3 19 under band, 13/13 cleared** → bands or tracks (tracks r10); **the user has cleared all 6 beginner + easy tracks on the phone (2026-09-15)**; the audit's point stands: AI strangers are a proxy, not human learnability |
| P4 complete game | 80 | audio mix round, local per-track leaderboard, onboarding proof with a stranger |
| P5 evidence | 70 | blind critic cadence restored (r3 run, 6 pairs); v0.2.0 not pinned; the final 38-pair battery not run |
| P6 sound at AAA (added) | 40 | r3 retuned to v2 + crowd/rooms/stingers/music shipped; **blind audio A/B ours 1/12** — tell: metronomic pinned-pitch mono pulse train, click for a landing → audio r4 (per-firing jitter, stereo, landing thump, no respawn re-trigger) |

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
| 09-15 | **6/15 cleared on the phone** (all beginner + easy; e3 on Pro) | — | screenshot 14:40 |
| 09-15 | garage still under 30 fps after the canvas-CSS removal | `?bench=1` device instrument + phase-locked cap | `cfc98f8` |
| 09-15 | MENU pill over the medal totals | header inset | `8efc682` |
| 09-14 | taps on invisible buttons navigate (results Menu under the gas thumb) | the `.live` invariant, 5184-tap grid | `18df821` |
