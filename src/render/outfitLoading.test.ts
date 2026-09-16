import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ThreeRenderer } from './index';
import { loadGltf } from './hero/gltf';
import { GltfRider } from './hero/gltfRider';
import type { RiderOutfit } from '../core/types';
import * as THREE from 'three';
import { prepareHero } from './hero/lod';

vi.mock('./hero/gltf', async (original) => ({
  ...await original<Record<string, unknown>>(), loadGltf: vi.fn(),
}));
afterEach(() => vi.restoreAllMocks());

function fixture() {
  // Exercise the production asynchronous loader without allocating a WebGL context.
  const street = {} as GLTF, streetLod = {} as GLTF;
  const fields = {
    models: { bikeModel: 'gltf', riderModel: 'gltf' },
    riderOutfit: 'street-mustard', riderDocumentOutfit: 'street-mustard',
    gltf: { bike: {} as GLTF, bikeLod: {} as GLTF, rider: street, riderLod: streetLod },
    heroLoading: 0, heroPending: Promise.resolve(), applyModels: vi.fn(), validateRiderPreset: vi.fn(),
  };
  const renderer = Object.assign(Object.create(ThreeRenderer.prototype) as object, fields) as unknown as ThreeRenderer;
  const state = renderer as unknown as typeof fields;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  return { renderer, state, street, streetLod };
}

async function materialDocument(names = ['rider_rookie', 'rider_pro']): Promise<GLTF> {
  const scene = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  mesh.name = 'garment';
  mesh.userData = { gltfExtensions: { KHR_materials_variants: { mappings: names.map((_, i) => ({ material: i, variants: [i] })) } } };
  scene.add(mesh);
  const materials = names.map(name => Object.assign(new THREE.MeshStandardMaterial(), { name }));
  const doc = { scene, animations: [], userData: { gltfExtensions: { KHR_materials_variants: { variants: names.map(name => ({ name })) } } }, parser: { getDependency: async (_: string, i: number) => materials[i] } } as unknown as GLTF;
  await prepareHero(doc);
  return doc;
}

describe('outfit documents are installed before selection succeeds', () => {
  it('validates exact document variants and rebuilds either detail with the installed palette while another is pending', async () => {
    const { renderer } = fixture();
    delete (renderer as unknown as { validateRiderPreset?: unknown }).validateRiderPreset;
    const api = renderer as unknown as { validateRiderPreset(doc: GLTF, outfit: RiderOutfit): void; makeRider(choice: 'gltf'): GltfRider };
    const incomplete = await materialDocument(['rider_rookie', 'bike_pro']);
    expect(() => api.validateRiderPreset(incomplete, 'street-charcoal')).toThrow('lacks rider_pro');
    const full = await materialDocument(), lod = await materialDocument();
    for (const doc of [full, lod]) {
      expect(() => api.validateRiderPreset(doc, 'street-charcoal')).not.toThrow();
      Object.assign(renderer, { riderDoc: () => doc, lib: { complete() {} }, riderOutfit: 'race-bluewhite', riderDocumentOutfit: 'street-charcoal' });
      const rider = api.makeRider('gltf');
      const frame = new THREE.Group();
      rider.attach({ frame } as Parameters<GltfRider['attach']>[0]);
      expect(((frame.getObjectByName('garment') as THREE.Mesh).material as THREE.Material).name).toBe('rider_pro');
      rider.dispose();
    }
  });
  it('commits a palette sibling without fetching another document', async () => {
    const { renderer, state, street } = fixture();
    vi.mocked(loadGltf).mockClear();
    expect(await renderer.setRiderOutfit('street-charcoal')).toBe(true);
    expect(loadGltf).not.toHaveBeenCalled();
    expect(state.gltf.rider).toBe(street);
    expect(state.riderDocumentOutfit).toBe('street-charcoal');
    expect(state.validateRiderPreset).toHaveBeenCalledTimes(2);
    expect(state.applyModels).toHaveBeenCalledOnce();
    expect(await renderer.setRiderOutfit('street-openface' as RiderOutfit)).toBe(false);
    expect(state.riderDocumentOutfit).toBe('street-charcoal');
  });

  it('keeps both installed documents and identity when a requested variant is missing', async () => {
    const { renderer, state, street, streetLod } = fixture();
    state.validateRiderPreset.mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw new Error('missing LOD variant'); });
    expect(await renderer.setRiderOutfit('street-charcoal')).toBe(false);
    expect(state.gltf.rider).toBe(street);
    expect(state.gltf.riderLod).toBe(streetLod);
    expect(state.riderDocumentOutfit).toBe('street-mustard');
    expect(state.applyModels).not.toHaveBeenCalled();
  });

  it('does not report an install when live rider construction fails', async () => {
    const { renderer, state, street } = fixture();
    vi.mocked(loadGltf).mockResolvedValue({} as GLTF);
    state.applyModels.mockImplementation(() => { throw new Error('invalid rig'); });
    expect(await renderer.setRiderOutfit('race-bluewhite')).toBe(false);
    expect(state.gltf.rider).toBe(street);
    expect(state.riderDocumentOutfit).toBe('street-mustard');
  });

  it('synchronizes the palette on a reused live rider and ignores bike-class changes', () => {
    const { renderer, state, street } = fixture();
    const live = Object.assign(Object.create(GltfRider.prototype) as object, { source: street, setMaterialVariant: vi.fn() });
    const bike = { setLivery: vi.fn() };
    const fields = { rider: live, bike, riderRef: live, bikeRef: bike, riderDoc: () => street, bikeDoc: () => null, kindOfBike: () => 'gltf', kindOfRider: () => 'gltf' };
    Object.assign(renderer, fields);
    // Remove fixture stub to exercise actual production palette synchronization.
    delete (renderer as unknown as { applyModels?: unknown }).applyModels;
    state.riderDocumentOutfit = 'street-charcoal';
    (renderer as unknown as { applyModels(): void }).applyModels();
    expect((live as { setMaterialVariant: ReturnType<typeof vi.fn> }).setMaterialVariant).toHaveBeenLastCalledWith('rider_pro');
    renderer.setBikeClass('pro');
    renderer.setBikeClass('rookie');
    expect((live as { setMaterialVariant: ReturnType<typeof vi.fn> }).setMaterialVariant).toHaveBeenCalledTimes(1);
    expect(bike.setLivery).toHaveBeenLastCalledWith('rookie');
  });
  it('retains both previous documents when either detail level fails and retries', async () => {
    const { renderer, state, street, streetLod } = fixture();
    const race = {} as GLTF, raceLod = {} as GLTF;
    vi.mocked(loadGltf).mockImplementation(async (url) => url.endsWith('-lod.glb') ? null : race);
    expect(await renderer.setRiderOutfit('race-bluewhite')).toBe(false);
    expect(state.gltf.rider).toBe(street);
    expect(state.gltf.riderLod).toBe(streetLod);
    expect(state.riderDocumentOutfit).toBe('street-mustard');
    expect(state.riderOutfit).toBe('street-mustard');
    expect(state.applyModels).not.toHaveBeenCalled();
    vi.mocked(loadGltf).mockImplementation(async (url) => url.endsWith('-lod.glb') ? raceLod : race);
    expect(await renderer.setRiderOutfit('race-bluewhite')).toBe(true);
    expect(state.gltf.rider).toBe(race);
    expect(state.gltf.riderLod).toBe(raceLod);
    expect(state.riderDocumentOutfit).toBe('race-bluewhite');
    expect(state.applyModels).toHaveBeenCalledTimes(1);
  });

  it('a late superseded download cannot replace the current documents or selection', async () => {
    const { renderer, state, street } = fixture();
    const resolve: ((g: GLTF) => void)[] = [];
    vi.mocked(loadGltf).mockImplementation(() => new Promise((done) => { resolve.push(done); }));
    const raceRequest = renderer.setRiderOutfit('race-bluewhite');
    expect(resolve).toHaveLength(2);
    expect(await renderer.setRiderOutfit('street-mustard')).toBe(true);
    for (const done of resolve) done({} as GLTF);
    expect(await raceRequest).toBe(false);
    expect(state.riderOutfit).toBe('street-mustard');
    expect(state.riderDocumentOutfit).toBe('street-mustard');
    expect(state.gltf.rider).toBe(street);
    expect(state.heroLoading).toBe(0);
  });

  it('waits for a superseding model request for the same outfit', async () => {
    const { renderer, state } = fixture();
    const resolve: ((g: GLTF) => void)[] = [];
    vi.mocked(loadGltf).mockImplementation(() => new Promise((done) => { resolve.push(done); }));
    const outfitRequest = renderer.setRiderOutfit('race-bluewhite');
    renderer.setModels({ bikeModel: 'gltf', riderModel: 'gltf' });
    expect(resolve).toHaveLength(4);
    resolve[0]!({} as GLTF); resolve[1]!({} as GLTF);
    resolve[2]!({} as GLTF); resolve[3]!({} as GLTF);
    expect(await outfitRequest).toBe(true);
    expect(state.riderDocumentOutfit).toBe('race-bluewhite');
    expect(state.heroLoading).toBe(0);
  });
});
