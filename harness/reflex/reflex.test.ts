import { describe, expect, it } from 'vitest';
import { createSim } from '../lib/sim';
import { ReflexController, SKILLS } from './controller';
import { SectionMemory } from './memory';
import { perceive } from './perceive';
import { playReflex } from './play';
import { buildProfile } from './profile';

describe('reflex bot', () => {
  it('is deterministic for (track, seed, skill) and its recording replays to the same state', async () => {
    const a = playReflex(await createSim('flat-test'), { skill: 'average', seed: 7, maxSimSeconds: 40 });
    const b = playReflex(await createSim('flat-test'), { skill: 'average', seed: 7, maxSimSeconds: 40 });
    expect(a.finalHash).toBe(b.finalHash);
    expect(a.frames.length).toBe(b.frames.length);
    const fresh = await createSim('flat-test');
    expect(fresh.run(a.frames).hash).toBe(a.finalHash);
    expect(a.outcome).toBe('finished');
  });

  it('draws a reaction delay inside the skill range and glances at the skill rate', async () => {
    for (const skill of ['novice', 'average', 'good'] as const) {
      const c = new ReflexController({ skill, seed: 3 });
      expect(c.reactionS).toBeGreaterThanOrEqual(SKILLS[skill].reactionS[0]);
      expect(c.reactionS).toBeLessThanOrEqual(SKILLS[skill].reactionS[1]);
      expect(c.glanceDue(0)).toBe(true);
    }
  });

  it('sees the ground the way the screen shows it: a pit reads as a pit, a ramp as a slope, a box as a face', async () => {
    const sim = await createSim('gap-test'); // ramp@30 gap@34
    const profile = buildProfile(sim.compiled);
    const st = sim.state();
    st.bike.pos.x = 26;
    st.bike.vel.x = 10;
    const o = perceive(st, 'riding', 0, profile, sim.track);
    expect(o.ahead.steepDeg).toBeGreaterThan(10);
    expect(o.ahead.pitDist === null || o.ahead.pitDist > 8).toBe(true);
    const m1 = await createSim('m1-hop-up'); // ledge@21 (0.45 m vertical face)
    const p1 = buildProfile(m1.compiled);
    const s1 = m1.state();
    s1.bike.pos.x = 18;
    s1.bike.vel.x = 6;
    const o1 = perceive(s1, 'riding', 0, p1, m1.track);
    expect(o1.ahead.faceDist).not.toBeNull();
    expect(o1.ahead.faceHeight).toBeGreaterThan(0.3);
  });

  it('learns locally: a fault slows the approach to that section only', () => {
    const m = new SectionMemory();
    m.learn({ x: 100, reason: 'crash', seen: null, pitchDeg: 5, airborne: false, speed: 12, belowAhead: 0 });
    expect(m.get(100).speedScale).toBeLessThan(1);
    expect(m.get(88).speedScale).toBeLessThan(1); // the approach bucket (≈ 0.9 s of travel back)
    expect(m.get(300).speedScale).toBe(1);
    m.learn({ x: 200, reason: 'crash', seen: null, pitchDeg: 80, airborne: false, speed: 6, belowAhead: 0 });
    expect(m.get(200).leanBias).toBeGreaterThan(0); // looped → lean forward next time
  });
});
