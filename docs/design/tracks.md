# Track system and curriculum

Status: round 6 (X3 trimmed to one feature per lesson at 500 m, X1 re-sequenced around a 45 deg opener with 40 m plank run-ins, B3 / M1 demand landings on inclines, and the finish run-out + catch on every track). Owner: tracks. Consumers: physics, render, audio, harness, game.
`docs/design/CONTRACT.md` wins over this file; the executable form is `src/core/types.ts`
(`TrackDef`, `TrackMeta`, `CameraKey`, `CompiledTrack`, `Collider`, `HazardZone`,
`PlacedObstacle`) and `src/tracks/index.ts`. Metres, seconds, radians unless a param is
named `*Deg`. +x is track direction, +y up, +z toward the camera.

Code map (`src/tracks/`): `kinds.ts` vocabulary + defaults + per-kind lowering,
`geometry.ts` shared-face cancellation, `compile.ts` `compileTrack`, `author.ts` DSL + feel
helpers + spawn validation, `describe.ts` text summaries, `courses/*.ts` the tracks,
`golden.json` per-track collider hashes, `tracks.test.ts` / `compile.test.ts`.

## 0. Numbers the tracks are authored to (CONTRACT §2.5, with 20 % margin)

Physics owns every feel number. Tracks are authored against the contract table with a
20 % margin, i.e. a track asks for at most 0.8 x what the envelope allows (`FEEL` in
`author.ts`). Where physics round 2 (e692bf2) has measured a number, the measured value
replaces the contract one:

| quantity | envelope | authored against |
|---|---|---|
| total mass / COM | 145 kg, COM 0.45 m above axle line | - |
| wheelbase / wheel radius | 1.30 m / 0.34 m | spawn clearance; 0.3 m kerbs are rollable |
| 0 -> 16 m/s on flat dirt | <= 3.5 s (a ~= 4.6 m/s^2) | `speedAfter(d) = 0.8 * sqrt(2 a d)`: 10 m -> 7.7, 14 m -> 9.1, 20 m -> 10.8 |
| top speed | 20 m/s | 16 m/s is the most any jump assumes |
| brake from 10 m/s | <= 4.5 m; **measured 4.66 m** (10.7 m/s^2) | brake zones >= 5.9 m; authored 8 m (B1, H3, X3) |
| partial throttle | **measured: 0.3 throttle tops out at 11.3 m/s** | no course relies on a coasting speed; cruise sections are full-throttle-safe |
| loop-out | **measured: full throttle with lean >= 0.4 never loops on flat** | beginner hints stay "hold throttle" |
| stationary bunny hop | rear-wheel apex 0.55-0.75 m; **measured 0.74 m** | stationary ledges <= 0.59 m (authored 0.45) |
| rolling hop (5 m/s run-up) | 0.9 m ledge | rolling ledges <= 0.72 m |
| climb | sustained <= 60 deg, 65 stalls, > 70 needs a hop; **55-65 deg planks currently wedge at a sharp base corner (fix in progress)** | planks <= 48 deg through Hard; Extreme runs 50-60 deg with no margin; every plank >= 48 deg gets a concave ramp fillet at its foot (`steepPlank`) |
| crash | head/torso touches a collider or hazard, or y < oobY; over-rotation alone is not a crash. **Physics tests every body incl. wheels against hazards** | pit hazards stop 0.6 m below the lip (a wheel faults only when wholly in the pit); fire is 0.6 m above a barrel and a jump over fire must carry the wheels above barrel top + 0.6 + 0.34 |
| drums and logs (physics round 4, physics.md 12.3) | **geometry, not speed**: a 0.34 m wheel meets a drum of radius r where the contact normal is `acos((R - r)/(R + r))` from vertical — 57 deg for r 0.1, 86 deg for a 0.3 m log, an overhang for r > 0.34. r <= 0.15 rolls; a bare 0.3 m log needs a front lift or a held lean-back at >= 5 m/s (never a constant lean); r 0.45 is a knife-edge hop; **r >= 0.6 on flat ground is unrideable in any technique**. Sunk r 0.5 showing 0.3 m rolls at 3/5/8 m/s with a constant lean; the 1.2 m box -> 0.8 m drum line is the measured way over a big drum | beginner tier has **no bare log or drum**: bumps are `hump` or `bumpDrum` (sunk, <= 0.3 m proud, contact normal 50 deg). Medium+: sunk drums show <= 0.5 m (56 deg), every big drum is entered from a `drumStep` shelf at centre + 0.4 (normal <= 56 deg for r <= 1.0) or from another drum's top across a gap. Bare 0.3 m logs are a Medium lesson (M2, with hints). `kickerDrum` is gone: a 0.5 m kicker against a 1.6 m drum still met the face below the centre |
| see-saws (physics round 4) | every curriculum board (L6 h0.8/1.0/1.5, L8 h1.2/2.0, L5 h1.0) rides on, tips in 0.4-1.0 s and rides off; the 0.12 m end lip never parks the bike | `seesawEntry` fillet kept for the lesson boards; bare boards where the landing is the lesson |
| lip climb (front wheel onto a ledge, hop the rear up) | front wheel reaches ~1.25 m at 45 deg pitch, ~1.45 m at 60; **the 0.9 m ledge needs a 1.45 m rear lift (29 of 300 hop combos)** | walls with a lip <= 1.4 m, always with >= 5 m run-up; the 0.9 m ledge is M1's demand only, after 0.45-0.7 m steps |
| climb 60 deg | **crests in 2.95 s** (bash plate now at trials clearance) | X1 keeps 60 deg as its demand |
| rider pose lag | **0.28 s** t90 | a hint names the technique one obstacle early (the HUD shows hints in order) |
| restart -> riding | one tick, one frame | every checkpoint has >= 3 m of flat run-in, and the **checkpoint rule** (round 4, `CHECKPOINT_RULE`, validated in `finish()` and the test suite): >= 15 m of flat-or-descending run-up from every spawn (start and checkpoints) to the first obstacle after it that needs speed (gap, free kicker >= 1 m, wall / ledge >= 0.6 m, burning barrels; a plank >= 45 deg on the ground needs 20 m; one stacked on a wall top is climbed from the top by design), descent credited at 2 m per metre dropped, a gap measured at the foot of the kicker that launches it, a gap <= 2 m straight off a ledge / box / drum top exempt (a standing hop), a pole-cap pit entered from a box top and the gap off the last cap exempt (X1: cap-to-cap hops at walking pace), a slot <= 1 m exempt (H1's wire is crossed front-up, not jumped), a lip wall exempt (the lip climb is a ~5 m/s technique: the skill-3 bot clears X1's 1.2 m lip wall + 56 deg plank from 3 m and stalls from 16 m); and no checkpoint within 8 m after a feature's landing zone (feature end + 6 m when it launches). Stranger round 1: 8 of 21 B3 deaths and 9 of 20 E1 deaths were at the first feature 3-4 m past a checkpoint |
| crest launch (round 4) | a crest of radius R leaves the ground above sqrt(g R) | **B1 cannot launch at top speed (20 m/s)**: every rise and fall is a cosine whose crest radius >= v^2/g = 41 m (`FEEL.smoothLengthFor(dy, v)`: half-length >= pi v sqrt(dy / 2g), so a 1 m plateau rises over >= 14.2 m at 20 m/s, a 2 m wave is >= 40 m long); `plateau`, `descent`, `bumpRow` and `wave(..., v)` assert it; B3 / E1 waves are grounded at 16 m/s. Physics round 8 (flat-out lean 0 + full gas holds a 37 deg wheelie and reaches 18.5 m/s on B1): a 0.25 m convex `humpRow` noses the bike down at that speed, a cosine bump does not. B1 stranger deaths: the 8.5 deg tabletop lip at 16 m/s (a 7 m flight, nose-down at 199) and the 20 m x 2.0 m wave crest (radius 10 m, airborne above 10 m/s, 303) |
| reflex player (round 5, harness-metrics.md "Round 5": a 200 ms, 25 Hz, binary-key player, the primary attempts instrument) | **measured with a scratch probe (one feature 16 m past a spawn, 3-6 seeds, `average` unless noted)**: the practised hop clears a 0.45-0.5 m ledge in 1-2, 0.55 in 2-14 with one wall, 0.6 and up walled for most seeds, a bare 0.9 walled for every skill; a step 0.45 + ledge 0.9 1-4, steps 0.3 / 0.6 / 0.9 1,1,2,1,1,1; stairs: 0.25 m risers at a 0.5 m run 1,1,1,1,1,1 (up to 8 steps), 0.3 risers up to 11 for a slow seed, >= 0.35 reads as a face and is walled; a gap onto a box edge 1,5,14, the same gap onto an up-ramp landing 1,1,1; a double gap needs an 8 m platform and a 5 m second gap (1,2,1; 6 m walled on one seed); a box drop onto a straight down-ramp 1,1,1 at 0.5 / 1.0 / 1.8 m, onto flat 1,2,4; a 22 deg fire kicker landing on flat 2 / walled / 4, onto an 8 x 2.0 ramp 1,1,1; lip walls 1.0 / 1.2 / 1.4 walled even for `good`, a 0.5 m step in front 2,2,2; planks (`good`) 50 deg 2,1,1, 55 2,6,6, 60 7,walled,7; a pole-cap row walled for every skill; `logStep` at 2r 2-row 1,1,1 / 3-row 2,2,5 (centre-height ramp 3,3,3 / walled); a see-saw then a 3 m gap onto a plank at 2.0 walled, a see-saw then 10 m then a 14 deg kicker onto a plank 1-2. Its one systematic weakness: nose-down in the air -> gas + lean back -> loop (`air-gas-nose-up`), so every landing shape is an incline it can meet nose-down | hop lessons <= 0.5, demands staged in <= 0.45 steps; risers 0.25 up; every gap lands on an up-ramp (`gapLanding`) or a lipped platform; every drop and fire line lands on a down-ramp; hard walls get a `steppedWall` B line; pole rows sit in the last third of their tracks |
| finish run-out (round 6, `FINISH_RUNOUT`, validated in `finish()` and the test suite) | a flat-out bike reaches 20 m/s on the run-out; the user's report: "going off the end and crashing, it goes absolutely nuts" | after `finishX` every track (fixtures included) has >= 30 m of flat at the finish height, then a soft catch — a 3 m x 0.75 up-ramp into a 2.5 m container — then the 35 deg end bank; bounds and `oobY` cover it. Measured (`fullThrottle` controller, gas held through the run-out, 20 m/s at the catch): the bike stops on the ramp in 3 of 5 runs and bounces back < 5 m with a crash in 2 (0.4 / 1.0 / 1.25 m ramps crash more); with the throttle released at the finish it stops well inside the 30 m |
| checkpoint rule, round 5 | stairs up (`stairRiser` 0.25), log pyramids, shelf / sunk drums > 0.35 m proud and kill-slot rows are speed / momentum features (E3: 95 stuck-restarts at a flight 2.5 m past a checkpoint; M2: 38 at a pyramid and 21 at a shelf 3 m past one); `hopHeight` 0.45 (a 0.55 ledge 3 m past a checkpoint: 85 stuck-restarts, from 16 m: 5); a ledge / wall / drum / pyramid behind an adjacent step, ramp or gap chain is measured at the chain's foot, and a ledge's hop is its rise above the surface it is entered from; a slot row is exempt only within 3 m of a wall / ledge top (H1 / X3: lip climb straight into the rails) | every track passes `auditCheckpoints` (validated in `finish()` and the test suite) |

Jump sizing uses `FEEL.jumpRange(v, angleDeg, drop)` (flat-landing ballistic range) at the
margin speed for the run-up available: a 4 x 1.2 kicker (17 deg) at 9 m/s reaches ~5 m; a
5 x 2.0 kicker (22 deg) at 11 m/s reaches ~8.5 m. Gaps are sized at <= 0.7 x that.
**The bot, not the author, decides whether a track is clearable**; later rounds re-author
against measured attempts.

## 1. Track definition

### 1.1 Data model

`TrackDef` is the core type unchanged: `profile` (dirt ground, piecewise linear, x strictly
increasing), `obstacles: TrackObstacle[]` (`kind`, `pos`, `params`), `checkpoints`, `start`,
`finishX`, `meta: TrackMeta` (biome, technique, demands, camera keys, attemptsBand,
targetTimeS, hints). `pos.y` of an obstacle is its **base reference**: heights are
`pos.y + height`. The DSL sets it to the ground level, plus an optional `base` offset when an
obstacle stands on a platform (a ramp launching off a box).

### 1.2 Obstacle vocabulary (CONTRACT §2.1) — `src/tracks/kinds.ts`

12 kinds, `loop` cut. Full-word params; every default is in `KIND_DEFAULTS`. Every kind also
carries `variant` (integer, default 0): a deterministic look selector for render that never
touches colliders. Render reads `thickness width length radius variant surface` from
`placed[].params`; those names are stable.

| kind | params (default) | lowers to | footprint |
|---|---|---|---|
| `ramp` | length 4, height 1, curve 0 (+concave/kicker, -convex), direction up/down, surface wood | solid wedge; curve != 0 bakes a 12-segment quadratic arc | length |
| `plank` | length 4, angleDeg 0, height 0 (elevation of near end), thickness 0.12, oneWay true, surface wood | ONE polyline, the top surface, `oneWay` (landable from above, pass-through from below); thickness is a render param | length * cos(angle) |
| `drum` | radius 0.8, width 1.2 (visual depth along z), depth 0 (sunk), rolls false, surface metal | circle; `rolls` spins about its centre under the tyre, never translates | 2 r |
| `gap` | width 3, depth 3, hazard water/kill | pit cut into the ground chain (walls lean in 0.05 m so x stays monotone) + hazard zone [lip - depth, lip - 0.6] | width |
| `wall` | height 1, width 0.4, lip 0, surface concrete | solid slab; `lip` adds a one-way overhang polyline projecting back from the top front edge (front-wheel grab) | width |
| `seesaw` | length 6, height 1 (pivot), thickness 0.12, angleDeg 0 (auto), mass 60, surface wood | `ColliderSeesaw`; auto maxAngle = asin((height - t/2) / half) capped 30 deg. Physics rests the board tipped toward the rider, so the DSL refuses an auto see-saw whose resting end would hang in the air (height - t/2 > half * sin 30) unless `angleDeg` is explicit | length |
| `logpile` | radius 0.3, count 3 (bottom row), rows 1, spacing 0, surface wood | circles in a pyramid, row pitch r*sqrt3 | count * 2r + (count-1) spacing |
| `stair` | count 5, height 0.3 (rise), length 0.45 (run), direction up/down, surface concrete | one solid staircase outline | count * run |
| `box` | width 4, height 1, surface metal | solid container / platform | width |
| `pole` | height 1.5, radius 0.25 (cap), width 0.16 (shaft), count 1, spacing 1.8, surface metal | `ColliderBox` shaft + circle cap whose top is at `height` | 2r + (count-1) spacing |
| `barrel` | radius 0.3, height 0.9, count 1, spacing 0.7, burning true, surface metal | `ColliderBox` per barrel + `fire` hazard 0.6 m tall above each burning one | 2r + (count-1) spacing |
| `ledge` | height 0.5, length 4, surface concrete | solid kerb / shelf (a low, landable box: the hop-up and drop-off step) | length |

Solids (`ramp wall stair box ledge`) sit on the ground: their outline runs from the ground
up over the top and back down, and the bottom follows the ground chain under the footprint,
so a solid on a slope is exact.

### 1.3 Compilation — `src/tracks/compile.ts`

`compileTrack(def): CompiledTrack` is pure and deterministic (all coordinates quantised to
1e-6 m so node and every browser produce the same hash).

- **Orientation.** Every polyline is oriented with the solid on the RIGHT of travel: the
  ground runs +x (solid below), solids are wound clockwise. A one-way polyline collides only
  when approached from its left/normal side.
- **Merge (no double registration).** Ground chain (with gap pits) plus every solid outline
  go through `mergeSolids`: collinear, overlapping, opposite-direction edge pieces cancel.
  What survives is exactly the exposed surface: ramp -> box -> ramp yields three touching
  polylines with no interior faces; a 1.2 m ramp against a 1.0 m box yields the 0.2 m step
  and nothing else; the ground is split around each solid. Same-direction overlap means two
  solids share interior and compile throws (`TrackCompileError`).
- **Not merged.** Plank tops and wall lips (open chains), circles, boxes, seesaws.
- **Output order = ids.** Ground polylines by min x (obstacleIndex -1); then per obstacle in
  def order: merged outline(s), open chains, then circles/boxes/seesaws as the kind emitted
  them. Hazards are numbered in obstacle order. `placed[i].colliderIds` lists the ids.
- **Bounds** span profile and colliders; `oobY = minY - 6` (a 3 m pit puts it at -9).
- **Hash** = `hashColliders` (FNV-1a over every collider field), golden-tested per track in
  `src/tracks/golden.json` (`UPDATE_GOLDEN=1 pnpm vitest run src/tracks` to bump on purpose).

### 1.4 Authoring DSL — `src/tracks/author.ts`

```ts
course('e2-rear-wheel-first', 'Rear Wheel First', 'easy')
  .meta({ biome: 'canyon', technique: 'rear-wheel-first gap landing', demands: '...', attemptsBand: [3, 5], targetTimeS: 34 })
  .camera({ mode: 'side' })
  .flat(24).checkpoint().flat(3)
  .ramp({ length: 4, height: 0.8 }).gap({ width: 3 }).flat(10)
  ...
  .box({ width: 6, height: 0.6 }).ramp({ length: 3, height: 1.0 }, { base: 0.6 }).gap({ width: 6 })
  .flat(14).finish();
```

Cursor semantics: ground ops (`flat slope smooth rollers space`) extend the profile from
the cursor; obstacle ops place at the cursor and advance by the footprint. Compound ops,
each written from a measured failure: `tabletop(up, top, height, down)` = ramp + box +
ramp; `hump(h, len)` = convex ramp up + down (a speed bump that rolls at any speed);
`drumStep(drum, {exit})` = ramp + 1 m shelf at drum-centre + 0.4 + drum (+ mirror shelf and
ramp with `exit`), the measured box -> drum line (physics 12.3), replacing the round-2
`kickerDrum` whose 0.5 m kicker still met a 1.6 m drum's face below the centre;
`bumpDrum(r, proud)` = drum sunk so `proud` m shows (0.3 rolls at any speed); `seesawEntry(seesaw)` =
0.8 m fillet flush with the resting board end + see-saw; `platform(width, height)` = box
whose last 1.5 m is a 0.4 m kicker on top (gap chains: a flat launch can never land level,
so every platform launches at an angle); `steepPlank({angleDeg, rise})` = fillet + plank.
Round 5 (authored to the reflex bot): `gapLanding(height, top, up, down)` = up-ramp whose foot is at
the far lip + top + long down-ramp (every E2 / H2 / X3 gap lands on one); `platform(w, h, { landing,
landingLength })` puts a landing lip (2-3 m ramp rising the last 0.4 m) at the platform's front
edge; `steppedWall(wall, step)` = ramp in front leaving `step` m of wall (the B line; the lip stays
for the A line); `logStep` ramps to the first log's top (3 x 2r, curve 0.3). Flow vocabulary (round 3, no new technique, keeps speed): `humpRow(count, h, pitch)`,
`wave(length, dy)` = smooth rise and fall, `stepDowns(up, top, heights[])` = ramp onto a
cascade of shelves each a drop, `smallGap(rampLen, rampH, gap)` = kicker + gap onto flat.
Consecutive flats merge into one profile segment.
Obstacles pin the profile at both ends so a slope after a box starts after the box.
`plank({ angleDeg, rise })` computes the board length; `steepPlank({ angleDeg, rise })` puts a
1.2 x 0.35 concave ramp fillet under the foot and climbs the remaining rise. The cursor is
kept on the 1e-6 grid so computed footprint ends and the next `pos.x` quantise identically.
`checkpoint()` records the spawn
(rear-wheel contact at cursor + 0.5, angle 0); `camera(key)` opens a `CameraKey` that runs
to the next key or the finish; `hint(text)` adds a HUD hint; `finish(runout = 30)` sets
`finishX` at the cursor, adds the run-out (round 6: `runout` is raised to `FINISH_RUNOUT.flat` = 30 m of flat at the finish height, then the catch — a 3 m x 0.75 ramp into a 2.5 m container — then the 35 deg end bank; `validateFinishRunout` checks flat, catch and that nothing stands on the run-out) and validates. Round 4 (authored to the stranger): `plateau(up, top, height)` = cosine rise, flat top, cosine fall with every crest grounded at 16 m/s (B1's tabletops), `descent(length, drop)` = a smooth descent whose top cannot launch, `bumpRow(count, h, groundedAt)` = cosine speed bumps grounded at that speed (B1's hump rows), `wave(length, dy, groundedAt)` asserts the same. `finish(runout, { checkpointRule: false })` opts a harness fixture out of the checkpoint rule; `{ catch: false }` opts a compile-test snippet out of the catch (fixtures keep it: `flat-test` carries the catch at 150 m by hand). Round 6: `steepPlank` takes `filletLength` / `filletHeight` — a 2.4 x 0.8 fillet in front of a >= 48 deg plank spreads the pitch-up over ~0.2 s (X1's 50 deg plank went from a 78-death stuck-restart wall to 3 deaths for reflex `good`; the 1.2 x 0.35 default stays on the <= 48 deg planks of E1).

Builder-enforced: solids and gaps stand on level ground and never overlap each other's
footprints; ground slopes <= 40 deg (steeper is a plank or ramp); profile x increasing;
`meta()` present. `validateSpawns` (CONTRACT §2.4): start and every checkpoint spawn lies
on ONE flat profile segment covering rear wheel - 0.4 m to front wheel + 0.6 m, and no solid
or gap lies under it. `auditCheckpoints(def)` (round 4) returns the per-spawn table (first speed obstacle, effective run-up, distance after the previous landing zone) and the violations `validateCheckpoints` throws on; `tracks.test.ts` asserts zero violations for every curriculum track.

Tested per registered track (`tracks.test.ts`): deterministic compile; sequential ids with
every obstacle collider owned by a `placed` entry; checkpoints strictly increasing between
start and finish; spawns on one flat ground collider segment; `finishX` >= last course obstacle
extent + 3 m (the catch stands past it); finish run-out (30 m flat, ramp + >= 2.5 m catch, nothing on the flat, bounds cover the catch); no overlapping colliders (no collinear shared stretch between any two
polylines, no proper crossings, no circle/box interpenetration across obstacles); bounds
sane and `oobY` = minY - 6; one pit hazard per gap and one fire hazard per burning barrel;
all 12 kinds used by the curriculum; golden hash. The suite also prints an
obstacle-by-obstacle summary per track (`describeTrack`), and `describeAhead(compiled, x,
range)` is the text the stranger REPL's `look` will use.

## 2. Curriculum: 5 tiers x 3 tracks

Rule: each track TEACHES one technique in a safe zone right after a checkpoint, repeats it
with rising stakes, then DEMANDS it once where failure costs the run back to a checkpoint.
Round 3 adds RHYTHM: between the taught obstacles every track has flow sections (rollers,
humps, waves, tabletops, small kickers) that keep speed and teach nothing new, and ends on
a set piece. Every track has 3-7 checkpoints, each followed by >= 3 m of flat run-in, spaced
~12-18 s of bot time apart (the bot rides flow at ~13 m/s; a stranger at 60-70 % of that
sees a checkpoint every 20-30 s). Attempts bands are the stranger attempts-to-clear target
(harness-metrics.md §3 measures them): Beginner 1-2 | Easy 2-6 | Medium 5-12 | Hard 10-25 |
Extreme 30-80. Bot tier criterion (round 3): beginner <= 2 attempts at skill 1, easy and
medium <= 4 / <= 10 at skill 2, hard <= 20 and extreme <= 60 at skill 3.

Biomes: Beginner industrial (warehouse amber, HUD hints on); Easy canyon; Medium
industrial / snow / foundry; Hard nightCity / nightCity / foundry; Extreme snow / foundry /
foundry. `loop` is cut from the vocabulary, so H3 (was "Loop Line") is the speed-commit
track over fire barrels; drums spin in place, so M2 / X2 are about balancing on a spinning
surface rather than riding a translating spool.

Drum rule (physics 12.3, §0): no bare log or drum anywhere below Extreme. **The bare 0.3 m
log is gone from the curriculum**: moved from B2 to M2 as a front-lift lesson, the skill-2
bot failed it 50 times in 50 (an 86 deg wall to anything but a timed lift), so M2 rides
half-buried logs (`bumpDrum(0.3, 0.3, wood)`, 0.3 m proud) and every log pyramid gets a
0.3 m entry ramp (`logStep`) so the wheel meets the first log at its centre. Every r >= 0.6
drum is sunk to <= 0.5 m proud or entered from a `drumStep` shelf (or from another drum's top
across a gap <= 2 m: a spinning top cannot be pumped, so X2's 3 m / 4 m drum-to-drum gaps at
see-saw speed were a 34-attempt wall and are now 2 / 2.5 m). Landing rule (sweep 3): never
start a rise (wave, up-ramp, tabletop) within 10 m of a drop exit — a nose-down landing on
rising ground is the one endo physics produces without a brake (m1: 49 of 50 faults at one
wave foot; b2, e1, e3 likewise) — and a `tabletop` landing ramp is 10 x height long
(5.7 deg) so a bike leaving the top at 14-18 m/s lands on the ramp, not past it. Hints
(beginner tier, shown by the HUD in order) name the technique in <= 6 words.

### Beginner

**B1 `b1-first-ride` First Ride** — TEACHES throttle control. Hints "Hold the gas up the
hill" / "Steady gas over the rollers" / "Off the gas down the descent" / "Brake before the
hump". 583 m, CP 66 / 236 / 412. Round 4: **nothing on B1 can leave the ground at top speed
(20 m/s)** — every rise and fall is a cosine with crest radius >= 41 m (`plateau`, `descent`,
`wave(.., 20)`, `bumpRow`), there is no ramp kink and no convex hump anywhere (physics round 8:
a flat-out rider at 18.5 m/s nosed down through a 0.25 m `humpRow`), rollers 0.25 m. Smooth
hill (16 m, 1.2) and descent; rollers; plateau 15/8/1.0; flow (two 14 m cosine bumps, 36 m x
1.5 wave); plateau 16/10/1.2, bumps, 42 m x 2.0 wave, bumps; DEMANDS: 21 m descent of 2.0,
8 m brake zone, a 0.3 m cosine bump, an 11/4/0.5 plateau; set piece: a 46 m x 2.5 wave and
rollers home. Stranger round 1 (old B1, median 3 against band 1-1): deaths at 199 (flew off
the 8.5 deg tabletop lip at speed, nose-down on the down-ramp) and 303 (launched off the crest
of the 20 m x 2.0 wave: "full throttle on the face pitched the bike nose-up and airborne over
the crest"); the 24 m start-line loop is physics'. The naive full-throttle controller
(`trackSweep`) now rides 98 % of B1 without a fault. Target 1 attempt, 45 s.

**B2 `b2-lean-back` Lean Back** — TEACHES weight shift on bumps and drops. Hints unchanged.
592 m, CP 55 / 254 / 395 / 502. Round 5 (reflex `average` 4 / 8 / 5 against band 1-2; every death
at 6-9 m/s with the bike fully flipped: the convex hump row right after 5 m-pitch rollers at 123
x3, the 7 deg ramp onto the first kerb x2, a loop on the 14 deg cascade ramp, the 12.7 deg set-piece
ramp from a standing start, rollers 8 m after the 1.8 m drop): two sunk drums 8 m apart and a
grounded bump; every up-ramp <= 6 deg (8 x 0.5, 10 x 1.0, 12 x 1.2, 15 x 1.5, 18 x 1.8); every drop
(0.5 kerb, 1.0 box, 4- and 3-step stairs, the 1.5/1.0/0.5 cascade, the 1.8 set piece) lands on a
straight down-ramp of ~8 x height (reflex probe: box -> down-ramp 1,1,1 at 0.5 / 1.0 / 1.8 m against
1,2,4 onto flat); flow is B1's (6.7 m-pitch 0.25 rollers, `bumpRow`, waves grounded at 16 m/s) and no
rise starts within 12 m of a drop exit. Reflex `average` 1 / 2 / 2, `novice` 4 / 2 / 7. Target 1-2, 50 s.

**B3 `b3-kicker-row` Kicker Row** — TEACHES the jump: gas to the ramp, off the gas at the
lip, lean forward to level, land rear first. Hints "Gas to the ramp, off at the lip" / "Lean
forward to level" / "Land rear wheel first" / "Hold speed to clear the gap". 426 m, CP 20 /
118 / 257 / 342, **every kicker >= 16 m past its checkpoint** and every landing flat or a
ground downslope (under-speed rolls off the lip, over-speed lands long). Kickers 4 x 0.8 and
4 x 1.0 (curve 0.3) onto flat then a 14 m downslope; rollers; 4 x 1.2 and 5 x 1.5 (camera
`high34`, the biggest lip on B3) onto 16 / 20 m downslopes (4 deg: a 12 m/s launch off the 22 deg lip
flew past the old 12 m slope and landed nose-down on the flat — 4 `novice` deaths at 197-224), cosine
`bumpRow` (was a convex `humpRow`: the novice launched nose-down off it), 28 m wave; small gaps 2 m and
3 m from 4 x 1.0 / 4 x 1.2 kickers, rollers; DEMANDS: 16 m run-up, 5 x 1.5 kicker over a 4 m gap onto
a `gapLanding` 0.6 (6 m up-ramp, 8 m top, 10 m down; a 16 m/s launch still lands on the top). Round 6:
`novice` 11, 11, 1 was the demand — 6 of the deaths at the 0.4 m box edge (air-gas-nose-up) and, once
the box was a ramp, in the pit short of it (a 9 m/s cruise off a 22 deg lip barely reaches 5 m); 4 m
+ `gapLanding` -> 0 deaths at the demand, `novice` 4 / 6 / 2, `average` 2 / 3 / 2. 458 m, CP 20 / 122 /
286 / 371. Stranger round 1 (old B3, median
11.5 against band 1-2): 5 deaths at the 4 x 1.2 kicker 3 m past checkpoint 0 ("full gas
mid-ramp backflips"), 8 at the 5 x 2.0 kicker 4 m past checkpoint 1 over a barrel pit into a
2 m wall ("respawns 2-3 m before the kicker with no room to build speed; needs >= 11 m/s
exit"), 1 on the barrels, 0 at the small gaps, 1 at the demand. **Gone: the pit-and-wall, the
barrels, the 2.0 m kickers.** Target 1-2, 55 s.

### Easy

**E1 `e1-uphill-weight` Uphill Weight** — TEACHES lean forward on steep planks. 539 m,
CP 46 / 184 / 283 / 415, **16 m of flat after every checkpoint, 20 m before the demand**.
Plank 30 deg onto a 3.0 m box, 18 m ramp down (9.5 deg); 28 m wave, hump row, rollers; plank
40 deg onto 3.6 m, 22 m ramp down; rollers, humps; plank 36 deg onto 2.4 m, 15 m ramp down;
hump row, 34 m wave, rollers; DEMANDS: 20 m run-up, filleted plank 48 deg (rise 3.7) onto a
6 m box, 22 m ramp down; flow home. Every box descends on a straight <= 10 deg ramp a bike
leaving the top at 16 m/s lands on (parabola meets a 9.5 deg ramp 8.7 m out at 9 deg
relative). Stranger round 1 (old E1, median 9 against band 2-4): 9 of 20 deaths at the 48
deg plank 3 m past checkpoint 3 ("near-vertical wall right after the checkpoint with almost
no run-up; front wheel slams the slope kink; slow full-gas climbs loop at the lip"), 2 at the
foot of the 6 x 0.5 stair descent (45 deg, x 62), 1 at the foot of the 16 m x 1.5 wave
(84), 4 on the 6 / 5 m quarter-pipe roll-outs off the 3.6 / 2.4 m boxes (159, 205-216: a box-top
launch landed nose-down at the pipe's foot), 1 at the -40 deg plank's foot (306). **Gone: the
stairs, the quarter-pipes, the plank descent.** Target 2-4, 60 s.

**E2 `e2-rear-wheel-first` Rear Wheel First** — TEACHES rear-wheel-first gap landings.
617 m, CP 24 / 149 / 286 / 468. Round 5 (reflex `average` 23 / 45 / 13 against band 3-5: 28 deaths at
the far lip of the demand's second 6 m gap, 16 at the 1.0 m box edge after the 6 m gap, 12 at the
demand's 0.6 m box edge): every gap lands on an up-ramp whose foot is at the far lip (`gapLanding`;
the rear-first landing IS an uphill landing, and a short jump meets a 7-10 deg incline instead of a
face — probe 1,1,1 against 1,5,14 onto a box), the demand platform is 8 m behind a 5 x 0.6 landing
ramp and its second gap is 5 m onto a `gapLanding` (probe 1,2,1 against 14 / 1 / walled at 6 m onto
flat). 4 x 0.8 / 3 m; 5 x 1.2 / 4 m onto a 6 x 1.0 ramp; 5 x 1.5 / 6 m onto `gapLanding` 1.0; two
3 m small gaps; 5 x 1.2 / 4 m onto `gapLanding` 0.8; tabletop, waves; DEMANDS 5 x 1.5 / 5 m /
landing ramp + 8 m platform / 3 x 1.0 kicker / 5 m / `gapLanding` 1.0. Reflex `average` 3 / 5 / 1.
Target 3-5, 65 s.

**E3 `e3-stairway` Stairway** — TEACHES stairs: gas up (the wheel bounces up each riser at
speed), brake down without a stoppie. 524 m, CP 46 / 148 / 242 / 385. Round 5 (reflex `average` 0 of
3 at 28 %: 95 stuck-restarts at 6 x 0.4 risers 2.5 m past a checkpoint, 52 at 5 x 0.3 risers 3 m
past one; probe: a 0.35 m riser reads as a face and is walled from any run-up, 0.3 risers from 16 m
clear for most seeds but a 215 ms player still stalls (up to 11), 0.25 risers at a 0.5 m run clear
1,1,1,1,1,1): every flight up is 0.25 m risers at a 0.5 m run (26.6 deg) with 16 m of run-up (the
checkpoint rule now counts a flight up as a speed obstacle, `stairRiser` 0.25): 3 x 0.25, 6 x 0.25,
6 x 0.25, DEMANDS 8 x 0.25 up at speed and 8 x 0.25 down into the 2 m gap. Reflex `average`
3 / 4 / 9. Target 3-6, 70 s.

### Medium

**M1 `m1-hop-up` Hop Up** — TEACHES the bunny hop onto ledges. 439 m, CP 41 / 120 / 255 / 340.
Round 5 (reflex `average` 0 of 3 at 79 %: 67 stuck-restarts at the 0.7 m ledge, 35 at the 0.9; 6-seed
probe from 16 m: 0.45-0.5 clear in 1-2, 0.55 in 2-14 with one wall, 0.6 and up walled for most seeds,
a bare 0.9 walled for every skill, 0.45 step + 0.9 ledge 1-4, steps 0.3 / 0.6 / 0.9 1,1,2,1,1,1; a
hop-up 1.5 m before a hop-across was 17 + 8 deaths): eight hops, every ledge >= 0.45 with 16 m of
run-up (`hopHeight` 0.45, the first one 21 m from the start line): 0.45; 0.5 (4 m) then a 1.5 m hop
across; a 0.45 + 0.45 two-stage to 0.9; 0.5 (4 m) then a 2 m hop across; DEMANDS the 0.9 m rise as
0.3 (6 m) / 0.6 (1.5 m) then a 3 m landing ramp to 0.9 on the ledge top (round 6: the 0.6 stage lands on
an incline instead of a flat top and a third riser — `average` 6 seeds: 12 nose-down / loop deaths at
the 0.6 riser, 4 at the 0.9) then the 2 m hop across onto a lipped 0.9 box (2 m ramp rising the last
0.25: 9 deaths at the box face). Reflex `average` 9 / 14 / 10 / 6 / 7 / 9 over 6 seeds -> median 9
(was 8 / 14 / 22 / 22 / 6 / 13 -> 13.5). 481 m, CP 41 / 103 / 264 / 347. Target 5-9, 80 s.

**M2 `m2-drum-roll` Drum Roll** — TEACHES logs and drums. 488 m, CP 24 / 155 / 279 / 385. Round 5
(reflex `average` 47 / 9 / 37: 38 stuck-restarts at the log pyramid 3 m past checkpoint 1, 21 at the
demand's ramp 3 m past checkpoint 3): pyramids, shelf drums and the 0.5 m-proud drum are momentum
features under the checkpoint rule (16 m from every spawn); `logStep` ramps to the first log's TOP
(3 x 2r, curve 0.3) so the upper rows are 0.22-0.52 m bumps (probe: 2-row 1,1,1, 3-row 2,2,5 against
3,3,3 / walled from the centre-height ramp). Obstacles otherwise as round 4. Reflex `average`
10 / 3 / 7. Target 6-12, 85 s.

**M3 `m3-see-saw` See-Saw** — TEACHES see-saw timing and thin landings. 482 m, CP 28 / 174 / 288 /
363. Round 5 (reflex `average` 40 / 2 / 45: 24 deaths on the demand's see-saw, 19 + 15 at the 20 deg
kicker / plank 3 m after the 6/1.5 board; probe: the old demand — a 3 m gap off the tipping board onto
a plank at 2.0 — walled 99 x 3): a board leaves ~5 m/s, so every kicker after one has 10 m to build
speed; thin landings are 4-5 m planks at 1.0-1.5 from <= 17 deg kickers (8-12 m/s window, probe
1-2); DEMANDS 4 x 1.0 / 3 m gap onto the resting end of the 8/2.0 see-saw (it dips, you roll up, it
tips), 10 m, 5 x 1.5 kicker / 3 m / 4 m plank at 1.5 / 2.5 m / 1.5 box. Reflex `average` 4 / 11 / 8.
Target 8-12, 90 s.

### Hard

**H1 `h1-wheelie-wire` Wheelie Wire** — TEACHES the sustained wheelie across slotted rails and
the lip climb. 597 m, CP 28 / 157 / 328 / 442 / 510. Round 5 (reflex `average` 0 of 3 at 29 %: 137
identical stuck-restarts at the 1.0 m lip wall — a wall of one death means the feature has no
fallback line; probe: lip walls 1.0 / 1.2 / 1.4 walled even for `good`, a 0.5 m step in front 2,2,2):
every wall is a `steppedWall` — the lip stays for the A line (front wheel onto the lip at speed, hop
the rear) and a ramp in front leaves a 0.5 m hop from its top as the slower B line; slot rows start
<= 3 m after each wall (the checkpoint rule now counts a kill-slot row as a hazard wanting the run-up
unless it is entered off a wall top). Reflex `good` 41 / 41 / 5 (one clear, best 100 %); `average`
best 92 %: the stepped 1.0 wall still takes 47 + 28 deaths (the reflex hop from a ramp top is its
weakest hop). Target 10-18, 110 s.

**H2 `h2-gap-chain` Gap Chain** — TEACHES precision gaps on kicker platforms. 634 m, CP 28 / 233 /
405 / 510. Round 5 (reflex `average` capped at 44 %: 50 + 36 deaths at chain A's first two box edges;
`good` probe: chain A as authored walled, 8 m platforms with landing lips 1,14,8, chain B with lips
11-15): every platform has a landing lip at its front edge (`platform` with `landing` /
`landingLength`: a short jump meets a 6-11 deg incline, not a face); chain A 8 m platforms, 3 m
lips, gaps 3 / 3 / 3 / 2; chain B 7 m platforms stepping up 0.3 with 3 m lips; chain D 6 m platforms,
gaps 5 / 4 / 5 onto a `gapLanding`; DEMANDS chain C: 5.5 m platforms with 2 m lips, gaps 4 / 4 / 3 /
4 / 2 / 4, a see-saw and a 3 m gap. Reflex `good` best 71 % (walled at chain B's 3rd lip and chain D
by the air rule: nose-down in the air -> gas + lean back -> loop). Target 14-22, 120 s.

**H3 `h3-fire-line` Fire Line** — TEACHES speed commitment over burning barrels, then the hard
stop. 553 m, CP 28 / 201 / 333 / 432. Round 5 (reflex `average` capped 51 x 3: 84 deaths landing
past the first barrel row on flat ground, 15 at the demand's 18 deg landing ramp; `good` probe:
kicker + 4 barrels onto flat 2 / walled / 4, onto an 8 x 2.0 landing ramp 2 m past the barrels
1,1,1; then 111 hazard deaths at the demand's "2 m gap + 6 barrels" = 6.6 m of fire from a 23 m
run-up at ~11 m/s, with or without the pit): every fire line lands on a 14 deg ramp whose top is 2 m
past the last barrel; rows 4 / 6 / 5 / 6 barrels (the gap is gone: the demand is the stop after the
fire — brake zone, hump, 2 m low-speed hop, 0.5 + 0.7 stepped kerb); kerbs 0.5. Reflex `average`
13 / 5 / 31, `good` 19 / 11 / 17. Target 18-25, 125 s.

### Extreme

**X1 `x1-vertical-limit` Vertical Limit** — TEACHES near-vertical planks and pole-top hops. 741 m,
CP 78 / 186 / 347 / 488 / 646. Round 6 (reflex `good` 13 % on round 5's layout: the 50 deg fillet 20 m past
CP0 was a stuck-restart wall, 67 + 43): the first plank is 45 deg with a 40 m run-in from the start line
and no checkpoint before it, CP0 sits 8 m past its landing ramp, the planks escalate 50 / 55 / 60 each
40 m past its checkpoint (from 20 m the 50 deg fillet was still 78 deaths; from 40 m with the default
1.2 x 0.35 fillet still 69 for two seeds — the plank, not the run-up, was the wall — and with a 2.4 x 0.8
fillet 3), the lip wall + 56 deg plank is gone (lip walls are walled for every reflex skill), and both
pole rows are entered from a ledge 0.4 m under the first cap (ramp + box: a walking-pace hop starts the
row, not a 1.2 m one from the ground; in 2.5D there is no line beside the caps, so the B line is the
entry and the kill pit makes a miss a restart, not a stall). Reflex `good` 79 / 79 / 72 % (walled at the
60 deg demand plank at 528 m), `average` 79 %, `novice` 72 %. Round 5 layout for the record: Round 5 (reflex 0 of 3 at 11-13 %: 91 + 30 deaths at the 50 deg plank;
probe `good`: planks 50 / 55 / 60 deg 2,1,1 / 2,6,6 / 7,walled,7, a pole-cap row walled for every
skill — the cap hop is the one technique with no slower line): planks 50 -> 55 -> 55 -> lip wall +
56 -> 60 with 20-24 m down-ramps (was a -40 deg plank) and flow between; both pole rows sit in the
last third after the 60 deg plank (1.2 -> 1.8 over a kill pit, then three caps at 2.0 from a 2.0 box
with a 4 m gap onto a -30 deg plank). Reflex `good` still 13 %: the 50 deg fillet 20 m past the
first checkpoint is a stuck-restart wall for this player (67 + 43) even though the same plank
cleared in the probe from a longer first run-up; open. Target 30-45, 140 s.

**X2 `x2-pipe-dream` Pipe Dream** — TEACHES spinning drums with gaps and see-saw drops. 515 m,
CP 24 / 195 / 339 / 407. Round 5 (reflex 0 of 3 at 31 %: 107 nose-high deaths at the 3-row pyramid
behind a centre-height ramp, 10 at the first drum-top gap 3 m past the start): `logStep` 2r, 16 m
from every checkpoint to its shelf drum, the 1.5 m pole between the 2.0 m drum and the 15 m platform
is gone (the drum top steps 0.2 m down onto the box), the closing kerb 0.5. Reflex `good` best 72 %
(the pipe run's drum-top gaps: air rule). Target 40-60, 150 s.

**X3 `x3-gauntlet` The Gauntlet** — DEMANDS everything in curriculum order. 500 m, CP 28 / 166 / 226 /
304 / 387 / 445. Round 6 (773 m no longer finished inside the bot's 420 s wall: 8 attempts, 89 %, blocker
the H2-section lipped chain at 498 m): ONE feature per lesson — 48 deg plank -> down
onto a 1.5 / 1.0 / 0.5 drop cascade, rollers, 8 x 0.25 stairs up and down into a 2 m gap | 0.5 ledge +
1.5 m hop across, shelf drum, checkpoint (a death at the see-saw or the wall was a 100 m walk back
through the ledge: 53 `good` deaths there until CP2 went in) | 4 x 1.0 / 3 m onto the 8/2.0 see-saw,
16 m, `steppedWall` 1.4 + 4 rails | lipped chain of 3 with 0.25 m lips and 2.5 / 2.5 / 2 m gaps (round
5's 0.4 lips at 3-4 m walled `good` on h2 and x3 alike), bumps | 6-barrel fire row onto a landing ramp |
60 deg plank -> three 4.5 m caps -> 4 m gap -> -30 deg plank, finish. (The 2.4 x 0.8 fillets that fixed X1 were tried here on the 48 and 60 deg planks: reflex `novice` went from a 64-death wall at the 48 deg fillet to 94-95 % on two seeds, but the 2.4 m shift walled the search bot at the pole-cap landing plank — 33 attempts, 97 % at 600 s — so X3 keeps the 1.2 x 0.35 fillets the bot clears.) No B3 kicker,
E2 double, X2 chain or finale (all repeats of a kept feature). Search bot skill 3: 2 attempts, finished
42.6 s, 166 s of wall (sequential, 600 s wall). Reflex `good` 94 / 94 / 94 %, `average` 94 %, `novice` 94 % best (novice: 49 + 15
stuck-restarts at the 48 deg fillet 20 m past CP0; every skill walled at the 60 deg plank at 466 m, the X1 demand). Round 5 for the record
(773 m): every section carries its parent's round-5 shape (E2 `gapLanding`
double, E3 8 x 0.25 stairs, M1 hop + 16 m to the shelf drum, M3 see-saw landing then the 1.0 plank
shape, H1 `steppedWall` 1.4 + rails, H2 lipped 5.5 m chain, H3 6 barrels onto a landing ramp, X1 60
deg plank + caps, X2 chain, finale). Reflex `good` best 63 % (walled at the H2 chain, 464 m).
Target 60-80, 200 s.

### Round 5 / 6 acceptance matrix (reflex bot, 3 seeds, cap 50 attempts / 300 s; search bot skill 3). Rows marked "round 6" were re-run on physics d98236a with the round-6 geometry (sequential, one process, bot wall 600 s); the other rows are round 5 (physics b426bcc + 42af392)

Acceptance per tier: beginner / easy — reflex `average` median inside `attemptsBand` (beginner also
`novice` <= 2 x band top); medium — `average` <= 1.5 x band top; hard / extreme — search bot clears at
skill 3 AND reflex `good` reaches >= 60 % of finishX. Attempts are per seed; "best" is the furthest
x reached as a fraction of finishX.

| track | band | reflex novice | reflex average | reflex good | search bot skill 3 | verdict |
|---|---|---|---|---|---|---|
| b1-first-ride | 1-1 | 1, 1, 4 -> 1 | 1, 1, 1 -> **1** | 1, 1, 1 | (round 4: 1, 1 at skill 1) | pass |
| b2-lean-back | 1-2 | 4, 2, 7 -> 4 | 1, 2, 2 -> **2** | 1, 3, 2 | — | pass (novice 4 = 2 x band) |
| b3-kicker-row | 1-2 | round 6: 4, 6, 2 -> **4** (was 11, 11, 1) | round 6: 2, 3, 2 -> **2** | round 6: 1, 1, 1 | — | pass (novice 4 = 2 x band; the demand box is a `gapLanding` behind a 4 m gap, 0 deaths there) |
| e1-uphill-weight | 2-4 | 7, 10, 3 -> 7 | 1, 1, 2 -> **1** | 5, 1, 1 | — | pass (under band) |
| e2-rear-wheel-first | 3-5 | 10, 33, 11 -> 11 | 3, 5, 1 -> **3** | 3, 2, 7 | — | pass |
| e3-stairway | 3-6 | 22, 8, 16 -> 16 | 3, 4, 9 -> **4** | 8, 14, 6 | — | pass |
| m1-hop-up | 5-9 | round 6: 3, 21, 25 -> 21 | round 6: 9, 14, 10, 6, 7, 9 -> **9** (6 seeds; was 13.5) | round 6: 3, 5, 11 | — | pass (inside band) |
| m2-drum-roll | 6-12 | 10, 16, 15 -> 15 | 10, 3, 7 -> **7** | 7, 15, 11 | — | pass |
| m3-see-saw | 8-12 | 15, 28, 14 -> 15 | 4, 11, 8 -> **8** | 4, 7, 4 | — | pass |
| h1-wheelie-wire | 10-18 | 37, 35, 28 (1 clear) | 38, 42, 41 (best 92 %) | 41, 41, 5 (1 clear, **best 100 %**) | 1 attempt, 91 % at the 180 s wall (6 bots in parallel) | good >= 60 % pass; bot see below |
| h2-gap-chain | 14-22 | 43, 43, 44 (47 %) | 48, 46, 45 (69 %) | 50, 49, 51 (**best 71 %**) | 1 attempt, 89 % at the 180 s wall | good >= 60 % pass; bot see below |
| h3-fire-line | 18-25 | 45, 46, 41 (85 %) | 13, 5, 31 -> **13** | 19, 11, 17 -> **17** | **1 attempt, finished 35.0 s** | pass |
| x1-vertical-limit | 30-45 | round 6: 29, 28, 28 (72 %) | round 6: 30, 30, 32 (79 %) | round 6: 32, 34, 34 (**79 / 79 / 72 %**) | **1 attempt, finished 47.8 s** (226 s wall, sequential) | good >= 60 % pass (walled at the 60 deg demand plank) |
| x2-pipe-dream | 40-60 | 36, 28, 51 (72 %) | 51, 46, 48 (72 %) | 51, 35, 31 (**best 72 %**) | **2 attempts, finished 40.1 s** | pass |
| x3-gauntlet | 60-80 | round 6: 36, 38, 37 (94 %) | round 6: 28, 38, 33 (94 %) | round 6: 32, 34, 36 (**94 / 94 / 94 %**) | **2 attempts, finished 42.6 s** (146 s wall, sequential) | pass (500 m; every skill walled at the 60 deg plank at 466 m) |

Search-bot note: round 5's 180 s wall was run with all six bots in parallel on one machine (47-58 M
ticks each in 180 s); h1 / h2 still carry those contended numbers (a sequential 600 s re-run is owed:
they were not touched in round 6). x1 / x3 above are round-6 sequential runs at a 600 s wall. A sequential run at a 420 s wall is recorded in the round-5 report; the
round-4 table below (180 s, single process, 360-600 m tracks) is the last full bot sweep.

### Curriculum summary (round 4 sweep; physics 2df0b0d, tier skill, 2 seeds, wall 180 s, browser-verified after `--build`)

Tier criterion: beginner <= 2 attempts at skill 1, easy <= 4 / medium <= 10 at skill 2, hard <= 20
/ extreme <= 60 at skill 3. "Clean time" is the bot's finish clock on a 1-attempt run.

| track | tier | skill | attempts (2 seeds) | clean time s | length m | CPs | first blocker |
|---|---|---:|---|---:|---:|---:|---|
| b1-first-ride | beginner | 1 | 1, 1 | 35.350 | 583 | 3 | — |
| b2-lean-back | beginner | 1 | 1, 1 | 30.017 | 414 | 4 | — |
| b3-kicker-row | beginner | 1 | 1, 1 | 28.642 | 426 | 4 | — |
| e1-uphill-weight | easy | 2 | 1, 1 | 36.583 | 539 | 4 | — |
| e2-rear-wheel-first | easy | 2 | 1, 1 | 32.167 | 468 | 4 | — |
| e3-stairway | easy | 2 | 1, 1 | 33.492 | 366 | 4 | — |
| m1-hop-up | medium | 2 | 2, 2 | 31.542 (with faults) | 361 | 4 | crash@233.7m(ledge@233.0) |
| m2-drum-roll | medium | 2 | 3, 3 | 33.858 (with faults) | 356 | 4 | crash@43.3m(drum@41.6) |
| m3-see-saw | medium | 2 | 1, 1 | 29.425 | 396 | 4 | — |
| h1-wheelie-wire | hard | 3 | 1, 1 | 34.817 | 483 | 5 | — |
| h2-gap-chain | hard | 3 | 1, 1 | 38.817 | 495 | 4 | — |
| h3-fire-line | hard | 3 | 2, 2 | 38.483 (with faults) | 473 | 4 | crash@229.0m(ground) |
| x1-vertical-limit | extreme | 3 | 1, 1 | 43.508 | 439 | 4 | — |
| x2-pipe-dream | extreme | 3 | 1, 1 | 30.050 | 367 | 4 | — |
| x3-gauntlet | extreme | 3 | 2, 2 | no finish (wallTimeout, 79 %) | 596 | 7 | hazard@470.1m(pole@470.9) |
| x3-gauntlet (wall 360 s) | extreme | 3 | 7, 9 | no finish (wallTimeout, 98 %) | 596 | 7 | hazard@470.1m(pole@470.9) |

Both seeds produce identical runs (the bot is deterministic per track; seeds only vary the
physics rng, which nothing on these tracks consumes). Bot-clean times are ~30-45 s across all
tiers against a 35-60 / 60-120 / 90-150 s corpus band: the skill-2/3 bot rides flow at 13-14 m/s
and technical sections at 7-8 m/s, so a 60 s medium track would be ~600 m and a 90 s hard track
~900 m; the tracks stopped at 350-520 m (test cap 800 m, render triangle budget unknown at that
length). Stranger clean times run 1.5-2.5 x the bot's (harness-metrics.md §3), which puts the
beginner tier inside its band and medium/hard at the low edge. Restart latency is harness'.

Fixtures: `flat-test` (scaffold strip, unchanged) and `gap-test` (20 m run-up, 4 x 1.0
ramp, 3 m gap, 20 m run-out) for harness-metrics.md M3.

## 3. Measurement

The metric (AGENTS.md) is attempts-to-clear and restart latency, from a bot and a
stranger. The bot, the stranger, the definitions of attempt / clear time / restart latency,
the thresholds and the ship gate are all owned by harness and specified in
`docs/design/harness-metrics.md` (§2 bot, §3 stranger, §5 gate). Tracks contributes:

- **Per-track targets** — `meta.attemptsBand` (stranger median attempts must land inside;
  pass per CONTRACT §3 is median <= 1.5 x band[1]) and `meta.targetTimeS` (competent
  stranger's first clear including faults; medal time for the results screen).
- **Tuning rule** — when a stranger median lands outside the band, edit the TRACK (widen
  the platform, lower the plank, lengthen the run-up), never the target; tier medians must
  stay non-decreasing.
- **Compile gate** — `compileTrack` hash equals `golden.json`; every invariant in §1.4 holds
  (`pnpm vitest run src/tracks`).
- **Readability** — `describeTrack` / `describeAhead` are the text the parent and the
  stranger REPL read instead of a render.

## 4. Round plan

- **Round 1 (this)** — vocabulary, compiler, DSL, 15 courses + fixtures, tests, this doc.
- **Round 2a (done)** — render param names pinned (`variant`, drum `width`); §0 brake / hop /
  partial-throttle numbers replaced by physics round 2 measurements, brake zones widened to
  8 m; every plank >= 48 deg filleted at the foot.
- **Round 2b (done)** — sweep 1 (skill 2) cleared 9/17; the blockers were bare drums and
  see-saw ends at low speed, flat-launch gap chains, a 1.5 m fire lip the wheels could not
  clear, a 1.6 m lip climb, a 0.6 kerb / pole-cap hop, and a beginner drum bump that stopped
  a controls-only stranger. Fixed with `hump`, `kickerDrum`, `seesawEntry`, `platform`,
  2.0 m fire kickers with 20 m run-ups, walls <= 1.4 with run-ups, M1 kerbs 0.45/0.5/0.55
  -> 0.9 with run-up. Sweep 2: beginner clears at skill 1 in 1, easy/medium at skill 2 in
  <= 2, hard at skill 2 in <= 3, extreme at skill 3 in 3.
- **Round 3 (done)** — physics round 4 made drums geometry: bare logs left Beginner (B2 rides
  sunk drums and humps; the logs are M2's front-lift lesson with hints), `kickerDrum` was
  replaced by `drumStep` (shelf at centre + 0.4) and `bumpDrum`, X2's bare 1.6 m first drum is
  gone. Every track roughly tripled in length with flow sections and a set piece; beginner
  hints name the technique in <= 6 words in obstacle order; checkpoints every ~12-18 s of bot
  time. Sweep at tier skill: see the table.
- **Round 4 (done)** — authored to the stranger (eight real strangers, two per track: b1 median
  3 against band 1-1, b2 3 (1-2, pass), b3 11.5 (1-2), e1 9 (2-4)). The checkpoint rule is a
  validator (`CHECKPOINT_RULE`, `auditCheckpoints`, enforced in `finish()` and the test suite)
  and every one of the 15 tracks passes it (52 violations before; 20 m run-ups before steep
  planks, 15 m before kickers / gaps / walls / ledges, 14 m past a landing before a checkpoint,
  drum-top gaps capped at 2 m). B1 cannot launch at 16 m/s (`plateau` / `descent` / grounded
  waves replace every tabletop and 20 m wave), B3 lost the pit-and-wall, the barrels and the
  2.0 m kickers and lands every kicker on flat or a downslope, E1 has 16-20 m run-ups and
  straight <= 10 deg descents instead of stairs, quarter-pipes and a -40 deg plank. Bot table
  below. Open: x3 (596 m) no longer finishes inside the bot's 180 s wall (2 attempts, 79 %; 7-9
  attempts, 98 % at 360 s, repeated hazard faults at the X1-section pole caps at 471 m after the
  20 m run-up onto the 60 deg plank; it was 2 attempts clean at 518 m) — trim X3 or split the
  finale; m1 / m2 / h3 took 2 / 3 / 2 attempts under physics 2df0b0d (m2's fault is the unchanged
  0.5 m-proud `bumpDrum` at 42 m); E1's 48 deg demand cannot be made over-speed-safe by geometry
  (a flat-out 20 m/s rider crashes at any steep plank foot) — the 20 m flat after checkpoint 3
  is its brake zone; B2's first `bumpDrum` endos a constant-lean full-throttle rider at 12 m/s
  (`trackSweep`). Next: stranger round 2 on b1 / b3 / e1.
- **Round 5 (done)** — authored to the reflex bot (harness-metrics.md "Round 5": `average` was walled
  on e3 / m1 / m3 / h1 / h2 / h3 / x1 / x2 / x3 and 4-8x over band on b2 / e2). Every death cluster
  in `reflex.md` was reproduced with a one-feature probe and re-authored to the shape that probe
  cleared: grounded flow and <= 6 deg ramps with down-ramp drop landings (B2), `gapLanding` up-ramp
  landings and an 8 m double-gap platform (E2), 0.25 m risers with 16 m run-ups (E3), staged hops
  and hops separated from hop-acrosses (M1), 16 m to every momentum feature and `logStep` at 2r
  (M2), 10 m after every see-saw and 1.0-1.5 planks (M3), `steppedWall` B lines (H1), lipped
  platforms (H2), landing ramps after every fire row and a 6-barrel demand (H3), pole rows moved
  into the last third (X1), the drum -> pole -> box cap hop removed (X2), all of it in X3. The
  checkpoint rule covers stairs, pyramids, drums, slots and 0.45 m ledges. Matrix above. Open: x1
  (the 50 deg fillet 20 m past a checkpoint is a stuck-restart wall for the reflex player although
  the probe clears it from a longer first run-up — a shallower first plank or a longer run-in),
  m1 at the 1.5 x edge, b3 `novice` 11 at the demand's 16 m box, h2 / x3 `good` stop at the lipped
  chains on the air rule (nose-down -> gas + back -> loop; physics' next air-lean round should move
  this), the search bot needs a longer wall than 180 s for 600-770 m tracks.
- **Round 6 (done)** — the round-5 opens, plus the finish run-out. X3 trimmed 773 -> 500 m to one
  feature per lesson with a mid checkpoint (bot 2 attempts / 42.6 s, reflex `good` 94-95 % for every
  seed); X1 re-sequenced (45 deg opener 40 m from the start, CP0 after its landing, 50 / 55 / 60 each
  40 m past a checkpoint with 2.4 x 0.8 fillets, no lip wall, pole rows entered from a ledge 0.4 under
  the first cap: `good` 13 % -> 72-79 %); B3's demand is a 4 m gap onto a `gapLanding` with 4 deg
  landing slopes and cosine bumps upstream (`novice` 11 -> 4); M1's 0.6 stage lands on a ramp to 0.9
  and the hop-across box has a lip (`average` 13.5 -> 9 over 6 seeds). Every track and fixture ends in
  `FINISH_RUNOUT`: 30 m flat + a 3 m ramp into a 2.5 m container (validated). Finding: a steep plank's
  wall for the reflex player is the fillet, not the run-up — the same 50 deg plank from 40 m was 69
  deaths with the 1.2 x 0.35 fillet and 3 with 2.4 x 0.8. Open: h1 / h2 sequential bot re-run at 600 s;
  the 60 deg plank is a hard wall for every reflex skill (X1's and X3's demand, by design — a 2.4 x 0.8
  fillet did not move it); a 20 m/s impact on the finish catch is a contained crash about half the
  time (the catch is a wall; coasting stops inside the 30 m); hard/extreme bot-clean times are still
  under the 90-150 s corpus band.
