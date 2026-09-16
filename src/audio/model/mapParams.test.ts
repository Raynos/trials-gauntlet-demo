import { describe, expect, it } from 'vitest';
import { StateHasher } from '../../core/hash';
import { Rng } from '../../core/rng';
import { ModelDriver } from '../driver';
import { PACKED_LENGTH, TK, createParams } from '../params';
import { GAUNTLET, blankState, gauntletScript } from '../tools/fixture';
import type { CompiledTrack, PhysicsState } from '../../core/types';
import { applyEvent } from './events';
import { SCENE_MENU, SCENE_RESULTS, SCENE_RUN, createScratch, crowdDensity, mapParams, standsOf } from './mapParams';

type PhysicsHop = PhysicsState['hopPhase'];

/** Start at 0, one checkpoint at 120 m, finish at 200 m. */
function fakeTrack(): CompiledTrack {
  return {
    def: { start: { pos: { x: 0, y: 0 }, angle: 0 }, checkpoints: [{ x: 120, spawn: { pos: { x: 120, y: 0 }, angle: 0 } }], finishX: 200 },
  } as unknown as CompiledTrack;
}

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
    expect(a.hash).toBe('51351dbc623cc60f');
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

  it('stalls the engine within 500 ms of a crash (the crank runs down to 150 rpm under a gain that holds then falls) and restores it on restart', () => {
    const out = createParams();
    const scratch = createScratch();
    const rng = new Rng(9);
    const s = blankState();
    mapParams(out, s, undefined, 1 / 60, scratch, rng);
    applyEvent(out, { type: 'fault', reason: 'crash', tick: 0, time: 0 }, scratch, rng);
    s.time = 12 / 60;
    mapParams(out, s, undefined, 1 / 60, scratch, rng);
    expect(out.engineGain).toBeGreaterThan(0.8); // 1 − k² holds the level while the putts slow
    expect(out.rpm).toBeLessThan(1500 * 0.75); // the crank already running down (200 ms: 1500 → 960)
    for (let i = 13; i <= 30; i++) {
      s.time = i / 60;
      mapParams(out, s, undefined, 1 / 60, scratch, rng);
    }
    expect(out.engineGain).toBe(0);
    expect(out.rpm).toBe(150); // max(150, 1500 × (1 − 0.9))
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

  it('scales landings by the v2 impulse distribution (p50 10 → 0.34, 2 m drop 42–59 → ≥ 0.8) and ignores wheel settling', () => {
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
    expect(gainFor(10)).toBeGreaterThan(0.3);
    expect(gainFor(10)).toBeLessThan(0.4);
    expect(gainFor(20)).toBeGreaterThan(0.48);
    expect(gainFor(20)).toBeLessThan(0.56);
    expect(gainFor(42)).toBeGreaterThan(0.78);
    expect(gainFor(60)).toBe(1);
    expect(gainFor(210)).toBe(1);
  });

  // ---- round 3: v2 retune, crowd, scene -------------------------------------------------------------------

  it('torque follows the class thrust curve at the rim speed (Rookie knot 1.07 → 1 at 5 m/s, 0.7 at 12, 0.35 at 20)', () => {
    const out = createParams();
    const scratch = createScratch();
    const rng = new Rng(1);
    const s = blankState();
    s.engine.throttleEff = 1;
    const at = (v: number, bike = 0): number => {
      scratch.bike = bike;
      s.wheels.rear.spinVel = v / 0.34;
      s.bike.vel.x = v;
      s.time += 1 / 60;
      mapParams(out, s, undefined, 1 / 60, scratch, rng);
      return out.torque;
    };
    expect(at(1)).toBeCloseTo(1, 5);
    expect(at(5)).toBeCloseTo(1 / 1.07, 3);
    expect(at(12)).toBeCloseTo(0.7 / 1.07, 3);
    expect(at(20)).toBe(0);
    expect(at(1, 1)).toBeCloseTo(1, 5);
    expect(at(21, 1)).toBe(0);
    expect(out.bike).toBe(1);
    s.engine.throttleEff = 0.5;
    expect(at(1)).toBeCloseTo(0.5, 5);
  });

  it('the Rookie wheelie control is silent: rpm and throttleEff pass through untouched while the front lifts', () => {
    const out = createParams();
    const scratch = createScratch();
    const rng = new Rng(1);
    const s = blankState();
    s.engine.rpm = 6200;
    s.engine.throttleEff = 1;
    s.wheels.front.grounded = false;
    s.wheels.front.compression = 0;
    s.contacts.front = null;
    s.bike.angVel = 1.0;
    s.bike.angle = 0.6;
    s.time = 1 / 60;
    mapParams(out, s, undefined, 1 / 60, scratch, rng);
    expect(out.rpm).toBe(6200);
    expect(out.load).toBe(1);
    expect(out.limiter).toBe(0);
    expect(out.engineGain).toBe(1);
  });

  it('flags the v2 slipping clutch (rpm at 3500 under throttle below 7 m/s) and drops it past 7 m/s', () => {
    const out = createParams();
    const scratch = createScratch();
    const rng = new Rng(1);
    const s = blankState();
    s.engine.throttleEff = 1;
    s.engine.rpm = 3500;
    for (let i = 1; i <= 30; i++) {
      s.wheels.rear.spinVel = 6.5 / 0.34;
      s.bike.vel.x = 6.5;
      s.time = i / 60;
      mapParams(out, s, undefined, 1 / 60, scratch, rng);
    }
    expect(out.clutch).toBeGreaterThan(0.95);
    for (let i = 31; i <= 60; i++) {
      s.wheels.rear.spinVel = 7.5 / 0.34;
      s.bike.vel.x = 7.5;
      s.engine.rpm = 3750;
      s.time = i / 60;
      mapParams(out, s, undefined, 1 / 60, scratch, rng);
    }
    expect(out.clutch).toBeLessThan(0.05);
  });

  it('the hop: a preload creak on idle → preload and one snap on preload → push, nothing on recover', () => {
    const out = createParams();
    const scratch = createScratch();
    const rng = new Rng(1);
    const s = blankState();
    const phases: PhysicsHop[] = ['idle', 'idle', 'preload', 'preload', 'preload', 'push', 'push', 'recover', 'idle'];
    const kinds: { kind: number; pitch: number }[] = [];
    phases.forEach((ph, i) => {
      s.hopPhase = ph;
      s.time = (i + 1) / 60;
      out.transientCount = 0;
      mapParams(out, s, undefined, 1 / 60, scratch, rng);
      for (let k = 0; k < out.transientCount; k++) if (out.transients[k]!.kind === TK.hop) kinds.push({ kind: TK.hop, pitch: out.transients[k]!.pitch });
    });
    expect(kinds).toEqual([
      { kind: TK.hop, pitch: 0 },
      { kind: TK.hop, pitch: 1 },
    ]);
  });

  it('crowd density: 1 at the start stands, ~0 sixty metres out, back up at a checkpoint and the finish', () => {
    const stands = standsOf(fakeTrack());
    expect(stands).toHaveLength(3);
    expect(crowdDensity(stands, 0)).toBe(1);
    expect(crowdDensity(stands, 8)).toBeGreaterThan(0.85);
    expect(crowdDensity(stands, 70)).toBeLessThan(0.1);
    expect(crowdDensity(stands, 123)).toBeGreaterThan(0.2);
    expect(crowdDensity(stands, 123)).toBeLessThan(0.35);
    expect(crowdDensity(stands, 200)).toBeGreaterThan(0.95);
  });

  it('crowd reactions: roar on GO, cheer only after ≥ 0.5 s of air, groan on a crash, applause at the finish; none out of earshot', () => {
    const run = (x: number): number[] => {
      const driver = new ModelDriver();
      driver.setTrack(fakeTrack(), 3);
      const s = blankState();
      s.bike.pos.x = x;
      const kinds: number[] = [];
      const upd = (): void => {
        s.time += 1 / 60;
        driver.update(s, 1 / 60, undefined);
        for (let i = 0; i < driver.params.transientCount; i++) kinds.push(driver.params.transients[i]!.kind);
        driver.flush();
      };
      upd();
      driver.onEvent({ type: 'go' });
      upd();
      // a short hop: 0.2 s of air, then a landing — no cheer
      s.wheels.rear.grounded = s.wheels.front.grounded = false;
      for (let i = 0; i < 12; i++) upd();
      s.wheels.rear.grounded = s.wheels.front.grounded = true;
      driver.onEvent({ type: 'land', impulse: 30, wheel: 'rear', surface: 'dirt', tick: 0 });
      upd();
      // a real flight: 0.7 s, then a landing — cheer
      s.wheels.rear.grounded = s.wheels.front.grounded = false;
      for (let i = 0; i < 42; i++) upd();
      s.wheels.rear.grounded = s.wheels.front.grounded = true;
      driver.onEvent({ type: 'land', impulse: 30, wheel: 'rear', surface: 'dirt', tick: 0 });
      upd();
      driver.onEvent({ type: 'fault', reason: 'crash', tick: 0, time: s.time });
      upd();
      driver.onEvent({ type: 'restart', checkpoint: -1, tick: 0 });
      upd();
      driver.onEvent({ type: 'finish', tick: 0, time: s.time });
      upd();
      return kinds;
    };
    const near = run(0);
    expect(near.filter((k) => k === TK.crowdRoar)).toHaveLength(1);
    expect(near.filter((k) => k === TK.crowdCheer)).toHaveLength(1);
    expect(near.filter((k) => k === TK.crowdGroan)).toHaveLength(1);
    expect(near.filter((k) => k === TK.crowdApplause)).toHaveLength(1);
    const far = run(70);
    expect(far.filter((k) => k === TK.crowdRoar || k === TK.crowdCheer || k === TK.crowdGroan)).toHaveLength(0);
    // the finish always gets a thin applause, scaled down
    expect(far.filter((k) => k === TK.crowdApplause)).toHaveLength(1);
  });

  it('ragdoll sensors: at most 3 body thuds inside 1.2 s of the crash, from real decelerations only', () => {
    const driver = new ModelDriver();
    driver.setTrack(null, 3);
    const s = blankState();
    const bodies: NonNullable<typeof s.ragdoll> = (['head', 'torso', 'pelvis', 'upperArm', 'forearm', 'thigh', 'shin'] as const).map((id) => ({ id, pos: { x: 0, y: 2 }, angle: 0 }));
    let thuds = 0;
    const upd = (): void => {
      s.time += 1 / 60;
      driver.update(s, 1 / 60, undefined);
      for (let i = 0; i < driver.params.transientCount; i++) if (driver.params.transients[i]!.kind === TK.bodyThud) thuds++;
      driver.flush();
    };
    upd();
    driver.onEvent({ type: 'fault', reason: 'crash', tick: 0, time: s.time });
    s.faulted = 'crash';
    s.ragdoll = bodies;
    // every body falls at 6 m/s for 6 frames, then stops dead (7 candidate impacts → capped at 3)
    for (let f = 0; f < 6; f++) {
      for (const b of bodies) b.pos.y -= 0.1;
      upd();
    }
    for (let f = 0; f < 10; f++) upd();
    expect(thuds).toBe(3);
  });

  it('scene: menu until the countdown, run through the race, results 1.4 s after the finish, run again on restart; setScene overrides', () => {
    const driver = new ModelDriver();
    driver.setTrack(null, 3);
    const s = blankState();
    const step = (n = 1): number => {
      for (let i = 0; i < n; i++) {
        s.time += 1 / 60;
        driver.update(s, 1 / 60, undefined);
        driver.flush();
      }
      return driver.params.scene;
    };
    expect(step()).toBe(SCENE_MENU);
    driver.onEvent({ type: 'countdown', n: 3 });
    expect(step()).toBe(SCENE_RUN);
    driver.onEvent({ type: 'finish', tick: 0, time: s.time });
    expect(step(60)).toBe(SCENE_RUN);
    expect(step(30)).toBe(SCENE_RESULTS);
    driver.onEvent({ type: 'restart', checkpoint: -1, tick: 0 });
    expect(step()).toBe(SCENE_RUN);
    driver.setScene('menu');
    expect(step()).toBe(SCENE_MENU);
    driver.onEvent({ type: 'go' });
    expect(step()).toBe(SCENE_MENU);
    driver.setScene(null);
    expect(step()).toBe(SCENE_RUN);
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
