/**
 * Local per-track leaderboard (docs/design/game.md § leaderboard): top 5 per track per class in
 * `trials.best.<id>[@pro]#board`, seeded from a pre-board PB, additive to the PB entries.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunResult } from '../core/types';
import { BOARD_SIZE, BestTimes, bestKey, boardKey } from './best';

class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  clear(): void {
    this.m.clear();
  }
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
}

const run = (time: number, faults = 0, bike: 'rookie' | 'pro' = 'rookie'): RunResult => ({
  trackId: 'b1',
  time,
  faults,
  medal: faults === 0 && time < 20 ? 'gold' : 'bronze',
  personalBest: false,
  previousBest: null,
  targetTimeS: 20,
  bike,
});

describe('BestTimes.board', () => {
  const g = globalThis as { localStorage?: Storage | undefined };
  let saved: Storage | undefined;
  beforeEach(() => {
    saved = g.localStorage;
    g.localStorage = new MemStorage();
  });
  afterEach(() => {
    if (saved) g.localStorage = saved;
    else delete g.localStorage;
  });

  it('keeps the best five per track per class, fastest first, and returns the rank', () => {
    const b = new BestTimes();
    expect(b.board('b1', 'rookie')).toEqual([]);
    expect(b.record('b1', run(30))).toBe(1);
    expect(b.record('b1', run(25))).toBe(1);
    expect(b.record('b1', run(35))).toBe(3);
    expect(b.record('b1', run(31))).toBe(3);
    expect(b.record('b1', run(40))).toBe(5);
    expect(b.record('b1', run(41))).toBeNull(); // outside the top 5
    expect(b.record('b1', run(19))).toBe(1);
    const rows = b.board('b1', 'rookie');
    expect(rows.map((r) => r.time)).toEqual([19, 25, 30, 31, 35]);
    expect(rows).toHaveLength(BOARD_SIZE);
    expect(rows[0]!.medal).toBe('gold');
    // Pro is its own board.
    expect(b.board('b1', 'pro')).toEqual([]);
    expect(b.record('b1', run(50, 2, 'pro'))).toBe(1);
    expect(b.board('b1', 'rookie').map((r) => r.time)).toEqual([19, 25, 30, 31, 35]);
    // Persisted under the best-times prefix; a fresh store reads the same rows.
    expect(JSON.parse(localStorage.getItem(boardKey('b1', 'rookie'))!)).toHaveLength(5);
    expect(new BestTimes().board('b1', 'pro').map((r) => r.time)).toEqual([50]);
  });

  it('a pre-board PB seeds the board with one row and is not duplicated by the run that beats it', () => {
    localStorage.setItem(bestKey('b1', 'rookie'), JSON.stringify({ time: 28, faults: 1, medal: 'silver' }));
    const b = new BestTimes();
    expect(b.board('b1', 'rookie')).toEqual([{ time: 28, faults: 1, medal: 'silver', at: '' }]);
    // The game records before it stores the new PB (game.ts publishResults).
    const r = { ...run(27), personalBest: true, previousBest: 28 };
    expect(b.record('b1', r)).toBe(1);
    b.put('b1', r, { splits: [], recording: null });
    expect(b.board('b1', 'rookie').map((x) => x.time)).toEqual([27, 28]);
    expect(b.get('b1', 'rookie')?.time).toBe(27);
  });

  it('ties keep the earlier run ahead unless the new one has fewer faults; reset progress clears the board', () => {
    const b = new BestTimes();
    b.record('b1', run(30, 2));
    expect(b.record('b1', run(30, 2))).toBe(2);
    expect(b.record('b1', run(30, 0))).toBe(1);
    b.clear();
    expect(b.board('b1', 'rookie')).toEqual([]);
    expect(localStorage.getItem(boardKey('b1', 'rookie'))).toBeNull();
  });

  it('a corrupt board is an empty board, never a throw', () => {
    localStorage.setItem(boardKey('b1', 'rookie'), '{not json');
    expect(new BestTimes().board('b1', 'rookie')).toEqual([]);
    localStorage.setItem(boardKey('b1', 'rookie'), JSON.stringify([{ time: 'x' }, { time: 12, faults: 0, medal: 'nope' }]));
    expect(new BestTimes().board('b1', 'rookie')).toEqual([{ time: 12, faults: 0, medal: 'bronze', at: '' }]);
  });
});
