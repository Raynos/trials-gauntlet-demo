/** The typed totals (`totals.ts`) and the build's `__BOOT_TOTALS__` are the same sums over the same table: hold them equal here. */
import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_BYTES } from './plan.generated';
import { BOOT_BYTE_TOTALS, HERO_FILES, bootByteTotals } from './totals';
import { BOOT_IDS } from '../render/art/boot-set';
import { declaredBootTotals, emptyBootTotals, HERO_FILE_SET } from './asset-totals';
import { HERO_FILES_BY_OUTFIT_CLASS } from '../render/hero/urls';

// Distinct fixture sizes make a missed or double-counted file observable.
vi.mock('./plan.generated', async () => {
  const { BOOT_IDS } = await import('../render/art/boot-set');
  return { PUBLIC_BYTES: {
    'models/bike-rookie.glb': 100, 'models/bike-rookie-lod.glb': 30,
    'models/bike-pro.glb': 110, 'models/bike-pro-lod.glb': 35,
    'models/rider-street-mustard.glb': 70, 'models/rider-street-mustard-lod.glb': 20,
    'models/rider-street-charcoal.glb': 72, 'models/rider-street-charcoal-lod.glb': 21,
    'models/rider-street-openface.glb': 105, 'models/rider-street-openface-lod.glb': 25,
    'models/rider-race-bluewhite.glb': 90, 'models/rider-race-bluewhite-lod.glb': 25,
    'models/rider-race-charcoalyellow.glb': 92, 'models/rider-race-charcoalyellow-lod.glb': 26,
    ...Object.fromEntries(BOOT_IDS.map(id => [`art:${id}`, 10])),
  } };
});

describe('declared byte totals', () => {
  it('sum the generated table over every hero file and the boot art set, and are positive', () => {
    const table = PUBLIC_BYTES as Readonly<Record<string, number>>;
    expect(BOOT_BYTE_TOTALS.heroModels).toBe(HERO_FILES.reduce((n, f) => n + table[f]!, 0));
    expect(BOOT_BYTE_TOTALS.bootArt).toBe(BOOT_IDS.reduce((n, id) => n + table[`art:${id}`]!, 0));
    expect(BOOT_BYTE_TOTALS.heroModels).toBeGreaterThan(0);
    expect(BOOT_BYTE_TOTALS.bootArt).toBeGreaterThan(0);
  });

  it('counts all fourteen hero files exactly once (ask 50: every outfit, class and detail is in the one bar)', () => {
    expect(HERO_FILE_SET).toHaveLength(14);
    expect(new Set(HERO_FILE_SET).size).toBe(14);
    const every = new Set(Object.values(HERO_FILES_BY_OUTFIT_CLASS).flatMap((c) => [...c.rookie, ...c.pro]));
    expect(new Set(HERO_FILE_SET)).toEqual(every);
    expect(bootByteTotals().heroModels).toBe(821); // the fixture's fourteen sizes
    expect(BOOT_BYTE_TOTALS).toEqual(bootByteTotals());
  });

  it('rejects a missing declared model instead of shrinking the denominator', () => {
    expect(() => declaredBootTotals(key => key === 'models/rider-race-bluewhite-lod.glb' ? Number.NaN : 10)).toThrow('models/rider-race-bluewhite-lod.glb');
    expect(() => declaredBootTotals(key => key === 'models/bike-pro.glb' ? 0 : 10)).toThrow('models/bike-pro.glb');
  });

  it('has an all-zero shape for the build before the catalog is read', () => {
    expect(emptyBootTotals()).toEqual({ heroModels: 0, bootArt: 0 });
  });
});
