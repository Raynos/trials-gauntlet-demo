/**
 * Trials bike from lathe / tube / primitives. The frame is one Group placed at
 * the physics body pose; wheels are placed at the exact physics wheel
 * positions so suspension travel is what physics says it is, and the forks /
 * swingarm / shock stretch to meet them.
 *
 * Frame-local coordinates: origin = midpoint of the axles at static sag,
 * x forward, y up, z toward the camera. Calibrated on the first grounded frame.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../materials/library';
import type { RenderFrame } from '../frame';
import { WHEEL_RADIUS } from '../frame';
import { mergeStaticChildren } from '../util/merge';
import { fogify } from '../lighting/environment';

export const BIKE = {
  rearAxleRest: new THREE.Vector2(-0.65, 0),
  frontAxleRest: new THREE.Vector2(0.65, 0),
  swingPivot: new THREE.Vector2(-0.2, 0.12),
  headTop: new THREE.Vector2(0.40, 0.74),
  headBottom: new THREE.Vector2(0.46, 0.58),
  barCentre: new THREE.Vector2(0.36, 0.86),
  barHalfWidth: 0.38,
  pegs: new THREE.Vector2(-0.1, -0.02),
  pegHalfWidth: 0.2,
  seatTop: new THREE.Vector2(-0.3, 0.5),
  shockTop: new THREE.Vector2(0.02, 0.5),
  shockSwing: 0.55, // fraction along the swingarm from the pivot
};

function tube(points: THREE.Vector3[], r: number, radial = 8, seg = 24): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.2);
  return new THREE.TubeGeometry(curve, seg, r, radial, false);
}

function lathe(profile: [number, number][], segments = 16): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
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

export class Wheel {
  readonly root = new THREE.Group();
  readonly spinner = new THREE.Group();
  private readonly spokes: THREE.Mesh;
  private readonly blur: THREE.Mesh;
  private readonly blurMat: THREE.MeshBasicMaterial;
  private readonly spokeMat: THREE.MeshStandardMaterial;
  private readonly tyre: THREE.Mesh;
  private readonly tyreSquash = new THREE.Group();
  /** Contact-shadow blob on the ground under the tyre (world space, added to the scene root). */
  readonly contact: THREE.Mesh;
  private readonly contactMat: THREE.MeshBasicMaterial;

  constructor(lib: MaterialLibrary) {
    const R = WHEEL_RADIUS;
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(R - 0.075, 0.075, 12, 44), lib.get('tyre'));
    tyre.castShadow = true;
    // Rim + hub
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.016, 8, 40), lib.get('rim'));
    rim.castShadow = true;
    const hub = new THREE.Mesh(lathe([[0, -0.07], [0.055, -0.07], [0.055, -0.03], [0.035, -0.02], [0.035, 0.02], [0.055, 0.03], [0.055, 0.07], [0, 0.07]], 14), lib.get('chrome'));
    hub.rotation.x = Math.PI / 2;
    // Brake disc
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.006, 24), lib.get('exhaust'));
    disc.rotation.x = Math.PI / 2;
    disc.position.z = 0.055;
    // 32 spokes: 16 per side crossing hub→rim
    const spokeGeos: THREE.BufferGeometry[] = [];
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + (side > 0 ? 0.1 : 0);
        const hubA = a + 0.45 * side;
        const hx = Math.cos(hubA) * 0.05;
        const hy = Math.sin(hubA) * 0.05;
        const rx = Math.cos(a) * 0.24;
        const ry = Math.sin(a) * 0.24;
        const len = Math.hypot(rx - hx, ry - hy);
        const g = new THREE.CylinderGeometry(0.0022, 0.0022, len, 4, 1);
        g.rotateZ(-Math.atan2(rx - hx, ry - hy));
        g.translate((hx + rx) / 2, (hy + ry) / 2, side * 0.035);
        spokeGeos.push(g);
      }
    }
    this.spokeMat = fogify(lib.get('spoke').clone());
    this.spokeMat.transparent = true;
    this.spokes = new THREE.Mesh(mergeGeometries(spokeGeos, false)!, this.spokeMat);
    // Blur disc: translucent grey disc that fades in with spin rate.
    this.blurMat = new THREE.MeshBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0, depthWrite: false });
    this.blur = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.245, 32), this.blurMat);
    this.blur.visible = false;
    this.tyre = tyre;
    this.tyreSquash.add(tyre);
    this.spinner.add(rim, hub, disc, this.spokes);
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
    const k = grounded ? 0.07 * (0.4 + compression) : 0;
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

export class BikeModel {
  readonly root = new THREE.Group();
  /** Frame-attached parts (rotate with bike.angle). */
  readonly frame = new THREE.Group();
  readonly rear: Wheel;
  readonly front: Wheel;
  private readonly swingarm = new THREE.Group();
  private readonly forkLowerL: THREE.Mesh;
  private readonly forkLowerR: THREE.Mesh;
  private readonly forkUpper = new THREE.Group();
  private readonly shock: THREE.Mesh;
  private readonly shockSpring: THREE.Mesh;
  private readonly chain: THREE.Mesh;
  private readonly chainMat: THREE.MeshStandardMaterial;
  private readonly chainTex: THREE.DataTexture;
  /** bike.pos → axle midpoint, in frame-local coords (calibrated). */
  private readonly originOffset = new THREE.Vector2(0, -0.2);
  private calibrated = false;
  /** World-space bar ends / pegs for the rider (frame-local, updated per frame). */
  readonly barL = new THREE.Vector3();
  readonly pegL = new THREE.Vector3();
  readonly exhaustTip = new THREE.Vector3(-0.62, 0.42, 0.17);
  readonly frameLocal = new THREE.Matrix4();
  private readonly tmp = new THREE.Vector2();
  private readonly tmp3 = new THREE.Vector3();

  constructor(lib: MaterialLibrary) {
    const paint = lib.get('framePaint');
    const chrome = lib.get('chrome');
    const black = lib.get('blackMatte');
    const gloss = lib.get('blackGloss');
    const engine = lib.get('engine');
    const B = BIKE;

    const cast = (m: THREE.Mesh): THREE.Mesh => {
      m.castShadow = true;
      return m;
    };

    // --- Frame: twin spars from the head down to the swingarm pivot, downtube, subframe.
    const frameGeos: THREE.BufferGeometry[] = [];
    for (const z of [-0.07, 0.07]) {
      frameGeos.push(tube([new THREE.Vector3(B.headTop.x, B.headTop.y - 0.04, z * 0.6), new THREE.Vector3(0.2, 0.55, z), new THREE.Vector3(-0.05, 0.42, z * 1.3), new THREE.Vector3(-0.18, 0.22, z * 1.4), new THREE.Vector3(B.swingPivot.x, B.swingPivot.y, z * 1.3)], 0.024));
    }
    // Downtube + cradle under the engine.
    frameGeos.push(tube([new THREE.Vector3(B.headBottom.x, B.headBottom.y, 0), new THREE.Vector3(0.3, 0.3, 0), new THREE.Vector3(0.22, -0.02, 0), new THREE.Vector3(-0.05, -0.06, 0), new THREE.Vector3(B.swingPivot.x - 0.03, 0.02, 0)], 0.026));
    // Subframe to the seat/rear.
    for (const z of [-0.06, 0.06]) {
      frameGeos.push(tube([new THREE.Vector3(-0.02, 0.44, z), new THREE.Vector3(-0.3, 0.46, z * 1.4), new THREE.Vector3(-0.55, 0.4, z * 1.2)], 0.016));
      frameGeos.push(tube([new THREE.Vector3(-0.15, 0.2, z * 1.4), new THREE.Vector3(-0.5, 0.38, z * 1.2)], 0.014, 6, 4));
    }
    // Head tube
    frameGeos.push(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 12).rotateZ(-0.35).translate((B.headTop.x + B.headBottom.x) / 2, (B.headTop.y + B.headBottom.y) / 2, 0));
    const frameMesh = cast(new THREE.Mesh(mergeGeometries(frameGeos, false)!, paint));
    this.frame.add(frameMesh);

    // --- Tank + seat + shrouds + side panels. Body colour is blue; white is kept
    // for two small number plates (reference: dark-blue frame, black engine mass,
    // silver forks/rims, small white plates).
    const body = lib.get('bodyPaint');
    const alloy = lib.get('alloy');
    const tank = cast(new THREE.Mesh(lathe([[0, 0], [0.12, 0.02], [0.15, 0.1], [0.13, 0.2], [0.06, 0.26], [0, 0.27]], 14), body));
    tank.rotation.z = -Math.PI / 2 + 0.35;
    tank.position.set(0.02, 0.56, 0);
    tank.scale.set(1, 1.2, 0.9);
    const seat = cast(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.2), lib.get('seat')));
    seat.position.set(B.seatTop.x, B.seatTop.y, 0);
    seat.rotation.z = 0.06;
    const rearFender = cast(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.16), body));
    rearFender.position.set(-0.68, 0.44, 0);
    rearFender.rotation.z = 0.25;
    const frontFender = cast(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.03, 0.15), body));
    frontFender.rotation.z = -0.15;
    // Radiator shrouds: angled blue panels either side of the tank front, radiators (black) behind them.
    for (const z of [-1, 1]) {
      const shroud = cast(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.02), body));
      shroud.position.set(0.22, 0.5, z * 0.15);
      shroud.rotation.set(0, z * 0.35, -0.3);
      const rad = cast(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.1), black));
      rad.position.set(0.28, 0.4, z * 0.11);
      const side = cast(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.02), body));
      side.position.set(-0.36, 0.3, z * 0.13);
      // Small white side number plate on the panel.
      const plate = cast(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 0.008), lib.get('numberPlate')));
      plate.position.set(-0.36, 0.31, z * 0.145);
      this.frame.add(shroud, rad, side, plate);
    }
    const numberPlate = cast(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.17), lib.get('numberPlate')));
    numberPlate.position.set(0.5, 0.9, 0);
    numberPlate.rotation.z = -0.35;
    this.frame.add(tank, seat, rearFender, numberPlate);

    // --- Engine: black cases, finned cylinder + head, alloy covers, dusty lower cases.
    const cases = cast(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.3), engine));
    cases.position.set(0.02, 0.13, 0);
    const sump = cast(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.28), lib.get('engineDusty')));
    sump.position.set(0.02, 0.0, 0);
    const finGeos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) finGeos.push(new THREE.BoxGeometry(0.17, 0.012, 0.21).translate(0, i * 0.03, 0));
    for (let i = 0; i < 5; i++) finGeos.push(new THREE.BoxGeometry(0.12, 0.012, 0.16).translate(0.01, 0.015 + i * 0.03, 0));
    const fins = cast(new THREE.Mesh(mergeGeometries(finGeos, false)!, engine));
    fins.position.set(0.12, 0.24, 0);
    fins.rotation.z = -0.2;
    const head = cast(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.19), alloy));
    head.position.set(0.155, 0.43, 0);
    head.rotation.z = -0.2;
    const clutch = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 20), alloy));
    clutch.rotation.x = Math.PI / 2;
    clutch.position.set(-0.02, 0.12, 0.17);
    const ignition = clutch.clone();
    ignition.position.z = -0.17;
    const kick = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), alloy));
    kick.position.set(-0.08, 0.2, 0.2);
    kick.rotation.z = 0.5;
    this.frame.add(cases, sump, fins, head, clutch, ignition, kick);

    // --- Exhaust: header out of the cylinder, up and back to the muffler on the near side.
    const header = cast(new THREE.Mesh(tube([new THREE.Vector3(0.2, 0.36, 0.04), new THREE.Vector3(0.36, 0.3, 0.1), new THREE.Vector3(0.3, 0.16, 0.19), new THREE.Vector3(0.05, 0.2, 0.2), new THREE.Vector3(-0.25, 0.36, 0.18), new THREE.Vector3(-0.42, 0.42, 0.17)], 0.024, 10, 32), lib.get('exhaust')));
    const muffler = cast(new THREE.Mesh(lathe([[0, 0], [0.045, 0.01], [0.05, 0.3], [0.03, 0.34], [0.02, 0.34]], 14), lib.get('exhaust')));
    muffler.rotation.z = Math.PI / 2 - 0.15;
    muffler.position.set(-0.36, 0.43, 0.17);
    this.frame.add(header, muffler);

    // --- Bars, levers, grips, pegs
    const bars = cast(new THREE.Mesh(tube([new THREE.Vector3(B.barCentre.x - 0.05, B.barCentre.y - 0.08, -B.barHalfWidth), new THREE.Vector3(B.barCentre.x, B.barCentre.y, -0.2), new THREE.Vector3(B.barCentre.x, B.barCentre.y - 0.03, 0), new THREE.Vector3(B.barCentre.x, B.barCentre.y, 0.2), new THREE.Vector3(B.barCentre.x - 0.05, B.barCentre.y - 0.08, B.barHalfWidth)], 0.014, 8, 20), chrome));
    for (const z of [-1, 1]) {
      const grip = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), black));
      grip.rotation.x = Math.PI / 2;
      grip.position.set(B.barCentre.x - 0.04, B.barCentre.y - 0.07, z * (B.barHalfWidth - 0.05));
      this.frame.add(grip);
      const peg = cast(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.09), gloss));
      peg.position.set(B.pegs.x, B.pegs.y, z * B.pegHalfWidth);
      this.frame.add(peg);
    }
    // Triple clamps
    const clampT = cast(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.24), lib.get('alloy')));
    clampT.position.set(B.headTop.x, B.headTop.y + 0.02, 0);
    const clampB = cast(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.24), lib.get('alloy')));
    clampB.position.set(B.headBottom.x - 0.01, B.headBottom.y, 0);
    this.frame.add(bars, clampT, clampB);

    // --- Forks: upper tubes fixed to the frame, lower sliders follow the front axle.
    const forkDir = new THREE.Vector2().subVectors(B.frontAxleRest, B.headBottom).normalize();
    const forkAngle = Math.atan2(forkDir.y, forkDir.x) + Math.PI / 2; // cylinder y axis → fork axis
    this.forkUpper.position.set(B.headBottom.x, B.headBottom.y, 0);
    this.forkUpper.rotation.z = forkAngle;
    for (const z of [-0.1, 0.1]) {
      const up = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.42, 10), chrome));
      up.position.set(0, -0.21 + 0.12, z);
      this.forkUpper.add(up);
      const upTop = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.2, 10), gloss));
      upTop.position.set(0, 0.2, z);
      this.forkUpper.add(upTop);
    }
    const lowerGeo = new THREE.CylinderGeometry(0.029, 0.026, 0.38, 10).translate(0, 0.19, 0);
    this.forkLowerL = cast(new THREE.Mesh(lowerGeo, lib.get('engineDusty')));
    this.forkLowerR = cast(new THREE.Mesh(lowerGeo, lib.get('engineDusty')));
    this.frame.add(this.forkUpper, this.forkLowerL, this.forkLowerR, frontFender);
    frontFender.position.set(0.55, 0.45, 0);
    // Front brake caliper
    const caliper = cast(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.04), gloss));
    caliper.position.set(0.04, 0.1, 0.11);
    this.forkLowerR.add(caliper);

    // --- Swingarm: pivots at swingPivot, aims at the rear axle every frame.
    this.swingarm.position.set(B.swingPivot.x, B.swingPivot.y, 0);
    const armLen = B.swingPivot.distanceTo(B.rearAxleRest);
    for (const z of [-0.1, 0.1]) {
      const arm = cast(new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.045, 0.03), paint));
      arm.position.set(armLen / 2, 0, z);
      this.swingarm.add(arm);
    }
    const brace = cast(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.2), paint));
    brace.position.set(0.12, 0.01, 0);
    this.swingarm.add(brace);
    this.frame.add(this.swingarm);

    // --- Rear shock: body + spring between shockTop and a point on the swingarm.
    this.shock = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 10).translate(0, 0.5, 0), chrome));
    this.shockSpring = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 10, 1, true).translate(0, 0.5, 0), lib.get('shockSpring')));
    this.frame.add(this.shock, this.shockSpring);

    // --- Chain: loop around the sprockets on the far side; UV scrolls with rear spin.
    const sprR = 0.11;
    const sprF = 0.045;
    const chainPts: THREE.Vector3[] = [];
    const rc = B.rearAxleRest;
    const fc = new THREE.Vector2(B.swingPivot.x + 0.02, B.swingPivot.y);
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI / 2 + (i / n) * Math.PI;
      chainPts.push(new THREE.Vector3(rc.x + Math.cos(a) * sprR, rc.y + Math.sin(a) * sprR, -0.16));
    }
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI;
      chainPts.push(new THREE.Vector3(fc.x + Math.cos(a) * sprF, fc.y + Math.sin(a) * sprF + (i === 0 ? -0.015 : 0), -0.16));
    }
    const chainCurve = new THREE.CatmullRomCurve3(chainPts, true, 'catmullrom', 0.5);
    const chainGeo = new THREE.TubeGeometry(chainCurve, 96, 0.009, 4, true);
    // Link texture: 2-pixel repeating dark/light along u.
    const cd = new Uint8Array([40, 40, 44, 255, 120, 120, 128, 255]);
    this.chainTex = new THREE.DataTexture(cd, 2, 1, THREE.RGBAFormat);
    this.chainTex.wrapS = THREE.RepeatWrapping;
    this.chainTex.repeat.set(90, 1);
    this.chainTex.magFilter = THREE.NearestFilter;
    this.chainTex.needsUpdate = true;
    this.chainMat = fogify(new THREE.MeshStandardMaterial({ map: this.chainTex, roughness: 0.4, metalness: 0.9 }));
    lib.complete(this.chainMat);
    this.chain = new THREE.Mesh(chainGeo, this.chainMat);
    const sprocketR = cast(new THREE.Mesh(new THREE.CylinderGeometry(sprR, sprR, 0.006, 24), lib.get('exhaust')));
    sprocketR.rotation.x = Math.PI / 2;
    sprocketR.position.set(rc.x, rc.y, -0.16);
    this.frame.add(this.chain, sprocketR);

    // One draw per material for the static frame parts; the animated parts stay separate.
    mergeStaticChildren(this.frame, new Set([this.swingarm, this.forkUpper, this.forkLowerL, this.forkLowerR, this.shock, this.shockSpring, this.chain]));
    mergeStaticChildren(this.swingarm);
    mergeStaticChildren(this.forkUpper);

    this.rear = new Wheel(lib);
    this.front = new Wheel(lib);
    this.root.add(this.frame, this.rear.root, this.front.root, this.rear.contact, this.front.contact);
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

  /** Pose from the interpolated frame. */
  update(f: RenderFrame): void {
    const c = Math.cos(f.bikeAngle);
    const s = Math.sin(f.bikeAngle);
    // Axle midpoint in bike-local coordinates.
    const mx = (f.rear.x + f.front.x) / 2 - f.bikeX;
    const my = (f.rear.y + f.front.y) / 2 - f.bikeY;
    const lx = mx * c + my * s;
    const ly = -mx * s + my * c;
    if (!this.calibrated || (f.cut && f.rear.grounded && f.front.grounded)) {
      this.originOffset.set(lx, ly);
      this.calibrated = true;
    }
    // Frame origin = bike.pos + R(angle) * originOffset (rest axle midpoint).
    // Exaggerate suspension travel ×1.3 visually: the frame sinks toward the wheels and
    // pitches with the compression difference (the wheels stay on the physics contact).
    const rc = f.rear.grounded ? f.rear.compression : 0;
    const fc = f.front.grounded ? f.front.compression : 0;
    const sink = -0.03 * (rc + fc);
    const ox = this.originOffset.x;
    const oy = this.originOffset.y + sink;
    this.frame.position.set(f.bikeX + ox * c - oy * s, f.bikeY + ox * s + oy * c, 0);
    this.frame.rotation.z = f.bikeAngle + 0.05 * (rc - fc);
    this.frame.updateMatrix();
    this.frame.updateMatrixWorld(true);
    this.frameLocal.copy(this.frame.matrixWorld);

    this.rear.set(f.rear.x, f.rear.y, f.rear.spin, f.rear.spinVel);
    this.front.set(f.front.x, f.front.y, f.front.spin, f.front.spinVel);
    this.placeContact(this.rear, f.rear.x, f.rear.y, f.rear.grounded, f.rear.compression, f.bikeAngle);
    this.placeContact(this.front, f.front.x, f.front.y, f.front.grounded, f.front.compression, f.bikeAngle);

    // Rear axle in frame-local → aim swingarm.
    const ra = this.toLocal(f.rear.x, f.rear.y);
    const B = BIKE;
    this.swingarm.rotation.z = Math.atan2(ra.y - B.swingPivot.y, ra.x - B.swingPivot.x);
    // Shock between shockTop and a point along the swingarm.
    const sx = B.swingPivot.x + (ra.x - B.swingPivot.x) * B.shockSwing;
    const sy = B.swingPivot.y + (ra.y - B.swingPivot.y) * B.shockSwing + 0.03;
    const dx = sx - B.shockTop.x;
    const dy = sy - B.shockTop.y;
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx) - Math.PI / 2;
    this.shock.position.set(B.shockTop.x, B.shockTop.y, 0);
    this.shock.rotation.z = ang;
    this.shock.scale.y = len;
    this.shockSpring.position.set(B.shockTop.x, B.shockTop.y, 0);
    this.shockSpring.rotation.z = ang;
    this.shockSpring.scale.y = len * 0.6;
    // Front axle in frame-local → fork lowers slide along the fork axis.
    const fa = this.toLocal(f.front.x, f.front.y);
    const fdx = B.headBottom.x - fa.x;
    const fdy = B.headBottom.y - fa.y;
    const fang = Math.atan2(fdy, fdx) - Math.PI / 2;
    this.forkLowerL.position.set(fa.x, fa.y, -0.1);
    this.forkLowerR.position.set(fa.x, fa.y, 0.1);
    this.forkLowerL.rotation.z = fang;
    this.forkLowerR.rotation.z = fang;

    // Chain scroll: link pitch 0.0127 m, rear sprocket r 0.11.
    this.chainTex.offset.x = (f.rear.spin * 0.11) / 0.0127 / 90;

    // Rider attach points (frame-local).
    this.barL.set(B.barCentre.x - 0.04, B.barCentre.y - 0.07, B.barHalfWidth - 0.05);
    this.pegL.set(B.pegs.x, B.pegs.y + 0.02, B.pegHalfWidth);
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
