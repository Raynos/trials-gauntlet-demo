/** The typed totals (`totals.ts`) and the build's `__BOOT_TOTALS__` are the same sums over the same table: hold them equal here. */
import { describe, expect, it } from 'vitest';
import { PUBLIC_BYTES } from './plan.generated';
import { BOOT_BYTE_TOTALS, HERO_FILES } from './totals';
import { BOOT_IDS } from '../render/art/boot-set';

describe('declared byte totals', () => {
  it('sum the generated table over the hero files and the boot art set, and are positive', () => {
    const table = PUBLIC_BYTES as Readonly<Record<string, number>>;
    expect(BOOT_BYTE_TOTALS.heroModels).toBe(HERO_FILES.reduce((n, f) => n + table[f]!, 0));
    expect(BOOT_BYTE_TOTALS.bootArt).toBe(BOOT_IDS.reduce((n, id) => n + table[`art:${id}`]!, 0));
    expect(BOOT_BYTE_TOTALS.heroModels).toBeGreaterThan(0);
    expect(BOOT_BYTE_TOTALS.bootArt).toBeGreaterThan(0);
  });
});
