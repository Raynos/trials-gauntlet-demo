/**
 * Touch → InputFrame (CONTRACT §2.8). Full-screen pointer-event layer under
 * the HUD (menus/results sit above it and take their own taps). Left half =
 * two lean zones (back | forward), right half = brake | throttle. Restart
 * button top-right, pause top-left, both ≥ 44 pt.
 *
 * Robustness (iOS Safari, the P0): the frame is *recomputed every read()*
 * from a Map of active pointers — never toggled by up/down — and a pointer is
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
 * Coordinates: `clientX/Y` are physical; every hit-test goes through
 * `toLogical` (src/ui/orientation.ts) so the zones sit in the game's frame
 * when the page is rotated for forced landscape.
 */
import type { InputFrame } from '../../core/types';
import { isForcedLandscape, logicalRect, toLogical, type Point } from '../../ui/orientation';
import { clearMeta, type InputSource, type MetaButtons } from './types';

type Zone = 'back' | 'fwd' | 'brake' | 'throttle' | 'restart' | 'pause' | 'none';

interface ActivePointer {
  zone: Zone;
  type: string;
  /** performance.now() at pointerdown (watchdog / debug). */
  since: number;
}

const WATCHDOG_MS = 400;

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
  private readonly meta: MetaButtons = { pause: false, confirm: false, back: false, navX: 0, navY: 0, active: false };
  private enabled = false;
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
  private readonly pt: Point = { x: 0, y: 0 };

  constructor(parent: HTMLElement, options: TouchInputOptions = {}) {
    this.now = options.now ?? (() => performance.now());
    this.root = document.createElement('div');
    this.root.className = 'touch-layer';
    this.root.setAttribute('aria-hidden', 'true');
    const mk = (cls: string, label: string): HTMLDivElement => {
      const d = document.createElement('div');
      d.className = `tz ${cls}`;
      d.innerHTML = `<span>${label}</span>`;
      this.root.appendChild(d);
      return d;
    };
    this.els = {
      back: mk('tz-back', '◀ LEAN'),
      fwd: mk('tz-fwd', 'LEAN ▶'),
      brake: mk('tz-brake', 'BRAKE'),
      throttle: mk('tz-throttle', 'GAS'),
      pause: mk('tz-pause tz-btn', '❚❚'),
      restart: mk('tz-restart tz-btn', '↻<small>Restart</small>'),
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
  }

  /** Show the zone outlines (called when touch becomes the active device). */
  /** 3 s into a run the zone outlines/labels drop to ~30 % so play is not under a diagram. */
  setSettled(on: boolean): void {
    this.root.classList.toggle('settled', on);
  }

  setVisible(on: boolean): void {
    this.root.classList.toggle('visible', on);
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
      if (inside(this.els.restart, x, y)) return 'restart';
      if (inside(this.els.pause, x, y)) return 'pause';
    } else if (current === 'restart' || current === 'pause') {
      return current; // buttons latch to the pointer that pressed them
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
    if (!this.enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      /* Safari may reject capture for an already-ended pointer */
    }
    const zone = this.zoneAt(e.clientX, e.clientY, undefined);
    this.pointers.set(e.pointerId, { zone, type: e.pointerType, since: this.now() });
    this.meta.active = true;
    if (zone === 'pause') this.meta.pause = true;
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
      // No fingers on the glass: nothing can be held, whatever the pointer stream said.
      this.releaseAll(e.type);
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
    out.restart = this.has('restart');
    this.lastFrame = out;
    if (this.debugEl) this.paintDebug();
  }

  private paintDebug(): void {
    const f = this.lastFrame;
    const ps = [...this.pointers.entries()].map(([id, p]) => `#${id} ${p.type} ${p.zone}`).join('  ') || '(no pointers)';
    this.debugEl!.textContent =
      `touch ${this.enabled ? 'on' : 'off'}  raw fingers ${this.rawTouches}  releases ${this.releases} (${this.lastRelease || '-'})  gestures ${this.gestures}` +
      `${isForcedLandscape() ? `  forced-landscape ${window.innerWidth}x${window.innerHeight} -> ${this.root.clientWidth}x${this.root.clientHeight}` : ''}\n` +
      `${ps}\nthr ${f.throttle} brk ${f.brake} lean ${f.lean} restart ${f.restart ? 1 : 0}`;
  }

  pollMeta(): MetaButtons {
    const m = { ...this.meta };
    clearMeta(this.meta);
    return m;
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
