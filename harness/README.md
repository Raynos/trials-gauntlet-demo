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
| `pnpm harness:bot <trackId> [--skill 0..3] [--oracle] [--all] [--seeds N] [--budget ms] [--crash-probe] [--no-verify]` | attempts-to-clear per skill (beam search in node, committed play with in-band restarts), 0-fault oracle par, browser-verified golden recordings, a deterministic crash recording | `out/metrics/<trackId>.json` (committed), `out/bot/<trackId>/<runId>-skill<k>.json`, `inputs/<trackId>/bot-<skill>.json`, `inputs/<trackId>/crash.json` |
| `pnpm harness:stranger <start\|look\|play "<slots>"\|restart\|reset\|status\|done> [--track id] [--session id]` | attempts-to-clear for a fresh agent that knows only `stranger/PROTOCOL.md`; 150 calls / 25 min budget; pass = median ≤ 1.5 × `meta.attemptsBand[1]` | `out/stranger/<track>/<session>/{state,session}.json`, `out/metrics/<trackId>.stranger.json` (committed), `inputs/<trackId>/stranger-<session>.json` |
| `pnpm harness:pair <ours.mp4> <ref.mp4> --tag <manoeuvre> [--seed N] [--mask] [--align a:b]` | blind side-by-side: both clips to 640×360@30, seeded L/R coin, `hstack` mp4 + 2×8 sheet, sealed answer (chmod 000) | `out/compare/pair-<id>.mp4`, `pair-<id>-sheet.jpg`, `pair-<id>.answer.json` |
| `pnpm harness:log-verdict <pair-id> --verdict '<json>' [--critic name]` | validates a critic verdict, unmasks, appends; running oursWinRate / positionBias per tag | `out/metrics/compare.jsonl` (committed) |
| `pnpm harness:gate [--track flat-test] [--build] [--quick] [--heap-seconds 60] [--pin]` | **ship gate**: cold boot, first frame, clear by golden replay (bit-equal finish + hash vs `gate/expected.json`), crash, fault→control, restart latency, no countdown on restart, heap over 60 s, perf counters, bundle gz, determinism D1–D8. Exit code = failed checks | `out/metrics/ship-gate.json` (committed) |
| `pnpm harness:determinism <recording> [--loads 3] [--pin]` | D1 cross-load, D2 json/bin, D3 node-vs-browser (bisects to the first divergent tick + state paths), D4/D4b snapshot round trip node/page, D5 chunking, D7 no state leak, D8 pinned canonical hash | `out/gate/determinism.json` |
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
pnpm harness:bot <track> --all --seeds 3 --crash-probe   # goldens + curve + crash.json, browser-verified
pnpm harness:gate --build                                # numbers vs thresholds -> out/metrics/ship-gate.json
pnpm harness:capture harness/inputs/<track>/bot-oracle.json
pnpm harness:pair harness/out/capture/bot-oracle/clip.mp4 reference/techniques/clips/13-*.mp4 --tag wheelie-launch --mask
# spawn a critic with compare/RUBRIC.md + the sheet + the mp4 path; then
pnpm harness:log-verdict <pair-id> --verdict '<json>' --critic <name>
# spawn a stranger with stranger/PROTOCOL.md and a session id from `harness:stranger start`
```

`bot` must be re-run after any physics or track change: the gate's `clear.*`
and `D8` checks fail on purpose when the goldens predate the physics.

## Layout

```
lib/sim.ts        createSim(trackId, seed, hz): physics factory resolved at runtime
                  (bikePhysicsFactory | createBikePhysics | MockPhysics) + compileTrack
                  + the run-rule layer; step/run/snap/restore/hash; no browser
lib/rules.ts      node mirror of Game.tick() (riding/crashed/finished, restart edge,
                  0.6 s hold = full restart, 1.0 s auto-respawn, run clock, fault counter)
lib/metrics.ts    attempt counting (1 + fault events), diffState, percentiles, run ids
lib/schema.ts     every JSON shape written under out/
lib/verify.ts     BrowserVerifier: one server (frozen copy of dist/) + browser, runRecording per fresh page
bot/              actions (13 macro-actions × 15 ticks) · score · beam · play (skills 0–3, oracle, player memory) · bot CLI
stranger/         PROTOCOL.md (handed verbatim to the stranger) · cli.ts · session.ts · view.ts (ASCII look)
compare/          normalize · mask · pair · log · RUBRIC.md · README.md
gate/             thresholds.json · expected.json (pinned hashes per physics) · determinism.ts · ship-gate.ts
inputs/<track>/   bot-<skill>.json, bot-oracle.json, crash.json, stranger-<session>.json (committed)
out/metrics/      <track>.json, <track>.stranger.json, compare.jsonl, ship-gate.json (committed)
out/…             everything else (gitignored)
```

## Recording format

`src/core/replay.ts`. Header `{version, trackId, seed, physicsHz}` + one input
per tick, RLE-compressed. Inputs are quantized (u8 throttle/brake, i8 lean,
flag byte) *before* physics sees them in both live play and replay. JSON and
binary encodings decode to the same frames (gate D2). Replays start at GO; the
restart flag is in-band, so attempts are countable from the recording alone.

## Notes / caveats

- One shared checkout: other builders rebuild `dist/` and edit `src/` while a
  gate runs. `BrowserVerifier` serves a **frozen copy** of `dist/` and warns
  when `dist/` is older than `src/` (node and browser would run different
  code — pass `--build`). D3 catches the rest.
- Timing precision inside headless Chromium is 0.1 ms; sub-0.1 ms prints as 0.
- SwiftShader is a CPU rasterizer: synced render ms (and everything downstream
  of a synced frame: `boot.firstFrameMs`, `restart.frameMsP95`) are pessimistic
  by an order of magnitude versus a real GPU. Trend the GPU-independent
  counters; treat those two thresholds as SwiftShader-relative.
- `page.evaluate` bodies must not contain inner named functions or arrows
  assigned to consts: tsx's `keepNames` injects a `__name` helper that does
  not exist in the page.
- The mock physics never crashes; on the mock the gate's crash / fault→control
  checks fail with a note, by design.
