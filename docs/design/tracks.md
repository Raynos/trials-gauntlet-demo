# Track system and curriculum

Status: round 4 (authored to the stranger: checkpoint rule, no-launch beginner, E1 run-ups). Owner: tracks. Consumers: physics, render, audio, harness, game.
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
Flow vocabulary (round 3, no new technique, keeps speed): `humpRow(count, h, pitch)`,
`wave(length, dy)` = smooth rise and fall, `stepDowns(up, top, heights[])` = ramp onto a
cascade of shelves each a drop, `smallGap(rampLen, rampH, gap)` = kicker + gap onto flat.
Consecutive flats merge into one profile segment.
Obstacles pin the profile at both ends so a slope after a box starts after the box.
`plank({ angleDeg, rise })` computes the board length; `steepPlank({ angleDeg, rise })` puts a
1.2 x 0.35 concave ramp fillet under the foot and climbs the remaining rise. The cursor is
kept on the 1e-6 grid so computed footprint ends and the next `pos.x` quantise identically.
`checkpoint()` records the spawn
(rear-wheel contact at cursor + 0.5, angle 0); `camera(key)` opens a `CameraKey` that runs
to the next key or the finish; `hint(text)` adds a HUD hint; `finish(runout = 10)` sets
`finishX` at the cursor, adds the run-out and a 35 deg end bank, and validates. Round 4 (authored to the stranger): `plateau(up, top, height)` = cosine rise, flat top, cosine fall with every crest grounded at 16 m/s (B1's tabletops), `descent(length, drop)` = a smooth descent whose top cannot launch, `bumpRow(count, h, groundedAt)` = cosine speed bumps grounded at that speed (B1's hump rows), `wave(length, dy, groundedAt)` asserts the same. `finish(runout, { checkpointRule: false })` opts a harness fixture out of the checkpoint rule.

Builder-enforced: solids and gaps stand on level ground and never overlap each other's
footprints; ground slopes <= 40 deg (steeper is a plank or ramp); profile x increasing;
`meta()` present. `validateSpawns` (CONTRACT §2.4): start and every checkpoint spawn lies
on ONE flat profile segment covering rear wheel - 0.4 m to front wheel + 0.6 m, and no solid
or gap lies under it. `auditCheckpoints(def)` (round 4) returns the per-spawn table (first speed obstacle, effective run-up, distance after the previous landing zone) and the violations `validateCheckpoints` throws on; `tracks.test.ts` asserts zero violations for every curriculum track.

Tested per registered track (`tracks.test.ts`): deterministic compile; sequential ids with
every obstacle collider owned by a `placed` entry; checkpoints strictly increasing between
start and finish; spawns on one flat ground collider segment; `finishX` >= last obstacle
extent + 3 m; no overlapping colliders (no collinear shared stretch between any two
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

**B2 `b2-lean-back` Lean Back** — TEACHES weight shift on bumps and drops. Hints "Lean back
over the bumps" / "Lean back off the drop" / "No brakes down the stairs" / "Lean back, gas
off the big drop". 414 m, CP 41 / 190 / 289 / 353. Three sunk drums (0.3 m proud) and a hump
(the round-2 bare logs needed a front lift, which is not a beginner input); ramp onto a
0.5 m kerb (drop 0.5 onto a 5.7 deg downslope), 10 m to settle; ramp onto a 1.0 m box (drop
1.0 onto a downslope); flow; ramp + box +
4-step stair down, a wave, a 1.5/1.0/0.5 cascade of shelves; ramp + 1.0 box + 3 steps; flow;
DEMANDS: 8 x 1.8 ramp onto a 10 m box with a 1.8 m drop onto a downslope (camera `low`).
Target 1-2, 50 s.

**B3 `b3-kicker-row` Kicker Row** — TEACHES the jump: gas to the ramp, off the gas at the
lip, lean forward to level, land rear first. Hints "Gas to the ramp, off at the lip" / "Lean
forward to level" / "Land rear wheel first" / "Hold speed to clear the gap". 426 m, CP 20 /
118 / 257 / 342, **every kicker >= 16 m past its checkpoint** and every landing flat or a
ground downslope (under-speed rolls off the lip, over-speed lands long). Kickers 4 x 0.8 and
4 x 1.0 (curve 0.3) onto flat then a 10 m downslope; rollers; 4 x 1.2 and 5 x 1.5 (camera
`high34`, the biggest lip on B3) onto 12 m downslopes, hump row, 28 m wave; small gaps 2 m and
3 m from 4 x 1.0 / 4 x 1.2 kickers, rollers; DEMANDS: 16 m run-up, 5 x 1.5 kicker over a 5 m
gap onto a 16 m x 0.4 box (a 16 m/s launch still lands on it). Stranger round 1 (old B3, median
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
468 m, CP 24 / 122 / 234 / 375 (round 4: 16 m of flat after every checkpoint, 14 m after the second small gap). 4 x 0.8 ramp / 3 m gap; 5 x 1.2 / 4 m gap onto an uphill
landing ramp; rollers + hump row; 12 m run-up, 5 x 1.5 / 6 m gap onto a 1.0 m box; wave, two
3 m small gaps; 5 x 1.2 / 4 m gap onto a 0.8 box, rollers, tabletop, 2 m wave, humps; DEMANDS: 5 x 1.5 / 5 m
gap onto a 6 m x 0.6 box carrying a 3 x 1.0 ramp straight into a 6 m gap; flow home.
Target 3-5, 65 s.

**E3 `e3-stairway` Stairway** — TEACHES stairs: throttle pulses up, brake down without a
stoppie. 366 m, CP 41 / 98 / 169 / 261 (round 4: 6 m of flat between the demand's stair descent and its gap). 5 x (0.30/0.45) up, box, 5 down; wave + humps;
6 x (0.40/0.45) up, 8 down past unlit barrels; tabletop, rollers; 4 x 0.4 up, 5 down at speed;
hump row, 2 m wave, rollers; DEMANDS: 7 x (0.45/0.40) up (48 deg envelope), 9 x (0.35/0.40)
down into a 2 m gap; wave, tabletop, rollers home. Target 3-6, 70 s.

### Medium

**M1 `m1-hop-up` Hop Up** — TEACHES the bunny hop onto ledges (preload lean back +
throttle, snap forward; there is no hop button). 361 m, CP 18 / 84 / 207 / 269 (round 4: 16 m run-ups to the 0.7 and 0.9 m ledges). Kerbs 0.45,
0.5 (stationary apex 0.62); rollers, wave; 0.55, a 0.55 kerb into a 1.5 m gap; hump row,
tabletop, 2 m wave, rollers; 6 m run-up, 0.7 m kerb (the rolling hop at a rideable height), 0.6 kerb into a 2 m
gap; rollers; DEMANDS: 10 m run-up, 0.9 m ledge (the rolling-hop envelope: a 1.45 m rear
lift), 2 m hop across to a 0.9 m box (camera `side-tight` cut); 12 m to land, humps, 2 m wave
home. Target 5-9,
80 s.

**M2 `m2-drum-roll` Drum Roll** — TEACHES logs and drums: lean back over half-buried logs,
roll a big drum from its shelf, balance on a spinning one. Hints "Lean back over the logs" /
"Roll the drum from the shelf" / "Gas off on the spinning drum" (the HUD shows hints for
beginner only today; see open items). 353 m, CP 24 / 120 / 193 / 281. Sunk 0.5 drum (0.3
proud), sunk 0.8 drum (0.5 proud), two half-buried logs, a touching half-buried pair;
rollers, 2 m wave, humps; 2-row log pyramid behind a 0.3 m entry ramp (`logStep`),
`drumStep` 0.6 with exit shelf; hump row, wave; `drumStep` 0.8 / 2 m gap / 0.8 drum (drum
top to drum top), `drumStep` spinning 0.8 with exit; tabletop, rollers; DEMANDS: ramp to a
1.2 m box -> spinning 0.8 drum (top 1.6) -> box, 3-row log pyramid (`logStep`), see-saw exit;
12 m, wave home. Target 6-12, 85 s.

**M3 `m3-see-saw` See-Saw** — TEACHES see-saw timing and thin landings. 396 m,
CP 28 / 145 / 238 / 313 (round 4: 15-16 m from every checkpoint to its kicker). Filleted see-saws 6/0.8 and 8/1.2 (camera `low`); rollers, humps,
2 m wave, rollers;
see-saw 6/1.5, ramp / 3 m gap / 4 m plank at 1.5 / ramp down; wave, tabletop; ramp / 3 m gap /
plank at 1.0, see-saw 8/1.5; rollers; DEMANDS: ramp / 3 m gap landing on the resting end of a
see-saw 8/2.0, 3 m gap to a 3 m plank at 2.0, 2.5 m gap to a 2.0 m box, curved roll-out; humps
home. Target 8-12, 90 s.

### Hard

**H1 `h1-wheelie-wire` Wheelie Wire** — TEACHES sustained wheelie / rear-wheel balance
across slotted rails (0.7 m kill pits a grounded front wheel drops into) and the lip climb.
482 m, CP 28 / 122 / 267 / 353 / 416 (round 4: 15 m run-up to every wall and to the long wire). Rollers with the front down; 8 slots at 2.5 m; wave +
humps; 5 m run-up, wall 1.0 with lip -> 6 slots at 3.0; rollers, tabletop, 2 m wave, humps;
wall 1.2 -> 6 slots
at 2.5; 2 m wave, humps; the long wire: 10 slots at 2.0; rollers; DEMANDS: 6 m run-up, wall
1.4 with a 0.2 lip straight into 5 slots at 2.0 and a 3 m gap from the rear wheel (camera
`low` cut); humps home. Target 10-18, 110 s.

**H2 `h2-gap-chain` Gap Chain** — TEACHES precision gaps with speed control on kicker
platforms (camera `high34`). 495 m, CP 28 / 173 / 308 / 396 (round 4: 15 m run-up into every chain). Chain A: gaps 4/3/5/2 onto
5-4.5-5 m platforms; rollers, wave, humps, 2 m wave; chain B: gaps 4/3/4/2/3 with platforms stepping up 0.3 m
each (rear first mandatory), curved roll-out; humps, tabletop; chain D: gaps 5/4/5 on 5 m
platforms at 1.2, fast and wide; rollers; DEMANDS chain C: gaps 4/5/3/4/2 on 3.5 m platforms,
then a 5 m gap onto a see-saw and a 3 m gap off it; humps home. Target 14-22, 120 s.

**H3 `h3-fire-line` Fire Line** — TEACHES speed commitment (clear a row of burning
barrels from a 2.0 m kicker: any body part through the fire is a hazard fault) and the hard
stop after. 473 m, CP 28 / 172 / 286 / 376 (round 4: 8 m past each tabletop before the checkpoint). 20 m run-up, kicker over 4 barrels; rollers,
humps, 2 m wave, tabletop; 20 m run-up, kicker over 6 barrels onto a landing ramp, 8 m brake zone, 0.7 m kerb
hop; wave, tabletop; kicker over 5 barrels, brake, hump, 0.5 kerb (the stop-and-hop at half
stakes); rollers; DEMANDS: 20 m run-up, kicker over a 2 m gap AND 6 barrels, landing ramp,
brake to walking pace, 0.3 hump, 2 m low-speed hop gap, 0.7 kerb; humps home. Target 18-25,
125 s.

### Extreme

**X1 `x1-vertical-limit` Vertical Limit** — TEACHES near-vertical planks (hang over the
bars, tap throttle) and pole-top rear-wheel hops. 439 m, CP 24 / 170 / 288 / 360 (round 4: 20 m before each steep plank, 15 m before the pole pit; the lip climb keeps its 3 m run-in, see the checkpoint rule). All planks
filleted. Planks 50 and 55 deg onto boxes; rollers, wave, humps, 2 m wave; poles 1.2 -> 2.4 at 1.8 m pitch;
plank 58 deg onto a 3.6 box; humps, tabletop; wall 1.2 + plank 56 deg from its top, poles
descending 4.4 -> 2.0; rollers, wave; DEMANDS: 8 m run-in, plank 60 deg (rise 4.5), three
pole caps at 4.5, 4 m gap onto a 3 m plank at -30 deg; humps home. Target 30-45, 140 s.

**X2 `x2-pipe-dream` Pipe Dream** — TEACHES spinning drums as slippery platforms with
gaps and see-saw drops. 367 m, CP 24 / 141 / 237 / 292 (round 4: every drum-top gap is 2 m, the 4 m gap launches from a 15 m platform, 15 m before the kerb). `drumStep` spinning 0.8 / 3 m gap /
box (the round-2 first obstacle was a bare 1.6 m drum behind a 0.5 m kicker: unrideable by
geometry); log pyramid (`logStep`); `drumStep` spinning 0.8 with exit; rollers, 2 m wave,
humps; see-saw 8/2.0, 2 m,
`drumStep` 1.0 (shelf 1.4), pole 1.5, 1.8 box with a kicker, 4 m gap onto a spinning 1.0;
humps, wave; the pipe run: `drumStep` spinning 0.9 then four 0.9 spinning drums with 1.5 m
gaps (camera `high34`); rollers; DEMANDS: see-saw 8/2.0, `drumStep` spinning 1.0, 2 m gap
onto a spinning 0.8, 2.5 m gap off it, 0.7 kerb (3 m / 4 m gaps were a 34-attempt wall: a
spinning top cannot be pumped and the see-saw leaves ~5 m/s); humps home. Target 40-60, 150 s.

**X3 `x3-gauntlet` The Gauntlet** — DEMANDS everything in curriculum order, no teaching
zone. 596 m, CP 28 / 145 / 224 / 295 / 370 / 439 / 522 (round 4: 15 / 20 m run-ups, 14 m past every landing before a checkpoint, drum-top gaps 2 m). B3 kicker gap, rollers, E1 48 deg
plank, E2 double gap | E3 stairs into a gap, M1 0.55 kerb hop + gap, M2 `drumStep` spinning
drum, wave | M3 see-saw landing + plank, H1 lip climb + 4 slots | H2 four-gap chain on 3.5 m
platforms, humps | H3 fire over a gap + brake + kerb | X1 60 deg plank + three 4.5 poles, X2
see-saw -> `drumStep` spinning 1.0 -> 2 m gap -> spinning 0.8 -> 2.5 m gap | finale (unseen):
6 x 2.5 kicker over a 6 m gap landing on a see-saw 8/1.0 at ~12 m/s, `drumStep` spinning 1.0,
2 m gap onto three pole caps at 1.8 (0.2 under the drum top), 3 m gap onto a 4 m plank at
-25 deg. Target 60-80, 200 s.

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
- **Round 5** — hard/extreme bot-clean times are still under the 90-150 s corpus band: another
  flow pass or a second set piece per hard track once render confirms the triangle budget at
  400-600 m.
