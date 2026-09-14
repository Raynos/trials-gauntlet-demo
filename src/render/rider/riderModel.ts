/**
 * Articulated rider posed from `RiderPose` (hands pinned to the bar ends, feet
 * to the pegs, two-bone IK per limb) and, while `state.ragdoll` is non-null,
 * drawn exactly at the physics ragdoll bodies instead.
 */
import * as THREE from 'three';
import type { RagdollBody } from '../../core/types';
import type { MaterialLibrary } from '../materials/library';
import type { RenderFrame } from '../frame';
import { BIKE, type BikeModel } from '../bike/bikeModel';

const L = {
  torso: 0.52,
  neck: 0.02,
  head: 0.13,
  upperArm: 0.31,
  forearm: 0.3,
  thigh: 0.44,
  shin: 0.44,
  hipHalf: 0.11,
  shoulderHalf: 0.2,
};

interface Seg {
  mesh: THREE.Mesh;
  len: number;
}

function capsule(r: number, len: number, mat: THREE.Material): THREE.Mesh {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 4, 10);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

/** Place a y-axis capsule between two points (in the parent's space). */
function place(seg: Seg, ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
  const m = seg.mesh;
  m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz) || 0.001;
  m.scale.set(1, len / seg.len, 1);
  m.quaternion.setFromUnitVectors(UP, TMP.set(dx, dy, dz).normalize());
}
const UP = new THREE.Vector3(0, 1, 0);
const TMP = new THREE.Vector3();

/**
 * Two-bone IK in the XY plane: joint position for a chain a→(joint)→b with
 * bone lengths l1, l2; `side` picks which side of the a–b line the joint goes.
 */
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

export class RiderModel {
  readonly root = new THREE.Group();
  /** Seated rider, in the bike frame's local space. */
  readonly seated = new THREE.Group();
  /** Ragdoll bodies in world space. */
  readonly ragdoll = new THREE.Group();
  private readonly torso: Seg;
  private readonly pelvis: Seg;
  private readonly head: THREE.Mesh;
  private readonly visor: THREE.Mesh;
  private readonly upperArm: [Seg, Seg];
  private readonly forearm: [Seg, Seg];
  private readonly thigh: [Seg, Seg];
  private readonly shin: [Seg, Seg];
  private readonly boots: [THREE.Mesh, THREE.Mesh];
  private readonly rag: Record<RagdollBody['id'], Seg[]>;
  private readonly ragHead: THREE.Mesh;
  private readonly v = new THREE.Vector2();
  private readonly v2 = new THREE.Vector2();

  constructor(lib: MaterialLibrary) {
    const jersey = lib.get('jersey');
    const pants = lib.get('pants');
    const boots = lib.get('boots');
    const gloves = lib.get('gloves');
    const helmet = lib.get('helmet');
    const seg = (r: number, len: number, mat: THREE.Material, parent: THREE.Group): Seg => {
      const mesh = capsule(r, len, mat);
      parent.add(mesh);
      return { mesh, len };
    };
    this.torso = seg(0.13, L.torso, jersey, this.seated);
    this.pelvis = seg(0.12, 0.26, pants, this.seated);
    this.head = new THREE.Mesh(new THREE.SphereGeometry(L.head, 16, 12), helmet);
    this.head.castShadow = true;
    this.head.scale.set(1, 1.08, 1);
    this.visor = new THREE.Mesh(new THREE.SphereGeometry(L.head * 1.02, 16, 8, -0.9, 1.8, 0.9, 1.1), lib.get('visor'));
    this.head.add(this.visor);
    const peak = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.18), helmet);
    peak.position.set(0.11, 0.07, 0);
    peak.rotation.z = -0.3;
    this.head.add(peak);
    this.seated.add(this.head);
    this.upperArm = [seg(0.05, L.upperArm, jersey, this.seated), seg(0.05, L.upperArm, jersey, this.seated)];
    this.forearm = [seg(0.045, L.forearm, gloves, this.seated), seg(0.045, L.forearm, gloves, this.seated)];
    this.thigh = [seg(0.075, L.thigh, pants, this.seated), seg(0.075, L.thigh, pants, this.seated)];
    this.shin = [seg(0.06, L.shin, boots, this.seated), seg(0.06, L.shin, boots, this.seated)];
    this.boots = [new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.11), boots), new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.11), boots)];
    for (const b of this.boots) {
      b.castShadow = true;
      this.seated.add(b);
    }
    // Ragdoll: same segments, world space.
    const rs = (r: number, len: number, mat: THREE.Material, n: number): Seg[] => {
      const out: Seg[] = [];
      for (let i = 0; i < n; i++) out.push(seg(r, len, mat, this.ragdoll));
      return out;
    };
    this.rag = {
      head: [],
      torso: rs(0.13, L.torso, jersey, 1),
      pelvis: rs(0.12, 0.26, pants, 1),
      upperArm: rs(0.05, L.upperArm, jersey, 2),
      forearm: rs(0.045, L.forearm, gloves, 2),
      thigh: rs(0.075, L.thigh, pants, 2),
      shin: rs(0.06, L.shin, boots, 2),
    };
    this.ragHead = new THREE.Mesh(new THREE.SphereGeometry(L.head, 16, 12), helmet);
    this.ragHead.castShadow = true;
    this.ragdoll.add(this.ragHead);
    this.ragdoll.visible = false;
    this.root.add(this.ragdoll);
  }

  /** Attach the seated hierarchy under the bike frame. */
  attach(bike: BikeModel): void {
    bike.frame.add(this.seated);
  }

  update(f: RenderFrame): void {
    if (f.ragdoll && f.ragdoll.length > 0) {
      this.seated.visible = false;
      this.ragdoll.visible = true;
      this.poseRagdoll(f.ragdoll);
      return;
    }
    this.seated.visible = true;
    this.ragdoll.visible = false;
    this.poseSeated(f);
  }

  private poseSeated(f: RenderFrame): void {
    const B = BIKE;
    const r = f.rider;
    // Standing on the pegs: pelvis above/behind the pegs, back with lean and armExtend, down with crouch.
    const stand = 1 - r.crouch;
    const px = B.pegs.x - 0.08 - 0.22 * Math.max(0, -r.lean) - 0.12 * r.armExtend + 0.16 * Math.max(0, r.lean) - 0.05 * r.crouch;
    const py = B.pegs.y + 0.5 + 0.36 * stand;
    // Torso: forward lean base 28°, more with crouch and forward lean, less when hanging back.
    const torsoA = 0.38 + r.torsoPitch + 0.35 * r.lean + 0.4 * r.crouch - 0.3 * r.armExtend;
    const sx = px + Math.sin(torsoA) * L.torso;
    const sy = py + Math.cos(torsoA) * L.torso;
    place(this.pelvis, px - 0.05, py - 0.08, 0, px + 0.03, py + 0.1, 0);
    place(this.torso, px, py, 0, sx, sy, 0);
    // Head continues the torso, tilted up to look ahead.
    const headA = torsoA - 0.45;
    const hx = sx + Math.sin(headA) * (L.neck + L.head);
    const hy = sy + Math.cos(headA) * (L.neck + L.head);
    this.head.position.set(hx, hy, 0);
    this.head.rotation.z = -headA;
    // Arms: shoulders → bar ends. Elbow goes below the shoulder-hand line, slightly out.
    const bx = B.barCentre.x - 0.04;
    const by = B.barCentre.y - 0.05;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const z = side * L.shoulderHalf;
      const hz = side * (B.barHalfWidth - 0.05);
      ik(sx, sy, bx, by, L.upperArm, L.forearm, -1, this.v);
      const ez = z + (hz - z) * 0.5 + side * 0.08;
      place(this.upperArm[i]!, sx, sy, z, this.v.x, this.v.y, ez);
      place(this.forearm[i]!, this.v.x, this.v.y, ez, bx, by, hz);
    }
    // Legs: hips → pegs. Knee forward.
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const hz = side * L.hipHalf;
      const fz = side * B.pegHalfWidth;
      const fx = B.pegs.x + 0.02;
      const fy = B.pegs.y + 0.05;
      ik(px, py, fx, fy, L.thigh, L.shin, 1, this.v2);
      const kz = hz + (fz - hz) * 0.5;
      place(this.thigh[i]!, px, py, hz, this.v2.x, this.v2.y, kz);
      place(this.shin[i]!, this.v2.x, this.v2.y, kz, fx, fy, fz);
      const boot = this.boots[i]!;
      boot.position.set(fx + 0.05, fy - 0.02, fz);
      boot.rotation.z = 0.1;
    }
  }

  private poseRagdoll(bodies: RagdollBody[]): void {
    // Hide everything, then place what physics reports.
    for (const list of Object.values(this.rag)) for (const s of list) s.mesh.visible = false;
    this.ragHead.visible = false;
    for (const b of bodies) {
      if (b.id === 'head') {
        this.ragHead.visible = true;
        this.ragHead.position.set(b.pos.x, b.pos.y, 0);
        this.ragHead.rotation.z = b.angle;
        continue;
      }
      const segs = this.rag[b.id];
      const len = b.id === 'torso' ? L.torso : b.id === 'pelvis' ? 0.26 : b.id === 'upperArm' ? L.upperArm : b.id === 'forearm' ? L.forearm : b.id === 'thigh' ? L.thigh : L.shin;
      const dx = Math.cos(b.angle) * len * 0.5;
      const dy = Math.sin(b.angle) * len * 0.5;
      segs.forEach((s, i) => {
        s.mesh.visible = true;
        const z = segs.length > 1 ? (i === 0 ? 0.14 : -0.14) : 0;
        place(s, b.pos.x - dx, b.pos.y - dy, z, b.pos.x + dx, b.pos.y + dy, z);
      });
    }
  }
}
