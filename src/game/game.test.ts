import { describe, expect, it } from 'vitest';
import { hashPhysicsState } from '../core/hash';
import type { CameraDebug, CompiledTrack, GameEvent, InputFrame, PhysicsState, RenderStats } from '../core/types';
import type { GameRenderer } from '../render';
import type { Hud } from '../ui';
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

  it('finish: the game owns the input (throttle 0, lean 0, brake 0 → 0.6 over 1.0 s) and the run-out crash is swallowed and frozen', () => {
    // Mock physics that keeps riding past the line (like the real bike) and crashes 200 ticks after it.
    class RunOutPhysics extends MockPhysics {
      fed: InputFrame[] = [];
      crashAtTick = -1;
      override step(input: InputFrame): void {
        this.fed.push({ ...input });
        const s = this.getState();
        if (s.finished && !s.faulted) {
          if (this.crashAtTick < 0) this.crashAtTick = s.tick + 200;
          if (s.tick >= this.crashAtTick) {
            // What the real world does on a cliff after the line: fault event + ragdoll.
            (this as unknown as { crash(reason: 'crash' | 'out-of-bounds'): void }).crash('out-of-bounds');
            s.tick++;
            return;
          }
        }
        super.step(input);
      }
    }
    const physics = new RunOutPhysics(120);
    const renderer = new StubRenderer();
    const hudEvents: GameEvent[] = [];
    const hud: Hud = {
      setTrack() {},
      setRun() {},
      update() {},
      onEvent(e: GameEvent) {
        hudEvents.push(e);
      },
      showSplit() {},
      showResults() {},
      hideResults() {},
      setDevice() {},
    } as unknown as Hud;
    const game = new Game({ physics, renderer, hud, autoSkipCountdown: true });
    const events: GameEvent[] = [];
    game.onEvent((e) => events.push(e));
    game.loadTrack('flat-test');
    game.setInput({ throttle: 1, lean: -0.5 }); // the player keeps the gas pinned and leans across the line
    let guard = 0;
    while (game.phase() !== 'finished' && guard++ < 6000) game.step(1);
    expect(game.phase()).toBe('finished');
    const finishTick = physics.fed.length;
    const runTime = game.runTime();

    // t = 0 … 1.0 s after the line: throttle 0, lean 0, brake ramps to 0.6 and holds.
    game.step(1);
    let f = physics.fed.at(-1)!;
    expect(f.throttle).toBe(0);
    expect(f.lean).toBe(0);
    expect(f.brake).toBeGreaterThan(0);
    expect(f.brake).toBeLessThan(0.01); // first step of the ramp, on the 1/255 grid
    game.step(59); // +0.5 s
    f = physics.fed.at(-1)!;
    expect(f.brake).toBeCloseTo(0.3, 2);
    game.step(60); // +1.0 s
    f = physics.fed.at(-1)!;
    expect(f.brake).toBeCloseTo(0.6, 3);
    expect(game.effectiveInput().throttle).toBe(0);
    game.step(30);
    expect(physics.fed.at(-1)!.brake).toBeCloseTo(0.6, 3);
    expect(physics.fed.length - finishTick).toBe(150);

    // The run-out crash (200 ticks after the line): swallowed and frozen. No fault surfaces anywhere.
    const hashBefore = game.hashState();
    game.step(60);
    expect(game.phase()).toBe('finished');
    expect(game.faults()).toBe(0);
    expect(game.counters().finishFrozen).toBe(true);
    expect(game.getState().faulted).toBeNull(); // restored to the tick before the fault: no ragdoll either
    expect(game.getState().finished).toBe(true);
    expect(events.filter((e) => e.type === 'fault')).toEqual([]);
    expect(events.filter((e) => e.type === 'restart')).toEqual([]);
    expect(hudEvents.filter((e) => e.type === 'fault' || e.type === 'restart')).toEqual([]);
    expect(renderer.events.filter((e) => e.type === 'fault' || e.type === 'restart')).toEqual([]);
    // Frozen: physics is not stepped again, the hash holds.
    const fedAtFreeze = physics.fed.length;
    const frozenHash = game.hashState();
    game.step(120);
    expect(physics.fed.length).toBe(fedAtFreeze);
    expect(game.hashState()).toBe(frozenHash);
    expect(hashBefore).not.toBe(frozenHash); // it did coast between the line and the freeze
    expect(game.runTime()).toBe(runTime);
    // Results still published, and a restart tap still works out of the frozen state.
    expect(game.result()).not.toBeNull();
    game.setInput({ restart: true });
    game.step(1);
    expect(game.phase()).toBe('riding');
    expect(game.counters().finishFrozen).toBe(false);
    expect(game.getState().faulted).toBeNull();
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

describe('PB ghost and splits', () => {
  class MemStore {
    rec: { time: number; faults: number; splits?: number[]; recording?: string } | null = null;
    get(): { time: number; faults: number; splits?: number[]; recording?: string } | null {
      return this.rec;
    }
    put(_id: string, r: { time: number; faults: number }, run: { splits: number[]; recording: string | null }): void {
      this.rec = { time: r.time, faults: r.faults, splits: run.splits, ...(run.recording ? { recording: run.recording } : {}) };
    }
  }
  const makeGhostGame = (store: MemStore, hud?: Partial<Hud>): Game =>
    new Game({
      physics: new MockPhysics(120),
      renderer: new StubRenderer(),
      autoSkipCountdown: true,
      autoRecord: true,
      physicsFactory: (hz) => new MockPhysics(hz),
      bestTimes: store,
      ...(hud ? { hud: hud as Hud } : {}),
    });

  it('stores the PB recording + splits, then replays it as a lockstep ghost with matching hashes', () => {
    const store = new MemStore();
    const a = makeGhostGame(store);
    a.loadTrack('flat-test');
    expect(a.ghostState()).toBeNull(); // no PB yet
    const hashes = new Map<number, string>();
    const script: Array<[number, Partial<PhysicsState['input']> & { restart?: boolean }]> = [
      [500, { throttle: 1 }],
      [1, { throttle: 1, restart: true }],
      [150, { throttle: 1 }],
      [300, { throttle: 1, lean: -1 }], // crash + auto respawn
      [3000, { throttle: 1 }],
    ];
    let t = 0;
    for (const [n, f] of script) {
      a.setInput(f);
      for (let i = 0; i < n && a.phase() !== 'finished'; i++) {
        a.step(1);
        t++;
        if (t % 100 === 0) hashes.set(t, a.hashState());
      }
    }
    expect(a.phase()).toBe('finished');
    const liveFinalHash = a.hashState();
    a.step(48); // results → store
    expect(store.rec?.recording).toBeTruthy();
    expect(store.rec?.splits?.length).toBe(2);
    expect(a.faults()).toBeGreaterThanOrEqual(2);

    // Second run: ghost exists from GO and matches the first run tick for tick.
    const splits: Array<[number, number]> = [];
    const b = makeGhostGame(store, {
      update() {},
      onEvent() {},
      setRun() {},
      setTrack() {},
      setTrackName() {},
      showResults() {},
      setDevice() {},
      dispose() {},
      showSplit: (cp, d) => splits.push([cp, d]),
    });
    b.loadTrack('flat-test');
    expect(b.ghostState()).not.toBeNull();
    b.setInput({ throttle: 1 });
    let ticks = 0;
    for (const [k, h] of hashes) {
      while (ticks < k) {
        b.step(1);
        ticks++;
      }
      expect(hashPhysicsState(b.ghostState()!)).toBe(h);
    }
    while (b.phase() !== 'finished' && ticks < 6000) {
      b.step(1);
      ticks++;
    }
    // The clean run finishes first; the ghost keeps going under the results and freezes at its own finish.
    b.step(1500);
    expect(hashPhysicsState(b.ghostState()!)).toBe(liveFinalHash);
    // A clean run is ahead of a run with two faults at both checkpoints... except the first
    // checkpoint (x=40) precedes the first fault, so only checkpoint 2 must be ahead.
    expect(splits.map(([cp]) => cp)).toEqual([0, 1]);
    expect(splits[1]![1]).toBeLessThan(0);
    // Live restarts do not touch the ghost's clock: a tap mid-run leaves ghost tick == runTicks.
  });

  it('ghost survives snapshot restore (re-seeks to the run clock) and can be toggled', () => {
    const store = new MemStore();
    const a = makeGhostGame(store);
    a.loadTrack('flat-test');
    a.setInput({ throttle: 1 });
    while (a.phase() !== 'finished') a.step(1);
    a.step(48);
    const b = makeGhostGame(store);
    b.loadTrack('flat-test');
    b.setInput({ throttle: 1 });
    b.step(200);
    const snap = encodeSnapshot(b.snapshot(), b.counters());
    b.step(150);
    const ghostAt350 = hashPhysicsState(b.ghostState()!);
    const dec = decodeSnapshot(snap);
    b.restore(dec.physics);
    b.restoreCounters(dec.counters!);
    b.step(150);
    expect(hashPhysicsState(b.ghostState()!)).toBe(ghostAt350);
    b.setGhostEnabled(false);
    expect(b.ghostState()).toBeNull();
    b.setGhostEnabled(true);
    expect(hashPhysicsState(b.ghostState()!)).toBe(ghostAt350);
  });
});
