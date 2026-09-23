import { describe, expect, it } from 'vitest';
import type { Medal, TrackDef } from '../core/types';
import { ROCKHOP_ALL } from '../tracks';
import { isPlaygroundTrack, shipTracks } from './progress';
import { allMarkers, ANCHOR, buildRegions, CONTINENT, fitZoom, fogPatches, frameFor, locate, MAP, markersInView, nextGate, REGIONS, regionDots, ROAD, routeMarkers, routePath, routeSplit, smoothPath, tierBlend, ZOOM } from './worldMap';

/** The shipped set (store release Phase 3): twelve courses in four zones and the four FREE RIDE playgrounds. */
const ALL: TrackDef[] = [...ROCKHOP_ALL];
const COAST_DONE: Record<string, Medal> = { 'c1-low-tide': 'gold', 'c2-crane-hop': 'silver', 'c3-hull-breach': 'bronze' };
const none = (): Medal | null => null;
const coastDone = (id: string): Medal | null => COAST_DONE[id] ?? null;
const inside = (p: { x: number; y: number }): boolean => p.x >= 0 && p.x <= MAP.w && p.y >= 0 && p.y <= MAP.h;

describe('world map — the ROCKHOP zones (data)', () => {
  it('four zones in campaign order, each crop 3:2 inside the plate, a name and fog', () => {
    expect(REGIONS.map((r) => r.id)).toEqual(['coast', 'alpine', 'quarry', 'snowline']);
    for (const r of REGIONS) {
      expect(r.crop.x).toBeGreaterThanOrEqual(0);
      expect(r.crop.y).toBeGreaterThanOrEqual(0);
      expect(r.crop.x + r.crop.w).toBeLessThanOrEqual(MAP.w);
      expect(r.crop.y + r.crop.h).toBeLessThanOrEqual(MAP.h);
      expect(Math.abs(r.crop.w / r.crop.h - 1.5)).toBeLessThan(0.02);
      expect(inside(r.name)).toBe(true);
      expect(r.fog.length).toBeGreaterThan(0);
    }
    expect(CONTINENT.y + CONTINENT.h).toBeLessThanOrEqual(MAP.h);
  });

  it('every shipped course and playground has an authored anchor inside its zone crop; no Labs, no retired tracks', () => {
    const markers = allMarkers(buildRegions(ALL, none));
    expect(markers).toHaveLength(16);
    expect(markers.filter((m) => !m.proving)).toHaveLength(12);
    expect(markers.filter((m) => isPlaygroundTrack(m.track))).toHaveLength(4);
    expect(markers.some((m) => m.code === 'LAB')).toBe(false);
    for (const m of markers) {
      expect(ANCHOR[m.track.id], m.track.id).toBeDefined();
      const r = REGIONS.find((x) => x.id === m.region)!;
      expect(m.x, `${m.track.id} x in ${m.region}`).toBeGreaterThanOrEqual(r.crop.x);
      expect(m.x, `${m.track.id} x in ${m.region}`).toBeLessThanOrEqual(r.crop.x + r.crop.w);
      expect(m.y, `${m.track.id} y in ${m.region}`).toBeGreaterThanOrEqual(r.crop.y);
      expect(m.y, `${m.track.id} y in ${m.region}`).toBeLessThanOrEqual(r.crop.y + r.crop.h);
    }
    // No two diamonds (46 px hit boxes) overlap at the zoom where markers start taking pointers.
    for (let i = 0; i < markers.length; i++)
      for (let j = i + 1; j < markers.length; j++) {
        const d = Math.hypot(markers[i]!.x - markers[j]!.x, markers[i]!.y - markers[j]!.y);
        expect(d, `${markers[i]!.track.id} vs ${markers[j]!.track.id}`).toBeGreaterThanOrEqual(46 / ZOOM.plates);
      }
  });

  it('fresh profile: COAST open with C1 up next, every later zone locked and fogged, the gate on the trail into ALPINE', () => {
    const regions = buildRegions(ALL, none);
    const ms = routeMarkers(regions);
    expect(ms.map((m) => m.code)).toEqual(['C1', 'C2', 'C3', 'A1', 'A2', 'A3', 'D1', 'D2', 'D3', 'S1', 'S2', 'S3']);
    const by = Object.fromEntries(ms.map((m) => [m.code, m]));
    expect(by['C1']!.locked).toBe(false);
    expect(by['C1']!.upNext).toBe(true);
    expect(by['A1']!.locked).toBe(true);
    expect(by['A1']!.rule).toBe('Medal every Coast track');
    expect(by['D1']!.rule).toBe('Medal every Alpine track');
    expect(regions.map((r) => `${r.id}:${r.done}/${r.total}${r.locked ? ' locked' : ''}`)).toEqual(['coast:0/3', 'alpine:0/3 locked', 'quarry:0/3 locked', 'snowline:0/3 locked']);
    // The coast playground is open with its zone; the others wait with theirs.
    const free = allMarkers(regions).filter((m) => m.proving);
    expect(free.map((m) => `${m.region}:${m.locked ? 'locked' : 'open'}`)).toEqual(['coast:open', 'alpine:locked', 'quarry:locked', 'snowline:locked']);
    const gate = nextGate(regions)!;
    expect(gate.track.id).toBe('a1-sawdust');
    expect(gate.stage).toBe('alpine');
    expect(gate.rule).toBe('Medal every Coast track');
    expect(inside(gate)).toBe(true);
    expect(Math.hypot(gate.dx, gate.dy)).toBeCloseTo(1, 5);
    expect(fogPatches(regions).map((f) => f.key)).toEqual(expect.arrayContaining(['alpine', 'quarry', 'snowline']));
  });

  it('coast medalled: ALPINE opens, A1 up next, the gate moves to the quarry, the rest of the road are spurs', () => {
    const regions = buildRegions(ALL, coastDone);
    const by = Object.fromEntries(routeMarkers(regions).map((m) => [m.code, m]));
    expect(by['A1']!.upNext).toBe(true);
    expect(by['A3']!.locked).toBe(false);
    expect(by['D1']!.locked).toBe(true);
    expect(regions.find((r) => r.id === 'alpine')!.locked).toBe(false);
    const { main, spurs } = routeSplit(regions);
    expect(main.map((m) => m.code)).toEqual(['C1', 'C2', 'C3', 'A1', 'A2', 'A3', 'D1', 'D2', 'D3']);
    expect(spurs.map((s) => `${s.from.code}>${s.to.code}`)).toEqual(['D3>S1', 'D3>S2', 'D3>S3']);
    const gate = nextGate(regions)!;
    expect(gate.track.id).toBe('d1-dust-devil');
    expect(gate.x).toBe(Math.round(by['A3']!.x + (by['D1']!.x - by['A3']!.x) * 0.62));
    expect(regionDots(regions[0]!)).toEqual(['gold', 'silver', 'bronze']);
  });

  it('route path: the lit trail covers the medalled coast legs; every ROAD key names two real markers inside the plate', () => {
    const regions = buildRegions(ALL, coastDone);
    const { dim, lit } = routePath(regions);
    expect(dim.startsWith('M ')).toBe(true);
    expect((lit.match(/M /g) ?? []).length).toBe(1);
    const ids = new Set(routeMarkers(regions).map((m) => m.track.id));
    for (const [k, pts] of Object.entries(ROAD)) {
      const [from, to] = k.split('>');
      expect(ids.has(from!), k).toBe(true);
      expect(ids.has(to!), k).toBe(true);
      for (const pt of pts) expect(inside(pt), k).toBe(true);
    }
    expect(routePath(buildRegions(ALL, none)).lit).toBe('');
  });

  it('every zone medalled: no gate, no spurs, no fog', () => {
    const regions = buildRegions(ALL, () => 'gold');
    expect(nextGate(regions)).toBeNull();
    expect(routeSplit(regions).spurs).toEqual([]);
    expect(fogPatches(regions)).toEqual([]);
    expect(regions.every((r) => r.done === r.total)).toBe(true);
  });

  it('smoothPath is a cubic spline through the points', () => {
    expect(smoothPath([])).toBe('');
    expect(smoothPath([{ x: 0, y: 0 }])).toBe('');
    expect(smoothPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }])).toMatch(/^M 0 0 C .* 10 0 C .* 20 10$/);
  });

  it('zoom: the continent covers a 932 × 430 phone below the region zoom; the tier blend runs 0 → 1', () => {
    const z = fitZoom(932, 430);
    expect(z).toBeLessThan(ZOOM.region);
    expect(z).toBeCloseTo(Math.max(932 / CONTINENT.w, 430 / CONTINENT.h), 3);
    expect(fitZoom(100000, 100000)).toBe(ZOOM.region);
    expect(tierBlend(0.2)).toBe(0);
    expect(tierBlend(ZOOM.tier)).toBe(1);
  });

  it('frames: every zone frame lies inside the plate and holds all of its markers; the coast frame shows the forest beyond', () => {
    const regions = buildRegions(ALL, coastDone);
    for (const r of regions) {
      const f = r.frame;
      expect(f.x + f.w).toBeLessThanOrEqual(MAP.w);
      expect(f.y + f.h).toBeLessThanOrEqual(MAP.h);
      for (const m of r.markers) {
        expect(m.x, `${m.track.id} in ${r.id} frame`).toBeGreaterThanOrEqual(f.x);
        expect(m.x, `${m.track.id} in ${r.id} frame`).toBeLessThanOrEqual(f.x + f.w);
        expect(m.y, `${m.track.id} in ${r.id} frame`).toBeGreaterThanOrEqual(f.y);
        expect(m.y, `${m.track.id} in ${r.id} frame`).toBeLessThanOrEqual(f.y + f.h);
      }
    }
    const coast = regions[0]!;
    const a1 = ANCHOR['a1-sawdust']!;
    expect(a1.x).toBeLessThanOrEqual(coast.frame.x + coast.frame.w);
    const phone = frameFor(coast, 932, 430);
    expect(phone.k).toBeGreaterThan(ZOOM.plates);
    expect(frameFor(coast, 4000, 4000).k).toBe(1.3);
  });

  it('markersInView / locate', () => {
    const regions = buildRegions(ALL, coastDone);
    const c1 = ANCHOR['c1-low-tide']!;
    const k = ZOOM.region;
    const ids = markersInView(regions, { x: 466 - c1.x * k, y: 215 - c1.y * k, k }, 932, 430).map((m) => m.code);
    expect(ids).toContain('C1');
    expect(ids).toContain('C2');
    expect(ids).not.toContain('S3');
    expect(locate(regions, 'd3-rope-walk')).toEqual({ region: 2, marker: 2 });
    expect(locate(regions, 'nope')).toBeNull();
  });

  it('shipTracks is the campaign in zone order: C1..S3, no playgrounds', () => {
    expect(shipTracks(ALL).map((t) => (t.meta as { code?: string }).code)).toEqual(['C1', 'C2', 'C3', 'A1', 'A2', 'A3', 'D1', 'D2', 'D3', 'S1', 'S2', 'S3']);
  });
});
