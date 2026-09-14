/**
 * Harness fixtures. `flat-test` is the scaffold strip (geometry before the finish kept byte-identical; the round-6 catch stands at 150 m);
 * `gap-test` is the simplest track with one ramp and one gap, for the bot's
 * attempts-monotonicity check (harness-metrics.md M3).
 */
import type { TrackDef } from '../../core/types';
import { seedFromString } from '../../core/rng';
import { course } from '../author';

export const FLAT_TEST_TRACK: TrackDef = {
  id: 'flat-test',
  name: 'Flat Test Strip',
  tier: 'beginner',
  seed: seedFromString('flat-test'),
  profile: [
    { x: -10, y: 0 },
    { x: 200, y: 0 },
  ],
  // finish run-out (round 6): 30 m of flat past the 120 m finish, then the soft catch every track has
  obstacles: [
    { kind: 'ramp', pos: { x: 150, y: 0 }, params: { length: 3, height: 0.75, surface: 'wood' } },
    { kind: 'box', pos: { x: 153, y: 0 }, params: { width: 2.4, height: 2.5, surface: 'metal' } },
  ],
  checkpoints: [
    { x: 40, spawn: { pos: { x: 40, y: 0 }, angle: 0 } },
    { x: 80, spawn: { pos: { x: 80, y: 0 }, angle: 0 } },
  ],
  start: { pos: { x: 0, y: 0 }, angle: 0 },
  finishX: 120,
  targetAttempts: 1,
};

/** 4 x 1.0 ramp (14 deg) into a 3 m gap: needs ~7 m/s, the 20 m run-up gives ~10. */
export const GAP_TEST_TRACK: TrackDef = course('gap-test', 'Gap Test', 'beginner')
  .meta({ biome: 'industrial', technique: 'jump a gap', attemptsBand: [1, 3], targetTimeS: 10 })
  .flat(20)
  .checkpoint()
  .flat(10)
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 3 })
  .flat(20)
  .finish(10, { checkpointRule: false }); // harness fixture (recorded inputs): geometry frozen, the round-4 checkpoint rule is a curriculum rule
