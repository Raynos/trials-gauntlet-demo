/**
 * Bike + rider simulation: custom 2D sequential-impulse solver, fixed 1/hz
 * step, fixed iteration order, no Math.random/Date/performance, no
 * transcendental Math.* (see dmath.ts). Implements PhysicsWorld
 * (CONTRACT.md §2.3–2.5) plus test/debug extras (BikePhysicsWorld).
 *
 * All mutable state lives in one Float64Array `F` (scalars + SoA bodies) and
 * one Uint8Array `U` (flags/enums), so `snapshot()` is two typed-array copies
 * and `restore()` is bit-exact by construction.
 *
 * Bodies: 0 frame, 1 rear wheel, 2 front wheel, 3 rider (point mass while
 * riding), 4..10 ragdoll (head torso pelvis upperArm forearm thigh shin),
 * then one pinned body per seesaw, then one per rolling drum.
 */
import type {
  CompiledTrack,
  FaultReason,
  GameEvent,
  InputFrame,
  PhysicsSnapshot,
  PhysicsState,
  RagdollBody,
  SurfaceKind,
  Vec2,
} from '../core/types';
import { Rng } from '../core/rng';
import type { PhysicsWorld } from './index';
import { CollisionWorld, type Manifold } from './collision';
import { DEFAULT_TUNING, mergeTuning, SURFACES, type BikeTuning, type PartialTuning, type SuspensionTuning } from './tuning';
import { atan, atan2, clamp, cos, sin, wrapAngle, HALF_PI, PI } from './dmath';

// ---------------------------------------------------------------------------
// Public extras
// ---------------------------------------------------------------------------

export type HopPhase = PhysicsState['hopPhase'];

export interface SuspDebug {
  compression: number;
  rate: number;
  force: number;
}

export interface PhysicsDebug {
  bodies: { id: string; pos: Vec2; vel: Vec2; angle: number; angVel: number }[];
  contacts: { body: string; point: Vec2; normal: Vec2; lambdaN: number; lambdaT: number; mu: number; surface: SurfaceKind }[];
  engine: { rpm: number; torqueNm: number; limiter: boolean; throttleEff: number };
  suspension: { rear: SuspDebug; front: SuspDebug };
  rider: { anchor: Vec2; offset: Vec2; tetherForce: number; hopPhase: HopPhase; crouch: number; hopExt: number };
  balancePitch: number;
  /** Why the last crash fired: 'sensor' (head/torso hit), 'tetherDist', 'tetherForce', 'oob', 'hazard' or null. */
  crashCause: 'sensor' | 'tetherDist' | 'tetherForce' | 'oob' | 'hazard' | null;
}

export interface TeleportPose {
  /** Rear wheel centre. */
  pos: Vec2;
  /** Frame angle. */
  angle: number;
  vel?: Vec2;
  /** Angular velocity about the rear wheel centre. */
  angVel?: number;
  rearOnly?: boolean;
}

export interface BikePhysicsWorld extends PhysicsWorld {
  readonly tuning: Readonly<BikeTuning>;
  debug(): PhysicsDebug;
  /** Wheelie balance pitch (rad) for a lean and an assumed longitudinal acceleration. */
  balancePitch(lean: number, accel?: number): number;
  teleport(pose: TeleportPose): void;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const FRAME = 0;
const REAR = 1;
const FRONT = 2;
const RIDER = 3;
const RAG0 = 4;
const NRAG = 7;
const FIRST_DYN = RAG0 + NRAG; // 11

const RAG_IDS: RagdollBody['id'][] = ['head', 'torso', 'pelvis', 'upperArm', 'forearm', 'thigh', 'shin'];

// scalar slots in F
const S_TICK = 0;
const S_TIME = 1;
const S_CHECKPOINT = 2;
const S_FINISH_TIME = 3; // NaN = null
const S_LEAN_EFF = 4;
const S_THROTTLE_EFF = 5;
const S_RPM = 6;
const S_HOP_TIMER = 7;
const S_CROUCH = 8;
const S_HOP_EXT = 9;
const S_REAR_COMP = 10;
const S_FRONT_COMP = 11;
const S_REAR_LN = 12;
const S_FRONT_LN = 13;
const S_REAR_SLIP = 14;
const S_REAR_AIR = 15;
const S_FRONT_AIR = 16;
const S_CRASH_T = 17;
const S_RNG = 18; // 4 slots
const S_SEED = 22;
const S_TETHER_OVER = 23;
const S_ENGINE_TQ = 24;
const S_LEAN_PREV = 25;
const S_TETHER_F = 26;
const S_IN_T = 27;
const S_IN_B = 28;
const S_IN_L = 29;
const S_REAR_LT = 30;
const S_FRONT_LT = 31;
const S_REAR_MU = 32;
const S_FRONT_SLIP = 33;
const S_RAG_REST = 34; // 6 slots
const NSCALAR = 40;

// flag slots in U
const U_FINISHED = 0;
const U_FAULT = 1; // 0 none, 1 crash, 2 oob, 3 restart, 4 timeout, 5 hazard
const U_LIMITER = 2;
const U_RESTART_LATCH = 3;
const U_REAR_GND = 4;
const U_FRONT_GND = 5;
const U_REAR_SURF = 6; // 0 none else idx+1
const U_FRONT_SURF = 7;
const U_HOP = 8; // 0 idle 1 preload 2 push 3 recover
const U_RAGDOLL = 9;
const U_ASLEEP = 10;
const U_CRASH_PENDING = 11;
const U_CRASH_CAUSE = 12; // 1 rider sensor, 2 tether distance, 3 tether force, 4 oob, 5 hazard
const NU = 16;

const FAULTS: (FaultReason | null)[] = [null, 'crash', 'out-of-bounds', 'restart', 'timeout', 'hazard'];
const HOPS: HopPhase[] = ['idle', 'preload', 'push', 'recover'];
const CAUSES: PhysicsDebug['crashCause'][] = [null, 'sensor', 'tetherDist', 'tetherForce', 'oob', 'hazard'];

const MAX_CONTACTS = 128;
const WHEEL_BODIES = [REAR, FRONT];
const RPM_PER_RADS = 60 / (2 * PI);

interface RagLimb {
  len: number;
  r: number;
  mass: number;
}
const RAG_LIMBS: RagLimb[] = [
  { len: 0, r: 0.12, mass: 5 }, // head
  { len: 0.4, r: 0.13, mass: 30 }, // torso
  { len: 0.2, r: 0.12, mass: 12 }, // pelvis
  { len: 0.3, r: 0.06, mass: 5 }, // upperArm
  { len: 0.28, r: 0.05, mass: 3 }, // forearm
  { len: 0.42, r: 0.08, mass: 12 }, // thigh
  { len: 0.42, r: 0.06, mass: 8 }, // shin
];
/** [parent, child, parentLocalY, childLocalY, angularRange] — anchors are on the local y axis. */
const RAG_JOINTS: [number, number, number, number, number][] = [
  [1, 0, 0.2, -0.12, 0.7], // neck
  [1, 2, -0.2, 0.1, 0.6], // spine
  [1, 3, 0.15, 0.15, 2.5], // shoulder
  [3, 4, -0.15, 0.14, 1.6], // elbow
  [2, 5, -0.1, 0.21, 1.4], // hip
  [5, 6, -0.21, 0.21, 1.4], // knee
];

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

class BikeWorld implements BikePhysicsWorld {
  readonly physicsHz: number;
  readonly tuning: Readonly<BikeTuning>;
  private readonly dt: number;

  private track: CompiledTrack | null = null;
  private col: CollisionWorld | null = null;
  private nBodies = FIRST_DYN;
  private nSeesaw = 0;
  private nDrum = 0;

  // state buffers
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

  // per-tick scratch (not state)
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
  private readonly cMu = new Float64Array(MAX_CONTACTS);
  private readonly cLn = new Float64Array(MAX_CONTACTS);
  private readonly cLt = new Float64Array(MAX_CONTACTS);
  // suspension scratch per wheel (index 0 rear, 1 front)
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
  private tetherLambda = 0;
  private tetherActive = false;
  private legLambda = 0;
  private legActive = false;
  private legSep = 0;
  private tetherNx = 0;
  private tetherNy = 0;
  private tetherSep = 0;
  private anchorX = 0;
  private anchorY = 0;
  private readonly ragLambda = new Float64Array(RAG_JOINTS.length * 3);
  private seesawLambda = new Float64Array(0);
  private brakeIn = 0;
  private readonly rng = new Rng(0);

  // query scratch
  private qBody = 0;
  private qCx = 0;
  private qCy = 0;
  private qR = 0;
  private qWheel = 0;
  private qSensorHit = false;
  private qSensor = false;
  private readonly onManifold = (m: Manifold): void => this.addContact(m);
  private readonly bodyAngle = (b: number): number => this.an[b]!;

  constructor(physicsHz: number, tuning: PartialTuning | undefined) {
    this.physicsHz = physicsHz;
    this.dt = 1 / physicsHz;
    this.tuning = Object.freeze(mergeTuning(DEFAULT_TUNING, tuning));
    this.bindViews();
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

  loadTrack(track: CompiledTrack, seed: number): void {
    this.track = track;
    this.col = new CollisionWorld(track, FIRST_DYN);
    this.nSeesaw = this.col.seesawBodies.length;
    this.nDrum = this.col.drumBodies.length;
    this.nBodies = FIRST_DYN + this.nSeesaw + this.nDrum;
    this.F = new Float64Array(NSCALAR + 8 * this.nBodies);
    this.U = new Uint8Array(NU);
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
    this.F[S_RPM] = this.tuning.engine.idleRpm;
    this.rng.reseed((seed ^ Math.imul(checkpoint + 2, 0x9e3779b9)) >>> 0);
    this.saveRng();
    this.setupMasses();
    this.setupDynamicColliders();
    const spawn = checkpoint >= 0 ? track.def.checkpoints[checkpoint]?.spawn ?? track.def.start : track.def.start;
    const a = spawn.angle;
    const R = this.tuning.wheel.radius;
    const nx = -sin(a);
    const ny = cos(a);
    this.placeBike(spawn.pos.x + nx * R, spawn.pos.y + ny * R, a, 0, 0, 0);
    this.events.push({ type: 'restart', checkpoint, tick: 0 });
  }

  step(input: InputFrame): void {
    this.requireTrack();
    const F = this.F;
    const U = this.U;
    const dt = this.dt;

    if (input.restart && U[U_RESTART_LATCH] === 0) {
      U[U_RESTART_LATCH] = 1;
      const cp = F[S_CHECKPOINT]!;
      this.events.push({ type: 'fault', reason: 'restart', tick: F[S_TICK]!, time: F[S_TIME]! });
      this.reset(cp);
      this.U[U_RESTART_LATCH] = 1;
      return;
    }
    if (!input.restart) U[U_RESTART_LATCH] = 0;

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
    if (riding) this.controls(input);
    else {
      F[S_THROTTLE_EFF] = 0;
      F[S_ENGINE_TQ] = 0;
      this.brakeIn = 0;
      F[S_RPM] = this.tuning.engine.idleRpm;
      U[U_LIMITER] = 0;
    }
    this.applyForces(riding);
    this.collide(riding);
    this.solve(riding);
    this.integratePositions();
    this.derive(riding);

    F[S_TICK] = F[S_TICK]! + 1;
    F[S_TIME] = F[S_TICK]! * dt;
    F[S_LEAN_PREV] = input.lean;
    this.advanceRng();
  }

  getState(): PhysicsState {
    const F = this.F;
    const U = this.U;
    const t = this.tuning;
    const wheel = (i: number, comp: number, gnd: number): PhysicsState['wheels']['rear'] => ({
      pos: { x: this.px[i]!, y: this.py[i]! },
      spin: -this.an[i]!,
      spinVel: -this.av[i]!,
      compression: comp,
      grounded: gnd === 1,
    });
    const lean = F[S_LEAN_EFF]!;
    const angle = this.an[FRAME]!;
    const wa = wrapAngle(angle);
    const riderRelY = this.riderLocalY();
    const crouch = clamp((t.rider.anchor.y - riderRelY) / t.rider.crouch, 0, 1);
    const fault = FAULTS[U[U_FAULT]!] ?? null;
    let ragdoll: RagdollBody[] | null = null;
    if (U[U_RAGDOLL] === 1) {
      ragdoll = [];
      for (let i = 0; i < NRAG; i++) {
        const b = RAG0 + i;
        ragdoll.push({ id: RAG_IDS[i]!, pos: { x: this.px[b]!, y: this.py[b]! }, angle: this.an[b]! });
      }
    }
    const seesaws: PhysicsState['seesaws'] = [];
    const col = this.col!;
    for (let i = 0; i < this.nSeesaw; i++) {
      const b = FIRST_DYN + i;
      seesaws.push({ id: col.seesawBodies[i]!.collider.id, angle: this.an[b]!, angVel: this.av[b]! });
    }
    const drums: PhysicsState['drums'] = [];
    for (let i = 0; i < this.nDrum; i++) {
      const b = FIRST_DYN + this.nSeesaw + i;
      drums.push({ id: col.drumBodies[i]!.collider.id, spin: this.an[b]! });
    }
    const ft = F[S_FINISH_TIME]!;
    return {
      tick: F[S_TICK]!,
      time: F[S_TIME]!,
      bike: {
        pos: { x: this.px[FRAME]!, y: this.py[FRAME]! },
        vel: { x: this.vx[FRAME]!, y: this.vy[FRAME]! },
        angle,
        angVel: this.av[FRAME]!,
      },
      wheels: {
        rear: wheel(REAR, F[S_REAR_COMP]!, U[U_REAR_GND]!),
        front: wheel(FRONT, F[S_FRONT_COMP]!, U[U_FRONT_GND]!),
      },
      rider: {
        lean,
        crouch,
        torsoPitch: clamp(-0.35 * lean - 0.15 * wa, -0.9, 0.9),
        armExtend: clamp(Math.max(0, -lean) + 0.5 * Math.max(0, wa - 0.6), 0, 1),
      },
      checkpoint: F[S_CHECKPOINT]!,
      finished: U[U_FINISHED] === 1,
      faulted: fault,
      finishTime: Number.isNaN(ft) ? null : ft,
      input: { throttle: F[S_IN_T]!, brake: F[S_IN_B]!, lean: F[S_IN_L]! },
      engine: { rpm: F[S_RPM]!, throttleEff: F[S_THROTTLE_EFF]!, limiter: U[U_LIMITER] === 1 },
      contacts: {
        rear: U[U_REAR_SURF]! > 0 ? SURFACES[U[U_REAR_SURF]! - 1]! : null,
        front: U[U_FRONT_SURF]! > 0 ? SURFACES[U[U_FRONT_SURF]! - 1]! : null,
      },
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
      throw new Error('BikePhysics.restore: snapshot does not match the loaded track');
    }
    this.F.set(s.f64);
    this.U.set(s.u8);
    this.loadRng();
  }

  // -- extras ---------------------------------------------------------------

  balancePitch(lean: number, accel = 0): number {
    const t = this.tuning;
    const R = t.wheel.radius;
    const cr = this.staticSag(t.suspension.rear, this.staticLoad(0));
    const cf = this.staticSag(t.suspension.front, this.staticLoad(1));
    const rear = { x: t.suspension.rear.axle.x + t.suspension.rear.axis.x * cr, y: t.suspension.rear.axle.y + t.suspension.rear.axis.y * cr };
    const front = { x: t.suspension.front.axle.x + t.suspension.front.axis.x * cf, y: t.suspension.front.axle.y + t.suspension.front.axis.y * cf };
    const leanOff = lean > 0 ? lean * t.rider.leanFwd : lean * t.rider.leanBack;
    const rider = { x: t.rider.anchor.x + leanOff, y: t.rider.anchor.y - this.F[S_CROUCH]! * t.rider.crouch - Math.abs(lean) * t.rider.leanCrouch };
    const M = t.frame.mass + 2 * t.wheel.mass + t.rider.mass;
    const cx = (t.wheel.mass * (rear.x + front.x) + t.rider.mass * rider.x) / M;
    const cy = (t.wheel.mass * (rear.y + front.y) + t.rider.mass * rider.y) / M;
    const d = cx - rear.x;
    const h = cy - (rear.y - R);
    return HALF_PI - atan2(h, d) + atan(accel / t.gravity);
  }

  teleport(pose: TeleportPose): void {
    const v = pose.vel ?? { x: 0, y: 0 };
    this.placeBike(pose.pos.x, pose.pos.y, pose.angle, v.x, v.y, pose.angVel ?? 0);
  }

  debug(): PhysicsDebug {
    const F = this.F;
    const names = ['frame', 'rearWheel', 'frontWheel', 'rider', ...RAG_IDS.map((r) => `rag:${r}`)];
    const bodies: PhysicsDebug['bodies'] = [];
    for (let b = 0; b < this.nBodies; b++) {
      const id = names[b] ?? (b < FIRST_DYN + this.nSeesaw ? `seesaw:${b - FIRST_DYN}` : `drum:${b - FIRST_DYN - this.nSeesaw}`);
      bodies.push({ id, pos: { x: this.px[b]!, y: this.py[b]! }, vel: { x: this.vx[b]!, y: this.vy[b]! }, angle: this.an[b]!, angVel: this.av[b]! });
    }
    const contacts: PhysicsDebug['contacts'] = [];
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
    return {
      bodies,
      contacts,
      engine: { rpm: F[S_RPM]!, torqueNm: F[S_ENGINE_TQ]!, limiter: this.U[U_LIMITER] === 1, throttleEff: F[S_THROTTLE_EFF]! },
      suspension: {
        rear: { compression: this.sComp[0]!, rate: this.sRate[0]!, force: this.sForce[0]! },
        front: { compression: this.sComp[1]!, rate: this.sRate[1]!, force: this.sForce[1]! },
      },
      rider: {
        anchor: { x: this.anchorX, y: this.anchorY },
        offset: { x: this.px[RIDER]! - this.anchorX, y: this.py[RIDER]! - this.anchorY },
        tetherForce: F[S_TETHER_F]!,
        hopPhase: HOPS[this.U[U_HOP]!]!,
        crouch: F[S_CROUCH]!,
        hopExt: F[S_HOP_EXT]!,
      },
      balancePitch: this.balancePitch(F[S_LEAN_EFF]!, 0),
      crashCause: CAUSES[this.U[U_CRASH_CAUSE]!] ?? null,
    };
  }

  // -- setup ----------------------------------------------------------------

  private requireTrack(): CompiledTrack {
    if (!this.track) throw new Error('BikePhysics: no track loaded');
    return this.track;
  }

  private setupMasses(): void {
    const t = this.tuning;
    this.im[FRAME] = 1 / t.frame.mass;
    this.ii[FRAME] = 1 / t.frame.inertia;
    this.im[REAR] = 1 / t.wheel.mass;
    this.ii[REAR] = 1 / t.wheel.inertiaRear;
    this.im[FRONT] = 1 / t.wheel.mass;
    this.ii[FRONT] = 1 / t.wheel.inertiaFront;
    this.im[RIDER] = 1 / t.rider.mass;
    this.ii[RIDER] = 1 / t.rider.torso.inertia;
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
      // a seesaw rests tipped toward the approach side (its -x end on the ground: +angle is CCW)
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

  /** Static vertical load on wheel 0 (rear) / 1 (front) at neutral lean, level ground. */
  private staticLoad(which: number): number {
    const t = this.tuning;
    const L = t.wheel.wheelbase;
    const M = t.frame.mass + 2 * t.wheel.mass + t.rider.mass;
    const W = M * t.gravity;
    // COM x relative to rear axle at zero compression
    const cx = (t.wheel.mass * L + t.rider.mass * (t.rider.anchor.x - t.suspension.rear.axle.x) + t.frame.mass * -t.suspension.rear.axle.x) / M;
    const nf = (W * cx) / L;
    return which === 0 ? W - nf : nf;
  }

  private staticSag(s: SuspensionTuning, load: number): number {
    return clamp(load / s.k - s.preload, 0, s.travel);
  }

  /** Place the bike from its rear wheel centre + frame angle, at static sag, rider at anchor. */
  private placeBike(rx: number, ry: number, angle: number, velX: number, velY: number, angVel: number): void {
    const t = this.tuning;
    const R = t.wheel.radius;
    const sr = t.suspension.rear;
    const sf = t.suspension.front;
    const cr = this.staticSag(sr, this.staticLoad(0));
    // front compression chosen so both wheels sit at the same frame-local height
    const cf = clamp((sr.axle.y - sf.axle.y + sr.axis.y * cr) / sf.axis.y, 0, sf.travel);
    const c = cos(angle);
    const s = sin(angle);
    const rot = (lx: number, ly: number): [number, number] => [lx * c - ly * s, lx * s + ly * c];
    const [rlx, rly] = [sr.axle.x + sr.axis.x * cr, sr.axle.y + sr.axis.y * cr];
    const [flx, fly] = [sf.axle.x + sf.axis.x * cf, sf.axle.y + sf.axis.y * cf];
    const [rwx, rwy] = rot(rlx, rly);
    const fx = rx - rwx;
    const fy = ry - rwy;
    const [fwx, fwy] = rot(flx, fly);
    this.px[FRAME] = fx;
    this.py[FRAME] = fy;
    this.an[FRAME] = angle;
    this.px[REAR] = rx;
    this.py[REAR] = ry;
    this.an[REAR] = 0;
    this.px[FRONT] = fx + fwx;
    this.py[FRONT] = fy + fwy;
    this.an[FRONT] = 0;
    const lean = this.F[S_LEAN_EFF]!;
    const leanOff = lean > 0 ? lean * t.rider.leanFwd : lean * t.rider.leanBack;
    const [ax, ay] = rot(
      t.rider.anchor.x + leanOff,
      t.rider.anchor.y - this.F[S_CROUCH]! * t.rider.crouch + this.F[S_HOP_EXT]! * t.rider.hopExtend - Math.abs(lean) * t.rider.leanCrouch,
    );
    this.px[RIDER] = fx + ax;
    this.py[RIDER] = fy + ay;
    this.an[RIDER] = angle;
    for (let b = 0; b <= RIDER; b++) {
      const dx = this.px[b]! - rx;
      const dy = this.py[b]! - ry;
      this.vx[b] = velX - angVel * dy;
      this.vy[b] = velY + angVel * dx;
      this.av[b] = b === FRAME ? angVel : 0;
    }
    const fwdX = c;
    const fwdY = s;
    const vAlong = velX * fwdX + velY * fwdY;
    this.av[REAR] = -vAlong / R + angVel;
    this.av[FRONT] = -vAlong / R + angVel;
    this.F[S_REAR_COMP] = cr / sr.travel;
    this.F[S_FRONT_COMP] = cf / sf.travel;
    this.F[S_REAR_AIR] = 0;
    this.F[S_FRONT_AIR] = 0;
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

  /** Rider height above the current anchor along frame-up (uses the anchor of the last force pass). */
  private riderExt(): number {
    const c = cos(this.an[FRAME]!);
    const s = sin(this.an[FRAME]!);
    const dx = this.px[RIDER]! - this.anchorX;
    const dy = this.py[RIDER]! - this.anchorY;
    return -dx * s + dy * c;
  }

  private riderLocalY(): number {
    const c = cos(this.an[FRAME]!);
    const s = sin(this.an[FRAME]!);
    const dx = this.px[RIDER]! - this.px[FRAME]!;
    const dy = this.py[RIDER]! - this.py[FRAME]!;
    return -dx * s + dy * c;
  }

  // -- step phases ----------------------------------------------------------

  private controls(input: InputFrame): void {
    const F = this.F;
    const U = this.U;
    const t = this.tuning;
    const dt = this.dt;
    const e = t.engine;

    // throttle slew (fuel lag)
    const te = F[S_THROTTLE_EFF]!;
    const target = input.throttle;
    const rate = target > te ? e.throttleRise : e.throttleFall;
    let nte = te + clamp(target - te, -rate * dt, rate * dt);
    if (Math.abs(nte - target) < 1e-9) nte = target;
    F[S_THROTTLE_EFF] = nte;

    // lean slew
    const le = F[S_LEAN_EFF]!;
    let nle = le + clamp(input.lean - le, -t.rider.leanRate * dt, t.rider.leanRate * dt);
    if (Math.abs(nle - input.lean) < 1e-9) nle = input.lean;
    F[S_LEAN_EFF] = nle;

    this.brakeIn = input.brake;

    // hop state machine (technique, no button)
    const r = t.rider;
    let phase = U[U_HOP]!;
    let timer = F[S_HOP_TIMER]! + dt;
    let crouch = F[S_CROUCH]!;
    let hopExt = F[S_HOP_EXT]!;
    const leanRate = (input.lean - F[S_LEAN_PREV]!) / dt;
    const bothGround = U[U_REAR_GND] === 1;
    switch (phase) {
      case 0: // idle
        crouch = Math.max(0, crouch - dt / 0.2);
        hopExt = Math.max(0, hopExt - dt / 0.3);
        if (bothGround && input.lean <= r.hopLeanBack && input.throttle >= r.hopThrottle) {
          phase = 1;
          timer = 0;
        }
        break;
      case 1: // preload
        crouch = Math.min(1, crouch + dt / r.crouchTime);
        if (timer >= r.hopPreloadMin && (leanRate >= r.hopSnapRate || input.lean > 0)) {
          phase = 2;
          timer = 0;
          crouch = 0;
          hopExt = 1;
        } else if (timer > r.hopPreloadMax || input.lean > r.hopLeanBack + 0.25 || input.throttle < r.hopThrottle * 0.5) {
          phase = 3;
          timer = 0;
        }
        break;
      case 2: // push: until the legs are straight (rider at/above the raised anchor) or the cap
        if (timer >= r.hopPushTime || this.riderExt() >= 0) {
          phase = 3;
          timer = 0;
        }
        break;
      case 3: // recover
        crouch = Math.max(0, crouch - dt / 0.2);
        hopExt = Math.max(0, hopExt - dt / 0.3);
        if (timer >= r.hopRecoverTime || (timer >= 0.2 && bothGround && U[U_FRONT_GND] === 1)) {
          phase = 0;
          timer = 0;
        }
        break;
    }
    U[U_HOP] = phase;
    F[S_HOP_TIMER] = timer;
    F[S_CROUCH] = crouch;
    F[S_HOP_EXT] = hopExt;

    // engine
    const wheelFwd = -this.av[REAR]!;
    const rpmWheel = Math.max(0, wheelFwd) * e.gearRatio * RPM_PER_RADS;
    const rpmClutch = e.idleRpm + nte * (e.clutchRpm - e.idleRpm);
    const rpm = Math.max(rpmWheel, rpmClutch);
    let limiter = U[U_LIMITER]!;
    if (rpm >= e.limiterRpm) limiter = 1;
    else if (limiter === 1 && rpm < e.limiterResetRpm) limiter = 0;
    U[U_LIMITER] = limiter;
    F[S_RPM] = rpm;
    const peakWheel = e.peakTorqueNm * e.gearRatio * e.efficiency;
    let torque = limiter === 1 ? 0 : nte * peakWheel * this.curveFrac(rpm);
    // engine braking: drag on the rear wheel proportional to rpm when off throttle
    torque -= e.engineBrakeFrac * peakWheel * (1 - nte) * clamp(rpmWheel / e.limiterRpm, 0, 1.2) * (wheelFwd > 0 ? 1 : wheelFwd < 0 ? -1 : 0);
    F[S_ENGINE_TQ] = torque;
  }

  private curveFrac(rpm: number): number {
    const c = this.tuning.engine.curve;
    if (rpm <= c[0]![0]) return c[0]![1];
    for (let i = 1; i < c.length; i++) {
      const [r1, f1] = c[i]!;
      if (rpm <= r1) {
        const [r0, f0] = c[i - 1]!;
        return f0 + ((f1 - f0) * (rpm - r0)) / (r1 - r0);
      }
    }
    return c[c.length - 1]![1];
  }

  private applyForces(riding: boolean): void {
    const F = this.F;
    const t = this.tuning;
    const dt = this.dt;
    const g = t.gravity;
    const px = this.px;
    const py = this.py;
    const vx = this.vx;
    const vy = this.vy;
    const av = this.av;
    const im = this.im;
    const ii = this.ii;

    // gravity
    const nb = this.nBodies;
    for (let b = 0; b < nb; b++) if (im[b]! > 0) vy[b] = vy[b]! - g * dt;

    // frame pose
    const fx = px[FRAME]!;
    const fy = py[FRAME]!;
    const c = cos(this.an[FRAME]!);
    const s = sin(this.an[FRAME]!);

    // pass 1: suspension geometry and rates from pre-impulse velocities
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
      const wf = av[FRAME]!;
      const relx = vx[wb]! - (vx[FRAME]! - wf * ry);
      const rely = vy[wb]! - (vy[FRAME]! + wf * rx);
      this.sAx[w] = ax;
      this.sAy[w] = ay;
      this.sNx[w] = -ay;
      this.sNy[w] = ax;
      this.sComp[w] = dx * ax + dy * ay;
      this.sPerp[w] = -dx * ay + dy * ax;
      this.sRate[w] = relx * ax + rely * ay;
    }
    // rider anchor + spring force from pre-impulse velocities
    let riderFx = 0;
    let riderFy = 0;
    let rax = 0;
    let ray = 0;
    if (riding) {
      const r = t.rider;
      const lean = F[S_LEAN_EFF]!;
      const leanOff = lean > 0 ? lean * r.leanFwd : lean * r.leanBack;
      const alx = r.anchor.x + leanOff;
      const cr = F[S_CROUCH]!;
      const eased = cr * cr * (3 - 2 * cr);
      const aly = r.anchor.y - eased * r.crouch + F[S_HOP_EXT]! * r.hopExtend - Math.abs(lean) * r.leanCrouch;
      const axw = fx + alx * c - aly * s;
      const ayw = fy + alx * s + aly * c;
      this.anchorX = axw;
      this.anchorY = ayw;
      rax = axw - fx;
      ray = ayw - fy;
      const wf = av[FRAME]!;
      const vax = vx[FRAME]! - wf * ray;
      const vay = vy[FRAME]! + wf * rax;
      const dx = px[RIDER]! - axw;
      const dy = py[RIDER]! - ayw;
      const dvx = vx[RIDER]! - vax;
      const dvy = vy[RIDER]! - vay;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hop = this.U[U_HOP] === 2;
      // Decompose the rider offset into frame axes: legs act along "up", the body along "fwd".
      const upx = -s;
      const upy = c;
      const ext = dx * upx + dy * upy; // >0: rider above the anchor (legs straight / off the pegs)
      const extRate = dvx * upx + dvy * upy;
      const along = dx * c + dy * s;
      const alongRate = dvx * c + dvy * s;
      const kl = r.kLanding * dist;
      const k = hop ? r.kPush : r.k;
      // legs: full stiffness plus the landing cubic in compression (ext < 0); while preloading the
      // legs relax (armFrac) so the crouch does not yank the bike up. In free fall the rider floats
      // m*g/k above the anchor with no force on the frame.
      const preload = this.U[U_HOP] === 1;
      const kUp = ext < 0 ? k + kl : preload ? k * r.armFrac : k;
      const cUp = hop ? r.c * 0.1 : r.c;
      const fWeight = r.mass * g;
      let fUp = -kUp * ext - cUp * extRate + fWeight;
      if (hop && ext < 0) fUp += r.hopForce;
      const maxUp = hop ? r.hopMaxForce : r.ejectForce * 1.5;
      fUp = clamp(fUp, -maxUp, maxUp);
      let fAlong = -r.k * along - r.c * alongRate;
      fAlong = clamp(fAlong, -r.ejectForce * 1.5, r.ejectForce * 1.5);
      const Fx = fAlong * c + fUp * upx;
      const Fy = fAlong * s + fUp * upy;
      const mag = Math.sqrt(Fx * Fx + Fy * Fy);
      F[S_TETHER_F] = mag;
      F[S_TETHER_OVER] = mag >= r.ejectForce && !hop ? F[S_TETHER_OVER]! + 1 : 0;
      riderFx = Fx;
      riderFy = Fy;
    }

    // pass 2: apply suspension impulses
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
      const stop = st.stopStart * st.travel;
      if (comp > stop) force += st.kStop * (comp - stop);
      const cd = rate > 0 ? st.cComp : st.cReb;
      let damp = cd * rate * dt;
      const mRed = 1 / (im[wb]! + im[FRAME]!);
      const maxDamp = mRed * Math.abs(rate);
      damp = clamp(damp, -maxDamp, maxDamp);
      const J = force * dt + damp; // along +axis on the frame, -axis on the wheel
      this.sForce[w] = J / dt;
      vx[wb] = vx[wb]! - J * ax * im[wb]!;
      vy[wb] = vy[wb]! - J * ay * im[wb]!;
      vx[FRAME] = vx[FRAME]! + J * ax * im[FRAME]!;
      vy[FRAME] = vy[FRAME]! + J * ay * im[FRAME]!;
      av[FRAME] = av[FRAME]! + ii[FRAME]! * (rx * J * ay - ry * J * ax);
      // rolling resistance on grounded wheels
      const N = (w === 0 ? F[S_REAR_LN]! : F[S_FRONT_LN]!) / dt;
      if (N > 0) {
        const wv = av[wb]!;
        const tq = -t.tyre.rollRes * N * t.wheel.radius * clamp(wv / 0.05, -1, 1);
        av[wb] = wv + tq * dt * ii[wb]!;
      }
    }

    if (riding) {
      // engine torque on the rear wheel, reaction on the frame
      const tq = F[S_ENGINE_TQ]!;
      av[REAR] = av[REAR]! - tq * dt * ii[REAR]!;
      av[FRAME] = av[FRAME]! + tq * dt * ii[FRAME]!;

      // rider spring/damper reaction (computed above): the rider gets F, the frame gets -F at the anchor
      vx[RIDER] = vx[RIDER]! + riderFx * dt * im[RIDER]!;
      vy[RIDER] = vy[RIDER]! + riderFy * dt * im[RIDER]!;
      vx[FRAME] = vx[FRAME]! - riderFx * dt * im[FRAME]!;
      vy[FRAME] = vy[FRAME]! - riderFy * dt * im[FRAME]!;
      av[FRAME] = av[FRAME]! - ii[FRAME]! * (rax * riderFy - ray * riderFx) * dt;

      // torso swing: torque pair between the rider's angular DOF and the frame (lean back = nose up)
      {
        const ts = t.rider.torso;
        const rel = this.an[RIDER]! - this.an[FRAME]!;
        const relRate = av[RIDER]! - av[FRAME]!;
        const target = F[S_LEAN_EFF]! * ts.swing;
        const tq = clamp(ts.k * (target - rel) - ts.c * relRate, -ts.maxTorque, ts.maxTorque);
        av[RIDER] = av[RIDER]! + tq * dt * ii[RIDER]!;
        av[FRAME] = av[FRAME]! - tq * dt * ii[FRAME]!;
      }

      // aero drag on the frame
      const sp = Math.sqrt(vx[FRAME]! * vx[FRAME]! + vy[FRAME]! * vy[FRAME]!);
      const dcoef = t.aero.dragCoef * sp * dt * im[FRAME]!;
      vx[FRAME] = vx[FRAME]! - dcoef * vx[FRAME]!;
      vy[FRAME] = vy[FRAME]! - dcoef * vy[FRAME]!;
    }
  }

  private collide(riding: boolean): void {
    this.nC = 0;
    const t = this.tuning;
    const dt = this.dt;
    const spec = t.solver.speculativeMargin;
    const U = this.U;
    U[U_CRASH_PENDING] = 0;
    // wheels
    for (let w = 0; w < 2; w++) {
      const b = w === 0 ? REAR : FRONT;
      const speed = Math.sqrt(this.vx[b]! * this.vx[b]! + this.vy[b]! * this.vy[b]!);
      this.queryBodyCircle(b, this.px[b]!, this.py[b]!, t.wheel.radius, spec + speed * dt, 1, false);
    }
    // frame hard points
    {
      const c = cos(this.an[FRAME]!);
      const s = sin(this.an[FRAME]!);
      const speed = Math.sqrt(this.vx[FRAME]! * this.vx[FRAME]! + this.vy[FRAME]! * this.vy[FRAME]!) + Math.abs(this.av[FRAME]!) * 0.8;
      for (const fc of t.frame.circles) {
        const cx = this.px[FRAME]! + fc.x * c - fc.y * s;
        const cy = this.py[FRAME]! + fc.x * s + fc.y * c;
        this.queryBodyCircle(FRAME, cx, cy, fc.r, spec + speed * dt, 0, false);
      }
    }
    if (riding) {
      // rider sensors: head + torso circles -> crash on any touch
      const wa = wrapAngle(this.an[FRAME]!);
      const phi = t.rider.torsoFollow * wa;
      const ux = -sin(phi);
      const uy = cos(phi);
      const rx = this.px[RIDER]!;
      const ry = this.py[RIDER]!;
      const r = t.rider;
      this.querySensor(rx + ux * 0.44, ry + uy * 0.44, r.headRadius);
      this.querySensor(rx + ux * 0.16, ry + uy * 0.16, r.torsoRadius);
      this.querySensor(rx - ux * 0.12, ry - uy * 0.12, r.torsoRadius);
    } else if (U[U_RAGDOLL] === 1) {
      for (let i = 0; i < NRAG; i++) {
        const b = RAG0 + i;
        const limb = RAG_LIMBS[i]!;
        const speed = Math.sqrt(this.vx[b]! * this.vx[b]! + this.vy[b]! * this.vy[b]!) + Math.abs(this.av[b]!) * limb.len;
        if (limb.len === 0) {
          this.queryBodyCircle(b, this.px[b]!, this.py[b]!, limb.r, spec + speed * dt, 0, true);
        } else {
          const c = cos(this.an[b]!);
          const s = sin(this.an[b]!);
          const hx = -s * (limb.len * 0.5);
          const hy = c * (limb.len * 0.5);
          this.queryBodyCircle(b, this.px[b]! + hx, this.py[b]! + hy, limb.r, spec + speed * dt, 0, true);
          this.queryBodyCircle(b, this.px[b]! - hx, this.py[b]! - hy, limb.r, spec + speed * dt, 0, true);
        }
      }
    }
  }

  private queryBodyCircle(body: number, cx: number, cy: number, r: number, margin: number, wheel: number, rag: boolean): void {
    this.qBody = body;
    this.qCx = cx;
    this.qCy = cy;
    this.qR = r;
    this.qWheel = wheel;
    this.qSensor = false;
    this.qRag = rag;
    this.col!.queryCircle(cx, cy, r, margin, this.bodyAngle, this.onManifold);
  }
  private qRag = false;

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
    // contact point on A's rim
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
    // relative velocity at the contact (pre-solve)
    const vax = this.vx[A]! - this.av[A]! * ray;
    const vay = this.vy[A]! + this.av[A]! * rax;
    const rvx = vax - vbx;
    const rvy = vay - vby;
    const vn = rvx * nx + rvy * ny;
    let vnMin: number;
    if (m.sep > 0) vnMin = -m.sep / dt;
    else vnMin = (t.solver.baumgarte * Math.max(-m.sep - t.solver.slop, 0)) / dt;
    if (this.qRag && vn < -1) vnMin = Math.max(vnMin, -t.ragdoll.restitution * vn);
    this.cVnMin[i] = vnMin;
    if (this.qWheel === 1) {
      const slip = rvx * tx + rvy * ty;
      const vcx = this.vx[A]! - vbx;
      const vcy = this.vy[A]! - vby;
      const vct = Math.abs(vcx * tx + vcy * ty);
      const kappa = Math.abs(slip) / Math.max(vct, t.tyre.vRef);
      const ty2 = t.tyre;
      let shape: number;
      if (kappa <= ty2.kappaPeak) shape = 1;
      else if (kappa >= 1) shape = ty2.slideFrac;
      else shape = 1 - ((1 - ty2.slideFrac) * (kappa - ty2.kappaPeak)) / (1 - ty2.kappaPeak);
      const grip = t.tyre.grip[SURFACES[m.prim.surface] ?? 'dirt'] ?? 1;
      this.cMu[i] = ty2.muPeak * grip * shape;
    } else {
      this.cMu[i] = this.qRag ? t.ragdoll.mu : 0.6;
    }
    this.nC = i + 1;
  }

  private solve(riding: boolean): void {
    const t = this.tuning;
    const dt = this.dt;
    const iters = t.solver.velocityIters;
    const vx = this.vx;
    const vy = this.vy;
    const av = this.av;
    const im = this.im;
    const ii = this.ii;
    const bj = t.solver.jointBaumgarte;

    // per-tick constraint setup
    for (let w = 0; w < 2; w++) {
      this.sLimLo[w] = 0;
      this.sLimHi[w] = 0;
      this.sBrake[w] = 0;
    }
    this.tetherLambda = 0;
    this.tetherActive = false;
    this.legLambda = 0;
    this.legActive = false;
    if (riding) {
      const dx = this.px[RIDER]! - this.anchorX;
      const dy = this.py[RIDER]! - this.anchorY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const max = t.rider.tetherMax;
      if (dist > max - 0.05 && dist > 1e-9) {
        this.tetherActive = true;
        this.tetherNx = dx / dist;
        this.tetherNy = dy / dist;
        this.tetherSep = max - dist;
      }
      // legs straight: the rider cannot rise more than legSlack above the anchor along frame-up
      const c0 = cos(this.an[FRAME]!);
      const s0 = sin(this.an[FRAME]!);
      const ext = -dx * s0 + dy * c0;
      const sep = t.rider.legSlack - ext;
      if (sep < 0.05) {
        this.legActive = true;
        this.legSep = sep;
      }
    }
    const rag = this.U[U_RAGDOLL] === 1;
    if (rag) this.ragLambda.fill(0);
    this.seesawLambda.fill(0);

    const fx = this.px[FRAME]!;
    const fy = this.py[FRAME]!;
    const wheelB = WHEEL_BODIES;

    for (let it = 0; it < iters; it++) {
      // --- suspension sliders
      for (let w = 0; w < 2; w++) {
        const wb = wheelB[w]!;
        const rx = this.px[wb]! - fx;
        const ry = this.py[wb]! - fy;
        const nx = this.sNx[w]!;
        const ny = this.sNy[w]!;
        // perpendicular (bilateral)
        {
          const rn = rx * ny - ry * nx;
          const mass = 1 / (im[wb]! + im[FRAME]! + ii[FRAME]! * rn * rn);
          const relx = vx[wb]! - (vx[FRAME]! - av[FRAME]! * ry);
          const rely = vy[wb]! - (vy[FRAME]! + av[FRAME]! * rx);
          const cdot = relx * nx + rely * ny;
          const lambda = -mass * (cdot + (bj * this.sPerp[w]!) / dt);
          vx[wb] = vx[wb]! + lambda * nx * im[wb]!;
          vy[wb] = vy[wb]! + lambda * ny * im[wb]!;
          vx[FRAME] = vx[FRAME]! - lambda * nx * im[FRAME]!;
          vy[FRAME] = vy[FRAME]! - lambda * ny * im[FRAME]!;
          av[FRAME] = av[FRAME]! - ii[FRAME]! * rn * lambda;
        }
        // travel limits (unilateral, speculative)
        const ax = this.sAx[w]!;
        const ay = this.sAy[w]!;
        const st = w === 0 ? t.suspension.rear : t.suspension.front;
        const comp = this.sComp[w]!;
        const ra = rx * ay - ry * ax;
        const massA = 1 / (im[wb]! + im[FRAME]! + ii[FRAME]! * ra * ra);
        if (comp < 0.03) {
          const relx = vx[wb]! - (vx[FRAME]! - av[FRAME]! * ry);
          const rely = vy[wb]! - (vy[FRAME]! + av[FRAME]! * rx);
          const rate = relx * ax + rely * ay; // d(comp)/dt
          const vnMin = comp > 0 ? -comp / dt : (bj * -comp) / dt;
          let lambda = -massA * (rate - vnMin);
          const old = this.sLimLo[w]!;
          const acc = Math.max(0, old + lambda);
          lambda = acc - old;
          this.sLimLo[w] = acc;
          vx[wb] = vx[wb]! + lambda * ax * im[wb]!;
          vy[wb] = vy[wb]! + lambda * ay * im[wb]!;
          vx[FRAME] = vx[FRAME]! - lambda * ax * im[FRAME]!;
          vy[FRAME] = vy[FRAME]! - lambda * ay * im[FRAME]!;
          av[FRAME] = av[FRAME]! - ii[FRAME]! * ra * lambda;
        }
        const room = st.travel - comp;
        if (room < 0.03) {
          const relx = vx[wb]! - (vx[FRAME]! - av[FRAME]! * ry);
          const rely = vy[wb]! - (vy[FRAME]! + av[FRAME]! * rx);
          const rate = -(relx * ax + rely * ay);
          const vnMin = room > 0 ? -room / dt : (bj * -room) / dt;
          let lambda = -massA * (rate - vnMin);
          const old = this.sLimHi[w]!;
          const acc = Math.max(0, old + lambda);
          lambda = acc - old;
          this.sLimHi[w] = acc;
          vx[wb] = vx[wb]! - lambda * ax * im[wb]!;
          vy[wb] = vy[wb]! - lambda * ay * im[wb]!;
          vx[FRAME] = vx[FRAME]! + lambda * ax * im[FRAME]!;
          vy[FRAME] = vy[FRAME]! + lambda * ay * im[FRAME]!;
          av[FRAME] = av[FRAME]! + ii[FRAME]! * ra * lambda;
        }
      }

      // --- rider tether hard limit
      if (this.tetherActive) {
        const nx = this.tetherNx;
        const ny = this.tetherNy;
        const rax = this.anchorX - fx;
        const ray = this.anchorY - fy;
        const rn = rax * ny - ray * nx;
        const mass = 1 / (im[RIDER]! + im[FRAME]! + ii[FRAME]! * rn * rn);
        const relx = vx[RIDER]! - (vx[FRAME]! - av[FRAME]! * ray);
        const rely = vy[RIDER]! - (vy[FRAME]! + av[FRAME]! * rax);
        const cdot = -(relx * nx + rely * ny); // d(sep)/dt
        const sep = this.tetherSep;
        const vnMin = sep > 0 ? -sep / dt : (bj * -sep) / dt;
        let lambda = -mass * (cdot - vnMin);
        const old = this.tetherLambda;
        const acc = Math.max(0, old + lambda);
        lambda = acc - old;
        this.tetherLambda = acc;
        vx[RIDER] = vx[RIDER]! - lambda * nx * im[RIDER]!;
        vy[RIDER] = vy[RIDER]! - lambda * ny * im[RIDER]!;
        vx[FRAME] = vx[FRAME]! + lambda * nx * im[FRAME]!;
        vy[FRAME] = vy[FRAME]! + lambda * ny * im[FRAME]!;
        av[FRAME] = av[FRAME]! + ii[FRAME]! * rn * lambda;
      }

      // --- legs-straight stop (unilateral along frame-up; the hop lifts the bike through this)
      if (this.legActive) {
        const c0 = cos(this.an[FRAME]!);
        const s0 = sin(this.an[FRAME]!);
        const nx = -s0;
        const ny = c0;
        const rax = this.anchorX - fx;
        const ray = this.anchorY - fy;
        const rn = rax * ny - ray * nx;
        const mass = 1 / (im[RIDER]! + im[FRAME]! + ii[FRAME]! * rn * rn);
        const relx = vx[RIDER]! - (vx[FRAME]! - av[FRAME]! * ray);
        const rely = vy[RIDER]! - (vy[FRAME]! + av[FRAME]! * rax);
        const cdot = -(relx * nx + rely * ny);
        const sep = this.legSep;
        const vnMin = sep > 0 ? -sep / dt : (bj * -sep) / dt;
        let lambda = -mass * (cdot - vnMin);
        const old = this.legLambda;
        const acc = Math.max(0, old + lambda);
        lambda = acc - old;
        this.legLambda = acc;
        vx[RIDER] = vx[RIDER]! - lambda * nx * im[RIDER]!;
        vy[RIDER] = vy[RIDER]! - lambda * ny * im[RIDER]!;
        vx[FRAME] = vx[FRAME]! + lambda * nx * im[FRAME]!;
        vy[FRAME] = vy[FRAME]! + lambda * ny * im[FRAME]!;
        av[FRAME] = av[FRAME]! + ii[FRAME]! * rn * lambda;
      }

      // --- ragdoll joints
      if (rag) this.solveRagdollJoints();

      // --- seesaw angle limits
      for (let sI = 0; sI < this.nSeesaw; sI++) {
        const b = FIRST_DYN + sI;
        const maxA = this.col!.seesawBodies[sI]!.collider.maxAngle;
        const a = this.an[b]!;
        const w = av[b]!;
        const massA = 1 / ii[b]!;
        // upper
        {
          const sep = maxA - a;
          if (sep < 0.05) {
            const vnMin = sep > 0 ? -sep / dt : (bj * -sep) / dt;
            let lambda = -massA * (-w - vnMin);
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
            const w2 = av[b]!;
            const vnMin = sep > 0 ? -sep / dt : (bj * -sep) / dt;
            let lambda = -massA * (w2 - vnMin);
            const old = this.seesawLambda[sI * 2 + 1]!;
            const acc = Math.max(0, old + lambda);
            lambda = acc - old;
            this.seesawLambda[sI * 2 + 1] = acc;
            av[b] = av[b]! + lambda * ii[b]!;
          }
        }
      }

      // --- contacts
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
        // normal
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
        // friction / tyre
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
          let lambda = -this.cMassT[i]! * vt;
          const maxF = this.cMu[i]! * this.cLn[i]!;
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

      // --- brakes: lock wheel spin to the frame, torque-limited
      if (riding && this.brakeIn > 0) {
        for (let w = 0; w < 2; w++) {
          const wb = wheelB[w]!;
          let maxNm = w === 0 ? t.brakes.rearMaxNm : t.brakes.frontMaxNm;
          if (w === 1 && t.brakes.antiEndo > 0) {
            const W = (t.frame.mass + 2 * t.wheel.mass + t.rider.mass) * t.gravity;
            const rearN = this.F[S_REAR_LN]! / dt;
            maxNm *= clamp(rearN / (t.brakes.antiEndo * W), 0.25, 1);
          }
          const maxJ = this.brakeIn * maxNm * dt;
          const rel = av[wb]! - av[FRAME]!;
          const mass = 1 / (ii[wb]! + ii[FRAME]!);
          let lambda = -mass * rel;
          const old = this.sBrake[w]!;
          const acc = clamp(old + lambda, -maxJ, maxJ);
          lambda = acc - old;
          this.sBrake[w] = acc;
          av[wb] = av[wb]! + lambda * ii[wb]!;
          av[FRAME] = av[FRAME]! - lambda * ii[FRAME]!;
        }
      }
    }
  }

  private solveRagdollJoints(): void {
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
      // anchors: local (0, y) rotated
      const rpx = -sp * py0;
      const rpy = cp * py0;
      const rcx = -sc * cy0;
      const rcy = cc * cy0;
      const ex = this.px[C]! + rcx - (this.px[P]! + rpx);
      const ey = this.py[C]! + rcy - (this.py[P]! + rpy);
      // x then y as 1-D constraints on relative anchor velocity (child - parent)
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
      // angular limit around the rest relative angle
      const rel = wrapAngle(this.an[C]! - this.an[P]! - this.F[S_RAG_REST + j]!);
      const massA = 1 / (ii[P]! + ii[C]!);
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

  private integratePositions(): void {
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

  private derive(riding: boolean): void {
    const F = this.F;
    const U = this.U;
    const t = this.tuning;
    const dt = this.dt;
    const track = this.track!;
    const R = t.wheel.radius;

    // suspension compression from the integrated pose
    const c = cos(this.an[FRAME]!);
    const s = sin(this.an[FRAME]!);
    for (let w = 0; w < 2; w++) {
      const st = w === 0 ? t.suspension.rear : t.suspension.front;
      const wb = w === 0 ? REAR : FRONT;
      const ax = st.axis.x * c - st.axis.y * s;
      const ay = st.axis.x * s + st.axis.y * c;
      const arx = this.px[FRAME]! + st.axle.x * c - st.axle.y * s;
      const ary = this.py[FRAME]! + st.axle.x * s + st.axle.y * c;
      const comp = (this.px[wb]! - arx) * ax + (this.py[wb]! - ary) * ay;
      F[w === 0 ? S_REAR_COMP : S_FRONT_COMP] = clamp(comp / st.travel, 0, 1);
    }

    // wheel contact summary
    let rearLn = 0;
    let frontLn = 0;
    let rearLt = 0;
    let frontLt = 0;
    let rearSurf = -1;
    let frontSurf = -1;
    let rearBest = 0;
    let frontBest = 0;
    let rearMu = 0;
    for (let i = 0; i < this.nC; i++) {
      const A = this.cA[i]!;
      const ln = this.cLn[i]!;
      if (A === REAR) {
        rearLn += ln;
        rearLt += this.cLt[i]!;
        if (ln > rearBest) {
          rearBest = ln;
          rearSurf = this.cSurf[i]!;
          rearMu = this.cMu[i]!;
        }
      } else if (A === FRONT) {
        frontLn += ln;
        frontLt += this.cLt[i]!;
        if (ln > frontBest) {
          frontBest = ln;
          frontSurf = this.cSurf[i]!;
        }
      }
    }
    F[S_REAR_LN] = rearLn;
    F[S_FRONT_LN] = frontLn;
    F[S_REAR_LT] = rearLt;
    F[S_FRONT_LT] = frontLt;
    F[S_REAR_MU] = rearMu;
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

    // slip: spinVel*R - ground speed along bike x
    const groundSpeed = this.vx[REAR]! * c + this.vy[REAR]! * s;
    F[S_REAR_SLIP] = -this.av[REAR]! * R - groundSpeed;
    F[S_FRONT_SLIP] = -this.av[FRONT]! * R - (this.vx[FRONT]! * c + this.vy[FRONT]! * s);

    if (riding) {
      // checkpoints / finish on the front axle x
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

      // crash rules
      let fault = 0;
      let cause = 0;
      if (U[U_CRASH_PENDING] === 1) {
        fault = 1;
        cause = 1;
      } else {
        const dx = this.px[RIDER]! - this.anchorX;
        const dy = this.py[RIDER]! - this.anchorY;
        if (dx * dx + dy * dy > t.rider.tetherMax * t.rider.tetherMax * 1.69) {
          fault = 1;
          cause = 2;
        } else if (F[S_TETHER_OVER]! >= 2) {
          fault = 1;
          cause = 3;
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
            const r = b === FRAME ? 0.3 : b === RIDER ? 0.3 : R;
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

  private spawnRagdoll(): void {
    const t = this.tuning;
    const U = this.U;
    const wa = wrapAngle(this.an[FRAME]!);
    const phi = t.rider.torsoFollow * wa;
    const ux = -sin(phi);
    const uy = cos(phi);
    const fx = cos(phi);
    const fy = sin(phi);
    const rx = this.px[RIDER]!;
    const ry = this.py[RIDER]!;
    const rvx = this.vx[RIDER]!;
    const rvy = this.vy[RIDER]!;
    const fw = this.av[FRAME]!;
    const spread = t.ragdoll.spread;
    // body placement: [centre offset along u, offset along fwd, axis direction (dx, dy) distal->proximal]
    const place = (i: number, cx: number, cy: number, dirx: number, diry: number): void => {
      const b = RAG0 + i;
      const limb = RAG_LIMBS[i]!;
      this.px[b] = cx;
      this.py[b] = cy;
      // local +y points from distal to proximal: (-sin a, cos a) = (dirx, diry)
      this.an[b] = limb.len === 0 ? phi : atan2(-dirx, diry);
      const ox = cx - this.px[FRAME]!;
      const oy = cy - this.py[FRAME]!;
      this.vx[b] = rvx - fw * oy * 0.5 + (this.rng.next() * 2 - 1) * spread;
      this.vy[b] = rvy + fw * ox * 0.5 + (this.rng.next() * 2 - 1) * spread;
      this.av[b] = fw * 0.5 + (this.rng.next() * 2 - 1) * 2;
      this.im[b] = 1 / limb.mass;
      const I = limb.len === 0 ? 0.4 * limb.mass * limb.r * limb.r : (limb.mass * limb.len * limb.len) / 12 + 0.5 * limb.mass * limb.r * limb.r;
      this.ii[b] = 1 / I;
    };
    // torso spans -0.05..0.35 along u, pelvis -0.25..-0.05, head centre at 0.47
    place(1, rx + ux * 0.15, ry + uy * 0.15, ux, uy);
    place(2, rx - ux * 0.15, ry - uy * 0.15, ux, uy);
    place(0, rx + ux * 0.47, ry + uy * 0.47, ux, uy);
    // arm from the shoulder (0.30 along u) forward-down
    {
      const sx = rx + ux * 0.3;
      const sy = ry + uy * 0.3;
      let dx = fx * 0.7 - ux * 0.7;
      let dy = fy * 0.7 - uy * 0.7;
      let l = Math.sqrt(dx * dx + dy * dy);
      dx /= l;
      dy /= l;
      place(3, sx + dx * 0.15, sy + dy * 0.15, -dx, -dy);
      const ex = sx + dx * 0.3;
      const ey = sy + dy * 0.3;
      dx = fx * 0.9 + ux * 0.2;
      dy = fy * 0.9 + uy * 0.2;
      l = Math.sqrt(dx * dx + dy * dy);
      dx /= l;
      dy /= l;
      place(4, ex + dx * 0.14, ey + dy * 0.14, -dx, -dy);
    }
    // leg from the hip (-0.25 along u): thigh forward-down, shin down
    {
      const hx = rx - ux * 0.25;
      const hy = ry - uy * 0.25;
      let dx = fx * 0.6 - ux * 0.6;
      let dy = fy * 0.6 - uy * 0.6;
      let l = Math.sqrt(dx * dx + dy * dy);
      dx /= l;
      dy /= l;
      place(5, hx + dx * 0.21, hy + dy * 0.21, -dx, -dy);
      const kx = hx + dx * 0.42;
      const ky = hy + dy * 0.42;
      dx = -ux;
      dy = -uy;
      l = Math.sqrt(dx * dx + dy * dy);
      place(6, kx + dx * 0.21, ky + dy * 0.21, -dx, -dy);
    }
    for (let j = 0; j < RAG_JOINTS.length; j++) {
      const [pi, ci] = RAG_JOINTS[j]!;
      this.F[S_RAG_REST + j] = wrapAngle(this.an[RAG0 + ci]! - this.an[RAG0 + pi]!);
    }
    // rider point mass leaves the simulation
    this.im[RIDER] = 0;
    this.vx[RIDER] = 0;
    this.vy[RIDER] = 0;
    U[U_RAGDOLL] = 1;
    this.F[S_CRASH_T] = 0;
    this.F[S_THROTTLE_EFF] = 0;
    this.F[S_ENGINE_TQ] = 0;
  }
}

export function createBikePhysics(physicsHz: number, tuning?: PartialTuning): BikePhysicsWorld {
  return new BikeWorld(physicsHz, tuning);
}

export const bikePhysicsFactory = (physicsHz: number): PhysicsWorld => createBikePhysics(physicsHz);
