/**
 * Boot routing (docs/design/game.md §10): which front-end the page opens on.
 * Pure so it is unit-tested: `?harness=1` never sees the title/menu (the whole
 * evidence harness drives the game through `window.__trials` and expects a
 * track to be loaded), `?track=<id>` skips straight into that track, anything
 * else opens the title screen. `?dev=1` unlocks every tier and shows the test
 * strips in track select.
 */
export interface BootRoute {
  /** `harness`: no App shell at all, hook only. `run`: App, straight into `track`. `front`: title screen. */
  mode: 'harness' | 'run' | 'front';
  track: string | null;
  dev: boolean;
  /** Track used as the title / menu backdrop. */
  backdrop: string;
}

export const BACKDROP_TRACK = 'b1-first-ride';

export function resolveBoot(params: URLSearchParams, hasTrack: (id: string) => boolean = () => true): BootRoute {
  const dev = params.get('dev') === '1';
  const track = params.get('track');
  if (params.get('harness') === '1') return { mode: 'harness', track: track ?? null, dev, backdrop: BACKDROP_TRACK };
  if (track && hasTrack(track)) return { mode: 'run', track, dev, backdrop: BACKDROP_TRACK };
  return { mode: 'front', track: null, dev, backdrop: BACKDROP_TRACK };
}
