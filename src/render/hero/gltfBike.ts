/**
 * glTF bike (round 8): `public/models/bike.glb` driven exactly like the procedural bike.
 * File frame = rear axle at static sag (README): the scene sits at x −0.65 inside the
 * axle-midpoint `frame` group. Wheels spin at the physics wheel positions, `fork_lower`
 * slides along the fork axis to the front axle, `swingarm` aims at the rear axle,
 * `shock_body`/`shock_spring` stretch between the top mount and the swingarm link (spring
 * scaled), the chain texture scrolls with the rear spin, and the frame placement / visual
 * suspension is the shared `FramePlacer`.
 */
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BIKE, ContactBlob, FramePlacer, type HeroBike } from '../bike/bikeModel';
import { WHEEL_RADIUS, type RenderFrame } from '../frame';
import type { MaterialLibrary } from '../materials/library';
import { countTriangles, prepareHeroMaterials } from './gltf';

const FILE = {
  /** axle-midpoint frame → file frame (rear axle origin). */
  shift: 0.65,
  swingPivot: new THREE.Vector2(0.43, 0.1),
  shockTop: new THREE.Vector2(0.6, 0.52),
  shockRest: 0.6027,
  chainLink: 0.0127,
  rearSprocketR: 0.101,
  frontSprocketR: 0.033,
  frontAxle: new THREE.Vector2(1.3, 0),
};

export class GltfBike implements HeroBike {
  readonly root = new THREE.Group();
  readonly frame = new THREE.Group();
  readonly frameLocal = new THREE.Matrix4();
  readonly placer = new FramePlacer();
  readonly exhaustTip = new THREE.Vector3(-0.83, 0.41, 0.15);
  readonly triangles: number;
  readonly contacts: THREE.Object3D[];
  ground: ((x: number) => { y: number; angle: number }) | null = null;
  /** Materials of this instance (for ghost tinting). */
  readonly materials: THREE.MeshStandardMaterial[];
  private readonly scene: THREE.Object3D;
  private readonly nodes: Record<string, THREE.Object3D | null>;
  private readonly rearBlob = new ContactBlob();
  private readonly frontBlob = new ContactBlob();
  private readonly chainMap: THREE.Texture | null;
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly tmp3 = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector2();

  constructor(gltf: GLTF, lib: MaterialLibrary) {
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
    this.scene.position.set(-FILE.shift, 0, 0);
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
      sprocketFront: find('sprocket_front'),
      chain: find('chain'),
    };
    const chain = this.nodes['chain'] as THREE.Mesh | null;
    const cm = chain?.material as THREE.MeshStandardMaterial | undefined;
    this.chainMap = cm?.map ?? null;
    if (this.chainMap) this.chainMap.wrapS = THREE.RepeatWrapping;
    this.triangles = countTriangles(this.scene);
  }

  update(f: RenderFrame): void {
    this.placer.place(f, this.frame);
    this.frameLocal.copy(this.frame.matrixWorld);
    const n = this.nodes;
    // Wheels at the physics positions (file frame = frame-local + shift).
    const ra = this.toLocal(f.rear.x, f.rear.y);
    const rx = ra.x + FILE.shift;
    const ry = ra.y;
    const fa = this.toLocal(f.front.x, f.front.y);
    const fx = fa.x + FILE.shift;
    const fy = fa.y;
    if (n['wheelRear']) {
      n['wheelRear'].position.set(rx, ry, 0);
      n['wheelRear'].rotation.z = -f.rear.spin;
    }
    if (n['wheelFront']) {
      n['wheelFront'].position.set(fx, fy, 0);
      n['wheelFront'].rotation.z = -f.front.spin;
    }
    if (n['forkLower']) n['forkLower'].position.set(fx, fy, 0);
    if (n['sprocketFront']) n['sprocketFront'].rotation.z = -f.rear.spin * (FILE.rearSprocketR / FILE.frontSprocketR);
    // Swingarm aims at the rear axle (rest arm points at the rest axle).
    const sp = FILE.swingPivot;
    const restA = Math.atan2(-sp.y, -sp.x);
    if (n['swingarm']) n['swingarm'].rotation.z = Math.atan2(ry - sp.y, rx - sp.x) - restA;
    // Shock: local −y runs top mount → swingarm link; the coil scales with the length.
    const lx = sp.x + (rx - sp.x) * BIKE.shockSwing;
    const ly = sp.y + (ry - sp.y) * BIKE.shockSwing + 0.03;
    const dx = lx - FILE.shockTop.x;
    const dy = ly - FILE.shockTop.y;
    const len = Math.hypot(dx, dy) || FILE.shockRest;
    this.v.set(dx / len, dy / len, 0);
    this.q.setFromUnitVectors(this.tmp3.set(0, -1, 0), this.v);
    if (n['shockBody']) n['shockBody'].quaternion.copy(this.q);
    if (n['shockSpring']) {
      n['shockSpring'].quaternion.copy(this.q);
      n['shockSpring'].scale.y = Math.max(0.55, Math.min(1.25, len / FILE.shockRest));
    }
    // Chain: u in link units.
    if (this.chainMap) this.chainMap.offset.x = ((f.rear.spin * FILE.rearSprocketR) / FILE.chainLink) % 1;
    // Contact blobs.
    this.placeContact(this.rearBlob, f.rear.x, f.rear.y, f.rear.grounded, f.rear.compression, f.bikeAngle);
    this.placeContact(this.frontBlob, f.front.x, f.front.y, f.front.grounded, f.front.compression, f.bikeAngle);
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

  dispose(): void {
    for (const m of this.materials) m.dispose();
  }
}
