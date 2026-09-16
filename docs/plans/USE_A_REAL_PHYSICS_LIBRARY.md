# Use a real physics library

**Status: planned; implementation not started.** Requested by the user on 2026-09-15 to preserve the library-review recommendation as executable project work. Parent owns this plan and its row in [README.md](README.md).

## Goal and decision

Ship **two supported physics engines in the same game: Custom v2 and one established physics-library implementation**, selectable directly on the main menu outside levels. The player can ride, exit to the main menu, switch engines and replay the same level to compare gameplay feel. Keep the Trials-specific rider control, engine/tyre tuning, fault rules and game experience under project control.

**First candidate: Rapier 2D. Fallback comparison: Planck.js.** The game renders in Three.js but simulates motion in a plane; changing the renderer or adopting 3D physics is not required. These are provisional candidates, not a completed engine selection. Pin the exact package/version and verify its license when implementation starts.

The intent is to add a library-backed implementation alongside Custom v2. **Custom v2 remains a supported player choice after release; it is not a temporary rollback path scheduled for removal.** Qualification prevents exposing an engine that breaks replay or makes the bike worse. If neither library candidate qualifies, record the blockers and revise the candidate/architecture decision; do not call this plan complete merely because the custom solver still runs or because thresholds were relaxed.

Sources: [original library review](../reviews/physics-library-audit-2026-09-15.md), [PDF](../reviews/physics-library-audit-2026-09-15.pdf), [original game audit](../reviews/game-audit-2026-09-15.md), [mission](../mission.md). The original audit is historical, not a description of every current defect.

## Player flow: compare engines from the main menu

- A visible **Physics** selector on the main menu has two choices: **Custom v2** and the selected library's actual name, for example **Rapier 2D**. Both are first-class gameplay choices. No URL parameter, developer screen or entry into a level is required to switch.
- Custom v2 is the initial default. Remember the player's successful selection across levels and reloads; do not automatically change it when the library ships or when a replay is viewed.
- The comparison loop is **play a level -> exit to main menu -> select the other engine -> play the same level again**. Preserve the selected track, bike class, controls and graphics settings so switching does not require setting up the comparison again. Unlocked track access is shared across engines, so the player need not re-earn access to compare a course.
- Engine switching is available only on the main menu. It does not hot-swap a running, paused or replaying level. Leaving a level ends that attempt; the next attempt starts clean at the level start, not at an old checkpoint or from another engine's snapshot. Normal in-level retries keep their engine and existing checkpoint rules.
- Show the selected engine clearly on the menu and identify the actual engine on results/replay records. Keep times, medals, leaderboards, ghosts and personal bests separated by engine and bike class; preserve existing Custom v2 records. Shared unlock access does not make the engines' scores comparable.
- Prepare a newly selected library while still on the menu, with an honest loading/error state and Play unavailable until it is ready. Commit the active/persisted selection only after successful initialization. On failure, retain the previous ready engine and report the failure; never silently run Custom v2 under the library label. Repeated toggles must not leave duplicate simulations or leaked worlds.
- The selector works with desktop keyboard/pointer and iOS touch, including visible selection/focus and touch targets at least 44 CSS pixels. It stays outside levels and does not overlap the existing Play/Garage/Review/Settings controls.

**Product acceptance:** a player can complete this loop in both directions on the same unlocked level and bike, without a page reload, progress loss or mixed-engine scores. Selecting between the two engines remains supported after this plan closes.

## Current starting point

Inspected at HEAD `5b56431` plus existing uncommitted work; physics/track fingerprint `089e0885`. This is a status snapshot, not the baseline to freeze automatically:

- `package.json` still declares only `three` as a runtime dependency. No physics library or adapter has landed.
- `src/physics/index.ts` still selects the custom v2 implementation. R7 is committed; R8 physics changes and refreshed evidence are in flight. Coordinate with that owner before freezing a baseline or changing shared types.
- The original loader replacement bug is fixed. The phone Auto cap is now 60, with an adaptive quality governor. Existing device evidence proves 59.5 fps on low for one 20-second B1 run, not sustained high-quality performance on the current build.
- Latest on-disk quick ship gate: 27/30, fingerprint `089e0885`; determinism passes and logical restart takes one tick. Three SwiftShader timing checks fail. This is uncommitted, limited-duration evidence, not a complete release pass.
- A fresh targeted run of `harness/reflex/reflex.test.ts` and `src/physics/v2/r6.test.ts` gives 15 passes and one failure: the R6 hop-force assertion measures 1398.931 against a maximum of 1280. The reflex suite and original finish/fault regression pass. No full-suite pass is claimed here.
- The newer R8 clearance table records 24/24 Rookie and 22/24 Pro goldens; X1/X3 Pro remain stale/unproven. Resolve contradictory older 48/48 prose before using these as a baseline.

Archived plan completion does not close the mission's human-control or Trials-quality bars. A new library supplies physical infrastructure; it does not automatically supply a good Trials bike, better artwork, audio or fast rendering.

## Non-negotiable contracts

1. Fixed physics step, initially the existing 120 Hz. Quantize inputs before simulation; wall time and rendering must not change a recorded trajectory.
2. A recording reproduces byte-identical finish time and canonical state within its pinned engine version/configuration across supported runtimes. Different engines are not expected to produce identical trajectories.
3. Snapshot -> explore alternative inputs -> restore -> replay reproduces a straight run, including contact caches, rider controller, wheel spin, RNG, latches, moving obstacles, crash and game-rule state. Restore into a fresh world must work too.
4. Preserve separately simulated rider/bike mass, controllable weight transfer, suspension compression/rebound, circular-wheel contacts, angle-sensitive landings and recoverable failures. Document intentional assists; do not remove them merely to claim physical purity.
5. Keep the `PhysicsWorld` boundary where practical: `loadTrack`, `reset`, `step`, `getState`, `drainEvents`, `snapshot`, `restore`. Preserve the state consumed by the hero renderer, especially `riderBody`, wheel/suspension poses, contact state and events.
6. Preserve one-tick manual restart with no countdown. Benchmark visible control latency as well as simulation reset.
7. Respect desktop and mobile iOS Safari constraints. Use headless harnesses on this machine. WebKit/simulator results are useful compatibility evidence, not proof of actual phone GPU/thermal performance.
8. Judge movement with played clips and attempts-to-clear, never posed stills. Keep bot, AI-stranger and unfamiliar-human results separate.
9. Keep Custom v2 and the selected library independently runnable in the same production game. Each run owns exactly one engine identity; menu switching, retries, ghost playback and persistent scores must preserve that identity.

## Phases and acceptance

### P0 - Establish a trustworthy control

- [ ] Agree with the active physics owner on a stable baseline revision and complete source/tuning/track fingerprint. Preserve in-flight work; one checkout, no worktrees.
- [ ] Resolve or explicitly reproduce outstanding regressions, including the current hop-force failure and two stale Pro goldens. Distinguish a baseline limitation from a regression introduced by the adapter.
- [ ] Save existing engine/version, tuning, inputs and reference results. Freeze manoeuvre scenes and the initial curriculum subset before comparing engines.
- [ ] Record baseline physics p50/p95, snapshot/restore time and allocations, restart latency, production bytes/startup, memory, clearance attempts and motion clips. Use the same runtime/quality/geometry for comparisons.
- [ ] Before candidate tuning, freeze numerical decision bounds for snapshot throughput, total startup transfer including WASM, and handling/non-regression criteria alongside the existing gate thresholds. Specify both absolute budgets and allowed changes from the control; do not choose the bounds after seeing a preferred candidate's result.

**Exit:** a dated control report with reproducible inputs and honest PASS/FAIL/UNMEASURED rows. Do not quietly repin expected values to turn failures green.

### P1 - Qualify Rapier 2D and compare Planck

Suggested time box: **3-5 working days for qualification**, not for the entire migration. Review scope after this phase rather than forecasting an unmeasured rewrite.

- [ ] Prototype Rapier 2D behind an explicit opt-in factory. Model chassis, actual circular wheels, suspension constraints and a separate rider body on a minimal flat/ramp/ledge track.
- [ ] Demonstrate a suspension body/joint arrangement that permits both wheel spin and travel along the suspension axis, with motor reaction torque and travel limits. A plain prismatic joint directly joining chassis and wheel does not provide both freedoms.
- [ ] Qualify one-way terrain behavior early: current collision handling uses previous-centre sidedness and open-polyline endpoints. Test pass-through direction, seams and endpoints with deterministic library contact filtering; preserving vertices alone is insufficient.
- [ ] Implement deterministic initialization and exact snapshot continuation before tuning many tracks. Test repeated branch/restore under the beam-search workload, not only a save/load demo.
- [ ] Measure packaged WASM/download/startup and reset behavior. Initialize async engine resources during boot; never fetch or await inside a physics tick or restart.
- [ ] Build a small Planck comparison around its motorized wheel/suspension joint. Its scene serializer is not presumed to preserve warm-start impulses or all hidden state. Prove full continuation or report a blocker.
- [ ] Check cross-runtime replay in Node, headless Chromium and WebKit with the pinned build and deterministic application-side initialization.
- [ ] Decide using contact/control behavior, snapshot fidelity, runtime/startup cost and maintenance burden. Write the choice and rejection reasons into this plan.

**Exit:** one selected library with proven integration fundamentals. If both fail a hard contract, stop broad tuning and resolve that failure or evaluate a clearly justified alternative. Jolt.js is a 3D contingency if real spatial physics becomes necessary, not another default parallel rewrite.

### P2 - Integrate the selected solver behind the game boundary

- [ ] Add a separate library adapter and a shared factory/selection boundary. Keep Custom v2 as a supported engine throughout implementation and after release. Do not replace the library's collision solving with custom code again inside its adapter.
- [ ] Implement the main-menu Physics selector and the player flow above, including persisted selection, retained track/bike, shared unlocked-track access, keyboard/touch support and loading/error states. Engine selection must construct a clean run rather than transplant state between solvers.
- [ ] Adapt compiled tracks: terrain/segments, ramps, boxes, poles, ledges, drums, seesaws, dynamic objects, hazards, checkpoints and finish sensors. Preserve surface properties, one-way contact/endpoint behavior and authored collision geometry unless a change is separately justified.
- [ ] Implement bike drive/braking, tyre interaction, rider targets and documented assistance on library bodies. Avoid applying duplicate friction or contradictory suspension/contact corrections.
- [ ] Preserve rider/render/ragdoll continuity and existing event semantics. Port the same-tick finish/fault regression and explicit precedence rule.
- [ ] Update bootstrap for an async library while retaining a synchronous tick interface and preinitialized instant restarts. Include production loader and failure-path tests.
- [ ] Version snapshot and recording contracts. Current `PhysicsSnapshot` is `{v:1,f64,u8}` and `PhysicsVersion` is only `v1 | v2`; extend these explicitly. Include engine build, controller/tuning version and track identity in compatibility checks and evidence stamps.
- [ ] Update node simulation, browser replay, snapshot probing, golden selection and fingerprints together. Include adapter and controller changes in provenance.
- [ ] Namespace times, medals, leaderboards, PBs/ghosts and expected hashes by compatible physics version and bike class. Migrate existing unnamespaced records to Custom v2 without data loss. Replay each supported recording on its recorded engine without changing the saved menu preference; clearly reject incompatible versions instead of using the currently selected engine.

**Exit:** both full-game engines are selectable from the main menu with clear/crash/restart/replay, intact visual-state contracts and isolated records. Custom v2 remains the initial default; the player's selection determines subsequent runs.

### P3 - Prove the bike and curriculum

Use the same scenarios and reference manoeuvres for the control and candidate. Document per-engine tuning and give both comparable tuning effort.

| Scenario | Required observation |
|---|---|
| Flat launch, braking and deliberate loop | Inputs produce consistent acceleration, stopping and controllable pitch; test both bike classes |
| Sustained wheelie | Uninterrupted hold, balance losses and recovery at stated target angle, speed and human-rate input/latency; exact asserted bands, no masked failures |
| Angled landing and recovery | Successful and failed techniques, rebound/settle time, rider reaction and clear failure boundary |
| Steep plank and vertical ledge | Traction, wheel-edge contact and launch behavior without tunneling or unexplained impulses |
| Drums and seesaws | Circular/dynamic contacts remain stable and repeatable through load transfer |
| Bunny-hop and repeated landing | Rider-driven takeoff, no unintended hop from coasting, controlled recovery |
| Crash/finish/restart | Correct scoring precedence, ragdoll continuity, no residual state after reset |

- [ ] Exercise one-input-quantum variations near survive-versus-crash boundaries. Count faults rather than excluding those branches from stability reporting.
- [ ] Run bot sweeps across all 15 curriculum tracks and the five playgrounds, both Rookie and Pro. Re-prove recordings in the browser; record every DNF and blocker.
- [ ] Run fresh AI strangers on the fingerprinted candidate. Report minimum sample size, bike, all starts, completions and abandonments; completion-only medians are insufficient.
- [ ] Obtain unfamiliar-human play evidence through actual desktop/touch controls when available. Do not label AI macros as human testing. Report absence as UNMEASURED; do not ask the current user to repeat benchmarks or operate the harness.
- [ ] Compare clips of the same manoeuvres against the control and Trials references. Record suspension/rider/camera observations separately so a render change is not misattributed to the solver.
- [ ] Validate the actual player comparison loop, not just harness factory selection: ride Custom v2, exit to menu, switch to the library, ride the same track/bike, then switch back. Record subjective feel separately from clearance times and bot scores.

**Exit:** techniques are demonstrably learnable, curriculum clearance/difficulty has measured evidence, and the selected solver does not introduce unexplained instability. If track geometry changes are necessary, review them independently rather than weakening every obstacle until a bot clears it.

### P4 - Performance and release gate

Use [gate thresholds](../../harness/gate/thresholds.json) as the single source of truth. Current budgets include physics p95 <=60 microseconds/tick (<=80 ragdoll), JS gzip <=600 KB, heap growth <=5 MB/60 s, manual restart one tick, restart call p95 <=5 ms and restart frame p95 <=33 ms on target hardware. WASM bytes must be counted separately and in total startup transfer, not hidden by a JS-only budget.

- [ ] Run fresh production cold boot, clear a track, crash and instant restart; every third implementation round must run this ship gate.
- [ ] Repeat determinism and snapshot gates on the production build, including class switches, fresh loads, post-finish input, contacts and repeated resets.
- [ ] Measure snapshot throughput under the actual bot search budget. Bound allocation/memory over repeated resets and world disposal; no WASM-world leaks.
- [ ] Measure WASM linear-memory size/high-water mark and live world resources separately from JS heap. Repeated world/snapshot disposal must reach a stable plateau after warm-up; a freed WASM allocation need not shrink the linear-memory buffer. The JS heap gate alone cannot prove this.
- [ ] Run full-duration memory and frame-pacing checks at representative desktop and phone geometries, plus WebKit and available iOS simulator checks. Keep SwiftShader timing/proxy values labeled.
- [ ] Carry forward real-phone evidence with its exact build/quality/duration. Do not infer sustained current-build iPhone-high 60 fps from the old low-quality report or macOS WebKit. Automation owns machine-executable checks; no new user benchmark chore is part of this plan.
- [ ] Confirm existing art/audio/controls and hero state remain compatible, including context restoration and background/resume behavior.
- [ ] Run headless end-to-end checks for menu switching in both directions, rapid repeated selection, first-use loading/failure, selection persistence across reload, retained track/bike, isolated results and recorded-engine replay. Check that no engine selector can act during riding, pause or replay.
- [ ] Run cold-boot/clear/crash/restart and determinism gates for **both engines**, including after alternating menu selections. Verify that repeated switching releases inactive worlds and has bounded JS/WASM memory. Preserve the selected engine on an ordinary retry.

**Exit:** required gates pass; hardware limitations and any still-unmeasured human/device mission bars are explicitly recorded. No overall PASS manufactured from informational rows or a short quick-gate run.

### P5 - Release both engines and close

- [ ] Ship the main-menu selector with both Custom v2 and the qualified library available. Preserve Custom v2 as the initial default and honor the player's saved choice; a future change of default is a separate product decision.
- [ ] Keep both engine implementations, their regression suites and their replay routes supported. Document per-engine versions, comparison results, persistence behavior and remaining mission gaps in release notes.
- [ ] Remove abandoned library prototypes and genuinely unused glue only. **Do not retire the custom v2 solver, its collision/constraint code or its tests under this plan.** Prefer shared game interfaces and instrumentation while retaining solver-specific behavior and coverage.
- [ ] Update physics documentation, harness commands, dependency/license inventory and this plan index. Archive this plan under `project/archive/` only after its shipped outcome and all remaining ownership are explicit.

**Done means:** the production game offers Custom v2 and one validated library engine through a main-menu selector; the player can exit, switch and compare the same level/bike in either direction; both engines preserve their own replay, scoring and restart contracts. Both remain supported. A dependency in `package.json`, a developer-only toggle, a flat-ground demo or a benchmark alone is not completion.

## Ownership and working rules

The parent owns engine choice, integration decisions, judgement, `README.md` and this checklist. Use resumable bounded subagents for adapter work, harness/provenance, and independent review, with disjoint owned paths. Shared `src/core/types.ts`, `src/physics/index.ts`, bootstrap and replay contracts have one designated integration owner. Coordinate with active R8 and hero owners before edits; no concurrent retuning of the control during a comparison.

One checkout, no worktrees. One commit per round with the finding in the subject; update the plan index at every commit. Record exact source/build/engine/tuning/track IDs and command lines alongside evidence. No engine migration or package installation was performed in the plan-writing turn.

## Decision log

| Date | Decision | Evidence / next action |
|---|---|---|
| 2026-09-15 | User requests a durable plan to use an established physics library | Plan created; Rapier 2D first, Planck comparison/fallback; start with P0 after coordinating in-flight R8 work |
| 2026-09-15 | User requires two engines in one game, toggled from the main menu outside levels | Supersedes the replacement/retirement outcome: keep Custom v2 plus the qualified library as supported choices; preserve track/bike and separate engine records for manual feel comparisons |
