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
    download: vi.fn(async () => bundle),
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
    expect(readUpdateConfig(config.manifestUrl, JSON.stringify({ ...config.publicKey, d: 'secret' }))).toBeNull();
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
    expect(durable.flush).toHaveBeenCalledOnce();
    a.set.mockImplementationOnce(async () => { order.push('set'); });
    expect(await createNativeUpdater(options).activateStagedAtBoot()).toBe('activated');
    expect(order).toEqual(['flush', 'flush', 'set']);
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
