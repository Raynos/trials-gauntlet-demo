/**
 * Merge the static direct children of a group per material into one mesh each
 * (bike frame parts, rider segment parts): one draw call per material instead of
 * one per primitive. Children listed in `keep` (animated parts, groups) stay.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
