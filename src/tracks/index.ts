/**
 * Track registry (tracks owner). Fixtures `flat-test` / `gap-test`, the 15-track curriculum
 * (`b1-first-ride` style ids) and, last, the lab tracks (`lab-*`: physics-v2 §15 proving ground,
 * shown under a "Lab" section by core-game).
 */
import type { TrackDef } from '../core/types';
import { ROCKHOP_ALL } from './rockhop';
import { ALL_TRACKS, CURRICULUM, FLAT_TEST_TRACK, GAP_TEST_TRACK, LAB_FLAT_200, LAB_PHYSICS_TEST, LAB_TRACKS, PLAYGROUND_TRACKS } from './courses';

export { FLAT_TEST_TRACK, GAP_TEST_TRACK, CURRICULUM, ALL_TRACKS, LAB_PHYSICS_TEST, LAB_FLAT_200, LAB_TRACKS, PLAYGROUND_TRACKS };
export { PLAYGROUND_ID_PREFIX, isPlaygroundTrackId, segmentsOf } from './courses/playgrounds';
export type { TrackSegment } from './courses/playgrounds';
export { SHIP_SEGMENTS } from './segments';
export { LAB_TAKEOFF, LAB_PIT, LAB_CREST } from './courses/lab';

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
 * ROCKHOP (store release Phase 3, `./rockhop`): the twelve new tracks and four playgrounds resolve by id
 * (`getTrack`, `?track=<id>`, the harness) but are not listed (`listTrackIds`) until the Brand/UI owner cuts the
 * world map over to `ROCKHOP_TRACKS` / `ROCKHOP_PLAYGROUNDS`. The retired set stays listed (dev-only after the
 * cut-over) and in the repo.
 */
const staged = new Map<string, TrackDef>();
for (const t of ROCKHOP_ALL) {
  if (registry.has(t.id)) throw new Error(`rockhop track id collides with a registered track: ${t.id}`);
  staged.set(t.id, t);
}

export function registerTrack(track: TrackDef): void {
  if (registry.has(track.id)) throw new Error(`track already registered: ${track.id}`);
  registry.set(track.id, track);
}

export function getTrack(id: string): TrackDef | undefined {
  return registry.get(id) ?? staged.get(id);
}

/** Ids of the staged ROCKHOP set (tracks C1..S3 then the zone playgrounds): resolvable, not yet listed. */
export function listRockhopTrackIds(): string[] {
  return [...staged.keys()];
}

export function listTrackIds(): string[] {
  return [...registry.keys()];
}

export { ROCKHOP_TRACKS, ROCKHOP_PLAYGROUNDS, ROCKHOP_ALL, ROCKHOP_ZONE_BIOME, ROCKHOP_ZONES, ZONE_LABEL, ZONE_CODE, medalTargets, rockhopMeta, rockhopZone } from './rockhop';
export type { RockhopEntry, RockhopMeta, MedalTargets, ZoneId } from './rockhop';
/** The retired set (dev-only once ROCKHOP ships): the 15-track curriculum, the five `p<n>-*` playgrounds, the Labs. */
export const RETIRED_TRACKS: readonly TrackDef[] = [...CURRICULUM, ...PLAYGROUND_TRACKS, ...LAB_TRACKS];

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

export { LAB_BOX_CLIMB, LAB_RAMP_JUMP, LAB_BOX_GEOMETRY, LAB_RAMP_GEOMETRY } from './courses/lab-reference';
