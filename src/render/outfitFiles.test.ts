/**
 * Ask 43: the LIVE hero family is Astra's — one file per outfit, one per bike class, no palette tables. An outfit
 * swap fetches that outfit's own full + LOD documents (siblings share nothing), nothing is validated against a
 * variant table, no material variant is ever selected, and a failed sibling keeps the installed outfit.
 * The legacy palette paths are `outfitLoading.test.ts`; the bike class swap is `bikeLivery.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { ThreeRenderer } from './index';
import { loadGltf } from './hero/gltf';
import { GltfRider } from './hero/gltfRider';
import { AVAILABLE_RIDER_PRESETS } from '../core/riderPresets';
import { heroHasVariants, lodUrl, riderPalette, riderUrl } from './hero/urls';

vi.mock('./hero/gltf', async (original) => ({ ...await original<Record<string, unknown>>(), loadGltf: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

function fixture() {
  const mustard = {} as GLTF, mustardLod = {} as GLTF;
  const fields = {
    models: { bikeModel: 'gltf', riderModel: 'gltf' },
    riderOutfit: 'street-mustard', riderDocumentOutfit: 'street-mustard', bikeClass: 'rookie', bikeDocumentClass: 'rookie',
    gltf: { bike: {} as GLTF, bikeLod: {} as GLTF, rider: mustard, riderLod: mustardLod },
    heroLoading: 0, heroPending: Promise.resolve(), applyModels: vi.fn(),
  };
  const renderer = Object.assign(Object.create(ThreeRenderer.prototype) as object, fields) as unknown as ThreeRenderer;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  return { renderer, state: renderer as unknown as typeof fields, mustard, mustardLod };
}

describe('per-outfit rider files (live family)', () => {
  it('is the live table: every outfit its own file, no palette', () => {
    expect(heroHasVariants()).toBe(false);
    for (const p of AVAILABLE_RIDER_PRESETS) {
      expect(riderUrl(p.id)).toBe(`models/rider-${p.id}.glb`);
      expect(riderPalette(p.id)).toBeNull();
    }
  });

  it('fetches a sibling outfit\'s own documents and installs them without palette validation or a variant select', async () => {
    const { renderer, state } = fixture();
    const charcoal = {} as GLTF, charcoalLod = {} as GLTF;
    vi.mocked(loadGltf).mockImplementation(async (url) => url === riderUrl('street-charcoal') ? charcoal : url === lodUrl(riderUrl('street-charcoal')) ? charcoalLod : null);
    const validate = vi.spyOn(renderer as unknown as { validateRiderPreset(doc: GLTF, outfit: string): void }, 'validateRiderPreset');
    expect(await renderer.setRiderOutfit('street-charcoal')).toBe(true);
    expect(vi.mocked(loadGltf).mock.calls.map(([url]) => url)).toEqual(['models/rider-street-charcoal.glb', 'models/rider-street-charcoal-lod.glb']);
    expect(state.gltf.rider).toBe(charcoal);
    expect(state.gltf.riderLod).toBe(charcoalLod);
    expect(state.riderDocumentOutfit).toBe('street-charcoal');
    expect(validate).not.toHaveBeenCalled();
    expect(state.applyModels).toHaveBeenCalledOnce();
  });

  it('keeps the installed outfit when a sibling\'s LOD fails, then installs on retry', async () => {
    const { renderer, state, mustard, mustardLod } = fixture();
    const race = {} as GLTF, raceLod = {} as GLTF;
    vi.mocked(loadGltf).mockImplementation(async (url) => url.endsWith('-lod.glb') ? null : race);
    expect(await renderer.setRiderOutfit('race-bluewhite')).toBe(false);
    expect(state.gltf.rider).toBe(mustard);
    expect(state.gltf.riderLod).toBe(mustardLod);
    expect(state.riderDocumentOutfit).toBe('street-mustard');
    expect(state.riderOutfit).toBe('street-mustard');
    vi.mocked(loadGltf).mockImplementation(async (url) => url.endsWith('-lod.glb') ? raceLod : race);
    expect(await renderer.setRiderOutfit('race-bluewhite')).toBe(true);
    expect(state.gltf.rider).toBe(race);
    expect(state.riderDocumentOutfit).toBe('race-bluewhite');
  });

  it('builds the live rider without touching a material variant, and applyModels never selects one', () => {
    const { renderer, state } = fixture();
    const scene = new THREE.Group();
    const doc = { scene, animations: [] } as unknown as GLTF;
    Object.assign(renderer, { riderDoc: () => doc, lib: { complete() {} } });
    const rider = (renderer as unknown as { makeRider(choice: 'gltf'): GltfRider }).makeRider('gltf');
    expect(rider).toBeInstanceOf(GltfRider);
    expect(rider.hasMaterialVariants).toBe(false);
    const live = Object.assign(Object.create(GltfRider.prototype) as object, { source: state.gltf.rider, setMaterialVariant: vi.fn() });
    const bike = { setLivery: vi.fn() };
    Object.assign(renderer, { rider: live, bike, riderRef: live, bikeRef: bike, riderDoc: () => state.gltf.rider, bikeDoc: () => null, kindOfBike: () => 'gltf', kindOfRider: () => 'gltf' });
    delete (renderer as unknown as { applyModels?: unknown }).applyModels;
    (renderer as unknown as { applyModels(): void }).applyModels();
    expect((live as { setMaterialVariant: ReturnType<typeof vi.fn> }).setMaterialVariant).not.toHaveBeenCalled();
  });
});
