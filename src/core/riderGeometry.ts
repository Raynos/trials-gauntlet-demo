/** Shared deterministic geometry for rider mass, physical contacts/sensors and the skinned rig. */
import { clamp, cos, PI, sin } from '../physics/dmath';

/** Segment lengths used to author the rider rig. */
const CH = {
  torso: 0.52,
  neck: 0.22,
  upperArm: 0.32,
  forearm: 0.27,
  thigh: 0.46,
  shin: 0.43,
  shoulderHalf: 0.21,
  hipHalf: 0.09,
} as const;

/** One authoring profile for the solver and render. Mass fractions are the de Leva adult-male
 * segment row (1996, doi:10.1016/0021-9290(95)00178-6); joint-centre geometry, trunk midpoint,
 * head/neck midpoint and foot centroid are explicit game-model approximations. Both outfits
 * represent the same 75 kg person. This does not claim exact human tissue density or variable
 * multibody inertia: the dynamics keep one declared aggregate inertia per bike configuration. */
export const RIDER_PROFILE = {
  stature: 1.78,
  torso: CH.torso,
  headCenter: CH.neck,
  headNeckLength: 0.35,
  upperArm: CH.upperArm,
  forearm: CH.forearm,
  thigh: CH.thigh,
  shin: CH.shin,
  shoulderHalf: CH.shoulderHalf,
  hipHalf: CH.hipHalf,
  grip: { x: 0.27, y: 0.78, z: 0.33 },
  peg: { x: -0.14, y: 0.02, z: 0.2 },
  wristFromGrip: { x: -0.025, y: 0.055 },
  ankle: { x: -0.13, y: 0.11, z: 0.2 },
  footCentroidFromAnkle: { x: 0.06, y: -0.055 },
  mass: { headNeck: 0.0694, trunk: 0.4346, upperArm: 0.0271, forearm: 0.0162, hand: 0.0061, thigh: 0.1416, shin: 0.0433, foot: 0.0137 },
  comFraction: { headNeck: 0.5, trunk: 0.5, upperArm: 0.5772, forearm: 0.4574, thigh: 0.4095, shin: 0.4395 },
  poses: [
    { lean: -1, hipX: -0.66, hipY: 0.725, torso: 40, head: 66 },
    { lean: 0, hipX: -0.34, hipY: 0.732, torso: 65, head: 85 },
    { lean: 1, hipX: -0.12, hipY: 0.94, torso: 24, head: 40 },
  ],
} as const;

export interface RigPoint {
  x: number;
  y: number;
  z: number;
}
export interface RiderRigPose {
  hips: RigPoint;
  shoulders: RigPoint;
  head: RigPoint;
  elbow: RigPoint;
  wrist: RigPoint;
  grip: RigPoint;
  knee: RigPoint;
  ankle: RigPoint;
  com: RigPoint;
  torsoAngle: number;
  headAngle: number;
  armReach: number;
  legReach: number;
  residual: number;
}

export function makeRiderRigPose(): RiderRigPose {
  const point = (): RigPoint => ({ x: 0, y: 0, z: 0 });
  return {
    hips: point(),
    shoulders: point(),
    head: point(),
    elbow: point(),
    wrist: point(),
    grip: point(),
    knee: point(),
    ankle: point(),
    com: point(),
    torsoAngle: 0,
    headAngle: 0,
    armReach: 0,
    legReach: 0,
    residual: 0,
  };
}

function profileJoint(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  l1: number,
  l2: number,
  px: number,
  py: number,
  pz: number,
  out: RigPoint,
): number {
  const dx = bx - ax,
    dy = by - ay,
    dz = bz - az;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const ux = dx / (distance || 1),
    uy = dy / (distance || 1),
    uz = dz / (distance || 1);
  // This extrapolates the mass map outside the reachable workspace so a physical constraint
  // can evaluate its gradient. The reach ratio remains explicit; it does not move/clamp the body.
  const d = clamp(distance, Math.abs(l1 - l2) + 1e-5, (l1 + l2) * 0.999999);
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const dot = px * ux + py * uy + pz * uz;
  px -= ux * dot;
  py -= uy * dot;
  pz -= uz * dot;
  const poleLength = Math.sqrt(px * px + py * py + pz * pz) || 1;
  out.x = ax + ux * along + (height * px) / poleLength;
  out.y = ay + uy * along + (height * py) / poleLength;
  out.z = az + uz * along + (height * pz) / poleLength;
  return distance / (l1 + l2);
}

/** Exact 3D leg triangle with one oriented sagittal bend, mirrored for the other leg.
 * Unlike a projected fixed pole, v=(-dy,dx,0)/planar never drives the knee inward.
 * The anatomical reach interval bounds planar >= .285m and knee.z to [.1468,.1608]m.
 * Outside triangle reach retain the explicit mass-map extrapolation used by the arm. */
function sagittalKnee(hipX: number, hipY: number, out: RigPoint): number {
  const p = RIDER_PROFILE;
  const dx = p.ankle.x - hipX,
    dy = p.ankle.y - hipY,
    dz = p.ankle.z - p.hipHalf;
  const planar = Math.sqrt(dx * dx + dy * dy);
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const d = clamp(distance, Math.abs(p.thigh - p.shin) + 1e-5, (p.thigh + p.shin) * 0.999999);
  const along = (p.thigh * p.thigh - p.shin * p.shin + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(0, p.thigh * p.thigh - along * along));
  // There is no unique sagittal direction at zero planar reach, outside the permitted domain.
  const vx = planar > 0 ? -dy / planar : 1;
  const vy = planar > 0 ? dx / planar : 0;
  out.x = hipX + (dx / distance) * along + height * vx;
  out.y = hipY + (dy / distance) * along + height * vy;
  out.z = p.hipHalf + (dz / distance) * along;
  return distance / (p.thigh + p.shin);
}

/** Forward mass/geometry map, all positions in axle coordinates. Only the left limb is stored;
 * the right mirrors z and contributes the same sagittal mass distribution. Angles are radians. */
// Exact-value memoization only: this caches pure trigonometry, never an inverse solve's initial state.
let angleKey = NaN,
  angleHead = 0,
  torsoCos = 0,
  torsoSin = 0,
  headCos = 0,
  headSin = 0;
export function riderRigFromHips(hipX: number, hipY: number, torso: number, out: RiderRigPose): RiderRigPose {
  const p = RIDER_PROFILE;
  if (torso !== angleKey) {
    angleKey = torso;
    const degrees = (torso * 180) / PI;
    const headDegrees = degrees <= 40 ? degrees + 16 + 10 * clamp((degrees - 26) / 14, 0, 1) : degrees + 26 - 6 * clamp((degrees - 40) / 15, 0, 1);
    angleHead = (headDegrees * PI) / 180;
    torsoCos = cos(torso);
    torsoSin = sin(torso);
    headCos = cos(angleHead);
    headSin = sin(angleHead);
  }
  const head = angleHead;
  out.hips.x = hipX;
  out.hips.y = hipY;
  out.hips.z = 0;
  const sx = hipX + p.torso * torsoCos,
    sy = hipY + p.torso * torsoSin;
  out.shoulders.x = sx;
  out.shoulders.y = sy;
  out.shoulders.z = 0;
  out.head.x = sx + p.headCenter * headCos;
  out.head.y = sy + p.headCenter * headSin;
  out.head.z = 0;
  out.grip.x = p.grip.x;
  out.grip.y = p.grip.y;
  out.grip.z = p.grip.z;
  out.wrist.x = p.grip.x + p.wristFromGrip.x;
  out.wrist.y = p.grip.y + p.wristFromGrip.y;
  out.wrist.z = p.grip.z;
  out.ankle.x = p.ankle.x;
  out.ankle.y = p.ankle.y;
  out.ankle.z = p.ankle.z;
  out.armReach = profileJoint(sx, sy, p.shoulderHalf, out.wrist.x, out.wrist.y, out.wrist.z, p.upperArm, p.forearm, 0.3, -1, 0.15, out.elbow);
  out.legReach = sagittalKnee(hipX, hipY, out.knee);
  const m = p.mass,
    f = p.comFraction;
  const ex = out.elbow.x,
    ey = out.elbow.y,
    wx = out.wrist.x,
    wy = out.wrist.y;
  const kx = out.knee.x,
    ky = out.knee.y,
    ax = p.ankle.x,
    ay = p.ankle.y;
  out.com.x =
    m.trunk * (hipX + (sx - hipX) * f.trunk) +
    m.headNeck * (sx + p.headNeckLength * f.headNeck * headCos) +
    2 *
      (m.upperArm * (sx + (ex - sx) * f.upperArm) +
        m.forearm * (ex + (wx - ex) * f.forearm) +
        m.hand * p.grip.x +
        m.thigh * (hipX + (kx - hipX) * f.thigh) +
        m.shin * (kx + (ax - kx) * f.shin) +
        m.foot * (ax + p.footCentroidFromAnkle.x));
  out.com.y =
    m.trunk * (hipY + (sy - hipY) * f.trunk) +
    m.headNeck * (sy + p.headNeckLength * f.headNeck * headSin) +
    2 *
      (m.upperArm * (sy + (ey - sy) * f.upperArm) +
        m.forearm * (ey + (wy - ey) * f.forearm) +
        m.hand * p.grip.y +
        m.thigh * (hipY + (ky - hipY) * f.thigh) +
        m.shin * (ky + (ay - ky) * f.shin) +
        m.foot * (ay + p.footCentroidFromAnkle.y));
  out.com.z = 0;
  out.torsoAngle = torso;
  out.headAngle = head;
  out.residual = 0;
  return out;
}

/** Inverse of the SAME mass map. A fixed initial guess and bounded, residual-decreasing
 * Newton steps make the answer independent of call history. Outside the anatomical stops the
 * extrapolated limb map can fold: Newton must not take an unbounded step or discard its best
 * iterate. A gradient step handles a singular/non-descent Newton direction. If neither direction
 * improves the fit, return the best finite pose with its honest residual; the constraint solver
 * uses an explicit local continuation there instead of silently disabling the joint rows. */
export function riderRigFromCOM(comX: number, comY: number, torso: number, out: RiderRigPose): RiderRigPose {
  const neutral = RIDER_PROFILE.poses[1];
  riderRigFromHips(neutral.hipX, neutral.hipY, torso, out);
  let hx = comX - (out.com.x - neutral.hipX);
  let hy = comY - (out.com.y - neutral.hipY);
  const epsilon = 1e-5;
  const initialX = hx,
    initialY = hy;
  let bestX = hx,
    bestY = hy,
    bestError = Infinity;
  // Alternative seeds are only visited after an out-of-domain fold traps the first solve.
  // They are fixed offsets, never a previous frame's pose or a random branch selection.
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      hx = initialX + (attempt === 3 ? -0.2 : attempt === 4 ? 0.2 : 0);
      hy = initialY + (attempt === 1 ? -0.2 : attempt === 2 ? 0.2 : 0);
    }
    riderRigFromHips(hx, hy, torso, out);
    for (let i = 0; i < 20; i++) {
      const cx = out.com.x,
        cy = out.com.y;
      const ex = comX - cx,
        ey = comY - cy;
      const error = ex * ex + ey * ey;
      if (error < bestError) {
        bestError = error;
        bestX = hx;
        bestY = hy;
      }
      if (error < 1e-16) break;
      riderRigFromHips(hx + epsilon, hy, torso, out);
      const j00 = (out.com.x - cx) / epsilon,
        j10 = (out.com.y - cy) / epsilon;
      riderRigFromHips(hx, hy + epsilon, torso, out);
      const j01 = (out.com.x - cx) / epsilon,
        j11 = (out.com.y - cy) / epsilon;
      const det = j00 * j11 - j01 * j10;
      let accepted = false;
      for (let direction = 0; direction < 2 && !accepted; direction++) {
        // The normalized gradient remains a descent direction when the inverse is singular.
        if (direction === 0 && Math.abs(det) < 1e-8) continue;
        let dx = direction === 0 ? (j11 * ex - j01 * ey) / det : j00 * ex + j10 * ey;
        let dy = direction === 0 ? (j00 * ey - j10 * ex) / det : j01 * ex + j11 * ey;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length > 0.25) {
          dx *= 0.25 / length;
          dy *= 0.25 / length;
        }
        for (let backtrack = 0; backtrack < 10; backtrack++) {
          riderRigFromHips(hx + dx, hy + dy, torso, out);
          if ((comX - out.com.x) ** 2 + (comY - out.com.y) ** 2 < error) {
            hx += dx;
            hy += dy;
            accepted = true;
            break;
          }
          dx *= 0.5;
          dy *= 0.5;
        }
      }
      if (!accepted) break;
    }
    if (bestError < 1e-16) break;
  }
  // A converged iterate already contains the complete forward map. Only a failed
  // search/backtrack needs to reconstruct its best earlier iterate.
  if (out.hips.x !== bestX || out.hips.y !== bestY) riderRigFromHips(bestX, bestY, torso, out);
  out.residual = Math.sqrt((out.com.x - comX) ** 2 + (out.com.y - comY) ** 2);
  return out;
}

/** Body angle zero is the shared seated torso, 65 degrees above chassis-forward. */
export const RIDER_TORSO_REST = (RIDER_PROFILE.poses[1].torso * PI) / 180;

/** Seat support in the axle frame. Rear shuffle clears the seat before the loading crouch. */
export const RIDER_SEAT = { rearX: -0.54, frontX: -0.05, topY: 0.5686, pelvisDrop: 0.18 } as const;
export function riderPoseAtLean(lean: number, out: RiderRigPose): RiderRigPose {
  const l = clamp(lean, -1, 1);
  const neutral = RIDER_PROFILE.poses[1],
    back = RIDER_PROFILE.poses[0],
    forward = RIDER_PROFILE.poses[2];
  const clear = { hipX: -0.6, hipY: neutral.hipY, torso: 40 };
  const a = l < -0.5 ? back : l < 0 ? clear : neutral;
  const b = l < -0.5 ? clear : l < 0 ? neutral : forward;
  const t = l < -0.5 ? (l + 1) * 2 : l < 0 ? (l + 0.5) * 2 : l;
  const u = t * t * (3 - 2 * t);
  return riderRigFromHips(a.hipX + (b.hipX - a.hipX) * u, a.hipY + (b.hipY - a.hipY) * u, ((a.torso + (b.torso - a.torso) * u) * PI) / 180, out);
}
/** Dense target knots preserve the nonlinear segment-mass map; current-body reconstruction remains exact. */
export function riderTargetTable(axleX: number, axleY: number): { lean: number; x: number; y: number; psi: number }[] {
  const rig = makeRiderRigPose();
  return Array.from({ length: 81 }, (_, i) => {
    const lean = -1 + i / 40;
    riderPoseAtLean(lean, rig);
    return { lean, x: rig.com.x + axleX, y: rig.com.y + axleY, psi: rig.torsoAngle - RIDER_TORSO_REST };
  });
}
