/**
 * Biome kit: the world around the ribbon. Interior shell (industrial, foundry)
 * or terrain + parallax silhouettes (canyon, snow, nightCity), plus a seeded
 * prop scatter at z ∈ [-14, -4] and sparse foreground occluders at z ∈ [+4, +8].
 */
import * as THREE from 'three';
import { Rng } from '../../core/rng';
import type { CompiledTrack } from '../../core/types';
import type { Biome } from '../biomes';
import type { MaterialLibrary } from '../materials/library';
import { fogify } from '../lighting/environment';
import { groundFloorY, profileY } from './track';
import { canvas, tex } from './canvasTex';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildHall } from './hall';
import {
  PropBatch,
  bakeAO,
  baleGeometry,
  buildingGeometry,
  coneGeometry,
  drumGeometry,
  pineGeometry,
  rockGeometry,
  triCount,
  tyreStackGeometry,
} from './props';

export interface BiomeKit {
  group: THREE.Group;
  drawCalls: number;
  triangles: number;
  textureBytes: number;
  /** Materials whose emissive flickers (fire barrels, molten metal); driven from tSim. */
  flicker: THREE.MeshStandardMaterial[];
  /** Point lights placed by the kit (≤ 2). */
  lights: THREE.PointLight[];
}

// ---------------------------------------------------------------------------
// Canvas textures
// ---------------------------------------------------------------------------

/** Silhouette strip (white shapes on transparent) for a parallax tier. */
function silhouette(kind: 'mesa' | 'pine' | 'city' | 'girder' | 'hills', rng: Rng): THREE.CanvasTexture {
  const W = 2048;
  const H = 512;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#fff';
  if (kind === 'mesa' || kind === 'hills') {
    // Wrap-safe: draw the profile and repeat the first segment at the end.
    g.beginPath();
    g.moveTo(0, H);
    let x = 0;
    let y = H * 0.7;
    const pts: [number, number][] = [];
    while (x < W) {
      const flat = kind === 'mesa' && rng.next() < 0.5;
      const w = rng.range(60, 260);
      const ny = flat ? y : H * rng.range(0.35, 0.8);
      if (flat) {
        pts.push([x + w, y]);
      } else {
        pts.push([x + w * 0.4, ny]);
        pts.push([x + w, ny + rng.range(-20, 20)]);
        y = ny;
      }
      x += w;
    }
    for (const [px, py] of pts) g.lineTo(Math.min(px, W), py);
    g.lineTo(W, H * 0.7);
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  } else if (kind === 'pine') {
    for (let x = 0; x < W; x += rng.range(14, 40)) {
      const h = rng.range(120, 300);
      const w = h * 0.35;
      g.beginPath();
      g.moveTo(x, H);
      g.lineTo(x, H - h * 0.3);
      for (let k = 0; k < 4; k++) {
        const yy = H - h * (0.3 + k * 0.18);
        g.lineTo(x - w * (0.5 - k * 0.1), yy);
        g.lineTo(x, yy - h * 0.05);
      }
      g.lineTo(x, H - h);
      for (let k = 3; k >= 0; k--) {
        const yy = H - h * (0.3 + k * 0.18);
        g.lineTo(x, yy - h * 0.05);
        g.lineTo(x + w * (0.5 - k * 0.1), yy);
      }
      g.closePath();
      g.fill();
    }
  } else if (kind === 'city') {
    for (let x = 0; x < W; ) {
      const w = rng.range(40, 140);
      const h = rng.range(120, 460);
      g.fillRect(x, H - h, w, h);
      if (rng.next() < 0.3) g.fillRect(x + w * 0.4, H - h - 40, w * 0.2, 40);
      // punch dark windows out later via emissive; here keep the silhouette solid
      x += w + rng.range(0, 12);
    }
  } else {
    // girders: horizontal beams + diagonal lattice + vertical posts
    for (let x = 0; x < W; x += 256) g.fillRect(x, 0, 18, H);
    for (const y of [H * 0.25, H * 0.55, H * 0.85]) g.fillRect(0, y, W, 14);
    g.lineWidth = 8;
    g.strokeStyle = '#fff';
    for (let x = 0; x < W; x += 128) {
      g.beginPath();
      g.moveTo(x, H * 0.25);
      g.lineTo(x + 128, H * 0.55);
      g.moveTo(x + 128, H * 0.55);
      g.lineTo(x, H * 0.85);
      g.stroke();
    }
  }
  return tex(c);
}

/** Sandstone strata: horizontal bands of warm ochre/rust with grain. */
function stratatexture(rng: Rng): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  let y = 0;
  while (y < 512) {
    const h = rng.range(10, 46);
    const t = rng.next();
    const r = Math.floor(140 + t * 60);
    const gg = Math.floor(112 + t * 50);
    const b = Math.floor(84 + t * 40);
    g.fillStyle = `rgb(${r},${gg},${b})`;
    g.fillRect(0, y, 512, h);
    g.fillStyle = 'rgba(40,20,10,0.35)';
    g.fillRect(0, y + h - 2, 512, 2);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(0,0,0,${rng.range(0.03, 0.12)})`;
      g.fillRect(rng.range(0, 512), y + rng.range(0, h), rng.range(4, 40), rng.range(1, 3));
    }
    y += h;
  }
  const t = tex(c);
  t.repeat.set(2, 1);
  return t;
}

/** Snow caps for `pineGeometry`: shallow white cones sitting on each tier. */
function pineSnowGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const r = 2.3 - i * 0.55;
    const cap = new THREE.ConeGeometry(r * 0.78, 1.15, 9);
    cap.translate(0, 2.6 + i * 1.7 + 0.95, 0);
    parts.push(cap);
  }
  const top = new THREE.ConeGeometry(0.3, 0.6, 7);
  top.translate(0, 2.6 + 2 * 1.7 + 1.5 + 0.1, 0);
  parts.push(top);
  return mergeGeometries(parts, false)!;
}

/** Two neon sign panels (top / bottom half): tube-lettered text on dark board; emissive is the glow. */
function neonSigns(rng: Rng): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const [c, g] = canvas(1024, 256);
  const [ce, ge] = canvas(1024, 256);
  g.fillStyle = '#14161c';
  g.fillRect(0, 0, 1024, 256);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, 1024, 256);
  const words = [['MOTO', '#ff40c0'], ['TRIALS', '#40e0ff'], ['GARAGE', '#ffd040'], ['24H', '#ff6040']] as const;
  for (let i = 0; i < 2; i++) {
    const [w, col] = words[rng.int(0, 3)]!;
    for (const [ctx, colour] of [[g, col], [ge, col]] as const) {
      ctx.font = 'bold 120px Impact, "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 10;
      ctx.strokeStyle = colour;
      ctx.strokeText(w, 512, 64 + i * 128);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.6;
      ctx.fillText(w, 512, 64 + i * 128);
      ctx.globalAlpha = 1;
    }
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.lineWidth = 4;
    g.strokeRect(8, 8 + i * 128, 1008, 112);
  }
  return { map: tex(c, true, false), emissive: tex(ce, true, false) };
}

/** Soft gradient quad (street-light cones). */
function shaftTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.65, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const v = g.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(0.5, 'rgba(0,0,0,0.35)');
  v.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = v;
  g.fillRect(0, 0, 256, 256);
  return tex(c, true, false);
}

/** Emissive window grid for city blocks (metre-scaled in the caller). */
function windowGrid(rng: Rng): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const [c, g] = canvas(256, 256);
  const [ce, ge] = canvas(256, 256);
  g.fillStyle = '#23252b';
  g.fillRect(0, 0, 256, 256);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, 256, 256);
  for (let y = 8; y < 256; y += 32) {
    for (let x = 6; x < 256; x += 24) {
      const lit = rng.next() < 0.22;
      g.fillStyle = lit ? '#e9c98a' : '#1a1c22';
      g.fillRect(x, y, 14, 18);
      ge.fillStyle = lit ? `rgba(255,210,140,${0.6 + rng.next() * 0.4})` : '#000';
      ge.fillRect(x, y, 14, 18);
    }
  }
  return { map: tex(c), emissive: tex(ce) };
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export function buildBiomeKit(track: CompiledTrack, biome: Biome, lib: MaterialLibrary): BiomeKit {
  const group = new THREE.Group();
  group.name = `biome:${biome.id}`;
  const rng = new Rng((track.def.seed ^ 0x5bd1e995) >>> 0);
  const flicker: THREE.MeshStandardMaterial[] = [];
  const lights: THREE.PointLight[] = [];
  let textureBytes = 0;
  const profile = track.def.profile;
  const x0 = track.bounds.minX - 40;
  const x1 = track.bounds.maxX + 60;
  const span = x1 - x0;
  const midX = (x0 + x1) / 2;
  const floorY = groundFloorY(profile, biome.interior);
  const batches: PropBatch[] = [];
  const singles: THREE.Object3D[] = [];
  const meshes: THREE.Mesh[] = [];

  const addPlane = (w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    m.receiveShadow = true;
    meshes.push(m);
    return m;
  };

  // Ground beyond the apron (all biomes): a wide strip following the profile
  // at apron depth, so the ribbon sits on terrain instead of floating.
  {
    const cols: number[] = [];
    for (let x = x0; x <= x1; x += 4) cols.push(x);
    const zRows = biome.interior ? [-30, -3.0, 3.0, 12, 30] : [-45, -12, -3.0, 3.0, 9, 45];
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < cols.length; i++) {
      const x = cols[i]!;
      for (let r = 0; r < zRows.length; r++) {
        const z = zRows[r]!;
        let y: number;
        if (biome.interior) y = floorY;
        else {
          const base = profileY(profile, x) - 0.42;
          const far = Math.min(1, (Math.abs(z) - 3) / 30);
          y = base - far * far * 2.5 + (Math.abs(z) > 3 ? Math.sin(x * 0.13 + z * 0.3) * 0.35 * far : 0);
        }
        pos.push(x, y, z);
        uv.push(x / 4, z / 4);
        if (i > 0 && r > 0) {
          const c = i * zRows.length + r;
          const p = (i - 1) * zRows.length + r;
          idx.push(p - 1, p, c - 1, c - 1, p, c);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const matName = biome.interior ? 'concrete' : biome.groundSurface === 'snow' ? 'snow' : biome.groundSurface === 'dirt' ? 'dirt' : 'concrete';
    const m = new THREE.Mesh(g, fogify(lib.get(matName)));
    m.receiveShadow = true;
    m.name = 'terrain';
    meshes.push(m);
  }

  if (biome.interior) {
    const hall = buildHall(track, biome, lib, rng, floorY, x0, x1);
    meshes.push(...hall.meshes);
    singles.push(...hall.singles);
    batches.push(...hall.batches);
    flicker.push(...hall.flicker);
    lights.push(...hall.lights);
    textureBytes += hall.textureBytes;
  } else {
    // Exterior: three parallax silhouette tiers + biome props.
    const tiers: { z: number; h: number; kind: 'mesa' | 'pine' | 'city' | 'girder' | 'hills'; color: number; yOff: number }[] =
      biome.id === 'canyon'
        ? [
            { z: -45, h: 26, kind: 'mesa', color: 0x5a3a2c, yOff: -3 },
            { z: -130, h: 60, kind: 'mesa', color: 0x7a4c3a, yOff: -6 },
            { z: -340, h: 140, kind: 'mesa', color: 0x9a6a54, yOff: -12 },
          ]
        : biome.id === 'snow'
          ? [
              { z: -40, h: 18, kind: 'pine', color: 0x2c3a34, yOff: -2 },
              { z: -110, h: 45, kind: 'pine', color: 0x50606a, yOff: -4 },
              { z: -300, h: 130, kind: 'hills', color: 0x9aa8bc, yOff: -10 },
            ]
          : [
              { z: -45, h: 30, kind: 'city', color: 0x14161c, yOff: -3 },
              { z: -130, h: 80, kind: 'city', color: 0x1e222c, yOff: -5 },
              { z: -340, h: 200, kind: 'city', color: 0x2a3040, yOff: -10 },
            ];
    const grid = biome.id === 'nightCity' ? windowGrid(rng) : null;
    for (const t of tiers) {
      const st = silhouette(t.kind, rng);
      textureBytes += 2048 * 512 * 4 * 1.33;
      const w = span * 3 + Math.abs(t.z) * 2;
      st.repeat.set(w / (t.h * 4), 1);
      const mat = new THREE.MeshStandardMaterial({ map: st, alphaTest: 0.5, color: t.color, roughness: 1, side: THREE.DoubleSide });
      if (grid && t.z > -200) {
        mat.emissiveMap = grid.emissive;
        mat.emissive = new THREE.Color(0xffc080);
        mat.emissiveIntensity = 1.2;
        grid.emissive.repeat.set(w / 6, t.h / 6);
      }
      fogify(mat);
      const m = addPlane(w, t.h, mat, midX, floorY + t.h / 2 + t.yOff, t.z);
      m.receiveShadow = false;
    }
    // Props along the course.
    const gyAt = (x: number, z: number): number => profileY(profile, x) - 0.42 - Math.min(1, (Math.abs(z) - 3) / 30) ** 2 * 2.5;
    if (biome.id === 'canyon') {
      // Sandstone strata: stepped slab walls at two depths (z −9 and −20) with a
      // banded albedo, dry scrub on the flats, rocks, bales, drums; warm low sun.
      const strata = stratatexture(rng);
      textureBytes += 512 * 512 * 4 * 1.33;
      const strataMat = fogify(new THREE.MeshStandardMaterial({ map: strata, roughness: 0.95, color: 0xe8dccc }));
      const slabs = new PropBatch('strata', bakeAO(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 1, 0.25), strataMat);
      for (let x = x0; x < x1; x += rng.range(6, 11)) {
        const h = rng.range(2.0, 4.5);
        const w = rng.range(7, 13);
        if (rng.next() < 0.3) continue; // gaps show the mesas behind
        slabs.add(x, gyAt(x, -12) - 0.5, -12 + rng.range(-1.5, 1.5), rng.range(-0.15, 0.15), w, null, 0, h, rng.range(3, 5));
        if (rng.next() < 0.5) slabs.add(x + rng.range(-2, 2), gyAt(x, -12) - 0.5 + h * 0.6, -13.5 + rng.range(-1, 1), rng.range(-0.15, 0.15), w * 0.7, null, 0, h * 0.7, 3);
      }
      for (let x = x0; x < x1; x += rng.range(8, 14)) {
        if (rng.next() < 0.35) continue;
        const h = rng.range(6, 14);
        slabs.add(x, gyAt(x, -24) - 2, -25 + rng.range(-2, 2), rng.range(-0.2, 0.2), rng.range(10, 18), null, 0, h, rng.range(4, 7));
      }
      // Foreground: a low slab or two sliding past.
      for (let x = x0 + 20; x < x1; x += rng.range(28, 44)) slabs.add(x, gyAt(x, 6) - 2.5, rng.range(5.5, 7.5), rng.range(-0.2, 0.2), rng.range(3, 5), null, 0, rng.range(2.5, 4), 2.5);
      const rocks = new PropBatch('rock', bakeAO(rockGeometry(track.def.seed), 1.4, 0.3), lib.get('rock'));
      const scrub = new PropBatch('scrub', new THREE.IcosahedronGeometry(0.45, 1).scale(1.3, 0.7, 1.2).translate(0, 0.3, 0), fogify(new THREE.MeshStandardMaterial({ color: 0x6b6a3a, roughness: 1 })));
      const bales = new PropBatch('bale', baleGeometry(), lib.get('pallet'));
      const tyres = new PropBatch('tyres', tyreStackGeometry(), lib.get('tyre'));
      const drums = new PropBatch('drum', drumGeometry(), lib.get('barrelRed'));
      for (let x = x0 + 6; x < x1; x += rng.range(3, 7)) {
        const z = rng.range(-8, -4.5);
        const gy = gyAt(x, z);
        const r = rng.next();
        if (r < 0.35) rocks.add(x, gy + rng.range(-0.2, 0.1), z, rng.range(0, 6), rng.range(0.5, 1.6), null, rng.range(-0.2, 0.2));
        else if (r < 0.75) scrub.add(x, gy - 0.05, z, rng.range(0, 6), rng.range(0.6, 1.4), rng.next() < 0.5 ? 0x8a7a48 : null);
        else if (r < 0.85) bales.add(x, gy, z, rng.range(-0.3, 0.3));
        else if (r < 0.93) tyres.add(x, gy, z, 0);
        else drums.add(x, gy, z, 0, 1, 0xd8d2c4);
        if (rng.next() < 0.3) scrub.add(x + 1.5, gyAt(x + 1.5, 5) - 0.1, rng.range(4.5, 7), rng.range(0, 6), rng.range(0.8, 1.6));
      }
      batches.push(slabs, rocks, scrub, bales, tyres, drums);
    } else if (biome.id === 'snow') {
      // Snow-laden pines (dark green body + white caps), drifted crates, warm lamp posts, low fence.
      const pineMat = fogify(new THREE.MeshStandardMaterial({ color: 0x24402f, roughness: 0.95 }));
      const pines = new PropBatch('pine', bakeAO(pineGeometry(), 8, 0.35), pineMat);
      const capMat = fogify(new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.85 }));
      const caps = new PropBatch('pinecap', pineSnowGeometry(), capMat, false);
      const crates = new PropBatch('crate', bakeAO(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 1, 0.3), lib.get('plywood'));
      const crateSnow = new PropBatch('cratesnow', new THREE.BoxGeometry(1.04, 0.12, 1.04).translate(0, 1.04, 0), capMat, false);
      const posts = new PropBatch('post', new THREE.CylinderGeometry(0.06, 0.08, 1, 8).translate(0, 0.5, 0), lib.get('darkSteel'));
      const lampMat = fogify(new THREE.MeshStandardMaterial({ color: 0x221a10, emissive: 0xffb648, emissiveIntensity: 5, roughness: 0.4 }));
      const lampHeads = new PropBatch('lamphead', new THREE.SphereGeometry(0.18, 10, 8), lampMat, false);
      const fence = new PropBatch('fence', new THREE.BoxGeometry(2.4, 0.06, 0.04).translate(0, 0.9, 0), lib.get('plywood'));
      for (let x = x0 + 4; x < x1; x += rng.range(3, 7)) {
        const z = rng.range(-16, -4.5);
        const gy = gyAt(x, z);
        const r = rng.next();
        if (r < 0.6) {
          const sc = rng.range(0.7, 1.5);
          const ry = rng.range(0, 6);
          pines.add(x, gy - 0.3, z, ry, sc);
          caps.add(x, gy - 0.3, z, ry, sc);
        } else if (r < 0.75) {
          const sc = rng.range(0.8, 1.3);
          const ry = rng.range(-0.3, 0.3);
          crates.add(x, gy, z, ry, sc);
          crateSnow.add(x, gy, z, ry, sc);
        } else if (r < 0.85) {
          posts.add(x, gy, z, 0, 1, null, 0, 3.4, 1);
          lampHeads.add(x, gy + 3.5, z);
        } else {
          fence.add(x, gy, -4.2, 0);
          posts.add(x - 1.2, gy, -4.2, 0, 1, null, 0, 1.0, 1);
        }
        if (rng.next() < 0.2) {
          const sc = rng.range(0.9, 1.4);
          const ry = rng.range(0, 6);
          pines.add(x + 2, gyAt(x + 2, 7) - 1.0, rng.range(6, 8.5), ry, sc);
          caps.add(x + 2, gyAt(x + 2, 7) - 1.0, rng.range(6, 8.5), ry, sc);
        }
      }
      batches.push(pines, caps, crates, crateSnow, posts, lampHeads, fence);
    } else {
      // nightCity: buildings set back with metre-scaled windows, neon signs on
      // posts, street lights with real cones, wet asphalt (deck.ts), fire barrels.
      const g2 = windowGrid(rng);
      const bMat = fogify(new THREE.MeshStandardMaterial({ map: g2.map, emissiveMap: g2.emissive, emissive: 0xffc080, emissiveIntensity: 1.1, roughness: 0.8 }));
      g2.map.repeat.set(2.2, 4.5);
      g2.emissive.repeat.set(2.2, 4.5);
      const buildings = new PropBatch('building', bakeAO(buildingGeometry(), 1, 0.3), bMat);
      const cones = new PropBatch('cone', coneGeometry(), fogify(new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 })));
      const fireMat = fogify(new THREE.MeshStandardMaterial({ color: 0x1a0a04, emissive: 0xff7a1a, emissiveIntensity: 4, roughness: 0.6 }));
      flicker.push(fireMat);
      const fires = new PropBatch('firebarrel', drumGeometry(), fireMat, false);
      const drums = new PropBatch('drum', drumGeometry(), lib.get('darkSteel'));
      const poles = new PropBatch('pole', new THREE.CylinderGeometry(0.07, 0.1, 1, 8).translate(0, 0.5, 0), lib.get('darkSteel'));
      const arms = new PropBatch('lamparm', new THREE.BoxGeometry(0.1, 0.08, 1.6).translate(0, 0, 0.8), lib.get('darkSteel'), false);
      const streetMat = fogify(new THREE.MeshStandardMaterial({ color: 0x202020, emissive: 0xffe2b0, emissiveIntensity: 6, roughness: 0.5 }));
      const heads = new PropBatch('lamphead', new THREE.BoxGeometry(0.5, 0.14, 0.3), streetMat, false);
      const coneTex = shaftTexture();
      textureBytes += 256 * 256 * 4;
      const coneMat = new THREE.MeshBasicMaterial({ map: coneTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(0xffe2b0).multiplyScalar(0.09), side: THREE.DoubleSide, fog: false });
      const neon = neonSigns(rng);
      textureBytes += 1024 * 256 * 4 * 1.33 * 2;
      const neonMat = fogify(new THREE.MeshStandardMaterial({ map: neon.map, emissiveMap: neon.emissive, emissive: 0xffffff, emissiveIntensity: 2.2, roughness: 0.6, transparent: true, alphaTest: 0.2 }));
      for (let x = x0 + 6; x < x1; x += rng.range(7, 12)) {
        const z = rng.range(-38, -22);
        const gy = gyAt(x, z);
        if (rng.next() < 0.8) buildings.add(x, gy - 1, z, 0, rng.range(7, 12), null, 0, rng.range(8, 22), rng.range(7, 11));
        if (rng.next() < 0.5) buildings.add(x + rng.range(-4, 4), gy - 1, z - 16, 0, rng.range(10, 16), null, 0, rng.range(20, 44), rng.range(8, 12));
        if (rng.next() < 0.5) cones.add(x + rng.range(-3, 3), profileY(profile, x) - 0.42, rng.range(-5, -4), rng.range(0, 6));
        if (rng.next() < 0.4) fires.add(x + 2, profileY(profile, x + 2) - 0.42, rng.range(-6, -4.5));
        else drums.add(x + 2, profileY(profile, x + 2) - 0.42, rng.range(-6, -4.5), rng.range(0, 6));
      }
      // Street lights every ~14 m behind the track, cone of light down to the ground.
      for (let x = x0 + 10; x < x1; x += rng.range(12, 17)) {
        const z = -5.2;
        const gy = profileY(profile, x) - 0.42;
        poles.add(x, gy, z, 0, 1, null, 0, 6.5, 1);
        arms.add(x, gy + 6.4, z, 0);
        heads.add(x, gy + 6.4, z + 1.6);
        const c = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 6.6), coneMat);
        c.position.set(x, gy + 3.2, z + 1.6);
        c.rotation.y = 0.35;
        c.renderOrder = 5;
        singles.push(c);
      }
      // Neon signs: alternating the two panels of the sheet, hung on posts at z −7..−11.
      for (let x = x0 + 14, i = 0; x < x1; x += rng.range(18, 30), i++) {
        const z = rng.range(-11, -7);
        const gy = gyAt(x, z);
        const w = 4.5;
        // Pick the top / bottom panel through the geometry UVs (one shared texture, no clones).
        const half = i % 2;
        const sg = new THREE.PlaneGeometry(w, w / 4);
        const uv = sg.getAttribute('uv') as THREE.BufferAttribute;
        for (let k = 0; k < uv.count; k++) uv.setY(k, half * 0.5 + uv.getY(k) * 0.5);
        const sign = new THREE.Mesh(sg, neonMat);
        sign.position.set(x, gy + 4.2, z);
        sign.rotation.y = rng.range(-0.2, 0.2);
        singles.push(sign);
        poles.add(x - w / 2 + 0.2, gy, z, 0, 1, null, 0, 4.9, 1);
        poles.add(x + w / 2 - 0.2, gy, z, 0, 1, null, 0, 4.9, 1);
        const pl = new THREE.PointLight(half ? 0xff40c0 : 0x40e0ff, 25, 16, 2);
        pl.position.set(x, gy + 3.6, z + 1.5);
        if (lights.length < 2) lights.push(pl);
      }
      batches.push(buildings, cones, fires, drums, poles, arms, heads);
    }
  }

  let drawCalls = 0;
  let triangles = 0;
  for (const m of meshes) {
    group.add(m);
    drawCalls++;
    triangles += triCount(m.geometry);
  }
  for (const s of singles) {
    group.add(s);
    drawCalls++;
    triangles += 2;
  }
  for (const b of batches) {
    const im = b.build();
    if (!im) continue;
    group.add(im);
    drawCalls++;
    triangles += triCount(b.geometry) * b.count;
  }
  for (const l of lights) group.add(l);
  return { group, drawCalls, triangles, textureBytes, flicker, lights };
}
