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
- Budget: **150 calls or 25 minutes** from `start`, whichever comes first. **Every command is a call**,
  `look` and `status` included. When the budget is gone, `play`/`restart`/`reset` answer
  `{"budget":"exhausted"}`; call `done` at that point.

## Setup (do this first, once)

Everything runs from the game's folder. Open a shell there and start your session:

```
cd /Users/raynos/projects/game-demos/trials-gauntlet-demo
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
| `play "<slots>"` | drive for up to 40 slots of 1/8 s each. Prints a JSON summary, one trace line per slot (`x`, `vx`, angle, ground/AIR), **then the screen**. Stops early at a crash (after the auto-respawn) or at the finish. **This is the only command you normally need.** |
| `look` | the track card and the screen again, without moving. Costs a call; `play` already shows you the screen, so you rarely need it. |
| `status` | the JSON numbers only. |
| `restart` | give up a **live** attempt: back to the last checkpoint, stationary (counts as a fault). Never needed after a crash — the crash already respawned you there. |
| `reset` | back to the **start line**, checkpoints forgotten, faults kept (counts as a fault). Almost never worth it: a checkpoint respawn keeps your progress. |
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
| `h` | **the hop** (5 slots): light gas + lean back for 0.3 s, snap to lean forward for 0.22 s, tuck | onto a ledge or box about knee-high (rear wheel rises ~0.5 m); start it about a bike length before the face |
| `wh` | **wheelie hold** (4 slots): holds the front wheel up at ~40 deg with the throttle, leaning a little back | after `gb` has lifted the front; chain `wh wh wh` to keep it up |
| `ct` | **climb** (4 slots): base gas with neutral weight until the front wheel is on the face, then weight forward + gas | steep planks and steps around 40-45 deg; a front-heavy approach cannot climb them |

`h`, `wh` and `ct` count as 5 / 4 / 4 slots of the 40.

## How the bike feels

- **It is not quick off the line.** 0 to 16 m/s takes about 4 s of full gas on the flat; top speed is
  20 m/s. Give run-ups the slots they need (`g32` is 4 s) and count on the ruler.
- **Full gas with the weight back lifts the front.** Neutral (`g`) does not loop; `gb` held for more
  than ~1 s does. The balance point of a wheelie is about 50 deg nose up with no lean, ~40 deg leaning
  back a little (that is what `wh` regulates).
- **The hop is a move, not a button:** lean back on light gas to load the bike (~0.3 s), then snap the
  weight forward. `h` is that recipe; `gb2 gf2 lb1` is the same thing by hand.
- **Drops are safe.** A 3 m drop at speed lands and rides away; a nose-down landing dips the front hard,
  so come off a ledge with a touch of `lb`. Down a long ramp a held `lb` is fine (it rides any drop to
  ~1.8 m); down a **stair flight** a held `lb` loops the bike — descend stairs on plain `g` or `c`, neutral.
- **Stairs are shin-high steps** (0.15 m risers, flights of a few steps). Plain `g` rides a flight up or
  down at any speed; a brake on or just before a step, or a lean held through the flight, is the only
  way to fall on them. Do not wheelie into them, do not brake on them.
- **Ledges you hop onto come ~6 m after their checkpoint.** That is hop speed (5-8 m/s) from a standing
  start, so ride `g` from the checkpoint and start `h` about a bike length before the face. Arriving fast
  (11+ m/s) and braking flat stands the bike on its front wheel into the face: brake early with the
  weight back (`bb`), never at the face.
- **Climbs are geometry.** Weight forward holds ~37 deg at a crawl; 40-45 deg needs the front wheel on
  the face first and then the throw (`ct`); anything steeper wants speed.
- **In the air, gas and brake are nudges; the lean is the control.** A gas tap lifts the nose ~6 deg in
  half a second, a brake tap drops it ~15. A held lean *accelerates* the rotation (a full lean builds
  ~170 deg/s in half a second) and letting go swings the bike another ~30 deg the other way (release a
  lean-back and the nose pops up 30 more). So: lean briefly (`lb1`/`lf1`, at most 2 slots), release
  early, and fly a beat with `c` before you correct again. Holding `lb` or `lf` for 4+ slots is a flip.
- **Ramps and kickers.** Ride them with the weight forward (`gf`) and let go at the lip (`c`): the bike
  leaves a knee-high kicker at about 8 m/s under full gas and lands level-ish on its own. Braking on the
  ramp face or just before a riser drops the nose over the bars; slow down *before* the ramp, not on it.

- **Pro bike (the default on hard and extreme; the track card says which you have).** Same thrust as
  the Rookie up to 16 m/s, a little more on top (22 m/s), but **no wheelie ECU**: nothing catches a loop
  for you. **Plain `g` from a standstill loops the Pro in about six slots** (every round-7 stranger lost
  its first attempt 4 m from the line this way): launch and cruise on `gf` or `hg`, and gas a landing only
  once the suspension has settled (`c1` first). Full gas with any lean-back loops it in about 1.5 s; a
  wheelie is held by feathering the gas around 40-50 deg and never by holding `gb`. Everything else above
  holds for the Rookie; on the Pro, read "neutral `g` does not loop" as "at speed".
- **Roof climbs and wire (hard).** A 1.0-1.4 m wall with a row of slots on top is ridden with the front
  wheel UP before the first slot and held there (`wh` or short `gb` bursts): the front drops into a slot
  and stops you dead. A long thin balance beam wants a straight, steady `g` at 5-8 m/s, no lean.
- **Apron jumps (hard).** A long flat apron into a kicker over water: full gas from the spawn, weight
  forward on the ramp (`gf`), let go at the lip (`c`), land rear-first (`lb1` early in the flight, then
  `c`). Coming off the gas on the apron is how you come up short.
- **Tunnel rows (hard).** Two barrel rows a few metres apart under a roof: set the speed before the
  first row and do NOT brake between them; a brake between rows plants the front into the second.
- **Extreme climbs.** Every big face is 45 deg over a knee-high kicker foot: weight forward, steady gas,
  let the face take the speed — the crest is won at ~3 m/s with the nose down, not up. Steeper faces
  are not on the menu.

## Spending calls well

- **Send the whole plan you are confident in, in one `play`.** The call stops by itself at a crash or
  the finish, and unplayed slots cost nothing. A crash costs an attempt, never extra calls. Chopping a
  plan into 4-slot pieces costs a call per piece and gains nothing you cannot read from the trace.
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

## Example session

```
$ pnpm harness:stranger look --session flat-test-20260914-002749
track flat-test (beginner) "Flat Test Strip"
checkpoints at x = 40, 80 m; finish at x = 120 m
{"x":0.57,"y":0.48,"vx":0,"angle_deg":0,"grounded":false,"checkpoint":-1,"checkpointCount":2,"faults":0,"attempt":1,"runTime":0,"finishX":120,"distanceToFinish":119.43,...}
view x -4..36 m, y -1.0..7.0 m  (B bike, | checkpoint, F finish, _/\ ground, # box, o drum, ~ seesaw, x hazard)
(... 16 rows of side-view ...)
__________B_____________________________________________________________________
        0                   10                  20                  30
$ pnpm harness:stranger play "g40" --session flat-test-20260914-002749
{"attempt":1,"slots":"g40","slotsPlayed":40,"slotsRequested":40,"before":{"x":0.57,"vx":0,"angle_deg":0},"after":{"x":69.65,"vx":16.35,"angle_deg":36.7},"events":[{"t":3.167,"type":"checkpoint","index":0}],"checkpoint":0,"grounded":true,"faults":0,"runTime":5,"distanceToFinish":50.35,...}
01 g   x=   0.6 vx=  0.5 ang=   2 ground
02 g   x=   0.7 vx=  1.8 ang=   7 ground
(... one line per slot ...)
40 g   x=  69.7 vx= 16.4 ang=  37 ground
view x 65..105 m, y -1.0..7.0 m  (B bike, | checkpoint, F finish, _/\ ground, # box, o drum, ~ seesaw, x hazard)
                              |
(... side-view from the new position: the next checkpoint is the | at x = 80 ...)
          B                   |
________________________________________________________________________________
          70                  80                  90                  100
$ pnpm harness:stranger play "g40" --session flat-test-20260914-002749
{"attempt":1,"slots":"g40","slotsPlayed":25,"slotsRequested":40,...,"events":[{"t":5.592,"type":"checkpoint","index":1},{"t":8.067,"type":"finish"}],"finished":true,"note":"FINISHED at run time 8.0667s. Call 'done'."}
$ pnpm harness:stranger done --session flat-test-20260914-002749
stranger flat-test session=flat-test-20260914-002749 attempts=1 cleared=yes finish=8.067s calls=4 wall=41.2s
DONE
```

A crash looks like this (the remaining slots are dropped; you are already back at the checkpoint):

```
{"attempt":1,"slots":"g40","slotsPlayed":20,"slotsRequested":40,...,"faults":1,"runTime":3.45,"faulted":{"reason":"crash","at":27.11,"respawnedAt":0.57,"respawnAfterS":1},"note":"crashed (crash) at x=27.1 after slot 20; the game respawned you 1.0 s later at checkpoint -1 (x=0.6), stationary, facing +x. Remaining 20 slot(s) were NOT played; your next play starts here."}
```

When you have finished the track, or you are stuck and out of ideas or budget, run `done` and then
reply with the single word **DONE** followed by one sentence on what the hardest part was.
