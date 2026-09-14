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

describe('physics version stamp (game.md §8, §17): a PB from the other solver is never ghosted', () => {
  class MemStore {
    rec: { time: number; faults: number; splits?: number[]; recording?: string } | null = null;
    get(): { time: number; faults: number; splits?: number[]; recording?: string } | null {
      return this.rec;
    }
    put(_id: string, r: { time: number; faults: number }, run: { splits: number[]; recording: string | null }): void {
      this.rec = { time: r.time, faults: r.faults, splits: run.splits, ...(run.recording ? { recording: run.recording } : {}) };
    }
  }
  const make = (store: MemStore, physicsVersion: 'v1' | 'v2' | undefined): Game =>
    new Game({ physics: new MockPhysics(120), renderer: new StubRenderer(), autoSkipCountdown: true, autoRecord: true, physicsFactory: (hz) => new MockPhysics(hz), bestTimes: store, physicsVersion });
  const clear = (g: Game): void => {
    g.loadTrack('flat-test');
    g.setInput({ throttle: 1 });
    for (let i = 0; i < 6000 && g.phase() !== 'finished'; i++) g.step(1);
    expect(g.phase()).toBe('finished');
    g.step(48);
  };

  it('stamps recordings with the live solver and reads an unstamped one as v1', () => {
    const store = new MemStore();
    clear(make(store, 'v2'));
    expect(JSON.parse(store.rec!.recording!).header.physics).toBe('v2');
    const g = make(store, 'v1');
    expect(g.recordingMatchesPhysics(store.rec!.recording!)).toBe(false);
    expect(make(store, 'v2').recordingMatchesPhysics(store.rec!.recording!)).toBe(true);
    // Unstamped (pre-flip) recordings are v1 recordings.
    const legacy = JSON.stringify({ ...JSON.parse(store.rec!.recording!), header: { ...JSON.parse(store.rec!.recording!).header, physics: undefined } });
    expect(make(store, 'v1').recordingMatchesPhysics(legacy)).toBe(true);
    expect(make(store, 'v2').recordingMatchesPhysics(legacy)).toBe(false);
    // No version (mock / tests): ungated.
    expect(make(store, undefined).recordingMatchesPhysics(legacy)).toBe(true);
  });

  it('ghosts a PB only under the solver it was set on; the entry (medal, time) is untouched', () => {
    const store = new MemStore();
    clear(make(store, 'v1'));
    const v1pb = store.rec!;
    const under2 = make(store, 'v2');
    under2.loadTrack('flat-test');
    expect(under2.ghostState()).toBeNull();
    expect(store.rec).toBe(v1pb);
    const under1 = make(store, 'v1');
    under1.loadTrack('flat-test');
    expect(under1.ghostState()).not.toBeNull();
  });
});

describe('renderer.setBikeClass (CONTRACT §2.7)', () => {
  it('is called with the class on every load path and skipped for renderers without it', () => {
    class LiveryRenderer extends StubRenderer {
      classes: string[] = [];
      setBikeClass(c: 'rookie' | 'pro'): void {
        this.classes.push(c);
      }
    }
    const r = new LiveryRenderer();
    const g = new Game({ physics: new MockPhysics(120), renderer: r, autoSkipCountdown: true });
    g.loadTrack('flat-test');
    g.loadTrack('flat-test', undefined, 'pro');
    g.toMenu();
    g.setBike('rookie'); // menu-phase reload (garage preview / hook.setBike)
    expect(r.classes).toEqual(['rookie', 'pro', 'rookie']);
    const plain = new Game({ physics: new MockPhysics(120), renderer: new StubRenderer(), autoSkipCountdown: true });
    expect(plain.loadTrack('flat-test', undefined, 'pro')).toBe(true);
  });
});

describe('replay viewer playback (docs/design/game.md §16)', () => {
  class MemStore {
    rec: { time: number; faults: number; splits?: number[]; recording?: string } | null = null;
    get(): { time: number; faults: number; splits?: number[]; recording?: string } | null {
      return this.rec;
    }
    put(_id: string, r: { time: number; faults: number }, run: { splits: number[]; recording: string | null }): void {
      this.rec = { time: r.time, faults: r.faults, splits: run.splits, ...(run.recording ? { recording: run.recording } : {}) };
    }
  }
  const makeGame = (store: MemStore): Game =>
    new Game({ physics: new MockPhysics(120), renderer: new StubRenderer(), autoSkipCountdown: true, autoRecord: true, physicsFactory: (hz) => new MockPhysics(hz), bestTimes: store });

  /** A run with a restart tap and a crash (auto-respawn) so the replay has every rule to reproduce. */
  const ride = (g: Game, hashes?: Map<number, string>): void => {
    const script: Array<[number, Partial<InputFrame>]> = [
      [400, { throttle: 1 }],
      [1, { throttle: 1, restart: true }],
      [150, { throttle: 1 }],
      [300, { throttle: 1, lean: -1 }],
      [4000, { throttle: 1 }],
    ];
    let t = 0;
    for (const [n, f] of script) {
      g.setInput(f);
      for (let i = 0; i < n && g.phase() !== 'finished'; i++) {
        g.step(1);
        t++;
        if (hashes && t % 100 === 0) hashes.set(t, g.hashState());
      }
    }
  };

  it('every finished run is kept as the last run (PB or not) with its time and faults', () => {
    const store = new MemStore();
    const g = makeGame(store);
    g.loadTrack('flat-test');
    expect(g.lastRunRecording()).toBeNull();
    ride(g);
    expect(g.phase()).toBe('finished');
    g.step(48);
    const first = g.lastRunRecording();
    expect(first).not.toBeNull();
    expect(first!.trackId).toBe('flat-test');
    expect(first!.faults).toBe(g.faults());
    expect(first!.time).toBe(g.runTime());
    expect(first!.json).toBe(store.rec?.recording);
    // A slower second run is not a PB but is still the last run.
    g.restartFromStart();
    g.setInput({ throttle: 0.4 });
    let guard = 0;
    while (g.phase() !== 'finished' && guard++ < 20000) g.step(1);
    g.step(48);
    const second = g.lastRunRecording();
    expect(second!.json).not.toBe(first!.json);
    expect(store.rec?.recording).toBe(first!.json); // PB untouched
  });

  it('playback drives the same tick(): the replayed run hashes like the live run at every 100 ticks, and seeks re-simulate deterministically', () => {
    const store = new MemStore();
    const live = makeGame(store);
    live.loadTrack('flat-test');
    const hashes = new Map<number, string>();
    ride(live, hashes);
    const liveFinal = live.hashState(); // at the finish tick, before the coast
    const liveTime = live.runTime();
    const liveFaults = live.faults();
    live.step(48);
    const rec = live.lastRunRecording()!;

    const g = makeGame(store);
    g.loadTrack('flat-test');
    let results = 0;
    g.onResults = () => results++;
    expect(g.startPlayback(rec.json, { ghost: false })).toBe(true);
    expect(g.inPlayback()).toBe(true);
    expect(g.phase()).toBe('riding');
    expect(g.playbackInfo()!.tick).toBe(0);
    expect(g.playbackLength()).toBeGreaterThan(800);
    // Wall-driven playback at 1×: 100 ticks per 100/120 s.
    let ticks = 0;
    for (const [k, h] of hashes) {
      while (ticks < k) {
        g.advance(1 / 120);
        ticks++;
      }
      expect(g.playbackInfo()!.tick).toBe(k);
      expect(g.hashState()).toBe(h);
    }
    while (g.phase() !== 'finished' && ticks++ < 8000) g.advance(1 / 120);
    expect(g.phase()).toBe('finished');
    expect(g.runTime()).toBe(liveTime);
    expect(g.faults()).toBe(liveFaults);
    expect(g.hashState()).toBe(liveFinal);
    // No results panel / store write from a replay.
    for (let i = 0; i < 400; i++) g.advance(1 / 120);
    expect(results).toBe(0);
    expect(g.playbackInfo()!.ended).toBe(true);
    expect(g.paused()).toBe(true);

    // Scrub: GO → tick N is byte-identical to the straight run at N, in any order.
    const keys = [...hashes.keys()];
    for (const k of [keys[3]!, keys[0]!, keys[5]!, keys[2]!]) {
      g.seekPlayback(k);
      expect(g.playbackInfo()!.tick).toBe(k);
      expect(g.hashState()).toBe(hashes.get(k));
      expect(g.playbackInfo()!.ended).toBe(false);
    }
    // 0.5×: half the ticks per wall second.
    g.seekPlayback(0);
    g.setPaused(false);
    g.playbackSpeed = 0.5;
    for (let i = 0; i < 120; i++) g.advance(1 / 120);
    expect(g.playbackInfo()!.tick).toBe(60);
    g.stopPlayback();
    expect(g.inPlayback()).toBe(false);
  });

  it('the PB ghost rides alongside a replayed non-PB run and is rewound (same world) on every seek', () => {
    const store = new MemStore();
    const a = makeGame(store);
    a.loadTrack('flat-test');
    ride(a);
    a.step(48);
    expect(store.rec?.recording).toBeTruthy();
    a.restartFromStart();
    a.setInput({ throttle: 0.5 });
    let guard = 0;
    while (a.phase() !== 'finished' && guard++ < 20000) a.step(1);
    a.step(48);
    const slow = a.lastRunRecording()!;
    expect(slow.json).not.toBe(store.rec!.recording);
    const g = makeGame(store);
    g.loadTrack('flat-test');
    g.startPlayback(slow.json);
    expect(g.ghostState()).not.toBeNull();
    for (let i = 0; i < 300; i++) g.advance(1 / 120);
    const ghostAt300 = hashPhysicsState(g.ghostState()!);
    g.seekPlayback(100);
    g.seekPlayback(300);
    expect(hashPhysicsState(g.ghostState()!)).toBe(ghostAt300);
    // A replay of the PB itself gets no ghost (it would sit on the bike).
    const h = makeGame(store);
    h.loadTrack('flat-test');
    h.startPlayback(store.rec!.recording!, { ghost: false });
    expect(h.ghostState()).toBeNull();
  });

  it('recentInput() is the last ≤ 1 s of quantized frames, oldest first, RLE-packed', () => {
    const { game } = make({ harness: true });
    expect(game.recentInput()).toEqual([]);
    game.setInput({ throttle: 1 });
    game.step(200);
    expect(game.recentInput()).toEqual([[120, 255, 0, 0, 0]]);
    game.setInput({ throttle: 0.5, lean: -1 });
    game.step(30);
    const runs = game.recentInput();
    expect(runs.length).toBe(2);
    expect(runs[0]).toEqual([90, 255, 0, 0, 0]);
    expect(runs[1]).toEqual([30, 128, 0, -127, 0]);
    expect(runs.reduce((n, r) => n + r[0], 0)).toBe(120);
  });

  it('lab mode: the ghost slot shows the previous attempt from its own spawn, and attempts() = 1 + faults', () => {
    const g = new Game({ physics: new MockPhysics(120), renderer: new StubRenderer(), autoSkipCountdown: true, physicsFactory: (hz) => new MockPhysics(hz) });
    g.loadTrack('flat-test');
    g.setLabMode(true);
    expect(g.lab).toBe(true);
    expect(g.attempts()).toBe(1);
    expect(g.ghostState()).toBeNull(); // nothing to show before a first attempt ends
    g.setInput({ throttle: 1 });
    g.step(500);
    const xBeforeTap = g.getState().bike.pos.x;
    g.setInput({ throttle: 1, restart: true });
    g.step(1); // attempt 1 ends (restart tap); attempt 2 begins at the checkpoint
    g.setInput({ throttle: 1 });
    expect(g.attempts()).toBe(2);
    const ghost = g.ghostState();
    expect(ghost).not.toBeNull();
    // The ghost starts where attempt 1 started (the last checkpoint at that time: the start line) and rides its frames.
    expect(ghost!.bike.pos.x).toBeLessThan(xBeforeTap);
    g.step(500);
    expect(g.ghostState()!.bike.pos.x).toBeCloseTo(xBeforeTap, 6);
    g.step(1); // the tap tick itself was the attempt's last frame
    const xEnd = g.ghostState()!.bike.pos.x;
    g.step(200); // recording exhausted: the ghost holds
    expect(g.ghostState()!.bike.pos.x).toBe(xEnd);
    g.setLabMode(false);
    expect(g.ghostState()).toBeNull(); // no PB store → no PB ghost
  });
});
