/**
 * `?perf=1` overlay (MEGA_PLAN P3, real-device evidence): fps, frame ms p50/p95, physics
 * µs/tick, draw calls / triangles from `stats()`, the quality tier and why it was chosen.
 * Compact, top-left under the pause button, monospace, repainted 4× a second (never per frame).
 */
import type { QualityTier, RenderStats } from '../core/types';

export interface PerfSample {
  frameMs: { p50: number; p95: number };
  physicsUs: { p50: number; p95: number };
  stats: RenderStats | null;
  quality: QualityTier;
  qualityWhy: string;
  dpr: number;
}

const k = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

export class PerfOverlay {
  readonly root: HTMLPreElement;
  private lastPaint = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('pre');
    this.root.className = 'perf';
    this.root.textContent = 'perf…';
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  /** Call every frame with the wall clock; paints at most every 250 ms. */
  update(now: number, sample: () => PerfSample): void {
    if (now - this.lastPaint < 250) return;
    this.lastPaint = now;
    const s = sample();
    const fps = s.frameMs.p50 > 0 ? Math.round(1000 / s.frameMs.p50) : 0;
    const st = s.stats;
    this.root.textContent = [
      `FPS ${String(fps).padStart(3)}  ${s.frameMs.p50.toFixed(1)} / ${s.frameMs.p95.toFixed(1)} ms`,
      `PHYS ${s.physicsUs.p50.toFixed(1)} / ${s.physicsUs.p95.toFixed(1)} µs/tick`,
      st ? `DRAW ${st.calls} calls  ${k(st.triangles)} tris  ${st.texturesMB.toFixed(0)} MB tex` : 'DRAW —',
      `${s.quality.toUpperCase()} · dpr ${s.dpr.toFixed(2)} · ${s.qualityWhy}`,
    ].join('\n');
  }
}
