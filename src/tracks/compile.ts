/**
 * Track compiler: TrackDef -> CompiledTrack (CONTRACT.md §2.2).
 *
 * SCAFFOLD STUB: only the ground profile becomes a collider. The tracks owner
 * replaces this with the full obstacle vocabulary; the shape of the output is
 * the contract and does not change.
 */
import type { Collider, CompiledTrack, TrackDef } from '../core/types';
import { StateHasher } from '../core/hash';

export function compileTrack(def: TrackDef): CompiledTrack {
  const colliders: Collider[] = [
    {
      kind: 'polyline',
      id: 0,
      surface: 'dirt',
      obstacleIndex: -1,
      points: def.profile.map((p) => ({ x: p.x, y: p.y })),
    },
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of def.profile) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return {
    def,
    colliders,
    hazards: [],
    placed: [],
    bounds: { minX, maxX, minY, maxY },
    oobY: minY - 6,
    hash: hashColliders(colliders),
  };
}

export function hashColliders(colliders: readonly Collider[]): string {
  const h = new StateHasher();
  for (const c of colliders) {
    h.string(c.kind).number(c.id).string(c.surface).number(c.obstacleIndex);
    switch (c.kind) {
      case 'polyline':
        for (const p of c.points) h.number(p.x).number(p.y);
        h.bool(c.oneWay ?? false);
        break;
      case 'circle':
        h.number(c.center.x).number(c.center.y).number(c.radius).bool(c.rolls ?? false);
        break;
      case 'box':
        h.number(c.center.x).number(c.center.y).number(c.halfW).number(c.halfH).number(c.angle);
        break;
      case 'seesaw':
        h.number(c.pivot.x).number(c.pivot.y).number(c.halfLength).number(c.thickness).number(c.maxAngle).number(c.mass);
        break;
    }
  }
  return h.digest();
}
