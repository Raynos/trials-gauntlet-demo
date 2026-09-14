/**
 * Installs `window.__trials`, the headless test hook. Everything is
 * synchronous so a Playwright `page.evaluate` can drive thousands of ticks in
 * one round trip.
 */
import type { InputFrame, PhysicsSnapshot, TrialsHook } from '../core/types';
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
    // CONTRACT.md §2.9 — minimal scaffold semantics; core-game replaces these
    // with the real run clock / fault counter / phase machine.
    snapshot: () => encodeSnapshot(game.snapshot()),
    restore: (b64: string) => game.restore(decodeSnapshot(b64)),
    drainEvents: () => game.drainEvents(),
    runTime: () => game.runTime(),
    faults: () => game.faults(),
    phase: () => game.phase(),
    marks: () => {
      const t = game.currentTrack;
      return t
        ? { checkpoints: t.checkpoints.map((c) => c.x), finishX: t.finishX, start: t.start.pos.x }
        : { checkpoints: [], finishX: 0, start: 0 };
    },
    camera: () => game.camera(),
    setQuality: (t) => game.setQuality(t),
    skipCountdown: () => game.skipCountdown(),
  };
  window.__trials = hook;
  return hook;
}

export function encodeSnapshot(s: PhysicsSnapshot): string {
  const f = new Uint8Array(s.f64.buffer, s.f64.byteOffset, s.f64.byteLength);
  const head = new Uint32Array([s.v, f.byteLength, s.u8.byteLength]);
  const hb = new Uint8Array(head.buffer);
  const out = new Uint8Array(hb.length + f.length + s.u8.length);
  out.set(hb, 0);
  out.set(f, hb.length);
  out.set(s.u8, hb.length + f.length);
  let bin = '';
  for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode(...out.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function decodeSnapshot(b64: string): PhysicsSnapshot {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const head = new Uint32Array(bytes.buffer, 0, 3);
  const fLen = head[1]!;
  const uLen = head[2]!;
  const f64 = new Float64Array(bytes.buffer.slice(12, 12 + fLen));
  const u8 = bytes.slice(12 + fLen, 12 + fLen + uLen);
  return { v: 1, f64, u8 };
}
