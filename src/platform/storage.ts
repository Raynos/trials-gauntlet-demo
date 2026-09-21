/** Explicit synchronous storage boundary. Web keeps its existing localStorage semantics. */
let installed: Storage | null = null;

export function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function getStorage(): Storage | null {
  return installed ?? browserStorage();
}

/** Native bootstrap installs its hydrated mirror before constructing game/UI objects. */
export function installStorage(storage: Storage): () => void {
  const previous = installed;
  installed = storage;
  return () => { if (installed === storage) installed = previous; };
}

/** Wait for pending native saves before restarting the installed bundle. Web needs no async flush. */
export async function flushStorage(): Promise<void> {
  const storage = installed as (Storage & { flush?(): Promise<void> }) | null;
  await storage?.flush?.();
}
