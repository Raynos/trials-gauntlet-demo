/**
 * Boot routing (docs/design/game.md §10): which front-end the page opens on.
 * Pure so it is unit-tested: `?harness=1` never sees the menu (the whole
 * evidence harness drives the game through `window.__rockhop` and expects a
 * track to be loaded), `?track=<id>` skips straight into that track, anything
 * else opens the main menu (boot lands on it; there is no title step). `?dev=1` unlocks every tier and shows the test
 * strips in track select.
 */
export interface BootRoute {
  /** `harness`: no App shell at all, hook only. `run`: App, straight into `track`. `front`: main menu. */
  mode: 'harness' | 'run' | 'front';
  track: string | null;
  dev: boolean;
  /** Track used as the menu backdrop. */
  backdrop: string;
}

/** The menu / garage / map backdrop: the first ROCKHOP course (the harbour the home art shows). */
export const BACKDROP_TRACK = 'c1-low-tide';

export function resolveBoot(params: URLSearchParams, hasTrack: (id: string) => boolean = () => true): BootRoute {
  const dev = params.get('dev') === '1';
  const track = params.get('track');
  if (params.get('harness') === '1') return { mode: 'harness', track: track ?? null, dev, backdrop: BACKDROP_TRACK };
  if (track && hasTrack(track)) return { mode: 'run', track, dev, backdrop: BACKDROP_TRACK };
  return { mode: 'front', track: null, dev, backdrop: BACKDROP_TRACK };
}
