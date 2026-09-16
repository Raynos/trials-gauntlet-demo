/** Curriculum order: 5 tiers x 3 tracks, the two harness fixtures first, the lab tracks last. */
import type { TrackDef } from '../../core/types';
import { FLAT_TEST_TRACK, GAP_TEST_TRACK } from './test-tracks';
import { B1, B2, B3 } from './beginner';
import { E1, E2, E3 } from './easy';
import { M1, M2, M3 } from './medium';
import { H1, H2, H3 } from './hard';
import { X1, X2, X3 } from './extreme';
import { LAB_FLAT_200, LAB_PHYSICS_TEST, LAB_TRACKS } from './lab';
import { P1, P2, P3, P4, P5, PLAYGROUND_TRACKS } from './playgrounds';

export { FLAT_TEST_TRACK, GAP_TEST_TRACK, LAB_PHYSICS_TEST, LAB_FLAT_200, LAB_TRACKS, P1, P2, P3, P4, P5, PLAYGROUND_TRACKS };

/** The 15 curriculum tracks in teaching order. */
export const CURRICULUM: readonly TrackDef[] = [B1, B2, B3, E1, E2, E3, M1, M2, M3, H1, H2, H3, X1, X2, X3];

/**
 * Everything the registry knows: fixtures first, then the curriculum, then the playgrounds (`p*-*`, tracks round 10: one
 * beginner course per biome, shown in a "Playgrounds" row above Lab), then the lab tracks (`lab-*`, shown last under "Lab").
 */
export const ALL_TRACKS: readonly TrackDef[] = [FLAT_TEST_TRACK, GAP_TEST_TRACK, ...CURRICULUM, ...PLAYGROUND_TRACKS, ...LAB_TRACKS];
