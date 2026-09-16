import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { InputRecording } from '../../core/replay';
import type { BikeClass } from '../../core/types';
import { Game } from '../../game/game';
import { createBikePhysicsV2 } from '../../physics/v2/bike';
import { makeRiderRigPose, riderRigFromHips } from './riderRig';
import { BIKE_GEOMETRY_V2 } from './assetFrame';
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

/** Worst-case contact / segment / mass errors of one posed frame, in metres (elbowPole is a signed dot, must be >= 0). */
interface PoseErrors { grip: number; sole: number; length: number; elbowPole: number; com: number; }

function measureContactsAndMass(rig: Rig, f: RenderFrame): PoseErrors {
  const e: PoseErrors = { grip: 0, sole: 0, length: 0, elbowPole: Infinity, com: 0 };
  for (const [side, sign] of [['L', 1], ['R', -1]] as const) {
    e.grip = Math.max(e.grip, rig.point(`gripSocket.${side}`).distanceTo(new THREE.Vector3(.27, .78, sign * .33)));
    // The sole rests on the peg's 11 mm upper surface, not its axis.
    e.sole = Math.max(e.sole, rig.point(`soleSocket.${side}`).distanceTo(new THREE.Vector3(-.14, .031, sign * .2)));
    for (const [a, b, length] of [['upperArm', 'forearm', .32], ['forearm', 'hand', .27], ['thigh', 'shin', .46], ['shin', 'foot', .43]] as const) {
      e.length = Math.max(e.length, Math.abs(rig.point(`${a}.${side}`).distanceTo(rig.point(`${b}.${side}`)) - length));
    }
    // A forward/up/out pole: the elbow's perpendicular bend cannot fold to the opposite side.
    const shoulder = rig.point(`upperArm.${side}`), elbow = rig.point(`forearm.${side}`), wrist = rig.point(`hand.${side}`);
    const axis = wrist.sub(shoulder).normalize(), bend = elbow.sub(shoulder);
    bend.addScaledVector(axis, -bend.dot(axis));
    const pole = new THREE.Vector3(.6, .5, sign);
    pole.addScaledVector(axis, -pole.dot(axis));
    e.elbowPole = Math.min(e.elbowPole, bend.dot(pole));
  }
  const offset = BIKE_GEOMETRY_V2.chassisToAxle;
  const desired = new THREE.Vector3(f.riderBody.relX - offset.x, f.riderBody.relY - offset.y, 0);
  e.com = measuredCOM(rig).distanceTo(desired);
  return e;
}

function expectContactsAndMass(rig: Rig, f: RenderFrame, context: string, bounds: PoseErrors = { grip: 1e-5, sole: 1e-5, length: 1e-6, elbowPole: -1e-6, com: 1e-5 }): PoseErrors {
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
    const physics = createBikePhysicsV2(rec.header.physicsHz);
    const game = new Game({ physics, renderer: { setTrack() {}, onEvent() {}, setQuality() {}, setBikeClass() {} } as unknown as GameRenderer,
      physicsHz: rec.header.physicsHz, autoSkipCountdown: true, ghostEnabled: false });
    game.loadTrack(rec.header.trackId, rec.header.seed, cls);
    const rig = fixture(gltf, cls), frames = new FrameBuilder();
    // merge #3 (measured on main's R6 solver, both bot-3 recordings, ticks 1-900): main's rider body is a free
    // rigid body on a servo, and on these recordings (cut against the branch's physics) it leaves the reach of
    // the rig's arms/legs for ~370 of 900 ridden ticks — by tick 682 (Rookie) / 539 (Pro) its angle relative to
    // the chassis passes pi and winds up to 144 rad (Rookie; Pro 36 rad) while the COM drops to 1.0 m (Pro 0.56 m)
    // below the chassis COM with the run still `riding`. The glTF rider follows that body honestly: bone lengths
    // and the elbow side hold on every tick, the inverse map lands on the body's COM to 1e-9, and on every tick
    // with both limbs in reach (528 Rookie / 523 Pro) the grips, soles and measured COM are exact. Out of reach
    // the arm / leg is straight toward its contact and misses it by exactly the reach shortfall the renderer
    // reports (`debug.wristErr` / `debug.ankleErr`). Worst measured: grip 1.68 m (Rookie) / 0.80 m (Pro), sole
    // 0.45 m / 0.21 m, measured COM 5.9 cm / 2.2 cm — a physics-owner fact (the body has no joint stops on main),
    // recorded here with generous bounds so a change in either direction is visible.
    const worst: PoseErrors = { grip: 0, sole: 0, length: 0, elbowPole: Infinity, com: 0 };
    let tick = 0, ridden = 0, reachable = 0, worstResidual = 0;
    outer: for (const [count, throttle, brake, lean, flags] of rec.runs) for (let i = 0; i < count!; i++) {
      if (++tick > 900) break outer;
      game.setInput({ throttle: throttle! / 255, brake: brake! / 255, lean: lean! / 127, hop: Boolean(flags! & 1), restart: Boolean(flags! & 2) });
      game.step(1);
      // merge #3: main's R6 solver keeps the rider body in `debug()` only; the test injects it so the physical-pose
      // path is proven against main's real body (exporting it in `getState()` re-hashes every v2 golden — physics
      // owner's round).
      const body = physics.debug().rider.body;
      const st = { ...game.getState(), riderBody: { pos: { ...body.pos }, vel: { ...body.vel }, angle: body.angle, angVel: body.angVel } };
      const f = frames.build(st, 1);
      rig.update(f);
      if (f.ragdoll) { expect(rig.snapshot().every(Number.isFinite)).toBe(true); continue; }
      ridden++;
      const context = `E2 ${cls} input ${tick}`;
      const e = expectContactsAndMass(rig, f, context, { grip: 2, sole: 0.6, length: 1e-6, elbowPole: -1e-6, com: 0.1 });
      const dbg = rig.rider.debug;
      const wristErr = Math.max(dbg.wristErr[0]!, dbg.wristErr[1]!), ankleErr = Math.max(dbg.ankleErr[0]!, dbg.ankleErr[1]!);
      if (wristErr === 0 && ankleErr < 1e-5) {
        reachable++;
        expect(e.grip, `grip in reach ${context}`).toBeLessThan(1e-5);
        expect(e.sole, `sole in reach ${context}`).toBeLessThan(1e-5);
        expect(e.com, `measured COM in reach ${context}`).toBeLessThan(1e-5);
      }
      // Out of reach the miss IS the shortfall (wristErr is rounded to 1e-4; the foot is rigid on the shin).
      expect(e.grip, `grip shortfall ${context}`).toBeLessThan(wristErr + 1.1e-4);
      expect(e.sole, `sole shortfall ${context}`).toBeLessThan(ankleErr + 1e-5);
      worst.grip = Math.max(worst.grip, e.grip); worst.sole = Math.max(worst.sole, e.sole); worst.com = Math.max(worst.com, e.com);
      worstResidual = Math.max(worstResidual, dbg.comResidual);
    }
    // This checks pose mapping on ridden states, not whether old controls still clear E2.
    expect(tick).toBe(901);
    expect(ridden).toBeGreaterThan(0);
    expect(reachable).toBeGreaterThan(400); // measured 528 (Rookie) / 523 (Pro) of 900
    // main's `riderBody` COM is the pose-table COM, not this mass map's; the inverse map still lands on it (1e-9).
    expect(worstResidual).toBeLessThan(1e-6);
    // The recorded worst cases (see above): the body does leave reach on these recordings. When main gives the
    // body joint stops these three flip and the bounds passed to expectContactsAndMass above tighten to 1e-5.
    expect(worst.grip).toBeGreaterThan(0.5);
    expect(worst.sole).toBeGreaterThan(0.1);
    expect(worst.com).toBeGreaterThan(0.01);
  });
});
