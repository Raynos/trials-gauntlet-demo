/**
 * The native-shell side of the game (docs/plans/STORE_RELEASE.md Phase 5), loaded only by the store build:
 * src/main.ts does `if (STORE) await import('./platform').then((p) => p.startPlatform())` before `boot()`, so the
 * web bundle carries none of it (the branch folds away and the chunk is never emitted).
 *
 * `startPlatform()` resolves before the game reads any setting or progress:
 *   - durable storage hydrated from @capacitor/preferences (./storage.ts),
 *   - iOS audio session `ambient` (the silent switch mutes the game; the player's music keeps playing),
 *   - Android system back routed to the game (./back.ts),
 *   - in a native gate run (debug builds, armed by the shell), the in-app gate runner (./gate.ts).
 * In a plain browser (the store bundle served on the web, the web gate) the native parts are skipped.
 */
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { AUTOMATION_HOOK } from '../core/release';
import { installBackButton } from './back';
import { hydrateStorage, type DurableKV } from './storage';

export { persistentStorage } from './storage';
export { onSystemBack, exitApp } from './back';

/** True inside the iOS / Android shell. */
export function isNativeShell(): boolean {
  return Capacitor.isNativePlatform();
}

const preferencesKV: DurableKV = {
  keys: async () => (await Preferences.keys()).keys,
  get: async (key) => (await Preferences.get({ key })).value,
  set: (key, value) => Preferences.set({ key, value }),
  remove: (key) => Preferences.remove({ key }),
  clear: () => Preferences.clear(),
};

export async function startPlatform(): Promise<void> {
  const native = isNativeShell();
  // Web Audio follows the page's audio session in WebKit (Safari 16.4+ / iOS 17): ambient = muted by the silent
  // switch and mixed with other apps' audio, the same category the shell sets natively (AppDelegate.swift).
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = 'ambient';
  if (native) {
    try {
      await Preferences.configure({ group: 'RockhopStorage' });
      const r = await hydrateStorage(preferencesKV);
      console.info(`[rockhop] storage hydrated: ${r.restored} restored, ${r.pushed} pushed (${Capacitor.getPlatform()})`);
    } catch (e) {
      console.warn('[rockhop] durable storage unavailable, localStorage only', e);
    }
    await installBackButton().catch((e: unknown) => console.warn('[rockhop] back button not wired', e));
  }
  if (AUTOMATION_HOOK && (window as Window & { __rockhopGate?: unknown }).__rockhopGate) {
    const { startGate } = await import('./gate');
    startGate();
  }
}
