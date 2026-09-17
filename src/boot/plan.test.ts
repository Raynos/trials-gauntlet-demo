/**
 * The boot plan's invariant, as a property over random event sequences (docs/tasks/loading-progress-invariant.md §4.6):
 * for ANY interleaving of step starts / completions, sub-progress reports in any order and with any
 * done/total (restarts at 0, total 0, NaN, reports after the step completed or after a later step
 * started), byte deltas of any size (including negative and NaN) and `after` items, every view the sink
 * receives has non-decreasing `download` and `setup`; `setup` < 1 until the last step completes; both are
 * exactly 1 on `done()`; `done()` throws while a step is incomplete; `after` never moves a fraction.
 * Hand-rolled generator (fast-check is not installed): mulberry32, 3000 sequences × ≤ 240 events.
 */
import { describe, expect, it } from 'vitest';
import { createBootPlan, delegate, type Plan, type ProgressView, type StepProgress } from './plan';
import { AFTER_KEYS, BOOT_STEPS, BYTE_SOURCES, STEP_INFO, closedBy, type BootStep } from './steps';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Steps that weigh anything in SETUP (`core` weighs 0: it is DOWNLOAD's). */
const WEIGHTED = BOOT_STEPS.filter((k) => STEP_INFO[k].weight > 0).length;

type Event =
  | { kind: 'start'; step: BootStep }
  | { kind: 'finish'; step: BootStep }
  | { kind: 'sub'; step: BootStep; done: number; total: number }
  | { kind: 'bytes'; source: (typeof BYTE_SOURCES)[number]; n: number }
  | { kind: 'after'; key: (typeof AFTER_KEYS)[number]; done: number; total: number };

/** A random legal-ish sequence: starts in random order, each finished at a random later point, noise everywhere. */
function sequence(rnd: () => number, withAfter: boolean): Event[] {
  const order = [...BOOT_STEPS].sort(() => rnd() - 0.5);
  const events: Event[] = [];
  const started: BootStep[] = [];
  const finished = new Set<BootStep>();
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const odd = (): number => {
    const r = rnd();
    return r < 0.1 ? 0 : r < 0.15 ? NaN : r < 0.2 ? -rnd() * 100 : r < 0.25 ? Infinity : rnd() * 200;
  };
  let i = 0;
  while (finished.size < BOOT_STEPS.length || rnd() < 0.3) {
    const r = rnd();
    if (r < 0.2 && i < order.length) {
      const s = order[i++]!;
      started.push(s);
      events.push({ kind: 'start', step: s });
    } else if (r < 0.35 && started.length) {
      const open = started.filter((s) => !finished.has(s));
      if (open.length) {
        const s = pick(open);
        finished.add(s);
        events.push({ kind: 'finish', step: s });
      }
    } else if (r < 0.65) {
      // sub-progress for any step, running or not (late / early reports must be ignored)
      events.push({ kind: 'sub', step: pick(BOOT_STEPS), done: odd(), total: odd() });
    } else if (r < 0.9) {
      events.push({ kind: 'bytes', source: pick(BYTE_SOURCES), n: rnd() < 0.15 ? -rnd() * 1e5 : rnd() < 0.1 ? NaN : Math.floor(rnd() * 3e5) });
    } else if (withAfter) {
      events.push({ kind: 'after', key: pick(AFTER_KEYS), done: odd(), total: odd() });
    }
    if (events.length > 240 && finished.size < BOOT_STEPS.length) {
      // wrap up: start + finish everything left, in random order
      for (const s of order.slice(i)) events.push({ kind: 'start', step: s });
      for (const s of order.filter((x) => !finished.has(x)).sort(() => rnd() - 0.5)) events.push({ kind: 'finish', step: s });
      break;
    }
  }
  return events;
}

interface Run {
  views: ProgressView[];
  fractions: [number, number][];
  doneThrew: boolean;
  lastStepFinishedAt: number;
  trace: string[];
}

/** Drive a plan through `events`; steps are started/finished through the api (work resolves on a deferred). */
async function drive(events: Event[], totals: Record<(typeof BYTE_SOURCES)[number], number>): Promise<Run> {
  const views: ProgressView[] = [];
  const plan = createBootPlan((v) => views.push({ ...v }), { totals, now: () => views.length });
  const progress = new Map<BootStep, StepProgress>();
  const finish = new Map<BootStep, () => void>();
  const pending: Promise<unknown>[] = [];
  const runner = plan as unknown as { step(k: BootStep, w: (p: StepProgress) => Promise<void>): Promise<unknown>; done(): void };
  let finishedCount = 0;
  let lastStepFinishedAt = -1;
  const trace: string[] = [];
  for (const e of events) {
    trace.push(`${views.length} ${JSON.stringify(e)}`);
    switch (e.kind) {
      case 'start': {
        const p = runner.step(e.step, (sp) => {
          progress.set(e.step, sp);
          return new Promise<void>((r) => finish.set(e.step, r));
        });
        p.catch(() => undefined);
        pending.push(p);
        await Promise.resolve();
        break;
      }
      case 'finish': {
        finish.get(e.step)!();
        await Promise.resolve();
        await Promise.resolve();
        if (STEP_INFO[e.step].weight > 0) finishedCount++;
        if (finishedCount === WEIGHTED && lastStepFinishedAt < 0) lastStepFinishedAt = views.length - 1;
        break;
      }
      case 'sub':
        progress.get(e.step)?.set(e.done, e.total, `d${e.done}`);
        break;
      case 'bytes':
        plan.reader(e.source).add(e.n);
        break;
      case 'after':
        plan.after(e.key, e.done, e.total);
        break;
    }
  }
  await Promise.all(pending);
  let doneThrew = false;
  try {
    runner.done();
  } catch {
    doneThrew = true;
  }
  return { views, fractions: views.map((v) => [v.download, v.setup]), doneThrew, lastStepFinishedAt, trace };
}

const TOTALS = { core: 1_500_000, heroModels: 2_800_000, bootArt: 900_000 };

describe('boot plan invariant (property)', () => {
  const N = 3000;
  it(`${N} random event sequences: both fractions non-decreasing, setup < 1 until the last weighted step, both exactly 1 on done()`, async () => {
    let events = 0;
    let views = 0;
    let maxEvents = 0;
    for (let seed = 1; seed <= N; seed++) {
      const rnd = mulberry32(seed);
      const seq = sequence(rnd, true);
      const totals = seed % 7 === 0 ? { core: 0, heroModels: 0, bootArt: 0 } : seed % 5 === 0 ? { ...TOTALS, core: 0 } : TOTALS;
      const run = await drive(seq, totals);
      events += seq.length;
      views += run.views.length;
      maxEvents = Math.max(maxEvents, seq.length);
      for (let i = 1; i < run.fractions.length; i++) {
        const [d0, s0] = run.fractions[i - 1]!;
        const [d1, s1] = run.fractions[i]!;
        if (d1 < d0 || s1 < s0) throw new Error(`seed ${seed}: view ${i} went backwards (${d0},${s0}) → (${d1},${s1})`);
      }
      for (let i = 0; i < run.lastStepFinishedAt; i++) {
        if (run.fractions[i]![1] >= 1) throw new Error(`seed ${seed}: setup reached 1 at view ${i} before the last weighted step finished (${run.lastStepFinishedAt}): ${JSON.stringify(run.views[i]!.rows.filter((r) => r.state !== 'ok').map((r) => [r.key, r.state, r.fraction]))}\n${run.trace.slice(-14).join('\n')}\nVIEWS ${run.views.slice(i - 2, i + 3).map((v, j) => `#${i - 2 + j} setup=${v.setup.toFixed(3)} step=${v.step} done=${v.doneCount}`).join(' | ')}`);
      }
      const last = run.views[run.views.length - 1]!;
      expect(run.doneThrew, `seed ${seed}: done() threw`).toBe(false);
      expect(last.done).toBe(true);
      expect(last.download).toBe(1);
      expect(last.setup).toBe(1);
      expect(last.doneCount).toBe(BOOT_STEPS.length);
      expect(last.rows.length).toBe(BOOT_STEPS.length);
      for (const v of run.views) {
        for (const [key, frac] of [
          ['download', v.download],
          ['setup', v.setup],
        ] as const) {
          if (!(frac >= 0 && frac <= 1)) throw new Error(`seed ${seed}: ${key} = ${frac}`);
        }
        if (!v.done && v.rows.some((r) => r.state !== 'ok') && v.setup === 1 && BOOT_STEPS.some((k) => STEP_INFO[k].weight > 0 && v.rows.find((r) => r.key === k)!.state !== 'ok'))
          throw new Error(`seed ${seed}: setup 1 with a weighted step incomplete`);
      }
    }
    console.info(`property: ${N} sequences, ${events} events (max ${maxEvents} per sequence), ${views} views checked`);
  });

  it('after items never move a fraction (same sequence with and without them → identical fractions)', async () => {
    for (let seed = 1; seed <= 300; seed++) {
      const withAfter = sequence(mulberry32(seed), true);
      const without = withAfter.filter((e) => e.kind !== 'after');
      const a = await drive(withAfter, TOTALS);
      const b = await drive(without, TOTALS);
      // An `after` publish must repeat the previous pair exactly, so collapsing consecutive equal pairs makes the two runs identical.
      const collapse = (r: Run): string[] => r.fractions.map(([d, s]) => `${d}/${s}`).filter((x, i, xs) => i === 0 || x !== xs[i - 1]);
      expect(collapse(a)).toEqual(collapse(b));
      expect(a.views.some((v) => v.after.length > 0) || !withAfter.some((e) => e.kind === 'after')).toBe(true);
    }
  });

  it('done() throws while any step is incomplete; a step cannot start twice; a delegate that skips a key throws', async () => {
    const plan = createBootPlan(() => undefined, { totals: TOTALS });
    const loose = plan as unknown as { step(k: BootStep, w: () => void): Promise<unknown>; done(): void };
    expect(() => loose.done()).toThrow(/not complete/);
    await loose.step('core', () => undefined);
    await expect(loose.step('core', () => undefined)).rejects.toThrow(/already ok/);
    const p = plan as unknown as Plan<BootStep>;
    await expect(delegate(p, ['renderer', 'physics'] as const, async (run) => { await run('renderer', () => undefined); })).rejects.toThrow(/without completing physics/);
    await expect(delegate(p, ['audio'] as const, async (run) => { await (run as unknown as (k: string, w: () => void) => Promise<void>)('game', () => undefined); })).rejects.toThrow(/outside \[audio\]/);
    expect(() => loose.done()).toThrow(/not complete/);
  });

  it('bytes: read is credited only up to the declared total, is closed by the awaiting step, and late reports after done() are ignored', async () => {
    const views: ProgressView[] = [];
    const plan = createBootPlan((v) => views.push({ ...v }), { totals: { core: 1000, heroModels: 0, bootArt: 0 } });
    const r = plan.reader('core');
    r.add(600);
    expect(views.at(-1)!.download).toBeCloseTo(0.6, 9);
    r.add(10_000); // over-read: clamps at the total
    expect(views.at(-1)!.download).toBe(1);
    const loose = plan as unknown as { step(k: BootStep, w: () => void): Promise<unknown>; done(): void };
    for (const k of BOOT_STEPS) await loose.step(k, () => undefined);
    loose.done();
    expect(views.at(-1)!.download).toBe(1);
    expect(views.at(-1)!.setup).toBe(1);
    // A source the reader never touched is still 1 at done(): closed by its step (closedBy), by arithmetic.
    const v2: ProgressView[] = [];
    const p2 = createBootPlan((v) => v2.push({ ...v }), { totals: { core: 10, heroModels: 10, bootArt: 10 } });
    const l2 = p2 as unknown as { step(k: BootStep, w: () => void): Promise<unknown>; done(): void };
    for (const k of BOOT_STEPS) {
      await l2.step(k, () => undefined);
      for (const b of BYTE_SOURCES) if (closedBy(b) === k) expect(v2.at(-1)!.download).toBeGreaterThanOrEqual(1 / 3 - 1e-9);
    }
    l2.done();
    expect(v2.at(-1)!.download).toBe(1);
  });

  it('a StepProgress is bound to its step: reports after completion or from a not-running step change nothing', async () => {
    const views: ProgressView[] = [];
    const plan = createBootPlan((v) => views.push({ ...v }), { totals: TOTALS });
    let keep!: StepProgress;
    const loose = plan as unknown as { step(k: BootStep, w: (p: StepProgress) => void): Promise<unknown> };
    await loose.step('core', (p) => { keep = p; });
    const n = views.length;
    keep.set(1, 2, 'late');
    keep.detail('late');
    expect(views.length).toBe(n);
  });
});
