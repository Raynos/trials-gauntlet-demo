/**
 * Rider v2 (physics-v2.md §9): the pose table (lean -> COM offset + body angle in chassis space), the
 * rate-limited target, the bounded servo pair, and the drawn chain (RIDER_CHAIN.md port from v1) whose
 * hips follow the rider BODY, so the crash sensors sit on the simulated rider. Pure functions; the world
 * owns the state.
 */
import { clamp, cos, PI, sin } from '../dmath';
import type { PoseRow, TuningV2 } from './tuning';
import { RIDER_PROFILE, RIDER_SEAT, makeRiderRigPose, riderPoseAtLean, riderRigFromHips } from '../../core/riderGeometry';

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
 * target through `out`; hysteresis-free. `rateLin` / `rateAng` default to the table's ground rates; the
 * world passes the air-limited rates (R5) when both wheels are off the ground.
 */
export function advanceTarget(
  r: TuningV2['rider'],
  dt: number,
  tx: number,
  ty: number,
  tpsi: number,
  lean: number,
  out: { x: number; y: number; psi: number },
  rateLin: number = r.targetRateLin,
  rateAng: number = r.targetRateAng,
  requested?: { x: number; y: number; psi: number },
): void {
  if (requested) Object.assign(out, requested);
  else poseAt(r.poses, lean, out);
  const dx = out.x - tx;
  const dy = out.y - ty;
  const dl = Math.sqrt(dx * dx + dy * dy);
  const stepL = rateLin * dt;
  if (dl > stepL) {
    out.x = tx + (dx / dl) * stepL;
    out.y = ty + (dy / dl) * stepL;
  }
  const da = clamp(out.psi - tpsi, -rateAng * dt, rateAng * dt);
  out.psi = tpsi + da;
}

/** Compatibility pose views use the shared physical geometry; no draw-only excursion clamp. */
export const CH = {
  torso: RIDER_PROFILE.torso,
  neck: RIDER_PROFILE.headCenter,
  upperArm: RIDER_PROFILE.upperArm,
  forearm: RIDER_PROFILE.forearm,
  thigh: RIDER_PROFILE.thigh,
  shin: RIDER_PROFILE.shin,
  shoulderHalf: RIDER_PROFILE.shoulderHalf,
  hipHalf: RIDER_PROFILE.hipHalf,
  ankleUp: 0.09,
  ankleFwd: 0.01,
};
export const GRIP_X = RIDER_PROFILE.grip.x,
  GRIP_Y = RIDER_PROFILE.grip.y;
export const PEG_X = RIDER_PROFILE.peg.x,
  PEG_Y = RIDER_PROFILE.peg.y;
export type DrawnPoseId = 'seated' | 'back' | 'forward';
export interface DrawnPoseRow {
  hipX: number;
  hipY: number;
  torso: number;
  head: number;
}
const poseScratch = makeRiderRigPose();
export function canonicalPose(lean: number): DrawnPoseRow {
  const p = riderPoseAtLean(lean, poseScratch);
  return { hipX: p.hips.x, hipY: p.hips.y, torso: p.torsoAngle, head: p.headAngle };
}
const row = (lean: number): DrawnPoseRow => {
  const p = canonicalPose(lean);
  return { ...p, torso: (p.torso * 180) / PI, head: (p.head * 180) / PI };
};
export const DRAWN = Object.freeze({ back: Object.freeze(row(-1)), seated: Object.freeze(row(0)), forward: Object.freeze(row(1)) });
export const DRAWN_SEAT = RIDER_SEAT;
export function drawnPoseId(lean: number): { pose: DrawnPoseId; blend: number } {
  const l = clamp(lean, -1, 1);
  return { pose: l < 0 ? 'back' : l > 0 ? 'forward' : 'seated', blend: Math.abs(l) };
}
export function drawnPose(pose: DrawnPoseId, blend: number, out: DrawnPoseRow): void {
  Object.assign(out, canonicalPose(pose === 'back' ? -clamp(blend, 0, 1) : pose === 'forward' ? clamp(blend, 0, 1) : 0));
}
export function drawnBody(
  lean: number,
  dy: number,
  torsoLag: number,
  out: { pose: DrawnPoseId; blend: number; hips: { x: number; y: number }; torso: number; head: number },
): void {
  const id = drawnPoseId(lean),
    p = canonicalPose(lean);
  const rig = riderRigFromHips(p.hipX, p.hipY + dy, p.torso + torsoLag, poseScratch);
  out.pose = id.pose;
  out.blend = id.blend;
  out.hips.x = rig.hips.x;
  out.hips.y = rig.hips.y;
  out.torso = rig.torsoAngle;
  out.head = rig.headAngle;
}
export interface ChainOut {
  x: Float64Array;
  y: Float64Array;
  dx: number;
  dy: number;
  hx: number;
  hy: number;
  hipAx: number;
  hipAy: number;
}
/** Legacy target-chain API. Live sensors use the physical COM inverse directly in bike.ts. */
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
  const p = canonicalPose(lean),
    r = riderRigFromHips(p.hipX + hipDx, p.hipY + hipDy, p.torso + torsoLag, poseScratch);
  const points = [r.hips, r.shoulders, r.head, r.elbow, r.grip, r.knee, r.ankle];
  for (let i = 0; i < points.length; i++) {
    const q = points[i]!,
      x = q.x + ox,
      y = q.y + oy;
    out.x[i] = fx + c * x - s * y;
    out.y[i] = fy + s * x + c * y;
  }
  out.dx = cos(r.torsoAngle) * c - sin(r.torsoAngle) * s;
  out.dy = cos(r.torsoAngle) * s + sin(r.torsoAngle) * c;
  out.hx = cos(r.headAngle) * c - sin(r.headAngle) * s;
  out.hy = cos(r.headAngle) * s + sin(r.headAngle) * c;
  out.hipAx = r.hips.x;
  out.hipAy = r.hips.y;
}
