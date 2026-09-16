import { describe, expect, it } from 'vitest';
import type { Medal, TrackDef } from '../core/types';
import { getTrack, listTrackIds } from '../tracks';
import { buildPages, defaultPin, locate, nextGate, PAGE_ORDER, pageDots, pageOf, pinAnchors, unlockRule } from './trackMap';

const ALL: TrackDef[] = listTrackIds().map((id) => getTrack(id)!).filter((t) => !!t);
const none = (): Medal | null => null;
/** Round-1 seeded state: Beginner and Easy medalled (6 / 15), Medium open, Hard the gate. */
const SEEDED: Record<string, Medal> = { 'b1-first-ride': 'gold', 'b2-lean-back': 'silver', 'b3-kicker-row': 'bronze', 'e1-uphill-weight': 'silver', 'e2-rear-wheel-first': 'bronze', 'e3-stairway': 'silver' };
const seeded = (id: string): Medal | null => SEEDED[id] ?? null;

describe('track map pages (A3b: one tile per page, the island first)', () => {
  it('has six pages in the fixed order and every shipped track lands on exactly one', () => {
    const pages = buildPages(ALL, none);
    expect(pages.map((p) => p.id)).toEqual(PAGE_ORDER.map((p) => p.id));
    const ids = pages.flatMap((p) => p.pins.map((x) => x.track.id));
    expect(new Set(ids).size).toBe(ids.length);
    // The 15 campaign tracks + 5 playgrounds + the lab tracks; `-test` strips only in dev.
    expect(ids.filter((id) => id.endsWith('-test') && !id.startsWith('lab-'))).toEqual([]);
    expect(ids.filter((id) => /^[bemhx]\d-/.test(id))).toHaveLength(15);
    expect(ids.filter((id) => /^p\d-/.test(id))).toHaveLength(5);
    expect(buildPages(ALL, none, true).flatMap((p) => p.pins).filter((x) => x.track.id.endsWith('-test') && !x.track.id.startsWith('lab-')).length).toBeGreaterThan(0);
  });

  it('groups by biome, in tier order, with the island holding lab and playgrounds', () => {
    const pages = buildPages(ALL, none);
    const by = Object.fromEntries(pages.map((p) => [p.id, p.pins.map((x) => x.code)]));
    expect(by['industrial']).toEqual(['B1', 'B2', 'B3', 'M1']);
    expect(by['canyon']).toEqual(['E1', 'E2', 'E3']);
    expect(by['snow']).toEqual(['M2', 'X1']);
    expect(by['nightCity']).toEqual(['H1', 'H2']);
    expect(by['foundry']).toEqual(['M3', 'H3', 'X2', 'X3']);
    expect(by['island']!.slice(-5)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5']);
    expect(by['island']!.slice(0, -5).every((c) => c === 'LAB')).toBe(true);
    expect(pageOf(getTrack('h3-fire-line')!)).toBe('foundry');
  });

  it('seeded state: 3/4 industrial cleared, the route lit to M1, UP NEXT on M1, Hard locked with its rule', () => {
    const pages = buildPages(ALL, seeded);
    const ind = pages.find((p) => p.id === 'industrial')!;
    expect(ind.done).toBe(3);
    expect(ind.total).toBe(4);
    expect(ind.locked).toBe(false);
    expect(pageDots(ind)).toEqual(['gold', 'silver', 'bronze', 'open']);
    expect(ind.pins.map((p) => p.upNext)).toEqual([false, false, false, true]);
    // Lit route: through the three medalled pins and on to the next one.
    expect(ind.routeLit.split('Q')).toHaveLength(4);
    expect(ind.route).toBe(ind.routeLit);
    const nc = pages.find((p) => p.id === 'nightCity')!;
    expect(nc.locked).toBe(true);
    expect(nc.pins.map((p) => p.rule)).toEqual(['Medal every Medium track', 'Medal every Medium track']);
    expect(pageDots(nc)).toEqual(['locked', 'locked']);
    const foundry = pages.find((p) => p.id === 'foundry')!;
    expect(foundry.pins.map((p) => p.locked)).toEqual([false, true, true, true]);
    expect(foundry.routeLit).toBe('');
    expect(defaultPin(ind)).toBe(3);
    expect(defaultPin(nc)).toBe(0);
    expect(defaultPin(foundry)).toBe(0);
  });

  it('fresh profile: nothing lit, Easy is the gate; seeded: Hard is the gate on the Night City page; dev: no gate', () => {
    const fresh = nextGate(ALL, none)!;
    expect(fresh.tier).toBe('easy');
    expect(fresh.track.id).toBe('e1-uphill-weight');
    expect(fresh.rule).toBe('Medal every Beginner track');
    const gate = nextGate(ALL, seeded)!;
    expect(gate.tier).toBe('hard');
    expect(gate.track.id).toBe('h1-wheelie-wire');
    expect(gate.page).toBe('nightCity');
    expect(nextGate(ALL, none, true)).toBeNull();
    expect(unlockRule('beginner')).toBe('');
    const ind = buildPages(ALL, none).find((p) => p.id === 'industrial')!;
    expect(ind.routeLit).toBe('');
    expect(ind.pins[0]!.upNext).toBe(true);
  });

  it('locates a track and opens on the page holding it', () => {
    const pages = buildPages(ALL, seeded);
    expect(locate(pages, 'm1-hop-up')).toEqual({ page: 1, pin: 3 });
    expect(locate(pages, 'x1-vertical-limit')).toEqual({ page: 3, pin: 1 });
    expect(locate(pages, 'p4-night-circuit')).toEqual({ page: 0, pin: pages[0]!.pins.length - 2 });
    expect(locate(pages, 'nope')).toBeNull();
    expect(locate(pages, null)).toBeNull();
  });
});

describe('pin anchors (tile space, no two name plates on top of each other)', () => {
  it('runs front-left to back-right with a zigzag, and stays on the tile', () => {
    for (const n of [1, 2, 3, 4, 6]) {
      const a = pinAnchors(n, 'industrial');
      expect(a).toHaveLength(n);
      for (const p of a) {
        expect(p.x).toBeGreaterThanOrEqual(10);
        expect(p.x).toBeLessThanOrEqual(90);
        expect(p.y).toBeGreaterThanOrEqual(25);
        expect(p.y).toBeLessThanOrEqual(70);
      }
      for (let i = 1; i < n; i++) expect(a[i]!.x).toBeGreaterThan(a[i - 1]!.x);
    }
    // Four campaign pins: ≥ 19 % apart in x (≥ 88 px on the 466 px tile at 932×430, a 5.8 rem plate is 91 px).
    const four = pinAnchors(4, 'foundry');
    for (let i = 1; i < 4; i++) expect(four[i]!.x - four[i - 1]!.x).toBeGreaterThanOrEqual(19);
    expect(pinAnchors(0, 'snow')).toEqual([]);
  });

  it('island: lab pins at the hangar (back), the five pads along the front, ≥ 18 % apart', () => {
    const a = pinAnchors(7, 'island');
    expect(a).toHaveLength(7);
    expect(a[0]!.y).toBeLessThan(35);
    expect(a[1]!.y).toBeLessThan(35);
    const pads = a.slice(2);
    for (let i = 1; i < pads.length; i++) expect(pads[i]!.x - pads[i - 1]!.x).toBeGreaterThanOrEqual(18);
    expect(pinAnchors(5, 'island')).toEqual(pads);
  });
});
