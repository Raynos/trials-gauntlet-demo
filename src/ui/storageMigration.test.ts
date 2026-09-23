import { describe, expect, it } from 'vitest';
import { MIGRATED_KEY, migrateLegacyStorage } from './storageMigration';
import { BestTimes } from './best';

class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

describe('trials.* → rockhop.* storage migration', () => {
  it('copies every legacy key, keeps the originals, and runs once', () => {
    const s = new MemStorage();
    s.setItem('trials.best.b1-first-ride', JSON.stringify({ time: 41.2, faults: 0, medal: 'gold' }));
    s.setItem('trials.best.b1-first-ride@pro#board', '[]');
    s.setItem('trials.volume', '0.4');
    s.setItem('trials.lastTrack', 'b1-first-ride');
    s.setItem('unrelated', 'x');
    expect(migrateLegacyStorage(s)).toBe(4);
    expect(s.getItem('rockhop.best.b1-first-ride')).toBe(s.getItem('trials.best.b1-first-ride'));
    expect(s.getItem('rockhop.best.b1-first-ride@pro#board')).toBe('[]');
    expect(s.getItem('rockhop.volume')).toBe('0.4');
    expect(s.getItem('rockhop.lastTrack')).toBe('b1-first-ride');
    expect(s.getItem('trials.volume')).toBe('0.4');
    expect(s.getItem('rockhop.unrelated')).toBeNull();
    expect(s.getItem(MIGRATED_KEY)).toBe('1');
    // Second boot: nothing happens, even if an old build wrote a new legacy value meanwhile.
    s.setItem('trials.volume', '0.9');
    expect(migrateLegacyStorage(s)).toBe(0);
    expect(s.getItem('rockhop.volume')).toBe('0.4');
  });

  it('never overwrites a rockhop.* value that already exists', () => {
    const s = new MemStorage();
    s.setItem('trials.sound', '0');
    s.setItem('rockhop.sound', '1');
    expect(migrateLegacyStorage(s)).toBe(0);
    expect(s.getItem('rockhop.sound')).toBe('1');
  });

  it('is a no-op without storage', () => {
    expect(migrateLegacyStorage(null)).toBe(0);
  });

  it('an existing player keeps their best time through BestTimes', () => {
    const s = new MemStorage();
    s.setItem('trials.best.c1-low-tide', JSON.stringify({ time: 52.318, faults: 2, medal: 'silver' }));
    migrateLegacyStorage(s);
    const g = globalThis as { localStorage?: Storage };
    const prev = g.localStorage;
    g.localStorage = s;
    try {
      expect(new BestTimes().get('c1-low-tide')?.time).toBe(52.318);
    } finally {
      if (prev === undefined) delete g.localStorage;
      else g.localStorage = prev;
    }
  });
});
