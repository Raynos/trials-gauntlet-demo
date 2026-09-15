import { readFile } from 'node:fs/promises';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/** Load the committed geometry, bind matrices and clips through the production decoder. Images
 * are omitted in memory because these tests exercise skeletal transforms in Node without a DOM
 * or GPU. No asset on disk is changed, and this is not a material/render-quality assertion. */
export async function loadRig(file: string): Promise<GLTF> {
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
