import { describe, expect, it } from 'vitest';
import { FrameCadence } from './cadence';

/** Drive the cadence with a simulated display: RAF every `rafMs` (+ jitter), the rendered frame occasionally overrunning by `overrun(i)` ms. */
function simulate(capHz: number, rafMs: number, seconds: number, opts: { jitter?: number; overrun?: (i: number) => number } = {}): { rendered: number[]; rafs: number } {
  const c = new FrameCadence();
  const rendered: number[] = [];
  let t = 1000;
  let rafs = 0;
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
  const end = t + seconds * 1000;
  let i = 0;
  while (t < end) {
    rafs++;
    const now = t + (opts.jitter ?? 0) * rnd();
    if (c.shouldRender(now, capHz)) {
      rendered.push(now);
      const over = opts.overrun?.(i++) ?? 0;
      // A frame that overran the slot: the next RAF fires at the next vsync after the work finished.
      if (over > 0) t += rafMs * Math.ceil(over / rafMs);
    }
    t += rafMs;
  }
  return { rendered, rafs };
}

describe('FrameCadence (phase-locked frame cap)', () => {
  it('30 cap on a 60 Hz display renders exactly every second RAF: 30 fps flat, no dropped slots', () => {
    const { rendered } = simulate(30, 1000 / 60, 10, { jitter: 0.3 });
    expect(rendered.length).toBeGreaterThanOrEqual(299);
    expect(rendered.length).toBeLessThanOrEqual(301);
    const gaps = rendered.slice(1).map((v, i) => v - rendered[i]!);
    expect(Math.max(...gaps)).toBeLessThan(1000 / 30 + 1000 / 60 * 0.5); // never a third slot
  });

  it('30 cap on a 120 Hz display renders every fourth RAF', () => {
    const { rendered, rafs } = simulate(30, 1000 / 120, 10, { jitter: 0.3 });
    expect(rafs).toBeGreaterThan(1150);
    expect(rendered.length).toBeGreaterThanOrEqual(299);
    expect(rendered.length).toBeLessThanOrEqual(301);
  });

  it('60 cap on a 60 Hz display renders every RAF; on 120 Hz every second', () => {
    expect(simulate(60, 1000 / 60, 5, { jitter: 0.3 }).rendered.length).toBeGreaterThanOrEqual(299);
    const r120 = simulate(60, 1000 / 120, 5, { jitter: 0.3 }).rendered.length;
    expect(r120).toBeGreaterThanOrEqual(299);
    expect(r120).toBeLessThanOrEqual(301);
  });

  it('a frame that overruns its slot by a hair is followed by an early one: the long-run rate stays 30 (the old free-running rule slipped to 24–28)', () => {
    // Every 5th frame overruns by 18 ms (crosses one 60 Hz slot). Phase-locked: 30 fps over 10 s within one frame.
    const { rendered } = simulate(30, 1000 / 60, 10, { overrun: (i) => (i % 5 === 4 ? 18 : 0) });
    expect(rendered.length).toBeGreaterThanOrEqual(298);
    // The free-running rule for comparison: `now - last >= period - 2` re-based on the late slot every time.
    let last = 0;
    let n = 0;
    let t = 1000;
    let i = 0;
    while (t < 11000) {
      if (t - last >= 1000 / 30 - 2) {
        last = t;
        n++;
        if (i++ % 5 === 4) t += 1000 / 60 * 2; // the overrun: next RAF two slots later
      }
      t += 1000 / 60;
    }
    expect(n).toBeLessThan(290); // 25 fps-class: every overrun costs a slot for good
  });

  it('far behind (tab hidden, a long task): resyncs to now instead of bursting', () => {
    const c = new FrameCadence();
    expect(c.shouldRender(1000, 30)).toBe(true);
    // 2 s of no RAF, then the display resumes at 60 Hz.
    expect(c.shouldRender(3000, 30)).toBe(true);
    expect(c.shouldRender(3016.7, 30)).toBe(false); // not due for another period
    expect(c.shouldRender(3033.3, 30)).toBe(true);
  });

  it('reset() forgets the phase (cap change): the next RAF renders', () => {
    const c = new FrameCadence();
    c.shouldRender(1000, 30);
    expect(c.shouldRender(1008, 30)).toBe(false);
    c.reset();
    expect(c.shouldRender(1016, 60)).toBe(true);
  });
});
