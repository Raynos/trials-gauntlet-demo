# You are playing a 2D motorbike trials track

You control a rider on a motorbike, seen from the side. The bike starts stationary at the start line,
facing +x (to the right). Your goal: cross the finish line (`finishX`) without crashing, in as few
attempts as you can, and then say **DONE**.

Rules of the game:

- A crash (falling over, looping out, hitting a hazard, leaving the course) ends the attempt and puts
  you back at the last checkpoint you crossed (or the start line), stationary. **The clock keeps
  running** and your fault count goes up by one. Attempts = 1 + faults.
- There is no undo. Time only goes forward. Every command is final.
- Budget: **150 calls or 25 minutes** from `start`, whichever comes first. `look` and `status` count
  as calls too. When the budget is gone, `play`/`restart`/`reset` answer `{"budget":"exhausted"}`;
  call `done` at that point.

## Setup (do this first, once)

Everything runs from the game's folder. Open a shell there and start your session:

```
cd /Users/raynos/projects/game-demos/trials-gauntlet-demo
pnpm harness:stranger start --track b1-first-ride --agent <your-name>
```

(If whoever handed you this file named a different track, use that id instead of `b1-first-ride`.)
The output begins with a JSON object whose `sessionId` is **your session id** for every later
command, followed by your first `look`. Nothing else needs installing; do not read or edit any other
file in that folder — the track is meant to be discovered by riding it.

## The tool

One shell command per action. Always pass your session id.

```
pnpm harness:stranger <cmd> [args] --session <id>
```

| command | what it does |
| --- | --- |
| `start --track <id> --agent <name>` | create your session (once). Prints the session id and a first `look`. |
| `look` | JSON numbers + an ASCII side-view of the next ~40 m of track (`B` = you, `\|` = checkpoint, `F` = finish, `_ / \` = ground and ramps, `#` = block, `o` = drum, `~` = seesaw plank, `x` = hazard, a ruler with x in metres underneath). |
| `status` | the JSON numbers only. |
| `play "<slots>"` | drive for up to 40 slots of 1/8 s each. Returns a JSON summary, then one trace line per slot (`x`, `vx`, angle, ground/AIR). Stops early at a crash or the finish. |
| `restart` | give up this attempt: back to the last checkpoint (counts as a fault). |
| `reset` | back to the start line, faults kept (counts as a fault). |
| `done` | end the session and write the result. Call it exactly once, when finished or stuck. |

The JSON numbers: `x` (metres along the course), `y`, `vx` (m/s), `angle_deg` (0 = level, positive =
nose up, negative = nose down), `grounded`, `checkpoint` (index of the last one crossed, -1 = none),
`checkpointCount`, `faults`, `attempt`, `runTime` (s), `finishX`, `distanceToFinish`, `budget`.

## Controls: slot codes

A `play` string is a list of slot codes, each with an optional repeat count. Each slot is **1/8 s**
(125 ms). `"g8 gb4 c2"` = gas for 1 s, gas + lean back for 0.5 s, coast for 0.25 s. Max 40 slots
(5 s) per call. Codes are case-insensitive; separate with spaces or commas.

| code | meaning | when |
| --- | --- | --- |
| `g` | full gas | accelerate, keep momentum up a slope |
| `gb` | full gas + lean back | lift the front wheel (wheelie), preload a hop, keep the nose up over a drop |
| `gf` | full gas + lean forward | climb steep faces nose-down, stop the front from flipping up, snap forward for a hop |
| `hg` | half gas | fine speed control |
| `hgb` | half gas + half lean back | gentle nose-up |
| `hgf` | half gas + half lean forward | gentle nose-down |
| `c` | coast (no gas, no brake, no lean) | let the bike settle, fly level |
| `b` | brake | slow down, stop on a ledge |
| `bf` | brake + lean forward | hard stop, nose down |
| `bb` | brake + lean back | brake without going over the bars |
| `lb` | lean back (no gas) | rotate nose up in the air |
| `lf` | lean forward (no gas) | rotate nose down in the air |
| `t` | tap gas (a short blip, then coast for the rest of the slot) | inch forward, balance |

Tips: a crashed attempt tells you what happened (`faulted.reason`) and where you respawned. Read the
trace lines: the angle and ground/AIR columns show a wheelie or a flight developing slot by slot, so
shorten the next `play` and correct. Leaning in the air changes your pitch, not your path. If a call
says `finished: true`, you are done: call `done`.

## Example session

```
$ pnpm harness:stranger look --session flat-test-20260914-002749
{"x":0,"y":0.54,"vx":0,"angle_deg":0,"grounded":true,"checkpoint":-1,"checkpointCount":2,"faults":0,"attempt":1,"runTime":0,"finishX":120,"distanceToFinish":120,...}
$ pnpm harness:stranger play "g20" --session flat-test-20260914-002749
{"attempt":1,"slots":"g20","slotsPlayed":20,"after":{"x":18.15,"vx":11.67,"angle_deg":0},"events":[],"checkpoint":-1,"grounded":true,"faults":0,"runTime":2.5,...}
$ pnpm harness:stranger play "g40" --session flat-test-20260914-002749
{"attempt":1,"slotsPlayed":40,"after":{"x":51.29,"vx":14,"angle_deg":0},"events":[{"t":6.667,"type":"checkpoint","index":0}],"checkpoint":0,...}
$ pnpm harness:stranger play "g40" --session flat-test-20260914-002749
{"attempt":1,"slotsPlayed":39,"events":[{"t":9.525,"type":"checkpoint","index":1},{"t":12.383,"type":"finish"}],"finished":true,"note":"FINISHED at run time 12.3833s. Call 'done'."}
$ pnpm harness:stranger done --session flat-test-20260914-002749
stranger flat-test session=flat-test-20260914-002749 attempts=1 cleared=yes finish=12.383s calls=5 wall=41.2s
DONE
```

When you have finished the track, or you are stuck and out of ideas or budget, run `done` and then
reply with the single word **DONE** followed by one sentence on what the hardest part was.

Reading the side-view: the ground is drawn with `_` (flat), `/` (uphill) and `\` (downhill); a `#`
block or `/` ramp ahead means you need speed and/or a lifted front wheel; a gap in the ground line is
a hole you must jump. The ruler underneath gives x in metres so you can count how many slots of riding
(at your current `vx`) reach it. When in doubt, `play` short strings (4–8 slots), `look`, adjust.
