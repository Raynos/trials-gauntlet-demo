import { describe, expect, it } from 'vitest';
import type { Medal, TrackDef } from '../core/types';
import { getTrack, listTrackIds } from '../tracks';
import { buildPages, defaultPin, fitZoom, gateAnchor, locate, nextGate, PAGE_ORDER, pageDots, pageOf, pinAnchors, pinsInView, PLATE_OFFSET, routePins, TILE, unlockRule, WORLD, worldOf, worldRoute, ZOOM } from './trackMap';

const ALL: TrackDef[] = listTrackIds().map((id) => getTrack(id)!).filter((t) => !!t);
const none = (): Medal | null => null;
/** Round-1 seeded state: Beginner and Easy medalled (6 / 15), Medium open, Hard the gate. */
const SEEDED: Record<string, Medal> = { 'b1-first-ride': 'gold', 'b2-lean-back': 'silver', 'b3-kicker-row': 'bronze', 'e1-uphill-weight': 'silver', 'e2-rear-wheel-first': 'bronze', 'e3-stairway': 'silver' };
const seeded = (id: string): Medal | null => SEEDED[id] ?? null;

describe('track map regions (the six plates in campaign order, the island first)', () => {
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
    // Lit trail: every leg out of a medalled pin — B1→B2→B3→M1 and E1→E2→E3→M2 (two subpaths, six legs); the leg M1→E1 stays dim.
    const route = worldRoute(pages);
    expect(route.lit.split('Q')).toHaveLength(7);
    expect(route.lit.split('M ')).toHaveLength(3);
    expect(route.dim.split('Q')).toHaveLength(15);
    expect(route.dim.startsWith(route.lit.slice(0, 40))).toBe(true);
    const nc = pages.find((p) => p.id === 'nightCity')!;
    expect(nc.locked).toBe(true);
    expect(nc.pins.map((p) => p.rule)).toEqual(['Medal every Medium track', 'Medal every Medium track']);
    expect(pageDots(nc)).toEqual(['locked', 'locked']);
    const foundry = pages.find((p) => p.id === 'foundry')!;
    expect(foundry.pins.map((p) => p.locked)).toEqual([false, true, true, true]);
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
    const fresh0 = buildPages(ALL, none);
    expect(worldRoute(fresh0).lit).toBe('');
    expect(fresh0.find((p) => p.id === 'industrial')!.pins[0]!.upNext).toBe(true);
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
  it('runs left vertex to right vertex with a zigzag, and stays on the tile', () => {
    for (const n of [1, 2, 3, 4, 6]) {
      const a = pinAnchors(n, 'industrial');
      expect(a).toHaveLength(n);
      for (const p of a) {
        expect(p.x).toBeGreaterThanOrEqual(10);
        expect(p.x).toBeLessThanOrEqual(90);
        expect(p.y).toBeGreaterThanOrEqual(30);
        expect(p.y).toBeLessThanOrEqual(60);
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

describe('world space (one mountain: the apron at the foot, the Foundry summit top-right)', () => {
  /** Px per world unit at zoom 1 on a 932×430 phone (a 446 px plate). */
  const K = 446 / TILE.w;

  it('stacks the six plates diagonally up-and-right and the world bounds hold every plate', () => {
    const order = PAGE_ORDER.map((p) => p.id);
    for (let i = 2; i < order.length; i++) {
      const a = PLATE_OFFSET[order[i - 1]!];
      const b = PLATE_OFFSET[order[i]!];
      expect(b.x).toBeGreaterThan(a.x);
      expect(b.y).toBeLessThan(a.y);
    }
    // The island sits below Industrial (the apron at the foot), a little to its left.
    expect(PLATE_OFFSET.island.y).toBeGreaterThan(PLATE_OFFSET.industrial.y);
    expect(PLATE_OFFSET.island.x).toBeLessThan(PLATE_OFFSET.industrial.x);
    expect(PLATE_OFFSET.foundry.y).toBeLessThan(PLATE_OFFSET.industrial.y);
    for (const o of Object.values(PLATE_OFFSET)) {
      expect(o.x).toBeGreaterThanOrEqual(0);
      expect(o.y).toBeGreaterThanOrEqual(0);
      expect(o.x + TILE.w).toBeLessThanOrEqual(WORLD.w);
      expect(o.y + TILE.h).toBeLessThanOrEqual(WORLD.h);
    }
    expect(worldOf('industrial', 0, 0)).toEqual(PLATE_OFFSET.industrial);
    expect(worldOf('canyon', 100, 100)).toEqual({ x: PLATE_OFFSET.canyon.x + TILE.w, y: PLATE_OFFSET.canyon.y + TILE.h });
  });

  /**
   * Pins hold their screen size (the 44 px disc) at every working zoom, so their world footprint is `px / (K × zoom)`:
   * at the opening zoom a full pin (name plate + times) is 93×104 px (a proving pin 80×92); from ZOOM.plates down to
   * ZOOM.pinMin it is code + disc only, 48×62 px. No two may overlap (the harness overlap rule: > 4 px on both axes).
   */
  const overlaps = (zoom: number, full: boolean): string[] => {
    const k = K * zoom;
    const pages = buildPages(ALL, seeded);
    const pins = pages.flatMap((p) => p.pins);
    const box = (p: { wx: number; wy: number; proving: boolean }) => {
      const w = (full ? (p.proving ? 80 : 93) : 48) / k;
      const hgt = (full ? (p.proving ? 92 : 104) : 62) / k;
      return { l: p.wx - w / 2, r: p.wx + w / 2, t: p.wy - 36 / k, b: p.wy - 36 / k + hgt };
    };
    const bad: string[] = [];
    for (let i = 0; i < pins.length; i++)
      for (let j = i + 1; j < pins.length; j++) {
        const a = box(pins[i]!);
        const b = box(pins[j]!);
        const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
        const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (ox > 4 / k && oy > 4 / k) bad.push(`${pins[i]!.code}×${pins[j]!.code} ${Math.round(ox * k)}×${Math.round(oy * k)}`);
      }
    return bad;
  };

  it('no two pins on the mountain overlap: full pins from the opening zoom up, code + disc pins down to the fold', () => {
    expect(buildPages(ALL, seeded).flatMap((p) => p.pins).every((p) => Number.isFinite(p.wx) && Number.isFinite(p.wy))).toBe(true);
    expect(overlaps(ZOOM.open, true)).toEqual([]);
    expect(overlaps(ZOOM.plates, true)).toEqual([]);
    expect(overlaps(ZOOM.max, true)).toEqual([]);
    expect(overlaps(ZOOM.plates, false)).toEqual([]);
    expect(overlaps(ZOOM.pinMin, false)).toEqual([]);
  });

  it('one trail in biome order: B1 … M1, E1 … E3, M2 X1, H1 H2, M3 … X3; it climbs (each region above the last)', () => {
    const pages = buildPages(ALL, seeded);
    const trail = routePins(pages);
    expect(trail.map((p) => p.code)).toEqual(['B1', 'B2', 'B3', 'M1', 'E1', 'E2', 'E3', 'M2', 'X1', 'H1', 'H2', 'M3', 'H3', 'X2', 'X3']);
    const first = (id: string) => trail.find((p) => pageOf(p.track) === id)!;
    expect(first('canyon').wy).toBeLessThan(first('industrial').wy);
    expect(first('snow').wy).toBeLessThan(first('canyon').wy);
    expect(first('foundry').wy).toBeLessThan(first('nightCity').wy);
    // The Lab and the pads are off the trail.
    expect(trail.some((p) => p.proving)).toBe(false);
  });

  it('the tier barrier stands on the trail between the pin before the gate track and the gate track (the seam below Night City when seeded)', () => {
    const pages = buildPages(ALL, seeded);
    const gate = nextGate(ALL, seeded)!;
    const at = gateAnchor(pages, gate);
    const trail = routePins(pages);
    const h1 = trail.find((p) => p.code === 'H1')!;
    const x1 = trail.find((p) => p.code === 'X1')!;
    expect(at.x).toBe(Math.round((h1.wx + x1.wx) / 2));
    expect(at.y).toBe(Math.round((h1.wy + x1.wy) / 2 + 5));
    // Fresh profile: Easy is the gate; the barrier sits between M1 and E1.
    const fresh = buildPages(ALL, none);
    const g0 = nextGate(ALL, none)!;
    const a0 = gateAnchor(fresh, g0);
    const m1 = routePins(fresh).find((p) => p.code === 'M1')!;
    const e1 = routePins(fresh).find((p) => p.code === 'E1')!;
    expect(a0.x).toBe(Math.round((m1.wx + e1.wx) / 2));
  });

  it('camera: the fit zoom shows the whole mountain and folds the pins; the opening zoom at 932×430 shows about one biome (4–6 pins); the max is a biome filling the viewport', () => {
    // 932×430 landscape phone: the map box is ~932×370, the plate 446 px wide.
    const zMin = fitZoom(932, 370, 446);
    expect(zMin).toBeLessThan(ZOOM.pinMin);
    expect(WORLD.w * K * zMin).toBeLessThanOrEqual(932);
    expect(WORLD.h * K * zMin).toBeLessThanOrEqual(370);
    // 844×390: the plate is 403 px wide.
    expect(fitZoom(844, 330, 403)).toBeLessThan(ZOOM.pinMin);
    expect(ZOOM.max).toBeGreaterThan(ZOOM.open);
    expect(ZOOM.open).toBeGreaterThan(ZOOM.pinMin);
    const pages = buildPages(ALL, seeded);
    const m1 = pages.find((p) => p.id === 'industrial')!.pins[3]!;
    // Opening camera: M1 at the centre of the free box (the card's right edge → the altimeter's left edge), the opening zoom.
    const k1 = K * ZOOM.open;
    const cam = { x: 500 - m1.wx * k1, y: 185 - m1.wy * k1, k: k1 };
    const seen = pinsInView(pages, cam, 932, 370).map((p) => p.code);
    expect(seen).toContain('M1');
    expect(seen.length).toBeGreaterThanOrEqual(4);
    expect(seen.length).toBeLessThanOrEqual(6);
    // Never the whole map: fewer than half the pins at zoom 1.
    expect(seen.length).toBeLessThan(pages.flatMap((p) => p.pins).length / 2);
    // At the fit zoom, every pin is on screen.
    const k0 = K * zMin;
    const all = pinsInView(pages, { x: (932 - WORLD.w * k0) / 2, y: (370 - WORLD.h * k0) / 2, k: k0 }, 932, 370);
    expect(all.length).toBe(pages.flatMap((p) => p.pins).length);
  });
});
