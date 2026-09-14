/**
 * Tiny hand-built CompiledTracks for the physics feel tests. These bypass
 * `compileTrack` on purpose: the tests must pin the geometry exactly and not
 * move when the tracks owner changes obstacle defaults.
 */
import type { Collider, CompiledTrack, HazardZone, SurfaceKind, TrackDef, Vec2 } from '../core/types';
import { hashColliders } from '../tracks/compile';

export interface TestTrackOptions {
  id?: string;
  profile?: Vec2[];
  extra?: Collider[];
  hazards?: HazardZone[];
  start?: { pos: Vec2; angle: number };
  checkpoints?: { x: number; spawn: { pos: Vec2; angle: number } }[];
  finishX?: number;
  surface?: SurfaceKind;
}

export function makeTrack(o: TestTrackOptions = {}): CompiledTrack {
  const profile = o.profile ?? [
    { x: -30, y: 0 },
    { x: 400, y: 0 },
  ];
  const def: TrackDef = {
    id: o.id ?? 'phys-test',
    name: 'physics test',
    tier: 'beginner',
    seed: 7,
    profile,
    obstacles: [],
    checkpoints: o.checkpoints ?? [],
    start: o.start ?? { pos: { x: 0, y: 0 }, angle: 0 },
    finishX: o.finishX ?? 390,
  };
  const colliders: Collider[] = [
    { kind: 'polyline', id: 0, surface: o.surface ?? 'dirt', obstacleIndex: -1, points: profile.map((p) => ({ x: p.x, y: p.y })) },
    ...(o.extra ?? []).map((c, i) => ({ ...c, id: i + 1 })),
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of profile) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return {
    def,
    colliders,
    hazards: o.hazards ?? [],
    placed: [],
    bounds: { minX, maxX, minY, maxY },
    oobY: minY - 6,
    hash: hashColliders(colliders),
  };
}

/** Flat run-in, then a plank at `angleDeg` of length `len` starting at x0, then a flat top. */
export function plankTrack(angleDeg: number, len = 4, x0 = 20, surface: SurfaceKind = 'wood'): CompiledTrack {
  const a = (angleDeg * Math.PI) / 180;
  const top = { x: x0 + len * Math.cos(a), y: len * Math.sin(a) };
  return makeTrack({
    id: `plank-${angleDeg}`,
    profile: [
      { x: -30, y: 0 },
      { x: x0, y: 0 },
      { x: top.x, y: top.y },
      { x: top.x + 30, y: top.y },
    ],
    surface,
    finishX: top.x + 25,
  });
}

/** Flat ground with a vertical ledge of height h at x0 (a box you must hop onto). */
export function ledgeTrack(h: number, x0 = 20): CompiledTrack {
  return makeTrack({
    id: `ledge-${h}`,
    profile: [
      { x: -30, y: 0 },
      { x: x0, y: 0 },
      { x: x0, y: h },
      { x: x0 + 40, y: h },
    ],
    finishX: x0 + 35,
  });
}

/**
 * Flat ground with a drum (circle collider) of radius r centred at x0, sunk `depth` into the ground
 * (M2's speed bump is r 0.5 sunk 0.7 = 0.3 m proud); `rolls` makes it spin under the tyre.
 */
export function drumTrack(r = 0.6, x0 = 20, rolls = true, depth = 0, surface: SurfaceKind = 'metal'): CompiledTrack {
  return makeTrack({
    id: 'drum',
    extra: [{ kind: 'circle', id: 0, surface, obstacleIndex: 0, center: { x: x0, y: r - depth }, radius: r, rolls }],
    finishX: x0 + 40,
  });
}

/** Flat ground with a seesaw whose pivot is at height `h` above ground at x0. */
export function seesawTrack(h = 0.5, halfLength = 2, x0 = 20): CompiledTrack {
  return makeTrack({
    id: 'seesaw',
    extra: [
      { kind: 'seesaw', id: 0, surface: 'wood', obstacleIndex: 0, pivot: { x: x0, y: h }, halfLength, thickness: 0.1, maxAngle: Math.atan2(h - 0.05, halfLength), mass: 80 },
    ],
  });
}

/** Flat ground with a kill hazard box spanning [x0, x1] just above the ground. */
export function hazardTrack(x0 = 20, x1 = 24): CompiledTrack {
  return makeTrack({
    id: 'hazard',
    hazards: [{ id: 0, kind: 'fire', min: { x: x0, y: 0 }, max: { x: x1, y: 1.0 } }],
  });
}

/** Flat ground that ends in a gap (fall to out-of-bounds). */
export function gapTrack(x0 = 20): CompiledTrack {
  return makeTrack({
    id: 'gap',
    profile: [
      { x: -30, y: 0 },
      { x: x0, y: 0 },
    ],
    finishX: 300,
  });
}
