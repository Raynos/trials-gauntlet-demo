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
import { drawArt, pickId, tintMask, type ArtLibrary } from '../art/library';
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
  lightConeGeometry,
  palletGeometry,
  pipeGeometry,
  rackGeometry,
  reflectionMaskTexture,
  trussGeometry,
  tyreStackGeometry,
} from './props';

export interface HallOut {
  meshes: THREE.Mesh[];
  singles: THREE.Object3D[];
  batches: PropBatch[];
  flicker: THREE.MeshStandardMaterial[];
  lights: THREE.PointLight[];
  scroll: { tex: THREE.Texture; vx: number; vy: number }[];
  fountains: { x: number; y: number; z: number }[];
  textureBytes: number;
}

/**
 * Foreground occluder rule (round 8, user's b2 screenshot: a pillar + chain ran straight
 * through the bike at a spawn). Nothing at z > +3 may sit within [spawn − 10, spawn + 14] of
 * the start or any checkpoint (the bike lives at screen x 0.15–0.5 there for a second or
 * more), occluders are sparse (≈ one per 40 m), thin, and there are no floor-to-roof
 * columns in the foreground at all.
 */
export function foregroundKeepOut(track: CompiledTrack): (x: number, halfWidth?: number) => boolean {
  const spawns = [track.def.start.pos.x, ...track.def.checkpoints.map((c) => c.spawn.pos.x), track.def.finishX];
  return (x, halfWidth = 0) => spawns.some((s) => x + halfWidth > s - 10 && x - halfWidth < s + 14);
}

/** Molten flow tile: dark crust with bright streaks along x; used as albedo and emissive, scrolled along x (channels) or y (pours). */
function moltenTexture(rng: Rng): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#5a1a08';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    const y = rng.range(0, H);
    const w = rng.range(60, 400);
    const h = rng.range(3, 14);
    const x = rng.range(-w, W);
    const gr = g.createLinearGradient(x, 0, x + w, 0);
    const bright = rng.next() < 0.5 ? '#ffd070' : '#ff9030';
    gr.addColorStop(0, 'rgba(255,120,40,0)');
    gr.addColorStop(0.5, bright);
    gr.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
    if (x + w > W) g.fillRect(x - W, y, w, h); // wrap
  }
  // Crust islands.
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(30,8,4,${rng.range(0.5, 0.9)})`;
    g.beginPath();
    g.ellipse(rng.range(0, W), rng.range(0, H), rng.range(8, 40), rng.range(3, 10), 0, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}

export const HALL = { wallZ: -30, frontZ: 30, height: 16 };

/** One 12 m × 16 m warehouse wall bay: brick, steel column, a 7 m tall window bank + clerestory. Returns albedo + emissive. */
function warehouseWall(rng: Rng, paneColor: string, brick: string, foundry = false): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture; bytes: number } {
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
  if (foundry) {
    // Foundry shell: riveted steel plate over the brick, one narrow sooty clerestory, vent louvres.
    for (let y = 0; y < H - 2.2 * px; y += 2.4 * px) {
      for (let x = 0; x < W; x += 3 * px) {
        g.fillStyle = `rgba(${28 + rng.int(0, 10)},${24 + rng.int(0, 8)},${22 + rng.int(0, 6)},0.92)`;
        g.fillRect(x + 3, y + 3, 3 * px - 6, 2.4 * px - 6);
        g.fillStyle = 'rgba(0,0,0,0.5)';
        for (let k = x + 12; k < x + 3 * px - 6; k += 24) {
          g.fillRect(k, y + 8, 4, 4);
          g.fillRect(k, y + 2.4 * px - 14, 4, 4);
        }
      }
    }
    for (let x = 1.2 * px; x < W; x += 4 * px) {
      g.fillStyle = '#121010';
      g.fillRect(x, H - 9.5 * px, 1.2 * px, 1.6 * px);
      g.fillStyle = '#2a2622';
      for (let k = 0; k < 6; k++) g.fillRect(x, H - 9.5 * px + k * 0.26 * px, 1.2 * px, 0.1 * px);
    }
    bank(2.0, 12.6, 8.0, 1.4, 8, 1); // clerestory only: 12.6 → 14 m
  } else {
    bank(2.0, 3.5, 8.0, 7.0, 5, 8); // main bank: 3.5 → 10.5 m
    bank(2.0, 12.4, 8.0, 2.0, 5, 2); // clerestory: 12.4 → 14.4 m
  }
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
 * Round 8: with the art pack the owner markings are the generated stencils (white paint,
 * screen-blended) and the rust / grime come from the grime masks tinted rust-brown; the
 * procedural streaks stay as the fallback. Only fictional owners (brands audit).
 */
function containerSkin(rng: Rng, v: { rust: number; logo: number; doorLeft: boolean; stripe: boolean }, art: ArtLibrary | null): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 512);
  g.fillStyle = '#e6e6e2';
  g.fillRect(0, 0, 1024, 512);
  for (let x = 0; x < 1024; x += 16) {
    g.fillStyle = 'rgba(0,0,0,0.07)';
    g.fillRect(x, 0, 6, 512);
  }
  const stencils = art ? art.ids('stencil').filter((id) => id !== 'stencil-apex' && id !== 'stencil-taro') : []; // the two the art owner rejected
  const masks = art ? ['mask-rust-streaks', 'mask-grime-spatter', 'mask-edge-grime', 'mask-rivet-drips'].filter((id) => art.has(id)) : [];
  const useArt = art !== null && stencils.length > 0;
  const streaks = useArt ? [0, 3, 8][v.rust]! : [3, 9, 18][v.rust]!;
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
  if (v.rust === 2 && !useArt) {
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(90,45,20,${rng.range(0.2, 0.5)})`;
      g.beginPath();
      g.ellipse(rng.range(0, 1024), rng.range(300, 512), rng.range(10, 60), rng.range(6, 30), 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (useArt && masks.length) {
    // Grime: edge grime on every skin, rust streaks / rivet drips / spatter by rust level.
    const put = (id: string | null, color: string, strength: number, x: number, y: number, w: number, h: number): void => {
      const bmp = id ? art!.bitmap(id) : null;
      if (!bmp) return;
      g.drawImage(tintMask(bmp, 512, 512, color, strength), x, y, w, h);
    };
    put(masks.includes('mask-edge-grime') ? 'mask-edge-grime' : null, '#2a1e14', 0.35 + 0.2 * v.rust, 0, 0, 1024, 512);
    if (v.rust >= 1) {
      put(masks.includes('mask-rust-streaks') ? 'mask-rust-streaks' : null, '#6a3a1a', 0.5 + 0.25 * v.rust, rng.range(-200, 0), -40, 1024, 560);
      put(masks.includes('mask-grime-spatter') ? 'mask-grime-spatter' : null, '#3a2a1a', 0.5, rng.range(-300, 0), 200, 1024, 340);
    }
    if (v.rust === 2) put(masks.includes('mask-rivet-drips') ? 'mask-rivet-drips' : null, '#7a4020', 0.8, rng.range(-100, 100), 20, 1024, 500);
  }
  const grime = g.createLinearGradient(0, 512, 0, 380);
  grime.addColorStop(0, `rgba(30,22,14,${0.3 + v.rust * 0.15})`);
  grime.addColorStop(1, 'rgba(30,22,14,0)');
  g.fillStyle = grime;
  g.fillRect(0, 0, 1024, 512);
  const lx = v.doorLeft ? 300 : 60;
  if (useArt) {
    // Owner stencil (white spray paint) on the side panel; a second small one (weights / hazard / arrows) near the doors.
    const main = pickId(stencils, v.logo)!;
    const bmp = art!.bitmap(main)!;
    const size = 300;
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = 0.82;
    drawArt(g, bmp, lx + 20, 40, size, size);
    const smallIds = stencils.filter((id) => id !== main);
    const small = pickId(smallIds, v.logo * 3 + 1);
    if (small) drawArt(g, art!.bitmap(small)!, v.doorLeft ? 600 : 420, 250, 180, 180);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  } else {
    // Fallback: generic fictional owner codes (no real company names).
    const logos = ['NORDVIK', 'HKR', 'OCTU', 'TARO', 'APEX', 'KESTREL'];
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(lx, 60, 330, 70);
    g.fillStyle = '#111';
    g.font = 'bold 54px Impact, "Arial Black", sans-serif';
    g.fillText(logos[v.logo % logos.length]!, lx + 20, 116);
    g.fillStyle = 'rgba(20,20,20,0.85)';
    g.font = 'bold 72px Impact, "Arial Black", sans-serif';
    g.fillText(String(rng.int(10, 99)) + 'C', v.doorLeft ? 300 : 640, 130 + (v.doorLeft ? 200 : 0));
  }
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

export function buildHall(track: CompiledTrack, biome: Biome, lib: MaterialLibrary, rng: Rng, floorY: number, x0: number, x1: number, art: ArtLibrary | null = null): HallOut {
  const keepOut = foregroundKeepOut(track);
  const foundry = biome.id === 'foundry';
  const out: HallOut = { meshes: [], singles: [], batches: [], flicker: [], lights: [], scroll: [], fountains: [], textureBytes: 0 };
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
  const wall = warehouseWall(rng, foundry ? '#ff9a40' : '#fff1d8', foundry ? '#1a1412' : '#4a2e24', foundry);
  out.textureBytes += wall.bytes;
  const bays = Math.ceil(span / 12);
  wall.map.repeat.set(bays, 1);
  wall.emissive.repeat.set(bays, 1);
  const wallMat = fogify(
    new THREE.MeshStandardMaterial({
      map: wall.map,
      emissiveMap: wall.emissive,
      emissive: new THREE.Color(foundry ? 0xff7a30 : 0xfff0d8),
      emissiveIntensity: foundry ? 0.6 : 0.95, // p99 of the frame must stay ≈0.92 after tonemap (round 5); foundry: sooty panes, the melt is the light
      roughness: 0.95,
    }),
  );
  addPlane(bays * 12, HALL.height, wallMat, x0 + (bays * 12) / 2, floorY + HALL.height / 2, wallZ);
  const depth = HALL.frontZ - wallZ;
  // End walls: with the art pack they are the far plate ("distant interior bays receding"),
  // so the hall reads as continuing past its ends; otherwise the window wall repeats.
  const plateId = foundry ? 'plate-foundry' : 'plate-industrial';
  const plate = art?.texture(plateId, true, true) ?? null;
  if (plate) {
    const pe = art!.entry(plateId)!;
    out.textureBytes += pe.bytes;
    const pm = new THREE.MeshBasicMaterial({ map: plate, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, color: new THREE.Color(foundry ? 0xffd0b0 : 0xffffff) });
    // The plate is 4:1 with its interest band in the middle; 60 m across → 15 m tall, its
    // horizon (v ≈ 0.45) at deck eye level.
    const ph = depth / 4;
    for (const [x, ry] of [[x0 + 1.9, Math.PI / 2], [x1 - 1.9, -Math.PI / 2]] as const) {
      const m = addPlane(depth, ph, pm, x, deckY + 1.6 - ph * 0.05, (wallZ + HALL.frontZ) / 2, 0, ry);
      m.receiveShadow = false;
      m.renderOrder = -2;
    }
    const capMat = fogify(new THREE.MeshStandardMaterial({ color: foundry ? 0x14100e : 0x2a2420, roughness: 0.95 }));
    addPlane(depth, HALL.height, capMat, x0 + 2.1, floorY + HALL.height / 2, (wallZ + HALL.frontZ) / 2, 0, Math.PI / 2);
    addPlane(depth, HALL.height, capMat, x1 - 2.1, floorY + HALL.height / 2, (wallZ + HALL.frontZ) / 2, 0, -Math.PI / 2);
  } else {
    const sideMat = fogify(new THREE.MeshStandardMaterial({ map: wall.map, emissiveMap: wall.emissive, emissive: new THREE.Color(foundry ? 0xff7a30 : 0xfff0d8), emissiveIntensity: foundry ? 0.18 : 1.2, roughness: 0.95, color: 0x8a8a8a }));
    addPlane(depth, HALL.height, sideMat, x0 + 2, floorY + HALL.height / 2, (wallZ + HALL.frontZ) / 2, 0, Math.PI / 2);
    addPlane(depth, HALL.height, sideMat, x1 - 2, floorY + HALL.height / 2, (wallZ + HALL.frontZ) / 2, 0, -Math.PI / 2);
  }
  const roofTex = roofTexture(foundry);
  roofTex.repeat.set(span / 12, depth / 12);
  out.textureBytes += 512 * 512 * 4 * 1.33;
  const roofMat = fogify(new THREE.MeshStandardMaterial({ map: roofTex, emissiveMap: roofTex, emissive: 0xffffff, emissiveIntensity: foundry ? 0.15 : 0.9, roughness: 0.9, side: THREE.DoubleSide }));
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
  // Round 8 (industrial key art): every lamp carries a volumetric cone (the city kit's
  // additive cone, vertex alpha fading to the floor) and a wet-floor pool under it.
  const chains = new PropBatch('chain', chainGeometry(), steel, false);
  const lampShade = new PropBatch('lamp', lampGeometry(), steel, false);
  const bulbMat = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: foundry ? 0xff6a2a : 0xffc46a, emissiveIntensity: 7, roughness: 0.4 }));
  const bulb = new PropBatch('bulb', lampBulbGeometry(), bulbMat, false);
  const coneMat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(foundry ? 0xff7a30 : 0xffc888).multiplyScalar(foundry ? 0.05 : 0.085), side: THREE.DoubleSide, fog: false, vertexColors: true });
  const lampCones = new PropBatch('lampcone', lightConeGeometry(), coneMat, false);
  const poolMask = reflectionMaskTexture();
  out.textureBytes += 256 * 256 * 4;
  // Wet patch: dark glossy puddle (reflects the env / window bank) + an additive lamp streak toward the camera.
  const puddleMat = fogify(new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  const puddles = new PropBatch('puddle', new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), puddleMat, false);
  const streakMat = new THREE.MeshBasicMaterial({ map: poolMask, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: foundry ? 0.18 : 0.3, color: foundry ? 0xff8a40 : 0xffd8a0, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const streaks = new PropBatch('lampstreak', new THREE.PlaneGeometry(2.2, 8).rotateX(-Math.PI / 2).translate(0, 0, 4), streakMat, false);
  const lampAt = (x: number, y: number, z: number): void => {
    lampShade.add(x, y, z);
    bulb.add(x, y, z);
    lampCones.add(x, y - 0.25, z, 0, 1.15, null, 0, y - 0.25 - floorY, 1.15);
    puddles.add(x + rng.range(-0.8, 0.8), floorY + 0.012, z + rng.range(-0.5, 1.0), rng.range(0, 6), rng.range(1.6, 2.8), null, 0, 1, rng.range(1.0, 1.8));
    streaks.add(x, floorY + 0.02, z, 0);
  };
  for (let x = x0 + 9; x < x1; x += 12) {
    const z = -10 + rng.range(-1.5, 1.5);
    const lampY = deckY + rng.range(5.5, 7.0);
    chains.add(x, roofY, z, 0, 1, null, 0, roofY - lampY, 1);
    lampAt(x, lampY, z);
  }
  // Foreground chains that slide past the camera (z 4.5–7): sparse (one per ≈40 m), never
  // inside a spawn keep-out, and they end ABOVE the rider's head (deck + 3 m) or carry a
  // lamp high up — a thin chain passing through the frame, never a pillar through the bike.
  const hookTyres = new PropBatch('hooktyre', bakeAO(tyreStackGeometry(), 0.9, 0.2), lib.get('tyre'));
  for (let x = x0 + 22; x < x1 - 10; x += rng.range(34, 48)) {
    const z = rng.range(4.5, 7);
    if (keepOut(x, 1)) continue;
    if (rng.next() < 0.6) {
      const endY = deckY + rng.range(3.0, 4.2);
      chains.add(x, roofY, z, 0, 1, null, 0, roofY - endY, 1);
      hookTyres.add(x, endY - 0.85, z, rng.range(0, 6), 1, null, Math.PI / 2, 1, 1);
    } else {
      const lampY = deckY + rng.range(5.0, 6.5);
      chains.add(x, roofY, z, 0, 1, null, 0, roofY - lampY, 1);
      lampShade.add(x, lampY, z);
      bulb.add(x, lampY, z);
    }
  }
  out.batches.push(hookTyres, lampCones, puddles, streaks);
  // Loose chains off the trusses, mid hall.
  for (let x = x0 + 5; x < x1; x += rng.range(5, 10)) chains.add(x, roofY - 1.4, rng.range(-16, -6), 0, 1, null, 0, rng.range(3, 8), 1);
  out.batches.push(chains, lampShade, bulb);

  // --- Container rows at three depths with gaps. Eight skin variants
  // (rust × logo × door side × stripe), each its own batch (8 calls, one program).
  const contMat = lib.get('container');
  const skinBatches: PropBatch[] = [];
  const contGeo = bakeAO(containerGeometry(), 2.59, 0.4);
  for (let i = 0; i < 8; i++) {
    const skin = containerSkin(rng, { rust: i % 3, logo: i, doorLeft: (i & 1) === 1, stripe: i % 4 === 3 }, art);
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
  // Far row against the wall: 2–4 high, 25 % gaps (foundry: stacks, chimneys and furnaces take the wall instead).
  for (let x = x0 + 6; x < x1 - 6; x += rng.range(6.6, 8.5)) {
    if (foundry || rng.next() < 0.25) continue;
    stack(x, -25 + rng.range(-0.8, 0.8), rng.int(2, 4), rng.next() < 0.2 ? Math.PI / 2 : 0);
  }
  // Mid row: 1–3 high, 35 % gaps, some turned.
  for (let x = x0 + 12; x < x1 - 8; x += rng.range(8, 13)) {
    if (rng.next() < (foundry ? 0.7 : 0.35)) continue;
    stack(x, -15.5 + rng.range(-1.5, 1.5), rng.int(1, 3), rng.next() < 0.35 ? Math.PI / 2 : rng.range(-0.2, 0.2));
  }
  // Near row: single containers, sparse, some turned end-on.
  for (let x = x0 + 20; x < x1 - 10; x += rng.range(14, 24)) {
    if (foundry || rng.next() < 0.3) continue;
    stack(x, -7.5 + rng.range(-1.0, 1.0), rng.next() < 0.3 ? 2 : 1, rng.next() < 0.5 ? Math.PI / 2 : rng.range(-0.3, 0.3));
  }
  out.batches.push(...skinBatches);

  // --- Racks, catwalk under the windows, floor clutter, foreground occluders.
  const racks = new PropBatch('rack', bakeAO(rackGeometry(), 4, 0.35), vc('rustSteel'), false); // against the wall: shadow-culled (z −28)
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
  // Foreground: low clutter (drums, tyres, pallets) at z 4.5–8 on the floor — 3 m below the
  // deck, so it slides past under the bike; no columns (round 8 rule), none near a spawn.
  for (let x = x0 + 14; x < x1 - 10; x += rng.range(14, 22)) {
    const r = rng.next();
    const z = rng.range(4.5, 8);
    if (keepOut(x, 1.5)) continue;
    if (r < 0.4) {
      const n = rng.int(2, 4);
      for (let k = 0; k < n; k++) drums.add(x + k * 0.62, floorY, z + rng.range(-0.3, 0.3), rng.range(0, 6), 1, k % 2 ? 0xd8d2c4 : 0xa42a1e);
    } else if (r < 0.7) tyres.add(x, floorY, z, 0);
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
  const scaffolds = new PropBatch('scaffold', bakeAO(scaffoldGeo, 4, 0.3), steel, false);
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

  // --- Wall decals from the art pack: posters and safety signs low on the back wall between
  // the bays, graffiti pieces on the far container row and the wall. One batch per texture.
  if (art) {
    const decal = (id: string, w: number, h: number, alpha: boolean): PropBatch | null => {
      const t = art.texture(id, true, false);
      if (!t) return null;
      out.textureBytes += art.entry(id)?.bytes ?? 0;
      const m = fogify(new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, transparent: alpha, alphaTest: alpha ? 0.3 : 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      return new PropBatch(`decal:${id}`, new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), m, false);
    };
    const posters = ['poster-trials-night', 'poster-tyres'].map((id) => decal(id, 1.2, 1.8, false)).filter((b): b is PropBatch => !!b);
    const signsArt = ['sign-hard-hat', 'sign-overhead-crane', 'sign-forklift', 'sign-exit'].map((id) => decal(id, 0.9, 0.9, false)).filter((b): b is PropBatch => !!b);
    const graffiti = ['graffiti-rise', 'graffiti-grind', 'graffiti-nofear', 'graffiti-skull', 'graffiti-tag-wall', 'graffiti-wheel'].map((id) => decal(id, 2.6, 2.6, true)).filter((b): b is PropBatch => !!b);
    for (let x = x0 + 9, i = 0; x < x1 - 6; x += 12, i++) {
      // Between the window banks (bay x 10–12 m) the brick is bare: posters + a sign there.
      const bx = x + 1.5 + rng.range(-0.5, 0.5);
      if (posters.length && rng.next() < 0.7) posters[i % posters.length]!.add(bx, floorY + rng.range(1.2, 2.4), wallZ + 0.06, 0, 1, null, rng.range(-0.04, 0.04));
      if (signsArt.length && rng.next() < 0.6) signsArt[(i * 3 + 1) % signsArt.length]!.add(bx + rng.range(-0.6, 0.6), floorY + rng.range(4.2, 5.4), wallZ + 0.06);
      if (graffiti.length && rng.next() < (foundry ? 0.25 : 0.45)) graffiti[(i * 5 + 2) % graffiti.length]!.add(x + rng.range(4, 8), floorY + rng.range(0.2, 0.8), wallZ + 0.06, 0, rng.range(0.9, 1.4));
    }
    out.batches.push(...posters, ...signsArt, ...graffiti);
  }

  // --- Light shafts from the main window banks, leaning along the sun.
  const shaft = shaftTexture();
  out.textureBytes += 256 * 256 * 4;
  const shaftMat = new THREE.MeshBasicMaterial({
    map: shaft,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    color: new THREE.Color(foundry ? 0xff5a1a : 0xffe8c8).multiplyScalar(foundry ? 0.03 : 0.075),
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
    // Round 7 foundry: molten channels with scrolling flow, pouring ladles under the crane
    // rail with spark fountains where the stream lands, furnaces with glowing mouths at
    // deck height, chimney stacks against the wall, more pipe runs and scaffold.
    const flow = moltenTexture(rng);
    out.textureBytes += 512 * 256 * 4 * 1.33;
    const pourTex = flow.clone();
    pourTex.rotation = Math.PI / 2;
    pourTex.center.set(0.5, 0.5);
    const molten = fogify(new THREE.MeshStandardMaterial({ map: flow, emissiveMap: flow, color: 0xffffff, emissive: 0xff7a22, emissiveIntensity: 4.0, roughness: 0.55 }));
    const pourMat = fogify(new THREE.MeshStandardMaterial({ map: pourTex, emissiveMap: pourTex, color: 0xffffff, emissive: 0xffa040, emissiveIntensity: 5.0, roughness: 0.5 }));
    const glow = fogify(new THREE.MeshStandardMaterial({ color: 0x1a0402, emissive: 0xff6a18, emissiveIntensity: 5.0, roughness: 0.6 }));
    out.flicker.push(molten, pourMat, glow);
    out.scroll.push({ tex: flow, vx: 0.07, vy: 0 }, { tex: pourTex, vx: 0, vy: -0.9 });
    const rust = vc('rustSteel');
    // Ladle: tapered bucket, trunnion bar, hanging block, pour lip.
    const ladleGeo = bakeAO(
      mergeGeometries(
        [
          new THREE.CylinderGeometry(1.15, 0.85, 1.9, 16, 1, true).translate(0, 0.95, 0),
          new THREE.CylinderGeometry(0.85, 0.85, 0.08, 16).translate(0, 0.04, 0),
          new THREE.TorusGeometry(1.15, 0.08, 6, 16).rotateX(Math.PI / 2).translate(0, 1.9, 0),
          new THREE.CylinderGeometry(0.09, 0.09, 3.0, 8).rotateZ(Math.PI / 2).translate(0, 1.5, 0),
          new THREE.BoxGeometry(0.5, 0.7, 0.3).translate(0, 3.3, 0),
          new THREE.BoxGeometry(0.12, 1.5, 0.12).translate(-1.45, 2.3, 0),
          new THREE.BoxGeometry(0.12, 1.5, 0.12).translate(1.45, 2.3, 0),
          new THREE.BoxGeometry(0.4, 0.2, 0.5).translate(1.2, 1.85, 0),
        ],
        false,
      )!,
      1.9,
      0.3,
    );
    const ladles = new PropBatch('ladle', ladleGeo, vc('darkSteel'));
    const melt = new PropBatch('melt', new THREE.CylinderGeometry(1.05, 1.05, 0.1, 16).translate(0, 1.8, 0), molten, false);
    const pours = new PropBatch('pour', new THREE.CylinderGeometry(0.24, 0.32, 1, 10).translate(0, -0.5, 0), pourMat, false);
    const moulds = new PropBatch('mould', bakeAO(new THREE.BoxGeometry(2.2, 0.6, 1.6).translate(0, 0.3, 0), 0.6, 0.3), rust);
    const mouldMelt = new PropBatch('mouldmelt', new THREE.BoxGeometry(1.8, 0.05, 1.2).translate(0, 0.62, 0), molten, false);
    const cables = new PropBatch('ladlecable', chainGeometry(), steel, false);
    // Furnace: dark block with a glowing mouth and a stack.
    const furnace = new PropBatch('furnace', bakeAO(mergeGeometries([new THREE.BoxGeometry(5, 4.2, 4).translate(0, 2.1, 0), new THREE.CylinderGeometry(0.6, 0.7, 6, 12).translate(-1.2, 7.2, -0.8), new THREE.BoxGeometry(5.4, 0.3, 4.4).translate(0, 4.35, 0)], false)!, 4.2, 0.35), vc('darkSteel'));
    const mouth = new PropBatch('furnacemouth', new THREE.BoxGeometry(1.8, 1.3, 0.1).translate(0, 1.3, 2.0), glow, false);
    const mouthPool = new PropBatch('furnacepool', new THREE.BoxGeometry(2.4, 0.04, 1.6).translate(0, 0.04, 3.0), molten, false);
    const plinth = new PropBatch('plinth', bakeAO(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 1, 0.35), vc('darkSteel'));
    const stacks = new PropBatch('stack', bakeAO(mergeGeometries([new THREE.CylinderGeometry(1.1, 1.4, 14, 14).translate(0, 7, 0), new THREE.TorusGeometry(1.25, 0.1, 6, 14).rotateX(Math.PI / 2).translate(0, 4, 0), new THREE.TorusGeometry(1.2, 0.1, 6, 14).rotateX(Math.PI / 2).translate(0, 9, 0)], false)!, 14, 0.3), rust, false);
    const pipes = new PropBatch('pipe', pipeGeometry(), rust, false);
    const pipeV = new PropBatch('pipev', new THREE.CylinderGeometry(0.35, 0.35, 1, 12).translate(0, 0.5, 0), rust, false);
    const railY = floorY + 12.2;
    for (let x = x0 + 8; x < x1; x += rng.range(9, 14)) {
      const r = rng.next();
      if (r < 0.45) {
        // Pouring ladle hanging under the crane rail, stream into a mould on the floor.
        const z = rng.range(-12, -7);
        const ly = deckY + rng.range(1.2, 3.0);
        cables.add(x, railY, z, 0, 1, null, 0, railY - (ly + 3.6), 1);
        ladles.add(x, ly, z, 0, 1, null, rng.range(-0.15, 0.15));
        melt.add(x, ly, z);
        const px = x + 1.3;
        const drop = ly + 1.85 - floorY - 0.62;
        pours.add(px, ly + 1.85, z, 0, 1, null, 0, drop, 1);
        moulds.add(px, floorY, z);
        mouldMelt.add(px, floorY, z);
        out.fountains.push({ x: px, y: floorY + 0.7, z });
      } else if (r < 0.75) {
        // Furnace on a plinth so the mouth glows at deck height.
        const z = rng.range(-11, -7.5);
        const py = deckY - 1.6;
        plinth.add(x, floorY, z, 0, 5.4, null, 0, Math.max(0.3, py - floorY), 4.4);
        furnace.add(x, py, z, 0);
        mouth.add(x, py, z);
        mouthPool.add(x, py, z);
        out.fountains.push({ x, y: py + 1.0, z: z + 2.1 });
      } else {
        stacks.add(x, floorY, wallZ + rng.range(2, 4));
        pipeV.add(x + 2, floorY, wallZ + 3, 0, 1, null, 0, 10, 1);
      }
      pipes.add(x + 4, floorY + rng.range(4, 9), rng.range(-14, -6), rng.range(-0.2, 0.2));
      if (rng.next() < 0.5) pipes.add(x - 3, floorY + rng.range(5, 10), rng.range(-20, -10), Math.PI / 2);
    }
    // Two molten channels: a wide one along the floor behind the track and a narrower one
    // in the foreground, both with raised steel edges so the melt sits in a trough.
    for (const [z, w, len] of [[-6.5, 2.0, span * 0.7], [6.2, 1.2, span * 0.5]] as const) {
      const channel = new THREE.Mesh(new THREE.PlaneGeometry(len, w, Math.max(2, Math.round(len / 8)), 1), molten);
      channel.rotation.x = -Math.PI / 2;
      channel.position.set(midX, floorY + 0.03, z);
      const uv = channel.geometry.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / 6, uv.getY(i));
      out.meshes.push(channel);
      for (const side of [-1, 1]) {
        const edge = new THREE.Mesh(bakeAO(new THREE.BoxGeometry(len, 0.35, 0.3).translate(0, 0.175, 0), 0.35, 0.2), rust);
        edge.position.set(midX, floorY, z + side * (w / 2 + 0.15));
        out.meshes.push(edge);
      }
    }
    out.batches.push(ladles, melt, pours, moulds, mouldMelt, cables, plinth, furnace, mouth, mouthPool, stacks, pipes, pipeV);
    // Round 8: the two point lights follow the camera (renderer: the two nearest melt sources
    // to the camera target), so the melt lights the structure wherever the bike is; the kit
    // adds none of its own. The floor channel adds a baked up-light in the vertex colours of
    // the near steel (see the terrain tint in biomeKit) — GI stands in for the rest.
  }
  return out;
}
