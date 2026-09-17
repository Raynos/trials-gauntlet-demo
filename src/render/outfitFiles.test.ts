/**
 * Ask 43: the LIVE hero family is Astra's — one file per outfit, one per bike class, no palette tables. An outfit
 * swap fetches that outfit's own document (siblings share nothing) and a failed sibling keeps the installed outfit.
 * The bike class swap is `bikeLivery.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ThreeRenderer } from './index';
import { loadGltf, prefetchModel } from './hero/gltf';
import { AVAILABLE_RIDER_PRESETS } from '../core/riderPresets';
import { lodUrl, riderUrl } from './hero/urls';

vi.mock('./hero/gltf', async (original) => ({ ...await original<Record<string, unknown>>(), loadGltf: vi.fn(), prefetchModel: vi.fn(async () => undefined) }));
afterEach(() => vi.restoreAllMocks());
const twinLanded = async (): Promise<void> => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function fixture() {
  const mustard = {} as GLTF, mustardLod = {} as GLTF;
  const fields = {
    models: { bikeModel: 'gltf', riderModel: 'gltf' },
    riderOutfit: 'street-mustard', riderDocumentOutfit: 'street-mustard', bikeClass: 'rookie', bikeDocumentClass: 'rookie',
    tier: 'medium', deviceClass: 'phone', stageOn: false, disposed: false, phase: 'riding', twinPending: null, whenReady: () => Promise.resolve(), riderRef: {}, bikeRef: {},
    gltf: { bike: {} as GLTF, bikeLod: {} as GLTF, rider: mustard, riderLod: mustardLod },
    heroLoading: 0, heroPending: Promise.resolve(), applyModels: vi.fn(),
  };
  const renderer = Object.assign(Object.create(ThreeRenderer.prototype) as object, fields) as unknown as ThreeRenderer;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  return { renderer, state: renderer as unknown as typeof fields, mustard, mustardLod };
}

describe('per-outfit rider files (live family)', () => {
  it('every outfit is its own file', () => {
    for (const p of AVAILABLE_RIDER_PRESETS) expect(riderUrl(p.id)).toBe(`models/rider-${p.id}.glb`);
  });

  it('on a phone fetches a sibling outfit\'s LOD file only, installs it, and prefetches the authored twin', async () => {
    const { renderer, state } = fixture();
    vi.mocked(prefetchModel).mockClear();
    const charcoalLod = {} as GLTF;
    vi.mocked(loadGltf).mockImplementation(async (url) => url === lodUrl(riderUrl('street-charcoal')) ? charcoalLod : null);
    expect(await renderer.setRiderOutfit('street-charcoal')).toBe(true);
    expect(vi.mocked(loadGltf).mock.calls.map(([url]) => url)).toEqual(['models/rider-street-charcoal-lod.glb']);
    expect(state.gltf.riderLod).toBe(charcoalLod);
    expect(state.gltf.rider).toBeNull();
    expect(state.riderDocumentOutfit).toBe('street-charcoal');
    await twinLanded();
    expect(vi.mocked(prefetchModel).mock.calls.map(([url]) => url)).toEqual(['models/rider-street-charcoal.glb']);
    expect(state.applyModels).toHaveBeenCalledTimes(1);
  });

  it('the garage on a phone asks for the authored rider: a missing twin is fetched as a hero load and awaited', async () => {
    const { renderer, state } = fixture();
    state.gltf.rider = null as unknown as GLTF; // the twin has not landed
    const mustardFull = {} as GLTF;
    vi.mocked(loadGltf).mockImplementation(async (url) => url === riderUrl('street-mustard') ? mustardFull : null);
    Object.assign(renderer, { applyGarageStage: vi.fn(), clearGarageStage: vi.fn(), invalidate: vi.fn() });
    renderer.setGarageStage(true);
    expect(state.heroLoading).toBe(1);
    await state.heroPending;
    expect(vi.mocked(loadGltf).mock.calls.map(([url]) => url)).toEqual(['models/rider-street-mustard.glb']);
    expect(state.gltf.rider).toBe(mustardFull);
  });

  it('keeps the installed outfit when a sibling\'s drawn file fails, then installs on retry', async () => {
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
    expect(state.gltf.riderLod).toBe(raceLod);
    expect(state.riderDocumentOutfit).toBe('race-bluewhite');
  });

});
