/**
 * GameEvent → transients + scratch flags. Pure; seeded jitter only via `rng`.
 * Delays are carried on the transient so the synth schedules them
 * sample-accurately; the restart hard-stop clears anything still pending.
 */
import type { GameEvent } from '../../core/types';
import type { Rng } from '../../core/rng';
import { CHASSIS, CROWD, DUCK, TIMING, TK, pushTransient, surfaceIndex, type AudioParams } from '../params';
import { SCENE_RUN, resetScratch, scheduleResults, type ModelScratch } from './mapParams';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export function applyEvent(out: AudioParams, e: GameEvent, scratch: ModelScratch, rng: Rng): void {
  const now = scratch.time;
  switch (e.type) {
    case 'countdown':
      // a run is starting: the front-end bed goes (inferred scene; an explicit setScene overrides)
      scratch.scene = SCENE_RUN;
      scratch.resultsAt = -1;
      pushTransient(out, TK.countdown, 1, (3 - e.n) / 3);
      break;
    case 'go':
      scratch.scene = SCENE_RUN;
      scratch.resultsAt = -1;
      pushTransient(out, TK.go, 1);
      // the start-gate stands roar (scaled by how many people are within earshot)
      if (scratch.crowd >= CROWD.earshot) pushTransient(out, TK.crowdRoar, scratch.crowd, 0, 0, 0.03);
      scratch.duckUiUntil = now + DUCK.uiHoldS;
      break;
    case 'land': {
      if (scratch.justReset) break;
      if (e.impulse < CHASSIS.landingMinImpulse) break; // a wheel settling, not a landing
      const gain = Math.pow(clamp(e.impulse / CHASSIS.landingImpulseRef, 0, 1), CHASSIS.landingCurve);
      pushTransient(out, TK.landing, gain, surfaceIndex(e.surface) / 8, e.wheel === 'rear' ? -0.15 : 0.15);
      if (gain >= 0.5) scratch.duckImpactUntil = now + DUCK.impactHoldS * 0.5;
      // a clean landing after real air: the nearby stands cheer (once per flight)
      const air = scratch.airborneFor > 0 ? scratch.airborneFor : scratch.lastAir;
      if (air >= CROWD.cheerAirS && scratch.crashAt < 0 && scratch.crowd >= CROWD.earshot) {
        pushTransient(out, TK.crowdCheer, scratch.crowd * clamp(0.6 + air / 2, 0.6, 1), clamp(air / 1.5, 0, 1), 0, 0.12 + rng.range(0, 0.06));
        scratch.lastAir = 0;
        scratch.airborneFor = 0;
      }
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
        if (scratch.crowd >= CROWD.earshot) pushTransient(out, TK.crowdGroan, scratch.crowd, 0, 0, CROWD.groanDelayS);
      } else if (e.reason === 'hazard') {
        scratch.crashAt = now;
        scratch.duckImpactUntil = now + DUCK.impactHoldS;
        pushTransient(out, TK.hazard, 1, 0, 0);
        pushTransient(out, TK.grunt, 0.8, 0.6, 0, TIMING.gruntDelayS);
        pushTransient(out, TK.fault, 1, 0, 0, TIMING.faultStampDelayS);
        if (scratch.crowd >= CROWD.earshot) pushTransient(out, TK.crowdGroan, scratch.crowd, 0.5, 0, CROWD.groanDelayS);
      } else if (e.reason === 'restart') {
        // Manual restart: the restart event that follows does the work.
      } else {
        pushTransient(out, TK.fault, 0.8, 0, 0, TIMING.faultStampDelayS);
      }
      break;
    }
    case 'restart': {
      // a results bed (or the inferred menu after a quit) ends the moment a run restarts
      const wasResults = scratch.scene !== SCENE_RUN && scratch.sceneOverride < 0 && scratch.finishAt >= 0;
      resetScratch(scratch, true);
      if (wasResults) scratch.scene = SCENE_RUN;
      pushTransient(out, TK.restart, 1);
      pushTransient(out, TK.starter, 1, 0, 0, 0.02);
      break;
    }
    case 'finish':
      scratch.finishAt = now;
      scratch.duckUiUntil = now + DUCK.uiHoldS;
      pushTransient(out, TK.finishTick, 1);
      for (let i = 0; i < 4; i++) pushTransient(out, TK.fanfare, 1, i / 4, 0, TIMING.fanfareDelayS + i * TIMING.fanfareGapS);
      for (let i = 0; i < 5; i++) {
        pushTransient(out, TK.firework, rng.range(0.6, 1), rng.next(), rng.range(-0.8, 0.8), 0.2 + i * 0.22 + rng.range(0, 0.08));
      }
      // the finish stands applaud; far from any stand a thin scatter still reads the finish
      pushTransient(out, TK.crowdApplause, clamp(0.3 + scratch.crowd, 0.3, 1), 0, 0, CROWD.applauseDelayS);
      scheduleResults(scratch);
      break;
  }
}
