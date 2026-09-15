import { relative, resolve } from 'node:path';
import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BIKE_GEOMETRY_V2 } from '../../physics/v2/tuning';
import { BrakeHose } from './brakeHose';
import { loadRig } from './gltfTestUtils';

const modelDir = process.env['HERO_BIKE_MODELS'] ?? 'public/models';
describe.each(['bike.glb', 'bike-lod.glb'])('%s brake hose', file => {
  let source: THREE.Mesh;
  beforeAll(async () => {
    const gltf = await loadRig(relative(resolve('public/models'), resolve(modelDir, file)));
    source = gltf.scene.getObjectByName('brake_hose') as THREE.Mesh;
    expect(source?.isMesh).toBe(true);
  });

  it('keeps the decoded tube attached to the fixed guide and moving caliper over full fork travel', () => {
    const mesh = source.clone(), hose = new BrakeHose(mesh);
    const sourcePosition = source.geometry.getAttribute('position');
    const restStations = source.userData['hose_stations'] as number[];
    const start = new THREE.Vector3().fromArray(restStations), end = new THREE.Vector3().fromArray(restStations, restStations.length - 3);
    // Find the actual end rings by their decoded surfaces, independent of hose vertex mapping.
    const ring = (center: THREE.Vector3): number[] => {
      const indices: number[] = [], seen: THREE.Vector3[] = [];
      for (let i = 0; i < sourcePosition.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(sourcePosition, i);
        if (p.distanceTo(center) < .0033 && !seen.some(q => q.distanceTo(p) < 1e-6)) { indices.push(i); seen.push(p); }
      }
      expect(indices.length).toBeGreaterThanOrEqual(3);
      return indices;
    };
    const first = ring(start), last = ring(end);
    const centerOf = (indices: number[]): THREE.Vector3 => {
      const sum = new THREE.Vector3(), p = mesh.geometry.getAttribute('position');
      for (const i of indices) sum.add(new THREE.Vector3().fromBufferAttribute(p, i));
      return sum.multiplyScalar(1 / indices.length);
    };
    for (let i = 0; i <= 48; i++) {
      const travel = .24 * i / 48 - BIKE_GEOMETRY_V2.frontReferenceCompression;
      const dx = BIKE_GEOMETRY_V2.forkAxis.x * travel, dy = BIKE_GEOMETRY_V2.forkAxis.y * travel;
      hose.update(dx, dy);
      expect(centerOf(first).distanceTo(start)).toBeLessThan(2e-6);
      expect(centerOf(last).distanceTo(end.clone().add(new THREE.Vector3(dx, dy, 0)))).toBeLessThan(2e-6);
      let length = 0;
      for (let j = 1; j < hose.stations.length; j++) length += hose.stations[j]!.distanceTo(hose.stations[j - 1]!);
      expect(Math.abs(length - hose.length)).toBeLessThan(1e-7);
      const position = mesh.geometry.getAttribute('position'), normal = mesh.geometry.getAttribute('normal');
      for (let j = 0; j < position.count; j++) {
        expect(Number.isFinite(position.getX(j) + position.getY(j) + position.getZ(j))).toBe(true);
        expect(Math.abs(Math.hypot(normal.getX(j), normal.getY(j), normal.getZ(j)) - 1)).toBeLessThan(2e-6);
      }
      const index = mesh.geometry.index!;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), tmp = new THREE.Vector3();
      for (let j = 0; j < index.count; j += 3) {
        const ia = index.getX(j), ib = index.getX(j + 1), ic = index.getX(j + 2);
        a.fromBufferAttribute(position, ia); b.fromBufferAttribute(position, ib); c.fromBufferAttribute(position, ic);
        b.sub(a).cross(c.sub(a));
        expect(b.lengthSq()).toBeGreaterThan(1e-16);
        n.fromBufferAttribute(normal, ia).add(tmp.fromBufferAttribute(normal, ib)).add(tmp.fromBufferAttribute(normal, ic));
        expect(b.dot(n)).toBeGreaterThan(0);
      }
    }
    hose.dispose();
  });

  it('repeats geometry after arbitrary history and keeps other instances and source bytes separate', () => {
    const original = source.geometry.getAttribute('position').array.slice();
    const liveMesh = source.clone(), ghostMesh = source.clone();
    const live = new BrakeHose(liveMesh), ghost = new BrakeHose(ghostMesh);
    live.update(-.04, .1); ghost.update(-.04, .1);
    const expected = ghost.geometry.getAttribute('position').array.slice();
    for (let i = 0; i < 50; i++) live.update(-.06 * i / 50, .16 * i / 50);
    live.update(-.04, .1);
    expect(live.geometry.getAttribute('position').array).toEqual(expected);
    expect(ghost.geometry.getAttribute('position').array).toEqual(expected);
    expect(source.geometry.getAttribute('position').array).toEqual(original);
    const dispose = vi.spyOn(live.geometry, 'dispose'); live.dispose(); expect(dispose).toHaveBeenCalledOnce();
    expect(ghost.geometry).not.toBe(live.geometry); expect(source.geometry).not.toBe(live.geometry);
    ghost.dispose();
  });
});
