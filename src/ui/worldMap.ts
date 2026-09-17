/**
 * World map — the painted continent as the level select (docs/plans/WORLD_MAP.md, ask 54). Pure data and
 * layout for `WorldMapScreen` (worldMapScreen.ts), unit-tested in worldMap.test.ts: the map's coordinate
 * space (the world plate's pixel grid), one anchor per track on the terrain, the five regions in campaign
 * order with their plate crops and fog, the route through every campaign track, the tier gate on the road
 * into the next locked tier, and the camera's zoom tiers. No DOM here.
 *
 * Coordinates: "map units" are pixels of the world plate (`MAP.w × MAP.h`); the screen draws the scene at
 * `k` screen px per map unit (`k` is the zoom). Every anchor was read off the A mockup
 * (assets/design/worldmap/A-painted-world.png) and re-sat on the generated plate (build/world/).
 */
import type { BiomeId, Medal, TrackDef, TrackTier } from '../core/types';
import { isLabTrack, isPlaygroundTrack, nextTrack, shipTracks, TIER_LABEL, TIER_ORDER, tierUnlocked, type MedalOf } from './progress';

export type RegionId = BiomeId;

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
  /** Fog of war when the region is locked: soft ellipses (centre + radii, map units) laid over its land. */
  fog: { x: number; y: number; rx: number; ry: number }[];
  /** Lamp colour: the region's own light (name-plate tint on the card, the marker's spire when open and medal-less). */
  lamp: string;
}

/** The world plate: 1536 × 1024 map units, the continent inside `CONTINENT` (the sea and sky around it are air). */
export const MAP = { w: 1536, h: 1024 } as const;
/** The box the fit zoom covers: the land from the Industrial pier to the Foundry shore, not the sea and sky around it. */
export const CONTINENT: Box = { x: 0, y: 110, w: 1536, h: 720 };

/** Campaign order: the route runs through them south-west to north-east. */
export const REGIONS: readonly RegionDef[] = [
  {
    id: 'industrial',
    label: 'Industrial',
    name: { x: 300, y: 560 },
    crop: { x: 0, y: 460, w: 640, h: 427 },
    fog: [{ x: 300, y: 660, rx: 330, ry: 190 }],
    lamp: '#ffb020',
  },
  {
    id: 'canyon',
    label: 'Canyon',
    name: { x: 340, y: 190 },
    crop: { x: 80, y: 150, w: 600, h: 400 },
    fog: [{ x: 380, y: 320, rx: 300, ry: 170 }],
    lamp: '#ff7a3d',
  },
  {
    id: 'snow',
    label: 'Snow',
    name: { x: 770, y: 62 },
    crop: { x: 560, y: 50, w: 480, h: 320 },
    fog: [{ x: 790, y: 240, rx: 240, ry: 170 }],
    lamp: '#8fd3ff',
  },
  {
    id: 'nightCity',
    label: 'Night City',
    name: { x: 1060, y: 362 },
    crop: { x: 800, y: 350, w: 540, h: 360 },
    fog: [
      { x: 1050, y: 500, rx: 280, ry: 160 },
      { x: 1190, y: 560, rx: 220, ry: 110 },
    ],
    lamp: '#e05cff',
  },
  {
    id: 'foundry',
    label: 'Foundry',
    name: { x: 1330, y: 112 },
    crop: { x: 1120, y: 130, w: 416, h: 277 },
    fog: [
      { x: 1340, y: 290, rx: 250, ry: 170 },
      { x: 1210, y: 240, rx: 150, ry: 110 },
    ],
    lamp: '#ff6a1a',
  },
];

/**
 * Where each track stands on the terrain (map units): the Lab hangar and P1 on the Industrial pier, B1–B3 along
 * the docks, M1 at the road out to the Canyon, E1–E3 on the mesas, M2 / P3 / X1 up the Snow range, H1 / H2 / P4
 * in Night City, M3 / P5 / H3 / X2 / X3 around the Foundry.
 */
export const ANCHOR: Readonly<Record<string, { x: number; y: number }>> = {
  // Industrial: the hangar on its apron, the yard, the pier's east end, the coast road, the hill road to the bridge.
  'lab-physics-test': { x: 85, y: 585 },
  'lab-flat-200': { x: 170, y: 640 },
  'p1-container-yard': { x: 270, y: 700 },
  'b1-first-ride': { x: 445, y: 732 },
  'b2-lean-back': { x: 535, y: 668 },
  'b3-kicker-row': { x: 585, y: 585 },
  // Canyon: the highway north of the river bridge, the mesa foot, the mesa tops, the west mesas.
  'm1-hop-up': { x: 600, y: 470 },
  'e1-uphill-weight': { x: 330, y: 395 },
  'e2-rear-wheel-first': { x: 260, y: 290 },
  'e3-stairway': { x: 470, y: 300 },
  'p2-canyon-run': { x: 150, y: 250 },
  // Snow: the ski slope under the lifts, the lodge, the summit.
  'm2-drum-roll': { x: 790, y: 250 },
  'p3-snow-line': { x: 760, y: 355 },
  'x1-vertical-limit': { x: 705, y: 122 },
  // Night City: the towers, the far waterfront, the elevated loop at the city's west edge.
  'h1-wheelie-wire': { x: 1000, y: 430 },
  'h2-gap-chain': { x: 1150, y: 455 },
  'p4-night-circuit': { x: 830, y: 470 },
  // Foundry: the lit works, the shore, the slag river, the big mill, the stacks.
  'm3-see-saw': { x: 1295, y: 335 },
  'p5-foundry-floor': { x: 1400, y: 400 },
  'h3-fire-line': { x: 1450, y: 330 },
  'x2-pipe-dream': { x: 1370, y: 290 },
  'x3-gauntlet': { x: 1240, y: 205 },
};

/**
 * The road between two markers, traced off the painted plate (map units, in travel order) so the route hugs the
 * roads and valleys and never cuts across water: the pier and the coast road, the hill road to the river bridge,
 * the canyon's north-bank road and the mesa tops, the snow-foot road up to the lifts, the pass into Night City,
 * the streets to the waterfront, the climb to the Foundry and its shore road. Keyed `<from id>>' + '<to id>`;
 * a leg with no entry is a straight run.
 */
export const ROAD: Readonly<Record<string, { x: number; y: number }[]>> = {
  'b1-first-ride>b2-lean-back': [{ x: 490, y: 706 }],
  'b2-lean-back>b3-kicker-row': [{ x: 560, y: 636 }, { x: 572, y: 608 }],
  'b3-kicker-row>m1-hop-up': [{ x: 575, y: 545 }, { x: 555, y: 515 }, { x: 548, y: 495 }, { x: 575, y: 478 }],
  'm1-hop-up>e1-uphill-weight': [{ x: 540, y: 446 }, { x: 450, y: 432 }, { x: 380, y: 420 }],
  'e1-uphill-weight>e2-rear-wheel-first': [{ x: 300, y: 362 }, { x: 270, y: 322 }],
  'e2-rear-wheel-first>e3-stairway': [{ x: 330, y: 270 }, { x: 400, y: 265 }, { x: 440, y: 285 }],
  'e3-stairway>m2-drum-roll': [{ x: 540, y: 330 }, { x: 620, y: 332 }, { x: 700, y: 330 }, { x: 760, y: 300 }],
  'm2-drum-roll>h1-wheelie-wire': [{ x: 836, y: 340 }, { x: 906, y: 400 }, { x: 936, y: 440 }, { x: 970, y: 442 }],
  'h1-wheelie-wire>h2-gap-chain': [{ x: 1070, y: 466 }, { x: 1110, y: 462 }],
  'h2-gap-chain>m3-see-saw': [{ x: 1200, y: 432 }, { x: 1240, y: 386 }, { x: 1270, y: 356 }],
  'm3-see-saw>h3-fire-line': [{ x: 1336, y: 322 }, { x: 1396, y: 340 }],
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

export function regionOf(t: TrackDef): RegionId {
  return t.meta?.biome ?? 'industrial';
}

export function codeOf(t: TrackDef): string {
  if (isLabTrack(t)) return 'LAB';
  return t.id.split('-')[0]!.toUpperCase();
}

export function unlockRule(tier: TrackTier): string {
  const prev = TIER_ORDER[TIER_ORDER.indexOf(tier) - 1];
  return prev ? `Medal every ${TIER_LABEL[prev]} track` : '';
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
  /** The first unridden track of the highest open tier (`lastPlayed` never moves the flag). */
  upNext: boolean;
  /** Unlock rule when locked: `Medal every Medium track`. */
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
  tier: TrackTier;
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
    const locked = !isProving && !tierUnlocked(ship, t.tier, medalOf, dev);
    const at = anchorOf(t, ANCHOR[t.id] ? 0 : unknown++);
    return {
      track: t,
      code: codeOf(t),
      region: regionOf(t),
      medal: isProving ? null : medalOf(t.id),
      locked,
      proving: isProving,
      upNext: !isProving && next?.id === t.id && medalOf(t.id) === null,
      rule: locked ? unlockRule(t.tier) : null,
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
  const gateTier = TIER_ORDER.find((tier) => ms.some((m) => m.track.tier === tier && m.locked));
  const beyond = gateTier ? TIER_ORDER.slice(TIER_ORDER.indexOf(gateTier) + 1) : [];
  const main: Marker[] = [];
  const spurs: { from: Marker; to: Marker }[] = [];
  for (const m of ms) {
    if (beyond.includes(m.track.tier) && main.length > 0) spurs.push({ from: main[main.length - 1]!, to: m });
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
  return { tier: gate.track.tier, track: gate.track, rule: unlockRule(gate.track.tier), region: gate.region, x, y, dx: (gate.x - from.x) / len, dy: (gate.y - from.y) / len };
}

export interface FogPatch {
  /** The region id (a locked region's fog) or the track id (a locked marker's patch in open land). */
  key: string;
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** Fog of war: every locked region's ellipses, plus a patch on each locked marker standing in open land (the Snow summit's X1 before Extreme opens). */
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

/** Art-pack paths (`public/art/worldmap/`, cut by assets/art/worldmap.mjs): the world plate and the five region plates, 2x (1536 wide) for dense screens, 1x (1024) otherwise. */
export function worldPlateSrc(hi: boolean): string {
  return `art/worldmap/world-${hi ? 1536 : 1024}.webp`;
}
export function regionPlateSrc(id: RegionId, hi: boolean): string {
  return `art/worldmap/region-${id}-${hi ? 1536 : 1024}.webp`;
}
