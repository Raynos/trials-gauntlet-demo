import { describe, expect, it } from 'vitest';
import { NativeSaveStorage, SAVE_SLOTS, SaveVersionError, type SaveFiles } from './native-storage';

class Mirror implements Storage {
  readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
  clear(): void { this.values.clear(); }
}

class Files implements SaveFiles {
  readonly values = new Map<string, string>();
  failWrite = false;
  failRename = false;
  writes = 0;
  activeWrites = 0;
  maxWrites = 0;
  async read(path: string): Promise<string | null> { return this.values.get(path) ?? null; }
  async write(path: string, text: string): Promise<void> {
    this.writes++;
    this.activeWrites++;
    this.maxWrites = Math.max(this.maxWrites, this.activeWrites);
    await Promise.resolve();
    this.activeWrites--;
    if (this.failWrite) throw new Error('disk full');
    this.values.set(path, text);
  }
  async remove(path: string): Promise<void> { this.values.delete(path); }
  async rename(from: string, to: string): Promise<void> {
    if (this.failRename) throw new Error('rename failed');
    const text = this.values.get(from);
    if (text === undefined) throw new Error('missing source');
    this.values.set(to, text);
    this.values.delete(from);
  }
}

const key = 'trials.best.b1-first-ride';

describe('native durable save snapshots', () => {
  it('creates a versioned empty first launch and imports only allowed game keys', async () => {
    const files = new Files();
    const mirror = new Mirror();
    mirror.setItem('trials.reviewPassword', 'private');
    mirror.setItem('trials.reviewQueue', '[screenshot]');
    mirror.setItem('trials.review.b1', 'private note');
    mirror.setItem('unrelated', 'private');
    mirror.setItem('trials.riderOutfit', 'race');
    const save = await NativeSaveStorage.open(files, mirror);
    expect(save.restoredMirror).toBe(false);
    expect(save.getItem('trials.riderOutfit')).toBe('race');
    expect(files.writes).toBe(1);
    const disk = files.values.get(SAVE_SLOTS[0])!;
    expect(JSON.parse(disk)).toMatchObject({ version: 1, generation: 1, entries: { 'trials.riderOutfit': 'race' } });
    expect(disk).not.toContain('private');
    save.setItem('trials.reviewPassword', 'changed-private');
    await save.flush();
    expect(files.writes).toBe(1);
  });

  it('hydrates a cleared WebView, saves replays/settings and persists removals without resurrection', async () => {
    const files = new Files();
    const save = await NativeSaveStorage.open(files, new Mirror());
    save.setItem(key, '{"time":12,"recording":"input frames"}');
    save.setItem('trials.lastrun.b1', 'last recording');
    save.setItem('trials.volume', '0.5');
    await save.flush();
    const replacement = new Mirror();
    replacement.setItem('trials.reviewPassword', 'leave me alone');
    const restored = await NativeSaveStorage.open(files, replacement);
    expect(restored.restoredMirror).toBe(true);
    expect(restored.getItem(key)).toContain('input frames');
    expect(replacement.getItem('trials.volume')).toBe('0.5');
    expect(replacement.getItem('trials.reviewPassword')).toBe('leave me alone');
    restored.removeItem(key);
    await restored.flush();
    // A stale mirror must not resurrect a durable deletion.
    replacement.setItem(key, 'stale PB');
    const afterReset = await NativeSaveStorage.open(files, replacement);
    expect(afterReset.getItem(key)).toBeNull();
    expect(replacement.getItem(key)).toBeNull();
    expect(afterReset.getItem('trials.volume')).toBe('0.5');
    afterReset.clear();
    await afterReset.flush();
    expect((await NativeSaveStorage.open(files, new Mirror())).length).toBe(0);
  });

  it('serializes rapid mutations and retains previous snapshot as backup', async () => {
    const files = new Files();
    const save = await NativeSaveStorage.open(files, null);
    save.setItem(key, 'first');
    const first = save.flush();
    await Promise.resolve();
    save.setItem(key, 'second');
    save.setItem('trials.volume', '0.8');
    await first;
    expect(files.maxWrites).toBe(1);
    const snapshots = SAVE_SLOTS.map((path) => JSON.parse(files.values.get(path)!)).sort((a, b) => b.generation - a.generation);
    expect(snapshots[0].entries[key]).toBe('second');
    expect(snapshots[0].generation).toBe(snapshots[1].generation + 1);
  });

  it('recovers prior committed data when a rename is interrupted and retries failures', async () => {
    const files = new Files();
    const save = await NativeSaveStorage.open(files, null);
    save.setItem(key, 'committed');
    await save.flush();
    files.failRename = true;
    save.setItem(key, 'pending');
    await expect(save.flush()).rejects.toThrow('rename failed');
    expect(save.saveFailed).toBe(true);
    expect((await NativeSaveStorage.open(files, null)).getItem(key)).toBe('committed');
    files.failRename = false;
    await save.flush();
    expect(save.saveFailed).toBe(false);
    expect((await NativeSaveStorage.open(files, null)).getItem(key)).toBe('pending');
  });

  it('retries a full-disk write without discarding the latest in-memory changes', async () => {
    const files = new Files();
    const save = await NativeSaveStorage.open(files, null);
    files.failWrite = true;
    save.setItem(key, 'unsaved PB');
    await expect(save.flush()).rejects.toThrow('disk full');
    expect(save.getItem(key)).toBe('unsaved PB');
    expect(save.saveFailed).toBe(true);
    expect((await NativeSaveStorage.open(files, null)).getItem(key)).toBeNull();
    files.failWrite = false;
    await save.flush();
    expect((await NativeSaveStorage.open(files, null)).getItem(key)).toBe('unsaved PB');
  });

  it('falls back from corrupt newest snapshot and preserves all files when both are corrupt', async () => {
    const files = new Files();
    const save = await NativeSaveStorage.open(files, null);
    save.setItem(key, 'old');
    await save.flush();
    save.setItem(key, 'new');
    await save.flush();
    const newest = SAVE_SLOTS.find((path) => JSON.parse(files.values.get(path)!).entries[key] === 'new')!;
    files.values.set(newest, '{truncated');
    const recovered = await NativeSaveStorage.open(files, null);
    expect(recovered.getItem(key)).toBe('old');
    for (const path of SAVE_SLOTS) files.values.set(path, 'corrupt');
    const before = [...files.values];
    await expect(NativeSaveStorage.open(files, null)).rejects.toThrow('preserved');
    expect([...files.values]).toEqual(before);
  });

  it('rejects unknown schemas without changing either slot or the WebView mirror', async () => {
    const files = new Files();
    const mirror = new Mirror();
    const save = await NativeSaveStorage.open(files, mirror);
    save.setItem(key, 'known');
    await save.flush();
    files.values.set(SAVE_SLOTS[0], JSON.stringify({ version: 2, generation: 999, entries: { [key]: 'future' } }));
    const before = [...files.values];
    await expect(NativeSaveStorage.open(files, mirror)).rejects.toBeInstanceOf(SaveVersionError);
    expect([...files.values]).toEqual(before);
    expect(mirror.getItem(key)).toBe('known');
  });

  it('survives WebView quota failures and does not mistake filesystem read failure for first launch', async () => {
    const files = new Files();
    const mirror = new Mirror();
    mirror.setItem = () => { throw new Error('quota'); };
    const save = await NativeSaveStorage.open(files, mirror);
    save.setItem(key, 'large replay');
    await save.flush();
    expect(save.getItem(key)).toBe('large replay');
    expect((await NativeSaveStorage.open(files, null)).getItem(key)).toBe('large replay');
    const failing = new Files();
    failing.read = async () => { throw new Error('permission'); };
    await expect(NativeSaveStorage.open(failing, null)).rejects.toThrow('permission');
    expect(failing.writes).toBe(0);
  });
});
