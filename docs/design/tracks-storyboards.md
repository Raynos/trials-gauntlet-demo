# Hard / extreme storyboards (mega build wave 1, P3)

Status: wave 1 — DESIGN ONLY. No course in `src/tracks/courses/` changes until physics tags
`physics-v2` (MEGA_PLAN wave 2). Owner: tracks. Readers: physics (which envelope numbers each
beat leans on), render (set pieces, arches, tunnels, camera keys), harness (the acceptance each
track will be held to), core (the `meta.setPieces` request).

Why: the outside review said hard / extreme are "shaped to appease the bot rather than
designed". Round 5 / 6 fixed every death cluster with a probe-cleared shape and the result is
six tracks that are lists of that shape: H3 is four identical fire kickers, H1 five slot rows on
flat ground, X1 four sawtooth planks that give every metre back. Nothing rises, nothing drops
into the unknown, nobody is watching. Real Trials tracks (reference notes, all three corpora)
are built flow -> technical -> set piece -> breather -> demand, they use HEIGHT (the world is a
climb or a descent, not a ribbon), they hide the next feature (drops into shadowed scaffold,
tunnels, crests), and they put a crowd, a gate or a pyro at every moment they want you to
remember. This document redesigns h1-h3 / x1-x3 to that grammar while keeping every shape the
bots have cleared. Section 8 is the sanity pass on m1-m3.

## Round 7 status (physics v2) — what of these storyboards is in the courses

Tracks round 7 re-authored every course to the measured v2 envelope (`tracks.md` §0) and took the storyboard
pieces that cost no geometry: `setPiece` markers (`start` / `finish` on all six, `balance` H1 wire, `air` H2
chain C, `fire` on every H3 row and X3's, `climb` on X1's four faces and X3's opener / stack, `balance` X2's
pipe run), start / finish gantries (`arch` girder / finish) and H1's crowd bridge, and the camera pitch 12 deg
on the X1 / X3 faces. The v2 measurements moved several storyboard numbers: every 29 deg see-saw is a crash
board (§5 X2's two 8x2.0 and X3's are 8x1.6), the 22 deg fire lips are straight (a curve-0.3 lip loops the
gas-through-the-lip rider below 10 m/s), the lip-wall B line is a 0.4 m hop (0.5 is outside the v2 gas-hop
band), 45 deg faces stand on a `kickerPlank` foot and 50 deg+ faces are the skill-3 bot's hop move only
(`[Pro?]` rows: the Pro tops 50 @ 8 m/s over the 2.4 x 0.8 fillet, nothing tops 55-60 but the bot). Still
owed from §5's order: H1's roof climbs (`smooth(28, 2)` height grammar) and the drop into the scaffold
tunnel, H3's second tunnel row and re-sequencing, X1's summit cap probe, H2's apron jump, the validators
(`maxRepeats`, `breatherAfterDemand`, `density`, `story`, `setPieces`, `heightBudget`, `lineB`,
`checkpointSpacing`), and every `[wave 2 probe]` except the ones §0 now answers (the 40 deg roll-off + 7 deg
descent at 6 / 10 / 13 m/s is measured as the drop table: neutral rides, a held +0.5 does not).

## Round 9 status — the storyboards are the courses (with the v2 amendments the reflex and the bot forced)

Built (`tracks.md` §2 round-9 table): H1 beats 1-8 (roof climbs, the wire, the roll-off into the scaffold tunnel; the wire tightens 2.5 -> 2.0 and
the demand wall has an 8 m top), H2 beats 1-9 (the tunnel under the stacks, chain B stepping up, the stack climb, the crane jump, the stands; the
kicker is 6 x 1.5 over 5 m of water — §0 sizing — and chain C ends on a landing incline, not the see-saw), H3 beats 1-9 (the pour pair in the 60 m
foundry tunnel, the demand stop without the hop-gap), X1 beats 1-8 with **three 45 deg faces instead of four 45-60 deg ones** (on v2 nothing but the
skill-3 bot's hop move tops 50 deg, and each face's exit costs the reflex ~5 attempts — four summed past the band), the caps as a taught -> rising ->
summit-ridge row at box height rather than 1.7 m hops from a standing start (0/9), the ice cave and a 56 m glissade (the 800 m cap), X2 beats 1-9 with
a three-top pipe run (five tops walled every seed) and the melt pit, X3 with the grounded cascade entry and the summit stack (the 60 deg plank is
gone with X1's). Every `[wave 2 probe]` is answered in `tracks.md` §0 (round 9 rows). Not built: the `[Pro?]` re-probe (every number is Rookie) and
the m1-m3 gantries (§8).

## 0. Conventions and constraints used below

- Intended bike: **Pro** (no wheelie assist, real CdA, sharper throttle — MEGA_PLAN P1). Every
  number quoted is the round-2/4/5 measured envelope from `tracks.md` §0 and is **re-measured
  on `physics-v2` before a metre is authored** (wave 2 step 0). Where Pro is expected to move a
  number it is marked `[Pro?]`.
- Clean-time targets are for a competent human (stranger clean ~1.5-2.5x the bot, harness-metrics
  §3): **hard 45-60 s, extreme 60-90 s**. The skill-3 bot rides flow at ~13 m/s and technical at
  7-8 m/s, so that is a bot clean of ~30-40 s (hard, 520-620 m) and ~40-55 s (extreme, 600-800 m).
  X3 stays at 500 m on purpose (round 6: 773 m did not finish inside the bot wall).
- Pacing is written as `flow : technical : breather` in metres. Flow = rollers / waves / bumps /
  tabletops / climbs and descents that teach nothing; technical = the taught feature and its
  run-up; breather = flat run-ins after checkpoints and landing zones. Target hard ~50:35:15,
  extreme ~40:45:15.
- Height is built with ground ops (`smooth` / `slope`, <= 40 deg, crest-grounded at 13 m/s via
  `FEEL.smoothLengthFor`: a 2 m climb is >= 26 m long) BETWEEN sections, never right before a
  feature (the checkpoint rule credits flat-or-descending run-up only). A **drop** is a 40 deg
  ground roll-off (3.6 m per 3 m) into a 7 deg descent: slow = ride it down (B line), fast = fly
  and land on falling ground (the B2 box -> down-ramp shape the reflex bot clears 1,1,1 at 1.8 m).
- Every beat names: SEE (what the camera shows), DEMAND (the technique), FAIL (what the death
  looks like), RECOVER (where you respawn and what the run-in gives you).
- Set pieces are `meta.setPieces` ranges (`setPiece(kind, label)` in the DSL) plus `arch` /
  `tunnel` decor (no colliders; `tracks.md` §1.2). Render reacts to the kind: `crowd` = stands +
  spotlights (rising clip 02), `tunnel` = roof + interior lights (rising clip 11's shadowed
  scaffold), `drop` / `air` = camera pull-out and dust (evolution clips 12 / 14), `fire` = pyro +
  under-light (rising clips 12 / 13), `climb` / `balance` = side-tight camera, `start` /
  `finish` = gantry, countdown / confetti (rising clips 02 / 07).
- ASCII profiles: `_` flat, `/` `\` slopes, `#` solid box / wall, `|` plank, `o` drum, `^` kicker,
  `~` water, `x` kill pit, `*` fire, `T` see-saw pivot, `!` pole cap, `[CPn]` checkpoint,
  `{...}` tunnel, `A` arch. x in metres under the profile; the vertical scale is exaggerated.
- Clip citations: `tech-NN` = `reference/techniques/clips/NN-*`, `evo-NN` =
  `reference/evolution-gameplay/`, `ris-NN` = `reference/rising-visuals/` (notes in
  `reference/notes/*.md`).

## 1. H1 `h1-wheelie-wire` — "Rooftop Wire" (nightCity, Pro, band 10-18, ~600 m, human 50-55 s)

**Premise.** A rooftop run across the night city. The bike lives on its rear wheel over the
gaps between roofs, the roofline climbs six metres over the track, and the last wire runs along
a parapet with the city below — then the roof ends.

**Technique story.** Sustained wheelie / rear-wheel balance over kill slots (tech-14: 4.1 m/s at
30-45 deg pitch, correction cycle 1.5-2 s; tech-03: 4 s rear-wheel balance), then the lip climb
(tech-12 front-wheel lifts onto a box). Slot pitch tightens 2.5 -> 3.0 -> 2.5 -> 2.0 m, the wall
in front rises 1.0 -> 1.2 -> 1.4, and each section is one roof higher. The B line on every wall
(the `steppedWall` ramp, 0.5 m hop from its top) stays: round 5's finding that a wall of one death
means the feature has no fallback line.

```
 y
 6m                                                                      [CP3]_#_xx_xx_xx_xx_xx_xx_xx_xx_xx_xx_A_
 5m                                                                    _/       The Wire: 10 slots @ 2.0        \  40 deg roll-off
 4m                                          [CP2]_#_x__x__x__x__x__x_/                                          \
 3m                                        _/     6 slots @ 2.5                                                    \___
 2m                    [CP1]_#_x__x__x__x__x__x___/                                                                     \_____ 7 deg, {scaffold tunnel}
 1m                  _/     6 slots @ 3.0                                                                                      \
 0m A____~~~~_xx_xx_xx_xx_xx_xx_xx_xx_/                                                                                          [CP4]_____A___A_
    0  28 31 47 51  8 slots @ 2.5  71   121 149 155 171 180 198   254 282 288 304 312 327   365 393 399 415 422 442 448 452  476 482  540 600
       grid rollers   teach          flow  climb    wall 1.0      climb    wall 1.2         climb    wall 1.4  wire   drop      home  finish
```
(Walls `#` stand at the foot of each roof; slots `x` are 0.7 m kill pits; every climb is a
`smooth(28, 2.0)` inside the flow, crest-grounded at 16 m/s.)

| beat | x | SEE | DEMAND | FAIL | RECOVER |
|---|---|---|---|---|---|
| 1 Grid | 0-51 | start gantry `A` + crowd (`setPiece('start')`), spotlights, the skyline as the far fog tier; 16 m of 0.15 m rollers | front wheel DOWN, throttle-modulation warm-up (nothing can kill you) | — | CP0 at 28 |
| 2 First wire | 51-71 | 8 slots at 2.5 m on the ground level; red safety rails either side (render), the parapet edge in the mid tier | front up before the first slot, hold 30-45 deg for 20 m, throttle pulses (one hop per 0.4-0.5 s, evo obs. 10) | front wheel drops in a slot = `kill` hazard, hard cut | CP0 at 28, 23 m of run-in (rule: 16) |
| 3 Up one roof | 71-155 | wave + bumps, then `smooth(28, 2)` up onto the next roof; CP1 at 155 on the new level | nothing — the breather; the climb cannot launch | — | — |
| 4 Wall and wire | 171-198 | `steppedWall` 1.0 (lip 0.15) three metres before 6 slots at 3.0 — the wider pitch is the lesson: you may drop the front between slots here | A line: front onto the lip at ~5 m/s, hop the rear; B line: the ramp and a 0.5 m hop | lip miss = bounce back onto the flat (no fault, ride again); front in a slot = kill | CP1 at 155, 16 m |
| 5 Up two roofs | 198-399 | rollers, tabletop, `smooth(28, 2)`, CP2 at 288; `steppedWall` 1.2 + 6 slots at 2.5 (304-327), wave, `smooth(28, 2)`, CP3 at 399 — the roofline is now +6 | the 1.2 wall / 2.5 pitch is the repeat with rising stakes | as beat 4 | CP2 at 288, 16 m |
| 6 The Wire (SET PIECE, `balance`) | 415-448 | `steppedWall` 1.4 (lip 0.2) at 415, then **10 slots at 2.0 m along the parapet**, camera `low` cut (today's demand camera), crowd bridge `arch({ style: 'crowd' })` over slot 8, spotlights sweeping, the whole city below | the full wheelie hold, 20 m, at the tightest pitch, straight after the tallest lip | kill on any slot; lip bounce | CP3 at 399, 16 m to the wall; the wire has NO checkpoint of its own — a fall means the wall again |
| 7 The Drop (`drop`) | 448-476 | the roof ends: a 40 deg roll-off of 3 m (`slope(3.6, -3)`), then 24 m of 7 deg descent (`slope(24, -3)`) into a lit scaffold `tunnel` (ris-11: the drop into shadowed scaffold), camera `high34` pull-out, dust on touchdown | nothing technical: slow = ride the roll-off (B line), fast = 0.7 s of air onto falling ground (the B2 box -> down-ramp shape, reflex 1,1,1 at 1.8 m) | over-rotation on the roll-off at speed — lean forward | CP4 at 482 at the tunnel exit (rule: >= 8 m past the landing zone, which ends at ~476) |
| 8 Home | 482-600 | 3 m of flat, bumps, crowd `arch` at 540, finish gantry `A` at 600, confetti | — | — | — |

**Pacing** ~ flow 300 : technical 190 : breather 110 (50:32:18). Bot-clean ~38 s [Pro?], human
~52 s. **Checkpoints** 28 / 155 / 288 / 399 / 482 (127 / 133 / 111 / 83 m apart): every one on a
flat roof level >= 16 m before the next wall and >= 8 m after a landing. **Camera** keys: `side`
(zoomBias -0.3) default; `low` cut for the wire; `high34` for the drop; `side-tight` in the
tunnel. **Attempts** 10-18 (unchanged: the walls and slot rows are round 5's shapes; the climbs
add no deaths; the drop is the B2 shape — `[wave 2 probe: 40 deg roll-off + 7 deg descent at 6 /
10 / 13 m/s, reflex average x3, expect 1,1,1]`).

Modelled on: tech-14 (wire cadence), tech-12 (lip), ris-11 (the drop into scaffold), ris-02
(start crowd), evo-07 (tower drop into the finish gate).

## 2. H2 `h2-gap-chain` — "Container Yard" (nightCity, Pro, band 14-22, ~590 m, human 55-60 s)

**Premise.** A night harbour: every platform is a container, every gap is black water, the
chains climb the stacks, and from the top of the stack the crane-side jump launches you across
the whole yard.

**Technique story.** Precision gaps on kicker platforms — read the width, set the speed
(evo-06: bunny-hop gap landing rear-wheel-first; tech-07: uphill landing 30 deg nose-up). The
lesson escalates by what you must read: equal gaps (A) -> stepping UP so rear-first is mandatory
(B) -> the hero jump where speed is the only input (the crane jump, replacing round 5's chain D)
-> short platforms with a see-saw finish (C, the demand). Four technical beats, no two chains
the same length.

```
 y
 3.4m                                                                          ^
 2.4m                                                          #____[CP2]_____/ \~~~~~~~~___
 2m                                     __^~~~^__^~~~^_______/     climb    kicker 8 m   \__\
 1.5m                             __^~~~^        B: +0.3 each                            gapLanding \_____
 1m         ^~~~^__^~~~^__^~~~^__/                                                          1.0          \____   ^~~^__^~~^__^~~^__^~~T~~^__
 0m A_[CP0]_/  A: 8 m platforms, 3 m gaps  \____{concrete tunnel}____[CP1]_/                                    [CP3]_/  C: 5.5 m platforms, see-saw  \_A_
    0   28  44    48  56  67  78   92  104     130     160   200 215 231 236 240 247 250 257 260 267 269 276 279 300  312  342 348 374 379 387 407 413 443 455 481 497   550   590
```

| beat | x | SEE | DEMAND | FAIL | RECOVER |
|---|---|---|---|---|---|
| 1 Grid | 0-44 | start gantry, crowd on the quay, crane silhouettes as the far tier, sodium lamps on black water | — | — | CP0 at 28 |
| 2 Chain A | 44-92 | 4 x 1.0 kicker, then three 8 m lipped platforms (0.8) with 3 / 3 / 3 / 2 m gaps, camera `high34` | one speed for equal gaps: ~9 m/s off a 1.5 x 0.4 kicker reaches 5 m; a short jump meets the 6-11 deg lip, not a face | short = water, hard cut; long = the next kicker face (rare) | CP0, 16 m |
| 3 The tunnel | 92-215 | rollers, wave; the flow runs THROUGH a 30 m `tunnel({ style: 'concrete' })` under the container stacks (dark, headlight cone, ris-09) and out into the crane yard; CP1 at 215 | nothing technical | — | — |
| 4 Chain B | 231-300 | 5 x 1.2 kicker, 7 m platforms stepping up 1.2 / 1.5 / 1.8 / 2.1 with 4 / 3 / 3 / 2 / 3 m gaps, a 2 x 0.4 kicker onto the 2.4 m stack top, 10 m curve-0.3 down-ramp (round 5 shape) | rear-first mandatory: each landing is 0.3 above the launch (tech-07) | nose-down onto a lip = endo; short = water | CP1 at 215, 16 m |
| 5 Up the stack | 300-348 | 12 m flat, `smooth(30, 2.4)` ground climb onto the crane apron (the yard drops away to the left), 6 m flat, CP2 at 348 on the apron | — | — | — |
| 6 The Crane Jump (SET PIECE, `air`) | 348-413 | **26 m of apron (runupFor(12 m/s) = 24.5 m), 5 x 2.0 (22 deg) kicker over 8 m of water onto `gapLanding` 1.0 (6 up / 6 top / 8 down)**, camera `high34` zoom-out + orbit toward the harbour lights (evo-14 airtime camera, ris-03 big gap toward the light): ~1.0 s of air, 12 m of range at 13 m/s against an 8 m gap whose landing is an up-ramp — B3's demand shape (0 `novice` deaths at 4 m) at hard-tier scale | commit: full gas from the spawn, off the gas at the lip, level in the air, rear-first on the incline | short = water (the only fail); over-speed lands on the 8 m down-ramp | CP2 at 348 — the jump is its own push, 26 m of flat |
| 7 Down and breathe | 413-481 | 6 m flat, `smooth(30, -2.4)` back down to the yard, rollers, crowd `arch` at 470 (the stands face the jump), CP3 at 481 | — | — | — |
| 8 Chain C (DEMAND) | 497-550 | 4 x 1.0 kicker, four 5.5 m platforms (2 m lips) with 4 / 4 / 3 / 4 m gaps, a 5 m see-saw (land on the resting end, it tips as you ride out — tech-16/17), a 3 m gap, camera `side` cut | one bike length of slack per platform; the see-saw ride-off at ~5 m/s then the last gap | water | CP3 at 481, 16 m |
| 9 Home | 550-590 | bumps, finish gantry at 590, confetti | — | — | — |

**Pacing** ~ flow 270 : technical 210 : breather 110 (46:36:18). Bot-clean ~40 s, human ~58 s.
**Checkpoints** 28 / 215 / 348 / 481 (187 / 133 / 133 m apart). **Attempts** 14-22. Chains A, B,
C are round 5's exact platform / lip / gap numbers; the crane jump is new exposure — `[wave 2
probe: 5 x 2.0 kicker from 26 m of flat over 6 / 8 / 10 m onto gapLanding 1.0, reflex good and
average x3; author the widest gap that clears <= 3]`. `[Pro?]`: real CdA trims top speed, so the
26 m apron is re-measured with `runupFor` on physics-v2.

## 3. H3 `h3-fire-line` — "The Pour" (foundry, Pro, band 18-25, ~580 m, human 50-55 s)

**Premise.** A foundry pour line. Every fire row sits under a ladle, the rows get longer, the
hall gets darker, and the last row is inside the casting tunnel where the floor is lit from
below by the melt — then the line ends at a wall and you have to stop.

**Technique story.** Speed commitment over burning barrels from a 22 deg kicker onto a 14 deg
landing ramp (evo-03 fire barrel jump; round 5: onto flat 2/walled/4, onto the ramp 1,1,1),
paired with the hard stop (brake zone 8 m, hump, low-speed hop, stepped kerb). Escalation is
barrels 4 -> 5 -> 6 AND context: flat -> after a stop -> in the dark -> into the stop. No row
exceeds 6 barrels (4.6 m of fire; 6.6 m was 111 deaths).

```
 y
 2m      ^****\           ^*****\                     {^******\        ^******\}                ^******\
 1m  A__/      \___ _____/       \__#___ ____ _______{/        \______/        \}_______ ______/        \___^_~~_##__ ____A_
 0m [CP0]                 [CP1]     0.5     [CP2]     THE POUR: tunnel, 2 rows, floor lit    [CP3]           brake hump gap 0.5/0.7 kerb
    0  28 51 56 60 70 82    150  166 171 175 178 188 196 200 212  240 260 265 270 272 282 300 305 310 312 322      380 396 401 405 408 418 426 429 431 434 438 450 520 580
```

| beat | x | SEE | DEMAND | FAIL | RECOVER |
|---|---|---|---|---|---|
| 1 Grid | 0-51 | start gantry inside the hall door, crowd on the gantry, one key light through the roof, molten pillars far tier (ris-12) | — | — | CP0 at 28 |
| 2 First row | 51-82 | 20 m run-up, 5 x 2.0 kicker (curve 0.3), 1 m, 4 barrels (3.0 m of fire), 2 m, 8 x 2.0 landing ramp — the row is lit by its own fire | ~11 m/s at the lip; off the gas at the lip; land rear-first on the 14 deg ramp | any body part or wheel in the 0.6 m fire = hazard fault; short = the barrel face | CP0, 23 m |
| 3 Flow | 82-150 | rollers, bumps, wave, tabletop; sparks falling from the far tier; CP1 at 150 | — | — | — |
| 4 Row and stop | 166-200 | 20 m run-up, 5 barrels onto the ramp, 8 m brake zone, 0.5 m ledge | the stop: brake from ~12 m/s in 8 m (measured 4.66 from 10), then the 0.5 hop | stoppie / over the bars into the kerb; too slow for the row = fire | CP1, 16 m |
| 5 Flow | 200-260 | wave, tabletop, `smooth(28, -2)` DOWN into the casting tunnel mouth (the descent is flow: credited run-up), CP2 at 260 just inside | — | — | — |
| 6 The Pour (SET PIECE, `fire` + `tunnel`) | 260-330 | **a 60 m foundry `tunnel({ style: 'foundry', lit: true })` with two fire rows 22 m apart: 5 x 2.0 kicker, 5 barrels, landing ramp, 12 m flat, kicker, 6 barrels, landing ramp** — the floor between the rows is the melt channel in render only (lava under-light, ris-13, ember sprites), no extra hazard; camera `side-tight` zoomBias 0.4 | two commits 22 m apart: land, do NOT brake, full gas, second lip at ~11 m/s (12 m of flat from a rolling ~8 m/s exit off the landing ramp is enough) | fire on either row; a brake after row 1 = short on row 2 | CP2 at 260, 20 m before row 1; a death on row 2 = both rows again (the pair IS the set piece) |
| 7 Breather | 330-380 | tunnel exit into the crowd `arch`, rollers, CP3 at 380 | — | — | — |
| 8 Demand: fire into the stop | 396-438 | 20 m run-up, 6 barrels onto the ramp, 8 m brake, hump, 2 m gap (hop), 0.5 + 0.7 stepped kerb (round 5 demand, unchanged), camera `high34` -> `side-tight` cut at the brake zone | the full sequence at once | fire, or the kerb | CP3, 16 m |
| 9 Home | 438-580 | 12 m flat, bumps, `smooth(40, -2)` glide down to the yard, crowd, finish gantry | — | — | — |

**Pacing** ~ flow 270 : technical 200 : breather 110 (47:34:19). Bot-clean ~37 s, human ~53 s.
**Checkpoints** 28 / 150 / 260 / 380. **Attempts** 18-25 (the second tunnel row is new
exposure: `[wave 2 probe: two rows 22 m apart, 5 then 6 barrels, reflex good x3, expect <= 4]`).

Modelled on: evo-03 (fire barrel jump), evo-09 (plank bridges with fireballs on timers), ris-12
(foundry emissive pillars, tight low camera), ris-13 (lava under-light, close-up -> panorama).

## 4. X1 `x1-vertical-limit` — "The Ascent" (snow, Pro, band 30-45, ~760 m, human 75-85 s)

**Premise.** A mountain. Four faces up the glacier, each steeper, each landing higher than the
last, until the summit ridge: a row of ice pillars over the crevasse inside a blue ice cave. Then
70 metres of glissade down into the village lights.

**Technique story.** Near-vertical planks — hang over the bars, tap the throttle (tech-06: 60 deg
at one wheelbase per second, stall and roll-back; tech-07: 50 deg at two per second) — and
pole-cap rear-wheel hops (tech-04). Planks 45 -> 50 -> 55 -> 60 with the round-6 40 m run-ins and
2.4 x 0.8 fillets on >= 50 (the fillet, not the run-up, was the wall). The difference from today:
the track GAINS height. Each face lands on a box and descends only 2 of its metres, the ridge
between faces climbs another `smooth` 2 m, so the 60 deg face starts 8 m above the start and the
caps are 12.5 m up.

```
 y
 12m                                                                                          ! ! ! ! !    !  !  !
 10m                                                                                       #|{ crevasse cave }|\
  8m                                                                     _______#____     _/ 60 deg              \ -30 plank
  6m                                             _____#______   _____/  55 deg  \___/                              \__
  4m                     _____#______   _____/  50 deg   \____/                                                        \__
  2m        _____#____/  45 deg  \_____/                                                                                   \__  glissade (70 m, -8)
  0m A_____/   |   \___[CP0]                                                                                                     \______A_
     0   40   45  49  71 79       120   160  200   205  209  231       290  330  370   375 379 401     460  500  520  524  528  540 546 550 556 585 640     700 760
```
(Each face: fillet + plank onto a 4 m box, a 22 m down-ramp giving back 1.6-2.5 m, then flat;
`smooth(28, 2)` climbs sit inside the flow between faces. Heights are cumulative.)

| beat | x | SEE | DEMAND | FAIL | RECOVER |
|---|---|---|---|---|---|
| 1 First face | 0-79 | start gantry in the village (glowing windows, ris-15), 40 m run-in, 45 deg plank (rise 3.6) onto a 4 m box, 22 m down-ramp giving back 2.0 -> the trail is now +1.6; CP0 at 79 | lean forward, steady gas; the fillet spreads the pitch-up over 0.2 s | stall and roll back (no fault, ride back down), or loop at the crest | start line, 40 m (no CP before the face: round 6) |
| 2 Ridge | 79-200 | rollers, `smooth(28, 2)`, wave, bumps, fog tiers open up (the valley below), CP1 at 200 | — | — | — |
| 3 Second face | 200-270 | 40 m run-in, 50 deg (rise 3.8, 2.4 x 0.8 fillet), box, 22 m ramp giving back 1.8 | as beat 1, steeper: front wheel hovers 0-10 cm off the plank | stall / roll-back; the crest | CP1, 40 m |
| 4 Ridge | 270-370 | `smooth(28, 2)`, tabletop, bumps, CP2 at 370 (+5.6) | — | — | — |
| 5 Third face + the first caps | 370-460 | 40 m run-in, 55 deg (rise 4.0), box, 22 m ramp; 12 m flat; camera `low`: ramp + 3 m ledge 0.8, **pole caps 1.2 -> 1.8 (+0.15 each, 1.1 m pitch) over a kill pit**, 6 m box, 8 m ramp down | the cap hop: a walking-pace 0.4 m hop from the ledge starts the row, then rear-wheel hops cap to cap (tech-04) | a missed cap = the pit = restart | CP2 at 370: the face (40 m) and the caps (~70 m) are one push; the caps have no checkpoint of their own by design (X1 round 6) |
| 6 The Summit (SET PIECE, `climb` then `balance`) | 500-585 | CP3 at 500 (+8, 16 m flat), camera `side-tight`: **the 60 deg face (rise 4.5) onto a 3 m box at +12.5**, straight into an ice `tunnel({ style: 'ice' })` — the crevasse cave — where **three caps at the box height, 1.7 m pitch, over a 4 m kill pit, then a 4 m gap onto a -30 deg plank** drop you out of the cave mouth into daylight (camera `low` in the cave, `high34` cut at the mouth) | the two hardest things in the tier back to back, from a standing start on the box (the caps are entered at walking pace from the box top: no run-up needed, rule-exempt) | 60 deg stall (roll back down, no fault: tech-06), a missed cap or the gap = the pit | CP3 at 500, 40 m run-in to the face; the caps are 12 m past the crest with no CP (X3-style: the summit is one push) |
| 7 Glissade (`drop`) | 585-700 | out of the cave mouth, 3 m of flat, **`descent(70, 8)`** — a smooth 70 m run home losing all 8 m (grounded at 16 m/s: half-length >= 32 m), fog thickening, village windows as depth cues, snow puff on every bump | nothing: flat out is safe (B1's descent shape) | — | — |
| 8 Home | 700-760 | bumps, crowd `arch`, finish gantry, confetti in the snow | — | — | — |

**Pacing** ~ flow 330 : technical 300 : breather 130 (43:40:17). Bot-clean ~50 s, human ~80 s.
**Checkpoints** 79 / 200 / 370 / 500: each on the ridge flat >= 40 m before its face (the round-6
number) and >= 8 m past a landing; there are four, not five — the round-6 CP at 646 before the
final caps is gone because the caps moved INTO the summit set piece 12 m past the 60 deg crest
(the `[wave 2 probe]`: 60 deg plank + 12 m + three 4.5 m caps from the box top, search bot skill 3,
must clear in <= 10; X3 clears the same shape in 2). **Attempts** 30-45 (the 60 deg face is the
wall for every reflex skill today and stays the demand; `[Pro?]` the ECU assist is gone, so the
cap hops are the first thing to re-probe on physics-v2).

Modelled on: tech-06 (60 deg stall), tech-07/08 (uphill landing + pyro at the crest), tech-04
(cap hops), ris-15 (snow village fog, windows), ris-05 (night cliffs, flare markers for the caps),
evo-12 (drop with camera pull-out).

## 5. X2 `x2-pipe-dream` — "The Rolling Mill" (foundry, Pro, band 40-60, ~640 m, human 70-80 s)

**Premise.** The rolling mill: a line of spinning drums under the roof cranes, the see-saws that
drop you onto them, and the big roller over the melt at the end of the hall. The drums are the
mill — everything spins, and every landing is on something that is trying to throw you off.

**Technique story.** Spinning drums as slippery platforms (tech-10/11: drum spool crossing,
rear-wheel lift over the top) entered from `drumStep` shelves (physics 12.3: the measured line),
combined with drum-top gaps <= 2 m (a spinning top cannot be pumped) and see-saw drops (tech-16/17:
the plank does not move until the front axle passes the pivot, tips in 0.5 s). Escalation: shelf
drum + 2 m gap -> log pyramid + shelf drum -> see-saw onto a shelf drum then the big gap onto a
spinning top (set piece) -> the 4-drum pipe run at 1.5 m -> the demand: see-saw, shelf, spinning
drum, gap, drum, gap. One see-saw + drumStep pair fewer than today (the final section repeated the
second): the demand's see-saw is the second on the track, not the third.

```
 y
 3m                                                                     o   ~~~~fire~~~~  o
 2m                                        T                         __/ \______________/ \        {   o  o  o  o  }             T      o
 1m    __#o~~#\__   ###o###             __/ \_#o#####################^                    \___    { #o~o~o~o~o }            __/ \_#o~~o~~__
 0m A_[CP0]____  \_/  logs  \___{tunnel}___[CP1]  see-saw  shelf 2.0 drum  15 m platform  4 m gap onto the big roller  [CP2]  pipe run  [CP3]  demand     0.5 ledge  A_
    0  24  40  46 48 52 56 62  74 80  90  100   170  200 216 224 226 232 247   248.5 252.5  254.5  260   300  340 356 375 390 400 425 441 449 451 455 457 459 472 476 500 570 640
```

| beat | x | SEE | DEMAND | FAIL | RECOVER |
|---|---|---|---|---|---|
| 1 First drum | 0-62 | start gantry at the hall door, CP0 at 24, 16 m, `drumStep` r 0.8 spinning (shelf 1.2 -> 1.6 m drum), 2 m gap onto a 0.8 box, ramp down | roll the top from the shelf at the contact normal <= 56 deg; hop the 2 m from the spinning top | slide off the back of the drum (no fault, ride again from the shelf); the gap | CP0, 16 m |
| 2 Logs and a second drum | 62-100 | `logStep` (ramp to the first log's top, 4 x 3 rows), 6 m, `drumStep` r 0.8 spinning with an exit shelf | the log pyramid as 0.22-0.52 m bumps; the drum in and out | nose-high on the pile | CP0 (the pile is 38 m from the spawn; round 5: 16 m minimum) |
| 3 Through the mill | 100-200 | rollers, wave, bumps inside a 40 m `tunnel({ style: 'pipe' })` (a duct between halls), CP1 at 200 in the big hall | — | — | — |
| 4 See-saw to shelf | 216-247 | `seesawEntry` 8 / 2.0 (ride down, it tips), 2 m, `drumStep` r 1.0 (shelf 1.4 -> 2.0 m drum, not spinning), step 0.2 down onto a 15 m box at 1.8 | commit weight after the tip (tech-16 obs. 3), then straight up the shelf | park on the pivot; drum roll-back | CP1, 16 m |
| 5 The Big Roller (SET PIECE, `air` + `fire`) | 247-260 | **from the 15 m platform at 1.8, a 1.5 x 0.4 kicker over a 4 m pit whose hazard is `fire` (the melt: lava under-light, embers, ris-13) onto a spinning r 1.0 drum top**, camera `side` -> `high34` pull-out over the melt, crowd `arch` on the far gantry | ~9 m/s off the platform (the 15 m box IS the run-up), land ON the top of a spinning drum and roll off the far side | short = the melt (fire fault, the most spectacular death on the track); long = the far side of the drum | CP1 at 200: the see-saw, the shelf and the jump are one 60 m push (round 5 layout, bot 2 attempts) |
| 6 Breather | 260-340 | bumps, wave, CP2 at 340 | — | — | — |
| 7 Pipe run | 356-375 | camera `high34`: `drumStep` r 0.9 spinning then four r 0.9 spinning drums with 1.5 m gaps | five tops in a row, each hop at drum-top pace | any gap | CP2, 16 m |
| 8 Demand | 425-476 | CP3 at 400 (rollers between), `seesawEntry` 8 / 2.0, 2 m, `drumStep` r 1.0 spinning, 2 m gap, drum r 0.8 spinning, 2 m gap off it, 13 m, 0.5 ledge | see-saw drop -> spinning shelf -> hop -> spinning top -> hop, at see-saw speed (~5 m/s) | the two gaps | CP3, 16 m |
| 9 Home | 476-640 | 12 m, bumps, a 40 m `smooth(40, -1.5)` down the yard ramp, crowd, finish gantry | — | — | — |

**Pacing** ~ flow 270 : technical 240 : breather 130 (42:38:20). Bot-clean ~45 s, human ~75 s.
**Checkpoints** 24 / 200 / 340 / 400. **Attempts** 40-60. The only geometry change against round
6 is the hazard type of the set-piece pit (`water` -> `fire`: identical collider and hazard box,
different kind — the golden hash does not see hazards; harness `expected.json` might, flag it)
and +125 m of flow / tunnel; `[wave 2 probe]` none needed beyond the regression sweep.

Modelled on: tech-10/11 (spool crossing), tech-16/17 (see-saw), evo-09 (half-pipe drum with
fireballs), ris-12/13 (foundry, melt under-light).

## 6. X3 `x3-gauntlet` — "The Stack" (foundry, Pro, band 60-80, 500 m, human 70-90 s)

**Premise.** The final exam through the whole foundry: every lesson once, in curriculum order,
hall by hall, and the exit is up the 60 deg stack and across the chimney caps into the sky.

**Technique story.** Unchanged by design (round 6: one feature per lesson, 500 m, bot 2
attempts, reflex `good` 94 % on every seed — walled only at the 60 deg plank, which is X1's
demand). Wave 2 does not touch a collider on X3 except through the `[Pro?]` re-probe; it gives
the existing sequence a place: three halls as tunnels, a crowd at every checkpoint plaque (tech
obs. 13-14: grade zones are physical plaques, clearing one fires flame jets), and the stack as the
set piece.

```
 y
 9m                                                                                                                       ! ! !
 4.5m       #\                                                                                                          #|   \  -30 plank
 3m         |  \_#                                                                                                     /       \_
 1.5m      /      #_#                                                                                                 /          \___
 0m A_[CP0]/  E1    \_ E3 stairs 2 m gap [CP1] M1 ledge M2 drum [CP2] M3 see-saw H1 wall+rails [CP2b] H2 chain [CP3] H3 fire [CP4] X1 60 deg + caps  A_
    0  28 48 55 59 71 77 83 89 101 121 125 129 135 137 151 167 171 172 189 195 205 225 241 245 248 256 272 276 280 284 292 306 322 326 328 334 339 341 349 355 361 387 410 431 433 437 438 443 447 451 455 462 470 500
```

| beat | x | SEE | DEMAND | FAIL | RECOVER |
|---|---|---|---|---|---|
| 1 Hall one: E1 + E3 | 28-137 | start gantry, CP0 at 28, 20 m, 48 deg plank (1.2 x 0.35 fillet — the 2.4 x 0.8 one walled the bot at the cap landing) onto 3.7, ramp down onto the 1.5 / 1.0 / 0.5 drop cascade, rollers, 8 x 0.25 stairs up and down into a 2 m gap; CP1 at 151 | the E-tier at speed | plank stall; nose-down on the cascade; the gap | CP0 |
| 2 Hall two: M1 + M2 | 167-215 | `tunnel({ style: 'concrete' })` 60 m: 0.5 ledge + 1.5 m hop across, 16 m, spinning shelf drum with exit; CP2 at 225 | hop, then the drum | the hop-across pit; the drum | CP1 |
| 3 M3 + H1 | 241-292 | 4 x 1.0 / 3 m gap onto the 8 / 2.0 see-saw, 16 m, `steppedWall` 1.4 + 4 rail slots; CP2b at 306 | see-saw landing then the lip climb into a wire | the see-saw; the slots | CP2 at 225 (round 6: a death here was a 100 m walk back before CP2 went in) |
| 4 H2 | 322-349 | lipped chain of 3 (0.25 lips, 2.5 / 2.5 / 2 m), bumps, CP3 at 355 | one bike length of slack | water | CP2b |
| 5 H3 | 378-410 | crowd gantry, 20 m, 5 x 2.0 kicker over 6 barrels onto the landing ramp (camera `high34`), CP4 at 431 | commit | fire | CP3 |
| 6 The Stack (SET PIECE, `climb`) | 449-470 | **camera `side-tight`: 60 deg plank (rise 4.5) onto a 3 m box, camera `low` cut: three caps at 4.5 m over the kill pit, a 4 m gap onto a -30 deg plank at 2.0** — the caps are chimney tops, the sky opens above the hall roof (an `arch({ style: 'pipe' })` frames the exit), flame jets at the crest | the X1 demand, standing start on the box top | stall (roll back, no fault); a cap; the gap | CP4 at 431, 18 m |
| 7 Home | 470-500 | 4 m, 12 m, finish gantry, fountain-style send-off (ris-07) | — | — | — |

**Pacing** ~ flow 120 : technical 270 : breather 110 (24:54:22) — deliberately the densest
track; it is the exam. Bot-clean ~43 s, human ~85 s. **Checkpoints** 28 / 151 / 225 / 306 / 355 /
431 (round 6). **Attempts** 60-80.

## 7. Cross-track structure (what the storyboards share)

| | H1 | H2 | H3 | X1 | X2 | X3 |
|---|---|---|---|---|---|---|
| height story | +6 m over the track, one drop | stacks to 2.4, the apron jump | flat hall, -2 into the tunnel, -2 home | +8 m to the summit, 70 m glissade | flat mill, +1.8 platform, -1.5 home | flat halls, +4.5 stack |
| set piece kind | `balance` + `drop` | `air` | `fire` + `tunnel` | `climb` + `balance` | `air` + `fire` | `climb` |
| tunnel | scaffold (the drop) | concrete (under the stacks) | foundry (the pour) | ice (the crevasse) | pipe (between halls) | concrete (hall two) |
| crowd arches | wire end, home | quay, jump stands | pour exit, home | village, home | far gantry, home | every plaque |
| technical beats | 4 | 4 | 4 | 5 | 5 | 11 (exam) |
| identical-feature repeats (max) | 3 walls, escalating | 3 chains, all different | 4 rows, 4/5/5+6/6 | 4 faces, escalating | 2 see-saws | 0 |
| length / bot / human | 600 / 38 / 52 | 590 / 40 / 58 | 580 / 37 / 53 | 760 / 50 / 80 | 640 / 45 / 75 | 500 / 43 / 85 |
| band | 10-18 | 14-22 | 18-25 | 30-45 | 40-60 | 60-80 |

Order of demand inside each track: flow -> teach -> flow -> repeat -> flow -> SET PIECE ->
breather -> DEMAND -> home, except X1 where the set piece IS the demand (the summit) and X3 where
the whole track is the demand.

## 8. Sanity pass on m1-m3 (no redesign; premise + set piece + flags for wave 2)

- **M1 `m1-hop-up` "The Loading Dock"** (industrial). Premise: a dock of stacked crates, each
  kerb one crate higher. Set piece (`balance`): the 0.3 / 0.6 / 0.9 stair of crates onto the lipped
  0.9 box under the loading crane (camera `side-tight` cut already there at 330). Flags: eight hops
  of one shape — allowed by the repeat rule because the height parameter is monotone
  (0.45 -> 0.9), but wave 2 dresses hops 2 and 4 (the hop-acrosses) as different crates so they
  READ different. Round-6 numbers hold (average median 9 in band 5-9). Add: start / finish
  gantries, crowd at CP3.
- **M2 `m2-drum-roll` "The Log Flume"** (snow). Premise: a timber yard — half-buried logs,
  pyramids, and the spinning drums of the mill. Set piece (`balance`): the 1.2 m box -> spinning
  drum -> off again (the demand) with the flume `tunnel({ style: 'ice' })` over the pyramids. Flag:
  the 0.5 m-proud `bumpDrum` at 42 m still costs the skill-2 bot an attempt (round 4 table) — the
  one medium feature that fails the bot; `[Pro?]` re-probe first, then 0.5 -> 0.45 proud if it
  persists. Add: start / finish gantries.
- **M3 `m3-see-saw` "The Bascule"** (foundry). Premise: the bridge yard — bascule boards over
  water and the thin gangways between them. Set piece (`air`): the 4 x 1.0 / 3 m gap onto the
  resting end of the 8 / 2.0 board (it dips, you roll up, it tips) — camera `low` is already
  there. Flags: round 6.1 landing lips on every thin plank stay; physics owes the one-way open-edge
  wedge fix (MEGA_PLAN P1) — when it lands, the lips stay anyway (they are the reflex-validated
  shape). Add: start / finish gantries, crowd on the demand's far bank.

## 9. Requests raised by these storyboards

- **core** (`src/core/types.ts`): `TrackMeta.setPieces?: { x0: number; x1: number; kind: string;
  label?: string }[]`. Until then tracks writes it through `TracksMeta` and readers use
  `setPiecesOf(def)` from `src/tracks`.
- **render**: dress `placed[]` entries of kind `arch` (params `span height depth style variant
  surface`, pos = left end, centred on the DSL cursor) and `tunnel` (`length height depth style
  lit`); react to `setPiecesOf(def)` ranges (`start finish crowd tunnel drop fire climb air
  balance`); `low` / `high34` / `side-tight` keys as listed per beat. Today's `switch (po.kind)`
  default branch draws nothing for a `placed` with no colliders, so an undressed arch is invisible,
  not a crash.
- **physics** (before wave 2 step 0): the Pro-bike re-measurement of §0's table — brake distance,
  0 -> 16 m/s, hop apex, 50 / 55 / 60 deg climb times, see-saw tip time, drum-top hop, and the
  cap-hop row — plus the two behaviours the storyboards lean on: the 40 deg ground roll-off at
  6-13 m/s (H1 beat 7) and the drum-top landing from a 4 m kicker gap (X2 beat 5, round-5 shape).
- **harness**: whether `expected.json` keys on hazard kinds (X2's pit becomes `fire`); a 600 s
  sequential bot wall for 760 m X1; reflex `good` x3 on every `[wave 2 probe]` above.
