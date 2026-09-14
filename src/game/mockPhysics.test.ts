import { describe, expect, it } from 'vitest';
import { hashPhysicsState } from '../core/hash';
import { quantizeInput } from '../core/replay';
import { FLAT_TEST_TRACK, compileTrack } from '../tracks';

const COMPILED = compileTrack(FLAT_TEST_TRACK);
import { MockPhysics } from './mockPhysics';

function run(seed: number, ticks: number): { hash: string; finish: number | null; events: string[] } {
  const p = new MockPhysics(120);
  p.loadTrack(COMPILED, seed);
  const events: string[] = [];
  for (let i = 0; i < ticks; i++) {
    const t = i / 120;
    p.step(quantizeInput({ throttle: 1, lean: Math.sin(t), hop: i === 300 }));
    for (const e of p.drainEvents()) events.push(e.type);
  }
  return { hash: hashPhysicsState(p.getState()), finish: p.getState().finishTime, events };
}

describe('MockPhysics', () => {
  it('is deterministic across instances', () => {
    const a = run(1, 2400);
    const b = run(1, 2400);
    expect(a.hash).toBe(b.hash);
    expect(a.events).toEqual(b.events);
  });

  it('reaches checkpoints and the finish under full throttle', () => {
    const r = run(1, 2400);
    expect(r.events).toContain('checkpoint');
    expect(r.events).toContain('finish');
    expect(r.finish).not.toBeNull();
    expect(r.finish!).toBeGreaterThan(5);
    expect(r.finish!).toBeLessThan(20);
  });

  it('restart edge resets to the last checkpoint and emits a fault', () => {
    const p = new MockPhysics(120);
    p.loadTrack(COMPILED, 5);
    for (let i = 0; i < 900; i++) p.step(quantizeInput({ throttle: 1 }));
    const cp = p.getState().checkpoint;
    expect(cp).toBeGreaterThanOrEqual(0);
    p.drainEvents();
    p.step(quantizeInput({ restart: true }));
    const ev = p.drainEvents().map((e) => e.type);
    expect(ev).toEqual(['fault', 'restart']);
    const s = p.getState();
    expect(s.tick).toBe(0);
    expect(s.checkpoint).toBe(cp);
    expect(s.bike.pos.x).toBeCloseTo(FLAT_TEST_TRACK.checkpoints[cp]!.spawn.pos.x);
  });

  it('getState returns a defensive copy', () => {
    const p = new MockPhysics(120);
    p.loadTrack(COMPILED, 1);
    const s = p.getState();
    s.bike.pos.x = 999;
    expect(p.getState().bike.pos.x).not.toBe(999);
  });
});
