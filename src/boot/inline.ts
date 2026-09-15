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
import type { BootWindow } from './handoff';

declare const __BOOT_CORE__: { path: string; bytes: number }[];
declare const __BOOT_TOTALS__: { heroModels: number; bootArt: number };
declare const __BOOT_BUILD__: string;

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
  if (/[?&]harness=1/.test(location.search)) {
    root.remove();
    insertEntry(() => undefined);
    return;
  }

  const core = __BOOT_CORE__;
  let coreTotal = 0;
  for (const i of core) coreTotal += i.bytes;
  const renderer = createLoaderRenderer(root, __BOOT_BUILD__);
  const plan = createBootPlan(renderer.paint, { totals: { core: coreTotal, heroModels: __BOOT_TOTALS__.heroModels, bootArt: __BOOT_TOTALS__.bootArt } });
  let failed = false;
  const fail = (m: string): void => {
    if (failed) return;
    failed = true;
    plan.fail(m);
  };
  root.querySelector('.err button')?.addEventListener('click', () => location.reload());
  window.addEventListener('error', (e) => {
    if (!plan.view.done && e.message) fail(`Script error: ${e.message}`);
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    if (!plan.view.done) fail(`Startup failed: ${e.reason?.message ?? e.reason}`);
  });

  const reader = plan.reader('core');
  const streamCore = async (): Promise<void> => {
    // Four in flight, in manifest order; every chunk is counted by the reader that read it.
    let idx = 0;
    const worker = async (): Promise<void> => {
      while (idx < core.length) {
        const item = core[idx++]!;
        await streamBytes(item.path, (d) => reader.add(d), item.bytes);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  };

  plan
    .step('core', streamCore)
    .then((afterCore) => {
      let release: () => void = () => undefined;
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
    .catch((e: unknown) => fail(`Download failed: ${e instanceof Error ? e.message : String(e)}`));
})();
