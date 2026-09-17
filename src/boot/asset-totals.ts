/** Small shared boot vocabulary; the inline receives just these three computed totals. */
import type { BikeClass, RiderOutfit } from '../core/types';
import { BOOT_IDS } from '../render/art/boot-set';
import { HERO_FILES_BY_OUTFIT_CLASS, type HERO_FILES_BY_OUTFIT } from '../render/hero/urls';

export type BootAssetKey = (typeof HERO_FILES_BY_OUTFIT)[RiderOutfit][number] | `art:${(typeof BOOT_IDS)[number]}`;
/**
 * Ask 43: one hero total per outfit x bike class - the four files `setModels` fetches for that pair, nothing shared.
 * A `[rookie, pro]` tuple per outfit, not a keyed pair: this object is compiled into the 8 KB boot inline verbatim.
 */
export interface DeclaredBootTotals {
  heroModels: Record<RiderOutfit, readonly [rookie: number, pro: number]>;
  bootArt: number;
}
export const CLASS_SLOT: Record<BikeClass, 0 | 1> = { rookie: 0, pro: 1 };

export const RIDER_OUTFITS = Object.keys(HERO_FILES_BY_OUTFIT_CLASS) as readonly RiderOutfit[];

export function declaredBootTotals(bytes: (key: BootAssetKey) => number): DeclaredBootTotals {
  const need = (key: BootAssetKey): number => {
    const size = bytes(key);
    if (!Number.isFinite(size) || size <= 0) throw new Error(`boot plan: missing or empty asset ${key}`);
    return size;
  };
  const total = (files: readonly BootAssetKey[]): number => files.reduce((sum, file) => sum + need(file), 0);
  const heroModels = {} as Record<RiderOutfit, readonly [number, number]>;
  for (const outfit of RIDER_OUTFITS) heroModels[outfit] = [total(HERO_FILES_BY_OUTFIT_CLASS[outfit].rookie), total(HERO_FILES_BY_OUTFIT_CLASS[outfit].pro)];
  return { heroModels, bootArt: BOOT_IDS.reduce((sum, id) => sum + need(`art:${id}`), 0) };
}

/** The shape before the catalog has been read (vite.config.ts holds one until `writeBootPlanTable` runs). */
export function emptyBootTotals(): DeclaredBootTotals {
  const t = declaredBootTotals(() => 1);
  for (const outfit of RIDER_OUTFITS) t.heroModels[outfit] = [0, 0];
  t.bootArt = 0;
  return t;
}
