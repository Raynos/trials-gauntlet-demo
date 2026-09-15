import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { HeroBike } from '../bike/bikeModel';
import { FrameBuilder, type RenderFrame } from '../frame';
import type { MaterialLibrary } from '../materials/library';
import { GltfRider, boneName } from './gltfRider';

/** Load the committed geometry, bind matrices and clips through the production decoder. Images
 * are omitted in memory because these tests exercise skeletal transforms in Node without a DOM
 * or GPU. No asset on disk is changed, and this is not a material/render-quality assertion. */
async function loadRig(file: string): Promise<GLTF> {
  const original = await readFile(new URL(`../../../public/models/${file}`, import.meta.url));
  const jsonLength = original.readUInt32LE(12);
  const document = JSON.parse(original.subarray(20, 20 + jsonLength).toString()) as {
    meshes: { primitives: { material?: number; extensions?: Record<string, unknown> }[] }[];
    materials: unknown[];
    textures: unknown[];
    images: unknown[];
    extensions?: Record<string, unknown>;
  };
  for (const mesh of document.meshes)
    for (const primitive of mesh.primitives) {
      delete primitive.material;
      if (primitive.extensions) delete primitive.extensions.KHR_materials_variants;
    }
  document.materials = [];
  document.textures = [];
  document.images = [];
  if (document.extensions) delete document.extensions.KHR_materials_variants;
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
  const binaryChunk = original.subarray(20 + jsonLength);
  const result = Buffer.alloc(20 + padded.length + binaryChunk.length);
  original.copy(result, 0, 0, 12);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(padded.length, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(result, 20);
  binaryChunk.copy(result, 20 + padded.length);
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(result.buffer, '');
}

function fixture(gltf: GLTF) {
  const frame = new THREE.Group();
  const rider = new GltfRider(gltf, { complete: () => undefined } as unknown as MaterialLibrary);
  rider.attach({ frame } as HeroBike);
  const bones = new Map<string, THREE.Bone>();
  frame.traverse((object) => {
    if ((object as THREE.Bone).isBone) bones.set(boneName(object.name), object as THREE.Bone);
  });
  const update = (f: RenderFrame) => {
    rider.update(f);
    frame.updateMatrixWorld(true);
    rider.root.updateMatrixWorld(true);
  };
  const point = (name: string) => frame.worldToLocal(bones.get(name)!.getWorldPosition(new THREE.Vector3()));
  const snapshot = () => Array.from(bones.values(), (bone) => bone.matrixWorld.elements.slice()).flat();
  return { rider, frame, bones, update, point, snapshot };
}

function state(): RenderFrame {
  const f = new FrameBuilder().frame;
  f.riderBody.present = true;
  f.speed = 10;
  f.cut = false;
  f.dt = 1 / 60;
  return f;
}

function expectPose(actual: number[], expected: number[]) {
  expect(actual).toEqual(expected);
}

describe.each(['rider.glb', 'rider-lod.glb'])('%s runtime contact and pose invariants', (file) => {
  let gltf: GLTF;
  beforeAll(async () => {
    gltf = await loadRig(file);
  });

  it('samples idle without accumulating shoulder translations, including repeated timestamps and a cut', () => {
    const live = fixture(gltf);
    const fresh = fixture(gltf);
    const f = state();
    f.speed = 0;
    for (let i = 0; i <= 3600; i++) {
      f.tSim = i / 60;
      live.update(f);
    }
    fresh.update(f);
    expectPose(live.snapshot(), fresh.snapshot());
    f.tSim = 0.5;
    fresh.update(f);
    for (let i = 0; i < 120; i++) live.update(f);
    expectPose(live.snapshot(), fresh.snapshot());
    f.cut = true;
    f.tSim = 0;
    live.update(f);
    fresh.update(f);
    expectPose(live.snapshot(), fresh.snapshot());
    expect(live.point('upperArm.L').distanceTo(new THREE.Vector3(0.118343, 1.18425, 0.21))).toBeLessThan(1e-5);
  });

  it('reaches the same animated pose after different render frame counts', () => {
    const snapshots: number[][] = [];
    for (const fps of [30, 60, 120]) {
      const rig = fixture(gltf);
      const f = state();
      f.speed = 0;
      f.dt = 1 / fps;
      for (let i = 0; i <= 4 * fps; i++) {
        f.tSim = i / fps;
        rig.update(f);
      }
      snapshots.push(rig.snapshot());
    }
    expectPose(snapshots[1]!, snapshots[0]!);
    expectPose(snapshots[2]!, snapshots[0]!);
  });

  it('keeps actual wrists and ankles on their contacts through landing and hop extremes', () => {
    const rig = fixture(gltf);
    const f = state();
    const lengths = new Map<string, number>();
    const scales = new Map(Array.from(rig.bones, ([name, bone]) => [name, bone.scale.clone()]));
    for (const side of ['L', 'R'])
      for (const [parent, child] of [['upperArm', 'forearm'], ['forearm', 'hand'], ['thigh', 'shin'], ['shin', 'foot']])
        lengths.set(`${child}.${side}`, rig.point(`${parent}.${side}`).distanceTo(rig.point(`${child}.${side}`)));
    // Transform the bike too: endpoint assertions must remain in the bike frame after world motion.
    rig.frame.position.set(4, 2, -1);
    rig.frame.rotation.z = 0.7;
    for (const lean of [-1, 0, 1])
      for (const crouch of [0, 1])
        for (const torsoPitch of [-0.9, -0.34, 0, 0.34, 0.9])
          for (const compression of [0, 0.8])
            for (const relUp of [0, 2]) {
              f.rider = { lean, crouch, torsoPitch, armExtend: 0 };
              f.rear.compression = f.front.compression = compression;
              f.riderBody.relUp = relUp;
              f.tSim += f.dt;
              rig.update(f);
              const context = JSON.stringify({ lean, crouch, torsoPitch, compression, relUp });
              // Independent contact contract: bike grips (0.27, 0.78, ±0.33), pegs
              // (-0.14, 0.02, ±0.20), ankle 1 cm forward / 9 cm above each peg. These
              // are explicit bike hard points from assets/blender/README.md, not pose.ts output.
              for (const [side, sign] of [['L', 1], ['R', -1]] as const) {
                expect(rig.point(`hand.${side}`).distanceTo(new THREE.Vector3(0.27, 0.78, sign * 0.33)), `wrist ${side} ${context}`).toBeLessThan(1e-4);
                expect(rig.point(`foot.${side}`).distanceTo(new THREE.Vector3(-0.13, 0.11, sign * 0.2)), `ankle ${side} ${context}`).toBeLessThan(1e-4);
                for (const [parent, child] of [['upperArm', 'forearm'], ['forearm', 'hand'], ['thigh', 'shin'], ['shin', 'foot']]) {
                  const length = rig.point(`${parent}.${side}`).distanceTo(rig.point(`${child}.${side}`));
                  expect(Math.abs(length - lengths.get(`${child}.${side}`)!), `bone length ${child}.${side} ${context}`).toBeLessThan(1e-5);
                }
              }
              for (const [name, bone] of rig.bones) expect(bone.scale.distanceTo(scales.get(name)!)).toBe(0);
            }
  });

  it('reduces an unreachable additive pose and preserves reachable landing motion', () => {
    const rig = fixture(gltf);
    const f = state();
    rig.update(f);
    const before = rig.point('pelvis');
    f.rear.compression = f.front.compression = 0.8;
    rig.update(f);
    expect(rig.rider.debug.additiveWeight).toBe(1);
    expect(rig.point('pelvis').distanceTo(before)).toBeGreaterThan(0.1);
    f.rider = { lean: 1, crouch: 0, torsoPitch: -0.9, armExtend: 0 };
    f.rear.compression = f.front.compression = 0;
    f.riderBody.relUp = 2;
    rig.update(f);
    expect(rig.rider.debug.additiveWeight).toBeGreaterThan(0);
    expect(rig.rider.debug.additiveWeight).toBeLessThan(1);
    expect(Math.max(...rig.rider.debug.ankleErr)).toBeLessThan(1e-4);
  });

  it('uses neutral as the transient reference, with smaller downward landing and upward extension deltas', () => {
    const rig = fixture(gltf);
    const f = state();
    rig.update(f);
    const neutral = rig.point('pelvis');
    f.rear.compression = f.front.compression = 0.8;
    rig.update(f);
    const land = rig.point('pelvis').sub(neutral);
    // Authored hips: neutral (-.28,.85), absorb (-.40,.70), multiplied by .9.
    // Bounds allow the pelvis's 2 cm offset along the torso and sampled clip interpolation.
    expect(land.x).toBeGreaterThan(-0.13);
    expect(land.x).toBeLessThan(-0.08);
    expect(land.y).toBeGreaterThan(-0.16);
    expect(land.y).toBeLessThan(-0.11);
    expect(rig.rider.debug.additiveWeight).toBe(1);
    f.rear.compression = f.front.compression = 0;
    f.riderBody.relUp = 2;
    rig.update(f);
    const extend = rig.point('pelvis').sub(neutral);
    // Authored extension hips (-.14,.96) relative to neutral, multiplied by .7.
    expect(extend.x).toBeGreaterThan(0.07);
    expect(extend.x).toBeLessThan(0.12);
    expect(extend.y).toBeGreaterThan(0.05);
    expect(extend.y).toBeLessThan(0.10);
    expect(rig.rider.debug.additiveWeight).toBe(1);

    // A real exported neutral pose, installed as either transient target, must add no motion.
    // This checks reference semantics through the public update path and actual clip data.
    for (const name of ['land_absorb', 'extend']) {
      const neutralClip = gltf.animations.find((clip) => clip.name === 'stand_attack')!.clone();
      neutralClip.name = name;
      const neutralTarget = fixture({ ...gltf, animations: gltf.animations.map((clip) => clip.name === name ? neutralClip : clip) });
      const sample = state();
      neutralTarget.update(sample);
      const before = neutralTarget.point('pelvis');
      if (name === 'land_absorb') sample.rear.compression = sample.front.compression = 0.8;
      else sample.riderBody.relUp = 2;
      neutralTarget.update(sample);
      expect(neutralTarget.point('pelvis').distanceTo(before)).toBeLessThan(1e-8);
    }
  });

  it('restores a fresh riding pose after ragdoll, cut and reattachment', () => {
    const live = fixture(gltf);
    const fresh = fixture(gltf);
    const f = state();
    f.rear.compression = f.front.compression = 0.8;
    live.update(f);
    f.ragdoll = (['pelvis', 'torso', 'head', 'upperArm', 'forearm', 'thigh', 'shin'] as const).map((id, i) => ({ id, pos: { x: 3 + i * 0.1, y: 0.8 + i * 0.1 }, angle: 0.4 }));
    for (let i = 0; i < 6; i++) {
      f.tSim += f.dt;
      live.update(f);
      expect(live.snapshot().every(Number.isFinite)).toBe(true);
    }
    const restarted = state();
    restarted.cut = true;
    live.update(restarted);
    fresh.update(restarted);
    expectPose(live.snapshot(), fresh.snapshot());
    expect(live.point('hand.L').distanceTo(new THREE.Vector3(0.27, 0.78, 0.33))).toBeLessThan(1e-4);
    expect(live.point('foot.L').distanceTo(new THREE.Vector3(-0.13, 0.11, 0.2))).toBeLessThan(1e-4);
  });
});
