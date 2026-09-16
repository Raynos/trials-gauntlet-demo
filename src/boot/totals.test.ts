/** The typed totals (`totals.ts`) and the build's `__BOOT_TOTALS__` are the same sums over the same table: hold them equal here. */
import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_BYTES } from './plan.generated';
import { BOOT_BYTE_TOTALS, HERO_FILES, bootByteTotals } from './totals';
import { BOOT_IDS } from '../render/art/boot-set';
import { declaredBootTotals } from './asset-totals';

// Distinct fixture sizes make selecting the wrong outfit or counting both pairs observable.
vi.mock('./plan.generated', async () => {
  const { BOOT_IDS } = await import('../render/art/boot-set');
  return { PUBLIC_BYTES: {
    'models/bike.glb': 100,
    'models/bike-lod.glb': 30,
    'models/rider-street.glb': 70,
    'models/rider-street-lod.glb': 20,
    'models/rider-race.glb': 90,
    'models/rider-race-lod.glb': 25,
    ...Object.fromEntries(BOOT_IDS.map(id => [`art:${id}`, 10])),
  } };
});

describe('declared byte totals', () => {
  it('sum the generated table over the hero files and the boot art set, and are positive', () => {
    const table = PUBLIC_BYTES as Readonly<Record<string, number>>;
    expect(BOOT_BYTE_TOTALS.heroModels).toBe(HERO_FILES.reduce((n, f) => n + table[f]!, 0));
    expect(BOOT_BYTE_TOTALS.bootArt).toBe(BOOT_IDS.reduce((n, id) => n + table[`art:${id}`]!, 0));
    expect(BOOT_BYTE_TOTALS.heroModels).toBeGreaterThan(0);
    expect(BOOT_BYTE_TOTALS.bootArt).toBeGreaterThan(0);
  });

  it('counts only the chosen full/LOD rider pair and the shared bike pair', () => {
    expect(bootByteTotals('street-charcoal')).toEqual(bootByteTotals('street-mustard'));
    expect(bootByteTotals('race-charcoalyellow')).toEqual(bootByteTotals('race-bluewhite'));
    expect(bootByteTotals('street-mustard').heroModels).toBe(220);
    expect(bootByteTotals('race-bluewhite').heroModels).toBe(245);
    expect(bootByteTotals('street-mustard').bootArt).toBe(bootByteTotals('race-bluewhite').bootArt);
    expect(BOOT_BYTE_TOTALS).toEqual(bootByteTotals('street-mustard'));
  });

  it('rejects a missing declared model instead of shrinking the denominator', () => {
    expect(() => declaredBootTotals(key => key === 'models/rider-race-lod.glb' ? Number.NaN : 10)).toThrow('models/rider-race-lod.glb');
  });
});
