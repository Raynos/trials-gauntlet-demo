/**
 * Tyre v2 (physics-v2.md §6): brush model. Longitudinal force = min(Cs * v_slip, mu N) with mu from the
 * surface and a mild load sensitivity. The friction bound is applied inside the contact iteration; the
 * brush stiffness is applied in implicit form (at 120 Hz with an 8 kg wheel, Cs 9000 N/(m/s) is 96 % of
 * a rigid constraint per iteration, and the explicit form would be unstable by a factor 25).
 */
import type { TuningV2 } from './tuning';

/** Surface mu after load sensitivity: `mu_s * (1 - loadSens * clamp(N / W - 0.5, 0, 1))`, W = total weight. */
export function tyreMu(t: TuningV2['tyre'], muSurface: number, N: number, totalWeight: number): number {
  let x = N / totalWeight - 0.5;
  x = x < 0 ? 0 : x > 1 ? 1 : x;
  return muSurface * (1 - t.loadSens * x);
}

/**
 * Tangential impulse increment for a brush contact with relative tangential (patch) velocity `vt`,
 * effective mass `mT` along the tangent, over one tick: the implicit spring-in-velocity step
 * `J = -vt * mT * g / (1 + g)`, g = Cs dt / mT.
 */
export function brushImpulse(Cs: number, dt: number, mT: number, vt: number): number {
  const g = (Cs * dt) / mT;
  return (-vt * mT * g) / (1 + g);
}
