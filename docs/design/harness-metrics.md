# Evaluation harness and metrics

Design for the layer that sits on top of the scaffold harness (`harness/{boot,replay,capture,perf,all}.ts`,
`window.__trials`, `src/core/{types,replay,hash,rng}.ts`). It turns "does the game work" into numbers the
parent can judge from a bot and from a stranger, and turns "does it look like Trials" into a blind
clip-vs-clip verdict. Everything is headless, deterministic and produces JSON under `harness/out/`.

Corpus numbers this design is calibrated against (see `reference/notes/*.md`):

| Reference fact | Number | Consequence for us |
|---|---|---|
| Ragdoll fault -> seated at checkpoint (Evolution) | 0.35 s after impact flash, hard cut | `faultToControlMs` target <= 500 ms sim time |
| Crash -> full restart incl. player reaction (Rising) | 0.75 s, one-frame cut, bike moving within 167 ms | `restartTicks` == 1; restart -> synced frame <= 50 ms wall |
| Re-attempt cadence on a hard obstacle | ~3.0 s fault-to-fault, 3 faults in 7 s | stranger CLI must allow >= 20 attempts/min |
| Countdown on fresh load / none on restart | 1.0 s per beat / GO at +0.9 s | `restart` path never inserts countdown ticks |
| Beginner clean time / medium clean time | 16-19 s / 40-70 s, 0-3 faults | bot search horizon sized for <= 90 s tracks |
| Big-jump airtime | 2.4-3.2 s | beam lookahead must exceed one airtime (>= 3.5 s) |
| Timer never pauses across a fault | 16.95 -> 18.55 through respawn | `finishTime` is wall-of-run; faults cost real time |

## Round 1 status — what is built and where it differs from the design below

Everything under `harness/` in this document exists and runs on whichever physics `src/physics`
exports (`bikePhysicsFactory`/`createBikePhysics`, else the scaffold `MockPhysics`). Reconciled
to CONTRACT.md; where the sections below still describe the original plan, this list wins:

| topic | as built |
|---|---|
| physics API | `snapshot()/restore()` return `{v:1, f64, u8}`; `compileTrack(def)` from `src/tracks` is what the sim loads. `hook.snapshot()` base64 also carries the game counters. |
| **rule layer** (new) | `harness/lib/rules.ts` mirrors `Game.tick()` (riding / crashed / finished, restart edge, 0.6 s hold = full restart, 1.0 s auto-respawn, run clock, fault counter). `Sim.step()` is a *game* tick, not a bare physics tick; `SimSnapshot = {physics, counters}`. Without it node and browser replays diverge at the first crash (D3 caught it). **Requested src change:** core-game exports this state machine renderer-free so the harness imports instead of mirroring. |
| attempts | `1 + fault events` exactly as the game counts (`hook.faults()`); the restart mash after a crash is a free respawn in the rule layer and emits no fault. The bot's browser verification warns when node attempts−1 ≠ browser faults. |
| actions | 13 macro-actions × 15 ticks, **no hop button** (CONTRACT §2.8): `c g gb gf hg hgb hgf b bf bb lb lf t`. Hop = `gb` then `gf`. Same vocabulary for bot and stranger. |
| bot | `harness/bot/{actions,score,beam,play,bot}.ts`; `pnpm harness:bot <track> [--skill N] [--oracle] [--all] [--seeds N] [--budget ms] [--crash-probe]`. Committed play has *player memory*: a fault bans the action prefix that led to it from that state (keyed by state hash), so attempts are not identical repeats. Golden recordings are written only when the browser hash equals the node hash. Output `harness/out/metrics/<track>.json` (curve, par, shaped, singleWall) — committed. |
| stranger | **node CLI, one-shot commands, state persisted between calls** (`harness/stranger/cli.ts`, `session.ts`); no long-lived page/socket. `look` renders an ASCII side-view of the next 40 m from the compiled colliders plus the numbers a player sees; `play` prints a per-slot trace instead of a contact sheet. Recordings replay in the browser. Metrics `harness/out/metrics/<track>.stranger.json`. Full reset uses the 0.6 s hold rule so it stays replayable. |
| compare | 640×360@30 (not 1280×720), `pair.ts` writes `pair-<id>.mp4` (hstack + label bar: 1 square = A, 2 squares = B; no drawtext in this ffmpeg), `pair-<id>-sheet.jpg` 2×8, sealed `pair-<id>.answer.json` (chmod 000). `log.ts` unmasks and appends `out/metrics/compare.jsonl`. The critic is a separate agent the parent runs with `RUBRIC.md`; there is no `critic.ts`. `--mask` blacks out HUD regions (our capture carries a debug HUD strip that would give the side away). |
| gate | `pnpm harness:gate` → `harness/out/metrics/ship-gate.json`, exit code = failed checks. Thresholds are the CONTRACT §3 numbers in `gate/thresholds.json` (below). G7 capture-sanity is not in the gate (capture is its own command). `fault.toControlMs` is the *manual* path (restart mash on the tick after the crash); the auto-respawn path is reported next to it (~1008 ms per CONTRACT §2.8). Pins in `gate/expected.json` are per physics implementation and re-pin automatically when the implementation name changes; a tuning change with the same name fails `clear.*`/D8 on purpose until `harness:bot` is re-run. |
| determinism | D1–D5, D7, D8 as designed plus D4b (snapshot round trip through the page's base64 hook). D6 (live-vs-replay under frame jitter) not built. |
| **sweep** (round 2) | `pnpm harness:bot --all-tracks --skill 2 --seeds 2 --track-wall-s N` → `out/metrics/sweep.json` + `sweep.md`: per track best distance (m, %), clears/seeds, attempts, first blocker = first fault's reason + x + nearest `placed` obstacle within [−2, +8] m. Per-run reports gained `maxX`, `progress`, `firstBlocker`, outcome `wallTimeout`. |
| **round** (round 2) | `pnpm harness:round [--build] [--quick] [--pin]`: bot on flat-test (+crash probe), gap-test, b1-first-ride, then determinism on the flat-test golden, then the gate; child processes, exit = failed steps. |
| **critic prompt** (round 2) | `pnpm harness:critic-prompt <pair-id>` writes `pair-<id>.prompt.md`: tag, absolute sheet/mp4 paths, RUBRIC "what you are looking at / how to judge / vocabulary / general + tag criteria / output shape", and the instruction never to open `*.answer.json`. Default HUD mask now also covers the bottom 8 % (our control-hint strip). |
| **thresholds** (round 2) | ship targets stay top-level in `gate/thresholds.json`; a `swiftshader` block (firstFrameMs 4000, restart.frameMsP95 150, perf.renderSyncedMsP95 250) applies automatically when the renderer string contains SwiftShader; the gate prints both and records `shipLimit`/`shipPass`. |
| **provenance** (round 2) | every report has `srcFingerprint` (working-tree hash of physics/tracks/core/rules) because builders edit `src/` while long runs are in flight; the sweep warns on a mid-run change. |
| infra | `BrowserVerifier` serves a **frozen copy of `dist/`** so another builder's rebuild mid-gate cannot change the page, and warns when `dist/` predates `src/`. Corpus: seesaw (16, 17) and stairs (18, 19) clips added to `reference/techniques/` (Trials Fusion; no Rising/Evolution seesaw footage exists). |

## Round 3 status — stranger tooling, clip evidence, gate hygiene

| topic | as built |
|---|---|
| **stranger spawn text** | `harness/stranger/run-stranger.md`: the block the parent pastes to a fresh agent (points only at `PROTOCOL.md`, the track id and a pre-created session id; nothing else). PROTOCOL.md now says what to do when handed a session id (skip `start`). |
| **stranger per-attempt recordings** | Every ended attempt (`fault` / `restart` / `reset`) writes `attempts/NNN.rec.json` — the session's input stream from GO to that moment — and `startTick`/`endTick`/`recordingFile` in `attempts/NNN.json` (`AttemptLog`). A prefix replays to the same tick and x (checked: attempt 3 of a smoke session, 304 ticks, x 11.525, crash). `session.json.bestAttempt` (`BestAttempt`) names the clearing attempt (whole-session recording, its start tick) or the furthest one. Clip: `harness:clip <track> --recording <file> --from-tick <startTick>`. |
| **stranger report** | `pnpm harness:stranger report <trackId> [--stale]` (`stranger/report.ts`): every session dir → one row (done / in-progress / abandoned after budget+5 min; attempts, cleared, time to clear, calls, wall, first-checkpoint call, deaths as `reason@x (nearest placed obstacle)`, best attempt window); medians over completed sessions whose `srcFingerprint` equals the working tree's (stale ones listed, excluded unless `--stale`); where-they-died table by obstacle / reason / checkpoint segment. Writes `out/metrics/<track>.stranger.json` (schema 2) + `.stranger.md`; `done` now delegates its metrics merge to the same function. |
| **clip per track** | `pnpm harness:clip <trackId>` (`harness/clip.ts`): candidates `inputs/<track>/{bot-oracle,bot-3..0,stranger-*}.json` replayed in node (attempts, finish, hash, `src=` stamp) → finished > fewer attempts > faster > current stamp > higher skill; rendered 1280×720 @ 60 fps, `setQuality('high')` (new `HookClient.setQuality`), `out/capture/<track>/{clip.mp4,sheet.jpg,clip.json}`. `--recording`, `--from-tick/--to-tick`, `--at-x m --before s --after s` (window around the first tick the bike passes x — `captureClip` gained `quality`, `startTick`, `endTick`, sheet grid; the prefix is simulated unrendered). `--tile a,b,c,d`: 4×4 sheet, one row per track, frames at 10/37/63/90 % of each clip (captures missing clips first), `tile.json` legend. Cost on SwiftShader at high: ~0.39 s per frame ≈ 25 s wall per clip second (b2 full run: 1077 frames, 420 s). |
| **goldens by fingerprint** | `harness/lib/golden.ts`: the bot stamps `src=<srcFingerprint>` into every recording note (`recordingFromFrames`); `chooseGolden/pickGolden` take the highest-skill golden whose stamp equals the working tree's, else the newest by mtime with a WARNING (gate `clear.*`/D8 then fail on purpose). Used by the gate (G2) and `harness:round` (determinism step). |
| **boot robustness** | Gate G1 takes 5 samples (3 with `--quick`), checks p50, reports `min`, `loadavg1`, `cores`, `retried`; a p50 miss while 1-min loadavg > cores is re-sampled once and the better batch kept. Observed under loadavg 8.3/18: runs 279/354/33 ms, p50 279, min 33. |
| **round --quick** | skill 2 (was 3), 60 s wall cap per bot run, determinism `--loads 2`, gate `--quick`; measured **108 s including the build** (bot 6.3 + 3.7 + 6.8 s, determinism 5 s, gate 86 s). Full profile unchanged. |
| **sweep, two skills** | `pnpm harness:bot --all-tracks --skill 2,3` runs one sweep per skill; `sweep.md` gets one table per skill with its own src fingerprint / git / wall header, `sweep.json` keeps the first sweep at top level plus `sweeps[]`. |
| **typecheck hygiene** | `tsconfig.harness.json` excludes `harness/out` (and `node_modules`, `dist`): stray files under `out/scratch` cannot break `pnpm typecheck`. |
| **play/replay divergence** (found this round) | `PlayResult.hashes` (per committed tick) + `BotRunReport.playReplayDivergence` + sweep `replay` column + `pnpm harness:snapshot-probe <recording>` (`gate/snapshot-probe.ts`). On the working tree of 2026-09-14 the bot's committed play is **not** retraced by a replay of its own recording (e1: diverges at tick 376, x 33.7 m; flat-test golden: tick 346, x 28.8 m — the first hop). Cause in `src/physics/bike.ts`: `private brakeIn` (and `seesawLambda`, `chDx/chDy`) live on the instance, outside the `F`/`U` arrays that `snapshot()` copies; beam search restores a root after rollouts and resumes with the rollout's brake filter state. Consequence: every bot attempts/clears number since the physics gained `brakeIn` describes a trajectory no replay reproduces (the browser hash still "verifies" because both sides replay the recording). **Requested src change:** move that state into `F`; `harness:snapshot-probe` must PASS on flat-test and e1 before the sweep numbers mean anything. |
| **blind pairs, round 3** | Three manoeuvre pairs from real-track bot clips vs the closest reference: b2 drop landing (x≈37 m, ledge) vs techniques/07 uphill-plank-landing (`big-jump-landing`); e1 steep climb (ramp @ 81.5 m) vs techniques/05 steep-curved-ramp-climb (`steep-climb`); x1 plank climb (ramp @ 27 m + plank @ 28.2 m) vs techniques/06 near-vertical-ramp-climb (`steep-climb`). Ids and prompt paths in the round-3 report / `out/compare/pair-*.prompt.md`; verdicts via `harness:log-verdict`. |

## Round 4 status — stranger parity with a real player, call ergonomics, stranger clips, gate G10

Round-1 strangers (8 sessions, src 73762476): 47–107 calls each, 30–86 `play`s, 13–16 `look`s, 0 CLI
errors. What cost calls was the loop, not the track: **`look` after every second `play`** (a quarter of
all calls, because `play` printed no screen), plays chopped to 4–8 slots on the PROTOCOL's own advice,
and on b3 six `reset`s to the start line to rebuild speed for the kicker (checkpoint 1 respawns at
x = 130 m, 3 m before the kicker at 133 m — a track finding, see below). Six of eight sessions lost
attempt 1 at x ≈ 24–27 m to a full-gas loop-out on flat ground (`g40` from the line: angle 44° by
slot 15, over at slot 18).

| topic | as built |
|---|---|
| **what the stranger sees (parity)** | `start` and `look` print the **track card** — exactly what the game shows on the menu and HUD and nothing else: `track <id> (<tier>) "<name>" — technique: <meta.technique>`, `hints: …` (`meta.hints`, beginner tier only, as the HUD does — m2's authored hints are not shown to a player today, so not to the stranger), `checkpoints at x = …; finish at x = …` (the progress strip's marks). No `demands`, no band, no geometry. |
| **crash = the game's auto-respawn** | `play` no longer taps restart on a crash. It plays coast frames through the `crashed` phase until `RunRules` fires the 1.0 s auto-respawn (`T.autoRespawn`, `harness/lib/rules.ts`), exactly what a player who lets go sees; the run clock pays the second. Recorded, so a replay respawns at the same tick (node vs browser byte-identical on a crash+ride smoke: hash `02550d312f0f69be` both sides, fresh build). `faulted` now carries `at`, `respawnedAt`, `respawnAfterS`; `restart` (give up a live attempt: the restart tap, instant) and `reset` (0.6 s hold) unchanged, both now say in their `note` what they cost. |
| **fewer calls, same information** | `play`, `restart` and `reset` print the ASCII side-view from the new position after the trace, so `look` is only for the track card; `play` gained `distanceToFinish`. PROTOCOL.md rewritten around that: send the whole plan (unplayed slots cost nothing, a crash costs an attempt not calls), never `look` after `play`, `restart` is never needed after a crash, `reset` almost never worth it; a worked crash example. Expected saving from the round-1 logs: 13–16 `look`s per session (25 %) plus whatever longer plays buy. |
| **stranger clips** | `out/capture/stranger/<track>-<session>/{clip.mp4,sheet.jpg,clip.json}` for all 8 round-1 sessions: 6 s around the deadliest obstacle (b1 x 303, b2 x 36, b3 x 133, e1 x 292), 1280×720 @ 60 fps, quality high. Rendered on the physics the strangers played on — the working tree had uncommitted `src/physics` edits (fp 61f2e6e9 vs the sessions' 73762476), so the clips were captured from a `git archive HEAD` copy in the scratchpad, pointed at the committed recordings. The attempt in the clip is the clearing one where it rides through that obstacle (b1, e1), else the latest attempt that did (b2 s1 #2, b2 s2 #1, b3 s1 #12, b3 s2 #9 — every b2/b3 clearing attempt started at a checkpoint past the obstacle). |
| **gate G10 stranger** | `stranger.medianAttempts` row over b1/b2/b3/e1: per track, median `strangerAttempts` of sessions completed **on the working tree's src fingerprint** vs `stranger.attemptsBandFactor` (1.5) × `meta.attemptsBand[1]`; value is the summary string, `report.stranger.rows[]` the numbers. Informational (pass) until every track has ≥ `stranger.minSessions` (2) such sessions; then a real check (all four within band and every counted session cleared). Replaces the old single-track stranger row. |
| **goldens re-pinned on 2df0b0d** | The physics commit after 2bdd175 landed mid-round (`2df0b0d` "pitch-rate-led wheelie control", src fingerprint 0693a0b2). `pnpm harness:round --build --pin` (full profile, 589 s): bot flat-test 13.8 s, gap-test 5.1 s, b1 134 s (skill 3: 1 attempt, finish 33.958 s), determinism 8/8 (D8 re-pinned f80b29d13e0956b5), gate `expected.json` re-pinned (flat-test bot-3 finish 7.041666666666667, hash 7b4e0c804fa7226e). Gate on that tree: **18/21**; the three fails are the SwiftShader-informational render timings (`boot.firstFrameMs`, `restart.frameMsP95`, `perf.renderSyncedMsP95`); `fault.toControlMs` 41.7 ms, auto-respawn path 1033 ms, crash probe 2.40 s, heap −5.9 MB/60 s, physics 25 µs/tick p95, G6 2 ticks. `out/metrics/ship-gate.json` is the full (60 s heap) run after the G6 re-spec: 18/21, wall 441 s. Every round-1 stranger session is now `stale src` (73762476 ≠ 0693a0b2): the round-4 stranger round has to be replayed on the new physics before G10 can arm. |
| **G6 re-specified** | `restart.noCountdown` used to demand `vel.x > 0` on the very first throttle tick after a restart. The committed clutch model (crank inertia, centrifugal capacity) needs 2 ticks from idle, so that check failed on physics that has no countdown at all. It now holds throttle from the first tick after the restart tick and reports the worst-of-20 tick count until the bike rolls, limit `restart.movesWithinTicks` = 12 (0.1 s; a countdown would be 360+). Measured 2 ticks. `report.restart.movesAfterTicks` carries the number; `movesOnFirstTick` is still reported. |

Track findings for the parent (from the sessions, not the harness): (1) **b3 checkpoint 1 at ~130 m,
kicker at 133 m** — a stationary respawn has 3 m of run-up, so strangers `reset` to the start (6 resets
across two sessions) or die on the lip (8 of 21 deaths at 130–145 m); (2) **full gas from the line loops
out at 2.4 s on flat** on 73762476 (6/8 first attempts); the working-tree physics holds the wheelie at
36–37° instead; (3) e1 s2 finished in 15 attempts on 107 calls after the round-1 commit (`in-progress` there);
e1's median is now 12 (band 2–4), 2 of 2 cleared; (4) **b3 kicker flight is played blind**: in both b3
clips the camera rides up into the skylights after the 133 m kicker and shows only ceiling for ~2.5 s of a
~3.4 s flight (s1 17.2–19.0 s, s2 14.3–15.1 s run clock), the bike out of frame exactly while the hint says
"Level the bike in the air"; the next frame is a top-down view of the landing.

## Round 14 (physics R8) — strangers on the rider who sits on the bike: b1–e3 on the Rookie (the tier's default), src 089e0885, two fresh strangers per track, 12 / 12 cleared; b1 back in band (the R13 brake endo is gone from a stranger's hands), e2 / e3 UNDER band as in R13

Physics R8 (`physics.md` v2 status R8: the hold envelope — seat, tank, leg and arm reach as hard one-sided limits with
seat friction — the thrown-rider fault, and the brake brace) is a dynamics change, so rule 1 of the merge doc applies:
b1–e3 re-run with strangers, this time **n = 2 per track** (the R13 verdicts were INSUFFICIENT at n = 1). Twelve sessions,
`prep --round r14b --agents s1,s2`, prompt = `run-stranger.md` block verbatim, spawned in parallel (the box also carried
two golden sweeps and the Astra port builder; 1.7–5.1 min wall, 11–24 calls). A first twelve (round `r14`, src
2503f384) were played before the brace's air gate landed (`physics.md` deviation 19) and are `stale src` in the report,
listed for the record: b1 1 / 1, b2 1 / 1, b3 2 / 2, e1 1 / 2, e2 2 / 2, e3 1 / 1 — the same medians as the counted round.
**Every session cleared; verdicts from `harness:stranger report` (n = 2, censored = the two abandoned r4 shells per track):**

| track | band | asserted | attempts (s1, s2) | median | verdict | time to clear | calls | died at | what the strangers said |
|---|---|---|---|---:|---|---|---:|---|---|
| b1-first-ride | 1–1 | 1 ≤ med ≤ 1.5 | 1, 1 | **1** | **PASS** (R13: 2, above) | 42.9 / 40.8 s | 12 / 12 | — | both name braking before the hump at 480–510 m from 16 m/s as the hardest part — and both stop upright on a plain / one-slot weight-back brake; the R13 fault ("a plain `b` from 15 m/s pitched the bike over the bars") does not recur |
| b2-lean-back | 1–2 | 1 ≤ med ≤ 3 | 1, 1 | **1** | PASS (R13: 3) | 43.8 / 46.2 s | 21 / 17 | — | the knee-high ledge at x ≈ 68 read from the 0.5 m/row view (brake + hop; one landed −58° and was saved with `gb`) |
| b3-kicker-row | 1–2 | 1 ≤ med ≤ 3 | 2, 2 | **2** | PASS (R13: 2) | 42.4 / 44.5 s | 13 / 16 | 94 m, 94 m | both lost attempt 1 to the same thing: lean-forward held through the second kicker's lip → nose-down flip; both then rode every kicker on plain gas and coasted the flights |
| e1-uphill-weight | 2–4 | 2 ≤ med ≤ 6 | 3, 1 | **2** | PASS (R13: 2) | 63.8 / 52.0 s | 24 / 13 | 227 m, 211 m (ramp) | the convex 45° faces launch nose-up; holding the lean into the air front-flips; release at the lip and one-slot correction in flight |
| e2-rear-wheel-first | 3–5 | 3 ≤ med ≤ 7.5 | 1, 2 | **1.5** | **UNDER-BAND** (R13: 2, under) | 45.4 / 52.2 s | 21 / 22 | 324 m | the lean-back release in the air (`lb2` off a kicker swung the nose 30° further on release into a loop-out); the gaps were safest on `gf` up the ramp and plain `g` in flight |
| e3-stairway | 3–6 | 3 ≤ med ≤ 9 | 1, 1 | **1** | **UNDER-BAND** (R13: 1, under) | 41.7 / 40.8 s | 15 / 11 | — | plain full gas through every stair flight, both ways (both distrusted the card's "brake down" and were right) |

Census: 12 / 12 cleared, medians b1 1 · b2 1 · b3 2 · e1 2 · e2 1.5 · e3 1 against bands 1–1 · 1–2 · 1–2 · 2–4 · 3–5 · 3–6.
**e2 and e3 are outside (under) their authored bands after n = 2, as they were at n = 1 in R13** — easier than authored,
within the ship limit; a tracks note, not a physics one (nothing was tuned to a band this round). The gate's
`stranger.medianAttempts` row reads the same census (PASS). Recordings
`harness/inputs/<track>/stranger-<track>-r14b-s{1,2}-20260915-220131.json` (not browser-replayed this round); reports
`harness/out/metrics/<track>.stranger.{json,md}`; the r14 (stale) set `…-r14-s{1,2}-20260915-214558.json`.

Alongside, on the same src: goldens 46 / 48 browser-proved (Pro x1 / x3 stale — the Pro bot stalls at 81 % / 92 % under
R8, `physics.md` R8 golden table), determinism 9 / 9 (D8 `ff119f990e56af57`), gate `--quick` 27 / 30 (the three
SwiftShader timing rows), reflex 9 seeds clears 9 / 9 on every track with no beginner / easy median moving by more than 1
(`physics.md` R8). The R13b tells this round was built for — "collapses onto the tank in 2 frames", "sinks below the bars
into the bike geometry" — are now bounded by the envelope (hips never > 4.6 cm below the seat line on any golden tick);
whether the critic reads it is the next critic round's question, not this one's.

## Round 13b (critic r4, body-driven hero) — the rig is live (chest bone = physics body to 1e-9 rad, std 0.09–0.18 rad per clip) and the blind critic still takes the reference 10 of 12: r4 1 / 6, r4b 1 / 6, both wins on crash cells; the round-12 statue tells are gone from every riding cell and the new rider tell is the R8 punch ("collapses onto the tank in 2 frames", "sinks below the bars")

**Finding.** Physics R7 (`fe50df5`) exports `riderBody` every tick and the merged hero's `GltfRider.chainFromBody` takes over: on
every rendered frame of every capture this round `PhysicsState.riderBody` is present and `GltfRider.debug.physicalPose` is true
(b1 360 / 360; the twelve battery cells 240–259 / 240–259 each), `additiveWeight` is 0 (no timer clip touches the body path), and
the skinned chest bone's pitch in the bike frame equals the chain's `torsoAngle` to 1.8e-9 rad. The drawn torso moves with the
simulated body: on the 6 s b1 clip (932×430, `high`, ticks 1800–2520) `riderBody.angle − bike.angle` has std **0.085 rad**, range
−0.263 … +0.271 rad (18.12 s / 20.55 s run clock), 95 of 360 frames beyond 0.1 rad, and the chest bone tracks it at **r = −0.98**
(the sign is the frame convention: chain torso is measured from the bike's up, physics from +x). Across the twelve cells the std is
0.086–0.18 rad riding (world-industrial 0.086, hop 0.15, see-saw 0.18) and the correlation −0.98 … −0.996 on every non-crash cell.
Pillar H's bar is not met: **r4 (the merge #3 six) ours 1 / 6, r4b (six body cells) ours 1 / 6, 2 / 12**, both wins fault-respawn
cells where the reference window mis-fires (round 10 and round 12 won the same way). What changed in the tells: **round 12 / merge #3's
"rider is a frozen pose welded to a bike", "rider and bike stay one rigid object", "no lag, no lean-back" are not said of any riding
cell** — the crash critics now score `bike-becomes-debris` 5 / 4 for ours and write "rider ejects forward and tumbles as a separate
body while the bike slides ~20 frames to rest with its own momentum"; the one "rider pose is frozen" left is world-canyon-1, a top-down
frame where the bike is ~30 px and the critic also wrote "torso hung off the side". **The new rider tell is the landing punch**, R8's
item, named on four cells: "rider body collapses flat onto the tank within 2 frames of touchdown and stays draped until snapping
upright at 1.6 s, then does it again" (landing-snow), "goes from crouched-forward to thrown-back between 0.97 and 1.07 s, a 3-frame
pose change that reads as snap rather than lag" (rear-wheel-landing-e2), "the rider's head and torso sink below the bars into the
bike geometry and pop back up at 2.8–3.05 s" (face-x1: body −0.48 rad for 8 frames after the crest landing), "rider goes from seated
to on the ground in ~2 frames" (tabletop-e1: +0.44 rad for 6 frames at touchdown, no fault — every probe frame is `riding`). The
camera tells are unchanged from round 12 (named on 9 of 12: "bike is ~30 px", "distant, non-committal", "swings down and back in
~10 frames at the roof exit", "yaws ~40° in 0.3 s with a foreground tree wiping across the rider", "passes straight through a
foreground tree for ~4 frames", "bolted flat, no pullback or push-in") and so is the two-frame near-plane pop (b3 wheelie, b3 crash);
the "wheelie locked to a fixed angle" tell is named twice (b3 hold after the landing, x1's 606 m hold: "near-fixed angle for two
seconds like a locked pose"; the physics hold is 32° for 1.4 s). Rig proof and clips: `harness/out/capture/r13b-hero-b1/`
(`clip.mp4` 932×430 @ 60, 6.0 s, `rider-probe.json` 360 rows, `capture.json` summary), `harness/out/capture/r13b/<cell>/`
(twelve 1280×720 @ 60 clips, each with `rider-probe.json`), pairs `harness/out/compare/pair-<id>*`, verdicts `critic-r4-*` /
`critic-r4b-*` in `harness/out/metrics/compare.jsonl`.

| piece | as built |
|---|---|
| **rider probe** (`capture.ts` `--rider-probe`, `CaptureOptions.riderProbe`) | per rendered frame, through `window.__render`: `physRel` = `riderBody.angle − bike.angle` (wrapped), `chainTorso` = `GltfRider.chain.torsoAngle`, `meshTorso` = the chest bone's world up axis in the bike frame (atan2 x / y), `physicalPose`, `additiveWeight`, `present`; `rider-probe.json` (rows) next to the clip and a summary in `capture.json` (`presentFrames`, `physicalPoseFrames`, std of the three angles, Pearson r chain / mesh vs physics, ranges). `--quality`, `--from-tick`, `--to-tick` now reach `harness:capture` directly (they were `harness:clip`-only). The in-page closure holds no inner arrow (tsx's `__name` helper is undefined in `page.evaluate`, the hero-webkit gotcha). |
| **cells** (`harness/out/compare/r13b/plan.json` (+ `pairs.tsv`); anchors from `battery.mts` on the R7 goldens) | r4: wheelie-industrial b3 tick 1503 (the R7 golden's 0.82 s / 50° hold at 174 m — round 12's 253 m wheelie is not in the R7 recording), **crash: the R7 m2 golden has 0 faults, so the round-12 crash-snow cell (m2 attempt 1 of 2) cannot be rebuilt; substituted the r13 b3 stranger's flip off the big kicker at 243 m (tick 2147)** against the same Evolution tumble hard-cut, landing-snow m2 tick 3038 (0.97 s air, 0.88 m; round 12 tick 4152), hop-nightcity h2 tick 4636 (0.42 s, 0.43 m; round 12 tick 4768), world-industrial-1 b1 1800–2280 and world-canyon-1 e1 1080–1560 unchanged. r4b: rear-wheel-landing e2 tick 2553 (1.11 s air into a 0.58 s wheelie hold) vs Rising canyon-sunset-air; **the h1 golden holds no ≥ 20° wheelie for 0.5 s (the Rookie bot rides the wire flat) — the hold cell is x1's 606 m hold (0.78 s @ 45° + 1.40 s @ 32°)** vs wheelie-sustain-over-bumps; see-saw m3 tick 3135 (touchdown onto the 336 m board, tip, exit) vs seesaw-tip-and-exit @ 3.8 s; crash-ragdoll = the r13 b2 stranger's loop off the 288 m drop (tick 3392) vs crash-ragdoll-instant-respawn; face-x1 tick 486 (the 45° plank at 30.8 m onto the 3.6 m box, 1.60 s flight) vs near-vertical-ramp-climb; tabletop-canyon e1 tick 2001 (2.10 s air, 4.15 m) vs giga-sand-dunes. All twelve captures `high` 1280×720 @ 60, 4.0–4.3 s, camera PASS 0 riding frames out of box, three at a time (2.3 min per three). Pairs `pair.ts --mask --seed 401–406 / 411–416 --align before:refAnchor`; ours sat on A 8 times, B 4 times. |
| **critics** | twelve fresh sub-agents, one pair each, the `harness:critic-prompt` text verbatim; every verdict validated (0 invalid), logged `harness:log-verdict --critic critic-r4-<cell>` / `critic-r4b-<cell>`. |

### The twelve pairs (ours side sealed until logging; pick → unmasked; `nonAAA` verbatim, abridged)

| set | pair (ours cell vs reference) | ours | pick | conf | the tell | merge #3 |
|---|---|---|---|---:|---|---|
| r4 | wheelie-launch (b3 wheelie-industrial vs Evolution gold run) | A | **ref** | 0.85 | "A never shows the launch: the bike is airborne at frame 0, lands, and then eases into a shallow wheelie whose angle sits almost fixed with no visible counter-inputs; a two-frame geometry pop at t≈0.37 s breaks continuity, and the distant, non-committal camera leaves the landing and wheelie without weight"; `rider-lean-lags`: "A rider lean-back is not separable from bike pitch at this scale" | ref 0.86 "frozen pose welded to a bike" |
| r4 | fault-respawn (b3 r13 stranger flip vs Evolution tumble hard-cut) | B | **ours** | 0.62 | of the reference: "A's crash never becomes debris: rider and bike stay glued and slither down the ramp, then freeze for a third of a second before the cut, with no impact dust"; of ours: "rider ejects forward and tumbles as a separate body while the bike slides ~20 frames to rest with its own momentum", "small tan dust puffs within 2–3 frames", `bike-becomes-debris` A 2 / **B 5**; against ours: "a large black foreground shape whips across the frame for 2 frames at 0.3 s", post-cut camera "still easing wider", back-in-control ~1.5 s | ref 0.60 "rider and bike stay one rigid object" |
| r4 | big-jump-landing (m2 landing-snow vs Evolution A-licence descent) | A | **ref** | 0.75 | "A's rider pose snaps between draped-on-tank and upright in 1–2 frames instead of lagging and settling, and the camera makes a fast, unmotivated yaw that drives a foreground tree straight through the rider on the landing run-out; the touchdown itself is a single pitch with no rebound and dust that fires with the front wheel rather than after the rear" | ref 0.60 "over-rotates … no suspension settle" |
| r4 | bunny-hop (h2 hop-nightcity vs drum-spool hop) | A | **ref** | 0.60 | "A's bunny-hop is filmed from so far away that the manoeuvre has no visible preload, apex or settle; it reads as a small object sliding over boxes" (B "throws it away with a mid-air cut into a cramped, near-frozen framing") | ref 0.62 "camera hides the manoeuvre" |
| r4 | world-industrial (b1 riding vs Evolution warehouse) | B | **ref** | 0.55 | "B's bike cruises a flat track with almost no load change visible: no compression, no settle, no pitch overshoot, so the run reads as a smooth glide rather than a weighty machine"; credited: "rider leans forward and the bike pitches to match the grade, camera pans smoothly with a gentle roll as the track curves; very clean" | ref 0.60 "rider locked in one pose" |
| r4 | world-canyon (e1 riding vs Rising canyon) | A | **ref** | 0.85 | "A's bike behaves like a sprite dragged across the terrain: constant pitch, constant ride height over visibly bumpy geometry, a frozen rider, and a camera bolted to the bike's screen position — no load changes, so nothing ever settles" ("rider pose is frozen for the whole clip (torso hung off the side, arms locked)") | ref 0.80 "rider frozen" |
| r4b | big-jump-landing (e2 rear-wheel landing vs Rising canyon-sunset-air) | A | **ref** | 0.74 | "A's post-landing settle is too fast and the rider pose flips in ~3 frames while the camera stays bolted flat with no pullback or push-in, so the hop reads as a light object on a rail"; credited `rear-wheel-first` A 4 / B 2 ("rear at 0.80 s, front ~3 frames later") | — |
| r4b | wheelie-launch (x1 606 m hold vs wheelie-sustain-over-bumps) | A | **ref** | 0.60 | "A's wheelie holds a near-fixed angle for two seconds like a locked pose, then the camera swings down and back in ~10 frames at the roof exit with no ease-in, and the front wheel touches down without any suspension settle; the launch itself is fine"; `rider-lean-lags`: "A rider extends arms in step with the bike rather than trailing" | — |
| r4b | seesaw (m3 336 m board vs seesaw-tip-and-exit) | A | **ref** | 0.55 | "A's plank sits still after the mass crosses the pivot and then snaps through most of its rotation in ~3 frames, while its camera swings framing size and the ground texture shimmers"; "A rider unreadable at that scale" | — |
| r4b | fault-respawn (b2 r13 stranger loop vs crash-ragdoll-instant-respawn) | A | **ours** | 0.82 | of ours: "rider is thrown off at 0.95 s, CRASH card at 1.2 s, single hard cut at 2.00 s; bike and camera dead still on the first post-cut frame; the bike keeps tumbling end-over-end up the slope for ~1 s with its own momentum while the rider ragdolls and slides to a stop", `bike-becomes-debris` **A 5** / B 4; of the reference: "never cuts back to the checkpoint … lies still for over 2.5 seconds while the camera drifts on a blurry close-up" | — |
| r4b | steep-climb (x1 45° plank vs near-vertical-ramp-climb) | B | **ref** | 0.85 | "B's camera clipping through a tree in the first 6 frames and the rider collapsing through the bike after landing are hard continuity breaks; the manoeuvre itself never loads the rear on the incline, it just launches and floats" ("rider's head and torso sink below the bars into the bike geometry and pop back up at 2.8–3.05 s") | — |
| r4b | flight-airtime (e1 table-top vs giga-sand-dunes) | B | **ref** | 0.60 | "B's landing-to-crash transition: ragdoll and bike topple resolve in 2–3 frames with no damped settle or slide"; credited: "ballistic arc reads as gravity, nose-up hold then slow nose-down drift; camera pans with an eased lead", "pitch rises gradually on the ramp face rather than popping at the lip". No fault occurs in the window (probe: 253 / 253 frames `riding`); the body's +0.44 rad excursion for 6 frames at touchdown is what read as "rider goes from seated to on the ground in ~2 frames" | — |

**Tally: r4 1 / 6 (merge #3: 0 / 6, round 12: 0 / 6), r4b 1 / 6, 2 / 12.** Both wins are crash cells and both are the critic reading a
flaw in the reference window (a ragdoll that "stays glued", a respawn that never comes) — the pattern of rounds 10 and 12 — but on
both the critic also scored our crash as the more physical one (`bike-becomes-debris` 5 vs 2 and 5 vs 4), which merge #3's crash
verdict ("rider and bike stay one rigid object") did not. Confidences 0.55–0.85; ours A 8 (won 1), B 4 (won 1).

### Tells: round 12 / merge #3 vs this round

| tell | merge #3 (0 / 6) | r4 / r4b |
|---|---|---|
| "rider is a frozen pose welded to a bike" / "fixed pose bolted to the frame" (wheelie) | named | **gone** — "rider lean-back is not separable from bike pitch at this scale" (a camera-distance statement) |
| "rider and bike stay one rigid object … nothing tumbles" (crash) | named | **gone** — "rider ejects forward and tumbles as a separate body", `bike-becomes-debris` 5 |
| "rider locked in one pose, zero pitch or suspension response" (world-industrial) | named | **gone** — "rider leans forward and the bike pitches to match the grade"; what remains is "no compression, no settle, no pitch overshoot" |
| "rider frozen" (world-canyon) | named | **still named** ("frozen for the whole clip, torso hung off the side") on the 30 px top-down frame; the probe has the body at std 0.105 rad on this window |
| no settle / no compression / "pitch that parks" | named | **still named** on 8 of 12 (landing, hop, world ×2, wheelie hold ×2, climb, table-top) |
| camera: distant, bolted, unmotivated swing, geometry through the frame | named | **still named** on 9 of 12, plus the two-frame near-plane pop on both b3 cells |
| **new: the landing punch** — "collapses flat onto the tank within 2 frames … snapping upright", "flips in ~3 frames", "sinks below the bars into the bike geometry", "seated to on the ground in ~2 frames" | — | **4 of 12** (landing-snow, e2, face-x1, table-top) — R8's over-F_max excursion (≤ 1.33 s, max 0.128 m / 0.48 rad here) is now the rider tell |
| wheelie "locked to a fixed angle" | (round 12) | still named ×2 (b3 post-landing hold, x1 32° / 1.4 s hold) |

### Open

- **Pillar H stays open at 2 / 12 (1 / 6 on the merge #3 cells).** The rider is no longer the statue; the rider is now the punch. R8's
  item (the thrown-rider excursion after over-F_max landings) is named on every landing-class cell, and the see-saw / climb critics
  could not read the rider at all at 640 px. Camera is the majority tell for the third round (10, 12, 13b).
- **Two round-12 cells could not be rebuilt on R7**: crash-snow (the m2 golden no longer faults) and the h1 wheelie hold (the Rookie
  bot never lifts ≥ 20° for 0.5 s on the wire). The substitutes are stranger crashes (r13 b3 / b2) and x1's hold; re-runs should keep
  these recordings (`harness/out/compare/r13b/plan.json`) so the count stays comparable.
- The b3 wheelie anchor (tick 1503) is a landing that becomes a hold: the critic read "no throttle frame". `battery.mts` reports a
  wheelie whose lift tick equals a touchdown tick; the wheelie-launch cell should exclude those (a `--wheelie-from-ground` filter).
- The two-frame near-plane pop at ~0.37 s / 0.3 s on both b3 windows (x ≈ 165 m and 230 m) is the round-12 tell (4), still present.

## Round 13 (physics R7) — strangers on the held rider: b1–e3 on the Rookie (the tier's default), src 605a8174, one fresh stranger per track

Rule 1 of `docs/tasks/blender-branch-merge.md`: a dynamics change needs a stranger re-run on b1–e3 in band. Physics R7
(the linkage couple that holds the rider body, the exported `riderBody`, the intent gates (a)–(d); `physics.md` v2 status
R7) is that change. Six sessions, `prep --round r13 --agents s1`, prompt = `run-stranger.md` block verbatim, spawned in
parallel (loadavg ~10); every session cleared, 0.8–2.9 min wall, 11–22 calls. **n = 1 per track, so every verdict is
INSUFFICIENT** (min 2) — the numbers are attempts vs `meta.attemptsBand`, not a judgment; the parent decides whether to
run the second stranger.

| track | band | asserted | attempts | vs band | time | calls | died at | what the stranger said |
|---|---|---|---:|---|---:|---:|---|---|
| b1-first-ride | 1–1 | 1 ≤ med ≤ 1.5 | **2** | **above the limit** | 51.4 s | 15 | 485 m | the "brake before the hump" hint: a plain `b` from 15 m/s on the flat pitched the bike over the bars in half a second (the only fault); the hump was harmless at 9 m/s braking with the weight back |
| b2-lean-back | 1–2 | 1 ≤ med ≤ 3 | 3 | at the limit (above the authored top) | 55.1 s | 21 | 27 m (drum), 288 m | leaning back into the first drum row at 12 m/s looped; leaning back off a drop while the nose was still up from the two-tier step-up looped — shove the nose down after each step-up, take the drops on plain coast |
| b3-kicker-row | 1–2 | 1 ≤ med ≤ 3 | 2 | in band | 45.7 s | 20 | 243 m | the bumpy run-in to the big kicker at ~220 m: the rollers pitched the nose up and a held lean-forward carried into the air flipped it; on the Rookie the lean-forward swung the nose past level on every longer flight — one tap at most, then coast |
| e1-uphill-weight | 2–4 | 2 ≤ med ≤ 6 | 2 | in band | 66.8 s | 22 | 86 m | holding lean-forward past the first crest launched a nose-down full flip; every later climb gas-to-the-face, lean-forward on the slope, released at the crest; the fourth hill still lands at −54° |
| e2-rear-wheel-first | 3–5 | 3 ≤ med ≤ 7.5 | 2 | **under band** | 51.3 s | 21 | 320 m (ramp) | the 1.5 m drop-gap lip after CP2 (~305 m): a lean-back on the slot the bike left the kicker with the nose already 20° up spun a 129° loop; ride the lip weight-forward, coast off, lean back one slot once airborne |
| e3-stairway | 3–6 | 3 ≤ med ≤ 9 | 1 | **under band** | 40.8 s | 11 | — | trusting the briefing over the card's "brake down": plain full gas neutral through every stair flight, hump and the hazard pit cleared it first time |

Against round 3 / 4 / 6 on the same tracks (Rookie, R3–R5 physics): e1 5–15 → 2, e2 4–7 → 2, e3 1–20 → 1, b-tracks 1–3 → 2–3.
Three of the six first attempts were lost to the same thing — a lean held through a lip or a drop looping the bike
(b3 243 m, e1 86 m, e2 320 m) — which is R7's envelope change (2) ("a hop must finish with its tuck; a +1 held through the
flight noses over") read by players; b1's one fault, a plain brake from 15 m/s on the flat going over the bars, is not
R7's: benched on HEAD's R6 physics (`git archive` copy) and on R7, full brake at lean 0 from 10 / 15 m/s on the flat
endos in 1.5 / 1.4 s on both classes (R6 1.48 / 1.36 s, R7 1.47 / 1.37 s; −117° / −135°), lean −0.5 or −1 stops in
1.0–1.7 s at ≤ 8° nose-down — a standing envelope item for the physics owner (the card's hint says "brake", the bike
needs the weight back). Recordings: `harness/inputs/<track>/stranger-<track>-r13-s1-20260915-203701.json`
(not browser-replayed this round); reports `harness/out/metrics/<track>.stranger.{json,md}`.

## Round 12 status — the v0.2.0 candidate battery is run: ours 5 / 36 (manoeuvre 2 / 22, world 1 / 8, audio 2 / 6; two climb cells unfillable), the tell on 18 pairs is a camera that owes nothing to the bike; the R6 Pro re-proved on 17 of 19 goldens (x1 / x3 cracked, e1 / x2 wall the bot); strangers on the R6 Pro: h1 8 · h3 10 UNDER band, x1 34.5 PASS, h2 and x3 FAIL on one DNF each; the fingerprint hashes only what the sim imports

**Finding.** The P5 proxy for v0.2.0 ran for the first time, on HEAD 682d05c at `high` against the reference corpus, 36 of 38 pairs
(24 manoeuvre cells → 22: no matrix track holds a ≥ 30° face for 0.6 s, so climb-industrial / climb-nightcity have no clip, and the
canyon / snow climbs are 0.41–0.46 s at 40–45° "RELAXED" cells; 8 world; 6 audio). One fresh critic per pair, sides by seed (ours
was A 18 times, B 18 times), answers sealed, rubric `RUBRIC.md`: **ours 5 / 36 — manoeuvre 2 / 22 (hop-industrial, crash-industrial),
world 1 / 8 (world-snow-2), audio 2 / 6 (both landings)**. Every one of the five is a critic reading a flaw in the reference window (a
wheelie hold where a hop was cut, a ragdoll whose respawn falls outside the window, a replay-cam freeze + hard cut, two reference
landing cuts read as "sub-only sine thuds" / "gated stabs"); on the 31 pairs where the reference showed the manoeuvre cleanly the
count is 0. The tells that repeat, counted per pair (`battery-v0.2.0.jsonl`): **(1) the camera is not motivated by the bike — 18 pairs**
("constant-rate orbit indifferent to the jump", "bolted / welded to the bike, the world scrolls at one rate", "top-down framing throws
away pitch, travel and settle", "pulls back in six frames", "a scripted orbit that owes nothing to the bike"); **(2) no compression,
rebound or settle on touchdown and a pitch that parks — 14 pairs** ("the rear touches, the front drifts down at a constant rate and
the bike simply rolls on", "flat pitch through the air", "locks the wheelie to a fixed angle within half a second"); **(3) the rider is a
statue — 9 pairs** ("no lag, no lean-back, no counter-lean", "fully extended on the same frame the bike pitches", and in all three
counted crashes "rider and bike tumble as one welded object, no separation of masses"); **(4) foreground / near-plane geometry crossing
the frame — 6 pairs** ("one-frame dark wedges", "a foreground tree fully hides the bike and its landing", "lost for 0.7 s behind an
un-culled box", one-frame light pops); **(5) the engine is a metronomic pulse train on a pinned fundamental — all 4 audio pairs the
reference took**, the round-11 tell verbatim; the two audio wins are the r4 landing knock ("a textbook suspension hit: +20 dB 60–200 Hz,
a second wheel hit 100 ms later, 175 ms settle" — said of OURS). P5's "two rounds, same tell → change approach" now applies to the
camera (rounds 10, 12) and the rider (rounds 10, 12). **Strangers, round 8, the R6 Pro (`prep` now defaults to the tier's bike):**
h1 **8** (8, 8, 8; band 10–18) UNDER-BAND · h2 **FAIL** (6 DNF at 266 m, 10, 5; band 14–22) · h3 **10** (13, 9, 10; band 18–25) UNDER-BAND ·
x1 **34.5** (15, 54; band 30–45) **PASS** · x3 **FAIL** (26 DNF at 525 m, 23; band 60–80). The 4 m standstill death is gone (0 / 13 first
attempts at `arch @ 3.0 m`, was 9 / 9); what the Pro strangers die on now is the raw air: "any gas or lean held while airborne loops it",
"a lean released as the wheels leave the lip swings the nose the other way". A first hard round of nine sessions rode the **Rookie**
because `prep` defaulted to it (informational rows: h1 5 / 16 / 3, h2 4 / 3 / 3, h3 6 / 21 / 8; x1 10 / 5, x3 13 / 11 — every one under
its band). **Goldens:** `--refresh-goldens --build` restamped all 19 Rookie goldens node == browser (65175e2d → 6412a755; no Rookie hash
moved, as R6 said) and staled all 19 Pro goldens; re-proved 17 (x1 Pro 2 / 60.917 s and x3 Pro 2 / 52.325 s — the round-11 walls are
gone), **e1 Pro walls at 220.5 m on three seeds and x2 Pro at 442.9 m (the drum)**. **Gate 22 / 26 NO-SHIP** (the three SwiftShader rows at
loadavg 65 + the reflex row), Pro clears pinned on the R6 Pro. **`srcFingerprint` narrowed** to what the sim imports; it caught two
non-physics moves this round (a core hook-type edit, a new-track commit) and a stale-alias table keeps every proven session counted.
Timelapse 140 → 153, `progress-wave4.mp4` 30.0 s / 19.6 MB.

| piece | as built |
|---|---|
| **battery** (`compare/battery.mts`, new; `battery.test.ts` 7 cases) | replays a recording in node and prints the manoeuvre anchors — wheelie (rear down, front up, pitch ≥ 20° for ≥ 0.5 s), hop (both wheels off a near-flat surface, air 0.2–0.7 s, apex < 1.2 m), landing (touchdown after ≥ 0.8 s air), crash (fault tick), climb (rear-wheel trajectory ≥ 30° for ≥ 0.6 s; `--climb-deg/--climb-hold` survey flags), flight (air ≥ 1.0 s); `out/compare/battery/{plan,plan-c,cells,pairs}.json`, `manifest.{json,md}` (cell, track, recording, anchor tick / s, ref, ref anchor, tag, seed, pairId, note — no side information), `refcuts/` (five pre-cut world reference windows). Captures `out/capture/battery/<cell>/` at `high` 1280×720 @ 60, 4.0–4.3 s, anchor + 2.5 s ≤ length (the round-10 rule), 250–520 s wall each at loadavg 55–87. Pairs by `pair.ts --mask --align`, seeds 1201–1232 in matrix order. Record: `out/metrics/battery-v0.2.0.jsonl` (38 rows: pick, unmasked winner, ours side, confidence, the tell, the reasons, criteria, cell metadata; two `unfilled` rows). |
| **audio A/B** (`compare/audio.ts`) | `--lowpass <Hz>` (default **14000**, `0` = off): `lowpass=f=N` on BOTH sides before the loudness measurement and the gain, so the −23 LUFS match holds on what the critic hears and round 11's codec tell (ours has a 20 kHz floor, the captures brick-wall at 12–14 kHz) is gone; `lowpassHz` in the printout and the result. Six pairs `--coin balanced --seed 1211` on the r4 beats. |
| **fingerprint** (`lib/metrics.ts`, `metrics.test.ts` new) | `simFingerprint(root)` hashes `src/physics/**`, `src/tracks/**`, `src/game/rules.ts` and only the three runtime core modules `hash.ts` / `replay.ts` / `rng.ts` (not `types.ts`, `loop.ts`, `index.ts`, `.d.ts`, `.test.ts`); `SIM_IDENTICAL_STAMPS` maps the current stamp to earlier stamps proven sim-identical (a golden restamp node == browser, or a recording replay); **`fingerprintMatches(stamp, fp)`** is the comparison in `golden.ts` (stale / restamp), `stranger/report.ts` (stale rows), `reflex.ts` (row carry-over), `gate/ship-gate.ts` (fresh stranger / reflex rows). Table: `7e836cbe` (HEAD 88401ed) ← `817dddd2` (682d05c under this hash), `6412a755` / `6f0cbe22` (682d05c under the old hash, the second with +15 hook-type lines in `types.ts`), `2e249552` / `d3f20790` (two working-tree states of fa62eae; the x3 p2 recording replays to `5bd588d5cec2a135` on 682d05c and 88401ed, node == browser). The test proves a `types.ts` / `loop.ts` / `.d.ts` / `.test.ts` edit leaves the stamp alone and a physics / track / rules / runtime-core edit moves it. |
| **stranger bike default** (`stranger/cli.ts` `bikeForTrack`) | `prep` and `start` without `--bike` ride `defaultBikeForTier(track.tier)` — Rookie on beginner / easy, Pro on hard / extreme (the menu's default, the class the band and the report assume); `--bike` still overrides. `README.md` §0 and `run-stranger.md` say so. Round 12's first nine hard sessions and four extreme sessions rode the Rookie because the old default was Rookie. |
| **stranger briefing** (`PROTOCOL.md`, the card in `cli.ts`) | the Pro paragraph is R6: plain `g` from rest lifts to ~30° and rides a power wheelie down (no loop); `gb` from rest loops in ~0.6 s, a quarter lean-back in 1.4 s; in the air the Pro is raw and a lean press first swings the nose the *other* way for one slot (`lb` dips −10° in 0.1 s before it lifts) — judge a lean by its second slot, prefer one held lean to a tap train. Card line: "Pro (wheelie ECU on the ground, raw in the air — the loop is yours at every lean and every airborne gas; 22 m/s top)". |
| **shared checkout** | `scratchpad/harness11/frozen` = `git archive 682d05c` + `pnpm install --offline`, `VERCEL_GIT_COMMIT_SHA` exported for the build (goldens, re-prove lanes, gate, matrix, battery captures, the x3 replay proof); strangers in MAIN (PROTOCOL's `cd`). MAIN's `src` was edited by three owners during the round: `types.ts` (+15, moved the old-hash stamp), `courses/playgrounds.ts` (mid-write it was a missing module for ~4 min and every stranger command in MAIN threw — three extreme sessions lost clock, then HEAD moved 682d05c → 88401ed), `harness/trailer/features.ts` (another owner's in-flight edit; `pnpm typecheck` fails on it and on `playgrounds.ts:22` — not this round's files). |

### Goldens, skill 3, one seed, browser-verified, frozen 682d05c (src 6412a755 old hash = 817dddd2 new hash), loadavg 9–20

`--refresh-goldens --build` (17 s): **fresh 0, restamped 19** (every `bot-3.json`, 65175e2d → 6412a755, node == browser; finish times
byte-identical to round 11 — flat 8.567, gap 5.742, b1 41.558, b2 38.417, b3 33.067, e1 55.192 / 3, e2 44.175, e3 39.558, m1 34.583,
m2 49.283 / 2, m3 45.567 / 2, h1 50.508 / 2, h2 45.667, h3 47.125, x1 54.600, x2 56.767 / 3, x3 44.450, labs 8.217 / 12.608), **stale 19**
(every `bot-3-pro.json` "no longer finishes": the R6 Pro carries the ECU on the ground, so every Pro recording where the front topped
out under gas diverges — flat at 2.4 m, b1 at 238 m, e1 at 24.9 m, x1 at 13.2 m …). Re-proved (`harness:bot <t> --skill 3 --bike pro`,
extreme `--max-sim-seconds 1800 --track-wall-s 900`), every one `verified=true`: flat 1 / 8.400 `53d5e2de0447d118` · gap 1 / 5.683 · b1
1 / 39.092 `43b27d8e8dc0f1cb` · b2 1 / 36.842 · b3 1 / 31.358 · e2 2 / 48.400 · e3 (lane A, proven) · m1 1 / 32.767 · m2 1 / 37.558 ·
m3 1 / 38.167 · h1 2 / 52.150 · h2 1 / 41.808 · h3 3 / 57.908 · **x1 2 / 60.917 `8cabb0b28f467b55`** (round 11: 50 attempts at 447.8 m)
· **x3 2 / 52.325 `6dafbfdf275e4718`** (round 11: 50 at 72.2 m) · lab-physics 1 / 8.217-class · lab-flat-200 proven. **Not re-proved:
e1 Pro — seeds 847839319 / …320 / …321: 37 / 29 / 50 attempts, all `crash @ 220.5 m (ground)`, maxX 323.1 (59 %), 900 s wall each; x2
Pro — 50 attempts, 79 %, `crash @ 442.9 m (drum @ 442.2)`** (a 3-seed retry ran into the retire; log `scratchpad/harness11/logs/reprove-D.log`).
36 golden files changed in `harness/inputs/` (19 restamps + 17 re-proofs); e1 / x2 Pro keep their 65175e2d stamps.

### Ship gate (`harness:gate --pin --heap-seconds 60`, frozen 682d05c, loadavg 17 at boot → 65 at the end: 13 strangers, three SwiftShader captures and the timelapse shared the box)

**22 / 26 NO-SHIP, wall 1865 s** (round 11: 24 / 26 at loadavg 9–31; the two extra fails are SwiftShader wall rows under 3× the load).
boot.readyP50 113.9 ms (limit 300; 104 / 114 / 181 / 113 / 137) · **firstFrame 9564 ms FAIL** (SwiftShader, informational; 3468 in round 11)
· clear.golden / bitEqual / hashOk PASS (`b002d139195b5757`) · **clear.pro.flat PASS `53d5e2de0447d118` · clear.pro.b1 PASS `43b27d8e8dc0f1cb`
(re-pinned on the R6 Pro, `expected.json` 6 lines)** · crash.faultWithinS 0.75 s · fault.toControlMs 50 ms (auto-respawn 1042 ms) ·
restart.ticks 1 · restart.wallMsP95 0.17 ms · **restart.frameMsP95 641 ms FAIL** (SwiftShader) · restart.noCountdown 1 tick · heap −5.38 MB
/ 60 s · draw calls 187 (198) · triangles 156 717 · textures 76.9 MB · physics 32.5 µs/tick p95 · renderSubmit 2.92 ms · **renderSynced
20 655 ms FAIL** (SwiftShader) · bundle 469.3 KB gz (dist 17 474 KB) · determinism 9 / 9 · camera.box PASS 0 / 681 riding frames, clamped
28.2 % (924 s at that load) · stranger.medianAttempts "no armed track" (the frozen tree's `out/metrics` predates this round's sessions;
MAIN's reports are below) · **reflex.medianAttempts FAIL b1 1 / 1.5 · b2 2 / 3 · b3 4 / 3 · e1 8 / 6** (unchanged since round 9) · reflex
Pro informational **b1 2 · b2 2 · b3 9 · e1 17** (round 11: 2 · 7 · 12 · 50 — the R6 Pro). Log `scratchpad/harness11/logs/gate.log`, report
`out/metrics/ship-gate.json`, `out/gate/`.

### Stranger round 8 — hard and extreme on the R6 Pro (the tier's default), src 817dddd2 / 7e836cbe; prompt = `run-stranger.md` block verbatim; loadavg 20 at spawn, 50–80 during

| session | bike | attempts | cleared | time | calls | wall | died at | what the stranger said |
|---|---|---:|---|---:|---:|---:|---|---|
| h1 p1 | Pro | 8 | yes | 128.4 s | 56 | 11.8 min | 172, 183, 219 (gap), 223 (gap, hazard), 216 (gap), 365 (gap), 512 (gap) | the roof-edge drops onto the slot rows: `wh` off the 1.5 m ledges pumped the nose to 80°+ in the air (three loops); the slots are ridable on two wheels at 8+ m/s — the killers are a stopped wheel over a slot and the roof stairs above ~10 m/s |
| h1 p2 | Pro | 8 | yes | 153.6 s | 51 | 16.1 min | 106, 107, 217 (gap), 232 (gap, hazard), 355 (gap), 521 (gap, hazard), 556 | the pit rows after each rooftop drop: `wh` overshoots or bleeds all its speed entered off a landing; arrive at 8+ m/s nose up, brake-tap on touchdown to knock the wheelie back to ~30°, then let `wh` hold it at 5–7 m/s |
| h1 p3 | Pro | 8 | yes | 150.8 s | 57 | 14.9 min | 101, 175, 174, 547, 532 (gap) ×2, 558 | the third lip's 1.5 m drop into a 20 m hazard-slot row launches the wheelie past 50°, where `wh` bleeds the speed and the Pro loops at a crawl (four faults); coast the drop with no lean, start `wh` after touchdown |
| h2 p1 | Pro | 6 | **no** (266 m of 637) | — | 54 | 17.5 min | 81 (gap), 73 (ramp), 266 (ramp), 265 (gap, hazard), 245 (ramp) | the second gap chain after CP1: 6 m platforms too short to rebuild speed, the bike bounces airborne 2–3 slots after every touchdown so any lean-forward under gas nose-dives, the pits end in a vertical wall — gave up |
| h2 p2 | Pro | 10 | yes | 162.9 s | 79 | 17.6 min | 86 ×2, 84, 100, 97, 355, 361, 254 (gap), 257 (ramp) | any lean tap or full gas at low speed after a landing swung the nose into a loop or a nose-dive; carry speed and overfly every second kicker |
| h2 p3 | Pro | 5 | yes | 82.0 s | 28 | 7.9 min | 257 (ramp), 260 (box), 267 (ramp), 285 | the chain at 214–268 m punishes speed: at 14 m/s a flight overshot onto the next kicker's face and looped; thread the five gaps at 8–11 m/s, coast every flight |
| h3 p1 | Pro | 13 | yes | 181.7 s | 66 | 16.0 min | 99, 69, 250 (ledge), 262, 255, 295, 370 (ramp), 383 (restart), 506 (ledge), 492 (ramp), 503 (ledge), 504 (restart) | the two-tier 0.45 + 0.5 m ledge at 505 / 508 m after the fifth fire jump, invisible at the ASCII row resolution: the Pro loops the instant it is airborne under gas, so every hop had to be a crawl |
| h3 p2 | Pro | 9 | yes | 102.8 s | 51 | 14.8 min | 84, 235 (ramp, hazard), 406 (arch) ×2, 410 (arch), 408 (arch), 341, 470 (ramp) | the fourth fire pit (393–400 m): off the lip at the same ~12 m/s and attitude as pits 2–3 the bike is thrown into a violent pitch rotation no lean or brake counters; cleared when a full backflip completed before touchdown |
| h3 p3 | Pro | 10 | yes | 127.3 s | 60 | 14.3 min | 81, 68, 71, 235 (ramp), 514, 508 (ledge), 506 (ledge), 507 (ledge), 506 (ledge) | the knee-high ledge at ~505 m: the speed bump in front of it kills any fast approach; the hop only works started ~1 m before the face at ~6 m/s (5 of 9 faults) |
| x1 p1 | Pro | 15 | yes | 162.2 s | 62 | 17.1 min | 6, 32 (plank) ×2, 43 (ramp), 36 (box), 114 (pole) ×3, 235 (restart), 424 (pole), 432 (box), 427 (pole), 480, 406 | the pillar-cap rows: the rear drops into the first slot or the front slams the raised third cap; a ramp-hop landing onto the first cap with the front lifted carried it across; the 45° faces need ~10.7 m/s at the foot, weight forward, lean released one slot into the crest flight |
| x1 p2 | Pro | 54 | yes | 618.8 s | 328 | 66.2 min | 45–57 ×8 (ramp / ground), 86–92 ×3, 113–114 (pole) ×2, 111 (gap, restart), 245–270 ×9 (ramp @ 249–251 ×4), 354, 472, 428–429 (pole) ×6, 530–535 ×11, 605 ×3 … | the plateau after each 45° climb: the crest launches the Pro into a rear-wheel balance that any gas or coast tips into a loop, and the plateau ends in an invisible dip-and-lip that front-flips at speed and loops at a crawl; ~40 of 53 faults finding the one line |
| x3 p1 | Pro | 26 | **no** (525 m of 569, all six CPs) | — | 136 | 50.0 min | 85 (box), 192 (ledge), 196 (gap), 220 (ramp), 244, 302 (wall), 297 (ramp), 301 (wall, restart), 312 (gap), 506 (box), 520 (arch) ×3, 516 (arch) ×2, 514 (arch), 524 (pole), 524 (restart), 525 (pole), 523 (pole), 505 (box) ×2, 511, 525 (pole) | the final stack after the 4 m face: raw in-air pitch off the crest, a hidden launch pad on the plateau at ~516 m that throws the bike up with no input, then a bridge of free-spinning drums over a hazard pit with zero traction — every crossing stalled or looped at the same gap between drums 2 and 3 |
| x3 p2 | Pro | 23 | yes | 220.5 s | 88 | 33.6 min | 80 (box), 193 (ledge), 196 (gap) ×2, 198 (gap, hazard), 192 (ledge) ×2, 194 (ledge), 291 (ramp), 284, 307–315 (gap) ×5, 361 (ramp), 444 (ramp, hazard), 469, 513 (arch), 511 (arch), 536 | the platform-into-hazard-trenches after the see-saw (~10 attempts): the ramp top has a knee-high lip (a hop, not speed) and the trenches must be crossed with the front held up after a rear-first landing |

Rookie, informational (the first hard round; `prep` defaulted to Rookie): h1 **5 / 16 / 3** (61.7–244.7 s), h2 **4 / 3 / 3**, h3 **6 / 21 / 8**,
x1 **10 / 5**, x3 **13 / 11** — 13 / 13 cleared, every median under its band (h1 5, h2 3, h3 8, x1 7.5, x3 12). The harness CLI in MAIN
was down for ~4 min mid-round (the tracks owner's `playgrounds` module missing); x1 p2 / x3 p1 / x3 p2 lost that clock and two calls each.

| track | band | asserted (Pro) | n | cleared | median attempts | median time | median calls | verdict | Rookie (informational) | reflex `average` (Rookie / Pro) |
|---|---|---|---:|---:|---:|---:|---:|---|---|---|
| h1-wheelie-wire | 10–18 | 10 ≤ med ≤ 27 | 3 | 3 | **8** (8, 8, 8) | 150.8 s | 56 | UNDER-BAND (was 16 PASS on the r11 Pro) | 5 (5, 16, 3) | 25 / 26 |
| h2-gap-chain | 14–22 | 14 ≤ med ≤ 33 | 3 | 2 | **6** (6 DNF, 10, 5) | 122.5 s | 54 | **FAIL** (a counted session did not clear; was 10 UNDER) | 3 (4, 3, 3) | 46 (2/3) / 51 (1/3) |
| h3-fire-line | 18–25 | 18 ≤ med ≤ 37.5 | 3 | 3 | **10** (13, 9, 10) | 127.3 s | 60 | UNDER-BAND (was 16 UNDER) | 8 (6, 21, 8) | 7 / 24 |
| x1-vertical-limit | 30–45 | 30 ≤ med ≤ 67.5 | 2 | 2 | **34.5** (15, 54) | 390.5 s | 195 | **PASS** (was 18.5 UNDER) | 7.5 (10, 5) | 21 (9/9) / 51 (4/9) |
| x3-gauntlet | 60–80 | 60 ≤ med ≤ 120 | 2 | 1 | **24.5** (26 DNF, 23) | 220.5 s | 112 | **FAIL** (was 19 UNDER) | 12 (13, 11) | 34 (6/9) / 51 (3/9) |

**Death table for the tracks owner (Pro, counted sessions, 5 m bins).** h1 (21): 215 ×2, 105 ×2, 175 ×2, 530 ×2, 170, 185, 220, 225, 365,
510 … — spread across the slot rows, no single sink (round 11's `gap @ 362.3 ×10` is gone: 355 ×1, 365 ×1). h2 (18): **265 ×3 + 255 ×3 +
245 (the climbing chain's third platform: 7)**, 85 ×3 + 80 + 75 (chain A: 5), 100, 95, 355, 360 — the same two sinks as round 11, and
the DNF sat in the first. h3 (29): **505 ×6 (the two-tier ledge after the fifth fire jump, "invisible at the ASCII row resolution" — the
round-10 / 11 `view.ts` glyph item a third time)**, 70 ×3, 235 ×2, 405 ×2 + 410 ×2 (the fourth fire kicker), 100, 250–260 ×3, 295 …
x1 (67): **430 ×9 (the poles @ 428.9)**, 530 ×6 + 535 ×5 (the third plateau's dip-and-lip), 115 ×5 (pole @ 114), 250 ×4 (face 2), 45–55
×9 (face 1's approach), 605 ×3, 30 ×2. x3 (47): **195 ×5 + 190 ×3 (the hop ledge @ 192.9, the reflex bot's `stuck-restart` site)**, 525
×5 + 520 ×3 + 515 ×4 + 510 ×2 + 505 ×3 (the drum bridge / arch stack at 505–525: 17, both sessions), 310 ×4 + 305 ×2 + 300 ×2 (the gap
after the see-saw). For the tracks owner: h1 and h3 are under their bands on the default bike (8 vs 10–18, 10 vs 18–25) — bands or
tracks; h2's second chain (245–268 m) and x3's drum bridge (516–525 m: "a hidden launch pad on the plateau at ~516 m that throws the
bike up with no input", then "drums with zero traction") each ended a session; x1 is in band with a 15 / 54 spread (n = 2). For physics:
the Pro's raw air is now the whole story of every hard / extreme fault list ("any gas or lean held while airborne loops it").

### Blind audio A/B round 2 (P6) — six `apair-` pairs on the r4 beats, one fresh critic each, `--coin balanced --seed 1211`, 14 kHz low-pass both sides, −23 LUFS

r4 beats table (changed from r3): start −19.0 dBFS / 474 Hz centroid (r3 −18.2 / 310; ref −23.8 / 370 and −21.3 / 597) · wheelie −20.0 /
234 (r3 −29.7) · landing −22.1 / 368 (r3 −24.7 / 272; ref −28.8 / 153, −26.2 / 287) · crash −23.6 / 279 (r3 −26.2). Sides: ours = A on
wheelie ×2 and start, ref = A on landing ×2 and crash.

| pair | A | pick (real) | right? | conf | the tell (verbatim `nonAAA`) |
|---|---|---|---|---:|---|
| wheelie-02 | ours | B = ref | yes | 0.80 | "A is a metronomic ~14 Hz click train ringing a resonance locked at ~100 Hz for the entire clip, with nothing above 1 kHz and no pitch or timbre movement, where a held wheelie should surge and sag every half second and brighten on each surge." |
| wheelie-05 | ours | B = ref | yes | 0.80 | "A's engine is a single harmonic stack pinned at 106 Hz for seven seconds with a metronomic 14 Hz pulse train and no timbral change under its level dips - a static synth loop, not an rpm that is being feathered." |
| landing-2m-12 | ref | **B = ours** | **no** | 0.80 | (against the reference) "A's landing is a run of pure sub-60 Hz sine thuds with the 60-200 Hz compression knock and the metallic tick 20-30 dB below or absent, i.e. a low oscillator with a gain envelope rather than a suspension bottoming out." — of ours: "a textbook suspension hit: the 60–200 Hz band jumps −35 → −14.8 dB in 25 ms, a 200–2 kHz knock, a second wheel hit at 5.375 s, back to −29 dB by 5.45 s (~175 ms settle)"; still noted "A is effectively mono (L/R 0.99)" — of the reference cut |
| landing-2m-14 | ref | **B = ours** | **no** | 0.78 | (against the reference) "A's engine is a dead-center mono, pitch-locked pure harmonic stack (152 Hz held to within a hertz with exact integer partials) that switches off between events instead of a continuous combustion-pulse bed that loads and unloads through the landing." — of ours: "a continuous combustion-pulse texture (27.1 ms, 36.9 Hz, r = 0.72), inharmonic partials, fundamental climbs 99 → 135 Hz then drops to 66–83 Hz at the thump (+18 dB, −20 dB in 240 ms)" |
| crash-respawn-04 | ref | A = ref | yes | 0.76 | "B's respawn engine is a pitch-locked 106 Hz harmonic stack chopped by a metronomic 12.5 Hz amplitude pulse (80 ms +-2 ms) with almost nothing above 2 kHz and no crank or rpm climb, appearing at full steady idle in its first 80 ms." (+ "a two-note synth chime 1250 / 2000 Hz repeated identically twice", "3 + 4 evenly spaced identical thuds after a linear −33 dB/s engine fade") |
| start-gate-01 | ours | B = ref | yes | 0.80 | "A's idle is a perfectly periodic 12.0 Hz combustion pulse on a fundamental pinned to 106.7 Hz with no cycle-to-cycle jitter and nothing above 4 kHz, the fingerprint of an oscillator, not a recorded engine." (+ "countdown pings at 1.004 / 2.004 / 3.003 s, 587 / 587 / 1175 Hz sine-like, L/R 0.95–1.00") |

**Tally: ours 2 / 6 (round 11: 1 / 12).** P6's done line (≥ 2 / 6) is met on the count; the honest read is that the r4 landing knock is
real (both landing critics measured a two-stage 60–200 Hz knock with a settle on OUR side and named the reference cuts' mono, gated
engine as the synth) while **the engine tell is unchanged and unanimous on the four engine beats: a metronomic 12–14 Hz pulse on a
fundamental pinned at 100–107 Hz, no per-cycle jitter, no rpm motion, nothing above 1–4 kHz** — round 11's list (1), (3) verbatim; the
stereo tell moved from "near-mono 0.99" to "a decorrelated widener (L/R 0.59–0.62, side/mid 1.0–1.13) rather than a placed mix"; the
respawn now names a synth chime and a linear gain fade instead of the r3 re-trigger. The 14 kHz tell did not appear.

### The 38-pair battery (P5's v0.2.0 proxy) — HEAD 682d05c at `high`, 30 video + 6 audio pairs, `out/metrics/battery-v0.2.0.jsonl`, manifest `out/compare/battery/manifest.md`

| category | ours / n | cells |
|---|---|---|
| manoeuvre — wheelie | 0 / 4 | industrial ref · canyon ref · snow ref · nightCity ref |
| manoeuvre — hop | 1 / 4 | **industrial ours** (ref window: a rear-wheel hold, "never hops") · canyon ref · snow ref · nightCity ref |
| manoeuvre — landing | 0 / 4 | industrial ref · canyon ref · snow ref · nightCity ref |
| manoeuvre — crash | 1 / 4 | **industrial ours** (ref window: the ragdoll never respawns) · canyon ref · snow ref · nightCity ref |
| manoeuvre — climb | 0 / 2 (+2 unfilled) | canyon ref (RELAXED 0.46 s @ 40°) · snow ref (RELAXED 0.41 s @ 45°) · industrial / nightCity: no ≥ 18° upslope held 0.5 s on b1 / b3 / h1 / h2 / h3 |
| world | 1 / 8 | industrial 0 / 2 · canyon 0 / 2 · **snow 1 / 2** (world-snow-2: the reference window was a crash + freeze + cut) · nightCity 0 / 2 |
| audio | 2 / 6 | wheelie 0 / 2 · landing 2 / 2 · crash 0 / 1 · start 0 / 1 |
| **total** | **5 / 36 judged (5 / 38 with the two unfilled)** | by biome: industrial 2 / 7 · canyon 0 / 8 · snow 1 / 8 · nightCity 0 / 7; sides: ours A 18 (won 0), ours B 18 (won 5); confidences 0.55–0.90 |

Per-pair picks and tells (the sealed side, the critic's pick, the unmasked winner, `nonAAA` verbatim): `out/metrics/battery-v0.2.0.jsonl`;
the same table prints from `scratchpad/harness11/battery_tally.py`. The repeated tells, each quoted from ≥ 3 pairs, for the render /
camera / rider owners (the P5 rule: rounds 10 and 12 name the same camera and rider tells, so the next round is a different approach):

1. **Camera (18 pairs).** "one slow constant orbit indifferent to the jump" (flight-industrial) · "pans at roughly constant speed through
   the takeoff, apex and landing instead of leading, widening or dipping with the bike" (flight-canyon) · "a locked overhead follow that
   scrolls at constant speed regardless of what the bike does … a token sliding over a map" (hop-canyon) · "near top-down framing throws
   away every landing tell - pitch, suspension travel, settle and rider lag are all invisible" (landing-canyon) · "a slow scripted camera
   orbit that owes nothing to the bike" (hop-snow) · "pulls back from a bike-sized framing to a wide high-angle shot in ~6 frames …
   lets a foreground tree occlude the landing entirely" (wheelie-snow) · "loses the subject entirely for ~0.7 s behind un-culled
   foreground geometry and then makes an unmotivated side-to-overhead sweep" (flight-nightcity) · "bolted to the bike with no lead or
   ease — a cursor on a scrolling background" (world-canyon-1) · "welded to the bike: the world scrolls at one constant rate" (world-
   nightcity-2) · "effectively bolted to the bike" (world-nightcity-1) · "keeps zooming out for a second and a half after the cut while
   the bike sits frozen" (crash-canyon) — plus landing-snow, hop-nightcity, landing-nightcity, flight-snow, climb-snow, world-snow-1,
   world-industrial-1.
2. **No compression / rebound / settle; a pitch that parks (14 pairs).** "the rear touches, the front drifts down at a constant rate for
   ~0.4 s and the bike simply rolls on with no compression, rebound or camera response" (landing-industrial) · "the pitch snaps to its
   airborne angle right off the lip … no visible rebound on the rear-first touchdown" (flight-industrial) · "flies and lands like a
   rigid sprite on a curve — flat pitch through the air, a drop landing with no squat, rebound or settle" (hop-snow) · "locks the wheelie
   to a fixed angle and freezes the rider pose within half a second of launch; the pitch reaches its target with no overshoot" (wheelie-
   nightcity) · "parked upright on the lip for a fifth of a second before it drops … compression-free touchdown" (landing-nightcity) ·
   "coasts nose-up at nearly constant height and pitch for a second and a half" (climb-snow) · "floaty for its height and its landing
   is inert" (flight-snow) · every world pair: "never loads or unloads — no squat on throttle, no overshoot, no settle".
3. **The rider is a statue; in a crash rider and bike are one body (9 pairs).** "a statue — no lag, no lean-back, no counter-lean"
   (wheelie-canyon) · "a rigid mannequin: pitch changes on the ramp and in the air without any matching lean" (climb-canyon) · "the rider
   never moves on the bike" (flight-industrial) · "welded to the bike so the flight has no secondary motion" (flight-canyon) · "reaches
   full lean-back on the same frame the bike pitches" (wheelie-snow) · "rider and bike tumble as one welded object with no independent
   momentum, which is the single biggest 'prototype' tell" (crash-canyon) · "the rider never leaves the bike and the pair pops out of
   existence two frames before the cut" (crash-snow) · "the rider never leaves the bike, the pair comes to rest in ~2 frames with no
   settle or dust" (crash-nightcity).
4. **Geometry crossing the frame; one-frame pops (6 pairs).** "two isolated one-frame dark wedges crossing the frame" (wheelie-
   industrial) · "a black near-camera wedge (overhead beam clipping the near plane) sweeps across the whole frame in two frames" (world-
   industrial-2) · "a foreground tree sweeps across the frame and completely covers the bike" (world-snow-1) · the tree in wheelie-snow,
   the box in flight-nightcity, "orange glows appear and vanish for single frames" (crash-nightcity).
5. **Audio: the engine (4 / 4 engine pairs)** — above.

What the critics credited on our side, for the record: dust at the rear patch 2–3 frames after touchdown (landing-industrial, flight-
industrial, flight-canyon — round 10's missing cue is present), the crash-to-control span ("moving 6 frames after impact", crash-
nightcity; "hard cut … no fade", every crash), rear-wheel-first landings on every landing / flight pair, and the r4 landing knock.

### Reflex matrix on HEAD (`--all-tracks --bike both --skill novice,average,good --seeds 3 --noisy … --noisy-seeds 9`, 600 s / extreme 1800 s), frozen 682d05c, 85 s wall at loadavg ~10

**Rookie `average` is byte-identical to round 11 on every track** (same seeds, same physics: the R6 change is Pro-only, the goldens
said so first) — b3 4 (3, 4, 6) · e1 8 (6, 10, 8) · e2 8 (9 / 9) · e3 2 · m1 9 · m2 8 · m3 21 (6 / 9) · h1 25 · h2 46 (2 / 3) · h3 7 ·
x1 21 (9 / 9) · x2 28 (6 / 9) · x3 34 (6 / 9). **Out of band (Rookie `average`): b3 4 / 2 · e1 8 / 4 · e2 8 / 5 · m3 21 / 12 · h1 25 / 18 ·
h2 46 / 22 = 6 over band (unchanged), x1 21 under 30–45, x2 / x3 in band on 6 / 9 clears.** The Pro `average` row is the R6 Pro and
moved everywhere: b1 2 → 2 · b2 7 → **2** · b3 12 → **9** · e1 50 → **17** · e2 29 → **20** · e3 14 → **2** · m1 25 → **11** · m2 21 → **11** ·
m3 51 → **13 (8 / 9)** · h1 51 → **26 (3 / 3)** · h2 51 → 51 (1 / 3) · h3 51 → **24 (3 / 3)** · x1 51 (0 / 9) → 51 (4 / 9) · x2 51 → 51 (2 / 9)
· x3 51 (0 / 9) → 51 (3 / 9). Full tables with every death rule in `out/metrics/reflex.md` (38 `*.reflex.json`, copied from the frozen tree).

### Timelapse

`--since 6053c55 --clips milestones --milestones 0f14d3d,20d463d,c053ac4,18df821,56e3883,2b48370,682d05c`, niced, 46.5 min at
loadavg 50–80 (13 commits built + captured, 222–300 s each): **ledger 140 → 153**, `progress-stills.mp4` 151 stills / 14.2 MB,
`progress-clips.mp4` 30.0 s / 7 milestones (c053ac4 predates the ledger's capture window and renders from its still), gif 13.7 MB.
**`harness/out/timelapse/progress-wave4.mp4`: 30.0 s, 19.6 MB** (crf 22 re-encode of the 26.4 MB render): 0f14d3d loader invariant →
20d463d menu → c053ac4 controls → 18df821 touch invariant → 56e3883 tracks r9 → 2b48370 arms → 682d05c phone-high → 88401ed (the latest,
appended by the renderer).

### Open

- **Battery 5 / 36, and 0 on the pairs where the reference showed the manoeuvre.** Two rounds with the same tell on the camera (10,
  12) and the rider (10, 12): P5 says the next round is a different approach, not a third polish pass. The list above is the brief:
  a camera whose every move is caused by the bike (lead with speed, widen with height, ease, never a constant-rate orbit, never
  top-down over a landing, never through foreground geometry); suspension travel and a damped settle that read at 640 px; a rider
  that lags, leads and separates in a crash. Re-run the identical 36 pairs (same cells, same anchors, same refs — `manifest.json`)
  on the next render / rider round; the number to move is the manoeuvre row.
- **Two climb cells cannot be filled on the r9 curriculum**: no track holds a ≥ 30° face for 0.6 s (the faces are 40–45° kickers left
  after 0.3–0.46 s). Either the tracks owner authors one sustained climb per biome (the reference's quarter-pipe / long plank) or
  the battery's climb row is redefined as "face + crest" (the RELAXED cells).
- **Strangers on the R6 Pro: h1 8 / h3 10 under band, h2 and x3 FAIL on one DNF each, x1 PASS at n = 2 (15, 54).** The 4 m standstill
  death is gone; the raw Pro air is now every fault list. For the tracks owner: h2's second chain (245–268), h3's two-tier ledge at
  505 (invisible on the stranger screen — third round running), x3's 516 m launch pad + drum bridge. For physics: "any gas or lean
  held while airborne loops it" ×5 sessions; x1 p2's "an in-air `bf` is the only thing that reliably drops the nose".
- **Audio 2 / 6**: the engine's metronomic pulse / pinned fundamental is unanimous for the second round (rounds 11, 12 — the P5 rule
  applies to the engine too); the landing knock is done.
- **e1 Pro / x2 Pro goldens stale**: the skill-3 bot walls at 220.5 m (three seeds) and 442.9 m.
- **Reflex out-of-band list unchanged** (Rookie `average`): b3 4 / 2 · e1 8 / 4 · e2 8 / 5 · m3 21 / 12 · h1 25 / 18 · h2 46 / 22; the gate's
  reflex row has failed on b3 / e1 since round 9.
- **The fingerprint is per-tree, not per-track.** Adding a track (fa62eae) moves every session's stamp; the alias table is the
  workaround. The right shape is `physics + rules + runtime core + this track's course file` per recording.
- **Shared-checkout hazards this round**: MAIN's stranger CLI threw for ~4 min on a half-written `src/tracks/courses/playgrounds.ts`
  (three extreme sessions lost clock); `pnpm typecheck` fails on two other owners' in-flight files (`harness/trailer/features.ts`,
  `playgrounds.ts:22`). Strangers should run from a frozen tree too (PROTOCOL's `cd` would need a per-round path).
- Sub-0.5 m ledges invisible on the stranger screen (h3 505 m, again): the `view.ts` glyph item, third round.
- Round 11's items still open: the Pro's first-slot air swing (now in the briefing), audit §3 (the stranger is an AI proxy).

## Round 11 status — the hard tier ridden by strangers for the first time (Pro: h1 16 in band, h2 10 / h3 16 / x1 18.5 / x3 19 UNDER band, 13/13 cleared); the blind audio critic takes the reference 11 of 12 and names one tell — a metronomic, pinned-pitch, mono engine; the stranger verdict is now a census (n, censored, the exact bound); live-keys reflex fixed; goldens re-proved on tracks r9 (x1 / x3 Pro wall the bot)

**Finding.** Stranger round 7 on src `a6d63cfd` (tracks r9; HEAD 56e3883 → 6053c55, fingerprint unchanged), the tier's default
bike (**Pro**, `defaultBikeForTier`), three sessions per track: **h1-wheelie-wire 16 (8, 16, 21; band 10–18) PASS · h2-gap-chain 10
(12, 10, 7; band 14–22) UNDER-BAND · h3-fire-line 16 (16, 18, 14; band 18–25) UNDER-BAND — 9/9 cleared, every median inside the
1.5 × top ship bound, two under the authored floor.** The Rookie's wheelie ECU makes h2 / h3 a 1–13 attempt ride. Every Pro stranger lost
its **first attempt 4 m from the line** (`arch @ 3.0 m` ×9): plain `g` from a standstill loops the Pro (no ECU) in ~6 slots, which
the briefing did not say (it does now). Extreme (Pro, 400-call sessions): **x1 18.5 (11, 26; band 30–45) UNDER-BAND · x3 19 (17, 21; band 60–80) UNDER-BAND**, 4/4 cleared
(three further sessions censored: killed with the API limit mid-ride). Rookie hard (informational): h1 13 (13, 7, 27), h2 2 (2, 1,
4), h3 8 (8, 5, 13). **Blind audio A/B (P6): ours picked as the
real game 1 / 12** (two runs of six: run 1 all coins ours = A, run 2 balanced 3 / 3 — the critics found the reference on either
side, confidences 0.80–0.86; the single pick for ours is a critic reading the reference's gated engine as the synth). The one tell, in every verdict: the engine is a **metronomic combustion pulse train with a pinned
fundamental and exact sidebands — no per-cycle jitter, no rpm motion, near-mono (L/R 0.99), a flat loudness window, and the 2 m
landing is a 20–50 ms click after which the bed gets quieter**. Audit §4 / §6 fixes landed: the stranger report is a census with a
tri-state verdict and the exact asserted bound, the gate's stranger row covers all 15 banded courses (arming per track), the
stall test and `memory.ts` agree. `harness:reflex --browser` live keys are **green** (1 attempt, roundTrip yes): the round-9/10
'menu' / 'title' failure was the driver's own fake clock, not a core-game bug. Goldens: 25 restamped, 12 of 14 stale re-proved
browser-verified; **x1 Pro and x3 Pro wall the skill-3 bot** (50 attempts at 447.8 m / 72.2 m). Timelapse ledger 123 → 140.

| piece | as built |
|---|---|
| **stranger report** (`stranger/report.ts`, audit §4) | `census { n, minSessions 2, censored[] (in-progress / abandoned sessions with attempt + call counts), staleExcluded, otherBikeExcluded }`, `asserted { band, factor 1.5, limit }`, `verdict PASS / FAIL / UNDER-BAND / INSUFFICIENT / n/a` (`pass` kept: true only on PASS). Medians count the tier's default bike (`--bike` overrides); the other class's rows stay in the table marked "not counted". Headline line prints the verdict, n, the exact bound and every censored session. The CLI summary table gained bike / asserted / n / censored columns. `session.json` records `bike`; older sessions read it from the recording header. |
| **stranger card + PROTOCOL** | the track card names the bike class (the menu's picker is what the player saw); r9 notes: Pro (no ECU; plain `g` from standstill loops — launch on `gf` / `hg`, gas a landing after `c1`), roof climbs and the wire, apron jumps, tunnel rows, 45° extreme faces. `prep --bike`, `start --bike`, `report --bike` documented. Round ids on disk `r7` (Pro hard), `r7-rookie` (+`-b`), `r7-extreme` (+`-b`, `-c`; 400 calls / 75 min budgets). |
| **ship gate** (`gate/ship-gate.ts`, audit §4) | `STRANGER_TRACKS` = all 15 banded courses; each arms on its own at ≥ 2 completed sessions on this src and the tier's default bike; the check fails if any armed track is outside its limit or did not clear; the note lists n and censored per armed track, "under band" flags, and every unarmed track as informational. `REFLEX_TRACKS` keeps the four for the reflex rows. `GateStrangerRow` gained `bike`, `censored`, `belowBand`. |
| **reflex controller** (`reflex/{perceive,controller,memory,play}.ts`) | see-saw model: `Observation.seesaw { onBoard, angleDeg, rateDeg, toFarEnd, tipping }` from `st.seesaws[].angle / angVel`; rules `seesaw-ride` (on the board: lean 0, no brake, gentle gas, the far end is not a drop) and `seesaw-tip-air` (airborne within 0.6 s of leaving a tipping board: no taps, one held lean against the inherited rate). Stall-restart memory: `SectionMemory.stalled(x, speed)` on a `restart` fault — `speedScale = max(1, s) + 0.1` per stall, `throttleCap` 1, lean bias halved, logged `stalled: speed … (stall #n)`; the audit's failing assertion (§6) is reconciled (stall #1 → 1.1, #2 → 1.2, pinned in `reflex.test.ts`). `reflex.ts`: per-tier sim cap (600 s, extreme 1800 s) — request (a). RESULTS: see the matrix below. |
| **bot fallback** (`bot/play.ts`) | identical fault positions from one plan root (within 0.5 m) switch the fallback to a seeded PERTURBED opening (duration ±30 %, a lean offset, a throttle re-draw; deterministic in (seed, bans, identical)); a root that keeps faulting at the same metre WITH a plan is treated the same; the beam widens after more; `play.test.ts` proves successive openings differ. |
| **`harness:audio`** (`compare/audio.ts`, new stage) | renders `beats.ts`'s four beats (byte-identical, table printed) and builds six sealed AUDIO pairs `apair-<tag>-<stamp>-<hex>`: black 640×384 picture with only the A/B bar and clock (decision: any picture leaks round 10's visual tells), audio A / 1.0 s silence / B; `-A.wav` / `-B.wav` loudness-matched to −23 LUFS with one linear gain each (no compression), length min(A, B) ≤ 8 s; `-sheet.jpg` two spectrograms; `.answer.json` sealed (chmod 000); `--coin balanced` (default: 3 ours-A / 3 ref-A) or `plain`; `critic-prompt.ts` handles `apair-` ids (audio-only rubric, "which is the real game's audio, name the one tell"); `log.ts` unseals both id kinds; `RUBRIC.md` §audio (7 criteria) + per-beat sections; 7 tests. Reference cuts: `reference/evolution-gameplay/audio/*.wav` (8, 48 kHz stereo; README with raw file + `-ss/-to`). |
| **browser reflex** (`reflex/browser.ts`) | `ready` is set when the hook installs (boot step `front`) BEFORE `App.start()` runs in the `track` step behind a `nextPaint()`; installing the fake clock and calling `pauseAt` on `ready` froze the boot — `start()` never ran, the screen stayed at its initial `menu` (round 9) / `title` (round 10) with an empty nav log. The driver now waits for `phase() === 'countdown'` (90 s) before `pauseAt`, and on failure logs `location.search`, phase, screen and nav. `?track=` routes straight to the run; not a core-game bug. |
| **timelapse** (`timelapse/build-commit.mts`) | since 0f14d3d `vite.config.ts` refuses a production build without a git sha; the `git archive` export has none — the builder now passes `VERCEL_GIT_COMMIT_SHA=<sha>` (the loader / menu badge stamps the commit being built). |
| **shared checkout** | `scratchpad/harness10/frozen` = `git archive 56e3883` (goldens, browser reflex), `frozen2` = `6053c55` + harness overlay (gate), `treeA` / `treeB` = HEAD vs round-11 controller (matrix). `pnpm install --offline --frozen-lockfile` in each (a symlinked `node_modules` resolves tsx to a store path outside the tree and fails). Overlay `rsync -a --exclude out/ --exclude inputs/`, results back with `cp`. |

### Stranger round 7 — hard tier, Pro (the tier's default) and Rookie, src a6d63cfd; prompt = `run-stranger.md` block verbatim; loadavg 5 at spawn, 12–28 during (goldens, timelapse, matrix and 22 strangers on one box)

| session | bike | attempts | cleared | time | calls | wall | died at | what the stranger said |
|---|---|---:|---|---:|---:|---:|---|---|
| h1 p1 | Pro | 8 | yes | 106.3 s | 55 | 10.4 min | 4 (arch), 23, 220 (gap), 362, 361 (gap), 546, 555 | the plateau-to-slotted-roof transitions: drop 1 m onto the roof carrying a nose-up wheelie and ≥ 8 m/s; any lean-back in the air loops the Pro; plain gas from a standstill loops it |
| h1 p2 | Pro | 16 | yes | 143.9 s | 53 | 10.9 min | 4, 19, 50 / 57 / 52 (gap), 265 (ramp), 361–364 (gap) ×7, 376, 524 (gap) | the exit off the lip-climb platforms: the bike flies off the 1 m lip and lands at the platform's edge, the rebound pivots it nose-down into the slot row; 9 of 15 faults on the second lip |
| h1 p3 | Pro | 21 | yes | 257.1 s | 84 | 19.2 min | 4, 12, 54, 177, 172, 204 (ramp), 214–232 (gap) ×7, 326, 364, 385, 504, 524–533 (gap) ×4 | dropping 1 m off each slotted roof straight into a row of pits with too little speed to roll them level; landing rear-first and holding the wheelie across the pit row is what worked; every crash before CP 190.8 returns to x = 29 through five sections |
| h2 p1 | Pro | 12 | yes | 169.7 s | 65 | 16.2 min | 4, 12, 84, 357, 259 / 248 (box), 264 (gap), 267 / 266 (ramp), 422 (box), 505 | the climbing chain after CP1: a 2 m pit and a hidden half-metre step bleed speed to ~5 m/s before a 3 m pit; any gas after the step loops the Pro; coast the step, gas the whole ramp face, coast off the lip |
| h2 p2 | Pro | 10 | yes | 117.5 s | 57 | 19.1 min | 4, 12, 66 (box), 72 / 63 (ramp), 86, 237 (box), 266 (ramp) ×2 | every landing shelf sits a half-step below its platform and bleeds the 2–3 m/s the next kicker needs; the kicker tops launch nose-down unless gas is carried to the lip |
| h2 p3 | Pro | 7 | yes | 98.0 s | 40 | 13.1 min | 4, 19, 66 (box), 74 (ramp), 84, 268 (box) | the pitch off each lip depends on how settled the bike is after the previous landing; carry 10–12 m/s in, half-gas no lean on every face, coast every flight |
| h3 p1 | Pro | 16 | yes | 166.6 s | 75 | 13.5 min | 4, 19, 81–106 ×5, 241, 257, 400 (ramp, fire), 407–413 (arch) ×4, 401 (ramp) | the fourth fire kicker sits ~3 m past the third jump's landing-ramp foot: arriving 2 m/s slower rotates the bike hard nose-up after the lip (six faults) |
| h3 p2 | Pro | 18 | yes | 186.1 s | 103 | 17.3 min | 4, 12, 81–98 ×6, 245–254 (ledge) ×5, 401 (ramp), 410 (arch), 425, 427 | the invisible low barrel / whoop rows after each fire landing (~78–98, ~415–440 m) never show on the screen and loop the Pro below ~13 m/s; the 251 m knee-high platform is the other sink |
| h3 p3 | Pro | 14 | yes | 166.3 s | 72 | 13.2 min | 4, 12, 81, 92, 189, 252 (ledge), 258, 266, 372, 368 (ramp, fire), 408 / 406 (arch), 403 (ramp) | the back-to-back fourth fire pit: its steeper kicker loops the bike at the ~10.7 m/s pit 3 lands with; only gassing the instant the pit-3 landing touches carries enough speed |
| h1 k1 | Rookie | 13 | yes | 202.4 s | 67 | 13.3 min | 60 (gap), 180, 181, 177, 217 / 219 (gap), 320, 356 / 357 (gap), 466 ×2, 575 | — |
| h1 k2 | Rookie | 7 | yes | 127.9 s | 49 | 10.8 min | 177, 170, 174, 527 (arch, hazard), 509 / 520 (gap) | — |
| h1 k3 | Rookie | 27 | yes | 365.3 s | 144 | — | 219–232 (gap) ×11, 313–322 ×11, 266 (ramp), 357 (gap) | — |
| h2 k1 | Rookie | 2 | yes | 60.3 s | 23 | 7.1 min | 563 (ramp) | — |
| h2 k2 | Rookie | 1 | yes | 49.3 s | 22 | 5.0 min | — | — |
| h3 k1 | Rookie | 8 | yes | 98.8 s | 49 | — | 80, 56 (barrel, hazard), 104, 100, 252 (ledge) … | — |
| h3 k3 | Rookie | 5 | yes | 81.1 s | 33 | — | 254, 409 (arch), 513 (ramp), 504 (ledge) | — |
| x1 p1 | Pro | 11 | yes | 125.4 s | 54 | — | (see the x1 report) | — |

Censored (killed with the API limit, budget expired; in the census, not in any median): h2 k3 (Rookie, attempt 2, 28 calls),
h3 k2 (Rookie, attempt 10, 44 calls), x1 p2 (attempt 13, 121 calls), x3 p1 (attempt 15, 43 calls), x3 p2 (attempt 20, 61 calls).
Replacement sessions (h2 k4, h3 k4 Rookie; x1 p3, x3 p3 / p4 Pro): h2 k4 (Rookie) **4** / 87.2 s / 31 calls / 9.2 min (65 box, 168, 567 box — "hold `g` through
takeoff, coast the flight, `bb` to 9–10 m/s before each ramp"); h3 k4 (Rookie) **13** / 161.6 s / 66 / 16.2 min (84, 252 ledge,
267, 388 / 401 / 499 ramp, **505–513 ledge ×6** — "the slotted knee-high roof after the fifth fire jump: nothing on screen
distinguishes it from a plain platform"); **x1 p3 (Pro) 26 / 239.4 s / 119 / 29.2 min** (32 plank, 41 / 46 ramp, 114–115 pole ×3,
242–260 ×8 (ramp @ 255.7 ×5: face 2), 426–448 ×5 (poles @ 428.9), 578–607 ×6 (pole @ 598.6 ×2, gap 597) — "every crest
catapulted the Pro into a 1.5–2.5 s flight with un-steerable pitch; faces 2 and 3 were cleared by finding one survivable flight each
and replaying it byte-for-byte from the checkpoint"); **x3 p3 (Pro) 17 / 179.5 s / 113 / 31.0 min** (19, 55–70 ×3, 168 gap, 176 ×2,
193 ledge ×2, 299 wall, 312 gap, 318, 358 / 359, 370, 462 — "the in-air lean controls act opposite to the briefing on their first
slot: a single `lf` lifts the nose, a single `lb` drops it, only a 2–3 slot hold goes the documented way"); **x3 p4 (Pro) 21 / 225.6
s / 78 / 19.5 min** (55–74 ×4, 101–125 ×4, 156 / 158 box, 200, 285–296 ×4 (the see-saw exit), 306 gap, 372, 503 plank, 513 / 514
arch — "every crest, plank end and ledge drop launched me with an unpredictable rotation; gas holds the nose up, releasing it or
braking dumps the nose"). **Src note:** the core owner's cfc98f8 (hook-interface types in `src/core/types.ts`, no physics) moved
the fingerprint a6d63cfd → 65175e2d at 14:25 while these five were riding, so `report` now marks the first 22 sessions `stale src`
and the medians below are `--stale` (physics identical — proven by the golden restamp on cfc98f8 below: 36 goldens restamped
a6d63cfd → 65175e2d, node == browser on every one). The fingerprint is too broad (a hook type is not physics); open item below.

| track | band | asserted (Pro) | n | cleared | median attempts | median time | median calls | verdict | Rookie (informational) | reflex `average` (Rookie, 9 seeds) |
|---|---|---|---:|---:|---:|---:|---:|---|---|---:|
| h1-wheelie-wire | 10–18 | 10 ≤ med ≤ 27 | 3 | 3 | **16** | 143.9 s | 55 | PASS | 13 (13, 7, 27) PASS | 25 (3 seeds) |
| h2-gap-chain | 14–22 | 14 ≤ med ≤ 33 | 3 | 3 | **10** | 117.5 s | 57 | UNDER-BAND | 2 (2, 1, 4) UNDER-BAND | 46 (2/3) |
| h3-fire-line | 18–25 | 18 ≤ med ≤ 37.5 | 3 | 3 | **16** | 166.6 s | 75 | UNDER-BAND | 8 (8, 5, 13) UNDER-BAND | 7 |
| x1-vertical-limit | 30–45 | 30 ≤ med ≤ 67.5 | 2 (+1 censored) | 2 | **18.5** (11, 26) | 182.4 s | 86.5 | UNDER-BAND | — | 21 (9/9) |
| x3-gauntlet | 60–80 | 60 ≤ med ≤ 120 | 2 (+2 censored) | 2 | **19** (17, 21) | 202.5 s | 95.5 | UNDER-BAND | — | 34 (6/9) |

**Death table for the tracks owner (Pro, counted sessions).** h1 (42 deaths): ground ×11 (22.6, 546, 555.4, 19.5, 375.5, 11.5,
176.7, 171.6, 325.7, 385, 503.9), **gap @ 362.3 ×6 + 359.8 ×2 + 364.8 ×2** (the second lip's slot row: 10 of 42), gap @ 219.3 ×5
+ 225.3 / 231.3 (the first slot row: 7), gap @ 524.5 ×3 + 532.5 ×2 (the last: 5), arch @ 3.0 ×3, gap @ 51.0 / 53.5 / 56.0 (4),
ramp @ 206.8 / 267.3; by segment [6, 6, 10, 12, 8, 0]. h2 (26): ground ×8 (11.5, 84.2, 356.6, 504.7, 11.5, 86.5, 19.5, 84.4),
**ramp @ 266.8 ×4 + gap @ 263.8 + box @ 258.8 / 268.8** (the climbing chain's third platform: 7), box @ 65.0 ×2 + ramp @ 62.0 / 73.0
×2 (chain A: 5), arch @ 3.0 ×3, box @ 248.8 / 237.8 / 424.6; [6, 8, 10, 2, 0]. h3 (45): **ground ×24 — 81–106 m ×13** (the whoop
rows after fire 1: p2 "never show on the screen"), 241 / 257 / 266 / 189 / 372, 425 / 427, 11.5 / 19.5 ×3; **arch @ 412.4 ×7 +
ramp @ 401.4 ×4** (the fourth fire kicker: 11), ledge @ 252.0 ×6, arch @ 3.0 ×3, ramp @ 368.8; [6, 14, 10, 15, 0]. For the
tracks owner: h2 and h3 are under their bands on the default bike (10 vs 14–22, 16 vs 18–25) — either the bands move or the
tracks do; h3's sub-0.5 m barrel rows at 78–98 m are invisible on the stranger screen (the round-10 `view.ts` glyph item, again).
For physics: the Pro's standstill launch (plain `g` → loop in ~0.75 s) cost 9 / 9 first attempts.

### Blind audio A/B (P6) — twelve `apair-` pairs, one fresh critic each, ours (`beats.ts` rookie WAVs) vs the reference's own audio

Method: audio only, picture black on both sides (decision above); A then 1 s then B; each side loudness-matched to −23 LUFS
with one linear gain; the critic measures (ffmpeg / numpy) — it cannot hear. Run 1 (`--coin plain --seed 1011`) drew ours = A on
all six (a 1/32 draw; sfc32 consecutive seeds verified uncorrelated), so run 2 rebuilt the six with `--coin balanced` (3 ours-A,
3 ref-A); a killed critic on run 2's landing-14 was re-run once.

| pair | run | A | pick (real) | right? | conf | the tell (verbatim `nonAAA`) |
|---|---|---|---|---|---:|---|
| wheelie-02 | 1 | ours | B = ref | yes | 0.80 | "A's engine is a lone 13-14 Hz putt-putt pulse train, every pulse the same, holding idle rate for five seconds with nothing above 3 kHz and no stereo - a looped single-cylinder synth, not a rider feathering a high-revving engine on the back wheel." |
| wheelie-05 | 1 | ours | B = ref | yes | 0.86 | "A's engine is a metronomic combustion pulse train locked at ~13-15 pulses/s with a fundamental pinned at 117-135 Hz and a centroid that never leaves ~200-300 Hz for six seconds — a dry, mono, unmodulated idle loop where a wheelie should be surging and sagging with the rider's throttle." |
| landing-2m-12 | 1 | ours | B = ref | yes | 0.80 | "A's engine is a pitch-locked ~150 Hz tone amplitude-modulated by a metronomic 36.5 Hz pulse (exact 37.7 Hz sidebands, autocorrelation r = 0.62 that never drifts), and its landing is a 20 ms click followed by the bed getting quieter instead of a suspension thump and settle." |
| landing-2m-14 | 1 | ours | B = ref | yes | 0.80 | "A is a single fixed-pitch ~140 Hz engine drone whose level never leaves a 4.6 dB window for 7 s, with a 50 ms blip standing in for the 2 m landing instead of a low knock that compresses and settles." |
| crash-respawn-04 | 1 | ours | B = ref | yes | 0.86 | "A's engine is a single full-band impulse train: every 35 ms combustion pulse is a click that drops the whole spectrum, highs included, by ~25 dB and back, so there is no continuous exhaust or mechanical bed between pulses." |
| start-gate-01 | 1 | ours | B = ref | yes | 0.80 | "A's launch is a level-locked, near-mono harmonic comb: once GO hits the engine holds one loudness within +-1 dB for 2.4 s, its pulses tick at a fixed 28 ms period while the fundamental glides smoothly with no clutch hold or limiter, and no speed-linked wind or tyre noise rises with it." |
| wheelie-02 | 2 | ours | B = ref | yes | 0.82 | "A's engine is a fixed-rate 13.3 Hz pulse train whose pitch (118-135 Hz) and level (-27 dB +-1) do not move for five seconds - a wheelie with no throttle feathering, just a static harmonic comb." |
| wheelie-05 | 2 | **ref** | A = ref | yes | 0.86 | "B's engine is a rigid ~13.5 Hz pulse comb at a fixed ~62 Hz fundamental laid under a broadband hiss whose top band does not move by more than 1.2 dB in six seconds — a static synth stack with no throttle-driven pitch or timbre change." |
| landing-2m-12 | 2 | **ref** | A = ref | yes | 0.86 | "B is a one-level, fixed-partial harmonic drone with no airtime dip and no low suspension knock anywhere in 8 s, its whole envelope held within +-2 dB." |
| landing-2m-14 | 2 | **ref** | **B = ours** | **no** | 0.82 | (against the reference) "A's engine is a chopped sequence of clean, noiseless harmonic tone bursts that switch on and off by 15-18 dB every 0.3 s instead of a continuous combustion-pulse bed that only breathes with rpm." — the critic read the reference cut's gated engine bursts (+15–18 dB every 0.3 s, flatness 0) as the synth and ours' steadier bed as the recording; against ours it still noted "a single +17.8 dB low burst" for the landing and L/R 0.998 |
| crash-respawn-04 | 2 | ours | B = ref | yes | 0.86 | "A's crash-respawn is a deterministic re-trigger - the identical impact sequence plays twice 1.8 s apart (r=0.67 waveform match) and then settles into a mono, metronomic 0.40 s loop with a 60/125 Hz alternating fundamental instead of dying into silence and restarting." |
| start-gate-01 | 2 | ours | B = ref | yes | 0.80 | "A's engine is a mono, perfectly periodic pulse train whose every partial is an exact integer multiple of one fundamental that holds at 29 Hz and then slides up at a constant rate under a level flat to within 1.5 dB, with no per-cycle jitter, inharmonic content or load-driven change of timbre." |

**Tally: ours 1 / 12 (run 1 0/6, run 2 1/6 — the one pick is a critic mistaking the reference's gated engine for the synth, not a
merit read); the reference sat on the A side 3 times and was picked there twice, so position is not the explanation.** P6's done line (≥ 2/6) is not met. For the audio owner, the tells that recur in the eleven reference picks,
independently measured: (1) the engine is a metronomic pulse / AM train with a pinned fundamental and exact integer partials —
no per-cycle jitter, no rpm motion in the wheelie, landing or crash beats (a wheelie that never surges; the v2 2 m/s clutch balance
is part of this); (2) near-mono (L/R correlation 0.99, side/mid 0.08–0.16 vs the reference's 0.4–0.9) and dry; (3) a flat loudness
window (4.6 dB over 7 s) with nothing speed-linked above 2–3 kHz; (4) the landing reads as a 20–50 ms click after which the bed
gets *quieter*, where the reference is a two-stage low knock (−37 → −17 dB) that settles over 0.35 s with a 1–4 kHz scrub after;
(5) the crash cut's respawn replays the same rendering (waveform correlation 0.64–0.67 at 1.75–1.8 s) — determinism audible as
sameness; (6) ours has a 20 kHz noise floor where the captures brick-wall at 12–14 kHz (a codec tell; a 14 kHz low-pass in the pair
build would remove it — not applied this round, so the critics could name it; none did as the *one* tell). `beats.ts` table
(unchanged from audio r3): start −18.2 dBFS / 310 Hz vs ref −23.8 / 370 and −21.3 / 597; wheelie −29.7 vs −21.6 / −23.4; landing
−24.7 / 272 Hz vs −28.8 / 153 and −26.2 / 287; crash −26.2 vs −22.4 / −17.4. Pairs, sheets, WAVs and sealed answers in
`out/compare/apair-*`; verdicts `critic-r11-*` / `critic-r11b-*` in `compare.jsonl`.

### Goldens, skill 3, one seed, browser-verified (node hash == page hash), frozen 56e3883 src a6d63cfd, then restamped on cfc98f8 src 65175e2d (loadavg 4.5–28)

`--refresh-goldens --build`: fresh 0, **restamped 25** (db68bbeb → a6d63cfd: flat / gap / b1–b3 / e1 / e2 / m1–m3 / lab ×2, both
classes), **stale 14** (e3, h1, h2, h3, x1, x2, x3 × both) — exactly the tracks owner's list. Re-proven (`harness:bot <t> --skill 3
--bike <b>`, extreme at `--max-sim-seconds 1800 --track-wall-s 900`): e3 1 / 39.558 `916ee50d416820bb` · Pro 1 / 36.333 · h1 2 /
50.508 · Pro 1 / 43.575 · h2 1 / 45.667 · Pro 1 / 40.667 · h3 1 / 47.125 · Pro 1 / 45.592 · x1 1 / 54.600 · x2 3 / 56.767 · Pro 2 /
47.400 `31a2cbaf11fd8c4a` · x3 1 / 44.450 `ed5043f6f72e3246`; every one `verified=true` (12 goldens copied into `harness/inputs/`).
**Not re-proven: x1 Pro — 50 attempts, 81 %, `crash @ 447.8 m (ground)` (The Rising Pillars past CP2 400 m), 565 s; x3 Pro — 50
attempts, 13 %, `crash @ 72.2 m (ground)` (the cascade entry ramp), 305 s.** Both Pro goldens stay stamped stale; the Rookie
goldens (the class the medal times derive from) are green on 19/19. **After the fingerprint move (cfc98f8, 14:25): `--refresh-goldens
--build` on a frozen cfc98f8 restamped 36 (a6d63cfd → 65175e2d, node == browser on every one), stale 2 (x1 / x3 Pro), 19/19
tracks proven — the physics is byte-identical across the move.** For the tracks owner / bot: the skill-3 Pro cannot top the
r9 cascade entry or the pillars — the perturbed fallback (below) did not break either wall in one seed. `expected.json` keys only
flat-test / b1 (and `:pro`) — nothing keyed on X2's pit; the `water → fire` change touches no gate key.

### Ship gate (`harness:gate --build --pin --heap-seconds 60`, frozen2 = HEAD 6053c55 + the round-11 harness, src a6d63cfd)

**24/26 NO-SHIP (the SwiftShader `renderSynced` row + the reflex row; round 10: 22/26), wall 705 s, loadavg 9 at boot → 31 at the
end (the strangers, the matrix and the perf owner's jobs shared the box).** boot.readyP50 177.9 ms (limit 300; 110 / 686 / 127 /
178 / 1321) · firstFrame 3468 ms (SwiftShader, informational; ship target 900 NOT met on this machine) · clear.golden / bitEqual /
hashOk PASS (`b002d139195b5757`, pinned) · **clear.pro.flat / b1 PASS, src matches** (the first gate run read them STALE because the
25 restamped goldens had not been copied out of the frozen tree — they have now: `harness/inputs/*/bot-3*.json` 36 files restamped
or re-proved) · crash.faultWithinS 0.75 s · fault.toControlMs 50 ms (auto-respawn 1042 ms) · restart.ticks 1 · restart.wallMsP95
0.13 ms · restart.frameMsP95 3.88 ms · restart.noCountdown 1 tick · heap −15.5 MB / 60 s · draw calls 198 · triangles 158 567 ·
textures 76.9 MB · physics 25.0 µs/tick p95 · renderSubmit 2.56 ms · renderSynced 8144 ms (SwiftShader) · bundle 458.0 KB gz (dist
17 298 KB) · determinism 9/9 (D8 re-pinned `92e2f93ab49cd0b2`) · camera.box PASS 0/681 riding frames out of the box, clamped 28.2 %
(reported) · **stranger.medianAttempts PASS — the new all-tier row: `h1 16/27 (n=3) · h2 10/33 (n=3, under band) · h3 16/37.5 (n=3,
under band)`; armed 3/15 tracks (≥ 2 completed on src a6d63cfd and the tier's default bike), all armed within the limit;
informational (unarmed): b1–m3 0 fresh (their sessions are on older fingerprints), x1 1 fresh + 1 censored, x2 no report, x3 0
fresh + 2 censored** · **reflex.medianAttempts FAIL b1 1/1.5 · b2 2/3 · b3 4/3 · e1 8/6** (the same two rows as rounds 9–10) ·
reflex Pro informational b1 2 · b2 7 · b3 12 · e1 50 (not all cleared). Log `scratchpad/harness10/logs/gate2.log`, report
`out/metrics/ship-gate.json`, `out/gate/`.

### Reflex matrix on the round-11 controller (`harness:reflex --all-tracks --bike both --skill novice,average,good --seeds 3 --noisy e2,e3,m1,m3,x1,x2,x3 --noisy-seeds 9`, sim cap 600 s / extreme 1800 s)

treeB = `git archive 56e3883` + the round-11 harness; wall 129 s at loadavg 36–47; 0 replay divergences; re-run once more on a
frozen cfc98f8 (src 65175e2d, 79 s, loadavg 7–19) to stamp the new fingerprint — **every Rookie `average` row identical** (the
fingerprint move is a hook type, not physics); full tables with every death rule in `out/metrics/reflex.md` (38 `*.reflex.json`).

Rookie novice · **average** median (seeds) clears · good · Pro average — band: b3 8 · **4** (3, 4, 6) 3/3 · 3 · 12 — 1–2 | e1 17 ·
**8** (6, 10, 8) · 16 · 50 — 2–4 | e2 16 · **8** (8, 24, 17, 1, 5, 10, 6, 5, 21) 9/9 · 7 · 29 — 3–5 | e3 3 · **2** 9/9 · 2 · 14 — 3–6 |
m1 15 · **9** (10, 11, 9, 6, 7, 14, 5, 7, 9) 9/9 · 8 · 25 — 5–9 | m2 9 · **8** (8, 20, 3) · 10 · 21 — 6–12 | **m3 33 · 21 (51, 21,
32, 4, 10, 51, 11, 21, 51) 6/9 · 8 (7, 6, 13, 4, 8, 14, 51, 4, 27) 8/9 · 51 — 8–12** | h1 17 · **25** (27, 25, 12) 3/3 · 19 · 51 —
10–18 | h2 51 · **46** (46, 23, 51) 2/3 · 43 · 51 — 14–22 | h3 18 · **7** (11, 6, 7) 3/3 · 12 · 51 — 18–25 | x1 20 · **21** (21, 13,
27, 24, 11, 16, 16, 26, 48) 9/9 · 43 (8/9) · 51 (0/9) — 30–45 | x2 39 · **28** (51, 51, 8, 28, 51, 29, 25, 3, 5) 6/9 · 17 (6/9) · 51 —
40–60 | x3 51 · **34** (51, 51, 15, 21, 51, 15, 26, 45, 34) 6/9 · 19 (8/9) · 51 (0/9) — 60–80 | flat / gap / b1 / b2 / labs in band.

**Out of band (Rookie `average`): b3 4 / 2 · e1 8 / 4 · e2 8 / 5 · m3 21 / 12 · h1 25 / 18 · h2 46 / 22 = 6 over band (round 10:
6 of 16), plus x2 28 and x3 34 inside their bands with 6/9 clears each (not passes); x1 21 (9/9) is under its 30–45 band.** `good`:
m3 8 in band for the first time; h2 43, x1 43 over.

**A/B, HEAD controller (treeA) → round 11, same seeds and caps, Rookie median (clears):** `average` e2 8 → 8 · e3 2 → 2 · m1 8 → 9
· **m3 34 (5/9) → 21 (6/9)** · x1 18 → 21 · x3 40 (6/9) → 34 (6/9); `good` e2 7 → 7 · e3 2 → 2 · m1 6 → 8 · **m3 18 (7/9) → 8
(8/9)** · x1 42 → 43 · x3 21 (9/9) → 19 (8/9). What was measured on the way (m3 ×18 seeds, `good` / `average`): ride throttle duty 0
→ 24.5, 0.2 → 13, **0.4 → 7.5**, 0.6 → 17; the held tip-air lean against the inherited rate is implemented (`SEESAW.tipAir.mode`
`leave` / `judge`) and **worse at every gain** (off 7.5 / 21; leave 0.4 → 25.5 / 37, 0.6 → 30 / 35, 0.8 → 19.5 / 37; judge 19–29.5)
— any lean is a −1/0 tap train, each tap a kick and a swing on a bike the board just rotated, while hands-off the rider mass damps
−178 → −55 °/s in 0.16 s — so tip-air is hands-off by measurement (`mode: 'off'`, the numbers in the comment). Top death sites
(`average`): m3 ground @ 410 ×107 (`air-short`), ramp @ 421.4 ×41, ground @ 415 ×25 · x3 ledge @ 192.9 ×59 (`stuck-restart`, the
hop ledge — now labelled and taught "more speed"), ground @ 280 ×48 / 285 ×32 (`air-short`) · x1 ground @ 245 ×48, 585 ×27, pole @
428.9 ×13 · m1 ledge @ 109 ×31 (`stuck-restart`) · h2 ramp @ 552.6 / 234.8 / 541.6 (`air-gas-nose-up`) · h1 gap @ 512.5 ×19 · e1 ramp
@ 449.9 ×11 · e2 ramp @ 191.2 ×16, box @ 505.4 ×13. **For the physics owner (traces `scratchpad/harness10/r11/m3-avg.log` t = 75.53
seed 1066951255 attempt 6; `x3-avg.log` t = 92.28–92.42): the physics hop machine (`bike.ts` U_HOP) enters `push` / `recover` on
the see-saw plank with lean-0 keys and gas ≤ 0.4 duty, and the push launches the bike off the board nose-up (+263 / +427 °/s)
with the rear free-spinning in `recover` — this, not the rider, is the remaining ground @ 410 (m3) and 280 / 285 (x3) death.**
Bot: `PERTURB = { after: 3, widenAfter: 6, sameM: 0.5 }`; `play.test.ts` — ≥ 8 distinct openings across 12 identical faults,
per-seed determinism, distinct seeds differ; m1 skill-1's 17 faults at 31.1 m (a plan every time) now spread 30.0–31.2 m.

### Browser reflex (`harness:reflex b1-first-ride --seeds 1 --browser 1`, frozen 56e3883)

Before the fix: node 1 / 56.658 s, browser hash IDENTICAL `91572684717b2c19`, live keys `fake clock: expected the countdown after
pauseAt, got 'menu' (app {"screen":"menu","nav":[]})`. Root cause in the driver (table above). After: **browser run 1 attempt /
56.367 s, 63.8 fps virtual, 117 ms wall/frame, 490 keys, 411 s wall at loadavg ~28, `roundTrip=yes`** (the live recording + neutral
ticks replay in node to the browser's hash); `b1-first-ride.reflex.json` browser:1. The `?track=` contract holds on the merged menu.

### Timelapse

Ledger 123 → 137 (`--since 20d463d --clips milestones --milestones 0f14d3d,6081104,d0c65be,56e3883`, niced): the four newest
commits first failed to build in their exports (`vite.config.ts` build-id guard, fixed in `build-commit.mts`), then built and
captured (120 frames / 60–63 s each) under `--retry-failed`; `progress-stills.mp4` 135 stills / 13.1 MB, `progress-clips.mp4`
18.0 s / 4 milestones. A second append after the HEAD move (`--since 56e3883 --no-render`): fd3a6e4, e0f1670, 6053c55 built and captured (99–115 s each at loadavg ~7); **ledger 123 → 140**. No montage this round.

### Open

- **P6 audio A/B 1 / 12.** The tells above are the audio owner's list; the engine's pulse train (jitter, rpm motion, stereo), the
  landing knock and the respawn's re-trigger are the three that every critic keyed on. Next round: re-run the six pairs on the
  audio owner's next revision with `--coin balanced` and a 14 kHz low-pass on both sides.
- **h2 / h3 / x1 / x3 UNDER-BAND on the Pro (10 vs 14–22, 16 vs 18–25, 18.5 vs 30–45, 19 vs 60–80)**: the strangers clear the r9
  hard and extreme tiers in a third to a half of the authored attempts (the reflex `good` read 9–33 on the same tracks) — bands or
  tracks, the tracks owner's call; h1 is in band. x1 n = 2 with one censored, x3 n = 2 with two censored: thin.
- **`srcFingerprint` hashes all of `src/core`**, so a hook-interface type edit (cfc98f8) re-stamps every session and golden stale
  with no physics change. Proposal: hash `src/physics`, `src/tracks`, `src/game/rules.ts` and only the core files the sim imports
  (`replay.ts`, `hash.ts`, the state types), not the hook / UI types; a `--stale` report and a golden restamp are the workaround.
- **The Pro's in-air lean reads inverted on its first slot to two x3 strangers** ("a single `lf` lifts the nose, a single `lb`
  drops it; only a 2–3 slot hold goes the documented way") — the round-9 air-rule note (a release swings the bike ~30° the other
  way) seen from the other side; physics owner to confirm whether the first 125 ms of a lean is the preload's counter-swing.
- **The Pro's standstill launch loops on plain gas** (9/9 first attempts at 4 m): a physics / tuning note (the ECU is off on the
  Pro by design; a launch clamp for the first ~0.5 s would keep the class's feel and stop the 4 m fault).
- **x1 Pro / x3 Pro goldens stale**: the skill-3 bot walls at 447.8 m and 72.2 m (one seed each).
- **Sub-0.5 m barrel / whoop rows invisible on the stranger screen** (h3 78–98 m, m1's 0.3 m ledges): `view.ts` glyph item, second round running.
- **Audit §3**: the stranger is an AI proxy with telemetry and slot macros; it measures solvability and adaptation, not unaided
  human discovery — labelled so in `stranger/README.md`. Human sessions on the real interfaces are the parent's.
- Reflex out-of-band list: b3 4 / 2 · e1 8 / 4 · e2 8 / 5 · m3 21 / 12 · h1 25 / 18 · h2 46 / 22 (Rookie `average`); the h1 / h2 rows are the
  reflex's first same-src read on r9 — strangers on the Pro read 16 / 10 there.

## Round 10 status — strangers clear the new e3 in one and the first medium round in band; the blind critic picks ours 2 of 6 (hop, crash) and names the camera, the shadow and the rigid rider; goldens and gate re-pinned on tracks r8

**Finding.** Stranger round 5 on the frozen HEAD 539e500 (src db68bbeb, Rookie, r8 feel notes in the PROTOCOL): **e3-stairway 1 attempt
(3, 1, 1, 1; band 3–6), m1-hop-up 7.5 (8, 7; band 5–9), m2-drum-roll 4 (4, 4; band 6–12), m3-see-saw 8 (5, 11; band 8–12) — every
session cleared, every track PASS** (≤ 1.5 × band top). The tracks owner's r8 re-author closed the e3 gap that round 9 named (strangers
20 / 11-not-cleared → 3, 1, 1, 1; 42.1–42.4 s on plain gas); three of the four e3 strangers still saw 53–59° nose-up on the up-flights
at 15 m/s under plain gas and one looped there. P3's beginner + easy bar is met on the stranger side; medium is in band on the first
round. **Blind critic round 3 (RoG H5): ours picked 2 of 6** — the bunny hop (0.86; the reference window showed a rear-wheel balance,
not a hop — a weak pair, counted as the rubric was applied) and the crash (0.55; ours cuts to the checkpoint 1.17 s after the fault,
the reference window never reaches its respawn — the critic's tell against ours is the post-cut camera still sliding for a second and
the bike not yet moving); wheelie, landing, industrial world and canyon world went to the reference. The tells, verbatim, are below; the recurring ones are **the camera** (the pull-out to a top-down framing that shrinks the
hero to a dot on e2's demand jump; a one-frame checkpoint push-in with a blur burst on e1), **no ground shadow under the hero on b1's
dirt** ("no visible shadow… reads slightly pasted") and **a rigid rider** ("no body sway", "does not lag or load with the bike").
H5's done line (≥ 2/6, no tell naming weight / suspension / rider lag / camera) is met on the count and not on the tells: camera,
weight and rider lag are all named. Goldens: 25 restamped (node == browser, incl. the tracks owner's x3 Rookie 48.233 s / 2 attempts), 13 stale re-proven at
one attempt each (e1 three), gate 22/26 NO-SHIP on the same four rows as round 9. Reflex matrix: **6 of 16 courses over band**
(round 9: 8) with the three tracks-owner rules landed; m3 stays the outlier (34) and the trace says why (below). Timelapse ledger
100 → 123 commits and **`progress-wave3.mp4` (30.0 s, 20.6 MB)** cut (loadavg 40–60 all round; every wall time here is contention-pessimistic).

| piece | as built |
|---|---|
| **reflex controller** (`reflex/controller.ts`) | tracks r8 requests: (a) `hop-preload` never starts on ground steeper than 8° and a preload is dropped when the ground tilts up (`onRamp`) — the lipped plank beyond m3's 14° kicker read as a face and the −1 preload was held through the lip; (b) `air-short`: no gas / brake nudge when the ballistic time to land is under `AIR.nudgeMinAirS` = 0.5 s (a nudge is +6 / −15° per half second; in short air it only lands with the throttle or brake engaged) — the lean stays (a neutral-lean variant read m3 36 / e2 10 against 34 / 8); (c) `too-fast-brake` on the ground pulls lean to −0.5 × gain (the m1 stoppie into the ledge face). Death labels shift with (b): deaths in short air are now attributed to `air-short` where round 9 read `air-brake-nose-down` / `air-gas-nose-up` — a label, not a new cause. |
| **reflex matrix** (`reflex/reflex.ts`) | `--all-tracks --noisy a,b,c [--noisy-seeds 9]`: the named tracks run 9 seeds while the rest keep `--seeds` (request d). The 9-seed A/B on e2 / e3 / m1 / m3, Rookie `average`, HEAD controller → this round: **e2 13 → 8 · e3 3 → 2 · m1 7 → 8 · m3 28 → 34** (`good`: 8 → 7 · 1 → 2 · 7 → 6 · 13 → 18). |
| **bot fallback** (`bot/play.ts` `NO_PLAN_FALLBACKS`) | when the beam returns no actions from a root the player memory has banned every line at, the opening cycles gas → half-gas-back → gas-fwd → coast → brake → lean-back → hop with the number of bans at that root (deterministic per seed) instead of plain gas 47 times (x3 477 m). The x3 Rookie golden was already 2 attempts on the tracks owner's crest; the Pro x3 re-proved in 1. |
| **stranger PROTOCOL** | r8 feel notes: stairs are shin-high 0.15 m risers (plain `g` rides a flight, a brake or a held lean on them is the only fall), a held `lb` rides a long down-ramp but loops down a stair flight, hop ledges sit ~6 m past their checkpoint (hop speed from a standing start; brake early with `bb`, never flat at the face). Round id on disk **r6** (r5 was the R5 delta). |
| **browser reflex** (`reflex/browser.ts`) | the fresh-context onboarding card is pre-dismissed (`trials.onboarded` init script) — not the cause: the page reaches `ready` with **App screen `title`** (`initialTrack` never reached `App.start()`; `resolveBoot` took the `front` route under the driver's URL), so the failure now reports the screen and the nav log. Open, below. |
| **critic pairs** (`compare/`) | six pairs on HEAD 539e500 at `high` (captures `out/capture/r14-*`, low-tier twins captured for the record): wheelie h1 slots vs Rising wheelie skill game, landing e2 demand gap vs Evolution A-license jump, crash e3 stranger s1 fault @ 418 m vs Rising ragdoll respawn, hop lab vs Rising flat box hops, world b1 vs Evolution HD Warehouse, world e1 vs Rising canyon; `--mask`, sides by seed, answers sealed, one fresh critic per pair. Two pairs were rebuilt: the first landing and hop pairs ran the align window past our clip's end and the normaliser cloned the tail — the "0.8 s frozen frame" tell on the first landing pair was the pairing, not the game; both first verdicts are in `compare.jsonl` and discounted here. **Rule for the next holder: our capture must be ≥ anchor + 2.5 s long.** |
| **shared checkout** | `scratchpad/harness9/tree` = `git archive 539e500` (src db68bbeb) + the tracks owner's uncommitted x3 `bot-3.json`; `treeB` = the same for the HEAD-controller A/B. Overlay by `rsync -a --exclude out/ --exclude inputs/` (never `--delete`); results copied back with `cp`. |

### Stranger round 5 — Rookie, 10 sessions on the frozen 539e500 (src db68bbeb), prompt = `run-stranger.md` block verbatim, PROTOCOL with the r8 notes; loadavg 15–25 at spawn, 30–60 during (the golden chain, the gate and the captures shared the box)

| session | attempts | cleared | time | calls | wall | died at | what the stranger said |
|---|---:|---|---:|---:|---:|---|---|
| e3 s1 | 3 | yes | 55.0 s | 16 | 3.0 min | 418 m (pit) ×2 | full gas at ~15 m/s up the third flight pitched 45 → 59° into a loop; the half-gas fix left too little run-up for the pit at 418 |
| e3 s2 | 1 | yes | 42.1 s | 11 | 1.1 min | — | plain `g40` throughout; 53–56° nose-up on the two big flights (264, 414 m), trusted neutral gas to bring it back |
| e3 s3 | 1 | yes | 42.2 s | 11 | 1.4 min | — | same: 53–56° on the flights, a near loop-out, did not touch the lean |
| e3 s4 | 1 | yes | 42.4 s | 11 | 1.2 min | — | same: ~55° on the up-flights hit at 15+ m/s |
| m1 s1 | 8 | yes | 81.3 s | 33 | 9.1 min | 114, 112 (gap), 272, 280, 289, 284, 367 m | sub-half-metre bumps a few metres before each drawn ledge that the ASCII view cannot show: stop the bike dead at coast speed, or launch the second hop nose-up |
| m1 s2 | 7 | yes | 78.0 s | 29 | 6.9 min | 116, 109, 269, 273, 281, 368 m (ledges) | the ~0.3 m steps after checkpoints at 108 / 271 / 362 m are invisible on the screen; 6 of 7 attempts calibrated "start `h` ~2.3 m before the face at ~6 m/s" |
| m2 s1 | 4 | yes | 73.4 s | 29 | 5.7 min | 28 (drum), 186 (drum), 308 m (ramp) | leaving the second drum's rounded 2 m face on plain gas pitched over the bars; a lean-back at the drop landed it |
| m2 s2 | 4 | yes | 69.6 s | 34 | 8.0 min | 187 (box), 180 (ramp), 325 m (ramp) | cresting a shelf drum above a crawl, or with any lean at the lip, is an unrecoverable nose-down dive; roll the top at 2–3 m/s neutral |
| m3 s1 | 5 | yes | 65.3 s | 30 | 7.9 min | 218, 196 (ramp), 340, 403 m | in-air pitch off the kicker lips wildly inconsistent (nose-dived at 18 m/s, looped at 9.6); entered every lip at ~11.5 m/s on `gf` |
| m3 s2 | 11 | yes | 129.0 s | 39 | 13.0 min | 69, 351, 403, 434 ×2 (plank), 423, 415, 414 (ramp), 435 (gap), 484 m | the pit-jump ramp at 421–427 m kicks the nose up 30–40° every time; only a four-slot lean-forward held through the flight lands the 4 m platform |

| track | band | sessions | cleared | median attempts | median time | median calls | pass (≤ 1.5 × band top, all cleared) | reflex `average` (9 seeds) |
|---|---|---:|---:|---:|---:|---:|---|---:|
| e3-stairway | 3–6 | 4 | 4 | **1** | 42.3 s | 11 | PASS | 2 |
| m1-hop-up | 5–9 | 2 | 2 | **7.5** | 79.7 s | 31 | PASS | 8 |
| m2-drum-roll | 6–12 | 2 | 2 | **4** | 71.5 s | 31.5 | PASS | 8 (3 seeds) |
| m3-see-saw | 8–12 | 2 | 2 | **8** | 97.2 s | 34.5 | PASS | 34 |

Recordings in `inputs/<track>/stranger-<track>-r6-s<n>-20260914-2158xx.json` (byte-faithful on db68bbeb), sessions under
`out/stranger/<track>/`, round manifest `out/stranger/rounds/r6/`. Two stranger-tooling notes: the ASCII screen does not draw
sub-0.5 m steps (both m1 strangers found the 0.3 m ledges by hitting them), and every m3 death but two sits in 403–435 m — the
same see-saw exit → 421 m kicker → 434 m plank section the reflex trace names below.

### Blind critic round 3 (RoG H5) — six pairs, one fresh critic each, HEAD 539e500 `high` vs the reference corpus

| pair | pick | conf | why (critic, abridged) | the tell (verbatim `nonAAA`) |
|---|---|---:|---|---|
| wheelie-launch (h1 slots vs Rising wheelie) | **ref** | 0.66 | ours never establishes a wheelie — the front lifts off a bump for ~4 frames at t≈1.45 s and slaps back; camera trails so the bike drifts centre → right third; 1–2 frame orange flashes on the crosswalk | "B's wheelie-launch never happens as a controlled pitch: the front lifts off a terrain bump for four frames and slaps back down, so there is no sustained, drifting-and-corrected wheelie angle and no rider lean lagging into a held pose - plus the trailing camera and 1-2 frame light pops break the read of continuous, motivated motion." |
| big-jump-landing (e2 demand gap vs Evolution A-license jump) | **ref** | 0.90 | our camera pulls out continuously from t=0.9 s to an overhead view by t=2.0 s and never eases back; the bike is a 15 px dot at touchdown, lands flat, no dust, no compression | "A's camera runs away from the action: an unmotivated, ever-widening pull-out to a top-down angle shrinks the bike to a dot, so the landing has no readable pitch, compression, rebound or dust — the jump has no weight and no settle, and the camera never eases back in to sell the touchdown." |
| fault-respawn (e3 stranger fault @ 418 m vs Rising ragdoll respawn) | **ours** | 0.55 | ours nose-plants off the step at t≈1.1 s, rider ejects over the bars, hard cut to the checkpoint at t≈2.27 s with no fade; dust puff at the contact point within ~3 frames; but after the cut the camera keeps sliding ~60 px for over a second and the bike is not yet moving; the reference's ragdoll never respawns inside the window (its debris read is stronger: rider separates mid-air, bike rebounds off the container and creeps to rest) | "A never delivers the respawn — 2.3s after the crash the ragdoll is still lying there with the camera idly drifting, so the manoeuvre is incomplete; B does cut, but the camera is still sliding into the checkpoint frame for over a second after the cut and the bike is not yet moving, so the restart reads as late and unsettled rather than snappy." |
| bunny-hop (lab hop vs Rising flat box hops) | **ours** | 0.86 | ours: front lifts at the lip, clears the gap, rear touches first, front 2–3 frames later, rolls on; the reference window showed a rear-wheel balance held for a second (a weak pair — the critic's tell is about the reference) | (against the reference) "A has no mass: pitch changes take a second to happen, the bike hangs mid-wheelie without falling…" — ours drew "three clean but arbitrary hard cuts" (the lab track's checkpoint re-arms) and "little visible squat" |
| world-industrial (b1 riding frame vs Evolution HD Warehouse) | **ref** | 0.75 | ours glides at one speed over the crests with no pitch, no compression, no rider lean; no visible shadow on the dirt ribbon; camera at a fixed offset | "A's weaker read is weight: the bike glides at one speed over crests with no pitch, no suspension compression and no rider lean, and it casts no shadow, so it feels like a sprite on a rail rather than 100 kg rolling through a lit room." |
| world-canyon (e1 riding frame vs Rising canyon) | **ref** | 0.72 | a held opening frame, then at t=0.07 s a ~15 % camera push-in and a scene-wide blur switch in one frame as the checkpoint light goes green; rider stiff while the bike pitches ~20° onto the ramp; flat diorama with tilt-shift blur, blob shadow | "A's one-frame checkpoint push-in with a scene-wide blur burst, preceded by a held opening frame, is the tell: the camera changes scale instantly instead of easing, and the rider does not lag or load with the bike as it pitches onto the ramp. B never snaps, lands front-then-rear with a visible settle, and its shadows sit under everything." |

**Tally: ours 2 / 6** (hop 0.86, crash 0.55; H5 wants ≥ 2/6 with no tell naming weight, suspension, rider lag or camera — the count
is met, the tells are not: camera is named on four pairs, weight on two, rider lag / rigidity on three). Both wins are against weak
reference windows (a rear-wheel balance where a hop was cut; a ragdoll whose respawn falls outside 3.5 s), so the honest read is
"2/6 on the count, 0/4 on the pairs where the reference showed the manoeuvre". For the render owner, the tells that recur across critics: (1) **camera** — the
airtime pull-out on e2 goes to a top-down framing and never eases back in; the e1 checkpoint push-in is a one-frame scale step with a
blur burst; the h1 camera trails the bike to the right third; (2) **hero shadow** — none read on b1's dirt at `high` ("reads slightly
pasted"), a "soft blob" on e1; (3) **rider rigidity** — no sway over crests, no lag into the ramp pitch, no crouch before the hop;
(4) the reference's dust at the rear patch 2–3 frames after touchdown is what every landing critic keys on, and ours shows none.
Discounted pairs (logged in `compare.jsonl`, not in the tally): `big-jump-landing-…-68e2` (align window past our clip → cloned tail
read as a "0.8 s frozen frame") and `bunny-hop-…-dc80` (same, ours picked 0.6). Pairs, sheets and sealed answers in `out/compare/`.

### Goldens, skill 3, one seed, every clear browser-verified (node hash == page hash), frozen HEAD 539e500, src db68bbeb (loadavg 16–48)

`--refresh-goldens`: fresh 0, restamped 25 (74f5de4d → db68bbeb; **x3-gauntlet `bot-3.json` 48.233 s / 2 attempts, the tracks owner's
node-only golden, proves in the browser: 34b8d869 → db68bbeb**), stale 13 — the seven r8 tracks both classes minus x3 Rookie, plus x3
Pro. Re-proven: b2 1 / 38.417 `fbbbcc12ef37654e` · Pro 1 / 36.367 `e62cee03a3627e38` · b3 1 / 33.067 `c24caa6771450950` · Pro 1 /
30.008 `485b1c24296dbb95` · e1 **3** / 55.192 `b192ecb013eca683` · Pro **3** / 50.717 `68fe004d241b2a6c` · e2 1 / 44.175
`39238928bb85d7e7` · Pro 1 / 41.000 `b720878355e8e3c7` · e3 1 / 41.817 `09ed79eb92bf95d0` · Pro 1 / 38.275 `16fe4690ef7ae131` · m1 1 /
34.583 `6c61583f2a7c685b` · Pro 1 / 30.208 `4216a409fce0db67` · x3 Pro 1 / 42.792 `f1940fe691627514`; every one `verified=true`.
Every track has a proven golden on db68bbeb for both classes (19/19).

### Ship gate (`harness:gate --pin --heap-seconds 60`, frozen HEAD 539e500, src db68bbeb)

**22/26 (NO-SHIP on the three SwiftShader rows + the reflex row), wall 1667 s, loadavg 50 at boot → 55 at the end (the captures, the
10 strangers and another owner's jobs shared the box).** boot.readyP50 120.5 ms (limit 300; 116/121/220/107/155) · firstFrame 17234 ms
(SwiftShader, informational) · clear.golden / bitEqual / hashOk PASS (`b002d139195b5757`) · clear.pro.flat / b1 PASS · crash.faultWithinS
0.75 s · fault.toControlMs 50 ms (auto-respawn 1042 ms) · restart.ticks 1 · restart.wallMsP95 0.14 ms · restart.frameMsP95 1162 ms
(SwiftShader) · restart.noCountdown 1 tick · heap −5.37 MB/60 s · draw calls 198 · triangles 159 739 · textures 76.9 MB · physics
30.0 µs/tick p95 · renderSubmit 2.88 ms · renderSynced 18428 ms (SwiftShader) · bundle 441.1 KB gz (dist 17075 KB) · determinism 9/9 ·
**camera.box PASS 0 riding frames out of the box, clamped 34.4 % (reported)** · stranger.medianAttempts informational (no b1–e1 session
on db68bbeb yet; this round's sessions are e3 / m1–m3) · **reflex.medianAttempts FAIL b1 1/1.5 · b2 2/3 · b3 4/3 · e1 8/6** · Pro
informational b1 2 · b2 7 · b3 12 · e1 36. Log `scratchpad/harness9/gate.log`, report under `out/gate/`.

### Reflex matrix on HEAD 539e500 (`harness:reflex --all-tracks --bike both --skill novice,average,good --seeds 3 --noisy e2-rear-wheel-first,e3-stairway,m1-hop-up,m3-see-saw --noisy-seeds 9`, 94 s wall, loadavg 28; full tables with every death rule in `out/metrics/reflex.md`)

Rookie `average` median (seeds) / clears — band: flat 1 · gap 2 · b1 1 · b2 2 · **b3 4** (3, 4, 6) 1–2 · **e1 8** (6, 10, 8) 2–4 ·
**e2 8** (8, 24, 17, 1, 5, 10, 6, 5, 21) 3–5 · e3 2 (3, 2, 1, 4, 3, 2, 1, 3, 1) 3–6 · m1 8 (10, 6, 10, 6, 13, 9, 5, 7, 8) 5–9 · m2 8
(8, 6, 12) 6–12 · **m3 34** (28, 15, 36, 25, 36, 22, 38, 37, 34; 5/9) 8–12 · **h1 51** (0/3) 10–18 · **h2 39** (0/3) 14–22 · h3 22 (3/3)
18–25 · x1 29 (0/3, walled at 53 %) · x2 47 (0/3) · x3 34 (0/3) · lab 1 · lab-flat 1. **Out of band (Rookie `average`): b3, e1, e2, m3,
h1, h2 = 6 of 16** (round 9: 8; the x-tier rows sit inside their 30–80 bands only because the runs wall before clearing — 0/3 clears on
x1/x2/x3, so they are not passes). `novice`: b3 8 · e1 17 · e2 16 · m1 11 · m3 34 over band; `good`: b3 3 · e1 16 · e2 7 · m2 16 · m3 18.
Pro rows stay informational (b1 2 · b2 7 · b3 12 · e1 36 · e2 29 · e3 15 · m1 26). Top death sites (`average`): b3 ground @ 355 ×2
(nose-high), ramp @ 409.8 / 423.8 · e1 ramp @ 449.9 ×11 (the box-edge launch onto the 22 m ramp, `air-short`) · e2 ramp @ 191.2 ×16,
box @ 505.4 ×13, box @ 72.0 ×9 · m1 ledge @ 109 ×21 (`nose-low` — the stoppie became a nose-low dip at the same face) · m3 ground @ 410
×67, ramp @ 421.4 ×34, box @ 438.9 ×24 · h1 wall @ 175.8 ×71 (`nose-low`) · h2 ramp @ 275.8 / 265.8 (`air-gas-nose-up`).

**m3 trace (`scratchpad/harness9/{trace,probe}.mts`, `good` seed 1000, 396–426 m).** The demand see-saw (pivot 403.4 m, half-length 4,
rest +22.6° with the near end at 0.19 m) is approached over a 3 m pit (floor −3.0 m) from a ramp ending at 396.4 m: the bike flies the
pit onto the plank's low end, rides up it, the board tips at ~−140 °/s under the bike and hands it that nose-down rate at take-off
(pitch 20, rate −123 °/s leaving the far end at 404.6 m, 5.5 m/s); `drop-ahead-lean-back` (the plank's far end reads as a ≥ 0.8 m
drop) and the air rules then fight the inherited rotation into the ground at 410 m. The nudges were not the killer — with them off
the deaths at 410 stay and a neutral-lean variant is worse — so the controller needs a see-saw model (the board's angular rate is
observable in `st.seesaws[].angVel`; a rider on a tipping board should hold the pose it had and let the board set the exit), and the
421.4 m kicker deaths that appeared once the hop-preload no longer fires there are the same flight ridden as `ramp-ride` (+0.8, gas)
into the 434 m plank. Both are the controller's, not the track's — m3's strangers cleared in 5 and 11.

### Browser reflex (`harness:reflex b1-first-ride --seeds 1 --browser 1`, frozen 539e500)

Node 1 attempt / 56.658 s; `runRecording` browser hash `91572684717b2c19` IDENTICAL. Live keys still fail at `fake clock: expected the
countdown after pauseAt, got 'menu'` — with this round's diagnostic: **`app.screen() === 'title'`, nav log empty**. `App.start()` only
calls `play(initialTrack)` when `resolveBoot` returned the `run` route, so under the driver's `?track=b1-first-ride` URL the page opened
on the title (the onboarding card was not it — `trials.onboarded` is pre-set and the screen is `title`, not `run`). Core-game merged
the title into the menu at 20d463d after this tree was frozen; the next holder re-runs on that HEAD and, if the screen is still not
`run`, logs `location.search` as the page saw it (the `?track=` route is the contract: straight to the run). The round-7 live-keys
numbers stand.

### Timelapse

Ledger append started from e05153e (23 first-parent commits through 20d463d) with `--clips milestones --milestones
fc17e77,bdf9f0c,e8f2ec7,18df821,47f0455,71d1988,539e500` (the renderer appends the latest commit), niced, in the background at
loadavg 40–60 (~2–3 min per capture on this box). Ledger **100 → 123** (every commit built + captured, 52.1 min niced at loadavg 40–60); `progress-stills.mp4` (121 stills) and
`progress-clips.mp4` re-rendered. Wave-3 montage **`harness/out/timelapse/progress-wave3.mp4`: 30.0 s, 20.6 MB** (crf 22 re-encode of
the 27.7 MB render): bdf9f0c physics R4 → e8f2ec7 R5 → 47f0455 rider kit → 18df821 touch invariant → 71d1988 render r13 → 539e500
tracks r8 → 20d463d menu merge (the latest, appended by the renderer); fc17e77 harness r8 was dropped to keep the 4 s-per-build cut
at 30 s (the 8-milestone render is 34.0 s).

### Open

- **RoG H5: ours 2/6 on the count, tells still name camera / weight / rider lag — not done.** Tells for the render owner (verbatim
  above): the airtime camera pull-out to a top-down framing on e2 that never eases back; the one-frame checkpoint push-in + blur burst
  on e1; the post-respawn camera still sliding for a second while the bike stands; no hero shadow read on b1's dirt at `high`; the
  rigid rider (no sway, no lag, no crouch); no dust at the rear patch after touchdown. Next critic round on render r14, with the two
  reference windows re-cut so they show the manoeuvre.
- **Pair hygiene**: our capture must run ≥ anchor + 2.5 s or the normaliser clones the tail and the critic reads a frozen frame (two
  pairs rebuilt this round). `pair.ts` should refuse an align window that leaves either clip's duration.
- **m3-see-saw reflex 34 vs band 8–12 while strangers read 5 / 11**: a see-saw model in the controller (above), not a track change.
- **b3 4 / e1 8 / e2 8 over band for the reflex `average`** while strangers passed all three in rounds 4–5; the round-9 open item
  (air-brake off a box edge at speed, now labelled `air-short`) stands: e1 ramp @ 449.9 ×11, e2 ramp @ 191.2 ×16 / box @ 505.4 ×13.
- **Three of four e3 strangers report 53–59° nose-up on the up-flights at 15 m/s under plain gas; one looped.** Tracks / physics: the
  flights are ridden in one attempt, but the margin at full gas is a few degrees.
- **Stranger screen does not draw sub-0.5 m steps** (m1's 0.3 m ledges at 108 / 271 / 362 m): `stranger/view.ts` wants a glyph for
  a step under half a metre.
- **`harness:reflex --browser` live keys**: App screen `title` under `?track=` on 539e500 — re-run on the menu-merge HEAD.
- **`?perf=1` overlay does not carry `debugInfo()`** (round 9): still open with core-game.

## Round 9 status — the reflex controller learns the v2 air (rate-aware lean, early release), stranger round 4 passes b1–e2 on R4 and R5, e3 is the stairway that no human proxy clears

**Finding.** The round-8 deaths were the controller's, as physics R4 said: `air-level` mapped pitch error to a lean that
saturated at ±1 and held it through the reaction lag, a bang-bang controller on a double integrator. The controller now
regulates the pitch it *will* have a reaction plus 0.25 s later (`e + rate × lead`, lean = that / 18°), leans at most
half unless the predicted error is beyond 35°, never holds a full press longer than 0.3 s, lets go 0.15 s before the
predicted zero crossing minus the ~30° the release itself swings the chassis (`air-release`), and keeps the hands
light for 0.3 s after a release (`air-settle`); gas and brake became nudges on top of the lean (`air-gas-nose-up` no
longer forces lean −1). On the Rookie the ramp pose is +0.8–1 (`ramp-ride`), on the Pro +1 with a third throttle above
9 m/s. Three ground rules fell out of the e3 traces: `coast-into-rise` (no front brake into a ≥ 25° rise within a
reaction + 0.3 s — the brake 1.3 m before a 27° flight was −13 → −109° in 0.35 s), `stair-bounce` (both wheels off a
tread for a moment is a bounce, gas stays on — the throttle was cut on every step and the bike stalled at 1 m/s), and
stairs are not ramps (a per-cell riser count, `Ahead.risers`; the +1 pose on risers noses the front into every step).
Rookie `average`, seeds 1000–1002 on the frozen R4 (bdf9f0c), physics owner's R4 table → this round: gap 1 → 1 · b1
1 → 1 · **b2 4 → 2 · b3 14 → 4 · e1 21 → 9 · e2 36 → 11 · e3 30 → 10**, every seed clears (R4: e1 2/3, e2 1/3, e3
1/3). The full matrix on the same tree: **9 of 16 courses over band (round 8: 12)**, b2 and m2 back in band, e1/e2/e3
at 8 each (bands 2–4 / 3–5 / 3–6). Physics R5 (e8f2ec7, the airborne rider rate limit) landed mid-round; on it the
matrix reads b3 7 · e1 7 · e2 10 · e3 35 · m3 10 with **8 of 16 over band**, and a nine-seed run (1000–1008) gives b2 3 ·
b3 4 · e1 11 · e2 19 · e3 10 · m2 8 · m3 32 — the 3-seed medians on e2/e3/m3 swing by 3× with the seed, so the matrix
is a coarse instrument on those three. **Stranger round 4 (12 sessions, Rookie, frozen R4): b1 1 · b2 2.5 · b3 3 · e1
5.5 · e2 6.5 all PASS (≤ 1.5 × band top, every session cleared); e3 15.5 FAIL** (20 and 11-not-cleared; both died on the
0.25 m stair flights at 165 / 407 m and the 2 m pit after the descent). The R5 delta on b1–b3 (6 sessions): 1 · 2 · 3,
all PASS. Every stranger names the same thing the reflex traces show: *any lean held into or through the lip flips the
bike*; the ones who cleared rode kickers on plain gas and coasted the flight. The reflex bot and the strangers now agree
on b1–e2 within a factor of 1.5; e3 is the outlier for both (reflex 8–35, strangers 11–20+, band 3–6) — a tracks
question, not a controller one.

| piece | as built |
|---|---|
| **reflex air rules** (`reflex/controller.ts` `AIR`, `decide()`) | `air-level`: `ePred = (pitch − target) + rate × (reactionS + 0.25)`, lean = ePred / 18 × gain, cap ±0.5 (±1 beyond 35°, for ≤ 0.3 s), `air-release` when `e + rate × (reactionS + 0.15) − 30 × leanHeld` crosses zero, `air-settle` (±0.25) for 0.3 s after; brake nudge beyond +30 predicted and still rising, gas nudge below −30 and falling; `touchdown` unchanged. `ramp-ride`: Rookie +0.8 + 0.2 × gain, Pro +1 and thr 0.3 above 9 m/s; stairs (`risers ≥ 2`) keep +0.4 × gain. New ground rules `coast-into-rise` (thr 0.5, no brake), `stair-bounce` (thr ≥ 0.8, lean −0.2..+0.4). `ControllerOptions.bike` (play.ts passes `sim.bike`, browser.ts too). `ReflexPlayOptions.onTick(tick, intent, keys)` for traces. |
| **perception** (`reflex/perceive.ts`) | `Ahead.roughDeg` (max − min per-cell slope over −1..+2 m) and `Ahead.risers` (cells > 40° following a cell < 8°): a 0.25 m / 0.6 m stair flight counts 2–4 risers, a kicker or a 45° plank base 0–1. |
| **stranger** (`stranger/PROTOCOL.md`, `session.ts`, `cli.ts`, `report.ts`) | "How the bike feels" gains the R4 air rule (gas/brake are nudges: +6 / −15° per half second; a held lean accelerates, ~170 °/s in 0.5 s; a release swings ~30° the other way — lean ≤ 2 slots, release early, fly a beat on `c`) and the ramp rule (weight forward, let go at the lip, ~8 m/s off a knee-high kicker under full gas, never brake on the face or before a riser). **Budget from the first call**: `state.firstCallAt` is set on the first CLI call and `wallMs` / the report's wall count from it — a `prep`-created session used to burn its 25 min while it waited to be spawned (r4 e3 s2 was handed 5 min). |
| **shared checkout** | Two `git archive` copies in `scratchpad/harness8/`: `tree` = bdf9f0c (src 3d5fd16f; the controller work, the R4 matrix, stranger r4, the Rookie golden sweep, the physics-suite) and `tree5` = e8f2ec7 (src 74f5de4d = HEAD 8ea3b7d's fingerprint, physics R5; the HEAD matrix, stranger r5, the golden refresh + stale re-runs, the gate `--pin`, the browser reflex). A `sync.sh` overlays `harness/` (minus `out/` and `inputs/`) — the first version rsync'd `inputs/` with `--delete` and wiped the r4 stranger recordings and half the Rookie goldens in `tree` at 19:38; the recordings were re-emitted from the sessions' persisted recorder state (`rebuild-rec.mts`; e1 s1 replays deterministic `bba70471a3866d8a`), the goldens re-proved on `tree5` anyway. **Rule: never `--delete` into a tree that writes `inputs/`.** |
| **`?perf=1` overlay** | On the live build (headless, `?track=b1-first-ride&perf=1`, 120 ticks + render) `hook.info()` exposes none of `tier, dpr, canvasW/H, rtMpx, rtMB, rtPasses, shadowMap`, the hook has no `debugInfo`/`renderer`, and the `pre.perf` element is not in the DOM (the overlay is created only by `App` when `o.perf` is set, and `?perf=1` did not reach it through the harness boot). `PerfSample` (`src/ui/perf.ts`) carries only frameMs / physicsUs / stats / quality / qualityWhy / dpr, and `app.ts` builds it from `game.qualityTier` + `dprCap()`, never from `renderer.debugInfo()`. **Core-game request**: wire `debugInfo()` into `PerfSample` (and mirror it in `HookInfo`, so the harness can assert the tier/DPR/render-target rows the render owner measures). |
| **timelapse** | Ledger 96 → 100 commits (fc17e77, 12a29f2, bdf9f0c, e05153e built + captured, 5.3 min niced); `progress-stills.mp4`, `progress-clips.mp4` (13 milestones, 54 s), `progress.gif` re-rendered. No montage. |

### Reflex matrix on HEAD e8f2ec7 (physics R5; `harness:reflex --all-tracks --bike both --skill novice,average,good --seeds 3`, 40 s wall, loadavg 7; full tables in `out/metrics/reflex.md`). Column "R4" = Rookie average on bdf9f0c with the same controller

Median attempts over 3 seeds (clears / 3); death site = the obstacle that took the most Rookie `average` attempts, with the rule the rider was executing.

| track | band | R4 Rookie avg | Rookie novice | Rookie average | Rookie good | Pro novice | Pro average | Pro good | Rookie average death site | out of band (Rookie avg, HEAD) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| gap-test | 1–3 | 1 | 1 (3/3) | 1 (3/3) | 1 (3/3) | 3 (3/3) | 7 (3/3) | 4 (3/3) | — | in band |
| b1-first-ride | 1–1 | 1 | 2 (3/3) | 1 (3/3) | 1 (3/3) | 1 (3/3) | 9 (3/3) | 2 (3/3) | — | in band |
| b2-lean-back | 1–2 | 1 | 3 (3/3) | 1 (3/3) | 1 (3/3) | 30 (1/3) | 13 (3/3) | 7 (3/3) | ground @ 575 m ×1 (air-gas-nose-up) | in band |
| b3-kicker-row | 1–2 | 4 | 9 (3/3) | 7 (3/3) | 4 (3/3) | 41 (1/3) | 25 (3/3) | 20 (3/3) | ground @ 170 m ×4 (air-brake-nose-down) | 7 > 2 |
| e1-uphill-weight | 2–4 | 8 | 18 (2/3) | 7 (3/3) | 8 (3/3) | 36 (0/3) | 32 (3/3) | 20 (2/3) | ramp @ 445.9 m ×5 (air-brake-nose-down) | 7 > 4 |
| e2-rear-wheel-first | 3–5 | 8 | 26 (1/3) | 10 (2/3) | 7 (3/3) | 46 (0/3) | 38 (0/3) | 22 (3/3) | ramp @ 506.4 m ×20 (air-brake-nose-down) | 10 > 5 |
| e3-stairway | 3–6 | 8 | 19 (2/3) | 35 (1/3) | 14 (3/3) | 47 (0/3) | 44 (0/3) | 35 (1/3) | box @ 411.6 m ×34 (stuck-restart) | 35 > 6 |
| m1-hop-up | 5–9 | 42 | 46 (0/3) | 49 (1/3) | 17 (2/3) | 51 (0/3) | 48 (0/3) | 48 (0/3) | ledge @ 119.0 m ×53 (air-brake-nose-down) | 49 > 9 |
| m2-drum-roll | 6–12 | 9 | 25 (3/3) | 7 (3/3) | 7 (3/3) | 41 (0/3) | 44 (0/3) | 27 (3/3) | drum @ 53.2 m ×3 (air-gas-nose-up) | in band |
| m3-see-saw | 8–12 | 33 | 34 (1/3) | 10 (2/3) | 11 (3/3) | 40 (0/3) | 44 (1/3) | 33 (2/3) | ground @ 410 m ×12 (air-brake-nose-down) | in band (9-seed 32) |
| h1-wheelie-wire | 10–18 | 47 | 45 (0/3) | 50 (0/3) | 50 (0/3) | 47 (0/3) | 49 (0/3) | 43 (0/3) | wall @ 175.8 m ×65 (nose-low) | 50 > 18 |
| h2-gap-chain | 14–22 | 44 | 42 (0/3) | 43 (0/3) | 42 (0/3) | 49 (0/3) | 46 (0/3) | 43 (0/3) | ramp @ 62.0 m ×32 (air-gas-nose-up) | 43 > 22 |
| h3-fire-line | 18–25 | 26 | 34 (0/3) | 31 (0/3) | 15 (2/3) | 41 (0/3) | 46 (0/3) | 39 (0/3) | gap @ 489.2 m ×24 (air-gas-nose-up) | 31 > 25 |
| x1-vertical-limit | 30–45 | 32 | 30 (0/3) | 32 (0/3) | 32 (0/3) | 38 (0/3) | 38 (0/3) | 35 (0/3) | ramp @ 227.9 m ×22 (stuck-restart) | in band (cap) |
| x2-pipe-dream | 40–60 | 47 | 40 (0/3) | 38 (0/3) | 33 (0/3) | 45 (0/3) | 38 (0/3) | 43 (0/3) | drum @ 370.0 m ×44 (air-gas-nose-up) | in band (cap) |
| x3-gauntlet | 60–80 | 30 | 23 (0/3) | 31 (0/3) | 31 (0/3) | 46 (0/3) | 38 (0/3) | 38 (0/3) | ramp @ 60.2 m ×47 (air-brake-nose-down) | under (cap, 0/3) |
| lab-flat-200 | 1–1 | 1 | 1 (3/3) | 1 (3/3) | 1 (3/3) | 4 (3/3) | 2 (3/3) | 3 (3/3) | — | in band |
| lab-physics-test | 3–8 | 1 | 2 (3/3) | 1 (3/3) | 1 (3/3) | 14 (3/3) | 2 (3/3) | 2 (3/3) | — | in band |

**Out of band for the tracks owner (Rookie `average`, HEAD e8f2ec7, 8 of 16):** b3 7 [1–2] ground @ 170 m (air-brake-nose-down) ·
e1 7 [2–4] ramp @ 445.9 m, the 45° demand plank (air-brake-nose-down) · e2 10 [3–5] ramp @ 506.4 m (air-brake-nose-down) ·
e3 35 [3–6] box @ 411.6 m / stair @ 406.8 m (stuck-restart, air-brake) · m1 49 [5–9] ledge @ 119.0 m (air-brake-nose-down) ·
h1 50 [10–18] wall @ 175.8 m (nose-low) · h2 43 [14–22] ramp @ 62.0 m (air-gas-nose-up) · h3 31 [18–25] gap @ 489.2 m
(air-gas-nose-up). On the frozen R4 the same list was b3 4, e1 8, e2 8, e3 8, m1 42, m3 33, h1 47, h2 44, h3 26 (9 of 16).
The recurring air death is now the *brake* nudge on a nose-high exit (`air-brake-nose-down`), not the lean.

Nine seeds (1000–1008), Rookie `average`, HEAD: gap 1 · b1 1 · b2 3 (2/3/3/2/4/2/1/3/3) · b3 4 (2/4/2/4/2/8/5/1/12) · e1 11
(13/14/9/15/5/11/11/3/6) · e2 19 (34/38/22/12/19/8/37/4/10, 7/9) · e3 10 (7/20/4/6/14/4/20/10/28) · m1 44 (1/9) · m2 8 · m3 32
(35/36/10/13/32/34/5/33/22, 4/9).

### Stranger round 4 — Rookie, 12 sessions on the frozen R4 (bdf9f0c, src 3d5fd16f), prompt = `run-stranger.md` block verbatim, PROTOCOL with the R4 feel notes; loadavg 4–7 at spawn (sweeps pushed it to 10–16 during the later sessions)

| session | attempts | cleared | time | calls | wall | died at (nearest obstacle) | what the stranger said |
|---|---:|---|---:|---:|---:|---|---|
| b1 s1 | 1 | yes | 49.0 s | 13 | 2.4 min | — | braked blind before every rise; the 35 m window never shows the next feature |
| b1 s2 | 1 | yes | 42.8 s | 12 | 5.5 min | — | same: braking to ~10 m/s before a ramp whose far side is not visible |
| b2 s1 | 2 | yes | 49.4 s | 15 | 3.0 min | 433 m | a lean-back blip on the second knee-high step at 16 m/s pitched to 86° and looped |
| b2 s2 | 3 | yes | 68.6 s | 27 | 11.9 min | 118, 304 m | chaining a second hop while still airborne loops; one hop at 8–10 m/s and let the bounce carry |
| b3 s1 | 4 | yes | 60.8 s | 22 | 7.1 min | 87, 239, 358 m | any `lb`/`lf` in flight is a runaway flip; gas through the lip, pure coast in the air, half gas after landing |
| b3 s2 | 2 | yes | 45.8 s | 26 | 15.5 min | 240 m | the same lip recipe gave +29° on one gap and −34° on the next; rode the tallest kicker blind with gas held |
| e1 s1 | 6 | yes | 82.5 s | 25 | 10.0 min | 236, 212, 211, 320, 445 m | releasing the forward lean at the lip is violent and slot-sensitive: one slot early = backflip, one late = nose-plant |
| e1 s2 | 5 | yes | 104.1 s | 29 | 18.8 min | 129, 77, 257, 526 m | release `gf` on the last grounded slot and fly neutral; full gas on the flats turned a creeping wheelie into a launch 14 m from the line |
| e2 s1 | 7 | yes | 86.0 s | 50 | 12.2 min | 72, 55, 55, 199, 324, 537 m | exit angle depends on whether the last `gf`/`lb` slot straddles the lip; `gf` to the lip, `c` one slot, `gb2` mid-flight |
| e2 s2 | 6 | yes | 86.4 s | 24 | 17.7 min | 69, 75, 278, 194, 531 m | full-gas flight off one kicker lands nose-down on the next ramp; brake to 7–8 m/s before the kicker |
| e3 s1 | 20 | yes | 184.6 s | 68 | 19.5 min | 72, 66, 64, 177, 168, 164, 178, 277, 416, 411 … m | the 2 m pit after the four-step descent (rear wheel catches the far lip), the stairs (a 0.5 m step endoes or loops at any speed; only an 11 m/s wheelie entry got up) |
| e3 s2 | 11 | **no** (420 m) | — | 33 | 24.4 min | 78, 71, 176, 165, 166, 166, 412, 415, 415 … m | the last flight at 411 m has a razor-thin speed window; the session had ~5 of its 25 min left when spawned (budget counted from `prep` — fixed) |

| track | band | sessions | cleared | median attempts | median time | median calls | pass (≤ 1.5 × band top, all cleared) | reflex average (HEAD / R4) |
|---|---|---:|---:|---:|---:|---:|---|---|
| b1-first-ride | 1–1 | 2 | 2 | **1** | 45.9 s | 12.5 | PASS | 1 / 1 |
| b2-lean-back | 1–2 | 2 | 2 | **2.5** | 59.0 s | 21 | PASS | 1 / 1 |
| b3-kicker-row | 1–2 | 2 | 2 | **3** | 53.3 s | 24 | PASS | 7 / 4 |
| e1-uphill-weight | 2–4 | 2 | 2 | **5.5** | 93.3 s | 27 | PASS | 7 / 8 |
| e2-rear-wheel-first | 3–5 | 2 | 2 | **6.5** | 86.2 s | 37 | PASS | 10 / 8 |
| e3-stairway | 3–6 | 2 | 1 | **15.5** | 184.6 s | 50.5 | **FAIL** | 35 / 8 |

**R5 delta (e8f2ec7, src 74f5de4d, 6 sessions, b1–b3):** b1 s1 1 (45.0 s, 12 calls) · b1 s2 1 (43.4 s, 12) · b2 s1 2 (54.2 s, 24; crash @ 309 m)
· b2 s2 2 (51.1 s, 14; crash @ 286 m) · b3 s1 2 (43.1 s, 13; crash @ 348 m) · b3 s2 4 (61.4 s, 24; crashes @ 93, 95, 239 m) →
**medians 1 · 2 · 3, all PASS** (R4: 1 · 2.5 · 3). The b3 s2 stranger's sentence is the round in one line: "unlearning the briefing's
'lean forward to level' hint — any forward lean at or before the lip set off a −12°/slot nose-down rotation that ended in a
flip every time, while riding every kicker under plain neutral `g` and coasting off the ledges gave a self-levelling ~22° exit."
Every r4/r5 recording is in `inputs/<track>/stranger-<session>.json` (the r4 set re-emitted from the persisted recorder,
see shared checkout) and the sessions under `out/stranger/<track>/<session>/`; m1–m3 were prepped and not played (no budget
left after the R5 re-run) — their empty sessions were removed.

### Goldens, skill 3, one seed, every clear browser-verified (node hash == page hash), physics v2

**Frozen R4 (bdf9f0c, src 3d5fd16f), Rookie** (`scratchpad/harness8/goldens-rookie.log`, loadavg 6–14): flat-test 1 / 8.567 s
`b002d139195b5757` · b1 1 / 41.692 `03325ac729f14b08` · gap-test 1 / 5.733 `c84c86357e8cdab4` · b2 1 / 38.633 `301e53d6f9a70998`
· b3 1 / 33.850 `2667b6743d2e28be` · e1 1 / 43.917 `1c8ff35582dd706c` · e2 1 / 43.642 `77f93a52fa06696d` · e3 1 / 41.983
`ef285d777768a62b` · m1 1 / 36.433 `4d2903aac9a14cdb` · m2 1 / 38.292 `a9df31b550bae5f0` · m3 1 / 39.992 `bc777139c657d054` ·
h1 1 / 47.000 `81b44838ae2ad8ad` · h2 1 / 48.917 `eb4bab4d2c8acd0f` · h3 1 / 44.983 `94b5442e912327a6` · x1 1 / 58.475
`2004089409805c63` · x2 2 / 48.292 `18e201c03050891e` · **x3 timeout (32 attempts, 490.4 m = 97 %, walled at the 483.6 m pole
— cleared in ≤ 2 on R3/round 8; R4's ramp-exit speed cut is the suspect)** · lab-flat-200 1 / 12.608 `013540711e622464` ·
lab-physics-test 1 / 8.108 `ba4883eaf138be13`. **Pro** (round-8 sweep in `harness7/tree2`, R3 physics — the Pro is untouched
by R4 and R5, so `--refresh-goldens` on e8f2ec7 restamped all 19 with node == browser; `m3-see-saw` Pro golden re-proved
here, 1 attempt): copied back into `inputs/*/bot-3-pro.json`.

**HEAD e8f2ec7 = 8ea3b7d for the fingerprint (src 74f5de4d; 8ea3b7d adds only `src/ui/best.ts`, outside the fingerprint's physics/tracks/core/rules walk)** — `--refresh-goldens`: fresh 0, restamped 20 (19 Pro + lab-physics-test Rookie), stale 18
(every Rookie golden with a flight: R5 changes the Rookie in the air); the 18 were re-run at skill 3 (`chain5.log`):

| track | bike | attempts | finish s | hash | node == browser |
|---|---|---:|---:|---|---|
| flat-test | rookie | 1 | 8.567 | `b002d139195b5757` | true |
| gap-test | rookie | 1 | 5.742 | `8f6dcf4f496674d7` | true |
| b1-first-ride | rookie | 1 | 41.558 | `14f314acf2c5be93` | true |
| b2-lean-back | rookie | 1 | 38.600 | `04ae10347dd93f10` | true |
| b3-kicker-row | rookie | 1 | 34.217 | `17d1d387997533fc` | true |
| e1-uphill-weight | rookie | 2 | 49.517 | `3fde83b238440d7a` | true |
| e2-rear-wheel-first | rookie | 2 | 51.033 | `d5a74c4778a22399` | true |
| e3-stairway | rookie | 1 | 42.117 | `4ac3e6218f610379` | true |
| m1-hop-up | rookie | 1 | 34.983 | `446c44e26cc8be55` | true |
| m2-drum-roll | rookie | 2 | 49.283 | `db7668fb4e1745da` | true |
| m3-see-saw | rookie | 2 | 45.567 | `56bbf3dcc5a90def` | true |
| h1-wheelie-wire | rookie | 1 | 47.808 | `07b9874f7323e2f7` | true |
| h2-gap-chain | rookie | 1 | 50.200 | `dd03317cff597066` | true |
| h3-fire-line | rookie | 1 | 42.167 | `afae7c08886f8897` | true |
| x1-vertical-limit | rookie | 1 | 56.375 | `3f0411b1ff4a9cac` | true |
| x2-pipe-dream | rookie | 3 | 52.158 | `6f3c9b724ec167bc` | true |
| x3-gauntlet | rookie | 50 (cap) | — | — | walled at the 479.2 m gap, 478.9 m = 95 %; skill-3 clears in ≤ 2 on R3 — **stale golden kept** (stamp 93e6caa5) |
| lab-physics-test | rookie | 1 | 8.217 | `ee96e73911b121cd` | true |

The 20 restamped: every `bot-3-pro.json` (Pro unchanged since R3: byte-identical replays, including `m3-see-saw` 38.267 s from the round-8 sweep) and the Rookie `lab-flat-200` / `lab-physics-test`. `gate/expected.json` re-pinned on 74f5de4d: Rookie flat-test 8.5667 s `b002d139195b5757`, `clear.pro.flat` 8.0417 s `9defa8078708cfc7`, `clear.pro.b1` 37.733 s `49ce97f9fa86a3d5`.

### Ship gate (`harness:gate --pin --heap-seconds 60`, frozen HEAD e8f2ec7, src 74f5de4d)

**22/26 (NO-SHIP on the three SwiftShader rows + the reflex row), wall 1635 s, loadavg 40 at boot → 55 at the end (the stale re-runs, a browser-verified sweep and another owner's Playwright jobs shared the box; every timing row is contention-pessimistic).**

```
PASS  boot.readyP50Ms              137.89ms  (limit 300ms)  runs 137/237/144/138/113 min 113 loadavg 40.2/18
FAIL  boot.firstFrameMs            11775.80ms  (limit 4000ms)  ready -> first synced frame; SwiftShader limit; ship target 900ms NOT met (informational on this machine)
PASS  clear.golden                 true  (limit true)  bot-3.json finish=8.566666666666666 run=8.567 faults=0
PASS  clear.finishTimeBitEqual     true  (limit true)  expected 8.566666666666666
PASS  clear.hashOk                 true  (limit true)  b002d139195b5757 vs pinned b002d139195b5757
PASS  clear.pro.flat               true  (limit true)  bot-3-pro.json (src matches) finish=8.041666666666666 faults=0 hash 9defa8078708cfc7 vs pinned 9defa8078708cfc7 (expected finish 8.04166666666666
PASS  clear.pro.b1                 true  (limit true)  bot-3-pro.json (src matches) finish=37.733333333333334 faults=0 hash 49ce97f9fa86a3d5 vs pinned 49ce97f9fa86a3d5 (expected finish 37.733333333333
PASS  crash.faultWithinS           0.75s  (limit 8s)  reason=crash
PASS  fault.toControlMs            50ms  (limit 500ms)  crash tick -> restart mash on the next tick -> bike moving; auto-respawn path 1042 ms (CONTRACT §2.8: 1.0 s)
PASS  restart.ticks                1  (limit 1)  tick==0 && faulted==null after exactly one tick, 20 reps
PASS  restart.wallMsP95            0.14ms  (limit 5ms)
FAIL  restart.frameMsP95           692.32ms  (limit 150ms)  restart -> synced frame; SwiftShader limit; ship target 33ms NOT met (informational on this machine)
PASS  restart.noCountdown          1 ticks  (limit 12 ticks)  worst of 20 reps: held throttle after the restart tick until the bike rolls (a countdown would be 360+); first-tick roll yes; game faults=
PASS  heap.growthMBPer60s          -6.33MB  (limit 5MB)  over 60s of play
PASS  perf.drawCallsMax            194  (limit 300)
PASS  perf.trianglesMax            159427  (limit 500000)
PASS  perf.texturesMBMax           68.93MB  (limit 96MB)
PASS  perf.physicsUsPerTickP95     32.50us  (limit 60us)
PASS  perf.renderSubmitMsP95       2.63ms  (limit 4ms)
FAIL  perf.renderSyncedMsP95       16963.70ms  (limit 250ms)  render + readPixels sync; SwiftShader limit; ship target 16ms NOT met (informational on this machine)
PASS  bundle.jsGzipKB              436.63KB  (limit 600KB)  dist 16251 KB raw
PASS  determinism.pass             true  (limit true)  9/9 checks
PASS  camera.box                   0frames out of box while riding  (limit 0frames out of box while riding)  bot-3.json; clamped 36.8 % (reported); 509 s; camera: PASS out-of-box 0/704 (riding 0), cla
PASS  stranger.medianAttempts      b1 1/1.5 · b2 2/3 · b3 3/3 · e1 -/6 (0 fresh)  (limit 1.5)  median attempts / (1.5 x band top) on src 74f5de4d; informational until every track has >= 2 completed se
FAIL  reflex.medianAttempts        b1 1/1.5 · b2 1/3 · b3 7/3 · e1 7/6  (limit 1.5)  reflex bot (average) median attempts / (1.5 x band top) on src 74f5de4d; armed: outside band
PASS  reflex.medianAttempts.pro    b1 9/1.5 · b2 13/3 · b3 25/3 · e1 32/6  (limit 1.5)  reflex bot (average) on the Pro bike, same tracks and band; informational (the band is Rookie's): 0/4 within ban
NO-SHIP: 22/26 checks pass, track=flat-test, physics=bikePhysicsFactory-v2, wall=1635s
```

`camera.box` is green with the round-8 parser fix (0/704 riding frames out of the box, clamped 36.8 % — reported, not gated; the render owner's b3 rig still sits on its track bounds a third of the ride). `stranger.medianAttempts` reads the r5 sessions on 74f5de4d (b1 1 · b2 2 · b3 3; e1 has no session on this src). `reflex.medianAttempts` armed and outside band on b3 (7 / 3) and e1 (7 / 6). **`harness:reflex b1-first-ride --seeds 1 --browser 1` on HEAD: node run 1 attempt / 56.675 s, `runRecording` browser hash `516d2488ca778e20` IDENTICAL, but the live-keys run fails at `fake clock: expected the countdown after pauseAt, got 'menu'` — the live page opened with `?track=` reaches `ready` and stays on the menu phase after the 30 s fast-forward (the front-screen flow changed under the driver since round 7; `src/game/navlog.ts` is mid-flight in the working tree). Open item; the round-7 live-keys numbers stand.**

### Physics-suite baseline on v2 (`harness:physics-suite --bike both --tag v2-bdf9f0c`, frozen bdf9f0c; the machine carried the Rookie golden sweep, 12 strangers and the tree5 chain, loadavg 7 → 33)

**REJECT: 18 pass, 6 fail, 8 info; wall 2168 s; report `out/physics-suite/20260915T001716Z-bikePhysicsFactory-v2-v2-bdf9f0c.{json,md}` (+ `latest.*`).** The six: `feel.envelope` 74/94 in band (the physics owner's own bands: hop.ref.bothOffS 0.292 [0.35–0.6], frontSag 16.8 % [24–28], launch t16 4.48 s [3.5–4.2], wheelie hold rows, lab hop margins −0.06 / −0.04 [≥ 0.1] — the same list as the v1 baseline's `see it.fails`); `determinism.rookie.D1-D8` 8/9 — D8 only, the pin predated the R4 goldens (re-pinned by the gate above; D1–D7 + D4c pass); `reflex.rookie.b3 / e1 / e2` 4 / 8 / 8 vs bands 1–2 / 2–4 / 3–5 (the finding; b1 1, b2 1, e3 8 PASS); `camera.b3` — the clip was green (`PASS out-of-box 0/979, clamped 12.1 %`) and the suite's parser wanted a `camera:` line; **fixed in `physics-suite.ts` after the run** (the gate's round-8 fix mirrored), so the next suite reads 19 pass / 5 fail. Passes: identity, `feel.vitest` 12/12, Pro D1–D8 9/9 + both snapshot probes 600/600, the naive sweep, skill-3 clears browser-verified on b1/e1/m1/h1/x1 both classes (Pro e1 3 attempts, everything else 1), stranger smoke 8/8. Against the v1 baseline (`20260914T192455Z-…-v1-42bdfe0`, 2042 s): same instrument set, v2 clears x1 on both classes where v1 walled the Pro. This suite is on **bdf9f0c (R4)**; the R5 tree got the gate and the matrix but not a second suite (37 min at loadavg 30+).

### Timelapse

Ledger appended 96 → 100 (fc17e77 harness r8, 12a29f2 render r12, bdf9f0c physics R4, e05153e loader — every commit built +
captured; 5.3 min, niced); `progress-stills.mp4` / `progress-clips.mp4` (13 milestones, 54.0 s, 34.3 MB) / `progress.gif`
(11.6 MB) re-rendered. cf13f8b and e8f2ec7 landed after the pass and are the next holder's first two ledger rows.

### Open

- **e3-stairway is out of band for every human proxy** (strangers 20 / 11-not-cleared vs band 3–6; reflex average 8 on R4,
  35 on R5 with a 3-seed spread of 7–28): the 0.25 m flights at 165 and 407 m and the 2 m pit after the descent. Tracks owner:
  the stair flights want either a longer tread (the reflex rider stalls at 1 m/s when the gas is chopped on the risers) or a
  lower riser; the strangers' working line was an 11 m/s wheelie entry, which is not a beginner move.
- **Rookie x3-gauntlet no longer clears at skill 3 on R4/R5** (32 attempts, walled at the 483.6 m pole, 97 %): the R4 assist
  takes 1–2 m/s off every kicker exit and x3's last section is authored to the old exit speed. Tracks / physics owners.
- **Reflex 3-seed medians are noisy on e2 / e3 / m3** (seed spread 4–38, 4–28, 5–36): the matrix should run 9 seeds on those
  three, or the bands should be judged on the 9-seed median. The 40 s matrix makes 9 seeds cheap.
- **`air-brake-nose-down` is now the recurring death** (b3 170 m, e1 446 m, e2 506 m, m1 119 m, x3 60 m): the brake nudge
  fires on a nose-high exit and the R4 table says a brake tap is −15° per half second — the rule may be right and the exits
  too high (Rookie kicker lip 17°, +1 pose 15°), or the nudge lands as the rear wheel skims the ramp. Next holder: trace the
  five sites with `scratchpad/harness8/trace.mts` before touching the rule.
- **`?perf=1` overlay does not carry `debugInfo()`** (see the table): core-game request — `PerfSample` + `HookInfo` need
  `tier / dpr / canvasW / canvasH / rtMpx / rtMB / rtPasses / shadowMap`.
- The Pro `average` rows are 7–46 on every course but flat/lab (b1 9, b2 13, b3 25, e1 32): the Pro has no ramp assist and
  the reflex Pro ramp move (+1, thr 0.3 above 9 m/s) did not close it. The bands are authored for the Rookie; the Pro
  rows stay informational.
- `harness:reflex --browser` still drives the live game on its default bike (rookie) only.
- `sync.sh --delete` over `inputs/` (see shared checkout): the harness owner's overlay script must exclude `inputs/` and
  `out/`; documented in the table, fixed in the script.

## Round 8 status — harness on physics v2: goldens/gate re-pinned, reflex bot retuned to v2, the human-like measure still out of band on 12 of 16 courses

**Finding.** On physics v2 with tracks r7 the search bot clears **all 19 tracks on both classes in ≤ 3 attempts**
(3 seeds, 600 s wall, byte-identical across seeds; on the pre-r7 tracks the Pro was walled on m3 @ 204.6 m and x1 @
60 m, and v1 never cleared Rookie x1/x3) — the bot is no longer the constraint anywhere; the human-like instrument did
not survive the flip: the reflex `average` player, within band on every beginner/easy track
on v1, was **outside `attemptsBand` on 15 of 17 courses** on the first v2 run (b2 27 [1–2], b3 37, e1 35, m1 51 cap …).
The traces (`out/reflex/<track>/*.rec.json` replayed tick by tick) show one mechanism: on the v2 Rookie **full gas on a
17–22° kicker at 10 m/s lifts the front at 100–200 °/s** (the slope unloads the front wheel), the loop-out reflex
brakes, the bike leaves the lip nose-high, and **a throttle tap in the air kicks the pitch rate by 200–400 °/s within
0.07 s** whenever the rear wheel skims the ramp (e1 trace t = 872–876: rate 41 → 226 → 396 °/s) — every correction
overshoots into the next crash. Retuning the controller to v2 (the tracks owner's four defects: gas with lean −0.3 on
the ground → neutral, v2's critical lean is −0.1; gas + lean −1 held through touchdown → hands off from 0.25 s before
the wheels meet the ground; Pro launched at lean 0 from spawns → +0.35 launch pose below 4 m/s; stair flights read as
a lip every step → a lip needs no steep ground behind it; plus the v2 hop recipe and lean-only air correction) brought
the re-authored beginner courses back to **b1 4 · b2 8 · b3 12 · gap 1** (all 3/3 clears; `good` b1 1 · b2 3 · b3 17)
but leaves **12 of 16 courses over band** on Rookie `average`, with the same two air rules on 60 % of the deaths.
Stranger round 4 (18 sessions prepped) is the calibration input: until a human-like agent clears b2/b3/e1 on v2 in
band, the reflex table describes the v2 Rookie's on-ramp behaviour, not the tracks.

| piece | as built |
|---|---|
| **solver stamp** (`lib/recording.ts`, `lib/sim.ts`, `lib/verify.ts`, `lib/golden.ts`) | `recordingHeader(sim, note)` writes `bike` + `physics` (core r7's `RecordingHeader.physics`: JSON key + second binary trailer byte) and `physics=<v>` in the note; every header site (bot, reflex, stranger) uses it. `Sim.physicsVersion` ('v2' since the flip, 'v1' under `createSim(..., { physics: 'v1' })` → `createBikePhysicsV1`), `Sim.physicsName` = `bikePhysicsFactory-v2`. `createSimFor(rec)` honours an explicit `'v1'` (the verifier then opens the page with `?physics=v1`); unstamped = pre-flip runs on the default and fails as stale. `--refresh-goldens` calls a golden fresh only when src **and** physics stamps match, so a node-only file is re-proved in the browser and restamped. `gate/expected.json` pins carry the solver name. |
| **technique macros** (`bot/actions.ts`, `bot/beam.ts`, `bot/play.ts`, `stranger/cli.ts`, `gate/snapshot-probe.ts`) | `h` hop (5 slots, the R2 recipe: 0.3 s preload lean −1 / thr 0.3, 0.22 s snap +1 / 0.5, 0.1 s tuck), `wh` wheelie hold (4 slots, closed loop = `wheelieHoldV3`'s `pitch + rate × 0.25 s` regulator, lean parked −0.5, rear brake past the target), `ct` climb-throw (4 slots, closed loop = `r3.test.ts plank`: base gas at neutral until the front is on the face, then +1 and gas, chopped 20–30° over the slope). Macros may span slots and decide per tick (`macroFrameAt` / `macroTicks` / `MacroCtx`); the beam rolls a long macro HOLD ticks per depth as a non-branching `pending` node so a depth stays 125 ms and finishes compare on the run clock (rolling whole macros per depth biased the search slower: flat-test 9.65 → 8.49 s). Stranger codes in `PROTOCOL.md` (5/4/4 of the 40 slots). The bot did not need them on any course it already cleared and they did not unblock Pro m3/x1. |
| **reflex bot on v2** (`reflex/controller.ts`, `reflex/reflex.ts`) | the retune above: rules `launch`, `touchdown`, `hop-preload/snap/tuck`, `ramp-ride` / `ramp-lip-release`, `steep-ahead` neutral → `climbing` throw (faces ≥ 30° below 5.5 m/s), `air-gas-nose-up` is lean-only (gas only past −35° and still falling), `air-brake-nose-down` from 30° over. `--all-tracks --skill novice,average,good` (or `all`) writes the whole matrix, one section per bike × skill, loadavg in the sweep line. |
| **gate** (`gate/ship-gate.ts`) | new row `camera.box`: the b3 Rookie golden rendered by `clip.ts` (20 fps, low) in a child; pass = 0 riding frames outside [0.2, 0.8] on `bikeScreenX/Y` (settle excluded) and |roll| < 1e-6; `clamped %` reported in the note, not gated; skipped with `--quick`. 26 checks. |
| **stranger** (`stranger/PROTOCOL.md`, `stranger prep --round r4`) | "How the bike feels" for v2 (0→16 in ~4 s, top 20; `gb` > 1 s loops, balance ~50° at lean 0 / ~40° a little back; the hop as a move; drops safe; climbs are geometry: 37° at a crawl, 40–45° need the throw, steeper wants speed) + the three technique codes. Round 4 prepped: 18 sessions (b1–e3, m1–m3 × s1/s2, Rookie) in `out/stranger/rounds/r4/{spawn.md,manifest.json}` — prepped on 955cce67 before tracks r7; **re-run `prep --round r4` on the final HEAD before spawning** (a session's src stamp must match). No sessions started (the machine carried the sweep + gate, loadavg 4 → 14). |
| **timelapse** | ledger 79 → 90 commits at the first pass (through 9b4275c), then appended to e55c4dd with the wave-2 milestone montage (see below). |
| **shared checkout** | The first golden sweep ran while other owners edited `src/` (fingerprint 955cce67 → d059ef71 / 6c1497e9 / 6714cf44 / 1f662745; `dist/` 21:33Z vs `src/` 22:07Z): 12 runs mismatched node vs browser and the bot correctly refused to write those goldens. Then tracks r7 landed (5558637) and every number had to be redone: the retune, the reflex matrix, the 3-seed goldens and the gate ran in a **`git archive HEAD` (733c830, src fingerprint 93e6caa5) copy in the scratchpad with this round's `harness/` overlaid** (`scratchpad/harness7/tree2`: offline `pnpm install`, own `vite build`); `inputs/*/bot-3*.json`, `out/metrics/<track>[.pro].json`, `*.reflex.json`, `reflex.md`, `gate/expected.json`, `ship-gate.json` copied back. A syncer loop copied goldens back as they landed; if the sweep was still running when this was written, finish with `rsync tree2/harness/inputs/ harness/inputs/` + the metrics. |

### Goldens, skill 3, **3 seeds, 600 s wall**, every clear browser-verified (node hash == page hash), physics v2, HEAD 733c830 / src 93e6caa5

| track | Rookie attempts | Rookie finish s | Rookie hash | Pro attempts | Pro finish s | Pro hash | note |
|---|---:|---:|---|---:|---:|---|---|
| flat-test | 1 | 8.492 | `01bb78027557a102` | 1 | 8.042 | `9defa8078708cfc7` |  |
| b1-first-ride | 1 | 40.425 | `e504886f80b8220e` | 1 | 37.733 | `49ce97f9fa86a3d5` |  |
| gap-test | 1 | 5.483 | `7bdb317d023daee8` | 1 | 5.275 | `34036ceeec4f0b63` |  |
| b2-lean-back | 1 | 38.633 | `5a004c5f522d7fdc` | 1 | 36.042 | `1b9bda72654a3122` |  |
| b3-kicker-row | 1 | 32.608 | `a1abffd78451fab7` | 1 | 30.933 | `49f5577526091eff` |  |
| e1-uphill-weight | 1 | 42.125 | `f97a6a950de20c14` | 3 | 50.933 | `e15424aa80849d66` |  |
| e2-rear-wheel-first | 1 | 43.958 | `a0c3327c7217ac95` | 2 | 48.583 | `f50b6bcbdbc2537b` |  |
| e3-stairway | 1 | 42.192 | `e7fe07e5184bb4c3` | 2 | 43.392 | `04b619a28d7f372b` |  |
| m1-hop-up | 1 | 33.808 | `863d0eba06d95c59` | 1 | 32.958 | `01b43734856a5ac6` |  |
| m2-drum-roll | 1 | 38.617 | `3fe8940514f2d599` | 1 | 33.000 | `6638b0e183172c5a` |  |
| m3-see-saw | 1 | 40.708 | `ba85ad388537b606` | 1 | 38.267 | `3dde998cff52f104` |  |
| h1-wheelie-wire | 1 | 46.300 | `19f1f4bf1d290fa8` | 1 | 43.975 | `63ae70eb87c9b594` |  |
| h2-gap-chain | 2 | 52.967 | `b52b6c14b9f39e17` | 2 | 51.200 | `d8d5bc6b1e0e8b08` |  |
| h3-fire-line | 2 | 49.200 | `f0019f680f3b1edc` | 3 | 50.025 | `c55c0fe4347e8f08` |  |
| x1-vertical-limit | 2 | 62.558 | `7de19ffb492e8e92` | 1 | 55.825 | `8e580c404664b2c6` |  |
| x2-pipe-dream | 1 | 40.625 | `eda4a3917fc0505d` | 1 | 41.650 | `5aa8b29e4f65c331` |  |
| x3-gauntlet | 1 | 42.433 | `46d89f2166be9e8a` | 1 | 42.458 | `7fb47f7a7308877b` |  |
| lab-flat-200 | 1 | 12.533 | `af9baed0d0bbf9cf` | 1 | 11.900 | `c995e804e8430b3c` |  |
| lab-physics-test | 1 | 8.100 | `c90e61213bb3a91f` | 1 | 7.550 | `6b09bcb04f0512be` |  |

The sweep finished at 19:41 (0 node/browser mismatches, `--refresh-goldens` afterwards: 38/38 fresh, 19/19 tracks
proven on both classes). The three seeds gave byte-identical finishes on every course (these lines carry no seeded
element), so the 3-seed median equals the single run; the tracks owner's x1 3 → 32 → 2 swing is metre-level authoring
sensitivity, not seed noise. Slowest clears: Pro e1 3 attempts / 50.9 s, Pro h3 3 / 50.0 s, Rookie x1 2 / 62.6 s. On
the previous HEAD (45f6b62, before tracks r7, one seed) the same instrument gave Pro m3 50 (cap, 204.6 m ramp) and Pro
x1 48 (cap, 8 %); every other course ≤ 3.

### Ship gate (`harness:gate --pin --heap-seconds 60`, frozen HEAD 733c830, src 93e6caa5)

**21/26, wall 626 s, loadavg 13.6 at boot → 29 at the heap window → 17 at the end (the 3-seed sweep and the montage
captures shared the box; every timing row is contention-pessimistic).** Pins: Rookie `clear.golden` 8.4917 s
`01bb78027557a102` (canonical-1200 `523feb61aa8ab467`), `clear.pro.flat` 8.0417 s `9defa8078708cfc7`, `clear.pro.b1`
37.733 s `49ce97f9fa86a3d5`; `expected.json` records `physics: bikePhysicsFactory-v2`. PASS: boot p50 84 ms (runs
285/616/83/82/84, min 82), crash 0.75 s, fault→control 50 ms (auto-respawn path 1042 ms), restart 1 tick / 0.13 ms
p95 / no countdown (1 tick), **heap −8.97 MB per 60 s** (5.65 last round; first pass under the 5 MB limit), draw calls
200, triangles 155 654, textures 68.9 MB, physics 27.5 µs/tick p95, render submit 2.56 ms, bundle 432.7 KB gz,
determinism 9/9 (D1–D5, D4b, **D4c foreign snapshot on v2**, D7 on the other class first, D8 re-pinned), stranger row
informational (0 fresh sessions on 93e6caa5). FAIL: `boot.firstFrameMs` 7377 ms, `restart.frameMsP95` 440 ms,
`perf.renderSyncedMsP95` 6412 ms (the three SwiftShader rows, informational on this machine, worse than round 7 under
the load); **`reflex.medianAttempts` armed and outside band: b1 4/1.5 · b2 8/3 · b3 12/3 · e1 31/6** (the round's
finding); `camera.box` FAIL **by a parser bug only** — the clip ran and its assertion read `PASS out-of-box 0/672
(riding 0), clamped 249 (37.1 %), max|roll| 2.8e-17` (198 s), but the gate looked for a `camera:` line and the clip
prints a table row; fixed after the run (both forms parsed), so the next `harness:gate` turns the row green with
clamped 37.1 % in its note (render owner: the b3 rig sits on its track bounds a third of the ride; reported, not gated).
`reflex.medianAttempts.pro` informational: b1 6 · b2 24 · b3 42 · e1 38 (0/4 within the Rookie band).

### Reflex matrix on v2 (`harness:reflex --all-tracks --bike both --skill novice,average,good --seeds 3`, HEAD 733c830; full tables with every death rule in `out/metrics/reflex.md`)

Median attempts over 3 seeds (clears / 3); death site = the obstacle that took the most attempts across the three
Rookie `average` seeds, with the rule the rider was executing.

| track | band | Rookie novice | Rookie average | Rookie good | Pro novice | Pro average | Pro good | Rookie average death site (x · obstacle · rule) | out of band (Rookie avg) |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| gap-test | 1–3 | 2 (3/3) | 1 (3/3) | 2 (3/3) | 4 (3/3) | 5 (3/3) | 2 (3/3) | — | in band |
| b1-first-ride | 1–1 | 3 (3/3) | 4 (3/3) | 1 (3/3) | 19 (3/3) | 6 (3/3) | 2 (3/3) | ground @ 575 m ×3 (air-gas-nose-up) | 4 > 1 |
| b2-lean-back | 1–2 | 19 (3/3) | 8 (3/3) | 3 (3/3) | 33 (1/3) | 24 (3/3) | 7 (3/3) | ground @ 295 m ×3 (air-brake-nose-down) | 8 > 2 |
| b3-kicker-row | 1–2 | 36 (1/3) | 12 (3/3) | 17 (3/3) | 43 (0/3) | 42 (1/3) | 21 (3/3) | ground @ 325 m ×6 (nose-high) | 12 > 2 |
| e1-uphill-weight | 2–4 | 31 (0/3) | 31 (1/3) | 27 (3/3) | 37 (0/3) | 38 (0/3) | 39 (0/3) | ramp @ 211.0 m ×15 (nose-low) | 31 > 4 |
| e2-rear-wheel-first | 3–5 | 43 (0/3) | 38 (0/3) | 18 (2/3) | 43 (0/3) | 41 (0/3) | 35 (1/3) | ramp @ 57.0 m ×21 (air-gas-nose-up) | 38 > 5 |
| e3-stairway | 3–6 | 39 (0/3) | 44 (0/3) | 48 (0/3) | 45 (0/3) | 43 (0/3) | 45 (0/3) | stair @ 164.5 m ×73 (stuck-restart) | 44 > 6 |
| m1-hop-up | 5–9 | 51 (0/3) | 51 (0/3) | 42 (1/3) | 51 (0/3) | 49 (0/3) | 47 (0/3) | ledge @ 119.0 m ×55 (air-brake-nose-down) | 51 > 9 |
| m2-drum-roll | 6–12 | 40 (0/3) | 40 (0/3) | 37 (2/3) | 44 (0/3) | 42 (0/3) | 47 (0/3) | ramp @ 311.2 m ×14 (air-gas-nose-up) | 40 > 12 |
| m3-see-saw | 8–12 | 39 (1/3) | 38 (1/3) | 33 (1/3) | 43 (0/3) | 42 (0/3) | 43 (0/3) | ground @ 410 m ×27 (air-brake-nose-down) | 38 > 12 |
| h1-wheelie-wire | 10–18 | 47 (0/3) | 46 (0/3) | 51 (0/3) | 50 (0/3) | 51 (0/3) | 51 (0/3) | wall @ 175.8 m ×42 (air-gas-nose-up) | 46 > 18 |
| h2-gap-chain | 14–22 | 49 (0/3) | 50 (0/3) | 46 (0/3) | 47 (0/3) | 51 (0/3) | 44 (0/3) | ramp @ 62.0 m ×54 (air-gas-nose-up) | 50 > 22 |
| h3-fire-line | 18–25 | 37 (0/3) | 40 (0/3) | 39 (1/3) | 42 (0/3) | 44 (0/3) | 44 (0/3) | ledge @ 389.6 m ×15 (nose-low) | 40 > 25 |
| x1-vertical-limit | 30–45 | 36 (0/3) | 33 (0/3) | 33 (0/3) | 40 (0/3) | 36 (0/3) | 38 (0/3) | ramp @ 227.9 m ×40 (stuck-restart) | in band |
| x2-pipe-dream | 40–60 | 41 (0/3) | 39 (0/3) | 50 (0/3) | 43 (0/3) | 39 (0/3) | 42 (0/3) | box @ 227.8 m ×26 (nose-high) | in band |
| x3-gauntlet | 60–80 | 34 (0/3) | 37 (0/3) | 29 (0/3) | 38 (0/3) | 37 (0/3) | 36 (0/3) | ramp @ 60.2 m ×42 (air-gas-nose-up) | in band |
| lab-flat-200 | 1–1 | 1 (3/3) | 1 (3/3) | 1 (3/3) | 5 (3/3) | 2 (3/3) | 3 (3/3) | ground @ 25 m ×1 (nose-high) | in band |
| lab-physics-test | 3–8 | 2 (3/3) | 2 (3/3) | 1 (3/3) | 12 (3/3) | 9 (3/3) | 2 (3/3) | ground @ 20 m ×1 (nose-high) | in band |

**Out of band for the tracks owner (Rookie `average`, the tier's default bike).** In band: gap-test 1 [1–3], x1 33
[30–45], x2 39 [40–60], x3 37 [60–80] (the extreme rows are "in band" only because the 50-attempt cap sits inside their
bands — 0/3 clears), lab-flat-200 1, lab-physics-test 2. Over band and the recurring death:

- b1-first-ride: median 4 vs band 1–1; recurring death ground @ 575 m ×3 (air-gas-nose-up)
- b2-lean-back: median 8 vs band 1–2; recurring death ground @ 295 m ×3 (air-brake-nose-down)
- b3-kicker-row: median 12 vs band 1–2; recurring death ground @ 325 m ×6 (nose-high)
- e1-uphill-weight: median 31 vs band 2–4; recurring death ramp @ 211.0 m ×15 (nose-low)
- e2-rear-wheel-first: median 38 vs band 3–5; recurring death ramp @ 57.0 m ×21 (air-gas-nose-up)
- e3-stairway: median 44 vs band 3–6; recurring death stair @ 164.5 m ×73 (stuck-restart)
- m1-hop-up: median 51 vs band 5–9; recurring death ledge @ 119.0 m ×55 (air-brake-nose-down)
- m2-drum-roll: median 40 vs band 6–12; recurring death ramp @ 311.2 m ×14 (air-gas-nose-up)
- m3-see-saw: median 38 vs band 8–12; recurring death ground @ 410 m ×27 (air-brake-nose-down)
- h1-wheelie-wire: median 46 vs band 10–18; recurring death wall @ 175.8 m ×42 (air-gas-nose-up)
- h2-gap-chain: median 50 vs band 14–22; recurring death ramp @ 62.0 m ×54 (air-gas-nose-up)
- h3-fire-line: median 40 vs band 18–25; recurring death ledge @ 389.6 m ×15 (nose-low)

The same sites recur across the three skills and both classes; the Pro rows are worse everywhere (b1 6, b2 24, b3 42,
e1 38). `good` clears b1–e1 in band-ish numbers (1 / 3 / 17 / 27) — the courses are rideable by a fast-reacting
player on v2, not by an average one.

### Physics-suite baseline on v2

Not run this round: the 3-seed golden sweep, the gate and the wave-2 montage had the machine (loadavg 13–29), and a
suite run under that load is not a baseline. First job for the next holder, in a frozen HEAD copy:
`pnpm harness:physics-suite --bike both --tag v2-<sha>`, diff against
`out/physics-suite/20260914T192455Z-bikePhysicsFactory-v1-42bdfe0.json`. Its instruments already ran piecewise on v2
this round: determinism 9/9 incl. D4c and the snapshot probe (gate), skill-3 clears on every course (goldens), reflex
b1–e3 (the matrix), camera on the b3 golden (0/672 out of box, 37.1 % clamped).

### Timelapse

Ledger appended to HEAD e55c4dd (79 → 90 → every commit through e55c4dd built + captured; 8.4 min for the second pass,
niced). Wave-2 milestone montage **`harness/out/timelapse/progress-wave2.mp4`: 30.0 s, 20.3 MB** (crf 22 re-encode of
the 26.7 MB render): 94ecb43 v0.1.0 → fcff90a the hop → e220331 R3 landing → 9b4275c v2 default → fd01a66 render r11 →
5558637 tracks r7 → e55c4dd HEAD (4 s per build, full gas from t = 0, b1-first-ride).

### Open

- **HEAD moved again while this was written: physics v2 R5 (e8f2ec7) landed after the sweep** — every number above is
  on 733c830 / src 93e6caa5 and is stale against R5's physics (the R5 commit quotes the retuned reflex bot on its own
  tree: e2 36 → 10, e3 30 → 12, b3 14 → 4.5, e1 21 → 11, b1 1). Next holder, in a frozen HEAD copy: `pnpm harness:bot
  --refresh-goldens --build`, then `harness:bot <track> --bike <class> --skill 3 --seeds 3` for whatever went stale,
  `harness:gate --pin`, the reflex matrix, and the physics-suite. `typecheck`/`lint` are clean for `harness/**` proper;
  the only failures in the tree are in the untracked scratch file `harness/e2e/_repro.mts` (another owner's, 5 `any`s
  and one TS2345) — not mine to fix, do not commit it.
- **Reflex bot vs v2 is still uncalibrated**: the four defects are fixed and the beginner rows moved 3–4× (b2 27 → 8,
  b3 37 → 12), but 12/16 courses stay over band with `air-gas-nose-up` / `air-brake-nose-down` / `nose-low` as the
  cause. Either the air rules are still too coarse for v2 (the physics owner should confirm the 200–400 °/s air kick on
  a rear-wheel ramp touch is intended) or the bands are v1 bands. Stranger round 4 decides; re-prep it on the final HEAD.
- Pro m3/x1 blockers are gone with tracks r7 (both 1 attempt on 733c830); nothing is bot-blocked.
- 3-seed medians: on flat-test / gap-test / b1 the three seeds give byte-identical finishes (the tracks have no seeded
  element), so seed spread only appears where a course is seeded; the x1 3 → 32 → 2 swing the tracks owner saw is
  metre-level authoring sensitivity, not seed noise.
- Physics-suite on v2 not run this round (the sweep and gate had the machine) — first job for the next holder:
  `pnpm harness:physics-suite --bike both --tag v2-<sha>` in a frozen HEAD copy, diff against
  `out/physics-suite/20260914T192455Z-bikePhysicsFactory-v1-42bdfe0.json`.
- `harness:reflex --browser` still drives the live game on its default bike only.

## Round 7 status — bike class through the harness, goldens per class, the physics-suite

**Finding.** `header.bike` does not survive a decode: `validateHeader` in `src/core/replay.ts` copies `note` but not
`bike`, and the binary layout has no field for it (`decodeAny(encodeJSON({bike:'pro'})).header.bike === undefined`, same
for binary). `Game.runRecording` reads `rec.header.bike` *after* decoding, so through the game's own path every Pro
recording replays on Rookie — the Pro flat-test golden then stops at x 86.7 m (rookie sim, `4e1b2c79…`) instead of
finishing (pro sim, `1cbec09b…`). `src/game/ghost.ts` reads the same field for the PB ghost, so a PB set on Pro ghosts
on Rookie today. The harness works around it (`loadRecording` re-reads `bike` from the raw JSON; `openGame` installs
`window.__trialsRunAs(json)`, which parses the raw header and for `pro` does `setBike('pro')` + `loadTrack` +
`skipCountdown` + the same per-tick `setInput`/`step(1)` loop `runRecording` runs; every browser path uses it), and every
Pro golden below is node hash == page hash through that path. **Requested src change (core-game):** copy `bike` in
`validateHeader`, add a class byte to the binary header; then `__trialsRunAs` collapses to `runRecording`.

**Second finding (physics 42bdfe0 vs the round-6 goldens, tracks owner).** At skill 3 the Rookie bot no longer clears
**x1** (50 attempts, walled at 399 m on open ground, 54 %; twice, once at loadavg 4) or **x3** (50 attempts, all at the
gap @ 150.4 m, 30 %), both cleared in ≤ 2 attempts last round; the Pro bot clears both in **1 attempt** (x1 41.4 s, x3
30.2 s). Conversely the Pro bot cannot clear **m2** (50 attempts at the logpile @ 425.4 m, 88 % — the same obstacle the
Pro reflex player dies on ×30) or **m3** (50 attempts, 219 m, 45 %), which Rookie clears in 1. Every other track clears
on both classes in 1–2 attempts; Pro is 6–8 s faster on every 30–40 s track (real CdA + sharper throttle).

| piece | as built |
|---|---|
| **bike class** (`lib/sim.ts`) | `createSim(trackId, seed, hz, { bike })` → `world.loadTrack(compiled, seed, { bike })`; `Sim.bike`; `createSimFor(rec)` = the sim a recording's header names; `parseBike('--bike')`. `bot`, `reflex`, `stranger start/prep`, `--all-tracks` sweeps take `--bike rookie\|pro` (default rookie); every recording header carries `bike` (+ `bike=<cls>` in the note); every report/metrics file carries `bike`. Clip/capture pick the class from the recording (`hook.setBike` before `loadTrack`). `harness/trailer/**` untouched (rookie goldens only). |
| **goldens per class** (`lib/golden.ts`) | `bot-<skill>.json` stays Rookie (no file was renamed); Pro is `bot-<skill>-pro.json`. `goldenOrder(bike)`, `chooseGolden(track, bike)`, `pickGolden(track, log, bike)`, `goldenBike(file)`; `--refresh-goldens` re-proves both sets. Metrics `out/metrics/<track>.json` / `<track>.pro.json`, reflex `<track>.reflex.json` / `<track>.pro.reflex.json`, crash `crash[-pro].json`. |
| **determinism** (`gate/determinism.ts`) | all page evaluates `setBike` before `loadTrack`; D1/D3/D5/D7 replay through `__trialsRunAs`; D2 carries the class over the binary round trip (the binary has no field); D7 primes 600 ticks on the *other* class first (a Pro golden after Rookie play and vice versa); **D4c foreign snapshot** (new): a snapshot from sim A restored into a fresh sim B continues identically at 4 (k, m) pairs — the check physics v2 is accepted against, not only the same-instance D4; D8 pins per class (`expected.json` keys `<track>` / `<track>:pro`). `snapshot-probe.ts` exports `snapshotProbe()` and names the class. |
| **gate** (`gate/ship-gate.ts`) | G2b `clear.pro.flat` + `clear.pro.b1`: the fingerprint-matched `bot-3-pro.json` of flat-test and b1 replayed in the page, finish bit-equal + hash vs `expected.json[<track>:pro]` (pinned with `--pin` / first run); G10 third row `reflex.medianAttempts.pro` (same tracks, from `<track>.pro.reflex.json`; informational by design — the band is authored for the tier's default bike — but every number is in `ship-gate.json.reflexPro`). 25 checks now. |
| **`pnpm harness:physics-suite`** (`harness/physics-suite.ts`) | one command, one JSON + md, against whatever `src/physics` exports: identity → feel envelope (`vitest run src/physics`, every `FEEL <q> = <v> [band]` line parsed, band-checked when the band is `a-b`, `< x`, `<= x`, `|q| < x`, else info) → determinism D1–D8 + D4c + snapshot-probe per class → naive sweep (skill 2, 1 seed, 90 s/track) → bot skill-3 clears on b1/e1/m1/h1/x1 per class, each browser-verified → reflex `average` × 3 seeds on b1–e3 per class → camera box on the b3 golden clip (`harness:clip` as a child) → stranger CLI smoke (start/look/play/crash-respawn/restart/reset/status, recording node == browser, session removed afterwards). `--bike both`, `--quick`, `--skip …`, `--tag`; `ACCEPT`/`REJECT`, exit = FAIL count; output `out/physics-suite/<stamp>-<physics>-<tag>.{json,md}` + `latest.*`; the round's run is committed as `out/metrics/physics-suite.md`. To accept v2: run with `--tag v2`, diff against `…-v1-42bdfe0.json`. |
| **timelapse** | ledger appended 54 → 79 commits (77 built + captured; 2 pre-package.json scaffolds skipped). `render.mts` now resolves `--out` absolutely (a relative `--out` doubled the path prefix inside ffmpeg's concat list — round-7 fix). Wave-1 montage `harness/out/timelapse/progress-wave1.mp4`: 94ecb43 (v0.1.0) → 1946a80 storyboards → 42bdfe0 physics r11 → ffe63dd render recipe → 8f4d67d art → ae92c9a garage/PWA → f468cb0 (latest, appended by the renderer), 30.0 s, **19.3 MiB** (crf 22 re-encode of the 26.1 MB render). |
| **shared-checkout hygiene** | The Pro pass from h1 on hit `MISMATCH node ac178ce8 != browser 0f091653` (browser faults 15, node 0): `src/physics/bike.ts` was being edited in the working tree (physics v2 work in flight, `src/physics/v2/` untracked) while `dist/` was from 13:39. Everything from there on — Pro h1–x3, the Rookie x1/x3 re-runs, `--refresh-goldens`, the reflex matrix, the gate and the physics-suite — ran in a **`git archive HEAD` copy (46443e5) in the scratchpad with this round's `harness/` overlaid**, offline `pnpm install`, its own `vite build`, src fingerprint **4c6d9739**; results copied back (`inputs/`, `out/metrics/`, `gate/expected.json`, `out/physics-suite/`). Numbers below are that tree's. |

### Goldens, skill 3, one seed, sequential, every clear browser-verified (node hash == page hash)

| track | Rookie attempts | Rookie finish | Pro attempts | Pro finish | note |
|---|---:|---:|---:|---:|---|
| flat-test | 1 | 7.092 | 1 | 6.142 | gate G2 / G2b goldens |
| gap-test | 1 | 4.275 | 1 | 3.533 | |
| b1-first-ride | 1 | 33.933 | 1 | 27.325 | gate G2b |
| b2-lean-back | 1 | 34.200 | 1 | 27.608 | |
| b3-kicker-row | 1 | 28.667 | 2 | 29.492 | |
| e1-uphill-weight | 1 | 36.250 | 1 | 29.492 | |
| e2-rear-wheel-first | 1 | 37.492 | 1 | 29.800 | |
| e3-stairway | 1 | 33.300 | 1 | 26.925 | |
| m1-hop-up | 1 | 29.050 | 1 | 23.608 | |
| m2-drum-roll | 1 | 34.233 | 50 (cap) | — 88 % | Pro walled at the logpile @ 425.4 m |
| m3-see-saw | 1 | 33.358 | 50 (cap) | — 45 % | Pro walled at 219 m (open ground) |
| h1-wheelie-wire | 1 | 38.575 | 2 | 32.958 | |
| h2-gap-chain | 1 | 41.525 | 1 | 31.667 | |
| h3-fire-line | 1 | 35.242 | 1 | 29.175 | |
| x1-vertical-limit | 50 (cap) | — 54 % | 1 | 41.367 | Rookie walled at 399 m (open ground); old bot-3.json stale |
| x2-pipe-dream | 1 | 35.492 | 2 | 32.858 | |
| x3-gauntlet | 50 (cap) | — 30 % | 1 | 30.208 | Rookie dies at the gap @ 150.4 m; old bot-3.json stale |
| lab-flat-200 (new, 46443e5) | 1 | 11.175 | 1 | 9.575 | |
| lab-physics-test (new) | 1 | 6.467 | 1 | 5.475 | |

`--refresh-goldens` on 4c6d9739: 6 fresh, 26 restamped (every round-6 Rookie skill-3 golden that still finishes re-proved
node == browser), 23 stale (the old lower-skill leftovers plus x1/x3 `bot-3.json`, which no longer finish: 8.8 m / 88.9 m);
17/19 tracks with a proven Rookie golden before the lab runs, 19/19 after; 17/19 Pro.

### Ship gate (`harness:gate --pin`, frozen HEAD 46443e5, src 4c6d9739, loadavg 5 → 6)

**21/25.** New rows: `clear.pro.flat` PASS (6.1417 s, `0b43233b0a69890a`), `clear.pro.b1` PASS (27.325 s, `6e9c13b78af852ff`),
`reflex.medianAttempts.pro` informational (b1 1/1.5 · b2 5/3 · b3 6/3 · e1 33/6, 1/4 within the Rookie band). Rookie
`clear.*` re-pinned on the 42bdfe0 physics (finish 7.0917, `468698322c4ed60d`; canonical-1200 `f687ce0364160cb0`),
`determinism.pass` 9/9 (D4c included), G10 reflex Rookie armed and within band (b1 1/1.5 · b2 1/3 · b3 2/3 · e1 3/6),
G10 stranger 0 fresh sessions on this src (round 3 strangers pending). Fails: the three SwiftShader render timings
(`boot.firstFrameMs` 5276, `restart.frameMsP95` 208, `perf.renderSyncedMsP95` 4068) and `heap.growthMBPer60s` **5.65 MB**
(limit 5; 9.6 last round). `fault.toControlMs` 41.7 ms, `restart.ticks` 1, `restart.noCountdown` 2 ticks, physics 27.5 µs/tick.

### Reflex `average`, 3 seeds, both classes (`harness:reflex --all-tracks --bike both --seeds 3`, 10 s wall; full tables in `out/metrics/reflex.md`)

| track | band | Rookie attempts → median (clears) | Pro attempts → median (clears) | Pro deaths (top) |
|---|---|---|---|---|
| flat-test | — | 1, 1, 1 → 1 (3/3) | 1, 1, 1 → 1 (3/3) | — |
| gap-test | 1–3 | 2, 1, 1 → 1 (3/3) | 2, 1, 2 → 2 (3/3) | ground @ 40/50 m |
| b1-first-ride | 1–1 | 1, 1, 2 → 1 (3/3) | 1, 3, 1 → 1 (3/3) | ground @ 95 / 265 m |
| b2-lean-back | 1–2 | 1, 2, 1 → 1 (3/3) | 2, 5, 7 → 5 (3/3) | ground @ 435 m ×2 |
| b3-kicker-row | 1–2 | 2, 2, 1 → 2 (3/3) | 7, 6, 3 → 6 (3/3) | ground @ 335 m ×2, ramps @ 387/396 m |
| e1-uphill-weight | 2–4 | 3, 12, 1 → 3 (3/3) | 11, 33, 51 → 33 (2/3) | ground @ 80 m ×18, 315 m ×15 |
| e2-rear-wheel-first | 3–5 | 1, 4, 12 → 4 (3/3) | 12, 22, 24 → 22 (3/3) | ramp @ 176.2 m ×23 |
| e3-stairway | 3–6 | 1, 2, 3 → 2 (3/3) | 11, 10, 20 → 11 (3/3) | stair @ 402.3 m ×10 |
| m1-hop-up | 5–9 | 3, 7, 7 → 7 (3/3) | 5, 17, 44 → 17 (2/3) | ledge @ 280.3 m ×19 |
| m2-drum-roll | 6–12 | 11, 31, 31 → 31 (1/3) | 40, 19, 39 → 39 (1/3) | logpile @ 425.4 m ×30 |
| m3-see-saw | 8–12 | 8, 7, 9 → 8 (3/3) | 32, 12, 30 → 30 (3/3) | box @ 423.9 m ×10 |
| h1-wheelie-wire | 10–18 | 38, 12, 44 → 38 (1/3) | 48, 41, 24 → 41 (1/3) | ramp @ 172.8 / wall @ 175.8 m ×20 each |
| h2-gap-chain | 14–22 | 43, 42, 50 → 43 (0/3, 88 %) | 48, 41, 47 → 47 (0/3, 92 %) | ramp @ 437.6 m ×37 |
| h3-fire-line | 18–25 | 12, 11, 4 → 11 (3/3) | 22, 33, 7 → 22 (3/3) | ledge @ 252.8 m ×16 |
| x1-vertical-limit | 30–45 | 29, 34, 28 → 29 (0/3, 79 %) | 31, 45, 33 → 33 (0/3, 92 %) | pole @ 675.9 m ×15 |
| x2-pipe-dream | 40–60 | 51, 51, 43 → 51 (0/3, 72 %) | 41, 51, 47 → 47 (0/3, 78 %) | drum @ 369.4 m ×36 |
| x3-gauntlet | 60–80 | 26, 33, 22 → 26 (0/3, 94 %) | 39, 45, 42 → 42 (0/3, 95 %) | ramp @ 56.2 m ×34 |

Rookie vs round 6 on the same tracks: b1–e3 unchanged or better (e3 4 → 2, e2 3 → 4), **m2 7 → 31 and 1/3 clears**
(logpile @ 425.4 m ×36 `stuck-restart` — the same obstacle that walls the Pro bot), h1 now clears on one seed (41 → 38),
h3 13 → 11. Pro on beginner tracks is a 2–6× attempts multiplier for the average reflex player (b2 5, b3 6, e1 33 —
`air-brake-nose-down` deaths on open ground: the raw bike over-rotates on the brake in the air where Rookie holds), which
is the data behind "Pro is not the default below hard".

### Physics-suite, v1 baseline (`pnpm harness:physics-suite --bike both --tag v1-42bdfe0`, frozen 46443e5, 2042 s wall, loadavg 18.7 → 10.7)

`out/metrics/physics-suite.md` (copy of `out/physics-suite/20260914T192455Z-bikePhysicsFactory-v1-42bdfe0.md`). **REJECT: 20 pass,
3 fail, 9 info** — the three fails are the baseline's own debts, which is what a side-by-side needs: `feel.vitest` (2 of 6 test
files fail at HEAD), `feel.envelope` 41/45 in band + 70 info — out of band `governor.thr0.3.top` 10.96 [11–13 m/s],
`wheelie.openLoopLeave.±0.5` 0.77 s [1–2 s], `air.brake0.5s.pitchDeg` −13.5 [−10..−30]; and **`camera.b3` FAIL**: 889 frames,
bike y down to **0.20** with 37 riding frames out of the [0.2, 0.8] box and 193 frames (21.7 %) clamped to the track bounds —
the kicker flights (render owner; the round-4 stranger clips already showed the sky during that flight). Everything else:
determinism 9/9 + snapshot-probe PASS on both classes, sweep 17/19 at skill 2 (h2, x2 at 1 % in 90 s), skill-3 clears
b1/e1/m1/h1 Rookie + all five Pro browser-verified, x1 Rookie maxAttempts, reflex b1–e3 Rookie all within band, stranger
smoke 8/8 calls with the session recording node == browser.

### Open

- x1/x3 no longer clear for the Rookie bot at skill 3 (twice, low load) while Pro clears both in 1; m2/m3 the reverse.
  The tracks owner's "Pro cannot clear" list is **m2, m3**; the "Rookie cannot clear" list is **x1, x3**. `x1/bot-3.json`
  and `x3/bot-3.json` are stale (round-6 physics) until one of those is fixed; the gate does not use them.
- `header.bike` dropped by decode (src/core/replay.ts) — the game's PB ghost and any in-game replay of a Pro run are
  Rookie replays until fixed; the harness routes around it (`__trialsRunAs`).
- The numbers above are from the frozen HEAD tree (4c6d9739); the working tree's fingerprint moves with the physics v2
  edits in flight. After the next physics/tracks commit: `pnpm harness:bot --refresh-goldens`, then `harness:gate --pin`.
- `heap.growthMBPer60s` 5.65 MB (limit 5) — down from 9.6 but still over; the three SwiftShader render timings stay
  informational on this machine.
- Camera box fails on the b3 golden at high quality (bike reaches the top edge on the kicker flights, 21.7 % clamped) —
  first time the clip assertion runs on b3 through the suite; `harness:clip b3-kicker-row` reproduces it.
- Strangers: 0 fresh sessions on this src (G10 first row informational); round-3 prep is in place (`stranger prep`,
  `--bike` supported).
- `harness:reflex --browser` drives the live game on its default bike only (no `setBike` before the countdown yet).

## Round 6 status — the mirror through the finish line, goldens on the re-authored tracks, stranger round 3 plumbing

**Finding.** Commit cfb02ab made the game own the input after the finish line (`Game.stepFinishCoast`:
throttle 0, lean 0, brake `round(0.6 · min(1, t/120) · 255)/255`, a post-line fault undoes the tick and
freezes the world). `harness/lib/rules.ts` still stepped the player's frames, so every node replay diverged
from the page **one tick after the finish** — invisible to the gate because a golden ends on the finish tick,
visible to anything that runs past it (stranger sessions, clip tails, live reflex recordings). Negative
control on the old mirror: `harness:determinism harness/inputs/flat-test/bot-3.json --tail-s 3` →
`FAIL D3 first divergent tick 851: bike.pos.x, bike.pos.y, bike.vel.x, bike.vel.y, bike.angle, bike.angVel`.
Same command on the new mirror: `PASS D3 35a12a5fea84e694 == 35a12a5fea84e694` over 1211 ticks (the final
hash differs from the finish-tick hash `d2b08250…` — the bike really coasts 3 s past the line, in node and in
the page alike). A second proof on a recording with a hold-restart, a crash and the coast: the stranger smoke
session on flat-test, 1401 ticks, D1/D3/D5/D7 all `c7edfbb740c5131a`.

| piece | as built |
|---|---|
| **rules mirror** (`lib/rules.ts`) | `finished` phase = `Game.tick()`'s: `resultsTicks++`, `stepFinishCoast()` unless `finishFrozen` — same quantised brake ramp, `physics.snapshot()` before the step, restore + `drainEvents()` + freeze on a `fault` event, every other physics event processed as usual. `RulesCounters` is now `GameCounters` itself (import type from `src/game/game.ts`), so a node snapshot and `hook.snapshot()` carry the same fields; `determinism.ts` D4 no longer casts. Two older drifts fixed on the way: `holdFired` starts **true** at GO (the game's `beginRun`: the key that triggered a hold must be released before it can fire again) and a full restart **keeps** `holdTicks`/`restartLatch` (the key is still down) instead of zeroing them — the old mirror re-fired an edge on the very next tick of a held key. |
| **`harness:determinism --tail-s N`** | appends N s of throttle 1 / lean 1 after the recording's last tick — the noisiest legal input the finished game must ignore. The round's D3 proof; cheap enough to run on every golden. |
| **goldens** | all 17 tracks re-run at skill 3, sequentially, each browser-verified (node hash == page hash, 1 attempt on 14 tracks, 2 on m2/x2/x3, m3 timed out at 600 s wall at 209 m — the tracks owner found the wedge, re-authored m3 in 94ecb43 and committed its own golden). That commit moved the src fingerprint under the run (e10f2cfe → 9d316566) and un-stamped the 12 goldens already written: `pnpm harness:bot --refresh-goldens` (new, `lib/golden.ts refreshGoldens`) re-proves each `bot-*.json` on the working tree — node replay must finish and hash like the browser — and only then rewrites its stamp (`src=<new> restamped-from=<old>`); anything else stays put and is reported STALE. Result: 13 restamped, 5 fresh, 21 stale lower-skill leftovers (bot-0/1/2/oracle from older physics; the picker never chooses them while a bot-3 matches), **17/17 tracks with a proven skill-3 golden**. Gate re-pinned (`--pin`): flat-test golden `d2b082502561bc00`, canonical-1200 re-pinned on the new physics. m3 re-run by the bot on the re-authored track afterwards: 2 attempts, finish 37.275 s (the same finish the tracks owner's golden carries), browser-verified. The fingerprint moved a second time before the round closed (uncommitted physics/tracks/core edits by other builders, 9d316566 → b8b2e23f at ~11:33); a second `--refresh-goldens` re-proved all 17 on it — identical finish times, node hash == the browser hash of the 11:20 build, i.e. the edits in flight are behaviour-neutral for these recordings. `expected.json` and `ship-gate.json` are from the 9d316566 build. |
| **stranger CLI** (`stranger/cli.ts`, `view.ts`, `PROTOCOL.md`) | a finish now plays the run-out coast **in-call** (COAST frames while `finished` and moving, ≤ 4 s): the play summary gets `runOut {seconds, stoppedAt, stopped, frozen}`, the note says where the game braked you to a stop, the screen is printed after a finish too and `look` keeps the finish `F` column in frame beside the stopped bike (`asciiView(..., anchorX)`). `runTime`/`finishTime` are the game's run clock (frozen at the line, reset by a full restart — what the results panel shows), not the session tick count. `reset` prefixes one coast tick when `holdFired` is set so the hold fires deterministically as the first call of a session. Smoke on flat-test: crossed at 120 m, stopped at 131.6 m (11.6 m of the 30 m run-out), `vx` 0.02, D3 on the session recording PASS. |
| **stranger round 3 plumbing** | `pnpm harness:stranger prep --tracks b1-first-ride,b2-lean-back,b3-kicker-row,e1-uphill-weight,e2-rear-wheel-first,e3-stairway --agents s1,s2 --round r3` creates the 12 sessions (ids `<track>-r3-<agent>-<stamp>`) and writes `out/stranger/rounds/r3/spawn.md` — one paste-ready prompt per session, the `run-stranger.md` block with track + session id filled — plus `manifest.json`. `pnpm harness:stranger report <a> <b> …` aggregates several tracks and ends with one summary table (band, sessions, completed fresh, cleared, medians, pass). All round-1/2 sessions are stale on src 9d316566 (b1: 5 on disk, 0 fresh). `start`/`look`/`play` checked on the re-authored b1 (finish 583 m, checkpoints 66 / 235.6 / 412.4). |
| **clip camera assertion** (`capture.ts`, `clip.ts`) | every rendered frame reads `hook.camera()`: bike screen x/y inside the central [0.2, 0.8] box while riding, \|roll\| < 1e-6, frames the rig **clamped** to the track's camera bounds (count + %), frames per rig state, min/max of the bike's screen position, first offenders (frame, tick, x, y, state). Printed as the `camera:` line in the clip report, stored in `clip.json.camera`, exit 1 after writing the clip when it fails (`--no-camera-assert` to ignore, `--no-camera-check` to skip). A windowed clip (`--at-x`, `--from-tick`) starts the rig cold, so its first 0.5 s are counted as `settleExcluded` and not judged — the flat-test 60 m window otherwise fails on frame 0 alone (bike at x 0.191). Full gap-test clip (314 frames, 5.23 s incl. the 1 s tail — the tail now shows the game braking the bike after the line): `PASS bike x 0.283..0.789 y 0.49..0.616, out 0, clamped 10 (3.2 %), max|roll| 1e-17, states fast:167 riding:78 finish:60 idle:9`. |

### Ship gate (`pnpm harness:gate --pin`, flat-test, src 9d316566, dist rebuilt, loadavg 5 → 18 during the run)

18/22 on both runs (the second, after the reflex sweep, is the committed `ship-gate.json`). The four
failures: `boot.firstFrameMs` 4680 / 4555 ms (SwiftShader limit 4000; 7543 last round), `restart.frameMsP95`
204 / 249 ms (150; 602 last round), `perf.renderSyncedMsP95` 3560 / 3424 ms (250; 5964 last round) — the three
SwiftShader-relative render numbers, better than last round but over the local limits under a loadavg that
climbed from 5 to 18 while each gate ran — and **`heap.growthMBPer60s` 9.63 / 9.50 MB (limit 5)**, the first
full 60 s heap measurements since the art pack (last round's `--quick` 10 s sample read 4.87 MB), repeatable:
a render-owner item. G10 second row is armed for the first time on this src: reflex `average` medians
b1 1/1.5 · b2 2/3 · b3 2/3 · e1 1/6, all within band. Everything the harness owns passes: `clear.*` on the new golden, `determinism.pass` 8/8
(D8 re-pinned), `restart.ticks` 1, `restart.noCountdown` 2 ticks, `fault.toControlMs` 41.7 ms,
`perf.physicsUsPerTickP95` 27.5 µs (97.5 last round, which was measured at loadavg 22).

### Reflex bot, all tracks, 3 seeds, `average` (`pnpm harness:reflex --all-tracks --seeds 3`, 5 s wall)

Beginner/easy/medium and h3 clear on every seed; h1, h2, x1, x2, x3 clear on none within the 300 s sim
cap. The deaths name the same places the tracks round 6 notes call the technique gates: h1 wall @ 175.8 m
(`stuck-restart` ×47 — the wheelie wire), h2 ramp @ 265.8 m (`air-gas-nose-up` ×43), x1 ramp/plank @
527–530 m, x2 drums @ 366–369 m, x3 ramp/plank @ 465–467 m. Full table in `out/metrics/reflex.md` and below.

| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |
|---|---|---|---|---:|---|---:|---:|---|
| flat-test | beginner | — | 1, 1, 1 | 1 | 3/3 | 11.1 s | 100% | — |
| gap-test | beginner | 1–3 | 1, 1, 1 | 1 | 3/3 | 6.6 s | 100% | — |
| b1-first-ride | beginner | 1–1 | 1, 1, 1 | 1 | 3/3 | 55.3 s | 100% | — |
| b2-lean-back | beginner | 1–2 | 1, 2, 2 | 2 | 3/3 | 65.9 s | 100% | ground @ 45 m ×1 (air-brake-nose-down); ground @ 450 m ×1 (nose-high) |
| b3-kicker-row | beginner | 1–2 | 2, 3, 2 | 2 | 3/3 | 64.5 s | 100% | ground @ 240 m ×1 (nose-low); gap @ 305.8 m ×1 (air-gas-nose-up); gap @ 325.8 m ×1 (drop-ahead-lean-back) |
| e1-uphill-weight | easy | 2–4 | 1, 1, 2 | 1 | 3/3 | 61.5 s | 100% | ramp @ 445.0 m ×1 (air-brake-nose-down) |
| e2-rear-wheel-first | easy | 3–5 | 3, 5, 1 | 3 | 3/3 | 88.8 s | 100% | ramp @ 66.0 m ×2 (air-gas-nose-up); ramp @ 57.0 m ×1 (air-gas-nose-up); ramp @ 265.2 m ×1 (nose-high) |
| e3-stairway | easy | 3–6 | 3, 4, 9 | 4 | 3/3 | 73.8 s | 100% | stair @ 164.2 m ×6 (air-brake-nose-down); gap @ 418.4 m ×3 (nose-high); stair @ 402.3 m ×2 (air-brake-nose-down) |
| m1-hop-up | medium | 5–9 | 9, 14, 10 | 10 | 3/3 | 114.5 s | 100% | ledge @ 309.3 m ×6 (nose-high); ledge @ 21.0 m ×4 (nose-high); ledge @ 280.3 m ×4 (air-brake-nose-down) |
| m2-drum-roll | medium | 6–12 | 10, 3, 7 | 7 | 3/3 | 94.6 s | 100% | ramp @ 311.2 m ×4 (nose-low); logpile @ 425.4 m ×3 (nose-high); ramp @ 430.8 m ×3 (air-brake-nose-down) |
| m3-see-saw | medium | 8–12 | 25, 6, 8 | 8 | 3/3 | 106.1 s | 100% | box @ 423.9 m ×7 (air-gas-nose-up); ramp @ 416.4 m ×6 (air-level); seesaw @ 390.4 m ×3 (climbing) |
| h1-wheelie-wire | hard | 10–18 | 38, 42, 41 | 41 | 0/3 | — | 92% | wall @ 175.8 m ×47 (stuck-restart); ramp @ 172.8 m ×28 (stuck-restart); wall @ 530.2 m ×18 (stuck-restart) |
| h2-gap-chain | hard | 14–22 | 48, 46, 45 | 46 | 0/3 | — | 69% | ramp @ 265.8 m ×43 (air-gas-nose-up); ramp @ 275.8 m ×19 (air-gas-nose-up); ramp @ 427.6 m ×18 (air-gas-nose-up) |
| h3-fire-line | hard | 18–25 | 13, 5, 31 | 13 | 3/3 | 139.2 s | 100% | gap @ 489.2 m ×10 (hop-preload); ramp @ 467.2 m ×6 (air-brake-nose-down); ground @ 470 m ×6 (air-brake-nose-down) |
| x1-vertical-limit | extreme | 30–45 | 30, 30, 32 | 30 | 0/3 | — | 79% | ramp @ 527.6 m ×38 (stuck-restart); plank @ 530.0 m ×34 (air-brake-nose-down); ramp @ 235.2 m ×4 (air-brake-nose-down) |
| x2-pipe-dream | extreme | 40–60 | 51, 46, 48 | 48 | 0/3 | — | 72% | drum @ 366.1 m ×63 (air-gas-nose-up); drum @ 369.4 m ×25 (air-gas-nose-up); drum @ 250.7 m ×18 (air-gas-nose-up) |
| x3-gauntlet | extreme | 60–80 | 28, 38, 33 | 33 | 0/3 | — | 94% | ramp @ 465.5 m ×36 (stuck-restart); plank @ 466.7 m ×15 (air-brake-nose-down); wall @ 277.0 m ×9 (nose-high) |

## Calibration against the stranger sessions

| track | band | stranger median attempts (sessions, src) | reflex average median (seeds) | ratio | stranger time to clear | reflex time to clear | stranger deaths (top) | reflex deaths (top) |
|---|---|---|---|---:|---:|---:|---|---|
| b1-first-ride | 1–1 | 2 (5, d698717f/73762476/c83b6ca8) | 1 (1, 1, 1) | 0.50 | 54.8 s | 55.3 s | — | — |
| b2-lean-back | 1–2 | 3 (2, 73762476) | 2 (1, 2, 2) | 0.67 | 49.0 s | 65.9 s | drum @ 36.0 m ×1; ramp @ 314.2 m ×1; ramp @ 322.2 m ×1 | ground @ 45 m ×1; ground @ 450 m ×1 |
| b3-kicker-row | 1–2 | 8 (4, 73762476/c83b6ca8) | 2 (2, 3, 2) | 0.25 | 77.8 s | 64.5 s | ground ×4; ramp @ 384.0 m ×1; ramp @ 178.0 m ×1 | ground @ 240 m ×1; gap @ 305.8 m ×1; gap @ 325.8 m ×1 |
| e1-uphill-weight | 2–4 | 8 (4, 73762476/c83b6ca8) | 1 (1, 1, 2) | 0.13 | 99.9 s | 61.5 s | ramp @ 445.0 m ×4; plank @ 436.0 m ×2; ground ×1 | ramp @ 445.0 m ×1 |

### Open

- `heap.growthMBPer60s` 9.63 MB over 60 s (limit 5) — render/art owner; re-measure on an idle machine before
  treating it as a leak (GC timing under loadavg 18 is part of it).
- Lower-skill goldens (`bot-0/1/2`, `bot-oracle`) on 12 tracks are stale leftovers of older physics. They are
  never picked while a `bot-3` matches; a `harness:bot <track> --all` pass would replace them, ~10 min per track.
- h1/h2/x1/x2/x3 do not clear for the `average` reflex player (0/3 each, 300 s cap); the `good` rows and the
  browser calibration were not re-run this round.
- Gate G10 still judges b1/b2/b3/e1; e2/e3 join the stranger round but not the gate row until §3 says so.
- The src fingerprint is one hash over all of `src/tracks`: one track edit un-stamps every golden. `--refresh-goldens`
  makes that a 10 s re-proof instead of a 45 min bot pass, but a per-track fingerprint would be the real fix.

## Round 5 status — the reflex bot: a person holding keys

The two measurement players so far were a beam-search bot (15-tick macros with snapshot lookahead — superhuman
planning, no reflexes) and an LLM stranger issuing 125 ms slot codes (no real-time constraint). Neither is a
person holding keys. `harness/reflex/**` adds the third and makes it the primary attempts-to-clear instrument:
`pnpm harness:reflex`, results in `out/metrics/<track>.reflex.json` + `out/metrics/reflex.md`, gate G10 second row.

| piece | as built |
|---|---|
| **perception** (`perceive.ts`, `profile.ts`) | one glance = bike pitch, pitch rate, speed, height above ground, wheel contact, the ground silhouette ahead within ~1.5 s of travel (8–40 m, exactly the colliders render draws, rasterised at 0.25 m; seesaw planks at their current angle) reduced to: max rise, first rise ≥ 0.4 m, steepest 1 m slope in the next 5 m, first vertical face (≥ 0.35 m in one cell) and its height, first drop ≥ 0.8 m, first pit (sharp ≥ 1 m drop that comes back within 8 m) and its width, first hazard, ballistic landing point + its slope when airborne, terrain pitch under the wheels, next checkpoint / finish mark. Glances at 20/25/30 Hz. No obstacle kinds, params, checkpoints or physics internals. |
| **noise + reaction** (`controller.ts`) | per glance: pitch ± 3/2/1.5° (N), pitch rate through a 2-tap EMA (the eye integrates ~100 ms; a landing spike is not "the bike is flipping") ± 6× that, speed ± 7/5/4 %, height ± 8 cm, timestamp jitter. Reaction delay drawn once per run from 230–280 / 180–220 / 150–170 ms (novice / average / good); every decision acts on the newest glance older than that. The rider extrapolates: rules use `pitch + rate × 0.8 × reaction` (clamped ± 30°). |
| **rules** | target speed = cruise (9/11/13 m/s) × section scale, raised for a steep climb or a pit (width / 0.32 s + 1.5), capped before a drop or a face; throttle = proportional duty around it, brake when > +2.5 m/s over. Ground: hold `terrainPitch + 6°` with a 6° deadband. **Nose too high** (28° over the terrain) → lean forward, off the gas above 40°. **Nose diving** → lean back, off the brake. **Steep up ahead** → gas + forward; **on the climb** → forward. **Drop ahead** → weight back, ease the gas. **Pit run-up** → gas; **pit lip** (0.3 s) → nose up + gas. **Face** (ledge / box / wall) at 0.3 s + a bike length → the practised hop: 0.18 s preload (gas + back) then 0.12 s snap (gas + forward). **Airborne** → level to the landing slope + 4°; nose way up → a brake tap (this physics pitches −4 rad/s on the brake in the air); nose down → gas + back. The first thing everyone learns: gas + lean back on the ground loops out, so that pair is only allowed inside a deliberate lift. Stuck (no progress 4 s) → restart. Crashed → restart tap after 0.5/0.35/0.25 s. |
| **hands** | keys are binary and change at most every 100/80/70 ms; analog intent becomes a tap rhythm (sigma-delta duty cycle, like a thumb feathering ↑). Lapses: every ~6/10/20 s (exp.) the hands freeze for 0.25–0.5 s. |
| **learning** (`memory.ts`) | 6 m x-buckets. A fault at x edits the approach bucket (0.9 s of travel back) and the fault bucket only: fell short (below the ground ahead) → speed +0.12, nose up; looped (pitch > 45°) → lean bias +0.25 forward, throttle cap −0.15, act 80 ms earlier; endo (< −35°) → lean back, slower; anything else → slower, look earlier. Every 4th fault in one bucket tries the opposite (faster). Two clean passes relax a bucket toward the defaults. |
| **determinism / evidence** | node mode: time = tick / hz, all randomness from `Rng(seed ^ 0x5eed)`; same (track, seed, skill) → identical frames and hash (`reflex.test.ts`). No snapshot / restore anywhere, so the recording *is* the play: `replayFaithful` on every run, and the CLI verifies one recording per track in the browser through `runRecording` (b1: node `87b913d77aae1c05` == browser). |
| **live browser** (`browser.ts`) | `--browser N`: the live game (`?track=`, no harness param: App shell, countdown, `RafDriver`, `KeyboardInput` → `InputMux` → `quantizeInput`), eyes = `getState()` over CDP, hands = `page.keyboard.down/up` on the arrow keys. Playwright's fake clock steps rAF at 16.7 ms (see README caveat — SwiftShader's 200–280 ms raster makes the real-clock game a 3–4 fps one). An in-page rAF hook starts the recording on the first `riding` frame; the neutral ticks before it are prepended; `roundTrip` = node replay hash == live page hash. |
| **G10, second row** | `reflex.medianAttempts` in `ship-gate.ts`: `average` medians from `<track>.reflex.json` for b1/b2/b3/e1 on the working tree's src vs `reflex.attemptsBandFactor` (1.5) × band top; informational until each has ≥ `reflex.minSeeds` (3) seeds on this src. |

### Curriculum, `average`, 3 seeds (src c83b6ca8, bikePhysicsFactory, cap 50 attempts / 300 s)

See `harness/out/metrics/reflex.md` for the full table. Beginner + e1 clear in 1–5 attempts (b1 1/1/1 · b2 2/3/5 ·
b3 2/3/5 · e1 1/3/4, 55–80 s), e2 in 13–14 (one seed hits the cap at the box after the 143 m gap — the
rear-wheel-first landing is the taught technique and the rules do not have it). From e3 up the reflex player is
walled by technique, exactly where a keyboard novice is: e3 stairs @ 100 m (five 0.3 m risers from a checkpoint
4 m before them — 138 stuck-restarts over 3 seeds), m1 0.9 m ledge @ 87 m (the practised hop clears 0.45–0.5 m,
not 0.9), m2 ramp @ 123 m / logpile, m3 the 164 m gap + plank, h1 wall @ 138 m, h2 boxes @ 52/60 m, h3 barrel @ 57 m,
x1 ramp+plank @ 44 m, x2 ramp @ 48 m, x3 plank @ 86 m. Those rows are the instrument saying "a reflex player
without the technique does not get past here", which is the number the tracks owner wants per obstacle.

### Calibration against the strangers (b1/b2/b3/e1)

| track | band | stranger (src 73762476, round 1) | stranger (src c83b6ca8, round 4, fresh) | reflex `average` | reflex `novice` |
|---|---|---|---|---|---|
| b1 | 1–1 | 4, 2 → **3** (58.7 s) | 1, 2 → **1.5** (44–56 s) | 1, 1, 1 → **1** (55 s) | 4, 1, 2 → 2 |
| b2 | 1–2 | 4, 2 → **3** (49.0 s) | — | 2, 3, 5 → **3** (58 s) | 2, 4, 7 → 4 |
| b3 | 1–2 | 13, 10 → **11.5** (107 s) | 2 (+ one in progress at 5) | 2, 3, 5 → **3** (70 s) | 3, 10, 12 → 10 |
| e1 | 2–4 | 9, 15 → **12** (120 s) | — | 1, 3, 4 → **3** (79 s) | 6, 3, 10 → 6 |

Against the **fresh** strangers (same physics, same tracks) `average` is within ±50 % everywhere there is data
(b1 1 vs 1.5, b3 3 vs 2–5). Against the **round-1** strangers only b1/b2 are (1 vs 3 is the b1 miss: 6 of 8 round-1
attempt-1 deaths were the full-gas loop-out at 24 m that the pitch-rate-led wheelie physics removed); b3 and e1 are
at 0.3× / 0.25× — and those two medians were made by the old b3 checkpoint 3 m before the kicker (8 of 21 deaths)
and the old 48° plank right after e1's checkpoint 3 (9 of 20), both since re-authored. The **`novice`** row lands
on the round-1 medians instead (b1 2 vs 3, b2 4 vs 3, b3 10 vs 11.5, e1 6 vs 12): the slot-code stranger plays
like a 250 ms keyboard novice, not like an average player. `average` was **not** tuned toward the stale numbers.
What was tuned (on b1/b3 death traces, before any stranger comparison): pitch extrapolation + 6° deadband (a
200 ms delay on 0.6 s rollers otherwise amplifies every bump into a loop-out at ~95 m and ~170 m on b1), the
gas+back guard (after a slow landing the nose-low rule + full gas looped at 75 m on b3), the pitch-rate EMA (a
landing spike read as "flipping" → forward lean off a hump lip → endo at 60 m on e3), terrain pitch for the
nose-high threshold (a bike standing on 34° stairs is not looping), and the vertical-face definition (a 40° plank
foot is not a wall to hop). Deaths line up by place where the geometry survived: b2 ramp @ 314/322 (stranger
2, reflex 2), b3 kicker landings (stranger 133/145, reflex 70–110 rollers and the 368 box), e1 planks / ramps.

### Browser vs node (b1, `average`)

| | node (`createSim`, 3 seeds) | browser, fake clock 60 fps (3 runs) | browser, real clock (1 run) |
|---|---|---|---|
| attempts | 1, 1, 1 | 1, 1, 1 | 26 (timeout at 250 s, 67 %) |
| time to clear | 54.8 / 55.5 / 56.2 s | 57.9 / 60.0 / 55.8 s | — |
| game fps | — (ticks) | 63.8 (by construction) | 2.8–3.6 measured |
| glance round trip | — | 0.9–1.1 ms | 277–336 ms (blocked behind the raster) |
| key events per run | — | 560–566 | 146–478 |
| wall per run | 0.1 s | 10–14 min (165–238 ms per player frame) | 4 min (real time) |
| recording round trip | replay == play | node replay == live hash (`startTick` 0) | node replay == live hash |

The input path (keyboard → mux → quantize → tick → recorder) is byte-faithful: every live recording replays in
node to the browser's own hash. The only difference between (a) and (b) is the frame period the keys are sampled
at; at 60 fps the live player behaves like the node player (same attempts, 1–4 s slower — different seeds, and key
edges land on frame boundaries instead of ticks), at SwiftShader's real 3–4 fps it is a different, unplayable game.

## 0. Principles

1. **Search runs in node, verification runs in the browser.** `src/physics` is platform-neutral (plain data,
   no DOM). The bot steps a `PhysicsWorld` directly at ~6 us/tick (measured on MockPhysics; budget 50 us/tick
   for the real sim) and only sends its winning recording through `harness/replay.ts` to prove the browser
   agrees byte-for-byte. A mismatch there is a physics bug, not a bot bug.
2. **A recording is the unit of evidence.** Bot output, stranger output, ship-gate input and capture input
   are all `InputRecording` (`src/core/replay.ts`). Restarts are in-band (`FLAG_RESTART`), so attempts are
   countable from the recording alone: `attempts = 1 + count(restart edges) + count(crash faults)`.
3. **Every number has a source tick.** Latencies are reported in physics ticks (exact) and wall ms
   (measured, noisy). Thresholds are on ticks wherever possible.
4. **The critic never sees which clip is ours.** Masking happens on disk before the critic is invoked, and
   the unmask key lives in a separate file that is unreadable during the critic call.

## 1. File layout

```
harness/
  lib/                        (existing) args browser ffmpeg hook paths recording report server synth
  lib/sim.ts                  node-side createSim: physics factory (resolved at runtime) + compileTrack + rule layer
  lib/rules.ts                mirror of Game.tick(): phases, restart edge/hold, auto-respawn, run clock, faults
  lib/metrics.ts              attempt counting, diffState, percentiles, run ids
  lib/schema.ts               TS types for every JSON written under out/ (section 8)
  lib/verify.ts               BrowserVerifier: frozen-dist server + browser, runRecording per fresh page
  bot/
    actions.ts                13 macro-actions × HOLD=15 ticks, stranger slot codes, parseSlots
    score.ts                  progress heuristic (2.2)
    beam.ts                   beam search core (2.3)
    play.ts                   committed play with player memory; oracle rewinds (2.4)
    bot.ts                    CLI: pnpm harness:bot <trackId> [--skill 0..3] [--oracle] [--all] [--seeds N] [--budget ms] [--crash-probe]
  stranger/
    PROTOCOL.md               text handed verbatim to the stranger
    cli.ts session.ts view.ts one-shot commands, persisted session state, ASCII look
    README.md                 how the parent spawns a stranger and reads results
  compare/
    normalize.ts mask.ts      640x360@30 letterbox, HUD masking
    pair.ts                   CLI: pnpm harness:pair <ours.mp4> <ref.mp4> --tag <manoeuvre> [--seed N] [--mask] [--align a:b]
    log.ts                    CLI: pnpm harness:log-verdict <pair-id> --verdict '<json>' [--critic name]
    RUBRIC.md README.md       what the critic answers, in motion terms
  gate/
    thresholds.json           every threshold, one place (CONTRACT §3)
    expected.json             pinned golden finish/hash + canonical 1200-tick hash, per physics implementation
    determinism.ts            CLI: pnpm harness:determinism <recording> [--loads 3] [--pin]
    ship-gate.ts              CLI: pnpm harness:gate [--track flat-test] [--build] [--quick] [--pin]
  inputs/<trackId>/
    bot-<0..3>.json bot-oracle.json   browser-verified golden recordings per skill
    crash.json                        earliest scripted crash (bot --crash-probe)
    stranger-<sessionId>.json         what a stranger actually played
  out/metrics/                (committed) <trackId>.json <trackId>.stranger.json compare.jsonl ship-gate.json
  out/                        (gitignored) bot/ stranger/ compare/ gate/ boot/ replay/ capture/ perf/
```

Package scripts: `harness:bot harness:stranger harness:pair harness:log-verdict harness:determinism harness:gate`
(plus the scaffold's `boot replay capture perf gen-input all`).

## 2. Bot player

### 2.0 Sim contract (physics per CONTRACT §2.3; rule layer per §2.8)

```ts
// src/physics (CONTRACT §2.3): snapshot()/restore() are plain data
export type PhysicsSnapshot = { v: 1; f64: Float64Array; u8: Uint8Array };

// harness/lib/sim.ts
export interface SimSnapshot { physics: PhysicsSnapshot; counters: RulesCounters }   // rules = harness/lib/rules.ts
export interface Sim {
  world: PhysicsWorld; rules: RunRules; track: TrackDef; compiled: CompiledTrack; hz: number; seed: number;
  physicsName: string;                          // 'bikePhysicsFactory' | 'createBikePhysics' | 'MockPhysics'
  step(input: InputFrame): GameEvent[];         // one GAME tick (rule layer + physics), returns the game events
  run(frames: Iterable<InputFrame>): { state: PhysicsState; events: GameEvent[]; hash: string; ticks: number };
  snap(): SimSnapshot; restore(s: SimSnapshot): void;
  hash(): string; state(): PhysicsState; phase(): GamePhase; faults(): number;
  runTicks(): number; runTime(): number;        // run clock, frozen at finish (== hook.runTime())
  totalTicks(): number; reload(): void;
}
export function createSim(trackId: string, seed?: number, hz = DEFAULT_PHYSICS_HZ): Promise<Sim>;
```

The factory is resolved at runtime: `bikePhysicsFactory` or `createBikePhysics` from `src/physics/index.ts` when
exported, else `MockPhysics` (`TRIALS_PHYSICS=mock` forces the mock). `createSim` == the page's `loadTrack` +
`skipCountdown`: physics `loadTrack` then `reset(-1)`, run clock 0, phase `riding`. Contract test (section 6, D3/D4):
`createSim().run(rec).hash` equals the browser's `runRecording` hash, and `restore(snap())` + step×m equals the
straight run. `hashPhysicsState` is the hash; `diffState()` (harness/lib/metrics.ts) names the differing paths.

### 2.1 Action vocabulary

Physics runs at 120 Hz; searching per tick is hopeless. The bot searches over **macro-actions**: one
quantized `InputFrame` held for `HOLD` ticks. There is **no hop button** (CONTRACT §2.8); the hop is
`gas-back` (preload) then `gas-fwd` (snap). Vocabulary `A` (13 actions), `harness/bot/actions.ts`:

| id | name | code | throttle | brake | lean | hold |
|---|---|---|---|---|---|---|
| 0 | coast | `c` | 0 | 0 | 0 | 15 |
| 1 | gas | `g` | 1 | 0 | 0 | 15 |
| 2 | gas-back | `gb` | 1 | 0 | −1 | 15 |
| 3 | gas-fwd | `gf` | 1 | 0 | +1 | 15 |
| 4 | half-gas | `hg` | 0.5 | 0 | 0 | 15 |
| 5 | half-gas-back | `hgb` | 0.5 | 0 | −0.5 | 15 |
| 6 | half-gas-fwd | `hgf` | 0.5 | 0 | +0.5 | 15 |
| 7 | brake | `b` | 0 | 1 | 0 | 15 |
| 8 | brake-fwd | `bf` | 0 | 1 | +1 | 15 |
| 9 | brake-back | `bb` | 0 | 1 | −1 | 15 |
| 10 | lean-back | `lb` | 0 | 0 | −1 | 15 |
| 11 | lean-fwd | `lf` | 0 | 0 | +1 | 15 |
| 12 | tap-gas | `t` | 1 | 0 | 0 | 4 (+11 coast) |

Every action expands to exactly `HOLD = 15` ticks (125 ms; 8 decisions per second), so the tree is
uniform: depth d = 125 ms × d. Values are on the u8/i8 quantization grid (`quantizeInput` is identity on
them), so recordings round-trip exactly and node and browser see identical bytes. The `code` column is the
stranger's slot code (`parseSlots("g8 gb4 c2")`), so bot and stranger attempts are comparable.

### 2.2 Progress score

```ts
// harness/bot/score.ts
export interface ScoreWeights { progress: number; speed: number; upright: number; airPitch: number; checkpoint: number; finish: number; fault: number }
export const DEFAULT_WEIGHTS: ScoreWeights = { progress: 1, speed: 0.15, upright: 0.5, airPitch: 0.3, checkpoint: 50, finish: 1e6, fault: -1e6 };

export function score(s: PhysicsState, w: ScoreWeights): number {
  if (s.finished && s.finishTime !== null) return w.finish - s.finishTime;   // faster finish wins
  if (s.faulted) return w.fault + s.bike.pos.x;                              // faulted: still ordered by x
  const grounded = s.wheels.rear.grounded || s.wheels.front.grounded;
  const upright = Math.cos(s.bike.angle);                                     // 1 level, 0 vertical, <0 inverted
  const airOver = !grounded && Math.abs(s.bike.angle) > 1.0 ? Math.abs(s.bike.angle) : 0;
  return w.progress * s.bike.pos.x
       + w.speed * Math.max(0, s.bike.vel.x)
       + w.upright * (grounded ? upright : 0)
       - w.airPitch * airOver
       + w.checkpoint * (s.checkpoint + 1);
}
```

Deliberately dumb: x is the objective, the rest are tie-breakers so the beam does not fill with "fast but
about to loop" states. Tuning is by measured `botAttempts` against author `targetAttempts`, never by eye.

### 2.3 Beam search core

```ts
// harness/bot/beam.ts
export interface BeamConfig {
  width: number;          // states kept per depth
  depth: number;          // macro-actions of lookahead (depth * 125 ms)
  commit: number;         // macro-actions actually played from the best plan before re-planning
  cells: [number, number, number]; // x (m), vx (m/s), angle (rad) bucket sizes for dedupe
  budgetMs: number;       // wall clock cap per plan(); depth is cut short when exceeded
}
export interface Plan { actions: number[]; score: number; expanded: number; wallMs: number; finishes: boolean; allFault: boolean }
export function plan(sim: Sim, cfg: BeamConfig, w: ScoreWeights): Plan;
```

Per `plan()`: `root = sim.snap()`; frontier = `[{snap: root, actions: [], score}]`. For each depth, for
each node, for each action: `restore(snap)`, run `HOLD` ticks collecting events; a child with a `fault`
event is kept but its score is already `<= fault + x` so it survives only when every child faults
(`allFault: true` tells the driver the situation is already lost — commit to the best x anyway, the
fault is real). A child with `finish` is terminal: the search returns immediately with the earliest
finish (ties by `finishTime`). Children are deduped by
`(round(x/cells[0]), round(vx/cells[1]), round(angle/cells[2]), grounded)` keeping the best score, then
the top `width` proceed. Expansions per plan = `width * |A| * depth`: width 32, depth 28 (3.5 s), 13
actions = 11 648 rollouts x 15 ticks = 175k ticks, i.e. 1-9 s of node time at 6-50 us/tick. Snapshot
cost matters: a `Float64Array` copy of ~200 doubles is ~1 us; never JSON.

### 2.4 Committed play and attempts-to-clear

```ts
// harness/bot/play.ts
export type Skill = 0 | 1 | 2 | 3 | 'oracle';
export const SKILLS: Record<0 | 1 | 2 | 3, BeamConfig> = {
  0: { width: 4,  depth: 8,  commit: 4, budgetMs: 200,  cells: [0.5, 1, 0.2]    },   // 1.0 s lookahead
  1: { width: 8,  depth: 16, commit: 4, budgetMs: 500,  cells: [0.5, 1, 0.2]    },   // 2.0 s
  2: { width: 16, depth: 24, commit: 2, budgetMs: 1500, cells: [0.25, 0.5, 0.1] },   // 3.0 s
  3: { width: 32, depth: 32, commit: 1, budgetMs: 4000, cells: [0.25, 0.5, 0.1] },   // 4.0 s
};
export interface PlayLimits { maxAttempts: number; maxSimSeconds: number }   // defaults 50, 300
export function playTrack(trackId: string, seed: number, skill: Skill, limits?: PlayLimits): BotRunReport;
```

Loop: `plan()`, play the first `commit` actions for real (frames pushed to an `InputRecorder`), re-plan.
When a `fault` event arrives during committed play the bot **may not rewind**: it pushes one frame with
`restart: true` then one with `restart: false` (a real player's mash), `attempts++`, and continues from
the checkpoint the sim placed it at. `attempts` = faults + 1; a bot that never faults has 1 attempt. The
run ends at `finish`, at `maxAttempts`, or at `maxSimSeconds` (`outcome: 'timeout'`).

`--oracle`: unlimited rewinds. On fault, restore the snapshot taken `2 * commit` actions earlier and
re-plan with that action prefix blacklisted. Produces the **0-fault reference replay** used by the ship
gate and as the "ours" clip in compare. Its `finishTime` is the track's bot par.

**Difficulty curve** = `[attempts(skill0), attempts(skill1), attempts(skill2), attempts(skill3)]`, median
over 3 seeds each. A track is "shaped" when the curve is monotone non-increasing and
`attempts(skill3) <= targetAttempts`. The per-checkpoint fault histogram tells the track builder where
the wall is; `faultsByCheckpoint[i] / sum > 0.7` flags a single-wall track.

Output: `out/bot/<trackId>/<runId>.json` (`BotRunReport`) plus the recording copied to
`inputs/<trackId>/bot-skill<k>.json` / `bot-oracle.json` **only after** `harness:replay` on it passes
(browser hash == node hash, `finishTime` bit-equal). CLI prints one line:
`bot flat-test skill=3 seed=1 attempts=1 finish=9.867 plans=79 ticks=1.2M wall=41s verified=yes`.

## 3. Stranger protocol

The stranger is a fresh sub-agent with no access to `src/`, `reference/`, bot output or this document.
It gets `harness/stranger/PROTOCOL.md` and one CLI. The point is to measure attempts-to-clear and
time-to-clear for someone who knows only the controls, and to catch "the bot can do it but nobody else
can" tracks.

### 3.1 What the stranger is told (PROTOCOL.md skeleton)

```
You are playing a 2D motorbike trials track. Controls per 1/8 s slot: throttle 0..1, brake 0..1,
lean -1..1 (negative = lean back). No hop button: preload (gb) then snap (gf). The bike starts stationary facing +x.
Cross the finish without crashing. A crash tumbles 1.0 s then respawns you at the last checkpoint (the
game's auto-respawn, inside the same play call); the clock keeps running.
Tool: `pnpm harness:stranger <cmd> --session <id>`   (the real text is harness/stranger/PROTOCOL.md)
  look                -> track card (tier, name, technique, beginner hints, checkpoint xs, finish x: what the
                         menu/HUD show) + JSON: x, vx, angle_deg, grounded, checkpoint, faults, time, finishX
                         + ASCII side-view of the next 40 m
  status              -> the JSON only
  play "<slots>"      -> apply slots, e.g. "g8 gb4 c2 gf1 g6"  (g gas, gb gas+lean back, gf gas+lean fwd,
                         hg/hgb/hgf half gas, c coast, b brake, bf/bb brake+lean, lb lean back, lf lean fwd,
                         t tap gas; number = slots of 125 ms, max 40 per call)
                         returns summary + events + a per-slot trace (x, vx, angle, ground/air) + the side-view
                         from the new position; stops at a crash (after the auto-respawn) or the finish
  restart             -> back to last checkpoint (counts as an attempt)
  reset               -> back to the start line (counts as an attempt; the 0.6 s hold rule, replayable)
  done                -> end the session
There is no undo. Time only goes forward. Budget: 150 calls or 25 minutes. Say DONE when finished or stuck.
```

### 3.2 CLI and logging

```ts
// harness/stranger/session.ts
export interface SessionState { id: string; trackId: string; seed: number; startedAt: string; calls: number;
  attempts: AttemptLog[]; recorder: InputRecorder; cleared: boolean; finishTime: number | null }
export type Cmd = { kind: 'status' } | { kind: 'play'; slots: string } | { kind: 'restart' } | { kind: 'reset' } | { kind: 'done' };
export interface PlayResult { summary: Summary; events: GameEvent[]; sheet: string; attempt: number; budget: { callsLeft: number; secondsLeft: number } }
```

- `run-stranger.ts` opens one headless page (`openGame`, `harness=1`) and a tiny server on a Unix socket
  at `out/stranger/<id>/sock`; `cli.ts` is a thin client. One page per session, so the stranger cannot
  fork state or peek at the future.
- `play` maps slot codes onto `bot/actions.ts` macros (same vocabulary as the bot, so bot and stranger
  attempts are comparable), steps `HOLD` ticks each via `__trials.step`, drains events, renders 8 frames
  evenly across the call with `render(true)` + `page.screenshot`, tiles them with `contactSheet()` ->
  `sheets/NNN.jpg` with the sim time burnt into each tile. Visual feedback is the sheet; the summary line
  is the only numeric state exposed.
- Every `fault` event and every `restart`/`reset` appends an `AttemptLog`. The stranger cannot edit the
  log; the session owns it and writes `attempts/NNN.json` immediately (crash-safe).
- All inputs go through the same `InputRecorder`, so `session.json` embeds a replayable recording;
  `harness:replay` on it must reproduce the same fault count and finish time (this proves the log).
- Budget: `calls >= 150` or wall >= 25 min -> the CLI answers `{budget: 'exhausted'}` and refuses `play`;
  `run-stranger.ts` then finalizes and kills the page.

### 3.3 Metrics

`strangerAttempts` = number of `AttemptLog` entries, +1 if `cleared` (the final successful attempt).
Also `strangerClearWallMs`, `strangerCalls`, `firstCheckpointCalls`, `faultsByCheckpoint`, `cleared`.
Aggregate over >= 2 strangers per track (independent sub-agent instances, different `seed` for cosmetics
only). Track gate: `median(strangerAttempts) <= 1.5 * targetAttempts` and `cleared` for every stranger.
Output `out/stranger/<trackId>/<sessionId>/session.json` (`StrangerSession`).

## 4. Blind side-by-side clip comparison

Inputs: our clip (from `harness:capture` of a bot/stranger recording, trimmed to the manoeuvre) and a
reference clip from `reference/*/clips/*.mp4` tagged with the same manoeuvre. Manoeuvre tags:
`wheelie-launch`, `fault-respawn`, `countdown-go`, `big-jump-landing`, `finish`, `bunny-hop`,
`rear-wheel-balance`, `steep-climb`.

### 4.1 Normalize (`compare/normalize.ts`)

Both clips -> 1280x720, 30 fps, h264 yuv420p, silent. Duration = `min(len(a), len(b))` unless `--align
<ours_s>:<ref_s>` gives per-clip anchor times (impact frame, GO frame, touchdown), in which case both are
cut to `[t0 - 1.0, t0 + 2.5]` s. Letterbox, never stretch. ffprobe asserts both frame counts equal.

### 4.2 Mask (`compare/mask.ts`)

```ts
export interface MaskResult { runId: string; left: 'ours' | 'ref'; seed: number; abMp4: string; abSheet: string; keyFile: string }
export function maskPair(ours: string, ref: string, seed: number, outDir: string): Promise<MaskResult>;
```

`left = new Rng(seed).next() < 0.5 ? 'ours' : 'ref'`. `ffmpeg -filter_complex hstack` -> `ab.mp4`
(2560x760) with a 40 px label bar reading only "A" (left) and "B" (right). `ab-sheet.jpg`: 2 rows x 12
columns, row A = left clip, row B = right clip, frames at identical timestamps, timestamp burnt into each
tile so timing differences are judgeable from a still. `key.json` `{runId, seed, left}` is written next
to them and `chmod 000` for the duration of the critic call. Each critic call gets its own seed so roughly
half the critics see ours on the left.

### 4.3 Critic (`compare/critic.ts`, `RUBRIC.md`)

The critic is a sub-agent given `ab-sheet.jpg` and the `ab.mp4` path (it may extract more frames with
ffmpeg; it cannot read `key.json`). Prompt shape:

```
Two clips of the same manoeuvre: <manoeuvre>. Decide which looks more like a shipped AAA trials game.
Score each criterion 1-5 for A and B, then pick a winner. Output ONLY JSON:
{ "winner": "A"|"B"|"tie", "confidence": 0..1,
  "criteria": { "<id>": { "A": n, "B": n, "note": "" } }, "reasons": ["..."] }
Criteria: <RUBRIC.md entries for this manoeuvre>
```

RUBRIC.md turns corpus observations into checkable items per manoeuvre:
- `fault-respawn`: `hard-cut-no-fade`, `back-in-control-under-1s`, `camera-already-settled-on-cut`,
  `crash-stamp-0.2-0.6s`, `fault-counter-flips-on-respawn-frame`, `bike-becomes-debris`, `dust-on-impact`.
- `wheelie-launch`: `pitch-back-within-0.3s`, `rider-lean-lags-100-150ms`, `rear-hop-cadence-0.4-0.5s`,
  `exhaust-puff-on-throttle`, `pitch-drifts-and-corrects-not-snaps`.
- `big-jump-landing`: `rear-wheel-first`, `two-stage-settle-0.25s+0.4s`, `dust-0.1s-after-touchdown`,
  `camera-pullback-0.7s-to-apex`, `landing-in-bottom-third`, `airtime-2.4-3.2s`.
- `countdown-go`: `1.0s-beat-spacing`, `numerals-quarter-frame-fade-0.5s`, `bike-live-during-count`,
  `moves-on-go-frame`, `camera-dolly-during-count`.
- `finish`: `timer-freezes-on-line`, `flash-within-0.2s`, `physics-keeps-running`, `plaque-within-1.5s`.

Verdict validation: JSON parses, every criterion present with integers 1-5, `winner` in enum; otherwise
one retry, then logged as `invalid`. `compare.ts` runs `--n` critics (default 4, seeds 1..n), unmasks
each with `key.json`, and writes `compare.json` (`CompareReport`):
`oursWinRate = wins / (n - ties - invalid)`, `positionBias = |P(left wins) - 0.5|` (flagged when > 0.3
and n >= 8), `criteriaDelta[id] = mean(ours - ref)`. A manoeuvre passes at `oursWinRate >= 0.5` and no
criterion with `criteriaDelta < -1.0`. Every verdict keeps `left` so bias is auditable after the fact.

## 5. Ship gate (`gate/ship-gate.ts`)

One command, one JSON, exit code = number of failed checks (0 = ship). Runs against a fresh build
(`--build` implied) and a fresh browser context per phase. Every check has a threshold in
`gate/thresholds.json`; every check prints `PASS|FAIL  <id>  <value><unit>  (limit <threshold>)`.

### 5.1 Phases

| # | Phase | How measured | Fields |
|---|---|---|---|
| G1 | Cold boot | 3 fresh contexts; nav -> `__trials.ready`; then `ready -> first render(true)` | `boot.p50`, `boot.max`, `boot.firstFrameMs` |
| G2 | Clear a track | `runRecording(inputs/<track>/bot-oracle.json)`; `finishTime` bit-equal to `expected.json`, `faulted === null`, `hashState()` equal | `clear.*` |
| G3 | Crash | `runRecording(inputs/<track>/crash.json)` (full gas + lean back into the first obstacle; produced by `bot --crash-probe`, which searches for the earliest `crash` fault); assert `fault{reason:'crash'}` within 8 s sim | `crash.faultTick` |
| G4 | Fault -> control | after G3: `setInput({throttle:1})`, step 1 tick at a time until `state.tick < previous` (respawn happened) AND `bike.vel.x > 0.05`; ticks * 1000/120 = ms | `fault.toControlTicks`, `fault.toControlMs` |
| G5 | Restart latency | at t=3 s of the clear replay, 20 reps: `t0=now; setInput({restart:true}); step(1); setInput({restart:false})`; assert `tick===0`, `checkpoint` correct, `faulted===null` after exactly 1 tick; then `render(true)` timing | `restart.ticks` (1), `restart.wallMs[]`, `restart.frameMs[]` |
| G6 | No countdown on restart | after G5, hold `throttle:1` from the first tick after the restart tick; the bike must roll (`vel.x > 0`) within `restart.movesWithinTicks` (12; the clutch needs 2, a countdown would be 360+), worst of 20 reps | `restart.noCountdown` (ticks), `restart.movesAfterTicks` |
| G7 | Capture sanity | `capture` of the clear replay with `--tail 0`; ffprobe frames == `ceil(ticks*fps/hz)`; end hash == G2 hash | `capture.*` |
| G8 | Perf | 5 s `perf`: draw calls, tris, textures MB, heap growth, physics us/tick, render submit ms | `perf.*` |
| G9 | Determinism | section 6 checks D1-D5, D7, D8 | `determinism.pass` |
| G10 | Stranger | `out/metrics/{b1,b2,b3,e1}.stranger.json`: median `strangerAttempts` of sessions completed on the working tree's src fingerprint vs 1.5 × `meta.attemptsBand[1]`; informational until every track has ≥ `stranger.minSessions` (2) such sessions, then all four must pass with every counted session cleared | `stranger.medianAttempts`, `stranger.rows[]` |

### 5.2 Thresholds (`gate/thresholds.json`)

The file is the source of truth (CONTRACT §3); this is a copy:

```json
{
  "$comment": "Single source of truth for ship-gate thresholds (CONTRACT.md §3). Units in the key suffix. Changing a number here is a design decision; the gate reports value vs limit for every check.",
  "boot.readyP50Ms": 300,
  "boot.firstFrameMs": 900,
  "clear.golden": true,
  "clear.finishTimeBitEqual": true,
  "clear.hashOk": true,
  "crash.faultWithinS": 8,
  "fault.toControlMs": 500,
  "restart.ticks": 1,
  "restart.wallMsP95": 5,
  "restart.frameMsP95": 33,
  "restart.noCountdown": true,
  "restart.movesWithinTicks": 12,
  "heap.growthMBPer60s": 5,
  "bundle.jsGzipKB": 600,
  "perf.drawCallsMax": 300,
  "perf.trianglesMax": 500000,
  "perf.texturesMBMax": 96,
  "perf.physicsUsPerTickP95": 60,
  "perf.physicsUsPerTickP95Ragdoll": 80,
  "perf.renderSubmitMsP95": 4,
  "determinism.pass": true,
  "stranger.attemptsBandFactor": 1.5
}
```

`fault.toControlMs 500` is the manual-restart path (crash tick → restart mash → bike moving); it sits between Evolution's 350 ms hard cut and Rising's 750 ms (which includes the player's reaction). The auto-respawn path is reported alongside (CONTRACT §2.8 fixes it at 1.0 s). Scaffold measurements (boot 39-80 ms, restart 0.2 ms, restart -> frame 11.5 ms,
physics 6 us/tick, 9 draw calls) are far inside; the thresholds are where the finished game must still be.
Render `submit` ms is gated; synced ms is reported only, because SwiftShader inflates it ~10x.

`harness:gate --all-tracks` iterates `listTracks()` for G2-G7 (G1, G8, G9 once) and writes
`out/summary.json` with the latest `BotRunReport`, `StrangerSession` and `CompareReport` per track
alongside the gate result.

## 6. Determinism gate (`gate/determinism.ts`)

| # | Check | Assert | Cadence |
|---|---|---|---|
| D1 | Cross-load | same recording in 3 fresh page loads: identical `hashState()`, `finishTime`, `tick` | gate |
| D2 | Cross-encoding | `.json` vs `.bin` of the same recording: identical hash | gate |
| D3 | Node vs browser | `createSim().run(rec).hash` == browser hash (the bot's whole premise) | gate |
| D4 | Snapshot round-trip | node: run k, snap, run m -> h1; restore, run m -> h2; h1 == h2 for (k,m) in {(0,1),(37,7),(500,120),(1000,1200)}; also `restore` from a snapshot serialized through base64 (hook path) | gate |
| D5 | Chunking | browser `step(1)` x N == `step(N)` == `runRecording`; chunk sizes 1, 7, 15, 120 | gate |
| D6 | Live-vs-replay | play `KeyboardInput` in a RAF page under CDP `Emulation.setVirtualTimePolicy` with frame jitter {8,16,33,50} ms, `stopRecording()`, replay in harness mode: same hash | nightly |
| D7 | No state leak | load track B, run 600 ticks, load A, run rec -> same hash as A cold | gate |
| D8 | Pinned hash | 1200-tick canonical run hash equals `gate/expected.json`; changing physics without bumping it fails on purpose | gate |

On mismatch the tool bisects over `step` with hashes (<= 11 extra runs for 1200 ticks), prints
`firstDivergentTick` and `diffState()` paths, exits 1. Output `out/gate/determinism.json`.

`--tail-s N` (round 6) appends N s of throttle 1 / lean 1 after the recording's last tick before running
D1–D8. Goldens end on the finish tick, so without it the post-finish coast (`Game.stepFinishCoast`, mirrored in
`lib/rules.ts`) is never compared; with it D3 proves node and page agree through and after the line.

## 7. Metric summary

| Metric | Definition | Source | Threshold |
|---|---|---|---|
| `botAttempts[k]` | faults + 1 in committed play at skill k, median of 3 seeds | `harness:bot` | monotone; `botAttempts[3] <= targetAttempts` |
| `botParTime` | oracle `finishTime` | `harness:bot --oracle` | <= 1.3x author par |
| `strangerAttempts` | CLI-logged attempts until clear | `harness:stranger` | median <= 1.5x `targetAttempts`; all clear |
| `strangerClearWallMs` | wall time to first clear | same | <= 20 min |
| `fault.toControlMs` | crash fault -> bike responds to throttle | gate G4 | <= 500 |
| `restart.ticks` / `restart.frameMsP95` | restart input -> reset state / synced frame | gate G5 | 1 / <= 50 |
| `restart.noCountdown` | ticks of held throttle after the restart tick until the bike rolls (worst of 20) | gate G6 | ≤ `restart.movesWithinTicks` (12) |
| `boot.p50Ms` / `boot.maxMs` | nav -> `__trials.ready` | gate G1 | 800 / 1500 |
| `oursWinRate[manoeuvre]` | blind critic wins vs reference | `harness:compare` | >= 0.5 per shipped manoeuvre |
| `determinism.pass` | D1-D5, D7, D8 | `harness:determinism` | true |

## 8. JSON schemas (`harness/lib/schema.ts`)

```ts
export interface RunMeta { schema: 1; kind: string; runId: string; startedAt: string; wallMs: number; git: string; node: string; chromium?: string }

export interface FaultEvent { attempt: number; reason: FaultReason; tick: number; simTime: number; x: number; checkpoint: number }

export interface BotRunReport extends RunMeta {
  kind: 'bot'; trackId: string; seed: number; physicsHz: number; skill: Skill;
  config: BeamConfig | null; weights: ScoreWeights;
  outcome: 'finished' | 'maxAttempts' | 'timeout';
  attempts: number; faults: FaultEvent[]; faultsByCheckpoint: number[];
  finishTime: number | null; simSeconds: number; ticks: number;
  search: { plans: number; expandedTotal: number; ticksSimulated: number; planWallMs: { p50: number; p95: number; max: number } };
  recordingFile: string; nodeHash: string; browserHash: string | null; browserVerified: boolean;
}

export interface AttemptLog { n: number; endedBy: 'fault' | 'restart' | 'reset' | 'finish'; reason?: FaultReason;
  checkpoint: number; x: number; simTime: number; wallMs: number; calls: number }

export interface StrangerSession extends RunMeta {
  kind: 'stranger'; sessionId: string; trackId: string; seed: number; agent: string;
  cleared: boolean; attempts: AttemptLog[]; strangerAttempts: number;
  finishTime: number | null; calls: number; budget: { calls: number; minutes: number; exhausted: boolean };
  faultsByCheckpoint: number[]; firstCheckpointCalls: number | null;
  recordingFile: string; replayVerified: boolean; replayFaults: number; sheets: string[];
}

export interface CriticVerdict { i: number; seed: number; left: 'ours' | 'ref';
  winner: 'A' | 'B' | 'tie' | 'invalid'; winnerUnmasked: 'ours' | 'ref' | 'tie' | 'invalid';
  confidence: number; criteria: Record<string, { A: number; B: number; note: string }>; reasons: string[]; agent: string; wallMs: number }

export interface CompareReport extends RunMeta {
  kind: 'compare'; manoeuvre: string;
  ours: { file: string; sha1: string; recording?: string }; ref: { file: string; sha1: string; source: string };
  normalized: { durationS: number; fps: 30; frames: number; align?: [number, number] }; abMp4: string; abSheet: string;
  verdicts: CriticVerdict[]; n: number; wins: number; losses: number; ties: number; invalid: number;
  oursWinRate: number; positionBias: number; criteriaDelta: Record<string, number>; pass: boolean;
}

export interface GateCheck { id: string; value: number | boolean | string; limit: number | boolean | null; pass: boolean; unit?: string; note?: string }

export interface GateReport extends RunMeta {
  kind: 'gate'; trackId: string; build: { distBytes: number; buildMs: number };
  browser: { version: string; renderer: string; flagSet: string };
  checks: GateCheck[]; failed: number;
  boot: { runs: number[]; p50: number; max: number; firstFrameMs: number };
  clear: { finishTime: number; expected: number; hash: string; expectedHash: string; hashOk: boolean };
  crash: { faultTick: number; faultTime: number; reason: FaultReason };
  fault: { toControlTicks: number; toControlMs: number };
  restart: { ticks: number; wallMs: number[]; frameMs: number[]; noCountdown: boolean };
  capture: { frames: number; expectedFrames: number; hash: string; hashOk: boolean; file: string };
  perf: { drawCalls: number; triangles: number; texturesMB: number; heapGrowthMB: number;
          physicsUsPerTickP95: number; renderSubmitMsP95: number; renderSyncedMsP95: number };
  determinism: DeterminismReport;
}

export interface DeterminismReport extends RunMeta {
  kind: 'determinism'; recordingFile: string; ticks: number;
  checks: Array<{ id: 'D1'|'D2'|'D3'|'D4'|'D5'|'D6'|'D7'|'D8'; pass: boolean; hashes: string[]; firstDivergentTick?: number; diffPaths?: string[] }>;
  pass: boolean;
}
```

All reports are written with `writeJson()`, are self-describing (`kind`, `schema`), and use
`runId = <yyyymmdd-hhmmss>-<6 hex>`. `expected.json` shape:
`{ "<trackId>": { "oracle": { "finishTime": 9.8667, "hash": "948ef53c3fcd4ad7", "ticks": 1184 }, "canonical1200": "0143fe65da949eb2" } }`.

## 9. Build plan

Milestones in order; each has one acceptance test the parent runs on this headless machine. A milestone
is not done until its test passes and its outputs exist under `harness/out/`.

**M1 — Sim adapter + snapshot/restore.** `PhysicsWorld.snapshot/restore`, `harness/lib/sim.ts`,
`TrialsHook.snapshot/restore/drainEvents`, `hash.ts diffState`, `gate/determinism.ts` (D1-D5, D7, D8).
Accept: `pnpm harness:determinism harness/inputs/flat-test-clear.json` exits 0 with all 7 checks
`pass: true`; deliberately breaking `restore` (skip the RNG field) makes D4 fail with `diffPaths`
naming that field and a `firstDivergentTick`.

**M2 — Bot oracle.** `bot/{actions,score,beam,play,bot}.ts`, `pnpm harness:bot flat-test --oracle`.
Accept: 0 faults, `finishTime <= 1.05 x 9.8667` (the hand-made clear), search wall <= 30 s,
`browserVerified: true` via `harness:replay`, and `harness:capture` of the recording yields a clip whose
ffprobe frame count equals the expected count.

**M3 — Committed-play skills + difficulty curve.** `--skill 0..3 --seeds 3`, in-band restart, timeout.
Accept: on a track with one deliberate gap (`gap-test`, from the tracks builder) the median
`botAttempts` is monotone non-increasing over skills 0..3, skill 0 >= 2, skill 3 == 1; the recording's
`FLAG_RESTART` rising edges + 1 equals reported `attempts`; `harness:replay` reproduces the same fault
count and finish time.

**M4 — Ship gate v1.** `gate/{thresholds.json,expected.json,ship-gate.ts}`, `bot --crash-probe` writing
`inputs/flat-test/crash.json`, `harness:all` aliased. Accept: `pnpm harness:gate` exits 0 on `flat-test`
with every G1-G9 field populated in `gate.json`; editing `thresholds.json` to `"restart.ticks": 0` makes
it exit 1 with exactly one FAIL line; `rm -rf dist` then `harness:gate` still passes (auto-build).

**M5 — Stranger CLI + protocol.** `stranger/{cli,session,run-stranger}.ts`, `PROTOCOL.md`.
Accept: a scripted fake stranger (shell loop: `play`, `play`, `restart`, `play` into a crash, `done`)
yields `session.json` with `attempts.length == 2`, an embedded recording that passes `harness:replay`
with `replayFaults == 1`, and the 151st call answers `budget: exhausted`. Then one real sub-agent
stranger clears `flat-test` in <= 10 calls with `cleared: true`.

**M6 — Blind compare.** `compare/{normalize,mask,critic,compare}.ts`, `RUBRIC.md`.
Accept: `harness:compare --ours X --ref X --manoeuvre fault-respawn --n 4` with the same file on both
sides gives `ties + invalid == 4` or a reported `positionBias`; with `--ours <capture of flat-test> --ref
reference/crash-restart-ui/clips/02-*.mp4` all 4 verdicts parse, a probe inside the critic sandbox gets
`EACCES` on `key.json`, and `compare.json` shows both `left` values across the 4 seeds.

**M7 — Metrics on real tracks.** With real physics and >= 3 tracks: bot skills 0-3 x 3 seeds, 2
strangers per track, compare on `wheelie-launch`, `fault-respawn`, `countdown-go`.
Accept: each track has 12 `BotRunReport`, 2 `StrangerSession`, 3 `CompareReport` under `out/`; the
round summary quotes `botAttempts`, `strangerAttempts`, `fault.toControlMs`, `oursWinRate` from those
files; at least one track meets every threshold in section 7.

**M8 — Nightly.** D6 live-vs-replay under virtual time, `harness:gate --all-tracks`, `out/summary.json`.
Accept: `--all-tracks` over 5 tracks finishes in <= 10 min and exits with the failed-check count; D6
passes on `flat-test` for jitter {8, 16, 33, 50} ms; `summary.json` has one entry per registered track.
