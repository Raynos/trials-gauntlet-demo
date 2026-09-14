/**
 * Engine v2 (physics-v2.md §7): a rim-thrust curve falling with speed, a first-order throttle lag,
 * engine braking, a limiter latch and a reported rpm. Pure functions over the tuning table; the world
 * applies the torque to the rear wheel and its reaction to the chassis.
 */
import type { TuningV2 } from './tuning';

const RPM_PER_RADS = 60 / (2 * 3.141592653589793);

/** Thrust fraction f(v) at rim speed v (piecewise linear on |v|, 0 beyond the last knot). */
export function thrustFrac(e: TuningV2['engine'], v: number): number {
  const a = v < 0 ? -v : v;
  const V = e.curveV;
  const F = e.curveF;
  const n = V.length;
  if (a >= V[n - 1]!) return 0;
  for (let i = 1; i < n; i++) {
    const v1 = V[i]!;
    if (a <= v1) {
      const v0 = V[i - 1]!;
      const t = (a - v0) / (v1 - v0);
      return F[i - 1]! + t * (F[i]! - F[i - 1]!);
    }
  }
  return 0;
}

/** First-order lag toward `target` over one tick, implicit form (no exp: bit-identical everywhere). */
export function lag(value: number, target: number, tau: number, dt: number): number {
  const a = dt / tau;
  let v = (value + target * a) / (1 + a);
  if ((v - target) * (v - target) < 1e-18) v = target;
  return v;
}

/**
 * Drive torque on the rear wheel (N m, > 0 drives forward) for a rim speed `v`, effective throttle and
 * the limiter latch: thrust curve, or engine braking when off the gas. On the ground and in the air alike.
 * `trim` (0..1) is the wheelie-control cut of the drive thrust (R4 Rookie assist); engine braking is not trimmed.
 */
export function driveTorque(e: TuningV2['engine'], r: number, v: number, throttleEff: number, limiter: boolean, trim = 0): number {
  const thrust = limiter ? 0 : (1 - trim) * throttleEff * e.Fpeak * thrustFrac(e, v);
  const sv = v / 5;
  const brakeShape = sv < -1 ? -1 : sv > 1 ? 1 : sv;
  const engineBrake = -e.engineBrake * e.Fpeak * brakeShape * (1 - throttleEff);
  return (thrust + engineBrake) * r;
}

/** Reported rpm: the wheel through the gear, or the slipping clutch below `clutchSpeed` (audio only, §7). */
export function reportRpm(e: TuningV2['engine'], r: number, v: number, throttleEff: number): number {
  const wheelRpm = (v / r) * e.gear * RPM_PER_RADS;
  let rpm = wheelRpm > e.idleRpm ? wheelRpm : e.idleRpm;
  if (v < e.clutchSpeed) {
    const clutch = e.idleRpm + throttleEff * (e.clutchRpm - e.idleRpm);
    if (clutch > rpm) rpm = clutch;
  }
  return rpm;
}

/** Limiter latch (CONTRACT: cut at limiterRpm, re-arm at limiterResetRpm) from the wheel's own rpm. */
export function limiterLatch(e: TuningV2['engine'], r: number, v: number, latched: boolean): boolean {
  const wheelRpm = (v / r) * e.gear * RPM_PER_RADS;
  if (latched) return wheelRpm >= e.limiterResetRpm;
  return wheelRpm >= e.limiterRpm;
}

/**
 * Wheelie-control trim 0..1 (R4 Rookie assist, `engine.wheelieControl`): the drive thrust cut for a chassis pitch
 * rate `w` (rad/s, nose-up positive) and a front suspension compression `frontComp` (m). Zero unless the front is
 * near topped out AND (the nose is rising faster than `rate0`, full at `rate1`, OR the loop margin `loopMargin` —
 * the combined COM's horizontal lead over the rear axle, m — is under `margin1`, full at `margin0`), faded out by
 * the lean: back from -`leanFull` to -`leanOff`, forward from `leanFwdFull` to `leanFwdOff` (the applied lean input, as
 * K_att reads it). Pure, memoryless.
 */
export function wheelieTrim(wc: TuningV2['engine']['wheelieControl'], w: number, frontComp: number, loopMargin: number, lean: number): number {
  if (wc.gain <= 0) return 0;
  const lf = lean < 0 ? (wc.leanOff + lean) / (wc.leanOff - wc.leanFull) : (wc.leanFwdOff - lean) / (wc.leanFwdOff - wc.leanFwdFull);
  const leanGate = lf < 0 ? 0 : lf > 1 ? 1 : lf;
  if (leanGate <= 0) return 0;
  const u = 1 - frontComp / wc.topOut;
  const unload = u < 0 ? 0 : u > 1 ? 1 : u;
  if (unload <= 0) return 0;
  const rr = (w - wc.rate0) / (wc.rate1 - wc.rate0);
  const rate = rr < 0 ? 0 : rr > 1 ? 1 : rr;
  const mm = (wc.margin1 - loopMargin) / (wc.margin1 - wc.margin0);
  const margin = mm < 0 ? 0 : mm > 1 ? 1 : mm;
  return wc.gain * leanGate * unload * (rate > margin ? rate : margin);
}
