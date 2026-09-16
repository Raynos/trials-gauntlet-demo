/** Small shared boot vocabulary; the inline receives just these three computed totals. */
import type { RiderOutfit } from '../core/types';
import type { RiderModelFamily } from '../core/riderPresets';
import { BOOT_IDS } from '../render/art/boot-set';
import { HERO_FILES_BY_OUTFIT } from '../render/hero/urls';

export type BootAssetKey = (typeof HERO_FILES_BY_OUTFIT)[RiderOutfit][number] | `art:${(typeof BOOT_IDS)[number]}`;
export interface DeclaredBootTotals {
  heroModels: Record<RiderModelFamily, number>;
  bootArt: number;
}

export function declaredBootTotals(bytes: (key: BootAssetKey) => number): DeclaredBootTotals {
  const need = (key: BootAssetKey): number => {
    const size = bytes(key);
    if (!Number.isFinite(size) || size <= 0) throw new Error(`boot plan: missing or empty asset ${key}`);
    return size;
  };
  return {
    heroModels: {
      openface: HERO_FILES_BY_OUTFIT['street-openface'].reduce((sum, file) => sum + need(file), 0),
      street: HERO_FILES_BY_OUTFIT['street-mustard'].reduce((sum, file) => sum + need(file), 0),
      race: HERO_FILES_BY_OUTFIT['race-bluewhite'].reduce((sum, file) => sum + need(file), 0),
    },
    bootArt: BOOT_IDS.reduce((sum, id) => sum + need(`art:${id}`), 0),
  };
}
