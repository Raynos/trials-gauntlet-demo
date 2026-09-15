import { describe, expect, it } from 'vitest';
import { ACTIONS } from './actions';
import { NO_PLAN_FALLBACKS, PERTURB, fallbackOpening, identicalFaults } from './play';

describe('bot no-plan fallback (round 11: perturbed openings against a repeated fault)', () => {
  it('counts the trailing run of faults within 0.5 m', () => {
    expect(identicalFaults([])).toBe(0);
    expect(identicalFaults([100, 100.2, 100.4])).toBe(3);
    expect(identicalFaults([90, 100.2, 100.4])).toBe(2);
    expect(identicalFaults([100, 100.2, 130])).toBe(1);
  });

  it('is the plain cycle below the threshold and a seeded perturbation above it, deterministic per seed', () => {
    for (let bans = 0; bans < 9; bans++) expect(fallbackOpening(42, bans, 0)).toEqual([NO_PLAN_FALLBACKS[bans % NO_PLAN_FALLBACKS.length]]);
    expect(fallbackOpening(42, 5, PERTURB.after - 1)).toEqual([NO_PLAN_FALLBACKS[5]]);
    const a = fallbackOpening(42, 5, PERTURB.after);
    expect(a).toEqual(fallbackOpening(42, 5, PERTURB.after));
    expect(a.length).toBeGreaterThan(1);
    for (const id of a) expect(ACTIONS[id]).toBeDefined();
  });

  it('successive identical faults from one root play different openings (no lock), with a speed re-draw past the widen threshold', () => {
    const seen = new Set<string>();
    const openings: number[][] = [];
    for (let k = 0; k < 12; k++) {
      const bans = 7 + k; // one more ban per fault
      const o = fallbackOpening(1066951255, bans, PERTURB.after + k);
      openings.push(o);
      seen.add(o.join(','));
    }
    // At least 8 distinct openings across 12 identical faults; the plain cycle alone repeats after 7.
    expect(seen.size).toBeGreaterThanOrEqual(8);
    // Past `widenAfter` the openings can carry an approach re-draw (brake / coast slots) before the base macro.
    const late = openings.filter((_, k) => PERTURB.after + k >= PERTURB.widenAfter);
    expect(late.some((o) => o.length > 3)).toBe(true);
    // A different seed draws differently.
    expect(fallbackOpening(1, 9, 5)).not.toEqual(fallbackOpening(2, 9, 5));
  });
});
