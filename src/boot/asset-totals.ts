/** Small shared boot vocabulary; the inline receives just these computed totals. */
import type { RiderOutfit } from '../core/types';
import { BOOT_IDS } from '../render/art/boot-set';
import { HERO_FILES_BY_OUTFIT_CLASS, type HERO_FILES_BY_OUTFIT } from '../render/hero/urls';
import type { ArtTier } from './tier';

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
  offlinePack: OfflinePackBytes;
}

/**
 * The offline pack's bytes ONE PER DEVICE TIER (ask 59): the whole pack as a `1x` device downloads it,
 * and as a `2x` device does — tier-free assets counted in both. The loader's denominator is one of these
 * two numbers, chosen by the same `artTier()` the pack fetches with (`src/boot/outfit.ts`).
 */
export type OfflinePackBytes = Record<ArtTier, number>;

/**
 * THE membership rule for one art-pack entry, applied by the runtime list (`src/boot/offline-pack.ts`)
 * and by the denominator (`offlinePackBytes` below, over the build's byte table) — one function, so the
 * set that is fetched and the number that is promised cannot drift.
 *
 *   null     never fetched: `kind: 'social'` is `og.jpg`, a 115 KB link preview the game never draws
 *            (ask 59 item 5). It is still served and still named by `og:image` in index.html.
 *   '1x'/'2x'  fetched only by devices that draw that tier (ask 59 item 3).
 *   'both'   every device.
 */
export function packMembership(a: { kind?: string; variant?: string }): ArtTier | 'both' | null {
  if (a.kind === 'social') return null;
  return a.variant === '1x' || a.variant === '2x' ? a.variant : 'both';
}

/**
 * The same rule for a world-map plate, which is not in the art manifest and carries its tier in its
 * filename (`world-1536.webp`, `region-snow-1024.webp` — `src/ui/worldMap.ts` builds these names).
 * `worldmap.json` and anything else there is tier-free.
 */
export function platePackMembership(file: string): ArtTier | 'both' {
  return /-1536\.webp(\?|$)/.test(file) ? '2x' : /-1024\.webp(\?|$)/.test(file) ? '1x' : 'both';
}

export function emptyPackBytes(): OfflinePackBytes {
  return { '1x': 0, '2x': 0 };
}

/** Every hero file, once (the same set `src/render/index.ts setModels` fetches). */
export const HERO_FILE_SET: readonly BootAssetKey[] = [...new Set(Object.values(HERO_FILES_BY_OUTFIT_CLASS).flatMap((c) => [...c.rookie, ...c.pro]))];

/**
 * The offline pack's declared bytes from the build's byte table: every art asset the boot set does not
 * already cover, plus every world-map plate — bucketed by `packMembership` so the number a device is
 * shown is the number that device actually downloads. Called once, by the build (`vite.config.ts`,
 * which has the manifest and therefore the facets); the result is written into `plan.generated.ts`,
 * so the module path (`totals.ts`) and `__BOOT_TOTALS__` cannot be different sums.
 */
export function offlinePackBytes(rows: Iterable<readonly [string, number]>, facetOf: (id: string) => { kind?: string; variant?: string } = () => ({})): OfflinePackBytes {
  const boot = new Set<string>(BOOT_IDS);
  const out = emptyPackBytes();
  const add = (where: ArtTier | 'both' | null, bytes: number): void => {
    if (where === 'both') {
      out['1x'] += bytes;
      out['2x'] += bytes;
    } else if (where) out[where] += bytes;
  };
  for (const [key, bytes] of rows) {
    if (key.startsWith('art:')) {
      const id = key.slice(4);
      if (!boot.has(id)) add(packMembership(facetOf(id)), bytes);
    } else if (key.startsWith('art/worldmap/')) add(platePackMembership(key), bytes);
  }
  return out;
}

export function declaredBootTotals(bytes: (key: BootAssetKey) => number, offlinePack: OfflinePackBytes): DeclaredBootTotals {
  const need = (key: BootAssetKey): number => {
    const size = bytes(key);
    if (!Number.isFinite(size) || size <= 0) throw new Error(`boot plan: missing or empty asset ${key}`);
    return size;
  };
  return { heroModels: HERO_FILE_SET.reduce((sum, file) => sum + need(file), 0), bootArt: BOOT_IDS.reduce((sum, id) => sum + need(`art:${id}`), 0), offlinePack };
}

/** The shape before the catalog has been read (vite.config.ts holds one until `writeBootPlanTable` runs). */
export function emptyBootTotals(): DeclaredBootTotals {
  return { heroModels: 0, bootArt: 0, offlinePack: emptyPackBytes() };
}
