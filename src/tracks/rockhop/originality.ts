/**
 * Bar 2 (docs/plans/STORE_RELEASE.md): no retired layout ships. A track's layout is measured as its SILHOUETTE —
 * the top of every rideable surface along x (ground, ramps, boxes, planks, drums, pole caps, see-saw boards at
 * rest, pit floors), exactly what a player reads off the screen and what a re-skin would keep — and two tracks
 * are compared by the normalised cross-correlation of their silhouettes, maximised over lags. Two views, the
 * score is the larger:
 *
 *  - `metric`: both silhouettes sampled every `STEP` m from the start line to the finish; every lag at which the
 *    overlap covers >= `MIN_OVERLAP` of the LONGER course (a re-skin keeps most of a layout, not one 60 m stretch
 *    of it: against the shorter course, any 60 m of ramp-and-box somewhere in a 450 m track "matches" a 100 m lab);
 *    Pearson r over the overlap. Courses whose lengths differ by more than that have no metric lag (r = -1) and
 *    are judged on the stretched view alone.
 *  - `stretched`: both resampled to `N` points start -> finish (a copy stretched or squeezed along x lines up),
 *    lags of up to +-`MAX_LAG_FRAC` of the course; Pearson r over the overlap.
 *
 * r is taken as signed (an inverted layout is a different layout). Pure and deterministic; used by
 * `scripts/track-originality.mjs` (the committed evidence) and by the rockhop test (the gate: every new track
 * < `ORIGINALITY_LIMIT` against every retired track).
 */
import type { CompiledTrack, Vec2 } from '../../core/types';

export const ORIGINALITY_LIMIT = 0.6;
export const STEP = 0.5;
export const MIN_OVERLAP = 0.6;
export const N = 512;
export const MAX_LAG_FRAC = 0.2;

/** Top-surface height at every STEP m over [0, finishX]. */
export function silhouette(track: CompiledTrack, step = STEP): Float64Array {
  const x0 = 0;
  const x1 = track.def.finishX;
  const n = Math.floor((x1 - x0) / step) + 1;
  const top = new Float64Array(n).fill(-Infinity);
  const raise = (i: number, y: number): void => {
    if (i >= 0 && i < n && y > top[i]!) top[i] = y;
  };
  const seg = (a: Vec2, b: Vec2): void => {
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    if (hi - lo < 1e-9) return;
    const i0 = Math.max(0, Math.ceil((lo - x0) / step - 1e-9));
    const i1 = Math.min(n - 1, Math.floor((hi - x0) / step + 1e-9));
    for (let i = i0; i <= i1; i++) {
      const x = x0 + i * step;
      raise(i, a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x));
    }
  };
  for (const c of track.colliders) {
    if (c.kind === 'polyline') {
      for (let k = 0; k + 1 < c.points.length; k++) seg(c.points[k]!, c.points[k + 1]!);
    } else if (c.kind === 'circle') {
      const i0 = Math.max(0, Math.ceil((c.center.x - c.radius - x0) / step));
      const i1 = Math.min(n - 1, Math.floor((c.center.x + c.radius - x0) / step));
      for (let i = i0; i <= i1; i++) {
        const dx = x0 + i * step - c.center.x;
        raise(i, c.center.y + Math.sqrt(Math.max(0, c.radius * c.radius - dx * dx)));
      }
    } else if (c.kind === 'box') {
      const hx = Math.abs(c.halfW * Math.cos(c.angle)) + Math.abs(c.halfH * Math.sin(c.angle));
      const hy = Math.abs(c.halfW * Math.sin(c.angle)) + Math.abs(c.halfH * Math.cos(c.angle));
      const i0 = Math.max(0, Math.ceil((c.center.x - hx - x0) / step));
      const i1 = Math.min(n - 1, Math.floor((c.center.x + hx - x0) / step));
      for (let i = i0; i <= i1; i++) raise(i, c.center.y + hy);
    } else {
      // see-saw at rest: tipped toward the rider (near end down) by maxAngle
      const cx = Math.cos(c.maxAngle) * c.halfLength;
      const cy = Math.sin(c.maxAngle) * c.halfLength;
      seg({ x: c.pivot.x - cx, y: c.pivot.y - cy + c.thickness / 2 }, { x: c.pivot.x + cx, y: c.pivot.y + cy + c.thickness / 2 });
    }
  }
  // holes (nothing solid under x): carry the last known height (a gap's pit floor is part of the ground chain)
  let last = 0;
  for (let i = 0; i < n; i++) {
    if (top[i] === -Infinity) top[i] = last;
    last = top[i]!;
  }
  return top;
}

/** Linear resample of `a` to `m` points (end to end). */
export function resample(a: Float64Array, m = N): Float64Array {
  const out = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    const t = (i * (a.length - 1)) / (m - 1);
    const k = Math.floor(t);
    const f = t - k;
    out[i] = k + 1 < a.length ? a[k]! * (1 - f) + a[k + 1]! * f : a[a.length - 1]!;
  }
  return out;
}

/** Pearson r of a[ia .. ia+len) against b[ib .. ib+len); 0 when either window is flat. */
function pearson(a: Float64Array, ia: number, b: Float64Array, ib: number, len: number): number {
  let sa = 0;
  let sb = 0;
  for (let k = 0; k < len; k++) {
    sa += a[ia + k]!;
    sb += b[ib + k]!;
  }
  const ma = sa / len;
  const mb = sb / len;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let k = 0; k < len; k++) {
    const u = a[ia + k]! - ma;
    const v = b[ib + k]! - mb;
    num += u * v;
    da += u * u;
    db += v * v;
  }
  if (da < 1e-9 || db < 1e-9) return 0;
  return num / Math.sqrt(da * db);
}

export interface Correlation {
  r: number;
  /** Lag in samples of b relative to a at the maximum (positive = b's feature sits later). */
  lag: number;
  overlap: number;
}

/** max over lags of Pearson r, the overlap at least `minOverlap` x the longer series and `maxLag` samples at most. */
export function maxCorrelation(a: Float64Array, b: Float64Array, minOverlap = MIN_OVERLAP, maxLag = Infinity): Correlation {
  const shorter = Math.min(a.length, b.length);
  const minLen = Math.max(8, Math.ceil(Math.max(a.length, b.length) * minOverlap));
  let best: Correlation = { r: -1, lag: 0, overlap: 0 };
  // lag L: a[i] pairs with b[i - L]
  for (let L = -(b.length - minLen); L <= a.length - minLen; L++) {
    if (Math.abs(L) > maxLag) continue;
    const ia = Math.max(0, L);
    const ib = Math.max(0, -L);
    const len = Math.min(a.length - ia, b.length - ib);
    if (len < minLen) continue;
    const r = pearson(a, ia, b, ib, len);
    if (r > best.r) best = { r, lag: -L, overlap: len / shorter };
  }
  return best;
}

export interface Originality {
  metric: Correlation;
  stretched: Correlation;
  /** max(metric.r, stretched.r) */
  score: number;
}

/** The bar-2 score of track `a` against track `b`. */
export function originality(a: CompiledTrack, b: CompiledTrack): Originality {
  const sa = silhouette(a);
  const sb = silhouette(b);
  const metric = maxCorrelation(sa, sb);
  const stretched = maxCorrelation(resample(sa), resample(sb), 1 - MAX_LAG_FRAC, Math.round(N * MAX_LAG_FRAC));
  return { metric, stretched, score: Math.max(metric.r, stretched.r) };
}
