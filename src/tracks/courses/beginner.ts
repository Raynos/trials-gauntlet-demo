/**
 * Beginner tier — biome industrial (warehouse amber), HUD hints on, camera side.
 * Attempts band 1-2. One technique each: throttle, weight shift, the jump.
 *
 * Round 3: no bare logs or drums anywhere in the tier (physics 12.3: a bare 0.3 m log
 * needs a front lift, which is not a beginner input); bumps are `hump` or `bumpDrum`
 * (0.3 m proud, rolls at any speed). Every track is a rhythm: flow (rollers, humps,
 * waves, tabletops) between the taught obstacles, a set piece at the end, ~35-45 s of
 * bot-clean riding, checkpoints every ~12-18 s of bot time (~20-35 s for a stranger).
 * Hints name the technique in <= 6 words, in obstacle order.
 */
import { course } from '../author';

/** B1 — TEACHES throttle control: go / hold steady / slow down. DEMANDS a slow roll over a speed bump after a descent. */
export const B1 = course('b1-first-ride', 'First Ride', 'beginner')
  .meta({
    biome: 'industrial',
    technique: 'throttle control',
    demands: 'slow down after the long descent for a speed hump and a low tabletop, then hold the gas home',
    attemptsBand: [1, 1],
    targetTimeS: 45,
  })
  .hint('Hold the gas up the hill')
  .hint('Steady gas over the rollers')
  .hint('Off the gas down the descent')
  .hint('Brake before the hump')
  .camera({ mode: 'side' })
  .flat(20)
  .slope(8, 1.2) // 8.5 deg: first hill, hold the gas
  .flat(8)
  .smooth(6, -1.2)
  .checkpoint() // ~42 m
  .flat(6)
  .rollers(15, 0.3, 3) // steady throttle; first suspension squash
  .flat(5)
  .tabletop(6, 8, 1.0) // 9.5 deg ramp, box, ramp down
  .flat(6)
  // flow: humps and a berm roll keep the speed up
  .humpRow(3, 0.3, 8)
  .flat(4)
  .wave(20, 1.5)
  .flat(4)
  .rollers(20, 0.3, 4)
  .flat(6)
  .checkpoint() // ~160 m
  .flat(6)
  .tabletop(8, 10, 1.2) // 8.5 deg, longer top: a full-throttle launch still lands on it
  .flat(8)
  .humpRow(2, 0.3, 8)
  .flat(6)
  .tabletop(6, 8, 1.0)
  .flat(6)
  .rollers(15, 0.3, 3)
  .flat(6)
  .wave(20, 2.0)
  .flat(4)
  .humpRow(3, 0.3, 8)
  .flat(6)
  .checkpoint() // ~310 m
  .flat(6)
  .slope(10, -2.0) // 11 deg descent builds speed
  .flat(8) // brake zone: measured 4.47 m from 10 m/s, authored 8
  .hump(0.3, 3) // speed hump: rolls at any speed, a small hop if you keep the gas on
  .flat(6)
  .tabletop(3, 4, 0.5) // low tabletop: throttle to climb it, that is all
  .flat(8)
  // set piece: the long roller-coaster home
  .wave(24, 2.5)
  .flat(4)
  .rollers(20, 0.3, 4)
  .flat(4)
  .tabletop(6, 8, 1.0)
  .flat(10)
  .wave(20, 2.0)
  .flat(10)
  .finish();

/** B2 — TEACHES weight shift: lean back on bumps and drops. DEMANDS a 1.8 m drop onto a downhill landing. */
export const B2 = course('b2-lean-back', 'Lean Back', 'beginner')
  .meta({
    biome: 'industrial',
    technique: 'weight shift on drops',
    demands: '1.8 m drop onto a downslope: lean back or nose in',
    attemptsBand: [1, 2],
    targetTimeS: 50,
  })
  .hint('Lean back over the bumps')
  .hint('Lean back off the drop')
  .hint('No brakes down the stairs')
  .hint('Lean back, gas off the big drop')
  .camera({ mode: 'side' })
  .flat(18)
  .bumpDrum(0.5, 0.3) // round speed bump, 0.3 m proud (rolls at any speed; the old bare 0.3 m logs needed a front lift)
  .flat(5)
  .bumpDrum(0.5, 0.3)
  .flat(5)
  .hump(0.3, 3)
  .flat(3)
  .bumpDrum(0.5, 0.3)
  .flat(4)
  .checkpoint() // ~42 m
  .flat(4)
  .ramp({ length: 4, height: 0.5 })
  .ledge({ height: 0.5, length: 10 }) // first drop: 0.5, onto a gentle downslope (a flat landing at speed endoed the skill-1 bot, sweep 3)
  .slope(4, -0.4)
  .flat(10) // land and settle before the next ramp: an up-ramp 6 m after a drop is a rising landing = endo (sweep 3)
  .ramp({ length: 5, height: 1.0 })
  .box({ width: 10, height: 1.0 }) // drop 1.0 onto a downslope
  .slope(6, -0.6)
  .flat(10)
  // flow
  .rollers(15, 0.3, 3)
  .flat(4)
  .humpRow(2, 0.3, 8)
  .flat(6)
  .wave(20, 2.0)
  .flat(4)
  .rollers(20, 0.3, 4)
  .flat(6)
  .checkpoint() // ~180 m
  .flat(4)
  .ramp({ length: 6, height: 1.2 })
  .box({ width: 4, height: 1.2 })
  .stair({ count: 4, height: 0.3, length: 0.6, direction: 'down' }) // lean back, no brake
  .flat(10)
  .wave(16, 1.2)
  .flat(4)
  .stepDowns(6, 6, [1.5, 1.0, 0.5]) // cascade: three 0.5 m drops in a row
  .flat(8)
  .rollers(15, 0.3, 3)
  .flat(6)
  .checkpoint() // ~215 m
  .flat(4)
  .ramp({ length: 5, height: 1.0 })
  .box({ width: 8, height: 1.0 })
  .stair({ count: 3, height: 0.33, length: 0.6, direction: 'down' })
  .flat(6)
  .humpRow(2, 0.3, 8)
  .flat(6)
  .wave(16, 1.5)
  .flat(6)
  .checkpoint() // ~340 m
  .flat(4)
  .camera({ mode: 'low' })
  .ramp({ length: 8, height: 1.8 }) // 12.7 deg: the set piece
  .box({ width: 10, height: 1.8 })
  .slope(6, -1.0) // downhill landing under the drop
  .camera({ mode: 'side' })
  .flat(8)
  .rollers(15, 0.3, 3)
  .flat(10)
  .finish();

/** B3 — TEACHES the jump: full throttle off a kicker, level in the air, land rear first. DEMANDS a kicker over a 5 m gap. */
export const B3 = course('b3-kicker-row', 'Kicker Row', 'beginner')
  .meta({
    biome: 'industrial',
    technique: 'jump and level in the air',
    demands: 'kicker over a 5 m gap: throttle to the lip',
    attemptsBand: [1, 2],
    targetTimeS: 55,
  })
  .hint('Full gas off the lip')
  .hint('Level the bike in the air')
  .hint('Off the gas before the landing')
  .hint('Hold gas to clear the gap')
  .camera({ mode: 'side' })
  .flat(28)
  .checkpoint() // 28 m
  .flat(3)
  .ramp({ length: 4, height: 1.2, curve: 0.3 }) // ~17 deg kicker, ~9 m/s here: lands ~5 m out
  .flat(14)
  .ramp({ length: 4, height: 1.5, curve: 0.3 })
  .flat(4)
  .tabletop(3, 8, 0.8, 4) // uphill landing zone at 0.8
  .flat(6)
  // flow: rollers and two small kickers with room to land
  .rollers(15, 0.3, 3)
  .flat(4)
  .ramp({ length: 4, height: 1.0, curve: 0.3 })
  .flat(12)
  .ramp({ length: 4, height: 1.0, curve: 0.3 })
  .flat(12)
  .checkpoint() // ~125 m
  .flat(4)
  .camera({ mode: 'high34', zoomBias: 0.4 })
  .ramp({ length: 5, height: 2.0, curve: 0.3 }) // ~22 deg
  .flat(3)
  .barrel({ count: 3, spacing: 0.7, burning: false }) // decor row under the flight
  .flat(2)
  .ramp({ length: 6, height: 2.0, curve: -0.3, direction: 'down' }) // downslope landing
  .flat(6)
  .camera({ mode: 'side' })
  .humpRow(2, 0.3, 8)
  .flat(6)
  .smallGap(4, 1.0, 2) // first gap: 2 m from a 14 deg kicker
  .flat(10)
  .smallGap(4, 1.2, 3)
  .flat(10)
  .checkpoint() // ~205 m
  .flat(4)
  .wave(20, 2.0)
  .flat(4)
  .rollers(20, 0.3, 4)
  .flat(4)
  .humpRow(2, 0.3, 8)
  .flat(6)
  .wave(16, 1.2)
  .flat(4)
  .ramp({ length: 5, height: 1.5, curve: 0.3 })
  .flat(4)
  .tabletop(3, 8, 0.8, 4) // uphill landing again, at speed
  .flat(6)
  .smallGap(4, 1.2, 3)
  .flat(10)
  .checkpoint() // ~275 m
  .flat(4)
  .flat(10) // run-up: ~11 m/s available, 5 m gap from a 22 deg lip needs ~8
  .camera({ mode: 'high34', zoomBias: 0.4 })
  .ramp({ length: 5, height: 2.0, curve: 0.3 }) // the set piece
  .gap({ width: 5 })
  .box({ width: 10, height: 0.4 })
  .camera({ mode: 'side' })
  .flat(8)
  .rollers(15, 0.3, 3)
  .flat(10)
  .finish();
