/**
 * The touch-navigation invariant (docs/tasks/touch-navigation-invariant.md §2), in one place:
 *
 *   > Nothing is hit-testable unless it is drawn at ≥ 0.5 opacity and has been for ≥ 150 ms.
 *
 * `show` / `hide` classes decide what is DRAWN (a fade is a fade); the `live` class decides what
 * TAKES POINTERS, and only this module toggles it. `reveal(el)` starts watching an element after its
 * reveal began and adds `.live` on the first animation frame at which the watched surface's effective
 * opacity (its own × every ancestor's) is ≥ LIVE_OPACITY and ≥ LIVE_DELAY_MS have passed since the
 * reveal. `conceal(el)` removes `.live` synchronously — a fading-out surface is dead from the first
 * frame of its fade. Every overlay / screen / tile / button rule in styles.ts is `pointer-events:
 * none` until `.live`; opacity alone is never a visibility state.
 *
 * The frame poll is the invariant's own clock (it is not a timer racing the fade: it *reads* the fade).
 */

export const LIVE_OPACITY = 0.5;
export const LIVE_DELAY_MS = 150;
export const LIVE_CLASS = 'live';

interface Watch {
  /** Surface whose drawn opacity is the condition (defaults to the element itself). */
  surface: HTMLElement;
  /** Extra condition (e.g. results stage ≥ 3); re-read every frame. */
  when: (() => boolean) | null;
  /** performance.now() of the first frame the surface was observed drawn (≥ LIVE_OPACITY); -1 while it is not. */
  drawnSince: number;
}

const watches = new Map<HTMLElement, Watch>();
let raf = 0;
let clock: () => number = () => performance.now();

/** Injectable clock (tests). */
export function setLiveClock(now: () => number): void {
  clock = now;
}

/** Effective opacity of `el`: its computed opacity multiplied through every ancestor up to `<body>`; 0 when it is `visibility: hidden` or `display: none` anywhere up the chain. */
export function effectiveOpacity(el: Element | null): number {
  let o = 1;
  for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
    o *= Number.parseFloat(cs.opacity) || 0;
    if (o < 1e-3) return 0;
  }
  return o;
}

/** `el` (or an ancestor) carries `.live` AND `el` is drawn at ≥ LIVE_OPACITY: the only state in which a pointer may act on it. */
export function isLiveTarget(el: Element | null): boolean {
  if (!el || !(el instanceof Element)) return false;
  if (!el.closest(`.${LIVE_CLASS}`)) return false;
  return effectiveOpacity(el) >= LIVE_OPACITY;
}

/**
 * Start the reveal watch for `el`: `.live` lands on the first frame at which `surface` (default `el`)
 * has been drawn at ≥ LIVE_OPACITY for LIVE_DELAY_MS and `when()` (if given) holds. Calling it again
 * restarts the watch (a re-show is a new reveal). The element must already carry its `show` state.
 */
export function reveal(el: HTMLElement, opts: { surface?: HTMLElement; when?: () => boolean } = {}): void {
  el.classList.remove(LIVE_CLASS);
  watches.set(el, { surface: opts.surface ?? el, when: opts.when ?? null, drawnSince: -1 });
  schedule();
}

/** Stop watching and drop `.live` now. Idempotent. */
export function conceal(el: HTMLElement): void {
  watches.delete(el);
  el.classList.remove(LIVE_CLASS);
}

/** Is `el` live (the class, not the drawn state)? */
export function isLive(el: HTMLElement): boolean {
  return el.classList.contains(LIVE_CLASS);
}

/** One pass of the invariant's clock over every watched element; exported so a test can drive it without RAF. */
export function tickLive(now = clock()): void {
  for (const [el, w] of watches) {
    if (!el.isConnected) {
      watches.delete(el);
      continue;
    }
    const drawn = (w.when ? w.when() : true) && effectiveOpacity(w.surface) >= LIVE_OPACITY;
    if (!drawn) {
      w.drawnSince = -1; // the 150 ms count from the first drawn frame, and start over if it stops being drawn
      continue;
    }
    if (w.drawnSince < 0) w.drawnSince = now;
    if (now - w.drawnSince < LIVE_DELAY_MS) continue;
    el.classList.add(LIVE_CLASS);
    watches.delete(el);
  }
  if (watches.size > 0) schedule();
}

function schedule(): void {
  if (raf || typeof requestAnimationFrame !== 'function') return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    tickLive();
  });
}

/** Tests: forget every watch. */
export function resetLive(): void {
  for (const el of watches.keys()) el.classList.remove(LIVE_CLASS);
  watches.clear();
  if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
  raf = 0;
}
