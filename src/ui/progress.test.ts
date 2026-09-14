import { describe, expect, it } from 'vitest';
import type { Medal, TrackDef, TrackTier } from '../core/types';
import { medalTotals, nextTrack, shipTracks, tierUnlocked } from './progress';

const t = (id: string, tier: TrackTier): TrackDef => ({ id, name: id, tier, seed: 1, profile: [], obstacles: [], checkpoints: [], start: { pos: { x: 0, y: 0 }, angle: 0 }, finishX: 10 });
const tracks = [t('b1', 'beginner'), t('b2', 'beginner'), t('beginner-test', 'beginner'), t('e1', 'easy'), t('m1', 'medium'), t('h1', 'hard'), t('x1', 'extreme')];
const medals = (m: Record<string, Medal>) => (id: string) => m[id] ?? null;

describe('tier progression', () => {
  it('beginner is always open; later tiers need a medal on every authored track of every earlier tier', () => {
    const none = medals({});
    expect(tierUnlocked(tracks, 'beginner', none)).toBe(true);
    expect(tierUnlocked(tracks, 'easy', none)).toBe(false);
    const halfway = medals({ b1: 'gold' });
    expect(tierUnlocked(tracks, 'easy', halfway)).toBe(false);
    const beginnerDone = medals({ b1: 'gold', b2: 'bronze' }); // test strip does not count
    expect(tierUnlocked(tracks, 'easy', beginnerDone)).toBe(true);
    expect(tierUnlocked(tracks, 'medium', beginnerDone)).toBe(false);
    expect(tierUnlocked(tracks, 'extreme', medals({ b1: 'gold', b2: 'bronze', e1: 'silver', m1: 'bronze', h1: 'bronze' }))).toBe(true);
  });

  it('?dev=1 unlocks everything and shows the test strips', () => {
    expect(tierUnlocked(tracks, 'extreme', medals({}), true)).toBe(true);
    expect(shipTracks(tracks).map((x) => x.id)).not.toContain('beginner-test');
    expect(shipTracks(tracks, true).map((x) => x.id)).toContain('beginner-test');
  });

  it('nextTrack is the first unfinished open track, or the last played one when it is open', () => {
    expect(nextTrack(tracks, medals({}))?.id).toBe('b1');
    expect(nextTrack(tracks, medals({ b1: 'gold' }))?.id).toBe('b2');
    expect(nextTrack(tracks, medals({ b1: 'gold', b2: 'gold' }))?.id).toBe('e1');
    expect(nextTrack(tracks, medals({ b1: 'gold', b2: 'gold' }), false, 'b1')?.id).toBe('b1');
    expect(nextTrack(tracks, medals({}), false, 'x1')?.id).toBe('b1'); // locked last-played is ignored
  });

  it('medal totals count authored tracks only', () => {
    const tot = medalTotals(tracks, medals({ b1: 'gold', 'beginner-test': 'gold', e1: 'bronze' }));
    expect(tot).toMatchObject({ total: 6, cleared: 2, gold: 1, bronze: 1 });
  });
});
