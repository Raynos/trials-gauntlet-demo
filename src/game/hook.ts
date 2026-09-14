/**
 * Installs `window.__trials`, the headless test hook. Everything is
 * synchronous so a Playwright `page.evaluate` can drive thousands of ticks in
 * one round trip.
 */
import type { InputFrame, TrialsHook } from '../core/types';
import { listTrackIds } from '../tracks';
import type { Game } from './game';

export const GAME_VERSION = '0.1.0-scaffold';

export function installHook(game: Game, harness: boolean): TrialsHook {
  const hook: TrialsHook = {
    ready: true,
    info: () => ({
      version: GAME_VERSION,
      physicsHz: game.physicsHz,
      trackId: game.currentTrack?.id ?? '',
      seed: game.currentSeed,
      harness,
    }),
    step: (n = 1) => game.step(n),
    setInput: (frame: Partial<InputFrame>) => game.setInput(frame),
    getState: () => game.getState(),
    loadTrack: (id: string, seed?: number) => game.loadTrack(id, seed),
    restart: () => game.restart(),
    finishTime: () => game.finishTime(),
    hashState: () => game.hashState(),
    frame: () => game.getState().tick,
    renderedFrames: () => game.framesRendered,
    render: (sync = false) => game.renderOnce(sync),
    stats: () => game.stats(),
    resize: (w: number, h: number) => game.resize(w, h, 1),
    runRecording: (json: string) => game.runRecording(json),
    startRecording: () => game.startRecording(),
    stopRecording: () => game.stopRecording(),
    listTracks: () => listTrackIds(),
  };
  window.__trials = hook;
  return hook;
}
