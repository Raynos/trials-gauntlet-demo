/**
 * What the service worker actually holds, said out loud (ask 58, docs/plans/PWA_OFFLINE.md §6.5, §9.1).
 *
 * Two honesty problems, one line of copy:
 *  - the player has no way to know whether this build is offline-ready, and
 *  - Safari clears **all** script-writable storage for an origin after 7 days without a visit, and
 *    `navigator.storage.persist()` does not exist on iOS. There is nothing to engineer around it —
 *    the user's call was to accept it — so it gets stated rather than hidden.
 */
import { isNativeApp } from '../platform/target';

export interface OfflineHeld {
  build: string;
  entries: number;
  models: number;
  bytes: number;
}

/** Native uses installed files; web resolves null when no worker controls the page. */
export function offlineHeld(timeoutMs = 8000): Promise<OfflineHeld | null> {
  if (isNativeApp()) return Promise.resolve(null);
  const sw = typeof navigator === 'undefined' ? null : navigator.serviceWorker;
  if (!sw?.controller || typeof MessageChannel === 'undefined') return Promise.resolve(null);
  return new Promise<OfflineHeld | null>((resolve) => {
    const ch = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    ch.port1.onmessage = (e: MessageEvent): void => {
      clearTimeout(timer);
      const d = e.data as Partial<OfflineHeld> | null;
      resolve(d && typeof d.bytes === 'number' ? { build: String(d.build ?? ''), entries: Number(d.entries ?? 0), models: Number(d.models ?? 0), bytes: d.bytes } : null);
    };
    try {
      sw.controller!.postMessage({ type: 'VERSION' }, [ch.port2]);
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** Installed-file status on native, cached-file status on web (hidden without a worker). */
export function offlineLine(held: OfflineHeld | null): string {
  if (isNativeApp()) return 'Offline ready · game files included with this app';
  if (!held || held.bytes <= 0) return '';
  return `Offline ready · ${(held.bytes / 1e6).toFixed(1)} MB in ${held.entries} files · iOS clears it after 7 days without opening the game`;
}
