/**
 * QUARRY — the desert quarry (Q2, D23): cut sandstone blocks and terraces, ore carts on rail stubs, belt
 * conveyors and their pulley drums, plank-and-rope bridges over the pit, rubble. Medium -> hard. The zone asks
 * for commitment: hops at the top of the window, momentum climbs up the belts, a spinning pulley, and the rope
 * walk on the rear wheel over the pit.
 *
 * Authoring numbers: `FEEL` / docs/design/tracks.md §0 (physics v2). Hop ledges <= 0.45 m 6-8 m past the spawn;
 * momentum planks 40-45 deg over the 0.3 m kicker foot from >= 20 m with a >= 12 m top; spinning drums from a shelf
 * at centre + 0.4 with an exit shelf; kicker lips on platforms straight 2 x 0.4; kill slots 0.7 m wide.
 */
import { rockhop } from './builder';

/** Kill slots (missing boards): 0.7 m pits 1.5 m deep at `pitch`, the rider crosses them on the rear wheel. */
function slots(b: ReturnType<typeof rockhop>, count: number, pitch: number): ReturnType<typeof rockhop> {
  for (let i = 0; i < count; i++) b.gap({ width: 0.7, depth: 1.5, hazard: 'kill' }).flat(pitch - 0.7);
  return b;
}

/**
 * D1 DUST DEVIL — down into the old pit and back up its cut terraces. TEACHES the rolling hop onto sandstone
 * blocks and across a trench, and holding speed through the dust whoops. DEMANDS the terraces: a 0.4 m hop and three
 * 0.3 m cut steps up to 1.3 m, and the roll off the top; then the whoops.
 */
export const D1 = rockhop('D1', 'd1-dust-devil', 'Dust Devil', 'quarry', 'medium', {
  technique: 'the hop onto blocks, the cut terraces, and the whoops at speed',
  demands: 'the terraces: a 0.4 m hop and three 0.3 m cut steps up to 1.3 m, off the top; then a 1.4 m hop across the drill trench',
  idea: 'the quarry floor: hop the cut blocks, climb the terraces, ride the dust whoops out',
  hero: 'The Terraces',
  attemptsBand: [3, 6],
  targetTimeS: 50, // gold: skill-3 bot 25.95 s x 1.6 = 41.5, rounded up to 5 s, non-decreasing through the tier (OBSIDIAN = 0.85 x gold, 0 bails)
})
  .camera({ mode: 'side' })
  .setPiece('start', 'The Pit Head')
  .flat(6)
  .arch({ style: 'start' })
  .flat(18)
  .endSetPiece()
  .checkpoint()
  .flat(7)
  .camera({ mode: 'side-tight' })
  .ledge({ height: 0.4, length: 7, surface: 'stone', prop: 'block' }) // hop 1: onto a cut block
  .ramp({ length: 5, height: 0.4, direction: 'down', surface: 'stone', prop: 'block' })
  .flat(10)
  .camera({ mode: 'side' })
  .bumpDrum(0.6, 0.2, { surface: 'stone', prop: 'rubble' }) // rubble humps
  .flat(8)
  .bumpDrum(0.6, 0.2, { surface: 'stone', prop: 'rubble', variant: 1 })
  .flat(12)
  .checkpoint()
  .flat(16)
  .camera({ mode: 'side-tight', zoomBias: -0.3 })
  .setPiece('climb', 'The Terraces')
  .ledge({ height: 0.4, length: 7, surface: 'stone', prop: 'block' }) // cut terrace 1: a hop
  .ledge({ height: 0.7, length: 6, surface: 'stone', prop: 'block' }) // 2: a 0.3 m step
  .ledge({ height: 1.0, length: 6, surface: 'stone', prop: 'block' }) // 3
  .ledge({ height: 1.3, length: 8, surface: 'stone', prop: 'block' }) // 4: the top
  .ramp({ length: 14, height: 1.3, direction: 'down', surface: 'dirt' }) // the haul ramp down
  .endSetPiece()
  .camera({ mode: 'side' })
  .flat(12)
  .wave(30, 1.2, 16)
  .flat(8)
  .checkpoint()
  .flat(7)
  .camera({ mode: 'side-tight' })
  .ledge({ height: 0.4, length: 6, surface: 'stone', prop: 'block' }) // onto the block
  .gap({ width: 1.4, depth: 2 }) // hop the drill trench
  .ramp({ length: 2, height: 0.2, surface: 'stone', prop: 'block' }, { base: 0.2 }) // landing lip
  .box({ width: 6, height: 0.4, surface: 'stone', prop: 'block' })
  .ramp({ length: 5, height: 0.4, direction: 'down', surface: 'stone', prop: 'block' })
  .flat(14)
  .camera({ mode: 'side' })
  .bumpRow(2, 0.3, 16)
  .flat(8)
  .checkpoint()
  .flat(7)
  .camera({ mode: 'side-tight' })
  .ledge({ height: 0.4, length: 7, surface: 'stone', prop: 'block' }) // a cut block across the haul road
  .ramp({ length: 5, height: 0.4, direction: 'down', surface: 'stone', prop: 'block' })
  .flat(10)
  .camera({ mode: 'high34', zoomBias: 0.3 })
  .setPiece('drop', 'The Dust Devil')
  .rollers(36, 0.4, 5) // the whoops: five 0.4 m dust whoops at 7 m pitch
  .flat(8)
  .rollers(24, 0.3, 4) // and four tighter ones
  .endSetPiece()
  .camera({ mode: 'side' })
  .flat(8)
  .arch({ style: 'crowd' })
  .setPiece('finish')
  .flat(10)
  .arch({ style: 'finish' })
  .finish();

/**
 * D2 CONVEYOR — the crushing plant. TEACHES momentum climbs up the belts (lean forward, steady gas over the
 * kicker foot, the climb is won at the crest) and the spinning pulley (roll the top from its shelf, off the gas on
 * it). DEMANDS the head pulley: up the 45 deg main belt onto the head house, over the spinning head drum on its frame
 * and down the tail chute.
 */
export const D2 = rockhop('D2', 'd2-conveyor', 'Conveyor', 'quarry', 'hard', {
  technique: 'momentum climbs up the belts and the spinning pulley',
  demands: 'the head pulley: the 45 deg main belt to 3.0 m, a 0.4 m hop onto the drive frame, the spinning head drum, the tail chute down; then the ore-cart run',
  idea: 'ride the crushing plant: up the conveyors, over the pulleys, out along the ore carts',
  hero: 'The Head Pulley',
  attemptsBand: [3, 7],
  targetTimeS: 55, // gold: skill-3 bot 33.84 s x 1.6 = 54.1, rounded up to 5 s, non-decreasing through the tier (OBSIDIAN = 0.85 x gold, 0 bails)
})
  .camera({ mode: 'side' })
  .setPiece('start', 'The Weighbridge')
  .flat(6)
  .arch({ style: 'start' })
  .flat(18)
  .endSetPiece()
  .checkpoint()
  .flat(20)
  .camera({ mode: 'side-tight', zoomBias: -0.4 })
  .setPiece('climb', 'The Feed Belt')
  .kickerPlank({ angleDeg: 40, rise: 2.4 }) // the feed belt: 40 deg
  .box({ width: 8, height: 2.4, surface: 'metal', prop: 'block' }) // the hopper deck: settle
  .ledge({ height: 0.4, length: 6, surface: 'metal', prop: 'block' }, { base: 2.4 }) // hop up onto the hopper rim
  .ramp({ length: 20, height: 2.8, direction: 'down', surface: 'metal', prop: 'conveyor' }) // the return belt down
  .endSetPiece()
  .camera({ mode: 'side' })
  .flat(10)
  .rollers(20, 0.25, 3)
  .flat(8)
  .checkpoint()
  .flat(16)
  .camera({ mode: 'side-tight', zoomBias: -0.5 })
  .drumStep({ radius: 0.8, rolls: true, prop: 'pulley' }, { exit: true }) // the tail pulley on its frame: it spins under you
  .flat(10)
  .camera({ mode: 'side' })
  .wave(30, 1.2, 16)
  .flat(8)
  .checkpoint()
  .flat(3)
  .flat(27) // 30 m run-in to the main belt
  .camera({ mode: 'side-tight', pitch: (12 * Math.PI) / 180 })
  .setPiece('climb', 'The Head Pulley')
  .kickerPlank({ angleDeg: 45, rise: 3.0 }) // the main belt
  .box({ width: 10, height: 3.0, surface: 'metal', prop: 'block' }) // the head house floor: settle
  .ledge({ height: 0.4, length: 6, surface: 'metal', prop: 'block' }, { base: 3.0 }) // hop onto the drive frame
  .drumStep({ radius: 0.8, rolls: true, prop: 'pulley' }, { base: 3.4, exit: true, rampLength: 4 }) // the head drum: its top at 5.0 m
  .box({ width: 4, height: 3.4, surface: 'metal', prop: 'block' })
  .ramp({ length: 26, height: 3.4, direction: 'down', surface: 'metal', prop: 'conveyor' }) // the tail chute
  .endSetPiece()
  .camera({ mode: 'side' })
  .flat(12)
  .bumpRow(2, 0.3, 16)
  .flat(8)
  .checkpoint()
  .flat(16)
  .camera({ mode: 'high34' })
  .setPiece('air', 'The Cart Run')
  .ramp({ length: 4, height: 1.0, surface: 'metal', prop: 'ore-cart' }) // the ore-cart line
  .gap({ width: 3.5 })
  .platform(12, 0.9, { landing: 0.4, landingLength: 3, length: 2, curve: 0 }) // cart 1
  .gap({ width: 3.5 })
  .platform(12, 1.1, { landing: 0.4, landingLength: 3, length: 2, curve: 0 }) // cart 2, higher: land rear first
  .gap({ width: 2.5 })
  .gapLanding(1.1, 5, 6, 10)
  .endSetPiece()
  .camera({ mode: 'side' })
  .flat(12)
  .rollers(24, 0.25, 3)
  .flat(4)
  .arch({ style: 'crowd' })
  .setPiece('finish')
  .flat(10)
  .arch({ style: 'finish' })
  .finish();

/**
 * D3 ROPE WALK — across the main pit. TEACHES the rear-wheel crossing (front up over the missing boards) and the
 * lip climb onto a cut block; the ore-cart see-saw on the rail stub. DEMANDS the rope walk: up onto the bridge
 * deck 1.5 m over the pit and across six missing boards on the rear wheel.
 *
 * Riding-poses physics (a736a26f) made the course easier than Conveyor at the median (3 vs 4 average reflex
 * attempts); the first cut's slot row has a seventh missing board, and the median is 4 again (mean 4.73, under
 * Lift Line's 5.31).
 */
export const D3 = (() => {
  const b = rockhop('D3', 'd3-rope-walk', 'Rope Walk', 'quarry', 'hard', {
    technique: 'the rear-wheel crossing and the lip climb',
    demands: 'the rope walk: up onto the bridge deck at 1.5 m and across six missing boards on the rear wheel',
    idea: 'cross the main pit on a plank-and-rope bridge with missing boards',
    hero: 'The Rope Walk',
    attemptsBand: [4, 8],
    targetTimeS: 55, // gold: skill-3 bot 33.56 s x 1.6 = 53.7, rounded up to 5 s, non-decreasing through the tier (OBSIDIAN = 0.85 x gold, 0 bails)
  })
    .camera({ mode: 'side' })
    .setPiece('start', 'The Pit Rim')
    .flat(6)
    .arch({ style: 'start' })
    .flat(18)
    .endSetPiece()
    .checkpoint()
    .flat(3)
    .rollers(16, 0.15, 5) // washboard haul road: front wheel down, throttle steady
    .flat(4);
  slots(b, 5, 2.6); // the first missing boards, on the rim road
  b.flat(8)
    .wave(30, 1.2, 16)
    .flat(8)
    .checkpoint()
    .flat(3)
    .camera({ mode: 'low' })
    .seesawEntry({ length: 8, height: 1.2, surface: 'metal', prop: 'ore-cart' }) // the ore cart on its tipping rail
    .flat(14)
    .camera({ mode: 'side' })
    .bumpRow(2, 0.3, 16)
    .flat(10)
    .checkpoint()
    .flat(16)
    .camera({ mode: 'side-tight' })
    .steppedWall({ height: 1.0, width: 8, lip: 0.15, surface: 'stone', prop: 'block' }, 0.3) // lip climb onto the cut block, or the ramp and a 0.3 m hop
    .flat(3);
  slots(b, 7, 2.3); // seven missing boards past the first cut
  b.flat(8)
    .camera({ mode: 'side' })
    .rollers(20, 0.25, 3)
    .flat(8)
    .checkpoint()
    .flat(16)
    .camera({ mode: 'side-tight' })
    .steppedWall({ height: 1.2, width: 8, lip: 0.15, surface: 'stone', prop: 'block' }, 0.3) // the second cut: taller
    .flat(3);
  slots(b, 5, 2.2); // the drill line
  b.flat(8)
    .camera({ mode: 'side' })
    .bumpRow(2, 0.3, 16)
    .flat(8)
    .checkpoint()
    .flat(16)
    .camera({ mode: 'low', cut: true })
    .setPiece('balance', 'The Rope Walk')
    .ramp({ length: 10, height: 1.5, surface: 'wood', prop: 'rope-bridge' }) // up onto the bridge deck
    .ledge({ height: 1.5, length: 8, surface: 'wood', prop: 'rope-bridge' }); // the deck: set the wheelie
  for (let i = 0; i < 6; i++) {
    b.gap({ width: 0.7, depth: 1.5, hazard: 'kill' }).ledge({ height: 1.5, length: 1.1, surface: 'wood', prop: 'rope-bridge' }); // a missing board, then a board
  }
  b.ledge({ height: 1.5, length: 5, surface: 'wood', prop: 'rope-bridge' })
    .ramp({ length: 14, height: 1.5, direction: 'down', surface: 'wood', prop: 'rope-bridge' })
    .endSetPiece()
    .camera({ mode: 'side' })
    .flat(12)
    .wave(30, 1.2, 16)
    .flat(4)
    .arch({ style: 'crowd' })
    .setPiece('finish')
    .flat(10)
    .arch({ style: 'finish' });
  return b.finish();
})();

export const QUARRY_TRACKS = [D1, D2, D3] as const;
