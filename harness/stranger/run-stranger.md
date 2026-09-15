# Spawning a stranger (parent side)

The stranger is the metric in AGENTS.md: attempts-to-clear from someone who knows only the
controls. It must be a **fresh agent with no other context** — not a fork, no repo memory, no
`src/`, no bot output, no design docs. Its entire prompt is the block below with the two
placeholders filled in. Send nothing else, answer no questions about the track, and do not
read its calls while it plays.

## Before you spawn

```
cd /Users/raynos/projects/game-demos/trials-gauntlet-blender
pnpm harness:stranger start --track <trackId> --agent <name>     # prints `session <id>`; optional — the stranger can also run start itself
# or, for a whole round at once (2 strangers x 6 tracks):
pnpm harness:stranger prep --tracks b1-first-ride,b2-lean-back,b3-kicker-row,e1-uphill-weight,e2-rear-wheel-first,e3-stairway --agents s1,s2 --round r3
#   -> harness/out/stranger/rounds/r3/spawn.md : one paste-ready block per session (below, with the ids filled in)
#   -> harness/out/stranger/rounds/r3/manifest.json
```

Creating the session yourself pins the track and the session id; the stranger then never
picks a track. The stranger's `look` shows what the game's menu and HUD show (tier, name,
`meta.technique`, beginner `meta.hints`, checkpoint xs, finish x) and nothing else. Use a distinct `--agent` per stranger (`s1`, `s2`, ...). Run at least two
strangers per track before judging it.

## Paste this, verbatim, as the stranger's whole prompt

---

You are playing a 2D motorbike trials track through a command-line tool. Your only briefing is
the file below; read it in full, then follow its Setup section. Do not read, list or edit any
other file in that folder, do not look at its source code or git history, and do not search
the web: the track is meant to be discovered by riding it.

Briefing: `/Users/raynos/projects/game-demos/trials-gauntlet-blender/harness/stranger/PROTOCOL.md`

Track id: `<trackId>`
Session id: `<sessionId>` (already created for you — skip `start`; pass `--session <sessionId>` on every command)

Play until you cross the finish or you are out of ideas or budget, then run `done` and reply
with the single word DONE followed by one sentence on what the hardest part was.

---

(When you did not run `start` yourself, replace the Session id line with:
`Session: none yet — run the start command from the Setup section with --track <trackId> --agent <name>`.)

## After the stranger replies DONE

```
pnpm harness:stranger report <trackId>          # aggregates every session -> harness/out/metrics/<trackId>.stranger.{json,md}
pnpm harness:stranger report b1-first-ride b2-lean-back b3-kicker-row e1-uphill-weight e2-rear-wheel-first e3-stairway   # + one summary table
```

`report` prints one row per session (attempts, cleared, time to clear, calls, wall, where each
attempt ended, the best attempt's tick window) and a where-they-died table by obstacle.
New sessions use production `Game` with V2 at 120 Hz. `done` replays the entire recorded input
stream through production Game and compares raw physics bytes, all counters and cumulative faults.
Medians include only completed sessions with `replayVerified: true` and the current stranger SHA256
fingerprint. Historical sessions remain visible as stale; `--stale` admits older verified sessions.
Pass = median attempts ≤ 1.5 × `meta.attemptsBand[1]` and every counted session cleared.

The stranger-local fingerprint covers physics, tracks, core types, actual `src/game/game.ts` rules,
the production adapter, stranger code, control macros and `PROTOCOL.md`. A recording carries that
fingerprint, explicit solver/rate/seed/class stamps and the production-rule tag. State schema 2
rejects legacy mirror sessions or any changed source/header before resuming; preserve old evidence
and create a new session. Freeze these inputs before spawning and keep them fixed through `done`.

Displayed faults and run time belong to the current Game run. Session attempts retain failures
across full resets. Saved attempt `startTick`/`endTick` values are recording input indices, including
restart and finish-coast inputs; they are not the resettable Game clock.

## The stranger's best attempt as a clip

Every ended attempt has a replayable prefix recording
(`harness/out/stranger/<trackId>/<sessionId>/attempts/NNN.rec.json`, from GO to the end of
that attempt) and `startTick`/`endTick` in `attempts/NNN.json`. `session.json.bestAttempt`
names the clearing attempt (whole-session recording) or the furthest one:

Use the headless hero capture with the matching frozen production build:

```sh
pnpm exec tsx harness/hero-capture.mts <matching-frozen-build> <bestAttempt.recordingFile> harness/out/capture/stranger/<trackId>-<sessionId> <fromTick> <toTick> high street 60 1280x720
```

Choose explicit even tick boundaries for 60 fps capture from the 120 Hz recording, within its
available inputs. The captured interval is `(fromTick,toTick]`; the harness renders the full prefix
to preserve animation/camera history. It verifies consumed full/LOD model bytes against the frozen
build's content-addressed model catalog and rejects procedural fallback assets. Repeat with `race`
and the required quality/device viewport when needed. Play the resulting clips to judge the hero;
this numeric session/replay audit alone makes no visual-quality claim.

The frozen build must come from the source state recorded for that session. Keep its build/model
hash manifest with the footage. If the source has moved on, use an already preserved matching build
or mark capture unavailable; do not create another checkout or `git archive` copy. Build artifacts
under ignored `harness/out/` are permitted in the existing checkout. Headless phone-sized Chromium
does not establish actual iOS Safari performance.

## Re-judging after a physics or track change

Old sessions stay on disk and drop out of current medians automatically when their fingerprint
changes. Preserve them for comparison. Run `prep` with a new round/session id and fresh agents;
re-run `report` after those agents finish.
