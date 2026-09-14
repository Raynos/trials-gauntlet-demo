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
import { profileY } from './track';
import {
  PropBatch,
  baleGeometry,
  buildingGeometry,
  columnGeometry,
  coneGeometry,
  containerGeometry,
  drumGeometry,
  lampBulbGeometry,
  lampGeometry,
  palletGeometry,
  pineGeometry,
  pipeGeometry,
  rackGeometry,
  rockGeometry,
  triCount,
  trussGeometry,
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

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, srgb = true, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** One 12 m × 14 m warehouse wall bay: brick, steel column, big window bank. Returns albedo + emissive. */
function warehouseWall(rng: Rng, paneColor: string, brick: string): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture; bytes: number } {
  const W = 1024;
  const H = 1024 * (14 / 12);
  const [c, g] = canvas(W, Math.round(H));
  const [ce, ge] = canvas(W, Math.round(H));
  const px = W / 12; // pixels per metre
  // Brick field.
  g.fillStyle = brick;
  g.fillRect(0, 0, W, H);
  const bh = 0.075 * px;
  const bw = 0.23 * px;
  for (let y = 0; y < H; y += bh) {
    const row = Math.floor(y / bh);
    for (let x = -(row % 2) * bw * 0.5; x < W; x += bw) {
      const l = 0.75 + rng.next() * 0.35;
      g.fillStyle = `rgba(${Math.floor(20 * l)},${Math.floor(12 * l)},${Math.floor(8 * l)},${0.25 + rng.next() * 0.25})`;
      g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
    }
  }
  // Grime gradient at the bottom, soot at the top.
  const grad = g.createLinearGradient(0, H, 0, H * 0.6);
  grad.addColorStop(0, 'rgba(10,8,6,0.55)');
  grad.addColorStop(1, 'rgba(10,8,6,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // Emissive canvas starts black.
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H);
  // Window bank: 8 m wide × 4.6 m tall, sill at 6.6 m from the floor (canvas y down).
  for (const bx of [1.2, 6.8]) {
    const wx = bx * px;
    const ww = 4.0 * px;
    const wTop = H - 9.6 * px;
    const wh = 3.4 * px;
    g.fillStyle = '#1e1c1a';
    g.fillRect(wx - 10, wTop - 10, ww + 20, wh + 20);
    const cols = 5;
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const x = wx + (k * ww) / cols;
        const y = wTop + (r * wh) / rows;
        const pw = ww / cols;
        const ph = wh / rows;
        const broken = rng.next() < 0.06;
        const dirt = 0.55 + rng.next() * 0.45;
        g.fillStyle = broken ? '#141210' : paneColor;
        g.globalAlpha = broken ? 1 : dirt;
        g.fillRect(x + 5, y + 5, pw - 10, ph - 10);
        g.globalAlpha = 1;
        ge.fillStyle = broken ? '#000' : `rgba(255,255,255,${dirt})`;
        ge.fillRect(x + 5, y + 5, pw - 10, ph - 10);
      }
    }
  }
  // Steel column at the bay edge + a horizontal girt.
  g.fillStyle = '#26282c';
  g.fillRect(0, 0, 0.35 * px, H);
  g.fillRect(0, H - 6.2 * px, W, 0.2 * px);
  // Stencil sign on some bays.
  if (rng.next() < 0.6) {
    g.fillStyle = 'rgba(230,220,200,0.55)';
    g.font = `bold ${Math.floor(0.9 * px)}px Impact, "Arial Black", sans-serif`;
    g.fillText(rng.next() < 0.5 ? 'TRIALS' : 'BAY ' + rng.int(1, 9), 3 * px, H - 3.2 * px);
  }
  return { map: tex(c), emissive: tex(ce, true), bytes: W * H * 4 * 1.33 * 2 };
}

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

/** Emissive window grid for city blocks (metre-scaled in the caller). */
function windowGrid(rng: Rng): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const [c, g] = canvas(256, 256);
  const [ce, ge] = canvas(256, 256);
  g.fillStyle = '#2b2d33';
  g.fillRect(0, 0, 256, 256);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, 256, 256);
  for (let y = 8; y < 256; y += 32) {
    for (let x = 6; x < 256; x += 24) {
      const lit = rng.next() < 0.45;
      g.fillStyle = lit ? '#e9c98a' : '#15171c';
      g.fillRect(x, y, 14, 18);
      ge.fillStyle = lit ? `rgba(255,210,140,${0.6 + rng.next() * 0.4})` : '#000';
      ge.fillRect(x, y, 14, 18);
    }
  }
  return { map: tex(c), emissive: tex(ce) };
}

/** Soft radial gradient used for light shafts / glow quads. */
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
  let floorY = Infinity;
  for (const p of profile) floorY = Math.min(floorY, p.y);
  floorY -= 0.42;
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
    const zRows = biome.interior ? [-18, -3.0, 3.0, 12, 45] : [-45, -12, -3.0, 3.0, 9, 45];
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

  if (biome.id === 'industrial' || biome.id === 'foundry') {
    const foundry = biome.id === 'foundry';
    const roofY = floorY + 14;
    // Back wall with window bays, repeated along x.
    const wall = warehouseWall(rng, foundry ? '#ff9a4a' : '#fff3dc', foundry ? '#3a1a12' : '#4a2c22');
    textureBytes += wall.bytes;
    const bays = Math.ceil(span / 12);
    wall.map.repeat.set(bays, 1);
    wall.emissive.repeat.set(bays, 1);
    const wallMat = fogify(
      new THREE.MeshStandardMaterial({
        map: wall.map,
        emissiveMap: wall.emissive,
        emissive: new THREE.Color(foundry ? 0xff7a30 : 0xfff2dc),
        emissiveIntensity: foundry ? 1.6 : 1.8,
        roughness: 0.95,
      }),
    );
    addPlane(bays * 12, 14, wallMat, x0 + (bays * 12) / 2, floorY + 7, -17);
    // Side walls far left/right (so the start and finish aren't open air).
    const sideMat = fogify(new THREE.MeshStandardMaterial({ map: wall.map, roughness: 0.95, color: 0x6a6a6a }));
    addPlane(30, 14, sideMat, x0 + 2, floorY + 7, -2, 0, Math.PI / 2);
    addPlane(30, 14, sideMat, x1 - 2, floorY + 7, -2, 0, -Math.PI / 2);
    // Roof plane with skylight strips (emissive) seen when the camera pulls back.
    const [rc, rg] = canvas(512, 256);
    rg.fillStyle = '#2b2a28';
    rg.fillRect(0, 0, 512, 256);
    for (let x = 40; x < 512; x += 128) {
      rg.fillStyle = foundry ? '#7a2a10' : '#ffe9c4';
      rg.fillRect(x, 20, 48, 216);
    }
    const roofTex = tex(rc);
    roofTex.repeat.set(span / 12, 2);
    textureBytes += 512 * 256 * 4 * 1.33;
    const roofMat = fogify(new THREE.MeshStandardMaterial({ map: roofTex, emissiveMap: roofTex, emissive: 0xffffff, emissiveIntensity: foundry ? 0.6 : 1.1, roughness: 0.9, side: THREE.DoubleSide }));
    addPlane(span, 28, roofMat, midX, roofY, -4, Math.PI / 2);
    // Trusses under the roof every 12 m, columns at the wall and mid-hall.
    const truss = new PropBatch('truss', trussGeometry(), lib.get('darkSteel'), false);
    const column = new PropBatch('column', columnGeometry(), lib.get('darkSteel'));
    for (let x = x0 + 6; x < x1; x += 12) {
      truss.add(x, roofY - 1.3, -10, Math.PI / 2, 1, null, 0, 1, 1.9);
      column.add(x, floorY, -16.5, 0, 1, null, 0, roofY - floorY, 1);
      if ((Math.round((x - x0) / 12) & 1) === 0) column.add(x, floorY, -5.5, 0, 1, null, 0, roofY - floorY, 1);
    }
    batches.push(truss, column);
    // Hanging sodium lamps every 9 m.
    const lampShade = new PropBatch('lamp', lampGeometry(), lib.get('darkSteel'), false);
    const bulbMat = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: foundry ? 0xff6a2a : 0xffc46a, emissiveIntensity: 6, roughness: 0.4 }));
    const bulb = new PropBatch('bulb', lampBulbGeometry(), bulbMat, false);
    for (let x = x0 + 8; x < x1; x += 9) {
      const z = -8 + rng.range(-1, 1);
      lampShade.add(x, roofY - 2.4, z, 0, 1, null, 0, 2.2, 1);
      bulb.add(x, roofY - 2.4, z, 0, 1, null, 0, 2.2, 1);
    }
    batches.push(lampShade, bulb);
    // Mid-ground clutter: containers (some stacked), racks, pallets, drums, tyres, spools.
    const containers = new PropBatch('container', containerGeometry(), lib.get('container'));
    const racks = new PropBatch('rack', rackGeometry(), lib.get('rustSteel'));
    const pallets = new PropBatch('pallet', palletGeometry(), lib.get('pallet'));
    const drums = new PropBatch('drum', drumGeometry(), lib.get('barrelRed'));
    const tyres = new PropBatch('tyres', tyreStackGeometry(), lib.get('tyre'));
    const palette = [0x2f6f5e, 0x8a2c22, 0x2a4f7a, 0x6b6b60, 0xa9682a, 0x3d6b3a];
    for (let x = x0 + 10; x < x1 - 10; x += rng.range(7, 13)) {
      const gy = floorY;
      const r = rng.next();
      if (r < 0.42) {
        const z = rng.range(-14, -7);
        const ry = rng.range(-0.15, 0.15) + (rng.next() < 0.25 ? Math.PI / 2 : 0);
        containers.add(x, gy, z, ry, 1, palette[rng.int(0, palette.length - 1)]!);
        if (rng.next() < 0.45) containers.add(x + rng.range(-0.4, 0.4), gy + 2.59, z + rng.range(-0.2, 0.2), ry + rng.range(-0.05, 0.05), 1, palette[rng.int(0, palette.length - 1)]!);
      } else if (r < 0.62) {
        racks.add(x, gy, rng.range(-15, -12), 0, 1);
        racks.add(x + 2.75, gy, rng.range(-15, -12), 0, 1);
      } else if (r < 0.8) {
        const z = rng.range(-9, -5);
        const n = rng.int(2, 5);
        for (let k = 0; k < n; k++) pallets.add(x + rng.range(-0.3, 0.3), gy + k * 0.144, z + rng.range(-0.1, 0.1), rng.range(-0.1, 0.1));
      } else if (r < 0.92) {
        const z = rng.range(-8, -5);
        const n = rng.int(2, 4);
        for (let k = 0; k < n; k++) drums.add(x + k * 0.62, gy, z + rng.range(-0.3, 0.3), rng.range(0, 6), 1, k % 3 === 1 ? 0xd8d2c4 : k % 3 === 2 ? 0x244d8a : 0xa42a1e);
      } else {
        tyres.add(x, gy, rng.range(-7, -4.5), rng.range(0, 6));
      }
    }
    // Foreground: rare low props so the bike is never hidden.
    for (let x = x0 + 25; x < x1 - 20; x += rng.range(28, 45)) {
      const r = rng.next();
      if (r < 0.5) drums.add(x, floorY, rng.range(5, 6.5), rng.range(0, 6), 1, 0xa42a1e);
      else if (r < 0.8) tyres.add(x, floorY, rng.range(5, 6.5), 0);
      else pallets.add(x, floorY, rng.range(5, 6.5), rng.range(-0.2, 0.2));
    }
    batches.push(containers, racks, pallets, drums, tyres);
    // Volumetric shafts from the windows: additive tilted quads.
    const shaft = shaftTexture();
    textureBytes += 256 * 256 * 4;
    const shaftMat = new THREE.MeshBasicMaterial({
      map: shaft,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: new THREE.Color(foundry ? 0xff5a1a : 0xffd9a0).multiplyScalar(foundry ? 0.16 : 0.17),
      side: THREE.DoubleSide,
      fog: false,
    });
    for (let x = x0 + 6; x < x1; x += 24) {
      for (const dz of [0, 5]) {
        const q = new THREE.Mesh(new THREE.PlaneGeometry(6, 16), shaftMat);
        q.position.set(x + 5 + dz * 0.4, floorY + 6.5, -13 + dz);
        q.rotation.set(0, 0.15, 0.55 + dz * 0.03);
        q.renderOrder = 5;
        q.frustumCulled = true;
        singles.push(q);
      }
    }
    if (foundry) {
      // Molten pillars + pipe runs + glow.
      const molten = fogify(new THREE.MeshStandardMaterial({ color: 0x1a0402, emissive: 0xff5a10, emissiveIntensity: 2.5, roughness: 0.6 }));
      flicker.push(molten);
      const pillars = new PropBatch('molten', new THREE.CylinderGeometry(0.7, 0.9, 1, 14).translate(0, 0.5, 0), molten, false);
      const pipes = new PropBatch('pipe', pipeGeometry(), lib.get('rustSteel'));
      for (let x = x0 + 14; x < x1; x += rng.range(16, 26)) {
        pillars.add(x, floorY, rng.range(-13, -8), 0, 1, null, 0, rng.range(6, 11), 1);
        pipes.add(x + 4, floorY + rng.range(3, 7), rng.range(-12, -6), rng.range(-0.2, 0.2));
      }
      batches.push(pillars, pipes);
      const pl = new THREE.PointLight(0xff5a10, 60, 30, 2);
      pl.position.set(midX, floorY + 4, -8);
      lights.push(pl);
    }
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
    if (biome.id === 'canyon') {
      const rocks = new PropBatch('rock', rockGeometry(track.def.seed), lib.get('rock'));
      const bales = new PropBatch('bale', baleGeometry(), lib.get('pallet'));
      const tyres = new PropBatch('tyres', tyreStackGeometry(), lib.get('tyre'));
      const drums = new PropBatch('drum', drumGeometry(), lib.get('barrelRed'));
      for (let x = x0 + 6; x < x1; x += rng.range(5, 11)) {
        const z = rng.range(-14, -4.5);
        const gy = profileY(profile, x) - 0.42 - Math.min(1, (Math.abs(z) - 3) / 30) ** 2 * 2.5;
        const r = rng.next();
        if (r < 0.6) rocks.add(x, gy + rng.range(-0.3, 0.2), z, rng.range(0, 6), rng.range(0.8, 3.2), null, rng.range(-0.2, 0.2));
        else if (r < 0.75) bales.add(x, gy, z, rng.range(-0.3, 0.3));
        else if (r < 0.9) tyres.add(x, gy, z, 0);
        else drums.add(x, gy, z, 0, 1, 0xd8d2c4);
        if (rng.next() < 0.12) rocks.add(x + 3, profileY(profile, x + 3) - 0.6, rng.range(5.5, 8), rng.range(0, 6), rng.range(1.5, 2.5));
      }
      batches.push(rocks, bales, tyres, drums);
    } else if (biome.id === 'snow') {
      const pines = new PropBatch('pine', pineGeometry(), fogify(new THREE.MeshStandardMaterial({ color: 0x1f3a2e, roughness: 0.9 })));
      const crates = new PropBatch('crate', new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), lib.get('plywood'));
      const posts = new PropBatch('post', new THREE.CylinderGeometry(0.06, 0.08, 1, 8).translate(0, 0.5, 0), lib.get('darkSteel'));
      const lampMat = fogify(new THREE.MeshStandardMaterial({ color: 0x221a10, emissive: 0xffb648, emissiveIntensity: 4, roughness: 0.4 }));
      const lampHeads = new PropBatch('lamphead', new THREE.SphereGeometry(0.18, 10, 8), lampMat, false);
      for (let x = x0 + 4; x < x1; x += rng.range(4, 9)) {
        const z = rng.range(-14, -4.5);
        const gy = profileY(profile, x) - 0.42 - Math.min(1, (Math.abs(z) - 3) / 30) ** 2 * 2.5;
        const r = rng.next();
        if (r < 0.65) pines.add(x, gy - 0.3, z, rng.range(0, 6), rng.range(0.7, 1.4));
        else if (r < 0.8) crates.add(x, gy, z, rng.range(-0.3, 0.3), rng.range(0.8, 1.3));
        else {
          posts.add(x, gy, z, 0, 1, null, 0, 3.2, 1);
          lampHeads.add(x, gy + 3.3, z);
        }
        if (rng.next() < 0.15) pines.add(x + 2, profileY(profile, x + 2) - 1.2, rng.range(6, 8.5), rng.range(0, 6), rng.range(0.9, 1.3));
      }
      batches.push(pines, crates, posts, lampHeads);
    } else {
      // nightCity
      const g2 = windowGrid(rng);
      const bMat = fogify(new THREE.MeshStandardMaterial({ map: g2.map, emissiveMap: g2.emissive, emissive: 0xffc080, emissiveIntensity: 1.6, roughness: 0.8 }));
      g2.map.repeat.set(5, 10);
      g2.emissive.repeat.set(5, 10);
      const buildings = new PropBatch('building', buildingGeometry(), bMat);
      const cones = new PropBatch('cone', coneGeometry(), fogify(new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 })));
      const fireMat = fogify(new THREE.MeshStandardMaterial({ color: 0x1a0a04, emissive: 0xff7a1a, emissiveIntensity: 4, roughness: 0.6 }));
      flicker.push(fireMat);
      const fires = new PropBatch('firebarrel', drumGeometry(), fireMat, false);
      const drums = new PropBatch('drum', drumGeometry(), lib.get('darkSteel'));
      for (let x = x0 + 6; x < x1; x += rng.range(9, 16)) {
        const z = rng.range(-34, -18);
        const gy = profileY(profile, x) - 0.42 - Math.min(1, (Math.abs(z) - 3) / 30) ** 2 * 2.5;
        buildings.add(x, gy - 1, z, 0, rng.range(6, 12), null, 0, rng.range(8, 24), rng.range(6, 10));
        if (rng.next() < 0.5) cones.add(x + rng.range(-3, 3), profileY(profile, x) - 0.42, rng.range(-5, -4), rng.range(0, 6));
        if (rng.next() < 0.4) fires.add(x + 2, profileY(profile, x + 2) - 0.42, rng.range(-6, -4.5));
        else drums.add(x + 2, profileY(profile, x + 2) - 0.42, rng.range(-6, -4.5), rng.range(0, 6));
      }
      batches.push(buildings, cones, fires, drums);
      const pl = new THREE.PointLight(0xff7a1a, 40, 22, 2);
      pl.position.set(track.def.start.pos.x + 6, profileY(profile, track.def.start.pos.x) + 1.5, -5);
      lights.push(pl);
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
