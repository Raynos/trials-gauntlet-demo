import { describe, expect, it } from 'vitest';
import { createProductionSim, equalProductionSnapshots } from '../lib/production-sim';
import { ACTION_BY_CODE, HOLD, macroFrameAt, macroTicks, type MacroCtx } from './actions';
import { motionCell, plan, selectFrontier } from './beam';
import { configFor } from './play';
import { DEFAULT_WEIGHTS, score } from './score';

const cfg = { ...configFor(3, 60_000), width: 16, depth: 4 };

describe('beam technique admission and physical diversity', () => {
  it('requires a real wheelie entry while preserving hold after a played launch', () => {
    const sim = createProductionSim('b1-first-ride', 'pro');
    const wh = ACTION_BY_CODE.get('wh')!, gb = ACTION_BY_CODE.get('gb')!;
    expect(plan(sim, cfg, DEFAULT_WEIGHTS, { allowed: [wh.id] }).actions).toEqual([]);
    // Enter with ordinary controls; no injected airborne pose or velocity.
    for (let tick = 0; tick < 90 && !wh.canStart!(sim.state()); tick++) sim.step(gb.frame);
    expect(sim.faults()).toBe(0);
    expect(wh.canStart!(sim.state())).toBe(true);
    const entry = sim.snap();
    const entryX = sim.state().bike.pos.x;
    const entrySpeed = sim.state().bike.vel.x;
    const p = plan(sim, cfg, DEFAULT_WEIGHTS, { allowed: [wh.id] });
    expect(p.actions).toEqual([wh.id]);
    expect(p.ticks).toBe(macroTicks(wh.id));
    expect(equalProductionSnapshots(entry, sim.snap())).toBe(true);
    const ctx: MacroCtx = {};
    let rearOnlyTicks = 0;
    for (let tick = 0; tick < macroTicks(wh.id); tick++) {
      sim.step(macroFrameAt(wh.id, tick, sim.state, ctx));
      if (sim.state().wheels.rear.grounded && !sim.state().wheels.front.grounded) rearOnlyTicks++;
    }
    expect(ctx.v0).toBe(entrySpeed);
    expect(sim.faults()).toBe(0);
    expect(rearOnlyTicks).toBeGreaterThan(macroTicks(wh.id) / 2);
    expect(sim.state().bike.pos.x).toBeGreaterThan(entryX);
  });

  it('never returns the unseen remainder of a technique at a short planning horizon', () => {
    const sim = createProductionSim('b1-first-ride', 'pro');
    const hop = ACTION_BY_CODE.get('h')!, gas = ACTION_BY_CODE.get('g')!;
    const root = sim.snap();
    const short = plan(sim, { ...cfg, depth: 1 }, DEFAULT_WEIGHTS, { allowed: [hop.id] });
    expect(short.ticks).toBe(HOLD);
    expect(short.actions).toEqual([]);
    const withAtomic = plan(sim, { ...cfg, depth: 1 }, DEFAULT_WEIGHTS, { allowed: [hop.id, gas.id] });
    expect(withAtomic.actions).toEqual([gas.id]);
    const complete = plan(sim, { ...cfg, depth: hop.slots }, DEFAULT_WEIGHTS, { allowed: [hop.id] });
    expect(complete.actions).toEqual([hop.id]);
    expect(complete.ticks).toBe(macroTicks(hop.id));
    expect(equalProductionSnapshots(root, sim.snap())).toBe(true);
  });

  it('retains physically distinct gas and forward-lean branches that the old cell merged', () => {
    const sim = createProductionSim('b1-first-ride', 'pro'), root = sim.snap();
    const states = ['g', 'gf'].map((code) => {
      sim.restore(root);
      const action = ACTION_BY_CODE.get(code)!;
      for (let tick = 0; tick < HOLD; tick++) sim.step(action.frame);
      return sim.state();
    });
    const gas = states[0]!, forward = states[1]!;
    const oldCell = (st: typeof gas) => [Math.round(st.bike.pos.x / cfg.cells[0]),
      Math.round(st.bike.vel.x / cfg.cells[1]), Math.round(st.bike.angle / cfg.cells[2]),
      st.wheels.rear.grounded || st.wheels.front.grounded];
    expect(oldCell(gas)).toEqual(oldCell(forward));
    expect(gas.bike.angVel).toBeGreaterThan(0);
    expect(forward.bike.angVel).toBeLessThan(0);
    expect(Math.abs(gas.riderBody!.angle - forward.riderBody!.angle)).toBeGreaterThan(0.1);
    expect(motionCell(gas, cfg, sim.hz)).not.toBe(motionCell(forward, cfg, sim.hz));
    // The distinction comes from the body's state, never an input label added to the key.
    const sameBody = { ...gas, input: forward.input, rider: forward.rider };
    expect(motionCell(gas, cfg, sim.hz)).toBe(motionCell(sameBody, cfg, sim.hz));
  });

  it('keeps a forward rider when faster rearward launch variants would fill the beam', () => {
    const sim = createProductionSim('b1-first-ride', 'pro'), root = sim.snap();
    const candidates = ['lb', 'h', 'gf'].map((code) => {
      sim.restore(root);
      const action = ACTION_BY_CODE.get(code)!, ctx = {};
      for (let tick = 0; tick < HOLD; tick++) sim.step(macroFrameAt(action.id, tick, sim.state, ctx));
      const state = sim.state();
      return { state, score: score(state, DEFAULT_WEIGHTS, sim.runTicks(), sim.hz) };
    });
    const forward = candidates[2]!;
    const byScore = [...candidates].sort((a, b) => b.score - a.score);
    expect(byScore.slice(0, 2)).not.toContain(forward);
    const selected = selectFrontier(candidates, { ...cfg, width: 2 }, sim.hz);
    expect(selected).toContain(forward);
    expect(selected[0]).toBe(byScore[0]);
    // Selection reserves a physical alternative; the winner's score is never rewritten.
    expect(selected.map((node) => node.score)).toEqual([...selected.map((node) => node.score)].sort((a, b) => b - a));
  });
});
