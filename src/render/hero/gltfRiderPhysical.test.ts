import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { InputRecording } from '../../core/replay';
import type { BikeClass } from '../../core/types';
import { Game } from '../../game/game';
import { createBikePhysicsV2 } from '../../physics/v2/bike';
import { makeRiderRigPose, riderRigFromHips } from '../../physics/v2/rider';
import { BIKE_GEOMETRY_V2 } from '../../physics/v2/tuning';
import type { HeroBike } from '../bike/bikeModel';
import { FrameBuilder, type RenderFrame } from '../frame';
import type { GameRenderer } from '../index';
import type { MaterialLibrary } from '../materials/library';
import { boneName, GltfRider } from './gltfRider';
import { loadRig } from './gltfTestUtils';

function fixture(gltf: GLTF, cls: BikeClass) {
  const frame = new THREE.Group();
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
  return { rider, frame, nodes, point, direction, update, snapshot };
}
type Rig = ReturnType<typeof fixture>;

/** Reconstruct the declared segment-mass model from actual decoded/posed bone matrices.
 * No inverse-map, chain debug field or renderer's claimed COM contributes to this measurement.
 * The 2 cm pelvis→hips and 17.5 cm shoulder→head/neck mass center are authoring landmarks;
 * masses/centroid fractions are the profile contract, independent of outfit surface volume. */
function measuredCOM(rig: Rig): THREE.Vector3 {
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

function expectContactsAndMass(rig: Rig, f: RenderFrame, context: string): void {
  expect(rig.rider.debug.physicalPose, context).toBe(true);
  for (const [side, sign] of [['L', 1], ['R', -1]] as const) {
    expect(rig.point(`gripSocket.${side}`).distanceTo(new THREE.Vector3(.27, .78, sign * .33)), `grip ${context}`).toBeLessThan(1e-5);
    // The sole rests on the peg's 11 mm upper surface, not its axis.
    expect(rig.point(`soleSocket.${side}`).distanceTo(new THREE.Vector3(-.14, .031, sign * .2)), `sole ${context}`).toBeLessThan(1e-5);
    for (const [a, b, length] of [['upperArm', 'forearm', .32], ['forearm', 'hand', .27], ['thigh', 'shin', .46], ['shin', 'foot', .43]] as const) {
      expect(Math.abs(rig.point(`${a}.${side}`).distanceTo(rig.point(`${b}.${side}`)) - length), `length ${a} ${context}`).toBeLessThan(1e-6);
    }
    // A forward/up/out pole: the elbow's perpendicular bend cannot fold to the opposite side.
    const shoulder = rig.point(`upperArm.${side}`), elbow = rig.point(`forearm.${side}`), wrist = rig.point(`hand.${side}`);
    const axis = wrist.sub(shoulder).normalize(), bend = elbow.sub(shoulder);
    bend.addScaledVector(axis, -bend.dot(axis));
    const pole = new THREE.Vector3(.6, .5, sign);
    pole.addScaledVector(axis, -pole.dot(axis));
    expect(bend.dot(pole), `elbow pole ${context}`).toBeGreaterThan(-1e-6);
  }
  const offset = BIKE_GEOMETRY_V2.chassisToAxle;
  const desired = new THREE.Vector3(f.riderBody.relX - offset.x, f.riderBody.relY - offset.y, 0);
  expect(measuredCOM(rig).distanceTo(desired), `measured COM ${context}`).toBeLessThan(1e-5);
  expect(rig.snapshot().every(Number.isFinite), context).toBe(true);
}

function poseFrame(hipX: number, hipY: number, torsoDegrees: number, angle: number): RenderFrame {
  const pose = riderRigFromHips(hipX, hipY, torsoDegrees * Math.PI / 180, makeRiderRigPose());
  const f = new FrameBuilder().frame;
  f.bikeX = 4; f.bikeY = 2; f.bikeAngle = angle;
  f.riderBody.present = true;
  f.riderBody.relX = pose.com.x + BIKE_GEOMETRY_V2.chassisToAxle.x;
  f.riderBody.relY = pose.com.y + BIKE_GEOMETRY_V2.chassisToAxle.y;
  f.riderBody.relAngle = (torsoDegrees - 40) * Math.PI / 180;
  f.dt = 1 / 60; f.speed = 10;
  return f;
}

describe.each(['rider-openface.glb', 'rider-openface-lod.glb', 'rider-street.glb', 'rider-street-lod.glb', 'rider-race.glb', 'rider-race-lod.glb'])('%s physical pose', file => {
  let gltf: GLTF;
  beforeAll(async () => { gltf = await loadRig(file); });

  it.each(['rookie', 'pro'] as const)('%s retains real sockets, lengths, elbow side and independent COM through a pose grid', cls => {
    const rig = fixture(gltf, cls);
    for (const [hipX, hipY, torso] of [[-.57, .60, 55], [-.28, .85, 40], [-.22, .90, 26], [-.38, .78, 28], [-.14, .96, 40], [-.40, .70, 40]]) {
      for (const angle of [-2.8, -.5, 0, .7, 3.1]) {
        const f = poseFrame(hipX!, hipY!, torso!, angle);
        rig.update(f);
        expectContactsAndMass(rig, f, JSON.stringify({ file, cls, hipX, hipY, torso, angle }));
      }
    }
  });

  it.each(['rookie', 'pro'] as const)('%s freezes a finish pose exactly and restores after ragdoll/restart', cls => {
    const live = fixture(gltf, cls), fresh = fixture(gltf, cls);
    const f = poseFrame(-.4, .70, 40, .8);
    f.finished = true; f.tSim = 78.433; f.cut = false;
    live.update(f);
    const held = live.snapshot();
    for (let i = 0; i < 180; i++) live.update(f);
    expect(live.snapshot()).toEqual(held);
    expectContactsAndMass(live, f, 'held finish (synthetic; not the reported finish recording)');
    f.finished = false;
    f.ragdoll = (['pelvis', 'torso', 'head', 'upperArm', 'forearm', 'thigh', 'shin'] as const).map((id, i) => ({ id, pos: { x: 3 + i * .1, y: .8 + i * .1 }, angle: .4 }));
    for (let i = 0; i < 6; i++) { f.tSim += f.dt; live.update(f); }
    const restarted = poseFrame(-.28, .85, 40, 0);
    live.update(restarted); fresh.update(restarted);
    expect(live.snapshot()).toEqual(fresh.snapshot());
    expectContactsAndMass(live, restarted, 'restart');
  });

  it.each(['rookie', 'pro'] as const)('%s follows actual production Game playback through the E2 impact window', async cls => {
    const rec = JSON.parse(await readFile(new URL(`../../../harness/inputs/e2-rear-wheel-first/bot-3${cls === 'pro' ? '-pro' : ''}.json`, import.meta.url), 'utf8')) as InputRecording;
    expect(rec.header.physics).toBe('v2');
    expect(rec.header.physicsHz).toBe(120);
    expect(rec.header.bike).toBe(cls);
    const game = new Game({ physics: createBikePhysicsV2(rec.header.physicsHz), renderer: { setTrack() {}, onEvent() {}, setQuality() {}, setBikeClass() {} } as unknown as GameRenderer,
      physicsHz: rec.header.physicsHz, autoSkipCountdown: true, ghostEnabled: false });
    game.loadTrack(rec.header.trackId, rec.header.seed, cls);
    const rig = fixture(gltf, cls), frames = new FrameBuilder();
    let tick = 0, ridden = 0;
    outer: for (const [count, throttle, brake, lean, flags] of rec.runs) for (let i = 0; i < count!; i++) {
      if (++tick > 900) break outer;
      game.setInput({ throttle: throttle! / 255, brake: brake! / 255, lean: lean! / 127, hop: Boolean(flags! & 1), restart: Boolean(flags! & 2) });
      game.step(1);
      const f = frames.build(game.getState(), 1);
      rig.update(f);
      if (f.ragdoll) { expect(rig.snapshot().every(Number.isFinite)).toBe(true); continue; }
      ridden++;
      expectContactsAndMass(rig, f, `E2 ${cls} input ${tick}`);
    }
    // This checks pose mapping on ridden states, not whether old controls still clear E2.
    expect(tick).toBe(901);
    expect(ridden).toBeGreaterThan(0);
  });
});
