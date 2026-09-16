import { describe, expect, it } from 'vitest';
import type { PlacedObstacle, TrackDef } from '../core/types';
import { compileTrack, getTrack } from '../tracks';
import { REVIEW_TAGS, ReviewStore, buildReview, reviewSegments, segmentAt } from './review';

function memStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe('level reviewer (docs/design/game.md §21)', () => {
  const def = getTrack('b1-first-ride')!;
  const compiled = compileTrack(def);

  it('six equal segments start → finish when the track authors none, every placed thing counted once', () => {
    const segs = reviewSegments(def, compiled.placed, []);
    expect(segs).toHaveLength(6);
    expect(segs[0]!.from).toBe(def.start.pos.x);
    expect(segs[5]!.to).toBe(def.finishX);
    for (let k = 1; k < 6; k++) expect(segs[k]!.from).toBeCloseTo(segs[k - 1]!.to, 9);
    const counted = segs.reduce((n, s) => n + s.kinds.reduce((m, [, c]) => m + c, 0), 0);
    const inRange = compiled.placed.filter((p) => p.pos.x >= def.start.pos.x && p.pos.x <= def.finishX).length;
    expect(counted).toBe(inRange);
    expect(segmentAt(segs, def.start.pos.x)).toBe(0);
    expect(segmentAt(segs, def.finishX + 5)).toBe(5);
  });

  it('a ship track takes its six from SHIP_SEGMENTS (labelled beats), a playground from meta.segments', () => {
    const segs = reviewSegments(def, compiled.placed);
    expect(segs).toHaveLength(6);
    expect(segs[0]!.label).toMatch(/Start/);
    expect(segs[5]!.to).toBe(Math.round(def.finishX));
    const p1 = getTrack('p1-container-yard');
    if (p1) expect(reviewSegments(p1).map((s) => s.label).every((l) => l.length > 0)).toBe(true);
  });

  it('authored meta.segments (six) win over the equal split', () => {
    const authored = Array.from({ length: 6 }, (_, k) => ({ from: k * 10, to: k * 10 + 10, label: `S${k + 1}` }));
    const t = { ...def, meta: { ...def.meta, segments: authored } } as unknown as TrackDef;
    const placed: PlacedObstacle[] = [{ kind: 'ramp', pos: { x: 12, y: 0 }, params: {}, colliderIds: [] }, { kind: 'ramp', pos: { x: 14, y: 0 }, params: {}, colliderIds: [] }];
    const segs = reviewSegments(t, placed);
    expect(segs.map((s) => s.label)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
    expect(segs[1]!.kinds).toEqual([['ramp', 2]]);
  });

  it('notes round-trip through storage per track / segment; empties are dropped; unknown tags filtered', () => {
    const st = new ReviewStore(memStorage());
    st.save('b1-first-ride', 4, { rating: 3, tags: ['too hard', 'fun'], comment: 'kicker lands short' });
    expect(st.get('b1-first-ride', 4).comment).toBe('kicker lands short');
    expect(st.get('b1-first-ride', 4).at).toMatch(/^\d{4}-/);
    expect(st.count('b1-first-ride')).toBe(1);
    expect(st.count('b2-lean-back')).toBe(0);
    st.save('b1-first-ride', 4, { rating: 0, tags: [], comment: '  ' });
    expect(st.count('b1-first-ride')).toBe(0);
    const raw = memStorage();
    raw.setItem('trials.review.x', JSON.stringify({ 2: { rating: 9, tags: ['fun', 'bogus'], comment: 'c' } }));
    const n = new ReviewStore(raw).get('x', 2);
    expect(n.tags).toEqual(['fun']);
  });

  it('Copy review = a markdown table then the JSON in a fence: {track, build, segments:[{i, from, to, rating, tags, comment}], at}', () => {
    const segs = reviewSegments(def, compiled.placed);
    const { data, text } = buildReview(def, 'build abc1234', segs, { 4: { rating: 2, tags: ['unreadable'], comment: 'where is | the gap?', at: '' } }, '2026-09-15T00:00:00.000Z');
    expect(data.track).toBe('b1-first-ride');
    expect(data.build).toBe('build abc1234');
    expect(data.segments).toHaveLength(6);
    expect(data.segments[3]).toMatchObject({ i: 4, rating: 2, tags: ['unreadable'], comment: 'where is | the gap?' });
    expect(text).toContain('| # | Range | Segment | Rating | Tags | Comment |');
    expect(text).toContain('| 4 |');
    expect(text).toContain('where is \\| the gap?');
    const fenced = /```json\n(.*)\n```/.exec(text)!;
    expect(JSON.parse(fenced[1]!)).toEqual(data);
    expect(REVIEW_TAGS).toContain('asset missing');
  });
});
