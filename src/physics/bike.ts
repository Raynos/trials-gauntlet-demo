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
import type { LoadTrackOptions, PhysicsWorld } from './index';
import { CollisionWorld, circleVsPrim, PrimKind, type Manifold, type Prim } from './collision';
import { bikeTuning, SURFACES, type BikeClass, type BikeTuning, type PartialTuning, type SuspensionTuning } from './tuning';
import { atan, atan2, clamp, cos, sin, wrapAngle, HALF_PI, PI, QUARTER_PI } from './dmath';

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
  engine: { rpm: number; torqueNm: number; limiter: boolean; throttleEff: number; driveFrac: number; rearSlopeDeg: number; frontSlopeDeg: number };
  suspension: { rear: SuspDebug; front: SuspDebug };
  rider: { anchor: Vec2; offset: Vec2; tetherForce: number; hopPhase: HopPhase; crouch: number; hopExt: number; air: number };
  balancePitch: number;
  /** The drawn rider chain in world space (7.7): the crash sensors and the ragdoll spawn live on it. */
  riderChain: { hips: Vec2; shoulders: Vec2; head: Vec2; elbow: Vec2; hand: Vec2; knee: Vec2; foot: Vec2; torsoDir: Vec2; headDir: Vec2 };
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
  /** The tuning table in force: the loaded track's bike class preset under the constructor's partial. */
  readonly tuning: Readonly<BikeTuning>;
  /** The bike class of the loaded track ('rookie' | 'pro'). */
  readonly bike: BikeClass;
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

/** Max upward correction rate (m/s) for a wheel straddling a one-way board (round 11, collision.ts Manifold.straddle). */
const STRADDLE_LIFT = 2.5;

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
const S_BRAKE_EFF = 40;
// rider geometry of the LAST force pass, read by the next tick's hop state machine (`riderExt`) and by
// debug(): state, not scratch — round 5's play/replay divergence was these four living on the instance
const S_LEG_STOP_X = 41;
const S_LEG_STOP_Y = 42;
const S_ANCHOR_X = 43;
const S_ANCHOR_Y = 44;
/**
 * Ground slope (rad, CCW from +x) of the steepest loaded contact under each wheel at its last grounded
 * tick, from derive(): read by the next controls() (the wheelie control keys on the frame pitch relative
 * to the steeper of the two), so they live in F.
 */
const S_REAR_SLOPE = 45;
const S_FRONT_SLOPE = 46;
/**
 * Airborne blend 0..1 (round 10): slews toward 1 while both wheels are off the ground (from the last
 * derive()'s S_REAR_AIR / S_FRONT_AIR) and back toward 0 when either touches. It scales the lean's mass
 * shift (`rider.airShift`) and the engine braking (`engine.engineBrakeAir`) - in the air the lean is the
 * torso swing - and is read by riderPose(), so it is state.
 */
const S_AIR = 47;
const NSCALAR = 48;

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
const U_FRAME_GND = 13; // a frame hard point carried load last tick (round 10: a bike hung on its bash plate is not flying)
const NU = 16;

const FAULTS: (FaultReason | null)[] = [null, 'crash', 'out-of-bounds', 'restart', 'timeout', 'hazard'];
const HOPS: HopPhase[] = ['idle', 'preload', 'push', 'recover'];
const CAUSES: PhysicsDebug['crashCause'][] = [null, 'sensor', 'tetherDist', 'tetherForce', 'oob', 'hazard'];

const MAX_CONTACTS = 128;
// shared frozen empties for tracks without dynamic bodies (a state is plain data; nobody may mutate it)
const EMPTY_SEESAWS: PhysicsState['seesaws'] = Object.freeze([]) as unknown as PhysicsState['seesaws'];
const EMPTY_DRUMS: PhysicsState['drums'] = Object.freeze([]) as unknown as PhysicsState['drums'];
const WHEEL_BODIES = [REAR, FRONT];
const RPM_PER_RADS = 60 / (2 * PI);

interface RagLimb {
  len: number;
  r: number;
  mass: number;
}
const RAG_LIMBS: RagLimb[] = [
  { len: 0, r: 0.12, mass: 5 }, // head (helmet 0.13)
  { len: 0.4, r: 0.13, mass: 30 }, // torso capsule (the hips -> shoulder joints are +-CH.torso/2 = 0.26, below)
  { len: 0.2, r: 0.12, mass: 12 }, // pelvis
  { len: 0.26, r: 0.06, mass: 5 }, // upperArm: the 0.32 arm seen from the side (the elbow is 0.11-0.27 m out of the plane, RIDER_CHAIN.md); 0.17-0.30 projected across the poses
  { len: 0.28, r: 0.05, mass: 3 }, // forearm: 0.30 elbow -> grip, 0.26-0.30 projected
  { len: 0.46, r: 0.08, mass: 12 }, // thigh (in plane: the knee sits 0.02-0.03 m out)
  { len: 0.42, r: 0.06, mass: 8 }, // shin 0.43, 0.42 projected
];
/**
 * [parent, child, parentLocalY, childLocalY, angularRange] — anchors are on the local y axis (+y runs
 * distal -> proximal, i.e. from the far end of the limb toward the body). The anchors are where the
 * drawn chain's joints are: torso centre is 0.26 above the hips (CH.torso 0.52), so the neck (shoulders)
 * is +0.26 and the spine (hips) -0.26 on the torso; the head hangs CH.neck 0.22 beyond the shoulders;
 * the pelvis centre is 0.1 below the hips. Limb anchors are +-len/2 of the rods above; a rod shorter
 * than the projected segment at the spawn (the arm, up to 4-5 cm a side) is pulled together by the
 * joint Baumgarte over ~10 ticks, not snapped.
 */
const RAG_JOINTS: [number, number, number, number, number][] = [
  [1, 0, 0.26, -0.22, 0.7], // neck
  [1, 2, -0.26, 0.1, 0.6], // spine
  [1, 3, 0.26, 0.13, 2.5], // shoulder
  [3, 4, -0.13, 0.14, 1.6], // elbow
  [2, 5, -0.1, 0.23, 1.4], // hip
  [5, 6, -0.23, 0.21, 1.4], // knee
];

// ---------------------------------------------------------------------------
// Rider chain (round 10): the render's `src/render/rider/pose.ts` riderChain, ported — the reference-
// measured chain of assets/blender/RIDER_CHAIN.md. AXLE coordinates (origin = axle midpoint at static
// sag, x forward, y up, z toward the camera = the rider's left), metres / radians. Do not import the
// render; the numbers are the reference's and `world.test.ts` checks this port against the canonical
// joint tables in RIDER_CHAIN.md directly.
// ---------------------------------------------------------------------------

/** Segment lengths (m), 1.78 m rider at 7.5 heads — RIDER_CHAIN.md "Segment lengths". */
const CH = {
  torso: 0.52,
  neck: 0.22,
  upperArm: 0.32,
  forearm: 0.3,
  thigh: 0.46,
  shin: 0.43,
  shoulderHalf: 0.21,
  hipHalf: 0.09,
  ankleUp: 0.09,
  ankleFwd: 0.01,
};
/** Left grip centre and left peg (render `BIKE.grip` / `BIKE.pegs`); the right side mirrors z. */
const GRIP_X = 0.27;
const GRIP_Y = 0.78;
const GRIP_Z = 0.33;
const PEG_X = -0.14;
const PEG_Y = 0.02;
const PEG_Z = 0.2;
const ANKLE_X = PEG_X + CH.ankleFwd;
const ANKLE_Y = PEG_Y + CH.ankleUp;
/** Canonical corners (hips x, y; torso, head deg above horizontal) — RIDER_CHAIN.md "Canonical poses". */
const CANON = {
  stand_attack: { hipX: -0.28, hipY: 0.85, torso: 40, head: 66 },
  hang_back: { hipX: -0.57, hipY: 0.6, torso: 55, head: 75 },
  forward_attack: { hipX: -0.22, hipY: 0.9, torso: 26, head: 42 },
  crouch: { hipX: -0.38, hipY: 0.78, torso: 28, head: 40 },
  land_absorb: { hipX: -0.4, hipY: 0.7, torso: 30, head: 45 },
};
/** Elbow pole forward-up-out, knee pole forward and slightly in (z is per side). */
const ELBOW_POLE = { x: 0.6, y: 0.5, z: 1.0 };
const KNEE_POLE = { x: 1, y: 0.2, z: -0.15 };
const ARM_REACH = (CH.upperArm + CH.forearm) * 0.985;
const ARM_NEAR = 0.18;
const LEG_REACH = (CH.thigh + CH.shin) * 0.985;
const DEG = PI / 180;

/**
 * Body parameters from the pose inputs (RIDER_CHAIN.md "Body parameter curves"): hips (x, y) and the
 * torso / head angles above horizontal (rad). `back` / `fwd` 0..1, `crouch` = the hop preload 0..1,
 * `land` = touchdown absorb 0..1 (render-driven; 0 here), `torsoPitch` rad (+ = pitched forward).
 */
function bodyParams(back: number, fwd: number, crouch: number, land: number, torsoPitch: number): { hipX: number; hipY: number; torso: number; head: number } {
  const S = CANON.stand_attack;
  const H = CANON.hang_back;
  const F = CANON.forward_attack;
  const C = CANON.crouch;
  const L = CANON.land_absorb;
  const sb = 1 - Math.pow(1 - back, 1.3);
  let hipX = S.hipX + (H.hipX - S.hipX) * sb + (F.hipX - S.hipX) * fwd;
  let hipY = S.hipY + (H.hipY - S.hipY) * sb - 0.03 * sin(PI * back) + (F.hipY - S.hipY) * fwd;
  let torso = S.torso + (H.torso - S.torso) * back + (F.torso - S.torso) * fwd;
  let head = S.head + (H.head - S.head) * back + (F.head - S.head) * fwd;
  hipX += (C.hipX - S.hipX) * crouch * (1 - 0.7 * back);
  hipY += (C.hipY - S.hipY) * crouch * (1 - 0.3 * back);
  torso += (C.torso - S.torso) * crouch * (1 - 0.55 * back);
  head += (C.head - S.head) * crouch;
  hipX += (L.hipX - S.hipX) * land;
  hipY += (L.hipY - S.hipY) * land;
  torso += (L.torso - S.torso) * land;
  head += (L.head - S.head) * land;
  torso -= torsoPitch * 0.6 * (180 / PI);
  torso = clamp(torso, 12, 80);
  head = Math.max(head, torso + 12);
  return { hipX, hipY, torso: torso * DEG, head: head * DEG };
}

/**
 * Two-bone IK in 3D (RIDER_CHAIN.md "Bend-direction rules"): the joint for A -> B with bone lengths
 * l1, l2 bending toward `pole`; reach clamped to 0.995 (l1 + l2), never closer than |l1 - l2| + 0.02.
 * Returns the joint's x, y (the z is the render's; the plane keeps the projection).
 */
function ik3(ax: number, ay: number, az: number, bx: number, by: number, bz: number, l1: number, l2: number, px0: number, py0: number, pz0: number): [number, number] {
  let dx = bx - ax;
  let dy = by - ay;
  let dz = bz - az;
  let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const max = (l1 + l2) * 0.995;
  const min = Math.abs(l1 - l2) + 0.02;
  if (d < 1e-6) return [ax + l1, ay];
  if (d > max || d < min) {
    const k = (d > max ? max : min) / d;
    dx *= k;
    dy *= k;
    dz *= k;
    d = d > max ? max : min;
  }
  const ux = dx / d;
  const uy = dy / d;
  const uz = dz / d;
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const pu = px0 * ux + py0 * uy + pz0 * uz;
  let px = px0 - ux * pu;
  let py = py0 - uy * pu;
  let pz = pz0 - uz * pu;
  const pl = Math.sqrt(px * px + py * py + pz * pz) || 1;
  px /= pl;
  py /= pl;
  pz /= pl;
  void pz;
  return [ax + ux * x + px * h, ay + uy * x + py * h];
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

class BikeWorld implements BikePhysicsWorld {
  readonly physicsHz: number;
  private _tuning: Readonly<BikeTuning>;
  /** The constructor's partial, re-applied over every class preset. */
  private readonly override: PartialTuning | undefined;
  private _bike: BikeClass = 'rookie';
  private readonly dt: number;
  /** Effective gravity: tuning.gravity * tuning.gravityScale. */
  private g: number;

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
  /** Ground (surface) normal of the contact: a segment's own normal even when the manifold is a vertex contact (whose normal points from the corner to the wheel centre and would read a 6 deg descent as a 20 deg climb at 17 m/s); the contact normal for circles and boxes. */
  private readonly cGx = new Float64Array(MAX_CONTACTS);
  private readonly cGy = new Float64Array(MAX_CONTACTS);
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
  // INVARIANT (CONTRACT 2.3): every field below is written inside the same step() before it is read
  // (solve() zeroes the accumulated impulses; applyForces() sets the rider points) so nothing here
  // survives a tick. Anything read across ticks belongs in F/U (see S_LEG_STOP_*), or `restore()`
  // resumes a different world than `snapshot()` saw (`snapshot.test.ts`).
  private tetherLambda = 0;
  private tetherActive = false;
  private legLambda = 0;
  private legActive = false;
  private legSep = 0;
  private tetherNx = 0;
  private tetherNy = 0;
  private tetherSep = 0;
  private legX = 0;
  private legY = 0;
  private braceX = 0;
  private braceY = 0;
  private readonly ragLambda = new Float64Array(RAG_JOINTS.length * 3);
  private seesawLambda = new Float64Array(0);
  private torsoLambda = 0;
  private torsoRate = 0;
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
    this.override = tuning;
    this._tuning = Object.freeze(bikeTuning('rookie', tuning));
    this.g = this._tuning.gravity * this._tuning.gravityScale;
    this.axleOrigin();
    this.bindViews();
  }

  get tuning(): Readonly<BikeTuning> {
    return this._tuning;
  }

  /** The bike class the loaded track runs ('rookie' until a loadTrack says otherwise). */
  get bike(): BikeClass {
    return this._bike;
  }

  /** Swap the tuning table for a class (round 11): the preset under the constructor's override; g and the axle origin follow. */
  private selectBike(cls: BikeClass): void {
    if (cls === this._bike && this.track !== null) return;
    this._bike = cls;
    this._tuning = Object.freeze(bikeTuning(cls, this.override));
    this.g = this._tuning.gravity * this._tuning.gravityScale;
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

  loadTrack(track: CompiledTrack, seed: number, opts?: LoadTrackOptions): void {
    // v1 has two rows; the v2 reference row 'mid' rides v1's honest bike
    const cls = opts?.bike ?? 'rookie';
    this.selectBike(cls === 'pro' ? 'pro' : 'rookie');
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

  /**
   * Fresh plain-data copy every call (consumers hold on to states across ticks: ghost, renderer
   * interpolation, the harness). Allocation is the output tree only, sized up front: ~14 small objects
   * riding, +15 when ragdolling; nothing is computed here that step() did not already leave in F/U.
   */
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
    return {
      tick: F[S_TICK]!,
      time: F[S_TIME]!,
      bike: {
        pos: { x: px[FRAME]!, y: py[FRAME]! },
        vel: { x: this.vx[FRAME]!, y: this.vy[FRAME]! },
        angle: an[FRAME]!,
        angVel: av[FRAME]!,
      },
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
      engine: { rpm: F[S_RPM]!, throttleEff: F[S_THROTTLE_EFF]!, limiter: U[U_LIMITER] === 1 },
      contacts: {
        rear: rs > 0 ? SURFACES[rs - 1]! : null,
        front: fs > 0 ? SURFACES[fs - 1]! : null,
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

  /** Combined COM relative to the rear contact patch in frame space (d ahead, h above) for a lean, at static sag. */
  private comDH(lean: number): { d: number; h: number } {
    const t = this.tuning;
    const R = t.wheel.radius;
    const cr = this.staticSag(t.suspension.rear, this.staticLoad(0));
    const cf = this.staticSag(t.suspension.front, this.staticLoad(1));
    const rear = { x: t.suspension.rear.axle.x + t.suspension.rear.axis.x * cr, y: t.suspension.rear.axle.y + t.suspension.rear.axis.y * cr };
    const front = { x: t.suspension.front.axle.x + t.suspension.front.axis.x * cf, y: t.suspension.front.axle.y + t.suspension.front.axis.y * cf };
    const leanOff = lean > 0 ? lean * t.rider.leanFwd : lean * t.rider.leanBack;
    const rider = { x: t.rider.anchor.x + leanOff, y: t.rider.anchor.y - this.F[S_CROUCH]! * t.rider.crouch - (lean > 0 ? lean * t.rider.leanCrouchFwd : -lean * t.rider.leanCrouch) };
    const M = t.frame.mass + 2 * t.wheel.mass + t.rider.mass;
    const cx = (t.wheel.mass * (rear.x + front.x) + t.rider.mass * rider.x) / M;
    const cy = (t.wheel.mass * (rear.y + front.y) + t.rider.mass * rider.y) / M;
    return { d: cx - rear.x, h: cy - (rear.y - R) };
  }

  balancePitch(lean: number, accel = 0): number {
    const { d, h } = this.comDH(lean);
    // forward acceleration lifts the nose (pseudo-force at the COM), so the balance pitch drops with accel
    return HALF_PI - atan2(h, d) - atan(accel / this.g);
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
      engine: { rpm: F[S_RPM]!, torqueNm: F[S_ENGINE_TQ]!, limiter: this.U[U_LIMITER] === 1, throttleEff: F[S_THROTTLE_EFF]!, driveFrac: this.driveFrac, rearSlopeDeg: (F[S_REAR_SLOPE]! * 180) / PI, frontSlopeDeg: (F[S_FRONT_SLOPE]! * 180) / PI },
      suspension: {
        rear: { compression: this.sComp[0]!, rate: this.sRate[0]!, force: this.sForce[0]! },
        front: { compression: this.sComp[1]!, rate: this.sRate[1]!, force: this.sForce[1]! },
      },
      rider: {
        anchor: { x: F[S_ANCHOR_X]!, y: F[S_ANCHOR_Y]! },
        offset: { x: this.px[RIDER]! - F[S_ANCHOR_X]!, y: this.py[RIDER]! - F[S_ANCHOR_Y]! },
        tetherForce: F[S_TETHER_F]!,
        hopPhase: HOPS[this.U[U_HOP]!]!,
        crouch: F[S_CROUCH]!,
        hopExt: F[S_HOP_EXT]!,
        air: F[S_AIR]!,
      },
      balancePitch: this.balancePitch(F[S_LEAN_EFF]!, 0),
      riderChain: this.chainDebug(),
      crashCause: CAUSES[this.U[U_CRASH_CAUSE]!] ?? null,
    };
  }

  private chainDebug(): PhysicsDebug['riderChain'] {
    this.riderChain();
    const p = (i: number): Vec2 => ({ x: this.chX[i]!, y: this.chY[i]! });
    return { hips: p(0), shoulders: p(1), head: p(2), elbow: p(3), hand: p(4), knee: p(5), foot: p(6), torsoDir: { x: this.chDx, y: this.chDy }, headDir: { x: this.chHx, y: this.chHy } };
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
    const W = M * this.g;
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
    const shift = this.shiftScale();
    const leanOff = (lean > 0 ? lean * t.rider.leanFwd : lean * t.rider.leanBack) * shift;
    const [ax, ay] = rot(
      t.rider.anchor.x + leanOff,
      t.rider.anchor.y - this.F[S_CROUCH]! * t.rider.crouch + this.F[S_HOP_EXT]! * t.rider.hopExtend - (lean > 0 ? lean * t.rider.leanCrouchFwd : -lean * t.rider.leanCrouch) * shift,
    );
    this.px[RIDER] = fx + ax;
    this.py[RIDER] = fy + ay;
    // torso at its lean target (round 9: a teleport with a stale leanEff used to leave the torso at 0
    // and the motor swung it on the next ticks, pitching the placed bike by ~10 deg out of nothing)
    this.an[RIDER] = angle + lean * t.rider.torso.swing;
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

  /** Rider height above the legs-straight stop along frame-up (uses the stop of the last force pass). */
  private riderExt(): number {
    const c = cos(this.an[FRAME]!);
    const s = sin(this.an[FRAME]!);
    const dx = this.px[RIDER]! - this.F[S_LEG_STOP_X]!;
    const dy = this.py[RIDER]! - this.F[S_LEG_STOP_Y]!;
    return -dx * s + dy * c;
  }

  /**
   * The drawn rider comes from the rider MASS, not from the input: `lean` is the point mass's
   * fore-aft offset from the neutral anchor in frame space (normalised by the lean travel), `crouch`
   * its drop below the neutral height, `torsoPitch` the torso angular DOF's swing relative to the
   * frame (the angular momentum store, 7.4) plus the frame pitch, `armExtend` from the lean pose and
   * the pitch. The input slew, the 16 rad/s fore-aft brace and the torque-limited torso motor give
   * the pose its lag and overshoot (`FEEL pose.*`), so the rider is never bolted to the bike. The
   * crash sensors (`riderChain`) are built from the same pose, so what is drawn is what crashes.
   */
  private riderPose(): PhysicsState['rider'] {
    const t = this.tuning;
    const r = t.rider;
    const F = this.F;
    const c = cos(this.an[FRAME]!);
    const s = sin(this.an[FRAME]!);
    const dx = this.px[RIDER]! - this.px[FRAME]!;
    const dy = this.py[RIDER]! - this.py[FRAME]!;
    const localX = dx * c + dy * s;
    // the lean travel is shorter in the air (airShift); the pose reads the fraction of the current travel
    const along = (localX - r.anchor.x) / this.shiftScale();
    const lean = clamp(along / (along >= 0 ? r.leanFwd : r.leanBack), -1, 1);
    // round 10: `crouch` is the hop preload alone (the eased hop-machine state the anchor follows), not
    // the mass's drop - the lean drops (leanCrouch / leanCrouchFwd) are COM levers, the drawn rider does
    // not squat for them (RIDER_CHAIN.md "Curves")
    const cr = F[S_CROUCH]!;
    const crouch = cr * cr * (3 - 2 * cr);
    const wa = wrapAngle(this.an[FRAME]!);
    // torsoPitch: the torso store's TRANSIENT (its lag behind the lean target, + = pitched forward
    // relative to the frame) plus the frame-pitch term; zero once a lean has settled at any lean
    const swing = clamp((this.an[RIDER]! - this.an[FRAME]!) / r.torso.swing, -1, 1);
    const transient = swing - clamp(F[S_LEAN_EFF]!, -1, 1);
    return {
      lean,
      crouch,
      torsoPitch: clamp(-0.35 * transient - 0.15 * wa, -0.9, 0.9),
      armExtend: clamp(Math.max(0, -lean) + 0.5 * Math.max(0, wa - 0.6), 0, 1),
    };
  }

  /** Fraction of the ground lean travel in force this tick: 1 on the ground, `airShift` fully airborne (S_AIR). */
  private shiftScale(): number {
    return 1 - this.F[S_AIR]! * (1 - this.tuning.rider.airShift);
  }

  // rider body chain scratch (world): 0 hips, 1 shoulders, 2 head centre, 3 elbow, 4 hand (grip),
  // 5 knee, 6 foot (peg); (chDx, chDy) torso unit dir, (chHx, chHy) head unit dir (shoulders -> head)
  private readonly chX = new Float64Array(7);
  private readonly chY = new Float64Array(7);
  private chDx = 0;
  private chDy = 1;
  private chHx = 0;
  private chHy = 1;

  /** Frame-local (bike.pos-relative) axle midpoint at static sag: the render's frame origin (`BikeModel.originOffset`, calibrated from the same spawn pose). */
  private axleOrgX = 0;
  private axleOrgY = 0;
  private axleOrigin(): void {
    const t = this.tuning;
    const sr = t.suspension.rear;
    const sf = t.suspension.front;
    const cr = this.staticSag(sr, this.staticLoad(0));
    const cf = clamp((sr.axle.y - sf.axle.y + sr.axis.y * cr) / sf.axis.y, 0, sf.travel);
    this.axleOrgX = 0.5 * (sr.axle.x + sr.axis.x * cr + sf.axle.x + sf.axis.x * cf);
    this.axleOrgY = sr.axle.y + sr.axis.y * cr;
  }

  /**
   * The rider body as the renderer draws it (`src/render/rider/pose.ts` riderChain, ported above), in
   * the render's AXLE frame (origin = axle midpoint at static sag, `axleOrigin()`), so the last posed
   * frame and the first ragdoll frame coincide. Hips, torso and head from the parameter curves; the leg
   * slide (hips within thigh + shin of the ankles) and the reach slide (shoulders within arm's reach of
   * the grip, in 3D, never closer than 0.18 m) keep the feet on the pegs and the hands on the grips in
   * every pose; elbows and knees by the 3D two-bone IK with the reference poles, projected to the
   * plane (the left side; the right mirrors z). Crash sensors and the ragdoll spawn come from this
   * chain, not from the dynamics point mass. Points: 0 hips, 1 shoulders, 2 helmet centre, 3 elbow,
   * 4 hand (grip), 5 knee, 6 ankle; (chDx, chDy) hips -> shoulders, (chHx, chHy) shoulders -> head.
   */
  private riderChain(): void {
    const pose = this.riderPose();
    const lean = clamp(pose.lean, -1, 1);
    const back = Math.max(0, -lean);
    const fwd = Math.max(0, lean);
    const crouch = clamp(pose.crouch, 0, 1);
    const p = bodyParams(back, fwd, crouch, 0, pose.torsoPitch);
    let hx = p.hipX;
    let hy = p.hipY;
    const tdx = cos(p.torso);
    const tdy = sin(p.torso);
    let sx = hx + tdx * CH.torso;
    let sy = hy + tdy * CH.torso;
    {
      // leg slide
      const d = Math.sqrt((hx - ANKLE_X) * (hx - ANKLE_X) + (hy - ANKLE_Y) * (hy - ANKLE_Y));
      if (d > LEG_REACH) {
        const k = (d - LEG_REACH) / d;
        hx += (ANKLE_X - hx) * k;
        hy += (ANKLE_Y - hy) * k;
        sx = hx + tdx * CH.torso;
        sy = hy + tdy * CH.torso;
      }
    }
    {
      // reach slide: arm's reach measured in 3D (shoulder joint at z shoulderHalf, grip at z GRIP_Z)
      const dzs = GRIP_Z - CH.shoulderHalf;
      const reachXY = Math.sqrt(Math.max(0, ARM_REACH * ARM_REACH - dzs * dzs));
      const ddx = GRIP_X - sx;
      const ddy = GRIP_Y - sy;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d > reachXY || d < ARM_NEAR) {
        const k = (d - (d > reachXY ? reachXY : ARM_NEAR)) / (d || 1e-6);
        sx += ddx * k;
        sy += ddy * k;
        hx += ddx * k;
        hy += ddy * k;
      }
    }
    const hsx = cos(p.head);
    const hsy = sin(p.head);
    const hdx = sx + hsx * CH.neck;
    const hdy = sy + hsy * CH.neck;
    const [ex, ey] = ik3(sx, sy, CH.shoulderHalf, GRIP_X, GRIP_Y, GRIP_Z, CH.upperArm, CH.forearm, ELBOW_POLE.x, ELBOW_POLE.y, ELBOW_POLE.z);
    const [kx, ky] = ik3(hx, hy, CH.hipHalf, ANKLE_X, ANKLE_Y, PEG_Z, CH.thigh, CH.shin, KNEE_POLE.x, KNEE_POLE.y, KNEE_POLE.z);
    const c = cos(this.an[FRAME]!);
    const s = sin(this.an[FRAME]!);
    const fx = this.px[FRAME]!;
    const fy = this.py[FRAME]!;
    const ox = this.axleOrgX;
    const oy = this.axleOrgY;
    const put = (i: number, ax: number, ay: number): void => {
      const lx = ax + ox;
      const ly = ay + oy;
      this.chX[i] = fx + lx * c - ly * s;
      this.chY[i] = fy + lx * s + ly * c;
    };
    put(0, hx, hy);
    put(1, sx, sy);
    put(2, hdx, hdy);
    put(3, ex, ey);
    put(4, GRIP_X, GRIP_Y);
    put(5, kx, ky);
    put(6, ANKLE_X, ANKLE_Y);
    const tl = Math.sqrt((sx - hx) * (sx - hx) + (sy - hy) * (sy - hy)) || 1;
    const dxl = (sx - hx) / tl;
    const dyl = (sy - hy) / tl;
    this.chDx = dxl * c - dyl * s;
    this.chDy = dxl * s + dyl * c;
    this.chHx = hsx * c - hsy * s;
    this.chHy = hsx * s + hsy * c;
  }

  // -- step phases ----------------------------------------------------------

  /** Diagnostic only (debug().engine.driveFrac): the wheelie control's torque factor of the last controls() pass. */
  private driveFrac = 1;

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

    // brake slew (lever squeeze): a digital input still takes ~0.1 s to reach full clamp
    {
      const be = F[S_BRAKE_EFF]!;
      let nbe = be + clamp(input.brake - be, -t.brakes.fall * dt, t.brakes.rise * dt);
      if (Math.abs(nbe - input.brake) < 1e-9) nbe = input.brake;
      F[S_BRAKE_EFF] = nbe;
    }

    // airborne blend (round 10): toward 1 while both wheels are off the ground (the last derive()'s
    // air counters), back toward 0 as soon as one touches. Scales the lean's mass shift and the engine
    // braking below and in applyForces(); riderPose() reads it (state, S_AIR). It reads the LAST tick's
    // hop phase: through a hop's push and recover the blend holds - the forward snap there is the leg
    // extension throwing the body over the bars, not a torso swing, and the anchor retreating under a
    // mass already thrown forward at ground travel pitched the stationary hop 13 deg nose-down (rear
    // apex 0.68 -> 0.78 m). The preload (crouched, lean held back off a lip) is not exempt
    const r = t.rider;
    {
      const a0 = F[S_AIR]!;
      const hopping = U[U_HOP] === 2 || U[U_HOP] === 3;
      // both wheels off for airDelay ticks (a rear wheel skipping off a lip for a few ticks is not flight)
      // and nothing resting on a frame hard point (a bike hung on its plate over a log is not flying either)
      const flying = Math.min(F[S_REAR_AIR]!, F[S_FRONT_AIR]!) >= r.airDelay && U[U_FRAME_GND] === 0;
      const airTarget = !flying ? 0 : hopping ? a0 : 1;
      const step = airTarget > a0 ? dt / r.airRise : -dt / r.airFall;
      F[S_AIR] = clamp(a0 + step, Math.min(a0, airTarget), Math.max(a0, airTarget));
    }

    // hop state machine (technique, no button)
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

    // engine. The crank has inertia: while the clutch slips (wheel below the crank) it revs toward
    // the throttle's demand at a finite rate (S_RPM is the crank speed of the last tick: cross-tick
    // state, in F); once the wheel drives it faster the two are locked and the rpm is the wheel's
    const wheelFwd = -this.av[REAR]!;
    const rpmWheel = Math.max(0, wheelFwd) * e.gearRatio * RPM_PER_RADS;
    const rpmDemand = e.idleRpm + Math.min(1, nte / e.clutchThrottle) * (e.clutchRpm - e.idleRpm);
    const prev = F[S_RPM]!;
    let crank: number;
    if (rpmWheel >= e.clutchRpm) crank = rpmWheel; // locked: the wheel turns the crank (a spinning tyre that grips again drags the crank down with it)
    else crank = prev < rpmDemand ? Math.min(rpmDemand, prev + e.crankSpinUp * dt) : Math.max(rpmDemand, prev - e.crankSpinDown * dt);
    const rpm = Math.max(rpmWheel, crank);
    let limiter = U[U_LIMITER]!;
    if (rpm >= e.limiterRpm) limiter = 1;
    else if (limiter === 1 && rpm < e.limiterResetRpm) limiter = 0;
    U[U_LIMITER] = limiter;
    F[S_RPM] = rpm;
    const peakWheel = e.peakTorqueNm * e.gearRatio * e.efficiency;
    // centrifugal auto-clutch: what it can pass rises with crank speed from 0 at idle to clutchCap
    // at clutchRpm. A settled throttle is never capped (the curve there is clutchCap); a launch from
    // idle gets its thrust over the crank's spin-up, which is the soft clutch off the line
    const capFrac = clamp((rpm - e.idleRpm) / (e.clutchRpm - e.idleRpm), 0, 1);
    let torque = limiter === 1 ? 0 : nte * peakWheel * this.curveFrac(rpm);
    if (capFrac < 1) torque = Math.min(torque, capFrac * e.clutchCap * peakWheel);
    // pitch-aware drive (ECU-style wheelie control, round 8): with the front wheel up and the rider not
    // sitting back, taper the drive with the frame pitch relative to the ground the bike is on (the
    // steeper of the two wheels' last loaded ground slopes, S_REAR_SLOPE / S_FRONT_SLOPE) plus a rate
    // lead. Full torque to `pitchFull`, `minFrac` from `pitchMin` up. It reads the IMU, not the tyre: a
    // rear wheel skipping or airborne with the nose past the band is not spun up either (the wheel's
    // angular momentum is the in-air nose-up). A beginner holding the gas at neutral lean lifts the
    // front into a wheelie that self-limits; looping the bike takes a deliberate lean back.
    this.driveFrac = 1;
    if (torque > 0 && U[U_FRONT_GND] === 0 && e.wheelieControl.enabled) {
      const wc = e.wheelieControl;
      const gate = clamp((nle - wc.leanOff) / (wc.leanOn - wc.leanOff), 0, 1);
      if (gate > 0) {
        // the steeper of the two wheels' remembered ground slopes (round 11: both memories now relax at
        // 1.5 rad/s, not 0.7 - at a crest the lifted front's remembered uphill hid the wheelie for the
        // 0.5 s its memory took to relax, and that is where the b1 strangers looped; the 60 deg plank's
        // base corner, where the front hovers off the face for ~0.15 s with the rear still on the flat,
        // keeps 47 of its 60 deg through the hover)
        const ground = Math.max(F[S_REAR_SLOPE]!, F[S_FRONT_SLOPE]!);
        const rel = wrapAngle(this.an[FRAME]! - ground);
        // the rate lead fades in over the first `rateLeadFrom` degrees of nose-up: a frame rotating up
        // into a plank's base corner (nose still below the face angle) is not a wheelie
        const lead = wc.rateLead * this.av[FRAME]! * clamp(((rel * 180) / PI) / wc.rateLeadFrom, 0, 1);
        const relDeg = ((rel + lead) * 180) / PI;
        const w = 1 - clamp((relDeg - wc.pitchFull) / (wc.pitchMin - wc.pitchFull), 0, 1);
        // minFrac from pitchMin, then to nothing at pitchCut (round 11: past the balance point 30 % of
        // the drive was still nose-up, and a kicker landing at 52 deg walked over backwards on it)
        const frac = (wc.minFrac + (1 - wc.minFrac) * w) * (1 - clamp((relDeg - wc.pitchMin) / (wc.pitchCut - wc.pitchMin), 0, 1));
        this.driveFrac = 1 - gate * (1 - frac);
        // rear in the air for airDelay ticks (a skip at a lip is not flight; a hop is a technique): the
        // drive may spin it at most `airSpin` m/s past road speed (round 11: off a
        // kicker lip the rear spun to the limiter and its reaction rotated the bike +57 deg/s all the
        // way to the landing; a rider matches the wheel to the ground he is about to meet)
        if (F[S_REAR_AIR]! >= r.airDelay && U[U_HOP] !== 2 && U[U_HOP] !== 3) {
          const a = this.an[FRAME]!;
          const vG = this.vx[FRAME]! * cos(a) + this.vy[FRAME]! * sin(a);
          const over = wheelFwd * t.wheel.radius - vG;
          const spinFrac = clamp(1 - over / wc.airSpin, 0, 1);
          // only with the nose already past pitchFull: a blip on a nose-down flight is a technique
          // (F9: throttle +15 deg in 0.5 s at 8 m/s), full gas off a lip at 33 deg is the loop
          const nosed = clamp((relDeg - wc.pitchFull) / (wc.pitchMin - wc.pitchFull), 0, 1);
          this.driveFrac *= 1 - gate * nosed * (1 - spinFrac);
        }
        torque *= this.driveFrac;
      }
    }
    // engine braking: drag on the rear wheel proportional to rpm when off throttle; airborne the rider
    // pulls the clutch (engineBrakeAir 0: the free-wheeling rear bleeds no spin into the frame)
    // (the clutch pull is quicker than the body: after the same airDelay it fades over 3 ticks straight
    // off the counters and is back the tick a wheel touches; a faster fade - from air tick 3 - moved the
    // 60 deg base-corner transition and bounced a constant lean over the 0.3 m log at 5 m/s)
    const ebAir = U[U_FRAME_GND] === 1 ? 1 : 1 - clamp((Math.min(F[S_REAR_AIR]!, F[S_FRONT_AIR]!) - r.airDelay) / 3, 0, 1) * (1 - e.engineBrakeAir);
    torque -= ebAir * e.engineBrakeFrac * peakWheel * (1 - nte) * clamp(rpmWheel / e.limiterRpm, 0, 1.2) * (wheelFwd > 0 ? 1 : wheelFwd < 0 ? -1 : 0);
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
    const g = this.g;
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
    let legUpFx = 0;
    let legUpFy = 0;
    let rax = 0;
    let ray = 0;
    if (riding) {
      const r = t.rider;
      const lean = F[S_LEAN_EFF]!;
      // airborne the lean is the torso swing: the mass shift (and its drop) scales down to airShift
      const shift = this.shiftScale();
      const leanOff = (lean > 0 ? lean * r.leanFwd : lean * r.leanBack) * shift;
      const alx = r.anchor.x + leanOff;
      const cr = F[S_CROUCH]!;
      const eased = cr * cr * (3 - 2 * cr);
      const aly = r.anchor.y - eased * r.crouch + F[S_HOP_EXT]! * r.hopExtend - (lean > 0 ? lean * r.leanCrouchFwd : -lean * r.leanCrouch) * shift;
      const axw = fx + alx * c - aly * s;
      const ayw = fy + alx * s + aly * c;
      F[S_ANCHOR_X] = axw;
      F[S_ANCHOR_Y] = ayw;
      // legs-straight stop: fixed leg length above the pegs (neutral height + hop extension); the
      // crouch and the lean crouch lower the target, not the limit, so a crouch cannot yank the bike
      const sly = r.anchor.y + F[S_HOP_EXT]! * r.hopExtend;
      const lsx = fx + alx * c - sly * s;
      const lsy = fy + alx * s + sly * c;
      F[S_LEG_STOP_X] = lsx;
      F[S_LEG_STOP_Y] = lsy;
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
      // legs go slack (preloadSlack) so the rider drops into the crouch. In free fall the rider floats
      // m*g/k above the anchor with no force on the frame.
      const preload = this.U[U_HOP] === 1;
      const kUp = ext < 0 ? k + kl : k;
      // landing loads are absorbed, not stored: the legs' damping stiffens with compression like their spring
      const cUp = hop ? r.c * 0.1 : ext < 0 ? r.c + r.cLanding * dist : r.c;
      const fWeight = r.mass * g;
      let fUp = -kUp * ext - cUp * extRate + fWeight;
      // preload crouch: the legs go slack so the rider drops toward the lowered anchor at ~g and the
      // bike unloads (suspension extends); the stiff catch below the anchor then loads it up
      if (preload && ext > 0) fUp = fWeight * (1 - r.preloadSlack) - cUp * 0.1 * extRate;
      // feet on pegs: the legs cannot pull the bike up; only the arms can, by `armPull` at most (the
      // hop's yank goes through the legs-straight stop instead). Without this a lean-back crouch
      // dropping the anchor at 1.2 m/s lifted the bike by ~1.2 kN through the leg damper.
      if (!hop && fUp < -r.armPull) fUp = -r.armPull;
      // the leg actuator pushes until the legs are straight (rider at the leg stop), not merely to the anchor
      const extStop = (px[RIDER]! - lsx) * upx + (py[RIDER]! - lsy) * upy;
      if (hop && extStop < 0) fUp += r.hopForce;
      const maxUp = hop ? r.hopMaxForce : r.ejectForce * 1.5;
      fUp = clamp(fUp, -maxUp, maxUp);
      // fore-aft brace, capped at what arms and legs can push: a weight shift is the rider moving
      // himself, not a 20 kN/m spring yanking 75 kg through 0.6 m in 0.17 s (which lifted the rear)
      let fAlong = -r.kAlong * along - r.cAlong * alongRate;
      fAlong = clamp(fAlong, -r.shiftForce, r.shiftForce);
      const Fx = fAlong * c + fUp * upx;
      const Fy = fAlong * s + fUp * upy;
      const mag = Math.sqrt(Fx * Fx + Fy * Fy);
      F[S_TETHER_F] = mag;
      F[S_TETHER_OVER] = mag >= r.ejectForce && !hop ? F[S_TETHER_OVER]! + 1 : 0;
      // the fore-aft brace reacts on the frame at the anchor: for a point-mass rider the reaction must
      // be collinear with the rider's inertia force or it injects a couple (tried at the pegs: the bike
      // then pitched nose-down under every acceleration and the wheelie balance point moved)
      riderFx = fAlong * c;
      riderFy = fAlong * s;
      this.braceX = axw;
      this.braceY = ayw;
      // while the legs push (hop push/recover) they act on the pegs too, not on the rider COM anchor
      const legsOnPegs = this.U[U_HOP] === 2 || this.U[U_HOP] === 3;
      if (legsOnPegs) {
        const plx = r.hopPegX;
        this.legX = fx + plx * c - aly * s;
        this.legY = fy + plx * s + aly * c;
        legUpFx = fUp * upx;
        legUpFy = fUp * upy;
      } else {
        this.legX = axw;
        this.legY = ayw;
        legUpFx = fUp * upx;
        legUpFy = fUp * upy;
      }
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
      // (the leg part at the pegs while hopping)
      vx[RIDER] = vx[RIDER]! + (riderFx + legUpFx) * dt * im[RIDER]!;
      vy[RIDER] = vy[RIDER]! + (riderFy + legUpFy) * dt * im[RIDER]!;
      vx[FRAME] = vx[FRAME]! - (riderFx + legUpFx) * dt * im[FRAME]!;
      vy[FRAME] = vy[FRAME]! - (riderFy + legUpFy) * dt * im[FRAME]!;
      {
        const bx = this.braceX - fx;
        const by = this.braceY - fy;
        av[FRAME] = av[FRAME]! - ii[FRAME]! * (bx * riderFy - by * riderFx) * dt;
        const lx = this.legX - fx;
        const ly = this.legY - fy;
        av[FRAME] = av[FRAME]! - ii[FRAME]! * (lx * legUpFy - ly * legUpFx) * dt;
      }

      // aero drag as a uniform deceleration field on frame, wheels and rider (each body its mass
      // share of -dragCoef*v|v| at the frame's velocity): it acts through the combined COM, so it has
      // no pitch moment and puts no load on the rider tether. Round 8 put all of it on the frame at
      // 4.2 kg/m: 1.7 kN at 20 m/s decelerating the 56 kg frame under a 75 kg rider who was not
      // dragged, and the brace reacting at the anchor above the frame COM pitched the airborne bike
      // nose-down at ~100 deg/s
      const sp = Math.sqrt(vx[FRAME]! * vx[FRAME]! + vy[FRAME]! * vy[FRAME]!);
      const dcoef = (t.aero.dragCoef * sp * dt) / (t.frame.mass + 2 * t.wheel.mass + t.rider.mass);
      const ddx = dcoef * vx[FRAME]!;
      const ddy = dcoef * vy[FRAME]!;
      for (let b = 0; b <= RIDER; b++) {
        vx[b] = vx[b]! - ddx;
        vy[b] = vy[b]! - ddy;
      }
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
      // rider sensors: head + two torso circles on the drawn body (same pose the renderer builds
      // from lean/crouch/torsoPitch/armExtend, so what you see hit is what crashes)
      this.riderChain();
      const r = t.rider;
      this.querySensor(this.chX[2]!, this.chY[2]!, r.headRadius);
      this.querySensor(this.chX[0]! + this.chDx * 0.38, this.chY[0]! + this.chDy * 0.38, r.torsoRadius);
      this.querySensor(this.chX[0]! + this.chDx * 0.14, this.chY[0]! + this.chDy * 0.14, r.torsoRadius);
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
      this.collideRagdollVsBike(spec);
    }
  }

  /** Scratch primitive for ragdoll-vs-bike circle tests (the bike bodies are not in the static grid). */
  private readonly bikePrim: Prim = {
    kind: PrimKind.Circle,
    colliderId: -1,
    surface: 2, // metal
    oneWay: false,
    body: FRAME,
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

  /**
   * Ragdoll limbs collide with the bike (tyres and frame hard points) so the rider does not fall
   * through the machine in a crash clip. Fixed order: limb, then wheel/frame circle.
   */
  private collideRagdollVsBike(spec: number): void {
    const t = this.tuning;
    const dt = this.dt;
    const c = cos(this.an[FRAME]!);
    const s = sin(this.an[FRAME]!);
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
        // wheels
        for (let w = 0; w < 2; w++) {
          const wb = w === 0 ? REAR : FRONT;
          prim.body = wb;
          prim.surface = 4; // rubber
          prim.cx = this.px[wb]!;
          prim.cy = this.py[wb]!;
          prim.r = t.wheel.radius;
          if (circleVsPrim(cx, cy, limb.r, prim, 0, m) && m.sep < margin) this.emitBodyContact(b, cx, cy, limb.r, m);
        }
        // frame hard points
        prim.body = FRAME;
        prim.surface = 2;
        for (const fc of t.frame.circles) {
          prim.cx = this.px[FRAME]! + fc.x * c - fc.y * s;
          prim.cy = this.py[FRAME]! + fc.x * s + fc.y * c;
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

  private queryBodyCircle(body: number, cx: number, cy: number, r: number, margin: number, wheel: number, rag: boolean): void {
    this.qBody = body;
    this.qCx = cx;
    this.qCy = cy;
    this.qR = r;
    this.qWheel = wheel;
    this.qSensor = false;
    this.qRag = rag;
    // wheels decide a one-way board's side by the frame origin (a straddled board lifts the wheel, round 11)
    if (wheel === 1) this.col!.queryCircle(cx, cy, r, margin, this.bodyAngle, this.onManifold, this.px[FRAME]!, this.py[FRAME]!);
    else this.col!.queryCircle(cx, cy, r, margin, this.bodyAngle, this.onManifold);
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
    if (m.prim.kind === PrimKind.Segment) {
      const flip = m.prim.nx * nx + m.prim.ny * ny < 0 ? -1 : 1;
      this.cGx[i] = flip * m.prim.nx;
      this.cGy[i] = flip * m.prim.ny;
    } else {
      this.cGx[i] = nx;
      this.cGy[i] = ny;
    }
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
    // a wheel through a one-way board is lifted onto it at no more than STRADDLE_LIFT (the Baumgarte
    // bias on a penetration of up to 2 R would be 10 m/s: a launch, not a landing)
    if (m.straddle) vnMin = Math.min(vnMin, STRADDLE_LIFT);
    this.cVnMin[i] = vnMin;
    if (this.qWheel === 1) {
      // slip ratio from the previous tick's RESOLVED slip: the pre-solve contact velocity already
      // carries this tick's unconstrained engine spin-up of the light wheel (~2 m/s per tick at full
      // torque), which judged every driven tyre as sliding and cost 10 % of grip under throttle
      const slip = A === REAR ? this.F[S_REAR_SLIP]! : this.F[S_FRONT_SLIP]!;
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
      this.cMu[i] = this.qRag ? t.ragdoll.mu : t.frame.mu;
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
    this.torsoLambda = 0;
    if (riding) {
      // torso motor: the rate that brings the swing to its lean target with the deceleration the
      // torque cap allows (bang-bang optimal), so the torso never overshoots and frame rotation
      // under it is absorbed, not stored and returned
      const ts = t.rider.torso;
      const err = this.F[S_LEAN_EFF]! * ts.swing - (this.an[RIDER]! - this.an[FRAME]!);
      const acc = (0.8 * ts.maxTorque) / ts.inertia;
      const mag = Math.min(ts.maxRate, Math.sqrt(2 * acc * Math.abs(err)), Math.abs(err) / dt);
      this.torsoRate = err < 0 ? -mag : mag;
      const ax0 = this.F[S_ANCHOR_X]!;
      const ay0 = this.F[S_ANCHOR_Y]!;
      const dx = this.px[RIDER]! - ax0;
      const dy = this.py[RIDER]! - ay0;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const max = t.rider.tetherMax;
      if (dist > max - 0.05 && dist > 1e-9) {
        this.tetherActive = true;
        this.tetherNx = dx / dist;
        this.tetherNy = dy / dist;
        this.tetherSep = max - dist;
      }
      // legs straight: the rider cannot rise more than legSlack above the leg-stop point along frame-up
      const c0 = cos(this.an[FRAME]!);
      const s0 = sin(this.an[FRAME]!);
      const ext = -(this.px[RIDER]! - this.F[S_LEG_STOP_X]!) * s0 + (this.py[RIDER]! - this.F[S_LEG_STOP_Y]!) * c0;
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
          let vnMin = room > 0 ? -room / dt : (bj * -room) / dt;
          // bottom-out buck: a bump stop hit hard returns part of the closing rate as extension
          // (sRate is this tick's pre-impulse compression rate, > 0 closing)
          const closing = this.sRate[w]!;
          // (the speculative limit would otherwise stop the wheel dead over the approach tick)
          if (closing > st.stopBounceRate && room - closing * dt < 0.002) vnMin = Math.max(vnMin, st.stopRestitution * closing);
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
        const rax = this.F[S_ANCHOR_X]! - fx;
        const ray = this.F[S_ANCHOR_Y]! - fy;
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
        const rax = this.legX - fx;
        const ray = this.legY - fy;
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

      // --- torso motor (torque-limited velocity constraint between the rider's angular DOF and the frame)
      if (riding) {
        const maxJ = t.rider.torso.maxTorque * dt;
        const rel = av[RIDER]! - av[FRAME]!;
        const mass = 1 / (ii[RIDER]! + ii[FRAME]!);
        let lambda = -mass * (rel - this.torsoRate);
        const old = this.torsoLambda;
        const acc = clamp(old + lambda, -maxJ, maxJ);
        lambda = acc - old;
        this.torsoLambda = acc;
        av[RIDER] = av[RIDER]! + lambda * ii[RIDER]!;
        av[FRAME] = av[FRAME]! - lambda * ii[FRAME]!;
      }

      // --- ragdoll joints
      if (rag) this.solveRagdollJoints(it === 0);

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

      // --- brakes: lock wheel spin to the frame, torque-limited. A crashed bike keeps its rear wheel
      // locked (stalled engine in gear) and half a front brake (lever pinned), so it scrubs to a stop
      // on its tyres instead of free-wheeling away from the rider
      const brakeIn = riding ? this.F[S_BRAKE_EFF]! : 1;
      if (brakeIn > 0) {
        for (let w = 0; w < 2; w++) {
          const wb = wheelB[w]!;
          let maxNm = w === 0 ? t.brakes.rearMaxNm : t.brakes.frontMaxNm;
          if (!riding) maxNm *= w === 0 ? t.ragdoll.crashRearBrake : t.ragdoll.crashFrontBrake;
          // a wheel off the ground (last derive) is dragged, not locked (round 11, brakes.airNm): the
          // lock's whole dump takes 0.06 s, so the cap cannot wait for the airborne blend
          else if ((w === 0 ? this.U[U_REAR_GND] : this.U[U_FRONT_GND]) === 0) maxNm = Math.min(maxNm, t.brakes.airNm);
          if (riding && w === 1 && t.brakes.antiEndo > 0) {
            // the rider modulates the front: feed-forward cap at the torque that keeps `rearLoadMin`
            // of the weight on the rear for the COM geometry of the current lean (load transfer
            // a*h/L against the static split), plus a feedback fade if the rear still unloads
            const W = (t.frame.mass + 2 * t.wheel.mass + t.rider.mass) * this.g;
            const rearN = this.F[S_REAR_LN]! / dt;
            const { d, h } = this.comDH(this.F[S_LEAN_EFF]!);
            const L = t.wheel.wheelbase;
            const nrMin = t.brakes.rearLoadMin * W;
            const fRear = t.tyre.muPeak * nrMin;
            const fFront = (W * (L - d) - nrMin * L) / Math.max(h, 0.2) - fRear;
            maxNm = Math.min(maxNm, Math.max(0, fFront) * t.wheel.radius);
            maxNm *= clamp(rearN / (t.brakes.antiEndo * W), t.brakes.antiEndoFloor, 1);
          }
          const maxJ = brakeIn * maxNm * dt;
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
      // joint damping: a torque -c * relW between the two limbs (implicit: impulse = c*dt*relW / (1 + c*dt*(iiP+iiC)))
      const massA = 1 / (ii[P]! + ii[C]!);
      if (damp) {
        const cd = this.tuning.ragdoll.jointDamping * dt;
        const relW0 = av[C]! - av[P]!;
        const lambda = (-cd * relW0) / (1 + cd / massA);
        av[C] = av[C]! + lambda * ii[C]!;
        av[P] = av[P]! - lambda * ii[P]!;
      }
      // angular limit around the rest relative angle
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
    let rearSlope = F[S_REAR_SLOPE]!;
    let rearSlopeSet = false;
    let frontSlope = F[S_FRONT_SLOPE]!;
    let frontSlopeSet = false;
    let frameGnd = 0;
    const maxSlope = (t.engine.wheelieControl.maxSlopeDeg * PI) / 180;
    for (let i = 0; i < this.nC; i++) {
      const A = this.cA[i]!;
      const ln = this.cLn[i]!;
      if (A === FRAME) {
        if (ln > 0) frameGnd = 1;
      } else if (A === REAR) {
        rearLn += ln;
        rearLt += this.cLt[i]!;
        if (ln > rearBest) {
          rearBest = ln;
          rearSurf = this.cSurf[i]!;
          rearMu = this.cMu[i]!;
        }
        if (ln > 0) {
          // the steepest surface the wheel is pushing on: the ground the bike is on, for the wheelie
          // control (in a plank's base corner the front is on the face while the rear is still on the
          // flat, and the frame sits at the face angle - no wheelie, and the push into the corner
          // must not be starved). Round 11: a face steeper than maxSlopeDeg (a kicker lip's drop, a
          // wall the tyre brushed) is not ground - it read a 4 x 0.8 kicker's lip as a 90 deg climb
          // and the control fed full gas into the flight
          const sl = atan2(-this.cGx[i]!, this.cGy[i]!);
          if (Math.abs(sl) <= maxSlope && (!rearSlopeSet || sl > rearSlope)) {
            rearSlope = sl;
            rearSlopeSet = true;
          }
        }
      } else if (A === FRONT) {
        frontLn += ln;
        frontLt += this.cLt[i]!;
        if (ln > frontBest) {
          frontBest = ln;
          frontSurf = this.cSurf[i]!;
        }
        if (ln > 0) {
          const sl = atan2(-this.cGx[i]!, this.cGy[i]!);
          if (!frontSlopeSet || sl > frontSlope) frontSlope = sl;
          frontSlopeSet = true;
        }
      }
    }
    F[S_REAR_LN] = rearLn;
    F[S_FRONT_LN] = frontLn;
    F[S_REAR_LT] = rearLt;
    F[S_FRONT_LT] = frontLt;
    F[S_REAR_MU] = rearMu;
    // an unloaded rear's remembered ground relaxes toward level (round 11: it held a ramp's slope, or a
    // crest's uphill, through the whole flight and the control never saw the wheelie)
    if (!rearSlopeSet && F[S_REAR_AIR]! >= t.rider.airDelay) rearSlope -= clamp(rearSlope, -t.engine.wheelieControl.airRelax * dt, t.engine.wheelieControl.airRelax * dt);
    F[S_REAR_SLOPE] = rearSlope;
    // a lifted front wheel's ground fades toward the rear's (a wheelie that started off a ramp is soon a
    // wheelie on whatever the rear is rolling on); slow enough that the ~0.15 s the front hovers off a
    // plank face in the base corner keeps the face as the reference
    if (!frontSlopeSet) frontSlope += clamp(rearSlope - frontSlope, -t.engine.wheelieControl.groundRelax * dt, t.engine.wheelieControl.groundRelax * dt);
    F[S_FRONT_SLOPE] = frontSlope;
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
    U[U_FRAME_GND] = frameGnd;
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
        const dx = this.px[RIDER]! - F[S_ANCHOR_X]!;
        const dy = this.py[RIDER]! - F[S_ANCHOR_Y]!;
        if (dx * dx + dy * dy > t.rider.tetherMax * t.rider.tetherMax * 1.69) {
          fault = 1;
          cause = 2;
        } else if (F[S_TETHER_OVER]! >= 2 && wrapAngle(this.an[FRAME]!) < -QUARTER_PI) {
          // round 9: the force rule is an over-the-bars qualifier, not a crash of its own - it fired on
          // ordinary lip hits and plank feet (a stranger's level 4x0.8 kicker at 11.6 m/s). A crash is
          // the head or torso touching something (rule 1) or the rider leaving the bike (tetherDist);
          // a violent front impact only counts once the bike is past 45 deg nose-down
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

  /**
   * The ragdoll spawns ON the drawn rider (7.7): every body's centre and axis is a segment of the
   * chain the renderer poses (hips -> shoulders -> head, shoulder -> elbow -> grip, hip -> knee ->
   * peg), so the crash tick shows the same figure as the tick before (no pop; `world.test.ts`
   * RAGDOLL continuity: < 1 cm / 1 deg against the chain of the previous tick). Velocities are the
   * frame's rigid field at each body plus the rider mass's motion relative to the frame; the rng
   * spread is on the limbs' spin only, so the figure carries the bike's speed without jitter.
   */
  private spawnRagdoll(): void {
    const t = this.tuning;
    const U = this.U;
    this.riderChain();
    const X = this.chX;
    const Y = this.chY;
    const fw = this.av[FRAME]!;
    const fpx = this.px[FRAME]!;
    const fpy = this.py[FRAME]!;
    const relx = this.vx[RIDER]! - this.vx[FRAME]!;
    const rely = this.vy[RIDER]! - this.vy[FRAME]!;
    const spread = t.ragdoll.spread;
    // body i centred at (cx, cy) with local +y (distal -> proximal) along the unit vector (uy_x, uy_y)
    const place = (i: number, cx: number, cy: number, uyx: number, uyy: number): void => {
      const b = RAG0 + i;
      const limb = RAG_LIMBS[i]!;
      this.px[b] = cx;
      this.py[b] = cy;
      // local +y = (-sin a, cos a)
      this.an[b] = atan2(-uyx, uyy);
      const ox = cx - fpx;
      const oy = cy - fpy;
      this.vx[b] = this.vx[FRAME]! - fw * oy + relx;
      this.vy[b] = this.vy[FRAME]! + fw * ox + rely;
      this.av[b] = fw + (this.rng.next() * 2 - 1) * spread;
      this.im[b] = 1 / limb.mass;
      const I = limb.len === 0 ? 0.4 * limb.mass * limb.r * limb.r : (limb.mass * limb.len * limb.len) / 12 + 0.5 * limb.mass * limb.r * limb.r;
      this.ii[b] = 1 / I;
    };
    // a segment from the distal joint (ax, ay) to the proximal joint (bx, by): centre at the midpoint
    const seg = (i: number, ax: number, ay: number, bx: number, by: number): void => {
      let dx = bx - ax;
      let dy = by - ay;
      const l = Math.sqrt(dx * dx + dy * dy);
      if (l > 1e-9) {
        dx /= l;
        dy /= l;
      } else {
        dx = this.chDx;
        dy = this.chDy;
      }
      place(i, 0.5 * (ax + bx), 0.5 * (ay + by), dx, dy);
    };
    const ux = this.chDx;
    const uy = this.chDy;
    // torso: hips -> shoulders; pelvis: 0.2 below the hips along the torso, centre 0.1 below the hips
    seg(1, X[0]!, Y[0]!, X[1]!, Y[1]!);
    place(2, X[0]! - ux * 0.1, Y[0]! - uy * 0.1, ux, uy);
    // head: centre on the chain, axis along the shoulders -> head direction
    place(0, X[2]!, Y[2]!, this.chHx, this.chHy);
    // arm: upper arm elbow -> shoulder, forearm grip -> elbow
    seg(3, X[3]!, Y[3]!, X[1]!, Y[1]!);
    seg(4, X[4]!, Y[4]!, X[3]!, Y[3]!);
    // leg: thigh knee -> hip, shin foot -> knee
    seg(5, X[5]!, Y[5]!, X[0]!, Y[0]!);
    seg(6, X[6]!, Y[6]!, X[5]!, Y[5]!);
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
