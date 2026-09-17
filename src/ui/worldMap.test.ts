import { describe, expect, it } from 'vitest';
import type { Medal, TrackDef } from '../core/types';
import { getTrack, listTrackIds } from '../tracks';
import { isLabTrack, isPlaygroundTrack, shipTracks } from './progress';
import { allMarkers, ANCHOR, buildRegions, CONTINENT, fitZoom, fogPatches, frameFor, locate, MAP, markersInView, nextGate, REGIONS, regionDots, ROAD, routeMarkers, routePath, routeSplit, smoothPath, tierBlend, ZOOM } from './worldMap';

const ALL: TrackDef[] = listTrackIds().map((id) => getTrack(id)!).filter((t) => !!t);
const SEEDED: Record<string, Medal> = { 'b1-first-ride': 'gold', 'b2-lean-back': 'silver', 'b3-kicker-row': 'bronze', 'e1-uphill-weight': 'silver', 'e2-rear-wheel-first': 'bronze', 'e3-stairway': 'silver' };
const none = (): Medal | null => null;
const seeded = (id: string): Medal | null => SEEDED[id] ?? null;
const inside = (p: { x: number; y: number }): boolean => p.x >= 0 && p.x <= MAP.w && p.y >= 0 && p.y <= MAP.h;

describe('world map — the painted continent (data)', () => {
  it('five regions in campaign order, each crop inside the plate and overlapping the continent box', () => {
    expect(REGIONS.map((r) => r.id)).toEqual(['industrial', 'canyon', 'snow', 'nightCity', 'foundry']);
    for (const r of REGIONS) {
      expect(r.crop.x).toBeGreaterThanOrEqual(0);
      expect(r.crop.y).toBeGreaterThanOrEqual(0);
      expect(r.crop.x + r.crop.w).toBeLessThanOrEqual(MAP.w);
      expect(r.crop.y + r.crop.h).toBeLessThanOrEqual(MAP.h);
      // 3:2 crops (the region plates are 1536 × 1024).
      expect(Math.abs(r.crop.w / r.crop.h - 1.5)).toBeLessThan(0.02);
      expect(inside(r.name)).toBe(true);
      expect(r.fog.length).toBeGreaterThan(0);
    }
    expect(CONTINENT.y + CONTINENT.h).toBeLessThanOrEqual(MAP.h);
  });

  it('every shipped track — 15 campaign, the Lab tracks and the five playgrounds — has an authored anchor inside its region crop', () => {
    const regions = buildRegions(ALL, none);
    const markers = allMarkers(regions);
    const expected = ALL.filter((t) => !t.id.endsWith('-test') || t.id.startsWith('lab-'));
    expect(markers).toHaveLength(expected.length);
    expect(markers.filter((m) => !m.proving)).toHaveLength(15);
    expect(markers.filter((m) => isPlaygroundTrack(m.track))).toHaveLength(5);
    expect(markers.filter((m) => isLabTrack(m.track)).length).toBeGreaterThanOrEqual(1);
    for (const m of markers) {
      expect(ANCHOR[m.track.id], m.track.id).toBeDefined();
      const r = REGIONS.find((x) => x.id === m.region)!;
      expect(m.x, `${m.track.id} x in ${m.region}`).toBeGreaterThanOrEqual(r.crop.x);
      expect(m.x, `${m.track.id} x in ${m.region}`).toBeLessThanOrEqual(r.crop.x + r.crop.w);
      expect(m.y, `${m.track.id} y in ${m.region}`).toBeGreaterThanOrEqual(r.crop.y);
      expect(m.y, `${m.track.id} y in ${m.region}`).toBeLessThanOrEqual(r.crop.y + r.crop.h);
    }
    // No two markers share a spot, and none stand closer than a diamond's width (the 46 px hit box) at the lowest zoom where markers take pointers.
    for (let i = 0; i < markers.length; i++)
      for (let j = i + 1; j < markers.length; j++) {
        const d = Math.hypot(markers[i]!.x - markers[j]!.x, markers[i]!.y - markers[j]!.y);
        expect(d, `${markers[i]!.track.id} vs ${markers[j]!.track.id}`).toBeGreaterThanOrEqual(46 / ZOOM.plates);
      }
  });

  it('dev `-test` strips get a fallback anchor near their region name, each on its own spot', () => {
    const regions = buildRegions(ALL, none, true);
    const tests = allMarkers(regions).filter((m) => m.track.id.endsWith('-test') && !m.track.id.startsWith('lab-'));
    expect(tests.length).toBeGreaterThan(0);
    const spots = new Set(tests.map((m) => `${m.x},${m.y}`));
    expect(spots.size).toBe(tests.length);
    for (const m of tests) expect(inside(m)).toBe(true);
  });

  it('fresh profile: Beginner open, the rest locked with their rules, B1 up next, no medals; every region beyond Industrial fogged as its state says', () => {
    const regions = buildRegions(ALL, none);
    const ms = routeMarkers(regions);
    expect(ms.map((m) => m.code)).toEqual(['B1', 'B2', 'B3', 'M1', 'E1', 'E2', 'E3', 'M2', 'X1', 'H1', 'H2', 'M3', 'H3', 'X2', 'X3']);
    const by = Object.fromEntries(ms.map((m) => [m.code, m]));
    expect(by['B1']!.locked).toBe(false);
    expect(by['B1']!.upNext).toBe(true);
    expect(by['E1']!.locked).toBe(true);
    expect(by['E1']!.rule).toBe('Medal every Beginner track');
    expect(by['H1']!.rule).toBe('Medal every Hard track'.replace('Hard', 'Medium'));
    expect(regions.map((r) => `${r.id}:${r.done}/${r.total}${r.locked ? ' locked' : ''}`)).toEqual(['industrial:0/4', 'canyon:0/3 locked', 'snow:0/2 locked', 'nightCity:0/2 locked', 'foundry:0/4 locked']);
    const gate = nextGate(regions)!;
    expect(gate.track.id).toBe('e1-uphill-weight');
    expect(gate.tier).toBe('easy');
    expect(inside(gate)).toBe(true);
    // The gate stands on the leg from the last open marker (M1 is medium → locked too; B3 is the last open) toward E1.
    expect(gate.x).toBeGreaterThan(Math.min(by['B3']!.x, by['E1']!.x) - 1);
    expect(Math.hypot(gate.dx, gate.dy)).toBeCloseTo(1, 5);
  });

  it('seeded profile (Beginner + Easy medalled): Medium open, M1 up next, the gate at Hard on the road from M2 into Night City, X1 a spur', () => {
    const regions = buildRegions(ALL, seeded);
    const ms = routeMarkers(regions);
    const by = Object.fromEntries(ms.map((m) => [m.code, m]));
    expect(by['M1']!.upNext).toBe(true);
    expect(by['M1']!.locked).toBe(false);
    expect(by['M2']!.locked).toBe(false);
    expect(by['H1']!.locked).toBe(true);
    expect(by['H1']!.rule).toBe('Medal every Medium track');
    expect(by['X1']!.locked).toBe(true);
    expect(regions.map((r) => `${r.done}/${r.total}`)).toEqual(['3/4', '3/3', '0/2', '0/2', '0/4']);
    expect(regions.find((r) => r.id === 'nightCity')!.locked).toBe(true);
    expect(regions.find((r) => r.id === 'snow')!.locked).toBe(false);
    const { main, spurs } = routeSplit(regions);
    expect(main.map((m) => m.code)).toEqual(['B1', 'B2', 'B3', 'M1', 'E1', 'E2', 'E3', 'M2', 'H1', 'H2', 'M3', 'H3']);
    expect(spurs.map((s) => `${s.from.code}>${s.to.code}`)).toEqual(['M2>X1', 'H3>X2', 'H3>X3']);
    const gate = nextGate(regions)!;
    expect(gate.track.id).toBe('h1-wheelie-wire');
    expect(gate.rule).toBe('Medal every Medium track');
    // 62 % of the way from M2 to H1.
    expect(gate.x).toBe(Math.round(by['M2']!.x + (by['H1']!.x - by['M2']!.x) * 0.62));
    expect(gate.y).toBe(Math.round(by['M2']!.y + (by['H1']!.y - by['M2']!.y) * 0.62));
    // Fog: the two locked regions' ellipses plus one patch per locked marker in an open region (X1 in Snow; X2, X3 in the Foundry are in a region that is not fully locked).
    const fog = fogPatches(regions);
    const nc = regions.find((r) => r.id === 'nightCity')!;
    expect(fog.length).toBe(nc.fog.length + 1 + 3);
    expect(fog.filter((f) => f.key === 'nightCity')).toHaveLength(nc.fog.length);
    expect(fog.map((f) => f.key)).toContain('x1-vertical-limit');
    expect(fog.map((f) => f.key)).not.toContain('snow');
  });

  it('route path: the main road through 12 markers in the seeded state, the lit part covering the six medalled legs (E3 → M2 included), three spurs', () => {
    const regions = buildRegions(ALL, seeded);
    const { dim, lit, spurs } = routePath(regions);
    expect(dim.startsWith('M ')).toBe(true);
    // 11 legs, each carrying its traced road waypoints (`ROAD`) — more curves than legs, one subpath.
    expect((dim.match(/ C /g) ?? []).length).toBeGreaterThanOrEqual(11);
    expect((dim.match(/M /g) ?? []).length).toBe(1);
    // Lit: B1→B2→B3→M1 (3 legs, one subpath) and E1→E2→E3→M2 (3 legs, one subpath).
    expect((lit.match(/M /g) ?? []).length).toBe(2);
    expect((lit.match(/ C /g) ?? []).length).toBeGreaterThanOrEqual(6);
    // Every road waypoint lies inside the plate, and every road key names two real markers.
    const ids = new Set(routeMarkers(regions).map((m) => m.track.id));
    for (const [k, pts] of Object.entries(ROAD)) {
      const [from, to] = k.split('>');
      expect(ids.has(from!), k).toBe(true);
      expect(ids.has(to!), k).toBe(true);
      for (const pt of pts) expect(inside(pt), k).toBe(true);
    }
    expect((spurs.match(/M /g) ?? []).length).toBe(3);
    expect(routePath(buildRegions(ALL, none)).lit).toBe('');
  });

  it('every tier open: no gate, no spurs, no fog', () => {
    const all = (): Medal => 'gold';
    const regions = buildRegions(ALL, all);
    expect(nextGate(regions)).toBeNull();
    expect(routeSplit(regions).spurs).toEqual([]);
    expect(fogPatches(regions)).toEqual([]);
    expect(regions.every((r) => r.done === r.total)).toBe(true);
    expect(regionDots(regions[0]!)).toEqual(['gold', 'gold', 'gold', 'gold']);
  });

  it('smoothPath is a cubic spline through the points', () => {
    expect(smoothPath([])).toBe('');
    expect(smoothPath([{ x: 0, y: 0 }])).toBe('');
    const d = smoothPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }]);
    expect(d).toMatch(/^M 0 0 C .* 10 0 C .* 20 10$/);
  });

  it('zoom: the continent covers a 932 × 430 phone below the region zoom, the tier blend runs 0 → 1 up to the tier zoom', () => {
    const z = fitZoom(932, 430);
    expect(z).toBeLessThan(ZOOM.region);
    expect(z).toBeCloseTo(Math.max(932 / CONTINENT.w, 430 / CONTINENT.h), 3);
    expect(fitZoom(1280, 720)).toBeCloseTo(Math.min(ZOOM.region, Math.max(1280 / CONTINENT.w, 720 / CONTINENT.h)), 3);
    expect(fitZoom(100000, 100000)).toBe(ZOOM.region);
    expect(tierBlend(0.2)).toBe(0);
    expect(tierBlend(ZOOM.tier)).toBe(1);
    expect(tierBlend(ZOOM.tier * 0.85)).toBeCloseTo(0.5, 5);
    expect(ZOOM.plates).toBeLessThan(ZOOM.region);
    expect(ZOOM.max).toBeGreaterThan(ZOOM.region);
  });

  it('frames: every region has a frame box inside the plate that holds all of its markers; Industrial\'s holds the Canyon\'s too (the mockup\'s region view); frameFor fits it between the plate zoom and 1.3', () => {
    const regions = buildRegions(ALL, seeded);
    for (const r of regions) {
      const f = r.frame;
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w).toBeLessThanOrEqual(MAP.w);
      expect(f.y + f.h).toBeLessThanOrEqual(MAP.h);
      for (const m of r.markers) {
        expect(m.x, `${m.track.id} in ${r.id} frame`).toBeGreaterThanOrEqual(f.x);
        expect(m.x, `${m.track.id} in ${r.id} frame`).toBeLessThanOrEqual(f.x + f.w);
        expect(m.y, `${m.track.id} in ${r.id} frame`).toBeGreaterThanOrEqual(f.y);
        expect(m.y, `${m.track.id} in ${r.id} frame`).toBeLessThanOrEqual(f.y + f.h);
      }
    }
    const ind = regions[0]!;
    const canyon = regions[1]!;
    for (const m of canyon.markers) {
      expect(m.x).toBeGreaterThanOrEqual(ind.frame.x);
      expect(m.x).toBeLessThanOrEqual(ind.frame.x + ind.frame.w);
      expect(m.y).toBeGreaterThanOrEqual(ind.frame.y);
      expect(m.y).toBeLessThanOrEqual(ind.frame.y + ind.frame.h);
    }
    const phone = frameFor(ind, 932, 430);
    expect(phone.k).toBeCloseTo(Math.min(932 / ind.frame.w, 430 / ind.frame.h), 3);
    expect(phone.k).toBeGreaterThan(ZOOM.plates);
    expect(phone.x).toBe(ind.frame.x + ind.frame.w / 2);
    expect(frameFor(ind, 100, 100).k).toBeCloseTo(ZOOM.plates + 0.05, 3);
    expect(frameFor(ind, 4000, 4000).k).toBe(1.3);
  });

  it('markersInView / locate', () => {
    const regions = buildRegions(ALL, seeded);
    const b1 = ANCHOR['b1-first-ride']!;
    // Camera centred on B1 at region zoom on a phone: B1 and its Industrial neighbours are on screen, the Foundry is not.
    const k = ZOOM.region;
    const cam = { x: 466 - b1.x * k, y: 215 - b1.y * k, k };
    const ids = markersInView(regions, cam, 932, 430).map((m) => m.code);
    expect(ids).toContain('B1');
    expect(ids).toContain('B2');
    expect(ids).not.toContain('M3');
    expect(locate(regions, 'h1-wheelie-wire')).toEqual({ region: 3, marker: 0 });
    expect(locate(regions, 'nope')).toBeNull();
    expect(locate(regions, null)).toBeNull();
  });

  it('shipTracks order is not the route order: the route runs by region, tier inside', () => {
    const ship = shipTracks(ALL);
    const regions = buildRegions(ALL, none);
    const route = routeMarkers(regions).map((m) => m.track.id);
    expect(route).not.toEqual(ship.map((t) => t.id));
    expect(new Set(route)).toEqual(new Set(ship.map((t) => t.id)));
  });
});
