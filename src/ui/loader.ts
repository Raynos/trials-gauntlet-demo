/**
 * `nextPaint`: resolve after the browser has had a chance to paint (rAF, then a macrotask). The boot
 * (`main.ts`) awaits it at the start of every plan step so the loading screen paints the step before
 * the step's CPU work. The loader's old string api (`step(name)`, `progress(name, …)`, `plan(n)`,
 * `getLoader`, `window.__loader`) is gone: progress is the boot plan's declaration, `src/boot/plan.ts`.
 */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(resolve, 0));
    else setTimeout(resolve, 0);
  });
}
