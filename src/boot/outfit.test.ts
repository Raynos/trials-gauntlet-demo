// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectedBootTotals } from './outfit';
import { takeBootPlan, type BootWindow } from './handoff';
import { RIDER_OUTFIT_KEY, loadRiderOutfit, saveRiderOutfit } from '../ui/outfit';

vi.mock('./totals', () => ({ DECLARED_BOOT_TOTALS: { heroModels: { street: 220, race: 245 }, bootArt: 40 } }));
const totals = { heroModels: { street: 220, race: 245 }, bootArt: 40 };
beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '/'); });
afterEach(() => { delete (window as BootWindow).__boot; history.replaceState(null, '', '/'); });

describe('outfit-dependent boot totals', () => {
  it('uses exactly the main entry preference rules for inline and fallback plans', async () => {
    for (const [stored, search, expected] of [
      [null, '', 'street'], ['race', '', 'race'], ['race', '?outfit=street', 'street'],
      ['street', '?outfit=race', 'race'], ['race', '?outfit=invalid', 'race'], ['invalid', '', 'street'],
    ] as const) {
      localStorage.clear();
      if (stored) localStorage.setItem(RIDER_OUTFIT_KEY, stored);
      history.replaceState(null, '', '/' + search);
      expect(loadRiderOutfit(new URLSearchParams(search).get('outfit'))).toBe(expected);
      const inlineTotals = selectedBootTotals(totals, search);
      expect(inlineTotals.heroModels).toBe(totals.heroModels[expected]);
      const fallback = await takeBootPlan();
      expect(fallback.view.bytesTotal).toBe(inlineTotals.heroModels + inlineTotals.bootArt);
    }
  });

  it('adopts an existing inline plan instead of resolving its outfit a second time', async () => {
    const original = await takeBootPlan();
    (window as BootWindow).__boot = { take: vi.fn(async () => original) };
    saveRiderOutfit('race');
    expect(await takeBootPlan()).toBe(original);
    expect(original.view.bytesTotal).toBe(totals.heroModels.street + totals.bootArt);
  });
});
