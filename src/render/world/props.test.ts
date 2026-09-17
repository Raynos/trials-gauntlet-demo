import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { signBoardGeometry, tarpGeometry, triCount } from './props';

/** Ask 61: the hall's tarp is a hung sheet, not a flat plane — the checks a placeholder quad would fail. */
describe('tarpGeometry', () => {
  const w = 3;
  const h = 2.4;
  const g = tarpGeometry(w, h, 42);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const at = (pred: (u: number, v: number) => boolean): number[] => {
    const out: number[] = [];
    for (let i = 0; i < p.count; i++) if (pred(uv.getX(i), uv.getY(i))) out.push(i);
    return out;
  };

  it('hangs from its two top corners at the origin height, the top edge sagging between them', () => {
    const corners = at((u, v) => v > 0.999 && (u < 0.001 || u > 0.999));
    expect(corners).toHaveLength(2);
    for (const i of corners) {
      expect(p.getY(i)).toBeCloseTo(0, 6);
      expect(Math.abs(p.getX(i))).toBeCloseTo(w / 2, 6);
      expect(p.getZ(i)).toBeCloseTo(0, 6);
    }
    const topMid = at((u, v) => v > 0.999 && Math.abs(u - 0.5) < 0.001);
    expect(topMid).toHaveLength(1);
    const sag = -p.getY(topMid[0]!);
    expect(sag).toBeGreaterThan(0.15);
    expect(sag).toBeLessThan(0.35);
  });

  it('is not flat: the free hem hangs in folds, the tied edge does not', () => {
    const hem = at((_u, v) => v < 0.001).map((i) => p.getZ(i));
    const top = at((_u, v) => v > 0.999).map((i) => p.getZ(i));
    const spread = (zs: number[]): number => Math.max(...zs) - Math.min(...zs);
    expect(spread(hem)).toBeGreaterThan(0.12);
    expect(spread(top)).toBeLessThan(0.02);
    // Every hem vertex stays within a hand's width of the sheet plane (it drapes; it does not balloon).
    for (const z of hem) expect(Math.abs(z)).toBeLessThan(0.2);
  });

  it('carries fold / hem shading in the vertex colour and real normals', () => {
    const c = g.getAttribute('color') as THREE.BufferAttribute;
    expect(c.itemSize).toBe(3);
    let lo = 1;
    let hi = 0;
    for (let i = 0; i < c.count; i++) {
      lo = Math.min(lo, c.getX(i));
      hi = Math.max(hi, c.getX(i));
    }
    expect(lo).toBeGreaterThan(0.6);
    expect(hi).toBeLessThanOrEqual(1);
    expect(hi - lo).toBeGreaterThan(0.15);
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    let tilted = 0;
    for (let i = 0; i < n.count; i++) if (Math.abs(n.getZ(i)) < 0.995) tilted++;
    expect(tilted).toBeGreaterThan(n.count / 3);
  });

  it('costs 320 triangles and is deterministic per seed', () => {
    expect(triCount(g)).toBe(320);
    const again = tarpGeometry(w, h, 42).getAttribute('position') as THREE.BufferAttribute;
    const other = tarpGeometry(w, h, 43).getAttribute('position') as THREE.BufferAttribute;
    let same = true;
    let differs = false;
    for (let i = 0; i < p.count; i++) {
      if (again.getZ(i) !== p.getZ(i)) same = false;
      if (other.getZ(i) !== p.getZ(i)) differs = true;
    }
    expect(same).toBe(true);
    expect(differs).toBe(true);
  });
});

/** Ask 61 follow-up: the hall sign is a printed board on posts, 1.55–2.55 m up, front-faced, 2 tris. */
describe('signBoardGeometry', () => {
  const g = signBoardGeometry();
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  it('is a 1.6 × 1.0 front-facing board with its foot at post height', () => {
    expect(triCount(g)).toBe(2);
    let minY = Infinity;
    let maxY = -Infinity;
    let maxX = 0;
    for (let i = 0; i < p.count; i++) {
      minY = Math.min(minY, p.getY(i));
      maxY = Math.max(maxY, p.getY(i));
      maxX = Math.max(maxX, Math.abs(p.getX(i)));
      expect(p.getZ(i)).toBe(0);
    }
    expect(minY).toBeCloseTo(1.55, 6);
    expect(maxY).toBeCloseTo(2.55, 6);
    expect(maxX).toBeCloseTo(0.8, 6);
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < n.count; i++) expect(n.getZ(i)).toBe(1);
  });
  it('carries a vertex-colour AO toward the posts', () => {
    const c = g.getAttribute('color') as THREE.BufferAttribute;
    expect(c.count).toBe(p.count);
    for (let i = 0; i < c.count; i++) {
      expect(c.getX(i)).toBeGreaterThanOrEqual(0.86);
      expect(c.getX(i)).toBeLessThanOrEqual(1);
    }
  });
});
