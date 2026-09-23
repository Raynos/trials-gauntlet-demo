/**
 * Track registry (tracks owner). Registered: the harness fixtures `flat-test` / `gap-test`, then the retired set
 * (the 15-track curriculum, the five `p<n>-*` playgrounds, the `lab-*` Labs; `./courses/retired`). Staged beside
 * it: the ROCKHOP courses (`./rockhop`), which resolve by id and are what the world map lists.
 *
 * Packaging (store release Phase 3, "retire from shipped builds"): the retired set reaches this module only
 * through `./courses/eager`, which a production `vite build` stubs to empty arrays (vite.config.ts
 * `retiredTracksLazy`). So
 *   - node (harness, vitest, tools) and `vite dev`: registered eagerly, `getTrack('b1-first-ride')` as always;
 *   - the web build: fixtures + ROCKHOP at boot; `loadRetiredTracks()` fetches the dev chunk (`assets/retired-*.js`),
 *     which src/main.ts awaits before booting any `?` dev URL (`?track=`, `?bench=1`, `?harness=1`, `?review=`);
 *   - the store build: `loadRetiredTracks()` folds to a no-op and no retired course, chunk or name ships.
 * In a production bundle `CURRICULUM` / `PLAYGROUND_TRACKS` / `LAB_TRACKS` / `RETIRED_TRACKS` are therefore empty
 * (read the registry after `loadRetiredTracks()` instead); nothing in the game reads them.
 */
import type { TrackDef } from '../core/types';
import { DEV_SURFACES } from '../core/release';
import { ROCKHOP_ALL } from './rockhop';
import { FLAT_TEST_TRACK, GAP_TEST_TRACK } from './courses/test-tracks';
import { CURRICULUM, LAB_TRACKS, PLAYGROUND_TRACKS, RETIRED_TRACKS, SHIP_SEGMENT_ROWS } from './courses/eager';
import type { TrackSegment } from './courses/playground-kit';

/** The retired set (dev-only since ROCKHOP ships): the 15-track curriculum, the five `p<n>-*` playgrounds, the Labs. Empty in a production bundle (above). */
export { FLAT_TEST_TRACK, GAP_TEST_TRACK, CURRICULUM, LAB_TRACKS, PLAYGROUND_TRACKS, RETIRED_TRACKS };
export { PLAYGROUND_ID_PREFIX, isPlaygroundTrackId, segmentsOf } from './courses/playground-kit';
export type { TrackSegment } from './courses/playground-kit';

const shipSegments: Record<string, readonly TrackSegment[]> = Object.fromEntries(SHIP_SEGMENT_ROWS);
/** Review segments of the 15 curriculum tracks (`./segments`, retired data): filled with the retired set (node at once, a web build by `loadRetiredTracks()`). */
export const SHIP_SEGMENTS: Readonly<Record<string, readonly TrackSegment[]>> = shipSegments;

/** Fixtures, then the retired set (in node; fixtures only in a production bundle, see above). */
export const ALL_TRACKS: readonly TrackDef[] = [FLAT_TEST_TRACK, GAP_TEST_TRACK, ...RETIRED_TRACKS];

/**
 * Lab tracks are `lab-*`; the track select lists them last under "Lab". Playground tracks are `p<n>-*`
 * (`isPlaygroundTrackId`): a "Playgrounds" row above Lab, always open, outside medals and progression.
 */
export function isLabTrackId(id: string): boolean {
  return id.startsWith('lab-');
}

const registry = new Map<string, TrackDef>();
for (const t of ALL_TRACKS) registry.set(t.id, t);

/**
 * ROCKHOP (store release Phase 3, `./rockhop`): the twelve tracks and four playgrounds resolve by id (`getTrack`,
 * `?track=<id>`, the harness) and are listed by `listRockhopTrackIds`; the world map reads `ROCKHOP_TRACKS` /
 * `ROCKHOP_PLAYGROUNDS`. `listTrackIds` stays the fixtures + retired set (dev and harness listings).
 */
const staged = new Map<string, TrackDef>();
for (const t of ROCKHOP_ALL) {
  if (registry.has(t.id)) throw new Error(`rockhop track id collides with a registered track: ${t.id}`);
  staged.set(t.id, t);
}

let retiredLoad: Promise<void> | undefined;

/**
 * Registers the retired set in a production web build by fetching its dev chunk (`./courses/retired`); resolves
 * at once where it is already registered (node, `vite dev`) and is a no-op in a store build (the `if` folds on the
 * literal `DEV_SURFACES`, so the import and its chunk are not emitted). Idempotent.
 */
export function loadRetiredTracks(): Promise<void> {
  if (DEV_SURFACES) {
    retiredLoad ??= import('./courses/retired').then((m) => {
      for (const t of m.RETIRED_TRACKS) {
        if (staged.has(t.id)) throw new Error(`retired track id collides with a rockhop track: ${t.id}`);
        if (!registry.has(t.id)) registry.set(t.id, t);
      }
      for (const [id, segs] of m.SHIP_SEGMENT_ROWS) shipSegments[id] ??= segs;
    });
    return retiredLoad;
  }
  return Promise.resolve();
}

export function registerTrack(track: TrackDef): void {
  if (registry.has(track.id)) throw new Error(`track already registered: ${track.id}`);
  registry.set(track.id, track);
}

export function getTrack(id: string): TrackDef | undefined {
  return registry.get(id) ?? staged.get(id);
}

/** Ids of the ROCKHOP set (tracks C1..S3 then the zone playgrounds). */
export function listRockhopTrackIds(): string[] {
  return [...staged.keys()];
}

/** Fixtures + the retired set (the retired ids only once registered: node always, a web build after `loadRetiredTracks()`). */
export function listTrackIds(): string[] {
  return [...registry.keys()];
}

export { ROCKHOP_TRACKS, ROCKHOP_PLAYGROUNDS, ROCKHOP_ALL, ROCKHOP_ZONE_BIOME, ROCKHOP_ZONES, ZONE_LABEL, ZONE_CODE, medalTargets, rockhopMeta, rockhopZone } from './rockhop';
export type { RockhopEntry, RockhopMeta, MedalTargets, ZoneId } from './rockhop';

export const DEFAULT_TRACK_ID = FLAT_TEST_TRACK.id;

export { compileTrack, hashColliders, TrackCompileError, profileQuery } from './compile';
export { course, CourseBuilder, FEEL, CHECKPOINT_RULE, FINISH_RUNOUT, validateSpawns, validateCheckpoints, auditCheckpoints, validateFinishRunout, setPiecesOf } from './author';
export type { CheckpointAuditRow, CheckpointViolation, SetPiece, SetPieceKind, TracksMeta } from './author';
export { describeTrack, describeObstacles, describeAhead } from './describe';
export {
  OBSTACLE_KINDS,
  DECOR_KINDS,
  KIND_DEFAULTS,
  SUMMARY_KEYS,
  footprint,
  isObstacleKind,
  isDecorKind,
  isTrackKind,
  isSolidKind,
  resolveParams,
  type ObstacleKind,
  type DecorKind,
  type TrackKind,
  type KindParams,
} from './kinds';
