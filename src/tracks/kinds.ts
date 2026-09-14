/**
 * Obstacle vocabulary (CONTRACT.md §2.1). Twelve kinds, typed param schemas,
 * documented defaults and per-kind compile functions that lower an authored
 * `TrackObstacle` into raw geometry for `compileTrack`.
 *
 * Geometry conventions (also the render / physics reading of the output):
 *  - Metres, radians (only `angleDeg` params are degrees), +x along the course, +y up.
 *  - Every polygon returned in `solids` is CLOSED and wound CLOCKWISE: walking the
 *    outline, the solid is on your RIGHT and the free side on your LEFT. The ground
 *    chain is oriented +x for the same reason (solid below). `compileTrack` merges all
 *    solids with the ground so shared faces cancel and nothing is double-registered.
 *  - `chains` are OPEN polylines that are NOT merged (plank tops, wall lips). Their
 *    `oneWay` flag means "collides only when approached from the left/normal side",
 *    i.e. landable from above, pass-through from below.
 *  - Solids sit on the ground: their bottom edge follows the ground chain between
 *    footprint x0..x1, so a box on a slope is exact and cancels cleanly.
 *  - `pos.y` is the obstacle's BASE reference: heights are `pos.y + height`. The DSL
 *    sets pos.y = ground y (+ an optional `base` offset for an obstacle stacked on
 *    the top of a box, e.g. a ramp launching off a platform).
 */
import type { Collider, HazardZone, SurfaceKind, Vec2 } from '../core/types';

// ---------------------------------------------------------------------------
// Param schemas + defaults
// ---------------------------------------------------------------------------

/**
 * Every kind carries `variant` (integer, default 0): a deterministic look
 * selector for render (crate vs container, plank grain, drum livery). It never
 * affects colliders. Render reads `thickness width length radius variant surface`
 * from `placed[].params`; those names are stable.
 */
export interface BaseParams {
  variant: number;
}

export type ObstacleKind =
  | 'ramp'
  | 'plank'
  | 'drum'
  | 'gap'
  | 'wall'
  | 'seesaw'
  | 'logpile'
  | 'stair'
  | 'box'
  | 'pole'
  | 'barrel'
  | 'ledge';

export const OBSTACLE_KINDS: readonly ObstacleKind[] = [
  'ramp',
  'plank',
  'drum',
  'gap',
  'wall',
  'seesaw',
  'logpile',
  'stair',
  'box',
  'pole',
  'barrel',
  'ledge',
];

/**
 * Decor kinds (wave 1 of the mega build, P2 "every biome gets its own set piece"): overhead
 * dressing with NO collider. `arch` is a gate / girder / crowd bridge spanning the course at one
 * x; `tunnel` is a covered stretch. They compile to a `placed` entry with an empty `colliderIds`
 * so render can dress them, they never touch physics, and the builder appends them AFTER every
 * rideable obstacle so `obstacleIndex` of the real colliders — and therefore the golden hash —
 * does not move when a course gains one. Footprint 0: they hang over whatever the course places
 * under them, and the DSL cursor does not advance.
 */
export type DecorKind = 'arch' | 'tunnel';
export const DECOR_KINDS: readonly DecorKind[] = ['arch', 'tunnel'];
/** Everything `TrackObstacle.kind` may hold: the 12 rideable kinds plus the decor kinds. */
export type TrackKind = ObstacleKind | DecorKind;

/** Solid wedge. `curve` 0 = straight, +1 = concave (quarter-pipe / kicker lip), -1 = convex roller. */
export interface RampParams extends BaseParams {
  length: number;
  height: number;
  curve: number;
  direction: 'up' | 'down';
  surface: SurfaceKind;
}
/** Thin board: a one-way top surface only. `height` = elevation of the near end above pos.y. */
export interface PlankParams extends BaseParams {
  length: number;
  angleDeg: number;
  height: number;
  thickness: number;
  oneWay: boolean;
  surface: SurfaceKind;
}
/** Cylinder lying across the course. `depth` sinks it into the ground. `rolls` = spins under the tyre (never translates). `width` = visual depth along z (render only). */
export interface DrumParams extends BaseParams {
  radius: number;
  width: number;
  depth: number;
  rolls: boolean;
  surface: SurfaceKind;
}
/**
 * Pit punched out of the ground, `depth` deep below the NEAR lip, with a water/kill/fire hazard filling it.
 * Lab tracks (physics-v2 §15): `hazard: 'none'` is a dry pit (a fall in is not a fault), `floor` is the pit
 * floor's surface (the rubber mattress; the floor becomes a polyline owned by the gap when it is not dirt),
 * and `rise` lifts the FAR lip `rise` m above the near one (the far wall is vertical from the floor to the
 * landing ledge). The authored profile must be level across a gap with rise 0 and rise exactly `rise` otherwise.
 */
export interface GapParams extends BaseParams {
  width: number;
  depth: number;
  hazard: 'water' | 'kill' | 'fire' | 'none';
  /** Far lip height above the near lip (default 0: level). */
  rise: number;
  /** Surface of the pit floor (default dirt, part of the ground chain). */
  floor: SurfaceKind;
}
/** Solid slab, not rollable. `lip` adds a one-way ledge projecting back from the top front edge (front-wheel grab). */
export interface WallParams extends BaseParams {
  height: number;
  width: number;
  lip: number;
  surface: SurfaceKind;
}
/** Hinged board. `height` = pivot height. `angleDeg` 0 = auto: the tilt at which an end touches the ground (capped 30°). */
export interface SeesawParams extends BaseParams {
  length: number;
  height: number;
  thickness: number;
  angleDeg: number;
  mass: number;
  surface: SurfaceKind;
}
/** Pyramid of logs: `count` on the bottom row, one fewer per row for `rows` rows. */
export interface LogpileParams extends BaseParams {
  radius: number;
  count: number;
  rows: number;
  spacing: number;
  surface: SurfaceKind;
}
/** Staircase. `height` = rise per step, `length` = run per step. 'down' starts at count*rise and descends. */
export interface StairParams extends BaseParams {
  count: number;
  height: number;
  length: number;
  direction: 'up' | 'down';
  surface: SurfaceKind;
}
/** Solid container / platform (metal by default). */
export interface BoxParams extends BaseParams {
  width: number;
  height: number;
  surface: SurfaceKind;
}
/** Thin post with a round cap; a rear-wheel hop target. `count`/`spacing` for a row of equal poles. */
export interface PoleParams extends BaseParams {
  height: number;
  radius: number;
  width: number;
  count: number;
  spacing: number;
  surface: SurfaceKind;
}
/** Oil drum(s) standing on end. `burning` adds a fire hazard 0.6 m tall above each barrel. */
export interface BarrelParams extends BaseParams {
  radius: number;
  height: number;
  count: number;
  spacing: number;
  burning: boolean;
  surface: SurfaceKind;
}
/** Low concrete kerb / shelf: a hop-up or drop-off step, landable on top. */
export interface LedgeParams extends BaseParams {
  height: number;
  length: number;
  surface: SurfaceKind;
}

/**
 * Overhead arch / gate spanning `span` m of course centred on pos.x, its underside `height` above
 * pos.y, `depth` m along z. `style` is the render dressing: `start` / `finish` gantries with
 * banners and confetti cannons, `checkpoint` post + sign, `crowd` a spectator bridge, `girder` a
 * steel truss, `pipe` a foundry duct, `ice` a snow cornice. No collider.
 */
export interface ArchParams extends BaseParams {
  span: number;
  height: number;
  depth: number;
  style: 'start' | 'finish' | 'checkpoint' | 'crowd' | 'girder' | 'pipe' | 'ice';
  surface: SurfaceKind;
}
/**
 * Covered stretch from pos.x for `length` m, roof `height` above pos.y, `depth` m along z. `lit`
 * asks render for interior point lights (headlight cone otherwise). No collider.
 */
export interface TunnelParams extends BaseParams {
  length: number;
  height: number;
  depth: number;
  style: 'scaffold' | 'concrete' | 'pipe' | 'ice' | 'foundry';
  lit: boolean;
  surface: SurfaceKind;
}

export interface KindParams {
  arch: ArchParams;
  tunnel: TunnelParams;
  ramp: RampParams;
  plank: PlankParams;
  drum: DrumParams;
  gap: GapParams;
  wall: WallParams;
  seesaw: SeesawParams;
  logpile: LogpileParams;
  stair: StairParams;
  box: BoxParams;
  pole: PoleParams;
  barrel: BarrelParams;
  ledge: LedgeParams;
}

export const KIND_DEFAULTS: { readonly [K in TrackKind]: Readonly<KindParams[K]> } = {
  arch: { span: 6, height: 5, depth: 6, style: 'girder', surface: 'metal', variant: 0 },
  tunnel: { length: 20, height: 5, depth: 6, style: 'scaffold', lit: true, surface: 'concrete', variant: 0 },
  ramp: { length: 4, height: 1, curve: 0, direction: 'up', surface: 'wood', variant: 0 },
  plank: { length: 4, angleDeg: 0, height: 0, thickness: 0.12, oneWay: true, surface: 'wood', variant: 0 },
  drum: { radius: 0.8, width: 1.2, depth: 0, rolls: false, surface: 'metal', variant: 0 },
  gap: { width: 3, depth: 3, hazard: 'water', rise: 0, floor: 'dirt', variant: 0 },
  wall: { height: 1, width: 0.4, lip: 0, surface: 'concrete', variant: 0 },
  seesaw: { length: 6, height: 1, thickness: 0.12, angleDeg: 0, mass: 60, surface: 'wood', variant: 0 },
  logpile: { radius: 0.3, count: 3, rows: 1, spacing: 0, surface: 'wood', variant: 0 },
  stair: { count: 5, height: 0.3, length: 0.45, direction: 'up', surface: 'concrete', variant: 0 },
  box: { width: 4, height: 1, surface: 'metal', variant: 0 },
  pole: { height: 1.5, radius: 0.25, width: 0.16, count: 1, spacing: 1.8, surface: 'metal', variant: 0 },
  barrel: { radius: 0.3, height: 0.9, count: 1, spacing: 0.7, burning: true, surface: 'metal', variant: 0 },
  ledge: { height: 0.5, length: 4, surface: 'concrete', variant: 0 },
};

export type ParamRecord = Record<string, number | string | boolean>;

export function isObstacleKind(kind: string): kind is ObstacleKind {
  return (OBSTACLE_KINDS as readonly string[]).includes(kind);
}
export function isDecorKind(kind: string): kind is DecorKind {
  return (DECOR_KINDS as readonly string[]).includes(kind);
}
export function isTrackKind(kind: string): kind is TrackKind {
  return isObstacleKind(kind) || isDecorKind(kind);
}

/** Fill defaults; unknown params pass through so render can carry decoration hints. */
export function resolveParams<K extends TrackKind>(kind: K, params: ParamRecord | undefined): KindParams[K] {
  return { ...(KIND_DEFAULTS[kind] as object), ...(params ?? {}) } as unknown as KindParams[K];
}

// ---------------------------------------------------------------------------
// Footprint: how far along x an obstacle occupies (the DSL advances its cursor by this)
// ---------------------------------------------------------------------------

export function footprint(kind: TrackKind, params: ParamRecord | undefined): number {
  switch (kind) {
    case 'arch':
    case 'tunnel':
      return 0; // decor hangs over the course; the cursor does not advance
    case 'ramp':
      return resolveParams('ramp', params).length;
    case 'plank': {
      const p = resolveParams('plank', params);
      return p.length * Math.cos((p.angleDeg * Math.PI) / 180);
    }
    case 'drum':
      return 2 * resolveParams('drum', params).radius;
    case 'gap':
      return resolveParams('gap', params).width;
    case 'wall':
      return resolveParams('wall', params).width;
    case 'seesaw':
      return resolveParams('seesaw', params).length;
    case 'logpile': {
      const p = resolveParams('logpile', params);
      return p.count * 2 * p.radius + (p.count - 1) * p.spacing;
    }
    case 'stair': {
      const p = resolveParams('stair', params);
      return p.count * p.length;
    }
    case 'box':
      return resolveParams('box', params).width;
    case 'pole': {
      const p = resolveParams('pole', params);
      return 2 * p.radius + (p.count - 1) * p.spacing;
    }
    case 'barrel': {
      const p = resolveParams('barrel', params);
      return 2 * p.radius + (p.count - 1) * p.spacing;
    }
    case 'ledge':
      return resolveParams('ledge', params).length;
  }
}

/** True for kinds whose outline is merged with the ground (must sit on it, footprints may not overlap). */
export function isSolidKind(kind: TrackKind): boolean {
  return kind === 'ramp' || kind === 'wall' || kind === 'stair' || kind === 'box' || kind === 'ledge';
}

// ---------------------------------------------------------------------------
// Compile output
// ---------------------------------------------------------------------------

export interface OpenChain {
  points: Vec2[];
  oneWay: boolean;
  surface: SurfaceKind;
}
export interface SolidPolygon {
  /** Closed, clockwise (solid on the right). First point is NOT repeated. */
  points: Vec2[];
  surface: SurfaceKind;
}
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type LooseCollider = DistributiveOmit<Collider, 'id' | 'obstacleIndex'>;
export type LooseHazard = Omit<HazardZone, 'id'>;

export interface KindGeometry {
  solids: SolidPolygon[];
  chains: OpenChain[];
  /** circle / box / seesaw colliders that are not merged. */
  loose: LooseCollider[];
  hazards: LooseHazard[];
}

export interface GroundQuery {
  /** Ground height at x (authored profile, before gap pits). */
  y(x: number): number;
  /** Ground chain from x0 to x1 inclusive, +x order (endpoints interpolated). */
  chain(x0: number, x1: number): Vec2[];
}

const CURVE_SEGMENTS = 12;
/** Fire above a barrel top. Physics tests every body incl. wheels against hazards, so this is what a jump must clear. */
const FIRE_HEIGHT = 0.6;
/** Pit walls lean in by this much so the ground chain stays x-monotone (no perfectly vertical profile). */
export const GAP_WALL_LEAN = 0.05;
/**
 * Hazard top sits this far below the lip. Physics tests wheels (r 0.34) too, so 0.6 means a
 * wheel faults only when it is wholly below the lip; a wheel catching the far wall bounces.
 */
export const GAP_HAZARD_MARGIN = 0.6;

function deg(d: number): number {
  return (d * Math.PI) / 180;
}

/** Quadratic bezier from a to b, bulging `curve` (concave = below the chord for an up-ramp). */
function curvedIncline(a: Vec2, b: Vec2, curve: number, up: boolean): Vec2[] {
  if (curve === 0) return [a, b];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  // left normal of travel a->b
  const nx = -dy / len;
  const ny = dx / len;
  // For an up-ramp the free side is the left normal (up-left); concave sags away from it.
  const sign = up ? -1 : 1;
  const bulge = sign * curve * 0.25 * len;
  const cx = (a.x + b.x) / 2 + nx * bulge;
  const cy = (a.y + b.y) / 2 + ny * bulge;
  const pts: Vec2[] = [];
  for (let i = 0; i <= CURVE_SEGMENTS; i++) {
    const t = i / CURVE_SEGMENTS;
    const u = 1 - t;
    pts.push({ x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cy + t * t * b.y });
  }
  return pts;
}

/**
 * Close a solid whose top outline runs from (x0, ground) up/over to (x1, ground):
 * `top` is the exposed outline in +x order, starting at the base-left corner (x0, baseLeftY)
 * and ending at the base-right corner (x1, baseRightY). The bottom follows the ground back.
 */
function closeOnGround(top: Vec2[], x0: number, x1: number, ground: GroundQuery): Vec2[] {
  const g0 = ground.y(x0);
  const g1 = ground.y(x1);
  const pts: Vec2[] = [{ x: x0, y: g0 }];
  for (const p of top) pushUnique(pts, p);
  pushUnique(pts, { x: x1, y: g1 });
  const chain = ground.chain(x0, x1);
  for (let i = chain.length - 2; i >= 1; i--) pushUnique(pts, chain[i] as Vec2);
  // drop closing duplicate
  const first = pts[0] as Vec2;
  const last = pts[pts.length - 1] as Vec2;
  if (same(first, last)) pts.pop();
  return pts;
}

function same(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}
function pushUnique(arr: Vec2[], p: Vec2): void {
  const last = arr[arr.length - 1];
  if (last && same(last, p)) return;
  arr.push(p);
}

type Compiler<K extends TrackKind> = (pos: Vec2, p: KindParams[K], ground: GroundQuery) => KindGeometry;

const empty = (): KindGeometry => ({ solids: [], chains: [], loose: [], hazards: [] });

/** Decor: no geometry at all. Render reads `placed[].params` (span / length, height, depth, style). */
const compileDecor = (): KindGeometry => empty();

const compileRamp: Compiler<'ramp'> = (pos, p, ground) => {
  const x0 = pos.x;
  const x1 = pos.x + p.length;
  const base = pos.y;
  const top: Vec2[] =
    p.direction === 'up'
      ? [{ x: x0, y: base }, ...curvedIncline({ x: x0, y: base }, { x: x1, y: base + p.height }, p.curve, true)]
      : [{ x: x0, y: base + p.height }, ...curvedIncline({ x: x0, y: base + p.height }, { x: x1, y: base }, p.curve, false)];
  const g = empty();
  g.solids.push({ points: closeOnGround(top, x0, x1, ground), surface: p.surface });
  return g;
};

const compilePlank: Compiler<'plank'> = (pos, p) => {
  const a = { x: pos.x, y: pos.y + p.height };
  const th = deg(p.angleDeg);
  const b = { x: pos.x + p.length * Math.cos(th), y: a.y + p.length * Math.sin(th) };
  const g = empty();
  g.chains.push({ points: [a, b], oneWay: p.oneWay, surface: p.surface });
  return g;
};

const compileDrum: Compiler<'drum'> = (pos, p) => {
  const g = empty();
  const center = { x: pos.x + p.radius, y: pos.y + p.radius - p.depth };
  g.loose.push({ kind: 'circle', center, radius: p.radius, rolls: p.rolls, surface: p.surface });
  return g;
};

/** Gap: only the hazard here (none for a dry lab pit); the pit itself is cut into the ground chain by compileTrack. */
const compileGap: Compiler<'gap'> = (pos, p) => {
  const g = empty();
  if (p.hazard === 'none') return g;
  g.hazards.push({
    kind: p.hazard,
    min: { x: pos.x, y: pos.y - p.depth },
    max: { x: pos.x + p.width, y: pos.y - GAP_HAZARD_MARGIN },
  });
  return g;
};

const compileWall: Compiler<'wall'> = (pos, p, ground) => {
  const x0 = pos.x;
  const x1 = pos.x + p.width;
  const topY = pos.y + p.height;
  const g = empty();
  g.solids.push({
    points: closeOnGround([{ x: x0, y: topY }, { x: x1, y: topY }], x0, x1, ground),
    surface: p.surface,
  });
  if (p.lip > 0) {
    g.chains.push({ points: [{ x: x0 - p.lip, y: topY }, { x: x0, y: topY }], oneWay: true, surface: p.surface });
  }
  return g;
};

const compileSeesaw: Compiler<'seesaw'> = (pos, p) => {
  const half = p.length / 2;
  const pivot = { x: pos.x + half, y: pos.y + p.height };
  const auto = Math.asin(Math.min(1, Math.max(0, p.height - p.thickness / 2) / half));
  const maxAngle = p.angleDeg > 0 ? deg(p.angleDeg) : Math.min(auto, deg(30));
  const g = empty();
  g.loose.push({ kind: 'seesaw', pivot, halfLength: half, thickness: p.thickness, maxAngle, mass: p.mass, surface: p.surface });
  return g;
};

const compileLogpile: Compiler<'logpile'> = (pos, p) => {
  const g = empty();
  const pitch = 2 * p.radius + p.spacing;
  const rowH = Math.sqrt(Math.max(0, pitch * pitch - (pitch / 2) * (pitch / 2)));
  for (let r = 0; r < p.rows; r++) {
    const n = p.count - r;
    if (n <= 0) break;
    for (let i = 0; i < n; i++) {
      g.loose.push({
        kind: 'circle',
        center: { x: pos.x + p.radius + (pitch * r) / 2 + i * pitch, y: pos.y + p.radius + r * rowH },
        radius: p.radius,
        rolls: false,
        surface: p.surface,
      });
    }
  }
  return g;
};

const compileStair: Compiler<'stair'> = (pos, p, ground) => {
  const x0 = pos.x;
  const x1 = pos.x + p.count * p.length;
  const total = p.count * p.height;
  const top: Vec2[] = [];
  if (p.direction === 'up') {
    for (let i = 0; i < p.count; i++) {
      const y = pos.y + (i + 1) * p.height;
      top.push({ x: x0 + i * p.length, y }, { x: x0 + (i + 1) * p.length, y });
    }
  } else {
    top.push({ x: x0, y: pos.y + total });
    for (let i = 0; i < p.count; i++) {
      const y = pos.y + total - i * p.height;
      const xa = x0 + i * p.length;
      const xb = xa + p.length;
      top.push({ x: xb, y }, { x: xb, y: y - p.height });
    }
  }
  const g = empty();
  g.solids.push({ points: closeOnGround(top, x0, x1, ground), surface: p.surface });
  return g;
};

const compileBox: Compiler<'box'> = (pos, p, ground) => {
  const x0 = pos.x;
  const x1 = pos.x + p.width;
  const topY = pos.y + p.height;
  const g = empty();
  g.solids.push({ points: closeOnGround([{ x: x0, y: topY }, { x: x1, y: topY }], x0, x1, ground), surface: p.surface });
  return g;
};

const compileLedge: Compiler<'ledge'> = (pos, p, ground) => {
  const x0 = pos.x;
  const x1 = pos.x + p.length;
  const topY = pos.y + p.height;
  const g = empty();
  g.solids.push({ points: closeOnGround([{ x: x0, y: topY }, { x: x1, y: topY }], x0, x1, ground), surface: p.surface });
  return g;
};

const compilePole: Compiler<'pole'> = (pos, p) => {
  const g = empty();
  for (let i = 0; i < p.count; i++) {
    const cx = pos.x + p.radius + i * p.spacing;
    const shaftH = Math.max(0, p.height - p.radius);
    if (shaftH > 0) {
      g.loose.push({
        kind: 'box',
        center: { x: cx, y: pos.y + shaftH / 2 },
        halfW: p.width / 2,
        halfH: shaftH / 2,
        angle: 0,
        surface: p.surface,
      });
    }
    g.loose.push({ kind: 'circle', center: { x: cx, y: pos.y + p.height - p.radius }, radius: p.radius, rolls: false, surface: p.surface });
  }
  return g;
};

const compileBarrel: Compiler<'barrel'> = (pos, p) => {
  const g = empty();
  for (let i = 0; i < p.count; i++) {
    const cx = pos.x + p.radius + i * p.spacing;
    g.loose.push({
      kind: 'box',
      center: { x: cx, y: pos.y + p.height / 2 },
      halfW: p.radius,
      halfH: p.height / 2,
      angle: 0,
      surface: p.surface,
    });
    if (p.burning) {
      g.hazards.push({
        kind: 'fire',
        min: { x: cx - p.radius, y: pos.y + p.height },
        max: { x: cx + p.radius, y: pos.y + p.height + FIRE_HEIGHT },
      });
    }
  }
  return g;
};

const COMPILERS: { [K in TrackKind]: Compiler<K> } = {
  arch: compileDecor,
  tunnel: compileDecor,
  ramp: compileRamp,
  plank: compilePlank,
  drum: compileDrum,
  gap: compileGap,
  wall: compileWall,
  seesaw: compileSeesaw,
  logpile: compileLogpile,
  stair: compileStair,
  box: compileBox,
  pole: compilePole,
  barrel: compileBarrel,
  ledge: compileLedge,
};

export function compileKind(kind: TrackKind, pos: Vec2, params: ParamRecord | undefined, ground: GroundQuery): KindGeometry {
  const resolved = resolveParams(kind, params);
  return (COMPILERS[kind] as Compiler<typeof kind>)(pos, resolved as never, ground);
}

/** The params a course summary should print for a kind, in order. */
export const SUMMARY_KEYS: { readonly [K in TrackKind]: readonly (keyof KindParams[K] & string)[] } = {
  arch: ['span', 'height', 'style'],
  tunnel: ['length', 'height', 'style'],
  ramp: ['length', 'height', 'curve', 'direction'],
  plank: ['length', 'angleDeg', 'height'],
  drum: ['radius', 'depth', 'rolls'],
  gap: ['width', 'depth', 'hazard', 'rise', 'floor'],
  wall: ['height', 'width', 'lip'],
  seesaw: ['length', 'height'],
  logpile: ['radius', 'count', 'rows'],
  stair: ['count', 'height', 'length', 'direction'],
  box: ['width', 'height'],
  pole: ['height', 'radius', 'count', 'spacing'],
  barrel: ['count', 'spacing', 'burning'],
  ledge: ['height', 'length'],
};
