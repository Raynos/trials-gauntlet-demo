/**
 * One-time storage rename for the ROCKHOP rebrand (store release R3): every key the game wrote under the old
 * `trials.` prefix (best times and their boards, the last runs, settings, garage choices, the review queue…) is
 * copied to the same name under `rockhop.`, so an existing web player keeps their progress and best times.
 *
 * - Copy, never move: the old keys stay (a rolled-back build still finds them). Reset progress clears the new ones.
 * - A key that already exists under `rockhop.` wins (never overwritten by an older value).
 * - Runs once per device: `rockhop.migrated` records it. Blocked storage (private mode, the harness) is a no-op.
 *
 * Called at the top of `boot()` (src/main.ts), after the native shells hydrated their durable store, before the
 * first setting is read.
 */
import { STORE } from '../core/release';
import { persistentStorage } from '../platform/storage';

/** The pre-rebrand prefix. A store build (a fresh install: no web player's storage to carry) has none. */
export const LEGACY_PREFIX: string = STORE ? '' : 'trials.';
export const STORAGE_PREFIX = 'rockhop.';
export const MIGRATED_KEY = `${STORAGE_PREFIX}migrated`;

/** The game's storage (localStorage, or the native mirror, so the copies reach Preferences too). */
function local(): Storage | null {
  try {
    return persistentStorage();
  } catch {
    return null;
  }
}

/** Copies every legacy key once; returns how many were copied (0 when already done or storage is unavailable). */
export function migrateLegacyStorage(store: Storage | null = local()): number {
  if (!store || !LEGACY_PREFIX) return 0;
  try {
    if (store.getItem(MIGRATED_KEY)) return 0;
    const legacy: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k?.startsWith(LEGACY_PREFIX)) legacy.push(k);
    }
    let copied = 0;
    for (const k of legacy) {
      const next = STORAGE_PREFIX + k.slice(LEGACY_PREFIX.length);
      const v = store.getItem(k);
      if (v === null || store.getItem(next) !== null) continue;
      store.setItem(next, v);
      copied++;
    }
    store.setItem(MIGRATED_KEY, '1');
    return copied;
  } catch {
    return 0; // quota / blocked: the old keys are untouched, the next boot tries again
  }
}
