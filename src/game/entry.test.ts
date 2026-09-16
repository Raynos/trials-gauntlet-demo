/**
 * Track entry hold (docs/design/game.md § entry hold): while the renderer reports `entering` the
 * countdown does not tick and the HUD's RunInfo names the biome; `whenReady()` releases it with the 3.
 */
import { describe, expect, it } from 'vitest';
import type { CameraDebug, CompiledTrack, GameEvent, RenderStats, RunInfo } from '../core/types';
import type { GameRenderer } from '../render';
import { Game } from './game';
import { MockPhysics } from './mockPhysics';

class EntryRenderer implements GameRenderer {
  readonly canvas = {} as HTMLCanvasElement;
  framesRendered = 0;
  entering = false;
  resolve: (() => void) | null = null;
  private pending: Promise<void> = Promise.resolve();
  info: RunInfo | null = null;
  setTrack(_t: CompiledTrack): void {
    this.entering = true;
    this.pending = new Promise<void>((res) => (this.resolve = res));
  }
  /** The entry job finished: the next `whenReady()` resolves. */
  ready(): void {
    this.entering = false;
    this.resolve?.();
  }
  whenReady(): Promise<void> {
    return this.pending;
  }
  debugInfo(): { entering: boolean; entryMs: number } {
    return { entering: this.entering, entryMs: 123 };
  }
  render(): number {
    this.framesRendered++;
    return 0;
  }
  finish(): void {}
  resize(): void {}
  stats(): RenderStats {
    return { calls: 0, triangles: 0, points: 0, lines: 0, geometries: 0, textures: 0, programs: 0, texturesMB: 0, renderer: 'stub', contextKind: 'none' };
  }
  dispose(): void {}
  onEvent(): void {}
  setQuality(): void {}
  camera(): CameraDebug {
    return { pos: { x: 0, y: 0 }, dist: 14, bikeScreenX: 0.3, bikeScreenY: 0.55, bikeHeightFrac: 0.2 };
  }
  setRunInfo(info: RunInfo): void {
    this.info = { ...info };
  }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const types = (events: GameEvent[]): string[] => events.map((e) => (e.type === 'countdown' ? `countdown${e.n}` : e.type));

describe('track entry hold', () => {
  it('holds the countdown while the renderer is entering, releases it with the 3 on whenReady()', async () => {
    const renderer = new EntryRenderer();
    const game = new Game({ physics: new MockPhysics(120), renderer });
    const events: GameEvent[] = [];
    game.onEvent((e) => events.push(e));
    game.loadTrack('flat-test');
    expect(game.phase()).toBe('countdown');
    expect(game.entryHeld).toBe(true);
    expect(types(events)).toEqual([]); // no "3" yet
    // Three full countdowns' worth of ticks: still countdown, still no beat.
    game.step(120 * 4);
    expect(game.phase()).toBe('countdown');
    expect(types(events)).toEqual([]);
    game.renderOnce();
    expect(renderer.info?.entry).toEqual({ biome: expect.any(String), ms: expect.any(Number) });
    renderer.ready();
    await flush();
    expect(game.entryHeld).toBe(false);
    expect(types(events)).toEqual(['countdown3']);
    game.renderOnce();
    expect(renderer.info?.entry).toBeNull();
    // From the release the countdown runs as before: 3 beats then GO.
    game.step(120 * 3);
    expect(game.phase()).toBe('riding');
    expect(types(events)).toEqual(['countdown3', 'countdown2', 'countdown1', 'go']);
    expect(game.runTime()).toBe(0);
  });

  it('a newer load drops the stale release; skipCountdown / toMenu clear the hold', async () => {
    const renderer = new EntryRenderer();
    const game = new Game({ physics: new MockPhysics(120), renderer });
    const events: GameEvent[] = [];
    game.onEvent((e) => events.push(e));
    game.loadTrack('flat-test');
    const first = renderer.whenReady();
    const releaseFirst = renderer.resolve!;
    game.loadTrack('flat-test'); // second entry: the first job's release must not emit a 3
    releaseFirst();
    await first;
    await flush();
    expect(game.entryHeld).toBe(true);
    expect(types(events)).toEqual([]);
    renderer.ready();
    await flush();
    expect(game.entryHeld).toBe(false);
    expect(types(events)).toEqual(['countdown3']);
    game.loadTrack('flat-test');
    expect(game.entryHeld).toBe(true);
    game.skipCountdown();
    expect(game.entryHeld).toBe(false);
    expect(game.phase()).toBe('riding');
    game.loadTrack('flat-test');
    game.toMenu();
    expect(game.entryHeld).toBe(false);
  });

  it('a renderer that is not entering (restart in place) counts down at once, synchronously', () => {
    const renderer = new EntryRenderer();
    const game = new Game({ physics: new MockPhysics(120), renderer });
    const events: GameEvent[] = [];
    game.onEvent((e) => events.push(e));
    game.loadTrack('flat-test');
    renderer.ready();
    game.skipCountdown();
    expect(game.phase()).toBe('riding');
    game.restartFromStart(); // no setTrack: nothing is entering
    expect(game.entryHeld).toBe(false);
    expect(game.phase()).toBe('countdown');
    expect(types(events).slice(-2)).toEqual(['restart', 'countdown3']);
  });
});
