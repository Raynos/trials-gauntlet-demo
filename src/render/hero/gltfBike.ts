/**
 * The glTF bike is a closed rigid mechanism driven by the physics wheel centers. Exported
 * attachment markers define its rear-axle file frame, fork axis, swingarm and shock pivots.
 * The fixed chassis frame is shared with physical rider contacts. The physical rear hinge
 * and front slider keep the arm/fork coherent; shock and chain follow their actual endpoints.
 */
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ContactBlob, FramePlacer, type HeroBike } from '../bike/bikeModel';
import { WHEEL_RADIUS, type RenderFrame } from '../frame';
import type { MaterialLibrary } from '../materials/library';
import { fogify } from '../lighting/environment';
import { countTriangles, prepareHeroMaterials } from './gltf';
import { SpokeBlur, variantMaterialsFor } from './lod';
import { BrakeHose } from './brakeHose';
import type { BikeClass } from '../../core/types';

/** A clockwise external-tangent belt, parametrized by arc-length fraction. */
function beltPoint(u: number, rear: THREE.Vector3, rr: number, front: THREE.Vector3, fr: number, point: THREE.Vector3, normal: THREE.Vector3): number {
  const dx = front.x - rear.x, dy = front.y - rear.y;
  const distance = Math.hypot(dx, dy);
  const phi = Math.atan2(dy, dx), alpha = Math.acos((rr - fr) / distance);
  const top = phi + alpha, bottom = phi - alpha;
  const tangent = Math.sqrt(distance * distance - (rr - fr) ** 2);
  const frontArc = 2 * alpha * fr, total = 2 * tangent + frontArc + (Math.PI * 2 - 2 * alpha) * rr;
  const v = (u - Math.floor(u)) * total;
  let angle: number;
  if (v < tangent) {
    const k = v / tangent; angle = top;
    point.set(rear.x + rr * Math.cos(top) + k * (dx + (fr - rr) * Math.cos(top)), rear.y + rr * Math.sin(top) + k * (dy + (fr - rr) * Math.sin(top)), rear.z);
  } else if (v < tangent + frontArc) {
    angle = top - (v - tangent) / fr;
    point.set(front.x + fr * Math.cos(angle), front.y + fr * Math.sin(angle), rear.z);
  } else if (v < 2 * tangent + frontArc) {
    const k = (v - tangent - frontArc) / tangent; angle = bottom;
    point.set(front.x + fr * Math.cos(bottom) + k * (-dx + (rr - fr) * Math.cos(bottom)), front.y + fr * Math.sin(bottom) + k * (-dy + (rr - fr) * Math.sin(bottom)), rear.z);
  } else {
    angle = bottom - (v - 2 * tangent - frontArc) / rr;
    point.set(rear.x + rr * Math.cos(angle), rear.y + rr * Math.sin(angle), rear.z);
  }
  normal.set(Math.cos(angle), Math.sin(angle), 0);
  return total;
}


export class GltfBike implements HeroBike {
  readonly root = new THREE.Group();
  readonly frame = new THREE.Group();
  readonly frameLocal = new THREE.Matrix4();
  readonly placer = new FramePlacer();
  readonly exhaustTip = new THREE.Vector3();
  readonly debug = { chassisShift: 0, angleCorrection: 0, frontTravel: 0, armLengthError: 0, shockLength: 0 };
  readonly triangles: number;
  /** The parsed document this instance was cloned from (`bike.glb` or `bike-lod.glb`): `applyModels` rebuilds on a tier change when it differs. */
  readonly source: GLTF;
  readonly contacts: THREE.Object3D[];
  ground: ((x: number) => { y: number; angle: number }) | null = null;
  /** Materials of this instance (for ghost tinting). */
  readonly materials: THREE.MeshStandardMaterial[];
  /**
   * Round 13 (H1 colourways): per mesh, the instance's own completed clone of each
   * `KHR_materials_variants` material (`bike_rookie` / `bike_pro` → `bike_body_*` on frame,
   * bodywork, fork_upper). `setLivery` swaps them; nothing is tinted and the plates + class digit
   * are baked in the atlas. Empty for a file without variants (then the livery is a no-op).
   */
  private readonly variants: { mesh: THREE.Mesh; byClass: Partial<Record<BikeClass, THREE.Material>> }[] = [];
  private livery: BikeClass = 'rookie';
  private readonly scene: THREE.Object3D;
  private readonly nodes: Record<string, THREE.Object3D | null>;
  private readonly marks = new Map<string, THREE.Object3D>();
  private readonly rest = new Map<string, THREE.Vector3>();
  private readonly shift = new THREE.Vector3();
  private readonly forkAxis = new THREE.Vector3();
  private armLength = 0;
  private readonly chassisOffset = new THREE.Vector3();
  private readonly shockRestQ = new THREE.Quaternion();
  private readonly shockRestDir = new THREE.Vector3();
  private rodInset = 0;
  private rodLength = 0;
  private upperSeatOffset = 0;
  private lowerSeatOffset = 0;
  private springLength = 0;
  private rearPitch = 0;
  private frontPitch = 0;
  private chainPitch = 0;
  private chainRadius = 0;
  private chainGeometry: THREE.BufferGeometry | null = null;
  private readonly brakeHose: BrakeHose | null;
  private readonly rearFile = new THREE.Vector3();
  private readonly frontFile = new THREE.Vector3();
  private readonly linkage = new THREE.Vector3();
  private readonly rearSprocket = new THREE.Vector3();
  private readonly beltCenter = new THREE.Vector3();
  private readonly beltNormal = new THREE.Vector3();
  private readonly rearBlob = new ContactBlob();
  private readonly frontBlob = new ContactBlob();
  private readonly chainMap: THREE.Texture | null;
  /** Round 13 (H2): spoke opacity + blur disc per wheel from `spinVel`. */
  private readonly blurs: SpokeBlur[] = [];
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly tmp3 = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector2();

  constructor(gltf: GLTF, lib: MaterialLibrary) {
    this.source = gltf;
    this.scene = gltf.scene.clone(true);
    // Clone materials so the live bike and the ghost tint independently.
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
    // Colourways: one completed clone per (mesh, variant); the rookie slot material stays the
    // mesh's current one so a file without variants keeps rendering as authored.
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const table = variantMaterialsFor(gltf, mesh.name);
      if (!table.size) return;
      const byClass: Partial<Record<BikeClass, THREE.Material>> = {};
      for (const [name, src] of table) {
        const cls = /_pro$/.test(name) ? 'pro' : /_rookie$/.test(name) ? 'rookie' : null;
        if (!cls) continue;
        const own = src.clone();
        const std = own as THREE.MeshStandardMaterial;
        if (std.isMeshStandardMaterial) {
          lib.complete(std);
          fogify(std);
          std.envMapIntensity = 0.8;
          this.materials.push(std);
        }
        byClass[cls] = own;
      }
      if (byClass.rookie && byClass.pro) this.variants.push({ mesh, byClass });
    });
    this.scene.updateMatrixWorld(true);
    for (const name of ['frame_origin', 'chassis_com', 'swing_pivot', 'swing_axle', 'shock_link', 'fork_top', 'front_axle_rest', 'rear_axle_rest', 'shock_top', 'shock_upper_seat', 'shock_lower_seat', 'shock_rod_top', 'shock_eye', 'countershaft', 'front_pitch', 'rear_sprocket', 'rear_pitch', 'exhaust_outlet']) {
      const marker = this.scene.getObjectByName(`attach_${name}`);
      if (!marker) throw new Error(`bike asset is missing attach_${name}; rebuild full and LOD together`);
      this.marks.set(name, marker);
      this.rest.set(name, this.scene.worldToLocal(marker.getWorldPosition(new THREE.Vector3())));
    }
    this.shift.copy(this.rest.get('frame_origin')!);
    this.forkAxis.subVectors(this.rest.get('fork_top')!, this.rest.get('front_axle_rest')!).normalize();
    this.v.subVectors(this.rest.get('swing_axle')!, this.rest.get('swing_pivot')!);
    this.armLength = this.v.length();
    this.chassisOffset.subVectors(this.shift, this.rest.get('chassis_com')!);
    this.shockRestDir.subVectors(this.rest.get('shock_link')!, this.rest.get('shock_top')!).normalize();
    this.upperSeatOffset = this.rest.get('shock_top')!.distanceTo(this.rest.get('shock_upper_seat')!);
    this.lowerSeatOffset = this.rest.get('shock_link')!.distanceTo(this.rest.get('shock_lower_seat')!);
    this.rodInset = this.rest.get('shock_top')!.distanceTo(this.rest.get('shock_rod_top')!);
    this.rodLength = this.rest.get('shock_link')!.distanceTo(this.rest.get('shock_rod_top')!);
    this.springLength = this.rest.get('shock_upper_seat')!.distanceTo(this.rest.get('shock_lower_seat')!);
    this.rearPitch = this.rest.get('rear_pitch')!.distanceTo(this.rest.get('rear_sprocket')!);
    this.frontPitch = this.rest.get('front_pitch')!.distanceTo(this.rest.get('countershaft')!);
    this.exhaustTip.subVectors(this.rest.get('exhaust_outlet')!, this.shift);
    this.scene.position.copy(this.shift).negate();
    this.frame.add(this.scene);
    this.root.add(this.frame, this.rearBlob.mesh, this.frontBlob.mesh);
    this.root.name = 'bike:gltf';
    this.contacts = [this.rearBlob.mesh, this.frontBlob.mesh];
    const find = (n: string): THREE.Object3D | null => this.scene.getObjectByName(n) ?? null;
    this.nodes = {
      wheelFront: find('wheel_front'),
      wheelRear: find('wheel_rear'),
      forkLower: find('fork_lower'),
      swingarm: find('swingarm'),
      shockBody: find('shock_body'),
      shockSpring: find('shock_spring'),
      shockShaft: find('shock_shaft'),
      shockClevis: find('shock_clevis'),
      sprocketFront: find('sprocket_front'),
      chain: find('chain'),
    };
    const chain = this.nodes['chain'] as THREE.Mesh | null;
    const cm = chain?.material as THREE.MeshStandardMaterial | undefined;
    this.chainMap = cm?.map?.clone() ?? null;
    if (cm && this.chainMap) {
      cm.map = this.chainMap;
      this.chainMap.wrapS = THREE.RepeatWrapping;
      this.chainMap.needsUpdate = true;
    }
    if (!chain || !this.nodes['shockShaft'] || !this.nodes['shockClevis'] || !this.nodes['shockBody']) throw new Error('bike mechanism parts are missing');
    this.chainPitch = Number(chain.userData['link_pitch']);
    this.chainRadius = Number(chain.userData['tube_radius']);
    if (!(this.chainPitch > 0 && this.chainRadius > 0)) throw new Error('bike chain parameters are missing');
    this.chainGeometry = chain.geometry.clone();
    chain.geometry = this.chainGeometry;
    const hose = this.scene.getObjectByName('brake_hose') as THREE.Mesh | undefined;
    this.brakeHose = hose ? new BrakeHose(hose) : null;
    this.shockRestQ.copy(this.nodes['shockBody'].quaternion);
    for (const key of ['wheelRear', 'wheelFront'] as const) {
      const wheel = this.nodes[key];
      if (wheel) this.blurs.push(new SpokeBlur(wheel, this.materials));
    }
    this.setLivery('rookie', true);
    this.triangles = countTriangles(this.scene);
  }

  update(f: RenderFrame): void {
    this.placeFromChassis(f);
    this.frameLocal.copy(this.frame.matrixWorld);
    const n = this.nodes;
    // Physics spin is an absolute world angle. Remove the parent's rotation exactly once.
    const rearAngle = -f.rear.spin - this.frame.rotation.z;
    if (n['wheelRear']) { n['wheelRear'].position.copy(this.rearFile); n['wheelRear'].rotation.z = rearAngle; }
    if (n['wheelFront']) { n['wheelFront'].position.copy(this.frontFile); n['wheelFront'].rotation.z = -f.front.spin - this.frame.rotation.z; }
    this.blurs[0]?.update(f.rear.spinVel);
    this.blurs[1]?.update(f.front.spinVel);
    n['forkLower']!.position.copy(this.frontFile);
    const axleRest = this.rest.get('front_axle_rest')!;
    this.brakeHose?.update(this.frontFile.x - axleRest.x, this.frontFile.y - axleRest.y);
    n['sprocketFront']!.rotation.z = rearAngle * this.rearPitch / this.frontPitch;
    const pivot = this.rest.get('swing_pivot')!, axle = this.rest.get('swing_axle')!;
    n['swingarm']!.rotation.z = Math.atan2(this.rearFile.y - pivot.y, this.rearFile.x - pivot.x) - Math.atan2(axle.y - pivot.y, axle.x - pivot.x);
    this.debug.armLengthError = Math.abs(this.rearFile.distanceTo(pivot) - this.armLength);
    // The lug is part of the rigid arm, including its offset perpendicular to that arm.
    this.markerPoint('shock_link', this.linkage);
    const top = this.rest.get('shock_top')!;
    this.v.subVectors(this.linkage, top);
    const length = this.v.length();
    this.debug.shockLength = length;
    this.v.multiplyScalar(1 / length);
    this.q.setFromUnitVectors(this.shockRestDir, this.v).multiply(this.shockRestQ);
    n['shockBody']!.quaternion.copy(this.q);
    n['shockClevis']!.position.copy(this.linkage);
    n['shockClevis']!.quaternion.copy(this.q);
    n['shockShaft']!.position.copy(this.linkage);
    n['shockShaft']!.quaternion.copy(this.q);
    n['shockShaft']!.scale.y = (length - this.rodInset) / this.rodLength;
    n['shockSpring']!.position.copy(top).addScaledVector(this.v, this.upperSeatOffset);
    n['shockSpring']!.quaternion.copy(this.q);
    n['shockSpring']!.scale.y = (length - this.upperSeatOffset - this.lowerSeatOffset) / this.springLength;
    this.markerPoint('rear_sprocket', this.rearSprocket);
    this.deformChain(rearAngle);
    this.placeContact(this.rearBlob, f.rear.x, f.rear.y, f.rear.grounded, f.rear.compression, f.bikeAngle);
    this.placeContact(this.frontBlob, f.front.x, f.front.y, f.front.grounded, f.front.compression, f.bikeAngle);
  }

  private markerPoint(name: string, out: THREE.Vector3): THREE.Vector3 {
    return this.scene.worldToLocal(this.marks.get(name)!.getWorldPosition(out));
  }

  /** The same fixed chassis-to-asset frame used by physics rider contacts. Suspension
   * belongs to the physical hinge/slider; it never moves the visual chassis or its grips.
   * The exported COM marker is authoritative, including after a legacy-model hot swap.
   */
  private placeFromChassis(f: RenderFrame): void {
    const offset = this.chassisOffset, c = Math.cos(f.bikeAngle), s = Math.sin(f.bikeAngle);
    this.placer.originOffset.set(offset.x, offset.y);
    this.placer.calibrated = true;
    this.frame.position.set(f.bikeX + offset.x * c - offset.y * s, f.bikeY + offset.x * s + offset.y * c, offset.z);
    this.frame.rotation.z = f.bikeAngle;
    this.frame.updateMatrixWorld(true);
    this.rearFile.set(f.rear.x, f.rear.y, 0); this.frame.worldToLocal(this.rearFile).add(this.shift);
    this.frontFile.set(f.front.x, f.front.y, 0); this.frame.worldToLocal(this.frontFile).add(this.shift);
    this.v.subVectors(this.frontFile, this.rest.get('front_axle_rest')!);
    this.debug.frontTravel = this.v.dot(this.forkAxis);
    this.debug.chassisShift = 0;
    this.debug.angleCorrection = 0;
  }

  private deformChain(rearAngle: number): void {
    const geometry = this.chainGeometry!;
    const pos = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
    const front = this.rest.get('countershaft')!;
    let length = 0;
    for (let i = 0; i < pos.count; i++) {
      length = beltPoint(uv.getX(i), this.rearSprocket, this.rearPitch, front, this.frontPitch, this.beltCenter, this.beltNormal);
      const a = (1 - uv.getY(i)) * Math.PI * 2; // Blender UV v is flipped by glTF export
      const radial = Math.cos(a), lateral = -Math.sin(a);
      pos.setXYZ(i, this.beltCenter.x + this.beltNormal.x * this.chainRadius * radial, this.beltCenter.y + this.beltNormal.y * this.chainRadius * radial, this.beltCenter.z + this.chainRadius * lateral);
      normal.setXYZ(i, this.beltNormal.x * radial, this.beltNormal.y * radial, lateral);
    }
    pos.needsUpdate = true; normal.needsUpdate = true;
    if (this.chainMap) { this.chainMap.repeat.x = length / this.chainPitch; this.chainMap.offset.x = (rearAngle * this.rearPitch / this.chainPitch) % 1; }
  }

  private placeContact(b: ContactBlob, wx: number, wy: number, grounded: boolean, compression: number, bikeAngle: number): void {
    if (grounded) {
      const nx = -Math.sin(bikeAngle);
      const ny = Math.cos(bikeAngle);
      b.set(wx - nx * WHEEL_RADIUS, wy - ny * WHEEL_RADIUS, bikeAngle, true, compression, 0);
      return;
    }
    const g = this.ground ? this.ground(wx) : { y: wy - WHEEL_RADIUS, angle: 0 };
    b.set(wx, g.y, g.angle, false, 0, Math.max(0, wy - WHEEL_RADIUS - g.y));
  }

  /** World XY → frame-local XY. */
  toLocal(x: number, y: number): THREE.Vector2 {
    this.tmp3.set(x, y, 0);
    this.frame.worldToLocal(this.tmp3);
    return this.tmp2.set(this.tmp3.x, this.tmp3.y);
  }

  toWorld(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(x, y, z).applyMatrix4(this.frameLocal);
  }

  /** Round 13: the class colourway is the file's `KHR_materials_variants` material (no tint, plates baked). */
  setLivery(cls: BikeClass, force = false): void {
    if (cls === this.livery && !force) return;
    this.livery = cls;
    for (const v of this.variants) {
      const m = v.byClass[cls];
      if (m) v.mesh.material = m;
    }
  }

  dispose(): void {
    for (const b of this.blurs) b.dispose();
    for (const m of this.materials) m.dispose();
    this.chainMap?.dispose();
    this.chainGeometry?.dispose();
    this.brakeHose?.dispose();
    for (const blob of [this.rearBlob, this.frontBlob]) {
      blob.mesh.geometry.dispose();
      const material = blob.mesh.material as THREE.MeshBasicMaterial;
      material.map?.dispose(); material.dispose();
    }
  }
}
