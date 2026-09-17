/**
 * Ask 43: Astra's delivered hero art through the game's loader contract — `prepareHero` (merge / flatten), the rig
 * binding of `GltfRider` (19 bones, grip + sole sockets, physics-driven contacts), the clip windows of
 * `clipAliases.ts` layered by the v1 additive path, and the bike mechanism driver on the per-livery bike files.
 *
 * Read in place from the tracked prototype export until the art owner lands `public/models/rider-race-bluewhite.glb`
 * / `bike-rookie.glb` (`deliveredHeroUrl` prefers the final file). Materials are kept, textures dropped: this proves
 * geometry, binding and material grouping in Node, not pixels.
 */
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { bikeTuningV2, suspensionPoint } from '../../physics/v2/tuning';
import type { HeroBike } from '../bike/bikeModel';
import { FrameBuilder, type RenderFrame } from '../frame';
import type { MaterialLibrary } from '../materials/library';
import { ASTRA_CLIP_WINDOWS } from './clipAliases';
import { GltfBike } from './gltfBike';
import { boneName, GltfRider } from './gltfRider';
import { deliveredHeroUrl, loadRigAt } from './gltfTestUtils';
import { mergeSkinnedByMaterial, prepareHero } from './lod';

const RIDER = deliveredHeroUrl('rider-race-bluewhite.glb', 'race-bluewhite.glb');
const STREET = deliveredHeroUrl('rider-street-mustard.glb', 'nothing-the-60-MB-delivery-is-not-read-here.glb');
const BIKES = { rookie: deliveredHeroUrl('bike-rookie.glb', 'bike-rookie-art.glb'), pro: deliveredHeroUrl('bike-pro.glb', 'bike-pro-art.glb') };
const lib = { complete() {} } as unknown as MaterialLibrary;
const ORDER = ['pelvis', 'spine', 'chest', 'neck', 'head', 'shoulder.L', 'upperArm.L', 'forearm.L', 'hand.L', 'shoulder.R', 'upperArm.R', 'forearm.R', 'hand.R', 'thigh.L', 'shin.L', 'foot.L', 'thigh.R', 'shin.R', 'foot.R'];

function countMeshes(root: THREE.Object3D): { meshes: number; physical: number; tris: number } {
  let meshes = 0, physical = 0, tris = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if ((mat as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) physical++;
  });
  return { meshes, physical, tris };
}

/** v1 / mock physics frame (no `riderBody`): the additive clips run on the round-9 timed envelopes. */
function envelopeFrame(tSim: number, extra: Partial<RenderFrame> = {}): RenderFrame {
  const f = new FrameBuilder().frame;
  f.bikeX = 4; f.bikeY = 2; f.bikeAngle = 0; f.dt = 1 / 60; f.tSim = tSim; f.speed = 6; f.cut = tSim === 0;
  f.riderBody.present = false;
  f.rider = { lean: 0, crouch: 0.2, torsoPitch: 0, armExtend: 0 };
  return Object.assign(f, extra);
}

describe('mergeSkinnedByMaterial', () => {
  it('joins skinned meshes per (material, skeleton, bind, layout) with re-based indices and leaves the rest alone', () => {
    const scene = new THREE.Group();
    const bone = new THREE.Bone();
    scene.add(bone);
    const skeleton = new THREE.Skeleton([bone]);
    const a = new THREE.MeshStandardMaterial(), b = new THREE.MeshStandardMaterial();
    const make = (name: string, material: THREE.Material, verts: number, uv = true): THREE.SkinnedMesh => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3).map((_, i) => i), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
      if (uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(verts * 2), 2));
      g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint8Array(verts * 4), 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(verts * 4).fill(0.25), 4));
      g.setIndex(Array.from({ length: verts }, (_, i) => i));
      const m = new THREE.SkinnedMesh(g, material);
      m.name = name;
      scene.add(m);
      m.bind(skeleton, new THREE.Matrix4());
      return m;
    };
    make('a1', a, 3); make('a2', a, 6); make('b1', b, 3); make('a3-nouv', a, 3, false);
    // a2's normals arrive as a Meshopt stream: normalized Int8, 3 of every 4 bytes (the street riders' layout).
    const a2 = scene.getObjectByName('a2') as THREE.SkinnedMesh;
    const packed = new Int8Array(6 * 4);
    for (let i = 0; i < 6; i++) packed.set([127, 0, -127, 0], i * 4);
    a2.geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(packed, 4), 3, 0, true));
    (scene.getObjectByName('a1') as THREE.SkinnedMesh).geometry.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(3 * 3).fill(127), 3, true));
    mergeSkinnedByMaterial(scene);
    const meshes: THREE.SkinnedMesh[] = [];
    scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
    expect(meshes.map((m) => m.name).sort()).toEqual(['a1', 'a3-nouv', 'b1']);
    const merged = meshes.find((m) => m.name === 'a1')!;
    expect(merged.material).toBe(a);
    expect(merged.geometry.getAttribute('position').count).toBe(9);
    expect(Array.from(merged.geometry.index!.array)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(merged.geometry.getAttribute('position').getX(8)).toBe(15); // a2's last vertex (x = 5·3) follows a1's three
    const normal = merged.geometry.getAttribute('normal');
    expect(normal.array).toBeInstanceOf(Int8Array);
    expect(normal.array.length).toBe(9 * 3);
    expect([normal.getX(2), normal.getY(2), normal.getZ(2)].map((v) => +v.toFixed(3))).toEqual([1, 1, 1]);
    expect([normal.getX(8), normal.getY(8), normal.getZ(8)].map((v) => +v.toFixed(3))).toEqual([1, 0, -1]);
    expect(merged.skeleton).toBe(skeleton);
  });
});

describe.skipIf(!RIDER)('Astra rider (race-bluewhite) through the game loader', () => {
  let gltf: GLTF;
  let raw: { meshes: number; physical: number; tris: number };
  beforeAll(async () => {
    gltf = await loadRigAt(RIDER!, true);
    raw = countMeshes(gltf.scene);
    await prepareHero(gltf);
  });

  it('prepareHero merges the one-material skinned parts into one draw and leaves no physical material', () => {
    // The prototype export is 14 skinned meshes on one material (93 908 tris); the art owner's stage-0 file under
    // public/models arrives already joined (44 099). Either way one material = one draw, and no triangle is lost.
    const after = countMeshes(gltf.scene);
    const materials = new Set<THREE.Material>();
    gltf.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) materials.add(mat); });
    expect(after.meshes).toBeLessThanOrEqual(materials.size); // one draw per material (the hair shell is its own material since round 2)
    expect(after.tris).toBe(raw.tris);
    expect(after.physical).toBe(0);
    const mesh = gltf.scene.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh;
    expect(mesh.skeleton.bones.length).toBe(19);
    expect(mesh.geometry.getAttribute('skinIndex').count).toBe(mesh.geometry.getAttribute('position').count);
  });

  it('binds every rig bone and both socket pairs on the physics contact points; the sole sits 11 mm over the peg', () => {
    const rider = new GltfRider(gltf, lib);
    expect(rider.debug.bones).toBe(19);
    const bones = (rider as unknown as { bones: Map<string, THREE.Bone> }).bones;
    for (const name of ORDER) expect(bones.has(name), name).toBe(true);
    const frame = new THREE.Group();
    rider.attach({ frame } as HeroBike);
    frame.updateMatrixWorld(true);
    const nodes = new Map<string, THREE.Object3D>();
    frame.traverse((o) => nodes.set(boneName(o.name), o));
    const point = (n: string): THREE.Vector3 => frame.worldToLocal(nodes.get(n)!.getWorldPosition(new THREE.Vector3()));
    // Bind pose in the axle frame (file frame − SHIFT): RIDER_PROFILE's grip / ankle / peg, the same anatomy as rider.glb.
    for (const [side, z] of [['L', 1], ['R', -1]] as const) {
      expect(point(`gripSocket.${side}`).distanceTo(new THREE.Vector3(0.27, 0.78, z * 0.33))).toBeLessThan(1e-4);
      expect(point(`soleSocket.${side}`).distanceTo(new THREE.Vector3(-0.14, 0.031, z * 0.2))).toBeLessThan(1e-4);
      expect(point(`foot.${side}`).distanceTo(new THREE.Vector3(-0.13, 0.11, z * 0.2))).toBeLessThan(1e-4);
      expect(Math.abs(point(`upperArm.${side}`).distanceTo(point(`forearm.${side}`)) - 0.32)).toBeLessThan(1e-4);
      expect(Math.abs(point(`forearm.${side}`).distanceTo(point(`hand.${side}`)) - 0.27)).toBeLessThan(1e-4);
      expect(Math.abs(point(`thigh.${side}`).distanceTo(point(`shin.${side}`)) - 0.46)).toBeLessThan(1e-4);
      expect(Math.abs(point(`shin.${side}`).distanceTo(point(`foot.${side}`)) - 0.43)).toBeLessThan(1e-4);
    }
    expect(() => rider.setLivery('pro')).not.toThrow(); // the file is the colourway
  });

  it('exposes the game clip names as windows of the delivered cycles, every one finite through its length', () => {
    const rider = new GltfRider(gltf, lib);
    for (const name of ['sit_cruise', 'forward_attack', 'hang_back', 'compression', 'extension', 'landing_absorption', 'stand_attack', 'crouch', 'extend', 'land_absorb']) expect(rider.debug.clips, name).toContain(name);
    expect(rider.debug.clips).not.toContain('idle_breathe'); // sit_cruise is a static hold: nothing to breathe with
    const clips = (rider as unknown as { clips: Map<string, { duration: number; from: number; poseT: number; rot: Map<string, { interp: THREE.Interpolant; rest: THREE.Quaternion }>; pos: Map<string, { interp: THREE.Interpolant; rest: THREE.Vector3 }> }> }).clips;
    for (const [name, w] of Object.entries(ASTRA_CLIP_WINDOWS)) {
      const s = clips.get(name)!;
      expect(s.from).toBe(w.from);
      expect(s.duration).toBeCloseTo(w.to - w.from, 6);
      expect(s.poseT).toBe(w.pose);
      for (const [, r] of s.rot) for (let t = 0; t <= s.duration; t += s.duration / 20) expect(Array.from(r.interp.evaluate(s.from + Math.min(t, s.duration - 1e-4)) as Float32Array).every(Number.isFinite)).toBe(true);
    }
    // The three cycles share the stance frame the windows rest on: their rests agree to a small fraction of a degree.
    const stance = clips.get('stand_attack')!;
    for (const name of ['crouch', 'extend', 'land_absorb']) {
      const s = clips.get(name)!;
      for (const [node, r] of s.rot) expect(r.rest.angleTo(stance.rot.get(node)!.rest), `${name} ${node}`).toBeLessThan(0.01);
      expect(s.pos.get('pelvis')!.rest.distanceTo(stance.pos.get('pelvis')!.rest)).toBeLessThan(1e-3);
    }
    // The held target poses are the measured deltas from the stance (pelvis −7.7 / +8.8 / −8.8 cm), not from the seated entry.
    const pelvisDelta = (name: string): number => {
      const s = clips.get(name)!;
      const p = s.pos.get('pelvis')!;
      return (p.interp.evaluate(s.from + s.poseT) as Float32Array)[1]! - p.rest.y;
    };
    expect(pelvisDelta('crouch')).toBeCloseTo(-0.077, 2);
    expect(pelvisDelta('extend')).toBeCloseTo(0.088, 2);
    expect(pelvisDelta('land_absorb')).toBeCloseTo(-0.088, 2);
    // The seated neutral's torso-offset ease (spine 10° over the first 0.5 s) is not in the layered delta: at the stance
    // the spine's delta from its rest is zero, and it never exceeds the cycle's own spine motion.
    const spine = clips.get('land_absorb')!.rot.get('spine')!;
    const q = new THREE.Quaternion();
    const v = spine.interp.evaluate(clips.get('land_absorb')!.from) as Float32Array;
    expect(q.set(v[0]!, v[1]!, v[2]!, v[3]!).angleTo(spine.rest)).toBeLessThan(1e-3);
  });

  it('layers the landing and hop windows on the v1 envelope path with the hands held on the grips', () => {
    const rider = new GltfRider(gltf, lib);
    const world = new THREE.Scene();
    const frame = new THREE.Group();
    frame.position.set(4, 2, 0);
    world.add(frame);
    rider.attach({ frame } as HeroBike);
    world.updateMatrixWorld(true);
    const bones = (rider as unknown as { bones: Map<string, THREE.Bone> }).bones;
    const pelvis = bones.get('pelvis')!;
    rider.update(envelopeFrame(0));
    rider.update(envelopeFrame(1 / 60));
    const baseY = pelvis.position.y;
    const baseSpine = bones.get('spine')!.quaternion.clone();
    // A hard landing at t = 1 s: the window plays through its 2.5 s (stance → extended → absorbed → stance).
    let minY = Infinity, maxSpine = 0;
    for (let i = 0; i < 200; i++) {
      const t = 1 + i / 60;
      rider.update(envelopeFrame(t, i === 0 ? { justLanded: true, landImpulse: 4 } : {}));
      world.updateMatrixWorld(true);
      minY = Math.min(minY, pelvis.position.y);
      maxSpine = Math.max(maxSpine, bones.get('spine')!.quaternion.angleTo(baseSpine));
      expect(rider.debug.handOnGrip, `t=${t.toFixed(2)}`).toEqual([true, true]);
      expect(rider.debug.additiveWeight).toBeGreaterThan(0);
      pelvis.updateWorldMatrix(true, true);
      expect(pelvis.matrixWorld.elements.every(Number.isFinite)).toBe(true);
    }
    // The absorbed hold is 8.8 cm under the stance at the 0.9 max weight → the pelvis dips several cm and returns.
    expect(baseY - minY).toBeGreaterThan(0.03);
    expect(baseY - minY).toBeLessThan(0.09);
    expect(Math.abs(pelvis.position.y - baseY)).toBeLessThan(1e-3);
    // No torso-offset double application: the spine moves by the cycle's own few degrees, never the 10° entry ease.
    expect(maxSpine).toBeLessThan(0.06);
  });
});

describe.skipIf(!STREET)('Astra street rider (mustard, stage-0 file) through prepareHero', () => {
  it('merges the fourteen skinned parts down to one draw per material, keeps every triangle and leaves no physical / blended material', async () => {
    const gltf = await loadRigAt(STREET!, true);
    const raw = countMeshes(gltf.scene);
    await prepareHero(gltf);
    const after = countMeshes(gltf.scene);
    const materials = new Set<THREE.Material>();
    gltf.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) { materials.add(mat); expect(mat.transparent).toBe(false); expect(mat.side).toBe(THREE.DoubleSide); } });
    expect(after.tris).toBe(raw.tris);
    expect(after.meshes).toBeLessThanOrEqual(raw.meshes); // the stage file arrives part-joined by the art build; what is left shares no material
    expect(after.meshes).toBeLessThanOrEqual(materials.size);
    expect(after.physical).toBe(0);
    expect(raw.physical).toBeGreaterThan(0); // KHR_materials_specular on the skin / hair
    const rider = new GltfRider(gltf, lib);
    expect(rider.debug.bones).toBe(19);
    expect(rider.debug.clips).toContain('land_absorb');
  });
});

/** Use the physics suspension geometry to generate valid wheel states independently of rendering. */
function positionWheels(f: RenderFrame, rearCompression: number, frontCompression: number): void {
  const tuning = bikeTuningV2('rookie'), c = Math.cos(f.bikeAngle), s = Math.sin(f.bikeAngle);
  for (const [name, compression] of [['rear', rearCompression], ['front', frontCompression]] as const) {
    const p = suspensionPoint(tuning.suspension[name], compression);
    f[name].x = f.bikeX + p.x * c - p.y * s;
    f[name].y = f.bikeY + p.x * s + p.y * c;
    f[name].compression = compression / tuning.suspension[name].travel;
  }
}

function mechanismFrame(rear: number, front: number): RenderFrame {
  const f = new FrameBuilder().frame;
  f.bikeX = 4; f.bikeY = 2; f.dt = 1 / 60;
  positionWheels(f, rear, front);
  return f;
}

describe.each((['rookie', 'pro'] as const).filter((cls) => BIKES[cls]))('Astra bike %s through the game loader', (cls) => {
  let gltf: GLTF;
  let raw: { meshes: number; physical: number; tris: number };
  beforeAll(async () => {
    // The contact blobs paint a canvas; there is no DOM here.
    vi.stubGlobal('document', { createElement: () => ({ width: 128, height: 64, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), scale() {}, fillRect() {} }) }) });
    gltf = await loadRigAt(BIKES[cls]!, true);
    raw = countMeshes(gltf.scene);
    await prepareHero(gltf);
    const chain = gltf.scene.getObjectByName('chain') as THREE.Mesh;
    chain.material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  });

  it('flattens any physical material, keeps every mechanism part addressable by name', () => {
    // The prototype export is 16 materials with a clearcoat fender and multi-material parts (Groups of `<part>_n`
    // meshes); the art owner's stage-1 file is a 4-material atlas of single meshes. Both must drive the same way.
    const after = countMeshes(gltf.scene);
    expect(after.physical).toBe(0);
    expect(after.tris).toBe(raw.tris);
    for (const name of ['bodywork', 'frame', 'fork_lower', 'fork_upper', 'swingarm', 'handlebar', 'engine', 'exhaust', 'chain', 'brake_hose', 'shock_body', 'shock_shaft', 'shock_clevis', 'shock_spring', 'sprocket_front', 'wheel_front', 'wheel_rear']) {
      const part = gltf.scene.getObjectByName(name) as THREE.Object3D;
      expect(part, name).toBeTruthy();
      expect((part as THREE.Mesh).isMesh || (part as THREE.Group).isGroup, name).toBe(true);
    }
  });

  it('drives the fork, swingarm, shock, chain and hose from wheel states; the livery swap is a no-op on a per-livery file', () => {
    const bike = new GltfBike(gltf, lib);
    const get = (n: string): THREE.Object3D => bike.root.getObjectByName(n)!;
    expect(bike.triangles).toBe(Math.round(raw.tris));
    for (const n of ['attach_grip_L', 'attach_peg_R', 'attach_exhaust_outlet', 'wheel_front_spokes', 'wheel_rear_blur']) expect(get(n), n).toBeTruthy();
    bike.update(mechanismFrame(0, 0));
    bike.root.updateMatrixWorld(true);
    const forkRest = get('fork_lower').position.clone();
    const armRest = get('swingarm').rotation.z;
    const shockRest = bike.debug.shockLength;
    const chain = get('chain') as THREE.Mesh;
    const chainRest = Array.from(chain.geometry.getAttribute('position').array as Float32Array);
    const hose = get('brake_hose') as THREE.Mesh;
    const hoseRest = Array.from(hose.geometry.getAttribute('position').array as Float32Array);
    bike.update(mechanismFrame(0.06, 0.05));
    bike.root.updateMatrixWorld(true);
    expect(get('fork_lower').position.distanceTo(forkRest)).toBeGreaterThan(0.03);
    expect(Math.abs(get('swingarm').rotation.z - armRest)).toBeGreaterThan(0.05);
    expect(Math.abs(bike.debug.shockLength - shockRest)).toBeGreaterThan(0.005);
    expect(bike.debug.armLengthError).toBeLessThan(1e-3);
    const chainNow = chain.geometry.getAttribute('position').array as Float32Array;
    expect(chainNow.some((v, i) => Math.abs(v - chainRest[i]!) > 1e-4)).toBe(true);
    const hoseNow = hose.geometry.getAttribute('position').array as Float32Array;
    expect(hoseNow.some((v, i) => Math.abs(v - hoseRest[i]!) > 1e-4)).toBe(true);
    expect(chainNow.every(Number.isFinite) && hoseNow.every(Number.isFinite)).toBe(true);
    const frameMesh = get('frame').getObjectByProperty('isMesh', true) as THREE.Mesh;
    const frameMat = frameMesh.material;
    bike.setLivery(cls === 'rookie' ? 'pro' : 'rookie');
    expect(frameMesh.material).toBe(frameMat);
    bike.dispose();
  });
});
