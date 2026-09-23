/**
 * The playground helpers every build needs (ids, review segments), apart from the retired `p<n>-*` course
 * definitions in `./playgrounds`: the registry (`../index`) re-exports these, and importing them must not pull
 * the retired set into the shipped bundle (`./eager`).
 */
import type { TrackDef, TrackMeta } from '../../core/types';

/** Playground ids: `p1-` ... `p9-` (the retired set) and `p-<zone>` (the ROCKHOP zone playgrounds, `src/tracks/rockhop`). */
export const PLAYGROUND_ID_PREFIX = /^p\d?-/;
export function isPlaygroundTrackId(id: string): boolean {
  return PLAYGROUND_ID_PREFIX.test(id);
}

/** A review segment: `[from, to)` m of course and what it shows. Six per playground. */
export interface TrackSegment {
  from: number;
  to: number;
  label: string;
}
export type PlaygroundMeta = TrackMeta & { playground?: true; segments?: TrackSegment[] };

export function segmentsOf(def: TrackDef): TrackSegment[] {
  return ((def.meta as PlaygroundMeta | undefined)?.segments ?? []).map((s) => ({ ...s }));
}

