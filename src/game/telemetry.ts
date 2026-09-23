/**
 * Local, opt-in run log (MEGA_PLAN P3; default ON, Settings → Telemetry). Every finished run
 * appends one `RunTelemetry` to `localStorage['rockhop.runlog']`, bounded to `RUNLOG_MAX`
 * entries (oldest dropped). Nothing leaves the device: Settings → "Copy run log" puts the JSON
 * on the clipboard, "Share run log" hands it to the Web Share API (iOS share sheet) as text.
 *
 * The app owns the collection (`RunCollector`): deaths with the bike x at the fault tick,
 * frame-time percentiles from the RAF loop, the quality tier and the reason it was chosen.
 */
import type { BikeClass, FaultReason, InputTraceRun, Medal, NavEvent, PhysicsVersion, QualityTier, RunTelemetry } from '../core/types';
import { Percentiles } from './game';

export const RUNLOG_KEY = 'rockhop.runlog';
export const RUNLOG_MAX = 200;

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export class RunLog {
  constructor(private readonly key = RUNLOG_KEY, private readonly max = RUNLOG_MAX) {}

  read(): RunTelemetry[] {
    const s = store();
    if (!s) return [];
    try {
      const raw = s.getItem(this.key);
      const v = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(v) ? (v as RunTelemetry[]) : [];
    } catch {
      return [];
    }
  }

  append(entry: RunTelemetry): RunTelemetry[] {
    const all = this.read();
    all.push(entry);
    if (all.length > this.max) all.splice(0, all.length - this.max);
    try {
      store()?.setItem(this.key, JSON.stringify(all));
    } catch {
      /* quota / unavailable: the in-memory list still returns */
    }
    return all;
  }

  clear(): void {
    try {
      store()?.removeItem(this.key);
    } catch {
      /* unavailable */
    }
  }

  /** Pretty JSON with a small header so a pasted log is self-describing; `bench` = the device bench reports on this device (`?bench=1`). */
  exportJson(build: string, bench: unknown[] = []): string {
    const runs = this.read();
    return JSON.stringify({ kind: 'rockhop-runlog', v: 1, build, exportedAt: new Date().toISOString(), runs, ...(bench.length ? { bench } : {}) }, null, 1);
  }

  /** Per-track summary for the settings row ("12 runs · 3 tracks"). */
  summary(): { runs: number; tracks: number } {
    const runs = this.read();
    return { runs: runs.length, tracks: new Set(runs.map((r) => r.track)).size };
  }
}

export const BENCHLOG_KEY = 'rockhop.benchlog';
export const BENCHLOG_MAX = 10;

/** `?bench=1` reports on this device (src/game/bench.ts), newest last, bounded; exported with the run log. */
export class BenchLog {
  constructor(private readonly key = BENCHLOG_KEY, private readonly max = BENCHLOG_MAX) {}

  read(): unknown[] {
    const s = store();
    if (!s) return [];
    try {
      const raw = s.getItem(this.key);
      const v = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  append(report: unknown): unknown[] {
    const all = this.read();
    all.push(report);
    if (all.length > this.max) all.splice(0, all.length - this.max);
    try {
      store()?.setItem(this.key, JSON.stringify(all));
    } catch {
      /* quota / unavailable */
    }
    return all;
  }
}

/** One line describing the device (no identifiers beyond what the UA already says). */
export function describeDevice(): string {
  if (typeof navigator === 'undefined') return 'node';
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'other';
  const browser = /CriOS|Chrome\//.test(ua) && !/Edg/.test(ua) ? 'Chrome' : /Safari\//.test(ua) && !/Chrome|CriOS/.test(ua) ? 'Safari' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Edg/.test(ua) ? 'Edge' : 'browser';
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'touch' : 'pointer';
  const w = typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}@${(window.devicePixelRatio || 1).toFixed(1)}` : '';
  const standalone = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches ? ' pwa' : '';
  return `${os} ${browser} ${coarse} ${w}${standalone}`.trim();
}

/** Collects one run's evidence between the first GO and the results panel. */
export class RunCollector {
  readonly frameMs = new Percentiles(600);
  deaths: RunTelemetry['deaths'] = [];
  /** Navigations during the window (docs/tasks/touch-navigation-invariant.md §1). */
  navs: NavEvent[] = [];
  private startedAt = 0;
  private active = false;

  /** First GO on this track load: zero the deaths and the frame samples. */
  begin(): void {
    this.active = true;
    this.startedAt = performance.now();
    this.deaths = [];
    this.navs = [];
    this.frameMs.reset();
  }

  get running(): boolean {
    return this.active;
  }

  /** New track launched before this one was cleared: drop the window (deaths stay in memory only). */
  abandon(): void {
    this.active = false;
  }

  /** A fault: bike x after the faulting step, plus the last ≤ 1 s of quantized input (RLE) so a death can be read back as a technique failure. */
  death(x: number, reason: FaultReason, checkpoint: number, trace?: InputTraceRun[]): void {
    if (!this.active) return;
    if (this.deaths.length < 500) this.deaths.push({ x: Math.round(x * 10) / 10, reason, checkpoint, ...(trace && trace.length > 0 ? { trace } : {}) });
  }

  frame(ms: number): void {
    if (this.active && ms > 0) this.frameMs.push(ms);
  }

  /** A navigation (pause / quit / restart / goto) while the window is open. */
  nav(e: NavEvent): void {
    if (this.active && this.navs.length < 200) this.navs.push(e);
  }

  finish(o: {
    track: string;
    bike: BikeClass;
    physics?: PhysicsVersion | undefined;
    faults: number;
    time: number;
    medal: Medal;
    quality: QualityTier;
    qualityWhy: string;
    build: string;
  }): RunTelemetry {
    this.active = false;
    const f = this.frameMs.stats();
    const fps = { p50: f.p50 > 0 ? Math.round(1000 / f.p50) : 0, p95: f.p95 > 0 ? Math.round(1000 / f.p95) : 0 };
    return {
      at: new Date().toISOString(),
      track: o.track,
      bike: o.bike,
      attempts: 1 + o.faults,
      faults: o.faults,
      ...(o.physics ? { physics: o.physics } : {}),
      time: Math.round(o.time * 1000) / 1000,
      timeToClear: Math.round((performance.now() - this.startedAt) / 100) / 10,
      medal: o.medal,
      deaths: this.deaths.slice(),
      device: describeDevice(),
      quality: o.quality,
      qualityWhy: o.qualityWhy,
      fps,
      frameMs: { p50: Math.round(f.p50 * 10) / 10, p95: Math.round(f.p95 * 10) / 10 },
      build: o.build,
      ...(this.navs.length > 0 ? { nav: this.navs.slice() } : {}),
    };
  }
}
