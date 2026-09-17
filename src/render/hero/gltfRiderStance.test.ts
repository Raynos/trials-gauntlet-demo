/**
 * Ask 51 step 3 (docs/plans/RIDING_POSES.md): in level the glTF rider's base pose is Astra's authored stances blended
 * by physics R9's drawn pose (`riderBody.drawn`), IK only a bounded correction onto the grips / pegs with the clip's
 * own elbow / knee as the pole. Bars (the parent's): hands within 2 cm of the grips through both b1 goldens, elbows
 * never above the shoulder line, no hyperextension (≤ 175°). Before/after: docs/evidence/hero-art/pose-compare/.
 */
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { InputRecording } from '../../core/replay';
import { AVAILABLE_RIDER_PRESETS } from '../../core/riderPresets';
import { Game } from '../../game/game';
import { createBikePhysicsV2 } from '../../physics/v2/bike';
import { DRAWN } from '../../physics/v2/rider';
import type { HeroBike } from '../bike/bikeModel';
import { FrameBuilder, type RenderFrame } from '../frame';
import type { GameRenderer } from '../index';
import type { MaterialLibrary } from '../materials/library';
import { BIKE_GEOMETRY_V2 } from './assetFrame';
import { boneName, GltfRider } from './gltfRider';
import { loadRig } from './gltfTestUtils';
import { prepareHero } from './lod';

const SHIFT = 0.65;
const DEG = Math.PI / 180;
const JOINTS = ['pelvis', 'spine', 'chest', 'neck', 'head', 'shoulder.L', 'upperArm.L', 'forearm.L', 'hand.L', 'shoulder.R', 'upperArm.R', 'forearm.R', 'hand.R', 'thigh.L', 'shin.L', 'foot.L', 'thigh.R', 'shin.R', 'foot.R', 'gripSocket.L', 'gripSocket.R', 'soleSocket.L', 'soleSocket.R'];
const GRIP = (sign: number) => new THREE.Vector3(0.27, 0.78, sign * 0.33);
const SOLE = (sign: number) => new THREE.Vector3(-0.14, 0.031, sign * 0.2);

function fixture(gltf: GLTF) {
  const frame = new THREE.Group();
  const rider = new GltfRider(gltf, { complete() {} } as unknown as MaterialLibrary);
  rider.attach({ frame } as HeroBike);
  const nodes = new Map<string, THREE.Object3D>();
  frame.traverse((o) => nodes.set(boneName(o.name), o));
  const point = (name: string) => frame.worldToLocal(nodes.get(name)!.getWorldPosition(new THREE.Vector3()));
  const update = (f: RenderFrame) => {
    const offset = BIKE_GEOMETRY_V2.chassisToAxle;
    const c = Math.cos(f.bikeAngle), s = Math.sin(f.bikeAngle);
    frame.position.set(f.bikeX + offset.x * c - offset.y * s, f.bikeY + offset.x * s + offset.y * c, 0);
    frame.rotation.z = f.bikeAngle;
    frame.updateMatrixWorld(true);
    rider.update(f);
    frame.updateMatrixWorld(true);
  };
  const joints = () => JOINTS.map((n) => point(n));
  return { rider, frame, point, update, joints };
}
type Rig = ReturnType<typeof fixture>;

function authored(gltf: GLTF, clipName: string, t: number): THREE.Vector3[] {
  const scene = cloneSkeleton(gltf.scene);
  const holder = new THREE.Group();
  holder.add(scene);
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(gltf.animations.find((c) => c.name === clipName)!).play();
  mixer.setTime(t);
  holder.updateMatrixWorld(true);
  const byName = new Map<string, THREE.Object3D>();
  scene.traverse((o) => byName.set(boneName(o.name), o));
  return JOINTS.map((n) => byName.get(n)!.getWorldPosition(new THREE.Vector3()).sub(new THREE.Vector3(SHIFT, 0, 0)));
}
const maxDistance = (a: THREE.Vector3[], b: THREE.Vector3[]) => Math.max(...a.map((p, i) => p.distanceTo(b[i]!)));

/** A frame on the drawn table at (pose, blend) with the excursion (dy m, lag rad) and the load / rise signals. */
function drawnFrame(pose: 'seated' | 'back' | 'forward', blend: number, dy = 0, lag = 0, load = 0, relUp = 0, angle = 0): RenderFrame {
  const f = new FrameBuilder().frame;
  f.bikeX = 4; f.bikeY = 2; f.bikeAngle = angle;
  f.riderBody.present = true;
  f.riderBody.relX = -0.12; f.riderBody.relY = 0.6; f.riderBody.relUp = relUp;
  const N = DRAWN.seated, T = DRAWN[pose], b = pose === 'seated' ? 0 : blend;
  f.riderBody.drawn = { present: true, pose, blend, hipY: N.hipY + (T.hipY - N.hipY) * b + dy, torso: (N.torso + (T.torso - N.torso) * b) * DEG + lag };
  f.rear.grounded = f.front.grounded = load > 0;
  f.rear.compression = f.front.compression = load / 2;
  f.dt = 1 / 60; f.speed = 8;
  return f;
}

/** The bars, measured from the posed joints in the bike frame (never from the driver's own fields). */
interface Bars { grip: number; sole: number; elbow: number; elbowUp: number; length: number; poleDot: number }
function measure(rig: Rig, clipElbow?: THREE.Vector3[]): Bars {
  const e: Bars = { grip: 0, sole: 0, elbow: 0, elbowUp: -Infinity, length: 0, poleDot: Infinity };
  for (const [side, sign, i] of [['L', 1, 0], ['R', -1, 1]] as const) {
    e.grip = Math.max(e.grip, rig.point(`gripSocket.${side}`).distanceTo(GRIP(sign)));
    e.sole = Math.max(e.sole, rig.point(`soleSocket.${side}`).distanceTo(SOLE(sign)));
    const shoulder = rig.point(`upperArm.${side}`), elbow = rig.point(`forearm.${side}`), wrist = rig.point(`hand.${side}`);
    e.elbow = Math.max(e.elbow, shoulder.clone().sub(elbow).angleTo(wrist.clone().sub(elbow)) / DEG);
    e.elbowUp = Math.max(e.elbowUp, elbow.y - shoulder.y);
    for (const [a, b, length] of [['upperArm', 'forearm', 0.32], ['forearm', 'hand', 0.27], ['thigh', 'shin', 0.46], ['shin', 'foot', 0.43]] as const) {
      e.length = Math.max(e.length, Math.abs(rig.point(`${a}.${side}`).distanceTo(rig.point(`${b}.${side}`)) - length));
    }
    if (clipElbow) {
      // The elbow bends to the same side as the authored clip's elbow (its perpendicular off the shoulder→wrist axis).
      const axis = wrist.clone().sub(shoulder).normalize();
      const bend = elbow.clone().sub(shoulder);
      bend.addScaledVector(axis, -bend.dot(axis));
      const ref = clipElbow[i]!.clone().sub(shoulder);
      ref.addScaledVector(axis, -ref.dot(axis));
      e.poleDot = Math.min(e.poleDot, bend.normalize().dot(ref.normalize()));
    }
  }
  return e;
}
function expectBars(e: Bars, context: string, gripBar = 1e-4): void {
  expect(e.grip, `grip ${context}`).toBeLessThan(gripBar);
  expect(e.sole, `sole ${context}`).toBeLessThan(gripBar);
  expect(e.elbow, `elbow ${context}`).toBeLessThanOrEqual(175);
  expect(e.elbowUp, `elbow above shoulder ${context}`).toBeLessThan(-0.1);
  expect(e.length, `bone length ${context}`).toBeLessThan(1e-4); // the authored translations sit µm off the profile's nominal lengths
  if (Number.isFinite(e.poleDot)) expect(e.poleDot, `elbow side ${context}`).toBeGreaterThan(0.9);
}

const subjects = AVAILABLE_RIDER_PRESETS.flatMap((p) => [`rider-${p.id}.glb`, `rider-${p.id}-lod.glb`].map((file) => ({ file })));

describe.each(subjects)('$file stance pose', ({ file }) => {
  let gltf: GLTF;
  beforeAll(async () => { gltf = await loadRig(file); await prepareHero(gltf); });

  it('at the drawn table each stance IS the authored clip: seated = sit_cruise, forward = forward_attack 1.75 s, back = hang_back 1.75 s', () => {
    const rig = fixture(gltf);
    for (const [pose, clip, t] of [['seated', 'sit_cruise', 0], ['forward', 'forward_attack', 1.75], ['back', 'hang_back', 1.75]] as const) {
      rig.update(drawnFrame(pose, 1));
      const d = rig.rider.debug;
      expect(d.physicalPose).toBe(true);
      expect(d.stance.on).toBe(true);
      expect(d.stance.limit).toBe(1);
      // The IK re-solves the arms and legs from the clip's shoulders / hips with the clip's own poles: it lands back
      // on the clip's elbows and knees (≤ 1 mm), hands and soles on the delivered contacts by authorship.
      const ref = authored(gltf, clip, t);
      // ≤ 5 mm: the bind spine offset stands in for the clip's (4.9 mm off) so no non-pelvis bone-local translation
      // moves in level (the WebKit hero gate's 0.5 mm drift floor); the hands / soles are exact regardless.
      expect(maxDistance(rig.joints(), ref), `${pose} vs ${clip}`).toBeLessThan(5.5e-3);
      expectBars(measure(rig, [ref[JOINTS.indexOf('forearm.L')]!, ref[JOINTS.indexOf('forearm.R')]!]), pose);
    }
  });

  it('holds every bar across the lean blend, the load / rise blends, the excursion and the bike angle', () => {
    const rig = fixture(gltf);
    let cells = 0, limited = 0;
    for (const pose of ['seated', 'back', 'forward'] as const) {
      for (const blend of pose === 'seated' ? [0] : [0.25, 0.5, 0.75, 1]) {
        for (const [dy, lag] of [[0, 0], [-0.1, 0], [0.1, 0.3], [0, -0.3], [-0.12, 0.35]]) {
          for (const [load, relUp] of [[0, 0], [1.6, 0], [0, 1.5], [1.2, 0.8]]) {
            for (const angle of [-0.6, 0, 0.8]) {
              rig.update(drawnFrame(pose, blend, dy, lag, load, relUp, angle));
              const context = JSON.stringify({ file, pose, blend, dy, lag, load, relUp, angle });
              const s = rig.rider.debug.stance;
              expect(s.on, context).toBe(true);
              expect(s.pose).toBe(pose);
              expect(s.lean).toBe(pose === 'seated' ? 0 : blend);
              expect(s.blend).toBeGreaterThanOrEqual(0);
              expect(s.blend).toBeLessThanOrEqual(1);
              expect(Math.abs(s.dy), context).toBeLessThanOrEqual(0.12 + 1e-9);
              expect(Math.abs(s.lag), context).toBeLessThanOrEqual(0.35 + 1e-9);
              if (s.limit < 1) limited++;
              cells++;
              // Any pose the excursion leaves is reach-limited, so the hands and soles land exactly (not 2 cm: 0.1 mm).
              expectBars(measure(rig), context);
            }
          }
        }
      }
    }
    expect(cells).toBe(540);
    expect(limited, 'the reach limit must engage somewhere in this grid (else the −12 cm / +20° corner is untested)').toBeGreaterThan(0);
    expect(limited).toBeLessThan(cells / 2);
  });

  it('holds the seated clip while the drawn hips are on the seat: half back lean and small forward lean draw sit_cruise; the stance ramps in as the hips leave it', () => {
    // Round 2: the b1 bot holds input lean −0.5 on 53 % of rookie ticks and physics reports `back 0.5` there, with the
    // drawn hips (x −0.52) still on the seat (rear edge −0.54) — the weight is the distance OFF the seat, not the lean.
    const rig = fixture(gltf);
    const seated = authored(gltf, 'sit_cruise', 0);
    for (const [pose, blend, weight] of [['back', 0.25, 0], ['back', 0.5, 0], ['back', 0.55, 0], ['back', 0.778, 0.5], ['back', 1, 1], ['forward', 0.1, 0], ['forward', 0.15, 0], ['forward', 0.5, 0.409], ['forward', 1, 1]] as const) {
      rig.update(drawnFrame(pose, blend));
      const s = rig.rider.debug.stance;
      expect(s.lean).toBe(blend);
      expect(s.blend, `${pose} ${blend}`).toBeCloseTo(weight, 2);
      if (weight === 0) expect(maxDistance(rig.joints(), seated), `${pose} ${blend} is the seated clip`).toBeLessThan(5.5e-3);
      else expect(maxDistance(rig.joints(), seated)).toBeGreaterThan(0.03);
      expectBars(measure(rig), `${pose} ${blend}`);
    }
  });

  it('an excursion beyond reach is limited toward the stance, never a stretched arm or a hand off the grip', () => {
    const rig = fixture(gltf);
    rig.update(drawnFrame('back', 1, 0, 0));
    const base = rig.joints();
    rig.update(drawnFrame('back', 1, 0.12, 0.35)); // hips up 12 cm and torso 20° ahead from the extended hang-back: the arms cannot follow
    const s = rig.rider.debug.stance;
    expect(s.limit).toBeLessThan(1);
    expect(s.limit).toBeGreaterThan(0);
    expectBars(measure(rig), 'limited');
    expect(maxDistance(rig.joints(), base)).toBeGreaterThan(0.01); // some of the excursion survives
    expect(maxDistance(rig.joints(), base)).toBeLessThan(0.16);
  });

  it('is deterministic and history-free: the same frame after a different one reposes identically', () => {
    const a = fixture(gltf), b = fixture(gltf);
    const f = drawnFrame('forward', 0.6, -0.05, 0.1, 1.2, 0.4, 0.3);
    a.update(drawnFrame('back', 1, 0.1, -0.3, 0, 1.5, -0.5));
    a.update(f);
    b.update(f);
    expect(maxDistance(a.joints(), b.joints())).toBeLessThan(1e-12);
  });
});

/** The bars over the whole b1 golden (rookie + pro), the real physics driving the rider tick by tick (one outfit: the pose is per rig, not per skin). */
describe('b1 goldens, street-mustard', () => {
  let gltf: GLTF;
  beforeAll(async () => { gltf = await loadRig('rider-street-mustard.glb'); await prepareHero(gltf); });

  it.each(['rookie', 'pro'] as const)('%s: hands on the grips, soles on the pegs, elbows bent and below the shoulders on every ridden tick', async (cls) => {
    const rec = JSON.parse(await readFile(new URL(`../../../harness/inputs/b1-first-ride/bot-3${cls === 'pro' ? '-pro' : ''}.json`, import.meta.url), 'utf8')) as InputRecording;
    const physics = createBikePhysicsV2(rec.header.physicsHz);
    const game = new Game({ physics, renderer: { setTrack() {}, onEvent() {}, setQuality() {}, setBikeClass() {} } as unknown as GameRenderer, physicsHz: rec.header.physicsHz, autoSkipCountdown: true, ghostEnabled: false });
    game.loadTrack(rec.header.trackId, rec.header.seed, cls);
    const rig = fixture(gltf), frames = new FrameBuilder();
    const worst: Bars = { grip: 0, sole: 0, elbow: 0, elbowUp: -Infinity, length: 0, poleDot: Infinity };
    const poses = new Set<string>();
    let tick = 0, ridden = 0, limited = 0, elbowMin = Infinity, flat = 0, flatSeated = 0;
    outer: for (const [count, throttle, brake, lean, flags] of rec.runs) for (let i = 0; i < count!; i++) {
      tick++;
      game.setInput({ throttle: throttle! / 255, brake: brake! / 255, lean: lean! / 127, hop: Boolean(flags! & 1), restart: Boolean(flags! & 2) });
      game.step(1);
      const st = game.getState();
      const f = frames.build(st, 1);
      rig.update(f);
      if (f.ragdoll) continue;
      expect(rig.rider.debug.stance.on, `tick ${tick}`).toBe(true);
      ridden++;
      poses.add(rig.rider.debug.stance.pose);
      if (rig.rider.debug.stance.limit < 1) limited++;
      if (f.rear.grounded && f.front.grounded && Math.abs(f.bikeAngle) < 0.1) { flat++; if (rig.rider.debug.stance.blend < 0.2) flatSeated++; }
      const e = measure(rig);
      worst.grip = Math.max(worst.grip, e.grip);
      worst.sole = Math.max(worst.sole, e.sole);
      worst.elbow = Math.max(worst.elbow, e.elbow);
      worst.elbowUp = Math.max(worst.elbowUp, e.elbowUp);
      worst.length = Math.max(worst.length, e.length);
      elbowMin = Math.min(elbowMin, e.elbow);
      if (st.finished) break outer;
    }
    expect(game.getState().finished).toBe(true);
    expect(ridden).toBeGreaterThan(4000);
    expect(poses.has('forward') && poses.has('back'), 'the golden leans both ways').toBe(true);
    // The bars — and what the trace measured before (docs/evidence/hero-art/pose-compare/trace-before.json): grips
    // 16.8 cm / 14.6 cm off, elbows straight on 1146 / 1181 ticks, above the shoulders on 3747 / 2642 ticks.
    expect(worst.grip, 'grip').toBeLessThan(0.02);
    expect(worst.grip, 'grip (in reach on every tick: exact)').toBeLessThan(1e-4);
    expect(worst.sole, 'sole').toBeLessThan(1e-4);
    expect(worst.elbow, 'elbow').toBeLessThanOrEqual(175);
    expect(worst.elbowUp, 'elbow above shoulder').toBeLessThan(-0.1);
    expect(worst.length).toBeLessThan(1e-4);
    expect(elbowMin, 'the arms do move').toBeLessThan(90);
    expect(limited / ridden, 'the reach limit is the exception').toBeLessThan(0.02);
    // Round 2: on the flat (both wheels down, bike within 6° of level) the seated clip is the base (measured 75 % rookie / 65 % pro).
    expect(flat).toBeGreaterThan(300);
    expect(flatSeated / flat, 'seated share of the flat ticks').toBeGreaterThanOrEqual(0.6);
  });
});
