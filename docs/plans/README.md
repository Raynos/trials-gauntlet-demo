# What we are building — the plans and where each stands

**Standing goal: build every plan in this folder to completion and archive it. The 3-hour close-out contract is `project/archive/CLOSEOUT.md` (2026-09-15 16:30).** Completion = each plan's own done lines, judged by evidence (gate, strangers, blind critic, device report), never by the parent's feeling.

One page, kept current by the parent at every commit. The bars no plan can close (wowed vs the real game, PS4 picture, the hero as a person, desktop-high at 60 on a phone, sound as a recording, fun) live in `docs/mission.md`; plans carry their measurable proxies. Percentages are against each plan's own
"done" lines, not a feeling. Live build: https://trials-gauntlet-demo.vercel.app · pins v0.1.0 / v0.2.0 / v0.2.1 / **v0.2.2** (the garage build):
https://trials-gauntlet-v0-2-2.vercel.app · `RELEASES.md` has the ledger. **Every ask the user makes, with its status, is in [`docs/tasks/ASKS.md`](../tasks/ASKS.md).**

## Hero follow-up handoff

**Menu rescue:** main and in-level pause now expose Classic / Blender / Img2 experiment plus all five Blender outfits. Persistence, mobile controls and paused swapping passed the [headless integration check](../evidence/hero-img2-menu/README.md). One experimental rider is selectable; this does not close the garage art or riding-pose milestones. Game deployment remains with the main release owner.

The post-merge handoff `HERO_OPEN_WORK.md` was split on 2026-09-16 (archived): [RIDING_POSES.md](RIDING_POSES.md) (seated / forward / back / elbows / contacts — gameplay), `project/archive/CHROMIUM_METAL_SHADER_INIT.md` (the GL 1281 startup bug — closed as non-repro the same day) and [HERO_ART_INTEGRATION.md](HERO_ART_INTEGRATION.md) (Astra's R33/R34 delivery into the game — ours). The five-outfit merge does not close any of them.

## Garage production — Blender art finishing active, September 17

**Current scope and catalog:** Blender art/asset delivery only; Claude + Opus own integration. Round 33 is provisionally accepted: full saved-identity rider and bike, reconstructed garment, fuller hood, fitted hem, dark denim, preserved riding contacts and leaner lossless export. Final trims, footwear, reproducible exports and editable handoff are delivered for user review. [Art handoff](../../prototypes/hero-garage/art/ART_HANDOFF.md). Final user visual approval, close-up quality and actual iPhone 30 fps remain open. Latest allowance 6%, hard stop 2%; older allocation statements below are historical.

`prototypes/hero-garage/` contains the independent Three.js viewer and preserved head studies. **Latest user direction: breadth first.** Assemble the full mustard Street rider and full blue/white bike, deliver a real Three.js screenshot, then polish individual elements. Head/hair acceptance no longer blocks this assembly. Existing authored project GLBs and their seated/forward/back clips provide the initial whole-scene baseline. Final art, contacts, performance, variants, integration and actual iPhone validation remain open. Hunyuan is an isolated rejected experiment; TRELLIS is paused.

Round 17 verifies the complete rider and bike from a dedicated 20.19 MB runtime package (previous build 230.36 MB, including paused studies). Recorded WebKit full-scene orbit and landing animation render without errors; deterministic canvas replay matches. [Screenshot](../../prototypes/hero-garage/captures/whole-package-round17/webkit-full.png) · [recording](../../prototypes/hero-garage/captures/whole-package-round17/webkit-orbit-relight.webm). **Hair/beard refinement remains paused.** Whole-body proportions, clothing, contacts and bike motion precede detail polish. Art approval and actual iPhone performance remain open. Latest allowance: 23% remaining, 20% floor.

Round 18 adds coordinated 25 mm fork/swingarm/shock motion during compression and landing. Both tyres stay fixed and existing rider grip/sole offsets are preserved; chain and brake hose follow their endpoints. The actual-GLB sweep, 750-frame browser sweep, recorded orbit and frozen game ship gate pass their scoped checks. [Motion evidence](../../prototypes/hero-garage/captures/whole-suspension-round18/webkit-orbit-relight.webm). This is authored garage kinematics, not game physics integration or final motion/art approval. Hair/beard remain paused.

Round 19 derives the [rig/socket contract](../../prototypes/hero-garage/art/rig-contract/README.md) from the actual exports: 19 bones, 26 sockets, six clips and all 750 frames, including raw-to-Three.js name mapping. Contact-offset drift stays below 2.3 micrometres; the existing 11 mm sole/peg offset is documented, not called a surface-contact pass. A better clothing-source investigation reached an HTTP 403 on the official anonymous asset query; no replacement was downloaded or adopted.

Round 20 adopts verified mobile KTX2/UASTC exports: all-image 4x4-block estimate **8.69 MiB**, down from 34.76 MiB RGBA8; download grows 6.41 → 7.44 MB. WebKit actually transcodes to ASTC 4x4, normal mobile selection loads the compressed assets, and matched full-scene review shows no obvious regression. Geometry and all motion buffers are unchanged. [Review](../../prototypes/hero-garage/reports/ktx-round20-review.json); actual iPhone and final art remain open.

**Round 21 / latest user correction:** attach the saved curly hair and beard to the complete rider now. That assembly is active and [rendered in Three.js](../../prototypes/hero-garage/captures/full-rider-saved-identity-a1/webkit-full.png), including the saved face. Source groom identity matches the earlier portrait. The 173 MB local appearance GLB follows the existing head joint; neck/collar fit and mobile optimization remain open. The earlier mobile-memory ledger does not describe this dense preview. Hunyuan produced rejected raw geometry; TRELLIS never demonstrated inference; neither has a running process.

Round 22 rejected a lower-neck taper after rendered comparison showed no convincing seam improvement. The prior saved-face/curls/beard assembly is restored byte-for-byte; [review](../../prototypes/hero-garage/reports/identity-neck-fit-review.json). Next fit work must isolate residual old-neck geometry rather than keep guessing broad shape changes.

Round 23 isolates the neck defect with a [false-color component diagnostic](../../prototypes/hero-garage/reports/neck-component-round23-review.json): the new portrait turns green, but pale rear-neck patches remain. Targeted old-body neck cleanup is next; the saved identity and normal preview remain unchanged.

Round 24 removes the 347 identified old-neck triangles: pale overlays disappear while saved face/curls/beard and all six clip payloads remain unchanged. [Review](../../prototypes/hero-garage/reports/neck-cleanup-round24-review.json). Ragged collar shape/UVs remain. Fresh frozen game ship gate passes cold boot, exact replay, clear, crash and one-tick restart.

Round 25 repairs 584 collapsed collar UV triangles; dark texture streaks improve, while geometry, skinning and saved identity remain unchanged. [Review](../../prototypes/hero-garage/reports/collar-uv-round25-review.json). Active catalog now uses the reproducible collar-UV derivative. Ragged collar shape and final continuous unwrap remain open.

Round 26 begins the approved art-only finishing push (hard2% reserve; flexible passes; Claude + Opus own integration). Blue fender/satin engine materials are adopted after recorded review and mechanical checks. Two collar transition candidates failed visual review; the active rider is preserved and next work changes method to joined hoodie reconstruction. [Art handoff](../../prototypes/hero-garage/art/ART_HANDOFF.md). Usage service currently returns `Transport closed`, so extended work awaits restored budget monitoring.

The user authorized provisional overnight visual decisions, free personal/noncommercial licensed assets, a **30 fps mobile garage** and a **2% weekly allowance floor**. The earlier hourly automation remains paused; this goal is actively progressing through whole-scene work. Latest checked allowance is 21% remaining. Final visual approval stays with the user. Better body/clothing sources are being assessed without changing target01 identity. No spending/contact/publishing occurred. Existing concurrent gameplay/physics changes are preserved.

## Independent audit — 2026-09-15

The [game audit](../reviews/game-audit-2026-09-15.md) and separate [physics-library review](../reviews/physics-library-audit-2026-09-15.md) describe the earlier `56e3883` working tree (`a6d63cfd`). **Their defect list is historical:** the loader replacement bug is fixed, Auto now caps at 60, and the original finish/fault and reflex regressions pass the latest targeted check. The user's real-device report measured 59.5 fps on low; it does not establish current-build high at 60. The v0.2.0 release and later hero work supersede the original visual/audio counts; see `RELEASES.md` and the dated critic records.

**Latest status check:** HEAD `5b56431` plus in-flight R8 changes, fingerprint `089e0885`. The matching on-disk quick gate is 27/30 (three SwiftShader timing failures; determinism passes, logical restart one tick). Fresh targeted tests give 15/16: the R6 hop-force assertion fails at 1398.931 > 1280; no fresh full-suite pass is claimed. Physics changes, goldens and gate evidence remain uncommitted. The game still uses custom v2; no physics library is installed. The user-requested migration plan now lives in [USE_A_REAL_PHYSICS_LIBRARY.md](USE_A_REAL_PHYSICS_LIBRARY.md): Rapier 2D first, Planck comparison/fallback, implementation not started. AI strangers remain solvability evidence distinct from human learnability; archived plan percentages do not close the mission bars.

| plan | file | goal | status | % | next gate |
|---|---|---|---|---|---|
| **The brief** | `README.md` | a 2.5D Trials-quality bike game, deterministic, 60 fps, desktop + iOS Safari | in build | — | — |
| **Use a real physics library** | [USE_A_REAL_PHYSICS_LIBRARY.md](USE_A_REAL_PHYSICS_LIBRARY.md) | Ship **Custom v2 + a library engine** in the same game, toggled on the main menu so the player can exit, switch and compare the same level/bike | **planned; not started** — Rapier 2D first candidate, Planck comparison/fallback; retain both engines after release, persist selection and separate engine records; no package/adapter landed | 0 | P0: coordinate in-flight R8 work and freeze a reproducible control; P1: 3-5 day qualification; P2: main-menu selector and both playable engines |
| **Hero garage Blender art** | `project/archive/HERO_GARAGE_PRODUCTION.md` (closed 2026-09-17, ask 43) | Complete coherent target01 rider/bike and deliver editable art | **done — archived**: R33 rider + R34 five outfits / two liveries delivered and integrated; delivery + masters in `assets/blender/hero-art/`, handoff in `docs/evidence/hero-art/delivery/`; the prototype is retired; the user's visual verdict, licence clearance and iPhone check are HR-09 | 100 | remaining art (collar/panel tailoring, likeness, Race helmet) only on the user's fix list |
| **World map level select** | [WORLD_MAP.md](WORLD_MAP.md) | the A "Rebirth" painted continent as the level select — pan / zoom over one continuous terrain, markers with leader-line plates, the route as a lit road, fog over locked regions, drifting cloud shadows; the diorama retired | **live** — R1–R3 shipped `125e490` (plates, camera, markers, roads, gate, fog, card, mockup-framed opening; diorama deleted); open: iPhone pinch frame time (HR), the Canyon just above the phone's opening frame | 85 | plan doc + terrain plates first; played evidence at every round |
| **Riding poses** | [RIDING_POSES.md](RIDING_POSES.md) | seated neutral, forward, back, natural elbows, explicit contact release, runtime cloth — in played clips | **open** — R9 put the seated pose live as `riderBody.drawn` (drawn / physical split); forward, back, elbows, release and cloth open; owner: physics + hero render | 20 | drawn-vs-physical CoM/reach measurement per pose, then the retune |
| **Chromium/Metal shader init** | `project/archive/CHROMIUM_METAL_SHADER_INIT.md` (closed 2026-09-16) | zero GL errors on a Chromium/Metal cold boot → clear → crash → restart | **done — non-repro, archived**: 18/18 unmodified Metal gate runs clean, including the exact 09-15 failing build and the commit before r15; not a code defect — machine state on the 09-15 evening. residual cold-cache test declined by the user, recipe in the evidence | 100 | [evidence](../evidence/chromium-metal/README.md) |
| **Hero art integration** | [HERO_ART_INTEGRATION.md](HERO_ART_INTEGRATION.md) | the R33 catalog rider + bike, five outfits, two liveries in the garage and in-level within the phone-high rows; garage 30 fps on the user's iPhone | **built (ask 43, rounds 1–4: `3af533e` `9b09013` `4f27f47` `45f2e71` + retirement)** — Astra family is the only hero family, legacy files gone, boot on the first-drawn pair, ship gate PASS both engines; b1 phone-high 142 calls / 85 k tris / 9.2 ms (bar 123 / 8.8 was already 128 / 9.2 before); **pinned v0.3.0** https://trials-gauntlet-v0-3-0.vercel.app (`f2ea1c8`) on the user's licence call + hair keep; the iPhone 30 fps reading is HR-10 | 100 | HR-10 → device report in `docs/device/` |
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
| 09-16 | **Garage: the Classic and Img2 rider models are out** (the Blender rider is the rider; `?rider=` stays a harness override) and **the garage is pointer + Esc only** (no key rows) — asks 30–32 |
| 09-16 | Design rounds open for the user to pick: **home screen** `assets/design/menu/round2/` (A–E) → three B Lobby variants in `round3/` (B1 Plate / B2 Strip / B3 Glass, ask 39); **continuous world-map level select** `assets/design/tracks/round4/` (A ribbon / B chart / C ascent) |
| 09-16 | **Level select → C Ascent** (`assets/design/tracks/round4/C-ascent.jpg`, SPEC § C): one continuous world map, **pan / drag / zoom**, a subset of levels in the viewport, opens centred on the current level — ask 38 |
| 09-16 | World map route in **biome order** (M1 on the Industrial terrace; the tier is on the pin code and the altimeter) — no doubling-back road |
| 09-16 | **Touch / mouse only for now — no gamepad support needed** (the garage's key rows stay out) |
| 09-16 | Garage stats sheet changes **only on click** (no hover preview) — ask 40 |
| 09-16 | **img2 rider code is deleted outright** (not just the chip) — ask 41 |
| 09-16 | **Main menu → B2 Strip** (`assets/design/menu/round3/B2-strip.jpg`, SPEC § B2): wide Nalati-jump strip under a big wordmark, four huge tiles (PLAY widest, amber), nothing about progress on the title menu — ask 42 |
| 09-17 | **Hero art licence (HR-09): ship as is on the CC-BY reading** — the beard pack's README is taken as authoritative over the AGPL headers in its files, the Bystedt curls are CC BY-SA; both attributed in CREDITS. The hair keep / redo and the phone 30 fps check stay on HR-09 |
| 09-17 | World map art pass (ask 44) — go; fps meter hidden on the main menu; badge plate → stamp only (ask 45) |
| 09-17 | **The round-4/5 world map is rejected** ("dioramas linked on one page") — a **from-scratch world map** in the language of FF VII Rebirth / FF XV / FF XVI / Black Desert Online; three codex mockups first (ask 53), the user picks, then it is built new, not refactored from the tiles |
| 09-17 | **Level select → A "Rebirth"** (`assets/design/worldmap/A-painted-world.png`): "literally that" — a new `WorldMapScreen` built from scratch, the diorama retired — ask 54, plan `docs/plans/WORLD_MAP.md` |

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
| 09-16 | garage flashes grey on every card hover / rookie↔pro swap | a menu-phase `setBike` swaps livery only; the physics row reloads on the next arm; e2e G4 asserts 0 `setTrack` per swap | ask 29 |
| 09-17 | (live `b0985ee`) garage click-only sheet · reverse gear (R10) · img2 gone · B2 main menu · C Ascent world map — gate 27/30 on the clean export (the three SwiftShader rows) | one deploy | `2d98a48` `dc450e0` `45f4afd` `b715d2e` `b0985ee` |
| 09-17 | (live `cb9ab93`, on v0.3.0) the painted C Ascent mountain (ask 44) · fps meter off the title menu, stamp-only badge (ask 45) — gate 27/30 on the clean export (the three SwiftShader rows) | one deploy, `--archive=tgz` | `6cb3cd4` `d062aa6` |
| 09-17 | (live `a32d7e0`) **the painted world map is the level select** (ask 54 R1+R2, `ddad17f`) + the sibling's one-frame garage swaps — gate 26/30 on the clean export: the three SwiftShader rows + `boot.readyP50Ms` 608 ms (ask 57, to re-measure) | `--archive=tgz` | `ddad17f` `a32d7e0` |
| 09-17 | (live `125e490`) world map R3 — opens framing the region like the mockup, road on the switchbacks, smaller plates; gate 27/30 (the three SwiftShader rows; the 608 ms boot read was noise) | `--archive=tgz` | `125e490` |

## Art round 27 — source garment repair and bike connections

Provisional parent acceptance: the original continuous sweatshirt now has a reconstructed neckline without the doubled-back lip, and a fitted two-panel hood. Saved face, curls, beard and all six clips are unchanged. Bike triple clamps and number-board mounts are corrected. The hoodie clears its body surface across 54 sampled poses (minimum 1.42 mm); this does not prove all cloth intersections absent. [Review](../../prototypes/hero-garage/reports/art-round27-review.json) and [recorded six-clip review](../../prototypes/hero-garage/captures/art-round27-adopted/six-clips.webm).

Footwear and denim candidates are held after close-up and saddle-surface checks exposed defects; prior shoes and jeans remain active. Frozen game ship gate passes, without game integration changes. The openusage CLI restores fresh usage monitoring: 17% remaining on September 17 UTC; hard floor remains 2%. Work continues on garment construction, gloves, shoes, jeans and delivery. Final art approval remains with the user.

## Art round 28 — continuous cloth, fitted accessories and reproducible delivery

Provisionally accepted: continuous hoodie UVs and thickness, fitted neckline without the exposed bust flange, cuff3 gloves, corrected shoe panels, dedicated denim textures, satin bike structure and smoother control tubes. Saved face, curls and beard remain. All six clips were recorded in48 full/detail views under neutral and garage lights; parent inspected sequential frames and closeups. Elbow pinching remains conspicuous and is the next repair; noisy bike paint also remains open.

The15-step Blender rebuild produced the exact same raw rider SHA as the reviewed assembly. Lossless meshopt packing reduces186.9MB to61.5MB, with decoded bytes exact and12 matched Three.js PNGs byte identical. This reduces transfer size, not triangle count or proven mobile cost. The catalog selects the packed rider and bike-finish candidate. [Review](../../prototypes/hero-garage/reports/art-round28-review.json). Usage14% remaining;2% hard stop. Final visual approval remains with the user.

## Art round 29 — sleeve continuity and cleaner bike paint

Accepted provisionally after six-clip motion review:331 localized sleeve controls preserve elbow volume (minimum sampled section8.575→22.488mm), with cuff/neck controls and weights retained. Blue/white bike panels now use cleaner plastic shading with original decals; geometry and mechanical checks remain unchanged. Packed rider66.1MB;12 matched renders remain byte identical to raw. Blender master import now explicitly decodes the authoritative packed catalog, preserving six action durations. [Review](../../prototypes/hero-garage/reports/art-round29-review.json). Cloth surface and glove finish remain in progress;13% usage remains, hard stop2%.

## Art round 30 — cotton, glove profile and target colors

Provisionally accepted after recorded full/detail review: subdued cotton surface, slimmer dorsal gloves with all580contact points preserved, darkindigo jeans with unchanged geometry, and a smoother frontfender arc with exactendpoints. Sixclips/twolights reviewed; packed-vs-raw renders match exactly. Frozen game shipgate passes1038 identicalticks,8.65sclear and1tickrestart. [Review](../../prototypes/hero-garage/reports/art-round30-review.json).

Rebuild investigation found nondeterministic cuff ring ordering causing small UV/bake differences; stableordering is implemented, repeatverification remains open. Current catalog remains the reviewed export. Further work: hood/folds, shoe/exhaust colors and a bounded seatedposture study.11% allowance remains; hardstop2%. Finalvisual approval and actualiPhone gate remainopen.

## Art round 31 — fuller hood and settled riding posture

Provisionally accepted from48 timed full/detail views across6clips and2lights: fuller foldedhood, broad sleevefolds, neutralgrey footwear, warmsteel exhaust, and10degree forwardsettled seatedpose. Allsixclips share easedneutral entry/exit while originaltargetphases remain. Actual750frame audit holds grip/sole displacement below2.07micrometres;54pose newfamilycloth audit finds0hood/shirt orcord crossings. [Review](../../prototypes/hero-garage/reports/art-round31-review.json).

Two fullstage34rebuilds now produce byte-identical rawandpacked GLBs afterdeterministic cuffordering fix. Stage36 completepipeline includesgarment andclipfamily andhas run successfully. The reviewed catalog remains separatelyhashed. Rearhemflare is underboundedcorrection; finalsourcebundle/phonevalidation remainopen.10%allowance remains; hardstop2%.


## Art round32 — fitted hem and leaner delivery, September17UTC

The posterior hoodie hem now follows the jeans instead of flaring outward. Across54sampled poses the repaired posterior region has no denim crossings and at least3.637mm clearance; existing hidden waist overlaps are not called fixed. The canonical stage37 export is provisionally accepted from48 timed Three.js views across all6clips and2lights. Removing obsolete assembly resources and losslessly packing retains byte-identical canvas output in12/12 comparisons. [Review](../../prototypes/hero-garage/reports/art-round32-review.json). Final user approval, close-up art quality and actual iPhone validation remain open. Latest usage9%; hard stop2%. Integration remains Claude + Opus owned.


## Art round 33 — provisional delivery, September 17 UTC

The complete rider and bike are delivered for final user visual review. This round adds continuous cuff trim, visible fitted laces, quieter denim normals and a targeted repair of15 inner sleeve-shell spikes (worst148 mm → 2 mm). It preserves the saved face/curls/beard, outer garment controls, UVs, skin weights and riding contacts. Parent review used decoded sequential frames from48 timed views across all six clips/two lights, plus recorded neutral-to-action transitions; it is not claimed as human continuous playback. [Review](../../prototypes/hero-garage/reports/art-round33-review.json).

Two full stage 41 builds produce the same60.16 MB packed rider; two full bike builds match the reviewed5.68 MB GLB exactly. All 12 raw/packed renderer comparisons pass. The reopened editable master retains all six actions, 19 bones and 39 packed images. Rig/socket verification spans 750 frames; the frozen game gate passes 1,038 identical ticks, 8.65 s clear and one-tick restart. [Handoff and remaining work](../../prototypes/hero-garage/art/ART_HANDOFF.md).

**Still open:** final user visual approval, more natural shoulder/elbow folds and glove anatomy, residual hidden waist/contact refinements, and actual iPhone 30 fps/memory validation. This is a materially improved stylized art delivery, not an AAA-completion claim. No game integration, spending or public deployment. Latest checked allowance 6%; the 2% floor was preserved.

Final runtime qualification: the 30-second desktop WebKit mobile proxy has no rendering errors and deterministic canvas replay, but 18 ms p95 does not meet the separate 16.7 ms desktop wall-clock gate. It is not an actual iPhone 30 fps pass. See `prototypes/hero-garage/reports/delivery-mobile-proxy.json`.

### Hero art R34 — five outfit variants (in progress)

User expanded scope to all five existing outfits and five bike skins. Street, open-face and Race art passes run in parallel; only two bike liveries exist in the current source, so the other three await design identification. Variant delivery remains separate from game integration and the target01 master. Usage 6%; hard stop 2%.

### R34 provisional variant delivery

All five existing outfit IDs now have art exports: accepted mustard; charcoal Street; genuine open-face Street; blue/white Race; charcoal/yellow Race. Race receives continuous upper shoulder colour, a subdivided jersey and a low collar fitted to the actual race neck after rejecting the first raised collar. Original helmet, technical pants and articulated boots remain. Both canonical bike liveries inherit accepted mechanical detail; Pro front/side plates now show red1. Three additional requested bike skins were not found in source and await user identification.

Parent reviewed decoded sequential frames from84 timed variant views across six clips/two lights, plus detail stills. Four new rider rig audits each cover750frames; race checks cover54poses; four editable masters reopen with all six actions and packed images. [Variant handoff](../../prototypes/hero-garage/art/variants/README.md) and [review](../../prototypes/hero-garage/reports/art-round34-review.json). This is provisional art delivery, not AAA completion; race collar/panels, Street garment/anatomy refinement, user approval and physical iPhone validation remain. Game integration is unchanged. Latest allowance4%, hard stop2%.

### R35 — helmet remaster; allowance stop

Open-face helmet remastered with compact crown, recessed vents, thin level peak, rolled rim and joined chin webbing/buckle. Saved face/beard/body and six clips remain. Parent reviewed24 recorded full/face views over6clips and2lights; rest head collision test reports0crossings; rig/master checks pass. Variant handoff selects the remaster. Race R35 trim/material studies are preserved but not promoted: initial masks were too soft and final tightening was not accepted before the floor. R34 Race remains selected. Usage reached2%; sustained work stopped. Final visual approval, Race helmet/tailoring, additional bike designs and iPhone validation remain open. [Review](../../prototypes/hero-garage/reports/art-round35-review.json).

### Opus integration handoff

Art wrap-up: [exact selections, commits, contracts and remaining gates](../../prototypes/hero-garage/art/variants/OPUS_HANDOFF.md). Art already lives on shared main; no branch merge needed. Unaccepted R35 Race tracked edits archived locally and restored to committed recipes. Other workers’ game/UI/physics changes preserved. Sustained art remains stopped at2%.
