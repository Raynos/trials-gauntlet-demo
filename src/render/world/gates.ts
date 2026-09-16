/**
 * Trials set pieces (round 7): start gate with a spectator crowd behind
 * sponsor barriers and team flags, checkpoint gates (steel posts, numbered
 * plaque that lights green on pass, lamp, a small crowd cluster), and the
 * finish arch (checkered banner, crowd, flags). The crowd is an instanced
 * billboard kit: one atlas of 8 painted figures × 2 poses; the vertex shader
 * picks the pose and bobs each figure on `uCheer` (GO / finish), clocked from
 * simulated time so every capture is identical.
 */
import * as THREE from 'three';
import { Rng } from '../../core/rng';
import type { CompiledTrack } from '../../core/types';
import type { Biome } from '../biomes';
import type { MaterialLibrary } from '../materials/library';
import { fogify } from '../lighting/environment';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvas, tex } from './canvasTex';
import { PropBatch, bakeAO, triCount, trussGeometry, lightConeGeometry } from './props';
import { drawArt, type ArtLibrary } from '../art/library';
import { groundFloorY, profileY } from './track';
import { foregroundKeepOut } from './hall';
import { planSetPieces } from './setPieces';

export interface Gates {
  group: THREE.Group;
  lamps: THREE.MeshStandardMaterial[];
  /** Plaque materials per checkpoint: emissive goes green once passed. */
  plaques: THREE.MeshStandardMaterial[];
  finishLamp: THREE.MeshStandardMaterial;
  /** Flame jet emitter positions per checkpoint (world). */
  jets: { x: number; y: number; z: number }[][];
  /** Shared animation uniforms (crowd bob / pose, flag wave). */
  anim: { uTime: { value: number }; uCheer: { value: number } };
  drawCalls: number;
  triangles: number;
  textureBytes: number;
}

const TEAM = ['#2a5cc8', '#e0b83a', '#c8443a', '#3a9a68', '#e07a30', '#e8e6e0', '#7a4ab8', '#3aa8c0'];
// Fictional sponsors only (round 8 brands audit): the art pack's banner brands plus generic
// series text. No real-world company or trademark string anywhere in the renderer.
const SPONSORS = ['VORTEX OIL', 'KESTREL', 'NORDVIK', 'APEX', 'BOLT', 'IRONWORKS', 'TRIALS'];
/** Manifest ids of the sponsor banners (all fictional brands). */
const BANNER_IDS = ['banner-vortex-oil', 'banner-kestrel-tyres', 'banner-nordvik', 'banner-apex-suspension', 'banner-bolt-energy', 'banner-ironworks-series'];

function plaqueTexture(n: number): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const [c, g] = canvas(256, 128);
  const [ce, ge] = canvas(256, 128);
  g.fillStyle = '#1c1d21';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#f2efe6';
  g.lineWidth = 6;
  g.strokeRect(6, 6, 244, 116);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, 256, 128);
  for (const [ctx, ink] of [[g, '#f2efe6'], [ge, '#ffffff']] as const) {
    ctx.fillStyle = ink;
    ctx.font = 'italic bold 88px Impact, "Arial Black", Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 150, 68);
    ctx.font = 'bold 26px Impact, "Arial Black", Helvetica, sans-serif';
    ctx.fillText('CP', 52, 68);
  }
  return { map: tex(c, true, false), emissive: tex(ce, true, false) };
}

function bannerTexture(text: string, fill: string, ink: string, w = 1024, h = 256): THREE.CanvasTexture {
  const [c, g] = canvas(w, h);
  g.fillStyle = fill;
  g.fillRect(0, 0, w, h);
  g.fillStyle = ink;
  g.font = `italic bold ${Math.floor(h * 0.62)}px Impact, "Arial Black", Helvetica, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 6);
  return tex(c, true, false);
}

function checkerTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 128);
  const n = 4;
  const s = c.height / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < c.width / s; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? '#f4f4f2' : '#121214';
      g.fillRect(x * s, y * s, s, s);
    }
  }
  g.fillStyle = 'rgba(220,40,30,0.92)';
  g.fillRect(96, 28, 320, 72);
  g.fillStyle = '#ffffff';
  g.font = 'italic bold 58px Impact, "Arial Black", Helvetica, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('FINISH', 256, 66);
  return tex(c, true, false);
}

/** Sponsor strip for the crowd barriers: 4 boards per tile, repeats along x. With the art pack the boards are the printed vinyl banners (centre-cropped 3:2 → 2:1). */
function sponsorStrip(rng: Rng, art: ArtLibrary | null): { tex: THREE.CanvasTexture; bytes: number } {
  const banners = art ? BANNER_IDS.filter((id) => art.has(id)) : [];
  if (art && banners.length) {
    const [c, g] = canvas(2048, 256);
    const order = banners.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    for (let i = 0; i < 4; i++) {
      const bmp = art.bitmap(order[i % order.length]!)!;
      // Crop the middle 2:1 band of the 3:2 banner; a thin dark frame between boards.
      const sh = bmp.width / 2;
      drawArt(g, bmp, i * 512, 0, 512, 256, 0, (bmp.height - sh) / 2, bmp.width, sh);
      g.fillStyle = 'rgba(20,20,22,0.9)';
      g.fillRect(i * 512, 0, 6, 256);
      g.fillRect(i * 512 + 506, 0, 6, 256);
    }
    const t = tex(c, true, true);
    t.anisotropy = 8;
    return { tex: t, bytes: 2048 * 256 * 4 * 1.33 };
  }
  const [c, g] = canvas(1024, 128);
  for (let i = 0; i < 4; i++) {
    const x = i * 256;
    const dark = rng.next() < 0.5;
    g.fillStyle = dark ? '#16171b' : '#f0ede4';
    g.fillRect(x, 0, 256, 128);
    g.fillStyle = TEAM[rng.int(0, TEAM.length - 1)]!;
    g.fillRect(x, 0, 256, 14);
    g.fillRect(x, 114, 256, 14);
    g.fillStyle = dark ? '#f0ede4' : '#16171b';
    g.font = 'italic bold 64px Impact, "Arial Black", Helvetica, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(SPONSORS[rng.int(0, SPONSORS.length - 1)]!, x + 128, 66);
  }
  return { tex: tex(c, true, true), bytes: 1024 * 128 * 4 * 1.33 };
}

/**
 * Crowd sheet. Art pack: the keyed photo row of 8 spectators (`crowd-day` for daylit biomes,
 * `crowd-night` for nightCity / foundry) — 8 cells, one pose (the cheer is the bob).
 * Fallback: 8 painted figures × 2 poses (arms down | arms up), 64×256 px per cell.
 */
function crowdSheet(rng: Rng, art: ArtLibrary | null, night: boolean): { tex: THREE.Texture; cells: number; poses: number; aspect: number; bytes: number } {
  const id = night ? 'crowd-night' : 'crowd-day';
  const t = art?.texture(id, true, false) ?? null;
  const e = art?.entry(id);
  if (t && e) {
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 8;
    return { tex: t, cells: 8, poses: 1, aspect: e.w / 8 / e.h, bytes: e.bytes };
  }
  return { tex: crowdAtlas(rng), cells: 16, poses: 2, aspect: 64 / 256, bytes: 1024 * 256 * 4 * 1.33 };
}

function crowdAtlas(rng: Rng): THREE.CanvasTexture {
  const W = 1024;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  const skins = ['#e8b990', '#c98d63', '#8d5a3b', '#f0c9a8', '#5c3a26'];
  const figs: { skin: string; shirt: string; pants: string; cap: string | null; w: number; h: number; hair: string }[] = [];
  for (let i = 0; i < 8; i++) {
    figs.push({
      skin: skins[rng.int(0, skins.length - 1)]!,
      shirt: TEAM[rng.int(0, TEAM.length - 1)]!,
      pants: ['#22252c', '#2b3a5a', '#4a4640', '#1a1a1c'][rng.int(0, 3)]!,
      cap: rng.next() < 0.5 ? TEAM[rng.int(0, TEAM.length - 1)]! : null,
      w: rng.range(0.85, 1.15),
      h: rng.range(0.9, 1.05),
      hair: ['#2a1a10', '#4a3020', '#c8a060', '#101010'][rng.int(0, 3)]!,
    });
  }
  for (let pose = 0; pose < 2; pose++) {
    for (let i = 0; i < 8; i++) {
      const f = figs[i]!;
      const x0 = (pose * 8 + i) * 64 + 32;
      const s = f.h;
      const base = 250;
      const legH = 92 * s;
      const torsoH = 76 * s;
      const headR = 13;
      // Legs
      g.fillStyle = f.pants;
      g.fillRect(x0 - 13 * f.w, base - legH, 11 * f.w, legH);
      g.fillRect(x0 + 2 * f.w, base - legH, 11 * f.w, legH);
      // Shoes
      g.fillStyle = '#111';
      g.fillRect(x0 - 15 * f.w, base - 6, 14 * f.w, 6);
      g.fillRect(x0 + 1 * f.w, base - 6, 14 * f.w, 6);
      // Torso
      const ty = base - legH - torsoH;
      g.fillStyle = f.shirt;
      g.beginPath();
      g.roundRect(x0 - 17 * f.w, ty, 34 * f.w, torsoH + 4, 6);
      g.fill();
      // Arms
      g.strokeStyle = f.shirt;
      g.lineCap = 'round';
      g.lineWidth = 9 * f.w;
      g.beginPath();
      if (pose === 0) {
        g.moveTo(x0 - 19 * f.w, ty + 8);
        g.lineTo(x0 - 24 * f.w, ty + torsoH - 4);
        g.moveTo(x0 + 19 * f.w, ty + 8);
        g.lineTo(x0 + 24 * f.w, ty + torsoH - 4);
      } else {
        g.moveTo(x0 - 19 * f.w, ty + 8);
        g.lineTo(x0 - 27 * f.w, ty - 44);
        g.moveTo(x0 + 19 * f.w, ty + 8);
        g.lineTo(x0 + 27 * f.w, ty - 44);
      }
      g.stroke();
      // Hands
      g.fillStyle = f.skin;
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.arc(x0 + sx * (pose === 0 ? 24 : 27) * f.w, pose === 0 ? ty + torsoH - 2 : ty - 48, 5, 0, Math.PI * 2);
        g.fill();
      }
      // Head + hair / cap
      const hy = ty - headR - 3;
      g.beginPath();
      g.arc(x0, hy, headR, 0, Math.PI * 2);
      g.fill();
      if (f.cap) {
        g.fillStyle = f.cap;
        g.beginPath();
        g.arc(x0, hy - 1, headR + 1, Math.PI, 0);
        g.fill();
        g.fillRect(x0 - headR - 6, hy - 3, headR * 2 + 6, 4);
      } else {
        g.fillStyle = f.hair;
        g.beginPath();
        g.arc(x0, hy - 2, headR, Math.PI * 1.05, Math.PI * 1.95);
        g.fill();
      }
    }
  }
  const t = tex(c, true, false);
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

/** 2×2 team-flag atlas: the art pack's sponsor banners (square centre crop) or painted team flags. */
function flagAtlas(rng: Rng, art: ArtLibrary | null): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const banners = art ? BANNER_IDS.filter((id) => art.has(id)) : [];
  for (let i = 0; i < 4; i++) {
    const x = (i % 2) * 256;
    const y = Math.floor(i / 2) * 256;
    if (art && banners.length) {
      const bmp = art.bitmap(banners[(i * 2 + rng.int(0, 1)) % banners.length]!)!;
      // Flags are 1.3 × 0.85: crop a 3:2 band so the emblem is not squashed.
      const sh = bmp.height * 0.9;
      drawArt(g, bmp, x, y, 256, 256, 0, (bmp.height - sh) / 2, bmp.width, sh);
      continue;
    }
    const a = TEAM[rng.int(0, TEAM.length - 1)]!;
    let b = TEAM[rng.int(0, TEAM.length - 1)]!;
    if (b === a) b = '#f2f2f2';
    g.fillStyle = a;
    g.fillRect(x, y, 256, 256);
    g.fillStyle = b;
    const kind = rng.int(0, 2);
    if (kind === 0) g.fillRect(x, y + 96, 256, 64);
    else if (kind === 1) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 256, y + 256);
      g.lineTo(x + 256, y + 160);
      g.lineTo(x + 96, y);
      g.closePath();
      g.fill();
    } else {
      g.beginPath();
      g.arc(x + 128, y + 128, 70, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = kind === 2 ? a : b;
    g.font = 'italic bold 72px Impact, "Arial Black", Helvetica, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(SPONSORS[rng.int(0, SPONSORS.length - 1)]!, x + 128, y + 128);
  }
  return tex(c, true, false);
}

/**
 * Animated-card material: instanced planes whose atlas cell comes from the
 * instance's z-scale (1..N) and whose motion is driven by uTime / uCheer.
 * mode 0 = crowd (16-cell strip, pose switch + bob), 1 = flag (2×2 atlas, wave).
 */
function cardMaterial(map: THREE.Texture, mode: 0 | 1, anim: Gates['anim'], cells = 16, poses = 2): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.9, side: THREE.DoubleSide, vertexColors: true });
  fogify(m);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.uniforms.uTime = anim.uTime;
    shader.uniforms.uCheer = anim.uCheer;
    shader.uniforms.uMode = { value: mode };
    shader.uniforms.uCells = { value: cells };
    shader.uniforms.uPoseShift = { value: poses > 1 ? cells / poses : 0 };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uCheer;
        uniform float uMode;
        uniform float uCells;
        uniform float uPoseShift;`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        float cardCell = floor(length(instanceMatrix[2].xyz) + 0.5) - 1.0;
        float cardPh = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 0.9;
        float cardS = sin(uTime * 7.0 + cardPh);
        #ifdef USE_MAP
        if (uMode < 0.5) {
          float up = step(0.0, cardS) * step(0.5, uCheer);
          vMapUv.x = (vMapUv.x + cardCell + up * uPoseShift) / uCells;
        } else {
          vMapUv = (vMapUv + vec2(mod(cardCell, 2.0), floor(cardCell / 2.0))) * 0.5;
        }
        #endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        if (uMode < 0.5) {
          transformed.y += uCheer * 0.16 * max(0.0, cardS) * step(0.01, uv.y);
          transformed.x += 0.02 * sin(uTime * 1.3 + cardPh) * uv.y;
        } else {
          float wv = sin(uTime * 5.0 + uv.x * 7.0 + cardPh) * uv.x;
          transformed.z += 0.12 * wv;
          transformed.y += 0.03 * wv;
        }`,
      );
  };
  return m;
}

export function buildGates(track: CompiledTrack, biome: Biome, lib: MaterialLibrary, art: ArtLibrary | null = null): Gates {
  const group = new THREE.Group();
  group.name = 'gates';
  const profile = track.def.profile;
  const rng = new Rng((track.def.seed ^ 0x51ed270b) >>> 0);
  const steel = fogify(lib.get('darkSteel'));
  const lamps: THREE.MeshStandardMaterial[] = [];
  const plaques: THREE.MeshStandardMaterial[] = [];
  const jets: Gates['jets'] = [];
  const anim: Gates['anim'] = { uTime: { value: 0 }, uCheer: { value: 0 } };
  let drawCalls = 0;
  let triangles = 0;
  let textureBytes = 0;
  const interior = biome.interior;
  const floorY = groundFloorY(profile, interior);
  const gyAt = (x: number, z: number): number => (interior ? floorY : profileY(profile, x) - 0.42 - Math.min(1, (Math.abs(z) - 3) / 30) ** 2 * 2.5);

  // --- Shared kit -----------------------------------------------------------
  const sheet = crowdSheet(rng, art, biome.id === 'nightCity' || biome.id === 'foundry');
  textureBytes += sheet.bytes;
  const flagTex = flagAtlas(rng, art);
  textureBytes += 512 * 512 * 4 * 1.33;
  const crowdMat = cardMaterial(sheet.tex, 0, anim, sheet.cells, sheet.poses);
  const flagMat = cardMaterial(flagTex, 1, anim);
  // Card = one figure, 1.9 m tall (photo sheet: 1024/8 × 478 → 0.51 m wide; painted: 0.62).
  const card = new THREE.PlaneGeometry(1.9 * sheet.aspect, 1.9).translate(0, 0.95, 0);
  const cardUV = card.getAttribute('uv') as THREE.BufferAttribute;
  const cardCol = new Float32Array(cardUV.count * 3);
  for (let i = 0; i < cardUV.count; i++) {
    // Slight AO at the feet.
    const v = cardUV.getY(i);
    const s = 0.75 + 0.25 * Math.min(1, v * 3);
    cardCol[i * 3] = cardCol[i * 3 + 1] = cardCol[i * 3 + 2] = s;
  }
  card.setAttribute('color', new THREE.BufferAttribute(cardCol, 3));
  const crowd = new PropBatch('crowd', card, crowdMat, false);
  const flagGeo = new THREE.PlaneGeometry(1.3, 0.85, 8, 3).translate(0.65, -0.425, 0);
  {
    const n = flagGeo.getAttribute('position').count;
    const fc = new Float32Array(n * 3).fill(1);
    flagGeo.setAttribute('color', new THREE.BufferAttribute(fc, 3));
  }
  const flags = new PropBatch('flag', flagGeo, flagMat, false);
  const poles = new PropBatch('flagpole', new THREE.CylinderGeometry(0.03, 0.04, 1, 7).translate(0, 0.5, 0), steel, false);
  const rails = new PropBatch('barrier', new THREE.BoxGeometry(1, 0.05, 0.05).translate(0, 1.0, 0), steel, false);
  const railPosts = new PropBatch('barrierpost', new THREE.BoxGeometry(0.05, 1.05, 0.05).translate(0, 0.52, 0), steel, false);
  const stage = new PropBatch('stage', bakeAO(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 1, 0.35), fogify(lib.get('rustSteel')));
  const strip = sponsorStrip(rng, art);
  textureBytes += strip.bytes;
  const stripMat = fogify(new THREE.MeshStandardMaterial({ map: strip.tex, roughness: 0.8, side: THREE.DoubleSide }));
  const strips: THREE.BufferGeometry[] = [];

  const yawToCam = 0.25; // the camera sits at +z, yawed ~15–20°: face the cards toward it
  /** Crowd zone: `n` people in two rows behind a sponsor barrier, flags at the ends. */
  const crowdZone = (xa: number, xb: number, n: number, withFlags: boolean): void => {
    const zFront = -4.7;
    const baseY = (x: number, z: number): number => (interior ? profileY(profile, x) - 0.35 : gyAt(x, z));
    if (interior) {
      // Grandstand: a steel stage from the hall floor to just under deck height.
      const cx = (xa + xb) / 2;
      const h = baseY(cx, zFront) - floorY;
      if (h > 0.2) stage.add(cx, floorY, -5.6, 0, xb - xa + 1, null, 0, h, 3.0);
    }
    for (let i = 0; i < n; i++) {
      const row = i % 2;
      const x = xa + ((i + 0.5) / n) * (xb - xa) + rng.range(-0.25, 0.25);
      const z = zFront - row * 0.9 - rng.range(0, 0.3);
      const sc = rng.range(0.92, 1.08);
      const fig = rng.int(1, sheet.cells / sheet.poses);
      // z-scale carries the atlas cell (1..8); the plane has no depth so it costs nothing.
      crowd.add(x, baseY(x, z) + row * 0.25, z, yawToCam + rng.range(-0.15, 0.15), sc, null, 0, sc, fig);
    }
    // Barrier with sponsor boards along the front row.
    const len = xb - xa;
    rails.add((xa + xb) / 2, baseY((xa + xb) / 2, -4.1), -4.1, 0, len, null, 0, 1, 1);
    for (let x = xa; x <= xb + 0.01; x += 2) railPosts.add(x, baseY(x, -4.1), -4.1);
    const strip = new THREE.PlaneGeometry(len, 0.8, Math.max(2, Math.round(len / 2)), 1);
    const p = strip.getAttribute('position') as THREE.BufferAttribute;
    const u = strip.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = (xa + xb) / 2 + p.getX(i);
      p.setXYZ(i, x, baseY(x, -4.1) + 0.55 + p.getY(i), -4.12);
      u.setX(i, (u.getX(i) * len) / 8);
    }
    strip.computeVertexNormals();
    strips.push(strip);
    if (withFlags) {
      for (const x of [xa - 0.8, xa + len * 0.33, xa + len * 0.66, xb + 0.8]) {
        const y = baseY(x, -6.2);
        poles.add(x, y, -6.2, 0, 1, null, 0, 4.2, 1);
        flags.add(x + 0.03, y + 4.15, -6.2, yawToCam, 1, null, 0, 1, rng.int(1, 4));
      }
    }
  };

  // --- Start gate + crowd ----------------------------------------------------
  {
    const sx = track.def.start.pos.x;
    const sy = profileY(profile, sx);
    const gate = new THREE.Group();
    gate.position.set(sx - 1.0, sy, 0);
    const post = new THREE.CylinderGeometry(0.1, 0.12, 4.6, 12);
    for (const z of [-2.3, 2.3]) {
      const p = new THREE.Mesh(post, steel);
      p.position.set(0, 2.3, z);
      p.castShadow = true;
      gate.add(p);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 5.0), steel);
    beam.position.set(0, 4.65, 0);
    beam.castShadow = true;
    gate.add(beam);
    const bt = bannerTexture('START', '#1e5fe6', '#ffffff');
    textureBytes += 1024 * 256 * 4;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.1), fogify(new THREE.MeshStandardMaterial({ map: bt, roughness: 0.75, side: THREE.DoubleSide })));
    banner.rotation.y = Math.PI / 2;
    banner.position.set(0, 4.0, 0);
    banner.castShadow = true;
    gate.add(banner);
    // Marshal lights on the beam.
    const lightMat = fogify(new THREE.MeshStandardMaterial({ color: 0x202020, emissive: 0xff3020, emissiveIntensity: 3, roughness: 0.3 }));
    for (const z of [-0.5, 0, 0.5]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), lightMat);
      l.position.set(0.1, 4.85, z);
      gate.add(l);
    }
    group.add(gate);
    drawCalls += 7;
    triangles += 1200;
    crowdZone(sx - 9, sx + 7, 30, true);
  }

  // --- Checkpoints -------------------------------------------------------------
  const postGeo = new THREE.CylinderGeometry(0.06, 0.07, 3.4, 10);
  const beamGeo = new THREE.BoxGeometry(0.1, 0.12, 4.4);
  const lampGeo = new THREE.SphereGeometry(0.11, 12, 8);
  const plaqueGeo = new THREE.BoxGeometry(0.9, 0.45, 0.04);
  const chainGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.6, 5);
  track.def.checkpoints.forEach((cp, i) => {
    const gy = cp.spawn.pos.y;
    const x = cp.x;
    const g = new THREE.Group();
    g.position.set(x, gy, 0);
    for (const z of [-2.0, 2.0]) {
      const post = new THREE.Mesh(postGeo, steel);
      post.position.set(0, 1.7, z);
      post.castShadow = true;
      g.add(post);
    }
    const beam = new THREE.Mesh(beamGeo, steel);
    beam.position.set(0, 3.4, 0);
    beam.castShadow = true;
    g.add(beam);
    const lampMat = fogify(new THREE.MeshStandardMaterial({ color: 0x220a0a, emissive: 0x7a1010, emissiveIntensity: 1.5, roughness: 0.3 }));
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(0, 3.55, 2.0);
    g.add(lamp);
    lamps.push(lampMat);
    // Numbered plaque hanging toward the camera; emissive map lights the number green on pass.
    const pt = plaqueTexture(i + 1);
    textureBytes += 256 * 128 * 4 * 2;
    const plaqueMat = fogify(new THREE.MeshStandardMaterial({ map: pt.map, emissiveMap: pt.emissive, emissive: 0x000000, emissiveIntensity: 2.5, roughness: 0.55 }));
    const plaque = new THREE.Mesh(plaqueGeo, [lib.get('plaqueInk'), lib.get('plaqueInk'), lib.get('plaqueInk'), lib.get('plaqueInk'), plaqueMat, plaqueMat]);
    plaque.position.set(0, 2.55, 1.6);
    plaque.rotation.y = 0.25;
    plaque.castShadow = true;
    g.add(plaque);
    plaques.push(plaqueMat);
    for (const dz of [-0.3, 0.3]) {
      const chain = new THREE.Mesh(chainGeo, lib.get('chrome'));
      chain.position.set(0, 3.08, 1.6 + dz);
      g.add(chain);
    }
    group.add(g);
    jets.push([
      { x: x - 0.6, y: gy, z: -1.6 },
      { x: x + 0.6, y: gy, z: -1.6 },
      { x: x - 0.6, y: gy, z: 1.6 },
      { x: x + 0.6, y: gy, z: 1.6 },
    ]);
    drawCalls += 8;
    triangles += 900;
    // A handful of spectators and two flags just past the gate.
    crowdZone(x + 1.5, x + 6.5, 7, false);
    const fy = interior ? profileY(profile, x + 7) - 0.35 : gyAt(x + 7, -6.2);
    poles.add(x + 7, fy, -6.2, 0, 1, null, 0, 4.0, 1);
    flags.add(x + 7.03, fy + 3.95, -6.2, yawToCam, 1, null, 0, 1, rng.int(1, 4));
  });

  // --- Finish gate + crowd -----------------------------------------------------
  const fx = track.def.finishX;
  const fy = profileY(profile, fx);
  const fin = new THREE.Group();
  fin.position.set(fx, fy, 0);
  const bigPost = new THREE.CylinderGeometry(0.12, 0.14, 4.8, 12);
  for (const z of [-2.3, 2.3]) {
    const p = new THREE.Mesh(bigPost, steel);
    p.position.set(0, 2.4, z);
    p.castShadow = true;
    fin.add(p);
  }
  const arch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 5.0), steel);
  arch.position.set(0, 4.85, 0);
  arch.castShadow = true;
  fin.add(arch);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), fogify(new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.7, side: THREE.DoubleSide })));
  banner.rotation.y = Math.PI / 2;
  banner.position.set(0, 4.15, 0);
  banner.castShadow = true;
  fin.add(banner);
  textureBytes += 512 * 128 * 4;
  const finishLamp = fogify(new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffffff, emissiveIntensity: 2.0, roughness: 0.3 }));
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), finishLamp);
  fl.position.set(0, 5.1, 0);
  fin.add(fl);
  // Confetti cannons on both posts.
  for (const z of [-2.3, 2.3]) {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.5, 10), lib.get('barrelWhite'));
    can.position.set(-0.2, 1.1, z);
    can.rotation.z = 0.35;
    fin.add(can);
  }
  group.add(fin);
  drawCalls += 7;
  triangles += 900;
  crowdZone(fx - 7, fx + 9, 34, true);

  // --- Round 15: the spectator bridge (`arch` decor, style `crowd`; tracks.md §7.3 item 2) on the
  // playgrounds — a steel deck `height` m over the line from behind the crowd zone (z −7) to the
  // camera-side kerb (z +3.4) on two piers (the near one slim — it crosses the bike for ~0.15 s
  // at speed, the bridge read), a two-row crowd on it facing the camera, a barrier rail and the
  // sponsor strip hung on the front face, flags at both ends. Everything sits in the existing
  // gate batches (crowd / rails / posts / stage / flags / banners): no new draw calls.
  {
    const plan = planSetPieces(track, foregroundKeepOut(track));
    for (const a of plan.playground ? plan.arches.filter((a) => a.style === 'crowd') : []) {
      const w = Math.max(8, a.span + 2);
      const by = profileY(profile, a.x) + a.height; // deck underside
      const zBack = -7;
      const zFront = a.depth / 2 + 0.4;
      const footY = (z: number): number => (interior ? floorY : gyAt(a.x, z));
      stage.add(a.x - w / 2, by, zBack, 0, w, null, 0, 0.5, zFront - zBack);
      stage.add(a.x - w / 2 - 0.35, footY(zBack + 0.35), zBack, 0, 0.7, null, 0, by - footY(zBack + 0.35), 0.7);
      stage.add(a.x + w / 2 - 0.35, footY(zBack + 0.35), zBack, 0, 0.7, null, 0, by - footY(zBack + 0.35), 0.7);
      stage.add(a.x - w / 2 - 0.2, footY(zFront - 0.4), zFront - 0.4, 0, 0.4, null, 0, by - footY(zFront - 0.4), 0.4);
      stage.add(a.x + w / 2 - 0.2, footY(zFront - 0.4), zFront - 0.4, 0, 0.4, null, 0, by - footY(zFront - 0.4), 0.4);
      const top = by + 0.5;
      const n = Math.round(w * 2.2);
      for (let i = 0; i < n; i++) {
        const row = i % 2;
        const x = a.x - w / 2 + 0.6 + ((i + 0.5) / n) * (w - 1.2) + rng.range(-0.2, 0.2);
        const z = zFront - 1.3 - row * 0.9 - rng.range(0, 0.3);
        const sc = rng.range(0.92, 1.08);
        crowd.add(x, top + row * 0.02, z, yawToCam + rng.range(-0.15, 0.15), sc, null, 0, sc, rng.int(1, sheet.cells / sheet.poses));
      }
      rails.add(a.x, top, zFront - 0.5, 0, w, null, 0, 1, 1);
      for (let x = a.x - w / 2; x <= a.x + w / 2 + 0.01; x += 2) railPosts.add(x, top, zFront - 0.5);
      const strip = new THREE.PlaneGeometry(w, 0.8, Math.max(2, Math.round(w / 2)), 1);
      strip.translate(a.x, by + 0.1, zFront + 0.02); // hung on the deck face, under the rail: the crowd stays clear
      const u = strip.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < u.count; i++) u.setX(i, (u.getX(i) * w) / 8);
      strips.push(strip);
      for (const x of [a.x - w / 2 + 0.3, a.x + w / 2 - 0.3]) {
        poles.add(x, top, zFront - 0.8, 0, 1, null, 0, 3.2, 1);
        flags.add(x + 0.03, top + 3.15, zFront - 0.8, yawToCam, 1, null, 0, 1, rng.int(1, 4));
      }
    }
  }

  // --- Round 11 nightCity dressing (builder "city"): the start and the finish as a street event ---
  // A lighting truss over each gate with four par cans (magenta / cyan, bulbs bloom, additive beams
  // down onto the deck) and an LED wall behind the crowd; the police cars, jersey barriers and
  // cones round the gates are in the biome kit (`kit.flicker` runs the lightbars).
  if (biome.id === 'nightCity') {
    const sx = track.def.start.pos.x;
    const led = bannerTexture('TRIALS NIGHT', '#0a1020', '#7fd0ff');
    textureBytes += 1024 * 256 * 4 * 1.33;
    const ledMat = fogify(new THREE.MeshStandardMaterial({ map: led, emissiveMap: led, emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 0.6 }));
    const chk = checkerTexture();
    textureBytes += 512 * 128 * 4;
    const chkMat = fogify(new THREE.MeshStandardMaterial({ map: chk, emissiveMap: chk, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.6 }));
    const rig = new PropBatch('stagetruss', trussGeometry(12), steel, false);
    const canMat = fogify(new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.6, vertexColors: true }));
    const cans = new PropBatch('parcan', new THREE.CylinderGeometry(0.16, 0.2, 0.36, 10).translate(0, -0.2, 0), canMat, false);
    const bulb = (hex: number): THREE.MeshStandardMaterial => fogify(new THREE.MeshStandardMaterial({ color: 0x101010, emissive: hex, emissiveIntensity: 5, roughness: 0.5, vertexColors: true }));
    const bulbsM = new PropBatch('parbulb-m', new THREE.SphereGeometry(0.13, 8, 6).translate(0, -0.38, 0), bulb(0xff40c0), false);
    const bulbsC = new PropBatch('parbulb-c', new THREE.SphereGeometry(0.13, 8, 6).translate(0, -0.38, 0), bulb(0x40e0ff), false);
    const beamMat = (hex: number): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(hex).multiplyScalar(0.05), side: THREE.DoubleSide, fog: false, vertexColors: true });
    const beamsM = new PropBatch('parbeam-m', lightConeGeometry(), beamMat(0xff40c0), false);
    const beamsC = new PropBatch('parbeam-c', lightConeGeometry(), beamMat(0x40e0ff), false);
    for (const [cx, mat] of [[sx, ledMat], [fx, chkMat]] as const) {
      const gy = profileY(profile, cx);
      // Truss across the deck (the 12 m truss along x, turned to span z, scaled to 6 m) on two posts.
      rig.add(cx, gy + 5.6, 0, Math.PI / 2, 0.5, null, 0, 1, 1);
      for (const z of [-3.0, 3.0]) stage.add(cx, gy - 0.05, z, 0, 0.18, null, 0, 5.65, 0.18);
      for (let k = 0; k < 4; k++) {
        const z = -2.25 + k * 1.5;
        cans.add(cx, gy + 5.55, z, 0);
        (k % 2 ? bulbsC : bulbsM).add(cx, gy + 5.55, z, 0);
        (k % 2 ? beamsC : beamsM).add(cx, gy + 5.15, z, 0, 0.3, null, 0, 5.1, 0.3);
      }
      // LED wall behind the crowd, tilted toward the camera.
      const wz = -8.2;
      const wy = gyAt(cx, wz);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), mat);
      screen.position.set(cx, wy + 5.4, wz);
      screen.rotation.x = -0.18;
      group.add(screen);
      drawCalls++;
      triangles += 2;
      for (const dx of [-3.4, 3.4]) stage.add(cx + dx, wy, wz, 0, 0.16, null, 0, 6.3, 0.16);
    }
    for (const b of [rig, cans, bulbsM, bulbsC, beamsM, beamsC]) {
      const im = b.build();
      if (!im) continue;
      group.add(im);
      drawCalls++;
      triangles += triCount(b.geometry) * b.count;
    }
  }

  // --- Build the batches -------------------------------------------------------
  for (const b of [crowd, flags, poles, rails, railPosts, stage]) {
    const im = b.build();
    if (!im) continue;
    group.add(im);
    drawCalls++;
    triangles += triCount(b.geometry) * b.count;
  }
  if (strips.length) {
    const merged = strips.length === 1 ? strips[0]! : (mergeGeometries(strips, false) ?? strips[0]!);
    const m = new THREE.Mesh(merged, stripMat);
    m.name = 'gates:banners';
    group.add(m);
    drawCalls++;
    triangles += triCount(merged);
  }
  return { group, lamps, plaques, finishLamp, jets, anim, drawCalls, triangles, textureBytes };
}
