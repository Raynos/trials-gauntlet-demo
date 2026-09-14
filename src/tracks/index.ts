/**
 * Track registry (tracks owner). Fixtures `flat-test` / `gap-test`, the 15-track curriculum
 * (`b1-first-ride` style ids) and, last, the lab tracks (`lab-*`: physics-v2 §15 proving ground,
 * shown under a "Lab" section by core-game).
 */
import type { TrackDef } from '../core/types';
import { ALL_TRACKS, CURRICULUM, FLAT_TEST_TRACK, GAP_TEST_TRACK, LAB_FLAT_200, LAB_PHYSICS_TEST, LAB_TRACKS } from './courses';

export { FLAT_TEST_TRACK, GAP_TEST_TRACK, CURRICULUM, ALL_TRACKS, LAB_PHYSICS_TEST, LAB_FLAT_200, LAB_TRACKS };
export { LAB_TAKEOFF, LAB_PIT, LAB_CREST } from './courses/lab';

/** Lab tracks are `lab-*`; the track select lists them last under "Lab". */
export function isLabTrackId(id: string): boolean {
  return id.startsWith('lab-');
}

const registry = new Map<string, TrackDef>();
for (const t of ALL_TRACKS) registry.set(t.id, t);

export function registerTrack(track: TrackDef): void {
  if (registry.has(track.id)) throw new Error(`track already registered: ${track.id}`);
  registry.set(track.id, track);
}

export function getTrack(id: string): TrackDef | undefined {
  return registry.get(id);
}

export function listTrackIds(): string[] {
  return [...registry.keys()];
}

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
