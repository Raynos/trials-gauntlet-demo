/**
 * The offline pack: everything the game can show that the rest of the boot does NOT already fetch.
 *
 * The user's rule (2026-09-17, `docs/plans/README.md` decisions table): *"I want this to behave like a
 * game. Load everything up front, but aggressively cache it. Once everything is loaded up front you can
 * cache it, so the second boot: all cache, all cache, all cache."* So there is no background fill and no
 * cache-on-use: the boot pulls the whole set inside its own bar, and the service worker's `cacheFirst`
 * keeps every byte of it (`src/pwa/sw.js`).
 *
 * What the rest of the boot already has: the core bundle + fonts, all 14 hero files (five outfits, two
 * liveries, authored + LOD — ask 50), and the boot art set (`BOOT_IDS`). What is left, and therefore what
 * this module names: every other asset in the art pack (menu plates, track/tier cards, medals, results
 * backgrounds, thumbs, the other biomes' world art) and the world map's plates.
 *
 * Ask 59 — "everything it can show" is per DEVICE, not per pack. The pack ships two resolution tiers of
 * the key art, the garage bikes, the medals and every world-map plate, and a 115 KB `og.jpg` that exists
 * only for link previews. Fetching all of it cost a phone 1.9 MB and a 1x desktop 3.3 MB of bytes it
 * would never draw. The tier comes from `artTier()` — the same function the screens draw with and the
 * same one the DOWNLOAD denominator is bucketed by (`packMembership`, `src/boot/asset-totals.ts`), so
 * the set fetched, the set drawn and the number promised are one decision. A device whose DPR changes
 * later asks for the other tier, misses the cache and degrades to the tier it has (`worldMapScreen.ts`
 * and `ArtManifest.applyBackground` both retry the other variant) — it never breaks.
 *
 * The byte total is declared by the build (`vite.config.ts` `writeBootPlanTable`) from the same two
 * sources, so the loader's denominator and this list cannot drift apart without `pnpm typecheck` or the
 * DOWNLOAD invariant catching it.
 */
import { BOOT_IDS } from '../render/art/boot-set';
import { REGIONS, regionPlateSrc, worldMapIndexSrc, worldPlateSrc } from '../ui/worldMap';
import { packMembership } from './asset-totals';
import { artTier, wantsHiRes } from './tier';
import type { ArtEntry } from '../ui/art';

/** The world map's plates and index: not in the art manifest, `<img>`-loaded by `worldMapScreen.ts`. One tier. */
export function worldMapUrls(): string[] {
  const hi = wantsHiRes();
  const out = [worldMapIndexSrc(), worldPlateSrc(hi)];
  for (const r of REGIONS) out.push(regionPlateSrc(r.id, hi));
  return out;
}

/** `[url, declared bytes]` for everything the boot has not already fetched, in the order it is streamed. */
export function offlinePackUrls(entries: readonly ArtEntry[]): [url: string, bytes: number][] {
  const boot = new Set<string>(BOOT_IDS);
  const tier = artTier();
  const seen = new Set<string>();
  const out: [string, number][] = [];
  for (const e of entries) {
    if (boot.has(e.id) || seen.has(e.src)) continue;
    const where = packMembership(e);
    if (where === null || (where !== 'both' && where !== tier)) continue;
    seen.add(e.src);
    out.push([e.src, e.bytes ?? 0]);
  }
  for (const u of worldMapUrls()) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push([u, 0]);
  }
  return out;
}
