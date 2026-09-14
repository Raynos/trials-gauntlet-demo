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
