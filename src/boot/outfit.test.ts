// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectedBootTotals } from './outfit';
import { takeBootPlan, type BootWindow } from './handoff';
import { RIDER_OUTFIT_KEY, loadRiderOutfit, saveRiderOutfit } from '../ui/outfit';
import { loadBikeChoice, loadHeldTier, loadQualityOverride } from '../ui/best';
import { RIDER_PRESETS } from '../core/riderPresets';
import { firstHeroDetail, isPhone, startTier } from '../game/startTier';
import { heroTotal } from './heroTotal';
import type { DeclaredBootTotals } from './asset-totals';

const BIKE_CLASS_KEY = 'trials.bikeClass'; // src/ui/best.ts `saveBikeChoice`
const QUALITY_KEY = 'trials.quality'; // src/ui/best.ts `saveQualityOverride`
const HELD_KEY = 'trials.heldTier'; // src/ui/best.ts `saveHeldTier`

// Every rider and bike total distinct per detail, so the wrong outfit, class or detail is observable.
const totals: DeclaredBootTotals = {
  riders: { 'street-mustard': [20, 70], 'street-charcoal': [21, 72], 'street-openface': [25, 105], 'race-bluewhite': [26, 90], 'race-charcoalyellow': [27, 92] },
  bikes: { rookie: [30, 100], pro: [35, 110] },
  bootArt: 40,
};
vi.mock('./totals', () => ({ DECLARED_BOOT_TOTALS: {
  riders: { 'street-mustard': [20, 70], 'street-charcoal': [21, 72], 'street-openface': [25, 105], 'race-bluewhite': [26, 90], 'race-charcoalyellow': [27, 92] },
  bikes: { rookie: [30, 100], pro: [35, 110] },
  bootArt: 40,
} }));
beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '/'); });
afterEach(() => { delete (window as BootWindow).__boot; history.replaceState(null, '', '/'); });

/** What main.ts hands the renderer, through the shared readers and the shared rule. */
function runtimeTotal(requested: string): number {
  const phone = isPhone();
  return heroTotal(totals, loadRiderOutfit(requested), loadBikeChoice() ?? 'rookie', firstHeroDetail(startTier(loadQualityOverride(), loadHeldTier(), phone), phone));
}

describe('outfit-, class- and tier-dependent boot totals', () => {
  it('matches runtime for every catalog design, legacy alias and invalid outfit, on both saved classes', () => {
    for (const cls of ['rookie', 'pro', 'invalid', null] as const) {
      localStorage.clear();
      if (cls) localStorage.setItem(BIKE_CLASS_KEY, cls);
      for (const stored of ['street-openface', 'street-charcoal', 'race-charcoalyellow', 'street', 'race', 'invalid']) {
        localStorage.setItem(RIDER_OUTFIT_KEY, stored);
        for (const requested of [...RIDER_PRESETS.map(p => p.id), 'street', 'race', 'street-bluewhite', 'race-mustard', 'invalid', '']) {
          expect(selectedBootTotals(totals, `?outfit=${requested}`).heroModels).toBe(runtimeTotal(requested));
          expect(localStorage.getItem(RIDER_OUTFIT_KEY)).toBe(stored);
        }
      }
    }
  });

  it('declares the pair the first tier draws: the authored files on desktop-high, the LOD twins on every other start (jsdom is a desktop)', () => {
    expect(isPhone()).toBe(false);
    for (const [quality, held, detail] of [
      [null, null, 'full'], ['high', null, 'full'], ['medium', null, 'lod'], ['low', 'high', 'lod'], ['auto', 'medium', 'lod'], ['auto', 'high', 'full'], ['garbage', 'low', 'lod'], [null, 'medium', 'lod'],
    ] as const) {
      localStorage.clear();
      if (quality) localStorage.setItem(QUALITY_KEY, quality);
      if (held) localStorage.setItem(HELD_KEY, held);
      const expected = heroTotal(totals, 'street-mustard', 'rookie', detail);
      expect(selectedBootTotals(totals, '').heroModels, `${quality} / ${held}`).toBe(expected);
      expect(runtimeTotal('')).toBe(expected);
    }
    // A phone: the same rule, the LOD pair even on a held or overridden `high`.
    for (const [quality, held] of [[null, null], ['high', null], ['auto', 'high'], ['medium', null]] as const) {
      expect(firstHeroDetail(startTier(quality, held, true), true)).toBe('lod');
    }
    expect(firstHeroDetail(startTier('high', null, false), false)).toBe('full');
    expect(firstHeroDetail(startTier('auto', 'high', false), false)).toBe('full');
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
        localStorage.setItem(QUALITY_KEY, 'medium');
        history.replaceState(null, '', '/' + search);
        expect(loadRiderOutfit(new URLSearchParams(search).get('outfit'))).toBe(expected);
        const inlineTotals = selectedBootTotals(totals, search);
        expect(inlineTotals.heroModels).toBe(totals.riders[expected][0] + totals.bikes[cls][0]);
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
    expect(original.view.bytesTotal).toBe(totals.riders['street-mustard'][1] + totals.bikes.rookie[1] + totals.bootArt); // jsdom: desktop, no override → high → authored
  });
});
