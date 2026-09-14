/**
 * Track registry (tracks owner). Fixtures `flat-test` / `gap-test` plus the
 * 15-track curriculum, registered with stable ids (`b1-first-ride` style).
 */
import type { TrackDef } from '../core/types';
import { ALL_TRACKS, CURRICULUM, FLAT_TEST_TRACK, GAP_TEST_TRACK } from './courses';

export { FLAT_TEST_TRACK, GAP_TEST_TRACK, CURRICULUM, ALL_TRACKS };

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
export { course, CourseBuilder, FEEL, CHECKPOINT_RULE, FINISH_RUNOUT, validateSpawns, validateCheckpoints, auditCheckpoints, validateFinishRunout } from './author';
export type { CheckpointAuditRow, CheckpointViolation } from './author';
export { describeTrack, describeObstacles, describeAhead } from './describe';
export {
  OBSTACLE_KINDS,
  KIND_DEFAULTS,
  SUMMARY_KEYS,
  footprint,
  isObstacleKind,
  isSolidKind,
  resolveParams,
  type ObstacleKind,
  type KindParams,
} from './kinds';
