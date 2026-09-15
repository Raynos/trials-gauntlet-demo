import { describe, expect, it } from 'vitest';
import { detectManoeuvres, type TraceSample } from './battery.mjs';

const HZ = 120;

function sample(tick: number, over: Partial<TraceSample> = {}): TraceSample {
  const pitch = over.pitchDeg ?? 0;
  const x = over.x ?? tick * 0.05;
  const y = over.y ?? 0;
  return {
    tick,
    x,
    y,
    pitchDeg: pitch,
    rearGrounded: true,
    frontGrounded: true,
    frontY: y + Math.sin((pitch * Math.PI) / 180) * 1.3,
    rearY: y,
    frontX: x + Math.cos((pitch * Math.PI) / 180) * 1.3,
    rearX: x,
    fault: false,
    spawn: false,
    ...over,
  };
}

/** A flat ride of `ticks` ticks; `edit(t)` overrides selected ticks. */
function ride(ticks: number, edit: (tick: number) => Partial<TraceSample> | undefined): TraceSample[] {
  const out: TraceSample[] = [];
  for (let t = 1; t <= ticks; t++) out.push(sample(t, edit(t)));
  return out;
}

const seconds = (s: number): number => Math.round(s * HZ);

describe('detectManoeuvres', () => {
  it('finds a held wheelie and anchors it at the lift tick', () => {
    const lift = seconds(2);
    const trace = ride(seconds(5), (t) => (t >= lift && t < lift + seconds(0.8) ? { frontGrounded: false, pitchDeg: 28 } : undefined));
    const w = detectManoeuvres(trace, HZ).filter((a) => a.manoeuvre === 'wheelie');
    expect(w).toHaveLength(1);
    expect(w[0]!.tick).toBe(lift);
    expect(w[0]!.t).toBeCloseTo(2, 3);
  });

  it('ignores a front lift shorter than 0.5 s or under 20 deg', () => {
    const lift = seconds(2);
    const short = ride(seconds(5), (t) => (t >= lift && t < lift + seconds(0.3) ? { frontGrounded: false, pitchDeg: 30 } : undefined));
    const low = ride(seconds(5), (t) => (t >= lift && t < lift + seconds(1) ? { frontGrounded: false, pitchDeg: 12 } : undefined));
    expect(detectManoeuvres(short, HZ).filter((a) => a.manoeuvre === 'wheelie')).toHaveLength(0);
    expect(detectManoeuvres(low, HZ).filter((a) => a.manoeuvre === 'wheelie')).toHaveLength(0);
  });

  it('classifies airtime as hop / landing / flight by duration', () => {
    const airFor = (s: number): TraceSample[] => {
      const off = seconds(2);
      const len = seconds(s);
      return ride(seconds(6), (t) => (t >= off && t < off + len ? { rearGrounded: false, frontGrounded: false, y: 0.5 } : undefined));
    };
    const hop = detectManoeuvres(airFor(0.4), HZ);
    expect(hop.map((a) => a.manoeuvre)).toEqual(['hop']);
    expect(hop[0]!.tick).toBe(seconds(2) - 1);
    const land = detectManoeuvres(airFor(0.9), HZ);
    expect(land.map((a) => a.manoeuvre)).toEqual(['landing']);
    expect(land[0]!.tick).toBe(seconds(2) + seconds(0.9));
    const flight = detectManoeuvres(airFor(1.4), HZ).map((a) => a.manoeuvre).sort();
    expect(flight).toEqual(['flight', 'landing']);
  });

  it('does not call a hop when the apex rises 1.2 m or more, or the takeoff is steep', () => {
    const off = seconds(2);
    const high = ride(seconds(6), (t) => (t >= off && t < off + seconds(0.5) ? { rearGrounded: false, frontGrounded: false, y: 1.5 } : undefined));
    expect(detectManoeuvres(high, HZ).filter((a) => a.manoeuvre === 'hop')).toHaveLength(0);
    const ramp = ride(seconds(6), (t) => {
      if (t === off - 1) return { pitchDeg: 25 };
      return t >= off && t < off + seconds(0.5) ? { rearGrounded: false, frontGrounded: false, y: 0.5 } : undefined;
    });
    expect(detectManoeuvres(ramp, HZ).filter((a) => a.manoeuvre === 'hop')).toHaveLength(0);
  });

  it('anchors a crash at the fault tick and drops anything inside 0.5 s of a spawn', () => {
    const faultTick = seconds(3);
    const trace = ride(seconds(6), (t) => {
      if (t === faultTick) return { fault: true };
      if (t === faultTick + seconds(1)) return { spawn: true };
      // a wheelie 0.2 s after the respawn: too close to the spawn
      if (t >= faultTick + seconds(1.2) && t < faultTick + seconds(2)) return { frontGrounded: false, pitchDeg: 30 };
      return undefined;
    });
    const anchors = detectManoeuvres(trace, HZ);
    expect(anchors.map((a) => a.manoeuvre)).toEqual(['crash']);
    expect(anchors[0]!.tick).toBe(faultTick);
  });

  it('does not report airtime that ends in a fault as a landing', () => {
    const off = seconds(2);
    const trace = ride(seconds(6), (t) => {
      if (t >= off && t < off + seconds(1.2)) return { rearGrounded: false, frontGrounded: false, y: 1, fault: t === off + seconds(1.1) };
      return undefined;
    });
    expect(detectManoeuvres(trace, HZ).map((a) => a.manoeuvre)).toEqual(['crash']);
  });

  it('finds a climb when the rear wheel rolls up a >= 30 deg path for >= 0.6 s', () => {
    const start = seconds(2);
    // x advances 0.05 m/tick; a 40 deg path rises tan(40) * 0.05 per tick from `start`
    const rise = (t: number, until: number): number => Math.tan((40 * Math.PI) / 180) * 0.05 * Math.max(0, Math.min(t, until) - start);
    const trace = ride(seconds(6), (t) => ({ pitchDeg: t >= start && t < start + seconds(1) ? 35 : 0, y: rise(t, start + seconds(1)) }));
    const c = detectManoeuvres(trace, HZ).filter((a) => a.manoeuvre === 'climb');
    expect(c).toHaveLength(1);
    expect(c[0]!.tick).toBeGreaterThanOrEqual(start);
    expect(c[0]!.tick).toBeLessThanOrEqual(start + seconds(0.1));
    const short = ride(seconds(6), (t) => ({ y: rise(t, start + seconds(0.3)) }));
    expect(detectManoeuvres(short, HZ).filter((a) => a.manoeuvre === 'climb')).toHaveLength(0);
    // a wheelie on the flat is not a climb
    const flatWheelie = ride(seconds(6), (t) => (t >= start && t < start + seconds(1) ? { frontGrounded: false, pitchDeg: 35 } : undefined));
    expect(detectManoeuvres(flatWheelie, HZ).filter((a) => a.manoeuvre === 'climb')).toHaveLength(0);
  });
});
