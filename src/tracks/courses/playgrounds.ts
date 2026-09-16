/**
 * Playgrounds (tracks round 10, CLOSEOUT "Next milestones -> 1. Biome playgrounds"): one BEGINNER course per
 * biome, so the user can ride every biome without finishing the game. Ids are `p<n>-*` (`isPlaygroundTrackId`);
 * core lists them in a "Playgrounds" row above Lab, always open, outside medals and progression.
 *
 * Every playground is the same brief: 400-550 m, ~35-50 s at flow speed, beginner band (reflex `novice` <= 3
 * over 9 seeds, `average` 1-2, bot 1), and EVERY beginner-legal primitive at least once — straight <= 14 deg
 * kickers landing on falling ground (B3), grounded hills (`smooth` / `descent` / `wave` / `plateau` at 20 m/s,
 * B1), one or two small gaps (<= 3 m, `smallGap` or a kicker onto a `gapLanding`), a sunk drum / half-buried
 * log (`bumpDrum`, 0.3 m proud rolls at any speed), a gentle plank (<= 22 deg) or see-saw (<= 22 deg, 14 m of
 * flat after the board), a step-up ledge <= 0.4 m (the v2 hop apex is 0.46; a 0.3 m kerb rolls), a drop off a
 * straight >= 8 x h down-ramp (the panic-drop rule, never a bare edge over 0.5), 0.12 x 0.8 stairs where the
 * biome has them — plus every biome ASSET at least once in the riding frame: the start gate + crowd + finish
 * arch on all five, the biome's tunnel / arch styles, its set pieces (`setPiece` kinds render reacts to) and
 * the obstacle kinds its kit dresses (containers = `box`, kerbs = `ledge`, logs = wood `drum`, oil drums =
 * `barrel`, pits = `gap` with the biome's hazard). tracks.md §"Playgrounds" is the per-course checklist.
 *
 * `meta.segments` (six per course, `segmentsOf(def)`) are the review segments the level reviewer walks:
 * x ranges with what the segment shows.
 */
import type { TrackDef, TrackMeta } from '../../core/types';
import { course, type CourseBuilder } from '../author';

/** Playground ids: `p1-` ... `p9-`. */
export const PLAYGROUND_ID_PREFIX = /^p\d-/;
export function isPlaygroundTrackId(id: string): boolean {
  return PLAYGROUND_ID_PREFIX.test(id);
}

/** A review segment: `[from, to)` m of course and what it shows. Six per playground. */
export interface TrackSegment {
  from: number;
  to: number;
  label: string;
}
export type PlaygroundMeta = TrackMeta & { playground?: true; segments?: TrackSegment[] };

export function segmentsOf(def: TrackDef): TrackSegment[] {
  return ((def.meta as PlaygroundMeta | undefined)?.segments ?? []).map((s) => ({ ...s }));
}

/**
 * Builds a playground: `seg(label)` opens a review segment at the cursor (the previous one closes there);
 * the last closes on the finish line. Six segments per course (asserted).
 */
function playground(id: string, name: string, build: (b: CourseBuilder, seg: (label: string) => void) => TrackDef): TrackDef {
  const b = course(id, name, 'beginner');
  const marks: { from: number; label: string }[] = [];
  const seg = (label: string): void => {
    marks.push({ from: b.cursor, label });
  };
  const def = build(b, seg);
  const segments: TrackSegment[] = marks.map((m, i) => ({ from: m.from, to: marks[i + 1]?.from ?? def.finishX, label: m.label }));
  if (segments.length !== 6) throw new Error(`[${id}] a playground has six review segments, got ${segments.length}`);
  const meta = def.meta as PlaygroundMeta;
  meta.playground = true;
  meta.segments = segments;
  return def;
}

/**
 * P1 — the industrial yard (B1-B3's biome: hall, containers, lamps, crowd, decals). A kicker row through the
 * container yard, two sunk drums, a 2 m gap onto the loading dock, a wood plank onto a container and the
 * 1.0 m drop off its 8 x h ramp, a 0.4 m kerb hop, a scaffold tunnel under the stacks, and the wave home
 * under the crowd bridge.
 */
export const P1 = playground('p1-container-yard', 'Yard Playground', (b, seg) => {
  b.meta({
    biome: 'industrial',
    technique: 'the industrial kit at beginner pace',
    demands: 'nothing new: kickers onto the downslope, sunk drums, a 2 m gap, a 0.4 m kerb hop, a plank onto a container, a 1.0 m ramp drop',
    attemptsBand: [1, 2],
    targetTimeS: 70,
  })
    .hint('Gas to the ramp, off at the lip')
    .hint('Lean back over the drums')
    .hint('Hop the kerb')
    .hint('Lean back off the drop')
    .camera({ mode: 'side' });
  seg('The grid: start gate, stands, the first hill under the crane rail');
  b.setPiece('start', 'The Yard Gate').flat(6).arch({ style: 'start' }).flat(18).endSetPiece();
  b.smooth(16, 1.2).flat(6).descent(16, 1.2, 20).flat(6).checkpoint(); // 68
  seg('Kicker 1 onto the downslope, two sunk oil drums, rollers');
  b.flat(16).ramp({ length: 4, height: 0.8 }).flat(6).slope(12, -0.8).flat(10); // kicker 1: 11 deg, lands on falling ground
  b.bumpDrum(0.5, 0.3).flat(8).bumpDrum(0.5, 0.3).flat(8); // sunk oil drums, 0.3 m proud
  b.rollers(20, 0.25, 3).flat(6).checkpoint(); // ~160
  seg('The 2 m gap and kicker 2 through the container rows');
  b.flat(16).smallGap(4, 1.0, 2).flat(14);
  b.ramp({ length: 6, height: 1.2 }).flat(6).slope(16, -1.2).flat(10); // kicker 2: 11 deg
  b.bumpRow(2, 0.25, 20).flat(8).checkpoint(); // ~256
  seg('The kerb hop, the plank onto a container and the 1.0 m drop');
  b.flat(8).ledge({ height: 0.35, length: 6 }).ramp({ length: 4, height: 0.35, direction: 'down' }).flat(12); // the kerb hop, 8 m past the spawn (the hop window is 5-8 m/s); 0.35 (a 0.4 here was 17 novice deaths in 9 seeds, median 4)
  b.plank({ angleDeg: 18, rise: 1.0, surface: 'wood' }).box({ width: 6, height: 1.0 }).ramp({ length: 10, height: 1.0, direction: 'down' }).flat(12); // 18 deg wood plank onto a metal container, off a 10 x h ramp
  b.wave(28, 1.5, 16).flat(8).checkpoint(); // ~366
  seg('The scaffold tunnel under the stacks and the plateau');
  b.flat(6).setPiece('tunnel', 'Under the Stacks').tunnel({ length: 24, style: 'scaffold', lit: true }).plateau(14, 6, 0.8, 14, 20).endSetPiece().flat(8).bumpRow(2, 0.25, 20).flat(6);
  seg('The wave home under the crowd bridge');
  b.wave(36, 1.5, 20).flat(6).arch({ style: 'crowd' }).setPiece('finish').flat(8).arch({ style: 'finish' });
  return b.finish();
});

/**
 * P2 — the canyon run (E1-E3's biome: mesas, scrub, ruts, dust, water tower / pickups / mine portal, braziers).
 * A mesa plateau off the line, a kicker pair landing on the downslope, two half-buried logs, a 2 m water gap, a
 * 0.3 m rock shelf, the mine stairs onto a plywood deck and its ramp down, a 15 deg see-saw, the 1.2 m drop off
 * the water-tower deck on a 12 x h ramp, and the wave home past the bleachers.
 */
export const P2 = playground('p2-canyon-run', 'Canyon Run', (b, seg) => {
  b.meta({
    biome: 'canyon',
    technique: 'the canyon kit at beginner pace',
    demands: 'nothing new: kickers onto the downslope, a 2 m water gap, logs, a 0.3 m shelf, 0.12 m stairs, a 15 deg see-saw, a 1.2 m ramp drop',
    attemptsBand: [1, 2],
    targetTimeS: 70,
  })
    .hint('Half gas up the mesa')
    .hint('Gas to the ramp, off at the lip')
    .hint('Roll the shelf, no brakes on the stairs')
    .hint('Lean back off the drop')
    .camera({ mode: 'side' });
  seg('The grid: start gate, light towers, braziers, the mesa plateau');
  b.setPiece('start', 'The Wash').flat(6).arch({ style: 'start' }).flat(18).endSetPiece();
  b.plateau(15, 8, 1.0, 15, 20).flat(6).checkpoint(); // 74
  seg('Kicker pair onto the downslope, the rut road');
  b.flat(16).ramp({ length: 4, height: 0.8 }).flat(6).slope(12, -0.8).flat(12);
  b.ramp({ length: 6, height: 1.2 }).flat(6).slope(16, -1.2).flat(10); // ~166
  b.rollers(20, 0.25, 3).flat(6).checkpoint(); // ~192
  seg('Logs, the water gap and the rock shelf');
  b.flat(6).bumpDrum(0.5, 0.3, { surface: 'wood' }).flat(8).bumpDrum(0.5, 0.3, { surface: 'wood' }).flat(16); // two fat logs, 0.3 m proud (B2's bump with a wood skin; r 0.3 half-logs 6 m past the spawn were 9 nose-low deaths in 9 seeds), then 16 m to the kicker (8 m after the second log the reflex rider hit the lip still pitched from the bumps: 5 nose-up deaths)
  b.smallGap(4, 1.0, 2).flat(14); // the water gap (canyon pits are water)
  b.ledge({ height: 0.3, length: 6, surface: 'concrete' }).ramp({ length: 3, height: 0.3, direction: 'down' }).flat(10); // the rock shelf: a 0.3 m kerb rolls
  b.bumpRow(2, 0.25, 20).flat(8).checkpoint(); // ~284
  seg('The mine stairs and the see-saw');
  b.flat(16).stair({ count: 5, height: 0.12, length: 0.8, surface: 'wood' }).box({ width: 6, height: 0.6, surface: 'wood' }).ramp({ length: 5, height: 0.6, direction: 'down', surface: 'wood' }).flat(12);
  b.seesawEntry({ length: 6, height: 0.8 }).flat(14); // 15 deg board
  b.wave(28, 1.5, 16).flat(8).checkpoint(); // ~390
  seg('The water-tower drop: 1.2 m off a 12 x h ramp');
  b.flat(6).setPiece('drop', 'The Tower Deck').ramp({ length: 12, height: 1.2, surface: 'wood' }).box({ width: 8, height: 1.2, surface: 'wood' }).ramp({ length: 14.4, height: 1.2, direction: 'down', surface: 'wood' }).endSetPiece().flat(12);
  seg('The wave home past the bleachers');
  b.wave(36, 1.5, 20).flat(6).arch({ style: 'crowd' }).setPiece('finish').flat(8).arch({ style: 'finish' });
  return b.finish();
});

/**
 * P3 — the snow line (M1-M3's biome: conifers, banks, cabins, log kerbs, the lift station / lodge, lanterns,
 * braziers). Grounded hills between the trees, a kicker pair, a log kerb pile and two half-buried logs, a 2 m ice
 * pond gap, a wood plank onto a crate and the 1.0 m drop off its ramp, a 16.7 deg see-saw, a 0.3 m step and the
 * ice-tunnel wave home.
 */
export const P3 = playground('p3-snow-line', 'Snow Line', (b, seg) => {
  b.meta({
    biome: 'snow',
    technique: 'the snow kit at beginner pace',
    demands: 'nothing new: kickers onto the downslope, a log pile behind its ramp, a 2 m pond gap, a plank onto a crate, a 1.0 m ramp drop, a 17 deg see-saw',
    attemptsBand: [1, 2],
    targetTimeS: 70,
  })
    .hint('Steady gas over the logs')
    .hint('Gas to the ramp, off at the lip')
    .hint('Lean back off the drop')
    .hint('Slow onto the see-saw')
    .camera({ mode: 'side' });
  seg('The grid: string lights, braziers, the first hill between the trees');
  b.setPiece('start', 'The Trailhead').flat(6).arch({ style: 'start' }).flat(18).endSetPiece();
  b.smooth(16, 1.2).flat(6).descent(16, 1.2, 20).flat(6).checkpoint(); // 68
  seg('Kicker pair onto the downslope, rollers through the banks');
  b.flat(16).ramp({ length: 4, height: 0.8 }).flat(6).slope(12, -0.8).flat(12);
  b.ramp({ length: 6, height: 1.2 }).flat(6).slope(16, -1.2).flat(10);
  b.rollers(20, 0.25, 3).flat(6).checkpoint(); // ~186
  seg('Log kerbs: two half-buried logs and the log pile behind its ramp');
  b.flat(16).ramp({ length: 4, height: 0.6, surface: 'wood' }).logpile({ radius: 0.3, count: 3, rows: 1 }).flat(10); // the log kerb: a 0.6 m log row behind a STRAIGHT 4 x 0.6 (8.5 deg) entry ramp to the log tops (`logStep`'s curve-0.3 lip at 12 m/s was 7 nose-up deaths in 9 seeds); 16 m from the spawn (the checkpoint rule reads a ramped pile as a launch); the 0.6 m round drop off the last log rides
  b.bumpDrum(0.3, 0.3, { surface: 'wood' }).flat(8).bumpDrum(0.3, 0.3, { surface: 'wood' }).flat(16); // 16 m to the kicker (P2's lesson)
  b.smallGap(4, 1.0, 2).flat(14); // the pond gap
  b.bumpRow(2, 0.25, 20).flat(8).checkpoint(); // ~276
  seg('The crate: an 18 deg plank up, the 1.0 m drop off its ramp; the 0.3 m step');
  b.flat(16).plank({ angleDeg: 18, rise: 1.0, surface: 'wood' }).box({ width: 6, height: 1.0, surface: 'wood' }).ramp({ length: 10, height: 1.0, direction: 'down', surface: 'wood' }).flat(12);
  b.ledge({ height: 0.3, length: 6, surface: 'wood' }).ramp({ length: 3, height: 0.3, direction: 'down', surface: 'wood' }).flat(10);
  b.wave(28, 1.5, 16).flat(8).checkpoint(); // ~382
  seg('The see-saw under the lift line');
  b.flat(16).setPiece('balance', 'The Lift Line').seesawEntry({ length: 8, height: 1.2 }).endSetPiece().flat(14); // 16.7 deg board
  seg('The ice tunnel and the wave home');
  b.setPiece('tunnel', 'The Ice Cave').tunnel({ length: 20, style: 'ice', lit: true }).wave(36, 1.5, 20).endSetPiece().flat(6).arch({ style: 'crowd' }).setPiece('finish').flat(8).arch({ style: 'finish' });
  return b.finish();
});

/**
 * P4 — the night circuit (H1-H2's biome: facades, rooftops, neon, lamp cones, the viaduct / crane, police cars,
 * zebra crossings, the lighting truss). Kerbs and a subway stair off the line, a kicker pair, a 2 m gap over a
 * flooded cut, a rooftop plateau, the 0.4 m kerb hop, a 15 deg see-saw, the 1.0 m loading-bay drop and the wave
 * home under the crowd bridge.
 */
export const P4 = playground('p4-night-circuit', 'Night Circuit', (b, seg) => {
  b.meta({
    biome: 'nightCity',
    technique: 'the night-city kit at beginner pace',
    demands: 'nothing new: 0.3 m kerbs, 0.12 m subway stairs, kickers onto the downslope, a 2 m gap, a 0.4 m kerb hop, a 15 deg see-saw, a 1.0 m ramp drop',
    attemptsBand: [1, 2],
    targetTimeS: 70,
  })
    .hint('Roll the kerbs')
    .hint('No brakes on the stairs')
    .hint('Gas to the ramp, off at the lip')
    .hint('Hop the kerb')
    .camera({ mode: 'side' });
  seg('The grid: lighting truss, police cars, the zebra crossing, two kerbs');
  b.setPiece('start', 'The Grid').flat(6).arch({ style: 'start' }).flat(18).endSetPiece();
  b.ledge({ height: 0.3, length: 4 }).ramp({ length: 3, height: 0.3, direction: 'down', surface: 'concrete' }).flat(8);
  b.ledge({ height: 0.3, length: 4 }).ramp({ length: 3, height: 0.3, direction: 'down', surface: 'concrete' }).flat(6).checkpoint(); // 52
  seg('The hill, the subway stairs and the kicker pair');
  b.flat(6).smooth(16, 1.2).flat(6).descent(16, 1.2, 20).flat(10); // the run-up to the stairs is the descent
  b.stair({ count: 5, height: 0.12, length: 0.8 }).box({ width: 6, height: 0.6, surface: 'concrete' }).ramp({ length: 5, height: 0.6, direction: 'down', surface: 'concrete' }).flat(12);
  b.ramp({ length: 4, height: 0.8 }).flat(6).slope(12, -0.8).flat(12);
  b.ramp({ length: 6, height: 1.2 }).flat(6).slope(16, -1.2).flat(10);
  b.rollers(20, 0.25, 3).flat(6).checkpoint(); // ~231
  seg('The flooded cut: a 2 m gap, then the rooftop plateau');
  b.flat(16).smallGap(4, 1.0, 2).flat(14);
  b.plateau(15, 8, 1.0, 15, 20).flat(8).checkpoint(); // ~311
  seg('The kerb hop and the see-saw');
  b.flat(8).ledge({ height: 0.4, length: 6 }).ramp({ length: 4, height: 0.4, direction: 'down', surface: 'concrete' }).flat(12);
  b.seesawEntry({ length: 6, height: 0.8 }).flat(14);
  b.bumpRow(2, 0.25, 20).flat(8).checkpoint(); // ~386
  seg('The loading-bay drop: 1.0 m off a 10 x h ramp');
  b.flat(6).setPiece('drop', 'The Loading Bay').ramp({ length: 10, height: 1.0 }).box({ width: 8, height: 1.0 }).ramp({ length: 10, height: 1.0, direction: 'down' }).endSetPiece().flat(12);
  seg('The wave home under the crowd bridge');
  b.wave(36, 1.5, 20).flat(6).arch({ style: 'crowd' }).setPiece('finish').flat(8).arch({ style: 'finish' });
  return b.finish();
});

/**
 * P5 — the foundry floor (H3 / X2-X3's biome: ladles, furnaces, troughs, stacks, sparks, melt lights, beacons,
 * heat haze). Steel plate and containers: a kicker pair, two sunk spools, a 2 m fire gap, a metal plank onto a
 * container and the 1.0 m drop off its ramp, the pipe-duct plateau, a 0.3 m grating step, a 16.7 deg see-saw
 * and the wave home under the pour.
 */
export const P5 = playground('p5-foundry-floor', 'Foundry Floor', (b, seg) => {
  b.meta({
    biome: 'foundry',
    technique: 'the foundry kit at beginner pace',
    demands: 'nothing new: kickers onto the downslope, sunk spools, a 2 m fire gap, a plank onto a container, a 1.0 m ramp drop, a 17 deg see-saw',
    attemptsBand: [1, 2],
    targetTimeS: 70,
  })
    .hint('Gas to the ramp, off at the lip')
    .hint('Lean back over the spools')
    .hint('Hold speed over the fire')
    .hint('Lean back off the drop')
    .camera({ mode: 'side' });
  seg('The grid: beacons, the first hill under the ladles');
  b.setPiece('start', 'The Hall Door').flat(6).arch({ style: 'start' }).flat(18).endSetPiece();
  b.smooth(16, 1.2).flat(6).descent(16, 1.2, 20).flat(6).checkpoint(); // 68
  seg('Kicker pair onto the downslope, the spools');
  b.flat(16).ramp({ length: 4, height: 0.8, surface: 'metal' }).flat(6).slope(12, -0.8).flat(12);
  b.ramp({ length: 6, height: 1.2, surface: 'metal' }).flat(6).slope(16, -1.2).flat(10);
  b.bumpDrum(0.5, 0.3).flat(8).bumpDrum(0.5, 0.3).flat(8).checkpoint(); // ~178
  seg('The fire gap and the pipe-duct plateau');
  b.flat(16).setPiece('fire', 'The Melt').ramp({ length: 4, height: 1.0, surface: 'metal' }).gap({ width: 2, hazard: 'fire' }).endSetPiece().flat(14);
  b.setPiece('tunnel', 'The Duct').tunnel({ length: 30, style: 'pipe', lit: true }).plateau(14, 6, 0.8, 14, 20).endSetPiece().flat(8).checkpoint(); // ~262
  seg('The container: a 20 deg steel plank up, the 1.0 m drop off its ramp; the grating step');
  b.flat(16).plank({ angleDeg: 20, rise: 1.0, surface: 'metal' }).box({ width: 6, height: 1.0 }).ramp({ length: 10, height: 1.0, direction: 'down', surface: 'metal' }).flat(12);
  b.ledge({ height: 0.3, length: 6, surface: 'grate' }).ramp({ length: 3, height: 0.3, direction: 'down', surface: 'metal' }).flat(10);
  b.wave(28, 1.5, 16).flat(8).checkpoint(); // ~366
  seg('The see-saw over the trough');
  b.flat(16).setPiece('balance', 'The Trough').seesawEntry({ length: 8, height: 1.2, surface: 'metal' }).endSetPiece().flat(14);
  seg('The wave home under the pour');
  b.wave(36, 1.5, 20).flat(6).arch({ style: 'pipe' }).setPiece('finish').flat(8).arch({ style: 'finish' });
  return b.finish();
});

export const PLAYGROUND_TRACKS: readonly TrackDef[] = [P1, P2, P3, P4, P5];
