# Spawning a stranger (parent side)

The stranger is the metric in AGENTS.md: attempts-to-clear from someone who knows only the
controls. It must be a **fresh agent with no other context** — not a fork, no repo memory, no
`src/`, no bot output, no design docs. Its entire prompt is the block below with the two
placeholders filled in. Send nothing else, answer no questions about the track, and do not
read its calls while it plays.

## Before you spawn

```
cd /Users/raynos/projects/game-demos/trials-gauntlet-demo
pnpm harness:stranger start --track <trackId> --agent <name>     # prints `session <id>`; optional — the stranger can also run start itself
```

Creating the session yourself pins the track and the session id; the stranger then never
picks a track. Use a distinct `--agent` per stranger (`s1`, `s2`, ...). Run at least two
strangers per track before judging it.

## Paste this, verbatim, as the stranger's whole prompt

---

You are playing a 2D motorbike trials track through a command-line tool. Your only briefing is
the file below; read it in full, then follow its Setup section. Do not read, list or edit any
other file in that folder, do not look at its source code or git history, and do not search
the web: the track is meant to be discovered by riding it.

Briefing: `/Users/raynos/projects/game-demos/trials-gauntlet-demo/harness/stranger/PROTOCOL.md`

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
pnpm harness:replay harness/inputs/<trackId>/stranger-<sessionId>.json     # browser replay of the whole session (proves the log)
```

`report` prints one row per session (attempts, cleared, time to clear, calls, wall, where each
attempt ended, the best attempt's tick window) and a where-they-died table by obstacle.
Medians are over completed sessions on the current physics; sessions from an older src
fingerprint are listed as `stale src` and excluded (`--stale` includes them). Pass =
median attempts ≤ 1.5 × `meta.attemptsBand[1]` and every counted session cleared.

## The stranger's best attempt as a clip

Every ended attempt has a replayable prefix recording
(`harness/out/stranger/<trackId>/<sessionId>/attempts/NNN.rec.json`, from GO to the end of
that attempt) and `startTick`/`endTick` in `attempts/NNN.json`. `session.json.bestAttempt`
names the clearing attempt (whole-session recording) or the furthest one:

```
pnpm harness:clip <trackId> --recording <bestAttempt.recordingFile> --from-tick <bestAttempt.startTick> --out harness/out/capture/<trackId>-stranger-<sessionId>
```

About 25 s of wall per second of clip on this machine (SwiftShader at 1280×720, quality high).

## Re-judging after a physics or track change

Old sessions stay on disk but drop out of the medians automatically (fingerprint mismatch).
`trash harness/out/stranger/<trackId>/<sessionId>` removes one for good; then re-run `report`.
