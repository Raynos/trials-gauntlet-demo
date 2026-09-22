/**
 * ROCKHOP course set (store release Phase 3, D6): twelve original tracks in four zones and one free-ride
 * playground per zone. This is the set the store build ships once the Brand/UI owner cuts the world map over;
 * until then the tracks are registered for `getTrack(id)` only (playable by `?track=<id>`, the harness, the
 * reviewer) and `listTrackIds()` / `ALL_TRACKS` — the shipped world map and progression — are unchanged.
 *
 * The retired set (the 15-track curriculum, the five `p<n>-*` playgrounds, the Labs in `../courses`) stays in the
 * repo as dev-only reference: `RETIRED_TRACKS` names it, and `scripts/track-originality.mjs` holds every track
 * here under 0.6 profile correlation with every one of them (bar 2).
 */
import type { TrackDef } from '../../core/types';
import { rockhopMeta, medalTargets, type MedalTargets } from './builder';
import { ALPINE_TRACKS } from './alpine';
import { COAST_TRACKS } from './coast';
import { QUARRY_TRACKS } from './quarry';
import { ZONE_ORDER, type ZoneId } from './zones';

export { ROCKHOP_ZONE_BIOME, ZONE_ORDER, ZONE_LABEL, ZONE_CODE, type ZoneId } from './zones';
export { medalTargets, rockhopMeta, type MedalTargets, type RockhopMeta } from './builder';

/** One row of the shipped progression, in order: what the world map / results screen read. */
export interface RockhopEntry {
  id: string;
  code: string;
  name: string;
  zone: ZoneId;
  tier: TrackDef['tier'];
  /** The four medals (bronze / silver / gold / OBSIDIAN = `platinum` in code), from `meta.targetTimeS`. */
  medals: MedalTargets;
  def: TrackDef;
}

/** The twelve tracks in progression order C1 -> S3. */
export const ROCKHOP_TRACK_DEFS: readonly TrackDef[] = [...COAST_TRACKS, ...ALPINE_TRACKS, ...QUARRY_TRACKS];

/** One free-ride playground per zone, zone order (no medals, outside progression; ids `p-<zone>`). */
export const ROCKHOP_PLAYGROUND_DEFS: readonly TrackDef[] = [];

function entry(def: TrackDef): RockhopEntry {
  const m = rockhopMeta(def);
  return { id: def.id, code: m.code, name: def.name, zone: m.zone, tier: def.tier, medals: medalTargets(m.targetTimeS ?? 60), def };
}

export const ROCKHOP_TRACKS: readonly RockhopEntry[] = ROCKHOP_TRACK_DEFS.map(entry);
export const ROCKHOP_PLAYGROUNDS: readonly { id: string; code: string; name: string; zone: ZoneId; def: TrackDef }[] = ROCKHOP_PLAYGROUND_DEFS.map((def) => {
  const m = rockhopMeta(def);
  return { id: def.id, code: m.code, name: def.name, zone: m.zone, def };
});

/** Every ROCKHOP course (tracks then playgrounds). */
export const ROCKHOP_ALL: readonly TrackDef[] = [...ROCKHOP_TRACK_DEFS, ...ROCKHOP_PLAYGROUND_DEFS];

/** Tracks of a zone, in order. */
export function rockhopZone(zone: ZoneId): RockhopEntry[] {
  return ROCKHOP_TRACKS.filter((t) => t.zone === zone);
}

export const ROCKHOP_ZONES = ZONE_ORDER;
