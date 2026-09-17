/**
 * Declared DOWNLOAD totals per byte source, known before the first byte so the denominator never grows
 * mid-boot. Each lookup is a literal key into the build-generated table: a renamed glb or a dropped art id
 * is a compile error (`pnpm typecheck`), not a 44 %. `core` is the bundle's own size, compiled into the
 * inline script by the build (it is only known after the bundle exists).
 *
 * The inline loader receives one hero total per outfit x bike class and the shared art total as `__BOOT_TOTALS__`
 * (vite.config.ts computes them from the same lists and the same file sizes; `totals.test.ts` holds the two equal)
 * so it need not bundle the table.
 */
import { PUBLIC_BYTES } from './plan.generated';
import { HERO_FILES_BY_OUTFIT_CLASS } from '../render/hero/urls';
import type { BikeClass, RiderOutfit } from '../core/types';
import { CLASS_SLOT, declaredBootTotals } from './asset-totals';
import type { ByteKey } from './steps';

/** The glTF files `setModels` awaits (`Promise.all([full, lod])` per hero, src/render/index.ts) for the default pair. */
export const HERO_FILES = HERO_FILES_BY_OUTFIT_CLASS['street-mustard'].rookie;

export const DECLARED_BOOT_TOTALS = declaredBootTotals((file) => PUBLIC_BYTES[file]);

/** Ask 43: the pair the renderer is constructed with (main.ts passes both) is the pair boot declares - nothing else is fetched before `ready`. */
export function bootByteTotals(outfit: RiderOutfit, cls: BikeClass = 'rookie'): Readonly<Record<Exclude<ByteKey, 'core'>, number>> {
  return { heroModels: DECLARED_BOOT_TOTALS.heroModels[outfit][CLASS_SLOT[cls]], bootArt: DECLARED_BOOT_TOTALS.bootArt };
}

export const BOOT_BYTE_TOTALS = bootByteTotals('street-mustard', 'rookie');
