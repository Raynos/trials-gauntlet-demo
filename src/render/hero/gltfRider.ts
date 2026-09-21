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
import { conditionSleeveSkin } from './sleeveSkin';
import { clipWindows, type ClipWindow } from './clipAliases';

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
  private readonly releaseSleeveGeometry: (() => void)[] = [];
  private readonly sleeveGeometry: { mesh: THREE.SkinnedMesh; authored: THREE.BufferGeometry; riding: THREE.BufferGeometry }[] = [];
  readonly debug = { armStretch: [1, 1], legStretch: [1, 1], handOnGrip: [true, true], footOnPeg: [true, true], wristErr: [0, 0], gripErr: [0, 0], gripAngleErr: [0, 0], ankleErr: [0, 0], armLen: [0, 0], additiveWeight: 1, physicalPose: false, comResidual: 0, ragdollResidual: -1, ragdollBlend: 0, ragdollDetail: [] as string[], bones: 0, clips: [] as string[], stageClip: null as string | null, stageBlend: 0, soleErr: [0, 0], stance: { on: false, pose: 'seated' as 'seated' | 'back' | 'forward', blend: 0, lean: 0, land: 0, extend: 0, dy: 0, lag: 0, limit: 1 } };
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
  /** Authored sleeve roll is retained while IK owns every joint position and segment length. */
  private readonly sleeveReferences = new Map<string, [THREE.Quaternion, THREE.Quaternion, THREE.Quaternion]>();
  private readonly sleeveAxis = new THREE.Vector3();
  private readonly sleeveCross = new THREE.Vector3();
  private readonly sleeveNormalRef = new THREE.Vector3();
  private readonly sleeveNormalTarget = new THREE.Vector3();
  private readonly sleeveProjectedTarget = new THREE.Vector3();
  private sleeveBlend = 0;
  private sleevePose = 1;
  private useSleeveRoll = false;
  /** The 2D ragdoll retains the visible limb's lateral articulation and twist at release. */
  private readonly released = new Map<string, { direction: THREE.Vector3; world: THREE.Quaternion; local: THREE.Quaternion; planarOffset: number }>();
  /** Ask 51: the garage stage (`setStage`) and the bone-local snapshot the physics pose blends out of on leaving it. */
  private stage = false;
  private readonly stageBlend = { q: new Map<string, THREE.Quaternion>(), p: new Map<string, THREE.Vector3>(), t: 0, active: false };
  private readonly soleSockets: (THREE.Object3D | null)[] = [null, null];
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
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
        const mesh = m as THREE.SkinnedMesh, authored = mesh.geometry;
        this.releaseSleeveGeometry.push(conditionSleeveSkin(mesh));
        this.sleeveGeometry.push({ mesh, authored, riding: mesh.geometry });
      }
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
      this.released.set(name, { direction: new THREE.Vector3(), world: new THREE.Quaternion(), local: new THREE.Quaternion(), planarOffset: 0 });
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
    const referenceScene = cloneSkeleton(gltf.scene);
    const referenceBones = new Map<string, THREE.Bone>();
    referenceScene.traverse(o => { if ((o as THREE.Bone).isBone) referenceBones.set(boneName(o.name), o as THREE.Bone); });
    const mixer = new THREE.AnimationMixer(referenceScene);
    for (const [index, clipName] of ['sit_cruise', 'hang_back', 'forward_attack'].entries()) {
      const clip = byName.get(clipName);
      if (!clip) continue;
      mixer.stopAllAction();
      mixer.clipAction(clip).play(); mixer.setTime(1.75);
      referenceScene.updateMatrixWorld(true);
      for (const name of ['upperArm.L', 'upperArm.R', 'forearm.L', 'forearm.R']) {
        const bone = referenceBones.get(name);
        if (!bone) continue;
        const refs = this.sleeveReferences.get(name) ?? [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
        bone.getWorldQuaternion(refs[index]!).normalize();
        this.sleeveReferences.set(name, refs);
      }
    }
    mixer.stopAllAction(); mixer.uncacheRoot(referenceScene);
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
    for (const item of this.sleeveGeometry) item.mesh.geometry = on ? item.authored : item.riding;
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
          d.footOnPeg[i] = d.soleErr[i]! < .001;
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
      this.stageBlend.active = false;
      this.debug.stageBlend = 0;
      this.debug.physicalPose = false;
      this.debug.stance.on = false;
      this.debug.handOnGrip.fill(false);
      this.debug.footOnPeg.fill(false);
      if (!this.inRagdoll) {
        // The frozen physical body is the actual spawn pose, including this tick's motion.
        // Reconstruct it before detaching; the previous frame carried by the moving bike is
        // not a valid spawn endpoint. No temporal pose blend hides a geometry discontinuity.
        if (f.riderBody.present && this.bike) this.poseFromChain(this.chainFromBody(f));
        this.scene.updateWorldMatrix(true, true);
        for (const name of ORDER) {
          const bone = this.bones.get(name), saved = this.released.get(name)!;
          if (!bone) continue;
          bone.getWorldQuaternion(saved.world);
          saved.direction.set(0, 1, 0).applyQuaternion(saved.world);
          saved.local.copy(bone.quaternion);
          const bodyId = name === 'spine' || name === 'chest' ? 'torso'
            : name === 'neck' ? 'head' : name.split('.')[0];
          const body = f.ragdoll.find(b => b.id === bodyId);
          // The real GLB's hip socket is offset from the planar pelvis center.
          // Preserve that articulated direction at release, then follow the
          // ragdoll body's angular displacement, rather than snapping it onto
          // the center-to-center segment's slightly different absolute angle.
          const down = /^(upperArm|forearm|thigh|shin)\./.test(name);
          saved.planarOffset = body ? Math.atan2(saved.direction.y, saved.direction.x)
            - (body.angle + (down ? -Math.PI / 2 : Math.PI / 2)) : 0;
        }
        const pelvis = this.bones.get('pelvis');
        if (pelvis) {
          pelvis.getWorldPosition(this.va);
          const pb = f.ragdoll.find(b => b.id === 'pelvis');
          this.debug.ragdollResidual = pb ? Math.hypot(pb.pos.x - Math.sin(pb.angle) * .08 - this.va.x, pb.pos.y + Math.cos(pb.angle) * .08 - this.va.y) : 0;
        }
        this.debug.ragdollBlend = 1;
        this.root.add(this.scene);
        this.scene.position.set(0, 0, 0);
        this.inRagdoll = true;
      }
      this.poseRagdoll(f.ragdoll);
      this.debug.handOnGrip.fill(false);
      this.debug.footOnPeg.fill(false);
      return;
    }
    if (this.inRagdoll && this.bike) this.attach(this.bike);
    // Exported clips contain translations on the shoulders as well as the pelvis. A clip is a
    // delta from this frame's base pose, never from the previous frame: accumulating a sub-mm
    // breathing key moved the shoulders 27 cm in a minute, even while handOnGrip stayed true.
    for (const [name, p] of this.restLocalP) this.bones.get(name)!.position.copy(p);
    this.debug.stageClip = null;
    if (this.stage && this.poseStage(f)) return;
    this.debug.physicalPose = f.riderBody.present && this.gripSockets.every(Boolean) && this.bike !== null;
    this.debug.stance.on = false;
    if (this.debug.physicalPose) {
      // The simulated COM and angle define the visible anatomy, contacts and sensors.
      // No authored-pose dead zone or draw-only reach clamp hides physical motion.
      this.poseFromChain(this.chainFromBody(f));
      this.debug.additiveWeight = 0;
      const lean = f.rider.lean;
      Object.assign(this.debug.stance, { on: true, pose: lean < 0 ? 'back' : lean > 0 ? 'forward' : 'seated',
        blend: Math.abs(lean), lean: Math.abs(lean), land: 0, extend: 0, dy: 0, lag: 0, limit: 1 });
      return;
    }
    this.useSleeveRoll = false;
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
    this.useSleeveRoll = true;
    const neutral = RIDER_PROFILE.poses[1];
    this.sleevePose = p.hips.x < neutral.hipX ? 1 : 2;
    this.sleeveBlend = Math.max(0, Math.min(1, this.sleevePose === 1
      ? (neutral.hipX - p.hips.x) / (neutral.hipX - RIDER_PROFILE.poses[0].hipX)
      : (neutral.torso - p.torsoAngle * 180 / Math.PI) / (neutral.torso - RIDER_PROFILE.poses[2].torso)));
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
    const refs = this.useSleeveRoll ? this.sleeveReferences.get(name) : null;
    if (refs) {
      this.qb.copy(refs[0]).slerp(refs[this.sleevePose]!, this.sleeveBlend);
      this.sleeveAxis.set(0, 1, 0).applyQuaternion(this.qb);
      this.qa.setFromUnitVectors(this.sleeveAxis, this.va);
      // A limb's flexion plane, not an independent shortest swing for each segment,
      // transports the authored sleeve roll. Independent swings can corkscrew the elbow.
      this.sleeveAxis.copy(this.sleeveNormalRef).applyQuaternion(this.qa);
      this.sleeveAxis.addScaledVector(this.va, -this.sleeveAxis.dot(this.va)).normalize();
      this.sleeveProjectedTarget.copy(this.sleeveNormalTarget).addScaledVector(this.va, -this.sleeveNormalTarget.dot(this.va)).normalize();
      const sine = this.va.dot(this.sleeveCross.crossVectors(this.sleeveAxis, this.sleeveProjectedTarget));
      const cosine = this.sleeveAxis.dot(this.sleeveProjectedTarget);
      // Plane normals have no preferred sign. A bounded, continuous alignment
      // correction preserves the authored roll and vanishes at the ambiguous
      // perpendicular case; atan2 would turn the sleeve by almost half a turn.
      const angle = sine * cosine;
      this.qa.premultiply(this.qc.setFromAxisAngle(this.va, angle)).multiply(this.qb);
    } else this.qa.setFromUnitVectors(d0, this.va).multiply(q0);
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
      const sole = this.soleSockets[i];
      if (sole) {
        sole.updateWorldMatrix(true, false);
        sole.getWorldPosition(this.va);
        this.bike.frame.worldToLocal(this.va);
        this.debug.soleErr[i] = this.va.distanceTo(this.vb.set(SOLE_ON_PEG.x, SOLE_ON_PEG.y, (i === 0 ? 1 : -1) * SOLE_ON_PEG.z));
        this.debug.footOnPeg[i] = this.debug.soleErr[i]! < .001;
      } else this.debug.footOnPeg[i] = this.debug.ankleErr[i]! < .001;
    }
  }

  /**
   * One arm from the chain: shoulder rigid on the chest, two-bone IK to the grip, hand rigid.
   * Round 14: also re-run after the additive clips (`refreshWorldQ` first) so the landing squash
   * and hop extension move the torso and legs while the wrists stay on the grips.
   */
  private solveArm(c: Chain, i: number): void {
    {
      const s = i === 0 ? 'L' : 'R';
      this.rigid(`shoulder.${s}` as BoneName);
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
        if (pole.lengthSq() < 1e-6) pole.set(0.3, -1, i === 0 ? 0.15 : -0.15);
        pole.normalize();
        const reach = L1 + L2;
        const cosA = d >= reach ? 1 : Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
        const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
        const elbow = this.vf.copy(S).addScaledVector(dir, L1 * cosA).addScaledVector(pole, L1 * sinA);
        if (this.useSleeveRoll && this.sleeveReferences.has(`upperArm.${s}`) && this.sleeveReferences.has(`forearm.${s}`)) {
          const upper = this.sleeveReferences.get(`upperArm.${s}`)!;
          const lower = this.sleeveReferences.get(`forearm.${s}`)!;
          this.qa.copy(upper[0]).slerp(upper[this.sleevePose]!, this.sleeveBlend);
          this.qb.copy(lower[0]).slerp(lower[this.sleevePose]!, this.sleeveBlend);
          this.sleeveNormalRef.crossVectors(this.sleeveAxis.set(0, 1, 0).applyQuaternion(this.qa), this.sleeveCross.set(0, 1, 0).applyQuaternion(this.qb)).normalize();
          this.sleeveNormalTarget.crossVectors(this.sleeveAxis.subVectors(elbow, S), this.sleeveCross.subVectors(grip, elbow)).normalize();
        }
        this.aim(`upperArm.${s}` as BoneName, this.vb.subVectors(elbow, S));
        this.aim(`forearm.${s}` as BoneName, this.vb.subVectors(grip, elbow));
        const err = Math.max(0, d - reach, Math.abs(L1 - L2) - d);
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

  /** Follow a simulated planar angle while retaining its actual released lateral component.
   * Rotate from the captured orientation, preserving twist instead of choosing a new bind-pose
   * solution. At the spawn angle this is exactly the riding orientation, without interpolation.
   */
  private aimReleased(name: BoneName, planar: THREE.Vector3): void {
    const saved = this.released.get(name)!;
    const z = saved.direction.z;
    const angle = Math.atan2(planar.y, planar.x) + saved.planarOffset;
    planar.set(Math.cos(angle), Math.sin(angle), 0);
    planar.normalize().multiplyScalar(Math.sqrt(Math.max(0, 1 - z * z))).setZ(z);
    this.qa.setFromUnitVectors(saved.direction, planar).multiply(saved.world);
    this.setWorld(name, this.qa);
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
      if (t === 'rigid') {
        // Hands/feet leave their sockets with their current orientation relative to the limb.
        const parent = this.parentOf.get(name), saved = this.released.get(name)!;
        const parentWorld = parent ? this.worldQ.get(parent) : this.armQ;
        this.setWorld(name, this.qa.copy(parentWorld ?? this.ID).multiply(saved.local));
      }
      else if (t === 'rest') this.setWorld(name, this.q0.get(name)!);
      else this.aimReleased(name, t);
    }
  }

  dispose(): void {
    for (const m of this.materials) m.dispose();
    for (const release of this.releaseSleeveGeometry) release();
  }
}
