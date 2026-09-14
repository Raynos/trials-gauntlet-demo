/**
 * GameEvent → transients + scratch flags. Pure; seeded jitter only via `rng`.
 * Delays are carried on the transient so the synth schedules them
 * sample-accurately; the restart hard-stop clears anything still pending.
 */
import type { GameEvent } from '../../core/types';
import type { Rng } from '../../core/rng';
import { CHASSIS, DUCK, TIMING, TK, pushTransient, surfaceIndex, type AudioParams } from '../params';
import { resetScratch, type ModelScratch } from './mapParams';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export function applyEvent(out: AudioParams, e: GameEvent, scratch: ModelScratch, rng: Rng): void {
  const now = scratch.time;
  switch (e.type) {
    case 'countdown':
      pushTransient(out, TK.countdown, 1, (3 - e.n) / 3);
      break;
    case 'go':
      pushTransient(out, TK.go, 1);
      scratch.duckUiUntil = now + DUCK.uiHoldS;
      break;
    case 'land': {
      if (scratch.justReset) break;
      const gain = clamp(e.impulse / CHASSIS.landingImpulseRef, CHASSIS.landingMinGain, 1);
      pushTransient(out, TK.landing, gain, surfaceIndex(e.surface) / 8, e.wheel === 'rear' ? -0.15 : 0.15);
      if (gain >= 0.5) scratch.duckImpactUntil = now + DUCK.impactHoldS * 0.5;
      break;
    }
    case 'checkpoint':
      pushTransient(out, TK.checkpoint, 1);
      scratch.duckUiUntil = now + DUCK.uiHoldS;
      break;
    case 'fault': {
      if (e.reason === 'crash') {
        scratch.crashAt = now;
        scratch.duckImpactUntil = now + DUCK.impactHoldS;
        pushTransient(out, TK.impact, 1, 0.5, -0.1);
        pushTransient(out, TK.impact, 0.7, 0.8, 0.3, 0.035);
        // debris grains: 6 over 0.4 s, decaying 3 dB per grain, seeded jitter
        for (let i = 0; i < 6; i++) {
          const t = (i / 6) * 0.4 + rng.range(0, 0.04);
          pushTransient(out, TK.debris, Math.pow(10, (-3 * i) / 20), rng.next(), rng.range(-0.6, 0.6), t);
        }
        pushTransient(out, TK.grunt, 1, 0, 0, TIMING.gruntDelayS);
        if (rng.bool(0.5)) pushTransient(out, TK.grunt, 0.7, 0.3, 0.1, TIMING.grunt2DelayS);
        pushTransient(out, TK.fault, 1, 0, 0, TIMING.faultStampDelayS);
      } else if (e.reason === 'hazard') {
        scratch.crashAt = now;
        scratch.duckImpactUntil = now + DUCK.impactHoldS;
        pushTransient(out, TK.hazard, 1, 0, 0);
        pushTransient(out, TK.grunt, 0.8, 0.6, 0, TIMING.gruntDelayS);
        pushTransient(out, TK.fault, 1, 0, 0, TIMING.faultStampDelayS);
      } else if (e.reason === 'restart') {
        // Manual restart: the restart event that follows does the work.
      } else {
        pushTransient(out, TK.fault, 0.8, 0, 0, TIMING.faultStampDelayS);
      }
      break;
    }
    case 'restart':
      resetScratch(scratch, true);
      pushTransient(out, TK.restart, 1);
      break;
    case 'finish':
      scratch.finishAt = now;
      scratch.duckUiUntil = now + DUCK.uiHoldS;
      pushTransient(out, TK.finishTick, 1);
      for (let i = 0; i < 4; i++) pushTransient(out, TK.fanfare, 1, i / 4, 0, TIMING.fanfareDelayS + i * TIMING.fanfareGapS);
      for (let i = 0; i < 5; i++) {
        pushTransient(out, TK.firework, rng.range(0.6, 1), rng.next(), rng.range(-0.8, 0.8), 0.2 + i * 0.22 + rng.range(0, 0.08));
      }
      pushTransient(out, TK.crowd, 1, 0, 0, 0.05);
      break;
  }
}
