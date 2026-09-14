/**
 * Merge the static direct children of a group per material into one mesh each
 * (bike frame parts, rider segment parts): one draw call per material instead of
 * one per primitive. Children listed in `keep` (animated parts, groups) stay.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Round 12: split one big static geometry into per-x-range chunks so three's frustum culling
 * works on it like it does on the instanced prop chunks (the merged ride surfaces spanned the
 * whole track: `deck:rustSteel` 51 k + `deck:plywood` 45 k + `deck:ao` 28 k tris on b1 were drawn
 * in every frame). Triangles are bucketed by centroid x; every chunk keeps every attribute.
 * Returns `[geometry]` unchanged when it would not split.
 */
export function chunkByX(geo: THREE.BufferGeometry, chunkM = 40, minTris = 6000): THREE.BufferGeometry[] {
  const pos = geo.getAttribute('position');
  if (!pos) return [geo];
  const index = geo.index;
  const triCount = (index ? index.count : pos.count) / 3;
  if (triCount < minTris) return [geo];
  const vi = (t: number, c: number): number => (index ? index.getX(3 * t + c) : 3 * t + c);
  const buckets = new Map<number, number[]>();
  for (let t = 0; t < triCount; t++) {
    const cx = (pos.getX(vi(t, 0)) + pos.getX(vi(t, 1)) + pos.getX(vi(t, 2))) / 3;
    const k = Math.floor(cx / chunkM);
    let list = buckets.get(k);
    if (!list) buckets.set(k, (list = []));
    list.push(t);
  }
  if (buckets.size < 2) return [geo];
  const names = Object.keys(geo.attributes);
  const out: THREE.BufferGeometry[] = [];
  for (const [, tris] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    const g = new THREE.BufferGeometry();
    // Re-index: old vertex → new vertex, only the vertices this chunk touches.
    const remap = new Map<number, number>();
    const order: number[] = [];
    const idx = new Uint32Array(tris.length * 3);
    for (let i = 0; i < tris.length; i++) {
      for (let c = 0; c < 3; c++) {
        const v = vi(tris[i]!, c);
        let n = remap.get(v);
        if (n === undefined) {
          n = order.length;
          remap.set(v, n);
          order.push(v);
        }
        idx[3 * i + c] = n;
      }
    }
    for (const name of names) {
      const src = geo.getAttribute(name) as THREE.BufferAttribute;
      const size = src.itemSize;
      const Ctor = src.array.constructor as new (n: number) => typeof src.array;
      const arr = new Ctor(order.length * size);
      for (let n = 0; n < order.length; n++) for (let c = 0; c < size; c++) (arr as unknown as number[])[n * size + c] = src.getComponent(order[n]!, c);
      g.setAttribute(name, new THREE.BufferAttribute(arr, size, src.normalized));
    }
    g.setIndex(new THREE.BufferAttribute(order.length > 65535 ? idx : Uint16Array.from(idx), 1));
    out.push(g);
  }
  geo.dispose();
  return out;
}

export function mergeStaticChildren(group: THREE.Object3D, keep: ReadonlySet<THREE.Object3D> = new Set()): void {
  const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>();
  const remove: THREE.Object3D[] = [];
  for (const child of group.children) {
    const m = child as THREE.Mesh;
    if (!m.isMesh || keep.has(child) || child.children.length > 0 || Array.isArray(m.material)) continue;
    const g = m.geometry;
    if (!g.getAttribute('position') || !g.getAttribute('normal') || !g.getAttribute('uv')) continue;
    m.updateMatrix();
    const copy = g.index ? g.toNonIndexed() : g.clone();
    // Keep position/normal/uv (+ color when present: vertex-coloured kits); drop the rest so
    // the merge never fails. A slot mixing coloured and uncoloured parts is fixed up below.
    for (const name of Object.keys(copy.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') copy.deleteAttribute(name);
    copy.applyMatrix4(m.matrix);
    const slot = byMat.get(m.material) ?? { geos: [], cast: false };
    slot.geos.push(copy);
    slot.cast = slot.cast || m.castShadow;
    byMat.set(m.material, slot);
    remove.push(child);
  }
  if (remove.length < 2) return;
  for (const r of remove) group.remove(r);
  for (const [mat, slot] of byMat) {
    if (slot.geos.some((g) => g.getAttribute('color')) && !slot.geos.every((g) => g.getAttribute('color'))) {
      for (const g of slot.geos) g.deleteAttribute('color');
    }
    const merged = slot.geos.length === 1 ? slot.geos[0]! : mergeGeometries(slot.geos, false);
    if (!merged) {
      // Fall back: keep the parts separate if the merge failed.
      for (const g of slot.geos) group.add(new THREE.Mesh(g, mat));
      continue;
    }
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = slot.cast;
    mesh.name = `merged:${mat.name || 'mat'}`;
    group.add(mesh);
  }
}
