/**
 * Extreme tier — snow (X1) and foundry (X2, X3). Attempts band 30-80, measured at bot skill 3 and
 * reflex `good` (round 9: `good` must clear each >= 1/3 inside band-top). Every big drum is entered
 * from a `drumStep` shelf at centre + 0.4 (physics 12.3: a bare r >= 0.6 drum on flat ground is
 * unrideable). Round 9 (tracks-storyboards.md §4-6, physics v2 R5): the 50 / 55 / 60 deg faces are
 * gone — on v2 nothing but the skill-3 bot's hop-into-the-face move tops 50 deg (tracks.md §0) and the
 * reflex `good` 9-seed probe reads 40 deg 1/9, 42 deg 5/9, **45 deg 9/9 median 3**, so every X1 face is
 * 45 deg and the escalation is height (3.6 -> 3.9 -> 4.5) and what waits on top; the mountain
 * climbs +6 m between faces and the summit ridge is a row of pillar caps at the box height over the
 * crevasse (probe: 45 / 4.5 + 16 m top + caps @ 1.1 median 6, 9/9; the storyboard's 1.7 m cap hops
 * from a standing start and the gap-onto-a-plank exit are 0/9 walls). The bot decides the clear time.
 */
import { course } from '../author';

/**
 * X1 "The Ascent" — TEACHES momentum climbs on 45 deg faces (lean forward, steady gas over the kicker
 * foot; the face is won or lost at the crest) and pillar-cap rows (a rolling 0.4 m hop onto the first cap
 * from a ledge, then hold the line over the caps). Four faces up the glacier, each taller and each on a
 * higher ridge (`smooth(28, 2)` between them), the caps taught level (1.2 x 3), repeated rising (1.2 ->
 * 1.8), demanded at the summit (three caps at +10.5 m inside the ice cave), then a 70 m glissade home.
 * Three faces, not the storyboard's four: each face's EXIT (the box-edge launch onto the down-ramp, a rounded
 * shoulder or not) costs the reflex `good` ~5 attempts on the track, and four faces + both pillar rows + the
 * summit summed past the 45-attempt band top (0/9 at 1800 s of sim; three faces is the budget).
 * Run-ins are 30 m (probe: 45 / 3.6 from 30 m median 3, from 40 m 6, from 60 m 6 — more speed launches
 * the bike off the crest) and every face tops onto a 12 m box (a 6 m top read 6, 12 m read 3).
 */
export const X1 = course('x1-vertical-limit', 'The Ascent', 'extreme')
  .meta({
    biome: 'snow',
    technique: '45 deg momentum climbs and pillar-cap rows',
    demands: 'three 45 deg faces of 3.6 / 3.9 / 4.5 m from 30 m run-ins, the pillar caps level then rising 1.2 -> 1.8 from a 0.8 m ledge, and the summit: the 4.5 m face straight onto three caps over the crevasse, then the glissade',
    attemptsBand: [30, 45],
    targetTimeS: 90, // round 9 gold: skill-3 bot 55.7 s x 1.6, rounded up to 5 s, non-decreasing through the tier (tracks.md round-9 table); platinum = 0.85 x this (core rules)
  })
  .camera({ mode: 'side-tight', pitch: (12 * Math.PI) / 180 }) // round 7: the faces are 3.6-4.5 m tall — a 12 deg pitch (mode default 19) keeps the face reading as a wall, not a floor
  .setPiece('start', 'Base Camp')
  .flat(6)
  .arch({ style: 'girder' })
  .flat(24) // the first face from the start line with a 30 m run-in
  .setPiece('climb', 'Face 1')
  .kickerPlank({ angleDeg: 45, rise: 3.6 }) // 45 over a 0.3 m 20 deg kicker foot (the naive rider tops it from 8 m/s; the concave fillet made it worse)
  .box({ width: 12, height: 3.6 }) // round 9: 12 m on top — the crest is where the slow rider loops (pitch 118 at 2.7 m/s on a 6 m top); 12 m settles it
  .ramp({ length: 22, height: 3.6, direction: 'down' }) // the reflex probe lands a 9.5 deg ramp
  .endSetPiece()
  .flat(8) // checkpoint rule: >= 8 m past the landing
  .checkpoint() // ~80 m: after the first face's landing, never before it
  .flat(4)
  .camera({ mode: 'side' })
  .rollers(20, 0.25, 3)
  .flat(4)
  .camera({ mode: 'low' })
  .setPiece('balance', 'The Pillars') // the cap lesson: level caps from a ledge 0.4 m under them (probe median 1, 9/9)
  .ramp({ length: 4, height: 0.8 })
  .box({ width: 3, height: 0.8 })
  .poleRow([1.2, 1.2, 1.2], 1.1)
  .space(0.5)
  .box({ width: 4, height: 1.2 })
  .ramp({ length: 8, height: 1.2, direction: 'down' })
  .endSetPiece()
  .flat(12)
  .camera({ mode: 'side' })
  .wave(28, 1.5, 16)
  .flat(4)
  .smooth(28, 2) // the ridge: +2
  .flat(6)
  .checkpoint() // ~200 m
  .flat(30)
  .camera({ mode: 'side-tight', pitch: (12 * Math.PI) / 180 })
  .setPiece('climb', 'Face 2')
  .kickerPlank({ angleDeg: 45, rise: 3.9 }) // plain top (round 9: a convex crest on the plank top walls the skill-3 bot — 12 of 12 identical crashes on the fixture, 60 of 60 on the track — and a rounded shoulder off the box did not move the reflex's exit cost)
  .box({ width: 16, height: 3.9 }) // 16 m: the taller face crests slower and the exit off a 12 m top cost the reflex 4 attempts a seed
  .ramp({ length: 22, height: 3.9, direction: 'down' })
  .endSetPiece()
  .flat(12)
  .camera({ mode: 'side' })
  .bumpRow(3, 0.3, 16)
  .flat(4)
  .smooth(28, 2) // +4
  .flat(4)
  .tabletop(6, 8, 1.0)
  .flat(8)
  .checkpoint() // ~350 m
  .flat(16) // the pillars 16 m past their checkpoint on flat (the probe's approach; off 20 m of rollers they cost 8 a seed)
  .camera({ mode: 'low' })
  .setPiece('balance', 'The Rising Pillars') // the repeat: caps rising +0.15 each over the kill pit (probe median 7, 9/9)
  .ramp({ length: 4, height: 0.8 })
  .box({ width: 3, height: 0.8 })
  .poleRow([1.2, 1.35, 1.5, 1.65, 1.8], 1.1)
  .space(0.5)
  .box({ width: 6, height: 1.8 })
  .ramp({ length: 8, height: 1.8, direction: 'down' })
  .endSetPiece()
  .flat(12)
  .camera({ mode: 'side' })
  .rollers(20, 0.25, 3)
  .flat(4)
  .wave(28, 1.5, 16)
  .flat(4)
  .smooth(28, 2) // +6
  .flat(6)
  .checkpoint() // ~560 m
  .flat(3)
  .camera({ mode: 'side-tight', pitch: (12 * Math.PI) / 180 })
  .flat(27) // 30 m run-in
  .setPiece('climb', 'The Summit') // the two hardest things in the tier back to back: the tallest face straight onto the crevasse caps
  .kickerPlank({ angleDeg: 45, rise: 4.5 })
  .box({ width: 16, height: 4.5 }) // settle on the summit shelf before the caps (probe: a 6 m top before the caps 0/9, 16 m 9/9)
  .tunnel({ length: 12, style: 'ice', lit: true }) // the crevasse cave
  .camera({ mode: 'low' })
  .poleRow([4.5, 4.5, 4.5], 1.1) // the ridge: three caps at the summit height over the crevasse
  .space(0.3)
  .box({ width: 3, height: 4.5 })
  .ramp({ length: 24, height: 4.5, direction: 'down' })
  .endSetPiece()
  .camera({ mode: 'high34', cut: true })
  .flat(8)
  .checkpoint() // ~660 m, out of the cave mouth
  .flat(3)
  .setPiece('drop', 'The Glissade')
  .descent(56, 6) // a smooth 56 m run home losing all 6 m (grounded at 16 m/s: half-length 28 >= 27.8; the storyboard's 70 m put the track over the 800 m cap)
  .endSetPiece()
  .camera({ mode: 'side' })
  .flat(6)
  .bumpRow(2, 0.3, 16)
  .flat(4)
  .arch({ style: 'crowd' })
  .setPiece('finish')
  .flat(12)
  .arch({ style: 'finish' })
  .finish();

/**
 * X2 "The Rolling Mill" — TEACHES spinning drums as slippery platforms combined with gaps and see-saw
 * drops. Round 9: the pipe run is THREE spinning tops (probe, reflex `good` 9 seeds: 3 tops median 1,
 * 9/9; 4 or 5 tops 1-4 of 9 whatever the gap — after three hops the pitch has drifted), the big roller
 * is launched from a straight 2 x 0.4 kicker over 4 m of FIRE (the melt) onto the spinning top and exits
 * over a 2 m box + ramp (probe: as built median 3, with the exit 1); the mill duct is a pipe tunnel.
 */
export const X2 = course('x2-pipe-dream', 'The Rolling Mill', 'extreme')
  .meta({
    biome: 'foundry',
    technique: 'spinning drums with gaps and see-saw drops',
    demands: 'the big roller: a kicker off the 15 m platform over 4 m of melt onto a spinning drum top; then the demand — see-saw drop, the spinning shelf drum, a 2 m hop onto another spinning drum and off over its shelf',
    attemptsBand: [40, 60],
    targetTimeS: 95, // round 9 gold: skill-3 bot 56.8 s (3 attempts) x 1.6, rounded up to 5 s, non-decreasing through the tier (tracks.md round-9 table); platinum = 0.85 x this (core rules)
  })
  .camera({ mode: 'side-tight' })
  .setPiece('start', 'The Rolling Mill')
  .flat(6)
  .arch({ style: 'girder' })
  .flat(18)
  .endSetPiece()
  .checkpoint() // 24 m
  .flat(16) // checkpoint rule: a shelf drum is a momentum feature
  .drumStep({ radius: 0.8, rolls: true }) // shelf 1.2 -> spinning 1.6 m drum (was a bare drum behind a 0.5 m kicker: unrideable)
  .gap({ width: 2 }) // round 4: 2 m is the drum-top hop envelope (a spinning top cannot be pumped)
  .box({ width: 4, height: 0.8 })
  .ramp({ length: 4, height: 0.8, direction: 'down' })
  .flat(6)
  .logStep({ radius: 0.3, count: 5, rows: 2 }) // round 7: two rows (was 4 x 3 = 1.34 m, a 50 deg log climb nothing but the bot's hop tops on v2)
  .flat(6)
  .drumStep({ radius: 0.8, rolls: true }, { exit: true })
  .flat(6)
  .camera({ mode: 'side' })
  .rollers(20, 0.25, 3)
  .flat(4)
  .setPiece('tunnel', 'The Duct') // storyboard §5 beat 3: the flow runs through a 40 m pipe between halls
  .tunnel({ length: 40, style: 'pipe', lit: true })
  .wave(28, 1.5, 16)
  .flat(4)
  .bumpRow(2, 0.3, 16)
  .endSetPiece()
  .flat(6)
  .checkpoint() // ~185 m
  .flat(16)
  .camera({ mode: 'side-tight' })
  .seesawEntry({ length: 8, height: 1.6 }) // 21.8 deg (round 7: was 8 x 2.0 = 29 deg — every 29 deg board crashes every rider on v2); ride it down, then straight up the shelf
  .flat(2)
  .drumStep({ radius: 1.0 }) // shelf 1.4 -> 2.0 m drum
  .box({ width: 15, height: 1.8 }) // step 0.2 m down off the drum top; 15 m is the run-up the 4 m gap needs
  .setPiece('fire', 'The Big Roller') // storyboard §5 beat 5: the melt under the gap
  .ramp({ length: 2, height: 0.4 }, { base: 1.8 }) // straight 11 deg kicker (round 9: the curve-0.3 lip launched the reflex nose-up onto the top)
  .gap({ width: 4, hazard: 'fire' })
  .drum({ radius: 1.0, rolls: true }) // land on a spinning top from the kicker
  .box({ width: 2, height: 1.6 }) // round 9: roll off the top onto a shelf, not the ground (probe median 3 -> 1)
  .ramp({ length: 8, height: 1.6, direction: 'down' })
  .endSetPiece()
  .flat(6)
  .arch({ style: 'crowd' }) // the far gantry
  .camera({ mode: 'side' })
  .bumpRow(3, 0.3, 16)
  .flat(4)
  .wave(28, 1.5, 16)
  .flat(6)
  .checkpoint() // ~300 m
  .flat(16)
  .camera({ mode: 'high34' })
  .setPiece('balance', 'The Pipe Run')
  // the pipe run: hop-land-balance-hop x3 (round 9: three spinning tops is the envelope; five was a wall for every seed)
  .drumStep({ radius: 0.9, rolls: true })
  .gap({ width: 1.5 })
  .drum({ radius: 0.9, rolls: true })
  .gap({ width: 1.5 })
  .drum({ radius: 0.9, rolls: true })
  .endSetPiece()
  .flat(6)
  .camera({ mode: 'side' })
  .rollers(20, 0.25, 3)
  .flat(6)
  .checkpoint() // ~365 m
  .flat(16)
  .camera({ mode: 'side-tight' })
  .seesawEntry({ length: 8, height: 1.6 }) // 21.8 deg (round 7: was 29)
  .flat(16) // round 9: 16 m off the board (the M3 rule: a board leaves at ~5 m/s; 2 m onto a 2.0 m spinning drum's shelf was 70 stuck-restarts in 9 seeds, 6 m onto the 0.8 shelf 100 deaths — no clear either way)
  .drumStep({ radius: 0.8, rolls: true }) // the lesson's shelf drum, spinning
  .gap({ width: 2 }) // a spinning top cannot be pumped: at ~5 m/s off the see-saw a 3 m drum-to-drum gap was a 34-attempt wall (sweep 3)
  .drum({ radius: 0.8, rolls: true })
  .box({ width: 2, height: 1.4 }) // the exit shelf (the big-roller finding: off the top onto a shelf, not the ground)
  .ramp({ length: 6, height: 1.4, direction: 'down' })
  .flat(9) // checkpoint rule: 15 m before the kerb hop
  .ledge({ height: 0.5, length: 4 }) // was 0.7; v2 gas-hop band 0.3-0.6
  .camera({ mode: 'side' })
  .flat(12)
  .smooth(40, -1.5) // down the yard ramp
  .flat(4)
  .bumpRow(2, 0.3, 16)
  .setPiece('finish')
  .flat(12)
  .arch({ style: 'finish' })
  .finish();

/**
 * X3 "The Stack" — DEMANDS everything, ONE instance of each taught technique in curriculum order. Round 6:
 * trimmed from 773 m to <= 520 m (the search bot no longer finished 773 m inside a 420 s wall). Round 9:
 * the cascade entry (owed since r7) — the opener tops onto a 12 m box and descends a 22 m ramp to the
 * 1.5 m cascade (the box-edge launch onto the 12 m ramp was 54 of the reflex's deaths); the H2 chain's
 * kickers are straight; the stack is the X1 summit (45 deg / 4.5 onto a 16 m top, three caps at the
 * height, box, 24 m ramp) from a 30 m run-in — the 60 deg plank that walled every reflex skill is gone
 * with X1's.
 */
export const X3 = course('x3-gauntlet', 'The Stack', 'extreme')
  .meta({
    biome: 'foundry',
    technique: 'everything, in order',
    demands: '45 deg plank over a kicker foot, drop cascade, 0.15 m stairs into a gap, hop ledge, spinning drum, 22 deg see-saw landing, lip climb + rails, lipped gap chain, fire, the 4.5 m face onto the chimney caps',
    attemptsBand: [60, 80],
    targetTimeS: 95, // round 9 gold: skill-3 bot 51.0 s (2 attempts) x 1.6, rounded up to 5 s, non-decreasing through the tier (tracks.md round-9 table); platinum = 0.85 x this (core rules)
  })
  .camera({ mode: 'side' })
  .setPiece('start', 'The Stack')
  .flat(6)
  .arch({ style: 'girder' })
  .flat(22)
  .endSetPiece()
  .checkpoint() // 28 m
  .flat(20) // checkpoint rule: 20 m before a steep plank
  // E1 climb
  .camera({ mode: 'side-tight', pitch: (12 * Math.PI) / 180 })
  .kickerPlank({ angleDeg: 45, rise: 3.6 }) // E1's demand as re-authored for v2 (45 over the kicker foot tops from 8 m/s on both classes)
  .box({ width: 12, height: 3.6 }) // round 9: 12 m on top (was 8): the crest is where the slow rider loops
  // B2 drop set: down off the climb onto a cascade of 0.5 m drops
  .ramp({ length: 22, height: 2.1, direction: 'down' }, { base: 1.5 }) // round 9: 5.5 deg (was 12 x 2.2 = 10 deg: the box-edge launch landed nose-down on it, 54 reflex deaths)
  .box({ width: 6, height: 1.5 })
  .box({ width: 6, height: 1.0 })
  .box({ width: 6, height: 0.5 })
  .camera({ mode: 'side' })
  .flat(12) // land and settle before the rollers (no rise within 10 m of a drop exit)
  .rollers(20, 0.25, 3)
  .flat(16)
  // E3 stairs: 8 x 0.15 up at speed, 8 x 0.15 down into a 2 m gap
  .stair({ count: 8, height: 0.15, length: 0.6 }) // E3's demand as re-authored in round 8: 0.15 m risers at 14 deg
  .box({ width: 4, height: 1.2 })
  .stair({ count: 8, height: 0.15, length: 0.5, direction: 'down' })
  .flat(6) // checkpoint rule: descent + 6 m is 15 m of effective run-up
  .gap({ width: 2 })
  .flat(14) // checkpoint rule: >= 8 m past the landing zone
  .checkpoint() // ~165 m
  .flat(6) // round 9 (the r8 m1 rule): a 0.5 m hop ledge sits 6 m past its checkpoint — the hop window is 5-8 m/s and 16 m arrives at 12 (ledge @ 203 was 52 of the reflex's deaths)
  // M1 hop ledge then a hop across
  .setPiece('tunnel', 'Hall Two')
  .tunnel({ length: 50, style: 'concrete', lit: true })
  .camera({ mode: 'side-tight' })
  .ledge({ height: 0.5, length: 4 })
  .gap({ width: 1.5, depth: 2 })
  .flat(26) // checkpoint rule: 16 m to the shelf drum
  // M2 spinning drum from its shelf
  .drumStep({ radius: 0.8, rolls: true }, { exit: true })
  .endSetPiece()
  .flat(12)
  .checkpoint() // ~245 m (round 9: >= 60 m from CP1, the checkpoint-spacing validator)
  .flat(16) // checkpoint rule: 15 m
  // M3 see-saw landing
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 3 })
  .seesaw({ length: 8, height: 1.6 }) // 21.8 deg (round 7: was 29 deg, the board that crashes every rider on v2)
  .flat(16) // a board leaves ~5 m/s: 16 m to build speed for the lip climb
  // H1 lip climb (A line) or ramp + 0.3 m hop (B line), straight into the rails
  .steppedWall({ height: 1.4, width: 4, lip: 0.2 }, 0.3)
  .flat(2)
  .gap({ width: 0.7, depth: 1.5, hazard: 'kill' })
  .flat(1.3)
  .gap({ width: 0.7, depth: 1.5, hazard: 'kill' })
  .flat(1.3)
  .gap({ width: 0.7, depth: 1.5, hazard: 'kill' })
  .flat(1.3)
  .gap({ width: 0.7, depth: 1.5, hazard: 'kill' })
  .flat(14) // checkpoint rule: >= 8 m past the landing zone
  .camera({ mode: 'side' })
  .checkpoint() // ~290 m
  .flat(16) // checkpoint rule: 15 m
  // H2 lipped chain of 3 (round 6: 0.25 m lips, gaps 2.5 / 2.5 / 2; round 9: straight 2 x 0.4 kickers)
  .camera({ mode: 'side-tight' })
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 2.5 })
  .platform(5.5, 1.0, { landing: 0.25, length: 2, curve: 0 })
  .gap({ width: 2.5 })
  .platform(5.5, 1.0, { landing: 0.25, length: 2, curve: 0 })
  .gap({ width: 2 })
  .flat(12)
  .camera({ mode: 'side' })
  .bumpRow(2, 0.3, 16)
  .flat(6)
  .arch({ style: 'crowd' }) // the plaque
  .checkpoint() // ~370 m
  .flat(3)
  // H3 fire row onto a landing ramp
  .flat(20)
  .camera({ mode: 'high34', zoomBias: 0.4 })
  .setPiece('fire', 'The Pour')
  .ramp({ length: 5, height: 2.0 }) // straight 21.8 deg (round 7: curve gone, as on H3)
  .flat(1)
  .barrel({ count: 6, spacing: 0.8 })
  .flat(2)
  .ramp({ length: 8, height: 2.0, direction: 'down' })
  .endSetPiece()
  .flat(17) // checkpoint rule: >= 8 m past the landing zone; round 9: >= 60 m from CP4 (the checkpoint-spacing validator)
  .camera({ mode: 'side-tight' })
  .checkpoint() // ~470 m
  .flat(3)
  // X1 summit: the 4.5 m face onto the chimney caps
  .flat(27) // 30 m run-in (probe: the stack from 20 m 6/9 median 13; from 30-40 m 9/9 median 6)
  .setPiece('climb', 'The Stack')
  .camera({ mode: 'side-tight', pitch: (12 * Math.PI) / 180 })
  .kickerPlank({ angleDeg: 45, rise: 4.5 })
  .box({ width: 16, height: 4.5 })
  .arch({ style: 'pipe' }) // the exit through the hall roof
  .camera({ mode: 'low' })
  .poleRow([4.5, 4.5, 4.5], 1.1) // the chimney caps
  .space(0.3)
  .box({ width: 3, height: 4.5 })
  .ramp({ length: 24, height: 4.5, direction: 'down' })
  .endSetPiece()
  .flat(4)
  .setPiece('finish')
  .camera({ mode: 'side' })
  .flat(12)
  .arch({ style: 'finish' })
  .finish();
