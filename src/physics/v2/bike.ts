/**
 * Physics v2 world (docs/plans/physics-v2.md). Bike + rigid rider, 120 Hz semi-implicit Euler,
 * sequential impulses (6 velocity + 2 split-impulse position iterations), speculative contacts, no
 * warm starting, no Baumgarte in the velocity pass. Implements PhysicsWorld (CONTRACT §2.3) with v1's
 * determinism substrate: every mutable scalar lives in `F` (Float64Array) / `U` (Uint8Array), SoA
 * bodies, dmath transcendentals, fixed iteration counts and order.
 *
 * Bodies: 0 chassis, 1 rear wheel, 2 front wheel, 3 rider (rigid body, servoed to a pose target),
 * 4..10 ragdoll (head torso pelvis upperArm forearm thigh shin; v1's), then one pinned body per seesaw,
 * then one per rolling drum.
 *
 * Cross-tick state (§12), all of it: the `S_*` / `U_*` slots below. `snapshot.test.ts` asserts the list.
 */
import type { CompiledTrack, FaultReason, GameEvent, InputFrame, PhysicsSnapshot, PhysicsState, RagdollBody, RiderBody, SurfaceKind, Vec2 } from '../../core/types';
import { Rng } from '../../core/rng';
import type { PhysicsWorld } from '../index';
import { CollisionWorld, circleVsPrim, PrimKind, type Manifold, type Prim } from '../collision';
import { SURFACES } from '../tuning';
import { atan2, clamp, cos, sin, wrapAngle, HALF_PI } from '../dmath';
import { bikeTuningV2, suspensionPoint, type BikeClassV2, type PartialTuningV2, type SuspensionV2, type TuningV2 } from './tuning';
import { driveTorque, lag, limiterLatch, reportRpm, thrustFrac, wheelieTrim } from './engine';
import { brushImpulse, tyreMu } from './tyre';
import { advanceTarget, buildChain, canonicalPose, drawnBody, GRIP_X, GRIP_Y, leanFromX, PEG_X, PEG_Y, poseAt, type ChainOut } from './rider';

// ---------------------------------------------------------------------------
// Public extras
// ---------------------------------------------------------------------------

export type HopPhase = PhysicsState['hopPhase'];

export interface LoadTrackOptionsV2 {
  bike?: BikeClassV2;
}

export interface BodyDebug {
  pos: Vec2;
  vel: Vec2;
  angle: number;
  angVel: number;
}

export interface PhysicsDebugV2 {
  bodies: ({ id: string } & BodyDebug)[];
  contacts: { body: string; point: Vec2; normal: Vec2; lambdaN: number; lambdaT: number; mu: number; surface: SurfaceKind }[];
  engine: { rpm: number; torqueNm: number; thrustN: number; limiter: boolean; throttleEff: number; brakeEff: number; /** R4: wheelie-control thrust trim 0..1 (Rookie assist; 0 on the Pro). */ assist: number };
  /** R8 Astra port: the brake torques applied this tick (N m) and the front caliper's lift-control trim 0..1 (Rookie assist; 0 on the Pro). */
  brakes: { rearTorqueNm: number; frontTorqueNm: number; assist: number };
  suspension: { rear: { compression: number; rate: number; force: number }; front: { compression: number; rate: number; force: number } };
  /** The rider rigid body (the spec's additive `PhysicsState.rider.body` request, on debug() until core adds the type). */
  rider: { body: BodyDebug; servoForce: Vec2; servoTorque: number; poseTargetWorld: Vec2; lag: Vec2; /** hips -> pegs distance (m) and the force-length fraction of F_max it allows (R2) */ legLen: number; legFrac: number; /** R3: the intent memory 0..1 (1 = the pose target moved >= servoIntentM in the last ~servoIntentTau) */ intent: number; /** R5: the air rate limit in effect, gain x blend 0..1 (Rookie: 1 after 0.1 s with both wheels off the ground; Pro 0). */ airLimited: number; /** R8 hold envelope: this tick's constraint impulses (N s) on the four one-sided limits and the grip force they imply (`gripJ` / gripTau, N; a fault above hold.gripN) */ hold: { legJ: number; armJ: number; seatJ: number; tankJ: number; /** R8 Astra port: the elbow stop's impulse (the arm's minimum length) */ elbowJ: number; gripF: number } };
  /** The declared attitude torque applied this tick (N m). */
  attTorque: number;
  /** Pose target in the chassis frame. */
  poseTarget: { x: number; y: number; psi: number };
  /** Combined COM ahead of / above the rear contact, live. */
  comDH: { d: number; h: number };
  balancePitch: number;
  riderChain: { hips: Vec2; shoulders: Vec2; head: Vec2; elbow: Vec2; hand: Vec2; knee: Vec2; foot: Vec2; torsoDir: Vec2; headDir: Vec2 };
  crashCause: 'sensor' | 'thrown' | 'oob' | 'hazard' | null;
  /** R6 (physics.md §8.1): true when the run faulted in the tick the front wheel crossed the finish line with the wheel no more than one radius past it - the crossing did not count (no `finish` event, `finishTime` null). */
  finishVoided: boolean;
}

export interface TeleportPose {
  /** Rear wheel centre. */
  pos: Vec2;
  angle: number;
  vel?: Vec2;
  angVel?: number;
}

export interface BikePhysicsWorldV2 extends PhysicsWorld {
  readonly tuning: Readonly<TuningV2>;
  readonly bike: BikeClassV2;
  loadTrack(track: CompiledTrack, seed: number, opts?: LoadTrackOptionsV2): void;
  debug(): PhysicsDebugV2;
  /** Wheelie balance pitch (rad) for a lean (pose table) and an assumed longitudinal acceleration. */
  balancePitch(lean: number, accel?: number): number;
  teleport(pose: TeleportPose): void;
  /** Static combined COM geometry at a lean (d ahead of the rear contact, h above ground). */
  comDH(lean: number): { d: number; h: number };
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const CHASSIS = 0;
const REAR = 1;
const FRONT = 2;
const RIDER = 3;
const RAG0 = 4;
const NRAG = 7;
const FIRST_DYN = RAG0 + NRAG; // 11

const RAG_IDS: RagdollBody['id'][] = ['head', 'torso', 'pelvis', 'upperArm', 'forearm', 'thigh', 'shin'];

/** Cross-tick scalars (physics-v2.md §12). Exported for the no-hidden-state test. */
export const F_SLOTS = [
  'tick',
  'time',
  'checkpoint',
  'finishTime',
  'throttleEff',
  'brakeEff',
  'targetX',
  'targetY',
  'targetPsi',
  'rearComp',
  'frontComp',
  'rearAir',
  'frontAir',
  'rng0',
  'rng1',
  'rng2',
  'rng3',
  'seed',
  'crashT',
  'ragRest0',
  'ragRest1',
  'ragRest2',
  'ragRest3',
  'ragRest4',
  'ragRest5',
  'prevRearX',
  'prevRearY',
  'prevFrontX',
  'prevFrontY',
  'inThrottle',
  'inBrake',
  'inLean',
  'rearSlip',
  'targetMove',
  'airLimit',
  'leanEdgeAir',
  'gripJ',
] as const;
const S_TICK = 0;
const S_TIME = 1;
const S_CHECKPOINT = 2;
const S_FINISH_TIME = 3; // NaN = null
const S_THROTTLE_EFF = 4;
const S_BRAKE_EFF = 5;
const S_TGT_X = 6;
const S_TGT_Y = 7;
const S_TGT_PSI = 8;
const S_REAR_COMP = 9; // output (0..1), read by the next derive() for the hopPhase 'preload' edge
const S_FRONT_COMP = 10; // output (0..1)
const S_REAR_AIR = 11; // air-tick counters: `land` events and the derived hopPhase only
const S_FRONT_AIR = 12;
const S_RNG = 13; // 4 slots
const S_SEED = 17;
const S_CRASH_T = 18;
const S_RAG_REST = 19; // 6 slots
const S_PREV_RX = 25; // wheel centres at the previous collide (one-way side test)
const S_PREV_RY = 26;
const S_PREV_FX = 27;
const S_PREV_FY = 28;
const S_IN_T = 29; // the applied (quantised) input
const S_IN_B = 30;
const S_IN_L = 31;
const S_REAR_SLIP = 32; // output
const S_TGT_MOVE = 33; // R3 intent: decaying memory (tau servoIntentTau) of the pose target's own travel, metres
const S_AIR_LIMIT = 34; // R5 air limit blend 0..1 (both wheels off the ground, +-dt/airRateBlend per tick)
const S_LEAN_EDGE_AIR = 35; // R7: 1 when the last lean edge was made with both wheels off the ground (its travel earns no intent once a wheel is down)
const S_GRIP_J = 36; // R8: the reach-limit (hands + feet) impulse, N s, averaged over hold.gripTau (exponential memory); / gripTau > gripN = thrown
export const NSCALAR = F_SLOTS.length; // 37

/** Flags (physics-v2.md §12). */
export const U_SLOTS = ['finished', 'fault', 'limiter', 'restartLatch', 'rearGround', 'frontGround', 'rearSurface', 'frontSurface', 'ragdoll', 'asleep', 'crashPending', 'crashCause', 'hopPhase', 'finishVoid'] as const;
const U_FINISHED = 0;
const U_FAULT = 1; // 0 none, 1 crash, 2 oob, 3 restart, 4 timeout, 5 hazard
const U_LIMITER = 2;
const U_RESTART_LATCH = 3;
const U_REAR_GND = 4;
const U_FRONT_GND = 5;
const U_REAR_SURF = 6; // 0 none else idx+1
const U_FRONT_SURF = 7;
const U_RAGDOLL = 8;
const U_ASLEEP = 9;
const U_CRASH_PENDING = 10; // written and read inside one step (collide -> derive)
const U_CRASH_CAUSE = 11; // 1 sensor, 2 thrown (R8), 4 oob, 5 hazard
const U_HOP = 12; // derived output: 0 idle 1 preload 2 push 3 recover
const U_FINISH_VOID = 13; // R6 physics.md §8.1: 1 when a fault in the crossing tick (front wheel <= R past the line) voided the finish
export const NU = U_SLOTS.length; // 14

const FAULTS: (FaultReason | null)[] = [null, 'crash', 'out-of-bounds', 'restart', 'timeout', 'hazard'];
const HOPS: HopPhase[] = ['idle', 'preload', 'push', 'recover'];
const CAUSES: PhysicsDebugV2['crashCause'][] = [null, 'sensor', 'thrown', null, 'oob', 'hazard'];

const MAX_CONTACTS = 128;
const EMPTY_SEESAWS: PhysicsState['seesaws'] = Object.freeze([]) as unknown as PhysicsState['seesaws'];
const EMPTY_DRUMS: PhysicsState['drums'] = Object.freeze([]) as unknown as PhysicsState['drums'];
const WHEEL_BODIES = [REAR, FRONT];
/** hopPhase 'recover' window after both wheels leave (§16.1), ticks at 120 Hz. */
const RECOVER_TICKS = 48;

interface RagLimb {
  len: number;
  r: number;
  mass: number;
}
const RAG_LIMBS: RagLimb[] = [
  { len: 0, r: 0.12, mass: 5 },
  { len: 0.4, r: 0.13, mass: 30 },
  { len: 0.2, r: 0.12, mass: 12 },
  { len: 0.26, r: 0.06, mass: 5 },
  { len: 0.28, r: 0.05, mass: 3 },
  { len: 0.46, r: 0.08, mass: 12 },
  { len: 0.42, r: 0.06, mass: 8 },
];
const RAG_JOINTS: [number, number, number, number, number][] = [
  [1, 0, 0.26, -0.22, 0.7],
  [1, 2, -0.26, 0.1, 0.6],
  [1, 3, 0.26, 0.13, 2.5],
  [3, 4, -0.13, 0.14, 1.6],
  [2, 5, -0.1, 0.23, 1.4],
  [5, 6, -0.23, 0.21, 1.4],
];

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

class WorldV2 implements BikePhysicsWorldV2 {
  readonly physicsHz: number;
  private _tuning: Readonly<TuningV2>;
  private readonly override: PartialTuningV2 | undefined;
  private _bike: BikeClassV2 = 'rookie';
  private readonly dt: number;
  private g: number;

  private track: CompiledTrack | null = null;
  private col: CollisionWorld | null = null;
  private nBodies = FIRST_DYN;
  private nSeesaw = 0;
  private nDrum = 0;

  private F = new Float64Array(NSCALAR + 8 * FIRST_DYN);
  private U = new Uint8Array(NU);
  private px!: Float64Array;
  private py!: Float64Array;
  private vx!: Float64Array;
  private vy!: Float64Array;
  private an!: Float64Array;
  private av!: Float64Array;
  private im!: Float64Array;
  private ii!: Float64Array;

  // per-tick scratch: everything here is written in the same step() before it is read
  private events: GameEvent[] = [];
  private nC = 0;
  private readonly cA = new Int32Array(MAX_CONTACTS);
  private readonly cB = new Int32Array(MAX_CONTACTS);
  private readonly cSurf = new Int32Array(MAX_CONTACTS);
  private readonly cWheel = new Int8Array(MAX_CONTACTS);
  private readonly cPx = new Float64Array(MAX_CONTACTS);
  private readonly cPy = new Float64Array(MAX_CONTACTS);
  private readonly cNx = new Float64Array(MAX_CONTACTS);
  private readonly cNy = new Float64Array(MAX_CONTACTS);
  private readonly cRAx = new Float64Array(MAX_CONTACTS);
  private readonly cRAy = new Float64Array(MAX_CONTACTS);
  private readonly cRBx = new Float64Array(MAX_CONTACTS);
  private readonly cRBy = new Float64Array(MAX_CONTACTS);
  private readonly cMassN = new Float64Array(MAX_CONTACTS);
  private readonly cMassT = new Float64Array(MAX_CONTACTS);
  private readonly cVnMin = new Float64Array(MAX_CONTACTS);
  private readonly cMuBase = new Float64Array(MAX_CONTACTS);
  private readonly cMu = new Float64Array(MAX_CONTACTS);
  private readonly cLn = new Float64Array(MAX_CONTACTS);
  private readonly cLt = new Float64Array(MAX_CONTACTS);
  private readonly cSep0 = new Float64Array(MAX_CONTACTS);
  // body poses at collide time (the position pass linearises the separation about them)
  private p0x = new Float64Array(FIRST_DYN);
  private p0y = new Float64Array(FIRST_DYN);
  private a0 = new Float64Array(FIRST_DYN);
  // suspension scratch per wheel (0 rear, 1 front)
  private readonly sAx = new Float64Array(2);
  private readonly sAy = new Float64Array(2);
  private readonly sNx = new Float64Array(2);
  private readonly sNy = new Float64Array(2);
  private readonly sComp = new Float64Array(2);
  private readonly sPerp = new Float64Array(2);
  private readonly sRate = new Float64Array(2);
  private readonly sForce = new Float64Array(2);
  private readonly sLimLo = new Float64Array(2);
  private readonly sLimHi = new Float64Array(2);
  private readonly sBrake = new Float64Array(2);
  private readonly ragLambda = new Float64Array(RAG_JOINTS.length * 3);
  private seesawLambda = new Float64Array(0);
  private readonly rng = new Rng(0);
  // debug scratch of the last force pass
  private dEngineTq = 0;
  private dAssist = 0;
  private dBrakeAssist = 0;
  private dThrust = 0;
  private dServoFx = 0;
  private dServoFy = 0;
  private dServoTq = 0;
  private dLegLen = 0;
  private dLegFrac = 1;
  private dIntent = 0;
  // R8 hold envelope: accumulated impulses this tick (leg reach, arm reach, seat, tank)
  private readonly holdLam = new Float64Array(5);
  // seat / tank friction impulses (Coulomb, hold.mu x the normal impulse)
  private readonly holdLamT = new Float64Array(5);
  // this tick's air limit (gain x blend x (1 - intent)), derived in step() from F; read by forces() and debug()
  private airLim = 0;
  private dAtt = 0;
  private dTgtWx = 0;
  private dTgtWy = 0;

  // query scratch
  private qBody = 0;
  private qCx = 0;
  private qCy = 0;
  private qR = 0;
  private qWheel = 0;
  private qRag = false;
  private qSensor = false;
  private qSensorHit = false;
  private readonly onManifold = (m: Manifold): void => this.addContact(m);
  private readonly bodyAngle = (b: number): number => this.an[b]!;

  private readonly chain: ChainOut = { x: new Float64Array(7), y: new Float64Array(7), dx: 0, dy: 1, hx: 0, hy: 1, hipAx: 0, hipAy: 0 };
  private readonly poseTmp = { x: 0, y: 0, psi: 0 };
  private readonly poseTmp2 = { x: 0, y: 0, psi: 0 };
  private axleOrgX = 0;
  private axleOrgY = 0;

  constructor(physicsHz: number, tuning: PartialTuningV2 | undefined) {
    this.physicsHz = physicsHz;
    this.dt = 1 / physicsHz;
    this.override = tuning;
    this._tuning = Object.freeze(bikeTuningV2('rookie', tuning));
    this.g = this._tuning.gravity;
    this.axleOrigin();
    this.bindViews();
  }

  get tuning(): Readonly<TuningV2> {
    return this._tuning;
  }

  get bike(): BikeClassV2 {
    return this._bike;
  }

  private selectBike(cls: BikeClassV2): void {
    if (cls === this._bike && this.track !== null) return;
    this._bike = cls;
    this._tuning = Object.freeze(bikeTuningV2(cls, this.override));
    this.g = this._tuning.gravity;
    this.axleOrigin();
  }

  private bindViews(): void {
    const n = this.nBodies;
    const b = NSCALAR;
    this.px = this.F.subarray(b, b + n);
    this.py = this.F.subarray(b + n, b + 2 * n);
    this.vx = this.F.subarray(b + 2 * n, b + 3 * n);
    this.vy = this.F.subarray(b + 3 * n, b + 4 * n);
    this.an = this.F.subarray(b + 4 * n, b + 5 * n);
    this.av = this.F.subarray(b + 5 * n, b + 6 * n);
    this.im = this.F.subarray(b + 6 * n, b + 7 * n);
    this.ii = this.F.subarray(b + 7 * n, b + 8 * n);
  }

  // -- PhysicsWorld ---------------------------------------------------------

  loadTrack(track: CompiledTrack, seed: number, opts?: LoadTrackOptionsV2): void {
    this.selectBike(opts?.bike ?? 'rookie');
    this.track = track;
    this.col = new CollisionWorld(track, FIRST_DYN);
    this.nSeesaw = this.col.seesawBodies.length;
    this.nDrum = this.col.drumBodies.length;
    this.nBodies = FIRST_DYN + this.nSeesaw + this.nDrum;
    this.F = new Float64Array(NSCALAR + 8 * this.nBodies);
    this.U = new Uint8Array(NU);
    this.p0x = new Float64Array(this.nBodies);
    this.p0y = new Float64Array(this.nBodies);
    this.a0 = new Float64Array(this.nBodies);
    this.seesawLambda = new Float64Array(this.nSeesaw * 2);
    this.bindViews();
    this.F[S_SEED] = seed >>> 0;
    this.reset(-1);
  }

  reset(checkpoint: number): void {
    const track = this.requireTrack();
    const seed = this.F[S_SEED]!;
    this.F.fill(0);
    this.U.fill(0);
    this.F[S_SEED] = seed;
    this.F[S_CHECKPOINT] = checkpoint;
    this.F[S_FINISH_TIME] = Number.NaN;
    this.rng.reseed((seed ^ Math.imul(checkpoint + 2, 0x9e3779b9)) >>> 0);
    this.saveRng();
    this.setupMasses();
    this.setupDynamicColliders();
    const spawn = checkpoint >= 0 ? track.def.checkpoints[checkpoint]?.spawn ?? track.def.start : track.def.start;
    const a = spawn.angle;
    const R = this.tuning.wheel.radius;
    this.placeBike(spawn.pos.x - sin(a) * R, spawn.pos.y + cos(a) * R, a, 0, 0, 0);
    this.events.push({ type: 'restart', checkpoint, tick: 0 });
  }

  step(input: InputFrame): void {
    this.requireTrack();
    const F = this.F;
    const U = this.U;
    const dt = this.dt;

    // 0 restart edge
    if (input.restart && U[U_RESTART_LATCH] === 0) {
      U[U_RESTART_LATCH] = 1;
      const cp = F[S_CHECKPOINT]!;
      this.events.push({ type: 'fault', reason: 'restart', tick: F[S_TICK]!, time: F[S_TIME]! });
      this.reset(cp);
      this.U[U_RESTART_LATCH] = 1;
      return;
    }
    if (!input.restart) U[U_RESTART_LATCH] = 0;

    // 1 input (already quantised by the caller; stored as applied)
    const leanEdge = F[S_IN_L] !== input.lean;
    F[S_IN_T] = input.throttle;
    F[S_IN_B] = input.brake;
    F[S_IN_L] = input.lean;

    if (U[U_ASLEEP] === 1) {
      F[S_TICK] = F[S_TICK]! + 1;
      F[S_TIME] = F[S_TICK]! * dt;
      this.advanceRng();
      return;
    }

    const riding = U[U_FAULT] === 0;
    if (riding) {
      const t = this.tuning;
      F[S_THROTTLE_EFF] = lag(F[S_THROTTLE_EFF]!, input.throttle, t.engine.throttleTau, dt);
      F[S_BRAKE_EFF] = lag(F[S_BRAKE_EFF]!, input.brake, t.brakes.brakeTau, dt);
      // 2 pose target (reads F only). R5 air limit: with both wheels off the ground (last derive's air counters)
      // the target's travel rate blends over airRateBlend s from the ground rates to the air rates; a rider in the
      // air has nothing to brace the 5 m/s hop throw against, and the throw's reaction on the chassis (F_max x the
      // grip lever / I_c, 43 deg/s per tick) was the round-8 "air kick". Continuous both ways; gain 0 = raw (Pro).
      // A throw already in flight carries through: the limit is gated by (1 - intent), the R3 memory of the target's
      // own travel, so a hop's snap that is still ramping when the wheels leave finishes at the ground rate (a rider
      // who was braced when he started the throw), while a lean pressed in free air (the target still, intent 0)
      // is limited from its first tick. Intent is earned on the ground only (below): in the air the memory decays,
      // so the limit cannot talk itself down through the travel it allows.
      const r = t.rider;
      const bothAir = F[S_REAR_AIR]! > 0 && F[S_FRONT_AIR]! > 0 ? 1 : 0;
      const dLim = dt / r.airRateBlend;
      F[S_AIR_LIMIT] = clamp(bothAir, F[S_AIR_LIMIT]! - dLim, F[S_AIR_LIMIT]! + dLim);
      const lim = r.airRateGain * F[S_AIR_LIMIT]! * (1 - clamp(F[S_TGT_MOVE]! / r.servoIntentM, 0, 1));
      this.airLim = lim;
      // R8 brake brace: the rider's mass moves back under braking (the pose table's brake row); a forward lean
      // braces nothing, so brake + lean forward is still the stoppie. Reads the lagged brake so a tap is continuous.
      // A brace is a reaction to the deceleration through the wheels: with both wheels off the ground there is none,
      // and the brace is exactly 0 (the R4 / R5 air-brake nudges stay the declared air control, identical per class).
      const poseLean = input.lean - r.brakeBrace * F[S_BRAKE_EFF]! * (1 - Math.max(0, input.lean)) * (1 - bothAir);
      advanceTarget(r, dt, F[S_TGT_X]!, F[S_TGT_Y]!, F[S_TGT_PSI]!, poseLean, this.poseTmp, r.targetRateLin + (r.airRateLin - r.targetRateLin) * lim, r.targetRateAng + (r.airRateAng - r.targetRateAng) * lim);
      // intent (R3): how far the target itself has travelled lately. A rider who is MOVING his pose (the hop's
      // snap) may push at F_max whichever way the gap is closing; a rider holding a pose (a landing) has only the
      // concentric cap (servoMinFrac at servoCloseV0) on the way back up, so the legs absorb instead of pogoing.
      // R5 (Rookie, gain 1): travel with both wheels off the ground does not count - a rate-limited target cannot
      // snap, and a landing out of a limited flight keeps the cap. The Pro (gain 0) counts as R3.
      const mdx = this.poseTmp.x - F[S_TGT_X]!;
      const mdy = this.poseTmp.y - F[S_TGT_Y]!;
      // R7 edge gate - the R5 air rule completed: under `airRateGain` the travel COMMANDED with both wheels off the
      // ground earns no intent, in the air (R5) or after touchdown (R7). A lean edge made in the air is remembered
      // (`leanEdgeAir`) until the next lean edge; while it stands, the target's remaining travel counts nothing once
      // a wheel is down (m2 Rookie golden: a -1 pressed in flight crawled under the air limit, the rear wheel landed,
      // the limit blended out and the last 0.08 m of travel ran at the ground rate, read intent 1 and fired `push`
      // 26 ticks after touchdown with no input edge - a coasting hop). Gain 0 (the Pro): raw, as R3 - his pre-snap
      // an edge before touchdown is a real push and counts.
      if (leanEdge) F[S_LEAN_EDGE_AIR] = bothAir;
      const airCommanded = bothAir ? 1 : F[S_LEAN_EDGE_AIR]!;
      // R6 preload gate (servoIntentBackM > 0): travel counts only while the rider body is behind the neutral pose
      let preload = 1;
      if (r.servoIntentBackM > 0) {
        const c0 = cos(this.an[CHASSIS]!);
        const s0 = sin(this.an[CHASSIS]!);
        const rx = this.px[RIDER]! - this.px[CHASSIS]!;
        const ry = this.py[RIDER]! - this.py[CHASSIS]!;
        const bodyX = rx * c0 + ry * s0;
        poseAt(r.poses, 0, this.poseTmp2);
        preload = bodyX <= this.poseTmp2.x - r.servoIntentBackM ? 1 : 0;
      }
      // R7 settled gate (servoIntentSettleM > 0): travel counts only while the body sits within M of its target. A
      // snap starts from a settled body (the crouch's target reached); a lean released while the body is still
      // sagged by a landing is an eccentric leg absorbing an impact, not a jump, so the sag is repaid under the
      // concentric cap (harness r11 x3 summit: the release at touchdown repaid 0.28 m at F_max = a coasting hop).
      let settled = 1;
      if (r.servoIntentSettleM > 0) {
        const c0 = cos(this.an[CHASSIS]!);
        const s0 = sin(this.an[CHASSIS]!);
        const rx = this.px[RIDER]! - this.px[CHASSIS]!;
        const ry = this.py[RIDER]! - this.py[CHASSIS]!;
        const lx = rx * c0 + ry * s0 - F[S_TGT_X]!;
        const ly = -rx * s0 + ry * c0 - F[S_TGT_Y]!;
        // continuous (§14.1 bounded response): 1 inside M, 0 beyond 5/3 M, linear between
        const m = r.servoIntentSettleM;
        settled = clamp((m * (5 / 3) - Math.sqrt(lx * lx + ly * ly)) / (m * (2 / 3)), 0, 1);
      }
      {
        // the memory saturates smoothly at servoIntentMaxM: linear to half of it, then a quadratic knee into the cap
        // (a hard min passed the 30-tick divergence row at 0.55 against 0.5)
        const raw = F[S_TGT_MOVE]! * (1 - dt / r.servoIntentTau) + Math.sqrt(mdx * mdx + mdy * mdy) * (1 - r.airRateGain * airCommanded) * preload * settled;
        const cap = r.servoIntentMaxM;
        const knee = 0.5 * cap;
        F[S_TGT_MOVE] = raw <= knee ? raw : raw >= cap + knee ? cap : cap - ((cap + knee - raw) * (cap + knee - raw)) / (2 * cap);
      }
      F[S_TGT_X] = this.poseTmp.x;
      F[S_TGT_Y] = this.poseTmp.y;
      F[S_TGT_PSI] = this.poseTmp.psi;
    } else {
      F[S_THROTTLE_EFF] = 0;
      F[S_BRAKE_EFF] = 1;
      F[S_TGT_MOVE] = 0;
      F[S_AIR_LIMIT] = 0;
      F[S_LEAN_EDGE_AIR] = 0;
      this.airLim = 0;
      U[U_LIMITER] = 0;
    }
    this.forces(riding); // 3
    this.collide(riding); // 4
    this.solve(riding); // 5
    this.integrate(); // 6
    this.positionPass(); // 7
    this.derive(riding); // 8

    F[S_TICK] = F[S_TICK]! + 1;
    F[S_TIME] = F[S_TICK]! * dt;
    this.advanceRng();
  }

  getState(): PhysicsState {
    const F = this.F;
    const U = this.U;
    const px = this.px;
    const py = this.py;
    const an = this.an;
    const av = this.av;
    const pose = this.riderPose();
    const fault = FAULTS[U[U_FAULT]!] ?? null;
    let ragdoll: RagdollBody[] | null = null;
    if (U[U_RAGDOLL] === 1) {
      ragdoll = new Array<RagdollBody>(NRAG);
      for (let i = 0; i < NRAG; i++) {
        const b = RAG0 + i;
        ragdoll[i] = { id: RAG_IDS[i]!, pos: { x: px[b]!, y: py[b]! }, angle: an[b]! };
      }
    }
    const col = this.col!;
    const nS = this.nSeesaw;
    const nD = this.nDrum;
    const seesaws: PhysicsState['seesaws'] = nS === 0 ? EMPTY_SEESAWS : new Array(nS);
    for (let i = 0; i < nS; i++) {
      const b = FIRST_DYN + i;
      seesaws[i] = { id: col.seesawBodies[i]!.collider.id, angle: an[b]!, angVel: av[b]! };
    }
    const drums: PhysicsState['drums'] = nD === 0 ? EMPTY_DRUMS : new Array(nD);
    for (let i = 0; i < nD; i++) {
      const b = FIRST_DYN + nS + i;
      drums[i] = { id: col.drumBodies[i]!.collider.id, spin: an[b]! };
    }
    const ft = F[S_FINISH_TIME]!;
    const rs = U[U_REAR_SURF]!;
    const fs = U[U_FRONT_SURF]!;
    const e = this.tuning.engine;
    const R = this.tuning.wheel.radius;
    const vRim = -av[REAR]! * R;
    return {
      tick: F[S_TICK]!,
      time: F[S_TIME]!,
      bike: { pos: { x: px[CHASSIS]!, y: py[CHASSIS]! }, vel: { x: this.vx[CHASSIS]!, y: this.vy[CHASSIS]! }, angle: an[CHASSIS]!, angVel: av[CHASSIS]! },
      wheels: {
        rear: { pos: { x: px[REAR]!, y: py[REAR]! }, spin: -an[REAR]!, spinVel: -av[REAR]!, compression: F[S_REAR_COMP]!, grounded: U[U_REAR_GND] === 1 },
        front: { pos: { x: px[FRONT]!, y: py[FRONT]! }, spin: -an[FRONT]!, spinVel: -av[FRONT]!, compression: F[S_FRONT_COMP]!, grounded: U[U_FRONT_GND] === 1 },
      },
      rider: pose,
      // R7: the simulated rider body (world SI: COM position, angle psi_R, velocities) - the hero rig poses from it
      // (`render/frame.ts` derives the chassis-relative values); frozen at the crash pose once the ragdoll owns the
      // rider (im = 0). Part of the replay contract: `hashPhysicsState` hashes it whenever present.
      riderBody: { pos: { x: px[RIDER]!, y: py[RIDER]! }, angle: an[RIDER]!, vel: { x: this.vx[RIDER]!, y: this.vy[RIDER]! }, angVel: av[RIDER]!, drawn: this.riderDrawn() },
      checkpoint: F[S_CHECKPOINT]!,
      finished: U[U_FINISHED] === 1,
      faulted: fault,
      finishTime: Number.isNaN(ft) ? null : ft,
      input: { throttle: F[S_IN_T]!, brake: F[S_IN_B]!, lean: F[S_IN_L]! },
      engine: { rpm: U[U_FAULT] === 0 ? reportRpm(e, R, vRim, F[S_THROTTLE_EFF]!) : e.idleRpm, throttleEff: F[S_THROTTLE_EFF]!, limiter: U[U_LIMITER] === 1 },
      contacts: { rear: rs > 0 ? SURFACES[rs - 1]! : null, front: fs > 0 ? SURFACES[fs - 1]! : null },
      rearSlip: F[S_REAR_SLIP]!,
      hopPhase: HOPS[U[U_HOP]!]!,
      ragdoll,
      seesaws,
      drums,
    };
  }

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  snapshot(): PhysicsSnapshot {
    return { v: 1, f64: this.F.slice(), u8: this.U.slice() };
  }

  restore(s: PhysicsSnapshot): void {
    if (s.f64.length !== this.F.length || s.u8.length !== this.U.length) {
      throw new Error('BikePhysicsV2.restore: snapshot does not match the loaded track');
    }
    this.F.set(s.f64);
    this.U.set(s.u8);
    this.loadRng();
  }

  // -- extras ---------------------------------------------------------------

  /** Static combined COM (d ahead of the rear contact, h above ground) at a lean, level, static sag, rider at the pose table. */
  comDH(lean: number): { d: number; h: number } {
    const t = this.tuning;
    const R = t.wheel.radius;
    const [cr, cf] = this.staticSags();
    const sr = t.suspension.rear;
    const sf = t.suspension.front;
    const rear = suspensionPoint(sr, cr);
    const front = suspensionPoint(sf, cf);
    poseAt(t.rider.poses, lean, this.poseTmp);
    const M = this.totalMass();
    const cx = (t.wheel.rearMass * rear.x + t.wheel.frontMass * front.x + t.rider.mass * this.poseTmp.x) / M;
    const cy = (t.wheel.rearMass * rear.y + t.wheel.frontMass * front.y + t.rider.mass * this.poseTmp.y) / M;
    return { d: cx - rear.x, h: cy - (rear.y - R) };
  }

  /**
   * Pitch at which the bike balances on its rear wheel at this lean and forward acceleration. The chassis
   * pivots about the rear AXLE (the wheel rolls; it does not tilt with the frame), so the combined COM
   * swings on a circle of radius r_a = |(d, h - R)| about the axle, not about the contact patch: the
   * moment balance about the COM is `-M g d(th) + M a (h_a(th) + R) - K_att lean = 0` (the `M a R` is the
   * chain torque's reaction on the chassis, which is why the lift threshold at th = 0 is still a/g = d/h
   * with h from the ground). R2 finding: R1 wrote `atan(d/h)` (pivot at the contact patch) and put the
   * zero-thrust balance at 34 deg; it is atan(d / (h - R)) = 49 deg at lean 0 on the mid row, and the
   * always-on attitude torque (§9.4) moves it by +-asin(K_att / (M g r_a)) ~ +-18 deg, so the coasting
   * balance spans ~27 deg (lean -1) to ~71 deg (lean +1). Solved by bisection (monotone in th over the
   * bracket); not part of the tick.
   */
  balancePitch(lean: number, accel = 0): number {
    const { d, h } = this.comDH(lean);
    const R = this.tuning.wheel.radius;
    const ha = h - R;
    const ra = Math.sqrt(d * d + ha * ha);
    const phi = atan2(d, ha);
    const g = this.g;
    const k = (this.tuning.rider.Katt * lean) / this.totalMass();
    const f = (th: number): number => -g * ra * sin(phi - th) + accel * (ra * cos(phi - th) + R) - k;
    let lo = phi - HALF_PI;
    let hi = phi + HALF_PI;
    if (f(lo) > 0) return lo;
    if (f(hi) < 0) return hi;
    for (let i = 0; i < 48; i++) {
      const mid = 0.5 * (lo + hi);
      if (f(mid) < 0) lo = mid;
      else hi = mid;
    }
    return 0.5 * (lo + hi);
  }

  teleport(pose: TeleportPose): void {
    const v = pose.vel ?? { x: 0, y: 0 };
    this.placeBike(pose.pos.x, pose.pos.y, pose.angle, v.x, v.y, pose.angVel ?? 0);
  }

  debug(): PhysicsDebugV2 {
    const F = this.F;
    const t = this.tuning;
    const names = ['chassis', 'rearWheel', 'frontWheel', 'rider', ...RAG_IDS.map((r) => `rag:${r}`)];
    const bodies: PhysicsDebugV2['bodies'] = [];
    for (let b = 0; b < this.nBodies; b++) {
      const id = names[b] ?? (b < FIRST_DYN + this.nSeesaw ? `seesaw:${b - FIRST_DYN}` : `drum:${b - FIRST_DYN - this.nSeesaw}`);
      bodies.push({ id, pos: { x: this.px[b]!, y: this.py[b]! }, vel: { x: this.vx[b]!, y: this.vy[b]! }, angle: this.an[b]!, angVel: this.av[b]! });
    }
    const contacts: PhysicsDebugV2['contacts'] = [];
    for (let i = 0; i < this.nC; i++) {
      contacts.push({
        body: names[this.cA[i]!] ?? `#${this.cA[i]}`,
        point: { x: this.cPx[i]!, y: this.cPy[i]! },
        normal: { x: this.cNx[i]!, y: this.cNy[i]! },
        lambdaN: this.cLn[i]!,
        lambdaT: this.cLt[i]!,
        mu: this.cMu[i]!,
        surface: SURFACES[this.cSurf[i]!] ?? 'dirt',
      });
    }
    const R = t.wheel.radius;
    const vRim = -this.av[REAR]! * R;
    // live combined COM relative to the rear contact patch
    const M = this.totalMass();
    const mx = (t.chassis.mass * this.px[CHASSIS]! + t.wheel.rearMass * this.px[REAR]! + t.wheel.frontMass * this.px[FRONT]! + t.rider.mass * this.px[RIDER]!) / M;
    const my = (t.chassis.mass * this.py[CHASSIS]! + t.wheel.rearMass * this.py[REAR]! + t.wheel.frontMass * this.py[FRONT]! + t.rider.mass * this.py[RIDER]!) / M;
    this.buildRiderChain();
    const p = (i: number): Vec2 => ({ x: this.chain.x[i]!, y: this.chain.y[i]! });
    return {
      bodies,
      contacts,
      engine: { rpm: reportRpm(t.engine, R, vRim, F[S_THROTTLE_EFF]!), torqueNm: this.dEngineTq, thrustN: this.dThrust, limiter: this.U[U_LIMITER] === 1, throttleEff: F[S_THROTTLE_EFF]!, brakeEff: F[S_BRAKE_EFF]!, assist: this.dAssist },
      brakes: { rearTorqueNm: this.sBrake[0]! / this.dt, frontTorqueNm: this.sBrake[1]! / this.dt, assist: this.dBrakeAssist },
      suspension: {
        rear: { compression: this.sComp[0]!, rate: this.sRate[0]!, force: this.sForce[0]! },
        front: { compression: this.sComp[1]!, rate: this.sRate[1]!, force: this.sForce[1]! },
      },
      rider: {
        body: { pos: { x: this.px[RIDER]!, y: this.py[RIDER]! }, vel: { x: this.vx[RIDER]!, y: this.vy[RIDER]! }, angle: this.an[RIDER]!, angVel: this.av[RIDER]! },
        servoForce: { x: this.dServoFx, y: this.dServoFy },
        servoTorque: this.dServoTq,
        legLen: this.dLegLen,
        legFrac: this.dLegFrac,
        intent: this.dIntent,
        airLimited: this.airLim,
        hold: { legJ: this.holdLam[0]!, armJ: this.holdLam[1]!, seatJ: this.holdLam[2]!, tankJ: this.holdLam[3]!, elbowJ: this.holdLam[4]!, gripF: F[S_GRIP_J]! / t.rider.hold.gripTau },
        poseTargetWorld: { x: this.dTgtWx, y: this.dTgtWy },
        lag: { x: this.px[RIDER]! - this.dTgtWx, y: this.py[RIDER]! - this.dTgtWy },
      },
      attTorque: this.dAtt,
      poseTarget: { x: F[S_TGT_X]!, y: F[S_TGT_Y]!, psi: F[S_TGT_PSI]! },
      comDH: { d: mx - this.px[REAR]!, h: my - (this.py[REAR]! - R) },
      balancePitch: this.balancePitch(leanFromX(t.rider.poses, F[S_TGT_X]!), 0),
      riderChain: { hips: p(0), shoulders: p(1), head: p(2), elbow: p(3), hand: p(4), knee: p(5), foot: p(6), torsoDir: { x: this.chain.dx, y: this.chain.dy }, headDir: { x: this.chain.hx, y: this.chain.hy } },
      crashCause: CAUSES[this.U[U_CRASH_CAUSE]!] ?? null,
      finishVoided: this.U[U_FINISH_VOID] === 1,
    };
  }

  // -- setup ----------------------------------------------------------------

  private requireTrack(): CompiledTrack {
    if (!this.track) throw new Error('BikePhysicsV2: no track loaded');
    return this.track;
  }

  private totalMass(): number {
    const t = this.tuning;
    return t.chassis.mass + t.wheel.rearMass + t.wheel.frontMass + t.rider.mass;
  }

  private setupMasses(): void {
    const t = this.tuning;
    this.im[CHASSIS] = 1 / t.chassis.mass;
    this.ii[CHASSIS] = 1 / t.chassis.inertia;
    this.im[REAR] = 1 / t.wheel.rearMass;
    this.ii[REAR] = 1 / t.wheel.rearInertia;
    this.im[FRONT] = 1 / t.wheel.frontMass;
    this.ii[FRONT] = 1 / t.wheel.frontInertia;
    this.im[RIDER] = 1 / t.rider.mass;
    this.ii[RIDER] = 1 / t.rider.inertia;
    for (let i = 0; i < NRAG; i++) {
      this.im[RAG0 + i] = 0;
      this.ii[RAG0 + i] = 0;
    }
  }

  private setupDynamicColliders(): void {
    const col = this.col!;
    for (let i = 0; i < this.nSeesaw; i++) {
      const b = FIRST_DYN + i;
      const c = col.seesawBodies[i]!.collider;
      this.px[b] = c.pivot.x;
      this.py[b] = c.pivot.y;
      this.an[b] = c.maxAngle;
      this.im[b] = 0;
      this.ii[b] = 3 / (c.mass * c.halfLength * c.halfLength);
    }
    for (let i = 0; i < this.nDrum; i++) {
      const b = FIRST_DYN + this.nSeesaw + i;
      const c = col.drumBodies[i]!.collider;
      this.px[b] = c.center.x;
      this.py[b] = c.center.y;
      this.im[b] = 0;
      const mass = this.tuning.drum.density * c.radius * c.radius;
      this.ii[b] = 1 / (0.5 * mass * c.radius * c.radius);
    }
  }

  /**
   * Static sag of a wheel's spring under a vertical ground load `N`: the unsprung wheel carries its own
   * weight, and on a tilted slider the spring sees `axis.y` of the sprung share (the slider's
   * perpendicular constraint carries the rest). On the hinge (R8 Astra port) the axis is the arc's tangent AT
   * the sag, so the sag is iterated (8 fixed-point steps from `guess`; the tangent turns 0.2 rad over the travel).
   */
  private staticSag(s: SuspensionV2, N: number, wheelMass: number, guess = 0): number {
    let compression = guess;
    for (let i = 0; i < 8; i++) {
      const vertical = s.hinge ? -cos(s.hinge.droopAngle - compression / s.hinge.radius) : s.axis.y;
      compression = clamp(((N - wheelMass * this.g) * vertical) / s.k - s.preload, 0, s.travel);
    }
    return compression;
  }

  /**
   * Static sags (m) of rear / front at the neutral pose: the wheel loads from the moment balance about the SAGGED
   * axles (level ground through both contacts), iterated with the sags (R8 Astra port, 405f894; before, the split
   * was taken on the zero-compression geometry, 1-2 % off on a 26 cm arc).
   */
  private staticSags(): [number, number] {
    const t = this.tuning;
    const mass = this.totalMass();
    poseAt(t.rider.poses, 0, this.poseTmp);
    let rear = 0;
    let front = 0;
    for (let i = 0; i < 16; i++) {
      const r = suspensionPoint(t.suspension.rear, rear);
      const f = suspensionPoint(t.suspension.front, front);
      const angle = atan2(r.y - f.y, f.x - r.x);
      const mx = (t.wheel.rearMass * r.x + t.wheel.frontMass * f.x + t.rider.mass * this.poseTmp.x) / mass;
      const my = (t.wheel.rearMass * r.y + t.wheel.frontMass * f.y + t.rider.mass * this.poseTmp.y) / mass;
      const width = Math.sqrt((f.x - r.x) ** 2 + (f.y - r.y) ** 2);
      const frontLoad = (mass * this.g * ((mx - r.x) * cos(angle) - (my - r.y) * sin(angle))) / width;
      rear = this.staticSag(t.suspension.rear, mass * this.g - frontLoad, t.wheel.rearMass, rear);
      front = this.staticSag(t.suspension.front, frontLoad, t.wheel.frontMass, front);
    }
    return [rear, front];
  }

  /** Render axle frame origin in the chassis frame (axle midpoint at static sag), as v1. */
  private axleOrigin(): void {
    const t = this.tuning;
    const [cr, cf] = this.staticSags();
    const rear = suspensionPoint(t.suspension.rear, cr);
    const front = suspensionPoint(t.suspension.front, cf);
    this.axleOrgX = 0.5 * (rear.x + front.x);
    this.axleOrgY = 0.5 * (rear.y + front.y);
  }

  /**
   * Place the bike from its rear wheel centre + ground angle at static sag (both springs at their static
   * loads; the chassis takes the small pitch the two sags imply so the spawn is at rest), rider at the
   * neutral target with zero relative velocity.
   */
  private placeBike(rx: number, ry: number, angle: number, velX: number, velY: number, angVel: number): void {
    const t = this.tuning;
    const R = t.wheel.radius;
    const sr = t.suspension.rear;
    const sf = t.suspension.front;
    const [cr, cf] = this.staticSags();
    const rearPoint = suspensionPoint(sr, cr);
    const frontPoint = suspensionPoint(sf, cf);
    const rlx = rearPoint.x;
    const rly = rearPoint.y;
    const flx = frontPoint.x;
    const fly = frontPoint.y;
    // chassis angle that puts both axles on the ground line
    const a = angle + atan2(rly - fly, flx - rlx);
    const c = cos(a);
    const s = sin(a);
    const fx = rx - (rlx * c - rly * s);
    const fy = ry - (rlx * s + rly * c);
    this.px[CHASSIS] = fx;
    this.py[CHASSIS] = fy;
    this.an[CHASSIS] = a;
    this.px[REAR] = rx;
    this.py[REAR] = ry;
    this.an[REAR] = 0;
    this.px[FRONT] = fx + flx * c - fly * s;
    this.py[FRONT] = fy + flx * s + fly * c;
    this.an[FRONT] = 0;
    poseAt(t.rider.poses, 0, this.poseTmp);
    this.F[S_TGT_X] = this.poseTmp.x;
    this.F[S_TGT_Y] = this.poseTmp.y;
    this.F[S_TGT_PSI] = this.poseTmp.psi;
    // the body sits its static servo sag below the target, so the spawn is at rest
    const sag = (t.rider.mass * this.g) / t.rider.kp;
    const bx = this.poseTmp.x;
    const by = this.poseTmp.y;
    this.px[RIDER] = fx + bx * c - by * s;
    this.py[RIDER] = fy + bx * s + by * c - sag;
    this.an[RIDER] = a + this.poseTmp.psi;
    for (let b = 0; b <= RIDER; b++) {
      const dx = this.px[b]! - rx;
      const dy = this.py[b]! - ry;
      this.vx[b] = velX - angVel * dy;
      this.vy[b] = velY + angVel * dx;
      this.av[b] = b === CHASSIS || b === RIDER ? angVel : 0;
    }
    const vAlong = velX * cos(angle) + velY * sin(angle);
    this.av[REAR] = -vAlong / R + angVel;
    this.av[FRONT] = -vAlong / R + angVel;
    this.F[S_REAR_COMP] = cr / sr.travel;
    this.F[S_FRONT_COMP] = cf / sf.travel;
    this.F[S_REAR_AIR] = 0;
    this.F[S_FRONT_AIR] = 0;
    this.F[S_AIR_LIMIT] = 0;
    this.F[S_PREV_RX] = rx;
    this.F[S_PREV_RY] = ry;
    this.F[S_PREV_FX] = this.px[FRONT]!;
    this.F[S_PREV_FY] = this.py[FRONT]!;
  }

  private saveRng(): void {
    const s = this.rng.state();
    for (let i = 0; i < 4; i++) this.F[S_RNG + i] = s[i]!;
  }
  private loadRng(): void {
    this.rng.setState([this.F[S_RNG]!, this.F[S_RNG + 1]!, this.F[S_RNG + 2]!, this.F[S_RNG + 3]!]);
  }
  private advanceRng(): void {
    this.rng.nextU32();
    this.saveRng();
  }

  // -- rider pose / chain ---------------------------------------------------

  /** Rider body offset from the chassis COM in the chassis frame and its angle relative to the chassis. */
  private riderLocal(): { x: number; y: number; psi: number } {
    const c = cos(this.an[CHASSIS]!);
    const s = sin(this.an[CHASSIS]!);
    const dx = this.px[RIDER]! - this.px[CHASSIS]!;
    const dy = this.py[RIDER]! - this.py[CHASSIS]!;
    return { x: dx * c + dy * s, y: -dx * s + dy * c, psi: this.an[RIDER]! - this.an[CHASSIS]! };
  }

  /**
   * `RiderPose` derived from the rider body (§16.1): `lean` = body x offset through the pose table,
   * `crouch` = height below the current target / 0.30, `torsoPitch` = the body angle's lag behind its
   * target (+ = pitched forward), `armExtend` from the drawn hips -> grip distance.
   */
  private riderPose(): PhysicsState['rider'] {
    const r = this.tuning.rider;
    const F = this.F;
    const l = this.riderLocal();
    const lean = leanFromX(r.poses, l.x);
    const crouch = clamp((F[S_TGT_Y]! - l.y) / 0.3, 0, 1);
    const torsoLag = l.psi - F[S_TGT_PSI]!;
    const cp = canonicalPose(lean);
    const hx = cp.hipX;
    const hy = cp.hipY + (l.y - F[S_TGT_Y]!);
    const d = Math.sqrt((GRIP_X - hx) * (GRIP_X - hx) + (GRIP_Y - hy) * (GRIP_Y - hy));
    return {
      lean,
      crouch,
      torsoPitch: clamp(-torsoLag, -0.9, 0.9),
      armExtend: clamp((d - 0.55) / 0.31, 0, 1),
    };
  }

  /**
   * R9: the drawn pose for the hero (`riderBody.drawn`) - Astra's seated table at the effective lean with the same two
   * excursion numbers the sensor chain draws (height below the target, angle behind it). Pure in the body's state;
   * not hashed (`hashPhysicsState` lists its fields), so the physics and every golden are byte-identical with or
   * without it. The sensor chain stays on the physical table (`buildRiderChain`).
   */
  private riderDrawn(): NonNullable<RiderBody['drawn']> {
    const r = this.tuning.rider;
    const F = this.F;
    const l = this.riderLocal();
    const out = { pose: 'seated' as 'seated' | 'back' | 'forward', blend: 0, hips: { x: 0, y: 0 }, torso: 0, head: 0 };
    drawnBody(leanFromX(r.poses, l.x), l.y - F[S_TGT_Y]!, l.psi - F[S_TGT_PSI]!, out);
    return out;
  }

  /** The drawn chain in world space from the rider body (sensors + ragdoll spawn live on it). */
  private buildRiderChain(): void {
    const r = this.tuning.rider;
    const F = this.F;
    const l = this.riderLocal();
    const lean = leanFromX(r.poses, l.x);
    const c = cos(this.an[CHASSIS]!);
    const s = sin(this.an[CHASSIS]!);
    buildChain(lean, 0, l.y - F[S_TGT_Y]!, l.psi - F[S_TGT_PSI]!, this.px[CHASSIS]!, this.py[CHASSIS]!, c, s, this.axleOrgX, this.axleOrgY, this.chain);
  }

  // -- step phases ----------------------------------------------------------

  /** Force `f` on body `b` at world point `p`, integrated over one tick. */
  private forceAt(b: number, pxw: number, pyw: number, fx: number, fy: number): void {
    const dt = this.dt;
    this.vx[b] = this.vx[b]! + fx * dt * this.im[b]!;
    this.vy[b] = this.vy[b]! + fy * dt * this.im[b]!;
    const rx = pxw - this.px[b]!;
    const ry = pyw - this.py[b]!;
    this.av[b] = this.av[b]! + this.ii[b]! * (rx * fy - ry * fx) * dt;
  }

  /**
   * Suspension geometry of wheel `w` from the current positions (R8 Astra port, 405f894): the compression
   * coordinate `sComp`, the direction it grows along `sA` (world), the bilateral constraint's direction `sN` and
   * its error `sPerp`. Straight slider: `sA` the axis, `sN` its perpendicular, `sPerp` the drift off the line. Hinge
   * (the rear swingarm): `sA` the arc's tangent, `sN` the radial direction from the pivot and `sPerp` the arm-length
   * error `d - radius`, `sComp` the arc length from full droop. One function for the force pass, the velocity
   * solve, the position pass and derive(), so every phase sees the same path.
   */
  private suspensionGeometry(w: number): void {
    const st = w === 0 ? this.tuning.suspension.rear : this.tuning.suspension.front;
    const body = w === 0 ? REAR : FRONT;
    const angle = this.an[CHASSIS]!;
    const c = cos(angle);
    const s = sin(angle);
    const local = st.hinge ? st.hinge.pivot : st.axle;
    const x = this.px[CHASSIS]! + local.x * c - local.y * s;
    const y = this.py[CHASSIS]! + local.x * s + local.y * c;
    const dx = this.px[body]! - x;
    const dy = this.py[body]! - y;
    if (st.hinge) {
      const d2 = Math.max(1e-12, dx * dx + dy * dy);
      const d = Math.sqrt(d2);
      this.sNx[w] = dx / d;
      this.sNy[w] = dy / d;
      // tangent in the sense of growing compression (the arm angle falls as the wheel rises)
      this.sAx[w] = (st.hinge.radius * dy) / d2;
      this.sAy[w] = (-st.hinge.radius * dx) / d2;
      this.sComp[w] = st.hinge.radius * wrapAngle(st.hinge.droopAngle - atan2(dy, dx) + angle);
      this.sPerp[w] = d - st.hinge.radius;
    } else {
      const ax = st.axis.x * c - st.axis.y * s;
      const ay = st.axis.x * s + st.axis.y * c;
      this.sAx[w] = ax;
      this.sAy[w] = ay;
      this.sNx[w] = -ay;
      this.sNy[w] = ax;
      this.sComp[w] = dx * ax + dy * ay;
      this.sPerp[w] = -dx * ay + dy * ax;
    }
  }

  private forces(riding: boolean): void {
    const F = this.F;
    const U = this.U;
    const t = this.tuning;
    const dt = this.dt;
    const g = this.g;
    const px = this.px;
    const py = this.py;
    const vx = this.vx;
    const vy = this.vy;
    const av = this.av;
    const im = this.im;
    const ii = this.ii;
    const R = t.wheel.radius;

    // pre-force velocities: every rate-dependent force reads these, not the partially kicked ones
    const vCx0 = vx[CHASSIS]!;
    const vCy0 = vy[CHASSIS]!;
    const wC0 = av[CHASSIS]!;
    const vRx0 = vx[RIDER]!;
    const vRy0 = vy[RIDER]!;
    const wR0 = av[RIDER]!;

    // gravity
    const nb = this.nBodies;
    for (let b = 0; b < nb; b++) if (im[b]! > 0) vy[b] = vy[b]! - g * dt;

    const fx = px[CHASSIS]!;
    const fy = py[CHASSIS]!;
    const c = cos(this.an[CHASSIS]!);
    const s = sin(this.an[CHASSIS]!);

    // suspension pass 1: geometry and rates from pre-impulse velocities (both wheels first)
    for (let w = 0; w < 2; w++) {
      const wb = w === 0 ? REAR : FRONT;
      this.suspensionGeometry(w);
      const ax = this.sAx[w]!;
      const ay = this.sAy[w]!;
      const rx = px[wb]! - fx;
      const ry = py[wb]! - fy;
      const wf = av[CHASSIS]!;
      const relx = vx[wb]! - (vx[CHASSIS]! - wf * ry);
      const rely = vy[wb]! - (vy[CHASSIS]! + wf * rx);
      this.sRate[w] = relx * ax + rely * ay;
    }
    // suspension pass 2: spring + damper + cubic bump stop as an impulse pair; rolling resistance
    for (let w = 0; w < 2; w++) {
      const st = w === 0 ? t.suspension.rear : t.suspension.front;
      const wb = w === 0 ? REAR : FRONT;
      const ax = this.sAx[w]!;
      const ay = this.sAy[w]!;
      const comp = this.sComp[w]!;
      const rate = this.sRate[w]!;
      const rx = px[wb]! - fx;
      const ry = py[wb]! - fy;
      let force = st.k * (comp + st.preload);
      const over = comp - st.stopStart * st.travel;
      if (over > 0) force += (st.kStop * over * over * over) / (st.travel * st.travel);
      const cd = rate > 0 ? st.cComp : st.cReb;
      let damp = cd * rate * dt;
      const mRed = 1 / (im[wb]! + im[CHASSIS]!);
      const maxDamp = mRed * Math.abs(rate);
      damp = clamp(damp, -maxDamp, maxDamp);
      const J = force * dt + damp;
      this.sForce[w] = J / dt;
      vx[wb] = vx[wb]! - J * ax * im[wb]!;
      vy[wb] = vy[wb]! - J * ay * im[wb]!;
      vx[CHASSIS] = vx[CHASSIS]! + J * ax * im[CHASSIS]!;
      vy[CHASSIS] = vy[CHASSIS]! + J * ay * im[CHASSIS]!;
      av[CHASSIS] = av[CHASSIS]! + ii[CHASSIS]! * (rx * J * ay - ry * J * ax);
      // rolling resistance on a wheel that carried ground load last tick, against this tick's spring load
      if ((w === 0 ? U[U_REAR_GND] : U[U_FRONT_GND]) === 1 && force > 0) {
        const wv = av[wb]!;
        const tq = -t.tyre.rollRes * force * R * clamp(wv / 0.05, -1, 1);
        av[wb] = wv + tq * dt * ii[wb]!;
      }
    }

    if (!riding) {
      this.dEngineTq = 0;
      this.dAssist = 0;
      this.dThrust = 0;
      this.dServoFx = 0;
      this.dServoFy = 0;
      this.dServoTq = 0;
      this.dAtt = 0;
      return;
    }

    // engine: torque on the rear wheel, reaction on the chassis (ground and air alike)
    {
      const vRim = -av[REAR]! * R;
      U[U_LIMITER] = limiterLatch(t.engine, R, vRim, U[U_LIMITER] === 1) ? 1 : 0;
      const te = F[S_THROTTLE_EFF]!;
      // R4 Rookie assist: the ECU wheelie control trims the drive thrust when the front is topped out and the
      // nose is rising (this tick's pitch rate and front compression; nothing remembered). gain 0 on the Pro.
      const wc = t.engine.wheelieControl;
      let dLive = 1;
      if (wc.gain > 0) {
        const mc = t.chassis.mass;
        const mr = t.wheel.rearMass;
        const mf = t.wheel.frontMass;
        const mR = t.rider.mass;
        dLive = (mc * px[CHASSIS]! + mr * px[REAR]! + mf * px[FRONT]! + mR * px[RIDER]!) / (mc + mr + mf + mR) - px[REAR]!;
      }
      // R6: `airGain` x in free air (both R4 air counters > 0): the Pro's ECU is ground-only, its air stays raw.
      const trim = wheelieTrim(wc, wC0, this.sComp[1]!, dLive, F[S_IN_L]!, F[S_REAR_AIR]! > 0 && F[S_FRONT_AIR]! > 0);
      this.dAssist = trim;
      const tq = driveTorque(t.engine, R, vRim, te, U[U_LIMITER] === 1, trim);
      this.dEngineTq = tq;
      this.dThrust = U[U_LIMITER] === 1 ? 0 : (1 - trim) * te * t.engine.Fpeak * thrustFrac(t.engine, vRim);
      av[REAR] = av[REAR]! - tq * dt * ii[REAR]!;
      av[CHASSIS] = av[CHASSIS]! + tq * dt * ii[CHASSIS]!;
    }

    // aero: two real forces at the two COMs
    {
      const k = 0.5 * t.aero.rho * t.aero.cda;
      const kc = k * t.aero.chassisShare;
      const kr = k * (1 - t.aero.chassisShare);
      const sc = Math.sqrt(vCx0 * vCx0 + vCy0 * vCy0);
      vx[CHASSIS] = vx[CHASSIS]! - kc * sc * vCx0 * dt * im[CHASSIS]!;
      vy[CHASSIS] = vy[CHASSIS]! - kc * sc * vCy0 * dt * im[CHASSIS]!;
      const sr = Math.sqrt(vRx0 * vRx0 + vRy0 * vRy0);
      vx[RIDER] = vx[RIDER]! - kr * sr * vRx0 * dt * im[RIDER]!;
      vy[RIDER] = vy[RIDER]! - kr * sr * vRy0 * dt * im[RIDER]!;
    }

    // rider servo (§9.3): bounded force toward the target point, bounded torque toward the target
    // angle; both as collinear pairs at the pegs (the leg-line component) and the grip (the rest)
    {
      const r = t.rider;
      const tx = F[S_TGT_X]!;
      const ty = F[S_TGT_Y]!;
      const twx = fx + tx * c - ty * s;
      const twy = fy + tx * s + ty * c;
      this.dTgtWx = twx;
      this.dTgtWy = twy;
      const rtx = twx - fx;
      const rty = twy - fy;
      const vtx = vCx0 - wC0 * rty;
      const vty = vCy0 + wC0 * rtx;
      // hips from the body, pegs and grip from the chassis; the leg line hips -> peg
      const cr = cos(this.an[RIDER]!);
      const srr = sin(this.an[RIDER]!);
      const hipx = px[RIDER]! - (r.comFromHips.x * cr - r.comFromHips.y * srr);
      const hipy = py[RIDER]! - (r.comFromHips.x * srr + r.comFromHips.y * cr);
      const plx = r.peg.x + this.axleOrgX;
      const ply = r.peg.y + this.axleOrgY;
      const pegx = fx + plx * c - ply * s;
      const pegy = fy + plx * s + ply * c;
      const glx = r.grip.x + this.axleOrgX;
      const gly = r.grip.y + this.axleOrgY;
      const gripx = fx + glx * c - gly * s;
      const gripy = fy + glx * s + gly * c;
      let ux = pegx - hipx;
      let uy = pegy - hipy;
      const ul = Math.sqrt(ux * ux + uy * uy);
      if (ul > 1e-6) {
        ux /= ul;
        uy /= ul;
      } else {
        ux = -s;
        uy = c;
      }
      // implicit damping: F = kp e - kd (v_rel0 + dt A F), A the pair's response of (v_R - v_T) to F
      // with the leg / arm split (rank-1 rotational term through the chassis inertia); explicit damping at
      // kd 4200 is unstable against the chassis's rotational compliance at the grip (c dt / m_eff > 2)
      const ex = twx - px[RIDER]!;
      const ey = twy - py[RIDER]!;
      const vrx = vRx0 - vtx;
      const vry = vRy0 - vty;
      const mRed = im[RIDER]! + im[CHASSIS]!;
      // torque on C per unit F (R7): with the linkage couple below the pair acts on the chassis as if at the
      // rider COM, q . F = -(r_R x F). The linearisation takes the lever at the TARGET point (q = p below), so
      // A = mRed I + kI p p^T is symmetric positive-definite for any lag: with q at the body, p q^T lost
      // definiteness once the body was ~1 m off target, det crossed zero and the implicit force flipped sign
      // tick to tick (h3 Rookie golden: the body driven 7 m from the bike at +-F_max). Exact when tracking.
      const qx = rty;
      const qy = -rtx;
      // v_T change per unit torque impulse: omega x r_T = (-rty, rtx); v_rel = v_R - v_T loses it
      const pxx = rty;
      const pyy = -rtx;
      const kI = ii[CHASSIS]!;
      const a = r.kd * dt;
      // M = I + a A, A = mRed I + kI p q^T  (2x2)
      const m11 = 1 + a * (mRed + kI * pxx * qx);
      const m12 = a * kI * pxx * qy;
      const m21 = a * kI * pyy * qx;
      const m22 = 1 + a * (mRed + kI * pyy * qy);
      // damping part implicit (F_d (I + a A) = -kd v_rel0), spring part explicit (omega dt = 0.31)
      const bx = -r.kd * vrx;
      const by = -r.kd * vry;
      const det = m11 * m22 - m12 * m21;
      let Fx = r.kp * ex + (bx * m22 - m12 * by) / det;
      let Fy = r.kp * ey + (m11 * by - m21 * bx) / det;
      // force-velocity (R2, Hill-like): the servo can pull the body toward its target at full F_max only
      // while the gap is opening or closing slowly; the cap falls linearly with the closing speed to
      // `servoMinFrac` F_max at `servoCloseV0`. The hop's push is an opening gap (the target runs ahead of
      // the body) and keeps F_max; a big landing drives the body 0.3 m below a static target and would
      // otherwise fire it (and the bike) back up at F_max - the 0.6 m pogo rebound of R2's first 2 m drop.
      const el = Math.sqrt(ex * ex + ey * ey);
      const vClose = el > 1e-6 ? (vrx * ex + vry * ey) / el : 0;
      const hill = clamp(1 - vClose / r.servoCloseV0, r.servoMinFrac, 1);
      const intent = clamp(F[S_TGT_MOVE]! / r.servoIntentM, 0, 1);
      const fl = hill + (1 - hill) * intent;
      const fmax = r.Fmax * fl;
      this.dLegLen = ul;
      this.dLegFrac = fl;
      this.dIntent = intent;
      const fm = Math.sqrt(Fx * Fx + Fy * Fy);
      if (fm > fmax) {
        Fx *= fmax / fm;
        Fy *= fmax / fm;
      }
      this.dServoFx = Fx;
      this.dServoFy = Fy;
      const along = Fx * ux + Fy * uy;
      const legx = along * ux;
      const legy = along * uy;
      const armx = Fx - legx;
      const army = Fy - legy;
      this.forceAt(RIDER, pegx, pegy, legx, legy);
      this.forceAt(CHASSIS, pegx, pegy, -legx, -legy);
      this.forceAt(RIDER, gripx, gripy, armx, army);
      this.forceAt(CHASSIS, gripx, gripy, -armx, -army);
      // linkage couple (R7): the pair's moment about the rider COM (up to 0.55 m x F_max = 1 700 N m at the grip)
      // is reacted by the closed chain hands-bars / feet-pegs, not by the torso muscles - it goes back to the
      // chassis as a couple (a pair torque: angular momentum stays exact), so the body's rotation is driven by
      // the angular servo alone and the servo force acts on the chassis as if at the rider COM (§9.3). Without
      // it the 300 N m angular servo lost to the 1 700 N m moment and the body wound up (E2 bot: 834 rad).
      const mPair = (pegx - px[RIDER]!) * legy - (pegy - py[RIDER]!) * legx + (gripx - px[RIDER]!) * army - (gripy - py[RIDER]!) * armx;
      av[RIDER] = av[RIDER]! - mPair * dt * ii[RIDER]!;
      av[CHASSIS] = av[CHASSIS]! + mPair * dt * ii[CHASSIS]!;
      // angular servo
      const errA = this.an[CHASSIS]! + F[S_TGT_PSI]! - this.an[RIDER]!;
      const tq = clamp(r.kpsi * errA + r.cpsi * (wC0 - wR0), -r.tauMax, r.tauMax);
      this.dServoTq = tq;
      av[RIDER] = av[RIDER]! + tq * dt * ii[RIDER]!;
      av[CHASSIS] = av[CHASSIS]! - tq * dt * ii[CHASSIS]!;
      // the declared attitude torque (§9.4): external, always on, printed
      const att = -r.Katt * F[S_IN_L]! - (r.cAtt + r.airCattAdd * this.airLim) * wC0;
      this.dAtt = att;
      av[CHASSIS] = av[CHASSIS]! + att * dt * ii[CHASSIS]!;
    }
  }

  private collide(riding: boolean): void {
    this.nC = 0;
    const t = this.tuning;
    const dt = this.dt;
    const spec = t.solver.specMargin;
    const U = this.U;
    const F = this.F;
    U[U_CRASH_PENDING] = 0;
    // poses at collide time for the position pass
    this.p0x.set(this.px);
    this.p0y.set(this.py);
    this.a0.set(this.an);
    // wheels: one-way side by the previous centre
    for (let w = 0; w < 2; w++) {
      const b = w === 0 ? REAR : FRONT;
      const speed = Math.sqrt(this.vx[b]! * this.vx[b]! + this.vy[b]! * this.vy[b]!);
      const prevX = w === 0 ? F[S_PREV_RX]! : F[S_PREV_FX]!;
      const prevY = w === 0 ? F[S_PREV_RY]! : F[S_PREV_FY]!;
      this.qBody = b;
      this.qCx = this.px[b]!;
      this.qCy = this.py[b]!;
      this.qR = t.wheel.radius;
      this.qWheel = 1;
      this.qSensor = false;
      this.qRag = false;
      this.col!.queryCircleV2(this.qCx, this.qCy, this.qR, spec + speed * dt, this.bodyAngle, this.onManifold, prevX, prevY);
      F[w === 0 ? S_PREV_RX : S_PREV_FX] = this.px[b]!;
      F[w === 0 ? S_PREV_RY : S_PREV_FY] = this.py[b]!;
    }
    // chassis hard points
    {
      const c = cos(this.an[CHASSIS]!);
      const s = sin(this.an[CHASSIS]!);
      const speed = Math.sqrt(this.vx[CHASSIS]! * this.vx[CHASSIS]! + this.vy[CHASSIS]! * this.vy[CHASSIS]!) + Math.abs(this.av[CHASSIS]!) * 0.8;
      for (const fc of t.chassis.circles) {
        const cx = this.px[CHASSIS]! + fc.x * c - fc.y * s;
        const cy = this.py[CHASSIS]! + fc.x * s + fc.y * c;
        this.queryBodyCircle(CHASSIS, cx, cy, fc.r, spec + speed * dt, false);
      }
    }
    if (riding) {
      // rider sensors on the drawn chain (crash test only)
      this.buildRiderChain();
      const r = t.rider;
      const ch = this.chain;
      this.querySensor(ch.x[2]!, ch.y[2]!, r.headRadius);
      this.querySensor(ch.x[0]! + ch.dx * 0.38, ch.y[0]! + ch.dy * 0.38, r.torsoRadius);
      this.querySensor(ch.x[0]! + ch.dx * 0.14, ch.y[0]! + ch.dy * 0.14, r.torsoRadius);
    } else if (U[U_RAGDOLL] === 1) {
      for (let i = 0; i < NRAG; i++) {
        const b = RAG0 + i;
        const limb = RAG_LIMBS[i]!;
        const speed = Math.sqrt(this.vx[b]! * this.vx[b]! + this.vy[b]! * this.vy[b]!) + Math.abs(this.av[b]!) * limb.len;
        if (limb.len === 0) {
          this.queryBodyCircle(b, this.px[b]!, this.py[b]!, limb.r, spec + speed * dt, true);
        } else {
          const c = cos(this.an[b]!);
          const s = sin(this.an[b]!);
          const hx = -s * (limb.len * 0.5);
          const hy = c * (limb.len * 0.5);
          this.queryBodyCircle(b, this.px[b]! + hx, this.py[b]! + hy, limb.r, spec + speed * dt, true);
          this.queryBodyCircle(b, this.px[b]! - hx, this.py[b]! - hy, limb.r, spec + speed * dt, true);
        }
      }
      this.collideRagdollVsBike(spec);
    }
  }

  private readonly bikePrim: Prim = {
    kind: PrimKind.Circle,
    colliderId: -1,
    surface: 2,
    oneWay: false,
    body: CHASSIS,
    ax: 0,
    ay: 0,
    bx: 0,
    by: 0,
    nx: 0,
    ny: 0,
    cx: 0,
    cy: 0,
    r: 0,
    hw: 0,
    hh: 0,
    angle: 0,
    minX: 0,
    maxX: 0,
    endA: false,
    endB: false,
  };
  private readonly bikeManifold: Manifold = { px: 0, py: 0, nx: 0, ny: 0, sep: 0, prim: null as unknown as Prim, straddle: false };

  private collideRagdollVsBike(spec: number): void {
    const t = this.tuning;
    const dt = this.dt;
    const c = cos(this.an[CHASSIS]!);
    const s = sin(this.an[CHASSIS]!);
    const prim = this.bikePrim;
    const m = this.bikeManifold;
    for (let i = 0; i < NRAG; i++) {
      const b = RAG0 + i;
      const limb = RAG_LIMBS[i]!;
      const speed = Math.sqrt(this.vx[b]! * this.vx[b]! + this.vy[b]! * this.vy[b]!) + Math.abs(this.av[b]!) * limb.len;
      const margin = spec + speed * dt;
      const nEnds = limb.len === 0 ? 1 : 2;
      for (let e = 0; e < nEnds; e++) {
        let cx = this.px[b]!;
        let cy = this.py[b]!;
        if (limb.len > 0) {
          const cb = cos(this.an[b]!);
          const sb = sin(this.an[b]!);
          const sign = e === 0 ? 1 : -1;
          cx += -sb * limb.len * 0.5 * sign;
          cy += cb * limb.len * 0.5 * sign;
        }
        for (let w = 0; w < 2; w++) {
          const wb = w === 0 ? REAR : FRONT;
          prim.body = wb;
          prim.surface = 4;
          prim.cx = this.px[wb]!;
          prim.cy = this.py[wb]!;
          prim.r = t.wheel.radius;
          if (circleVsPrim(cx, cy, limb.r, prim, 0, m) && m.sep < margin) this.emitBodyContact(b, cx, cy, limb.r, m);
        }
        prim.body = CHASSIS;
        prim.surface = 2;
        for (const fc of t.chassis.circles) {
          prim.cx = this.px[CHASSIS]! + fc.x * c - fc.y * s;
          prim.cy = this.py[CHASSIS]! + fc.x * s + fc.y * c;
          prim.r = fc.r;
          if (circleVsPrim(cx, cy, limb.r, prim, 0, m) && m.sep < margin) this.emitBodyContact(b, cx, cy, limb.r, m);
        }
      }
    }
  }

  private emitBodyContact(body: number, cx: number, cy: number, r: number, m: Manifold): void {
    this.qBody = body;
    this.qCx = cx;
    this.qCy = cy;
    this.qR = r;
    this.qWheel = 0;
    this.qSensor = false;
    this.qRag = true;
    this.addContact(m);
  }

  private queryBodyCircle(body: number, cx: number, cy: number, r: number, margin: number, rag: boolean): void {
    this.qBody = body;
    this.qCx = cx;
    this.qCy = cy;
    this.qR = r;
    this.qWheel = 0;
    this.qSensor = false;
    this.qRag = rag;
    this.col!.queryCircle(cx, cy, r, margin, this.bodyAngle, this.onManifold);
  }

  private querySensor(cx: number, cy: number, r: number): void {
    this.qSensor = true;
    this.qSensorHit = false;
    this.col!.queryCircle(cx, cy, r, 0, this.bodyAngle, this.onManifold);
    if (this.qSensorHit) this.U[U_CRASH_PENDING] = 1;
  }

  private addContact(m: Manifold): void {
    if (this.qSensor) {
      if (m.sep < 0) this.qSensorHit = true;
      return;
    }
    const i = this.nC;
    if (i >= MAX_CONTACTS) return;
    const A = this.qBody;
    const B = m.prim.body;
    const nx = m.nx;
    const ny = m.ny;
    const dt = this.dt;
    const t = this.tuning;
    const pax = this.qCx - nx * this.qR;
    const pay = this.qCy - ny * this.qR;
    const rax = pax - this.px[A]!;
    const ray = pay - this.py[A]!;
    let rbx = 0;
    let rby = 0;
    let imB = 0;
    let iiB = 0;
    let vbx = 0;
    let vby = 0;
    if (B >= 0) {
      rbx = m.px - this.px[B]!;
      rby = m.py - this.py[B]!;
      imB = this.im[B]!;
      iiB = this.ii[B]!;
      vbx = this.vx[B]! - this.av[B]! * rby;
      vby = this.vy[B]! + this.av[B]! * rbx;
    }
    const imA = this.im[A]!;
    const iiA = this.ii[A]!;
    const rnA = rax * ny - ray * nx;
    const rnB = rbx * ny - rby * nx;
    const tx = -ny;
    const ty = nx;
    const rtA = rax * ty - ray * tx;
    const rtB = rbx * ty - rby * tx;
    this.cA[i] = A;
    this.cB[i] = B;
    this.cSurf[i] = m.prim.surface;
    this.cWheel[i] = this.qWheel;
    this.cPx[i] = m.px;
    this.cPy[i] = m.py;
    this.cNx[i] = nx;
    this.cNy[i] = ny;
    this.cRAx[i] = rax;
    this.cRAy[i] = ray;
    this.cRBx[i] = rbx;
    this.cRBy[i] = rby;
    this.cMassN[i] = 1 / (imA + imB + iiA * rnA * rnA + iiB * rnB * rnB);
    this.cMassT[i] = 1 / (imA + imB + iiA * rtA * rtA + iiB * rtB * rtB);
    this.cLn[i] = 0;
    this.cLt[i] = 0;
    this.cSep0[i] = m.sep;
    // restitution 0 for bike bodies: approach no faster than the gap allows, never a push-out here
    const vax = this.vx[A]! - this.av[A]! * ray;
    const vay = this.vy[A]! + this.av[A]! * rax;
    const vn = (vax - vbx) * nx + (vay - vby) * ny;
    let vnMin = m.sep > 0 ? -m.sep / dt : 0;
    if (this.qRag && vn < -1) vnMin = Math.max(vnMin, -t.ragdoll.restitution * vn);
    this.cVnMin[i] = vnMin;
    if (this.qWheel === 1) this.cMuBase[i] = t.tyre.mu[SURFACES[m.prim.surface] ?? 'dirt'] ?? 1.9;
    else this.cMuBase[i] = this.qRag ? t.ragdoll.mu : t.chassis.mu;
    this.cMu[i] = this.cMuBase[i]!;
    this.nC = i + 1;
  }

  private solve(riding: boolean): void {
    const t = this.tuning;
    const dt = this.dt;
    const iters = t.solver.velIters;
    const vx = this.vx;
    const vy = this.vy;
    const av = this.av;
    const im = this.im;
    const ii = this.ii;
    const W = this.totalMass() * this.g;
    const Cs = t.tyre.Cs;

    for (let w = 0; w < 2; w++) {
      this.sLimLo[w] = 0;
      this.sLimHi[w] = 0;
      this.sBrake[w] = 0;
    }
    const rag = this.U[U_RAGDOLL] === 1;
    if (rag) this.ragLambda.fill(0);
    this.seesawLambda.fill(0);
    this.holdLam.fill(0);
    this.holdLamT.fill(0);

    const fx = this.px[CHASSIS]!;
    const fy = this.py[CHASSIS]!;
    const wheelB = WHEEL_BODIES;
    const brakeIn = riding ? this.F[S_BRAKE_EFF]! : 1;
    this.dBrakeAssist = 0;

    for (let it = 0; it < iters; it++) {
      // --- sliders: bilateral perpendicular constraint, then travel limits (no restitution, no Baumgarte)
      for (let w = 0; w < 2; w++) {
        const wb = wheelB[w]!;
        const rx = this.px[wb]! - fx;
        const ry = this.py[wb]! - fy;
        const nx = this.sNx[w]!;
        const ny = this.sNy[w]!;
        {
          const rn = rx * ny - ry * nx;
          const mass = 1 / (im[wb]! + im[CHASSIS]! + ii[CHASSIS]! * rn * rn);
          const relx = vx[wb]! - (vx[CHASSIS]! - av[CHASSIS]! * ry);
          const rely = vy[wb]! - (vy[CHASSIS]! + av[CHASSIS]! * rx);
          const lambda = -mass * (relx * nx + rely * ny);
          vx[wb] = vx[wb]! + lambda * nx * im[wb]!;
          vy[wb] = vy[wb]! + lambda * ny * im[wb]!;
          vx[CHASSIS] = vx[CHASSIS]! - lambda * nx * im[CHASSIS]!;
          vy[CHASSIS] = vy[CHASSIS]! - lambda * ny * im[CHASSIS]!;
          av[CHASSIS] = av[CHASSIS]! - ii[CHASSIS]! * rn * lambda;
        }
        const ax = this.sAx[w]!;
        const ay = this.sAy[w]!;
        const st = w === 0 ? t.suspension.rear : t.suspension.front;
        const comp = this.sComp[w]!;
        const ra = rx * ay - ry * ax;
        const massA = 1 / (im[wb]! + im[CHASSIS]! + ii[CHASSIS]! * ra * ra);
        if (comp < 0.03) {
          const relx = vx[wb]! - (vx[CHASSIS]! - av[CHASSIS]! * ry);
          const rely = vy[wb]! - (vy[CHASSIS]! + av[CHASSIS]! * rx);
          const rate = relx * ax + rely * ay;
          const vnMin = comp > 0 ? -comp / dt : 0;
          let lambda = -massA * (rate - vnMin);
          const old = this.sLimLo[w]!;
          const acc = Math.max(0, old + lambda);
          lambda = acc - old;
          this.sLimLo[w] = acc;
          vx[wb] = vx[wb]! + lambda * ax * im[wb]!;
          vy[wb] = vy[wb]! + lambda * ay * im[wb]!;
          vx[CHASSIS] = vx[CHASSIS]! - lambda * ax * im[CHASSIS]!;
          vy[CHASSIS] = vy[CHASSIS]! - lambda * ay * im[CHASSIS]!;
          av[CHASSIS] = av[CHASSIS]! - ii[CHASSIS]! * ra * lambda;
        }
        const room = st.travel - comp;
        if (room < 0.03) {
          const relx = vx[wb]! - (vx[CHASSIS]! - av[CHASSIS]! * ry);
          const rely = vy[wb]! - (vy[CHASSIS]! + av[CHASSIS]! * rx);
          const rate = -(relx * ax + rely * ay);
          const vnMin = room > 0 ? -room / dt : 0;
          let lambda = -massA * (rate - vnMin);
          const old = this.sLimHi[w]!;
          const acc = Math.max(0, old + lambda);
          lambda = acc - old;
          this.sLimHi[w] = acc;
          vx[wb] = vx[wb]! - lambda * ax * im[wb]!;
          vy[wb] = vy[wb]! - lambda * ay * im[wb]!;
          vx[CHASSIS] = vx[CHASSIS]! + lambda * ax * im[CHASSIS]!;
          vy[CHASSIS] = vy[CHASSIS]! + lambda * ay * im[CHASSIS]!;
          av[CHASSIS] = av[CHASSIS]! + ii[CHASSIS]! * ra * lambda;
        }
      }

      // --- R8 hold envelope: the rider on the bike is a closed chain with hard, one-sided ends. Four limits between the
      // rider body and the chassis, solved as impulses with restitution 0 (accumulated, clamped >= 0, a velocity bias
      // that lets a limit be reached exactly and pushes a penetration out at hold.posBeta per tick): the hips within
      // legReach of the pegs, above the seat line and behind the tank line, the chest within armReach of the grip.
      // The servo (forces) is the muscles; these are the bones, the seat and the bars. Before R8 an 8 g landing put the
      // body 1.25 m through the chassis and a whipped bike left it hanging 2 m off on the servo's Hill cap (physics.md
      // R7 "COM band"). The reach impulses (leg, arm) are what the hands and feet hold: summed into S_GRIP_J for the
      // thrown-rider fault in derive().
      if (riding) this.solveHold();

      // --- seesaw angle limits
      for (let sI = 0; sI < this.nSeesaw; sI++) {
        const b = FIRST_DYN + sI;
        const maxA = this.col!.seesawBodies[sI]!.collider.maxAngle;
        const a = this.an[b]!;
        const massA = 1 / ii[b]!;
        {
          const sep = maxA - a;
          if (sep < 0.05) {
            const vnMin = sep > 0 ? -sep / dt : 0;
            let lambda = -massA * (-av[b]! - vnMin);
            const old = this.seesawLambda[sI * 2]!;
            const acc = Math.max(0, old + lambda);
            lambda = acc - old;
            this.seesawLambda[sI * 2] = acc;
            av[b] = av[b]! - lambda * ii[b]!;
          }
        }
        {
          const sep = a + maxA;
          if (sep < 0.05) {
            const vnMin = sep > 0 ? -sep / dt : 0;
            let lambda = -massA * (av[b]! - vnMin);
            const old = this.seesawLambda[sI * 2 + 1]!;
            const acc = Math.max(0, old + lambda);
            lambda = acc - old;
            this.seesawLambda[sI * 2 + 1] = acc;
            av[b] = av[b]! + lambda * ii[b]!;
          }
        }
      }

      // --- contacts: normal, then friction (brush for tyres, Coulomb for the rest)
      const nC = this.nC;
      for (let i = 0; i < nC; i++) {
        const A = this.cA[i]!;
        const B = this.cB[i]!;
        const nx = this.cNx[i]!;
        const ny = this.cNy[i]!;
        const rax = this.cRAx[i]!;
        const ray = this.cRAy[i]!;
        const rbx = this.cRBx[i]!;
        const rby = this.cRBy[i]!;
        {
          let rvx = vx[A]! - av[A]! * ray;
          let rvy = vy[A]! + av[A]! * rax;
          if (B >= 0) {
            rvx -= vx[B]! - av[B]! * rby;
            rvy -= vy[B]! + av[B]! * rbx;
          }
          const vn = rvx * nx + rvy * ny;
          let lambda = -this.cMassN[i]! * (vn - this.cVnMin[i]!);
          const old = this.cLn[i]!;
          const acc = Math.max(0, old + lambda);
          lambda = acc - old;
          this.cLn[i] = acc;
          vx[A] = vx[A]! + lambda * nx * im[A]!;
          vy[A] = vy[A]! + lambda * ny * im[A]!;
          av[A] = av[A]! + ii[A]! * (rax * ny - ray * nx) * lambda;
          if (B >= 0) {
            vx[B] = vx[B]! - lambda * nx * im[B]!;
            vy[B] = vy[B]! - lambda * ny * im[B]!;
            av[B] = av[B]! - ii[B]! * (rbx * ny - rby * nx) * lambda;
          }
        }
        {
          const tx = -ny;
          const ty = nx;
          let rvx = vx[A]! - av[A]! * ray;
          let rvy = vy[A]! + av[A]! * rax;
          if (B >= 0) {
            rvx -= vx[B]! - av[B]! * rby;
            rvy -= vy[B]! + av[B]! * rbx;
          }
          const vt = rvx * tx + rvy * ty;
          const mT = this.cMassT[i]!;
          let lambda: number;
          let mu: number;
          if (this.cWheel[i] === 1) {
            mu = tyreMu(t.tyre, this.cMuBase[i]!, this.cLn[i]! / dt, W);
            lambda = brushImpulse(Cs, dt, mT, vt);
          } else {
            mu = this.cMuBase[i]!;
            lambda = -mT * vt;
          }
          this.cMu[i] = mu;
          const maxF = mu * this.cLn[i]!;
          const old = this.cLt[i]!;
          const acc = clamp(old + lambda, -maxF, maxF);
          lambda = acc - old;
          this.cLt[i] = acc;
          vx[A] = vx[A]! + lambda * tx * im[A]!;
          vy[A] = vy[A]! + lambda * ty * im[A]!;
          av[A] = av[A]! + ii[A]! * (rax * ty - ray * tx) * lambda;
          if (B >= 0) {
            vx[B] = vx[B]! - lambda * tx * im[B]!;
            vy[B] = vy[B]! - lambda * ty * im[B]!;
            av[B] = av[B]! - ii[B]! * (rbx * ty - rby * tx) * lambda;
          }
        }
      }

      // --- brakes: torque-capped spin locks wheel <-> chassis (§8: no caps of any kind while riding). R8 Astra port
      // (405f894): the Rookie's rear-lift protection trims the front caliper from the same contact loads the tyres
      // see - the total braking force that would lift the rear about the front contact patch (gravity's righting
      // moment M g x the COM's lever behind the patch over the COM's height above it, 10 % margin, the nose-down
      // rate anticipated over `liftLookahead`), less the rear tyre's braking force, is the front caliper's ceiling;
      // faded out with |lean| 0.5 -> 0.8 (brake + lean +1 is still the stoppie). Pro: liftControl 0.
      if (brakeIn > 0) {
        let frontLimit = Infinity;
        const assist = riding ? t.brakes.liftControl * clamp((0.8 - Math.abs(this.F[S_IN_L]!)) / 0.3, 0, 1) : 0;
        if (assist > 0) {
          let frontContact = -1;
          let rearBrake = 0;
          for (let i = 0; i < nC; i++) {
            if (this.cA[i] === FRONT && this.cLn[i]! > 0 && (frontContact < 0 || this.cLn[i]! > this.cLn[frontContact]!)) frontContact = i;
            if (this.cA[i] === REAR) rearBrake += Math.max(0, this.cLt[i]!) / dt;
          }
          if (frontContact >= 0) {
            const mass = this.totalMass();
            const mx = (t.chassis.mass * this.px[CHASSIS]! + t.wheel.rearMass * this.px[REAR]! + t.wheel.frontMass * this.px[FRONT]! + t.rider.mass * this.px[RIDER]!) / mass;
            const my = (t.chassis.mass * this.py[CHASSIS]! + t.wheel.rearMass * this.py[REAR]! + t.wheel.frontMass * this.py[FRONT]! + t.rider.mass * this.py[RIDER]!) / mass;
            const nx = this.cNx[frontContact]!;
            const ny = this.cNy[frontContact]!;
            const dx = mx - this.px[FRONT]! - this.cRAx[frontContact]!;
            const dy = my - this.py[FRONT]! - this.cRAy[frontContact]!;
            const height = dx * nx + dy * ny;
            if (height > 0.1) {
              const margin = -dx + Math.min(0, av[CHASSIS]!) * height * t.brakes.liftLookahead;
              const safeForce = Math.max(0, (0.9 * mass * this.g * margin) / height);
              frontLimit = Math.max(0, safeForce - rearBrake) * t.wheel.radius;
            }
          }
        }
        for (let w = 0; w < 2; w++) {
          const wb = wheelB[w]!;
          let maxNm = t.brakes.totalNm * (w === 0 ? 1 - t.brakes.frontFrac : t.brakes.frontFrac);
          if (!riding) maxNm *= w === 0 ? t.ragdoll.crashRearBrake : t.ragdoll.crashFrontBrake;
          let maxJ = brakeIn * maxNm * dt;
          if (w === 1 && Number.isFinite(frontLimit)) {
            const trim = assist * Math.max(0, maxJ - frontLimit * dt);
            this.dBrakeAssist = maxJ > 0 ? trim / maxJ : 0;
            maxJ -= trim;
          }
          const rel = av[wb]! - av[CHASSIS]!;
          const mass = 1 / (ii[wb]! + ii[CHASSIS]!);
          let lambda = -mass * rel;
          const old = this.sBrake[w]!;
          const acc = clamp(old + lambda, -maxJ, maxJ);
          lambda = acc - old;
          this.sBrake[w] = acc;
          av[wb] = av[wb]! + lambda * ii[wb]!;
          av[CHASSIS] = av[CHASSIS]! - lambda * ii[CHASSIS]!;
        }
      }

      // --- ragdoll joints (as v1)
      if (rag) this.solveRagdollJoints(it === 0);
    }
  }

  /** One velocity iteration of the four hold limits (R8). */
  private solveHold(): void {
    const t = this.tuning;
    const r = t.rider;
    const h = r.hold;
    const dt = this.dt;
    const vx = this.vx;
    const vy = this.vy;
    const av = this.av;
    const im = this.im;
    const ii = this.ii;
    const c = cos(this.an[CHASSIS]!);
    const s = sin(this.an[CHASSIS]!);
    const cr = cos(this.an[RIDER]!);
    const sr = sin(this.an[RIDER]!);
    const fx = this.px[CHASSIS]!;
    const fy = this.py[CHASSIS]!;
    const rx0 = this.px[RIDER]!;
    const ry0 = this.py[RIDER]!;
    // anchors: hips and chest on the body, pegs and grip on the chassis (world)
    const hipx = rx0 - (r.comFromHips.x * cr - r.comFromHips.y * sr);
    const hipy = ry0 - (r.comFromHips.x * sr + r.comFromHips.y * cr);
    const chx = rx0 + h.chest.x * cr - h.chest.y * sr;
    const chy = ry0 + h.chest.x * sr + h.chest.y * cr;
    const plx = r.peg.x + this.axleOrgX;
    const ply = r.peg.y + this.axleOrgY;
    const pegx = fx + plx * c - ply * s;
    const pegy = fy + plx * s + ply * c;
    const glx = r.grip.x + this.axleOrgX;
    const gly = r.grip.y + this.axleOrgY;
    const gripx = fx + glx * c - gly * s;
    const gripy = fy + glx * s + gly * c;
    // seat and tank: the hips in the chassis frame
    const hipLx = (hipx - fx) * c + (hipy - fy) * s;
    const hipLy = -(hipx - fx) * s + (hipy - fy) * c;
    for (let k = 0; k < 5; k++) {
      // rider anchor (ax, ay), chassis anchor (bx, by), the direction n along which the gap C grows, and C itself
      let ax: number;
      let ay: number;
      let bx: number;
      let by: number;
      let nx: number;
      let ny: number;
      let C: number;
      if (k === 0 || k === 1) {
        // reach: C = L - |a - b|, grows as the rider anchor moves toward the chassis anchor
        ax = k === 0 ? hipx : chx;
        ay = k === 0 ? hipy : chy;
        bx = k === 0 ? pegx : gripx;
        by = k === 0 ? pegy : gripy;
        const dx = ax - bx;
        const dy = ay - by;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1e-6) continue;
        nx = -dx / d;
        ny = -dy / d;
        C = (k === 0 ? h.legReach : h.armReach) - d;
      } else if (k === 4) {
        // elbow stop (R8 Astra port, 405f894): C = |chest - grip| - armMin, grows as the chest moves away from the grip -
        // the folded arm is a strut; the hands push on the bars (a front slam pitching the body onto the bars)
        if (h.armMin <= 0) continue;
        ax = chx;
        ay = chy;
        bx = gripx;
        by = gripy;
        const dx = ax - bx;
        const dy = ay - by;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1e-6) continue;
        // R9: the strut only acts with the chest ABOVE the grip line (chassis up): off at and below the bar, full `armMinFade`
        // above it. Above the line the push has an upward component and, the chest being ahead of the body COM, rights the body;
        // with the chest under the bar the push points down and forms a couple with the linear servo's pull on the COM (600-900 N
        // x 0.41 m) that the 300 N m torque cap cannot break - x3 Pro 74-81 m held the torso flat, 37-44 deg forward, for 0.6 s
        // at 12-14 m/s with the torque pinned (physics.md v2 status R9). Below the bar the hands hang: R8's behaviour.
        const chestUp = -dx * s + dy * c;
        const armMinEff = h.armMin * clamp(chestUp / h.armMinFade, 0, 1);
        if (armMinEff <= 0) continue;
        nx = dx / d;
        ny = dy / d;
        C = d - armMinEff;
      } else if (k === 2) {
        // seat: C = hips height above the seat line, chassis up; the reaction on the chassis at the seat under the hips
        ax = hipx;
        ay = hipy;
        bx = hipx;
        by = hipy;
        nx = -s;
        ny = c;
        C = hipLy - h.seatY;
      } else {
        // tank: C = the hips' room behind the tank line, chassis backward; the reaction on the chassis at the hips
        ax = hipx;
        ay = hipy;
        bx = hipx;
        by = hipy;
        nx = -c;
        ny = -s;
        C = h.tankX - hipLx;
      }
      if (C >= 0.03) continue;
      const rax = ax - rx0;
      const ray = ay - ry0;
      const rbx = bx - fx;
      const rby = by - fy;
      const rna = rax * ny - ray * nx;
      const rnb = rbx * ny - rby * nx;
      const mass = 1 / (im[RIDER]! + im[CHASSIS]! + ii[RIDER]! * rna * rna + ii[CHASSIS]! * rnb * rnb);
      const relx = vx[RIDER]! - av[RIDER]! * ray - (vx[CHASSIS]! - av[CHASSIS]! * rby);
      const rely = vy[RIDER]! + av[RIDER]! * rax - (vy[CHASSIS]! + av[CHASSIS]! * rbx);
      const vn = relx * nx + rely * ny;
      const vnMin = C > 0 ? -C / dt : (-C * h.posBeta) / dt;
      let lambda = -mass * (vn - vnMin);
      const old = this.holdLam[k]!;
      const acc = Math.max(0, old + lambda);
      lambda = acc - old;
      this.holdLam[k] = acc;
      vx[RIDER] = vx[RIDER]! + lambda * nx * im[RIDER]!;
      vy[RIDER] = vy[RIDER]! + lambda * ny * im[RIDER]!;
      av[RIDER] = av[RIDER]! + ii[RIDER]! * rna * lambda;
      vx[CHASSIS] = vx[CHASSIS]! - lambda * nx * im[CHASSIS]!;
      vy[CHASSIS] = vy[CHASSIS]! - lambda * ny * im[CHASSIS]!;
      av[CHASSIS] = av[CHASSIS]! - ii[CHASSIS]! * rnb * lambda;
      if (k < 2 || k === 4 || acc <= 0) continue;
      // seat / tank friction: the body does not slide along the seat it is pressed onto (a 15 g rear-first landing
      // slid the hips 0.2 m back along a frictionless seat until the arms snapped taut - a thrown rider that was not)
      {
        const tx = -ny;
        const ty = nx;
        const rta = rax * ty - ray * tx;
        const rtb = rbx * ty - rby * tx;
        const massT = 1 / (im[RIDER]! + im[CHASSIS]! + ii[RIDER]! * rta * rta + ii[CHASSIS]! * rtb * rtb);
        const rvx = vx[RIDER]! - av[RIDER]! * ray - (vx[CHASSIS]! - av[CHASSIS]! * rby);
        const rvy = vy[RIDER]! + av[RIDER]! * rax - (vy[CHASSIS]! + av[CHASSIS]! * rbx);
        const vt = rvx * tx + rvy * ty;
        const maxF = h.mu * acc;
        const oldT = this.holdLamT[k]!;
        const accT = clamp(oldT - massT * vt, -maxF, maxF);
        const lt = accT - oldT;
        this.holdLamT[k] = accT;
        vx[RIDER] = vx[RIDER]! + lt * tx * im[RIDER]!;
        vy[RIDER] = vy[RIDER]! + lt * ty * im[RIDER]!;
        av[RIDER] = av[RIDER]! + ii[RIDER]! * rta * lt;
        vx[CHASSIS] = vx[CHASSIS]! - lt * tx * im[CHASSIS]!;
        vy[CHASSIS] = vy[CHASSIS]! - lt * ty * im[CHASSIS]!;
        av[CHASSIS] = av[CHASSIS]! - ii[CHASSIS]! * rtb * lt;
      }
    }
  }

  private solveRagdollJoints(damp: boolean): void {
    const dt = this.dt;
    const bj = this.tuning.solver.jointBaumgarte;
    const vx = this.vx;
    const vy = this.vy;
    const av = this.av;
    const im = this.im;
    const ii = this.ii;
    for (let j = 0; j < RAG_JOINTS.length; j++) {
      const [pi, ci, py0, cy0, range] = RAG_JOINTS[j]!;
      const P = RAG0 + pi;
      const C = RAG0 + ci;
      const cp = cos(this.an[P]!);
      const sp = sin(this.an[P]!);
      const cc = cos(this.an[C]!);
      const sc = sin(this.an[C]!);
      const rpx = -sp * py0;
      const rpy = cp * py0;
      const rcx = -sc * cy0;
      const rcy = cc * cy0;
      const ex = this.px[C]! + rcx - (this.px[P]! + rpx);
      const ey = this.py[C]! + rcy - (this.py[P]! + rpy);
      for (let axis = 0; axis < 2; axis++) {
        const nx = axis === 0 ? 1 : 0;
        const ny = axis === 0 ? 0 : 1;
        const rnP = rpx * ny - rpy * nx;
        const rnC = rcx * ny - rcy * nx;
        const mass = 1 / (im[P]! + im[C]! + ii[P]! * rnP * rnP + ii[C]! * rnC * rnC);
        const vpx = vx[P]! - av[P]! * rpy;
        const vpy = vy[P]! + av[P]! * rpx;
        const vcx = vx[C]! - av[C]! * rcy;
        const vcy = vy[C]! + av[C]! * rcx;
        const cdot = (vcx - vpx) * nx + (vcy - vpy) * ny;
        const err = axis === 0 ? ex : ey;
        const lambda = -mass * (cdot + (bj * err) / dt);
        vx[C] = vx[C]! + lambda * nx * im[C]!;
        vy[C] = vy[C]! + lambda * ny * im[C]!;
        av[C] = av[C]! + ii[C]! * rnC * lambda;
        vx[P] = vx[P]! - lambda * nx * im[P]!;
        vy[P] = vy[P]! - lambda * ny * im[P]!;
        av[P] = av[P]! - ii[P]! * rnP * lambda;
      }
      const massA = 1 / (ii[P]! + ii[C]!);
      if (damp) {
        const cd = this.tuning.ragdoll.jointDamping * dt;
        const relW0 = av[C]! - av[P]!;
        const lambda = (-cd * relW0) / (1 + cd / massA);
        av[C] = av[C]! + lambda * ii[C]!;
        av[P] = av[P]! - lambda * ii[P]!;
      }
      const rel = wrapAngle(this.an[C]! - this.an[P]! - this.F[S_RAG_REST + j]!);
      const relW = av[C]! - av[P]!;
      if (rel > range - 0.1) {
        const sep = range - rel;
        const vnMin = sep > 0 ? -sep / dt : (bj * -sep) / dt;
        let lambda = -massA * (-relW - vnMin);
        const old = this.ragLambda[j * 3]!;
        const acc = Math.max(0, old + lambda);
        lambda = acc - old;
        this.ragLambda[j * 3] = acc;
        av[C] = av[C]! - lambda * ii[C]!;
        av[P] = av[P]! + lambda * ii[P]!;
      } else if (rel < -range + 0.1) {
        const sep = rel + range;
        const vnMin = sep > 0 ? -sep / dt : (bj * -sep) / dt;
        let lambda = -massA * (relW - vnMin);
        const old = this.ragLambda[j * 3 + 1]!;
        const acc = Math.max(0, old + lambda);
        lambda = acc - old;
        this.ragLambda[j * 3 + 1] = acc;
        av[C] = av[C]! + lambda * ii[C]!;
        av[P] = av[P]! - lambda * ii[P]!;
      }
    }
  }

  private integrate(): void {
    const dt = this.dt;
    const nb = this.nBodies;
    const rag = this.U[U_RAGDOLL] === 1;
    for (let b = 0; b < nb; b++) {
      if (b >= RAG0 && b < FIRST_DYN && !rag) continue;
      if (b === RIDER && this.U[U_FAULT] !== 0) continue;
      this.px[b] = this.px[b]! + this.vx[b]! * dt;
      this.py[b] = this.py[b]! + this.vy[b]! * dt;
      this.an[b] = this.an[b]! + this.av[b]! * dt;
    }
  }

  /**
   * Split-impulse position pass (§3 step 7): sliders (perpendicular drift, travel), seesaw limits, then
   * contact penetrations beyond `slop`, each linearised about the collide-time pose. Velocities untouched.
   */
  private positionPass(): void {
    const t = this.tuning;
    const im = this.im;
    const ii = this.ii;
    const px = this.px;
    const py = this.py;
    const an = this.an;
    const slop = t.solver.slop;
    const beta = t.solver.posBeta;
    for (let it = 0; it < t.solver.posIters; it++) {
      for (let w = 0; w < 2; w++) {
        const st = w === 0 ? t.suspension.rear : t.suspension.front;
        const wb = w === 0 ? REAR : FRONT;
        // perpendicular drift (the arm-length error on the hinge): remove it fully
        this.suspensionGeometry(w);
        {
          const nx = this.sNx[w]!;
          const ny = this.sNy[w]!;
          const rx = px[wb]! - px[CHASSIS]!;
          const ry = py[wb]! - py[CHASSIS]!;
          const perp = this.sPerp[w]!;
          const rn = rx * ny - ry * nx;
          const mass = 1 / (im[wb]! + im[CHASSIS]! + ii[CHASSIS]! * rn * rn);
          const lambda = -perp * mass;
          px[wb] = px[wb]! + lambda * nx * im[wb]!;
          py[wb] = py[wb]! + lambda * ny * im[wb]!;
          px[CHASSIS] = px[CHASSIS]! - lambda * nx * im[CHASSIS]!;
          py[CHASSIS] = py[CHASSIS]! - lambda * ny * im[CHASSIS]!;
          an[CHASSIS] = an[CHASSIS]! - ii[CHASSIS]! * rn * lambda;
        }
        // travel (re-read after the drift fix: on the hinge the tangent turned with it)
        this.suspensionGeometry(w);
        {
          const ax = this.sAx[w]!;
          const ay = this.sAy[w]!;
          const rx = px[wb]! - px[CHASSIS]!;
          const ry = py[wb]! - py[CHASSIS]!;
          const comp = this.sComp[w]!;
          const ra = rx * ay - ry * ax;
          const massA = 1 / (im[wb]! + im[CHASSIS]! + ii[CHASSIS]! * ra * ra);
          let err = 0;
          if (comp < 0) err = comp;
          else if (comp > st.travel) err = comp - st.travel;
          if (err !== 0) {
            const lambda = -err * massA;
            px[wb] = px[wb]! + lambda * ax * im[wb]!;
            py[wb] = py[wb]! + lambda * ay * im[wb]!;
            px[CHASSIS] = px[CHASSIS]! - lambda * ax * im[CHASSIS]!;
            py[CHASSIS] = py[CHASSIS]! - lambda * ay * im[CHASSIS]!;
            an[CHASSIS] = an[CHASSIS]! - ii[CHASSIS]! * ra * lambda;
          }
        }
      }
      for (let sI = 0; sI < this.nSeesaw; sI++) {
        const b = FIRST_DYN + sI;
        const maxA = this.col!.seesawBodies[sI]!.collider.maxAngle;
        an[b] = clamp(an[b]!, -maxA, maxA);
      }
      const nC = this.nC;
      for (let i = 0; i < nC; i++) {
        const A = this.cA[i]!;
        const B = this.cB[i]!;
        const nx = this.cNx[i]!;
        const ny = this.cNy[i]!;
        const rax = this.cRAx[i]!;
        const ray = this.cRAy[i]!;
        const rnA = rax * ny - ray * nx;
        let sep = this.cSep0[i]! + (px[A]! - this.p0x[A]!) * nx + (py[A]! - this.p0y[A]!) * ny + (an[A]! - this.a0[A]!) * rnA;
        let rnB = 0;
        if (B >= 0) {
          const rbx = this.cRBx[i]!;
          const rby = this.cRBy[i]!;
          rnB = rbx * ny - rby * nx;
          sep -= (px[B]! - this.p0x[B]!) * nx + (py[B]! - this.p0y[B]!) * ny + (an[B]! - this.a0[B]!) * rnB;
        }
        if (sep >= -slop) continue;
        let corr = -beta * (sep + slop);
        if (corr > 0.2) corr = 0.2;
        const lambda = corr * this.cMassN[i]!;
        px[A] = px[A]! + lambda * nx * im[A]!;
        py[A] = py[A]! + lambda * ny * im[A]!;
        an[A] = an[A]! + ii[A]! * rnA * lambda;
        if (B >= 0) {
          px[B] = px[B]! - lambda * nx * im[B]!;
          py[B] = py[B]! - lambda * ny * im[B]!;
          an[B] = an[B]! - ii[B]! * rnB * lambda;
        }
      }
    }
  }

  private derive(riding: boolean): void {
    const F = this.F;
    const U = this.U;
    const t = this.tuning;
    const dt = this.dt;
    const track = this.track!;
    const R = t.wheel.radius;

    const c = cos(this.an[CHASSIS]!);
    const s = sin(this.an[CHASSIS]!);
    const prevRearComp = F[S_REAR_COMP]!;
    for (let w = 0; w < 2; w++) {
      const st = w === 0 ? t.suspension.rear : t.suspension.front;
      this.suspensionGeometry(w);
      F[w === 0 ? S_REAR_COMP : S_FRONT_COMP] = clamp(this.sComp[w]! / st.travel, 0, 1);
    }

    let rearLn = 0;
    let frontLn = 0;
    let rearSurf = -1;
    let frontSurf = -1;
    let rearBest = 0;
    let frontBest = 0;
    for (let i = 0; i < this.nC; i++) {
      const A = this.cA[i]!;
      const ln = this.cLn[i]!;
      if (A === REAR) {
        rearLn += ln;
        if (ln > rearBest) {
          rearBest = ln;
          rearSurf = this.cSurf[i]!;
        }
      } else if (A === FRONT) {
        frontLn += ln;
        if (ln > frontBest) {
          frontBest = ln;
          frontSurf = this.cSurf[i]!;
        }
      }
    }
    const rearGnd = rearLn > 0 ? 1 : 0;
    const frontGnd = frontLn > 0 ? 1 : 0;
    const tick = F[S_TICK]!;
    if (rearGnd === 1) {
      if (F[S_REAR_AIR]! >= 6) this.events.push({ type: 'land', impulse: rearLn, wheel: 'rear', surface: SURFACES[rearSurf] ?? 'dirt', tick });
      F[S_REAR_AIR] = 0;
    } else F[S_REAR_AIR] = F[S_REAR_AIR]! + 1;
    if (frontGnd === 1) {
      if (F[S_FRONT_AIR]! >= 6) this.events.push({ type: 'land', impulse: frontLn, wheel: 'front', surface: SURFACES[frontSurf] ?? 'dirt', tick });
      F[S_FRONT_AIR] = 0;
    } else F[S_FRONT_AIR] = F[S_FRONT_AIR]! + 1;
    U[U_REAR_GND] = rearGnd;
    U[U_FRONT_GND] = frontGnd;
    U[U_REAR_SURF] = rearGnd ? rearSurf + 1 : 0;
    U[U_FRONT_SURF] = frontGnd ? frontSurf + 1 : 0;

    const groundSpeed = this.vx[REAR]! * c + this.vy[REAR]! * s;
    F[S_REAR_SLIP] = -this.av[REAR]! * R - groundSpeed;

    // derived hopPhase (§16.1): push > preload > recover > idle
    {
      let hop = 0;
      if (riding) {
        // the body's velocity relative to the chassis AT the body (the chassis's rotation about its COM removed -
        // R7: a bike pitching at 4 rad/s carried a 2.5 m/s tangential term and read 'push' on a landing), chassis-up
        const rrx = this.px[RIDER]! - this.px[CHASSIS]!;
        const rry = this.py[RIDER]! - this.py[CHASSIS]!;
        const wc = this.av[CHASSIS]!;
        const relVy = -(this.vx[RIDER]! - this.vx[CHASSIS]! + wc * rry) * s + (this.vy[RIDER]! - this.vy[CHASSIS]! - wc * rrx) * c;
        poseAt(t.rider.poses, 0, this.poseTmp);
        const rearAir = F[S_REAR_AIR]!;
        const frontAir = F[S_FRONT_AIR]!;
        // push = the rider extending on purpose: the body leaving the chassis at > 0.5 m/s WITH intent (R7; a chassis
        // dropping under a settled body on a front slam is not a push, and a hop needs an input edge within ~0.3 s)
        if (relVy > 0.5 && F[S_TGT_MOVE]! >= 0.5 * t.rider.servoIntentM) hop = 2;
        else if (F[S_TGT_Y]! < this.poseTmp.y - 0.01 && F[S_REAR_COMP]! > prevRearComp) hop = 1;
        else if (rearAir > 0 && frontAir > 0 && (rearAir < frontAir ? frontAir : rearAir) <= RECOVER_TICKS) hop = 3;
      }
      U[U_HOP] = hop;
    }

    if (riding) {
      const frontX = this.px[FRONT]!;
      const cps = track.def.checkpoints;
      const next = F[S_CHECKPOINT]! + 1;
      const cpDef = cps[next];
      if (cpDef && frontX >= cpDef.x) {
        F[S_CHECKPOINT] = next;
        this.events.push({ type: 'checkpoint', index: next, tick, time: F[S_TIME]! });
      }
      // crash rules (§11): body sensors, hazard, out of bounds. Nothing else. Evaluated BEFORE the finish so the
      // crossing tick's precedence rule (R6, physics.md §8.1) can read it.
      let fault = 0;
      let cause = 0;
      if (U[U_CRASH_PENDING] === 1) {
        fault = 1;
        cause = 1;
      }
      // R8 thrown rider: the reach impulses (hands on the grips, feet on the pegs) averaged over hold.gripTau exceed
      // the grip strength - the hands leave the bars. The seat and the bars (compression) never fault.
      {
        const h = t.rider.hold;
        F[S_GRIP_J] = F[S_GRIP_J]! * (1 - dt / h.gripTau) + this.holdLam[0]! + this.holdLam[1]!;
        if (fault === 0 && F[S_GRIP_J]! / h.gripTau > h.gripN) {
          fault = 1;
          cause = 2;
        }
      }
      if (fault === 0) {
        for (let b = 0; b <= RIDER; b++) {
          if (this.py[b]! < track.oobY) {
            fault = 2;
            cause = 4;
            break;
          }
        }
      }
      if (fault === 0 && track.hazards.length > 0) {
        outer: for (const hz of track.hazards) {
          for (let b = 0; b <= RIDER; b++) {
            const x = this.px[b]!;
            const y = this.py[b]!;
            const r = b === CHASSIS || b === RIDER ? 0.3 : R;
            if (x + r > hz.min.x && x - r < hz.max.x && y + r > hz.min.y && y - r < hz.max.y) {
              fault = 5;
              cause = 5;
              break outer;
            }
          }
        }
      }
      // finish (R6 precedence, physics.md §8.1): the front wheel crossing the line finishes the run - unless a fault lands in
      // the same tick with the wheel no more than one wheel radius past the line, in which case the crash is ON
      // the line and voids the finish (Trials: you cross upright). A fault with the wheel already > R past the
      // line is a crash after the finish: `finish` is emitted first, then `fault`, and the consumer (Game) treats a
      // fault after its finish as a post-finish tumble. At 21 m/s the wheel moves 0.175 m per tick, so in natural
      // play the exception is unreachable and a same-tick fault always voids; teleports (the audit probe) reach it.
      const finishX = track.def.finishX;
      if (U[U_FINISHED] === 0 && frontX >= finishX) {
        if (fault !== 0 && frontX - finishX <= R) {
          U[U_FINISH_VOID] = 1;
        } else {
          U[U_FINISHED] = 1;
          F[S_FINISH_TIME] = (tick + 1) * dt;
          this.events.push({ type: 'finish', tick: tick + 1, time: (tick + 1) * dt });
        }
      }
      if (fault !== 0) {
        U[U_FAULT] = fault;
        U[U_CRASH_CAUSE] = cause;
        U[U_FINISHED] = 1;
        this.events.push({ type: 'fault', reason: FAULTS[fault]!, tick: tick + 1, time: (tick + 1) * dt });
        this.spawnRagdoll();
      }
    } else {
      F[S_CRASH_T] = F[S_CRASH_T]! + dt;
      if (F[S_CRASH_T]! >= t.ragdoll.sleepAfter) {
        U[U_ASLEEP] = 1;
        for (let b = 0; b < this.nBodies; b++) {
          this.vx[b] = 0;
          this.vy[b] = 0;
          this.av[b] = 0;
        }
      }
    }
  }

  /** Ragdoll on the drawn chain with the rider body's actual velocity (as v1, §11). */
  private spawnRagdoll(): void {
    const t = this.tuning;
    const U = this.U;
    this.buildRiderChain();
    const X = this.chain.x;
    const Y = this.chain.y;
    const fw = this.av[CHASSIS]!;
    const fpx = this.px[CHASSIS]!;
    const fpy = this.py[CHASSIS]!;
    const relx = this.vx[RIDER]! - this.vx[CHASSIS]!;
    const rely = this.vy[RIDER]! - this.vy[CHASSIS]!;
    const spread = t.ragdoll.spread;
    const place = (i: number, cx: number, cy: number, uyx: number, uyy: number): void => {
      const b = RAG0 + i;
      const limb = RAG_LIMBS[i]!;
      this.px[b] = cx;
      this.py[b] = cy;
      this.an[b] = atan2(-uyx, uyy);
      const ox = cx - fpx;
      const oy = cy - fpy;
      this.vx[b] = this.vx[CHASSIS]! - fw * oy + relx;
      this.vy[b] = this.vy[CHASSIS]! + fw * ox + rely;
      this.av[b] = fw + (this.rng.next() * 2 - 1) * spread;
      this.im[b] = 1 / limb.mass;
      const I = limb.len === 0 ? 0.4 * limb.mass * limb.r * limb.r : (limb.mass * limb.len * limb.len) / 12 + 0.5 * limb.mass * limb.r * limb.r;
      this.ii[b] = 1 / I;
    };
    const seg = (i: number, ax: number, ay: number, bx: number, by: number): void => {
      let dx = bx - ax;
      let dy = by - ay;
      const l = Math.sqrt(dx * dx + dy * dy);
      if (l > 1e-9) {
        dx /= l;
        dy /= l;
      } else {
        dx = this.chain.dx;
        dy = this.chain.dy;
      }
      place(i, 0.5 * (ax + bx), 0.5 * (ay + by), dx, dy);
    };
    const ux = this.chain.dx;
    const uy = this.chain.dy;
    seg(1, X[0]!, Y[0]!, X[1]!, Y[1]!);
    place(2, X[0]! - ux * 0.1, Y[0]! - uy * 0.1, ux, uy);
    place(0, X[2]!, Y[2]!, this.chain.hx, this.chain.hy);
    seg(3, X[3]!, Y[3]!, X[1]!, Y[1]!);
    seg(4, X[4]!, Y[4]!, X[3]!, Y[3]!);
    seg(5, X[5]!, Y[5]!, X[0]!, Y[0]!);
    seg(6, X[6]!, Y[6]!, X[5]!, Y[5]!);
    for (let j = 0; j < RAG_JOINTS.length; j++) {
      const [pi, ci] = RAG_JOINTS[j]!;
      this.F[S_RAG_REST + j] = wrapAngle(this.an[RAG0 + ci]! - this.an[RAG0 + pi]!);
    }
    // the rider body leaves the simulation
    this.im[RIDER] = 0;
    this.ii[RIDER] = 0;
    this.vx[RIDER] = 0;
    this.vy[RIDER] = 0;
    this.av[RIDER] = 0;
    U[U_RAGDOLL] = 1;
    this.F[S_CRASH_T] = 0;
    this.F[S_THROTTLE_EFF] = 0;
  }
}

export function createBikePhysicsV2(physicsHz: number, tuning?: PartialTuningV2): BikePhysicsWorldV2 {
  return new WorldV2(physicsHz, tuning);
}

/** Axle-frame peg / grip points the servo reacts through (for tests and the lab HUD). */
export const SERVO_POINTS = { peg: { x: PEG_X, y: PEG_Y }, grip: { x: GRIP_X, y: GRIP_Y } } as const;
