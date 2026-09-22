/**
 * ROCKHOP set (store release Phase 3): the registry contract the Brand/UI owner cuts over to, the zone metadata,
 * the four medal targets, the prop kit, bar 2 (no retired layout ships: every course < 0.6 silhouette correlation
 * with every retired course) and "no design note cites a Trials clip or the storyboards". The per-course geometry
 * invariants (spawns, checkpoint rule, finish run-out, colliders, golden hash) run in `../tracks.test.ts`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileTrack, getTrack, isPlaygroundTrackId, listRockhopTrackIds, listTrackIds, RETIRED_TRACKS, ROCKHOP_ALL, ROCKHOP_PLAYGROUNDS, ROCKHOP_TRACKS, ROCKHOP_ZONE_BIOME, segmentsOf } from '../index';
import { PROPS, isDecorKind, type ObstacleKind, type PropId } from '../kinds';
import { rockhopMeta } from './builder';
import { originality, ORIGINALITY_LIMIT } from './originality';
import { ZONE_ORDER } from './zones';

const TRACK_IDS = ['c1-low-tide', 'c2-crane-hop', 'c3-hull-breach', 'a1-sawdust', 'a2-log-jam', 'a3-timberline', 'd1-dust-devil', 'd2-conveyor', 'd3-rope-walk', 's1-lift-line', 's2-cornice', 's3-whiteout'];
const CODES = ['C1', 'C2', 'C3', 'A1', 'A2', 'A3', 'D1', 'D2', 'D3', 'S1', 'S2', 'S3'];
const PLAYGROUND_IDS = ['p-coast', 'p-alpine', 'p-quarry', 'p-snowline'];
const TIER_ORDER = ['beginner', 'easy', 'medium', 'hard', 'extreme'];

/** The staged set grows zone by zone; every assertion below holds for whatever has landed, in order. */
const landed = ROCKHOP_TRACKS.map((t) => t.id);

describe('ROCKHOP registry', () => {
  it('tracks are the approved world-map codes and ids, in progression order', () => {
    expect(landed).toEqual(TRACK_IDS.slice(0, landed.length));
    expect(ROCKHOP_TRACKS.map((t) => t.code)).toEqual(CODES.slice(0, landed.length));
    expect(ROCKHOP_PLAYGROUNDS.map((p) => p.id)).toEqual(PLAYGROUND_IDS.slice(0, ROCKHOP_PLAYGROUNDS.length));
  });

  it('resolve by id (getTrack, ?track=) but stay out of the listed set until the world-map cut-over', () => {
    const listed = new Set(listTrackIds());
    for (const t of ROCKHOP_ALL) {
      expect(getTrack(t.id)).toBe(t);
      expect(listed.has(t.id)).toBe(false);
    }
    expect(listRockhopTrackIds()).toEqual(ROCKHOP_ALL.map((t) => t.id));
  });

  it('zones run coast -> alpine -> quarry -> snowline, three tracks each, biome from the one mapping', () => {
    const zones = ROCKHOP_TRACKS.map((t) => t.zone);
    expect(zones).toEqual(zones.map((_z, i) => ZONE_ORDER[Math.floor(i / 3)]));
    for (const t of ROCKHOP_ALL) expect(t.meta?.biome).toBe(ROCKHOP_ZONE_BIOME[rockhopMeta(t).zone]);
    ROCKHOP_PLAYGROUNDS.forEach((p, i) => expect(p.zone).toBe(ZONE_ORDER[i]));
  });

  it('tiers, attempts bands and medal targets never step down C1 -> S3', () => {
    let tier = 0;
    let hi = 0;
    let target = 0;
    for (const t of ROCKHOP_TRACKS) {
      const m = rockhopMeta(t.def);
      expect(TIER_ORDER.indexOf(t.tier)).toBeGreaterThanOrEqual(tier);
      tier = TIER_ORDER.indexOf(t.tier);
      const band = m.attemptsBand as [number, number];
      expect(band[0]).toBeLessThanOrEqual(band[1]);
      expect(band[1]).toBeGreaterThanOrEqual(hi);
      hi = band[1];
      expect(m.targetTimeS as number).toBeGreaterThanOrEqual(target);
      target = m.targetTimeS as number;
      expect(t.medals.gold.timeS).toBe(m.targetTimeS);
      expect(t.medals.obsidian.timeS).toBeCloseTo((m.targetTimeS as number) * 0.85, 2);
      expect(t.medals.silver.timeS).toBeCloseTo((m.targetTimeS as number) * 1.25, 2);
      expect(m.idea.length).toBeGreaterThan(10);
      expect((m.setPieces ?? []).some((sp) => sp.label === m.hero)).toBe(true);
    }
  });

  it('playgrounds: free ride, one per zone, six review segments, classified as playgrounds', () => {
    for (const p of ROCKHOP_PLAYGROUNDS) {
      expect(isPlaygroundTrackId(p.id)).toBe(true);
      expect(rockhopMeta(p.def).playground).toBe(true);
      const segs = segmentsOf(p.def);
      expect(segs).toHaveLength(6);
      expect(segs[0]!.from).toBe(0);
      expect(segs[5]!.to).toBe(p.def.finishX);
    }
    for (const t of ROCKHOP_TRACKS) expect(isPlaygroundTrackId(t.id)).toBe(false);
  });
});

describe('ROCKHOP prop kit', () => {
  it('every prop rides on a base kind its brief allows, from its own zone', () => {
    for (const def of ROCKHOP_ALL) {
      const zone = rockhopMeta(def).zone;
      for (const o of def.obstacles) {
        const prop = o.params?.['prop'] as PropId | undefined;
        if (prop === undefined) continue;
        const brief = PROPS[prop];
        expect(brief, `${def.id}: unknown prop ${prop}`).toBeDefined();
        expect(isDecorKind(o.kind)).toBe(false);
        expect(brief.base, `${def.id}: ${prop} on a ${o.kind}`).toContain(o.kind as ObstacleKind);
        expect(brief.zone, `${def.id}: ${prop} is a ${brief.zone} prop`).toBe(zone);
      }
    }
  });
});

describe('bar 2: no retired layout ships', () => {
  const retired = RETIRED_TRACKS.map((t) => compileTrack(t));
  it.each(ROCKHOP_ALL.map((t) => [t.id, t] as const))('%s correlates < 0.6 with every retired course', (_id, def) => {
    const a = compileTrack(def);
    for (const b of retired) {
      const o = originality(a, b);
      expect(o.score, `${def.id} vs ${b.def.id}`).toBeLessThan(ORIGINALITY_LIMIT);
    }
  });

  it('no design note cites a Trials clip or the storyboards', () => {
    const dir = fileURLToPath(new URL('.', import.meta.url));
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))) {
      const src = readFileSync(`${dir}${f}`, 'utf8');
      expect(src, f).not.toMatch(/trials|storyboard|ubisoft|redlynx|\bclip \d/i);
    }
    for (const def of ROCKHOP_ALL) expect(JSON.stringify(def.meta)).not.toMatch(/trials|storyboard/i);
  });
});
