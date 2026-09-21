// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { NEUTRAL_INPUT } from '../core/types';
import { App } from './app';

/** Shell surface double: exercise the real public lifecycle and pause/back methods without WebGL. */
function setup(screen = 'run') {
  let paused = false;
  const fields = {
    screen, nativeInactive: false, prevRestart: true, prevThrottle: true,
    lastNow: 0, lastRenderAt: 123, screenAt: 0, audioUnlocked: true,
    soundOn: true, volume: 0.7, replayMuted: false,
    mux: { reset: vi.fn(), activeDevice: () => 'touch' },
    game: {
      setInput: vi.fn(), phase: () => 'riding', paused: () => paused,
      setPaused: vi.fn((next: boolean) => { paused = next; }),
      currentTrack: null, getState: () => ({ checkpoint: 0 }), runTime: () => 2, faults: () => 0,
    },
    pause: { visible: false, setDevice: vi.fn(), show: vi.fn(), fadeOut: vi.fn() },
    onboard: { visible: false, dismiss: vi.fn() },
    navLog: { record: vi.fn() }, navContext: vi.fn(), setOverlay: vi.fn(),
    cadence: { reset: vi.fn() }, fit: vi.fn(),
    audio: { setMasterVolume: vi.fn(), setAppActive: vi.fn() },
    tracksScreen: { back: vi.fn() }, garage: { back: vi.fn() }, settings: { back: vi.fn() },
    replay: { exit: vi.fn() }, leaveReview: vi.fn(),
  };
  const app = Object.assign(Object.create(App.prototype) as object, fields) as unknown as App;
  return { app, fields };
}

describe('native app interruption', () => {
  it('pauses riding, releases controls and audio, and keeps the run paused after foregrounding', () => {
    const { app, fields } = setup();
    app.setNativeActive(false);
    expect(fields.game.paused()).toBe(true);
    expect(fields.pause.show).toHaveBeenCalledOnce();
    expect(fields.game.setInput).toHaveBeenLastCalledWith(NEUTRAL_INPUT);
    expect(fields.audio.setAppActive).toHaveBeenLastCalledWith(false);
    app.setNativeActive(false); // duplicate OS event must not toggle Resume
    expect(fields.pause.show).toHaveBeenCalledOnce();
    app.setNativeActive(true);
    expect(fields.game.paused()).toBe(true);
    expect(fields.mux.reset).toHaveBeenCalledTimes(2);
    expect(fields.cadence.reset).toHaveBeenCalledTimes(2);
    expect(fields.audio.setMasterVolume).toHaveBeenLastCalledWith(0.7);
    expect((app as unknown as { lastRenderAt: number }).lastRenderAt).toBe(0);
  });

  it('skips background frames and discards background wall time on the first foreground frame', () => {
    const { app } = setup('menu');
    let now = 100;
    const callbacks: FrameRequestCallback[] = [];
    const tickFrame = vi.fn();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => callbacks.push(callback));
    Object.assign(app, {
      o: {}, onDevice: vi.fn(), loadBackdrop: vi.fn(), goto: vi.fn(),
      bench: null, frameCapHz: () => 60, capInEffect: 60,
      cadence: { reset: vi.fn(), shouldRender: () => true },
      tickFrame, meterFrame: vi.fn(), governFrame: vi.fn(),
    });
    try {
      app.start();
      app.setNativeActive(false);
      now = 30_100;
      callbacks.shift()!(now);
      expect(tickFrame).not.toHaveBeenCalled();
      app.setNativeActive(true);
      now += 16;
      callbacks.shift()!(now);
      expect(tickFrame).toHaveBeenCalledExactlyOnceWith(0.016);
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it('Back pauses an active ride and consumes the event; only the main menu permits minimize', () => {
    const { app, fields } = setup();
    expect(app.nativeBack()).toBe(true);
    expect(fields.game.paused()).toBe(true);
    const menu = setup('menu');
    expect(menu.app.nativeBack()).toBe(false);
    const tracks = setup('tracks');
    expect(tracks.app.nativeBack()).toBe(true);
    expect(tracks.fields.tracksScreen.back).toHaveBeenCalledOnce();
  });

  it('Back closes replay before leaving the app and is ignored while inactive', () => {
    const { app, fields } = setup('replay');
    expect(app.nativeBack()).toBe(true);
    expect(fields.replay.exit).toHaveBeenCalledOnce();
    app.setNativeActive(false);
    expect(app.nativeBack()).toBe(true);
    expect(fields.replay.exit).toHaveBeenCalledOnce();
  });
});
