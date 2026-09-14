# Track system and curriculum

Status: round 1 built. Owner: tracks. Consumers: physics, render, audio, harness, game.
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
| crash | head/torso touches a collider or hazard, or y < oobY; over-rotation alone is not a crash | pit hazards stop 0.3 m below the lip so a skimming wheel does not fault |
| restart -> riding | one tick, one frame | every checkpoint has >= 3 m of flat run-in |

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
| `gap` | width 3, depth 3, hazard water/kill | pit cut into the ground chain (walls lean in 0.05 m so x stays monotone) + hazard zone [lip - depth, lip - 0.3] | width |
| `wall` | height 1, width 0.4, lip 0, surface concrete | solid slab; `lip` adds a one-way overhang polyline projecting back from the top front edge (front-wheel grab) | width |
| `seesaw` | length 6, height 1 (pivot), thickness 0.12, angleDeg 0 (auto), mass 60, surface wood | `ColliderSeesaw`; auto maxAngle = asin((height - t/2) / half) capped 30 deg so an end rests on the ground | length |
| `logpile` | radius 0.3, count 3 (bottom row), rows 1, spacing 0, surface wood | circles in a pyramid, row pitch r*sqrt3 | count * 2r + (count-1) spacing |
| `stair` | count 5, height 0.3 (rise), length 0.45 (run), direction up/down, surface concrete | one solid staircase outline | count * run |
| `box` | width 4, height 1, surface metal | solid container / platform | width |
| `pole` | height 1.5, radius 0.25 (cap), width 0.16 (shaft), count 1, spacing 1.8, surface metal | `ColliderBox` shaft + circle cap whose top is at `height` | 2r + (count-1) spacing |
| `barrel` | radius 0.3, height 0.9, count 1, spacing 0.7, burning true, surface metal | `ColliderBox` per barrel + `fire` hazard 0.8 m tall above each burning one | 2r + (count-1) spacing |
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
the cursor; obstacle ops place at the cursor and advance by the footprint; `tabletop(up,
top, height, down)` = ramp + box + ramp. Consecutive flats merge into one profile segment.
Obstacles pin the profile at both ends so a slope after a box starts after the box.
`plank({ angleDeg, rise })` computes the board length; `steepPlank({ angleDeg, rise })` puts a
1.2 x 0.35 concave ramp fillet under the foot and climbs the remaining rise. The cursor is
kept on the 1e-6 grid so computed footprint ends and the next `pos.x` quantise identically.
`checkpoint()` records the spawn
(rear-wheel contact at cursor + 0.5, angle 0); `camera(key)` opens a `CameraKey` that runs
to the next key or the finish; `hint(text)` adds a HUD hint; `finish(runout = 10)` sets
`finishX` at the cursor, adds the run-out and a 35 deg end bank, and validates.

Builder-enforced: solids and gaps stand on level ground and never overlap each other's
footprints; ground slopes <= 40 deg (steeper is a plank or ramp); profile x increasing;
`meta()` present. `validateSpawns` (CONTRACT §2.4): start and every checkpoint spawn lies
on ONE flat profile segment covering rear wheel - 0.4 m to front wheel + 0.6 m, and no solid
or gap lies under it.

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
Every track has 2-6 checkpoints, each followed by >= 3 m of flat run-in. Attempts bands are
the stranger attempts-to-clear target (harness-metrics.md §3 measures them):
Beginner 1-2 | Easy 2-6 | Medium 5-12 | Hard 10-25 | Extreme 30-80.

Biomes: Beginner industrial (warehouse amber, HUD hints on); Easy canyon; Medium
industrial / snow / foundry; Hard nightCity / nightCity / foundry; Extreme snow / foundry /
foundry. `loop` is cut from the vocabulary, so H3 (was "Loop Line") is the speed-commit
track over fire barrels; drums spin in place, so M2 / X2 are about balancing on a spinning
surface rather than riding a translating spool.

### Beginner

**B1 `b1-first-ride` First Ride** — TEACHES throttle control. Hints "HOLD THROTTLE",
"SLOW DOWN". 133 m, CP 42 / 88. Hill (8.5 deg) and smooth descent; 3 rollers (0.3 m);
tabletop 6/8/1.0 m; DEMANDS: 11 deg descent, 8 m brake zone, a half-sunk 0.5 m drum bump
you must brake for, and a rollable 0.3 m kerb. Target 1 attempt, 18 s.

**B2 `b2-lean-back` Lean Back** — TEACHES weight shift on bumps and drops. 128 m,
CP 29 / 68 / 90. Single logs, a log pair; ramp onto a 0.5 m kerb (drop 0.5); ramp onto a
1.0 m box (drop 1.0); ramp + box + 4-step stair down; DEMANDS: 8 x 1.8 ramp onto a 10 m
box with a 1.8 m drop onto a downslope (camera `low`). Target 1-2, 22 s.

**B3 `b3-kicker-row` Kicker Row** — TEACHES the jump: throttle to the lip, level in the
air, land rear first. 142 m, CP 28 / 72 / 100. Kickers 4 x 1.2 and 4 x 1.5 (curve 0.3),
uphill landing on a 0.8 m tabletop; 5 x 2.0 kicker over three unlit barrels onto a convex
landing ramp (camera `high34`); DEMANDS: 10 m run-up, 5 x 2.0 kicker over a 5 m gap onto a
0.4 m box. Target 1-2, 26 s.

### Easy

**E1 `e1-uphill-weight` Uphill Weight** — TEACHES lean forward on steep planks. 107 m,
CP 28 / 53 / 78. Plank 30 deg onto a 3.0 m box, 6 steps down; plank 40 deg onto 3.6 m,
quarter-pipe roll-out; DEMANDS: filleted plank 48 deg (rise 3.7) from a 3 m run-in, then a
40 deg plank descent. Target 2-4, 30 s.

**E2 `e2-rear-wheel-first` Rear Wheel First** — TEACHES rear-wheel-first gap landings.
172 m, CP 24 / 73 / 120. 4 x 0.8 ramp / 3 m gap; 5 x 1.2 / 4 m gap onto an uphill landing
ramp; 12 m run-up, 5 x 1.5 / 6 m gap onto a 1.0 m box; DEMANDS: 5 x 1.5 / 5 m gap onto a
6 m x 0.6 box carrying a 3 x 1.0 ramp straight into a 6 m gap. Target 3-5, 34 s.

**E3 `e3-stairway` Stairway** — TEACHES stairs: throttle pulses up, brake down without a
stoppie. 94 m, CP 28 / 48 / 68. 5 x (0.30/0.45) up, box, 5 down; 6 x (0.40/0.45) up, 8
down past unlit barrels; DEMANDS: 7 x (0.45/0.40) up (48 deg envelope), 9 x (0.35/0.40)
down into a 2 m gap. Target 3-6, 38 s.

### Medium

**M1 `m1-hop-up` Hop Up** — TEACHES the bunny hop onto ledges (preload lean back +
throttle, snap forward; there is no hop button). 101 m, CP 18 / 43 / 63. Kerbs 0.35
(rollable), 0.45 (stationary hop), 0.6 (rolling hop), 0.6 kerb into a 1.5 m gap;
DEMANDS: plank 25 deg onto a 2.0 m box, 2.5 m gap to a pole cap at 2.0, 2.5 m gap onto a
2.3 m box (camera `side-tight` cut). Target 5-9, 42 s.

**M2 `m2-drum-roll` Drum Roll** — TEACHES drum crossings and balance on a spinning
drum. 114 m, CP 24 / 50 / 73. Half-sunk 0.8 drum, 0.8 drum on the ground, 3-row log
pyramid; 1.0 drum / 2 m gap / 1.0 drum, then a 0.9 spinning drum; DEMANDS: 1.6 m box ->
1.0 spinning drum (top at 2.0) -> 1.6 m box, 4-row log pyramid, see-saw exit. Target 6-12,
52 s.

**M3 `m3-see-saw` See-Saw** — TEACHES see-saw timing and thin landings. 136 m,
CP 28 / 59 / 88. See-saws 6/0.8 and 8/1.2 (camera `low`); see-saw 6/1.5, ramp / 3 m gap /
4 m plank at 1.5; DEMANDS: ramp / 4 m gap landing on a see-saw 6/2.0, 3 m gap to a 3 m
plank at 2.0, 2.5 m gap to a 2.0 m box, curved roll-out. Target 8-12, 58 s.

### Hard

**H1 `h1-wheelie-wire` Wheelie Wire** — TEACHES sustained wheelie / rear-wheel balance
across slotted rails (0.7 m kill pits a grounded front wheel drops into) and the lip climb.
180 m, CP 28 / 77 / 114 / 146. Rollers with the front down; 8 slots at 2.5 m; wall 1.2 with
lip -> 6 slots at 3.0; wall 1.4 -> 6 slots at 2.5; DEMANDS: wall 1.6 with lip straight into
5 slots at 2.0 and a 3 m gap from the rear wheel (camera `low` cut). Target 10-18, 62 s.

**H2 `h2-gap-chain` Gap Chain** — TEACHES precision gaps with speed control on 3-5 m
platforms (camera `high34`). 223 m, CP 28 / 71 / 146. Chain A: gaps 4/3/5/2 onto 5-4-5 m
platforms; chain B: gaps 5/3/6/2/4 with platforms stepping up 0.4 m each (rear first
mandatory), curved roll-out; DEMANDS chain C: gaps 4/6/3/5/2/6 on 3 m platforms, then a
see-saw launch over a 4 m gap. Target 14-22, 72 s.

**H3 `h3-fire-line` Fire Line** — TEACHES speed commitment (clear a row of burning
barrels from a kicker: the torso through the fire is a hazard fault) and the hard stop
after. 195 m, CP 28 / 73 / 125. 12 m run-up, 5 x 1.5 kicker over 4 barrels; 14 m run-up,
5 x 2.0 kicker over 6 barrels onto a landing ramp, 8 m brake zone, 0.7 m kerb hop;
DEMANDS: 16 m run-up, kicker over a 3 m gap AND 6 barrels, landing ramp, brake to walking
pace, sunk drum bump, 2 m low-speed hop gap, 0.7 kerb. Target 18-25, 78 s.

### Extreme

**X1 `x1-vertical-limit` Vertical Limit** — TEACHES near-vertical planks (hang over the
bars, tap throttle) and pole-top rear-wheel hops. 182 m, CP 24 / 65 / 107 / 133. All planks
are filleted at the foot. Planks 50 and 55 deg onto boxes; poles 1.2 -> 2.4 at 1.8 m pitch; plank 58 deg ending under a
1.0 wall with lip (front-wheel grab); wall 1.2 + plank 56 deg from its top, poles descending
4.4 -> 2.0; DEMANDS: 8 m run-in, plank 60 deg (rise 4.5; hop at the foot), three pole caps
at 4.5, 4 m gap onto a 3 m plank at -30 deg. Target 30-45, 95 s.

**X2 `x2-pipe-dream` Pipe Dream** — TEACHES spinning drums as slippery platforms with
gaps and see-saw drops. 157 m, CP 24 / 58 / 91 / 117. Spinning 1.0 drum / 3 m gap / box;
log pyramid; spinning 0.8; see-saw 8/2.0 dropping onto a 1.2 drum, pole 1.5, 1.8 box, 5 m
gap onto a spinning drum; the pipe run: five 0.9 spinning drums with 2 m gaps (camera
`high34`); DEMANDS: see-saw 6/2.5 onto a spinning 1.0, 3 m gap onto a spinning 0.8, 4 m gap
off it, 0.7 kerb. Target 40-60, 125 s.

**X3 `x3-gauntlet` The Gauntlet** — DEMANDS everything in curriculum order, no teaching
zone. 410 m, CP 28 / 113 / 146 / 232 / 287 / 342. B3 kicker gap, E1 48 deg plank, E2
double gap | E3 stairs into a gap, M1 kerb hop + gap, M2 spinning drum | M3 see-saw landing
+ plank, H1 lip climb + 4 slots, H2 five-gap chain | H3 fire over a gap + brake + kerb | X1
60 deg plank + three 4.5 poles, X2 see-saw -> spinning drums -> 4 m gap | finale (unseen):
6 x 2.5 kicker over a 6 m gap landing on a see-saw 8/1.0 at ~12 m/s, spinning drum, 6 m
gap onto three pole caps at 3.0, 3 m gap onto a 4 m plank at -35 deg. Target 60-80, 165 s.

### Curriculum summary (compiled, round 1)

| id | tier | technique | length m | obstacles | CPs | attempts | target s |
|---|---|---|---:|---:|---:|---:|---:|
| b1-first-ride | beginner | throttle control | 133 | 5 | 2 | 1 | 18 |
| b2-lean-back | beginner | weight shift on drops | 128 | 12 | 3 | 1-2 | 22 |
| b3-kicker-row | beginner | jump and level in the air | 142 | 11 | 3 | 1-2 | 26 |
| e1-uphill-weight | easy | lean forward on steep climbs | 108 | 10 | 3 | 2-4 | 30 |
| e2-rear-wheel-first | easy | rear-wheel-first gap landing | 172 | 16 | 3 | 3-5 | 34 |
| e3-stairway | easy | stairs: pulse up, brake down | 94 | 11 | 3 | 3-6 | 38 |
| m1-hop-up | medium | bunny hop onto ledges | 101 | 12 | 3 | 5-9 | 42 |
| m2-drum-roll | medium | drum crossing and balance | 114 | 13 | 3 | 6-12 | 52 |
| m3-see-saw | medium | see-saw timing and thin landings | 136 | 14 | 3 | 8-12 | 58 |
| h1-wheelie-wire | hard | sustained wheelie and the lip climb | 180 | 29 | 4 | 10-18 | 62 |
| h2-gap-chain | hard | gap chains: read the width, set the speed | 223 | 34 | 3 | 14-22 | 72 |
| h3-fire-line | hard | commit at speed over fire, then stop hard | 199 | 13 | 3 | 18-25 | 78 |
| x1-vertical-limit | extreme | near-vertical planks and pole-top hops | 182 | 34 | 4 | 30-45 | 95 |
| x2-pipe-dream | extreme | spinning drums with gaps and see-saw drops | 157 | 27 | 4 | 40-60 | 125 |
| x3-gauntlet | extreme | everything, in order | 410 | 67 | 6 | 60-80 | 165 |

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
- **Round 2b** — after the bot/physics sweep names the physically impossible obstacles:
  re-author run-ups and gaps against measured accel / jump range, first bot attempts per
  checkpoint segment; shorten or lengthen tracks toward the corpus clean times (beginner
  16-19 s).
- **Round 3** — stranger medians for Beginner + Easy; fix the two worst segments per track;
  ship gate on `b1` and `x3`.
- **Later** — camera keys tuned against the render clips; X3 trimmed under 400 m if the bot
  clean time exceeds 165 s.
