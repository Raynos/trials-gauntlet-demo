import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createNativeUpdater, readUpdateConfig, updateStatusLine, verifyUpdate, type SignedUpdate, type UpdateAdapter, type UpdateBundle, type UpdateConfig, type UpdateHost, type UpdateManifest } from './updates';

const subtle = webcrypto.subtle as SubtleCrypto;
const host: UpdateHost = { platform: 'ios', nativeVersion: '0.3.2', runtime: 'native-v1', saveSchema: 1 };
const checksum = 'a'.repeat(64);
const manifest: UpdateManifest = { schema: 1, platform: 'ios', nativeMin: '0.3.0', nativeMax: '0.3.9', runtime: 'native-v1', saveSchema: 1, bundleId: '0.3.2-web.1', sequence: 1, expiresAt: '2099-01-01T00:00:00Z', url: `https://updates.example/releases/${checksum}.zip`, sha256: checksum };
let keys: CryptoKeyPair;
let config: UpdateConfig;
beforeAll(async () => {
  keys = await subtle.generateKey({ name: 'RSA-PSS', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  config = { manifestUrl: 'https://updates.example/ios/manifest.json', publicKey: await subtle.exportKey('jwk', keys.publicKey) };
});
async function signed(m: UpdateManifest = manifest): Promise<SignedUpdate> {
  const payload = Buffer.from(JSON.stringify(m));
  const signature = await subtle.sign({ name: 'RSA-PSS', saltLength: 32 }, keys.privateKey, payload);
  return { payload: payload.toString('base64url'), signature: Buffer.from(signature).toString('base64url') };
}
function memory() {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } };
}
function adapter() {
  const bundle: UpdateBundle = { id: 'download-123', version: manifest.bundleId, checksum, status: 'pending' };
  return {
    current: vi.fn(async () => ({ bundle: { id: 'builtin', version: '0.3.2', checksum: '', status: 'success' } })),
    list: vi.fn(async () => ({ bundles: [bundle] })),
    download: vi.fn(async (_options: Parameters<UpdateAdapter['download']>[0]) => bundle),
    delete: vi.fn(async (_options: { id: string }): Promise<void> => undefined),
    set: vi.fn(async () => undefined),
    notifyAppReady: vi.fn(async () => undefined),
  } satisfies UpdateAdapter;
}

describe('signed native release contract', () => {
  it('accepts a valid pinned signature and rejects payload tampering', async () => {
    const e = await signed();
    expect(await verifyUpdate(e, config, host, subtle)).toEqual(manifest);
    e.payload = Buffer.from(JSON.stringify({ ...manifest, sequence: 2 })).toString('base64url');
    await expect(verifyUpdate(e, config, host, subtle)).rejects.toThrow('signature');
  });
  it.each([
    { platform: 'android' }, { nativeMin: '0.4.0' }, { nativeMax: '0.3.1' }, { saveSchema: 2 }, { runtime: 'native-v2' },
    { expiresAt: '2000-01-01T00:00:00Z' }, { url: `https://evil.example/${checksum}.zip` }, { url: 'https://updates.example/latest.zip' },
    { sha256: '' }, { sequence: -1 },
  ])('rejects incompatible or unsafe manifest %j before download', async (change) => {
    await expect(verifyUpdate(await signed({ ...manifest, ...change } as UpdateManifest), config, host, subtle)).rejects.toThrow();
  });
  it('requires explicit public-only HTTPS configuration', () => {
    expect(readUpdateConfig(undefined, undefined)).toBeNull();
    expect(readUpdateConfig('http://updates.example', JSON.stringify(config.publicKey))).toBeNull();
    for (const field of ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth']) {
      expect(readUpdateConfig(config.manifestUrl, JSON.stringify({ ...config.publicKey, [field]: 'secret' }))).toBeNull();
    }
    expect(readUpdateConfig(config.manifestUrl, JSON.stringify(config.publicKey))).toEqual(config);
    expect(updateStatusLine(null)).toContain('disabled');
  });
});

describe('native bundle staging', () => {
  it('stages after readiness, verifies checksum through plugin, and activates only at next controller boot', async () => {
    const a = adapter(), storage = memory(), envelope = await signed();
    const fetcher = vi.fn(async () => new Response(JSON.stringify(envelope))) as unknown as typeof fetch;
    const options = { adapter: a, storage, host, config, subtle, fetcher };
    const first = createNativeUpdater(options);
    expect(await first.checkForUpdate()).toBe('none');
    expect(await first.activateStagedAtBoot()).toBe('none');
    await first.notifyReady();
    expect(await first.checkForUpdate()).toBe('staged');
    expect(a.download).toHaveBeenCalledWith({ url: manifest.url, version: manifest.bundleId, checksum });
    expect(a.set).not.toHaveBeenCalled();
    expect(await first.activateStagedAtBoot()).toBe('none');
    const second = createNativeUpdater(options);
    expect(await second.activateStagedAtBoot()).toBe('activated');
    expect(a.set).toHaveBeenCalledOnce();
    expect([...storage.data.keys()].some(k => k.endsWith('.pending'))).toBe(false);
    await second.notifyReady();
    expect(await second.checkForUpdate()).toBe('none');
    expect(a.download).toHaveBeenCalledOnce();
  });
  it('does not repeat a failed activation and preserves player saves', async () => {
    const a = adapter(), storage = memory(), envelope = await signed();
    storage.setItem('trials.best.b1', 'saved');
    const options = { adapter: a, storage, host, config, subtle, fetcher: vi.fn(async () => new Response(JSON.stringify(envelope))) as unknown as typeof fetch };
    const first = createNativeUpdater(options);
    await first.notifyReady();
    await first.checkForUpdate();
    a.set.mockRejectedValueOnce(new Error('bad bundle'));
    expect(await createNativeUpdater(options).activateStagedAtBoot()).toBe('rejected');
    expect(await createNativeUpdater(options).activateStagedAtBoot()).toBe('none');
    expect(storage.getItem('trials.best.b1')).toBe('saved');
  });
  it('rejects mismatched native download hash without staging', async () => {
    const a = adapter(), storage = memory();
    a.download.mockResolvedValueOnce({ id: 'wrong', version: manifest.bundleId, checksum: 'b'.repeat(64), status: 'pending' });
    const updater = createNativeUpdater({ adapter: a, storage, host, config, subtle, fetcher: vi.fn(async () => new Response(JSON.stringify(await signed()))) as unknown as typeof fetch });
    await updater.notifyReady();
    expect(await updater.checkForUpdate()).toBe('rejected');
    expect(storage.data.size).toBe(0);
  });
  it('flushes staging and consumes the pending marker durably before switching', async () => {
    const a = adapter(), storage = memory();
    const order: string[] = [];
    const durable = { ...storage, flush: vi.fn(async () => { order.push('flush'); }) };
    const options = { adapter: a, storage: durable, host, config, subtle, fetcher: vi.fn(async () => new Response(JSON.stringify(await signed()))) as unknown as typeof fetch };
    const first = createNativeUpdater(options);
    await first.notifyReady();
    expect(await first.checkForUpdate()).toBe('staged');
    expect(durable.flush).toHaveBeenCalled();
    order.length = 0;
    a.set.mockImplementationOnce(async () => { order.push('set'); });
    expect(await createNativeUpdater(options).activateStagedAtBoot()).toBe('activated');
    expect(order).toEqual(['flush', 'set']);
  });
  it('does not switch bundles when pending-marker consumption cannot be persisted', async () => {
    const a = adapter(), storage = memory();
    const durable = { ...storage, flush: vi.fn(async () => undefined) };
    const options = { adapter: a, storage: durable, host, config, subtle, fetcher: vi.fn(async () => new Response(JSON.stringify(await signed()))) as unknown as typeof fetch };
    const first = createNativeUpdater(options);
    await first.notifyReady();
    expect(await first.checkForUpdate()).toBe('staged');
    durable.flush.mockRejectedValueOnce(new Error('disk full'));
    expect(await createNativeUpdater(options).activateStagedAtBoot()).toBe('rejected');
    expect(a.set).not.toHaveBeenCalled();
  });
  it('does not report staged until native state is persisted', async () => {
    const a = adapter(), storage = memory();
    const durable = { ...storage, flush: vi.fn(async () => { throw new Error('disk full'); }) };
    const updater = createNativeUpdater({ adapter: a, storage: durable, host, config, subtle, fetcher: vi.fn(async () => new Response(JSON.stringify(await signed()))) as unknown as typeof fetch });
    await updater.notifyReady();
    expect(await updater.checkForUpdate()).toBe('unavailable');
    expect(a.set).not.toHaveBeenCalled();
  });
  it('keeps first launch offline and channel absence nonblocking while acknowledging readiness', async () => {
    const a = adapter(), storage = memory(), fetcher = vi.fn(async () => { throw new Error('offline'); });
    const options = { adapter: a, storage, host, config, subtle, fetcher: fetcher as unknown as typeof fetch };
    const offline = createNativeUpdater(options);
    expect(await offline.activateStagedAtBoot()).toBe('none');
    await offline.notifyReady();
    expect(await offline.checkForUpdate()).toBe('unavailable');
    const disabled = createNativeUpdater({ ...options, config: null });
    await disabled.notifyReady();
    expect(await disabled.checkForUpdate()).toBe('disabled');
    expect(a.notifyAppReady).toHaveBeenCalledTimes(2);
    expect(a.download).not.toHaveBeenCalled();
  });
});

/** A realistic mutable bundle catalog: deleting a bundle actually removes it from later lists. */
function catalog(initial: UpdateBundle[]) {
  const a = adapter();
  const bundles = [...initial];
  a.list.mockImplementation(async () => ({ bundles: [...bundles] }));
  a.delete.mockImplementation(async ({ id }) => {
    const index = bundles.findIndex((b) => b.id === id);
    if (index >= 0) bundles.splice(index, 1);
  });
  a.download.mockImplementation(async ({ version, checksum: hash }) => {
    const bundle = { id: `download-${bundles.length}`, version, checksum: hash, status: 'pending' };
    bundles.push(bundle);
    return bundle;
  });
  return { a, bundles };
}
function entry(id: string, status = 'pending', version = id): UpdateBundle {
  return { id, status, version, checksum };
}

describe('abandoned native bundle cleanup', () => {
  it('runs only after acknowledged readiness and keeps active, successful fallback, native error metadata and in-progress work', async () => {
    const { a, bundles } = catalog([
      entry('builtin'), entry('active'), entry('fallback', 'success'), entry('native-error', 'error'),
      entry('deleting', 'deleting'), entry('deleted', 'deleted'), entry('unknown', 'future-status'),
      entry('working', 'downloading'), entry('orphan'),
    ]);
    a.current.mockResolvedValue({ bundle: entry('active') });
    const updater = createNativeUpdater({ adapter: a, storage: memory(), host, config: null });
    expect((await updater.cleanupAbandoned()).skipped).toBe(true);
    a.notifyAppReady.mockRejectedValueOnce(new Error('not ready'));
    await expect(updater.notifyReady()).rejects.toThrow('not ready');
    expect((await updater.cleanupAbandoned()).skipped).toBe(true);
    await updater.notifyReady();
    expect(await updater.cleanupAbandoned()).toEqual({ deleted: ['orphan'], failed: [], skipped: false });
    expect(bundles.map(b => b.id)).toEqual(['builtin', 'active', 'fallback', 'native-error', 'deleting', 'deleted', 'unknown', 'working']);
  });

  it('preserves the durably staged release and cleans superseded pending bundles after staging a newer release', async () => {
    const old = entry('old', 'pending', 'older-game');
    const { a, bundles } = catalog([old]);
    const storage = memory();
    const pendingKey = 'trials.nativeUpdates.ios.0.3.2.native-v1.pending';
    const oldManifest = { ...manifest, bundleId: 'older-game', sequence: 1 };
    storage.setItem(pendingKey, JSON.stringify({ id: old.id, envelope: await signed(oldManifest) }));
    storage.setItem('trials.nativeUpdates.ios.0.3.2.native-v1.sequence', '1');
    const newer = await signed({ ...manifest, sequence: 2 });
    const updater = createNativeUpdater({ adapter: a, storage, host, config, subtle, fetcher: vi.fn(async () => new Response(JSON.stringify(newer))) as unknown as typeof fetch });
    await updater.notifyReady();
    expect((await updater.cleanupAbandoned()).deleted).toEqual([]);
    expect(await updater.checkForUpdate()).toBe('staged');
    expect(a.delete).toHaveBeenCalledWith({ id: 'old' });
    const pending = JSON.parse(storage.getItem(pendingKey)!);
    expect(bundles.map(b => b.id)).toEqual([pending.id]);
    expect(storage.getItem('trials.nativeUpdates.ios.0.3.2.native-v1.sequence')).toBe('2');
  });

  it('durably retires an expired pending pointer before deleting its files and retains sequence/rejection history', async () => {
    const { a } = catalog([entry('expired')]);
    const storage = memory();
    const prefix = 'trials.nativeUpdates.ios.0.3.2.native-v1';
    storage.setItem(`${prefix}.pending`, JSON.stringify({ id: 'expired', envelope: await signed({ ...manifest, expiresAt: '2000-01-01T00:00:00Z' }) }));
    storage.setItem(`${prefix}.sequence`, '7');
    storage.setItem('trials.best.b1', 'saved');
    const events: string[] = [];
    const durable = { ...storage, flush: vi.fn(async () => { events.push(storage.getItem(`${prefix}.pending`) ? 'flush-pending' : 'flush-consumed'); }) };
    a.delete.mockImplementation(async () => { events.push('delete'); });
    const updater = createNativeUpdater({ adapter: a, storage: durable, host, config, subtle });
    await updater.notifyReady();
    expect((await updater.cleanupAbandoned()).deleted).toEqual(['expired']);
    expect(events).toEqual(['flush-pending', 'flush-consumed', 'delete']);
    expect(storage.getItem(`${prefix}.sequence`)).toBe('7');
    expect(storage.getItem('trials.best.b1')).toBe('saved');
  });

  it('preserves staged files when durability fails and retries cleanup safely once storage recovers', async () => {
    const { a } = catalog([entry('orphan')]);
    const storage = { ...memory(), flush: vi.fn(async () => undefined) };
    storage.flush.mockRejectedValueOnce(new Error('disk full'));
    const updater = createNativeUpdater({ adapter: a, storage, host, config: null });
    await updater.notifyReady();
    expect((await updater.cleanupAbandoned()).skipped).toBe(true);
    expect(a.delete).not.toHaveBeenCalled();
    expect((await updater.cleanupAbandoned()).deleted).toEqual(['orphan']);
  });

  it('cleans a downloaded orphan on relaunch when its staged pointer never reached durable storage', async () => {
    const { a, bundles } = catalog([]);
    const failedStorage = { ...memory(), flush: vi.fn(async () => { throw new Error('disk full'); }) };
    const first = createNativeUpdater({ adapter: a, storage: failedStorage, host, config, subtle, fetcher: vi.fn(async () => new Response(JSON.stringify(await signed()))) as unknown as typeof fetch });
    await first.notifyReady();
    expect(await first.checkForUpdate()).toBe('unavailable');
    expect(bundles).toHaveLength(1);
    expect(a.delete).not.toHaveBeenCalled();
    // The failed flush left no committed marker. A cold launch hydrates the prior empty snapshot.
    const afterRestart = createNativeUpdater({ adapter: a, storage: memory(), host, config: null });
    await afterRestart.notifyReady();
    expect((await afterRestart.cleanupAbandoned()).deleted).toHaveLength(1);
    expect(bundles).toHaveLength(0);
  });

  it('does not delete an expired bundle unless removing its pointer is durable', async () => {
    const { a } = catalog([entry('expired')]);
    const storage = memory();
    const prefix = 'trials.nativeUpdates.ios.0.3.2.native-v1';
    storage.setItem(`${prefix}.pending`, JSON.stringify({ id: 'expired', envelope: await signed({ ...manifest, expiresAt: '2000-01-01T00:00:00Z' }) }));
    storage.setItem(`${prefix}.sequence`, '3');
    const durable = { ...storage, flush: vi.fn(async () => undefined) };
    durable.flush.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('disk full'));
    const updater = createNativeUpdater({ adapter: a, storage: durable, host, config, subtle });
    await updater.notifyReady();
    expect((await updater.cleanupAbandoned()).skipped).toBe(true);
    expect(a.delete).not.toHaveBeenCalled();
    expect(storage.getItem(`${prefix}.sequence`)).toBe('3');
  });

  it('leaves invalid unparseable bookkeeping intact instead of guessing which files are safe', async () => {
    const { a } = catalog([entry('maybe-pending')]);
    const storage = memory();
    storage.setItem('trials.nativeUpdates.ios.0.3.2.native-v1.pending', '{truncated');
    const updater = createNativeUpdater({ adapter: a, storage, host, config: null });
    await updater.notifyReady();
    expect((await updater.cleanupAbandoned()).skipped).toBe(true);
    expect(a.delete).not.toHaveBeenCalled();
  });

  it('tolerates native protection/disk failures, keeps metadata intact and caps deletion attempts per controller launch', async () => {
    const { a } = catalog(Array.from({ length: 12 }, (_, i) => entry(`orphan-${i}`)));
    a.delete.mockRejectedValueOnce(new Error('protected native next'));
    const storage = memory();
    storage.setItem('trials.nativeUpdates.ios.0.3.2.native-v1.sequence', '5');
    const updater = createNativeUpdater({ adapter: a, storage, host, config: null });
    await updater.notifyReady();
    const first = await updater.cleanupAbandoned();
    expect(first.failed).toEqual(['orphan-0']);
    expect(first.deleted).toHaveLength(7);
    await updater.cleanupAbandoned();
    expect(a.delete).toHaveBeenCalledTimes(8);
    expect(storage.getItem('trials.nativeUpdates.ios.0.3.2.native-v1.sequence')).toBe('5');
    const nextLaunch = createNativeUpdater({ adapter: a, storage, host, config: null });
    await nextLaunch.notifyReady();
    expect((await nextLaunch.cleanupAbandoned()).deleted).toHaveLength(5);
  });

  it('does not clean while a download is in flight and keeps another downloading copy of the same version', async () => {
    const { a } = catalog([entry('same-version-old', 'pending', 'busy'), entry('in-progress', 'downloading', 'busy')]);
    let release!: (bundle: UpdateBundle) => void;
    let started!: () => void;
    const downloading = new Promise<void>(resolve => { started = resolve; });
    a.download.mockImplementation(() => { started(); return new Promise(resolve => { release = resolve; }); });
    const storage = memory();
    const envelope = await signed();
    const updater = createNativeUpdater({ adapter: a, storage, host, config, subtle, fetcher: vi.fn(async () => new Response(JSON.stringify(envelope))) as unknown as typeof fetch });
    await updater.notifyReady();
    const checking = updater.checkForUpdate();
    await downloading;
    expect((await updater.cleanupAbandoned()).skipped).toBe(true);
    expect(a.delete).not.toHaveBeenCalled();
    release(entry('just-downloaded', 'pending', manifest.bundleId));
    expect(await checking).toBe('staged');
    expect(a.delete).not.toHaveBeenCalled();
  });

  it('skips a parallel download check while cleanup is active without cancelling either native operation', async () => {
    const { a } = catalog([entry('orphan')]);
    let release!: () => void;
    let started!: () => void;
    const deleting = new Promise<void>(resolve => { started = resolve; });
    a.delete.mockImplementation(() => { started(); return new Promise(resolve => { release = resolve; }); });
    const fetcher = vi.fn(async () => new Response('{}'));
    const updater = createNativeUpdater({ adapter: a, storage: memory(), host, config, subtle, fetcher: fetcher as unknown as typeof fetch });
    await updater.notifyReady();
    const cleaning = updater.cleanupAbandoned();
    await deleting;
    expect(await updater.checkForUpdate()).toBe('none');
    expect(fetcher).not.toHaveBeenCalled();
    release();
    expect((await cleaning).deleted).toEqual(['orphan']);
  });

  it('re-reads candidate status and protects a native transition to success', async () => {
    const { a } = catalog([entry('became-fallback')]);
    a.list.mockResolvedValueOnce({ bundles: [entry('became-fallback')] });
    a.list.mockResolvedValueOnce({ bundles: [entry('became-fallback', 'success')] });
    const updater = createNativeUpdater({ adapter: a, storage: memory(), host, config: null });
    await updater.notifyReady();
    expect((await updater.cleanupAbandoned()).deleted).toEqual([]);
    expect(a.delete).not.toHaveBeenCalled();
  });
});
