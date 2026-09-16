# What we are building — the plans and where each stands

**Standing goal: build every plan in this folder to completion and archive it. The 3-hour close-out contract is `project/archive/CLOSEOUT.md` (2026-09-15 16:30).** Completion = each plan's own done lines, judged by evidence (gate, strangers, blind critic, device report), never by the parent's feeling.

One page, kept current by the parent at every commit. The bars no plan can close (wowed vs the real game, PS4 picture, the hero as a person, desktop-high at 60 on a phone, sound as a recording, fun) live in `docs/mission.md`; plans carry their measurable proxies. Percentages are against each plan's own
"done" lines, not a feeling. Live build: https://trials-gauntlet-demo.vercel.app · pinned v0.1.0:
https://trials-gauntlet-v0-1-0.vercel.app · `RELEASES.md` has the ledger. **Every ask the user makes, with its status, is in [`docs/tasks/ASKS.md`](../tasks/ASKS.md).**

## Hero follow-up handoff

**Menu rescue:** main and in-level pause now expose Classic / Blender / Img2 experiment plus all five Blender outfits. Persistence, mobile controls and paused swapping passed the [headless integration check](../evidence/hero-img2-menu/README.md). One experimental rider is selectable; this does not close the garage art or riding-pose milestones. Game deployment remains with the main release owner.

[HERO_OPEN_WORK.md](HERO_OPEN_WORK.md) lists the remaining pose/elbow fixes, coordination with active R8/render-r15 work, Chromium/Metal issue, garage production milestones and acceptance gates. The five-outfit merge does not close these items.

## Garage production — paused at art gate, September 16

`prototypes/hero-garage/` contains the independent Three.js viewer and preserved head studies. **Latest user direction: breadth first.** Assemble the full mustard Street rider and full blue/white bike, deliver a real Three.js screenshot, then polish individual elements. Head/hair acceptance no longer blocks this assembly. Existing authored project GLBs and their seated/forward/back clips provide the initial whole-scene baseline. Final art, contacts, performance, variants, integration and actual iPhone validation remain open. Hunyuan is an isolated rejected experiment; TRELLIS is paused.

The user authorized provisional overnight visual decisions, free personal/noncommercial licensed assets, a **30 fps mobile garage** and a **20% weekly allowance floor**. The hourly continuation is **paused for the art-quality blocker**, with 34% remaining at the stop; final visual approval stays with the user. Next decision: a source/artist capable of the same identity, or explicit revision toward a finished licensed character. No spending/contact/publishing occurred. Existing concurrent gameplay/physics changes are preserved.

## Independent audit — 2026-09-15

The [game audit](../reviews/game-audit-2026-09-15.md) and separate [physics-library review](../reviews/physics-library-audit-2026-09-15.md) describe the earlier `56e3883` working tree (`a6d63cfd`). **Their defect list is historical:** the loader replacement bug is fixed, Auto now caps at 60, and the original finish/fault and reflex regressions pass the latest targeted check. The user's real-device report measured 59.5 fps on low; it does not establish current-build high at 60. The v0.2.0 release and later hero work supersede the original visual/audio counts; see `RELEASES.md` and the dated critic records.

**Latest status check:** HEAD `5b56431` plus in-flight R8 changes, fingerprint `089e0885`. The matching on-disk quick gate is 27/30 (three SwiftShader timing failures; determinism passes, logical restart one tick). Fresh targeted tests give 15/16: the R6 hop-force assertion fails at 1398.931 > 1280; no fresh full-suite pass is claimed. Physics changes, goldens and gate evidence remain uncommitted. The game still uses custom v2; no physics library is installed. The user-requested migration plan now lives in [USE_A_REAL_PHYSICS_LIBRARY.md](USE_A_REAL_PHYSICS_LIBRARY.md): Rapier 2D first, Planck comparison/fallback, implementation not started. AI strangers remain solvability evidence distinct from human learnability; archived plan percentages do not close the mission bars.

| plan | file | goal | status | % | next gate |
|---|---|---|---|---|---|
| **The brief** | `README.md` | a 2.5D Trials-quality bike game, deterministic, 60 fps, desktop + iOS Safari | in build | — | — |
| **Use a real physics library** | [USE_A_REAL_PHYSICS_LIBRARY.md](USE_A_REAL_PHYSICS_LIBRARY.md) | Ship **Custom v2 + a library engine** in the same game, toggled on the main menu so the player can exit, switch and compare the same level/bike | **planned; not started** — Rapier 2D first candidate, Planck comparison/fallback; retain both engines after release, persist selection and separate engine records; no package/adapter landed | 0 | P0: coordinate in-flight R8 work and freeze a reproducible control; P1: 3-5 day qualification; P2: main-menu selector and both playable engines |
| **Hero merge and garage prototype** | `docs/plans/HERO_GARAGE_PRODUCTION.md` | Merge playable rider improvements; independently produce one high-fidelity Blender character/bike | Merged into local main at `62c003d`: five outfits, 814 tests and WebKit flat/B1 byte-identical clear/crash/restart pass. R7 physics retained. Seated/lean/elbow candidate isolated after 15 handling failures; standalone viewer built; two head routes rejected; MPFB trial also unaccepted; MPFB correction2 rejected; Bystedt groom orbit rejected; full rider/bike screenshot and orbit delivered; whole-body seated/rise/rearward clips authored with lower elbows and measured contacts; full-scene comparison and returning motion loops added; bounded cloth correction remains provisional; round12 ship gate passes; 30s desktop orbit p95 26ms fails16.7ms target; independent Hunyuan experiment | — | Whole-scene visual acceptance, clothing/body/bike refinement, runtime budgets and physical iPhone validation; head/hair detail paused |
| **Mega plan (v0.2.0)** | `project/archive/MEGA_PLAN.md` (closed 2026-09-15, tag `v0.2.0` `b52dfd0`) | five pillars: hero motion, world as place, clearable by people, complete game, evidence | **done — pinned + archived**: https://trials-gauntlet-v0-2-0.vercel.app; every mission line's number in the `RELEASES.md` row (battery 5 / 36, audio 2 / 6, strangers in band to medium, 59.5 fps low on the phone) | 100 | the next plan starts from `docs/mission.md` numbers |
| **Physics v2** | `project/archive/physics-v2.md` (closed 2026-09-15, tag `physics-v2-final`) · living status `docs/design/physics.md` | ground-up two-body physics: validated per tick, learnable, reproducible | **done — archived**: R6, 157/157 tests no masked rows, default since `9b4275c`; strangers beginner–medium in band, hard/extreme ridden on Pro; Rookie goldens stable since R3, Pro 17/19 re-proved | 100 | **R7 landed after the tag** (`fe50df5`: the rider body was winding up since R2 — held by a linkage couple, exported as `riderBody`, coasting hop gated; goldens re-searched, reflex better on every track, strangers n = 1: b1 2 above band on a pre-R7 brake endo, e2/e3 under). R8 owed: every-tick COM hold (thrown-rider excursions ≤ 1.33 s), the 15 m/s brake endo, strangers n ≥ 2 on b1–e3. Track sinks (h2 255–265 m, h3 505 m, x3 505–525 m) are the tracks owner's; human learnability is `mission.md` §1 |
| **Rider on Glass** | `project/archive/RIDER_ON_GLASS.md` (closed 2026-09-16, `f00724e`) | the rider and bike are the hero; the game is proven on a phone | **done — archived**: G 100 %; H closed on the user's decision once the whole Astra branch was on `main` (hero, assets, garage/outfits, perf layer, physics R9) | 100 | hero remainder is Astra's `HERO_OPEN_WORK.md` |
| **Perf (60 on high, on a phone)** | `project/archive/PERF.md` (closed 2026-09-15, `831e9c4`) · live backlog `docs/plans/PERF-BACKLOG.md` | bench + 100× plan, then a cut loop; phone-high tier + 60-cap governor | **done — archived**: phone-high tier live, 60-cap governor live, bench + WebKit gate + ship-gate G11, ledger through cut #4b (b1 phone-high 205 → 123 calls, 6.57 → 1.59 Mpx; model 35 → 8.8 ms on the user's phone) | 100 | the backlog's next cut (#4 remainder, 123 → ≤ 100) whenever a perf owner is spawned |
| **P0 task** | `project/archive/touch-navigation-invariant.md` | nothing tappable unless drawn | closed — landed `18df821`, confirmed by the user's phone sessions | 100 | — |

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
| 09-15 | Physics-library plan must retain **two supported engines in one game**: Custom v2 and the chosen library, selectable directly on the main menu outside levels. Exit to menu, switch and replay the same level/bike to compare feel. No retirement of Custom v2 under this plan. |
| 09-14 | Main menu → **B Broadcast** (`assets/design/menu/B-broadcast.jpg`, SPEC in `assets/design/menu/SPEC.md`) — core-game builds it |
| 09-14 | Plans live in `docs/plans/`; completed/stale docs go to `project/archive/` |
| 09-15 | **The user runs no more benchmarks**; mobile is capped at 60 with a governor Auto that climbs to high; the machine self-measures (WebKit, simulator, bench) |
| 09-15 | Hero/graphics → Codex Astra 6 on `blender-work`; `main` keeps physics/tracks/harness/core/perf; merge rules in `project/archive/blender-branch-merge.md` |
| 09-15 | Touch controls → **G strip with keys** (`assets/design/controls/G-strip-keys.png`, SPEC § Round 2); colours: GAS green, BRAKE red, **the two LEAN keys equal weight in one shared neutral scheme** (neither primary nor secondary) |
| 09-15 | Loading screen → **B Odometer**, but keeping **two bars with two percentages** (DOWNLOAD / SETUP as parallel tracks) and **two detail lines**, one per track; both numbers monotone and ending at 100 by the loader invariant (`project/archive/loading-progress-invariant.md`) |
| 09-15 | **Level review is a top-level REVIEW button on the main menu** (next to PLAY / GARAGE / SETTINGS) that opens a review level picker → the review UI (free camera, six segments, comments, Copy review); `?review=<track>` survives only as a deep link for e2e. Core #10 builds it. |
| 09-14 | Phones are **not** pinned to low in Auto — a perf owner makes the tiers fast instead (60 on high is the goal) |

## Parallel branch — `blender-work` (Codex Astra 6, since 2026-09-15)

The user handed the hero (rider + bike look, AAA graphics) to a Codex agent in the worktree
`trials-gauntlet-blender`. Rules and the test-merge result are in `project/archive/blender-branch-merge.md`: the
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
| 09-15 | Astra's `blender-work` hero merged on main's terms (merge #3: main's physics/perf/menu, the branch's hero/assets/garage/outfits; 781/781, hero-webkit PASS, e2e 399/399); critic 0/6 → the `riderBody` export is the blocker | physics R7 | `bdba62d` |
| 09-14 | taps on invisible buttons navigate (results Menu under the gas thumb) | the `.live` invariant, 5184-tap grid | `18df821` |
