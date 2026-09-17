/**
 * Ask 43: under a per-livery hero family (`ASTRA_HERO` in hero/urls.ts) the bike class is a document swap through
 * `setModels`, on the outfit swap's no-flash path: the installed bike stays until the other file has parsed, a
 * superseded class never installs, a failed file keeps the installed livery, and the same URL loads nothing.
 * The legacy family (one bike file, class = variant) is the `outfitLoading.test.ts` "ignores bike-class changes" row.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ThreeRenderer } from './index';
import { loadGltf } from './hero/gltf';

vi.mock('./hero/gltf', async (original) => ({ ...await original<Record<string, unknown>>(), loadGltf: vi.fn() }));
vi.mock('./hero/urls', async (original) => ({
  ...await original<Record<string, unknown>>(),
  bikeUrl: (cls: 'rookie' | 'pro') => `models/bike-${cls}.glb`,
  riderUrl: () => 'models/rider-street-mustard.glb',
  riderPalette: () => null,
  heroHasVariants: () => false,
}));
afterEach(() => vi.restoreAllMocks());

function fixture() {
  const rookie = { name: 'rookie' } as unknown as GLTF, rookieLod = { name: 'rookie-lod' } as unknown as GLTF;
  const bike = { setLivery: vi.fn() };
  const fields = {
    models: { bikeModel: 'gltf', riderModel: 'gltf' },
    riderOutfit: 'street-mustard', riderDocumentOutfit: 'street-mustard', bikeClass: 'rookie', bikeDocumentClass: 'rookie',
    gltf: { bike: rookie, bikeLod: rookieLod, rider: {} as GLTF, riderLod: {} as GLTF },
    heroLoading: 0, heroPending: Promise.resolve(), applyModels: vi.fn(), validateRiderPreset: vi.fn(), invalidate: vi.fn(), bikeRef: bike,
  };
  const renderer = Object.assign(Object.create(ThreeRenderer.prototype) as object, fields) as unknown as ThreeRenderer;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  return { renderer, state: renderer as unknown as typeof fields, rookie, rookieLod, bike };
}

const settle = async (renderer: ThreeRenderer): Promise<void> => {
  const r = renderer as unknown as { heroPending: Promise<void> };
  let pending: Promise<void>;
  do { pending = r.heroPending; await pending; } while (pending !== r.heroPending);
};

describe('per-livery bike files', () => {
  it('swaps the document on a class change, once per file, and validates no rider palette', async () => {
    const { renderer, state, bike, rookie } = fixture();
    const pro = { name: 'pro' } as unknown as GLTF, proLod = { name: 'pro-lod' } as unknown as GLTF;
    vi.mocked(loadGltf).mockImplementation(async (url) => url === 'models/bike-pro.glb' ? pro : url === 'models/bike-pro-lod.glb' ? proLod : null);
    renderer.setBikeClass('pro');
    expect(bike.setLivery).toHaveBeenLastCalledWith('pro');
    expect(state.gltf.bike).toBe(rookie); // still up while the pro file parses
    await settle(renderer);
    expect(vi.mocked(loadGltf).mock.calls.map(([url]) => url)).toEqual(['models/bike-pro.glb', 'models/bike-pro-lod.glb']);
    expect(state.gltf.bike).toBe(pro);
    expect(state.gltf.bikeLod).toBe(proLod);
    expect(state.bikeDocumentClass).toBe('pro');
    expect(state.applyModels).toHaveBeenCalledOnce();
    expect(state.validateRiderPreset).not.toHaveBeenCalled();
    vi.mocked(loadGltf).mockClear();
    renderer.setBikeClass('pro');
    await settle(renderer);
    expect(loadGltf).not.toHaveBeenCalled();
    expect(state.applyModels).toHaveBeenCalledOnce();
  });

  it('keeps the installed livery when the other file fails, and retries on the next request', async () => {
    const { renderer, state, rookie, rookieLod } = fixture();
    vi.mocked(loadGltf).mockResolvedValue(null);
    renderer.setBikeClass('pro');
    await settle(renderer);
    expect(state.gltf.bike).toBe(rookie);
    expect(state.gltf.bikeLod).toBe(rookieLod);
    expect(state.bikeDocumentClass).toBe('rookie');
    expect(state.applyModels).toHaveBeenCalledOnce(); // the rider path still applies (nothing changed there)
    const pro = { name: 'pro' } as unknown as GLTF;
    vi.mocked(loadGltf).mockResolvedValue(pro);
    renderer.setBikeClass('pro');
    await settle(renderer);
    expect(state.gltf.bike).toBe(pro);
    expect(state.bikeDocumentClass).toBe('pro');
  });

  it('a class request superseded before its file parsed never installs', async () => {
    const { renderer, state, rookie } = fixture();
    const release: ((g: GLTF) => void)[] = [];
    const pro = { name: 'pro' } as unknown as GLTF;
    vi.mocked(loadGltf).mockImplementation((url) => url.startsWith('models/bike-pro') ? new Promise<GLTF | null>((resolve) => { release.push(resolve); }) : Promise.resolve(rookie));
    renderer.setBikeClass('pro');
    renderer.setBikeClass('rookie'); // same URL as the installed document: nothing to load, the pro request is stale
    expect(release).toHaveLength(2);
    for (const resolve of release) resolve(pro);
    await settle(renderer);
    expect(state.gltf.bike).toBe(rookie);
    expect(state.bikeDocumentClass).toBe('rookie');
  });
});
