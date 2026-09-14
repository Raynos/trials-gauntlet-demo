/**
 * Rider v2 (physics-v2.md §9): the pose table (lean -> COM offset + body angle in chassis space), the
 * rate-limited target, the bounded servo pair, and the drawn chain (RIDER_CHAIN.md port from v1) whose
 * hips follow the rider BODY, so the crash sensors sit on the simulated rider. Pure functions; the world
 * owns the state.
 */
import { clamp, cos, PI, sin } from '../dmath';
import type { PoseRow, TuningV2 } from './tuning';

// ---------------------------------------------------------------------------
// Pose table
// ---------------------------------------------------------------------------

/** Pose target for a lean: linear between the table rows (§9.1; monotone response). */
export function poseAt(poses: PoseRow[], lean: number, out: { x: number; y: number; psi: number }): void {
  const n = poses.length;
  const l = clamp(lean, poses[0]!.lean, poses[n - 1]!.lean);
  for (let i = 1; i < n; i++) {
    const b = poses[i]!;
    if (l <= b.lean) {
      const a = poses[i - 1]!;
      const t = (l - a.lean) / (b.lean - a.lean);
      out.x = a.x + t * (b.x - a.x);
      out.y = a.y + t * (b.y - a.y);
      out.psi = a.psi + t * (b.psi - a.psi);
      return;
    }
  }
  const last = poses[n - 1]!;
  out.x = last.x;
  out.y = last.y;
  out.psi = last.psi;
}

/** Inverse of the table's x column: the lean whose pose x is `x` (clamped to the table's range). */
export function leanFromX(poses: PoseRow[], x: number): number {
  const n = poses.length;
  if (x <= poses[0]!.x) return poses[0]!.lean;
  for (let i = 1; i < n; i++) {
    const b = poses[i]!;
    if (x <= b.x) {
      const a = poses[i - 1]!;
      const dx = b.x - a.x;
      const t = dx > 1e-9 ? (x - a.x) / dx : 0;
      return a.lean + t * (b.lean - a.lean);
    }
  }
  return poses[n - 1]!.lean;
}

/**
 * Move the target (tx, ty, tpsi) toward the lean's pose with the speed caps (§9.2). Returns the new
 * target through `out`; hysteresis-free.
 */
export function advanceTarget(
  r: TuningV2['rider'],
  dt: number,
  tx: number,
  ty: number,
  tpsi: number,
  lean: number,
  out: { x: number; y: number; psi: number },
): void {
  poseAt(r.poses, lean, out);
  const dx = out.x - tx;
  const dy = out.y - ty;
  const dl = Math.sqrt(dx * dx + dy * dy);
  const stepL = r.targetRateLin * dt;
  if (dl > stepL) {
    out.x = tx + (dx / dl) * stepL;
    out.y = ty + (dy / dl) * stepL;
  }
  const da = clamp(out.psi - tpsi, -r.targetRateAng * dt, r.targetRateAng * dt);
  out.psi = tpsi + da;
}

// ---------------------------------------------------------------------------
// Rider chain: the render's `src/render/rider/pose.ts` riderChain, ported (v1 round 10). AXLE frame
// (origin = axle midpoint at static sag, x forward, y up), metres / radians. The hips come from the
// rider body: the canonical pose at the derived lean plus the body's deviation from its target, so
// servo lag and absorption are drawn and the sensors sit on the simulated rider (§16.5).
// ---------------------------------------------------------------------------

export const CH = {
  torso: 0.52,
  neck: 0.22,
  upperArm: 0.32,
  forearm: 0.3,
  thigh: 0.46,
  shin: 0.43,
  shoulderHalf: 0.21,
  hipHalf: 0.09,
  ankleUp: 0.09,
  ankleFwd: 0.01,
};
export const GRIP_X = 0.27;
export const GRIP_Y = 0.78;
const GRIP_Z = 0.33;
export const PEG_X = -0.14;
export const PEG_Y = 0.02;
const PEG_Z = 0.2;
const ANKLE_X = PEG_X + CH.ankleFwd;
const ANKLE_Y = PEG_Y + CH.ankleUp;
const CANON = {
  stand_attack: { hipX: -0.28, hipY: 0.85, torso: 40, head: 66 },
  hang_back: { hipX: -0.57, hipY: 0.6, torso: 55, head: 75 },
  forward_attack: { hipX: -0.22, hipY: 0.9, torso: 26, head: 42 },
};
const ELBOW_POLE = { x: 0.6, y: 0.5, z: 1.0 };
const KNEE_POLE = { x: 1, y: 0.2, z: -0.15 };
const ARM_REACH = (CH.upperArm + CH.forearm) * 0.985;
const ARM_NEAR = 0.18;
const LEG_REACH = (CH.thigh + CH.shin) * 0.985;
const DEG = PI / 180;

/** Canonical hips / torso / head for a lean (linear blends, as physics targets are; the render keeps its ease). */
export function canonicalPose(lean: number): { hipX: number; hipY: number; torso: number; head: number } {
  const S = CANON.stand_attack;
  const H = CANON.hang_back;
  const F = CANON.forward_attack;
  const back = lean < 0 ? -lean : 0;
  const fwd = lean > 0 ? lean : 0;
  return {
    hipX: S.hipX + (H.hipX - S.hipX) * back + (F.hipX - S.hipX) * fwd,
    hipY: S.hipY + (H.hipY - S.hipY) * back + (F.hipY - S.hipY) * fwd,
    torso: (S.torso + (H.torso - S.torso) * back + (F.torso - S.torso) * fwd) * DEG,
    head: (S.head + (H.head - S.head) * back + (F.head - S.head) * fwd) * DEG,
  };
}

function ik3(ax: number, ay: number, az: number, bx: number, by: number, bz: number, l1: number, l2: number, px0: number, py0: number, pz0: number): [number, number] {
  let dx = bx - ax;
  let dy = by - ay;
  let dz = bz - az;
  let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const max = (l1 + l2) * 0.995;
  const min = Math.abs(l1 - l2) + 0.02;
  if (d < 1e-6) return [ax + l1, ay];
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
  const pu = px0 * ux + py0 * uy + pz0 * uz;
  let px = px0 - ux * pu;
  let py = py0 - uy * pu;
  const pz = pz0 - uz * pu;
  const pl = Math.sqrt(px * px + py * py + pz * pz) || 1;
  px /= pl;
  py /= pl;
  return [ax + ux * x + px * h, ay + uy * x + py * h];
}

export interface ChainOut {
  /** World points: 0 hips, 1 shoulders, 2 head centre, 3 elbow, 4 hand, 5 knee, 6 ankle. */
  x: Float64Array;
  y: Float64Array;
  /** Torso unit direction (hips -> shoulders) and head direction (shoulders -> head), world. */
  dx: number;
  dy: number;
  hx: number;
  hy: number;
  /** Axle-frame hips of the drawn figure (for armExtend). */
  hipAx: number;
  hipAy: number;
}

/**
 * Build the chain in world space. `hipDx/hipDy` is the body's deviation from its target in the axle
 * frame (added to the canonical hips), `torsoLag` the body angle's lag behind its target (rad, + = the
 * torso is pitched back relative to the pose). (fx, fy, c, s) is the chassis pose; (ox, oy) the axle
 * origin in the chassis frame.
 */
export function buildChain(
  lean: number,
  hipDx: number,
  hipDy: number,
  torsoLag: number,
  fx: number,
  fy: number,
  c: number,
  s: number,
  ox: number,
  oy: number,
  out: ChainOut,
): void {
  const p = canonicalPose(lean);
  let hx = p.hipX + hipDx;
  let hy = p.hipY + hipDy;
  const torso = clamp(p.torso + torsoLag, 12 * DEG, 80 * DEG);
  const head = Math.max(p.head + torsoLag, torso + 12 * DEG);
  const tdx = cos(torso);
  const tdy = sin(torso);
  let sx = hx + tdx * CH.torso;
  let sy = hy + tdy * CH.torso;
  {
    const d = Math.sqrt((hx - ANKLE_X) * (hx - ANKLE_X) + (hy - ANKLE_Y) * (hy - ANKLE_Y));
    if (d > LEG_REACH) {
      const k = (d - LEG_REACH) / d;
      hx += (ANKLE_X - hx) * k;
      hy += (ANKLE_Y - hy) * k;
      sx = hx + tdx * CH.torso;
      sy = hy + tdy * CH.torso;
    }
  }
  {
    const dzs = GRIP_Z - CH.shoulderHalf;
    const reachXY = Math.sqrt(Math.max(0, ARM_REACH * ARM_REACH - dzs * dzs));
    const ddx = GRIP_X - sx;
    const ddy = GRIP_Y - sy;
    const d = Math.sqrt(ddx * ddx + ddy * ddy);
    if (d > reachXY || d < ARM_NEAR) {
      const k = (d - (d > reachXY ? reachXY : ARM_NEAR)) / (d || 1e-6);
      sx += ddx * k;
      sy += ddy * k;
      hx += ddx * k;
      hy += ddy * k;
    }
  }
  const hsx = cos(head);
  const hsy = sin(head);
  const hdx = sx + hsx * CH.neck;
  const hdy = sy + hsy * CH.neck;
  const [ex, ey] = ik3(sx, sy, CH.shoulderHalf, GRIP_X, GRIP_Y, GRIP_Z, CH.upperArm, CH.forearm, ELBOW_POLE.x, ELBOW_POLE.y, ELBOW_POLE.z);
  const [kx, ky] = ik3(hx, hy, CH.hipHalf, ANKLE_X, ANKLE_Y, PEG_Z, CH.thigh, CH.shin, KNEE_POLE.x, KNEE_POLE.y, KNEE_POLE.z);
  const put = (i: number, ax: number, ay: number): void => {
    const lx = ax + ox;
    const ly = ay + oy;
    out.x[i] = fx + lx * c - ly * s;
    out.y[i] = fy + lx * s + ly * c;
  };
  put(0, hx, hy);
  put(1, sx, sy);
  put(2, hdx, hdy);
  put(3, ex, ey);
  put(4, GRIP_X, GRIP_Y);
  put(5, kx, ky);
  put(6, ANKLE_X, ANKLE_Y);
  const tl = Math.sqrt((sx - hx) * (sx - hx) + (sy - hy) * (sy - hy)) || 1;
  const dxl = (sx - hx) / tl;
  const dyl = (sy - hy) / tl;
  out.dx = dxl * c - dyl * s;
  out.dy = dxl * s + dyl * c;
  out.hx = hsx * c - hsy * s;
  out.hy = hsx * s + hsy * c;
  out.hipAx = hx;
  out.hipAy = hy;
}
