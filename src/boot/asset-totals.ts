/** Small shared boot vocabulary; the inline receives just these computed totals. */
import type { BikeClass, RiderOutfit } from '../core/types';
import { BOOT_IDS } from '../render/art/boot-set';
import { HERO_FILES_BY_OUTFIT_CLASS, lodUrl, type HERO_FILES_BY_OUTFIT } from '../render/hero/urls';

export type BootAssetKey = (typeof HERO_FILES_BY_OUTFIT)[RiderOutfit][number] | `art:${(typeof BOOT_IDS)[number]}`;
/** `[lod, full]` bytes: boot declares ONE detail of ONE rider + ONE bike (ask 43 round 4, `src/game/startTier.ts firstHeroDetail`; the slot is `heroTotal.ts`). */
export type DetailBytes = readonly [lod: number, full: number];
/**
 * Ask 43: the hero total is the sum of the chosen outfit's file and the chosen class's file at the detail the first
 * frame draws — riders by outfit, bikes by class, `[lod, full]` tuples: this object is compiled into the 8 KB boot
 * inline verbatim, so it is 14 numbers, not 20 keyed pairs.
 */
export interface DeclaredBootTotals {
  riders: Record<RiderOutfit, DetailBytes>;
  bikes: Record<BikeClass, DetailBytes>;
  bootArt: number;
}

export const RIDER_OUTFITS = Object.keys(HERO_FILES_BY_OUTFIT_CLASS) as readonly RiderOutfit[];

export function declaredBootTotals(bytes: (key: BootAssetKey) => number): DeclaredBootTotals {
  const need = (key: BootAssetKey): number => {
    const size = bytes(key);
    if (!Number.isFinite(size) || size <= 0) throw new Error(`boot plan: missing or empty asset ${key}`);
    return size;
  };
  const riders = {} as Record<RiderOutfit, DetailBytes>;
  for (const outfit of RIDER_OUTFITS) {
    const [, , full, lod] = HERO_FILES_BY_OUTFIT_CLASS[outfit].rookie; // the rider's files are the same on both classes
    riders[outfit] = [need(lod), need(full)];
  }
  const [bikeRookie, bikePro] = [HERO_FILES_BY_OUTFIT_CLASS['street-mustard'].rookie[0], HERO_FILES_BY_OUTFIT_CLASS['street-mustard'].pro[0]];
  const bikes: Record<BikeClass, DetailBytes> = { rookie: [need(lodUrl(bikeRookie)), need(bikeRookie)], pro: [need(lodUrl(bikePro)), need(bikePro)] };
  return { riders, bikes, bootArt: BOOT_IDS.reduce((sum, id) => sum + need(`art:${id}`), 0) };
}

/** The shape before the catalog has been read (vite.config.ts holds one until `writeBootPlanTable` runs). */
export function emptyBootTotals(): DeclaredBootTotals {
  const t = declaredBootTotals(() => 1);
  for (const outfit of RIDER_OUTFITS) t.riders[outfit] = [0, 0];
  t.bikes = { rookie: [0, 0], pro: [0, 0] };
  t.bootArt = 0;
  return t;
}
