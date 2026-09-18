/**
 * Declared DOWNLOAD totals per byte source, known before the first byte so the denominator never grows
 * mid-boot. Each lookup is a literal key into the build-generated table: a renamed glb or a dropped art id
 * is a compile error (`pnpm typecheck`), not a 44 %. `core` is the bundle's own size, compiled into the
 * inline script by the build (it is only known after the bundle exists).
 *
 * The inline loader receives the hero total (ask 50: every hero file) and the shared art total as `__BOOT_TOTALS__`
 * (vite.config.ts computes them from the same lists and the same file sizes; `totals.test.ts` holds the two equal)
 * so it need not bundle the table.
 */
import { OFFLINE_PACK_BYTES, PUBLIC_BYTES } from './plan.generated';
import { declaredBootTotals, HERO_FILE_SET } from './asset-totals';
import type { ByteKey } from './steps';
import { selectedBootTotals } from './outfit';

/** The glTF files `setModels` fetches before `ready` (`src/render/index.ts`): all of them. */
export const HERO_FILES = HERO_FILE_SET;

/**
 * Ask 59: the offline pack's per-tier sums are GENERATED (`plan.generated.ts`) rather than re-summed here.
 * The bucketing rule needs the manifest's `kind`/`variant`, which only the build has read — so the build
 * applies `offlinePackBytes` once and writes the two per-tier numbers down, and this path and `__BOOT_TOTALS__`
 * are the same numbers by construction instead of by a test holding two sums equal.
 */
export const DECLARED_BOOT_TOTALS = declaredBootTotals((file) => PUBLIC_BYTES[file], OFFLINE_PACK_BYTES);

/** The three module-side byte sources, the offline pack resolved to THIS device's tier (`selectedBootTotals`). */
export function bootByteTotals(): Readonly<Record<Exclude<ByteKey, 'core'>, number>> {
  return selectedBootTotals(DECLARED_BOOT_TOTALS);
}

export const BOOT_BYTE_TOTALS = bootByteTotals();
