import { describe, expect, it } from 'vitest';
import { CANON, DEFAULT_OPTS, PoseFollower, hopCrouch, riderChain, type Chain, type Vec3 } from './pose';

const D = 180 / Math.PI;
const pose = (lean: number, crouch = 0, torsoPitch = 0, armExtend = 0) => ({ lean, crouch, torsoPitch, armExtend });
/** Clean inputs: crouch is the hop alone, torsoPitch carries no physics bias. */
const hopOnly = { ...DEFAULT_OPTS, crouchIsHopOnly: true, torsoPitchLeanBias: 0 };

/** RIDER_CHAIN.md canonical tables (axle coords, .L side). */
const TABLES: Record<string, Record<string, [number, number, number]>> = {
  stand_attack: {
    hips: [-0.28, 0.85, 0],
    chest: [0.007, 1.091, 0],
    shoulders: [0.118, 1.184, 0],
    elbow: [0.299, 1.057, 0.442],
    hand: [0.27, 0.78, 0.33],
    knee: [0.021, 0.503, 0.115],
    ankle: [-0.13, 0.11, 0.2],
    head: [0.208, 1.385, 0],
  },
  hang_back: {
    hips: [-0.57, 0.6, 0],
    chest: [-0.355, 0.907, 0],
    shoulders: [-0.272, 1.026, 0],
    elbow: [0.015, 0.938, 0.321],
    hand: [0.27, 0.78, 0.33],
    knee: [-0.117, 0.521, 0.08],
    ankle: [-0.13, 0.11, 0.2],
    head: [-0.215, 1.238, 0],
  },
  forward_attack: {
    hips: [-0.22, 0.9, 0],
    chest: [0.117, 1.064, 0],
    shoulders: [0.247, 1.128, 0],
    elbow: [0.379, 1.016, 0.479],
    hand: [0.27, 0.78, 0.33],
    knee: [0.016, 0.507, 0.122],
    ankle: [-0.13, 0.11, 0.2],
    head: [0.411, 1.275, 0],
  },
  crouch: {
    hips: [-0.38, 0.78, 0],
    chest: [-0.049, 0.956, 0],
    shoulders: [0.079, 1.024, 0],
    elbow: [0.272, 1.048, 0.464],
    hand: [0.27, 0.78, 0.33],
    knee: [-0.007, 0.511, 0.104],
    ankle: [-0.13, 0.11, 0.2],
    head: [0.248, 1.166, 0],
  },
};
const ANGLES: Record<string, { torso: number; head: number; elbow: number; kneeFlex: number }> = {
  stand_attack: { torso: 40, head: 66, elbow: 93, kneeFlex: 62 },
  hang_back: { torso: 55, head: 75, elbow: 156, kneeFlex: 83 },
  forward_attack: { torso: 26, head: 42, elbow: 73, kneeFlex: 51 },
  crouch: { torso: 28, head: 40, elbow: 65, kneeFlex: 71 },
};
const INPUTS: Record<string, ReturnType<typeof pose>> = {
  stand_attack: pose(0),
  hang_back: pose(-1),
  forward_attack: pose(1),
  crouch: pose(0, 1),
};

function joint(c: Chain, name: string): Vec3 {
  switch (name) {
    case 'hips':
      return c.hips;
    case 'chest':
      return c.chest;
    case 'shoulders':
      return c.shoulders;
    case 'head':
      return c.head;
    case 'elbow':
      return c.elbow[0];
    case 'hand':
      return c.hand[0];
    case 'knee':
      return c.knee[0];
    default:
      return c.ankle[0];
  }
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
function angle(a: Vec3, b: Vec3, c: Vec3): number {
  // interior angle at b (deg)
  const ux = a.x - b.x, uy = a.y - b.y, uz = a.z - b.z;
  const vx = c.x - b.x, vy = c.y - b.y, vz = c.z - b.z;
  const d = (ux * vx + uy * vy + uz * vz) / (Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz));
  return Math.acos(Math.max(-1, Math.min(1, d))) * D;
}

describe('riderChain canonical corners (RIDER_CHAIN.md tables, 1 cm / 2 deg)', () => {
  for (const name of Object.keys(TABLES)) {
    it(name, () => {
      const c = riderChain(INPUTS[name]!, hopOnly);
      const t = TABLES[name]!;
      for (const [j, [x, y, z]] of Object.entries(t)) {
        const p = joint(c, j);
        expect(dist(p, { x, y, z }), `${name}.${j} got (${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})`).toBeLessThan(0.01);
      }
      const a = ANGLES[name]!;
      expect(Math.abs(c.torsoAngle * D - a.torso)).toBeLessThan(2);
      expect(Math.abs(c.headAngle * D - a.head)).toBeLessThan(2);
      expect(Math.abs(c.elbowAngle[0] * D - a.elbow)).toBeLessThan(2);
      expect(Math.abs(180 - c.kneeAngle[0] * D - a.kneeFlex)).toBeLessThan(2);
    });
  }
});

describe('riderChain over the lean x crouch grid', () => {
  const leans = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
  const crouches = [0, 0.25, 0.5, 0.75, 1];
  const S = 0.32 + 0.3;
  const L = 0.46 + 0.43;

  it('hands on the grips and feet on the pegs in every pose (limb stretch <= 1)', () => {
    for (const lean of leans)
      for (const cr of crouches) {
        const c = riderChain(pose(lean, cr), hopOnly);
        for (let i = 0; i < 2; i++) {
          expect(c.hand[i]!.x).toBeCloseTo(0.27, 6);
          expect(c.hand[i]!.y).toBeCloseTo(0.78, 6);
          expect(Math.abs(c.hand[i]!.z)).toBeCloseTo(0.33, 6);
          expect(c.ankle[i]!.x).toBeCloseTo(-0.13, 6);
          expect(c.ankle[i]!.y).toBeCloseTo(0.11, 6);
          // the segments actually reach: shoulder->elbow->hand and hip->knee->ankle are the bone lengths
          expect(dist(c.shoulder[i]!, c.elbow[i]!) + dist(c.elbow[i]!, c.hand[i]!), `arm ${lean},${cr}`).toBeLessThanOrEqual(S * 1.0001);
          expect(dist(c.hipSide[i]!, c.knee[i]!) + dist(c.knee[i]!, c.ankle[i]!), `leg ${lean},${cr}`).toBeLessThanOrEqual(L * 1.03);
          expect(c.armStretch[i], `armStretch ${lean},${cr}`).toBeLessThanOrEqual(1.0);
          expect(c.legStretch[i], `legStretch ${lean},${cr}`).toBeLessThanOrEqual(1.0);
        }
      }
  });

  it('joint angles within human limits: elbow 20-170, knee 40-175, hip flexion <= 130', () => {
    for (const lean of leans)
      for (const cr of crouches) {
        const c = riderChain(pose(lean, cr), hopOnly);
        for (let i = 0; i < 2; i++) {
          const e = c.elbowAngle[i]! * D;
          const k = c.kneeAngle[i]! * D;
          expect(e, `elbow ${lean},${cr}`).toBeGreaterThanOrEqual(20);
          expect(e, `elbow ${lean},${cr}`).toBeLessThanOrEqual(170);
          expect(k, `knee ${lean},${cr}`).toBeGreaterThanOrEqual(40);
          expect(k, `knee ${lean},${cr}`).toBeLessThanOrEqual(175);
          const hipFlex = 180 - angle(c.shoulders, c.hips, { ...c.knee[i]!, z: 0 });
          expect(hipFlex, `hip ${lean},${cr}`).toBeLessThanOrEqual(130);
        }
      }
  });

  it('torso never below horizontal; head above the bars at lean <= 0.7; head above the torso line', () => {
    for (const lean of leans)
      for (const cr of crouches) {
        const c = riderChain(pose(lean, cr), hopOnly);
        expect(c.torsoAngle, `torso ${lean},${cr}`).toBeGreaterThan(0.15);
        if (lean <= 0.7) expect(c.head.y, `head ${lean},${cr}`).toBeGreaterThan(0.78 + 0.13);
        expect(c.headAngle).toBeGreaterThan(c.torsoAngle);
      }
  });

  it('hips behind the seat at lean -1, in front of the seat centre at lean +1, and monotonic in lean', () => {
    const seat = DEFAULT_OPTS.seatTop.x;
    expect(riderChain(pose(-1), hopOnly).hips.x).toBeLessThan(seat - 0.2);
    expect(riderChain(pose(1), hopOnly).hips.x).toBeGreaterThan(seat);
    let prev = -Infinity;
    for (const lean of leans) {
      const x = riderChain(pose(lean), hopOnly).hips.x;
      expect(x).toBeGreaterThan(prev);
      prev = x;
    }
  });

  it('lean back is a STANDING pose: legs open (knee >= 90), arms straighten (elbow >= 150), head above the attack head - 0.2', () => {
    const c = riderChain(pose(-1), hopOnly);
    expect(c.kneeAngle[0]! * D).toBeGreaterThanOrEqual(90);
    expect(c.elbowAngle[0]! * D).toBeGreaterThanOrEqual(150);
    expect(c.head.y).toBeGreaterThan(CANON.stand_attack.hipY + 0.35);
  });

  it('lean forward RISES: hips higher than attack, torso lower, head still above the bar clamp', () => {
    const a = riderChain(pose(0), hopOnly);
    const f = riderChain(pose(1), hopOnly);
    expect(f.hips.y).toBeGreaterThan(a.hips.y);
    expect(f.torsoAngle).toBeLessThan(a.torsoAngle);
    expect(f.head.y).toBeGreaterThan(0.78 + 0.3);
    expect(f.shoulders.x).toBeGreaterThan(a.shoulders.x + 0.1);
  });

  it('elbow pole: elbows up-and-out (outside the shoulder, above the grip), knees forward and inside the ankles', () => {
    for (const lean of leans) {
      const c = riderChain(pose(lean), hopOnly);
      expect(c.elbow[0]!.z).toBeGreaterThan(c.shoulder[0]!.z + 0.08);
      expect(c.elbow[0]!.y).toBeGreaterThan(0.78);
      expect(c.elbow[1]!.z).toBeLessThan(-0.08);
      expect(c.knee[0]!.x).toBeGreaterThan(c.hips.x);
      expect(c.knee[0]!.z).toBeGreaterThanOrEqual(0.08);
      expect(c.knee[0]!.z).toBeLessThan(0.2);
    }
  });

  it('torsoPitch keeps the torso upright in a nose-up frame without folding it', () => {
    const up = riderChain(pose(-0.5, 0, -0.34), hopOnly);
    const flat = riderChain(pose(-0.5), hopOnly);
    expect(up.torsoAngle).toBeGreaterThan(flat.torsoAngle);
    expect(up.torsoAngle * D).toBeLessThan(80.5);
    const fwd = riderChain(pose(1, 0, 0.34), hopOnly);
    expect(fwd.torsoAngle * D).toBeGreaterThanOrEqual(12);
  });
});

describe('physics coupling', () => {
  it('hopCrouch removes the lean-induced mass drop: no hop -> 0 at every lean; preload at lean -0.6 -> 1', () => {
    // physics: crouch = clamp((leanPart + hop) , 0, 1) with leanPart = 1.667 fwd / 0.667 back
    expect(hopCrouch(1, 1)).toBe(0);
    expect(hopCrouch(0.7, 1)).toBe(0);
    expect(hopCrouch(0.3, 0.5)).toBeCloseTo(0, 6);
    expect(hopCrouch(-1, 0.667)).toBeCloseTo(0, 2);
    expect(hopCrouch(-0.6, 0.4)).toBeCloseTo(0, 2);
    expect(hopCrouch(-0.6, 1)).toBeCloseTo(1, 6);
    expect(hopCrouch(0, 0.5)).toBeCloseTo(0.5, 6);
  });

  it('with physics-style crouch the forward lean is NOT a crouch (the round-8 prone bug)', () => {
    // exactly what physics reported on flat-test at 9 m/s with no hop (pose-study/ours-v1 log)
    const physicsStyle = riderChain({ lean: 1, crouch: 1, torsoPitch: -0.34, armExtend: 0 });
    expect(physicsStyle.params.crouch).toBe(0);
    expect(physicsStyle.head.y).toBeGreaterThan(1.2);
    const clean = riderChain(pose(1), hopOnly);
    expect(dist(physicsStyle.head, clean.head)).toBeLessThan(0.02);
    const back = riderChain({ lean: -1, crouch: 0.67, torsoPitch: 0.34, armExtend: 1 });
    expect(back.params.crouch).toBeLessThan(0.05);
    expect(back.elbowAngle[0]! * D).toBeGreaterThan(150);
    expect(Math.abs(back.torsoAngle * D - 55)).toBeLessThan(1);
  });
});

describe('PoseFollower lag', () => {
  it('reaches 90 % of a lean step in 30-60 ms with <= 10 % overshoot, snaps on a cut', () => {
    const f = new PoseFollower();
    f.update(pose(0), 1 / 60, true);
    let t90 = -1;
    let peak = 0;
    for (let i = 1; i <= 60; i++) {
      const o = f.update(pose(-1), 1 / 60);
      if (t90 < 0 && o.lean <= -0.9) t90 = i / 60;
      peak = Math.min(peak, o.lean);
    }
    expect(t90).toBeGreaterThanOrEqual(0.03);
    expect(t90).toBeLessThanOrEqual(0.06);
    expect(peak).toBeGreaterThanOrEqual(-1); // clamped to the domain
    const snapped = f.update(pose(0.5), 1 / 60, true);
    expect(snapped.lean).toBe(0.5);
  });
  it('overshoots ~5 % on an unclamped channel', () => {
    const f = new PoseFollower();
    f.update(pose(0), 1 / 60, true);
    let peak = 0;
    for (let i = 1; i <= 60; i++) peak = Math.max(peak, f.update(pose(0, 0, 0.5), 1 / 60).torsoPitch);
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThan(0.56);
  });
});
