/**
 * Which ride loop a track gets (store release Phase 4). The ROCKHOP courses carry a zone
 * (`meta.zone`: coast | alpine | quarry | snowline, Tracks owner); the world carries a biome
 * (World owner: coast | alpine | quarry, plus the legacy five). The zone wins, then the biome, then
 * COAST — the brand's home turf — so a track nobody tagged still gets music.
 */
import type { CompiledTrack } from '../../core/types';

export type MusicZone = 'coast' | 'alpine' | 'quarry' | 'snowline';
export const MUSIC_ZONES: readonly MusicZone[] = ['coast', 'alpine', 'quarry', 'snowline'];

/** Biome (new ids and the legacy five) → zone. Unknown strings fall through to the default. */
const BIOME_ZONE: Readonly<Record<string, MusicZone>> = {
  coast: 'coast',
  alpine: 'alpine',
  forest: 'alpine',
  quarry: 'quarry',
  desert: 'quarry',
  snow: 'snowline',
  snowline: 'snowline',
  canyon: 'quarry',
  foundry: 'quarry',
  industrial: 'coast',
  nightCity: 'coast',
};

export const DEFAULT_ZONE: MusicZone = 'coast';

export function asZone(v: unknown): MusicZone | null {
  return typeof v === 'string' && (MUSIC_ZONES as readonly string[]).includes(v) ? (v as MusicZone) : null;
}

export function zoneOf(track: Pick<CompiledTrack, 'def'> | null | undefined): MusicZone {
  const meta = track?.def?.meta as { zone?: unknown; biome?: unknown } | undefined;
  if (!meta) return DEFAULT_ZONE;
  const z = asZone(meta.zone);
  if (z) return z;
  if (typeof meta.biome === 'string') return BIOME_ZONE[meta.biome] ?? DEFAULT_ZONE;
  return DEFAULT_ZONE;
}
