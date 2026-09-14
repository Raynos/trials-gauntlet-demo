/**
 * Procedural texture generator. No downloads: every surface in the game is
 * built here from periodic value noise into DataTextures (albedo sRGB, normal
 * from height via Sobel, ORM = AO.r / roughness.g / metalness.b).
 *
 * Deterministic: seeded permutation table, pure integer/float math, no Date.
 */
import * as THREE from 'three';

export interface TexSet {
  map: THREE.DataTexture;
  normalMap: THREE.DataTexture;
  ormMap: THREE.DataTexture;
  /** Bytes on the GPU including a 1.33x mip chain. */
  bytes: number;
}

type Painter = (u: number, v: number, n: Noise, out: Pixel) => void;

export interface Pixel {
  r: number;
  g: number;
  b: number;
  h: number; // height 0..1
  rough: number;
  metal: number;
  ao: number;
}

/** Periodic value noise on a 256 lattice, seeded. */
export class Noise {
  private readonly perm = new Uint8Array(512);
  private readonly grad = new Float32Array(512);

  constructor(seed: number) {
    let s = seed >>> 0 || 1;
    const rnd = (): number => {
      s = (s + 0x9e3779b9) | 0;
      let t = s ^ (s >>> 16);
      t = Math.imul(t, 0x21f0aaad);
      t = t ^ (t >>> 15);
      t = Math.imul(t, 0x735a2d97);
      return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
    };
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = p[i]!;
      p[i] = p[j]!;
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255]!;
      this.grad[i] = rnd();
    }
  }

  /** Hash of an integer lattice point, in [0,1). */
  cell(ix: number, iy: number, period: number): number {
    const px = ((ix % period) + period) % period;
    const py = ((iy % period) + period) % period;
    return this.grad[this.perm[(px + this.perm[py & 255]!) & 255]! + (px & 255)]!;
  }

  /** Value noise, x/y in lattice units, tiles every `period` units. */
  value(x: number, y: number, period: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let fx = x - ix;
    let fy = y - iy;
    fx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    fy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = this.cell(ix, iy, period);
    const b = this.cell(ix + 1, iy, period);
    const c = this.cell(ix, iy + 1, period);
    const d = this.cell(ix + 1, iy + 1, period);
    const ab = a + (b - a) * fx;
    const cd = c + (d - c) * fx;
    return ab + (cd - ab) * fy;
  }

  /** fbm in [0,1], u/v in tile units [0,1). */
  fbm(u: number, v: number, freq: number, octaves: number, gain = 0.5): number {
    let amp = 1;
    let sum = 0;
    let norm = 0;
    let f = freq;
    for (let o = 0; o < octaves; o++) {
      sum += this.value(u * f, v * f, f) * amp;
      norm += amp;
      amp *= gain;
      f *= 2;
    }
    return sum / norm;
  }

  /** Ridged noise in [0,1]. */
  ridged(u: number, v: number, freq: number, octaves: number): number {
    let amp = 1;
    let sum = 0;
    let norm = 0;
    let f = freq;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(this.value(u * f, v * f, f) * 2 - 1);
      sum += n * n * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }

  /** Distance to the nearest of one jittered point per cell (Worley F1), in [0,1]. */
  worley(u: number, v: number, freq: number): number {
    const x = u * freq;
    const y = v * freq;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let best = 9;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx;
        const cy = iy + dy;
        const px = cx + this.cell(cx, cy, freq);
        const py = cy + this.cell(cy * 7 + 3, cx * 3 + 11, freq);
        const d = (px - x) * (px - x) + (py - y) * (py - y);
        if (d < best) best = d;
      }
    }
    return Math.min(1, Math.sqrt(best));
  }
}

const px: Pixel = { r: 0, g: 0, b: 0, h: 0, rough: 0.5, metal: 0, ao: 1 };

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Run a painter over a size x size tile and pack the three maps. */
export function generate(size: number, seed: number, paint: Painter, normalStrength = 1.5): TexSet {
  const n = new Noise(seed);
  const albedo = new Uint8Array(size * size * 4);
  const orm = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  const inv = 1 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      px.rough = 0.5;
      px.metal = 0;
      px.ao = 1;
      paint((x + 0.5) * inv, (y + 0.5) * inv, n, px);
      const i = (y * size + x) * 4;
      albedo[i] = clamp01(px.r) * 255;
      albedo[i + 1] = clamp01(px.g) * 255;
      albedo[i + 2] = clamp01(px.b) * 255;
      albedo[i + 3] = 255;
      orm[i] = clamp01(px.ao) * 255;
      orm[i + 1] = clamp01(px.rough) * 255;
      orm[i + 2] = clamp01(px.metal) * 255;
      orm[i + 3] = 255;
      height[y * size + x] = px.h;
    }
  }
  // Sobel → tangent-space normal (periodic).
  const normal = new Uint8Array(size * size * 4);
  const H = (x: number, y: number): number => height[((y + size) % size) * size + ((x + size) % size)]!;
  const k = normalStrength * size * 0.02;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1);
      const dy = H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1);
      let nx = -dx * k;
      let ny = -dy * k;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * size + x) * 4;
      normal[i] = (nx * 0.5 + 0.5) * 255;
      normal[i + 1] = (ny * 0.5 + 0.5) * 255;
      normal[i + 2] = (nz * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;
    }
  }
  const mk = (data: Uint8Array, srgb: boolean): THREE.DataTexture => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return {
    map: mk(albedo, true),
    normalMap: mk(normal, false),
    ormMap: mk(orm, false),
    bytes: size * size * 4 * 3 * 1.333,
  };
}

// ---------------------------------------------------------------------------
// Painters
// ---------------------------------------------------------------------------

function mix3(out: Pixel, r0: number, g0: number, b0: number, r1: number, g1: number, b1: number, t: number): void {
  out.r = r0 + (r1 - r0) * t;
  out.g = g0 + (g1 - g0) * t;
  out.b = b0 + (b1 - b0) * t;
}

export const painters = {
  /** Packed earth with pebbles and a darker damp fbm. */
  dirt(u: number, v: number, n: Noise, o: Pixel): void {
    const base = n.fbm(u, v, 6, 5, 0.55);
    const fine = n.fbm(u + 0.31, v + 0.77, 40, 3, 0.5);
    const pebble = 1 - n.worley(u, v, 28);
    const peb = pebble > 0.78 ? (pebble - 0.78) / 0.22 : 0;
    const damp = n.fbm(u + 0.5, v, 3, 3);
    // sienna → pale sand
    mix3(o, 0.30, 0.20, 0.13, 0.55, 0.42, 0.28, base * 0.7 + fine * 0.3);
    const d = damp * 0.35;
    o.r *= 1 - d;
    o.g *= 1 - d;
    o.b *= 1 - d * 0.8;
    if (peb > 0) {
      o.r = o.r * (1 - peb) + 0.42 * peb;
      o.g = o.g * (1 - peb) + 0.40 * peb;
      o.b = o.b * (1 - peb) + 0.36 * peb;
    }
    o.h = base * 0.6 + fine * 0.15 + peb * 0.4;
    o.rough = 0.92 - peb * 0.2;
    o.ao = 0.75 + base * 0.25;
  },

  /** Poured concrete: fine grain, cracks, oil stains. */
  concrete(u: number, v: number, n: Noise, o: Pixel): void {
    const grain = n.fbm(u, v, 24, 4, 0.5);
    const blotch = n.fbm(u + 0.2, v + 0.6, 4, 3, 0.6);
    const crack = n.ridged(u, v, 5, 3);
    const c = crack > 0.86 ? (crack - 0.86) / 0.14 : 0;
    const l = 0.42 + (grain - 0.5) * 0.2 + (blotch - 0.5) * 0.3;
    o.r = l * 1.0;
    o.g = l * 0.98;
    o.b = l * 0.94;
    const stain = n.fbm(u * 1.3, v * 0.7, 3, 2);
    if (stain > 0.62) {
      const s = (stain - 0.62) * 2.2;
      o.r *= 1 - s * 0.5;
      o.g *= 1 - s * 0.5;
      o.b *= 1 - s * 0.45;
    }
    o.r *= 1 - c * 0.6;
    o.g *= 1 - c * 0.6;
    o.b *= 1 - c * 0.6;
    o.h = 0.5 + (grain - 0.5) * 0.3 - c * 0.5;
    o.rough = 0.82 + grain * 0.1;
    o.ao = 1 - c * 0.5;
  },

  /** Pale weathered planks running along u (3 planks per tile). */
  plank(u: number, v: number, n: Noise, o: Pixel): void {
    const planks = 3;
    const pv = v * planks;
    const pi = Math.floor(pv);
    const fv = pv - pi;
    const seam = fv < 0.035 || fv > 0.965;
    const plankSeed = n.cell(pi * 13 + 5, 7, 251);
    const offset = plankSeed * 4;
    // Grain: warped stripes along u.
    const warp = n.fbm(u + offset, fv * 0.3, 3, 2) * 0.12;
    const grain = 0.5 + 0.5 * Math.sin((fv * 0.35 + warp + plankSeed) * 60 + u * 4);
    const g2 = n.fbm(u * 3 + offset, fv, 18, 3, 0.5);
    const knotD = n.worley(u + offset, fv * 0.33, 4);
    const knot = knotD < 0.08 ? 1 - knotD / 0.08 : 0;
    const wear = n.fbm(u, v, 5, 3, 0.6);
    // pale silver-blond wood
    const lum = 0.62 + plankSeed * 0.14 + (g2 - 0.5) * 0.18 - grain * 0.08 + (wear - 0.5) * 0.12;
    o.r = lum * 0.98;
    o.g = lum * 0.90;
    o.b = lum * 0.76;
    if (knot > 0) {
      const k = knot * 0.7;
      o.r *= 1 - k;
      o.g *= 1 - k * 1.1;
      o.b *= 1 - k * 1.2;
    }
    // Grey weathering toward the plank edges.
    const edge = Math.min(fv, 1 - fv) * 6;
    const grey = clamp01(1 - edge) * 0.35;
    const m = (o.r + o.g + o.b) / 3;
    o.r = o.r * (1 - grey) + m * grey;
    o.g = o.g * (1 - grey) + m * grey;
    o.b = o.b * (1 - grey) + m * grey;
    if (seam) {
      o.r *= 0.25;
      o.g *= 0.25;
      o.b *= 0.25;
    }
    o.h = seam ? 0 : 0.55 + (g2 - 0.5) * 0.25 - grain * 0.08 - knot * 0.3 + plankSeed * 0.08;
    o.rough = 0.72 + grain * 0.12 + (wear - 0.5) * 0.15;
    o.ao = seam ? 0.4 : 0.9 + wear * 0.1;
  },

  /** Corrugated painted steel with rust bloom (ribs along v). */
  corrugated(u: number, v: number, n: Noise, o: Pixel): void {
    const rib = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 12);
    const rust = n.fbm(u, v, 5, 4, 0.6);
    const streak = n.fbm(u * 8, v * 0.5, 6, 2);
    const paintWear = clamp01((rust - 0.52) * 4 + (streak - 0.5) * 0.6);
    // paint colour is supplied per material via `color`; here we paint near-white and let color tint
    const dirtL = 0.85 - n.fbm(u, v, 14, 3) * 0.2;
    o.r = dirtL;
    o.g = dirtL;
    o.b = dirtL;
    if (paintWear > 0) {
      o.r = o.r * (1 - paintWear) + 0.45 * paintWear;
      o.g = o.g * (1 - paintWear) + 0.22 * paintWear;
      o.b = o.b * (1 - paintWear) + 0.10 * paintWear;
    }
    o.h = rib * 0.8 + n.fbm(u, v, 30, 2) * 0.1 - paintWear * 0.15;
    o.rough = 0.45 + paintWear * 0.45 + (1 - rib) * 0.05;
    o.metal = 0.9 * (1 - paintWear * 0.6);
    o.ao = 0.85 + rib * 0.15;
  },

  /** Rusted rolled steel: dark iron with orange scale. */
  rust(u: number, v: number, n: Noise, o: Pixel): void {
    const big = n.fbm(u, v, 4, 4, 0.6);
    const fine = n.fbm(u + 0.4, v + 0.1, 24, 3, 0.5);
    const scale = clamp01((big - 0.45) * 2.5);
    mix3(o, 0.20, 0.19, 0.18, 0.46, 0.22, 0.09, scale);
    const l = 0.85 + (fine - 0.5) * 0.4;
    o.r *= l;
    o.g *= l;
    o.b *= l;
    o.h = 0.5 + (fine - 0.5) * 0.3 + scale * 0.2;
    o.rough = 0.55 + scale * 0.4;
    o.metal = 1 - scale * 0.7;
    o.ao = 0.9 + fine * 0.1;
  },

  /** Painted metal with edge wear and micro scratches (bike frame, gates). */
  paintedMetal(u: number, v: number, n: Noise, o: Pixel): void {
    const scratch = n.fbm(u * 6, v * 0.4, 30, 2);
    const wear = n.fbm(u, v, 7, 3, 0.55);
    const chip = clamp01((wear - 0.6) * 6);
    o.r = o.g = o.b = 1 - chip * 0.65;
    o.h = 0.5 + (scratch - 0.5) * 0.06 - chip * 0.2;
    o.rough = 0.42 + (scratch - 0.5) * 0.08 + chip * 0.35;
    o.metal = chip;
    o.ao = 1;
  },

  /** Knobbly tyre: tread blocks, u around the tyre, v across. */
  rubber(u: number, v: number, n: Noise, o: Pixel): void {
    const bu = u * 48;
    const bv = v * 6;
    const iu = Math.floor(bu);
    const stagger = iu % 2 === 0 ? 0 : 0.5;
    const fu = bu - iu;
    const fv = (bv + stagger) % 1;
    const block = fu > 0.15 && fu < 0.85 && fv > 0.18 && fv < 0.82 ? 1 : 0;
    const sidewall = Math.abs(v - 0.5) > 0.42 ? 1 : 0;
    const dust = n.fbm(u * 4, v, 20, 3);
    const base = 0.05 + dust * 0.04;
    o.r = base + block * 0.01;
    o.g = base;
    o.b = base;
    if (block && !sidewall) {
      o.r += dust * 0.05;
      o.g += dust * 0.045;
      o.b += dust * 0.035;
    }
    o.h = sidewall ? 0.3 : block ? 0.9 : 0.2;
    o.rough = 0.88 + dust * 0.1;
    o.ao = block ? 1 : 0.6;
  },

  /** Woven jersey / leather for the rider. */
  fabric(u: number, v: number, n: Noise, o: Pixel): void {
    const weave = 0.5 + 0.25 * Math.sin(u * 600) + 0.25 * Math.sin(v * 600);
    const fold = n.fbm(u, v, 5, 3);
    o.r = o.g = o.b = 0.9 + (fold - 0.5) * 0.2;
    o.h = weave * 0.3 + fold * 0.2;
    o.rough = 0.8 + weave * 0.15;
    o.ao = 1;
  },

  /** Brick wall for the warehouse back plane (courses along u). */
  brick(u: number, v: number, n: Noise, o: Pixel): void {
    const rows = 16;
    const rv = v * rows;
    const ri = Math.floor(rv);
    const fv = rv - ri;
    const cols = 8;
    const ru = u * cols + (ri % 2) * 0.5;
    const ci = Math.floor(ru);
    const fu = ru - ci;
    const mortar = fv < 0.12 || fu < 0.06;
    const bSeed = n.cell(ci * 7 + ri * 3, ri, 255);
    const grime = n.fbm(u, v, 4, 3, 0.6);
    const fine = n.fbm(u, v, 40, 2);
    if (mortar) {
      const l = 0.38 + fine * 0.1 - grime * 0.1;
      o.r = l;
      o.g = l * 0.97;
      o.b = l * 0.92;
      o.h = 0.2;
    } else {
      mix3(o, 0.42, 0.20, 0.14, 0.58, 0.36, 0.26, bSeed);
      const l = 0.85 + (fine - 0.5) * 0.3 - grime * 0.35;
      o.r *= l;
      o.g *= l;
      o.b *= l;
      o.h = 0.6 + (fine - 0.5) * 0.15;
    }
    o.rough = 0.9;
    o.ao = mortar ? 0.6 : 0.85 + (1 - grime) * 0.15;
  },

  /** Sandstone rock for canyon bodies. */
  rock(u: number, v: number, n: Noise, o: Pixel): void {
    const strata = 0.5 + 0.5 * Math.sin(v * 40 + n.fbm(u, v, 3, 2) * 6);
    const big = n.fbm(u, v, 5, 4, 0.55);
    const fine = n.fbm(u, v, 30, 3);
    mix3(o, 0.62, 0.36, 0.22, 0.82, 0.58, 0.40, strata * 0.6 + big * 0.4);
    const l = 0.9 + (fine - 0.5) * 0.25;
    o.r *= l;
    o.g *= l;
    o.b *= l;
    o.h = big * 0.6 + strata * 0.25 + fine * 0.15;
    o.rough = 0.9;
    o.ao = 0.8 + big * 0.2;
  },

  /** Packed snow: bright, blue in the hollows, sparkle roughness. */
  snow(u: number, v: number, n: Noise, o: Pixel): void {
    const big = n.fbm(u, v, 4, 4, 0.55);
    const fine = n.fbm(u, v, 36, 2);
    const l = 0.88 + (big - 0.5) * 0.12;
    o.r = l * 0.96;
    o.g = l * 0.98;
    o.b = l * 1.0;
    o.h = big * 0.7 + fine * 0.3;
    o.rough = 0.55 + fine * 0.4;
    o.ao = 0.9 + big * 0.1;
  },
};

export type PainterName = keyof typeof painters;
