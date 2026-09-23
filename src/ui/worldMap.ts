/**
 * World map — the painted continent as the level select (project/archive/WORLD_MAP.md, ask 54). Pure data and
 * layout for `WorldMapScreen` (worldMapScreen.ts), unit-tested in worldMap.test.ts: the map's coordinate
 * space (the world plate's pixel grid), one anchor per track on the terrain, the four ROCKHOP zones in campaign
 * order with their plate crops and fog, the route through every campaign track, the zone gate on the road into
 * the next locked zone, and the camera's zoom tiers. No DOM here.
 *
 * Coordinates: "map units" are pixels of the world plate (`MAP.w × MAP.h`); the screen draws the scene at
 * `k` screen px per map unit (`k` is the zoom). Every anchor was read off the W-worldmap mockup
 * (assets/design/store-release/round1/W-worldmap.png, the map band at y 158..866) and the World owner painted the
 * plate's trail through them (044464a8).
 */
import type { Medal, TrackDef } from '../core/types';
import { isLabTrack, isPlaygroundTrack, nextTrack, shipTracks, stageOf, stagesOf, trackUnlocked, unlockRuleFor, zoneOf, type MedalOf } from './progress';

/** A zone of the map: `coast | alpine | quarry | snowline` (the ROCKHOP zones, src/tracks/rockhop/zones.ts). */
export type RegionId = string;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RegionDef {
  id: RegionId;
  /** The name floating over the terrain (serif capitals in the mockup). */
  label: string;
  /** Where the name sits (map units, its centre). */
  name: { x: number; y: number };
  /**
   * The region plate's crop of the world plate (map units): the tile the ~3× plate covers. Crops overlap their
   * neighbours a little so the feathered edges blend over the same terrain.
   */
  crop: Box;
  /**
   * What the screen frames when it opens on a track of this region (map units): the region and its neighbour on the
   * route, the way the A region mockup shows Industrial with the Canyon beyond it — never one marker centred alone.
   */
  frame: Box;
  /** Fog of war when the region is locked: soft ellipses (centre + radii, map units) laid over its land. */
  fog: { x: number; y: number; rx: number; ry: number }[];
  /** Lamp colour: the region's own light (name-plate tint on the card, the marker's spire when open and medal-less). */
  lamp: string;
}

/** The world plate: 1536 × 1024 map units; the land the fit zoom covers is `CONTINENT` (the sea and sky around it are air). */
export const MAP = { w: 1536, h: 1024 } as const;
/** The box the fit zoom covers: the harbour to the snowline, not the open sea and sky around them. */
export const CONTINENT: Box = { x: 0, y: 150, w: 1536, h: 760 };

/** Campaign order: the trail runs from the harbour (south-west) through the forest and the quarry up to the snowline. */
export const REGIONS: readonly RegionDef[] = [
  {
    id: 'coast',
    label: 'Coastal Scrapyard',
    name: { x: 190, y: 530 },
    crop: { x: 0, y: 330, w: 700, h: 467 },
    // The harbour with the forest beyond it: the opening frame of a new player (W-worldmap's left half).
    frame: { x: 0, y: 330, w: 1000, h: 520 },
    fog: [{ x: 250, y: 600, rx: 300, ry: 170 }],
    lamp: '#2FB8C4',
  },
  {
    id: 'alpine',
    label: 'Alpine Forest Trail',
    name: { x: 730, y: 380 },
    crop: { x: 430, y: 300, w: 720, h: 480 },
    frame: { x: 380, y: 300, w: 1000, h: 480 },
    fog: [{ x: 800, y: 560, rx: 330, ry: 170 }, { x: 640, y: 440, rx: 200, ry: 120 }],
    lamp: '#7FBF6A',
  },
  {
    id: 'quarry',
    label: 'Desert Quarry',
    name: { x: 1080, y: 300 },
    crop: { x: 900, y: 190, w: 636, h: 424 },
    frame: { x: 860, y: 180, w: 676, h: 470 },
    fog: [{ x: 1250, y: 430, rx: 290, ry: 160 }, { x: 1100, y: 330, rx: 180, ry: 110 }],
    lamp: '#E0A55A',
  },
  {
    id: 'snowline',
    label: 'Snowline',
    name: { x: 1440, y: 215 },
    crop: { x: 1080, y: 140, w: 456, h: 304 },
    frame: { x: 1000, y: 120, w: 536, h: 380 },
    fog: [{ x: 1370, y: 270, rx: 210, ry: 120 }],
    lamp: '#9FD8FF',
  },
];

/**
 * Where each course stands on the terrain (map units): C1–C3 along the harbour trail, A1–A3 through the forest, D1–D3
 * up the quarry benches, S1–S3 under the lifts; the four FREE RIDE flags at each zone's edge (W-worldmap).
 */
export const ANCHOR: Readonly<Record<string, { x: number; y: number }>> = {
  'c1-low-tide': { x: 120, y: 668 },
  'c2-crane-hop': { x: 265, y: 605 },
  'c3-hull-breach': { x: 390, y: 563 },
  'a1-sawdust': { x: 632, y: 578 },
  'a2-log-jam': { x: 803, y: 611 },
  'a3-timberline': { x: 997, y: 585 },
  'd1-dust-devil': { x: 1200, y: 470 },
  'd2-conveyor': { x: 1350, y: 447 },
  'd3-rope-walk': { x: 1418, y: 410 },
  's1-lift-line': { x: 1310, y: 262 },
  's2-cornice': { x: 1380, y: 290 },
  's3-whiteout': { x: 1452, y: 318 },
  'p-coast': { x: 68, y: 614 },
  'p-alpine': { x: 562, y: 406 },
  'p-quarry': { x: 1490, y: 378 },
  'p-snowline': { x: 1255, y: 205 },
};

/**
 * The trail between two markers (map units, in travel order) so the route follows the painted track rather than
 * cutting across water or rock. Keyed `<from id>>` + `<to id>`; a leg with no entry is a straight run.
 */
export const ROAD: Readonly<Record<string, { x: number; y: number }[]>> = {
  'c1-low-tide>c2-crane-hop': [{ x: 180, y: 640 }],
  'c2-crane-hop>c3-hull-breach': [{ x: 330, y: 582 }],
  'c3-hull-breach>a1-sawdust': [{ x: 450, y: 585 }, { x: 540, y: 590 }],
  'a1-sawdust>a2-log-jam': [{ x: 715, y: 600 }],
  'a2-log-jam>a3-timberline': [{ x: 900, y: 600 }],
  'a3-timberline>d1-dust-devil': [{ x: 1080, y: 560 }, { x: 1140, y: 510 }],
  'd1-dust-devil>d2-conveyor': [{ x: 1280, y: 455 }],
  'd2-conveyor>d3-rope-walk': [{ x: 1390, y: 432 }],
  'd3-rope-walk>s1-lift-line': [{ x: 1400, y: 360 }, { x: 1350, y: 310 }],
  's1-lift-line>s2-cornice': [{ x: 1345, y: 272 }],
  's2-cornice>s3-whiteout': [{ x: 1416, y: 300 }],
};

/** The points of the leg from `a` to `b`: the road's waypoints between them, else straight. */
export function legPoints(a: { x: number; y: number; track: { id: string } }, b: { x: number; y: number; track: { id: string } }): { x: number; y: number }[] {
  const road = ROAD[`${a.track.id}>${b.track.id}`] ?? [];
  return [{ x: a.x, y: a.y }, ...road, { x: b.x, y: b.y }];
}

/**
 * Zoom (screen px per map unit): `region` is the working zoom the screen opens at (the mockup's region view: Industrial
 * and the Canyon on a landscape phone), `max` a region filling the viewport; `plates` is where markers drop their name plates (code + diamond
 * only, so neighbours never collide), `tier` where the region plates have fully faded in over the world plate
 * (they start fading at `tier × 0.7`). The fit zoom (whole continent) is the floor, computed per viewport.
 */
export const ZOOM = { region: 0.8, max: 2.6, plates: 0.65, tier: 0.75 } as const;
/** Fly-to duration (ms). */
export const FLY_MS = 380;
/** A pointer that travels more than this (px) is a drag, not a tap. */
export const TAP_SLOP = 8;

/** The zone a track stands in (`meta.zone`); a track the map does not know sits with the first zone. */
export function regionOf(t: TrackDef): RegionId {
  return zoneOf(t) ?? REGIONS[0]!.id;
}

/** `C1`, `A2`, … from the course's own metadata; a zone playground reads `FREE RIDE`. */
export function codeOf(t: TrackDef): string {
  if (isLabTrack(t)) return 'LAB';
  if (isPlaygroundTrack(t)) return 'Free ride';
  return (t.meta as { code?: string } | undefined)?.code ?? t.id.split('-')[0]!.toUpperCase();
}

/** The rule on a locked stage: `Medal every Coast track`. */
export function unlockRule(stage: string, tracks: readonly TrackDef[] = []): string {
  return unlockRuleFor(tracks.length ? tracks : [{ meta: { zone: stage } } as unknown as TrackDef], stage);
}

export interface Marker {
  track: TrackDef;
  /** `B1`, `M1`, `P3`, `LAB`. */
  code: string;
  region: RegionId;
  medal: Medal | null;
  locked: boolean;
  /** Lab / playground: outside medals and progression (blue diamond). */
  proving: boolean;
  /** The first unridden track of the highest open zone (`lastPlayed` never moves the flag). */
  upNext: boolean;
  /** Unlock rule when locked: `Medal every Coast track`. */
  rule: string | null;
  /** Map units. */
  x: number;
  y: number;
  /** Index along the route (campaign markers), −1 for proving markers. */
  routeIndex: number;
}

export interface Region extends RegionDef {
  index: number;
  markers: Marker[];
  /** Campaign markers. */
  done: number;
  total: number;
  /** Every campaign marker locked (Night City before Hard opens): fogged. */
  locked: boolean;
}

export interface Gate {
  /** The locked stage (a zone) the gate opens onto. */
  stage: string;
  track: TrackDef;
  rule: string;
  region: RegionId;
  /** On the route, at the mouth of the leg into the gate track (map units). */
  x: number;
  y: number;
  /** Direction of travel along that leg (unit vector), for the chevrons. */
  dx: number;
  dy: number;
}

/**
 * The anchor of a track: its authored place, else a spot near its region's name (dev `-test` strips and any track
 * the map does not know yet), stepped so two unknowns never share a spot.
 */
export function anchorOf(t: TrackDef, ordinal = 0): { x: number; y: number } {
  const a = ANCHOR[t.id];
  if (a) return a;
  const r = REGIONS.find((x) => x.id === regionOf(t)) ?? REGIONS[0]!;
  return { x: r.name.x + 40 + ordinal * 46, y: r.name.y + 60 };
}

/** The campaign route: regions in campaign order, tier order (then authored order) inside each — the road never doubles back. */
export function routeOrder(campaign: readonly TrackDef[]): TrackDef[] {
  const out: TrackDef[] = [];
  for (const r of REGIONS) out.push(...campaign.filter((t) => regionOf(t) === r.id));
  return out;
}

/**
 * The five regions with their markers. `tracks` is the full list (lab, playgrounds, campaign, `-test` strips in
 * dev). Markers inside a region: the campaign in route order, then the Lab, then the playgrounds.
 */
export function buildRegions(tracks: readonly TrackDef[], medalOf: MedalOf, dev = false): Region[] {
  const ship = shipTracks(tracks, dev);
  const campaign = shipTracks(tracks);
  const next = nextTrack(campaign, medalOf, dev);
  const route = routeOrder(ship);
  const proving = tracks.filter((t) => isLabTrack(t) || isPlaygroundTrack(t));
  proving.sort((a, b) => Number(isPlaygroundTrack(a)) - Number(isPlaygroundTrack(b)) || a.id.localeCompare(b.id));
  let unknown = 0;
  const mk = (t: TrackDef): Marker => {
    const isProving = isLabTrack(t) || isPlaygroundTrack(t);
    const locked = !trackUnlocked(ship.length ? [...ship, t] : [t], t, medalOf, dev);
    const at = anchorOf(t, ANCHOR[t.id] ? 0 : unknown++);
    return {
      track: t,
      code: codeOf(t),
      region: regionOf(t),
      medal: isProving ? null : medalOf(t.id),
      locked,
      proving: isProving,
      upNext: !isProving && next?.id === t.id && medalOf(t.id) === null,
      rule: locked ? unlockRuleFor(ship, stageOf(t)) : null,
      x: at.x,
      y: at.y,
      routeIndex: isProving ? -1 : route.indexOf(t),
    };
  };
  return REGIONS.map((def, index) => {
    const markers = [...route.filter((t) => regionOf(t) === def.id), ...proving.filter((t) => regionOf(t) === def.id)].map(mk);
    const camp = markers.filter((m) => !m.proving);
    return {
      ...def,
      index,
      markers,
      done: camp.filter((m) => m.medal).length,
      total: camp.length,
      locked: camp.length > 0 && camp.every((m) => m.locked),
    };
  });
}

/** Every campaign marker along the route, in route order. */
export function routeMarkers(regions: readonly Region[]): Marker[] {
  return regions
    .flatMap((r) => r.markers.filter((m) => !m.proving))
    .sort((a, b) => a.routeIndex - b.routeIndex);
}

/** Every marker (route first, then the Lab and the playgrounds) — the order `nav()` steps through. */
export function allMarkers(regions: readonly Region[]): Marker[] {
  return [...routeMarkers(regions), ...regions.flatMap((r) => r.markers.filter((m) => m.proving))];
}

/**
 * The road: the main route runs through every campaign marker up to and including the gate tier (the first locked
 * tier); markers of the tiers beyond it hang off the road as spurs (a dashed leg from the main marker before them —
 * the Snow summit's X1 off M2), so the road out of the open land goes straight to the gate and the next unlock.
 * Everything is on the main road when every tier is open.
 */
export function routeSplit(regions: readonly Region[]): { main: Marker[]; spurs: { from: Marker; to: Marker }[] } {
  const ms = routeMarkers(regions);
  const order = stagesOf(ms.map((m) => m.track));
  const gateStage = order.find((stage) => ms.some((m) => stageOf(m.track) === stage && m.locked));
  const beyond = gateStage ? order.slice(order.indexOf(gateStage) + 1) : [];
  const main: Marker[] = [];
  const spurs: { from: Marker; to: Marker }[] = [];
  for (const m of ms) {
    if (beyond.includes(stageOf(m.track)) && main.length > 0) spurs.push({ from: main[main.length - 1]!, to: m });
    else main.push(m);
  }
  return { main, spurs };
}

/**
 * The road as SVG path data in map units — the main route (`dim`), its lit part (every leg that leaves a medalled
 * marker: the cleared stretches, each running on to the next marker, so the road out of E3 glows toward M2 while M1
 * waits — `''` when nothing is medalled) and the spurs (one subpath each).
 */
export function routePath(regions: readonly Region[]): { dim: string; lit: string; spurs: string } {
  const { main, spurs } = routeSplit(regions);
  // The whole road: every leg's points chained (a leg's first point is the previous leg's last).
  const chain = (ms: Marker[]): { x: number; y: number }[] => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < ms.length - 1; i++) {
      const leg = legPoints(ms[i]!, ms[i + 1]!);
      pts.push(...(i === 0 ? leg : leg.slice(1)));
    }
    return pts.length ? pts : ms.map((m) => ({ x: m.x, y: m.y }));
  };
  const legs: string[] = [];
  let run: Marker[] = [];
  const flush = (): void => {
    if (run.length >= 2) legs.push(smoothPath(chain(run)));
    run = [];
  };
  for (let i = 0; i < main.length - 1; i++) {
    if (main[i]!.medal) {
      if (run.length === 0) run.push(main[i]!);
      run.push(main[i + 1]!);
    } else flush();
  }
  flush();
  return { dim: main.length >= 2 ? smoothPath(chain(main)) : '', lit: legs.join(' '), spurs: spurs.map((s) => smoothPath(legPoints(s.from, s.to))).join(' ') };
}

/** A Catmull-Rom spline through the points as cubic Béziers (a road, not a ruler). */
export function smoothPath(p: { x: number; y: number }[]): string {
  if (p.length < 2) return '';
  const f = (n: number): string => (Math.round(n * 10) / 10).toString();
  let d = `M ${f(p[0]!.x)} ${f(p[0]!.y)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i]!;
    const p1 = p[i]!;
    const p2 = p[i + 1]!;
    const p3 = p[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

/**
 * The first locked tier's first track (by route), with its rule and its place on the road — on the leg into it
 * from the last open marker on the main route, 62 % of the way (the mouth of the locked land) — `null` when
 * every tier is open.
 */
export function nextGate(regions: readonly Region[]): Gate | null {
  const { main } = routeSplit(regions);
  const i = main.findIndex((m) => m.locked);
  const gate = main[i];
  if (!gate) return null;
  const from = main.slice(0, i).reverse().find((m) => !m.locked) ?? gate;
  const x = Math.round(from.x + (gate.x - from.x) * 0.62);
  const y = Math.round(from.y + (gate.y - from.y) * 0.62);
  const len = Math.hypot(gate.x - from.x, gate.y - from.y) || 1;
  return { stage: stageOf(gate.track), track: gate.track, rule: gate.rule ?? '', region: gate.region, x, y, dx: (gate.x - from.x) / len, dy: (gate.y - from.y) / len };
}

export interface FogPatch {
  /** The region id (a locked region's fog) or the track id (a locked marker's patch in open land). */
  key: string;
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** Fog of war: every locked zone's ellipses, plus a patch on each locked marker standing in open land. */
export function fogPatches(regions: readonly Region[]): FogPatch[] {
  const out: FogPatch[] = [];
  for (const r of regions) {
    if (r.locked) {
      out.push(...r.fog.map((f) => ({ key: r.id, ...f })));
      continue;
    }
    for (const m of r.markers) if (m.locked) out.push({ key: m.track.id, x: m.x, y: m.y - 10, rx: 120, ry: 80 });
  }
  return out;
}

/** The zoom at which the continent (`CONTINENT`) covers a `vw × vh` viewport — the whole land on screen, no dark bands (never above the region zoom). */
export function fitZoom(vw: number, vh: number): number {
  const z = Math.max(vw / CONTINENT.w, vh / CONTINENT.h);
  return Math.max(0.05, Math.min(ZOOM.region, Math.round(z * 1000) / 1000));
}

/**
 * The opening camera for a region on a `vw × vh` view: its `frame` box fitted (the zoom that shows all of it, kept
 * between the plate zoom + a margin and 1.3 so the plates read and the terrain is not a close-up), centred on the
 * box — the region and its neighbour on the route, as the A region mockup frames Industrial with the Canyon beyond.
 */
export function frameFor(region: RegionDef, vw: number, vh: number): { x: number; y: number; k: number } {
  const f = region.frame;
  const k = Math.max(ZOOM.plates + 0.05, Math.min(1.3, Math.min(vw / f.w, vh / f.h)));
  return { x: f.x + f.w / 2, y: f.y + f.h / 2, k: Math.round(k * 1000) / 1000 };
}

/** Region-plate opacity at zoom `k`: 0 below 70 % of the tier zoom, 1 from the tier zoom up, linear between. */
export function tierBlend(k: number): number {
  const lo = ZOOM.tier * 0.7;
  return Math.max(0, Math.min(1, (k - lo) / (ZOOM.tier - lo)));
}

/** Markers whose anchors fall inside the screen window, given the camera (`x, y` = the map origin's screen position, `k` = px per map unit). */
export function markersInView(regions: readonly Region[], cam: { x: number; y: number; k: number }, vw: number, vh: number): Marker[] {
  const out: Marker[] = [];
  for (const r of regions)
    for (const m of r.markers) {
      const sx = cam.x + m.x * cam.k;
      const sy = cam.y + m.y * cam.k;
      if (sx >= 0 && sx <= vw && sy >= 0 && sy <= vh) out.push(m);
    }
  return out;
}

/** Region + marker index of a track id. */
export function locate(regions: readonly Region[], trackId: string | null | undefined): { region: number; marker: number } | null {
  if (!trackId) return null;
  for (const r of regions) {
    const i = r.markers.findIndex((m) => m.track.id === trackId);
    if (i >= 0) return { region: r.index, marker: i };
  }
  return null;
}

/** Medal / open / locked dots for a region's campaign markers in route order (the region's name line). */
export function regionDots(region: Region): ('platinum' | 'gold' | 'silver' | 'bronze' | 'open' | 'locked')[] {
  return region.markers.filter((m) => !m.proving).map((m) => m.medal ?? (m.locked ? 'locked' : 'open'));
}

/**
 * Art-pack paths (`public/art/worldmap/`, cut by assets/art/worldmap.mjs): the world plate and the four
 * zone plates, 2x (1536 wide) for dense screens, 1x (1024) otherwise.
 *
 * `?v=` is the build's hash of `public/art/worldmap/` (ask 58). These 13 files are not in the art
 * manifest and are not content-addressed by name, so the version travels in the query — which is what
 * lets `vercel.json` serve them with a one-month cache instead of revalidating every plate every time.
 */
declare const __WORLDMAP_V__: string | undefined;
// Same shape as `BUILD_STAMP` in src/ui/front.ts: vitest.config.ts carries no `define`, so a bare
// reference would be a ReferenceError under the unit tests.
const PLATE_V = typeof __WORLDMAP_V__ === 'string' ? `?v=${__WORLDMAP_V__}` : '';
export function worldPlateSrc(hi: boolean): string {
  return `art/worldmap/world-${hi ? 1536 : 1024}.webp${PLATE_V}`;
}
export function regionPlateSrc(id: RegionId, hi: boolean): string {
  return `art/worldmap/region-${id}-${hi ? 1536 : 1024}.webp${PLATE_V}`;
}
/** The plates' index (`worldmap.json`), versioned the same way. */
export function worldMapIndexSrc(): string {
  return `art/worldmap/worldmap.json${PLATE_V}`;
}
