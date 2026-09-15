import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { expandFrames, quantizeInput, type InputRecording } from '../../core/replay';
import { Game, type GameCounters } from '../../game/game';
import type { GameRenderer } from '../../render';
import { makeTrack } from '../testTracks';
import { createBikePhysicsV2 } from './bike';
import { ankleGeometry, RIDER_ANKLE, RIDER_HIP, RIDER_PROFILE, RIDER_REACH, RIDER_TORSO_REST, riderServoWrench, type RiderServoKinematics } from './rider';
import impact from './fixtures/e2-before-rider-impact.json';

const dt = 1 / 120;
const gains = { kp: 45000, kd: 4200, kpsi: 2500, cpsi: 180, tauMax: 300 };

/** Two actual rigid-body velocities. These checks derive total momentum and kinetic energy
 * directly, rather than asserting a copy of the servo's effective-mass matrix. */
function bodies() {
  return { c: { x: -2, y: 3, vx: 0, vy: 0, w: 0, m: 58, I: 11 }, r: { x: -2.12, y: 3.62, vx: 0, vy: 0, w: 0, m: 75, I: 9 } };
}
type Bodies = ReturnType<typeof bodies>;
function kinematics(b: Bodies): RiderServoKinematics {
  const x = b.r.x - b.c.x;
  const y = b.r.y - b.c.y;
  return { offsetX: x, offsetY: y, errorX: 0, errorY: 0, angleError: 0, relativeVX: b.r.vx - b.c.vx + b.c.w * y, relativeVY: b.r.vy - b.c.vy - b.c.w * x, relativeW: b.r.w - b.c.w, invMassC: 1 / b.c.m, invMassR: 1 / b.r.m, invInertiaC: 1 / b.c.I, invInertiaR: 1 / b.r.I };
}
function conserved(b: Bodies) {
  const result = { px: 0, py: 0, L: 0, energy: 0 };
  for (const p of [b.c, b.r]) {
    result.px += p.m * p.vx;
    result.py += p.m * p.vy;
    result.L += p.m * (p.x * p.vy - p.y * p.vx) + p.I * p.w;
    result.energy += 0.5 * p.m * (p.vx * p.vx + p.vy * p.vy) + 0.5 * p.I * p.w * p.w;
  }
  return result;
}
function apply(b: Bodies, q: { x: number; y: number; torque: number }) {
  b.r.vx += q.x * dt / b.r.m;
  b.r.vy += q.y * dt / b.r.m;
  b.c.vx -= q.x * dt / b.c.m;
  b.c.vy -= q.y * dt / b.c.m;
  b.r.w += q.torque * dt / b.r.I;
  // Opposing force applied at the same physical point (the rider COM), plus the torque pair.
  b.c.w += ((b.r.x - b.c.x) * -q.y - (b.r.y - b.c.y) * -q.x - q.torque) * dt / b.c.I;
}

describe('rider servo physical invariants', () => {
  it('ankle/thigh joint Jacobians agree with independent finite differences and keep one knee branch', () => {
    const geometry = (x: number, y: number) => {
      const out = { angle: 0, dx: 0, dy: 0, thighAngle: 0, thighDx: 0, thighDy: 0 };
      expect(ankleGeometry(x, y, out)).toBe(true);
      return out;
    };
    const epsilon = 1e-6;
    for (const [x, y] of [[-0.08, 0.56], [-0.3, 0.4], [0.05, 0.65], [-0.4, 0.001], [-0.4, -0.001]] as const) {
      const a = geometry(x, y);
      const xp = geometry(x + epsilon, y), xm = geometry(x - epsilon, y);
      const yp = geometry(x, y + epsilon), ym = geometry(x, y - epsilon);
      expect(a.dx).toBeCloseTo((xp.angle - xm.angle) / (2 * epsilon), 6);
      expect(a.dy).toBeCloseTo((yp.angle - ym.angle) / (2 * epsilon), 6);
      expect(a.thighDx).toBeCloseTo((xp.thighAngle - xm.thighAngle) / (2 * epsilon), 6);
      expect(a.thighDy).toBeCloseTo((yp.thighAngle - ym.thighAngle) / (2 * epsilon), 6);
    }
    expect(Math.abs(geometry(-0.4, epsilon).angle - geometry(-0.4, -epsilon).angle)).toBeLessThan(1e-4);
  });
  it('has zero damping under common translation and rotation, even away from the pose target', () => {
    const b = bodies();
    b.c.vx = 4;
    b.c.vy = -2;
    b.c.w = b.r.w = 6;
    b.r.vx = b.c.vx - b.c.w * (b.r.y - b.c.y);
    b.r.vy = b.c.vy + b.c.w * (b.r.x - b.c.x);
    const k = kinematics(b);
    k.errorX = 0.2;
    k.errorY = -0.1;
    const out = riderServoWrench({ ...gains, kp: 0, kpsi: 0 }, k, dt, 3200, { x: 0, y: 0, torque: 0 });
    expect(Math.hypot(out.x, out.y, out.torque)).toBeLessThan(1e-10);
  });

  it('damping never creates kinetic energy and internal pairs conserve momentum, including saturated actuators', () => {
    let seed = 0x632a5b17;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
    for (let n = 0; n < 1000; n++) {
      const b = bodies();
      b.r.x = b.c.x + 1.5 * (random() - 0.5);
      b.r.y = b.c.y + 1.5 * (random() - 0.5);
      for (const p of [b.c, b.r]) {
        p.vx = 20 * (random() - 0.5);
        p.vy = 20 * (random() - 0.5);
        p.w = 20 * (random() - 0.5);
      }
      const before = conserved(b);
      const maxForce = n % 2 ? 3200 : 100;
      const out = riderServoWrench({ ...gains, kp: 0, kpsi: 0 }, kinematics(b), dt, maxForce, { x: 0, y: 0, torque: 0 });
      expect(Math.hypot(out.x, out.y)).toBeLessThanOrEqual(maxForce + 1e-8);
      expect(Math.abs(out.torque)).toBeLessThanOrEqual(gains.tauMax + 1e-8);
      apply(b, out);
      const after = conserved(b);
      expect(after.energy, `energy sample ${n}`).toBeLessThanOrEqual(before.energy + 1e-9);
      expect(after.px).toBeCloseTo(before.px, 10);
      expect(after.py).toBeCloseTo(before.py, 10);
      expect(after.L).toBeCloseTo(before.L, 9);
    }
  });

  it('a stationary angle error produces torque in the restoring direction', () => {
    for (const error of [-0.5, -0.1, 0.1, 0.5]) {
      const k = kinematics(bodies());
      k.angleError = error;
      const q = riderServoWrench(gains, k, dt, 3200, { x: 0, y: 0, torque: 0 });
      expect(q.torque * error).toBeGreaterThan(0);
    }
  });

  it('disabled gains produce no force or torque', () => {
    const k = kinematics(bodies());
    k.errorY = 1;
    k.relativeVX = 10;
    k.angleError = 1;
    k.relativeW = 5;
    expect(riderServoWrench({ kp: 0, kd: 0, kpsi: 0, cpsi: 0, tauMax: 0 }, k, dt, 0, { x: 1, y: 1, torque: 1 })).toEqual({ x: 0, y: 0, torque: 0 });
  });

  it('remains attached at rest and replay/restore reproduces raw solver bytes', () => {
    const w = createBikePhysicsV2(120);
    w.loadTrack(makeTrack({ finishX: 1e9 }), 19);
    for (let i = 0; i < 600; i++) w.step(quantizeInput({}));
    const d = w.debug();
    expect(Math.hypot(d.rider.lag.x, d.rider.lag.y)).toBeLessThan(0.04);
    expect(Math.abs(d.rider.body.angVel - w.getState().bike.angVel)).toBeLessThan(0.01);
    const saved = w.snapshot();
    const inputs = Array.from({ length: 240 }, (_, i) => quantizeInput({ throttle: 0.3, lean: i < 36 ? -1 : i < 62 ? 1 : 0 }));
    for (const input of inputs) w.step(input);
    const first = w.snapshot();
    w.restore(saved);
    for (const input of inputs) w.step(input);
    const second = w.snapshot();
    expect(new Uint8Array(second.f64.buffer)).toEqual(new Uint8Array(first.f64.buffer));
    expect(second.u8).toEqual(first.u8);
  });

  it('the captured E2 impact respects physical joint limits instead of dropping and spinning the rider', () => {
    const recording = JSON.parse(readFileSync(new URL('../../../harness/inputs/e2-rear-wheel-first/bot-3.json', import.meta.url), 'utf8')) as InputRecording;
    // Cover the reported failure at 708 and persistent spin at 780. Later, the OLD control
    // sequence inverts the changed bike into a real head/ground collision; surviving it is
    // not an attachment invariant and is measured separately as changed clearability.
    const inputs = expandFrames(recording).slice(impact.inputTicks, 780);
    const world = createBikePhysicsV2(120);
    // Production Game supplies real run/restart semantics; a fake renderer does not affect physics.
    const game = new Game({ physics: world, renderer: { setTrack() {} } as unknown as GameRenderer, physicsHz: 120, autoSkipCountdown: true, autoRecord: false, ghostEnabled: false });
    game.loadTrack(impact.trackId, impact.seed, 'rookie');
    const saved = { v: 1 as const, f64: Float64Array.from(impact.f64), u8: Uint8Array.from(impact.u8) };
    let first: ReturnType<typeof game.snapshot> | undefined;
    for (let run = 0; run < 2; run++) {
      game.restore(saved);
      game.restoreCounters(impact.counters as GameCounters);
      for (const input of inputs) {
        game.setInput(input);
        game.step(1);
        const state = game.getState();
        expect(game.phase()).toBe('riding');
        const body = state.riderBody!;
        const ca = Math.cos(state.bike.angle), sa = Math.sin(state.bike.angle);
        const rx = body.pos.x - state.bike.pos.x, ry = body.pos.y - state.bike.pos.y;
        const localY = -rx * sa + ry * ca;
        const angle = body.angle - state.bike.angle;
        // The old witness reached y=-.998m and >100rad/s relative rotation within this window.
        expect(localY).toBeGreaterThan(0);
        expect(Math.abs(body.angVel - state.bike.angVel)).toBeLessThan(15);
        // Measure the physical rig's actual joint points; the separate mass-profile tests
        // establish independently that these points have the body's COM and fixed bone lengths.
        const anchors = world.debug().riderChain;
        const hx = anchors.hips.x, hy = anchors.hips.y;
        const dx = (hx - anchors.foot.x) * ca + (hy - anchors.foot.y) * sa;
        const dy = -(hx - anchors.foot.x) * sa + (hy - anchors.foot.y) * ca;
        const shinX = (anchors.knee.x - anchors.foot.x) * ca + (anchors.knee.y - anchors.foot.y) * sa;
        const shinY = -(anchors.knee.x - anchors.foot.x) * sa + (anchors.knee.y - anchors.foot.y) * ca;
        const thighX = (anchors.knee.x - hx) * ca + (anchors.knee.y - hy) * sa;
        const thighY = -(anchors.knee.x - hx) * sa + (anchors.knee.y - hy) * ca;
        expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(RIDER_REACH.legMin - 0.004);
        expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(RIDER_REACH.legMax + 0.004);
        expect(Math.atan2(shinY, shinX)).toBeGreaterThanOrEqual(RIDER_ANKLE.min - 0.005);
        expect(Math.atan2(shinY, shinX)).toBeLessThanOrEqual(RIDER_ANKLE.max + 0.005);
        const hipOpening = angle + RIDER_TORSO_REST - Math.atan2(thighY, thighX);
        expect(hipOpening).toBeGreaterThanOrEqual(RIDER_HIP.min - 0.005);
        expect(hipOpening).toBeLessThanOrEqual(RIDER_HIP.max + 0.005);
        const wx = anchors.hand.x + RIDER_PROFILE.wristFromGrip.x * ca - RIDER_PROFILE.wristFromGrip.y * sa;
        const wy = anchors.hand.y + RIDER_PROFILE.wristFromGrip.x * sa + RIDER_PROFILE.wristFromGrip.y * ca;
        expect(Math.hypot(anchors.shoulders.x - wx, anchors.shoulders.y - wy)).toBeLessThan(RIDER_REACH.armMax + 0.004);
      }
      const end = game.snapshot();
      if (first) {
        expect(new Uint8Array(end.f64.buffer)).toEqual(new Uint8Array(first.f64.buffer));
        expect(end.u8).toEqual(first.u8);
      }
      first = end;
    }
  });
});
