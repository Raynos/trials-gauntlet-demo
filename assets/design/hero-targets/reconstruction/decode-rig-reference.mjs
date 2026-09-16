// Lossless meshopt buffer-view decoding for the character plugin's stdlib GLB reader.
// This is evidence preparation, never geometry imported into the procedural factory.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const [source, destination] = process.argv.slice(2);
assert(source && destination, 'usage: node decode-rig-reference.mjs source.glb destination.glb');
const input = await readFile(source);
assert.equal(input.readUInt32LE(0), 0x46546c67);
assert.equal(input.readUInt32LE(8), input.length);
const length = input.readUInt32LE(12);
const document = JSON.parse(input.subarray(20, 20 + length).toString());
const binary = input.subarray(28 + length);
await MeshoptDecoder.ready;
let offset = 0;
const chunks = [];
let decoded = 0;
for (const view of document.bufferViews) {
  const extension = view.extensions?.EXT_meshopt_compression;
  let bytes;
  if (extension) {
    assert.equal(extension.buffer, 0, 'compressed source must be embedded buffer0');
    bytes = Buffer.alloc(extension.count * extension.byteStride);
    const start = extension.byteOffset ?? 0;
    MeshoptDecoder.decodeGltfBuffer(bytes, extension.count, extension.byteStride,
      binary.subarray(start, start + extension.byteLength), extension.mode, extension.filter);
    // The exporter reserves a float-sized fallback view for quantized quaternion data.
    // Runtime meshopt decoding returns count*stride; preserve that exact byte representation.
    view.byteLength = bytes.length;
    delete view.extensions.EXT_meshopt_compression;
    if (!Object.keys(view.extensions).length) delete view.extensions;
    decoded++;
  } else {
    assert.equal(view.buffer, 0, 'uncompressed source must be embedded buffer0');
    bytes = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    assert.equal(bytes.length, view.byteLength);
  }
  view.buffer = 0;
  view.byteOffset = offset;
  const padding = Buffer.alloc((4 - bytes.length % 4) % 4);
  chunks.push(bytes, padding);
  offset += bytes.length + padding.length;
}
document.buffers = [{ byteLength: offset }];
for (const key of ['extensionsUsed', 'extensionsRequired']) {
  if (document[key]) document[key] = document[key].filter(x => x !== 'EXT_meshopt_compression');
}
const json = Buffer.from(JSON.stringify(document));
const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + padded.length + offset, 8);
header.writeUInt32LE(padded.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(offset, 0);
binHeader.writeUInt32LE(0x004e4942, 4);
const output = Buffer.concat([header, padded, binHeader, ...chunks]);
await writeFile(destination, output, { flag: 'wx' });
console.log(JSON.stringify({ source, destination, decodedViews: decoded,
  sourceSha256: createHash('sha256').update(input).digest('hex'),
  outputSha256: createHash('sha256').update(output).digest('hex'),
  scope: 'meshopt decode only; node indices, skin joint order and animation channels unchanged' }));
