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
    demands: '0.9 m ledge with a 10 m run-up, then a 2 m hop across to a 0.9 m platform',
    attemptsBand: [5, 9],
    targetTimeS: 42,
  })
  .camera({ mode: 'side-tight' })
  .flat(18)
  .checkpoint()
  .flat(3)
  .ledge({ height: 0.45, length: 6 }) // stationary hop (measured apex 0.55): feel the timing
  .flat(6)
  .ledge({ height: 0.5, length: 4 })
  .flat(6)
  .checkpoint()
  .flat(3)
  .ledge({ height: 0.55, length: 4 }) // at the stationary apex: preload fully or roll in
  .flat(4)
  .ledge({ height: 0.55, length: 1.5 }) // hop up, then hop across
  .gap({ width: 1.5, depth: 2 })
  .flat(6)
  .checkpoint()
  .flat(3)
  .camera({ mode: 'side-tight', cut: true })
  .flat(10) // run-up: the 0.9 m ledge needs the rolling hop (envelope 0.9 at 5 m/s)
  .ledge({ height: 0.9, length: 6 })
  .gap({ width: 2 }) // hop across from the ledge top
  .box({ width: 6, height: 0.9 })
  .ramp({ length: 3, height: 0.9, direction: 'down' })
  .camera({ mode: 'side' })
  .flat(10)
  .finish();

/** M2 — TEACHES drum crossings and balance on a spinning drum. DEMANDS box -> spinning drum -> box, then a log pyramid and a see-saw exit. */
export const M2 = course('m2-drum-roll', 'Drum Roll', 'medium')
  .meta({
    biome: 'snow',
    technique: 'drum crossing and balance',
    demands: 'hop from a 1.2 m box onto a spinning drum and off again',
    attemptsBand: [6, 12],
    targetTimeS: 52,
  })
  .camera({ mode: 'side' })
  .flat(24)
  .checkpoint()
  .flat(3)
  .camera({ mode: 'side-tight', zoomBias: -0.5 })
  .drum({ radius: 0.5, depth: 0.7 }) // sunk drum, 0.3 m proud: a round speed bump
  .flat(6)
  .kickerDrum({ radius: 0.6 }) // kicker onto a 1.2 m drum: front up, roll over
  .flat(6)
  .logpile({ radius: 0.3, count: 3, rows: 2 }) // 0.82 m pyramid, throttle pulses
  .flat(6)
  .checkpoint()
  .flat(3)
  .kickerDrum({ radius: 0.8 })
  .gap({ width: 2, depth: 2 }) // drum to drum by hop
  .drum({ radius: 0.8 })
  .flat(6)
  .kickerDrum({ radius: 0.8, rolls: true }) // the spool: it spins under you
  .flat(6)
  .checkpoint()
  .flat(3)
  .ramp({ length: 4, height: 1.2 })
  .box({ width: 3, height: 1.2 })
  .drum({ radius: 0.8, rolls: true }) // top at 1.6: hop on from the box, balance, hop off
  .box({ width: 3, height: 1.2 })
  .ramp({ length: 4, height: 1.2, direction: 'down' })
  .flat(3)
  .logpile({ radius: 0.3, count: 4, rows: 3 }) // 1.34 m pyramid
  .flat(3)
  .seesawEntry({ length: 6, height: 1.0 }) // preview of M3
  .camera({ mode: 'side' })
  .flat(10)
  .finish();

/** M3 — TEACHES see-saw timing (slow past the pivot, ride the tip) and thin landings. DEMANDS a gap landing onto a see-saw into a chain of thin landings. */
export const M3 = course('m3-see-saw', 'See-Saw', 'medium')
  .meta({
    biome: 'foundry',
    technique: 'see-saw timing and thin landings',
    demands: 'land on a see-saw from a 3 m gap, then plank and box landings at 2 m',
    attemptsBand: [8, 12],
    targetTimeS: 58,
  })
  .camera({ mode: 'side' })
  .flat(28)
  .checkpoint()
  .flat(3)
  .camera({ mode: 'low' })
  .seesawEntry({ length: 6, height: 0.8 }) // full speed launches you; the lesson is 4 m/s
  .flat(8)
  .seesawEntry({ length: 8, height: 1.2 }) // slower tip, more airtime if rushed
  .flat(6)
  .camera({ mode: 'side' })
  .checkpoint()
  .flat(3)
  .seesawEntry({ length: 6, height: 1.5 })
  .flat(3)
  .ramp({ length: 4, height: 1.5 })
  .gap({ width: 3 })
  .plank({ length: 4, height: 1.5 }) // thin landing at 1.5
  .ramp({ length: 3, height: 1.5, direction: 'down' })
  .flat(6)
  .checkpoint()
  .flat(3)
  .camera({ mode: 'low', cut: true })
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 3 })
  .seesaw({ length: 8, height: 2.0 }) // land rear-first on the resting near end: it dips, you roll up, it tips
  .gap({ width: 3 })
  .plank({ length: 3, height: 2.0 })
  .gap({ width: 2.5 })
  .box({ width: 6, height: 2.0 })
  .ramp({ length: 6, height: 2.0, curve: 0.3, direction: 'down' })
  .camera({ mode: 'side' })
  .flat(10)
  .finish();
