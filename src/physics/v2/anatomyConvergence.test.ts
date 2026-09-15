import { describe, expect, it } from 'vitest';
import { quantizeInput } from '../../core/replay';
import type { PhysicsSnapshot, PhysicsState } from '../../core/types';
import { Game } from '../../game/game';
import type { GameRenderer } from '../../render';
import { makeTrack } from '../testTracks';
import { createBikePhysicsV2, NSCALAR } from './bike';
import { BIKE_GEOMETRY_V2 as G } from './tuning';
import witnesses from './fixtures/anatomy-convergence.json';
import { type RiderRigPose, RIDER_ANKLE, RIDER_HIP, RIDER_REACH } from './rider';

interface Probe {
  positionPass(): void;
  positionSolve(block: boolean): void;
  projectRiderBlock(): number;
  prepareRiderLimits(reset?: boolean): void;
  updateRiderRig(): RiderRigPose;
  riderLimits: { gap: number; nx: number; ny: number; jr: number; jc: number; mass: number }[];
  nC: number;
  px: Float64Array; py: Float64Array; an: Float64Array; im: Float64Array; ii: Float64Array;
  p0x: Float64Array; p0y: Float64Array; a0: Float64Array;
  cA: Int32Array; cB: Int32Array;
  cNx: Float64Array; cNy: Float64Array; cRAx: Float64Array; cRAy: Float64Array;
  cRBx: Float64Array; cRBy: Float64Array; cSep0: Float64Array;
}
function restoreWitness(witness: typeof witnesses.witnesses[number]) {
  const world = createBikePhysicsV2(120);
  const game = new Game({ physics: world, renderer: { setTrack() {}, onEvent() {}, setQuality() {}, setBikeClass() {} } as unknown as GameRenderer, physicsHz: 120, autoSkipCountdown: true, autoRecord: false, ghostEnabled: false });
  game.loadTrack(witness.header.trackId, witness.header.seed, witness.header.bike as 'rookie' | 'pro');
  const bytes = Buffer.from(witness.f64Base64, 'base64');
  const snapshot: PhysicsSnapshot = { v: 1, f64: new Float64Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), u8: Uint8Array.from(witness.u8) };
  world.restore(snapshot);
  const probe = world as unknown as Probe;
  probe.nC = witness.nC;
  for (const [field, values] of Object.entries(witness.cache)) (probe as unknown as Record<string, Float64Array>)[field]!.set(values);
  return { world, probe, snapshot };
}
function gaps(rig: RiderRigPose): number[] {
  const arm = Math.hypot(rig.shoulders.x - rig.wrist.x, rig.shoulders.y - rig.wrist.y);
  const leg = Math.hypot(rig.hips.x - rig.ankle.x, rig.hips.y - rig.ankle.y);
  const ankle = Math.atan2(rig.knee.y - rig.ankle.y, rig.knee.x - rig.ankle.x);
  const rawHip = rig.torsoAngle - Math.atan2(rig.knee.y - rig.hips.y, rig.knee.x - rig.hips.x);
  const hip = Math.atan2(Math.sin(rawHip), Math.cos(rawHip));
  return [RIDER_REACH.armMax - arm, RIDER_REACH.legMax - leg, leg - RIDER_REACH.legMin, ankle - RIDER_ANKLE.min, RIDER_ANKLE.max - ankle, hip - RIDER_HIP.min, RIDER_HIP.max - hip, arm - RIDER_REACH.armMin];
}
function jointErrors(state: PhysicsState): number[] {
  const c = Math.cos(state.bike.angle), s = Math.sin(state.bike.angle);
  const local = (p: { x: number; y: number }) => ({ x: (p.x - state.bike.pos.x) * c + (p.y - state.bike.pos.y) * s - G.chassisToAxle.x, y: -(p.x - state.bike.pos.x) * s + (p.y - state.bike.pos.y) * c - G.chassisToAxle.y });
  const rear = local(state.wheels.rear.pos), front = local(state.wheels.front.pos);
  return [Math.abs(Math.hypot(rear.x - G.swingPivot.x, rear.y - G.swingPivot.y) - G.swingRadius), Math.abs((front.x - 0.65) * G.forkAxis.y - front.y * G.forkAxis.x)];
}
function contactDeficit(p: Probe, slop: number): number {
  let worst = 0;
  for (let i = 0; i < p.nC; i++) {
    const a = p.cA[i]!, b = p.cB[i]!, nx = p.cNx[i]!, ny = p.cNy[i]!;
    let gap = p.cSep0[i]! + slop + (p.px[a]! - p.p0x[a]!) * nx + (p.py[a]! - p.p0y[a]!) * ny + (p.an[a]! - p.a0[a]!) * (p.cRAx[i]! * ny - p.cRAy[i]! * nx);
    if (b >= 0) gap -= (p.px[b]! - p.p0x[b]!) * nx + (p.py[b]! - p.p0y[b]!) * ny + (p.an[b]! - p.a0[b]!) * (p.cRBx[i]! * ny - p.cRBy[i]! * nx);
    worst = Math.max(worst, -gap);
  }
  return worst;
}
function velocityBytes(s: PhysicsSnapshot): Uint8Array {
  const n = (s.f64.length - NSCALAR) / 8, values = new Float64Array(n * 3);
  for (const [i, column] of [2, 3, 5].entries()) values.set(s.f64.subarray(NSCALAR + column * n, NSCALAR + (column + 1) * n), i * n);
  return new Uint8Array(values.buffer);
}
function assembly(s: PhysicsSnapshot): { x: number; y: number; px: number; py: number; energy: number } {
  const n = (s.f64.length - NSCALAR) / 8, f = (column: number, body: number) => s.f64[NSCALAR + column * n + body]!;
  const out = { x: 0, y: 0, px: 0, py: 0, energy: 0 };
  for (let b = 0; b < 4; b++) {
    out.x += f(0, b) / f(6, b); out.y += f(1, b) / f(6, b);
    out.px += f(2, b) / f(6, b); out.py += f(3, b) / f(6, b);
    out.energy += 0.5 * ((f(2, b) ** 2 + f(3, b) ** 2) / f(6, b) + f(5, b) ** 2 / f(7, b));
  }
  return out;
}

describe('bounded anatomical convergence continuation', () => {
  it('closes saved ankle/hip and arm deficits with wheel/contact closure and exact replay', () => {
    for (const witness of witnesses.witnesses) {
      const { world, probe, snapshot } = restoreWitness(witness);
      expect(Math.min(...witness.gaps)).toBeLessThan(-1e-6);
      probe.positionSolve(false);
      expect(Math.min(...gaps(probe.updateRiderRig()))).toBeLessThan(-1e-6);
      world.restore(snapshot);
      const block = probe.projectRiderBlock.bind(probe);
      let blocks = 0;
      probe.projectRiderBlock = () => { blocks++; return block(); };
      probe.positionPass();
      expect(blocks).toBeGreaterThan(0);
      expect(blocks).toBeLessThanOrEqual(64);
      expect(Math.min(...gaps(probe.updateRiderRig()))).toBeGreaterThanOrEqual(-1e-6);
      expect(probe.updateRiderRig().residual).toBeLessThan(1e-9);
      expect(Math.max(...jointErrors(world.getState()))).toBeLessThan(2e-6);
      expect(contactDeficit(probe, world.tuning.solver.slop)).toBeLessThan(2e-6);
      const after = world.snapshot();
      expect(velocityBytes(after)).toEqual(velocityBytes(snapshot));
      world.restore(snapshot); probe.positionPass();
      expect(new Uint8Array(world.snapshot().f64.buffer)).toEqual(new Uint8Array(after.f64.buffer));
      expect(world.snapshot().u8).toEqual(after.u8);
    }
  });

  it('preserves mass-weighted free assembly position, momentum, kinetic energy and all velocity bytes', () => {
    const { world, probe, snapshot } = restoreWitness(witnesses.witnesses[0]!);
    probe.nC = 0;
    const before = assembly(snapshot);
    probe.positionPass();
    const after = world.snapshot(), result = assembly(after);
    expect(result.x).toBeCloseTo(before.x, 10); expect(result.y).toBeCloseTo(before.y, 10);
    expect(result.px).toBe(before.px); expect(result.py).toBe(before.py); expect(result.energy).toBe(before.energy);
    expect(velocityBytes(after)).toEqual(velocityBytes(snapshot));
    expect(Math.min(...gaps(probe.updateRiderRig()))).toBeGreaterThanOrEqual(-1e-6);
    expect(Math.max(...jointErrors(world.getState()))).toBeLessThan(2e-6);
  });

  it('bounds each block correction and balances its paired translational and angular virtual impulses', () => {
    const { world, probe, snapshot } = restoreWitness(witnesses.witnesses[0]!);
    const before = { x: [...probe.px], y: [...probe.py], a: [...probe.an] };
    probe.projectRiderBlock();
    let x = 0, y = 0, angular = 0;
    for (const b of [0, 3]) {
      const dx = probe.px[b]! - before.x[b]!, dy = probe.py[b]! - before.y[b]!, da = probe.an[b]! - before.a[b]!;
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(0.010000000001);
      expect(Math.abs(da)).toBeLessThanOrEqual(0.020000000001);
      x += dx / probe.im[b]!; y += dy / probe.im[b]!;
      angular += (before.x[b]! * dy - before.y[b]! * dx) / probe.im[b]! + da / probe.ii[b]!;
    }
    expect(x).toBeCloseTo(0, 10); expect(y).toBeCloseTo(0, 10); expect(angular).toBeCloseTo(0, 9);
    expect(velocityBytes(world.snapshot())).toEqual(velocityBytes(snapshot));
  });

  it('leaves already-converged ticks byte-identical to the unchanged ordinary position solve', () => {
    const candidate = createBikePhysicsV2(120), ordinary = createBikePhysicsV2(120);
    for (const world of [candidate, ordinary]) world.loadTrack(makeTrack({ finishX: 1e9 }), 31);
    const a = candidate as unknown as Probe, b = ordinary as unknown as Probe;
    b.positionPass = () => b.positionSolve(false);
    let blocks = 0;
    const block = a.projectRiderBlock.bind(a);
    a.projectRiderBlock = () => { blocks++; return block(); };
    for (let tick = 0; tick < 800; tick++) {
      const input = quantizeInput({});
      candidate.step(input); ordinary.step(input);
      expect(new Uint8Array(candidate.snapshot().f64.buffer)).toEqual(new Uint8Array(ordinary.snapshot().f64.buffer));
      expect(candidate.snapshot().u8).toEqual(ordinary.snapshot().u8);
    }
    expect(blocks).toBe(0);
  });

  it('handles an infeasible singular linearization with bounded finite recovery, without claiming closure', () => {
    const { world, probe, snapshot } = restoreWitness(witnesses.witnesses[0]!);
    probe.prepareRiderLimits = () => {};
    for (const q of probe.riderLimits) Object.assign(q, { gap: 1, nx: 0, ny: 0, jr: 0, jc: 0, mass: 0 });
    for (const [i, nx] of [1, -1].entries()) Object.assign(probe.riderLimits[i]!, { gap: -1, nx, mass: 1 / (probe.im[0]! + probe.im[3]!) });
    for (let pass = 0; pass < 64; pass++) {
      const beforeX = [...probe.px], beforeY = [...probe.py], beforeA = [...probe.an];
      expect(probe.projectRiderBlock()).toBe(1);
      for (const b of [0, 3]) {
        expect(Math.hypot(probe.px[b]! - beforeX[b]!, probe.py[b]! - beforeY[b]!)).toBeLessThanOrEqual(0.010000000001);
        expect(Math.abs(probe.an[b]! - beforeA[b]!)).toBeLessThanOrEqual(0.020000000001);
      }
    }
    // Scalar finishTime is deliberately NaN before a finish; body data must remain finite.
    expect(world.snapshot().f64.subarray(NSCALAR).every(Number.isFinite)).toBe(true);
    expect(velocityBytes(world.snapshot())).toEqual(velocityBytes(snapshot));
  });

  it('recovers perturbed invalid poses around each real witness without changing velocity bytes', () => {
    // 81 independent starts: +/-10 cm COM displacement and +/-0.3 rad torso rotation.
    // These are local recovery probes, not a claim of global nonlinear convergence.
    for (const witness of witnesses.witnesses) {
      const { world, probe, snapshot } = restoreWitness(witness);
      for (const dx of [-0.1, 0, 0.1]) for (const dy of [-0.1, 0, 0.1]) for (const angle of [-0.3, 0, 0.3]) {
        world.restore(snapshot);
        probe.px[3] = probe.px[3]! + dx; probe.py[3] = probe.py[3]! + dy; probe.an[3] = probe.an[3]! + angle;
        probe.positionPass();
        expect(Math.min(...gaps(probe.updateRiderRig()))).toBeGreaterThanOrEqual(-1e-6);
        expect(probe.updateRiderRig().residual).toBeLessThan(1e-9);
        expect(world.snapshot().f64.subarray(NSCALAR).every(Number.isFinite)).toBe(true);
        expect(velocityBytes(world.snapshot())).toEqual(velocityBytes(snapshot));
      }
    }
  });
});
