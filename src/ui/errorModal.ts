/**
 * The crash screen (ask 84; ported from wildshard's ErrorModal). Any uncaught `error` / `unhandledrejection`
 * after the entry module starts evaluating, in the boot or in play, drops ONE full-screen sheet over
 * everything: the message, the stack (readable function names: vite.config.ts keeps them, because a phone
 * cannot resolve a source map), the build, the time, the URL, the user agent and the viewport, with
 * RELOAD / COPY REPORT / DISMISS. A phone playtest that dies then says why instead of freezing.
 *
 * One path for boot errors. The inline loader (src/boot/inline.ts) is the only screen before this module
 * exists: it can fail only on downloads (the entry never arrived), and shows that on its own dial with ⟳
 * Retry. From the moment `errorModalInstall.ts` evaluates (main.ts's FIRST import, so before any other game
 * module runs) every exception comes here: the listeners are registered in the CAPTURE phase, which the DOM
 * runs before the loader's bubble-phase listeners on the same `window`, and `stopImmediatePropagation()` keeps
 * the loader from painting a second, different error under this one. A boot step that throws and is caught
 * (main.ts `bootFront`) is handed here with `showError`.
 *
 * Self-contained styles: they must render when the stylesheet (or the font) is what failed. The contract's
 * tokens are used with their literal values as fallbacks. Only the first error is shown; later ones tick a
 * counter. The modal never throws.
 *
 * Noise is filtered (`isNoise`, each rule justified there): a benign browser warning must never throw a
 * full-screen sheet over a game that is still running.
 */

import { copyText } from './clipboard';
import { AUTOMATION_HOOK } from '../core/release';

declare const __BUILD_ID__: string | undefined;
declare const __BUILD_TIME__: string | undefined;

/** What an error event carries, in the shape the filter needs (unit-testable without a DOM). */
export interface ErrorLike {
  message: string;
  /** The thrown value (`ErrorEvent.error` / `PromiseRejectionEvent.reason`); undefined for a bare ErrorEvent. */
  error?: unknown;
  /** The script URL (`ErrorEvent.filename`); '' for rejections. */
  filename?: string;
}

/** Page state the network-noise rule reads. */
export interface NoiseContext {
  /** The page is going away (pagehide / beforeunload) or a new worker took control (a reload is coming). */
  leaving: boolean;
  online: boolean;
}

/** `fetch()` network failures, as each engine words them (Chromium, WebKit, Firefox, WebKit connection drop). */
const NETWORK_RE = /^(TypeError: )?(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?|The network connection was lost\.?)$/;

/**
 * Benign errors that must not raise the crash screen. Each rule is a class of event that is either not our
 * code or not a failure:
 *
 *  1. `ResizeObserver loop …` — the spec's own warning when observers skip a frame; delivered as an ErrorEvent
 *     with no error object, and the notifications arrive next frame. Nothing is broken.
 *  2. `AbortError` — a fetch / stream / media play that was deliberately cancelled (AbortController, a
 *     navigation, a worker hand-over tearing down in-flight requests). Cancellation is not a crash.
 *  3. A network failure (`Failed to fetch` / `Load failed` …) while the page is leaving or a new service worker
 *     is taking over (both reload the page: the request died with it), or while offline (the game is built to
 *     run from Cache Storage; a missing network is a state it degrades through, and the loader and the
 *     offline line already say so). Online and staying, it is shown: that is a real unhandled request.
 *  4. `Script error.` with no error object and no line — a cross-origin script (a browser extension; this game
 *     loads no cross-origin script under COEP) whose details the browser redacts. Not ours, nothing to act on.
 *  5. Anything whose script URL is a browser extension's (`chrome-extension:` / `safari-web-extension:` …).
 */
export function isNoise(e: ErrorLike, ctx: NoiseContext): boolean {
  const msg = e.message || '';
  if (/ResizeObserver loop (limit exceeded|completed with undelivered notifications)/.test(msg)) return true;
  const err = e.error as { name?: unknown; message?: unknown } | null | undefined;
  if (err && typeof err === 'object' && err.name === 'AbortError') return true;
  if (/^AbortError\b/.test(msg)) return true;
  const netMsg = err && typeof err === 'object' && typeof err.message === 'string' ? err.message : msg;
  if ((ctx.leaving || !ctx.online) && (NETWORK_RE.test(netMsg) || NETWORK_RE.test(msg))) return true;
  if (/^Script error\.?$/.test(msg) && (e.error === undefined || e.error === null)) return true;
  if (/^(chrome|moz|safari|safari-web)-extension:/.test(e.filename ?? '')) return true;
  return false;
}

/** The headline and stack for a thrown value (Error, DOMException, string, object). */
export function describe(reason: unknown): { message: string; stack: string } {
  if (reason instanceof Error) {
    const head = `${reason.name}: ${reason.message}`;
    // V8 starts `stack` with the headline; WebKit does not. The sheet shows the headline once.
    const stack = (reason.stack ?? '').startsWith(head) ? (reason.stack ?? '').slice(head.length).replace(/^\n/, '') : (reason.stack ?? '');
    return { message: head, stack };
  }
  if (typeof reason === 'object' && reason !== null) {
    try {
      return { message: JSON.stringify(reason).slice(0, 400), stack: '' };
    } catch {
      /* circular: fall through */
    }
  }
  return { message: String(reason), stack: '' };
}

/** `build <id> · <time>` + URL + UA + viewport: the lines a report needs to be reproduced. */
export function reportMeta(now = new Date()): string {
  const id = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
  const built = typeof __BUILD_TIME__ === 'string' ? ` (built ${__BUILD_TIME__})` : '';
  const nav = navigator as Navigator & { hardwareConcurrency?: number };
  return [`build ${id}${built} · crashed ${now.toISOString()}`, location.href, navigator.userAgent, `${innerWidth}×${innerHeight} · dpr ${devicePixelRatio} · cores ${nav.hardwareConcurrency ?? '?'}`].join('\n');
}

const CSS = /* css */ `
#crash { position: fixed; inset: 0; z-index: 2147483000; display: flex; align-items: center; justify-content: center; box-sizing: border-box;
  padding: calc(12px + env(safe-area-inset-top, 0px)) calc(12px + env(safe-area-inset-right, 0px)) calc(12px + env(safe-area-inset-bottom, 0px)) calc(12px + env(safe-area-inset-left, 0px));
  background: rgba(7,8,10,.94); color: var(--ink, #f3f5f8); font: 500 14px/1.4 var(--font, "Trials UI", "Barlow Condensed", "Arial Narrow", "Helvetica Neue", Arial, system-ui, sans-serif);
  -webkit-user-select: text; user-select: text; touch-action: auto; pointer-events: auto; }
#crash * { box-sizing: border-box; }
#crash .sheet { display: flex; flex-direction: column; width: min(760px, 100%); max-height: 100%; background: var(--slab-3, rgba(16,19,25,.96));
  box-shadow: inset 5px 0 0 var(--red, #ff3d3d), 0 0 0 1px rgba(255,255,255,.08), 0 24px 80px rgba(0,0,0,.6); border-radius: 0 var(--r2, 10px) var(--r2, 10px) 0; padding: 16px 18px 14px 24px; }
#crash .tag { font-size: 11px; letter-spacing: .24em; text-transform: uppercase; color: var(--red, #ff3d3d); }
#crash h1 { margin: 2px 0 2px; font: italic 900 clamp(22px, 5.2vmin, 34px)/1 var(--display, "Trials Display", "Arial Narrow", Impact, system-ui, sans-serif); letter-spacing: -.01em; text-transform: uppercase; color: var(--ink, #f3f5f8); }
#crash .sub { margin: 0 0 10px; font-size: 13px; color: var(--ink-dim, rgba(243,245,248,.62)); }
#crash .msg { margin: 0 0 8px; font: 700 14px/1.35 var(--mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace); color: #fff; white-space: pre-wrap; word-break: break-word; }
#crash .scroll { flex: 1 1 auto; min-height: 48px; overflow: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; margin: 0 0 10px; padding: 8px 10px; background: rgba(0,0,0,.45); border: 1px solid var(--line-2, rgba(255,255,255,.08)); border-radius: var(--r1, 6px); }
#crash pre { margin: 0; font: 400 11.5px/1.45 var(--mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace); color: rgba(243,245,248,.82); white-space: pre-wrap; word-break: break-word; }
#crash pre.meta { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line-2, rgba(255,255,255,.08)); color: var(--ink-mute, rgba(243,245,248,.38)); font-size: 10.5px; }
#crash .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; flex: 0 0 auto; }
#crash button { appearance: none; -webkit-appearance: none; min-height: 44px; min-width: 112px; padding: 0 18px; border: 0; border-radius: var(--r1, 6px); cursor: pointer;
  font: 700 15px/1 var(--font, "Trials UI", "Barlow Condensed", "Arial Narrow", system-ui, sans-serif); letter-spacing: .1em; text-transform: uppercase; color: var(--ink, #f3f5f8); background: rgba(255,255,255,.1); box-shadow: inset 0 0 0 1px var(--line, rgba(255,255,255,.18)); }
#crash button.primary { background: var(--amber, #ffb020); color: var(--amber-ink, #1a1206); box-shadow: none; }
#crash button:focus-visible { outline: 2px solid var(--ink, #f3f5f8); outline-offset: 2px; }
#crash button:active { transform: translateY(1px); }
#crash .n { margin-left: auto; font-size: 12px; color: var(--amber, #ffb020); font-variant-numeric: tabular-nums; }
@media (max-height: 500px) { #crash .sheet { padding: 10px 14px 10px 20px; } #crash .sub { margin-bottom: 6px; } #crash .msg { margin-bottom: 6px; } #crash .scroll { margin-bottom: 8px; } }
`;

let root: HTMLElement | null = null;
let count = 0;
let first = '';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  return e;
}

function button(label: string, cls: string, onClick: (b: HTMLButtonElement) => void): HTMLButtonElement {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', () => onClick(b));
  return b;
}

function build(message: string, stack: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.id = 'crash';
  wrap.setAttribute('role', 'alertdialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-labelledby', 'crash-title');
  const style = document.createElement('style');
  style.textContent = CSS;
  const sheet = el('div', 'sheet');
  const title = el('h1', '', 'The game crashed');
  title.id = 'crash-title';
  const scroll = el('div', 'scroll');
  const meta = reportMeta();
  scroll.append(el('pre', 'stack', stack || '(no stack)'), el('pre', 'meta', meta));
  const n = el('span', 'n');
  const report = (): string => `${message}\n\n${stack || '(no stack)'}\n\n${meta}${count > 1 ? `\n\n+${count - 1} more errors after this one` : ''}`;
  const row = el('div', 'row');
  row.append(
    button('⟳ Reload', 'primary reload', () => location.reload()),
    button('Copy report', 'copy', (b) => {
      // Inside the tap's own handler: iOS gates the clipboard on the gesture (src/ui/clipboard.ts).
      void copyText(report()).then((ok) => (b.textContent = ok ? 'Copied' : 'Copy failed'));
    }),
    button('Dismiss', 'close', () => {
      wrap.remove();
      root = null;
    }),
    n,
  );
  sheet.append(el('div', 'tag', 'Uncaught exception'), title, el('p', 'sub', 'This is a bug in the game, not your phone. Copy the report, then reload.'), el('p', 'msg', message), scroll, row);
  wrap.append(style, sheet);
  // Keys belong to the sheet while it is up: the game's window listeners (Enter = restart, Esc = menu) must not
  // act under it. RELOAD takes focus on show, so a key lands in the sheet and stops at its root; the buttons'
  // own Tab / Enter / Space defaults are untouched (nothing is prevented).
  wrap.addEventListener('keydown', (e) => e.stopPropagation());
  return wrap;
}

/** Show the crash screen (the first error wins the headline; later ones tick the counter). Never throws. */
export function showError(message: string, stack = ''): void {
  try {
    if (root && !root.isConnected) root = null; // dismissed, or taken out by someone else: a fresh sheet
    if (!root) count = 0;
    count++;
    if (!root) {
      first = message;
      root = build(message, stack);
      (document.body ?? document.documentElement).append(root);
      root.querySelector<HTMLButtonElement>('button.reload')?.focus({ preventScroll: true });
    }
    const n = root.querySelector('.n');
    if (n) n.textContent = count > 1 ? `+${count - 1} more (first: ${first.slice(0, 40)}${first.length > 40 ? '…' : ''})` : '';
  } catch {
    /* the crash screen must never throw */
  }
}

/** A thrown value → the screen. For errors a caller caught (main.ts `bootFront`) but that still end the game. */
export function showThrown(reason: unknown): void {
  const d = describe(reason);
  showError(d.message, d.stack);
}

/** How many errors reached the screen (harness / tests). */
export function crashCount(): number {
  return count;
}

type CrashWindow = Window & { __trialsCrash?: { count(): number; show(message: string, stack?: string): void } };

/**
 * Hook `error` + `unhandledrejection` on the window, capture phase (see the header: before the inline loader's
 * listeners, which then never see it). Idempotent. Not in `?harness=1`: the harness owns its page errors and its
 * stills must not grow a sheet.
 */
export function installErrorModal(): void {
  if (typeof window === 'undefined') return;
  const w = window as CrashWindow;
  if (w.__trialsCrash) return;
  if (AUTOMATION_HOOK && /[?&]harness=1/.test(location.search)) return;
  w.__trialsCrash = { count: crashCount, show: showError };
  let leaving = false;
  const bye = (): void => {
    leaving = true;
  };
  addEventListener('pagehide', bye);
  addEventListener('beforeunload', bye);
  navigator.serviceWorker?.addEventListener('controllerchange', bye);
  const ctx = (): NoiseContext => ({ leaving, online: navigator.onLine !== false });
  addEventListener(
    'error',
    (e: ErrorEvent) => {
      // Resource load failures (an <img> 404) reach a capture listener on window too; they are not exceptions.
      if (!(e instanceof ErrorEvent)) return;
      e.stopImmediatePropagation();
      if (isNoise({ message: e.message, error: e.error, filename: e.filename }, ctx())) return;
      const d = e.error !== undefined && e.error !== null ? describe(e.error) : { message: e.message || 'Unknown error', stack: '' };
      showError(d.message, d.stack || (e.filename ? `at ${e.filename}:${e.lineno}:${e.colno}` : ''));
    },
    true,
  );
  addEventListener(
    'unhandledrejection',
    (e: PromiseRejectionEvent) => {
      e.stopImmediatePropagation();
      const d = describe(e.reason);
      if (isNoise({ message: d.message, error: e.reason }, ctx())) return;
      showError(`Unhandled rejection · ${d.message}`, d.stack);
    },
    true,
  );
}

/**
 * `?crash=play|reject|boot` — the harness's (and a curious tester's) way to prove the screen. `play` / `reject`
 * wrap the HUD's `setRun` so the throw happens INSIDE the game loop, after `afterS` seconds of riding: the stack
 * is then the real one (`crashTestSetRun` ← the game's own frame functions), which is what shows whether the
 * production names survived. `boot` throws from a boot step (`crashTestBoot`, main.ts). Once only.
 */
export type CrashTest = 'play' | 'reject' | 'boot' | null;

export function crashTestMode(search: string): CrashTest {
  const v = new URLSearchParams(search).get('crash');
  if (v === '1' || v === 'play') return 'play';
  if (v === 'reject' || v === 'boot') return v;
  return null;
}

export function armCrashTest<I extends { phase: string; runTime: number }>(hud: { setRun(info: I): void }, mode: 'play' | 'reject', afterS = 1): void {
  const orig = hud.setRun.bind(hud);
  // A declaration, not a named expression: the minifier drops an unreferenced expression name, and this frame
  // should read `crashTestSetRun` on the sheet.
  function crashTestSetRun(info: I): void {
    orig(info);
    if (info.phase !== 'riding' || info.runTime < afterS) return;
    hud.setRun = orig;
    const err = new Error(`crash test (?crash=${mode}): thrown inside the game loop at ${info.runTime.toFixed(2)} s of riding`);
    if (mode === 'reject') void Promise.reject(err);
    else throw err;
  }
  hud.setRun = crashTestSetRun;
}

export function crashTestBoot(): never {
  throw new Error('crash test (?crash=boot): thrown from a boot step');
}
