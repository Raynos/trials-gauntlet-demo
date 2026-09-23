/**
 * The inline loader (index.html `<script id="boot">`, bundled here by vite.config.ts `trials:load-manifest`,
 * ≤ 8 KB). It paints the Odometer with the first HTML bytes, creates THE boot plan, streams the core
 * bundle as step `core` (bytes counted by this reader, against the byte total the build compiled in),
 * starts step `evaluate` and inserts the entry module, which takes the plan over (`./handoff.ts`).
 *
 *   __BOOT_CORE__    the manifest's core files (entry, three, CSS, fonts): compiled in by the build; [] in dev
 *   __BOOT_TOTALS__  declared bytes of the hero models and the boot art set (= src/boot/totals.ts, computed by the build)
 *   __BOOT_BUILD__   the build sha for the badge (the build fails rather than stamping `dev`)
 */
import { createBootPlan } from './plan';
import { createLoaderRenderer } from './render';
import { streamBytes } from './stream';
import { swBoot } from './sw';
import type { BootWindow } from './handoff';
import type { DeclaredBootTotals } from './asset-totals';
import { selectedBootTotals } from './outfit';

declare const __BOOT_CORE__: [path: string, bytes: number][];
declare const __BOOT_TOTALS__: DeclaredBootTotals;
declare const __BOOT_BUILD__: string;
/** Production web builds only: dev has no `sw.js` and a stale worker there would serve yesterday's bundle; a store build (`VITE_STORE=1`) ships none. */
declare const __BOOT_SW__: boolean;
/** The `?harness=1` route (src/core/release.ts `AUTOMATION_HOOK`): every build but a store release. */
declare const __BOOT_HOOK__: boolean;

(function boot(): void {
  const root = document.getElementById('loader');
  if (!root) return;
  const entry = root.getAttribute('data-entry') || '/src/main.ts';
  const insertEntry = (onError: (m: string) => void): void => {
    const s = document.createElement('script');
    s.type = 'module';
    s.src = entry;
    s.onerror = () => onError(`Could not load ${entry}`);
    document.head.appendChild(s);
  };
  // The harness owns the clock and expects the hook at once: no loader in its way, no plan.
  if (__BOOT_HOOK__ && /[?&]harness=1/.test(location.search)) {
    root.remove();
    insertEntry(() => undefined);
    return;
  }

  const core = __BOOT_CORE__;
  const coreTotal = core.reduce((sum, item) => sum + item[1], 0);
  const plan = createBootPlan(createLoaderRenderer(root, __BOOT_BUILD__).paint, { totals: { core: coreTotal, ...selectedBootTotals(__BOOT_TOTALS__) } });
  const fail = (m: string): void => {
    // Keep the offline cause visible alongside the underlying load error.
    if (!plan.view.done && !plan.view.error) plan.fail(navigator.onLine ? m : `Offline: ${m}`);
  };
  root.querySelector<HTMLButtonElement>('.err button')!.onclick = () => location.reload();
  addEventListener('error', (e) => {
    if (e.message) fail(e.message);
  });
  addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    fail(String(e.reason));
  });

  const reader = plan.reader('core');
  // Four in flight, in manifest order; every chunk is counted by the reader that read it.
  let idx = 0;
  const worker = async (): Promise<void> => {
    while (idx < core.length) {
      const item = core[idx++]!;
      await streamBytes(item[0], reader.add, item[1]);
    }
  };

  plan
    // The worker first, capped: it must control this page before the boot asks for its 27 MB, or the
    // first visit caches nothing and offline needs a second visit (docs/plans/PWA_OFFLINE.md §1.2.1).
    .step('core', () => (__BOOT_SW__ ? swBoot(true) : Promise.resolve()).then(() => Promise.all([worker(), worker(), worker(), worker()])))
    .then((afterCore) => {
      let release!: () => void;
      const evaluated = afterCore.step('evaluate', () => new Promise<void>((r) => (release = r)));
      evaluated.catch(() => undefined);
      (window as BootWindow).__boot = {
        take: () => {
          release();
          return evaluated;
        },
      };
      insertEntry(fail);
    })
    .catch((e: unknown) => fail(String(e)));
})();
