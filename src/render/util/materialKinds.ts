/**
 * Perf cut #0 (docs/plans/PERF.md §4): stop three re-acquiring shader programs every frame.
 *
 * three r186 keeps ONE `currentProgram` per material. `setProgram` re-runs `getParameters` +
 * `getProgramCacheKey` + a full uniform re-bind (~100 µs, ~2 KB of garbage on V8; 3–5× that on
 * Safari) whenever the material's recorded state disagrees with the object drawing it. On b1 that
 * happened 30× per frame on `high` and 11× on `low` (`harness/bench/diag-programs.ts`), from three
 * sources — all fixed here, in one pass over the scene after every build / hero swap / tier change:
 *
 * 1. `renderObject`'s two-pass path for a transparent DoubleSide material with
 *    `forceSinglePass === false`: `side = BackSide; needsUpdate = true`, draw, `side = FrontSide;
 *    needsUpdate = true`, draw — two draws and two program lookups per object per frame (hall light
 *    shafts, lamp cones, the deck AO skirt, the wheel spokes and blur discs). `forceSinglePass = true`
 *    draws both faces in one pass: identical for additive and same-colour blends (every one of ours),
 *    depth-tested like any single draw for the rest.
 * 2. One material drawn by an `InstancedMesh` and a plain `Mesh` (or a `SkinnedMesh`): the program
 *    key differs per kind, so the material flips every frame. The minority kinds get a clone that
 *    keeps the source's `onBeforeCompile` by reference (same closure → same `customProgramCacheKey`
 *    → the same compiled program; `Material.copy` would drop the hook). Library materials clone
 *    through `MaterialLibrary.derive` so the procedural maps still land on them when generated.
 * 3. The shadow pass: three draws every caster with one shared `MeshDepthMaterial`, assigning the
 *    caster's `map` / `alphaTest` onto it each draw — skinned, instanced, plain, mapped and unmapped
 *    casters all flip its program. A `customDepthMaterial` per (source material, object kind) keeps
 *    each depth program stable (RGBADepthPacking, as three's own).
 */
import * as THREE from 'three';
import type { MaterialLibrary } from '../materials/library';

export interface MaterialKindsReport {
  singlePass: number;
  split: number;
  depth: number;
}

type Kind = 'instanced' | 'skinned' | 'plain';

function kindOf(o: THREE.Object3D): Kind {
  if ((o as THREE.InstancedMesh).isInstancedMesh) return 'instanced';
  if ((o as THREE.SkinnedMesh).isSkinnedMesh) return 'skinned';
  return 'plain';
}

function materialsOf(o: THREE.Object3D): THREE.Material[] {
  const m = (o as THREE.Mesh).material;
  return Array.isArray(m) ? m : m ? [m] : [];
}

/** Clone that draws with the very same program: the source's compile hook by reference, library maps via `derive`. */
function cloneForKind(src: THREE.Material, lib: MaterialLibrary | null): THREE.Material {
  const name = lib?.nameOf(src as THREE.MeshStandardMaterial) ?? null;
  // A library material IS its base (sites mutate it in place — `vc()` sets vertexColors on the instance), so `derive` clones it exactly.
  const clone = name && lib ? lib.derive(name) : src.clone();
  clone.onBeforeCompile = src.onBeforeCompile;
  clone.customProgramCacheKey = src.customProgramCacheKey;
  clone.userData.kindCloneOf = src.uuid;
  return clone;
}

/** Per-(material, kind) depth materials. A WeakMap, not `userData`: `Material.copy` JSON-clones userData, which would turn a cached material into a plain object. */
const depthByMaterial = new WeakMap<THREE.Material, Partial<Record<Kind, THREE.MeshDepthMaterial>>>();

/**
 * One pass: (1) single-pass transparents, (2) per-kind clones of shared materials, (3) per-(material, kind)
 * depth materials for casters. Idempotent — running it again on an unchanged scene changes nothing.
 */
export function stabilizePrograms(root: THREE.Object3D, lib: MaterialLibrary | null): MaterialKindsReport {
  const report: MaterialKindsReport = { singlePass: 0, split: 0, depth: 0 };
  const users = new Map<THREE.Material, Map<Kind, THREE.Mesh[]>>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const kind = kindOf(o);
    for (const m of materialsOf(o)) {
      if (m.transparent && m.side === THREE.DoubleSide && !m.forceSinglePass) {
        m.forceSinglePass = true;
        report.singlePass++;
      }
      let byKind = users.get(m);
      if (!byKind) users.set(m, (byKind = new Map()));
      let list = byKind.get(kind);
      if (!list) byKind.set(kind, (list = []));
      list.push(mesh);
    }
  });
  // (2) split: the kind with the most users keeps the material; the others get a clone each.
  const clones = new Map<string, THREE.Material>(); // `${uuid}:${kind}`
  for (const [m, byKind] of users) {
    if (byKind.size < 2) continue;
    const keep = [...byKind.entries()].sort((a, b) => b[1].length - a[1].length)[0]![0];
    for (const [kind, meshes] of byKind) {
      if (kind === keep) continue;
      const key = `${m.uuid}:${kind}`;
      let clone = clones.get(key);
      if (!clone) clones.set(key, (clone = cloneForKind(m, lib)));
      for (const mesh of meshes) {
        if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((x) => (x === m ? clone! : x));
        else mesh.material = clone;
        report.split++;
      }
    }
  }
  // (3) depth materials: per (material, kind); reuse across calls through a cache on the material.
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.customDepthMaterial) return;
    const m = materialsOf(o)[0];
    if (!m) return;
    const kind = kindOf(o);
    let cache = depthByMaterial.get(m);
    if (!cache) depthByMaterial.set(m, (cache = {}));
    let depth = cache[kind];
    if (!depth) {
      depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      depth.name = `depth:${m.name || m.type}:${kind}`;
      cache[kind] = depth;
    }
    mesh.customDepthMaterial = depth;
    report.depth++;
  });
  return report;
}
