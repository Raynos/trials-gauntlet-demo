/**
 * Touch → InputFrame (CONTRACT §2.8). Full-screen pointer-event layer under
 * the HUD (menus/results sit above it and take their own taps). Left half =
 * two lean zones (back | forward), right half = brake | throttle. Restart
 * button top-right, pause top-left, both ≥ 44 pt.
 *
 * Robustness (iOS Safari, the P0): the frame is *recomputed every read()*
 * from a Map of active pointers, with one unread completed restart tap retained
 * when its entire press falls between reads. A pointer is
 * dropped on ANY of: pointerup, pointercancel, lostpointercapture, pointerleave
 * with no buttons, raw touchend/touchcancel reporting zero fingers, blur,
 * pagehide, visibilitychange→hidden, and a 400 ms watchdog that fires when a
 * touch pointer is still "held" although the last raw touch event said no
 * fingers are down. touchstart/touchmove are non-passive and preventDefault'd
 * on the layer so Safari never claims the gesture for selection, callout,
 * magnifier or rubber-band scroll in the first place.
 *
 * Multi-touch (the second P0): Safari fires its proprietary `gesturestart` /
 * `gesturechange` the moment a SECOND finger lands, whatever `touch-action`
 * and the touch handlers did — it is a notification, not a claim. Those
 * events are preventDefault'd and otherwise ignored; they must never release
 * anything (the old code did, which dropped GAS the instant LEAN was pressed).
 * A pointer only ever leaves the Map through its own end event, the raw
 * stream saying zero fingers, focus loss, or the watchdog.
 *
 * Coordinates: every hit-test goes through `toLogical` (src/ui/orientation.ts),
 * an identity today (rotate-to-play; forced landscape was abandoned, game.md §11).
 *
 * The pause / restart buttons obey the touch-navigation invariant (src/ui/live.ts): their rects
 * are hit-tested only while the layer is `.live` (enabled, on the touch device, no overlay up,
 * and the buttons observed drawn for 150 ms) AND the button is drawn at >= .5 opacity right now.
 * Otherwise a corner tap is just the zone under it. Pause fires on pointerUP inside the rect (a
 * tap, not a touch-down). Restart stays held for long-press behavior, while a completed tap that
 * no read observed is delivered once. A finger that leaves a button's rect is dead until it lifts
 * — it never becomes gas.
 */
import type { InputFrame } from '../../core/types';
import { LIVE_OPACITY, conceal, effectiveOpacity, isLive, reveal } from '../../ui/live';
import { isForcedLandscape, logicalRect, toLogical, type Point } from '../../ui/orientation';
import { clearMeta, type InputSource, type MetaButtons } from './types';

type Zone = 'back' | 'fwd' | 'brake' | 'throttle' | 'restart' | 'pause' | 'none';

interface ActivePointer {
  zone: Zone;
  type: string;
  /** A held restart already reached read(); its release must not queue another. */
  restartRead: boolean;
  /** performance.now() at pointerdown (watchdog / debug). */
  since: number;
}

const WATCHDOG_MS = 400;

/** Inline strip-key glyphs (22 px, stroke = currentColor); the two bike silhouettes are one drawing mirrored. */
const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const GLYPH = {
  chevL: svg('<path d="M14.5 5.5 8 12l6.5 6.5"/>'),
  chevR: svg('<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>'),
  /** Rear wheel down, front wheel lifted: the bike on its back wheel. */
  bikeBack: svg('<circle cx="6.5" cy="16.5" r="3.6"/><circle cx="18" cy="9.5" r="3.6"/><path d="M6.5 16.5 11 9h4.5M11 9l7 .5M9.5 9h-2"/>'),
  /** Front wheel down, rear lifted: nose down. */
  bikeFwd: svg('<circle cx="17.5" cy="16.5" r="3.6"/><circle cx="6" cy="9.5" r="3.6"/><path d="M17.5 16.5 13 9H8.5M13 9l-7 .5M14.5 9h2"/>'),
  /** Brake disc. */
  disc: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.6"/><path d="M12 4.5V7M12 17v2.5M4.5 12H7M17 12h2.5"/>'),
  /** Throttle grip with its bar end. */
  grip: svg('<rect x="3" y="8.5" width="13" height="7" rx="3.5"/><path d="M16 12h5M7 8.5v7M10 8.5v7M13 8.5v7"/>'),
};

/** One key cap: `<b>` = leading glyphs, `<span>` = the label, `<i>` = trailing glyphs (empty parts are omitted). */
function key(id: string, lead: string, label: string, trail: string): string {
  return `<div class="tz-key tz-key-${id}">${lead ? `<b>${lead}</b>` : ''}<span>${label}</span>${trail ? `<i>${trail}</i>` : ''}</div>`;
}

export interface TouchInputOptions {
  /** Draw pointer ids + the live frame (URL `?touchdebug=1`). */
  debug?: boolean;
  /** Clock for the watchdog; injectable for tests. */
  now?: () => number;
}

export class TouchInput implements InputSource {
  readonly device = 'touch' as const;
  readonly root: HTMLDivElement;
  private readonly pointers = new Map<number, ActivePointer>();
  /** A complete restart tap between reads, consumed by exactly one read. */
  private restartTap = false;
  private readonly meta: MetaButtons = { pause: false, confirm: false, back: false, navX: 0, navY: 0, active: false };
  private enabled = false;
  private visible = false;
  private underOverlay = false;
  private readonly els: Record<Exclude<Zone, 'none'>, HTMLDivElement>;
  private readonly debugEl: HTMLPreElement | null;
  private readonly now: () => number;
  /** Bookkeeping from the raw touch events: fingers down per the last event, and when. */
  private rawTouches = 0;
  private rawTouchAt = 0;
  private lastFrame: InputFrame = { throttle: 0, brake: 0, lean: 0, hop: false, restart: false };
  private releases = 0;
  private lastRelease = '';
  /** Safari gesture events seen (debug): they are swallowed, never a release. */
  private gestures = 0;
  /** Last navigation lines (the app's NavLog) for the debug overlay. */
  private readonly notes: string[] = [];
  private readonly pt: Point = { x: 0, y: 0 };

  constructor(parent: HTMLElement, options: TouchInputOptions = {}) {
    this.now = options.now ?? (() => performance.now());
    this.root = document.createElement('div');
    this.root.className = 'touch-layer';
    this.root.setAttribute('aria-hidden', 'true');
    const mk = (cls: string, html: string): HTMLDivElement => {
      const d = document.createElement('div');
      d.className = `tz ${cls}`;
      d.innerHTML = html;
      this.root.appendChild(d);
      return d;
    };
    // The four quarter columns each hold one key cap of the bottom strip (design/controls G, game.md §3): the column is
    // the hit area and the held column wash; the key is the visible affordance. Chevrons sit on the OUTSIDE of the lean pair.
    this.els = {
      back: mk('tz-zone tz-back', key('back', `${GLYPH.chevL}${GLYPH.bikeBack}`, 'Lean back', '')),
      fwd: mk('tz-zone tz-fwd', key('fwd', '', 'Lean fwd', `${GLYPH.bikeFwd}${GLYPH.chevR}`)),
      brake: mk('tz-zone tz-brake', key('brake', GLYPH.disc, 'Brake', '')),
      throttle: mk('tz-zone tz-throttle', key('throttle', GLYPH.grip, 'Gas', '')),
      pause: mk('tz-pause tz-btn', '<span>❚❚</span>'),
      restart: mk('tz-restart tz-btn', '<span>↻<small>Restart</small></span>'),
    };
    this.debugEl = options.debug ? document.createElement('pre') : null;
    if (this.debugEl) {
      this.debugEl.className = 'touch-debug';
      this.root.appendChild(this.debugEl);
    }
    // Under the HUD: menus / results (pointer-events: auto) take their own taps.
    parent.prepend(this.root);

    const r = this.root;
    r.addEventListener('pointerdown', this.onDown);
    r.addEventListener('pointermove', this.onMove);
    r.addEventListener('pointerup', this.onUp);
    r.addEventListener('pointercancel', this.onUp);
    r.addEventListener('lostpointercapture', this.onUp);
    r.addEventListener('pointerleave', this.onLeave);
    r.addEventListener('pointerout', this.onLeave);
    // Raw touch path: belt and braces for the pointer path, and the only way to stop
    // Safari's native gestures (selection, callout, magnifier, rubber-band).
    r.addEventListener('touchstart', this.onTouch, { passive: false });
    r.addEventListener('touchmove', this.onTouch, { passive: false });
    r.addEventListener('touchend', this.onTouch, { passive: false });
    r.addEventListener('touchcancel', this.onTouch, { passive: false });
    r.addEventListener('contextmenu', prevent);
    r.addEventListener('selectstart', prevent);
    r.addEventListener('dragstart', prevent);
    document.addEventListener('gesturestart', this.onGesture as EventListener, { passive: false });
    document.addEventListener('gesturechange', this.onGesture as EventListener, { passive: false });
    window.addEventListener('blur', this.onLostFocus);
    window.addEventListener('pagehide', this.onLostFocus);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Only intercept pointers while a run is on screen (menus need their own clicks). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.root.classList.toggle('on', on);
    if (!on) this.releaseAll('disabled');
    this.armButtons();
  }

  /** An overlay (pause / results) is up: zones and buttons neither draw nor take pointers, and any held finger is released. */
  setOverlay(on: boolean): void {
    this.underOverlay = on;
    this.root.classList.toggle('under-overlay', on);
    if (on) this.releaseAll('overlay');
    this.armButtons();
  }

  /** 3 s into a run the zone outlines/labels drop to ~30 % so play is not under a diagram. */
  setSettled(on: boolean): void {
    this.root.classList.toggle('settled', on);
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.root.classList.toggle('visible', on);
    if (!on) this.releaseAll('hidden-controls');
    this.armButtons();
  }

  /** The buttons' reveal watch: `.live` on the layer once ❚❚ has been drawn for the invariant's delay; dropped the instant they stop being drawn. */
  private armButtons(): void {
    if (this.enabled && this.visible && !this.underOverlay) {
      if (!isLive(this.root)) reveal(this.root, { surface: this.els.pause });
    } else conceal(this.root);
  }

  /** A button takes this point only while the layer is live and the button is drawn (>= .5 opacity) right now. */
  private buttonAt(el: HTMLDivElement, x: number, y: number): boolean {
    return isLive(this.root) && inside(el, x, y) && effectiveOpacity(el) >= LIVE_OPACITY;
  }

  /** Debug overlay line (the app's navigation instrument): last six kept. */
  note(line: string): void {
    if (!this.debugEl) return;
    this.notes.push(line);
    if (this.notes.length > 6) this.notes.shift();
    this.paintDebug();
  }

  /** Active pointer count (tests / debug). */
  get activePointers(): number {
    return this.pointers.size;
  }

  /** How many times everything was force-released and why (debug overlay). */
  get releaseLog(): { count: number; last: string } {
    return { count: this.releases, last: this.lastRelease };
  }

  // -- hit testing ------------------------------------------------------------

  /** `px, py` = event `clientX/Y` (physical frame); zones are laid out in the logical frame. */
  private zoneAt(px: number, py: number, current: Zone | undefined): Zone {
    const { x, y } = toLogical(px, py, this.pt);
    const w = this.root.clientWidth || (isForcedLandscape() ? window.innerHeight : window.innerWidth);
    const h = this.root.clientHeight || (isForcedLandscape() ? window.innerWidth : window.innerHeight);
    if (current === undefined) {
      if (this.buttonAt(this.els.restart, x, y)) return 'restart';
      if (this.buttonAt(this.els.pause, x, y)) return 'pause';
    } else if (current === 'restart' || current === 'pause') {
      // A button holds the pointer only while it stays on the button; sliding off cancels the press for good (never into gas).
      return inside(this.els[current], x, y) ? current : 'none';
    } else if (current === 'none') {
      return 'none';
    }
    if (y < 0 || y > h || x < 0 || x > w) return 'none';
    const fx = x / w;
    // A finger stays in its half and may slide between that half's two zones.
    if (current === 'back' || current === 'fwd') return fx < 0.25 ? 'back' : 'fwd';
    if (current === 'brake' || current === 'throttle') return fx < 0.75 ? 'brake' : 'throttle';
    if (fx < 0.25) return 'back';
    if (fx < 0.5) return 'fwd';
    if (fx < 0.75) return 'brake';
    return 'throttle';
  }

  // -- pointer path -----------------------------------------------------------

  private readonly onDown = (e: PointerEvent): void => {
    if (!this.enabled || this.underOverlay) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      /* Safari may reject capture for an already-ended pointer */
    }
    const zone = this.zoneAt(e.clientX, e.clientY, undefined);
    this.pointers.set(e.pointerId, { zone, type: e.pointerType, since: this.now(), restartRead: false });
    this.meta.active = true;
    this.paint();
  };

  private readonly onMove = (e: PointerEvent): void => {
    const cur = this.pointers.get(e.pointerId);
    if (cur === undefined) return;
    e.preventDefault();
    // A mouse whose button was released outside the window never sends pointerup.
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      this.release(e.pointerId, 'move-no-buttons');
      return;
    }
    const zone = this.zoneAt(e.clientX, e.clientY, cur.zone);
    if (zone !== cur.zone) {
      cur.zone = zone;
      this.paint();
    }
  };

  private readonly onUp = (e: PointerEvent): void => {
    // Pause is a TAP: it fires on the up of a pointer that went down on ❚❚ and is still on it (a cancel or a slide-off is nothing).
    if (e.type === 'pointerup' && this.pointers.get(e.pointerId)?.zone === 'pause') this.meta.pause = true;
    const pointer = this.pointers.get(e.pointerId);
    if (e.type === 'pointerup' && pointer?.zone === 'restart' && !pointer.restartRead) {
      const { x, y } = toLogical(e.clientX, e.clientY, this.pt);
      if (this.buttonAt(this.els.restart, x, y)) this.restartTap = true;
    }
    this.release(e.pointerId, e.type);
  };

  private readonly onLeave = (e: PointerEvent): void => {
    // Captured pointers stay; an uncaptured one leaving with nothing pressed is gone.
    if (e.buttons === 0 && this.pointers.has(e.pointerId) && !this.hasCapture(e.pointerId)) this.release(e.pointerId, e.type);
  };

  private hasCapture(id: number): boolean {
    try {
      return this.root.hasPointerCapture(id);
    } catch {
      return false;
    }
  }

  // -- raw touch path -----------------------------------------------------------

  private readonly onTouch = (e: TouchEvent): void => {
    if (this.enabled) e.preventDefault(); // stops selection / callout / magnifier / scroll
    this.rawTouches = e.touches.length;
    this.rawTouchAt = this.now();
    if ((e.type === 'touchend' || e.type === 'touchcancel') && e.touches.length === 0) {
      // No fingers on the glass: nothing can be held, whatever the pointer stream said. Should this end arrive
      // before the pointerup (belt and braces), a finger still on ❚❚ is a completed tap.
      if (e.type === 'touchend' && this.has('pause')) this.meta.pause = true;
      // Safari may report raw touchend before pointerup. Preserve a completed tap
      // across either ordering, but never turn cancellation into a restart.
      const restartTap = e.type === 'touchend' && (this.restartTap || [...this.pointers.values()].some(p => p.zone === 'restart' && !p.restartRead));
      this.releaseAll(e.type);
      this.restartTap = restartTap;
    }
  };

  /**
   * Safari's gesturestart/gesturechange fire for ANY second finger (GAS + LEAN),
   * not only for a pinch it has claimed; preventDefault keeps the page from
   * zooming and nothing is released — the pointers that make up the "gesture"
   * are our zones.
   */
  private readonly onGesture = (e: Event): void => {
    if (this.enabled) e.preventDefault();
    this.gestures++;
  };

  private readonly onLostFocus = (e: Event): void => this.releaseAll(e.type);

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.releaseAll('hidden');
  };

  // -- release ------------------------------------------------------------------

  private release(id: number, why: string): void {
    if (!this.pointers.delete(id)) return;
    this.lastRelease = `${why}#${id}`;
    this.paint();
  }

  private releaseAll(why: string): void {
    this.restartTap = false;
    if (this.pointers.size === 0) return;
    this.pointers.clear();
    this.releases++;
    this.lastRelease = `${why}*`;
    this.paint();
  }

  /** Touch pointers still "held" although the raw touch stream says no fingers are down. */
  private watchdog(): void {
    if (this.pointers.size === 0 || this.rawTouches !== 0) return;
    const now = this.now();
    if (now - this.rawTouchAt < WATCHDOG_MS) return;
    let stale = false;
    for (const p of this.pointers.values()) {
      if (p.type === 'touch' && now - p.since > WATCHDOG_MS) stale = true;
    }
    if (stale) this.releaseAll('watchdog');
  }

  private has(z: Zone): boolean {
    for (const p of this.pointers.values()) if (p.zone === z) return true;
    return false;
  }

  private paint(): void {
    for (const k of Object.keys(this.els) as Array<Exclude<Zone, 'none'>>) {
      this.els[k].classList.toggle('held', this.has(k));
    }
  }

  // -- InputSource ------------------------------------------------------------------

  read(out: InputFrame): void {
    this.watchdog();
    out.throttle = this.has('throttle') ? 1 : 0;
    out.brake = this.has('brake') ? 1 : 0;
    out.lean = (this.has('fwd') ? 1 : 0) - (this.has('back') ? 1 : 0);
    out.hop = false;
    out.restart = this.restartTap;
    this.restartTap = false;
    for (const pointer of this.pointers.values()) {
      if (pointer.zone !== 'restart') continue;
      out.restart = true;
      pointer.restartRead = true;
    }
    this.lastFrame = out;
    if (this.debugEl) this.paintDebug();
  }

  private paintDebug(): void {
    const f = this.lastFrame;
    const ps = [...this.pointers.entries()].map(([id, p]) => `#${id} ${p.type} ${p.zone}`).join('  ') || '(no pointers)';
    this.debugEl!.textContent =
      `touch ${this.enabled ? 'on' : 'off'}  raw fingers ${this.rawTouches}  releases ${this.releases} (${this.lastRelease || '-'})  gestures ${this.gestures}` +
      `${isForcedLandscape() ? `  forced-landscape ${window.innerWidth}x${window.innerHeight} -> ${this.root.clientWidth}x${this.root.clientHeight}` : ''}\n` +
      `${ps}\nthr ${f.throttle} brk ${f.brake} lean ${f.lean} restart ${f.restart ? 1 : 0}` +
      (this.notes.length ? `\nnav:\n${this.notes.join('\n')}` : '');
  }

  pollMeta(): MetaButtons {
    const m = { ...this.meta };
    clearMeta(this.meta);
    return m;
  }

  reset(): void {
    this.releaseAll('app-interruption');
    this.rawTouches = 0;
    clearMeta(this.meta);
  }

  dispose(): void {
    document.removeEventListener('gesturestart', this.onGesture as EventListener);
    document.removeEventListener('gesturechange', this.onGesture as EventListener);
    window.removeEventListener('blur', this.onLostFocus);
    window.removeEventListener('pagehide', this.onLostFocus);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.root.remove();
  }
}

/** `x, y` logical; the element's box is mapped into the same frame. */
function inside(el: HTMLElement, x: number, y: number): boolean {
  const r = logicalRect(el);
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function prevent(e: Event): void {
  e.preventDefault();
}
