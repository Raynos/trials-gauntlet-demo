/**
 * Obstacle bodies for all 12 `placed` kinds plus every non-polyline collider.
 * The ridden surface itself is a ribbon (track.ts); this file adds the solid
 * underneath so a ramp is a wedge, a drum a spool, a wall a wall. Static
 * bodies merge per material; seesaws and rolling drums stay separate so they
 * can animate from `state.seesaws` / `state.drums`.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Collider, ColliderCircle, ColliderPolyline, CompiledTrack, PlacedObstacle, Vec2 } from '../../core/types';
import type { MaterialLibrary } from '../materials/library';
import { fogify } from '../lighting/environment';
import { profileY } from './track';
import * as G from './zones/geo';

export interface ObstacleMeshes {
  group: THREE.Group;
  seesaws: Map<number, THREE.Object3D>;
  drums: Map<number, THREE.Object3D>;
  triangles: number;
  drawCalls: number;
}

type Bucket = Map<string, THREE.BufferGeometry[]>;

function num(p: Record<string, unknown>, key: string, def: number): number {
  const v = p[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : def;
}

function push(b: Bucket, mat: string, g: THREE.BufferGeometry, m?: THREE.Matrix4): void {
  if (m) g.applyMatrix4(m);
  // Extruded ramps/planks are non-indexed, while crates and trestles are indexed.
  // Give the extrusions identity indices so a shared material can merge both without
  // welding seams, changing normals/UVs, or expanding the indexed primitives.
  if (!g.index) g.setIndex(Array.from({ length: g.getAttribute('position').count }, (_, i) => i));
  const l = b.get(mat) ?? [];
  l.push(g);
  b.set(mat, l);
}

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const V = new THREE.Vector3();
const S = new THREE.Vector3(1, 1, 1);
function at(x: number, y: number, z: number, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  Q.setFromAxisAngle(V.set(0, 0, 1), rz);
  return M.compose(new THREE.Vector3(x, y, z), Q, S.set(sx, sy, sz)).clone();
}

/** Extrude a closed XY polygon along z (centred), planar UVs in metres. */
function extrudePoly(poly: Vec2[], depth: number, uvScale = 0.5): THREE.BufferGeometry {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, p.y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -depth / 2);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
  return g;
}

/** Solid under a polyline surface down to the ground profile (ramp / stair / ledge / wall). */
function skirt(pl: ColliderPolyline, profile: readonly Vec2[], depth: number, extraDrop = 0.02): THREE.BufferGeometry | null {
  const pts = pl.points;
  if (pts.length < 2) return null;
  let base = Infinity;
  for (const p of pts) base = Math.min(base, profileY(profile, p.x), p.y);
  base -= extraDrop;
  const poly: Vec2[] = pts.map((p) => ({ x: p.x, y: p.y - 0.001 }));
  const last = pts[pts.length - 1]!;
  const first = pts[0]!;
  if (last.y > base + 0.01) poly.push({ x: last.x, y: base });
  if (first.y > base + 0.01) poly.push({ x: first.x, y: base });
  // Degenerate (all points on the base line)
  if (poly.length < 3) return null;
  return extrudePoly(poly, depth);
}

/** Thick board following a polyline (plank): offset the outline down by `t`. */
function board(pl: ColliderPolyline, t: number, depth: number): THREE.BufferGeometry | null {
  const pts = pl.points;
  if (pts.length < 2) return null;
  const poly: Vec2[] = pts.map((p) => ({ x: p.x, y: p.y - 0.002 }));
  for (let i = pts.length - 1; i >= 0; i--) poly.push({ x: pts[i]!.x, y: pts[i]!.y - t });
  return extrudePoly(poly, depth);
}

/** Cable-spool drum: rim cylinder + two flanges + hub, axis along z. */
function spool(r: number, width: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = new THREE.CylinderGeometry(r, r, width, 40, 1, false);
  body.rotateX(Math.PI / 2);
  parts.push(body);
  const flangeR = r * 1.0;
  for (const s of [-1, 1]) {
    const f = new THREE.CylinderGeometry(flangeR, flangeR, 0.12, 40, 1, false);
    f.rotateX(Math.PI / 2);
    f.translate(0, 0, s * (width / 2 + 0.06));
    parts.push(f);
    const inner = new THREE.CylinderGeometry(r * 0.72, r * 0.72, 0.16, 32, 1, false);
    inner.rotateX(Math.PI / 2);
    inner.translate(0, 0, s * (width / 2 + 0.08));
    parts.push(inner);
  }
  const hub = new THREE.CylinderGeometry(r * 0.18, r * 0.18, width + 0.6, 16, 1, false);
  hub.rotateX(Math.PI / 2);
  parts.push(hub);
  return mergeGeometries(parts, false)!;
}

/** Oil drum with two rolled ribs. */
function drumBarrel(r: number, h: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(new THREE.CylinderGeometry(r, r, h, 24, 1, false));
  for (const y of [-h * 0.22, h * 0.22]) {
    const rib = new THREE.TorusGeometry(r, 0.02, 6, 24);
    rib.rotateX(Math.PI / 2);
    rib.translate(0, y, 0);
    parts.push(rib);
  }
  return mergeGeometries(parts, false)!;
}

export function buildObstacles(track: CompiledTrack, lib: MaterialLibrary): ObstacleMeshes {
  const group = new THREE.Group();
  group.name = 'obstacles';
  const buckets: Bucket = new Map();
  const seesaws = new Map<number, THREE.Object3D>();
  const drums = new Map<number, THREE.Object3D>();
  const profile = track.def.profile;
  const byId = new Map<number, Collider>();
  for (const c of track.colliders) byId.set(c.id, c);
  const handled = new Set<number>();
  const DEPTH = 3;

  const sideMatFor = (surface: string, kind: string): string => {
    if (kind === 'ramp' || kind === 'plank' || kind === 'stair') return surface === 'metal' ? 'rustSteel' : 'plywood';
    if (kind === 'wall' || kind === 'ledge') return surface === 'wood' ? 'plywood' : 'concrete';
    if (kind === 'box') return surface === 'metal' ? (track.def.id === 'lab-box-climb' ? 'labContainerRed' : 'container') : 'plywood';
    return surface === 'wood' ? 'plywood' : surface === 'metal' ? 'rustSteel' : 'concrete';
  };

  for (const po of track.placed as PlacedObstacle[]) {
    const p = po.params ?? {};
    const surface = typeof p.surface === 'string' ? p.surface : 'wood';
    const cols = po.colliderIds.map((id) => byId.get(id)).filter((c): c is Collider => !!c);
    for (const c of cols) handled.add(c.id);
    // Store release: a ROCKHOP zone prop (`params.prop`, src/tracks/kinds.ts PROPS) draws its own body over the
    // same colliders; an unknown prop falls through to the base kind.
    if (typeof p.prop === 'string' && zoneProp(p.prop, po, cols, { buckets, group, drums, profile, lib, depth: DEPTH })) continue;
    switch (po.kind) {
      case 'ramp':
      case 'stair':
      case 'ledge':
      case 'wall': {
        for (const c of cols) {
          if (c.kind === 'polyline') {
            const g = skirt(c, profile, DEPTH);
            if (g) push(buckets, sideMatFor(surface, po.kind), g);
          } else if (c.kind === 'box') {
            push(buckets, sideMatFor(surface, po.kind), new THREE.BoxGeometry(c.halfW * 2, c.halfH * 2, DEPTH), at(c.center.x, c.center.y, 0, c.angle));
          }
        }
        // Stair nosings: thin steel strips on each step edge.
        if (po.kind === 'stair') {
          for (const c of cols) {
            if (c.kind !== 'polyline') continue;
            for (let i = 1; i < c.points.length; i++) {
              const a = c.points[i - 1]!;
              const b = c.points[i]!;
              if (Math.abs(b.y - a.y) < 0.01 && Math.abs(b.x - a.x) > 0.05) {
                push(buckets, 'darkSteel', new THREE.BoxGeometry(0.05, 0.03, DEPTH), at(b.x > a.x ? b.x - 0.025 : a.x + 0.025, a.y - 0.012, 0));
              }
            }
          }
        }
        break;
      }
      case 'plank': {
        const t = num(p, 'thickness', 0.08);
        for (const c of cols) {
          if (c.kind === 'polyline') {
            const g = board(c, t, num(p, 'width', DEPTH));
            if (g) push(buckets, 'plywood', g);
            // Support trestles every ~2.5 m when the plank is above the ground.
            const pts = c.points;
            const len = Math.hypot(pts[pts.length - 1]!.x - pts[0]!.x, pts[pts.length - 1]!.y - pts[0]!.y);
            const n = Math.max(2, Math.round(len / 2.5) + 1);
            for (let k = 0; k < n; k++) {
              const tt = n === 1 ? 0.5 : k / (n - 1);
              const px = pts[0]!.x + (pts[pts.length - 1]!.x - pts[0]!.x) * tt;
              const py = pts[0]!.y + (pts[pts.length - 1]!.y - pts[0]!.y) * tt - t;
              const gy = profileY(profile, px);
              const h = py - gy;
              if (h > 0.15) {
                for (const z of [-1.2, 1.2]) {
                  push(buckets, 'darkSteel', new THREE.BoxGeometry(0.08, h, 0.08), at(px, gy + h / 2, z));
                }
                push(buckets, 'darkSteel', new THREE.BoxGeometry(0.08, 0.08, 2.5), at(px, py - 0.04, 0));
              }
            }
          }
        }
        break;
      }
      case 'drum': {
        for (const c of cols) {
          if (c.kind !== 'circle') continue;
          const width = num(p, 'width', 2.2);
          const g = spool(c.radius, width);
          const mesh = new THREE.Mesh(g, fogify(lib.get('darkSteel')));
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.position.set(c.center.x, c.center.y, 0);
          // Cable wrapped on the spool: slightly smaller cylinder in rubber.
          const cable = new THREE.Mesh(new THREE.CylinderGeometry(c.radius * 0.98, c.radius * 0.98, width * 0.95, 40, 1, true), lib.get('tyre'));
          cable.rotation.x = Math.PI / 2;
          cable.receiveShadow = true;
          mesh.add(cable);
          // Flange face stripe (white sector) so the spin reads.
          const stripe = new THREE.Mesh(new THREE.BoxGeometry(c.radius * 1.6, 0.06, 0.02), lib.get('plaque'));
          stripe.position.z = width / 2 + 0.13;
          mesh.add(stripe);
          group.add(mesh);
          drums.set(c.id, mesh);
          // Cradle: two A-frame stands the spool sits in.
          const gy = profileY(profile, c.center.x);
          for (const z of [-width / 2 - 0.25, width / 2 + 0.25]) {
            push(buckets, 'rustSteel', new THREE.BoxGeometry(0.12, Math.max(0.2, c.center.y - gy), 0.12), at(c.center.x - 0.5, (c.center.y + gy) / 2, z, 0.18));
            push(buckets, 'rustSteel', new THREE.BoxGeometry(0.12, Math.max(0.2, c.center.y - gy), 0.12), at(c.center.x + 0.5, (c.center.y + gy) / 2, z, -0.18));
          }
        }
        break;
      }
      case 'barrel': {
        for (const c of cols) {
          if (c.kind === 'circle') {
            const g = drumBarrel(c.radius, num(p, 'length', 2.6));
            g.rotateX(Math.PI / 2);
            const mat = num(p, 'variant', 0) % 2 === 0 ? 'barrelRed' : 'barrelBlue';
            push(buckets, mat, g, at(c.center.x, c.center.y, 0));
          } else if (c.kind === 'box') {
            push(buckets, 'barrelRed', new THREE.BoxGeometry(c.halfW * 2, c.halfH * 2, DEPTH), at(c.center.x, c.center.y, 0, c.angle));
          }
        }
        break;
      }
      case 'logpile': {
        for (const c of cols) {
          if (c.kind === 'circle') {
            const g = new THREE.CylinderGeometry(c.radius, c.radius * 0.96, num(p, 'length', 3.2), 18, 1, false);
            g.rotateX(Math.PI / 2);
            push(buckets, 'pallet', g, at(c.center.x, c.center.y, 0));
          } else if (c.kind === 'polyline') {
            // Outline-only log pile: fill with logs along the outline.
            const g = skirt(c, profile, 3.2);
            if (g) push(buckets, 'pallet', g);
          }
        }
        break;
      }
      case 'pole': {
        for (const c of cols) {
          if (c.kind === 'circle') {
            const gy = profileY(profile, c.center.x);
            const h = c.center.y - gy;
            push(buckets, 'darkSteel', new THREE.CylinderGeometry(c.radius, c.radius, Math.max(0.1, h), 16), at(c.center.x, gy + h / 2, 0));
            const cap = new THREE.CylinderGeometry(c.radius * 1.05, c.radius * 1.05, 0.06, 16);
            push(buckets, 'hazardTape', cap, at(c.center.x, c.center.y - 0.03, 0));
          } else if (c.kind === 'box') {
            push(buckets, 'darkSteel', new THREE.BoxGeometry(c.halfW * 2, c.halfH * 2, c.halfW * 2), at(c.center.x, c.center.y, 0, c.angle));
            const gy = profileY(profile, c.center.x);
            const h = c.center.y - c.halfH - gy;
            if (h > 0.05) push(buckets, 'darkSteel', new THREE.CylinderGeometry(c.halfW * 0.9, c.halfW * 0.9, h, 12), at(c.center.x, gy + h / 2, 0));
          } else if (c.kind === 'polyline') {
            const g = skirt(c, profile, Math.max(0.3, num(p, 'radius', 0.15) * 2));
            if (g) push(buckets, 'darkSteel', g);
          }
        }
        break;
      }
      case 'box': {
        for (const c of cols) {
          if (c.kind === 'box') {
            push(buckets, sideMatFor(surface, 'box'), new THREE.BoxGeometry(c.halfW * 2, c.halfH * 2, DEPTH), at(c.center.x, c.center.y, 0, c.angle));
          } else if (c.kind === 'polyline') {
            const g = skirt(c, profile, DEPTH);
            if (g) push(buckets, sideMatFor(surface, 'box'), g);
          }
        }
        // Reference lab: red cargo boxes with inset ivory panels and steel ribs.
        // These skins stay outside the riding lane; collision remains the authored box.
        if (track.def.id === 'lab-box-climb' && surface === 'metal') {
          const width = num(p, 'width', 1), height = num(p, 'height', 1);
          const x = po.pos.x, y = po.pos.y;
          for (const z of [-1.515, 1.515]) {
            push(buckets, 'labContainerIvory', new THREE.BoxGeometry(width * 0.68, height * 0.8, 0.026), at(x + width / 2, y + height / 2, z));
            for (let dx = 0.14; dx < width; dx += 0.3) {
              push(buckets, 'darkSteel', new THREE.BoxGeometry(0.023, height * 0.92, 0.04), at(x + dx, y + height / 2, z));
            }
            for (const dy of [0.04, height - 0.04]) {
              push(buckets, 'darkSteel', new THREE.BoxGeometry(width, 0.06, 0.05), at(x + width / 2, y + dy, z));
            }
          }
        }
        break;
      }
      case 'gap': {
        // Nothing to ride; the hazard (if any) draws in hazards. A visible lip helps read the edge.
        break;
      }
      case 'seesaw': {
        for (const c of cols) {
          if (c.kind !== 'seesaw') continue;
          const pivot = new THREE.Group();
          pivot.position.set(c.pivot.x, c.pivot.y, 0);
          const plank = new THREE.Mesh(new THREE.BoxGeometry(c.halfLength * 2, c.thickness, DEPTH), fogify(lib.get('plank')));
          plank.position.y = c.thickness / 2;
          plank.castShadow = true;
          plank.receiveShadow = true;
          pivot.add(plank);
          const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, DEPTH + 0.4, 12), lib.get('chrome'));
          axle.rotation.x = Math.PI / 2;
          pivot.add(axle);
          group.add(pivot);
          seesaws.set(c.id, pivot);
          // Pivot stand: triangular prism to the ground.
          const gy = profileY(profile, c.pivot.x);
          const h = c.pivot.y - gy;
          if (h > 0.05) {
            const tri: Vec2[] = [
              { x: c.pivot.x - h * 0.6, y: gy },
              { x: c.pivot.x + h * 0.6, y: gy },
              { x: c.pivot.x, y: c.pivot.y - 0.02 },
            ];
            push(buckets, 'rustSteel', extrudePoly(tri, DEPTH * 0.9));
          }
        }
        break;
      }
      default: {
        for (const c of cols) {
          if (c.kind === 'polyline') {
            const g = skirt(c, profile, DEPTH);
            if (g) push(buckets, sideMatFor(surface, po.kind), g);
          } else if (c.kind === 'box') {
            push(buckets, sideMatFor(surface, po.kind), new THREE.BoxGeometry(c.halfW * 2, c.halfH * 2, DEPTH), at(c.center.x, c.center.y, 0, c.angle));
          } else if (c.kind === 'circle') {
            const g = new THREE.CylinderGeometry(c.radius, c.radius, DEPTH, 24);
            g.rotateX(Math.PI / 2);
            push(buckets, 'rustSteel', g, at(c.center.x, c.center.y, 0));
          }
        }
      }
    }
  }

  // Colliders not claimed by any placed obstacle (compiler stub, or extras).
  for (const c of track.colliders) {
    if (handled.has(c.id)) continue;
    if (c.kind === 'box') {
      push(buckets, c.surface === 'metal' ? 'container' : c.surface === 'wood' ? 'plywood' : 'concrete', new THREE.BoxGeometry(c.halfW * 2, c.halfH * 2, DEPTH), at(c.center.x, c.center.y, 0, c.angle));
    } else if (c.kind === 'circle') {
      const cc = c as ColliderCircle;
      if (cc.rolls) {
        const mesh = new THREE.Mesh(spool(cc.radius, 2.2), fogify(lib.get('darkSteel')));
        mesh.castShadow = true;
        mesh.position.set(cc.center.x, cc.center.y, 0);
        group.add(mesh);
        drums.set(cc.id, mesh);
      } else {
        const g = new THREE.CylinderGeometry(cc.radius, cc.radius, DEPTH, 24);
        g.rotateX(Math.PI / 2);
        push(buckets, c.surface === 'wood' ? 'pallet' : 'rustSteel', g, at(cc.center.x, cc.center.y, 0));
      }
    } else if (c.kind === 'seesaw') {
      const pivot = new THREE.Group();
      pivot.position.set(c.pivot.x, c.pivot.y, 0);
      const plank = new THREE.Mesh(new THREE.BoxGeometry(c.halfLength * 2, c.thickness, DEPTH), fogify(lib.get('plank')));
      plank.position.y = c.thickness / 2;
      plank.castShadow = true;
      pivot.add(plank);
      group.add(pivot);
      seesaws.set(c.id, pivot);
    } else if (c.kind === 'polyline' && c.obstacleIndex >= 0) {
      const g = skirt(c, profile, DEPTH);
      if (g) push(buckets, c.surface === 'metal' ? 'rustSteel' : c.surface === 'concrete' ? 'concrete' : 'plywood', g);
    }
  }

  // Hazards: fire = glowing grate strip; water = dark plane; kill = nothing visible.
  for (const hz of track.hazards) {
    const w = hz.max.x - hz.min.x;
    const h = hz.max.y - hz.min.y;
    if (hz.kind === 'water') {
      const g = new THREE.PlaneGeometry(w, DEPTH * 2);
      g.rotateX(-Math.PI / 2);
      const m = fogify(new THREE.MeshStandardMaterial({ color: 0x0f2a33, roughness: 0.05, metalness: 0.6 }));
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set((hz.min.x + hz.max.x) / 2, hz.max.y - 0.02, 0);
      group.add(mesh);
    } else if (hz.kind === 'fire') {
      const g = new THREE.BoxGeometry(w, Math.max(0.05, h * 0.2), DEPTH);
      const m = fogify(new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff5a10, emissiveIntensity: 3, roughness: 0.9 }));
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set((hz.min.x + hz.max.x) / 2, hz.min.y + h * 0.1, 0);
      group.add(mesh);
    }
  }

  let triangles = 0;
  let drawCalls = drums.size + seesaws.size;
  for (const [matName, geos] of buckets) {
    // Zone props bake a tint per vertex: when any body in the bucket carries one, every body gets a colour
    // attribute (white = untinted) and the bucket draws with a vertex-coloured derivative of the material.
    const tinted = geos.some((g) => !!g.getAttribute('color'));
    if (tinted) for (const g of geos) if (!g.getAttribute('color')) G.paint(g, [1, 1, 1]);
    const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
    if (!merged) throw new Error(`Obstacle material batch could not merge: ${matName}`);
    let mat = lib.get(matName);
    if (tinted && !mat.vertexColors) {
      mat = lib.derive(matName);
      mat.vertexColors = true;
    }
    const mesh = new THREE.Mesh(merged, fogify(mat));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `obstacles:${matName}`;
    group.add(mesh);
    triangles += (merged.index ? merged.index.count : merged.getAttribute('position').count) / 3;
    drawCalls++;
  }
  return { group, seesaws, drums, triangles, drawCalls };
}


// ---------------------------------------------------------------------------------------------------------------
// ROCKHOP zone props (store release Phase 2): the kit meshes for `params.prop`. Every body follows the collider
// outline exactly (skirt / board / circle), so the visual bounds are the physics bounds; dressing sits outside the
// ridden surface or below it. Colours are baked per vertex into the shared library materials' buckets.
// ---------------------------------------------------------------------------------------------------------------

interface PropCtx {
  buckets: Bucket;
  group: THREE.Group;
  drums: Map<number, THREE.Object3D>;
  profile: readonly Vec2[];
  lib: MaterialLibrary;
  depth: number;
}

const LIVERY = [0x2f8a8a, 0xa8482e, 0x2e5f8e, 0xb86a2a, 0x8a2e24, 0x3a7a58];

/** Tint every vertex — the bucket materials read vertex colours. */
function tintGeo(g: THREE.BufferGeometry, hex: number, f?: (x: number, y: number, z: number) => number): THREE.BufferGeometry {
  return G.paint(g, G.rgb(hex), f);
}

/** Height of polyline `c` at x (null outside it). */
function yOn(c: ColliderPolyline, x: number): number | null {
  const q = c.points;
  for (let i = 1; i < q.length; i++) {
    const a = q[i - 1]!;
    const b = q[i]!;
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    if (x >= lo && x <= hi && hi - lo > 1e-6) return a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
  }
  return null;
}

function zoneProp(prop: string, po: PlacedObstacle, cols: Collider[], ctx: PropCtx): boolean {
  const { buckets, profile, depth } = ctx;
  const p = po.params;
  const variant = typeof p.variant === 'number' ? p.variant : 0;
  const polys = cols.filter((c): c is ColliderPolyline => c.kind === 'polyline');
  const circles = cols.filter((c): c is ColliderCircle => c.kind === 'circle');
  const boxes = cols.filter((c) => c.kind === 'box') as Extract<Collider, { kind: 'box' }>[];
  if (!polys.length && !circles.length && !boxes.length) return false;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const c of polys) for (const q of c.points) {
    x0 = Math.min(x0, q.x);
    x1 = Math.max(x1, q.x);
    y1 = Math.max(y1, q.y);
    y0 = Math.min(y0, profileY(profile, q.x), q.y);
  }
  for (const c of boxes) {
    x0 = Math.min(x0, c.center.x - c.halfW);
    x1 = Math.max(x1, c.center.x + c.halfW);
    y0 = Math.min(y0, c.center.y - c.halfH);
    y1 = Math.max(y1, c.center.y + c.halfH);
  }
  const topAt = (x: number): number => Math.max(-Infinity, ...polys.map((c) => yOn(c, x) ?? -Infinity), ...boxes.filter((c) => Math.abs(x - c.center.x) <= c.halfW).map((c) => c.center.y + c.halfH));
  /** The solid under every polyline / box in `mat`, vertex-tinted. */
  const solid = (mat: string, hex: number, shade?: (x: number, y: number, z: number) => number): void => {
    for (const c of polys) {
      const g = skirt(c, profile, depth);
      if (g) push(buckets, mat, tintGeo(g, hex, shade));
    }
    for (const c of boxes) push(buckets, mat, tintGeo(new THREE.BoxGeometry(c.halfW * 2, c.halfH * 2, depth), hex, shade), at(c.center.x, c.center.y, 0, c.angle));
  };
  const plankBoard = (mat: string, hex: number, t: number): void => {
    for (const c of polys) {
      const g = board(c, t, depth);
      if (g) push(buckets, mat, tintGeo(g, hex));
    }
  };
  /** A spinning (registered in `drums`) or static body for a circle collider. */
  const roller = (c: ColliderCircle, geo: THREE.BufferGeometry, mat: string): void => {
    if (c.rolls) {
      const dm = ctx.lib.derive(mat);
      dm.vertexColors = true;
      const m = new THREE.Mesh(geo, fogify(dm));
      m.position.set(c.center.x, c.center.y, 0);
      m.castShadow = true;
      m.receiveShadow = true;
      ctx.group.add(m);
      ctx.drums.set(c.id, m);
    } else push(buckets, mat, geo, at(c.center.x, c.center.y, 0));
  };
  const face = depth / 2;
  switch (prop) {
    case 'container': {
      solid('container', LIVERY[variant % LIVERY.length]!, (_x, y) => 0.8 + 0.2 * Math.min(1, (y - y0) / 2.6));
      for (const x of [x0 + 0.09, x1 - 0.09]) push(buckets, 'darkSteel', tintGeo(new THREE.BoxGeometry(0.18, y1 - y0, 0.18), 0x707070), at(x, (y0 + y1) / 2, face - 0.05));
      push(buckets, 'darkSteel', tintGeo(new THREE.BoxGeometry(x1 - x0, 0.12, 0.16), 0x707070), at((x0 + x1) / 2, y1 - 0.06, face - 0.05));
      return true;
    }
    case 'pallet':
    case 'timber-deck':
    case 'pier': {
      solid('pallet', prop === 'pier' ? 0x9a7a58 : 0xd8b888, (x) => 0.85 + 0.15 * Math.abs(Math.sin(x * 9)));
      // Stringer blocks on the camera face every 0.6 m (stacked pallets / cribbing).
      for (let x = x0 + 0.1; x < x1 - 0.05; x += 0.6) {
        const gy = profileY(profile, x);
        const h = topAt(x) - gy;
        if (h > 0.12 && Number.isFinite(h)) push(buckets, 'pallet', tintGeo(new THREE.BoxGeometry(0.12, h - 0.02, 0.06), 0x6a5036), at(x, gy + h / 2, face + 0.02));
      }
      if (prop === 'pier') for (let x = x0 + 0.5; x < x1; x += 2) push(buckets, 'darkSteel', tintGeo(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 10), 0x404446), at(x, topAt(x) + 0.25, face - 0.25));
      return true;
    }
    case 'gangway':
    case 'hull': {
      solid('rustSteel', prop === 'hull' ? 0xc07040 : 0x9a9a94, (x, y) => 0.75 + 0.25 * Math.sin(x * 1.7 + y));
      if (prop === 'hull') for (let x = x0 + 0.5; x < x1; x += 1.1) {
        const gy = profileY(profile, x);
        const h = topAt(x) - gy;
        if (h > 0.2 && Number.isFinite(h)) push(buckets, 'rustSteel', tintGeo(new THREE.BoxGeometry(0.12, h, 0.1), 0x6a3a22), at(x, gy + h / 2, face + 0.03));
      }
      if (prop === 'gangway') for (const c of polys) {
        for (const z of [-1.4, 1.4]) {
          for (let i = 0; i < c.points.length; i++) {
            const q = c.points[i]!;
            push(buckets, 'darkSteel', tintGeo(new THREE.BoxGeometry(0.05, 0.95, 0.05), 0xd8d2c4), at(q.x, q.y + 0.47, z));
            const n = c.points[i + 1];
            if (n) push(buckets, 'darkSteel', tintGeo(new THREE.BoxGeometry(Math.hypot(n.x - q.x, n.y - q.y), 0.05, 0.05), 0xd8d2c4), at((q.x + n.x) / 2, (q.y + n.y) / 2 + 0.95, z, Math.atan2(n.y - q.y, n.x - q.x)));
          }
        }
      }
      return true;
    }
    case 'hung-container': {
      plankBoard('container', LIVERY[variant % LIVERY.length]!, 2.4);
      push(buckets, 'darkSteel', tintGeo(new THREE.BoxGeometry(x1 - x0 + 0.4, 0.3, 2.6), 0xd8a030), at((x0 + x1) / 2, y1 + 3.2, 0));
      for (const x of [x0 + 0.2, x1 - 0.2]) for (const z of [-1.1, 1.1]) push(buckets, 'darkSteel', tintGeo(new THREE.CylinderGeometry(0.025, 0.025, 3.2, 5), 0x303030), at(x, y1 + 1.6, z));
      return true;
    }
    case 'log-stack': {
      solid('pallet', 0x6a4c34);
      for (let x = x0 + 0.28; x < x1 - 0.2; x += 0.52) for (let y = profileY(profile, x) + 0.26; y < topAt(x) - 0.2; y += 0.48) push(buckets, 'pallet', tintGeo(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 10).rotateX(Math.PI / 2), 0xd8b484), at(x, y, face + 0.04));
      return true;
    }
    case 'block':
      solid('concrete', 0xfff0d0, (x, y) => (Math.abs(((y - y0) % 1.1) - 1.05) < 0.05 || Math.abs(((x - x0) % 1.6) - 1.55) < 0.05 ? 0.7 : 0.9 + 0.1 * Math.sin(x * 13 + y * 7)));
      return true;
    case 'ice-ledge':
      solid('snow', 0x8cc8e4, (_x, y) => 0.6 + 0.4 * Math.min(1, (y - y0) / Math.max(0.3, y1 - y0)));
      plankBoard('snow', 0xf4f8ff, 0.18);
      return true;
    case 'cornice':
      solid('snow', 0xf2f6fc);
      return true;
    case 'truck-bed':
    case 'ore-cart': {
      if (!polys.length && !boxes.length) return false;
      solid('rustSteel', prop === 'ore-cart' ? 0x9a5430 : 0x4a4c50);
      for (const x of [x0 + 0.5, x1 - 0.5]) for (const z of [-1.3, 1.3]) push(buckets, 'tyre', tintGeo(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12).rotateX(Math.PI / 2), 0x333333), at(x, profileY(profile, x) + 0.35, z));
      return true;
    }
    case 'conveyor': {
      plankBoard('tyre', 0x4a4844, 0.12);
      for (const c of polys) {
        const q0 = c.points[0]!;
        const q1 = c.points[c.points.length - 1]!;
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          const x = q0.x + (q1.x - q0.x) * t;
          const y = q0.y + (q1.y - q0.y) * t - 0.12;
          const gy = profileY(profile, x);
          if (y - gy > 0.2) for (const z of [-1.3, 1.3]) push(buckets, 'rustSteel', tintGeo(new THREE.BoxGeometry(0.1, y - gy, 0.1), 0x9a5a34), at(x, gy + (y - gy) / 2, z));
        }
      }
      if (!polys.length) solid('rustSteel', 0x9a5a34);
      return true;
    }
    case 'flume':
    case 'fence':
    case 'rope-bridge': {
      if (polys.length && prop !== 'flume') plankBoard('pallet', prop === 'fence' ? 0x6a5638 : 0xa88a60, 0.08);
      else solid('pallet', 0x8a6a48);
      if (boxes.length && prop !== 'flume') solid('pallet', 0x8a6a48);
      return true;
    }
    default:
      break;
  }
  // Circle props.
  if (!circles.length) return false;
  for (const c of circles) {
    const r = c.radius;
    const w = Math.min(3, Number(p.width ?? 2.2));
    const gy = profileY(profile, c.center.x);
    if (prop === 'stump' || prop === 'lift-tower') {
      const h = Math.max(0.1, c.center.y - gy) + r;
      push(buckets, prop === 'stump' ? 'pallet' : 'darkSteel', tintGeo(new THREE.CylinderGeometry(r, r * 1.15, h, 10), prop === 'stump' ? 0x6a4c34 : 0x8a9098), at(c.center.x, gy + h / 2 - 0.02, 0));
      continue;
    }
    if (prop === 'buoy' && !c.rolls && c.center.y - gy > r * 1.5) {
      // Upright buoy under a pole cap.
      push(buckets, 'container', G.buoyGeometry(c.center.y - gy + r * 0.5).translate(0, gy - c.center.y, 0), at(c.center.x, c.center.y, 0));
      continue;
    }
    let geo: THREE.BufferGeometry;
    let mat = 'tyre';
    if (prop === 'tyre') geo = tintGeo(new THREE.TorusGeometry(r * 0.72, r * 0.28, 8, 20).scale(1, 1, 3.2), 0x3a3a3a);
    else if (prop === 'buoy') {
      mat = 'container';
      geo = tintGeo(new THREE.CylinderGeometry(r, r, w, 16).rotateX(Math.PI / 2), 0x1f7c80, (_x, _y, z) => (Math.abs(z) % 0.8 < 0.22 ? 2.6 : 1));
    } else if (prop === 'log') {
      mat = 'pallet';
      geo = tintGeo(new THREE.CylinderGeometry(r, r * 0.97, w + 0.6, 14).rotateX(Math.PI / 2), 0x6a4c34);
    } else if (prop === 'pulley') {
      mat = 'rustSteel';
      geo = G.merge([
        tintGeo(new THREE.CylinderGeometry(r, r, w, 20).rotateX(Math.PI / 2), 0x3a3836),
        tintGeo(new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.1, 20).rotateX(Math.PI / 2).translate(0, 0, w / 2), 0x9a5a34),
        tintGeo(new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.1, 20).rotateX(Math.PI / 2).translate(0, 0, -w / 2), 0x9a5a34),
        tintGeo(new THREE.BoxGeometry(r * 1.8, 0.08, 0.04).translate(0, 0, w / 2 + 0.06), 0xe8e2d0),
      ]);
    } else if (prop === 'rubble') {
      mat = 'concrete';
      geo = tintGeo(new THREE.IcosahedronGeometry(r, 1).scale(1.2, 1, 1.1), 0xf0dcc0);
    } else geo = tintGeo(new THREE.CylinderGeometry(r, r, w, 16).rotateX(Math.PI / 2), prop === 'snowcat' ? 0x2a2a2a : 0x555555);
    roller(c, geo, mat);
  }
  if (polys.length || boxes.length) solid(prop === 'snowcat' ? 'container' : 'pallet', prop === 'snowcat' ? 0xc4321e : 0x8a6a48);
  return true;
}
