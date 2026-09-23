/**
 * Every authored course for node-side tools and tests: the two harness fixtures, the retired set (`./retired`:
 * curriculum, playgrounds, Labs) and the lab singletons. Not imported by the game: the registry (`../index`)
 * reaches the retired set only through `./eager`, so this barrel never lands in a shipped bundle.
 */
import type { TrackDef } from '../../core/types';
import { FLAT_TEST_TRACK, GAP_TEST_TRACK } from './test-tracks';
import { CURRICULUM, LAB_TRACKS, PLAYGROUND_TRACKS, RETIRED_TRACKS } from './retired';

export { FLAT_TEST_TRACK, GAP_TEST_TRACK, CURRICULUM, LAB_TRACKS, PLAYGROUND_TRACKS, RETIRED_TRACKS };
export { LAB_FLAT_200, LAB_PHYSICS_TEST, LAB_TAKEOFF, LAB_PIT, LAB_CREST } from './lab';
export { LAB_BOX_CLIMB, LAB_RAMP_JUMP, LAB_BOX_GEOMETRY, LAB_RAMP_GEOMETRY } from './lab-reference';
export { P1, P2, P3, P4, P5 } from './playgrounds';

/** Fixtures first, then the curriculum, the playgrounds (`p*-*`) and the Labs (`lab-*`). */
export const ALL_TRACKS: readonly TrackDef[] = [FLAT_TEST_TRACK, GAP_TEST_TRACK, ...RETIRED_TRACKS];
