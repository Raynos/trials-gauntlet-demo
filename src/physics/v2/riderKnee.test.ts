import { describe, expect, it } from 'vitest';
import { makeRiderRigPose, riderRigFromHips, riderRigFromCOM, RIDER_PROFILE as P, RIDER_REACH as R, type RigPoint } from './rider';

const distance = (a: RigPoint, b: RigPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Independent derivative of the exact 3D two-link circle, expressed about the ankle. */
function legDerivatives(x: number, y: number): number[] {
  const r = Math.hypot(x, y), d = Math.hypot(x, y, P.ankle.z - P.hipHalf);
  const c = P.thigh ** 2 - P.shin ** 2, a = (c + d * d) / (2 * d);
  const h = Math.sqrt(P.thigh ** 2 - a * a), f = .5 - c / (2 * d * d);
  const kx = f * x + h * y / r, ky = f * y - h * x / r, derivatives: number[] = [];
  for (const [qx, qy] of [[1, 0], [0, 1]] as const) {
    const dr = (x * qx + y * qy) / r, dd = (x * qx + y * qy) / d;
    const df = c * dd / (d * d * d), da = .5 * (1 - c / (d * d)) * dd, dh = -a * da / h;
    const dx = df * x + f * qx + dh * y / r + h * qy / r - h * y * dr / (r * r);
    const dy = df * y + f * qy - dh * x / r - h * qx / r + h * x * dr / (r * r);
    derivatives.push((kx * dy - ky * dx) / (kx * kx + ky * ky));
    const vx = kx - x, vy = ky - y;
    derivatives.push((vx * (dy - qy) - vy * (dx - qx)) / (vx * vx + vy * vy));
  }
  return derivatives;
}

describe('shared oriented sagittal 3D knees', () => {
  it('preserves both exact links and mirrored side margin over the entire permitted reach and direction', () => {
    const pose = makeRiderRigPose();
    let error = 0, minSide = Infinity, maxSide = -Infinity;
    for (let i = 0; i <= 40; i++) for (let j = 0; j < 72; j++) {
      const radius = R.legMin + (R.legMax - R.legMin) * i / 40, angle = j * Math.PI / 36;
      riderRigFromHips(P.ankle.x + radius * Math.cos(angle), P.ankle.y + radius * Math.sin(angle), .8, pose);
      for (const side of [-1, 1]) {
        const hip = { ...pose.hips, z: side * P.hipHalf };
        const knee = { ...pose.knee, z: side * pose.knee.z }, ankle = { ...pose.ankle, z: side * pose.ankle.z };
        error = Math.max(error, Math.abs(distance(hip, knee) - P.thigh), Math.abs(distance(knee, ankle) - P.shin));
        minSide = Math.min(minSide, side * knee.z); maxSide = Math.max(maxSide, side * knee.z);
      }
    }
    expect(error).toBeLessThan(1e-12);
    // Analytic extrema: hipHalf + dz*(.5 + (thigh²-shin²)/(2*d²)).
    const dz = P.ankle.z - P.hipHalf;
    const sideAt = (planar: number) => P.hipHalf + dz * (.5 + (P.thigh ** 2 - P.shin ** 2) / (2 * (planar * planar + dz * dz)));
    expect(minSide).toBeCloseTo(sideAt(R.legMax), 12);
    expect(maxSide).toBeCloseTo(sideAt(R.legMin), 12);
    expect(minSide).toBeGreaterThan(P.hipHalf);
    expect(maxSide).toBeLessThan(P.ankle.z);
  });

  it('recovers the exact historical crossed-knee COM witnesses through the same forward mass map', () => {
    for (const [x, y, torso] of [[-.25662173555462964, .45937033290863294, 1.4295309569494692], [-.2865872816879586, .5585566238643607, 1.2924940445127646]] as const) {
      const pose = riderRigFromCOM(x, y, torso, makeRiderRigPose());
      expect(pose.residual).toBeLessThan(1e-9);
      expect(pose.knee.z).toBeGreaterThan(P.hipHalf);
      expect(pose.knee.z).toBeLessThan(P.ankle.z);
      expect(distance({ ...pose.hips, z: P.hipHalf }, pose.knee)).toBeCloseTo(P.thigh, 12);
      expect(distance(pose.knee, pose.ankle)).toBeCloseTo(P.shin, 12);
      const forward = riderRigFromHips(pose.hips.x, pose.hips.y, torso, makeRiderRigPose());
      expect(Math.hypot(forward.com.x - x, forward.com.y - y)).toBeLessThan(1e-9);
      expect(pose).toEqual(riderRigFromCOM(x, y, torso, makeRiderRigPose()));
    }
  });

  it('actual knee ankle/thigh derivatives match the 3D circle and keep one branch across ankle height', () => {
    const epsilon = 1e-6;
    const angles = (x: number, y: number) => {
      const p = riderRigFromHips(P.ankle.x + x, P.ankle.y + y, .8, makeRiderRigPose());
      return [Math.atan2(p.knee.y - p.ankle.y, p.knee.x - p.ankle.x), Math.atan2(p.knee.y - p.hips.y, p.knee.x - p.hips.x)];
    };
    for (const [x, y] of [[-.08, .56], [-.3, .4], [.05, .65], [-.4, .001], [-.4, -.001]] as const) {
      const expected = legDerivatives(x, y);
      for (const [axis, [dx, dy]] of ([[1, 0], [0, 1]] as const).entries()) {
        const plus = angles(x + dx * epsilon, y + dy * epsilon), minus = angles(x - dx * epsilon, y - dy * epsilon);
        for (let angle = 0; angle < 2; angle++) expect(wrap(plus[angle]! - minus[angle]!) / (2 * epsilon)).toBeCloseTo(expected[axis * 2 + angle]!, 6);
      }
    }
    const plus = riderRigFromHips(P.ankle.x - .4, P.ankle.y + epsilon, .8, makeRiderRigPose());
    const minus = riderRigFromHips(P.ankle.x - .4, P.ankle.y - epsilon, .8, makeRiderRigPose());
    expect(distance(plus.knee, minus.knee)).toBeLessThan(5e-6);
  });

  it('keeps out-of-domain zero-basis and unreachable probes finite without concealing their reach violation', () => {
    for (const [x, y] of [[P.ankle.x, P.ankle.y], [P.ankle.x, P.ankle.y + 2]] as const) {
      const p = riderRigFromHips(x, y, .8, makeRiderRigPose());
      expect(Object.values(p.knee).every(Number.isFinite)).toBe(true);
      const planar = Math.hypot(x - P.ankle.x, y - P.ankle.y);
      expect(planar < R.legMin || planar > R.legMax).toBe(true);
      expect(p.legReach).toBeCloseTo(Math.hypot(planar, P.ankle.z - P.hipHalf) / (P.thigh + P.shin), 14);
    }
  });
});
