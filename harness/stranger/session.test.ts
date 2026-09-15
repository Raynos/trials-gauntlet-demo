import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { iterateFrames, quantizeInput } from '../../src/core/replay';
import { createProductionSim, equalProductionSnapshots } from '../lib/production-sim';
import { numbers, play, reset, restart, tick } from './cli';
import { ACTIONS, COAST, macroFrameAt, macroTicks, parseSlots } from './controls';
import { createSession, decodeSnapshot, encodeSnapshot, loadSession, saveSession, verifySessionReplay } from './session';

const owned: string[] = [];
async function session(bike: 'rookie' | 'pro' = 'rookie') {
  const s = await createSession({ trackId: 'flat-test', seed: 19, bike, sessionId: `test-production-${randomUUID()}`, agent: 'test' });
  owned.push(s.dir);
  return s;
}
afterEach(() => { for (const dir of owned.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe('production Game stranger persistence and commands', () => {
  it('preserves early faults across CLI calls and keeps recording indices separate from the game reset clock', async () => {
    const s = await session();
    for (let i = 0; i < 40; i++) tick(s, COAST);
    restart(s);
    expect(s.sim.state().checkpoint).toBe(-1);
    expect(s.sim.snap().counters.faults).toBe(1);
    saveSession(s);
    const loaded = await loadSession(s.dir);
    expect(equalProductionSnapshots(loaded.sim.snap(), s.sim.snap())).toBe(true);
    expect(numbers(loaded)).toMatchObject({ faults: 1, attempt: 2 });
    const before = loaded.state.runTicks;
    reset(loaded);
    expect(loaded.state.runTicks).toBeGreaterThan(before);
    expect(loaded.sim.snap().counters.runTicks).toBe(1);
    expect(numbers(loaded)).toMatchObject({ faults: 0, attempt: 3, runTime: .008 });
    expect(loaded.state.forcedResets).toBe(0);
    // Every restart/reset tick is in the recording. Production replay must reproduce bytes
    // and all counters, including the full reset and faults before checkpoint one.
    const replay = createProductionSim('flat-test', 'rookie', 19, 120);
    replay.run(iterateFrames(loaded.recorder.toRecording()));
    expect(equalProductionSnapshots(loaded.sim.snap(), replay.snap())).toBe(true);
    expect(verifySessionReplay(loaded)).toEqual({ verified: true, faults: 2 });
  });

  it.each(['rookie', 'pro'] as const)('roundtrips %s physics bytes and header stamps without losing negative zero', async bike => {
    const s = await session(bike);
    play(s, 'c4 g4 gf2 c2');
    saveSession(s);
    const loaded = await loadSession(s.dir);
    expect(loaded.state.recording.header).toMatchObject({ trackId: 'flat-test', seed: 19, physicsHz: 120, physics: 'v2', bike });
    expect(loaded.state.physics).toBe('production-Game-v2');
    expect(equalProductionSnapshots(loaded.sim.snap(), s.sim.snap())).toBe(true);
    const diagnostic = s.sim.snap();
    diagnostic.physics.f64[0] = -0;
    const restored = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(diagnostic))));
    expect(Object.is(restored.physics.f64[0], -0)).toBe(true);
    expect(equalProductionSnapshots(restored, diagnostic)).toBe(true);
  });

  it('rejects legacy, changed-source and incompatible header sessions without rewriting old evidence', async () => {
    const s = await session();
    saveSession(s);
    const file = path.join(s.dir, 'state.json');
    const original = fs.readFileSync(file, 'utf8');
    const variants = [
      { schema: 1 }, { srcFingerprint: 'stale' }, { physics: 'bikePhysicsFactory-v2' },
      { recording: { ...s.state.recording, header: { ...s.state.recording.header, physicsHz: 60 } } },
      { recording: { ...s.state.recording, header: { ...s.state.recording.header, seed: 20 } } },
      { recording: { ...s.state.recording, header: { ...s.state.recording.header, bike: 'pro' } } },
      { recording: { ...s.state.recording, header: { ...s.state.recording.header, physics: 'v1' } } },
    ];
    for (const change of variants) {
      const bytes = JSON.stringify({ ...JSON.parse(original), ...change });
      fs.writeFileSync(file, bytes);
      await expect(loadSession(s.dir)).rejects.toThrow(/incompatible|changed|does not match/);
      expect(fs.readFileSync(file, 'utf8')).toBe(bytes);
    }
  });
});

describe('stranger binary hop', () => {
  it('accounts for six slots and records exactly 36 gas-back, 32 gas-forward, 12 off-back and 10 neutral ticks', () => {
    const id = parseSlots('h')[0]!;
    expect(ACTIONS[id]!.slots).toBe(6);
    expect(macroTicks(id)).toBe(90);
    const frames = Array.from({ length: 90 }, (_, i) => macroFrameAt(id, i, () => { throw new Error('open-loop hop must not read hidden state'); }, {}));
    expect(frames).toEqual([
      ...Array(36).fill(quantizeInput({ throttle: 1, lean: -1 })),
      ...Array(32).fill(quantizeInput({ throttle: 1, lean: 1 })),
      ...Array(12).fill(quantizeInput({ lean: -1 })),
      ...Array(10).fill(COAST),
    ]);
    expect(parseSlots('h6 c4')).toHaveLength(10);
    expect(() => parseSlots('h7')).toThrow('42 > 40');
  });

  it('production Rookie hop clears BOTH tyre bottoms above .45 m, lands and has zero faults', async () => {
    const s = await session();
    play(s, 'c4'); // settled flat start, 60 actual production ticks
    const id = parseSlots('h')[0]!;
    let apex = 0, flightTicks = 0, maxFlightTicks = 0, confirmedFlight = false, landed = false;
    for (let i = 0; i < 360; i++) {
      tick(s, i < macroTicks(id) ? macroFrameAt(id, i, () => s.sim.state(), {}) : COAST);
      const state = s.sim.state();
      // This track's actual floor is y=0 and the real tyre radius is .34 m. Grounded
      // flag flicker during preload cannot manufacture airborne clearance.
      const clearance = Math.min(state.wheels.front.pos.y, state.wheels.rear.pos.y) - .34;
      apex = Math.max(apex, clearance);
      flightTicks = clearance > .02 ? flightTicks + 1 : 0;
      maxFlightTicks = Math.max(maxFlightTicks, flightTicks);
      if (flightTicks >= 6) confirmedFlight = true;
      if (confirmedFlight && (state.wheels.front.grounded || state.wheels.rear.grounded)) landed = true;
    }
    expect(apex).toBeGreaterThan(.45);
    expect(maxFlightTicks / 120).toBeGreaterThanOrEqual(.35);
    expect(landed).toBe(true);
    expect(s.sim.faults()).toBe(0);
    expect(s.sim.phase()).toBe('riding');
    const display = await session();
    const result = play(display, 'c4 h c8').result;
    expect(result.slotsRequested).toBe(18);
    expect(result.slotsPlayed).toBe(18);
  });
});
