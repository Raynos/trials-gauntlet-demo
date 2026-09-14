/**
 * Physics v2 parameter table (docs/design/physics-v2.md §13). One model, N bikes: the class rows below
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

const MID: TuningV2 = {
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
    curveV: [0, 4, 8, 12, 17, 20],
    curveF: [0.85, 1.0, 1.0, 0.7, 0.48, 0.35],
    throttleTau: 0.04,
    engineBrake: 0.06,
    idleRpm: 1500,
    limiterRpm: 10000,
    limiterResetRpm: 9500,
    gear: 17.8,
    clutchRpm: 3500,
    clutchSpeed: 7,
  },
  brakes: { totalNm: 560, frontFrac: 0.55, brakeTau: 0.03 },
  aero: { cda: 0.75, rho: 1.225, chassisShare: 0.6 },
  rider: {
    mass: 75,
    inertia: 9,
    poses: [
      // x column: the toy's (docs/research/toy-v2, riderTarget), which is what §10's ladder was measured
      // with; the printed §9.1 column (-0.44/-0.30/-0.15/-0.12/-0.09) puts d/h at neutral ON a_peak/g and
      // full gas at lean 0 becomes a coin flip between no lift and a 3 s loop (physics.md v2 status)
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
    // R2: OFF (minFrac 1). A closing-speed cap tames the landing pogo (a 2 m flat drop at lean 0 rebounds 0.6 m,
    // 2.5-3 m loops) but the hop's push is the same motion (body closing on a target 0.3 m above it at 3-4 m/s)
    // and any cap that fixes the landing halves the hop; needs an intent signal - R3 (physics.md v2 status R2)
    servoCloseV0: 3.0,
    servoMinFrac: 1,
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

/** The reference ("mid") row: the numbers every FEEL row is stated for. */
export const DEFAULT_TUNING_V2: Readonly<TuningV2> = Object.freeze(MID);

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

/** Bike classes are parameter rows (§13). 'mid' is the reference row; 'rookie' / 'pro' are the shipped garage bikes. */
export type BikeClassV2 = 'rookie' | 'mid' | 'pro';
export const BIKE_CLASSES_V2: readonly BikeClassV2[] = ['rookie', 'mid', 'pro'];

/** gear such that `top` m/s at the limiter: rpm = v/r * gear * 60/2pi. */
const gearFor = (top: number): number => 10000 / ((top / 0.34) * (60 / (2 * Math.PI)));

export const BIKE_PRESETS_V2: Readonly<Record<BikeClassV2, PartialTuningV2>> = Object.freeze({
  mid: {},
  rookie: {
    chassis: { mass: 62 },
    wheel: { wheelbase: 1.32 },
    suspension: { rear: { axle: { x: -0.595, y: -0.21 } }, front: { axle: { x: 0.725, y: -0.215 } } },
    engine: { Fpeak: 780, curveV: [0, 4, 7, 12, 17, 20], curveF: [0.85, 1.0, 0.9, 0.62, 0.42, 0.3], gear: gearFor(18) },
    rider: { Katt: 250, cAtt: 28 },
  },
  pro: {
    chassis: { mass: 54 },
    wheel: { wheelbase: 1.28 },
    suspension: { rear: { axle: { x: -0.575, y: -0.21 }, k: 9500 }, front: { axle: { x: 0.705, y: -0.215 }, k: 8500 } },
    engine: { Fpeak: 1000, curveV: [0, 4, 8, 12.6, 17.85, 21], gear: gearFor(21) },
    rider: { Katt: 360, cAtt: 40 },
  },
});

export function bikeTuningV2(cls: BikeClassV2, over?: PartialTuningV2): TuningV2 {
  return mergeTuningV2(Object.freeze(mergeTuningV2(DEFAULT_TUNING_V2, BIKE_PRESETS_V2[cls])), over);
}
