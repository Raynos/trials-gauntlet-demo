/**
 * Best time per track in localStorage (`trials.best.<trackId>`), plus the
 * quality override (`trials.quality`). Every access is try/catch'd: private
 * mode, blocked storage and the headless harness must all just work.
 */
import type { Medal, QualityTier, RunResult } from '../core/types';

export interface BestEntry {
  time: number;
  faults: number;
  medal: Medal;
}

const PREFIX = 'trials.best.';
const QUALITY_KEY = 'trials.quality';

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export class BestTimes {
  private readonly cache = new Map<string, BestEntry>();

  get(trackId: string): BestEntry | null {
    const c = this.cache.get(trackId);
    if (c) return c;
    const s = store();
    if (!s) return null;
    try {
      const raw = s.getItem(PREFIX + trackId);
      if (!raw) return null;
      const o = JSON.parse(raw) as Partial<BestEntry>;
      if (typeof o.time !== 'number' || typeof o.faults !== 'number') return null;
      const entry: BestEntry = { time: o.time, faults: o.faults, medal: (o.medal as Medal | undefined) ?? 'bronze' };
      this.cache.set(trackId, entry);
      return entry;
    } catch {
      return null;
    }
  }

  put(trackId: string, r: RunResult): void {
    const entry: BestEntry = { time: r.time, faults: r.faults, medal: r.medal };
    this.cache.set(trackId, entry);
    try {
      store()?.setItem(PREFIX + trackId, JSON.stringify(entry));
    } catch {
      /* storage unavailable */
    }
  }
}

export function loadQualityOverride(): QualityTier | 'auto' {
  try {
    const v = store()?.getItem(QUALITY_KEY);
    return v === 'low' || v === 'medium' || v === 'high' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveQualityOverride(v: QualityTier | 'auto'): void {
  try {
    const s = store();
    if (!s) return;
    if (v === 'auto') s.removeItem(QUALITY_KEY);
    else s.setItem(QUALITY_KEY, v);
  } catch {
    /* storage unavailable */
  }
}
