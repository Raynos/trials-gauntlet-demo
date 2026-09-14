/**
 * Track registry. Real hand-authored courses land here later; the scaffold
 * ships one flat test track so the harness has something to load.
 */
import type { TrackDef } from '../core/types';
import { seedFromString } from '../core/rng';

export const FLAT_TEST_TRACK: TrackDef = {
  id: 'flat-test',
  name: 'Flat Test Strip',
  tier: 'beginner',
  seed: seedFromString('flat-test'),
  profile: [
    { x: -10, y: 0 },
    { x: 200, y: 0 },
  ],
  obstacles: [],
  checkpoints: [
    { x: 40, spawn: { pos: { x: 40, y: 0 }, angle: 0 } },
    { x: 80, spawn: { pos: { x: 80, y: 0 }, angle: 0 } },
  ],
  start: { pos: { x: 0, y: 0 }, angle: 0 },
  finishX: 120,
  targetAttempts: 1,
};

const registry = new Map<string, TrackDef>([[FLAT_TEST_TRACK.id, FLAT_TEST_TRACK]]);

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
