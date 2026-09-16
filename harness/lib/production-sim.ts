/** Node driver for the production run state machine, including faults before checkpoint 1. */
import { Game, type GameCounters } from '../../src/game/game';
import { createBikePhysicsV2 } from '../../src/physics/v2/bike';
import { compileTrack, getTrack } from '../../src/tracks';
import type { BikeClass, GameEvent, InputFrame } from '../../src/core/types';
import type { Sim, SimSnapshot } from './sim';
import type { GameRenderer } from '../../src/render/index';

export interface ProductionSim extends Omit<Sim, 'rules'> { game: Game }

export function createProductionSim(trackId: string, bike: BikeClass = 'rookie', seed = 1, hz = 120): ProductionSim {
  const world = createBikePhysicsV2(hz);
  const game = new Game({ physics: world, renderer: { setTrack() {} } as unknown as GameRenderer, physicsHz: hz,
    autoSkipCountdown: true, ghostEnabled: false, autoRecord: false, physicsVersion: 'v2' });
  const track = getTrack(trackId);
  if (!track) throw new Error(`Unknown track: ${trackId}`);
  const compiled = compileTrack(track);
  let total = 0;
  const reload = () => { game.loadTrack(trackId, seed, bike); game.drainEvents(); };
  const step = (input: InputFrame) => { game.setInput(input); game.step(1); total++; return game.drainEvents(); };
  reload();
  return {
    game, world, track, compiled, hz, bike, seed, physicsName: 'production-Game-v2', physicsVersion: 'v2',
    reload, step, totalTicks: () => total,
    run(frames) {
      const events: GameEvent[] = [];
      let ticks = 0;
      for (const frame of frames) { events.push(...step(frame)); ticks++; }
      return { state: game.getState(), events, ticks, hash: game.hashState() };
    },
    snap: () => ({ physics: game.snapshot(), counters: game.counters() }),
    restore: (snapshot) => { game.restore(snapshot.physics); game.restoreCounters(snapshot.counters); game.drainEvents(); },
    hash: () => game.hashState(), state: () => game.getState(), phase: () => game.phase(), faults: () => game.faults(),
    runTicks: () => {
      const c = game.counters();
      return c.phase === 'finished' ? c.finishRunTicks : c.runTicks;
    },
    runTime: () => game.runTime(),
  };
}

function rawEqual(a: ArrayBufferView, b: ArrayBufferView): boolean {
  return Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));
}

/** Byte comparisons preserve negative zero and every IEEE754 bit; counters use Object.is too. */
export function equalProductionSnapshots(a: SimSnapshot, b: SimSnapshot): boolean {
  const keys = Object.keys(a.counters) as (keyof GameCounters)[];
  return a.physics.v === b.physics.v && rawEqual(a.physics.f64, b.physics.f64) && rawEqual(a.physics.u8, b.physics.u8)
    && keys.length === Object.keys(b.counters).length && keys.every((key) => Object.is(a.counters[key], b.counters[key]));
}
