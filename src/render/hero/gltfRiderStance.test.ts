/** The played rider follows the physical mass/geometry map, including small inputs and
 * unreachable impacts. Authored animation remains the garage's separate contract. */
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AVAILABLE_RIDER_PRESETS } from '../../core/riderPresets';
import { makeRiderRigPose, riderPoseAtLean, RIDER_SEAT } from './riderRig';
import { loadRig } from './gltfTestUtils';
import { prepareHero } from './lod';
import { fixture, poseFrame, expectContactsAndMass } from './riderPoseTestUtils';

beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => ({ width: 128, height: 64, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), scale() {}, fillRect() {} }) }) });
});
afterAll(() => vi.unstubAllGlobals());

const subjects = AVAILABLE_RIDER_PRESETS.flatMap(p => [false, true].map(lod => ({ file: `rider-${p.id}${lod ? '-lod' : ''}.glb`, lod })));

describe.each(subjects)('$file shared physical stances', ({ file, lod }) => {
  let gltf: GLTF;
  const bikes = new Map<string, GLTF>();
  beforeAll(async () => {
    gltf = await loadRig(file); await prepareHero(gltf);
    for (const cls of ['rookie', 'pro']) {
      const bike = await loadRig(`bike-${cls}${lod ? '-lod' : ''}.glb`);
      await prepareHero(bike); bikes.set(cls, bike);
    }
  });

  it.each(['rookie', 'pro'] as const)('%s keeps actual bike contacts and independent mass/hip/head landmarks throughout continuous lean transitions', cls => {
    const rig = fixture(gltf, cls, bikes.get(cls));
    const p = makeRiderRigPose();
    const scales = [...rig.nodes.values()].filter(n => (n as THREE.Bone).isBone).map(n => [n, n.scale.clone()] as const);
    for (const angle of [-1.2, 0, 1.2]) for (let step = -40; step <= 40; step++) {
      riderPoseAtLean(step / 40, p);
      const f = poseFrame(p.hips.x, p.hips.y, p.torsoAngle * 180 / Math.PI, angle);
      // Deliberately contradictory legacy drawn metadata cannot overwrite the physical body.
      f.riderBody.drawn = { present: true, pose: 'seated', blend: 0, hipY: .715, torso: 1.1 };
      rig.update(f);
      const context = `${file} ${cls} lean=${step / 40} angle=${angle}`;
      expectContactsAndMass(rig, f, context);
      const hips = rig.point('pelvis').addScaledVector(rig.direction('pelvis'), .02);
      expect(hips.distanceTo(new THREE.Vector3(p.hips.x, p.hips.y, 0)), context).toBeLessThan(1e-5);
      expect(rig.point('neck').distanceTo(new THREE.Vector3(p.shoulders.x, p.shoulders.y, 0)), context).toBeLessThan(1e-5);
      const head = rig.point('neck').addScaledVector(rig.direction('neck'), .22);
      expect(head.distanceTo(new THREE.Vector3(p.head.x, p.head.y, 0)), context).toBeLessThan(1e-5);
      for (const side of ['L', 'R']) {
        expect(rig.point(`gripSocket.${side}`).distanceTo(rig.point(`attach_grip_${side}`)), context).toBeLessThan(1e-5);
        expect(rig.point(`soleSocket.${side}`).distanceTo(rig.point(`attach_peg_${side}`).add(new THREE.Vector3(0, .011, 0))), context).toBeLessThan(1e-5);
        const shoulder = rig.point(`upperArm.${side}`), elbow = rig.point(`forearm.${side}`), wrist = rig.point(`hand.${side}`);
        expect(elbow.y, context).toBeLessThan(shoulder.y);
        expect(shoulder.sub(elbow).angleTo(wrist.sub(elbow)) * 180 / Math.PI, context).toBeLessThan(175);
      }
      for (const [bone, scale] of scales) expect(bone.scale.equals(scale), context).toBe(true);
    }
  });

  it('has seat contact at rest, immediate input response, visible forward rise and rearward clearance', () => {
    const rig = fixture(gltf, 'rookie');
    const points = (lean: number) => {
      const p = riderPoseAtLean(lean, makeRiderRigPose());
      rig.update(poseFrame(p.hips.x, p.hips.y, p.torsoAngle * 180 / Math.PI, 0));
      return { hips: rig.point('pelvis').addScaledVector(rig.direction('pelvis'), .02), chest: rig.point('neck'), bottom: rig.point('pelvis').addScaledVector(rig.direction('pelvis'), -.16) };
    };
    const neutral = points(0), forward = points(1), back = points(-1);
    const clear = Array.from({ length: 41 }, (_, i) => points(-i / 40)).find(p => p.hips.x < RIDER_SEAT.rearX && p.hips.y >= neutral.hips.y - 1e-5)!;
    expect(clear).toBeDefined();
    expect(Math.abs(neutral.bottom.y - RIDER_SEAT.topY)).toBeLessThan(.002);
    expect(neutral.bottom.x).toBeGreaterThan(RIDER_SEAT.rearX);
    expect(neutral.bottom.x).toBeLessThan(RIDER_SEAT.frontX);
    expect(forward.hips.y - neutral.hips.y).toBeGreaterThan(.15);
    // User rejected the low, long chest-over-bars silhouette. The taller forward
    // stance advances the chest while keeping the shoulder behind the grip.
    expect(forward.chest.x - neutral.chest.x).toBeGreaterThan(.25);
    expect(forward.chest.x).toBeLessThan(.245);
    expect(forward.chest.y).toBeGreaterThan(1.3);
    expect(back.hips.x - neutral.hips.x).toBeLessThan(-.3);
    expect(clear.hips.x).toBeLessThan(RIDER_SEAT.rearX);
    expect(clear.hips.y).toBeGreaterThanOrEqual(neutral.hips.y - 1e-5);
    for (const lean of [-.1, .1]) expect(points(lean).hips.distanceTo(neutral.hips)).toBeGreaterThan(.005);
  });

  it('draws an unreachable body honestly with visible contact loss and returns without pose history', () => {
    const rig = fixture(gltf, 'rookie'), fresh = fixture(gltf, 'rookie');
    const impacted = poseFrame(-.7, 1.25, 65, 0);
    rig.update(impacted);
    const hips = rig.point('pelvis').addScaledVector(rig.direction('pelvis'), .02);
    expect(hips.distanceTo(new THREE.Vector3(-.7, 1.25, 0))).toBeLessThan(1e-5);
    expect(rig.rider.debug.gripErr.every(e => e > .2)).toBe(true);
    expect(rig.rider.debug.handOnGrip).toEqual([false, false]);
    expect(rig.rider.debug.footOnPeg).toEqual([false, false]);
    const p = riderPoseAtLean(.4, makeRiderRigPose());
    const recovered = poseFrame(p.hips.x, p.hips.y, p.torsoAngle * 180 / Math.PI, .3);
    rig.update(recovered); fresh.update(recovered);
    expect(rig.snapshot()).toEqual(fresh.snapshot());
    expectContactsAndMass(rig, recovered, 'recovered');
  });
});
