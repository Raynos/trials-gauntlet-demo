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

/** E1 — TEACHES uphill weight shift: lean forward and pulse throttle on steep planks. DEMANDS a 48 deg plank with a short run-in. */
export const E1 = course('e1-uphill-weight', 'Uphill Weight', 'easy')
  .meta({
    biome: 'canyon',
    technique: 'lean forward on steep climbs',
    demands: '48 deg plank (filleted foot) from a 3 m run-in, then a 40 deg plank descent',
    attemptsBand: [2, 4],
    targetTimeS: 60,
  })
  .camera({ mode: 'side' })
  .flat(20)
  .rollers(15, 0.3, 3)
  .flat(6)
  .checkpoint() // ~41 m
  .flat(3)
  .camera({ mode: 'side', zoomBias: -0.4 })
  .plank({ angleDeg: 30, rise: 3.0 }) // 6.0 m board
  .box({ width: 8, height: 3.0 })
  .stair({ count: 6, height: 0.5, length: 0.5, direction: 'down' })
  .flat(8)
  .camera({ mode: 'side' })
  .wave(16, 1.5)
  .flat(4)
  .humpRow(3, 0.3, 8)
  .flat(4)
  .rollers(20, 0.3, 4)
  .flat(6)
  .checkpoint() // ~135 m
  .flat(3)
  .camera({ mode: 'side', zoomBias: -0.4 })
  .plank({ angleDeg: 40, rise: 3.6 }) // 5.6 m
  .box({ width: 6, height: 3.6 })
  .ramp({ length: 6, height: 3.6, curve: 0.4, direction: 'down' }) // quarter-pipe roll-out: ~16 m/s at the bottom
  .flat(6)
  .camera({ mode: 'side' })
  .rollers(15, 0.3, 3) // no tabletop here: at 16+ m/s a 9.5 deg lip overshoots an 8 m top and lands nose-down on flat (sweep 3: 40 faults)
  .flat(4)
  .humpRow(2, 0.3, 8)
  .flat(6)
  .checkpoint() // ~180 m
  .flat(3)
  .camera({ mode: 'side', zoomBias: -0.4 })
  .plank({ angleDeg: 36, rise: 2.4 }) // 4.1 m: the middle step, at speed
  .box({ width: 6, height: 2.4 })
  .ramp({ length: 5, height: 2.4, curve: 0.4, direction: 'down' })
  .flat(6)
  .camera({ mode: 'side' })
  .humpRow(2, 0.3, 8)
  .flat(6)
  .wave(20, 2.0)
  .flat(4)
  .rollers(20, 0.3, 4)
  .flat(6)
  .checkpoint() // ~285 m
  .flat(3)
  .camera({ mode: 'side', zoomBias: -0.4 })
  .steepPlank({ angleDeg: 48, rise: 3.7 }) // fillet + ~4.5 m board, the demand: ~1.5 wheelbase/s so ~2.5 s of climb
  .box({ width: 6, height: 3.7 })
  .plank({ angleDeg: -40, rise: 3.7 }, { base: 3.7 }) // roll the descent, brake
  .camera({ mode: 'side' })
  .flat(8)
  .wave(20, 2.0)
  .flat(4)
  .rollers(15, 0.3, 3)
  .flat(12)
  .finish();

/** E2 — TEACHES rear-wheel-first landings over gaps. DEMANDS two gaps in a row off a 6 m platform. */
export const E2 = course('e2-rear-wheel-first', 'Rear Wheel First', 'easy')
  .meta({
    biome: 'canyon',
    technique: 'rear-wheel-first gap landing',
    demands: 'gap onto a 6 m box, immediately a second gap from a ramp on the box',
    attemptsBand: [3, 5],
    targetTimeS: 65,
  })
  .camera({ mode: 'side' })
  .flat(24)
  .checkpoint() // 24 m
  .flat(3)
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
  .flat(6)
  .rollers(15, 0.3, 3)
  .flat(4)
  .humpRow(2, 0.3, 8)
  .flat(6)
  .checkpoint() // ~115 m
  .flat(3)
  .flat(12) // run-up: ~11 m/s
  .camera({ mode: 'high34' })
  .ramp({ length: 5, height: 1.5 }) // 16.7 deg; 6 m gap needs ~9 m/s
  .gap({ width: 6 })
  .box({ width: 10, height: 1.0 }) // landing above the launch
  .ramp({ length: 5, height: 1.0, direction: 'down' })
  .camera({ mode: 'side' })
  .flat(12)
  .wave(16, 1.5)
  .flat(4)
  .smallGap(4, 1.0, 3)
  .flat(10)
  .smallGap(4, 1.0, 3)
  .flat(10)
  .checkpoint() // ~215 m
  .flat(3)
  .flat(8)
  .camera({ mode: 'high34' })
  .ramp({ length: 5, height: 1.2 })
  .gap({ width: 4 })
  .box({ width: 8, height: 0.8 })
  .ramp({ length: 4, height: 0.8, direction: 'down' })
  .camera({ mode: 'side' })
  .flat(6)
  .rollers(15, 0.3, 3)
  .flat(4)
  .tabletop(6, 8, 1.0)
  .flat(6)
  .wave(20, 2.0)
  .flat(4)
  .humpRow(3, 0.3, 8)
  .flat(6)
  .checkpoint() // ~350 m
  .flat(3)
  .flat(10)
  .camera({ mode: 'high34' })
  .ramp({ length: 5, height: 1.5 }) // the demand
  .gap({ width: 5 })
  .box({ width: 6, height: 0.6 }) // short platform: a nose-in here kills the speed for gap 2
  .ramp({ length: 3, height: 1.0 }, { base: 0.6 })
  .gap({ width: 6 })
  .camera({ mode: 'side' })
  .flat(8)
  .humpRow(2, 0.3, 8)
  .flat(6)
  .rollers(15, 0.3, 3)
  .flat(12)
  .finish();

/** E3 — TEACHES stairs: throttle pulses up (front-wheel taps), braking down without a stoppie. DEMANDS 0.45 m steps then a descent into a 2 m gap. */
export const E3 = course('e3-stairway', 'Stairway', 'easy')
  .meta({
    biome: 'canyon',
    technique: 'stairs: pulse up, brake down',
    demands: '7 x 0.45 m steps up, 9 steps down ending at a 2 m gap',
    attemptsBand: [3, 6],
    targetTimeS: 70,
  })
  .camera({ mode: 'side' })
  .flat(20)
  .rollers(15, 0.3, 3)
  .flat(6)
  .checkpoint() // ~41 m
  .flat(3)
  .camera({ mode: 'side-tight', zoomBias: -0.6 })
  .stair({ count: 5, height: 0.3, length: 0.45 })
  .box({ width: 6, height: 1.5 })
  .stair({ count: 5, height: 0.3, length: 0.45, direction: 'down' })
  .flat(6)
  .camera({ mode: 'side' })
  .wave(16, 1.5)
  .flat(4)
  .humpRow(2, 0.3, 8)
  .flat(6)
  .checkpoint() // ~105 m
  .flat(3)
  .camera({ mode: 'side-tight', zoomBias: -0.6 })
  .stair({ count: 6, height: 0.4, length: 0.45 }) // 42 deg envelope, 2.4 m
  .box({ width: 4, height: 2.4 })
  .stair({ count: 8, height: 0.3, length: 0.4, direction: 'down' })
  .barrel({ count: 2, spacing: 0.7, burning: false })
  .flat(6)
  .camera({ mode: 'side' })
  .tabletop(6, 8, 1.0)
  .flat(6)
  .rollers(15, 0.3, 3)
  .flat(6)
  .checkpoint() // ~175 m
  .flat(3)
  .camera({ mode: 'side-tight', zoomBias: -0.6 })
  .stair({ count: 4, height: 0.4, length: 0.45 }) // a short flight at speed
  .box({ width: 6, height: 1.6 })
  .stair({ count: 5, height: 0.32, length: 0.45, direction: 'down' })
  .flat(6)
  .camera({ mode: 'side' })
  .humpRow(3, 0.3, 8)
  .flat(4)
  .wave(20, 2.0)
  .flat(4)
  .rollers(20, 0.3, 4)
  .flat(6)
  .checkpoint() // ~275 m
  .flat(3)
  .camera({ mode: 'side-tight', zoomBias: -0.6 })
  .stair({ count: 7, height: 0.45, length: 0.4 }) // 48 deg envelope: a wheelie tap on every step
  .box({ width: 3, height: 3.15 })
  .stair({ count: 9, height: 0.35, length: 0.4, direction: 'down' })
  .gap({ width: 2 }) // brake on the stairs, release before the lip
  .camera({ mode: 'side' })
  .flat(8)
  .wave(16, 1.5)
  .flat(4)
  .tabletop(6, 8, 1.0)
  .flat(6)
  .rollers(15, 0.3, 3)
  .flat(12)
  .finish();
