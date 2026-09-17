/**
 * Ask 43 round 2: the rider's document per tier and place. In level, low / medium / phone-high (which asks as
 * `medium`) ride the LOD rider; the garage stage shows the authored rider on every tier; desktop-high is authored
 * everywhere. The bike LOD follows the tier alone. `setRiderLodEnabled(false)` is the escape hatch.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { isRiderLodEnabled, lodChoice, setRiderLodEnabled } from './lod';
import { ThreeRenderer } from '../index';

afterEach(() => setRiderLodEnabled(true));

describe('lodChoice', () => {
  it('is on by default: level low / medium → LOD rider, garage → authored on every tier, desktop-high → authored', () => {
    expect(isRiderLodEnabled()).toBe(true);
    for (const tier of ['low', 'medium'] as const) {
      expect(lodChoice(tier, 'rider', false), `${tier} level`).toBe('lod');
      expect(lodChoice(tier, 'rider', true), `${tier} garage`).toBe('full');
      expect(lodChoice(tier, 'bike', false)).toBe('lod');
      expect(lodChoice(tier, 'bike', true)).toBe('lod');
    }
    expect(lodChoice('high', 'rider', false)).toBe('full');
    expect(lodChoice('high', 'rider', true)).toBe('full');
    expect(lodChoice('high', 'bike')).toBe('full');
  });

  it('the override turns the level rider authored again and never touches the bike', () => {
    setRiderLodEnabled(false);
    for (const tier of ['low', 'medium'] as const) {
      expect(lodChoice(tier, 'rider', false)).toBe('full');
      expect(lodChoice(tier, 'bike', false)).toBe('lod');
    }
  });
});

describe('ThreeRenderer.riderDoc', () => {
  function fixture(tier: 'low' | 'medium' | 'high', deviceClass: 'phone' | 'desktop') {
    const rider = { name: 'authored' } as unknown as GLTF, riderLod = { name: 'lod' } as unknown as GLTF;
    const fields = { tier, deviceClass, stageOn: false, disposed: false, gltf: { bike: null, bikeLod: null, rider, riderLod }, models: { bikeModel: 'proc', riderModel: 'proc' } };
    const renderer = Object.assign(Object.create(ThreeRenderer.prototype) as object, fields) as unknown as { stageOn: boolean; riderDoc(): GLTF | null; setGarageStage(on: boolean): void };
    return { renderer, rider, riderLod };
  }

  it.each([
    ['low', 'phone', 'lod'], ['medium', 'phone', 'lod'], ['high', 'phone', 'lod'],
    ['low', 'desktop', 'lod'], ['medium', 'desktop', 'lod'], ['high', 'desktop', 'authored'],
  ] as const)('%s on %s: level draws the %s rider and the garage the authored one', (tier, device, level) => {
    const { renderer, rider, riderLod } = fixture(tier, device);
    expect(renderer.riderDoc()).toBe(level === 'lod' ? riderLod : rider);
    renderer.stageOn = true;
    expect(renderer.riderDoc()).toBe(rider);
  });

  it('setGarageStage rebuilds the hero when the document flips (phone), and not on desktop-high', () => {
    for (const [tier, device, rebuilds] of [['medium', 'phone', true], ['high', 'desktop', false]] as const) {
      const { renderer, rider, riderLod } = fixture(tier, device);
      const applyModels = vi.fn();
      const live = { source: renderer.riderDoc() };
      Object.assign(renderer, { bikeRef: {}, riderRef: live, applyModels, applyGarageStage: vi.fn(), clearGarageStage: vi.fn(), invalidate: vi.fn() });
      renderer.setGarageStage(true);
      expect(applyModels).toHaveBeenCalledTimes(1);
      // The rebuild is only real when the document differs — `applyModels` compares `source` to `riderDoc()`.
      expect(live.source !== renderer.riderDoc()).toBe(rebuilds);
      expect(renderer.riderDoc()).toBe(rider);
      renderer.setGarageStage(false);
      expect(renderer.riderDoc()).toBe(rebuilds ? riderLod : rider);
    }
  });
});
