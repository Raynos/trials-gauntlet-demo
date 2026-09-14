import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from './loop';

describe('FixedStepLoop', () => {
  it('runs exactly hz ticks per simulated second regardless of frame cadence', () => {
    let ticks = 0;
    const loop = new FixedStepLoop({ tick: () => ticks++ }, { physicsHz: 120 });
    // Irregular frame times summing to 1s.
    const frames = [0.016, 0.033, 0.008, 0.05, 0.1, 0.016, 0.016];
    let total = 0;
    while (total < 1) {
      const dt = frames[Math.floor(Math.random() * frames.length)]!;
      loop.advance(Math.min(dt, 1 - total));
      total += dt;
    }
    expect(ticks).toBeGreaterThanOrEqual(119);
    expect(ticks).toBeLessThanOrEqual(121);
  });

  it('stepTicks bypasses the accumulator', () => {
    const seen: number[] = [];
    const loop = new FixedStepLoop({ tick: (dt, i) => seen.push(i) && expect(dt).toBeCloseTo(1 / 120) });
    expect(loop.stepTicks(5)).toBe(5);
    expect(seen).toEqual([0, 1, 2, 3, 4]);
  });

  it('clamps runaway frames', () => {
    let ticks = 0;
    const loop = new FixedStepLoop({ tick: () => ticks++ }, { physicsHz: 120, maxFrameTime: 0.25 });
    loop.advance(10);
    expect(ticks).toBe(30);
    expect(loop.alpha).toBe(0);
  });

  it('rejects bad hz', () => {
    expect(() => new FixedStepLoop({ tick: () => undefined }, { physicsHz: 0 })).toThrow();
  });
});
