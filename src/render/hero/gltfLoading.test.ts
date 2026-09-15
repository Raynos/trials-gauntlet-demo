import { describe, expect, it, vi } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadGltf } from './gltf';

const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class { setMeshoptDecoder() { return this; } load = load; },
}));
vi.mock('./lod', () => ({ prepareHero: async () => undefined }));

describe('model download retries', () => {
  it('shares an in-flight request, evicts a failure, and retains a successful document', async () => {
    let fail!: (error: Error) => void;
    load.mockImplementationOnce((_url, _success, _progress, onError) => { fail = onError; });
    const first = loadGltf('models/rider-race.glb', true);
    expect(loadGltf('models/rider-race.glb', true)).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);
    fail(new Error('offline'));
    expect(await first).toBeNull();
    const document = { scene: { traverse: () => undefined } } as unknown as GLTF;
    load.mockImplementationOnce((_url, onSuccess) => { onSuccess(document); });
    const retry = loadGltf('models/rider-race.glb', true);
    expect(retry).not.toBe(first);
    expect(await retry).toBe(document);
    expect(loadGltf('models/rider-race.glb', true)).toBe(retry);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
