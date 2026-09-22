/**
 * ROCKHOP course builder: the `course()` DSL plus the zone metadata every new track carries (code, zone, the
 * biome it renders as until the zone ids land) and the four medal targets derived from `targetTimeS` exactly as
 * the shipped rules do today (`src/game/rules.ts medalFor`, `src/ui/hud.ts`): gold = the target (<= 1 bail),
 * the top tier (OBSIDIAN, D19; `platinum` in code) = 0.85 x the target with 0 bails, silver = 1.25 x the target
 * (<= 5 bails), bronze = a finish.
 */
import type { TrackDef, TrackMeta, TrackTier } from '../../core/types';
import { course, type CourseBuilder, type TracksMeta } from '../author';
import type { TrackSegment } from '../courses/playgrounds';
import { ROCKHOP_ZONE_BIOME, type ZoneId } from './zones';

export interface MedalTargets {
  /** Seconds and max bails per tier; bronze is any finish. */
  obsidian: { timeS: number; bails: 0 };
  gold: { timeS: number; bails: 1 };
  silver: { timeS: number; bails: 5 };
  bronze: { timeS: null; bails: null };
}

export type RockhopMeta = TracksMeta & {
  zone: ZoneId;
  /** World-map code: C1..C3, A1..A3, D1..D3, S1..S3; playgrounds `P·C` etc. */
  code: string;
  /** The one idea of the course in a line (what a player remembers it by). */
  idea: string;
  /** The signature set piece (label of a `setPiece`). */
  hero: string;
  playground?: true;
  segments?: TrackSegment[];
};

export function medalTargets(targetTimeS: number): MedalTargets {
  const r = (v: number): number => Math.round(v * 100) / 100;
  return {
    obsidian: { timeS: r(targetTimeS * 0.85), bails: 0 },
    gold: { timeS: targetTimeS, bails: 1 },
    silver: { timeS: r(targetTimeS * 1.25), bails: 5 },
    bronze: { timeS: null, bails: null },
  };
}

type MetaIn = Omit<TrackMeta, 'camera' | 'hints' | 'biome'> & { idea: string; hero: string };

/** A ROCKHOP course: `course()` with the zone metadata filled in. */
export function rockhop(code: string, id: string, name: string, zone: ZoneId, tier: TrackTier, meta: MetaIn): CourseBuilder {
  const m: RockhopMeta = { ...meta, biome: ROCKHOP_ZONE_BIOME[zone], zone, code };
  return course(id, name, tier).meta(m as TrackMeta);
}

export function rockhopMeta(def: TrackDef): RockhopMeta {
  return def.meta as RockhopMeta;
}
