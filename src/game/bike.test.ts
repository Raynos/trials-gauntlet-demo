// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { RunResult } from '../core/types';
import { BestTimes, bestKey } from '../ui/best';
import { defaultBikeForTier, medalFor, targetForBike } from './rules';
import { RUNLOG_KEY, RunLog } from './telemetry';

describe('bike class rules', () => {
  it('per-tier default: beginner/easy Rookie, hard/extreme Pro, medium = last used (Rookie when none)', () => {
    expect(defaultBikeForTier('beginner', null)).toBe('rookie');
    expect(defaultBikeForTier('easy', 'pro')).toBe('rookie');
    expect(defaultBikeForTier('hard', null)).toBe('pro');
    expect(defaultBikeForTier('extreme', 'rookie')).toBe('pro');
    expect(defaultBikeForTier('medium', null)).toBe('rookie');
    expect(defaultBikeForTier('medium', 'pro')).toBe('pro');
  });

  it('Pro medal targets are 10 % tighter; Rookie rides the authored target', () => {
    expect(targetForBike(30, 'rookie')).toBe(30);
    expect(targetForBike(30, undefined)).toBe(30);
    expect(targetForBike(30, 'pro')).toBe(27);
    expect(targetForBike(null, 'pro')).toBeNull();
    // 28 s, 0 faults: gold on Rookie (≤ 30), silver on Pro (> 27, ≤ 33.75)
    expect(medalFor(28, 0, 30, 'rookie')).toBe('gold');
    expect(medalFor(28, 0, 30, 'pro')).toBe('silver');
    expect(medalFor(22, 0, 30, 'pro')).toBe('platinum'); // ≤ 0.85 · 27 = 22.95
  });
});

describe('best times per bike class', () => {
  beforeEach(() => localStorage.clear());
  const result = (time: number, medal: RunResult['medal'], bike: NonNullable<RunResult['bike']>): RunResult => ({ trackId: 'b1', time, faults: 0, medal, personalBest: true, previousBest: null, targetTimeS: 30, bike });

  it('stores Rookie under the legacy key and Pro under @pro; get(id) is the best across classes', () => {
    const store = new BestTimes();
    store.put('b1', result(31, 'silver', 'rookie'), { splits: [1], recording: 'r' });
    store.put('b1', result(25, 'gold', 'pro'), { splits: [2], recording: 'p' });
    expect(localStorage.getItem(bestKey('b1', 'rookie'))).toContain('"time":31');
    expect(localStorage.getItem('rockhop.best.b1@pro')).toContain('"time":25');
    expect(store.get('b1', 'rookie')?.recording).toBe('r');
    expect(store.get('b1', 'pro')?.recording).toBe('p');
    expect(store.get('b1')?.bike).toBe('pro'); // higher medal wins
    store.put('b1', result(24, 'gold', 'rookie'));
    expect(store.get('b1')?.bike).toBe('rookie'); // same medal → faster time
  });

  it('pre-garage entries (no bike field) read back as Rookie', () => {
    localStorage.setItem('rockhop.best.b1', JSON.stringify({ time: 40, faults: 2, medal: 'bronze' }));
    const store = new BestTimes();
    expect(store.get('b1', 'rookie')?.bike).toBe('rookie');
    expect(store.get('b1', 'pro')).toBeNull();
    expect(store.get('b1')?.time).toBe(40);
  });
});

describe('run log', () => {
  beforeEach(() => localStorage.clear());
  it('appends, stays bounded, exports self-describing JSON', () => {
    const log = new RunLog(RUNLOG_KEY, 3);
    const entry = (i: number) => ({ at: 't', track: `t${i}`, bike: 'rookie' as const, attempts: 1, faults: 0, time: 1, timeToClear: 2, medal: 'gold' as const, deaths: [], device: 'node', quality: 'high' as const, qualityWhy: 'manual', fps: { p50: 60, p95: 55 }, frameMs: { p50: 16.6, p95: 18 }, build: 'dev' });
    for (let i = 0; i < 5; i++) log.append(entry(i));
    expect(log.read().map((r) => r.track)).toEqual(['t2', 't3', 't4']);
    expect(log.summary()).toEqual({ runs: 3, tracks: 3 });
    const out = JSON.parse(log.exportJson('build x')) as { kind: string; runs: unknown[] };
    expect(out.kind).toBe('rockhop-runlog');
    expect(out.runs).toHaveLength(3);
  });
});
