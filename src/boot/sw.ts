/**
 * The service worker, driven from the first line of the loading screen (bundled into the ≤ 8 KB
 * inline loader, so every byte here is spent on purpose).
 *
 * Two jobs, both before the bars move:
 *
 *  1. **Be in control before the boot asks for 27 MB.** Registering at the tail of `front`
 *     (where this used to live) let install/activate/`clients.claim()` land after the 14 hero GLBs
 *     had already been requested, so the first visit cached 4 MB and 0 models and the player needed
 *     a *second* online visit before offline worked. Registering here and waiting (briefly, capped)
 *     for control means every byte the boot streams passes through the worker's `cacheFirst`.
 *
 *  2. **Take the new build now, not with a toast.** If a newer worker is waiting, it is activated
 *     and the page reloads immediately — the player sees one loading screen and comes up on the new
 *     build. The caches are split so that reload costs only what actually changed (src/pwa/sw.js).
 *     There is no update toast and no mid-session reload.
 *
 * The boot is never held hostage: everything here races a `CAP_MS` timeout, and any failure resolves.
 */

/** The longest the loading screen waits for the worker to take control (or to hand over to a new build). */
const CAP_MS = 2500;

export function swBoot(enabled: boolean): Promise<void> {
  const sw = typeof navigator === 'undefined' ? null : navigator.serviceWorker;
  if (!enabled || !sw || /[?&]sw=0/.test(location.search)) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let timer = setTimeout(resolve, CAP_MS);
    const done = (): void => {
      clearTimeout(timer);
      resolve();
    };
    /** A newer build is installed: activate it and come up on it, instead of booting the old one. */
    const adopt = (w: ServiceWorker | null): void => {
      if (!w) return done();
      clearTimeout(timer);
      timer = setTimeout(resolve, CAP_MS); // …unless the hand-over never lands: then boot what we have
      sw.addEventListener('controllerchange', () => location.reload(), { once: true });
      w.postMessage({ type: 'SKIP_WAITING' });
    };
    void sw.register('./sw.js', { scope: './' }).then(async (reg) => {
      // Standalone installs live for days: keep discovering updates so the next launch adopts one for free.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void reg.update().catch(() => undefined);
      });
      // First visit (or an evicted worker): wait for `clients.claim()`, so the boot's own bytes are cached.
      if (!sw.controller) return sw.addEventListener('controllerchange', done, { once: true });
      await reg.update().catch(() => undefined);
      const inst = reg.installing;
      if (reg.waiting || !inst) return adopt(reg.waiting);
      inst.addEventListener('statechange', () => {
        if (inst.state === 'installed') adopt(reg.waiting ?? inst);
        else if (inst.state !== 'installing') done();
      });
    }, done);
  });
}
