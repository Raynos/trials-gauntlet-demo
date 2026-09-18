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
import { PUBLIC_BYTES } from './plan.generated';
import { declaredBootTotals, HERO_FILE_SET, offlinePackBytes } from './asset-totals';
import type { ByteKey } from './steps';

/** The glTF files `setModels` fetches before `ready` (`src/render/index.ts`): all of them. */
export const HERO_FILES = HERO_FILE_SET;

export const DECLARED_BOOT_TOTALS = declaredBootTotals((file) => PUBLIC_BYTES[file], offlinePackBytes(Object.entries(PUBLIC_BYTES)));

export function bootByteTotals(): Readonly<Record<Exclude<ByteKey, 'core'>, number>> {
  return { heroModels: DECLARED_BOOT_TOTALS.heroModels, bootArt: DECLARED_BOOT_TOTALS.bootArt, offlinePack: DECLARED_BOOT_TOTALS.offlinePack };
}

export const BOOT_BYTE_TOTALS = bootByteTotals();
