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

const coniferCache = new Map<number, { tree: THREE.BufferGeometry; snow: THREE.BufferGeometry }>();
/** Snow-laden conifer: trunk + 5 drooping tiers (dark green, darker under each tier) and a snow load on every tier. */
function conifer(seed: number): { tree: THREE.BufferGeometry; snow: THREE.BufferGeometry } {
  const hit = coniferCache.get(seed);
  if (hit) return hit;
  const tree: THREE.BufferGeometry[] = [];
  const snow: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.14, 0.3, 3.0, 7).translate(0, 1.5, 0);
  setColors(trunk, (_x, y) => {
    const s = 0.5 + 0.5 * Math.min(1, y / 1.5);
    return [0.22 * s, 0.16 * s, 0.11 * s];
  });
  tree.push(trunk);
  const tiers = 5;
  for (let k = 0; k < tiers; k++) {
    const r = 2.3 - k * 0.4;
    const h = 2.1 - k * 0.12;
    const y0 = 1.7 + k * 1.35;
    const c = new THREE.ConeGeometry(r, h, 9, 1, false);
    // Droop: pull the rim down a little so the tier reads heavy.
    const p = c.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const rr = Math.hypot(p.getX(i), p.getZ(i));
      if (rr > r * 0.9) p.setY(i, p.getY(i) - 0.25);
    }
    c.translate(0, y0 + h / 2, 0);
    setColors(c, (_x, y) => {
      const t = Math.min(1, Math.max(0, (y - y0) / h));
      const s = 0.55 + 0.45 * t;
      return [0.13 * s, 0.26 * s, 0.17 * s];
    });
    tree.push(c);
    const cap = new THREE.ConeGeometry(r * 0.82, h * 0.42, 9, 1, false).translate(0, y0 + h * 0.62 + 0.05, 0);
    setColors(cap, (_x, y) => {
      const t = Math.min(1, Math.max(0, (y - y0 - h * 0.4) / (h * 0.42)));
      return [0.82 + 0.18 * t, 0.86 + 0.14 * t, 0.94 + 0.06 * t];
    });
    snow.push(cap);
  }
  const top = new THREE.ConeGeometry(0.28, 0.8, 7).translate(0, 1.7 + tiers * 1.35 + 0.9, 0);
  setColors(top, () => [0.96, 0.97, 1.0]);
  snow.push(top);
  const out = { tree: mergeGeometries(tree, false)!, snow: mergeGeometries(snow, false)! };
  coniferCache.set(seed, out);
  return out;
}

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
// Builders
// ---------------------------------------------------------------------------

export function buildBiomeKit(track: CompiledTrack, biome: Biome, lib: MaterialLibrary, art: ArtLibrary | null = null): BiomeKit {
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
      tmat.color.setHex(0xb89a72);
    }
    const m = new THREE.Mesh(g, fogify(tmat));
    m.receiveShadow = true;
    m.name = 'terrain';
    meshes.push(m);
  }

  if (biome.interior) {
    const hall = buildHall(track, biome, lib, rng, floorY, x0, x1, art);
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
      const near = biome.id === 'canyon' ? { z: -45, h: 26, kind: 'mesa' as const, color: 0x5a3a2c, yOff: -3 } : biome.id === 'snow' ? null : { z: -45, h: 30, kind: 'city' as const, color: 0x14161c, yOff: -3 };
      if (near) {
      const st = silhouette(near.kind, rng);
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
    }
    // Props along the course.
    const gyAt = (x: number, z: number): number => profileY(profile, x) - 0.42 - Math.min(1, (Math.abs(z) - 3) / 30) ** 2 * 2.5;
    if (biome.id === 'canyon') {
      // Round 7: sandstone formations are terraced mounds (rings × layers with ledge
      // steps and erosion noise, banded vertex colour), not boxes; scrub is a
      // clustered bush; boulders sit in scoured hollows; dust motes + heat haze.
      const strata = stratatexture(rng);
      textureBytes += 512 * 512 * 4 * 1.33;
      const strataMat = fogify(new THREE.MeshStandardMaterial({ map: strata, roughness: 0.95, color: 0xf0e4d4, vertexColors: true }));
      const mesaBatches: PropBatch[] = [];
      for (let v = 0; v < 3; v++) mesaBatches.push(new PropBatch(`mesa${v}`, mesaGeometry((track.def.seed ^ (v * 7919)) >>> 0, v), strataMat));
      const pick = (): PropBatch => mesaBatches[rng.int(0, 2)]!;
      // Near wall of formations at z −11..−15, gaps every few, some low ones in front.
      for (let x = x0; x < x1; x += rng.range(7, 12)) {
        if (rng.next() < 0.28) continue;
        const h = rng.range(2.4, 5.0);
        const w = rng.range(4, 7);
        pick().add(x, gyAt(x, -13) - 0.6, -13 + rng.range(-2, 2), rng.range(0, 6), w, null, 0, h, w * rng.range(0.7, 1.1));
        if (rng.next() < 0.5) pick().add(x + rng.range(-4, 4), gyAt(x, -9) - 0.5, rng.range(-10, -7.5), rng.range(0, 6), rng.range(1.6, 3), null, 0, rng.range(0.9, 2.0), rng.range(1.6, 3));
      }
      // Big mesas at z −24..−30.
      for (let x = x0; x < x1; x += rng.range(10, 16)) {
        if (rng.next() < 0.3) continue;
        const h = rng.range(7, 15);
        const w = rng.range(9, 16);
        pick().add(x, gyAt(x, -26) - 2.5, -27 + rng.range(-3, 3), rng.range(0, 6), w, null, 0, h, w * rng.range(0.6, 1.0));
      }
      // Foreground: a low outcrop sliding past now and then.
      for (let x = x0 + 20; x < x1; x += rng.range(36, 52)) if (!keepOut(x, 2.5)) pick().add(x, gyAt(x, 6) - 2.4, rng.range(5.5, 7.5), rng.range(0, 6), rng.range(2.5, 4), null, 0, rng.range(2.2, 3.6), 2.5);
      const rocks = new PropBatch('rock', bakeAO(rockGeometry(track.def.seed), 1.4, 0.3), lib.get('rock'));
      const scrubMat = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true }));
      const scrub = new PropBatch('scrub', scrubGeometry(track.def.seed ^ 0x33), scrubMat);
      const bales = new PropBatch('bale', baleGeometry(), lib.get('pallet'));
      const tyres = new PropBatch('tyres', tyreStackGeometry(), lib.get('tyre'));
      const drums = new PropBatch('drum', drumGeometry(), lib.get('barrelRed'));
      for (let x = x0 + 6; x < x1; x += rng.range(2.5, 6)) {
        const z = rng.range(-9, -4.5);
        const gy = gyAt(x, z);
        const r = rng.next();
        if (r < 0.3) rocks.add(x, gy + rng.range(-0.25, 0.05), z, rng.range(0, 6), rng.range(0.5, 1.7), 0xd8c2a8, rng.range(-0.2, 0.2), rng.range(0.4, 1.0), rng.range(0.5, 1.7));
        else if (r < 0.78) scrub.add(x, gy - 0.05, z, rng.range(0, 6), rng.range(0.7, 1.5), null, 0, rng.range(0.6, 1.2), rng.range(0.7, 1.5));
        else if (r < 0.86) bales.add(x, gy, z, rng.range(-0.3, 0.3));
        else if (r < 0.93) tyres.add(x, gy, z, 0);
        else drums.add(x, gy, z, 0, 1, 0xd8d2c4);
        if (rng.next() < 0.35 && !keepOut(x + 1.5, 1)) scrub.add(x + 1.5, gyAt(x + 1.5, 5) - 0.1, rng.range(4.5, 7), rng.range(0, 6), rng.range(0.8, 1.6), null, 0, rng.range(0.7, 1.1), rng.range(0.8, 1.6));
        if (rng.next() < 0.12 && !keepOut(x + 1, 1)) rocks.add(x + 1, gyAt(x + 1, 5.5) - 0.3, rng.range(5, 7), rng.range(0, 6), rng.range(0.8, 1.6), 0xd8c2a8, 0, rng.range(0.5, 0.9), rng.range(0.8, 1.6));
      }
      batches.push(...mesaBatches, rocks, scrub, bales, tyres, drums);
    } else if (biome.id === 'snow') {
      // Round 7: five-tier drooping conifers with snow loads on every tier, snow banks with
      // blue undersides along both sides of the trail, drifted crates, warm lamp posts, fence.
      const pineMat = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, vertexColors: true }));
      const pines = new PropBatch('pine', conifer(track.def.seed).tree, pineMat);
      const capMat = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, vertexColors: true }));
      const caps = new PropBatch('pinecap', conifer(track.def.seed).snow, capMat, false);
      const bankMat = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, vertexColors: true }));
      const banks = new PropBatch('snowbank', snowBankGeometry(track.def.seed ^ 0x55), bankMat, false);
      const crates = new PropBatch('crate', bakeAO(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 1, 0.3), lib.get('plywood'));
      const crateSnow = new PropBatch('cratesnow', new THREE.BoxGeometry(1.06, 0.14, 1.06).translate(0, 1.05, 0), capMat, false);
      const posts = new PropBatch('post', new THREE.CylinderGeometry(0.06, 0.08, 1, 8).translate(0, 0.5, 0), lib.get('darkSteel'));
      const lampMat = fogify(new THREE.MeshStandardMaterial({ color: 0x221a10, emissive: 0xffb648, emissiveIntensity: 5, roughness: 0.4 }));
      const lampHeads = new PropBatch('lamphead', new THREE.SphereGeometry(0.18, 10, 8), lampMat, false);
      const fence = new PropBatch('fence', new THREE.BoxGeometry(2.4, 0.06, 0.04).translate(0, 0.9, 0), lib.get('plywood'));
      // Snow banks hugging the trail on both sides (they read as the ploughed edge).
      for (let x = x0 + 2; x < x1; x += rng.range(2.2, 4.5)) {
        if (rng.next() > 0.25) banks.add(x, profileY(profile, x) - 0.55, rng.range(-4.2, -3.0), rng.range(0, 6), rng.range(1.4, 2.8), null, 0, rng.range(0.45, 0.9), rng.range(0.7, 1.1));
        if (rng.next() > 0.55 && !keepOut(x, 1.5)) banks.add(x, profileY(profile, x) - 0.6, rng.range(3.6, 4.6), rng.range(0, 6), rng.range(1.0, 2.0), null, 0, rng.range(0.3, 0.6), rng.range(0.5, 0.8));
      }
      // Mid-ground tier (round 9): larger conifers at z −27…−38, fogged by depth, in place of the
      // painted silhouette strip when the plate is present.
      if (art?.has('plate-snow')) {
        for (let x = x0 - 40; x < x1 + 40; x += rng.range(10, 18)) {
          const z = rng.range(-38, -27);
          const sc = rng.range(1.25, 1.9);
          const ry = rng.range(0, 6);
          const gy = gyAt(x, Math.max(z, -28));
          pines.add(x, gy - 0.6, z, ry, sc);
          caps.add(x, gy - 0.6, z, ry, sc);
        }
      }
      for (let x = x0 + 4; x < x1; x += rng.range(2.5, 6)) {
        const z = rng.range(-18, -4.5);
        const gy = gyAt(x, z);
        const r = rng.next();
        if (r < 0.62) {
          const sc = rng.range(0.6, 1.5);
          const ry = rng.range(0, 6);
          pines.add(x, gy - 0.4, z, ry, sc);
          caps.add(x, gy - 0.4, z, ry, sc);
          if (rng.next() < 0.5) banks.add(x + rng.range(-1, 1), gy - 0.3, z + rng.range(-1, 1), rng.range(0, 6), rng.range(1.5, 3), null, 0, rng.range(0.4, 0.8), rng.range(1.5, 3));
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
        if (rng.next() < 0.12 && !keepOut(x + 2, 2)) {
          const sc = rng.range(0.9, 1.4);
          const ry = rng.range(0, 6);
          const fz = rng.range(6, 8.5);
          pines.add(x + 2, gyAt(x + 2, fz) - 1.0, fz, ry, sc);
          caps.add(x + 2, gyAt(x + 2, fz) - 1.0, fz, ry, sc);
        }
      }
      batches.push(banks, pines, caps, crates, crateSnow, posts, lampHeads, fence);
    } else {
      // nightCity (round 7): three facade types with parapets / rooftop clutter, ground-floor
      // shopfronts, neon signs with wet-road reflections, streetlights with volumetric cones,
      // kerbs on the ride surface (deck.ts), fire barrels.
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
      for (let x = x0 + 4; x < x1; x += rng.range(6, 10)) {
        const z = rng.range(-34, -22);
        const gy = gyAt(x, z);
        const w = rng.range(7, 13);
        const h = rng.range(9, 24);
        const d = rng.range(7, 11);
        if (rng.next() < 0.85) {
          bBatches[rng.int(0, 2)]!.add(x, gy - 1, z, 0, w, null, 0, h, d);
          roofs.add(x, gy - 1 + h, z, 0, w, null, 0, 1, d);
          // Ground floor shopfront on the street side.
          if (rng.next() < 0.7) shops.add(x, gy - 1, z + d / 2 + 0.6, 0, w * rng.range(0.6, 0.95), null, 0, 4.2, 1.2);
        }
        if (rng.next() < 0.6) {
          const w2 = rng.range(10, 18);
          const h2 = rng.range(22, 48);
          bBatches[rng.int(0, 2)]!.add(x + rng.range(-4, 4), gy - 1, z - 18, 0, w2, null, 0, h2, rng.range(8, 12));
          roofs.add(x + rng.range(-4, 4), gy - 1 + h2, z - 18, 0, w2, null, 0, 1, 9);
        }
        if (rng.next() < 0.5) cones.add(x + rng.range(-3, 3), profileY(profile, x) - 0.42, rng.range(-5, -4), rng.range(0, 6));
        if (rng.next() < 0.4) fires.add(x + 2, profileY(profile, x + 2) - 0.42, rng.range(-6, -4.5));
        else drums.add(x + 2, profileY(profile, x + 2) - 0.42, rng.range(-6, -4.5), rng.range(0, 6));
      }
      // Street lights every ~14 m behind the track, volumetric cone + wet streak on the road.
      for (let x = x0 + 10; x < x1; x += rng.range(12, 17)) {
        const z = -5.2;
        const gy = profileY(profile, x) - 0.42;
        poles.add(x, gy, z, 0, 1, null, 0, 6.5, 1);
        arms.add(x, gy + 6.4, z, 0);
        heads.add(x, gy + 6.4, z + 1.6);
        lightCones.add(x, gy + 6.35, z + 1.6, 0, 1, null, 0, 6.4, 1);
        lampStreaks.add(x, gy + 0.01, z + 1.6, 0);
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
    }
  }

  // Tyre marks on the deck (art pack): the burnout arc and the straight print as alpha-masked
  // dark decals on flat stretches, avoiding spawns; one batch per texture.
  if (art) {
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
