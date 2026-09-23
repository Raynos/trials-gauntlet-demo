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
import { SUPPORT_SLOT, supportLedgeY } from './deck';
import { assignSlots, planSetPieces } from './setPieces';
import { drawArt, pickId, tintMask, type ArtLibrary } from '../art/library';
import type { WorldDetail } from './props';
import { applySkinArray, skinArrayTexture, withSkinIndex } from './skinArray';
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
  pipeGeometry,
  rackGeometry,
  reflectionMaskTexture,
  signBoardGeometry,
  siteSignTexture,
  tarpGeometry,
  tarpTexture,
  trussGeometry,
  tyreStackGeometry,
  palletLowGeometry,
} from './props';

export interface HallOut {
  meshes: THREE.Mesh[];
  singles: THREE.Object3D[];
  batches: PropBatch[];
  flicker: THREE.MeshStandardMaterial[];
  lights: THREE.PointLight[];
  scroll: { tex: THREE.Texture; vx: number; vy: number }[];
  fountains: { x: number; y: number; z: number }[];
  /** High-bay lamp heads (round 10): the renderer parks two spot lights on the nearest ones. */
  lamps: { x: number; y: number; z: number }[];
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
const FOREGROUND_HANGS = false;

/** One 12 m × 16 m warehouse wall bay: brick, steel column, a 7 m tall window bank + clerestory. Returns albedo + emissive. */
function warehouseWall(rng: Rng, paneColor: string, brick: string, foundry = false): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture; bytes: number } {
  // Round 10 (texture budget): 512 px per 12 m bay (43 px/m; the wall is ≥ 30 m from any camera,
  // where a metre is ≈ 17 px) — 14.2 MB → 3.6 MB for albedo + emissive.
  const W = 512;
  const H = Math.round(W * (HALL.height / 12));
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
    // Round 10: the bank sits ABOVE eye level (sill 6.4 m = deck + 3.4 m) — the reference
    // halls put their windows in the upper third of the riding frame and the eye-level band is
    // dark brick behind the stacks. It used to start at 3.5 m and fill the frame behind the bike.
    bank(2.0, 6.4, 8.0, 6.2, 5, 7); // main bank: 6.4 → 12.6 m
    bank(2.0, 13.4, 8.0, 1.4, 5, 1); // clerestory: 13.4 → 14.8 m
  }
  // Steel column at the bay edge + girts.
  g.fillStyle = '#26282c';
  g.fillRect(0, 0, 0.4 * px, H);
  for (const y of [3.2, 10.8, 15.2]) g.fillRect(0, H - y * px, W, 0.18 * px);
  // Stencil on some bays, low on the wall.
  if (rng.next() < 0.6) {
    g.fillStyle = 'rgba(230,220,200,0.45)';
    g.font = `bold ${Math.floor(0.9 * px)}px Impact, "Arial Black", sans-serif`;
    g.fillText(rng.next() < 0.5 ? 'ROCKHOP' : 'BAY ' + rng.int(1, 9), 3 * px, H - 1.6 * px);
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
/** Tinted grime masks by (mask id, colour, strength) — the bitmaps never change once decoded. */
const tintCache = new Map<string, HTMLCanvasElement>();

function containerSkin(rng: Rng, v: { rust: number; logo: number; doorLeft: boolean; stripe: boolean }, art: ArtLibrary | null): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 512);
  g.fillStyle = '#d6d6d0';
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
      // Memoised per (mask, colour, strength): 8 skins share 4 tints (round 9: the art rebuild was a 0.9 s task on the loaded host).
      const key = `${id}|${color}|${strength.toFixed(3)}`;
      let tinted = tintCache.get(key);
      if (!tinted || tinted.width !== 512) {
        tinted = tintMask(bmp, 512, 512, color, strength);
        tintCache.set(key, tinted);
      }
      g.drawImage(tinted, x, y, w, h);
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

export function buildHall(track: CompiledTrack, biome: Biome, lib: MaterialLibrary, rng: Rng, floorY: number, x0: number, x1: number, art: ArtLibrary | null = null, detail: WorldDetail = 'high'): HallOut {
  const keepOut = foregroundKeepOut(track);
  const plan = planSetPieces(track, keepOut); // round 15: the playgrounds' tunnels / beats / every set piece (tracks.md §7.3)
  const foundry = biome.id === 'foundry';
  const out: HallOut = { meshes: [], singles: [], batches: [], flicker: [], lights: [], scroll: [], fountains: [], lamps: [], textureBytes: 0 };
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
      emissiveIntensity: foundry ? 0.6 : 0.55, // round 10: 0.95 made the window bank the brightest thing in every riding frame (a backlit wash); the lamps are the key now
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
  for (const z of [-24, 2]) rail.add(midX, floorY + 12.2, z, 0, span, null, 0, 1, 1); // round 11: the near rail was at z +12 — 6 m in front of the new high riding camera, a black band across the upper third of every frame
  // Crane bridge + trolley + hook at 45 % of the hall.
  {
    const bx = x0 + span * 0.45;
    const bridge = new THREE.Mesh(bakeAO(new THREE.BoxGeometry(1.0, 1.1, 26.5), 1.1, 0.2), vc('rustSteel'));
    bridge.position.set(bx, floorY + 13.05, -11);
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
  const coneMat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(foundry ? 0xff7a30 : 0xffc888).multiplyScalar(foundry ? 0.05 : 0.018), side: THREE.DoubleSide, fog: false, vertexColors: true });
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
    out.lamps.push({ x, y, z });
  };
  // Round 10: the main lamp row hangs just behind the deck (z −3.5) at deck + 5.5–6.5 m, so
  // each lamp's real spot pool (renderer `lampLights`) lands on the boards and the far ledge
  // clutter — the sodium pools are the second key, like the reference's D2 / D1 zones. A
  // second, sparser row stays over the mid hall (z −11) for the depth step.
  for (let x = x0 + 9; x < x1; x += 12) {
    const z = -3.5 + rng.range(-0.8, 0.8);
    const lampY = profileY(profile, x) + rng.range(5.4, 6.4);
    chains.add(x, roofY, z, 0, 1, null, 0, roofY - lampY, 1);
    lampAt(x, lampY, z);
  }
  for (let x = x0 + 15; x < x1; x += 24) {
    const z = -11 + rng.range(-1.5, 1.5);
    const lampY = deckY + rng.range(5.5, 7.0);
    chains.add(x, roofY, z, 0, 1, null, 0, roofY - lampY, 1);
    lampAt(x, lampY, z);
  }
  // Foreground chains that slide past the camera (z 4.5–7): sparse (one per ≈40 m), never
  // inside a spawn keep-out, and they end ABOVE the rider's head (deck + 3 m) or carry a
  // lamp high up — a thin chain passing through the frame, never a pillar through the bike.
  const hookTyres = new PropBatch('hooktyre', bakeAO(tyreStackGeometry(), 0.9, 0.2), lib.get('tyre'));
  // Round 11: the riding camera is now 7.5 m up and 18 m out (pitch 21°): anything at z 4.5–7
  // above deck + 1.5 sits on the line to the bike, so the foreground hooks / lamps are gone
  // (`FOREGROUND_HANGS` = false); the loop stays for the idle 3/4 view should it come back.
  for (let x = x0 + 22; x < x1 - 10 && FOREGROUND_HANGS; x += rng.range(34, 48)) {
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
      out.lamps.push({ x, y: lampY, z });
    }
  }
  out.batches.push(hookTyres, lampCones, puddles, streaks);
  // Loose chains off the trusses, mid hall.
  for (let x = x0 + 5; x < x1; x += rng.range(5, 10)) chains.add(x, roofY - 1.4, rng.range(-16, -6), 0, 1, null, 0, rng.range(3, 8), 1);
  out.batches.push(chains, lampShade, bulb);

  // --- Container rows at three depths with gaps. Eight skin variants
  // (rust × logo × door side × stripe), each its own batch (8 calls, one program).
  const skinBatches: PropBatch[] = [];
  const contGeo = bakeAO(containerGeometry(), 2.59, 0.4);
  const skins: THREE.CanvasTexture[] = [];
  for (let i = 0; i < 8; i++) {
    skins.push(containerSkin(rng, { rust: i % 3, logo: i, doorLeft: (i & 1) === 1, stripe: i % 4 === 3 }, art));
    out.textureBytes += 1024 * 512 * 4 * 1.33;
  }
  if (PropBatch.SKIN_ARRAY) {
    // Perf cut #4b: the eight skins are layers of one array texture on ONE material, each batch's
    // geometry carrying its layer index — `buildBatches` then bakes all eight into one draw per chunk
    // (8 → 1 on every visible chunk; the same bytes, the same texels, hardware repeat kept).
    const m = lib.derive('container');
    m.name = 'containerSkins';
    m.vertexColors = true;
    applySkinArray(m, skinArrayTexture(skins.map((t) => t.image as HTMLCanvasElement), skins[0]!));
    for (let i = 0; i < 8; i++) skinBatches.push(new PropBatch(`container${i}`, withSkinIndex(contGeo, i), m));
  } else {
    for (let i = 0; i < 8; i++) {
      // Round 11: every skin on its own derived material (skin 0 used to be painted onto the shared
      // library `container` material, which the texture generator then overwrote on the session's
      // first world and which leaked into every other biome's containers afterwards).
      const m = lib.derive('container');
      m.map = skins[i]!;
      m.needsUpdate = true;
      m.vertexColors = true;
      fogify(m);
      skinBatches.push(new PropBatch(`container${i}`, contGeo, m));
    }
  }
  const palette = [0x1f5a4a, 0x7a2418, 0x1e3d66, 0x46463e, 0x8a5a1e, 0x2e5a2a, 0x5a2a52, 0x2f4f6e, 0x6a6a62]; // round 10: deeper, more saturated (the pale set read as a grey wall at 18 m)
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
  // Round 9 (tri budget: foundry 743 k, b1 765 k with the shadow pass): the mid-hall clutter at
  // z < −4 (3 m below the deck, behind it) is drawn in shadow-culled batches with the low
  // pallet; only the foreground clutter (z > 4) casts.
  const palletGeo = bakeAO(palletLowGeometry(), 0.144, 0.3);
  const drumGeo = bakeAO(drumGeometry(), 0.88, 0.4);
  const tyreGeo = bakeAO(tyreStackGeometry(), 0.9, 0.4);
  const pallets = new PropBatch('pallet', palletGeo, vc('pallet'));
  const drums = new PropBatch('drum', drumGeo, vc('barrelRed'));
  const tyres = new PropBatch('tyres', tyreGeo, vc('tyre'));
  const palletsFar = new PropBatch('pallet-far', palletGeo, pallets.material, false);
  const drumsFar = new PropBatch('drum-far', drumGeo, drums.material, false);
  const tyresFar = new PropBatch('tyres-far', tyreGeo, tyres.material, false);
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
      for (let k = 0; k < n; k++) palletsFar.add(x + rng.range(-0.3, 0.3), floorY + k * 0.144, z + rng.range(-0.1, 0.1), rng.range(-0.1, 0.1));
    } else if (r < 0.7) {
      const z = rng.range(-11, -5);
      const n = rng.int(2, 5);
      for (let k = 0; k < n; k++) drumsFar.add(x + k * 0.62, floorY, z + rng.range(-0.3, 0.3), rng.range(0, 6), 1, k % 3 === 1 ? 0xd8d2c4 : k % 3 === 2 ? 0x244d8a : 0xa42a1e);
    } else if (r < 0.85) {
      tyresFar.add(x, floorY, rng.range(-9, -4.5), rng.range(0, 6));
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
  // Ask 61 ("in-run you get a floating placeholder quad"): the tarp was a flat 3 × 2.4 plane in one
  // flat colour, hung 3–6 m under the roof with nothing holding it — a placeholder to any eye. Now
  // it is the real prop (`tarpGeometry`: sag, folds, hem; `tarpTexture`: weave, eyelets, grime),
  // front-faced (every placement faces the camera) and completed with the library's neutral map
  // set so it shares the container skins' program instead of owning a DoubleSide / no-map variant.
  const tarpMat = fogify(new THREE.MeshStandardMaterial({ map: tarpTexture(track.def.seed), roughness: 0.92, vertexColors: true }));
  lib.complete(tarpMat);
  out.textureBytes += 256 * 256 * 4 * 1.33;
  const tarps = new PropBatch('tarp', tarpGeometry(3, 2.4, track.def.seed), tarpMat, true);
  const forkliftGeo = bakeAO((() => {
    const parts: THREE.BufferGeometry[] = [new THREE.BoxGeometry(1.1, 0.9, 1.0).translate(0, 0.75, 0), new THREE.BoxGeometry(0.9, 0.5, 0.9).translate(-0.2, 1.4, 0), new THREE.BoxGeometry(0.08, 2.6, 0.9).translate(0.75, 1.3, 0), new THREE.BoxGeometry(1.0, 0.05, 0.15).translate(1.3, 0.1, 0.3), new THREE.BoxGeometry(1.0, 0.05, 0.15).translate(1.3, 0.1, -0.3)];
    for (const x of [-0.35, 0.4]) for (const z of [-0.5, 0.5]) parts.push(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12).rotateX(Math.PI / 2).translate(x, 0.3, z));
    return mergeGeometries(parts, false)!;
  })(), 2.5, 0.35);
  const forklifts = new PropBatch('forklift', forkliftGeo, fogify(new THREE.MeshStandardMaterial({ color: 0xd8a020, roughness: 0.5, metalness: 0.3 })));
  // Ask 61 follow-up: the sign was a bare `hazardTape` box floating 2 m up — a flat yellow board at
  // distance. Now a printed board (`siteSignTexture`: frame, hazard border, legend, bolts, grime)
  // on two steel posts (`railPost`, merged into the steel draw). Its own batch as before: no new draw.
  const signMat = fogify(new THREE.MeshStandardMaterial({ map: siteSignTexture(track.def.seed), roughness: 0.55, vertexColors: true }));
  lib.complete(signMat);
  out.textureBytes += 512 * 320 * 4 * 1.33;
  const signs = new PropBatch('sign', signBoardGeometry(), signMat);
  for (let x = x0 + 10; x < x1 - 10; x += rng.range(9, 16)) {
    const r = rng.next();
    if (r < 0.25) reels.add(x, floorY, rng.range(-12, -6), rng.range(0, 6), rng.range(0.6, 1.0));
    else if (r < 0.45) scaffolds.add(x, floorY, rng.range(-14, -9), rng.range(-0.2, 0.2));
    else if (r < 0.65) {
      // Ask 61: hung from the truss line on two chains to its top corners (a tarp tied up out of
      // the way), not floating 3–6 m below the roof. The chains join the `chains` batch: no draw.
      const ty = roofY - 2.0 - rng.range(0.4, 1.6);
      const tz = rng.range(-16, -8);
      const ry = rng.range(-0.4, 0.4);
      tarps.add(x, ty, tz, ry, 1, [0x2a4d8a, 0x8a6a2a, 0x5a5a5a][rng.int(0, 2)]!);
      // A yaw of `ry` about y maps the corner at local +x to (cos ry, 0, −sin ry).
      for (const s of [-1, 1]) chains.add(x + s * 1.46 * Math.cos(ry), roofY - 1.4, tz - s * 1.46 * Math.sin(ry), 0, 1, null, 0, roofY - 1.4 - ty, 1);
    }
    else if (r < 0.8) forklifts.add(x, floorY, rng.range(-9, -5), rng.range(-0.5, 0.5) + (rng.next() < 0.5 ? Math.PI : 0));
    else {
      signs.add(x, floorY, wallZ + 2.2, 0);
      for (const dx of [-0.7, 0.7]) railPost.add(x + dx, floorY, wallZ + 2.17, 0, 1.6, null, 0, 2.55 / 1.1, 1.6); // posts to the board's top edge
    }
  }
  out.batches.push(racks, pallets, drums, tyres, palletsFar, drumsFar, tyresFar, cones, railTape, railPost, catwalk, reels, scaffolds, tarps, forklifts, signs);

  // --- Round 10: deck-level dressing (the density tier the riding frame actually sees).
  // Everything before this sits on the hall floor 3 m under the deck, where the 11–15° riding
  // camera cannot see it. The reference frames are dense because the clutter is AT the track:
  // barrels behind the plank, pallets on the container tops, paper and planks on every ledge.
  // Three shelves: (a) the far support ledge (z −1.7…−3.0, deck − 0.4) — anything, it pokes up
  // behind the deck; (b) the near ledge (z +1.7…+3.0) — only things ≤ 0.6 m tall, they never
  // reach the wheels; (c) adjacent containers on the floor at z ≈ −5.2 (mid tier) and z ≈ +5
  // (foreground, outside spawn keep-outs) with clutter on their roofs. Every prop that touches a
  // surface gets a contact-shadow decal; paper, gravel and bolts scatter on all three.
  const hangLamp = (x: number, y: number, z: number): void => {
    chains.add(x, roofY, z, 0, 1, null, 0, roofY - y, 1);
    lampAt(x, y, z);
  };
  dressDeckLevel(track, rng, floorY, keepOut, lib, out, skinBatches, pick, { pallets, drums, tyres, cones, reels, forklifts, palletGeo, drumGeo, tyreGeo, reelGeo, steel, foundry, x0, x1, tarps, hangLamp });

  if (!foundry) {
    // --- Round 11: one identifiable set piece per industrial course at 45 % of the ridden span,
    // and the start / finish dressed as an event (scaffold stands, banner gantry lamps, cones).
    // Everything sits BEHIND the line (z < 0) or below deck + 1.5 in front: the riding camera is
    // 7.5 m up and 18 m out, so a foreground post above the deck would cut through the bike.
    const pStart = profile[0]!.x;
    const pEnd = profile[profile.length - 1]!.x;
    const setX = pStart + (pEnd - pStart) * 0.45;
    const id = track.def.id;
    const rustVc = vc('rustSteel');
    const single = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      out.meshes.push(mesh);
      return mesh;
    };
    const drumSet = new PropBatch('setdrum', drumGeo, vc('barrelRed'));
    // The four industrial models, each a function of its x (round 15: a playground places all
    // four, one per free review segment; every other course keeps its id-gated single pick).
    const containerArch = (setX: number): void => {
      // Stacked-container arch behind the line: two 3-high piers at z −5.5 and z −12 with a
      // turned unit bridging them 7.8 m up.
      for (const pz of [-5.5, -12]) for (let k = 0; k < 3; k++) skinBatches[(k * 3 + (pz < -8 ? 1 : 0)) % 8]!.add(setX + (pz < -8 ? 0.2 : -0.2), floorY + k * 2.59, pz, Math.PI / 2 + rng.range(-0.02, 0.02), 1, pick());
      skinBatches[5]!.add(setX, floorY + 3 * 2.59, -8.75, Math.PI / 2, 1, 0xa8722a);
      hangLamp(setX - 4, floorY + 6.2, -3.9);
      hangLamp(setX + 4, floorY + 6.2, -3.9);
    };
    const craneHook = (setX: number): void => {
      // Shipping-crane hook over the far ledge holding a sling of three drums at deck + 3.
      const hy = deckY + 4.6;
      const cableMesh = single(chainGeometry(), steel, setX, roofY - 1.4, -2.6, false);
      cableMesh.scale.set(1, roofY - 1.4 - hy, 1);
      single(hookBlockGeometry(), rustVc, setX, hy - 0.7, -2.6);
      for (const [dx, dz] of [[-0.36, 0.15], [0.36, 0.15], [0, -0.32]] as const) drumSet.add(setX + dx, hy - 0.7 - 1.2, -2.6 + dz, rng.range(0, 6), 1, [0xa42a1e, 0x244d8a, 0xd8d2c4][Math.round(dx * 3 + 2) % 3]!);
      hangLamp(setX, floorY + 6.4, -3.9);
    };
    const forkliftLane = (setX: number): void => {
      // Forklift lane: four forklifts nose to tail on a hazard-taped lane at z −6 with pallet loads.
      const lane = new PropBatch('lanetape', new THREE.BoxGeometry(1, 0.01, 0.12), lib.get('hazardTape'), false);
      for (const lz of [-4.6, -7.4]) lane.add(setX, floorY + 0.006, lz, 0, 22, null, 0, 1, 1);
      for (let i = 0; i < 4; i++) {
        const fx = setX - 8 + i * 5.2;
        forklifts.add(fx, floorY, -6 + rng.range(-0.2, 0.2), rng.range(-0.08, 0.08));
        for (let k = 0; k < 3; k++) pallets.add(fx + 1.7, floorY + 0.15 + k * 0.144, -6, 0);
        cones.add(fx + 2.6, floorY, -4.3, rng.range(0, 6));
      }
      out.batches.push(lane);
      hangLamp(setX - 3, floorY + 6.0, -3.9);
      hangLamp(setX + 5, floorY + 6.0, -3.9);
    };
    const jibGantry = (setX: number): void => {
      // b1-first-ride (default): a jib gantry — a leg at z −6.5 carrying a beam out over the
      // line to z +2 at floor + 10.5, a tie back to the roof truss, hook block over the deck,
      // banners hung from the beam behind the line.
      single(bakeAO(columnGeometry(), 1, 0.35), steel, setX, floorY, -6.5).scale.set(1.4, roofY - floorY - 5, 1.4);
      const jib = single(bakeAO(beamGeometry(0.5, 0.7), 0.7, 0.2), rustVc, setX, floorY + 10.5, -2.25);
      jib.rotation.y = Math.PI / 2;
      jib.scale.set(8.5, 1, 1);
      single(chainGeometry(), steel, setX, floorY + 10.5, 1.6, false).scale.set(1, floorY + 10.5 - (deckY + 3.4), 1);
      single(hookBlockGeometry(), rustVc, setX, deckY + 3.4 - 0.7, 1.6);
      for (const bz of [-5.5, -4.0]) tarps.add(setX + (bz < -5 ? -1.2 : 1.2), floorY + 10.3, bz, 0, 1, bz < -5 ? 0xd8a020 : 0xa42a1e, 0, 0.8, 1);
      hangLamp(setX - 4, floorY + 6.2, -3.9);
      hangLamp(setX + 4, floorY + 6.2, -3.9);
    };
    if (plan.playground && plan.slots.length) {
      // p1-container-yard: every industrial model. The container arch prefers the container-row
      // segment (the doc's 160–272 "kicker 2 through the container rows"); the rest spread.
      const [xJib, xArch, xFork, xHook] = assignSlots(plan.slots, [null, 216, null, null]) as [number, number, number, number];
      jibGantry(xJib);
      containerArch(xArch);
      forkliftLane(xFork);
      craneHook(xHook);
    } else if (id === 'b2-lean-back') containerArch(setX);
    else if (id === 'b3-kicker-row') craneHook(setX);
    else if (id === 'm1-hop-up') forkliftLane(setX);
    else jibGantry(setX);
    // Round 15: the scaffold tunnel ("Under the Stacks", tracks.md §7.3 item 1) — a covered
    // stretch open on the camera side (+z): two-high scaffold towers make the far wall at z −3.4
    // and single near posts at z +3.4 every 6 m, a plywood roof deck at deck + `height` with
    // steel ledgers and a hazard-taped near edge, containers stacked on the roof (the stacks) and
    // hanging lamps under it (`lit`). The camera sits at +z looking in, so the bike stays visible.
    for (const t of plan.playground ? plan.tunnels.filter((t) => t.style === 'scaffold') : []) {
      const len = t.x1 - t.x0;
      const cx = (t.x0 + t.x1) / 2;
      const deck = Math.max(profileY(profile, t.x0), profileY(profile, cx), profileY(profile, t.x1));
      const roof = deck + t.height;
      const hz = t.depth / 2 + 0.4;
      const towers = new PropBatch('tunnelscaffold', bakeAO(scaffoldGeo, 4, 0.3), steel, false);
      const nTow = Math.max(2, Math.round(len / 6));
      for (let i = 0; i <= nTow; i++) {
        const x = t.x0 + (len * i) / nTow;
        // Far wall: towers stacked from the hall floor to the roof; near side: one thin post per bay.
        for (let y = floorY; y < roof - 0.5; y += 4) towers.add(x, y, -hz, 0, 1, null, 0, Math.min(1, (roof - y) / 4), 1);
        railPost.add(x, deck - 0.02, hz, 0, 1, null, 0, (roof - deck) / 1.1, 1);
      }
      const plank = single(bakeAO(new THREE.BoxGeometry(1, 0.08, 1), 0.08, 0.2), lib.get('plywood'), cx, roof, 0);
      plank.scale.set(len + 1.2, 1, hz * 2 + 0.6);
      for (const bz of [-hz, 0, hz]) {
        const ledger = single(bakeAO(beamGeometry(0.16, 0.22), 0.22, 0.2), steel, cx, roof - 0.15, bz, false);
        ledger.scale.set(len + 1.2, 1, 1);
      }
      railTape.add(cx, roof + 0.05, hz + 0.12, 0, len + 1.2, null, 0, 1, 1);
      // The stacks: containers lengthwise on the roof, two rows, a turned one on top.
      for (let x = t.x0 + 3.5, k = 0; x < t.x1 - 2.5; x += 6.5, k++) {
        skinBatches[(k * 5 + 1) % 8]!.add(x, roof + 0.04, -2.2, rng.range(-0.02, 0.02), 1, pick());
        if (k % 2 === 0) skinBatches[(k * 3 + 4) % 8]!.add(x + 0.3, roof + 0.04, 0.9, rng.range(-0.02, 0.02), 1, pick());
        if (k % 2 === 1) skinBatches[(k * 7 + 2) % 8]!.add(x, roof + 2.63, -1.0, rng.range(-0.02, 0.02), 1, pick());
      }
      if (t.lit) {
        for (let x = t.x0 + 4; x < t.x1 - 2; x += 8) {
          chains.add(x, roof, -1.8, 0, 1, null, 0, 0.9, 1);
          lampAt(x, roof - 0.9, -1.8);
        }
      }
      out.batches.push(towers);
    }
    // Start / finish as an event: a scaffold stand with a tarp banner behind each gate at
    // z −5.5, cones along the far ledge, a lamp over each gate, drums as barrier weights.
    const scaffolds2 = new PropBatch('standscaffold', bakeAO(scaffoldGeo, 4, 0.3), steel, false);
    for (const gx of [pStart + 2, track.def.finishX + 3]) {
      for (const dx of [-3.2, -1.0, 1.2, 3.4]) scaffolds2.add(gx + dx, floorY, -5.6, 0);
      tarps.add(gx, floorY + 4.0, -4.9, 0, 2.2, gx < setX ? 0x2a4d8a : 0xa42a1e, 0, 0.55, 1);
      hangLamp(gx, floorY + 6.6, -3.9);
      const ledge = supportLedgeY(profile, floorY, gx);
      if (ledge !== null) for (const dx of [-2.5, 0, 2.5]) cones.add(gx + dx, ledge, -2.3, rng.range(0, 6));
      for (const dx of [-4.5, 4.5]) drumSet.add(gx + dx, floorY, -4.4, rng.range(0, 6), 1, 0xd8d2c4);
    }
    out.batches.push(drumSet, scaffolds2);
  }

  // --- Wall decals from the art pack: posters and safety signs low on the back wall between
  // the bays, graffiti pieces on the far container row and the wall. One batch per texture.
  // Round 12: not built on `low` detail (12 textures ≈ 15 MB and 9–12 calls for 2-tri quads).
  if (art && detail !== 'low') {
    const decal = (id: string, w: number, h: number, alpha: boolean): PropBatch | null => {
      const t = art.texture(id, true, false);
      if (!t) return null;
      out.textureBytes += art.entry(id)?.bytes ?? 0;
      const m = fogify(new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, transparent: alpha, alphaTest: alpha ? 0.3 : 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      return new PropBatch(`decal:${id}`, new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), m, false);
    };
    const posters = ['poster-tyres'].map((id) => decal(id, 1.2, 1.8, false)).filter((b): b is PropBatch => !!b);
    const signsArt = ['sign-hard-hat', 'sign-overhead-crane', 'sign-forklift', 'sign-exit'].map((id) => decal(id, 0.9, 0.9, false)).filter((b): b is PropBatch => !!b);
    const graffiti = ['graffiti-grind', 'graffiti-skull', 'graffiti-tag-wall', 'graffiti-wheel'].map((id) => decal(id, 2.6, 2.6, true)).filter((b): b is PropBatch => !!b);
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
    const top = new THREE.Vector3(wx, floorY + 9.5, wallZ + 0.3);
    q.position.copy(top).addScaledVector(sunDir, len / 2);
    q.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), sunDir);
    q.rotateY(0.3);
    q.renderOrder = 5;
    q.name = 'fx:shaft'; // round 12: hidden on `low` (8 additive full-height quads = the hall's biggest overdraw)
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
    const pourMat = fogify(new THREE.MeshStandardMaterial({ map: pourTex, emissiveMap: pourTex, color: 0xffffff, emissive: 0xffa040, emissiveIntensity: 3.5, roughness: 0.5 })); // round 11: 5.0 read as white columns at exposure 1.7
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
    // Round 11 (foundry warm read): melt sources AT deck level. Slag pots on the far support
    // ledge every ≈ 11 m — a squat crucible with a glowing top — so a riding frame always has
    // two or more sources within the melt lights' reach and the deck itself gets the up-light.
    const potGeo = bakeAO(mergeGeometries([new THREE.CylinderGeometry(0.62, 0.48, 0.9, 14, 1, true).translate(0, 0.45, 0), new THREE.CylinderGeometry(0.48, 0.48, 0.06, 14).translate(0, 0.03, 0), new THREE.TorusGeometry(0.62, 0.05, 6, 14).rotateX(Math.PI / 2).translate(0, 0.9, 0)], false)!, 0.9, 0.3);
    const pots = new PropBatch('slagpot', potGeo, vc('darkSteel'));
    // The pots are 2.5 m from the deck: as real point-light sources (140 cd, decay 2) they blew
    // the bike out to white when it passed one, so they bake up-light only (`bakeSources`).
    const bakeSources: { x: number; y: number; z: number }[] = [];
    const potMelt = new PropBatch('slagmelt', new THREE.CylinderGeometry(0.56, 0.56, 0.06, 14).translate(0, 0.86, 0), molten, false);
    const profStart = profile[0]!.x;
    const profEnd = profile[profile.length - 1]!.x;
    for (let x = profStart + 6; x < profEnd - 4; x += rng.range(9, 13)) {
      const ledge = supportLedgeY(profile, floorY, x);
      if (ledge === null) continue;
      const deck = profileY(profile, x);
      if (deck - ledge > 2.4) continue;
      const pz = rng.range(-2.7, -2.2);
      const px = x + rng.range(-0.5, 0.5);
      pots.add(px, ledge, pz, rng.range(0, 6));
      potMelt.add(px, ledge, pz);
      bakeSources.push({ x: px, y: ledge + 0.95, z: pz });
    }
    out.batches.push(pots, potMelt);

    // Round 11: one set piece per foundry course, at 45 % of the ridden span, and a sparks /
    // warning-light dressing at the start and finish (the gates kit adds the jets).
    const setX = profStart + (profEnd - profStart) * 0.45;
    const id = track.def.id;
    const beaconMat = fogify(new THREE.MeshStandardMaterial({ color: 0x2a0806, emissive: 0xff2a10, emissiveIntensity: 6, roughness: 0.4 }));
    out.flicker.push(beaconMat);
    const beacons = new PropBatch('beacon', new THREE.SphereGeometry(0.14, 10, 8).translate(0, 0.14, 0), beaconMat, false);
    const beaconPost = new PropBatch('beaconpost', new THREE.CylinderGeometry(0.04, 0.05, 1, 6).translate(0, 0.5, 0), steel, false);
    for (const gx of [profStart + 1.5, track.def.finishX + 2]) {
      for (const gz of [-2.2, 2.2]) {
        const gy = profileY(profile, gx);
        beaconPost.add(gx, gy, gz, 0, 1, null, 0, 1.6, 1);
        beacons.add(gx, gy + 1.6, gz);
      }
    }
    out.batches.push(beacons, beaconPost);
    // The four foundry models, each a function of its x (round 15: a playground places all four,
    // one per free review segment; every other course keeps its id-gated single pick).
    const rollingMill = (setX: number): void => {
      // Rolling mill: a housing either side of the line at z −8 with two big rollers and a
      // glowing slab coming through at deck height.
      const housing = new THREE.Mesh(bakeAO(new THREE.BoxGeometry(2.2, 5.2, 3.6).translate(0, 2.6, 0), 5.2, 0.35), rust);
      housing.position.set(setX - 4.2, floorY, -8);
      housing.castShadow = true;
      out.meshes.push(housing);
      const housing2 = housing.clone();
      housing2.position.x = setX + 4.2;
      out.meshes.push(housing2);
      for (const ry of [floorY + 2.0, floorY + 3.3]) {
        const roller = new THREE.Mesh(bakeAO(new THREE.CylinderGeometry(0.55, 0.55, 6.6, 18).rotateZ(Math.PI / 2), 1.1, 0.2), vc('darkSteel'));
        roller.position.set(setX, ry, -8);
        out.meshes.push(roller);
      }
      const slab = new THREE.Mesh(new THREE.BoxGeometry(22, 0.16, 1.4), molten);
      slab.position.set(setX, floorY + 2.65, -8);
      out.meshes.push(slab);
      for (const dx of [-9, -3, 3, 9]) out.fountains.push({ x: setX + dx, y: floorY + 2.9, z: -8 });
    };
    const pipeRack = (setX: number, len = 48): void => {
      // Pipe rack: five big pipes on A-frames running `len` m behind the line at z −6.5, with a
      // glowing melt launder on top.
      const rack = new PropBatch('piperack', bakeAO(mergeGeometries([new THREE.BoxGeometry(0.2, 4.6, 0.2).translate(-1.4, 2.3, 0), new THREE.BoxGeometry(0.2, 4.6, 0.2).translate(1.4, 2.3, 0), new THREE.BoxGeometry(3.2, 0.18, 0.24).translate(0, 4.5, 0), new THREE.BoxGeometry(3.2, 0.18, 0.24).translate(0, 2.9, 0)], false)!, 4.6, 0.3), rust, false);
      const bigPipe = new PropBatch('bigpipe', new THREE.CylinderGeometry(0.34, 0.34, 1, 12).rotateZ(Math.PI / 2).translate(0.5, 0, 0), rust, false);
      for (let x = setX - len / 2; x <= setX + len / 2; x += 6) rack.add(x, floorY, -6.5, 0);
      for (const [py, pz] of [[4.9, -7.4], [4.9, -6.6], [4.9, -5.8], [3.3, -7.2], [3.3, -6.0]] as const) bigPipe.add(setX - len / 2, floorY + py, pz, 0, len, [0x6b5a4c, 0x4a4a48, 0x7a3a2a, 0x5a5a52, 0x6b5a4c][Math.round(pz * 10) % 5]!, 0, 1, 1);
      const launder = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.5), molten);
      launder.position.set(setX, floorY + 5.32, -6.6);
      out.meshes.push(launder);
      for (let dx = -len / 2 + 6; dx < len / 2; dx += 12) out.fountains.push({ x: setX + dx, y: floorY + 5.5, z: -6.6 });
      out.batches.push(rack, bigPipe);
    };
    const furnaceWall = (setX: number): void => {
      // Furnace wall: three furnaces shoulder to shoulder at z −8, mouths open to the line.
      for (const dx of [-6.5, 0, 6.5]) {
        const py = deckY - 1.6;
        plinth.add(setX + dx, floorY, -8, 0, 5.4, null, 0, Math.max(0.3, py - floorY), 4.4);
        furnace.add(setX + dx, py, -8, 0);
        mouth.add(setX + dx, py, -8);
        mouthPool.add(setX + dx, py, -8);
        out.fountains.push({ x: setX + dx, y: py + 1.0, z: -5.9 });
      }
    };
    const ladleOverLine = (setX: number): void => {
      // h3-fire-line (and any other foundry course): a pouring ladle hung over the line from
      // the crane rail, its stream landing in a mould just behind the far ledge.
      const ly = profileY(profile, setX) + 3.6;
      cables.add(setX, railY, -1.4, 0, 1, null, 0, railY - (ly + 3.6), 1);
      ladles.add(setX, ly, -1.4, 0, 1.25, null, 0.22);
      melt.add(setX, ly, -1.4, 0, 1.25);
      const px = setX + 1.7;
      const drop = ly + 2.1 - floorY - 0.62;
      pours.add(px, ly + 2.1, -3.6, 0, 1.2, null, 0, drop, 1.2);
      moulds.add(px, floorY, -3.6, 0, 1.3);
      mouldMelt.add(px, floorY, -3.6, 0, 1.3);
      out.fountains.push({ x: px, y: floorY + 0.8, z: -3.6 }, { x: setX, y: ly + 1.9, z: -1.4 });
    };
    if (plan.playground && plan.slots.length) {
      // p5-foundry-floor: every foundry model, one per free review segment; the ladle wants the
      // finale ("the wave home under the pour"), the 48 m rack a long clear stretch.
      const [xMill, xRack, xWall, xLadle] = assignSlots(plan.slots, [null, null, null, track.def.finishX - 25]) as [number, number, number, number];
      rollingMill(xMill);
      pipeRack(xRack, 36);
      furnaceWall(xWall);
      ladleOverLine(xLadle);
      // `fire` beat ("The Melt", 190–196): the melt emphasis over the fire gap — a second ladle
      // pouring over the line 5 m before the gap (its two spark sources are what the camera-following
      // melt lights park on there). No deck-level sources: a 140 cd point 1 m from the line blows
      // the bike out to white (the slag-pot lesson above).
      for (const f of plan.fires) ladleOverLine(f.x - 5);
      // `balance` beat ("The Trough", 370–379): the molten channel the see-saw bridges — a short
      // trough on both support ledges (≤ 0.6 m proud, so the near one never reaches the wheels),
      // with the kit's raised steel edges, and melt sources at its ends.
      for (const b of plan.balances) {
        const len = Math.max(10, b.x1 - (2 * b.x - b.x1) + 6);
        const deck = profileY(profile, b.x);
        const ledge = supportLedgeY(profile, floorY, b.x);
        for (const z of [-2.4, 2.4]) {
          const ty = ledge ?? deck - 0.6;
          const channel = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.0, Math.max(2, Math.round(len / 4)), 1), molten);
          channel.rotation.x = -Math.PI / 2;
          channel.position.set(b.x, ty + 0.22, z);
          const uv = channel.geometry.getAttribute('uv') as THREE.BufferAttribute;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / 6, uv.getY(i));
          out.meshes.push(channel);
          for (const side of [-1, 1]) {
            const edge = new THREE.Mesh(bakeAO(new THREE.BoxGeometry(len, 0.35, 0.3).translate(0, 0.175, 0), 0.35, 0.2), rust);
            edge.position.set(b.x, ty, z + side * 0.65);
            out.meshes.push(edge);
          }
          if (z < 0) for (const dx of [-len / 2 + 1, len / 2 - 1]) out.fountains.push({ x: b.x + dx, y: ty + 0.4, z });
        }
      }
      // The pipe duct ("The Duct", 210–240, tracks.md §7.3 item 1): a covered stretch open on the
      // camera side (+z) — vertical pipes as posts at z ±(depth/2 + 0.4) every 6 m, the kit's
      // 8 m pipe runs side by side as the roof at deck + `height`, a far wall of pipe runs at
      // half height, and the hall lamps under the roof (`lit`) in the foundry's orange.
      for (const t of plan.tunnels.filter((t) => t.style === 'pipe')) {
        const len = t.x1 - t.x0;
        const cx = (t.x0 + t.x1) / 2;
        const deck = Math.max(profileY(profile, t.x0), profileY(profile, cx), profileY(profile, t.x1));
        const roof = deck + t.height;
        const hz = t.depth / 2 + 0.4;
        const nBay = Math.max(2, Math.round(len / 6));
        for (let i = 0; i <= nBay; i++) {
          const x = t.x0 + (len * i) / nBay;
          pipeV.add(x, floorY, -hz, 0, 1, null, 0, roof + 0.35 - floorY, 1);
          pipeV.add(x, deck - 0.3, hz, 0, 0.6, null, 0, roof + 0.35 - (deck - 0.3), 0.6);
        }
        // Roof: pipe runs along x, 0.8 m apart across the depth, chained end to end in 8 m units.
        for (let z = -hz + 0.4; z <= hz - 0.3; z += 0.8) {
          for (let x = t.x0 + 4; x < t.x1 + 4; x += 8) pipes.add(Math.min(x, t.x1 - 4), roof + 0.35, z, 0, 1, [0x6b5a4c, 0x4a4a48, 0x7a3a2a][Math.round(z * 2.5 + 20) % 3]!);
        }
        // Far wall: two tiers of pipe runs behind the posts.
        for (const y of [deck + 1.2, deck + 2.6, deck + 4.0]) for (let x = t.x0 + 4; x < t.x1 + 4; x += 8) pipes.add(Math.min(x, t.x1 - 4), y, -hz - 0.5, 0);
        const beam = new THREE.Mesh(bakeAO(beamGeometry(0.2, 0.3), 0.3, 0.2), steel);
        beam.position.set(cx, roof + 0.05, hz + 0.1);
        beam.scale.set(len + 1, 1, 1);
        out.meshes.push(beam);
        if (t.lit) {
          for (let x = t.x0 + 4; x < t.x1 - 2; x += 8) {
            chains.add(x, roof, -1.6, 0, 1, null, 0, 0.8, 1);
            lampAt(x, roof - 0.8, -1.6);
          }
        }
      }
      // `pipe` arch (the exit duct at 432): a short duct portal over the line — two pipe posts
      // and three pipe runs crossing the deck along z on a steel header, no walls.
      for (const a of plan.arches.filter((a) => a.style === 'pipe')) {
        const gy = profileY(profile, a.x);
        const hz = a.depth / 2 + 0.4;
        pipeV.add(a.x, floorY, -hz, 0, 1, null, 0, gy + a.height + 0.4 - floorY, 1);
        pipeV.add(a.x, gy - 0.3, hz, 0, 0.6, null, 0, a.height + 0.7, 0.6);
        for (const dx of [-0.8, 0, 0.8]) pipes.add(a.x + dx, gy + a.height + 0.35, 0, Math.PI / 2, 1, [0x6b5a4c, 0x4a4a48, 0x7a3a2a][Math.round(dx * 1.25 + 1)]!, 0, 1, 1);
        const header = new THREE.Mesh(bakeAO(beamGeometry(0.2, 0.3), 0.3, 0.2), steel);
        header.position.set(a.x, gy + a.height + 0.05, 0);
        header.rotation.y = Math.PI / 2;
        header.scale.set(hz * 2 + 0.6, 1, 1);
        out.meshes.push(header);
      }
    } else if (id.startsWith('m3-')) rollingMill(setX); // retired medium course (id literal kept out of the store bundle)
    else if (id === 'x2-pipe-dream') pipeRack(setX);
    else if (id.startsWith('x3-')) furnaceWall(setX); // the retired extreme course (its id literal stays out of the store bundle)
    else ladleOverLine(setX);
    out.batches.push(ladles, melt, pours, moulds, mouldMelt, cables, plinth, furnace, mouth, mouthPool, stacks, pipes, pipeV);
    // Round 11: bake the melt's up-light into the per-instance colour of everything within
    // 10 m of a source (GI stand-in; the four camera-following melt lights do the real work).
    for (const b of out.batches) {
      b.tintNear(out.fountains, 10, [1.75, 1.22, 0.86]);
      b.tintNear(bakeSources, 6, [1.6, 1.2, 0.9], 0.7);
    }
  }
  return out;
}


// ---------------------------------------------------------------------------
// Round 10: deck-level dressing
// ---------------------------------------------------------------------------

/** Radial falloff disc: alpha 1 at the centre → 0 at the rim (contact shadows, oil, puddles). */
function radialTexture(power = 1.6): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const dx = (x + 0.5) / 64 - 1;
      const dy = (y + 0.5) / 64 - 1;
      const r = Math.min(1, Math.hypot(dx, dy));
      const a = Math.pow(1 - r, power) * 255;
      const k = (y * 128 + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = a;
      img.data[k + 3] = a;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, false, false);
}

interface DressKit {
  pallets: PropBatch;
  drums: PropBatch;
  tyres: PropBatch;
  cones: PropBatch;
  reels: PropBatch;
  forklifts: PropBatch;
  palletGeo: THREE.BufferGeometry;
  drumGeo: THREE.BufferGeometry;
  tyreGeo: THREE.BufferGeometry;
  reelGeo: THREE.BufferGeometry;
  steel: THREE.MeshStandardMaterial;
  foundry: boolean;
  x0: number;
  x1: number;
  /** Round 11: a hanging tarp plane batch (origin at the top edge) and a hung lamp (chain from the truss + head + bulb + pool). */
  tarps: PropBatch;
  hangLamp: (x: number, y: number, z: number) => void;
}

function dressDeckLevel(track: CompiledTrack, rng: Rng, floorY: number, keepOut: (x: number, hw?: number) => boolean, lib: MaterialLibrary, out: HallOut, skins: PropBatch[], pickColor: () => number, kit: DressKit): void {
  const profile = track.def.profile;
  const { foundry } = kit;
  const density = foundry ? 0.6 : 1;
  const vc = (name: string): THREE.MeshStandardMaterial => {
    const m = lib.get(name);
    if (!m.vertexColors) {
      m.vertexColors = true;
      m.needsUpdate = true;
    }
    return fogify(m);
  };
  // Contact shadows: one batch, a black radial disc a hair above every surface a prop stands on.
  const radial = radialTexture(1.8);
  out.textureBytes += 128 * 128 * 4;
  // `map` (not `alphaMap`) carries the falloff: the map's alpha is the opacity and the define set stays the lamp-streak one — no new program.
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: radial, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const shadows = new PropBatch('contactshadow', new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), shadowMat, false);
  const shadowAt = (x: number, y: number, z: number, r: number, sz = r): void => shadows.add(x, y + 0.008, z, rng.range(0, 6), r, null, 0, 1, sz);
  // Oil stains: dark, glossy, catch the lamps; puddles on the ledges reflect the window bank.
  const oilMat = fogify(new THREE.MeshStandardMaterial({ color: 0x08070a, roughness: 0.22, metalness: 0.4, map: radialTexture(0.9), transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  const oil = new PropBatch('oilstain', new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), oilMat, false);
  // Deck-level prop geometry (all cheap boxes / lathes, AO baked, origin bottom centre).
  const crateGeo = bakeAO(mergeGeometries([new THREE.BoxGeometry(0.9, 0.72, 0.7).translate(0, 0.36, 0), new THREE.BoxGeometry(0.94, 0.06, 0.74).translate(0, 0.03, 0), new THREE.BoxGeometry(0.94, 0.06, 0.74).translate(0, 0.69, 0), new THREE.BoxGeometry(0.06, 0.72, 0.74).translate(0, 0.36, 0)], false)!, 0.72, 0.35);
  const crates = new PropBatch('crate', crateGeo, vc('plywood'));
  const bundleGeo = bakeAO(
    mergeGeometries(
      [
        ...[0, 1, 2].flatMap((row) => [0, 1].map((k) => new THREE.BoxGeometry(2.4, 0.045, 0.22).translate(0, 0.0225 + row * 0.05, -0.12 + k * 0.24))),
        new THREE.BoxGeometry(0.05, 0.16, 0.5).translate(-0.9, 0.08, 0),
        new THREE.BoxGeometry(0.05, 0.16, 0.5).translate(0.9, 0.08, 0),
      ],
      false,
    )!,
    0.16,
    0.3,
  );
  const bundles = new PropBatch('plankbundle', bundleGeo, vc('plank'));
  const plankEndGeo = new THREE.BoxGeometry(0.9, 0.045, 0.22).translate(0, 0.0225, 0);
  const plankEnds = new PropBatch('plankend', bakeAO(plankEndGeo, 0.045, 0.2), vc('plank'));
  const cartGeo = bakeAO(
    mergeGeometries(
      [
        new THREE.BoxGeometry(0.8, 0.7, 0.5).translate(0, 0.5, 0),
        new THREE.BoxGeometry(0.84, 0.05, 0.54).translate(0, 0.87, 0),
        new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6).translate(-0.44, 0.75, 0),
        new THREE.BoxGeometry(0.03, 0.03, 0.5).translate(-0.44, 1.2, 0),
        ...[-0.3, 0.3].flatMap((x) => [-0.22, 0.22].map((z) => new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8).rotateX(Math.PI / 2).translate(x, 0.07, z))),
      ],
      false,
    )!,
    0.9,
    0.3,
  );
  const carts = new PropBatch('toolcart', cartGeo, vc('barrelRed'));
  const bottleGeo = bakeAO(mergeGeometries([new THREE.CylinderGeometry(0.115, 0.115, 1.3, 10).translate(0, 0.65, 0), new THREE.SphereGeometry(0.115, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.3, 0), new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6).translate(0, 1.45, 0)], false)!, 1.4, 0.35);
  const bottles = new PropBatch('gasbottle', bottleGeo, vc('darkSteel'));
  const tyreFlat = new PropBatch('tyreflat', bakeAO(new THREE.TorusGeometry(0.28, 0.1, 6, 14).rotateX(Math.PI / 2).translate(0, 0.1, 0), 0.2, 0.2), vc('tyre'));
  const drumLying = new PropBatch('drumlying', bakeAO(drumGeometry().rotateZ(Math.PI / 2).translate(0, 0.29, 0), 0.58, 0.3), vc('barrelRed'));
  const paper = new PropBatch('paper', new THREE.PlaneGeometry(0.5, 0.7).rotateX(-Math.PI / 2), fogify(new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })), false);
  const gravel = new PropBatch('gravel', bakeAO(new THREE.IcosahedronGeometry(0.07, 0), 0.14, 0.4), fogify(new THREE.MeshStandardMaterial({ color: 0x5a544c, roughness: 0.95 })), false);
  const bolts = new PropBatch('bolt', new THREE.CylinderGeometry(0.028, 0.028, 0.03, 6).translate(0, 0.015, 0), kit.steel, false);
  const chainMat = kit.steel;
  const hangChains = new PropBatch('hangchain', chainGeometry(), chainMat, false);
  const hooks = new PropBatch('hook', hookBlockGeometry(), vc('rustSteel'));
  const rackGeo = bakeAO(rackGeometry(), 4, 0.35);
  const racksNear = new PropBatch('racknear', rackGeo, vc('rustSteel'));
  const palette = [0xa42a1e, 0x244d8a, 0xd8d2c4, 0x3d6b3a, 0x6b6b60, 0xe0a020];
  const drumColor = (): number => palette[rng.int(0, palette.length - 1)]!;

  const roofY = floorY + HALL.height;
  const start = profile[0]!.x;
  const end = profile[profile.length - 1]!.x;

  /** Scatter on a horizontal patch: paper sheets, gravel, bolts (density per m²). */
  const scatter = (x: number, y: number, z: number, w: number, d: number, k = 1): void => {
    const area = w * d * k * density;
    for (let i = 0, n = Math.round(area * 0.5 * rng.range(0.5, 1.5)); i < n; i++) paper.add(x + rng.range(-w / 2, w / 2), y + 0.006, z + rng.range(-d / 2, d / 2), rng.range(0, 6), rng.range(0.6, 1.3), [0xd8d0c0, 0xb8a888, 0xc8c0b0, 0x8a7a60][rng.int(0, 3)]!);
    for (let i = 0, n = Math.round(area * 1.4 * rng.range(0.5, 1.5)); i < n; i++) gravel.add(x + rng.range(-w / 2, w / 2), y, z + rng.range(-d / 2, d / 2), rng.range(0, 6), rng.range(0.4, 1.1), null, 0, rng.range(0.3, 0.7), rng.range(0.4, 1.1));
    for (let i = 0, n = Math.round(area * 0.9 * rng.range(0.5, 1.5)); i < n; i++) bolts.add(x + rng.range(-w / 2, w / 2), y, z + rng.range(-d / 2, d / 2), rng.range(0, 6));
  };
  /** A cluster of clutter standing on a surface at (x, y, z); `tall` allows things > 0.6 m. */
  const cluster = (x: number, y: number, z: number, tall: boolean, w: number): void => {
    const r = rng.next();
    if (tall && r < 0.28) {
      const n = rng.int(2, 4);
      for (let k = 0; k < n; k++) {
        const dx = x - ((n - 1) * 0.62) / 2 + k * 0.62;
        kit.drums.add(dx, y, z + rng.range(-0.15, 0.15), rng.range(0, 6), 1, drumColor());
        shadowAt(dx, y, z, 0.4);
      }
    } else if (tall && r < 0.42) {
      const n = rng.int(3, 8);
      for (let k = 0; k < n; k++) kit.pallets.add(x + rng.range(-0.03, 0.03), y + k * 0.144, z, rng.range(-0.15, 0.15));
      shadowAt(x, y, z, 0.8, 0.6);
      if (rng.next() < 0.5) {
        crates.add(x, y + n * 0.144, z, rng.range(-0.3, 0.3), rng.range(0.7, 1));
      }
    } else if (tall && r < 0.52) {
      kit.tyres.add(x, y, z, rng.range(0, 6));
      shadowAt(x, y, z, 0.42);
    } else if (tall && r < 0.6) {
      kit.reels.add(x, y, z, rng.range(0, 6), rng.range(0.55, 0.85));
      shadowAt(x, y, z, 0.8, 0.5);
    } else if (tall && r < 0.68) {
      carts.add(x, y, z, rng.range(-0.4, 0.4) + (rng.next() < 0.5 ? Math.PI : 0));
      shadowAt(x, y, z, 0.5, 0.35);
    } else if (tall && r < 0.76) {
      const n = rng.int(1, 3);
      for (let k = 0; k < n; k++) {
        bottles.add(x + k * 0.26, y, z, 0, 1, [0x2a4f7a, 0x8a8a80, 0x6b2a20][rng.int(0, 2)]!);
        shadowAt(x + k * 0.26, y, z, 0.16);
      }
    } else if (r < 0.82) {
      tyreFlat.add(x, y, z, rng.range(0, 6));
      if (rng.next() < 0.5) tyreFlat.add(x + 0.12, y + 0.2, z + 0.08, rng.range(0, 6));
      shadowAt(x, y, z, 0.4);
    } else if (r < 0.88) {
      drumLying.add(x, y, z, rng.range(-0.3, 0.3), 1, drumColor());
      shadowAt(x, y, z, 0.55, 0.36);
    } else if (r < 0.93) {
      bundles.add(x, y, z, rng.range(-0.2, 0.2) + (rng.next() < 0.3 ? Math.PI / 2 : 0));
      shadowAt(x, y, z, 1.3, 0.35);
    } else if (r < 0.97) {
      kit.cones.add(x, y, z, rng.range(0, 6));
      if (rng.next() < 0.6) kit.cones.add(x + rng.range(0.4, 0.9), y, z + rng.range(-0.2, 0.2), rng.range(0, 6));
      shadowAt(x, y, z, 0.22);
    } else {
      for (let k = 0, n = rng.int(2, 4); k < n; k++) plankEnds.add(x + rng.range(-0.3, 0.3), y + k * 0.045, z + rng.range(-0.15, 0.15), rng.range(-0.3, 0.3));
      shadowAt(x, y, z, 0.5, 0.25);
    }
    scatter(x, y, z, w, 1.0, 0.5);
  };

  // (a) + (b): the support ledges, slot by slot (same walk as the deck builder).
  for (let x = start + SUPPORT_SLOT / 2; x < end; x += SUPPORT_SLOT) {
    const ledge = supportLedgeY(profile, floorY, x);
    if (ledge === null) continue;
    const deck = profileY(profile, x);
    if (deck - ledge > 3.2) continue; // the ledge is too far under the deck to read from the riding camera
    // Far ledge: dense (a cluster on ≈ 55 % of slots), tall things allowed. Where the deck
    // climbs more than 0.9 m above the ledge the clutter would hide under the deck line, so on
    // 45 % of those slots a stored pallet stack raises it to deck − 0.45 first.
    if (rng.next() < 0.55 * density) {
      let shelf = ledge;
      const fz = rng.range(-2.75, -2.05);
      const fx = x + rng.range(-0.6, 0.6);
      if (deck - ledge > 0.9 && rng.next() < 0.72) {
        const n = Math.min(14, Math.round((deck - 0.45 - ledge) / 0.144));
        for (let k = 0; k < n; k++) kit.pallets.add(fx + rng.range(-0.02, 0.02), ledge + k * 0.144, fz, rng.range(-0.06, 0.06));
        shadowAt(fx, ledge, fz, 0.8, 0.6);
        shelf = ledge + n * 0.144;
      }
      cluster(fx, shelf, fz, true, 2.2);
    } else scatter(x, ledge, -2.35, 2.2, 1.2, 0.35);
    // Oil on the far ledge now and then.
    if (rng.next() < 0.2) oil.add(x + rng.range(-0.8, 0.8), ledge, rng.range(-2.7, -2.0), rng.range(0, 6), rng.range(0.35, 0.7), null, 0, 1, rng.range(0.35, 0.7));
    // Near ledge: only low things, and nothing near a spawn (the bike must read clean there).
    if (keepOut(x, 1)) continue;
    if (rng.next() < 0.32 * density) cluster(x + rng.range(-0.6, 0.6), ledge, rng.range(2.05, 2.75), false, 2.2);
    else if (rng.next() < 0.5) scatter(x, ledge, 2.35, 2.2, 1.2, 0.3);
  }
  // Deck top: bolts and a little gravel along the plywood edges, oil on the boards now and then
  // (flat stretches only, never in a spawn keep-out).
  for (let x = start + 3; x < end - 3; x += rng.range(2.5, 5)) {
    if (keepOut(x, 1.5)) continue;
    const slope = Math.abs(profileY(profile, x + 1) - profileY(profile, x - 1));
    if (slope > 0.12) continue;
    const y = profileY(profile, x);
    for (const side of [-1, 1]) scatter(x, y + 0.004, side * 1.25, 2.0, 0.4, 0.5);
    if (rng.next() < 0.22) oil.add(x, y + 0.006, rng.range(-0.9, 0.9), rng.range(0, 6), rng.range(0.3, 0.55), null, 0, 1, rng.range(0.3, 0.55));
  }
  // (c) Adjacent containers on the floor: mid tier right behind the far ledge (z −5.2).
  // Round 11 (honest read of the round-10 two-up: "a flat, uniformly lit wall"): irregular
  // gaps (a quarter of the slots empty, the pitch itself irregular), a third of the units turned
  // end-on or yawed 10–25°, 1 or 2 high, per-unit front wear (the palette colour × 0.55–1.1),
  // things leaning on the fronts (ladders, planks, a pallet, a draped tarp), roof clutter, and a
  // low sodium lamp hung IN FRONT of the row every third unit so its pool falls on the front
  // face and the deck instead of the roof.
  const contRoof = 2.59;
  const leanGeo = {
    ladder: bakeAO(
      mergeGeometries([
        new THREE.BoxGeometry(0.04, 3.2, 0.04).translate(-0.2, 1.6, 0),
        new THREE.BoxGeometry(0.04, 3.2, 0.04).translate(0.2, 1.6, 0),
        ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => new THREE.BoxGeometry(0.44, 0.03, 0.03).translate(0, 0.3 + i * 0.3, 0)),
      ], false)!.rotateX(-0.28),
      3.2,
      0.25,
    ),
    plank: bakeAO(new THREE.BoxGeometry(0.22, 3.0, 0.045).translate(0, 1.5, 0).rotateX(-0.32), 3, 0.25),
    pallet: bakeAO(new THREE.BoxGeometry(1.2, 1.2, 0.144).translate(0, 0.6, 0).rotateX(-0.22), 1.2, 0.25),
  };
  const ladders = new PropBatch('ladder', leanGeo.ladder, kit.steel);
  const leanPlanks = new PropBatch('leanplank', leanGeo.plank, vc('plank'));
  const leanPallets = new PropBatch('leanpallet', leanGeo.pallet, vc('pallet'));
  const tarpColors = [0x2a4d8a, 0x8a6a2a, 0x5a5a5a, 0x3d6b3a];
  let unit = 0;
  for (let x = kit.x0 + 24; x < kit.x1 - 12; x += rng.range(9, 19)) {
    if (rng.next() < 0.25) continue; // gap
    unit++;
    const z = -5.2 + rng.range(-0.5, 0.5);
    const n = rng.next() < 0.28 ? 2 : 1;
    const r = rng.next();
    const turned = r < 0.18; // end-on
    const yaw = turned ? Math.PI / 2 : r < 0.5 ? (rng.next() < 0.5 ? 1 : -1) * rng.range(0.17, 0.44) : rng.range(-0.05, 0.05);
    const cz = z - (turned ? 1.6 : 0);
    const wear = rng.range(0.55, 1.1);
    for (let k = 0; k < n; k++) {
      const c = new THREE.Color(pickColor()).multiplyScalar(k === 0 ? wear : rng.range(0.6, 1.05));
      skins[rng.int(0, skins.length - 1)]!.add(x + rng.range(-0.1, 0.1), floorY + k * contRoof, cz, yaw + rng.range(-0.03, 0.03) + (rng.next() < 0.5 ? Math.PI : 0), 1, c);
    }
    shadowAt(x, floorY, cz, turned ? 1.6 : 3.6, turned ? 3.6 : 1.6);
    const top = floorY + n * contRoof;
    // Roof clutter: 1–3 clusters along the roof (2 high: fewer, they sit above the lamps' pools).
    for (let k = 0, m = rng.int(1, n === 2 ? 2 : 3); k < m; k++) cluster(x + rng.range(-2.2, 2.2), top, cz + rng.range(-0.6, 0.6), true, 2.5);
    scatter(x, top, cz, turned ? 2.2 : 5.6, turned ? 5.6 : 2.2, 0.25);
    // Front face (toward the camera): z of the face at the unit's x, allowing for the yaw.
    const faceZ = (dx: number): number => cz + (turned ? 3.05 : 1.25) + Math.tan(Math.min(0.5, Math.abs(yaw))) * dx * (yaw > 0 ? -1 : 1) * (turned ? 0 : 1);
    if (!turned || rng.next() < 0.5) {
      const leans = rng.int(1, 3);
      for (let k = 0; k < leans; k++) {
        const dx = rng.range(-2.4, 2.4) * (turned ? 0.35 : 1);
        const lr = rng.next();
        const fz = faceZ(dx);
        if (lr < 0.3) ladders.add(x + dx, floorY, fz + 0.86, rng.range(-0.05, 0.05), 1, [0x8a8a80, 0xd8a020, 0x5a5a5a][rng.int(0, 2)]!);
        else if (lr < 0.65) {
          for (let j = 0, pn = rng.int(2, 4); j < pn; j++) leanPlanks.add(x + dx + j * 0.26, floorY, fz + 0.94 + rng.range(-0.04, 0.04), rng.range(-0.06, 0.06), 1, null, 0, rng.range(0.8, 1.05), 1);
        } else if (lr < 0.85) leanPallets.add(x + dx, floorY, fz + 0.28, rng.range(-0.06, 0.06));
        else kit.tarps.add(x + dx, top + 0.05, fz + 0.1, 0, rng.range(0.6, 0.9), tarpColors[rng.int(0, 3)]!, 0, rng.range(0.5, 0.8), 1); // a tarp draped over the front edge
        shadowAt(x + dx, floorY, fz + 0.5, 0.5, 0.35);
      }
    }
    // A low lamp in front of the row: floor + 5.0 (≈ deck + 2), z −3.9 — the pool lands on the front face and the deck.
    if (unit % 3 === 1) kit.hangLamp(x + rng.range(-1.5, 1.5), floorY + 5.0 + rng.range(-0.2, 0.3), -3.9 + rng.range(-0.2, 0.2));
    // A chain and hook off the truss above, now and then.
    if (rng.next() < 0.4) {
      const hy = top + rng.range(2.2, 3.6);
      hangChains.add(x + rng.range(-2, 2), roofY - 1.4, cz, 0, 1, null, 0, roofY - 1.4 - hy, 1);
      hooks.add(x + rng.range(-2, 2), hy - 0.7, cz);
    }
  }
  // Pallet racks standing on the floor between the containers (top at floor + 4 ≈ deck + 1).
  for (let x = kit.x0 + 30; x < kit.x1 - 12; x += rng.range(28, 50)) {
    racksNear.add(x, floorY, -5.6 + rng.range(-0.3, 0.3), 0, 1);
    shadowAt(x, floorY, -5.6, 1.6, 0.8);
  }
  // Foreground containers (near side): sparse, never inside a spawn keep-out.
  for (let x = kit.x0 + 40; x < kit.x1 - 20; x += rng.range(30, 48)) {
    if (keepOut(x, 4)) continue;
    const z = 5.2 + rng.range(-0.3, 0.6);
    skins[rng.int(0, skins.length - 1)]!.add(x, floorY, z, rng.range(-0.05, 0.05) + (rng.next() < 0.5 ? Math.PI : 0), 1, pickColor());
    shadowAt(x, floorY, z, 3.6, 1.6);
    const top = floorY + contRoof;
    for (let k = 0, m = rng.int(1, 2); k < m; k++) cluster(x + rng.range(-2.2, 2.2), top, z + rng.range(-0.5, 0.5), rng.next() < 0.5, 2.5);
    scatter(x, top, z, 5.6, 2.2, 0.25);
  }
  // Floor under the deck edges (visible in the idle 3/4 view and on wide pull-backs): contact
  // shadows under the existing floor clutter are cheap, so scatter a little there too.
  for (let x = kit.x0 + 10; x < kit.x1 - 10; x += rng.range(6, 12)) scatter(x, floorY, rng.range(-9, -4.5), 3, 2, 0.25);
  out.batches.push(shadows, oil, crates, bundles, plankEnds, carts, bottles, tyreFlat, drumLying, paper, gravel, bolts, hangChains, hooks, racksNear, ladders, leanPlanks, leanPallets);
}
