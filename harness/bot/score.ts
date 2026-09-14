/**
 * Progress heuristic. Deliberately dumb: x is the objective, the rest are
 * tie-breakers so the beam does not fill with "fast but about to loop"
 * states. Tuned by measured attempts against the author band, never by eye.
 */
import type { PhysicsState } from '../../src/core/types';
import type { ScoreWeights } from '../lib/schema';

export type { ScoreWeights } from '../lib/schema';

export const DEFAULT_WEIGHTS: ScoreWeights = {
  progress: 1,
  speed: 0.15,
  upright: 0.5,
  airPitch: 0.3,
  checkpoint: 50,
  finish: 1e6,
  fault: -1e6,
};

/** `runTicks` is the continuous run clock; faster finishes on the run clock win. */
export function score(s: PhysicsState, w: ScoreWeights, runTicks: number, hz: number): number {
  if (s.finished && !s.faulted) return w.finish - runTicks / hz;
  if (s.faulted) return w.fault + s.bike.pos.x;
  const grounded = s.wheels.rear.grounded || s.wheels.front.grounded;
  const upright = Math.cos(s.bike.angle); // 1 level, 0 vertical, <0 inverted
  const airOver = !grounded && Math.abs(s.bike.angle) > 1.0 ? Math.abs(s.bike.angle) : 0;
  return (
    w.progress * s.bike.pos.x +
    w.speed * Math.max(0, s.bike.vel.x) +
    w.upright * (grounded ? upright : 0) -
    w.airPitch * airOver +
    w.checkpoint * (s.checkpoint + 1)
  );
}
