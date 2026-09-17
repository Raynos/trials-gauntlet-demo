/** Verify an actual meshopt GLB with the runtime decoder, without a browser, DOM or GPU.
 *  Legacy base-body contract (8 clips, rider_rookie/rider_pro variants, one draw, 6 k LOD) for rider_asset.py exports;
 *  the shipped hero-art family is verified by verify_hero_art.mjs. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const bones = ['pelvis', 'spine', 'chest', 'neck', 'head', ...['L', 'R'].flatMap(side =>
  ['shoulder', 'upperArm', 'forearm', 'hand', 'thigh', 'shin', 'foot'].map(bone => `${bone}.${side}`))].sort();
const clips = ['stand_attack', 'hang_back', 'forward_attack', 'crouch', 'extend', 'land_absorb', 'idle_breathe', 'sit_cruise'].sort();
const variants = ['rider_rookie', 'rider_pro'];

export async function verifyRiderAsset(path, lod = false) {
  const original = await readFile(path);
  assert.equal(original.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(original.readUInt32LE(4), 2, 'GLB version');
  assert.equal(original.readUInt32LE(8), original.length, 'GLB byte length');
  assert.equal(original.readUInt32LE(16), 0x4e4f534a, 'JSON chunk');
  const jsonLength = original.readUInt32LE(12);
  const document = JSON.parse(original.subarray(20, 20 + jsonLength).toString());
  assert.equal(document.skins?.length, 1, 'one skin');
  assert.deepEqual(document.skins[0].joints.map(index => document.nodes[index].name).sort(), bones, '19 exact core bones');
  assert.deepEqual(document.animations?.map(animation => animation.name).sort(), clips, 'eight exact clips');
  assert.deepEqual(document.extensions?.KHR_materials_variants?.variants?.map(variant => variant.name), variants, 'both colourways');
  assert(document.extensionsUsed?.includes('EXT_meshopt_compression'), 'meshopt compression');
  assert.equal(document.meshes?.length, 1, 'one rider mesh');
  assert.equal(document.meshes[0].name, 'rider');
  assert.equal(document.meshes[0].primitives.length, 1, 'one skinned draw');
  const primitive = document.meshes[0].primitives[0];
  assert.equal(primitive.mode ?? 4, 4, 'triangle topology');
  assert.equal(document.materials[primitive.material]?.name, variants[0], 'rookie default material');
  const mappings = primitive.extensions?.KHR_materials_variants?.mappings;
  for (let index = 0; index < variants.length; index++) {
    const matches = mappings?.filter(mapping => mapping.variants.includes(index));
    assert.equal(matches?.length, 1, `one mapping for ${variants[index]}`);
    assert.equal(document.materials[matches[0].material]?.name, variants[index], `mapped ${variants[index]} material`);
  }
  assert(!primitive.targets?.length, 'morph targets need a runtime migration');
  for (const name of Object.keys(primitive.attributes)) assert(!/^(JOINTS|WEIGHTS)_[1-9]/.test(name), 'maximum four skin influences');
  assert(document.images?.length >= 4, 'embedded albedo pair, normal and ORM images');
  for (const image of document.images) assert(Number.isInteger(image.bufferView) && !image.uri, 'self-contained image');
  for (const buffer of document.buffers ?? []) assert(!buffer.uri, 'self-contained buffers');

  // Leave all geometry, animation, skin and bind data intact. Omitting image/material objects in
  // memory lets the production loader decode the real binary data without browser image APIs.
  delete primitive.material;
  delete primitive.extensions.KHR_materials_variants;
  document.materials = [];
  document.textures = [];
  document.images = [];
  delete document.extensions.KHR_materials_variants;
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
  let rawWeightError = 0;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.register(parser => ({
    name: 'RiderRawWeights',
    async beforeRoot() {
      // GLTFLoader normalizes skin weights while creating SkinnedMesh. Check the decoded
      // accessor first, otherwise the loader would conceal a broken export (even all-zero weights).
      const raw = await parser.getDependency('accessor', primitive.attributes.WEIGHTS_0);
      assert.equal(raw.itemSize, 4, 'four raw skin weights');
      for (let vertex = 0; vertex < raw.count; vertex++) {
        let total = 0;
        for (let lane = 0; lane < 4; lane++) {
          const weight = raw.getComponent(vertex, lane);
          assert(Number.isFinite(weight) && weight >= 0 && weight <= 1, `valid raw skin weight ${vertex}/${lane}`);
          total += weight;
        }
        rawWeightError = Math.max(rawWeightError, Math.abs(total - 1));
      }
      assert(rawWeightError < 1e-4, `normalized raw skin weights, error ${rawWeightError}`);
    },
  }));
  const gltf = await loader.parseAsync(input.buffer, '');
  const meshes = [];
  gltf.scene.traverse(object => { if (object.isSkinnedMesh) meshes.push(object); });
  assert.equal(meshes.length, 1, 'decoded skinned mesh');
  const mesh = meshes[0], geometry = mesh.geometry;
  assert.equal(mesh.skeleton.bones.length, 19, 'decoded skeleton');
  const positions = geometry.getAttribute('position');
  const joints = geometry.getAttribute('skinIndex');
  const weights = geometry.getAttribute('skinWeight');
  assert(positions?.count > 0 && joints && weights, 'decoded positions and skin attributes');
  assert.equal(joints.itemSize, 4);
  assert.equal(weights.itemSize, 4);
  assert.equal(joints.count, positions.count);
  assert.equal(weights.count, positions.count);
  let maxWeightError = 0;
  for (let vertex = 0; vertex < positions.count; vertex++) {
    for (let axis = 0; axis < 3; axis++) assert(Number.isFinite(positions.getComponent(vertex, axis)), `finite position ${vertex}`);
    let total = 0;
    for (let lane = 0; lane < 4; lane++) {
      const joint = joints.getComponent(vertex, lane), weight = weights.getComponent(vertex, lane);
      assert(Number.isInteger(joint) && joint >= 0 && joint < 19, `valid joint ${vertex}/${lane}`);
      assert(Number.isFinite(weight) && weight >= 0 && weight <= 1, `valid weight ${vertex}/${lane}`);
      total += weight;
    }
    maxWeightError = Math.max(maxWeightError, Math.abs(total - 1));
  }
  // Normalized integer accessor quantization can leave a few 16-bit units of error.
  assert(maxWeightError < 1e-4, `normalized decoded skin weights, error ${maxWeightError}`);
  const indices = geometry.getIndex();
  if (indices) for (const index of indices.array) assert(index < positions.count, 'index within vertex buffer');
  const triangles = (indices?.count ?? positions.count) / 3;
  assert(Number.isInteger(triangles) && triangles > 0, 'decoded triangle count');
  if (lod) assert(triangles <= 6000, `LOD triangle budget: ${triangles}`);
  for (const animation of gltf.animations) {
    assert(animation.duration > 0 && animation.tracks.length > 0, `${animation.name} contains sampled animation`);
    for (const track of animation.tracks) {
      for (const value of track.values) assert(Number.isFinite(value), `finite ${track.name} samples`);
      for (const time of track.times) assert(Number.isFinite(time) && time >= 0, `finite ${track.name} time`);
    }
  }
  return { bytes: original.length, triangles, vertices: positions.count, bones: 19, clips, variants, maxWeightError: rawWeightError, loadedWeightError: maxWeightError };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await verifyRiderAsset(process.argv[2], process.argv.includes('--lod'));
  process.stdout.write(JSON.stringify(result) + '\n');
}
