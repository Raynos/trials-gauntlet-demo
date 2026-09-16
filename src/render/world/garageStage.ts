/**
 * Garage stage (render, garage round) — set E "shutter door", lighting variant BE3 "dusk"
 * (assets/design/garage/SPEC.md §E, round2/SPEC.md §2): a bay seen from inside. Directly behind the hero
 * a wide steel roller shutter, half open onto a dusk sky (blue-orange, low over the apron); the closed upper
 * half is the corrugated shutter with a stencil. A warm sodium work lamp on a stand front-left is the KEY
 * (one of the hall's follow spots, parked there by the renderer — `ThreeRenderer.render`), the cool dusk
 * spill through the opening is the fill (the rig's sun, re-aimed by `LightingRig.setStage`). The floor is
 * wet-look dark concrete: roughness .25 under the PMREM sky, and a mirror world under it — the back wall,
 * the shutter, the dusk backdrop, the tube fixtures and the lamp face are duplicated mirrored in y below the
 * floor plane, the hero is mirrored by the renderer (`reflection`), and the floor itself is drawn at 75 %
 * so they show through. No planar reflection pass: one 25 % blend.
 *
 * Budget: ≤ 20 draws (every element is one mesh — merged or instanced), four 512² canvas maps plus the
 * library's concrete set, no light objects of its own — no program in the scene is re-keyed by the stage
 * coming and going. Built once per renderer, positioned at the hero on `setGarageStage(true)`, disposed
 * through the retirement layer.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ArtLibrary } from '../art/library';
import { fogify } from '../lighting/environment';
import type { MaterialLibrary } from '../materials/library';
import { canvas, tex } from './canvasTex';

/** Room extents (m) around the hero at the group origin: x ∈ ±halfW, z ∈ [backZ, frontZ], y ∈ [0, height]. */
export const GARAGE_ROOM = { halfW: 10, backZ: -6, frontZ: 10, height: 6.4 } as const;
/** The shutter opening in the back wall and how far the door is down (its bottom edge above the floor). */
export const GARAGE_SHUTTER = { width: 6.6, height: 4.0, openTo: 2.4, x: 0 } as const;
/**
 * Where the renderer parks the hall's follow spots while the stage is up (room-local): the sodium work lamp
 * front-left is the KEY (BE3), a faint cool spot on the right lifts the far side. Spot intensity is candela
 * (decay 2): 110 cd at 5 m ≈ 4.4 lx on the tank against the dusk sun's 1.3 — the hall's own lamps' order, so the chrome's
 * highlights stay under the bloom's reach (a 400 cd lamp blew the medium tier's bloom mips into blocks).
 */
export const GARAGE_LAMPS = [
  { x: -3.6, y: 3.1, z: 3.2, color: 0xffb060, intensity: 110, angle: 0.62, penumbra: 0.6 },
  { x: 5.2, y: 3.0, z: 3.0, color: 0x9fb4ff, intensity: 40, angle: 0.7, penumbra: 0.8 },
] as const;
/** The floor's blend: what shows through to the mirror world under it. */
export const GARAGE_FLOOR_OPACITY = 0.76;

export interface GarageStage {
  group: THREE.Group;
  /** Draw calls the set adds (one per mesh). */
  draws: number;
  textureBytes: number;
  /** The daylight shafts (additive overdraw): the renderer hides them on `low`. */
  shafts: THREE.Object3D;
  dispose(): void;
}

function floorMap(): THREE.CanvasTexture {
  // One tile = 2 × 2 m: poured concrete with a control-joint grid every metre, grime and a few tyre marks.
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#565552';
  ctx.fillRect(0, 0, 512, 512);
  let s = 7;
  const rnd = (): number => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    const v = 78 + Math.floor(rnd() * 52);
    ctx.fillStyle = `rgba(${v},${v},${v - 4},${0.25 + rnd() * 0.4})`;
    ctx.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  for (let i = 0; i < 14; i++) {
    const g = ctx.createRadialGradient(rnd() * 512, rnd() * 512, 0, 256, 256, 60 + rnd() * 120);
    g.addColorStop(0, `rgba(30,28,26,${0.08 + rnd() * 0.1})`);
    g.addColorStop(1, 'rgba(30,28,26,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
  }
  // Tyre scuffs: two soft dark arcs.
  ctx.strokeStyle = 'rgba(22,22,24,0.22)';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(120, 420, 260, -1.2, -0.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(420, 90, 300, 1.6, 2.3);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(28,28,30,0.85)';
  ctx.lineWidth = 3;
  for (const p of [0, 256, 512]) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 512);
    ctx.moveTo(0, p);
    ctx.lineTo(512, p);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(150,150,146,0.35)';
  ctx.lineWidth = 1;
  for (const p of [2, 258]) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 512);
    ctx.moveTo(0, p);
    ctx.lineTo(512, p);
    ctx.stroke();
  }
  return tex(c, true, true);
}

function wallMap(): THREE.CanvasTexture {
  // One tile = 4 m wide × room height: painted block courses, a darker skirting band with a thin amber rule.
  const [c, ctx] = canvas(512, 512);
  const H = GARAGE_ROOM.height;
  ctx.fillStyle = '#3d4046';
  ctx.fillRect(0, 0, 512, 512);
  let s = 3;
  const rnd = (): number => ((s = (s * 48271) % 2147483647) / 2147483647);
  const course = 512 / (H / 0.2); // 20 cm block rows
  for (let y = 0, row = 0; y < 512; y += course, row++) {
    for (let x = row % 2 ? -64 : 0; x < 512; x += 128) {
      const v = 58 + Math.floor(rnd() * 14);
      ctx.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
      ctx.fillRect(x + 2, y + 2, 124, course - 3);
    }
  }
  const band = (1.2 / H) * 512;
  ctx.fillStyle = 'rgba(24,26,30,0.92)';
  ctx.fillRect(0, 512 - band, 512, band);
  ctx.fillStyle = '#b8801a';
  ctx.fillRect(0, 512 - band - 5, 512, 5);
  for (let i = 0; i < 40; i++) {
    const x = rnd() * 512;
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, 'rgba(20,20,22,0)');
    g.addColorStop(1, `rgba(20,20,22,${0.15 + rnd() * 0.25})`);
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 2 + rnd() * 10, 512);
  }
  return tex(c, true, true);
}

function shutterMap(): THREE.CanvasTexture {
  // The closed upper half of the roller shutter: corrugated slats, an IRONWORKS stencil, grime at the rail.
  const [c, ctx] = canvas(512, 256);
  for (let y = 0; y < 256; y += 16) {
    const g = ctx.createLinearGradient(0, y, 0, y + 16);
    g.addColorStop(0, '#80868f');
    g.addColorStop(0.45, '#5c6169');
    g.addColorStop(1, '#3b3f45');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, 512, 16);
  }
  ctx.save();
  ctx.translate(256, 132);
  ctx.rotate(-0.06);
  ctx.fillStyle = 'rgba(236,232,222,0.62)';
  ctx.font = 'italic 900 78px "Barlow Condensed", Impact, "Arial Narrow", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('IRONWORKS', 0, 0);
  ctx.restore();
  ctx.fillStyle = 'rgba(232,178,28,0.85)';
  ctx.fillRect(392, 168, 92, 40);
  ctx.fillStyle = '#141416';
  ctx.font = '900 22px "Barlow Condensed", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BOLT', 438, 197);
  const grime = ctx.createLinearGradient(0, 200, 0, 256);
  grime.addColorStop(0, 'rgba(20,20,22,0)');
  grime.addColorStop(1, 'rgba(20,20,22,0.55)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, 200, 512, 56);
  return tex(c, true, false);
}

function daylightMap(): THREE.CanvasTexture {
  // Outside the opening at dusk, on an 8 m tall card standing on the floor line (the horizon 1 m up, v = 224/256
  // from the top): deep blue overhead into an orange band at the horizon, a far fence line and container
  // silhouettes against it, a wet concrete apron carrying the sky's colour in the bottom metre.
  const [c, ctx] = canvas(512, 256);
  const H = 224;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#152040');
  sky.addColorStop(0.5, '#33456f');
  sky.addColorStop(0.82, '#8a6a6a');
  sky.addColorStop(0.95, '#e08a3a');
  sky.addColorStop(1, '#ffb15a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, H);
  ctx.fillStyle = '#1a1c24';
  for (let x = 20; x < 512; x += 90) ctx.fillRect(x, H - 42, 60, 42);
  ctx.fillStyle = 'rgba(16,16,20,0.95)';
  ctx.fillRect(0, H - 2, 512, 3);
  for (let x = 0; x < 512; x += 24) ctx.fillRect(x, H - 30, 2, 30);
  // A few sodium yard lights on the fence line.
  for (const x of [70, 250, 430]) {
    const g = ctx.createRadialGradient(x + 1, H - 34, 0, x + 1, H - 34, 16);
    g.addColorStop(0, 'rgba(255,190,110,0.6)');
    g.addColorStop(1, 'rgba(255,190,110,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 16, H - 50, 34, 34);
    ctx.fillStyle = '#ffc070';
    ctx.fillRect(x, H - 35, 3, 3);
  }
  const apron = ctx.createLinearGradient(0, H, 0, 256);
  apron.addColorStop(0, '#7a6660');
  apron.addColorStop(0.5, '#3a3c48');
  apron.addColorStop(1, '#22242c');
  ctx.fillStyle = apron;
  ctx.fillRect(0, H, 512, 256 - H);
  return tex(c, true, false);
}

function shaftMap(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const v = g.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(0.4, 'rgba(0,0,0,0.35)');
  v.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = v;
  g.fillRect(0, 0, 256, 256);
  return tex(c, true, false);
}

function toolBoardMap(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 384);
  ctx.fillStyle = '#8a6d45';
  ctx.fillRect(0, 0, 512, 384);
  ctx.fillStyle = 'rgba(40,28,16,0.55)';
  for (let y = 16; y < 384; y += 24) for (let x = 16; x < 512; x += 24) ctx.fillRect(x - 2, y - 2, 4, 4);
  ctx.strokeStyle = '#1d1f23';
  ctx.fillStyle = '#23262b';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const x = 60 + i * 54;
    ctx.beginPath();
    ctx.moveTo(x, 60);
    ctx.lineTo(x, 190 + i * 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, 52, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, 198 + i * 8, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(360, 40, 14, 170);
  ctx.fillRect(330, 34, 74, 30);
  ctx.fillRect(430, 40, 14, 170);
  ctx.fillStyle = '#5a2f22';
  ctx.fillRect(404, 30, 66, 40);
  ctx.fillStyle = '#c62f2f';
  for (let i = 0; i < 6; i++) ctx.fillRect(60 + i * 70, 260, 12, 44);
  ctx.fillStyle = '#9ea3aa';
  for (let i = 0; i < 6; i++) ctx.fillRect(64 + i * 70, 304, 4, 60);
  return tex(c, true, false);
}

/** Vertex colours on a subdivided floor: the lamp pool under the hero and the daylight patch spilling in from the opening. */
function floorGeometry(): THREE.BufferGeometry {
  const R = GARAGE_ROOM;
  const S = GARAGE_SHUTTER;
  const w = R.halfW * 2;
  const d = R.frontZ - R.backZ;
  const g = new THREE.PlaneGeometry(w, d, 40, 32);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, (R.frontZ + R.backZ) / 2);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot((x + 1.2) / 6.0, (z - 1.2) / 5.0); // the lamp pool sits under the lamp side of the hero
    const pool = 0.32 + 0.42 * Math.max(0, 1 - r * r);
    // Daylight patch: a trapezoid from the opening toward the camera, fading over ~7 m.
    const dz = z - R.backZ;
    const half = S.width / 2 + dz * 0.35;
    const inX = Math.max(0, 1 - Math.max(0, Math.abs(x - S.x) - half + 0.8) / 1.6);
    const day = Math.max(0, 1 - dz / 7.5) * inX;
    // Dusk: the spill from the opening is blue, the pool warm.
    col[i * 3] = pool + day * 0.06;
    col[i * 3 + 1] = pool * 0.97 + day * 0.1;
    col[i * 3 + 2] = pool * 0.9 + day * 0.2;
    uv.setXY(i, (x + R.halfW) / 2, (z - R.backZ) / 2); // 2 m per map tile, on whole metres
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv1', uv);
  return g;
}

/** The enclosing faces — back wall as two piers + a lintel around the opening, three walls, the ceiling — merged into one geometry. */
function shellGeometry(): THREE.BufferGeometry {
  const R = GARAGE_ROOM;
  const S = GARAGE_SHUTTER;
  const w = R.halfW * 2;
  const d = R.frontZ - R.backZ;
  const zc = (R.frontZ + R.backZ) / 2;
  const parts: THREE.BufferGeometry[] = [];
  const panel = (width: number, height: number, rotY: number, x: number, y: number, z: number, shade: number, u0 = 0, v0 = 0): void => {
    const g = new THREE.PlaneGeometry(width, height, 1, 1);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (width / 4), v0 + uv.getY(i) * (height / R.height));
    g.rotateY(rotY);
    g.translate(x, y, z);
    const n = g.getAttribute('position').count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(shade), 3));
    parts.push(g);
  };
  // Back wall (faces +z): left pier, right pier, lintel over the opening.
  const pierW = (w - S.width) / 2;
  panel(pierW, R.height, 0, -R.halfW + pierW / 2, R.height / 2, R.backZ, 1);
  panel(pierW, R.height, 0, R.halfW - pierW / 2, R.height / 2, R.backZ, 1, pierW / 4 + S.width / 4);
  panel(S.width, R.height - S.height, 0, S.x, S.height + (R.height - S.height) / 2, R.backZ, 1, pierW / 4, S.height / R.height);
  // Opening reveals (the wall's thickness), inward faces.
  const reveal = 0.35;
  panel(reveal, S.height, Math.PI / 2, S.x - S.width / 2, S.height / 2, R.backZ - reveal / 2, 0.7);
  panel(reveal, S.height, -Math.PI / 2, S.x + S.width / 2, S.height / 2, R.backZ - reveal / 2, 0.7);
  panel(w, R.height, Math.PI, 0, R.height / 2, R.frontZ, 0.85); // front wall faces −z
  panel(d, R.height, Math.PI / 2, -R.halfW, R.height / 2, zc, 0.8); // left wall faces +x
  panel(d, R.height, -Math.PI / 2, R.halfW, R.height / 2, zc, 0.8); // right wall faces −x
  {
    const g = new THREE.PlaneGeometry(w, d, 1, 1);
    g.rotateX(Math.PI / 2); // faces −y
    g.translate(0, R.height, zc);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 5, uv.getY(i) * 4);
    const n = g.getAttribute('position').count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.22), 3));
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  merged.setAttribute('uv1', merged.getAttribute('uv'));
  return merged;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

function cylinder(r: number, h: number, x: number, y: number, z: number, rz = 0, seg = 14): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

/** The geometry reflected in the floor plane (y → −y) with its winding flipped so the faces still face inward. */
function mirrorY(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.clone();
  g.scale(1, -1, 1);
  const idx = g.getIndex();
  if (idx) {
    const a = idx.array;
    for (let i = 0; i + 2 < a.length; i += 3) {
      const t = a[i + 1]!;
      a[i + 1] = a[i + 2]!;
      a[i + 2] = t;
    }
    idx.needsUpdate = true;
  } else {
    for (const name of ['position', 'normal', 'uv', 'color']) {
      const at = g.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (!at) continue;
      const n = at.itemSize;
      const arr = at.array as Float32Array;
      for (let v = 0; v + 2 < at.count; v += 3) {
        for (let k = 0; k < n; k++) {
          const i1 = (v + 1) * n + k;
          const i2 = (v + 2) * n + k;
          const t = arr[i1]!;
          arr[i1] = arr[i2]!;
          arr[i2] = t;
        }
      }
      at.needsUpdate = true;
    }
  }
  return g;
}

/** `g` plus its mirror image below the floor, as one geometry. */
function withMirror(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const m = mirrorY(g);
  const out = mergeGeometries([g, m], false)!;
  g.dispose();
  m.dispose();
  return out;
}

export function buildGarageStage(lib: MaterialLibrary, art: ArtLibrary | null): GarageStage {
  const R = GARAGE_ROOM;
  const S = GARAGE_SHUTTER;
  const group = new THREE.Group();
  group.name = 'garage';
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  let textureBytes = 0;
  let draws = 0;
  const own = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const mat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    if ((m as unknown as THREE.MeshStandardMaterial).isMeshStandardMaterial) lib.complete(m as unknown as THREE.MeshStandardMaterial);
    return m;
  };
  const map = (t: THREE.CanvasTexture): THREE.CanvasTexture => {
    textures.push(t);
    textureBytes += t.image.width * t.image.height * 4;
    return t;
  };
  const mesh = (name: string, g: THREE.BufferGeometry, m: THREE.Material, cast = false, receive = false): THREE.Mesh => {
    const me = new THREE.Mesh(g, m);
    me.name = `garage:${name}`;
    me.castShadow = cast;
    me.receiveShadow = receive;
    me.frustumCulled = true;
    group.add(me);
    draws++;
    return me;
  };
  const merged = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => {
    const g = mergeGeometries(parts, false)!;
    for (const p of parts) p.dispose();
    return own(g);
  };

  // --- Floor: library concrete set (normal / roughness) under a grid map, vertex-coloured lamp pool + daylight patch.
  {
    const m = lib.derive('concrete');
    m.map = map(floorMap());
    m.color.setHex(0x6c6e76);
    m.vertexColors = true;
    // BE3 wet-look: low roughness under the PMREM sky (kept quiet: the hall's sky is a grey dome), drawn at 76 % over the mirror world beneath it.
    // Roughness .45, not the mockup's .25: at .34 the work lamp's own highlight on the floor (a 160 cd spot's
    // lobe) went past the bloom threshold and the medium tier's mips blew it into blocks across the opening.
    m.roughness = 0.45;
    m.metalness = 0.0;
    m.envMapIntensity = 0.5;
    m.normalScale.set(0.3, 0.3); // the concrete set's normals at a wet roughness glitter — most of them go
    m.transparent = true;
    m.opacity = GARAGE_FLOOR_OPACITY;
    const floor = mesh('floor', own(floorGeometry()), mat(m), false, true);
    floor.renderOrder = 1; // after the mirror world's opaques, before the shafts
  }
  // --- Shell: piers, lintel, reveals, three walls, ceiling — one merged mesh; the walls mirrored under the floor.
  {
    const m = fogify(new THREE.MeshStandardMaterial({ map: map(wallMap()), vertexColors: true, roughness: 0.92, metalness: 0.0 }));
    mesh('shell', own(withMirror(shellGeometry())), mat(m), false, true);
  }
  // --- The roller shutter: closed upper half (slatted), the bottom rail, the rolled drum in its housing, guide tracks.
  const steel: THREE.BufferGeometry[] = [];
  {
    const closedH = S.height - S.openTo;
    const g = new THREE.PlaneGeometry(S.width, closedH);
    g.translate(S.x, S.openTo + closedH / 2, R.backZ - 0.16);
    const m = fogify(new THREE.MeshStandardMaterial({ map: map(shutterMap()), roughness: 0.5, metalness: 0.7, side: THREE.DoubleSide }));
    mesh('shutter', own(withMirror(g)), mat(m), true, false);
    steel.push(box(S.width + 0.1, 0.12, 0.1, S.x, S.openTo - 0.06, R.backZ - 0.16)); // bottom rail
    steel.push(cylinder(0.32, S.width + 0.5, S.x, S.height + 0.36, R.backZ - 0.05, Math.PI / 2, 18)); // roller drum
    steel.push(box(0.16, S.height + 0.7, 0.3, S.x - S.width / 2 - 0.1, (S.height + 0.7) / 2, R.backZ - 0.12)); // tracks
    steel.push(box(0.16, S.height + 0.7, 0.3, S.x + S.width / 2 + 0.1, (S.height + 0.7) / 2, R.backZ - 0.12));
    // Chain hoist by the left track.
    steel.push(cylinder(0.02, 3.2, S.x - S.width / 2 - 0.35, 2.2, R.backZ + 0.25));
    steel.push(box(0.26, 0.4, 0.26, S.x - S.width / 2 - 0.35, 3.9, R.backZ + 0.25));
  }
  // --- Daylight: an unlit apron / fence / sky plate outside the opening (bigger than the opening for any orbit angle).
  {
    // An 8 m card standing on the floor line (its mirror hangs below it — the two never overlap, which is
    // what z-fought as a mosaic when the card ran through the floor plane); the horizon 1 m up.
    const g = new THREE.PlaneGeometry(24, 8);
    g.translate(S.x, 4, R.backZ - 5.5);
    // Unlit through the standard program (black albedo, the dusk map as emissive): the same variant as every
    // other lit material here, no MeshBasicMaterial program — and WebKit's GL drew a MeshBasicMaterial map
    // as a mosaic of other textures' mips in the opening.
    const m = fogify(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: map(daylightMap()), emissiveIntensity: 1.15, roughness: 1, metalness: 0 }));
    mesh('daylight', own(withMirror(g)), mat(m));
  }
  // --- Daylight shafts: two additive quads leaning in from the opening (hidden on `low` by the renderer).
  const shafts = new THREE.Group();
  shafts.name = 'garage:shafts';
  {
    const quads: THREE.BufferGeometry[] = [];
    for (const [x, w] of [[S.x - 1.6, 3.2], [S.x + 1.7, 3.0]] as const) {
      const g = new THREE.PlaneGeometry(w, 7.5);
      g.rotateX(-Math.PI / 2 + 0.42);
      g.translate(x, S.openTo * 0.55 + 0.4, R.backZ + 3.4);
      quads.push(g);
    }
    const m = new THREE.MeshBasicMaterial({ map: map(shaftMap()), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    m.color.setHex(0x8fa8ff).multiplyScalar(0.07); // BE3: the faintest beam of the three variants
    const me = new THREE.Mesh(merged(quads), mat(m));
    me.name = 'garage:shaft';
    me.renderOrder = 5;
    shafts.add(me);
    group.add(shafts);
    draws++;
  }
  // --- Left pier: pegboard + workbench with a vice; a work lamp on a stand front-left.
  {
    const x = -R.halfW + 3.4;
    const g = new THREE.PlaneGeometry(2.6, 1.9);
    g.translate(x, 1.25 + 0.95, R.backZ + 0.04);
    mesh('toolboard', own(g), mat(fogify(new THREE.MeshStandardMaterial({ map: map(toolBoardMap()), roughness: 0.85 }))));
    mesh('bench', own(box(2.8, 0.08, 0.8, x, 0.92, R.backZ + 0.45)), mat(lib.derive('plywood')), true, true);
    for (const dx of [-1.3, 1.3]) for (const dz of [0.1, 0.8]) steel.push(box(0.06, 0.9, 0.06, x + dx, 0.45, R.backZ + dz));
    steel.push(box(2.7, 0.05, 0.7, x, 0.3, R.backZ + 0.45));
    steel.push(box(0.3, 0.24, 0.22, x - 0.8, 1.08, R.backZ + 0.5)); // vice
    steel.push(cylinder(0.025, 0.5, x - 0.8, 1.1, R.backZ + 0.5, Math.PI / 2, 8)); // vice bar
    // Work lamp stand front-left (the renderer parks the warm spot at its head).
    const L = GARAGE_LAMPS[0];
    steel.push(cylinder(0.03, L.y - 0.3, L.x, (L.y - 0.3) / 2, L.z + 0.2, 0, 8));
    steel.push(cylinder(0.32, 0.04, L.x, 0.02, L.z + 0.2, 0, 16));
    steel.push(box(0.4, 0.28, 0.3, L.x, L.y - 0.05, L.z + 0.05, 0.6));
  }
  // --- Right: jerry can, a crate; shelving with crates on the left wall.
  const crates: THREE.BufferGeometry[] = [];
  {
    const sx = -R.halfW + 0.4;
    for (const z of [-2.2, 0.4]) for (const y of [0.4, 1.3, 2.2]) steel.push(box(0.7, 0.04, 2.1, sx, y, z + 1.0));
    for (const z of [-3.2, -1.1, 1.0]) for (const dx of [-0.3, 0.3]) steel.push(box(0.05, 2.6, 0.05, sx + dx, 1.3, z));
    let s = 11;
    const rnd = (): number => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (const z of [-2.2, 0.4]) for (const y of [0.42, 1.32, 2.22]) {
      const n = 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) crates.push(box(0.5 + rnd() * 0.15, 0.36 + rnd() * 0.25, 0.5 + rnd() * 0.2, sx + (rnd() - 0.5) * 0.1, y + 0.2, z + 0.3 + i * 0.66 + rnd() * 0.08, (rnd() - 0.5) * 0.3));
    }
    crates.push(box(0.9, 0.7, 0.7, R.halfW - 1.4, 0.35, -1.6, 0.4)); // crate by the drums
    steel.push(box(0.36, 0.5, 0.16, R.halfW - 2.2, 0.25, -4.2, 0.3)); // jerry can
  }
  mesh('steel', merged(steel), mat(lib.derive('darkSteel')), true, false);
  mesh('crates', merged(crates), mat(lib.derive('pallet')), true, false);
  {
    const drum = own(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 16));
    const im = new THREE.InstancedMesh(drum, mat(lib.derive('barrelBlue')), 3);
    im.name = 'garage:drums';
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    [[R.halfW - 0.9, 0.44, -4.6], [R.halfW - 1.55, 0.44, -4.1], [R.halfW - 1.0, 0.44, -3.75]].forEach(([x, y, z], i) => {
      im.setMatrixAt(i, mtx.compose(new THREE.Vector3(x, y, z), q.setFromEuler(new THREE.Euler(0, i * 1.1, 0)), one));
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    group.add(im);
    draws++;
  }
  {
    const tyre = own(new THREE.TorusGeometry(0.34, 0.13, 10, 28));
    tyre.rotateX(Math.PI / 2);
    const stacks: [number, number][] = [[R.halfW - 1.0, 2.6], [R.halfW - 1.8, 3.1], [-R.halfW + 1.2, 4.6]];
    const heights = [4, 2, 3];
    const im = new THREE.InstancedMesh(tyre, mat(lib.derive('tyre')), heights.reduce((a, b) => a + b, 0));
    im.name = 'garage:tyres';
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    let i = 0;
    stacks.forEach(([x, z], k) => {
      for (let j = 0; j < heights[k]!; j++) im.setMatrixAt(i++, mtx.compose(new THREE.Vector3(x, 0.14 + j * 0.27, z), q.setFromEuler(new THREE.Euler(0, j * 0.7 + k, 0)), one));
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    group.add(im);
    draws++;
  }
  // --- Emissives: two ceiling tube fixtures + the work lamp's face (bloom picks them up on the HDR tiers).
  {
    const L = GARAGE_LAMPS[0];
    const parts: THREE.BufferGeometry[] = [];
    for (const x of [-4.0, 4.0]) parts.push(box(2.4, 0.08, 0.22, x, R.height - 0.12, 1.0));
    const face = new THREE.PlaneGeometry(0.3, 0.2);
    face.rotateY(0.6);
    face.translate(L.x + 0.16, L.y - 0.05, L.z + 0.2);
    parts.push(face);
    const m = fogify(new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffc070, emissiveIntensity: 2.2, roughness: 0.6, side: THREE.DoubleSide }));
    mesh('tubes', own(withMirror(merged(parts))), mat(m));
  }
  // --- Bay marking: a hazard-tape rectangle on the floor around the bike.
  {
    const ring = new THREE.Shape();
    ring.moveTo(-2.6, -1.6);
    ring.lineTo(2.6, -1.6);
    ring.lineTo(2.6, 1.6);
    ring.lineTo(-2.6, 1.6);
    ring.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-2.5, -1.5);
    hole.lineTo(-2.5, 1.5);
    hole.lineTo(2.5, 1.5);
    hole.lineTo(2.5, -1.5);
    hole.closePath();
    ring.holes.push(hole);
    const g = new THREE.ShapeGeometry(ring);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.006, 0);
    mesh('bayline', own(g), mat(fogify(new THREE.MeshStandardMaterial({ color: 0xe8b21c, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))));
  }
  // --- Art pack decals when the pack has them (never awaited: the set reads without them).
  if (art) {
    const decal = (name: string, id: string, w: number, h: number, x: number, y: number, z: number, ry = 0): void => {
      const t = art.texture(id, true, false);
      if (!t) return;
      textureBytes += art.entry(id)?.bytes ?? 0;
      const g = new THREE.PlaneGeometry(w, h);
      if (ry) g.rotateY(ry);
      g.translate(x, y, z);
      mesh(name, own(g), mat(fogify(new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }))));
    };
    decal('banner', 'banner-kestrel-tyres', 3.6, 0.9, S.x, S.height + 1.35, R.backZ + 0.03);
    decal('poster', 'poster-tyres', 1.1, 1.65, R.halfW - 2.2, 2.4, R.backZ + 0.03);
    decal('exit', 'sign-exit', 0.7, 0.7, S.x - S.width / 2 - 1.0, S.height + 0.6, R.backZ + 0.03);
    decal('poster2', 'poster-trials-night', 1.1, 1.65, R.halfW - 0.03, 2.3, 0.4, -Math.PI / 2);
  }
  group.updateMatrixWorld(true);
  return {
    group,
    draws,
    textureBytes,
    shafts,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const t of textures) t.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
