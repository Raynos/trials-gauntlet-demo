/**
 * Authoring DSL: a track reads like a course description.
 *
 *   course('b1-first-ride', 'First Ride', 'beginner')
 *     .meta({ biome: 'industrial', technique: 'throttle control', ... })
 *     .flat(20).ramp({ length: 4, height: 1.2 }).gap({ width: 3 }).checkpoint().flat(4)
 *     ...
 *     .finish();
 *
 * The builder keeps a cursor (x) and the ground level (y). Ground ops
 * (flat / slope / smooth / rollers) extend the profile; obstacle ops place an
 * obstacle at the cursor with pos.y = ground (+ optional `base` when stacked on a
 * platform) and advance the cursor by the obstacle's footprint. Solids may not
 * overlap each other's footprints and, like gaps, must stand on level ground.
 *
 * Spawns (CONTRACT §2.4): `checkpoint()` records the rear-wheel contact point at
 * cursor + 0.5 with angle 0; `finish()` verifies both wheels sit on one flat
 * profile segment with clearance, and applies the round-4 checkpoint rule
 * (`CHECKPOINT_RULE`): >= 15 m of flat-or-descending run-up from every spawn to the
 * first obstacle that needs speed, and no checkpoint within 8 m of a landing zone.
 *
 * Feel envelope helpers (CONTRACT §2.5, authored with 20 % margin) live in `FEEL`.
 */
import type { CameraKey, TrackCheckpoint, TrackDef, TrackMeta, TrackObstacle, TrackTier, Vec2 } from '../core/types';
import { seedFromString } from '../core/rng';
import { footprint, isSolidKind, type KindParams, type ObstacleKind, type ParamRecord } from './kinds';

// ---------------------------------------------------------------------------
// Feel envelope (CONTRACT §2.5) with 20 % authoring margin
// ---------------------------------------------------------------------------

export const FEEL = {
  wheelbase: 1.3,
  wheelRadius: 0.34,
  /** Average acceleration on flat dirt (16 m/s in 3.5 s). */
  accel: 16 / 3.5,
  topSpeed: 20,
  /** Physics round 2 measured: 0.3 throttle tops out at 11.3 m/s (partial-throttle cruise). */
  cruiseSpeedAt30pct: 11.3,
  /** Physics round 2 (e692bf2) measured: brake from 10 m/s = 4.66 m => 10.7 m/s^2 (contract asks <= 4.5). */
  brakeDecel: 10.7,
  /** Physics round 2 measured stationary hop apex 0.74 m (contract band 0.55..0.75); with 5 m/s run-up a 0.9 m ledge is makeable. */
  hopStationary: 0.74,
  hopRolling: 0.9,
  climbSustainedDeg: 60,
  climbStallDeg: 65,
  margin: 0.8,
  g: 9.81,
  /** Speed reachable from rest over `d` metres of flat run-up (capped at top speed), with margin. */
  speedAfter(d: number, v0 = 0): number {
    return Math.min(this.topSpeed, Math.sqrt(v0 * v0 + 2 * this.accel * d)) * this.margin;
  },
  /** Run-up needed to reach v (before margin is applied to v). */
  runupFor(v: number): number {
    const vv = v / this.margin;
    return (vv * vv) / (2 * this.accel);
  },
  /** Braking distance from v, with margin. */
  brakeDistance(v: number): number {
    return (v * v) / (2 * this.brakeDecel) / this.margin;
  },
  /** Horizontal range of a jump launched at v along a ramp of `angleDeg`, landing `drop` m lower (negative = higher). */
  jumpRange(v: number, angleDeg: number, drop = 0): number {
    const th = (angleDeg * Math.PI) / 180;
    const vx = v * Math.cos(th);
    const vy = v * Math.sin(th);
    const disc = vy * vy + 2 * this.g * drop;
    if (disc < 0) return 0;
    const t = (vy + Math.sqrt(disc)) / this.g;
    return vx * t;
  },
  /** Max ledge height for a hop, stationary or rolling, with margin. */
  hopLedge(rolling: boolean): number {
    return (rolling ? this.hopRolling : this.hopStationary) * this.margin;
  },
  /** Max sustained climb angle to author (deg), with margin. */
  climbDeg(): number {
    return this.climbSustainedDeg * this.margin;
  },
  /**
   * Crest radius that keeps both wheels on the ground at `v` (centripetal g). A cosine
   * `smooth(l, dy)` has crest curvature 0.5 * dy * (pi / l)^2, so it stays grounded at v when
   * l >= pi * v * sqrt(dy / 2g): 16 m/s and 1 m needs 11.4 m per half, a 2 m wave 32 m in all.
   * Round 4: B1's 20 m x 2.0 m wave (crest radius 10 m) launched every stranger above 10 m/s.
   */
  crestRadius(v: number): number {
    return (v * v) / this.g;
  },
  /** Half-length a `smooth` rise/fall of `dy` needs so the crest never launches at `v`. */
  smoothLengthFor(dy: number, v = 16): number {
    return Math.PI * v * Math.sqrt(Math.abs(dy) / (2 * this.g));
  },
} as const;

// ---------------------------------------------------------------------------
// Checkpoint rule (round 4, authored to the stranger)
// ---------------------------------------------------------------------------

/**
 * Round 4 stranger measurement: 8 of 21 B3 deaths were at a kicker 4 m past a checkpoint
 * ("respawns 2-3 m before the kicker with no room to build speed"), 9 of 20 E1 deaths at a
 * 48 deg plank 3 m past one. A respawn that cannot reach the speed its first obstacle needs
 * turns one crash into a full-segment wall.
 */
export const CHECKPOINT_RULE = {
  /** Flat-or-descending run-up a spawn needs before the first obstacle that needs speed. */
  runupMin: 15,
  /** Steep planks (>= steepPlankDeg) need more: E1's 48 deg wall wanted 20 m. */
  steepRunupMin: 20,
  steepPlankDeg: 45,
  /** A checkpoint may not sit within this distance after a feature's landing zone. */
  afterLanding: 8,
  /** How far past a launch (kicker, gap, drop) the landing zone is taken to extend. */
  launchCarry: 6,
  /** Bumps this low (humps, rollers, sunk drums) are flow: they neither block a run-up nor count as features. */
  flowHeight: 0.35,
  /** Walls / ledges above this need a rolling hop, i.e. speed (stationary hop apex 0.74 x 0.8). */
  hopHeight: 0.6,
  /** Free-standing up-ramps at least this tall are kickers a stranger treats as a jump. */
  kickerHeight: 1.0,
} as const;

export interface CheckpointViolation {
  spawn: string;
  spawnX: number;
  kind: 'runup' | 'after-landing';
  obstacle: string;
  obstacleX: number;
  /** Metres available (run-up) or metres after the landing zone. */
  have: number;
  need: number;
  message: string;
}

export interface CheckpointAuditRow {
  spawn: string;
  spawnX: number;
  /** First obstacle after the spawn that needs speed (or '-' when the segment has none). */
  firstSpeedObstacle: string;
  firstSpeedX: number | null;
  runup: number | null;
  runupNeed: number | null;
  /** Distance from the previous feature's landing zone to this checkpoint (null for the start). */
  afterLanding: number | null;
  ok: boolean;
}

interface Feature {
  index: number;
  kind: ObstacleKind;
  x0: number;
  x1: number;
  base: number;
  /** Height of the riding surface above the local ground at the exit end (0 when it returns to ground). */
  exitHeight: number;
  /** Bumps <= flowHeight: humps, rollers, sunk drums. */
  flow: boolean;
  /** Needs speed from the spawn: gap, kicker, hop wall, steep plank. */
  speed: false | 'gap' | 'kicker' | 'wall' | 'ledge' | 'steep plank' | 'fire' | 'pole';
  /** Leaves the bike airborne: a kicker, a gap, a drop off a raised exit. */
  launch: boolean;
  /**
   * Kills the run-up: a rise the bike has to climb (ramp / plank onto a box, wall, ledge,
   * stair up) or something ridden slowly (drum, log pile, poles, barrels). Gaps, see-saws,
   * boxes landed on and every descent are ridden at speed and do not block.
   */
  blocks: boolean;
  /** Previous feature ends where this one starts (tabletop top, kicker -> gap, ledge -> gap). */
  adjacentBefore: boolean;
}

function num(v: unknown, d: number): number {
  return typeof v === 'number' ? v : d;
}

function profileY(profile: readonly Vec2[], x: number): number {
  const first = profile[0] as Vec2;
  if (x <= first.x) return first.y;
  for (let i = 1; i < profile.length; i++) {
    const b = profile[i] as Vec2;
    if (x <= b.x + 1e-9) {
      const a = profile[i - 1] as Vec2;
      const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return a.y + (b.y - a.y) * t;
    }
  }
  return (profile[profile.length - 1] as Vec2).y;
}

function features(def: TrackDef): Feature[] {
  const obs = def.obstacles.map((o, index) => ({ o, index })).sort((a, b) => a.o.pos.x - b.o.pos.x || a.index - b.index);
  const out: Feature[] = [];
  const R = CHECKPOINT_RULE;
  for (let k = 0; k < obs.length; k++) {
    const { o, index } = obs[k] as { o: TrackObstacle; index: number };
    const kind = o.kind as ObstacleKind;
    const rp = o.params ?? {};
    const x0 = o.pos.x;
    const x1 = x0 + footprint(kind, rp);
    const ground = profileY(def.profile, x0);
    const base = o.pos.y - ground;
    const next = obs[k + 1]?.o;
    const prev = obs[k - 1]?.o;
    const nextKind = next?.kind as ObstacleKind | undefined;
    const touchesNext = !!next && Math.abs(next.pos.x - x1) < 1e-3;
    // adjacent solid = the ride continues on top (tabletop top, drum shelf, platform)
    const adjacentSolid = touchesNext && isSolidKind(nextKind as ObstacleKind);
    const adjacentGap = touchesNext && (nextKind === 'gap' || nextKind === 'pole');
    const adjacentBefore = !!prev && Math.abs(prev.pos.x + footprint(prev.kind as ObstacleKind, prev.params ?? {}) - x0) < 1e-3;
    let exitHeight = 0;
    let flow = false;
    let speed: Feature['speed'] = false;
    let launch = false;
    let blocks = true;
    switch (kind) {
      case 'ramp': {
        const h = num(rp['height'], 1);
        const up = (rp['direction'] ?? 'up') === 'up';
        exitHeight = up ? base + h : base;
        flow = h <= R.flowHeight && base === 0;
        if (!up) blocks = false;
        if (up && !adjacentSolid && !flow) {
          launch = true;
          blocks = false;
          // a free kicker into flat ground: a stranger jumps it; a kicker into a gap is measured as the gap
          if (h >= R.kickerHeight && !adjacentGap) speed = 'kicker';
        }
        break;
      }
      case 'plank': {
        const ang = num(rp['angleDeg'], 0);
        const len = num(rp['length'], 4);
        exitHeight = Math.max(0, base + num(rp['height'], 0) + len * Math.sin((ang * Math.PI) / 180));
        // a steep plank on the ground wants speed (E1: 9 of 20 deaths at a 48 deg foot 3 m past a spawn); one
        // stacked on a wall / box top is climbed from that top at walking pace by design (X1)
        if (ang >= R.steepPlankDeg && base === 0) speed = 'steep plank';
        if (ang <= 0) blocks = false;
        launch = exitHeight > R.flowHeight && !adjacentSolid;
        break;
      }
      case 'gap': {
        const w = num(rp['width'], 3);
        // <= 2 m straight off a ledge / box / drum top is a standing hop across (M1's lesson; M2 / X2 drum
        // top to drum top, physics 12.3: a spinning top cannot be pumped, so 2 m is the whole envelope)
        const hopAcross = w <= 2 && adjacentBefore && (prev?.kind === 'ledge' || prev?.kind === 'box' || prev?.kind === 'drum');
        // a slot narrower than a wheel (H1's wheelie wire, 0.7 m) is crossed with the front up at any speed, not jumped
        const slot = w <= 1.0;
        // a pole-cap pit entered from a box / wall top is hopped cap to cap at walking pace (X1's demand)
        const polePit = !!next && nextKind === 'pole' && Math.abs(next.pos.x - x0) < 1e-3;
        const capsFromTop = polePit && adjacentBefore && (prev?.kind === 'box' || prev?.kind === 'wall');
        // a gap off the last pole cap (X1: 4 m down 2.5 m onto a plank) is part of the cap-hop chain
        const fromCaps = adjacentBefore && prev?.kind === 'pole';
        speed = hopAcross || slot || capsFromTop || fromCaps ? false : 'gap';
        launch = true;
        blocks = false;
        break;
      }
      case 'wall': {
        const h = num(rp['height'], 1);
        exitHeight = base + h;
        // a lip climb (front wheel onto the lip at ~5 m/s, hop the rear) is a low-speed technique: the
        // skill-3 bot clears X1's 1.2 m lip wall + 56 deg plank from a 3 m run-in and STALLS from 16 m
        if (h >= R.hopHeight && num(rp['lip'], 0) <= 0) speed = 'wall';
        launch = !adjacentSolid;
        break;
      }
      case 'ledge': {
        const h = num(rp['height'], 0.5);
        exitHeight = base + h;
        if (h >= R.hopHeight) speed = 'ledge';
        launch = !adjacentSolid && !adjacentGap;
        break;
      }
      case 'box':
        exitHeight = base + num(rp['height'], 1);
        launch = !adjacentSolid && !adjacentGap;
        blocks = !adjacentBefore; // a box entered from flat ground is a wall; one on a ramp / after a gap is ridden over
        break;
      case 'stair': {
        const rise = num(rp['count'], 5) * num(rp['height'], 0.3);
        const up = (rp['direction'] ?? 'up') === 'up';
        exitHeight = up ? base + rise : base;
        launch = up && !adjacentSolid;
        blocks = up;
        break;
      }
      case 'drum': {
        const r = num(rp['radius'], 0.8);
        const proud = 2 * r - num(rp['depth'], 0);
        exitHeight = base;
        flow = proud <= R.flowHeight && base === 0;
        break;
      }
      case 'seesaw':
        exitHeight = base;
        blocks = false;
        break;
      case 'logpile':
        exitHeight = base;
        break;
      case 'pole':
        // a cap is balance, not speed; a `poleRow` stands in a kill pit whose gap is the speed obstacle
        exitHeight = base + num(rp['height'], 1.5);
        launch = true;
        break;
      case 'barrel':
        exitHeight = base;
        if ((rp['burning'] ?? true) === true) speed = 'fire';
        break;
    }
    if (flow) blocks = false;
    out.push({ index, kind, x0, x1, base, exitHeight, flow, speed, launch, blocks, adjacentBefore });
  }
  return out;
}

/**
 * Where a gap's run-up is measured: at the foot of the kicker that launches it when one touches
 * it (the ramp face is not run-up), else at the gap lip itself (a ledge / box / drum top before
 * it is ridden and counts). Returns the feature to measure at and the riding height there.
 */
function launchPoint(def: TrackDef, feats: Feature[], f: Feature): { at: Feature; y: number } {
  const i = feats.indexOf(f);
  const prev = i > 0 ? (feats[i - 1] as Feature) : null;
  if (f.kind === 'gap' && f.adjacentBefore && prev && prev.kind === 'ramp' && prev.launch) {
    return { at: prev, y: profileY(def.profile, prev.x0) + prev.base };
  }
  if (f.kind === 'gap' && f.adjacentBefore && prev) return { at: f, y: profileY(def.profile, f.x0) + prev.exitHeight };
  return { at: f, y: profileY(def.profile, f.x0) + f.base };
}

/**
 * Effective flat-or-descending run-up into `x`: walking back from `x`, the ground may not sit
 * more than `flowHeight` below the highest ground seen (a forward rise ends the run-up), and
 * any blocking feature ends it at its exit. Descent is credited at g/a ~= 2 m of flat per metre
 * dropped (the exit height of a blocking feature counts: a stair descent off a box is run-up).
 */
function runup(def: TrackDef, feats: Feature[], x: number, yObs: number, floor: number): { start: number; effective: number } {
  let start = floor;
  let startHeight = 0;
  for (const f of feats) {
    if (f.blocks && f.x1 <= x + 1e-9 && f.x1 > start) {
      start = f.x1;
      startHeight = f.exitHeight;
    }
  }
  let runningMax = profileY(def.profile, x);
  for (let i = def.profile.length - 1; i >= 0; i--) {
    const p = def.profile[i] as Vec2;
    if (p.x >= x) continue;
    if (p.x <= start) break;
    if (p.y < runningMax - CHECKPOINT_RULE.flowHeight) {
      const nxt = def.profile[i + 1] as Vec2;
      start = Math.max(start, Math.min(nxt.x, x));
      startHeight = 0;
      break;
    }
    runningMax = Math.max(runningMax, p.y);
  }
  const drop = Math.max(0, profileY(def.profile, start) + startHeight - yObs);
  return { start, effective: x - start + 2 * drop };
}

/**
 * Checkpoint rule (round 4): every spawn (start and each checkpoint) has >= runupMin m of
 * effective flat-or-descending run-up before the first obstacle after it that needs speed
 * (gap, kicker >= 1 m into flat, wall / ledge >= 0.6 m, burning barrels, poles; a plank
 * >= 45 deg needs steepRunupMin), or that obstacle lies past the next checkpoint. A gap is
 * measured from the start of the kicker / ledge chain that launches it. And no checkpoint
 * sits within afterLanding m of a feature's landing zone (feature end, + launchCarry when
 * it launches).
 */
export function auditCheckpoints(def: TrackDef): { rows: CheckpointAuditRow[]; violations: CheckpointViolation[] } {
  const feats = features(def);
  const spawns = [{ label: 'start', x: def.start.pos.x, cpX: def.start.pos.x }, ...def.checkpoints.map((c, i) => ({ label: `cp${i}`, x: c.spawn.pos.x, cpX: c.x }))];
  const rows: CheckpointAuditRow[] = [];
  const violations: CheckpointViolation[] = [];
  spawns.forEach((s, i) => {
    const segEnd = i + 1 < spawns.length ? (spawns[i + 1] as { cpX: number }).cpX : def.finishX;
    const first = feats.find((f) => f.speed && f.x0 >= s.x && f.x0 < segEnd);
    let have: number | null = null;
    let need: number | null = null;
    let ok = true;
    if (first) {
      need = first.speed === 'steep plank' ? CHECKPOINT_RULE.steepRunupMin : CHECKPOINT_RULE.runupMin;
      const { at, y: yObs } = launchPoint(def, feats, first);
      have = runup(def, feats, at.x0, yObs, s.x).effective;
      if (have < need - 1e-6) {
        ok = false;
        violations.push({
          spawn: s.label,
          spawnX: s.x,
          kind: 'runup',
          obstacle: `${first.kind} #${first.index} (${first.speed})`,
          obstacleX: at.x0,
          have,
          need,
          message: `[${def.id}] ${s.label} spawn at x=${s.x}: ${first.kind} #${first.index} (${first.speed}) launched at x=${at.x0.toFixed(1)} has ${have.toFixed(1)} m of flat-or-descending run-up, needs ${need}`,
        });
      }
    }
    let afterLanding: number | null = null;
    if (i > 0) {
      let worst = Infinity;
      let worstF: Feature | null = null;
      for (const f of feats) {
        if (f.flow || f.x1 > s.cpX + 1e-9) continue;
        const landingEnd = f.x1 + (f.launch ? CHECKPOINT_RULE.launchCarry : 0);
        const d = s.cpX - landingEnd;
        if (d < worst) {
          worst = d;
          worstF = f;
        }
      }
      if (worstF) {
        afterLanding = worst;
        if (worst < CHECKPOINT_RULE.afterLanding - 1e-6) {
          ok = false;
          violations.push({
            spawn: s.label,
            spawnX: s.x,
            kind: 'after-landing',
            obstacle: `${worstF.kind} #${worstF.index}`,
            obstacleX: worstF.x0,
            have: worst,
            need: CHECKPOINT_RULE.afterLanding,
            message: `[${def.id}] checkpoint ${s.label} at x=${s.cpX} is ${worst.toFixed(1)} m after the landing zone of ${worstF.kind} #${worstF.index} at x=${worstF.x0.toFixed(1)} (needs ${CHECKPOINT_RULE.afterLanding})`,
          });
        }
      }
    }
    rows.push({
      spawn: s.label,
      spawnX: s.x,
      firstSpeedObstacle: first ? `${first.kind} #${first.index} (${first.speed})` : '-',
      firstSpeedX: first ? first.x0 : null,
      runup: have,
      runupNeed: need,
      afterLanding,
      ok,
    });
  });
  return { rows, violations };
}

/** Throws on the first checkpoint-rule violation (called from `finish()`; the test suite checks every track too). */
export function validateCheckpoints(def: TrackDef): void {
  const { violations } = auditCheckpoints(def);
  if (violations.length) throw new Error(violations.map((v) => v.message).join('\n'));
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export type ObstacleOpts = {
  /** Base elevation above the ground (stack on a platform). */
  base?: number;
};

type Partial2<T> = { [K in keyof T]?: T[K] };

export class CourseBuilder {
  private x = 0;
  private y = 0;
  private readonly profile: Vec2[] = [
    { x: -10, y: 0 },
    { x: 0, y: 0 },
  ];
  private readonly obstacles: TrackObstacle[] = [];
  private readonly checkpoints: TrackCheckpoint[] = [];
  private readonly cameras: CameraKey[] = [];
  private readonly hints: string[] = [];
  private readonly footprints: { x0: number; x1: number; kind: string }[] = [];
  private metaData: TrackMeta | null = null;
  private openCamera: CameraKey | null = null;

  constructor(
    readonly id: string,
    readonly name: string,
    readonly tier: TrackTier,
  ) {}

  /** Current cursor x. */
  get cursor(): number {
    return this.x;
  }
  /** Current ground level. */
  get ground(): number {
    return this.y;
  }

  meta(m: Omit<TrackMeta, 'camera' | 'hints'>): this {
    this.metaData = { ...m };
    return this;
  }

  // -- ground ---------------------------------------------------------------

  flat(length: number): this {
    this.assertPositive(length, 'flat length');
    this.x += length;
    this.pushProfile(this.x, this.y);
    return this;
  }

  /** Linear slope over `length` rising `dy` (negative = descent). */
  slope(length: number, dy: number): this {
    this.assertPositive(length, 'slope length');
    const deg = (Math.atan2(Math.abs(dy), length) * 180) / Math.PI;
    if (deg > 40) throw new Error(`[${this.id}] slope ${deg.toFixed(1)} deg at x=${this.x} is too steep for ground; use a ramp or plank`);
    this.x += length;
    this.y += dy;
    this.pushProfile(this.x, this.y);
    return this;
  }

  /** Cosine-eased rise/fall baked at <= 0.25 m spacing. */
  smooth(length: number, dy: number): this {
    this.assertPositive(length, 'smooth length');
    const n = Math.max(2, Math.ceil(length / 0.25));
    const x0 = this.x;
    const y0 = this.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const e = 0.5 - 0.5 * Math.cos(Math.PI * t);
      this.pushProfile(x0 + length * t, y0 + dy * e);
    }
    this.x = x0 + length;
    this.y = y0 + dy;
    return this;
  }

  /** `count` sine bumps of `amplitude` (peak height) over `length`, returning to the same level. */
  rollers(length: number, amplitude: number, count: number): this {
    this.assertPositive(length, 'rollers length');
    const n = Math.max(4 * count, Math.ceil(length / 0.25));
    const x0 = this.x;
    const y0 = this.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const bump = 0.5 - 0.5 * Math.cos(2 * Math.PI * count * t);
      this.pushProfile(x0 + length * t, y0 + amplitude * bump);
    }
    this.x = x0 + length;
    return this;
  }

  /** Alias of flat: spacing between obstacles. */
  space(length: number): this {
    return this.flat(length);
  }

  // -- obstacles ------------------------------------------------------------

  ramp(p: Partial2<KindParams['ramp']>, o?: ObstacleOpts): this {
    return this.place('ramp', p, o);
  }
  /** Give `height` (rise) or `length`; with both, `length` wins. */
  plank(p: Partial2<KindParams['plank']> & { rise?: number }, o?: ObstacleOpts): this {
    const { rise, ...rest } = p;
    const params: Partial2<KindParams['plank']> = { ...rest };
    if (rise !== undefined && params.length === undefined) {
      const ang = ((params.angleDeg ?? 0) * Math.PI) / 180;
      if (Math.abs(Math.sin(ang)) < 1e-6) throw new Error(`[${this.id}] plank rise needs a non-zero angle`);
      params.length = Math.abs(rise / Math.sin(ang));
    }
    return this.place('plank', params, o);
  }
  drum(p: Partial2<KindParams['drum']>, o?: ObstacleOpts): this {
    return this.place('drum', p, o);
  }
  gap(p: Partial2<KindParams['gap']> | number): this {
    return this.place('gap', typeof p === 'number' ? { width: p } : p);
  }
  wall(p: Partial2<KindParams['wall']>, o?: ObstacleOpts): this {
    return this.place('wall', p, o);
  }
  seesaw(p: Partial2<KindParams['seesaw']>, o?: ObstacleOpts): this {
    return this.place('seesaw', p, o);
  }
  logpile(p: Partial2<KindParams['logpile']>, o?: ObstacleOpts): this {
    return this.place('logpile', p, o);
  }
  stair(p: Partial2<KindParams['stair']>, o?: ObstacleOpts): this {
    return this.place('stair', p, o);
  }
  box(p: Partial2<KindParams['box']>, o?: ObstacleOpts): this {
    return this.place('box', p, o);
  }
  pole(p: Partial2<KindParams['pole']>, o?: ObstacleOpts): this {
    return this.place('pole', p, o);
  }
  barrel(p: Partial2<KindParams['barrel']>, o?: ObstacleOpts): this {
    return this.place('barrel', p, o);
  }
  ledge(p: Partial2<KindParams['ledge']>, o?: ObstacleOpts): this {
    return this.place('ledge', p, o);
  }

  /**
   * Steep plank with a short concave ramp fillet at its foot, so the entry is a curve
   * rather than a corner (physics round 2: 55-65 deg planks wedge at a sharp base).
   * The fillet takes `filletHeight` of the rise; the plank climbs the rest at `angleDeg`.
   */
  steepPlank(p: { angleDeg: number; rise: number; filletHeight?: number; filletLength?: number }, o?: ObstacleOpts): this {
    const fh = p.filletHeight ?? 0.35;
    const fl = p.filletLength ?? 1.2;
    const base = o?.base ?? 0;
    this.ramp({ length: fl, height: fh, curve: 0.8 }, { base });
    return this.plank({ angleDeg: p.angleDeg, rise: p.rise - fh }, { base: base + fh });
  }

  /** Speed bump: convex ramp up and down, `height` <= 0.3 rolls at any speed. */
  hump(height = 0.3, length = 3): this {
    return this.ramp({ length: length / 2, height, curve: -0.5 }).ramp({ length: length / 2, height, curve: -0.5, direction: 'down' });
  }

  /**
   * Drum with an approach step: a ramp up to a 1 m shelf at drum-centre height + 0.4, so
   * the wheel meets the drum ABOVE its centre (contact normal <= ~56 deg from vertical for
   * r <= 1.0) instead of the >= 86 deg wedge a bare drum presents to a 0.34 m wheel.
   * Physics round 4 (physics.md 12.3): r >= 0.6 on flat ground is unrideable in any
   * technique, and M2's 1.2 m box -> 0.8 m drum is the one measured way over a big drum.
   * `exit` adds the mirror shelf + ramp so the far side is a 0.4 m step down, not a 2r drop.
   */
  drumStep(p: Partial2<KindParams['drum']>, opts: { exit?: boolean; rampLength?: number } & ObstacleOpts = {}): this {
    const r = p.radius ?? 0.8;
    const h = r + 0.4;
    const len = opts.rampLength ?? (h <= 1.0 ? 3 : h <= 1.3 ? 4 : 5);
    const o: ObstacleOpts | undefined = opts.base !== undefined ? { base: opts.base } : undefined;
    this.ramp({ length: len, height: h }, o).box({ width: 1.0, height: h }, o).drum(p, o);
    if (opts.exit) this.box({ width: 1.0, height: h }, o).ramp({ length: len, height: h, direction: 'down' }, o);
    return this;
  }

  /** Round speed bump: a drum sunk so only `proud` m shows (<= 0.3 rolls at any speed with a constant lean, physics 12.3). */
  bumpDrum(radius = 0.5, proud = 0.3, extra: Partial2<KindParams['drum']> = {}): this {
    return this.drum({ radius, depth: 2 * radius - proud, ...extra });
  }

  /**
   * Log pyramid with a 0.3 m entry ramp so the wheel meets the first log at its centre height
   * (contact normal <= 58 deg) instead of the 86 deg wall a bare 0.3 m log is (physics 12.3;
   * sweep 3: the skill-2 bot failed a bare log 50 times).
   */
  logStep(p: Partial2<KindParams['logpile']>, o?: ObstacleOpts): this {
    const r = p.radius ?? 0.3;
    return this.ramp({ length: 1.5, height: r, curve: 0.5 }, o).logpile(p, o);
  }

  /**
   * Row of pole caps at `spacing` between shafts, standing in one kill pit: a missed cap is a
   * fault and a restart, not a stall on the ground under a 2-4 m pole (sweep 3: the skill-3
   * bot sat wall-bound between X1's rising poles, 3 attempts in 240 s, no fault to restart on).
   */
  poleRow(heights: number[], spacing: number, opts: { radius?: number; pit?: number } = {}): this {
    const r = opts.radius ?? 0.25;
    const n = heights.length;
    const width = n * 2 * r + (n - 1) * spacing;
    const x0 = this.x;
    const pit = opts.pit ?? 2;
    if (pit > 0) {
      this.gap({ width, depth: pit, hazard: 'kill' });
      this.x = x0;
    }
    heights.forEach((h, i) => {
      this.pole({ height: h, radius: r });
      if (i < n - 1) this.x = round(this.x + spacing);
    });
    this.x = round(x0 + width);
    return this;
  }

  /** Flow: `count` speed humps at `pitch` m spacing, each `height` (<= 0.3 rolls at any speed). */
  humpRow(count: number, height = 0.3, pitch = 6, length = 3): this {
    for (let i = 0; i < count; i++) {
      this.hump(height, length);
      if (i < count - 1) this.flat(pitch - length);
    }
    return this;
  }

  /**
   * Flow: a smooth rise and fall (a berm roll) that keeps speed. `groundedAt` (m/s, default 0 =
   * unchecked) asserts the crest cannot launch below that speed (FEEL.smoothLengthFor): the
   * beginner tier passes 16 so a full-gas stranger stays on the ground.
   */
  wave(length: number, dy: number, groundedAt = 0): this {
    if (groundedAt > 0) this.assertGrounded(length / 2, dy, groundedAt, 'wave');
    return this.smooth(length / 2, dy).smooth(length / 2, -dy);
  }

  /**
   * Ground tabletop: a cosine rise onto a flat top and a cosine fall, with every crest radius
   * >= v^2/g at `groundedAt` m/s so a full-gas beginner rides over instead of flying off. Round 4
   * replaces B1's `tabletop` ramps (an 8.5 deg kink at 16 m/s is a 7 m flight) with this.
   */
  plateau(up: number, top: number, height: number, down = up, groundedAt = 16): this {
    this.assertGrounded(up, height, groundedAt, 'plateau rise');
    this.assertGrounded(down, height, groundedAt, 'plateau fall');
    return this.smooth(up, height).flat(top).smooth(down, -height);
  }

  /**
   * Row of grounded speed bumps: cosine bumps of `height` whose crest cannot launch at `groundedAt`
   * m/s, `gap` m of flat between. Physics round 8: a flat-out beginner (lean 0, full gas) reaches
   * 18.5 m/s on B1 and noses down through a 0.25 m convex `humpRow`; a cosine bump is rolled.
   */
  bumpRow(count: number, height = 0.25, groundedAt = 20, gap = 2): this {
    const half = Math.ceil(FEEL.smoothLengthFor(height, groundedAt) * 10) / 10;
    for (let i = 0; i < count; i++) {
      this.wave(2 * half, height, groundedAt);
      if (i < count - 1) this.flat(gap);
    }
    return this;
  }

  /** Smooth descent whose convex top cannot launch at `groundedAt` m/s. */
  descent(length: number, drop: number, groundedAt = 16): this {
    this.assertGrounded(length, drop, groundedAt, 'descent');
    return this.smooth(length, -Math.abs(drop));
  }

  private assertGrounded(halfLength: number, dy: number, v: number, what: string): void {
    const need = FEEL.smoothLengthFor(dy, v);
    if (halfLength < need - 1e-6) {
      throw new Error(`[${this.id}] ${what} of ${dy} m over ${halfLength} m at x=${this.x} launches below ${v} m/s; needs >= ${need.toFixed(1)} m`);
    }
  }

  /**
   * Cascade of drops: a ramp up to the first shelf, then `heights` shelves each `top` m long,
   * every step down being a drop the rider leans back off. Ends on the ground.
   */
  stepDowns(up: number, top: number, heights: number[]): this {
    const first = heights[0] ?? 0;
    this.ramp({ length: up, height: first });
    for (const h of heights) this.box({ width: top, height: h });
    return this;
  }

  /** Flow: a kicker over a gap onto flat ground (the B3 shape at small scale). */
  smallGap(rampLength: number, rampHeight: number, gapWidth: number): this {
    return this.ramp({ length: rampLength, height: rampHeight, curve: 0.3 }).gap({ width: gapWidth });
  }

  /**
   * See-saw with a fillet ramp flush with the resting near end (the board rests tipped
   * toward the rider with its end on the ground; the fillet covers the board-thickness lip).
   */
  seesawEntry(p: Partial2<KindParams['seesaw']>, o?: ObstacleOpts): this {
    const t = p.thickness ?? 0.12;
    return this.ramp({ length: 0.8, height: t + 0.03, curve: 0.5 }, o).seesaw(p, o);
  }

  /**
   * Gap-chain platform: a box whose last `kickerLength` metres are a kicker ramp on top, so
   * every launch has an angle and the landing can be level with or above the take-off.
   */
  platform(width: number, height: number, kicker: { length?: number; height?: number } = {}): this {
    const kl = kicker.length ?? 1.5;
    const kh = kicker.height ?? 0.4;
    return this.box({ width: width - kl, height }).ramp({ length: kl, height: kh, curve: 0.3 }, { base: height });
  }

  /**
   * ramp up + box top + ramp down, all one height. The landing ramp defaults to 10 x height
   * (<= 5.7 deg): a bike leaving the top at 14 m/s follows a parabola that a 9.5 deg ramp
   * falls away from, so it landed nose-down on the flat past the ramp (sweep 3: e1 / e3).
   */
  tabletop(up: number, top: number, height: number, down?: number): this {
    const dn = down ?? Math.max(up, 10 * height);
    return this.ramp({ length: up, height }).box({ width: top, height }).ramp({ length: dn, height, direction: 'down' });
  }

  private place(kind: ObstacleKind, params: object, o?: ObstacleOpts): this {
    const rec = params as ParamRecord;
    const fp = footprint(kind, rec);
    if (!(fp >= 0) || !Number.isFinite(fp)) throw new Error(`[${this.id}] ${kind} at x=${this.x} has an invalid footprint`);
    const x0 = this.x;
    const x1 = this.x + fp;
    if (isSolidKind(kind) || kind === 'gap') {
      for (const f of this.footprints) {
        if (x0 < f.x1 - 1e-6 && x1 > f.x0 + 1e-6 && (isSolidKind(f.kind as ObstacleKind) || f.kind === 'gap')) {
          throw new Error(`[${this.id}] ${kind} at x=${x0} overlaps ${f.kind} at x=${f.x0}`);
        }
      }
      if (!this.groundLevel(x0, x1)) throw new Error(`[${this.id}] ${kind} at x=${x0} must stand on level ground`);
    }
    if (kind === 'seesaw') {
      const sp = rec as Partial2<KindParams['seesaw']>;
      const half = (sp.length ?? 6) / 2;
      const h = (sp.height ?? 1) - (sp.thickness ?? 0.12) / 2;
      if ((sp.angleDeg ?? 0) <= 0 && h > half * Math.sin(Math.PI / 6) + 1e-9) {
        throw new Error(`[${this.id}] seesaw at x=${x0}: height ${sp.height} leaves the resting end ${(h - half / 2).toFixed(2)} m off the ground (30 deg cap); use length >= ${(4 * h).toFixed(1)} or pass angleDeg`);
      }
    }
    this.footprints.push({ x0, x1, kind });
    const base = o?.base ?? 0;
    this.obstacles.push({ kind, pos: { x: x0, y: this.y + base }, params: { ...rec } });
    // Pin the profile at both ends so a later ground op starts here, not under the obstacle.
    // The cursor stays on the 1e-6 grid so a computed footprint end (plank L*cos) and the
    // next obstacle's pos.x quantise to the same value in compile.
    this.pin();
    this.x = round(x1);
    this.pin();
    return this;
  }

  private pin(): void {
    const last = this.profile[this.profile.length - 1] as Vec2;
    if (last.x < this.x - 1e-9) this.pushProfile(this.x, this.y);
  }

  // -- markers --------------------------------------------------------------

  /** Checkpoint at the cursor; spawn rear wheel at cursor + 0.5 on the current ground. */
  checkpoint(): this {
    this.checkpoints.push({ x: this.x, spawn: { pos: { x: this.x + 0.5, y: this.y }, angle: 0 } });
    return this;
  }

  /** Camera key from the cursor until the next key (or the finish). */
  camera(key: Omit<CameraKey, 'x0' | 'x1'>): this {
    this.closeCamera();
    this.openCamera = { x0: this.x, x1: this.x, ...key };
    return this;
  }

  /** HUD hint (beginner tier). */
  hint(text: string): this {
    this.hints.push(text);
    return this;
  }

  /**
   * Finish line at the cursor, `runout` m of flat, then an end bank so nothing rides off the world.
   * Validates spawns (CONTRACT §2.4) and the checkpoint rule (`CHECKPOINT_RULE`); harness fixtures
   * and compile-test snippets that are not courses pass `{ checkpointRule: false }`.
   */
  finish(runout = 10, opts: { checkpointRule?: boolean } = {}): TrackDef {
    const finishX = this.x;
    this.flat(runout);
    // end bank: 35 deg rise of 4 m
    this.slope(4 / Math.tan((35 * Math.PI) / 180), 4);
    this.closeCamera();
    const meta = this.metaData;
    if (!meta) throw new Error(`[${this.id}] meta() is required`);
    if (this.cameras.length > 0) meta.camera = this.cameras;
    if (this.hints.length > 0) meta.hints = this.hints;
    const def: TrackDef = {
      id: this.id,
      name: this.name,
      tier: this.tier,
      seed: seedFromString(this.id),
      profile: this.profile.map((p) => ({ x: round(p.x), y: round(p.y) })),
      obstacles: this.obstacles.map((o) => ({ kind: o.kind, pos: { x: round(o.pos.x), y: round(o.pos.y) }, params: o.params ?? {} })),
      checkpoints: this.checkpoints.map((c) => ({ x: round(c.x), spawn: { pos: { x: round(c.spawn.pos.x), y: round(c.spawn.pos.y) }, angle: 0 } })),
      start: { pos: { x: 0, y: 0 }, angle: 0 },
      finishX: round(finishX),
      meta,
    };
    if (meta.attemptsBand) def.targetAttempts = meta.attemptsBand[1];
    validateSpawns(def);
    if (opts.checkpointRule !== false) validateCheckpoints(def);
    return def;
  }

  // -- internals ------------------------------------------------------------

  private pushProfile(x: number, y: number): void {
    const last = this.profile[this.profile.length - 1] as Vec2;
    if (x <= last.x + 1e-9) throw new Error(`[${this.id}] profile x must increase (x=${x})`);
    const prev = this.profile[this.profile.length - 2];
    // Consecutive flats merge into one segment so a spawn always sits on a single segment.
    if (prev && Math.abs(prev.y - last.y) < 1e-9 && Math.abs(y - last.y) < 1e-9) {
      last.x = x;
      return;
    }
    this.profile.push({ x, y });
  }

  private groundLevel(x0: number, x1: number): boolean {
    // ground is level iff every profile point strictly inside has y == this.y and the endpoints do too
    const yAt = profileYAt(this.profile, this.x, this.y);
    if (Math.abs(yAt(x0) - this.y) > 1e-6 || Math.abs(yAt(x1) - this.y) > 1e-6) return false;
    for (const p of this.profile) if (p.x > x0 && p.x < x1 && Math.abs(p.y - this.y) > 1e-6) return false;
    return true;
  }

  private closeCamera(): void {
    if (this.openCamera) {
      this.openCamera.x1 = this.x;
      if (this.openCamera.x1 > this.openCamera.x0) this.cameras.push(this.openCamera);
      this.openCamera = null;
    }
  }

  private assertPositive(v: number, what: string): void {
    if (!(v > 0)) throw new Error(`[${this.id}] ${what} must be > 0 (got ${v}) at x=${this.x}`);
  }
}

function round(v: number): number {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? 0 : r;
}

/** Profile lookup that treats x beyond the last point as the current cursor level. */
function profileYAt(profile: readonly Vec2[], cursorX: number, cursorY: number): (x: number) => number {
  return (x: number): number => {
    const last = profile[profile.length - 1] as Vec2;
    // Beyond the last profile point the ground is the cursor level (the next ground op extends it).
    if (x >= last.x - 1e-9 || x > cursorX + 1e-9) return cursorY;
    for (let i = 1; i < profile.length; i++) {
      const b = profile[i] as Vec2;
      if (x <= b.x + 1e-9) {
        const a = profile[i - 1] as Vec2;
        const t = (x - a.x) / (b.x - a.x);
        return a.y + (b.y - a.y) * t;
      }
    }
    return last.y;
  };
}

/** Flat run a spawn needs: rear wheel at pos.x, front at pos.x + wheelbase, plus clearance. */
export const SPAWN_CLEAR_BEHIND = 0.4;
export const SPAWN_CLEAR_AHEAD = 0.6;

/** CONTRACT §2.4: ground under both wheels at a spawn is a single flat profile segment. Throws otherwise. */
export function validateSpawns(def: TrackDef): void {
  const spawns = [{ label: 'start', ...def.start }, ...def.checkpoints.map((c, i) => ({ label: `checkpoint ${i}`, ...c.spawn }))];
  for (const s of spawns) {
    const x0 = s.pos.x - SPAWN_CLEAR_BEHIND;
    const x1 = s.pos.x + FEEL.wheelbase + SPAWN_CLEAR_AHEAD;
    let ok = false;
    for (let i = 1; i < def.profile.length; i++) {
      const a = def.profile[i - 1] as Vec2;
      const b = def.profile[i] as Vec2;
      if (a.x <= x0 + 1e-9 && b.x >= x1 - 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.y - s.pos.y) < 1e-9) {
        ok = true;
        break;
      }
    }
    if (!ok) throw new Error(`[${def.id}] ${s.label} spawn at x=${s.pos.x} is not on a single flat profile segment [${x0}, ${x1}]`);
    for (const o of def.obstacles) {
      const fp = footprint(o.kind as ObstacleKind, o.params);
      if (o.pos.x < x1 && o.pos.x + fp > x0 && isSolidKind(o.kind as ObstacleKind)) {
        throw new Error(`[${def.id}] ${s.label} spawn at x=${s.pos.x} sits on obstacle ${o.kind} at x=${o.pos.x}`);
      }
      if (o.kind === 'gap' && o.pos.x < x1 && o.pos.x + fp > x0) {
        throw new Error(`[${def.id}] ${s.label} spawn at x=${s.pos.x} sits over a gap at x=${o.pos.x}`);
      }
    }
  }
}

export function course(id: string, name: string, tier: TrackTier): CourseBuilder {
  return new CourseBuilder(id, name, tier);
}
