/**
 * glTF rider (round 8): `public/models/rider.glb` — one skinned mesh, 19 joints, 8 clips — and (ask 43) Astra's
 * per-outfit files: the same 19-joint rig and sockets, several skinned meshes merged by `prepareHero`, six reference
 * cycles read through `clipAliases.ts` windows so the game's clip names still exist — posed from the SAME chain as
 * the procedural kit (`solveChain`, later the pose owner's
 * `rider/pose.ts`), per the README bone recipe: each bone's world rotation is
 * `setFromUnitVectors(restDir, targetDir) · restWorldQ`, converted to parent space in
 * hierarchy order; the pelvis (root) carries the hips position. Rest directions come from the
 * loaded bind pose (local +y = head → tail), so a rebuilt rider.glb with a different rest
 * pose needs no table edits.
 *
 * Clips are applied ADDITIVELY on top of the chain: the transient poses are relative to
 * `stand_attack`, breathing to its own first frame. `land_absorb` is weighted by suspension compression,
 * `extend` weighted by rider-body upward speed. v1/mock physics keeps timed envelopes.
 * Every sample starts from a fresh base pose, then both hands and feet are solved back onto
 * their contacts. Unreachable additive motion is attenuated toward the physics-driven pose.
 * Ragdoll: the rig is re-parented to the world and every bone takes the direction of its
 * physics body (`state.ragdoll`, README body → bone map); the pelvis follows the pelvis body.
 */
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { BikeClass, RagdollBody } from '../../core/types';
import type { HeroBike } from '../bike/bikeModel';
import type { RenderFrame } from '../frame';
import type { MaterialLibrary } from '../materials/library';
import { newChain, solveChain, type Chain } from '../rider/riderModel';
import { countTriangles, prepareHeroMaterials } from './gltf';
import { makeRiderRigPose, riderRigFromCOM, RIDER_PROFILE, RIDER_TORSO_REST } from './riderRig';
import { clipWindows, type ClipWindow } from './clipAliases';
import { DRAWN, DRAWN_SEAT } from '../../physics/v2/rider';

const SHIFT = 0.65; // axle-midpoint frame → file frame (rear axle origin)
/** Landing squash weight from the summed grounded compression: 0 at the ridden sag, `max` at sag + span. */
const LAND = { sag: 0.9, span: 0.7, max: 0.9 };
/** Hop extension weight from the rider body's relative upward speed (m/s). */
const EXTEND = { v0: 0.25, span: 1.2, max: 0.7 };
/**
 * Ask 51: on the garage stage the bike is static and the rider plays Astra's settled clip WHOLE — every bone's
 * authored local rotation and translation, no physics stance, no IK — the pose the prototype garage showed
 * (docs/evidence/hero-art/pose-compare/). The clip loops on simulated time (frozen on the garage screen; `sit_cruise`
 * is a static hold anyway: 0.000 mm joint travel over its 1.967 s). Leaving the stage, the physics pose blends out of
 * the held clip pose over `STAGE_BLEND_S` of simulated time — the bone-local snapshot is frame-independent, so the
 * blend survives the track-load cut and finishes inside the countdown's first quarter second.
 */
const STAGE_CLIP = 'sit_cruise';
const STAGE_BLEND_S = 0.25;
/** The sole socket rests 11 mm above the peg axis (RIG_CONTRACT.md), in the bike frame. */
const SOLE_ON_PEG = { x: RIDER_PROFILE.peg.x, y: RIDER_PROFILE.peg.y + 0.011, z: RIDER_PROFILE.peg.z };
/**
 * Ask 51 step 3 (docs/plans/RIDING_POSES.md): in level the BASE pose is Astra's authored stances, selected and blended
 * by the physics — `riderBody.drawn` (R9's seated / forward / back id + blend) picks between `sit_cruise`,
 * `forward_attack` and `hang_back`; the suspension load (`LAND`) blends toward `landing_absorption`'s absorbed hold
 * and the body's rise (`EXTEND`) toward `extension`'s; every intermediate is a slerp between authored on-grip poses.
 * The physical body's own excursion (its height below / above the drawn table, its torso lag) is added, clamped, and
 * then limited to the arms' / legs' reach. IK is only the bounded correction that puts the sockets back on the grips
 * and pegs, with each elbow / knee pole taken from the blended clip's own elbow / knee — never a fixed direction, never
 * inverted. Before this (cb9ab93) the base was the mass map's inverse of the standing servo body with a fixed
 * forward/up/out elbow pole: hands 16.8 cm off the grips and elbows above the shoulders on 77 % of the b1 golden
 * (docs/evidence/hero-art/pose-compare/trace-before.json).
 */
const STANCE_CLIPS = {
  seated: { source: 'sit_cruise', t: 0 }, // a static hold (0.000 mm over 1.967 s)
  forward: { source: 'forward_attack', t: 1.75 }, // held 1.5–2.0 s (0.0 cm joint travel)
  back: { source: 'hang_back', t: 1.75 }, // held 1.5–2.0 s
  land: { source: 'landing_absorption', t: 2.5 }, // absorbed hold 2.5–2.75 s
  extend: { source: 'extension', t: 2.25 }, // extended hold 2.25–2.5 s
} as const;
type StanceId = keyof typeof STANCE_CLIPS;
/**
 * Ask 51 round 2: the drawn table's lean blend is NOT the stance weight. The bot rides b1 holding half back lean on
 * 53 % of the rookie golden (input −63/127) and full on 24 %, so physics reports `back` on 90 % of frames and its
 * seated id on 11 % — at half lean the drawn hips (x −0.52) are still on the seat (`DRAWN_SEAT` rear edge −0.54), and
 * drawing `hang_back` at 50 % there perched the rider behind the seat. The stance weight is how far the drawn hips
 * are OFF the seat: for `back` the x behind the seat's rear edge up to the full back row (leaves the seat at lean
 * 0.556); for `forward` the rise above the seated hip height past `SEAT_RISE` up to the forward row. The seated
 * clip holds while physics says the pelvis is on the seat; the excursion (`dy`, `lag`) still reads the raw table.
 */
const SEAT_RISE = 0.03;
/** The physical excursion drawn on top of the stance: hips ±12 cm, torso ±20° — then the reach limit. */
const EXCURSION = { dy: 0.12, lag: 0.35 };
const Z_AXIS = new THREE.Vector3(0, 0, 1);
/** Bones the arm IK owns; additive clips leave them alone so the hands stay on the grips. */
const ARM_CHAIN = /^(shoulder|upperArm|forearm|hand)\./;
const ORDER = ['pelvis', 'spine', 'chest', 'neck', 'head', 'shoulder.L', 'upperArm.L', 'forearm.L', 'hand.L', 'shoulder.R', 'upperArm.R', 'forearm.R', 'hand.R', 'thigh.L', 'shin.L', 'foot.L', 'thigh.R', 'shin.R', 'foot.R'] as const;
const CONTACT_ROOTS = ['upperArm.L', 'upperArm.R', 'thigh.L', 'thigh.R'] as const;
type BoneName = (typeof ORDER)[number];

interface ClipSampler {
  /** Length of the window the driver plays (the whole clip for an authored game clip). */
  duration: number;
  /** Source-clip time of the window's start: sampled time = `from + t`. */
  from: number;
  /** Window time the physics-weighted path samples — the clip's held target pose. */
  poseT: number;
  rot: Map<string, { interp: THREE.Interpolant; rest: THREE.Quaternion; out: THREE.Quaternion }>;
  pos: Map<string, { interp: THREE.Interpolant; rest: THREE.Vector3; out: THREE.Vector3 }>;
}

/**
 * GLTFLoader sanitises node names for PropertyBinding (`shoulder.L` → `shoulderL`); the README
 * names, the clip track names and our tables use the dotted form. Normalise to dotted.
 */
export function boneName(raw: string): string {
  if (raw.includes('.')) return raw;
  const m = /^([a-zA-Z]+)([LR])$/.exec(raw);
  return m ? `${m[1]}.${m[2]}` : raw;
}

/** A clip read through a window (`clipAliases.ts`): its rest is the window's reference frame, not frame 0. */
function sampler(clip: THREE.AnimationClip, w: ClipWindow): ClipSampler {
  const s: ClipSampler = { duration: Math.max(1e-3, w.to - w.from), from: w.from, poseT: w.pose, rot: new Map(), pos: new Map() };
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf('.');
    const node = boneName(t.name.slice(0, dot));
    const prop = t.name.slice(dot + 1);
    const interp = (t as unknown as { createInterpolant(): THREE.Interpolant }).createInterpolant();
    if (prop === 'quaternion') {
      const r = interp.evaluate(w.ref) as Float32Array;
      s.rot.set(node, { interp, rest: new THREE.Quaternion(r[0], r[1], r[2], r[3]).normalize(), out: new THREE.Quaternion() });
    } else if (prop === 'position') {
      const r = interp.evaluate(w.ref) as Float32Array;
      s.pos.set(node, { interp, rest: new THREE.Vector3(r[0], r[1], r[2]), out: new THREE.Vector3() });
    }
  }
  return s;
}

export class GltfRider {
  readonly root = new THREE.Group();
  readonly triangles: number;
  readonly materials: THREE.MeshStandardMaterial[];
  readonly debug = { armStretch: [1, 1], legStretch: [1, 1], handOnGrip: [true, true], wristErr: [0, 0], gripErr: [0, 0], gripAngleErr: [0, 0], ankleErr: [0, 0], armLen: [0, 0], additiveWeight: 1, physicalPose: false, comResidual: 0, ragdollResidual: -1, ragdollBlend: 0, ragdollDetail: [] as string[], bones: 0, clips: [] as string[], stageClip: null as string | null, stageBlend: 0, soleErr: [0, 0], stance: { on: false, pose: 'seated' as 'seated' | 'back' | 'forward', blend: 0, lean: 0, land: 0, extend: 0, dy: 0, lag: 0, limit: 1 } };
  private readonly scene: THREE.Object3D;
  private readonly bones = new Map<string, THREE.Bone>();
  private readonly q0 = new Map<string, THREE.Quaternion>();
  private readonly d0 = new Map<string, THREE.Vector3>();
  private readonly parentOf = new Map<string, string | null>();
  private readonly worldQ = new Map<string, THREE.Quaternion>();
  private readonly restLocalQ = new Map<string, THREE.Quaternion>();
  private readonly restLocalP = new Map<string, THREE.Vector3>();
  /** Reused base/candidate transforms for limiting additive motion to the rig's contact reach. */
  private readonly additiveBasis: { bone: THREE.Bone; baseP: THREE.Vector3; baseQ: THREE.Quaternion; targetP: THREE.Vector3; targetQ: THREE.Quaternion }[] = [];
  /** Rig bone lengths (file space) per side: upper arm, forearm — the IK works in these, not the chain's. */
  private readonly armLen: [number, number][] = [
    [0.3, 0.28],
    [0.3, 0.28],
  ];
  private readonly legLen: [number, number][] = [
    [0.46, 0.43],
    [0.46, 0.43],
  ];
  /** New authored hands have anatomical wrists and separate palm contacts. Legacy assets use
   * the wrist itself as their contact, represented by a zero offset and no socket. */
  private readonly gripSockets: (THREE.Object3D | null)[] = [null, null];
  private readonly gripOffsets = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly gripRestQ = [new THREE.Quaternion(), new THREE.Quaternion()];
  private readonly wristTarget = new THREE.Vector3();
  private readonly physicalRig = makeRiderRigPose();
  /** Ragdoll hand-over (round 9): last posed bone-local quaternions + pelvis world pose, blended out over 2–5 frames. */
  private readonly handover = { q: new Map<string, THREE.Quaternion>(), pelvisQ: new THREE.Quaternion(), pelvisP: new THREE.Vector3(), t0: -1, dur: 0, active: false };
  /** Ask 51: the garage stage (`setStage`) and the bone-local snapshot the physics pose blends out of on leaving it. */
  private stage = false;
  private readonly stageBlend = { q: new Map<string, THREE.Quaternion>(), p: new Map<string, THREE.Vector3>(), t: 0, active: false };
  private readonly soleSockets: (THREE.Object3D | null)[] = [null, null];
  /** Ask 51: the authored stance holds, bone-local (`STANCE_CLIPS`); null when the file lacks any of them (the mass-map path then). */
  private readonly stances: Record<StanceId, { q: Map<string, THREE.Quaternion>; p: Map<string, THREE.Vector3> }> | null;
  private armQ = new THREE.Quaternion();
  private readonly armInv = new THREE.Matrix4();
  private readonly chain = newChain();
  private readonly clips = new Map<string, ClipSampler>();
  private bike: HeroBike | null = null;
  private inRagdoll = false;
  private readonly lead = { lean: 0, leanV: 0, torso: 0, torsoV: 0, arm: 0, armV: 0, crouch: 0, crouchV: 0 };
  /** The parsed document this instance was cloned from (`rider.glb` or `rider-lod.glb`). */
  readonly source: GLTF;
  /** v1 / mock physics only (no `riderBody`): the additive clips run on these timers. */
  private landT = -1;
  private landW = 0.45;
  private pushT = -1;
  private lastHop: RenderFrame['hopPhase'] = 'idle';
  // scratch
  private readonly qa = new THREE.Quaternion();
  private readonly qb = new THREE.Quaternion();
  private readonly qc = new THREE.Quaternion();
  private readonly va = new THREE.Vector3();
  private readonly vb = new THREE.Vector3();
  private readonly vc = new THREE.Vector3();
  private readonly vd = new THREE.Vector3();
  private readonly ve = new THREE.Vector3();
  private readonly vf = new THREE.Vector3();
  private readonly ID = new THREE.Quaternion();

  constructor(gltf: GLTF, lib: MaterialLibrary) {
    this.source = gltf;
    this.scene = cloneSkeleton(gltf.scene);
    const matMap = new Map<THREE.Material, THREE.Material>();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const src = m.material as THREE.Material;
      let c = matMap.get(src);
      if (!c) {
        c = src.clone();
        matMap.set(src, c);
      }
      m.material = c;
    });
    this.materials = prepareHeroMaterials(this.scene, (m) => lib.complete(m));
    this.scene.position.set(-SHIFT, 0, 0);
    this.root.name = 'rider:gltf';
    this.triangles = countTriangles(this.scene);
    // Rest pose capture in file space (scene at identity).
    const holder = new THREE.Group();
    holder.add(this.scene);
    this.scene.position.set(0, 0, 0);
    holder.updateMatrixWorld(true);
    this.scene.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.bones.set(boneName(o.name), o as THREE.Bone);
    });
    for (const name of ORDER) {
      const b = this.bones.get(name);
      if (!b) continue;
      const q = new THREE.Quaternion();
      b.getWorldQuaternion(q);
      this.q0.set(name, q);
      this.d0.set(name, new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize());
      const p = b.parent;
      this.parentOf.set(name, p && (p as THREE.Bone).isBone ? boneName(p.name) : null);
      this.restLocalQ.set(name, b.quaternion.clone());
      this.restLocalP.set(name, b.position.clone());
      this.additiveBasis.push({ bone: b, baseP: new THREE.Vector3(), baseQ: new THREE.Quaternion(), targetP: new THREE.Vector3(), targetQ: new THREE.Quaternion() });
    }
    const pelvis = this.bones.get('pelvis');
    if (pelvis?.parent) {
      pelvis.parent.getWorldQuaternion(this.armQ);
      this.armInv.copy(pelvis.parent.matrixWorld).invert();
    }
    // Arm bone lengths from the bind pose (world distances, so the armature scale is included).
    for (let i = 0; i < 2; i++) {
      const sd = i === 0 ? 'L' : 'R';
      const ua = this.bones.get(`upperArm.${sd}`);
      const fa = this.bones.get(`forearm.${sd}`);
      const hd = this.bones.get(`hand.${sd}`);
      if (ua && fa && hd) {
        const a = ua.getWorldPosition(new THREE.Vector3());
        const b = fa.getWorldPosition(new THREE.Vector3());
        const c = hd.getWorldPosition(new THREE.Vector3());
        this.armLen[i] = [a.distanceTo(b), b.distanceTo(c)];
        this.debug.armLen[i] = +(this.armLen[i]![0] + this.armLen[i]![1]).toFixed(3);
        const socket = this.scene.getObjectByName(`gripSocket.${sd}`) ?? this.scene.getObjectByName(`gripSocket${sd}`);
        if (socket) {
          this.gripSockets[i] = socket;
          socket.getWorldPosition(this.gripOffsets[i]!).sub(c);
          socket.getWorldQuaternion(this.gripRestQ[i]!);
        }
      }
      this.soleSockets[i] = this.scene.getObjectByName(`soleSocket.${sd}`) ?? this.scene.getObjectByName(`soleSocket${sd}`) ?? null;
      const thigh = this.bones.get(`thigh.${sd}`);
      const shin = this.bones.get(`shin.${sd}`);
      const foot = this.bones.get(`foot.${sd}`);
      if (thigh && shin && foot) {
        const a = thigh.getWorldPosition(new THREE.Vector3());
        const b = shin.getWorldPosition(new THREE.Vector3());
        const c = foot.getWorldPosition(new THREE.Vector3());
        this.legLen[i] = [a.distanceTo(b), b.distanceTo(c)];
      }
    }
    for (const name of ORDER) {
      this.handover.q.set(name, new THREE.Quaternion());
      this.stageBlend.q.set(name, new THREE.Quaternion());
      this.stageBlend.p.set(name, new THREE.Vector3());
    }
    holder.remove(this.scene);
    this.scene.position.set(-SHIFT, 0, 0);
    this.debug.bones = this.bones.size;
    // Ask 43: the game's clip names are windows of whatever the file authored (`clipAliases.ts`) — the legacy
    // eight pass through whole; Astra's six cycles also yield stand_attack / crouch / extend / land_absorb.
    const byName = new Map(gltf.animations.map((c) => [c.name, c]));
    for (const [name, w] of clipWindows(gltf.animations)) {
      this.clips.set(name, sampler(byName.get(w.source)!, w));
      this.debug.clips.push(name);
    }
    // These are full pose clips, with crouch/extension as their opening poses. Subtracting those
    // openings adds a whole crouch->extension or extension->landing transition to an unrelated
    // live pose. Both layers need the same neutral reference; idle keeps its authored zero frame.
    // (On Astra's family every window already rests on the stance frame this clip IS — a no-op there.)
    const neutral = this.clips.get('stand_attack');
    if (neutral) {
      for (const name of ['land_absorb', 'extend']) {
        const clip = this.clips.get(name);
        if (!clip) continue;
        for (const [node, track] of clip.rot) {
          const reference = neutral.rot.get(node);
          if (reference) track.rest.copy(reference.rest);
        }
        const pelvis = clip.pos.get('pelvis');
        const reference = neutral.pos.get('pelvis');
        if (pelvis && reference) pelvis.rest.copy(reference.rest);
      }
    }
    this.stances = this.sampleStances();
  }

  /** Every stance hold sampled once, bone-local, from the whole-clip samplers (`clipWindows` passes every authored clip through under its own name). */
  private sampleStances(): Record<StanceId, { q: Map<string, THREE.Quaternion>; p: Map<string, THREE.Vector3> }> | null {
    const out = {} as Record<StanceId, { q: Map<string, THREE.Quaternion>; p: Map<string, THREE.Vector3> }>;
    for (const id of Object.keys(STANCE_CLIPS) as StanceId[]) {
      const { source, t } = STANCE_CLIPS[id];
      const s = this.clips.get(source);
      if (!s || !s.pos.has('pelvis')) return null;
      const tt = Math.min(t, s.duration - 1e-4);
      const q = new Map<string, THREE.Quaternion>();
      const p = new Map<string, THREE.Vector3>();
      for (const name of ORDER) {
        const r = s.rot.get(name);
        if (!r) return null;
        const v = r.interp.evaluate(tt) as Float32Array;
        q.set(name, new THREE.Quaternion(v[0], v[1], v[2], v[3]).normalize());
        // Only the pelvis carries its authored translation; every other joint keeps its bind offset. Astra's spine
        // socket sits 4.9 mm off its bind offset in every clip, and the WebKit hero gate reads any non-pelvis
        // bone-local translation as accumulation (`hero-webkit.mts` drift floor 0.5 mm) — so the in-level stance
        // draws the clip's rotations on the bind skeleton (torso joints ≤ 5 mm off the mixer's evaluation, hands and
        // soles exact through the IK); the garage stage (`poseStage`) plays the file whole, as the prototype did.
        const pt = name === 'pelvis' ? s.pos.get(name) : undefined;
        const pv = pt ? (pt.interp.evaluate(tt) as Float32Array) : null;
        p.set(name, pv ? new THREE.Vector3(pv[0], pv[1], pv[2]) : this.restLocalP.get(name)!.clone());
      }
      out[id] = { q, p };
    }
    return out;
  }

  /** Ask 43: the outfit is the file (`urls.ts`); the kit's per-class livery is a no-op on the glTF rider. */
  setLivery(_cls: BikeClass): void {}

  attach(bike: HeroBike): void {
    this.bike = bike;
    bike.frame.add(this.scene);
    this.scene.position.set(-SHIFT, 0, 0);
    this.scene.quaternion.identity();
    this.inRagdoll = false;
  }

  detach(): void {
    this.scene.removeFromParent();
  }

  /**
   * Ask 51: the garage stage on / off. On: every frame plays `STAGE_CLIP` whole (the entry is under the garage's own
   * camera cut, so it snaps). Off: the current bone-local pose is kept and the physics pose blends out of it over
   * `STAGE_BLEND_S` of simulated time — a no-op when the file has no settled clip (the physics pose was showing).
   */
  setStage(on: boolean): void {
    if (this.stage === on) return;
    this.stage = on;
    const B = this.stageBlend;
    if (on || !this.clips.has(STAGE_CLIP)) {
      B.active = false;
      return;
    }
    for (const name of ORDER) {
      const b = this.bones.get(name);
      if (!b) continue;
      B.q.get(name)!.copy(b.quaternion);
      B.p.get(name)!.copy(b.position);
    }
    B.t = 0;
    B.active = true;
  }

  /** The authored stage clip evaluated whole onto the bones, in the bone's own space; the contact residuals are measured, never corrected. */
  private poseStage(f: RenderFrame): boolean {
    const s = this.clips.get(STAGE_CLIP);
    if (!s) return false;
    const tt = s.from + (f.tSim % s.duration);
    for (const name of ORDER) {
      const b = this.bones.get(name);
      if (!b) continue;
      const r = s.rot.get(name);
      if (r) {
        const v = r.interp.evaluate(tt) as Float32Array;
        b.quaternion.set(v[0]!, v[1]!, v[2]!, v[3]!).normalize();
      }
      const p = s.pos.get(name);
      if (p) {
        const v = p.interp.evaluate(tt) as Float32Array;
        b.position.set(v[0]!, v[1]!, v[2]!);
      }
    }
    const d = this.debug;
    d.physicalPose = false;
    d.stageClip = STAGE_CLIP;
    d.additiveWeight = 0;
    d.comResidual = 0;
    if (this.bike) {
      for (let i = 0; i < 2; i++) {
        const sign = i === 0 ? 1 : -1;
        const grip = this.gripSockets[i];
        const sole = this.soleSockets[i];
        if (grip) {
          grip.updateWorldMatrix(true, false);
          grip.getWorldPosition(this.va);
          this.bike.frame.worldToLocal(this.va);
          d.gripErr[i] = this.va.distanceTo(this.vb.set(RIDER_PROFILE.grip.x, RIDER_PROFILE.grip.y, sign * RIDER_PROFILE.grip.z));
          grip.getWorldQuaternion(this.qa);
          this.bike.frame.getWorldQuaternion(this.qb).multiply(this.gripRestQ[i]!);
          d.gripAngleErr[i] = this.qa.angleTo(this.qb);
          d.wristErr[i] = +d.gripErr[i]!.toFixed(4);
          d.handOnGrip[i] = d.gripErr[i]! < 0.01;
        }
        if (sole) {
          sole.updateWorldMatrix(true, false);
          sole.getWorldPosition(this.va);
          this.bike.frame.worldToLocal(this.va);
          d.soleErr[i] = +this.va.distanceTo(this.vb.set(SOLE_ON_PEG.x, SOLE_ON_PEG.y, sign * SOLE_ON_PEG.z)).toFixed(4);
          d.ankleErr[i] = d.soleErr[i]!;
        }
      }
    }
    return true;
  }

  /** Slerp every bone's local pose toward the stage snapshot while the exit blend runs (simulated time; a frozen frame holds it). */
  private blendStage(f: RenderFrame): void {
    const B = this.stageBlend;
    if (!B.active) return;
    B.t += f.dt;
    const k = Math.min(1, B.t / STAGE_BLEND_S);
    this.debug.stageBlend = +(1 - k).toFixed(3);
    if (k >= 1) {
      B.active = false;
      return;
    }
    const w = 1 - k * k * (3 - 2 * k); // weight of the snapshot
    for (const name of ORDER) {
      const b = this.bones.get(name);
      if (!b) continue;
      b.quaternion.slerp(B.q.get(name)!, w);
      b.position.lerp(B.p.get(name)!, w);
    }
  }

  /** Same 80 ms pose lead as the procedural rider. */
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
    return Math.max(-1.5, Math.min(1.5, target + v * 0.08 * 1.15));
  }

  update(f: RenderFrame): void {
    this.pose(f);
    this.blendStage(f);
  }

  private pose(f: RenderFrame): void {
    if (f.cut) {
      this.landT = -1;
      this.pushT = -1;
    }
    if (f.ragdoll && f.ragdoll.length > 0) {
      if (!this.inRagdoll) {
        // Hand-over (round 9): snapshot the last posed pose — bone-local quaternions (frame
        // independent) and the pelvis' world pose (its parent changes frame) — before the
        // re-parent, then blend it out over 2–5 frames by the pelvis residual.
        const H = this.handover;
        for (const name of ORDER) {
          const b = this.bones.get(name);
          if (b) H.q.get(name)!.copy(b.quaternion);
        }
        const pelvis = this.bones.get('pelvis');
        if (pelvis && !f.cut) {
          pelvis.updateWorldMatrix(true, false);
          pelvis.getWorldQuaternion(H.pelvisQ);
          pelvis.getWorldPosition(H.pelvisP);
          const pb = f.ragdoll.find((b) => b.id === 'pelvis');
          const residual = pb ? Math.hypot(pb.pos.x - H.pelvisP.x, pb.pos.y - H.pelvisP.y) : 0;
          this.debug.ragdollResidual = +residual.toFixed(3);
          // Round 10: physics' crash chain is now a port of pose.ts (residual ≤ 1 cm on flat-test), so the hand-over is a fixed 2-frame slerp; anything longer read as the rider sliding into the ragdoll.
          const frames = residual < 0.25 ? 2 : 3;
          H.dur = frames / 60;
          H.t0 = f.tSim;
          H.active = true;
        } else H.active = false;
        this.root.add(this.scene);
        this.scene.position.set(0, 0, 0);
        this.inRagdoll = true;
      }
      this.poseRagdoll(f.ragdoll);
      this.blendHandover(f.tSim);
      return;
    }
    if (this.inRagdoll && this.bike) this.attach(this.bike);
    this.handover.active = false;
    // Exported clips contain translations on the shoulders as well as the pelvis. A clip is a
    // delta from this frame's base pose, never from the previous frame: accumulating a sub-mm
    // breathing key moved the shoulders 27 cm in a minute, even while handOnGrip stayed true.
    for (const [name, p] of this.restLocalP) this.bones.get(name)!.position.copy(p);
    this.debug.stageClip = null;
    if (this.stage && this.poseStage(f)) return;
    this.debug.physicalPose = f.riderBody.present && this.gripSockets.every(Boolean) && this.bike !== null;
    this.debug.stance.on = false;
    if (this.debug.physicalPose) {
      // Ask 51: the authored stances under the physics' drawn pose; the mass-map inverse of the physical COM only
      // where no drawn pose reaches the frame (a body injected without one — gltfRiderPhysical.test's E2 window).
      if (f.riderBody.drawn.present && this.stances) this.poseFromStance(f);
      else {
        this.poseFromChain(this.chainFromBody(f));
        this.debug.additiveWeight = 0;
      }
      return;
    }
    const sim = f.riderBody.present;
    // Round 13 (H2): with physics v2 the drawn rider IS the simulated one — `f.rider` is derived
    // by physics from `riderBody` (lean = body x through the pose table, crouch = height below the
    // servo target, torsoPitch = the body angle's lag behind its target), so the pose lag is the
    // body's real lag and nothing here extrapolates it. The 80 ms velocity lead only runs on v1 /
    // mock physics, where the pose fields are the servo target itself.
    const r = sim
      ? f.rider
      : {
          lean: this.spring('lean', f.rider.lean, f.dt, f.cut),
          torsoPitch: this.spring('torso', f.rider.torsoPitch, f.dt, f.cut),
          armExtend: this.spring('arm', f.rider.armExtend, f.dt, f.cut),
          crouch: this.spring('crouch', f.rider.crouch, f.dt, f.cut),
        };
    const c = solveChain(r, this.chain);
    this.poseFromChain(c);
    this.debug.additiveWeight = 1;
    for (const p of this.additiveBasis) {
      p.baseP.copy(p.bone.position);
      p.baseQ.copy(p.bone.quaternion);
    }
    // Additive clips. Breathing is the one motion with no state field: sampled at simulated time,
    // gated to a near-standstill with a neutral pose (deterministic, never wall-clock).
    const rest = Math.max(0, Math.min(1, (1.5 - f.speed) / 1.1)) * Math.max(0, 1 - Math.abs(r.lean) * 2) * Math.max(0, 1 - r.crouch * 2);
    if (rest > 0.01) this.additive('idle_breathe', f.tSim, rest, true);
    const land = this.clips.get('land_absorb');
    const ext = this.clips.get('extend');
    if (sim) {
      // Landing squash ← the suspension compression spike: the clip's absorb pose (`poseT`: frame 8 of
      // 30 authored, the 2.5 s hold of Astra's cycle) weighted by the summed compression above the ridden
      // sag — it deepens as the springs load and recovers as they rebound, on physics' own timeline.
      const load = (f.rear.grounded ? f.rear.compression : 0) + (f.front.grounded ? f.front.compression : 0);
      const wLand = Math.min(1, Math.max(0, (load - LAND.sag) / LAND.span)) * LAND.max;
      if (land && wLand > 0.005) this.additive('land_absorb', land.poseT, wLand, false);
      // Hop extension ← the rider body rising off the chassis (relative velocity along the bike's up
      // axis): the clip's extended pose (`poseT`) weighted by that speed.
      const wExt = Math.min(1, Math.max(0, (f.riderBody.relUp - EXTEND.v0) / EXTEND.span)) * EXTEND.max;
      if (ext && wExt > 0.005) this.additive('extend', ext.poseT, wExt, false);
      if (rest > 0.01 || wLand > 0.005 || wExt > 0.005) this.resolveContacts(c);
      return;
    }
    // v1 / mock physics fallback: the round-9 timed envelopes.
    if (f.justLanded && f.landImpulse > 1.5) {
      this.landT = f.tSim;
      this.landW = Math.min(0.9, 0.35 + 0.22 * (f.landImpulse - 1.5));
    }
    if (f.hopPhase === 'push' && this.lastHop !== 'push') this.pushT = f.tSim;
    this.lastHop = f.hopPhase;
    if (this.landT >= 0) {
      const t = f.tSim - this.landT;
      if (land && t < land.duration) this.additive('land_absorb', t, this.landW * Math.sin(Math.PI * Math.min(1, t / land.duration)), false);
      else this.landT = -1;
    }
    if (this.pushT >= 0) {
      const t = f.tSim - this.pushT;
      if (ext && t < ext.duration) this.additive('extend', t, 0.7 * Math.sin(Math.PI * Math.min(1, t / ext.duration)), false);
      else this.pushT = -1;
    }
    if (rest > 0.01 || this.landT >= 0 || this.pushT >= 0) this.resolveContacts(c);
  }

  /** The stance weight from the drawn table row at (pose, blend): how far the drawn hips are off the seat (`SEAT_RISE` note). */
  private stanceWeight(pose: 'seated' | 'back' | 'forward', b: number): number {
    if (pose === 'seated' || b <= 0) return 0;
    const N = DRAWN.seated, T = DRAWN[pose];
    if (pose === 'back') {
      const hipX = N.hipX + (T.hipX - N.hipX) * b;
      return Math.max(0, Math.min(1, (DRAWN_SEAT.rearX - hipX) / (DRAWN_SEAT.rearX - T.hipX)));
    }
    const rise = (T.hipY - N.hipY) * b - SEAT_RISE;
    return Math.max(0, Math.min(1, rise / (T.hipY - N.hipY - SEAT_RISE)));
  }

  /**
   * The stance base (see the header): seated → lean stance by the drawn blend, then toward the absorbed / extended
   * holds by the suspension load / body rise; the physical excursion on the pelvis (height) and the spine (torso lag);
   * the reach limit; then the contact IK with the blended clip's own elbow / knee as each pole.
   */
  private poseFromStance(f: RenderFrame): void {
    const S = this.stances!, d = f.riderBody.drawn, dbg = this.debug.stance;
    const target = S[d.pose === 'seated' ? 'seated' : d.pose];
    const b = d.pose === 'seated' ? 0 : Math.max(0, Math.min(1, d.blend));
    const w = this.stanceWeight(d.pose, b);
    const load = (f.rear.grounded ? f.rear.compression : 0) + (f.front.grounded ? f.front.compression : 0);
    const wLand = Math.min(1, Math.max(0, (load - LAND.sag) / LAND.span)) * LAND.max;
    const wExt = Math.min(1, Math.max(0, (f.riderBody.relUp - EXTEND.v0) / EXTEND.span)) * EXTEND.max;
    for (const name of ORDER) {
      const bone = this.bones.get(name);
      if (!bone) continue;
      bone.quaternion.copy(S.seated.q.get(name)!);
      bone.position.copy(S.seated.p.get(name)!);
      if (w > 0) {
        bone.quaternion.slerp(target.q.get(name)!, w);
        bone.position.lerp(target.p.get(name)!, w);
      }
      if (wLand > 0.005) {
        bone.quaternion.slerp(S.land.q.get(name)!, wLand);
        bone.position.lerp(S.land.p.get(name)!, wLand);
      }
      if (wExt > 0.005) {
        bone.quaternion.slerp(S.extend.q.get(name)!, wExt);
        bone.position.lerp(S.extend.p.get(name)!, wExt);
      }
    }
    const pelvis = this.bones.get('pelvis')!;
    this.debug.comResidual = 0; // the drawn body is not the physical body (R9's split): no COM to land on
    dbg.on = true;
    dbg.pose = d.pose;
    dbg.blend = w;
    dbg.lean = b;
    dbg.land = +wLand.toFixed(3);
    dbg.extend = +wExt.toFixed(3);
    for (const p of this.additiveBasis) {
      p.baseP.copy(p.bone.position);
      p.baseQ.copy(p.bone.quaternion);
    }
    // The physical body's excursion against R9's drawn table at this blend: its height below / above (the landing
    // sit, the hop) on the pelvis along the bike's up; its angle behind / ahead (the whip) on the spine about the
    // bike's z — clamped, and below limited to what keeps every socket in reach.
    const T = DRAWN[d.pose], N = DRAWN.seated;
    const dy = Math.max(-EXCURSION.dy, Math.min(EXCURSION.dy, d.hipY - (N.hipY + (T.hipY - N.hipY) * b)));
    const lag = Math.max(-EXCURSION.lag, Math.min(EXCURSION.lag, d.torso - (N.torso + (T.torso - N.torso) * b) * (Math.PI / 180)));
    dbg.dy = +dy.toFixed(4);
    dbg.lag = +lag.toFixed(4);
    if (dy !== 0) pelvis.position.add(this.vb.set(0, 1, 0).transformDirection(this.armInv).multiplyScalar(dy)); // file up → the pelvis parent's frame
    if (lag !== 0) {
      this.refreshWorldQ();
      this.qa.setFromAxisAngle(Z_AXIS, lag).multiply(this.worldQ.get('spine')!);
      this.setWorld('spine', this.qa);
    }
    // Contact targets (bike frame): the grips and the ankle-on-peg points are the profile's; the poles come from the
    // blended pose itself once the reach limit has settled it.
    const c = this.chain;
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? 1 : -1;
      c.hand[i]!.set(RIDER_PROFILE.grip.x, RIDER_PROFILE.grip.y, sign * RIDER_PROFILE.grip.z);
      c.ankle[i]!.set(RIDER_PROFILE.ankle.x, RIDER_PROFILE.ankle.y, sign * RIDER_PROFILE.ankle.z);
    }
    this.debug.additiveWeight = 1; // the excursion's surviving share (`limitAdditiveToReach` lowers it only when it must)
    this.limitAdditiveToReach(c);
    dbg.limit = this.debug.additiveWeight;
    const bike = this.bike!;
    for (let i = 0; i < 2; i++) {
      const sd = i === 0 ? 'L' : 'R';
      for (const [bone, out] of [[`upperArm.${sd}`, c.shoulder[i]!], [`forearm.${sd}`, c.elbow[i]!], [`thigh.${sd}`, c.hip[i]!], [`shin.${sd}`, c.knee[i]!]] as const) {
        const o = this.bones.get(bone)!;
        o.updateWorldMatrix(true, false);
        out.setFromMatrixPosition(o.matrixWorld);
        bike.frame.worldToLocal(out);
      }
    }
    this.refreshWorldQ();
    for (let i = 0; i < 2; i++) {
      this.solveArm(c, i, true);
      this.solveLeg(c, i);
    }
  }

  private chainFromBody(f: RenderFrame): Chain {
    const bike = this.bike!;
    const cosine = Math.cos(f.bikeAngle), sine = Math.sin(f.bikeAngle);
    this.va.set(f.bikeX + f.riderBody.relX * cosine - f.riderBody.relY * sine,
      f.bikeY + f.riderBody.relX * sine + f.riderBody.relY * cosine, 0);
    bike.frame.worldToLocal(this.va);
    const e = bike.frame.matrixWorld.elements;
    const frameAngle = Math.atan2(e[1]!, e[0]!);
    const relative = f.riderBody.relAngle + f.bikeAngle - frameAngle;
    const torso = RIDER_TORSO_REST + Math.atan2(Math.sin(relative), Math.cos(relative));
    const p = riderRigFromCOM(this.va.x, this.va.y, torso, this.physicalRig);
    const c = this.chain;
    c.hips.set(p.hips.x, p.hips.y, 0);
    c.shoulders.set(p.shoulders.x, p.shoulders.y, 0);
    c.head.set(p.head.x, p.head.y, 0);
    c.torsoAngle = Math.PI / 2 - p.torsoAngle;
    c.headAngle = p.headAngle - Math.PI / 2;
    c.pelvisBottom.set(p.hips.x - .18 * Math.cos(torso), p.hips.y - .18 * Math.sin(torso), 0);
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? 1 : -1;
      c.shoulder[i]!.set(p.shoulders.x, p.shoulders.y, sign * RIDER_PROFILE.shoulderHalf);
      c.hip[i]!.set(p.hips.x, p.hips.y, sign * RIDER_PROFILE.hipHalf);
      c.elbow[i]!.set(p.elbow.x, p.elbow.y, sign * p.elbow.z);
      c.knee[i]!.set(p.knee.x, p.knee.y, sign * p.knee.z);
      c.hand[i]!.set(p.grip.x, p.grip.y, sign * p.grip.z);
      c.ankle[i]!.set(p.ankle.x, p.ankle.y, sign * p.ankle.z);
    }
    this.debug.comResidual = p.residual;
    return c;
  }

  /** World (file-space) rotation for a bone → local, in hierarchy order. */
  private setWorld(name: string, qWorld: THREE.Quaternion): void {
    const b = this.bones.get(name);
    if (!b) return;
    const parent = this.parentOf.get(name) ?? null;
    const pq = parent ? this.worldQ.get(parent) : this.armQ;
    let wq = this.worldQ.get(name);
    if (!wq) {
      wq = new THREE.Quaternion();
      this.worldQ.set(name, wq);
    }
    wq.copy(qWorld);
    b.quaternion.copy(pq ?? this.ID).invert().multiply(qWorld);
  }

  private aim(name: BoneName, dir: THREE.Vector3): void {
    const d0 = this.d0.get(name);
    const q0 = this.q0.get(name);
    if (!d0 || !q0) return;
    this.va.copy(dir).normalize();
    this.qa.setFromUnitVectors(d0, this.va).multiply(q0);
    this.setWorld(name, this.qa);
  }

  /** Bone keeps its rest rotation relative to its parent's current delta. */
  private rigid(name: BoneName): void {
    const parent = this.parentOf.get(name);
    const q0 = this.q0.get(name);
    if (!parent || !q0) return;
    const pw = this.worldQ.get(parent);
    const p0 = this.q0.get(parent);
    if (!pw || !p0) return;
    this.qb.copy(pw).multiply(this.qc.copy(p0).invert()).multiply(q0);
    this.setWorld(name, this.qb);
  }

  private setPelvisPosition(px: number, py: number, pz: number): void {
    const pelvis = this.bones.get('pelvis');
    if (!pelvis) return;
    this.vb.set(px, py, pz).applyMatrix4(this.armInv);
    pelvis.position.copy(this.vb);
  }

  private poseFromChain(c: Chain): void {
    const torso = this.va.set(Math.sin(c.torsoAngle), Math.cos(c.torsoAngle), 0);
    const tx = torso.x;
    const ty = torso.y;
    // Pelvis head sits 0.02 below the hip joint along the torso; file frame = axle + shift.
    this.setPelvisPosition(c.hips.x + SHIFT - 0.02 * tx, c.hips.y - 0.02 * ty, 0);
    this.aim('pelvis', this.vb.set(tx, ty, 0));
    this.aim('spine', this.vb.set(tx, ty, 0));
    this.aim('chest', this.vb.set(tx, ty, 0));
    const ha = -c.headAngle; // chain headAngle is the group rotation (−headA)
    this.aim('neck', this.vb.set(Math.sin(ha), Math.cos(ha), 0));
    this.aim('head', this.vb.set(Math.sin(ha), Math.cos(ha), 0));
    for (let i = 0; i < 2; i++) {
      this.solveArm(c, i);
      this.solveLeg(c, i);
    }
  }

  /** Fixed-length leg IK from the posed hip to the peg, with the chain's knee as its pole. */
  private solveLeg(c: Chain, i: number): void {
    const s = i === 0 ? 'L' : 'R';
    const thigh = this.bones.get(`thigh.${s}`);
    if (thigh && this.bike) {
      thigh.updateWorldMatrix(true, false);
      const hip = this.vc.setFromMatrixPosition(thigh.matrixWorld);
      this.bike.frame.worldToLocal(hip);
      const ankle = c.ankle[i]!;
      const [l1, l2] = this.legLen[i]!;
      const d = Math.max(1e-4, hip.distanceTo(ankle));
      const dir = this.vd.subVectors(ankle, hip).multiplyScalar(1 / d);
      const pole = this.ve.subVectors(c.knee[i]!, hip);
      pole.addScaledVector(dir, -pole.dot(dir));
      if (pole.lengthSq() < 1e-6) pole.set(1, 0.2, i === 0 ? -0.15 : 0.15);
      pole.normalize();
      const cosA = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
      const knee = this.vf.copy(hip).addScaledVector(dir, l1 * cosA).addScaledVector(pole, l1 * Math.sqrt(Math.max(0, 1 - cosA * cosA)));
      this.aim(`thigh.${s}`, this.vb.subVectors(knee, hip));
      this.aim(`shin.${s}`, this.vb.subVectors(ankle, knee));
      this.debug.legStretch[i] = +(d / (l1 + l2)).toFixed(3);
    } else {
      this.aim(`thigh.${s}`, this.vb.subVectors(c.knee[i]!, c.hip[i]!));
      this.aim(`shin.${s}`, this.vb.subVectors(c.ankle[i]!, c.knee[i]!));
    }
    // The foot's orientation belongs to its contact with the peg, including during landing.
    this.setWorld(`foot.${s}`, this.q0.get(`foot.${s}`)!);
    const foot = this.bones.get(`foot.${s}`);
    if (foot && this.bike) {
      foot.updateWorldMatrix(true, false);
      this.vc.setFromMatrixPosition(foot.matrixWorld);
      this.bike.frame.worldToLocal(this.vc);
      this.debug.ankleErr[i] = +this.vc.distanceTo(c.ankle[i]!).toFixed(6);
    }
  }

  /**
   * One arm from the chain: shoulder rigid on the chest, two-bone IK to the grip, hand rigid.
   * Round 14: also re-run after the additive clips (`refreshWorldQ` first) so the landing squash
   * and hop extension move the torso and legs while the wrists stay on the grips.
   */
  private solveArm(c: Chain, i: number, keepShoulder = false): void {
    {
      const s = i === 0 ? 'L' : 'R';
      // Ask 51: on the stance path the shoulder is the blended clip's own (its world rotation is current from
      // `refreshWorldQ`); the chain paths keep it rigid on the chest.
      if (!keepShoulder) this.rigid(`shoulder.${s}` as BoneName);
      // Arms (round 9): two-bone IK in the RIG's bone lengths from the rig's posed shoulder
      // joint to the chain's grip point, with the chain's elbow as the pole — the wrist lands
      // on the grip whenever it is reachable (round 8 aimed the fixed-length bones along the
      // chain's segments, which left the wrist up to 3.5 cm off at mid-lean).
      const ua = this.bones.get(`upperArm.${s}`);
      // Hold the palm socket on the bar; the wrist is behind/above it, not at the grip center.
      const grip = this.wristTarget.copy(c.hand[i]!).sub(this.gripOffsets[i]!);
      let S: THREE.Vector3 | null = null;
      if (ua && this.bike) {
        ua.updateWorldMatrix(true, false);
        S = this.vc.setFromMatrixPosition(ua.matrixWorld);
        this.bike.frame.worldToLocal(S); // axle coords (the chain's frame)
      }
      if (S) {
        const [L1, L2] = this.armLen[i]!;
        const d = Math.max(1e-4, S.distanceTo(grip));
        const dir = this.vd.subVectors(grip, S).multiplyScalar(1 / d);
        // Pole: the chain elbow's component perpendicular to shoulder→grip.
        const pole = this.ve.subVectors(c.elbow[i]!, S);
        pole.addScaledVector(dir, -pole.dot(dir));
        if (pole.lengthSq() < 1e-6) pole.set(0, 1, i === 0 ? 0.3 : -0.3);
        pole.normalize();
        const reach = L1 + L2;
        const cosA = d >= reach ? 1 : Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
        const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
        const elbow = this.vf.copy(S).addScaledVector(dir, L1 * cosA).addScaledVector(pole, L1 * sinA);
        this.aim(`upperArm.${s}` as BoneName, this.vb.subVectors(elbow, S));
        this.aim(`forearm.${s}` as BoneName, this.vb.subVectors(grip, elbow));
        const err = d > reach ? d - reach : 0;
        this.debug.wristErr[i] = +err.toFixed(4);
        this.debug.handOnGrip[i] = err < 0.01;
        this.debug.armStretch[i] = +(d / reach).toFixed(3);
      } else {
        this.aim(`upperArm.${s}` as BoneName, this.vb.subVectors(c.elbow[i]!, c.shoulder[i]!));
        this.aim(`forearm.${s}` as BoneName, this.vb.subVectors(c.hand[i]!, c.elbow[i]!));
      }
      const socket = this.gripSockets[i];
      if (socket) this.setWorld(`hand.${s}`, this.q0.get(`hand.${s}`)!);
      else this.rigid(`hand.${s}` as BoneName);
      if (socket && this.bike) {
        socket.updateWorldMatrix(true, false);
        socket.getWorldPosition(this.va);
        this.bike.frame.worldToLocal(this.va);
        this.debug.gripErr[i] = this.va.distanceTo(c.hand[i]!);
        socket.getWorldQuaternion(this.qa);
        this.bike.frame.getWorldQuaternion(this.qb).multiply(this.gripRestQ[i]!);
        this.debug.gripAngleErr[i] = this.qa.angleTo(this.qb);
        this.debug.handOnGrip[i] = this.debug.gripErr[i]! < .001 && this.debug.gripAngleErr[i]! < .01;
      } else {
        this.debug.gripErr[i] = this.debug.wristErr[i]!;
        this.debug.gripAngleErr[i] = 0;
      }
    }
  }

  /** File-space world rotations of every chain bone from the bones' current locals (after additive clips moved them). */
  private refreshWorldQ(): void {
    for (const name of ORDER) {
      const b = this.bones.get(name);
      if (!b) continue;
      const parent = this.parentOf.get(name) ?? null;
      const pq = parent ? this.worldQ.get(parent) : this.armQ;
      let wq = this.worldQ.get(name);
      if (!wq) {
        wq = new THREE.Quaternion();
        this.worldQ.set(name, wq);
      }
      wq.copy(pq ?? this.ID).multiply(b.quaternion);
    }
  }

  /** After the additive clips, re-establish both pairs of contacts from the moved torso/pelvis. */
  private resolveContacts(c: Chain): void {
    this.limitAdditiveToReach(c);
    this.refreshWorldQ();
    for (let i = 0; i < 2; i++) {
      this.solveArm(c, i);
      this.solveLeg(c, i);
    }
  }

  /** A hop/landing delta can put a limb outside its reach. Reduce that cosmetic delta toward
   * the physics-driven base pose, instead of translating the rider away from the simulated body
   * or stretching a limb. Reachable motion is unchanged; the bounded search reuses all storage. */
  private limitAdditiveToReach(c: Chain): void {
    if (this.contactsReachable(c)) return;
    for (const p of this.additiveBasis) {
      p.targetP.copy(p.bone.position);
      p.targetQ.copy(p.bone.quaternion);
    }
    let lo = 0;
    let hi = 1;
    for (let pass = 0; pass < 10; pass++) {
      const weight = (lo + hi) / 2;
      this.blendAdditivePose(weight);
      if (this.contactsReachable(c)) lo = weight;
      else hi = weight;
    }
    this.blendAdditivePose(lo);
    this.debug.additiveWeight = lo;
  }

  private blendAdditivePose(weight: number): void {
    for (const p of this.additiveBasis) {
      p.bone.position.lerpVectors(p.baseP, p.targetP, weight);
      p.bone.quaternion.slerpQuaternions(p.baseQ, p.targetQ, weight);
    }
  }

  private contactsReachable(c: Chain): boolean {
    if (!this.bike) return true;
    for (let limb = 0; limb < 4; limb++) {
      const i = limb % 2;
      const arm = limb < 2;
      const bone = this.bones.get(CONTACT_ROOTS[limb]!);
      if (!bone) continue;
      bone.updateWorldMatrix(true, false);
      this.va.setFromMatrixPosition(bone.matrixWorld);
      this.bike.frame.worldToLocal(this.va);
      const [a, b] = (arm ? this.armLen : this.legLen)[i]!;
      const target = arm ? this.wristTarget.copy(c.hand[i]!).sub(this.gripOffsets[i]!) : c.ankle[i]!;
      const d = this.va.distanceTo(target);
      if (d > (a + b) * 0.995 || d < Math.abs(a - b) + 0.02) return false;
    }
    return true;
  }

  /**
   * Blend a clip's bone-local delta (from its selected reference) onto the current pose. Never
   * the arm chain (`shoulder` → `hand`) — the IK has just put the wrists on the grips, and the
   * landing squash at its 0.9 weight rotated the shoulders enough to lift both hands 18 cm off
   * them for the frames around a hard landing (b1 golden t720, full and LOD rider alike); the
   * torso / legs / head still take the clip.
   */
  private additive(name: string, t: number, w: number, loop: boolean): void {
    const s = this.clips.get(name);
    if (!s || w <= 0) return;
    const tt = s.from + (loop ? t % s.duration : Math.min(t, s.duration - 1e-4));
    for (const [node, r] of s.rot) {
      if (ARM_CHAIN.test(node)) continue;
      const b = this.bones.get(node);
      if (!b) continue;
      const v = r.interp.evaluate(tt) as Float32Array;
      // Meshopt-quantized samples need unit length before inversion/multiplication; otherwise
      // a rotation layer subtly scales the skeleton even with every bone.scale fixed at one.
      r.out.set(v[0]!, v[1]!, v[2]!, v[3]!).normalize();
      // delta = rest⁻¹ · clip, scaled by w, applied in the bone's own space.
      this.qa.copy(r.rest).invert().multiply(r.out);
      this.qb.copy(this.ID).slerp(this.qa, w);
      b.quaternion.multiply(this.qb);
    }
    for (const [node, p] of s.pos) {
      // Joint sockets stay at their bind offsets. Exported full-pose clips contain non-root
      // translations and per-clip quantization differences; layering those would change bone
      // lengths. Only the root carries a positional layer; limb contacts are solved afterward.
      if (node !== 'pelvis') continue;
      const b = this.bones.get(node);
      if (!b) continue;
      const v = p.interp.evaluate(tt) as Float32Array;
      p.out.set(v[0]!, v[1]!, v[2]!).sub(p.rest).multiplyScalar(w);
      b.position.add(p.out);
    }
  }

  /** Slerp every bone from the hand-over snapshot toward the ragdoll pose while the blend runs. */
  private blendHandover(tSim: number): void {
    const H = this.handover;
    if (!H.active) return;
    const k = H.dur > 0 ? Math.min(1, (tSim - H.t0) / H.dur) : 1;
    this.debug.ragdollBlend = +k.toFixed(3);
    if (k >= 1) {
      H.active = false;
      return;
    }
    const w = 1 - k * k * (3 - 2 * k); // weight of the snapshot
    const pelvis = this.bones.get('pelvis');
    for (const name of ORDER) {
      const b = this.bones.get(name);
      if (!b || b === pelvis) continue;
      b.quaternion.slerp(H.q.get(name)!, w);
    }
    if (pelvis && pelvis.parent) {
      // The pelvis' parent changed frame (bike → world): blend in world space.
      pelvis.parent.updateWorldMatrix(true, false);
      pelvis.parent.getWorldQuaternion(this.qc);
      this.qa.copy(this.qc).multiply(pelvis.quaternion); // current world
      this.qa.slerp(H.pelvisQ, w);
      pelvis.quaternion.copy(this.qc).invert().multiply(this.qa);
      this.va.copy(pelvis.position).applyMatrix4(pelvis.parent.matrixWorld); // current world position
      this.va.lerp(H.pelvisP, w);
      pelvis.position.copy(pelvis.parent.worldToLocal(this.va));
    }
  }

  private readonly ragTargets = new Map<string, THREE.Vector3 | 'rigid' | 'rest'>();

  private poseRagdoll(bodies: RagdollBody[]): void {
    // Collect per-bone targets first, then apply in hierarchy order (parents before children).
    const T = this.ragTargets;
    T.clear();
    const up = (a: number): THREE.Vector3 => new THREE.Vector3(-Math.sin(a), Math.cos(a), 0);
    const down = (a: number): THREE.Vector3 => new THREE.Vector3(Math.sin(a), -Math.cos(a), 0);
    for (const bd of bodies) {
      switch (bd.id) {
        case 'pelvis': {
          const u = up(bd.angle);
          this.setPelvisPosition(bd.pos.x + u.x * 0.08, bd.pos.y + u.y * 0.08, 0);
          T.set('pelvis', u);
          break;
        }
        case 'torso':
          T.set('spine', up(bd.angle));
          T.set('chest', up(bd.angle));
          T.set('shoulder.L', 'rigid');
          T.set('shoulder.R', 'rigid');
          break;
        case 'head':
          T.set('neck', up(bd.angle));
          T.set('head', up(bd.angle));
          break;
        case 'upperArm':
          T.set('upperArm.L', down(bd.angle));
          T.set('upperArm.R', down(bd.angle));
          break;
        case 'forearm':
          T.set('forearm.L', down(bd.angle));
          T.set('forearm.R', down(bd.angle));
          T.set('hand.L', 'rigid');
          T.set('hand.R', 'rigid');
          break;
        case 'thigh':
          T.set('thigh.L', down(bd.angle));
          T.set('thigh.R', down(bd.angle));
          break;
        case 'shin':
          T.set('shin.L', down(bd.angle));
          T.set('shin.R', down(bd.angle));
          T.set('foot.L', 'rigid');
          T.set('foot.R', 'rigid');
          break;
      }
    }
    for (const name of ORDER) {
      const t = T.get(name);
      if (!t) continue;
      if (t === 'rigid') this.rigid(name);
      else if (t === 'rest') this.setWorld(name, this.q0.get(name)!);
      else this.aim(name, t);
    }
  }

  dispose(): void {
    for (const m of this.materials) m.dispose();
  }
}
