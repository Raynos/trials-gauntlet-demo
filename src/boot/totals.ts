/**
 * Declared DOWNLOAD totals per byte source, known before the first byte so the denominator never grows
 * mid-boot. Each lookup is a literal key into the build-generated table: a renamed glb or a dropped art id
 * is a compile error (`pnpm typecheck`), not a 44 %. `core` is the bundle's own size, compiled into the
 * inline script by the build (it is only known after the bundle exists).
 *
 * The inline loader receives the same two numbers as `__BOOT_TOTALS__` (vite.config.ts computes them from
 * the same lists and the same file sizes; `totals.test.ts` holds the two equal) so it need not bundle the table.
 */
import { PUBLIC_BYTES } from './plan.generated';
import { HERO_URLS, lodUrl } from '../render/hero/urls';
import { BOOT_IDS } from '../render/art/boot-set';
import type { ByteKey } from './steps';

/** The glTF files `setModels` awaits (`Promise.all([full, lod])` per hero, src/render/index.ts). */
export const HERO_FILES = [HERO_URLS.bike, lodUrl(HERO_URLS.bike), HERO_URLS.rider, lodUrl(HERO_URLS.rider)] as const;

const sum = (ns: readonly number[]): number => ns.reduce((a, b) => a + b, 0);

export const BOOT_BYTE_TOTALS: Readonly<Record<Exclude<ByteKey, 'core'>, number>> = {
  heroModels: sum(HERO_FILES.map((f) => PUBLIC_BYTES[f])),
  bootArt: sum(BOOT_IDS.map((id) => PUBLIC_BYTES[`art:${id}`])),
};
