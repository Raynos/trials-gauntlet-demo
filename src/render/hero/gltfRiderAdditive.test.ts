/**
 * GltfRider on a synthetic 19-joint rig (no glb, no DOM): the additive clips must not accumulate.
 *
 * The phone bug (build 5649aa6, `?bench=1` and any long idle): `additive()` added the clips' position deltas
 * onto the bones every rendered frame and nothing re-set them, so `idle_breathe`'s shoulder rise drifted
 * linearly with the frame count until the arm IK was out of reach. Rotations never drifted (the pose sets
 * them absolutely) — so the test is about bone-local POSITIONS across many rendered frames.
 *
 * Merge #3 (blender-work -> main): the merged rider layers ROTATION tracks only — `additive()` ignores every
 * non-pelvis position track so exported full-pose clips cannot change bone lengths — so liveness is read off
 * the chest rotation and the shoulder position is asserted to stay at bind.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GltfRider } from './gltfRider';
import type { RenderFrame } from '../frame';
import type { MaterialLibrary } from '../materials/library';
import type { HeroBike } from '../bike/bikeModel';

function bone(name: string, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Bone {
  const b = new THREE.Bone();
  b.name = name;
  b.position.set(x, y, z);
  parent.add(b);
  return b;
}

/** Armature → pelvis → spine → chest → {neck → head, shoulder.X → upperArm.X → forearm.X → hand.X}; pelvis → thigh.X → shin.X → foot.X. */
function rig(): { scene: THREE.Group; shoulderRest: THREE.Vector3 } {
  const scene = new THREE.Group();
  const armature = new THREE.Group();
  armature.name = 'Armature';
  scene.add(armature);
  const pelvis = bone('pelvis', armature, 0, 0.9, 0);
  const spine = bone('spine', pelvis, 0, 0.1, 0);
  const chest = bone('chest', spine, 0, 0.15, 0);
  const neck = bone('neck', chest, 0, 0.2, 0);
  bone('head', neck, 0, 0.1, 0);
  let shoulderRest = new THREE.Vector3();
  for (const s of ['L', 'R'] as const) {
    const sg = s === 'L' ? 1 : -1;
    const sh = bone(`shoulder${s}`, chest, 0, 0.15, sg * 0.05);
    if (s === 'L') shoulderRest = sh.position.clone();
    const ua = bone(`upperArm${s}`, sh, 0, 0.1, sg * 0.1);
    const fa = bone(`forearm${s}`, ua, 0, 0.3, 0);
    bone(`hand${s}`, fa, 0, 0.28, 0);
    const th = bone(`thigh${s}`, pelvis, 0, -0.05, sg * 0.1);
    const sn = bone(`shin${s}`, th, 0, -0.42, 0);
    bone(`foot${s}`, sn, 0, -0.42, 0);
  }
  return { scene, shoulderRest };
}

function breatheClip(): THREE.AnimationClip {
  // Shoulder rises 1 cm and returns over 2 s (a loop with a non-zero mean); the chest rocks 3 deg.
  const rest = new THREE.Vector3(0, 0.15, 0.05);
  const pos = new THREE.VectorKeyframeTrack('shoulderL.position', [0, 1, 2], [rest.x, rest.y, rest.z, rest.x, rest.y + 0.01, rest.z, rest.x, rest.y, rest.z]);
  const q0 = new THREE.Quaternion();
  const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.05);
  const rot = new THREE.QuaternionKeyframeTrack('chest.quaternion', [0, 1, 2], [...q0.toArray(), ...q1.toArray(), ...q0.toArray()]);
  return new THREE.AnimationClip('idle_breathe', 2, [pos, rot]);
}

function frameAtRest(tSim: number): RenderFrame {
  return {
    cut: tSim === 0,
    tick: Math.round(tSim * 120),
    tSim,
    dt: 1 / 60,
    speed: 0,
    rider: { lean: 0, crouch: 0, torsoPitch: 0, armExtend: 0 },
    riderBody: { present: true, relX: 0, relY: 0, relAngle: 0, relUp: 0, angVel: 0 },
    rear: { grounded: true, compression: 0.4 },
    front: { grounded: true, compression: 0.4 },
    ragdoll: null,
    hopPhase: 'idle',
    justLanded: false,
    landImpulse: 0,
  } as unknown as RenderFrame;
}

function build(): { rider: GltfRider; shoulder: THREE.Bone; shoulderRest: THREE.Vector3 } {
  const { scene, shoulderRest } = rig();
  const gltf = { scene, animations: [breatheClip()] } as unknown as GLTF;
  const lib = { complete: () => undefined } as unknown as MaterialLibrary;
  const rider = new GltfRider(gltf, lib);
  const world = new THREE.Scene();
  const frame = new THREE.Group();
  frame.position.set(12, 3, 0);
  world.add(frame);
  rider.attach({ frame } as unknown as HeroBike);
  world.updateMatrixWorld(true);
  const shoulder = (rider as unknown as { bones: Map<string, THREE.Bone> }).bones.get('shoulder.L')!;
  return { rider, shoulder, shoulderRest };
}

describe('GltfRider additive clips', () => {
  it('idle_breathe runs at rest: the chest rocks within the clip amplitude and the shoulder position stays at bind', () => {
    const { rider, shoulder, shoulderRest } = build();
    const chest = (rider as unknown as { bones: Map<string, THREE.Bone> }).bones.get('chest')!;
    // At t = 0 the clip's delta is the identity, so this frame's chest quaternion is the posed base.
    rider.update(frameAtRest(0));
    const chestBase = chest.quaternion.clone();
    let peakAngle = 0;
    let peakShoulder = 0;
    for (let i = 0; i < 120; i++) {
      rider.update(frameAtRest(i / 60));
      peakAngle = Math.max(peakAngle, chest.quaternion.angleTo(chestBase));
      peakShoulder = Math.max(peakShoulder, shoulder.position.distanceTo(shoulderRest));
    }
    // The clip is alive at full weight: the chest.quaternion track is a 0.05 rad rock, cresting at t = 1 s (measured 0.0500).
    expect(peakAngle).toBeGreaterThan(0.045);
    expect(peakAngle).toBeLessThan(0.0501);
    // Rotations only: the shoulderL.position track (1 cm rise) is deliberately not layered.
    expect(peakShoulder).toBeLessThan(1e-9);
  });

  it('bone positions do not accumulate across rendered frames: 3600 frames at 60 fps stay periodic', () => {
    const { rider, shoulder, shoulderRest } = build();
    const atT = (n: number): number => {
      rider.update(frameAtRest(n / 60));
      return shoulder.position.distanceTo(shoulderRest);
    };
    let worst = 0;
    const samples: number[] = [];
    for (let i = 0; i < 3600; i++) {
      const d = atT(i);
      worst = Math.max(worst, d);
      if (i % 120 === 60) samples.push(d); // the clip's 1 s crest, once per loop
    }
    // Before the fix: 12 mm after 20 s of 60 fps idle, metres after the bench; every crest higher than the last.
    expect(worst).toBeLessThan(0.0101);
    for (const s of samples) expect(Math.abs(s - samples[0]!)).toBeLessThan(1e-6);
  });

  it('a frame with the clips off leaves every bone at its bind position (only the pelvis is placed)', () => {
    const { rider } = build();
    for (let i = 0; i < 300; i++) rider.update(frameAtRest(i / 60));
    const riding = { ...frameAtRest(5), speed: 8, cut: false } as RenderFrame;
    rider.update(riding);
    const r = rider as unknown as { bones: Map<string, THREE.Bone>; restLocalP: Map<string, THREE.Vector3> };
    for (const [name, rest] of r.restLocalP) {
      if (name === 'pelvis') continue;
      expect(r.bones.get(name)!.position.distanceTo(rest)).toBeLessThan(1e-9);
    }
  });
});
