/**
 * ROCKHOP zones (store release D5 / D20 / D23): the four worlds the twelve new courses live in, in progression
 * order. `BiomeId` has no zone ids yet (the World owner adds `coast | alpine | quarry`; snowline reuses `snow`),
 * so every course authors `zone` on its own metadata and gets `meta.biome` from `ROCKHOP_ZONE_BIOME` — the ONE
 * place the swap happens: when the union grows, change the three values below and nothing else.
 */
import type { BiomeId } from '../../core/types';

export type ZoneId = 'coast' | 'alpine' | 'quarry' | 'snowline';

export const ZONE_ORDER: readonly ZoneId[] = ['coast', 'alpine', 'quarry', 'snowline'];

/** Zone -> the nearest existing biome until the World owner's zone ids land (the one-line swap). */
export const ROCKHOP_ZONE_BIOME: { readonly [Z in ZoneId]: BiomeId } = {
  coast: 'industrial',
  alpine: 'canyon',
  quarry: 'canyon',
  snowline: 'snow',
};

export const ZONE_LABEL: { readonly [Z in ZoneId]: string } = {
  coast: 'Coast',
  alpine: 'Alpine',
  quarry: 'Quarry',
  snowline: 'Snowline',
};

/** The world-map code prefix of a zone's tracks (C1, A2, D3, S1 — fixed by the approved world map). */
export const ZONE_CODE: { readonly [Z in ZoneId]: string } = {
  coast: 'C',
  alpine: 'A',
  quarry: 'D',
  snowline: 'S',
};
