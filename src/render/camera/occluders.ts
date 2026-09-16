/**
 * Foreground occluder fade (round 15, camera item 1d). The reference camera never lets a foreground
 * prop wipe across the rider; ours did (critic r4: "a foreground tree straight through the rider",
 * "camera clipping through a tree in the first 6 frames", "a large black foreground shape whips
 * across the frame for 2 frames"). The camera is not moved for it — the offending instance fades.
 *
 * Build time (`props.ts buildBatches`): instances that could ever sit between the camera and the
 * bike — world z ≥ `MOTION.OCCLUDE.minZ` and tall enough to reach the camera → rider line (the
 * kit's `couldOcclude(x, top)` predicate: top above the deck + 1 m) — are left out of the merged
 * bake and drawn as their own `InstancedMesh` per chunk (`props:<name>:fg:<k>`, so the tier
 * name rules still match) with a per-instance `aFade` attribute; the material is a clone with a
 * 4×4 Bayer dithered discard (no transparency queue, no sorting, one extra program per material).
 *
 * Frame time (`OccluderSet.update`): the segment camera position → rider chest is tested against
 * every registered instance's world AABB (slab test; only instances within ±40 m in x are
 * looked at). A hit drives the instance's fade toward 0, a miss toward 1, ±1/`frames` per frame;
 * only changed attributes are uploaded. Cost is measured by `ThreeRenderer.debugInfo().occluderMs`.
 */
import * as THREE from 'three';
import { MOTION } from './rig';

export interface OccluderInstance {
  mesh: THREE.InstancedMesh;
  index: number;
  min: THREE.Vector3;
  max: THREE.Vector3;
  fade: number;
}

const FADE_GLSL_VERT_DECL = 'attribute float aFade;\nvarying float vFade;\n';
const FADE_GLSL_FRAG_DECL = 'varying float vFade;\n';
const FADE_GLSL_FRAG = `
  if (vFade < 0.999) {
    // 4×4 Bayer threshold (0..15)/16 + 1/32: a fully faded instance discards every fragment.
    int bx = int(mod(gl_FragCoord.x, 4.0));
    int by = int(mod(gl_FragCoord.y, 4.0));
    int idx = bx + by * 4;
    float th = 0.0;
    if (idx == 0) th = 0.0; else if (idx == 1) th = 8.0; else if (idx == 2) th = 2.0; else if (idx == 3) th = 10.0;
    else if (idx == 4) th = 12.0; else if (idx == 5) th = 4.0; else if (idx == 6) th = 14.0; else if (idx == 7) th = 6.0;
    else if (idx == 8) th = 3.0; else if (idx == 9) th = 11.0; else if (idx == 10) th = 1.0; else if (idx == 11) th = 9.0;
    else if (idx == 12) th = 15.0; else if (idx == 13) th = 7.0; else if (idx == 14) th = 13.0; else th = 5.0;
    if (vFade <= (th + 0.5) / 16.0) discard;
  }
`;

const fadeMaterials = new WeakMap<THREE.Material, THREE.Material>();

/** A clone of `m` whose fragments discard by the instance's `aFade` (cached per source material). */
export function fadeMaterial(m: THREE.Material): THREE.Material {
  const hit = fadeMaterials.get(m);
  if (hit) return hit;
  const c = m.clone();
  c.name = (m.name || 'mat') + ':fade';
  const prev = c.onBeforeCompile;
  c.onBeforeCompile = (shader, renderer) => {
    prev?.call(c, shader, renderer);
    shader.vertexShader = FADE_GLSL_VERT_DECL + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFade = aFade;');
    shader.fragmentShader = FADE_GLSL_FRAG_DECL + shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + FADE_GLSL_FRAG);
  };
  const prevKey = c.customProgramCacheKey.bind(c);
  c.customProgramCacheKey = () => prevKey() + '|fade';
  fadeMaterials.set(m, c);
  return c;
}

export class OccluderSet {
  readonly items: OccluderInstance[] = [];
  /** Instances sorted by AABB min x so the frame query walks a window (rebuilt by `seal()`). */
  private sorted: OccluderInstance[] = [];
  private readonly attrs = new Map<THREE.InstancedMesh, THREE.InstancedBufferAttribute>();
  /** Last frame's query, for the debug panel / harness. */
  lastMs = 0;
  lastHits = 0;
  lastTested = 0;

  /** Register one instance of a fade-capable mesh with its world-space AABB. */
  add(mesh: THREE.InstancedMesh, index: number, box: THREE.Box3): void {
    let attr = this.attrs.get(mesh);
    if (!attr) {
      attr = new THREE.InstancedBufferAttribute(new Float32Array(mesh.count).fill(1), 1);
      attr.setUsage(THREE.DynamicDrawUsage);
      mesh.geometry.setAttribute('aFade', attr);
      this.attrs.set(mesh, attr);
    }
    this.items.push({ mesh, index, min: box.min.clone(), max: box.max.clone(), fade: 1 });
  }

  seal(): void {
    this.sorted = this.items.slice().sort((a, b) => a.min.x - b.min.x);
  }

  get count(): number {
    return this.items.length;
  }

  /**
   * Segment (camera → rider chest) against every candidate AABB. Fades step ±1/frames toward the
   * hit state; the mesh attribute uploads only when an instance's fade changed.
   */
  update(cam: THREE.Vector3, tx: number, ty: number, tz: number, cut = false): void {
    const t0 = performance.now();
    const step = 1 / MOTION.OCCLUDE.frames;
    const pad = MOTION.OCCLUDE.radiusPad;
    const dx = tx - cam.x;
    const dy = ty - cam.y;
    const dz = tz - cam.z;
    const lo = Math.min(cam.x, tx) - 40;
    const hi = Math.max(cam.x, tx) + 40;
    let hits = 0;
    let tested = 0;
    const list = this.sorted;
    for (let i = 0; i < list.length; i++) {
      const it = list[i]!;
      if (it.min.x > hi) break;
      if (it.max.x < lo) continue;
      tested++;
      // Slab test on the padded box, parameter t ∈ [0, 1] along the segment.
      let tmin = 0;
      let tmax = 1;
      let hit = true;
      for (let axis = 0; axis < 3 && hit; axis++) {
        const o = axis === 0 ? cam.x : axis === 1 ? cam.y : cam.z;
        const d = axis === 0 ? dx : axis === 1 ? dy : dz;
        const bmin = (axis === 0 ? it.min.x : axis === 1 ? it.min.y : it.min.z) - pad;
        const bmax = (axis === 0 ? it.max.x : axis === 1 ? it.max.y : it.max.z) + pad;
        if (Math.abs(d) < 1e-9) {
          if (o < bmin || o > bmax) hit = false;
          continue;
        }
        let t1 = (bmin - o) / d;
        let t2 = (bmax - o) / d;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) hit = false;
      }
      if (hit) hits++;
      const target = hit ? 0 : 1;
      if (it.fade !== target) {
        const next = cut ? target : it.fade + Math.sign(target - it.fade) * step;
        it.fade = Math.abs(next - target) < 1e-6 || (target - it.fade) * (target - next) <= 0 ? target : next;
        const attr = this.attrs.get(it.mesh)!;
        attr.setX(it.index, it.fade);
        attr.needsUpdate = true;
      }
    }
    this.lastHits = hits;
    this.lastTested = tested;
    this.lastMs = performance.now() - t0;
  }

  /** Every fade back to 1 (track unload / cut). */
  reset(): void {
    for (const it of this.items) {
      if (it.fade === 1) continue;
      it.fade = 1;
      const attr = this.attrs.get(it.mesh)!;
      attr.setX(it.index, 1);
      attr.needsUpdate = true;
    }
  }
}
