/**
 * The "new build" pill (ask 84; ported from wildshard's Update.ts). A home-screen install on iOS has no
 * address bar and no pull-to-reload, and iOS can keep the page alive for days, so a build that went live
 * while the app was open was invisible until iOS evicted it. With continuous deployment that is every push.
 *
 *   check   `./version.json?t=…` with `cache: 'no-store'` (network-only in the worker, no-store on the host)
 *           once when the boot is done, whenever the page becomes visible again, and every 5 min while it
 *           is visible. A `build` that differs from the running `__BUILD_ID__` lights the pill; a failed or
 *           offline fetch keeps it dark and says nothing.
 *   show    ONLY while a front screen (menu, world map, garage, settings, credits, review list) is up: never
 *           on the loading screen, never under a run, a pause, results or a replay, so no riding touch can
 *           land on it. A run in progress when the build lands sees it the next time it is on a menu.
 *   tap     a waiting worker is adopted through the boot's own hand-over (`handOver`, src/boot/sw.ts:
 *           SKIP_WAITING → controllerchange → reload); if the worker has not found the build yet it is asked to
 *           (`reg.update()`, capped). No worker, or nothing lands in time: a cache-busted reload, and the
 *           loading screen's worker check (`swBoot`) adopts the new build before the bars move.
 *
 * Self-contained styles in the brand colours (a deep-teal pill with the cream word and a vermilion pulse,
 * the menu stamp's family), top-centre where no screen puts a control, ≥ 44 px tall.
 */
import { handOver } from '../boot/sw';

declare const __BUILD_ID__: string | undefined;

/** The server's build when it differs from the running one; null when equal, missing or malformed. */
export function newerBuild(running: string, body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = (body as { build?: unknown }).build;
  if (typeof b !== 'string' || b === '' || b === running) return null;
  return b;
}

/** A front screen (`#ui .screen.show`) is up and nothing covers it: no loading screen, crash sheet or review sheet. */
export function pillAllowed(doc: Document): boolean {
  if (doc.getElementById('loader') || doc.getElementById('crash')) return false;
  if (doc.querySelector('.inbox.show')) return false;
  return !!doc.querySelector('#ui .screen.show');
}

const CSS = /* css */ `
.update-pill { position: fixed; z-index: 50; left: 50%; top: calc(var(--s3, 12px) + var(--sat, env(safe-area-inset-top, 0px)));
  transform: translate(-50%, -8px); display: inline-flex; align-items: center; gap: .6em; min-height: 44px; padding: 0 1.5em 0 1em; border: 0; margin: 0;
  border-radius: 999px; background: rgba(10,58,63,.94); box-shadow: inset 0 0 0 1px rgba(239,227,200,.34), 0 4px 14px rgba(0,0,0,.4); color: #EFE3C8;
  font: 800 .74rem/1 var(--sans, "Rockhop Sans", "Archivo", "Helvetica Neue", Arial, system-ui, sans-serif); letter-spacing: .16em; text-transform: uppercase; white-space: nowrap;
  cursor: pointer; pointer-events: auto; touch-action: manipulation; -webkit-tap-highlight-color: transparent;
  opacity: 0; visibility: hidden; transition: opacity var(--t2, 240ms) var(--ease, ease), transform var(--t2, 240ms) var(--ease, ease), visibility 0s linear var(--t2, 240ms); }
.update-pill.on { opacity: 1; visibility: visible; transform: translate(-50%, 0); transition: opacity var(--t2, 240ms) var(--ease, ease), transform var(--t2, 240ms) var(--ease, ease), visibility 0s; }
.update-pill .dot { width: .6em; height: .6em; border-radius: 50%; background: #E4572E; box-shadow: 0 0 0 0 rgba(228,87,46,.6); animation: update-pulse 1.6s var(--ease, ease) infinite; flex: 0 0 auto; }
.update-pill b { color: #fff; font-weight: 800; }
.update-pill small { font-size: .78em; letter-spacing: .12em; color: rgba(239,227,200,.6); font-variant-numeric: tabular-nums; }
.update-pill:hover, .update-pill:focus-visible { background: #0F5C63; outline: none; box-shadow: inset 0 0 0 2px #EFE3C8, 0 4px 14px rgba(0,0,0,.4); }
.update-pill:active { transform: translate(-50%, 1px); }
.update-pill[aria-busy="true"] .dot { animation-duration: .5s; background: #EFE3C8; }
@keyframes update-pulse { 0% { box-shadow: 0 0 0 0 rgba(228,87,46,.6); } 70% { box-shadow: 0 0 0 .6em rgba(228,87,46,0); } 100% { box-shadow: 0 0 0 0 rgba(228,87,46,0); } }
@media (prefers-reduced-motion: reduce) { .update-pill .dot { animation: none; } }
`;

const CHECK_EVERY_MS = 5 * 60 * 1000;
/** How long a tap waits for the worker to find / install the new build before falling back to a plain reload. */
const ADOPT_CAP_MS = 6000;

type UpdateWindow = Window & { __rockhopUpdate?: { check(): Promise<void>; state(): { running: string; server: string | null; shown: boolean } } };

/** A cache-busted reload of this page (keeps every other query parameter). */
function bust(): void {
  const url = new URL(location.href);
  url.searchParams.set('b', Date.now().toString(36));
  location.replace(url.toString());
}

const within = <T>(p: Promise<T>, ms: number): Promise<T | undefined> => Promise.race([p, new Promise<undefined>((r) => setTimeout(r, ms))]);

/** The worker `reg` is installing, once it is installed (waiting); undefined when it fails or the cap passes. */
function installed(w: ServiceWorker | null, ms: number): Promise<ServiceWorker | undefined> {
  if (!w) return Promise.resolve(undefined);
  return within(
    new Promise<ServiceWorker | undefined>((resolve) => {
      const on = (): void => {
        if (w.state === 'installed') resolve(w);
        else if (w.state === 'redundant') resolve(undefined);
      };
      w.addEventListener('statechange', on);
      on();
    }),
    ms,
  );
}

/** Tap: adopt the new build's worker through the boot's hand-over, else reload with a cache-bust. */
async function applyUpdate(): Promise<void> {
  const sw = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  try {
    const reg = sw?.controller ? await sw.getRegistration() : undefined;
    if (sw && reg) {
      if (!reg.waiting) await within(reg.update().catch(() => undefined), ADOPT_CAP_MS);
      const w = reg.waiting ?? (await installed(reg.installing, ADOPT_CAP_MS));
      if (w) {
        handOver(sw, w);
        setTimeout(bust, ADOPT_CAP_MS); // the hand-over never landed: reload anyway, the boot adopts it
        return;
      }
    }
  } catch {
    /* fall through to the plain reload */
  }
  bust();
}

/**
 * Mount the pill and start checking. Call once, after the boot is done (main.ts), outside `?harness=1`.
 * Idempotent.
 */
export function installUpdatePill(): void {
  const w = window as UpdateWindow;
  if (w.__rockhopUpdate) return;
  const running = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
  let server: string | null = null;
  let shown = false;
  let busy = false;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'update-pill';
  pill.setAttribute('aria-live', 'polite');
  pill.tabIndex = -1;
  pill.innerHTML = `<span class="dot"></span><span class="t"><b>New build</b> · tap to update</span><small></small>`;
  document.body.appendChild(pill);

  const sync = (): void => {
    const on = !!server && (busy || pillAllowed(document));
    if (on === shown) return;
    shown = on;
    pill.classList.toggle('on', on);
    pill.tabIndex = on ? 0 : -1;
  };
  pill.addEventListener('click', () => {
    if (!shown || busy) return;
    busy = true;
    pill.setAttribute('aria-busy', 'true');
    pill.querySelector('.t')!.textContent = 'Updating…';
    void applyUpdate();
  });

  // Visibility follows the screens. A 400 ms poll, started only once a newer build is known: a MutationObserver
  // on #ui would run on every HUD class flip of every ridden frame for a pill that is almost never lit.
  let poll = 0;
  const light = (build: string): void => {
    server = build;
    pill.querySelector('small')!.textContent = build.slice(0, 7);
    sync();
    if (!poll) poll = window.setInterval(sync, 400);
  };

  const check = async (): Promise<void> => {
    if (server || document.hidden) return;
    try {
      const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const b = newerBuild(running, await r.json());
      if (b) light(b);
    } catch {
      /* offline or a failed fetch: stay dark, say nothing */
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void check();
  });
  window.setInterval(() => void check(), CHECK_EVERY_MS);
  w.__rockhopUpdate = { check, state: () => ({ running, server, shown }) };
  void check();
}
