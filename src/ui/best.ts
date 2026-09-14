/**
 * Best time per track in localStorage (`trials.best.<trackId>`), plus the
 * quality override (`trials.quality`). Every access is try/catch'd: private
 * mode, blocked storage and the headless harness must all just work.
 */
import type { BikeClass, Medal, QualityTier, RunResult } from '../core/types';

export interface BestEntry {
  time: number;
  faults: number;
  medal: Medal;
  /** Bike class the PB was set on (absent in pre-garage entries = rookie). */
  bike?: BikeClass;
  /** Run clock at each checkpoint of the PB run. */
  splits?: number[];
  /** JSON InputRecording of the PB run (GO → finish) for the ghost. */
  recording?: string;
}

const PREFIX = 'trials.best.';
const QUALITY_KEY = 'trials.quality';
const MEDAL_RANK: Record<Medal, number> = { bronze: 1, silver: 2, gold: 3, platinum: 4 };

/** Storage key per track and bike class: rookie keeps the legacy key so pre-garage PBs survive; pro gets a suffix. */
export function bestKey(trackId: string, bike: BikeClass): string {
  return bike === 'pro' ? `${PREFIX}${trackId}@pro` : PREFIX + trackId;
}

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * PB per track **per bike class**. `get(id, bike)` is that class's entry; `get(id)` is the
 * track's best across classes (higher medal wins, then time) — what cards, tier locks and
 * the career line read. The ghost and splits always come from the class being ridden.
 */
export class BestTimes {
  private readonly cache = new Map<string, BestEntry | null>();

  get(trackId: string, bike?: BikeClass): BestEntry | null {
    if (bike) return this.read(trackId, bike);
    const a = this.read(trackId, 'rookie');
    const b = this.read(trackId, 'pro');
    if (!a) return b;
    if (!b) return a;
    const ra = MEDAL_RANK[a.medal];
    const rb = MEDAL_RANK[b.medal];
    return rb > ra || (rb === ra && b.time < a.time) ? b : a;
  }

  private read(trackId: string, bike: BikeClass): BestEntry | null {
    const key = bestKey(trackId, bike);
    if (this.cache.has(key)) return this.cache.get(key) ?? null;
    const s = store();
    if (!s) return null;
    try {
      const raw = s.getItem(key);
      if (!raw) {
        this.cache.set(key, null);
        return null;
      }
      const o = JSON.parse(raw) as Partial<BestEntry>;
      if (typeof o.time !== 'number' || typeof o.faults !== 'number') return null;
      const entry: BestEntry = { time: o.time, faults: o.faults, medal: (o.medal as Medal | undefined) ?? 'bronze', bike };
      if (Array.isArray(o.splits) && o.splits.every((x) => typeof x === 'number')) entry.splits = o.splits;
      if (typeof o.recording === 'string' && o.recording.length > 0) entry.recording = o.recording;
      this.cache.set(key, entry);
      return entry;
    } catch {
      return null;
    }
  }

  clear(): void {
    this.cache.clear();
    clearAllBest();
  }

  put(trackId: string, r: RunResult, run?: { splits: number[]; recording: string | null }): void {
    const bike: BikeClass = r.bike ?? 'rookie';
    const entry: BestEntry = { time: r.time, faults: r.faults, medal: r.medal, bike };
    if (run) {
      entry.splits = run.splits;
      if (run.recording) entry.recording = run.recording;
    }
    const key = bestKey(trackId, bike);
    this.cache.set(key, entry);
    try {
      store()?.setItem(key, JSON.stringify(entry));
    } catch {
      /* storage unavailable */
    }
  }
}

const BIKE_KEY = 'trials.bikeClass';
const TELEMETRY_KEY = 'trials.telemetry';
const ONBOARDED_KEY = 'trials.onboarded';

/** The Garage choice, or null when the player has never picked (then the per-tier default applies, rules.ts). */
export function loadBikeChoice(): BikeClass | null {
  try {
    const v = store()?.getItem(BIKE_KEY);
    return v === 'pro' || v === 'rookie' ? v : null;
  } catch {
    return null;
  }
}

export function saveBikeChoice(b: BikeClass): void {
  try {
    store()?.setItem(BIKE_KEY, b);
  } catch {
    /* storage unavailable */
  }
}

/** Local run log: default ON, opt-out in Settings. */
export function loadTelemetryEnabled(): boolean {
  try {
    return store()?.getItem(TELEMETRY_KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveTelemetryEnabled(on: boolean): void {
  try {
    store()?.setItem(TELEMETRY_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

export function loadOnboarded(): boolean {
  try {
    return store()?.getItem(ONBOARDED_KEY) === '1';
  } catch {
    return true; // no storage: never nag
  }
}

export function saveOnboarded(): void {
  try {
    store()?.setItem(ONBOARDED_KEY, '1');
  } catch {
    /* storage unavailable */
  }
}

const GHOST_KEY = 'trials.ghost';
const MODEL_KEYS = { rider: 'trials.riderModel', bike: 'trials.bikeModel' } as const;

export type ModelChoice = 'proc' | 'gltf';

/** glTF hero is the default (MEGA_PLAN P1: procedural retired from the UI, kept as the load-failure fallback and a stored 'proc' choice). */
export function loadModelChoice(which: 'rider' | 'bike'): ModelChoice {
  try {
    const v = store()?.getItem(MODEL_KEYS[which]);
    return v === 'proc' ? 'proc' : 'gltf';
  } catch {
    return 'gltf';
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

const SOUND_KEY = 'trials.sound';
const VOLUME_KEY = 'trials.volume';

export function loadSoundEnabled(): boolean {
  try {
    return store()?.getItem(SOUND_KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveSoundEnabled(on: boolean): void {
  try {
    store()?.setItem(SOUND_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

export function loadVolume(): number {
  try {
    const v = Number(store()?.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v >= 0 && v <= 1 && store()?.getItem(VOLUME_KEY) !== null ? v : 0.8;
  } catch {
    return 0.8;
  }
}

export function saveVolume(v: number): void {
  try {
    store()?.setItem(VOLUME_KEY, String(Math.max(0, Math.min(1, v))));
  } catch {
    /* storage unavailable */
  }
}

/** Reset progress: every `trials.best.*` entry (medals, PBs, ghosts). Settings stay. */
export function clearAllBest(): number {
  const s = store();
  if (!s) return 0;
  const keys: string[] = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) s.removeItem(k);
  } catch {
    /* storage unavailable */
  }
  return keys.length;
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
