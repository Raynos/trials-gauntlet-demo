/**
 * Perception: what a player reads off the screen at one glance, and nothing
 * more. Bike pitch / pitch rate / speed / height, whether the wheels touch,
 * and the ground silhouette ahead within ~1.5 s of travel (what is on
 * screen), reduced to the few features a rider actually reacts to: the next
 * rise, the next steep face, the next drop, the next pit, the slope where an
 * airborne bike will land, and the next checkpoint / finish mark (the HUD
 * progress strip).
 *
 * Pure: no noise, no delay — the controller adds both from its own RNG so node
 * and browser share exactly this code.
 */
import type { GamePhase, PhysicsState, TrackDef } from '../../src/core/types';
import { GRID, type GroundProfile } from './profile';

export const G = 9.81;
const RAD = 180 / Math.PI;

export interface Ahead {
  /** Metres of track considered (≈ 1.5 s of travel, clamped 8..40). */
  horizon: number;
  /** Highest ground within the horizon relative to the ground under the bike (m). */
  maxRise: number;
  /** Distance to where the ground first rises ≥ 0.4 m above the current ground (m), or null. */
  riseDist: number | null;
  /** Steepest upslope in the next 5 m over a 1 m window (deg) and where it starts (m). Stairs read as a slope. */
  steepDeg: number;
  steepDist: number | null;
  /** First vertical face (≥ 0.35 m rise within one 0.25 m cell) within the horizon: distance (m) and its total height (m). */
  faceDist: number | null;
  faceHeight: number;
  /** First drop ≥ 0.8 m within the horizon (a ledge / cliff, not a pit): distance and depth. */
  dropDist: number | null;
  dropDepth: number;
  /** First pit (sharp drop ≥ 1 m that comes back up within 8 m): distance to the lip and width (m). */
  pitDist: number | null;
  pitWidth: number;
  /** First hazard / hole cell within the horizon (m), or null. */
  holeDist: number | null;
  /** Ground slope at the ballistic landing point when airborne (deg), else the slope 1 m ahead. */
  landingSlopeDeg: number;
  landingDist: number;
  /** Ground slope 1.5 m ahead of the front wheel (deg) — what the front wheel is about to hit. */
  nextSlopeDeg: number;
  /** Ground height 1 m ahead relative to the ground under the bike (m): the step the front wheel meets. */
  stepAhead: number;
  /** Surface roughness under and just ahead of the bike (deg): max minus min per-cell slope over -1..+2 m. A smooth
   *  kicker reads ~0, a 0.25 m stair flight ~45 (riser cells vertical, tread cells flat). */
  roughDeg: number;
  /** Stair risers over -1..+2 m: steep cells (> 40 deg) that follow a flat cell (< 8 deg). A ramp base counts 1,
   *  a flight 2+ — what tells a ramp from stairs (round 9). */
  risers: number;
}

export interface Observation {
  /** Perception time (s, sim run clock or wall). */
  t: number;
  phase: GamePhase;
  x: number;
  y: number;
  pitchDeg: number;
  pitchRateDeg: number;
  speed: number;
  vy: number;
  /** Bike centre height above the ground under it minus the wheel radius (≈ 0 when on the ground). */
  height: number;
  rear: boolean;
  front: boolean;
  slopeHereDeg: number;
  /** Slope of the ground between where the rear and front wheels stand (deg): the pitch a bike at rest on it would have. */
  terrainPitchDeg: number;
  ahead: Ahead;
  checkpointAhead: number | null;
  finishAhead: number;
}

const WHEEL_R = 0.34;

export function perceive(st: PhysicsState, phase: GamePhase, t: number, profile: GroundProfile, track: TrackDef): Observation {
  const x = st.bike.pos.x;
  const y = st.bike.pos.y;
  const speed = st.bike.vel.x;
  const vy = st.bike.vel.y;
  const gHere = profile.heightAt(x, st);
  const height = Number.isFinite(gHere) ? y - gHere - WHEEL_R : 99;
  const airborne = !st.wheels.rear.grounded && !st.wheels.front.grounded;

  const horizon = Math.max(8, Math.min(40, Math.abs(speed) * 1.5 + 4));
  const base = Number.isFinite(gHere) ? gHere : y - WHEEL_R;
  let maxRise = 0;
  let riseDist: number | null = null;
  let steepDeg = 0;
  let steepDist: number | null = null;
  let faceDist: number | null = null;
  let faceHeight = 0;
  let dropDist: number | null = null;
  let dropDepth = 0;
  let pitDist: number | null = null;
  let pitWidth = 0;
  let holeDist: number | null = null;
  let prev = base;
  let prevX = x;
  const step = GRID;
  for (let d = step; d <= horizon; d += step) {
    const gx = x + d;
    const g = profile.heightAt(gx, st);
    if (!Number.isFinite(g) || profile.hazardAt(gx)) {
      if (holeDist === null) holeDist = d;
      prev = g;
      prevX = gx;
      continue;
    }
    const rise = g - base;
    if (rise > maxRise) maxRise = rise;
    if (riseDist === null && rise >= 0.4) riseDist = d;
    if (d <= 5) {
      const g1m = profile.heightAt(gx + 1, st);
      if (Number.isFinite(g1m)) {
        const s = Math.atan2(g1m - g, 1) * RAD;
        if (s > steepDeg) {
          steepDeg = s;
          if (steepDist === null || steepDeg > 25) steepDist = steepDist ?? d;
        }
      }
    }
    if (faceDist === null && Number.isFinite(prev)) {
      // Near-vertical: ≥ 0.35 m up within one grid cell (≥ 54°). A 40° plank or a 0.3 m stair riser is not a face.
      const g2 = prev;
      const riseHere = g - prev;
      if (riseHere >= 0.35) {
        faceDist = d - step;
        // Total height: keep climbing while the ground keeps rising steeply.
        let top = g;
        for (let e = step; e <= 3; e += step) {
          const gg = profile.heightAt(gx + e, st);
          if (!Number.isFinite(gg) || gg < top - 0.05) break;
          if (gg - top < 0.08 * (e / step)) {
            top = Math.max(top, gg);
            break;
          }
          top = gg;
        }
        faceHeight = top - (Number.isFinite(g2) ? g2 : prev);
      }
    }
    if (Number.isFinite(prev) && dropDist === null && pitDist === null && prev - g >= 1.0 && gx - prevX <= 2 * step + 1e-9) {
      // Sharp edge. Pit if the ground comes back within 8 m, else a drop.
      let back: number | null = null;
      for (let e = step; e <= 8; e += step) {
        const gg = profile.heightAt(gx + e, st);
        if (Number.isFinite(gg) && gg >= prev - 0.35) {
          back = e;
          break;
        }
      }
      if (back !== null) {
        pitDist = d - step;
        pitWidth = back + step;
      } else {
        dropDist = d - step;
        dropDepth = prev - g;
      }
    } else if (Number.isFinite(prev) && dropDist === null && pitDist === null && base - g >= 0.8 && (prevX - x) < d) {
      // Gradual drop below the current level (a down-ramp / steep descent).
      dropDist = d;
      dropDepth = base - g;
    }
    prev = g;
    prevX = gx;
  }

  // Landing point when airborne: ballistic from the bike centre, ground sampled along the arc.
  let landingDist = 1;
  let landingSlopeDeg = profile.slopeAt(x + 1, 0.5, st) * RAD;
  if (airborne && speed > 0.5) {
    let tt = 0;
    for (let i = 0; i < 400; i++) {
      tt += 1 / 60;
      const px = x + speed * tt;
      const py = y + vy * tt - 0.5 * G * tt * tt;
      const g = profile.heightAt(px, st);
      if (Number.isFinite(g) && py - WHEEL_R <= g) {
        landingDist = px - x;
        landingSlopeDeg = profile.slopeAt(px, 0.75, st) * RAD;
        break;
      }
      if (py < gHere - 30) break;
    }
  }

  const nextSlopeDeg = profile.slopeAt(x + 0.65 + 1.5, 0.5, st) * RAD;
  let roughMin = Infinity;
  let roughMax = -Infinity;
  let risers = 0;
  let prevCell = NaN;
  for (let d = -1; d < 2 - 1e-9; d += GRID) {
    const g0 = profile.heightAt(x + d, st);
    const g1c = profile.heightAt(x + d + GRID, st);
    if (!Number.isFinite(g0) || !Number.isFinite(g1c)) {
      prevCell = NaN;
      continue;
    }
    const sc = Math.atan2(g1c - g0, GRID) * RAD;
    if (sc < roughMin) roughMin = sc;
    if (sc > roughMax) roughMax = sc;
    if (sc > 40 && prevCell < 8) risers++;
    prevCell = sc;
  }
  const roughDeg = roughMax > roughMin ? roughMax - roughMin : 0;
  const g1 = profile.heightAt(x + 1.0, st);
  const stepAhead = Number.isFinite(g1) ? g1 - base : -99;

  let checkpointAhead: number | null = null;
  for (const cp of track.checkpoints) {
    if (cp.x > x) {
      checkpointAhead = cp.x - x;
      break;
    }
  }

  return {
    t,
    phase,
    x,
    y,
    pitchDeg: st.bike.angle * RAD,
    pitchRateDeg: st.bike.angVel * RAD,
    speed,
    vy,
    height,
    rear: st.wheels.rear.grounded,
    front: st.wheels.front.grounded,
    slopeHereDeg: profile.slopeAt(x, 0.6, st) * RAD,
    terrainPitchDeg: terrainPitch(profile, x, st),
    ahead: {
      horizon,
      maxRise,
      riseDist,
      steepDeg,
      steepDist,
      faceDist,
      faceHeight,
      dropDist,
      dropDepth,
      pitDist,
      pitWidth,
      holeDist,
      landingSlopeDeg,
      landingDist,
      nextSlopeDeg,
      stepAhead,
      roughDeg,
      risers,
    },
    checkpointAhead,
    finishAhead: track.finishX - x,
  };
}

function terrainPitch(profile: GroundProfile, x: number, st: PhysicsState): number {
  const back = profile.heightAt(x - 0.6, st);
  const fwd = profile.heightAt(x + 0.7, st);
  if (!Number.isFinite(back) || !Number.isFinite(fwd)) return 0;
  return Math.atan2(fwd - back, 1.3) * RAD;
}
