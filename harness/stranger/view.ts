/**
 * Compact ASCII side-view of the next ~40 m of track, built from the compiled
 * colliders. This is what the stranger "sees" instead of a contact sheet.
 *
 *   _ / \   ground and ramps (polylines, by slope)     #  boxes
 *   o       drums / circles                            ~  seesaw plank
 *   x       hazard zone                                |  checkpoint
 *   F       finish line                                B  the bike
 */
import type { CompiledTrack, PhysicsState, Vec2 } from '../../src/core/types';

export const VIEW_COLS = 80;
export const VIEW_ROWS = 16;
export const VIEW_METERS = 40;
export const VIEW_BEHIND = 5;

export function asciiView(compiled: CompiledTrack, st: PhysicsState, cols = VIEW_COLS, rows = VIEW_ROWS): string {
  const bx = st.bike.pos.x;
  const by = st.bike.pos.y;
  const x0 = bx - VIEW_BEHIND;
  const x1 = x0 + VIEW_METERS;
  const cellW = VIEW_METERS / cols;

  // Vertical range: everything solid in view, plus the bike, padded.
  let yMin = by;
  let yMax = by;
  const seen = (p: Vec2): void => {
    if (p.x < x0 - 2 || p.x > x1 + 2) return;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  };
  for (const c of compiled.colliders) {
    if (c.kind === 'polyline') {
      for (let i = 0; i + 1 < c.points.length; i++) {
        const a = c.points[i]!;
        const b = c.points[i + 1]!;
        // Clip long segments so a 200 m flat line does not blow the range.
        for (const t of [0, 0.5, 1]) {
          const x = a.x + (b.x - a.x) * t;
          if (x >= x0 - 2 && x <= x1 + 2) seen({ x, y: a.y + (b.y - a.y) * t });
        }
        seen(clampSegX(a, b, x0));
        seen(clampSegX(a, b, x1));
      }
    } else if (c.kind === 'circle') {
      seen({ x: c.center.x, y: c.center.y - c.radius });
      seen({ x: c.center.x, y: c.center.y + c.radius });
    } else if (c.kind === 'box') {
      const r = Math.hypot(c.halfW, c.halfH);
      seen({ x: c.center.x, y: c.center.y - r });
      seen({ x: c.center.x, y: c.center.y + r });
    } else {
      seen({ x: c.pivot.x, y: c.pivot.y - c.thickness });
      seen({ x: c.pivot.x, y: c.pivot.y + c.halfLength * Math.sin(c.maxAngle) + c.thickness });
    }
  }
  yMin -= 1;
  yMax = Math.max(yMax + 1.5, yMin + 8);
  const cellH = (yMax - yMin) / rows;

  const grid: string[][] = Array.from({ length: rows }, () => new Array<string>(cols).fill(' '));
  const put = (x: number, y: number, ch: string, overwrite = true): void => {
    const col = Math.floor((x - x0) / cellW);
    const row = rows - 1 - Math.floor((y - yMin) / cellH);
    if (col < 0 || col >= cols || row < 0 || row >= rows) return;
    if (!overwrite && grid[row]![col] !== ' ') return;
    grid[row]![col] = ch;
  };
  const line = (a: Vec2, b: Vec2, ch: string): void => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / (cellW * 0.5)));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      put(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, ch);
    }
  };

  // Hazards first (solid geometry draws over them).
  for (const h of compiled.hazards) {
    for (let x = Math.max(h.min.x, x0); x <= Math.min(h.max.x, x1); x += cellW) {
      for (let y = h.min.y; y <= h.max.y; y += cellH) put(x, y, 'x');
    }
  }

  for (const c of compiled.colliders) {
    if (c.kind === 'polyline') {
      for (let i = 0; i + 1 < c.points.length; i++) {
        const a = c.points[i]!;
        const b = c.points[i + 1]!;
        if (Math.max(a.x, b.x) < x0 || Math.min(a.x, b.x) > x1) continue;
        const slope = (b.y - a.y) / Math.max(1e-6, Math.abs(b.x - a.x));
        const ch = Math.abs(b.x - a.x) < 1e-6 ? '|' : slope > 0.15 ? '/' : slope < -0.15 ? '\\' : '_';
        line(clampSegX(a, b, Math.max(x0, Math.min(a.x, b.x))), clampSegX(a, b, Math.min(x1, Math.max(a.x, b.x))), ch);
      }
    } else if (c.kind === 'circle') {
      const n = Math.max(8, Math.ceil((2 * Math.PI * c.radius) / cellW));
      for (let i = 0; i < n; i++) {
        const t = (i / n) * 2 * Math.PI;
        put(c.center.x + Math.cos(t) * c.radius, c.center.y + Math.sin(t) * c.radius, 'o');
      }
    } else if (c.kind === 'box') {
      const ca = Math.cos(c.angle);
      const sa = Math.sin(c.angle);
      for (let u = -c.halfW; u <= c.halfW; u += cellW * 0.5) {
        for (let v = -c.halfH; v <= c.halfH; v += cellH * 0.5) {
          put(c.center.x + u * ca - v * sa, c.center.y + u * sa + v * ca, '#');
        }
      }
    } else {
      const angle = st.seesaws.find((s) => s.id === c.id)?.angle ?? 0;
      const dx = Math.cos(angle) * c.halfLength;
      const dy = Math.sin(angle) * c.halfLength;
      line({ x: c.pivot.x - dx, y: c.pivot.y - dy }, { x: c.pivot.x + dx, y: c.pivot.y + dy }, '~');
      put(c.pivot.x, c.pivot.y - c.thickness, '^');
    }
  }

  // Checkpoints and finish: vertical markers where nothing solid is drawn.
  const def = compiled.def;
  for (const cp of def.checkpoints) {
    if (cp.x < x0 || cp.x > x1) continue;
    for (let r = 0; r < rows; r++) {
      const col = Math.floor((cp.x - x0) / cellW);
      if (col >= 0 && col < cols && grid[r]![col] === ' ') grid[r]![col] = '|';
    }
  }
  if (def.finishX >= x0 && def.finishX <= x1) {
    const col = Math.floor((def.finishX - x0) / cellW);
    for (let r = 0; r < rows; r++) if (col >= 0 && col < cols && grid[r]![col] === ' ') grid[r]![col] = 'F';
  }

  put(bx, by, 'B');

  // Ruler: x every 10 m.
  const ruler = new Array<string>(cols).fill(' ');
  for (let x = Math.ceil(x0 / 10) * 10; x <= x1; x += 10) {
    const col = Math.floor((x - x0) / cellW);
    const label = String(x);
    for (let i = 0; i < label.length && col + i < cols; i++) if (col + i >= 0) ruler[col + i] = label[i]!;
  }

  const legend = `view x ${x0.toFixed(0)}..${x1.toFixed(0)} m, y ${yMin.toFixed(1)}..${yMax.toFixed(1)} m  (B bike, | checkpoint, F finish, _/\\ ground, # box, o drum, ~ seesaw, x hazard)`;
  return [legend, ...grid.map((r) => r.join('').replace(/\s+$/, '')), ruler.join('').replace(/\s+$/, '')].join('\n');
}

function clampSegX(a: Vec2, b: Vec2, x: number): Vec2 {
  const lo = Math.min(a.x, b.x);
  const hi = Math.max(a.x, b.x);
  const cx = Math.max(lo, Math.min(hi, x));
  if (hi - lo < 1e-9) return { x: cx, y: a.y };
  const t = (cx - a.x) / (b.x - a.x);
  return { x: cx, y: a.y + (b.y - a.y) * t };
}
