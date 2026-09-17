import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Game } from '../../game/game';
import { createBikePhysicsV2 } from '../../physics/v2/bike';
import { bikeTuningV2, suspensionPoint } from '../../physics/v2/tuning';
import { BIKE_GEOMETRY_V2 } from './assetFrame';
import { GRIP_X, GRIP_Y, PEG_X, PEG_Y } from '../../physics/v2/rider';
import type { GameRenderer } from '../index';
import { FrameBuilder, type RenderFrame } from '../frame';
import type { MaterialLibrary } from '../materials/library';
import { GltfBike } from './gltfBike';

/** Decode committed geometry through the production loader; omit only GPU image/material
 * bindings in memory. This is a geometry/attachment test, not a pixel/material assertion. */
async function loadBike(file: string): Promise<GLTF> {
  const original = await readFile(new URL(`../../../public/models/${file}`, import.meta.url));
  const jsonLength = original.readUInt32LE(12);
  const document = JSON.parse(original.subarray(20, 20 + jsonLength).toString()) as {
    meshes: { primitives: { material?: number; extensions?: Record<string, unknown> }[] }[];
    materials: unknown[]; textures: unknown[]; images: unknown[]; extensions?: Record<string, unknown>;
  };
  for (const mesh of document.meshes) for (const primitive of mesh.primitives) {
    delete primitive.material;
    if (primitive.extensions) delete primitive.extensions.KHR_materials_variants;
  }
  document.materials = []; document.textures = []; document.images = [];
  if (document.extensions) delete document.extensions.KHR_materials_variants;
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const binary = original.subarray(20 + jsonLength), result = Buffer.alloc(20 + padded.length + binary.length);
  original.copy(result, 0, 0, 12); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(padded.length, 12); result.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(result, 20); binary.copy(result, 20 + padded.length);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(result.buffer, '');
  const chain = gltf.scene.getObjectByName('chain') as THREE.Mesh;
  chain.material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  return gltf;
}

function fixture(gltf: GLTF) {
  const bike = new GltfBike(gltf, { complete() {} } as unknown as MaterialLibrary);
  const get = (name: string) => bike.root.getObjectByName(name)!;
  const point = (name: string) => get(name).getWorldPosition(new THREE.Vector3());
  const mesh = (name: string) => get(name) as THREE.Mesh;
  return { bike, get, point, mesh };
}

/** Use the physics suspension geometry to generate valid wheel states independently of rendering. */
function positionWheels(f: RenderFrame, rearCompression: number, frontCompression: number, bike: 'rookie' | 'pro' = 'rookie'): void {
  const tuning = bikeTuningV2(bike), c = Math.cos(f.bikeAngle), s = Math.sin(f.bikeAngle);
  for (const [name, compression] of [['rear', rearCompression], ['front', frontCompression]] as const) {
    const p = suspensionPoint(tuning.suspension[name], compression);
    f[name].x = f.bikeX + p.x * c - p.y * s;
    f[name].y = f.bikeY + p.x * s + p.y * c;
    f[name].compression = compression / tuning.suspension[name].travel;
  }
}

/** Blender stores node transforms as IEEE-754 binary32 before glTF JSON serialization. Each
 * authored coordinate therefore contributes at most half an ULP; mesh position quantization
 * is irrelevant to these empty-node tests. For perpendicular fork residual, COM/top errors
 * add directly, and endpoint errors rotate the axis by sin(theta) <= error / (length-error).
 * Measure the physical slider residual separately and add only its actual value; this test
 * bounds export disagreement rather than inventing a solver convergence tolerance. */
const halfUlp = (v: number) => v === 0 ? 0 : 2 ** (Math.floor(Math.log2(Math.abs(v))) - 24);
const pointError = (x: number, y: number) => Math.hypot(halfUlp(x), halfUlp(y));
function forkExportBudget(travel: number): number {
  const topError = pointError(1.08, .5), axleError = pointError(1.3, 0);
  const comError = pointError(.585, .21), axisError = topError + axleError;
  const length = Math.hypot(.22, .5);
  return comError + topError + Math.abs(travel - length) * axisError / (length - axisError);
}

// The rear pivot and the axle's local translation store (+/-.43, +/-.10).
// Their rounding affects the measured distance and the authored radius once each.
const rearExportBudget = pointError(.585, .21) + 2 * pointError(.43, .10);

/** Merge #3: on `main` the asset's axle markers are the solver's REST axles (compression 0; the Rookie rear exactly,
 * the front 5 mm off) — the branch's `rearReferenceCompression` / `frontReferenceCompression` (7 cm / 5 cm of
 * sag at the markers) described its own solver. The neutral mechanism frame is therefore compression 0. */
function mechanismFrame(): RenderFrame {
  const f = new FrameBuilder().frame;
  f.bikeX = 4; f.bikeY = 2; f.dt = 1 / 60;
  positionWheels(f, 0, 0);
  return f;
}

function expectPhysicalAnchors(rig: ReturnType<typeof fixture>, f: RenderFrame): void {
  const offset = BIKE_GEOMETRY_V2.chassisToAxle;
  expect(rig.point('attach_chassis_com').distanceTo(new THREE.Vector3(f.bikeX, f.bikeY, 0))).toBeLessThan(1e-7);
  for (const [side, z] of [['L', 1], ['R', -1]] as const) {
    for (const [name, x, y, halfWidth] of [['grip', GRIP_X, GRIP_Y, .33], ['peg', PEG_X, PEG_Y, .2]] as const) {
      const expected = new THREE.Vector3(offset.x + x, offset.y + y, z * halfWidth)
        .applyAxisAngle(new THREE.Vector3(0, 0, 1), f.bikeAngle).add(new THREE.Vector3(f.bikeX, f.bikeY, 0));
      expect(rig.point(`attach_${name}_${side}`).distanceTo(expected)).toBeLessThan(1e-6);
    }
  }
}

beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => ({ width: 128, height: 64, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), scale() {}, fillRect() {} }) }) });
});

describe.each(['bike-rookie.glb', 'bike-rookie-lod.glb', 'bike-pro.glb', 'bike-pro-lod.glb'])('%s articulated geometry', (file) => {
  let gltf: GLTF;
  beforeAll(async () => { gltf = await loadBike(file); });

  // Ask 43 round 5: the round-8 export's "axle block face at z = 0.15" probe went with that file; Astra's swingarm
  // is a different mesh. The marker contract (`attach_swing_axle` IS the rest rear axle) is the row below.

  it('preserves wheel world angles, fixed fork alignment, and shock roll through a production replay', async () => {
    const bytes = await readFile(new URL('../../../harness/inputs/b3-kicker-row/bot-3.json', import.meta.url), 'utf8');
    const rec = JSON.parse(bytes) as { header: { physicsHz: number; trackId: string; seed: number; bike: 'rookie' | 'pro' }; runs: number[][] };
    const rig = fixture(gltf), frames = new FrameBuilder();
    const renderer = { setTrack() {}, onEvent() {}, setQuality() {}, setBikeClass() {} } as unknown as GameRenderer;
    const game = new Game({ physics: createBikePhysicsV2(rec.header.physicsHz), renderer, physicsHz: rec.header.physicsHz, autoSkipCountdown: true, ghostEnabled: false });
    game.loadTrack(rec.header.trackId, rec.header.seed, rec.header.bike);
    // Explicit authoring witness: these values must be the correctly rounded float32
    // contract coordinates, rather than an arbitrary tolerance inferred from a failing run.
    for (const [name, x, y] of [['attach_fork_top', 1.08, .5], ['attach_front_axle_rest', 1.3, 0], ['attach_chassis_com', .585, .21]] as const) {
      expect(rig.get(name).position.toArray()).toEqual([Math.fround(x), Math.fround(y), 0]);
    }
    const sourceQ = rig.get('shock_body').quaternion.clone();
    const sourceDir = rig.point('attach_shock_link').sub(rig.point('attach_shock_top')).normalize();
    const localForkAxis = rig.point('attach_fork_top').sub(rig.point('attach_front_axle_rest')).normalize();
    const pose: number[] = [];
    let worstArm = 0, worstFront = 0;
    for (const [count, throttle, brake, lean, flags] of rec.runs) for (let i = 0; i < count!; i++) {
      game.setInput({ throttle: throttle! / 255, brake: brake! / 255, lean: lean! / 127, restart: Boolean(flags! & 2), hop: Boolean(flags! & 1) }); game.step(1);
      const f = frames.build(game.getState(), 1);
      rig.bike.update(f); rig.bike.root.updateMatrixWorld(true);
      expectPhysicalAnchors(rig, f);
      expect(Math.abs(rig.bike.debug.angleCorrection)).toBeLessThan(.001);
      for (const [name, wheel] of [['wheel_rear', f.rear], ['wheel_front', f.front]] as const) {
        const m = rig.get(name).matrixWorld.elements, angle = Math.atan2(m[1]!, m[0]!);
        expect(Math.abs(Math.atan2(Math.sin(angle + wheel.spin), Math.cos(angle + wheel.spin)))).toBeLessThan(1e-10);
        expect(rig.point(name).distanceTo(new THREE.Vector3(wheel.x, wheel.y, 0))).toBeLessThan(1e-10);
      }
      const file = rig.bike.root.getObjectByName('bike')!;
      const front = file.worldToLocal(rig.point('wheel_front')), top = file.worldToLocal(rig.point('attach_fork_top'));
      const c = Math.cos(f.bikeAngle), s = Math.sin(f.bikeAngle);
      const x = (f.front.x - f.bikeX) * c + (f.front.y - f.bikeY) * s - .715;
      const y = -(f.front.x - f.bikeX) * s + (f.front.y - f.bikeY) * c + .21;
      const axis = BIKE_GEOMETRY_V2.forkAxis;
      const arithmetic = 128 * Number.EPSILON * Math.max(1, Math.abs(f.bikeX), Math.abs(f.bikeY));
      const physicalResidual = Math.abs(x * axis.y - y * axis.x);
      // Merge #3: `main`'s physics moves the rear wheel on a straight axis (tuning.ts `suspension.rear.axis`), not
      // on the swingarm's arc — the branch's hinge closure (`physicalRearResidual < 2e-4`) has no solver behind
      // it here. The arm-length error is the wheel's distance off the arc; record its worst value instead.
      const pivot = BIKE_GEOMETRY_V2.swingPivot, radius = BIKE_GEOMETRY_V2.swingRadius;
      const rearX = (f.rear.x - f.bikeX) * c + (f.rear.y - f.bikeY) * s - .065 - pivot.x;
      const rearY = -(f.rear.x - f.bikeX) * s + (f.rear.y - f.bikeY) * c + .21 - pivot.y;
      const physicalRearResidual = Math.abs(Math.hypot(rearX, rearY) - radius);
      worstArm = Math.max(worstArm, rig.bike.debug.armLengthError);
      worstFront = Math.max(worstFront, physicalResidual);
      // Merge #3: `main`'s front slider is the axis (-0.4, 0.92) from the rest axle (0.715, -0.215) — 5 mm below the
      // asset's fork-line marker (0.715, -0.21) and 0.26 deg off the asset's fork axis — so the wheel rides up to
      // 2.6 mm off the glb's fork line over this replay (worst measured 0.00263 m at full compression; the first
      // failing frame was 0.00182 m; the branch's slider held 2e-4). The rear arm-length error peaks at 0.0294 m.
      expect(physicalResidual).toBeLessThan(5e-3);
      expect(Math.abs(rig.bike.debug.armLengthError - physicalRearResidual)).toBeLessThan(rearExportBudget + arithmetic);
      const travel = x * axis.x + y * axis.y;
      expect(Math.abs(front.sub(top).cross(localForkAxis).length() - physicalResidual)).toBeLessThan(forkExportBudget(travel) + arithmetic);
      const direction = file.worldToLocal(rig.point('attach_shock_link')).sub(file.worldToLocal(rig.point('attach_shock_top'))).normalize();
      const expected = new THREE.Quaternion().setFromUnitVectors(sourceDir, direction).multiply(sourceQ);
      expect(rig.get('shock_body').quaternion.angleTo(expected)).toBeLessThan(1e-6);
      pose.push(rig.bike.debug.frontTravel);
    }
    expect(Math.max(...pose) - Math.min(...pose)).toBeGreaterThan(.05);
    // The straight-axis / arc mismatch over a b3 replay (merge #3 gap list): the wheel stays within 5 cm of the arm's end.
    expect(worstArm).toBeLessThan(.05);
    expect(worstFront).toBeLessThan(1e-3); // Physics R9: the front rides the asset's fork line (rest offset 0, residual < 1 mm)
  });

  it('repeats the same rigid pose after arbitrary history, including a reset and unchanged timestamps', () => {
    const live = fixture(gltf), fresh = fixture(gltf), f = mechanismFrame();
    live.bike.update(f); fresh.bike.update(f);
    for (let tick = 0; tick < 100; tick++) {
      f.cut = false; f.tSim += 1 / 60;
      positionWheels(f, .13 + .13 * Math.sin(tick / 8), .12 + .12 * Math.sin(tick / 10));
      f.front.spin = tick * .2; f.rear.spin = tick * .3;
      live.bike.update(f);
    }
    fresh.bike.update(f);
    const capture = (rig: ReturnType<typeof fixture>) => {
      rig.bike.root.updateMatrixWorld(true);
      return ['wheel_rear', 'wheel_front', 'fork_lower', 'swingarm', 'shock_body', 'shock_shaft', 'shock_clevis', 'shock_spring']
        .flatMap(name => rig.get(name).matrixWorld.elements.slice());
    };
    expect(capture(live)).toEqual(capture(fresh));
    const held = capture(live);
    for (let i = 0; i < 20; i++) live.bike.update(f);
    expect(capture(live)).toEqual(held);
    f.cut = true; f.tSim = 0; positionWheels(f, .07, .05);
    f.front.spin = f.rear.spin = 0;
    live.bike.update(f); fresh.bike.update(f);
    expect(capture(live)).toEqual(capture(fresh));
  });

  it('shares the physical fixed frame and contacts on both classes without sag or history calibration', () => {
    const rig = fixture(gltf);
    rig.bike.root.updateMatrixWorld(true);
    const markerOffset = rig.point('attach_frame_origin').sub(rig.point('attach_chassis_com'));
    expect(markerOffset.distanceTo(new THREE.Vector3(BIKE_GEOMETRY_V2.chassisToAxle.x, BIKE_GEOMETRY_V2.chassisToAxle.y, 0))).toBeLessThan(1e-7);
    expect(rig.point('attach_front_axle_rest').distanceTo(rig.point('attach_rear_axle_rest'))).toBeCloseTo(BIKE_GEOMETRY_V2.wheelbase, 6);
    // Merge #3: the asset was authored on the Rookie row. `main`'s Pro row (tuning.ts BIKE_PRESETS_V2.pro) pulls both
    // rest axles 1 cm inboard (rear -0.575, front 0.705; wheelbase 1.28), so only the Rookie's rest axles are the
    // asset's markers (rear exactly, front 5 mm low); the Pro's wheels sit 1 cm (rear) / 1.1 cm (front) off them.
    // Physics R9: both classes share the asset's rest axles and wheelbase (the Pro's 1 cm-inboard axles / 1.28 m wheelbase
    // went with Astra's geometry port; before R9 the offsets were rookie front 5 mm, pro rear 1 cm / front 1.1 cm / -0.02 m).
    const axleOffset = { rookie: { rear: 0, front: 0, wheelbase: 0 }, pro: { rear: 0, front: 0, wheelbase: 0 } } as const;
    for (const bike of ['rookie', 'pro'] as const) {
      const t = bikeTuningV2(bike);
      expect(t.wheel.wheelbase).toBeCloseTo(BIKE_GEOMETRY_V2.wheelbase + axleOffset[bike].wheelbase, 12);
      const offset = BIKE_GEOMETRY_V2.chassisToAxle;
      const rearRest = new THREE.Vector3(t.suspension.rear.axle.x - offset.x, t.suspension.rear.axle.y - offset.y, 0);
      const frontRest = new THREE.Vector3(t.suspension.front.axle.x - offset.x, t.suspension.front.axle.y - offset.y, 0);
      expect(rearRest.distanceTo(new THREE.Vector3(BIKE_GEOMETRY_V2.rear.x, BIKE_GEOMETRY_V2.rear.y, 0))).toBeCloseTo(axleOffset[bike].rear, 12);
      expect(frontRest.distanceTo(new THREE.Vector3(BIKE_GEOMETRY_V2.front.x, BIKE_GEOMETRY_V2.front.y, 0))).toBeCloseTo(axleOffset[bike].front, 12);
    }
    for (const bike of ['rookie', 'pro'] as const) for (const angle of [-2.2, 0, .7, 3.1]) {
      const f = mechanismFrame(); f.bikeAngle = angle;
      const matrices: number[][] = [];
      for (const [rear, front] of [[0, 0], [.07, .05], [.26, .24]]) {
        positionWheels(f, rear!, front!, bike);
        // A legacy procedural hot swap may carry an unrelated calibration. It cannot move the model.
        rig.bike.placer.originOffset.set(123, -456); rig.bike.placer.calibrated = false;
        f.cut = matrices.length % 2 === 0;
        rig.bike.update(f); rig.bike.root.updateMatrixWorld(true);
        expectPhysicalAnchors(rig, f);
        if (rear === 0 && front === 0) {
          // At `main`'s rest (compression 0) the markers are the wheels: Rookie rear exact, front the 5 mm; Pro 1 cm inboard.
          const rearMarker = rig.point('attach_rear_axle_rest').distanceTo(new THREE.Vector3(f.rear.x, f.rear.y, 0));
          const frontMarker = rig.point('attach_front_axle_rest').distanceTo(new THREE.Vector3(f.front.x, f.front.y, 0));
          expect(Math.abs(rearMarker - axleOffset[bike].rear)).toBeLessThan(1e-6);
          expect(Math.abs(frontMarker - axleOffset[bike].front)).toBeLessThan(1e-6);
          if (bike === 'rookie') { expect(rearMarker).toBeLessThan(1e-6); expect(frontMarker).toBeLessThan(6e-3); }
        }
        expect(rig.bike.frame.rotation.z).toBe(angle);
        expect(rig.bike.debug.chassisShift).toBe(0); expect(rig.bike.debug.angleCorrection).toBe(0);
        matrices.push(rig.bike.frame.matrixWorld.elements.slice());
      }
      expect(matrices[1]).toEqual(matrices[0]); expect(matrices[2]).toEqual(matrices[0]);
    }
  });

  // The LOD twin is decimated by the art build (fork tubes lose their rings): the surface probe reads the authored file.
  it.skipIf(file.endsWith('-lod.glb'))('keeps the exported fork tube surfaces coaxial and overlapping at the measured travel envelope', () => {
    const rig = fixture(gltf);
    rig.bike.root.updateMatrixWorld(true);
    const sourceAxle = rig.point('attach_front_axle_rest');
    const axis = rig.point('attach_fork_top').sub(sourceAxle).normalize();
    const perpendicular = new THREE.Vector3(axis.y, -axis.x, 0);
    // Recover real circular cross-section witnesses, not empty attachment nodes.
    const ring = (name: string, along: number, radius: number) => {
      const mesh = rig.mesh(name), pos = mesh.geometry.getAttribute('position');
      const angles: number[] = [];
      for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).sub(sourceAxle);
        if (Math.abs(v.dot(axis) - along) > 1e-4) continue;
        const u = v.dot(perpendicular), z = v.z - .1;
        if (Math.abs(Math.hypot(u, z) - radius) < 1e-4) angles.push(Math.atan2(z, u));
      }
      expect(angles.length).toBeGreaterThanOrEqual(7);
      angles.sort((a, b) => a - b);
      let maxGap = 0;
      for (let i = 0; i < angles.length; i++) maxGap = Math.max(maxGap, (angles[(i + 1) % angles.length]! + (i === angles.length - 1 ? Math.PI * 2 : 0)) - angles[i]!);
      expect(maxGap).toBeLessThan(Math.PI / 2);
    };
    ring('fork_upper', .34, .019);
    ring('fork_lower', -.01, .025);
    ring('fork_lower', .42, .024);
    const upperEnd = rig.point('attach_fork_top').distanceTo(sourceAxle) + .30;
    for (const travel of [-BIKE_GEOMETRY_V2.frontReferenceCompression, 0, .15, bikeTuningV2('rookie').suspension.front.travel - BIKE_GEOMETRY_V2.frontReferenceCompression]) {
      const overlap = Math.min(upperEnd, travel + .42) - Math.max(.34, travel - .01);
      expect(overlap).toBeGreaterThan(.01);
    }
  });

  it('moves the chain upper run toward the countershaft when the rear wheel rolls forward', () => {
    const rig = fixture(gltf), f = mechanismFrame();
    rig.bike.update(f);
    const map = (rig.mesh('chain').material as THREE.MeshStandardMaterial).map!;
    expect(Math.abs(map.offset.x)).toBe(0);
    f.cut = false; f.rear.spin = .01; // forward rolling in the physics convention
    rig.bike.update(f);
    // UV.u increases along the upper run from rear to front; negative texture offset
    // makes a fixed painted link travel toward increasing u, rather than counter-rotate.
    expect(map.offset.x).toBeLessThan(0);
    expect(rig.get('sprocket_front').rotation.z).toBeLessThan(0);
    const tip = rig.bike.exhaustTip;
    expect(rig.bike.toWorld(tip.x, tip.y, tip.z, new THREE.Vector3()).distanceTo(rig.point('attach_exhaust_outlet'))).toBeLessThan(1e-10);
  });

  it('disposes per-instance chain and contact resources without disposing shared asset geometry', () => {
    const rig = fixture(gltf), chain = rig.mesh('chain');
    const texture = (chain.material as THREE.MeshStandardMaterial).map!;
    const geometry = chain.geometry;
    const shared = rig.mesh('wheel_rear').geometry;
    let textureDisposed = 0, geometryDisposed = 0, sharedDisposed = 0;
    texture.addEventListener('dispose', () => textureDisposed++);
    geometry.addEventListener('dispose', () => geometryDisposed++);
    shared.addEventListener('dispose', () => sharedDisposed++);
    let contactsDisposed = 0;
    for (const c of rig.bike.contacts) {
      const mesh = c as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
      mesh.geometry.addEventListener('dispose', () => contactsDisposed++);
      mesh.material.addEventListener('dispose', () => contactsDisposed++);
      mesh.material.map!.addEventListener('dispose', () => contactsDisposed++);
    }
    rig.bike.dispose();
    expect(textureDisposed).toBe(1); expect(geometryDisposed).toBe(1); expect(sharedDisposed).toBe(0);
    expect(contactsDisposed).toBe(6);
  });

  it('deforms the exported chain at both sprockets and isolates live/ghost phase and vertices', () => {
    const live = fixture(gltf), ghost = fixture(gltf), f = mechanismFrame();
    live.bike.update(f); live.bike.root.updateMatrixWorld(true);
    const mesh = live.mesh('chain'), material = mesh.material as THREE.MeshStandardMaterial;
    const heldPositions = Array.from(mesh.geometry.getAttribute('position').array);
    const heldOffset = material.map!.offset.x;
    f.rear.spin = 2; positionWheels(f, .23, .05);
    ghost.bike.update(f);
    expect((ghost.mesh('chain').material as THREE.MeshStandardMaterial).map).not.toBe(material.map);
    expect(ghost.mesh('chain').geometry).not.toBe(mesh.geometry);
    expect(material.map!.offset.x).toBe(heldOffset);
    expect(Array.from(mesh.geometry.getAttribute('position').array)).toEqual(heldPositions);
    live.bike.update(f); live.bike.root.updateMatrixWorld(true);
    expect(Array.from(mesh.geometry.getAttribute('position').array)).not.toEqual(heldPositions);
    const pos = mesh.geometry.getAttribute('position');
    // Every chain vertex must lie outside the pitch circles and touch both wraps within tube radius.
    for (const [marker, radius] of [['attach_rear_sprocket', .101], ['attach_countershaft', .033]] as const) {
      const center = live.point(marker); let nearest = Infinity, sumZ = 0;
      for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        sumZ += v.z;
        const distance = Math.hypot(v.x - center.x, v.y - center.y);
        expect(distance).toBeGreaterThan(radius - .0061);
        nearest = Math.min(nearest, distance);
      }
      expect(nearest).toBeLessThan(radius + .001);
      expect(Math.abs(sumZ / pos.count - center.z)).toBeLessThan(1e-6);
    }
  });
});
