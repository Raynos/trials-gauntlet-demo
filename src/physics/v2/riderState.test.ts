import { describe, expect, it } from 'vitest';
import { quantizeInput } from '../../core/replay';
import type { PhysicsSnapshot, RiderBody } from '../../core/types';
import { drumTrack, makeTrack, seesawTrack } from '../testTracks';
import { createBikePhysicsV2, NSCALAR } from './bike';

/** Snapshot contract: eight SoA columns (px, py, vx, vy, angle, angVel, im, ii);
 * body 3 is the rider. Read raw slots independently of getState/debug. */
function riderSlots(snapshot: PhysicsSnapshot): RiderBody {
  const n = (snapshot.f64.length - NSCALAR) / 8;
  const at = (column: number): number => snapshot.f64[NSCALAR + column * n + 3]!;
  return { pos: { x: at(0), y: at(1) }, vel: { x: at(2), y: at(3) }, angle: at(4), angVel: at(5) };
}

function expectSnapshotUnchanged(before: PhysicsSnapshot, after: PhysicsSnapshot): void {
  expect(new Uint8Array(after.f64.buffer, after.f64.byteOffset, after.f64.byteLength))
    .toEqual(new Uint8Array(before.f64.buffer, before.f64.byteOffset, before.f64.byteLength));
  expect(after.u8).toEqual(before.u8);
}

const inputAt = (tick: number) => quantizeInput({ throttle: .7, lean: tick < 30 ? -.6 : .5 });

describe('V2 simulated rider body export', () => {
  for (const bike of ['rookie', 'pro'] as const) {
    it(`${bike}: publishes the finite rider body from raw snapshot slots at spawn and during motion`, () => {
      // Dynamic bodies change the SoA stride; the rider still occupies body 3.
      for (const track of [makeTrack(), drumTrack(), seesawTrack()]) {
        const world = createBikePhysicsV2(120);
        world.loadTrack(track, 7, { bike });
        for (let tick = 0; tick <= 60; tick++) {
          const body = world.getState().riderBody;
          expect(body).toBeDefined();
          expect(body).toEqual(riderSlots(world.snapshot()));
          expect(body).toEqual(world.debug().rider.body);
          for (const value of [body!.pos.x, body!.pos.y, body!.vel.x, body!.vel.y, body!.angle, body!.angVel]) {
            expect(Number.isFinite(value)).toBe(true);
          }
          if (tick < 60) world.step(inputAt(tick));
        }
      }
    });
  }

  it('exports world coordinates and signed velocities exactly, without changing solver bytes', () => {
    const world = createBikePhysicsV2(120);
    world.loadTrack(drumTrack(), 11);
    const snapshot = world.snapshot();
    const n = (snapshot.f64.length - NSCALAR) / 8;
    // Distinct values reject chassis/target/local-space substitutions and sign changes.
    const values = [41.25, 6.5, -3.75, 1.125, -.8, 2.5];
    values.forEach((value, column) => { snapshot.f64[NSCALAR + column * n + 3] = value; });
    world.restore(snapshot);
    const before = world.snapshot();
    for (let i = 0; i < 5; i++) {
      expect(world.getState().riderBody).toEqual({ pos: { x: 41.25, y: 6.5 }, vel: { x: -3.75, y: 1.125 }, angle: -.8, angVel: 2.5 });
    }
    expectSnapshotUnchanged(before, world.snapshot());
  });

  it('returns detached nested data that survives later steps and cannot mutate the solver', () => {
    const world = createBikePhysicsV2(120);
    world.loadTrack(makeTrack(), 17);
    for (let tick = 0; tick < 60; tick++) world.step(inputAt(tick));
    const held = world.getState().riderBody!;
    const copy = structuredClone(held);
    const second = world.getState().riderBody!;
    expect(second).not.toBe(held);
    expect(second.pos).not.toBe(held.pos);
    expect(second.vel).not.toBe(held.vel);
    for (let tick = 0; tick < 20; tick++) world.step(inputAt(tick));
    expect(held).toEqual(copy);
    expect(world.getState().riderBody).not.toEqual(copy);
    const before = world.snapshot();
    held.pos.x = 1e6;
    held.vel.y = -1e6;
    held.angle = 10;
    held.angVel = 100;
    expectSnapshotUnchanged(before, world.snapshot());
    expect(world.getState().riderBody).toEqual(riderSlots(before));
  });

  it('restores identical exported fields and reproduces the following rider trajectory', () => {
    const world = createBikePhysicsV2(120);
    world.loadTrack(seesawTrack(), 23, { bike: 'pro' });
    for (let tick = 0; tick < 90; tick++) world.step(inputAt(tick));
    const saved = world.snapshot();
    const bodyAtSave = world.getState().riderBody;
    const expected: RiderBody[] = [];
    for (let tick = 0; tick < 45; tick++) {
      world.step(inputAt(tick));
      expected.push(world.getState().riderBody!);
    }
    world.restore(saved);
    expect(world.getState().riderBody).toEqual(bodyAtSave);
    expect(world.getState().riderBody).toEqual(riderSlots(saved));
    for (let tick = 0; tick < expected.length; tick++) {
      world.step(inputAt(tick));
      expect(world.getState().riderBody).toEqual(expected[tick]);
    }
  });
});
