# Headless harness

Drives the game in headless Chromium (SwiftShader WebGL2, no GPU, no window)
through `window.__trials`, the in-page test hook, and drives the same physics
directly in node (`lib/sim.ts`) for search. Nothing here uses a real clock:
the harness owns every physics tick and every rendered frame.

The metric is **attempts-to-clear and restart latency, from a bot and from a
stranger** (AGENTS.md). Everything below produces numbers or clips for that.

## Commands

| command | what it proves | output |
| --- | --- | --- |
| `pnpm harness:bot <trackId> [--bike rookie\|pro] [--skill 0..3] [--oracle] [--all] [--seeds N] [--budget ms] [--crash-probe] [--no-verify]` | attempts-to-clear per skill (beam search in node, committed play with in-band restarts), 0-fault oracle par, browser-verified golden recordings, a deterministic crash recording. `--bike` (round 7, default rookie) loads the track on that class (`loadTrack(track, seed, { bike })`) and stamps `bike` in the recording header + note | `out/metrics/<trackId>.json` / `<trackId>.pro.json` (committed), `out/bot/<trackId>/<runId>-skill<k>[-pro].json`, `inputs/<trackId>/bot-<skill>.json` (rookie) / `bot-<skill>-pro.json`, `inputs/<trackId>/crash[-pro].json` |
| `pnpm harness:bot --all-tracks [--bike rookie\|pro] [--skill 2 \| --skill 2,3] [--seeds 2] [--track-wall-s 90] [--tracks a,b]` | **track sweep**: budget-capped committed play on every registered track; best distance (m, % of finishX), clears, attempts, first blocker (fault reason + x + nearest placed obstacle). A skill list writes one table per skill | `out/metrics/sweep.json` (`sweeps[]`) + `sweep.md` (committed), goldens for cleared tracks |
| `pnpm harness:reflex <trackId> [--bike rookie\|pro] [--skill novice\|average\|good] [--seeds 3] [--attempts-cap 50] [--max-sim-seconds 300] [--browser N] [--all-skills] [--no-verify] [--build]` | **the reflex bot — a person holding keys, the primary attempts-to-clear instrument**: a continuous real-time controller with human limits (glances at 20–30 Hz of what is on screen — pitch, pitch rate, speed, height, the ground silhouette ~1.5 s ahead, the next mark — with ±2° / ±5 % noise, a 160–250 ms reaction delay drawn per run, binary keys changed at most every ~80 ms, lapses, and a per-section memory that changes the *approach* to x after a fault at x). No lookahead, no search, no track internals. Node run per seed via `createSim` (0.1 s wall), one recording browser-verified through `runRecording` (node hash == browser hash). `--browser N`: N runs against the **live game** (`?track=`, no harness param: App shell, countdown, `RafDriver`, `KeyboardInput`) through `page.keyboard.down/up`, eyes = `getState()` over CDP; the page runs on Playwright's fake clock at 60 fps (`--wall-clock` for the real clock, which on SwiftShader is a 3–4 fps game); the live recording (+ the neutral ticks before the first key) must replay in node to the browser's hash (`roundTrip`) | `out/metrics/<trackId>.reflex.json` (rookie) / `<trackId>.pro.reflex.json` (committed), `out/reflex/<trackId>/<runId>-<skill>[-pro].{json,rec.json}`, `…-browser-<skill>.{json,rec.json}` (`--browser` drives the live game on its default bike: rookie only) |
| `pnpm harness:reflex --all-tracks [--bike rookie\|pro\|both] [--skill average] [--seeds 3] [--tracks a,b]` · `pnpm harness:reflex --calibrate` | curriculum table (attempts per seed, median, clears, time to clear, where it died with the rule it was executing), one section per bike class with `--bike both`, + the stranger-vs-reflex calibration table on b1/b2/b3/e1 (rookie) | `out/metrics/reflex.md` (committed) |
| `pnpm harness:round [--build] [--quick] [--pin] [--tracks flat-test,gap-test,b1-first-ride]` | **per-round check**: bot on three tracks (+ crash probe), determinism on the fingerprint-matched golden, ship gate; exit = failed steps. `--quick` = skill 2, 60 s bot wall, 2 loads, gate `--quick`: **108 s incl. build** on this machine (full: skill 3, 3 loads, 60 s heap) | all of the below |
| `pnpm harness:clip <trackId> [--recording <path>] [--at-x m --before 1.5 --after 3] [--from-tick N --to-tick N] [--fps 60] [--quality high] [--build] [--no-camera-check] [--no-camera-assert]` | **clip evidence per track**: the best recording under `inputs/<trackId>/` (replayed in node: finished > fewer attempts > faster; ties to the current src stamp), rendered 1280×720 @ 60 fps with `setQuality('high')`; `--at-x` renders only the window around the first tick the bike passes x (manoeuvre clips for `harness:pair`). **Camera assertion on every rendered frame** (on by default): `hook.camera()` bike screen position inside the central [0.2, 0.8] box while riding, \|roll\| < 1e-6, count + % of frames the rig clamped to the track's camera bounds, frames per rig state; printed as the `camera:` line and stored in `clip.json.camera`; a failure exits 1 after writing the clip. Windowed clips exclude the first 0.5 s (cold rig). ~25 s wall per clip second on SwiftShader | `out/capture/<trackId>/{clip.mp4,sheet.jpg,clip.json}` |
| `pnpm harness:clip --tile a,b,c,d [--recapture] [--out tile.jpg]` | one 4×4 contact sheet across tracks: one row per track, frames at 10/37/63/90 % of its clip (captured first when missing) — the parent judges several tracks in one image | `out/capture/tile.jpg` (+ `tile-N.jpg` beyond 4 tracks), `tile.json` legend |
| `pnpm harness:critic-prompt <pair-id>` | the exact, self-contained prompt for a blind critic (tag, sheet + mp4 paths, RUBRIC sections, JSON shape); hand to a fresh agent unchanged | `out/compare/pair-<id>.prompt.md` |
| `pnpm harness:stranger <start\|look\|play "<slots>"\|restart\|reset\|status\|done> [--track id] [--session id] [--bike rookie\|pro on start/prep]` | attempts-to-clear for a fresh agent that knows only `stranger/PROTOCOL.md` (spawn text: `stranger/run-stranger.md`); 150 calls / 25 min budget; pass = median ≤ 1.5 × `meta.attemptsBand[1]`. The stranger sees what a player sees and nothing more: `look`/`start` print the track card (tier, name, `meta.technique`, beginner `meta.hints`, checkpoint xs, finish x), every `play`/`restart`/`reset` ends with the side-view from the new position, and a crash plays out the game's 1.0 s auto-respawn (`lib/rules.ts`) inside the call. Every ended attempt writes a replayable prefix recording + `startTick`/`endTick`; `session.json.bestAttempt` names the clip-worthy one | `out/stranger/<track>/<session>/{state,session}.json`, `attempts/NNN.{json,rec.json}`, `inputs/<trackId>/stranger-<session>.json` |
| `pnpm harness:stranger report <trackId> [<trackId>...] [--stale]` | **stranger aggregate** (parent side, no call counted): every session of a track — attempts, cleared, time to clear, calls, wall, where each attempt died (nearest placed obstacle), best attempt tick window; medians over completed sessions on the current src fingerprint (`--stale` includes older physics); pass per CONTRACT §3. Several tracks add one summary table (band, sessions, completed, cleared, medians, pass) | `out/metrics/<trackId>.stranger.json` (committed) + `.stranger.md` |
| `pnpm harness:stranger prep --tracks b1-first-ride,b2-lean-back,... [--agents s1,s2] [--round r3]` | **stranger round set-up** (parent side): agents × tracks fresh sessions (ids `<track>-<round>-<agent>-<stamp>`) and one paste-ready prompt per session (the `run-stranger.md` block with track + session id filled) | `out/stranger/rounds/<round>/{spawn.md,manifest.json}` |
| `pnpm harness:pair <ours.mp4> <ref.mp4> --tag <manoeuvre> [--seed N] [--mask] [--align a:b]` | blind side-by-side: both clips to 640×360@30, seeded L/R coin, `hstack` mp4 + 2×8 sheet, sealed answer (chmod 000) | `out/compare/pair-<id>.mp4`, `pair-<id>-sheet.jpg`, `pair-<id>.answer.json` |
| `pnpm harness:log-verdict <pair-id> --verdict '<json>' [--critic name]` | validates a critic verdict, unmasks, appends; running oursWinRate / positionBias per tag | `out/metrics/compare.jsonl` (committed) |
| `pnpm harness:gate [--track flat-test] [--build] [--quick] [--heap-seconds 60] [--pin]` | **ship gate**: cold boot, first frame, clear by golden replay (bit-equal finish + hash vs `gate/expected.json`), **Pro clears** (`clear.pro.flat` + `clear.pro.b1`: the `bot-3-pro.json` goldens of flat-test and b1, pinned under `<track>:pro`), crash, fault→control, restart latency, no countdown on restart, heap over 60 s, perf counters, bundle gz, determinism D1–D8, G10 stranger medians for b1/b2/b3/e1 on the current src (informational until each has ≥ 2 completed sessions) and the G10 second row `reflex.medianAttempts` (reflex bot `average` medians from `<track>.reflex.json` on the current src, informational until each has ≥ `reflex.minSeeds` seeds) + the third row `reflex.medianAttempts.pro` (same from `<track>.pro.reflex.json`; always informational — the band is authored for the tier's default bike). Exit code = failed checks | `out/metrics/ship-gate.json` (committed) |
| `pnpm harness:physics-suite [--bike rookie\|pro\|both] [--tag v1] [--quick] [--build] [--skip feel,sweep,clears,reflex,clip,stranger]` | **physics acceptance in one command** (round 7; what the parent runs to accept physics v2 next to v1): identity (implementation, src, bike classes), the feel envelope (`vitest run src/physics`, every `FEEL <q> = <v> [band]` line, band-checked where the band parses), determinism D1–D8 + **D4c foreign snapshot** (a snapshot restored into a fresh sim continues identically) + the snapshot-probe on the flat-test golden per class, the naive sweep (skill 2, 1 seed, wall-capped, every track), bot skill-3 clears on b1/e1/m1/h1/x1 browser-verified, reflex `average` × 3 seeds on b1–e3, the camera box on the b3 golden clip, and a stranger CLI smoke (start → play → crash/auto-respawn → restart → reset → status; recording node == browser; the session is removed afterwards). Verdict ACCEPT/REJECT, exit = FAIL count; run once per physics and diff the JSONs | `out/physics-suite/<stamp>-<physics>-<tag>.{json,md}` + `latest.{json,md}` |
| `pnpm harness:snapshot-probe <recording> [--every 15] [--max-ticks 600]` | **snapshot fidelity under search load**: sim B replays the recording but every N ticks does what beam search does at a plan root (snapshot, roll every macro-action 15 ticks, restore); the first tick where B differs from a straight replay names the state physics keeps outside `snapshot()/restore()`. The bot prints the same finding per run as `playReplayDivergence` and the sweep as its `replay` column. Exit 1 on divergence | stdout |
| `pnpm harness:determinism <recording> [--loads 3] [--pin] [--tail-s 3]` | D1 cross-load, D2 json/bin, D3 node-vs-browser (bisects to the first divergent tick + state paths), D4/D4b snapshot round trip node/page, D4c foreign snapshot (restore into a fresh sim), D5 chunking, D7 no state leak (on the *other* bike class first), D8 pinned canonical hash (per class: `<track>` / `<track>:pro` in `expected.json`). A Pro recording (header `bike: 'pro'`) runs on the Pro bike in node (`createSimFor`) and in the page (`__trialsRunAs`, see Notes). `--tail-s N` appends N s of throttle 1 / lean 1 after the recording's last tick — a golden ends on the finish tick, so this is what proves the post-finish coast (`Game.stepFinishCoast`) is mirrored in node | `out/gate/determinism.json` |
| `pnpm harness:boot [--runs 3]` | cold boot → `__trials.ready` ms, heap, renderer string, restart latency | `out/boot/boot.json` |
| `pnpm harness:replay <input> [--runs 2]` | two fresh page loads hash-identical | `out/replay/<name>.json` |
| `pnpm harness:capture <input> [--fps 60] [--mode screenshot\|canvas]` | evidence clip + 4×2 contact sheet, ffprobe-verified | `out/capture/<name>/{clip.mp4,sheet.jpg}` |
| `pnpm harness:perf [--seconds 10]` | render/physics cost under simulated play | `out/perf/perf.json` |
| `pnpm harness:gen-input` | synthetic recording | `inputs/*.json` |
| `pnpm harness:all` | scaffold chain boot → replay → capture → perf | all of the above |

All browser commands accept `--dev` (Vite dev server), `--build` (rebuild
first), `--json`, `--verbose`. Thresholds live **only** in
`gate/thresholds.json` (CONTRACT §3).

## Round workflow (what the parent runs)

```
pnpm harness:round --build                               # bot flat-test/gap-test/b1 + determinism + gate
pnpm harness:reflex --all-tracks --bike both --seeds 3     # the human-like attempts table, one section per class: out/metrics/reflex.md (+ <track>[.pro].reflex.json, feeds gate G10)
pnpm harness:bot <track> --bike pro                       # Pro golden (inputs/<track>/bot-3-pro.json) — the gate's clear.pro.* rows need flat-test + b1
pnpm harness:physics-suite --bike both --tag v2           # accept a physics implementation: every instrument, one md/json; diff against the v1 baseline in out/physics-suite/
pnpm harness:reflex b1-first-ride --seeds 3 --browser 3 --build   # + 3 live-browser runs on real keys (≈ 12 min each on SwiftShader)
pnpm harness:bot --all-tracks --skill 2 --seeds 2        # the sweep table for tracks/physics owners
pnpm harness:bot <track> --all --seeds 3 --crash-probe   # full curve on one track, browser-verified
pnpm harness:gate --build                                # numbers vs thresholds -> out/metrics/ship-gate.json
pnpm harness:clip <track>                                # best recording -> out/capture/<track>/clip.mp4 + sheet (1280x720@60, high)
pnpm harness:clip --tile b1-first-ride,b2-lean-back,b3-kicker-row,e1-uphill-weight   # 4x4 sheet, one row per track
pnpm harness:clip b2-lean-back --at-x 37 --before 1 --after 3.5 --out harness/out/capture/b2-drop   # manoeuvre window for a pair
pnpm harness:pair harness/out/capture/b2-drop/clip.mp4 reference/techniques/clips/07-*.mp4 --tag big-jump-landing --mask
pnpm harness:critic-prompt <pair-id>                     # -> out/compare/pair-<id>.prompt.md, hand to a fresh critic unchanged
# spawn a critic with compare/RUBRIC.md + the sheet + the mp4 path; then
pnpm harness:log-verdict <pair-id> --verdict '<json>' --critic <name>
# spawn a stranger: paste stranger/run-stranger.md's block (PROTOCOL.md + track + session id); afterwards
pnpm harness:stranger report <track>                     # -> out/metrics/<track>.stranger.{json,md}
pnpm harness:clip <track> --recording <bestAttempt.recordingFile> --from-tick <bestAttempt.startTick> --out harness/out/capture/stranger/<track>-<session>
# 6 s around one obstacle: --from-tick/--to-tick from the attempt's ticks (out/capture/stranger/* holds the round-1 set,
# rendered on the sessions' own src fingerprint: when the working tree has moved on, capture from a `git archive HEAD` copy)
```

`bot` must be re-run after any physics or track change: the gate's `clear.*`
and `D8` checks fail on purpose when the goldens predate the physics. Goldens are
chosen by **src fingerprint** (`lib/golden.ts`): the bot stamps `src=<fp>` into every
recording's header note and the gate/round pick the highest-skill golden whose stamp
equals the working tree's, falling back to the newest file with a WARNING. `harness:clip`
prints the same stamp per candidate. **Goldens are per bike class** (round 7): `bot-<skill>.json`
is Rookie (the file names never changed), `bot-<skill>-pro.json` is Pro; `pickGolden(track, log, bike)`
matches the class, `--refresh-goldens` re-proves both sets, and a golden's header carries `bike`.

## Layout

```
lib/sim.ts        createSim(trackId, seed, hz, { bike }): physics factory resolved at runtime
                  (bikePhysicsFactory | createBikePhysics | MockPhysics) + compileTrack
                  + the run-rule layer; step/run/snap/restore/hash; no browser. createSimFor(rec) = the
                  sim a recording's header names (track, seed, hz, bike); parseBike('--bike')
physics-suite.ts  harness:physics-suite — every instrument against the current src/physics, one JSON + md
lib/rules.ts      node mirror of Game.tick() (riding/crashed/finished, restart edge,
                  0.6 s hold = full restart, 1.0 s auto-respawn, run clock, fault counter,
                  post-finish coast: throttle 0 / lean 0 / quantised 0 -> 0.6 brake ramp over 1 s,
                  a post-line fault restores the pre-step snapshot and freezes; counters = GameCounters)
lib/metrics.ts    attempt counting (1 + fault events), diffState, percentiles, run ids
lib/schema.ts     every JSON shape written under out/
lib/verify.ts     BrowserVerifier: one server (frozen copy of dist/) + browser, runRecording per fresh page
bot/              actions (13 macro-actions × 15 ticks) · score · beam · play (skills 0–3, oracle, player memory) · bot CLI
reflex/           the reflex bot: profile (ground silhouette from colliders) · perceive (one glance → features) · controller (skills,
                  reaction delay, rules, hands, lapses) · memory (x-bucket learning) · play (node driver) · browser (live keys, fake clock) · reflex CLI
stranger/         PROTOCOL.md (handed verbatim to the stranger) · run-stranger.md (what the parent pastes) · cli.ts · session.ts · view.ts (ASCII look) · report.ts (aggregate)
clip.ts           harness:clip: best-recording pick, tick windows, --tile; lib/golden.ts: fingerprint-matched goldens
compare/          normalize · mask · pair · log · RUBRIC.md · README.md
gate/             thresholds.json · expected.json (pinned hashes per physics; `<track>` = rookie, `<track>:pro` = pro) · determinism.ts · ship-gate.ts · snapshot-probe.ts
inputs/<track>/   bot-<skill>.json (rookie), bot-<skill>-pro.json, bot-oracle.json, crash.json, stranger-<session>.json (committed)
out/metrics/      <track>.json / <track>.pro.json, <track>.stranger.json, <track>.reflex.json / <track>.pro.reflex.json, reflex.md, compare.jsonl, ship-gate.json (committed; ship-gate.json carries the G10 stranger + reflex rows for b1/b2/b3/e1, both classes)
out/physics-suite/ <stamp>-<physics>-<tag>.{json,md}, latest.{json,md} (gitignored)
out/capture/stranger/<track>-<session>/   6 s stranger clips around the deadliest obstacle (clip.mp4, sheet.jpg, clip.json)
out/…             everything else (gitignored)
```

## Recording format

`src/core/replay.ts`. Header `{version, trackId, seed, physicsHz}` + one input
per tick, RLE-compressed. Inputs are quantized (u8 throttle/brake, i8 lean,
flag byte) *before* physics sees them in both live play and replay. JSON and
binary encodings decode to the same frames (gate D2). Replays start at GO; the
restart flag is in-band, so attempts are countable from the recording alone.

## Round 8 (physics v2 is the default): what changed in the harness

- **Solver stamp.** Every recording the harness writes carries `header.physics` (`'v2'` since the flip; `'v1'` only from a
  sim created with `{ physics: 'v1' }`) next to `bike`, and `physics=<v>` in the note (`lib/recording.ts recordingHeader`,
  used by bot / reflex / stranger). `Sim.physicsVersion` and `Sim.physicsName` (`bikePhysicsFactory-v2`) name the solver;
  `createSimFor(rec)` runs an explicit `physics: 'v1'` recording on `createBikePhysicsV1` and the verifier opens the page
  with `?physics=v1` for it — anything else (unstamped = pre-flip) runs on the default and is reported **stale** by
  `--refresh-goldens`, which also refuses to call a golden "fresh" unless its `physics` stamp matches (a node-only sweep's
  file is re-proved in the browser and restamped). `gate/expected.json` pins carry the solver in `physics`.
- **Technique macros** (`bot/actions.ts`): `h` hop (5 slots: 0.3 s preload at lean −1 / throttle 0.3, 0.22 s snap to +1
  at 0.5, 0.1 s tuck — the R2 reference recipe), `wh` wheelie hold (4 slots, closed loop: `wheelieHoldV3`'s anticipating
  regulator, `pitch + rate × 0.25 s` → throttle, rear brake on over-rotation, lean parked −0.5), `ct` climb-throw (4 slots,
  closed loop: base gas at neutral until the front wheel is on the face, then weight +1 and gas, chopped 20–30° over the
  slope — the `r3.test.ts plank` move). A macro may span several 125 ms slots and may decide its frame per tick from the
  state (`macroFrameAt`, `macroTicks`, `MacroCtx`); the beam rolls a multi-slot macro **HOLD ticks per depth** as a
  `pending` node that does not branch, so a depth stays 125 ms for every node and finishes are still compared on the run
  clock (rolling whole macros per depth biased the search to slower finishes: flat-test 9.65 → 8.49 s after the fix).
  The stranger CLI accepts the three codes (`PROTOCOL.md`, counted as 5/4/4 slots); `snapshot-probe` rolls them too.
- **Reflex bot on v2** (`reflex/controller.ts`): the hop is the v2 recipe (preload 0.3 s / snap 0.22 s / tuck 0.1 s,
  rules `hop-preload|snap|tuck`); a steep face ahead is approached **neutral** on base gas and thrown to +1 only on the
  face (`steep-ahead` / `climbing`, faces ≥ 30° below 5.5 m/s), kickers and ramps are ridden with the weight forward
  and **released at the lip** (`ramp-ride` / `ramp-lip-release`: throttle and lean 0 when the ground ahead falls away),
  and the in-air gas tap stops once the nose is already rising (`air-gas-nose-up`, rate < 40°/s). `--all-tracks --skill
  novice,average,good` (or `all`) writes the whole matrix into `out/metrics/reflex.md`, one section per (bike, skill),
  with the loadavg in the sweep line.
- **Gate row `camera.box`** (`gate/ship-gate.ts`): the b3 Rookie golden rendered by `clip.ts` (20 fps, low quality) in a
  child process; pass = 0 riding frames outside the [0.2, 0.8] box on `bikeScreenX/Y` (settle excluded) and |roll| < 1e-6;
  `clamped %` is reported in the note, not gated. Skipped with `--quick`.

## Notes / caveats

- **`header.bike` does not survive `decodeJSON`/`decodeBinary`** (round 7 finding, `src/core/replay.ts`: `validateHeader`
  copies `note` but not `bike`; the binary layout has no field for it). Consequences and what the harness does about it:
  `Game.runRecording` reads `rec.header.bike` *after* decoding, so through the game's own path **every Pro recording
  replays on Rookie** (the Pro flat-test golden then stops at x 86.7 m instead of finishing). `lib/recording.ts loadRecording`
  re-reads `bike` from the raw JSON; `openGame` installs `window.__trialsRunAs(json)` (lib/hook.ts), which parses the raw
  header itself and for `pro` does `setBike('pro')` + `loadTrack` + `skipCountdown` + the same per-tick `setInput`/`step(1)`
  loop `runRecording` runs (rookie recordings still go through `runRecording` unchanged); every browser path (verify,
  determinism D1/D3/D5/D7, capture) uses it. **Requested src change:** copy `bike` in `validateHeader` and give the binary
  header a class byte; then `__trialsRunAs` collapses to `runRecording`. Until then a PB recording saved by the game on Pro
  and replayed by the game (ghost, replay viewer) is a Rookie replay of Pro inputs.

- **Reflex bot in the live browser runs on a fake clock.** SwiftShader needs ~200–280 ms to raster one 480×270
  low-quality frame, so on the real clock the live game runs at 3–4 fps and `InputMux` samples the keys every
  ~280 ms — a 200 ms-reaction player becomes a 700 ms one and loops out everywhere (measured: 26 attempts, no clear
  on b1, vs 1 attempt in node). `harness:reflex --browser` therefore installs Playwright's clock (`page.clock`) and
  steps `requestAnimationFrame` at 16.7 ms per frame: the App, `RafDriver`, `KeyboardInput` and the recorder run
  exactly as for a 60 fps player, keys land between frames, only the wall time stretches (~12 min per 55 s run).
  `--wall-clock` keeps the real clock for the honest-but-unplayable number. `pauseAt` fast-forwards ~30 s of
  virtual time first (rAF fires sparsely there, each frame clamped to 0.25 s by the App); the driver asserts the
  game is still in the countdown afterwards.
- The reflex recording from the browser starts at the first frame the in-page hook sees `phase() === 'riding'`;
  the `startTick` riding ticks before it ran on neutral input (no key is sent before GO) and are prepended as
  neutral frames. `roundTrip` = the node replay of that full recording hashes like the live page did. Measured
  `startTick` 0 on every run so far (the hook's rAF runs after the App's in the same frame).

- One shared checkout: other builders rebuild `dist/` and edit `src/` while a
  gate runs. `BrowserVerifier` serves a **frozen copy** of `dist/` and warns
  when `dist/` is older than `src/` (node and browser would run different
  code — pass `--build`). D3 catches the rest.
- Every report carries `srcFingerprint` (FNV over `src/physics`, `src/tracks`, `src/core`,
  `src/game/rules.ts` in the working tree) next to `git`: in a shared checkout HEAD does not
  say what ran. The sweep warns when the fingerprint changes under it; re-run it then.
- Thresholds: `gate/thresholds.json` top level = real-hardware ship targets; the `swiftshader`
  block overrides `boot.firstFrameMs`, `restart.frameMsP95`, `perf.renderSyncedMsP95` when the
  renderer string says SwiftShader. The check line prints both, and `ship-gate.json` keeps
  `shipLimit`/`shipPass` per affected check.
- Timing precision inside headless Chromium is 0.1 ms; sub-0.1 ms prints as 0.
- Boot `ready` p50 is over 5 samples (3 with `--quick`), min reported beside it; a p50 miss
  while the 1-min loadavg exceeds the core count is re-sampled once and the better batch kept
  (`ship-gate.json.boot.{min,loadavg1,cores,retried}`). Contention is not a boot regression.
- `tsconfig.harness.json` excludes `harness/out`, so stray files there cannot break `pnpm typecheck`.
- **Committed play vs replay.** `bot.ts` now replays every run's recording tick by tick against the
  per-tick hashes recorded during committed play (`PlayResult.hashes`). A mismatch
  (`playReplayDivergence`, WARNING on stderr, `replay` column in `sweep.md`) means the search's
  snapshot/restore did not resume the same world — the bot's attempts/finish then describe a
  trajectory no replay reproduces and the golden is not evidence. Found on 2026-09-14: `BikePhysics`
  keeps `brakeIn` (filtered brake input, `private brakeIn` in `src/physics/bike.ts`), the seesaw
  warm-start `seesawLambda` and `chDx/chDy` outside the `F`/`U` snapshot arrays; the probe fails on
  flat-test at tick 346 and on e1 at tick 376 (first hop / plank contact). D4 cannot see it because it
  round-trips the *current* state. Reproduce: `pnpm harness:snapshot-probe harness/inputs/flat-test/bot-2.json`.
- SwiftShader is a CPU rasterizer: synced render ms (and everything downstream
  of a synced frame: `boot.firstFrameMs`, `restart.frameMsP95`) are pessimistic
  by an order of magnitude versus a real GPU. Trend the GPU-independent
  counters; treat those two thresholds as SwiftShader-relative.
- `page.evaluate` bodies must not contain inner named functions or arrows
  assigned to consts: tsx's `keepNames` injects a `__name` helper that does
  not exist in the page.
- The mock physics never crashes; on the mock the gate's crash / fault→control
  checks fail with a note, by design.
- **After the finish line the game owns the input** (`Game.stepFinishCoast`, cfb02ab): the recorded frames
  past the line are ignored by both the page and `lib/rules.ts`, so a recording may carry anything there
  and still hash the same. `harness:determinism --tail-s 3` is the proof; the stranger CLI plays the coast
  out in-call after a finish (`runOut` in the play summary, `look` keeps the line in frame) and the clip
  tail shows the bike braking to a stop. The rules mirror also matches `holdFired` semantics now: a hold
  cannot fire until the restart key has been released once since GO / the last full restart, so the
  stranger's `reset` prefixes one coast tick when needed.
