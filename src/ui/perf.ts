/**
 * `?perf=1` overlay (MEGA_PLAN P3, real-device evidence): fps, frame ms p50/p95, physics
 * µs/tick, draw calls / triangles from `stats()`, the quality tier and why it was chosen, and the
 * renderer's `debugInfo()` scalars (PERF.md: tier · deviceClass/profile · dpr · canvas · calls · tris ·
 * rtMpx · passes · shadow · heroTris · skippedFrames · stalePrograms · entryMs). Compact, top-left under
 * the pause button, monospace. Dirty-checked: the text is rebuilt at most twice a second and written to
 * the DOM only when it changed (≤ 2 writes/s), never per frame. `hook.info().render` carries the same
 * fields so a headless run can assert them.
 */
import type { QualityTier, RenderStats } from '../core/types';

export interface PerfSample {
  frameMs: { p50: number; p95: number };
  physicsUs: { p50: number; p95: number };
  stats: RenderStats | null;
  quality: QualityTier;
  /** The governor's last decision (`App.qualityWhy`). */
  qualityWhy: string;
  dpr: number;
  /** The renderer's `debugInfo()` scalars (`Game.rendererDebug()`), null for a renderer without one. */
  render?: Record<string, unknown> | null;
  /** Countdown held on the track entry (`Game.entryHeld`). */
  entryHold?: boolean;
}

/** Repaint interval: the overlay is a readout, not a meter — two writes a second is what a phone can afford and a human can read. */
export const PERF_PAINT_MS = 500;

const k = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined || v === null ? '—' : String(v));

/** The overlay's lines from a sample (pure; the unit test and the overlay share it). */
export function perfLines(s: PerfSample): string[] {
  const fps = s.frameMs.p50 > 0 ? Math.round(1000 / s.frameMs.p50) : 0;
  const st = s.stats;
  const r = s.render ?? null;
  const lines = [
    `FPS ${String(fps).padStart(3)}  ${s.frameMs.p50.toFixed(1)} / ${s.frameMs.p95.toFixed(1)} ms`,
    `PHYS ${s.physicsUs.p50.toFixed(1)} / ${s.physicsUs.p95.toFixed(1)} µs/tick`,
    st ? `DRAW ${st.calls} calls  ${k(st.triangles)} tris  ${st.texturesMB.toFixed(0)} MB tex` : 'DRAW —',
    `${s.quality.toUpperCase()} · dpr ${s.dpr.toFixed(2)} · ${s.qualityWhy}`,
  ];
  if (r) {
    lines.push(
      `RENDER ${str(r['tier'])} · ${str(r['deviceClass'])}/${str(r['profile'])} · dpr ${num(r['dpr']).toFixed(2)} · ${num(r['canvasW'])}×${num(r['canvasH'])}`,
      `  ${num(r['calls'])} calls  ${k(num(r['tris']))} tris  rt ${num(r['rtMpx']).toFixed(2)} Mpx  ${num(r['passes'])} passes  shadow ${num(r['shadowMap'])}`,
      `  hero ${k(num(r['heroTris']))} tris  skipped ${num(r['skippedFrames'])}  stale ${num(r['stalePrograms'])}  entry ${num(r['entryMs']).toFixed(0)} ms${s.entryHold ? ' (holding)' : ''}`,
    );
  }
  return lines;
}

export class PerfOverlay {
  readonly root: HTMLPreElement;
  private lastPaint = 0;
  private lastText = '';
  /** DOM writes so far (instrument: the e2e asserts ≤ 2/s). */
  writes = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('pre');
    this.root.className = 'perf';
    this.root.textContent = 'perf…';
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  /** Call every frame with the wall clock; samples at most every `PERF_PAINT_MS` and writes only on a change. */
  update(now: number, sample: () => PerfSample): void {
    if (now - this.lastPaint < PERF_PAINT_MS) return;
    this.lastPaint = now;
    const text = perfLines(sample()).join('\n');
    if (text === this.lastText) return;
    this.lastText = text;
    this.writes++;
    this.root.textContent = text;
  }
}
