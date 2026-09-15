# You are playing a 2D motorbike trials track

You control a rider on a motorbike, seen from the side. The bike starts stationary at the start line,
facing +x (to the right). Your goal: cross the finish line (`finishX`) without crashing, in as few
attempts as you can, and then say **DONE**.

Rules of the game:

- A crash (falling over, looping out, hitting a hazard, leaving the course) ends the attempt. The bike
  tumbles for **1.0 s and then respawns by itself** at the last checkpoint you crossed (or the start
  line), stationary, facing +x. This all happens inside the `play` call that crashed: when it returns
  you are already standing at the checkpoint, ready for the next `play`. **The clock keeps running**
  and your fault count goes up by one. Attempts = 1 + faults.
- There is no undo. Time only goes forward. Every command is final.
- Budget: **150 calls or 25 minutes** from your first call, whichever comes first. **Every command is a call**,
  `look` and `status` included. When the budget is gone, `play`/`restart`/`reset` answer
  `{"budget":"exhausted"}`; call `done` at that point.

## Setup (do this first, once)

Everything runs from the game's folder. Open a shell there and start your session:

```
cd /Users/raynos/projects/game-demos/trials-gauntlet-blender
pnpm harness:stranger start --track b1-first-ride --agent <your-name>
```

(If whoever handed you this file named a different track, use that id instead of `b1-first-ride`. If
they also gave you a **session id**, the session already exists: skip `start`, run `look` with
`--session <id>` instead, and use that id on every command.)
The output begins with `session <id>`: that is **your session id** for every later command. It is
followed by the track card and your first screen (see "What you see"). Nothing else needs installing;
do not read or edit any other file in that folder — the track is meant to be discovered by riding it.

## The tool

One shell command per action. Always pass your session id.

```
pnpm harness:stranger <cmd> [args] --session <id>
```

| command | what it does |
| --- | --- |
| `start --track <id> --agent <name>` | create your session (once). Prints the session id, the track card and the screen. |
| `play "<slots>"` | drive for up to 40 slots of 1/8 s each. Prints a JSON summary, one trace line per action (`x`, `vx`, angle, ground/AIR), **then the screen**. Stops early at a crash (after the auto-respawn) or at the finish. **This is the only command you normally need.** |
| `look` | the track card and the screen again, without moving. Costs a call; `play` already shows you the screen, so you rarely need it. |
| `status` | the JSON numbers only. |
| `restart` | give up a **live** attempt: back to the last checkpoint, stationary (counts as a fault). Never needed after a crash — the crash already respawned you there. |
| `reset` | back to the **start line** with the game run clock and displayed faults reset; earlier failures still count toward your session attempts. Almost never worth it: a checkpoint respawn keeps your progress. |
| `done` | end the session and write the result. Call it exactly once, when finished or stuck. |

## What you see

The **track card** (printed by `start` and `look`) is what the game shows on its menu and HUD:

```
track b1-first-ride (beginner) "First Ride" — technique: throttle control
hints: Hold the gas up the hill · Steady gas over the rollers · Off the gas down the descent · Brake before the hump
checkpoints at x = 42, 171, 332 m; finish at x = 501 m
```

`technique` is the one skill the track is about. `hints` (beginner tracks only) are the on-screen tips,
in obstacle order. The checkpoint list is the progress strip: cross a checkpoint and every later crash
respawns you there.

The **screen** is the JSON numbers followed by an ASCII side-view of the ~35 m ahead of you (and 5 m
behind): `B` = you, `|` = checkpoint, `F` = finish, `_ / \` = ground and ramps, `#` = block, `o` = drum,
`~` = seesaw plank, `x` = hazard, with a ruler in metres underneath.

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
| `h` | **hop** (6 slots, 0.75 s): full gas + back for 0.3 s, full gas + forward for 0.267 s, then gas off + back for 0.1 s; neutral for the remaining 0.083 s | preload, snap forward, then tuck; approach speed and takeoff position matter |
| `wh` | **wheelie hold** (4 slots): targets a front-wheel angle of ~40 deg with the throttle, leaning a little back | after `gb` has lifted the front; read the resulting angle |
| `ct` | **climb** (4 slots): base gas with neutral weight until the front wheel is on the face, then weight forward + gas | tries to move weight forward once the front wheel meets a rise; read the resulting angle |

`h`, `wh` and `ct` count as 6 / 4 / 4 slots of the 40.

## How the bike feels

- **Gas and weight work together.** `gb` loads the rear and lifts the front; `gf` moves weight forward.
  Watch the angle and speed after each action, especially near a ledge.
- **Hop by loading, snapping forward, then tucking.** `h` uses the full-gas recipe above. From a settled
  Rookie bike on flat ground, this recipe lifts both tyre bottoms more than 0.45 m and lands without a
  fault. That is a flat-ground result, not a promise to clear every 0.45 m obstacle. Moving approaches,
  slopes and Pro need their own timing. `gb2 gf2 lb1` has different durations and is not the same recipe.
- **Brake early enough to settle before a face.** Landing attitude and approach speed affect recovery;
  do not assume a drop, stair flight or ramp is safe at every speed.
- **Make short corrections in the air.** Try `lb1` or `lf1`, release to `c`, and read the next angle.
  A long held lean can over-rotate the bike.
- **Discover the track by riding.** `wh` and `ct` are automatic wheelie/climb helpers, not guaranteed
  solutions. Use the screen and trace to see whether they help on this approach.
- **Session attempts survive full resets.** `faults` and `runTime` show the current game run. `attempt`
  counts all failures in your session, including those before a full `reset`. Resetting does not erase
  those failures from the final stranger result.

## Spending calls well

- **Send the whole plan you are confident in, in one `play`.** The call stops by itself at a crash or
  the finish, and unplayed slots cost nothing. A crash costs an attempt, never extra calls. Shorter calls cost more calls but let you react to a new angle or obstacle sooner.
- **Do not `look` after a `play`** — the screen is already at the bottom of the `play` output. `look` is
  for when you want the track card back.
- **Read the trace.** The angle column shows a wheelie or a flight developing slot by slot; `AIR`
  shows when you left the ground; a slot that crossed a checkpoint, crashed or finished is marked
  `<- CHECKPOINT n` / `<- CRASH (reason)` / `<- FINISH`. `faulted` in the summary tells you where you crashed (`at`) and
  where you respawned (`respawnedAt`); the screen underneath is already drawn from the respawn point.
- **Count from the ruler.** At `vx` m/s you cover `vx / 8` m per slot, so the ruler tells you how
  many slots reach the next obstacle.
- Leaning in the air changes your pitch, not your path.
- If a call says `finished: true`, you are done: call `done`. Past the line the game takes the
  controls (no gas, no lean, gentle brake) and rolls you to a stop on the run-out; the summary's
  `runOut` says where you stopped. Nothing after the line can cost a fault.

## Example commands

```sh
pnpm harness:stranger look --session <your-session>
pnpm harness:stranger play "c4 h c8" --session <your-session>
pnpm harness:stranger status --session <your-session>
pnpm harness:stranger done --session <your-session>
```

This settles for half a second, performs one hop, then coasts for one second. Choose controls for
what is on your screen; the example is not a track-clearing script.
