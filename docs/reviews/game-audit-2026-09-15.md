# Game audit against the original brief

Date: 2026-09-15. Reviewed HEAD `56e38831c6b0eb8235cae1097b91e619e30752df` **plus the pre-existing dirty working tree**. Physics/track fingerprint: `a6d63cfd`. This is a review of the files supplied, not a verdict on an independently inspected public deployment.

## Verdict

**A substantial Trials-style game has been implemented. It has not achieved the README's AAA/Trials Rising target, and the current production build is not release-ready.** A fresh build cannot boot. Behind that packaging defect, the development harness demonstrates working gameplay, reproducible physics, track clears, and quick manual restart.

The largest remaining gaps are reliable shipping, human learnability, mobile 60 fps, and demonstrated visual/audio quality. A percentage would create false precision: having 15 tracks or hundreds of passing tests does not measure how close the experience is to Trials Rising. The existing plans' percentages measure their own intermediate milestones, not the original brief.

Read alongside the separate [physics-library review](physics-library-audit-2026-09-15.md).

## Findings, in priority order

### 1. P1 — Fresh production builds produce a syntax error before the game boots

**Location:** [vite.config.ts](../../vite.config.ts), line 228.

`pnpm build` succeeds, but the generated loader contains `return <script id="boot"></script>&t++` inside JavaScript. The build inserts bundled code using a string replacement argument. The minifier produces `$&&t++`; JavaScript's replacement-string processing interprets `$&` as the matched placeholder and reinserts its HTML into the script.

**Reproduced twice through different harness paths:** the production replay harness times out waiting for readiness; the iPhone-geometry run-flow suite reports `Unexpected token '<'` and times out waiting for the loader to disappear. Parsing the generated inline script independently confirms the syntax error. An isolated replacement probe confirms callback replacement preserves the original script bytes. Source was not patched during this audit.

**Action:** use a callback for insertion, then make a freshly built production cold-boot smoke test a required check. Test the emitted HTML, not only the TypeScript loader components. This blocks desktop and mobile startup in the audited build; it does not establish that an older deployed build is broken.

### 2. P1 — The default phone experience cannot meet the mandatory 60 fps bar

**Locations:** [src/game/app.ts](../../src/game/app.ts), lines 423, 1033–1037, 1072.

Auto selects a 30 fps phone cap, initially selects low graphics, and will not promote Auto to high. Thus even a sufficiently fast phone does not get the README's required 60 fps by default. There is a manual 60 fps choice, but its presence is not proof it holds that rate.

Historical user reports record 24–28 fps at high quality. The latest benchmark's phone times are model estimates with stated ±40% uncertainty, not iPhone Safari measurements. Its high-tier mean is 21.9 ms/frame; this supports investigation, not a measured device verdict. Headless SwiftShader raster times also cannot be called phone GPU times.

**Action:** measure sustained frame pacing, thermals, memory and input latency on real iPhones and desktop hardware, then make the default sustain the required rate. Existing profiles show very small physics CPU cost relative to rendering; replacing physics is not presently an evidence-based fix for the graphics bottleneck.

### 3. P1 — The claimed stranger evidence does not establish human learnability

**Locations:** [harness/stranger/README.md](../../harness/stranger/README.md), lines 3–10; [PROTOCOL.md](../../harness/stranger/PROTOCOL.md), lines 62–145; [actions.ts](../../harness/bot/actions.ts), lines 75–159.

The strangers are fresh AI agents operating Node simulations through command slots and ASCII/precise numerical telemetry. They receive technique recipes and can call scripted hop or feedback-controlled wheelie/climb actions. A human must discover and execute those techniques through the visible game and its keyboard/touch controls.

These results are useful evidence of solvability and of the agents' ability to adapt. They do not measure unaided human discovery, timing difficulty, visual readability, onboarding, or enjoyment. The actual human evidence found is the user's historical b1/b2 phone clears and report that recovery feels hard.

**Action:** keep the AI instrument, label it accurately, and add unfamiliar human play sessions on the actual desktop and phone interfaces. Record failures, abandonments, attempts-to-clear, restart latency and willingness to continue. Do not substitute an adaptive macro's success for learnability.

### 4. P2 — Acceptance reporting can look green while central requirements remain unmet

**Locations:** [stranger/report.ts](../../harness/stranger/report.ts), lines 173 and 206; [v2/feel.test.ts](../../src/physics/v2/feel.test.ts), lines 164–197 and 240; [gate/ship-gate.ts](../../harness/gate/ship-gate.ts), lines 90, 249 and 275.

- Stranger reports count only completed sessions, do not require the documented two-session minimum, and accept a median up to 1.5 times the authored upper band. They do not validate the lower difficulty bound. X1 currently reports PASS with one completed session and one unfinished session.
- The lean-controlled wheelie requirement is `it.fails`: its unmet assertion contributes to a passing test result. A fresh run measured **3.167 seconds** in the helper's balance band versus **10 seconds** required. The title specifies 45°±8°, but the helper targets 15° and counts accumulated rather than uninterrupted time. This is a failing benchmark, not proof no player/controller can hold a wheelie.
- The recovery test prints a <15° pitch target at 0.5 seconds; it measured 24.644° after cutting throttle from a 30° wheelie, while the assertion accepts <30°.
- Eleven tests are TODO in the full suite. Several cover signature trials techniques. Five v2 feel cases are marked expected failures.
- The ship gate's stranger check covers only b1/b2/b3/e1 and becomes informational when sufficient fresh sessions are unavailable. A release gate can therefore omit most of the curriculum's learnability bar.
- Golden clear baselines can update automatically when the selected filename or physics implementation changes. This is documented bootstrap behavior, but a release check should report baseline creation separately from independently matching an approved baseline.

**Action:** separate regression health, known unmet acceptance criteria, and release readiness. Report censored/abandoned sessions and sample sizes. Require explicit baseline changes in release validation, and give acceptance results the exact bands the tests assert.

### 5. P2 — A same-tick crash can be awarded a fault-free finish

**Locations:** [v2/bike.ts](../../src/physics/v2/bike.ts), lines 1864–1867 and 1909; [game.ts](../../src/game/game.ts), lines 739 and 756.

The solver emits finish before the same tick's fault. Once Game processes finish, it ignores the fault. A targeted probe using the actual v2 solver and Game moves the front wheel from x119.99 to x120.052228 across finish x120 in a nose-down crash pose. Physics reports `crash`; Game reports `finished`, zero faults, and finish time 1/120 second.

The fixture uses teleportation to isolate ordering; natural incidence is unmeasured. It demonstrates a scoring consistency defect. If crossing the line before a crash is intended, the engine still needs a defined ordering within the tick rather than simply privileging event order.

**Action:** define simultaneous finish/fault precedence and test both the physical and game-level outcome. Reproduce with `pnpm exec tsx docs/reviews/evidence/2026-09-15-finish-fault-probe.ts`.

### 6. P2 — The current required check fails in the reflex bot

**Location:** [harness/reflex/reflex.test.ts](../../harness/reflex/reflex.test.ts), line 171; [memory.ts](../../harness/reflex/memory.ts), `stalled()`.

`pnpm check` reaches the test suite and fails: repeated stall learning yields speedScale 1.1 while the test requires a value greater than 1.1. Running that test file independently reproduces the failure. This is a disagreement between the controller's learning behavior and its test; it is not a demonstrated player-facing physics crash.

**Action:** settle the intended per-stall increment, reconcile code and test, and refresh affected bot metrics. Do not use the failing instrument as unqualified acceptance evidence.

### 7. The available quality evidence remains well below the original parity bar

**Evidence:** [compare.jsonl](../../harness/out/metrics/compare.jsonl), lines 7–25; [rendering.md](../design/rendering.md), lines 1462–1497.

The latest six unique visual categories in the recorded ledger produce **2/6 wins** for this game; raw rows include duplicate hop/landing categories and should not be counted as independent samples. Recorded losses cover wheelie launch, landing and both world comparisons. Critic comments include rigid rider motion, weak contact/shadow integration, and camera behavior that hides landing detail. Some subsequent rendering fixes have not yet received another motion verdict.

All **11 recorded audio verdicts** prefer the reference: six initial and five rerun comparisons. Runtime crowd, ambience and music now exist, contrary to older status text, but their presence does not demonstrate AAA sound. The full 38-pair release battery is still outstanding.

**Scope of this conclusion:** this audit inspected the recorded verdicts and their provenance. It did not conduct a new blind audiovisual panel or derive a visual-quality verdict from stills. Recorded comparisons cannot prove the latest unjudged changes are worse, but they do not justify claiming parity.

## What is already achieved

| Original requirement | Evidence | Assessment |
|---|---|---|
| Three.js + TypeScript; 2.5D obstacle riding | Source, manifest and track/render interfaces | Implemented |
| Separate rider and bike masses | Chassis, wheels and rigid rider; force-paired rider servo | Implemented with additional game assists |
| Suspension, traction, weight shift, angle-sensitive landings | Custom v2 implementation and handling tests | Substantial; key control benchmarks remain unmet |
| Holdable/losable wheelie and discoverable technique | Tests, controllers and AI sessions | Partial evidence; human bar unproven |
| Authored beginner-to-extreme curriculum | 15 courses across five tiers, technique metadata and checkpoints | Implemented; full current human clearance unproven |
| Crash and instantly retry | Fresh dev-harness crash/manual restart | Implemented at simulation level |
| Deterministic replays | Nine fresh Node/Chromium checks on flat-test | Strong narrow evidence; no fresh Safari cross-engine proof |
| Progression, medals, ghosts, replay and controls | Game/UI modules and tests | Substantial implemented game systems |
| PS4-quality picture and AAA audio | Existing blind comparison ledger | Original target not demonstrated |
| Fast loads, bounded memory, 60 fps desktop/iOS | Existing benchmarks plus fresh boot tests | Release build fails; device-wide targets unproven |

### Track evidence is uneven and frequently historical

| Tier | Recorded AI-stranger median attempts | Qualification |
|---|---|---|
| Beginner b1/b2/b3 | 1 / 2 / 3 | Older fingerprint `74f5de4d` |
| Easy e1/e2/e3 | 5.5 / 6.5 / 1 | Older fingerprints `3d5fd16f` / `db68bbeb` |
| Medium m1/m2/m3 | 7.5 / 4 / 8 | Older fingerprint `db68bbeb` |
| Hard h1/h2/h3 | 16 / 10 / 16 | Current `a6d63cfd`, three completed per track, default Pro |
| Extreme x1 | 11 | Current; only one completed, another unfinished |
| Extreme x2/x3 | No stranger reports found | Not established |

An older fingerprint does not itself prove a particular track changed: the hash combines all tracks and physics. It means equivalence has not been re-established by those reports. Fresh replay below establishes only the specific flat/b1 recordings tested.

## Fresh validation

| Check | Result |
|---|---|
| `pnpm check` | Typecheck and lint passed; 589 tests passed, one failed, 11 TODO; build step skipped by command chain |
| Isolated reflex test | Same assertion failure reproduced |
| Separate `pnpm build` | Succeeded; approximately 455 KB gzip JS; generated loader invalid |
| Production replay boot | Timed out at 30 seconds |
| `pnpm harness:e2e --only=run --geom=iphone15promax` | Syntax error and loader timeout at 180 seconds; run-flow assertions not reached |
| Dev-server determinism on flat-test | 9/9: cross-load, JSON/binary, Node/Chromium, node/browser/fresh-world snapshot, chunking, state isolation, pinned hash |
| Dev replay flat-test, Rookie / Pro | Zero faults; 8.566666666666666 / 8.041666666666666 seconds |
| Dev replay b1, Rookie / Pro | Zero faults; 41.55833333333333 / 37.733333333333334 seconds |
| Dev crash/manual restart | Crash at tick 90 / 0.75 seconds; one restart tick returns to riding; movement within five subsequent ticks; 0.24 ms measured restart call |
| Targeted finish/fault and feel probes | Defect and unmet benchmarks reproduced as described above |

The 0.24 ms restart is one headless call, not a p95 end-to-end visual latency measurement. The 121 ms dev hook readiness is not cold user startup: `?harness=1` bypasses normal boot and exposes readiness before full scene preparation. Neither establishes production load or real-device performance. The complete ship gate was not rerun after the production boot blocker; no current full memory/performance pass is claimed.

Selected logs and machine-readable results are in [evidence](evidence/). Full scratch logs are retained locally under `harness/out/audit-20260915/`.

## Recommended order of work

1. Restore production boot and the required check; require fresh production startup in CI.
2. Correct finish/fault ordering and acceptance-report semantics.
3. Run actual unfamiliar players through the visible desktop and touch interfaces, starting with wheelie recovery and the beginner curriculum.
4. Measure and improve phone frame pacing, with graphics as the first profiling target.
5. Compare the same manoeuvres in motion against Trials after each meaningful change, including audio; complete the release battery.
6. Run the bounded physics-library experiment in the separate review. Migrate only if it improves these outcomes and reduces maintenance.

No game code, existing recordings, expected hashes, or pre-existing working-tree changes were modified by the audit. The review adds reports and evidence only, plus a dated status note in PLANS.md.
