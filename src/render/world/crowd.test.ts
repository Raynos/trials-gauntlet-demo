import { describe, expect, it } from 'vitest';
import { Rng } from '../../core/rng';
import { CHEER_POSES, CROWD_CELLS, IDLE_POSES, castCrowd, crowdTint } from './crowd';

/** Ask 62: the painted crowd's cast — pose variety, colour variety, determinism (the atlas painter needs a canvas; the cast is what it draws). */
describe('castCrowd', () => {
  for (const night of [false, true]) {
    describe(night ? 'night' : 'day', () => {
      const cast = castCrowd(new Rng(0x5eed), night);

      it(`has ${CROWD_CELLS} figures`, () => {
        expect(cast).toHaveLength(CROWD_CELLS);
      });

      it('uses every idle pose and every cheer pose at least three times (≥ 4 poses each row)', () => {
        expect(IDLE_POSES.length).toBeGreaterThanOrEqual(4);
        expect(CHEER_POSES.length).toBeGreaterThanOrEqual(4);
        for (const p of IDLE_POSES) expect(cast.filter((f) => f.idle === p).length).toBeGreaterThanOrEqual(3);
        for (const p of CHEER_POSES) expect(cast.filter((f) => f.cheer === p).length).toBeGreaterThanOrEqual(3);
      });

      it('gives atlas neighbours different idle poses and different shirts', () => {
        for (let i = 1; i < cast.length; i++) {
          expect(cast[i]!.idle).not.toBe(cast[i - 1]!.idle);
          expect(cast[i]!.shirt).not.toBe(cast[i - 1]!.shirt);
        }
      });

      it('has 12 distinct shirt colours across the 16 figures and more than one skin, trouser and headwear', () => {
        expect(new Set(cast.map((f) => f.shirt)).size).toBe(12);
        expect(new Set(cast.map((f) => f.skin)).size).toBeGreaterThan(2);
        expect(new Set(cast.map((f) => f.pants)).size).toBeGreaterThan(2);
        expect(new Set(cast.map((f) => f.head)).size).toBeGreaterThan(1);
      });

      it('is deterministic per seed', () => {
        expect(castCrowd(new Rng(0x5eed), night)).toEqual(cast);
        expect(castCrowd(new Rng(0x5eee), night)).not.toEqual(cast);
      });
    });
  }

  it('night and day casts differ in wardrobe (jackets and beanies at night, sunglasses by day)', () => {
    const day = castCrowd(new Rng(7), false);
    const night = castCrowd(new Rng(7), true);
    expect(day.some((f) => f.glasses)).toBe(true);
    expect(night.some((f) => f.glasses)).toBe(false);
    expect(night.filter((f) => f.head === 'beanie' || f.head === 'hood').length).toBeGreaterThan(day.filter((f) => f.head === 'beanie' || f.head === 'hood').length);
  });

  it('per-instance tint is a mild exposure wobble, never a colour cast', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 50; i++) {
      const c = crowdTint(rng, i % 2 === 0);
      for (const v of [c.r, c.g, c.b]) {
        expect(v).toBeGreaterThan(0.65);
        expect(v).toBeLessThanOrEqual(1.06);
      }
      expect(Math.abs(c.r - c.b)).toBeLessThan(0.12);
    }
  });
});
