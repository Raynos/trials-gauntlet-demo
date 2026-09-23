// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectedBootTotals } from './outfit';
import { takeBootPlan, type BootWindow } from './handoff';
import { RIDER_OUTFIT_KEY, saveRiderOutfit } from '../ui/outfit';

const pack = { '1x': 7400, '2x': 8000 };
const totals = { heroModels: 821, bootArt: 40, offlinePack: pack };
vi.mock('./totals', () => ({ DECLARED_BOOT_TOTALS: { heroModels: 821, bootArt: 40, offlinePack: { '1x': 7400, '2x': 8000 } } }));
beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '/'); });
afterEach(() => { delete (window as BootWindow).__boot; history.replaceState(null, '', '/'); });

describe('boot totals (ask 50: every hero file in the one bar)', () => {
  it('are the same number whatever the saved outfit, class or tier, or the URL', async () => {
    for (const [outfit, cls, quality, search] of [
      [null, null, null, ''], ['race-bluewhite', 'pro', 'high', '?outfit=street'], ['street-charcoal', 'rookie', 'low', '?outfit=race-charcoalyellow'], ['invalid', 'invalid', 'garbage', '?outfit=invalid'],
    ] as const) {
      localStorage.clear();
      if (outfit) localStorage.setItem(RIDER_OUTFIT_KEY, outfit);
      if (cls) localStorage.setItem('rockhop.bikeClass', cls);
      if (quality) localStorage.setItem('rockhop.quality', quality);
      history.replaceState(null, '', '/' + search);
      expect(selectedBootTotals(totals)).toEqual({ heroModels: 821, bootArt: 40, offlinePack: 7400 }); // jsdom is DPR 1 / 1024 px wide → the 1x tier
      const fallback = await takeBootPlan();
      expect(fallback.view.bytesTotal).toBe(821 + 40 + 7400);
    }
  });

  it('adopts an existing inline plan instead of resolving a second time', async () => {
    const original = await takeBootPlan();
    (window as BootWindow).__boot = { take: vi.fn(async () => original) };
    saveRiderOutfit('race-bluewhite');
    expect(await takeBootPlan()).toBe(original);
    expect(original.view.bytesTotal).toBe(totals.heroModels + totals.bootArt + pack['1x']);
  });
});
