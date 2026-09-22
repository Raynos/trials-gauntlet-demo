/** Meshopt-pack an uncompressed GLB with high-precision filters (a gltfpack-lite for the hero art).
 *
 *  Blender 5.2's built-in EXT_meshopt_compression exporter quantizes rotations to 8 bits and times/positions to a
 *  12-bit shared exponent, which moved the delivered clips by up to 3 cm / 1.8 deg at the hands. This packer keeps
 *  animation times, UVs, joints, weights, scales and inverse binds lossless, quantizes rotations to 16-bit
 *  quaternions and positions/translations with a 16-bit exponent filter, and octahedral-encodes normals.
 *
 *  Usage: node assets/blender/hero_art_pack.mjs in.glb out.glb [--position-bits 16] [--normal-bits 8] [--quat-bits 16]
 *  Every packed stream is decoded back with the production MeshoptDecoder and compared before the file is written.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

async function loadEncoder() {
  // meshoptimizer@1.1.1 is a root devDependency; resolve it from the repo, never from a prototype.
  return (await import('meshoptimizer/encoder')).MeshoptEncoder;
}

const ELEMS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

export function readGlb(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB length');
  const n = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'JSON chunk');
  const doc = JSON.parse(bytes.subarray(20, 20 + n).toString());
  const binLength = bytes.readUInt32LE(20 + n);
  assert.equal(bytes.readUInt32LE(24 + n), 0x004e4942, 'BIN chunk');
  return { doc, bin: bytes.subarray(28 + n, 28 + n + binLength) };
}

export function writeGlb(doc, bin) {
  const json = Buffer.from(JSON.stringify(doc));
  const jp = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const bp = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
  const out = Buffer.alloc(28 + jp.length + bp.length);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jp.length, 12); out.writeUInt32LE(0x4e4f534a, 16); jp.copy(out, 20);
  out.writeUInt32LE(bp.length, 20 + jp.length); out.writeUInt32LE(0x004e4942, 24 + jp.length); bp.copy(out, 28 + jp.length);
  return out;
}

/** Classify every accessor by how the document uses it. */
function roles(doc) {
  const role = new Map();
  const set = (index, r) => { if (index == null) return; const prev = role.get(index); assert(!prev || prev === r, `accessor ${index} used as ${prev} and ${r}`); role.set(index, r); };
  for (const mesh of doc.meshes ?? []) for (const p of mesh.primitives) {
    for (const [name, index] of Object.entries(p.attributes)) set(index, `attr:${name.replace(/_\d+$/, '')}`);
    set(p.indices, (p.mode ?? 4) === 4 ? 'indices' : 'indices-other');
    for (const t of p.targets ?? []) for (const index of Object.values(t)) set(index, 'morph');
  }
  for (const s of doc.skins ?? []) set(s.inverseBindMatrices, 'ibm');
  for (const a of doc.animations ?? []) for (const [i, s] of a.samplers.entries()) {
    set(s.input, 'time');
    const paths = new Set(a.channels.filter(c => c.sampler === i).map(c => c.target.path));
    assert.equal(paths.size, 1, 'sampler output path');
    set(s.output, `anim:${[...paths][0]}`);
  }
  return role;
}

export async function pack(input, output, options = {}) {
  const positionBits = options.positionBits ?? 16, normalBits = options.normalBits ?? 8, quatBits = options.quatBits ?? 16;
  const MeshoptEncoder = await loadEncoder();
  await MeshoptEncoder.ready; await MeshoptDecoder.ready;
  const raw = fs.readFileSync(input);
  const { doc, bin } = readGlb(raw);
  assert.equal(doc.buffers.length, 1, 'single embedded buffer');
  assert(!(doc.bufferViews ?? []).some(v => v.extensions?.EXT_meshopt_compression), 'input already compressed');
  const role = roles(doc);
  const byView = new Map();
  for (const [index, accessor] of (doc.accessors ?? []).entries()) {
    assert(!accessor.sparse, 'sparse accessors unsupported');
    assert(accessor.bufferView != null, 'accessor without bufferView');
    byView.set(accessor.bufferView, [...(byView.get(accessor.bufferView) ?? []), index]);
  }
  const imageViews = new Set((doc.images ?? []).map(i => i.bufferView));
  const chunks = [];
  let length = 0, virtual = 0;
  const push = buffer => { const pad = (4 - length % 4) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); length += pad; } const at = length; chunks.push(Buffer.from(buffer)); length += buffer.length; return at; };
  const report = { input: path.resolve(input), output: path.resolve(output), views: [], positionBits, normalBits, quatBits };
  const newViews = [];
  for (const [id, view] of (doc.bufferViews ?? []).entries()) {
    const source = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const next = { ...view };
    delete next.extensions;
    const accessors = byView.get(id) ?? [];
    let plan = null;
    if (!imageViews.has(id) && accessors.length === 1) {
      const a = doc.accessors[accessors[0]];
      const r = role.get(accessors[0]);
      const elems = ELEMS[a.type], size = BYTES[a.componentType] * elems;
      const stride = view.byteStride ?? size;
      if ((a.byteOffset ?? 0) === 0 && stride === size && a.count * stride === view.byteLength) {
        if (r === 'indices' && (size === 2 || size === 4) && a.count % 3 === 0) plan = { mode: 'TRIANGLES', filter: 'NONE', stride: size };
        else if (r === 'indices-other' && (size === 2 || size === 4)) plan = { mode: 'INDICES', filter: 'NONE', stride: size };
        else if (r === 'attr:POSITION' && a.componentType === 5126 && a.type === 'VEC3') plan = { mode: 'ATTRIBUTES', filter: 'EXPONENTIAL', stride: 12, bits: positionBits };
        else if (r === 'anim:translation' && a.componentType === 5126 && a.type === 'VEC3') plan = { mode: 'ATTRIBUTES', filter: 'EXPONENTIAL', stride: 12, bits: positionBits };
        else if (r === 'attr:NORMAL' && a.componentType === 5126 && a.type === 'VEC3') plan = { mode: 'ATTRIBUTES', filter: 'OCTAHEDRAL', stride: normalBits > 8 ? 8 : 4, bits: normalBits };
        else if (r === 'anim:rotation' && a.componentType === 5126 && a.type === 'VEC4') plan = { mode: 'ATTRIBUTES', filter: 'QUATERNION', stride: 8, bits: quatBits };
        else if (r !== 'morph' && stride % 4 === 0 && stride <= 256) plan = { mode: 'ATTRIBUTES', filter: 'NONE', stride };
      }
      if (plan) {
        const count = a.count;
        let filtered = source;
        if (plan.filter === 'EXPONENTIAL') {
          const floats = new Float32Array(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
          filtered = MeshoptEncoder.encodeFilterExp(floats, count, plan.stride, plan.bits, 'SharedVector');
        } else if (plan.filter === 'OCTAHEDRAL') {
          const xyz = new Float32Array(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
          const floats = new Float32Array(count * 4); // the octahedral filter reads 4 floats per element
          for (let i = 0; i < count; i++) { floats[i * 4] = xyz[i * 3]; floats[i * 4 + 1] = xyz[i * 3 + 1]; floats[i * 4 + 2] = xyz[i * 3 + 2]; floats[i * 4 + 3] = 1; }
          filtered = MeshoptEncoder.encodeFilterOct(floats, count, plan.stride, plan.bits);
          a.componentType = plan.stride === 4 ? 5120 : 5122;
          a.normalized = true;
          delete a.min; delete a.max;
        } else if (plan.filter === 'QUATERNION') {
          const floats = new Float32Array(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
          filtered = MeshoptEncoder.encodeFilterQuat(floats, count, plan.stride, plan.bits);
          a.componentType = 5122;
          a.normalized = true;
          delete a.min; delete a.max;
        }
        const encoded = plan.mode === 'ATTRIBUTES'
          ? MeshoptEncoder.encodeVertexBuffer(filtered, count, plan.stride)
          : plan.mode === 'TRIANGLES' ? MeshoptEncoder.encodeIndexBuffer(filtered, count, plan.stride)
            : MeshoptEncoder.encodeIndexSequence(filtered, count, plan.stride);
        // prove the production decoder reproduces the (filtered) stream
        const decoded = new Uint8Array(count * plan.stride);
        MeshoptDecoder.decodeGltfBuffer(decoded, count, plan.stride, encoded, plan.mode, plan.filter);
        let maxError = 0;
        if (plan.filter === 'NONE' && plan.mode === 'TRIANGLES') {
          // the triangle codec keeps triangle order and winding but may rotate each triangle's start vertex
          const A = plan.stride === 2 ? new Uint16Array(filtered.buffer, filtered.byteOffset, count) : new Uint32Array(filtered.buffer, filtered.byteOffset, count);
          const B = plan.stride === 2 ? new Uint16Array(decoded.buffer) : new Uint32Array(decoded.buffer);
          for (let t = 0; t < count; t += 3) {
            const ok = [0, 1, 2].some(k => A[t] === B[t + k] && A[t + 1] === B[t + (k + 1) % 3] && A[t + 2] === B[t + (k + 2) % 3]);
            assert(ok, `triangle ${t / 3} of stream ${id} changed`);
          }
        } else if (plan.filter === 'NONE') assert(Buffer.from(decoded).equals(Buffer.from(filtered)), `lossless stream ${id} (${r})`);
        else if (plan.filter === 'EXPONENTIAL') {
          const got = new Float32Array(decoded.buffer), want = new Float32Array(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
          for (let i = 0; i < want.length; i++) maxError = Math.max(maxError, Math.abs(got[i] - want[i]));
          assert(maxError < 1e-3, `exponent filter error ${maxError} on ${r}`);
          if (a.min && a.max) { // keep accessor bounds truthful after quantization
            for (let i = 0; i < want.length; i++) { const c = i % elems; a.min[c] = Math.min(a.min[c], got[i]); a.max[c] = Math.max(a.max[c], got[i]); }
          }
        } else if (plan.filter === 'OCTAHEDRAL') {
          const got = plan.stride === 4 ? new Int8Array(decoded.buffer) : new Int16Array(decoded.buffer), scale = plan.stride === 4 ? 127 : 32767;
          const want = new Float32Array(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
          const per = plan.stride === 4 ? 4 : 4;
          for (let i = 0; i < count; i++) {
            const n = [got[i * per] / scale, got[i * per + 1] / scale, got[i * per + 2] / scale];
            const l = Math.hypot(...n) || 1;
            const dot = (n[0] * want[i * 3] + n[1] * want[i * 3 + 1] + n[2] * want[i * 3 + 2]) / l / (Math.hypot(want[i * 3], want[i * 3 + 1], want[i * 3 + 2]) || 1);
            maxError = Math.max(maxError, Math.acos(Math.max(-1, Math.min(1, dot))));
          }
          assert(maxError < 0.05, `octahedral normal error ${maxError} rad`);
        } else if (plan.filter === 'QUATERNION') {
          const got = new Int16Array(decoded.buffer), want = new Float32Array(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
          for (let i = 0; i < count; i++) {
            const q = [got[i * 4] / 32767, got[i * 4 + 1] / 32767, got[i * 4 + 2] / 32767, got[i * 4 + 3] / 32767];
            const l = Math.hypot(...q) || 1;
            const dot = Math.abs((q[0] * want[i * 4] + q[1] * want[i * 4 + 1] + q[2] * want[i * 4 + 2] + q[3] * want[i * 4 + 3]) / l);
            maxError = Math.max(maxError, 2 * Math.acos(Math.min(1, dot)));
          }
          assert(maxError < 2e-3, `quaternion filter error ${maxError} rad`);
        }
        const at = push(encoded);
        virtual += (4 - virtual % 4) % 4;
        next.buffer = 1; next.byteOffset = virtual; next.byteLength = count * plan.stride;
        if (plan.mode === 'ATTRIBUTES') next.byteStride = plan.stride; else delete next.byteStride;
        virtual += next.byteLength;
        next.extensions = { EXT_meshopt_compression: { buffer: 0, byteOffset: at, byteLength: encoded.length, byteStride: plan.stride, count, mode: plan.mode, filter: plan.filter } };
        report.views.push({ view: id, role: r, mode: plan.mode, filter: plan.filter, bits: plan.bits ?? null, count, from: source.length, to: encoded.length, maxError });
        newViews.push(next);
        continue;
      }
    }
    next.buffer = 0; next.byteOffset = push(source); next.byteLength = source.length;
    report.views.push({ view: id, role: imageViews.has(id) ? 'image' : accessors.map(i => role.get(i)).join('+'), mode: 'raw', from: source.length, to: source.length });
    newViews.push(next);
  }
  doc.bufferViews = newViews;
  const binary = Buffer.concat(chunks);
  doc.buffers = [{ byteLength: binary.length }, { byteLength: virtual, extensions: { EXT_meshopt_compression: { fallback: true } } }];
  for (const key of ['extensionsUsed', 'extensionsRequired']) doc[key] = [...new Set([...(doc[key] ?? []), 'EXT_meshopt_compression'])];
  const out = writeGlb(doc, binary);
  fs.writeFileSync(output, out);
  report.inputBytes = raw.length; report.outputBytes = out.length;
  report.compressedViews = report.views.filter(v => v.mode !== 'raw').length;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const get = (flag, fallback) => { const i = argv.indexOf(flag); return i >= 0 ? +argv[i + 1] : fallback; };
  const files = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
  const report = await pack(files[0], files[1], { positionBits: get('--position-bits'), normalBits: get('--normal-bits'), quatBits: get('--quat-bits') });
  const summary = { ...report, views: undefined, worst: Object.fromEntries(['EXPONENTIAL', 'OCTAHEDRAL', 'QUATERNION'].map(f => [f, Math.max(0, ...report.views.filter(v => v.filter === f).map(v => v.maxError))])) };
  process.stdout.write(JSON.stringify(summary) + '\n');
}
