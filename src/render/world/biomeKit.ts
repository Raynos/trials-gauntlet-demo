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
import { buildHall, foregroundKeepOut } from './hall';
import type { ArtLibrary } from '../art/library';
import {
  PropBatch,
  bakeAO,
  baleGeometry,
  buildingGeometry,
  coneGeometry,
  drumGeometry,
  lightConeGeometry,
  reflectionMaskTexture,
  rockGeometry,
  setColors,
  triCount,
  trussGeometry, // round 11 nightCity crane jib
  tyreStackGeometry,
  // round 11 exterior kit (canyon / snow)
  brazierFireGeometry,
  brazierGeometry,
  cabinBodyGeometry,
  coniferGeometry2,
  contactShadowBatch,
  gableGeometry,
  gableSnowGeometry,
  iceCurtainGeometry,
  lanternGeometry,
  lanternGlassGeometry,
  liftChairGeometry,
  liftPylonGeometry,
  lightTowerGeometry,
  lightTowerHeadsGeometry,
  logPileGeometry,
  minePortalGeometry,
  pickupGeometry,
  radialDiscTexture,
  sledGeometry,
  snagGeometry,
  splitRailGeometry,
  spoolGeometry,
  strataSilhouette,
  tyreWallGeometry,
  waterTowerGeometry,
  windmillGeometry,
} from './props';
import type { WorldDetail } from './props';

export interface BiomeKit {
  group: THREE.Group;
  drawCalls: number;
  triangles: number;
  textureBytes: number;
  /** Materials whose emissive flickers (fire barrels, molten metal); driven from tSim. */
  flicker: THREE.MeshStandardMaterial[];
  /** Point lights placed by the kit (≤ 2). */
  lights: THREE.PointLight[];
  /** Textures whose offset scrolls with tSim (molten flow). */
  scroll: { tex: THREE.Texture; vx: number; vy: number }[];
  /** Spark fountain positions (foundry ladles / pours). */
  fountains: { x: number; y: number; z: number }[];
  /** High-bay lamp heads (interior kits, round 10): the renderer's two follow spots park on the nearest. */
  lamps: { x: number; y: number; z: number }[];
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
    // Round 11: darker red-brown rock with pale bands (reference 03: dark rock, peach haze; the
    // pale ochre of round 7 merged with the fog).
    const r = Math.floor(98 + t * 74);
    const gg = Math.floor(66 + t * 62);
    const b = Math.floor(52 + t * 50);
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
// Round 7 geometry / texture recipes
// ---------------------------------------------------------------------------

function lcg(seed: number): () => number {
  let st = seed >>> 0 || 7;
  return () => {
    st = (Math.imul(st, 1664525) + 1013904223) >>> 0;
    return st / 4294967296;
  };
}

/** Constant / per-vertex colour attribute helper. */
/**
 * Sandstone formation: a terraced mound (unit radius 0.5, unit height 1) built from
 * rings × layers. Cliff layers keep their radius, ledge layers step in; per-column
 * erosion noise breaks the silhouette; flat normals; banded vertex colour with AO at
 * the base and shade under each ledge. `variant` picks the terrace rhythm.
 */
function mesaGeometry(seed: number, variant: number): THREE.BufferGeometry {
  const rnd = lcg(seed);
  const N = 16;
  const K = 12;
  const colOff: number[] = [];
  for (let i = 0; i < N; i++) colOff.push(rnd());
  const layerR: number[] = [];
  const layerY: number[] = [];
  let r = 0.5;
  let y = 0;
  const step = variant === 0 ? 3 : variant === 1 ? 2 : 4;
  for (let k = 0; k <= K; k++) {
    layerR.push(r);
    layerY.push(y);
    const ledge = k % step === step - 1;
    if (ledge) r *= 0.78 + rnd() * 0.1;
    else r *= 0.985;
    y += ledge ? 0.03 : (1 / K) * (1.1 + rnd() * 0.3);
  }
  const yMax = layerY[K]!;
  for (let k = 0; k <= K; k++) layerY[k] = layerY[k]! / yMax;
  const ring = (k: number, i: number): [number, number, number] => {
    const a = (i / N) * Math.PI * 2;
    const n = 0.86 + 0.28 * (0.5 + 0.5 * Math.sin(colOff[i % N]! * 12.9 + k * 0.7)) + 0.06 * Math.sin(k * 2.1 + i * 1.3);
    const rr = layerR[k]! * n;
    return [Math.cos(a) * rr, layerY[k]!, Math.sin(a) * rr];
  };
  const pos: number[] = [];
  const col: number[] = [];
  const bands: [number, number, number][] = [
    [1.0, 0.86, 0.7],
    [0.86, 0.62, 0.46],
    [0.98, 0.8, 0.62],
    [0.72, 0.48, 0.36],
    [0.94, 0.76, 0.6],
  ];
  const push = (v: [number, number, number], k: number, under: boolean): void => {
    pos.push(v[0], v[1], v[2]);
    const b = bands[k % bands.length]!;
    const ao = 0.55 + 0.45 * Math.min(1, v[1] * 3.5);
    const sh = under ? 0.7 : 1;
    col.push(b[0] * ao * sh, b[1] * ao * sh, b[2] * ao * sh);
  };
  for (let k = 0; k < K; k++) {
    const ledge = k % step === step - 1;
    for (let i = 0; i < N; i++) {
      const a0 = ring(k, i);
      const a1 = ring(k, i + 1);
      const b0 = ring(k + 1, i);
      const b1 = ring(k + 1, i + 1);
      push(a0, k, ledge);
      push(a1, k, ledge);
      push(b1, k, ledge);
      push(a0, k, ledge);
      push(b1, k, ledge);
      push(b0, k, ledge);
    }
  }
  // Flat top fan.
  for (let i = 0; i < N; i++) {
    const a0 = ring(K, i);
    const a1 = ring(K, i + 1);
    push([0, 1, 0], K, false);
    push(a1, K, false);
    push(a0, K, false);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const uv: number[] = [];
  for (let i = 0; i < pos.length; i += 3) uv.push((pos[i]! + pos[i + 2]!) * 2, pos[i + 1]! * 3);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Desert scrub: a clump of six flattened lobes over a few twigs, olive → khaki per lobe, dark at the base. */
function scrubGeometry(seed: number): THREE.BufferGeometry {
  const rnd = lcg(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd();
    const d = 0.18 + rnd() * 0.16;
    const lobe = new THREE.IcosahedronGeometry(0.24 + rnd() * 0.12, 0).scale(1.2, 0.7, 1.1).translate(Math.cos(a) * d, 0.2 + rnd() * 0.18, Math.sin(a) * d);
    const k = rnd();
    setColors(lobe, (_x, y) => {
      const s = 0.45 + 0.55 * Math.min(1, y * 3);
      return [(0.42 + 0.2 * k) * s, (0.4 + 0.12 * k) * s, (0.2 + 0.08 * k) * s];
    });
    parts.push(lobe);
  }
  for (let i = 0; i < 3; i++) {
    const t = new THREE.CylinderGeometry(0.012, 0.02, 0.5, 4).toNonIndexed().rotateZ(rnd() * 0.8 - 0.4).rotateY(rnd() * 6).translate(0, 0.2, 0);
    setColors(t, () => [0.3, 0.22, 0.14]);
    parts.push(t);
  }
  return mergeGeometries(parts, false)!;
}

// Round 11: the round-7 cone-stack `conifer()` is retired; `coniferGeometry2` (props.ts) has real branch tiers.

/** Snow bank: half-ellipsoid with a lumpy top, white on top, blue-grey shadow toward the base. */
function snowBankGeometry(seed: number): THREE.BufferGeometry {
  const rnd = lcg(seed);
  const g = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const bumps: number[] = [];
  for (let i = 0; i < 6; i++) bumps.push(rnd() * 6.28, 0.8 + rnd() * 0.4);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    let k = 1;
    for (let j = 0; j < 6; j++) k += 0.08 * Math.cos(a * 3 - bumps[j * 2]!) * bumps[j * 2 + 1]!;
    p.setXYZ(i, x * k, p.getY(i) * 0.55, z * k);
  }
  g.computeVertexNormals();
  return setColors(g, (_x, y) => {
    const t = Math.min(1, y / 0.5);
    return [0.78 + 0.22 * t, 0.82 + 0.18 * t, 0.9 + 0.1 * t];
  });
}

/** Rooftop kit over a unit footprint (scale x/z to the building): parapet, water tank, AC boxes, a stair head. */
function rooftopGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, z, w, d] of [[0, 0.49, 1, 0.02], [0, -0.49, 1, 0.02], [0.49, 0, 0.02, 1], [-0.49, 0, 0.02, 1]] as const) parts.push(new THREE.BoxGeometry(w, 0.7, d).translate(x, 0.35, z));
  parts.push(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 10).translate(0.25, 1.3, -0.2));
  parts.push(new THREE.BoxGeometry(0.16, 0.9, 0.16).translate(0.25, 0.45, -0.2));
  parts.push(new THREE.BoxGeometry(0.12, 0.6, 0.1).translate(-0.2, 0.3, 0.15));
  parts.push(new THREE.BoxGeometry(0.1, 0.5, 0.1).translate(-0.3, 0.25, -0.25));
  parts.push(new THREE.BoxGeometry(0.2, 2.2, 0.16).translate(-0.05, 1.1, 0.25));
  const g = mergeGeometries(parts, false)!;
  return setColors(g, (_x, y) => {
    const s = 0.6 + 0.4 * Math.min(1, y / 0.7);
    return [s, s, s];
  });
}

/** City facade tile (4 bays × 4 floors): albedo + emissive lit windows. */
function facadeTexture(rng: Rng, kind: 'office' | 'apartment' | 'brick'): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const S = 512;
  const [c, g] = canvas(S, S);
  const [ce, ge] = canvas(S, S);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, S, S);
  const wall = kind === 'office' ? '#2a2f3a' : kind === 'apartment' ? '#6a5f52' : '#4a2a22';
  g.fillStyle = wall;
  g.fillRect(0, 0, S, S);
  if (kind === 'brick') {
    for (let y = 0; y < S; y += 8) for (let x = -(Math.floor(y / 8) % 2) * 8; x < S; x += 16) {
      g.fillStyle = `rgba(0,0,0,${rng.range(0.05, 0.25)})`;
      g.fillRect(x + 1, y + 1, 14, 6);
    }
  }
  const floors = 4;
  const bays = 4;
  const fh = S / floors;
  const bw = S / bays;
  for (let f = 0; f < floors; f++) {
    for (let b = 0; b < bays; b++) {
      const x = b * bw;
      const y = f * fh;
      let wx: number;
      let wy: number;
      let ww: number;
      let wh: number;
      if (kind === 'office') {
        wx = x + 8;
        wy = y + 10;
        ww = bw - 16;
        wh = fh - 30;
      } else if (kind === 'apartment') {
        wx = x + 30;
        wy = y + 22;
        ww = bw - 60;
        wh = fh - 52;
      } else {
        wx = x + 40;
        wy = y + 18;
        ww = bw - 80;
        wh = fh - 44;
      }
      const lit = rng.next() < (kind === 'office' ? 0.4 : 0.3);
      const cool = rng.next() < 0.2;
      g.fillStyle = lit ? (cool ? '#a9c4e8' : '#f0cf96') : kind === 'office' ? '#182030' : '#141418';
      g.fillRect(wx, wy, ww, wh);
      // Frame / mullions.
      g.fillStyle = kind === 'office' ? '#3c4250' : '#2a2622';
      g.fillRect(wx + ww / 2 - 2, wy, 4, wh);
      if (kind !== 'office') g.fillRect(wx, wy + wh / 2 - 2, ww, 4);
      // Curtains / interior shade on lit windows.
      if (lit && rng.next() < 0.5) {
        g.fillStyle = 'rgba(40,30,20,0.55)';
        g.fillRect(wx, wy, ww * rng.range(0.2, 0.5), wh);
      }
      if (kind === 'apartment') {
        // Balcony slab + rail under the window.
        g.fillStyle = '#4c443a';
        g.fillRect(x + 14, y + fh - 26, bw - 28, 8);
        g.fillStyle = '#2a2622';
        for (let k = x + 16; k < x + bw - 14; k += 8) g.fillRect(k, y + fh - 46, 2, 20);
      }
      if (kind === 'office') {
        // Spandrel band.
        g.fillStyle = '#1e222b';
        g.fillRect(x, y + fh - 20, bw, 20);
      }
      const e = lit ? 0.55 + rng.next() * 0.45 : 0;
      ge.fillStyle = cool ? `rgba(170,200,240,${e})` : `rgba(255,220,160,${e})`;
      ge.fillRect(wx, wy, ww, wh);
      if (lit && rng.next() < 0.5) {
        ge.fillStyle = 'rgba(0,0,0,0.6)';
        ge.fillRect(wx, wy, ww * 0.35, wh);
      }
      ge.fillStyle = '#000';
      ge.fillRect(wx + ww / 2 - 2, wy, 4, wh);
    }
  }
  // Grime streaks.
  for (let i = 0; i < 24; i++) {
    g.fillStyle = `rgba(0,0,0,${rng.range(0.05, 0.18)})`;
    g.fillRect(rng.range(0, S), 0, rng.range(2, 9), S);
  }
  return { map: tex(c), emissive: tex(ce) };
}

/** Ground-floor shopfronts: awning, lit window, coloured sign; 4 shops per tile. */
function shopfrontTexture(rng: Rng): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const W = 1024;
  const H = 256;
  const [c, g] = canvas(W, H);
  const [ce, ge] = canvas(W, H);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H);
  const names = ['DINER', 'PIZZA', 'BAR', 'LAUNDRY', 'MOTO', 'NOODLE', 'HOTEL', 'TATTOO'];
  const cols = ['#ff40c0', '#40e0ff', '#ffd040', '#ff6040', '#60ff80', '#ff8040'];
  for (let i = 0; i < 4; i++) {
    const x = i * 256;
    g.fillStyle = '#26262c';
    g.fillRect(x, 0, 256, H);
    // Window.
    const lit = rng.next() < 0.75;
    g.fillStyle = lit ? '#e8d8b0' : '#181a20';
    g.fillRect(x + 20, 96, 216, 140);
    g.fillStyle = '#121216';
    g.fillRect(x + 126, 96, 4, 140);
    ge.fillStyle = lit ? 'rgba(255,225,170,0.5)' : '#000';
    ge.fillRect(x + 20, 96, 216, 140);
    // Awning.
    const ac = cols[rng.int(0, cols.length - 1)]!;
    g.fillStyle = ac;
    g.fillRect(x + 10, 70, 236, 26);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let k = x + 10; k < x + 246; k += 30) g.fillRect(k, 70, 15, 26);
    // Sign.
    const sc = cols[rng.int(0, cols.length - 1)]!;
    for (const [ctx, colour] of [[g, sc], [ge, sc]] as const) {
      ctx.font = 'bold 54px Impact, "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = colour;
      ctx.fillText(names[rng.int(0, names.length - 1)]!, x + 128, 36);
    }
  }
  return { map: tex(c), emissive: tex(ce) };
}

// ---------------------------------------------------------------------------
// Round 11 nightCity street kit (builder "city"): vertex-coloured merged geometry, one
// PropBatch per shape, no per-instance colour (no USE_INSTANCING_COLOR variant), no textures.
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

/** Merge parts, each tinted with a flat vertex colour (with a little top-light / base AO). */
function tinted(parts: [THREE.BufferGeometry, RGB][], aoHeight = 0): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [];
  for (const [g, c] of parts) {
    const ng = g.index ? g.toNonIndexed() : g;
    setColors(ng, (_x, y) => {
      const ao = aoHeight > 0 ? 0.55 + 0.45 * Math.min(1, Math.max(0, y) / aoHeight) : 1;
      return [c[0] * ao, c[1] * ao, c[2] * ao];
    });
    out.push(ng);
  }
  return mergeGeometries(out, false)!;
}

/** Sedan 4.4 × 1.45 × 1.8, origin bottom centre, nose toward +x. Cabin top is narrowed so it is not a second box. */
function carGeometry(body: RGB, taxi = false): THREE.BufferGeometry {
  const parts: [THREE.BufferGeometry, RGB][] = [];
  parts.push([new THREE.BoxGeometry(4.4, 0.6, 1.8).translate(0, 0.62, 0), body]);
  const cabin = new THREE.BoxGeometry(2.3, 0.55, 1.7, 1, 1, 1);
  const p = cabin.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setXYZ(i, p.getX(i) * 0.72 - 0.15, p.getY(i), p.getZ(i) * 0.9);
  cabin.computeVertexNormals();
  parts.push([cabin.translate(-0.2, 1.19, 0), [0.1, 0.11, 0.13]]);
  parts.push([new THREE.BoxGeometry(2.3, 0.06, 1.72).translate(-0.2, 1.47, 0), body]);
  for (const x of [-1.45, 1.45]) for (const z of [-0.82, 0.82]) parts.push([new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12).rotateX(Math.PI / 2).translate(x, 0.33, z), [0.05, 0.05, 0.05]]);
  parts.push([new THREE.BoxGeometry(0.1, 0.16, 1.6).translate(2.2, 0.6, 0), [0.7, 0.68, 0.6]]);
  parts.push([new THREE.BoxGeometry(0.1, 0.16, 1.6).translate(-2.2, 0.6, 0), [0.5, 0.05, 0.05]]);
  if (taxi) parts.push([new THREE.BoxGeometry(0.5, 0.18, 0.24).translate(-0.2, 1.58, 0), [1.0, 0.85, 0.2]]);
  return tinted(parts, 0.5);
}

/** Box truck 8.2 × 3.4 × 2.5 (the reference's foreground occluder), nose toward +x. */
function truckGeometry(): THREE.BufferGeometry {
  const parts: [THREE.BufferGeometry, RGB][] = [];
  parts.push([new THREE.BoxGeometry(5.6, 2.7, 2.5).translate(-1.3, 0.75 + 1.35, 0), [0.82, 0.8, 0.76]]);
  parts.push([new THREE.BoxGeometry(5.7, 0.12, 2.56).translate(-1.3, 0.75, 0), [0.15, 0.15, 0.16]]);
  parts.push([new THREE.BoxGeometry(2.2, 2.2, 2.4).translate(2.7, 0.75 + 1.1, 0), [0.16, 0.2, 0.3]]);
  parts.push([new THREE.BoxGeometry(1.2, 0.9, 2.2).translate(3.3, 2.6, 0), [0.08, 0.09, 0.12]]);
  parts.push([new THREE.BoxGeometry(8.4, 0.5, 2.3).translate(0.3, 0.5, 0), [0.1, 0.1, 0.11]]);
  for (const x of [-3.0, -1.6, 2.6]) for (const z of [-1.05, 1.05]) parts.push([new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12).rotateX(Math.PI / 2).translate(x, 0.5, z), [0.05, 0.05, 0.05]]);
  parts.push([new THREE.BoxGeometry(0.1, 0.25, 0.4).translate(3.85, 1.2, 0.8), [0.9, 0.85, 0.6]]);
  parts.push([new THREE.BoxGeometry(0.1, 0.25, 0.4).translate(3.85, 1.2, -0.8), [0.9, 0.85, 0.6]]);
  return tinted(parts, 0.9);
}

/** Dumpster 1.8 × 1.35 × 1.1 with a half-open lid. */
function dumpsterGeometry(col: RGB): THREE.BufferGeometry {
  const parts: [THREE.BufferGeometry, RGB][] = [];
  parts.push([new THREE.BoxGeometry(1.8, 1.1, 1.1).translate(0, 0.2 + 0.55, 0), col]);
  parts.push([new THREE.BoxGeometry(1.84, 0.08, 0.6).translate(0, 1.3, -0.25), [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8]]);
  parts.push([new THREE.BoxGeometry(1.84, 0.08, 0.6).rotateX(-0.9).translate(0, 1.5, 0.45), [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8]]);
  for (const x of [-0.7, 0.7]) for (const z of [-0.4, 0.4]) parts.push([new THREE.CylinderGeometry(0.09, 0.09, 0.08, 8).rotateX(Math.PI / 2).translate(x, 0.1, z), [0.05, 0.05, 0.05]]);
  return tinted(parts, 0.6);
}

/** Bollard: 0.9 m post with a cap. */
function bollardGeometry(): THREE.BufferGeometry {
  return tinted([[new THREE.CylinderGeometry(0.09, 0.1, 0.9, 10).translate(0, 0.45, 0), [0.18, 0.19, 0.2]], [new THREE.SphereGeometry(0.1, 10, 6).translate(0, 0.92, 0), [0.22, 0.23, 0.24]]], 0.3);
}

/** Fire hydrant. */
function hydrantGeometry(): THREE.BufferGeometry {
  const red: RGB = [0.75, 0.12, 0.08];
  return tinted(
    [
      [new THREE.CylinderGeometry(0.14, 0.16, 0.7, 10).translate(0, 0.35, 0), red],
      [new THREE.SphereGeometry(0.15, 10, 6).translate(0, 0.72, 0), red],
      [new THREE.CylinderGeometry(0.06, 0.06, 0.42, 8).rotateZ(Math.PI / 2).translate(0, 0.45, 0), [0.6, 0.6, 0.55]],
      [new THREE.CylinderGeometry(0.06, 0.06, 0.24, 8).rotateX(Math.PI / 2).translate(0, 0.5, 0.15), [0.6, 0.6, 0.55]],
    ],
    0.3,
  );
}

/** Newspaper box 0.45 × 1.1 × 0.45. */
function newsboxGeometry(col: RGB): THREE.BufferGeometry {
  return tinted([[new THREE.BoxGeometry(0.45, 0.85, 0.45).translate(0, 0.25 + 0.425, 0), col], [new THREE.BoxGeometry(0.34, 0.4, 0.02).translate(0, 0.8, 0.23), [0.08, 0.09, 0.1]], [new THREE.BoxGeometry(0.4, 0.25, 0.4).translate(0, 0.125, 0), [0.15, 0.15, 0.16]]], 0.4);
}

/** Jersey barrier 2 × 0.8 × 0.5 with orange / white bands. */
function jerseyGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(2, 0.8, 0.5, 8, 1, 1);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setZ(i, p.getZ(i) * 0.4);
  g.computeVertexNormals();
  g.translate(0, 0.4, 0);
  return setColors(g.toNonIndexed(), (x, y) => {
    const band = Math.floor((x + 1) * 2) % 2 === 0;
    const ao = 0.6 + 0.4 * Math.min(1, y / 0.4);
    return band ? [0.95 * ao, 0.4 * ao, 0.08 * ao] : [0.85 * ao, 0.85 * ao, 0.82 * ao];
  });
}

/** One scaffold bay 6 × 7 × 1.6 (two lifts) — poles, ledgers, diagonals, plank decks. Hoarding is a separate plywood batch. */
function scaffoldGeometry(): THREE.BufferGeometry {
  const steel: RGB = [0.45, 0.47, 0.5];
  const plank: RGB = [0.5, 0.4, 0.28];
  const parts: [THREE.BufferGeometry, RGB][] = [];
  for (const x of [-3, 0, 3]) for (const z of [-0.8, 0.8]) parts.push([new THREE.CylinderGeometry(0.03, 0.03, 7, 6).translate(x, 3.5, z), steel]);
  for (const y of [1.0, 3.3, 5.6, 6.9]) {
    for (const z of [-0.8, 0.8]) parts.push([new THREE.BoxGeometry(6.1, 0.05, 0.05).translate(0, y, z), steel]);
    for (const x of [-3, 0, 3]) parts.push([new THREE.BoxGeometry(0.05, 0.05, 1.6).translate(x, y, 0), steel]);
  }
  parts.push([new THREE.BoxGeometry(0.05, 0.05, 6.6).rotateY(Math.PI / 2).rotateZ(0.65).translate(-1.5, 2.2, -0.8), steel]);
  parts.push([new THREE.BoxGeometry(0.05, 0.05, 6.6).rotateY(Math.PI / 2).rotateZ(-0.65).translate(1.5, 4.5, -0.8), steel]);
  for (const y of [3.35, 5.65]) parts.push([new THREE.BoxGeometry(6.1, 0.06, 1.5).translate(0, y, 0), plank]);
  return tinted(parts, 0);
}

/** Fire escape: three landings (3.2 m pitch) with rails and a stair run between each, hung on a facade (back at z 0, sticks out +z). */
function fireEscapeGeometry(): THREE.BufferGeometry {
  const iron: RGB = [0.12, 0.12, 0.13];
  const parts: [THREE.BufferGeometry, RGB][] = [];
  for (let k = 0; k < 3; k++) {
    const y = 3.6 + k * 3.2;
    parts.push([new THREE.BoxGeometry(3.4, 0.06, 1.1).translate(0, y, 0.55), iron]);
    parts.push([new THREE.BoxGeometry(3.4, 0.03, 0.03).translate(0, y + 0.95, 1.08), iron]);
    for (const x of [-1.68, -0.85, 0, 0.85, 1.68]) parts.push([new THREE.BoxGeometry(0.03, 0.95, 0.03).translate(x, y + 0.48, 1.08), iron]);
    for (const z of [0.3, 0.75]) parts.push([new THREE.BoxGeometry(0.03, 0.95, 0.03).translate(1.68, y + 0.48, z), iron]);
    if (k < 2) parts.push([new THREE.BoxGeometry(0.7, 0.05, 3.5).rotateX(Math.PI / 2 - 0.75).translate(-1.1, y + 1.6, 0.55), iron]);
  }
  return tinted(parts, 0);
}

/** Awning 3 × 1.2 sloped, two struts; `col` is the canvas colour with a light stripe pattern in the vertex colour. */
function awningGeometry(col: RGB): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(3, 0.06, 1.3, 12, 1, 1).rotateX(0.35).translate(0, 0, 0.6);
  const cloth = setColors(g.toNonIndexed(), (x) => (Math.floor((x + 1.5) * 3) % 2 === 0 ? col : [0.9, 0.88, 0.82]));
  const strut: RGB = [0.2, 0.2, 0.22];
  return mergeGeometries([cloth, tinted([[new THREE.BoxGeometry(0.04, 0.04, 1.4).rotateX(-0.5).translate(-1.4, -0.3, 0.55), strut], [new THREE.BoxGeometry(0.04, 0.04, 1.4).rotateX(-0.5).translate(1.4, -0.3, 0.55), strut]])], false)!;
}

/** Window AC unit 0.7 × 0.5 × 0.5 with a dark grille face. */
function acUnitGeometry(): THREE.BufferGeometry {
  return tinted([[new THREE.BoxGeometry(0.7, 0.5, 0.5).translate(0, 0, 0.25), [0.62, 0.62, 0.6]], [new THREE.BoxGeometry(0.5, 0.34, 0.03).translate(0, 0, 0.5), [0.1, 0.1, 0.1]], [new THREE.BoxGeometry(0.76, 0.05, 0.56).translate(0, -0.26, 0.28), [0.3, 0.3, 0.3]]]);
}

/** Traffic light: 5 m pole, 3 m arm, head box hanging from the arm end; the lit lenses are a separate emissive batch. */
function trafficLightGeometry(): THREE.BufferGeometry {
  const paint: RGB = [0.16, 0.17, 0.12];
  return tinted([[new THREE.CylinderGeometry(0.09, 0.11, 5.4, 8).translate(0, 2.7, 0), paint], [new THREE.CylinderGeometry(0.06, 0.07, 3.2, 8).rotateX(Math.PI / 2).translate(0, 5.3, 1.6), paint], [new THREE.BoxGeometry(0.34, 1.0, 0.3).translate(0, 4.7, 3.0), [0.08, 0.08, 0.07]], [new THREE.BoxGeometry(0.4, 0.1, 0.36).translate(0, 5.22, 3.0), paint]]);
}

/** Bus shelter 4 × 2.6 × 1.6: posts, roof, back panel; the lit ad panel is a separate emissive batch. */
function busShelterGeometry(): THREE.BufferGeometry {
  const frame: RGB = [0.14, 0.15, 0.17];
  const parts: [THREE.BufferGeometry, RGB][] = [];
  for (const x of [-1.9, 1.9]) for (const z of [-0.7, 0.7]) parts.push([new THREE.BoxGeometry(0.08, 2.5, 0.08).translate(x, 1.25, z), frame]);
  parts.push([new THREE.BoxGeometry(4.2, 0.1, 1.7).translate(0, 2.55, 0), frame]);
  parts.push([new THREE.BoxGeometry(4.0, 2.2, 0.04).translate(0, 1.3, -0.72), [0.2, 0.24, 0.3]]);
  parts.push([new THREE.BoxGeometry(3.2, 0.06, 0.4).translate(0, 0.5, -0.4), [0.35, 0.3, 0.22]]);
  return tinted(parts, 0.4);
}

/** Food cart 1.6 × 1 × 0.9 with a striped umbrella (the bulb under it is a separate emissive batch). */
function foodCartGeometry(): THREE.BufferGeometry {
  const parts: [THREE.BufferGeometry, RGB][] = [];
  parts.push([new THREE.BoxGeometry(1.6, 0.9, 0.9).translate(0, 0.25 + 0.45, 0), [0.52, 0.5, 0.46]]);
  parts.push([new THREE.BoxGeometry(1.64, 0.06, 0.94).translate(0, 1.18, 0), [0.35, 0.35, 0.36]]);
  for (const z of [-0.5, 0.5]) parts.push([new THREE.CylinderGeometry(0.25, 0.25, 0.08, 10).rotateX(Math.PI / 2).translate(-0.5, 0.25, z), [0.05, 0.05, 0.05]]);
  parts.push([new THREE.CylinderGeometry(0.02, 0.02, 1.6, 6).translate(0.3, 1.9, 0), [0.4, 0.4, 0.4]]);
  const umb = new THREE.ConeGeometry(1.1, 0.4, 12, 1, true).translate(0.3, 2.65, 0).toNonIndexed();
  setColors(umb, (x, _y, z) => (Math.floor(((Math.atan2(z, x - 0.3) + Math.PI) / (Math.PI * 2)) * 12) % 2 === 0 ? [0.85, 0.15, 0.1] : [0.92, 0.9, 0.84]));
  return mergeGeometries([tinted(parts, 0.5), umb], false)!;
}

/** Road sign: 2.4 m post with a square plate facing +z. */
function roadSignGeometry(col: RGB): THREE.BufferGeometry {
  return tinted([[new THREE.CylinderGeometry(0.03, 0.035, 2.5, 6).translate(0, 1.25, 0), [0.4, 0.42, 0.45]], [new THREE.BoxGeometry(0.6, 0.6, 0.03).translate(0, 2.2, 0.04), col], [new THREE.BoxGeometry(0.44, 0.44, 0.02).translate(0, 2.2, 0.06), [0.9, 0.9, 0.9]]]);
}

/** Elevated-rail carriage 12 × 3.2 × 2.8 with a dark body; the lit window band is a separate emissive batch. */
function railCarGeometry(): THREE.BufferGeometry {
  const body: RGB = [0.32, 0.33, 0.36];
  const parts: [THREE.BufferGeometry, RGB][] = [];
  parts.push([new THREE.BoxGeometry(12, 2.6, 2.8).translate(0, 0.5 + 1.3, 0), body]);
  parts.push([new THREE.BoxGeometry(11.6, 0.3, 2.4).translate(0, 3.25, 0), [0.22, 0.23, 0.25]]);
  parts.push([new THREE.BoxGeometry(12.2, 0.5, 2.2).translate(0, 0.25, 0), [0.08, 0.08, 0.09]]);
  for (const x of [-4, 4]) parts.push([new THREE.BoxGeometry(2.2, 0.5, 2.6).translate(x, 0.28, 0), [0.1, 0.1, 0.11]]);
  return tinted(parts, 0);
}

/** Window band with mullions (slot the emissive strip behind it): 12 m long, 1 m tall, mullions every 1.2 m. */
function mullionGeometry(): THREE.BufferGeometry {
  const parts: [THREE.BufferGeometry, RGB][] = [];
  for (let x = -5.4; x <= 5.5; x += 1.2) parts.push([new THREE.BoxGeometry(0.16, 1.1, 0.06).translate(x, 0, 0), [0.2, 0.21, 0.23]]);
  return tinted(parts, 0);
}

/** Tower-crane mast section (unit height, 1.6 m square lattice) — scale y to the height. */
function mastGeometry(): THREE.BufferGeometry {
  const y: RGB = [0.9, 0.65, 0.1];
  const parts: [THREE.BufferGeometry, RGB][] = [];
  for (const x of [-0.8, 0.8]) for (const z of [-0.8, 0.8]) parts.push([new THREE.BoxGeometry(0.16, 1, 0.16).translate(x, 0.5, z), y]);
  for (const k of [0.25, 0.5, 0.75, 1]) {
    for (const x of [-0.8, 0.8]) parts.push([new THREE.BoxGeometry(0.08, 0.08, 1.6).translate(x, k, 0), y]);
    for (const z of [-0.8, 0.8]) parts.push([new THREE.BoxGeometry(1.6, 0.08, 0.08).translate(0, k, z), y]);
  }
  return tinted(parts, 0);
}

/** Far-mid city silhouette (1024 × 256, wrap-safe): towers with setbacks and a few spires; a quarter of the round-7 strip's memory. */
function citySilhouette(rng: Rng): THREE.CanvasTexture {
  const W = 1024;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#fff';
  for (let x = 0; x < W; ) {
    const w = rng.range(18, 64);
    const h = rng.range(50, 230);
    g.fillRect(x, H - h, w, h);
    if (rng.next() < 0.4) g.fillRect(x + w * 0.25, H - h - rng.range(10, 30), w * 0.5, 30);
    if (rng.next() < 0.2) g.fillRect(x + w * 0.45, H - h - 40, 3, 40);
    x += w + rng.range(0, 6);
  }
  return tex(c);
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export function buildBiomeKit(track: CompiledTrack, biome: Biome, lib: MaterialLibrary, art: ArtLibrary | null = null, detail: WorldDetail = 'high'): BiomeKit {
  const group = new THREE.Group();
  const keepOut = foregroundKeepOut(track);
  group.name = `biome:${biome.id}`;
  const rng = new Rng((track.def.seed ^ 0x5bd1e995) >>> 0);
  const flicker: THREE.MeshStandardMaterial[] = [];
  const lights: THREE.PointLight[] = [];
  const scroll: BiomeKit['scroll'] = [];
  const fountains: BiomeKit['fountains'] = [];
  const lamps: BiomeKit['lamps'] = [];
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
    const matName = biome.id === 'foundry' ? 'steelPlate' : biome.interior ? 'concrete' : biome.id === 'nightCity' ? 'asphaltWet' : biome.groundSurface === 'snow' ? 'snow' : biome.groundSurface === 'dirt' ? 'dirt' : 'concrete';
    let tmat: THREE.MeshStandardMaterial = lib.get(matName);
    if (biome.id === 'canyon') {
      tmat = lib.derive('dirt');
      tmat.color.setHex(0xf4e2c8);
      // Round 11: the plateau is not one flat colour — pale sand at the ribbon, darker scoured
      // ground and a seeded mottle farther out (the terrain has no map detail at this scale).
      const col: number[] = [];
      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i]!;
        const z = pos[i + 2]!;
        const far = Math.min(1, Math.max(0, (Math.abs(z) - 3) / 30));
        const mottle = 0.9 + 0.1 * Math.sin(x * 0.37 + z * 0.9) * Math.sin(x * 0.11 - z * 0.23);
        const s = (1 - 0.3 * far) * mottle;
        col.push(s, s * (0.98 - 0.08 * far), s * (0.94 - 0.14 * far));
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      tmat.vertexColors = true;
      tmat.needsUpdate = true;
    }
    const m = new THREE.Mesh(g, fogify(tmat));
    m.receiveShadow = true;
    m.name = 'terrain';
    meshes.push(m);
  }

  if (biome.interior) {
    const hall = buildHall(track, biome, lib, rng, floorY, x0, x1, art, detail);
    meshes.push(...hall.meshes);
    singles.push(...hall.singles);
    batches.push(...hall.batches);
    flicker.push(...hall.flicker);
    lights.push(...hall.lights);
    scroll.push(...hall.scroll);
    fountains.push(...hall.fountains);
    lamps.push(...hall.lamps);
    textureBytes += hall.textureBytes;
  } else {
    // Exterior backdrop. Round 8: with the art pack the far layer is the painted plate
    // (2048×512, tiles in x, alpha-faded bottom) at z −140 and the sky panorama at z −330
    // (plus `scene.background`, set by the renderer); the near/mid geometry stays. Without
    // the pack: the three parallax silhouette tiers.
    const plateId = { canyon: 'plate-canyon', snow: 'plate-snow', nightCity: 'plate-nightcity' }[biome.id as 'canyon' | 'snow' | 'nightCity'];
    const skyId = { canyon: 'sky-canyon', snow: 'sky-snow', nightCity: 'sky-nightcity' }[biome.id as 'canyon' | 'snow' | 'nightCity'];
    const plateTex = plateId ? (art?.texture(plateId, true, true) ?? null) : null;
    const skyTex = skyId ? (art?.texture(skyId, true, true) ?? null) : null;
    if (plateTex && skyTex) {
      textureBytes += (art!.entry(plateId!)?.bytes ?? 0) + (art!.entry(skyId!)?.bytes ?? 0);
      // Sky: a 2:1 panorama; 2048 px ≈ 360° of azimuth at this distance, so one repeat per ~2000 m.
      const sz = -330;
      const sw = span * 3 + Math.abs(sz) * 2;
      const sh = sw / 2 / 2.4; // stretch: the panorama's horizon band sits low, the top third is plain sky
      skyTex.repeat.set(sw / 2000, 1);
      const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, fog: false, depthWrite: false, side: THREE.DoubleSide });
      // Sky quad: its lower edge well under the plate's horizon (the plate fades to alpha 0 at its foot).
      const sky = addPlane(sw, sh, skyMat, midX, floorY - 60 + sh / 2, sz);
      sky.receiveShadow = false;
      sky.renderOrder = -3;
      // Far plate: 4:1 strip, interest in the middle band, alpha fades out at the bottom so it
      // sits on the sky without a hard base line. 700 m of world per repeat keeps the mesas
      // building-sized; nightCity a little tighter.
      const pz = -200;
      const pw = span * 3 + Math.abs(pz) * 2;
      const perRepeat = biome.id === 'nightCity' ? 560 : 720;
      const ph = perRepeat / 4;
      plateTex.repeat.set(pw / perRepeat, 1);
      const plateMat = new THREE.MeshBasicMaterial({ map: plateTex, transparent: true, fog: false, depthWrite: false, side: THREE.DoubleSide });
      // The plate's horizon band (v ≈ 0.45) sits a few metres under deck eye level: the riding
      // camera pitches 11° down, so at 200 m the frame spans ≈ [cam − 95, cam + 12].
      const plateBase = floorY - 8 - 0.45 * ph;
      const plate = addPlane(pw, ph, plateMat, midX, plateBase + ph / 2, pz);
      plate.receiveShadow = false;
      plate.renderOrder = -2;
      // One near silhouette tier keeps the mid-ground depth step (fogged like the props).
      // Round 9: not for snow — the flat pine strip read as paper cut-outs in front of the
      // plate; the snow kit puts a row of real conifers at z −30…−44 instead.
      const near = biome.id === 'canyon' ? { z: -45, h: 26, kind: 'mesa' as const, color: 0x5a3a2c, yOff: -3 } : null; // snow: real conifers; nightCity (round 11): its block builds a 1024² lit silhouette at z −85 behind the viaduct tier
      if (near) {
      const st = biome.id === 'canyon' ? strataSilhouette(rng) : silhouette(near.kind, rng);
      textureBytes += 2048 * 512 * 4 * 1.33;
      const w = span * 3 + Math.abs(near.z) * 2;
      st.repeat.set(w / (near.h * 4), 1);
      const mat = new THREE.MeshStandardMaterial({ map: st, alphaTest: 0.5, color: near.color, roughness: 1, side: THREE.DoubleSide });
      if (biome.id === 'nightCity') {
        const grid = windowGrid(rng);
        mat.emissiveMap = grid.emissive;
        mat.emissive = new THREE.Color(0xffc080);
        mat.emissiveIntensity = 1.2;
        grid.emissive.repeat.set(w / 6, near.h / 6);
      }
      fogify(mat);
      const m = addPlane(w, near.h, mat, midX, floorY + near.h / 2 + near.yOff, near.z);
      m.receiveShadow = false;
      }
      if (biome.id === 'canyon') {
        // Round 11: a second strata tier between the mesa shoulders and the plate — the far
        // tier is a silhouette *with structure* (bands, talus foot), pinker with distance.
        for (const t of [{ z: -95, h: 44, color: 0x9a5c4a, yOff: -6 }, { z: -150, h: 62, color: 0xb87a66, yOff: -12 }]) {
          const st = strataSilhouette(rng);
          textureBytes += 1024 * 512 * 4 * 1.33;
          const w = span * 3 + Math.abs(t.z) * 2;
          st.repeat.set(w / (t.h * 4), 1);
          const mat = fogify(new THREE.MeshStandardMaterial({ map: st, alphaTest: 0.5, color: t.color, roughness: 1, side: THREE.DoubleSide }));
          const m = addPlane(w, t.h, mat, midX, floorY + t.h / 2 + t.yOff, t.z);
          m.receiveShadow = false;
        }
      }
    } else {
    const tiers: { z: number; h: number; kind: 'mesa' | 'pine' | 'city' | 'girder' | 'hills'; color: number; yOff: number }[] =
      biome.id === 'canyon'
        ? [
            { z: -45, h: 26, kind: 'mesa', color: 0x5a3a2c, yOff: -3 },
            { z: -130, h: 60, kind: 'mesa', color: 0x7a4c3a, yOff: -6 },
            { z: -340, h: 80, kind: 'mesa', color: 0x9a6a54, yOff: -18 },
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
      const st = biome.id === 'canyon' ? strataSilhouette(rng) : silhouette(t.kind, rng);
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
    }
    // Props along the course.
    const gyAt = (x: number, z: number): number => profileY(profile, x) - 0.42 - Math.min(1, (Math.abs(z) - 3) / 30) ** 2 * 2.5;
    // Round 11: every batched geometry needs a `color` attribute — PropBatch forces
    // `vertexColors` on its material and a standard material has no default attribute value, so
    // a geometry without one reads whatever generic colour the GL state last held (black in a
    // canyon frame: the deck's edge rocks). `vc` fills white where nothing is baked.
    const vc = (g: THREE.BufferGeometry): THREE.BufferGeometry => (g.getAttribute('color') ? g : setColors(g, () => [1, 1, 1]));
    const PB = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, shadows = true): PropBatch => new PropBatch(name, vc(geo), mat, shadows);
    if (biome.id === 'canyon') {
      // Round 11 ("industrial to the bar" propagated): a low warm key from the camera side, three
      // fog tiers each carrying content — near = boulders / snags / fence / tyre walls / drums at
      // deck level either side of the ribbon, mid = mesa shoulders with strata 12–40 m back, far =
      // strata silhouette planes (above) — a set piece per track, contact shadows under everything,
      // sand / rubble / ruts on the apron, light towers + fire barrels + bleachers at the gates.
      const strata = stratatexture(rng);
      textureBytes += 512 * 512 * 4 * 1.33;
      const strataMat = fogify(new THREE.MeshStandardMaterial({ map: strata, roughness: 0.95, color: 0xdcd0c4, vertexColors: true }));
      const mesaBatches: PropBatch[] = [];
      const mesaFar: PropBatch[] = [];
      for (let v = 0; v < 3; v++) {
        const geo = mesaGeometry((track.def.seed ^ (v * 7919)) >>> 0, v);
        mesaBatches.push(PB(`mesa${v}`, geo, strataMat));
        mesaFar.push(PB(`mesafar${v}`, geo, strataMat, false));
      }
      const pick = (): PropBatch => mesaBatches[rng.int(0, 2)]!;
      const pickFar = (): PropBatch => mesaFar[rng.int(0, 2)]!;
      const shadows = contactShadowBatch('contactshadow', 0.55, (m) => lib.complete(m));
      textureBytes += 128 * 128 * 4;
      const shadowAt = (x: number, y: number, z: number, r: number, sz = r): void => shadows.add(x, y + 0.01, z, rng.range(0, 6), r, null, 0, 1, sz);
      // Mid tier: mesa shoulders at z −12…−17 (low, wide) and the big formations at z −26…−36.
      for (let x = x0; x < x1; x += rng.range(8, 14)) {
        if (rng.next() < 0.25) continue;
        const h = rng.range(2.0, 4.2);
        const w = rng.range(6, 11);
        pick().add(x, gyAt(x, -14) - 0.7, -14 + rng.range(-2, 3), rng.range(0, 6), w, null, 0, h, w * rng.range(0.6, 1.0));
        if (rng.next() < 0.6) pick().add(x + rng.range(-5, 5), gyAt(x, -8.5) - 0.5, rng.range(-10.5, -7), rng.range(0, 6), rng.range(1.6, 3.4), null, 0, rng.range(0.7, 1.8), rng.range(1.6, 3.4));
      }
      for (let x = x0; x < x1; x += rng.range(11, 18)) {
        if (rng.next() < 0.3) continue;
        const h = rng.range(8, 16);
        const w = rng.range(14, 26);
        pick().add(x, gyAt(x, -28) - 2.5, -30 + rng.range(-4, 4), rng.range(0, 6), w, null, 0, h, w * rng.range(0.5, 0.9));
      }
      // Far shoulders at z −55…−75: big, no shadows, fogged to the second tier.
      for (let x = x0 - 40; x < x1 + 40; x += rng.range(18, 30)) {
        if (rng.next() < 0.25) continue;
        const h = rng.range(16, 30);
        const w = rng.range(30, 56);
        pickFar().add(x, gyAt(x, -33) - 6, rng.range(-75, -55), rng.range(0, 6), w, null, 0, h, w * rng.range(0.5, 0.9));
      }
      // Foreground: a low outcrop sliding past now and then (outside spawn keep-outs).
      for (let x = x0 + 20; x < x1; x += rng.range(36, 52)) if (!keepOut(x, 2.5)) pick().add(x, gyAt(x, 6) - 2.4, rng.range(5.5, 7.5), rng.range(0, 6), rng.range(2.5, 4), null, 0, rng.range(2.2, 3.6), 2.5);
      // Near tier kit.
      const rockMat = lib.get('rock');
      const boulders = [0, 1, 2].map((i) => PB(`boulder${i}`, bakeAO(rockGeometry((track.def.seed ^ (0x9e37 * (i + 1))) >>> 0, i === 2 ? 1 : 2), 1.4, 0.3), rockMat));
      const rubble = PB('rubble', rockGeometry(track.def.seed ^ 0x77, 1), rockMat, false);
      const scrubMat = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true }));
      const scrub = PB('scrub', scrubGeometry(track.def.seed ^ 0x33), scrubMat);
      const snagMat = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true }));
      const snags = PB('snag', snagGeometry(track.def.seed ^ 0x51), snagMat);
      const fence = PB('splitrail', splitRailGeometry(), lib.get('pallet'));
      const tyreWalls = PB('tyrewall', tyreWallGeometry(), lib.get('tyre'));
      const bales = PB('bale', baleGeometry(), lib.get('pallet'));
      const tyres = PB('tyres', tyreStackGeometry(), lib.get('tyre'));
      const drums = PB('drum', drumGeometry(), lib.get('barrelRed'));
      const spools = PB('spool', spoolGeometry(), lib.get('pallet'));
      const sandMat = new THREE.MeshStandardMaterial({ color: 0xe8d0a8, roughness: 1, map: radialDiscTexture(1.2), transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      lib.complete(sandMat);
      fogify(sandMat);
      const sand = PB('sand', new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), sandMat, false);
      const rutMat = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 1, map: radialDiscTexture(1.0), transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      lib.complete(rutMat);
      fogify(rutMat);
      const ruts = PB('rut', new THREE.CircleGeometry(1, 8).rotateX(-Math.PI / 2), rutMat, false);
      const boulderAt = (x: number, z: number, s: number, sy = s * rng.range(0.55, 0.9)): void => {
        const gy = gyAt(x, z);
        boulders[rng.int(0, 2)]!.add(x, gy + sy * 0.15, z, rng.range(0, 6), s, 0xd8c2a8, rng.range(-0.15, 0.15), sy, s * rng.range(0.8, 1.2));
        shadowAt(x, gy, z, s * 1.2);
      };
      // Rubble and sand along both ribbon edges, ruts on the apron where the deck is flat.
      for (let x = x0 + 4; x < x1; x += rng.range(1.2, 2.8)) {
        const side = rng.next() < 0.6 ? -1 : 1;
        const z = side * rng.range(2.75, 3.5);
        if (side > 0 && keepOut(x, 0.5)) continue;
        rubble.add(x, gyAt(x, z) + 0.03, z, rng.range(0, 6), rng.range(0.06, 0.15), 0xe8d4b8, rng.range(0, 3), rng.range(0.05, 0.12), rng.range(0.06, 0.15));
        if (rng.next() < 0.3) sand.add(x, gyAt(x, z * 1.3) + 0.012, z * 1.3, rng.range(0, 6), rng.range(0.8, 2.2), null, 0, 1, rng.range(0.5, 1.2));
      }
      for (let x = x0 + 8; x < x1; x += rng.range(5, 11)) {
        const slope = Math.abs(profileY(profile, x + 1.5) - profileY(profile, x - 1.5));
        if (slope > 0.2) continue;
        const z = rng.next() < 0.5 ? -2.55 : 2.55;
        if (z > 0 && keepOut(x, 2)) continue;
        ruts.add(x, gyAt(x, z) + 0.014, z, rng.range(-0.08, 0.08), 0.22, null, 0, 1, rng.range(2.0, 4.0));
      }
      // Near shelf (far side of the deck, z −3.6…−6.5): 2.4 m slots, a cluster on ~65 % of them.
      for (let x = x0 + 6; x < x1; x += 2.4) {
        const r = rng.next();
        if (r < 0.35) continue;
        const z = rng.range(-3.7, -6.2);
        const gy = gyAt(x, z);
        if (r < 0.55) boulderAt(x + rng.range(-0.5, 0.5), z, rng.range(0.35, 1.1));
        else if (r < 0.7) {
          scrub.add(x, gy - 0.05, z, rng.range(0, 6), rng.range(0.7, 1.5), null, 0, rng.range(0.6, 1.2), rng.range(0.7, 1.5));
          shadowAt(x, gy, z, 0.7);
        } else if (r < 0.78) {
          const sy = rng.range(2.8, 4.8);
          snags.add(x, gy - 0.1, z, rng.range(0, 6), 1, null, rng.range(-0.08, 0.08), sy, 1);
          shadowAt(x, gy, z, 0.45);
        } else if (r < 0.85) {
          drums.add(x, gy, z, rng.range(0, 6), 1, rng.next() < 0.5 ? 0xd8d2c4 : null);
          if (rng.next() < 0.5) drums.add(x + 0.7, gy, z + 0.3, rng.range(0, 6), 1, 0x6a6a68);
          shadowAt(x + 0.3, gy, z + 0.15, 0.9);
        } else if (r < 0.9) {
          bales.add(x, gy, z, rng.range(-0.3, 0.3));
          if (rng.next() < 0.5) bales.add(x + 1.3, gy, z + rng.range(-0.3, 0.3), rng.range(-0.3, 0.3));
          shadowAt(x + 0.6, gy, z, 1.3, 0.9);
        } else if (r < 0.95) {
          tyres.add(x, gy, z, 0);
          shadowAt(x, gy, z, 0.6);
        } else {
          spools.add(x, gy, z, rng.range(-0.3, 0.3));
          shadowAt(x, gy, z, 0.8);
        }
      }
      // Split-rail fence runs along the far edge (z −4.4) and the near edge (z +4.3, outside keep-outs), tyre walls on steep bits.
      for (let x = x0 + 10; x < x1; x += rng.range(14, 30)) {
        const n = rng.int(3, 7);
        const far = rng.next() < 0.6;
        const z = far ? -4.4 : 4.3;
        for (let i = 0; i < n; i++) {
          const fx = x + i * 2.5;
          if (!far && keepOut(fx, 1.3)) continue;
          const gy = gyAt(fx, z);
          fence.add(fx, gy, z, rng.range(-0.04, 0.04) + (far ? 0 : Math.PI));
          shadowAt(fx, gy, z, 1.3, 0.35);
        }
      }
      for (let x = x0 + 12; x < x1; x += rng.range(20, 40)) {
        const slope = profileY(profile, x + 2) - profileY(profile, x - 2);
        if (Math.abs(slope) < 0.35 && rng.next() < 0.6) continue;
        const gy = gyAt(x, -3.7);
        tyreWalls.add(x, gy, -3.7, rng.range(-0.05, 0.05));
        shadowAt(x, gy, -3.7, 1.6, 0.5);
      }
      // Near ledge in front (z +3.6…+5.2): only things ≤ 0.6 m, never inside a spawn keep-out.
      for (let x = x0 + 6; x < x1; x += rng.range(2.2, 4.5)) {
        if (keepOut(x, 1)) continue;
        const z = rng.range(3.6, 5.2);
        const gy = gyAt(x, z);
        const r = rng.next();
        if (r < 0.45) boulderAt(x, z, rng.range(0.25, 0.55), rng.range(0.15, 0.35));
        else if (r < 0.8) {
          scrub.add(x, gy - 0.1, z, rng.range(0, 6), rng.range(0.6, 1.1), null, 0, rng.range(0.4, 0.6), rng.range(0.6, 1.1));
          shadowAt(x, gy, z, 0.55);
        } else if (r < 0.9) {
          tyres.add(x, gy - 0.05, z, 0, 1, null, 0, 0.5, 1);
          shadowAt(x, gy, z, 0.5);
        } else sand.add(x, gy + 0.012, z, rng.range(0, 6), rng.range(1.0, 1.8));
      }
      // Mid band (z −6.5…−12): bigger boulders, scrub, snags, the odd drum cluster.
      for (let x = x0 + 4; x < x1; x += rng.range(3, 6)) {
        const z = rng.range(-6.5, -12);
        const gy = gyAt(x, z);
        const r = rng.next();
        if (r < 0.4) boulderAt(x, z, rng.range(0.7, 1.8));
        else if (r < 0.8) {
          scrub.add(x, gy - 0.05, z, rng.range(0, 6), rng.range(0.9, 1.7), null, 0, rng.range(0.7, 1.3), rng.range(0.9, 1.7));
          shadowAt(x, gy, z, 0.8);
        } else {
          snags.add(x, gy - 0.1, z, rng.range(0, 6), 1.2, null, rng.range(-0.1, 0.1), rng.range(3.5, 5.5), 1.2);
          shadowAt(x, gy, z, 0.5);
        }
      }
      // Set piece per track: e1 water tower + windmill, e2 rusted pickup + drum dump, e3 mine portal.
      const setKind = track.def.id.startsWith('e1') ? 0 : track.def.id.startsWith('e2') ? 1 : track.def.id.startsWith('e3') ? 2 : track.def.seed % 3;
      const setX = track.bounds.minX + (track.bounds.maxX - track.bounds.minX) * 0.45;
      const singleMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry: number, s = 1): void => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.rotation.y = ry;
        m.scale.setScalar(s);
        m.castShadow = true;
        m.receiveShadow = true;
        meshes.push(m);
      };
      if (setKind === 0) {
        singleMesh(bakeAO(waterTowerGeometry(), 3, 0.3), lib.get('rustSteel'), setX, gyAt(setX, -9) - 0.2, -9, 0.3);
        shadowAt(setX, gyAt(setX, -9), -9, 3.2);
        const wx = setX + 70;
        singleMesh(bakeAO(windmillGeometry(), 2, 0.3), lib.get('darkSteel'), wx, gyAt(wx, -8) - 0.1, -8, 0.2);
        shadowAt(wx, gyAt(wx, -8), -8, 1.2);
      } else if (setKind === 1) {
        const pk = PB('pickup', pickupGeometry(), lib.get('rustSteel'));
        pk.add(setX, gyAt(setX, -6.5), -6.5, 0.35, 1, 0xa86a3a);
        shadowAt(setX, gyAt(setX, -6.5), -6.5, 2.6, 1.4);
        const px = setX + 60;
        if (!keepOut(px, 3)) {
          pk.add(px, gyAt(px, 7) - 0.4, 7, -2.6, 1, 0x6a7a80);
          shadowAt(px, gyAt(px, 7) - 0.4, 7, 2.6, 1.4);
        }
        for (let i = 0; i < 7; i++) drums.add(setX - 5 + i * 0.75 + rng.range(-0.2, 0.2), gyAt(setX - 5 + i * 0.75, -5.5), -5.5 + rng.range(-0.4, 0.4), rng.range(0, 6), 1, i % 3 === 0 ? 0xd8d2c4 : i % 3 === 1 ? 0x2a4f7a : null);
        batches.push(pk);
      } else {
        singleMesh(minePortalGeometry(), lib.get('pallet'), setX, gyAt(setX, -7.5), -7.5, 0, 1.15);
        shadowAt(setX, gyAt(setX, -7.5), -7.5, 2.2);
        pick().add(setX, gyAt(setX, -12) - 1.5, -12, rng.range(0, 6), 12, null, 0, 6, 8);
        for (let i = 0; i < 4; i++) spools.add(setX + 4 + i * 1.4, gyAt(setX + 4 + i * 1.4, -5), -5 + rng.range(-0.3, 0.3), rng.range(-0.3, 0.3));
      }
      // Start / finish as an event: light towers (real follow spots via `kit.lamps`), a generator,
      // fire barrels (`kit.fountains` + `meltLights`), bleachers behind the crowd.
      const towers = PB('lighttower', lightTowerGeometry(), lib.get('darkSteel'));
      const headMat = fogify(new THREE.MeshStandardMaterial({ color: 0x202020, emissive: 0xfff0d8, emissiveIntensity: 4, roughness: 0.4 }));
      const towerHeads = PB('lighttowerhead', lightTowerHeadsGeometry(), headMat, false);
      const generator = PB('generator', bakeAO(new THREE.BoxGeometry(2.2, 1.3, 1.1).translate(0, 0.65, 0), 1.3, 0.35), lib.get('barrelWhite'));
      const braziers = PB('brazier', brazierGeometry(), lib.get('rustSteel'));
      const fireMat = fogify(new THREE.MeshStandardMaterial({ color: 0x1a0a04, emissive: 0xff7a1a, emissiveIntensity: 1.7, roughness: 0.6 }));
      flicker.push(fireMat);
      const fires = PB('brazierfire', brazierFireGeometry(), fireMat, false);
      const bleacherGeo = bakeAO(mergeGeometries([0, 1, 2].map((i) => new THREE.BoxGeometry(1, 0.45, 0.9).translate(0, 0.225 + i * 0.45, -i * 0.9)), false)!, 1.4, 0.35);
      const bleachers = PB('bleacher', bleacherGeo, lib.get('darkSteel'));
      for (const ex of [track.def.start.pos.x, track.def.finishX]) {
        for (const dx of [-7, 7]) {
          const tx = ex + dx;
          const z = -3.7;
          const gy = gyAt(tx, z);
          towers.add(tx, gy, z, 0);
          towerHeads.add(tx, gy, z, 0);
          lamps.push({ x: tx, y: gy + 6.6, z: z + 0.4 });
          shadowAt(tx, gy, z, 1.1);
        }
        generator.add(ex - 9.5, gyAt(ex - 9.5, -4.2), -4.2, 0.1);
        shadowAt(ex - 9.5, gyAt(ex - 9.5, -4.2), -4.2, 1.4, 0.8);
        for (const dx of [-10.5, 9.5]) {
          const bx = ex + dx;
          const gy = gyAt(bx, -6.6);
          braziers.add(bx, gy, -6.6, 0);
          fires.add(bx, gy, -6.6, 0);
          fountains.push({ x: bx, y: gy + 1.0, z: -6.6 });
          shadowAt(bx, gy, -6.6, 0.6);
        }
        const bw = 16;
        bleachers.add(ex - 1, gyAt(ex - 1, -7.2) - 0.1, -7.2, 0, bw, null, 0, 1, 1);
      }
      // Fire barrels along the course every ~70 m (sunset: the warm pools read).
      for (let x = track.bounds.minX + 40; x < track.bounds.maxX - 20; x += rng.range(60, 90)) {
        const z = -4.6;
        const gy = gyAt(x, z);
        braziers.add(x, gy, z, 0);
        fires.add(x, gy, z, 0);
        fountains.push({ x, y: gy + 1.0, z });
        shadowAt(x, gy, z, 0.6);
      }
      batches.push(...mesaBatches, ...mesaFar, ...boulders, rubble, scrub, snags, fence, tyreWalls, bales, tyres, drums, spools, sand, ruts, towers, towerHeads, generator, braziers, fires, bleachers, shadows);
    } else if (biome.id === 'snow') {
      // Round 11: pale low key from the camera side, blue-white fog in three tiers with detail in
      // every tier — near = fence posts with snow caps, lanterns (real follow spots), firewood,
      // sleds, barrels, braziers; mid = cabins with glowing windows (the reference's depth cue), a
      // lift station / lodge / ice curtain per track, conifers with real branch tiers; far = ridge
      // tree lines. Contact shadows, drift lines against every prop, ice patches, ruts, gravel edges.
      const pineMat = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, vertexColors: true }));
      const capMat = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, vertexColors: true }));
      const trees = [0, 1, 2].map((i) => coniferGeometry2((track.def.seed ^ (0x2f6b * (i + 1))) >>> 0));
      const pines = trees.map((t, i) => PB(`pine${i}`, t.tree, pineMat));
      const caps = trees.map((t, i) => PB(`pinecap${i}`, t.snow, capMat, false));
      const pinesFar = trees.map((t, i) => PB(`pinefar${i}`, t.tree, pineMat, false));
      const capsFar = trees.map((t, i) => PB(`pinecapfar${i}`, t.snow, capMat, false));
      const treeAt = (x: number, y: number, z: number, sc: number, near: boolean): void => {
        const i = rng.int(0, 2);
        const ry = rng.range(0, 6);
        (near ? pines : pinesFar)[i]!.add(x, y, z, ry, sc);
        (near ? caps : capsFar)[i]!.add(x, y, z, ry, sc);
      };
      const bankMat = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, vertexColors: true }));
      const banks = PB('snowbank', snowBankGeometry(track.def.seed ^ 0x55), bankMat, false);
      const shadows = contactShadowBatch('contactshadow', 0.32, (m) => lib.complete(m));
      textureBytes += 128 * 128 * 4;
      const shadowAt = (x: number, y: number, z: number, r: number, sz = r): void => shadows.add(x, y + 0.01, z, rng.range(0, 6), r, null, 0, 1, sz);
      /** Drift line: a low bank against the windward side of a prop. */
      const driftAt = (x: number, y: number, z: number, r: number): void => banks.add(x + rng.range(-0.2, 0.2), y - 0.05, z - r * 0.5, rng.range(0, 6), r * 1.3, null, 0, r * 0.35, r * 0.7);
      const crates = PB('crate', bakeAO(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 1, 0.3), lib.get('plywood'));
      const crateSnow = PB('cratesnow', new THREE.BoxGeometry(1.06, 0.14, 1.06).translate(0, 1.05, 0), capMat, false);
      const posts = PB('post', new THREE.CylinderGeometry(0.06, 0.08, 1, 8).translate(0, 0.5, 0), lib.get('darkSteel'));
      const woodPosts = PB('woodpost', bakeAO(new THREE.BoxGeometry(0.14, 1, 0.14).translate(0, 0.5, 0), 1, 0.3), lib.get('pallet'));
      const postCaps = PB('postcap', new THREE.BoxGeometry(0.2, 0.1, 0.2).translate(0, 0.04, 0), capMat, false);
      const fence = PB('fence', new THREE.BoxGeometry(2.4, 0.06, 0.04).translate(0, 0.9, 0), lib.get('plywood'));
      const fenceSnow = PB('fencesnow', new THREE.BoxGeometry(2.4, 0.05, 0.08).translate(0, 0.955, 0), capMat, false);
      const lanterns = PB('lantern', lanternGeometry(), lib.get('darkSteel'), false);
      const glassMat = fogify(new THREE.MeshStandardMaterial({ color: 0x3a2a14, emissive: 0xffb648, emissiveIntensity: 1.5, roughness: 0.4 }));
      const glass = PB('lanternglass', lanternGlassGeometry(), glassMat, false);
      const logs = PB('logpile', logPileGeometry(), lib.get('pallet'));
      const sleds = PB('sled', sledGeometry(), lib.get('pallet'));
      const drums = PB('drum', drumGeometry(), lib.get('barrelBlue'));
      const gravel = PB('gravel', rockGeometry(track.def.seed ^ 0x71, 1), lib.get('darkSteel'), false);
      const iceMat = new THREE.MeshStandardMaterial({ color: 0xc4dcec, roughness: 0.14, metalness: 0.05, map: radialDiscTexture(0.7), transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      lib.complete(iceMat);
      fogify(iceMat);
      const ice = PB('icepatch', new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), iceMat, false);
      const rutMat = new THREE.MeshStandardMaterial({ color: 0x506070, roughness: 1, map: radialDiscTexture(1.0), transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      lib.complete(rutMat);
      fogify(rutMat);
      const ruts = PB('rut', new THREE.CircleGeometry(1, 8).rotateX(-Math.PI / 2), rutMat, false);
      // Cabins: timber body, dark gable, snow load, warm windows (emissive; they are the depth cue in the fog).
      const timber = lib.derive('plank');
      timber.color.setHex(0x4e3c2c);
      const cabins = PB('cabin', cabinBodyGeometry(), timber);
      const roofMat = lib.derive('darkSteel');
      roofMat.color.setHex(0x2c2624);
      roofMat.metalness = 0.2;
      const roofs = PB('cabinroof', gableGeometry(), roofMat);
      const roofSnow = PB('cabinsnow', gableSnowGeometry(), capMat, false);
      const windowMat = fogify(new THREE.MeshStandardMaterial({ color: 0x3a2a18, emissive: 0xffc070, emissiveIntensity: 1.9, roughness: 0.3 }));
      const windows = PB('window', new THREE.PlaneGeometry(0.8, 1.0).translate(0, 0.5, 0), windowMat, false);
      const doors = PB('door', new THREE.PlaneGeometry(1.0, 2.0).translate(0, 1.0, 0), lib.get('darkSteel'), false);
      const chimneys = PB('chimney', new THREE.BoxGeometry(0.6, 1, 0.6).translate(0, 0.5, 0), lib.get('brick'), false);
      const cabinAt = (x: number, z: number, w: number, h: number, d: number, ry: number, big = false): void => {
        const gy = gyAt(x, z) - 0.15;
        cabins.add(x, gy, z, ry, w, null, 0, h, d);
        roofs.add(x, gy + h, z, ry, w, null, 0, d * 0.55, d);
        roofSnow.add(x, gy + h, z, ry, w, null, 0, d * 0.55, d);
        chimneys.add(x + w * 0.25, gy + h + d * 0.2, z, ry, 1, null, 0, d * 0.45, 1);
        const cs = Math.cos(ry);
        const sn = Math.sin(ry);
        // Front face (+z local) toward the camera: windows either side of a door, more on a lodge.
        const n = big ? Math.floor(w / 2.2) : Math.floor(w / 2.6);
        for (let i = 0; i < n; i++) {
          const lx = (i - (n - 1) / 2) * (w / n);
          const lz = d / 2 + 0.02;
          const lit = rng.next() < 0.8;
          if (!lit) continue;
          const isDoor = !big && i === Math.floor(n / 2) && n >= 3;
          (isDoor ? doors : windows).add(x + lx * cs + lz * sn, gy + (isDoor ? 0 : 1.1), z - lx * sn + lz * cs, ry);
          if (big && h > 4.5) windows.add(x + lx * cs + lz * sn, gy + 3.3, z - lx * sn + lz * cs, ry);
        }
        // One window on each gable end.
        for (const s of [-1, 1]) {
          const lx = s * (w / 2 + 0.02);
          windows.add(x + lx * cs, gy + 1.1, z - lx * sn, ry + s * Math.PI / 2);
        }
        driftAt(x - w * 0.3, gy + 0.15, z + d / 2 + 0.2, 1.4);
        driftAt(x + w * 0.3, gy + 0.15, z + d / 2 + 0.2, 1.1);
        shadowAt(x, gy + 0.15, z + d / 2 + 0.3, w * 0.6, 0.8);
      };
      // Set piece per track: m2 = lift station (pylons, cable, chairs over the course), x1 = lodge + ice curtain.
      const isX1 = track.def.id.startsWith('x1');
      const isM2 = track.def.id.startsWith('m2');
      const setX = track.bounds.minX + (track.bounds.maxX - track.bounds.minX) * 0.5;
      if (isM2 || (!isX1 && track.def.seed % 2 === 0)) {
        const pylons = PB('liftpylon', liftPylonGeometry(), lib.get('darkSteel'));
        const chairs = PB('liftchair', liftChairGeometry(), lib.get('darkSteel'), false);
        const cableGeos: THREE.BufferGeometry[] = [];
        const pz = -8.5;
        let prev: [number, number] | null = null;
        for (let x = track.bounds.minX + 12; x < track.bounds.maxX + 10; x += 42) {
          const gy = gyAt(x, pz);
          pylons.add(x, gy - 0.2, pz, 0);
          shadowAt(x, gy, pz, 1.4);
          driftAt(x, gy, pz + 0.8, 1.5);
          if (prev) {
            for (const cz of [pz - 1.4, pz + 1.4]) {
              const L = Math.hypot(x - prev[0], gy - prev[1]);
              const c = new THREE.BoxGeometry(L, 0.05, 0.05).translate(L / 2, 0, 0).rotateZ(Math.atan2(gy - prev[1], x - prev[0])).translate(prev[0], prev[1] + 8.4, cz);
              cableGeos.push(c);
            }
            for (let t = 0.12; t < 0.95; t += 0.2) {
              const cx = prev[0] + (x - prev[0]) * t;
              const cy = prev[1] + (gy - prev[1]) * t + 8.4 - 0.5 * Math.sin(t * Math.PI);
              chairs.add(cx, cy, pz + 1.4, 0);
            }
          }
          prev = [x, gy - 0.2];
        }
        if (cableGeos.length) {
          const m = new THREE.Mesh(vc(mergeGeometries(cableGeos, false)!), lib.get('darkSteel'));
          m.name = 'lift:cable';
          m.frustumCulled = false;
          meshes.push(m);
        }
        // Lift station: a wide low shed at the bottom pylon with a lit interior.
        const sx = track.bounds.minX + 12;
        cabinAt(sx + 6, -14, 12, 3.6, 7, 0.05, true);
        batches.push(pylons, chairs);
      } else {
        // Lodge with two rows of windows and a frozen waterfall further on.
        cabinAt(setX, -17, 18, 6.2, 9, 0.06, true);
        const iceSolid = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.18, metalness: 0.02, vertexColors: true }));
        lib.complete(iceSolid);
        const curtain = PB('icecurtain', iceCurtainGeometry(track.def.seed ^ 0x1ce), iceSolid);
        const cx = track.bounds.minX + (track.bounds.maxX - track.bounds.minX) * 0.72;
        curtain.add(cx, gyAt(cx, -11) - 0.6, -11, 0, 9, null, 0, 10, 9);
        curtain.add(cx + 7, gyAt(cx + 7, -12) - 0.6, -12, 0.3, 5, null, 0, 6, 5);
        pinesFar[0]!.add(cx - 8, gyAt(cx - 8, -14) - 0.6, -14, 0, 1.4);
        capsFar[0]!.add(cx - 8, gyAt(cx - 8, -14) - 0.6, -14, 0, 1.4);
        batches.push(curtain);
      }
      // Cabins every 24–40 m in the mid tier (skipping the set piece's stretch).
      for (let x = x0 + 18; x < x1 - 10; x += rng.range(24, 40)) {
        if (Math.abs(x - setX) < 16) continue;
        const z = rng.range(-13, -27);
        cabinAt(x, z, rng.range(5, 8.5), rng.range(2.8, 3.5), rng.range(4, 6), rng.range(-0.25, 0.25));
      }
      // Snow banks hugging the trail on both sides (the ploughed edge), gravel showing through at the edge.
      for (let x = x0 + 2; x < x1; x += rng.range(2.2, 4.5)) {
        if (rng.next() > 0.25) banks.add(x, profileY(profile, x) - 0.55, rng.range(-4.2, -3.0), rng.range(0, 6), rng.range(1.4, 2.8), null, 0, rng.range(0.45, 0.9), rng.range(0.7, 1.1));
        if (rng.next() > 0.55 && !keepOut(x, 1.5)) banks.add(x, profileY(profile, x) - 0.6, rng.range(3.6, 4.6), rng.range(0, 6), rng.range(1.0, 2.0), null, 0, rng.range(0.3, 0.6), rng.range(0.5, 0.8));
        for (let k = 0; k < 3; k++) {
          const side = rng.next() < 0.6 ? -1 : 1;
          const gz = side * rng.range(2.7, 3.3);
          if (side > 0 && keepOut(x, 0.5)) continue;
          gravel.add(x + rng.range(-1, 1), gyAt(x, gz) + 0.02, gz, rng.range(0, 6), rng.range(0.06, 0.16), 0x5a5e66, 0, rng.range(0.04, 0.1), rng.range(0.06, 0.16));
        }
      }
      // Ice patches and ruts on the apron beside the deck where it is flat.
      for (let x = x0 + 8; x < x1; x += rng.range(6, 13)) {
        const slope = Math.abs(profileY(profile, x + 1.5) - profileY(profile, x - 1.5));
        if (slope > 0.2) continue;
        const z = rng.next() < 0.55 ? rng.range(-2.4, -3.2) : rng.range(2.4, 3.2);
        if (z > 0 && keepOut(x, 2)) continue;
        if (rng.next() < 0.5) ice.add(x, gyAt(x, z) + 0.014, z, rng.range(0, 6), rng.range(0.8, 1.8), null, 0, 1, rng.range(0.5, 1.0));
        else ruts.add(x, gyAt(x, z) + 0.014, z, rng.range(-0.08, 0.08), 0.22, null, 0, 1, rng.range(2.0, 4.5));
      }
      // Far tier: ridge tree lines at z −60…−85 (big, unshadowed) and the mid conifer row at z −24…−40.
      for (let x = x0 - 60; x < x1 + 60; x += rng.range(5, 9)) {
        treeAt(x, gyAt(x, -33) - 4 + rng.range(-1, 1), rng.range(-85, -60), rng.range(2.0, 3.2), false);
      }
      for (let x = x0 - 40; x < x1 + 40; x += rng.range(7, 13)) {
        const z = rng.range(-40, -24);
        treeAt(x, gyAt(x, Math.max(z, -28)) - 0.6, z, rng.range(1.1, 1.7), false);
      }
      // Near shelf (z −3.7…−6.5): 2.4 m slots, a cluster on ~65 %.
      for (let x = x0 + 6; x < x1; x += 2.4) {
        const r = rng.next();
        if (r < 0.35) continue;
        const z = rng.range(-3.7, -6.5);
        const gy = gyAt(x, z);
        if (r < 0.5) {
          const sc = rng.range(0.55, 0.95);
          treeAt(x, gy - 0.3, z - 1.5, sc, true);
          shadowAt(x, gy, z - 1.5, 1.3 * sc);
          driftAt(x, gy, z - 1.5, 1.2);
        } else if (r < 0.6) {
          logs.add(x, gy, z, rng.range(-0.2, 0.2));
          shadowAt(x, gy, z, 0.9, 0.7);
          driftAt(x, gy, z, 0.9);
        } else if (r < 0.68) {
          sleds.add(x, gy, z, rng.range(-0.5, 0.5));
          shadowAt(x, gy, z, 0.7, 0.4);
        } else if (r < 0.76) {
          drums.add(x, gy, z, rng.range(0, 6), 1, rng.next() < 0.5 ? 0xd8d2c4 : null);
          crateSnow.add(x, gy - 0.15, z, 0, 0.62);
          shadowAt(x, gy, z, 0.55);
          driftAt(x, gy, z, 0.6);
        } else if (r < 0.86) {
          const sc = rng.range(0.8, 1.3);
          const ry = rng.range(-0.3, 0.3);
          crates.add(x, gy, z, ry, sc);
          crateSnow.add(x, gy, z, ry, sc);
          shadowAt(x, gy, z, 0.8 * sc);
          driftAt(x, gy, z, 0.9 * sc);
        } else {
          // Lantern post: a real follow-spot pool (kit.lamps) and a warm bulb.
          woodPosts.add(x, gy, z, 0, 1, null, 0, 2.7, 1);
          postCaps.add(x, gy + 2.7, z, 0, 1.4);
          lanterns.add(x, gy + 2.55, z + 0.3, 0);
          glass.add(x, gy + 2.55, z + 0.3, 0);
          lamps.push({ x, y: gy + 2.05, z: z + 0.3 }); // the follow spot parks 0.2 m under this: below the cage, not inside it
          shadowAt(x, gy, z, 0.35);
        }
      }
      // Fence runs with snow caps along the far edge (z −4.3) and near edge (z +4.2).
      for (let x = x0 + 10; x < x1; x += rng.range(16, 34)) {
        const n = rng.int(3, 7);
        const far = rng.next() < 0.6;
        const z = far ? -4.3 : 4.2;
        for (let i = 0; i <= n; i++) {
          const fx = x + i * 2.4;
          if (!far && keepOut(fx, 1.3)) continue;
          const gy = gyAt(fx, z);
          woodPosts.add(fx - 1.2, gy, z, 0, 1, null, 0, 1.05, 1);
          postCaps.add(fx - 1.2, gy + 1.05, z, 0);
          if (i < n) {
            fence.add(fx, gy, z, 0);
            fenceSnow.add(fx, gy, z, 0);
          }
          shadowAt(fx - 1.2, gy, z, 0.3);
        }
      }
      // Near ledge in front (z +3.6…+5.2): low things only, outside keep-outs.
      for (let x = x0 + 6; x < x1; x += rng.range(2.5, 5)) {
        if (keepOut(x, 1)) continue;
        const z = rng.range(3.6, 5.2);
        const gy = gyAt(x, z);
        const r = rng.next();
        if (r < 0.4) banks.add(x, gy - 0.3, z, rng.range(0, 6), rng.range(1.0, 1.8), null, 0, rng.range(0.3, 0.5), rng.range(0.6, 1.0));
        else if (r < 0.65) {
          sleds.add(x, gy - 0.05, z, rng.range(-0.6, 0.6));
          shadowAt(x, gy, z, 0.7, 0.4);
        } else if (r < 0.85) {
          logs.add(x, gy - 0.1, z, rng.range(-0.3, 0.3), 0.8, null, 0, 0.6, 0.8);
          shadowAt(x, gy, z, 0.8, 0.6);
        } else {
          woodPosts.add(x, gy - 0.1, z, 0, 1, null, 0, 0.9, 1);
          postCaps.add(x, gy + 0.8, z, 0);
          shadowAt(x, gy, z, 0.3);
        }
      }
      // Mid band (z −7…−16): conifers, crates, the odd tall lamp post.
      for (let x = x0 + 4; x < x1; x += rng.range(3.5, 7)) {
        const z = rng.range(-7, -16);
        const gy = gyAt(x, z);
        const r = rng.next();
        if (r < 0.7) {
          const sc = rng.range(0.7, 1.4);
          treeAt(x, gy - 0.4, z, sc, true);
          shadowAt(x, gy, z, 1.4 * sc);
          if (rng.next() < 0.5) banks.add(x + rng.range(-1, 1), gy - 0.3, z + rng.range(-1, 1), rng.range(0, 6), rng.range(1.5, 3), null, 0, rng.range(0.4, 0.8), rng.range(1.5, 3));
        } else if (r < 0.85) {
          const sc = rng.range(0.8, 1.3);
          const ry = rng.range(-0.3, 0.3);
          crates.add(x, gy, z, ry, sc);
          crateSnow.add(x, gy, z, ry, sc);
          shadowAt(x, gy, z, 0.8 * sc);
        } else {
          posts.add(x, gy, z, 0, 1, null, 0, 3.4, 1);
          lanterns.add(x, gy + 3.4, z + 0.3, 0);
          glass.add(x, gy + 3.4, z + 0.3, 0);
          shadowAt(x, gy, z, 0.3);
        }
        if (rng.next() < 0.1 && !keepOut(x + 2, 2)) {
          const fz = rng.range(6.5, 8.5);
          treeAt(x + 2, gyAt(x + 2, fz) - 1.0, fz, rng.range(0.9, 1.4), true);
        }
      }
      // Event start / finish: string lights over the gate and along the barrier, braziers
      // (`kit.fountains` + `meltLights`), firewood stacks, flags come from the gates kit.
      const bulbMat = fogify(new THREE.MeshStandardMaterial({ color: 0x402a10, emissive: 0xffd080, emissiveIntensity: 1.8, roughness: 0.4 }));
      const bulbs = PB('stringbulb', new THREE.SphereGeometry(0.07, 6, 5), bulbMat, false);
      const cables = PB('stringcable', new THREE.BoxGeometry(1, 0.02, 0.02).translate(0.5, 0, 0), lib.get('darkSteel'), false);
      const braziers = PB('brazier', brazierGeometry(), lib.get('rustSteel'));
      const fireMat = fogify(new THREE.MeshStandardMaterial({ color: 0x1a0a04, emissive: 0xff7a1a, emissiveIntensity: 1.7, roughness: 0.6 }));
      flicker.push(fireMat);
      const fires = PB('brazierfire', brazierFireGeometry(), fireMat, false);
      for (const ex of [track.def.start.pos.x, track.def.finishX]) {
        const gy0 = profileY(profile, ex);
        // Over the gate: a sagging string across the deck at gate height.
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          const z = -2.3 + 4.6 * t;
          const y = gy0 + 5.1 - 0.35 * Math.sin(t * Math.PI);
          bulbs.add(ex - 1.0, y - 0.08, z);
          if (i < 10) {
            const zn = -2.3 + 4.6 * ((i + 1) / 10);
            const yn = gy0 + 5.1 - 0.35 * Math.sin(((i + 1) / 10) * Math.PI);
            const L = Math.hypot(zn - z, yn - y);
            cables.add(ex - 1.0, y, z, Math.PI / 2, L, null, Math.atan2(yn - y, zn - z), 1, 1);
          }
        }
        // Along the crowd barrier on posts at 2.2 m.
        const xa = ex - 9;
        const xb = ex + 7;
        for (let x = xa; x <= xb + 0.01; x += 4) {
          const gy = gyAt(x, -4.15);
          woodPosts.add(x, gy, -4.15, 0, 1, null, 0, 2.3, 1);
          postCaps.add(x, gy + 2.3, -4.15, 0, 1.2);
          if (x + 4 <= xb + 0.01) {
            const gyn = gyAt(x + 4, -4.15);
            for (let k = 0; k <= 5; k++) {
              const t = k / 5;
              bulbs.add(x + 4 * t, gy + (gyn - gy) * t + 2.2 - 0.25 * Math.sin(t * Math.PI) - 0.07, -4.15);
            }
            cables.add(x, gy + 2.2, -4.15, 0, Math.hypot(4, gyn - gy), null, Math.atan2(gyn - gy, 4), 1, 1);
          }
        }
        for (const dx of [-10.5, 9.5]) {
          const bx = ex + dx;
          const gy = gyAt(bx, -6.4);
          braziers.add(bx, gy, -6.4, 0);
          fires.add(bx, gy, -6.4, 0);
          fountains.push({ x: bx, y: gy + 1.0, z: -6.4 });
          shadowAt(bx, gy, -6.4, 0.6);
          driftAt(bx, gy, -6.4, 0.7);
          logs.add(bx + 1.6, gyAt(bx + 1.6, -6.6), -6.6, 0.1);
        }
      }
      // Braziers at the checkpoints too (the pools mark the spawns in the fog).
      for (const cp of track.def.checkpoints) {
        const bx = cp.x + 8;
        const gy = gyAt(bx, -5.8);
        braziers.add(bx, gy, -5.8, 0);
        fires.add(bx, gy, -5.8, 0);
        fountains.push({ x: bx, y: gy + 1.0, z: -5.8 });
        shadowAt(bx, gy, -5.8, 0.6);
      }
      batches.push(banks, ...pines, ...caps, ...pinesFar, ...capsFar, crates, crateSnow, posts, woodPosts, postCaps, fence, fenceSnow, lanterns, glass, logs, sleds, drums, gravel, ice, ruts, cabins, roofs, roofSnow, windows, doors, chimneys, bulbs, cables, braziers, fires, shadows);
    } else {
      // nightCity (round 11, "industrial to the bar" recipe): the street is built at deck level —
      // near facades with lit shops at z −12, parked cars / dumpsters / bollards / hydrants /
      // scaffolding / fire escapes in the band z −4…−12, a box truck sliding past in the
      // foreground (z +6, the reference's occluder), wet asphalt with lane paint, manholes,
      // puddles and paper; the street lamps are real camera-following spots (`kit.lamps` +
      // `Biome.lampLights`), the fire barrels real point lights (`kit.fountains` + `meltLights`);
      // mid tier = the second building row + an elevated rail viaduct at z −30; far tier = a
      // 1024² city silhouette with lit windows at z −85 in front of the painted plate.
      const facades = [facadeTexture(rng, 'office'), facadeTexture(rng, 'apartment'), facadeTexture(rng, 'brick')];
      for (const f of facades) {
        f.map.repeat.set(2.5, 4);
        f.emissive.repeat.set(2.5, 4);
      }
      textureBytes += 512 * 512 * 4 * 1.33 * 2 * 3;
      const bBatches: PropBatch[] = facades.map((f, i) => {
        const m = fogify(new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissive, emissive: 0xffd6a0, emissiveIntensity: 1.25, roughness: 0.85, vertexColors: true }));
        return new PropBatch(`building${i}`, bakeAO(buildingGeometry(), 1, 0.35), m);
      });
      const roofMat = fogify(new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.9, vertexColors: true }));
      const roofs = new PropBatch('roofkit', rooftopGeometry(), roofMat);
      const shop = shopfrontTexture(rng);
      textureBytes += 1024 * 256 * 4 * 1.33 * 2;
      const shopMat = fogify(new THREE.MeshStandardMaterial({ map: shop.map, emissiveMap: shop.emissive, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.7 }));
      shop.map.repeat.set(0.5, 1);
      shop.emissive.repeat.set(0.5, 1);
      const shops = new PropBatch('shopfront', new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), shopMat);
      const cones = new PropBatch('cone', coneGeometry(), fogify(new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 })));
      const fireMat = fogify(new THREE.MeshStandardMaterial({ color: 0x1a0a04, emissive: 0xff7a1a, emissiveIntensity: 4, roughness: 0.6 }));
      flicker.push(fireMat);
      const fires = new PropBatch('firebarrel', drumGeometry(), fireMat, false);
      const drums = new PropBatch('drum', drumGeometry(), lib.get('darkSteel'));
      const poles = new PropBatch('pole', new THREE.CylinderGeometry(0.07, 0.1, 1, 8).translate(0, 0.5, 0), lib.get('darkSteel'));
      const arms = new PropBatch('lamparm', new THREE.BoxGeometry(0.1, 0.08, 1.6).translate(0, 0, 0.8), lib.get('darkSteel'), false);
      const streetMat = fogify(new THREE.MeshStandardMaterial({ color: 0x202020, emissive: 0xffe2b0, emissiveIntensity: 6, roughness: 0.5 }));
      const heads = new PropBatch('lamphead', new THREE.BoxGeometry(0.5, 0.14, 0.3), streetMat, false);
      // Volumetric cone: an open cone whose vertex alpha fades from the head to the ground and to the rim.
      const coneMat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(0xffe2b0).multiplyScalar(0.12), side: THREE.DoubleSide, fog: false, vertexColors: true });
      const lightCones = new PropBatch('lightcone', lightConeGeometry(), coneMat, false);
      const neon = neonSigns(rng);
      textureBytes += 1024 * 256 * 4 * 1.33 * 2;
      const neonMat = fogify(new THREE.MeshStandardMaterial({ map: neon.map, emissiveMap: neon.emissive, emissive: 0xffffff, emissiveIntensity: 2.4, roughness: 0.6, transparent: true, alphaTest: 0.2 }));
      // Wet-road reflection: the sign's emissive, mirrored and stretched down the road toward the camera.
      const reflMat = new THREE.MeshBasicMaterial({ map: neon.emissive, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.32, color: 0xffffff, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const reflMask = reflectionMaskTexture();
      textureBytes += 256 * 256 * 4;
      reflMat.alphaMap = reflMask;
      reflMask.channel = 1; // the mask runs along the streak (uv1), the map is the mirrored sign (uv)
      const lampMask = reflMask.clone();
      const lampRefl = new THREE.MeshBasicMaterial({ map: lampMask, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35, color: 0xffe2b0, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const lampStreaks = new PropBatch('lampstreak', new THREE.PlaneGeometry(1.6, 7).rotateX(-Math.PI / 2).translate(0, 0, 3.5), lampRefl, false);

      // --- Round 11 street kit -------------------------------------------------------------
      // Contact shadows and puddles sample the lamp-streak mask through uv1 (the disc's uv1 runs
      // centre → rim along the mask's v), so both share the lamp-streak program and its texture:
      // no new program, no new canvas.
      const discGeo = (): THREE.BufferGeometry => {
        const g = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
        const p = g.getAttribute('position') as THREE.BufferAttribute;
        const uv1 = new Float32Array(p.count * 2);
        for (let i = 0; i < p.count; i++) {
          uv1[i * 2] = 0.5;
          uv1[i * 2 + 1] = 1 - Math.min(1, Math.hypot(p.getX(i), p.getZ(i)));
        }
        g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
        return g;
      };
      const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: lampMask, transparent: true, opacity: 0.7, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      shadowMat.name = 'city:shadow';
      const shadows = new PropBatch('contactshadow', discGeo(), shadowMat, false);
      const shadowAt = (x: number, y: number, z: number, r: number, sz = r, ry = 0): void => shadows.add(x, y + 0.008, z, ry, r, null, 0, 1, sz);
      // Puddles: cool sky reflection on the asphalt, additive; the lamp streaks carry the sodium colour under the lamps.
      const puddleMat = new THREE.MeshBasicMaterial({ color: 0x5a6e9a, map: lampMask, transparent: true, blending: THREE.AdditiveBlending, opacity: 0.22, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      puddleMat.name = 'city:puddle';
      const puddles = new PropBatch('puddle', discGeo(), puddleMat, false);
      const gloss = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.2, vertexColors: true }));
      gloss.name = 'city:gloss';
      const matte = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, vertexColors: true }));
      matte.name = 'city:matte';
      const glow = (hex: number, k: number): THREE.MeshStandardMaterial => {
        const m = fogify(new THREE.MeshStandardMaterial({ color: 0x101010, emissive: hex, emissiveIntensity: k, roughness: 0.5, vertexColors: true }));
        m.name = 'city:glow';
        return m;
      };
      const cars = [carGeometry([0.78, 0.78, 0.76]), carGeometry([0.12, 0.16, 0.32]), carGeometry([0.72, 0.55, 0.08], true), carGeometry([0.3, 0.05, 0.05])].map((g, i) => new PropBatch(`car${i}`, g, gloss));
      const police = new PropBatch('policecar', carGeometry([0.9, 0.9, 0.92]), gloss);
      const barRed = glow(0xff2020, 5);
      const barBlue = glow(0x2050ff, 5);
      flicker.push(barRed, barBlue);
      const lightbarR = new PropBatch('lightbar-r', new THREE.BoxGeometry(0.3, 0.14, 0.5).translate(0, 0, 0.3), barRed, false);
      const lightbarB = new PropBatch('lightbar-b', new THREE.BoxGeometry(0.3, 0.14, 0.5).translate(0, 0, -0.3), barBlue, false);
      const trucks = new PropBatch('boxtruck', truckGeometry(), gloss);
      const dumpsters = [dumpsterGeometry([0.12, 0.35, 0.18]), dumpsterGeometry([0.2, 0.28, 0.5])].map((g, i) => new PropBatch(`dumpster${i}`, g, matte));
      const bollards = new PropBatch('bollard', bollardGeometry(), matte);
      const hydrants = new PropBatch('hydrant', hydrantGeometry(), gloss);
      const newsboxes = [newsboxGeometry([0.1, 0.3, 0.75]), newsboxGeometry([0.8, 0.12, 0.1]), newsboxGeometry([0.85, 0.7, 0.1])].map((g, i) => new PropBatch(`newsbox${i}`, g, matte));
      const jerseys = new PropBatch('jersey', jerseyGeometry(), matte);
      const scaffolds = new PropBatch('scaffold', scaffoldGeometry(), matte);
      const hoardings = new PropBatch('hoarding', bakeAO(new THREE.BoxGeometry(6, 2.4, 0.04).translate(0, 1.2, 0), 2.4, 0.3), lib.get('plywood'));
      const escapes = new PropBatch('fireescape', fireEscapeGeometry(), matte, false);
      const awnings = [awningGeometry([0.7, 0.12, 0.1]), awningGeometry([0.1, 0.3, 0.55])].map((g, i) => new PropBatch(`awning${i}`, g, matte, false));
      const acs = new PropBatch('acunit', acUnitGeometry(), matte, false);
      const tlights = new PropBatch('trafficlight', trafficLightGeometry(), matte);
      const lensRed = new PropBatch('lens-red', new THREE.SphereGeometry(0.11, 8, 6).translate(0, 4.98, 3.16), glow(0xff2010, 3), false);
      const lensGreen = new PropBatch('lens-green', new THREE.SphereGeometry(0.11, 8, 6).translate(0, 4.42, 3.16), glow(0x20ff60, 3), false);
      const shelters = new PropBatch('busshelter', busShelterGeometry(), matte);
      const adPanels = new PropBatch('adpanel', new THREE.BoxGeometry(1.2, 1.8, 0.05).translate(1.2, 1.3, -0.68), glow(0xdfe8ff, 1.3), false);
      const carts = new PropBatch('foodcart', foodCartGeometry(), matte);
      const cartBulbs = new PropBatch('cartbulb', new THREE.SphereGeometry(0.08, 8, 6).translate(0.3, 2.35, 0), glow(0xffd090, 4), false);
      const signs = [roadSignGeometry([0.8, 0.1, 0.1]), roadSignGeometry([0.1, 0.25, 0.7])].map((g, i) => new PropBatch(`roadsign${i}`, g, matte, false));
      const manholes = new PropBatch('manhole', tinted([[new THREE.CylinderGeometry(0.36, 0.36, 0.025, 16).translate(0, 0.012, 0), [0.14, 0.13, 0.12]], [new THREE.CylinderGeometry(0.26, 0.26, 0.03, 16).translate(0, 0.012, 0), [0.1, 0.1, 0.09]]]), matte, false);
      const paint = new PropBatch('decal:lane', tinted([[new THREE.BoxGeometry(3, 0.012, 0.15).translate(0, 0.006, 0), [0.85, 0.85, 0.8]]]), matte, false);
      const zebra = new PropBatch('decal:zebra', tinted([[new THREE.BoxGeometry(0.6, 0.012, 6).translate(0, 0.006, 0), [0.85, 0.85, 0.8]]]), matte, false);
      const paper = new PropBatch('paper', tinted([[new THREE.PlaneGeometry(0.28, 0.36).rotateX(-Math.PI / 2), [0.5, 0.5, 0.47]]]), matte, false);
      const leaves = new PropBatch('leaf', tinted([[new THREE.PlaneGeometry(0.14, 0.2).rotateX(-Math.PI / 2), [0.45, 0.3, 0.12]]]), matte, false);
      // Mid tier: elevated rail viaduct (beam + columns) and its train; far-mid: the lit silhouette.
      const viaduct = new PropBatch('viaduct', bakeAO(new THREE.BoxGeometry(12, 1.4, 3.6).translate(0, 0.7, 0), 1.4, 0.2), lib.get('darkSteel'));
      const piers = new PropBatch('pier', bakeAO(new THREE.CylinderGeometry(0.55, 0.65, 1, 10).translate(0, 0.5, 0), 1, 0.3), lib.get('darkSteel'));
      const railCars = new PropBatch('railcar', railCarGeometry(), matte);
      const railBand = new PropBatch('railband', new THREE.BoxGeometry(11.6, 1.0, 0.1), glow(0xffe0b0, 1.4), false);
      const mullions = new PropBatch('mullion', mullionGeometry(), matte, false);
      const masts = new PropBatch('cranemast', mastGeometry(), matte);
      const jibs = new PropBatch('cranejib', tinted([[trussGeometry(24), [0.9, 0.65, 0.1]]]), matte);
      const beacon = glow(0xff2020, 6);
      flicker.push(beacon);
      const beacons = new PropBatch('beacon', new THREE.SphereGeometry(0.2, 8, 6), beacon, false);
      {
        const st = citySilhouette(rng);
        textureBytes += 1024 * 256 * 4 * 1.33;
        const h = 44;
        const z = -85;
        const w = span * 3 + Math.abs(z) * 2;
        st.repeat.set(w / (h * 4), 1);
        const grid = windowGrid(rng);
        textureBytes += 256 * 256 * 4 * 1.33 * 2;
        const mat = new THREE.MeshStandardMaterial({ map: st, alphaTest: 0.5, color: 0x1a2030, roughness: 1, side: THREE.DoubleSide, emissiveMap: grid.emissive, emissive: new THREE.Color(0xffc080), emissiveIntensity: 1.0 });
        grid.emissive.repeat.set(w / 6, h / 6);
        fogify(mat);
        const m = addPlane(w, h, mat, midX, floorY + h / 2 - 4, z);
        m.receiveShadow = false;
      }
      const gy0 = (x: number): number => profileY(profile, x) - 0.42;
      const setPiece: 'rail' | 'crane' = track.def.id.startsWith('h2') ? 'crane' : 'rail';
      // Buildings: near row fronts at z −12.6 (shops at −12), second row at z −40…−52.
      for (let x = x0 + 4; x < x1; x += rng.range(7, 12)) {
        const w = rng.range(7, 13);
        const h = rng.range(9, 24);
        const d = rng.range(7, 11);
        const z = -12.6 - d / 2;
        const gy = gyAt(x, -12);
        if (rng.next() < 0.88) {
          bBatches[rng.int(0, 2)]!.add(x, gy - 1, z, 0, w, null, 0, h, d);
          roofs.add(x, gy - 1 + h, z, 0, w, null, 0, 1, d);
          const front = z + d / 2;
          const shopW = w * rng.range(0.6, 0.95);
          const hasShop = rng.next() < 0.7;
          if (hasShop) shops.add(x, gy - 1, front + 0.6, 0, shopW, null, 0, 4.2, 1.2);
          if (hasShop && rng.next() < 0.6) awnings[rng.int(0, 1)]!.add(x + rng.range(-w * 0.2, w * 0.2), gy + 2.9, front + 1.2, 0, Math.min(1, shopW / 3.4));
          if (rng.next() < 0.45 && h > 11) escapes.add(x + rng.range(-w * 0.25, w * 0.25), gy - 1, front + 0.02, 0, Math.min(1, w / 4));
          for (let k = 0, n = rng.int(0, 3); k < n; k++) acs.add(x + rng.range(-w * 0.4, w * 0.4), gy + rng.range(4, h - 2), front + 0.02, 0);
          if (rng.next() < 0.3 && !hasShop) {
            scaffolds.add(x, gy - 1, front + 1.0, 0, Math.min(1.4, w / 6));
            hoardings.add(x, gy - 1, front + 1.85, 0, Math.min(1.4, w / 6));
            for (const dx of [-2, 0.5, 2.5]) if (rng.next() < 0.6) paper.add(x + dx, gy - 1 + 0.01, front + rng.range(2.1, 3.0), rng.range(0, 6), rng.range(0.7, 1.3));
          }
          if (rng.next() < 0.35) {
            const dz = front + rng.range(1.2, 2.2);
            dumpsters[rng.int(0, 1)]!.add(x + rng.range(-w * 0.35, w * 0.35), gyAt(x, dz) - 1, dz, rng.range(-0.15, 0.15));
            shadowAt(x, gyAt(x, dz) - 1, dz, 1.3, 0.9);
          }
        }
        if (rng.next() < 0.6) {
          const w2 = rng.range(10, 18);
          const h2 = rng.range(22, 48);
          const xx = x + rng.range(-4, 4);
          bBatches[rng.int(0, 2)]!.add(xx, gy - 3, -46, 0, w2, null, 0, h2, rng.range(8, 12));
          roofs.add(xx, gy - 3 + h2, -46, 0, w2, null, 0, 1, 9);
        }
      }
      // Street furniture along the kerb (z −4…−5.5) and the road (z −6…−11), ~1 prop / 2 m.
      for (let x = x0 + 6; x < x1; x += rng.range(1.6, 3.2)) {
        const gy = gy0(x);
        const r = rng.next();
        if (r < 0.2) {
          bollards.add(x, gy, -4.3);
          shadowAt(x, gy, -4.3, 0.22);
        } else if (r < 0.28) {
          hydrants.add(x, gy, -4.6, rng.range(0, 6));
          shadowAt(x, gy, -4.6, 0.32);
        } else if (r < 0.36) {
          newsboxes[rng.int(0, 2)]!.add(x, gy, -4.7, rng.range(-0.2, 0.2));
          shadowAt(x, gy, -4.7, 0.42);
        } else if (r < 0.44) {
          cones.add(x, gy, rng.range(-5.5, -4), rng.range(0, 6));
          shadowAt(x, gy, -4.8, 0.3);
        } else if (r < 0.5) {
          signs[rng.int(0, 1)]!.add(x, gy, -4.4, rng.range(-0.3, 0.3));
        } else if (r < 0.58) {
          const z = rng.range(-6, -4.8);
          if (rng.next() < 0.45) {
            fires.add(x, gy, z);
            fountains.push({ x, y: gy + 0.9, z });
          } else drums.add(x, gy, z, rng.range(0, 6));
          shadowAt(x, gy, z, 0.5);
        } else if (r < 0.74) {
          // Parked car along the far kerb, nose alternating.
          const z = rng.range(-7.2, -6.6);
          const ry = rng.next() < 0.5 ? 0 : Math.PI;
          cars[rng.int(0, 3)]!.add(x, gyAt(x, z), z, ry + rng.range(-0.04, 0.04));
          shadowAt(x, gyAt(x, z), z, 2.4, 1.1);
          x += 3.2;
        } else if (r < 0.8) {
          const z = -10.6;
          shelters.add(x, gyAt(x, z), z, 0);
          adPanels.add(x, gyAt(x, z), z, 0);
          shadowAt(x, gyAt(x, z), z, 2.2, 1.0);
          x += 3;
        } else if (r < 0.83) {
          const z = rng.range(-6.2, -5.4);
          carts.add(x, gy, z, rng.range(-0.3, 0.3));
          cartBulbs.add(x, gy, z, 0);
          shadowAt(x, gy, z, 1.0, 0.7);
          x += 6;
        } else if (r < 0.92) {
          const z = -8.5;
          jerseys.add(x, gyAt(x, z), z, rng.range(-0.1, 0.1));
          shadowAt(x, gyAt(x, z), z, 1.1, 0.4);
        } else {
          paper.add(x, gy + 0.01, rng.range(-5.2, -4.2), rng.range(0, 6), rng.range(0.7, 1.3));
          leaves.add(x + rng.range(-0.5, 0.5), gy + 0.01, rng.range(-5.2, -4.2), rng.range(0, 6));
        }
      }
      // Traffic lights every ~40 m at the kerb, lens alternating red / green.
      for (let x = x0 + 22, i = 0; x < x1; x += rng.range(34, 48), i++) {
        const gy = gy0(x);
        tlights.add(x, gy, -4.2, Math.PI);
        (i % 2 ? lensGreen : lensRed).add(x, gy, -4.2, Math.PI);
      }
      // Foreground occluders (z +5…+8, outside the spawn keep-outs): a box truck every ~55 m, a parked car between.
      for (let x = x0 + 30; x < x1; x += rng.range(48, 64)) {
        if (keepOut(x, 5)) continue;
        const z = rng.range(6.2, 7.4);
        trucks.add(x, gyAt(x, z), z, rng.next() < 0.5 ? 0 : Math.PI);
        shadowAt(x, gyAt(x, z), z, 4.4, 1.5);
        const cx = x + rng.range(20, 30);
        if (!keepOut(cx, 3)) {
          cars[rng.int(0, 3)]!.add(cx, gyAt(cx, 6), 6, rng.next() < 0.5 ? 0 : Math.PI);
          shadowAt(cx, gyAt(cx, 6), 6, 2.4, 1.1);
        }
      }
      // Foreground band z +4…+8 (the lower 40 % of the riding frame): parked cars every ~15 m, cone clusters,
      // puddles, manholes, paper — the near tier of the recipe, outside the spawn keep-outs.
      for (let x = x0 + 12; x < x1; x += rng.range(11, 18)) {
        if (keepOut(x, 3)) continue;
        const r = rng.next();
        if (r < 0.55) {
          const z = rng.range(5.6, 6.4);
          cars[rng.int(0, 3)]!.add(x, gyAt(x, z), z, (rng.next() < 0.5 ? 0 : Math.PI) + rng.range(-0.05, 0.05));
          shadowAt(x, gyAt(x, z), z, 2.4, 1.1);
        } else if (r < 0.75) {
          for (let k = 0; k < 3; k++) cones.add(x + k * 0.9 + rng.range(-0.2, 0.2), gyAt(x, 4.6), rng.range(4.3, 5.0), rng.range(0, 6));
          shadowAt(x + 0.9, gyAt(x, 4.6), 4.6, 0.9, 0.4);
        } else if (r < 0.88) {
          jerseys.add(x, gyAt(x, 4.8), 4.8, rng.range(-0.1, 0.1));
          shadowAt(x, gyAt(x, 4.8), 4.8, 1.1, 0.4);
        } else {
          const z = rng.range(4.5, 6.5);
          drums.add(x, gyAt(x, z), z, rng.range(0, 6));
          shadowAt(x, gyAt(x, z), z, 0.5);
        }
      }
      for (let x = x0; x < x1; x += rng.range(3, 7)) {
        const z = rng.range(3.8, 8.5);
        puddles.add(x, gyAt(x, z) + 0.01, z, rng.range(0, 6), rng.range(0.8, 2.4), null, 0, 1, rng.range(0.4, 1.0));
        if (rng.next() < 0.5) paper.add(x + 1, gyAt(x + 1, 4.2) + 0.01, rng.range(3.6, 4.6), rng.range(0, 6), rng.range(0.7, 1.3));
        if (rng.next() < 0.5) leaves.add(x + 2, gyAt(x + 2, 4.2) + 0.01, rng.range(3.6, 4.8), rng.range(0, 6));
        if (rng.next() < 0.25) manholes.add(x + 1.5, gyAt(x + 1.5, 6) + 0.004, rng.range(5, 7.5), rng.range(0, 6));
      }
      // Road paint: dashed lane line at z −9.5, zebra crossings after the start and before the finish; manholes; puddles.
      for (let x = x0; x < x1; x += 6) paint.add(x, gyAt(x, -9.5) + 0.006, -9.5, 0);
      for (const cx of [track.def.start.pos.x + 20, track.def.finishX - 18]) for (let k = -3; k <= 3; k++) zebra.add(cx + k * 1.2, gyAt(cx, -7.5) + 0.006, -7.5, 0);
      for (let x = x0 + 8; x < x1; x += rng.range(14, 26)) {
        const z = rng.range(-10.5, -6);
        manholes.add(x, gyAt(x, z) + 0.004, z, rng.range(0, 6));
      }
      for (let x = x0; x < x1; x += rng.range(2.5, 6)) {
        const z = rng.range(-11.5, -4.5);
        puddles.add(x, gyAt(x, z) + 0.01, z, rng.range(0, 6), rng.range(0.8, 2.6), null, 0, 1, rng.range(0.4, 1.0));
      }
      // Street lights every ~14 m behind the kerb: volumetric cone, a wet streak plus two puddle streaks; each head is a kit lamp (the renderer parks the follow spots on the nearest four).
      // The arm reaches 2.6 m over the kerb so the head (and the follow spot's pool, aimed 0.6 m further) sits on the deck edge, not behind it.
      for (let x = x0 + 10; x < x1; x += rng.range(12, 17)) {
        const z = -5.2;
        const gy = gy0(x);
        poles.add(x, gy, z, 0, 1, null, 0, 6.5, 1);
        arms.add(x, gy + 6.4, z, 0, 1, null, 0, 1, 1.65);
        heads.add(x, gy + 6.4, z + 2.6);
        lightCones.add(x, gy + 6.35, z + 2.6, 0, 1, null, 0, 6.4, 1);
        lampStreaks.add(x, gy + 0.01, z + 2.6, 0);
        lampStreaks.add(x - 1.4, gy + 0.01, z + 1.2, 0.15, 0.6, null, 0, 1, 0.7);
        lampStreaks.add(x + 1.5, gy + 0.01, z + 1.0, -0.12, 0.5, null, 0, 1, 0.6);
        lamps.push({ x, y: gy + 6.4, z: z + 2.6 });
      }
      // Police cars at the start and the finish (lightbars flicker via `kit.flicker`): the event.
      for (const [px, ry] of [[track.def.start.pos.x - 7, 0], [track.def.finishX + 9, Math.PI]] as const) {
        const z = -6.8;
        police.add(px, gyAt(px, z), z, ry);
        lightbarR.add(px - 0.2, gyAt(px, z) + 1.58, z, ry);
        lightbarB.add(px - 0.2, gyAt(px, z) + 1.58, z, ry);
        shadowAt(px, gyAt(px, z), z, 2.4, 1.1);
        for (let k = 0; k < 4; k++) {
          jerseys.add(px + 3 + k * 2.1, gyAt(px, z - 1.8), z - 1.8, 0);
          cones.add(px + 2 + k * 2.1, gy0(px), -4.6, rng.range(0, 6));
        }
      }
      // Elevated rail viaduct at z −30 (both tracks): the mid tier's structure, 12 m beams on piers.
      {
        const z = -30;
        for (let x = x0; x < x1; x += 12) {
          const gy = gyAt(x, z) - 1.5;
          viaduct.add(x + 6, gy + 8.5, z, 0);
          for (const dz of [-1.2, 1.2]) piers.add(x, gy, z + dz, 0, 1, null, 0, 8.5, 1);
        }
      }
      if (setPiece === 'rail') {
        // h1: the viaduct spurs across the line on a bridge at mid-course; a four-car train sits on the viaduct beside it; a neon billboard hangs on the bridge side.
        let bx = x0 + span * 0.55;
        while (keepOut(bx, 4) && bx < x1 - 20) bx += 8;
        const gy = gy0(bx);
        // The spur stops at the kerb (z −6): a deck over the ride line hid the rider from the riding camera.
        for (let z = -30; z <= -18; z += 12) viaduct.add(bx, gy + 8.5, z + 6, Math.PI / 2);
        for (const z of [-18, -6]) for (const dx of [-1.2, 1.2]) piers.add(bx + dx, gyAt(bx, z) - 1.5, z, 0, 1, null, 0, 10, 1);
        for (let k = 0; k < 4; k++) {
          const cx = bx - 30 + k * 12.4;
          railCars.add(cx, gyAt(cx, -30) - 1.5 + 9.9, -30, 0);
          railBand.add(cx, gyAt(cx, -30) - 1.5 + 9.9 + 2.0, -30 + 1.42, 0);
          mullions.add(cx, gyAt(cx, -30) - 1.5 + 9.9 + 2.0, -30 + 1.48, 0);
        }
        const bg = new THREE.PlaneGeometry(9, 2.25);
        const buv = bg.getAttribute('uv') as THREE.BufferAttribute;
        for (let k = 0; k < buv.count; k++) buv.setY(k, buv.getY(k) * 0.5);
        const board = new THREE.Mesh(bg, neonMat);
        board.position.set(bx, gy + 11.2, -13.5);
        singles.push(board);
        for (const dx of [-4.3, 4.3]) poles.add(bx + dx, gy + 9.9, -13.5, 0, 0.6, null, 0, 2.6, 0.6);
        beacons.add(bx, gy + 12.6, -13.5);
      } else {
        // h2: a tower crane over a hoarded site at 45 % of the course, aviation beacon flickering; barriers and cones round its foot.
        let cx = x0 + span * 0.45;
        while (keepOut(cx, 6) && cx < x1 - 30) cx += 8;
        const z = -17;
        const gy = gyAt(cx, z);
        const H = 30;
        masts.add(cx, gy - 1, z, 0, 1, null, 0, H, 1);
        jibs.add(cx + 9, gy - 1 + H, z, 0);
        jibs.add(cx - 5, gy - 1 + H - 0.2, z, 0, 0.45, null, 0, 1, 1);
        railBand.add(cx - 10, gy - 1 + H + 0.2, z, 0, 0.25, null, 0, 1.2, 8);
        poles.add(cx + 14, gy - 1 + H - 12, z, 0, 0.25, null, 0, 12, 0.25);
        beacons.add(cx, gy - 1 + H + 1.6, z);
        for (let k = 0; k < 6; k++) {
          hoardings.add(cx - 15 + k * 6.05, gyAt(cx, -9.5), -9.5, 0);
          if (k % 2 === 0) paper.add(cx - 15 + k * 6, gyAt(cx, -8.6) + 0.01, -8.6, rng.range(0, 6));
        }
        for (let k = 0; k < 5; k++) {
          jerseys.add(cx - 8 + k * 4, gyAt(cx, -8.2), -8.2, 0);
          cones.add(cx - 9 + k * 4, gy0(cx), -4.5, rng.range(0, 6));
        }
      }
      // Neon signs: alternating the two panels of the sheet, hung on posts at z −7..−11, with reflections.
      const reflGeos: THREE.BufferGeometry[] = [];
      for (let x = x0 + 14, i = 0; x < x1; x += rng.range(16, 26), i++) {
        const z = rng.range(-11, -7);
        const gy = gyAt(x, z);
        const w = 4.5;
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
        // Reflection streak: mirrored panel lying on the ground from the sign foot toward the camera.
        const rg = new THREE.PlaneGeometry(w, 9, 1, 6);
        const ruv = rg.getAttribute('uv') as THREE.BufferAttribute;
        rg.setAttribute('uv1', ruv.clone());
        for (let k = 0; k < ruv.count; k++) ruv.setY(k, half * 0.5 + (1 - ruv.getY(k)) * 0.5);
        rg.rotateX(-Math.PI / 2);
        rg.translate(x, gy + 0.015, z + 4.5);
        reflGeos.push(rg);
        const pl = new THREE.PointLight(half ? 0xff40c0 : 0x40e0ff, 25, 16, 2);
        pl.position.set(x, gy + 3.6, z + 1.5);
        if (lights.length < 2) lights.push(pl);
      }
      if (reflGeos.length) {
        const merged = mergeGeometries(reflGeos, false);
        if (merged) {
          const m = new THREE.Mesh(merged, reflMat);
          m.renderOrder = 2;
          m.frustumCulled = false;
          m.name = 'neon:reflections';
          meshes.push(m);
        }
      }
      batches.push(...bBatches, roofs, shops, cones, fires, drums, poles, arms, heads, lightCones, lampStreaks);
      batches.push(shadows, puddles, ...cars, police, lightbarR, lightbarB, trucks, ...dumpsters, bollards, hydrants, ...newsboxes, jerseys, scaffolds, hoardings, escapes, ...awnings, acs, tlights, lensRed, lensGreen, shelters, adPanels, carts, cartBulbs, ...signs, manholes, paint, zebra, paper, leaves, viaduct, piers, railCars, railBand, mullions, masts, jibs, beacons);
    }
  }

  // Tyre marks on the deck (art pack): the burnout arc and the straight print as alpha-masked
  // dark decals on flat stretches, avoiding spawns; one batch per texture. Not on `low` (round 12).
  if (art && detail !== 'low') {
    const marks: PropBatch[] = [];
    for (const [id, w, h, op] of [['tyremark-arc', 1.6, 1.6, 0.55], ['tyremark-straight', 0.55, 2.2, 0.4]] as const) {
      const t = art.texture(id, false, false);
      if (!t) continue;
      textureBytes += art.entry(id)?.bytes ?? 0;
      const m = fogify(new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1, alphaMap: t, transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      marks.push(new PropBatch(`decal:${id}`, new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), m, false));
    }
    if (marks.length) {
      for (let x = track.bounds.minX + 6, i = 0; x < track.bounds.maxX - 4; x += rng.range(9, 16), i++) {
        const slope = Math.abs(profileY(profile, x + 1.2) - profileY(profile, x - 1.2));
        if (slope > 0.08 || keepOut(x, 1)) continue;
        marks[i % marks.length]!.add(x, profileY(profile, x) + 0.012, rng.range(-0.5, 0.5), rng.range(-0.25, 0.25) + (rng.next() < 0.5 ? Math.PI : 0), rng.range(0.8, 1.3));
      }
      batches.push(...marks);
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
  return { group, drawCalls, triangles, textureBytes, flicker, lights, scroll, fountains, lamps };
}
