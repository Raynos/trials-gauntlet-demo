/**
 * Ask 43: under a per-livery hero family (`ASTRA_HERO` in hero/urls.ts) the bike class is a document swap through
 * `setModels`, on the outfit swap's no-flash path: the installed bike stays until the other file has parsed, a
 * superseded class never installs, a failed file keeps the installed livery, and the same URL loads nothing.
 * Round 4: only the pair the tier draws is awaited (desktop-high → the authored file); its LOD twin is prefetched
 * into the HTTP cache after `ready` and parsed off the track (the menu / a finish) or when a tier asks for it.
 * 
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ThreeRenderer } from './index';
import { loadGltf, prefetchModel } from './hero/gltf';

vi.mock('./hero/gltf', async (original) => ({ ...await original<Record<string, unknown>>(), loadGltf: vi.fn(), prefetchModel: vi.fn(async (_url: string, bytes?: { add(n: number): void }) => { bytes?.add(1000); }) }));
vi.mock('./hero/urls', async (original) => ({
  ...await original<Record<string, unknown>>(),
  bikeUrl: (cls: 'rookie' | 'pro') => `models/bike-${cls}.glb`,
  riderUrl: () => 'models/rider-street-mustard.glb',
  modelAssetBytes: () => 1000,
}));
afterEach(() => vi.restoreAllMocks());

function fixture(tier: 'high' | 'medium' = 'high', phase: 'riding' | 'menu' = 'riding') {
  vi.mocked(prefetchModel).mockClear();
  const rookie = { name: 'rookie' } as unknown as GLTF, rookieLod = { name: 'rookie-lod' } as unknown as GLTF;
  const bike = { setLivery: vi.fn() };
  const twin = vi.fn();
  const fields = {
    models: { bikeModel: 'gltf', riderModel: 'gltf' }, tier, deviceClass: 'desktop', stageOn: false, disposed: false, phase, twinPending: null,
    riderOutfit: 'street-mustard', riderDocumentOutfit: 'street-mustard', bikeClass: 'rookie', bikeDocumentClass: 'rookie',
    gltf: { bike: rookie, bikeLod: rookieLod, rider: {} as GLTF, riderLod: {} as GLTF },
    heroLoading: 0, heroPending: Promise.resolve(), applyModels: vi.fn(), invalidate: vi.fn(), bikeRef: bike, riderRef: {},
    whenReady: () => Promise.resolve(), onHeroTwin: twin,
  };
  const renderer = Object.assign(Object.create(ThreeRenderer.prototype) as object, fields) as unknown as ThreeRenderer;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  return { renderer, state: renderer as unknown as typeof fields, rookie, rookieLod, bike, twin };
}

const settle = async (renderer: ThreeRenderer): Promise<void> => {
  const r = renderer as unknown as { heroPending: Promise<void> };
  let pending: Promise<void>;
  do { pending = r.heroPending; await pending; } while (pending !== r.heroPending);
  for (let i = 0; i < 8; i++) await Promise.resolve(); // the twin's microtasks
};

describe('per-livery bike files', () => {
  it('swaps the drawn document on a class change, then prefetches its twin after ready; a repeat loads nothing', async () => {
    const { renderer, state, bike, rookie, twin } = fixture();
    const pro = { name: 'pro' } as unknown as GLTF;
    vi.mocked(loadGltf).mockImplementation(async (url) => url === 'models/bike-pro.glb' ? pro : null);
    renderer.setBikeClass('pro');
    expect(bike.setLivery).toHaveBeenLastCalledWith('pro');
    expect(state.gltf.bike).toBe(rookie); // still up while the pro file parses
    await settle(renderer);
    expect(vi.mocked(loadGltf).mock.calls.map(([url]) => url)).toEqual(['models/bike-pro.glb']);
    expect(vi.mocked(prefetchModel).mock.calls.map(([url]) => url)).toEqual(['models/bike-pro-lod.glb']); // cached, not parsed
    expect(state.gltf.bike).toBe(pro);
    expect(state.gltf.bikeLod).toBeNull(); // riding: the cached twin waits
    expect(state.bikeDocumentClass).toBe('pro');
    expect(state.applyModels).toHaveBeenCalledTimes(1);
    expect(twin).toHaveBeenLastCalledWith(1000, 1000);
    vi.mocked(loadGltf).mockClear();
    renderer.setBikeClass('pro');
    await settle(renderer);
    expect(loadGltf).not.toHaveBeenCalled();
    // Off the track the twin parses (from the cache) and lands beside the drawn document; nothing to swap on desktop-high.
    const proLod = { name: 'pro-lod' } as unknown as GLTF;
    vi.mocked(loadGltf).mockImplementation(async (url) => url === 'models/bike-pro-lod.glb' ? proLod : null);
    Object.assign(renderer, { rig: { setPhase() {} } });
    renderer.setRunInfo({ runTime: 0, phase: 'finished' });
    await settle(renderer);
    expect(vi.mocked(loadGltf).mock.calls.map(([url, quiet]) => [url, quiet])).toEqual([['models/bike-pro-lod.glb', true]]);
    expect(state.gltf.bikeLod).toBe(proLod);
    expect(state.applyModels).toHaveBeenCalledTimes(2);
  });

  it('a fresh renderer counts as off the track: boot → menu parses the twin before any run; a ride never parses it mid-run', async () => {
    // Boot → menu: the menu covers the canvas and `setRunInfo` has never been called — `index.ts` seeds `phase = 'menu'`.
    const { renderer, state } = fixture('medium', 'menu');
    const pro = { name: 'pro' } as unknown as GLTF, proLod = { name: 'pro-lod' } as unknown as GLTF;
    vi.mocked(loadGltf).mockImplementation(async (url) => url === 'models/bike-pro.glb' ? pro : url === 'models/bike-pro-lod.glb' ? proLod : null);
    renderer.setBikeClass('pro');
    await settle(renderer);
    expect(vi.mocked(loadGltf).mock.calls.map(([url]) => url)).toEqual(['models/bike-pro-lod.glb', 'models/bike-pro.glb']);
    expect(state.gltf.bike).toBe(pro);
    // Boot → ride: the twin is cached and waits for the finish.
    const ride = fixture('medium', 'riding');
    vi.mocked(loadGltf).mockClear();
    ride.renderer.setBikeClass('pro');
    await settle(ride.renderer);
    expect(vi.mocked(loadGltf).mock.calls.map(([url]) => url)).toEqual(['models/bike-pro-lod.glb']);
    expect(ride.state.gltf.bike).toBeNull();
    expect(ride.state.twinPending).not.toBeNull();
  });

  it('on the menu the prefetched twin parses at once', async () => {
    const { renderer, state } = fixture('high', 'menu');
    const pro = { name: 'pro' } as unknown as GLTF, proLod = { name: 'pro-lod' } as unknown as GLTF;
    vi.mocked(loadGltf).mockImplementation(async (url) => url === 'models/bike-pro.glb' ? pro : url === 'models/bike-pro-lod.glb' ? proLod : null);
    renderer.setBikeClass('pro');
    await settle(renderer);
    expect(vi.mocked(loadGltf).mock.calls.map(([url]) => url)).toEqual(['models/bike-pro.glb', 'models/bike-pro-lod.glb']);
    expect(state.gltf.bike).toBe(pro);
    expect(state.gltf.bikeLod).toBe(proLod);
  });

  it('on a phone tier the LOD file is the one awaited and the authored file the prefetched twin; a tier step-up then parses it as a hero load', async () => {
    const { renderer, state } = fixture('medium');
    const pro = { name: 'pro' } as unknown as GLTF, proLod = { name: 'pro-lod' } as unknown as GLTF;
    vi.mocked(loadGltf).mockImplementation(async (url) => url === 'models/bike-pro.glb' ? pro : url === 'models/bike-pro-lod.glb' ? proLod : null);
    renderer.setBikeClass('pro');
    await settle(renderer);
    expect(vi.mocked(loadGltf).mock.calls.map(([url]) => url)).toEqual(['models/bike-pro-lod.glb']);
    expect(vi.mocked(prefetchModel).mock.calls.map(([url]) => url)).toEqual(['models/bike-pro.glb']);
    expect(state.gltf.bikeLod).toBe(proLod);
    expect(state.gltf.bike).toBeNull(); // riding: cached, not parsed
    // desktop-high asks for the authored bike: fetched (from the cache) and parsed now, awaited through heroPending.
    state.tier = 'high';
    (renderer as unknown as { ensureHeroDetail(): void }).ensureHeroDetail();
    expect(state.heroLoading).toBe(1);
    await settle(renderer);
    expect(vi.mocked(loadGltf).mock.calls.map(([url]) => url)).toEqual(['models/bike-pro-lod.glb', 'models/bike-pro.glb']);
    expect(state.gltf.bike).toBe(pro);
  });

  it('keeps the installed livery when the other file fails, and retries on the next request', async () => {
    const { renderer, state, rookie, rookieLod } = fixture();
    vi.mocked(loadGltf).mockResolvedValue(null);
    renderer.setBikeClass('pro');
    await settle(renderer);
    expect(state.gltf.bike).toBe(rookie);
    expect(state.gltf.bikeLod).toBe(rookieLod);
    expect(state.bikeDocumentClass).toBe('rookie');
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
    expect(release).toHaveLength(1); // only the drawn file was requested; the twin never was
    for (const resolve of release) resolve(pro);
    await settle(renderer);
    expect(state.gltf.bike).toBe(rookie);
    expect(state.bikeDocumentClass).toBe('rookie');
  });
});
