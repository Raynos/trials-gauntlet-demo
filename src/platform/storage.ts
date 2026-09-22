/**
 * Durable key/value storage for progress, best times and settings (docs/plans/STORE_RELEASE.md Phase 5).
 *
 * Web: `localStorage`, exactly as before. Native (the Capacitor shells): WKWebView / Android WebView localStorage
 * can be evicted under storage pressure, so every write also goes to @capacitor/preferences (UserDefaults on iOS,
 * SharedPreferences on Android — app data, never collected), and `hydrateStorage()` at start-up copies it back.
 *
 * The UI keeps its synchronous reads: `persistentStorage()` returns a `Storage`-shaped object (the same surface as
 * `localStorage`), so a module that did `const s = localStorage` does `const s = persistentStorage()` instead and
 * nothing else changes. Reads always come from localStorage; `hydrateStorage()` must have resolved before the first
 * read on native (src/platform/index.ts `startPlatform`, awaited before `boot()`).
 *
 * Every call is try/catch'd like the callers already expect: private mode, blocked storage and the harness work.
 */

/** The async key/value store behind the mirror (Preferences on native). Injectable for tests. */
export interface DurableKV {
  keys(): Promise<string[]>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

let durable: DurableKV | null = null;
let pending: Promise<unknown> = Promise.resolve();

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Queue a durable write after the previous one, so the last write of a key always lands last. Errors are logged, never thrown. */
function mirror(op: (kv: DurableKV) => Promise<unknown>): void {
  const kv = durable;
  if (!kv) return;
  pending = pending.then(() => op(kv)).catch((e: unknown) => console.warn('[rockhop] durable storage write failed', e));
}

/** A `Storage` whose writes reach localStorage now and the durable store (when there is one) in order, soon after. */
class MirroredStorage implements Storage {
  get length(): number {
    return local()?.length ?? 0;
  }
  key(index: number): string | null {
    return local()?.key(index) ?? null;
  }
  getItem(key: string): string | null {
    return local()?.getItem(key) ?? null;
  }
  setItem(key: string, value: string): void {
    local()?.setItem(key, value); // may throw QuotaExceededError, as localStorage does: callers already catch it
    mirror((kv) => kv.set(key, value));
  }
  removeItem(key: string): void {
    local()?.removeItem(key);
    mirror((kv) => kv.remove(key));
  }
  clear(): void {
    local()?.clear();
    mirror((kv) => kv.clear());
  }
}

const mirrored = new MirroredStorage();

/** The storage the game reads and writes: `localStorage` on the web, the Preferences-backed mirror in the native shells. */
export function persistentStorage(): Storage | null {
  if (!durable) return local();
  return local() ? mirrored : null;
}

/**
 * Native start-up: make the durable store the source of truth. Keys it holds are written into localStorage (this is
 * what restores progress after the WebView evicted it); keys only localStorage holds (written before the first
 * native launch, or by an older build) are copied into it. Resolves when both agree.
 */
export async function hydrateStorage(kv: DurableKV): Promise<{ restored: number; pushed: number }> {
  durable = kv;
  const ls = local();
  let restored = 0;
  let pushed = 0;
  const keys = new Set(await kv.keys());
  for (const k of keys) {
    const v = await kv.get(k);
    if (v === null || !ls) continue;
    if (ls.getItem(k) !== v) {
      try {
        ls.setItem(k, v);
        restored += 1;
      } catch {
        /* quota: the durable copy still holds it */
      }
    }
  }
  if (ls) {
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k === null || keys.has(k)) continue;
      const v = ls.getItem(k);
      if (v === null) continue;
      await kv.set(k, v);
      pushed += 1;
    }
  }
  return { restored, pushed };
}

/** Resolves once every durable write queued so far has landed (tests, and the gate's persistence check). */
export function durableFlushed(): Promise<void> {
  return pending.then(() => undefined);
}

/** Test seam: forget the durable store (back to plain localStorage). */
export function resetStorageForTests(): void {
  durable = null;
  pending = Promise.resolve();
}
