/**
 * ROCKHOP gate language (store release Phase 2): start / checkpoint / finish per zone, replacing the neon
 * gate, the crowd grandstands and the sponsor barriers. Gates stand as a facade just behind the ribbon
 * (z ≈ −2.7) spanning along x — the way the side-on mockups frame them — so the rider passes in front:
 *   coast    striped buoys with a signal-flag line; the finish is a container-stack arch;
 *   alpine   a timber arch with red / cream / green pennants and a carved ROCKHOP sign;
 *   quarry   a rusted gantry with a teal ROCKHOP plate and a timing beam; checkpoints are red / white survey
 *            poles with a teal ROCKHOP banner;
 *   snowline timber posts with pennants and a survey-triangle plate.
 * The checkpoint-passed feedback is the game's own: each checkpoint's plaque number and lamp go green
 * (`Gates.plaques` / `Gates.lamps`, driven by the renderer), flame jets at the four corners. A finish strip
 * is painted across the deck. All structure bakes into one draw per material for the whole track.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../../../core/rng';
import type { CompiledTrack } from '../../../core/types';
import type { Biome } from '../../biomes';
import type { MaterialLibrary } from '../../materials/library';
import type { ArtLibrary } from '../../art/library';
import { fogify } from '../../lighting/environment';
import { canvas, tex } from '../canvasTex';
import { PropBatch, containerGeometry, bakeAO, triCount } from '../props';
import { profileY } from '../track';
import * as G from './geo';
import type { ZoneBiome } from './zoneKit';

export interface ZoneGates {
  group: THREE.Group;
  lamps: THREE.MeshStandardMaterial[];
  plaques: THREE.MeshStandardMaterial[];
  finishLamp: THREE.MeshStandardMaterial;
  jets: { x: number; y: number; z: number }[][];
  anim: { uTime: { value: number }; uCheer: { value: number } };
  drawCalls: number;
  triangles: number;
  textureBytes: number;
}

export interface GateHelpers {
  flagMaterial: (anim: ZoneGates['anim']) => { mat: THREE.MeshStandardMaterial; bytes: number };
}

const TEAL = '#0f5c63';
const CREAM = '#efe3c8';
const VERMILION = '#e4572e';
const INK = '#1d2326';
const FONT = (px: number): string => `900 ${px}px "Barlow Condensed", "Arial Black", Impact, Helvetica, sans-serif`;

/** The ROCKHOP wordmark: heavy caps, the first O a survey target (crosshair + vermilion dot). */
function drawWordmark(g: CanvasRenderingContext2D, cx: number, cy: number, px: number, ink: string): void {
  g.font = FONT(px);
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  const parts = ['R', 'O', 'CKHOP'];
  const w = parts.map((p) => g.measureText(p).width);
  const gap = px * 0.04;
  const total = w[0]! + w[1]! + w[2]! + gap * 2;
  let x = cx - total / 2;
  g.fillStyle = ink;
  g.fillText('R', x, cy);
  x += w[0]! + gap;
  const r = w[1]! * 0.46;
  const ox = x + w[1]! / 2;
  g.strokeStyle = ink;
  g.lineWidth = px * 0.12;
  g.beginPath();
  g.arc(ox, cy, r * 0.82, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = px * 0.05;
  g.beginPath();
  g.moveTo(ox - r * 1.05, cy);
  g.lineTo(ox + r * 1.05, cy);
  g.moveTo(ox, cy - r * 1.05);
  g.lineTo(ox, cy + r * 1.05);
  g.stroke();
  g.fillStyle = VERMILION;
  g.beginPath();
  g.arc(ox, cy, r * 0.28, 0, Math.PI * 2);
  g.fill();
  x += w[1]! + gap;
  g.fillStyle = ink;
  g.fillText('CKHOP', x, cy);
}

type SignStyle = 'teal' | 'wood' | 'cream';
/**
 * Round 2 (Q2's gantry plate): sun-faded, chipped and rust-run — a darker edge vignette, paint chips through
 * the letters to bare steel, rust bleeding from the bolt heads and a dust film settling on the lower half.
 */
function weather(g: CanvasRenderingContext2D, w: number, h: number): void {
  const r = G.lcg(0x0a1b2c);
  const v = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.62);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(24,18,12,0.55)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  const dust = g.createLinearGradient(0, h * 0.45, 0, h);
  dust.addColorStop(0, 'rgba(200,170,130,0)');
  dust.addColorStop(1, 'rgba(200,170,130,0.28)');
  g.fillStyle = dust;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 420; i++) {
    const x = r() * w;
    const y = r() * h;
    const s = 1 + r() * 5;
    g.fillStyle = r() < 0.6 ? `rgba(92,58,34,${0.5 + r() * 0.4})` : `rgba(40,44,44,${0.4 + r() * 0.4})`;
    g.beginPath();
    g.ellipse(x, y, s, s * (0.4 + r() * 0.6), r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (const [bx, by] of [[34, 34], [w - 34, 34], [34, h - 34], [w - 34, h - 34], [w / 2, 30], [w / 2, h - 30]] as const) {
    g.fillStyle = '#2a2622';
    g.beginPath();
    g.arc(bx, by, 9, 0, Math.PI * 2);
    g.fill();
    const run = g.createLinearGradient(0, by, 0, by + 90);
    run.addColorStop(0, 'rgba(130,64,26,0.75)');
    run.addColorStop(1, 'rgba(130,64,26,0)');
    g.fillStyle = run;
    g.fillRect(bx - 4, by, 8, 90);
  }
}

function signTexture(style: SignStyle, text: 'ROCKHOP' | 'FINISH', checker = false, worn = false): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 256);
  if (style === 'wood') {
    g.fillStyle = '#8a6440';
    g.fillRect(0, 0, 1024, 256);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = i % 2 ? 'rgba(60,36,18,0.25)' : 'rgba(210,170,120,0.18)';
      g.lineWidth = 2 + (i % 3);
      g.beginPath();
      const y = (i / 40) * 256 + Math.sin(i * 7.1) * 4;
      g.moveTo(0, y);
      g.bezierCurveTo(300, y + 6, 700, y - 6, 1024, y + 3);
      g.stroke();
    }
    g.strokeStyle = '#4a3020';
    g.lineWidth = 14;
    g.strokeRect(7, 7, 1010, 242);
  } else {
    g.fillStyle = style === 'teal' ? TEAL : CREAM;
    g.fillRect(0, 0, 1024, 256);
    g.strokeStyle = style === 'teal' ? CREAM : TEAL;
    g.lineWidth = 8;
    g.strokeRect(14, 14, 996, 228);
    // Weathering: a few rust streaks.
    for (let i = 0; i < 18; i++) {
      g.fillStyle = `rgba(110,60,30,${0.05 + (i % 4) * 0.03})`;
      g.fillRect(((i * 211) % 1000) + 8, 20, 3 + (i % 3) * 2, 60 + ((i * 37) % 160));
    }
  }
  if (checker) {
    const s = 32;
    for (let y = 0; y < 2; y++) for (let x = 0; x < 1024 / s; x++) {
      g.fillStyle = (x + y) % 2 ? '#f4f2ea' : INK;
      g.fillRect(x * s, 256 - (2 - y) * s, s, s);
    }
  }
  const ink = style === 'teal' ? CREAM : style === 'wood' ? '#f0dcb4' : TEAL;
  if (style === 'wood') {
    // Carved: a dark offset under the letters.
    g.save();
    g.translate(3, 4);
    if (text === 'ROCKHOP') drawWordmark(g, 512, checker ? 104 : 128, 176, '#3a2414');
    else {
      g.font = FONT(170);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#3a2414';
      g.fillText(text, 512, checker ? 104 : 128);
    }
    g.restore();
  }
  if (text === 'ROCKHOP') drawWordmark(g, 512, checker ? 104 : 128, 176, ink);
  else {
    g.font = FONT(170);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = ink;
    g.fillText(text, 512, checker ? 104 : 128);
  }
  if (worn) weather(g, 1024, 256);
  const t = tex(c, true, false);
  t.anisotropy = 8;
  return t;
}

/** Checkpoint plaque per zone: the number is the emissive map, so it lights green on pass. */
function plaqueTexture(style: 'buoy' | 'wood' | 'triangle', n: number): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const [c, g] = canvas(256, 256);
  const [ce, ge] = canvas(256, 256);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, 256, 256);
  g.clearRect(0, 0, 256, 256);
  let cy = 128;
  if (style === 'triangle') {
    g.fillStyle = CREAM;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = VERMILION;
    g.beginPath();
    g.moveTo(128, 14);
    g.lineTo(246, 236);
    g.lineTo(10, 236);
    g.closePath();
    g.fill();
    g.fillStyle = '#f7f1e2';
    g.beginPath();
    g.moveTo(128, 58);
    g.lineTo(212, 216);
    g.lineTo(44, 216);
    g.closePath();
    g.fill();
    cy = 160;
  } else if (style === 'buoy') {
    g.fillStyle = TEAL;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#f0c030';
    g.fillRect(0, 0, 256, 34);
    g.fillRect(0, 222, 256, 34);
  } else {
    g.fillStyle = '#8a6440';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#4a3020';
    g.lineWidth = 12;
    g.strokeRect(6, 6, 244, 244);
  }
  const ink = style === 'triangle' ? INK : style === 'buoy' ? CREAM : '#f0dcb4';
  for (const [ctx, col] of [[g, ink], [ge, '#ffffff']] as const) {
    ctx.fillStyle = col;
    ctx.font = FONT(style === 'triangle' ? 120 : 150);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 128, cy + 6);
  }
  return { map: tex(c, true, false), emissive: tex(ce, true, false) };
}

/** Signal-flag atlas (4 × 2 cells of the international code shapes, no letters) for the coast flag line. */
function signalFlagTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 256);
  const cells: ((x: number, y: number, s: number) => void)[] = [
    (x, y, s) => { g.fillStyle = '#f0c030'; g.fillRect(x, y, s, s); g.fillStyle = '#1f4fa0'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + s, y + s); g.lineTo(x, y + s); g.fill(); },
    (x, y, s) => { g.fillStyle = '#1f4fa0'; g.fillRect(x, y, s, s); g.fillStyle = '#f4f2ea'; g.fillRect(x + s * 0.3, y + s * 0.3, s * 0.4, s * 0.4); },
    (x, y, s) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#1f4fa0' : '#f4f2ea'; g.fillRect(x + (i * s) / 4, y + (j * s) / 4, s / 4, s / 4); } },
    (x, y, s) => { g.fillStyle = '#f0c030'; g.fillRect(x, y, s, s); g.fillStyle = '#c8322a'; g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.26, 0, Math.PI * 2); g.fill(); },
    (x, y, s) => { g.fillStyle = '#f4f2ea'; g.fillRect(x, y, s, s); g.fillStyle = '#1f4fa0'; g.fillRect(x + s * 0.4, y, s * 0.2, s); g.fillRect(x, y + s * 0.4, s, s * 0.2); },
    (x, y, s) => { g.fillStyle = '#c8322a'; g.fillRect(x, y, s, s / 2); g.fillStyle = '#f0c030'; g.fillRect(x, y + s / 2, s, s / 2); },
    (x, y, s) => { g.fillStyle = '#1f7c80'; g.fillRect(x, y, s, s); g.fillStyle = '#f0c030'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + s, y + s / 2); g.lineTo(x, y + s); g.fill(); },
    (x, y, s) => { g.fillStyle = '#f4f2ea'; g.fillRect(x, y, s, s); g.fillStyle = '#c8322a'; g.beginPath(); g.moveTo(x + s / 2, y); g.lineTo(x + s, y + s / 2); g.lineTo(x + s / 2, y + s); g.lineTo(x, y + s / 2); g.fill(); },
  ];
  cells.forEach((f, i) => f((i % 4) * 128 + 4, Math.floor(i / 4) * 128 + 4, 120));
  return tex(c, true, false);
}

export function buildZoneGates(track: CompiledTrack, biome: Biome, lib: MaterialLibrary, art: ArtLibrary | null, helpers: GateHelpers): ZoneGates {
  const id = biome.id as ZoneBiome;
  const group = new THREE.Group();
  group.name = 'gates';
  const profile = track.def.profile;
  const rng = new Rng((track.def.seed ^ 0x51ed270b) >>> 0);
  const lamps: THREE.MeshStandardMaterial[] = [];
  const plaques: THREE.MeshStandardMaterial[] = [];
  const jets: ZoneGates['jets'] = [];
  const anim: ZoneGates['anim'] = { uTime: { value: 0 }, uCheer: { value: 0 } };
  let drawCalls = 0;
  let triangles = 0;
  let textureBytes = 0;
  const ZB = -3.1; // facade plane, just behind the ribbon's far bevel
  const gyAt = (x: number): number => profileY(profile, x) - 0.42;
  const structure: THREE.BufferGeometry[] = []; // vertex-coloured painted metal / wood, one draw
  const painted = fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.15, vertexColors: true, side: THREE.DoubleSide }));
  lib.complete(painted);
  const add = (m: THREE.Mesh): void => {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    drawCalls++;
    triangles += triCount(m.geometry);
  };
  const board = (w: number, h: number, t: THREE.Texture, x: number, y: number, z: number, emissive?: THREE.Texture): THREE.MeshStandardMaterial => {
    const mat = fogify(new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, side: THREE.DoubleSide }));
    if (emissive) {
      mat.emissiveMap = emissive;
      mat.emissive = new THREE.Color(0x000000);
      mat.emissiveIntensity = 2.5;
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    add(m);
    structure.push(G.box(w + 0.12, h + 0.12, 0.06, x, y, z - 0.05, G.rgb(0x2a2420)));
    return mat;
  };
  const lampAt = (x: number, y: number, z: number): THREE.MeshStandardMaterial => {
    const mat = fogify(new THREE.MeshStandardMaterial({ color: 0x220a0a, emissive: 0x7a1010, emissiveIntensity: 1.5, roughness: 0.3 }));
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), mat);
    m.position.set(x, y, z);
    group.add(m);
    drawCalls++;
    return mat;
  };
  /** A sagging line of pennants / flags along x between (xa, ya) and (xb, yb) on the facade plane. */
  const pennants = (xa: number, xb: number, y: number, sag: number, cols: number[], tri: boolean): void => {
    const n = Math.max(3, Math.round((xb - xa) / 0.55));
    const rope = G.rgb(0x3a3026);
    for (let i = 0; i < 16; i++) {
      const t0 = i / 16;
      const t1 = (i + 1) / 16;
      structure.push(G.beam(xa + (xb - xa) * t0, y - Math.sin(t0 * Math.PI) * sag, ZB + 0.05, xa + (xb - xa) * t1, y - Math.sin(t1 * Math.PI) * sag, ZB + 0.05, 0.03, rope));
    }
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = xa + (xb - xa) * t;
      const yy = y - Math.sin(t * Math.PI) * sag;
      const col = G.rgb(cols[i % cols.length]!);
      const s = 0.4;
      const geo = new THREE.BufferGeometry();
      const pos = tri ? [x - s / 2, yy, ZB + 0.06, x + s / 2, yy, ZB + 0.06, x, yy - s * 1.2, ZB + 0.06] : [x - s / 2, yy, ZB + 0.06, x + s / 2, yy, ZB + 0.06, x + s / 2, yy - s, ZB + 0.06, x - s / 2, yy, ZB + 0.06, x + s / 2, yy - s, ZB + 0.06, x - s / 2, yy - s, ZB + 0.06];
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      structure.push(G.paint(geo, col));
    }
  };

  const sx = track.def.start.pos.x;
  const fx = track.def.finishX;
  const cps = track.def.checkpoints;
  const finishLampHolder: { m: THREE.MeshStandardMaterial | null } = { m: null };

  // Sponsor flags: a pair at the start and one at the finish (the art pack's invented brands, waving).
  const flag = helpers.flagMaterial(anim);
  textureBytes += flag.bytes;
  const flagGeo = new THREE.PlaneGeometry(1.3, 0.85, 8, 3).translate(0.65, -0.425, 0);
  G.paint(flagGeo, [1, 1, 1]);
  const flags = new PropBatch('flag', flagGeo, flag.mat, false);
  const poles = new PropBatch('flagpole', G.paint(new THREE.CylinderGeometry(0.03, 0.04, 1, 7).translate(0, 0.5, 0), G.rgb(0x3a3c40)), painted, false);
  for (const [x, z] of [[sx - 8, -5.5], [sx + 9, -6.2], [fx + 8, -5.8]] as const) {
    const y = gyAt(x) - Math.min(1, (Math.abs(z) - 3) / 30) ** 2 * 2;
    poles.add(x, y, z, 0, 1, null, 0, 4.4, 1);
    flags.add(x + 0.03, y + 4.35, z, 0.2, 1, null, 0, 1, rng.int(1, 4));
  }

  const sign = (style: SignStyle, text: 'ROCKHOP' | 'FINISH', checker: boolean, w: number, h: number, x: number, y: number, z: number): void => {
    const t = signTexture(style, text, checker);
    textureBytes += 1024 * 256 * 4 * 1.33;
    board(w, h, t, x, y, z);
  };

  // --- per zone ------------------------------------------------------------------------------------------
  const gate = (x: number, kind: 'start' | 'cp' | 'finish', n: number): void => {
    const y0 = gyAt(x);
    const big = kind !== 'cp';
    if (id === 'coast') {
      if (kind === 'finish') {
        // Container-stack arch: two stacks of two, a container across the top carrying the plate.
        const cg = bakeAO(containerGeometry(), 2.59, 0.35);
        const contM = lib.get('container');
        const legs: THREE.BufferGeometry[] = [];
        const liv = [0x2f8a8a, 0xa8482e, 0x2e5f8e, 0xb86a2a];
        for (const [i, dx] of [[0, -4.6], [1, 4.6]] as const) {
          for (let k = 0; k < 2; k++) {
            const g = cg.clone().rotateY(Math.PI / 2).translate(x + dx, y0 + k * 2.59, ZB - 3.1);
            G.paint(g, G.rgb(liv[(i * 2 + k) % 4]!), () => 1);
            legs.push(g);
          }
        }
        legs.push(G.paint(cg.clone().scale(1.75, 1, 1).translate(x, y0 + 5.18, ZB - 1.4), G.rgb(0x1f6e70)));
        const m = new THREE.Mesh(mergeGeometries(legs, false)!, contM);
        add(m);
        sign('teal', 'ROCKHOP', true, 7.4, 1.85, x, y0 + 6.5, ZB - 0.17);
        finishLampHolder.m = lampAt(x, y0 + 8.0, ZB - 1.4);
        return;
      }
      const h = big ? 4.6 : 3.6;
      const w = big ? 7 : 5.2;
      const buoy = G.buoyGeometry(h);
      for (const dx of [-w / 2, w / 2]) structure.push(buoy.clone().translate(x + dx, y0, ZB - 0.2));
      const top = y0 + h - 0.6;
      pennants(x - w / 2, x + w / 2, top, big ? 1.1 : 0.8, [0], false);
      // Signal flags replace the plain pennants: a textured strip of 8 cells along the line.
      const ft = signalFlagTexture();
      textureBytes += 512 * 256 * 4 * 1.33;
      const fm = fogify(new THREE.MeshStandardMaterial({ map: ft, roughness: 0.8, side: THREE.DoubleSide }));
      const nfl = Math.round(w / 0.75);
      const fgeo: THREE.BufferGeometry[] = [];
      for (let i = 0; i < nfl; i++) {
        const t = (i + 0.5) / nfl;
        const fxp = x - w / 2 + w * t;
        const fy = top - Math.sin(t * Math.PI) * (big ? 1.1 : 0.8);
        const p = new THREE.PlaneGeometry(0.55, 0.55).translate(fxp, fy - 0.3, ZB + 0.08);
        const cell = (i * 3 + n) % 8;
        const uv = p.getAttribute('uv') as THREE.BufferAttribute;
        const row = Math.floor(cell / 4);
        for (let k = 0; k < uv.count; k++) uv.setXY(k, ((cell % 4) + uv.getX(k)) / 4, 1 - (row + 1) / 2 + uv.getY(k) / 2);
        fgeo.push(p);
      }
      add(new THREE.Mesh(mergeGeometries(fgeo, false)!, fm));
      const lamp = lampAt(x - w / 2, y0 + h + 0.05, ZB - 0.2);
      if (kind === 'cp') {
        lamps.push(lamp);
        const pt = plaqueTexture('buoy', n);
        textureBytes += 256 * 256 * 4 * 2;
        plaques.push(board(0.9, 0.9, pt.map, x + w / 2, y0 + h * 0.52, ZB + 0.9, pt.emissive));
      } else sign('teal', 'ROCKHOP', false, 3.6, 0.9, x, top - 2.1, ZB + 0.1);
      return;
    }
    if (id === 'alpine' || id === 'snow') {
      const h = big ? 5.4 : 4.4;
      const w = big ? 7.2 : 5.6;
      const snow = id === 'snow';
      const post = G.rgb(snow ? 0x3e5a34 : 0x6a4c32);
      for (const dx of [-w / 2, w / 2]) {
        structure.push(G.cyl(0.2, 0.24, h + 0.5, 9, x + dx, y0 + (h + 0.5) / 2 - 0.3, ZB, post));
        if (!snow) {
          structure.push(G.cyl(0.25, 0.25, 0.3, 9, x + dx, y0 + 1.6, ZB, G.rgb(0xc4322a)), G.cyl(0.25, 0.25, 0.3, 9, x + dx, y0 + 1.9, ZB, G.rgb(0xefe3c8)));
        } else structure.push(G.cyl(0.27, 0.22, 0.25, 9, x + dx, y0 + h + 0.3, ZB, G.rgb(0xf4f8ff)));
      }
      structure.push(G.cyl(0.2, 0.2, w + 1.2, 9, x, y0 + h, ZB, post, 'x'));
      if (snow) structure.push(G.box(w + 1.2, 0.14, 0.42, x, y0 + h + 0.24, ZB, G.rgb(0xf4f8ff)));
      pennants(x - w / 2 + 0.2, x + w / 2 - 0.2, y0 + h - 0.25, 0.35, [0xc4322a, 0xefe3c8, 0x2e6a3a], true);
      if (big) sign(snow ? 'cream' : 'wood', 'ROCKHOP', kind === 'finish', w * 0.62, w * 0.62 * 0.25, x, y0 + h + 0.85, ZB + 0.05);
      const lamp = lampAt(x + w / 2, y0 + h + (snow ? 0.55 : 0.4), ZB);
      if (kind === 'cp') {
        lamps.push(lamp);
        const pt = plaqueTexture(snow ? 'triangle' : 'wood', n);
        textureBytes += 256 * 256 * 4 * 2;
        plaques.push(board(0.95, 0.95, pt.map, x + w / 2, y0 + h * 0.6, ZB + 0.28, pt.emissive));
      } else if (kind === 'finish') finishLampHolder.m = lamp;
      return;
    }
    // quarry
    if (big) {
      // Round 2 (Q2): weathered dark iron, not painted orange — near-black brown members with rust bloom, on
      // the library's rust-steel maps; heavier chords, gusset plates at the truss nodes, a worn teal plate.
      const w = 10;
      const H = 6.4;
      const ironParts: THREE.BufferGeometry[] = [];
      const ir = (): G.RGB => {
        const k = rng.range(0.7, 1.05);
        return rng.next() < 0.35 ? [0.24 * k, 0.11 * k, 0.05 * k] : [0.12 * k, 0.08 * k, 0.055 * k];
      };
      for (const dx of [-w / 2, w / 2]) for (const p of G.lattice(1.1, H, ir(), 0.18, 4)) ironParts.push(G.paint(p.translate(x + dx, y0, ZB - 0.3), ir()));
      for (const yy of [H, H + 1.1]) ironParts.push(G.box(w + 1.6, 0.26, 0.26, x, y0 + yy, ZB - 0.3, ir()));
      for (let i = 0; i < 10; i++) ironParts.push(G.beam(x - w / 2 - 0.5 + i * 1.1, y0 + H, ZB - 0.3, x - w / 2 + 0.6 + i * 1.1, y0 + H + 1.1, ZB - 0.3, 0.12, ir()));
      for (let i = 0; i <= 10; i++) for (const yy of [H, H + 1.1]) ironParts.push(G.box(0.34, 0.34, 0.03, x - w / 2 - 0.5 + i * 1.1, y0 + yy, ZB - 0.3 + 0.15, ir()));
      for (const dx of [-w / 2, w / 2]) ironParts.push(G.box(1.6, 0.12, 1.6, x + dx, y0 + 0.06, ZB - 0.3, [0.2, 0.18, 0.16]));
      const ironMat = lib.derive('rustSteel');
      ironMat.vertexColors = true;
      ironMat.color.setHex(0xffffff);
      add(new THREE.Mesh(G.merge(ironParts), ironMat));
      const t = signTexture('teal', 'ROCKHOP', kind === 'finish', true);
      textureBytes += 1024 * 256 * 4 * 1.33;
      board(6.2, 1.55, t, x, y0 + H + 0.55, ZB + 0.05);
      // Timing beam: a teal light line across the course at hub height, emitters on two posts.
      const beamMat = fogify(new THREE.MeshStandardMaterial({ color: 0x0a2a2c, emissive: 0x4ff0e0, emissiveIntensity: 3, roughness: 0.4 }));
      const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 4.75, 5).rotateX(Math.PI / 2), beamMat);
      bm.position.set(x, y0 + 1.05, -0.525);
      group.add(bm);
      drawCalls++;
      // Emitter posts either side; the near one stands on the deck inside its edge (round 2: the ground in front
      // of the quarry deck is 1.7 m lower).
      structure.push(G.box(0.16, 1.2, 0.16, x, y0 + 0.6, -2.9, G.rgb(0x2a2c30)), G.box(0.22, 0.22, 0.22, x, y0 + 1.05, -2.9, G.rgb(0xd8d2c4)));
      structure.push(G.box(0.16, 0.8, 0.16, x, y0 + 0.42 + 0.4, 1.85, G.rgb(0x2a2c30)), G.box(0.22, 0.22, 0.22, x, y0 + 1.05, 1.85, G.rgb(0xd8d2c4)));
      const lamp = lampAt(x + w / 2, y0 + H + 1.4, ZB - 0.3);
      if (kind === 'finish') finishLampHolder.m = lamp;
      return;
    }
    const w = 4.8;
    for (const dx of [-w / 2, w / 2]) structure.push(G.surveyPoleGeometry(3.4).translate(x + dx, y0, ZB));
    const bt = signTexture('teal', 'ROCKHOP');
    textureBytes += 1024 * 256 * 4 * 1.33;
    board(w - 0.3, (w - 0.3) * 0.2, bt, x, y0 + 3.0, ZB + 0.02);
    lamps.push(lampAt(x - w / 2, y0 + 3.5, ZB));
    const pt = plaqueTexture('triangle', n);
    textureBytes += 256 * 256 * 4 * 2;
    plaques.push(board(0.9, 0.9, pt.map, x + w / 2, y0 + 1.9, ZB + 0.12, pt.emissive));
  };

  gate(sx - 1.0, 'start', 0);
  cps.forEach((cp, i) => {
    gate(cp.x, 'cp', i + 1);
    const gy = cp.spawn.pos.y;
    jets.push([
      { x: cp.x - 0.6, y: gy, z: -1.6 },
      { x: cp.x + 0.6, y: gy, z: -1.6 },
      { x: cp.x - 0.6, y: gy, z: 1.6 },
      { x: cp.x + 0.6, y: gy, z: 1.6 },
    ]);
  });
  gate(fx, 'finish', 0);

  // Finish strip painted across the deck.
  {
    const [c, g] = canvas(256, 64);
    for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 8; xx++) {
      g.fillStyle = (xx + yy) % 2 ? '#f4f2ea' : INK;
      g.fillRect(xx * 32, yy * 32, 32, 32);
    }
    const t = tex(c, true, false);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.7).rotateX(-Math.PI / 2).rotateY(Math.PI / 2), fogify(new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
    m.position.set(fx, profileY(profile, fx) + 0.015, 0);
    m.receiveShadow = true;
    group.add(m);
    drawCalls++;
    textureBytes += 256 * 64 * 4;
  }

  const finishLamp = finishLampHolder.m ?? lampAt(fx, gyAt(fx) + 5, ZB);
  if (structure.length) add(new THREE.Mesh(G.merge(structure), painted));
  for (const b of [flags, poles]) {
    const im = b.build();
    if (!im) continue;
    group.add(im);
    drawCalls++;
    triangles += triCount(b.geometry) * b.count;
  }
  void art;
  return { group, lamps, plaques, finishLamp, jets, anim, drawCalls, triangles, textureBytes };
}
