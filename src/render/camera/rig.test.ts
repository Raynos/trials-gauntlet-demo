import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { PhysicsState } from '../../core/types';
import { FrameBuilder } from '../frame';
import { CameraRig, ORBIT } from './rig';

/** A parked bike (the menu / garage backdrop state), stepped through a few identical frames. */
function parked(tick: number): PhysicsState {
  return {
    tick, time: tick / 120,
    bike: { pos: { x: 12, y: 1.4 }, vel: { x: 0, y: 0 }, angle: 0, angVel: 0 },
    wheels: {
      rear: { pos: { x: 11.35, y: 1.1 }, spin: 0, spinVel: 0, compression: 0, grounded: true },
      front: { pos: { x: 12.65, y: 1.1 }, spin: 0, spinVel: 0, compression: 0, grounded: true },
    },
    rider: { lean: 0, crouch: 0, torsoPitch: 0, armExtend: 0 },
    riderBody: { pos: { x: 11.7, y: 2.0 }, vel: { x: 0, y: 0 }, angle: 0, angVel: 0 },
    checkpoint: -1, finished: false, faulted: null, finishTime: null,
    input: { throttle: 0, brake: 0, lean: 0 }, engine: { rpm: 1500, throttleEff: 0, limiter: false },
    contacts: { rear: 'concrete', front: 'concrete' }, rearSlip: 0, hopPhase: 'idle',
    ragdoll: null, seesaws: [], drums: [],
  };
}

function settle(rig: CameraRig, frames: FrameBuilder, n: number, from = 0): void {
  for (let i = 0; i < n; i++) rig.update(frames.build(parked(from + i), 1));
}

const pose = (rig: CameraRig): number[] => [...rig.camera.position.toArray(), ...rig.camera.quaternion.toArray(), rig.camera.fov];

describe('camera rig orbit override (garage model explorer)', () => {
  it('orbits the hero centre at the requested yaw / pitch / distance and looks at it', () => {
    const rig = new CameraRig();
    rig.setAspect(932 / 430);
    rig.setPhase('menu');
    const frames = new FrameBuilder();
    settle(rig, frames, 5);
    rig.setOverride({ mode: 'orbit', yaw: 0.6, pitch: 0.2, dist: 6, screenY: 0.5 });
    rig.update(frames.build(parked(5), 1));
    const aim = new THREE.Vector3(12, 1.4 + 0.45, 0);
    const cam = rig.camera;
    expect(cam.position.distanceTo(aim)).toBeCloseTo(6, 6);
    // Position on the sphere: +x side for a positive yaw, above the aim for a positive pitch.
    expect(cam.position.x).toBeGreaterThan(aim.x);
    expect(cam.position.y).toBeGreaterThan(aim.y);
    expect(cam.position.z).toBeGreaterThan(0);
    // The forward axis points at the aim.
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const toAim = aim.clone().sub(cam.position).normalize();
    expect(fwd.dot(toAim)).toBeCloseTo(1, 6);
    expect(cam.fov).toBeCloseTo(ORBIT.fov * (180 / Math.PI), 6);
    // The aim projects to the frame centre at screenY 0.5 …
    const p = aim.clone().project(cam);
    expect(Math.abs(p.x)).toBeLessThan(1e-6);
    expect(Math.abs(p.y)).toBeLessThan(1e-6);
    // … and above centre with a smaller screenY (0 = top edge).
    rig.setOverride({ mode: 'orbit', yaw: 0.6, pitch: 0.2, dist: 6, screenY: 0.37 });
    rig.update(frames.build(parked(6), 1));
    const p2 = aim.clone().project(rig.camera);
    expect((1 - p2.y) / 2).toBeCloseTo(0.37, 4);
  });

  it('clamps pitch and distance to the explorer limits', () => {
    const rig = new CameraRig();
    rig.setAspect(2);
    rig.setPhase('menu');
    const frames = new FrameBuilder();
    settle(rig, frames, 3);
    rig.setOverride({ mode: 'orbit', yaw: 0, pitch: 3, dist: 100 });
    rig.update(frames.build(parked(3), 1));
    const aim = new THREE.Vector3(12, 1.85, 0);
    expect(rig.camera.position.distanceTo(aim)).toBeCloseTo(ORBIT.distMax, 6);
    expect(Math.asin((rig.camera.position.y - aim.y) / ORBIT.distMax)).toBeCloseTo(ORBIT.pitchMax, 6);
    rig.setOverride({ mode: 'orbit', yaw: 0, pitch: -3, dist: 0 });
    rig.update(frames.build(parked(4), 1));
    expect(rig.camera.position.distanceTo(aim)).toBeCloseTo(ORBIT.distMin, 6);
    expect(Math.asin((rig.camera.position.y - aim.y) / ORBIT.distMin)).toBeCloseTo(ORBIT.pitchMin, 6);
  });

  it('setOverride(null) restores the rig pose exactly — the rig integrates underneath the orbit', () => {
    const a = new CameraRig();
    const b = new CameraRig();
    for (const r of [a, b]) {
      r.setAspect(844 / 390);
      r.setPhase('menu');
    }
    const fa = new FrameBuilder();
    const fb = new FrameBuilder();
    settle(a, fa, 10);
    settle(b, fb, 10);
    expect(pose(a)).toEqual(pose(b));
    // b spends 30 frames in the orbit, a never leaves the game camera.
    b.setOverride({ mode: 'orbit', yaw: 2.4, pitch: 0.5, dist: 4 });
    for (let i = 10; i < 40; i++) {
      a.update(fa.build(parked(i), 1));
      b.update(fb.build(parked(i), 1));
    }
    expect(pose(a)).not.toEqual(pose(b));
    b.setOverride(null);
    a.update(fa.build(parked(40), 1));
    b.update(fb.build(parked(40), 1));
    expect(pose(b)).toEqual(pose(a));
    expect(b.overrideMode).toBeNull();
  });
});
