import { describe, expect, it } from 'vitest';
import { StateHasher } from '../../core/hash';
import { Rng } from '../../core/rng';
import { ModelDriver } from '../driver';
import { PACKED_LENGTH, TK, createParams } from '../params';
import { GAUNTLET, blankState, gauntletScript } from '../tools/fixture';
import { applyEvent } from './events';
import { createScratch, mapParams } from './mapParams';

function runGauntlet(): { hash: string; driver: ModelDriver; kinds: number[] } {
  const driver = new ModelDriver();
  driver.setTrack(null, 7);
  const script = gauntletScript(60);
  const h = new StateHasher();
  const kinds: number[] = [];
  const updates = Math.ceil(GAUNTLET.end * 60);
  for (let u = 0; u < updates; u++) {
    const state = script(u, u / 60, (e) => driver.onEvent(e));
    const packed = driver.update(state, 1 / 60, undefined);
    for (let i = 0; i < PACKED_LENGTH; i++) h.number(packed[i]!);
    for (let i = 0; i < driver.params.transientCount; i++) kinds.push(driver.params.transients[i]!.kind);
    driver.flush();
  }
  return { hash: h.digest(), driver, kinds };
}

describe('mapParams (pure model)', () => {
  it('produces a golden stream hash for the gauntlet fixture', () => {
    const a = runGauntlet();
    const b = runGauntlet();
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toBe('eea714701daae4d1');
  });

  it('emits every transient family across the gauntlet in causal order', () => {
    const { kinds } = runGauntlet();
    const first = (k: number): number => kinds.indexOf(k);
    expect(kinds.filter((k) => k === TK.countdown)).toHaveLength(3);
    expect(first(TK.countdown)).toBeLessThan(first(TK.go));
    expect(first(TK.go)).toBeLessThan(first(TK.skidChirp));
    expect(first(TK.skidChirp)).toBeLessThan(first(TK.landing));
    expect(first(TK.landing)).toBeLessThan(first(TK.bottomOut));
    expect(first(TK.bottomOut)).toBeLessThan(first(TK.impact));
    expect(first(TK.impact)).toBeLessThan(first(TK.restart));
    expect(first(TK.restart)).toBeLessThan(first(TK.starter));
    expect(first(TK.starter)).toBeLessThan(first(TK.plank)); // wood deck joints after the respawn
    expect(first(TK.plank)).toBeLessThan(first(TK.checkpoint));
    expect(first(TK.checkpoint)).toBeLessThan(first(TK.tick)); // metal ridges after the checkpoint
    expect(first(TK.checkpoint)).toBeLessThan(first(TK.finishTick));
    expect(kinds.filter((k) => k === TK.fanfare)).toHaveLength(4);
    expect(kinds.filter((k) => k === TK.firework)).toHaveLength(5);
    expect(kinds).toContain(TK.grunt);
    expect(kinds).toContain(TK.fault);
    expect(kinds).toContain(TK.debris);
  });

  it('passes physics rpm/throttle/limiter straight through', () => {
    const out = createParams();
    const s = blankState();
    s.engine = { rpm: 7321, throttleEff: 0.42, limiter: true };
    mapParams(out, s, undefined, 1 / 60, createScratch(), new Rng(1));
    expect(out.rpm).toBe(7321);
    expect(out.load).toBeCloseTo(0.42);
    expect(out.limiter).toBe(1);
    expect(out.engineGain).toBe(1);
  });

  it('mutes tyres when airborne and maps surfaces to indices', () => {
    const out = createParams();
    const s = blankState();
    s.wheels.rear.spinVel = 10 / 0.34;
    s.wheels.front.spinVel = 10 / 0.34;
    s.contacts = { rear: 'wood', front: null };
    s.wheels.front.grounded = false;
    mapParams(out, s, undefined, 1 / 60, createScratch(), new Rng(1));
    expect(out.tyreSurface[0]).toBe(1);
    expect(out.tyreSurface[1]).toBe(-1);
    expect(out.tyreSpeed[0]).toBeCloseTo(10);
    expect(out.tyreSpeed[1]).toBe(0);
    expect(out.chainHz).toBeCloseTo((10 / 0.34 / (2 * Math.PI)) * 42);
  });

  it('never fires an edge on the first update after a restart', () => {
    const out = createParams();
    const scratch = createScratch();
    const rng = new Rng(3);
    const s = blankState();
    s.wheels.rear.compression = 0.99;
    s.wheels.front.compression = 0.99;
    mapParams(out, s, undefined, 1 / 60, scratch, rng);
    expect(out.transientCount).toBe(0);
    // steady, then a bottom-out edge fires exactly once
    s.time = 1 / 60;
    s.wheels.rear.compression = 0.2;
    mapParams(out, s, undefined, 1 / 60, scratch, rng);
    s.time = 2 / 60;
    s.wheels.rear.compression = 0.99;
    out.transientCount = 0;
    mapParams(out, s, undefined, 1 / 60, scratch, rng);
    const kinds = out.transients.slice(0, out.transientCount).map((t) => t.kind);
    expect(kinds).toContain(TK.bottomOut);
    expect(kinds.filter((k) => k === TK.bottomOut)).toHaveLength(1);
  });

  it('stalls the engine within 450 ms of a crash (gain → 0, pitch sags) and restores it on restart', () => {
    const out = createParams();
    const scratch = createScratch();
    const rng = new Rng(9);
    const s = blankState();
    mapParams(out, s, undefined, 1 / 60, scratch, rng);
    applyEvent(out, { type: 'fault', reason: 'crash', tick: 0, time: 0 }, scratch, rng);
    s.time = 12 / 60;
    mapParams(out, s, undefined, 1 / 60, scratch, rng);
    expect(out.engineGain).toBeGreaterThan(0.3);
    expect(out.rpm).toBeLessThan(1500); // sagging while it dies
    for (let i = 13; i <= 30; i++) {
      s.time = i / 60;
      mapParams(out, s, undefined, 1 / 60, scratch, rng);
    }
    expect(out.engineGain).toBe(0);
    expect(out.rpm).toBeCloseTo(1500 * (1 - 0.55));
    expect(out.duckDb).toBe(0); // 500 ms > 300 ms hold
    applyEvent(out, { type: 'restart', checkpoint: -1, tick: 0 }, scratch, rng);
    s.time = 0;
    mapParams(out, s, undefined, 1 / 60, scratch, rng);
    expect(out.engineGain).toBe(1);
    expect(out.rpm).toBe(1500);
  });

  it('flags the slipping auto-clutch and the crashed-frame scrape', () => {
    const out = createParams();
    const scratch = createScratch();
    const rng = new Rng(5);
    const s = blankState();
    s.engine = { rpm: 3500, throttleEff: 1, limiter: false };
    for (let i = 0; i < 30; i++) {
      s.time = i / 60;
      mapParams(out, s, undefined, 1 / 60, scratch, rng);
    }
    expect(out.clutch).toBeGreaterThan(0.9);
    s.wheels.rear.spinVel = 10 / 0.34; // wheel caught up → engaged
    for (let i = 30; i < 60; i++) {
      s.time = i / 60;
      mapParams(out, s, undefined, 1 / 60, scratch, rng);
    }
    expect(out.clutch).toBeLessThan(0.05);
    expect(out.scrape).toBe(0);
    s.faulted = 'crash';
    s.ragdoll = [];
    s.bike.vel.x = 4;
    s.time = 61 / 60;
    mapParams(out, s, undefined, 1 / 60, scratch, rng);
    expect(out.scrape).toBeCloseTo(0.5);
  });

  it('scales landings by the 1.4 g impulse distribution and ignores wheel settling', () => {
    const out = createParams();
    const scratch = createScratch();
    const rng = new Rng(6);
    const s = blankState();
    mapParams(out, s, undefined, 1 / 60, scratch, rng);
    const gainFor = (impulse: number): number => {
      out.transientCount = 0;
      applyEvent(out, { type: 'land', impulse, wheel: 'rear', surface: 'dirt', tick: 0 }, scratch, rng);
      return out.transientCount ? out.transients[0]!.gain : 0;
    };
    expect(gainFor(3)).toBe(0);
    expect(gainFor(10)).toBeGreaterThan(0.15);
    expect(gainFor(10)).toBeLessThan(0.35);
    expect(gainFor(60)).toBeGreaterThan(0.6);
    expect(gainFor(60)).toBeLessThan(0.75);
    expect(gainFor(210)).toBe(1);
  });

  it('requests -6 dB ducking for 300 ms after a crash and -3 dB after UI beats', () => {
    const out = createParams();
    const scratch = createScratch();
    const rng = new Rng(2);
    const s = blankState();
    mapParams(out, s, undefined, 1 / 60, scratch, rng);
    applyEvent(out, { type: 'checkpoint', index: 0, tick: 0, time: 0 }, scratch, rng);
    s.time = 1 / 60;
    mapParams(out, s, undefined, 1 / 60, scratch, rng);
    expect(out.duckDb).toBe(3);
    applyEvent(out, { type: 'fault', reason: 'crash', tick: 0, time: 0 }, scratch, rng);
    s.time = 2 / 60;
    mapParams(out, s, undefined, 1 / 60, scratch, rng);
    expect(out.duckDb).toBe(9);
  });

  it('emits one plank thud per 0.24 m board joint on wood, sample-placed inside the update', () => {
    const out = createParams();
    const scratch = createScratch();
    const rng = new Rng(8);
    const s = blankState();
    s.contacts = { rear: 'wood', front: 'wood' };
    s.wheels.rear.spinVel = 10 / 0.34;
    s.wheels.front.spinVel = 10 / 0.34;
    s.bike.vel.x = 10;
    let planks = 0;
    let maxDelay = 0;
    for (let i = 0; i < 61; i++) {
      s.time = i / 60;
      out.transientCount = 0;
      mapParams(out, s, undefined, 1 / 60, scratch, rng);
      for (let k = 0; k < out.transientCount; k++) {
        const t = out.transients[k]!;
        if (t.kind === TK.plank) {
          planks++;
          maxDelay = Math.max(maxDelay, t.delay);
        }
      }
    }
    // two wheels × 10 m/s ÷ 0.24 m ≈ 83 joints per second
    expect(planks).toBeGreaterThan(78);
    expect(planks).toBeLessThan(88);
    expect(maxDelay).toBeGreaterThan(0);
    expect(maxDelay).toBeLessThanOrEqual(1 / 60);
  });

  it('is allocation-stable: the transient pool identity never changes', () => {
    const driver = new ModelDriver();
    const pool = driver.params.transients;
    const script = gauntletScript(60);
    for (let u = 0; u < 2000; u++) {
      driver.update(script(u % 1020, (u % 1020) / 60, (e) => driver.onEvent(e)), 1 / 60, undefined);
      driver.flush();
    }
    expect(driver.params.transients).toBe(pool);
    expect(driver.params.transients).toHaveLength(pool.length);
  });
});
