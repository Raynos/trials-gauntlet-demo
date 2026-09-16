// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBikeChoice, saveBikeChoice } from './best';
import { loadRiderOutfit, RIDER_OUTFIT_KEY, saveRiderOutfit } from './outfit';
import { AVAILABLE_RIDER_PRESETS, RIDER_PRESETS } from '../core/riderPresets';

beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('committed rider outfit', () => {
  it('migrates legacy names and excludes the unbuilt design from selection', () => {
    expect(RIDER_PRESETS).toHaveLength(5);
    expect(AVAILABLE_RIDER_PRESETS).toHaveLength(4);
    localStorage.setItem(RIDER_OUTFIT_KEY, 'race');
    expect(loadRiderOutfit()).toBe('race-bluewhite');
    expect(loadRiderOutfit('street')).toBe('street-mustard');
    expect(loadRiderOutfit('street-openface')).toBe('race-bluewhite');
    expect(localStorage.getItem(RIDER_OUTFIT_KEY)).toBe('race');
    for (const preset of AVAILABLE_RIDER_PRESETS) {
      saveRiderOutfit(preset.id);
      expect(loadRiderOutfit()).toBe(preset.id);
    }
  });
  it('defaults to street and rejects invalid saved values', () => {
    expect(loadRiderOutfit()).toBe('street-mustard');
    for (const invalid of ['pro', 'hoodie', 'RACE', '', '{"outfit":"race"}']) {
      localStorage.setItem(RIDER_OUTFIT_KEY, invalid);
      expect(loadRiderOutfit()).toBe('street-mustard');
    }
  });

  it('persists either outfit independently of bike class', () => {
    saveBikeChoice('pro');
    saveRiderOutfit('race-bluewhite');
    expect(loadRiderOutfit()).toBe('race-bluewhite');
    expect(loadBikeChoice()).toBe('pro');
    saveBikeChoice('rookie');
    expect(loadRiderOutfit()).toBe('race-bluewhite');
    saveRiderOutfit('street-mustard');
    expect(loadRiderOutfit()).toBe('street-mustard');
    expect(loadBikeChoice()).toBe('rookie');
  });

  it('resolves a valid page override without changing the committed preference', () => {
    saveRiderOutfit('race-bluewhite');
    expect(loadRiderOutfit('street-mustard')).toBe('street-mustard');
    expect(loadRiderOutfit()).toBe('race-bluewhite');
    expect(loadRiderOutfit('unknown')).toBe('race-bluewhite');
    expect(loadRiderOutfit(null)).toBe('race-bluewhite');
  });

  it('works when browser storage is absent or rejects access', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage full'); });
    expect(loadRiderOutfit()).toBe('street-mustard');
    expect(loadRiderOutfit('race-bluewhite')).toBe('race-bluewhite');
    expect(() => saveRiderOutfit('race-bluewhite')).not.toThrow();
    vi.stubGlobal('localStorage', undefined);
    expect(loadRiderOutfit()).toBe('street-mustard');
    expect(() => saveRiderOutfit('street-mustard')).not.toThrow();
  });
});
