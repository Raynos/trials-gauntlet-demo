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
  DEFAULT_BIKE,
  DEFAULT_PHYSICS_HZ,
  NEUTRAL_INPUT,
  type BikeClass,
  type CompiledTrack,
  type GameEvent,
  type GamePhase,
  type InputFrame,
  type PhysicsSnapshot,
  type PhysicsState,
  type PhysicsVersion,
  type TrackDef,
} from '../../src/core/types';
import type { InputRecording } from '../../src/core/replay';
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
  /** Bike class the track was loaded with (`loadTrack(track, seed, { bike })`, physics round 11). */
  bike: BikeClass;
  /** Which physics implementation was resolved ('bikePhysicsFactory' | 'createBikePhysics' | 'createBikePhysicsV1' | 'MockPhysics'). */
  physicsName: string;
  /**
   * Solver stamp for recordings written from this sim (`RecordingHeader.physics`, core r7): 'v2' = the shipped
   * default since the R3 flip, 'v1' = `createBikePhysicsV1` (`{ physics: 'v1' }`, the `?physics=v1` A/B), undefined
   * on the mock. Unstamped recordings are v1 by the core's definition (recorded before the flip).
   */
  physicsVersion: PhysicsVersion | undefined;
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

interface ResolvedPhysics {
  factory: PhysicsFactory;
  name: string;
  version: PhysicsVersion | undefined;
}
const resolvedByVersion = new Map<string, ResolvedPhysics>();

/**
 * Prefer the real physics when `src/physics` exports a factory; else the mock. `version` picks a versioned
 * factory the way `src/main.ts` does for `?physics=v1|v2` (`createBikePhysicsV1` / `createBikePhysicsV2`);
 * the default is the barrel's `bikePhysicsFactory` / `createBikePhysics`, which is v2 since the R3 flip.
 */
export async function resolvePhysicsFactory(version?: PhysicsVersion): Promise<ResolvedPhysics> {
  const key = version ?? 'default';
  const hit = resolvedByVersion.get(key);
  if (hit) return hit;
  let out: ResolvedPhysics | null = null;
  if (process.env.TRIALS_PHYSICS !== 'mock') {
    const mod = physicsModule as unknown as Record<string, unknown>;
    const versioned = version === 'v1' ? ['createBikePhysicsV1'] : version === 'v2' ? ['createBikePhysicsV2'] : [];
    for (const name of [...versioned, 'bikePhysicsFactory', 'createBikePhysics']) {
      const f = mod[name];
      if (typeof f === 'function') {
        out = { factory: f as PhysicsFactory, name, version: name === 'createBikePhysicsV1' ? 'v1' : 'v2' };
        break;
      }
    }
    if (out && version && out.version !== version) throw new Error(`physics ${version} requested but src/physics exports no createBikePhysics${version.toUpperCase()}`);
  }
  if (!out) {
    const { MockPhysics } = await import('../../src/game/mockPhysics');
    out = { factory: (hz: number) => new MockPhysics(hz), name: 'MockPhysics', version: undefined };
  }
  resolvedByVersion.set(key, out);
  return out;
}

export function listSimTracks(): string[] {
  return listTrackIds();
}

export function requireTrack(trackId: string): TrackDef {
  const def = getTrack(trackId);
  if (!def) throw new Error(`unknown track '${trackId}' (known: ${listTrackIds().join(', ')})`);
  return def;
}

export interface SimOptions {
  /** Bike class (round 7): 'rookie' (default, the pre-garage bike to the byte) or 'pro'. */
  bike?: BikeClass | undefined;
  /** Solver (round 8): undefined = the barrel default (v2 since the flip); 'v1' = `createBikePhysicsV1` (A/B, stale goldens). */
  physics?: PhysicsVersion | undefined;
}

export function parsePhysics(v: unknown): PhysicsVersion | undefined {
  if (v === undefined || v === null || v === '' || v === true) return undefined;
  if (v === 'v1' || v === 'v2') return v;
  throw new Error(`--physics: '${String(v)}' is not v1|v2`);
}

export function parseBike(v: unknown, fallback: BikeClass = DEFAULT_BIKE): BikeClass {
  if (v === undefined || v === null || v === '' || v === true) return fallback;
  if (v === 'rookie' || v === 'pro') return v;
  throw new Error(`--bike: '${String(v)}' is not rookie|pro`);
}

/**
 * A sim for a recording: its track, seed, hz, bike class (`header.bike`, absent = rookie) and solver: an explicit
 * `header.physics: 'v1'` runs on `createBikePhysicsV1` (the page needs `?physics=v1` for the same bytes); anything
 * else runs on the barrel default, so an unstamped pre-flip recording simply fails to finish on v2 and is reported
 * stale by `--refresh-goldens` instead of silently being replayed on a solver the page does not run.
 */
export function createSimFor(rec: InputRecording): Promise<Sim> {
  return createSim(rec.header.trackId, rec.header.seed, rec.header.physicsHz, { bike: rec.header.bike, physics: rec.header.physics === 'v1' ? 'v1' : undefined });
}

export async function createSim(trackId: string, seed?: number, hz: number = DEFAULT_PHYSICS_HZ, opts: SimOptions = {}): Promise<Sim> {
  const { factory, name, version } = await resolvePhysicsFactory(opts.physics);
  const track = requireTrack(trackId);
  const compiled = compileTrack(track);
  const world = factory(hz);
  const theSeed = (seed ?? track.seed) >>> 0;
  const bike: BikeClass = opts.bike ?? DEFAULT_BIKE;
  const rules = new RunRules(world, hz);
  const load = (): void => {
    world.loadTrack(compiled, theSeed, { bike });
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
    bike,
    physicsName: version ? `${name}-${version}` : name,
    physicsVersion: version,
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
