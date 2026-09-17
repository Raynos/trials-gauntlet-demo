/**
 * The boot plan (docs/tasks/loading-progress-invariant.md §4):
 *
 *   > Progress is the boot sequence's own declaration of work done over work declared, and the
 *   > loader can only display it.
 *
 * Two fractions, each monotone by construction and each exactly 1 on `done()` by arithmetic:
 *
 *   setup    = Σ weight(step) × fraction(step) / Σ weight(step)      over BOOT_STEPS (steps.ts)
 *   download = Σ min(read(src), total(src)) / Σ total(src)           over BYTE_SOURCES (steps.ts)
 *
 * A step's fraction is 1 when its `work()` resolved (finishing IS reporting); while running it is
 * `done / (total + 1)` of its sub-progress — the step's work is its `total` units PLUS its completion,
 * so a running step can report every unit and still not read complete (no "100 % but not done");
 * 0 before it starts. Sub-progress is clamped and monotone within the step. A byte source's `read` grows only by the deltas the reader
 * that reads the bytes adds (`reader(key).add(n)`), and is set to `total` by the completion of the
 * step that awaited it (`closedBy(key)`). `done()` requires every step complete, so both
 * sums are Σx/Σx = 1 exactly — there is no reclassification, cap, timer or "need" flag anywhere.
 *
 * Exhaustiveness is static: `Plan<Remaining>` loses each key as `step()` runs it, and `done` is
 * typed `never` until `Remaining` is `never` — a step dropped from `main.ts` is a compile error.
 * Duplicates, unknown keys and a `steps()` delegate that skipped a key throw at runtime (the
 * property test in plan.test.ts covers those and the monotonicity over random event sequences).
 *
 * Shared by the ≤ 8 KB inline loader (steps `core`, `evaluate`) and `main.ts` (the rest): keep it
 * small and dependency-free.
 */
import { AFTER_LABELS, BOOT_STEPS, BYTE_SOURCES, STEP_INFO, byteLabel, closedBy, type AfterKey, type BootStep, type ByteKey } from './steps';

/** Sub-progress of one step, bound to that step: reports after the step completed are ignored. */
export interface StepProgress {
  /** Progress in the step's own unit; the step's contribution becomes max(previous, done / (total + 1)) — completion is the last unit. */
  set(done: number, total: number, detail?: string): void;
  /** The live detail line for this step (a job name, a program count). */
  detail(text: string): void;
}

/** The byte counter a reader drives: it adds what it just read, nothing else. */
export interface ByteProgress {
  add(n: number): void;
}

export interface LogRow {
  key: BootStep;
  label: string;
  state: 'todo' | 'on' | 'ok';
  /** Wall ms of the step (running: so far). */
  ms: number;
  detail: string;
  /** The step's contribution 0..1 (1 only once complete). */
  fraction: number;
  /** Reported sub-progress 0..1 as the step stated it (for the "· 41 %" detail); 1 once complete. */
  sub: number;
}

export interface AfterItem {
  key: AfterKey;
  label: string;
  done: number;
  total: number;
}

/** What the loader renders — and all it can render. Integers where the screen shows integers are the renderer's job (`Math.round(× 100)`). */
export interface ProgressView {
  /** 0..1, non-decreasing across every view the sink receives; 1 on `done()`. */
  download: number;
  /** 0..1, non-decreasing; < 1 until the last step completes; 1 on `done()`. */
  setup: number;
  done: boolean;
  error: string | null;
  /** The running step (the most recently started), or the last completed one. */
  step: BootStep;
  label: string;
  detail: string;
  /** DOWNLOAD's live line: the source most recently read, its bytes so far and its declared total. */
  bytes: { key: ByteKey; label: string; done: number; total: number } | null;
  bytesTotal: number;
  doneCount: number;
  rows: LogRow[];
  after: AfterItem[];
}

export type Sink = (view: ProgressView) => void;

/** Runs steps from a fixed key set — what the renderer's `prepare()` receives (it can run only those keys). */
export type StepRunner<K extends BootStep> = <J extends K, T>(key: J, work: (p: StepProgress) => T | Promise<T>) => Promise<T>;

/**
 * A plan with `R` steps still to run. `step()` returns the plan minus that key (and the work's
 * value); `done` becomes callable only when nothing remains.
 */
export interface Plan<R extends BootStep> {
  step<K extends R, T>(key: K, work: (p: StepProgress) => T | Promise<T>): Promise<Plan<Exclude<R, K>> & { readonly value: T }>;
  /** The byte counter for a source; hand it to the code that reads the bytes. */
  reader(key: ByteKey): ByteProgress;
  /** Background item progress: rendered under "streams in after start", never part of a fraction. */
  after(key: AfterKey, done: number, total: number): void;
  /** Startup failed: the view carries the message (the renderer shows it with Retry). */
  fail(message: string): void;
  /** Everything ran: both fractions are 1, the view is `done`. Callable only on the exhausted plan type. */
  readonly done: [R] extends [never] ? () => void : never;
  /** The last view published (tests, the module hand-off). */
  readonly view: ProgressView;
  /** Phantom: the remaining keys, so `R` infers through a `Plan<R>` argument (`delegate`). Never set at runtime. */
  readonly remaining?: R;
}

export interface PlanOptions {
  /** Declared byte totals per source (known before the first byte; a source with 0 is not in the number). */
  totals: Readonly<Record<ByteKey, number>>;
  now?: () => number;
}

interface StepState {
  state: 'todo' | 'on' | 'ok';
  fraction: number;
  sub: number;
  detail: string;
  t0: number;
  ms: number;
}

const clamp01 = (x: number): number => (x > 1 ? 1 : x > 0 ? x : 0);

export function createBootPlan(sink: Sink, options: PlanOptions): Plan<BootStep> {
  const now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const steps = new Map<BootStep, StepState>();
  for (const k of BOOT_STEPS) steps.set(k, { state: 'todo', fraction: 0, sub: 0, detail: '', t0: 0, ms: 0 });
  const sources = new Map<ByteKey, { total: number; read: number; closed: boolean }>();
  for (const k of BYTE_SOURCES) sources.set(k, { total: Math.max(0, options.totals[k] || 0), read: 0, closed: false });
  const after = new Map<AfterKey, AfterItem>();
  let lastRead: ByteKey | null = null;
  let current: BootStep = BOOT_STEPS[0]!;
  let error: string | null = null;
  let finished = false;
  let shownDownload = 0;
  let shownSetup = 0;
  let view!: ProgressView;

  const weightTotal = BOOT_STEPS.reduce((n, k) => n + STEP_INFO[k].weight, 0);

  /** What a source has read, credited: its total once closed, else min(read, total). */
  const credited = (s: { total: number; read: number; closed: boolean }): number => (s.closed ? s.total : Math.min(s.read, s.total));

  function publish(): void {
    const t = now();
    let acc = 0;
    let doneCount = 0;
    const rows: LogRow[] = BOOT_STEPS.map((k) => {
      const s = steps.get(k)!;
      const ok = s.state === 'ok';
      if (ok) doneCount++;
      acc += STEP_INFO[k].weight * (ok ? 1 : s.state === 'on' ? s.fraction : 0);
      return { key: k, label: STEP_INFO[k].label, state: s.state, ms: s.state === 'on' ? t - s.t0 : s.ms, detail: s.detail, fraction: ok ? 1 : s.fraction, sub: ok ? 1 : s.sub };
    });
    let read = 0;
    let total = 0;
    for (const s of sources.values()) {
      if (s.total <= 0) continue;
      total += s.total;
      read += credited(s);
    }
    // setup = Σ w·f / Σ w; download = Σ credited / Σ total. Both non-decreasing for every legal event; the
    // max() is the assertion that no future edit can make the screen run backwards.
    shownSetup = Math.max(shownSetup, weightTotal > 0 ? acc / weightTotal : 1);
    shownDownload = Math.max(shownDownload, total > 0 ? read / total : 1);
    const last = lastRead ? sources.get(lastRead)! : null;
    view = {
      download: shownDownload,
      setup: shownSetup,
      done: finished,
      error,
      step: current,
      label: STEP_INFO[current].label,
      detail: steps.get(current)!.detail,
      bytes: lastRead && last ? { key: lastRead, label: byteLabel(lastRead), done: credited(last), total: last.total } : null,
      bytesTotal: total,
      doneCount,
      rows,
      after: [...after.values()],
    };
    sink(view);
  }

  function progressFor(key: BootStep): StepProgress {
    const s = steps.get(key)!;
    return {
      set(done, total, detail) {
        if (s.state !== 'on') return;
        if (total > 0 && Number.isFinite(total) && Number.isFinite(done)) {
          const d = Math.min(Math.max(0, done), total);
          s.sub = Math.max(s.sub, d / total);
          s.fraction = Math.max(s.fraction, clamp01(d / (total + 1)));
        }
        if (detail !== undefined) s.detail = detail;
        publish();
      },
      detail(text) {
        if (s.state !== 'on') return;
        s.detail = text;
        publish();
      },
    };
  }

  async function run<T>(key: BootStep, work: (p: StepProgress) => T | Promise<T>): Promise<T> {
    const s = steps.get(key);
    if (!s || s.state !== 'todo' || finished) throw new Error(`boot plan: ${key} ${!s ? 'unknown' : finished ? 'after done()' : 'already ' + s.state}`);
    s.state = 'on';
    s.t0 = now();
    current = key;
    publish();
    const value = await work(progressFor(key));
    s.state = 'ok';
    s.fraction = 1;
    s.sub = 1;
    s.ms = now() - s.t0;
    for (const bk of BYTE_SOURCES) if (closedBy(bk) === key) sources.get(bk)!.closed = true;
    publish();
    return value;
  }

  // The plan after a step: the same api (prototype) carrying the work's value — `view` stays live.
  const next = (value: unknown): Plan<BootStep> & { value: unknown } => Object.assign(Object.create(api) as Plan<BootStep> & { value: unknown }, { value });
  const api = {
    async step(key: BootStep, work: (p: StepProgress) => unknown) {
      const value = await run(key, work);
      return next(value);
    },
    reader(key: ByteKey): ByteProgress {
      const s = sources.get(key)!;
      return {
        add(n) {
          if (!(n > 0) || s.closed) return;
          s.read += n;
          lastRead = key;
          publish();
        },
      };
    },
    after(key: AfterKey, done: number, total: number) {
      after.set(key, { key, label: AFTER_LABELS[key], done: Math.max(0, done), total: Math.max(0, total) });
      publish();
    },
    fail(message: string) {
      error = message;
      publish();
    },
    done() {
      if (finished) return;
      const missed = BOOT_STEPS.filter((k) => steps.get(k)!.state !== 'ok');
      if (missed.length) throw new Error(`boot plan: ${missed.join(',')} not complete`);
      finished = true;
      publish();
      // Arithmetic, not policy: Σw·1/Σw and ΣT/ΣT. The throw is the assertion that this file's math was not edited into a lie.
      if (view.download !== 1 || view.setup !== 1) throw new Error('boot plan: done() not at 1/1');
    },
    get view(): ProgressView {
      return view;
    },
  };
  publish();
  return api as unknown as Plan<BootStep>;
}

/**
 * Delegate a fixed set of steps to `body` (the renderer's `prepare()`): the runner it receives accepts
 * exactly those keys, and every one must have completed when `body` resolves (throws otherwise). Built on
 * the public `step()` so the plan's type loses the keys statically in the caller; only `main.ts` uses it
 * (the inline loader bundle tree-shakes it away).
 */
export async function delegate<R extends BootStep, KS extends readonly R[], T>(plan: Plan<R>, keys: KS, body: (run: StepRunner<KS[number]>) => Promise<T>): Promise<Plan<Exclude<R, KS[number]>> & { readonly value: T }> {
  const allowed = new Set<BootStep>(keys);
  const loose = plan as unknown as Plan<BootStep>;
  const run: StepRunner<KS[number]> = async (key, work) => {
    if (!allowed.has(key)) throw new Error(`boot plan: ${key} outside [${keys.join(',')}]`);
    return (await loose.step(key, work)).value;
  };
  const value = await body(run);
  const missed = keys.filter((k) => plan.view.rows.find((r) => r.key === k)!.state !== 'ok');
  if (missed.length) throw new Error(`boot plan: without completing ${missed.join(',')}`);
  return Object.assign(Object.create(plan) as Plan<Exclude<R, KS[number]>>, { value }) as Plan<Exclude<R, KS[number]>> & { readonly value: T };
}

/** Byte size for the screen: `729 KB`, `1.29 MB`. */
export function formatBytes(b: number): string {
  return b >= 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${Math.round(b / 1024)} KB`;
}
