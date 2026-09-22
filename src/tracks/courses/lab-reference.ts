/** Short, playable studies of two reference maneuvers: a two-step container climb and a timber ramp launch.
 * Dimensions are authored for our bike, not a claim of measurements from footage.
 */
import type { TrackDef } from '../../core/types';
import { course } from '../author';

/** Shared with scenery so visible container faces coincide with collision surfaces. */
export const LAB_BOX_GEOMETRY = {
  boxes: [
    { x: 12, y: 0, width: 3, height: 0.65 },
    { x: 15, y: 0, width: 4, height: 1.25 },
  ],
  descent: { x: 19, y: 0, length: 4, height: 1.25 },
  finishX: 33,
} as const;

export const LAB_RAMP_GEOMETRY = {
  approach: { x: 8, y: 0, length: 3, height: 0.65 },
  approachDown: { x: 11, y: 0, length: 3, height: 0.65 },
  takeoff: { x: 17, y: 0, length: 6, height: 2.4, curve: 0.65 },
  gap: { x: 23, width: 3, depth: 1, rise: 1.8 },
  landing: { x: 26, y: 1.8 },
  finishX: 38,
} as const;

const box = LAB_BOX_GEOMETRY;
export const LAB_BOX_CLIMB: TrackDef = /* @__PURE__ */ (() =>
  course('lab-box-climb', 'Container Step', 'medium')
    .meta({
      biome: 'industrial',
      technique: 'rear-wheel lift and forward transfer',
      demands: 'lift onto a 0.65 m container, then climb the next 0.6 m step without catching the front wheel',
      attemptsBand: [3, 8],
      targetTimeS: 12,
    })
    .camera({ mode: 'side' })
    .hint('physics')
    .flat(box.boxes[0].x)
    .setPiece('climb', 'Container step transfer')
    .box({ width: box.boxes[0].width, height: box.boxes[0].height, surface: 'metal' })
    .box({ width: box.boxes[1].width, height: box.boxes[1].height, surface: 'metal' })
    .ramp({ length: box.descent.length, height: box.descent.height, direction: 'down', surface: 'wood' })
    .endSetPiece()
    .flat(10)
    // Compact maneuver lab: deliberately shorter than the curriculum's 15 m run-up rule.
    .finish(30, { checkpointRule: false }))();

const jump = LAB_RAMP_GEOMETRY;
export const LAB_RAMP_JUMP: TrackDef = /* @__PURE__ */ (() =>
  course('lab-ramp-jump', 'Timber Launch', 'easy')
    .meta({
      biome: 'industrial',
      technique: 'ramp preload and airborne landing control',
      demands: 'settle after the small approach ramp, launch from the concave timber ramp, and land across the 3 m dry gap',
      attemptsBand: [2, 6],
      targetTimeS: 12,
    })
    .camera({ mode: 'side' })
    .hint('physics')
    .flat(jump.approach.x)
    .ramp({ length: jump.approach.length, height: jump.approach.height, curve: 0.3, surface: 'wood' })
    .ramp({ length: jump.approachDown.length, height: jump.approachDown.height, direction: 'down', surface: 'wood' })
    .flat(3)
    .setPiece('air', 'Timber launch and landing')
    .ramp({ length: jump.takeoff.length, height: jump.takeoff.height, curve: jump.takeoff.curve, surface: 'wood' })
    .gap({ width: jump.gap.width, depth: jump.gap.depth, rise: jump.gap.rise, hazard: 'none', floor: 'dirt' })
    .flat(12)
    .endSetPiece()
    .finish(30, { checkpointRule: false }))();
