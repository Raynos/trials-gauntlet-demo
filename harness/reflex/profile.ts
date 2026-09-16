/**
 * What a player sees of the ground: the top surface height at every x, built
 * from the compiled colliders (the same geometry render draws). Nothing here
 * is a track internal — no obstacle kinds, no params, no checkpoints — just
 * the silhouette a rider reads off the screen.
 *
 * Static geometry is rasterised once per track at GRID m; seesaw planks are
 * re-sampled per query at their current angle (they visibly move).
 */
import type { Collider, CompiledTrack, PhysicsState, Vec2 } from '../../src/core/types';

export const GRID = 0.25;

/** A see-saw plank as the rider sees it at one instant (round 11): the board under or spanning x. */
export interface SeesawUnder {
  id: number;
  pivot: Vec2;
  halfLength: number;
  /** Current angle (rad, +CCW: the rest pose has the far (+x) end up). */
  angle: number;
  /** Angular rate (rad/s, +CCW: negative = the far end going down). */
  angVel: number;
  /** Plank top y at x. */
  top: number;
  /** Metres from x to the far (+x) end of the plank's projected span. */
  toFarEnd: number;
  /** The plank is the ground under x (its top is the highest surface there). */
  isGround: boolean;
}

export interface GroundProfile {
  minX: number;
  maxX: number;
  /** Top surface y at x (−Infinity where nothing solid exists = a hole). */
  heightAt(x: number, st?: PhysicsState): number;
  /** Local slope angle (radians, +ve uphill) over ±half m around x. */
  slopeAt(x: number, half?: number, st?: PhysicsState): number;
  /** True when x lies inside a hazard zone footprint (fire/water/kill) at ground level. */
  hazardAt(x: number): boolean;
  /** The see-saw whose projected span covers x (the board's current pose from `st`), or null. */
  seesawAt(x: number, st?: PhysicsState): SeesawUnder | null;
}

export function buildProfile(compiled: CompiledTrack): GroundProfile {
  const minX = Math.floor(compiled.bounds.minX - 5);
  const maxX = Math.ceil(compiled.bounds.maxX + 5);
  const n = Math.ceil((maxX - minX) / GRID) + 1;
  const top = new Float64Array(n).fill(-Infinity);
  const seesaws: Extract<Collider, { kind: 'seesaw' }>[] = [];

  const raise = (x: number, y: number): void => {
    const i = Math.round((x - minX) / GRID);
    if (i < 0 || i >= n) return;
    if (y > top[i]!) top[i] = y;
  };
  const segment = (a: Vec2, b: Vec2): void => {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    if (x1 - x0 < 1e-9) {
      raise(a.x, Math.max(a.y, b.y));
      return;
    }
    const i0 = Math.ceil((x0 - minX) / GRID);
    const i1 = Math.floor((x1 - minX) / GRID);
    for (let i = i0; i <= i1; i++) {
      const x = minX + i * GRID;
      const t = (x - a.x) / (b.x - a.x);
      raise(x, a.y + (b.y - a.y) * t);
    }
    raise(a.x, a.y);
    raise(b.x, b.y);
  };

  for (const c of compiled.colliders) {
    switch (c.kind) {
      case 'polyline':
        for (let i = 0; i + 1 < c.points.length; i++) segment(c.points[i]!, c.points[i + 1]!);
        break;
      case 'circle': {
        const i0 = Math.ceil((c.center.x - c.radius - minX) / GRID);
        const i1 = Math.floor((c.center.x + c.radius - minX) / GRID);
        for (let i = i0; i <= i1; i++) {
          const x = minX + i * GRID;
          const dx = x - c.center.x;
          raise(x, c.center.y + Math.sqrt(Math.max(0, c.radius * c.radius - dx * dx)));
        }
        break;
      }
      case 'box': {
        const ca = Math.cos(c.angle);
        const sa = Math.sin(c.angle);
        const corners: Vec2[] = [
          { x: c.center.x + c.halfW * ca - c.halfH * sa, y: c.center.y + c.halfW * sa + c.halfH * ca },
          { x: c.center.x - c.halfW * ca - c.halfH * sa, y: c.center.y - c.halfW * sa + c.halfH * ca },
          { x: c.center.x - c.halfW * ca + c.halfH * sa, y: c.center.y - c.halfW * sa - c.halfH * ca },
          { x: c.center.x + c.halfW * ca + c.halfH * sa, y: c.center.y + c.halfW * sa - c.halfH * ca },
        ];
        for (let i = 0; i < 4; i++) segment(corners[i]!, corners[(i + 1) % 4]!);
        break;
      }
      case 'seesaw':
        seesaws.push(c);
        // Static part: the pivot post top, so a hole does not show under the plank.
        raise(c.pivot.x, c.pivot.y);
        break;
    }
  }

  const hazardCells = new Uint8Array(n);
  for (const h of compiled.hazards) {
    const i0 = Math.max(0, Math.ceil((h.min.x - minX) / GRID));
    const i1 = Math.min(n - 1, Math.floor((h.max.x - minX) / GRID));
    for (let i = i0; i <= i1; i++) {
      // Only zones that reach down to (or below) the local ground count as ground hazards.
      if (h.min.y <= top[i]! + 0.5 || top[i] === -Infinity) hazardCells[i] = 1;
    }
  }

  const staticAt = (x: number): number => {
    const f = (x - minX) / GRID;
    const i = Math.floor(f);
    if (i < 0 || i + 1 >= n) return -Infinity;
    const a = top[i]!;
    const b = top[i + 1]!;
    if (a === -Infinity || b === -Infinity) return Math.max(a, b);
    return a + (b - a) * (f - i);
  };

  const seesawAt = (x: number, st?: PhysicsState): number => {
    let y = -Infinity;
    for (const s of seesaws) {
      const angle = st?.seesaws.find((q) => q.id === s.id)?.angle ?? 0;
      const ca = Math.cos(angle);
      const half = s.halfLength * Math.abs(ca);
      if (x < s.pivot.x - half || x > s.pivot.x + half) continue;
      const u = (x - s.pivot.x) / (ca === 0 ? 1e-9 : ca);
      const py = s.pivot.y + u * Math.sin(angle) + s.thickness;
      if (py > y) y = py;
    }
    return y;
  };

  const heightAt = (x: number, st?: PhysicsState): number => {
    const a = staticAt(x);
    if (seesaws.length === 0) return a;
    return Math.max(a, seesawAt(x, st));
  };

  const seesawUnder = (x: number, st?: PhysicsState): SeesawUnder | null => {
    for (const s of seesaws) {
      const live = st?.seesaws.find((q) => q.id === s.id);
      const angle = live?.angle ?? 0;
      const angVel = live?.angVel ?? 0;
      const ca = Math.cos(angle);
      const half = s.halfLength * Math.abs(ca);
      if (x < s.pivot.x - half || x > s.pivot.x + half) continue;
      const u = (x - s.pivot.x) / (ca === 0 ? 1e-9 : ca);
      const top = s.pivot.y + u * Math.sin(angle) + s.thickness;
      return { id: s.id, pivot: s.pivot, halfLength: s.halfLength, angle, angVel, top, toFarEnd: s.pivot.x + half - x, isGround: top >= staticAt(x) - 0.02 };
    }
    return null;
  };

  return {
    minX,
    maxX,
    heightAt,
    slopeAt(x, half = 0.5, st) {
      const a = heightAt(x - half, st);
      const b = heightAt(x + half, st);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
      return Math.atan2(b - a, 2 * half);
    },
    hazardAt(x) {
      const i = Math.round((x - minX) / GRID);
      return i >= 0 && i < n && hazardCells[i] === 1;
    },
    seesawAt: seesawUnder,
  };
}
