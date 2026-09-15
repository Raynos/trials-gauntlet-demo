// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBikeChoice, saveBikeChoice } from './best';
import { loadRiderOutfit, RIDER_OUTFIT_KEY, saveRiderOutfit } from './outfit';

beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('committed rider outfit', () => {
  it('defaults to street and rejects invalid saved values', () => {
    expect(loadRiderOutfit()).toBe('street');
    for (const invalid of ['pro', 'hoodie', 'RACE', '', '{"outfit":"race"}']) {
      localStorage.setItem(RIDER_OUTFIT_KEY, invalid);
      expect(loadRiderOutfit()).toBe('street');
    }
  });

  it('persists either outfit independently of bike class', () => {
    saveBikeChoice('pro');
    saveRiderOutfit('race');
    expect(loadRiderOutfit()).toBe('race');
    expect(loadBikeChoice()).toBe('pro');
    saveBikeChoice('rookie');
    expect(loadRiderOutfit()).toBe('race');
    saveRiderOutfit('street');
    expect(loadRiderOutfit()).toBe('street');
    expect(loadBikeChoice()).toBe('rookie');
  });

  it('resolves a valid page override without changing the committed preference', () => {
    saveRiderOutfit('race');
    expect(loadRiderOutfit('street')).toBe('street');
    expect(loadRiderOutfit()).toBe('race');
    expect(loadRiderOutfit('unknown')).toBe('race');
    expect(loadRiderOutfit(null)).toBe('race');
  });

  it('works when browser storage is absent or rejects access', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage full'); });
    expect(loadRiderOutfit()).toBe('street');
    expect(loadRiderOutfit('race')).toBe('race');
    expect(() => saveRiderOutfit('race')).not.toThrow();
    vi.stubGlobal('localStorage', undefined);
    expect(loadRiderOutfit()).toBe('street');
    expect(() => saveRiderOutfit('street')).not.toThrow();
  });
});
