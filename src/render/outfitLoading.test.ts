import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ThreeRenderer } from './index';
import { loadGltf } from './hero/gltf';

vi.mock('./hero/gltf', async (original) => ({
  ...await original<Record<string, unknown>>(), loadGltf: vi.fn(),
}));
afterEach(() => vi.restoreAllMocks());

function fixture() {
  // Exercise the production asynchronous loader without allocating a WebGL context.
  const street = {} as GLTF, streetLod = {} as GLTF;
  const fields = {
    models: { bikeModel: 'gltf', riderModel: 'gltf' },
    riderOutfit: 'street', riderDocumentOutfit: 'street',
    gltf: { bike: {} as GLTF, bikeLod: {} as GLTF, rider: street, riderLod: streetLod },
    heroLoading: 0, heroPending: Promise.resolve(), applyModels: vi.fn(),
  };
  const renderer = Object.assign(Object.create(ThreeRenderer.prototype) as object, fields) as unknown as ThreeRenderer;
  const state = renderer as unknown as typeof fields;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  return { renderer, state, street, streetLod };
}

describe('outfit documents are installed before selection succeeds', () => {
  it('retains both previous documents when either detail level fails and retries', async () => {
    const { renderer, state, street, streetLod } = fixture();
    const race = {} as GLTF, raceLod = {} as GLTF;
    vi.mocked(loadGltf).mockImplementation(async (url) => url.endsWith('-lod.glb') ? null : race);
    expect(await renderer.setRiderOutfit('race')).toBe(false);
    expect(state.gltf.rider).toBe(street);
    expect(state.gltf.riderLod).toBe(streetLod);
    expect(state.riderDocumentOutfit).toBe('street');
    expect(state.riderOutfit).toBe('street');
    expect(state.applyModels).not.toHaveBeenCalled();
    vi.mocked(loadGltf).mockImplementation(async (url) => url.endsWith('-lod.glb') ? raceLod : race);
    expect(await renderer.setRiderOutfit('race')).toBe(true);
    expect(state.gltf.rider).toBe(race);
    expect(state.gltf.riderLod).toBe(raceLod);
    expect(state.riderDocumentOutfit).toBe('race');
    expect(state.applyModels).toHaveBeenCalledTimes(1);
  });

  it('a late superseded download cannot replace the current documents or selection', async () => {
    const { renderer, state, street } = fixture();
    const resolve: ((g: GLTF) => void)[] = [];
    vi.mocked(loadGltf).mockImplementation(() => new Promise((done) => { resolve.push(done); }));
    const raceRequest = renderer.setRiderOutfit('race');
    expect(resolve).toHaveLength(2);
    expect(await renderer.setRiderOutfit('street')).toBe(true);
    for (const done of resolve) done({} as GLTF);
    expect(await raceRequest).toBe(false);
    expect(state.riderOutfit).toBe('street');
    expect(state.riderDocumentOutfit).toBe('street');
    expect(state.gltf.rider).toBe(street);
    expect(state.heroLoading).toBe(0);
  });

  it('waits for a superseding model request for the same outfit', async () => {
    const { renderer, state } = fixture();
    const resolve: ((g: GLTF) => void)[] = [];
    vi.mocked(loadGltf).mockImplementation(() => new Promise((done) => { resolve.push(done); }));
    const outfitRequest = renderer.setRiderOutfit('race');
    renderer.setModels({ bikeModel: 'gltf', riderModel: 'gltf' });
    expect(resolve).toHaveLength(4);
    resolve[0]!({} as GLTF); resolve[1]!({} as GLTF);
    resolve[2]!({} as GLTF); resolve[3]!({} as GLTF);
    expect(await outfitRequest).toBe(true);
    expect(state.riderDocumentOutfit).toBe('race');
    expect(state.heroLoading).toBe(0);
  });
});
