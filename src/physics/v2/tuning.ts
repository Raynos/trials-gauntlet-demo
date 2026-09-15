/**
 * Physics v2 parameter table (docs/plans/physics-v2.md §13). One model, N bikes: the class rows below
 * change masses, thrust, gearing, wheelbase, spring rates and K_att; nothing in the solver reads the class.
 * Units SI. Chassis frame: origin at the chassis COM, x along the frame axis.
 */
import type { SurfaceKind, Vec2 } from '../../core/types';

export interface SuspensionV2 {
  /** Chassis-frame axle rest point (compression 0). */
  axle: Vec2;
  /** Chassis-frame unit direction the wheel moves when compressing. */
  axis: Vec2;
  travel: number;
  k: number;
  /** Metres of extra compression the spring is preloaded by. */
  preload: number;
  cComp: number;
  cReb: number;
  /** Cubic bump stop `kStop * max(0, c - stopStart*travel)^3 / travel^2` (§5). */
  kStop: number;
  stopStart: number;
}

export interface PoseRow {
  lean: number;
  /** Rider COM offset from the chassis COM, chassis frame. */
  x: number;
  y: number;
  /** Body angle relative to the chassis (0 = attack torso). */
  psi: number;
}

export interface TuningV2 {
  gravity: number;
  chassis: {
    mass: number;
    inertia: number;
    /** Chassis COM height above ground at zero compression, level. */
    comHeight: number;
    circles: { x: number; y: number; r: number }[];
    mu: number;
  };
  wheel: { radius: number; rearMass: number; rearInertia: number; frontMass: number; frontInertia: number; wheelbase: number };
  suspension: { rear: SuspensionV2; front: SuspensionV2 };
  tyre: {
    /** Brush stiffness, N per m/s of slip. */
    Cs: number;
    loadSens: number;
    rollRes: number;
    mu: Record<SurfaceKind, number>;
  };
  engine: {
    /** Peak rim thrust, N. */
    Fpeak: number;
    /** Rim-speed knots (m/s) and the thrust fraction at each; 0 beyond the last knot. */
    curveV: number[];
    curveF: number[];
    /** First-order throttle lag, s. */
    throttleTau: number;
    /** Engine braking torque fraction of Fpeak*r at |v| >= 5 m/s, off throttle. */
    engineBrake: number;
    idleRpm: number;
    limiterRpm: number;
    limiterResetRpm: number;
    /** rpm = omega_rear * gear * 60 / 2pi. */
    gear: number;
    /** Reported (audio only) slipping-clutch rpm at full throttle below `clutchSpeed`. */
    clutchRpm: number;
    clutchSpeed: number;
    /**
     * R4 Rookie assist (MEGA_PLAN P1 "Rookie = wheelie assist on, Pro = raw"): an ECU wheelie control. The drive
     * thrust is trimmed by `gain * unload * ramp(pitchRate, rate0 -> rate1)`, where `unload` ramps 0 -> 1 as the
     * front spring extends from `topOut` metres of compression to fully topped out (the front is leaving the
     * ground), OR by the loop margin (the live combined COM's horizontal lead over the rear axle, `margin1` -> `margin0`
     * m: gravity's righting moment about the rear axle is M g d, so d is the honest "about to loop" quantity on any
     * slope). Memoryless (this tick's chassis pitch rate, front compression and body positions), declared on the HUD
     * (`debug().engine.assist`), linear, the same on the ground and in the air (in the air the front is topped out
     * and the trim bounds the throttle's nose-up). `gain` 0 = raw (the Pro).
     */
    wheelieControl: { gain: number; rate0: number; rate1: number; topOut: number; /** Loop margin: the live combined COM ahead of the rear axle (m); the trim ramps 0 -> 1 from `margin1` down to `margin0` (the slow drift past the balance the rate term cannot see). */ margin0: number; margin1: number; /** The assist fades with the lean: full at lean >= -leanFull (back) / <= leanFwdFull (forward), off at lean <= -leanOff / >= leanFwdOff — leaning away from neutral is the rider taking over (the wheelie at -0.5..-1; the climb throw and hop snap at +1). Forward fades later: a rider a little forward on a ramp (+0.4) is still assisted. */ leanFull: number; leanOff: number; leanFwdFull: number; leanFwdOff: number };
  };
  brakes: { totalNm: number; frontFrac: number; brakeTau: number };
  aero: { cda: number; rho: number; chassisShare: number };
  rider: {
    mass: number;
    inertia: number;
    /** Pose table, ascending in lean; linear between rows (§9.1). */
    poses: PoseRow[];
    /** Rider COM relative to the hips in the body frame (§9.1: 0.03 ahead, 0.10 above). */
    comFromHips: Vec2;
    targetRateLin: number;
    targetRateAng: number;
    kp: number;
    kd: number;
    Fmax: number;
    /** Force-velocity of the servo (R2): the cap on |F| falls from F_max at zero closing speed to servoMinFrac * F_max at servoCloseV0 m/s. */
    servoCloseV0: number;
    servoMinFrac: number;
    /** R3 intent memory: the pose target's own travel, decaying with tau `servoIntentTau` s; at `servoIntentM` metres the closing cap is lifted to F_max. */
    servoIntentTau: number;
    servoIntentM: number;
    /**
     * R5 Rookie air limit: with BOTH wheels off the ground the pose target's travel rate falls from
     * `targetRateLin` / `targetRateAng` to `airRateLin` / `airRateAng` (a rider in the air has no ground reaction to
     * brace against; the 5 m/s hop throw is a grounded motion). The limit blends in and out over `airRateBlend` s
     * (one scalar of memory, `airLimit` in F, so a wheel touching never snaps the rate), and while it is in, the
     * target's creeping travel is not counted as intent (a rate-limited target cannot snap, so a landing out of a
     * limited flight keeps the R3 concentric cap). `airRateGain` 0 = raw (the Pro); `debug().rider.airLimited` prints
     * gain x blend.
     */
    airRateLin: number;
    airRateAng: number;
    airRateBlend: number;
    airRateGain: number;
    /**
     * R5: extra attitude damping (§9.4 `cAtt`, N m s/rad) while the air limit is in (blended by the same gain x blend
     * x (1 - intent)). 0 = the air is raw. Measured and NOT taken at 160 (physics.md v2 status R5): it meets the
     * held-lean rate targets but halves the throttle / brake air nudges, which the parent held fixed.
     */
    airCattAdd: number;
    kpsi: number;
    cpsi: number;
    tauMax: number;
    /** Axle-frame peg and grip points (the legs-line split, §9.3). */
    peg: Vec2;
    grip: Vec2;
    /** The declared attitude torque (§9.4). */
    Katt: number;
    cAtt: number;
    headRadius: number;
    torsoRadius: number;
  };
  solver: {
    velIters: number;
    posIters: number;
    slop: number;
    specMargin: number;
    /** Fraction of a penetration removed per position iteration. */
    posBeta: number;
    /** Ragdoll joints keep v1's Baumgarte (ragdoll "as v1"). */
    jointBaumgarte: number;
  };
  ragdoll: { sleepAfter: number; restitution: number; mu: number; spread: number; jointDamping: number; crashRearBrake: number; crashFrontBrake: number };
  drum: { density: number };
}

const ROOKIE: TuningV2 = {
  gravity: 9.81,
  chassis: {
    mass: 58,
    inertia: 11,
    comHeight: 0.55,
    circles: [
      { x: -0.05, y: -0.14, r: 0.1 }, // bash plate
      { x: -0.55, y: -0.12, r: 0.1 }, // tail
      { x: 0.55, y: -0.1, r: 0.1 }, // fork crown
      { x: 0.35, y: 0.38, r: 0.1 }, // bars
    ],
    mu: 0.5,
  },
  wheel: { radius: 0.34, rearMass: 8, rearInertia: 0.55, frontMass: 7, frontInertia: 0.45, wheelbase: 1.3 },
  suspension: {
    rear: { axle: { x: -0.585, y: -0.21 }, axis: { x: 0.12, y: 0.99 }, travel: 0.26, k: 10500, preload: 0.0, cComp: 650, cReb: 250, kStop: 250e3, stopStart: 0.85 },
    front: { axle: { x: 0.715, y: -0.215 }, axis: { x: -0.4, y: 0.92 }, travel: 0.24, k: 7500, preload: 0.02, cComp: 550, cReb: 250, kStop: 250e3, stopStart: 0.85 },
  },
  tyre: {
    Cs: 9000,
    loadSens: 0.12,
    rollRes: 0.012,
    mu: { dirt: 1.9, wood: 1.8, concrete: 2.0, rubber: 2.1, metal: 1.4, grate: 1.7, stone: 1.9, snow: 0.9 },
  },
  engine: {
    Fpeak: 880,
    // R3: a low-speed knot of 1.07 (940 N, 0.66 g) so the Rookie tops a 4 m 45 deg plank from a crawl (holding 45
    // deg is 0.71 g; the base gas carries the rest); the launch kick that turned that thrust into a neutral-lean
    // loop is filtered by the 0.15 s throttle (the Rookie's forgiving throttle; the Pro's is 0.06)
    curveV: [0, 3, 5, 8, 12, 17, 20],
    curveF: [1.07, 1.07, 1.0, 1.0, 0.7, 0.48, 0.35],
    throttleTau: 0.15,
    engineBrake: 0.06,
    idleRpm: 1500,
    limiterRpm: 10000,
    limiterResetRpm: 9500,
    gear: 17.8,
    clutchRpm: 3500,
    clutchSpeed: 7,
    wheelieControl: { gain: 1, rate0: 0.5, rate1: 1.2, topOut: 0.03, margin0: 0.2, margin1: 0.4, leanFull: 0.2, leanOff: 0.5, leanFwdFull: 0.6, leanFwdOff: 0.9 },
  },
  brakes: { totalNm: 560, frontFrac: 0.55, brakeTau: 0.03 },
  aero: { cda: 0.75, rho: 1.225, chassisShare: 0.6 },
  rider: {
    mass: 75,
    inertia: 9,
    poses: [
      // x column: the toy's (docs/research/toy-v2, riderTarget), which is what §10's ladder was measured
      // with; the printed §9.1 column (-0.44/-0.30/-0.15/-0.12/-0.09) puts d/h at neutral ON a_peak/g and
      // full gas at lean 0 becomes a coin flip between no lift and a 3 s loop (physics.md v2 status).
      // R3 measured and REJECTED two forward tables (physics.md v2 status R3): over the bars at +1 (x 0.42,
      // d/h 1.13, the 48 deg crawl geometry) turns the snap to +1 into a 1.3-1.5 m throw with a 0.36 m knife
      // between lean quanta and unloads the rear at +0.5; a moderate one (0 -> -0.06, +1 -> 0.24) still costs
      // the half-rate snap (55 -> 22 %) and the knife row (0.03 -> 0.07 m) for ~3 deg of crawl geometry the
      // climb bench cannot see (45 deg from a crawl tops on THIS table with the lift-then-throw technique).
      { lean: -1, x: -0.42, y: 0.37, psi: 0.17 },
      { lean: -0.5, x: -0.27, y: 0.5, psi: 0.08 },
      { lean: 0, x: -0.12, y: 0.62, psi: 0 },
      { lean: 0.5, x: -0.03, y: 0.65, psi: -0.12 },
      { lean: 1, x: 0.06, y: 0.67, psi: -0.24 },
    ],
    comFromHips: { x: 0.03, y: 0.1 },
    targetRateLin: 5.0,
    targetRateAng: 6.0,
    kp: 45000,
    kd: 4200,
    Fmax: 3200,
    // R3: ON, gated by intent. The concentric (closing) cap falls to 0.3 F_max = 960 N at 1 m/s of closing speed
    // while the pose target is still (a landing: the legs absorb, the 2-3 m drops ride away, R2's pogo loop is
    // gone); a target that has moved >= 5 cm in the last ~0.2 s (the hop's snap) lifts the cap back to F_max,
    // so the hop keeps its 0.47 m. R2 had the cap off because without the gate it halved the hop.
    servoCloseV0: 1.0,
    servoMinFrac: 0.3,
    servoIntentTau: 0.2,
    servoIntentM: 0.05,
    // R5: in free air the full -1 -> 0 pose release is a 0.5 s move (0.39 m at 0.8 m/s) instead of 0.08 s; the swing's
    // kick on the chassis falls 245 -> ~95 deg/s (physics.md v2 status R5). The blend is 0.1 s each way.
    airRateLin: 0.8,
    airRateAng: 1.0,
    airRateBlend: 0.1,
    airRateGain: 1,
    airCattAdd: 0,
    kpsi: 2500,
    cpsi: 180,
    tauMax: 300,
    peg: { x: -0.14, y: 0.02 },
    grip: { x: 0.27, y: 0.78 },
    // §13 initial 180 / 20 gave +16 / -22 deg of air authority in 0.5 s against the §14.2 band of 25-40;
    // 300 / 33 (K/c = 9 rad/s kept) meets it (physics.md v2 status)
    Katt: 300,
    cAtt: 33,
    headRadius: 0.15,
    torsoRadius: 0.13,
  },
  solver: { velIters: 6, posIters: 2, slop: 0.005, specMargin: 0.02, posBeta: 0.5, jointBaumgarte: 0.3 },
  ragdoll: { sleepAfter: 3.0, restitution: 0.15, mu: 0.6, spread: 0.3, jointDamping: 3, crashRearBrake: 1, crashFrontBrake: 0.5 },
  drum: { density: 60 },
};

/** The reference row = the Rookie (R3: R2's "mid" table is the Rookie baseline; the game's BikeClass has no mid). */
export const DEFAULT_TUNING_V2: Readonly<TuningV2> = Object.freeze(ROOKIE);

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };
export type PartialTuningV2 = DeepPartial<TuningV2>;

export function mergeTuningV2(base: Readonly<TuningV2>, over: PartialTuningV2 | undefined): TuningV2 {
  const out = structuredClone(base) as TuningV2;
  if (!over) return out;
  const merge = (dst: Record<string, unknown>, src: Record<string, unknown>): void => {
    for (const k of Object.keys(src)) {
      const v = src[k];
      const d = dst[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && d && typeof d === 'object' && !Array.isArray(d)) {
        merge(d as Record<string, unknown>, v as Record<string, unknown>);
      } else if (v !== undefined) {
        dst[k] = structuredClone(v);
      }
    }
  };
  merge(out as unknown as Record<string, unknown>, over as Record<string, unknown>);
  return out;
}

/** Bike classes are parameter rows (§13): the game's two garage bikes. 'rookie' is the reference row. */
export type BikeClassV2 = 'rookie' | 'pro';
export const BIKE_CLASSES_V2: readonly BikeClassV2[] = ['rookie', 'pro'];

/** gear such that `top` m/s at the limiter: rpm = v/r * gear * 60/2pi. */
const gearFor = (top: number): number => 10000 / ((top / 0.34) * (60 / (2 * Math.PI)));

export const BIKE_PRESETS_V2: Readonly<Record<BikeClassV2, PartialTuningV2>> = Object.freeze({
  rookie: {},
  // Pro (R3): raw. 4 kg lighter, 1 000 N (0.71 g at the knot), a 0.06 s throttle (the launch kick the Rookie
  // filters), K_att 260 (less attitude assist), stiffer springs, 21 m/s. Loops at neutral under full gas (1.1 s).
  pro: {
    chassis: { mass: 54 },
    wheel: { wheelbase: 1.28 },
    suspension: { rear: { axle: { x: -0.575, y: -0.21 }, k: 12000 }, front: { axle: { x: 0.705, y: -0.215 }, k: 9000 } },
    engine: { Fpeak: 1000, curveV: [0, 3, 5, 8, 12.6, 17.85, 21], curveF: [1.0, 1.0, 1.0, 1.0, 0.7, 0.48, 0.35], throttleTau: 0.08, gear: gearFor(21), wheelieControl: { gain: 0, rate0: 0.5, rate1: 1.2, topOut: 0.03, margin0: 0.2, margin1: 0.4, leanFull: 0.2, leanOff: 0.5, leanFwdFull: 0.6, leanFwdOff: 0.9 } },
    rider: { Katt: 260, cAtt: 29, airRateGain: 0, airCattAdd: 0 },
  },
});

export function bikeTuningV2(cls: BikeClassV2, over?: PartialTuningV2): TuningV2 {
  return mergeTuningV2(Object.freeze(mergeTuningV2(DEFAULT_TUNING_V2, BIKE_PRESETS_V2[cls])), over);
}
