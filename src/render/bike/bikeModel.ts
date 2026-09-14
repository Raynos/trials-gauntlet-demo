/**
 * Modern trials bike (round 6 hero rebuild) from lathe / tube / rounded-box
 * geometry at real proportions: wheelbase 1.30 m, wheel radius 0.34 m, a thin
 * blue twin-spar frame, the black engine mass low and central, a slim tank →
 * seat unit → rear mudguard, silver stanchions sliding into black lowers, a
 * mono-shock with a real coil, chain + sprockets on the camera side, knobbly
 * tyres with geometric knobs, spoked wheels.
 *
 * Frame-local coordinates: origin = midpoint of the axles at static sag,
 * x forward, y up, z toward the camera (the rider's left). Calibrated on the
 * first grounded frame from `bike.pos`. Wheels sit at the exact physics wheel
 * positions; forks / swingarm / shock stretch to meet them.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { MaterialLibrary } from '../materials/library';
import type { RenderFrame } from '../frame';
import { WHEEL_RADIUS } from '../frame';
import { mergeStaticChildren } from '../util/merge';
import type { BikeClass } from '../../core/types';
import { applyPlate, LIVERIES } from './livery';
import { fogify } from '../lighting/environment';

export const BIKE = {
  rearAxleRest: new THREE.Vector2(-0.65, 0),
  frontAxleRest: new THREE.Vector2(0.65, 0),
  swingPivot: new THREE.Vector2(-0.22, 0.1),
  headBottom: new THREE.Vector2(0.43, 0.5),
  headTop: new THREE.Vector2(0.35, 0.68),
  /** Bar clamp centre (top of the risers). */
  barCentre: new THREE.Vector2(0.31, 0.77),
  /** Grip centre (hands go here), z = ±gripZ. */
  grip: new THREE.Vector2(0.27, 0.78),
  gripZ: 0.33,
  barHalfWidth: 0.4,
  pegs: new THREE.Vector2(-0.14, 0.02),
  pegHalfWidth: 0.2,
  seatTop: new THREE.Vector2(-0.3, 0.55),
  shockTop: new THREE.Vector2(-0.05, 0.52),
  shockSwing: 0.55, // fraction along the swingarm from the pivot
};

function tube(points: THREE.Vector3[], r: number, radial = 8, seg = 24, tension = 0.2): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', tension);
  return new THREE.TubeGeometry(curve, seg, r, radial, false);
}

function lathe(profile: [number, number][], segments = 16): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

function rbox(w: number, h: number, d: number, r = 0.01, seg = 2): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2));
}

/** Merge geometries of mixed indexing (RoundedBox is non-indexed) into one non-indexed geometry. */
function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(
    geos.map((g) => (g.index ? g.toNonIndexed() : g)),
    false,
  )!;
}

/** Helical coil along +y from 0 to `len`, radius `R`, wire radius `r`. */
function coil(R: number, r: number, len: number, turns: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const n = turns * 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * R, t * len, Math.sin(a) * R));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  return new THREE.TubeGeometry(curve, n * 2, r, 6, false);
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);

function contactTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 32, 2, 64, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.6)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.scale(2, 1);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/**
 * Contact-shadow blob under a tyre (world space, added to the scene root). Shared by the
 * procedural wheel and the glTF bike (round 8).
 */
export class ContactBlob {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.MeshBasicMaterial;
  constructor() {
    this.mat = new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, opacity: 0.85, depthWrite: false, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.42), this.mat);
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
  }
  /** Place at the tyre's ground point; fade with height and compression. Returns the tyre squash factor. */
  set(gx: number, gy: number, groundAngle: number, grounded: boolean, compression: number, hover: number): number {
    const vis = grounded ? 1 : Math.max(0, 1 - hover / 0.6);
    this.mesh.visible = vis > 0.02;
    this.mat.opacity = 0.55 * vis + 0.3 * compression * vis;
    this.mesh.position.set(gx, gy + 0.006, 0);
    this.mesh.rotation.set(-Math.PI / 2, 0, 0);
    this.mesh.rotateOnWorldAxis(Z_AXIS, groundAngle);
    const s = 1 + 0.35 * compression;
    this.mesh.scale.set(s, 1 + 0.15 * compression, 1);
    return grounded ? 0.1 * (0.4 + compression) : 0;
  }
}

/**
 * Frame placement shared by both hero bikes: origin = bike.pos + R(angle) · originOffset
 * (calibrated to the axle midpoint on the first grounded frame), plus the visual suspension
 * exaggeration (≤ ×1.3 of the physics travel): sink 3 cm per unit of summed compression,
 * pitch 0.05 rad × (rear − front), and a ≤ 4 cm rebound overshoot after a hard landing.
 */
export class FramePlacer {
  /** bike.pos → axle midpoint, in frame-local coords (calibrated). */
  readonly originOffset = new THREE.Vector2(0.065, -0.27);
  calibrated = false;
  private landT = -1;
  private landAmp = 0;

  /** Copy calibration + landing state from another placer (hot swap keeps the frame origin). */
  copyFrom(o: FramePlacer): void {
    this.originOffset.copy(o.originOffset);
    this.calibrated = o.calibrated;
    this.landT = o.landT;
    this.landAmp = o.landAmp;
  }

  place(f: RenderFrame, frame: THREE.Object3D): void {
    const c = Math.cos(f.bikeAngle);
    const s = Math.sin(f.bikeAngle);
    const mx = (f.rear.x + f.front.x) / 2 - f.bikeX;
    const my = (f.rear.y + f.front.y) / 2 - f.bikeY;
    const lx = mx * c + my * s;
    const ly = -mx * s + my * c;
    if (!this.calibrated || (f.cut && f.rear.grounded && f.front.grounded)) {
      this.originOffset.set(lx, ly);
      this.calibrated = true;
    }
    const rc = f.rear.grounded ? f.rear.compression : 0;
    const fc = f.front.grounded ? f.front.compression : 0;
    if (f.cut) this.landT = -1;
    if (f.justLanded && f.landImpulse > 1.5) {
      this.landT = f.tSim;
      this.landAmp = Math.min(0.04, f.landImpulse * 0.01);
    }
    let rebound = 0;
    if (this.landT >= 0) {
      const lt = f.tSim - this.landT;
      if (lt < 0.5) rebound = -this.landAmp * Math.exp(-lt / 0.14) * Math.cos(2 * Math.PI * 4.5 * lt);
      else this.landT = -1;
    }
    const sink = -0.03 * (rc + fc) + rebound;
    const ox = this.originOffset.x;
    const oy = this.originOffset.y + sink;
    frame.position.set(f.bikeX + ox * c - oy * s, f.bikeY + ox * s + oy * c, 0);
    frame.rotation.z = f.bikeAngle + 0.05 * (rc - fc);
    frame.updateMatrix();
    frame.updateMatrixWorld(true);
  }
}

/** What the rider and the renderer need from either hero bike. */
export interface HeroBike {
  readonly root: THREE.Group;
  readonly frame: THREE.Group;
  readonly frameLocal: THREE.Matrix4;
  readonly placer: FramePlacer;
  readonly exhaustTip: THREE.Vector3;
  readonly triangles: number;
  /** World-space contact blobs (the ghost removes them). */
  readonly contacts: THREE.Object3D[];
  ground: ((x: number) => { y: number; angle: number }) | null;
  update(f: RenderFrame): void;
  toWorld(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3;
  /** Round 11 (CONTRACT §2.7 `setBikeClass`): repaint to the class livery (`bike/livery.ts`). */
  setLivery(cls: BikeClass): void;
  dispose(): void;
}

export class Wheel {
  readonly root = new THREE.Group();
  readonly spinner = new THREE.Group();
  private readonly spokes: THREE.Mesh;
  private readonly blur: THREE.Mesh;
  private readonly blurMat: THREE.MeshBasicMaterial;
  private readonly spokeMat: THREE.MeshStandardMaterial;
  private readonly tyre: THREE.Group;
  private readonly tyreSquash = new THREE.Group();
  /** Contact-shadow blob on the ground under the tyre (world space, added to the scene root). */
  readonly contact: THREE.Mesh;
  private readonly contactMat: THREE.MeshBasicMaterial;

  /** `discSide` = z sign of the brake disc; the other side carries the sprocket on the rear wheel. */
  constructor(lib: MaterialLibrary, discSide: number, sprocket: boolean, rimR: number, section: number, zScale: number) {
    const R = WHEEL_RADIUS;
    const cast = (m: THREE.Mesh): THREE.Mesh => {
      m.castShadow = true;
      return m;
    };
    // --- Tyre: carcass torus + geometric knobs (tread blocks) so the silhouette is knobbly.
    // Front 21" (rim r 0.262, 2.75" section), rear 18" (rim r 0.228, 4.00" section): both 0.34 outer.
    const tyre = new THREE.Group();
    const carcass = cast(new THREE.Mesh(new THREE.TorusGeometry(rimR + section - 0.012, section, 10, 48), lib.get('tyre')));
    const knobGeos: THREE.BufferGeometry[] = [];
    const rows = 40;
    const kh = 0.022; // knob height
    for (let i = 0; i < rows; i++) {
      const a = (i / rows) * Math.PI * 2;
      const odd = i % 2 === 1;
      // Centre block on even rows, two shoulder blocks on odd rows (trials pattern).
      const cols = odd ? [-0.6 * section, 0.6 * section] : [0];
      for (const z of cols) {
        const rad = R - kh / 2 - 0.004 - Math.abs(z) * 0.3;
        const g = new THREE.BoxGeometry(0.03, kh, odd ? 0.55 * section : 0.8 * section);
        g.translate(0, rad, z);
        g.rotateZ(a);
        knobGeos.push(g);
      }
    }
    const knobs = cast(new THREE.Mesh(merge(knobGeos), lib.get('tyre')));
    tyre.add(carcass, knobs);
    mergeStaticChildren(tyre);
    tyre.scale.z = zScale;
    // --- Rim (alloy) + rim bed + hub
    const rim = cast(new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.015, 8, 48), lib.get('rim')));
    const rimBed = cast(new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, 0.03, 48, 1, true), lib.get('rim')));
    rimBed.rotation.x = Math.PI / 2;
    const hub = cast(new THREE.Mesh(lathe([[0, -0.08], [0.03, -0.08], [0.05, -0.06], [0.05, -0.045], [0.032, -0.03], [0.032, 0.03], [0.05, 0.045], [0.05, 0.06], [0.03, 0.08], [0, 0.08]], 14), lib.get('rim')));
    hub.rotation.x = Math.PI / 2;
    // Brake disc: wave-edged ring + 6 carrier bolts.
    const discGeo = new THREE.RingGeometry(0.07, 0.105, 36, 1);
    const dp = discGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < dp.count; i++) {
      const x = dp.getX(i);
      const y = dp.getY(i);
      const rr = Math.hypot(x, y);
      if (rr > 0.1) {
        const a = Math.atan2(y, x);
        const w = 1 + 0.05 * Math.sin(a * 8);
        dp.setXY(i, x * w, y * w);
      }
    }
    dp.needsUpdate = true;
    const disc = new THREE.Mesh(discGeo, lib.get('disc'));
    disc.position.z = discSide * 0.062;
    const boltGeos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      boltGeos.push(new THREE.CylinderGeometry(0.006, 0.006, 0.01, 6).rotateX(Math.PI / 2).translate(Math.cos(a) * 0.062, Math.sin(a) * 0.062, 0));
    }
    const bolts = new THREE.Mesh(merge(boltGeos), lib.get('disc'));
    bolts.position.z = discSide * 0.062;
    this.spinner.add(bolts);
    // Rear sprocket on the chain side: ring + 42 teeth.
    if (sprocket) {
      const sg: THREE.BufferGeometry[] = [new THREE.RingGeometry(0.06, 0.1, 42, 1)];
      for (let i = 0; i < 42; i++) {
        const a = (i / 42) * Math.PI * 2;
        sg.push(new THREE.BoxGeometry(0.008, 0.012, 0.004).translate(0, 0.105, 0).rotateZ(a));
      }
      const spr = new THREE.Mesh(merge(sg), lib.get('disc'));
      spr.position.z = -discSide * 0.13;
      this.spinner.add(spr);
    }
    // 32 spokes: 16 per side crossing hub→rim
    const spokeGeos: THREE.BufferGeometry[] = [];
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + (side > 0 ? 0.1 : 0);
        const hubA = a + 0.5 * side;
        const hx = Math.cos(hubA) * 0.048;
        const hy = Math.sin(hubA) * 0.048;
        const rx = Math.cos(a) * (rimR - 0.008);
        const ry = Math.sin(a) * (rimR - 0.008);
        const len = Math.hypot(rx - hx, ry - hy);
        const g = new THREE.CylinderGeometry(0.002, 0.002, len, 4, 1);
        g.rotateZ(-Math.atan2(rx - hx, ry - hy));
        g.translate((hx + rx) / 2, (hy + ry) / 2, side * 0.04);
        spokeGeos.push(g);
      }
    }
    this.spokeMat = fogify(lib.get('spoke').clone());
    this.spokeMat.transparent = true;
    this.spokes = new THREE.Mesh(merge(spokeGeos), this.spokeMat);
    // Blur disc: translucent grey disc that fades in with spin rate.
    this.blurMat = new THREE.MeshBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0, depthWrite: false });
    this.blur = new THREE.Mesh(new THREE.RingGeometry(0.05, rimR, 32), this.blurMat);
    this.blur.visible = false;
    this.tyre = tyre;
    this.tyreSquash.add(tyre);
    this.spinner.add(rim, rimBed, hub, disc, this.spokes);
    mergeStaticChildren(this.spinner, new Set([this.spokes]));
    this.root.add(this.tyreSquash, this.spinner, this.blur);
    this.contactMat = new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, opacity: 0.85, depthWrite: false, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.contact = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.42), this.contactMat);
    this.contact.renderOrder = 2;
    this.contact.frustumCulled = false;
  }

  /** Place the contact blob at the tyre's ground point; fade with height and compression. */
  setContact(gx: number, gy: number, groundAngle: number, grounded: boolean, compression: number, hover: number): void {
    const vis = grounded ? 1 : Math.max(0, 1 - hover / 0.6);
    this.contact.visible = vis > 0.02;
    this.contactMat.opacity = 0.55 * vis + 0.3 * compression * vis;
    this.contact.position.set(gx, gy + 0.006, 0);
    this.contact.rotation.set(-Math.PI / 2, 0, 0);
    this.contact.rotateOnWorldAxis(Z_AXIS, groundAngle);
    const s = 1 + 0.35 * compression;
    this.contact.scale.set(s, 1 + 0.15 * compression, 1);
    // Tyre contact-patch flattening: squash toward the ground by compression.
    const k = grounded ? 0.1 * (0.4 + compression) : 0;
    this.tyreSquash.scale.set(1, 1 - k, 1);
    this.tyreSquash.position.y = -WHEEL_RADIUS * k;
  }

  set(x: number, y: number, spin: number, spinVel: number): void {
    this.root.position.set(x, y, 0);
    this.spinner.rotation.z = -spin;
    this.tyre.rotation.z = -spin;
    // Spokes crossfade to the disc over |spinVel| ∈ [12, 30] rad/s.
    const t = Math.min(1, Math.max(0, (Math.abs(spinVel) - 12) / 18));
    this.spokeMat.opacity = 1 - t * 0.85;
    this.blurMat.opacity = t * 0.35;
    this.blur.visible = t > 0.01;
  }
}

export class BikeModel implements HeroBike {
  readonly root = new THREE.Group();
  /** Frame-attached parts (rotate with bike.angle). */
  readonly frame = new THREE.Group();
  readonly rear: Wheel;
  readonly front: Wheel;
  private readonly swingarm = new THREE.Group();
  /** Fork lowers + caliper + front fender: follows the front axle along the fork axis. */
  private readonly forkLower = new THREE.Group();
  private readonly forkUpper = new THREE.Group();
  private readonly shock = new THREE.Group();
  private readonly shockSpring: THREE.Mesh;
  private readonly shockLen0: number;
  private readonly chain: THREE.Mesh;
  private readonly chainMat: THREE.MeshStandardMaterial;
  private readonly chainTex: THREE.DataTexture;
  readonly placer = new FramePlacer();
  /** bike.pos → axle midpoint, in frame-local coords (calibrated). */
  get originOffset(): THREE.Vector2 {
    return this.placer.originOffset;
  }
  /** Frame-local attach points for the rider (updated per frame). */
  readonly barL = new THREE.Vector3();
  readonly pegL = new THREE.Vector3();
  readonly exhaustTip = new THREE.Vector3(-0.83, 0.41, 0.15);
  readonly frameLocal = new THREE.Matrix4();
  /** Approximate triangle count of the bike (both wheels included), for the hero budget. */
  readonly triangles: number;
  private readonly tmp = new THREE.Vector2();
  private readonly tmp3 = new THREE.Vector3();

  /** Per-bike paint clones (livery): same maps / defines as the library originals → same program. */
  private readonly paints: { frame: THREE.MeshStandardMaterial; frameLow: THREE.MeshStandardMaterial; body: THREE.MeshStandardMaterial; plate: THREE.MeshStandardMaterial };
  private livery: BikeClass = 'rookie';

  constructor(lib: MaterialLibrary) {
    const paint = lib.deriveHero('framePaint');
    const paintLow = lib.deriveHero('framePaintLow');
    const body = lib.deriveHero('bodyPaint');
    const plateMat = lib.deriveHero('numberPlate');
    this.paints = { frame: paint, frameLow: paintLow, body, plate: plateMat };
    applyPlate(plateMat, 'rookie');
    const chrome = lib.get('chrome');
    const black = lib.get('blackMatte');
    const gloss = lib.get('anodised');
    const engine = lib.get('engine');
    const alloy = lib.get('alloyBrushed');
    const brushed = lib.get('alloyBrushed');
    const anodised = lib.get('anodised');
    const B = BIKE;

    const cast = (m: THREE.Mesh): THREE.Mesh => {
      m.castShadow = true;
      return m;
    };
    const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

    // ---------------------------------------------------------------- frame
    // Twin spars (40 mm) from the head tube back over the engine to the swingarm pivot,
    // a downtube from the head bottom to the cradle under the engine, seat rails + struts.
    const spar: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      spar.push(tube([V(0.40, 0.62, s * 0.045), V(0.22, 0.60, s * 0.085), V(0.0, 0.50, s * 0.09), V(-0.16, 0.34, s * 0.085), V(-0.23, 0.2, s * 0.075), V(B.swingPivot.x, B.swingPivot.y - 0.03, s * 0.07)], 0.02, 10, 28));
      // Seat rails from the spar to the tail, and the strut from the pivot area.
      spar.push(tube([V(-0.06, 0.5, s * 0.06), V(-0.3, 0.485, s * 0.07), V(-0.58, 0.44, s * 0.06)], 0.012, 8, 12));
      spar.push(tube([V(-0.22, 0.24, s * 0.07), V(-0.52, 0.42, s * 0.06)], 0.011, 6, 4));
      // Pivot plates / engine mounts.
      spar.push(rbox(0.06, 0.14, 0.02, 0.008).translate(B.swingPivot.x, B.swingPivot.y + 0.01, s * 0.085));
    }
    // Downtube (single, then splits into the cradle).
    spar.push(tube([V(0.42, 0.47, 0), V(0.36, 0.30, 0), V(0.30, 0.10, 0)], 0.021, 10, 12));
    // Head tube along the fork axis.
    const forkDir = new THREE.Vector2().subVectors(B.frontAxleRest, B.headBottom).normalize();
    const forkAngle = Math.atan2(forkDir.y, forkDir.x) + Math.PI / 2;
    spar.push(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 12).rotateZ(forkAngle).translate((B.headTop.x + B.headBottom.x) / 2, (B.headTop.y + B.headBottom.y) / 2, 0));
    // Gusset between spars and downtube behind the head.
    spar.push(rbox(0.1, 0.12, 0.08, 0.01).rotateZ(-0.6).translate(0.36, 0.53, 0));
    const frameMesh = cast(new THREE.Mesh(merge(spar), paint));
    // Lower cradle tubes in the dusty paint variant (lower third of the bike).
    const cradle: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      cradle.push(tube([V(0.30, 0.10, 0), V(0.24, -0.04, s * 0.07), V(0.0, -0.08, s * 0.085), V(-0.2, -0.04, s * 0.08), V(B.swingPivot.x - 0.02, B.swingPivot.y - 0.05, s * 0.07)], 0.017, 8, 16));
    }
    // Bash plate under the cradle.
    cradle.push(rbox(0.4, 0.014, 0.2, 0.005).translate(0.02, -0.095, 0));
    const cradleMesh = cast(new THREE.Mesh(merge(cradle), paintLow));
    this.frame.add(frameMesh, cradleMesh);

    // ---------------------------------------------------------------- body plastics
    // Tank: slim, sits on the spars behind the head. Seat unit flows into the rear mudguard.
    const tank = cast(new THREE.Mesh(rbox(0.36, 0.13, 0.22, 0.05, 3), body));
    tank.position.set(0.12, 0.655, 0);
    tank.rotation.z = -0.12;
    const seat = cast(new THREE.Mesh(rbox(0.64, 0.065, 0.17, 0.028, 3), black));
    seat.position.set(-0.27, 0.575, 0);
    seat.rotation.z = 0.1;
    const seatBase = cast(new THREE.Mesh(rbox(0.7, 0.05, 0.19, 0.02, 2), black));
    seatBase.position.set(-0.3, 0.53, 0);
    seatBase.rotation.z = 0.1;
    const rearFender = cast(new THREE.Mesh(rbox(0.4, 0.02, 0.13, 0.01, 2), body));
    rearFender.position.set(-0.77, 0.455, 0);
    rearFender.rotation.z = 0.28;
    // Side panels under the seat with a small white number plate; airbox behind them.
    const airbox = cast(new THREE.Mesh(rbox(0.24, 0.18, 0.16, 0.03, 2), black));
    airbox.position.set(-0.4, 0.37, 0);
    this.frame.add(tank, seat, seatBase, rearFender, airbox);
    for (const s of [-1, 1]) {
      const panel = cast(new THREE.Mesh(rbox(0.24, 0.13, 0.014, 0.02, 2), body));
      panel.position.set(-0.45, 0.42, s * 0.1);
      panel.rotation.set(s * 0.12, 0, 0.12);
      const plate = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.006, 20).rotateX(Math.PI / 2), plateMat));
      plate.scale.set(1.15, 1, 1);
      plate.position.set(-0.47, 0.4, s * 0.112);
      this.frame.add(panel, plate);
      // Radiator shroud: small angled blue wing from the radiator back to the tank side.
      const shroud = cast(new THREE.Mesh(rbox(0.18, 0.14, 0.012, 0.015, 2), body));
      shroud.position.set(0.31, 0.5, s * 0.115);
      shroud.rotation.set(0, s * 0.4, -0.35);
      this.frame.add(shroud);
    }
    // Radiator (black core with alloy tanks) under the head tube.
    const radCore = cast(new THREE.Mesh(rbox(0.045, 0.2, 0.18, 0.005), black));
    radCore.position.set(0.37, 0.38, 0);
    radCore.rotation.z = -0.25;
    const radCap = cast(new THREE.Mesh(rbox(0.05, 0.03, 0.19, 0.008), brushed));
    radCap.position.set(0.345, 0.485, 0);
    this.frame.add(radCore, radCap);

    // ---------------------------------------------------------------- engine
    const cases = cast(new THREE.Mesh(rbox(0.36, 0.26, 0.24, 0.05, 3), engine));
    cases.position.set(-0.03, 0.12, 0);
    const casesLow = cast(new THREE.Mesh(rbox(0.3, 0.1, 0.22, 0.03, 2), engine));
    casesLow.position.set(-0.02, -0.02, 0);
    // Cylinder leaning forward with fins, alloy head cover on top, carb behind.
    const cyl = new THREE.Group();
    const finGeos: THREE.BufferGeometry[] = [];
    finGeos.push(new THREE.CylinderGeometry(0.075, 0.08, 0.2, 18).translate(0, 0.1, 0));
    for (let i = 0; i < 7; i++) finGeos.push(new THREE.CylinderGeometry(0.1, 0.1, 0.007, 18).translate(0, 0.03 + i * 0.026, 0));
    const fins = cast(new THREE.Mesh(merge(finGeos), engine));
    const headCover = cast(new THREE.Mesh(rbox(0.17, 0.06, 0.17, 0.02, 2), brushed));
    headCover.position.y = 0.235;
    const plug = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), alloy));
    plug.position.set(0, 0.28, 0);
    cyl.add(fins, headCover, plug);
    cyl.position.set(0.06, 0.24, 0);
    cyl.rotation.z = -0.18;
    const carb = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 12).rotateZ(Math.PI / 2), alloy));
    carb.position.set(-0.13, 0.4, 0);
    const boot = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.045, 0.1, 12).rotateZ(Math.PI / 2), black));
    boot.position.set(-0.22, 0.4, 0);
    // Clutch cover (camera side), ignition cover (far side), sprocket cover, water pump.
    const clutch = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.1, 0.035, 24).rotateX(Math.PI / 2), brushed));
    clutch.position.set(0.02, 0.1, 0.135);
    const clutchRib = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.012, 20).rotateX(Math.PI / 2), brushed));
    clutchRib.position.set(0.02, 0.1, 0.158);
    const ignition = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.09, 0.03, 24).rotateX(Math.PI / 2), brushed));
    ignition.position.set(0.0, 0.1, -0.135);
    const sprocketCover = cast(new THREE.Mesh(rbox(0.12, 0.1, 0.02, 0.02), black));
    sprocketCover.position.set(-0.16, 0.14, 0.125);
    const pump = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 12).rotateX(Math.PI / 2), brushed));
    pump.position.set(0.14, 0.06, -0.12);
    // Kick lever far side, brake pedal near side, gear lever far side.
    const kick = cast(new THREE.Mesh(tube([V(0.02, 0.1, -0.16), V(-0.02, 0.28, -0.19), V(-0.1, 0.34, -0.2)], 0.009, 6, 8), alloy));
    const pedal = cast(new THREE.Mesh(tube([V(-0.14, 0.02, 0.2), V(0.02, 0.0, 0.22), V(0.12, 0.02, 0.22)], 0.008, 6, 8), alloy));
    const shifter = cast(new THREE.Mesh(tube([V(-0.2, 0.04, -0.18), V(-0.04, 0.02, -0.21), V(0.04, 0.05, -0.22)], 0.008, 6, 8), alloy));
    this.frame.add(cases, casesLow, cyl, carb, boot, clutch, clutchRib, ignition, sprocketCover, pump, kick, pedal, shifter);

    // ---------------------------------------------------------------- exhaust
    // Header from the front of the cylinder, down under the engine, back up to the
    // silencer on the camera side under the seat.
    const header = cast(
      new THREE.Mesh(
        tube([V(0.14, 0.42, 0.03), V(0.28, 0.40, 0.07), V(0.36, 0.22, 0.1), V(0.3, -0.04, 0.115), V(0.05, -0.12, 0.11), V(-0.2, -0.08, 0.12), V(-0.34, 0.06, 0.135), V(-0.42, 0.2, 0.15), V(-0.46, 0.29, 0.15)], 0.02, 10, 48, 0.3),
        brushed,
      ),
    );
    const silencer = cast(new THREE.Mesh(lathe([[0, 0], [0.03, 0.0], [0.045, 0.03], [0.05, 0.1], [0.05, 0.3], [0.045, 0.36], [0.02, 0.38], [0.02, 0.4], [0, 0.4]], 16), black));
    silencer.rotation.z = Math.PI / 2 - 0.3;
    silencer.position.set(-0.44, 0.29, 0.15);
    this.frame.add(header, silencer);

    // ---------------------------------------------------------------- bars, controls, pegs
    const gz = B.gripZ;
    const bars = cast(
      new THREE.Mesh(
        tube([V(B.grip.x - 0.02, B.grip.y - 0.005, -B.barHalfWidth), V(B.grip.x, B.grip.y, -gz + 0.08), V(B.barCentre.x, B.barCentre.y + 0.02, -0.12), V(B.barCentre.x, B.barCentre.y + 0.02, 0.12), V(B.grip.x, B.grip.y, gz - 0.08), V(B.grip.x - 0.02, B.grip.y - 0.005, B.barHalfWidth)], 0.013, 8, 32, 0.4),
        brushed,
      ),
    );
    const crossbar = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6).rotateX(Math.PI / 2), brushed));
    crossbar.position.set(B.barCentre.x + 0.03, B.barCentre.y + 0.06, 0);
    const barPad = cast(new THREE.Mesh(rbox(0.05, 0.05, 0.16, 0.015), body));
    barPad.position.copy(crossbar.position);
    // Front number plate hangs off the bars.
    const numberPlate = cast(new THREE.Mesh(rbox(0.012, 0.16, 0.15, 0.02, 2), plateMat));
    numberPlate.position.set(0.42, 0.74, 0);
    numberPlate.rotation.z = -0.35;
    // Risers: from the top clamp up to the bar clamp.
    for (const s of [-1, 1]) {
      const riser = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.09, 8), brushed));
      riser.position.set(B.barCentre.x + 0.01, B.barCentre.y - 0.03, s * 0.05);
      riser.rotation.z = forkAngle;
      this.frame.add(riser);
    }
    this.frame.add(bars, crossbar, barPad, numberPlate);
    for (const s of [-1, 1]) {
      const grip = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.016, 0.13, 10).rotateX(Math.PI / 2), black));
      grip.position.set(B.grip.x, B.grip.y, s * gz);
      const gripEnd = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 10).rotateX(Math.PI / 2), black));
      gripEnd.position.set(B.grip.x - 0.01, B.grip.y, s * (gz + 0.065));
      // Lever (brake near side, clutch far side): perch + blade ahead of the grip.
      const perch = cast(new THREE.Mesh(rbox(0.04, 0.03, 0.03, 0.008), gloss));
      perch.position.set(B.grip.x + 0.01, B.grip.y, s * (gz - 0.1));
      const lever = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, 0.15, 6).rotateX(Math.PI / 2).rotateY(-0.35), brushed));
      lever.position.set(B.grip.x + 0.06, B.grip.y - 0.005, s * (gz - 0.03));
      lever.rotation.y = s > 0 ? 0 : Math.PI;
      this.frame.add(grip, gripEnd, perch, lever);
      // Pegs: alloy platform + black mount.
      const peg = cast(new THREE.Mesh(rbox(0.1, 0.014, 0.09, 0.004), brushed));
      peg.position.set(B.pegs.x, B.pegs.y, s * B.pegHalfWidth);
      const pegMount = cast(new THREE.Mesh(rbox(0.05, 0.05, 0.06, 0.01), black));
      pegMount.position.set(B.pegs.x - 0.02, B.pegs.y + 0.02, s * (B.pegHalfWidth - 0.075));
      this.frame.add(peg, pegMount);
    }
    // Cables: front brake hose down the near fork leg, clutch cable to the engine, throttle to the carb.
    const cables = cast(
      new THREE.Mesh(
        merge([
          tube([V(B.grip.x + 0.03, B.grip.y - 0.02, gz - 0.1), V(0.44, 0.62, 0.12), V(0.5, 0.4, 0.1), V(0.57, 0.2, 0.09), V(0.6, 0.08, 0.085)], 0.0035, 5, 16),
          tube([V(B.grip.x + 0.03, B.grip.y - 0.02, -gz + 0.1), V(0.3, 0.68, -0.08), V(0.1, 0.5, -0.12), V(0.02, 0.28, -0.14)], 0.0035, 5, 16),
          tube([V(B.grip.x + 0.02, B.grip.y - 0.03, gz - 0.02), V(0.3, 0.66, 0.1), V(0.0, 0.5, 0.05), V(-0.13, 0.43, 0.02)], 0.003, 5, 16),
        ]),
        black,
      ),
    );
    this.frame.add(cables);
    // Triple clamps (brushed alloy) along the fork axis.
    const clampT = cast(new THREE.Mesh(rbox(0.055, 0.028, 0.23, 0.01), brushed));
    clampT.position.set(B.headTop.x - 0.01, B.headTop.y + 0.01, 0);
    clampT.rotation.z = forkAngle;
    const clampB = cast(new THREE.Mesh(rbox(0.06, 0.032, 0.24, 0.01), brushed));
    clampB.position.set(B.headBottom.x, B.headBottom.y - 0.02, 0);
    clampB.rotation.z = forkAngle;
    this.frame.add(clampT, clampB);

    // ---------------------------------------------------------------- forks
    // Upper: black tube above the bottom clamp, silver stanchion below it (fixed to the frame).
    this.forkUpper.position.set(B.headBottom.x, B.headBottom.y, 0);
    this.forkUpper.rotation.z = forkAngle;
    for (const s of [-1, 1]) {
      const z = s * 0.105;
      const top = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.24, 12), gloss));
      top.position.set(0, 0.12, z);
      const stanchion = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.32, 12), chrome));
      stanchion.position.set(0, -0.16, z);
      const seal = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 12), anodised));
      seal.position.set(0, -0.06, z);
      this.forkUpper.add(top, stanchion, seal);
    }
    // Lower: anodised sliders from the axle up (0.34), blue fork guards, caliper, fender.
    for (const s of [-1, 1]) {
      const z = s * 0.105;
      const slider = cast(new THREE.Mesh(lathe([[0, 0], [0.03, 0], [0.032, 0.05], [0.026, 0.12], [0.026, 0.33], [0.021, 0.34], [0, 0.34]], 12), anodised));
      slider.position.set(0, 0, z);
      const guard = cast(new THREE.Mesh(rbox(0.03, 0.26, 0.06, 0.012, 2), body));
      guard.position.set(0.028, 0.2, z);
      const lug = cast(new THREE.Mesh(rbox(0.05, 0.05, 0.04, 0.01), anodised));
      lug.position.set(0, 0.02, z);
      this.forkLower.add(slider, guard, lug);
    }
    const caliper = cast(new THREE.Mesh(rbox(0.05, 0.09, 0.045, 0.012, 2), gloss));
    caliper.position.set(-0.035, 0.085, 0.075);
    // Front fender: a flat torus arc hugging the tyre (inside the fork legs).
    const fender = cast(new THREE.Mesh(new THREE.TorusGeometry(0.385, 0.011, 4, 20, 1.5), body));
    fender.scale.set(1, 1, 5.5);
    fender.rotation.z = 0.65;
    fender.position.set(0.0, 0.0, 0);
    this.forkLower.add(caliper, fender);
    this.forkLower.rotation.z = forkAngle;
    this.frame.add(this.forkUpper, this.forkLower);

    // ---------------------------------------------------------------- swingarm
    this.swingarm.position.set(B.swingPivot.x, B.swingPivot.y, 0);
    const armLen = B.swingPivot.distanceTo(B.rearAxleRest);
    for (const s of [-1, 1]) {
      const arm = cast(new THREE.Mesh(rbox(armLen + 0.04, 0.05, 0.03, 0.01), brushed));
      arm.position.set(armLen / 2, -0.005, s * 0.1);
      const armTaper = cast(new THREE.Mesh(rbox(0.16, 0.075, 0.032, 0.012), brushed));
      armTaper.position.set(0.1, 0.0, s * 0.1);
      const axleBlock = cast(new THREE.Mesh(rbox(0.06, 0.06, 0.035, 0.01), anodised));
      axleBlock.position.set(armLen, 0, s * 0.1);
      this.swingarm.add(arm, armTaper, axleBlock);
    }
    const brace = cast(new THREE.Mesh(rbox(0.06, 0.05, 0.2, 0.01), brushed));
    brace.position.set(0.08, 0.02, 0);
    const guide = cast(new THREE.Mesh(rbox(0.09, 0.06, 0.03, 0.01), anodised));
    guide.position.set(armLen - 0.16, -0.055, 0.135);
    const linkage = cast(new THREE.Mesh(rbox(0.06, 0.04, 0.12, 0.01), anodised));
    linkage.position.set(armLen * B.shockSwing, 0.03, 0);
    this.swingarm.add(brace, guide, linkage);
    this.frame.add(this.swingarm);

    // ---------------------------------------------------------------- rear shock
    // Group along +y from the top mount; body + reservoir + coil that compresses with length.
    const shockBody = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.16, 12).translate(0, 0.08, 0), anodised));
    const shockShaft = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.34, 8).translate(0, 0.17, 0), chrome));
    const reservoir = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.09, 10).translate(0.04, 0.09, 0), anodised));
    const collar = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.02, 12).translate(0, 0.17, 0), anodised));
    this.shockLen0 = new THREE.Vector2(B.swingPivot.x + (B.rearAxleRest.x - B.swingPivot.x) * B.shockSwing, B.swingPivot.y + (B.rearAxleRest.y - B.swingPivot.y) * B.shockSwing + 0.03).distanceTo(B.shockTop);
    this.shockSpring = cast(new THREE.Mesh(coil(0.034, 0.005, 0.2, 7.5).translate(0, 0.17, 0), lib.get('shockSpring')));
    this.shock.add(shockBody, shockShaft, reservoir, collar, this.shockSpring);
    this.frame.add(this.shock);

    // ---------------------------------------------------------------- chain (camera side)
    const sprR = 0.1;
    const sprF = 0.04;
    const chainZ = 0.135;
    const chainPts: THREE.Vector3[] = [];
    const rc = B.rearAxleRest;
    const fc = new THREE.Vector2(B.swingPivot.x + 0.04, B.swingPivot.y + 0.02);
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI / 2 + (i / n) * Math.PI;
      chainPts.push(new THREE.Vector3(rc.x + Math.cos(a) * sprR, rc.y + Math.sin(a) * sprR, chainZ));
    }
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI;
      chainPts.push(new THREE.Vector3(fc.x + Math.cos(a) * sprF, fc.y + Math.sin(a) * sprF + (i === 0 ? -0.02 : 0), chainZ));
    }
    const chainCurve = new THREE.CatmullRomCurve3(chainPts, true, 'catmullrom', 0.5);
    const chainGeo = new THREE.TubeGeometry(chainCurve, 96, 0.008, 4, true);
    const cd = new Uint8Array([40, 40, 44, 255, 120, 120, 128, 255]);
    this.chainTex = new THREE.DataTexture(cd, 2, 1, THREE.RGBAFormat);
    this.chainTex.wrapS = THREE.RepeatWrapping;
    this.chainTex.repeat.set(90, 1);
    this.chainTex.magFilter = THREE.NearestFilter;
    this.chainTex.needsUpdate = true;
    this.chainMat = fogify(new THREE.MeshStandardMaterial({ map: this.chainTex, roughness: 0.4, metalness: 0.9 }));
    lib.complete(this.chainMat);
    this.chain = new THREE.Mesh(chainGeo, this.chainMat);
    const sprocketF = cast(new THREE.Mesh(new THREE.CylinderGeometry(sprF, sprF, 0.006, 16).rotateX(Math.PI / 2), brushed));
    sprocketF.position.set(fc.x, fc.y, chainZ);
    this.frame.add(this.chain, sprocketF);

    // One draw per material for the static frame parts; the animated parts stay separate.
    mergeStaticChildren(this.frame, new Set([this.swingarm, this.forkUpper, this.forkLower, this.shock, this.chain]));
    mergeStaticChildren(this.swingarm);
    mergeStaticChildren(this.forkUpper);
    mergeStaticChildren(this.forkLower);
    mergeStaticChildren(this.shock, new Set([this.shockSpring]));

    this.rear = new Wheel(lib, -1, true, 0.228, 0.056, 1);
    this.front = new Wheel(lib, 1, false, 0.262, 0.036, 0.85);
    this.root.add(this.frame, this.rear.root, this.front.root, this.rear.contact, this.front.contact);
    let tris = 0;
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const g = m.geometry;
      tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    });
    this.triangles = Math.round(tris);
  }

  /** Ground height / slope sampler supplied by the renderer (profile). */
  ground: ((x: number) => { y: number; angle: number }) | null = null;

  private placeContact(w: Wheel, wx: number, wy: number, grounded: boolean, compression: number, bikeAngle: number): void {
    if (grounded) {
      const nx = -Math.sin(bikeAngle);
      const ny = Math.cos(bikeAngle);
      w.setContact(wx - nx * WHEEL_RADIUS, wy - ny * WHEEL_RADIUS, bikeAngle, true, compression, 0);
      return;
    }
    const g = this.ground ? this.ground(wx) : { y: wy - WHEEL_RADIUS, angle: 0 };
    w.setContact(wx, g.y, g.angle, false, 0, Math.max(0, wy - WHEEL_RADIUS - g.y));
  }

  get contacts(): THREE.Object3D[] {
    return [this.rear.contact, this.front.contact];
  }

  setLivery(cls: BikeClass): void {
    if (cls === this.livery) return;
    this.livery = cls;
    const L = LIVERIES[cls];
    const P = this.paints;
    P.frame.color.setHex(L.frame);
    P.frame.roughness = L.frameRough;
    P.frame.metalness = L.frameMetal;
    P.frameLow.color.setHex(L.frameLow);
    P.frameLow.roughness = cls === 'pro' ? 0.45 : 0.62;
    P.frameLow.metalness = cls === 'pro' ? 0.9 : 0.4;
    P.body.color.setHex(L.body);
    P.body.roughness = L.bodyRough;
    P.body.metalness = L.bodyMetal;
    applyPlate(P.plate, cls);
  }

  dispose(): void {
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
    for (const m of Object.values(this.paints)) m.dispose();
  }

  /** Pose from the interpolated frame. */
  update(f: RenderFrame): void {
    this.placer.place(f, this.frame);
    this.frameLocal.copy(this.frame.matrixWorld);

    this.rear.set(f.rear.x, f.rear.y, f.rear.spin, f.rear.spinVel);
    this.front.set(f.front.x, f.front.y, f.front.spin, f.front.spinVel);
    this.placeContact(this.rear, f.rear.x, f.rear.y, f.rear.grounded, f.rear.compression, f.bikeAngle);
    this.placeContact(this.front, f.front.x, f.front.y, f.front.grounded, f.front.compression, f.bikeAngle);

    // Rear axle in frame-local → aim swingarm.
    const ra = this.toLocal(f.rear.x, f.rear.y);
    const B = BIKE;
    this.swingarm.rotation.z = Math.atan2(ra.y - B.swingPivot.y, ra.x - B.swingPivot.x);
    // Shock between shockTop and the linkage on the swingarm; the coil scales with length.
    const sx = B.swingPivot.x + (ra.x - B.swingPivot.x) * B.shockSwing;
    const sy = B.swingPivot.y + (ra.y - B.swingPivot.y) * B.shockSwing + 0.03;
    const dx = sx - B.shockTop.x;
    const dy = sy - B.shockTop.y;
    const len = Math.hypot(dx, dy);
    this.shock.position.set(B.shockTop.x, B.shockTop.y, 0);
    this.shock.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
    const k = len / this.shockLen0;
    this.shockSpring.scale.y = Math.max(0.55, Math.min(1.25, k));
    this.shockSpring.position.y = 0.17 * (k - 1);
    // Front axle in frame-local → fork lowers slide along the fork axis.
    const fa = this.toLocal(f.front.x, f.front.y);
    const fdx = B.headBottom.x - fa.x;
    const fdy = B.headBottom.y - fa.y;
    this.forkLower.position.set(fa.x, fa.y, 0);
    this.forkLower.rotation.z = Math.atan2(fdy, fdx) - Math.PI / 2;

    // Chain scroll: link pitch 0.0127 m, rear sprocket r 0.10.
    this.chainTex.offset.x = (f.rear.spin * 0.1) / 0.0127 / 90;

    // Rider attach points (frame-local).
    this.barL.set(B.grip.x, B.grip.y, B.gripZ);
    this.pegL.set(B.pegs.x, B.pegs.y + 0.01, B.pegHalfWidth);
  }

  /** World XY → frame-local XY. */
  toLocal(x: number, y: number): THREE.Vector2 {
    this.tmp3.set(x, y, 0);
    this.frame.worldToLocal(this.tmp3);
    return this.tmp.set(this.tmp3.x, this.tmp3.y);
  }

  /** Frame-local point → world. */
  toWorld(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(x, y, z).applyMatrix4(this.frameLocal);
  }
}
