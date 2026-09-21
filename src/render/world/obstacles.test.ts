import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { compileTrack, getTrack, hashColliders } from '../../tracks';
import type { MaterialLibrary } from '../materials/library';
import { buildObstacles } from './obstacles';

it('Snow Line retains its wood ramps, crate and plank in one material batch without merge errors', () => {
  const track = compileTrack(getTrack('p3-snow-line')!);
  const before = hashColliders(track.colliders);
  const lib = { get: () => new THREE.MeshStandardMaterial() } as unknown as MaterialLibrary;
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const result = buildObstacles(track, lib);
    expect(errors.mock.calls).toEqual([]);
    const plywood = result.group.getObjectByName('obstacles:plywood') as THREE.Mesh | undefined;
    expect(plywood).toBeDefined();
    expect(hashColliders(track.colliders)).toBe(before);
    // Compare the full material batch to rendering each placed obstacle independently:
    // batching may change indexing, but it must not discard any triangle or its attributes.
    const rows = (mesh: THREE.Mesh | undefined): string[] => {
      if (!mesh) return [];
      const g = mesh.geometry;
      const attrs = ['position', 'normal', 'uv'].map(name => g.getAttribute(name));
      const out: string[] = [];
      for (let j = 0; j < (g.index?.count ?? attrs[0]!.count); j++) {
        const i = g.index ? g.index.getX(j) : j;
        out.push(attrs.flatMap(a => Array.from({ length: a.itemSize }, (_, k) => a.array[i * a.itemSize + k])).join(','));
      }
      return out.sort();
    };
    const expected: string[] = [];
    for (const placed of track.placed) {
      const part = buildObstacles({ ...track, placed: [placed], colliders: track.colliders.filter(c => placed.colliderIds.includes(c.id)), hazards: [] }, lib);
      expected.push(...rows(part.group.getObjectByName('obstacles:plywood') as THREE.Mesh | undefined));
    }
    expect(rows(plywood)).toEqual(expected.sort());
    expect(errors.mock.calls).toEqual([]);
  } finally { errors.mockRestore(); }
});

it('Container Step skins retain the exact authored collision and batch both reference colors', () => {
  const track = compileTrack(getTrack('lab-box-climb')!);
  const before = hashColliders(track.colliders);
  const lib = { get: () => new THREE.MeshStandardMaterial() } as unknown as MaterialLibrary;
  const result = buildObstacles(track, lib);
  expect(hashColliders(track.colliders)).toBe(before);
  expect(result.group.getObjectByName('obstacles:labContainerRed')).toBeDefined();
  expect(result.group.getObjectByName('obstacles:labContainerIvory')).toBeDefined();
  expect(result.group.getObjectByName('obstacles:darkSteel')).toBeDefined();
  expect(result.drawCalls).toBeLessThan(10);
});
