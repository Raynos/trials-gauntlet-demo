import { describe, expect, it } from 'vitest';
import { compileTrack, getTrack, isLabTrackId, LAB_TRACKS } from '../index';
import { LAB_BOX_CLIMB, LAB_BOX_GEOMETRY, LAB_RAMP_JUMP, LAB_RAMP_GEOMETRY } from './lab-reference';

describe('Reference maneuver labs', () => {
  it('exposes both compact courses in Labs, with the ordinary restart and finish run-out', () => {
    for (const def of [LAB_BOX_CLIMB, LAB_RAMP_JUMP]) {
      expect(getTrack(def.id)).toBe(def);
      expect(LAB_TRACKS).toContain(def);
      expect(isLabTrackId(def.id)).toBe(true);
      expect(def.finishX).toBeGreaterThanOrEqual(25);
      expect(def.finishX).toBeLessThanOrEqual(45);
      // One whole maneuver per attempt: no intermediate checkpoint bypasses its approach.
      expect(def.checkpoints).toEqual([]);
      expect(compileTrack(def).hazards).toEqual([]);
    }
  });

  it('keeps both container faces vertical and the visible box dimensions on the collision geometry', () => {
    const boxes = LAB_BOX_CLIMB.obstacles.filter((o) => o.kind === 'box' && o.pos.x < LAB_BOX_CLIMB.finishX);
    expect(boxes.map((o) => ({ x: o.pos.x, y: o.pos.y, width: o.params?.width, height: o.params?.height }))).toEqual(LAB_BOX_GEOMETRY.boxes);
    const track = compileTrack(LAB_BOX_CLIMB);
    for (const box of LAB_BOX_GEOMETRY.boxes) {
      const top = { x: box.x, y: box.height };
      const edges = track.colliders.flatMap((c) => c.kind === 'polyline' ? c.points.slice(1).map((b, i) => ({ a: c.points[i]!, b })) : []);
      expect(edges.some(({ a, b }) => a.x === box.x && b.x === top.x && b.y === top.y && a.y < b.y)).toBe(true);
    }
    expect(LAB_BOX_CLIMB.finishX).toBe(LAB_BOX_GEOMETRY.finishX);
  });

  it('preserves the small approach, concave takeoff, dry gap and elevated landing as separate beats', () => {
    const def = LAB_RAMP_JUMP;
    const course = def.obstacles.filter((o) => o.pos.x < def.finishX);
    expect(course.map((o) => [o.kind, o.pos.x])).toEqual([['ramp', 8], ['ramp', 11], ['ramp', 17], ['gap', 23]]);
    expect(course[2]?.params).toMatchObject({ length: 6, height: 2.4, curve: 0.65, surface: 'wood' });
    expect(course[3]?.params).toMatchObject({ width: 3, rise: 1.8, hazard: 'none' });
    expect(def.profile).toContainEqual(LAB_RAMP_GEOMETRY.landing);
    expect(def.finishX).toBe(LAB_RAMP_GEOMETRY.finishX);
  });
});
