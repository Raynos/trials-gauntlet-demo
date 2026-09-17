/**
 * Physics v2 parameter table (docs/plans/physics-v2.md §13). One model, N bikes: the class rows below
 * change masses, thrust, gearing, wheelbase, spring rates and K_att; nothing in the solver reads the class.
 * Units SI. Chassis frame: origin at the chassis COM, x along the frame axis.
 */
import type { SurfaceKind, Vec2 } from '../../core/types';
import { atan2, cos, sin } from '../dmath';

/**
 * The bike glb's authored attachment frame (Astra, 405f894 `BIKE_GEOMETRY_V2`; on main it lived in
 * `src/render/hero/assetFrame.ts` as a description of the asset only). Coordinates are in the asset's reference
 * (axle) frame; `chassisToAxle` places that frame on the chassis COM. R8 Astra port: the solver is built from it
 * again - the rear wheel swings on `swingPivot` / `swingRadius` (a true circle, the swingarm's arc; before this the
 * rear moved on the straight axis (0.12, 0.99), a chord of that arc, and the wheel left the arm's end by up to
 * 27-37 mm over a golden - docs/tasks/blender-branch-merge.md merge #3) and the fork slides on `forkAxis` through
 * the asset's fork marker. Deviation from Astra: compression 0 (full droop) stays at the asset's reference axle
 * markers (main's rest axles, Rookie rear (-0.585, -0.21) exact), not `rearReferenceCompression` along the arc past
 * them, so the rest geometry, the spring rates and the static sag of R8 are kept and only the PATH changes.
 */
export const BIKE_GEOMETRY_V2 = {
  chassisToAxle: { x: 0.065, y: -0.21 },
  wheelbase: 1.3,
  rear: { x: -0.65, y: 0 },
  front: { x: 0.65, y: 0 },
  swingPivot: { x: -0.22, y: 0.1 },
  swingRadius: Math.sqrt(0.43 ** 2 + 0.1 ** 2),
  rearReferenceCompression: 0.07,
  frontReferenceCompression: 0.05,
  forkAxis: { x: -0.22 / Math.sqrt(0.22 ** 2 + 0.5 ** 2), y: 0.5 / Math.sqrt(0.22 ** 2 + 0.5 ** 2) },
} as const;

export interface SuspensionV2 {
  /** Chassis-frame axle rest point (compression 0). */
  axle: Vec2;
  /** Chassis-frame unit direction the wheel moves when compressing (for a hinge: the arc's tangent at compression 0). */
  axis: Vec2;
  /**
   * Rear wheel path as a true circle about the swingarm pivot (Astra, 405f894): compression is the arc length from
   * full droop (`droopAngle`, the arm's angle at compression 0); the wheel's chassis-frame centre is
   * `suspensionPoint()`. The slider's bilateral constraint becomes the arm's length, its travel limits act along the
   * tangent. Absent = a straight axis from `axle` along `axis`.
   */
  hinge?: { pivot: Vec2; radius: number; droopAngle: number };
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

/** Chassis-local wheel centre for a suspension coordinate (metres of fork / arc travel). Astra, 405f894. */
export function suspensionPoint(s: SuspensionV2, compression: number): Vec2 {
  if (s.hinge) {
    const angle = s.hinge.droopAngle - compression / s.hinge.radius;
    return { x: s.hinge.pivot.x + s.hinge.radius * cos(angle), y: s.hinge.pivot.y + s.hinge.radius * sin(angle) };
  }
  return { x: s.axle.x + s.axis.x * compression, y: s.axle.y + s.axis.y * compression };
}

/** The asset's swingarm as the rear suspension's hinge, in the chassis frame: pivot, arm length, droop at compression 0 = the reference axle. */
const REAR_HINGE = {
  pivot: { x: BIKE_GEOMETRY_V2.chassisToAxle.x + BIKE_GEOMETRY_V2.swingPivot.x, y: BIKE_GEOMETRY_V2.chassisToAxle.y + BIKE_GEOMETRY_V2.swingPivot.y },
  radius: BIKE_GEOMETRY_V2.swingRadius,
  droopAngle: atan2(BIKE_GEOMETRY_V2.rear.y - BIKE_GEOMETRY_V2.swingPivot.y, BIKE_GEOMETRY_V2.rear.x - BIKE_GEOMETRY_V2.swingPivot.x),
};

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
    /**
     * R10 reverse (ask 35; physics.md "Reverse"): Trials-style creep backwards. The brake held from (near) a
     * standstill with no throttle is reverse: after `engageS` of the gate holding (the applied brake > 0, throttle
     * 0, the rear wheel on the ground, the chassis' forward speed under `engageV`, the run not finished) the rear wheel is driven backwards by a speed governor - `gain` N per m/s of
     * error toward a target that ramps 0 -> -`vmax` over `rampS`, capped at +-`F` N at the rim (the same cap holds
     * the creep against a backward over-run) - and both calipers fade out with the same ramp (a locked front
     * cannot roll back). Throttle > 0 clears it at once; releasing the brake ramps the target back to 0 over
     * `rampS` (the governor stops the roll). Brake while moving forward is the brake, unchanged: the gate is
     * speed-gated, so a stop from speed is a stop, and only a hold past `engageS` after it is reverse. `engageS`
     * makes a tap a brake (the bot's 15-tick plan quantum, 0.125 s, is under it). The calipers come back as the
     * bike rolls back faster than the target, fully at 2 x `vmax`: downhill the brake is the reverse speed limiter.
     * One F slot (`reverseT`).
     */
    reverse: { vmax: number; engageV: number; engageS: number; rampS: number; F: number; gain: number };
    wheelieControl: { gain: number; rate0: number; rate1: number; topOut: number; /** Loop margin: the live combined COM ahead of the rear axle (m); the trim ramps 0 -> 1 from `margin1` down to `margin0` (the slow drift past the balance the rate term cannot see). */ margin0: number; margin1: number; /** The assist fades with the lean: full at lean >= -leanFull (back) / <= leanFwdFull (forward), off at lean <= -leanOff / >= leanFwdOff — leaning away from neutral is the rider taking over (the wheelie at -0.5..-1; the climb throw and hop snap at +1). Forward fades later: a rider a little forward on a ramp (+0.4) is still assisted. */ leanFull: number; leanOff: number; leanFwdFull: number; leanFwdOff: number; /** R6: trim multiplier with both wheels off the ground (Rookie 1: the assist bounds the throttle nose-up in the air; Pro 0: the air is raw). */ airGain: number };
  };
  brakes: {
    totalNm: number;
    frontFrac: number;
    brakeTau: number;
    /**
     * R8 Astra port (405f894 "rookie brake lift control"): the Rookie's front caliper is trimmed against rear lift
     * every velocity iteration from the live loads - the combined COM's lever behind the front contact patch
     * (gravity's righting moment) against the braking force's lever (the COM height above the patch), less what the
     * rear tyre already brakes, with a 10 % margin; the trim fades out with |lean| from 0.5 to 0.8 (a deliberate
     * full lean is the rider taking over: brake + lean +1 is still the stoppie). An ECU/ABS-like assist, like
     * `engine.wheelieControl`; the physics' own brace (`rider.brakeBrace`) is the rider moving back. Pro = 0.
     */
    liftControl: number;
    /** Seconds of nose-down pitch rate anticipated by the caliper trim (the rate term the static margin cannot see). */
    liftLookahead: number;
  };
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
    /**
     * R8 brake brace (the pose table's brake row): under braking the rider's mass moves back - the pose lean is
     * `lean - brakeBrace x brakeEff x (1 - max(0, lean))`, so a full brake at lean 0 is ridden from the -0.5 pose
     * (the neutral rider's 1.1 g of brake endos a 0.8 g stoppie threshold on the flat; the R13 b1 stranger's only
     * fault), while a forward lean keeps the deliberate stoppie (brake + lean +1 braces nothing). Continuous in both
     * inputs, and exactly 0 with both wheels off the ground (a brace reacts to the deceleration through the wheels;
     * the R4 / R5 air-brake nudges are untouched); the declared attitude torque, the ECU assist and the air gates
     * still read the raw lean. 0 = R7.
     */
    brakeBrace: number;
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
     * R6 preload gate (measured, see physics.md v2 status R6): the pose target's travel counts toward intent only
     * while the rider BODY sits at least this far behind the neutral pose (chassis-frame x, metres) - "an armed hop
     * needs the preload". 0 = R3 (all travel counts).
     */
    servoIntentBackM: number;
    /**
     * R7 settled gate: the pose target's travel counts toward intent only while the rider body is within this
     * distance (m) of its target - a snap starts from a settled body; a lean released while the body is still
     * sagged by a landing is absorption, repaid under the concentric cap. 0 = R3 (all travel counts).
     */
    servoIntentSettleM: number;
    /**
     * R7: the intent memory saturates at this much travel (m) - a gesture certifies F_max for a window of order
     * servoIntentTau after it ends, not for tau x ln(travel / servoIntentM) (a -1 -> 0 release is 0.39 m = 0.4 s of
     * F_max after a landing). 2 x servoIntentM leaves the R2 hop untouched (0.618 m at 1e9 / 4x / 2x; 0.596 at 1.5x).
     */
    servoIntentMaxM: number;
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
    /**
     * R8 hold envelope (physics.md v2 status R8): the rider's contact with the bike is not only the servo. Feet on
     * pegs and hands on grips are hard, one-sided limits solved as impulses with restitution 0 between the rider
     * body and the chassis, every velocity iteration: the hips stay within `legReach` of the pegs and above the
     * `seatY` line (chassis frame, m above the chassis COM: the seat under the rider) and behind the `tankX` line
     * (chassis frame, m ahead of the chassis COM: the tank / steering head the hips cannot pass), and the chest point
     * (`chest`, body frame from the COM) stays within `armReach` of the grip. `posBeta` = the fraction of a
     * penetration removed per tick. The two REACH limits are held by the hands and feet: the reach impulse averaged
     * over `gripTau` s (one F slot, `gripJ`) above `gripN` newtons is the hands leaving the grips - the thrown-rider
     * fault (`crashCause` 'thrown'). The two compression limits (seat, tank) never fault: a hard landing sits the
     * rider down.
     */
    hold: { legReach: number; armReach: number; /** R8 Astra port (405f894 `RIDER_ELBOW_MIN`, "an elbow stop removed singular poses"): the arm's minimum length, chest (shoulders) to grip, as a fifth one-sided limit - the elbows fold to 35 deg interior at most (145 deg of flexion), the hands push on the bars beyond that. 0 = off. */ armMin: number; /** R9: the elbow stop's blend-in above the grip line (chassis up, m): off with the chest at or below the bar, full this far above it; the arms push the body off the bars from above, they do not lift it from under them. */ armMinFade: number; seatY: number; tankX: number; chest: Vec2; posBeta: number; /** Coulomb friction on the seat and tank contacts (the knees clamp the bike; the body does not slide along the seat it is pressed onto). */ mu: number; gripN: number; gripTau: number };
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
    // R8 Astra port (405f894): the rear wheel on the asset's swingarm arc (rest axle (-0.585, -0.21) = the reference
    // marker, the arc's tangent there (-0.23, 0.97) - the old straight axis (0.12, 0.99) was a chord of this arc),
    // the front on the asset's fork line through its marker (0.715, -0.21) along forkAxis (-0.403, 0.915; was
    // (0.715, -0.215) / (-0.4, 0.92): 5 mm and 0.26 deg off the glb). Rates, travel, damping: R7's.
    rear: {
      axle: { x: BIKE_GEOMETRY_V2.chassisToAxle.x + BIKE_GEOMETRY_V2.rear.x, y: BIKE_GEOMETRY_V2.chassisToAxle.y + BIKE_GEOMETRY_V2.rear.y },
      axis: { x: sin(REAR_HINGE.droopAngle), y: -cos(REAR_HINGE.droopAngle) },
      hinge: { pivot: { ...REAR_HINGE.pivot }, radius: REAR_HINGE.radius, droopAngle: REAR_HINGE.droopAngle },
      travel: 0.26, k: 10500, preload: 0.0, cComp: 650, cReb: 250, kStop: 250e3, stopStart: 0.85,
    },
    front: {
      axle: { x: BIKE_GEOMETRY_V2.chassisToAxle.x + BIKE_GEOMETRY_V2.front.x, y: BIKE_GEOMETRY_V2.chassisToAxle.y + BIKE_GEOMETRY_V2.front.y },
      axis: { ...BIKE_GEOMETRY_V2.forkAxis },
      travel: 0.24, k: 7500, preload: 0.02, cComp: 550, cReb: 250, kStop: 250e3, stopStart: 0.85,
    },
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
    // R10 reverse: a walking-pace creep (Trials HD / Fusion back up at ~2-3 m/s). 450 N at the rim is 0.31 g on the
    // 148 kg Rookie - a gentle ramp that also holds the creep on a ~18 deg backward slope; engage after 0.2 s
    // (a tap is a brake), ramp 0.6 s; steeper than that the calipers come back and cap the roll near 2 x vmax.
    reverse: { vmax: 2.5, engageV: 0.3, engageS: 0.2, rampS: 0.6, F: 450, gain: 700 },
    wheelieControl: { gain: 1, rate0: 0.5, rate1: 1.2, topOut: 0.03, margin0: 0.2, margin1: 0.4, leanFull: 0.2, leanOff: 0.5, leanFwdFull: 0.6, leanFwdOff: 0.9, airGain: 1 },
  },
  brakes: { totalNm: 560, frontFrac: 0.55, brakeTau: 0.03, liftControl: 1, liftLookahead: 0.15 },
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
    brakeBrace: 0.5,
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
    servoIntentBackM: 0,
    servoIntentSettleM: 0.12,
    servoIntentMaxM: 0.1,
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
    // R8: leg 0.985 x (thigh 0.46 + shin 0.43) = the drawn chain's LEG_REACH; arm 0.62 = upper arm 0.32 + forearm 0.30
    // straight; seatY 0.20 = 6.6 cm under the hang-back hips (0.266), 0.32 m of leg travel under the neutral stance
    // (0.52); tankX 0.25 = 0.24 m ahead of the +1 hips (0.007), 8 cm behind the grip (0.33). chest = hips + 0.52 m of
    // torso at the canonical 40 deg, body frame. gripN 2500 N over 50 ms: a rider hangs on at 3.4 g of steady pull, and
    // is torn off by a 1.7 m/s snap of the reach (75 kg x 1.7 m/s / 0.05 s).
    // armMin: the anatomical 35 deg elbow is 0.144 m planar (3D 0.187 m with main's 0.32 / 0.30 arm, the 0.12 m grip-to-shoulder
    // side offset removed) but main's pose table already folds the neutral elbow to 52 deg (shoulders 0.245 m from the grip) and the
    // R2 snap to +1 swings the chest under 0.144 m: at 0.144 the stop cut the reference hop 0.596 -> 0.535 m and split the r5
    // hop on/off identity (0.535 / 0.556). 0.10 m = Astra's IK-singularity guard (the elbow pole flips at 0.152 m 3D = 0.093 m
    // planar): the hop and snap rows are untouched, the shoulders never pass through the bars (0.4 % of golden riding ticks,
    // slams; before, those ticks put the chest inside the grip point - the "collapses onto the tank" tell).
    // armMinFade 0.05 (R9): with the chest under the grip line the strut's push points down and, against the linear servo's pull
    // on the COM, forms a couple the 300 N m torque cap cannot break (x3 Pro 74-81 m: torso flat, 0.6 s); the stop is off at and
    // below the bar and full 5 cm above it - a front slam onto the bars from above is still caught, the tank collapse is R8's.
    hold: { legReach: 0.876, armReach: 0.62, armMin: 0.1, armMinFade: 0.05, seatY: 0.2, tankX: 0.25, chest: { x: 0.368, y: 0.234 }, posBeta: 0.4, mu: 0.8, gripN: 2500, gripTau: 0.05 },
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
  // Pro (R3): raw. 4 kg lighter, 1 000 N (0.71 g at the knot), a 0.08 s throttle (the launch kick the Rookie
  // filters), K_att 260 (less attitude assist), stiffer springs, 21 m/s. R6: the R4 ECU trim on the GROUND (same
  // margins / rates / lean fade as the Rookie; `airGain` 0 keeps the air raw): plain gas from a standstill at lean 0
  // lifts to ~32 deg and rides a 16-32 deg power wheelie down at 14 m/s instead of looping in 0.95 s (harness r11:
  // every Pro stranger lost its first attempt at 4 m); full gas at lean <= -0.25 still loops (0.56 / 0.66 / 1.35 s
  // at -1 / -0.5 / -0.25). No open-loop lever gives "lifts hard, does not loop": the thrust curve is a knife edge
  // (F(4-8) 0.85 loops at 1.0 s, 0.80 lifts 8 deg) and a speed fade of the trim loops at the release (R6 status).
  pro: {
    brakes: { liftControl: 0 },
    chassis: { mass: 54 },
    // R8 Astra port: one asset, one geometry - the Pro rides the same swingarm arc and fork line (wheelbase 1.30;
    // R3's 1.28 put its axles 1.0 / 1.1 cm inboard of the glb's markers and its rear 37 mm off the arm's end).
    suspension: { rear: { k: 12000 }, front: { k: 9000 } },
    engine: { Fpeak: 1000, curveV: [0, 3, 5, 8, 12.6, 17.85, 21], curveF: [1.0, 1.0, 1.0, 1.0, 0.7, 0.48, 0.35], throttleTau: 0.08, gear: gearFor(21), reverse: { vmax: 3, engageV: 0.3, engageS: 0.2, rampS: 0.5, F: 500, gain: 800 }, wheelieControl: { gain: 1, rate0: 0.5, rate1: 1.2, topOut: 0.03, margin0: 0.2, margin1: 0.4, leanFull: 0.2, leanOff: 0.5, leanFwdFull: 0.6, leanFwdOff: 0.9, airGain: 0 } },
    rider: { Katt: 260, cAtt: 29, airRateGain: 0, airCattAdd: 0 },
  },
});

export function bikeTuningV2(cls: BikeClassV2, over?: PartialTuningV2): TuningV2 {
  return mergeTuningV2(Object.freeze(mergeTuningV2(DEFAULT_TUNING_V2, BIKE_PRESETS_V2[cls])), over);
}
