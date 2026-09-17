/**
 * Ask 51: on the garage stage the rider plays Astra's authored `sit_cruise` whole — the pose the prototype garage
 * showed — instead of the physics stance + IK (docs/evidence/hero-art/pose-compare/README.md: hips 15.6 cm too far
 * back, elbows at the shoulder line). Off the stage the physics pose blends back in over 250 ms of simulated time.
 */
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { AVAILABLE_RIDER_PRESETS } from '../../core/riderPresets';
import type { HeroBike } from '../bike/bikeModel';
import { FrameBuilder, type RenderFrame } from '../frame';
import type { MaterialLibrary } from '../materials/library';
import { BIKE_GEOMETRY_V2 } from './assetFrame';
import { boneName, GltfRider } from './gltfRider';
import { loadRig } from './gltfTestUtils';
import { prepareHero } from './lod';
import { makeRiderRigPose, riderRigFromHips } from './riderRig';

const SHIFT = 0.65;
const JOINTS = ['pelvis', 'spine', 'chest', 'neck', 'head', 'shoulder.L', 'upperArm.L', 'forearm.L', 'hand.L', 'shoulder.R', 'upperArm.R', 'forearm.R', 'hand.R', 'thigh.L', 'shin.L', 'foot.L', 'thigh.R', 'shin.R', 'foot.R', 'gripSocket.L', 'gripSocket.R', 'soleSocket.L', 'soleSocket.R'];

function fixture(gltf: GLTF) {
  const frame = new THREE.Group();
  const rider = new GltfRider(gltf, { complete() {} } as unknown as MaterialLibrary);
  rider.attach({ frame } as HeroBike);
  const nodes = new Map<string, THREE.Object3D>();
  frame.traverse((o) => nodes.set(boneName(o.name), o));
  const point = (name: string) => frame.worldToLocal(nodes.get(name)!.getWorldPosition(new THREE.Vector3()));
  const update = (f: RenderFrame) => {
    const offset = BIKE_GEOMETRY_V2.chassisToAxle;
    const c = Math.cos(f.bikeAngle), s = Math.sin(f.bikeAngle);
    frame.position.set(f.bikeX + offset.x * c - offset.y * s, f.bikeY + offset.x * s + offset.y * c, 0);
    frame.rotation.z = f.bikeAngle;
    frame.updateMatrixWorld(true);
    rider.update(f);
    frame.updateMatrixWorld(true);
  };
  const joints = () => JOINTS.map((n) => point(n));
  return { rider, frame, point, update, joints };
}

/** The clip as the prototype played it: `AnimationMixer` on a clone, joint positions in the axle frame. */
function authored(gltf: GLTF, clipName: string, t: number): THREE.Vector3[] {
  const scene = cloneSkeleton(gltf.scene);
  const holder = new THREE.Group();
  holder.add(scene);
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(gltf.animations.find((c) => c.name === clipName)!).play();
  mixer.setTime(t);
  holder.updateMatrixWorld(true);
  const byName = new Map<string, THREE.Object3D>();
  scene.traverse((o) => byName.set(boneName(o.name), o));
  return JOINTS.map((n) => byName.get(n)!.getWorldPosition(new THREE.Vector3()).sub(new THREE.Vector3(SHIFT, 0, 0)));
}

/** The frozen spawn state the garage shows (measure.mts: rookie b1 spawn), and a leaning ride frame. */
function physicsFrame(hipX: number, hipY: number, torsoDegrees: number, tSim: number): RenderFrame {
  const pose = riderRigFromHips(hipX, hipY, torsoDegrees * Math.PI / 180, makeRiderRigPose());
  const f = new FrameBuilder().frame;
  f.bikeX = 4; f.bikeY = 2; f.bikeAngle = 0.0263;
  f.riderBody.present = true;
  f.riderBody.relX = pose.com.x + BIKE_GEOMETRY_V2.chassisToAxle.x;
  f.riderBody.relY = pose.com.y + BIKE_GEOMETRY_V2.chassisToAxle.y;
  f.riderBody.relAngle = (torsoDegrees - 40) * Math.PI / 180;
  f.tSim = tSim; f.dt = 0; f.cut = false; f.speed = 0;
  return f;
}

const maxDistance = (a: THREE.Vector3[], b: THREE.Vector3[]) => Math.max(...a.map((p, i) => p.distanceTo(b[i]!)));

const subjects = AVAILABLE_RIDER_PRESETS.flatMap((p) => [`rider-${p.id}.glb`, `rider-${p.id}-lod.glb`].map((file) => ({ file })));

describe.each(subjects)('$file garage stage', ({ file }) => {
  let gltf: GLTF;
  beforeAll(async () => { gltf = await loadRig(file); await prepareHero(gltf); });

  it('plays sit_cruise whole: every joint where the prototype put it, hands on the grips and soles on the pegs by authorship', () => {
    const rig = fixture(gltf);
    rig.rider.setStage(true);
    for (const [frame, t] of [[physicsFrame(-0.46, 0.75, 40, 0), 0], [physicsFrame(-0.22, 0.9, 26, 3.25), 3.25 % 1.967], [physicsFrame(-0.57, 0.6, 55, 78.433), 78.433 % 1.967]] as const) {
      rig.update(frame);
      expect(rig.rider.debug.stageClip).toBe('sit_cruise');
      expect(rig.rider.debug.physicalPose).toBe(false);
      // The physics frame is not consulted: three different bodies, one authored pose (to the mixer's own evaluation).
      expect(maxDistance(rig.joints(), authored(gltf, 'sit_cruise', t))).toBeLessThan(1e-4); // 43 µm: the driver renormalises the quantised keys, the mixer does not
    }
    const d = rig.rider.debug;
    // The authored hands / soles land on the delivered contacts: measured, never corrected by IK (bar: a few mm).
    for (const i of [0, 1]) {
      expect(d.gripErr[i]).toBeLessThan(1e-3);
      expect(d.soleErr[i]).toBeLessThan(1e-3);
      expect(d.handOnGrip[i]).toBe(true);
    }
    // The seated pose the user asked for: elbows well below the shoulders, hips on the seat, torso up.
    for (const side of ['L', 'R']) {
      expect(rig.point(`forearm.${side}`).y - rig.point(`upperArm.${side}`).y).toBeLessThan(-0.25);
      const shoulder = rig.point(`upperArm.${side}`), elbow = rig.point(`forearm.${side}`), wrist = rig.point(`hand.${side}`);
      const bend = shoulder.sub(elbow).angleTo(wrist.sub(elbow)) * 180 / Math.PI;
      expect(bend).toBeGreaterThan(80);
      expect(bend).toBeLessThan(90);
    }
    const torso = rig.point('neck').sub(rig.point('pelvis'));
    expect(Math.atan2(torso.y, torso.x) * 180 / Math.PI).toBeCloseTo(51.7, 0);
  });

  it('is a static hold on this delivery: the loop never moves a joint', () => {
    const rig = fixture(gltf);
    rig.rider.setStage(true);
    rig.update(physicsFrame(-0.46, 0.75, 40, 0));
    const first = rig.joints();
    for (const t of [0.5, 1.0, 1.5, 1.966, 1.967, 2.4]) {
      rig.update(physicsFrame(-0.46, 0.75, 40, t));
      expect(maxDistance(rig.joints(), first), `t=${t}`).toBeLessThan(1e-6);
    }
  });

  it('leaving the stage holds the clip pose while the frame is frozen, then blends to the physics pose in 250 ms of sim time without a pop', () => {
    const rig = fixture(gltf), reference = fixture(gltf);
    const stage = physicsFrame(-0.46, 0.75, 40, 10);
    rig.rider.setStage(true);
    rig.update(stage);
    const held = rig.joints();
    rig.rider.setStage(false);
    // The menu after the garage: the physics state is frozen (dt 0) — the seated pose stays, no snap to the stance.
    for (let i = 0; i < 5; i++) rig.update(stage);
    expect(rig.rider.debug.stageClip).toBeNull();
    expect(rig.rider.debug.physicalPose).toBe(true);
    expect(maxDistance(rig.joints(), held)).toBeLessThan(1e-6);
    expect(rig.rider.debug.stageBlend).toBe(1);
    // The countdown steps physics: 60 Hz frames, the physics stance arrives inside 0.25 s, every frame a bounded step.
    const target = physicsFrame(-0.46, 0.75, 40, 10);
    reference.update(target);
    const goal = reference.joints();
    let previous = held, worstStep = 0, frames = 0;
    for (let t = 1 / 60; t <= 0.25 + 1e-9; t += 1 / 60) {
      const f = physicsFrame(-0.46, 0.75, 40, 10 + t);
      f.dt = 1 / 60;
      rig.update(f);
      const now = rig.joints();
      worstStep = Math.max(worstStep, maxDistance(now, previous));
      previous = now;
      frames++;
    }
    expect(frames).toBe(15);
    expect(rig.rider.debug.stageBlend).toBe(0);
    expect(maxDistance(rig.joints(), goal)).toBeLessThan(1e-6);
    // The largest joint move between the two poses is ~30 cm (the elbows); a snap would be that in one frame.
    expect(maxDistance(held, goal)).toBeGreaterThan(0.15);
    expect(worstStep).toBeLessThan(0.06);
    // A cut mid-blend does not drop it: the snapshot is bone-local, the track load's cut only zeroes dt.
    rig.rider.setStage(true);
    rig.update(stage);
    rig.rider.setStage(false);
    const cut = physicsFrame(-0.46, 0.75, 40, 0);
    cut.cut = true;
    rig.update(cut);
    expect(rig.rider.debug.stageBlend).toBe(1);
    expect(maxDistance(rig.joints(), held)).toBeLessThan(1e-6);
  });

  it('setStage is idempotent and the stage flag survives an outfit swap frame (a fresh rider set on the stage poses the clip first)', () => {
    const rig = fixture(gltf);
    rig.rider.setStage(true);
    rig.rider.setStage(true);
    rig.update(physicsFrame(-0.46, 0.75, 40, 0));
    expect(rig.rider.debug.stageClip).toBe('sit_cruise');
    rig.rider.setStage(false);
    rig.rider.setStage(false);
    expect(rig.rider.debug.stageBlend).toBe(0); // not yet measured: the blend reports on the next update
    rig.update(physicsFrame(-0.46, 0.75, 40, 0));
    expect(rig.rider.debug.stageBlend).toBe(1);
  });
});
