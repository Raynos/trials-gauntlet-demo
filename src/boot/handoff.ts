/**
 * The inline loader → module hand-off. The inline script (index.html, built from `./inline.ts`) creates
 * the plan, runs `core` (streams the bundle) and starts `evaluate` (script parse + evaluate: it ends
 * when `main.ts` takes the plan). `main.ts` continues the SAME plan object: one number, one owner.
 */
import { createBootPlan, type Plan } from './plan';
import type { ModuleStep } from './steps';
import { BOOT_BYTE_TOTALS } from './totals';

export interface BootHandoff {
  /** Ends the `evaluate` step and resolves with the plan minus the inline steps. */
  take(): Promise<Plan<ModuleStep>>;
}

export type BootWindow = Window & { __boot?: BootHandoff };

/**
 * The plan after the inline steps. Without an inline loader (a test page, `main.ts` loaded on its own)
 * a silent plan runs the two inline steps as no-ops, so the boot code is the same either way.
 */
export function takeBootPlan(): Promise<Plan<ModuleStep>> {
  const w = window as BootWindow;
  if (w.__boot) return w.__boot.take();
  const plan = createBootPlan(() => undefined, { totals: { core: 0, ...BOOT_BYTE_TOTALS } });
  return plan.step('core', () => undefined).then((p) => p.step('evaluate', () => undefined));
}
