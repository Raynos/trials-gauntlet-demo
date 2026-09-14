import { describe, expect, it } from 'vitest';
import type { CameraDebug, CompiledTrack, GameEvent, PhysicsState, RenderStats } from '../core/types';
import type { GameRenderer } from '../render';
import { Game } from './game';
import { decodeSnapshot, encodeSnapshot } from './hook';
import { MockPhysics } from './mockPhysics';

class StubRenderer implements GameRenderer {
  readonly canvas = {} as HTMLCanvasElement;
  framesRendered = 0;
  events: GameEvent[] = [];
  setTrack(_t: CompiledTrack): void {}
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
  onEvent(e: GameEvent): void {
    this.events.push(e);
  }
  setQuality(): void {}
  camera(): CameraDebug {
    return { pos: { x: 0, y: 0 }, dist: 14, bikeScreenX: 0.3, bikeScreenY: 0.55, bikeHeightFrac: 0.2 };
  }
  setRunInfo(): void {}
}

function make(opts: { harness?: boolean } = {}): { game: Game; renderer: StubRenderer; events: GameEvent[] } {
  const renderer = new StubRenderer();
  const game = new Game({ physics: new MockPhysics(120), renderer, autoSkipCountdown: opts.harness ?? false });
  const events: GameEvent[] = [];
  game.onEvent((e) => events.push(e));
  game.loadTrack('flat-test');
  return { game, renderer, events };
}

const types = (events: GameEvent[]): string[] => events.map((e) => (e.type === 'countdown' ? `countdown${e.n}` : e.type === 'fault' ? `fault:${e.reason}` : e.type));

describe('Game run state machine', () => {
  it('counts down 3-2-1-GO at 1.0 s cadence in simulated ticks and starts at a fresh physics state', () => {
    const { game, events } = make();
    expect(game.phase()).toBe('countdown');
    expect(types(events)).toEqual(['countdown3']);
    game.setInput({ throttle: 1 }); // throttle before GO does nothing
    game.step(119);
    expect(types(events)).toEqual(['countdown3']);
    game.step(1);
    expect(types(events)).toEqual(['countdown3', 'countdown2']);
    game.step(120);
    expect(types(events)).toEqual(['countdown3', 'countdown2', 'countdown1']);
    expect(game.runTime()).toBe(0);
    game.step(120);
    expect(types(events).at(-1)).toBe('go');
    expect(game.phase()).toBe('riding');
    expect(game.getState().tick).toBe(0);
    expect(game.getState().bike.vel.x).toBe(0);
    // Physics at GO hashes like a harness load that skipped the countdown.
    const fresh = make({ harness: true });
    expect(game.hashState()).toBe(fresh.game.hashState());
    game.step(1);
    expect(game.getState().bike.vel.x).toBeGreaterThan(0);
    expect(game.runTime()).toBeCloseTo(1 / 120, 9);
  });

  it('skipCountdown jumps to GO; harness mode loads straight at GO', () => {
    const a = make();
    a.game.skipCountdown();
    expect(a.game.phase()).toBe('riding');
    const b = make({ harness: true });
    expect(b.game.phase()).toBe('riding');
    expect(types(b.events)).toEqual(['go']);
  });

  it('restart tap = fault + one-tick reset to the last checkpoint, clock keeps running', () => {
    const { game, events } = make({ harness: true });
    game.setInput({ throttle: 1 });
    let guard = 0;
    while (game.getState().checkpoint < 0 && guard++ < 5000) game.step(1);
    expect(game.getState().checkpoint).toBe(0);
    const before = game.runTime();
    const tickBefore = game.getState().tick;
    game.setInput({ throttle: 1, restart: true });
    game.step(1);
    const s = game.getState();
    expect(s.tick).toBe(0); // exactly one game tick later physics is reset (gate G5)
    expect(s.checkpoint).toBe(0);
    expect(s.faulted).toBeNull();
    expect(game.faults()).toBe(1);
    expect(game.runTime()).toBeCloseTo(before + 1 / 120, 9);
    expect(game.phase()).toBe('riding');
    expect(types(events).slice(-2)).toEqual(['fault:restart', 'restart']);
    game.setInput({ throttle: 1, restart: false });
    game.step(1);
    expect(game.getState().bike.vel.x).toBeGreaterThan(0); // no countdown after a restart (gate G6)
    expect(game.getState().tick).toBe(1);
    expect(tickBefore).toBeGreaterThan(1);
  });

  it('crash → crashed phase → auto respawn 1.0 s later with a single fault', () => {
    const { game, events } = make({ harness: true });
    game.setInput({ throttle: 1 });
    game.step(240);
    game.setInput({ throttle: 1, lean: -1 }); // loop out (mock crash rule)
    let guard = 0;
    while (game.phase() !== 'crashed' && guard++ < 2000) game.step(1);
    expect(game.phase()).toBe('crashed');
    expect(game.faults()).toBe(1);
    expect(game.getState().ragdoll).not.toBeNull();
    const clockAtCrash = game.runTime();
    game.step(119);
    expect(game.phase()).toBe('crashed');
    game.step(1);
    expect(game.phase()).toBe('riding');
    expect(game.getState().tick).toBe(0);
    expect(game.getState().ragdoll).toBeNull();
    expect(game.faults()).toBe(1);
    expect(game.runTime()).toBeCloseTo(clockAtCrash + 1, 6); // clock ran through the ragdoll
    expect(types(events).filter((t) => t.startsWith('fault'))).toEqual(['fault:crash']);
  });

  it('manual restart during a crash respawns immediately without a second fault', () => {
    const { game } = make({ harness: true });
    game.setInput({ throttle: 1 });
    game.step(240);
    game.setInput({ throttle: 1, lean: -1 });
    let guard = 0;
    while (game.phase() !== 'crashed' && guard++ < 2000) game.step(1);
    game.step(10);
    game.setInput({ restart: true });
    game.step(1);
    expect(game.phase()).toBe('riding');
    expect(game.getState().tick).toBe(0);
    expect(game.faults()).toBe(1);
  });

  it('holding restart 0.6 s = full restart (faults 0, clock 0, countdown again)', () => {
    const { game, events } = make();
    game.skipCountdown();
    game.setInput({ throttle: 1 });
    game.step(600);
    game.setInput({ throttle: 1, restart: true });
    game.step(1); // tap → checkpoint restart + fault
    expect(game.faults()).toBe(1);
    game.step(70);
    expect(game.phase()).toBe('riding');
    game.step(1); // 72nd held tick
    expect(game.phase()).toBe('countdown');
    expect(game.faults()).toBe(0);
    expect(game.runTime()).toBe(0);
    expect(types(events).slice(-2)).toEqual(['restart', 'countdown3']);
    // Still holding: must not fire again.
    game.step(200);
    expect(game.phase()).toBe('countdown');
  });

  it('finish freezes the run clock and publishes results 0.4 s later', () => {
    const { game } = make({ harness: true });
    let result: { time: number; faults: number; medal: string } | null = null;
    game.onResults = (r) => (result = r);
    game.setInput({ throttle: 1 });
    let guard = 0;
    while (game.phase() !== 'finished' && guard++ < 6000) game.step(1);
    expect(game.phase()).toBe('finished');
    const t = game.runTime();
    expect(t).toBe(game.finishTime()); // no restarts: run clock == segment time
    game.step(47);
    expect(result).toBeNull();
    game.step(1);
    expect(result).not.toBeNull();
    expect(result!.time).toBe(t);
    expect(result!.faults).toBe(0);
    expect(result!.medal).toBe('gold');
    game.step(100);
    expect(game.runTime()).toBe(t);
  });

  it('a recording with restart edges and a crash replays to the same hash and run clock', () => {
    const live = make({ harness: true });
    live.game.startRecording('test');
    const script: Array<[number, Partial<PhysicsState['input']> & { restart?: boolean }]> = [
      [300, { throttle: 1 }],
      [1, { throttle: 1, restart: true }],
      [200, { throttle: 1 }],
      [400, { throttle: 1, lean: -1 }], // crash + auto respawn inside this window
      [1200, { throttle: 1 }],
    ];
    for (const [n, f] of script) {
      live.game.setInput(f);
      live.game.step(n);
    }
    const json = live.game.stopRecording()!;
    const liveHash = live.game.hashState();
    const liveClock = live.game.runTime();
    const liveFaults = live.game.faults();
    expect(liveFaults).toBeGreaterThanOrEqual(2);

    const a = make({ harness: true });
    a.game.runRecording(json);
    const b = make();
    b.game.runRecording(json);
    expect(a.game.hashState()).toBe(liveHash);
    expect(b.game.hashState()).toBe(liveHash);
    expect(a.game.runTime()).toBe(liveClock);
    expect(a.game.faults()).toBe(liveFaults);
  });

  it('snapshot/restore round-trips physics and game counters', () => {
    const { game } = make({ harness: true });
    game.setInput({ throttle: 1 });
    game.step(300);
    game.setInput({ throttle: 1, lean: -1 });
    let guard = 0;
    while (game.phase() !== 'crashed' && guard++ < 2000) game.step(1);
    game.step(30);
    const snap = encodeSnapshot(game.snapshot(), game.counters());
    game.setInput({ throttle: 1 });
    game.step(300);
    const h1 = game.hashState();
    const c1 = game.counters();
    const dec = decodeSnapshot(snap);
    game.restore(dec.physics);
    game.restoreCounters(dec.counters!);
    expect(game.phase()).toBe('crashed');
    game.step(300);
    expect(game.hashState()).toBe(h1);
    expect(game.counters()).toEqual(c1);
  });
});
