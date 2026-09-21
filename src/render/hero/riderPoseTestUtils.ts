/** Shared test instruments: inspect decoded bone matrices, not renderer claims. */
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { expect } from 'vitest';
import type { BikeClass } from '../../core/types';
import { makeRiderRigPose, riderRigFromHips, RIDER_TORSO_REST } from './riderRig';
import { BIKE_GEOMETRY_V2 } from './assetFrame';
import type { HeroBike } from '../bike/bikeModel';
import { FrameBuilder, type RenderFrame } from '../frame';
import type { MaterialLibrary } from '../materials/library';
import { GltfBike } from './gltfBike';
import { boneName, GltfRider } from './gltfRider';
export function fixture(gltf: GLTF, cls: BikeClass, bikeGltf?: GLTF) {
  const bike = bikeGltf ? new GltfBike(bikeGltf, { complete() {} } as unknown as MaterialLibrary) : null;
  const frame = bike?.frame ?? new THREE.Group();
  const rider = new GltfRider(gltf, { complete() {} } as unknown as MaterialLibrary);
  rider.attach({ frame } as HeroBike);
  rider.setLivery(cls);
  const nodes = new Map<string, THREE.Object3D>();
  frame.traverse(o => nodes.set(boneName(o.name), o));
  const point = (name: string) => frame.worldToLocal(nodes.get(name)!.getWorldPosition(new THREE.Vector3()));
  const direction = (name: string) => {
    const matrix = new THREE.Matrix4().copy(frame.matrixWorld).invert().multiply(nodes.get(name)!.matrixWorld);
    return new THREE.Vector3(0, 1, 0).transformDirection(matrix);
  };
  const update = (f: RenderFrame) => {
    const offset = BIKE_GEOMETRY_V2.chassisToAxle;
    const c = Math.cos(f.bikeAngle), s = Math.sin(f.bikeAngle);
    frame.position.set(f.bikeX + offset.x * c - offset.y * s, f.bikeY + offset.x * s + offset.y * c, 0);
    frame.rotation.z = f.bikeAngle;
    frame.updateMatrixWorld(true);
    rider.update(f);
    frame.updateMatrixWorld(true);
    rider.root.updateMatrixWorld(true);
  };
  const snapshot = () => Array.from(nodes.values()).flatMap(n => n.matrixWorld.elements.slice());
  return { rider, frame, nodes, point, direction, update, snapshot, bike };
}
type Rig = ReturnType<typeof fixture>;

/** Reconstruct the declared segment-mass model from actual decoded/posed bone matrices.
 * No inverse-map, chain debug field or renderer's claimed COM contributes to this measurement.
 * The 2 cm pelvis→hips and 17.5 cm shoulder→head/neck mass center are authoring landmarks;
 * masses/centroid fractions are the profile contract, independent of outfit surface volume. */
export function measuredCOM(rig: Rig): THREE.Vector3 {
  const hips = rig.point('pelvis').addScaledVector(rig.direction('pelvis'), .02);
  const shoulder = rig.point('neck');
  const sum = new THREE.Vector3().lerpVectors(hips, shoulder, .5).multiplyScalar(.4346);
  sum.addScaledVector(shoulder.clone().addScaledVector(rig.direction('neck'), .175), .0694);
  for (const side of ['L', 'R']) {
    for (const [a, b, fraction, mass] of [
      ['upperArm', 'forearm', .5772, .0271], ['forearm', 'hand', .4574, .0162],
      ['thigh', 'shin', .4095, .1416], ['shin', 'foot', .4395, .0433],
    ] as const) sum.addScaledVector(rig.point(`${a}.${side}`).lerp(rig.point(`${b}.${side}`), fraction), mass);
    sum.addScaledVector(rig.point(`gripSocket.${side}`), .0061);
    sum.addScaledVector(rig.point(`foot.${side}`).add(new THREE.Vector3(.06, -.055, 0)), .0137);
  }
  return sum;
}

/** Worst-case contact / segment / mass errors of one posed frame, in metres (elbowPole is a signed dot, must be >= 0). */
interface PoseErrors { grip: number; sole: number; length: number; elbowPole: number; com: number; }

export function measureContactsAndMass(rig: Rig, f: RenderFrame): PoseErrors {
  const e: PoseErrors = { grip: 0, sole: 0, length: 0, elbowPole: Infinity, com: 0 };
  for (const [side, sign] of [['L', 1], ['R', -1]] as const) {
    e.grip = Math.max(e.grip, rig.point(`gripSocket.${side}`).distanceTo(new THREE.Vector3(.27, .78, sign * .33)));
    // The sole rests on the peg's 11 mm upper surface, not its axis.
    e.sole = Math.max(e.sole, rig.point(`soleSocket.${side}`).distanceTo(new THREE.Vector3(-.14, .031, sign * .2)));
    for (const [a, b, length] of [['upperArm', 'forearm', .32], ['forearm', 'hand', .27], ['thigh', 'shin', .46], ['shin', 'foot', .43]] as const) {
      e.length = Math.max(e.length, Math.abs(rig.point(`${a}.${side}`).distanceTo(rig.point(`${b}.${side}`)) - length));
    }
    // Rearward/neutral keep their original pole. In the high standing pose the
    // elbow bends behind the wrist rather than hooking the forearm under the chest.
    const shoulder = rig.point(`upperArm.${side}`), elbow = rig.point(`forearm.${side}`), wrist = rig.point(`hand.${side}`);
    const axis = wrist.sub(shoulder).normalize(), bend = elbow.sub(shoulder);
    bend.addScaledVector(axis, -bend.dot(axis));
    const hips = rig.point('pelvis').addScaledVector(rig.direction('pelvis'), .02);
    const h = THREE.MathUtils.clamp((hips.y - .78) / .14, 0, 1);
    const x = THREE.MathUtils.clamp((hips.x + .4) / .12, 0, 1);
    const blend = h * h * (3 - 2 * h) * x * x * (3 - 2 * x);
    const pole = new THREE.Vector3(.3 - .6 * blend, -1, .15 * sign);
    pole.addScaledVector(axis, -pole.dot(axis));
    e.elbowPole = Math.min(e.elbowPole, bend.dot(pole));
  }
  const offset = BIKE_GEOMETRY_V2.chassisToAxle;
  const desired = new THREE.Vector3(f.riderBody.relX - offset.x, f.riderBody.relY - offset.y, 0);
  e.com = measuredCOM(rig).distanceTo(desired);
  return e;
}

export function expectContactsAndMass(rig: Rig, f: RenderFrame, context: string, bounds: PoseErrors = { grip: 1e-5, sole: 1e-5, length: 1e-6, elbowPole: -1e-6, com: 1e-5 }): PoseErrors {
  expect(rig.rider.debug.physicalPose, context).toBe(true);
  const e = measureContactsAndMass(rig, f);
  expect(e.grip, `grip ${context}`).toBeLessThan(bounds.grip);
  expect(e.sole, `sole ${context}`).toBeLessThan(bounds.sole);
  expect(e.length, `length ${context}`).toBeLessThan(bounds.length);
  expect(e.elbowPole, `elbow pole ${context}`).toBeGreaterThan(bounds.elbowPole);
  expect(e.com, `measured COM ${context}`).toBeLessThan(bounds.com);
  expect(rig.snapshot().every(Number.isFinite), context).toBe(true);
  return e;
}

export function poseFrame(hipX: number, hipY: number, torsoDegrees: number, angle: number): RenderFrame {
  const pose = riderRigFromHips(hipX, hipY, torsoDegrees * Math.PI / 180, makeRiderRigPose());
  const f = new FrameBuilder().frame;
  f.bikeX = 4; f.bikeY = 2; f.bikeAngle = angle;
  f.riderBody.present = true;
  f.riderBody.relX = pose.com.x + BIKE_GEOMETRY_V2.chassisToAxle.x;
  f.riderBody.relY = pose.com.y + BIKE_GEOMETRY_V2.chassisToAxle.y;
  f.riderBody.relAngle = torsoDegrees * Math.PI / 180 - RIDER_TORSO_REST;
  f.dt = 1 / 60; f.speed = 10;
  return f;
}
