/**
 * Front end (docs/design/game.md §10): main menu ("Broadcast", boot lands on
 * it — there is no title step) → track select / garage / settings / credits.
 * Plain DOM over the live 3D canvas; every screen drives
 * focus itself (keyboard arrows, d-pad/stick edges, pointer hover, tap) and
 * exposes `nav / confirm / back` for the app shell. Targets ≥ 44 px, safe-area
 * aware, tokens from styles.ts only.
 */
import type { BikeClass, BiomeId, Medal, TrackDef, TrackTier } from '../core/types';
import { BIOME_TINT, type ArtManifest } from './art';
import type { BestEntry, BoardEntry, FpsChoice, ModelChoice } from './best';
import { formatTime } from './format';
import type { QualityChoice } from './menu';
import { labTracks, medalTotals, nextTrack, shipTracks, TIER_BLURB, TIER_LABEL, TIER_ORDER, tierUnlocked, tracksInTier, type MedalOf } from './progress';
import type { UiSfx } from './sfx';
import { conceal, reveal } from './live';

export type FrontScreen = 'menu' | 'garage' | 'tracks' | 'settings' | 'credits';

export interface FrontCallbacks {
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
abstract class Screen {
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
      const b = h('button', it.minor ? 'menu-item minor' : 'menu-item', `${escapeHtml(it.label)}${it.note ? `<small>${escapeHtml(it.note)}</small>` : ''}`);
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

/**
 * Main menu, direction B "Broadcast" (assets/design/menu/SPEC.md §B): the boot screen — there is no
 * title step. Full-bleed key art (the industrial plate, mirrored so the rider lands right of the badge,
 * hot-swapped in over the live scene by the art library), a lower-third slab with PLAY · GARAGE ·
 * SETTINGS as horizontal tabs (CREDITS small at the band's far end), a best-times ticker along the
 * bottom edge, the wordmark on an angled badge plate top-left with the build stamp under it, and a
 * bike-class chip top-right. Every control lives in the band: the thumb arc from either corner.
 */
export class MainMenuScreen extends Screen {
  private readonly list: FocusList;
  private readonly keyart: HTMLDivElement;
  private readonly ticker: HTMLDivElement;
  private readonly tickerTrack: HTMLDivElement;
  private readonly chip: HTMLDivElement;
  private tracks: TrackDef[] = [];
  /** One copy of the ticker row; layout() doubles it only while it scrolls. */
  private tickerHtml = '';

  constructor(
    parent: HTMLElement,
    sfx: UiSfx,
    art: ArtManifest,
    private readonly cb: FrontCallbacks,
    private readonly bestOf: (id: string) => BestEntry | null,
    private readonly state: () => FrontState,
  ) {
    super(parent, 'menu-screen');
    this.keyart = h('div', 'menu-keyart');
    this.keyart.style.backgroundImage = BIOME_TINT.industrial; // never the shorthand: it would reset background-size
    // The wordmark's gradient is its own background (clip: text), so the slanted plate is a wrapper around it.
    const badge = h('div', 'menu-badge');
    const plate = h('div', 'menu-plate');
    plate.appendChild(h('div', 'wordmark', GAME_NAME));
    badge.append(plate, h('div', 'menu-build', escapeHtml(BUILD_STAMP_SHORT)));
    this.chip = h('div', 'menu-chip');
    const band = h('div', 'menu-band');
    this.list = new FocusList(band, sfx, 'menu-list tabs', 'x');
    this.ticker = h('div', 'menu-ticker');
    this.tickerTrack = h('div', 'menu-ticker-track');
    this.ticker.appendChild(this.tickerTrack);
    this.root.append(this.keyart, h('div', 'grain'), badge, this.chip, band, this.ticker);
    this.list.setItems([
      { id: 'play', label: 'Play' },
      { id: 'garage', label: 'Garage' },
      { id: 'settings', label: 'Settings' },
      { id: 'credits', label: 'Credits', minor: true },
    ]);
    this.list.onPick = (id) => {
      if (id === 'play') this.cb.goto('tracks');
      else if (id === 'garage') this.cb.goto('garage');
      else if (id === 'settings') this.cb.goto('settings');
      else if (id === 'credits') this.cb.goto('credits');
    };
    art.whenReady(() => art.applyBackground(this.keyart, art.keyart('industrial')));
    window.addEventListener('resize', () => {
      if (this.visible) this.layout();
    });
  }

  setTracks(tracks: TrackDef[]): void {
    this.tracks = tracks;
  }

  /** Bike class in effect (the Garage changed it, or a tier default applied): the top-right chip follows. */
  setBike(bike: BikeClass): void {
    this.chip.innerHTML = `<i></i>${escapeHtml(BIKE_NAME[bike])} bike`;
  }

  override show(): void {
    super.show();
    const s = this.state();
    this.setBike(s.bikeClass);
    // Ticker: the shipped tracks in tier order, each with its best time or a dash; never a control.
    const cells = shipTracks(this.tracks).map((t) => {
      const b = this.bestOf(t.id);
      return `<span>${escapeHtml(t.name)} <b>${b ? formatTime(b.time) : '--:--'}</b></span>`;
    });
    this.tickerHtml = `<span class="head">Best times</span>${cells.join('')}`;
    this.tickerTrack.innerHTML = this.tickerHtml;
    this.list.focusId('play');
    requestAnimationFrame(() => this.layout());
  }

  /** Re-measure: the underline under the focused tab, and whether the ticker is wider than the screen (only then does it scroll). */
  private layout(): void {
    this.list.render(false);
    this.ticker.classList.remove('scroll');
    this.tickerTrack.style.removeProperty('--ticker-s');
    this.tickerTrack.innerHTML = this.tickerHtml; // measure one copy (a resize would otherwise re-measure a doubled row and double it again)
    const over = this.tickerTrack.scrollWidth - this.ticker.clientWidth;
    if (over > 4) {
      // Two copies of the row and a translate by half: a seamless loop at ~60 px/s.
      const w = this.tickerTrack.scrollWidth;
      this.tickerTrack.innerHTML = this.tickerHtml + this.tickerHtml;
      this.tickerTrack.style.setProperty('--ticker-s', `${Math.max(12, Math.round(w / 60))}s`);
      this.ticker.classList.add('scroll');
    }
  }

  nav(dx: number, dy: number): void {
    // Tabs run left → right; up/down walk them too so a d-pad in either habit works.
    this.list.move(dx || dy);
  }
  confirm(): void {
    this.list.pick();
  }
  /** Boot screen: Esc / B has nowhere further back to go. */
  back(): void {}
}

// ---------------------------------------------------------------------------
// Track select
// ---------------------------------------------------------------------------

interface CardRef {
  el: HTMLButtonElement;
  track: TrackDef;
  locked: boolean;
}

export class TrackSelectScreen extends Screen {
  private readonly tiers: HTMLDivElement;
  private readonly totalsEl: HTMLDivElement;
  private rows: { tier: TrackTier; el: HTMLDivElement; cards: CardRef[]; locked: boolean }[] = [];
  private row = 0;
  private col: number[] = [];
  private launching = false;

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
    const head = h('div', 'tracks-head');
    head.innerHTML = `<h1>Select track</h1>`;
    this.totalsEl = h('div', 'tracks-totals');
    head.appendChild(this.totalsEl);
    this.tiers = h('div', 'tiers');
    this.legend = h('div', 'legend', LEGEND_KB);
    this.root.append(h('div', 'grain'), head, this.tiers, this.legend);
    this.addBackButton('Menu');
    this.tiers.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.card');
      if (b) this.focusCard(Number(b.dataset['r']), Number(b.dataset['c']), true);
    });
    this.tiers.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.card');
      if (!b) return;
      this.focusCard(Number(b.dataset['r']), Number(b.dataset['c']), false);
      if ((e.target as HTMLElement).closest('.watch')) this.alt(); // "Watch PB" tag: the replay viewer, not a launch
      else this.confirm();
    });
  }

  build(tracks: TrackDef[]): void {
    const s = this.state();
    const medalOf: MedalOf = (t) => this.bestOf(t)?.medal ?? null;
    const ship = shipTracks(tracks, s.dev);
    this.tiers.innerHTML = '';
    this.rows = [];
    // Lab (MEGA_PLAN P0 §3): the physics test levels, first (the user's proving ground), always open, outside medals and progression.
    const lab = labTracks(tracks);
    if (lab.length > 0) {
      const rowEl = h('div', 'tier-row lab-row');
      rowEl.innerHTML = `<div class="tier-head"><b>Lab</b><span>Physics proving ground · live physics HUD · no medals</span></div>`;
      const car = h('div', 'carousel');
      const cards: CardRef[] = [];
      const r = this.rows.length;
      lab.forEach((t, c) => {
        const el = this.card(t, false, r, c, true);
        car.appendChild(el);
        cards.push({ el, track: t, locked: false });
      });
      rowEl.appendChild(car);
      this.tiers.appendChild(rowEl);
      this.rows.push({ tier: lab[0]!.tier, el: rowEl, cards, locked: false });
    }
    for (const tier of TIER_ORDER) {
      const list = tracksInTier(ship, tier);
      if (list.length === 0) continue;
      const locked = !tierUnlocked(ship, tier, medalOf, s.dev);
      const rowEl = h('div', `tier-row${locked ? ' locked' : ''}`);
      const done = list.filter((t) => medalOf(t.id)).length;
      const prev = TIER_ORDER[TIER_ORDER.indexOf(tier) - 1];
      rowEl.innerHTML = `<div class="tier-head"><b>${TIER_LABEL[tier]}</b><span>${escapeHtml(TIER_BLURB[tier])} · ${done}/${list.length}</span>${locked && prev ? `<span class="lock">Medal every ${TIER_LABEL[prev]} track</span>` : ''}</div>`;
      const car = h('div', 'carousel');
      const cards: CardRef[] = [];
      const r = this.rows.length;
      list.forEach((t, c) => {
        const el = this.card(t, locked, r, c);
        car.appendChild(el);
        cards.push({ el, track: t, locked });
      });
      rowEl.appendChild(car);
      this.tiers.appendChild(rowEl);
      this.rows.push({ tier, el: rowEl, cards, locked });
    }
    this.col = this.rows.map(() => 0);
    const totals = medalTotals(ship, medalOf);
    const dot = (m: Medal, n: number): string => `<span style="color:var(--${m === 'platinum' ? 'plat' : m})"><i></i>${n}</span>`;
    this.totalsEl.innerHTML = `<span>${totals.cleared}/${totals.total} cleared</span>${dot('platinum', totals.platinum)}${dot('gold', totals.gold)}${dot('silver', totals.silver)}${dot('bronze', totals.bronze)}`;
    // Initial focus: last played, else the next unfinished track.
    const target = nextTrack(ship, medalOf, s.dev, s.lastPlayed);
    for (let r = 0; r < this.rows.length; r++) {
      const c = this.rows[r]!.cards.findIndex((x) => x.track.id === target?.id);
      if (c >= 0) {
        this.row = r;
        this.col[r] = c;
      }
    }
    this.applyFocus(false);
  }

  private card(t: TrackDef, locked: boolean, r: number, c: number, lab = false): HTMLButtonElement {
    const best = this.bestOf(t.id);
    const target = t.meta?.targetTimeS;
    const biome: BiomeId = t.meta?.biome ?? 'industrial';
    const el = h('button', `card${locked ? ' locked' : ''}`);
    el.type = 'button';
    el.dataset['r'] = String(r);
    el.dataset['c'] = String(c);
    el.dataset['track'] = t.id;
    el.style.setProperty('--tint', BIOME_TINT[biome]);
    const medal = best?.medal;
    const ahead = best && target ? best.time <= target : false;
    // A stored PB recording: the ghost tag doubles as the "Watch PB" control (click / V / pad Y opens the replay viewer).
    const ghost = best?.recording ? `<em class="ghost watch" title="Watch the personal best">▶ ${this.state().ghost ? 'Ghost' : 'PB'}</em>` : '';
    const prev = TIER_ORDER[TIER_ORDER.indexOf(t.tier) - 1];
    const bikeTag = best?.bike === 'pro' ? '<em class="bike">Pro</em>' : '';
    // Locked: the card itself states the unlock rule (the row head says it too, but a thumb lands on the card).
    const lockLine = locked && prev ? `<div class="lockline">Locked · medal every ${TIER_LABEL[prev]} track</div>` : '';
    if (lab) el.classList.add('lab-card');
    el.innerHTML = `<div class="tint" data-badge="${lab ? 'Physics test' : TIER_LABEL[t.tier]}"></div><div class="art"></div><div class="veil"></div>
      <div class="top"><span>${lab ? 'LAB' : escapeHtml(t.id.split('-')[0]!.toUpperCase())}</span>${ghost}${bikeTag}</div>
      ${lab ? '' : `<div class="medal ${medal ?? 'none'}${medal ? ' plain' : ''}" title="${medal ?? 'no medal'}"></div>`}${lockLine}
      <div class="body"><div class="name">${escapeHtml(t.name)}</div><div class="tech">${escapeHtml(t.meta?.technique ?? '')}</div>
      <div class="times"><span>Best <b class="${ahead ? 'ahead' : ''}">${best ? formatTime(best.time) : '—'}</b></span><span>Target <b>${target ? formatTime(target) : '—'}</b></span></div>${lab ? '' : this.boardHtml(t.id)}</div>`;
    const artEl = el.querySelector<HTMLDivElement>('.art')!;
    const medalEl = el.querySelector<HTMLDivElement>('.medal')!;
    this.art.whenReady(() => {
      this.art.applyBackground(artEl, this.art.trackThumb(t.id) ?? this.art.trackCard(t.id) ?? this.art.tierCard(t.tier));
      if (medal) {
        const m = this.art.medal(medal);
        if (m)
          void this.art.probe(m.src).then((ok) => {
            if (!ok) return;
            medalEl.classList.remove('plain');
            medalEl.style.backgroundImage = `url("${m.src}")`;
          });
      }
    });
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

  private focusCard(r: number, c: number, tick: boolean): void {
    if (this.launching) return;
    if (!this.rows[r] || !this.rows[r]!.cards[c]) return;
    if (r === this.row && c === this.col[r]) return;
    this.row = r;
    this.col[r] = c;
    if (tick) this.sfx.tick();
    this.applyFocus(true);
  }

  private applyFocus(scroll: boolean): void {
    for (const row of this.rows) for (const card of row.cards) card.el.classList.remove('on');
    const cur = this.rows[this.row]?.cards[this.col[this.row] ?? 0];
    if (!cur) return;
    cur.el.classList.add('on');
    if (scroll) {
      cur.el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  }

  current(): CardRef | null {
    return this.rows[this.row]?.cards[this.col[this.row] ?? 0] ?? null;
  }

  override show(): void {
    this.launching = false;
    super.show();
    requestAnimationFrame(() => this.current()?.el.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  }

  nav(dx: number, dy: number): void {
    if (this.launching) return;
    if (dy) {
      const r = Math.max(0, Math.min(this.rows.length - 1, this.row + dy));
      this.focusCard(r, Math.min(this.col[r] ?? 0, this.rows[r]!.cards.length - 1), true);
    } else if (dx) {
      const row = this.rows[this.row];
      if (!row) return;
      const c = Math.max(0, Math.min(row.cards.length - 1, (this.col[this.row] ?? 0) + dx));
      this.focusCard(this.row, c, true);
    }
  }

  confirm(): void {
    const cur = this.current();
    if (!cur || this.launching) return;
    if (cur.locked) {
      this.sfx.back();
      cur.el.animate([{ transform: 'scale(1.06) translateX(0)' }, { transform: 'scale(1.06) translateX(-6px)' }, { transform: 'scale(1.06) translateX(6px)' }, { transform: 'scale(1.06) translateX(0)' }], { duration: 240, easing: 'ease-out' });
      return;
    }
    this.launching = true;
    this.sfx.launch();
    cur.el.classList.add('go');
    setTimeout(() => this.cb.play(cur.track.id), 180);
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

  /** `V` / pad Y / the card's watch tag: replay viewer on the focused card's PB (no-op without a recording). */
  override alt(): void {
    const cur = this.current();
    if (!cur || this.launching || cur.locked) return;
    if (!this.bestOf(cur.track.id)?.recording) return;
    this.sfx.confirm();
    this.cb.watchPb(cur.track.id);
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
    if (s().models) {
      seg('rider', 'Rider', 'Applies on the next track load', [{ v: 'proc', l: 'Procedural' }, { v: 'gltf', l: 'Modelled' }], () => s().rider, (v) => this.cb.setModel('rider', v as ModelChoice));
      seg('bike', 'Bike', 'Applies on the next track load', [{ v: 'proc', l: 'Procedural' }, { v: 'gltf', l: 'Modelled' }], () => s().bike, (v) => this.cb.setModel('bike', v as ModelChoice));
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
