/**
 * Rider chain: joint positions as a function of `RiderPose` + bike hard points.
 *
 * Pure geometry, no three.js, no allocation after the first call when `out` is passed. Everything
 * is in AXLE coordinates (origin = axle midpoint at static sag, x forward, y up, z toward the
 * camera = the rider's LEFT), metres and radians. Physics' crash sensors and the ragdoll spawn are
 * meant to adopt the same numbers (physics.md §7.7), so the joint set is exactly the old chain's:
 * hips, chest, shoulders, head, elbows, hands, knees, ankles (+ per-side hip/shoulder/ankle z).
 *
 * The canonical poses are the Blender owner's reference measurements (assets/blender/RIDER_CHAIN.md):
 * stand_attack at lean 0, hang_back at lean -1, forward_attack at lean +1, crouch at crouch 1 — the
 * corners are reproduced to the millimetre; this file owns the CURVES between them, measured from
 * the frame strips in assets/blender/pose-study (see RIDER_CHAIN.md "Curves").
 *
 * The finding that motivated the rewrite: physics reports `crouch` from the rider MASS's drop, and
 * the mass is lowered 0.5 m at full forward lean (tuning `leanCrouchFwd`) and 0.2 m at full back
 * lean (`leanCrouch`) for the COM dynamics — so the render saw crouch = 1.0 at any lean >= +0.6 and
 * 0.67 at lean -1 with no hop anywhere near, and folded the rider onto the tank / into a squat.
 * `hopCrouch()` removes that coupling until physics reports the hop preload alone.
 */
import type { RiderPose } from '../../core/types';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Segment lengths (m), 1.78 m rider at 7.5 heads — RIDER_CHAIN.md "Segment lengths". */
export const SEG = Object.freeze({
  torso: 0.52, // hip joint -> shoulder line
  neck: 0.22, // shoulder line -> helmet centre
  upperArm: 0.32,
  forearm: 0.3, // elbow -> grip centre, fist included
  thigh: 0.46,
  shin: 0.43, // knee -> ankle
  shoulderHalf: 0.21,
  hipHalf: 0.09,
  ankleUp: 0.09, // ankle above the peg (boot on the peg)
  ankleFwd: 0.01,
  chestFrac: 0.72, // chest joint along hips -> shoulders
});

/** Hard points the chain hangs from (defaults = the render's `BIKE` constants). */
export interface ChainOpts {
  /** Left grip centre; the right grip mirrors z. */
  grips: Vec3;
  /** Left peg centre; the right peg mirrors z. Ankle = peg + (ankleFwd, ankleUp). */
  pegs: Vec3;
  /** Seat top centre (x, y), used for the hips-vs-seat tests and the sit pose. */
  seatTop: { x: number; y: number };
  /**
   * Extra crouch 0..1 blended toward `land_absorb` (touchdown compression, render-driven from the
   * landing impulse). Independent of the hop crouch.
   */
  crouchExtra?: number;
  /**
   * True when `pose.crouch` is already the hop preload alone (physics fixed, see `hopCrouch`).
   * Default false: the lean-induced mass drop is removed here.
   */
  crouchIsHopOnly?: boolean;
  /**
   * Physics' torso swing store rests displaced by ~-0.34 rad per unit lean once the lean has
   * settled (pose-study/ours-v1 log: torsoPitch +0.34 at lean -1, -0.34 at +1, with no visible
   * transient): with that bias in, a full lean back would fold the torso 12 deg FORWARD. The bias
   * is removed here (`torsoPitch + bias * lean`); what is left is the frame-pitch term and any real
   * transient. Set 0 when feeding hand-made poses (tests, previews) or once physics reports the
   * transient alone. Default `TORSO_PITCH_LEAN_BIAS`.
   */
  torsoPitchLeanBias?: number;
}

/** Physics' steady torso swing per unit lean (rad), measured (see `ChainOpts.torsoPitchLeanBias`). */
export const TORSO_PITCH_LEAN_BIAS = 0.34;

export const DEFAULT_OPTS: Readonly<ChainOpts> = Object.freeze({
  grips: Object.freeze({ x: 0.27, y: 0.78, z: 0.33 }),
  pegs: Object.freeze({ x: -0.14, y: 0.02, z: 0.2 }),
  seatTop: Object.freeze({ x: -0.3, y: 0.55 }),
});

export interface Chain {
  hips: Vec3;
  chest: Vec3;
  /** Shoulder line centre. */
  shoulders: Vec3;
  /** Helmet centre. */
  head: Vec3;
  /** [L, R]; L = +z (camera side). */
  hipSide: [Vec3, Vec3];
  shoulder: [Vec3, Vec3];
  elbow: [Vec3, Vec3];
  hand: [Vec3, Vec3];
  knee: [Vec3, Vec3];
  ankle: [Vec3, Vec3];
  /** Torso angle above horizontal (rad); hips -> shoulders direction is (cos, sin). */
  torsoAngle: number;
  /** Shoulders -> helmet centre angle above horizontal (rad). */
  headAngle: number;
  /** Interior elbow / knee angles (rad), [L, R]; 180 deg = straight. */
  elbowAngle: [number, number];
  kneeAngle: [number, number];
  /** Shoulder->grip and hip->ankle distance over the limb length, [L, R]; <= 1 by construction. */
  armStretch: [number, number];
  legStretch: [number, number];
  /** The pose after the physics-coupling fix, for debugging. */
  params: { back: number; fwd: number; crouch: number; land: number };
}

// ---------------------------------------------------------------------------
// Physics coupling
// ---------------------------------------------------------------------------

/** tuning.rider.leanCrouchFwd / crouch and leanCrouch / crouch: the mass drop physics folds into `crouch`. */
export const LEAN_CROUCH_FWD = 0.5 / 0.3;
export const LEAN_CROUCH_BACK = 0.2 / 0.3;

/**
 * The hop preload alone, from physics' mass-derived `crouch`: subtract the lean-induced drop and
 * rescale what is left to 0..1 (at lean -0.6, the hop preload's lean, physics saturates at 1.0 with
 * the preload and reports 0.4 without it).
 */
export function hopCrouch(lean: number, crouch: number): number {
  const leanPart = lean > 0 ? lean * LEAN_CROUCH_FWD : -lean * LEAN_CROUCH_BACK;
  if (leanPart >= 0.98) return 0;
  return clamp((crouch - leanPart) / (1 - leanPart), 0, 1);
}

// ---------------------------------------------------------------------------
// Curves (RIDER_CHAIN.md "Curves between the canonical poses")
// ---------------------------------------------------------------------------

/** Body parameters the limbs hang from. */
export interface BodyParams {
  hipX: number;
  hipY: number;
  /** rad above horizontal */
  torso: number;
  head: number;
}

const DEG = Math.PI / 180;

/** Canonical corners (hips x, y; torso, head deg above horizontal). */
export const CANON = Object.freeze({
  stand_attack: { hipX: -0.28, hipY: 0.85, torso: 40, head: 66 },
  hang_back: { hipX: -0.57, hipY: 0.6, torso: 55, head: 75 },
  forward_attack: { hipX: -0.22, hipY: 0.9, torso: 26, head: 42 },
  crouch: { hipX: -0.38, hipY: 0.78, torso: 28, head: 40 },
  land_absorb: { hipX: -0.4, hipY: 0.7, torso: 30, head: 45 },
  extend: { hipX: -0.14, hipY: 0.96, torso: 46, head: 70 },
  sit_cruise: { hipX: -0.3, hipY: 0.62, torso: 60, head: 80 },
});

/**
 * Lean-back progress: the hips go back a little faster than linear early (clip 03 f2-f4: the arms
 * lock straight before the hips have finished travelling), no overshoot at the end.
 */
export function backEase(b: number): number {
  return 1 - Math.pow(1 - b, 1.3);
}

/**
 * Body parameters from the pose inputs. `back`/`fwd` in 0..1, `crouch` = hop preload 0..1,
 * `land` = touchdown absorb 0..1, `torsoPitch` = physics' torso swing store (rad, + = pitched
 * forward relative to the frame).
 */
export function bodyParams(back: number, fwd: number, crouch: number, land: number, torsoPitch: number): BodyParams {
  const S = CANON.stand_attack;
  const H = CANON.hang_back;
  const F = CANON.forward_attack;
  const C = CANON.crouch;
  const L = CANON.land_absorb;
  const sb = backEase(back);
  // Lean back: hips travel back 0.29 m and down 0.25 m, with a 3 cm mid-way dip (the rider drops
  // into the legs before settling back, clip 03 f3); torso opens 40 -> 55 deg, head 66 -> 75.
  // Lean forward: hips creep 6 cm forward and 5 cm up (the rider RISES, never lies down); the
  // torso does the work, 40 -> 26 deg, chest over the bar clamp; head 66 -> 42 but always
  // >= torso + 12 deg (the rider looks ahead, never at the front wheel).
  let hipX = S.hipX + (H.hipX - S.hipX) * sb + (F.hipX - S.hipX) * fwd;
  let hipY = S.hipY + (H.hipY - S.hipY) * sb - 0.03 * Math.sin(Math.PI * back) + (F.hipY - S.hipY) * fwd;
  let torso = S.torso + (H.torso - S.torso) * back + (F.torso - S.torso) * fwd;
  let head = S.head + (H.head - S.head) * back + (F.head - S.head) * fwd;
  // Hop preload: a delta on top of the lean pose (measured against stand_attack), so crouch 1 at
  // lean 0 is exactly `crouch` and at the hop's lean -0.6 the same squat sits further back.
  // Hanging off the back already has the hips low and far back, so the preload's travel shrinks
  // with `back` (hip flexion stays <= 130 deg at lean -1 + crouch 1) while the drop stays.
  hipX += (C.hipX - S.hipX) * crouch * (1 - 0.7 * back);
  hipY += (C.hipY - S.hipY) * crouch * (1 - 0.3 * back);
  torso += (C.torso - S.torso) * crouch * (1 - 0.55 * back);
  head += (C.head - S.head) * crouch;
  // Touchdown absorb: the same idea toward land_absorb.
  hipX += (L.hipX - S.hipX) * land;
  hipY += (L.hipY - S.hipY) * land;
  torso += (L.torso - S.torso) * land;
  head += (L.head - S.head) * land;
  // Physics' torso swing store (angular momentum + frame pitch), 60 % weight: nose-up frame ->
  // the torso stays upright in the world. Clamped so the torso is never below 12 deg.
  torso -= torsoPitch * 0.6 * (180 / Math.PI);
  torso = clamp(torso, 12, 80);
  head = Math.max(head, torso + 12);
  return { hipX, hipY, torso: torso * DEG, head: head * DEG };
}

// ---------------------------------------------------------------------------
// IK
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function set(o: Vec3, x: number, y: number, z: number): Vec3 {
  o.x = x;
  o.y = y;
  o.z = z;
  return o;
}

/**
 * Two-bone IK in 3D (RIDER_CHAIN.md "Bend-direction rules"): joint for A -> B with bone lengths
 * l1, l2 bending toward `pole`. `u = normalize(B - A)`, `x = (l1^2 - l2^2 + d^2) / 2d`,
 * `h = sqrt(l1^2 - x^2)`, `joint = A + u*x + h * normalize(pole - u*(pole.u))`.
 * Reach is clamped to 0.995 (l1 + l2). Returns the interior angle at the joint (rad).
 */
export function ik3(a: Vec3, b: Vec3, l1: number, l2: number, pole: Vec3, out: Vec3): number {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dz = b.z - a.z;
  let d = Math.hypot(dx, dy, dz);
  const max = (l1 + l2) * 0.995;
  const min = Math.abs(l1 - l2) + 0.02;
  if (d < 1e-6) {
    set(out, a.x + l1, a.y, a.z);
    return Math.PI;
  }
  if (d > max || d < min) {
    const k = (d > max ? max : min) / d;
    dx *= k;
    dy *= k;
    dz *= k;
    d = d > max ? max : min;
  }
  const ux = dx / d;
  const uy = dy / d;
  const uz = dz / d;
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const pu = pole.x * ux + pole.y * uy + pole.z * uz;
  let px = pole.x - ux * pu;
  let py = pole.y - uy * pu;
  let pz = pole.z - uz * pu;
  const pl = Math.hypot(px, py, pz) || 1;
  px /= pl;
  py /= pl;
  pz /= pl;
  set(out, a.x + ux * x + px * h, a.y + uy * x + py * h, a.z + uz * x + pz * h);
  // interior angle from the law of cosines on the (clamped) reach
  return Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
}

/** Elbow pole: forward-up-out (one wide S from shoulder to bar). */
export const ELBOW_POLE = Object.freeze({ x: 0.6, y: 0.5, z: 1.0 });
/** Knee pole: forward and slightly in (knees on the tank sides). */
export const KNEE_POLE = Object.freeze({ x: 1, y: 0.2, z: -0.15 });
/** Knees never cross the tank centre line. */
export const KNEE_MIN_Z = 0.08;

const ARM_REACH = (SEG.upperArm + SEG.forearm) * 0.985;
const ARM_NEAR = 0.18;
const LEG_REACH = (SEG.thigh + SEG.shin) * 0.985;

function v3(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}

export function makeChain(): Chain {
  return {
    hips: v3(),
    chest: v3(),
    shoulders: v3(),
    head: v3(),
    hipSide: [v3(), v3()],
    shoulder: [v3(), v3()],
    elbow: [v3(), v3()],
    hand: [v3(), v3()],
    knee: [v3(), v3()],
    ankle: [v3(), v3()],
    torsoAngle: 0,
    headAngle: 0,
    elbowAngle: [0, 0],
    kneeAngle: [0, 0],
    armStretch: [0, 0],
    legStretch: [0, 0],
    params: { back: 0, fwd: 0, crouch: 0, land: 0 },
  };
}

const poleL = v3();
const poleR = v3();

/**
 * The chain for a pose. Always standing on the pegs; hands on the grips in every pose (the whole
 * upper body slides along the shoulder -> grip line when the shoulders are out of reach, and the
 * hips never leave thigh+shin of the ankles).
 */
export function riderChain(pose: RiderPose, opts: ChainOpts = DEFAULT_OPTS, out: Chain = makeChain()): Chain {
  const lean = clamp(pose.lean, -1, 1);
  const back = Math.max(0, -lean);
  const fwd = Math.max(0, lean);
  const crouch = opts.crouchIsHopOnly ? clamp(pose.crouch, 0, 1) : hopCrouch(lean, clamp(pose.crouch, 0, 1));
  const land = clamp(opts.crouchExtra ?? 0, 0, 1);
  out.params.back = back;
  out.params.fwd = fwd;
  out.params.crouch = crouch;
  out.params.land = land;

  const tp = pose.torsoPitch + (opts.torsoPitchLeanBias ?? TORSO_PITCH_LEAN_BIAS) * lean;
  const p = bodyParams(back, fwd, crouch, land, tp);
  const gx = opts.grips.x;
  const gy = opts.grips.y;
  const gz = Math.abs(opts.grips.z);
  const ax = opts.pegs.x + SEG.ankleFwd;
  const ay = opts.pegs.y + SEG.ankleUp;
  const az = Math.abs(opts.pegs.z);

  let hx = p.hipX;
  let hy = p.hipY;
  const tdx = Math.cos(p.torso);
  const tdy = Math.sin(p.torso);
  let sx = hx + tdx * SEG.torso;
  let sy = hy + tdy * SEG.torso;

  // Leg slide: hips never beyond thigh+shin from the ankles (pulled in along hip -> ankle;
  // the shoulders follow at the same torso angle).
  {
    const d = Math.hypot(hx - ax, hy - ay);
    if (d > LEG_REACH) {
      const k = (d - LEG_REACH) / d;
      hx += (ax - hx) * k;
      hy += (ay - hy) * k;
      sx = hx + tdx * SEG.torso;
      sy = hy + tdy * SEG.torso;
    }
  }
  // Reach slide (in XY, the z spread is the same in every pose): the whole upper body slides toward
  // the grip when the shoulders are farther than arm's reach, away when closer than 0.18 m.
  {
    // arm reach measured in 3D: the shoulder joint sits at z = shoulderHalf, the grip at gripZ
    const dzs = gz - SEG.shoulderHalf;
    const reachXY = Math.sqrt(Math.max(0, ARM_REACH * ARM_REACH - dzs * dzs));
    const ddx = gx - sx;
    const ddy = gy - sy;
    const d = Math.hypot(ddx, ddy);
    if (d > reachXY || d < ARM_NEAR) {
      const k = (d - (d > reachXY ? reachXY : ARM_NEAR)) / (d || 1e-6);
      sx += ddx * k;
      sy += ddy * k;
      hx += ddx * k;
      hy += ddy * k;
    }
  }

  set(out.hips, hx, hy, 0);
  set(out.shoulders, sx, sy, 0);
  set(out.chest, hx + (sx - hx) * SEG.chestFrac, hy + (sy - hy) * SEG.chestFrac, 0);
  set(out.head, sx + Math.cos(p.head) * SEG.neck, sy + Math.sin(p.head) * SEG.neck, 0);
  out.torsoAngle = Math.atan2(sy - hy, sx - hx);
  out.headAngle = p.head;

  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const sh = set(out.shoulder[i]!, sx, sy, side * SEG.shoulderHalf);
    const hand = set(out.hand[i]!, gx, gy, side * gz);
    const pe = set(i === 0 ? poleL : poleR, ELBOW_POLE.x, ELBOW_POLE.y, side * ELBOW_POLE.z);
    out.elbowAngle[i] = ik3(sh, hand, SEG.upperArm, SEG.forearm, pe, out.elbow[i]!);
    out.armStretch[i] = Math.hypot(hand.x - sh.x, hand.y - sh.y, hand.z - sh.z) / (SEG.upperArm + SEG.forearm);

    const hip = set(out.hipSide[i]!, hx, hy, side * SEG.hipHalf);
    const ank = set(out.ankle[i]!, ax, ay, side * az);
    // pole z = -sign(side) * 0.15: knees toward the tank centre
    const pk = set(i === 0 ? poleL : poleR, KNEE_POLE.x, KNEE_POLE.y, -side * Math.abs(KNEE_POLE.z));
    out.kneeAngle[i] = ik3(hip, ank, SEG.thigh, SEG.shin, pk, out.knee[i]!);
    const kn = out.knee[i]!;
    if (Math.abs(kn.z) < KNEE_MIN_Z) kn.z = side * KNEE_MIN_Z;
    out.legStretch[i] = Math.hypot(ank.x - hip.x, ank.y - hip.y, ank.z - hip.z) / (SEG.thigh + SEG.shin);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Lag / overshoot (RIDER_CHAIN.md "Lag")
// ---------------------------------------------------------------------------

/**
 * Second-order follower for the pose channels the render feeds `riderChain`: the reference torso
 * arrives 100-150 ms after the bike (clip 03 f3-f5, clip 13 GO) with a small overshoot. Physics'
 * own lean slew + fore-aft brace already delay the reported pose ~100 ms behind the input
 * (pose-study/ours-v1: input at -1 by t = 0.80 s, lean -0.90 there, -1.00 at 1.00 s), so the render
 * adds only ~50 ms (omega 60 rad/s) with zeta 0.7 (~5 % overshoot). Replaces the old 80 ms LEAD.
 */
export class PoseFollower {
  private x: RiderPose = { lean: 0, crouch: 0, torsoPitch: 0, armExtend: 0 };
  private v: RiderPose = { lean: 0, crouch: 0, torsoPitch: 0, armExtend: 0 };
  private primed = false;
  readonly out: RiderPose = { lean: 0, crouch: 0, torsoPitch: 0, armExtend: 0 };

  constructor(
    readonly omega = 60,
    readonly zeta = 0.7,
  ) {}

  /** `snap` on a cut (restart / track load): no lag across a teleport. */
  update(target: RiderPose, dt: number, snap = false): RiderPose {
    const keys: (keyof RiderPose)[] = ['lean', 'crouch', 'torsoPitch', 'armExtend'];
    if (snap || !this.primed || dt <= 0) {
      for (const k of keys) {
        this.x[k] = target[k];
        this.v[k] = 0;
      }
      this.primed = true;
    } else {
      // semi-implicit Euler in <= 4 ms substeps: stable for any render dt
      const n = Math.max(1, Math.ceil(dt / 0.004));
      const h = dt / n;
      const w = this.omega;
      const c = 2 * this.zeta * w;
      for (let i = 0; i < n; i++) {
        for (const k of keys) {
          const a = w * w * (target[k] - this.x[k]) - c * this.v[k];
          this.v[k] += a * h;
          this.x[k] += this.v[k] * h;
        }
      }
    }
    for (const k of keys) this.out[k] = this.x[k];
    // lean and crouch stay in their domains even with the overshoot
    this.out.lean = clamp(this.out.lean, -1, 1);
    this.out.crouch = clamp(this.out.crouch, 0, 1);
    return this.out;
  }
}
