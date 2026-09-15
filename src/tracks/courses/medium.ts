/**
 * Medium tier — bunny hops, drums, see-saws. Attempts band 5-12.
 *
 * Envelope: stationary hop apex 0.62 m -> stationary ledges <= 0.55 m; rolling hop 0.9 m
 * with a 5 m/s run-up (hard). Drums (physics 12.3): a bare drum is a log only for r <= 0.3
 * and needs a front lift; r >= 0.6 on flat ground is unrideable, so every big drum here
 * is sunk (`bumpDrum`, <= 0.5 m proud) or approached from a shelf at centre + 0.4
 * (`drumStep`, the measured M2 box -> drum line). Drums that `rolls` spin under the tyre
 * and never translate (CONTRACT §2.2). The bare logs left the beginner tier for M2, where
 * the front lift is the lesson (hints on M2; the HUD shows hints for beginner only today).
 */
import { course } from '../author';

/**
 * M1 — TEACHES the bunny hop onto ledges (preload lean back + throttle, snap forward). DEMANDS a
 * 0.9 m rise from a run-up, staged 0.3 / 0.6 / 0.9 (a rolling 0.6 hop onto the middle step is the
 * fast line; three 0.3 hops the slow one). Round 5 (reflex `average` 0 of 3, best 79 %: 67
 * stuck-restarts at the 0.7 m ledge, 35 at the 0.9 m ledge, 7 at the first 0.45; the 6-seed reflex
 * probe from a 16 m run-up: 0.45-0.5 clear in 1-2, 0.55 in 2-14 with one wall, 0.6 and up walled
 * for most seeds — the practised hop has one height; a bare 0.9 m ledge is walled for every reflex
 * skill; a 0.45 step 5 m long + 0.9 ledge 1-4; steps 0.3 / 0.6 / 0.9 1,1,2,1,1,1): the lesson
 * ledges are 0.45 / 0.5 + gap / a 0.45 + 0.45 two-stage / 0.5 + gap (eight hops in all, was ten: every
 * hop costs this player ~0.3 attempts), every ledge >= 0.45 has a 16 m run-up, and the 0.9 m demand
 * keeps its total rise behind 4 m x 0.3 and 0.6 steps.
 */
export const M1 = course('m1-hop-up', 'Hop Up', 'medium')
  .meta({
    biome: 'industrial',
    technique: 'bunny hop onto ledges',
    demands: '0.9 m total rise from a 16 m run-up in 0.3 m steps (hop the 0.6 rolling, or three 0.3s), then a 2 m hop across to a 0.9 m platform',
    attemptsBand: [5, 9],
    targetTimeS: 70, // round 7 gold (physics v2): skill-3 bot 32.58 s x 1.6 (the v1 stranger/bot clean ratio), rounded up to 5 s and kept non-decreasing through the tier; platinum = 0.85 x this (core rules)
  })
  .camera({ mode: 'side-tight' })
  .flat(21) // the first hop 21 m from the start line: the checkpoint rule now covers every ledge >= 0.45 (hopHeight), so the first hop is rolling, not standing
  .ledge({ height: 0.4, length: 6 }) // the hop (round 7 / physics v2: standing apex 0.46, the gas-hop's >= 0.1 m clear-air band is 0.3-0.6 m at 5 m/s; lesson ledges 0.4, demands 0.45-0.5): feel the timing
  .ramp({ length: 4, height: 0.4, direction: 'down' })
  .flat(10)
  .checkpoint() // 41 m
  .flat(4)
  .camera({ mode: 'side' })
  .rollers(20, 0.25, 3)
  .flat(4)
  .wave(28, 1.5, 16)
  .flat(6)
  .checkpoint() // ~120 m
  .flat(6) // round 8: 6 m (was 16): the v2 hop window is 5-8 m/s and 16 m of gas arrives at 12 — the reflex braked into a stoppie and endoed into the face (ledge @ 119: 53 `average` deaths x 3 seeds); fixture: 6 m is 4 x better than 16 for `average`
  .camera({ mode: 'side-tight' })
  .ledge({ height: 0.45, length: 4 }) // hop up, settle, hop across (round 7: 0.45, was 0.5 — 116 v2 reflex deaths front-into-the-face here; before that 0.55 + a 1.5 m ledge into the gap)
  .gap({ width: 1.5, depth: 2 })
  .flat(16) // +10 so nothing downstream moves
  .camera({ mode: 'side' })
  .bumpRow(3, 0.3, 16)
  .flat(4)
  .tabletop(6, 8, 1.0)
  .flat(6)
  .wave(28, 1.5, 16)
  .flat(4)
  .rollers(20, 0.25, 3)
  .flat(6)
  .checkpoint() // ~245 m
  .flat(8) // round 8: 8 m (was 16): arrive inside the hop window; the two-stage rise in two hops
  .camera({ mode: 'side-tight' })
  .ledge({ height: 0.4, length: 8 }) // round 8: 0.4 over 8 m (was 0.45 over 5): this two-stage was the hardest thing on the track — harder than the demand (fixture, 6 seeds: as built `good` 1/30/1/5/26/4, `average` 5/7/24/4/wall/1; the demand's 0.3 / 0.6 / ramp / 0.9 shape 1/1/1/1/1/1 for both)
  .ledge({ height: 0.75, length: 4 }) // second stage: a 0.35 m rise from a settled top (fixture: `good` 2/2/5/10/3/1, `average` 3/3/1/1/9/2)
  .ramp({ length: 8, height: 0.75, direction: 'down' })
  .flat(17) // +5 so the shorter run-in and the longer first stage move nothing downstream
  .flat(12) // round 8: the 0.45 ledge + 2 m hop-across that stood here is gone — a hop-across right after a hop-up, reached downhill off the two-stage, was the track's wall for `average` (fixture tracks8/m1fix.mts, 6 seeds: any shape of it 167-258 total attempts vs 17 without; `good` 41-324 vs 13); the demand carries the same move with a 6 m settle and a landing lip and clears 1/1/1/1/1/1
  .camera({ mode: 'side' })
  .rollers(20, 0.25, 3)
  .flat(6)
  .checkpoint() // ~330 m
  .flat(3)
  .camera({ mode: 'side-tight', cut: true })
  .flat(13) // run-up (16 m from the spawn): the 0.9 m rise
  .ledge({ height: 0.3, length: 6 }) // the steps: roll the 0.3, hop 0.3 (or 0.6 from speed) onto a landing ramp that carries you to 0.9 (round 6: 6 m of approach, was 4)
  .ledge({ height: 0.6, length: 1.5 })
  .ramp({ length: 3, height: 0.3 }, { base: 0.6 }) // round 6: the 0.6 stage lands on an incline, not a flat top then a third riser (average: 12 nose-down / loop deaths at the 0.6 riser, 4 at the 0.9)
  .ledge({ height: 0.9, length: 6 }) // the demand: 0.9 m total, no single rise above 0.3 (the ramp carries 0.6 -> 0.9)
  .gap({ width: 2 }) // hop across from the ledge top
  .ramp({ length: 2, height: 0.25 }, { base: 0.65 }) // landing lip: a short hop meets a 7 deg incline, not the box face (9 deaths)
  .box({ width: 6, height: 0.9 })
  .ramp({ length: 8, height: 0.9, direction: 'down' })
  .camera({ mode: 'side' })
  .flat(12) // land and settle: a wave starting 6 m after a drop is a rising landing = endo (sweep 3: 49 faults at 244.7)
  .bumpRow(2, 0.3, 16)
  .flat(6)
  .wave(28, 1.5, 16)
  .flat(10)
  .finish();

/**
 * M2 — TEACHES logs and drums: lean back over half-buried logs, roll a big drum from its shelf,
 * balance on a spinning one. DEMANDS box -> spinning drum -> box, a log pyramid and a see-saw exit.
 * Round 5 (reflex `average` 47/9/37 against band 6-12: 38 stuck-restarts at the log pyramid 3 m
 * past checkpoint 1, 21 at the demand's ramp 3 m past checkpoint 3, 8 at the drum-top gap): a
 * pyramid, a shelf drum and a 0.5 m-proud drum are momentum features and now count under the
 * checkpoint rule (16 m from every spawn); `logStep` ramps to the first log's TOP (2r), so the
 * upper rows are 0.22-0.52 m bumps (probe: 2-row 1,1,1, 3-row 2,2,5 against 3,3,3 / walled).
 */
export const M2 = course('m2-drum-roll', 'Drum Roll', 'medium')
  .meta({
    biome: 'snow',
    technique: 'logs and drums: roll the top from the shelf',
    demands: 'hop from a 1.2 m box onto a spinning drum and off again, then a five-log two-row pyramid',
    attemptsBand: [6, 12],
    targetTimeS: 70, // round 7 gold (physics v2): skill-3 bot 38.78 s x 1.6 (the v1 stranger/bot clean ratio), rounded up to 5 s and kept non-decreasing through the tier; platinum = 0.85 x this (core rules)
  })
  .hint('Lean back over the logs')
  .hint('Roll the drum from the shelf')
  .hint('Gas off on the spinning drum')
  .camera({ mode: 'side' })
  .flat(24)
  .checkpoint() // 24 m
  .flat(3)
  .camera({ mode: 'side-tight', zoomBias: -0.5 })
  .bumpDrum(0.5, 0.3) // sunk drum, 0.3 m proud: a round speed bump
  .flat(12) // checkpoint rule: 16 m to the 0.5 m-proud drum
  .bumpDrum(0.8, 0.4) // 1.6 m drum sunk to 0.4 m proud: rolls with a lean back (round 7: was 0.5 — at the v2 arrival speed of 12 m/s the 0.5 m bump launched the reflex rider into its air rules: 25 + 23 + 23 deaths on the first three drums)
  .flat(6)
  .bumpDrum(0.3, 0.3, { surface: 'wood' }) // half-buried log: a bare 0.3 m log is an 86 deg wall (physics 12.3) that the skill-2 bot failed 50 times
  .flat(5)
  .bumpDrum(0.3, 0.3, { surface: 'wood' })
  .flat(5)
  .bumpDrum(0.3, 0.3, { surface: 'wood' }) // two half-buried logs touching
  .bumpDrum(0.3, 0.3, { surface: 'wood' })
  .flat(6)
  .camera({ mode: 'side' })
  .rollers(20, 0.25, 3)
  .flat(4)
  .wave(28, 1.5, 16)
  .flat(4)
  .bumpRow(2, 0.3, 16)
  .flat(6)
  .checkpoint() // ~160 m
  .flat(16) // checkpoint rule: 16 m before the pyramid (was 3: 38 stuck-restarts)
  .camera({ mode: 'side-tight', zoomBias: -0.5 })
  .logStep({ radius: 0.3, count: 3, rows: 2 }) // 0.82 m pyramid behind a 0.6 m entry ramp: roll onto the bottom row
  .flat(6)
  .drumStep({ radius: 0.6 }, { exit: true }) // shelf at 1.0 -> 1.2 m drum -> shelf: roll over the top
  .flat(6)
  .camera({ mode: 'side' })
  .bumpRow(3, 0.3, 16)
  .flat(6)
  .wave(28, 1.5, 16)
  .flat(6)
  .checkpoint() // ~245 m
  .flat(16)
  .camera({ mode: 'side-tight', zoomBias: -0.5 })
  .drumStep({ radius: 0.8 }) // shelf at 1.2 -> 1.6 m drum, then drum to drum by hop
  .gap({ width: 2, depth: 2 })
  .drum({ radius: 0.8 })
  .flat(6)
  .drumStep({ radius: 0.8, rolls: true }, { exit: true }) // the spool: it spins under you
  .flat(6)
  .camera({ mode: 'side' })
  .tabletop(6, 8, 1.0)
  .flat(6)
  .rollers(20, 0.25, 3)
  .flat(6)
  .checkpoint() // ~335 m
  .flat(16)
  .camera({ mode: 'side-tight', zoomBias: -0.5 })
  .ramp({ length: 4, height: 1.2 })
  .box({ width: 3, height: 1.2 })
  .drum({ radius: 0.8, rolls: true }) // top at 1.6: roll on from the box, balance, roll off
  .box({ width: 3, height: 1.2 })
  .ramp({ length: 4, height: 1.2, direction: 'down' })
  .flat(6)
  .logStep({ radius: 0.3, count: 5, rows: 2 }) // 0.82 m pyramid, five logs long (round 7: was 4 x 3 rows = 1.34 m, a 50 deg climb from the entry ramp to the top row — on v2 nothing but the bot's hop tops 50 deg; 30-36 stuck-restarts per seed here on both classes)
  .flat(3)
  .seesawEntry({ length: 6, height: 1.0 }) // preview of M3
  .camera({ mode: 'side' })
  .flat(12)
  .wave(28, 1.5, 16)
  .flat(10)
  .finish();

/**
 * M3 — TEACHES see-saw timing (slow past the pivot, ride the tip) and thin landings. DEMANDS a gap
 * landing onto a see-saw, then a kicker onto a thin plank and a box. Round 5 (reflex `average`
 * 40/2/45 against band 8-12: 24 deaths on the demand's see-saw, 19 + 15 at the 20 deg kicker /
 * plank 3 m after the 6/1.5 see-saw): a see-saw leaves ~5 m/s, so a kicker 3 m after it is
 * under-speed (nose-high, short); the old demand asked for a 3 m gap from the tipping board onto a
 * plank at 2.0 (probe: walled, 99 x 3). Every kicker after a board now has >= 10 m to build speed,
 * every thin landing is a 4-5 m plank at 1.0-1.5 from a <= 17 deg kicker (8-12 m/s window, probe 1-2), and
 * the demand is the see-saw landing itself followed by that shape.
 */
export const M3 = course('m3-see-saw', 'See-Saw', 'medium')
  .meta({
    biome: 'foundry',
    technique: 'see-saw timing and thin landings',
    demands: 'land on a 22 deg see-saw from a 3 m gap, then a kicker onto a 3 m plank at 1.5 and a 2.5 m gap to a box',
    attemptsBand: [8, 12],
    targetTimeS: 70, // round 7 gold (physics v2): skill-3 bot 40.71 s x 1.6 (the v1 stranger/bot clean ratio), rounded up to 5 s and kept non-decreasing through the tier; platinum = 0.85 x this (core rules)
  })
  .camera({ mode: 'side' })
  .flat(28)
  .checkpoint() // 28 m
  .flat(3)
  .camera({ mode: 'low' })
  .seesawEntry({ length: 6, height: 0.8 }) // full speed launches you; the lesson is 4 m/s
  .flat(8)
  .seesawEntry({ length: 8, height: 1.2 }) // slower tip, more airtime if rushed
  .flat(6)
  .camera({ mode: 'side' })
  .rollers(20, 0.25, 3)
  .flat(4)
  .bumpRow(2, 0.3, 16)
  .flat(4)
  .wave(28, 1.5, 16)
  .flat(4)
  .rollers(20, 0.25, 3)
  .flat(6)
  .checkpoint() // ~170 m
  .flat(6) // see-saw + 10 m + kicker = 22 m from the spawn (checkpoint rule)
  .camera({ mode: 'low' })
  .seesawEntry({ length: 8, height: 1.5 }) // 21 deg (round 7 / physics v2: was 6 x 1.5 = 29 deg — every 29 deg board crashes every rider on both classes: the bike leaves the tipping board for 0.4 s and lands rear-first at 65 deg nose-up; <= 22 deg boards ride)
  .flat(14) // round 7: 14 m after a board (was 10; before that 3): a board leaves ~4.5 m/s, the v2 rider reaches ~12 m/s here for the 3 m gap
  .ramp({ length: 6, height: 1.5 }) // 14 deg (round 7: was 5 x 1.5 = 16.7; once 4 x 1.5 = 20 deg 3 m after the board: 19 nose-high + 15 short)
  .gap({ width: 3 })
  .ramp({ length: 2, height: 0.25 }, { base: 1.25 }) // round 6.1: landing lip — a rear wheel arriving at plank height slipped under the one-way board's leading edge and hung there (front on top, no fault: the skill-3 bot sat at 209 m for 600 s); the lip catches it
  .plank({ length: 6, height: 1.5 }) // thin landing at 1.5 (round 7: 6 m, was 4 — from the 14 m run-up the bot flew past a 4 m board onto the down-ramp: crash at 212.5)
  .ramp({ length: 4, height: 1.5, direction: 'down' })
  .flat(12)
  .camera({ mode: 'side' })
  .wave(28, 1.5, 16)
  .flat(4)
  .tabletop(6, 8, 1.0)
  .flat(8)
  .checkpoint() // ~265 m
  .flat(16) // 15 m from the spawn (checkpoint rule)
  .camera({ mode: 'low' })
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 3 })
  .ramp({ length: 2, height: 0.25 }, { base: 0.75 }) // landing lip (round 6.1)
  .plank({ length: 4, height: 1.0 }) // thin landing, lower and faster
  .ramp({ length: 3, height: 1.0, direction: 'down' })
  .flat(4)
  .seesawEntry({ length: 8, height: 1.5 })
  .flat(6)
  .camera({ mode: 'side' })
  .rollers(20, 0.25, 3)
  .flat(6)
  .checkpoint() // ~335 m
  .flat(16) // 15 m from the spawn (checkpoint rule)
  .camera({ mode: 'low', cut: true })
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 3 })
  .seesaw({ length: 8, height: 1.6 }) // 21.8 deg (round 7: was 8 x 2.0 = 29 deg, the crash board); land rear-first on the resting near end: it dips, you roll up, it tips (round 8: an 8 x 1.3 = 17.5 deg board was tried for the reflex `good` tip-air deaths at 410 m — 12 vs 13 over 9 seeds, inside the noise, so it stays; see tracks.md round 8)
  .flat(14) // ride the tip down, then build speed for the thin landings (round 7: 14 m, was 10; once a 3 m gap off the tipping board onto a plank at 2.0: walled)
  .ramp({ length: 6, height: 1.5 }) // 14 deg (round 7)
  .gap({ width: 3 })
  .ramp({ length: 2, height: 0.25 }, { base: 1.25 }) // landing lip (round 6.1)
  .plank({ length: 4, height: 1.5 }) // round 7: 4 m (was 3)
  .gap({ width: 2.5 })
  .box({ width: 6, height: 1.5 })
  .ramp({ length: 8, height: 1.5, curve: 0.3, direction: 'down' })
  .camera({ mode: 'side' })
  .flat(12)
  .bumpRow(2, 0.3, 16)
  .flat(12)
  .finish();
