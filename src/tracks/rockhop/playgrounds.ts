/**
 * ROCKHOP zone playgrounds: one free-ride course per zone (no medals, outside progression, always open), ids
 * `p-<zone>` (`isPlaygroundTrackId`). Each rides the zone's whole prop kit at beginner pace — nothing a first-day
 * rider cannot roll — so the player can tour a zone before they have earned it: straight <= 14 deg kickers onto
 * falling ground, grounded cosine hills, sunk logs / tyres / rubble 0.2-0.25 m proud, small gaps onto landing
 * inclines, <= 0.3 m kerbs, 0.12 x 0.8 stairs, a <= 22 deg board, drops only off >= 8 x h ramps.
 *
 * `meta.segments` (six per course, `segmentsOf(def)`) are the review segments the level reviewer walks.
 */
import type { TrackDef, TrackMeta } from '../../core/types';
import type { CourseBuilder } from '../author';
import type { TrackSegment } from '../courses/playgrounds';
import { rockhop, type RockhopMeta } from './builder';
import type { ZoneId } from './zones';

function playground(zone: ZoneId, code: string, name: string, idea: string, demands: string, build: (b: CourseBuilder, seg: (label: string) => void) => void): TrackDef {
  const b = rockhop(code, `p-${zone}`, name, zone, 'beginner', {
    technique: `the ${zone} kit at free-ride pace`,
    demands,
    idea,
    hero: 'free ride',
    attemptsBand: [1, 2],
    targetTimeS: 70,
  });
  const marks: { from: number; label: string }[] = [];
  build(b, (label) => marks.push({ from: b.cursor, label }));
  const def = b.finish();
  const segments: TrackSegment[] = marks.map((m, i) => ({ from: m.from, to: marks[i + 1]?.from ?? def.finishX, label: m.label }));
  if (segments.length !== 6) throw new Error(`[${def.id}] a playground has six review segments, got ${segments.length}`);
  const meta = def.meta as RockhopMeta & TrackMeta;
  meta.playground = true;
  meta.segments = segments;
  return def;
}

/** The harbour yard: slipway, tyres, pier hops, a pontoon gap, the container stack and its gangway. */
export const P_COAST = playground('coast', 'PC', 'Harbour Yard', 'the whole scrapyard at an easy roll', 'nothing new: a pier hop, sunk tyres, a 2.5 m pontoon gap, a pallet kerb, a container stack and its gangway', (b, seg) => {
  b.hint('Gas up the pier, off at the lip').hint('Steady over the tyres').hint('Ease off down the gangway').camera({ mode: 'side' });
  seg('The harbour gate and the slipway');
  b.setPiece('start', 'The Harbour Gate').flat(6).arch({ style: 'start' }).flat(18).endSetPiece();
  b.smooth(20, 1.4).flat(10).descent(20, 1.4, 20).flat(8).checkpoint();
  seg('The pier hop');
  b.flat(16).ramp({ length: 10, height: 1.0, surface: 'wood', prop: 'pallet' }).box({ width: 6, height: 1.0, surface: 'wood', prop: 'pier' });
  b.ramp({ length: 3, height: 0.5, surface: 'wood', prop: 'pallet' }, { base: 1.0 }).ramp({ length: 14, height: 1.0, direction: 'down', surface: 'wood', prop: 'gangway' }).flat(12);
  seg('The tyre line and the pontoon gap');
  b.bumpDrum(0.6, 0.18, { surface: 'rubber', prop: 'tyre' }).flat(6).bumpDrum(0.6, 0.18, { surface: 'rubber', prop: 'tyre' }).flat(10).checkpoint();
  b.flat(16).ramp({ length: 5, height: 1.0, surface: 'wood', prop: 'pallet' }).gap({ width: 2.5 }).gapLanding(0.6, 6, 6, 8).flat(12);
  seg('The pallet kerb and the beached buoys');
  b.ledge({ height: 0.3, length: 6, surface: 'wood', prop: 'pallet' }).ramp({ length: 4, height: 0.3, direction: 'down', surface: 'wood', prop: 'pallet' }).flat(10);
  b.bumpDrum(0.6, 0.2, { surface: 'metal', prop: 'buoy' }).flat(10).checkpoint();
  seg('The container stack');
  b.flat(8).setPiece('balance', 'The Stack').ramp({ length: 12, height: 1.0, surface: 'wood', prop: 'pallet' }).box({ width: 8, height: 1.0, prop: 'container' }).box({ width: 8, height: 1.3, prop: 'container', variant: 1 });
  b.ramp({ length: 16, height: 1.3, direction: 'down', surface: 'metal', prop: 'gangway' }).endSetPiece().flat(12).checkpoint();
  seg('The quay home');
  b.flat(6).wave(36, 1.2, 20).flat(6).arch({ style: 'crowd' }).setPiece('finish').flat(8).arch({ style: 'finish' });
});

/** The forest trail: log bumps, the loading-dock stairs, a board, a log row, the mill race and the lake shore. */
export const P_ALPINE = playground('alpine', 'PA', 'Forest Trail', 'the sawmill and the lake trail at an easy roll', 'nothing new: bark bumps, 0.12 m timber stairs, a 17 deg board, a log row, a 2.5 m mill-race gap, a 1.0 m ramp drop', (b, seg) => {
  b.hint('Steady over the logs').hint('No brakes on the stairs').hint('Slow onto the board').camera({ mode: 'side' });
  seg('The trailhead and the bark bumps');
  b.setPiece('start', 'The Trailhead').flat(6).arch({ style: 'start' }).flat(18).endSetPiece();
  b.bumpDrum(0.5, 0.2, { surface: 'wood', prop: 'log' }).flat(8).bumpDrum(0.5, 0.2, { surface: 'wood', prop: 'log' }).flat(12).checkpoint();
  seg('The loading-dock stairs');
  b.flat(16).stair({ count: 6, height: 0.12, length: 0.8, surface: 'wood', prop: 'timber-deck' }).box({ width: 8, height: 0.72, surface: 'wood', prop: 'timber-deck' });
  b.ramp({ length: 8, height: 0.72, direction: 'down', surface: 'wood', prop: 'timber-deck' }).flat(12).wave(40, 1.4, 20).flat(10);
  seg('The teetering log and the log row');
  b.seesawEntry({ length: 8, height: 1.2, surface: 'wood', prop: 'log' }).flat(14).checkpoint();
  b.flat(16).ramp({ length: 4, height: 0.6, surface: 'wood', prop: 'timber-deck' }).logpile({ radius: 0.3, count: 3, surface: 'wood', prop: 'log' }).flat(14);
  seg('The mill race');
  b.ramp({ length: 5, height: 1.0, surface: 'wood', prop: 'timber-deck' }).gap({ width: 2.5 }).gapLanding(0.6, 6, 6, 8).flat(12).checkpoint();
  seg('The flume deck and its ramp down');
  b.flat(8).setPiece('drop', 'The Flume Deck').ramp({ length: 12, height: 1.0, surface: 'wood', prop: 'flume' }).box({ width: 8, height: 1.0, surface: 'wood', prop: 'flume' });
  b.ramp({ length: 12, height: 1.0, direction: 'down', surface: 'wood', prop: 'timber-deck' }).endSetPiece().flat(12).checkpoint();
  seg('The lake shore home');
  b.flat(6).wave(36, 1.2, 20).flat(6).arch({ style: 'crowd' }).setPiece('finish').flat(8).arch({ style: 'finish' });
});

/** The quarry floor: rubble, cut kerbs, a conveyor ramp, the ore-cart gap, the terraces and the whoops. */
export const P_QUARRY = playground('quarry', 'PD', 'Quarry Floor', 'the quarry floor and its plant at an easy roll', 'nothing new: rubble humps, 0.3 m cut kerbs, a 20 deg conveyor onto the hopper, a 2.5 m ore-cart gap, 0.3 m terraces, the whoops', (b, seg) => {
  b.hint('Steady over the rubble').hint('Roll the kerbs').hint('Lean forward up the belt').camera({ mode: 'side' });
  seg('The pit head and the rubble');
  b.setPiece('start', 'The Pit Head').flat(6).arch({ style: 'start' }).flat(18).endSetPiece();
  b.bumpDrum(0.6, 0.2, { surface: 'stone', prop: 'rubble' }).flat(8).bumpDrum(0.6, 0.2, { surface: 'stone', prop: 'rubble' }).flat(12).checkpoint();
  seg('The conveyor onto the hopper');
  b.flat(16).plank({ angleDeg: 20, rise: 1.2, surface: 'rubber', prop: 'conveyor' }).box({ width: 6, height: 1.2, surface: 'metal', prop: 'block' });
  b.ramp({ length: 12, height: 1.2, direction: 'down', surface: 'metal', prop: 'conveyor' }).flat(12).wave(40, 1.4, 20).flat(10);
  seg('The cut kerbs');
  b.ledge({ height: 0.3, length: 6, surface: 'stone', prop: 'block' }).ramp({ length: 4, height: 0.3, direction: 'down', surface: 'stone', prop: 'block' }).flat(10);
  b.bumpDrum(0.6, 0.2, { surface: 'stone', prop: 'rubble', variant: 1 }).flat(8).rollers(24, 0.2, 3).flat(10).checkpoint();
  seg('The ore-cart gap');
  b.flat(16).ramp({ length: 5, height: 1.0, surface: 'metal', prop: 'ore-cart' }).gap({ width: 2.5 }).gapLanding(0.6, 6, 6, 8).flat(12).checkpoint();
  seg('The terraces');
  b.flat(12).setPiece('climb', 'The Low Terraces').ledge({ height: 0.3, length: 6, surface: 'stone', prop: 'block' }).ledge({ height: 0.6, length: 8, surface: 'stone', prop: 'block' });
  b.ramp({ length: 8, height: 0.6, direction: 'down', surface: 'dirt' }).endSetPiece().flat(12).checkpoint();
  seg('The whoops home');
  b.flat(6).rollers(30, 0.25, 4).flat(8).wave(36, 1.2, 20).flat(6).arch({ style: 'crowd' }).setPiece('finish').flat(8).arch({ style: 'finish' });
});

/** The piste: fence kerbs, the snow-cat ramp, an ice-shelf gap, a board, a low tower shelf and the run down. */
export const P_SNOWLINE = playground('snowline', 'PS', 'Piste', 'the ski area at an easy roll', 'nothing new: fence kerbs, a 2.5 m ice-shelf gap, the snow-cat blade ramp, a 17 deg board, the long run down', (b, seg) => {
  b.hint('Roll the fence kerbs').hint('Gas to the ramp, off at the lip').hint('Slow onto the board').camera({ mode: 'side' });
  seg('The base station and the fence kerbs');
  b.setPiece('start', 'The Base Station').flat(6).arch({ style: 'start' }).flat(18).endSetPiece();
  b.ledge({ height: 0.25, length: 5, surface: 'wood', prop: 'fence' }).ramp({ length: 3, height: 0.25, direction: 'down', surface: 'snow', prop: 'ice-ledge' }).flat(8);
  b.ledge({ height: 0.25, length: 5, surface: 'wood', prop: 'fence' }).ramp({ length: 3, height: 0.25, direction: 'down', surface: 'snow', prop: 'ice-ledge' }).flat(10).checkpoint();
  seg('The ice-shelf gap');
  b.flat(16).ramp({ length: 5, height: 1.0, surface: 'snow', prop: 'ice-ledge' }).gap({ width: 2.5 }).gapLanding(0.6, 6, 6, 8).flat(12);
  seg('The snow-cat');
  b.ramp({ length: 10, height: 1.0, surface: 'metal', prop: 'snowcat' }).box({ width: 6, height: 1.0, surface: 'metal', prop: 'snowcat' }).ramp({ length: 10, height: 1.0, direction: 'down', surface: 'snow', prop: 'ice-ledge' }).flat(12).checkpoint();
  seg('The board under the lift line');
  b.flat(3).setPiece('balance', 'The Lift Line').seesawEntry({ length: 8, height: 1.2, surface: 'wood' }).endSetPiece().flat(14);
  b.bumpRow(2, 0.25, 20).flat(8).checkpoint();
  seg('The glacier shelf');
  b.flat(8).ramp({ length: 12, height: 1.2, surface: 'snow', prop: 'ice-ledge' }).box({ width: 8, height: 1.2, surface: 'snow', prop: 'ice-ledge' });
  b.ramp({ length: 12, height: 1.2, direction: 'down', surface: 'snow', prop: 'ice-ledge' }).flat(12).checkpoint();
  seg('The run down');
  b.flat(6).wave(36, 1.2, 20).flat(6).arch({ style: 'crowd' }).setPiece('finish').flat(8).arch({ style: 'finish' });
});

export const ROCKHOP_ZONE_PLAYGROUNDS = [P_COAST, P_ALPINE, P_QUARRY, P_SNOWLINE] as const;
