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
  it('level: the LOD pair on low only (ask 60), authored on medium / high; garage: authored rider AND bike on every tier', () => {
    expect(isRiderLodEnabled()).toBe(true);
    expect(lodChoice('low', 'rider', false)).toBe('lod');
    expect(lodChoice('low', 'bike', false)).toBe('lod');
    for (const tier of ['medium', 'high'] as const) {
      expect(lodChoice(tier, 'rider', false), `${tier} level (ask 60: authored)`).toBe('full');
      expect(lodChoice(tier, 'bike', false), `${tier} level bike (ask 60)`).toBe('full');
    }
    for (const tier of ['low', 'medium', 'high'] as const) {
      expect(lodChoice(tier, 'rider', true), `${tier} garage`).toBe('full');
      expect(lodChoice(tier, 'bike', true), `${tier} garage bike (ask 52)`).toBe('full');
    }
  });

  it('the override turns the low-tier rider authored again and never touches the bike', () => {
    setRiderLodEnabled(false);
    expect(lodChoice('low', 'rider', false)).toBe('full');
    expect(lodChoice('low', 'bike', false)).toBe('lod');
  });
});

describe('ThreeRenderer.riderDoc / bikeDoc', () => {
  function fixture(tier: 'low' | 'medium' | 'high', deviceClass: 'phone' | 'desktop') {
    const rider = { name: 'authored' } as unknown as GLTF, riderLod = { name: 'lod' } as unknown as GLTF;
    const bike = { name: 'bike' } as unknown as GLTF, bikeLod = { name: 'bike-lod' } as unknown as GLTF;
    const heroDocs = new Map<string, GLTF>([['models/rider-street-mustard.glb', rider], ['models/rider-street-mustard-lod.glb', riderLod], ['models/bike-rookie.glb', bike], ['models/bike-rookie-lod.glb', bikeLod]]);
    const fields = { tier, deviceClass, stageOn: false, disposed: false, heroDocs, riderOutfit: 'street-mustard', bikeClass: 'rookie', models: { bikeModel: 'proc', riderModel: 'proc' }, heroPool: new Map() };
    const renderer = Object.assign(Object.create(ThreeRenderer.prototype) as object, fields) as unknown as { stageOn: boolean; riderDoc(): GLTF | null; bikeDoc(): GLTF | null; setGarageStage(on: boolean): void };
    return { renderer, rider, riderLod, bike, bikeLod };
  }

  it.each([
    ['low', 'phone', 'lod'], ['medium', 'phone', 'authored'], ['high', 'phone', 'authored'],
    ['low', 'desktop', 'lod'], ['medium', 'desktop', 'authored'], ['high', 'desktop', 'authored'],
  ] as const)('%s on %s: level draws the %s pair and the garage the authored rider and bike', (tier, device, level) => {
    const { renderer, rider, riderLod, bike, bikeLod } = fixture(tier, device);
    expect(renderer.riderDoc()).toBe(level === 'lod' ? riderLod : rider);
    expect(renderer.bikeDoc()).toBe(level === 'lod' ? bikeLod : bike);
    renderer.stageOn = true;
    expect(renderer.riderDoc()).toBe(rider);
    expect(renderer.bikeDoc()).toBe(bike); // ask 52
  });

  it('setGarageStage swaps to the authored pair when the documents differ (phone), and not on desktop-high', () => {
    for (const [tier, device, swaps] of [['low', 'phone', true], ['high', 'desktop', false]] as const) {
      const { renderer, rider, riderLod, bike, bikeLod } = fixture(tier, device);
      const applyModels = vi.fn();
      const live = { source: renderer.riderDoc() };
      Object.assign(renderer, { bikeRef: {}, riderRef: live, applyModels, applyGarageStage: vi.fn(), clearGarageStage: vi.fn(), invalidate: vi.fn() });
      renderer.setGarageStage(true);
      expect(applyModels).toHaveBeenCalledTimes(1);
      // The swap is only real when the document differs — `applyModels` compares `source` to `riderDoc()` / `bikeDoc()`.
      expect(live.source !== renderer.riderDoc()).toBe(swaps);
      expect(renderer.riderDoc()).toBe(rider);
      expect(renderer.bikeDoc()).toBe(bike);
      renderer.setGarageStage(false);
      expect(renderer.riderDoc()).toBe(swaps ? riderLod : rider);
      expect(renderer.bikeDoc()).toBe(swaps ? bikeLod : bike);
    }
  });
});
