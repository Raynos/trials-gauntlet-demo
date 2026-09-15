import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { iterateFrames, quantizeInput, type InputRecording } from '../../core/replay';
import type { PhysicsSnapshot, PhysicsState } from '../../core/types';
import { Game } from '../../game/game';
import type { GameRenderer } from '../../render';
import { makeTrack } from '../testTracks';
import { createBikePhysicsV2, NSCALAR } from './bike';
import { BIKE_GEOMETRY_V2 as G } from './tuning';

interface PositionProbe {
  positionPass(): void;
  nC: number;
}
function jointErrors(state: PhysicsState): [number, number] {
  const c = Math.cos(state.bike.angle), s = Math.sin(state.bike.angle);
  const local = (p: { x: number; y: number }) => ({ x: (p.x - state.bike.pos.x) * c + (p.y - state.bike.pos.y) * s - G.chassisToAxle.x, y: -(p.x - state.bike.pos.x) * s + (p.y - state.bike.pos.y) * c - G.chassisToAxle.y });
  const rear = local(state.wheels.rear.pos), front = local(state.wheels.front.pos);
  return [Math.abs(Math.hypot(rear.x - G.swingPivot.x, rear.y - G.swingPivot.y) - G.swingRadius), Math.abs((front.x - 0.65) * G.forkAxis.y - front.y * G.forkAxis.x)];
}
function velocityBytes(snapshot: PhysicsSnapshot): Uint8Array {
  const n = (snapshot.f64.length - NSCALAR) / 8;
  const values = new Float64Array(3 * n);
  for (const [index, column] of [2, 3, 5].entries()) values.set(snapshot.f64.subarray(NSCALAR + column * n, NSCALAR + (column + 1) * n), index * n);
  return new Uint8Array(values.buffer);
}
function weightedAssemblyPosition(snapshot: PhysicsSnapshot): [number, number] {
  const n = (snapshot.f64.length - NSCALAR) / 8;
  const result: [number, number] = [0, 0];
  for (let body = 0; body < 4; body++) for (let axis = 0; axis < 2; axis++) result[axis] = result[axis]! + snapshot.f64[NSCALAR + axis * n + body]! / snapshot.f64[NSCALAR + 6 * n + body]!;
  return result;
}

describe('coupled wheel/contact/rider position projection', () => {
  it('closes free assembly joints without moving its COM or changing any velocity bytes', () => {
    const world = createBikePhysicsV2(120);
    world.loadTrack(makeTrack(), 17);
    const saved = world.snapshot(), n = (saved.f64.length - NSCALAR) / 8;
    for (let body = 0; body < 4; body++) {
      saved.f64[NSCALAR + n + body] = saved.f64[NSCALAR + n + body]! + 20;
      for (const column of [2, 3, 5]) saved.f64[NSCALAR + column * n + body] = 0.7 * (body + 1) - column;
    }
    saved.f64[NSCALAR + 1] = saved.f64[NSCALAR + 1]! + 0.03;
    saved.f64[NSCALAR + 2] = saved.f64[NSCALAR + 2]! - 0.02;
    saved.f64[NSCALAR + n + 3] = saved.f64[NSCALAR + n + 3]! + 0.1;
    world.restore(saved);
    const probe = world as unknown as PositionProbe;
    probe.nC = 0;
    const before = world.snapshot(), com = weightedAssemblyPosition(before);
    expect(Math.max(...jointErrors(world.getState()))).toBeGreaterThan(0.01);
    probe.positionPass();
    expect(Math.max(...jointErrors(world.getState()))).toBeLessThan(2e-6);
    const after = world.snapshot(), correctedCOM = weightedAssemblyPosition(after);
    expect(correctedCOM[0]).toBeCloseTo(com[0], 10);
    expect(correctedCOM[1]).toBeCloseTo(com[1], 9);
    expect(velocityBytes(after)).toEqual(velocityBytes(before));
  });

  it('keeps a floor impact outside contact slop while the physical hinge and fork remain closed', () => {
    const world = createBikePhysicsV2(120);
    world.loadTrack(makeTrack({ finishX: 1e9 }), 29);
    const saved = world.snapshot(), n = (saved.f64.length - NSCALAR) / 8;
    for (let body = 0; body < 4; body++) {
      saved.f64[NSCALAR + n + body] = saved.f64[NSCALAR + n + body]! + 0.3;
      saved.f64[NSCALAR + 3 * n + body] = -4;
    }
    world.restore(saved);
    const probe = world as unknown as PositionProbe, project = probe.positionPass.bind(probe);
    let projected = 0, contacts = 0;
    probe.positionPass = () => {
      const before = world.snapshot();
      contacts += probe.nC;
      project();
      expect(velocityBytes(world.snapshot())).toEqual(velocityBytes(before));
      projected++;
    };
    for (let tick = 0; tick < 100; tick++) {
      world.step(quantizeInput({}));
      const state = world.getState();
      expect(Math.max(...jointErrors(state))).toBeLessThan(2e-5);
      for (const wheel of [state.wheels.rear, state.wheels.front]) expect(wheel.pos.y - world.tuning.wheel.radius).toBeGreaterThanOrEqual(-world.tuning.solver.slop - 2e-5);
    }
    expect(projected).toBe(100);
    expect(contacts).toBeGreaterThan(20);
  });

  it('production B3 and moving M3 contacts preserve joint closure and byte-identical replay', () => {
    for (const path of ['../../../harness/inputs/b3-kicker-row/bot-3.json', '../../../harness/inputs/m3-see-saw/bot-3-pro.json']) {
      const recording = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as InputRecording;
      const world = createBikePhysicsV2(120);
      const game = new Game({ physics: world, renderer: { setTrack() {}, onEvent() {}, setQuality() {}, setBikeClass() {} } as unknown as GameRenderer, physicsHz: 120, autoSkipCountdown: true, autoRecord: false, ghostEnabled: false });
      game.loadTrack(recording.header.trackId, recording.header.seed, recording.header.bike ?? 'rookie');
      const saved = game.snapshot(), counters = game.counters();
      let first: ReturnType<typeof game.snapshot> | undefined, firstCounters: ReturnType<typeof game.counters> | undefined;
      for (let run = 0; run < 2; run++) {
        game.restore(saved); game.restoreCounters(counters);
        let worst = 0;
        for (const input of iterateFrames(recording)) {
          game.setInput(input); game.step(1);
          worst = Math.max(worst, ...jointErrors(game.getState()));
        }
        // The original two isolated passes left millimetres of drift. A 0.2mm mechanical
        // budget covers the bounded solve through crash contacts without fitting the renderer.
        expect(worst, path).toBeLessThan(2e-4);
        const snapshot = game.snapshot();
        if (first) {
          expect(new Uint8Array(snapshot.f64.buffer)).toEqual(new Uint8Array(first.f64.buffer));
          expect(snapshot.u8).toEqual(first.u8);
          expect(game.counters()).toEqual(firstCounters);
        }
        first = snapshot; firstCounters = game.counters();
      }
    }
  });
});
