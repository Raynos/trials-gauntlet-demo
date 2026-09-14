/**
 * Human-readable course summary so the parent (and the stranger REPL's `look`)
 * can read a track obstacle by obstacle without rendering it.
 */
import type { CompiledTrack } from '../core/types';
import { setPiecesOf } from './author';
import { SUMMARY_KEYS, type TrackKind } from './kinds';

function fmt(v: number | string | boolean): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
  return String(v);
}

/** One line per obstacle: `#i kind @x key=value ...`. */
export function describeObstacles(track: CompiledTrack): string[] {
  return track.placed.map((o, i) => {
    const keys = SUMMARY_KEYS[o.kind as TrackKind] ?? [];
    const parts = keys.map((k) => `${k}=${fmt(o.params[k] as number | string | boolean)}`);
    const decor = o.colliderIds.length === 0 ? ' (decor)' : '';
    return `#${String(i).padStart(2, ' ')} ${o.kind.padEnd(7)} @${o.pos.x.toFixed(1).padStart(6)} y=${fmt(o.pos.y).padEnd(5)} ${parts.join(' ')}${decor}`;
  });
}

/** Full summary: header, checkpoints, obstacles, footer. */
export function describeTrack(track: CompiledTrack): string {
  const d = track.def;
  const m = d.meta;
  const lines: string[] = [];
  lines.push(`${d.id}  "${d.name}"  tier=${d.tier}  length=${d.finishX.toFixed(0)} m  obstacles=${d.obstacles.length}  colliders=${track.colliders.length}  hazards=${track.hazards.length}`);
  if (m) {
    lines.push(`  biome=${m.biome}  technique="${m.technique}"${m.demands ? `  demands="${m.demands}"` : ''}`);
    lines.push(`  attemptsBand=${m.attemptsBand ? `${m.attemptsBand[0]}-${m.attemptsBand[1]}` : '-'}  targetTimeS=${m.targetTimeS ?? '-'}  cameraKeys=${m.camera?.length ?? 0}  hints=${m.hints?.length ?? 0}`);
  }
  lines.push(`  checkpoints: ${d.checkpoints.map((c) => c.x.toFixed(0)).join(', ')}  finishX=${d.finishX}  bounds=[${track.bounds.minX},${track.bounds.maxX}]x[${track.bounds.minY},${track.bounds.maxY}]  oobY=${track.oobY}`);
  const sps = setPiecesOf(d);
  if (sps.length > 0) lines.push(`  setPieces: ${sps.map((s) => `${s.kind}${s.label ? `"${s.label}"` : ''}[${s.x0.toFixed(0)}-${s.x1.toFixed(0)}]`).join(', ')}`);
  lines.push(...describeObstacles(track).map((l) => `  ${l}`));
  lines.push(`  hash=${track.hash}`);
  return lines.join('\n');
}

/** What lies in the next `range` metres after x (for the stranger's `look`). */
export function describeAhead(track: CompiledTrack, x: number, range = 25): string {
  const ahead = track.placed
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => o.pos.x >= x && o.pos.x < x + range)
    .map(({ o }) => {
      const keys = SUMMARY_KEYS[o.kind as TrackKind] ?? [];
      const parts = keys.slice(0, 2).map((k) => fmt(o.params[k] as number | string | boolean));
      return `${o.kind} ${parts.join('x')} in ${(o.pos.x - x).toFixed(1)} m`;
    });
  const cps = track.def.checkpoints.filter((c) => c.x >= x && c.x < x + range).map((c) => `checkpoint in ${(c.x - x).toFixed(1)} m`);
  const fin = track.def.finishX >= x && track.def.finishX < x + range ? [`finish in ${(track.def.finishX - x).toFixed(1)} m`] : [];
  const all = [...ahead, ...cps, ...fin];
  return all.length ? all.join(', ') : `flat for ${range} m`;
}
