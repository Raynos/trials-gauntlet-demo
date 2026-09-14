/**
 * Every feel number in one frozen object (CONTRACT.md §2.5: physics owns the
 * numbers). `createBikePhysics(hz, partial)` deep-merges over DEFAULT_TUNING.
 */
import type { SurfaceKind, Vec2 } from '../core/types';

export interface SuspensionTuning {
  /** Frame-local axle rest point at full extension (compression 0). */
  axle: Vec2;
  /** Frame-local unit compression direction (wheel moves this way when compressed). */
  axis: Vec2;
  travel: number;
  k: number;
  cComp: number;
  cReb: number;
  /** Spring preload expressed as metres of extra compression. */
  preload: number;
  /** Bump-stop stiffness engaged above stopStart*travel. */
  kStop: number;
  stopStart: number;
}

export interface BikeTuning {
  gravity: number;
  frame: {
    mass: number;
    inertia: number;
    /** Ride height of the frame COM above ground at zero compression, level. */
    comHeight: number;
    /** Collision circles in frame space (bash plate, bars ...), radius each. */
    circles: { x: number; y: number; r: number }[];
  };
  wheel: { radius: number; mass: number; inertiaRear: number; inertiaFront: number; wheelbase: number };
  suspension: { rear: SuspensionTuning; front: SuspensionTuning };
  tyre: {
    muPeak: number;
    /** |kappa| below which the tyre is at peak grip. */
    kappaPeak: number;
    /** Fraction of peak grip when fully sliding (|kappa| >= 1). */
    slideFrac: number;
    vRef: number;
    rollRes: number;
    grip: Record<SurfaceKind, number>;
  };
  engine: {
    idleRpm: number;
    /** Slipping auto-clutch holds at least this rpm under throttle at low wheel speed. */
    clutchRpm: number;
    limiterRpm: number;
    limiterResetRpm: number;
    peakTorqueNm: number;
    curve: [number, number][];
    gearRatio: number;
    efficiency: number;
    engineBrakeFrac: number;
    throttleRise: number;
    throttleFall: number;
  };
  brakes: {
    frontMaxNm: number;
    rearMaxNm: number;
    /** Front brake fades as the rear wheel unloads (rider modulating a stoppie); 0 disables. */
    antiEndo: number;
    /** Fraction of the front brake kept when the rear is fully unloaded (a stoppie is still possible). */
    antiEndoFloor: number;
    /** The rider caps the front brake so this fraction of the weight stays on the rear (feed-forward). */
    rearLoadMin: number;
    /** Brake input slew, 1/s (lever squeeze / release). */
    rise: number;
    fall: number;
  };
  rider: {
    mass: number;
    /** Frame-local neutral anchor of the rider COM. */
    anchor: Vec2;
    /**
     * Rider torso as a hidden angular momentum store: lean swings it by `swing` rad relative to
     * the frame through a torque-limited motor (a velocity constraint with a bang-bang optimal rate
     * profile: it never overshoots and frame rotation cannot pump it), so leaning in the air rotates
     * the bike (lean back = nose up) without inventing angular momentum. `maxRate` rad/s caps the
     * swing speed; `maxTorque` Nm caps the motor and therefore how fast the bike reacts.
     */
    torso: { inertia: number; swing: number; maxRate: number; maxTorque: number };
    /** Anchor drops by this * |lean| (sit back low / hang over the bars); forward has its own value. */
    leanCrouch: number;
    leanCrouchFwd: number;
    /** Leg stiffness / damping along frame-up (N/m, N s/m). */
    k: number;
    c: number;
    /** Fore-aft stiffness / damping (arms + braced legs: much stiffer than the legs' up-down). */
    kAlong: number;
    cAlong: number;
    /** Cap on the fore-aft brace force (N): the most the rider can push/pull along the bike. */
    shiftForce: number;
    kLanding: number;
    leanBack: number;
    leanFwd: number;
    leanRate: number;
    crouch: number;
    hopExtend: number;
    /** Leg actuator force during the hop push (N, rider up / frame down). */
    hopForce: number;
    /**
     * Frame-local x where the legs act on the bike while pushing/recovering in a hop (the pegs).
     * The neutral anchor is the rider COM; at full forward lean it sits almost over the front axle,
     * so a yank there lifts the front and leaves the rear behind. The pegs are where the feet are.
     */
    hopPegX: number;
    /** Rider spring stiffness while the legs are pushing (soft: the actuator does the work). */
    kPush: number;
    /** Seconds for the preload crouch to reach full depth (eased). */
    crouchTime: number;
    /** Fraction of the rider's weight the legs stop carrying while crouching into a preload (slack legs). */
    preloadSlack: number;
    /** Most the rider can pull the bike up toward himself outside a hop (arms on the bars), N. */
    armPull: number;
    /** Hard stop: the rider cannot rise more than this above the anchor (legs straight, feet on pegs). */
    legSlack: number;
    hopMaxForce: number;
    hopPreloadMin: number;
    hopPreloadMax: number;
    hopPushTime: number;
    hopRecoverTime: number;
    /** lean <= this (with throttle >= hopThrottle) starts a preload. */
    hopLeanBack: number;
    hopThrottle: number;
    /** lean rate (1/s) forward that fires the push out of preload. */
    hopSnapRate: number;
    tetherMax: number;
    ejectForce: number;
    headRadius: number;
    torsoRadius: number;
    /** Rider torso follows this fraction of frame pitch. */
    torsoFollow: number;
  };
  aero: { dragCoef: number };
  solver: { velocityIters: number; slop: number; baumgarte: number; jointBaumgarte: number; speculativeMargin: number };
  ragdoll: { sleepAfter: number; restitution: number; mu: number; spread: number };
  drum: { density: number };
}

const norm = (x: number, y: number): Vec2 => {
  const l = Math.sqrt(x * x + y * y);
  return { x: x / l, y: y / l };
};

const DEFAULTS: BikeTuning = {
  gravity: 9.81,
  frame: {
    mass: 56,
    inertia: 14.0,
    comHeight: 0.55,
    circles: [
      { x: -0.05, y: -0.3, r: 0.12 }, // bash plate
      { x: -0.55, y: -0.12, r: 0.1 }, // tail
      { x: 0.55, y: -0.1, r: 0.1 }, // front lower / fork crown
      { x: 0.35, y: 0.38, r: 0.1 }, // bars
    ],
  },
  wheel: { radius: 0.34, mass: 7, inertiaRear: 0.7, inertiaFront: 0.5, wheelbase: 1.3 },
  suspension: {
    rear: {
      axle: { x: -0.585, y: -0.21 },
      axis: norm(0.17, 0.985),
      travel: 0.22,
      k: 12000,
      cComp: 650,
      cReb: 1100,
      preload: 0.02,
      kStop: 60000,
      stopStart: 0.8,
    },
    front: {
      axle: { x: 0.715, y: -0.215 },
      axis: norm(-0.42, 0.91),
      travel: 0.2,
      k: 10500,
      cComp: 550,
      cReb: 950,
      preload: 0.02,
      kStop: 60000,
      stopStart: 0.8,
    },
  },
  tyre: {
    muPeak: 2.1,
    kappaPeak: 0.15,
    slideFrac: 0.92,
    vRef: 1.0,
    rollRes: 0.012,
    grip: { dirt: 1.0, wood: 0.95, metal: 0.75, concrete: 1.05, rubber: 1.1, grate: 0.9, stone: 1.0, snow: 0.5 },
  },
  engine: {
    idleRpm: 1500,
    clutchRpm: 3500,
    limiterRpm: 10000,
    limiterResetRpm: 9500,
    peakTorqueNm: 38,
    curve: [
      [1500, 0.68],
      [3500, 0.8],
      [5000, 0.85],
      [6500, 1.0],
      [8000, 0.95],
      [9500, 0.85],
      [10000, 0.8],
    ],
    gearRatio: 17.5,
    efficiency: 0.92,
    engineBrakeFrac: 0.08,
    throttleRise: 40,
    throttleFall: 60,
  },
  brakes: { frontMaxNm: 640, rearMaxNm: 500, antiEndo: 0.05, antiEndoFloor: 0.8, rearLoadMin: 0.05, rise: 30, fall: 40 },
  rider: {
    mass: 75,
    anchor: { x: 0.33, y: 0.38 },
    torso: { inertia: 20, swing: 1.5, maxRate: 7, maxTorque: 400 },
    leanCrouch: 0.2,
    leanCrouchFwd: 0.5,
    k: 6000,
    c: 740,
    kAlong: 20000,
    cAlong: 1800,
    shiftForce: 2000,
    kLanding: 40000,
    leanBack: 0.6,
    leanFwd: 0.73,
    leanRate: 6,
    crouch: 0.3,
    hopExtend: 0.15,
    hopForce: 3200,
    hopPegX: 0.08,
    kPush: 500,
    crouchTime: 0.25,
    preloadSlack: 0.85,
    armPull: 300,
    legSlack: 0.05,
    hopMaxForce: 3800,
    hopPreloadMin: 0.12,
    hopPreloadMax: 1.5,
    hopPushTime: 0.35,
    hopRecoverTime: 0.6,
    hopLeanBack: -0.5,
    hopThrottle: 0.3,
    hopSnapRate: 4,
    tetherMax: 0.5,
    ejectForce: 16000,
    headRadius: 0.15,
    torsoRadius: 0.13,
    torsoFollow: 0.5,
  },
  aero: { dragCoef: 3.2 },
  solver: { velocityIters: 8, slop: 0.005, baumgarte: 0.2, jointBaumgarte: 0.3, speculativeMargin: 0.02 },
  ragdoll: { sleepAfter: 3.0, restitution: 0.15, mu: 0.6, spread: 0.3 },
  drum: { density: 60 },
};

export const DEFAULT_TUNING: Readonly<BikeTuning> = Object.freeze(DEFAULTS);

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };
export type PartialTuning = DeepPartial<BikeTuning>;

export function mergeTuning(base: Readonly<BikeTuning>, over: PartialTuning | undefined): BikeTuning {
  const out = structuredClone(base) as BikeTuning;
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

export const SURFACES: readonly SurfaceKind[] = ['dirt', 'wood', 'metal', 'concrete', 'rubber', 'grate', 'stone', 'snow'];
