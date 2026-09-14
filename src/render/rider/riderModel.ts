/**
 * Rider (round 6 hero rebuild): a 1.78 m, 7.5-head segmented body in trials
 * gear — yellow jersey with sleeves, collar, cuffs and number patches, dark
 * blue pants with knee braces, black boots with buckles, black gloves closed
 * around the grips, blue helmet with peak, goggles and a mirrored visor, neck
 * brace and back hump. Every segment is one merged mesh per material whose +y
 * runs joint→joint; neighbouring segments overlap at the joints (caps, cuffs,
 * knee/elbow spheres) so there are no capsule seams.
 *
 * Always standing on the pegs (Trials riders never sit). Posed from
 * `RiderPose` with two-bone IK: hands are pinned to the grip centres in every
 * pose (the forearm segment always ends on the grip; if the shoulder is out
 * of reach the whole upper body slides toward the bars), feet on the pegs.
 * While `state.ragdoll` is non-null the same parts are drawn at the physics
 * bodies; the first two ragdoll frames blend from the last posed frame so the
 * hand-over never pops.
 */
import * as THREE from 'three';
import type { RagdollBody } from '../../core/types';
import type { MaterialLibrary } from '../materials/library';
import type { RenderFrame } from '../frame';
import { BIKE, type HeroBike } from '../bike/bikeModel';
import { DEFAULT_OPTS, SEG, makeChain, riderChain, type Chain as PoseChain, type ChainOpts } from './pose';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, tex } from '../world/canvasTex';
import { mergeStaticChildren } from '../util/merge';

/** Segment lengths (m), 7.5 heads at 1.78 m. */
/** Segment lengths = the pose owner's `SEG` (assets/blender/RIDER_CHAIN.md), so the kit is built at the chain's proportions. */
const L = {
  torso: SEG.torso, // hips → shoulder line
  headUp: SEG.neck, // shoulder line → helmet centre
  headR: 0.13, // helmet shell radius
  upperArm: SEG.upperArm,
  forearm: SEG.forearm, // elbow → grip centre (hand included)
  thigh: SEG.thigh,
  shin: SEG.shin, // knee → ankle
  ankle: SEG.ankleUp, // ankle above the peg
  hipHalf: SEG.hipHalf,
  shoulderHalf: SEG.shoulderHalf,
  pelvis: 0.2,
};

const UP = new THREE.Vector3(0, 1, 0);
const TMP = new THREE.Vector3();

/** A limb segment: a group whose local +y runs from joint a to joint b, scaled to the actual length. */
class Segment {
  readonly group = new THREE.Group();
  /** Actual / nominal length after the last place() (1 = no stretch). */
  stretch = 1;
  constructor(readonly len: number) {}
  place(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    const g = this.group;
    g.position.set(ax, ay, az);
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz) || 0.001;
    this.stretch = len / this.len;
    g.scale.set(1, this.stretch, 1);
    g.quaternion.setFromUnitVectors(UP, TMP.set(dx, dy, dz).normalize());
  }
}

// ---------------------------------------------------------------------------
// The drawn chain (shared by the procedural kit and the glTF rig, round 8)
// ---------------------------------------------------------------------------

/** Joint positions of the drawn rider chain in axle (frame-local) coordinates, metres. Index 0 = rider's left (+z, camera side). */
export interface Chain {
  hips: THREE.Vector3;
  pelvisBottom: THREE.Vector3;
  shoulders: THREE.Vector3;
  head: THREE.Vector3;
  /** Head group rotation about z (frame-local). */
  headAngle: number;
  /** Torso lean from +y toward +x (rad). */
  torsoAngle: number;
  shoulder: THREE.Vector3[];
  elbow: THREE.Vector3[];
  hand: THREE.Vector3[];
  hip: THREE.Vector3[];
  knee: THREE.Vector3[];
  ankle: THREE.Vector3[];
}

export interface ChainInput {
  lean: number;
  torsoPitch: number;
  armExtend: number;
  crouch: number;
}

export function newChain(): Chain {
  const pair = (): THREE.Vector3[] => [new THREE.Vector3(), new THREE.Vector3()];
  return { hips: new THREE.Vector3(), pelvisBottom: new THREE.Vector3(), shoulders: new THREE.Vector3(), head: new THREE.Vector3(), headAngle: 0, torsoAngle: 0, shoulder: pair(), elbow: pair(), hand: pair(), hip: pair(), knee: pair(), ankle: pair() };
}

const POSE_OUT: PoseChain = makeChain();
// Physics round 10 (d98236a): `crouch` is the hop preload alone and `torsoPitch` the transient
// only, so the chain's coupling removal is off (it would double-strip).
const POSE_OPTS: ChainOpts = { ...DEFAULT_OPTS, grips: { x: BIKE.grip.x, y: BIKE.grip.y, z: BIKE.gripZ }, pegs: { x: BIKE.pegs.x, y: BIKE.pegs.y, z: BIKE.pegHalfWidth }, seatTop: { x: BIKE.seatTop.x, y: BIKE.seatTop.y }, crouchIsHopOnly: true, torsoPitchLeanBias: 0 };

/**
 * The one chain both the procedural kit and the glTF rig pose from. Round 8: the body is the
 * pose owner's `riderChain` (rider/pose.ts — canonical poses from assets/blender/RIDER_CHAIN.md,
 * curves measured from the reference, and the physics lean→crouch coupling removed), converted
 * to the render's joint set: torsoAngle here is measured from +y toward +x, `headAngle` is the
 * head group's rotation about z. `crouchExtra` (0..1) is the render-driven landing compression.
 */
export function solveChain(r: ChainInput, c: Chain, crouchExtra = 0): Chain {
  POSE_OPTS.crouchExtra = crouchExtra;
  const p = riderChain({ lean: r.lean, crouch: r.crouch, torsoPitch: r.torsoPitch, armExtend: r.armExtend }, POSE_OPTS, POSE_OUT);
  c.hips.set(p.hips.x, p.hips.y, p.hips.z);
  c.shoulders.set(p.shoulders.x, p.shoulders.y, p.shoulders.z);
  c.head.set(p.head.x, p.head.y, p.head.z);
  c.torsoAngle = Math.PI / 2 - p.torsoAngle;
  c.headAngle = -(Math.PI / 2 - p.headAngle);
  const tx = Math.sin(c.torsoAngle);
  const ty = Math.cos(c.torsoAngle);
  c.pelvisBottom.set(p.hips.x - tx * L.pelvis * 0.9, p.hips.y - ty * L.pelvis * 0.9, 0);
  for (let i = 0; i < 2; i++) {
    const S = p.shoulder[i]!;
    const E = p.elbow[i]!;
    const H = p.hand[i]!;
    const HP = p.hipSide[i]!;
    const K = p.knee[i]!;
    const A = p.ankle[i]!;
    c.shoulder[i]!.set(S.x, S.y, S.z);
    c.elbow[i]!.set(E.x, E.y, E.z);
    c.hand[i]!.set(H.x, H.y, H.z);
    c.hip[i]!.set(HP.x, HP.y, HP.z);
    c.knee[i]!.set(K.x, K.y, K.z);
    c.ankle[i]!.set(A.x, A.y, A.z);
  }
  return c;
}

function rbox(w: number, h: number, d: number, r = 0.01, seg = 2): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2));
}

function lathe(profile: [number, number][], segments = 14): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

interface Kit {
  torso: Segment;
  pelvis: Segment;
  head: THREE.Group;
  upperArm: Segment[];
  forearm: Segment[];
  thigh: Segment[];
  shin: Segment[];
  /** Fist closed around the grip; +y = forearm direction, z = bar axis. */
  hand: THREE.Group[];
  /** Boot foot, level with the frame, heel at the ankle. */
  foot: THREE.Group[];
}

/** Joint positions of the last posed frame (world space), for the ragdoll hand-over blend. */
interface PosedJoints {
  hips: THREE.Vector3;
  pelvisBottom: THREE.Vector3;
  shoulders: THREE.Vector3;
  head: THREE.Vector3;
  headAngle: number;
  elbow: THREE.Vector3[];
  wrist: THREE.Vector3[];
  knee: THREE.Vector3[];
  ankle: THREE.Vector3[];
}

export class RiderModel {
  readonly root = new THREE.Group();
  /** Posed rider, in the bike frame's local space. */
  readonly seated = new THREE.Group();
  /** Ragdoll bodies in world space. */
  readonly ragdoll = new THREE.Group();
  /** Approximate triangle count of one kit, for the hero budget. */
  readonly triangles: number;
  /** Per-frame debug: segment stretch (1 = hands/feet exactly on target) and ragdoll hand-over residual. */
  readonly debug = { armStretch: [1, 1], legStretch: [1, 1], handOnGrip: [true, true], ragdollResidual: -1, ragdollBlend: 0, ragdollDetail: [] as string[] };
  private readonly kit: Kit;
  private readonly rag: Kit;
  private readonly chain = newChain();
  private landT = -1;
  private landAmp = 0;
  private bike: HeroBike | null = null;
  private readonly posed: PosedJoints = {
    hips: new THREE.Vector3(),
    pelvisBottom: new THREE.Vector3(),
    shoulders: new THREE.Vector3(),
    head: new THREE.Vector3(),
    headAngle: 0,
    elbow: [new THREE.Vector3(), new THREE.Vector3()],
    wrist: [new THREE.Vector3(), new THREE.Vector3()],
    knee: [new THREE.Vector3(), new THREE.Vector3()],
    ankle: [new THREE.Vector3(), new THREE.Vector3()],
  };
  private wasRagdoll = false;
  private posedWorld = false;
  private ragFrames = 0;
  private blendFrames = 2;
  private readonly ta = new THREE.Vector3();
  private readonly tb = new THREE.Vector3();
  /**
   * Pose LEAD (round 4). Physics' RiderPose already lags input by ≈0.28 s (t90), slower than
   * the reference's 100–150 ms, so the render side predicts ≈80 ms ahead from the pose
   * velocity (velocity smoothed with a 40 ms half-life) with a slight overshoot.
   */
  private readonly lead = { lean: 0, leanV: 0, torso: 0, torsoV: 0, arm: 0, armV: 0, crouch: 0, crouchV: 0 };

  private spring(key: 'lean' | 'torso' | 'arm' | 'crouch', target: number, dt: number, snap: boolean): number {
    const l = this.lead as unknown as Record<string, number>;
    if (snap || dt <= 0) {
      l[key] = target;
      l[key + 'V'] = 0;
      return target;
    }
    const vRaw = (target - l[key]!) / dt;
    const k = 1 - Math.pow(0.5, dt / 0.04);
    const v = l[key + 'V']! + (vRaw - l[key + 'V']!) * k;
    l[key] = target;
    l[key + 'V'] = v;
    const out = target + v * 0.08 * 1.15; // 80 ms lead, 15 % overshoot
    return Math.max(-1.5, Math.min(1.5, out));
  }

  constructor(private readonly lib: MaterialLibrary) {
    this.kit = this.buildKit(this.seated, false);
    this.rag = this.buildKit(this.ragdoll, true);
    this.ragdoll.visible = false;
    this.root.add(this.ragdoll);
    let tris = 0;
    this.seated.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const g = m.geometry;
      tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    });
    this.triangles = Math.round(tris);
  }

  private numberTex: THREE.CanvasTexture | null = null;
  private numberMaterial: THREE.MeshStandardMaterial | null = null;
  /** Jersey number patch: white "27" on the jersey colour with a dark hem (one material per rider). */
  private numberMat(): THREE.MeshStandardMaterial {
    if (this.numberMaterial) return this.numberMaterial;
    if (!this.numberTex) {
      const [c, g] = canvas(128, 128);
      g.fillStyle = '#f5c518';
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#ffffff';
      g.font = 'bold 92px Impact, "Arial Black", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('27', 64, 66);
      g.fillStyle = '#1c2a4e';
      g.fillRect(0, 112, 128, 16);
      this.numberTex = tex(c, true, false);
    }
    const m = this.lib.derive('jerseyNumber');
    m.map = this.numberTex;
    m.needsUpdate = true;
    this.numberMaterial = m;
    return m;
  }

  attach(bike: HeroBike): void {
    this.bike = bike;
    bike.frame.add(this.seated);
  }

  /** Take the posed kit out of the bike frame (hot swap). */
  detach(): void {
    this.seated.removeFromParent();
  }

  dispose(): void {
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
    this.seated.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
  }

  // ---------------------------------------------------------------------------
  // Parts
  // ---------------------------------------------------------------------------

  /** Tints baked into `riderCloth` vertex colours (linear); anything else keeps its own material. */
  private static readonly CLOTH: Record<string, number> = { jersey: 0xf5c518, pants: 0x1c2a4e, gloves: 0x1c1e22, boots: 0x131315, bootSole: 0x2c2a26, armour: 0x24262b, alloyBrushed: 0xb4b6ba, blackMatte: 0x151517 };
  private readonly tint = new THREE.Color();

  private mesh(g: THREE.BufferGeometry, mat: string, parent: THREE.Object3D): THREE.Mesh {
    const cloth = RiderModel.CLOTH[mat];
    let m: THREE.Mesh;
    if (cloth !== undefined) {
      const n = g.getAttribute('position').count;
      const col = new Float32Array(n * 3);
      const c = this.tint.setHex(cloth);
      for (let i = 0; i < n; i++) {
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      m = new THREE.Mesh(g, this.lib.get('riderCloth'));
    } else {
      m = new THREE.Mesh(g, this.lib.get(mat));
    }
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  private buildHead(parent: THREE.Object3D): THREE.Group {
    const head = new THREE.Group();
    const R = L.headR;
    const shell = this.mesh(new THREE.SphereGeometry(R, 24, 16), 'helmet', head);
    shell.scale.set(1.04, 1.0, 0.94);
    // Chin bar wrapping the front-bottom, with a mouth vent.
    const chin = this.mesh(rbox(0.12, 0.075, 0.16, 0.035, 3), 'helmet', head);
    chin.position.set(0.07, -0.07, 0);
    chin.rotation.z = 0.1;
    const vent = this.mesh(rbox(0.03, 0.03, 0.08, 0.008), 'blackMatte', head);
    vent.position.set(0.13, -0.065, 0);
    // Goggles: mirrored lens in a dark frame, strap around the shell.
    const frame = this.mesh(rbox(0.045, 0.075, 0.19, 0.025, 3), 'armour', head);
    frame.position.set(0.095, 0.01, 0);
    const lens = this.mesh(rbox(0.03, 0.055, 0.17, 0.02, 3), 'visor', head);
    lens.position.set(0.112, 0.01, 0);
    const strap = this.mesh(new THREE.TorusGeometry(R * 1.02, 0.012, 6, 28), 'armour', head);
    strap.rotation.x = Math.PI / 2;
    strap.position.y = 0.01;
    strap.scale.set(1.04, 1, 0.94);
    // Peak over the goggles.
    const peak = this.mesh(rbox(0.15, 0.008, 0.2, 0.004, 1), 'helmet', head);
    peak.position.set(0.1, 0.085, 0);
    peak.rotation.z = -0.4;
    // White centre stripe + rear vents (helmet trim).
    const stripe = this.mesh(new THREE.TorusGeometry(R * 1.005, 0.007, 5, 32, 2.4), 'helmetTrim', head);
    stripe.rotation.set(0, Math.PI / 2, 0.5);
    stripe.scale.set(1, 1.0, 1.04);
    const rearVent = this.mesh(rbox(0.05, 0.02, 0.06, 0.006), 'blackMatte', head);
    rearVent.position.set(-0.1, 0.06, 0);
    rearVent.rotation.z = 0.5;
    // Neck (dark) into the collar.
    const neck = this.mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.1, 12), 'pants', head);
    neck.position.set(-0.015, -0.13, 0);
    parent.add(head);
    return head;
  }

  private buildHand(side: number, parent: THREE.Object3D): THREE.Group {
    const hand = new THREE.Group();
    hand.name = 'hand';
    // Four fingers wrapped around the bar axis (z), a palm block toward the wrist, a thumb inboard.
    for (let i = 0; i < 4; i++) {
      const ring = this.mesh(new THREE.TorusGeometry(0.026, 0.013, 7, 14), 'gloves', hand);
      ring.position.z = (i - 1.5) * 0.021;
    }
    const palm = this.mesh(rbox(0.05, 0.055, 0.09, 0.018, 2), 'gloves', hand);
    palm.position.set(-0.005, -0.035, 0);
    const thumb = this.mesh(new THREE.CapsuleGeometry(0.012, 0.03, 3, 8), 'gloves', hand);
    thumb.rotation.x = Math.PI / 2;
    thumb.position.set(0.02, -0.005, -side * 0.045);
    mergeStaticChildren(hand);
    parent.add(hand);
    return hand;
  }

  private buildFoot(parent: THREE.Object3D): THREE.Group {
    const foot = new THREE.Group();
    // Ankle at the origin; the boot foot runs forward (+x) and sits on the peg (−ankle).
    const body = this.mesh(rbox(0.26, 0.085, 0.105, 0.03, 3), 'boots', foot);
    body.position.set(0.05, -0.048, 0);
    const toe = this.mesh(rbox(0.08, 0.06, 0.1, 0.028, 3), 'boots', foot);
    toe.position.set(0.15, -0.06, 0);
    const sole = this.mesh(rbox(0.29, 0.02, 0.11, 0.006), 'bootSole', foot);
    sole.position.set(0.055, -0.088, 0);
    const heelCup = this.mesh(rbox(0.06, 0.09, 0.11, 0.02), 'armour', foot);
    heelCup.position.set(-0.06, -0.04, 0);
    mergeStaticChildren(foot);
    parent.add(foot);
    return foot;
  }

  private buildKit(parent: THREE.Object3D, ragdoll: boolean): Kit {
    // ---- Torso: lathe body (wider across the shoulders, thinner front-back), collar, neck brace,
    // back hump, shoulder caps, number patches front and back.
    const torso = new Segment(L.torso);
    const body = this.mesh(lathe([[0.1, 0], [0.13, 0.05], [0.135, 0.18], [0.15, 0.33], [0.165, 0.44], [0.14, 0.5], [0.07, 0.535], [0, 0.54]], 18), 'jersey', torso.group);
    body.scale.set(0.72, 1, 1);
    for (const s of [-1, 1]) {
      const cap = this.mesh(new THREE.SphereGeometry(0.066, 14, 10), 'jersey', torso.group);
      cap.position.set(0.0, L.torso - 0.035, s * (L.shoulderHalf - 0.02));
      cap.scale.set(0.95, 0.9, 1);
    }
    const collar = this.mesh(new THREE.TorusGeometry(0.062, 0.012, 6, 20), 'pants', torso.group);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0.0, L.torso + 0.01, 0);
    const brace = this.mesh(new THREE.TorusGeometry(0.1, 0.026, 8, 24), 'armour', torso.group);
    brace.rotation.x = Math.PI / 2;
    brace.position.set(-0.01, L.torso - 0.005, 0);
    brace.scale.set(1.15, 1, 1.2);
    const hump = this.mesh(new THREE.SphereGeometry(0.085, 14, 10), 'jersey', torso.group);
    hump.position.set(-0.075, L.torso * 0.78, 0);
    hump.scale.set(0.75, 1.25, 1.1);
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.19), this.numberMat());
    num.position.set(-0.118, L.torso * 0.5, 0);
    num.rotation.y = -Math.PI / 2;
    torso.group.add(num);
    const numF = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), this.numberMat());
    numF.position.set(0.11, L.torso * 0.66, 0);
    numF.rotation.set(0, Math.PI / 2, -0.12);
    torso.group.add(numF);
    parent.add(torso.group);
    // ---- Pelvis: pants block + belt + hip protectors, hanging under the torso base (it tilts
    // with the torso, so it lives in the torso segment: one draw fewer). The ragdoll kit keeps a
    // separate pelvis segment because physics moves it on its own.
    const pelvis = new Segment(L.pelvis);
    const pelvisParent = ragdoll ? pelvis.group : torso.group;
    const py0 = ragdoll ? 0 : -L.pelvis * 0.9;
    const hips = this.mesh(rbox(0.21, L.pelvis + 0.04, 0.3, 0.06, 3), 'pants', pelvisParent);
    hips.position.y = py0 + L.pelvis / 2;
    const belt = this.mesh(rbox(0.22, 0.04, 0.31, 0.01), 'armour', pelvisParent);
    belt.position.y = py0 + L.pelvis - 0.01;
    for (const s of [-1, 1]) {
      const hip = this.mesh(new THREE.SphereGeometry(0.09, 12, 8), 'pants', pelvisParent);
      hip.position.set(0, py0 + 0.03, s * L.hipHalf);
    }
    if (ragdoll) parent.add(pelvis.group);
    const head = this.buildHead(parent);
    const upperArm: Segment[] = [];
    const forearm: Segment[] = [];
    const thigh: Segment[] = [];
    const shin: Segment[] = [];
    const hand: THREE.Group[] = [];
    const foot: THREE.Group[] = [];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      // ---- Upper arm: jersey sleeve, shoulder root sphere, sleeve fold, elbow sphere.
      const ua = new Segment(L.upperArm);
      this.mesh(lathe([[0, 0], [0.056, 0.01], [0.055, 0.14], [0.05, 0.26], [0.046, L.upperArm], [0, L.upperArm + 0.01]], 12), 'jersey', ua.group);
      const root = this.mesh(new THREE.SphereGeometry(0.058, 12, 8), 'jersey', ua.group);
      root.position.y = 0.01;
      const fold = this.mesh(new THREE.TorusGeometry(0.052, 0.006, 6, 14), 'jersey', ua.group);
      fold.rotation.x = Math.PI / 2;
      fold.position.y = 0.19;
      const elbow = this.mesh(new THREE.SphereGeometry(0.05, 12, 8), 'jersey', ua.group);
      elbow.position.y = L.upperArm;
      parent.add(ua.group);
      upperArm.push(ua);
      // ---- Forearm: tapering sleeve ending 3 cm before the grip, glove cuff at the wrist.
      const fa = new Segment(L.forearm);
      this.mesh(lathe([[0, 0], [0.047, 0.01], [0.046, 0.1], [0.04, 0.18], [0.036, 0.22], [0, 0.225]], 12), 'jersey', fa.group);
      const cuff = this.mesh(new THREE.CylinderGeometry(0.037, 0.04, 0.07, 12), 'gloves', fa.group);
      cuff.position.y = L.forearm - 0.055;
      const cuffStrap = this.mesh(new THREE.TorusGeometry(0.04, 0.005, 5, 14), 'armour', fa.group);
      cuffStrap.rotation.x = Math.PI / 2;
      cuffStrap.position.y = L.forearm - 0.06;
      parent.add(fa.group);
      forearm.push(fa);
      // Posed kit: the fist rides at the end of the forearm segment (one draw); ragdoll kit: free.
      const hnd = this.buildHand(side, ragdoll ? parent : fa.group);
      if (!ragdoll) {
        // Flatten the fist into the forearm group so the segment merge takes it (one draw).
        hnd.position.y = L.forearm;
        hnd.updateMatrix();
        for (const c of [...hnd.children]) {
          c.applyMatrix4(hnd.matrix);
          fa.group.add(c);
        }
        fa.group.remove(hnd);
      }
      hand.push(hnd);
      // ---- Thigh: pants tapering to the knee, knee brace cup + hinge plates.
      const th = new Segment(L.thigh);
      const thm = this.mesh(lathe([[0, 0], [0.085, 0.02], [0.085, 0.16], [0.072, 0.34], [0.062, L.thigh], [0, L.thigh + 0.01]], 14), 'pants', th.group);
      thm.scale.set(1.08, 1, 1);
      const hipRoot = this.mesh(new THREE.SphereGeometry(0.086, 12, 8), 'pants', th.group);
      hipRoot.position.y = 0.02;
      const kneeCup = this.mesh(rbox(0.1, 0.16, 0.12, 0.04, 3), 'armour', th.group);
      kneeCup.position.set(0.035, L.thigh - 0.03, 0);
      for (const s of [-1, 1]) {
        const hinge = this.mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 10).rotateX(Math.PI / 2), 'alloyBrushed', th.group);
        hinge.position.set(0.0, L.thigh - 0.01, s * 0.068);
      }
      parent.add(th.group);
      thigh.push(th);
      // ---- Shin: knee sphere + tall boot with shin plate and three buckles.
      const sh = new Segment(L.shin);
      const knee = this.mesh(new THREE.SphereGeometry(0.065, 12, 8), 'pants', sh.group);
      knee.position.y = 0.02;
      this.mesh(lathe([[0, 0.03], [0.062, 0.04], [0.06, 0.2], [0.052, 0.36], [0.05, L.shin], [0, L.shin + 0.01]], 14), 'boots', sh.group);
      const plate = this.mesh(rbox(0.035, 0.3, 0.09, 0.015, 2), 'boots', sh.group);
      plate.position.set(0.05, L.shin * 0.5 + 0.02, 0);
      for (const by of [0.14, 0.23, 0.32]) {
        const buckle = this.mesh(rbox(0.028, 0.03, 0.12, 0.006), 'alloyBrushed', sh.group);
        buckle.position.set(0.062, by, 0);
      }
      parent.add(sh.group);
      shin.push(sh);
      foot.push(this.buildFoot(parent));
    }
    for (const seg of [torso, pelvis, ...upperArm, ...forearm, ...thigh, ...shin]) mergeStaticChildren(seg.group);
    mergeStaticChildren(head);
    return { torso, pelvis, head, upperArm, forearm, thigh, shin, hand, foot };
  }

  // ---------------------------------------------------------------------------
  // Posing
  // ---------------------------------------------------------------------------

  update(f: RenderFrame): void {
    if (f.ragdoll && f.ragdoll.length > 0) {
      if (!this.wasRagdoll || f.cut) this.ragFrames = 0;
      this.wasRagdoll = true;
      this.seated.visible = false;
      this.ragdoll.visible = true;
      this.poseRagdoll(f.ragdoll);
      this.ragFrames++;
      return;
    }
    this.wasRagdoll = false;
    this.seated.visible = true;
    this.ragdoll.visible = false;
    this.poseRider(f);
  }

  private poseRider(f: RenderFrame): void {
    const r = {
      lean: this.spring('lean', f.rider.lean, f.dt, f.cut),
      torsoPitch: this.spring('torso', f.rider.torsoPitch, f.dt, f.cut),
      armExtend: this.spring('arm', f.rider.armExtend, f.dt, f.cut),
      crouch: this.spring('crouch', f.rider.crouch, f.dt, f.cut),
    };
    if (f.cut) this.landT = -1;
    if (f.justLanded && f.landImpulse > 1.2) {
      this.landT = f.tSim;
      this.landAmp = Math.min(1, f.landImpulse * 0.18);
    }
    let landK = 0;
    if (this.landT >= 0) {
      const lt = f.tSim - this.landT;
      landK = lt < 0.5 ? this.landAmp * Math.sin(Math.PI * Math.min(1, lt / 0.5)) : 0;
      if (lt >= 0.5) this.landT = -1;
    }
    const c = solveChain(r, this.chain, landK);
    const k = this.kit;
    const { hips: H, shoulders: S, head: HD } = c;
    k.torso.place(H.x, H.y, 0, S.x, S.y, 0);
    k.head.position.copy(HD);
    k.head.rotation.z = c.headAngle;
    for (let i = 0; i < 2; i++) {
      const sh = c.shoulder[i]!;
      const el = c.elbow[i]!;
      const hd = c.hand[i]!;
      k.upperArm[i]!.place(sh.x, sh.y, sh.z, el.x, el.y, el.z);
      k.forearm[i]!.place(el.x, el.y, el.z, hd.x, hd.y, hd.z);
      this.debug.armStretch[i] = k.forearm[i]!.stretch;
      this.debug.handOnGrip[i] = true;
      this.posed.elbow[i]!.copy(el);
      this.posed.wrist[i]!.copy(hd);
      const hp = c.hip[i]!;
      const kn = c.knee[i]!;
      const an = c.ankle[i]!;
      k.thigh[i]!.place(hp.x, hp.y, hp.z, kn.x, kn.y, kn.z);
      k.shin[i]!.place(kn.x, kn.y, kn.z, an.x, an.y, an.z);
      const ft = k.foot[i]!;
      ft.position.copy(an);
      ft.rotation.set(0, 0, -0.05);
      this.debug.legStretch[i] = k.shin[i]!.stretch;
      this.posed.knee[i]!.copy(kn);
      this.posed.ankle[i]!.copy(an);
    }
    // Remember the posed joints (frame-local) for the ragdoll hand-over; they are carried to
    // world space with the frame matrix of the ragdoll frame, so the bike's own motion between
    // the two frames is not counted as a pose residual.
    this.posed.hips.copy(H);
    this.posed.pelvisBottom.copy(c.pelvisBottom);
    this.posed.shoulders.copy(S);
    this.posed.head.copy(HD);
    this.posed.headAngle = c.headAngle;
    this.posedWorld = false;
    this.debug.ragdollBlend = 0;
  }

  /**
   * Draw the kit at the physics bodies. Body local +y = (−sin a, cos a): up for torso / pelvis /
   * head, distal→proximal for the limbs. The first two ragdoll frames blend the drawn
   * endpoints from the last posed frame (t = 1/3, 2/3) so the hand-over never pops.
   */
  private poseRagdoll(bodies: RagdollBody[]): void {
    const k = this.rag;
    const P = this.posed;
    if (!this.posedWorld && this.bike) {
      const M = this.bike.frameLocal;
      for (const v of [P.hips, P.pelvisBottom, P.shoulders, P.head, ...P.elbow, ...P.wrist, ...P.knee, ...P.ankle]) v.applyMatrix4(M);
      P.headAngle += this.bike.frame.rotation.z;
      this.posedWorld = true;
    }
    // Blend length: 2 frames for a residual under 10 cm, up to 5 frames at 30 cm+ (the reach
    // slide at full lean-back is not in the physics chain yet).
    if (this.ragFrames === 0) this.blendFrames = 2;
    const t = this.ragFrames < this.blendFrames ? (this.ragFrames + 1) / (this.blendFrames + 1) : 1;
    this.debug.ragdollBlend = t;
    for (const s of [k.torso, k.pelvis, ...k.upperArm, ...k.forearm, ...k.thigh, ...k.shin]) s.group.visible = false;
    for (const g of [...k.hand, ...k.foot]) g.visible = false;
    k.head.visible = false;
    let residual = 0;
    if (this.ragFrames === 0) this.debug.ragdollDetail.length = 0;
    const a = this.ta;
    const b = this.tb;
    const blend = (out: THREE.Vector3, posed: THREE.Vector3): void => {
      if (t < 1) out.lerp(posed, 1 - t);
    };
    for (const bd of bodies) {
      const ux = -Math.sin(bd.angle);
      const uy = Math.cos(bd.angle);
      if (bd.id === 'head') {
        k.head.visible = true;
        a.set(bd.pos.x, bd.pos.y, 0);
        if (this.ragFrames === 0) {
          residual = Math.max(residual, a.distanceTo(P.head));
          this.debug.ragdollDetail.push(`head: ${(a.x - P.head.x).toFixed(3)},${(a.y - P.head.y).toFixed(3)} ang ${(bd.angle - P.headAngle).toFixed(3)}`);
        }
        blend(a, P.head);
        k.head.position.copy(a);
        let da = bd.angle - P.headAngle;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        k.head.rotation.z = t < 1 ? P.headAngle + da * t : bd.angle;
        continue;
      }
      const limb = bd.id === 'upperArm' || bd.id === 'forearm' || bd.id === 'thigh' || bd.id === 'shin';
      const segs: Segment[] = bd.id === 'torso' ? [k.torso] : bd.id === 'pelvis' ? [k.pelvis] : bd.id === 'upperArm' ? k.upperArm : bd.id === 'forearm' ? k.forearm : bd.id === 'thigh' ? k.thigh : k.shin;
      const len = bd.id === 'torso' ? 0.4 : bd.id === 'pelvis' ? 0.2 : bd.id === 'upperArm' ? 0.3 : bd.id === 'forearm' ? 0.28 : 0.42;
      const hx = ux * len * 0.5;
      const hy = uy * len * 0.5;
      segs.forEach((s, i) => {
        s.group.visible = true;
        const z = segs.length > 1 ? (i === 0 ? 0.15 : -0.15) : 0;
        // a = segment start (proximal for limbs, bottom for torso/pelvis), b = end.
        if (limb) {
          a.set(bd.pos.x + hx, bd.pos.y + hy, z);
          b.set(bd.pos.x - hx, bd.pos.y - hy, z);
        } else {
          a.set(bd.pos.x - hx, bd.pos.y - hy, z);
          b.set(bd.pos.x + hx, bd.pos.y + hy, z);
        }
        const pa = bd.id === 'torso' ? P.hips : bd.id === 'pelvis' ? P.pelvisBottom : bd.id === 'upperArm' ? P.shoulders : bd.id === 'forearm' ? P.elbow[i]! : bd.id === 'thigh' ? P.hips : P.knee[i]!;
        const pb = bd.id === 'torso' ? P.shoulders : bd.id === 'pelvis' ? P.hips : bd.id === 'upperArm' ? P.elbow[i]! : bd.id === 'forearm' ? P.wrist[i]! : bd.id === 'thigh' ? P.knee[i]! : P.ankle[i]!;
        if (this.ragFrames === 0) {
          if (bd.id === 'torso' || bd.id === 'pelvis') residual = Math.max(residual, a.distanceTo(pa), b.distanceTo(pb));
          this.debug.ragdollDetail.push(`${bd.id}${i}: a ${(a.x - pa.x).toFixed(3)},${(a.y - pa.y).toFixed(3)} b ${(b.x - pb.x).toFixed(3)},${(b.y - pb.y).toFixed(3)}`);
        }
        blend(a, pa);
        blend(b, pb);
        s.place(a.x, a.y, a.z, b.x, b.y, b.z);
        if (bd.id === 'forearm') {
          const h = k.hand[i]!;
          h.visible = true;
          h.position.copy(b);
          h.rotation.set(0, 0, Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2);
        } else if (bd.id === 'shin') {
          const ft = k.foot[i]!;
          ft.visible = true;
          ft.position.copy(b);
          ft.rotation.set(0, 0, Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2);
        }
      });
    }
    if (this.ragFrames === 0) {
      this.debug.ragdollResidual = residual;
      this.blendFrames = 2; // physics' crash chain is a port of pose.ts (≤ 0.5 cm), round 10
    }
  }
}
