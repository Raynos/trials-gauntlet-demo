/**
 * Forced landscape (docs/design/game.md §11).
 *
 * A home-screen web app cannot declare "landscape only" the way YouTube or
 * Netflix do: iOS has no `screen.orientation.lock()` outside fullscreen video,
 * so with the rotation lock on the viewport stays portrait whichever way the
 * phone is held. The web answer is to rotate the *page*: when a touch device
 * reports a portrait viewport, `#app` (canvas + every DOM layer) is laid out at
 * the landscape size `{ w: innerHeight, h: innerWidth }` and turned 90° inside
 * the portrait viewport. The player turns the phone and sees a correct
 * landscape game regardless of the lock.
 *
 * Rotation direction: **clockwise** (`rotate(90deg)` with `transform-origin:
 * top left`, then `translateY(-100%)` to bring the box back on screen). The
 * game's top edge lands on the phone's physical RIGHT edge and the game's left
 * edge on the physical TOP (notch), so the game reads upright when the phone
 * is held with the **notch on the left and the home indicator on the right**
 * (iOS "landscape left", the default landscape of every Apple game). Safe-area
 * insets therefore remap: notch (`safe-area-inset-top`) → logical left, home
 * indicator (`inset-bottom`) → logical right, physical right → logical top,
 * physical left → logical bottom (`html.forced-landscape { --sat … --sal }` in
 * styles.ts).
 *
 * Coordinates: pointer / touch events arrive in the physical (portrait)
 * frame. `toLogical` is the single inverse used by the touch layer's
 * hit-testing, its debug overlay and the menus' spatial focus. With the
 * transform above, physical `(px, py)` ↔ logical `(lx, ly)`:
 *
 *     px = physW − ly        lx = py
 *     py = lx                ly = physW − px
 *
 * Only a coarse-pointer (touch) device in portrait triggers it; desktop,
 * keyboard, gamepad and `?harness=1` (which never constructs the App) are
 * untouched. `vw`/`vh` in the stylesheet go through `--vw`/`--vh` (1 vw/1 vh
 * normally, logical px / 100 when forced) and the "short phone" / "narrow"
 * media queries are the `html.short` / `html.narrow` classes, set from the
 * logical size, so layout follows the rotated frame.
 */

export interface LogicalSize {
  /** Logical (game) size in CSS px. */
  w: number;
  h: number;
  /** True when the page is rotated 90° inside a portrait viewport. */
  forced: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Logical height below which the compact phone rules apply (was `@media (max-height: 500px)`). */
export const SHORT_MAX_H = 500;
/** Logical width below which the compact HUD rules apply (was `@media (max-width: 720px)`). */
export const NARROW_MAX_W = 720;

let forced = false;
let physW = 0;
let physH = 0;

/** Coarse primary pointer (phones, tablets). Touch-screen laptops keep a fine pointer and are not rotated. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const touch = (navigator.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window;
  return coarse && touch;
}

/** Whether the page is currently rotated. */
export function isForcedLandscape(): boolean {
  return forced;
}

/**
 * Re-evaluate the viewport: rotate on a portrait touch viewport, undo it
 * otherwise. Sets `html.forced-landscape`, `--lw/--lh/--vw/--vh` and the
 * `short`/`narrow` layout classes. Returns the logical size the renderer must
 * use (`game.resize`). Call on resize / orientationchange / visualViewport
 * resize and once at start.
 */
export function applyOrientation(opts: { touch?: boolean; width?: number; height?: number } = {}): LogicalSize {
  const html = document.documentElement;
  physW = Math.round(opts.width ?? window.innerWidth);
  physH = Math.round(opts.height ?? window.innerHeight);
  const touch = opts.touch ?? isTouchDevice();
  forced = touch && physH > physW && physW > 0;
  const w = forced ? physH : physW;
  const h = forced ? physW : physH;
  html.classList.toggle('forced-landscape', forced);
  html.classList.toggle('short', h <= SHORT_MAX_H);
  html.classList.toggle('narrow', w <= NARROW_MAX_W);
  const s = html.style;
  if (forced) {
    // Integer px so the rotated layer maps 1:1 onto device pixels — no resampled text.
    s.setProperty('--lw', `${w}px`);
    s.setProperty('--lh', `${h}px`);
    s.setProperty('--vw', `${w / 100}px`);
    s.setProperty('--vh', `${h / 100}px`);
  } else {
    s.removeProperty('--lw');
    s.removeProperty('--lh');
    s.removeProperty('--vw');
    s.removeProperty('--vh');
  }
  return { w, h, forced };
}

/** Physical (event `clientX/Y`) → logical game coordinates. Identity when not forced. */
export function toLogical(px: number, py: number, out: Point = { x: 0, y: 0 }): Point {
  if (forced) {
    out.x = py;
    out.y = physW - px;
  } else {
    out.x = px;
    out.y = py;
  }
  return out;
}

/** Logical → physical; the inverse of `toLogical` (tests, synthetic events). */
export function toPhysical(lx: number, ly: number, out: Point = { x: 0, y: 0 }): Point {
  if (forced) {
    out.x = physW - ly;
    out.y = lx;
  } else {
    out.x = lx;
    out.y = ly;
  }
  return out;
}

/**
 * An element's box in logical coordinates. `getBoundingClientRect` reports the
 * transformed (physical) box; a 90° turn keeps rectangles rectangular, so the
 * two mapped corners normalised are exact.
 */
export function logicalRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  if (!forced) return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  const a = toLogical(r.left, r.top);
  const b = toLogical(r.right, r.bottom);
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** Test hook: force the mapping state without touching the DOM. */
export function _setOrientationForTest(state: { forced: boolean; physW: number; physH: number }): void {
  forced = state.forced;
  physW = state.physW;
  physH = state.physH;
}
