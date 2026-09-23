/**
 * ROCKHOP zone kits (store release Phase 2, D5 / D20 / D23): the world around the ribbon for the four zones —
 * COAST (C-ride), ALPINE (B-ride), QUARRY (Q2 + Q1's props) and SNOWLINE (B-ride-snow, the `snow` biome).
 *
 * Each zone is built in the same three depth tiers the mockups read in:
 *   near  — deck level either side of the ribbon (z +8.5 … −9): the zone's own junk / timber / blocks / snow,
 *   mid   — the zone's structures 10–60 m back: container piers and gantry cranes, pine rows and the sawmill,
 *           the terraced pit with its pool, headframe and conveyors, the ice gorge and the lift line,
 *   far   — sea / lake / pit floor planes out to the painted plate (`plate-<zone>`, biomeKit) and the sky.
 * Every batch uses a library material (or one of three shared local ones) with the colour baked per vertex,
 * so `buildBatches` merges a zone into ≈ 10 draws per 40 m chunk. No new shadow casters beyond the rig's
 * sun; far batches never cast. Nothing here reads a clock: every placement is seeded from the track.
 */
import * as THREE from 'three';
import type { Rng } from '../../../core/rng';
import type { BiomeId, CompiledTrack } from '../../../core/types';
import type { Biome } from '../../biomes';
import type { MaterialLibrary } from '../../materials/library';
import { fogify } from '../../lighting/environment';
import { PropBatch, bakeAO, containerGeometry, contactShadowBatch, drumGeometry, palletGeometry, radialDiscTexture, rockGeometry, tyreStackGeometry, type WorldDetail } from '../props';
import { profileY } from '../track';
import type { SetPiecePlan } from '../setPieces';
import * as G from './geo';
import { ZONE_FACE, zonePaint } from './zoneDeck';

/** The zone ids this kit builds (`snow` is SNOWLINE). */
export type ZoneBiome = 'coast' | 'alpine' | 'quarry' | 'snow';
export function isZone(id: BiomeId): id is ZoneBiome {
  return id === 'coast' || id === 'alpine' || id === 'quarry' || id === 'snow';
}

/** Simulated-time uniform for the zone shaders (gulls, water glints): the renderer sets it every frame. */
export const ZONE_TIME = { value: 0 };

export interface ZoneKit {
  meshes: THREE.Mesh[];
  batches: PropBatch[];
  textureBytes: number;
  scroll: { tex: THREE.Texture; vx: number; vy: number }[];
}

export interface ZoneCtx {
  track: CompiledTrack;
  biome: Biome;
  lib: MaterialLibrary;
  rng: Rng;
  detail: WorldDetail;
  keepOut: (x: number, half?: number) => boolean;
  plan: SetPiecePlan;
  x0: number;
  x1: number;
}

/** The zone's ground height at (x, z) — the terrain mesh and every prop placement read this. */
export function zoneGround(id: ZoneBiome, profile: CompiledTrack['def']['profile'], x: number, z: number): number {
  const py = profileY(profile, x);
  const base = py - 0.42;
  const az = Math.abs(z);
  const face = ZONE_FACE[id];
  if (face && z > 0) {
    // Round 2: the near ground lies at the foot of the deck's face (zoneDeck.ts), where the foreground stands.
    const z0 = face.edge + face.run;
    if (z < z0) return base;
    const wob = Math.sin(x * 0.13 + z * 0.3) * 0.2 * Math.min(1, (z - z0) / 8);
    return py - face.h - Math.min(1, (z - z0) / 36) ** 2 * 1.4 + wob;
  }
  if (id === 'snow' && z > 3) {
    // Round 2: the snow shelf falls away in front of the trail as a drift bank, so the foreground sits below it.
    const t = Math.min(1, (z - 3) / 2.4);
    return base - t * t * (3 - 2 * t) * 1.3 - Math.min(1, Math.max(0, z - 5.4) / 30) ** 2 * 1.4 + Math.sin(x * 0.13 + z * 0.3) * 0.2 * Math.min(1, (z - 3) / 10);
  }
  if (az <= 3) return base;
  const wob = Math.sin(x * 0.13 + z * 0.3) * 0.25 * Math.min(1, (az - 3) / 20);
  if (z > 0) return base - Math.min(1, (z - 3) / 30) ** 2 * 2.2 + wob;
  switch (id) {
    case 'coast': {
      // Yard to z −12, the beach falls under the sea (seaY = floor − 2.4) by z −19.
      if (z > -12) return base - Math.min(1, (az - 3) / 12) ** 2 * 0.5 + wob;
      return base - 0.5 - Math.min(1, (az - 12) / 7) * 3.6;
    }
    case 'alpine':
      // Meadow falling gently to the lake shore (lakeY = floor − 7 at z −70).
      return base - Math.min(1, (az - 3) / 67) ** 1.4 * 7.2 + wob * 2;
    case 'quarry':
      // The rim: flat to the lip at z −9 (the benches take it from there).
      return base - Math.min(1, (az - 3) / 6) ** 2 * 0.25 + wob * 0.5;
    case 'snow': {
      // Shelf to z −20, the gorge floor at z −26 … −50, the snowfield rising behind the ice walls.
      if (z > -20) return base - Math.min(1, (az - 3) / 17) ** 2 * 1.6 + wob;
      if (z > -26) return base - 1.6 - ((az - 20) / 6) * 11;
      if (z > -52) return base - 12.6 + wob;
      return base - 1.5 + Math.min(1, (az - 52) / 110) * 9 + wob * 3;
    }
  }
}

/** Foreground scrap reads as rust, not a black tangle (the rust-steel albedo is dark under the vertex colours). */
const SCRAP_LIFT = new THREE.Color(1.9, 1.6, 1.4);

const COAST_LIVERIES = [0x2f8a8a, 0xa8482e, 0x2e5f8e, 0x1f6e70, 0xb86a2a, 0x8a2e24, 0xd8cdb4, 0x3a7a58].map((c) => new THREE.Color(c));

export function buildZoneKit(ctx: ZoneCtx): ZoneKit {
  const { track, biome, lib, rng, keepOut, x0, x1 } = ctx;
  const id = biome.id as ZoneBiome;
  const profile = track.def.profile;
  const meshes: THREE.Mesh[] = [];
  const batches: PropBatch[] = [];
  const scroll: ZoneKit['scroll'] = [];
  let textureBytes = 0;
  const gy = (x: number, z: number): number => zoneGround(id, profile, x, z);
  const floor = Math.min(...profile.map((p) => p.y)) - 0.42;
  const span = x1 - x0;
  const midX = (x0 + x1) / 2;
  const PB = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, shadows = true): PropBatch => {
    const b = new PropBatch(name, geo.getAttribute('color') ? geo : G.paint(geo, [1, 1, 1]), mat, shadows);
    batches.push(b);
    return b;
  };
  // Shared materials: library ones (textured, already compiled) + three local vertex-colour ones.
  const foliage = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, vertexColors: true, side: THREE.DoubleSide }));
  foliage.name = 'zone-foliage';
  const painted = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0.25, vertexColors: true }));
  painted.name = 'zone-painted';
  lib.complete(foliage);
  lib.complete(painted);
  // Round 2: weathered rust, not polished — the library's 0.6 metalness read near black on every zone prop.
  const rust = lib.derive('rustSteel');
  rust.metalness = 0.22;
  rust.color.setHex(0xb8aca0); // the rust hue is baked per vertex; the library's dark base under it read black
  const wood = lib.get('pallet');
  // Stone: the fine neutral concrete grain tinted per zone (the library rock albedo is baked orange); the quarry's
  // stone and ground take its own painted pale dust instead (round 2: the concrete grain read dark brown there).
  const quarryPaint = id === 'quarry' ? zonePaint(lib, 'quarry', 'top') : null;
  if (quarryPaint) textureBytes += quarryPaint.bytes;
  const rock = quarryPaint ? quarryPaint.mat : lib.derive('concrete');
  rock.color.setHex(0xffffff);
  const cont = lib.get('container');
  const tyreM = lib.get('tyre');
  const snowM = lib.get('snow');
  const shadows = contactShadowBatch('contactshadow', id === 'snow' ? 0.3 : 0.5, (m) => lib.complete(m));
  batches.push(shadows);
  textureBytes += 128 * 128 * 4;
  const shadowAt = (x: number, z: number, r: number, sz = r): void => shadows.add(x, gy(x, z) + 0.012, z, rng.range(0, 6), r, null, 0, 1, sz);

  // --- Terrain ------------------------------------------------------------------------------------------
  {
    // Round 2: faced zones leave the band under the deck open (the slab and its pits are the deck's own
    // geometry) — the far ground stops at z −3 and the near ground starts at the face's foot.
    const face = ZONE_FACE[id];
    const nearZ = face ? face.edge + face.run : 3.0;
    const zRows: number[] =
      id === 'coast' ? [-24, -19, -15, -12, -7, -3.0, nearZ, 3.4, 5, 7, 10, 45]
      : id === 'alpine' ? [-110, -72, -50, -30, -16, -8, -3.0, nearZ, 3.6, 5, 7, 10, 45]
      : id === 'quarry' ? [-9.2, -6, -3.0, nearZ, 3.4, 5, 7, 10, 45]
      : [-170, -110, -70, -52, -50, -26, -20, -12, -3.0, 3.0, 3.8, 4.6, 5.4, 6.4, 9, 45];
    const grid: number[] = [];
    for (let x = x0 - 20; x <= x1 + 20; x += 4) grid.push(x);
    // Round 2: columns also at every profile vertex, so the near ground meets the face's foot on every bump.
    const cols: number[] = [];
    for (const x of [...grid, ...profile.map((p) => p.x)].sort((a, b) => a - b)) if (!cols.length || x - cols[cols.length - 1]! > 0.35) cols.push(x);
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const C = {
      yard: G.rgb(0x8a7e6e), sand: G.rgb(0xc8b088), wet: G.rgb(0x6e604c),
      grass: G.rgb(0x5e7e36), grass2: G.rgb(0x7a9040), trail: G.rgb(0x8a6c4a),
      dust: G.rgb(0xf6e4c0), snow: G.rgb(0xf2f6fc), rockSnow: G.rgb(0x7a7e88),
    };
    const mix = (a: G.RGB, b: G.RGB, t: number, k: number): G.RGB => [(a[0] + (b[0] - a[0]) * t) * k, (a[1] + (b[1] - a[1]) * t) * k, (a[2] + (b[2] - a[2]) * t) * k];
    const tint = (x: number, z: number, y: number): G.RGB => {
      const n = 0.9 + 0.1 * Math.sin(x * 0.37 + z * 0.9) * Math.sin(x * 0.11 - z * 0.23);
      const az = Math.abs(z);
      if (id === 'coast') {
        if (y < floor - 2.0) return mix(C.wet, C.sand, 0.2, n);
        return mix(C.yard, C.sand, z < -12 ? Math.min(1, (az - 12) / 4) : 0, n);
      }
      if (id === 'alpine') {
        const patch = 0.5 + 0.5 * Math.sin(x * 0.21 + z * 0.4);
        const g = mix(C.grass, C.grass2, patch, n);
        return az < 4.2 ? mix(C.trail, g, (az - 3) / 1.2, 1) : g;
      }
      if (id === 'quarry') return [n * 0.98, n * 0.95, n * 0.9]; // the painted dust (quarryPaint) carries the colour
      return az > 20 && az < 26 ? mix(C.rockSnow, C.snow, 0.3, n) : mix(C.snow, C.snow, 0, n);
    };
    for (let i = 0; i < cols.length; i++) {
      const x = cols[i]!;
      for (let r = 0; r < zRows.length; r++) {
        const z = zRows[r]!;
        const y = gy(x, z);
        pos.push(x, y, z);
        uv.push(x / 4, z / 4);
        col.push(...tint(x, z, y));
        if (i > 0 && r > 0 && !(face && zRows[r - 1] === -3.0 && zRows[r] === nearZ)) {
          const c = i * zRows.length + r;
          const p = (i - 1) * zRows.length + r;
          idx.push(p - 1, p, c - 1, c - 1, p, c);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const tm = quarryPaint ? quarryPaint.mat : lib.derive(id === 'snow' ? 'snow' : 'concrete'); // a neutral fine grain the vertex colour tints per zone
    tm.color.setHex(0xffffff);
    tm.vertexColors = true;
    tm.needsUpdate = true;
    const m = new THREE.Mesh(g, fogify(tm));
    m.receiveShadow = true;
    m.name = 'terrain';
    meshes.push(m);
  }

  /** A flat water plane (sea / lake / pit pool) with a near→far colour ramp. */
  const water = (xa: number, xb: number, za: number, zb: number, y: number, near: number, far: number, name: string): void => {
    const g = new THREE.PlaneGeometry(xb - xa, za - zb, 8, 12).rotateX(-Math.PI / 2).translate((xa + xb) / 2, y, (za + zb) / 2);
    const cn = new THREE.Color(near);
    const cf = new THREE.Color(far);
    G.paint(g, [1, 1, 1]);
    const p = g.getAttribute('position');
    const c = g.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const t = Math.min(1, Math.max(0, (za - p.getZ(i)) / (za - zb)));
      const s = 0.94 + 0.06 * Math.sin(p.getX(i) * 0.05 + p.getZ(i) * 0.2);
      c.setXYZ(i, (cn.r + (cf.r - cn.r) * t) * s, (cn.g + (cf.g - cn.g) * t) * s, (cn.b + (cf.b - cn.b) * t) * s);
    }
    const mat = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.0, vertexColors: true, envMapIntensity: 0.18 }));
    lib.complete(mat);
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    m.name = `zone:${name}`;
    meshes.push(m);
  };

  /** Rocks (shared batch per zone). */
  const rockBatches = [0, 1, 2].map((i) => PB(`zrock${i}`, bakeAO(rockGeometry((track.def.seed ^ (0x9e37 * (i + 1))) >>> 0, i === 2 ? 1 : 2), 1.4, 0.3), rock));
  const rockFar = PB('zrockfar', rockGeometry(track.def.seed ^ 0x4411, 1), rock, false);
  const rockTint = id === 'quarry' ? 0xf4e2c4 : id === 'snow' ? 0x7a7e88 : id === 'alpine' ? 0x8e8a84 : 0x8a847c;
  const boulder = (x: number, z: number, s: number, sy = s * rng.range(0.55, 0.9)): void => {
    rockBatches[rng.int(0, 2)]!.add(x, gy(x, z) + sy * 0.12, z, rng.range(0, 6), s, rockTint, rng.range(-0.15, 0.15), sy, s * rng.range(0.8, 1.2));
    if (s > 0.5) shadowAt(x, z, s * 1.2);
  };

  // --- Round 2: the near layer ------------------------------------------------------------------------------
  // Everything in front of the deck stands on the lowered near ground (the face's foot, `zoneGround`) and is
  // scaled to stay 12 cm under the lowest deck top within 2.5 m either side, so from any riding camera above the
  // deck it draws below the bike's contact line: it frames the bottom third without ever reaching the bike.
  const faceDef = ZONE_FACE[id];
  const nearZ0 = faceDef ? faceDef.edge + faceDef.run : 3.0;
  const deckMin = (x: number, r = 2.5): number => {
    let m = Math.min(profileY(profile, x - r), profileY(profile, x), profileY(profile, x + r));
    for (const p of profile) if (p.x > x - r && p.x < x + r) m = Math.min(m, p.y);
    return m;
  };
  const room = (x: number, z: number): number => deckMin(x) - 0.12 - gy(x, z);
  /** Scale `s` of an item `H` metres tall at that scale 1, fitted under the room `h`. */
  const fit = (H: number, s: number, h: number): number => Math.min(s, h / H);
  const nearLayer = (foot: (x: number, z: number, h: number) => void, front: (x: number, z: number, h: number) => void, footGap: [number, number] = [0.7, 1.6], frontGap: [number, number] = [1.2, 2.6]): void => {
    for (let x = x0 + 2; x < x1; x += rng.range(footGap[0], footGap[1])) {
      const z = nearZ0 + rng.range(0.25, 1.2);
      const h = room(x, z);
      if (h > 0.22) foot(x, z, h);
    }
    for (let x = x0 + 3; x < x1; x += rng.range(frontGap[0], frontGap[1])) {
      const z = nearZ0 + rng.range(1.3, 4.8);
      const h = room(x, z);
      if (h > 0.3) front(x, z, h);
    }
  };

  if (id === 'coast') buildCoast();
  else if (id === 'alpine') buildAlpine();
  else if (id === 'quarry') buildQuarry();
  else buildSnowline();

  return { meshes, batches, textureBytes, scroll };

  // =========================================================================================================
  // COAST — C-ride: container stacks, gantry cranes, beached hulls, buoys, pallets, tyres, rope; the bay behind.
  // =========================================================================================================
  function buildCoast(): void {
    const seaY = floor - 2.4;
    water(x0 - 260, x1 + 260, -15, -205, seaY, 0x0c5660, 0x1a5e78, 'sea');
    // Foam where the beach meets the sea.
    const foamMat = new THREE.MeshStandardMaterial({ color: 0xf4fbff, roughness: 0.6, map: radialDiscTexture(1.4), transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    lib.complete(foamMat);
    const foam = PB('foam', new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2), foamMat, false);
    for (let x = x0; x < x1; x += rng.range(2.5, 4.5)) foam.add(x, seaY + 0.03, rng.range(-15.2, -16.6), rng.range(-0.2, 0.2), rng.range(2.5, 4.5), null, 0, 1, rng.range(0.25, 0.5));

    const containers = PB('container', bakeAO(containerGeometry(), 2.59, 0.4), cont);
    const containersFar = PB('container-far', bakeAO(containerGeometry(), 2.59, 0.4), cont, false);
    const livery = (): THREE.Color => COAST_LIVERIES[rng.int(0, COAST_LIVERIES.length - 1)]!.clone().multiplyScalar(rng.range(0.85, 1.1));
    const pallets = PB('pallet', bakeAO(palletGeometry(), 0.144, 0.25), wood);
    const tyres = PB('tyres', tyreStackGeometry(), tyreM);
    const tyreFlat = PB('tyreflat', G.tyreFlatGeometry(), tyreM);
    const drums = PB('drum', drumGeometry(), lib.get('barrelBlue'));
    const buoys = PB('buoy', G.buoyGeometry(2.6), painted);
    const buoysLying = PB('buoylying', G.buoyGeometry(2.0), painted);
    const bollards = PB('bollard', G.bollardGeometry(), painted);
    const ropes = PB('rope', G.ropeCoilGeometry(), foliage);
    const nets = PB('net', G.netPileGeometry(track.def.seed ^ 3), foliage);
    const scrap = [0, 1].map((i) => PB(`scrap${i}`, G.scrapHeapGeometry((track.def.seed ^ (i * 977 + 5)) >>> 0), rust));
    const quay = PB('quay', G.quayGeometry(), lib.get('concrete'));
    const piles = PB('pile', G.pileGeometry(), wood);
    const deckPlanks = PB('pierdeck', G.paint(new THREE.BoxGeometry(1, 0.3, 1).translate(0, -0.15, 0), G.rgb(0x7a6246)), wood);
    const cranes = PB('crane', G.gantryCraneGeometry(), painted);
    const cranesRust = PB('crane-rust', G.gantryCraneGeometry(0x9a5a34, 26), painted);
    const hulls = PB('hull', G.hullGeometry(track.def.seed ^ 11), painted, false);
    const hullsNear = PB('hull-near', G.hullGeometry(track.def.seed ^ 13, 30), painted);
    const lighthouse = PB('lighthouse', G.lighthouseGeometry(), painted, false);

    /** A container stack (1–h high) at (x, z), `ry` along x or turned. */
    const stack = (x: number, z: number, h: number, ry = 0, far = false): void => {
      const b = far ? containersFar : containers;
      let y = gy(x, z);
      for (let k = 0; k < h; k++) {
        b.add(x + rng.range(-0.15, 0.15), y, z + rng.range(-0.1, 0.1), ry + rng.range(-0.03, 0.03), 1, livery());
        y += 2.59;
      }
      if (!far) shadowAt(x, z, 3.4, 1.6);
    };

    // Quay wall along the beach top at z −13 with bollards and hung fenders.
    for (let x = x0 - 10; x < x1 + 10; x += 12) {
      quay.add(x + 6, seaY - 1, -13.6, 0, 12, 0xffffff, 0, (gy(x + 6, -12) - seaY + 1) / 3, 0.35);
      bollards.add(x + 3, gy(x + 3, -12.2), -12.4, 0);
      if (rng.next() < 0.6) tyreFlat.add(x + 8, gy(x + 8, -12) - 0.9, -14.9, 0, 1, null, Math.PI / 2);
    }

    // Near shelf (z −3.6 … −8.5): the scrapyard proper, 2.4 m slots.
    for (let x = x0 + 6; x < x1; x += 2.4) {
      const r = rng.next();
      if (r < 0.2) continue;
      const z = rng.range(-3.8, -7.5);
      if (r < 0.26) stack(x + 1.5, -7.6, 1, rng.next() < 0.3 ? rng.range(-0.3, 0.3) : 0);
      else if (r < 0.46) {
        for (let k = 0; k < rng.int(2, 6); k++) pallets.add(x + rng.range(-0.1, 0.1), gy(x, z) + k * 0.144, z, rng.range(-0.1, 0.1));
        shadowAt(x, z, 0.9, 0.6);
      } else if (r < 0.56) {
        tyres.add(x, gy(x, z), z, 0);
        if (rng.next() < 0.6) tyreFlat.add(x + 0.9, gy(x + 0.9, z), z + 0.4, 0);
        shadowAt(x, z, 0.6);
      } else if (r < 0.64) {
        buoysLying.add(x, gy(x, z) + 0.45, z, rng.range(-0.5, 0.5), 1, null, Math.PI / 2 - 0.1);
        shadowAt(x, z, 1.1, 0.6);
      } else if (r < 0.72) {
        scrap[rng.int(0, 1)]!.add(x, gy(x, z), z, rng.range(0, 6), rng.range(0.8, 1.3));
        shadowAt(x, z, 1.4, 1);
      } else if (r < 0.8) {
        nets.add(x, gy(x, z), z, rng.range(0, 6), rng.range(0.8, 1.3));
        ropes.add(x + 1.1, gy(x + 1.1, z), z + 0.5, rng.range(0, 6));
      } else if (r < 0.88) {
        drums.add(x, gy(x, z), z, rng.range(0, 6), 1, rng.next() < 0.5 ? 0xb85a2a : null);
        drums.add(x + 0.65, gy(x, z), z + 0.2, rng.range(0, 6), 1, rng.next() < 0.5 ? 0x2a7a7a : null);
        shadowAt(x + 0.3, z, 0.8);
      } else if (r < 0.94) {
        buoys.add(x, gy(x, z), z, rng.range(0, 6));
        shadowAt(x, z, 0.7);
      } else boulder(x, z, rng.range(0.5, 1.1));
    }
    // Mid band (z −10 … −12): a container block now and then along the quay, low enough to keep the bay in view.
    for (let x = x0; x < x1; x += rng.range(24, 40)) {
      if (rng.next() < 0.35) continue;
      const n = rng.int(1, 2);
      for (let i = 0; i < n; i++) stack(x + i * 6.2, -11 + rng.range(-0.4, 0.4), rng.next() < 0.3 ? 2 : 1);
    }
    // Piers on piles into the bay, each carrying a crane and container rows, every ~90–130 m.
    for (let px = x0 + rng.range(20, 60); px < x1 + 40; px += rng.range(90, 130)) {
      const deckY = gy(px, -12) + 0.1;
      // The pier: a causeway on piles out to a quay block at z −45 … −75 carrying a crane and container rows.
      for (let z = -16; z >= -44; z -= 4) for (const dx of [-2, 2]) piles.add(px + dx, seaY - 1.5, z, 0, 1, null, 0, deckY - seaY + 1.5, 1);
      deckPlanks.add(px, deckY, -30, 0, 5, null, 0, 1, 28);
      for (let x = px - 16; x <= px + 16; x += 4) for (let z = -46; z >= -74; z -= 4) piles.add(x, seaY - 1.5, z, 0, 1, null, 0, deckY - seaY + 1.5, 1);
      deckPlanks.add(px, deckY, -60, 0, 36, null, 0, 1, 30);
      (rng.next() < 0.6 ? cranes : cranesRust).add(px + rng.range(-3, 3), deckY, -62, 0, 1);
      for (let x = px - 14; x <= px + 14; x += 6.3) if (rng.next() < 0.75) for (let k = 0; k < rng.int(1, 3); k++) containersFar.add(x + rng.range(-0.2, 0.2), deckY + k * 2.59, -50 + rng.range(-0.3, 0.3), rng.range(-0.02, 0.02), 1, livery());
    }
    // Beached hulls on the tide line and wrecks out in the bay.
    for (let hx = x0 + rng.range(40, 80); hx < x1 + 60; hx += rng.range(110, 170)) {
      hullsNear.add(hx, seaY - 1.8, -58 - rng.range(0, 10), rng.range(-0.15, 0.15), 1, new THREE.Color(1, 1, 1).multiplyScalar(rng.range(0.85, 1.05)), rng.range(-0.08, 0.02));
    }
    for (let hx = x0 - 60; hx < x1 + 120; hx += rng.range(80, 140)) {
      hulls.add(hx, seaY - rng.range(2.5, 4.5), rng.range(-80, -150), rng.range(-0.6, 0.6), rng.range(0.9, 1.3), null, rng.range(-0.25, 0.2));
    }
    // Sea stacks and a lighthouse islet.
    for (let x = x0 - 80; x < x1 + 120; x += rng.range(35, 70)) {
      const z = rng.range(-60, -170);
      const s = rng.range(4, 12);
      rockFar.add(x, seaY - 1, z, rng.range(0, 6), s, 0x8a8478, 0, s * rng.range(0.6, 1.4), s * 0.8);
    }
    for (let lx = x0 + rng.range(30, 120); lx < x1 + 100; lx += rng.range(260, 360)) {
      const z = -rng.range(120, 160);
      rockFar.add(lx, seaY - 2, z, 0, 14, 0x8a8074, 0, 7, 10);
      lighthouse.add(lx, seaY + 3.4, z, 0, 1.1);
    }
    // Gulls wheeling over the bay (vertex-animated from ZONE_TIME).
    meshes.push(gulls(24, -10, -70, floor + 7, floor + 20));
    // Round 2 near layer (C-ride's bottom third): truck tyres, tyre stacks, rope coils, nets, rusty scrap, pallets,
    // drums, a beached buoy, bollards; tyre fenders hung on the quay face.
    const truckTyre = PB('trucktyre', G.truckTyreGeometry(), tyreM);
    const tyreStack = (x: number, z: number, h: number): void => {
      const n = Math.max(1, Math.min(rng.int(1, 3), Math.floor(h / 0.32)));
      for (let k = 0; k < n; k++) tyreFlat.add(x + rng.range(-0.08, 0.08), gy(x, z) + k * 0.3, z + rng.range(-0.08, 0.08), 0, rng.range(0.95, 1.15));
      shadowAt(x, z, 0.8);
    };
    const palletPile = (x: number, z: number, h: number): void => {
      const n = Math.max(1, Math.min(rng.int(1, 5), Math.floor(h / 0.144)));
      const ry = rng.range(-0.5, 0.5);
      for (let k = 0; k < n; k++) pallets.add(x + rng.range(-0.06, 0.06), gy(x, z) + k * 0.144, z, ry + rng.range(-0.08, 0.08));
      shadowAt(x, z, 0.9, 0.7);
    };
    nearLayer(
      (x, z, h) => {
        const r = rng.next();
        if (r < 0.2) tyreStack(x, z, h);
        else if (r < 0.34) truckTyre.add(x, gy(x, z), z, rng.range(-0.6, 0.6), fit(0.95, rng.range(0.85, 1.1), h), null, rng.range(-0.15, 0.15));
        else if (r < 0.5) palletPile(x, z, h);
        else if (r < 0.6) ropes.add(x, gy(x, z), z, rng.range(0, 6), fit(0.45, rng.range(0.9, 1.2), h));
        else if (r < 0.7) nets.add(x, gy(x, z), z, rng.range(0, 6), fit(0.55, rng.range(0.6, 0.9), h));
        else if (r < 0.78) drums.add(x, gy(x, z) + 0.29, z, rng.range(-0.4, 0.4), 1, rng.next() < 0.5 ? 0x9a4a24 : 0x2a6a6a, Math.PI / 2);
        else if (r < 0.86) scrap[rng.int(0, 1)]!.add(x, gy(x, z), z, rng.range(0, 6), fit(1.2, rng.range(0.5, 0.8), h), SCRAP_LIFT);
        else boulder(x, z, rng.range(0.25, 0.45), rng.range(0.15, 0.3));
      },
      (x, z, h) => {
        const r = rng.next();
        if (r < 0.2) {
          truckTyre.add(x, gy(x, z), z, rng.range(-0.9, 0.9), fit(0.95, rng.range(1.0, 1.35), h), null, rng.range(-0.2, 0.2));
          shadowAt(x, z, 0.9, 0.6);
        } else if (r < 0.36) {
          scrap[rng.int(0, 1)]!.add(x, gy(x, z), z, rng.range(0, 6), fit(1.2, rng.range(0.8, 1.2), h), SCRAP_LIFT);
          shadowAt(x, z, 1.5, 1.1);
        } else if (r < 0.48) nets.add(x, gy(x, z), z, rng.range(0, 6), fit(0.55, rng.range(0.9, 1.3), h));
        else if (r < 0.6) palletPile(x, z, h);
        else if (r < 0.7) {
          ropes.add(x, gy(x, z), z, rng.range(0, 6), fit(0.45, 1.1, h));
          tyreStack(x + 1.0, z + rng.range(-0.3, 0.3), h);
        } else if (r < 0.78) {
          buoysLying.add(x, gy(x, z) + 0.45 * fit(1.1, 1, h), z, rng.range(-0.6, 0.6), fit(1.1, 1, h), null, Math.PI / 2 - 0.1);
          shadowAt(x, z, 1.1, 0.6);
        } else if (r < 0.86) bollards.add(x, gy(x, z), z, 0, fit(0.72, 1, h));
        else tyreStack(x, z, h);
      },
    );
    // Tyre fenders hung on the quay face, every 5–9 m, their tops 17 cm under the deck edge.
    for (let x = x0 + 4; x < x1; x += rng.range(5, 9)) {
      const py = deckMin(x, 0.6);
      truckTyre.add(x, py - 1.12, (faceDef?.edge ?? 2) + 0.22, 0, 1, null, 0);
    }
  }

  // =========================================================================================================
  // ALPINE — B-ride: pine rows, log stacks, the sawmill and its water wheel, timber ramps, the lake, the range.
  // =========================================================================================================
  function buildAlpine(): void {
    const lakeY = floor - 7.4;
    water(x0 - 260, x1 + 260, -66, -205, lakeY, 0x24606e, 0x3d7e9a, 'lake');
    const near = [0, 1, 2].map((i) => G.pineGeometry((track.def.seed ^ (0x2f6b * (i + 1))) >>> 0, 1));
    const far = [0, 1].map((i) => G.pineGeometry((track.def.seed ^ (0x1d3 * (i + 3))) >>> 0, 0));
    const pines = near.map((t, i) => PB(`pine${i}`, t.tree, foliage));
    const pinesFar = far.map((t, i) => PB(`pinefar${i}`, t.tree, foliage, false));
    const tree = (x: number, z: number, s: number, isFar = false): void => {
      const list = isFar ? pinesFar : pines;
      list[rng.int(0, list.length - 1)]!.add(x, gy(x, z) - 0.2, z, rng.range(0, 6), s, new THREE.Color(1, 1, 1).multiplyScalar(rng.range(0.85, 1.15)), 0, s * rng.range(0.9, 1.2), s);
      if (!isFar && z > -20) shadowAt(x, z, 1.4 * s);
    };
    const grass = [0, 1].map((i) => PB(`grass${i}`, G.grassTuftGeometry(track.def.seed ^ (i * 31 + 11), i ? 0x6a9a3a : 0x4e7e2e), foliage, false));
    const flowers = [PB('lupin', G.flowerClumpGeometry(track.def.seed ^ 13, 0x7a5ac8), foliage, false), PB('daisy', G.flowerClumpGeometry(track.def.seed ^ 17, 0xf0e6c8), foliage, false)];
    const bushes = PB('bush', G.bushGeometry(track.def.seed ^ 19), foliage);
    const logs = [PB('logstack', G.logStackGeometry(track.def.seed ^ 7, 3, 4.5), wood), PB('logstack2', G.logStackGeometry(track.def.seed ^ 9, 2, 3.2), wood)];
    const stumps = PB('stump', G.stumpGeometry(), wood);
    const fence = PB('railfence', G.railFenceGeometry(), wood);
    const ramps = PB('timberramp', G.timberRampGeometry(), wood);
    const mill = PB('sawmill', G.sawmillGeometry(), wood);
    const wheel = PB('waterwheel', G.waterWheelGeometry(), wood);
    const truck = PB('loggingtruck', G.loggingTruckGeometry(), painted);
    const cabinGeo = G.merge([G.box(5, 3, 4, 0, 1.5, 0, G.rgb(0x7a5638)), G.box(5.6, 0.2, 2.6, 0, 3.6, 1.1, G.rgb(0x4a4a48), 0, 0, -0.55), G.box(5.6, 0.2, 2.6, 0, 3.6, -1.1, G.rgb(0x4a4a48), 0, 0, 0.55), G.box(1.2, 1.9, 0.1, -1, 0.95, 2.02, G.rgb(0x2a1e14)), G.box(1.0, 0.8, 0.1, 1.2, 1.8, 2.02, G.rgb(0x1a1c1c))]);
    const cabins = PB('cabin', G.ao(cabinGeo, 1.5, 0.35), wood);

    // Edges of the trail: grass, flowers, rocks — both sides, dense (B-ride's foreground is all meadow).
    for (let x = x0 + 2; x < x1; x += rng.range(0.6, 1.4)) {
      for (const side of [-1, 1]) {
        const z = side * rng.range(2.9, 6.5);
        if (side > 0 && keepOut(x, 0.6)) continue;
        const r = rng.next();
        if (r < 0.62) grass[rng.int(0, 1)]!.add(x, gy(x, z), z, rng.range(0, 6), rng.range(0.8, 1.5));
        else if (r < 0.74) flowers[rng.next() < 0.7 ? 0 : 1]!.add(x, gy(x, z), z, rng.range(0, 6), rng.range(0.8, 1.3));
        else if (r < 0.8) boulder(x, z, rng.range(0.3, 0.8));
      }
    }
    // Near shelf (z −4 … −12): log stacks, stumps, fences, bushes, the odd pine.
    for (let x = x0 + 6; x < x1; x += 2.6) {
      const r = rng.next();
      const z = rng.range(-4.2, -11);
      if (r < 0.1) {
        logs[rng.int(0, 1)]!.add(x, gy(x, z), z, rng.range(-0.1, 0.1));
        shadowAt(x, z, 2.4, 1.6);
      } else if (r < 0.18) stumps.add(x, gy(x, z), z, rng.range(0, 6), rng.range(0.8, 1.2));
      else if (r < 0.3) bushes.add(x, gy(x, z), z, rng.range(0, 6), rng.range(0.8, 1.4));
      else if (r < 0.33 && z < -8) tree(x, z, rng.range(0.7, 1.0));
      else if (r < 0.46) boulder(x, z, rng.range(0.6, 1.4));
    }
    for (let x = x0 + 10; x < x1; x += rng.range(20, 40)) {
      const n = rng.int(3, 6);
      for (let i = 0; i < n; i++) fence.add(x + i * 2.6, gy(x + i * 2.6, -4.6), -4.6, rng.range(-0.04, 0.04));
    }
    // Pine rows: mid (z −13 … −45), dense with clearings; far (−45 … −68) down to the lake shore.
    // B-ride keeps the lake and the range in view: the near forest is clumps with wide clearings, the dense rows
    // stand farther back and step down to the shore.
    for (let x = x0 - 20; x < x1 + 20; x += rng.range(2.4, 4.6)) {
      const clump = Math.sin(x * 0.045 + 1.3) > 0.35;
      if (clump && rng.next() < 0.7) tree(x, rng.range(-14, -26), rng.range(1.0, 1.5));
      if (rng.next() < 0.55) tree(x + 1.3, rng.range(-30, -48), rng.range(1.1, 1.6), true);
      if (rng.next() < 0.75) tree(x + 2.1, rng.range(-50, -66), rng.range(1.2, 1.8), true);
    }
    // Foreground big trunks now and then (B-ride frames the shot with one), outside keep-outs.
    for (let x = x0 + 30; x < x1; x += rng.range(55, 90)) if (!keepOut(x, 4)) tree(x, rng.range(9, 12), rng.range(1.1, 1.4));
    // Set pieces: the sawmill with its wheel near the start, the logging truck and a cabin down the course.
    const sx = track.def.start.pos.x - 14;
    mill.add(sx, gy(sx, -13) - 0.3, -13.5, 0);
    wheel.add(sx + 7.6, gy(sx + 7.6, -13) - 0.4, -11.2, 0);
    logs[0]!.add(sx + 12, gy(sx + 12, -9), -9, 0);
    for (let x = x0 + span * 0.3; x < x1 - 20; x += rng.range(120, 180)) {
      let tx = x;
      while (keepOut(tx, 8) && tx < x1) tx += 6;
      truck.add(tx, gy(tx, -9.5), -9.5, rng.next() < 0.5 ? 0 : Math.PI, 1);
      shadowAt(tx, -9.5, 7, 1.8);
      ramps.add(tx + 14, gy(tx + 14, -8), -8, 0);
    }
    for (let x = x0 + span * 0.6; x < x1; x += rng.range(160, 240)) cabins.add(x, gy(x, -18), -18, rng.range(-0.2, 0.2));
    // Round 2 near layer (B-ride's meadow foreground): logs, mossy rocks, ferns, lupins and daisies, stumps.
    const ferns = [PB('fern0', G.fernGeometry(track.def.seed ^ 21), foliage, false), PB('fern1', G.fernGeometry(track.def.seed ^ 23, 0x6a9238), foliage, false)];
    const logB = PB('log', G.ao(G.logGeometry(track.def.seed ^ 25), 0.44, 0.3), wood);
    const mossy = (x: number, z: number, s: number, h: number): void => {
      const sy = Math.min(s * rng.range(0.5, 0.8), h / 1.15);
      rockBatches[rng.int(0, 2)]!.add(x, gy(x, z) + sy * 0.12, z, rng.range(0, 6), s, new THREE.Color(0x8a9278).multiplyScalar(rng.range(0.85, 1.1)), rng.range(-0.15, 0.15), sy, s * rng.range(0.8, 1.2));
      if (s > 0.5) shadowAt(x, z, s * 1.2);
    };
    const logs1 = (x: number, z: number, h: number): void => {
      const n = h > 0.8 && rng.next() < 0.4 ? 2 : 1;
      const ry = rng.range(-0.35, 0.35);
      const s = fit(0.44, rng.range(0.85, 1.2), h / n);
      for (let k = 0; k < n; k++) logB.add(x + rng.range(-0.3, 0.3), gy(x, z) + k * 0.4 * s, z + k * 0.05, ry + rng.range(-0.06, 0.06), rng.range(2.2, 4.4), null, 0, s, s);
      shadowAt(x, z, 2.2, 0.6);
    };
    nearLayer(
      (x, z, h) => {
        const r = rng.next();
        if (r < 0.4) ferns[rng.int(0, 1)]!.add(x, gy(x, z), z, rng.range(0, 6), fit(0.5, rng.range(0.9, 1.3), h));
        else if (r < 0.6) grass[rng.int(0, 1)]!.add(x, gy(x, z), z, rng.range(0, 6), fit(0.6, rng.range(1.0, 1.5), h));
        else if (r < 0.72) flowers[rng.next() < 0.65 ? 0 : 1]!.add(x, gy(x, z), z, rng.range(0, 6), fit(0.85, rng.range(0.9, 1.2), h));
        else if (r < 0.86) mossy(x, z, rng.range(0.3, 0.6), h);
        else logs1(x, z, h);
      },
      (x, z, h) => {
        const r = rng.next();
        if (r < 0.22) logs1(x, z, h);
        else if (r < 0.4) mossy(x, z, rng.range(0.5, 1.1), h);
        else if (r < 0.62) ferns[rng.int(0, 1)]!.add(x, gy(x, z), z, rng.range(0, 6), fit(0.5, rng.range(1.2, 1.7), h));
        else if (r < 0.74) flowers[0]!.add(x, gy(x, z), z, rng.range(0, 6), fit(0.85, rng.range(1.0, 1.3), h));
        else if (r < 0.82) flowers[1]!.add(x, gy(x, z), z, rng.range(0, 6), fit(0.85, 1.1, h));
        else if (r < 0.9) stumps.add(x, gy(x, z), z, rng.range(0, 6), fit(0.55, rng.range(0.8, 1.1), h));
        else bushes.add(x, gy(x, z), z, rng.range(0, 6), fit(1.0, rng.range(0.7, 1.0), h));
      },
      [0.5, 1.2],
      [1.0, 2.2],
    );
    void midX;
  }

  // =========================================================================================================
  // QUARRY — Q2 (+ Q1 props): cut blocks, ore carts on rails, the terraced pit with its pool, headframe, conveyors.
  // =========================================================================================================
  function buildQuarry(): void {
    const benchGeos = [0, 1].map((i) => G.benchGeometry((track.def.seed ^ (i * 101 + 23)) >>> 0));
    const benches = benchGeos.map((g, i) => PB(`bench${i}`, g, rock));
    const blockGeos = [0, 1, 2].map((i) => G.cutBlockGeometry((track.def.seed ^ (i * 53 + 19)) >>> 0));
    const blocks = blockGeos.map((g, i) => PB(`block${i}`, g, rock));
    const stone = (): THREE.Color => {
      const s = G.STONE[rng.int(0, G.STONE.length - 1)]!;
      return new THREE.Color(s[0], s[1], s[2]).multiplyScalar(rng.range(1.0, 1.25));
    };
    const pitFloor = floor - 10.5;
    // The pit: benches stepping down from the rim (z −9) to the floor, then the far wall rising back up.
    const W = 60;
    for (let x = x0 - 40; x < x1 + 40; x += W) {
      let top = floor + 0.02;
      let z = -9;
      for (let k = 0; k < 3; k++) {
        const h = rng.range(3.0, 3.8);
        const d = rng.range(8, 11);
        benches[k % 2]!.add(x + rng.range(-4, 4), top - h, z - d / 2, Math.PI, W + 6, null, 0, h, d);
        top -= h;
        z -= d;
      }
    }
    // Pit floor (dusty) and the turquoise pool in the middle of it.
    {
      const g = new THREE.PlaneGeometry(span + 400, 80).rotateX(-Math.PI / 2).translate(midX, pitFloor + 0.05, -80);
      const m = new THREE.Mesh(G.paint(g, G.rgb(0xd8b894)), fogify(Object.assign(lib.derive('dirt'), { vertexColors: true })));
      m.receiveShadow = true;
      m.name = 'zone:pitfloor';
      meshes.push(m);
    }
    for (let x = x0 - 60; x < x1 + 60; x += rng.range(140, 220)) {
      const len = rng.range(70, 120);
      water(x, x + len, -48, -100, pitFloor + 0.3, 0x1f9a98, 0x2a8ea4, 'pool');
    }
    // Rim: stacks of cut blocks on the near shelf (Q2's foreground), rubble, scrub, survey poles.
    const scrub = PB('scrub', G.scrubGeometry(track.def.seed ^ 37), foliage);
    const poles = PB('surveypole', G.surveyPoleGeometry(3), painted);
    const rubble = PB('rubble', rockGeometry(track.def.seed ^ 0x77, 1), rock, false);
    for (let x = x0 + 4; x < x1; x += rng.range(0.9, 2.2)) {
      const side = rng.next() < 0.6 ? -1 : 1;
      const z = side * rng.range(2.75, 3.6);
      if (side > 0 && keepOut(x, 0.5)) continue;
      rubble.add(x, gy(x, z) + 0.03, z, rng.range(0, 6), rng.range(0.08, 0.2), 0xf0dcc0, rng.range(0, 3), rng.range(0.06, 0.14), rng.range(0.08, 0.2));
    }
    for (let x = x0 + 6; x < x1; x += 2.6) {
      const r = rng.next();
      const z = rng.range(-3.8, -8);
      if (r < 0.3) {
        // A small stack: 1–3 blocks, some offset.
        let y = gy(x, z);
        const n = rng.int(1, 3);
        for (let k = 0; k < n; k++) {
          const s = rng.range(1.0, 1.9) * (1 - k * 0.12);
          blocks[rng.int(0, 2)]!.add(x + rng.range(-0.3, 0.3), y, z + rng.range(-0.2, 0.2), rng.range(-0.2, 0.2), s * 1.3, stone(), 0, s, s);
          y += s;
        }
        shadowAt(x, z, 1.8, 1.2);
      } else if (r < 0.45) scrub.add(x, gy(x, z), z, rng.range(0, 6), rng.range(0.7, 1.3));
      else if (r < 0.55) boulder(x, z, rng.range(0.5, 1.3));
      else if (r < 0.58) poles.add(x, gy(x, z), z, 0, 1, null, rng.range(-0.05, 0.05));
    }
    // Ore carts on a rail spur along the shelf, and a haul truck / site hut now and then.
    const rails = PB('rail', G.railGeometry(), wood);
    const carts = PB('orecart', G.oreCartGeometry(), rust);
    const huts = PB('hut', G.hutGeometry(), painted);
    const trucks = PB('haultruck', G.haulTruckGeometry(), painted);
    for (let x = x0 + 30; x < x1 - 30; x += rng.range(80, 130)) {
      const L = rng.range(18, 30);
      for (let rx = x; rx < x + L; rx += 1) rails.add(rx + 0.5, gy(rx, -6.2), -6.2, 0);
      for (let k = 0; k < rng.int(1, 3); k++) {
        const cx = x + 2 + k * 2.3;
        carts.add(cx, gy(cx, -6.2) + 0.2, -6.2, 0);
        shadowAt(cx, -6.2, 1.2, 0.8);
      }
    }
    for (let x = x0 + span * 0.2; x < x1; x += rng.range(110, 170)) {
      huts.add(x, gy(x, -8.2), -8.2, rng.range(-0.1, 0.1));
      shadowAt(x, -8.2, 2.6, 2);
    }
    // In the pit: headframes on the benches, conveyors running up from the floor, trucks on the haul roads.
    const heads = PB('headframe', G.headframeGeometry(), rust);
    const conveyors = PB('conveyor', G.conveyorGeometry(34, 14), rust, false);
    for (let x = x0 + rng.range(10, 60); x < x1 + 60; x += rng.range(110, 160)) {
      heads.add(x, pitFloor, -46, rng.range(-0.3, 0.3), 1.1);
      conveyors.add(x + 18, pitFloor, -58, rng.next() < 0.5 ? 0 : Math.PI, 1);
    }
    for (let x = x0 + rng.range(40, 90); x < x1; x += rng.range(150, 220)) trucks.add(x, floor - 3.4, -14, rng.next() < 0.5 ? 0 : Math.PI, 0.9);
    // Round 2 near layer (Q2's foreground): cut blocks and broken block, rubble piles, desert scrub, pale rocks.
    const rubblePile = PB('rubblepile', G.rubblePileGeometry(track.def.seed ^ 27), rock);
    const block = (x: number, z: number, h: number, tilt: number): void => {
      let y = gy(x, z);
      const n = h > 1.2 && rng.next() < 0.35 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const s = Math.min(rng.range(0.55, 1.1) * (1 - k * 0.15), (h - (y - gy(x, z))) * 0.95);
        if (s < 0.2) break;
        blocks[rng.int(0, 2)]!.add(x + rng.range(-0.15, 0.15), y - (tilt ? s * 0.12 : 0), z + rng.range(-0.1, 0.1), rng.range(-0.4, 0.4), s * rng.range(1.1, 1.6), stone().multiplyScalar(1.2), tilt ? rng.range(-0.3, 0.3) : 0, s, s * rng.range(0.8, 1.1));
        y += s;
      }
      shadowAt(x, z, 1.2, 0.9);
    };
    nearLayer(
      (x, z, h) => {
        const r = rng.next();
        if (r < 0.3) rubblePile.add(x, gy(x, z), z, rng.range(0, 6), fit(0.55, rng.range(0.7, 1.2), h), 0xffffff);
        else if (r < 0.58) block(x, z, Math.min(h, 0.9), 1);
        else if (r < 0.78) scrub.add(x, gy(x, z), z, rng.range(0, 6), fit(0.9, rng.range(0.5, 0.8), h), null, 0, fit(0.9, 0.55, h), 0.8);
        else boulder(x, z, rng.range(0.25, 0.5), rng.range(0.15, 0.3));
      },
      (x, z, h) => {
        const r = rng.next();
        if (r < 0.32) block(x, z, h, rng.next() < 0.3 ? 1 : 0);
        else if (r < 0.56) rubblePile.add(x, gy(x, z), z, rng.range(0, 6), fit(0.55, rng.range(1.0, 1.6), h), 0xffffff);
        else if (r < 0.78) scrub.add(x, gy(x, z), z, rng.range(0, 6), fit(0.9, rng.range(0.7, 1.1), h), null, 0, fit(0.9, 0.8, h), 1);
        else boulder(x, z, rng.range(0.4, 0.8), Math.min(h / 1.2, rng.range(0.3, 0.6)));
      },
    );
  }

  // =========================================================================================================
  // SNOWLINE — B-ride-snow: snow shelf, avalanche fences, snow-laden pines, the ice gorge, the lift line, a snow-cat.
  // =========================================================================================================
  function buildSnowline(): void {
    const trees = [0, 1, 2].map((i) => G.pineGeometry((track.def.seed ^ (0x2f6b * (i + 1))) >>> 0, 1, true));
    const pines = trees.map((t, i) => PB(`spine${i}`, t.tree, foliage));
    const caps = trees.map((t, i) => PB(`spinecap${i}`, t.snow!, snowM, false));
    const farTrees = [0, 1].map((i) => G.pineGeometry((track.def.seed ^ (0x51 * (i + 5))) >>> 0, 0, true));
    const pinesFar = farTrees.map((t, i) => PB(`spinefar${i}`, t.tree, foliage, false));
    const capsFar = farTrees.map((t, i) => PB(`spinecapfar${i}`, t.snow!, snowM, false));
    const tree = (x: number, z: number, s: number, isFar = false): void => {
      const i = rng.int(0, isFar ? 1 : 2);
      const ry = rng.range(0, 6);
      const y = gy(x, z) - 0.3;
      (isFar ? pinesFar : pines)[i]!.add(x, y, z, ry, s);
      (isFar ? capsFar : caps)[i]!.add(x, y, z, ry, s);
      if (!isFar && z > -20) shadowAt(x, z, 1.3 * s);
    };
    const banks = PB('snowbank', G.snowBankGeometryZ(track.def.seed ^ 43), snowM, false);
    const posts = PB('snowpost', G.snowPostGeometry(), wood);
    const fences = PB('avfence', G.avalancheFenceGeometry(), wood);
    const iceMat = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.18, metalness: 0.05, vertexColors: true, emissive: 0x0e2a3a, emissiveIntensity: 0.6 }));
    lib.complete(iceMat);
    const ice = [0, 1].map((i) => PB(`icewall${i}`, G.iceWallGeometry((track.def.seed ^ (i * 17 + 41)) >>> 0), iceMat, false));
    const towers = PB('lifttower', G.liftTowerGeometry(), painted, false);
    const chairs = PB('liftchair', G.liftChairGeometryZ(), painted, false);
    const cables = PB('liftcable', G.paint(new THREE.BoxGeometry(1, 0.05, 0.05).translate(0.5, 0, 0), G.rgb(0x202428)), painted, false);
    const cats = PB('snowcat', G.snowcatGeometry(), painted);
    // Shelf edges: drifts and rocks, timber posts with snow caps.
    for (let x = x0 + 3; x < x1; x += rng.range(1.2, 3)) {
      for (const side of [-1, 1]) {
        const z = side * rng.range(3.0, 6.5);
        if (side > 0 && keepOut(x, 0.6)) continue;
        const r = rng.next();
        if (r < 0.5) banks.add(x, gy(x, z) - 0.05, z, rng.range(0, 6), rng.range(1.0, 2.6), null, 0, rng.range(0.4, 0.9), rng.range(0.8, 1.6));
        else if (r < 0.62) boulder(x, z, rng.range(0.4, 1.0));
      }
    }
    for (let x = x0 + 8; x < x1; x += rng.range(16, 34)) {
      const n = rng.int(3, 7);
      for (let i = 0; i < n; i++) posts.add(x + i * 2.4, gy(x + i * 2.4, -4.4), -4.4, 0, 1, null, rng.range(-0.05, 0.05), rng.range(1.0, 1.4), 1);
    }
    for (let x = x0 + 6; x < x1; x += 2.8) {
      const r = rng.next();
      const z = rng.range(-7, -18);
      if (r < 0.3) tree(x, z, rng.range(0.7, 1.2));
      else if (r < 0.38) {
        fences.add(x, gy(x, z), z, rng.range(-0.1, 0.1));
        banks.add(x, gy(x, z), z + 0.8, 0, 3.4, null, 0, 0.8, 1.2);
      } else if (r < 0.45) boulder(x, z, rng.range(0.8, 1.8));
    }
    // The ice gorge: glacier walls on the far side of the gorge (z −50 … −53), floor to the shelf level.
    for (let x = x0 - 30; x < x1 + 30; x += rng.range(7, 12)) {
      const w = rng.range(9, 14);
      const h = rng.range(9.5, 13);
      ice[rng.int(0, 1)]!.add(x, floor - 12.8, -50.5 + rng.range(-1.5, 1.5), rng.range(-0.12, 0.12), 1, null, 0, h, 1.2);
      ice[rng.int(0, 1)]!.add(x + w / 2, floor - 12.8, -52.5, rng.range(-0.1, 0.1), w, null, 0, h * rng.range(0.9, 1.1), 1);
    }
    // Snowfield behind: pines, avalanche fence rows, the lift line with its chairs, a snow-cat.
    for (let x = x0 - 40; x < x1 + 40; x += rng.range(3.5, 7)) {
      const z = rng.range(-56, -120);
      if (Math.sin(x * 0.03) > 0.2 || rng.next() < 0.3) tree(x, z, rng.range(0.9, 1.4), true);
    }
    for (let x = x0; x < x1 + 40; x += rng.range(24, 40)) {
      const z = rng.range(-70, -95);
      for (let i = 0; i < 4; i++) fences.add(x + i * 4.3, gy(x + i * 4.3, z) - 0.2, z, 0, 1.1);
    }
    {
      // The lift climbs to +x along z −62 → −120 (up the snowfield); towers every ~34 m of x.
      const tz = (x: number): number => -62 - ((x - x0) / Math.max(1, span)) * 50;
      let prev: { x: number; y: number; z: number } | null = null;
      for (let x = x0 - 20; x < x1 + 40; x += 34) {
        const z = tz(x);
        const y = gy(x, z);
        towers.add(x, y, z, 0);
        const top = { x, y: y + 10.6, z };
        if (prev) {
          const dx = top.x - prev.x;
          const dy = top.y - prev.y;
          const dz = top.z - prev.z;
          const L = Math.hypot(dx, dy, dz);
          const yaw = -Math.atan2(dz, dx);
          const pitch = Math.atan2(dy, Math.hypot(dx, dz));
          for (const side of [-2, 2]) {
            cables.add(prev.x, prev.y, prev.z + side, yaw, L, null, pitch, 1, 1);
            for (let t = 0.2; t < 1; t += 0.33) chairs.add(prev.x + dx * t, prev.y + dy * t, prev.z + dz * t + side, 0, 1);
          }
        }
        prev = top;
      }
    }
    for (let x = x0 + span * 0.35; x < x1; x += rng.range(160, 240)) cats.add(x, gy(x, -78), -78, rng.range(-0.4, 0.4), 1.2);
    // Round 2 near layer (B-ride-snow's foreground): snow-laden rocks and timber on the drift bank below the trail.
    const capB = PB('snowcap', G.snowCapGeometry(track.def.seed ^ 29), snowM, false);
    const slog = PB('slog', G.logGeometry(track.def.seed ^ 31), wood);
    const snowRock = (x: number, z: number, s: number, h: number): void => {
      const sy = Math.min(s * rng.range(0.5, 0.8), (h - 0.1) / 1.2);
      if (sy < 0.12) return;
      const ry = rng.range(0, 6);
      rockBatches[rng.int(0, 2)]!.add(x, gy(x, z) + sy * 0.12, z, ry, s, rockTint, rng.range(-0.1, 0.1), sy, s * rng.range(0.8, 1.1));
      capB.add(x, gy(x, z) + sy * 0.8, z, ry, s * 1.5, null, 0, sy * 0.95, s * 1.35);
      if (s > 0.5) shadowAt(x, z, s * 1.2);
    };
    const snowLog = (x: number, z: number, h: number): void => {
      const s = fit(0.62, rng.range(0.8, 1.1), h);
      const ry = rng.range(-0.5, 0.5);
      const L = rng.range(1.8, 3.6);
      slog.add(x, gy(x, z) - 0.04, z, ry, L, null, rng.range(-0.08, 0.08), s, s);
      capB.add(x, gy(x, z) + 0.4 * s, z, ry, L * 0.95, null, 0, 0.35 * s, 0.5 * s);
    };
    nearLayer(
      (x, z, h) => {
        const r = rng.next();
        if (r < 0.45) banks.add(x, gy(x, z) - 0.05, z, rng.range(0, 6), rng.range(1.0, 2.2), null, 0, Math.min(h * 0.9, rng.range(0.3, 0.6)), rng.range(0.8, 1.3));
        else if (r < 0.75) snowRock(x, z, rng.range(0.3, 0.6), h);
        else if (r < 0.88) snowLog(x, z, h);
        else posts.add(x, gy(x, z), z, rng.range(0, 6), 1, null, rng.range(-0.35, 0.35), Math.min(h * 0.9, rng.range(0.5, 0.9)), 1);
      },
      (x, z, h) => {
        const r = rng.next();
        if (r < 0.36) snowRock(x, z, rng.range(0.45, 0.95), h);
        else if (r < 0.6) snowLog(x, z, h);
        else if (r < 0.84) banks.add(x, gy(x, z) - 0.05, z, rng.range(0, 6), rng.range(1.4, 2.8), null, 0, Math.min(h * 0.9, rng.range(0.4, 0.8)), rng.range(0.9, 1.5));
        else for (let k = 0; k < 3; k++) posts.add(x + k * 0.45, gy(x + k * 0.45, z), z + rng.range(-0.2, 0.2), rng.range(0, 6), 1, null, rng.range(-0.4, 0.4), Math.min(h * 0.9, rng.range(0.5, 1.0)), 1);
      },
      [0.8, 1.8],
      [1.2, 2.6],
    );
  }

  /** `n` gulls circling in a box; one merged mesh whose vertex shader flaps and wheels them on ZONE_TIME. */
  function gulls(n: number, za: number, zb: number, ya: number, yb: number): THREE.Mesh {
    const base = G.gullGeometry();
    const parts: THREE.BufferGeometry[] = [];
    const cen: number[] = [];
    const count = base.getAttribute('position').count;
    for (let i = 0; i < n; i++) {
      const s = rng.range(0.8, 1.3);
      parts.push(base.clone().scale(s, s, s));
      const c = [rng.range(x0, x1), rng.range(ya, yb), rng.range(zb, za), rng.range(0, 6.28)];
      for (let k = 0; k < count; k++) cen.push(...c);
    }
    const merged = G.merge(parts);
    merged.setAttribute('aCentre', new THREE.Float32BufferAttribute(cen, 4));
    const mat = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, vertexColors: true, side: THREE.DoubleSide }));
    lib.complete(mat);
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, renderer) => {
      prev?.call(mat, shader, renderer);
      shader.uniforms.uZoneTime = ZONE_TIME;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aCentre;\nuniform float uZoneTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            float ph = aCentre.w;
            float a = uZoneTime * 0.35 + ph;
            vec3 local = transformed;
            float flap = sin(uZoneTime * 7.0 + ph * 3.0) * abs(local.x) * 0.9;
            local.y += flap;
            float yaw = -a + 1.5708;
            vec3 r = vec3(local.x * cos(yaw) - local.z * sin(yaw), local.y, local.x * sin(yaw) + local.z * cos(yaw));
            transformed = aCentre.xyz + vec3(cos(a) * 7.0, sin(uZoneTime * 0.6 + ph) * 0.8, sin(a) * 4.0) + r;
          }`,
        );
    };
    mat.customProgramCacheKey = () => 'zone-gull';
    const m = new THREE.Mesh(merged, mat);
    m.frustumCulled = false;
    m.name = 'zone:gulls';
    return m;
  }
}
