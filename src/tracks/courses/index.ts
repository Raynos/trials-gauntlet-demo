/** Curriculum order: 5 tiers x 3 tracks, plus the two harness fixtures first. */
import type { TrackDef } from '../../core/types';
import { FLAT_TEST_TRACK, GAP_TEST_TRACK } from './test-tracks';
import { B1, B2, B3 } from './beginner';
import { E1, E2, E3 } from './easy';
import { M1, M2, M3 } from './medium';
import { H1, H2, H3 } from './hard';
import { X1, X2, X3 } from './extreme';

export { FLAT_TEST_TRACK, GAP_TEST_TRACK };

/** The 15 curriculum tracks in teaching order. */
export const CURRICULUM: readonly TrackDef[] = [B1, B2, B3, E1, E2, E3, M1, M2, M3, H1, H2, H3, X1, X2, X3];

/** Everything the registry knows, fixtures first. */
export const ALL_TRACKS: readonly TrackDef[] = [FLAT_TEST_TRACK, GAP_TEST_TRACK, ...CURRICULUM];
