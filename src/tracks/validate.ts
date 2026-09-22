/**
 * §5 validators (tracks round 9): eight pure checks over a `TrackDef`, each returning its violations as
 * strings (empty = pass), enforced by `src/tracks/validators.test.ts` on every curriculum track. They are
 * the authoring rules of `docs/design/tracks.md` §0 / §2 made executable: what the courses were built to,
 * so a later edit that breaks one fails with a number rather than a stranger round.
 */
import type { TrackDef, TrackTier } from '../core/types';
import { FEEL, FINISH_RUNOUT, validateFinishRunout } from './author';
import { footprint, isDecorKind, resolveParams, type ObstacleKind, type KindParams } from './kinds';

const TIER_ORDER: TrackTier[] = ['beginner', 'easy', 'medium', 'hard', 'extreme'];
const tierIndex = (t: TrackTier): number => TIER_ORDER.indexOf(t);
const deg = (rad: number): number => (rad * 180) / Math.PI;

export const VALIDATOR_RULES = {
  /** Consecutive checkpoint spawns (round 9): 12-18 s of bot time at 13 m/s is 156-234 m; a technical section at 7 m/s wants >= 60 m. */
  checkpointSpacing: { min: 60, max: 240 },
  /** The first checkpoint is the grid (start -> CP0), never further than this. */
  firstCheckpointMax: 90,
  /** Panic drop (§0 round 8): every beginner / easy drop over this exits on a straight down-ramp >= 8 x h (12 x h when the arrival is >= 14 m/s). */
  panicDrop: { step: 0.5, rampRatio: 8, fastRampRatio: 12, fastSpeed: 14, stairFlight: 1.0 },
  /** See-saws (§0 round 7): every 29 deg board crashes every rider; the <= 22.6 deg boards (8 x 1.6 and under) ride at every speed. */
  seesawMaxDeg: 23, // 8 x 1.6 (auto 22.6 deg) is the tallest measured board that rides; 6 x 1.5 / 8 x 2.0 (29 deg) crash every rider
  /** Kicker lips below hard (§0 round 7): straight and <= 17 deg; 22 deg only on H3 / X3 fire rows from >= 12 m/s. */
  lip: { maxDeg: 17, kickerHeight: 0.8 },
  /** Hop heights (§0 round 8): the gas-hop clears 0.3-0.6 m; no single rise above 0.6 anywhere, lesson ledges 0.4-0.5. */
  hop: { maxRise: 0.6 },
  /** Run-up jumps: a gap launched from a kicker after >= this much flat run-up is sized by the §0 curve (`FEEL.jumpRange` at `FEEL.speedAfter`). */
  runup: { minFlat: 10, carryFromSpawn: 0 },
} as const;

interface Solid {
  kind: ObstacleKind;
  x0: number;
  x1: number;
  /** Top height at the near / far edge (absolute y). */
  yNear: number;
  yFar: number;
  params: Record<string, unknown>;
  index: number;
}

/** Ground height of the profile at x (piecewise linear; clamps at the ends). */
export function groundAt(def: TrackDef, x: number): number {
  const p = def.profile;
  if (x <= p[0]!.x) return p[0]!.y;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!;
    const b = p[i]!;
    if (x <= b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  }
  return p[p.length - 1]!.y;
}

/** The rideable solids (ramp / box / ledge / wall / stair) with their footprint and top heights, in x order. */
export function solidsOf(def: TrackDef): Solid[] {
  const out: Solid[] = [];
  def.obstacles.forEach((o, index) => {
    if (isDecorKind(o.kind)) return;
    const k = o.kind as ObstacleKind;
    const p = resolveParams(k, o.params as never) as unknown as Record<string, number | string>;
    const y = o.pos.y;
    switch (k) {
      case 'ramp': {
        const up = p.direction !== 'down';
        out.push({ kind: k, x0: o.pos.x, x1: o.pos.x + (p.length as number), yNear: up ? y : y + (p.height as number), yFar: up ? y + (p.height as number) : y, params: p, index });
        break;
      }
      case 'box':
        out.push({ kind: k, x0: o.pos.x, x1: o.pos.x + (p.width as number), yNear: y + (p.height as number), yFar: y + (p.height as number), params: p, index });
        break;
      case 'ledge':
        out.push({ kind: k, x0: o.pos.x, x1: o.pos.x + (p.length as number), yNear: y + (p.height as number), yFar: y + (p.height as number), params: p, index });
        break;
      case 'wall':
        out.push({ kind: k, x0: o.pos.x, x1: o.pos.x + (p.width as number), yNear: y + (p.height as number), yFar: y + (p.height as number), params: p, index });
        break;
      case 'stair': {
        const up = p.direction !== 'down';
        const rise = (p.count as number) * (p.height as number);
        out.push({ kind: k, x0: o.pos.x, x1: o.pos.x + (p.count as number) * (p.length as number), yNear: up ? y : y + rise, yFar: up ? y + rise : y, params: p, index });
        break;
      }
      default:
        break;
    }
  });
  return out.sort((a, b) => a.x0 - b.x0);
}

const touching = (a: number, b: number): boolean => Math.abs(a - b) < 1e-3;

/** The kind of the non-decor obstacle whose footprint ends at x (a plank, drum, see-saw or gap feeding a solid), or null. */
function endsAt(def: TrackDef, x: number, within = 1e-3): string | null {
  for (const o of def.obstacles) {
    if (isDecorKind(o.kind)) continue;
    const end = o.pos.x + footprint(o.kind as ObstacleKind, o.params as never);
    if (end <= x + 1e-3 && end >= x - within) return o.kind;
  }
  return null;
}
/** Top height of the obstacle starting at x (what a jump lands on), or the ground there. */
function landingTopAt(def: TrackDef, x: number): number {
  for (const o of def.obstacles) {
    if (isDecorKind(o.kind) || !touching(o.pos.x, x)) continue;
    const p = resolveParams(o.kind as ObstacleKind, o.params as never) as unknown as Record<string, number | string>;
    switch (o.kind) {
      case 'box':
      case 'wall':
      case 'ledge':
        return o.pos.y + (p.height as number);
      case 'ramp':
        return p.direction === 'down' ? o.pos.y + (p.height as number) : o.pos.y;
      case 'drum':
        return o.pos.y + 2 * (p.radius as number) - (p.depth as number);
      case 'plank':
        return o.pos.y + (p.height as number);
      default:
        return groundAt(def, x + 0.01);
    }
  }
  return groundAt(def, x + 0.01);
}
/** The kind of the non-decor obstacle starting at x, or null. */
function startsAt(def: TrackDef, x: number): string | null {
  for (const o of def.obstacles) if (!isDecorKind(o.kind) && touching(o.pos.x, x)) return o.kind;
  return null;
}

/** 1. Finish run-out (round 6): 30 m flat, catch ramp + >= 2.5 m barrier, nothing on the flat. */
export function checkRunout(def: TrackDef): string[] {
  return validateFinishRunout(def).map((m) => `run-out: ${m}`);
}

/** 2. Checkpoint spacing: start -> CP0 <= 90 m, consecutive checkpoints 60-240 m apart. */
export function checkCheckpointSpacing(def: TrackDef): string[] {
  const out: string[] = [];
  const xs = def.checkpoints.map((c) => c.x);
  if (xs.length === 0) return ['checkpoint spacing: no checkpoints'];
  if (xs[0]! > VALIDATOR_RULES.firstCheckpointMax) out.push(`checkpoint spacing: CP0 at ${xs[0]!.toFixed(0)} m is ${xs[0]!.toFixed(0)} m from the start (max ${VALIDATOR_RULES.firstCheckpointMax})`);
  for (let i = 1; i < xs.length; i++) {
    const d = xs[i]! - xs[i - 1]!;
    if (d < VALIDATOR_RULES.checkpointSpacing.min || d > VALIDATOR_RULES.checkpointSpacing.max) out.push(`checkpoint spacing: CP${i - 1} -> CP${i} is ${d.toFixed(0)} m (want ${VALIDATOR_RULES.checkpointSpacing.min}-${VALIDATOR_RULES.checkpointSpacing.max})`);
  }
  const last = def.finishX - xs[xs.length - 1]!;
  if (last > VALIDATOR_RULES.checkpointSpacing.max) out.push(`checkpoint spacing: last checkpoint -> finish is ${last.toFixed(0)} m (max ${VALIDATOR_RULES.checkpointSpacing.max})`);
  return out;
}

/**
 * 3. Panic drop (beginner / easy): every drop over 0.5 m off a solid exits on a straight down-ramp >= 8 x h
 * (12 x h when a flat-out arrival is possible), never a bare edge or a stair flight >= 1.0 m down.
 */
export function checkPanicDrop(def: TrackDef): string[] {
  if (tierIndex(def.tier) > tierIndex('easy')) return [];
  const R = VALIDATOR_RULES.panicDrop;
  const out: string[] = [];
  const solids = solidsOf(def);
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i]!;
    if (s.x0 >= def.finishX) continue; // the catch
    if (s.kind === 'ramp') continue; // a down-ramp is the exit itself; an up-ramp's far edge is a launch (B3's kickers land on flat or a downslope), sized by the run-up rule
    if (startsAt(def, s.x1) === 'gap') continue; // a kicker or platform edge over a gap is a jump, sized by the run-up rule
    if (s.kind === 'stair' && s.params.direction === 'down') {
      const flight = s.yNear - s.yFar;
      if (def.tier === 'beginner' && flight >= R.stairFlight) out.push(`panic drop: ${flight.toFixed(2)} m stair flight down at ${s.x0.toFixed(1)} m (a held lean-back loops down any flight >= ${R.stairFlight} m; E3 teaches the brake-down and is exempt)`);
      continue;
    }
    const next = solids[i + 1];
    const landingY = next && touching(next.x0, s.x1) ? next.yNear : groundAt(def, s.x1 + 0.01);
    const drop = s.yFar - landingY;
    if (drop <= R.step + 1e-6) continue;
    if (next && touching(next.x0, s.x1) && next.kind === 'ramp' && next.params.direction === 'down') {
      const len = next.x1 - next.x0;
      const need = drop * R.rampRatio;
      if (len + 1e-6 < need) out.push(`panic drop: ${drop.toFixed(2)} m drop at ${s.x1.toFixed(1)} m exits on a ${len.toFixed(1)} m ramp (want >= ${need.toFixed(1)} = ${R.rampRatio} x h)`);
      continue;
    }
    out.push(`panic drop: ${drop.toFixed(2)} m bare ${s.kind} edge at ${s.x1.toFixed(1)} m (beginner / easy drops over ${R.step} m exit on a >= ${R.rampRatio} x h down-ramp)`);
  }
  return out;
}

/** 4. See-saws: resting angle <= 22 deg (explicit `angleDeg`, else the auto angle asin((h - t/2) / half) capped at 30). */
export function checkSeesaws(def: TrackDef): string[] {
  const out: string[] = [];
  for (const o of def.obstacles) {
    if (o.kind !== 'seesaw') continue;
    const p = resolveParams('seesaw', o.params as never) as KindParams['seesaw'];
    const auto = Math.min(30, deg(Math.asin(Math.min(1, (p.height - p.thickness / 2) / (p.length / 2)))));
    const a = p.angleDeg > 0 ? p.angleDeg : auto;
    if (a > VALIDATOR_RULES.seesawMaxDeg + 1e-6) out.push(`see-saw: ${p.length} x ${p.height} board at ${o.pos.x.toFixed(1)} m rests at ${a.toFixed(1)} deg (max ${VALIDATOR_RULES.seesawMaxDeg})`);
  }
  return out;
}

/** 5. Lips below hard: every free-standing kicker (up-ramp >= 0.8 m) is straight (curve <= 0) and <= 17 deg. */
export function checkLips(def: TrackDef): string[] {
  if (tierIndex(def.tier) >= tierIndex('hard')) return [];
  const out: string[] = [];
  for (const o of def.obstacles) {
    if (o.kind !== 'ramp') continue;
    const p = resolveParams('ramp', o.params as never) as KindParams['ramp'];
    if (p.direction === 'down' || p.height < VALIDATOR_RULES.lip.kickerHeight) continue;
    if (o.pos.x >= def.finishX) continue; // the catch
    const top = o.pos.y + p.height;
    const after = solidsOf(def).find((s) => touching(s.x0, o.pos.x + p.length));
    if (after && Math.abs(after.yNear - top) < 1e-3) continue; // a climb ramp onto a shelf / box top, not a kicker
    const a = deg(Math.atan2(p.height, p.length));
    const gapAfter = def.obstacles.find((g) => g.kind === 'gap' && touching(g.pos.x, o.pos.x + p.length));
    const gw = gapAfter ? (resolveParams('gap', gapAfter.params as never) as KindParams['gap']).width : 0;
    const smallGapLip = p.height <= 1.2 && gw > 0 && gw <= 3; // `smallGap` (b3 / e2): curve-0.3 lips <= 1.2 m over <= 3 m, stranger-passed in rounds 4-5 and kept until a stranger round proves the straight shape
    if (p.curve > 0 && !smallGapLip) out.push(`lip: ${p.length} x ${p.height} kicker at ${o.pos.x.toFixed(1)} m is curved (${p.curve}); below hard lips are straight`);
    if (a > VALIDATOR_RULES.lip.maxDeg + 1e-6) out.push(`lip: ${p.length} x ${p.height} kicker at ${o.pos.x.toFixed(1)} m is ${a.toFixed(1)} deg (max ${VALIDATOR_RULES.lip.maxDeg} below hard)`);
  }
  return out;
}

/**
 * 6. Hop heights: no single rise above 0.6 m anywhere — a ledge's rise over what precedes it, a box step up
 * off a touching solid, and a wall's step over the ramp in front (every lip wall is a `steppedWall`).
 */
export function checkHopHeights(def: TrackDef): string[] {
  const out: string[] = [];
  const solids = solidsOf(def);
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i]!;
    if (s.kind === 'ramp' || s.kind === 'stair') continue;
    if (s.x0 >= def.finishX) continue; // the catch barrier
    const prev = solids[i - 1];
    const feeder = endsAt(def, s.x0, 1.0); // within 1 m: a cap row / plank ends a step before its landing box
    if (feeder && feeder !== 'ramp' && feeder !== 'box' && feeder !== 'ledge' && feeder !== 'wall') continue; // fed by a plank / drum / see-saw / log / stair / pole row: a climb or a landing, not a hop
    const fromY = prev && touching(prev.x1, s.x0) ? prev.yFar : groundAt(def, s.x0 - 0.01);
    const rise = s.yNear - fromY;
    if (rise <= VALIDATOR_RULES.hop.maxRise + 1e-6) continue;
    if (prev && touching(prev.x1, s.x0) && prev.kind === 'ramp' && prev.params.direction !== 'down' && Math.abs(prev.yFar - s.yNear) < 1e-3) continue; // a ramp onto a shelf / box top: a climb, not a step
    if (s.kind === 'wall' && !(prev && touching(prev.x1, s.x0) && prev.kind === 'ramp')) {
      out.push(`hop: ${rise.toFixed(2)} m lip wall at ${s.x0.toFixed(1)} m has no B line (a ramp in front leaving <= ${VALIDATOR_RULES.hop.maxRise} m)`);
      continue;
    }
    out.push(`hop: ${rise.toFixed(2)} m ${s.kind} rise at ${s.x0.toFixed(1)} m (max ${VALIDATOR_RULES.hop.maxRise}: the v2 gas-hop's clear-air band)`);
  }
  return out;
}

/**
 * 7. Run-up jumps sized by the §0 curve: a gap launched off an up-ramp that follows >= 10 m of flat is no
 * wider than `FEEL.jumpRange(FEEL.speedAfter(runup), lipDeg)` — the range at the margin speed (H2's crane
 * jump: 7 m from 26 m wanted 12.5 m/s raw and was a wall; the rule says 6.8 m).
 */
export function checkRunupJumps(def: TrackDef): string[] {
  const out: string[] = [];
  const obs = def.obstacles.map((o, i) => ({ o, i })).filter(({ o }) => !isDecorKind(o.kind));
  const solids = solidsOf(def);
  const spawns = [0, ...def.checkpoints.map((c) => c.x + 0.5)];
  for (let k = 0; k < obs.length; k++) {
    const { o } = obs[k]!;
    if (o.kind !== 'gap') continue;
    const prev = obs[k - 1]?.o;
    if (!prev || prev.kind !== 'ramp') continue;
    const rp = resolveParams('ramp', prev.params as never) as KindParams['ramp'];
    if (rp.direction === 'down' || !touching(prev.pos.x + rp.length, o.pos.x)) continue;
    // Flat run-up: back from the ramp foot to the nearer of the previous solid's end and the last spawn.
    const foot = prev.pos.x;
    const before = solids.findLast((s) => s.x1 <= foot + 1e-6 && s.x1 < foot - 1e-6);
    const spawn = spawns.findLast((x) => x <= foot) ?? 0;
    const from = Math.max(before?.x1 ?? -Infinity, spawn);
    const runup = foot - from;
    if (runup < VALIDATOR_RULES.runup.minFlat) continue;
    if (Math.abs(groundAt(def, from) - groundAt(def, foot)) > 0.05) continue; // not flat (a descent credits more, a climb is not a run-up)
    const gp = resolveParams('gap', o.params as never) as KindParams['gap'];
    const v = FEEL.speedAfter(runup);
    const lipDeg = deg(Math.atan2(rp.height, rp.length));
    const lipTop = prev.pos.y + rp.height;
    const landing = def.obstacles.find((l) => l.kind === 'ramp' && touching(l.pos.x, o.pos.x + gp.width));
    const incline = !!landing && (resolveParams('ramp', landing.params as never) as KindParams['ramp']).direction !== 'down';
    // The §0 row was measured landing AT lip height. A landing incline (`gapLanding`, a lip) forgives +0.5 m (a short jump
    // meets the ramp, not a face); a landing below the lip (a drum top, a lower shelf) is credited at most 0.5 m of drop —
    // the full fall is NOT credited: H2's 7 m over 1.5 m of drop passed the parabola and walled the reflex 70 deaths in 9 seeds.
    const drop = incline ? 0 : Math.min(0.5, Math.max(0, lipTop - landingTopAt(def, o.pos.x + gp.width)));
    const range = FEEL.jumpRange(v, lipDeg, drop);
    const tol = incline ? 0.5 : 0;
    if (gp.width > range + tol + 1e-6) out.push(`run-up jump: ${gp.width} m gap at ${o.pos.x.toFixed(1)} m off a ${lipDeg.toFixed(0)} deg lip after ${runup.toFixed(0)} m of flat — jumpRange at the margin speed (${v.toFixed(1)} m/s) is ${range.toFixed(1)} m`);
  }
  return out;
}

/** 8. Medal targets monotone: `targetTimeS` non-decreasing through each tier and across tiers, in curriculum order. */
export function checkMedalsMonotone(tracks: readonly TrackDef[]): string[] {
  const out: string[] = [];
  let lastTier = -1;
  let last = 0;
  for (const t of tracks) {
    const ti = tierIndex(t.tier);
    const target = t.meta?.targetTimeS ?? 0;
    if (ti < lastTier) continue; // registry order is curriculum order; anything else is not judged here
    if (target < last - 1e-6) out.push(`medals: ${t.id} targetTimeS ${target} < the previous track's ${last}`);
    last = target;
    lastTier = ti;
  }
  return out;
}

/** Every per-track validator (1-7) over one course; 8 (`checkMedalsMonotone`) takes the tier list. */
export function validateCourse(def: TrackDef): string[] {
  return [...checkRunout(def), ...checkCheckpointSpacing(def), ...checkPanicDrop(def), ...checkSeesaws(def), ...checkLips(def), ...checkHopHeights(def), ...checkRunupJumps(def)];
}

export { FINISH_RUNOUT };
