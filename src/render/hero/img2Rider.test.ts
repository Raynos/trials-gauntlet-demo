import * as THREE from 'three';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import type { HeroBike } from '../bike/bikeModel';
import { FrameBuilder } from '../frame';
import { newChain, solveChain } from '../rider/riderModel';
import type { MaterialLibrary } from '../materials/library';
import { Img2Rider } from './img2Rider';

// No DOM/GPU: texture loading is omitted; these assertions cover actual transformed rig data.
const textures: string[] = [];
let rider: Img2Rider;
const frame = new THREE.Group();
beforeAll(() => {
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(url => { textures.push(url); return new THREE.Texture(); });
  rider = new Img2Rider({ complete() {} } as unknown as MaterialLibrary);
  rider.attach({ frame } as HeroBike);
}, 30000);
afterAll(() => vi.restoreAllMocks());

describe('img2threejs runtime adapter', () => {
  it('retains generated skins and aligns limb bind axes with their actual children', () => {
    expect(rider.debug.bones).toBe(19);
    expect(rider.triangles).toBeGreaterThan(1000);
    const source = rider.source.scene;
    source.updateMatrixWorld(true);
    source.traverse(o => {
      const skin = o as THREE.SkinnedMesh;
      if (!skin.isSkinnedMesh) return;
      skin.skeleton.update();
      const positions = skin.geometry.getAttribute('position');
      for (const index of [0, Math.floor(positions.count / 2), positions.count - 1]) {
        const authored = new THREE.Vector3().fromBufferAttribute(positions, index);
        expect(skin.getVertexPosition(index, new THREE.Vector3()).distanceTo(authored)).toBeLessThan(1e-6);
      }
    });
    for (const side of ['L', 'R']) {
      for (const [a, b] of [['upperArm', 'forearm'], ['forearm', 'hand'], ['thigh', 'shin'], ['shin', 'foot']]) {
        const parent = source.getObjectByName(`${a}.${side}`)!;
        const child = source.getObjectByName(`${b}.${side}`)!;
        const direction = child.getWorldPosition(new THREE.Vector3()).sub(parent.getWorldPosition(new THREE.Vector3())).normalize();
        const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(parent.getWorldQuaternion(new THREE.Quaternion()));
        expect(direction.distanceTo(axis)).toBeLessThan(1e-6);
      }
      expect(Math.sign(source.getObjectByName(`upperArm.${side}`)!.getWorldPosition(new THREE.Vector3()).z)).toBe(side === 'L' ? 1 : -1);
    }
    expect(textures.length).toBeGreaterThan(0);
  });
  it('poses real skin vertices and keeps reachable hands and feet on contacts', () => {
    const f = new FrameBuilder().frame;
    f.dt = 1 / 60; f.cut = true;
    const poses: number[][] = [];
    for (const lean of [-.3, 0, .3]) {
      f.rider.lean = lean;
      rider.update(f);
      frame.updateMatrixWorld(true);
      const coordinates: number[] = [];
      frame.traverse(o => {
        expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true);
        const skin = o as THREE.SkinnedMesh;
        if (skin.isSkinnedMesh) {
          skin.skeleton.update();
          const p = skin.getVertexPosition(0, new THREE.Vector3()).applyMatrix4(skin.matrixWorld);
          coordinates.push(...p.toArray());
        }
      });
      expect(coordinates.length).toBeGreaterThan(30);
      expect(coordinates.every(Number.isFinite)).toBe(true);
      poses.push(coordinates);
      const chain = solveChain(f.rider, newChain());
      for (const [i, side] of ['L', 'R'].entries()) {
        const hand = frame.getObjectByName(`hand.${side}`)!;
        const foot = frame.getObjectByName(`foot.${side}`)!;
        expect(hand.getWorldPosition(new THREE.Vector3()).distanceTo(chain.hand[i]!)).toBeLessThan(.001);
        expect(foot.getWorldPosition(new THREE.Vector3()).distanceTo(chain.ankle[i]!)).toBeLessThan(.001);
      }
      expect(Math.max(...rider.debug.ankleErr)).toBeLessThan(.001);
      expect(Math.max(...rider.debug.gripErr)).toBeLessThan(.001);
    }
    expect(poses[0]).not.toEqual(poses[2]);
  });
});
