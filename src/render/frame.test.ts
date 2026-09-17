import { describe, expect, it } from 'vitest';
import type { PhysicsState } from '../core/types';
import { FrameBuilder } from './frame';

/** Independent kinematic fixture: a point on a translating/rotating bike, optionally sliding
 * along its local up axis. World velocity is measured by a centered finite difference of its
 * trajectory, rather than using FrameBuilder's velocity formula to build the expected result. */
function movingPoint(angle: number, omega: number, rise: number): PhysicsState {
  const position = (time: number) => {
    const theta = angle + omega * time;
    const x = -0.28, y = 0.62 + rise * time;
    return { x: 4 + 2 * time + x * Math.cos(theta) - y * Math.sin(theta), y: 3 - time + x * Math.sin(theta) + y * Math.cos(theta) };
  };
  const eps = 1e-5, before = position(-eps), after = position(eps);
  return {
    tick: 0, time: 0,
    bike: { pos: { x: 4, y: 3 }, vel: { x: 2, y: -1 }, angle, angVel: omega },
    wheels: {
      rear: { pos: { x: 3.35, y: 3 }, spin: 0, spinVel: 0, compression: 0, grounded: true },
      front: { pos: { x: 4.65, y: 3 }, spin: 0, spinVel: 0, compression: 0, grounded: true },
    },
    rider: { lean: 0, crouch: 0, torsoPitch: 0, armExtend: 0 },
    riderBody: { pos: position(0), vel: { x: (after.x - before.x) / (2 * eps), y: (after.y - before.y) / (2 * eps) }, angle, angVel: omega },
    checkpoint: -1, finished: false, faulted: null, finishTime: null,
    input: { throttle: 0, brake: 0, lean: 0 }, engine: { rpm: 1500, throttleEff: 0, limiter: false },
    contacts: { rear: 'dirt', front: 'dirt' }, rearSlip: 0, hopPhase: 'idle',
    ragdoll: null, seesaws: [], drums: [],
  };
}

describe('rider extension in the rotating bike frame', () => {
  it('does not turn rigid bike rotation into a hop', () => {
    for (const angle of [-2, 0, 0.7, 2]) for (const omega of [-6, 0, 6]) {
      const frame = new FrameBuilder().build(movingPoint(angle, omega, 0), 1);
      expect(frame.riderBody.relX).toBeCloseTo(-0.28, 10);
      expect(frame.riderBody.relY).toBeCloseTo(0.62, 10);
      expect(Math.abs(frame.riderBody.relUp)).toBeLessThan(1e-7);
    }
  });

  it('retains actual extension/compression while the chassis rotates', () => {
    for (const rise of [-1.2, 0.8, 2]) for (const omega of [-6, 6]) {
      const frame = new FrameBuilder().build(movingPoint(0.7, omega, rise), 1);
      expect(frame.riderBody.relUp).toBeCloseTo(rise, 7);
    }
  });
});

describe('the drawn pose (ask 51)', () => {
  const withDrawn = (pose: 'seated' | 'back' | 'forward', blend: number, hipY: number, torso: number, tick: number): PhysicsState => {
    const st = movingPoint(0, 0, 0);
    st.tick = tick;
    st.time = tick / 120;
    st.riderBody!.drawn = { pose, blend, hips: { x: -0.3, y: hipY }, torso, head: torso + 0.3 };
    return st;
  };

  it('is absent on a body without one and interpolated (blend, hip height, torso) between two states of the same stance', () => {
    const b = new FrameBuilder();
    expect(b.build(movingPoint(0, 0, 0), 1).riderBody.drawn.present).toBe(false);
    b.build(withDrawn('forward', 0.2, 0.75, 1.0, 1), 1);
    const f = b.build(withDrawn('forward', 0.6, 0.85, 0.8, 2), 0.25);
    expect(f.riderBody.drawn).toEqual({ present: true, pose: 'forward', blend: 0.3, hipY: 0.775, torso: 0.95 });
  });

  it('never mixes two stance ids across the seated crossing: the previous blend runs from 0', () => {
    const b = new FrameBuilder();
    b.build(withDrawn('back', 0.8, 0.65, 0.9, 1), 1);
    const f = b.build(withDrawn('forward', 0.4, 0.8, 0.7, 2), 0.5);
    expect(f.riderBody.drawn.pose).toBe('forward');
    expect(f.riderBody.drawn.blend).toBeCloseTo(0.2, 12);
  });
});
