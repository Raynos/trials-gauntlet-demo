/** Measure a GLB from its JSON chunk: bytes, tris, draws, images (with pixel sizes), bones, clips.
 *  Works on EXT_meshopt_compression files without decoding (accessor counts live in the JSON).
 *  Usage: node assets/blender/glb_stats.mjs [--json] [--meshes] file.glb [...]
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function readGlb(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  let doc, bin;
  for (let at = 12; at < bytes.length;) {
    const size = bytes.readUInt32LE(at), type = bytes.readUInt32LE(at + 4);
    const chunk = bytes.subarray(at + 8, at + 8 + size);
    if (type === 0x4e4f534a) doc = JSON.parse(chunk.toString());
    else if (type === 0x004e4942) bin = chunk;
    at += 8 + size;
  }
  return { doc, bin };
}

function imageSize(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), kind: 'png' };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let at = 2;
    while (at < buf.length) {
      if (buf[at] !== 0xff) { at++; continue; }
      const marker = buf[at + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(at + 5), w: buf.readUInt16BE(at + 7), kind: 'jpeg' };
      }
      at += 2 + buf.readUInt16BE(at + 2);
    }
  }
  if (buf.subarray(1, 4).toString() === 'KTX') {
    return { w: buf.readUInt32LE(20), h: buf.readUInt32LE(24), kind: 'ktx2' };
  }
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return { w: -1, h: -1, kind: 'webp' };
  return { w: -1, h: -1, kind: 'unknown' };
}

export function glbStats(path) {
  const bytes = fs.readFileSync(path);
  const { doc, bin } = readGlb(bytes);
  const acc = doc.accessors ?? [];
  const meshTris = (doc.meshes ?? []).map(m => m.primitives.reduce((t, p) =>
    t + ((p.mode ?? 4) === 4 ? (p.indices != null ? acc[p.indices].count : acc[p.attributes.POSITION].count) / 3 : 0), 0));
  const meshVerts = (doc.meshes ?? []).map(m => m.primitives.reduce((t, p) => t + acc[p.attributes.POSITION].count, 0));
  // Draws = primitives reachable from the scene, counting each instancing node.
  const scene = doc.scenes?.[doc.scene ?? 0];
  let draws = 0, tris = 0, verts = 0;
  const meshUse = new Map();
  const visit = index => {
    const node = doc.nodes[index];
    if (node.mesh != null) {
      draws += doc.meshes[node.mesh].primitives.length;
      tris += meshTris[node.mesh];
      verts += meshVerts[node.mesh];
      meshUse.set(node.mesh, (meshUse.get(node.mesh) ?? 0) + 1);
    }
    for (const child of node.children ?? []) visit(child);
  };
  for (const root of scene?.nodes ?? []) visit(root);
  const views = doc.bufferViews ?? [];
  const images = (doc.images ?? []).map((image, index) => {
    const view = views[image.bufferView];
    const ex = view?.extensions?.EXT_meshopt_compression;
    const slice = ex ? null : bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const size = slice ? imageSize(slice) : { w: -1, h: -1, kind: 'compressed' };
    return { index, name: image.name, mime: image.mimeType, bytes: view?.byteLength ?? 0, ...size };
  });
  const times = accessor => {
    const a = acc[accessor], v = views[a.bufferView];
    if (v.extensions?.EXT_meshopt_compression) return null;
    let min = Infinity, max = -Infinity;
    for (let k = 0; k < a.count; k++) {
      const value = bin.readFloatLE((v.byteOffset ?? 0) + (a.byteOffset ?? 0) + k * (v.byteStride ?? 4));
      min = Math.min(min, value); max = Math.max(max, value);
    }
    return [min, max];
  };
  const clips = (doc.animations ?? []).map(a => {
    let min = Infinity, max = -Infinity, samples = 0;
    for (const s of a.samplers) {
      const t = times(s.input);
      samples = Math.max(samples, acc[s.input].count);
      if (t) { min = Math.min(min, t[0]); max = Math.max(max, t[1]); }
    }
    return { name: a.name, channels: a.channels.length, samples, duration: Number.isFinite(max) ? +(max - min).toFixed(6) : null };
  });
  const skins = (doc.skins ?? []).map(s => ({ joints: s.joints.length, names: s.joints.map(j => doc.nodes[j].name) }));
  const sockets = (doc.nodes ?? []).filter(n => n.mesh == null && n.skin == null && !(n.children?.length) && !(doc.skins ?? []).some(s => s.joints.includes(doc.nodes.indexOf(n)))).map(n => n.name);
  const maxTexture = images.reduce((m, i) => Math.max(m, i.w, i.h), 0);
  const meshes = (doc.meshes ?? []).map((m, i) => ({ name: m.name, tris: meshTris[i], verts: meshVerts[i], primitives: m.primitives.length, instances: meshUse.get(i) ?? 0, materials: m.primitives.map(p => doc.materials?.[p.material]?.name ?? null) }));
  return {
    file: path, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    triangles: tris, vertices: verts, draws, meshes: meshes.length, nodes: doc.nodes?.length ?? 0,
    materials: doc.materials?.length ?? 0, textures: doc.textures?.length ?? 0, images: images.length, maxTexture,
    imageBytes: images.reduce((t, i) => t + i.bytes, 0),
    bones: skins[0]?.joints ?? 0, skins: skins.length, clips, sockets: sockets.length,
    variants: doc.extensions?.KHR_materials_variants?.variants?.map(v => v.name) ?? null,
    extensionsUsed: doc.extensionsUsed ?? [], extensionsRequired: doc.extensionsRequired ?? [],
    imageList: images, meshList: meshes, jointNames: skins[0]?.names ?? [], socketNames: sockets,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const json = args.includes('--json'), showMeshes = args.includes('--meshes');
  for (const path of args.filter(a => !a.startsWith('--'))) {
    const s = glbStats(path);
    if (json) { process.stdout.write(JSON.stringify(s) + '\n'); continue; }
    const mb = (s.bytes / 1e6).toFixed(2);
    console.log(`${path}\n  ${mb} MB  tris ${s.triangles}  verts ${s.vertices}  draws ${s.draws}  meshes ${s.meshes}  materials ${s.materials}  images ${s.images} (max ${s.maxTexture}px, ${(s.imageBytes / 1e6).toFixed(2)} MB)  bones ${s.bones}  sockets ${s.sockets}  variants ${s.variants ? s.variants.join('/') : '-'}`);
    console.log(`  clips: ${s.clips.map(c => `${c.name}=${c.duration ?? '?'}s/${c.samples}f`).join(', ')}`);
    console.log(`  ext: ${s.extensionsUsed.join(', ')}`);
    if (showMeshes) {
      for (const m of s.meshList) console.log(`    mesh ${m.name}: ${m.tris} tris, ${m.verts} verts, ${m.primitives} prim x${m.instances}  [${m.materials.join(', ')}]`);
      for (const i of s.imageList) console.log(`    image ${i.index} ${i.name ?? ''} ${i.kind} ${i.w}x${i.h} ${(i.bytes / 1024).toFixed(0)} KB`);
    }
  }
}
