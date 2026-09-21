/** The old R9 split/clamp assertions are superseded by one physical/render geometry contract.
 * Handling bounds remain in r2-r8 and are not relaxed here. */
import { describe, expect, it } from 'vitest';
import { RIDER_PROFILE, RIDER_SEAT, RIDER_TORSO_REST, makeRiderRigPose, riderPoseAtLean, riderRigFromCOM } from '../../core/riderGeometry';
import { createBikePhysicsV2 } from './bike';
import { BIKE_GEOMETRY_V2 } from './tuning';
import { makeTrack } from '../testTracks';
import { stepN } from '../controllers';
import { quantizeInput } from '../../core/replay';
import { hashPhysicsState } from '../../core/hash';

describe('shared rider geometry replaces R9 draw/physics split', () => {
  it('is seated, lifts forward at least .15m, and clears the seat before loading behind it with reachable limbs', () => {
    const n = riderPoseAtLean(0, makeRiderRigPose()),
      f = riderPoseAtLean(1, makeRiderRigPose()),
      b = riderPoseAtLean(-1, makeRiderRigPose());
    expect(Math.abs(n.hips.y - RIDER_SEAT.pelvisDrop * Math.sin(n.torsoAngle) - RIDER_SEAT.topY)).toBeLessThan(0.02);
    expect(f.hips.y - n.hips.y).toBeGreaterThanOrEqual(0.15);
    expect(f.shoulders.x).toBeGreaterThan(n.shoulders.x);
    // Revised from the rejected low chest-over-bars authoring target: tall stand-and-lean.
    expect(f.torsoAngle).toBeGreaterThan((45 * Math.PI) / 180);
    expect(f.torsoAngle).toBeLessThan((55 * Math.PI) / 180);
    expect(f.shoulders.x).toBeLessThan(f.wrist.x);
    expect(f.elbow.x).toBeLessThan(f.wrist.x);
    expect(n.hips.x - b.hips.x).toBeGreaterThanOrEqual(0.3);
    for (let i = 0; i <= 200; i++) {
      const p = riderPoseAtLean(-1 + i / 100, makeRiderRigPose());
      expect(p.armReach).toBeLessThan(0.99);
      expect(p.legReach).toBeLessThan(0.99);
      if (p.hips.x >= RIDER_SEAT.rearX - 0.05)
        expect(p.hips.y - RIDER_SEAT.pelvisDrop * Math.sin(p.torsoAngle)).toBeGreaterThanOrEqual(RIDER_SEAT.topY - 0.001);
      const inverse = riderRigFromCOM(p.com.x, p.com.y, p.torsoAngle, makeRiderRigPose());
      expect(inverse.residual).toBeLessThan(1e-8);
      expect(Math.hypot(inverse.hips.x - p.hips.x, inverse.hips.y - p.hips.y)).toBeLessThan(1e-7);
    }
  });
  it.each(['rookie', 'pro'] as const)('%s rises onto the pegs before the forward hinge without flipping or losing limb reach', (cls) => {
    const w = createBikePhysicsV2(120);
    w.loadTrack(makeTrack({ finishX: 1e9 }), 1, { bike: cls });
    stepN(w, {}, 240);
    let startHipY = 0;
    let hingeHipY = 0;
    let lastLegReach = 0;
    for (let i = 0; i < 360; i++) {
      w.step(quantizeInput({ lean: 1 }));
      const s = w.getState(), rb = s.riderBody!;
      const c = Math.cos(s.bike.angle), sn = Math.sin(s.bike.angle);
      const dx = rb.pos.x - s.bike.pos.x, dy = rb.pos.y - s.bike.pos.y;
      const off = BIKE_GEOMETRY_V2.chassisToAxle;
      const p = riderRigFromCOM(dx * c + dy * sn - off.x, -dx * sn + dy * c - off.y,
        RIDER_TORSO_REST + rb.angle - s.bike.angle, makeRiderRigPose());
      if (i === 0) startHipY = p.hips.y;
      if (hingeHipY === 0 && p.torsoAngle < 50 * Math.PI / 180) hingeHipY = p.hips.y;
      // The visible chest stays above the pelvis rather than folding flat or flipping.
      expect(p.torsoAngle * 180 / Math.PI).toBeGreaterThan(30);
      expect(p.torsoAngle * 180 / Math.PI).toBeLessThan(70);
      expect(p.armReach).toBeLessThan(0.99);
      expect(p.legReach).toBeLessThan(0.99);
      expect(s.faulted).toBeNull();
      lastLegReach = p.legReach;
    }
    expect(hingeHipY - startHipY).toBeGreaterThan(0.16);
    expect(lastLegReach).toBeGreaterThan(0.95);
    const target = riderPoseAtLean(1, makeRiderRigPose());
    expect(target.legReach).toBeGreaterThan(0.975);
  });
  it.each(['rookie', 'pro'] as const)('%s sensors, exported hips and head match the physical COM inverse through lean changes and a 3m landing', (cls) => {
    const w = createBikePhysicsV2(120);
    w.loadTrack(makeTrack({ finishX: 1e9 }), 1, { bike: cls });
    stepN(w, {}, 60);
    for (let i = 0; i < 480; i++) {
      if (i === 240) {
        const s = w.getState();
        w.teleport({ pos: { x: s.wheels.rear.pos.x, y: s.wheels.rear.pos.y + 3 }, angle: 0, vel: { x: 6, y: 0 } });
      }
      w.step(quantizeInput({ throttle: 0.2, lean: i < 80 ? 0 : i < 160 ? 1 : i < 240 ? -0.5 : 0 }));
      const s = w.getState();
      if (s.faulted) break;
      const rb = s.riderBody!,
        c = Math.cos(s.bike.angle),
        sn = Math.sin(s.bike.angle),
        dx = rb.pos.x - s.bike.pos.x,
        dy = rb.pos.y - s.bike.pos.y,
        off = BIKE_GEOMETRY_V2.chassisToAxle;
      const p = riderRigFromCOM(dx * c + dy * sn - off.x, -dx * sn + dy * c - off.y, RIDER_TORSO_REST + rb.angle - s.bike.angle, makeRiderRigPose());
      expect(rb.drawn!.hips.x).toBeCloseTo(p.hips.x, 8);
      expect(rb.drawn!.hips.y).toBeCloseTo(p.hips.y, 8);
      const ch = w.debug().riderChain;
      expect(ch.head.x).toBeCloseTo(s.bike.pos.x + (p.head.x + off.x) * c - (p.head.y + off.y) * sn, 8);
      expect(ch.head.y).toBeCloseTo(s.bike.pos.y + (p.head.x + off.x) * sn + (p.head.y + off.y) * c, 8);
      expect(Math.hypot(ch.shoulders.x - ch.hips.x, ch.shoulders.y - ch.hips.y)).toBeCloseTo(RIDER_PROFILE.torso, 8);
    }
    expect(w.getState().faulted).toBeNull();
  });
  it('repeated inputs reproduce every physical-state hash, independent of geometry query count', () => {
    const a = createBikePhysicsV2(120),
      b = createBikePhysicsV2(120),
      t = makeTrack({ finishX: 1e9 });
    a.loadTrack(t, 42);
    b.loadTrack(t, 42);
    for (let i = 0; i < 600; i++) {
      const input = quantizeInput({ throttle: 0.2, lean: Math.sin(i / 50) });
      a.step(input);
      b.step(input);
      a.debug();
      a.getState();
      a.debug();
      expect(hashPhysicsState(a.getState())).toBe(hashPhysicsState(b.getState()));
    }
  });
});
