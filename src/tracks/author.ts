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
 * profile segment with clearance. Authors put a `flat(>= 3)` after each checkpoint.
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
} as const;

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

  /** ramp up + box top + ramp down, all one height. */
  tabletop(up: number, top: number, height: number, down = up): this {
    return this.ramp({ length: up, height }).box({ width: top, height }).ramp({ length: down, height, direction: 'down' });
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

  /** Finish line at the cursor, `runout` m of flat, then an end bank so nothing rides off the world. */
  finish(runout = 10): TrackDef {
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
