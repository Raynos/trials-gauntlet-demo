/**
 * Service-worker registration (production builds only, never `?harness=1` — main.ts returns
 * before this runs in harness mode — and `?sw=0` opts out). When a newer worker has installed
 * behind a live page, `onUpdate` receives a `reload` thunk: the toast's Reload button posts
 * SKIP_WAITING and the `controllerchange` that follows reloads the page once.
 */
export function registerServiceWorker(onUpdate: (reload: () => void) => void): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // Only a user-requested update may reload the page. `clients.claim()` in a freshly installed
  // worker also fires `controllerchange` on the very first visit (and whenever iOS has evicted
  // the worker) — reloading there is the "loads twice back to back" bug.
  let requested = false;
  const arm = (w: ServiceWorker): void =>
    onUpdate(() => {
      requested = true;
      w.postMessage({ type: 'SKIP_WAITING' });
    });
  const run = async (): Promise<void> => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      if (reg.waiting && navigator.serviceWorker.controller) arm(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) arm(nw);
        });
      });
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing || !requested) return;
        refreshing = true;
        location.reload();
      });
      // Standalone installs live for days: re-check whenever the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void reg.update().catch(() => undefined);
      });
    } catch (e) {
      console.warn('[trials] service worker registration failed', e);
    }
  };
  if (document.readyState === 'complete') void run();
  else window.addEventListener('load', () => void run(), { once: true });
}
