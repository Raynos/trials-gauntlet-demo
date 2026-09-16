/**
 * Review segments for the 15 ship (curriculum) tracks — tracks round 10. The level reviewer walks these:
 * six `[from, to)` x ranges per track, in metres of course, each labelled with what the segment SHOWS.
 * Boundaries sit on the course's natural beats (checkpoints, set-piece starts, the first obstacle of a
 * section) and are rounded to whole metres from the compiled positions; the first starts at 0 and the
 * last closes on `Math.round(def.finishX)` (finish lines are authored to 0.1 m, e.g. 592.2 -> 592).
 * Playgrounds (`p<n>-*`) carry theirs in `meta.segments` (`segmentsOf(def)`), authored inline.
 */
import type { TrackSegment } from './courses/playgrounds';

export const SHIP_SEGMENTS: Readonly<Record<string, readonly TrackSegment[]>> = {
  // b1-first-ride: First Ride
  'b1-first-ride': [
    { from: 0, to: 66, label: 'Start: the first grounded hill (6.7 deg) and its descent, hold the gas' },
    { from: 66, to: 141, label: 'Rollers at steady gas, then the 15 / 8 / 1.0 plateau, grounded at top speed' },
    { from: 141, to: 236, label: 'Flow: 0.25 m hump row and the 36 m x 1.5 wave under full gas' },
    { from: 236, to: 412, label: 'Second plateau (16 / 10 / 1.2), hump rows, the 42 m x 2.0 wave that used to launch' },
    { from: 412, to: 503, label: 'The demand: 21 m descent, 8 m brake zone, the 0.3 m speed bump, the low plateau' },
    { from: 503, to: 583, label: 'The roller-coaster home: 46 m x 2.5 wave, rollers, finish' },
  ],
  // b2-lean-back: Lean Back
  'b2-lean-back': [
    { from: 0, to: 55, label: 'Start: two sunk drums (0.3 m proud) and a hump, lean back over the bumps' },
    { from: 55, to: 135, label: 'First drops: the 0.5 m kerb and the 1.0 m box, each onto an 8 x h landing ramp' },
    { from: 135, to: 254, label: 'Flow: rollers, hump row, 28 m wave, rollers to checkpoint 2' },
    { from: 254, to: 395, label: '1.2 m box drop onto the 9.6 m ramp, 26 m wave, the 1.5 / 1.0 / 0.5 m cascade, rollers' },
    { from: 395, to: 502, label: '1.0 m box drop onto the 8 m ramp, hump row, 28 m wave to checkpoint 4' },
    { from: 502, to: 592, label: 'The demand: 18 m ramp up to the 1.8 m drop onto the 14 m landing ramp, rollers home' },
  ],
  // b3-kicker-row: Kicker Row
  'b3-kicker-row': [
    { from: 0, to: 134, label: 'Start: the 4 x 0.8 (11 deg) and 4 x 1.0 kickers, both landing on falling ground; rollers' },
    { from: 134, to: 219, label: 'The 6 x 1.2 kicker onto a 16 m downslope, hump row' },
    { from: 219, to: 299, label: 'The 6 x 1.5 kicker (14 deg, the biggest lip) onto a 20 m slope, 28 m wave' },
    { from: 299, to: 384, label: 'First gaps: 2 m and 3 m off 4 x 1.0 / 1.2 kickers, 14 m apart; rollers' },
    { from: 384, to: 434, label: 'The demand: 6 x 1.5 kicker over the 4 m gap onto the up-ramp landing' },
    { from: 434, to: 472, label: 'Rollers home to the finish' },
  ],
  // e1-uphill-weight: Uphill Weight
  'e1-uphill-weight': [
    { from: 0, to: 101, label: 'Start rollers; the 30 deg plank onto the 3.0 m box and its 18 m down-ramp' },
    { from: 101, to: 184, label: 'Flow: 28 m wave, hump row, rollers to checkpoint 2' },
    { from: 184, to: 284, label: '40 deg kicker-plank onto the 3.6 m box, 22 m down-ramp; rollers, humps' },
    { from: 284, to: 416, label: '36 deg plank onto the 2.4 m box at speed, 15 m ramp; hump row, 34 m wave, rollers' },
    { from: 416, to: 480, label: 'The demand: 45 deg kicker-plank from 20 m, convex crest onto the 3.7 m box, 22 m ramp' },
    { from: 480, to: 544, label: '28 m wave, rollers home' },
  ],
  // e2-rear-wheel-first: Rear Wheel First
  'e2-rear-wheel-first': [
    { from: 0, to: 149, label: 'Start: 3 m gap off a 4 x 0.8 kicker, 4 m gap onto the uphill landing (rear first); rollers' },
    { from: 149, to: 213, label: '16.7 deg kicker over the 5 m gap onto the 1.0 m gapLanding ramp' },
    { from: 213, to: 285, label: '28 m wave, two 3 m small gaps 12 m apart' },
    { from: 285, to: 467, label: '4 m gap onto the 0.8 m landing; rollers, tabletop, wave, hump row to checkpoint 4' },
    { from: 467, to: 542, label: 'The demand: 5 m gap onto the 12 m landing ramp, 3 m platform, 4 m gap onto the gapLanding' },
    { from: 542, to: 616, label: 'Hump row, rollers home' },
  ],
  // e3-stairway: Stairway
  'e3-stairway': [
    { from: 0, to: 46, label: 'The start-line lesson: six 0.12 m risers onto the 0.75 m box, five steps down' },
    { from: 46, to: 135, label: 'Rollers, 28 m wave, hump row to checkpoint 2' },
    { from: 135, to: 235, label: 'Flight 2: ten 0.12 m risers onto the 1.2 m box, eight down; tabletop, rollers' },
    { from: 235, to: 384, label: 'Flight 3 at speed onto an 8 m top; hump row, wave, rollers' },
    { from: 384, to: 450, label: 'The demand: ten risers at speed, 8 x 0.15 down at 16.7 deg, 1.5 m gap onto the landing' },
    { from: 450, to: 544, label: 'Wave, tabletop, rollers home' },
  ],
  // m1-hop-up: Hop Up
  'm1-hop-up': [
    { from: 0, to: 41, label: 'The first hop: a rolling 0.4 m ledge 21 m from the line, 4 m down-ramp' },
    { from: 41, to: 103, label: 'Rollers and the 28 m wave to checkpoint 2' },
    { from: 103, to: 264, label: 'Hop up the 0.45 m ledge, settle, hop the 1.5 m gap; hump row, tabletop, wave, rollers' },
    { from: 264, to: 347, label: 'The two-stage: 0.4 m ledge, then a 0.35 m rise to 0.75 from a settled top, 8 m ramp' },
    { from: 347, to: 398, label: 'The demand: 0.3 / 0.6 steps and the ramp to 0.9 m, 2 m hop across to the 0.9 m box' },
    { from: 398, to: 481, label: 'Hump row, 28 m wave home' },
  ],
  // m2-drum-roll: Drum Roll
  'm2-drum-roll': [
    { from: 0, to: 66, label: 'Start: sunk drums 0.3 / 0.4 m proud and four half-buried logs, lean back' },
    { from: 66, to: 155, label: 'Rollers, 28 m wave, hump row to checkpoint 2' },
    { from: 155, to: 279, label: '3-log pyramid off the 0.6 m entry ramp, shelf at 1.0 onto the 1.2 m drum; hump row, wave' },
    { from: 279, to: 385, label: '1.6 m drum from its shelf, 2 m hop drum to drum, the spinning spool; tabletop, rollers' },
    { from: 385, to: 438, label: 'The demand: box -> spinning drum -> box, the five-log pyramid, the see-saw exit' },
    { from: 438, to: 488, label: '28 m wave home' },
  ],
  // m3-see-saw: See-Saw
  'm3-see-saw': [
    { from: 0, to: 61, label: 'Start: two see-saws (6 x 0.8, 8 x 1.2), slow past the pivot and ride the tip' },
    { from: 61, to: 174, label: 'Rollers, hump row, 28 m wave, rollers to checkpoint 2' },
    { from: 174, to: 300, label: '8 x 1.5 see-saw, 14 m of speed, 14 deg kicker over 3 m onto the 6 m plank at 1.5; wave' },
    { from: 300, to: 376, label: '3 m gap onto the 4 m plank at 1.0, the 8 x 1.5 see-saw, rollers' },
    { from: 376, to: 453, label: 'The demand: 3 m gap onto the 22 deg see-saw, kicker onto the 4 m plank, 2.5 m gap to a box' },
    { from: 453, to: 504, label: 'Hump row home' },
  ],
  // h1-wheelie-wire: Rooftop Wire
  'h1-wheelie-wire': [
    { from: 0, to: 77, label: 'The Grid: start gantry and crowd, rollers, the first wire: 8 rail slots at 2.5 m' },
    { from: 77, to: 191, label: '28 m wave, hump row, up one roof (+2 m) to checkpoint 1' },
    { from: 191, to: 331, label: '1.0 m stepped wall (lip climb or the 0.3 m hop), 6 slots at 3.0 m; rollers, tabletop, +4 m' },
    { from: 331, to: 496, label: '1.2 m wall into 6 slots at 2.5 m; wave, hump row, up to the +6 m roofline, 16 m run-up' },
    { from: 496, to: 539, label: 'The Wire: 1.4 m lip wall into 10 rail slots (4 at 2.5, 6 at 2.0) under the crowd bridge' },
    { from: 539, to: 622, label: 'The Drop: 40 deg roll-off into the 7 deg scaffold tunnel descent; hump row, crowd, finish' },
  ],
  // h2-gap-chain: Container Yard
  'h2-gap-chain': [
    { from: 0, to: 107, label: 'Container Yard gantry; chain A: 4 x 1.0 kicker, 3 m gaps onto three 12 m platforms at 0.8 (round 11: 8 -> 12 m)' },
    { from: 107, to: 211, label: 'Rollers; Under the Stacks: 30 m concrete tunnel over a 28 m wave, hump row to checkpoint 1' },
    { from: 211, to: 324, label: 'Chain B: 4 m gap, 12 m platforms stepping up 1.2 -> 1.8 by 0.2 (rear first), 2.2 m box, curved ramp' },
    { from: 324, to: 406, label: 'Hump row, up the stack (+2.4 m) onto the crane apron' },
    { from: 406, to: 536, label: 'The 30 m apron; The Crane Jump: 6 x 1.5 over 5 m of water onto the gapLanding; down, crowd' },
    { from: 536, to: 665, label: 'Chain C, the demand: three 8 m platforms at 1.0 with 3 m gaps, last gap onto the incline' },
  ],
  // h3-fire-line: The Pour
  'h3-fire-line': [
    { from: 0, to: 82, label: 'The Hall Door; Ladle 1: 22 deg kicker over four burning barrels onto the 14 deg ramp' },
    { from: 82, to: 201, label: 'Rollers, hump row, 28 m wave, tabletop to checkpoint 1' },
    { from: 201, to: 338, label: 'Ladle 2: five barrels, then the 12 m brake zone and the 8 m x 0.45 m kerb hop; wave, into the tunnel' },
    { from: 338, to: 455, label: 'The Pour: 60 m foundry tunnel, two fire rows with 16 m of flat between, no brake; crowd, rollers' },
    { from: 455, to: 532, label: 'Ladle 4, the demand: six barrels into the 12 m brake zone, hump, 6 m, the 0.5 m kerb under the gantry, ramp' },
    { from: 532, to: 629, label: '40 m glide down to the yard, hump row, finish' },
  ],
  // x1-vertical-limit: The Ascent
  'x1-vertical-limit': [
    { from: 0, to: 76, label: 'Base Camp; Face 1: 45 deg kicker-plank up 3.6 m onto the 12 m box, 22 m ramp, checkpoint' },
    { from: 76, to: 205, label: 'Rollers; The Pillars: level caps at 1.2 m from the 0.8 m ledge over the kill pit; ridge +2' },
    { from: 205, to: 400, label: 'Face 2: 45 deg / 3.9 m from a 30 m run-in onto the 16 m box; hump row, ridge +4, tabletop' },
    { from: 400, to: 546, label: 'The Rising Pillars: caps 1.2 -> 1.8 m over the kill pit; rollers, wave, ridge +6' },
    { from: 546, to: 636, label: 'The Summit: 45 deg / 4.5 m face, 16 m shelf, three ice-cave caps at 4.5 m, 24 m ramp down' },
    { from: 636, to: 744, label: 'The Glissade: 56 m descent home losing 6 m, hump row, crowd, finish' },
  ],
  // x2-pipe-dream: The Rolling Mill
  'x2-pipe-dream': [
    { from: 0, to: 92, label: 'The Rolling Mill; shelf onto a spinning 1.6 m drum, 2 m hop; 5-log pyramid; the shelf drum' },
    { from: 92, to: 181, label: 'Rollers; The Duct: 40 m pipe tunnel over a 28 m wave and a hump row to checkpoint 1' },
    { from: 181, to: 335, label: '22 deg see-saw, shelf onto the 2.0 m drum, 15 m platform; The Big Roller over 4 m of melt' },
    { from: 335, to: 396, label: 'The Pipe Run: three spinning tops with 1.5 m gaps; rollers to checkpoint 3' },
    { from: 396, to: 464, label: 'The demand: see-saw drop, 16 m, shelf onto a spinning drum, 2 m hop to the next, shelf out' },
    { from: 464, to: 564, label: '0.5 m kerb hop, 40 m yard ramp down, hump row, finish' },
  ],
  // x3-gauntlet: The Stack
  'x3-gauntlet': [
    { from: 0, to: 116, label: 'The Stack gantry; 45 deg plank onto the 12 m box, 22 m ramp to the 1.5 / 1.0 / 0.5 cascade' },
    { from: 116, to: 187, label: 'Rollers; 8 x 0.15 m stairs onto the 1.2 m box and down into the 2 m gap' },
    { from: 187, to: 248, label: 'Hall Two: 50 m tunnel, 8 m x 0.5 m hop ledge and 1.5 m hop across, the spinning shelf drum' },
    { from: 248, to: 333, label: '3 m gap onto the 22 deg see-saw; 1.4 m lip climb, 8 m top, four kill slots at 2.0 m' },
    { from: 333, to: 477, label: 'Two 5.5 m platforms at 1.0 with 2.5 m gaps; crowd; The Pour: 22 deg kicker over 6 barrels' },
    { from: 477, to: 575, label: 'The Stack: 45 deg / 4.5 m from 30 m onto the 16 m box, three chimney caps, 24 m ramp home' },
  ],
};
