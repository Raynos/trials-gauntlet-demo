/**
 * Front end (docs/design/game.md §10): main menu ("Broadcast", boot lands on
 * it — there is no title step) → the world map (src/ui/worldMapScreen.ts, the level select) / garage / settings / credits.
 * Plain DOM over the live 3D canvas; every screen drives
 * focus itself (keyboard arrows, d-pad/stick edges, pointer hover, tap) and
 * exposes `nav / confirm / back` for the app shell. Targets ≥ 44 px, safe-area
 * aware, tokens from styles.ts only.
 */
import type { BikeClass, RiderOutfit } from '../core/types';
import { DEV_SURFACES } from '../core/release';
import { offlineHeld, offlineLine } from './offlineStatus';
import type { ArtEntry, ArtManifest } from './art';
import type { FpsChoice, ModelChoice } from './best';
import type { QualityChoice } from './menu';
import type { UiSfx } from './sfx';
import { conceal, reveal, isLiveTarget } from './live';
import { artTier } from '../boot/tier';

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
 * biome, until Nalati is built), at the device's tier (`artTier()`, the one the offline pack fetched); null
 * (the tint stays) when the pack lacks it.
 */
export function menuPlate(art: ArtManifest): ArtEntry | null {
  const list = art.all().filter((e) => e.kind === 'keyart' && (e.biome as string) === 'nalati');
  if (list.length === 0) return null;
  return list.find((e) => e.variant === artTier()) ?? list[0]!;
}

/**
 * Main menu, round 3 B2 "Strip" (assets/design/menu/round3/SPEC.md § B2, ask #42): the boot screen — there is
 * no title step. The Lobby split turned sideways: a wide cinematic strip of the Nalati jump across the top
 * (the `keyart-nalati` plate, cropped by the band, a grassland tint until it decodes) with the wordmark large
 * in two lines over the sky at the left and the build stamp on a small amber-edged plate under it; a charcoal band with the
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
    // The big title (near-white display face over the sky), then the build stamp alone on the slanted amber-edged plate
    // (ask 45: the plate no longer repeats the name under the title).
    const head = h('div', 'menu-head');
    const title = h('div', 'menu-title', `<span>Trials</span><span>Gauntlet</span>`);
    const plate = h('div', 'menu-plate');
    plate.appendChild(h('div', 'menu-build', escapeHtml(BUILD_STAMP_SHORT)));
    head.append(title, plate);
    const band = h('div', 'menu-band');
    this.list = new FocusList(band, sfx, 'menu-list tiles', 'x');
    this.root.append(this.keyart, h('div', 'grain'), head, band);
    this.list.setItems([
      { id: 'play', label: 'Play' },
      { id: 'garage', label: 'Garage', icon: MENU_ICON.garage },
      // The level reviewer (docs/design/game.md §21) is a dev tool: a store build has no REVIEW tile.
      ...(DEV_SURFACES ? [{ id: 'review', label: 'Review', icon: MENU_ICON.review }] : []),
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
    foot.innerHTML = `<div class="controls-line">${controlsLineHtml()}</div><div class="build">${escapeHtml(GAME_NAME)} · ${escapeHtml(BUILD_STAMP)}</div><div class="build offline-line"></div>`;
    // What the worker actually holds, and the one thing we cannot engineer around: Safari clears an
    // origin's storage after 7 days without a visit (ask 58 — the user accepted it; hiding it would not).
    void offlineHeld().then((held) => {
      const line = offlineLine(held);
      if (line) (foot.querySelector('.offline-line') as HTMLElement).textContent = line;
    });
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
    if (DEV_SURFACES && s().models) {
      seg('bike', 'Bike model', 'Applies on the next track load', [{ v: 'proc', l: 'Procedural' }, { v: 'gltf', l: 'Modelled' }], () => s().bike, (v) => this.cb.setModel('bike', v as ModelChoice));
    }

    // The run log (telemetry) and its export are dev surfaces: a store build collects nothing (STORE_RELEASE.md P0.3).
    if (DEV_SURFACES) seg('telemetry', 'Run log', 'Keeps attempts, faults and crash spots on this device only', [{ v: 'on', l: 'On' }, { v: 'off', l: 'Off' }], () => (s().telemetry ? 'on' : 'off'), (v) => this.cb.setTelemetry(v === 'on'));
    const phys = s().physics;
    if (DEV_SURFACES && s().dev && phys && phys.available.length > 0 && this.cb.setPhysics) {
      // Hidden dev row (physics v2 A/B, docs/plans/physics-v2.md §16.2): reloads the page with `?physics=`.
      const opts = [{ v: 'default', l: phys.current === 'default' && phys.live ? `Default (${phys.live.toUpperCase()})` : 'Default' }, ...phys.available.map((v) => ({ v, l: v.toUpperCase() }))];
      const live = phys.live ? `Live solver: ${phys.live.toUpperCase()}` : 'Live solver: mock';
      seg('physics', 'Physics', `${live} · dev A/B — reloads the page`, opts, () => phys.current, (v) => this.cb.setPhysics?.(v as 'default' | 'v1' | 'v2'));
    }

    // Run log export: Copy (clipboard JSON) · Share (Web Share API, text) — never leaves the device otherwise.
    if (DEV_SURFACES) {
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

    // Reload game: the only way to pick up a new build from a home-screen install (no browser chrome). A store
    // build is bundled whole in the app and updates through the store: no row.
    if (DEV_SURFACES) {
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
