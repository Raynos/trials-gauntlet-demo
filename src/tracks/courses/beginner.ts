/**
 * Beginner tier — biome industrial (warehouse amber), HUD hints on, camera side.
 * Attempts band 1-2. One technique each: throttle, weight shift, the jump.
 */
import { course } from '../author';

/** B1 — TEACHES throttle control: go / hold steady / slow down. DEMANDS a slow roll over a speed bump after a descent. */
export const B1 = course('b1-first-ride', 'First Ride', 'beginner')
  .meta({
    biome: 'industrial',
    technique: 'throttle control',
    demands: 'brake after the descent and crawl over the drum bump',
    attemptsBand: [1, 1],
    targetTimeS: 18,
  })
  .hint('HOLD THROTTLE')
  .camera({ mode: 'side' })
  .flat(20)
  .slope(8, 1.2) // 8.5 deg: first hill, hold the gas
  .flat(8)
  .smooth(6, -1.2)
  .checkpoint()
  .flat(6)
  .rollers(15, 0.3, 3) // steady throttle; first suspension squash
  .flat(5)
  .tabletop(6, 8, 1.0) // 9.5 deg ramp, box, ramp down
  .checkpoint()
  .flat(6)
  .hint('SLOW DOWN')
  .slope(10, -2.0) // 11 deg descent builds speed
  .flat(8) // brake zone: measured 4.66 m from 10 m/s, authored 8
  .drum({ radius: 0.5, depth: 0.25 }) // speed bump: roll it slowly, fly it at speed
  .flat(6)
  .ledge({ height: 0.3, length: 6 }) // rollable kerb (wheel r 0.34)
  .flat(8)
  .finish();

/** B2 — TEACHES weight shift: lean back on bumps and drops. DEMANDS a 1.8 m drop onto a downhill landing. */
export const B2 = course('b2-lean-back', 'Lean Back', 'beginner')
  .meta({
    biome: 'industrial',
    technique: 'weight shift on drops',
    demands: '1.8 m drop onto a downslope: lean back or nose in',
    attemptsBand: [1, 2],
    targetTimeS: 22,
  })
  .hint('LEAN BACK ON DROPS')
  .camera({ mode: 'side' })
  .flat(18)
  .logpile({ radius: 0.3, count: 1 }) // single log
  .flat(4)
  .logpile({ radius: 0.3, count: 1 })
  .flat(4)
  .logpile({ radius: 0.3, count: 2, spacing: 0.4 }) // two logs, front lifts twice
  .checkpoint()
  .flat(4)
  .ramp({ length: 4, height: 0.5 })
  .ledge({ height: 0.5, length: 10 }) // first drop: 0.5
  .flat(6)
  .ramp({ length: 5, height: 1.0 })
  .box({ width: 10, height: 1.0 }) // drop 1.0
  .checkpoint()
  .flat(4)
  .ramp({ length: 6, height: 1.2 })
  .box({ width: 4, height: 1.2 })
  .stair({ count: 4, height: 0.3, length: 0.6, direction: 'down' }) // lean back, no brake
  .flat(6)
  .checkpoint()
  .flat(4)
  .camera({ mode: 'low' })
  .ramp({ length: 8, height: 1.8 }) // 12.7 deg
  .box({ width: 10, height: 1.8 })
  .slope(6, -1.0) // downhill landing under the drop
  .camera({ mode: 'side' })
  .flat(10)
  .finish();

/** B3 — TEACHES the jump: full throttle off a kicker, level in the air, land rear first. DEMANDS a kicker over a 5 m gap. */
export const B3 = course('b3-kicker-row', 'Kicker Row', 'beginner')
  .meta({
    biome: 'industrial',
    technique: 'jump and level in the air',
    demands: 'kicker over a 5 m gap: throttle to the lip',
    attemptsBand: [1, 2],
    targetTimeS: 26,
  })
  .hint('FULL THROTTLE OFF THE LIP')
  .camera({ mode: 'side' })
  .flat(28)
  .checkpoint()
  .flat(3)
  .ramp({ length: 4, height: 1.2, curve: 0.3 }) // ~17 deg kicker, ~9 m/s here: lands ~5 m out
  .flat(14)
  .ramp({ length: 4, height: 1.5, curve: 0.3 })
  .flat(4)
  .tabletop(3, 8, 0.8, 4) // uphill landing zone at 0.8
  .checkpoint()
  .flat(4)
  .camera({ mode: 'high34', zoomBias: 0.4 })
  .ramp({ length: 5, height: 2.0, curve: 0.3 }) // ~22 deg
  .flat(3)
  .barrel({ count: 3, spacing: 0.7, burning: false }) // decor row under the flight
  .flat(2)
  .ramp({ length: 6, height: 2.0, curve: -0.3, direction: 'down' }) // downslope landing
  .flat(6)
  .camera({ mode: 'side' })
  .checkpoint()
  .flat(4)
  .flat(10) // run-up: ~11 m/s available, 5 m gap from a 22 deg lip needs ~8
  .ramp({ length: 5, height: 2.0, curve: 0.3 })
  .gap({ width: 5 })
  .box({ width: 10, height: 0.4 })
  .flat(8)
  .finish();
