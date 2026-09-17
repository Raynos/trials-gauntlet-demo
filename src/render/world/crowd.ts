/**
 * Painted spectator crowd (ask 62). The reviewer read the art pack's keyed photo row — 8 people, one
 * pose, cloned along every gate — as pasted cut-outs. This is the game's own crowd: 16 painted
 * silhouette figures, each with an idle pose (5 kinds: stand, lean, on the rail, phone up, arms
 * crossed) and a cheer pose (5 kinds: both arms up, one fist, arms wide, flag, clap), per-figure
 * skin / shirt / trousers / hair / headwear, a night cast for nightCity / foundry (jackets, beanies,
 * lit phone screens), painted with a light side, a shadow side and grounded feet. One atlas,
 * `CROWD_CELLS` columns × 2 rows (bottom row idle, top row cheer, the pose switch is the shader's);
 * the gate kit still draws the crowd as one instanced card batch, so the draw count is unchanged.
 *
 * `castCrowd` is pure (testable in node); `paintCrowd` needs a 2D canvas.
 */
import * as THREE from 'three';
import type { Rng } from '../../core/rng';
import { canvas, tex } from './canvasTex';

export const CROWD_CELLS = 16;
export const CROWD_CELL_W = 80;
export const CROWD_CELL_H = 256;

export type IdlePose = 'stand' | 'lean' | 'rail' | 'phone' | 'crossed';
export type CheerPose = 'armsUp' | 'fist' | 'wide' | 'flag' | 'clap';
export const IDLE_POSES: readonly IdlePose[] = ['stand', 'lean', 'rail', 'phone', 'crossed'];
export const CHEER_POSES: readonly CheerPose[] = ['armsUp', 'fist', 'wide', 'flag', 'clap'];

export interface CrowdFigure {
  idle: IdlePose;
  cheer: CheerPose;
  skin: string;
  shirt: string;
  /** A second shirt colour for a stripe / number, or null. */
  trim: string | null;
  pants: string;
  hair: string;
  head: 'none' | 'cap' | 'beanie' | 'hood';
  /** Long hair to the shoulders (no headwear). */
  longHair: boolean;
  /** The trim is a shirt number instead of a stripe. */
  number: number | null;
  glasses: boolean;
  /** Body width / height multipliers. */
  w: number;
  h: number;
  /** The figure's flag colour when its cheer pose is `flag`. */
  flag: string;
}

const SKINS = ['#f0c9a8', '#e8b990', '#c98d63', '#a56b45', '#8d5a3b', '#5c3a26'];
// Day shirts: the team colours pulled toward the hall's muted key (a crowd sits in the scene; a
// sticker sheet floats over it) with denim / white / black between them.
const SHIRTS_DAY = ['#3a5f9e', '#c9a53a', '#a8443a', '#3d7a5a', '#c8703a', '#d9d6cc', '#5c4a8a', '#3a8a9a', '#262b36', '#b04a6a', '#6b7a3a', '#e8e4da'];
const SHIRTS_NIGHT = ['#1e2a48', '#2b2b30', '#5a2020', '#1f3a30', '#3a3020', '#4a4a52', '#2a1e3c', '#233846', '#161a22', '#6b2a3c', '#2f3a22', '#c8c4bc'];
const PANTS_DAY = ['#22252c', '#2b3a5a', '#4a4640', '#1a1a1c', '#7a6a50', '#3a4a6a'];
const PANTS_NIGHT = ['#15171c', '#1c2436', '#2a2824', '#101012', '#3a3230', '#20283a'];
const HAIR = ['#2a1a10', '#4a3020', '#c8a060', '#101010', '#7a5a3a', '#b0b0b0'];
const FLAGS = ['#2a5cc8', '#e0b83a', '#c8443a', '#3a9a68', '#f2f0ea'];

/**
 * The cast: 16 figures, every idle and cheer pose used at least three times, no two figures with the
 * same shirt colour (a clone is a colour before it is a pose), deterministic per rng.
 */
export function castCrowd(rng: Rng, night: boolean): CrowdFigure[] {
  const shirts = (night ? SHIRTS_NIGHT : SHIRTS_DAY).slice();
  const pants = night ? PANTS_NIGHT : PANTS_DAY;
  // Shuffle the shirt palette once so the 16 figures take 12 distinct shirts before any repeats.
  for (let i = shirts.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [shirts[i], shirts[j]] = [shirts[j]!, shirts[i]!];
  }
  const out: CrowdFigure[] = [];
  for (let i = 0; i < CROWD_CELLS; i++) {
    // Poses cycle through the lists with a stride (2 and 3 are coprime to 5) so atlas neighbours
    // differ and every pose gets 3 or 4 of the 16 figures; the rng picks everything else.
    const idle = IDLE_POSES[(i * 2) % IDLE_POSES.length]!;
    const cheer = CHEER_POSES[(i * 3 + 1) % CHEER_POSES.length]!;
    const shirt = shirts[i % shirts.length]!;
    const headRoll = rng.next();
    const head: CrowdFigure['head'] = night ? (headRoll < 0.4 ? 'beanie' : headRoll < 0.6 ? 'hood' : headRoll < 0.75 ? 'cap' : 'none') : headRoll < 0.35 ? 'cap' : headRoll < 0.45 ? 'beanie' : 'none';
    out.push({
      idle,
      cheer,
      skin: SKINS[rng.int(0, SKINS.length - 1)]!,
      shirt,
      trim: rng.next() < 0.35 ? shirts[(i + 5) % shirts.length]! : null,
      pants: pants[rng.int(0, pants.length - 1)]!,
      hair: HAIR[rng.int(0, HAIR.length - 1)]!,
      head,
      longHair: head === 'none' && rng.next() < 0.45,
      number: rng.next() < 0.3 ? rng.int(1, 9) : null,
      glasses: !night && rng.next() < 0.3,
      w: rng.range(0.86, 1.16),
      h: rng.range(0.9, 1.06),
      flag: FLAGS[rng.int(0, FLAGS.length - 1)]!,
    });
  }
  return out;
}

/** Per-instance tint: a whole-figure exposure / warmth wobble (0.72–0.95) that breaks up a repeated cell. */
export function crowdTint(rng: Rng, night: boolean): THREE.Color {
  const k = rng.range(0.72, 0.95);
  const warm = rng.range(-0.04, 0.04);
  return new THREE.Color(k * (1 + warm), k, k * (1 - warm) * (night ? 1.02 : 1));
}

type Ctx = CanvasRenderingContext2D;

/** Arm as shoulder → elbow → hand, round joints; `s` = ±1 side; offsets in px from the shoulder. */
function arm(g: Ctx, sx: number, sy: number, s: number, e: [number, number], h: [number, number], width: number, sleeve: string, skin: string): [number, number] {
  const ex = sx + s * e[0];
  const ey = sy + e[1];
  const hx = sx + s * h[0];
  const hy = sy + h[1];
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = sleeve;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(sx, sy);
  g.lineTo(ex, ey);
  g.lineTo(hx, hy);
  g.stroke();
  // Forearm skin (short sleeves): the lower third of the forearm.
  g.strokeStyle = skin;
  g.lineWidth = width * 0.85;
  g.beginPath();
  g.moveTo(ex + (hx - ex) * 0.55, ey + (hy - ey) * 0.55);
  g.lineTo(hx, hy);
  g.stroke();
  g.fillStyle = skin;
  g.beginPath();
  g.arc(hx, hy, width * 0.55, 0, Math.PI * 2);
  g.fill();
  return [hx, hy];
}

/** Arm targets per pose, from the shoulder, for side `s` (mirrored for the other arm). `a` = the acting arm, `b` = the other. */
function armTargets(pose: IdlePose | CheerPose, which: 'a' | 'b'): { e: [number, number]; h: [number, number] } {
  const stand = { e: [6, 34] as [number, number], h: [10, 64] as [number, number] };
  switch (pose) {
    case 'stand':
      return stand;
    case 'lean':
      return which === 'a' ? { e: [10, 30], h: [2, 52] } : { e: [8, 34], h: [12, 66] };
    case 'rail':
      return { e: [9, 30], h: [5, 58] };
    case 'phone':
      return which === 'a' ? { e: [15, 26], h: [7, -6] } : stand;
    case 'crossed':
      return { e: [13, 30], h: [-9, 36] };
    case 'armsUp':
      return { e: [17, -22], h: [21, -54] };
    case 'fist':
      return which === 'a' ? { e: [14, -18], h: [10, -52] } : stand;
    case 'wide':
      return { e: [22, -6], h: [36, -22] };
    case 'flag':
      return which === 'a' ? { e: [16, -20], h: [18, -52] } : stand;
    case 'clap':
      return { e: [19, 18], h: [5, 24] };
  }
}

/** One figure into its cell (origin = cell top-left). `pose` picks the arms and the stance. */
function paintFigure(g: Ctx, f: CrowdFigure, pose: IdlePose | CheerPose, night: boolean, x0: number, y0: number): void {
  const cx = x0 + CROWD_CELL_W / 2;
  const base = y0 + CROWD_CELL_H - 6;
  const W = f.w;
  const H = f.h;
  const legH = 90 * H;
  const torsoH = 74 * H;
  const shoulderW = 19 * W;
  const headR = 13.5;
  const lean = pose === 'lean' ? 5 : 0; // hips shifted to one side
  const forward = pose === 'rail' ? 3 : 0; // shoulders forward = a hair lower on the card
  const hipY = base - legH;
  const shoulderY = hipY - torsoH + forward;
  const armW = 9.5 * W;
  const [sleeve, skin] = [f.shirt, f.skin];
  // Back arm for the phone / fist / flag poses (the idle arm), behind the torso.
  if (pose === 'phone' || pose === 'fist' || pose === 'flag') arm(g, cx - shoulderW + lean, shoulderY + 6, -1, armTargets(pose, 'b').e, armTargets(pose, 'b').h, armW, sleeve, skin);
  // Legs: slightly apart, the lean pose puts the weight on one.
  g.fillStyle = f.pants;
  g.beginPath();
  g.roundRect(cx - 14 * W + lean * 1.4, hipY, 12 * W, legH, 4);
  g.roundRect(cx + 2 * W + lean * 0.4, hipY, 12 * W, legH, 4);
  g.fill();
  // Shoes.
  g.fillStyle = night ? '#0c0c0e' : '#151517';
  g.beginPath();
  g.roundRect(cx - 16 * W + lean * 1.4, base - 7, 15 * W, 7, 2);
  g.roundRect(cx + 1 * W + lean * 0.4, base - 7, 15 * W, 7, 2);
  g.fill();
  // Torso: shoulders wider than the hips, a jacket for the night cast (hood / collar).
  g.fillStyle = sleeve;
  g.beginPath();
  g.moveTo(cx - shoulderW + lean, shoulderY);
  g.lineTo(cx + shoulderW + lean, shoulderY);
  g.lineTo(cx + 15 * W, hipY + 6);
  g.lineTo(cx - 15 * W, hipY + 6);
  g.closePath();
  g.fill();
  // Shoulder slope: a rounded cap on the torso top.
  g.beginPath();
  g.ellipse(cx + lean, shoulderY + 2, shoulderW, 7, 0, Math.PI, 0);
  g.fill();
  if (f.trim && f.number !== null) {
    g.fillStyle = f.trim;
    g.font = `bold ${Math.round(30 * W)}px Impact, "Arial Black", Helvetica, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(f.number), cx + lean * 0.5, shoulderY + torsoH * 0.45);
  } else if (f.trim) {
    g.fillStyle = f.trim;
    g.fillRect(cx - 15 * W + lean * 0.5, shoulderY + torsoH * 0.42, 30 * W, 9);
  }
  // Arms (front): the `a` arm is on the camera-right side; `b` mirrors unless it was drawn behind.
  const hands: [number, number][] = [];
  hands.push(arm(g, cx + shoulderW + lean, shoulderY + 6, 1, armTargets(pose, 'a').e, armTargets(pose, 'a').h, armW, sleeve, skin));
  if (!(pose === 'phone' || pose === 'fist' || pose === 'flag')) hands.push(arm(g, cx - shoulderW + lean, shoulderY + 6, -1, armTargets(pose, 'b').e, armTargets(pose, 'b').h, armW, sleeve, skin));
  // Neck + head (long hair goes behind the neck first).
  const hy = shoulderY - headR - 4;
  if (f.longHair) {
    g.fillStyle = f.hair;
    g.beginPath();
    g.roundRect(cx + lean - headR - 1, hy - 4, headR * 2 + 2, headR + 26, 6);
    g.fill();
  }
  g.fillStyle = skin;
  g.fillRect(cx - 4 + lean, shoulderY - 8, 8, 10);
  g.beginPath();
  g.arc(cx + lean, hy, headR, 0, Math.PI * 2);
  g.fill();
  // Hair / headwear.
  if (f.head === 'cap') {
    g.fillStyle = f.trim ?? f.pants;
    g.beginPath();
    g.arc(cx + lean, hy - 1, headR + 1, Math.PI, 0);
    g.fill();
    g.fillRect(cx + lean - headR - 7, hy - 3, headR * 2 + 7, 4);
  } else if (f.head === 'beanie') {
    g.fillStyle = f.trim ?? f.hair;
    g.beginPath();
    g.arc(cx + lean, hy - 2, headR + 1.5, Math.PI * 0.95, Math.PI * 2.05);
    g.fill();
    g.fillRect(cx + lean - headR - 1, hy - 4, headR * 2 + 2, 5);
  } else if (f.head === 'hood') {
    g.fillStyle = sleeve;
    g.beginPath();
    g.arc(cx + lean, hy - 1, headR + 3, Math.PI * 0.85, Math.PI * 2.15);
    g.fill();
  } else {
    g.fillStyle = f.hair;
    g.beginPath();
    g.arc(cx + lean, hy - 2, headR, Math.PI * 1.05, Math.PI * 1.95);
    g.fill();
  }
  if (f.glasses) {
    g.fillStyle = '#101012';
    g.fillRect(cx + lean - 9, hy - 3, 18, 4);
  }
  // Accessories per pose.
  if (pose === 'phone') {
    const [hx, hyy] = hands[0]!;
    g.fillStyle = '#1a1a1e';
    g.fillRect(hx - 3, hyy - 9, 7, 12);
    if (night) {
      g.fillStyle = '#cfe6ff';
      g.fillRect(hx - 2, hyy - 8, 5, 10);
      const glow = g.createRadialGradient(hx, hyy - 3, 1, hx, hyy - 3, 16);
      glow.addColorStop(0, 'rgba(180,215,255,0.55)');
      glow.addColorStop(1, 'rgba(180,215,255,0)');
      g.fillStyle = glow;
      g.fillRect(hx - 16, hyy - 19, 32, 32);
    }
  } else if (pose === 'flag') {
    const [hx, hyy] = hands[0]!;
    g.strokeStyle = '#3a3a3c';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(hx, hyy + 6);
    g.lineTo(hx, hyy - 34);
    g.stroke();
    g.fillStyle = f.flag;
    g.beginPath();
    g.moveTo(hx, hyy - 34);
    g.lineTo(hx + 22, hyy - 27);
    g.lineTo(hx, hyy - 18);
    g.closePath();
    g.fill();
  }
}

/** Light from the upper camera-right: shade the left third of every figure, and ground the feet. */
function shadeCell(g: Ctx, x0: number, y0: number, night: boolean): void {
  g.save();
  g.globalCompositeOperation = 'source-atop';
  const side = g.createLinearGradient(x0, 0, x0 + CROWD_CELL_W, 0);
  side.addColorStop(0, night ? 'rgba(10,12,24,0.6)' : 'rgba(30,26,40,0.5)');
  side.addColorStop(0.5, 'rgba(30,26,40,0)');
  side.addColorStop(0.9, 'rgba(255,240,220,0)');
  side.addColorStop(1, night ? 'rgba(255,200,150,0.18)' : 'rgba(255,245,230,0.22)');
  g.fillStyle = side;
  g.fillRect(x0, y0, CROWD_CELL_W, CROWD_CELL_H);
  const feet = g.createLinearGradient(0, y0 + CROWD_CELL_H - 34, 0, y0 + CROWD_CELL_H);
  feet.addColorStop(0, 'rgba(0,0,0,0)');
  feet.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = feet;
  g.fillRect(x0, y0 + CROWD_CELL_H - 34, CROWD_CELL_W, 34);
  if (night) {
    // Floodlit from the front at night: a cool overall grade, the top half a touch brighter.
    const grade = g.createLinearGradient(0, y0, 0, y0 + CROWD_CELL_H);
    grade.addColorStop(0, 'rgba(255,225,190,0.14)');
    grade.addColorStop(1, 'rgba(20,24,48,0.35)');
    g.fillStyle = grade;
    g.fillRect(x0, y0, CROWD_CELL_W, CROWD_CELL_H);
  }
  g.restore();
}

/** The atlas: `CROWD_CELLS` columns; bottom row (v < 0.5) idle poses, top row (v ≥ 0.5) cheer poses. */
export function paintCrowd(figures: CrowdFigure[], night: boolean): THREE.CanvasTexture {
  const W = CROWD_CELLS * CROWD_CELL_W;
  const H = CROWD_CELL_H * 2;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  figures.forEach((f, i) => {
    const x0 = i * CROWD_CELL_W;
    // Canvas row 0 is the texture's top (v = 1) — the cheer row; idle sits under it.
    for (const [row, pose] of [[0, f.cheer], [1, f.idle]] as const) {
      const y0 = row * CROWD_CELL_H;
      g.save();
      g.beginPath();
      g.rect(x0, y0, CROWD_CELL_W, CROWD_CELL_H);
      g.clip();
      paintFigure(g, f, pose, night, x0, y0);
      g.restore();
      g.save();
      g.beginPath();
      g.rect(x0, y0, CROWD_CELL_W, CROWD_CELL_H);
      g.clip();
      shadeCell(g, x0, y0, night);
      g.restore();
    }
  });
  const t = tex(c, true, false);
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

export const CROWD_ATLAS_BYTES = CROWD_CELLS * CROWD_CELL_W * CROWD_CELL_H * 2 * 4 * 1.33;
