/**
 * §5 validators (tracks round 9) over every curriculum track: run-out, checkpoint spacing, the panic-drop rule on
 * beginner / easy, no see-saw over 22.6 deg, straight <= 17 deg lips below hard, hop rises in the v2 gas-hop band,
 * run-up jumps sized by the §0 curve, medal targets monotone. Each is a pure function in `validate.ts`; a fixture
 * per rule proves the rule fires on the shape it was written from.
 */
import { describe, expect, it } from 'vitest';
import { course } from './author';
import { CURRICULUM } from './index';
import { checkCheckpointSpacing, checkHopHeights, checkLips, checkMedalsMonotone, checkPanicDrop, checkRunout, checkRunupJumps, checkSeesaws, validateCourse } from './validate';

const fx = (id: string, tier: 'beginner' | 'easy' | 'medium' | 'hard' | 'extreme' = 'easy') =>
  course(id, id, tier).meta({ biome: 'industrial', technique: 'fixture', attemptsBand: [1, 5], targetTimeS: 30 }).camera({ mode: 'side' });

describe('§5 validators over the curriculum', () => {
  for (const t of CURRICULUM) {
    it(`${t.id} passes every per-track rule`, () => {
      expect(validateCourse(t)).toEqual([]);
    });
  }
  it('medal targets are non-decreasing through and across the tiers', () => {
    expect(checkMedalsMonotone(CURRICULUM)).toEqual([]);
  });
});

describe('each rule fires on the shape it was written from', () => {
  it('run-out: a track without the catch', () => {
    const d = fx('fx-runout').flat(20).checkpoint().flat(30).finish(30, { checkpointRule: false, catch: false });
    expect(checkRunout(d).length).toBeGreaterThan(0);
  });
  it('checkpoint spacing: two spawns 20 m apart', () => {
    const d = fx('fx-spacing').flat(20).checkpoint().flat(20).checkpoint().flat(60).finish(30, { checkpointRule: false });
    expect(checkCheckpointSpacing(d).some((m) => m.includes('CP0 -> CP1'))).toBe(true);
  });
  it('panic drop: a 1.0 m bare box edge on an easy track, and the same box onto an 8 x h ramp', () => {
    const bare = fx('fx-panic-bare').flat(20).checkpoint().flat(16).box({ width: 4, height: 1.0 }).flat(40).finish(30, { checkpointRule: false });
    expect(checkPanicDrop(bare).some((m) => m.includes('bare box edge'))).toBe(true);
    const ramped = fx('fx-panic-ramp').flat(20).checkpoint().flat(16).box({ width: 4, height: 1.0 }).ramp({ length: 8, height: 1.0, direction: 'down' }).flat(40).finish(30, { checkpointRule: false });
    expect(checkPanicDrop(ramped)).toEqual([]);
    const hard = fx('fx-panic-hard', 'hard').flat(20).checkpoint().flat(16).box({ width: 4, height: 1.0 }).flat(40).finish(30, { checkpointRule: false });
    expect(checkPanicDrop(hard)).toEqual([]); // the rule is a beginner / easy rule
  });
  it('see-saw: a 29 deg board fails, an 8 x 1.6 (22.6 deg) board passes', () => {
    const steep = fx('fx-seesaw-29', 'medium').flat(20).checkpoint().flat(16).seesaw({ length: 8, height: 2.0 }).flat(40).finish(30, { checkpointRule: false });
    expect(checkSeesaws(steep).length).toBe(1);
    const ok = fx('fx-seesaw-22', 'medium').flat(20).checkpoint().flat(16).seesaw({ length: 8, height: 1.6 }).flat(40).finish(30, { checkpointRule: false });
    expect(checkSeesaws(ok)).toEqual([]);
  });
  it('lips: a 22 deg or a curved kicker below hard fails; the same kicker on a hard track is allowed', () => {
    const steep = fx('fx-lip-22', 'medium').flat(20).checkpoint().flat(16).ramp({ length: 5, height: 2.0 }).flat(40).finish(30, { checkpointRule: false });
    expect(checkLips(steep).some((m) => m.includes('21.8 deg'))).toBe(true);
    const curved = fx('fx-lip-curve', 'medium').flat(20).checkpoint().flat(16).ramp({ length: 4, height: 1.0, curve: 0.3 }).flat(40).finish(30, { checkpointRule: false });
    expect(checkLips(curved).some((m) => m.includes('curved'))).toBe(true);
    const hard = fx('fx-lip-hard', 'hard').flat(20).checkpoint().flat(16).ramp({ length: 5, height: 2.0 }).flat(40).finish(30, { checkpointRule: false });
    expect(checkLips(hard)).toEqual([]);
  });
  it('hop heights: a 0.8 m ledge fails, a 0.5 m ledge passes, a lip wall needs its stepped ramp', () => {
    const tall = fx('fx-hop-08', 'medium').flat(20).checkpoint().flat(16).ledge({ height: 0.8, length: 4 }).flat(40).finish(30, { checkpointRule: false });
    expect(checkHopHeights(tall).length).toBe(1);
    const ok = fx('fx-hop-05', 'medium').flat(20).checkpoint().flat(16).ledge({ height: 0.5, length: 4 }).flat(40).finish(30, { checkpointRule: false });
    expect(checkHopHeights(ok)).toEqual([]);
    const bareWall = fx('fx-hop-wall', 'hard').flat(20).checkpoint().flat(16).wall({ height: 1.0, width: 4, lip: 0.15 }).flat(40).finish(30, { checkpointRule: false });
    expect(checkHopHeights(bareWall).some((m) => m.includes('no B line'))).toBe(true);
    const stepped = fx('fx-hop-stepped', 'hard').flat(20).checkpoint().flat(16).steppedWall({ height: 1.0, width: 4, lip: 0.15 }, 0.3).flat(40).finish(30, { checkpointRule: false });
    expect(checkHopHeights(stepped)).toEqual([]);
  });
  it('run-up jumps: H2 round 9 — a 7 m gap from 26 m off a 14 deg lip fails, 5 m from 30 m passes', () => {
    const wide = fx('fx-runup-7', 'hard').flat(20).checkpoint().flat(26).ramp({ length: 6, height: 1.5 }).gap({ width: 7 }).gapLanding(1.0, 6, 6, 8).flat(40).finish(30, { checkpointRule: false });
    expect(checkRunupJumps(wide).length).toBe(1);
    const ok = fx('fx-runup-5', 'hard').flat(20).checkpoint().flat(30).ramp({ length: 6, height: 1.5 }).gap({ width: 5 }).gapLanding(1.0, 6, 6, 8).flat(40).finish(30, { checkpointRule: false });
    expect(checkRunupJumps(ok)).toEqual([]);
  });
  it('medals: a later track in a tier with a lower target fails', () => {
    const a = fx('fx-medal-a', 'medium').flat(20).checkpoint().flat(60).finish(30, { checkpointRule: false });
    const b = fx('fx-medal-b', 'medium').flat(20).checkpoint().flat(60).finish(30, { checkpointRule: false });
    (b.meta as { targetTimeS: number }).targetTimeS = 20;
    expect(checkMedalsMonotone([a, b]).length).toBe(1);
  });
});
