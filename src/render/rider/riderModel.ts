/**
 * Rider: full-gear motocross rider (helmet + visor + peak + chin bar, jersey
 * with chest plate and shoulder pads, elbow pads, gloves, pants, knee/shin
 * armour, boots), posed from `RiderPose` with two-bone IK (hands pinned to the
 * grips, feet to the pegs). Standing on the pegs when moving, seated at idle,
 * hips back with arms straight when hanging off the back, tucked on a crouch.
 * While `state.ragdoll` is non-null the same parts are drawn exactly at the
 * physics ragdoll bodies instead.
 */
import * as THREE from 'three';
import type { RagdollBody } from '../../core/types';
import type { MaterialLibrary } from '../materials/library';
import type { RenderFrame } from '../frame';
import { BIKE, type BikeModel } from '../bike/bikeModel';
import { canvas, tex } from '../world/canvasTex';
import { mergeStaticChildren } from '../util/merge';

const L = {
  torso: 0.5,
  head: 0.108,
  upperArm: 0.3,
  forearm: 0.28,
  thigh: 0.44,
  shin: 0.43,
  hipHalf: 0.09,
  shoulderHalf: 0.19,
  pelvis: 0.22,
};

const UP = new THREE.Vector3(0, 1, 0);
const TMP = new THREE.Vector3();

/** A limb segment: a group whose local +y runs from joint a to joint b, scaled to the actual length. */
class Segment {
  readonly group = new THREE.Group();
  constructor(readonly len: number) {}
  place(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    const g = this.group;
    g.position.set(ax, ay, az);
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz) || 0.001;
    g.scale.set(1, len / this.len, 1);
    g.quaternion.setFromUnitVectors(UP, TMP.set(dx, dy, dz).normalize());
  }
}

/** Two-bone IK in XY: joint for a→b with bone lengths l1, l2; `side` = which side of the a–b line. */
function ik(ax: number, ay: number, bx: number, by: number, l1: number, l2: number, side: number, out: THREE.Vector2): void {
  let dx = bx - ax;
  let dy = by - ay;
  let d = Math.hypot(dx, dy);
  const max = (l1 + l2) * 0.995;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  }
  if (d < 1e-4) {
    out.set(ax + l1, ay);
    return;
  }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d;
  const uy = dy / d;
  out.set(ax + ux * a - uy * h * side, ay + uy * a + ux * h * side);
}

interface Kit {
  torso: Segment;
  pelvis: Segment;
  head: THREE.Group;
  upperArm: Segment[];
  forearm: Segment[];
  thigh: Segment[];
  shin: Segment[];
}

export class RiderModel {
  readonly root = new THREE.Group();
  /** Seated/standing rider, in the bike frame's local space. */
  readonly seated = new THREE.Group();
  /** Ragdoll bodies in world space. */
  readonly ragdoll = new THREE.Group();
  private readonly kit: Kit;
  private readonly rag: Kit;
  private readonly v = new THREE.Vector2();
  private readonly v2 = new THREE.Vector2();
  private standT = 0;
  /**
   * Pose LEAD (round 4). Physics' RiderPose already lags input by ≈0.28 s (t90), slower than
   * the reference's 100–150 ms, so the render side predicts ≈80 ms ahead from the pose
   * velocity (velocity smoothed with a 40 ms half-life) with a slight overshoot. The old
   * 120 ms second-order spring double-lagged.
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
  }

  private numberTex: THREE.CanvasTexture | null = null;
  /** Yellow jersey number patch: white "27" on the jersey colour. */
  private numberMat(): THREE.MeshStandardMaterial {
    if (!this.numberTex) {
      const [c, g] = canvas(128, 128);
      g.fillStyle = '#ffcf1a';
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#ffffff';
      g.font = 'bold 96px Impact, "Arial Black", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('27', 64, 70);
      g.fillStyle = '#1a2340';
      g.fillRect(0, 108, 128, 20);
      this.numberTex = tex(c, true, false);
    }
    const m = this.lib.derive('jerseyNumber');
    m.map = this.numberTex;
    m.needsUpdate = true;
    return m;
  }

  attach(bike: BikeModel): void {
    bike.frame.add(this.seated);
  }

  // ---------------------------------------------------------------------------
  // Parts
  // ---------------------------------------------------------------------------

  private mesh(g: THREE.BufferGeometry, mat: string, parent: THREE.Object3D): THREE.Mesh {
    const m = new THREE.Mesh(g, this.lib.get(mat));
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  /** Capsule along +y from 0 to len. */
  private capsule(r: number, len: number, mat: string, parent: THREE.Object3D, sx = 1, sz = 1): THREE.Mesh {
    const m = this.mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 4, 12), mat, parent);
    m.position.y = len / 2;
    m.scale.set(sx, 1, sz);
    return m;
  }

  private buildHead(parent: THREE.Object3D): THREE.Group {
    const head = new THREE.Group();
    const shell = this.mesh(new THREE.SphereGeometry(L.head, 20, 14), 'helmet', head);
    shell.scale.set(1.0, 1.08, 0.98);
    // Visor opening: dark band across the front.
    const visor = this.mesh(new THREE.SphereGeometry(L.head * 1.03, 20, 8, -0.75, 1.5, 1.05, 0.62), 'visor', head);
    visor.rotation.y = 0;
    // Peak
    const peak = this.mesh(new THREE.BoxGeometry(0.12, 0.012, 0.16), 'helmet', head);
    peak.position.set(0.08, 0.06, 0);
    peak.rotation.z = -0.35;
    // Chin bar: flattened box wrapping the front-bottom.
    const chin = this.mesh(new THREE.BoxGeometry(0.09, 0.06, 0.15), 'helmet', head);
    chin.position.set(0.08, -0.05, 0);
    chin.rotation.z = 0.15;
    // Goggle strap
    const strap = this.mesh(new THREE.TorusGeometry(L.head * 1.02, 0.012, 6, 24), 'pants', head);
    strap.rotation.x = Math.PI / 2;
    strap.position.y = 0.03;
    strap.scale.set(1, 1, 1.08);
    // Neck
    const neck = this.mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.09, 10), 'pants', head);
    neck.position.set(-0.01, -0.12, 0);
    parent.add(head);
    return head;
  }

  private buildKit(parent: THREE.Object3D, ragdoll: boolean): Kit {
    // Torso: chest capsule widened in z, chest plate, shoulder pads, back number.
    const torso = new Segment(L.torso);
    this.capsule(0.105, L.torso, 'jersey', torso.group, 0.8, 1.45);
    const chest = this.mesh(new THREE.BoxGeometry(0.05, 0.24, 0.26), 'armour', torso.group);
    chest.position.set(0.1, L.torso * 0.62, 0);
    chest.rotation.z = -0.1;
    for (const s of [-1, 1]) {
      const pad = this.mesh(new THREE.SphereGeometry(0.065, 12, 8), 'armour', torso.group);
      pad.position.set(0, L.torso - 0.02, s * L.shoulderHalf);
      pad.scale.set(1, 0.8, 1);
    }
    const spine = this.mesh(new THREE.BoxGeometry(0.04, 0.34, 0.12), 'armour', torso.group);
    spine.position.set(-0.11, L.torso * 0.5, 0);
    // Back-protector hump between the shoulder blades.
    const hump = this.mesh(new THREE.SphereGeometry(0.09, 14, 10), 'armour', torso.group);
    hump.position.set(-0.1, L.torso * 0.78, 0);
    hump.scale.set(0.7, 1.0, 1.3);
    // Shoulder caps (sleeve roots) so the arm joint reads as cloth, not a seam.
    for (const sd of [-1, 1]) {
      const cap = this.mesh(new THREE.SphereGeometry(0.068, 12, 8), 'jersey', torso.group);
      cap.position.set(0.0, L.torso - 0.03, sd * (L.shoulderHalf - 0.01));
    }
    // Numbered back panel (canvas texture, one per rider kit).
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), this.numberMat());
    num.position.set(-0.132, L.torso * 0.45, 0.001);
    num.rotation.y = -Math.PI / 2;
    torso.group.add(num);
    const numF = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.14), this.numberMat());
    numF.position.set(0.128, L.torso * 0.62, 0);
    numF.rotation.set(0, Math.PI / 2, -0.1);
    torso.group.add(numF);
    parent.add(torso.group);
    // Pelvis: shorts block + belt.
    const pelvis = new Segment(L.pelvis);
    const hips = this.mesh(new THREE.BoxGeometry(0.22, L.pelvis, 0.28), 'pants', pelvis.group);
    hips.position.y = L.pelvis / 2;
    const belt = this.mesh(new THREE.BoxGeometry(0.23, 0.04, 0.29), 'armour', pelvis.group);
    belt.position.y = L.pelvis - 0.02;
    for (const sd of [-1, 1]) {
      const hip = this.mesh(new THREE.SphereGeometry(0.088, 12, 8), 'pants', pelvis.group);
      hip.position.set(0, 0.02, sd * L.hipHalf);
    }
    parent.add(pelvis.group);
    const head = this.buildHead(parent);
    const upperArm: Segment[] = [];
    const forearm: Segment[] = [];
    const thigh: Segment[] = [];
    const shin: Segment[] = [];
    const n = 2;
    for (let i = 0; i < n; i++) {
      const ua = new Segment(L.upperArm);
      this.capsule(0.052, L.upperArm, 'jersey', ua.group);
      // Sleeve folds: two slightly proud rings so the sleeve reads as bunched cloth, not a tube.
      for (const fy of [0.16]) {
        const fold = this.mesh(new THREE.TorusGeometry(0.05, 0.007, 6, 14), 'jersey', ua.group);
        fold.rotation.x = Math.PI / 2;
        fold.position.y = fy;
      }
      const elbow = this.mesh(new THREE.SphereGeometry(0.06, 10, 8), 'armour', ua.group);
      elbow.position.y = L.upperArm;
      elbow.scale.set(1, 0.9, 0.9);
      parent.add(ua.group);
      upperArm.push(ua);
      const fa = new Segment(L.forearm);
      this.capsule(0.045, L.forearm, 'jersey', fa.group);
      const cuff = this.mesh(new THREE.CylinderGeometry(0.05, 0.046, 0.06, 10), 'jersey', fa.group);
      cuff.position.y = 0.03;
      for (const fy of [0.14]) {
        const fold = this.mesh(new THREE.TorusGeometry(0.044, 0.006, 6, 14), 'jersey', fa.group);
        fold.rotation.x = Math.PI / 2;
        fold.position.y = fy;
      }
      const wrist = this.mesh(new THREE.CylinderGeometry(0.04, 0.042, 0.05, 10), 'gloves', fa.group);
      wrist.position.y = L.forearm - 0.06;
      // Fist closed around the grip: torus whose axis runs along the bar (local z), plus a thumb.
      const fist = this.mesh(new THREE.TorusGeometry(0.03, 0.026, 8, 14), 'gloves', fa.group);
      fist.position.set(0.0, L.forearm - 0.005, 0);
      const thumb = this.mesh(new THREE.CapsuleGeometry(0.014, 0.03, 3, 8), 'gloves', fa.group);
      thumb.position.set(0.025, L.forearm - 0.03, 0);
      thumb.rotation.z = -0.8;
      parent.add(fa.group);
      forearm.push(fa);
      const th = new Segment(L.thigh);
      this.capsule(0.08, L.thigh, 'pants', th.group, 1, 1.1);
      const knee = this.mesh(new THREE.BoxGeometry(0.11, 0.17, 0.13), 'armour', th.group);
      knee.position.set(0.05, L.thigh - 0.04, 0);
      parent.add(th.group);
      thigh.push(th);
      const sh = new Segment(L.shin);
      this.capsule(0.06, L.shin, 'pants', sh.group);
      const kneeBall = this.mesh(new THREE.SphereGeometry(0.07, 12, 8), 'pants', sh.group);
      kneeBall.position.y = 0.01;
      const guard = this.mesh(new THREE.BoxGeometry(0.06, 0.26, 0.11), 'boots', sh.group);
      guard.position.set(0.05, L.shin * 0.45, 0);
      const boot = this.mesh(new THREE.BoxGeometry(0.29, 0.13, 0.12), 'boots', sh.group);
      boot.position.set(0.07, L.shin - 0.02, 0);
      const sole = this.mesh(new THREE.BoxGeometry(0.3, 0.03, 0.13), 'armour', sh.group);
      sole.position.set(0.07, L.shin + 0.05, 0);
      for (const by of [0.1, 0.19, 0.28]) {
        const buckle = this.mesh(new THREE.BoxGeometry(0.03, 0.035, 0.14), 'alloy', sh.group);
        buckle.position.set(0.085, L.shin - by, 0);
      }
      // Knee brace hinge plates either side of the knee.
      for (const sd of [-1, 1]) {
        const hinge = this.mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 10), 'alloy', sh.group);
        hinge.rotation.x = Math.PI / 2;
        hinge.position.set(0.0, 0.03, sd * 0.07);
      }
      parent.add(sh.group);
      shin.push(sh);
    }
    void ragdoll;
    for (const seg of [torso, pelvis, ...upperArm, ...forearm, ...thigh, ...shin]) mergeStaticChildren(seg.group);
    mergeStaticChildren(head);
    return { torso, pelvis, head, upperArm, forearm, thigh, shin };
  }

  // ---------------------------------------------------------------------------
  // Posing
  // ---------------------------------------------------------------------------

  update(f: RenderFrame): void {
    if (f.ragdoll && f.ragdoll.length > 0) {
      this.seated.visible = false;
      this.ragdoll.visible = true;
      this.poseRagdoll(f.ragdoll);
      return;
    }
    this.seated.visible = true;
    this.ragdoll.visible = false;
    this.poseRider(f);
  }

  private poseRider(f: RenderFrame): void {
    const B = BIKE;
    const r = {
      lean: this.spring('lean', f.rider.lean, f.dt, f.cut),
      torsoPitch: this.spring('torso', f.rider.torsoPitch, f.dt, f.cut),
      armExtend: this.spring('arm', f.rider.armExtend, f.dt, f.cut),
      crouch: this.spring('crouch', f.rider.crouch, f.dt, f.cut),
    };
    const k = this.kit;
    // Stand on the pegs when moving or airborne; sit at idle. Smoothed from tSim.
    const standTarget = f.airborne || f.speed > 1.2 || r.crouch > 0.3 || Math.abs(r.lean) > 0.5 ? 1 : 0;
    this.standT = f.cut ? standTarget : this.standT + (standTarget - this.standT) * (1 - Math.pow(0.5, f.dt / 0.25));
    const stand = this.standT;
    const back = Math.max(0, -r.lean);
    const fwd = Math.max(0, r.lean);
    // Hips.
    let hx = B.pegs.x + 0.06 * stand - 0.02 - 0.3 * back - 0.3 * r.armExtend + 0.14 * fwd - 0.06 * r.crouch - 0.16 * (1 - stand);
    const hyStand = B.pegs.y + 0.76 - 0.4 * r.crouch;
    const hySeat = B.seatTop.y + 0.1;
    let hy = hySeat + (hyStand - hySeat) * stand;
    // Torso from vertical: attack position ≈ 0.45 rad, more when crouched or leaning forward, less hanging back.
    const torsoA = 0.62 * stand + 0.3 * (1 - stand) + r.torsoPitch + 0.3 * fwd + 0.5 * r.crouch - 0.5 * back - 0.35 * r.armExtend;
    let sx = hx + Math.sin(torsoA) * L.torso;
    let sy = hy + Math.cos(torsoA) * L.torso;
    // Hands stay ON the grips at every lean: if the shoulder is out of reach the
    // whole upper body slides toward the bars (arms lock straight) instead of
    // the IK letting go.
    const gx = B.barCentre.x - 0.04;
    const gy = B.barCentre.y - 0.06;
    {
      const reach = (L.upperArm + L.forearm) * 0.985;
      const ddx = gx - sx;
      const ddy = gy - sy;
      const d = Math.hypot(ddx, ddy);
      if (d > reach) {
        const k = (d - reach) / d;
        sx += ddx * k;
        sy += ddy * k;
        hx += ddx * k;
        hy += ddy * k;
      }
    }
    // Pelvis block sits under the torso base, tilted with it.
    k.pelvis.place(hx - Math.sin(torsoA) * L.pelvis * 0.9, hy - Math.cos(torsoA) * L.pelvis * 0.9, 0, hx, hy, 0);
    k.torso.place(hx, hy, 0, sx, sy, 0);
    // Head: looks ahead, tilts up when tucked.
    const headA = torsoA * 0.45 - 0.1;
    const hdx = sx + Math.sin(headA) * (L.head + 0.05);
    const hdy = sy + Math.cos(headA) * (L.head + 0.05);
    k.head.position.set(hdx, hdy, 0);
    // Head counter-rotates to stay level in the world (within ±25°) while the bike pitches.
    const level = Math.max(-0.45, Math.min(0.45, f.bikeAngle));
    k.head.rotation.z = -headA - level;
    // Arms: shoulders → grips; elbows up and out (motocross attack).
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const z = side * L.shoulderHalf;
      const hz = side * (B.barHalfWidth - 0.06);
      ik(sx, sy, gx, gy, L.upperArm, L.forearm, 1, this.v);
      const ez = z + (hz - z) * 0.4 + side * 0.09;
      k.upperArm[i]!.place(sx, sy, z, this.v.x, this.v.y, ez);
      k.forearm[i]!.place(this.v.x, this.v.y, ez, gx, gy, hz);
    }
    // Legs: hips → pegs, knees forward; feet flat on the pegs.
    const fx = B.pegs.x + 0.03;
    const fy = B.pegs.y + 0.03;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const hipz = side * L.hipHalf;
      const fz = side * B.pegHalfWidth;
      ik(hx, hy, fx, fy, L.thigh, L.shin, 1, this.v2);
      const kz = side * 0.15; // knees grip the tank
      k.thigh[i]!.place(hx, hy, hipz, this.v2.x, this.v2.y, kz);
      k.shin[i]!.place(this.v2.x, this.v2.y, kz, fx, fy, fz);
    }
  }

  private poseRagdoll(bodies: RagdollBody[]): void {
    const k = this.rag;
    for (const s of [k.torso, k.pelvis, ...k.upperArm, ...k.forearm, ...k.thigh, ...k.shin]) s.group.visible = false;
    k.head.visible = false;
    for (const b of bodies) {
      if (b.id === 'head') {
        k.head.visible = true;
        k.head.position.set(b.pos.x, b.pos.y, 0);
        k.head.rotation.z = b.angle;
        continue;
      }
      const segs: Segment[] = b.id === 'torso' ? [k.torso] : b.id === 'pelvis' ? [k.pelvis] : b.id === 'upperArm' ? k.upperArm : b.id === 'forearm' ? k.forearm : b.id === 'thigh' ? k.thigh : k.shin;
      const len = segs[0]!.len;
      // Body angle is the segment axis (CCW from +x); draw from the centre both ways.
      const dx = Math.cos(b.angle) * len * 0.5;
      const dy = Math.sin(b.angle) * len * 0.5;
      segs.forEach((s, i) => {
        s.group.visible = true;
        const z = segs.length > 1 ? (i === 0 ? 0.15 : -0.15) : 0;
        s.place(b.pos.x - dx, b.pos.y - dy, z, b.pos.x + dx, b.pos.y + dy, z);
      });
    }
  }
}
