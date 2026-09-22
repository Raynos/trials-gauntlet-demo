/**
 * COAST — the coastal scrapyard (C-ride, D20): containers, cranes, junk piles, rusted hulls, pallets, tyres,
 * buoys, a harbour at low tide. Beginner -> easy. The zone teaches the bike: throttle, the first lean back, the
 * jump, the climb and the rear-wheel-first landing, each in the yard's own kit.
 *
 * Authoring numbers are the measured physics-v2 envelope (`FEEL`, docs/design/tracks.md §0): straight lips
 * <= 14 deg below the easy tier, every drop over 0.5 m onto a >= 8 x h down-ramp, grounded cosine hills at
 * 20 m/s, sunk tyres 0.3 m proud, 15 m of flat-or-descending run-up from every spawn to a speed obstacle.
 */
import { rockhop } from './builder';

/**
 * C1 LOW TIDE — the tide is out and the causeway is dry. TEACHES throttle: hold it up the slipway, keep it
 * steady over the tyre line and the ripples, ease it down the gangway. DEMANDS the causeway: up a pallet ramp onto
 * a row of containers (stepping up 0.3 m a container) and off the end down a 10 x h gangway.
 * No jump anywhere: every rise is a cosine grounded at 20 m/s.
 */
export const C1 = rockhop('C1', 'c1-low-tide', 'Low Tide', 'coast', 'beginner', {
  technique: 'throttle control',
  demands: 'the causeway: a pallet ramp onto three containers, stepping up 0.3 m a container, and the gangway down',
  idea: 'the harbour at low tide: ride the dry causeway out to the containers',
  hero: 'The Causeway',
  attemptsBand: [1, 1],
  targetTimeS: 50, // gold: skill-3 bot 30.01 s x 1.6, rounded up to 5 s, non-decreasing through the tier (OBSIDIAN = 0.85 x gold, 0 bails)
})
  .hint('Hold the gas up the slipway')
  .hint('Steady gas over the tyres')
  .hint('Roll the step on the containers')
  .hint('Ease off down the gangway')
  .camera({ mode: 'side' })
  .setPiece('start', 'The Slipway')
  .flat(6)
  .arch({ style: 'start' })
  .flat(18)
  .endSetPiece()
  .smooth(20, 1.4) // up the slipway (grounded at 20 m/s: 16.8 m needed)
  .flat(16) // the quay top
  .descent(20, 1.4, 20)
  .flat(8)
  .checkpoint()
  .flat(4)
  .bumpDrum(0.6, 0.18, { surface: 'rubber', prop: 'tyre' }) // the tyre line: half-buried truck tyres, 0.18 m proud, met at rolling speed off the spawn
  .flat(5)
  .bumpDrum(0.6, 0.18, { surface: 'rubber', prop: 'tyre' })
  .flat(5)
  .bumpDrum(0.6, 0.18, { surface: 'rubber', prop: 'tyre' })
  .flat(14)
  .rollers(30, 0.15, 4) // tide ripples in the sand
  .flat(8)
  .ledge({ height: 0.3, length: 6, surface: 'wood', prop: 'pallet' }) // a pallet kerb: 0.3 m rolls
  .ramp({ length: 4, height: 0.3, direction: 'down', surface: 'wood', prop: 'pallet' })
  .flat(12)
  .checkpoint()
  .flat(6)
  .wave(32, 0.8, 20) // the sandbars: three, lower each time
  .flat(3)
  .wave(30, 0.6, 20)
  .flat(3)
  .wave(28, 0.4, 20)
  .flat(10)
  .checkpoint()
  .flat(8)
  .camera({ mode: 'side', zoomBias: 0.2 })
  .setPiece('balance', 'The Causeway')
  .ramp({ length: 12, height: 1.0, surface: 'wood', prop: 'pallet' }) // 4.8 deg pallet ramp
  .box({ width: 8, height: 1.0, prop: 'container', variant: 0 })
  .box({ width: 8, height: 1.3, prop: 'container', variant: 1 }) // each container 0.3 m taller: a kerb that rolls
  .box({ width: 8, height: 1.6, prop: 'container', variant: 2 })
  .ramp({ length: 20, height: 1.6, direction: 'down', surface: 'metal', prop: 'gangway' }) // 12.5 x h gangway
  .endSetPiece()
  .camera({ mode: 'side' })
  .flat(12)
  .rollers(20, 0.2, 3)
  .flat(6)
  .wave(36, 1.2, 20)
  .flat(4)
  .arch({ style: 'crowd' })
  .setPiece('finish')
  .flat(10)
  .arch({ style: 'finish' })
  .finish();

/**
 * C2 CRANE HOP — the harbour is a row of timber piers and moored barges. TEACHES the jump: gas up the pier, off
 * at the pallet lip on its end, level in the air, land on the pier's own falling ramp. DEMANDS the crane hop: from
 * the dock apron over 5.5 m of harbour onto a container barge moored under the crane.
 */
export const C2 = rockhop('C2', 'c2-crane-hop', 'Crane Hop', 'coast', 'beginner', {
  technique: 'the jump: gas to the lip, off in the air',
  demands: 'the crane hop: a 14 deg kicker off the apron over 5.5 m of harbour onto a container barge',
  idea: 'hop the harbour pier to pier, then jump the water onto the barge under the crane',
  hero: 'The Crane Hop',
  attemptsBand: [1, 2],
  targetTimeS: 50, // gold: skill-3 bot 25.26 s x 1.6, rounded up to 5 s, non-decreasing through the tier (OBSIDIAN = 0.85 x gold, 0 bails)
})
  .hint('Gas up the pier, off at the lip')
  .hint('Lean forward to level')
  .hint('Land on the ramp down')
  .hint('Full speed for the barge')
  .camera({ mode: 'side' })
  .setPiece('start', 'The Harbour Road')
  .flat(6)
  .arch({ style: 'start' })
  .flat(18)
  .endSetPiece()
  .flat(16)
  // pier 1: up the pallet ramp onto the deck, off the lip at its end, land on the pier's ramp down
  .ramp({ length: 10, height: 1.0, surface: 'wood', prop: 'pallet' })
  .box({ width: 6, height: 1.0, surface: 'wood', prop: 'pier' })
  .ramp({ length: 3, height: 0.5, surface: 'wood', prop: 'pallet' }, { base: 1.0 }) // 9.5 deg lip
  .ramp({ length: 14, height: 1.0, direction: 'down', surface: 'wood', prop: 'gangway' }) // a 0.5 m drop off the lip onto 4 deg
  .flat(14)
  .checkpoint()
  .flat(16)
  // pier 2: taller, a steeper lip
  .ramp({ length: 10, height: 1.2, surface: 'wood', prop: 'pallet' })
  .box({ width: 5, height: 1.2, surface: 'wood', prop: 'pier' })
  .ramp({ length: 3, height: 0.75, surface: 'wood', prop: 'pallet' }, { base: 1.2 }) // 14 deg lip
  .ramp({ length: 16, height: 1.2, direction: 'down', surface: 'wood', prop: 'gangway' }) // a 0.75 m drop off the lip
  .flat(12)
  .bumpRow(2, 0.25, 20)
  .flat(8)
  .checkpoint()
  .flat(16)
  .ramp({ length: 5, height: 1.0, surface: 'wood', prop: 'pallet' }) // over the slipway cut: 11.3 deg
  .gap({ width: 3 })
  .gapLanding(0.6, 6, 6, 8) // a moored pontoon: land on its incline
  .flat(12)
  .rollers(20, 0.2, 3)
  .flat(8)
  .checkpoint()
  .flat(30) // the dock apron: 30 m of flat into the hop
  .camera({ mode: 'high34', zoomBias: 0.4 })
  .setPiece('air', 'The Crane Hop')
  .arch({ style: 'girder', span: 10, height: 7 }) // the crane gantry over the apron lip
  .ramp({ length: 6, height: 1.5, surface: 'wood', prop: 'pallet' }) // 14 deg
  .gap({ width: 5.5 })
  .gapLanding(0.8, 9, 6, 10) // the container barge: incline, 9 m roof, the gangway down
  .endSetPiece()
  .camera({ mode: 'side' })
  .flat(12)
  .wave(32, 1.0, 20)
  .flat(4)
  .arch({ style: 'crowd' })
  .setPiece('finish')
  .flat(10)
  .arch({ style: 'finish' })
  .finish();

/**
 * C3 HULL BREACH — two rusted freighters lie beached on the scrap strand. TEACHES uphill weight (lean forward,
 * steady gas up the hull plating) and the rear-wheel-first landing (the bilge channel, the slipway gap). DEMANDS
 * the breach: up 40 deg bow plating onto the big hull's deck and out through the torn plating in one flight onto
 * the beach ramp.
 */
export const C3 = rockhop('C3', 'c3-hull-breach', 'Hull Breach', 'coast', 'easy', {
  technique: 'uphill weight and the rear-wheel-first landing',
  demands: 'the breach: up 40 deg bow plating onto the deck, then off the torn deck edge in one flight onto the beach ramp',
  idea: 'climb into a beached freighter and burst out through the breach',
  hero: 'The Breach',
  attemptsBand: [1, 3],
  targetTimeS: 50, // gold: skill-3 bot 30.80 s x 1.6, rounded up to 5 s, non-decreasing through the tier (OBSIDIAN = 0.85 x gold, 0 bails)
})
  .camera({ mode: 'side' })
  .setPiece('start', 'The Wreck Beach')
  .flat(6)
  .arch({ style: 'start' })
  .flat(18)
  .endSetPiece()
  .bumpDrum(0.6, 0.2, { surface: 'metal', prop: 'buoy' }) // beached buoys
  .flat(10)
  .bumpDrum(0.6, 0.2, { surface: 'metal', prop: 'buoy', variant: 1 })
  .flat(10)
  .checkpoint()
  .flat(16)
  .camera({ mode: 'side', zoomBias: -0.4 })
  .setPiece('climb', 'The Stern')
  .kickerPlank({ angleDeg: 34, rise: 2.2 }) // the small hull's stern plating: 34 deg
  .box({ width: 10, height: 2.2, prop: 'hull' })
  .ramp({ length: 20, height: 2.2, direction: 'down', surface: 'metal', prop: 'hull' })
  .endSetPiece()
  .camera({ mode: 'side' })
  .flat(10)
  .rollers(20, 0.25, 3)
  .flat(8)
  .checkpoint()
  .flat(16)
  .camera({ mode: 'high34' })
  .ramp({ length: 5, height: 1.2, surface: 'metal', prop: 'hull' }) // over the bilge channel
  .gap({ width: 4 })
  .gapLanding(1.0, 6, 8, 10) // land rear first on the incline
  .camera({ mode: 'side' })
  .flat(12)
  .bumpRow(2, 0.3, 16)
  .flat(8)
  .checkpoint()
  .flat(20)
  .camera({ mode: 'side', zoomBias: -0.4 })
  .setPiece('climb', 'The Bow')
  .kickerPlank({ angleDeg: 40, rise: 3.2 }) // the big hull's bow plating: 40 deg over the kicker foot, a momentum climb
  .box({ width: 12, height: 3.2, prop: 'hull', variant: 1 }) // the deck
  .setPiece('air', 'The Breach')
  .ramp({ length: 2, height: 0.4, surface: 'metal', prop: 'hull' }, { base: 3.2 }) // the torn plating curls up: an 11 deg lip
  .ramp({ length: 28, height: 2.8, direction: 'down', surface: 'dirt' }) // out through the breach: a 0.8 m drop onto a 10 x h beach ramp
  .endSetPiece()
  .camera({ mode: 'side' })
  .flat(12)
  .rollers(20, 0.25, 3)
  .flat(8)
  .checkpoint()
  .flat(16)
  .camera({ mode: 'high34' })
  .ramp({ length: 5, height: 1.0, surface: 'wood', prop: 'pallet' }) // the slipway gap
  .gap({ width: 4 })
  .gapLanding(0.8, 5, 6, 8)
  .camera({ mode: 'side' })
  .flat(12)
  .wave(28, 1.2, 16)
  .flat(4)
  .arch({ style: 'crowd' })
  .setPiece('finish')
  .flat(10)
  .arch({ style: 'finish' })
  .finish();

export const COAST_TRACKS = [C1, C2, C3] as const;
