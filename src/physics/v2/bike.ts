/**
 * Physics v2 world (docs/design/physics-v2.md). Bike + rigid rider, 120 Hz semi-implicit Euler,
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
import type { CompiledTrack, FaultReason, GameEvent, InputFrame, PhysicsSnapshot, PhysicsState, RagdollBody, SurfaceKind, Vec2 } from '../../core/types';
import { Rng } from '../../core/rng';
import type { PhysicsWorld } from '../index';
import { CollisionWorld, circleVsPrim, PrimKind, type Manifold, type Prim } from '../collision';
import { SURFACES } from '../tuning';
import { atan, atan2, clamp, cos, sin, wrapAngle, HALF_PI } from '../dmath';
import { bikeTuningV2, type BikeClassV2, type PartialTuningV2, type SuspensionV2, type TuningV2 } from './tuning';
import { driveTorque, lag, limiterLatch, reportRpm, thrustFrac } from './engine';
import { brushImpulse, tyreMu } from './tyre';
import { advanceTarget, buildChain, canonicalPose, GRIP_X, GRIP_Y, leanFromX, PEG_X, PEG_Y, poseAt, type ChainOut } from './rider';

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
  engine: { rpm: number; torqueNm: number; thrustN: number; limiter: boolean; throttleEff: number; brakeEff: number };
  suspension: { rear: { compression: number; rate: number; force: number }; front: { compression: number; rate: number; force: number } };
  /** The rider rigid body (the spec's additive `PhysicsState.rider.body` request, on debug() until core adds the type). */
  rider: { body: BodyDebug; servoForce: Vec2; servoTorque: number; poseTargetWorld: Vec2; lag: Vec2 };
  /** The declared attitude torque applied this tick (N m). */
  attTorque: number;
  /** Pose target in the chassis frame. */
  poseTarget: { x: number; y: number; psi: number };
  /** Combined COM ahead of / above the rear contact, live. */
  comDH: { d: number; h: number };
  balancePitch: number;
  riderChain: { hips: Vec2; shoulders: Vec2; head: Vec2; elbow: Vec2; hand: Vec2; knee: Vec2; foot: Vec2; torsoDir: Vec2; headDir: Vec2 };
  crashCause: 'sensor' | 'oob' | 'hazard' | null;
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
export const NSCALAR = F_SLOTS.length; // 33

/** Flags (physics-v2.md §12). */
export const U_SLOTS = ['finished', 'fault', 'limiter', 'restartLatch', 'rearGround', 'frontGround', 'rearSurface', 'frontSurface', 'ragdoll', 'asleep', 'crashPending', 'crashCause', 'hopPhase'] as const;
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
const U_CRASH_CAUSE = 11; // 1 sensor, 4 oob, 5 hazard
const U_HOP = 12; // derived output: 0 idle 1 preload 2 push 3 recover
export const NU = U_SLOTS.length; // 13

const FAULTS: (FaultReason | null)[] = [null, 'crash', 'out-of-bounds', 'restart', 'timeout', 'hazard'];
const HOPS: HopPhase[] = ['idle', 'preload', 'push', 'recover'];
const CAUSES: PhysicsDebugV2['crashCause'][] = [null, 'sensor', null, null, 'oob', 'hazard'];

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
  private _bike: BikeClassV2 = 'mid';
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
  private dThrust = 0;
  private dServoFx = 0;
  private dServoFy = 0;
  private dServoTq = 0;
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
  private axleOrgX = 0;
  private axleOrgY = 0;

  constructor(physicsHz: number, tuning: PartialTuningV2 | undefined) {
    this.physicsHz = physicsHz;
    this.dt = 1 / physicsHz;
    this.override = tuning;
    this._tuning = Object.freeze(bikeTuningV2('mid', tuning));
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
    this.selectBike(opts?.bike ?? 'mid');
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
      // 2 pose target (reads F only)
      advanceTarget(t.rider, dt, F[S_TGT_X]!, F[S_TGT_Y]!, F[S_TGT_PSI]!, input.lean, this.poseTmp);
      F[S_TGT_X] = this.poseTmp.x;
      F[S_TGT_Y] = this.poseTmp.y;
      F[S_TGT_PSI] = this.poseTmp.psi;
    } else {
      F[S_THROTTLE_EFF] = 0;
      F[S_BRAKE_EFF] = 1;
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
    const rear = { x: sr.axle.x + sr.axis.x * cr, y: sr.axle.y + sr.axis.y * cr };
    const front = { x: sf.axle.x + sf.axis.x * cf, y: sf.axle.y + sf.axis.y * cf };
    poseAt(t.rider.poses, lean, this.poseTmp);
    const M = this.totalMass();
    const cx = (t.wheel.rearMass * rear.x + t.wheel.frontMass * front.x + t.rider.mass * this.poseTmp.x) / M;
    const cy = (t.wheel.rearMass * rear.y + t.wheel.frontMass * front.y + t.rider.mass * this.poseTmp.y) / M;
    return { d: cx - rear.x, h: cy - (rear.y - R) };
  }

  balancePitch(lean: number, accel = 0): number {
    const { d, h } = this.comDH(lean);
    return HALF_PI - atan2(h, d) - atan(accel / this.g);
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
      engine: { rpm: reportRpm(t.engine, R, vRim, F[S_THROTTLE_EFF]!), torqueNm: this.dEngineTq, thrustN: this.dThrust, limiter: this.U[U_LIMITER] === 1, throttleEff: F[S_THROTTLE_EFF]!, brakeEff: F[S_BRAKE_EFF]! },
      suspension: {
        rear: { compression: this.sComp[0]!, rate: this.sRate[0]!, force: this.sForce[0]! },
        front: { compression: this.sComp[1]!, rate: this.sRate[1]!, force: this.sForce[1]! },
      },
      rider: {
        body: { pos: { x: this.px[RIDER]!, y: this.py[RIDER]! }, vel: { x: this.vx[RIDER]!, y: this.vy[RIDER]! }, angle: this.an[RIDER]!, angVel: this.av[RIDER]! },
        servoForce: { x: this.dServoFx, y: this.dServoFy },
        servoTorque: this.dServoTq,
        poseTargetWorld: { x: this.dTgtWx, y: this.dTgtWy },
        lag: { x: this.px[RIDER]! - this.dTgtWx, y: this.py[RIDER]! - this.dTgtWy },
      },
      attTorque: this.dAtt,
      poseTarget: { x: F[S_TGT_X]!, y: F[S_TGT_Y]!, psi: F[S_TGT_PSI]! },
      comDH: { d: mx - this.px[REAR]!, h: my - (this.py[REAR]! - R) },
      balancePitch: this.balancePitch(leanFromX(t.rider.poses, F[S_TGT_X]!), 0),
      riderChain: { hips: p(0), shoulders: p(1), head: p(2), elbow: p(3), hand: p(4), knee: p(5), foot: p(6), torsoDir: { x: this.chain.dx, y: this.chain.dy }, headDir: { x: this.chain.hx, y: this.chain.hy } },
      crashCause: CAUSES[this.U[U_CRASH_CAUSE]!] ?? null,
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

  /** Static vertical ground load on wheel 0 (rear) / 1 (front): neutral pose, level, zero-compression geometry. */
  private staticLoad(which: number): number {
    const t = this.tuning;
    const sr = t.suspension.rear;
    const sf = t.suspension.front;
    const L = sf.axle.x - sr.axle.x;
    const M = this.totalMass();
    const W = M * this.g;
    poseAt(t.rider.poses, 0, this.poseTmp);
    const cx = (t.wheel.rearMass * sr.axle.x + t.wheel.frontMass * sf.axle.x + t.rider.mass * this.poseTmp.x) / M - sr.axle.x;
    const nf = (W * cx) / L;
    return which === 0 ? W - nf : nf;
  }

  /**
   * Static sag of a wheel's spring under a vertical ground load `N`: the unsprung wheel carries its own
   * weight, and on a tilted slider the spring sees `axis.y` of the sprung share (the slider's
   * perpendicular constraint carries the rest).
   */
  private staticSag(s: SuspensionV2, N: number, wheelMass: number): number {
    const sprung = (N - wheelMass * this.g) * s.axis.y;
    return clamp(sprung / s.k - s.preload, 0, s.travel);
  }

  /** Static sags (m) of rear / front at the neutral pose. */
  private staticSags(): [number, number] {
    const t = this.tuning;
    return [this.staticSag(t.suspension.rear, this.staticLoad(0), t.wheel.rearMass), this.staticSag(t.suspension.front, this.staticLoad(1), t.wheel.frontMass)];
  }

  /** Render axle frame origin in the chassis frame (axle midpoint at static sag), as v1. */
  private axleOrigin(): void {
    const t = this.tuning;
    const sr = t.suspension.rear;
    const sf = t.suspension.front;
    const [cr, cf] = this.staticSags();
    this.axleOrgX = 0.5 * (sr.axle.x + sr.axis.x * cr + sf.axle.x + sf.axis.x * cf);
    this.axleOrgY = 0.5 * (sr.axle.y + sr.axis.y * cr + sf.axle.y + sf.axis.y * cf);
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
    const rlx = sr.axle.x + sr.axis.x * cr;
    const rly = sr.axle.y + sr.axis.y * cr;
    const flx = sf.axle.x + sf.axis.x * cf;
    const fly = sf.axle.y + sf.axis.y * cf;
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
      const st = w === 0 ? t.suspension.rear : t.suspension.front;
      const wb = w === 0 ? REAR : FRONT;
      const ax = st.axis.x * c - st.axis.y * s;
      const ay = st.axis.x * s + st.axis.y * c;
      const arx = fx + st.axle.x * c - st.axle.y * s;
      const ary = fy + st.axle.x * s + st.axle.y * c;
      const dx = px[wb]! - arx;
      const dy = py[wb]! - ary;
      const rx = px[wb]! - fx;
      const ry = py[wb]! - fy;
      const wf = av[CHASSIS]!;
      const relx = vx[wb]! - (vx[CHASSIS]! - wf * ry);
      const rely = vy[wb]! - (vy[CHASSIS]! + wf * rx);
      this.sAx[w] = ax;
      this.sAy[w] = ay;
      this.sNx[w] = -ay;
      this.sNy[w] = ax;
      this.sComp[w] = dx * ax + dy * ay;
      this.sPerp[w] = -dx * ay + dy * ax;
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
      const tq = driveTorque(t.engine, R, vRim, te, U[U_LIMITER] === 1);
      this.dEngineTq = tq;
      this.dThrust = U[U_LIMITER] === 1 ? 0 : te * t.engine.Fpeak * thrustFrac(t.engine, vRim);
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
      const rpx = pegx - fx;
      const rpy = pegy - fy;
      const rgx = gripx - fx;
      const rgy = gripy - fy;
      // torque on C per unit F: q . F with q = -(r_peg x (u u^T .)) - (r_grip x ((I - u u^T) .))
      const cpu = rpx * uy - rpy * ux; // r_peg x u
      const cgu = rgx * uy - rgy * ux; // r_grip x u
      // r_grip x F = rgx Fy - rgy Fx ; F_arm = F - u (u.F)
      const qx = -(cpu * ux + (-rgy - cgu * ux));
      const qy = -(cpu * uy + (rgx - cgu * uy));
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
      const fm = Math.sqrt(Fx * Fx + Fy * Fy);
      if (fm > r.Fmax) {
        Fx *= r.Fmax / fm;
        Fy *= r.Fmax / fm;
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
      // angular servo
      const errA = this.an[CHASSIS]! + F[S_TGT_PSI]! - this.an[RIDER]!;
      const tq = clamp(r.kpsi * errA + r.cpsi * (wC0 - wR0), -r.tauMax, r.tauMax);
      this.dServoTq = tq;
      av[RIDER] = av[RIDER]! + tq * dt * ii[RIDER]!;
      av[CHASSIS] = av[CHASSIS]! - tq * dt * ii[CHASSIS]!;
      // the declared attitude torque (§9.4): external, always on, printed
      const att = -r.Katt * F[S_IN_L]! - r.cAtt * wC0;
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

    const fx = this.px[CHASSIS]!;
    const fy = this.py[CHASSIS]!;
    const wheelB = WHEEL_BODIES;
    const brakeIn = riding ? this.F[S_BRAKE_EFF]! : 1;

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

      // --- brakes: torque-capped spin locks wheel <-> chassis (§8: no caps of any kind while riding)
      if (brakeIn > 0) {
        for (let w = 0; w < 2; w++) {
          const wb = wheelB[w]!;
          let maxNm = t.brakes.totalNm * (w === 0 ? 1 - t.brakes.frontFrac : t.brakes.frontFrac);
          if (!riding) maxNm *= w === 0 ? t.ragdoll.crashRearBrake : t.ragdoll.crashFrontBrake;
          const maxJ = brakeIn * maxNm * dt;
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
      const c = cos(an[CHASSIS]!);
      const s = sin(an[CHASSIS]!);
      const fx = px[CHASSIS]!;
      const fy = py[CHASSIS]!;
      for (let w = 0; w < 2; w++) {
        const st = w === 0 ? t.suspension.rear : t.suspension.front;
        const wb = w === 0 ? REAR : FRONT;
        const ax = st.axis.x * c - st.axis.y * s;
        const ay = st.axis.x * s + st.axis.y * c;
        const nx = -ay;
        const ny = ax;
        const arx = fx + st.axle.x * c - st.axle.y * s;
        const ary = fy + st.axle.x * s + st.axle.y * c;
        const dx = px[wb]! - arx;
        const dy = py[wb]! - ary;
        const rx = px[wb]! - fx;
        const ry = py[wb]! - fy;
        // perpendicular drift: remove it fully
        {
          const perp = dx * nx + dy * ny;
          const rn = rx * ny - ry * nx;
          const mass = 1 / (im[wb]! + im[CHASSIS]! + ii[CHASSIS]! * rn * rn);
          const lambda = -perp * mass;
          px[wb] = px[wb]! + lambda * nx * im[wb]!;
          py[wb] = py[wb]! + lambda * ny * im[wb]!;
          px[CHASSIS] = px[CHASSIS]! - lambda * nx * im[CHASSIS]!;
          py[CHASSIS] = py[CHASSIS]! - lambda * ny * im[CHASSIS]!;
          an[CHASSIS] = an[CHASSIS]! - ii[CHASSIS]! * rn * lambda;
        }
        // travel
        {
          const comp = dx * ax + dy * ay;
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
      const wb = w === 0 ? REAR : FRONT;
      const ax = st.axis.x * c - st.axis.y * s;
      const ay = st.axis.x * s + st.axis.y * c;
      const arx = this.px[CHASSIS]! + st.axle.x * c - st.axle.y * s;
      const ary = this.py[CHASSIS]! + st.axle.x * s + st.axle.y * c;
      const comp = (this.px[wb]! - arx) * ax + (this.py[wb]! - ary) * ay;
      F[w === 0 ? S_REAR_COMP : S_FRONT_COMP] = clamp(comp / st.travel, 0, 1);
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
        const relVy = -(this.vx[RIDER]! - this.vx[CHASSIS]!) * s + (this.vy[RIDER]! - this.vy[CHASSIS]!) * c;
        poseAt(t.rider.poses, 0, this.poseTmp);
        const rearAir = F[S_REAR_AIR]!;
        const frontAir = F[S_FRONT_AIR]!;
        if (relVy > 0.5) hop = 2;
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
      if (U[U_FINISHED] === 0 && frontX >= track.def.finishX) {
        U[U_FINISHED] = 1;
        F[S_FINISH_TIME] = (tick + 1) * dt;
        this.events.push({ type: 'finish', tick: tick + 1, time: (tick + 1) * dt });
      }

      // crash rules (§11): body sensors, hazard, out of bounds. Nothing else.
      let fault = 0;
      let cause = 0;
      if (U[U_CRASH_PENDING] === 1) {
        fault = 1;
        cause = 1;
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
