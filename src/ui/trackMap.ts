/**
 * Track select as an isometric diorama (assets/design/tracks/round3/SPEC.md §5: A3b "one tile
 * at a time" lit like A3e "night"). Pure data for `TrackSelectScreen` (src/ui/front.ts): the six
 * snap pages (five biome tiles + the proving-ground island), the pins on each tile in tier order,
 * their anchors in tile space, the amber route through them, the next tier gate, and the tile
 * plate paths. No DOM here so every rule is unit-tested (trackMap.test.ts).
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
}

export interface Page extends PageDef {
  index: number;
  pins: Pin[];
  /** Campaign pins (island: 0 / 0). */
  done: number;
  total: number;
  /** Every campaign pin locked (Night City before Hard opens). */
  locked: boolean;
  /** SVG path (in a 100×100 viewBox) through the campaign pins, and the part of it that is cleared (`''` when nothing is). */
  route: string;
  routeLit: string;
}

export interface Gate {
  /** First locked tier and its first track — the `NEXT TIER GATE` stub. */
  tier: TrackTier;
  track: TrackDef;
  rule: string;
  page: PageId;
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
 * Disc anchors for `n` pins, tile space 0–100: a run from the tile's front-left up to its back-right along the
 * open corridor of every plate, with a zigzag so neighbouring name plates never overlap (the harness overlap rule).
 * The island (7 pins) uses the plate's own layout: the Lab at the hangar, the five practice pads along the front.
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
  if (n === 1) return [{ x: 48, y: 48 }];
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const x = 18 + 60 * f;
    const y = 58 - 22 * f + (i % 2 ? -6 : 6);
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
    // A shallow bend between posts so the route reads as a track, not a ruler.
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2 + 5;
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
      };
    });
    const campaignPins = pins.filter((p) => !p.proving);
    const done = campaignPins.filter((p) => p.medal).length;
    let lit = 0;
    for (const p of campaignPins) {
      if (!p.medal) break;
      lit++;
    }
    const points = campaignPins.map((p) => ({ x: p.x, y: p.y }));
    return {
      ...def,
      index,
      pins,
      done,
      total: campaignPins.length,
      locked: campaignPins.length > 0 && campaignPins.every((p) => p.locked),
      route: pathThrough(points),
      routeLit: pathThrough(points.slice(0, Math.max(0, Math.min(points.length, lit + (lit < points.length ? 1 : 0))))),
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

/** Miniature-row dots: one per campaign pin in order — a medal, an empty ring, or a padlock. */
export function pageDots(page: Page): ('platinum' | 'gold' | 'silver' | 'bronze' | 'open' | 'locked')[] {
  return page.pins.filter((p) => !p.proving).map((p) => p.medal ?? (p.locked ? 'locked' : 'open'));
}
