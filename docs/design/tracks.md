# Track system and curriculum

Status: **tracks round 9 (physics v2 R5, strangers r5)** — the hard and extreme tiers are the storyboards, authored to the v2 envelope and held to reflex `good` over 9 seeds + the skill-3 bot: H1 climbs the roofline (+6 m) to the parapet wire and drops off the roof into the scaffold tunnel, H2 climbs the container stack to the crane jump, H3 runs the pour tunnel's fire pair, X1 gains +6 m to a summit cap ridge and a glissade, X2's mill duct, melt pit and three-top pipe run, X3's grounded cascade entry and the summit stack. Reflex `good` (was 0/9 on all but h3): **h1 10 (7/9) · h2 9 (7/9) · h3 11 (9/9) · x1 33 (9/9) · x2 4/9 at 9-24 · x3 29 (6/9)**; bot 2 / 1 / 1 / 1 / 3 / 2. Three physics facts drove the shapes: on v2 the reflex clears 45 deg faces (9/9, median 3) and nothing steeper (40 and 42 deg kicker planks launch it, 50-60 deg are the bot's hop move) so every X face is 45 deg and the escalation is height; the curve-0.3 platform kicker loops the gas-through-the-lip rider (straight 2 x 0.4: chain B 2/9 -> 8/9) and any LEVEL chain with 3-4 m gaps or a see-saw finish is a reflex wall while a stepping-up chain is not; a convex crest on a plank top walls the skill-3 bot (12/12, 60/60). The eight §5 validators are code (`validate.ts`, 24 tests). E3's up-flights are 0.12 x 0.8 (plain gas <= 21 deg from 14 to 20 m/s; 0.15 x 0.6 read 47 / 38 / 53 deg and looped at 20 — the strangers' 53-59 deg). Round-9 table in §2. Previous: **tracks round 8 (physics v2 R5, strangers r4)** — the stairway that no human proxy cleared is re-authored on a measured fact: a 0.25 m riser is a 75 deg face to a 0.34 m wheel, so once the front lifts every riser the rear hits accelerates the loop (the replayed r4 stranger recordings loop on PLAIN GAS at 10 m/s and on gas + lean +1 at 7 m/s; the 22.6 deg flight launches the bike off its top with no input at all); every E3 / X3 flight is now 0.15 m risers at a 0.6 m run (14 deg), no flight is taller than 1.2 m, the barrels at flight 2's foot are gone and the pit is 1.5 m onto a landing ramp — reflex `average` 35 -> 3 (9 seeds, 9/9), `good` 14 -> 1, eight naive riders (plain gas, governed gas, coast-in-air) clear it in one attempt. X3's Rookie clear is back (skill-3 bot 50 attempts capped at 95 % -> 2 attempts, 48.2 s) with a convex crest at the 60 deg plank top; the same crest on E1's 45 deg demand (the reflex launched off the plank top and backflipped over the box, 28 deaths x 9 seeds) and the v2 hop rule (a 0.45 ledge wants 6 m of run-up, not 16 — the hop window is 5-8 m/s) put m1 `average` 49 -> 7 and `good` 22 -> 7. Two new §0 rules: the stair riser (0.15) and the panic drop (a held lean-back rides every drop to 1.8 m off a >= 8 x h down-ramp and loops down any stair flight >= 1.0 m — B2's two stair descents are ramps now). Round-8 table in §2. Previous: **tracks round 7 (physics v2)** — every §0 number re-measured on `physics-v2` (v1 column kept one round; the flip changed the envelope the courses were built on: run-ups are shorter not longer, 22 deg lips loop the gas-through-the-lip rider, the crawl climb limit is 37 deg with 45 only over a 0.3 m kicker foot, the hop-able ledge is 0.3-0.6 m, and every 29 deg see-saw crashes every rider); `FEEL` now interpolates the measured run-up curve; `kickerPlank` replaces `steepPlank` on every plank <= 45 deg; the lab ledge is 0.10 m lower; all 15 courses re-authored to those limits (§2 "Round 7" table), medal targets re-derived from the v2 skill-3 bot; hard / extreme carry the storyboard set pieces and gantries (markers + decor only — the roof climbs, tunnels and re-sequencing of §5 are still owed). The reflex bot is not yet a v2 instrument (§0 last row) and the harness owner is re-tuning it concurrently, so the attempts table is a same-controller before / after, not a band verdict. Previous: physics-v2 P0 (round 8) — the two lab tracks (§6); mega build wave 1 (round 7) — the storyboards and the `arch` / `tunnel` / `setPieces` vocabulary; round 6 — X3 at 500 m, X1 around a 45 deg opener, finish run-out + catch.
`docs/design/CONTRACT.md` wins over this file; the executable form is `src/core/types.ts`
(`TrackDef`, `TrackMeta`, `CameraKey`, `CompiledTrack`, `Collider`, `HazardZone`,
`PlacedObstacle`) and `src/tracks/index.ts`. Metres, seconds, radians unless a param is
named `*Deg`. +x is track direction, +y up, +z toward the camera.

Code map (`src/tracks/`): `kinds.ts` vocabulary + defaults + per-kind lowering,
`geometry.ts` shared-face cancellation, `compile.ts` `compileTrack`, `author.ts` DSL + feel
helpers + spawn validation, `describe.ts` text summaries, `courses/*.ts` the tracks
(`courses/lab.ts` the `lab-*` physics tracks, §6), `golden.json` per-track collider hashes,
`tracks.test.ts` / `compile.test.ts`. Registry order: fixtures, curriculum, lab tracks last
(`isLabTrackId(id)` = `id.startsWith('lab-')`; core-game lists those under "Lab").

## 0. Numbers the tracks are authored to (physics v2, tracks round 7; v1 column kept one round)

Physics owns every feel number. Tracks are authored against the MEASURED v2 envelope with a 20 % margin
(`FEEL` in `author.ts`: `speedAfter` interpolates the measured run-up curve, `hopLedge`, `climbDeg`,
`brakeDistance`, `jumpRange`). Every row below was re-measured on `physics-v2` (9b4275c) with the physics
owner's API at 120 Hz, Rookie unless noted, on in-memory tracks built with the authoring DSL (scripts:
scratch `tracks7/measure/*.ts`, tables `out/01..08.txt`; the numbers are reproduced in this table). Where a
v2 number differs from what a v1 course assumed, the "authored against" column is what the courses now do.

| quantity | v1 (§0 rounds 2-6) | **v2 measured (round 7)** | authored against |
|---|---|---|---|
| total mass / COM | 145 kg, 0.45 m | kept | - |
| wheelbase / wheel radius | 1.30 / 0.34 | kept | 0.3 m kerbs rollable |
| 0 -> 16 m/s | rule 3.5 s (measured 1.4-2.2) | **3.97 s / 36.3 m** Rookie; Pro 3.25 s / 29.2 m (lean +0.5: the Pro loops at +0.25 from rest) | run-ups are not longer: v2 is front-loaded (0.66 g off the line) |
| speed after d m of flat run-up (raw) | rule 10 m 7.7 / 14 m 9.1 / 20 m 10.8 / 40 m 15.3 | **10 m 10.2 / 14 m 11.6 / 20 m 13.2 / 30 m 15.1 / 40 m 16.5 / 60 m 18.3** (Pro +0.7..+1.2) | `FEEL.speedAfterRaw`; a 16 m run-up arrives at 12.4 m/s, the checkpoint-rule 15 m at 12 |
| top speed | 20 | 20.03 Rookie / 21.03 Pro (drag-limited above 14) | - |
| brake from 10 m/s | 4.66 m (10.7 m/s^2) | **5.92 m hard-back (8.6 m/s^2), 7.06 m neutral**; from 16: 13.5 / 17.5 m | brake zones stay 8 m (10 m/s hard-back + margin = 7.3) |
| kicker flight (rear touchdown past the lip, landing at lip height) | `jumpRange` at 0.8 x run-up speed | **gas held through the lip at neutral loops the bike off every kicker at <= 10 m/s** (<= 12 Pro); rolled at 0.3 throttle / +0.25: 4x1.2 @12 6.0 m, @14 10.1, land -4..-7; gas + lean +0.5: 4x1.2 @12 8.1 m (+26), 3x0.8 @12 8.5, 6x1.2 @12 4.6 — rides away on <= 17 deg lips, **the 5x2 (22 deg) crashes <= 10 m/s** and lands -25 at 16 | `jumpRange(v_lip)` is within +0.4/-1.0 m when the bike lands <= 20 deg nose-up; beginner / easy / medium lips are straight and <= 17 deg (the curve-0.3 lips are gone below hard); 22 deg only on H3 / X3 fire rows from >= 12 m/s |
| plank climb (4 m wood, naive rider gas + lean 0.4 / technique controller) | sustained 60, 65 stalls; planks <= 48 through Hard | **crawl limit 37 deg (COM geometry); naive rider loops on every plank >= 35 from 2-5 m/s, tops 40-45 only from 8 m/s; 45 @ 8 m/s: F plain / F with the concave fillet / TOP over a 0.3 m 20 deg kicker foot (both classes); 40 @ 5: F -> TOP with the foot; 50 deg+: nobody tops it (best 79-90 % stall), the skill-3 bot's hop-into-the-face move does; the `steepPlank` fillet makes crawl rows WORSE (Rookie 40 @ 2 TOP -> 58 % stall)** | `kickerPlank` (0.3 m 20 deg foot) for every plank 36-45 deg: E1 36 / 40 / demand 45, X1 face 1, X3 opener; `steepPlank` kept only on the 50 / 55 / 60 faces (bot technique, extreme) |
| stationary hop | 0.74 m apex | **0.46 m** (0.55 with a 0.4 s preload) | `hopStationary` 0.46 |
| **hop run-up (round 8)** | checkpoint rule: >= 15 m before a >= 0.45 m ledge | **on v2 more run-up is worse: a 0.45 ledge + 1.5 m hop across (`tracks8/m1fix.mts`, 6 seeds) — reflex `average` total attempts 15 from 6 m of run-up, 58 from 8, 51 from 10, 72 from 12, 64 from 16 (`good` 18 / 39 / 45 / 25 / 24): the hop window is 5-8 m/s, reached in 4-8 m, and 16 m of gas arrives at 12 m/s, so the rider brakes (a stoppie, then the face)** | `CHECKPOINT_RULE.hopHeight` 0.45 -> 0.65: ledges up to 0.6 m want NO run-up minimum; M1's lesson hops sit 6-8 m past their checkpoints |
| hop-able ledge (gas-hop, >= 0.1 m of clear air) | 0.9 m rolling from 5 m/s | **0.3-0.6 m at 5 m/s (timing window 0.42 -> 0.22 s), 0.45-0.7 at 8 m/s; 0.7 has no margin, 0.8 is the Rookie wall (0 of 22 timings), 0.9 is gone; the Pro clears 0.8 at 3-5 and 0.9 once in 22 at 5.** A 0.15 s late hop at 5 m/s = stuck at the face (no fault); at 8 m/s = hung on the corner or a -93 deg nose-dive | lesson ledges 0.4, demands 0.45-0.5, B-line `steppedWall` step 0.4 (was 0.5); no single rise above 0.5 anywhere; the shipped `lipHopper` is a lip controller and only makes 0.3 m |
| **panic drop (round 8)**: the input held from 1 m before the edge to 3 m past the foot (`tracks8/panic.mts`, Rookie, 6 / 10 / 14 m/s, drop reached by a 10 x h ramp) | — | **coast + lean -1 held: rides every drop to 1.8 m off a straight down-ramp of 12 x h (<= 4.8 deg) and off 8 x h except 1.5 / 1.8 m at 14 m/s; off a bare box EDGE it loops from 1.0 m at 6 m/s (1.5 m at 6 and 10); down a 0.15 m stair flight it loops at every speed from 1.0 m; a 0.5 m drop of any shape rides. Coast + lean -0.5 rides everything; coast 0 / gas 0 ride everything; gas + lean -1 or -0.5 held loops off every shape (v2's flat-ground gas-and-lean-back loop); gas + lean +1 held loops off edges >= 1.0 m at 6-10 and down flights >= 1.0 m at 10-14, rides the ramps; brake + lean -1 rides everything but a >= 1.5 m edge at 6** | **rule: every beginner / easy drop over 0.5 m exits on a straight down-ramp >= 8 x h (12 x h where the arrival is >= 14 m/s), never a bare edge or a stair flight; a <= 0.5 m step may be an edge.** B2's drops already were box -> 8 x h ramps except its two stair descents (4 x 0.3 and 3 x 0.33 at 27-29 deg — the r4 stranger's 433 m loop, 'a lean-back blip on the second step'), now 9.6 x 1.2 and 8 x 1.0 ramps; the cascade's 0.5 steps stay edges |
| drops (box edge, throttle 0.2) | 1.8 m onto a ramp (B2) | **neutral rides every drop to 3 m at 6 and 12 m/s (front first, -19..-47 deg, rebound <= 0.07); a HELD +0.5 crashes >= 1.5 m @ 6 (nose -113); a held -0.5 loops >= 2 m @ 6 / 3 m @ 12**; the 8 m down-ramp is under the parabola at 12 m/s | drops unchanged (B2 1.8 max, X3 cascade 0.5 steps); the beginner hint stays "lean back, gas off" (a touch, not a hold) |
| see-saws | every board tips in 0.4-1.0 s and rides off | **every 29 deg board (6x1.5, 8x2.0, with or without the entry fillet) crashes every rider on both classes at 3 / 5 / 8 m/s: the far end falls faster than the bike, both wheels leave the board for 0.4 s and it lands rear-first at 65 deg nose-up; <= 22 deg boards (6x0.8, 8x1.2, 8x1.5, 5x1.0) ride at every speed with a cruise rider, tip in 1.2-2.2 s, leave at 4.5-5 m/s; the rear rebound 250 adds no kick (slam dv -0.4..+0.3 m/s)** | no board steeper than 22 deg: M3 8x1.5 + 8x1.6 (were 6x1.5 / 8x2.0), X2 8x1.6 x2, X3 8x1.6; 14 m of flat after a board before a kicker |
| stairs | 0.25 risers at a 0.5 m run (26.6 deg) | v2 lifts the nose over a 26.6 deg flight at 12 m/s (59 nose-high deaths at E3's second flight). **Round 8 (scratch `tracks8/stairs.mts`, Rookie, flight up over a 6 m box and down, naive riders at 5 / 8 / 11 / 14 m/s): a 0.25 m riser is a 75 deg face to the 0.34 m wheel (contact normal acos((r-h)/r)); 0.25 x 0.6 (22.6 deg) crashes gas + lean +1 at every speed, coast + lean -1 at every speed, plain gas at 14 (pitch 43 deg at 11); 0.15 x 0.6 (14 deg) rides plain gas 5-14 (pitch <= 32), coast, gas-forward-to-the-lip-then-coast, brake-down; 0.12 x 0.6 also rides the brake-down at 5. Above 14 m/s the forward-lean riders die on every flight geometry. A held forward lean DOWN a >= 1.5 m flight endoes at the foot (the physics R5 held-lean drop row); a held lean-back down any flight loops (see drops). The strangers' only working line on 0.25 risers was an 11 m/s wheelie entry** | 0.15 m risers at a 0.6 m run everywhere (E3, X3), no flight taller than 1.2 m, the first flight <= 25 m from the line (~13.5 m/s), the others 16 m past a checkpoint; 6-8 m box tops; the demand's descent at a 0.5 m run (16.7 deg); a 0.15 riser is no longer a checkpoint-rule speed obstacle (`stairRiser` 0.25 stands) |
| drums / logs (physics 12.3) | geometry, not speed | not re-measured; a 0.5 m-proud drum at the v2 arrival speed of 12 m/s launched the reflex rider (M2: 25 + 23 + 23 deaths on the first three drums) | M2's second drum 0.4 m proud; log pyramids two rows (the 3-row 1.34 m pyramid is a 50 deg log climb) |
| crest launch | radius >= v^2/g | kept (a cosine grounded at 16-20 m/s) | unchanged |
| lab ledge (§6.1) | 0.4 m above the lip | `lipHopper` at 8-9 m/s: corner roll -0.06 m on all three variants (as is / -0.10 m / 45 deg chamfer), 7 m/s nose-dive; the chamfer is not expressible | ledge lowered 0.10 m (1.6 -> 1.5): the step is inside the 0.3-0.6 m band and the Pro's rolled miss lands on the mattress |
| checkpoint rule / finish run-out / crest rule (rounds 4-6) | as before | unchanged, still validated in `finish()` | unchanged |
| reflex player (harness) | round-5 probe numbers | **not a v2 instrument yet**: on the v2 flip the shipped controller looped the Rookie on flat flow (b1 median 5 on a 1-1 band, deaths "ground @ 95 m") because it allows lean -0.3 with the gas on the ground (v2 critical lean ~ -0.1) and holds gas + lean -1 through touchdown after a nose-down flight; on the Pro it loops at the start line (lab-flat-200 median 8-13). The harness owner is re-tuning it concurrently (v2 hop recipe, ramp-lip release, the climb throw) | attempts bands stand; the round-7 table below is a same-controller before / after on the harness owner's WIP controller (src 6714cf44) |
| **45 deg faces (round 9)**: `kickerPlank` rise 3.6 from a flat run-in, 6 / 12 m top, 22 m down-ramp; reflex `good` 9 seeds (`tracks9/probe.mts` X1F / X1F2) | — | **40 deg 1/9, 42 deg 5/9 (the momentum rider launches off the top), 45 / 3.6 9/9: median 6 from 40 m with a 6 m top, 3 from 30 m, 3 with a 12 m top, 6 from 60 m; 45 / 4.0 7, 45 / 4.5 5, 48 / 4.0 5, 50 / 3.8 over the 2.4 x 0.8 fillet 5 — but on the track the 50 deg face was a stuck-restart wall (the fast first arrival teaches "slower", a stall teaches nothing); the crest is where the slow rider loops (pitch 118 at 2.7 m/s), the box-edge exit onto the down-ramp costs ~3-5 a face on the track; a convex 3 x 0.5 crest on the plank top reads the same for the reflex and WALLS the skill-3 bot (12/12 fixture, 60/60 track)** | every X face is 45 deg over the kicker foot with a plain top, 12-16 m boxes, 30 m run-ins; X1 escalates by height (3.6 / 3.9 / 4.5) and ridge (+2 m `smooth` per section); no crests on plank tops |
| **cap rows (round 9)**: `ramp 4 x 0.8 + box 3 + poleRow` from 12 m | — | **level 1.2 x 3 @ 1.1 median 1 (9/9); rising 1.2 -> 1.8 @ 1.1 median 7 (9/9; 6 from 20 m); r 0.35 caps 10; @ 0.8 pitch 2; caps at the ledge height 1; from a 3-6 m box top after a 45 deg face 0/9 (1.7 or 1.1 pitch, gap-onto-plank or box exit); after a 16 m top at the face height 6-9 (9/9); the gap 3-4 m + -30 deg plank exit after caps 0-2/9** | X1: level caps (teach) -> rising (repeat) -> the summit ridge at box height after a 16 m top (demand); X3's stack is the summit shape; no plank exit after caps |
| **platform chains (round 9)**: 16 m run-in, `platform(w, h, { landing 0.4 / 3 m })`, reflex `good` 9 seeds | — | **kicker lip: curve-0.3 1.5 x 0.4 chain B 2/9, straight 1.5 x 0.4 4/9, straight 2 x 0.4 (11 deg) 6/9 in the probe and 8/9 median 1 on 8 m platforms; stepping UP 0.3 per platform (gaps 4 / 3 / 3 / 2) passes on the track; every LEVEL chain at 1.0-1.2 with 3-4 m gaps 0/9 on 5.5 / 7 / 8 m platforms (the level flight lands on top of the next lip nose-up), chain A (level 0.8, 3 / 3 / 3 / 2) passes; a see-saw finish 0/9 (75 deaths on the board: the m3 trace's missing see-saw model)** | straight 2 x 0.4 kickers on every H2 / X3 platform (`platform({ curve: 0, length: 2 })`); chain B / C step up; the demand ends on a `gapLanding`, not a board |
| **apron jump (round 9)**: 26 m flat + kicker over G m onto `gapLanding` 1.0 | — | **6 x 1.5 (14 deg): 6 m median 1, 8 m 4; 5 x 2.0 (22 deg): 6 m 6, 8 m 9, 10 m 4/9; on the track a 7 m gap from 26 m was 70 deaths / 0 clears (the rider who holds back is short: `jumpRange(speedAfter(25.5) = 11.4, 14 deg) = 6.2 m`)** | H2's crane jump: 6 x 1.5 over 5 m from a 30 m apron (validator 7: a run-up gap <= the level range at the margin speed, +0.5 onto an incline) |
| **fire pairs / the stop (round 9)** | — | **two rows 22 m apart (5 then 6 barrels, 12 m of flat between) median 1 (9/9); the stop after a 6-row: 8 m + 0.45 kerb 2, 8 m + hump + 3 + 0.45 kerb 3, 8 m + hump + 3 + 0.45 + 0.7 kerb 3 (7-8/9), with a 2 m water gap before the kerb 22 (6/9: hop-preload into the pit), 12 m + 0.45 3** | H3: the pour pair; Ladle 2 = 8 m + kerb; the demand = brake, hump, 0.45 + 0.7 kerb onto a 6 m ramp; no hop-gap |
| **stepped walls / the wire (round 9)**: 16 m + `steppedWall` 1.0 + 3 m + 6 slots @ 3.0 | — | **step 0.4 8/9 median 1, 0.3 9/9 median 2, 0.2 9/9 median 2, 8 m ramp 3, no lip 2, two 0.5 ledges 12, a 6 x 1.0 ramp onto the roof 1; on the track 10 slots @ 2.0 straight off the 1.4 wall's hop (4 m top) 46 of 67 deaths -> 8 m top + 4 @ 2.5 then 6 @ 2.0** | H1 walls step 0.3; the demand wall has an 8 m top and the wire tightens 2.5 -> 2.0 |
| **roof drop (round 9)**: `slope(3.6, -3)` (39.8 deg) + `slope(24, -3)` | — | **from 12 / 24 / 40 m median 3 / 2 / 3 (9/9); `smooth(20, -3)` + slope 1; a bare 3 m box edge onto the 24 m ramp 0/9** | H1's drop is the roll-off (the B2 shape: coast + lean back rides a >= 8 x h down-ramp) |
| **spinning tops (round 9)**: 16 m + `drumStep` r 0.9 + drums @ 1.5 | — | **3 tops median 1 (9/9); 4 or 5 tops 1-4 of 9 at 1.0 or 1.5 m gaps or with an exit shelf (after three hops the pitch has drifted); the big roller (15 m box + kicker over 4 m onto a spinning r 1.0): curve kicker 3, straight 4, + a 2 m exit box 1; the demand's shelf drum 2 m off a see-saw 70 stuck-restarts, 6 m off 100 deaths, 16 m off 4/9 at 9-24 (the second spinning top after the 2 m hop is the cost)** | X2: three-top pipe run, straight kicker + exit box on the roller, 16 m off the board before the demand |
| **stairs at flow speed (round 9)**: `tracks8/stairs.mts` 1.2 m flights at 14 / 16 / 18 / 20 m/s | 0.15 x 0.6 rides plain gas 5-14 | **0.15 x 0.6 plain gas pitches 47 / 38 / 53 deg and loops on the down-flight at 20; 0.15 x 0.8 dies at 18+; 0.12 x 0.6 rides but 38 deg at 20; 0.12 x 0.8 (8.5 deg) <= 21 deg at every speed and rides coast / gas-forward-then-coast too; 0.1 x 0.6 <= 33; a HELD full forward lean dies on every geometry at 16+ (the r8 row)** | E3's up-flights 0.12 x 0.8 (6 x 0.125 for the 0.75 m first flight); down-flights unchanged; X3 keeps 0.15 x 0.6 (extreme, 16 m past a checkpoint) |

Jump sizing uses `FEEL.jumpRange(v_lip, angleDeg, drop)` at the margin speed for the run-up available
(`FEEL.speedAfter`), and the landing must survive the raw speed (`speedAfterRaw`): a 4 x 1.2 kicker (17 deg)
at 12 m/s flies 6-8 m, a 6 x 1.5 (14 deg) at 12.4 m/s ~7 m. Gaps are sized at <= 0.7 x that. **The bot, not the
author, decides whether a track is clearable**; later rounds re-author against measured attempts.

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
| `gap` | width 3, depth 3, hazard water/kill/fire/**none**, rise 0, floor dirt | pit cut into the ground chain (walls lean in 0.05 m so x stays monotone) + hazard zone [lip - depth, lip - 0.6]. Lab extensions (physics-v2 §15, defaults leave every course and golden unchanged): `hazard: 'none'` is a dry pit (no hazard zone: a fall in is not a fault); `floor` other than dirt makes the floor edge the gap's OWN polyline (`obstacleIndex` = the gap, its `colliderIds`; render draws it as a ribbon of that surface: the rubber mattress); `rise` puts the far lip `rise` m above the near one, the far wall vertical from the floor to the ledge — the DSL steps the ground up across the pit (that segment is never ridden, so the 40 deg ground limit does not apply) and compile refuses a profile whose rise across the pit is not `rise` | width |
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

**Decor kinds (wave 1, mega build P2 "every biome gets its own set piece").** Two collider-free
kinds that `TrackObstacle.kind` may also hold (`DecorKind`, `DECOR_KINDS`, `isDecorKind`;
`TrackKind = ObstacleKind | DecorKind`, `isTrackKind`). They compile to a `placed` entry with an
empty `colliderIds`, contribute nothing to colliders, hazards, bounds or the hash, are ignored by
the checkpoint rule, the finish run-out check and spawn validation, and the builder appends them
AFTER every rideable obstacle so `obstacleIndex` of the real colliders — and therefore the golden
hash — does not move when a course gains one (compile test: the same course with and without
dressing hashes identically). Footprint 0: the DSL cursor does not advance.

| kind | params (default) | placement | render dressing |
|---|---|---|---|
| `arch` | span 6, height 5 (underside above pos.y), depth 6 (z), style girder (`start finish checkpoint crowd girder pipe ice`), surface metal | `arch()` centres it on the cursor: pos.x = cursor - span / 2 | gantry with banners / countdown / confetti (`start`, `finish`), post + sign (`checkpoint`), spectator bridge (`crowd`), truss / duct / cornice |
| `tunnel` | length 20, height 5, depth 6, style scaffold (`scaffold concrete pipe ice foundry`), lit true, surface concrete | `tunnel()` starts it at the cursor and runs `length` forward over whatever the course places under it | roof + walls + interior point lights (`lit`) or headlight-only; the "drop into shadowed scaffold" of rising clip 11 |

Render's `switch (po.kind)` default branch iterates `colliderIds`, so an undressed arch is
invisible, not a crash (render request: dress both kinds from `placed[].params`).

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
Consecutive flats merge into one profile segment. `gap({ rise })` (lab pits, §1.2 / §6) steps the ground up by `rise` across the pit: the cursor leaves the far lip `rise` m higher and everything after is authored at the ledge height.
Obstacles pin the profile at both ends so a slope after a box starts after the box.
`plank({ angleDeg, rise })` computes the board length; `steepPlank({ angleDeg, rise })` puts a
1.2 x 0.35 concave ramp fillet under the foot and climbs the remaining rise. The cursor is
kept on the 1e-6 grid so computed footprint ends and the next `pos.x` quantise identically.
`checkpoint()` records the spawn
(rear-wheel contact at cursor + 0.5, angle 0); `camera(key)` opens a `CameraKey` that runs
to the next key or the finish; `hint(text)` adds a HUD hint; `finish(runout = 30)` sets
`finishX` at the cursor, adds the run-out (round 6: `runout` is raised to `FINISH_RUNOUT.flat` = 30 m of flat at the finish height, then the catch — a 3 m x 0.75 ramp into a 2.5 m container — then the 35 deg end bank; `validateFinishRunout` checks flat, catch and that nothing stands on the run-out) and validates. Round 4 (authored to the stranger): `plateau(up, top, height)` = cosine rise, flat top, cosine fall with every crest grounded at 16 m/s (B1's tabletops), `descent(length, drop)` = a smooth descent whose top cannot launch, `bumpRow(count, h, groundedAt)` = cosine speed bumps grounded at that speed (B1's hump rows), `wave(length, dy, groundedAt)` asserts the same. `finish(runout, { checkpointRule: false })` opts a harness fixture — or a lab track whose checkpoints physics-v2 §15 fixes, §6 — out of the checkpoint rule; `{ catch: false }` opts a compile-test snippet out of the catch (fixtures keep it: `flat-test` carries the catch at 150 m by hand). Round 6: `steepPlank` takes `filletLength` / `filletHeight` — a 2.4 x 0.8 fillet in front of a >= 48 deg plank spreads the pitch-up over ~0.2 s (X1's 50 deg plank went from a 78-death stuck-restart wall to 3 deaths for reflex `good`; the 1.2 x 0.35 default stays on the <= 48 deg planks of E1).

**Set pieces (wave 1).** `setPiece(kind, label?)` opens an x range at the cursor; `endSetPiece()`
or the next `setPiece()` closes it and `finish()` closes an open one ON the finish line. Kinds
(`SetPieceKind`): `start finish crowd tunnel drop fire climb air balance`. Ranges must have length
and open in course order. They land in `meta.setPieces` (`TracksMeta = TrackMeta & { setPieces? }`;
read with `setPiecesOf(def)` from `src/tracks` until core adds the field to `TrackMeta` — requested)
and `describeTrack` prints them. Metadata only: no collider, no hash. Typical: `.arch({ style:
'start' }).setPiece('start', 'grid').flat(28).endSetPiece().checkpoint()` ... `.setPiece('air', 'the
crane jump')` ... `.arch({ style: 'finish' }).finish()`. Wave 2 authored them on hard / extreme per the storyboards and
round 10 on every playground (§7); as of round 10 the render reads NONE of them (§7 inventory: gates, crowd and
the biome set piece come from positions and the track id) — the render hooks are requested in §7.3.

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
speed), brake down without a stoppie. 541 m, CP 6 / 135 / 235 / 384. Round 8 (stranger round 4: 15.5 attempts
against 3-6, one of two sessions never finished; reflex `average` 35 on R5): the r4 recordings replayed tick by
tick (`tracks8/e3-s*-trace.txt`) — s1's first six and s2's first five deaths reproduce on HEAD at the same metres
(the recordings were made on R4 and diverge after that): 16 m/s with lean -1 into the 3 x 0.25 flight (wheelie,
loop); 10.5 m/s with lean +1 held (nose-dive over the top); a 3 m/s stall that looped backwards on the risers;
plain gas at 10 m/s, lean 0 (rear-first onto the box top at +16 deg, wheelie, loop across the top); gas + lean +1
at 7 m/s (loop); the 6-step flight left at 4-6 m/s under gas then coasted — both wheels off, +10 -> +150 deg in
0.7 s with NO input (a 22.6 deg flight is a kicker at <= 10 m/s under gas); and three deaths at 176-180 m that were
the two 0.9 m barrels standing at the second down-flight's foot (a brake + lean-back stall at the foot, then the
front wheel on a barrel). Re-authored to the measured envelope (§0 stairs): flights 5 / 8 / 8 / 8 x 0.15 m at a
0.6 m run (14 deg) onto 0.75 / 1.2 / 1.2 / 1.2 m tops (6 / 6 / 8 / 4 m), down-flights at 0.6 (demand 0.5) runs, no
barrels, the first flight 22 m from the line (a plain-gas rider arrives at ~13.5 m/s; above 14 the forward-lean
riders die on every flight), the pit 1.5 m onto a `gapLanding` 0.4 (a rider coasting off the descent at 8 m/s
clears it, half gas after the brake clears it; the old 2 m onto flat wanted >= 10 m/s and caught the rear wheel).
Intended technique per set piece: flight 1 — gas, lean 0, let the risers bounce you; flight 2 — the same at 12
m/s, coast the top; flight 3 — at speed, 8 m top; demand — gas up, brake down with lean back, release before the
lip, half gas across the pit. Reflex `average` 3, 5, 3, 2, 4, 3, 1, 2, 1 -> **3** (9/9; was 35, 9-seed 10), `good`
2, 1, 1, 1, 1, 1, 1, 1, 1 -> **1**; eight naive riders (plain gas 42.1 s, gas + 0.3, gas governed to 10 / 12 / 14,
coast-in-air) clear in one attempt. Top reflex death now the landing ramp after the pit (5 of 27 attempts,
air-gas-nose-up). Round 7 for the record: 0.25 x 0.6 flights, 3 / 6 / 6 / 8 risers onto 0.75 / 1.5 / 1.5 / 2.0 boxes,
2 m pit onto flat, `average` 3 / 4 / 9 on round 5's controller. Target 3-6, 70 s.

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
tips), 10 m, 5 x 1.5 kicker / 3 m / lip + 3 m plank at 1.5 / 2.5 m / 1.5 box. Round 6.1 (the fresh
skill-3 sweep on df7185f walled at 209 m, 43 %, on a 300 s and a 600 s run with ONE attempt and no fault:
a rear wheel arriving at exactly plank height slid under the one-way board's leading edge and hung
there with the front wheel on top — no body part touches anything, so no fault, no restart; reproduced
with a 9 m/s cruise controller from CP1, `m3probe`): every thin plank now has a 2 m landing lip rising
the last 0.25 m at its near end (a solid ramp, base h - 0.25, the `platform({ landing })` shape), so a
low rear wheel meets a 7 deg incline instead of the board's edge; planks 5 -> 4 m and 4 -> 3 m behind
the lips. Probe: cruise 8-13 m/s clears, 7 m/s is a pit fault (was: 9 m/s wedged for ever). Bot skill 3:
2 attempts, finished 37.3 s (both seeds, 300 s wall, sequential; the one fault is a pit short at the
first lip). Reflex `average` 25 / 6 / 8 -> 8 (round 5: 4 / 11 / 8). 489 m, CP 28 / 174 / 291 / 367. For
physics: a one-way polyline's open end lets a wheel whose centre crosses the surface level at the edge
pass through and hang under it. Target 8-12, 90 s.

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

### Round 9 (physics v2 R5, strangers r5) — hard / extreme as designed courses; per track: set pieces, technique, reflex `good` before -> after, bot, medals, stranger-readiness

Reflex = Rookie `good` over 9 seeds (scratch `tracks9/lib.mts`, seeds 3073702004-12, cap 50; sim budget **600 s on hard, 1800 s on extreme** — the harness's 300 s
cap ends a 750 m extreme run at ~30 attempts, so `harness:reflex` will read lower clears on x1/x3 until it takes `--max-sim-seconds`), HEAD 0f14d3d + this
tree, loadavg 4-7 (the box was quiet). "before" = the same instrument on the round-8 geometry at 300 s. Bot = skill 3, one seed, 600 s wall, sequential.
Gold = bot x 1.6 rounded up to 5 s and non-decreasing through the tier; platinum 0.85 x gold. Every hard track was also proven feature by feature in
`tracks9/probe.mts` (the §0 rows above) before the full-track runs; the full-track numbers are what is quoted.

| track | set pieces (storyboard beats built) | technique the player must discover | reflex `good` before -> after (clears) | bot | gold | stranger-ready |
|---|---|---|---|---|---|---|
| h1 Rooftop Wire (622 m, CP 28 / 191 / 331 / 480 / 574) | start grid; three roof climbs `smooth(28, 2)` (+6 m); walls 1.0 / 1.2 / 1.4 each at the foot of a roof with 6 / 6 / 10 slots (3.0 / 2.5 / 2.5 -> 2.0 pitch); `balance` The Wire with the crowd bridge; `drop` The Drop: 40 deg roll-off + 7 deg descent through a 30 m scaffold tunnel; crowd, finish gantry | front wheel up before the first slot and hold it — the slot pitch tightens with every roof; the wall is front onto the lip and hop the rear (A) or ride the ramp and hop the 0.3 m step (B); at the roof's end coast, lean back, let the descent catch you | 0/9 (wall @ 176 x127, wall @ 531) -> **10** (99, 10, 6, 10, 25, 2, 99, 2, 9; 7/9) | 2 att., 50.5 s (1 att. 46.2 s on the 4 m wall top) | 85 / 72 | **yes** |
| h2 Container Yard (637 m, CP 28 / 199 / 378 / 508) | start; chain A (8 m platforms 0.8, gaps 3 / 3 / 3 / 2, straight 2 x 0.4 kickers); `tunnel` under the stacks (30 m concrete, unlit); chain B stepping 1.2 -> 2.1 (gaps 4 / 3 / 3 / 2) onto the 2.4 m stack; `smooth(30, 2.4)` up to the apron, CP2; `air` The Crane Jump: 30 m apron, 6 x 1.5 over 5 m of water onto `gapLanding` 1.0; down, crowd stands, CP3; `air` Chain C: three platforms at 1.0, 3 m gaps, the last gap onto a landing incline | one speed for equal gaps; off the gas at the lip (a curved lip or gas through a straight one is a nose-up landing on the next lip); rear-first when the next platform is higher; the crane jump is full gas from the spawn, off at the lip, level, rear-first on the incline | 0/9 (chain B lips @ 266 / 276 x60, chain A @ 73) -> **9** (1, 9, 9, 99, 7, 27, 17, 6, 99; 7/9) | 1 att., 45.7 s | 85 / 72 | **yes** |
| h3 The Pour (615 m, CP 28 / 201 / 334 / 447) | start at the hall door; Ladle 1 (4 barrels); Ladle 2 (5) + the stop (8 m + 0.45 kerb); `smooth(28, -2)` into the casting `tunnel` (60 m foundry, lit): The Pour = two rows 22 m apart (5 then 6); crowd at the exit; Ladle 4 (6) into the demand stop (8 m brake, hump, 0.45 + 0.7 kerb onto a 6 m ramp); `smooth(40, -2)` home | ~12 m/s at a 22 deg lip and off the gas; land on the 14 deg ramp; in the tunnel do NOT brake between the rows; the stop: brake hard-back in 8 m, roll the hump, hop the kerb | 27 (6/9; ledge @ 494 / 390, the 2 m hop-gap) -> **11** (13, 8, 15, 11, 13, 17, 8, 6, 11; 9/9) | 1 att., 47.1 s | 85 / 72 | **yes** |
| x1 The Ascent (744 m, CP 76 / 205 / 400 / 546 / 636) | Base Camp; Face 1 45 / 3.6 from 30 m (12 m top, 22 m ramp); `balance` The Pillars (level caps 1.2 x 3 from a 0.8 ledge); +2 ridge; Face 2 45 / 3.9 (16 m top); +2; `balance` The Rising Pillars (1.2 -> 1.8) 16 m past CP2; +2; The Summit: 45 / 4.5 onto a 16 m shelf, the ice `tunnel`, three caps at the summit height over the crevasse, 24 m ramp; `drop` The Glissade `descent(56, 6)`; crowd, finish | lean forward, steady gas over the kicker foot and let the face take the speed — the crest is won at 3 m/s with the nose down, not up; a rolling 0.4 m hop onto the first cap then hold the line; the summit is the tallest face straight onto the ridge | 0/9 at 300 s (50 deg fillet @ 228 x83; 2/9 at 900 s on the storyboard's four faces) -> **33** (48, 29, 38, 32, 50, 47, 32, 29, 33; 9/9 at 1800 s) | 1 att., 55.7 s (60/60 walled with the 50 deg face and again with a crest on face 2) | 90 / 76 | yes (a long session: 33 attempts x ~40 s) |
| x2 The Rolling Mill (564 m, CP 24 / 181 / 335 / 396) | start; shelf drum + 2 m hop, logs, shelf drum with exit; `tunnel` The Duct (40 m pipe); see-saw -> 2.0 m shelf drum -> 15 m platform -> `fire` The Big Roller: straight 2 x 0.4 kicker over 4 m of melt onto the spinning r 1.0 top and off over a 2 m shelf; crowd gantry; `balance` The Pipe Run (three spinning tops @ 1.5); the demand: see-saw, 16 m, spinning shelf drum, 2 m hop onto a spinning drum and off over its shelf; 0.5 kerb; `smooth(40, -1.5)` home | roll a spinning top at the contact normal, never crest it above a crawl; ~9 m/s off the platform lands ON the roller; three hops in a row is the envelope — set the pitch on the first | 0/9 (pipe run tops 4-5 @ 370 / 373 x126) -> **4/9 at 15, 9, 16, 24** (the second spinning top of the demand @ 446 x36, its shelf ramp @ 437 x45) | 3 att., 56.8 s (2 att. 48.5-48.8 s on the earlier demand) | 95 / 81 | not yet: the extreme rule (>= 1/3 inside band-top, bot <= 3) is met, the hard rule (60 %) is not — a stranger round will say whether the second spinning top is a wall for people too |
| x3 The Stack (569 m, CP 28 / 187 / 248 / 327 / 410 / 471) | opener 45 / 3.6 onto a 12 m top, 22 x 2.1 ramp to the 1.5 / 1.0 / 0.5 cascade (the owed cascade entry); stairs; Hall Two `tunnel` with the hop ledge 6 m past CP1 and the drum; see-saw + wall + rails; the lipped chain (straight kickers); plaque; The Pour; The Stack: 45 / 4.5 onto a 16 m top, `arch` pipe, three chimney caps, 24 m ramp | every lesson once at speed; the hop ledge wants hop speed, not run-up (6 m past the checkpoint); the stack is X1's summit | 0/9 (cascade entry ramp @ 60 x54, 60 deg plank @ 473 x21) -> **29** (99, 16, 29, 99, 27, 99, 22, 44, 24; 6/9 at 1800 s; top death the see-saw tip-air @ 275-280 x58 — the m3 controller item) | 2 att., 51.0 s | 95 / 81 | yes |
| e3 Stairway (544 m, unchanged CPs) | up-flights 0.12 x 0.8 (see §0 stairs at flow speed) | plain gas rides every flight at every speed now; brake down | `average` 2 -> **2** (3, 1, 2, 4, 2, 2, 3, 3, 1; 9/9), `good` 2 -> **2** (9/9) | 1 att., 39.6 s | 70 / 60 (kept) | yes (a stranger re-run is owed: the change is for the 15 m/s riders) |
| m3 See-Saw | untouched | — | — | — | 70 / 60 | the 403-435 m cluster stays: the demand board (8 x 1.6 = 22.6 deg, the tallest measured board that rides), 14 m of flat after it and a 14 deg kicker are inside §0; the board tips only once the front axle passes the pivot, the far end is visibly hanging 1.5 m up on approach and the bike rides UP the board so the tip is felt as the board levels — telegraphed; the landing after the tip is 14 m of flat. The kicker at 421 "kicks the nose up 30-40 deg" under gas (the r7 lip finding: off the gas at the lip, B3's lesson). Strangers cleared in 5 and 11 (band 8-12): the physics and the board are right; left as is |

Renamed: h1 Rooftop Wire, h2 Container Yard, h3 The Pour, x1 The Ascent, x2 The Rolling Mill, x3 The Stack (the storyboard names; ids unchanged).

**What was tried and rejected (the death histograms, not taste).** H1: the storyboard's 10 slots @ 2.0 straight off the 1.4 m wall's hop on a 4 m top (46 of 67 deaths). H2: the 22 deg 5 x 2.0 crane kicker (6 / 9 / walled at 6 / 8 / 10 m), a 7 m gap from 26 m (70 deaths, 0 clears), the storyboard's 5.5 m chain C (0/9), 7 and 8 m LEVEL chains with any 4 m gap (0/9), alternating 3 / 4 gaps (0/9), a second stepping chain as the demand (2/9), the see-saw finish (0/9, 75 deaths on the board). H3: the 2 m hop-gap before the kerb (22, 6/9). X1: the 50 / 55 / 60 deg faces (a stuck-restart wall for the reflex on the track and a 60/60 wall for the bot), 40 and 42 deg kicker planks (1/9, 5/9), four faces (0/9 at 1800 s: each face's exit costs ~5), the 1.7 m-pitch cap hops from a standing start and the gap-onto-a-plank exit (0/9), a convex crest on the plank tops (reflex 8/9 but bot 0/60), rounded shoulders off the box tops (no change), the pillars off 20 m of rollers (8 a seed). X2: five and four spinning tops (1-4 of 9), the demand's shelf 2 m and 6 m off the board (0/9). X3: the crested 60 deg stack (0/9), the 12 x 2.2 cascade ramp (54 deaths), the hop ledge 16 m past CP1 (52 deaths).

**Round 9 requests.** *Harness (reflex):* (a) `--max-sim-seconds` 1800 for the extreme tier in the matrix (x1 / x3 clear at 24-50 attempts x ~40 s; 300 s reads 0/9 on a track people clear); (b) the see-saw model (round-10 open item) is now the top death on x3 (275-280 m) and the reason H2's demand cannot end on a board; (c) a stall-restart teaches the section memory nothing, so a fast first arrival followed by "slower" locks the reflex under a face it clears from a spawn — the on-track 50 deg wall against the fixture's 5. *Harness (bot):* x1's 60 identical faults at a box top (the convex crest) — the `NO_PLAN_FALLBACKS` cycle did not break it; a crest on a plank top is a shape the beam never tops. *Harness (goldens):* every hard / extreme `bot-3.json` and e3's are stale by hash (`--refresh-goldens`); `expected.json` may key on X2's pit hazard (`water` -> `fire`). *Physics:* nothing new; the 45 deg ceiling for a momentum climb and the level-chain nose-up landing are the v2 facts the tier is now built on. *Parent:* hard-tier strangers on h1 / h2 / h3 (bands 10-18 / 14-22 / 18-25) and x1 / x3; x2 and e3 after them. *Render:* the tunnels (h1 scaffold 30, h2 concrete 30 unlit, h3 foundry 60, x1 ice 12, x2 pipe 40, x3 concrete 50), the `drop` set pieces (h1's roll-off, x1's glissade) and the crowd arches are live data. *Boot:* `src/boot/plan.generated.ts` regenerated under `pnpm typecheck` with the current rider model byte sizes (not a tracks change).

### Round 8 (physics v2 R5, strangers r4) — per track: change, reflex before -> after, stranger recordings, top death, medals

Reflex = Rookie `average` median over 9 seeds (`good` where named), HEAD e8f2ec7 physics, loadavg 32-40 throughout
(the box carried other owners' sweeps; every wall time is contention-pessimistic). "before" = the round-9 harness
matrix on HEAD (3 seeds) / its 9-seed run where given. Recordings = the r4 / r5 stranger recordings replayed through
the node sim: they are OPEN-LOOP, so any change to a feature they ride changes their flight from that feature on —
"clears" means the replayed inputs still finish; the r5 set (b1-b3) is the only byte-faithful set on R5 physics (the
r4 set was recorded on R4 and diverges at its first flight even on the untouched tracks: e2 r4 s1/s2 do not finish
on HEAD before any edit). Every footprint change is absorbed in the following flat so nothing downstream moves.
Medal targets unchanged (no skill-3 clean time was re-run this round: the `bot-3.json` goldens of the seven changed
tracks are stale by hash and want the harness `--refresh-goldens` chain; x3's 48.2 s was a 2-attempt run).

| track | round-8 change (why) | reflex before -> after | recordings (before -> after) | top death after | medals |
|---|---|---|---|---|---|
| b2-lean-back | the two stair descents (4 x 0.3 @ 0.6 = 26.6 deg at 272 m, 3 x 0.33 @ 0.6 = 28.8 deg at 419 m) are 9.6 x 1.2 / 8 x 1.0 down-ramps (the panic-drop rule: a held lean-back loops down any flight >= 1.0 m; stranger r4 s1 looped on the second at 433 m) | average 1 (3 seeds) -> **1** (1,1,2,2,1,1,2,4,1; 9/9) | r5 s1 2 -> **1**, r5 s2 2 -> 2, r4 s1 1 -> 1, r4 s2 3 -> 2, r3 s1/s2 1 / 1 | ground @ 35 / 40 / 140 x1 each | 65 / 55 |
| b3-kicker-row | kicker 3 at 150 m 4 x 1.2 (16.7 deg) -> 6 x 1.2 (11.3 deg): reflex died on its landing at 170 m x4 (nose-high exit, brake tap in the air); measured (`tracks8/kicker.mts`): the brake tap lands on <= 11.3 deg lips at 10-14 m/s and endoes off 16.7 deg at 14 | average 7 (3 seeds) / 4 (9 seeds) -> **4** (4,2,4,2,3,4,2,4,4; 9/9) | r4 s1 2 -> 2, r4 s2 no finish -> **1**, r5 s2 4 -> 4, r5 s1 2 -> diverges at the changed kicker's flight (stops at 444 m, 94 %, input exhausted) | ramp @ 425.8 x4 (the demand landing's down-ramp, air-brake) | 65 / 55 |
| e1-uphill-weight | the 45 deg demand face ends at 3.1 m on a 2 x 0.6 convex crest (curve -0.4) onto an 8.6 m box (same footprint): the reflex topped the face at ~3.5 m/s and LAUNCHED off the plank's top edge — both wheels off for 1.2 s over the box, +22 -> +190 deg whatever the rider did (a wider box changed nothing: the bike never touched it); fixture `tracks8/e1crest.mts`, 6 seeds: plain 45 4/5/11/7/10/3, crest 1/1/2/3/1/1, a 2.5-3 m crest is a launch hump | average 7 (3 seeds) / 11 (9) -> 9 with the wide box alone -> **10** with the crest (7,10,8,7,15,17,11,6,11; 9/9): the crest removed the plank-top launch and the deaths moved 6 m on to the box's far edge onto the 22 m ramp (449.9 x30), reached at flow speed; at a 40 m run-in the fixture reads 4/2/1/2/2/1 and a rounded shoulder (4 x 0.6, curve -0.5), a 12 m top or a 30 m ramp all read the same (3/2/1/2/4/1 · 4/2/1/2/4/1 · 3/2/1/2/8/1) — the remaining site is the reflex's air-brake off a box edge at speed, not a shape | r4 s1 5 -> stops at the crested top (its inputs were slot-timed to the old top: 444 / 446 / 442), r4 s2 4 -> 6 | ramp @ 449.9 (before the crest) | 70 / 60 |
| e2-rear-wheel-first | demand: the 5 x 0.6 landing ramp + 8 m flat platform + 4 x 1.0 kicker over 4.5 m is a 12 x 0.6 landing ramp (2.9 deg) + 3 m platform + 5 x 1.0 kicker (11.3 deg) over 4 m (same footprint): the reflex landing from the 5 m gap at ~10 m/s rebounded off the ramp-to-platform kink and flew the flat platform with the gas on (27 x 9 seeds before the kicker); fixture `tracks8/e2fix.mts`, 9 seeds: round-7 shape 20/10/6/3/7/7, as first edited 3/3/17/4/16/2/3/1/2, this shape 6/2/6/3/2/1/2/7/5 | average 10 (3 seeds) / 19 (9) -> 13 with the wide platform -> **13** with the final shape (13,8,3,21,21,8,35,12,15; 8/9): the platform bounce is gone (box @ 505.4 x17 is now the landing ramp's top, air-brake), the 5 x 1.5 / 4 m lesson kicker at 191 m x12 is the other site; fixture median 3, max 7 — the full-track spread (3-35) is the reflex's, see requests (d) | r4 s1/s2 do not finish on HEAD before or after (R4 recordings, diverge at 56-80 m) | ramp @ 508.4 (before the reshape) | 70 / 60 |
| e3-stairway | see the E3 paragraph: 0.15 m risers, <= 1.2 m flights, no barrels, 1.5 m pit onto a landing ramp | average 35 (3) / 10 (9) -> **3** (9/9), good 14 -> **1** (9/9) | r4 s2 11-not-cleared -> the replayed inputs clear in 5; r4 s1 20 -> reaches 513 m in 20 (old-geometry inputs: not evidence) | ramp @ 420.5 x5 (the pit's landing ramp, air-gas-nose-up) | 70 / 60 |
| m1-hop-up | lesson hop at 119 m 16 -> 6 m past its checkpoint (`hopHeight` 0.65); two-stage 0.45 (5 m) + 0.85 -> 0.4 (8 m) + 0.75 from 8 m (it was harder than the demand: fixture as built `good` 1/30/1/5/26/4, new 2/2/5/10/3/1; the demand's 0.3 / 0.6 / ramp / 0.9 clears 1/1/1/1/1/1); the 0.45 + 2 m hop-across at 309 m is flow now (any hop-across right after the two-stage, reached downhill, was 167-258 total `average` attempts vs 17 without) | average 49 (1/3) / 44 (1/9) -> **7** (8,3,4,7,9,9,7,19,7; 9/9), good 17 (2/3) / 22 (5/9) -> **7** (9/9) | — | ledge @ 109 x30 (stuck at the face: the 6 m approach's late hops), gap @ 113 x7 | 70 / 60 |
| m2-drum-roll | none | average 7, good 7 (8,7,5,10,5,7,22,5,4; 9/9) | — | ramp @ 311 x10 | 70 / 60 |
| m3-see-saw | none kept (an 8 x 1.3 = 17.5 deg demand board was tried: good 12 vs 13, inside the noise). Traced: the demand board's tip-air (the bike leaves the falling far end at 6 m/s, the reflex's gas / brake taps in that air loop it, ground @ 410 x17) and the 6 x 1.5 kicker before the thin plank (the reflex reads the lipped plank as a ledge and holds a hop-preload — lean -1 — through the lip, box @ 438.9 x18-30): both controller, see requests | good 11 (3) -> 13 (14,5,11,10,21,19,17,13,5; 9/9) | — | box @ 438.9 (air-gas-nose-up) | 70 / 60 |
| x3-gauntlet | 60 deg plank ends at 3.9 m on a 2 x 0.6 convex crest (curve -0.4) onto the 3 m box (+1.65 m, 508 m): the skill-3 Rookie bot's 50 faults were all at 477.0 m (0.8 m past the plank top, "plan returned no actions; playing gas" — from the CP5 spawn its player memory bans every line it has and it repeats the identical launch); the stairs section mirrors E3 (8 x 0.15 @ 0.6, 1.2 m box, 8 x 0.15 @ 0.5, same footprint) | **skill-3 bot: 50 attempts capped at 95 % -> 2 attempts, finished 48.23 s** (one fault at the 60 deg face; 99 s wall at loadavg 35); finale fixture `tracks8/x3fin.mts` 1 / 1 / 2 at 20 / 24 / 30 m run-ins (plain top: 2 / 1 / stuck x15) | — | — | 90 / 76 |

Naive full-track riders (`tracks8/naive.mts`, node sim with respawns): the new E3 clears for all eight (plain gas 42.1 s,
gas + 0.3, gas governed to 10 / 12 / 14, gas-coast-in-air, both governed variants) in one attempt.

**Round 8 requests.** *Harness (reflex):* (a) `hop-preload` fires on a 14 deg kicker whose far side is a lipped plank
(m3 421-436 m: lean -1 held through a kicker lip = +30-56 deg exit, box @ 438.9 x30 for `good`); (b) in see-saw tip-air
(m3 405 m) the gas / brake taps loop a bike that would land if left alone (physics: <= 22 deg boards ride with a cruise
rider); (c) the stoppie: `too-fast-brake` brakes with lean 0 from 11 m/s and rides the front wheel for 4 m into the
ledge face (m1 112-118 m) — a brake wants lean -0.5 on the ground; (d) e2 / e3 / m1 / m3 need 9 seeds — the 3-seed
medians moved 3x under identical geometry in this round's fixtures. *Harness (bot):* from a checkpoint spawn the
skill-3 bot's `ban(rootHash, …)` memory drives "plan returned no actions; playing gas" into the identical crash 47
times (x3 477.0 m, fixture 36.2 m at a 30 m run-in): a banned root wants a randomised or perturbed fallback, not
plain gas. *Harness (goldens):* `bot-3.json` for b2 / b3 / e1 / e2 / e3 / m1 / x3 are stale by hash — `--refresh-goldens`.
*Physics:* the stair loop is a wheel-radius fact (contact normal 75 deg at h = 0.25) the tracks now avoid; a held
lean-back down a 0.075 m / 0.9 m-run flight still loops (`tracks8/stairs.mts`), so no flight is panic-proof — if
stairs are to be a beginner lesson again, the riser impulse on a rear-only contact is the lever. *Parent:* a
stranger re-run on e3 (and a first medium round on m1 / m2) is the next measurement; e1 (10) and e2 (13) stay out of
band for the reflex `average` on sites that are the controller's (air-brake off a box edge at speed; the 3-35 seed
spread) while the strangers pass both at 5.5 / 6.5 — the bands should be judged on the stranger re-run.

### Round 7 (physics v2) — what changed per course and the same-controller reflex before / after

Physics `physics-v2` 9b4275c, 3 seeds, cap 50 / 300 s, Rookie unless "P"; "before" is the round-6 geometry
and "after" the round-7 geometry, BOTH on the harness owner's work-in-progress v2 reflex controller (src
6714cf44, run 22:08 UTC) — the shipped controller at the flip (src 955cce67) looped the Rookie on flat flow
(b1 median 5 / 5 / 4 for novice / average / good on a 1-1 band) so those numbers are not a track verdict and
are kept in the scratch logs only. Medians are attempts; (c/3) clears; % best progress. Skill-3 bot: v2 clear
time before -> after where re-run (1 attempt each unless noted). Gold = provisional (bot x 1.6, the v1
stranger / bot clean ratio on b1, rounded up to 5 s, non-decreasing through the tier); platinum = 0.85 x gold
(core `rules.ts`) — a `platinumTimeS` meta field is requested so it can be pinned to bot x 1.10 instead.

| track | round-7 change (why) | novice before -> after | average | good | band | top death after | bot-3 s | gold / plat s |
|---|---|---|---|---|---|---|---|---|
| b1-first-ride | none (naive full-throttle clears on v2); target only | 5 (3/3) -> 5 (3/3) | 4 -> 4 (3/3) | 1 -> 1 (3/3, 55.5 s) | 1-1 | ground @ 565 (air-brake) | 40.65 | 65 / 55 |
| b2-lean-back | none (drops ride neutral to 3 m); target only | 30 (63 %) -> 30 | 27 (1/3) -> 27 | 24 (2/3) -> 24 | 1-2 | ground @ 305 (air-brake) | 38.13 | 65 / 55 |
| b3-kicker-row | every kicker straight (curve 0.3 gone), the two 5x1.5 "22 deg" lips are 6x1.5 (14 deg), a 12 m landing slope under the first kicker | 38 (50 %) -> 35 (71 %); P 46 (26 %) -> 43 (51 %) | 37 (75 %) -> 36 (83 %) | 23 (2/3) -> 22 (3/3) | 1-2 | ramp @ 70 (air-gas-nose-up) | 33.44 | 65 / 55 |
| e1-uphill-weight | 40 / 36 / demand 45 deg planks over the `kickerPlank` foot (was plain 40 / 36, steepPlank 48) | 33 (32 %) -> 33 (32 %) | 35 (66 %) -> 33 (77 %) | 31 (1/3) -> 35 (90 %) | 2-4 | ramp @ 75.2 (air-gas-nose-up: the first box's down-ramp, a controller flight habit) | 42.36 -> 42.13 | 70 / 60 |
| e2-rear-wheel-first | 6 m gap -> 5 m; platform kicker 3x1.0 (18 deg) -> 4x1.0 (14); its gap 5 -> 4.5 | 37 (43 %) -> 36 (46 %) | 39 (45 %) -> 36 (53 %) | 30 (1/3) -> 30 (85 %) | 3-5 | box @ 72 (air-brake) | 43.46 | 70 / 60 |
| e3-stairway | every up-flight 0.25 x 0.6 m run (22.6 deg, was 0.5 / 26.6); box tops 6 m; down-flights 0.5 runs, 0.25 risers | 43 (45 %) -> 43 (40 %) | 46 (46 %) -> 38 (79 %) | 45 (35 %) -> 44 (36 %) | 3-6 | stair @ 164.5 (stuck-restart: the WIP controller stalls on the flight at low speed) | 41.44 -> 42.19 | 70 / 60 |
| m1-hop-up | lesson ledges 0.4 / 0.45, two-stage 0.45 + 0.85 (rises 0.45 / 0.4), demand stays 0.3-step 0.9 (no single rise > 0.5) | 51 (39 %) -> 51 (45 %) | 51 (65 %) -> 49 (71 %) | 32 (2/3) -> 46 (1/3) | 5-9 | ledge @ 119 (nose-low: the WIP hop's timing) | 32.58 -> 36.99 | 70 / 60 |
| m2-drum-roll | second drum 0.4 m proud (was 0.5); demand pyramid 5 x 2 rows (was 4 x 3 = 1.34 m) | 39 (54 %) -> 40 (40 %) | 36 (31 %) -> 39 (40 %) | 36 (88 %) -> 38 (89 %) | 6-12 | drum @ 47.6 / 53.2 (air rules on the bumps at 12 m/s) | 38.78 | 70 / 60 |
| m3-see-saw | 6x1.5 -> 8x1.5 (21 deg), demand 8x2.0 -> 8x1.6 (21.8), 14 m after each board before its kicker (was 10), those kickers 6x1.5 (14 deg, were 5x1.5) and the thin landings 6 / 4 m (were 4 / 3): with 14 m the bot flew a 4 m board and crashed 3.7 m onto it off the 16.7 deg lip | 47 (47 %) -> 47 (47 %) | 42 (52 %) -> 38 (70 %); P 45 (47 %) -> 42 (76 %) | 38 (87 %) -> 35 (1/3, 294 s) | 8-12 | ramp @ 202.6 / 211.6 (the 14 deg kicker and the plank lip after the 8x1.5 board: air rules at 12 m/s) | 51.08 (3 att.) -> **40.71 (1 att.)** | 70 / 60 |
| h1-wheelie-wire (P) | B-line step 0.4 on all three walls (was 0.5); start / balance / finish set pieces + gantries | 50 (30 %) -> 44 (34 %); P 49 -> 48 | 43 (30 %) -> 43 (44 %); P 51 -> 46 (41 %) | 51 -> 50; P 51 -> 51 (32 %) | 10-18 | wall @ 175.8 (nose-low: 1.0 m lip / 0.4 hop) | 44.57 | 75 / 64 |
| h2-gap-chain (P) | geometry unchanged (all lips <= 17 deg, board 22 deg); start / air / finish set pieces | 44 (14 %) -> 44 | 49 (17 %) -> 49 | 45 (27 %) -> 45; P 48 -> 48 | 14-22 | ramp @ 62 (air-gas-nose-up on the first 14 deg kicker: controller) | 46.28 | 75 / 64 |
| h3-fire-line (P) | fire kickers straight 21.8 deg (curve 0.3 gone), ledges 0.45 (was 0.5); fire set pieces per row + gantries | 36 (53 %) -> 33 (50 %) | 34 (74 %) -> 33 (90 %) | 34 (90 %) -> 31 (1/3, 288 s); P 41 -> 43 (73 %) | 18-25 | ground @ 85-95 (air rules after the first landing ramp) | 45.10 | 75 / 64 |
| x1-vertical-limit (P) | face 1 `kickerPlank` 45 (was steepPlank 45), faces 2-4 keep the 2.4 x 0.8 fillet (50 / 55 / 60: bot technique); every box top 6 m (was 4: the climb throw leaves the rider forward and a box edge 4 m later onto the 22 m ramp is the measured +0.5 / >= 1.5 m drop crash — bot 3 attempts at 58 m, then 32 at the 50 deg face's exit); side-tight keys at pitch 12 deg; climb set pieces; 798 m | 31 (54 %) -> 33 (34 %); P 42 -> 42 | 30 (72 %) -> 35 (34 %); P 40 -> 40 | 34 (63 %) -> 32 (53 %); P 38 -> 39 | 30-45 | ramp @ 227.9 / plank @ 230.3 (the 50 deg face: v2 has no stranger line up 50, the bot's hop move only) | 56.07 -> 62.56 (2 att., one crash at the 55 deg face's box top; gold keeps the ~56 s clean time) | 90 / 76 |
| x2-pipe-dream (P) | both 8x2.0 boards -> 8x1.6; log pyramid 5 x 2 rows (was 4 x 3); balance set piece + gantries | 41 (24 %) -> 42 (21 %); P 45 -> 48 | 40 (15 %) -> 41 (22 %); P 45 -> 42 | 39 (45 %) -> 37 (44 %); P 40 -> 44 | 40-60 | ramp @ 62.6 / 74.6 (the log-step entry ramps: air rules) | 42.48 | 90 / 76 |
| x3-gauntlet (P) | opener `kickerPlank` 45 (was steepPlank 48) with an 8 m top (was 4) before the cascade, stairs 0.6 runs, see-saw 8x1.6, B-line step 0.4, fire kicker straight, the exit plank's foot on the ground (height 1.5, was 2.0 = a 0.5 m step off a -30 deg plank: the WIP bot died there 15 times); set pieces; 507 m | 36 (27 %) -> 38 (28 %); P 46 -> 44 | 35 (25 %) -> 33 (28 %); P 46 -> 41 | 33 (27 %) -> 39 (27 %); P 46 -> 44 | 60-80 | ramp @ 60.2 (air-brake-nose-down: the 12 m down-ramp off the opener's box onto the cascade — riders now pass the opener; the cascade entry is the next feature to re-author, e.g. a grounded `smooth` descent instead of a box edge) | 45.08 -> 42.43 (1 att.; the WIP bot on the round-6 geometry: 2 att. 53.4 s) | 90 / 76 |
| lab-physics-test | ledge 1.6 -> 1.5 (§6.1) | 1 -> 2 (3/3); P 9 -> 6 | 1 -> 2 (3/3); P 4 -> 4 | 1 -> 1 (9.2 s); P 2 -> 2 | 3-8 | ground @ 70-85 (the crest) | 8.13 -> 8.10 | 12 / 10 |

Reading the table: where the top death was geometric the change moved it (b3, e3 average, m3 Pro, h3 good's
first clear, x3's riders reach the cascade); where it is the controller's flight habit (`air-gas-nose-up` /
`air-brake-nose-down` on flat ground and 14 deg kickers) nothing a course can do short of removing every jump
helps, and those rows are flat before -> after by construction. Two rows went the wrong way: m1 `good` (32 -> 46,
the deaths moved from the 0.5 m lesson ledge to the 0.85 stage — the WIP hop recipe lands 25-55 deg nose-up
and the bot brakes in the air) and x3 `good` (33 -> 39: progress in x, not attempts — the opener is passed and
the cascade behind it is the new wall). The
bands are NOT re-judged this round: the instrument is being re-tuned under the tracks. Next round re-runs this
table on the finished v2 reflex controller and edits the TRACK where a median lands outside the band (§3).

**Round 7 requests.** *Harness:* the reflex controller is the round's blocker — on v2 it (a) allows lean -0.3 with
the gas on the ground (v2 Rookie critical lean ~ -0.1: every flat-flow loop in the tables), (b) holds gas + lean -1
through touchdown after a nose-down flight (`air-gas-nose-up` on 14 deg kickers and box-top drops), (c) launches the
Pro at lean 0 from every spawn (lab-flat-200 median 8-13), (d) stalls on 22.6 deg stair flights (`stuck-restart` at
e3 164.5); the tables above must be re-run on the finished controller before any band is judged; the search bot's
attempts are chaotic under metre-level geometry shifts (x1: 3 -> 32 -> 2 attempts across three 4 m box-width
edits), so a 3-seed median with a 600 s wall is the number to quote. *Physics:* the lab's >= 0.1 m margin is a
controller question now (`lipHopper`'s 8 m/s apex equals the ledge height on all three geometries; the 7 m/s hop
lands -26 deg) — a hop timed at the apex or a `ledgeHopper` that lands level is the next probe; the seesaw
tip-air (0.4 s off a 29 deg board) is a physics fact the curriculum now avoids rather than a rebound artefact —
if 29 deg boards are wanted back, the board's angular damping is the lever; the 0.9 m ledge row of CONTRACT §2.5
is unreachable on the Rookie (0 of 22 timings) and should be re-stated as 0.6 m (0.8 Pro). *Core:* a
`platinumTimeS` meta field so platinum can be pinned to bot x 1.10 (today 0.85 x gold = bot x 1.36). *Render:* the
new `setPieces` / `arch` / `tunnel` markers on all six hard / extreme courses are live data now (start / finish
gantries, H1 crowd bridge, fire rows, climbs, X2's pipe run); the X1 / X3 `side-tight` keys carry `pitch: 12 deg`
(0.209 rad) — if the rig's inner band rejects it on the 4.5 m faces, say so and the key goes back to the default.

**Camera (render r11):** every course keeps the mode defaults (`side` 16 / 21 deg is the reference frame);
the only explicit override is `pitch: 12 deg` on the `side-tight` keys over X1's four faces and X3's opener and
60 deg plank — a 3.6-4.5 m wall read as a floor at 19 deg. Nothing else asked for a different frame.

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
| m3-see-saw | 8-12 | 15, 28, 14 -> 15 | round 6.1: 25, 6, 8 -> **8** | 4, 7, 4 | round 6.1: **2 attempts, finished 37.3 s** (x2 seeds, 300 s wall; was 1 attempt walled at 209 m without a fault) | pass |
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
- **Wave 1 of the mega build (round 7, done, design only)** — `tracks-storyboards.md`: h1-h3 /
  x1-x3 re-designed on paper as technique stories with a set piece each (H1 "Rooftop Wire": +6 m of
  roofline, the wire on the parapet, a 40 deg roll-off into a scaffold tunnel; H2 "Container Yard":
  chains up the stacks, a 22 deg apron jump over 8 m of water; H3 "The Pour": two fire rows 22 m
  apart inside a foundry tunnel; X1 "The Ascent": +8 m of glacier, the 60 deg face into an ice cave
  with the caps, a 70 m glissade home; X2 "The Rolling Mill": the 4 m gap over a fire pit onto the
  spinning roller; X3 "The Stack": the round-6 sequence given halls, plaques and the chimney caps),
  m1-m3 sanity-passed, decor kinds + set-piece markers implemented (no course uses them yet), §5
  wave 2 plan. Every golden and the round-6 matrix unchanged. Finding: every hard / extreme track
  today is a list of one probe-cleared shape on flat ground (H3 four identical fire kickers, H1 five
  slot rows, X1 four sawtooth planks giving every metre back); the storyboards keep those exact
  shapes and change the ORDER, the HEIGHT and what surrounds them — the reflex / bot numbers should
  therefore carry over, and the `[wave 2 probe]` list in the storyboards names the only new
  exposures (the roll-off drop, the apron jump, the tunnel fire pair, the summit caps).
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

## 5. Wave 2 plan (re-author hard / extreme to the storyboards; starts at the `physics-v2` tag)

**Step 0 — re-measure, author nothing.** On `physics-v2` with the Pro bike, re-run the §0 probes
(`harness` scratch probes, 3-6 seeds): brake from 10 m/s, 0 -> 16 m/s, stationary / rolling hop
apex, 45 / 50 / 55 / 60 deg climb (with the 2.4 x 0.8 fillet), see-saw tip, drum-top 2 m hop, the
cap row 1.2 -> 1.8, the 40 deg roll-off + 7 deg descent at 6 / 10 / 13 m/s, and the 22 deg kicker
over 6 / 8 / 10 m onto `gapLanding` 1.0 from 26 m. Update §0 and `FEEL`; only then touch a course.

**Order** (one track per commit, acceptance re-run before the next; the subject states the
finding): 1. **H3** (smallest change: re-sequence + the tunnel pair; proves the arch / tunnel /
set-piece pipeline end to end with render) -> 2. **H1** (height + drop: the first track with a
profile that climbs; proves `smooth` climbs under the checkpoint rule) -> 3. **X1** (the same
height grammar at extreme scale; the summit cap probe) -> 4. **H2** (the apron jump probe) ->
5. **X2** (hazard re-type + flow, smallest extreme change) -> 6. **X3** (dressing only, last,
because it is the exam and its geometry is the round-6 bot-cleared one) -> 7. m1-m3 gantries and
crowds (meta / decor only, no colliders). Stranger round after 1-2 and after 3-4 (harness).

**Validators as built (round 9, `src/tracks/validate.ts`, enforced on every curriculum track by `validators.test.ts`, 24 tests).** The eight that
shipped are the P3 amendment's list, each a pure function over `TrackDef` returning its violations: 1 `checkRunout` (the round-6 run-out),
2 `checkCheckpointSpacing` (CP0 <= 90 m from the line, consecutive spawns 60-240 m: 12-18 s of bot time at 13 m/s is 156-234, a technical section
at 7 m/s wants >= 60), 3 `checkPanicDrop` (beginner / easy: every drop over 0.5 m off a box / ledge / wall exits on a straight down-ramp >= 8 x h,
never a bare edge; a stair flight down >= 1.0 m only on beginner — E3 teaches the brake-down; a kicker's far edge is a launch, sized by rule 7),
4 `checkSeesaws` (resting angle <= 23 deg: 8 x 1.6 = 22.6 is the tallest measured board that rides), 5 `checkLips` (below hard every free-standing
kicker >= 0.8 m is straight and <= 17 deg; climb ramps onto a shelf are not kickers; `smallGap`'s curve-0.3 lips <= 1.2 m over <= 3 m on b3 / e2
are a recorded exception — stranger-passed in rounds 4-5, kept until a stranger round proves the straight shape), 6 `checkHopHeights` (no single
rise above 0.6 m off flat ground or a touching solid; a lip wall must be a `steppedWall`; boxes fed by a plank / drum / see-saw / stair / pole row
within 1 m are climbs or landings), 7 `checkRunupJumps` (a gap launched off an up-ramp after >= 10 m of flat is <= `FEEL.jumpRange(FEEL.speedAfter
(runup), lipDeg)` at lip height, +0.5 m onto a landing incline, at most 0.5 m of drop credited below the lip — H2's 7 m from 26 m fails, 5 m from
30 m passes), 8 `checkMedalsMonotone` (`targetTimeS` non-decreasing through and across the tiers). The wave-2 list below (`maxRepeats`,
`breatherAfterDemand`, `density`, `story`, `setPieces`, `heightBudget`, `lineB`) is still design: `lineB` and `checkpointSpacing` are covered by 6 and 2.

**Validator rules as first planned** (each a pure function over
`TrackDef` like `auditCheckpoints`, enforced in `finish()` for tiers >= hard, warned below):

1. `maxRepeats` — a *feature signature* is kind + its key params rounded (plank angle to 5 deg,
   heights to 0.1 m, barrel count, slot pitch to 0.5 m, chain platform width to 0.5 m). No
   signature appears more than **twice** per track unless each repeat changes one key param by
   >= 15 % in one direction (escalation: H1's 1.0 -> 1.2 -> 1.4 walls pass, H3's four 5 x 2.0
   kickers fail unless barrels / context differ — the storyboard makes them 4 / 5 / 5 + 6 / 6).
2. `breatherAfterDemand` — after any speed feature (`Feature.speed !== false`, a plank >= 50 deg,
   a wall >= 1.2, a pole row, a gap >= 4 m) there are >= 12 m of flat or flow (`Feature.flow`)
   before the next technical feature, and after the set piece >= 25 m. The existing "no rise
   within 10 m of a drop exit" rule becomes a case of this.
3. `density` — no 60 m window holds more than three speed features (X3 exempt: it is the exam,
   capped at four).
4. `story` — the track's `technique` feature kind appears >= 3 times with a monotone key param
   (teach -> repeat -> demand), and the demand instance is the LAST technical feature before the
   finish flow (X1 exempt: the summit is set piece and demand at once).
5. `setPieces` — every hard / extreme track declares `start`, `finish` and >= 1 of `drop fire
   climb air balance tunnel`; each non-gantry set piece range contains >= 1 feature and lies inside
   a camera key that is not the default; `tunnel` ranges are covered by a `tunnel` decor of the same
   length (+- 2 m) and `start` / `finish` ranges by an `arch` of that style.
6. `heightBudget` — net elevation between consecutive checkpoints <= 2.5 m and every climb is a
   `smooth` grounded at 16 m/s (`FEEL.smoothLengthFor`) or a `slope` <= 20 deg followed by >= 4 m
   of flat; a `slope` steeper than 30 deg is only legal as a descent (the roll-off) and must be
   followed by a descent of <= 10 deg for >= 6 x its drop.
7. `lineB` — a lip wall >= 1.0, a plank >= 55 deg, a pole row: either a B line exists (`steppedWall`
   ramp, ledge under the first cap) or the feature is inside the last third of the track (round 5's
   rule, made a validator).
8. `checkpointSpacing` — 90-200 m between consecutive spawns (12-18 s of bot time), on top of the
   round-4 checkpoint rule.

**Acceptance held per re-authored track** (all of it before the commit, on `physics-v2`, sequential
bot, 600 s wall):

- search bot skill 3 clears: hard <= 20 attempts, extreme <= 60 (X3 <= 60 at 500 m);
- reflex `good` >= 60 % of finishX on 3 seeds AND (new, MEGA_PLAN P3) `good` clears >= 1 of 3 seeds
  on hard; reflex `average` >= 40 % on hard;
- bot clean time inside band: hard 30-40 s, extreme 40-55 s (human 45-60 / 60-90 s);
- every `[wave 2 probe]` in the storyboards run first and recorded in `tracks.md` §0;
- 0 frames out of the camera box on every set piece (harness gate, `high34` / `low` keys included);
- determinism: a recorded skill-3 input replays byte-identical (`harness/gate/determinism.ts`);
- `pnpm vitest run src/tracks` green with the new validators, goldens bumped ON PURPOSE
  (`UPDATE_GOLDEN=1`) only for the track in the commit;
- stranger median inside `attemptsBand` after the stranger round, else the TRACK is edited, never
  the band (§3 tuning rule); tier medians non-decreasing.

## 6. Lab tracks (`src/tracks/courses/lab.ts`; physics-v2 §15 / §16.4, MEGA_PLAN P0)

Two tracks with `lab-` ids, registered LAST (`ALL_TRACKS = [fixtures, ...CURRICULUM, ...LAB_TRACKS]`,
`LAB_TRACKS`, `isLabTrackId`). Core-game shows them under a "Lab" section; `meta.hints = ['physics']`
on both turns on the physics HUD (physics-v2 §15 "HUD on this level only"). They are the proving
ground for every physics change: physics-v2 §16.4 — "`lab-physics-test` is authored first and gates
every later physics round". Geometry is frozen by golden hash (`f99707f44193c58b` / `a5372af3c4fbcb76`; round 7 lowered the ledge 0.10 m to 1.5, see the note under the x table)
AND pinned to the metre in `tracks.test.ts` ("lab-physics-test (physics-v2 §15)"), so a drift from the
spec fails with a number. Both compile deterministically and `describeTrack` prints them with the suite.

### 6.1 `lab-physics-test` — "Physics Test" (tier medium, biome industrial, technique "the bunny hop", attemptsBand [3, 8], targetTimeS 12 (round 7: skill-3 bot 8.1 s x 1.6))

**Round 7 (physics v2):** the ledge is **+1.5** (0.3 m above the lip; was +1.6 / 0.4). Measured with the physics
owner's `lipHopper` on v2 (both classes, 6-9 m/s) on three in-memory variants — as authored, the ledge 0.10 m
lower, and a 45 deg chamfer on the far wall's top corner (a hand-edited polyline: the vocabulary cannot express
it — a `ramp` inside the gap's footprint is rejected as an overlap and `gap` has no chamfer param) — NONE reaches
physics-v2 §15's >= 0.1 m of clear air: the well-timed hop at 8-9 m/s rolls the rear over the corner at -0.06 m
on all three (the hop's apex at 8 m/s is 1.6-1.8 m, the ledge height; the 7 m/s hop flies higher and lands -26
deg into the face), and a 0.15 s late hop is a crash into the pit at 7-9 m/s on all three. The lower ledge was
chosen because it is expressible, keeps the level a test (a clean hop clears at 8-9 on both classes; no hop at
7-9 is still a crash on the Rookie), puts the step inside the v2 gas-hop's clear-air band (0.3-0.6 m at 5 m/s)
and turns the Pro's rolled 8 m/s miss into a mattress landing. The margin the spec asks for is now a controller
question (a hop timed at its apex, the -26 deg 7 m/s landing), raised with physics. Every 1.6 in the table
below reads 1.5, the crest peak 2.1, and the finish run-out sits at +1.5.

Authored to physics-v2 §15 with the DSL (`ramp` + `box` + `gap` + ground; 100 m, 3 course obstacles):

```
x   0 - 40    run-up, flat dirt (ground polyline #0: (-10,0)-(40,0)); start spawn at x = 0 (CONTRACT §2.4)
x  40 - 46    take-off: ramp 6 x 1.2, wood (#4, obstacle 0: (40,0)-(46,1.2), 11.31 deg)
x  46 - 46.3  lip: box 0.3 x 1.2, wood (#5, obstacle 1: (46,1.2)-(46.3,1.2)-(46.3,0)); its back face and the
              pit's near wall (#1: (46.3,0)-(46.35,-1.5)) are one vertical drop from +1.2 to -1.5
x  46.3-49.3  pit: gap width 3, depth 1.5, rise 1.6, hazard none, floor rubber (obstacle 2). Floor at -1.5 m on the
              rubber mattress (#6, owned by the gap: (46.35,-1.5)-(49.25,-1.5)). No hazard zone: landing short is a
              fall onto the mattress, not a fault (bounds.minY -1.5, oobY -7.5)
x  49.3       landing ledge: the far wall is vertical from -1.5 to +1.6 ((49.25,-1.5)-(49.3,1.6), start of #2);
              the ledge top is 0.4 m above the lip
x  49.3-100   run-out, flat dirt at +1.6 (ground #2) with the 20 x 0.6 m cosine crest at 70-90 (peak 2.2 m at
              x = 80; crest radius 33.8 m: leaves the ground above sqrt(g R) = 18.2 m/s — the "full gas over a
              crest" check, deliberately NOT grounded at 20 m/s); finish at x = 100
x 100 - 143   the standard finish run-out: 30 m flat at +1.6, catch ramp 3 x 0.75 wood at 130 (obstacle 3), 2.4 x
              2.5 box at 133 (obstacle 4), end bank to +5.6
checkpoints:  30 (spawn 30.5, before the ramp), 62 (spawn 62.5, after the ledge)
```

Compiled obstacle list (`describeTrack`): `#0 ramp @40.0 y=0 length=6 height=1.2` · `#1 box @46.0 y=0
width=0.3 height=1.2` · `#2 gap @46.3 y=0 width=3 depth=1.5 hazard=none rise=1.6 floor=rubber` · `#3 ramp
@130.0 y=1.6 length=3 height=0.75` · `#4 box @133.0 y=1.6 width=2.4 height=2.5`; 9 colliders, 0 hazards.

**Deviations from the §15 text, and why (all cosmetic to the physics being measured):**

- *Ledge surface.* §15 says a 12 m concrete ledge; here the ledge and the whole run-out are the ground
  (dirt) at +1.6 (`gap.rise`). A solid's top is not ground: the run-out, the crest and the 62 m spawn
  have to sit at the ledge height, and a 12 m box followed by ground at 0 would put a 1.6 m drop and a
  40 deg climb behind it. The parent's surface list ("dirt run-up, wood lip, rubber mattress, dirt
  ledge") is what is built.
- *Return ramp.* §15's "ride back up a 15 deg return ramp to the run-up" is not authored: the world is
  a heightfield (x monotone) so nothing can run back under the take-off, and the bike has no reverse.
  A rider on the mattress is not faulted; he restarts at the 30 m checkpoint (one tick, one frame).
- *Start.* §15 says "start at x = 2"; the builder spawns at x = 0 on the same flat (CONTRACT §2.4). The
  run-up to the take-off foot is 40 m either way (§15's own header says 40 m).
- *Ledge length.* §15 says 12 m long and "61-100 run-out"; the ledge here IS the run-out from 49.3 on,
  so the second checkpoint at 62 sits 12.7 m onto it.

**Checkpoint-rule opt-outs (`finish(30, { checkpointRule: false })`; the test pins exactly these two
violations and nothing else):**

1. cp0 at x = 30: 9.5 m from the spawn (30.5) to the take-off foot (40); the rule wants 15 m for a gap.
   §15 fixes the checkpoint at 30 "before the ramp" on purpose — the hop's working arrival speed is
   6-9 m/s (`FEEL.speedAfter(9.5)` = 7.5 m/s; from the start line the same rider arrives at ~15 m/s and
   has to modulate). (`auditCheckpoints` reports 0.3 m because it measures a ramp -> box -> gap chain at
   the gap; the honest figure is 9.5 m.)
2. cp1 at x = 62: 6.7 m after the pit's landing zone (49.3 + 6 m carry); the rule wants 8. §15 fixes it at
   62 "after the ledge"; the landing on the ledge top is over by ~55 m at any hop speed, and 62 leaves
   8 m of flat at +1.6 before the crest.

The finish run-out validator, spawn validation and every other suite check apply unchanged.

**What is measured here (physics-v2 §15, §14.2 rows; the physics-v2 engineer runs them, the lab HUD shows
them, the harness records them):**

| probe | where | reads (from `PhysicsState` + `debug()`) | pass band (physics-v2) |
|---|---|---|---|
| roll it (no hop) at 8-9 m/s | lip 46.3 | flight ~0.4 s, drop ~0.5 m, front meets the far wall ~0.3 m below +1.6 | fails, survivably: no fault, bike ends on the mattress at -1.5 |
| hop from the lip at 6-9 m/s | lip 46.3 -> ledge 49.3 | preload depth, snap duration, rear apex, airtime, landed pitch (HUD "last hop") | rear apex >= 0.45 m clears the 0.4 m step with >= 0.1 m margin; bot skill 2 clears; strangers median <= 4 attempts (band [3, 8]) |
| late / weak hop | ledge edge 49.3 | rear on the edge: fender-grab save with throttle, or drop onto the mattress | survivable either way, never a fault |
| body-on-face | far wall 49.25-49.3, -1.5..+1.6 | head / torso contact with the wall polyline | the ONLY fault on the feature (CONTRACT crash rule) |
| full gas over the crest | 70-90, peak at 80 | pitch, pitch rate, both-wheels-off, `comDH` vs a/g | neutral lean + full gas does not loop (A§2.5, P7); lean-back wheelie over the crest is the fun line; > 18.2 m/s leaves the ground by design |
| restart | cp0 30.5 / cp1 62.5 | restart -> riding latency | one tick, one frame; spawn on one flat segment (validated) |
| determinism | whole track | a recorded input replays to a byte-identical finish time | required (AGENTS.md) |

### 6.2 `lab-flat-200` — "Flat 200" (tier beginner, biome industrial, technique "envelope measurement", attemptsBand [1, 1], targetTimeS 14)

200 m of flat dirt, nothing on it before the finish, checkpoints at 50 / 100 / 150 (spawns +0.5),
finish at 200, then the standard 30 m run-out + catch (ramp at 230, box at 233) and end bank. 4
colliders, 0 hazards, 0 checkpoint violations. `hints = ['physics']` so the HUD is on. It exists so
every flat-ground FEEL number in §0 is measured on a track that is in the registry (not a scratch
profile), with the same restart path as a course:

| row (§0 / physics-v2 §14.2) | how | current authored-against value |
|---|---|---|
| 0 -> 16 m/s | full gas from the start spawn, lean per class | <= 3.5 s (v2 asks "<= 4.2 s at the launch pose") |
| top speed | full gas, 200 m | 20 m/s |
| brake distance | from 10 / 16 / 20 m/s at cp1 / cp2 / cp3, hard-back / neutral / hard-forward | <= 4.5 m from 10 (measured 4.66; v2: <= 5.0 hard-back, <= 7 neutral with a settling stoppie) |
| partial throttle cruise | 0.3 throttle, 200 m | 11.3 m/s |
| stationary hop | from a spawn, no roll | rear apex 0.55-0.75 m (v2: 0.45-0.65, 0.35-0.6 s both wheels off) |
| rolling hop | at 5 m/s | 0.9 m ledge equivalent |
| loop-out | full gas, lean 0 / +0.25 / -0.4 | lean >= 0.4 never loops on flat; v2: neutral never loops at a/g < d/h |
| wheelie hold | lean back + throttle | v2: a constant-input wheelie holds >= 3 s |
| rider pose lag | step lean, read `torsoPitch` | 0.28 s t90 |

When physics-v2 §14 passes, the tracks owner re-measures §0 from these two tracks (physics-v2 §16.4)
and re-authors the kickers built for the 1.4 g plant.

## 7. Playgrounds (`src/tracks/courses/playgrounds.ts`; tracks round 10, CLOSEOUT "Next milestones -> 1")

One BEGINNER course per biome so the user can ride every biome without finishing the game. Ids `p<n>-*`
(`isPlaygroundTrackId`, `PLAYGROUND_TRACKS` from `src/tracks`); registry order fixtures, curriculum, playgrounds,
lab. `meta.playground = true`, `meta.segments` = six review segments (`segmentsOf(def)`: `{from, to, label}`, the
level reviewer's walk). Not in `CURRICULUM`: outside medals, progression and the tier-escalation test; the §5
validators, the checkpoint rule, the finish run-out and the golden hash apply like any course. Front end
(core, requested): a **"Playgrounds" row above Lab**, always open, no medals — `progress.ts` `shipTracks` must
exclude `isPlaygroundTrackId` (else they land in the Beginner row and count toward medal totals) and `front.ts
build()` mirrors the Lab row with head "Playgrounds · one beginner course per biome · every asset · no medals".

**The brief, per course.** 440-505 m, skill-3 bot 32-35 s (x 1.6 = 51-56 s for a stranger; `targetTimeS` 70,
non-binding — no medals), beginner band: reflex `novice` <= 3 over 9 seeds, `average` 1-2 over 3, bot 1. Every
beginner-legal primitive at least once: straight 11 deg kickers (4 x 0.8, 6 x 1.2) landing on falling ground
(B3), grounded hills (`smooth` / `descent` / `wave` / `plateau` at 20 m/s, B1), a 2 m `smallGap`, a 0.3 m-proud
sunk drum or log (`bumpDrum`), an 18-20 deg plank onto a container / crate or 0.12 x 0.8 stairs onto a deck,
a <= 22 deg see-saw (`seesawEntry` 6 x 0.8 = 15 deg or 8 x 1.2 = 16.7 deg, 14 m of flat after it), a 0.3 m kerb
(rolls) or the 0.35 / 0.4 m kerb hop 8 m past a spawn, a 1.0-1.2 m drop off a straight 10-12 x h down-ramp
(panic-drop rule), rollers / `bumpRow`. Start gate + crowd + finish arch on all five (render draws them from
`start.pos.x` / `finishX`; every checkpoint is a gate + plaque + spectators + flame jets, so each course has four).

**What the render actually reads (inventory, this round).** Nothing under `src/render/` reads `setPieces`,
`arch` or `tunnel` (they compile to zero-collider `placed` entries and draw nothing); the biome kits are ambient
density recipes over the whole span, the event kit hangs off start / checkpoint / finish x, and each biome's ONE
"set piece" is chosen by a hard-coded `track.def.id` prefix at 45 % of the span (industrial `b2` container arch /
`b3` crane hook / `m1` forklift / else jib gantry; canyon `e1` water tower / `e2` pickups / `e3` mine portal /
else `seed % 3`; snow `m2` lift station / `x1` lodge / else `seed % 2`; nightCity `h2` crane / else rail spur +
train + billboard; foundry `m3` rolling mill / `x2` pipe rack / `x3` furnace wall / else ladle over the line).
Obstacle skins are biome-agnostic and follow `surface`: `box` metal = container, wood = plywood crate; ledge /
wall / stair concrete = asphalt + kerb stones in nightCity; wood ramps / planks = boards on trestles; `drum` =
cable spool in a cradle; `logpile` = log cylinders; `gap` water = dark pool, fire = emissive grate, kill = nothing.
So the playgrounds place every asset they CAN through geometry and author the rest as set-piece / decor metadata,
and the table lists what render must add so the metadata shows.

| course | biome | finish | bot (skill 3) | reflex `novice` (9 seeds) | `average` (3) | segments (x m: what it shows) |
|---|---|---:|---:|---|---|---|
| `p1-container-yard` "Container Yard" | industrial | 504 m | 1 att, 35.8 s | median **2** (9,3,2,1,1,2,1,4,1), 9/9 | **2** (2,2,1) | 0-68 grid, stands, first hill under the crane rail · 68-160 kicker 1 onto the downslope, two sunk oil drums, rollers · 160-272 the 2 m gap and kicker 2 through the container rows · 272-369 the 0.35 kerb hop, the plank onto a container, the 1.0 m drop · 369-454 the scaffold tunnel under the stacks, the plateau · 454-504 the wave home under the crowd bridge |
| `p2-canyon-run` "Canyon Run" | canyon | 494 m | 1 att, 34.4 s | median **3** (2,1,3,4,1,1,4,4,4), 9/9 | **2** (1,2,3) | 0-68 grid, light towers, braziers, the mesa plateau · 68-182 kicker pair, the rut road · 182-291 fat logs, the 2 m water gap, the 0.3 rock shelf · 291-391 the mine stairs onto a plywood deck, the 15 deg see-saw · 391-444 the water-tower drop (1.2 m, 12 x h) · 444-494 the wave home past the bleachers |
| `p3-snow-line` "Snow Line" | snow | 488 m | 1 att, 34.4 s | median **2** (1,1,2,2,2,2,2,5,4), 9/9 | **1** (1,1,2) | 0-68 grid, string lights, braziers, first hill between the trees · 68-182 kicker pair, rollers through the banks · 182-297 the log kerb (a 3-log pile behind a straight ramp), two half-buried logs, the 2 m pond gap · 297-399 the crate (18 deg plank up, 1.0 m drop off its ramp), the 0.3 step · 399-438 the see-saw under the lift line · 438-488 the ice tunnel and the wave home |
| `p4-night-circuit` "Night Circuit" | nightCity | 498 m | 1 att, 35.0 s | median **3** (3,1,1,5,4,9,1,2,4), 9/9 | **2** (5,1,2) | 0-52 grid: lighting truss, police cars, the zebra crossing, two 0.3 kerbs · 52-231 the hill, the subway stairs onto a concrete deck, the kicker pair · 231-313 the flooded cut (2 m gap), the rooftop plateau · 313-402 the 0.4 kerb hop, the 15 deg see-saw · 402-448 the loading-bay drop (1.0 m, 10 x h) · 448-498 the wave home under the crowd bridge |
| `p5-foundry-floor` "Foundry Floor" | foundry | 443 m | 1 att, 32.2 s | median **1** (1,2,2,1,3,1,1,2,1), 9/9 | **1** (3,1,1) | 0-68 grid, beacons, first hill under the ladles · 68-174 kicker pair on steel, the sunk spools · 174-252 the fire gap, the pipe-duct plateau · 252-354 the container (20 deg steel plank up, 1.0 m drop off its ramp), the grating step · 354-393 the see-saw over the trough · 393-443 the wave home under the pour |

Measured on the shipped reflex controller, Rookie, node-only, cap 50 / 300 s (`harness/out/metrics/p*.reflex.json`,
scratch `tracks10/*.log`); bot goldens `harness/inputs/p*/bot-3.json`. Re-authored from the first pass: P1's 0.4 m
kerb hop 8 m past CP2 was 17 novice deaths (median 4) -> 0.35 (median 2); P2's r 0.3 half-logs 6 m past CP1 were
9 nose-low deaths and the curve-0.3 water-gap kicker 8 m after them 5 nose-up deaths -> r 0.5 wood drums (B2's bump)
and 16 m to the kicker; P3's `logStep` (curve-0.3 lip to the log tops) hit at 12 m/s was 7 nose-up deaths -> a
straight 4 x 0.6 wood ramp onto the pile, 16 m past the spawn (the checkpoint rule reads a ramped pile as a launch).

### 7.1 Primitive checklist (x m of the obstacle)

| primitive | p1 | p2 | p3 | p4 | p5 |
|---|---|---|---|---|---|
| kicker 4 x 0.8 (11 deg) -> `slope(12, -0.8)` | 84 | 84 | 84 | 133 | 84 (steel) |
| kicker 6 x 1.2 (11 deg) -> `slope(16, -1.2)` | 196 | 118 | 118 | 167 | 118 (steel) |
| hill `smooth(16, 1.2)` + `descent(16, 1.2, 20)` | 24-64 | (mesa `plateau(15, 8, 1.0)` 24-62) | 24-64 | 58-98 | 24-64 |
| `plateau` (grounded tabletop) | 391-425 (0.8) | 24-62 (1.0) | - | 269-307 (1.0) | 210-244 (0.8, in the duct) |
| `wave(28, 1.5, 16)` / `wave(36, 1.5, 20)` finale | 331 / 454 | 349 / 444 | 359 / 438 (ice tunnel) | - / 448 | 315 / 393 |
| `rollers(20, 0.25, 3)` / `bumpRow` | 134 / 226, 435 | 148 / 262 | 148 / 271 | 205 / 372 | - / - |
| 2 m gap (`smallGap(4, 1.0, 2)`) | 176 (water) | 214 (water) | 239 (water, "the pond") | 247 (water, "the flooded cut") | 190 (**fire**) |
| sunk drum / log `bumpDrum(r, 0.3)` | 116, 125 (r 0.5 metal) | 188, 197 (r 0.5 wood) | 214, 222 (r 0.3 wood) | - | 156, 165 (r 0.5 metal spools) |
| log pile (`logpile` 3 x r 0.3, straight ramp) | - | - | 198-204 | - | - |
| plank <= 22 deg onto a box | 302 (18 deg wood -> metal container) | - | 313 (18 deg wood -> plywood crate) | - | 268 (20 deg steel -> container) |
| stairs 0.12 x 0.8 x 5 onto a 0.6 deck | - | 307 (wood) | - | 106 (concrete) | - |
| see-saw <= 22 deg (`seesawEntry`) | - | 334 (6 x 0.8, 15 deg) | 415 (8 x 1.2, 16.7 deg) | 343 (6 x 0.8) | 370 (8 x 1.2, steel) |
| kerb 0.3 m (rolls) | - | 234 (concrete shelf) | 344 (wood step) | 24, 39 (concrete kerbs) | 299 (grate step) |
| kerb HOP (0.35 / 0.4) 8 m past a spawn | 280 (0.35) | - | - | 321 (0.4) | - |
| drop >= 8 x h ramp | 305-321 (1.0, 10 x h) | 409-431 (1.2, 12 x h, "the tower deck") | 316-332 (1.0, 10 x h) | 418-436 (1.0, 10 x h, "the loading bay") | 271-287 (1.0, 10 x h) |
| checkpoints | 68 / 160 / 272 / 369 | 68 / 182 / 291 / 391 | 68 / 182 / 297 / 399 | 52 / 231 / 313 / 402 | 68 / 174 / 252 / 354 |

Not placed anywhere (not beginner-legal): `wall` / `steppedWall` (a lip climb), `pole` rows (a hop target),
`barrel` (0.9 m of solid, or fire — H3's speed commitment), `drumStep` (r >= 0.6), `kickerPlank` / `steepPlank`
(>= 36 deg), stairs down (a flight down is the panic-drop loop), `gap` > 3 m.

### 7.2 Asset checklist per biome (asset -> how it shows / what render must add)

Legend: **auto** = render draws it from the biome id, the span or the gate positions (nothing to author);
**placed @ x** = this course puts the geometry that triggers it there; **META** = authored as `setPiece` / `arch` /
`tunnel` metadata that render does not read yet — the render owner adds the hook (listed at the end).

**p1 industrial** — hall shell (brick, skylights, trusses, crane rail + hook, catwalk, light shafts, graffiti) auto;
under-deck containers / pallets auto; container rows, racks, pallets, drums, tyres, cones, tool carts, gas bottles,
reels, crates, sodium lamps + follow spots + lamp cones, oil stains, paper, bolts auto (density recipe over 504 m,
keep-outs at the 4 gates); the jib gantry + banners set piece auto (default id branch, 45 % = ~227 m, inside the
container-row segment); start scaffold stands + tarp banner + cones + white drums auto @ 2 / finish @ 507; start gate
+ 30-crowd + sponsor barrier + grandstand auto @ 0; checkpoint gates + plaques + jets @ 68 / 160 / 272 / 369; finish
gate + confetti + fireworks @ 504. Placed: metal **container** (box) @ 305; **wood boards** (plank 302, ramps
84 / 196 catch) ; **cable spools** (drums) @ 116 / 125; **concrete kerb** @ 280; **water pit** @ 180; dirt bed with
plywood kerbs (interior dirt) everywhere. META: `arch start` @ 3, `tunnel scaffold` 375-399 ("Under the Stacks"),
`arch crowd` @ 493 (the crowd bridge), `arch finish` @ 501, set pieces start / tunnel / finish.

**p2 canyon** — strata tiers, mesas, big formations, far shoulders, foreground outcrops auto; boulders, rubble,
scrub, snags, split-rail fence, tyre walls, bales, tyre stacks, red drums, spools, sand discs, ruts, contact shadows
auto; the id-gated set piece: **`seed % 3` of water tower + windmill / rusted pickups + drum dump / mine portal +
spools** auto @ 45 % (~222 m — the water-gap segment); light towers + generator + braziers + bleachers auto @ 0 and
494; fire barrels every ~70 m auto; rutted ochre dirt ribbon with rock edging auto; dust + heat haze auto. Placed:
**wood logs** (r 0.5 wood drums) @ 188 / 197, **water pit** @ 218, **rock shelf** (concrete ledge) @ 234, **mine
stairs** (wood) @ 307 onto a **plywood deck** (wood box) @ 311, **see-saw** @ 335, the **water-tower deck** (wood box
1.2) @ 409. META: `arch start` @ 3, `drop` set piece 397-432 ("The Tower Deck"), `arch crowd` @ 483, `arch
finish` @ 491. Not placeable: the OTHER two of the three canyon set pieces (render picks one per seed).

**p3 snow** — conifers (near / far / ridge lines), snow banks, gravel, ice patches, ruts, crates with snow lids,
posts, fences, lanterns + follow spots, log piles, sleds, blue drums, cabins every 24-40 m, snowfall, floor fog
auto; packed-snow trail with **split-log kerbs** auto (ground dirt -> snow); string lights over the gate + braziers
auto @ 0 / 488, braziers at every checkpoint; the id-gated set piece **`seed % 2` of lift station + pylons + chairs
/ lodge + ice curtain** auto @ 45 % (~220 m). Placed: **log pile** (logpile 3 x r 0.3) @ 202 behind a wood ramp,
**half-buried logs** @ 214 / 222, **pond** (water pit) @ 243, **plywood crate** (wood box) @ 316 with the wood plank
@ 313, **wood step** (ledge) @ 344, **see-saw** @ 416 (set piece "The Lift Line" 415-424 so the lift station reads
here when render honours it). META: `arch start` @ 3, `tunnel ice` 438-458 ("The Ice Cave"), `arch crowd` @ 477,
`arch finish` @ 485, `balance` / `tunnel` set pieces. Not placeable: the other snow set piece.

**p4 nightCity** — facades, second row, rooftop kit, shopfronts, lit skyline, street kit (cars, police cars with
lightbars, box truck, dumpsters, bollards, hydrants, newsboxes, jersey barriers, scaffold + hoardings, fire
escapes, awnings, AC units, traffic lights, bus shelter, food cart, signs, manholes, lane paint, puddles, cones,
fire barrels), street lights + cones + wet streaks, neon signs + reflections, the elevated rail viaduct, embers
auto; zebra crossings auto @ 20 and 480; police cars at the gates @ -7 / 507; lighting truss + par cans + LED wall
auto @ 0 / 498; the id-gated set piece **rail spur bridge + 4-car train + neon billboard** auto @ 45 % (~224 m,
the kicker-pair / stairs segment). Placed: **concrete kerbs** (asphalt + kerb-stone skin) @ 24 / 39 / 321 with
concrete down-ramps, **subway stairs** (concrete) @ 106 onto a **concrete deck** @ 110, **flooded cut** (water pit)
@ 251, **rooftop plateau** 269-307, **see-saw** @ 344, **loading-bay container** (metal box) @ 418. META: `arch
start` @ 3, `drop` set piece 408-436 ("The Loading Bay"), `arch crowd` @ 487, `arch finish` @ 495. Not placeable:
the tower crane + hoarded site (the `h2` branch).

**p5 foundry** — riveted-steel hall, sooty clerestory, orange panes, red light shafts, pouring ladles with melt
streams + spark fountains, furnaces on plinths, chimney stacks, vertical pipe, pipe runs, scaffold (every 9-14 m),
two molten troughs along the span, slag pots, heat haze, embers, 4 melt lights auto; red beacons auto @ 1.5 and
445; the id-gated set piece **ladle over the line** auto (default branch, 45 % = ~199 m — right over the fire gap);
crowd atlas in the foundry palette. Placed: **steel ramps** (metal) @ 84 / 118 / 190 / 277 / 305, **spools** (metal
drums) @ 156 / 165, **fire pit** (gap hazard fire: emissive grate strip) @ 194, **container** (metal box) @ 271 with
the **steel plank** @ 268, **grating step** (ledge surface grate) @ 299, **steel see-saw** @ 371. META: `arch
start` @ 3, `fire` set piece 190-196 ("The Melt"), `tunnel pipe` 210-240 ("The Duct"), `balance` 370-379 ("The
Trough"), `arch pipe` @ 432 (the exit duct), `arch finish` @ 440. Not placeable: the rolling mill / pipe rack /
furnace wall set pieces (m3 / x2 / x3 branches); burning barrels (hard tier).

### 7.3 What render must add for the META rows (routed by the parent)

1. Read `setPiecesOf(def)`: `start` / `finish` already coincide with the gate positions; `tunnel` -> a covered
   stretch in the biome's style (P1 scaffold 375-399, P3 ice 438-458, P5 pipe 210-240); `drop` -> the camera
   pull-out + a drop-edge dressing (P2 397, P4 408); `fire` -> the melt / sparks emphasis (P5 190); `balance` ->
   the lift station over P3's board (415), the trough under P5's (370).
2. Read the `arch` / `tunnel` decor kinds (`isDecorKind`, `params.style`): `start` gantry @ 3 on all five (today the
   start gate comes from `start.pos.x - 1`, so this may simply be skipped), `crowd` = the spectator bridge @ 483-493
   on P1-P4, `pipe` = the exit duct @ 432 on P5, `finish` over the line.
3. Playground ids in the id-gated set-piece switch: for `p1-` / `p2-` / `p3-` / `p4-` / `p5-` place EVERY set
   piece of the biome (at 25 / 50 / 75 % of the span, or one per review segment) instead of one — the user's ask is
   "every unique model of the biome in one level", and today canyon / snow / nightCity / foundry each show one of
   two to four.
4. Foundry grating strips (`deck.ts`, ground `metal`) never fire because the ground is always dirt; the P5 `grate`
   ledge @ 299 is the one grate on the course.
