/**
 * Medium tier — bunny hops, drums, see-saws. Attempts band 5-12.
 *
 * Envelope: stationary hop apex 0.55 m -> stationary ledges <= 0.45 m;
 * rolling hop 0.9 m -> rolling ledges <= 0.72 m (20 % margin). Drums that
 * `rolls` spin under the tyre and never translate (CONTRACT §2.2).
 */
import { course } from '../author';

/** M1 — TEACHES the bunny hop onto ledges (preload lean back + throttle, snap forward). DEMANDS a pole-top hop between two platforms. */
export const M1 = course('m1-hop-up', 'Hop Up', 'medium')
  .meta({
    biome: 'industrial',
    technique: 'bunny hop onto ledges',
    demands: 'hop from a 2.0 m platform onto a pole cap, then onto a 2.3 m platform',
    attemptsBand: [5, 9],
    targetTimeS: 42,
  })
  .camera({ mode: 'side-tight' })
  .flat(18)
  .checkpoint()
  .flat(3)
  .ledge({ height: 0.35, length: 6 }) // rollable with a front lift: feel the timing
  .flat(6)
  .ledge({ height: 0.45, length: 4 }) // stationary hop territory
  .flat(6)
  .checkpoint()
  .flat(3)
  .ledge({ height: 0.6, length: 4 }) // rolling hop from ~5 m/s
  .flat(4)
  .ledge({ height: 0.6, length: 1.5 }) // hop up, then hop across
  .gap({ width: 1.5, depth: 2 })
  .flat(6)
  .checkpoint()
  .flat(3)
  .camera({ mode: 'side-tight', cut: true })
  .plank({ angleDeg: 25, rise: 2.0 })
  .box({ width: 4, height: 2.0 })
  .gap({ width: 2.5 })
  .pole({ height: 2.0, radius: 0.25 }) // rear wheel on a 0.5 m target
  .gap({ width: 2.5 })
  .box({ width: 6, height: 2.3 }) // hop up 0.3 across 2.5
  .ramp({ length: 5, height: 2.3, direction: 'down' })
  .camera({ mode: 'side' })
  .flat(10)
  .finish();

/** M2 — TEACHES drum crossings and balance on a spinning drum. DEMANDS box -> spinning drum -> box, then a log pyramid and a see-saw exit. */
export const M2 = course('m2-drum-roll', 'Drum Roll', 'medium')
  .meta({
    biome: 'snow',
    technique: 'drum crossing and balance',
    demands: 'hop from a 1.6 m box onto a spinning drum and off again',
    attemptsBand: [6, 12],
    targetTimeS: 52,
  })
  .camera({ mode: 'side' })
  .flat(24)
  .checkpoint()
  .flat(3)
  .camera({ mode: 'side-tight', zoomBias: -0.5 })
  .drum({ radius: 0.8, depth: 0.3 }) // half-sunk speed bump: roll it
  .flat(6)
  .drum({ radius: 0.8 }) // on the ground: crawl over at <= 3 m/s
  .flat(6)
  .logpile({ radius: 0.3, count: 3, rows: 3 }) // 1.34 m pyramid, throttle pulses
  .flat(6)
  .checkpoint()
  .flat(3)
  .drum({ radius: 1.0 })
  .gap({ width: 2, depth: 2 }) // drum to drum by hop
  .drum({ radius: 1.0 })
  .flat(6)
  .drum({ radius: 0.9, rolls: true }) // the spool: it spins under you
  .flat(6)
  .checkpoint()
  .flat(3)
  .box({ width: 4, height: 1.6 })
  .drum({ radius: 1.0, rolls: true }) // top at 2.0: hop on from the box, balance, hop off
  .box({ width: 4, height: 1.6 })
  .ramp({ length: 4, height: 1.6, direction: 'down' })
  .flat(3)
  .logpile({ radius: 0.3, count: 4, rows: 4 }) // 1.86 m pyramid
  .flat(3)
  .seesaw({ length: 6, height: 1.0 }) // preview of M3
  .camera({ mode: 'side' })
  .flat(10)
  .finish();

/** M3 — TEACHES see-saw timing (slow past the pivot, ride the tip) and thin landings. DEMANDS a gap landing onto a see-saw into a chain of thin landings. */
export const M3 = course('m3-see-saw', 'See-Saw', 'medium')
  .meta({
    biome: 'foundry',
    technique: 'see-saw timing and thin landings',
    demands: 'land on a see-saw from a 4 m gap, then plank and box landings at 2 m',
    attemptsBand: [8, 12],
    targetTimeS: 58,
  })
  .camera({ mode: 'side' })
  .flat(28)
  .checkpoint()
  .flat(3)
  .camera({ mode: 'low' })
  .seesaw({ length: 6, height: 0.8 }) // full speed launches you; the lesson is 4 m/s
  .flat(8)
  .seesaw({ length: 8, height: 1.2 }) // slower tip, more airtime if rushed
  .flat(6)
  .camera({ mode: 'side' })
  .checkpoint()
  .flat(3)
  .seesaw({ length: 6, height: 1.5 })
  .flat(3)
  .ramp({ length: 4, height: 1.5 })
  .gap({ width: 3 })
  .plank({ length: 4, height: 1.5 }) // thin landing at 1.5, then a 1.5 drop
  .flat(6)
  .checkpoint()
  .flat(3)
  .camera({ mode: 'low', cut: true })
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 4 })
  .seesaw({ length: 6, height: 2.0 }) // rear-first on the near end: it dips, you roll up, it tips
  .gap({ width: 3 })
  .plank({ length: 3, height: 2.0 })
  .gap({ width: 2.5 })
  .box({ width: 6, height: 2.0 })
  .ramp({ length: 6, height: 2.0, curve: 0.3, direction: 'down' })
  .camera({ mode: 'side' })
  .flat(10)
  .finish();
