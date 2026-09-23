/**
 * ROCKHOP identity in code (docs/design/CONTRACT.md § brand, store release D17): the wordmark as an inline SVG
 * (letter outlines from Archivo Black, `wordmarkPaths.ts`, plus the hand-built survey-target O), the palette, and
 * the mountain medal badges. Everything here is trusted markup built from constants — never user text.
 *
 * The wordmark needs no web font: it is outlines, so it paints the same in the boot loader's first bytes, in the
 * menu, on the results ticket and in the exported masters (`assets/brand/tools/export.mts`).
 */
import { WORDMARK_BOX, WORDMARK_LETTERS, WORDMARK_TARGETS } from './wordmarkPaths';

/** The five brand colours (the A-brand sheet). `docs/design/CONTRACT.md` § brand mirrors this table. */
export const PALETTE = {
  cream: '#EFE3C8',
  teal: '#0F5C63',
  vermilion: '#E4572E',
  ink: '#1D2326',
  ochre: '#C99A4B',
} as const;

export const GAME_TITLE = 'ROCKHOP';
/** The player-facing version on the home screen (`v1.0`); the store builds' marketing version. */
export const APP_VERSION = '1.0';

export interface WordmarkOptions {
  /** Letter + ring colour (default `currentColor`, so CSS `color` drives it). */
  fill?: string;
  /** Colour of the crosshair slits through the ring; `none` = true knockouts (transparent), the default. */
  slit?: string;
  /** Centre dot colour. */
  dot?: string;
  /** Accessible name (default "ROCKHOP"); `''` marks it decorative. */
  title?: string;
  /** Extra class on the <svg>. */
  className?: string;
}

const PAD = WORDMARK_BOX.overshoot + 2;

/**
 * The survey-target O at centre `cx`: the ring cut into four quarters by the crosshair slits (true knockouts — the
 * photo shows through the lines — drawn as geometry, not an SVG mask, so no element ids can collide between the
 * loader's copy and the game's), crosshair ticks in the letter colour inside the counter, the vermilion dot.
 */
function target(cx: number, o: { fill: string; dot: string; slit: string }): string {
  const { cy, diameter, ring } = WORDMARK_TARGETS;
  const R = diameter / 2;
  const r = R - ring;
  const slit = Math.max(10, ring * 0.075); // the crosshair line weight
  const h = slit / 2;
  const dotR = r * 0.58;
  const gap = dotR + r * 0.1; // ticks stop short of the dot
  const n = (v: number): string => (Math.round(v * 10) / 10).toString();
  const Ro = Math.sqrt(R * R - h * h);
  const ri = Math.sqrt(r * r - h * h);
  // One quarter per sign pair (sx, sy): outer arc from the vertical slit to the horizontal one, back along the inner arc.
  const quarter = (sx: number, sy: number): string => {
    const sweep = sx * sy > 0 ? 1 : 0;
    return `M${n(cx + sx * h)} ${n(cy + sy * Ro)}A${n(R)} ${n(R)} 0 0 ${1 - sweep} ${n(cx + sx * Ro)} ${n(cy + sy * h)}L${n(cx + sx * ri)} ${n(cy + sy * h)}A${n(r)} ${n(r)} 0 0 ${sweep} ${n(cx + sx * h)} ${n(cy + sy * ri)}Z`;
  };
  const ringD = quarter(1, -1) + quarter(1, 1) + quarter(-1, 1) + quarter(-1, -1);
  const ticks = `M${n(cx - h)} ${n(cy - r - 1)}h${n(slit)}V${n(cy - gap)}h${n(-slit)}zM${n(cx - h)} ${n(cy + gap)}h${n(slit)}V${n(cy + r + 1)}h${n(-slit)}zM${n(cx - r - 1)} ${n(cy - h)}H${n(cx - gap)}v${n(slit)}H${n(cx - r - 1)}zM${n(cx + gap)} ${n(cy - h)}H${n(cx + r + 1)}v${n(slit)}H${n(cx + gap)}z`;
  const slits = o.slit !== 'none' ? `<path fill="${o.slit}" d="M${n(cx - h)} ${n(cy - R)}h${n(slit)}v${n(ring)}h${n(-slit)}zM${n(cx - h)} ${n(cy + r)}h${n(slit)}v${n(ring)}h${n(-slit)}zM${n(cx - R)} ${n(cy - h)}h${n(ring)}v${n(slit)}h${n(-ring)}zM${n(cx + r)} ${n(cy - h)}h${n(ring)}v${n(slit)}h${n(-ring)}z"/>` : '';
  return `<path fill="${o.fill}" d="${ringD}${ticks}"/>${slits}<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(dotR)}" fill="${o.dot}"/>`;
}

let serial = 0;

/** Inline SVG of the ROCKHOP wordmark; sized by CSS (it keeps its aspect ratio: `width` or `height` alone is enough). */
export function wordmarkSvg(opts: WordmarkOptions = {}): string {
  const fill = opts.fill ?? 'currentColor';
  const dot = opts.dot ?? PALETTE.vermilion;
  const slit = opts.slit ?? 'none';
  const title = opts.title ?? GAME_TITLE;
  const vb = `0 ${-PAD} ${WORDMARK_BOX.width} ${WORDMARK_BOX.capHeight + 2 * PAD}`;
  const letters = WORDMARK_LETTERS.map((l) => l.d).join('');
  const os = WORDMARK_TARGETS.cx.map((cx) => target(cx, { fill, dot, slit })).join('');
  const a11y = title ? `role="img" aria-label="${title}"` : 'aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" class="rh-wordmark${opts.className ? ` ${opts.className}` : ''}" viewBox="${vb}" ${a11y} focusable="false"><path fill="${fill}" d="${letters}"/>${os}</svg>`;
}

/** Aspect ratio (width / height) of `wordmarkSvg()`'s viewBox. */
export const WORDMARK_ASPECT = WORDMARK_BOX.width / (WORDMARK_BOX.capHeight + 2 * PAD);

/** The zones' names as the world map and the results ticket print them (W-worldmap, A-results). */
export const ZONE_TITLE: Record<string, string> = { coast: 'Coastal Scrapyard', alpine: 'Alpine Forest Trail', quarry: 'Desert Quarry', snowline: 'Snowline' };

export function zoneTitle(zone: string): string {
  return ZONE_TITLE[zone] ?? zone;
}

export type MedalId = 'bronze' | 'silver' | 'gold' | 'platinum';

/** Player-facing medal names: the top tier is OBSIDIAN (`platinum` stays the storage / code key). */
export const MEDAL_NAME: Record<MedalId, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Obsidian' };

const MEDAL_TONES: Record<MedalId, { rim: [string, string]; face: [string, string]; peak: string; shade: string; snow: string }> = {
  bronze: { rim: ['#E7A77A', '#6E3818'], face: ['#B8693A', '#7A3F1C'], peak: '#D98C5C', shade: '#5C2C12', snow: '#F2C4A0' },
  silver: { rim: ['#F4F6F8', '#7D8590'], face: ['#C9CFD6', '#8A929C'], peak: '#E9EDF1', shade: '#5E656E', snow: '#FFFFFF' },
  gold: { rim: ['#FFE9A3', '#A8741C'], face: ['#EDBB47', '#B8801F'], peak: '#FFD76B', shade: '#8C5A10', snow: '#FFF3C4' },
  platinum: { rim: ['#3A4A50', '#0B1012'], face: ['#1E2A2E', '#07090A'], peak: '#26363B', shade: '#050708', snow: '#2FD6C8' },
};

/**
 * A mountain medal badge (A-brand § 05) as inline SVG: bevelled rim, recessed face, two embossed peaks with a snow
 * cap. OBSIDIAN is black glass: faceted peaks, teal crack glints and a rim glint. Used where the painted medal art
 * is not loaded yet, and as the art itself on the results ticket.
 */
export function medalSvg(m: MedalId, title = ''): string {
  const t = MEDAL_TONES[m];
  const id = `rh-m${++serial}`;
  const a11y = title ? `role="img" aria-label="${title}"` : 'aria-hidden="true"';
  const glass =
    m === 'platinum'
      ? `<path d="M30 70l9-13 6 7 9-15" fill="none" stroke="#2FD6C8" stroke-width="1.4" stroke-linecap="round" opacity=".9"/><path d="M66 38l-6 10 5 4" fill="none" stroke="#2FD6C8" stroke-width="1.1" stroke-linecap="round" opacity=".75"/><path d="M22 34a34 34 0 0 1 22-15" fill="none" stroke="#7FF3E8" stroke-width="2.4" stroke-linecap="round" opacity=".85"/>`
      : `<path d="M24 36a30 30 0 0 1 20-16" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".45"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="rh-medal ${m}" viewBox="0 0 100 100" ${a11y} focusable="false"><defs><linearGradient id="${id}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.rim[0]}"/><stop offset="1" stop-color="${t.rim[1]}"/></linearGradient><linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.face[0]}"/><stop offset="1" stop-color="${t.face[1]}"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="url(#${id}r)"/><circle cx="50" cy="50" r="40" fill="${t.shade}"/><circle cx="50" cy="51" r="38.5" fill="url(#${id}f)"/><path d="M18 70L38 38l9 13 11-19 24 38z" fill="${t.shade}" opacity=".55"/><path d="M20 68l18-28 9 12 11-18 22 34z" fill="${t.peak}"/><path d="M58 34l-6 10 6-3 5 4zM38 40l-5 8 5-2 4 3z" fill="${t.snow}" opacity=".95"/><path d="M58 34l22 34H58l-4-10z" fill="${t.shade}" opacity=".35"/>${glass}</svg>`;
}
