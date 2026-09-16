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

describe('see-saw model (round 11)', () => {
  /** The m3 demand board (pivot ≈ 403.4 m): the bike placed on its low end, wheels down, board at rest or tipping. */
  async function onDemandBoard(angVel: number, dx = -1.8) {
    const sim = await createSim('m3-see-saw');
    const profile = buildProfile(sim.compiled);
    const st = sim.state();
    const board = sim.compiled.colliders.find((c) => c.kind === 'seesaw' && c.pivot.x > 400 && c.pivot.x < 406);
    if (!board || board.kind !== 'seesaw') throw new Error('m3 demand board not found');
    const live = st.seesaws.find((q) => q.id === board.id);
    if (!live) throw new Error('board state missing');
    live.angVel = angVel;
    const x = board.pivot.x + dx;
    const under = profile.seesawAt(x, st);
    if (!under) throw new Error('no plank under x');
    st.bike.pos.x = x;
    st.bike.pos.y = under.top + 0.34;
    st.bike.vel.x = 6;
    st.bike.vel.y = 0;
    st.bike.angle = under.angle;
    st.bike.angVel = 0;
    st.wheels.rear.grounded = true;
    st.wheels.front.grounded = true;
    return { sim, profile, st, board, under };
  }

  it('perceives the board under the bike: on it, its angle and rate, the distance to the far end, tipping', async () => {
    const rest = await onDemandBoard(0);
    const o = perceive(rest.st, 'riding', 0, rest.profile, rest.sim.track);
    expect(o.seesaw).not.toBeNull();
    expect(o.seesaw!.onBoard).toBe(true);
    expect(o.seesaw!.landing).toBe(false);
    expect(o.seesaw!.tipping).toBe(false);
    expect(o.seesaw!.angleDeg).toBeGreaterThan(15); // rests with the far end up
    expect(o.seesaw!.toFarEnd).toBeGreaterThan(5);
    expect(o.seesaw!.toFarEnd).toBeLessThan(7);
    const tip = await onDemandBoard(-2); // -115 deg/s: the far end going down
    const o2 = perceive(tip.st, 'riding', 0, tip.profile, tip.sim.track);
    expect(o2.seesaw!.tipping).toBe(true);
    expect(o2.seesaw!.rateDeg).toBeLessThan(-100);
    // Airborne 4 m before the board, flying onto it: the landing board is seen, not "on" it.
    const fly = await onDemandBoard(0);
    fly.st.bike.pos.x = fly.board.pivot.x - 6;
    fly.st.bike.pos.y = fly.under.top + 1.2;
    fly.st.bike.vel.x = 9;
    fly.st.bike.vel.y = 1;
    fly.st.wheels.rear.grounded = false;
    fly.st.wheels.front.grounded = false;
    const o3 = perceive(fly.st, 'riding', 0, fly.profile, fly.sim.track);
    expect(o3.seesaw).not.toBeNull();
    expect(o3.seesaw!.onBoard).toBe(false);
    expect(o3.seesaw!.landing).toBe(true);
    // Nowhere near a board: null.
    const flat = await createSim('flat-test');
    const of = perceive(flat.state(), 'riding', 0, buildProfile(flat.compiled), flat.track);
    expect(of.seesaw).toBeNull();
  });

  it('rides a tipping board hands-still (seesaw-ride: lean 0, no brake, gentle gas, no drop rule) and flies the tip-air hands-off (seesaw-tip-air)', async () => {
    const c = new ReflexController({ skill: 'good', seed: 11 });
    const tip = await onDemandBoard(-2, 0.5); // past the pivot, the far end 3.5 m ahead reads as a drop
    const dt = 1 / 30;
    let t = 0;
    // One glance per 1/30 s, the hands polled a reaction later (the driver polls every tick; here once per glance).
    const feed = (o: ReturnType<typeof perceive>): void => {
      c.observe({ ...o, t });
      c.keysAt(t + c.reactionS + 1e-3);
      t += dt;
    };
    const onBoard = perceive(tip.st, 'riding', t, tip.profile, tip.sim.track);
    expect(onBoard.ahead.dropDist).not.toBeNull();
    for (let k = 0; k < 6; k++) feed(onBoard);
    const ride = c.currentIntent();
    expect(ride.rule).toBe('seesaw-ride');
    expect(ride.lean).toBe(0);
    expect(ride.brake).toBe(0);
    expect(ride.throttle).toBeGreaterThan(0);
    expect(ride.throttle).toBeLessThanOrEqual(0.4);
    expect(c.tipAirS(t)).toBe(Infinity);
    // Off the far end: airborne, past the plank, well up (the flat beyond sits at the far end's resting height), the board still tipping.
    const air = { ...tip.st, bike: { ...tip.st.bike, pos: { x: tip.board.pivot.x + tip.board.halfLength + 0.6, y: tip.st.bike.pos.y + 3 }, vel: { x: 6, y: 1.5 } }, wheels: { rear: { ...tip.st.wheels.rear, grounded: false }, front: { ...tip.st.wheels.front, grounded: false } } };
    const oAir = perceive(air, 'riding', t, tip.profile, tip.sim.track);
    expect(oAir.seesaw).toBeNull();
    for (let k = 0; k < 4; k++) feed(oAir);
    const fly = c.currentIntent();
    expect(fly.rule).toBe('seesaw-tip-air');
    expect(fly.throttle).toBe(0);
    expect(fly.brake).toBe(0);
    expect(fly.lean).toBe(0);
    expect(c.tipAirS(t)).toBeLessThan(0.6);
    // The tip-air is over after SEESAW.tipAirS: the ordinary air rules take the flight.
    for (let k = 0; k < 20; k++) feed(oAir);
    expect(c.currentIntent().rule).not.toBe('seesaw-tip-air');
    expect(c.tipAirS(t)).toBe(Infinity);
    expect([...c.ruleCounts.keys()]).toEqual(expect.arrayContaining(['seesaw-ride', 'seesaw-tip-air']));
  });
});

describe('section memory: a stall teaches "more speed, commit" (round 11)', () => {
  it('a restart fault after a fast first crash lifts the section back to >= 1 speed and clears the throttle cap, and logs it', () => {
    const m = new SectionMemory();
    m.learn({ x: 230, reason: 'crash', seen: null, pitchDeg: 5, airborne: false, speed: 12, belowAhead: 0 }); // "slower"
    m.learn({ x: 230, reason: 'crash', seen: null, pitchDeg: 80, airborne: false, speed: 6, belowAhead: 0 }); // "looped": thr cap
    expect(m.get(230).speedScale).toBeLessThan(1);
    expect(m.get(230).throttleCap).toBeLessThan(1);
    const notes = m.learn({ x: 229, reason: 'restart', seen: null, pitchDeg: 3, airborne: false, speed: 1.2, belowAhead: 0 });
    expect(notes.some((a) => a.note.includes('stalled'))).toBe(true);
    expect(m.get(230).speedScale).toBeCloseTo(1.1, 6); // max(1, 0.85) + 0.1 x stall #1
    expect(m.get(230).throttleCap).toBe(1);
    expect(m.get(230).stalls).toBe(1);
    expect(m.log.some((a) => a.note.includes('stalled: speed'))).toBe(true);
    // A second stall asks for more still; the approach bucket (3 m back at a crawl) learns it too.
    m.stalled(229, 1.0);
    expect(m.get(230).speedScale).toBeCloseTo(1.2, 6); // stall #2
    expect(m.get(224).speedScale).toBeCloseTo(1.2, 6); // the approach bucket stalled twice too
  });
});
