import { describe, expect, it } from 'vitest';
import { makeTrack } from '../testTracks';
import { createBikePhysicsV2 } from './bike';
import { BIKE_GEOMETRY_V2 } from './tuning';
import { makeRiderRigPose, RIDER_PROFILE as P, riderProfileInertia, riderCOMGradient, riderRigFromCOM, riderRigFromHips, type RigPoint } from './rider';

function distance(a: RigPoint, b: RigPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

describe('one posed rider mass/geometry profile', () => {
  it('whole-body segment masses sum to one, including BOTH legs, arms, hands and feet', () => {
    const m = P.mass;
    expect(m.headNeck + m.trunk + 2 * (m.upperArm + m.forearm + m.hand + m.thigh + m.shin + m.foot)).toBeCloseTo(1, 15);
    expect(riderProfileInertia(75)).toBeGreaterThan(2);
    expect(riderProfileInertia(75)).toBeLessThan(20);
    expect(riderProfileInertia(150)).toBe(riderProfileInertia(75) * 2);
  });

  it('the reported COM is the independently weighted centroid of every posed segment', () => {
    for (const pose of P.poses) {
      const rig = riderRigFromHips(pose.hipX, pose.hipY, pose.torso * Math.PI / 180, makeRiderRigPose());
      const samples: { mass: number; x: number; y: number; z: number }[] = [];
      const add = (mass: number, a: RigPoint, b: RigPoint, fraction: number) => samples.push({ mass, x: a.x + fraction * (b.x - a.x), y: a.y + fraction * (b.y - a.y), z: a.z + fraction * (b.z - a.z) });
      add(P.mass.trunk, rig.hips, rig.shoulders, P.comFraction.trunk);
      const vertex = { x: rig.shoulders.x + P.headNeckLength * Math.cos(rig.headAngle), y: rig.shoulders.y + P.headNeckLength * Math.sin(rig.headAngle), z: 0 };
      add(P.mass.headNeck, rig.shoulders, vertex, P.comFraction.headNeck);
      for (const side of [-1, 1]) {
        const mirror = (p: RigPoint): RigPoint => ({ ...p, z: side * p.z });
        const shoulder = { ...rig.shoulders, z: side * P.shoulderHalf };
        const hip = { ...rig.hips, z: side * P.hipHalf };
        const elbow = mirror(rig.elbow), wrist = mirror(rig.wrist), knee = mirror(rig.knee), ankle = mirror(rig.ankle);
        add(P.mass.upperArm, shoulder, elbow, P.comFraction.upperArm);
        add(P.mass.forearm, elbow, wrist, P.comFraction.forearm);
        add(P.mass.hand, mirror(rig.grip), mirror(rig.grip), 0); // palm at grip, not anatomical wrist
        add(P.mass.thigh, hip, knee, P.comFraction.thigh);
        add(P.mass.shin, knee, ankle, P.comFraction.shin);
        const foot = { x: ankle.x + P.footCentroidFromAnkle.x, y: ankle.y + P.footCentroidFromAnkle.y, z: ankle.z };
        add(P.mass.foot, foot, foot, 0);
      }
      for (const axis of ['x', 'y', 'z'] as const) expect(samples.reduce((sum, p) => sum + p.mass * p[axis], 0)).toBeCloseTo(rig.com[axis], 11);
    }
  });

  it('forward/inverse maps round-trip feasible poses with fixed limb lengths and closed contact points', () => {
    const rig = makeRiderRigPose(), inverse = makeRiderRigPose();
    let checked = 0;
    for (const x of [-0.6, -0.5, -0.4, -0.3, -0.2, -0.1])
      for (const y of [0.5, 0.6, 0.7, 0.8, 0.9, 1])
        for (const degrees of [20, 30, 40, 50, 60, 70]) {
          riderRigFromHips(x, y, degrees * Math.PI / 180, rig);
          if (rig.armReach > 0.995 || rig.legReach > 0.995) continue;
          checked++;
          const shoulder = { ...rig.shoulders, z: P.shoulderHalf }, hip = { ...rig.hips, z: P.hipHalf };
          expect(distance(shoulder, rig.elbow)).toBeCloseTo(P.upperArm, 9);
          expect(distance(rig.elbow, rig.wrist)).toBeCloseTo(P.forearm, 9);
          expect(distance(hip, rig.knee)).toBeCloseTo(P.thigh, 9);
          expect(distance(rig.knee, rig.ankle)).toBeCloseTo(P.shin, 9);
          expect(rig.wrist.x - rig.grip.x).toBeCloseTo(P.wristFromGrip.x, 12);
          expect(rig.wrist.y - rig.grip.y).toBeCloseTo(P.wristFromGrip.y, 12);
          expect(rig.grip).toEqual(P.grip);
          expect(rig.ankle).toEqual(P.ankle);
          riderRigFromCOM(rig.com.x, rig.com.y, rig.torsoAngle, inverse);
          expect(inverse.residual, `COM ${x},${y},${degrees}`).toBeLessThan(1e-7);
          expect(distance(inverse.hips, rig.hips), `hips ${x},${y},${degrees}`).toBeLessThan(1e-6);
          expect(inverse).toEqual(riderRigFromCOM(rig.com.x, rig.com.y, rig.torsoAngle, makeRiderRigPose()));
        }
    expect(checked).toBeGreaterThan(100);
  });

  it('bounded inversion covers a full-turn workspace, including formerly divergent folded poses', () => {
    const rig = makeRiderRigPose(), inverse = makeRiderRigPose();
    let worst = 0;
    for (let degrees = -160; degrees <= 200; degrees += 10)
      for (let ix = -15; ix <= 10; ix++)
        for (let iy = -5; iy <= 18; iy++) {
          riderRigFromHips(ix * 0.1, iy * 0.1, degrees * Math.PI / 180, rig);
          riderRigFromCOM(rig.com.x, rig.com.y, rig.torsoAngle, inverse);
          worst = Math.max(worst, Math.hypot(inverse.com.x - rig.com.x, inverse.com.y - rig.com.y));
          expect(Number.isFinite(inverse.hips.x + inverse.hips.y)).toBe(true);
        }
    // 23,088 poses; the previous unbounded Newton solve diverged as far as 140 metres.
    // The extrapolated map can have several roots outside the anatomical stops, so require
    // the same COM rather than pretending an impossible pose has a unique inverse hip point.
    expect(worst).toBeLessThan(1e-9);
  });

  it('COM gradients agree with independent inverse-map differences in the authored workspace', () => {
    const rig = makeRiderRigPose(), probe = makeRiderRigPose(), gradient = { x: 0, y: 0, z: 0 };
    const epsilon = 1e-6;
    for (const pose of P.poses) {
      riderRigFromHips(pose.hipX, pose.hipY, pose.torso * Math.PI / 180, rig);
      riderRigFromHips(pose.hipX + epsilon, pose.hipY, rig.torsoAngle, probe);
      const j00 = (probe.com.x - rig.com.x) / epsilon, j10 = (probe.com.y - rig.com.y) / epsilon;
      riderRigFromHips(pose.hipX, pose.hipY + epsilon, rig.torsoAngle, probe);
      const j01 = (probe.com.x - rig.com.x) / epsilon, j11 = (probe.com.y - rig.com.y) / epsilon;
      // Squared hip-to-ankle distance is differentiated independently of the solver gap code.
      const gx = 2 * (rig.hips.x - P.ankle.x), gy = 2 * (rig.hips.y - P.ankle.y);
      expect(riderCOMGradient(j00, j01, j10, j11, 0, gx, gy, gradient)).toBe(true);
      const squaredLeg = (x: number, y: number) => {
        riderRigFromCOM(x, y, rig.torsoAngle, probe);
        return (probe.hips.x - P.ankle.x) ** 2 + (probe.hips.y - P.ankle.y) ** 2;
      };
      expect(gradient.x).toBeCloseTo((squaredLeg(rig.com.x + epsilon, rig.com.y) - squaredLeg(rig.com.x - epsilon, rig.com.y)) / (2 * epsilon), 4);
      expect(gradient.y).toBeCloseTo((squaredLeg(rig.com.x, rig.com.y + epsilon) - squaredLeg(rig.com.x, rig.com.y - epsilon)) / (2 * epsilon), 4);
    }
  });

  it('singular or unresolved mass maps retain a bounded restoring continuation in every direction', () => {
    const out = { x: 0, y: 0, z: 0 };
    for (const [j00, j01, j10, j11, residual] of [[1, 1, 1, 1, 0], [1, 0, 0, 1e-8, 0], [1, 0, 0, 1, 0.02]]) {
      for (let angle = 0; angle < 2 * Math.PI; angle += 0.2) {
        const gx = Math.cos(angle), gy = Math.sin(angle);
        expect(riderCOMGradient(j00!, j01!, j10!, j11!, residual!, gx, gy, out)).toBe(false);
        expect(out.x * gx + out.y * gy).toBeGreaterThan(1);
        expect(Math.hypot(out.x, out.y)).toBeLessThan(2);
      }
    }
  });

  it('both classes use the authored neutral mass target and map the real gravity sag through the same inverse', () => {
    for (const bike of ['rookie', 'pro'] as const) {
      const world = createBikePhysicsV2(120);
      world.loadTrack(makeTrack(), 1, { bike });
      const state = world.getState(), chain = world.debug().riderChain;
      const c = Math.cos(state.bike.angle), s = Math.sin(state.bike.angle);
      const offset = BIKE_GEOMETRY_V2.chassisToAxle;
      const ox = state.bike.pos.x + offset.x * c - offset.y * s;
      const oy = state.bike.pos.y + offset.x * s + offset.y * c;
      const axle = (p: { x: number; y: number }) => ({ x: (p.x - ox) * c + (p.y - oy) * s, y: -(p.x - ox) * s + (p.y - oy) * c });
      const rig = riderRigFromHips(P.poses[1].hipX, P.poses[1].hipY, P.poses[1].torso * Math.PI / 180, makeRiderRigPose());
      const targetX = ox + rig.com.x * c - rig.com.y * s;
      const targetY = oy + rig.com.x * s + rig.com.y * c;
      // Static spring balance: kp * sag = rider mass * gravity, in world up.
      expect(state.riderBody!.pos.x).toBeCloseTo(targetX, 9);
      expect(targetY - state.riderBody!.pos.y).toBeCloseTo(world.tuning.rider.mass * world.tuning.gravity / world.tuning.rider.kp, 9);
      const com = axle(state.riderBody!.pos);
      const actual = riderRigFromCOM(com.x, com.y, rig.torsoAngle, makeRiderRigPose());
      expect(axle(chain.hips).x).toBeCloseTo(actual.hips.x, 9);
      expect(axle(chain.hips).y).toBeCloseTo(actual.hips.y, 9);
    }
  });
});
