import { describe, expect, it } from 'vitest';
import { StateHasher, hashPhysicsState } from './hash';
import type { PhysicsState } from './types';

function state(): PhysicsState {
  const wheel = () => ({ pos: { x: 1, y: 2 }, spin: 3, spinVel: 4, compression: 0.5, grounded: true });
  return {
    tick: 10,
    time: 10 / 120,
    bike: { pos: { x: 1.5, y: 0.6 }, vel: { x: 3, y: 0 }, angle: 0.1, angVel: 0 },
    wheels: { rear: wheel(), front: wheel() },
    rider: { lean: 0, crouch: 0, torsoPitch: 0, armExtend: 0 },
    checkpoint: -1,
    finished: false,
    faulted: null,
    finishTime: null,
    input: { throttle: 0, brake: 0, lean: 0 },
    engine: { rpm: 1500, throttleEff: 0, limiter: false },
    contacts: { rear: 'dirt', front: 'dirt' },
    rearSlip: 0,
    hopPhase: 'idle',
    ragdoll: null,
    seesaws: [],
    drums: [],
  };
}

describe('hashPhysicsState', () => {
  it('is stable and 16 hex chars', () => {
    expect(hashPhysicsState(state())).toBe(hashPhysicsState(state()));
    expect(hashPhysicsState(state())).toMatch(/^[0-9a-f]{16}$/);
  });

  it('detects a 1-ulp change', () => {
    const a = state();
    const b = state();
    b.bike.pos.x = a.bike.pos.x + Number.EPSILON;
    expect(hashPhysicsState(a)).not.toBe(hashPhysicsState(b));
  });

  it('distinguishes -0 from 0 and null from a number', () => {
    const a = state();
    const b = state();
    b.bike.vel.y = -0;
    expect(hashPhysicsState(a)).not.toBe(hashPhysicsState(b));
    const c = state();
    c.finishTime = 1;
    expect(hashPhysicsState(a)).not.toBe(hashPhysicsState(c));
  });

  it('StateHasher mixes strings', () => {
    expect(new StateHasher().string('crash').digest()).not.toBe(new StateHasher().string('restart').digest());
  });
});
