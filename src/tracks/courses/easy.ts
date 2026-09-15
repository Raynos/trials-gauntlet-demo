/**
 * Easy tier — biome canyon (county daylight), no hints. Attempts band 2-6.
 * Planks uphill, rear-wheel-first gap landings, stairs.
 *
 * Envelope notes: sustained climb <= 60 deg, authored <= 48 deg (20 % margin);
 * jumps sized with FEEL.jumpRange at 0.8 x the run-up speed. Round 3: flow
 * sections (rollers, humps, waves, tabletops, small kickers) between the taught
 * obstacles; ~40-50 s bot-clean; checkpoints every ~12-18 s of bot time.
 */
import { course } from '../author';

/**
 * E1 — TEACHES uphill weight shift: lean forward and pulse throttle on steep planks. DEMANDS a
 * 48 deg plank from a 20 m run-up. Round 4 (strangers: median 9 against band 2-4; 9 of 20
 * deaths at the 48 deg wall 3 m past checkpoint 3 — "near-vertical wall right after the
 * checkpoint with almost no run-up; front wheel slams the slope kink; slow full-gas climbs
 * loop at the lip" — the rest at the foot of the 45 deg stair descent (62), the 16 m x 1.5 m
 * wave crest (84), and the quarter-pipe roll-outs off the 3.6 / 2.4 m boxes (159, 205-216)):
 * every plank now has >= 16 m of flat from its checkpoint (20 for the demand), every box
 * descends on a straight 9.5 deg ramp a bike leaving the top at 16 m/s lands on, the waves
 * are grounded at 16 m/s, and the -40 deg plank descent is gone.
 */
export const E1 = course('e1-uphill-weight', 'Uphill Weight', 'easy')
  .meta({
    biome: 'canyon',
    technique: 'lean forward on steep climbs',
    demands: '45 deg plank over a 0.3 m kicker foot from a 20 m run-up (13 m/s: a momentum climb), then a long ramp descent',
    attemptsBand: [2, 4],
    targetTimeS: 70, // round 7 gold (physics v2): skill-3 bot 42.36 s x 1.6 (the v1 stranger/bot clean ratio), rounded up to 5 s and kept non-decreasing through the tier; platinum = 0.85 x this (core rules)
  })
  .camera({ mode: 'side' })
  .flat(20)
  .rollers(20, 0.3, 3)
  .flat(6)
  .checkpoint() // ~46 m
  .flat(16)
  .camera({ mode: 'side', zoomBias: -0.4 })
  .plank({ angleDeg: 30, rise: 3.0 }) // 6.0 m board
  .box({ width: 8, height: 3.0 })
  .ramp({ length: 18, height: 3.0, direction: 'down' }) // 9.5 deg: was 6 x 0.5 stairs (45 deg), two strangers endoed at their foot
  .flat(8)
  .camera({ mode: 'side' })
  .wave(28, 1.5, 16)
  .flat(4)
  .humpRow(3, 0.3, 8)
  .flat(4)
  .rollers(20, 0.3, 4)
  .flat(8)
  .checkpoint() // ~175 m
  .flat(16)
  .camera({ mode: 'side', zoomBias: -0.4 })
  .kickerPlank({ angleDeg: 40, rise: 3.6 }) // 5.1 m board over the 0.3 m kicker foot (round 7 / physics v2: the crawl limit is 37 deg, 40 tops from 8 m/s with this foot — naive rider F -> TOP at 5 m/s)
  .box({ width: 6, height: 3.6 })
  .ramp({ length: 22, height: 3.6, direction: 'down' }) // was a 6 m quarter-pipe: a 16 m/s launch off the box landed nose-down at its foot
  .flat(8)
  .camera({ mode: 'side' })
  .rollers(20, 0.3, 3)
  .flat(4)
  .humpRow(2, 0.3, 8)
  .flat(8)
  .checkpoint() // ~275 m
  .flat(16)
  .camera({ mode: 'side', zoomBias: -0.4 })
  .kickerPlank({ angleDeg: 36, rise: 2.4 }) // 3.6 m board: the middle step, at speed (round 7: kicker foot)
  .box({ width: 6, height: 2.4 })
  .ramp({ length: 15, height: 2.4, direction: 'down' })
  .flat(8)
  .camera({ mode: 'side' })
  .humpRow(2, 0.3, 8)
  .flat(6)
  .wave(34, 2.0, 16)
  .flat(4)
  .rollers(20, 0.3, 4)
  .flat(8)
  .checkpoint() // ~400 m
  .flat(20) // the demand's run-up: v2 13.2 m/s from the spawn
  .camera({ mode: 'side', zoomBias: -0.4 })
  .kickerPlank({ angleDeg: 45, rise: 3.1 }) // the demand (round 7 / physics v2: was steepPlank 48 — on v2 nothing but the bot's hop move tops 50 deg, the concave fillet made 40-45 worse, and 45 over a 0.3 m 20 deg kicker foot is TOP at 8 m/s for the naive rider on both classes)
  .ramp({ length: 2, height: 0.6, curve: -0.4 }, { base: 3.1 }) // round 8: a convex crest rolls the climb over onto the box. Reflex `average` on R5 died 28 x 9 seeds at this top: it tops the face at ~3.5 m/s and LAUNCHES off the plank's top edge (both wheels in the air 1.2 s over the box, +22 -> +190 deg whatever the rider does; a wider box changed nothing because the bike never touched it). Fixture (scratch tracks8/e1crest.mts, 6 seeds): plain 45 4/5/11/7/10/3, this crest 1/1/2/3/1/1; a 2.5-3 m crest at curve -0.6 is a launch hump (3/6/5/6/6/3)
  .box({ width: 8.6, height: 3.7 }) // the crest + box keep the round-7 footprint so nothing downstream moves
  .ramp({ length: 22, height: 3.7, direction: 'down' }) // was a -40 deg plank onto flat: a 40 deg kink at its foot
  .camera({ mode: 'side' })
  .flat(8)
  .wave(28, 1.5, 16)
  .flat(4)
  .rollers(20, 0.3, 3)
  .flat(12)
  .finish();

/**
 * E2 — TEACHES rear-wheel-first landings over gaps. DEMANDS two gaps in a row off a kicker platform.
 * Round 5 (reflex `average` 23/45/13 against band 3-5): 28 deaths at the far lip of the demand's
 * second 6 m gap (a short 3 m platform after an uphill landing, then a 6 m gap onto flat: no speed),
 * 16 at the 1.0 m box edge after the 6 m gap at 143 (under-speed hits the face, on-speed needs the
 * rear-first landing the track is meant to teach), 12 at the demand's first box edge. Every gap now
 * lands on an up-ramp whose foot is at the far lip (`gapLanding`: the rear-first landing IS an uphill
 * landing; a short jump meets a 7-10 deg incline, not a face — reflex probe 1,1,1 against 1,5,14),
 * the demand platform is 8 m behind a 5 m landing ramp and the second gap is 5 m (probe 1,2,1
 * against 14,1,walled at 6 m), the hump rows are grounded `bumpRow`s >= 12 m past a landing.
 */
export const E2 = course('e2-rear-wheel-first', 'Rear Wheel First', 'easy')
  .meta({
    biome: 'canyon',
    technique: 'rear-wheel-first gap landing',
    demands: 'gap onto a long landing ramp, immediately a second gap from a kicker on the platform',
    attemptsBand: [3, 5],
    targetTimeS: 70, // round 7 gold (physics v2): skill-3 bot 43.46 s x 1.6 (the v1 stranger/bot clean ratio), rounded up to 5 s and kept non-decreasing through the tier; platinum = 0.85 x this (core rules)
  })
  .camera({ mode: 'side' })
  .flat(24)
  .checkpoint() // 24 m
  .flat(16) // 15 m from the spawn (checkpoint rule): a 3 m gap needs ~8 m/s
  .camera({ mode: 'high34' })
  .ramp({ length: 4, height: 0.8 }) // 11 deg, ~8 m/s -> ~5 m range: 3 m gap
  .gap({ width: 3 })
  .flat(10)
  .ramp({ length: 5, height: 1.2 }) // 13.5 deg, 4 m gap onto an uphill landing
  .gap({ width: 4 })
  .ramp({ length: 6, height: 1.0 }) // uphill landing: rear first or the front spikes
  .box({ width: 4, height: 1.0 })
  .ramp({ length: 4, height: 1.0, direction: 'down' })
  .camera({ mode: 'side' })
  .flat(12)
  .rollers(20, 0.25, 3)
  .flat(4)
  .bumpRow(2, 0.3, 16)
  .flat(6)
  .checkpoint() // ~125 m
  .flat(16) // run-up: ~11 m/s
  .camera({ mode: 'high34' })
  .ramp({ length: 5, height: 1.5 }) // 16.7 deg; a 5 m gap needs ~8 m/s at the lip (round 7: was 6 m — the v2 rider who rolls a lip at 0.3 throttle flies 6.0 m from 12 m/s)
  .gap({ width: 5 })
  .gapLanding(1.0, 8, 8, 10) // was a 1.0 m box edge: 16 deaths; a 16 m/s launch lands on the top, 8 m/s on the ramp foot
  .camera({ mode: 'side' })
  .flat(12)
  .wave(28, 1.5, 16)
  .flat(4)
  .smallGap(4, 1.0, 3)
  .flat(12)
  .smallGap(4, 1.0, 3)
  .flat(14) // >= 8 m past the landing zone before the checkpoint
  .checkpoint() // ~245 m
  .flat(16)
  .camera({ mode: 'high34' })
  .ramp({ length: 5, height: 1.2 })
  .gap({ width: 4 })
  .gapLanding(0.8, 6, 6, 8)
  .camera({ mode: 'side' })
  .flat(12)
  .rollers(20, 0.25, 3)
  .flat(4)
  .tabletop(6, 8, 1.0)
  .flat(12)
  .wave(28, 1.5, 16)
  .flat(4)
  .bumpRow(2, 0.3, 16)
  .flat(6)
  .checkpoint() // ~390 m
  .flat(16)
  .camera({ mode: 'high34' })
  .ramp({ length: 5, height: 1.5 }) // the demand
  .gap({ width: 5 })
  .ramp({ length: 12, height: 0.6 }) // round 8: a 2.9 deg landing ramp that runs almost to the kicker (was 5 x 0.6 + an 8 m flat platform: the reflex rider landing at ~10 m/s rebounded off the ramp-to-platform kink and flew the flat platform with the gas on, 27 x 9 seeds at 506 m; fixture tracks8/e2fix.mts, 9 seeds: 5 x 0.6 + 10 m flat 3/3/17/4/16/2/3/1/2, this shape 6/2/6/3/2/1/2/7/5)
  .box({ width: 3, height: 0.6 })
  .ramp({ length: 5, height: 1.0 }, { base: 0.6 }) // 11 deg (round 8: was 4 x 1.0 = 14 deg; measured: a brake tap in the air off 5 x 1.0 lands the gapLanding at +1..+17 deg, off 4 x 1.0 at -9..-19; round 7: was 3 x 1.0 = 18.4 deg)
  .gap({ width: 4 }) // round 8: 4 (was 4.5; round 7: 5; before that 6 onto flat: 28 deaths short of the far lip)
  .gapLanding(1.0, 6, 8, 10)
  .camera({ mode: 'side' })
  .flat(9.5) // round 8: 2.5 m shorter so the re-shaped demand moves nothing downstream
  .bumpRow(2, 0.3, 16)
  .flat(6)
  .rollers(20, 0.25, 3)
  .flat(12)
  .finish();

/**
 * E3 — TEACHES stairs: throttle up (the wheel bounces up each riser at speed), brake down without
 * a stoppie. DEMANDS an 8-step flight up at speed and a 9-step descent into a 2 m gap. Round 5
 * (reflex `average` 0 of 3, best 28 %: 95 stuck-restarts at the 6 x 0.4 m flight 2.5 m past
 * checkpoint 1, 52 at the 5 x 0.3 flight 3 m past checkpoint 0): a riser >= 0.35 m reads as a face
 * and a standing-start riser is not a novice technique (reflex probe: 0.25 / 0.3 risers from a
 * 16 m run-up clear in 1-2, 0.35 and up are walled from any run-up). Every flight is now 0.25 m
 * risers (6-seed probe: 0.25 / 0.5 flights 1,1,1,1,1,1, 0.3 / 0.45 up to 11 for a slow seed) with >= 15 m
 * of run-up (the checkpoint rule counts stairs up as a speed obstacle), the
 * first flight is 3 x 0.25, and the demand's descent is 8 x 0.25.
 */
export const E3 = course('e3-stairway', 'Stairway', 'easy')
  .meta({
    biome: 'canyon',
    technique: 'stairs: gas up, brake down',
    demands: '8 x 0.15 m steps up at speed (0.6 m runs), 8 steps down at a 0.5 m run, a 1.5 m gap onto a landing ramp',
    attemptsBand: [3, 6],
    targetTimeS: 70, // round 7 gold (physics v2): skill-3 bot 41.44 s x 1.6 (the v1 stranger/bot clean ratio), rounded up to 5 s and kept non-decreasing through the tier; platinum = 0.85 x this (core rules)
  })
  .camera({ mode: 'side' })
  // Round 8 (stranger round 4: e3 15.5 attempts against 3-6, one of two sessions never finished; every death on a
  // flight): a 0.25 m riser is a 75 deg face to a 0.34 m wheel, so once the front lifts every riser the rear hits
  // accelerates the loop — the replayed r4 recordings loop on PLAIN GAS at 10 m/s (lean 0) and on gas + lean +1 at
  // 7 m/s on the 3 x 0.25 flight, and off the 6-step flight with no input at all. Measured (scratch tracks8/stairs.mts,
  // Rookie, up over a box and down): 0.15 m risers at a 0.6 m run (14 deg) ride plain gas, coast, gas-forward-to-the-
  // lip-then-coast and brake-down at 5-14 m/s on 0.75 / 1.2 m flights (pitch <= 32 deg); a held forward lean down a
  // >= 1.5 m flight endos (the physics R5 held-lean drop row), so no flight is taller than 1.2 m; above 14 m/s the
  // forward-lean riders die on every geometry, so the first flight is 22 m from the line (~13.5 m/s) and every other
  // one 16 m past its checkpoint. The two 0.9 m barrels at the foot of flight 2 (three of the six replayed deaths at
  // 176-180 m) are gone. The pit is 1.5 m onto a gapLanding: a rider coasting off the descent at 8 m/s clears it,
  // half gas after the brake clears it; 2 m onto flat wanted >= 10 m/s (the rear wheel caught the far lip).
  .flat(6)
  .checkpoint() // ~6 m: the start-line lesson; a plain-gas rider reaches the first flight at ~13.5 m/s
  .flat(16)
  .camera({ mode: 'side-tight', zoomBias: -0.6 })
  .stair({ count: 5, height: 0.15, length: 0.6 }) // the first flight: 0.75 m at 14 deg
  .box({ width: 6, height: 0.75 })
  .stair({ count: 5, height: 0.15, length: 0.6, direction: 'down' })
  .flat(12)
  .camera({ mode: 'side' })
  .rollers(20, 0.25, 3)
  .flat(4)
  .wave(28, 1.5, 16)
  .flat(4)
  .bumpRow(2, 0.3, 16)
  .flat(6)
  .checkpoint() // ~135 m
  .flat(16)
  .camera({ mode: 'side-tight', zoomBias: -0.6 })
  .stair({ count: 8, height: 0.15, length: 0.6 }) // 1.2 m at 14 deg (round 7: 6 x 0.25 at 0.6; before that 6 x 0.4 from 3 m: 95 deaths)
  .box({ width: 6, height: 1.2 })
  .stair({ count: 8, height: 0.15, length: 0.6, direction: 'down' })
  .flat(12) // round 8: the two barrels that stood here are gone
  .camera({ mode: 'side' })
  .tabletop(6, 8, 1.0)
  .flat(6)
  .rollers(20, 0.25, 3)
  .flat(6)
  .checkpoint() // ~235 m
  .flat(16)
  .camera({ mode: 'side-tight', zoomBias: -0.6 })
  .stair({ count: 8, height: 0.15, length: 0.6 }) // a flight at speed: 8 m on top so a 14 m/s launch still lands on the box
  .box({ width: 8, height: 1.2 })
  .stair({ count: 8, height: 0.15, length: 0.6, direction: 'down' })
  .flat(12)
  .camera({ mode: 'side' })
  .bumpRow(3, 0.3, 16)
  .flat(4)
  .wave(28, 1.5, 16)
  .flat(4)
  .rollers(20, 0.25, 3)
  .flat(6)
  .checkpoint() // ~384 m
  .flat(16)
  .camera({ mode: 'side-tight', zoomBias: -0.6 })
  .stair({ count: 8, height: 0.15, length: 0.6 }) // the demand: eight risers at speed onto a 4 m top
  .box({ width: 4, height: 1.2 })
  .stair({ count: 8, height: 0.15, length: 0.5, direction: 'down' }) // 16.7 deg down: brake, release before the lip
  .flat(6)
  .gap({ width: 1.5 }) // round 8: 1.5 m onto a landing ramp (was 2 m onto flat: the rear wheel caught the far lip below 10 m/s)
  .gapLanding(0.4, 4, 4, 6)
  .camera({ mode: 'side' })
  .flat(12)
  .wave(28, 1.5, 16)
  .flat(4)
  .tabletop(6, 8, 1.0)
  .flat(6)
  .rollers(20, 0.25, 3)
  .flat(12)
  .finish();
