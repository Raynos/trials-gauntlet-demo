/**
 * Android system back → the game (docs/plans/STORE_RELEASE.md Phase 5). Safe to import statically from UI code:
 * on the web `onSystemBack` only stores the handler and `exitApp` does nothing, and @capacitor/app is reached
 * through a `STORE`-guarded dynamic import, so the web bundle carries no Capacitor code (src/store-build.test.ts).
 *
 * In the native shells a @capacitor/app `backButton` listener replaces Capacitor's default (WebView history back,
 * then exit), so back never leaves mid-ride. Each press goes, in order, to:
 *   1. the handler the UI registered with `onSystemBack` (pause menu / exit confirm — src/ui owns what it does;
 *      it returns true when it handled the press),
 *   2. otherwise a synthetic Escape key press, which the game already reads as "pause / menu"
 *      (src/game/input/keyboard.ts) — so back pauses a ride even before the UI side is wired.
 * Leaving the app is always the UI's decision: it calls `exitApp()` from its exit confirm.
 */
import { STORE } from '../core/release';

type BackHandler = () => boolean;
let handler: BackHandler | null = null;

/** The UI's back handler (one at a time; the latest wins). Returns an unsubscribe. No-op on the web. */
export function onSystemBack(h: BackHandler): () => void {
  handler = h;
  return () => {
    if (handler === h) handler = null;
  };
}

/** Close the app (Android). A no-op on the web and on iOS (which has no programmatic exit). */
export function exitApp(): void {
  if (!STORE) return;
  void import('@capacitor/app').then(({ App }) => App.exitApp()).catch(() => undefined);
}

function pressEscape(): void {
  for (const type of ['keydown', 'keyup'] as const) {
    window.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  }
}

/** One back press (the listener; exported for tests). */
export function dispatchBack(): void {
  let handled = false;
  try {
    handled = handler?.() ?? false;
  } catch (e) {
    console.error('[rockhop] back handler threw', e);
  }
  if (!handled) pressEscape();
}

let installed = false;

/** Called once by `startPlatform()` in the native shells. */
export async function installBackButton(): Promise<void> {
  if (!STORE || installed) return;
  installed = true;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', dispatchBack);
}
