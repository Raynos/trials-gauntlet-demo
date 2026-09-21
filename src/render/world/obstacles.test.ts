import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ALL_TRACKS, compileTrack, getTrack } from '../../tracks';
import { MaterialLibrary } from '../materials/library';
import { buildObstacles } from './obstacles';
import { profileY } from './track';

afterEach(() => vi.restoreAllMocks());

describe('obstacle material merges', () => {
  // Installed iOS exposed missing rustSteel buckets on these real tracks: indexed
  // drum cradles/boxes shared a material with nonindexed extruded seesaw stands.
  const affected = new Set(['m2-drum-roll', 'x2-pipe-dream', 'x3-gauntlet', 'p2-canyon-run', 'p3-snow-line', 'p5-foundry-floor']);

  it.each(ALL_TRACKS)('keeps all obstacle geometry compatible on $id', (def) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const lib = new MaterialLibrary(def.seed);
    const built = buildObstacles(compileTrack(def), lib);
    expect(errors.mock.calls).toEqual([]);
    if (affected.has(def.id)) {
      const steel = built.group.getObjectByName('obstacles:rustSteel') as THREE.Mesh | undefined;
      expect(steel).toBeDefined();
      expect(steel!.material).toBe(lib.get('rustSteel'));
      expect(steel!.geometry.index!.count).toBeGreaterThan(0);
    }
    built.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const g = object.geometry;
      for (const name of ['position', 'normal', 'uv']) {
        const attribute = g.getAttribute(name);
        expect(attribute.count).toBe(g.getAttribute('position').count);
        expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
      }
      g.dispose();
    });
    lib.dispose();
  });

  it('preserves an extruded stand’s triangle order, hard normals, UVs and cap/side groups', () => {
    const track = compileTrack(getTrack('m3-see-saw')!);
    const placed = track.placed.find((p) => p.kind === 'seesaw')!;
    const collider = track.colliders.find((c) => placed.colliderIds.includes(c.id) && c.kind === 'seesaw')!;
    if (collider.kind !== 'seesaw') throw new Error('Expected the real seesaw fixture');
    const lib = new MaterialLibrary(track.def.seed);
    const built = buildObstacles({ ...track, placed: [placed], colliders: [collider], hazards: [] }, lib);
    const actual = (built.group.getObjectByName('obstacles:rustSteel') as THREE.Mesh).geometry;
    const ground = profileY(track.def.profile, collider.pivot.x);
    const height = collider.pivot.y - ground;
    const shape = new THREE.Shape([
      new THREE.Vector2(collider.pivot.x - height * 0.6, ground),
      new THREE.Vector2(collider.pivot.x + height * 0.6, ground),
      new THREE.Vector2(collider.pivot.x, collider.pivot.y - 0.02),
    ]);
    const expected = new THREE.ExtrudeGeometry(shape, { depth: 2.7, bevelEnabled: false, steps: 1 });
    expected.translate(0, 0, -1.35);
    const uv = expected.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.5);

    expect(Array.from(actual.index!.array)).toEqual(Array.from({ length: expected.getAttribute('position').count }, (_, i) => i));
    for (const name of ['position', 'normal', 'uv']) expect(actual.getAttribute(name).array).toEqual(expected.getAttribute(name).array);
    expect(actual.groups).toEqual(expected.groups);
    expected.dispose();
    built.group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    lib.dispose();
  });
});
