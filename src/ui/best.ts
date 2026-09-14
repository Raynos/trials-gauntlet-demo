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
  /** Run clock at each checkpoint of the PB run. */
  splits?: number[];
  /** JSON InputRecording of the PB run (GO → finish) for the ghost. */
  recording?: string;
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
      if (Array.isArray(o.splits) && o.splits.every((x) => typeof x === 'number')) entry.splits = o.splits;
      if (typeof o.recording === 'string' && o.recording.length > 0) entry.recording = o.recording;
      this.cache.set(trackId, entry);
      return entry;
    } catch {
      return null;
    }
  }

  put(trackId: string, r: RunResult, run?: { splits: number[]; recording: string | null }): void {
    const entry: BestEntry = { time: r.time, faults: r.faults, medal: r.medal };
    if (run) {
      entry.splits = run.splits;
      if (run.recording) entry.recording = run.recording;
    }
    this.cache.set(trackId, entry);
    try {
      store()?.setItem(PREFIX + trackId, JSON.stringify(entry));
    } catch {
      /* storage unavailable */
    }
  }
}

const GHOST_KEY = 'trials.ghost';
const MODEL_KEYS = { rider: 'trials.riderModel', bike: 'trials.bikeModel' } as const;

export type ModelChoice = 'proc' | 'gltf';

export function loadModelChoice(which: 'rider' | 'bike'): ModelChoice {
  try {
    const v = store()?.getItem(MODEL_KEYS[which]);
    return v === 'gltf' ? 'gltf' : 'proc';
  } catch {
    return 'proc';
  }
}

export function saveModelChoice(which: 'rider' | 'bike', v: ModelChoice): void {
  try {
    store()?.setItem(MODEL_KEYS[which], v);
  } catch {
    /* storage unavailable */
  }
}

export function loadGhostEnabled(): boolean {
  try {
    return store()?.getItem(GHOST_KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveGhostEnabled(on: boolean): void {
  try {
    store()?.setItem(GHOST_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable */
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
