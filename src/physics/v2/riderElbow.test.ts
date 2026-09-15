import { describe, expect, it } from 'vitest';
import { decodeJSON, iterateFrames, quantizeInput } from '../../core/replay';
import type { PhysicsSnapshot } from '../../core/types';
import { Game, type GameCounters } from '../../game/game';
import type { GameRenderer } from '../../render';
import { createBikePhysicsV2, NSCALAR } from './bike';
import { BIKE_GEOMETRY_V2 } from './tuning';
import { makeRiderRigPose, riderCOMGradient, riderRigFromCOM, riderRigFromHips, RIDER_ANKLE, RIDER_ELBOW_MIN, RIDER_HIP, RIDER_PROFILE as P, RIDER_REACH, RIDER_TORSO_REST, type RiderRigPose } from './rider';
import witness from './fixtures/x1-elbow-pole.json';
import x1Recording from '../../../harness/inputs/x1-vertical-limit/bot-3-pro.json';

interface LimitProbe {
  prepareRiderLimits(): void;
  projectRiderLimits(): void;
  solveRiderLimits(): void;
  riderLimits: { gap: number; nx: number; ny: number; jr: number; impulse: number }[];
}
function restoreWitness() {
  const world = createBikePhysicsV2(120);
  const game = new Game({ physics: world, renderer: { setTrack() {}, onEvent() {}, setQuality() {}, setBikeClass() {} } as unknown as GameRenderer, physicsHz: 120, autoSkipCountdown: true, autoRecord: false, ghostEnabled: false });
  game.loadTrack(witness.trackId, witness.seed, 'pro');
  const bytes = Buffer.from(witness.f64Base64, 'base64');
  const snapshot: PhysicsSnapshot = { v: 1, f64: new Float64Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), u8: Uint8Array.from(witness.u8) };
  game.restore(snapshot); game.restoreCounters(witness.counters as GameCounters);
  return { world, game, snapshot, probe: world as unknown as LimitProbe };
}
function physicalRig(world: ReturnType<typeof createBikePhysicsV2>): RiderRigPose {
  const state = world.getState(), c = Math.cos(state.bike.angle), s = Math.sin(state.bike.angle), body = state.riderBody!;
  const x = body.pos.x - state.bike.pos.x, y = body.pos.y - state.bike.pos.y;
  const relative = Math.atan2(Math.sin(body.angle - state.bike.angle), Math.cos(body.angle - state.bike.angle));
  return riderRigFromCOM(x * c + y * s - BIKE_GEOMETRY_V2.chassisToAxle.x, -x * s + y * c - BIKE_GEOMETRY_V2.chassisToAxle.y, RIDER_TORSO_REST + relative, makeRiderRigPose());
}
const armGap = (p: RiderRigPose) => Math.hypot(p.shoulders.x - p.wrist.x, p.shoulders.y - p.wrist.y) - RIDER_REACH.armMin;

/** Independently sum segment centroids after moving hips/torso while elbows and knees stay
 * fixed. This tests the declared recovery differential, including its angular coordinate. */
function fixedJointCOM(base: RiderRigPose, x: number, y: number, torso: number): { x: number; y: number } {
  const pose = riderRigFromHips(x, y, torso, makeRiderRigPose()), out = { x: 0, y: 0 };
  const add = (mass: number, a: { x: number; y: number }, b: { x: number; y: number }, fraction: number) => {
    out.x += mass * (a.x + fraction * (b.x - a.x));
    out.y += mass * (a.y + fraction * (b.y - a.y));
  };
  add(P.mass.trunk, pose.hips, pose.shoulders, P.comFraction.trunk);
  add(P.mass.headNeck, pose.shoulders, { x: pose.shoulders.x + P.headNeckLength * Math.cos(pose.headAngle), y: pose.shoulders.y + P.headNeckLength * Math.sin(pose.headAngle) }, P.comFraction.headNeck);
  add(2 * P.mass.upperArm, pose.shoulders, base.elbow, P.comFraction.upperArm);
  add(2 * P.mass.forearm, base.elbow, base.wrist, P.comFraction.forearm);
  add(2 * P.mass.hand, base.grip, base.grip, 0);
  add(2 * P.mass.thigh, pose.hips, base.knee, P.comFraction.thigh);
  add(2 * P.mass.shin, base.knee, base.ankle, P.comFraction.shin);
  add(2 * P.mass.foot, { x: base.ankle.x + P.footCentroidFromAnkle.x, y: base.ankle.y + P.footCentroidFromAnkle.y }, base.ankle, 0);
  return out;
}

describe('minimum elbow opening', () => {
  it('excludes the pole singularity with a geometric margin while every authored target stays inside the stops', () => {
    expect(RIDER_ELBOW_MIN).toBe(35 * Math.PI / 180);
    const side = P.grip.z - P.shoulderHalf;
    const minimumDistance = Math.sqrt(P.upperArm ** 2 + P.forearm ** 2 - 2 * P.upperArm * P.forearm * Math.cos(RIDER_ELBOW_MIN));
    expect(Math.hypot(RIDER_REACH.armMin, side)).toBeCloseTo(minimumDistance, 12);
    // The fixed pole's polar angle is acos(1/|(.6,.5,1)|). At any permitted distance,
    // direction.z <= side/minimumDistance, so their separation cannot approach zero.
    const poleNorm = Math.hypot(0.6, 0.5, 1);
    const separation = Math.acos(side / minimumDistance) - Math.acos(1 / poleNorm);
    expect(poleNorm * Math.sin(separation)).toBeGreaterThan(0.247);
    for (const p of P.poses) {
      const rig = riderRigFromHips(p.hipX, p.hipY, p.torso * Math.PI / 180, makeRiderRigPose());
      expect(armGap(rig)).toBeGreaterThan(0.1);
      expect(rig.armReach).toBeLessThan(0.995);
    }
  });

  it('keeps the forward pose continuous and the ordinary COM derivatives accurate across the new boundary', () => {
    const rig = makeRiderRigPose(), probe = makeRiderRigPose(), inverse = makeRiderRigPose(), gradient = { x: 0, y: 0, z: 0 };
    const epsilon = 1e-6;
    let checked = 0, worstResidual = 0, worstDerivative = 0, largestElbowStep = 0;
    for (let degrees = 20; degrees <= 70; degrees += 2) for (let azimuth = 0; azimuth < 360; azimuth += 2) {
      const torso = degrees * Math.PI / 180, ux = Math.cos(azimuth * Math.PI / 180), uy = Math.sin(azimuth * Math.PI / 180);
      const hx = P.grip.x + P.wristFromGrip.x + RIDER_REACH.armMin * ux - P.torso * Math.cos(torso);
      const hy = P.grip.y + P.wristFromGrip.y + RIDER_REACH.armMin * uy - P.torso * Math.sin(torso);
      riderRigFromHips(hx, hy, torso, rig);
      const leg = Math.hypot(rig.hips.x - rig.ankle.x, rig.hips.y - rig.ankle.y);
      const ankle = Math.atan2(rig.knee.y - rig.ankle.y, rig.knee.x - rig.ankle.x);
      const hip = torso - Math.atan2(rig.knee.y - rig.hips.y, rig.knee.x - rig.hips.x);
      if (leg < RIDER_REACH.legMin || leg > RIDER_REACH.legMax || ankle < RIDER_ANKLE.min || ankle > RIDER_ANKLE.max || hip < RIDER_HIP.min || hip > RIDER_HIP.max) continue;
      checked++;
      riderRigFromHips(hx + epsilon, hy, torso, probe);
      const j00 = (probe.com.x - rig.com.x) / epsilon, j10 = (probe.com.y - rig.com.y) / epsilon;
      riderRigFromHips(hx, hy + epsilon, torso, probe);
      const j01 = (probe.com.x - rig.com.x) / epsilon, j11 = (probe.com.y - rig.com.y) / epsilon;
      expect(riderCOMGradient(j00, j01, j10, j11, 0, ux, uy, gradient)).toBe(true);
      for (const axis of ['x', 'y'] as const) {
        riderRigFromCOM(rig.com.x + (axis === 'x' ? epsilon : 0), rig.com.y + (axis === 'y' ? epsilon : 0), torso, inverse);
        const plus = armGap(inverse);
        worstResidual = Math.max(worstResidual, inverse.residual);
        riderRigFromCOM(rig.com.x - (axis === 'x' ? epsilon : 0), rig.com.y - (axis === 'y' ? epsilon : 0), torso, inverse);
        worstResidual = Math.max(worstResidual, inverse.residual);
        worstDerivative = Math.max(worstDerivative, Math.abs(gradient[axis] - (plus - armGap(inverse)) / (2 * epsilon)));
      }
      riderRigFromHips(hx - epsilon * ux, hy - epsilon * uy, torso, probe);
      const lower = { ...probe.elbow };
      riderRigFromHips(hx + epsilon * ux, hy + epsilon * uy, torso, probe);
      largestElbowStep = Math.max(largestElbowStep, Math.hypot(probe.elbow.x - lower.x, probe.elbow.y - lower.y, probe.elbow.z - lower.z));
    }
    expect(checked).toBeGreaterThan(1000);
    expect(worstResidual).toBeLessThan(1e-9);
    expect(worstDerivative).toBeLessThan(6e-6);
    expect(largestElbowStep).toBeLessThan(5e-6);
  });

  it('the invalid saved X1 state uses the declared fixed-joint angular differential and escapes the singular map', () => {
    const { world, probe } = restoreWitness();
    const rig = physicalRig(world), epsilon = 1e-6;
    expect(rig.residual).toBeGreaterThan(0.0018);
    probe.prepareRiderLimits();
    const row = probe.riderLimits[7]!;
    expect(row.gap).toBeLessThan(-0.04);
    const state = world.getState(), c = Math.cos(state.bike.angle), s = Math.sin(state.bike.angle);
    const nx = row.nx * c + row.ny * s, ny = -row.nx * s + row.ny * c;
    const plus = fixedJointCOM(rig, rig.hips.x, rig.hips.y, rig.torsoAngle + epsilon), minus = fixedJointCOM(rig, rig.hips.x, rig.hips.y, rig.torsoAngle - epsilon);
    const angleX = (plus.x - minus.x) / (2 * epsilon), angleY = (plus.y - minus.y) / (2 * epsilon);
    const plusGap = armGap(riderRigFromHips(rig.hips.x, rig.hips.y, rig.torsoAngle + epsilon, makeRiderRigPose()));
    const minusGap = armGap(riderRigFromHips(rig.hips.x, rig.hips.y, rig.torsoAngle - epsilon, makeRiderRigPose()));
    expect(row.jr).toBeCloseTo((plusGap - minusGap) / (2 * epsilon) - nx * angleX - ny * angleY, 4);
    const before = world.snapshot(), n = (before.f64.length - NSCALAR) / 8;
    probe.projectRiderLimits();
    const after = world.snapshot(), recovered = physicalRig(world);
    expect(recovered.residual).toBeLessThan(1e-9);
    expect(armGap(recovered)).toBeGreaterThan(-1e-6);
    for (const column of [2, 3, 5]) expect(after.f64.slice(NSCALAR + column * n, NSCALAR + (column + 1) * n)).toEqual(before.f64.slice(NSCALAR + column * n, NSCALAR + (column + 1) * n));
    for (const axis of [0, 1]) {
      const weighted = (snapshot: PhysicsSnapshot) => [0, 3].reduce((sum, body) => sum + snapshot.f64[NSCALAR + axis * n + body]! / snapshot.f64[NSCALAR + 6 * n + body]!, 0);
      expect(weighted(after)).toBeCloseTo(weighted(before), 9);
    }
  });

  it('the new elbow row removes violating velocity without injecting energy or momentum', () => {
    const { world, probe } = restoreWitness();
    probe.prepareRiderLimits();
    const row = probe.riderLimits[7]!;
    const moving = world.snapshot(), n = (moving.f64.length - NSCALAR) / 8;
    for (const body of [0, 3]) for (const column of [2, 3, 5]) moving.f64[NSCALAR + column * n + body] = 0;
    moving.f64[NSCALAR + 2 * n + 3] = -row.nx;
    moving.f64[NSCALAR + 3 * n + 3] = -row.ny;
    moving.f64[NSCALAR + 5 * n + 3] = -row.jr;
    world.restore(moving); probe.prepareRiderLimits();
    const measure = (snapshot: PhysicsSnapshot) => {
      const result = { px: 0, py: 0, angular: 0, energy: 0 };
      for (const body of [0, 3]) {
        const at = (column: number) => snapshot.f64[NSCALAR + column * n + body]!;
        const mass = 1 / at(6), inertia = 1 / at(7), x = at(0), y = at(1), vx = at(2), vy = at(3), angularVelocity = at(5);
        result.px += mass * vx; result.py += mass * vy;
        result.angular += mass * (x * vy - y * vx) + inertia * angularVelocity;
        result.energy += mass * (vx * vx + vy * vy) / 2 + inertia * angularVelocity * angularVelocity / 2;
      }
      return result;
    };
    const before = measure(world.snapshot());
    for (let iteration = 0; iteration < 20; iteration++) probe.solveRiderLimits();
    const after = measure(world.snapshot());
    expect(probe.riderLimits[7]!.impulse).toBeGreaterThan(0);
    expect(after.px).toBeCloseTo(before.px, 10);
    expect(after.py).toBeCloseTo(before.py, 10);
    expect(after.angular).toBeCloseTo(before.angular, 9);
    expect(after.energy).toBeLessThanOrEqual(before.energy + 1e-10);
  });

  it('restoring the old invalid X1 snapshot reproduces recovery bytes and counters exactly', () => {
    const { world, game, snapshot } = restoreWitness();
    let first: PhysicsSnapshot | undefined, firstCounters: GameCounters | undefined;
    for (let run = 0; run < 2; run++) {
      game.restore(snapshot); game.restoreCounters(witness.counters as GameCounters);
      for (let tick = 0; tick < 60; tick++) {
        game.setInput(quantizeInput({})); game.step(1);
        if (tick === 0) {
          const rig = physicalRig(world);
          expect(rig.residual).toBeLessThan(1e-9);
          expect(armGap(rig)).toBeGreaterThan(-1e-6);
        }
      }
      const after = game.snapshot();
      if (first) {
        expect(new Uint8Array(after.f64.buffer)).toEqual(new Uint8Array(first.f64.buffer));
        expect(after.u8).toEqual(first.u8);
        expect(game.counters()).toEqual(firstCounters);
      }
      first = after; firstCounters = game.counters();
    }
  });

  it('the production X1 input reaches the elbow stop and crosses tick 413 with a valid mass map', () => {
    const recording = decodeJSON(JSON.stringify(x1Recording));
    const { world, game } = restoreWitness();
    game.loadTrack(recording.header.trackId, recording.header.seed, 'pro');
    const saved = game.snapshot(), counters = game.counters();
    let first: PhysicsSnapshot | undefined, firstCounters: GameCounters | undefined;
    for (let run = 0; run < 2; run++) {
      game.restore(saved); game.restoreCounters(counters);
      let tick = 0, worstResidual = 0, minimumGap = Infinity;
      for (const input of iterateFrames(recording)) {
        game.setInput(input); game.step(1); tick++;
        if (game.phase() === 'riding') {
          const rig = physicalRig(world);
          worstResidual = Math.max(worstResidual, rig.residual);
          minimumGap = Math.min(minimumGap, armGap(rig));
        }
        if (tick === 413) expect(game.phase()).toBe('riding');
        if (tick === 420) break;
      }
      expect(worstResidual).toBeLessThan(1e-9);
      expect(minimumGap).toBeGreaterThan(-1e-6);
      expect(minimumGap).toBeLessThan(1e-6);
      const after = game.snapshot();
      if (first) {
        expect(new Uint8Array(after.f64.buffer)).toEqual(new Uint8Array(first.f64.buffer));
        expect(after.u8).toEqual(first.u8);
        expect(game.counters()).toEqual(firstCounters);
      }
      first = after; firstCounters = game.counters();
    }
  });
});
