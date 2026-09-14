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

/** M1 — TEACHES the bunny hop onto ledges (preload lean back + throttle, snap forward). DEMANDS a 0.9 m rolling hop then a 2 m hop across. */
export const M1 = course('m1-hop-up', 'Hop Up', 'medium')
  .meta({
    biome: 'industrial',
    technique: 'bunny hop onto ledges',
    demands: '0.9 m ledge with a 10 m run-up, then a 2 m hop across to a 0.9 m platform',
    attemptsBand: [5, 9],
    targetTimeS: 80,
  })
  .camera({ mode: 'side-tight' })
  .flat(18)
  .checkpoint() // 18 m
  .flat(3)
  .ledge({ height: 0.45, length: 6 }) // stationary hop (measured apex 0.62): feel the timing
  .flat(6)
  .ledge({ height: 0.5, length: 4 })
  .flat(6)
  .camera({ mode: 'side' })
  .rollers(15, 0.3, 3)
  .flat(4)
  .wave(16, 1.5)
  .flat(6)
  .checkpoint() // ~95 m
  .flat(3)
  .camera({ mode: 'side-tight' })
  .ledge({ height: 0.55, length: 4 }) // at the stationary apex: preload fully or roll in
  .flat(4)
  .ledge({ height: 0.55, length: 1.5 }) // hop up, then hop across
  .gap({ width: 1.5, depth: 2 })
  .flat(6)
  .camera({ mode: 'side' })
  .humpRow(3, 0.3, 8)
  .flat(4)
  .tabletop(6, 8, 1.0)
  .flat(6)
  .wave(20, 2.0)
  .flat(4)
  .rollers(20, 0.3, 4)
  .flat(6)
  .checkpoint() // ~225 m
  .flat(3)
  .flat(6) // a short run-up: the rolling hop, at a rideable height first
  .camera({ mode: 'side-tight' })
  .ledge({ height: 0.7, length: 4 })
  .flat(6)
  .ledge({ height: 0.6, length: 2 })
  .gap({ width: 2, depth: 2 })
  .flat(6)
  .camera({ mode: 'side' })
  .rollers(20, 0.3, 4)
  .flat(6)
  .checkpoint() // ~245 m
  .flat(3)
  .camera({ mode: 'side-tight', cut: true })
  .flat(10) // run-up: the 0.9 m ledge needs the rolling hop (envelope 0.9 at 5 m/s)
  .ledge({ height: 0.9, length: 6 })
  .gap({ width: 2 }) // hop across from the ledge top
  .box({ width: 6, height: 0.9 })
  .ramp({ length: 3, height: 0.9, direction: 'down' })
  .camera({ mode: 'side' })
  .flat(12) // land and settle: a wave starting 6 m after a drop is a rising landing = endo (sweep 3: 49 faults at 244.7)
  .humpRow(2, 0.3, 8)
  .flat(6)
  .wave(20, 2.0)
  .flat(10)
  .finish();

/** M2 — TEACHES logs and drums: lift the front over a log, roll a big drum from a shelf, balance on a spinning one. DEMANDS box -> spinning drum -> box, a log pyramid and a see-saw exit. */
export const M2 = course('m2-drum-roll', 'Drum Roll', 'medium')
  .meta({
    biome: 'snow',
    technique: 'logs and drums: roll the top from the shelf',
    demands: 'hop from a 1.2 m box onto a spinning drum and off again, then a 3-row log pyramid',
    attemptsBand: [6, 12],
    targetTimeS: 85,
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
  .flat(6)
  .bumpDrum(0.8, 0.5) // 1.6 m drum sunk to 0.5 m proud: rolls with a lean back
  .flat(6)
  .bumpDrum(0.3, 0.3, { surface: 'wood' }) // half-buried log: a bare 0.3 m log is an 86 deg wall (physics 12.3) that the skill-2 bot failed 50 times
  .flat(5)
  .bumpDrum(0.3, 0.3, { surface: 'wood' })
  .flat(5)
  .bumpDrum(0.3, 0.3, { surface: 'wood' }) // two half-buried logs touching
  .bumpDrum(0.3, 0.3, { surface: 'wood' })
  .flat(6)
  .camera({ mode: 'side' })
  .rollers(15, 0.3, 3)
  .flat(4)
  .wave(20, 2.0)
  .flat(4)
  .humpRow(2, 0.3, 8)
  .flat(6)
  .checkpoint() // ~150 m
  .flat(3)
  .camera({ mode: 'side-tight', zoomBias: -0.5 })
  .logStep({ radius: 0.3, count: 3, rows: 2 }) // 0.82 m pyramid behind a 0.3 m entry ramp, throttle pulses
  .flat(6)
  .drumStep({ radius: 0.6 }, { exit: true }) // shelf at 1.0 -> 1.2 m drum -> shelf: roll over the top
  .flat(6)
  .camera({ mode: 'side' })
  .humpRow(3, 0.3, 8)
  .flat(6)
  .wave(16, 1.5)
  .flat(6)
  .checkpoint() // ~180 m
  .flat(3)
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
  .rollers(15, 0.3, 3)
  .flat(6)
  .checkpoint() // ~265 m
  .flat(3)
  .camera({ mode: 'side-tight', zoomBias: -0.5 })
  .ramp({ length: 4, height: 1.2 })
  .box({ width: 3, height: 1.2 })
  .drum({ radius: 0.8, rolls: true }) // top at 1.6: roll on from the box, balance, roll off
  .box({ width: 3, height: 1.2 })
  .ramp({ length: 4, height: 1.2, direction: 'down' })
  .flat(3)
  .logStep({ radius: 0.3, count: 4, rows: 3 }) // 1.34 m pyramid
  .flat(3)
  .seesawEntry({ length: 6, height: 1.0 }) // preview of M3
  .camera({ mode: 'side' })
  .flat(12)
  .wave(16, 1.5)
  .flat(10)
  .finish();

/** M3 — TEACHES see-saw timing (slow past the pivot, ride the tip) and thin landings. DEMANDS a gap landing onto a see-saw into a chain of thin landings. */
export const M3 = course('m3-see-saw', 'See-Saw', 'medium')
  .meta({
    biome: 'foundry',
    technique: 'see-saw timing and thin landings',
    demands: 'land on a see-saw from a 3 m gap, then plank and box landings at 2 m',
    attemptsBand: [8, 12],
    targetTimeS: 90,
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
  .rollers(15, 0.3, 3)
  .flat(4)
  .humpRow(2, 0.3, 8)
  .flat(4)
  .wave(20, 2.0)
  .flat(4)
  .rollers(20, 0.3, 4)
  .flat(6)
  .checkpoint() // ~165 m
  .flat(3)
  .camera({ mode: 'low' })
  .seesawEntry({ length: 6, height: 1.5 })
  .flat(3)
  .ramp({ length: 4, height: 1.5 })
  .gap({ width: 3 })
  .plank({ length: 4, height: 1.5 }) // thin landing at 1.5
  .ramp({ length: 3, height: 1.5, direction: 'down' })
  .flat(12)
  .camera({ mode: 'side' })
  .wave(16, 1.5)
  .flat(4)
  .tabletop(6, 8, 1.0)
  .flat(6)
  .checkpoint() // ~185 m
  .flat(3)
  .camera({ mode: 'low' })
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 3 })
  .plank({ length: 4, height: 1.0 }) // thin landing, lower and faster
  .ramp({ length: 3, height: 1.0, direction: 'down' })
  .flat(4)
  .seesawEntry({ length: 8, height: 1.5 })
  .flat(6)
  .camera({ mode: 'side' })
  .rollers(20, 0.3, 4)
  .flat(6)
  .checkpoint() // ~255 m
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
  .flat(8)
  .humpRow(2, 0.3, 8)
  .flat(12)
  .finish();
