/**
 * Rider v2: the coupled internal servo wrench, one declared posed whole-body mass profile, and its
 * forward/inverse geometry maps. Solver attachments, crash sensors and rendering use the same map.
 * Pure functions; the world owns state. The articulated mass geometry uses a fixed aggregate-inertia
 * approximation rather than claiming independently simulated limb kinetic energy.
 */
import { atan2, clamp, cos, PI, sin } from '../dmath';
import type { PoseRow, TuningV2 } from './tuning';

/** Relative COM motion measured in a frame rotating with the chassis. Forces are world-space. */
export interface RiderServoKinematics {
  offsetX: number;
  offsetY: number;
  errorX: number;
  errorY: number;
  angleError: number;
  relativeVX: number;
  relativeVY: number;
  relativeW: number;
  invMassC: number;
  invMassR: number;
  invInertiaC: number;
  invInertiaR: number;
}

export interface RiderServoWrench {
  x: number;
  y: number;
  torque: number;
}

/** Minimize .5 Fᵀ B F - rhsᵀ F over a force disk, for symmetric positive B. */
function forceInDisk(a: number, b: number, d: number, x: number, y: number, radius: number, out: RiderServoWrench): void {
  if (radius <= 0) {
    out.x = out.y = 0;
    return;
  }
  const det = a * d - b * b;
  out.x = (d * x - b * y) / det;
  out.y = (a * y - b * x) / det;
  if (out.x * out.x + out.y * out.y <= radius * radius) return;
  // The active disk constraint adds lambda*I. norm(rhs)/radius is a conservative upper
  // bracket since B is positive. Taking the upper endpoint stays inside the physical cap.
  let lo = 0;
  let hi = Math.sqrt(x * x + y * y) / radius;
  for (let i = 0; i < 28; i++) {
    const lambda = (lo + hi) / 2;
    const aa = a + lambda;
    const dd = d + lambda;
    const determinant = aa * dd - b * b;
    const fx = (dd * x - b * y) / determinant;
    const fy = (aa * y - b * x) / determinant;
    if (fx * fx + fy * fy > radius * radius) lo = lambda;
    else hi = lambda;
  }
  const aa = a + hi;
  const dd = d + hi;
  const determinant = aa * dd - b * b;
  out.x = (dd * x - b * y) / determinant;
  out.y = (aa * y - b * x) / determinant;
}

/**
 * Implicit PD control of relative COM position and body angle. The corresponding internal wrench
 * is +F at the rider COM, -F at that SAME world point on the chassis, and an equal/opposite torque
 * pair. This conserves linear/angular momentum while giving the rider only the commanded torque.
 *
 * For r = COM_R - COM_C and j = (-r.y,r.x), the relative-rate response is the symmetric matrix
 * A = [[(imC+imR)I + iiC*j*jᵀ, iiC*j], [iiC*jᵀ, iiC+iiR]]. It is positive semidefinite.
 * Solve (I + dt*(D+dt*K)*A) wrench = K*error - (D+dt*K)*relativeRate, including rotation/translation
 * coupling. The old separate COM damper and off-center grip/peg forces added uncommanded rider
 * torque, overwhelming the angular actuator. No post-step pose/velocity clamps are involved.
 */
export function riderServoWrench(
  tuning: Pick<TuningV2['rider'], 'kp' | 'kd' | 'kpsi' | 'cpsi' | 'tauMax'>,
  k: RiderServoKinematics,
  dt: number,
  maxForce: number,
  out: RiderServoWrench,
): RiderServoWrench {
  const h = tuning.kd + dt * tuning.kp;
  const ha = tuning.cpsi + dt * tuning.kpsi;
  const mass = k.invMassC + k.invMassR;
  const jx = -k.offsetY;
  const jy = k.offsetX;
  const ic = k.invInertiaC;
  const a00 = mass + ic * jx * jx;
  const a01 = ic * jx * jy;
  const a02 = ic * jx;
  const a11 = mass + ic * jy * jy;
  const a12 = ic * jy;
  const a22 = ic + k.invInertiaR;
  if (h === 0) {
    out.x = out.y = 0;
    out.torque = clamp((tuning.kpsi * k.angleError - ha * k.relativeW) / (1 + dt * ha * a22), -tuning.tauMax, tuning.tauMax);
    return out;
  }
  // Divide by the positive gains to obtain symmetric B = H^-1 + dt*A. The bounded
  // convex minimum respects each actuator's capacity without scaling down an unrelated axis.
  const b00 = 1 / h + dt * a00;
  const b01 = dt * a01;
  const b02 = dt * a02;
  const b11 = 1 / h + dt * a11;
  const b12 = dt * a12;
  const rhs0 = tuning.kp / h * k.errorX - k.relativeVX;
  const rhs1 = tuning.kp / h * k.errorY - k.relativeVY;
  if (ha === 0) {
    forceInDisk(b00, b01, b11, rhs0, rhs1, maxForce, out);
    out.torque = 0;
    return out;
  }
  const b22 = 1 / ha + dt * a22;
  const rhs2 = tuning.kpsi / ha * k.angleError - k.relativeW;
  // First eliminate the free angular coordinate and solve the force-disk problem. If its
  // angular optimum violates a torque bound, convexity places the bounded optimum on that
  // boundary; solve the force disk once more with the actual available angular torque.
  forceInDisk(b00 - b02 * b02 / b22, b01 - b02 * b12 / b22, b11 - b12 * b12 / b22, rhs0 - b02 * rhs2 / b22, rhs1 - b12 * rhs2 / b22, maxForce, out);
  const torque = (rhs2 - b02 * out.x - b12 * out.y) / b22;
  out.torque = clamp(torque, -tuning.tauMax, tuning.tauMax);
  if (out.torque !== torque) forceInDisk(b00, b01, b11, rhs0 - b02 * out.torque, rhs1 - b12 * out.torque, maxForce, out);
  return out;
}

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
): void {
  poseAt(r.poses, lean, out);
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
  forearm: 0.27,
  thigh: 0.46,
  shin: 0.43,
  shoulderHalf: 0.21,
  hipHalf: 0.09,
  ankleUp: 0.09,
  ankleFwd: 0.01,
};

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
    { lean: -1, hipX: -0.57, hipY: 0.48, torso: 55, head: 75 },
    { lean: 0, hipX: -0.28, hipY: 0.85, torso: 40, head: 66 },
    { lean: 1, hipX: -0.22, hipY: 0.90, torso: 26, head: 42 },
  ],
} as const;

export interface RigPoint { x: number; y: number; z: number; }
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
  return { hips: point(), shoulders: point(), head: point(), elbow: point(), wrist: point(), grip: point(), knee: point(), ankle: point(), com: point(), torsoAngle: 0, headAngle: 0, armReach: 0, legReach: 0, residual: 0 };
}

function profileJoint(ax: number, ay: number, az: number, bx: number, by: number, bz: number, l1: number, l2: number, px: number, py: number, pz: number, out: RigPoint): number {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const ux = dx / (distance || 1), uy = dy / (distance || 1), uz = dz / (distance || 1);
  // This extrapolates the mass map outside the reachable workspace so a physical constraint
  // can evaluate its gradient. The reach ratio remains explicit; it does not move/clamp the body.
  const d = clamp(distance, Math.abs(l1 - l2) + 1e-5, (l1 + l2) * 0.999999);
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const dot = px * ux + py * uy + pz * uz;
  px -= ux * dot; py -= uy * dot; pz -= uz * dot;
  const poleLength = Math.sqrt(px * px + py * py + pz * pz) || 1;
  out.x = ax + ux * along + height * px / poleLength;
  out.y = ay + uy * along + height * py / poleLength;
  out.z = az + uz * along + height * pz / poleLength;
  return distance / (l1 + l2);
}

/** Exact 3D leg triangle with one oriented sagittal bend, mirrored for the other leg.
 * Unlike a projected fixed pole, v=(-dy,dx,0)/planar never drives the knee inward.
 * The anatomical reach interval bounds planar >= .285m and knee.z to [.1468,.1608]m.
 * Outside triangle reach retain the explicit mass-map extrapolation used by the arm. */
function sagittalKnee(hipX: number, hipY: number, out: RigPoint): number {
  const p = RIDER_PROFILE;
  const dx = p.ankle.x - hipX, dy = p.ankle.y - hipY, dz = p.ankle.z - p.hipHalf;
  const planar = Math.sqrt(dx * dx + dy * dy);
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const d = clamp(distance, Math.abs(p.thigh - p.shin) + 1e-5, (p.thigh + p.shin) * 0.999999);
  const along = (p.thigh * p.thigh - p.shin * p.shin + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(0, p.thigh * p.thigh - along * along));
  // There is no unique sagittal direction at zero planar reach, outside the permitted domain.
  const vx = planar > 0 ? -dy / planar : 1;
  const vy = planar > 0 ? dx / planar : 0;
  out.x = hipX + dx / distance * along + height * vx;
  out.y = hipY + dy / distance * along + height * vy;
  out.z = p.hipHalf + dz / distance * along;
  return distance / (p.thigh + p.shin);
}

/** Forward mass/geometry map, all positions in axle coordinates. Only the left limb is stored;
 * the right mirrors z and contributes the same sagittal mass distribution. Angles are radians. */
export function riderRigFromHips(hipX: number, hipY: number, torso: number, out: RiderRigPose): RiderRigPose {
  const p = RIDER_PROFILE;
  const degrees = torso * 180 / PI;
  const headDegrees = degrees <= 40 ? degrees + 16 + 10 * clamp((degrees - 26) / 14, 0, 1) : degrees + 26 - 6 * clamp((degrees - 40) / 15, 0, 1);
  const head = headDegrees * PI / 180;
  out.hips.x = hipX; out.hips.y = hipY; out.hips.z = 0;
  const sx = hipX + p.torso * cos(torso), sy = hipY + p.torso * sin(torso);
  out.shoulders.x = sx; out.shoulders.y = sy; out.shoulders.z = 0;
  out.head.x = sx + p.headCenter * cos(head); out.head.y = sy + p.headCenter * sin(head); out.head.z = 0;
  out.grip.x = p.grip.x; out.grip.y = p.grip.y; out.grip.z = p.grip.z;
  out.wrist.x = p.grip.x + p.wristFromGrip.x; out.wrist.y = p.grip.y + p.wristFromGrip.y; out.wrist.z = p.grip.z;
  out.ankle.x = p.ankle.x; out.ankle.y = p.ankle.y; out.ankle.z = p.ankle.z;
  out.armReach = profileJoint(sx, sy, p.shoulderHalf, out.wrist.x, out.wrist.y, out.wrist.z, p.upperArm, p.forearm, 0.6, 0.5, 1, out.elbow);
  out.legReach = sagittalKnee(hipX, hipY, out.knee);
  const m = p.mass, f = p.comFraction;
  const ex = out.elbow.x, ey = out.elbow.y, wx = out.wrist.x, wy = out.wrist.y;
  const kx = out.knee.x, ky = out.knee.y, ax = p.ankle.x, ay = p.ankle.y;
  out.com.x = m.trunk * (hipX + (sx - hipX) * f.trunk) + m.headNeck * (sx + p.headNeckLength * f.headNeck * cos(head))
    + 2 * (m.upperArm * (sx + (ex - sx) * f.upperArm) + m.forearm * (ex + (wx - ex) * f.forearm) + m.hand * p.grip.x
      + m.thigh * (hipX + (kx - hipX) * f.thigh) + m.shin * (kx + (ax - kx) * f.shin) + m.foot * (ax + p.footCentroidFromAnkle.x));
  out.com.y = m.trunk * (hipY + (sy - hipY) * f.trunk) + m.headNeck * (sy + p.headNeckLength * f.headNeck * sin(head))
    + 2 * (m.upperArm * (sy + (ey - sy) * f.upperArm) + m.forearm * (ey + (wy - ey) * f.forearm) + m.hand * p.grip.y
      + m.thigh * (hipY + (ky - hipY) * f.thigh) + m.shin * (ky + (ay - ky) * f.shin) + m.foot * (ay + p.footCentroidFromAnkle.y));
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
  const initialX = hx, initialY = hy;
  let bestX = hx, bestY = hy, bestError = Infinity;
  // Alternative seeds are only visited after an out-of-domain fold traps the first solve.
  // They are fixed offsets, never a previous frame's pose or a random branch selection.
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      hx = initialX + (attempt === 3 ? -0.2 : attempt === 4 ? 0.2 : 0);
      hy = initialY + (attempt === 1 ? -0.2 : attempt === 2 ? 0.2 : 0);
    }
    riderRigFromHips(hx, hy, torso, out);
    for (let i = 0; i < 20; i++) {
      const cx = out.com.x, cy = out.com.y;
      const ex = comX - cx, ey = comY - cy;
      const error = ex * ex + ey * ey;
      if (error < bestError) { bestError = error; bestX = hx; bestY = hy; }
      if (error < 1e-18) break;
      riderRigFromHips(hx + epsilon, hy, torso, out);
      const j00 = (out.com.x - cx) / epsilon, j10 = (out.com.y - cy) / epsilon;
      riderRigFromHips(hx, hy + epsilon, torso, out);
      const j01 = (out.com.x - cx) / epsilon, j11 = (out.com.y - cy) / epsilon;
      const det = j00 * j11 - j01 * j10;
      let accepted = false;
      for (let direction = 0; direction < 2 && !accepted; direction++) {
        // The normalized gradient remains a descent direction when the inverse is singular.
        if (direction === 0 && Math.abs(det) < 1e-8) continue;
        let dx = direction === 0 ? (j11 * ex - j01 * ey) / det : j00 * ex + j10 * ey;
        let dy = direction === 0 ? (j00 * ey - j10 * ex) / det : j01 * ex + j11 * ey;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length > 0.25) { dx *= 0.25 / length; dy *= 0.25 / length; }
        for (let backtrack = 0; backtrack < 10; backtrack++) {
          riderRigFromHips(hx + dx, hy + dy, torso, out);
          if ((comX - out.com.x) ** 2 + (comY - out.com.y) ** 2 < error) {
            hx += dx; hy += dy;
            accepted = true;
            break;
          }
          dx *= 0.5; dy *= 0.5;
        }
      }
      if (!accepted) break;
    }
    if (bestError < 1e-18) break;
  }
  riderRigFromHips(bestX, bestY, torso, out);
  out.residual = Math.sqrt((out.com.x - comX) ** 2 + (out.com.y - comY) ** 2);
  return out;
}

/** Chain-rule gradient of a joint gap with respect to the aggregate COM. Anatomically valid
 * poses use the exact inverse Jacobian. At an out-of-domain fold or an unresolved inverse,
 * continue the local mass map by holding elbow/knee positions fixed: the trunk, head and the
 * proximal fractions of the upper arm/thigh still translate with the hips. That known positive
 * mass fraction gives a finite, invertible recovery map. This is deliberately an approximation
 * outside the domain, reported through the return value; it never claims to repair limb lengths
 * or COM residuals by moving the visual rig independently of the physical bodies. */
export function riderCOMGradient(j00: number, j01: number, j10: number, j11: number, residual: number, gx: number, gy: number, out: RigPoint): boolean {
  const determinant = j00 * j11 - j01 * j10;
  const regular = Math.abs(determinant) >= 1e-4 && residual <= 1e-4;
  if (regular) {
    out.x = (gx * j11 - gy * j10) / determinant;
    out.y = (gy * j00 - gx * j01) / determinant;
  } else {
    const p = RIDER_PROFILE;
    const movingMass = p.mass.trunk + p.mass.headNeck
      + 2 * (p.mass.upperArm * (1 - p.comFraction.upperArm) + p.mass.thigh * (1 - p.comFraction.thigh));
    out.x = gx / movingMass;
    out.y = gy / movingMass;
  }
  return regular;
}

/** Neutral aggregate inertia: segment rods about their centroids plus parallel-axis terms.
 * It remains fixed during motion; articulated segment kinetic energy is not simulated separately. */
export function riderProfileInertia(mass: number): number {
  const p = RIDER_PROFILE;
  const pose = riderRigFromHips(p.poses[1].hipX, p.poses[1].hipY, p.poses[1].torso * PI / 180, makeRiderRigPose());
  const m = p.mass, f = p.comFraction;
  const contribution = (fraction: number, a: RigPoint, b: RigPoint, along: number, length: number): number => {
    const x = a.x + (b.x - a.x) * along - pose.com.x;
    const y = a.y + (b.y - a.y) * along - pose.com.y;
    return mass * fraction * (x * x + y * y + length * length / 12);
  };
  const shoulder = { ...pose.shoulders, z: p.shoulderHalf };
  const hip = { ...pose.hips, z: p.hipHalf };
  const headTop = { x: pose.shoulders.x + p.headNeckLength * cos(pose.headAngle), y: pose.shoulders.y + p.headNeckLength * sin(pose.headAngle), z: 0 };
  const foot = { x: pose.ankle.x + p.footCentroidFromAnkle.x, y: pose.ankle.y + p.footCentroidFromAnkle.y, z: pose.ankle.z };
  return contribution(m.trunk, pose.hips, pose.shoulders, f.trunk, p.torso)
    + contribution(m.headNeck, pose.shoulders, headTop, f.headNeck, p.headNeckLength)
    + 2 * (contribution(m.upperArm, shoulder, pose.elbow, f.upperArm, p.upperArm)
      + contribution(m.forearm, pose.elbow, pose.wrist, f.forearm, p.forearm)
      + contribution(m.hand, pose.grip, pose.grip, 0, 0.1)
      + contribution(m.thigh, hip, pose.knee, f.thigh, p.thigh)
      + contribution(m.shin, pose.knee, pose.ankle, f.shin, p.shin)
      + contribution(m.foot, foot, foot, 0, 0.26));
}
/** Body angle zero is the authored neutral torso, 40 degrees above chassis-forward. */
export const RIDER_TORSO_REST = RIDER_PROFILE.poses[1].torso * PI / 180;
/** Minimum interior elbow opening (145 degrees maximum flexion), a declared game joint stop.
 * With the fixed .12m shoulder/wrist side separation this keeps the arm pole projection above
 * .247 in norm; its singular direction occurs at .152263m reach, below this .183713m stop. */
export const RIDER_ELBOW_MIN = 35 * PI / 180;
/** Unilateral limb limits. The 3D side separation is removed from the planar solver reach. */
export const RIDER_REACH = {
  armMin: Math.sqrt(CH.upperArm ** 2 + CH.forearm ** 2 - 2 * CH.upperArm * CH.forearm * cos(RIDER_ELBOW_MIN) - (RIDER_PROFILE.grip.z - CH.shoulderHalf) ** 2),
  armMax: Math.sqrt(((CH.upperArm + CH.forearm) * 0.995) ** 2 - (RIDER_PROFILE.grip.z - CH.shoulderHalf) ** 2),
  legMax: Math.sqrt(((CH.thigh + CH.shin) * 0.995) ** 2 - (RIDER_PROFILE.ankle.z - CH.hipHalf) ** 2),
  // Interior knee angle >= 40 degrees (140 degrees flexion); this is a joint stop, not a COM clamp.
  legMin: Math.sqrt(CH.thigh ** 2 + CH.shin ** 2 - 2 * CH.thigh * CH.shin * cos(40 * PI / 180) - (RIDER_PROFILE.ankle.z - CH.hipHalf) ** 2),
};
/** Broad boot/ankle articulation envelope relative to the chassis: shin stays above the sole,
 * from 60 degrees forward of up to 30 degrees behind. These are explicit joint stops. */
export const RIDER_ANKLE = { min: 30 * PI / 180, max: 120 * PI / 180 };
/** Signed torso-to-thigh opening: knees cannot fold through the chest or behind the pelvis. */
export const RIDER_HIP = { min: 45 * PI / 180, max: 170 * PI / 180 };

export interface AnkleGeometry { angle: number; dx: number; dy: number; thighAngle: number; thighDx: number; thighDy: number; }

/** Legacy planar diagnostic, not the shared 3D mass map or the production constraint geometry.
 * The forward-bending planar knee, and d(ankle angle)/d(hip position), with ankle at (0,0).
 * Differentiating |K|=shin and |H-K|=thigh gives dα = (H-K)·dH / ((H-K)·J K).
 * Returns false outside the triangle workspace; the distance stops own that boundary. */
export function ankleGeometry(hx: number, hy: number, out: AnkleGeometry): boolean {
  const d = Math.sqrt(hx * hx + hy * hy);
  if (d <= Math.abs(CH.thigh - CH.shin) || d >= CH.thigh + CH.shin) return false;
  const along = (CH.shin ** 2 + d * d - CH.thigh ** 2) / (2 * d);
  const height = Math.sqrt(Math.max(0, CH.shin ** 2 - along * along));
  // Keep the oriented knee branch. Choosing a new branch when hip.y crosses zero would
  // teleport the knee through its ankle stop and let the body swing under the pegs.
  const kx = hx / d * along + hy / d * height;
  const ky = hy / d * along - hx / d * height;
  const tx = hx - kx;
  const ty = hy - ky;
  const denominator = -tx * ky + ty * kx;
  if (Math.abs(denominator) < 1e-8) return false;
  out.angle = atan2(ky, kx);
  out.dx = tx / denominator;
  out.dy = ty / denominator;
  const vx = -tx;
  const vy = -ty;
  const factor = (vx * kx + vy * ky) / (CH.thigh * CH.thigh);
  out.thighAngle = atan2(vy, vx);
  out.thighDx = factor * out.dx + vy / (CH.thigh * CH.thigh);
  out.thighDy = factor * out.dy - vx / (CH.thigh * CH.thigh);
  return true;
}
export const GRIP_X = RIDER_PROFILE.grip.x;
export const GRIP_Y = RIDER_PROFILE.grip.y;
export const PEG_X = RIDER_PROFILE.peg.x;
export const PEG_Y = RIDER_PROFILE.peg.y;

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
