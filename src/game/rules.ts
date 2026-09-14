/**
 * Game-rule constants (CONTRACT.md §2.8, docs/design/game.md). All durations
 * are expressed in seconds and converted to ticks at the game's physics rate
 * so every timer is an integer count advanced only inside `Game.tick()`.
 */
import type { BikeClass, Medal, TrackDef, TrackTier } from '../core/types';
export type { Medal, RunResult } from '../core/types';

/** Pro rides against a target 10 % tighter than the authored `meta.targetTimeS`. */
export const PRO_TARGET_SCALE = 0.9;

/** Per-tier default bike when the player has never picked one in the Garage (medium = last used, i.e. the stored choice). */
export function defaultBikeForTier(tier: TrackTier, lastUsed: BikeClass | null): BikeClass {
  if (tier === 'beginner' || tier === 'easy') return 'rookie';
  if (tier === 'hard' || tier === 'extreme') return 'pro';
  return lastUsed ?? 'rookie';
}

/** Effective medal target for a bike class (null when the track has none). */
export function targetForBike(targetTimeS: number | null | undefined, bike: BikeClass | undefined): number | null {
  if (targetTimeS === undefined || targetTimeS === null || !(targetTimeS > 0)) return null;
  return bike === 'pro' ? Math.round(targetTimeS * PRO_TARGET_SCALE * 1000) / 1000 : targetTimeS;
}

/** 3-2-1-GO at 1.0 s cadence: GO lands at 3 * this. */
export const COUNTDOWN_BEAT_S = 1.0;
export const COUNTDOWN_BEATS = 3;
/** Crash → injected checkpoint respawn unless the player restarts first. */
export const AUTO_RESPAWN_S = 1.0;
/** Restart held this long = full track restart. */
export const HOLD_RESTART_S = 0.6;
/** Finish → results panel. */
export const RESULTS_DELAY_S = 0.4;
/** After the line the game owns the input: throttle 0, lean 0, brake ramps 0 → FINISH_BRAKE over this long, so the bike coasts to a stop on the run-out. */
export const FINISH_BRAKE_S = 1.0;
export const FINISH_BRAKE = 0.6;

export interface RuleTicks {
  countdownBeat: number;
  countdownTotal: number;
  autoRespawn: number;
  holdRestart: number;
  resultsDelay: number;
  finishBrake: number;
}

export function ruleTicks(physicsHz: number): RuleTicks {
  const beat = Math.round(COUNTDOWN_BEAT_S * physicsHz);
  return {
    countdownBeat: beat,
    countdownTotal: beat * COUNTDOWN_BEATS,
    autoRespawn: Math.round(AUTO_RESPAWN_S * physicsHz),
    holdRestart: Math.round(HOLD_RESTART_S * physicsHz),
    resultsDelay: Math.round(RESULTS_DELAY_S * physicsHz),
    finishBrake: Math.round(FINISH_BRAKE_S * physicsHz),
  };
}

/**
 * Medal vs `meta.targetTimeS` (T). Without a target every clear is bronze
 * except a fault-free one, which is gold (there is nothing to beat on time).
 */
export function medalFor(time: number, faults: number, targetTimeS: number | null | undefined, bike?: BikeClass): Medal {
  targetTimeS = targetForBike(targetTimeS, bike);
  if (targetTimeS === null) {
    return faults === 0 ? 'gold' : 'bronze';
  }
  if (faults === 0 && time <= targetTimeS * 0.85) return 'platinum';
  if (faults <= 1 && time <= targetTimeS) return 'gold';
  if (faults <= 5 && time <= targetTimeS * 1.25) return 'silver';
  return 'bronze';
}

export function targetTimeOf(track: TrackDef | null): number | null {
  const t = track?.meta?.targetTimeS;
  return typeof t === 'number' && t > 0 ? t : null;
}
