/** The typed totals (`totals.ts`) and the build's `__BOOT_TOTALS__` are the same sums over the same table: hold them equal here. */
import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_BYTES } from './plan.generated';
import { BOOT_BYTE_TOTALS, HERO_FILES, bootByteTotals } from './totals';
import { BOOT_IDS } from '../render/art/boot-set';
import { declaredBootTotals, emptyBootTotals } from './asset-totals';
import { HERO_FILES_BY_OUTFIT_CLASS } from '../render/hero/urls';

// Distinct fixture sizes make selecting the wrong outfit, the wrong class or counting both pairs observable.
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
  it('sum the generated table over the hero files and the boot art set, and are positive', () => {
    const table = PUBLIC_BYTES as Readonly<Record<string, number>>;
    expect(BOOT_BYTE_TOTALS.heroModels).toBe(HERO_FILES.reduce((n, f) => n + table[f]!, 0));
    expect(BOOT_BYTE_TOTALS.bootArt).toBe(BOOT_IDS.reduce((n, id) => n + table[`art:${id}`]!, 0));
    expect(BOOT_BYTE_TOTALS.heroModels).toBeGreaterThan(0);
    expect(BOOT_BYTE_TOTALS.bootArt).toBeGreaterThan(0);
  });

  it('counts exactly the chosen outfit pair and the chosen class pair (ask 43: one file per outfit and per class)', () => {
    expect(bootByteTotals('street-mustard', 'rookie').heroModels).toBe(220);
    expect(bootByteTotals('street-mustard', 'pro').heroModels).toBe(235);
    expect(bootByteTotals('street-charcoal', 'rookie').heroModels).toBe(223);
    expect(bootByteTotals('street-openface', 'rookie').heroModels).toBe(260);
    expect(bootByteTotals('race-bluewhite', 'rookie').heroModels).toBe(245);
    expect(bootByteTotals('race-charcoalyellow', 'pro').heroModels).toBe(263);
    expect(bootByteTotals('street-mustard').heroModels).toBe(bootByteTotals('street-mustard', 'rookie').heroModels);
    expect(bootByteTotals('street-mustard').bootArt).toBe(bootByteTotals('race-bluewhite', 'pro').bootArt);
    expect(BOOT_BYTE_TOTALS).toEqual(bootByteTotals('street-mustard', 'rookie'));
    const table = PUBLIC_BYTES as Readonly<Record<string, number>>;
    for (const [outfit, classes] of Object.entries(HERO_FILES_BY_OUTFIT_CLASS)) {
      for (const [cls, files] of Object.entries(classes)) {
        expect(files).toHaveLength(4);
        expect(bootByteTotals(outfit as 'street-mustard', cls as 'rookie').heroModels).toBe((files as readonly string[]).reduce((n, f) => n + table[f]!, 0));
      }
    }
  });

  it('rejects a missing declared model instead of shrinking the denominator', () => {
    expect(() => declaredBootTotals(key => key === 'models/rider-race-bluewhite-lod.glb' ? Number.NaN : 10)).toThrow('models/rider-race-bluewhite-lod.glb');
    expect(() => declaredBootTotals(key => key === 'models/bike-pro.glb' ? 0 : 10)).toThrow('models/bike-pro.glb');
  });

  it('has an all-zero shape for the build before the catalog is read', () => {
    const empty = emptyBootTotals();
    expect(empty.bootArt).toBe(0);
    for (const classes of Object.values(empty.heroModels)) expect(classes).toEqual([0, 0]);
    expect(Object.keys(empty.heroModels).sort()).toEqual(Object.keys(HERO_FILES_BY_OUTFIT_CLASS).sort());
  });
});
