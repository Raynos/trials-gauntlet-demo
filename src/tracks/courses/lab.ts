/**
 * Lab tracks (physics-v2 §15, MEGA_PLAN P0): the proving ground for every physics change. Ids start with
 * `lab-`; core-game lists them LAST under a "Lab" section and `meta.hints = ['physics']` turns on the
 * physics HUD on `lab-physics-test`. Geometry is frozen by golden hash like every course; `tracks.md`
 * §"Lab tracks" is the measurement contract.
 */
import type { TrackDef } from '../../core/types';
import { course } from '../author';
import { LAB_BOX_CLIMB, LAB_RAMP_JUMP } from './lab-reference';

/** Take-off: 6 m to +1.2 m = 11.31 deg (physics-v2 §15). */
export const LAB_TAKEOFF = { length: 6, height: 1.2, lip: 0.3 } as const;
/**
 * Pit: 3.0 m wide, floor 1.5 m below the run-up, landing ledge 1.5 m above it (0.3 m above the lip).
 * Tracks round 7 (physics v2 R3): the ledge was 1.6 (0.4 above the lip). Measured with the physics owner's
 * `lipHopper` on v2, the well-timed hop at 8-9 m/s rolled the rear over the ledge corner with a -0.06 m
 * margin on both classes and a 7 m/s hop was a nose-dive into the face; the vocabulary has no chamfer, so
 * the ledge came down 0.10 m — the step is now inside the v2 gas-hop's >= 0.1 m clear-air band (0.3-0.6 m
 * at 5 m/s, 0.45-0.7 at 8), the Pro's rolled miss at 8 m/s lands on the mattress instead of the face, and a
 * clean hop still clears while a late hop still fails (into the pit, no fault below 7 m/s). tracks.md §6.1.
 */
export const LAB_PIT = { width: 3, depth: 1.5, ledge: 1.5 } as const;
/** Run-out crest: a 20 m cosine wave of 0.6 m at 70-90 m. Crest radius 33.8 m: leaves the ground above 18.2 m/s (the "full gas over a crest" check). */
export const LAB_CREST = { length: 20, height: 0.6 } as const;

/**
 * `lab-physics-test` (physics-v2 §15, authored to the metre):
 *
 *   x   0 - 40   run-up, flat dirt (spawn at x = 0 per CONTRACT §2.4; §15's "start at x = 2" is the same flat)
 *   x  40 - 46   take-off: 6 m wood ramp rising 1.2 m (11.31 deg)
 *   x  46 - 46.3 0.3 m flat wood lip at +1.2
 *   x  46.3-49.3 3.0 m dry pit, floor at -1.5 m on a rubber mattress (no hazard: a short hop is a fall, not a fault)
 *   x  49.3      landing ledge at +1.5 (0.3 m above the lip; was +1.6 before physics v2); the pit's far wall is vertical -1.5 -> +1.5
 *   x  49.3-100  run-out, flat dirt at +1.5 with a 20 x 0.6 m cosine crest at 70-90; finish at x = 100
 *   checkpoints at 30 (before the ramp) and 62 (after the ledge)
 *
 * The ledge (+1.5 from 49.3 on) is the ground itself (dirt), not a 12 m concrete solid: the run-out has to sit
 * at the ledge height and a solid's top is not ground. The §15 return ramp is not authored: a heightfield
 * cannot run back under the take-off and the bike has no reverse; a rider on the mattress restarts at the
 * 30 m checkpoint (one tick). Opt-out: the checkpoint at 30 has 9.5 m of run-up to the take-off (the rule
 * wants 15); §15 fixes it there on purpose (a 7-8 m/s arrival is the hop's working speed), so the
 * checkpoint rule is off for this track and the test suite pins that exact single violation.
 */
export const LAB_PHYSICS_TEST: TrackDef = course('lab-physics-test', 'Physics Test', 'medium')
  .meta({
    biome: 'industrial',
    technique: 'the bunny hop',
    demands: 'one hop from an 11 deg lip onto a ledge 0.3 m above it across a 3 m dry pit; full gas over a crest without looping',
    attemptsBand: [3, 8],
    targetTimeS: 12, // round 7 gold (physics v2): skill-3 bot 8.13 s x 1.6 (the v1 stranger/bot clean ratio), rounded up to 5 s and kept non-decreasing through the tier; platinum = 0.85 x this (core rules)
  })
  .camera({ mode: 'side' })
  .hint('physics')
  .flat(30)
  .checkpoint()
  .flat(10)
  .ramp({ length: LAB_TAKEOFF.length, height: LAB_TAKEOFF.height, surface: 'wood' })
  .box({ width: LAB_TAKEOFF.lip, height: LAB_TAKEOFF.height, surface: 'wood' })
  .gap({ width: LAB_PIT.width, depth: LAB_PIT.depth, rise: LAB_PIT.ledge, hazard: 'none', floor: 'rubber' })
  .flat(12.7)
  .checkpoint()
  .flat(8)
  .wave(LAB_CREST.length, LAB_CREST.height)
  .flat(10)
  .finish(30, { checkpointRule: false });

/**
 * `lab-flat-200`: 200 m of flat dirt, nothing on it, checkpoints every 50 m, finish + catch. The envelope
 * instrument: 0 -> 16 m/s time, top speed, brake distance from 10 / 16 / 20 m/s, stationary and rolling
 * hop apex, wheelie hold, loop-out threshold — every flat-ground FEEL row of physics-v2 §14.2.
 */
export const LAB_FLAT_200: TrackDef = course('lab-flat-200', 'Flat 200', 'beginner')
  .meta({
    biome: 'industrial',
    technique: 'envelope measurement',
    demands: 'nothing: 200 m of flat dirt for the physics engineer',
    attemptsBand: [1, 1],
    targetTimeS: 17, // round 7 (physics v2): reflex `good` median clear 15.9 s x 1.05
  })
  .camera({ mode: 'side' })
  .hint('physics')
  .flat(50)
  .checkpoint()
  .flat(50)
  .checkpoint()
  .flat(50)
  .checkpoint()
  .flat(50)
  .finish();

export const LAB_TRACKS: readonly TrackDef[] = [LAB_PHYSICS_TEST, LAB_FLAT_200, LAB_BOX_CLIMB, LAB_RAMP_JUMP];
