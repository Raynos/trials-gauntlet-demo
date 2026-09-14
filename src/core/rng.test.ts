import { describe, expect, it } from 'vitest';
import { Rng, seedFromString } from './rng';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('diverges for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const same = Array.from({ length: 16 }, () => a.nextU32() === b.nextU32()).filter(Boolean).length;
    expect(same).toBeLessThan(2);
  });

  it('produces floats in [0,1) with a sane mean', () => {
    const r = new Rng(42);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.01);
  });

  it('snapshot/restore resumes the same stream', () => {
    const r = new Rng(7);
    r.next();
    const snap = r.state();
    const expected = [r.nextU32(), r.nextU32(), r.nextU32()];
    r.setState(snap);
    expect([r.nextU32(), r.nextU32(), r.nextU32()]).toEqual(expected);
  });

  it('seedFromString is stable', () => {
    expect(seedFromString('flat-test')).toBe(seedFromString('flat-test'));
    expect(seedFromString('a')).not.toBe(seedFromString('b'));
  });
});
