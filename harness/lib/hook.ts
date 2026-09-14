/**
 * Node-side wrapper around `window.__trials`. Each method is one
 * `page.evaluate` round trip; batch work in-page where it matters (replay).
 */
import type { Page } from 'playwright';
import type { HookInfo, InputFrame, PhysicsState, RenderStats } from '../../src/core/types';

export interface OpenGameOptions {
  /** Extra query params (track, hz). */
  query?: Record<string, string>;
  timeoutMs?: number;
}

export interface BootTiming {
  /** ms from navigation start to `window.__trials.ready` observed. */
  bootMs: number;
  /** Navigation timing breakdown from the page. */
  domContentLoadedMs: number;
  loadEventMs: number;
  /** JS heap used (bytes) via CDP Performance.getMetrics. */
  jsHeapUsed: number;
  jsHeapTotal: number;
}

export async function openGame(page: Page, baseUrl: string, options: OpenGameOptions = {}): Promise<BootTiming> {
  const url = new URL(baseUrl);
  url.searchParams.set('harness', '1');
  for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v);
  const t0 = performance.now();
  await page.goto(url.toString(), { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__trials?.ready === true, undefined, {
    timeout: options.timeoutMs ?? 30_000,
  });
  const bootMs = performance.now() - t0;
  const nav = await page.evaluate(() => {
    const e = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return {
      domContentLoadedMs: e ? e.domContentLoadedEventEnd - e.startTime : 0,
      loadEventMs: e ? e.loadEventEnd - e.startTime : 0,
    };
  });
  const heap = await readHeap(page);
  return { bootMs, ...nav, ...heap };
}

export async function readHeap(page: Page): Promise<{ jsHeapUsed: number; jsHeapTotal: number }> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Performance.enable');
    const { metrics } = await cdp.send('Performance.getMetrics');
    const get = (name: string): number => metrics.find((m) => m.name === name)?.value ?? 0;
    return { jsHeapUsed: get('JSHeapUsedSize'), jsHeapTotal: get('JSHeapTotalSize') };
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

export class HookClient {
  constructor(readonly page: Page) {}

  info(): Promise<HookInfo> {
    return this.page.evaluate(() => window.__trials!.info());
  }

  loadTrack(id: string, seed?: number): Promise<boolean> {
    return this.page.evaluate(([i, s]) => window.__trials!.loadTrack(i, s), [id, seed] as const);
  }

  step(n: number): Promise<number> {
    return this.page.evaluate((k) => window.__trials!.step(k), n);
  }

  setInput(frame: Partial<InputFrame>): Promise<void> {
    return this.page.evaluate((f) => window.__trials!.setInput(f), frame);
  }

  getState(): Promise<PhysicsState> {
    return this.page.evaluate(() => window.__trials!.getState());
  }

  hashState(): Promise<string> {
    return this.page.evaluate(() => window.__trials!.hashState());
  }

  finishTime(): Promise<number | null> {
    return this.page.evaluate(() => window.__trials!.finishTime());
  }

  render(sync = false): Promise<number> {
    return this.page.evaluate((s) => window.__trials!.render(s), sync);
  }

  stats(): Promise<RenderStats> {
    return this.page.evaluate(() => window.__trials!.stats());
  }

  resize(w: number, h: number): Promise<void> {
    return this.page.evaluate(([a, b]) => window.__trials!.resize(a, b), [w, h] as const);
  }

  restart(): Promise<void> {
    return this.page.evaluate(() => window.__trials!.restart());
  }

  listTracks(): Promise<string[]> {
    return this.page.evaluate(() => window.__trials!.listTracks());
  }

  /** Run a whole recording in one round trip. */
  runRecording(json: string): Promise<{ state: PhysicsState; hash: string; wallMs: number }> {
    return this.page.evaluate((j) => {
      const t0 = performance.now();
      const state = window.__trials!.runRecording(j);
      return { state, hash: window.__trials!.hashState(), wallMs: performance.now() - t0 };
    }, json);
  }
}
