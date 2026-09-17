/** Verify a hero-art GLB (rider or bike) against its decoded delivery with the production loader.
 *  No browser, DOM or GPU: images/materials are stripped in memory, geometry/skin/animation decoded for real.
 *  Usage: node assets/blender/verify_hero_art.mjs --kind rider|bike --source decoded.glb --output out.glb [--tris N] [--draws N] [--json]
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { glbStats } from './glb_stats.mjs';

const RIDER_BONES = ['pelvis', 'spine', 'chest', 'neck', 'head', ...['L', 'R'].flatMap(side =>
  ['shoulder', 'upperArm', 'forearm', 'hand', 'thigh', 'shin', 'foot'].map(bone => `${bone}.${side}`))].sort();
const RIDER_CLIPS = { sit_cruise: 59 / 30, forward_attack: 119 / 30, hang_back: 119 / 30, compression: 149 / 30, extension: 149 / 30, landing_absorption: 149 / 30 };
const RIDER_SOCKETS = ['gripSocket.L', 'gripSocket.R', 'soleSocket.L', 'soleSocket.R'];
const BIKE_PARTS = 'frame bodywork engine exhaust handlebar pegs fork_upper fork_lower swingarm shock_body shock_shaft shock_clevis shock_spring wheel_front wheel_front_spokes wheel_front_blur wheel_rear wheel_rear_spokes wheel_rear_blur sprocket_front sprocket_rear chain brake_hose'.split(' ');
const BIKE_MARKERS = 'frame_origin chassis_com swing_pivot swing_axle shock_link fork_top front_axle_rest rear_axle_rest shock_top shock_upper_seat shock_lower_seat shock_rod_top shock_eye countershaft front_pitch rear_sprocket rear_pitch exhaust_outlet grip_L grip_R peg_L peg_R'.split(' ').map(n => `attach_${n}`);
const BIKE_PROTECTED = ['chain', 'brake_hose', 'wheel_front_blur', 'wheel_rear_blur', 'wheel_front_spokes', 'wheel_rear_spokes'];

function stripped(original) {
  assert.equal(original.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(original.readUInt32LE(8), original.length, 'GLB byte length');
  const jsonLength = original.readUInt32LE(12);
  const document = JSON.parse(original.subarray(20, 20 + jsonLength).toString());
  for (const buffer of document.buffers ?? []) assert(!buffer.uri, 'self-contained buffers');
  for (const image of document.images ?? []) assert(Number.isInteger(image.bufferView) && !image.uri, 'self-contained image');
  for (const mesh of document.meshes ?? []) for (const primitive of mesh.primitives) {
    delete primitive.material;
    delete primitive.extensions?.KHR_materials_variants;
    assert(!primitive.targets?.length, 'no morph targets');
    for (const name of Object.keys(primitive.attributes)) assert(!/^(JOINTS|WEIGHTS)_[1-9]/.test(name), 'maximum four skin influences');
  }
  document.materials = []; document.textures = []; document.images = [];
  delete document.extensions?.KHR_materials_variants;
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const binaryChunk = original.subarray(20 + jsonLength);
  const input = Buffer.alloc(20 + padded.length + binaryChunk.length);
  original.copy(input, 0, 0, 12);
  input.writeUInt32LE(input.length, 8);
  input.writeUInt32LE(padded.length, 12);
  input.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(input, 20);
  binaryChunk.copy(input, 20 + padded.length);
  return { document, input };
}

async function load(path) {
  const { document, input } = stripped(await readFile(path));
  let rawWeightError = 0, skinned = 0;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.register(parser => ({
    name: 'RawWeights',
    async beforeRoot() {
      for (const mesh of document.meshes ?? []) for (const primitive of mesh.primitives) {
        if (primitive.attributes.WEIGHTS_0 == null) continue;
        skinned++;
        const raw = await parser.getDependency('accessor', primitive.attributes.WEIGHTS_0);
        assert.equal(raw.itemSize, 4, 'four raw skin weights');
        for (let vertex = 0; vertex < raw.count; vertex++) {
          let total = 0;
          for (let lane = 0; lane < 4; lane++) {
            const weight = raw.getComponent(vertex, lane);
            assert(Number.isFinite(weight) && weight >= 0 && weight <= 1.0001, `valid raw skin weight ${vertex}/${lane}`);
            total += weight;
          }
          rawWeightError = Math.max(rawWeightError, Math.abs(total - 1));
        }
      }
    },
  }));
  const gltf = await loader.parseAsync(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  return { gltf, document, rawWeightError, skinned };
}

const near = (a, b, eps, what) => { const d = Math.abs(a - b); assert(d <= eps, `${what}: ${a} vs ${b} (diff ${d})`); return d; };
const nearArray = (a, b, eps, what) => { assert.equal(a.length, b.length, `${what} length`); let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, near(a[i], b[i], eps, `${what}[${i}]`)); return m; };

function geometryStats(scene) {
  let triangles = 0, draws = 0, vertices = 0;
  scene.traverse(object => {
    if (!object.isMesh) return;
    draws += Array.isArray(object.material) ? Math.max(1, object.geometry.groups.length) : 1;
    const g = object.geometry, positions = g.getAttribute('position');
    vertices += positions.count;
    triangles += (g.getIndex()?.count ?? positions.count) / 3;
    for (let v = 0; v < positions.count; v++) for (let axis = 0; axis < 3; axis++) assert(Number.isFinite(positions.getComponent(v, axis)), `finite position ${object.name} ${v}`);
    const index = g.getIndex();
    if (index) for (const i of index.array) assert(i < positions.count, `index within vertex buffer ${object.name}`);
  });
  return { triangles, draws, vertices };
}

function localTRS(object) {
  return [...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray()];
}

export async function verifyRider(sourcePath, outputPath, { tris = 60000, draws = 12, sampleStep = 1 / 30, durationTolerance = 1e-4, poseTolerance = 1e-3 } = {}) {
  const src = await load(sourcePath), out = await load(outputPath);
  const stats = glbStats(outputPath);
  if (!process.env.HERO_ART_ALLOW_RAW) assert(stats.extensionsUsed.includes('EXT_meshopt_compression'), 'meshopt compression');
  assert.equal(out.document.skins?.length, 1, 'one skin');
  const jointNames = out.document.skins[0].joints.map(i => out.document.nodes[i].name).sort();
  assert.deepEqual(jointNames, RIDER_BONES, '19 exact core bones');
  assert(out.rawWeightError < 1e-4, `normalized raw skin weights, error ${out.rawWeightError}`);

  // skeleton rest transforms + inverse binds vs the delivery
  const skinnedOut = [], skinnedSrc = [];
  out.gltf.scene.traverse(o => { if (o.isSkinnedMesh) skinnedOut.push(o); });
  src.gltf.scene.traverse(o => { if (o.isSkinnedMesh) skinnedSrc.push(o); });
  assert(skinnedOut.length > 0, 'decoded skinned meshes');
  const skeletonOut = skinnedOut[0].skeleton, skeletonSrc = skinnedSrc[0].skeleton;
  assert.equal(skeletonOut.bones.length, 19, 'decoded skeleton');
  let restError = 0, bindError = 0;
  for (const bone of skeletonOut.bones) {
    const source = skeletonSrc.bones.find(b => b.name === bone.name);
    assert(source, `source bone ${bone.name}`);
    assert.equal(bone.parent?.name.replace(/^rider_rig$/, 'root'), source.parent?.name.replace(/^rider_rig$/, 'root') ?? 'root', `parent of ${bone.name}`);
    restError = Math.max(restError, nearArray(localTRS(bone), localTRS(source), 2e-5, `rest ${bone.name}`));
    const io = skeletonOut.boneInverses[skeletonOut.bones.indexOf(bone)].elements;
    const is = skeletonSrc.boneInverses[skeletonSrc.bones.indexOf(source)].elements;
    bindError = Math.max(bindError, nearArray(io, is, 2e-5, `inverse bind ${bone.name}`));
  }
  // sockets: same parent bone, same local offset
  let socketError = 0;
  for (const raw of RIDER_SOCKETS) {
    const name = THREE.PropertyBinding.sanitizeNodeName(raw);
    assert(out.document.nodes.some(n => n.name === raw), `raw socket name ${raw}`);
    const o = out.gltf.scene.getObjectByName(name), s = src.gltf.scene.getObjectByName(name);
    assert(o && s, `socket ${name}`);
    assert.equal(o.parent.name, s.parent.name, `socket parent ${name}`);
    socketError = Math.max(socketError, nearArray(localTRS(o), localTRS(s), 2e-5, `socket ${name}`));
  }
  // clips: names, durations, finite tracks, and pose agreement with the source at every 1/30 s
  const names = out.gltf.animations.map(a => a.name).sort();
  assert.deepEqual(names, Object.keys(RIDER_CLIPS).sort(), 'six exact clips');
  let clipError = 0;
  const clipReport = {};
  for (const clip of out.gltf.animations) {
    const durationError = near(clip.duration, RIDER_CLIPS[clip.name], durationTolerance, `duration ${clip.name}`);
    for (const track of clip.tracks) {
      for (const value of track.values) assert(Number.isFinite(value), `finite ${track.name}`);
      for (const time of track.times) assert(Number.isFinite(time) && time >= 0, `finite time ${track.name}`);
    }
    const sourceClip = src.gltf.animations.find(a => a.name === clip.name);
    const mixerOut = new THREE.AnimationMixer(out.gltf.scene), mixerSrc = new THREE.AnimationMixer(src.gltf.scene);
    const actionOut = mixerOut.clipAction(clip).play(), actionSrc = mixerSrc.clipAction(sourceClip).play();
    let worst = 0, frames = 0;
    for (let t = 0; t <= clip.duration + 1e-6; t += sampleStep) {
      actionOut.time = t; actionSrc.time = t; mixerOut.update(0); mixerSrc.update(0);
      out.gltf.scene.updateMatrixWorld(true); src.gltf.scene.updateMatrixWorld(true);
      for (const bone of skeletonOut.bones) {
        const s = skeletonSrc.bones.find(b => b.name === bone.name);
        const po = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld), ps = new THREE.Vector3().setFromMatrixPosition(s.matrixWorld);
        const qo = new THREE.Quaternion().setFromRotationMatrix(bone.matrixWorld), qs = new THREE.Quaternion().setFromRotationMatrix(s.matrixWorld);
        for (const v of [...po.toArray(), ...qo.toArray()]) assert(Number.isFinite(v), `finite pose ${clip.name} ${bone.name} @${t}`);
        const dq = qo.clone().multiply(qs.clone().invert());
        worst = Math.max(worst, po.distanceTo(ps), 2 * Math.atan2(Math.hypot(dq.x, dq.y, dq.z), Math.abs(dq.w)));
      }
      frames++;
    }
    actionOut.stop(); actionSrc.stop(); mixerOut.uncacheRoot(out.gltf.scene); mixerSrc.uncacheRoot(src.gltf.scene);
    clipReport[clip.name] = { duration: +clip.duration.toFixed(6), durationError, frames, worstWorldError: worst };
    clipError = Math.max(clipError, worst);
  }
  assert(clipError < poseTolerance, `clip pose agreement with the delivery (m / rad): ${clipError}`);
  // socket drift across all frames of the delivery is < 2.3 µm by contract; check we did not animate sockets
  for (const clip of out.gltf.animations) for (const track of clip.tracks) assert(!RIDER_SOCKETS.some(s => track.name.startsWith(THREE.PropertyBinding.sanitizeNodeName(s) + '.')), `socket animated: ${track.name}`);

  const geometry = geometryStats(out.gltf.scene);
  assert(geometry.triangles <= tris, `triangle budget: ${geometry.triangles} > ${tris}`);
  assert(geometry.draws <= draws, `draw budget: ${geometry.draws} > ${draws}`);
  return {
    bytes: stats.bytes, sha256: stats.sha256, triangles: geometry.triangles, vertices: geometry.vertices, draws: geometry.draws,
    meshes: stats.meshes, materials: stats.materials, images: stats.images, maxTexture: stats.maxTexture, imageBytes: stats.imageBytes,
    bones: 19, sockets: RIDER_SOCKETS, clips: clipReport, restError, bindError, socketError, clipError, rawWeightError: out.rawWeightError,
    extensions: stats.extensionsUsed,
  };
}

export async function verifyBike(sourcePath, outputPath, { tris = 34000, draws = 40 } = {}) {
  const src = await load(sourcePath), out = await load(outputPath);
  const stats = glbStats(outputPath);
  assert(stats.extensionsUsed.includes('EXT_meshopt_compression'), 'meshopt compression');
  assert(stats.extensionsUsed.includes('KHR_texture_transform'), 'texture transforms kept');
  const outNames = new Set(); out.gltf.scene.traverse(o => outNames.add(o.name));
  for (const name of [...BIKE_PARTS, ...BIKE_MARKERS, 'bike']) assert(outNames.has(name), `node ${name}`);
  let transformError = 0;
  const extras = {};
  for (const name of [...BIKE_PARTS, ...BIKE_MARKERS]) {
    const o = out.gltf.scene.getObjectByName(name), s = src.gltf.scene.getObjectByName(name);
    assert.equal(o.parent.name, s.parent.name, `parent of ${name}`);
    transformError = Math.max(transformError, nearArray(localTRS(o), localTRS(s), 2e-5, `transform ${name}`));
    if (s.userData && Object.keys(s.userData).length) {
      assert.deepEqual(o.userData, s.userData, `extras ${name}`);
      extras[name] = Object.keys(s.userData);
    }
  }
  assert.deepEqual(out.gltf.scene.getObjectByName('bike').userData, src.gltf.scene.getObjectByName('bike').userData, 'bike root extras');
  let protectedError = 0;
  for (const name of BIKE_PROTECTED) {
    const o = out.gltf.scene.getObjectByName(name), s = src.gltf.scene.getObjectByName(name);
    const po = o.geometry.getAttribute('position'), ps = s.geometry.getAttribute('position');
    assert.equal(o.geometry.getIndex()?.count ?? 0, s.geometry.getIndex()?.count ?? 0, `protected triangle count ${name}`);
    // Blender may re-split vertices along normal/UV seams on re-export; the surface itself must be identical.
    const key = (attribute, v) => [0, 1, 2].map(axis => Math.round(attribute.getComponent(v, axis) * 1e4)).join(',');
    const sourcePositions = new Set(); for (let v = 0; v < ps.count; v++) sourcePositions.add(key(ps, v));
    const outputPositions = new Set(); for (let v = 0; v < po.count; v++) outputPositions.add(key(po, v));
    assert.equal(outputPositions.size, sourcePositions.size, `protected unique positions ${name}`);
    for (const k of outputPositions) assert(sourcePositions.has(k), `protected position moved ${name} ${k}`);
    if (['chain', 'brake_hose'].includes(name)) {
      // the runtime deforms these from vertex order: require the exact vertex sequence
      assert.equal(po.count, ps.count, `protected vertex order ${name}`);
      for (let v = 0; v < po.count; v++) for (let axis = 0; axis < 3; axis++) protectedError = Math.max(protectedError, near(po.getComponent(v, axis), ps.getComponent(v, axis), 1e-3, `protected ${name} ${v}`));
    }
  }
  const geometry = geometryStats(out.gltf.scene);
  assert(geometry.triangles <= tris, `triangle budget: ${geometry.triangles} > ${tris}`);
  assert(geometry.draws <= draws, `draw budget: ${geometry.draws} > ${draws}`);
  const bounds = new THREE.Box3().setFromObject(out.gltf.scene);
  return {
    bytes: stats.bytes, sha256: stats.sha256, triangles: geometry.triangles, vertices: geometry.vertices, draws: geometry.draws,
    meshes: stats.meshes, materials: stats.materials, images: stats.images, maxTexture: stats.maxTexture, imageBytes: stats.imageBytes,
    parts: BIKE_PARTS.length, markers: BIKE_MARKERS.length, transformError, protectedError, extras, extensions: stats.extensionsUsed,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const get = flag => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const kind = get('--kind'), source = get('--source'), output = get('--output');
  const options = {};
  if (get('--tris')) options.tris = +get('--tris');
  if (get('--draws')) options.draws = +get('--draws');
  const result = kind === 'bike' ? await verifyBike(source, output, options) : await verifyRider(source, output, options);
  process.stdout.write(JSON.stringify(result) + '\n');
}
