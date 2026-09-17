/**
 * Declared DOWNLOAD totals per byte source, known before the first byte so the denominator never grows
 * mid-boot. Each lookup is a literal key into the build-generated table: a renamed glb or a dropped art id
 * is a compile error (`pnpm typecheck`), not a 44 %. `core` is the bundle's own size, compiled into the
 * inline script by the build (it is only known after the bundle exists).
 *
 * The inline loader receives the rider bytes per outfit, the bike bytes per class (each `[lod, full]`) and the shared
 * art total as `__BOOT_TOTALS__` (vite.config.ts computes them from the same lists and the same file sizes;
 * `totals.test.ts` holds the two equal) so it need not bundle the table.
 */
import { PUBLIC_BYTES } from './plan.generated';
import { HERO_FILES_BY_OUTFIT_CLASS, heroPair, type HeroDetail } from '../render/hero/urls';
import type { BikeClass, RiderOutfit } from '../core/types';
import { declaredBootTotals } from './asset-totals';
import { heroTotal } from './heroTotal';
import type { ByteKey } from './steps';

/** The glTF files `setModels` awaits for the default pair before `ready` (`src/render/index.ts`): the LOD twins on a phone. */
export const HERO_FILES = heroPair('street-mustard', 'rookie', 'lod');
/** Every file the default outfit may draw (the build's `required` list carries all of them). */
export const HERO_FILES_ALL = HERO_FILES_BY_OUTFIT_CLASS['street-mustard'].rookie;

export const DECLARED_BOOT_TOTALS = declaredBootTotals((file) => PUBLIC_BYTES[file]);

/**
 * Ask 43: the pair the renderer is constructed with (main.ts passes outfit, class and the first-drawn detail from the
 * same `startTier` rule) is the pair boot declares - nothing else is fetched before `ready`; the twin streams after.
 */
export function bootByteTotals(outfit: RiderOutfit, cls: BikeClass = 'rookie', detail: HeroDetail = 'lod'): Readonly<Record<Exclude<ByteKey, 'core'>, number>> {
  return { heroModels: heroTotal(DECLARED_BOOT_TOTALS, outfit, cls, detail), bootArt: DECLARED_BOOT_TOTALS.bootArt };
}

export const BOOT_BYTE_TOTALS = bootByteTotals('street-mustard', 'rookie', 'lod');
