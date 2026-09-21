import { browserStorage, installStorage } from './storage';

export const SAVE_SLOTS = ['trials-save-a.json', 'trials-save-b.json'] as const;
const TEMP_FILE = 'trials-save-pending.json';
const SAVE_VERSION = 1;
const SETTINGS = new Set([
  'trials.quality', 'trials.fps', 'trials.heldTier', 'trials.bikeClass', 'trials.telemetry',
  'trials.onboarded', 'trials.ghost', 'trials.riderModel', 'trials.bikeModel', 'trials.sound',
  'trials.volume', 'trials.riderOutfit', 'trials.lastTrack', 'trials.runlog', 'trials.benchlog',
]);

/** Opt-in game data only. Review passwords, queued screenshots, notes, and unknown keys stay out. */
export function isSaveKey(key: string): boolean {
  return SETTINGS.has(key) || key.startsWith('trials.best.') || key.startsWith('trials.lastrun.') || key.startsWith('trials.nativeUpdates.');
}

export interface SaveFiles {
  /** Null means confirmed missing; permission / I/O errors must reject. */
  read(path: string): Promise<string | null>;
  write(path: string, text: string): Promise<void>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

interface Snapshot { version: 1; generation: number; entries: Record<string, string>; checksum: string }

/** Corruption detector, not encryption or an authenticity signature. */
function checksum(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}

function payload(generation: number, entries: Record<string, string>): string {
  return JSON.stringify({ version: SAVE_VERSION, generation, entries });
}

export class SaveVersionError extends Error {
  constructor() { super('This save needs a newer app version. Existing save files were preserved.'); }
}

function decode(raw: string | null): Snapshot | null {
  if (raw === null) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const s = value as Partial<Snapshot>;
  if ('version' in s && s.version !== SAVE_VERSION) throw new SaveVersionError();
  if (s.version !== SAVE_VERSION || !Number.isSafeInteger(s.generation) || s.generation! < 1 || !s.entries || typeof s.entries !== 'object' || Array.isArray(s.entries)) return null;
  if (!Object.entries(s.entries).every(([key, val]) => isSaveKey(key) && typeof val === 'string')) return null;
  if (checksum(payload(s.generation!, s.entries)) !== s.checksum) return null;
  return s as Snapshot;
}

function mirrorEntries(mirror: Storage | null): Map<string, string> {
  const entries = new Map<string, string>();
  if (!mirror) return entries;
  // A failed enumeration must not be mistaken for an empty first-launch save.
  for (let i = 0; i < mirror.length; i++) {
    const key = mirror.key(i);
    if (key && isSaveKey(key)) {
      const value = mirror.getItem(key);
      if (value !== null) entries.set(key, value);
    }
  }
  return entries;
}

/**
 * Synchronous game map + best-effort WebView mirror. Only complete filesystem snapshots are
 * committed. The latest slot is never removed while replacing the older slot, so a killed
 * write/rename leaves the previous committed generation available on the next launch.
 */
export class NativeSaveStorage implements Storage {
  private entries = new Map<string, string>();
  private generation = 0;
  private currentSlot = -1;
  private dirty = false;
  private pending: Promise<void> | null = null;
  private failed = false;
  private readonly statusListeners = new Set<(failed: boolean) => void>();
  restoredMirror = false;

  private constructor(private readonly files: SaveFiles, private readonly mirror: Storage | null) {}

  static async open(files: SaveFiles, mirror: Storage | null): Promise<NativeSaveStorage> {
    const storage = new NativeSaveStorage(files, mirror);
    const raw = await Promise.all(SAVE_SLOTS.map((path) => files.read(path)));
    // Decode both before choosing: downgrading must never overwrite an unknown newer format.
    const snapshots = raw.map(decode);
    for (let i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i];
      if (snapshot && snapshot.generation > storage.generation) {
        storage.generation = snapshot.generation;
        storage.currentSlot = i;
        storage.entries = new Map(Object.entries(snapshot.entries));
      }
    }
    if (storage.currentSlot < 0) {
      if (raw.some((value) => value !== null)) throw new Error('Save files could not be read safely. Existing files were preserved.');
      storage.entries = mirrorEntries(mirror);
      storage.dirty = true;
      await storage.flush(); // import a first-launch WebView mirror exactly once
    } else {
      storage.restoreMirror();
    }
    return storage;
  }

  private restoreMirror(): void {
    if (!this.mirror) return;
    try {
      const existing = mirrorEntries(this.mirror);
      for (const key of existing.keys()) if (!this.entries.has(key)) {
        this.mirror.removeItem(key);
        this.restoredMirror = true;
      }
      for (const [key, value] of this.entries) if (existing.get(key) !== value) {
        this.mirror.setItem(key, value);
        this.restoredMirror = true;
      }
    } catch {
      // Native map remains authoritative if the WebView quota is full or storage is unavailable.
    }
  }

  get saveFailed(): boolean { return this.failed; }
  subscribeSaveStatus(listener: (failed: boolean) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.failed);
    return () => { this.statusListeners.delete(listener); };
  }

  private setFailed(failed: boolean): void {
    if (this.failed === failed) return;
    this.failed = failed;
    for (const listener of this.statusListeners) {
      // A presentation error must never interrupt committing or preserving a save.
      try { listener(failed); } catch (error) { console.warn('[trials] save status listener failed', error); }
    }
  }
  get length(): number { return this.keys().length; }
  key(index: number): string | null { return this.keys()[index] ?? null; }

  private keys(): string[] {
    const keys = new Set(this.entries.keys());
    try {
      if (this.mirror) for (let i = 0; i < this.mirror.length; i++) {
        const key = this.mirror.key(i);
        if (key && !isSaveKey(key)) keys.add(key);
      }
    } catch { /* native save keys remain available */ }
    return [...keys];
  }

  getItem(key: string): string | null {
    if (isSaveKey(key)) return this.entries.get(key) ?? null;
    return this.mirror?.getItem(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (!isSaveKey(key)) { this.mirror?.setItem(key, value); return; }
    value = String(value);
    if (this.entries.get(key) === value) return;
    this.entries.set(key, value);
    try { this.mirror?.setItem(key, value); } catch { /* the native save does not depend on WebView quota */ }
    this.changed();
  }

  removeItem(key: string): void {
    if (!isSaveKey(key)) { this.mirror?.removeItem(key); return; }
    const removed = this.entries.delete(key);
    try { this.mirror?.removeItem(key); } catch { /* mirror is best effort */ }
    if (removed) this.changed();
  }

  clear(): void {
    this.entries.clear();
    try { this.mirror?.clear(); } catch { /* mirror is best effort */ }
    this.changed();
  }

  private changed(): void {
    this.dirty = true;
    // The next mutation or explicit lifecycle flush retries an I/O failure; no rejected background promises.
    void this.flush().catch(() => undefined);
  }

  flush(): Promise<void> {
    if (this.pending) return this.pending;
    if (!this.dirty) return Promise.resolve();
    this.pending = Promise.resolve().then(async () => {
      while (this.dirty) {
        this.dirty = false;
        const generation = this.generation + 1;
        if (!Number.isSafeInteger(generation)) {
          this.dirty = true;
          this.setFailed(true);
          throw new Error('Save generation limit reached.');
        }
        const entries = Object.fromEntries([...this.entries].sort(([a], [b]) => a.localeCompare(b)));
        const next: Snapshot = { version: SAVE_VERSION, generation, entries, checksum: checksum(payload(generation, entries)) };
        const slot = this.currentSlot === 0 ? 1 : 0;
        try {
          await this.files.write(TEMP_FILE, JSON.stringify(next));
          // Validate the complete staged bytes before touching either committed slot.
          const staged = decode(await this.files.read(TEMP_FILE));
          if (!staged || staged.generation !== generation || staged.checksum !== next.checksum) throw new Error('Save verification failed.');
          await this.files.remove(SAVE_SLOTS[slot]); // only the older backup, never currentSlot
          await this.files.rename(TEMP_FILE, SAVE_SLOTS[slot]);
          this.currentSlot = slot;
          this.generation = generation;
        } catch (error) {
          this.dirty = true;
          this.setFailed(true);
          throw error;
        }
      }
      this.setFailed(false);
    }).finally(() => { this.pending = null; });
    return this.pending;
  }
}

/** Native-only dynamic module; plugin never enters the ordinary web build. */
export async function bootstrapNativeStorage(): Promise<{ restoredMirror: boolean; flush(): Promise<void>; storage: NativeSaveStorage }> {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const directory = Directory.Library;
  const missing = (error: unknown): boolean => typeof error === 'object' && error !== null && 'code' in error && error.code === 'OS-PLUG-FILE-0008';
  const files: SaveFiles = {
    async read(path) {
      try {
        const { data } = await Filesystem.readFile({ path, directory, encoding: Encoding.UTF8 });
        if (typeof data !== 'string') throw new Error('Unexpected save encoding.');
        return data;
      } catch (error) { if (missing(error)) return null; throw error; }
    },
    async write(path, data) { await Filesystem.writeFile({ path, directory, data, encoding: Encoding.UTF8 }); },
    async remove(path) {
      try { await Filesystem.deleteFile({ path, directory }); } catch (error) { if (!missing(error)) throw error; }
    },
    async rename(from, to) { await Filesystem.rename({ from, to, directory, toDirectory: directory }); },
  };
  const storage = await NativeSaveStorage.open(files, browserStorage());
  installStorage(storage);
  return { restoredMirror: storage.restoredMirror, flush: () => storage.flush(), storage };
}
