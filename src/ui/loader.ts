/**
 * Boot-progress bridge to the inline loader in index.html (docs/design/game.md §12).
 *
 * The loader paints with the first HTML bytes, streams the core bundle with
 * byte counting, then inserts the entry module. From there `main.ts` reports
 * named steps through `window.__loader`; every step yields to the event loop
 * (`nextPaint`) so the loader repaints between CPU-heavy pieces of startup and
 * the long-task observer in the page can attribute any freeze to a step.
 * Absent loader (tests, harness) → no-ops.
 */
export interface Loader {
  /** Number of steps to expect (drives the boot part of the bar). */
  plan(n: number): void;
  /** Start a named step; the previous one is marked done with its wall ms. */
  step(name: string): void;
  /** Numeric progress inside a step; `unit` 'B' formats as KB / MB. */
  progress(name: string, done: number, total: number, unit?: string): void;
  /** Everything the title needs is ready: crossfade the loader away. */
  done(): void;
  /** Show the error and a Retry button (never a blank page). */
  fail(message: string): void;
  longTasks?: Array<{ t: number; ms: number; step: string | null }>;
}

const NOOP: Loader = { plan() {}, step() {}, progress() {}, done() {}, fail() {} };

export function getLoader(): Loader {
  const l = (globalThis as { __loader?: Partial<Loader> }).__loader;
  return l && typeof l.step === 'function' ? { ...NOOP, ...l } as Loader : NOOP;
}

/** Resolve after the browser has had a chance to paint (rAF, then a macrotask). */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') return void setTimeout(resolve, 0);
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

/**
 * Fetch a URL through a ReadableStream, reporting bytes as they arrive (the
 * browser cache keeps the body, so the later `<img>` / CSS use is a hit).
 * Resolves with the byte count; never throws (a miss just means no prefetch).
 */
export async function streamBytes(url: string, onBytes: (done: number, total: number) => void, expectedBytes = 0): Promise<number> {
  try {
    const res = await fetch(url);
    if (!res.ok) return 0;
    const len = Number(res.headers.get('content-length')) || 0;
    const total = len && !res.headers.get('content-encoding') ? len : expectedBytes || len;
    if (!res.body) {
      const buf = await res.arrayBuffer();
      onBytes(buf.byteLength, total || buf.byteLength);
      return buf.byteLength;
    }
    const reader = res.body.getReader();
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.byteLength;
      onBytes(got, Math.max(total, got));
    }
    onBytes(got, got);
    return got;
  } catch {
    return 0;
  }
}

/** Fonts declared by the injected stylesheet: resolve when loaded (or after `timeoutMs`). */
export function fontsReady(timeoutMs = 4000): Promise<void> {
  const f = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
  if (!f) return Promise.resolve();
  return Promise.race([f.ready.then(() => undefined), new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}
