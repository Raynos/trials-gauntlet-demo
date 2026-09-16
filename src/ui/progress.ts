/**
 * Tier progression: a tier is open when the previous tier holds a medal on
 * every authored track (harness `*-test` strips do not count). `?dev=1`
 * unlocks everything. Pure functions so the lock rule is unit-tested.
 */
import type { Medal, TrackDef, TrackTier } from '../core/types';
import { isPlaygroundTrackId } from '../tracks';

export const TIER_ORDER: readonly TrackTier[] = ['beginner', 'easy', 'medium', 'hard', 'extreme'];
export const TIER_LABEL: Record<TrackTier, string> = { beginner: 'Beginner', easy: 'Easy', medium: 'Medium', hard: 'Hard', extreme: 'Extreme' };
export const TIER_BLURB: Record<TrackTier, string> = {
  beginner: 'Gas, brake, lean. Learn the bike.',
  easy: 'Weight on the pegs — climbs, drops, stairs.',
  medium: 'Hops, drums and balance.',
  hard: 'Wheelies on wire, gap chains, fire.',
  extreme: 'Everything at once. Bring restarts.',
};

export type MedalOf = (trackId: string) => Medal | null;

/** Lab tracks (`lab-*`, src/tracks `isLabTrackId`): listed last under "Lab", outside progression, medals and the career line. */
export function isLabTrack(t: TrackDef): boolean {
  return t.id.startsWith('lab-');
}

export function labTracks(tracks: readonly TrackDef[]): TrackDef[] {
  return tracks.filter(isLabTrack);
}

/** Playground courses (`p<n>-*`, tracks round 10): one beginner course per biome, always open, outside medals and progression. */
export function isPlaygroundTrack(t: TrackDef): boolean {
  return isPlaygroundTrackId(t.id);
}

export function playgroundTracks(tracks: readonly TrackDef[]): TrackDef[] {
  return tracks.filter(isPlaygroundTrack);
}

/** Authored tracks only (no lab tracks, no playgrounds), tier order, stable within a tier. */
export function shipTracks(tracks: readonly TrackDef[], includeTest = false): TrackDef[] {
  return tracks
    .filter((t) => !isLabTrack(t) && !isPlaygroundTrack(t) && (includeTest || !t.id.endsWith('-test')))
    .slice()
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || Number(a.id.endsWith('-test')) - Number(b.id.endsWith('-test')));
}

export function tracksInTier(tracks: readonly TrackDef[], tier: TrackTier): TrackDef[] {
  return tracks.filter((t) => t.tier === tier);
}

/** True when every (authored) track of `tier` has a medal. An empty tier counts as complete. */
export function tierComplete(tracks: readonly TrackDef[], tier: TrackTier, medalOf: MedalOf): boolean {
  return tracksInTier(tracks, tier)
    .filter((t) => !t.id.endsWith('-test'))
    .every((t) => medalOf(t.id) !== null);
}

export function tierUnlocked(tracks: readonly TrackDef[], tier: TrackTier, medalOf: MedalOf, devUnlock = false): boolean {
  if (devUnlock) return true;
  const i = TIER_ORDER.indexOf(tier);
  for (let k = 0; k < i; k++) if (!tierComplete(tracks, TIER_ORDER[k]!, medalOf)) return false;
  return true;
}

/** First unlocked track without a medal, else the last unlocked track (the natural "Play" target). */
export function nextTrack(tracks: readonly TrackDef[], medalOf: MedalOf, devUnlock = false, lastPlayed: string | null = null): TrackDef | null {
  const ship = shipTracks(tracks);
  if (lastPlayed) {
    const lp = ship.find((t) => t.id === lastPlayed);
    if (lp && tierUnlocked(ship, lp.tier, medalOf, devUnlock)) return lp;
  }
  let lastOpen: TrackDef | null = null;
  for (const t of ship) {
    if (!tierUnlocked(ship, t.tier, medalOf, devUnlock)) break;
    lastOpen = t;
    if (medalOf(t.id) === null) return t;
  }
  return lastOpen ?? ship[0] ?? null;
}

export interface MedalTotals {
  platinum: number;
  gold: number;
  silver: number;
  bronze: number;
  cleared: number;
  total: number;
}

export function medalTotals(tracks: readonly TrackDef[], medalOf: MedalOf): MedalTotals {
  const t: MedalTotals = { platinum: 0, gold: 0, silver: 0, bronze: 0, cleared: 0, total: 0 };
  for (const tr of shipTracks(tracks)) {
    t.total++;
    const m = medalOf(tr.id);
    if (m) {
      t.cleared++;
      t[m]++;
    }
  }
  return t;
}
