// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectedBootTotals } from './outfit';

const BIKE_CLASS_KEY = 'trials.bikeClass'; // src/ui/best.ts `saveBikeChoice`
import { takeBootPlan, type BootWindow } from './handoff';
import { RIDER_OUTFIT_KEY, loadRiderOutfit, saveRiderOutfit } from '../ui/outfit';
import { loadBikeChoice } from '../ui/best';
import { RIDER_PRESETS } from '../core/riderPresets';
import type { DeclaredBootTotals } from './asset-totals';

// Every outfit × class total distinct, so the wrong outfit, family or class is observable.
const totals: DeclaredBootTotals = {
  heroModels: {
    'street-mustard': [220, 235], 'street-charcoal': [223, 238], 'street-openface': [260, 275],
    'race-bluewhite': [245, 260], 'race-charcoalyellow': [247, 262],
  },
  bootArt: 40,
};
vi.mock('./totals', () => ({ DECLARED_BOOT_TOTALS: {
  heroModels: {
    'street-mustard': [220, 235], 'street-charcoal': [223, 238], 'street-openface': [260, 275],
    'race-bluewhite': [245, 260], 'race-charcoalyellow': [247, 262],
  },
  bootArt: 40,
} }));
beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '/'); });
afterEach(() => { delete (window as BootWindow).__boot; history.replaceState(null, '', '/'); });

describe('outfit- and class-dependent boot totals', () => {
  it('matches runtime for every catalog design, legacy alias and invalid outfit, on both saved classes', () => {
    for (const cls of ['rookie', 'pro', 'invalid', null] as const) {
      localStorage.clear();
      if (cls) localStorage.setItem(BIKE_CLASS_KEY, cls);
      const expectedClass = loadBikeChoice() === 'pro' ? 1 : 0;
      expect(expectedClass).toBe(cls === 'pro' ? 1 : 0);
      for (const stored of ['street-openface', 'street-charcoal', 'race-charcoalyellow', 'street', 'race', 'invalid']) {
        localStorage.setItem(RIDER_OUTFIT_KEY, stored);
        for (const requested of [...RIDER_PRESETS.map(p => p.id), 'street', 'race', 'street-bluewhite', 'race-mustard', 'invalid', '']) {
          const search = `?outfit=${requested}`;
          const expected = loadRiderOutfit(requested);
          expect(selectedBootTotals(totals, search).heroModels).toBe(totals.heroModels[expected][expectedClass]);
          expect(localStorage.getItem(RIDER_OUTFIT_KEY)).toBe(stored);
        }
      }
    }
  });
  it('uses exactly the main entry preference rules for inline and fallback plans', async () => {
    for (const [stored, search, expected] of [
      [null, '', 'street-mustard'], ['race-bluewhite', '', 'race-bluewhite'], ['race-bluewhite', '?outfit=street', 'street-mustard'],
      ['street-mustard', '?outfit=race', 'race-bluewhite'], ['race-bluewhite', '?outfit=invalid', 'race-bluewhite'], ['invalid', '', 'street-mustard'],
    ] as const) {
      for (const cls of ['rookie', 'pro'] as const) {
        localStorage.clear();
        if (stored) localStorage.setItem(RIDER_OUTFIT_KEY, stored);
        localStorage.setItem(BIKE_CLASS_KEY, cls);
        history.replaceState(null, '', '/' + search);
        expect(loadRiderOutfit(new URLSearchParams(search).get('outfit'))).toBe(expected);
        const inlineTotals = selectedBootTotals(totals, search);
        expect(inlineTotals.heroModels).toBe(totals.heroModels[expected][cls === 'pro' ? 1 : 0]);
        const fallback = await takeBootPlan();
        expect(fallback.view.bytesTotal).toBe(inlineTotals.heroModels + inlineTotals.bootArt);
      }
    }
  });

  it('adopts an existing inline plan instead of resolving its outfit a second time', async () => {
    const original = await takeBootPlan();
    (window as BootWindow).__boot = { take: vi.fn(async () => original) };
    saveRiderOutfit('race-bluewhite');
    localStorage.setItem(BIKE_CLASS_KEY, 'pro');
    expect(await takeBootPlan()).toBe(original);
    expect(original.view.bytesTotal).toBe(totals.heroModels['street-mustard'][0] + totals.bootArt);
  });
});
