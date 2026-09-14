/**
 * The industrial hall (industrial + foundry biomes): a big volume, not a
 * wallpaper. The deck rides ≈3 m above the concrete (see `groundFloorY`), the
 * back wall sits 30 m behind the track with multi-storey window banks at
 * eye level, the roof is 16 m up with trusses, purlins and skylight strips, a
 * gantry crane runs the length of the hall, high-bay lamps hang on long
 * chains, and the container clutter is broken into three staggered rows at
 * different depths with gaps that show more hall behind. Cheap AO is baked
 * into the kit's vertex colours; aerial perspective comes from the biome fog
 * (12 / 45 / 95 m) so each row sits at a visibly different depth.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rng } from '../../core/rng';
import type { CompiledTrack } from '../../core/types';
import type { Biome } from '../biomes';
import type { MaterialLibrary } from '../materials/library';
import { fogify } from '../lighting/environment';
import { canvas, tex } from './canvasTex';
import { profileY } from './track';
import {
  PropBatch,
  bakeAO,
  beamGeometry,
  chainGeometry,
  columnGeometry,
  coneGeometry,
  containerGeometry,
  drumGeometry,
  hookBlockGeometry,
  lampBulbGeometry,
  lampGeometry,
  palletGeometry,
  pipeGeometry,
  rackGeometry,
  trussGeometry,
  tyreStackGeometry,
} from './props';

export interface HallOut {
  meshes: THREE.Mesh[];
  singles: THREE.Object3D[];
  batches: PropBatch[];
  flicker: THREE.MeshStandardMaterial[];
  lights: THREE.PointLight[];
  textureBytes: number;
}

export const HALL = { wallZ: -30, frontZ: 30, height: 16 };

/** One 12 m × 16 m warehouse wall bay: brick, steel column, a 7 m tall window bank + clerestory. Returns albedo + emissive. */
function warehouseWall(rng: Rng, paneColor: string, brick: string): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture; bytes: number } {
  const W = 1024;
  const H = Math.round(1024 * (HALL.height / 12));
  const [c, g] = canvas(W, H);
  const [ce, ge] = canvas(W, H);
  const px = W / 12; // pixels per metre
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
  // Grime at the floor (AO band), soot under the roof.
  let grad = g.createLinearGradient(0, H, 0, H - 3.5 * px);
  grad.addColorStop(0, 'rgba(8,6,5,0.7)');
  grad.addColorStop(1, 'rgba(8,6,5,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  grad = g.createLinearGradient(0, 0, 0, 1.5 * px);
  grad.addColorStop(0, 'rgba(8,6,5,0.6)');
  grad.addColorStop(1, 'rgba(8,6,5,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H);
  const bank = (x0: number, y0: number, w: number, h: number, cols: number, rows: number): void => {
    const wx = x0 * px;
    const ww = w * px;
    const wTop = H - (y0 + h) * px;
    const wh = h * px;
    g.fillStyle = '#1a1917';
    g.fillRect(wx - 12, wTop - 12, ww + 24, wh + 24);
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const x = wx + (k * ww) / cols;
        const y = wTop + (r * wh) / rows;
        const pw = ww / cols;
        const ph = wh / rows;
        const broken = rng.next() < 0.05;
        const dirt = 0.4 + rng.next() * 0.45;
        g.fillStyle = broken ? '#141210' : paneColor;
        g.globalAlpha = broken ? 1 : dirt;
        g.fillRect(x + 6, y + 6, pw - 12, ph - 12);
        g.globalAlpha = 1;
        g.fillStyle = '#1a1917';
        g.fillRect(x + pw / 2 - 2, y + 6, 4, ph - 12);
        g.fillRect(x + 6, y + ph / 2 - 2, pw - 12, 4);
        const gr = g.createLinearGradient(0, y + ph - 12, 0, y + ph * 0.55);
        gr.addColorStop(0, 'rgba(40,32,24,0.65)');
        gr.addColorStop(1, 'rgba(40,32,24,0)');
        g.fillStyle = gr;
        g.fillRect(x + 6, y + 6, pw - 12, ph - 12);
        ge.fillStyle = broken ? '#000' : `rgba(255,255,255,${dirt * 0.95})`;
        ge.fillRect(x + 6, y + 6, pw - 12, ph - 12);
        ge.fillStyle = '#000';
        ge.fillRect(x + pw / 2 - 2, y + 6, 4, ph - 12);
        ge.fillRect(x + 6, y + ph / 2 - 2, pw - 12, 4);
      }
    }
    // Sill + lintel.
    g.fillStyle = '#3a3532';
    g.fillRect(wx - 16, wTop + wh + 8, ww + 32, 0.18 * px);
    g.fillRect(wx - 16, wTop - 0.22 * px, ww + 32, 0.14 * px);
  };
  bank(2.0, 3.5, 8.0, 7.0, 5, 8); // main bank: 3.5 → 10.5 m
  bank(2.0, 12.4, 8.0, 2.0, 5, 2); // clerestory: 12.4 → 14.4 m
  // Steel column at the bay edge + girts.
  g.fillStyle = '#26282c';
  g.fillRect(0, 0, 0.4 * px, H);
  for (const y of [3.2, 10.8, 15.2]) g.fillRect(0, H - y * px, W, 0.18 * px);
  // Stencil on some bays, low on the wall.
  if (rng.next() < 0.6) {
    g.fillStyle = 'rgba(230,220,200,0.45)';
    g.font = `bold ${Math.floor(0.9 * px)}px Impact, "Arial Black", sans-serif`;
    g.fillText(rng.next() < 0.5 ? 'TRIALS' : 'BAY ' + rng.int(1, 9), 3 * px, H - 1.6 * px);
  }
  return { map: tex(c), emissive: tex(ce, true), bytes: W * H * 4 * 1.33 * 2 };
}

/**
 * Container skin variant: light base (tinted per instance), rust level 0–2, logo choice,
 * door bars on the left or right, optional hazard stripe. Albedo only; the corrugated
 * normal / ORM maps from the library stay so every variant shares one program.
 */
function containerSkin(rng: Rng, v: { rust: number; logo: number; doorLeft: boolean; stripe: boolean }): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 512);
  g.fillStyle = '#e6e6e2';
  g.fillRect(0, 0, 1024, 512);
  for (let x = 0; x < 1024; x += 16) {
    g.fillStyle = 'rgba(0,0,0,0.07)';
    g.fillRect(x, 0, 6, 512);
  }
  const streaks = [3, 9, 18][v.rust]!;
  for (let i = 0; i < streaks; i++) {
    const x = rng.range(0, 1024);
    const w = rng.range(3, 12 + v.rust * 6);
    const h = rng.range(30, 200 + v.rust * 120);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, `rgba(110,60,25,${0.3 + v.rust * 0.15})`);
    gr.addColorStop(1, 'rgba(120,60,20,0)');
    g.fillStyle = gr;
    g.fillRect(x, 0, w, h);
  }
  if (v.rust === 2) {
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(90,45,20,${rng.range(0.2, 0.5)})`;
      g.beginPath();
      g.ellipse(rng.range(0, 1024), rng.range(300, 512), rng.range(10, 60), rng.range(6, 30), 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  const grime = g.createLinearGradient(0, 512, 0, 380);
  grime.addColorStop(0, `rgba(30,22,14,${0.3 + v.rust * 0.15})`);
  grime.addColorStop(1, 'rgba(30,22,14,0)');
  g.fillStyle = grime;
  g.fillRect(0, 0, 1024, 512);
  const lx = v.doorLeft ? 300 : 60;
  const logos = ['SQUADX', 'KBNI', 'REDLYNX', 'TRIALS', 'FOX', 'MAERSK'];
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillRect(lx, 60, 330, 70);
  g.fillStyle = '#111';
  g.font = 'bold 54px Impact, "Arial Black", sans-serif';
  g.fillText(logos[v.logo % logos.length]!, lx + 20, 116);
  g.fillStyle = 'rgba(20,20,20,0.85)';
  g.font = 'bold 72px Impact, "Arial Black", sans-serif';
  g.fillText(String(rng.int(10, 99)) + 'C', v.doorLeft ? 300 : 640, 130 + (v.doorLeft ? 200 : 0));
  if (v.stripe) {
    g.fillStyle = 'rgba(230,180,30,0.8)';
    g.fillRect(0, 440, 1024, 26);
  }
  g.fillStyle = 'rgba(25,25,25,0.7)';
  const bars = v.doorLeft ? [40, 90, 140, 190] : [790, 840, 890, 940];
  for (const x of bars) g.fillRect(x, 20, 10, 472);
  return tex(c);
}

/** Soft gradient used for light shafts. */
function shaftTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const v = g.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(0.45, 'rgba(0,0,0,0.3)');
  v.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = v;
  g.fillRect(0, 0, 256, 256);
  return tex(c, true, false);
}

/** Roof: dark deck with skylight strips (emissive) running across the hall. */
function roofTexture(foundry: boolean): THREE.CanvasTexture {
  const [rc, rg] = canvas(512, 512);
  rg.fillStyle = '#26262a';
  rg.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 24) {
    rg.fillStyle = 'rgba(0,0,0,0.25)';
    rg.fillRect(0, y, 512, 3);
  }
  for (let x = 48; x < 512; x += 160) {
    rg.fillStyle = foundry ? '#6a2410' : '#e9dcc4';
    rg.fillRect(x, 24, 56, 464);
    rg.fillStyle = '#1c1c1e';
    for (let y = 24; y < 488; y += 58) rg.fillRect(x, y, 56, 4);
    rg.fillRect(x + 26, 24, 4, 464);
  }
  return tex(rc);
}

export function buildHall(track: CompiledTrack, biome: Biome, lib: MaterialLibrary, rng: Rng, floorY: number, x0: number, x1: number): HallOut {
  const foundry = biome.id === 'foundry';
  const out: HallOut = { meshes: [], singles: [], batches: [], flicker: [], lights: [], textureBytes: 0 };
  const span = x1 - x0;
  const midX = (x0 + x1) / 2;
  const roofY = floorY + HALL.height;
  const wallZ = HALL.wallZ;
  const profile = track.def.profile;
  const deckY = profileY(profile, track.def.start.pos.x);

  const addPlane = (w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    m.receiveShadow = true;
    out.meshes.push(m);
    return m;
  };
  /** Library material with vertex colours (AO bakes); PropBatch does the same for batches. */
  const vc = (name: string): THREE.MeshStandardMaterial => {
    const m = lib.get(name);
    if (!m.vertexColors) {
      m.vertexColors = true;
      m.needsUpdate = true;
    }
    return fogify(m);
  };

  // --- Shell: back wall with window bays, side walls, roof.
  const wall = warehouseWall(rng, foundry ? '#c8642a' : '#fff1d8', foundry ? '#2a1610' : '#4a2e24');
  out.textureBytes += wall.bytes;
  const bays = Math.ceil(span / 12);
  wall.map.repeat.set(bays, 1);
  wall.emissive.repeat.set(bays, 1);
  const wallMat = fogify(
    new THREE.MeshStandardMaterial({
      map: wall.map,
      emissiveMap: wall.emissive,
      emissive: new THREE.Color(foundry ? 0xff7a30 : 0xfff0d8),
      emissiveIntensity: foundry ? 0.7 : 0.95, // p99 of the frame must stay ≈0.92 after tonemap (round 5)
      roughness: 0.95,
    }),
  );
  addPlane(bays * 12, HALL.height, wallMat, x0 + (bays * 12) / 2, floorY + HALL.height / 2, wallZ);
  const sideMat = fogify(new THREE.MeshStandardMaterial({ map: wall.map, emissiveMap: wall.emissive, emissive: new THREE.Color(foundry ? 0xff7a30 : 0xfff0d8), emissiveIntensity: foundry ? 0.5 : 1.2, roughness: 0.95, color: 0x8a8a8a }));
  const depth = HALL.frontZ - wallZ;
  addPlane(depth, HALL.height, sideMat, x0 + 2, floorY + HALL.height / 2, (wallZ + HALL.frontZ) / 2, 0, Math.PI / 2);
  addPlane(depth, HALL.height, sideMat, x1 - 2, floorY + HALL.height / 2, (wallZ + HALL.frontZ) / 2, 0, -Math.PI / 2);
  const roofTex = roofTexture(foundry);
  roofTex.repeat.set(span / 12, depth / 12);
  out.textureBytes += 512 * 512 * 4 * 1.33;
  const roofMat = fogify(new THREE.MeshStandardMaterial({ map: roofTex, emissiveMap: roofTex, emissive: 0xffffff, emissiveIntensity: foundry ? 0.5 : 0.9, roughness: 0.9, side: THREE.DoubleSide }));
  addPlane(span, depth, roofMat, midX, roofY, (wallZ + HALL.frontZ) / 2, Math.PI / 2);

  // --- Structure: trusses across the hall every 12 m, purlins along it, columns, crane rails.
  const steel = vc('darkSteel');
  const truss = new PropBatch('truss', bakeAO(trussGeometry(depth), 1.1, 0.2), steel, false);
  const purlin = new PropBatch('purlin', new THREE.BoxGeometry(1, 0.14, 0.14), steel, false);
  const column = new PropBatch('column', bakeAO(columnGeometry(), 1, 0.35), steel);
  const rail = new PropBatch('cranerail', beamGeometry(0.3, 0.5), steel, false);
  for (let x = x0 + 6; x < x1; x += 12) {
    truss.add(x, roofY - 1.3, (wallZ + HALL.frontZ) / 2, Math.PI / 2);
    column.add(x, floorY, wallZ + 0.5, 0, 1, null, 0, roofY - floorY, 1);
  }
  for (let x = x0 + 12; x < x1; x += 24) column.add(x, floorY, -17, 0, 1, null, 0, roofY - floorY, 1);
  for (const z of [-26, -19, -12, -5, 2, 9, 16, 23]) purlin.add(midX, roofY - 0.2, z, 0, span, null, 0, 1, 1);
  for (const z of [-24, 12]) rail.add(midX, floorY + 12.2, z, 0, span, null, 0, 1, 1);
  // Crane bridge + trolley + hook at 45 % of the hall.
  {
    const bx = x0 + span * 0.45;
    const bridge = new THREE.Mesh(bakeAO(new THREE.BoxGeometry(1.0, 1.1, 36.5), 1.1, 0.2), vc('rustSteel'));
    bridge.position.set(bx, floorY + 13.05, -6);
    bridge.castShadow = true;
    out.meshes.push(bridge);
    const trolley = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.6), steel);
    trolley.position.set(bx, floorY + 12.0, -8);
    out.meshes.push(trolley);
    const cable = new THREE.Mesh(chainGeometry(), steel);
    cable.position.set(bx, floorY + 11.6, -8);
    cable.scale.set(1, 3.4, 1);
    out.meshes.push(cable);
    const hook = new THREE.Mesh(hookBlockGeometry(), vc('rustSteel'));
    hook.position.set(bx, floorY + 8.2, -8);
    hook.castShadow = true;
    out.meshes.push(hook);
  }
  out.batches.push(truss, purlin, column, rail);

  // --- High-bay lamps on long chains (mid hall + a few in the foreground that slide past).
  const chains = new PropBatch('chain', chainGeometry(), steel, false);
  const lampShade = new PropBatch('lamp', lampGeometry(), steel, false);
  const bulbMat = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: foundry ? 0xff6a2a : 0xffc46a, emissiveIntensity: 7, roughness: 0.4 }));
  const bulb = new PropBatch('bulb', lampBulbGeometry(), bulbMat, false);
  for (let x = x0 + 9; x < x1; x += 12) {
    const z = -10 + rng.range(-1.5, 1.5);
    const lampY = deckY + rng.range(5.5, 7.0);
    chains.add(x, roofY, z, 0, 1, null, 0, roofY - lampY, 1);
    lampShade.add(x, lampY, z);
    bulb.add(x, lampY, z);
  }
  // Foreground chains that slide past the camera (z 4.5–7): most end in a hook
  // tyre just above deck height, a few carry a lamp well above the camera.
  const hookTyres = new PropBatch('hooktyre', bakeAO(tyreStackGeometry(), 0.9, 0.2), lib.get('tyre'));
  for (let x = x0 + 22; x < x1 - 10; x += rng.range(15, 24)) {
    const z = rng.range(4.5, 7);
    if (rng.next() < 0.7) {
      const endY = deckY + rng.range(0.8, 1.8);
      chains.add(x, roofY, z, 0, 1, null, 0, roofY - endY, 1);
      hookTyres.add(x, endY - 0.85, z, rng.range(0, 6), 1, null, Math.PI / 2, 1, 1);
    } else {
      const lampY = deckY + rng.range(5.0, 6.5);
      chains.add(x, roofY, z, 0, 1, null, 0, roofY - lampY, 1);
      lampShade.add(x, lampY, z);
      bulb.add(x, lampY, z);
    }
  }
  out.batches.push(hookTyres);
  // Loose chains off the trusses, mid hall.
  for (let x = x0 + 5; x < x1; x += rng.range(5, 10)) chains.add(x, roofY - 1.4, rng.range(-16, -6), 0, 1, null, 0, rng.range(3, 8), 1);
  out.batches.push(chains, lampShade, bulb);

  // --- Container rows at three depths with gaps. Eight skin variants
  // (rust × logo × door side × stripe), each its own batch (8 calls, one program).
  const contMat = lib.get('container');
  const skinBatches: PropBatch[] = [];
  const contGeo = bakeAO(containerGeometry(), 2.59, 0.4);
  for (let i = 0; i < 8; i++) {
    const skin = containerSkin(rng, { rust: i % 3, logo: i, doorLeft: (i & 1) === 1, stripe: i % 4 === 3 });
    out.textureBytes += 1024 * 512 * 4 * 1.33;
    const m = i === 0 ? contMat : lib.derive('container');
    m.map = skin;
    m.needsUpdate = true;
    if (i > 0) {
      m.vertexColors = true;
      fogify(m);
    }
    skinBatches.push(new PropBatch(`container${i}`, contGeo, m));
  }
  const palette = [0x2f6f5e, 0x8a2c22, 0x2a4f7a, 0x6b6b60, 0xa9682a, 0x3d6b3a, 0x7a3b6a, 0x4a6a8a, 0x9a9a92];
  const pick = (): number => palette[rng.int(0, palette.length - 1)]!;
  const stack = (x: number, z: number, n: number, ry: number): void => {
    for (let k = 0; k < n; k++) {
      const b = skinBatches[rng.int(0, skinBatches.length - 1)]!;
      // Every other layer in a stack turns 180° so door ends and logos alternate.
      b.add(x + rng.range(-0.12, 0.12), floorY + k * 2.59, z + rng.range(-0.1, 0.1), ry + rng.range(-0.03, 0.03) + (rng.next() < 0.5 ? Math.PI : 0), 1, pick());
    }
  };
  // Far row against the wall: 2–4 high, 25 % gaps.
  for (let x = x0 + 6; x < x1 - 6; x += rng.range(6.6, 8.5)) {
    if (rng.next() < 0.25) continue;
    stack(x, -25 + rng.range(-0.8, 0.8), rng.int(2, 4), rng.next() < 0.2 ? Math.PI / 2 : 0);
  }
  // Mid row: 1–3 high, 35 % gaps, some turned.
  for (let x = x0 + 12; x < x1 - 8; x += rng.range(8, 13)) {
    if (rng.next() < 0.35) continue;
    stack(x, -15.5 + rng.range(-1.5, 1.5), rng.int(1, 3), rng.next() < 0.35 ? Math.PI / 2 : rng.range(-0.2, 0.2));
  }
  // Near row: single containers, sparse, some turned end-on.
  for (let x = x0 + 20; x < x1 - 10; x += rng.range(14, 24)) {
    if (rng.next() < 0.3) continue;
    stack(x, -7.5 + rng.range(-1.0, 1.0), rng.next() < 0.3 ? 2 : 1, rng.next() < 0.5 ? Math.PI / 2 : rng.range(-0.3, 0.3));
  }
  out.batches.push(...skinBatches);

  // --- Racks, catwalk under the windows, floor clutter, foreground occluders.
  const racks = new PropBatch('rack', bakeAO(rackGeometry(), 4, 0.35), vc('rustSteel'));
  const pallets = new PropBatch('pallet', bakeAO(palletGeometry(), 0.144, 0.3), vc('pallet'));
  const drums = new PropBatch('drum', bakeAO(drumGeometry(), 0.88, 0.4), vc('barrelRed'));
  const tyres = new PropBatch('tyres', bakeAO(tyreStackGeometry(), 0.9, 0.4), vc('tyre'));
  const cones = new PropBatch('cone', coneGeometry(), fogify(new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 })));
  const railTape = new PropBatch('rail', new THREE.BoxGeometry(1, 0.05, 0.05), lib.get('hazardTape'), false);
  const railPost = new PropBatch('railpost', new THREE.BoxGeometry(0.05, 1.1, 0.05).translate(0, 0.55, 0), steel, false);
  const catwalk = new PropBatch('catwalk', new THREE.BoxGeometry(1, 0.08, 1.4), lib.get('grate'));
  const cwY = floorY + 10.9;
  for (let x = x0 + 4; x < x1 - 4; x += 1) {
    catwalk.add(x + 0.5, cwY, wallZ + 1.2);
    railTape.add(x + 0.5, cwY + 1.05, wallZ + 1.85);
    if (Math.round(x - x0) % 3 === 0) railPost.add(x + 0.5, cwY + 0.04, wallZ + 1.85);
  }
  for (let x = x0 + 8; x < x1 - 8; x += rng.range(4, 7)) {
    const r = rng.next();
    if (r < 0.22) {
      racks.add(x, floorY, wallZ + rng.range(1.2, 2.2), 0, 1);
      racks.add(x + 2.75, floorY, wallZ + rng.range(1.2, 2.2), 0, 1);
    } else if (r < 0.45) {
      const z = rng.range(-12, -5);
      const n = rng.int(2, 6);
      for (let k = 0; k < n; k++) pallets.add(x + rng.range(-0.3, 0.3), floorY + k * 0.144, z + rng.range(-0.1, 0.1), rng.range(-0.1, 0.1));
    } else if (r < 0.7) {
      const z = rng.range(-11, -5);
      const n = rng.int(2, 5);
      for (let k = 0; k < n; k++) drums.add(x + k * 0.62, floorY, z + rng.range(-0.3, 0.3), rng.range(0, 6), 1, k % 3 === 1 ? 0xd8d2c4 : k % 3 === 2 ? 0x244d8a : 0xa42a1e);
    } else if (r < 0.85) {
      tyres.add(x, floorY, rng.range(-9, -4.5), rng.range(0, 6));
    } else {
      cones.add(x + rng.range(-2, 2), floorY, rng.range(-6, -4), rng.range(0, 6));
    }
  }
  // Foreground: columns, drums, tyres, pallets at z 4.5–8 on the floor (they slide past under the camera).
  for (let x = x0 + 14; x < x1 - 10; x += rng.range(9, 16)) {
    const r = rng.next();
    const z = rng.range(4.5, 8);
    if (r < 0.2) column.add(x, floorY, z + 1, 0, 1, null, 0, roofY - floorY, 1);
    else if (r < 0.5) {
      const n = rng.int(2, 4);
      for (let k = 0; k < n; k++) drums.add(x + k * 0.62, floorY, z + rng.range(-0.3, 0.3), rng.range(0, 6), 1, k % 2 ? 0xd8d2c4 : 0xa42a1e);
    } else if (r < 0.75) tyres.add(x, floorY, z, 0);
    else {
      const n = rng.int(3, 7);
      for (let k = 0; k < n; k++) pallets.add(x, floorY + k * 0.144, z, rng.range(-0.2, 0.2));
    }
  }
  // Round 5 prop types: cable reels, scaffold towers, hanging tarps, forklift, signage boards.
  const reelGeo = bakeAO((() => {
    const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.9, 0.9, 0.12, 18).rotateX(Math.PI / 2).translate(0, 0.9, 0.45), new THREE.CylinderGeometry(0.9, 0.9, 0.12, 18).rotateX(Math.PI / 2).translate(0, 0.9, -0.45), new THREE.CylinderGeometry(0.55, 0.55, 0.8, 14).rotateX(Math.PI / 2).translate(0, 0.9, 0)];
    return mergeGeometries(parts, false)!;
  })(), 1.8, 0.35);
  const reels = new PropBatch('reel', reelGeo, lib.get('pallet'));
  const scaffoldGeo = (() => {
    const parts: THREE.BufferGeometry[] = [];
    for (const x of [-0.9, 0.9]) for (const z of [-0.6, 0.6]) parts.push(new THREE.CylinderGeometry(0.03, 0.03, 4, 6).translate(x, 2, z));
    for (const y of [1.3, 2.6, 3.9]) {
      for (const z of [-0.6, 0.6]) parts.push(new THREE.BoxGeometry(1.8, 0.05, 0.05).translate(0, y, z));
      for (const x of [-0.9, 0.9]) parts.push(new THREE.BoxGeometry(0.05, 0.05, 1.2).translate(x, y, 0));
      parts.push(new THREE.BoxGeometry(1.8, 0.04, 1.2).translate(0, y + 0.03, 0));
    }
    return mergeGeometries(parts, false)!;
  })();
  const scaffolds = new PropBatch('scaffold', bakeAO(scaffoldGeo, 4, 0.3), steel);
  const tarpMat = fogify(new THREE.MeshStandardMaterial({ color: 0x2a4d8a, roughness: 0.9, side: THREE.DoubleSide }));
  const tarps = new PropBatch('tarp', new THREE.PlaneGeometry(3, 2.4, 6, 4).translate(0, -1.2, 0), tarpMat, true);
  const forkliftGeo = bakeAO((() => {
    const parts: THREE.BufferGeometry[] = [new THREE.BoxGeometry(1.1, 0.9, 1.0).translate(0, 0.75, 0), new THREE.BoxGeometry(0.9, 0.5, 0.9).translate(-0.2, 1.4, 0), new THREE.BoxGeometry(0.08, 2.6, 0.9).translate(0.75, 1.3, 0), new THREE.BoxGeometry(1.0, 0.05, 0.15).translate(1.3, 0.1, 0.3), new THREE.BoxGeometry(1.0, 0.05, 0.15).translate(1.3, 0.1, -0.3)];
    for (const x of [-0.35, 0.4]) for (const z of [-0.5, 0.5]) parts.push(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12).rotateX(Math.PI / 2).translate(x, 0.3, z));
    return mergeGeometries(parts, false)!;
  })(), 2.5, 0.35);
  const forklifts = new PropBatch('forklift', forkliftGeo, fogify(new THREE.MeshStandardMaterial({ color: 0xd8a020, roughness: 0.5, metalness: 0.3 })));
  const signMat = lib.get('hazardTape');
  const signs = new PropBatch('sign', new THREE.BoxGeometry(1.6, 1.0, 0.05).translate(0, 2.0, 0), signMat);
  for (let x = x0 + 10; x < x1 - 10; x += rng.range(9, 16)) {
    const r = rng.next();
    if (r < 0.25) reels.add(x, floorY, rng.range(-12, -6), rng.range(0, 6), rng.range(0.6, 1.0));
    else if (r < 0.45) scaffolds.add(x, floorY, rng.range(-14, -9), rng.range(-0.2, 0.2));
    else if (r < 0.65) tarps.add(x, roofY - 3 - rng.range(0, 3), rng.range(-16, -8), rng.range(-0.4, 0.4), 1, [0x2a4d8a, 0x8a6a2a, 0x5a5a5a][rng.int(0, 2)]!);
    else if (r < 0.8) forklifts.add(x, floorY, rng.range(-9, -5), rng.range(-0.5, 0.5) + (rng.next() < 0.5 ? Math.PI : 0));
    else signs.add(x, floorY, wallZ + 2.2, 0);
  }
  out.batches.push(racks, pallets, drums, tyres, cones, railTape, railPost, catwalk, reels, scaffolds, tarps, forklifts, signs);

  // --- Light shafts from the main window banks, leaning along the sun.
  const shaft = shaftTexture();
  out.textureBytes += 256 * 256 * 4;
  const shaftMat = new THREE.MeshBasicMaterial({
    map: shaft,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    color: new THREE.Color(foundry ? 0xff5a1a : 0xffe8c8).multiplyScalar(foundry ? 0.1 : 0.075),
    side: THREE.DoubleSide,
    fog: false,
  });
  const sunDir = new THREE.Vector3(-biome.sunDir[0], -biome.sunDir[1], -biome.sunDir[2]).normalize();
  if (sunDir.z < 0.15) sunDir.z = 0.3; // shafts always come toward the camera
  sunDir.normalize();
  for (let bay = 0; x0 + bay * 12 < x1; bay += 1) {
    if (bay % 2 === 1) continue;
    const wx = x0 + bay * 12 + 6;
    const len = 30;
    const q = new THREE.Mesh(new THREE.PlaneGeometry(8.5, len), shaftMat);
    const top = new THREE.Vector3(wx, floorY + 7.0, wallZ + 0.3);
    q.position.copy(top).addScaledVector(sunDir, len / 2);
    q.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), sunDir);
    q.rotateY(0.3);
    q.renderOrder = 5;
    out.singles.push(q);
  }

  if (foundry) {
    const molten = fogify(new THREE.MeshStandardMaterial({ color: 0x1a0402, emissive: 0xff6a18, emissiveIntensity: 4.5, roughness: 0.6 }));
    out.flicker.push(molten);
    const pillars = new PropBatch('molten', new THREE.CylinderGeometry(0.7, 0.9, 1, 14).translate(0, 0.5, 0), molten, false);
    const pipes = new PropBatch('pipe', pipeGeometry(), vc('rustSteel'));
    const ladles = new PropBatch('ladle', bakeAO(new THREE.CylinderGeometry(1.1, 0.8, 1.6, 16, 1, true).translate(0, 0.8, 0), 1.6, 0.3), vc('darkSteel'));
    const melt = new PropBatch('melt', new THREE.CylinderGeometry(1.0, 1.0, 0.1, 16).translate(0, 1.5, 0), molten, false);
    for (let x = x0 + 14; x < x1; x += rng.range(16, 26)) {
      pillars.add(x, floorY, rng.range(-14, -8), 0, 1, null, 0, rng.range(6, 11), 1);
      pipes.add(x + 4, floorY + rng.range(4, 9), rng.range(-14, -6), rng.range(-0.2, 0.2));
      if (rng.next() < 0.6) {
        const lz = rng.range(-9, -5);
        ladles.add(x + 8, floorY, lz);
        melt.add(x + 8, floorY, lz);
      }
    }
    // Molten channel along the floor behind the track: an emissive strip that under-lights the containers.
    const channel = new THREE.Mesh(new THREE.PlaneGeometry(span * 0.6, 1.2), molten);
    channel.rotation.x = -Math.PI / 2;
    channel.position.set(midX, floorY + 0.02, -6.5);
    out.meshes.push(channel);
    out.batches.push(pillars, pipes, ladles, melt);
    const pl = new THREE.PointLight(0xff5a10, 80, 34, 2);
    pl.position.set(midX, floorY + 3, -7);
    out.lights.push(pl);
  }
  return out;
}
