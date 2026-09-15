import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '../../src/core/types';
import { createProductionSim, equalProductionSnapshots } from './production-sim';

describe('production Game search snapshots', () => {
  it('retains a fault when restarting before checkpoint 1 and replays a restored branch exactly', () => {
    const sim = createProductionSim('b1-first-ride');
    const root = sim.snap();
    // Preserve the actual production counter behavior that the old Node mirror gets wrong.
    root.counters.faults = 1;
    root.counters.phase = 'crashed';
    sim.restore(root);
    const inputs = Array.from({ length: 180 }, (_, tick) => ({ ...NEUTRAL_INPUT,
      throttle: 0.3, lean: 0, restart: tick === 1 }));
    sim.run(inputs.slice(0, 2));
    expect(sim.faults()).toBe(1);
    sim.run(inputs.slice(2));
    const first = sim.snap();
    sim.restore(root);
    sim.run(inputs);
    expect(equalProductionSnapshots(first, sim.snap())).toBe(true);
  });

  it('rejects a signed-zero snapshot change and counter-only disagreement', () => {
    const sim = createProductionSim('flat-test'), a = sim.snap(), b = sim.snap();
    a.physics.f64[0] = 0;
    b.physics.f64[0] = -0;
    expect(equalProductionSnapshots(a, b)).toBe(false);
    b.physics.f64[0] = 0;
    expect(equalProductionSnapshots(a, b)).toBe(true);
    b.counters.faults++;
    expect(equalProductionSnapshots(a, b)).toBe(false);
  });
});
