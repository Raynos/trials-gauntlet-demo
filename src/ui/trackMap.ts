/**
 * Track select as one continuous world map (assets/design/tracks/round4/SPEC.md § C "Ascent", ask #38):
 * the six isometric night plates of round 3 (the proving-ground island + five biomes) stacked as one
 * mountain — the apron at the foot, the Foundry summit top-right — under a 2-D camera. Pure data for
 * `TrackSelectScreen` (src/ui/front.ts): the six regions in campaign order, the pins on each plate in
 * tier order, their anchors in tile space *and* in world space, one route polyline through every
 * campaign pin, the tier gate (a hazard-tape barrier on the trail at the seam), the plate offsets on
 * the mountain and the camera's fit rules. No DOM here so every rule is unit-tested (trackMap.test.ts).
 */
import type { BiomeId, Medal, TrackDef, TrackTier } from '../core/types';
import { isLabTrack, isPlaygroundTrack, nextTrack, shipTracks, TIER_LABEL, TIER_ORDER, tierUnlocked, type MedalOf } from './progress';

export type PageId = 'island' | BiomeId;

export interface PageDef {
  id: PageId;
  /** Engraved on the tile's front face. */
  label: string;
  /** The miniature's name (fits 44 px rows). */
  short: string;
  /** One line under the miniature / on the card: what the place is. */
  blurb: string;
  /** Lamp colour: the tile's own light (A3e), used for the glow behind the tile and the miniature's rim. */
  lamp: string;
}

/** Page order: the proving ground first (Lab and Playgrounds sit before the campaign, as today's rows do), then the biomes in campaign order. */
export const PAGE_ORDER: readonly PageDef[] = [
  { id: 'island', label: 'Proving ground', short: 'Lab', blurb: 'Lab · Playgrounds · no medals', lamp: '#dfe9ff' },
  { id: 'industrial', label: 'Industrial', short: 'Industrial', blurb: 'Rust and steel under sodium lamps', lamp: '#ffb020' },
  { id: 'canyon', label: 'Canyon', short: 'Canyon', blurb: 'Red sandstone at the last of sunset', lamp: '#ff7a3d' },
  { id: 'snow', label: 'Snow', short: 'Snow', blurb: 'Ice-blue alpine night', lamp: '#8fd3ff' },
  { id: 'nightCity', label: 'Night City', short: 'Night City', blurb: 'Rooftops in cyan and magenta neon', lamp: '#e05cff' },
  { id: 'foundry', label: 'Foundry', short: 'Foundry', blurb: 'Molten orange on black iron', lamp: '#ff6a1a' },
];

/** One plate's box in world units (a 3:2 plate; the camera's zoom 1 draws it at today's `--tile-w`). */
export const TILE = { w: 600, h: 400 } as const;
/** Padding around the mountain so the camera's min zoom shows air, not a cut edge. */
export const WORLD_PAD = 40;
/**
 * The plate's top-surface diamond inside its box (the `.slab` polygon, world units): top (300, 32), right (582, 183),
 * bottom (300, 335), left (18, 183); the cut face hangs 41 below the front edges (to 376 at the front vertex).
 * One iso step along the back-right edge is (282, 151): a plate moved by it has its left vertex on the previous
 * plate's top vertex.
 */
export const ISO_STEP = { x: 282, y: 151 } as const;
/** The cliff between two terraces: the upper plate is lifted this much above the iso step, and the seam band fills the gap. */
export const CLIFF = 150;
/** The quay: Industrial stands this far above the apron's box (straight up, a little to the right). */
export const QUAY = { x: 40, y: 380 } as const;
/**
 * Where each plate sits on the mountain, in world units (x right, y down, the box's top-left corner): the
 * apron at the foot (bottom-left), Industrial straight above it over the quay wall, then the other four biomes
 * one iso step + one cliff up-and-right each, so every cut face reads as a terrace over the one below.
 * Biome order, per SPEC § 4: M1 stays on the Industrial terraces, M2 in Snow, M3 with the Foundry — the
 * tier rides on the pin's code letter and the altimeter, the trail never doubles back.
 */
export const PLATE_OFFSET: Readonly<Record<PageId, { x: number; y: number }>> = (() => {
  const step = { x: ISO_STEP.x, y: -(ISO_STEP.y + CLIFF) };
  const ind = { x: WORLD_PAD + QUAY.x, y: WORLD_PAD + 4 * -step.y };
  const at = (i: number): { x: number; y: number } => ({ x: ind.x + i * step.x, y: ind.y + i * step.y });
  return {
    island: { x: ind.x - QUAY.x, y: ind.y + QUAY.y },
    industrial: at(0),
    canyon: at(1),
    snow: at(2),
    nightCity: at(3),
    foundry: at(4),
  };
})();
/** The whole mountain, world units. */
export const WORLD = (() => {
  let right = 0;
  let bottom = 0;
  for (const o of Object.values(PLATE_OFFSET)) {
    right = Math.max(right, o.x + TILE.w);
    bottom = Math.max(bottom, o.y + TILE.h);
  }
  return { w: right + WORLD_PAD, h: bottom + WORLD_PAD };
})();
/**
 * Camera zoom: `open` is the working zoom the screen opens at (about one biome — 4–6 pins — on a landscape phone),
 * `max` about one biome filling the viewport. Pins keep their screen size (the 44 px disc) at every zoom down to
 * `pinMin`; below `plates` they drop their name plates (code + disc only, round 3's A3a rule, so neighbours never
 * collide) and below `pinMin` they fold to dots and stop taking pointers (nothing hit-testable under 44 px).
 * Zoom 1 draws a plate at today's `--tile-w`.
 */
export const ZOOM = { open: 1.3, max: 2, plates: 1, pinMin: 0.62 } as const;

/**
 * The rock mass under the whole stack, as an SVG-style polygon in world units (clip-path points): up the left
 * vertices from the apron to the summit's top vertex, then down the right vertices to the apron's bottom vertex.
 * Drawn behind every plate so the far view reads as one massif, not six floating slabs.
 */
export function massPolygon(): { x: number; y: number }[] {
  const order: PageId[] = ['island', 'industrial', 'canyon', 'snow', 'nightCity', 'foundry'];
  const left = order.map((id) => ({ x: PLATE_OFFSET[id].x + 18, y: PLATE_OFFSET[id].y + 183 }));
  const top = { x: PLATE_OFFSET.foundry.x + 300, y: PLATE_OFFSET.foundry.y + 32 };
  const right = [...order].reverse().map((id) => ({ x: PLATE_OFFSET[id].x + 582, y: PLATE_OFFSET[id].y + 183 }));
  const foot = { x: PLATE_OFFSET.island.x + 300, y: PLATE_OFFSET.island.y + 376 };
  return [...left, top, ...right, foot];
}

/** The centre of a region's pins in world units (the opening camera frames the region when its pins fit the free box). */
export function regionCentre(page: Page): { x: number; y: number; w: number; h: number } {
  const xs = page.pins.map((p) => p.wx);
  const ys = page.pins.map((p) => p.wy);
  const l = Math.min(...xs);
  const r = Math.max(...xs);
  const t = Math.min(...ys);
  const b = Math.max(...ys);
  return { x: (l + r) / 2, y: (t + b) / 2, w: r - l, h: b - t };
}

/** Tile-space anchor (0–100) → world units. */
export function worldOf(page: PageId, x: number, y: number): { x: number; y: number } {
  const o = PLATE_OFFSET[page];
  return { x: Math.round(o.x + (x / 100) * TILE.w), y: Math.round(o.y + (y / 100) * TILE.h) };
}

/** Tile plate (generated with the Codex image pipeline, cut to alpha, ≤ 1024 px, WebP ≤ 150 KB) — `art/tiles/tile-<page>.webp`. */
export function tilePlateSrc(page: PageId): string {
  return `art/tiles/tile-${page}.webp`;
}

export function pageOf(t: TrackDef): PageId {
  if (isLabTrack(t) || isPlaygroundTrack(t)) return 'island';
  return t.meta?.biome ?? 'industrial';
}

export interface Pin {
  track: TrackDef;
  /** Short code on the post: `B1`, `M1`, `P3`, `LAB`. */
  code: string;
  medal: Medal | null;
  locked: boolean;
  /** Lab / playground: outside medals and progression. */
  proving: boolean;
  /** The first unridden track of the highest open tier (data only — `lastPlayed` never moves the flag). */
  upNext: boolean;
  /** Unlock rule when locked: `Medal every Medium track`. */
  rule: string | null;
  /** Anchor of the medal disc in tile space, 0–100 (x right, y down). */
  x: number;
  y: number;
  /** The same anchor in world units (the plate's offset applied). */
  wx: number;
  wy: number;
}

export interface Page extends PageDef {
  index: number;
  pins: Pin[];
  /** Campaign pins (island: 0 / 0). */
  done: number;
  total: number;
  /** Every campaign pin locked (Night City before Hard opens). */
  locked: boolean;
}

export interface Gate {
  /** First locked tier and its first track — the `NEXT TIER GATE` stub. */
  tier: TrackTier;
  track: TrackDef;
  rule: string;
  page: PageId;
}

/** The one route: every campaign pin in biome order (the regions in campaign order, tier order inside each). */
export function routePins(pages: readonly Page[]): Pin[] {
  return pages.flatMap((p) => p.pins.filter((x) => !x.proving));
}

/**
 * The trail as one SVG path in world units, and its lit part: every leg that leaves a medalled pin (the cleared
 * stretches, each running on to the next pin — so the road out of E3 glows toward M2 even while M1 waits), as
 * one path of subpaths (`''` when nothing is medalled).
 */
export function worldRoute(pages: readonly Page[]): { dim: string; lit: string } {
  const pins = routePins(pages);
  const pts = pins.map((p) => ({ x: p.wx, y: p.wy }));
  const legs: string[] = [];
  let run: { x: number; y: number }[] = [];
  const flush = (): void => {
    if (run.length >= 2) legs.push(pathThrough(run));
    run = [];
  };
  for (let i = 0; i < pins.length - 1; i++) {
    if (pins[i]!.medal) {
      if (run.length === 0) run.push(pts[i]!);
      run.push(pts[i + 1]!);
    } else flush();
  }
  flush();
  return { dim: pathThrough(pts), lit: legs.join(' ') };
}

/**
 * Where the tier barrier stands: on the trail, halfway between the gate track's pin and the pin before it
 * (the seam below Night City in the seeded state), or at the gate pin itself when it leads the trail.
 */
export function gateAnchor(pages: readonly Page[], gate: Gate): { x: number; y: number } {
  const pins = routePins(pages);
  const i = pins.findIndex((p) => p.track.id === gate.track.id);
  const b = pins[i] ?? pins[0];
  if (!b) return { x: WORLD.w / 2, y: WORLD.h / 2 };
  const a = pins[i - 1];
  if (!a) return { x: b.wx, y: b.wy };
  return { x: Math.round((a.wx + b.wx) / 2), y: Math.round((a.wy + b.wy) / 2 + 5) };
}

/** The zoom at which the whole mountain fits a viewport of `vw × vh` px when zoom 1 draws a plate `tileW` px wide (never above `ZOOM.pinMin`, so min is always a real overview). */
export function fitZoom(vw: number, vh: number, tileW: number): number {
  const s0 = Math.max(1e-6, tileW / TILE.w);
  const z = Math.min(vw / (WORLD.w * s0), vh / (WORLD.h * s0));
  return Math.max(0.05, Math.min(ZOOM.pinMin - 0.02, Math.round(z * 1000) / 1000));
}

/** The pins whose anchors fall inside a screen-space window, given the camera (`x, y` = the world origin's screen position, `k` = px per world unit). */
export function pinsInView(pages: readonly Page[], cam: { x: number; y: number; k: number }, vw: number, vh: number): Pin[] {
  const out: Pin[] = [];
  for (const p of pages)
    for (const pin of p.pins) {
      const sx = cam.x + pin.wx * cam.k;
      const sy = cam.y + pin.wy * cam.k;
      if (sx >= 0 && sx <= vw && sy >= 0 && sy <= vh) out.push(pin);
    }
  return out;
}

export function unlockRule(tier: TrackTier): string {
  const prev = TIER_ORDER[TIER_ORDER.indexOf(tier) - 1];
  return prev ? `Medal every ${TIER_LABEL[prev]} track` : '';
}

export function codeOf(t: TrackDef): string {
  if (isLabTrack(t)) return 'LAB';
  return t.id.split('-')[0]!.toUpperCase();
}

/**
 * Disc anchors for `n` pins, tile space 0–100: a run across the plate from its left vertex to its right vertex
 * (the trail crosses each terrace, then switchbacks up to the next), a gentle arc with a zigzag so neighbouring
 * name plates never overlap (the harness overlap rule) — and so the last pin of one plate clears the first pin
 * of the plate above by more than a pin's height. The island (7 pins) uses the plate's own layout: the Lab at
 * the hangar, the five practice pads along the front.
 */
export function pinAnchors(n: number, page: PageId): { x: number; y: number }[] {
  if (n <= 0) return [];
  if (page === 'island') {
    const pads = [
      { x: 12, y: 58 },
      { x: 31, y: 70 },
      { x: 50, y: 78 },
      { x: 69, y: 70 },
      { x: 88, y: 58 },
    ];
    const hangar = [
      { x: 44, y: 22 },
      { x: 70, y: 26 },
      { x: 18, y: 30 },
    ];
    // Lab pins first (they lead the list), then the pads.
    return Array.from({ length: n }, (_, i) => (i < n - 5 ? hangar[Math.min(i, hangar.length - 1)]! : pads[Math.min(i - (n - 5), 4)]!));
  }
  if (n === 1) return [{ x: 50, y: 48 }];
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const x = 16 + 68 * f;
    const y = 50 - 8 * Math.sin(Math.PI * f) + (i % 2 ? -5 : 5);
    out.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
  }
  return out;
}

function pathThrough(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    // A shallow bend between posts (world units) so the route reads as a track, not a ruler.
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2 + 14;
    d += ` Q ${cx} ${cy} ${b.x} ${b.y}`;
  }
  return d;
}

/**
 * The six pages with their pins. `tracks` is the full list (lab, playgrounds, campaign, `-test` strips in dev);
 * order inside a page is tier order then authored order, so the route climbs from Beginner to Extreme.
 */
export function buildPages(tracks: readonly TrackDef[], medalOf: MedalOf, dev = false): Page[] {
  const ship = shipTracks(tracks, dev);
  const campaign = shipTracks(tracks);
  const next = nextTrack(campaign, medalOf, dev);
  const proving = tracks.filter((t) => isLabTrack(t) || isPlaygroundTrack(t));
  // Lab first, then playgrounds in id order (P1…P5), as today's two rows.
  proving.sort((a, b) => Number(isPlaygroundTrack(a)) - Number(isPlaygroundTrack(b)) || a.id.localeCompare(b.id));
  return PAGE_ORDER.map((def, index) => {
    const list = def.id === 'island' ? proving : ship.filter((t) => pageOf(t) === def.id);
    const anchors = pinAnchors(list.length, def.id);
    const pins: Pin[] = list.map((t, i) => {
      const isProving = def.id === 'island';
      const locked = !isProving && !tierUnlocked(ship, t.tier, medalOf, dev);
      return {
        track: t,
        code: codeOf(t),
        medal: isProving ? null : medalOf(t.id),
        locked,
        proving: isProving,
        upNext: !isProving && next?.id === t.id && medalOf(t.id) === null,
        rule: locked ? unlockRule(t.tier) : null,
        x: anchors[i]!.x,
        y: anchors[i]!.y,
        ...(({ x, y }) => ({ wx: x, wy: y }))(worldOf(def.id, anchors[i]!.x, anchors[i]!.y)),
      };
    });
    const campaignPins = pins.filter((p) => !p.proving);
    const done = campaignPins.filter((p) => p.medal).length;
    return {
      ...def,
      index,
      pins,
      done,
      total: campaignPins.length,
      locked: campaignPins.length > 0 && campaignPins.every((p) => p.locked),
    };
  });
}

/** The first locked tier's first track, with its rule — `null` when every tier is open. */
export function nextGate(tracks: readonly TrackDef[], medalOf: MedalOf, dev = false): Gate | null {
  const ship = shipTracks(tracks);
  for (const tier of TIER_ORDER) {
    const list = ship.filter((t) => t.tier === tier);
    if (list.length === 0) continue;
    if (tierUnlocked(ship, tier, medalOf, dev)) continue;
    const track = list[0]!;
    return { tier, track, rule: unlockRule(tier), page: pageOf(track) };
  }
  return null;
}

/** Page + pin of a track id. */
export function locate(pages: readonly Page[], trackId: string | null | undefined): { page: number; pin: number } | null {
  if (!trackId) return null;
  for (const p of pages) {
    const i = p.pins.findIndex((x) => x.track.id === trackId);
    if (i >= 0) return { page: p.index, pin: i };
  }
  return null;
}

/** The pin a page opens on: its `UP NEXT` track, else its first open pin, else its first pin. */
export function defaultPin(page: Page): number {
  const up = page.pins.findIndex((p) => p.upNext);
  if (up >= 0) return up;
  const open = page.pins.findIndex((p) => !p.locked);
  return open >= 0 ? open : 0;
}

/** Altimeter-rung dots: one per campaign pin in order — a medal, an empty ring, or a padlock. */
export function pageDots(page: Page): ('platinum' | 'gold' | 'silver' | 'bronze' | 'open' | 'locked')[] {
  return page.pins.filter((p) => !p.proving).map((p) => p.medal ?? (p.locked ? 'locked' : 'open'));
}
