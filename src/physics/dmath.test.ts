import { describe, expect, it } from 'vitest';
import { atan, atan2, cos, sin, wrapAngle } from './dmath';

describe('dmath', () => {
  it('sin/cos match Math within 1e-9 over [-50, 50]', () => {
    let maxErr = 0;
    for (let i = 0; i <= 200000; i++) {
      const x = -50 + (100 * i) / 200000;
      maxErr = Math.max(maxErr, Math.abs(sin(x) - Math.sin(x)), Math.abs(cos(x) - Math.cos(x)));
    }
    expect(maxErr).toBeLessThan(1e-9);
  });
  it('atan/atan2 match Math within 1e-9', () => {
    let maxErr = 0;
    for (let i = 0; i <= 100000; i++) {
      const x = -100 + (200 * i) / 100000;
      maxErr = Math.max(maxErr, Math.abs(atan(x) - Math.atan(x)));
    }
    for (let i = 0; i < 20000; i++) {
      const a = (i / 20000) * Math.PI * 2 - Math.PI;
      const r = 0.001 + (i % 7);
      const y = r * Math.sin(a);
      const x = r * Math.cos(a);
      let d = Math.abs(atan2(y, x) - Math.atan2(y, x));
      if (d > Math.PI) d = Math.abs(d - 2 * Math.PI);
      maxErr = Math.max(maxErr, d);
    }
    expect(maxErr).toBeLessThan(1e-9);
    expect(atan2(1, 0)).toBeCloseTo(Math.PI / 2, 12);
    expect(atan2(0, -1)).toBeCloseTo(Math.PI, 12);
  });
  it('wrapAngle lands in [-PI, PI]', () => {
    for (let i = -100; i <= 100; i++) {
      const w = wrapAngle(i * 0.7);
      expect(w).toBeGreaterThanOrEqual(-Math.PI);
      expect(w).toBeLessThanOrEqual(Math.PI);
      expect(Math.sin(w)).toBeCloseTo(Math.sin(i * 0.7), 9);
    }
  });
});
