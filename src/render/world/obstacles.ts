/**
 * Obstacle bodies for all 12 `placed` kinds plus every non-polyline collider.
 * The ridden surface itself is a ribbon (track.ts); this file adds the solid
 * underneath so a ramp is a wedge, a drum a spool, a wall a wall. Static
 * bodies merge per material; seesaws and rolling drums stay separate so they
 * can animate from `state.seesaws` / `state.drums`.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BiomeId, Collider, ColliderCircle, ColliderPolyline, CompiledTrack, PlacedObstacle, Vec2 } from '../../core/types';
import type { MaterialLibrary } from '../materials/library';
import { fogify } from '../lighting/environment';
import { profileY } from './track';
import * as G from './zones/geo';
import { zoneFace, zonePaint } from './zones/zoneDeck';

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
    if (typeof p.prop === 'string' && zoneProp(p.prop, po, cols, { biome: track.def.meta?.biome ?? 'industrial', buckets, group, drums, profile, lib, depth: DEPTH })) continue;
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
          const zoneBody = typeof p.prop === 'string' ? seesawProp(p.prop, c, lib, DEPTH) : null;
          if (zoneBody) {
            for (const m of zoneBody.moving) pivot.add(m);
            for (const [mat, g] of zoneBody.stand) push(buckets, mat, g, at(c.pivot.x, profileY(profile, c.pivot.x), 0));
            group.add(pivot);
            seesaws.set(c.id, pivot);
            continue;
          }
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
      // Store release round 2: in a zone with a deck face (zones/zoneDeck.ts) the pit's water sits just under
      // the notch in the face (the near ground), between the pit's back wall and the face — never proud of it.
      const face = zoneFace(track.def.meta?.biome ?? 'industrial');
      const zA = face ? -2.97 : -DEPTH;
      const zB = face ? face.edge - 0.02 : DEPTH;
      const g = new THREE.PlaneGeometry(w, zB - zA);
      g.rotateX(-Math.PI / 2);
      const m = fogify(new THREE.MeshStandardMaterial({ color: face ? 0x1d5a66 : 0x0f2a33, roughness: face ? 0.25 : 0.05, metalness: face ? 0.1 : 0.6 }));
      const mesh = new THREE.Mesh(g, m);
      const wy = face ? Math.min(hz.max.y - 0.02, profileY(profile, (hz.min.x + hz.max.x) / 2) - face.h - 0.08) : hz.max.y - 0.02;
      mesh.position.set((hz.min.x + hz.max.x) / 2, wy, (zA + zB) / 2);
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
    const zp = matName.startsWith('zone:') ? zonePaint(lib, track.def.meta?.biome ?? 'industrial', matName.slice(5) as 'top' | 'face') : null;
    let mat = zp ? zp.mat : lib.get(matName.startsWith('zone:') ? 'concrete' : matName);
    const metal = matName === 'rustSteel' || matName === 'darkSteel';
    if (tinted && (!mat.vertexColors || metal)) {
      mat = lib.derive(metal ? 'container' : matName); // metal: the weathered corrugated-plate maps, lit (the steel maps read black)
      mat.vertexColors = true;
      // Round 2: zone props are weathered metal whose colour is baked per vertex — the library's dark base colour
      // multiplied under it and its polished 0.6 metalness read black (hull plating, ore carts, conveyors).
      if (metal) {
        mat.metalness = Math.min(mat.metalness, 0.25);
        mat.color.setHex(0xd8d0c8);
      }
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
  biome: BiomeId;
  buckets: Bucket;
  group: THREE.Group;
  drums: Map<number, THREE.Object3D>;
  profile: readonly Vec2[];
  lib: MaterialLibrary;
  depth: number;
}

const LIVERY = [0x2f8a8a, 0xa8482e, 0x2e5f8e, 0xb86a2a, 0x8a2e24, 0x3a7a58];

/** Replace uv with world-space planar coordinates: u from x (and a little z, so end faces are not a smear), v from −y. */
function worldUv(g: THREE.BufferGeometry, su: number, sv: number): void {
  const p = g.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) + p.getZ(i) * 0.37) / su;
    uv[i * 2 + 1] = -p.getY(i) / sv;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

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
      const dm = mat.startsWith('zone:') ? (zonePaint(ctx.lib, ctx.biome, mat.slice(5) as 'top' | 'face')?.mat ?? ctx.lib.derive('concrete')) : ctx.lib.derive(mat);
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
      if (prop === 'timber-deck') {
        // Log cribbing on the camera face (B-ride's ramps): barked logs laid along x in courses, their sawn ends
        // showing where a course stops under a rising deck.
        for (let y = y0 + 0.2; y < y1 - 0.15; y += 0.38) {
          let a: number | null = null;
          const flush = (b: number): void => {
            if (a !== null && b - a > 0.5) {
              push(buckets, 'pallet', tintGeo(new THREE.CylinderGeometry(0.18, 0.18, b - a, 9).rotateZ(Math.PI / 2), 0x5a4030, () => 0.8 + 0.25 * Math.abs(Math.sin(y * 17))), at((a + b) / 2, y, face + 0.06));
              for (const e of [a, b]) push(buckets, 'pallet', tintGeo(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 10).rotateZ(Math.PI / 2), 0xd6b080), at(e, y, face + 0.06));
            }
            a = null;
          };
          for (let x = x0 + 0.1; x <= x1 - 0.1; x += 0.2) {
            const ok = topAt(x) - 0.2 > y && profileY(profile, x) < y - 0.1;
            if (ok && a === null) a = x;
            if (!ok) flush(x - 0.2);
          }
          flush(x1 - 0.1);
        }
      }
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
    case 'block': {
      // Round 2: cut sandstone courses — the quarry deck's own painting (zoneDeck.ts), mapped in world space so
      // the courses run level and continue across neighbouring blocks: 4 m of course per u, 1.7 m per v.
      const before = (buckets.get('zone:face') ?? []).length;
      solid('zone:face', 0xffffff, (_x, y) => 0.92 + 0.08 * Math.min(1, (y - y0) / 1.5));
      for (const g of (buckets.get('zone:face') ?? []).slice(before)) worldUv(g, 4, 1.7);
      return true;
    }
    case 'ice-ledge':
      solid('snow', 0x8cc8e4, (_x, y) => 0.6 + 0.4 * Math.min(1, (y - y0) / Math.max(0.3, y1 - y0)));
      plankBoard('snow', 0xf4f8ff, 0.18);
      return true;
    case 'cornice': {
      // Wind-sculpted: the snow body, a curled overhang at the downhill lip (below the ridden top) and wind
      // scallops along both faces.
      solid('snow', 0xf2f6fc, (_x, y) => 0.85 + 0.15 * Math.min(1, (y - y0) / 1.5));
      const lipX = polys.length ? (topAt(x1 - 0.05) >= topAt(x0 + 0.05) ? x1 : x0) : x1;
      const dir = lipX === x1 ? 1 : -1;
      const ly = topAt(lipX - dir * 0.05);
      if (Number.isFinite(ly)) push(buckets, 'snow', G.snowBankGeometryZ(41).scale(1.4, 0.9, depth * 1.05).translate(0, -0.45, 0), at(lipX + dir * 0.2, ly - 0.12, 0));
      for (let x = x0 + 0.6; x < x1 - 0.4; x += 1.3) {
        const t = topAt(x);
        if (Number.isFinite(t) && t - profileY(profile, x) > 0.5) for (const z of [-face, face]) push(buckets, 'snow', G.snowBankGeometryZ(43 + Math.round(x)).scale(1.2, 0.8, 0.5), at(x, t - 0.55, z));
      }
      return true;
    }
    case 'truck-bed':
    case 'ore-cart': {
      if (!polys.length && !boxes.length) return false;
      solid('rustSteel', prop === 'ore-cart' ? 0x9a5430 : 0x5a5c60, (x, y) => 0.8 + 0.2 * Math.sin(x * 2.3 + y * 1.7));
      for (const x of [x0 + 0.5, x1 - 0.5]) for (const z of [-1.3, 1.3]) push(buckets, 'tyre', tintGeo(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12).rotateX(Math.PI / 2), 0x333333), at(x, profileY(profile, x) + 0.35, z));
      if (prop === 'truck-bed') {
        // Bolster stakes along the far side and a log load behind the rider (outside the lane, above the bed).
        for (let x = x0 + 0.4; x < x1; x += 1.6) {
          const t = topAt(x);
          if (!Number.isFinite(t)) continue;
          push(buckets, 'rustSteel', tintGeo(new THREE.BoxGeometry(0.14, 1.3, 0.14), 0x3a3c40), at(x, t + 0.65, -1.45));
        }
        for (const [dz, dy] of [[-1.15, 0.28], [-0.72, 0.28], [-0.95, 0.72]] as const) {
          const L = x1 - x0 - 0.2;
          if (L < 0.5) continue;
          push(buckets, 'pallet', tintGeo(new THREE.CylinderGeometry(0.24, 0.24, L, 9).rotateZ(Math.PI / 2), 0x5a4030), at((x0 + x1) / 2, Math.max(topAt(x0 + 0.2), topAt(x1 - 0.2)) + dy, dz));
        }
      } else {
        // A rubble load struck along the cart's far rim.
        const rnd = G.lcg(Math.round(x0 * 10));
        for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.35) {
          const t = topAt(x);
          if (Number.isFinite(t)) push(buckets, 'zone:top', tintGeo(new THREE.IcosahedronGeometry(0.14 + rnd() * 0.1, 0).scale(1.2, 0.8, 1), 0xffffff), at(x, t + 0.05, -1.25 + rnd() * 0.3));
        }
      }
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
    case 'flume': {
      // Round 2: a timber water flume on trestles — the collider is the trough floor; board walls either side of
      // the lane (the near wall 18 cm, under the wheel line), a film of water on the floor, sheeting off the lip.
      const wood = 0x7a5a3a;
      for (const c of polys) {
        const pts = c.points;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1]!;
          const b = pts[i]!;
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          if (len < 0.05) continue;
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          push(buckets, 'pallet', tintGeo(new THREE.BoxGeometry(len, 0.1, depth), wood, (x) => 0.8 + 0.2 * Math.abs(Math.sin(x * 7))), at(mx, my - 0.05, 0, ang));
          push(buckets, 'pallet', tintGeo(new THREE.BoxGeometry(len, 0.5, 0.08), 0x6a4a30), at(mx, my + 0.2, -face + 0.04, ang));
          push(buckets, 'pallet', tintGeo(new THREE.BoxGeometry(len, 0.3, 0.08), 0x6a4a30), at(mx, my + 0.05, face - 0.04, ang));
          push(buckets, 'plastic', tintGeo(new THREE.BoxGeometry(len, 0.012, depth - 0.2), 0x3f8ea6), at(mx, my + 0.008, 0, ang));
        }
        // Trestles every 1.6 m: two legs, a cross-tie and a diagonal brace down to the ground.
        const x0c = pts[0]!.x;
        const x1c = pts[pts.length - 1]!.x;
        for (let x = x0c + 0.3; x < x1c; x += 1.6) {
          const top = (yOn(c, x) ?? topAt(x)) - 0.1;
          const gy = profileY(profile, x);
          const h = top - gy;
          if (!(h > 0.15)) continue;
          for (const z of [-face + 0.15, face - 0.15]) push(buckets, 'pallet', tintGeo(new THREE.BoxGeometry(0.14, h, 0.14), 0x5a4030), at(x, gy + h / 2, z));
          push(buckets, 'pallet', tintGeo(new THREE.BoxGeometry(0.1, 0.1, depth - 0.2), 0x5a4030), at(x, gy + h * 0.45, 0));
          if (h > 0.6) push(buckets, 'pallet', tintGeo(new THREE.BoxGeometry(0.08, Math.hypot(h, depth - 0.3), 0.06), 0x5a4030), at(x, gy + h / 2, face - 0.1, 0));
        }
        // Water sheeting off the high end (the lip): a thin falling curtain beyond the collider, then splash.
        const hi = pts[pts.length - 1]!.y >= pts[0]!.y ? pts[pts.length - 1]! : pts[0]!;
        const dir = hi === pts[0] ? -1 : 1;
        const gyL = profileY(profile, hi.x + dir * 0.4);
        const fall = hi.y - gyL;
        if (fall > 0.3) {
          push(buckets, 'plastic', tintGeo(new THREE.BoxGeometry(0.03, fall, depth - 0.3), 0x9fd2e2), at(hi.x + dir * 0.25, gyL + fall / 2, 0, dir * 0.12));
          push(buckets, 'plastic', tintGeo(new THREE.CylinderGeometry(0.6, 0.8, 0.12, 10).scale(1, 1, 2), 0xeaf8ff), at(hi.x + dir * 0.5, gyL + 0.05, 0));
        }
      }
      for (const c of boxes) push(buckets, 'pallet', tintGeo(new THREE.BoxGeometry(c.halfW * 2, c.halfH * 2, depth), wood), at(c.center.x, c.center.y, 0, c.angle));
      return true;
    }
    case 'fence': {
      // Avalanche snow fence: the ridden top is its capping rail; vertical slats with gaps on both faces down to
      // the snow, posts every 1.2 m, a snow crust along the top edge (under the lane's surface).
      plankBoard('pallet', 0x5a4632, 0.08);
      if (boxes.length) solid('pallet', 0x5a4632);
      for (const c of polys) {
        const x0c = Math.min(c.points[0]!.x, c.points[c.points.length - 1]!.x);
        const x1c = Math.max(c.points[0]!.x, c.points[c.points.length - 1]!.x);
        for (let x = x0c + 0.06; x < x1c; x += 0.16) {
          const top = (yOn(c, x) ?? -Infinity) - 0.08;
          const gy = profileY(profile, x);
          const h = top - gy;
          if (!(h > 0.1)) continue;
          for (const z of [-face + 0.03, face - 0.03]) push(buckets, 'pallet', tintGeo(new THREE.BoxGeometry(0.1, h, 0.03), 0x4a3a28, () => 0.8 + 0.4 * Math.abs(Math.sin(x * 31))), at(x, gy + h / 2, z));
        }
        for (let x = x0c + 0.1; x < x1c; x += 1.2) {
          const top = (yOn(c, x) ?? -Infinity) - 0.08;
          const gy = profileY(profile, x);
          if (top - gy > 0.1) for (const z of [-face + 0.08, face - 0.08]) push(buckets, 'pallet', tintGeo(new THREE.BoxGeometry(0.14, top - gy, 0.14), 0x3e2e20), at(x, (top + gy) / 2, z));
        }
      }
      return true;
    }
    case 'rope-bridge': {
      // Plank-and-rope deck: the slats are the collider boards; hand ropes on posts either side of the lane.
      plankBoard('pallet', 0xa88a60, 0.08);
      if (boxes.length) solid('pallet', 0x8a6a48);
      for (const c of polys) {
        const q0 = c.points[0]!;
        const q1 = c.points[c.points.length - 1]!;
        for (const z of [-1.45, 1.45]) {
          for (const q of [q0, q1]) push(buckets, 'pallet', tintGeo(new THREE.BoxGeometry(0.12, 1.1, 0.12), 0x5a4030), at(q.x, q.y + 0.45, z));
          const L = Math.hypot(q1.x - q0.x, q1.y - q0.y);
          push(buckets, 'pallet', tintGeo(new THREE.CylinderGeometry(0.025, 0.025, L, 5).rotateZ(Math.PI / 2), 0xb09060), at((q0.x + q1.x) / 2, (q0.y + q1.y) / 2 + 0.9, z, Math.atan2(q1.y - q0.y, q1.x - q0.x)));
          push(buckets, 'pallet', tintGeo(new THREE.CylinderGeometry(0.02, 0.02, L, 5).rotateZ(Math.PI / 2), 0xb09060), at((q0.x + q1.x) / 2, (q0.y + q1.y) / 2 + 0.45, z, Math.atan2(q1.y - q0.y, q1.x - q0.x)));
        }
        for (let x = Math.min(q0.x, q1.x) + 0.2; x < Math.max(q0.x, q1.x); x += 0.36) {
          const y = yOn(c, x);
          if (y !== null) push(buckets, 'pallet', tintGeo(new THREE.BoxGeometry(0.2, 0.05, depth + 0.1), 0x8a6a48, () => 0.8 + 0.3 * Math.abs(Math.sin(x * 13))), at(x, y - 0.06, 0));
        }
      }
      return true;
    }
    case 'stump':
    case 'lift-tower': {
      if (prop === 'stump') {
        // Sawn stumps / cribbing posts under a ledge: bark cylinders standing across the face, ringed tops.
        solid('pallet', 0x4a3424);
        for (let x = x0 + 0.3; x < x1 - 0.15; x += 0.55) {
          const top = topAt(x);
          const gy = profileY(profile, x);
          const h = top - gy;
          if (!(h > 0.15)) continue;
          push(buckets, 'pallet', tintGeo(new THREE.CylinderGeometry(0.26, 0.3, h, 10), 0x5a4030, (_x, y) => 0.8 + 0.2 * Math.sin(y * 9)), at(x, gy + h / 2, face + 0.02));
          push(buckets, 'pallet', tintGeo(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 12), 0xd6b080), at(x, top - 0.011, face + 0.02));
        }
        return true;
      }
      // Lift tower: the ridden top is the steel sheave platform (grating), a lattice pylon under it, the ramp a
      // grated access stair on a steel frame; sheave trains hang under the platform's edges.
      const grey = 0x7a8088;
      for (const c of polys) {
        const g = board(c, 0.12, depth);
        if (g) push(buckets, 'darkSteel', tintGeo(g, 0x9aa0a6));
      }
      for (const c of boxes) push(buckets, 'darkSteel', tintGeo(new THREE.BoxGeometry(c.halfW * 2, 0.14, depth), 0x9aa0a6), at(c.center.x, c.center.y + c.halfH - 0.07, 0, c.angle));
      const mid = (x0 + x1) / 2;
      const top = topAt(mid) - 0.12;
      const gy = profileY(profile, mid);
      if (top - gy > 0.3) {
        const w = Math.min(1.6, Math.max(0.8, (x1 - x0) * 0.4));
        for (const part of G.lattice(w, top - gy, G.rgb(grey), 0.12, Math.max(2, Math.round((top - gy) / 1.2)))) push(buckets, 'darkSteel', part, at(mid, gy, 0));
        for (const z of [-face + 0.1, face - 0.1]) for (const dx of [-0.6, -0.2, 0.2, 0.6]) push(buckets, 'darkSteel', tintGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 10).rotateX(Math.PI / 2), 0x2e3238), at(mid + dx, top - 0.3, z));
      }
      for (let x = x0 + 0.2; x < x1; x += 0.9) {
        const t = topAt(x) - 0.12;
        const g0 = profileY(profile, x);
        if (t - g0 > 0.2) for (const z of [-face + 0.05, face - 0.05]) push(buckets, 'darkSteel', tintGeo(new THREE.BoxGeometry(0.08, t - g0, 0.08), 0x5a6068), at(x, (t + g0) / 2, z));
      }
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
      mat = 'zone:top'; // the quarry's painted pale dust / stone (zoneDeck.ts)
      geo = tintGeo(new THREE.IcosahedronGeometry(r, 1).scale(1.2, 1, 1.1), 0xf0dcc0);
    } else geo = tintGeo(new THREE.CylinderGeometry(r, r, w, 16).rotateX(Math.PI / 2), prop === 'snowcat' ? 0x2a2a2a : 0x555555);
    roller(c, geo, mat);
  }
  if (polys.length || boxes.length) solid(prop === 'snowcat' ? 'container' : 'pallet', prop === 'snowcat' ? 0xc4321e : 0x8a6a48);
  return true;
}


/**
 * ROCKHOP see-saw props (round 2). The pivot group tips with the physics body exactly as the plain see-saw does
 * (the renderer rotates the group by the state's angle); every moving part is a child of it, and the ridden
 * top is still the plank's top (local y = thickness). The ends reach the ground at the angle limit, so
 * anything under the top tapers to nothing at the ends. `stand` is static (pivot foot, local to the ground
 * under the pivot).
 *   ore-cart  a rusted ore wagon on a tipping rail stub: the top is its rubble load struck level, the tub
 *             tapers under it, its wheel set sits on a rail stub on a timber trestle at the fulcrum;
 *   log       a hewn log teetering on the jam: flat-hewn top, bark underneath, sawn ends; the jam of logs under it.
 */
function seesawProp(prop: string, c: Extract<Collider, { kind: 'seesaw' }>, lib: MaterialLibrary, depth: number): { moving: THREE.Mesh[]; stand: [string, THREE.BufferGeometry][] } | null {
  const L = c.halfLength;
  const t = c.thickness;
  const h = c.pivot.y; // pivot height above its foot (ground is profileY at the pivot; the stand is built from 0)
  const vc = (name: string): THREE.MeshStandardMaterial => {
    const m = lib.derive(name === 'rustSteel' ? 'container' : name);
    m.vertexColors = true;
    if (name === 'rustSteel' || name === 'darkSteel') {
      m.color.setHex(0xd8d0c8); // the colour is baked per vertex (see the bucket merge above)
      m.metalness = 0.25;
    }
    return fogify(m);
  };
  const mesh = (g: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial): THREE.Mesh => {
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  /** Depth of the body under the top at local x: full over the middle, tapering to `end` at the tips. */
  const taper = (x: number, full: number, end: number, flat: number): number => {
    const a = Math.abs(x);
    return a <= flat ? full : end + (full - end) * Math.max(0, 1 - (a - flat) / (L - flat));
  };
  /** A prism under the top: `rows` stations along x, depth from `taper`, width `w`, narrowing by `pinch` at the bottom. */
  const hull = (full: number, end: number, flat: number, w: number, pinch: number, hex: number, shade?: (x: number, y: number, z: number) => number): THREE.BufferGeometry => {
    const g = new THREE.BoxGeometry(L * 2, 1, w, 16, 1, 1);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const top = pos.getY(i) > 0;
      const d = taper(x, full, end, flat);
      pos.setY(i, top ? t - 0.01 : t - 0.01 - d);
      if (!top) pos.setZ(i, pos.getZ(i) * pinch);
    }
    g.computeVertexNormals();
    return G.paint(g, G.rgb(hex), shade);
  };
  const standBase: [string, THREE.BufferGeometry][] = [];
  if (prop === 'ore-cart') {
    const rust = vc('rustSteel');
    rust.metalness = 0.25;
    const tub = hull(0.62, 0.06, 1.6, depth * 0.94, 0.8, 0x8a4a2a, (x, y) => 0.7 + 0.3 * Math.min(1, (y + 0.6) / 0.7) + 0.05 * Math.sin(x * 5));
    const parts: THREE.BufferGeometry[] = [tub];
    // Rim angle and vertical straps on the camera face; the rubble load struck level with the top.
    for (const z of [-depth * 0.47, depth * 0.47]) parts.push(G.box(L * 2, 0.08, 0.06, 0, t - 0.05, z, G.rgb(0x4a2e20)));
    for (let x = -L + 0.4; x < L; x += 0.8) parts.push(G.box(0.08, taper(x, 0.62, 0.06, 1.6), 0.04, x, t - 0.02 - taper(x, 0.62, 0.06, 1.6) / 2, depth * 0.47 + 0.02, G.rgb(0x5a3422)));
    const rnd = G.lcg(0x0c47 ^ Math.round(c.pivot.x * 10));
    const load: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 26; i++) load.push(G.paint(new THREE.IcosahedronGeometry(0.1 + rnd() * 0.1, 0).scale(1.3, 0.35, 1).translate((rnd() - 0.5) * L * 1.9, t - 0.04, (rnd() - 0.5) * depth * 0.85), G.STONE[i % G.STONE.length]!, () => 0.85));
    const loadMat = vc('concrete');
    loadMat.color.setHex(0xffffff);
    // The wheel set at the fulcrum rides the rail stub.
    const dark = vc('darkSteel');
    const wheels: THREE.BufferGeometry[] = [];
    for (const x of [-0.45, 0.45]) for (const z of [-0.72, 0.72]) wheels.push(G.cyl(0.26, 0.26, 0.1, 12, x, t - 0.62 - 0.12, z, G.rgb(0x2a2624), 'z'));
    wheels.push(G.box(1.3, 0.12, 1.5, 0, t - 0.66, 0, G.rgb(0x3a2a22)));
    const moving = [mesh(G.merge(parts), rust), mesh(G.merge(load), loadMat), mesh(G.merge(wheels), dark)];
    // Stand: a timber trestle carrying a short rail stub up to the wheels.
    const railY = h - 0.98;
    if (railY > 0.1) {
      standBase.push(['pallet', G.paint(new THREE.BoxGeometry(1.8, railY, 1.9).translate(0, railY / 2, 0), G.rgb(0x6a5036), (x, y) => 0.75 + 0.2 * Math.abs(Math.sin(y * 7 + x)))]);
      for (const z of [-0.72, 0.72]) standBase.push(['darkSteel', G.box(1.9, 0.1, 0.07, 0, railY + 0.05, z, G.rgb(0x5a4a40))]);
      for (let x = -0.8; x <= 0.8; x += 0.4) standBase.push(['pallet', G.box(0.18, 0.1, 1.9, x, railY - 0.02, 0, G.rgb(0x4a3624))]);
    }
    return { moving, stand: standBase };
  }
  if (prop === 'log') {
    const wood = vc('pallet');
    // Hewn log: flat top (the ridden face, pale sawn wood), bark below, the diameter tapering toward the tips.
    const bark = hull(0.42, 0.1, 1.0, depth * 0.55, 0.55, 0x5a4030, (x, y) => (y > t - 0.03 ? 2.2 : 0.8 + 0.2 * Math.abs(Math.sin(x * 3))));
    const parts: THREE.BufferGeometry[] = [bark];
    for (const s of [-1, 1]) parts.push(G.paint(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12).rotateZ(Math.PI / 2).scale(1, 0.5, depth * 0.55 * 2.4), G.rgb(0xd6b080)).translate(s * (L - 0.01), t - 0.08, 0));
    const moving = [mesh(G.merge(parts), wood)];
    // The jam: a pile of logs under the fulcrum.
    const jam: THREE.BufferGeometry[] = [];
    const n = Math.max(1, Math.floor((h - 0.2) / 0.36));
    for (let r = 0; r < n; r++) for (let k = 0; k < Math.max(1, 3 - r); k++) {
      const x = (k - (Math.max(1, 3 - r) - 1) / 2) * 0.4;
      jam.push(G.paint(new THREE.CylinderGeometry(0.19, 0.19, depth + 0.4, 9).rotateX(Math.PI / 2).translate(x, 0.19 + r * 0.34, 0), G.rgb(0x5a4030), () => 0.8 + 0.2 * r));
    }
    standBase.push(['pallet', G.merge(jam)]);
    return { moving, stand: standBase };
  }
  return null;
}
