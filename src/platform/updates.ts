/** Signed, self-hosted native updates. No vendor endpoint or credentials are used here. */
export interface UpdateManifest {
  schema: 1;
  platform: 'ios' | 'android';
  nativeMin: string;
  nativeMax: string;
  runtime: string;
  saveSchema: number;
  bundleId: string;
  sequence: number;
  expiresAt: string;
  url: string;
  sha256: string;
}

export interface SignedUpdate { payload: string; signature: string }
export interface UpdateConfig { manifestUrl: string; publicKey: JsonWebKey }
export interface UpdateBundle { id: string; version: string; checksum: string; status: string }
export interface UpdateAdapter {
  current(): Promise<{ bundle: UpdateBundle }>;
  list(): Promise<{ bundles: UpdateBundle[] }>;
  download(options: { url: string; version: string; checksum: string }): Promise<UpdateBundle>;
  delete(options: { id: string }): Promise<void>;
  set(options: { id: string }): Promise<void>;
  notifyAppReady(): Promise<unknown>;
}
export type UpdateStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { flush?(): Promise<void> };
export interface UpdateHost {
  platform: 'ios' | 'android';
  nativeVersion: string;
  runtime: string;
  saveSchema: number;
}
export interface UpdateOptions {
  adapter: UpdateAdapter;
  storage: UpdateStorage;
  host: UpdateHost;
  config: UpdateConfig | null;
  fetcher?: typeof fetch;
  subtle?: SubtleCrypto;
  now?: () => number;
}
export type UpdateResult = 'disabled' | 'none' | 'staged' | 'activated' | 'rejected' | 'unavailable';
export interface UpdateCleanupResult { deleted: string[]; failed: string[]; skipped: boolean }

/** Bound native filesystem work per launch; a later launch retries any remaining or failed cleanup. */
const CLEANUP_LIMIT = 8;

/** Public configuration only. Missing or malformed settings safely leave OTA disabled. */
export function readUpdateConfig(manifestUrl: string | undefined, publicJwk: string | undefined): UpdateConfig | null {
  if (!manifestUrl || !publicJwk) return null;
  try {
    const url = new URL(manifestUrl);
    const key: unknown = JSON.parse(publicJwk);
    if (url.protocol !== 'https:' || url.username || url.password || !key || typeof key !== 'object') return null;
    const jwk = key as JsonWebKey;
    if (jwk.kty !== 'RSA' || typeof jwk.n !== 'string' || !jwk.n || typeof jwk.e !== 'string' || !jwk.e || ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'].some((field) => field in jwk)) return null;
    return { manifestUrl: url.href, publicKey: jwk };
  } catch {
    return null;
  }
}

export function updateStatusLine(config: UpdateConfig | null): string {
  return config ? 'Game updates download automatically and apply on next launch' : 'Game updates disabled · update channel is not configured';
}

function decodeBase64Url(value: unknown): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 32_768) throw new Error('Invalid signed update');
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function versionParts(value: unknown): number[] {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) throw new Error('Invalid native version');
  const parts = value.split('.').map(Number);
  if (parts.some((p) => !Number.isSafeInteger(p))) throw new Error('Invalid native version');
  return parts;
}

function compareVersions(a: unknown, b: unknown): number {
  const aa = versionParts(a), bb = versionParts(b);
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i]! < bb[i]! ? -1 : 1;
  return 0;
}

/** Verify the exact signed bytes before trusting any URL, native bounds, or save contract. */
export async function verifyUpdate(envelope: SignedUpdate, config: UpdateConfig, host: UpdateHost, subtle: SubtleCrypto, now = Date.now()): Promise<UpdateManifest> {
  const payload = decodeBase64Url(envelope.payload);
  const signature = decodeBase64Url(envelope.signature);
  const key = await subtle.importKey('jwk', config.publicKey, { name: 'RSA-PSS', hash: 'SHA-256' }, false, ['verify']);
  if (!await subtle.verify({ name: 'RSA-PSS', saltLength: 32 }, key, signature, payload)) throw new Error('Invalid update signature');
  const m = JSON.parse(new TextDecoder().decode(payload)) as Partial<UpdateManifest>;
  if (m.schema !== 1 || m.platform !== host.platform || m.runtime !== host.runtime || m.saveSchema !== host.saveSchema) throw new Error('Incompatible update');
  if (compareVersions(m.nativeMin, m.nativeMax) > 0 || compareVersions(host.nativeVersion, m.nativeMin) < 0 || compareVersions(host.nativeVersion, m.nativeMax) > 0) throw new Error('Native version outside update bounds');
  if (!Number.isSafeInteger(m.sequence) || m.sequence! < 1 || !Number.isSafeInteger(m.saveSchema) || m.saveSchema! < 1) throw new Error('Invalid update sequence or save schema');
  if (typeof m.bundleId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,99}$/.test(m.bundleId) || m.bundleId === 'builtin') throw new Error('Invalid bundle ID');
  if (typeof m.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(m.sha256)) throw new Error('Invalid bundle hash');
  if (typeof m.expiresAt !== 'string' || !Number.isFinite(Date.parse(m.expiresAt)) || Date.parse(m.expiresAt) <= now) throw new Error('Expired update');
  if (typeof m.url !== 'string') throw new Error('Missing bundle URL');
  const url = new URL(m.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.origin !== new URL(config.manifestUrl).origin || !url.pathname.endsWith(`/${m.sha256}.zip`) || url.search || url.hash) throw new Error('Invalid immutable bundle URL');
  return m as UpdateManifest;
}

interface PendingUpdate { envelope: SignedUpdate; id: string }

/**
 * Construct once per launch. Call activateStagedAtBoot before game initialization, notifyReady only
 * after assets/menu are ready, then checkForUpdate without blocking play. Never calls next(): that
 * API can activate on backgrounding and discard an in-progress ride.
 */
export function createNativeUpdater(options: UpdateOptions) {
  const { adapter, storage, host, config } = options;
  const namespace = `trials.nativeUpdates.${host.platform}.${host.nativeVersion}.${host.runtime}`;
  const pendingKey = `${namespace}.pending`;
  const sequenceKey = `${namespace}.sequence`;
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const verify = (e: SignedUpdate) => verifyUpdate(e, config!, host, options.subtle ?? crypto.subtle, now());
  let checking = false;
  let bootChecked = false;
  let ready = false;
  let cleanupAttempts = 0;

  /** Caller owns `checking`: cleanup must never race our download or pending-marker writes. */
  const cleanup = async (): Promise<UpdateCleanupResult> => {
    const result: UpdateCleanupResult = { deleted: [], failed: [], skipped: false };
    try {
      // If any prior save/marker write failed, retain all bundles until durable state catches up.
      await storage.flush?.();
      let pendingId: string | null = null;
      const raw = storage.getItem(pendingKey);
      if (raw) {
        const pending = JSON.parse(raw) as PendingUpdate;
        if (typeof pending.id !== 'string' || !pending.id) throw new Error('Invalid pending update');
        pendingId = pending.id;
        if (config) {
          try {
            await verify(pending.envelope);
          } catch {
            // An expired/incompatible/invalid signed release can no longer be activated. Retire its
            // pointer durably, but retain the high-water sequence so it is not downloaded repeatedly.
            storage.removeItem(pendingKey);
            await storage.flush?.();
            pendingId = null;
          }
        }
      }
      const { bundles } = await adapter.list();
      for (const candidate of bundles) {
        if (cleanupAttempts >= CLEANUP_LIMIT) break;
        // Keep every success: the plugin's private previous-fallback pointer has no public getter.
        // Error/deleting/deleted metadata belongs to native rollback cleanup; deleting it here would
        // erase rejection history. Unknown and downloading statuses are deliberately left alone.
        if (candidate.status !== 'pending' || !candidate.id || candidate.id === 'builtin' || candidate.id === pendingId) continue;
        const { bundle: current } = await adapter.current();
        if (candidate.id === current.id) continue;
        const latest = (await adapter.list()).bundles;
        const bundle = latest.find((b) => b.id === candidate.id);
        // Android delete cancels work by version, so preserve a pending copy if another copy of that
        // version is downloading. Re-read status just before deletion; downloads may finish natively.
        if (!bundle || bundle.status !== 'pending' || latest.some((b) => b.version === bundle.version && b.status === 'downloading')) continue;
        cleanupAttempts++;
        try {
          // Pinned native plugin also refuses current/builtin/next/preview-fallback deletion. A
          // refusal or disk error is best effort; never modify its metadata to force a deletion.
          await adapter.delete({ id: bundle.id });
          result.deleted.push(bundle.id);
        } catch {
          result.failed.push(bundle.id);
        }
      }
    } catch {
      result.skipped = true;
    }
    return result;
  };

  return {
    configured: config !== null,
    statusLine: updateStatusLine(config),
    async activateStagedAtBoot(): Promise<UpdateResult> {
      if (bootChecked || ready) return 'none';
      bootChecked = true;
      if (!config) return 'disabled';
      try {
        const raw = storage.getItem(pendingKey);
        if (!raw) return 'none';
        // Consume before set(): a crash, rollback, or failed switch must not retry this bundle forever.
        storage.removeItem(pendingKey);
        await storage.flush?.(); // durable consumption must precede the WebView reload
        const pending = JSON.parse(raw) as PendingUpdate;
        const manifest = await verify(pending.envelope);
        const { bundle: current } = await adapter.current();
        if (current.id === pending.id) return 'none';
        const { bundles } = await adapter.list();
        const bundle = bundles.find((b) => b.id === pending.id);
        if (!bundle || bundle.status === 'error' || bundle.version !== manifest.bundleId || bundle.checksum !== manifest.sha256) return 'rejected';
        await adapter.set({ id: bundle.id }); // reloads, only at this cold-start boundary
        return 'activated';
      } catch {
        return 'rejected';
      }
    },
    async notifyReady(): Promise<void> {
      // Required even without a configured channel: the native plugin owns its rollback watchdog.
      await adapter.notifyAppReady();
      ready = true;
    },
    /** Optional explicit sweep. Normal checkForUpdate also sweeps before/after its download. */
    async cleanupAbandoned(): Promise<UpdateCleanupResult> {
      if (!ready || checking) return { deleted: [], failed: [], skipped: true };
      checking = true;
      try { return await cleanup(); } finally { checking = false; }
    },
    async checkForUpdate(): Promise<UpdateResult> {
      if (!ready || checking) return config ? 'none' : 'disabled';
      checking = true;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await cleanup();
        if (!config) return 'disabled';
        timer = setTimeout(() => controller.abort(), 5000);
        const response = await fetcher(config.manifestUrl, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal });
        if (!response.ok) return 'unavailable';
        const text = await response.text();
        if (text.length > 32_768) return 'rejected';
        const envelope = JSON.parse(text) as SignedUpdate;
        let manifest: UpdateManifest;
        try { manifest = await verify(envelope); } catch { return 'rejected'; }
        const highest = Number(storage.getItem(sequenceKey) ?? '0');
        if (!Number.isSafeInteger(highest) || manifest.sequence <= highest) return 'none';
        const { bundle: current } = await adapter.current();
        if (current.version === manifest.bundleId) return 'none';
        const { bundles } = await adapter.list();
        if (bundles.some((b) => b.version === manifest.bundleId && b.status === 'error')) return 'rejected';
        const bundle = await adapter.download({ url: manifest.url, version: manifest.bundleId, checksum: manifest.sha256 });
        if (bundle.status === 'error' || bundle.version !== manifest.bundleId || bundle.checksum !== manifest.sha256) return 'rejected';
        storage.setItem(pendingKey, JSON.stringify({ envelope, id: bundle.id } satisfies PendingUpdate));
        storage.setItem(sequenceKey, String(manifest.sequence));
        await storage.flush?.();
        return 'staged';
      } catch {
        return 'unavailable';
      } finally {
        clearTimeout(timer);
        await cleanup();
        checking = false;
      }
    },
  };
}
