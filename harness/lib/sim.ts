/**
 * Node-side simulation: physics + compiled track + the game's run rules,
 * without a browser.
 *
 * The bot searches here at microseconds per tick and only sends its winning
 * recording to the browser (`harness:replay` / gate D3) to prove both agree
 * byte for byte. The physics factory is resolved at runtime so this file works
 * on the mock and on the real `src/physics` without edits. The rules layer
 * (`./rules.ts`) mirrors `Game.tick()` so a crash, the 1.0 s auto-respawn, the
 * restart edge and the run clock behave exactly as in the page.
 */
import {
  DEFAULT_PHYSICS_HZ,
  NEUTRAL_INPUT,
  type CompiledTrack,
  type GameEvent,
  type GamePhase,
  type InputFrame,
  type PhysicsSnapshot,
  type PhysicsState,
  type TrackDef,
} from '../../src/core/types';
import { hashPhysicsState } from '../../src/core/hash';
import { compileTrack, getTrack, listTrackIds } from '../../src/tracks';
import * as physicsModule from '../../src/physics';
import type { PhysicsFactory, PhysicsWorld } from '../../src/physics';
import { RunRules, type RulesCounters } from './rules';

export interface SimSnapshot {
  physics: PhysicsSnapshot;
  counters: RulesCounters;
}

export interface Sim {
  world: PhysicsWorld;
  rules: RunRules;
  track: TrackDef;
  compiled: CompiledTrack;
  hz: number;
  seed: number;
  /** Which physics implementation was resolved ('bikePhysicsFactory' | 'createBikePhysics' | 'MockPhysics'). */
  physicsName: string;
  /** One game tick; returns the game events it produced. */
  step(input: InputFrame): GameEvent[];
  /** Run a whole frame sequence from the current state. */
  run(frames: Iterable<InputFrame>): { state: PhysicsState; events: GameEvent[]; hash: string; ticks: number };
  snap(): SimSnapshot;
  restore(s: SimSnapshot): void;
  hash(): string;
  state(): PhysicsState;
  phase(): GamePhase;
  faults(): number;
  /** Run clock in ticks (frozen at finish), as `hook.runTime()` in the page. */
  runTicks(): number;
  runTime(): number;
  /** Total ticks ever stepped through this sim (search + play), for cost accounting. */
  totalTicks(): number;
  /** Back to GO on the same track and seed (state as after createSim). */
  reload(): void;
}

let resolved: { factory: PhysicsFactory; name: string } | null = null;

/** Prefer the real physics when `src/physics` exports a factory; else the mock. */
export async function resolvePhysicsFactory(): Promise<{ factory: PhysicsFactory; name: string }> {
  if (resolved) return resolved;
  if (process.env.TRIALS_PHYSICS !== 'mock') {
    const mod = physicsModule as unknown as Record<string, unknown>;
    for (const name of ['bikePhysicsFactory', 'createBikePhysics']) {
      const f = mod[name];
      if (typeof f === 'function') {
        resolved = { factory: f as PhysicsFactory, name };
        return resolved;
      }
    }
  }
  const { MockPhysics } = await import('../../src/game/mockPhysics');
  resolved = { factory: (hz: number) => new MockPhysics(hz), name: 'MockPhysics' };
  return resolved;
}

export function listSimTracks(): string[] {
  return listTrackIds();
}

export function requireTrack(trackId: string): TrackDef {
  const def = getTrack(trackId);
  if (!def) throw new Error(`unknown track '${trackId}' (known: ${listTrackIds().join(', ')})`);
  return def;
}

export async function createSim(trackId: string, seed?: number, hz: number = DEFAULT_PHYSICS_HZ): Promise<Sim> {
  const { factory, name } = await resolvePhysicsFactory();
  const track = requireTrack(trackId);
  const compiled = compileTrack(track);
  const world = factory(hz);
  const theSeed = (seed ?? track.seed) >>> 0;
  const rules = new RunRules(world, hz);
  const load = (): void => {
    world.loadTrack(compiled, theSeed);
    world.drainEvents();
    rules.go();
    rules.drainEvents();
  };
  load();
  let total = 0;

  const step = (input: InputFrame): GameEvent[] => {
    rules.tick(input);
    total++;
    return rules.drainEvents();
  };

  return {
    world,
    rules,
    track,
    compiled,
    hz,
    seed: theSeed,
    physicsName: name,
    step,
    run(frames) {
      const events: GameEvent[] = [];
      let ticks = 0;
      for (const f of frames) {
        const ev = step(f);
        for (const e of ev) events.push(e);
        ticks++;
      }
      const state = world.getState();
      return { state, events, hash: hashPhysicsState(state), ticks };
    },
    snap: () => ({ physics: world.snapshot(), counters: rules.counters() }),
    restore: (s) => {
      world.restore(s.physics);
      world.drainEvents();
      rules.restoreCounters(s.counters);
    },
    hash: () => hashPhysicsState(world.getState()),
    state: () => world.getState(),
    phase: () => rules.phase(),
    faults: () => rules.faults(),
    runTicks: () => rules.runTicks(),
    runTime: () => rules.runTicks() / hz,
    totalTicks: () => total,
    reload: load,
  };
}

/** A quantized neutral frame; hold this to coast. */
export const COAST: InputFrame = { ...NEUTRAL_INPUT };
