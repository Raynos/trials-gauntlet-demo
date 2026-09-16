/**
 * Set-piece plan (render round 15, tracks.md §7.3): what the world kits read from a track's
 * authored metadata — `setPiecesOf(def)` (`tunnel` / `drop` / `fire` / `balance` beats), the
 * `arch` / `tunnel` decor entries (`isDecorKind`, `params.style`) and, for the playgrounds
 * (`p<n>-*`), one set-piece slot per review segment so every model of the biome lands in one
 * course instead of the single 45 %-span pick. A pure function of the compiled track: nothing
 * here draws, and nothing reads a clock or `Math.random`.
 */
import type { CompiledTrack } from '../../core/types';
import { isDecorKind, isPlaygroundTrackId, resolveParams, segmentsOf, setPiecesOf, type SetPiece } from '../../tracks';

export type TunnelStyle = 'scaffold' | 'concrete' | 'pipe' | 'ice' | 'foundry';
export type ArchStyle = 'start' | 'finish' | 'checkpoint' | 'crowd' | 'girder' | 'pipe' | 'ice';

export interface TunnelPlan {
  x0: number;
  x1: number;
  /** Roof underside above the deck. */
  height: number;
  /** Along z, centred on the ride line. */
  depth: number;
  style: TunnelStyle;
  lit: boolean;
}
export interface ArchPlan {
  x: number;
  span: number;
  height: number;
  depth: number;
  style: ArchStyle;
}

export interface Beat {
  x: number;
  x1: number;
  label: string | undefined;
}

export interface SetPiecePlan {
  /** `p<n>-*`: every set piece of the biome, one per free review segment. */
  playground: boolean;
  /** `tunnel` decor entries (a `tunnel` set piece without one draws nothing). */
  tunnels: TunnelPlan[];
  /** `arch` decor entries minus `start` / `finish` (the gates already draw there). */
  arches: ArchPlan[];
  /** Authored beats by kind; `x` is where the kit anchors the dressing. */
  drops: Beat[];
  fires: Beat[];
  balances: Beat[];
  /**
   * Set-piece slots: for a playground one x per review segment that is clear of the gate
   * keep-outs, the tunnels, the authored beats and the arches, in segment order (`assignSlots`
   * spreads a kit's models over them); empty for every other course (they keep their single
   * id-gated pick).
   */
  slots: number[];
  /** True when `[x − half, x + half]` overlaps a tunnel, a drop / fire / balance beat or a decor arch (± 6 m). */
  blocked(x: number, half?: number): boolean;
}

const mid = (p: SetPiece): number => (p.x0 + p.x1) / 2;

/**
 * Reads the plan. `keepOut(x, half)` is the gate keep-out (`foregroundKeepOut(track)`), shared
 * with the kits so a slot never lands on a spawn.
 */
export function planSetPieces(track: CompiledTrack, keepOut: (x: number, half?: number) => boolean): SetPiecePlan {
  const def = track.def;
  const playground = isPlaygroundTrackId(def.id);
  const tunnels: TunnelPlan[] = [];
  const arches: ArchPlan[] = [];
  for (const p of track.placed) {
    if (!isDecorKind(p.kind)) continue;
    if (p.kind === 'tunnel') {
      const t = resolveParams('tunnel', p.params);
      tunnels.push({ x0: p.pos.x, x1: p.pos.x + t.length, height: t.height, depth: t.depth, style: t.style, lit: t.lit });
    } else {
      const a = resolveParams('arch', p.params);
      if (a.style === 'start' || a.style === 'finish') continue;
      arches.push({ x: p.pos.x, span: a.span, height: a.height, depth: a.depth, style: a.style });
    }
  }
  const pieces = setPiecesOf(def);
  const beat = (kind: SetPiece['kind'], anchor: (p: SetPiece) => number): Beat[] =>
    pieces.filter((p) => p.kind === kind).map((p) => ({ x: anchor(p), x1: p.x1, label: p.label }));
  const drops = beat('drop', (p) => p.x0);
  const fires = beat('fire', mid);
  const balances = beat('balance', mid);
  const ranges: [number, number][] = [
    ...tunnels.map((t): [number, number] => [t.x0 - 6, t.x1 + 6]),
    ...arches.map((a): [number, number] => [a.x - 6, a.x + 6]),
    ...pieces.filter((p) => p.kind === 'drop' || p.kind === 'fire' || p.kind === 'balance').map((p): [number, number] => [p.x0 - 6, p.x1 + 6]),
  ];
  const blocked = (x: number, half = 0): boolean => ranges.some(([a, b]) => x + half > a && x - half < b);

  const slots: number[] = [];
  if (playground) {
    // One slot per review segment: the midpoint, else the nearest clear x inside the segment's
    // inner 8 m margins in 4 m steps. A segment with no clear x (the tunnel segment) is skipped.
    for (const s of segmentsOf(def)) {
      const lo = s.from + 8;
      const hi = s.to - 8;
      if (hi <= lo) continue;
      const c = (s.from + s.to) / 2;
      let found: number | null = null;
      for (let d = 0; d <= (hi - lo) / 2 + 1e-6 && found === null; d += 4) {
        for (const x of d === 0 ? [c] : [c - d, c + d]) {
          if (x < lo || x > hi) continue;
          if (keepOut(x, 8) || blocked(x, 8)) continue;
          found = x;
          break;
        }
      }
      if (found !== null) slots.push(found);
    }
  }
  return { playground, tunnels, arches, drops, fires, balances, slots, blocked };
}

/**
 * Spreads `n` models over the plan's slots: a model with a hint x takes the nearest unused
 * slot; the rest take the remaining slots evenly (one model → the middle slot). Fewer slots
 * than models → the tail shares the last slot (never happens on the shipped playgrounds:
 * 4–6 slots, ≤ 4 models). Returns one x per model.
 */
export function assignSlots(slots: readonly number[], hints: readonly (number | null)[]): number[] {
  const n = hints.length;
  if (!slots.length || !n) return [];
  const used = new Set<number>();
  const out: number[] = new Array<number>(n).fill(NaN);
  hints.forEach((h, i) => {
    if (h === null) return;
    let best = -1;
    for (let k = 0; k < slots.length; k++) if (!used.has(k) && (best < 0 || Math.abs(slots[k]! - h) < Math.abs(slots[best]! - h))) best = k;
    if (best >= 0) {
      used.add(best);
      out[i] = slots[best]!;
    }
  });
  const free = slots.map((x, k) => (used.has(k) ? null : x)).filter((x): x is number => x !== null);
  const rest = out.map((x, i) => (Number.isNaN(x) ? i : -1)).filter((i) => i >= 0);
  rest.forEach((i, j) => {
    const k = free.length ? Math.min(free.length - 1, Math.round(((j + 0.5) * free.length) / rest.length - 0.5)) : -1;
    out[i] = k >= 0 ? free[k]! : slots[slots.length - 1]!;
  });
  return out;
}
