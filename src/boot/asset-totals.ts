/** Small shared boot vocabulary; the inline receives just these computed totals. */
import type { RiderOutfit } from '../core/types';
import { BOOT_IDS } from '../render/art/boot-set';
import { HERO_FILES_BY_OUTFIT_CLASS, type HERO_FILES_BY_OUTFIT } from '../render/hero/urls';

export type BootAssetKey = (typeof HERO_FILES_BY_OUTFIT)[RiderOutfit][number] | `art:${(typeof BOOT_IDS)[number]}`;
/**
 * Ask 50: the boot bar covers EVERY hero file (five outfits, two classes, authored + LOD) — one number,
 * nothing streams after. Ask 58 adds `offlinePack`: the user asked for the game to behave like a game —
 * everything loaded up front, then cached — so the rest of the art pack and both world-map tiers are in
 * the same bar (`src/boot/offline-pack.ts`).
 */
export interface DeclaredBootTotals {
  heroModels: number;
  bootArt: number;
  offlinePack: number;
}

/** Every hero file, once (the same set `src/render/index.ts setModels` fetches). */
export const HERO_FILE_SET: readonly BootAssetKey[] = [...new Set(Object.values(HERO_FILES_BY_OUTFIT_CLASS).flatMap((c) => [...c.rookie, ...c.pro]))];

/**
 * The offline pack's declared bytes from the build's byte table: every art asset the boot set does not
 * already cover, plus every world-map plate. ONE rule, used by the build (`vite.config.ts`) and by the
 * module path (`totals.ts`) — `totals.test.ts` holds the two equal.
 */
export function offlinePackBytes(rows: Iterable<readonly [string, number]>): number {
  const boot = new Set<string>(BOOT_IDS);
  let n = 0;
  for (const [key, bytes] of rows) {
    if (key.startsWith('art:')) {
      if (!boot.has(key.slice(4))) n += bytes;
    } else if (key.startsWith('art/worldmap/')) n += bytes;
  }
  return n;
}

export function declaredBootTotals(bytes: (key: BootAssetKey) => number, offlinePack: number): DeclaredBootTotals {
  const need = (key: BootAssetKey): number => {
    const size = bytes(key);
    if (!Number.isFinite(size) || size <= 0) throw new Error(`boot plan: missing or empty asset ${key}`);
    return size;
  };
  return { heroModels: HERO_FILE_SET.reduce((sum, file) => sum + need(file), 0), bootArt: BOOT_IDS.reduce((sum, id) => sum + need(`art:${id}`), 0), offlinePack };
}

/** The shape before the catalog has been read (vite.config.ts holds one until `writeBootPlanTable` runs). */
export function emptyBootTotals(): DeclaredBootTotals {
  return { heroModels: 0, bootArt: 0, offlinePack: 0 };
}
