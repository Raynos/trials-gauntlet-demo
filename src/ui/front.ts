/**
 * Front end (docs/design/game.md §10): main menu ("Broadcast", boot lands on
 * it — there is no title step) → track select / garage / settings / credits.
 * Plain DOM over the live 3D canvas; every screen drives
 * focus itself (keyboard arrows, d-pad/stick edges, pointer hover, tap) and
 * exposes `nav / confirm / back` for the app shell. Targets ≥ 44 px, safe-area
 * aware, tokens from styles.ts only.
 */
import type { BikeClass, Medal, RiderOutfit, TrackDef } from '../core/types';
import { BIOME_TINT, type ArtEntry, type ArtManifest } from './art';
import type { BestEntry, BoardEntry, FpsChoice, ModelChoice } from './best';
import { formatTime } from './format';
import type { QualityChoice } from './menu';
import { isLabTrack, medalTotals, nextTrack, shipTracks, TIER_LABEL, type MedalOf } from './progress';
import { injectTrackMapStyles } from './styles';
import { buildPages, codeOf, defaultPin, fitZoom, gateAnchor, locate, massPolygon, nextGate, pageDots, pinsInView, PLATE_OFFSET, regionCentre, TILE, tilePlateSrc, WORLD, worldRoute, ZOOM, type Page, type PageId, type Pin } from './trackMap';
import type { UiSfx } from './sfx';
import { conceal, reveal, isLiveTarget } from './live';

export type FrontScreen = 'menu' | 'garage' | 'tracks' | 'settings' | 'credits' | 'review';

export interface FrontCallbacks {
  /** Commits and persists a loaded outfit; false preserves the current choice. Consumed by the Garage screen only (garage round). */
  outfits?: { get(): RiderOutfit; set(outfit: RiderOutfit): Promise<boolean> };
  /** Track select confirmed a card (called ≈180 ms into the card's fly-up so the scene swaps under it). */
  play(trackId: string): void;
  /** Time attack: the last played (or next) track, straight in. */
  timeAttack(trackId: string): void;
  goto(screen: FrontScreen): void;
  setQuality(q: QualityChoice): void;
  setFps(v: FpsChoice): void;
  setSound(on: boolean): void;
  setVolume(v: number): void;
  setGhost(on: boolean): void;
  setModel(which: 'rider' | 'bike', v: ModelChoice): void;
  resetProgress(): void;
  /** Local run log (docs/design/game.md §13). */
  setTelemetry(on: boolean): void;
  copyRunLog(): Promise<boolean>;
  shareRunLog(): Promise<boolean>;
  /** Track card "Watch PB" (replay viewer on the stored PB recording). */
  watchPb(trackId: string): void;
  /** Hidden dev row: reload with `?physics=v1|v2` (or without the param). */
  setPhysics?(v: 'default' | 'v1' | 'v2'): void;
}

export interface FrontState {
  quality: QualityChoice;
  /** Frame cap choice ('auto' = 30 on phones, 60 elsewhere) and the cap in effect. */
  fps: FpsChoice;
  fpsInEffect: 30 | 60;
  sound: boolean;
  volume: number;
  ghost: boolean;
  rider: ModelChoice;
  bike: ModelChoice;
  dev: boolean;
  lastPlayed: string | null;
  /** Renderer exports `setModels`: only then are the Rider / Bike rows offered. */
  models: boolean;
  /** Garage choice in effect (per-tier default resolved). */
  bikeClass: BikeClass;
  telemetry: boolean;
  runlog: { runs: number; tracks: number };
  /** `navigator.share` exists (iOS / Android share sheet). */
  canShare: boolean;
  /** `?dev=1` only: physics solver chosen (`default` = whatever `createBikePhysics` is), which are exported, and which one is live. */
  physics?: { current: 'default' | 'v1' | 'v2'; available: ('v1' | 'v2')[]; live?: 'v1' | 'v2' | undefined };
}

export const BIKE_NAME: Record<BikeClass, string> = { rookie: 'Rookie', pro: 'Pro' };

export const GAME_NAME = 'Trials Gauntlet';
declare const __BUILD_ID__: string | undefined;
declare const __BUILD_TIME__: string | undefined;
export const BUILD_STAMP = `build ${typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'}${typeof __BUILD_TIME__ === 'string' ? ' · ' + __BUILD_TIME__ : ''}`;
/** Menu stamp: `build <sha7> · <date>` (the time of day dropped; the sha is `git rev-parse --short HEAD` at build time, `dev` only without git). */
export const BUILD_STAMP_SHORT = BUILD_STAMP.replace(/ \d\d:\d\dZ?$/, '');

/** Clear anything that could pin an old build (SW caches, session state), then reload. Settings and PBs stay. */
export async function hardReload(): Promise<void> {
  try {
    sessionStorage.clear();
  } catch {
    /* unavailable */
  }
  try {
    if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k);
  } catch {
    /* unavailable */
  }
  const url = new URL(location.href);
  url.searchParams.set('b', String(Date.now()));
  location.replace(url.toString());
}


function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

const LEGEND_KB = `<span><kbd>↑↓</kbd>Move</span><span><kbd>Enter</kbd>Select</span><span><kbd>Esc</kbd>Back</span>`;
const LEGEND_PAD = `<span><i class="pad">✚</i>Move</span><span><i class="pad a">A</i>Select</span><span><i class="pad b">B</i>Back</span>`;
const LEGEND_TOUCH = `<span>Tap to select</span><span>Swipe rows</span>`;

/** Base screen: root element, show/hide with the shared fade, a device-aware legend. */
export abstract class Screen {
  readonly root: HTMLDivElement;
  protected legend: HTMLDivElement | null = null;

  constructor(parent: HTMLElement, cls: string) {
    this.root = h('div', `screen ${cls}`);
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return this.root.classList.contains('show');
  }

  /** Drawn now (the fade starts); tappable only once live.ts has seen it drawn for the invariant's delay. */
  show(): void {
    this.root.classList.remove('leave');
    this.root.classList.add('show');
    reveal(this.root);
  }

  hide(): void {
    conceal(this.root);
    this.root.classList.remove('show', 'leave');
  }

  setDevice(d: 'keyboard' | 'gamepad' | 'touch' | null): void {
    if (!this.legend) return;
    this.legend.innerHTML = d === 'gamepad' ? LEGEND_PAD : d === 'touch' ? LEGEND_TOUCH : LEGEND_KB;
  }

  /** Fixed "‹ Back" pill, top-right, never scrolls — touch has no Esc. */
  protected addBackButton(label = 'Back'): void {
    const b = h('button', 'backbtn', `<span>‹</span>${escapeHtml(label)}`);
    b.type = 'button';
    b.addEventListener('click', () => this.back());
    this.root.appendChild(b);
  }

  abstract nav(dx: number, dy: number): void;
  abstract confirm(): void;
  abstract back(): void;
  /** Secondary action (`V` / pad Y); screens without one ignore it. */
  alt(): void {}
}

// ---------------------------------------------------------------------------
// Focus list with an eased amber bar: vertical (column) or horizontal (the menu's tabs, bar = underline)
// ---------------------------------------------------------------------------

export interface ListItem {
  id: string;
  label: string;
  note?: string;
  disabled?: boolean;
  /** Secondary item (the menu's CREDITS): small caps, pushed to the far end of a horizontal list. */
  minor?: boolean;
  /** Inline SVG drawn before the label (the menu tiles' icon above the word). Trusted markup, never user text. */
  icon?: string;
}

export class FocusList {
  readonly root: HTMLDivElement;
  private readonly bar: HTMLDivElement;
  private items: ListItem[] = [];
  private index = 0;
  onChange: ((id: string) => void) | null = null;
  onPick: ((id: string) => void) | null = null;

  constructor(parent: HTMLElement, private readonly sfx: UiSfx, cls = 'menu-list', private readonly axis: 'x' | 'y' = 'y') {
    this.root = h('div', cls);
    this.bar = h('div', 'menu-bar');
    this.root.appendChild(this.bar);
    parent.appendChild(this.root);
    this.root.addEventListener('pointermove', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.menu-item');
      if (b && !b.disabled) this.focus(Number(b.dataset['i']), true);
    });
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.menu-item');
      if (!b || b.disabled) return;
      this.focus(Number(b.dataset['i']), false);
      this.pick();
    });
  }

  setItems(items: ListItem[]): void {
    this.items = items;
    for (const el of [...this.root.querySelectorAll('.menu-item')]) el.remove();
    items.forEach((it, i) => {
      const b = h('button', it.minor ? 'menu-item minor' : 'menu-item', `${it.icon ? `<i class="ico">${it.icon}</i>` : ''}${escapeHtml(it.label)}${it.note ? `<small>${escapeHtml(it.note)}</small>` : ''}`);
      b.type = 'button';
      b.dataset['i'] = String(i);
      b.dataset['id'] = it.id;
      b.disabled = !!it.disabled;
      this.root.appendChild(b);
    });
    this.index = Math.min(this.index, Math.max(0, items.length - 1));
    if (this.items[this.index]?.disabled) this.index = Math.max(0, this.items.findIndex((x) => !x.disabled));
    this.render(false);
  }

  setNote(id: string, note: string, html = false): void {
    const it = this.items.find((x) => x.id === id);
    if (it) it.note = note;
    const b = this.root.querySelector<HTMLButtonElement>(`.menu-item[data-id="${CSS.escape(id)}"]`);
    if (!b) return;
    let s = b.querySelector('small');
    if (!s) {
      s = document.createElement('small');
      b.appendChild(s);
    }
    if (html) s.innerHTML = note;
    else s.textContent = note;
  }

  /** Inline segmented value under a row (pause-menu Rider / Bike): the current option lit, the rest dim. */
  setSegment(id: string, options: { v: string; l: string }[], current: string): void {
    this.setNote(id, `<span class="mini-seg">${options.map((o) => `<b class="${o.v === current ? 'on' : ''}">${escapeHtml(o.l)}</b>`).join('')}</span>`, true);
  }

  current(): string | null {
    return this.items[this.index]?.id ?? null;
  }

  focus(i: number, tick: boolean): void {
    if (i === this.index || !this.items[i] || this.items[i]!.disabled) return;
    this.index = i;
    if (tick) this.sfx.tick();
    this.render(true);
  }

  focusId(id: string): void {
    const i = this.items.findIndex((x) => x.id === id);
    if (i >= 0) {
      this.index = i;
      this.render(false);
    }
  }

  move(dy: number): void {
    if (!dy || this.items.length === 0) return;
    let i = this.index;
    for (let n = 0; n < this.items.length; n++) {
      i = (i + dy + this.items.length) % this.items.length;
      if (!this.items[i]!.disabled) break;
    }
    this.focus(i, true);
  }

  pick(): void {
    const it = this.items[this.index];
    if (!it || it.disabled) return;
    this.sfx.confirm();
    this.onPick?.(it.id);
  }

  /** Re-measure the bar (after show / resize). */
  render(animate: boolean): void {
    const buttons = this.root.querySelectorAll<HTMLButtonElement>('.menu-item');
    buttons.forEach((b, i) => b.classList.toggle('on', i === this.index));
    const b = buttons[this.index];
    if (!b) {
      this.bar.classList.remove('on');
      return;
    }
    if (!animate) this.bar.style.transition = 'none';
    if (this.axis === 'x') {
      // Underline: the bar slides along the row and takes the focused tab's width (height from CSS).
      this.bar.style.transform = `translateX(${b.offsetLeft}px)`;
      this.bar.style.width = `${b.offsetWidth}px`;
    } else {
      this.bar.style.transform = `translateY(${b.offsetTop}px)`;
      this.bar.style.height = `${b.offsetHeight}px`;
      this.bar.style.width = `${Math.max(this.root.clientWidth, b.offsetWidth + 24)}px`;
    }
    this.bar.classList.add('on');
    if (!animate) {
      void this.bar.offsetHeight;
      this.bar.style.transition = '';
    }
    this.onChange?.(this.items[this.index]!.id);
  }
}

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------

/** Tile icons (24-unit viewBox, `currentColor`): bike / clapperboard / gear, drawn above the word. */
const MENU_ICON: Record<'garage' | 'review' | 'settings', string> = {
  garage: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="16" r="3.4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="18.5" cy="16" r="3.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 16l3.2-6.2h4.6l2.6 3.4h2.6M8.7 9.8L7 7.2h3.4M13.3 9.8l1.6-3.2h2.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  review: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.5h18V19a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19z" fill="currentColor"/><path d="M3.6 8.6L2.7 5.4 19.9 2.6l.9 3.2z" fill="currentColor"/><path d="M6.4 5.6l1.9 2.6M10.6 4.9l1.9 2.6M14.8 4.2l1.9 2.6" stroke="#0c0e12" stroke-width="1.4"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.4l1.9 1 2.1-.5 1.3 1.8 2 .8.1 2.2 1.5 1.6-1 2 .4 2.1-1.8 1.3-.8 2-2.2.1-1.6 1.5-2-1-2.1.4-1.3-1.8-2-.8-.1-2.2-1.5-1.6 1-2-.4-2.1 1.8-1.3.8-2 2.2-.1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`,
};

/** Nalati grassland tint shown in the strip until the plate decodes (the biome is not in `BIOME_TINT`: it is not built yet). */
const NALATI_TINT = 'linear-gradient(180deg, #3f7fc8 0%, #8fbde8 44%, #7aa63f 56%, #3d6a25 100%)';

/**
 * The strip's plate: `keyart-nalati-*` from the art pack (`kind: keyart`, `biome: nalati` — a key-art plate, not a
 * biome, until Nalati is built), the `2x` tier on DPR > 1.5 or wide viewports as `ArtManifest.keyart` picks; null
 * (the tint stays) when the pack lacks it.
 */
export function menuPlate(art: ArtManifest): ArtEntry | null {
  const list = art.all().filter((e) => e.kind === 'keyart' && (e.biome as string) === 'nalati');
  if (list.length === 0) return null;
  const hi = (window.devicePixelRatio || 1) > 1.5 || window.innerWidth > 1400;
  return list.find((e) => e.variant === (hi ? '2x' : '1x')) ?? list[0]!;
}

/**
 * Main menu, round 3 B2 "Strip" (assets/design/menu/round3/SPEC.md § B2, ask #42): the boot screen — there is
 * no title step. The Lobby split turned sideways: a wide cinematic strip of the Nalati jump across the top
 * (the `keyart-nalati` plate, cropped by the band, a grassland tint until it decodes) with the wordmark large
 * in two lines over the sky at the left and the badge plate + build stamp under it; a charcoal band with the
 * amber edge along the bottom holding one row of four big tiles — GARAGE · REVIEW · SETTINGS (icon above the
 * word) and PLAY at the right, amber, 1.6× wider — and CREDITS small under GARAGE. Nothing else: this is the
 * title menu, not a status board — no track, session, progress, best time or bike class is read here
 * (the level select and the garage keep their own). The list's DOM order stays play · garage · review ·
 * settings · credits (keys / pad / e2e); PLAY is moved to the right end visually with `order`.
 */
export class MainMenuScreen extends Screen {
  private readonly list: FocusList;
  private readonly keyart: HTMLDivElement;

  constructor(parent: HTMLElement, sfx: UiSfx, art: ArtManifest, private readonly cb: FrontCallbacks) {
    super(parent, 'menu-screen');
    this.keyart = h('div', 'menu-keyart');
    this.keyart.style.backgroundImage = NALATI_TINT; // never the shorthand: it would reset background-size
    // The big title (near-white display face over the sky), then the badge: the wordmark's gradient is its own
    // background (clip: text), so the slanted plate is a wrapper around it; the build stamp under the plate.
    const head = h('div', 'menu-head');
    const title = h('div', 'menu-title', `<span>Trials</span><span>Gauntlet</span>`);
    const badge = h('div', 'menu-badge');
    const plate = h('div', 'menu-plate');
    plate.appendChild(h('div', 'wordmark', GAME_NAME));
    badge.append(plate, h('div', 'menu-build', escapeHtml(BUILD_STAMP_SHORT)));
    head.append(title, badge);
    const band = h('div', 'menu-band');
    this.list = new FocusList(band, sfx, 'menu-list tiles', 'x');
    this.root.append(this.keyart, h('div', 'grain'), head, band);
    this.list.setItems([
      { id: 'play', label: 'Play' },
      { id: 'garage', label: 'Garage', icon: MENU_ICON.garage },
      { id: 'review', label: 'Review', icon: MENU_ICON.review },
      { id: 'settings', label: 'Settings', icon: MENU_ICON.settings },
      { id: 'credits', label: 'Credits', minor: true },
    ]);
    this.list.root.addEventListener('focusin', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.menu-item');
      if (!button) return;
      this.list.focusId(button.dataset['id']!);
    });
    this.list.onPick = (id) => {
      if (id === 'play') this.cb.goto('tracks');
      else if (id === 'garage') this.cb.goto('garage');
      else if (id === 'review') this.cb.goto('review');
      else if (id === 'settings') this.cb.goto('settings');
      else if (id === 'credits') this.cb.goto('credits');
    };
    art.whenReady(() => art.applyBackground(this.keyart, menuPlate(art)));
    window.addEventListener('resize', () => {
      if (this.visible) this.list.render(false);
    });
  }

  override show(): void {
    super.show();
    this.list.focusId('play');
    requestAnimationFrame(() => this.list.render(false));
  }

  nav(dx: number, dy: number): void {
    if (!this.visible || !isLiveTarget(this.root)) return;
    // One row of tiles: either axis steps along it (the garage owns every customisation row now).
    this.list.move(dx || dy);
  }
  confirm(): void {
    if (!this.visible || !isLiveTarget(this.root)) return;
    this.list.pick();
  }
  /** Boot screen: Esc / B has nowhere further back to go. */
  back(): void {}
}

// ---------------------------------------------------------------------------
// Track select — one continuous world map (assets/design/tracks/round4/SPEC.md § C "Ascent", ask #38)
// ---------------------------------------------------------------------------

interface PinRef {
  el: HTMLButtonElement;
  pin: Pin;
}

interface RegionRef {
  page: Page;
  el: HTMLDivElement;
  pins: PinRef[];
}

/** The camera: the world origin's screen position (px, inside the map) and the zoom (1 = a plate at `--tile-w`). */
interface Cam {
  x: number;
  y: number;
  z: number;
}

const FLY_MS = 380;

/**
 * One mountain under a 2-D camera. The six isometric night plates (`art/tiles/`) — the proving-ground apron at the
 * foot, then Industrial, Canyon, Snow, Night City and the Foundry summit one terrace up-and-right each — are laid
 * out in world space (`trackMap.ts`: `PLATE_OFFSET`, `WORLD`) inside one scene root that the camera moves with a
 * single `translate(...) scale(...)`; nothing scrolls. One trail (an SVG polyline in world units, the cleared part
 * lit) threads every campaign pin in biome order; the tier gate is a hazard-tape barrier across the trail at the
 * seam, carrying the next locked track and its rule. Pins keep their screen size at any zoom (they counter-scale)
 * until the camera is far enough out that they fold to dots and stop taking taps.
 *
 * Gestures: one finger / mouse drags the map (with a short inertia), a pinch or the wheel zooms about the pointer
 * between the fit zoom (the whole mountain) and about one biome filling the viewport; a tap on an unfocused pin
 * focuses it (the card rises), the focused pin or RIDE launches, a locked pin shakes and states its rule; a tap on
 * the map when zoomed out flies to the nearest pin. Keys / pad: ←→ walk the pins along the trail across regions,
 * ↓ reaches the card's actions, ↑↓ past them step regions, Enter launches, V / Y watches the PB, Esc / B back;
 * the camera follows the focused pin into the free middle of the viewport. The vertical altimeter on the right
 * edge lists every region with its `n / m` and padlocks (every lock visible without a pan); a tap on a rung flies
 * there. The screen opens centred on the player's current track (last played if open, else `nextTrack()`) at
 * the opening zoom (`ZOOM.open`) — about one biome in view, never the whole map crammed in.
 */
export class TrackSelectScreen extends Screen {
  private readonly map: HTMLDivElement;
  private readonly scene: HTMLDivElement;
  private readonly mini: HTMLDivElement;
  private readonly totalsEl: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private regions: RegionRef[] = [];
  private page = 0;
  private pinIndex: number[] = [];
  private launching = false;
  /** Card actions get keyboard focus after the pins (↓ from a pin, ↑ back). */
  private action = -1;
  // -- camera --
  private cam: Cam = { x: 0, y: 0, z: 1 };
  /** px per world unit at zoom 1 (from `--tile-w`). */
  private s0 = 0.5;
  private zMin = 0.3;
  private fly = 0;
  private inertia = 0;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch0 = 0;
  private pinchZ0 = 1;
  private vel = { x: 0, y: 0 };
  private lastMoveAt = 0;
  private dragPx = 0;
  private dragging = false;
  private far = false;
  private mid = false;
  /** The world point the camera is centred on (the last fly's target): a resize / re-show re-centres on it. */
  private anchor: { x: number; y: number } | null = null;
  /** The user has panned / zoomed since the last fly: a resize keeps the camera where they left it. */
  private userMoved = false;
  /** Screen-space boxes (map px) the overlays cover — the card, the altimeter, the MENU pill: a pin under one is shaded and takes no taps. */
  private blocks: { l: number; t: number; r: number; b: number }[] = [];

  constructor(
    parent: HTMLElement,
    private readonly sfx: UiSfx,
    private readonly art: ArtManifest,
    private readonly cb: FrontCallbacks,
    private readonly bestOf: (id: string) => BestEntry | null,
    private readonly state: () => FrontState,
    /** Local leaderboard (game.md § leaderboard): the class in effect's top 5 on the card. */
    private readonly boardOf?: (id: string, bike: BikeClass) => BoardEntry[],
  ) {
    super(parent, 'tracks-screen');
    injectTrackMapStyles();
    const head = h('div', 'tracks-head');
    head.innerHTML = `<h1>Select track</h1>`;
    this.totalsEl = h('div', 'tracks-totals');
    head.appendChild(this.totalsEl);
    this.map = h('div', 'tmap');
    this.scene = h('div', 'tscene');
    this.scene.style.width = `${WORLD.w}px`;
    this.scene.style.height = `${WORLD.h}px`;
    this.map.appendChild(this.scene);
    this.mini = h('div', 'tmini');
    this.card = h('div', 'tcard');
    this.legend = h('div', 'legend', LEGEND_KB);
    this.root.append(h('div', 'grain'), head, this.map, this.card, this.mini, this.legend);
    this.addBackButton('Menu');
    this.bindCamera();
    this.map.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || this.dragging || this.far) return;
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.tpin');
      if (b) this.focusPin(Number(b.dataset['p']), Number(b.dataset['i']), true, false);
    });
    this.map.addEventListener('click', (e) => {
      if (this.dragPx > 8) return; // a drag that ended on a button is not a tap
      const t = e.target as HTMLElement;
      const pin = t.closest<HTMLButtonElement>('.tpin');
      if (pin && !this.far) {
        const p = Number(pin.dataset['p']);
        const i = Number(pin.dataset['i']);
        const already = p === this.page && i === this.pinIndex[p] && this.action < 0;
        this.focusPin(p, i, false, true);
        if (already || this.current()?.pin.locked) this.confirm(); // the focused pin launches; a locked pin shakes and states its rule
        return;
      }
      const gate = t.closest<HTMLButtonElement>('.gate');
      if (gate && !this.far) {
        const at = locate(this.regions.map((x) => x.page), gate.dataset['track']);
        if (at) this.focusPin(at.page, at.pin, true, true);
        return;
      }
      if (this.far) {
        // Zoomed out: a tap on the map flies to the nearest pin at working zoom.
        const near = this.nearestPin(e.clientX, e.clientY);
        if (near) this.focusPin(near.p, near.i, true, true, ZOOM.open);
      }
    });
    this.card.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLButtonElement>('.tc-actions button');
      if (!act) return;
      if (act.classList.contains('tc-ride')) this.confirm();
      else if (act.classList.contains('tc-ghost')) this.alt();
      else if (act.classList.contains('tc-review')) this.review();
    });
    this.mini.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.tm');
      if (b) this.gotoPage(Number(b.dataset['p']), true, true);
    });
    window.addEventListener('resize', () => {
      if (this.visible) this.layout();
    });
  }

  // ------------------------------------------------------------------ camera

  private bindCamera(): void {
    const el = this.map;
    const move = (e: PointerEvent): void => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      this.dragPx += Math.abs(dx) + Math.abs(dy);
      if (this.dragPx > 8 && !this.dragging) {
        this.dragging = true;
        el.classList.add('grabbing');
      }
      if (this.pointers.size === 1) {
        const now = performance.now();
        const dt = Math.max(1, now - this.lastMoveAt);
        this.lastMoveAt = now;
        this.cam.x += dx;
        this.cam.y += dy;
        this.anchor = null;
        this.userMoved = true;
        this.vel = { x: 0.6 * this.vel.x + 0.4 * (dx / dt), y: 0.6 * this.vel.y + 0.4 * (dy / dt) };
      } else if (this.pointers.size === 2 && this.pinch0 > 0) {
        const [a, b] = [...this.pointers.values()];
        const span = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (span > 0) {
          const r = el.getBoundingClientRect();
          this.zoomAt(this.pinchZ0 * (span / this.pinch0), (a!.x + b!.x) / 2 - r.left, (a!.y + b!.y) / 2 - r.top);
        }
      }
      this.pushCam();
    };
    const release = (e: PointerEvent): void => {
      if (!this.pointers.delete(e.pointerId)) return;
      if (this.pointers.size === 1) {
        this.pinch0 = 0;
        const [a] = [...this.pointers.values()];
        if (a) this.vel = { x: 0, y: 0 };
      } else if (this.pointers.size === 0) {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
        el.classList.remove('grabbing');
        if (this.dragging && performance.now() - this.lastMoveAt < 80 && Math.hypot(this.vel.x, this.vel.y) > 0.05) this.startInertia();
        // The click that follows a drag is swallowed (`dragPx` is read there), then the slate is clean.
        setTimeout(() => {
          this.dragPx = 0;
          this.dragging = false;
        }, 0);
      }
    };
    el.addEventListener('pointerdown', (e) => {
      if (!this.visible || !isLiveTarget(this.root) || this.launching) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.stopFly();
      this.stopInertia();
      if (this.pointers.size === 0) {
        this.dragPx = 0;
        this.dragging = false;
        this.vel = { x: 0, y: 0 };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', release);
        window.addEventListener('pointercancel', release);
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch0 = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        this.pinchZ0 = this.cam.z;
      }
      this.lastMoveAt = performance.now();
    });
    el.addEventListener('wheel', (e) => {
      if (!this.visible || !isLiveTarget(this.root)) return;
      e.preventDefault();
      this.stopFly();
      this.stopInertia();
      const r = el.getBoundingClientRect();
      const f = Math.exp(-Math.max(-240, Math.min(240, e.deltaY)) * 0.0016);
      this.zoomAt(this.cam.z * f, e.clientX - r.left, e.clientY - r.top);
      this.pushCam();
    }, { passive: false });
    // Two-finger trackpad pinch on macOS Safari arrives as a gesture event, not a wheel.
    let gz = 0;
    el.addEventListener('gesturestart', (e) => { e.preventDefault(); gz = this.cam.z; });
    el.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      const scale = (e as Event & { scale?: number }).scale ?? 1;
      if (!this.visible || !gz || !scale) return;
      const r = el.getBoundingClientRect();
      this.zoomAt(gz * scale, r.width / 2, r.height / 2);
      this.pushCam();
    });
  }

  /** Set the zoom keeping the world point under (`sx`, `sy`) (map px) where it is. */
  private zoomAt(z: number, sx: number, sy: number): void {
    this.anchor = null;
    this.userMoved = true;
    const nz = Math.max(this.zMin, Math.min(ZOOM.max, z));
    const f = nz / this.cam.z;
    this.cam.x = sx - (sx - this.cam.x) * f;
    this.cam.y = sy - (sy - this.cam.y) * f;
    this.cam.z = nz;
  }

  private k(): number {
    return this.s0 * this.cam.z;
  }

  /** Keep the mountain on screen: never pan past its edge (plus a little air); centre it when it is smaller than the map. */
  private clampCam(c: Cam): Cam {
    const w = this.map.clientWidth || 1;
    const hgt = this.map.clientHeight || 1;
    const k = this.s0 * c.z;
    const ww = WORLD.w * k;
    const wh = WORLD.h * k;
    const air = 0.25;
    const x = ww <= w ? (w - ww) / 2 : Math.max(w - ww - w * air, Math.min(w * air, c.x));
    const y = wh <= hgt ? (hgt - wh) / 2 : Math.max(hgt - wh - hgt * air, Math.min(hgt * air, c.y));
    return { x, y, z: c.z };
  }

  /** Write the camera to the scene root (one transform) and the counter-scale the pins read; shade the pins under an overlay. */
  private pushCam(): void {
    this.cam = this.clampCam(this.cam);
    const k = this.k();
    this.scene.style.transform = `translate(${this.cam.x.toFixed(2)}px, ${this.cam.y.toFixed(2)}px) scale(${k.toFixed(5)})`;
    // Pins counter-scale the scene's whole scale (s0 × zoom) so the disc is 44 screen px at any working zoom; past the fold they shrink with the scene.
    this.scene.style.setProperty('--inv', (1 / (this.s0 * Math.max(this.cam.z, ZOOM.pinMin))).toFixed(4));
    const far = this.cam.z < ZOOM.pinMin;
    if (far !== this.far) {
      this.far = far;
      this.scene.classList.toggle('far', far);
    }
    const mid = this.cam.z < ZOOM.plates;
    if (mid !== this.mid) {
      this.mid = mid;
      this.scene.classList.toggle('mid', mid);
    }
    this.scene.dataset['zoom'] = this.cam.z.toFixed(3);
    this.scene.dataset['x'] = Math.round(this.cam.x).toString();
    this.scene.dataset['y'] = Math.round(this.cam.y).toString();
    this.shade();
  }

  /** Re-read the overlays' boxes (map px). Called on layout and after the card re-renders (its height follows its content). */
  private measureBlocks(): void {
    const m = this.map.getBoundingClientRect();
    this.blocks = [];
    if (!m.width) return;
    for (const el of [this.card, this.mini, this.root.querySelector<HTMLElement>('.backbtn')]) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2) continue;
      this.blocks.push({ l: r.left - m.left, t: r.top - m.top, r: r.right - m.left, b: r.bottom - m.top });
    }
  }

  /** A pin (or the gate) whose screen box meets an overlay is shaded: drawn dim, no pointer — nothing tappable hides under another tappable. */
  private shade(): void {
    if (this.blocks.length === 0 || this.far) return;
    const k = this.k();
    const hit = (sx: number, sy: number, hw: number, up: number, down: number): boolean => {
      for (const b of this.blocks) if (sx + hw > b.l && sx - hw < b.r && sy + down > b.t && sy - up < b.b) return true;
      return false;
    };
    for (const ref of this.regions)
      for (const pr of ref.pins) {
        const sx = this.cam.x + pr.pin.wx * k;
        const sy = this.cam.y + pr.pin.wy * k;
        pr.el.classList.toggle('shaded', hit(sx, sy, 47, 40, 70));
      }
    const g = this.scene.querySelector<HTMLElement>('.gate');
    if (g) g.classList.toggle('shaded', hit(this.cam.x + parseFloat(g.style.left) * k, this.cam.y + parseFloat(g.style.top) * k, 90, 30, 40));
  }

  /** The part of the map not under the card or the altimeter (map px), where a focused pin should sit. */
  private freeBox(): { l: number; r: number; t: number; b: number } {
    const m = this.map.getBoundingClientRect();
    let l = 0;
    let r = m.width;
    // The overlays sit at fixed screen positions, so their boxes are valid while the screen is hidden (built before its show).
    const c = this.card.getBoundingClientRect();
    const a = this.mini.getBoundingClientRect();
    if (c.width > 0 && c.left - m.left < m.width * 0.5) l = Math.max(l, c.right - m.left + 8);
    if (a.width > 0) r = Math.min(r, a.left - m.left - 8);
    if (r - l < 120) {
      l = 0;
      r = m.width;
    }
    return { l, r, t: 0, b: m.height };
  }

  /** Fly the camera so world point (`wx`, `wy`) lands at the free box's centre, at `z` (default: the current zoom, raised to the opening zoom when folded to dots). */
  private flyTo(wx: number, wy: number, z?: number, smooth = true): void {
    const box = this.freeBox();
    const cx = (box.l + box.r) / 2;
    const cy = (box.t + box.b) / 2;
    const nz = Math.max(this.zMin, Math.min(ZOOM.max, z ?? (this.cam.z < ZOOM.pinMin ? ZOOM.open : this.cam.z)));
    const k = this.s0 * nz;
    const to = this.clampCam({ x: cx - wx * k, y: cy - wy * k, z: nz });
    this.anchor = { x: wx, y: wy };
    this.userMoved = false;
    this.stopInertia();
    this.stopFly();
    if (!smooth || typeof requestAnimationFrame !== 'function') {
      this.cam = to;
      this.pushCam();
      return;
    }
    const from = { ...this.cam };
    const t0 = performance.now();
    const step = (): void => {
      const t = Math.min(1, (performance.now() - t0) / FLY_MS);
      const e = 1 - Math.pow(1 - t, 3);
      // Zoom interpolates geometrically so a fly across zoom levels keeps a steady pace.
      const z = from.z * Math.pow(to.z / from.z, e);
      this.cam = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z };
      this.pushCam();
      if (t < 1) this.fly = requestAnimationFrame(step);
      else this.fly = 0;
    };
    this.fly = requestAnimationFrame(step);
  }

  private stopFly(): void {
    if (this.fly && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.fly);
    this.fly = 0;
  }

  private startInertia(): void {
    this.stopInertia();
    if (typeof requestAnimationFrame !== 'function') return;
    let last = performance.now();
    const step = (): void => {
      const now = performance.now();
      const dt = Math.min(50, now - last);
      last = now;
      const d = Math.pow(0.92, dt / 16.7);
      this.vel = { x: this.vel.x * d, y: this.vel.y * d };
      const before = { x: this.cam.x, y: this.cam.y };
      this.cam.x += this.vel.x * dt;
      this.cam.y += this.vel.y * dt;
      this.pushCam();
      // Against the edge: the clamp ate the move, stop.
      const stuck = Math.abs(this.cam.x - before.x) < 0.01 && Math.abs(this.cam.y - before.y) < 0.01;
      if (stuck || Math.hypot(this.vel.x, this.vel.y) < 0.01 || !this.visible) {
        this.inertia = 0;
        return;
      }
      this.inertia = requestAnimationFrame(step);
    };
    this.inertia = requestAnimationFrame(step);
  }

  private stopInertia(): void {
    if (this.inertia && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.inertia);
    this.inertia = 0;
  }

  /** Screen position of a pin (map px) under the current camera. */
  private screenOf(pin: Pin): { x: number; y: number } {
    const k = this.k();
    return { x: this.cam.x + pin.wx * k, y: this.cam.y + pin.wy * k };
  }

  private nearestPin(clientX: number, clientY: number): { p: number; i: number } | null {
    const m = this.map.getBoundingClientRect();
    const sx = clientX - m.left;
    const sy = clientY - m.top;
    let best: { p: number; i: number; d: number } | null = null;
    this.regions.forEach((ref, p) =>
      ref.pins.forEach((pr, i) => {
        const s = this.screenOf(pr.pin);
        const d = Math.hypot(s.x - sx, s.y - sy);
        if (!best || d < best.d) best = { p, i, d };
      }),
    );
    return best;
  }

  /** `--tile-w` from the map's box (today's rule: the box's left 58 % or its height × 3/2) → px per world unit at zoom 1; the fit zoom follows. Called on build, show and resize (never per frame). */
  private layout(): void {
    const w = this.map.clientWidth;
    const hgt = this.map.clientHeight;
    if (!w || !hgt) {
      this.pushCam(); // no box yet (hidden, or jsdom): the camera is still written so the scene has a transform
      return;
    }
    const cs = getComputedStyle(this.map);
    const inner = w - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const tileW = Math.max(120, Math.floor(Math.min(inner * 0.58, hgt * 1.5)));
    this.map.style.setProperty('--tile-w', `${tileW}px`);
    this.s0 = tileW / TILE.w;
    this.zMin = fitZoom(w, hgt, tileW);
    this.measureBlocks();
    const cur = this.current();
    if (this.anchor) this.flyTo(this.anchor.x, this.anchor.y, undefined, false);
    else if (cur && !this.userMoved) {
      const t = this.frame(cur.pin);
      this.flyTo(t.x, t.y, t.z, false);
    } else this.pushCam();
  }

  // ------------------------------------------------------------------ build

  build(tracks: TrackDef[]): void {
    const s = this.state();
    const medalOf: MedalOf = (t) => this.bestOf(t)?.medal ?? null;
    const ship = shipTracks(tracks, s.dev);
    const pages = buildPages(tracks, medalOf, s.dev);
    const gate = nextGate(tracks, medalOf, s.dev);
    this.scene.innerHTML = '';
    this.mini.innerHTML = '';
    this.regions = [];
    this.action = -1;
    // The rock mass under the whole stack, then the seams (behind every plate): the quay wall under Industrial, then a cliff band under each higher biome's
    // front-left edge (down to the terrace below's back-right edge), in the biome's tint.
    const mass = h('div', 'tmass');
    mass.style.clipPath = `polygon(${massPolygon().map((p) => `${p.x}px ${p.y}px`).join(', ')})`;
    this.scene.appendChild(mass);
    for (let i = 1; i < pages.length; i++) {
      const page = pages[i]!;
      const o = PLATE_OFFSET[page.id];
      const seam = h('div', `tseam${i === 1 ? ' quay' : ''}`);
      seam.style.setProperty('--tint', BIOME_TINT[page.id as Exclude<PageId, 'island'>]);
      seam.style.left = `${o.x}px`;
      seam.style.top = `${o.y}px`;
      this.scene.appendChild(seam);
    }
    for (const page of pages) {
      const el = h('div', 'tregion');
      el.dataset['page'] = page.id;
      const o = PLATE_OFFSET[page.id];
      el.style.left = `${o.x}px`;
      el.style.top = `${o.y}px`;
      el.style.zIndex = String(2 + page.index);
      const tile = h('div', 'ttile');
      tile.style.setProperty('--lamp', page.lamp);
      tile.style.setProperty('--tint', page.id === 'island' ? '#2a3440' : BIOME_TINT[page.id]);
      const plate = h('div', 'tart');
      const done = page.id === 'island' ? `<small>${escapeHtml(page.blurb)}</small>` : `<b>${page.done} / ${page.total}</b>`;
      tile.innerHTML = `<div class="glow"></div>`;
      tile.appendChild(plate);
      tile.appendChild(h('div', 'slab'));
      tile.insertAdjacentHTML('beforeend', `<div class="title">${escapeHtml(page.label)}${page.id === 'island' ? '' : ' · '}${done}</div>`);
      if (page.total > 0) tile.insertAdjacentHTML('beforeend', `<div class="ledge">${pageDots(page).map((d) => `<i class="${d}"></i>`).join('')}</div>`);
      el.appendChild(tile);
      this.scene.appendChild(el);
      this.regions.push({ page, el, pins: [] });
      const src = tilePlateSrc(page.id);
      void this.art.probe(src).then((ok) => {
        if (!ok || !plate.isConnected) return;
        plate.style.backgroundImage = `url("${src}")`;
        plate.classList.add('loaded');
      });
      // Altimeter rung (the summit at the top: rungs are prepended).
      const tm = h('button', `tm${page.locked ? ' locked' : ''}`);
      tm.type = 'button';
      tm.dataset['p'] = String(page.index);
      tm.dataset['id'] = page.id;
      const dots = page.id === 'island' ? `<span>No medals</span>` : `${pageDots(page).map((d) => `<i class="${d}"></i>`).join('')}<span>${page.done}/${page.total}</span>`;
      tm.innerHTML = `<span class="tm-txt"><span class="tm-name">${escapeHtml(page.short)}</span><span class="tm-dots">${dots}</span></span>`;
      this.mini.prepend(tm);
    }
    // The trail: one polyline in world units over every plate; the pins and the gate ride above it.
    const route = worldRoute(pages);
    const routeLayer = h('div', 'troute');
    if (route.dim) routeLayer.innerHTML = `<svg class="route" viewBox="0 0 ${WORLD.w} ${WORLD.h}" preserveAspectRatio="none" aria-hidden="true"><path class="dim" d="${route.dim}"/>${route.lit ? `<path class="lit" d="${route.lit}"/>` : ''}</svg>`;
    this.scene.appendChild(routeLayer);
    const pinLayer = h('div', 'tpins');
    for (const ref of this.regions) {
      ref.pins = ref.page.pins.map((pin, i) => {
        const b = this.pinEl(pin, ref.page.index, i);
        pinLayer.appendChild(b);
        return { el: b, pin };
      });
    }
    // The tier gate: a hazard-tape barrier across the trail at the seam before the next locked track.
    if (gate) {
      const at = gateAnchor(pages, gate);
      const g = h('button', 'gate', `<b>${escapeHtml(TIER_LABEL[gate.tier])} · ${escapeHtml(gate.rule)}</b><span>Next unlock · ${escapeHtml(codeOf(gate.track))} ${escapeHtml(gate.track.name)}</span><small>${escapeHtml(gate.rule)}</small>`);
      g.type = 'button';
      g.dataset['track'] = gate.track.id;
      g.style.left = `${at.x}px`;
      g.style.top = `${at.y}px`;
      pinLayer.appendChild(g);
    }
    this.scene.appendChild(pinLayer);
    this.pinIndex = this.regions.map((p) => defaultPin(p.page));
    const totals = medalTotals(ship, medalOf);
    const dot = (m: Medal, n: number): string => `<span style="color:var(--${m === 'platinum' ? 'plat' : m})"><i></i>${n}</span>`;
    this.totalsEl.innerHTML = `<span>${totals.cleared}/${totals.total} cleared</span>${dot('platinum', totals.platinum)}${dot('gold', totals.gold)}${dot('silver', totals.silver)}${dot('bronze', totals.bronze)}`;
    // Opening focus: last played if still open, else the first unridden track of the highest open tier (`nextTrack`).
    const target = nextTrack(ship, medalOf, s.dev, s.lastPlayed);
    const at = locate(pages, target?.id) ?? { page: 1, pin: 0 };
    this.page = at.page;
    this.pinIndex[at.page] = at.pin;
    this.cam.z = ZOOM.open;
    this.anchor = null; // the first layout frames the region
    this.userMoved = false;
    this.applyFocus(false);
    this.layout();
  }

  /**
   * The frame for the focused pin's region: its pins as a group, at the largest zoom ≤ ZOOM.open (never below ZOOM.plates)
   * at which they all fit the free box — so the whole biome, B1 included, is on screen and tappable at open. When
   * they cannot fit even at ZOOM.plates, the pin itself at ZOOM.open.
   */
  private frame(pin: Pin): { x: number; y: number; z: number } {
    const ref = this.regions[this.page];
    if (!ref || ref.pins.length < 2) return { x: pin.wx, y: pin.wy, z: ZOOM.open };
    const c = regionCentre(ref.page);
    const box = this.freeBox();
    // Room for the outermost pins' own boxes (a 93 px plate, 40 up / 70 down from the disc).
    const zFit = Math.min((box.r - box.l - 100) / Math.max(1, c.w * this.s0), (box.b - box.t - 120) / Math.max(1, c.h * this.s0));
    const z = Math.min(ZOOM.open, zFit);
    if (z >= ZOOM.plates) return { x: c.x, y: c.y, z };
    return { x: pin.wx, y: pin.wy, z: ZOOM.open };
  }

  private pinEl(pin: Pin, p: number, i: number): HTMLButtonElement {
    const t = pin.track;
    const best = this.bestOf(t.id);
    const target = t.meta?.targetTimeS;
    const ahead = best && target ? best.time <= target : false;
    const el = h('button', `tpin${pin.locked ? ' locked' : ''}${pin.proving ? ' proving' : ''}`);
    el.type = 'button';
    el.dataset['p'] = String(p);
    el.dataset['i'] = String(i);
    el.dataset['track'] = t.id;
    el.style.left = `${pin.wx}px`;
    el.style.top = `${pin.wy}px`;
    const disc = pin.locked ? 'locked' : pin.medal ? `${pin.medal} plain` : pin.proving ? 'none proving' : 'none';
    const ghost = best?.recording && !pin.locked ? `<em class="tag ghost">▶ ${this.state().ghost ? 'Ghost' : 'PB'}</em>` : '';
    const pro = best?.bike === 'pro' ? '<em class="tag pro">Pro</em>' : '';
    const times = pin.proving ? '' : pin.locked ? `<span class="rule">${escapeHtml(pin.rule ?? '')}</span>` : `<span class="times"><b class="${ahead ? 'ahead' : ''}">${best ? formatTime(best.time) : '—'}</b> / ${target ? formatTime(target) : '—'}</span>`;
    el.innerHTML = `${pin.upNext ? '<em class="flag">Up next</em>' : ''}<span class="code">${escapeHtml(pin.code)}</span><span class="disc ${disc}" title="${pin.medal ?? (pin.locked ? 'locked' : 'no medal')}"></span>${ghost}${pro}<span class="plate">${escapeHtml(t.name)}</span>${times}`;
    if (pin.medal) {
      const discEl = el.querySelector<HTMLSpanElement>('.disc')!;
      const m = this.art.medal(pin.medal);
      if (m)
        void this.art.probe(m.src).then((ok) => {
          if (!ok) return;
          discEl.classList.remove('plain');
          discEl.style.backgroundImage = `url("${m.src}")`;
        });
    }
    return el;
  }

  /** Top-5 chips for the class the next launch rides (`FrontState.bikeClass`), medal-coloured; nothing when the board is empty. */
  private boardHtml(trackId: string): string {
    const bike = this.state().bikeClass;
    const rows = this.boardOf?.(trackId, bike) ?? [];
    if (rows.length === 0) return '';
    // Chips carry a short clock (`31.2`, `1:04.8`); the full time is the title.
    const short = (t: number): string => {
      const m = Math.floor(t / 60);
      const sec = (t - m * 60).toFixed(1);
      return m > 0 ? `${m}:${sec.padStart(4, '0')}` : sec;
    };
    const chips = rows.map((e, i) => `<span class="${e.medal}" title="#${i + 1} ${bike} · ${formatTime(e.time)} · ${e.faults} faults"><b>${short(e.time)}</b></span>`).join('');
    return `<div class="board" data-bike="${bike}" data-rows="${rows.length}">${chips}</div>`;
  }

  /** The rising card for the focused pin (bottom-left, screen space): re-rendered on every focus. */
  private renderCard(ref: RegionRef, cur: PinRef, animate: boolean): void {
    const { pin } = cur;
    const t = pin.track;
    const best = this.bestOf(t.id);
    const target = t.meta?.targetTimeS;
    const ahead = best && target ? best.time <= target : false;
    const kind = pin.proving ? (isLabTrack(t) ? 'Lab · physics proving ground' : 'Playground · always open') : `${TIER_LABEL[t.tier]} · ${ref.page.label}`;
    const medal = pin.proving ? '' : `<i class="tc-medal ${pin.locked ? 'none' : (pin.medal ?? 'none')}" title="${pin.medal ?? 'no medal'}"></i>`;
    const times = pin.proving ? `<div class="tc-times"><span>No medals</span></div>` : pin.locked ? `<div class="tc-rule">Locked · ${escapeHtml(pin.rule ?? '')}</div>` : `<div class="tc-times"><span>Best <b class="${ahead ? 'ahead' : ''}">${best ? formatTime(best.time) : '—'}</b></span><span>Target <b>${target ? formatTime(target) : '—'}</b></span></div>`;
    this.card.dataset['page'] = ref.page.id;
    this.card.dataset['track'] = t.id;
    this.card.innerHTML = `<div class="tc-head"><b>${escapeHtml(pin.code)}</b><span>${escapeHtml(kind)}</span>${medal}</div>
      <div class="tc-name">${escapeHtml(t.name)}</div><div class="tc-tech">${escapeHtml(t.meta?.technique ?? '')}</div>${times}${pin.proving || pin.locked ? '' : this.boardHtml(t.id)}
      <div class="tc-actions"><button type="button" class="tc-ride"${pin.locked ? ' disabled' : ''}>${pin.locked ? 'Locked' : 'Ride'}</button><button type="button" class="tc-ghost"${best?.recording && !pin.locked ? '' : ' hidden'}>▶ ${this.state().ghost ? 'Ghost' : 'Watch PB'}</button><button type="button" class="tc-review">Review</button></div>`;
    if (pin.medal && !pin.locked) {
      const m = this.art.medal(pin.medal);
      const el = this.card.querySelector<HTMLElement>('.tc-medal');
      if (m && el)
        void this.art.probe(m.src).then((ok) => {
          if (!ok || !el.isConnected) return;
          el.classList.add('img');
          el.style.backgroundImage = `url("${m.src}")`;
        });
    }
    this.card.classList.remove('rise');
    if (animate) {
      void this.card.offsetWidth;
      this.card.classList.add('rise');
    }
    this.applyAction();
    this.measureBlocks();
    this.shade();
  }

  private applyAction(): void {
    const buttons = [...this.card.querySelectorAll<HTMLButtonElement>('.tc-actions button')].filter((b) => !b.hidden);
    buttons.forEach((b, i) => b.classList.toggle('on', i === this.action));
  }

  /** Focus a pin; with `follow`, the camera brings it into the free middle of the viewport (a fly when it is outside it, or when `z` asks for a zoom; `region` frames the whole biome when it fits). */
  private focusPin(p: number, i: number, tick: boolean, follow: boolean, z?: number, region = false): void {
    if (this.launching) return;
    const ref = this.regions[p];
    const pr = ref?.pins[i];
    if (!ref || !pr) return;
    const moved = p !== this.page || i !== this.pinIndex[p] || this.action >= 0;
    this.page = p;
    this.pinIndex[p] = i;
    this.action = -1;
    if (tick && moved) this.sfx.tick();
    this.applyFocus(moved);
    if (follow) this.follow(pr.pin, z, region);
  }

  /** The camera follows the focused pin: a fly when it sits outside the middle 60 % of the free box (or when folded to dots), else stay. */
  private follow(pin: Pin, z?: number, region = false): void {
    const box = this.freeBox();
    const s = this.screenOf(pin);
    const mx = (box.r - box.l) * 0.2;
    const my = (box.b - box.t) * 0.2;
    const inside = s.x >= box.l + mx && s.x <= box.r - mx && s.y >= box.t + my && s.y <= box.b - my;
    if (inside && z === undefined && this.cam.z >= ZOOM.pinMin && !region) return;
    if (region) {
      const f = this.frame(pin);
      this.flyTo(f.x, f.y, f.z);
      return;
    }
    this.flyTo(pin.wx, pin.wy, z);
  }

  private gotoPage(p: number, tick: boolean, follow: boolean): void {
    if (this.launching) return;
    if (!this.regions[p]) return;
    this.focusPin(p, this.pinIndex[p] ?? 0, tick, follow, undefined, true);
  }

  private applyFocus(animate: boolean): void {
    for (const ref of this.regions) for (const pin of ref.pins) pin.el.classList.remove('on');
    const ref = this.regions[this.page];
    const cur = ref?.pins[this.pinIndex[this.page] ?? 0];
    if (!ref || !cur) return;
    cur.el.classList.add('on');
    this.mini.querySelectorAll<HTMLButtonElement>('.tm').forEach((b) => b.classList.toggle('on', Number(b.dataset['p']) === this.page));
    this.renderCard(ref, cur, animate);
  }

  current(): PinRef | null {
    return this.regions[this.page]?.pins[this.pinIndex[this.page] ?? 0] ?? null;
  }

  override setDevice(d: 'keyboard' | 'gamepad' | 'touch' | null): void {
    if (!this.legend) return;
    this.legend.innerHTML =
      d === 'touch'
        ? '<span>Tap a pin</span><span>Drag · pinch</span>'
        : d === 'gamepad'
          ? '<span><i class="pad">✚</i>Pins · regions</span><span><i class="pad a">A</i>Ride</span><span><i class="pad b">B</i>Back</span>'
          : '<span><kbd>←→</kbd>Pins</span><span><kbd>Enter</kbd>Ride</span><span><kbd>V</kbd>Ghost</span><span>Drag · wheel</span><span><kbd>Esc</kbd>Back</span>';
  }

  /** The region of the focused pin (the harness reads it). */
  currentPage(): PageId | null {
    return this.regions[this.page]?.page.id ?? null;
  }

  /** The camera, for the harness: zoom, its bounds, and the pins whose anchors are on screen. */
  camera(): { zoom: number; zoomMin: number; zoomMax: number; x: number; y: number; pinsInView: string[]; far: boolean; mid: boolean } {
    const k = this.k();
    return {
      zoom: this.cam.z,
      zoomMin: this.zMin,
      zoomMax: ZOOM.max,
      x: this.cam.x,
      y: this.cam.y,
      far: this.far,
      mid: this.mid,
      pinsInView: pinsInView(this.regions.map((r) => r.page), { x: this.cam.x, y: this.cam.y, k }, this.map.clientWidth, this.map.clientHeight).map((p) => p.track.id),
    };
  }

  override show(): void {
    this.launching = false;
    super.show();
    this.layout();
    requestAnimationFrame(() => this.layout());
  }

  override hide(): void {
    this.stopFly();
    this.stopInertia();
    super.hide();
  }

  nav(dx: number, dy: number): void {
    if (this.launching) return;
    const ref = this.regions[this.page];
    if (!ref) return;
    if (dy) {
      // ↓ from the pins reaches the card's actions; ↓ again steps the region up the mountain; ↑ climbs back.
      const buttons = [...this.card.querySelectorAll<HTMLButtonElement>('.tc-actions button')].filter((b) => !b.hidden);
      if (dy > 0 && this.action < 0 && buttons.length > 0) {
        this.action = 0;
        this.sfx.tick();
        this.applyAction();
        return;
      }
      if (dy < 0 && this.action >= 0) {
        this.action = -1;
        this.sfx.tick();
        this.applyAction();
        return;
      }
      const p = Math.max(0, Math.min(this.regions.length - 1, this.page + dy));
      if (p !== this.page) this.gotoPage(p, true, true);
      return;
    }
    if (!dx) return;
    if (this.action >= 0) {
      const buttons = [...this.card.querySelectorAll<HTMLButtonElement>('.tc-actions button')].filter((b) => !b.hidden);
      this.action = Math.max(0, Math.min(buttons.length - 1, this.action + dx));
      this.sfx.tick();
      this.applyAction();
      return;
    }
    const i = (this.pinIndex[this.page] ?? 0) + dx;
    if (i >= 0 && i < ref.pins.length) this.focusPin(this.page, i, true, true);
    else {
      // Past the region's last pin: the next region (its first pin), or the previous one (its last pin).
      const p = this.page + dx;
      const next = this.regions[p];
      if (!next) return;
      this.focusPin(p, dx > 0 ? 0 : next.pins.length - 1, true, true);
    }
  }

  confirm(): void {
    const cur = this.current();
    if (!cur || this.launching) return;
    if (this.action >= 0) {
      const buttons = [...this.card.querySelectorAll<HTMLButtonElement>('.tc-actions button')].filter((b) => !b.hidden);
      const b = buttons[this.action];
      if (b?.classList.contains('tc-ghost')) return this.alt();
      if (b?.classList.contains('tc-review')) return this.review();
    }
    if (cur.pin.locked) {
      this.sfx.back();
      cur.el.animate?.([{ translate: '0 0' }, { translate: '-6px 0' }, { translate: '6px 0' }, { translate: '0 0' }], { duration: 240, easing: 'ease-out' });
      return;
    }
    this.launching = true;
    this.sfx.launch();
    cur.el.classList.add('go');
    setTimeout(() => this.cb.play(cur.pin.track.id), 180);
    setTimeout(() => {
      this.root.classList.add('leave');
    }, 200);
    setTimeout(() => {
      cur.el.classList.remove('go');
      this.hide();
      this.launching = false;
    }, 420);
  }

  back(): void {
    if (this.launching) return;
    this.sfx.back();
    this.cb.goto('menu');
  }

  /** `V` / pad Y / the card's ghost button: replay viewer on the focused pin's PB (no-op without a recording). */
  override alt(): void {
    const cur = this.current();
    if (!cur || this.launching || cur.pin.locked) return;
    if (!this.bestOf(cur.pin.track.id)?.recording) return;
    this.sfx.confirm();
    this.cb.watchPb(cur.pin.track.id);
  }

  /** The card's REVIEW: the review picker (the inbox owner's screen), as the menu's REVIEW tab does. */
  private review(): void {
    if (this.launching) return;
    this.sfx.confirm();
    this.cb.goto('review');
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

type SettingId = 'quality' | 'fps' | 'sound' | 'volume' | 'ghost' | 'rider' | 'bike' | 'telemetry' | 'runlog' | 'reset' | 'reload' | 'physics';

interface SettingRow {
  id: SettingId;
  el: HTMLDivElement;
  /** Left/right: change value by ±1 step. */
  step(d: number): void;
  /** Confirm: activate (segments cycle, reset arms/fires). */
  activate(): void;
}

export class SettingsScreen extends Screen {
  private rows: SettingRow[] = [];
  private index = 0;
  private resetArmed = 0;
  private runlogPaint: (() => void) | null = null;

  constructor(
    parent: HTMLElement,
    private readonly sfx: UiSfx,
    private readonly cb: FrontCallbacks,
    private readonly state: () => FrontState,
  ) {
    super(parent, 'settings-screen');
    const wrap = h('div', 'settings-wrap');
    wrap.innerHTML = `<h1>Settings</h1>`;
    const list = h('div', 'settings-list rise');
    const foot = h('div', 'settings-foot');
    foot.innerHTML = `<div class="controls-line">${controlsLineHtml()}</div><div class="build">${escapeHtml(GAME_NAME)} · ${escapeHtml(BUILD_STAMP)}</div>`;
    wrap.append(list, foot);
    this.legend = h('div', 'legend', `<span><kbd>↑↓</kbd>Row</span><span><kbd>←→</kbd>Change</span><span><kbd>Esc</kbd>Back</span>`);
    this.root.append(h('div', 'grain'), wrap, this.legend);
    this.addBackButton('Menu');

    const s = this.state;
    const seg = <T extends string>(id: SettingId, label: string, sub: string, opts: { v: T; l: string }[], get: () => T, set: (v: T) => void): void => {
      const el = h('div', 'setting');
      el.innerHTML = `<div class="lab">${label}<small>${sub}</small></div><div class="seg">${opts.map((o) => `<button type="button" data-v="${o.v}">${o.l}</button>`).join('')}</div>`;
      const paint = (): void => el.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('on', b.dataset['v'] === get()));
      el.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-v]');
        if (!b) return;
        this.focusRow(this.rows.findIndex((r) => r.el === el), false);
        set(b.dataset['v'] as T);
        this.sfx.confirm();
        paint();
      });
      const step = (d: number): void => {
        const i = opts.findIndex((o) => o.v === get());
        const n = opts[(i + d + opts.length) % opts.length]!.v;
        set(n);
        this.sfx.tick();
        paint();
      };
      paint();
      this.rows.push({ id, el, step, activate: () => step(1) });
      list.appendChild(el);
      el.addEventListener('pointerenter', () => this.focusRow(this.rows.findIndex((r) => r.el === el), true));
    };

    seg('quality', 'Quality', 'Auto climbs to High while the frame holds 60 and steps down when it does not', [{ v: 'auto', l: 'Auto' }, { v: 'low', l: 'Low' }, { v: 'medium', l: 'Med' }, { v: 'high', l: 'High' }], () => s().quality, (v) => this.cb.setQuality(v as QualityChoice));
    seg('fps', 'Frame rate', 'Auto = 60 · the meter top-right shows what you get', [{ v: 'auto', l: `Auto (${s().fpsInEffect})` }, { v: '30', l: '30' }, { v: '60', l: '60' }], () => s().fps, (v) => this.cb.setFps(v as FpsChoice));
    seg('sound', 'Sound', 'Engine, impacts, menu cues', [{ v: 'on', l: 'On' }, { v: 'off', l: 'Off' }], () => (s().sound ? 'on' : 'off'), (v) => this.cb.setSound(v === 'on'));

    // Volume slider row.
    {
      const el = h('div', 'setting');
      el.innerHTML = `<div class="lab">Volume<small>Master level</small></div><div class="slider"><button type="button" data-d="-1" aria-label="quieter">−</button><div class="bar"><i></i></div><button type="button" data-d="1" aria-label="louder">+</button><span class="val"></span></div>`;
      const paint = (): void => {
        const v = s().volume;
        el.querySelector<HTMLElement>('.bar i')!.style.width = `${Math.round(v * 100)}%`;
        el.querySelector('.val')!.textContent = `${Math.round(v * 100)}%`;
      };
      const step = (d: number): void => {
        const v = Math.max(0, Math.min(1, Math.round((s().volume + d * 0.1) * 10) / 10));
        this.cb.setVolume(v);
        this.sfx.tick();
        paint();
      };
      el.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-d]');
        if (!b) return;
        this.focusRow(this.rows.findIndex((r) => r.el === el), false);
        step(Number(b.dataset['d']));
      });
      el.addEventListener('pointerenter', () => this.focusRow(this.rows.findIndex((r) => r.el === el), true));
      paint();
      this.rows.push({ id: 'volume', el, step, activate: () => step(1) });
      list.appendChild(el);
    }

    seg('ghost', 'Ghost', 'Your personal-best run rides alongside', [{ v: 'on', l: 'On' }, { v: 'off', l: 'Off' }], () => (s().ghost ? 'on' : 'off'), (v) => this.cb.setGhost(v === 'on'));
    // The rider model (Classic / Blender / Img2) and the outfit live in the Garage only (garage round); the bike
    // mesh choice stays here because it applies on the next track load.
    if (s().models) {
      seg('bike', 'Bike model', 'Applies on the next track load', [{ v: 'proc', l: 'Procedural' }, { v: 'gltf', l: 'Modelled' }], () => s().bike, (v) => this.cb.setModel('bike', v as ModelChoice));
    }

    seg('telemetry', 'Run log', 'Keeps attempts, faults and crash spots on this device only', [{ v: 'on', l: 'On' }, { v: 'off', l: 'Off' }], () => (s().telemetry ? 'on' : 'off'), (v) => this.cb.setTelemetry(v === 'on'));
    const phys = s().physics;
    if (s().dev && phys && phys.available.length > 0 && this.cb.setPhysics) {
      // Hidden dev row (physics v2 A/B, docs/plans/physics-v2.md §16.2): reloads the page with `?physics=`.
      const opts = [{ v: 'default', l: phys.current === 'default' && phys.live ? `Default (${phys.live.toUpperCase()})` : 'Default' }, ...phys.available.map((v) => ({ v, l: v.toUpperCase() }))];
      const live = phys.live ? `Live solver: ${phys.live.toUpperCase()}` : 'Live solver: mock';
      seg('physics', 'Physics', `${live} · dev A/B — reloads the page`, opts, () => phys.current, (v) => this.cb.setPhysics?.(v as 'default' | 'v1' | 'v2'));
    }

    // Run log export: Copy (clipboard JSON) · Share (Web Share API, text) — never leaves the device otherwise.
    {
      const el = h('div', 'setting');
      el.innerHTML = `<div class="lab">Export run log<small></small></div><div class="btns"><button type="button" class="btn" data-a="copy">Copy</button><button type="button" class="btn" data-a="share">Share</button></div>`;
      const small = el.querySelector('small')!;
      const copyBtn = el.querySelector<HTMLButtonElement>('[data-a="copy"]')!;
      const shareBtn = el.querySelector<HTMLButtonElement>('[data-a="share"]')!;
      const paint = (): void => {
        const r = s().runlog;
        small.textContent = r.runs ? `${r.runs} ${r.runs === 1 ? 'run' : 'runs'} · ${r.tracks} ${r.tracks === 1 ? 'track' : 'tracks'} · JSON` : 'No runs logged yet';
        shareBtn.hidden = !s().canShare;
      };
      const flash = (btn: HTMLButtonElement, label: string, text: string): void => {
        btn.textContent = text;
        setTimeout(() => (btn.textContent = label), 1600);
      };
      const act = (a: 'copy' | 'share'): void => {
        if (a === 'copy') {
          void this.cb.copyRunLog().then((ok) => flash(copyBtn, 'Copy', ok ? 'Copied ✓' : 'Failed'));
        } else {
          void this.cb.shareRunLog().then((ok) => flash(shareBtn, 'Share', ok ? 'Shared ✓' : 'Cancelled'));
        }
        this.sfx.confirm();
      };
      el.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-a]');
        if (!b) return;
        this.focusRow(this.rows.findIndex((r) => r.el === el), false);
        act(b.dataset['a'] as 'copy' | 'share');
      });
      el.addEventListener('pointerenter', () => this.focusRow(this.rows.findIndex((r) => r.el === el), true));
      paint();
      this.rows.push({ id: 'runlog', el, step: () => undefined, activate: () => act('copy') });
      this.runlogPaint = paint;
      list.appendChild(el);
    }

    // Reset progress: two presses within 3 s.
    {
      const el = h('div', 'setting');
      el.innerHTML = `<div class="lab">Reset progress<small>Clears every best time, ghost and medal</small></div><button type="button" class="btn danger">Reset</button>`;
      const btn = el.querySelector<HTMLButtonElement>('button')!;
      const activate = (): void => {
        const now = performance.now();
        if (this.resetArmed && now - this.resetArmed < 3000) {
          this.resetArmed = 0;
          btn.classList.remove('armed');
          btn.textContent = 'Reset';
          this.cb.resetProgress();
          this.sfx.launch();
          el.querySelector('small')!.textContent = 'Progress cleared';
        } else {
          this.resetArmed = now;
          btn.classList.add('armed');
          btn.textContent = 'Sure?';
          this.sfx.back();
          setTimeout(() => {
            if (this.resetArmed && performance.now() - this.resetArmed >= 2900) {
              this.resetArmed = 0;
              btn.classList.remove('armed');
              btn.textContent = 'Reset';
            }
          }, 3000);
        }
      };
      btn.addEventListener('click', () => {
        this.focusRow(this.rows.findIndex((r) => r.el === el), false);
        activate();
      });
      el.addEventListener('pointerenter', () => this.focusRow(this.rows.findIndex((r) => r.el === el), true));
      this.rows.push({ id: 'reset', el, step: () => undefined, activate });
      list.appendChild(el);
    }

    // Reload game: the only way to pick up a new build from a home-screen install (no browser chrome).
    {
      const el = h('div', 'setting');
      el.innerHTML = `<div class="lab">Reload game<small>Fetches the latest build · settings and best times stay</small></div><button type="button" class="btn">⟳ Reload</button>`;
      const btn = el.querySelector<HTMLButtonElement>('button')!;
      const activate = (): void => {
        btn.textContent = 'Reloading…';
        this.sfx.confirm();
        void hardReload();
      };
      btn.addEventListener('click', () => {
        this.focusRow(this.rows.findIndex((r) => r.el === el), false);
        activate();
      });
      el.addEventListener('pointerenter', () => this.focusRow(this.rows.findIndex((r) => r.el === el), true));
      this.rows.push({ id: 'reload', el, step: () => undefined, activate });
      list.appendChild(el);
    }
    this.focusRow(0, false);
  }

  private focusRow(i: number, tick: boolean): void {
    if (i < 0 || i >= this.rows.length) return;
    if (i === this.index && this.rows[i]!.el.classList.contains('on')) return;
    this.index = i;
    if (tick) this.sfx.tick();
    this.rows.forEach((r, k) => r.el.classList.toggle('on', k === i));
    this.rows[i]!.el.scrollIntoView({ block: 'nearest' });
  }

  override show(): void {
    super.show();
    this.resetArmed = 0;
    this.runlogPaint?.();
    this.focusRow(0, false);
    // Segments repaint from state without emitting.
    this.rows.forEach((r) => {
      r.el.querySelectorAll<HTMLButtonElement>('.seg button').forEach((b) => b.classList.toggle('on', b.dataset['v'] === currentValue(r.id, this.state())));
    });
    const vol = this.rows.find((r) => r.id === 'volume');
    if (vol) {
      const v = this.state().volume;
      vol.el.querySelector<HTMLElement>('.bar i')!.style.width = `${Math.round(v * 100)}%`;
      vol.el.querySelector('.val')!.textContent = `${Math.round(v * 100)}%`;
    }
  }

  nav(dx: number, dy: number): void {
    if (dy) this.focusRow(Math.max(0, Math.min(this.rows.length - 1, this.index + dy)), true);
    else if (dx) this.rows[this.index]?.step(dx);
  }
  confirm(): void {
    this.rows[this.index]?.activate();
  }
  back(): void {
    this.sfx.back();
    this.cb.goto('menu');
  }
}

function currentValue(id: SettingId, s: FrontState): string {
  switch (id) {
    case 'quality':
      return s.quality;
    case 'sound':
      return s.sound ? 'on' : 'off';
    case 'ghost':
      return s.ghost ? 'on' : 'off';
    case 'rider':
      return s.rider;
    case 'bike':
      return s.bike;
    case 'telemetry':
      return s.telemetry ? 'on' : 'off';
    default:
      return '';
  }
}

/** One quiet line: every device's bindings. No diagrams, no grid. */
export function controlsLineHtml(): string {
  return [
    '<b>Gas</b> ↑ W · RT · right-most zone',
    '<b>Brake</b> ↓ S · LT · right-inner zone',
    '<b>Lean</b> ← → A D · stick · left half',
    '<b>Restart</b> Enter R · B · top-right (hold 0.6 s: track)',
    '<b>Pause</b> Esc · Start · top-left',
    'No hop button: lean back on the gas, snap forward.',
  ].join('<span class="sep">·</span>');
}

/** Device diagrams: keycaps, pad glyphs, touch zone map. Inline SVG, tokens via currentColor. (Kept for the credits/help route; not on the settings panel.) */
export function controlsReferenceHtml(): string {
  const key = (x: number, y: number, w: number, label: string, hot = false): string =>
    `<g transform="translate(${x} ${y})"><rect width="${w}" height="22" rx="4" fill="${hot ? 'var(--amber)' : 'rgba(255,255,255,.1)'}" stroke="rgba(255,255,255,.25)"/><text x="${w / 2}" y="15" text-anchor="middle" font-size="10" font-weight="700" fill="${hot ? 'var(--amber-ink)' : 'currentColor'}" font-family="inherit">${label}</text></g>`;
  const keyboard = `<svg viewBox="0 0 220 84" aria-hidden="true">
    ${key(4, 4, 24, 'W', true)}${key(4, 30, 24, 'A', true)}${key(30, 30, 24, 'S', true)}${key(56, 30, 24, 'D', true)}
    ${key(150, 4, 24, '↑', true)}${key(124, 30, 24, '←', true)}${key(150, 30, 24, '↓', true)}${key(176, 30, 24, '→', true)}
    ${key(4, 58, 46, 'Enter')}${key(54, 58, 26, 'R')}${key(84, 58, 30, 'Esc')}
  </svg>`;
  const pad = `<svg viewBox="0 0 220 96" aria-hidden="true">
    <path d="M30 30 h160 a26 26 0 0 1 26 26 v10 a20 20 0 0 1 -34 14 l-18 -14 h-108 l-18 14 a20 20 0 0 1 -34 -14 v-10 a26 26 0 0 1 26 -26z" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.25)"/>
    <rect x="26" y="8" width="44" height="14" rx="5" fill="var(--amber)"/><text x="48" y="18.5" text-anchor="middle" font-size="9" font-weight="700" fill="var(--amber-ink)" font-family="inherit">LT</text>
    <rect x="150" y="8" width="44" height="14" rx="5" fill="var(--amber)"/><text x="172" y="18.5" text-anchor="middle" font-size="9" font-weight="700" fill="var(--amber-ink)" font-family="inherit">RT</text>
    <circle cx="62" cy="58" r="14" fill="var(--amber)"/><path d="M50 58 h24 M56 52 l-6 6 6 6 M68 52 l6 6 -6 6" stroke="var(--amber-ink)" stroke-width="2" fill="none"/>
    <circle cx="170" cy="46" r="7" fill="none" stroke="rgba(255,255,255,.35)"/><circle cx="184" cy="58" r="7" fill="var(--red)"/><text x="184" y="61.5" text-anchor="middle" font-size="9" font-weight="700" fill="#fff" font-family="inherit">B</text>
    <circle cx="170" cy="70" r="7" fill="var(--green)"/><text x="170" y="73.5" text-anchor="middle" font-size="9" font-weight="700" fill="#0b0d10" font-family="inherit">A</text><circle cx="156" cy="58" r="7" fill="none" stroke="rgba(255,255,255,.35)"/>
    <rect x="104" y="50" width="12" height="6" rx="2" fill="rgba(255,255,255,.5)"/>
  </svg>`;
  const touch = `<svg viewBox="0 0 220 100" aria-hidden="true">
    <rect x="2" y="2" width="216" height="96" rx="10" fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.25)"/>
    <line x1="56" y1="2" x2="56" y2="98" stroke="rgba(255,255,255,.2)"/><line x1="110" y1="2" x2="110" y2="98" stroke="rgba(255,255,255,.35)"/><line x1="164" y1="2" x2="164" y2="98" stroke="rgba(255,255,255,.2)"/>
    <text x="29" y="60" text-anchor="middle" font-size="9" font-weight="700" fill="currentColor" font-family="inherit">LEAN ◀</text>
    <text x="83" y="60" text-anchor="middle" font-size="9" font-weight="700" fill="currentColor" font-family="inherit">▶ LEAN</text>
    <text x="137" y="60" text-anchor="middle" font-size="9" font-weight="700" fill="var(--red)" font-family="inherit">BRAKE</text>
    <text x="191" y="60" text-anchor="middle" font-size="9" font-weight="700" fill="var(--green)" font-family="inherit">GAS</text>
    <rect x="8" y="8" width="26" height="16" rx="4" fill="rgba(255,255,255,.15)"/><text x="21" y="19" text-anchor="middle" font-size="8" fill="currentColor" font-family="inherit">❚❚</text>
    <rect x="186" y="8" width="26" height="16" rx="4" fill="rgba(255,255,255,.15)"/><text x="199" y="19.5" text-anchor="middle" font-size="9" fill="currentColor" font-family="inherit">↺</text>
  </svg>`;
  return `<h3>Controls</h3><div class="devices">
    <div class="device"><h4>Keyboard</h4>${keyboard}<dl><dt>Gas · Brake</dt><dd>↑ / W · ↓ / S</dd><dt>Lean</dt><dd>← → / A D</dd><dt>Restart</dt><dd>Enter · R (hold: track)</dd><dt>Pause</dt><dd>Esc</dd></dl></div>
    <div class="device"><h4>Gamepad</h4>${pad}<dl><dt>Gas · Brake</dt><dd>RT · LT</dd><dt>Lean</dt><dd>Left stick</dd><dt>Restart</dt><dd>B (hold: track)</dd><dt>Pause</dt><dd>Start</dd></dl></div>
    <div class="device"><h4>Touch</h4>${touch}<dl><dt>Left half</dt><dd>Lean back · forward</dd><dt>Right half</dt><dd>Brake · Gas</dd><dt>Corners</dt><dd>Pause · Restart</dd></dl></div>
  </div>
  <div class="about">There is no hop button: preload by leaning back on the gas, then snap forward. The clock runs through every crash — tap restart for the last checkpoint, <b>hold it 0.6 s</b> to restart the track.</div>`;
}

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

export class CreditsScreen extends Screen {
  constructor(parent: HTMLElement, private readonly sfx: UiSfx, private readonly cb: FrontCallbacks, art: ArtManifest) {
    super(parent, 'credits-screen');
    const plate = h('div', 'plate-bg');
    this.root.appendChild(plate);
    art.whenReady(() => art.applyBackground(plate, art.byId('results-credits') ?? art.plate('results-bg')));
    const wrap = h('div', 'credits-wrap rise');
    wrap.innerHTML = `<h1>Credits</h1>
      <dl>
        <dt>Game</dt><dd><b>${GAME_NAME}</b> — a 2.5D physics trials-bike demo.</dd>
        <dt>Engine</dt><dd>TypeScript · three.js · WebGL2 · Web Audio. 120 Hz fixed-step bike physics; every run replays byte-identical.</dd>
        <dt>Design</dt><dd>Attempts-to-clear and restart latency, measured by a bot and a stranger every round.</dd>
        <dt>Type</dt><dd>Barlow Condensed by Jeremy Tribby (SIL OFL 1.1).</dd>
        <dt>Art</dt><dd>Key art, track cards and medals generated for this build; procedural biomes in-engine.</dd>
        <dt>Hero</dt><dd>Rider and bike authored in Blender by Astra (five outfits, two liveries). Body and skin from <b>MPFB / MakeHuman</b> system assets (CC0) and the Blender Studio human base meshes (CC0); hair from <b>Daniel Bystedt</b>'s Hair Styles demo (CC BY-SA), baked to a curl shell for the game; beard and moustache by <b>grinsegold</b> (MakeHuman bodyparts06, CC-BY); the study head <b>Infinite, 3D Head Scan by Lee Perry-Smith</b> (CC BY 3.0, via three.js); cotton and denim from <b>Poly Haven</b> (CC0). Full provenance and licences ship with the source.</dd>
        <dt>Thanks</dt><dd>Trials Evolution and Trials Rising for the read-outs, the crash stamp and the checkpoint restart.</dd>
      </dl>`;
    this.root.append(h('div', 'grain'), wrap);
    this.addBackButton('Menu');
    this.root.addEventListener('click', () => this.back());
  }
  nav(): void {}
  confirm(): void {
    this.back();
  }
  back(): void {
    this.sfx.back();
    this.cb.goto('menu');
  }
}
