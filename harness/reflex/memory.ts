/**
 * Section memory: what a player carries from one attempt to the next.
 *
 * Keyed by x bucket (BUCKET m). A fault at x adjusts the *approach* to that
 * section — slower in, lean earlier, a lean bias that opposes the way the
 * bike went over — and nothing else. No track internals: the fault's x, the
 * bike's pitch / height / speed at the fault and the visible feature are all
 * the player knew. A section cleared cleanly a few times relaxes back toward
 * the defaults (confidence).
 */
import type { Observation } from './perceive';

export const BUCKET = 6;

export interface SectionParams {
  /** Multiplier on the target approach speed (0.45..1.6). */
  speedScale: number;
  /** Added to the lean command in this section (−0.8..0.8; +ve = forward). */
  leanBias: number;
  /** Extra anticipation (s) on feature rules in this section (0..0.5). */
  leadS: number;
  /** Extra throttle restraint: caps throttle duty in this section (0.3..1). */
  throttleCap: number;
  faults: number;
  clears: number;
  /** Stall-restarts in this section (round 11). */
  stalls?: number;
}

export interface FaultContext {
  x: number;
  reason: string;
  /** The last observation the player acted on before the fault (may be slightly stale). */
  seen: Observation | null;
  pitchDeg: number;
  airborne: boolean;
  speed: number;
  /** Bike y minus ground ahead at the fault: < −0.5 means it went *down* into something (pit / off a ledge). */
  belowAhead: number;
}

export type Adjustment = { bucket: number; note: string };

export class SectionMemory {
  private readonly m = new Map<number, SectionParams>();
  readonly log: Adjustment[] = [];

  static bucketOf(x: number): number {
    return Math.floor(x / BUCKET);
  }

  get(x: number): SectionParams {
    return this.m.get(SectionMemory.bucketOf(x)) ?? { speedScale: 1, leanBias: 0, leadS: 0, throttleCap: 1, faults: 0, clears: 0 };
  }

  private edit(bucket: number, f: (p: SectionParams) => void): void {
    const p = this.m.get(bucket) ?? { speedScale: 1, leanBias: 0, leadS: 0, throttleCap: 1, faults: 0, clears: 0 };
    f(p);
    p.speedScale = clamp(p.speedScale, 0.45, 1.6);
    p.leanBias = clamp(p.leanBias, -0.8, 0.8);
    p.leadS = clamp(p.leadS, 0, 0.5);
    p.throttleCap = clamp(p.throttleCap, 0.3, 1);
    this.m.set(bucket, p);
  }

  /** Learn from a fault: the approach bucket(s) and the fault bucket. A `restart` fault is the rider's own stall-restart. */
  learn(c: FaultContext, learnRate = 1): Adjustment[] {
    if (c.reason === 'restart') return this.stalled(c.x, c.speed, learnRate);
    const out: Adjustment[] = [];
    const approachX = c.x - Math.max(3, Math.min(14, c.speed * 0.9));
    const buckets = new Set<number>([SectionMemory.bucketOf(approachX), SectionMemory.bucketOf(c.x)]);
    const looped = c.pitchDeg > 45;
    const endo = c.pitchDeg < -35;
    const fellIn = c.belowAhead < -0.5 && !looped;
    const fast = c.speed > 9;
    for (const b of buckets) {
      let note = '';
      this.edit(b, (p) => {
        p.faults++;
        if (fellIn) {
          // Came up short: more speed next time, nose up at the lip.
          p.speedScale += 0.12 * learnRate;
          p.leanBias -= 0.15 * learnRate;
          note = `short: speed ${p.speedScale.toFixed(2)} lean ${p.leanBias.toFixed(2)}`;
        } else if (looped) {
          p.leanBias += 0.25 * learnRate;
          p.throttleCap -= 0.15 * learnRate;
          p.leadS += 0.08 * learnRate;
          note = `looped: lean ${p.leanBias.toFixed(2)} thr cap ${p.throttleCap.toFixed(2)}`;
        } else if (endo) {
          p.leanBias -= 0.25 * learnRate;
          p.speedScale -= (fast ? 0.12 : 0.05) * learnRate;
          p.leadS += 0.08 * learnRate;
          note = `endo: lean ${p.leanBias.toFixed(2)} speed ${p.speedScale.toFixed(2)}`;
        } else {
          // Unknown crash: slow down and look earlier.
          p.speedScale -= (fast ? 0.15 : 0.08) * learnRate;
          p.leadS += 0.1 * learnRate;
          note = `slower: speed ${p.speedScale.toFixed(2)} lead ${p.leadS.toFixed(2)}`;
        }
        // After several faults with the same fix, a player tries the opposite: more speed.
        if (p.faults >= 4 && p.faults % 4 === 0 && !fellIn) {
          p.speedScale += 0.3 * learnRate;
          note += ` (retry faster ${p.speedScale.toFixed(2)})`;
        }
      });
      const adj = { bucket: b, note: `x≈${b * BUCKET}: ${note}` };
      out.push(adj);
      this.log.push(adj);
    }
    return out;
  }

  /**
   * A stall (no progress, the rider hit restart) under a feature at x — round 11 (tracks r9 request c): the lesson is
   * the OPPOSITE of a fast first crash's "slower". A fast first arrival taught "slower: speed 0.85" and every stall after it
   * taught nothing, so the reflex sat under the x1 50 deg face at a crawl it clears from a spawn. Now: the speed scale comes
   * back to >= 1 (and a notch more each time), the throttle cap is lifted, the lean bias is trimmed toward neutral, for the
   * fault bucket and the approach bucket (3..14 m back, a stall is slow so mostly 3 m: the bucket before the face).
   */
  stalled(x: number, speed: number, learnRate = 1): Adjustment[] {
    const out: Adjustment[] = [];
    const approachX = x - Math.max(3, Math.min(14, speed * 0.9));
    const buckets = new Set<number>([SectionMemory.bucketOf(approachX), SectionMemory.bucketOf(x)]);
    for (const b of buckets) {
      let note = '';
      this.edit(b, (p) => {
        p.faults++;
        p.stalls = (p.stalls ?? 0) + 1;
        // A stall under a face means "commit": back to at least the default approach speed, plus 0.1 per stall
        // (stall #1 -> 1.1, #2 -> 1.2, ...; the 1.6 clamp holds) — the opposite of the first fast crash's "slower".
        p.speedScale = Math.max(1, p.speedScale) + 0.1 * learnRate;
        p.throttleCap = 1;
        p.leanBias *= 0.5;
        note = `stalled: speed ${p.speedScale.toFixed(2)} thr cap 1 lean ${p.leanBias.toFixed(2)} (stall #${p.stalls})`;
      });
      const adj = { bucket: b, note: `x≈${b * BUCKET}: ${note}` };
      out.push(adj);
      this.log.push(adj);
    }
    return out;
  }

  /** Passing a bucket cleanly nudges its parameters back toward the defaults. */
  clear(x: number): void {
    const b = SectionMemory.bucketOf(x);
    if (!this.m.has(b)) return;
    this.edit(b, (p) => {
      p.clears++;
      if (p.clears >= 2) {
        p.speedScale += (1 - p.speedScale) * 0.15;
        p.leanBias *= 0.85;
      }
    });
  }

  snapshot(): Record<number, SectionParams> {
    const o: Record<number, SectionParams> = {};
    for (const [k, v] of this.m) o[k] = { ...v };
    return o;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
