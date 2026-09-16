// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectedBootTotals } from './outfit';
import { takeBootPlan, type BootWindow } from './handoff';
import { RIDER_OUTFIT_KEY, loadRiderOutfit, saveRiderOutfit } from '../ui/outfit';
import { RIDER_PRESETS } from '../core/riderPresets';

vi.mock('./totals', () => ({ DECLARED_BOOT_TOTALS: { heroModels: { street: 220, race: 245 }, bootArt: 40 } }));
const totals = { heroModels: { street: 220, race: 245 }, bootArt: 40 };
beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '/'); });
afterEach(() => { delete (window as BootWindow).__boot; history.replaceState(null, '', '/'); });

describe('outfit-dependent boot totals', () => {
  it('matches runtime for every catalog design, legacy alias and invalid family/palette combination', () => {
    for (const stored of ['street-charcoal', 'race-charcoalyellow', 'street', 'race', 'invalid']) {
      localStorage.setItem(RIDER_OUTFIT_KEY, stored);
      for (const requested of [...RIDER_PRESETS.map(p => p.id), 'street', 'race', 'street-bluewhite', 'race-mustard', 'invalid', '']) {
        const search = `?outfit=${requested}`;
        const expected = loadRiderOutfit(requested).startsWith('race-') ? 'race' : 'street';
        expect(selectedBootTotals(totals, search).heroModels).toBe(totals.heroModels[expected]);
        expect(localStorage.getItem(RIDER_OUTFIT_KEY)).toBe(stored);
      }
    }
  });
  it('uses exactly the main entry preference rules for inline and fallback plans', async () => {
    for (const [stored, search, expected] of [
      [null, '', 'street-mustard'], ['race-bluewhite', '', 'race-bluewhite'], ['race-bluewhite', '?outfit=street', 'street-mustard'],
      ['street-mustard', '?outfit=race', 'race-bluewhite'], ['race-bluewhite', '?outfit=invalid', 'race-bluewhite'], ['invalid', '', 'street-mustard'],
    ] as const) {
      localStorage.clear();
      if (stored) localStorage.setItem(RIDER_OUTFIT_KEY, stored);
      history.replaceState(null, '', '/' + search);
      expect(loadRiderOutfit(new URLSearchParams(search).get('outfit'))).toBe(expected);
      const inlineTotals = selectedBootTotals(totals, search);
      expect(inlineTotals.heroModels).toBe(totals.heroModels[expected.startsWith('race-') ? 'race' : 'street']);
      const fallback = await takeBootPlan();
      expect(fallback.view.bytesTotal).toBe(inlineTotals.heroModels + inlineTotals.bootArt);
    }
  });

  it('adopts an existing inline plan instead of resolving its outfit a second time', async () => {
    const original = await takeBootPlan();
    (window as BootWindow).__boot = { take: vi.fn(async () => original) };
    saveRiderOutfit('race-bluewhite');
    expect(await takeBootPlan()).toBe(original);
    expect(original.view.bytesTotal).toBe(totals.heroModels.street + totals.bootArt);
  });
});
