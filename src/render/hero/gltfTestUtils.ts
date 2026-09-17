import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/** Load the committed geometry, bind matrices and clips through the production decoder. Images
 * are omitted in memory because these tests exercise skeletal transforms in Node without a DOM
 * or GPU. No asset on disk is changed, and this is not a material/render-quality assertion. */
export async function loadRig(file: string): Promise<GLTF> {
  return loadRigAt(new URL(`../../../public/models/${file}`, import.meta.url));
}

/**
 * Ask 43: the delivered art before the art owner lands it under `public/models` — read in place from the tracked
 * prototype export (never copied), or null when neither the final nor the delivered file exists (the suite skips).
 */
export function deliveredHeroUrl(finalName: string, deliveredName: string): URL | null {
  for (const url of [new URL(`../../../public/models/${finalName}`, import.meta.url), new URL(`../../../prototypes/hero-garage/public/assets/variants/${deliveredName}`, import.meta.url)]) {
    if (existsSync(url)) return url;
  }
  return null;
}

/**
 * `keepMaterials`: keep the material table (names, factors, `KHR_materials_*` extensions) and drop only the texture
 * references, so material grouping and physical-material flattening are testable; the default drops materials whole.
 */
export async function loadRigAt(url: URL, keepMaterials = false): Promise<GLTF> {
  const original = await readFile(url);
  const jsonLength = original.readUInt32LE(12);
  const document = JSON.parse(original.subarray(20, 20 + jsonLength).toString()) as {
    meshes: { primitives: { material?: number; extensions?: Record<string, unknown> }[] }[];
    materials: Record<string, unknown>[];
    textures: unknown[];
    images: unknown[];
    extensions?: Record<string, unknown>;
  };
  if (keepMaterials) {
    const stripTextures = (o: Record<string, unknown>): void => {
      for (const key of Object.keys(o)) {
        if (/Texture$/.test(key)) delete o[key];
        else if (o[key] && typeof o[key] === 'object') stripTextures(o[key] as Record<string, unknown>);
      }
    };
    for (const material of document.materials ?? []) stripTextures(material);
  } else {
    for (const mesh of document.meshes)
      for (const primitive of mesh.primitives) {
        delete primitive.material;
        if (primitive.extensions) delete primitive.extensions.KHR_materials_variants;
      }
    document.materials = [];
    if (document.extensions) delete document.extensions.KHR_materials_variants;
  }
  document.textures = [];
  document.images = [];
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
