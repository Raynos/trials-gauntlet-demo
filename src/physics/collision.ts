/**
 * Collision geometry built once per `loadTrack` from `CompiledTrack.colliders`
 * (CONTRACT §2.2). Everything that moves in the world is a circle (wheels,
 * frame hard points, rider sensors, ragdoll limb ends), so the narrowphase is
 * circle-vs-{segment, circle, oriented box}. Boxes may be attached to a
 * dynamic body (seesaw) and circles to a pinned spinning body (drum).
 *
 * The broadphase is a uniform grid along x built by index arithmetic: no
 * hashing on object identity, no sorting, so the query order is fixed.
 */
import type { Collider, CompiledTrack, SurfaceKind } from '../core/types';
import { SURFACES } from './tuning';
import { cos, sin } from './dmath';

export const enum PrimKind {
  Segment = 0,
  Circle = 1,
  Box = 2,
}

export interface Prim {
  kind: PrimKind;
  colliderId: number;
  /** Index into SURFACES. */
  surface: number;
  oneWay: boolean;
  /** Dynamic body index owning this primitive, or -1 when static. */
  body: number;
  // segment: a -> b, n = left normal (up for a +x polyline)
  ax: number;
  ay: number;
  bx: number;
  by: number;
  nx: number;
  ny: number;
  // circle / box centre (world, static) -- for body-owned prims the body pose is used instead
  cx: number;
  cy: number;
  r: number;
  hw: number;
  hh: number;
  angle: number;
  minX: number;
  maxX: number;
}

export interface Manifold {
  /** Contact point on the primitive surface (world). */
  px: number;
  py: number;
  /** Normal pointing from the primitive toward the circle centre. */
  nx: number;
  ny: number;
  /** Signed separation between circle rim and surface (negative = penetrating). */
  sep: number;
  prim: Prim;
}

export const CELL = 2;

export class CollisionWorld {
  readonly prims: Prim[] = [];
  readonly seesawBodies: { prim: Prim; collider: Extract<Collider, { kind: 'seesaw' }> }[] = [];
  readonly drumBodies: { prim: Prim; collider: Extract<Collider, { kind: 'circle' }> }[] = [];
  private cellStart = new Int32Array(1);
  private cellItems = new Int32Array(0);
  private originX = 0;
  private cellCount = 0;

  constructor(track: CompiledTrack, firstBodyIndex: number) {
    let body = firstBodyIndex;
    for (const c of track.colliders) {
      const surface = Math.max(0, SURFACES.indexOf(c.surface));
      switch (c.kind) {
        case 'polyline':
          for (let i = 1; i < c.points.length; i++) {
            const a = c.points[i - 1]!;
            const b = c.points[i]!;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const l = Math.sqrt(dx * dx + dy * dy);
            if (l < 1e-9) continue;
            this.prims.push({
              kind: PrimKind.Segment,
              colliderId: c.id,
              surface,
              oneWay: c.oneWay ?? false,
              body: -1,
              ax: a.x,
              ay: a.y,
              bx: b.x,
              by: b.y,
              nx: -dy / l,
              ny: dx / l,
              cx: 0,
              cy: 0,
              r: 0,
              hw: 0,
              hh: 0,
              angle: 0,
              minX: Math.min(a.x, b.x),
              maxX: Math.max(a.x, b.x),
            });
          }
          break;
        case 'circle': {
          const p: Prim = {
            kind: PrimKind.Circle,
            colliderId: c.id,
            surface,
            oneWay: false,
            body: c.rolls ? body++ : -1,
            ax: 0,
            ay: 0,
            bx: 0,
            by: 0,
            nx: 0,
            ny: 0,
            cx: c.center.x,
            cy: c.center.y,
            r: c.radius,
            hw: 0,
            hh: 0,
            angle: 0,
            minX: c.center.x - c.radius,
            maxX: c.center.x + c.radius,
          };
          this.prims.push(p);
          if (c.rolls) this.drumBodies.push({ prim: p, collider: c });
          break;
        }
        case 'box': {
          const ext = Math.abs(c.halfW * cos(c.angle)) + Math.abs(c.halfH * sin(c.angle));
          this.prims.push({
            kind: PrimKind.Box,
            colliderId: c.id,
            surface,
            oneWay: false,
            body: -1,
            ax: 0,
            ay: 0,
            bx: 0,
            by: 0,
            nx: 0,
            ny: 0,
            cx: c.center.x,
            cy: c.center.y,
            r: 0,
            hw: c.halfW,
            hh: c.halfH,
            angle: c.angle,
            minX: c.center.x - ext,
            maxX: c.center.x + ext,
          });
          break;
        }
        case 'seesaw': {
          const ext = c.halfLength + c.thickness;
          const p: Prim = {
            kind: PrimKind.Box,
            colliderId: c.id,
            surface,
            oneWay: false,
            body: body++,
            ax: 0,
            ay: 0,
            bx: 0,
            by: 0,
            nx: 0,
            ny: 0,
            cx: c.pivot.x,
            cy: c.pivot.y,
            r: 0,
            hw: c.halfLength,
            hh: c.thickness * 0.5,
            angle: 0,
            minX: c.pivot.x - ext,
            maxX: c.pivot.x + ext,
          };
          this.prims.push(p);
          this.seesawBodies.push({ prim: p, collider: c });
          break;
        }
      }
    }
    // Dynamic body indices: all seesaws first, then all drums (bike.ts relies on this order).
    for (let i = 0; i < this.seesawBodies.length; i++) this.seesawBodies[i]!.prim.body = firstBodyIndex + i;
    for (let i = 0; i < this.drumBodies.length; i++) this.drumBodies[i]!.prim.body = firstBodyIndex + this.seesawBodies.length + i;
    void body;
    // Grid.
    let minX = Infinity;
    let maxX = -Infinity;
    for (const p of this.prims) {
      minX = Math.min(minX, p.minX);
      maxX = Math.max(maxX, p.maxX);
    }
    if (!(minX < maxX)) {
      minX = 0;
      maxX = 1;
    }
    this.originX = minX - CELL;
    this.cellCount = Math.floor((maxX - this.originX) / CELL) + 2;
    const counts = new Int32Array(this.cellCount);
    for (const p of this.prims) {
      const c0 = this.cellOf(p.minX);
      const c1 = this.cellOf(p.maxX);
      for (let c = c0; c <= c1; c++) counts[c]!++;
    }
    this.cellStart = new Int32Array(this.cellCount + 1);
    for (let c = 0; c < this.cellCount; c++) this.cellStart[c + 1] = this.cellStart[c]! + counts[c]!;
    this.cellItems = new Int32Array(this.cellStart[this.cellCount]!);
    const fill = new Int32Array(this.cellCount);
    for (let i = 0; i < this.prims.length; i++) {
      const p = this.prims[i]!;
      const c0 = this.cellOf(p.minX);
      const c1 = this.cellOf(p.maxX);
      for (let c = c0; c <= c1; c++) {
        this.cellItems[this.cellStart[c]! + fill[c]!] = i;
        fill[c]!++;
      }
    }
  }

  private cellOf(x: number): number {
    const c = Math.floor((x - this.originX) / CELL);
    return c < 0 ? 0 : c >= this.cellCount ? this.cellCount - 1 : c;
  }

  /**
   * Collide a circle against every primitive overlapping its x-extent.
   * `poseAngle`/`poseX/Y` give body-owned primitives their current pose
   * (looked up through `bodyPose`). Calls `out` for every manifold with
   * separation < margin. Iteration order is the fixed cell/item order.
   */
  queryCircle(
    cx: number,
    cy: number,
    r: number,
    margin: number,
    bodyAngle: (body: number) => number,
    out: (m: Manifold) => void,
  ): void {
    const c0 = this.cellOf(cx - r - margin);
    const c1 = this.cellOf(cx + r + margin);
    const m = this.manifold;
    for (let c = c0; c <= c1; c++) {
      const s = this.cellStart[c]!;
      const e = this.cellStart[c + 1]!;
      for (let i = s; i < e; i++) {
        const pi = this.cellItems[i]!;
        const p = this.prims[pi]!;
        // Skip duplicates: a prim spanning several cells is only processed in the cell of its minX
        // or the first queried cell, whichever is later.
        const firstCell = this.cellOf(p.minX);
        if (c !== (firstCell > c0 ? firstCell : c0)) continue;
        if (p.maxX < cx - r - margin || p.minX > cx + r + margin) continue;
        if (circleVsPrim(cx, cy, r, p, p.body >= 0 ? bodyAngle(p.body) : p.angle, m) && m.sep < margin) out(m);
      }
    }
  }

  private readonly manifold: Manifold = { px: 0, py: 0, nx: 0, ny: 0, sep: 0, prim: null as unknown as Prim };

  surfaceName(idx: number): SurfaceKind {
    return SURFACES[idx] ?? 'dirt';
  }
}

/** Fill `m` with the closest-feature manifold; returns false when the prim cannot touch (one-way from behind). */
export function circleVsPrim(cx: number, cy: number, r: number, p: Prim, angle: number, m: Manifold): boolean {
  m.prim = p;
  switch (p.kind) {
    case PrimKind.Segment: {
      const abx = p.bx - p.ax;
      const aby = p.by - p.ay;
      const acx = cx - p.ax;
      const acy = cy - p.ay;
      if (p.oneWay && acx * p.nx + acy * p.ny < 0) return false;
      const l2 = abx * abx + aby * aby;
      let t = (acx * abx + acy * aby) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = p.ax + abx * t;
      const qy = p.ay + aby * t;
      let dx = cx - qx;
      let dy = cy - qy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1e-9) {
        dx /= d;
        dy /= d;
      } else {
        dx = p.nx;
        dy = p.ny;
      }
      m.px = qx;
      m.py = qy;
      m.nx = dx;
      m.ny = dy;
      m.sep = d - r;
      return true;
    }
    case PrimKind.Circle: {
      let dx = cx - p.cx;
      let dy = cy - p.cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1e-9) {
        dx /= d;
        dy /= d;
      } else {
        dx = 0;
        dy = 1;
      }
      m.nx = dx;
      m.ny = dy;
      m.px = p.cx + dx * p.r;
      m.py = p.cy + dy * p.r;
      m.sep = d - p.r - r;
      return true;
    }
    case PrimKind.Box: {
      const c = cos(angle);
      const s = sin(angle);
      const rx = cx - p.cx;
      const ry = cy - p.cy;
      // to local
      const lx = rx * c + ry * s;
      const ly = -rx * s + ry * c;
      const qx = lx < -p.hw ? -p.hw : lx > p.hw ? p.hw : lx;
      const qy = ly < -p.hh ? -p.hh : ly > p.hh ? p.hh : ly;
      let nlx: number;
      let nly: number;
      let sep: number;
      let qqx = qx;
      let qqy = qy;
      if (qx === lx && qy === ly) {
        // inside: push out through the nearest face
        const dxp = p.hw - lx;
        const dxn = lx + p.hw;
        const dyp = p.hh - ly;
        const dyn = ly + p.hh;
        let best = dyp;
        nlx = 0;
        nly = 1;
        qqy = p.hh;
        qqx = lx;
        if (dyn < best) {
          best = dyn;
          nlx = 0;
          nly = -1;
          qqy = -p.hh;
          qqx = lx;
        }
        if (dxp < best) {
          best = dxp;
          nlx = 1;
          nly = 0;
          qqx = p.hw;
          qqy = ly;
        }
        if (dxn < best) {
          best = dxn;
          nlx = -1;
          nly = 0;
          qqx = -p.hw;
          qqy = ly;
        }
        sep = -best - r;
      } else {
        let dx = lx - qx;
        let dy = ly - qy;
        const d = Math.sqrt(dx * dx + dy * dy);
        dx /= d;
        dy /= d;
        nlx = dx;
        nly = dy;
        sep = d - r;
      }
      m.nx = nlx * c - nly * s;
      m.ny = nlx * s + nly * c;
      m.px = p.cx + qqx * c - qqy * s;
      m.py = p.cy + qqx * s + qqy * c;
      m.sep = sep;
      return true;
    }
  }
  return false;
}
