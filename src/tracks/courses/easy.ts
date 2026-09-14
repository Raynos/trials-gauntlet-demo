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
  .kickerPlank({ angleDeg: 45, rise: 3.7 }) // the demand (round 7 / physics v2: was steepPlank 48 — on v2 nothing but the bot's hop move tops 50 deg, the concave fillet made 40-45 worse, and 45 over a 0.3 m 20 deg kicker foot is TOP at 8 m/s for the naive rider on both classes)
  .box({ width: 6, height: 3.7 })
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
    demands: 'gap onto a landing ramp and an 8 m platform, immediately a second gap from a kicker on the platform',
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
  .ramp({ length: 5, height: 0.6 }) // landing ramp onto the platform (was a 0.6 m box edge: 12 deaths)
  .box({ width: 8, height: 0.6 }) // 8 m to settle and gas (was 6 with the kicker on it: 3 m of platform)
  .ramp({ length: 4, height: 1.0 }, { base: 0.6 }) // 14 deg (round 7: was 3 x 1.0 = 18.4 deg; v2 loops the gas-held rider off lips >= 17 deg below 10 m/s)
  .gap({ width: 4.5 }) // round 7: 4.5 from ~9 m/s on the platform (was 5; before that 6 onto flat: 28 deaths short of the far lip)
  .gapLanding(1.0, 6, 8, 10)
  .camera({ mode: 'side' })
  .flat(12)
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
    demands: '8 x 0.25 m steps up at speed (0.6 m runs), 8 steps down ending at a 2 m gap',
    attemptsBand: [3, 6],
    targetTimeS: 70, // round 7 gold (physics v2): skill-3 bot 41.44 s x 1.6 (the v1 stranger/bot clean ratio), rounded up to 5 s and kept non-decreasing through the tier; platinum = 0.85 x this (core rules)
  })
  .camera({ mode: 'side' })
  .flat(20)
  .rollers(20, 0.25, 3)
  .flat(6)
  .checkpoint() // ~46 m
  .flat(16) // checkpoint rule: 15 m before a flight up
  .camera({ mode: 'side-tight', zoomBias: -0.6 })
  .stair({ count: 3, height: 0.25, length: 0.6 }) // the first flight: 0.75 m at 22.6 deg (round 7: 0.6 m runs everywhere — a 26.6 deg flight lifted the v2 nose over the top: 59 nose-high deaths at the second flight)
  .box({ width: 6, height: 0.75 })
  .stair({ count: 3, height: 0.25, length: 0.5, direction: 'down' })
  .flat(12)
  .camera({ mode: 'side' })
  .wave(28, 1.5, 16)
  .flat(4)
  .bumpRow(2, 0.3, 16)
  .flat(6)
  .checkpoint() // ~135 m
  .flat(16)
  .camera({ mode: 'side-tight', zoomBias: -0.6 })
  .stair({ count: 6, height: 0.25, length: 0.6 }) // 22.6 deg, 1.5 m (round 7: was 0.5 runs; before that 6 x 0.4 from 3 m: 95 deaths)
  .box({ width: 6, height: 1.5 }) // round 7: 6 m on top (was 4) so the nose settles before the descent
  .stair({ count: 6, height: 0.25, length: 0.5, direction: 'down' })
  .barrel({ count: 2, spacing: 0.7, burning: false })
  .flat(12)
  .camera({ mode: 'side' })
  .tabletop(6, 8, 1.0)
  .flat(6)
  .rollers(20, 0.25, 3)
  .flat(6)
  .checkpoint() // ~215 m
  .flat(16)
  .camera({ mode: 'side-tight', zoomBias: -0.6 })
  .stair({ count: 6, height: 0.25, length: 0.6 }) // a flight at speed
  .box({ width: 6, height: 1.5 })
  .stair({ count: 6, height: 0.25, length: 0.5, direction: 'down' })
  .flat(12)
  .camera({ mode: 'side' })
  .bumpRow(3, 0.3, 16)
  .flat(4)
  .wave(28, 1.5, 16)
  .flat(4)
  .rollers(20, 0.25, 3)
  .flat(6)
  .checkpoint() // ~330 m
  .flat(16)
  .camera({ mode: 'side-tight', zoomBias: -0.6 })
  .stair({ count: 8, height: 0.25, length: 0.6 }) // the demand: 2.0 m, eight risers at speed (round 7: 0.6 runs; was 7 x 0.45 once)
  .box({ width: 4, height: 2.0 })
  .stair({ count: 8, height: 0.25, length: 0.5, direction: 'down' })
  .flat(6) // checkpoint rule: the stair descent + 6 m is 15 m of effective run-up for the gap
  .gap({ width: 2 }) // brake on the stairs, release before the lip
  .camera({ mode: 'side' })
  .flat(12)
  .wave(28, 1.5, 16)
  .flat(4)
  .tabletop(6, 8, 1.0)
  .flat(6)
  .rollers(20, 0.25, 3)
  .flat(12)
  .finish();
