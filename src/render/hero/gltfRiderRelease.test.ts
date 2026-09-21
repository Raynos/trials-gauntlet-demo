/** Production Game impact → released ragdoll → input restart. The continuity gate compares
 * the first detached endpoints and velocities to the SAME tick's physical body; total motion
 * between ticks includes real impact impulses and must not be confused with a render teleport. */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AVAILABLE_RIDER_PRESETS } from '../../core/riderPresets';
import { Game } from '../../game/game';
import { createBikePhysicsV2 } from '../../physics/v2/bike';
import { FrameBuilder } from '../frame';
import type { GameRenderer } from '../index';
import { loadRig } from './gltfTestUtils';
import { prepareHero } from './lod';
import { fixture } from './riderPoseTestUtils';

const JOINTS = ['pelvis', 'neck', 'head', 'forearm.L', 'hand.L', 'shin.L', 'foot.L', 'forearm.R', 'hand.R', 'shin.R', 'foot.R'];
const subjects = AVAILABLE_RIDER_PRESETS.flatMap(p => [`rider-${p.id}.glb`, `rider-${p.id}-lod.glb`]);
describe.each(subjects)('%s production impact release', file => {
  let gltf: GLTF;
  beforeAll(async () => { gltf = await loadRig(file); await prepareHero(gltf); });
  it.each(['rookie', 'pro'] as const)('%s detaches at physical endpoints without introducing a velocity jump or stale attachment', cls => {
    const physics = createBikePhysicsV2(120);
    const game = new Game({ physics, renderer: { setTrack() {}, onEvent() {}, setQuality() {}, setBikeClass() {} } as unknown as GameRenderer, physicsHz: 120, autoSkipCountdown: true, ghostEnabled: false });
    game.loadTrack('flat-test', 42, cls);
    game.setInput({ throttle: 0, brake: 0, lean: 0, hop: false, restart: false }); game.step(60);
    const st = game.getState();
    // A 2m drop with rearward intent overloads the grip on both classes, independently
    // of the obsolete rear-first/head-sensor fixture from the standing rider geometry.
    physics.teleport({ pos: { x: st.wheels.rear.pos.x, y: st.wheels.rear.pos.y + 2 }, angle: 0, vel: { x: 10, y: -8 }, angVel: 3 });
    const rig = fixture(gltf, cls), frames = new FrameBuilder();
    const world = (r = rig) => JOINTS.map(n => r.nodes.get(n)!.getWorldPosition(new THREE.Vector3()));
    let previous: THREE.Vector3[] | null = null;
    let detached = 0, lastRiding: THREE.Vector3[] | null = null, totalStepMotion = 0;
    for (let tick = 0; tick < 100; tick++) {
      game.setInput({ throttle: .2, brake: 0, lean: -1, hop: false, restart: false }); game.step(1);
      const f = frames.build(game.getState(), 1); rig.update(f);
      const points = world();
      if (f.ragdoll) {
        detached++;
        if (detached === 1) {
          expect(physics.debug().crashCause).toBe('thrown');
          expect(previous).not.toBeNull();
          lastRiding = previous;
          const physical = fixture(gltf, cls); physical.update({ ...f, ragdoll: null });
          const physicalPoints = world(physical);
          for (let i = 0; i < points.length; i++) {
            expect(points[i]!.distanceTo(physicalPoints[i]!), `spawn endpoint ${JOINTS[i]}`).toBeLessThan(1e-5);
            const drawnVelocity = points[i]!.clone().sub(previous![i]!).multiplyScalar(120);
            const physicalVelocity = physicalPoints[i]!.clone().sub(previous![i]!).multiplyScalar(120);
            expect(drawnVelocity.distanceTo(physicalVelocity), `artificial release velocity ${JOINTS[i]}`).toBeLessThan(.002);
          }
        }
        expect(rig.rider.debug.handOnGrip).toEqual([false, false]);
        expect(rig.rider.debug.footOnPeg).toEqual([false, false]);
        expect(rig.rider.debug.physicalPose).toBe(false);
        // Once detached, even a completely different bike transform cannot carry the rider.
        rig.update({ ...f, bikeX: f.bikeX + 10, bikeY: f.bikeY + 7, bikeAngle: f.bikeAngle + 1 });
        const movedBike = world();
        for (let i = 0; i < points.length; i++) expect(points[i]!.distanceTo(movedBike[i]!)).toBeLessThan(1e-10);
        rig.update(f);
      }
      if (previous) totalStepMotion = Math.max(totalStepMotion, ...points.map((p, i) => p.distanceTo(previous![i]!)));
      previous = points;
      if (detached >= 12) break;
    }
    expect(detached).toBe(12);
    expect(Number.isFinite(totalStepMotion)).toBe(true);
    expect(Math.max(...world().map((p, i) => p.distanceTo(lastRiding![i]!))), 'release is visibly moving, not a frozen riding pose').toBeGreaterThan(.1);
    game.setInput({ throttle: 0, brake: 0, lean: 0, hop: false, restart: true }); game.step(1);
    const restarted = frames.build(game.getState(), 1);
    expect(restarted.ragdoll).toBeNull();
    rig.update(restarted);
    const fresh = fixture(gltf, cls); fresh.update(restarted);
    expect(rig.snapshot()).toEqual(fresh.snapshot());
    expect(rig.rider.debug.physicalPose).toBe(true);
  });
});
