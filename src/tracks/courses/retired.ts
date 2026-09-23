/**
 * The retired set (store release Phase 3, D6): the 15-track curriculum in teaching order, the five `p<n>-*`
 * playgrounds and the Labs. Dev-only: nothing a player reaches names them since the world map became the
 * ROCKHOP campaign, and no build ships them in its entry chunk.
 *
 * This module is the dev chunk. `../index` `loadRetiredTracks()` imports it lazily (a production web build
 * emits it as `assets/retired-*.js`, fetched only by a `?` dev URL; a store build has no such import and no
 * such chunk). Node (the harness, vitest, the tools) and `vite dev` see it eagerly through `./eager`.
 */
import type { TrackDef } from '../../core/types';
import { SHIP_SEGMENTS } from '../segments';
import type { TrackSegment } from './playground-kit';
import { B1, B2, B3 } from './beginner';
import { E1, E2, E3 } from './easy';
import { M1, M2, M3 } from './medium';
import { H1, H2, H3 } from './hard';
import { X1, X2, X3 } from './extreme';
import { LAB_TRACKS } from './lab';
import { PLAYGROUND_TRACKS } from './playgrounds';

export { LAB_TRACKS, PLAYGROUND_TRACKS };

/** The 15 curriculum tracks in teaching order. */
export const CURRICULUM: readonly TrackDef[] = [B1, B2, B3, E1, E2, E3, M1, M2, M3, H1, H2, H3, X1, X2, X3];

/** Every retired track: the curriculum, then the playgrounds, then the Labs (the registry's order after the fixtures). */
export const RETIRED_TRACKS: readonly TrackDef[] = [...CURRICULUM, ...PLAYGROUND_TRACKS, ...LAB_TRACKS];

/** The curriculum's review segments (`../segments`), as `[id, segments]` rows: the registry folds them into `SHIP_SEGMENTS`. */
export const SHIP_SEGMENT_ROWS: readonly (readonly [string, readonly TrackSegment[]])[] = Object.entries(SHIP_SEGMENTS);
