/**
 * Installs `window.__trials`, the headless test hook (CONTRACT.md §2.9).
 * Everything is synchronous so a Playwright `page.evaluate` can drive
 * thousands of ticks in one round trip.
 */
import type { InputFrame, PhysicsSnapshot, TrialsHook } from '../core/types';
import { listTrackIds } from '../tracks';
import type { Game, GameCounters } from './game';

export const GAME_VERSION = '0.2.0-core';

export interface HookExtras {
  /** Present when the audio module exports an offline renderer. */
  renderOffline?: (recordingJson: string, seconds: number) => Promise<Float32Array>;
  /** Which implementations main.ts composed (reported through info()). */
  modules?: Record<string, string>;
}

export function installHook(game: Game, harness: boolean, extras: HookExtras = {}): TrialsHook {
  const hook: TrialsHook = {
    ready: true,
    info: () => ({
      version: GAME_VERSION,
      physicsHz: game.physicsHz,
      trackId: game.currentTrack?.id ?? '',
      seed: game.currentSeed,
      harness,
      loadTrackMs: Math.round(game.lastLoadMs * 10) / 10,
      ...(extras.modules ? { modules: extras.modules } : {}),
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
    // -- CONTRACT.md §2.9 --
    snapshot: () => encodeSnapshot(game.snapshot(), game.counters()),
    restore: (b64: string) => {
      const { physics, counters } = decodeSnapshot(b64);
      game.restore(physics);
      if (counters) game.restoreCounters(counters);
    },
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
  if (extras.renderOffline) {
    const renderOffline = extras.renderOffline;
    hook.audio = { renderOffline: (json, seconds) => renderOffline(json, seconds) };
  }
  window.__trials = hook;
  return hook;
}

// Snapshot wire format (v2):
//   u32 v=2, u32 physF64Bytes, u32 physU8Bytes, u32 gameJsonBytes,
//   [phys f64 bytes][phys u8 bytes][game counters JSON utf-8]
// v1 (scaffold) had a 3-word header and no game counters; still decodable.

export function encodeSnapshot(s: PhysicsSnapshot, counters?: GameCounters): string {
  const f = new Uint8Array(s.f64.buffer, s.f64.byteOffset, s.f64.byteLength);
  const g = counters ? new TextEncoder().encode(JSON.stringify(counters)) : new Uint8Array(0);
  const head = new Uint32Array([2, f.byteLength, s.u8.byteLength, g.byteLength]);
  const hb = new Uint8Array(head.buffer);
  const out = new Uint8Array(hb.length + f.length + s.u8.length + g.length);
  out.set(hb, 0);
  out.set(f, hb.length);
  out.set(s.u8, hb.length + f.length);
  out.set(g, hb.length + f.length + s.u8.length);
  let bin = '';
  for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode(...out.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function decodeSnapshot(b64: string): { physics: PhysicsSnapshot; counters: GameCounters | null } {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const v = new Uint32Array(bytes.buffer, 0, 1)[0]!;
  const headWords = v === 2 ? 4 : 3;
  const head = new Uint32Array(bytes.buffer, 0, headWords);
  const fLen = head[1]!;
  const uLen = head[2]!;
  const gLen = v === 2 ? head[3]! : 0;
  const o = headWords * 4;
  const f64 = new Float64Array(bytes.buffer.slice(o, o + fLen));
  const u8 = bytes.slice(o + fLen, o + fLen + uLen);
  let counters: GameCounters | null = null;
  if (gLen > 0) {
    counters = JSON.parse(new TextDecoder().decode(bytes.subarray(o + fLen + uLen, o + fLen + uLen + gLen))) as GameCounters;
  }
  return { physics: { v: 1, f64, u8 }, counters };
}
