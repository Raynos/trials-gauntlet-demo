/**
 * Extreme tier — snow (X1) and foundry (X2, X3). Attempts band 30-80, measured at bot
 * skill 3. Planks here run 50-60 deg: inside the 60 deg sustained-climb envelope but
 * without the 20 % margin the lower tiers keep. Every big drum is entered from a
 * `drumStep` shelf at centre + 0.4 (physics 12.3: a bare r >= 0.6 drum on flat ground is
 * unrideable; x2's old first obstacle was a bare 1.6 m drum). The bot decides.
 */
import { course } from '../author';

/**
 * X1 — TEACHES near-vertical planks (hang over the bars, tap throttle) and pole-top rear-wheel hops.
 * DEMANDS a 60 deg plank then three pole caps at 2.0 m. Round 5 put the planks at 50 -> 55 -> 55 (lip
 * wall) -> 60 and both pole rows in the last third; reflex `good` still stopped at 13 %: the 50 deg
 * fillet 20 m past the first checkpoint was a stuck-restart wall (67 + 43 deaths) even though the
 * probe clears 50 deg from 40 m. Round 6: the first plank is 45 deg with a 40 m run-in from the
 * start line and NO checkpoint before it; the first checkpoint sits 8 m past its landing ramp; the
 * planks escalate 50 / 55 / 60 with 40 m run-ups and flow between; the lip wall is gone (lip walls
 * are walled for every reflex skill); both pole rows keep a B line for the entry — a ramp onto a
 * ledge 0.4 m under the first cap, so the row starts with a walking-pace 0.4 m hop, not a 1.2 m
 * one from the ground — and stand in a kill pit so a miss is a restart, not a stall.
 */
export const X1 = course('x1-vertical-limit', 'Vertical Limit', 'extreme')
  .meta({
    biome: 'snow',
    technique: 'near-vertical planks and pole-top hops',
    demands: '45 / 50 / 55 / 60 deg faces from 40 m run-ins (v2: 45 is a momentum climb over a kicker foot, 50+ the hop-into-the-face move), then pole caps 1.2 -> 1.8 from a 0.8 m ledge and three caps at 2.0 m from a 1.6 m ledge with a 4 m gap onto a downhill plank',
    attemptsBand: [30, 45],
    targetTimeS: 90, // round 7 gold (physics v2): skill-3 bot 56.07 s x 1.6 (the v1 stranger/bot clean ratio), rounded up to 5 s and kept non-decreasing through the tier; platinum = 0.85 x this (core rules)
  })
  .camera({ mode: 'side-tight', pitch: (12 * Math.PI) / 180 }) // round 7: the faces are 3.6-4.5 m tall — a 12 deg pitch (mode default 19) keeps the face reading as a wall, not a floor
  .setPiece('start', 'Base Camp')
  .flat(6)
  .arch({ style: 'girder' })
  .flat(34) // the first face from the start line with a 40 m run-in (v2: 16.5 m/s)
  .setPiece('climb', 'Face 1')
  .kickerPlank({ angleDeg: 45, rise: 3.6 }) // round 7 / physics v2: 45 over a 0.3 m 20 deg kicker foot (the naive rider tops it from 8 m/s; the concave fillet made it worse)
  .box({ width: 6, height: 3.6 }) // round 7: 6 m on top (was 4) — over the kicker foot the bot tops the face with speed and flew the 4 m top onto the down-ramp (crash at 58.2, 3 attempts)
  .ramp({ length: 22, height: 3.6, direction: 'down' }) // the reflex probe lands a 9.5 deg ramp
  .endSetPiece()
  .flat(8) // checkpoint rule: >= 8 m past the landing
  .checkpoint() // ~78 m: after the first plank's landing, never before it
  .flat(4)
  .camera({ mode: 'side' })
  .rollers(20, 0.25, 3)
  .flat(4)
  .wave(28, 1.5, 16)
  .flat(4)
  .bumpRow(3, 0.3, 16)
  .flat(6)
  .checkpoint() // ~188 m
  .flat(40) // round 6: 40 m from every spawn to its plank (the reflex probe clears 50 deg from 40 m; from 20 m the fillet was a 78-death stuck-restart wall)
  .camera({ mode: 'side-tight', pitch: (12 * Math.PI) / 180 })
  .setPiece('climb', 'Face 2')
  .steepPlank({ angleDeg: 50, rise: 3.8, filletLength: 2.4, filletHeight: 0.8 }) // 50+ keeps the 2.4 x 0.8 fillet: on v2 the Pro tops 50 @ 8 m/s over it (the kicker foot does not help above 45)
  .box({ width: 6, height: 3.8 }) // round 7: 6 m top (was 4): the climb throw leaves the rider forward and a box edge 4 m later is the measured +0.5 / >= 1.5 m drop crash (bot 32 attempts at the 50 deg face's exit)
  .ramp({ length: 22, height: 3.8, direction: 'down' })
  .endSetPiece()
  .flat(12)
  .camera({ mode: 'side' })
  .bumpRow(3, 0.3, 16)
  .flat(4)
  .tabletop(6, 8, 1.0)
  .flat(8)
  .checkpoint() // ~350 m
  .flat(40)
  .camera({ mode: 'side-tight', pitch: (12 * Math.PI) / 180 })
  .setPiece('climb', 'Face 3')
  .steepPlank({ angleDeg: 55, rise: 4.0, filletLength: 2.4, filletHeight: 0.8 })
  .box({ width: 6, height: 4.0 }) // round 7: 6 m top (was 4): the climb throw leaves the rider forward and a box edge 4 m later is the measured +0.5 / >= 1.5 m drop crash (bot 32 attempts at the 50 deg face's exit)
  .ramp({ length: 22, height: 4.0, direction: 'down' })
  .endSetPiece()
  .flat(8)
  .camera({ mode: 'side' })
  .rollers(20, 0.25, 3)
  .flat(4)
  .wave(28, 1.5, 16)
  .flat(6)
  .checkpoint() // ~490 m
  .flat(3)
  .camera({ mode: 'side-tight', pitch: (12 * Math.PI) / 180 })
  .flat(37) // 40 m run-in: hop at the foot to carry speed up the face
  .setPiece('climb', 'The Summit')
  .steepPlank({ angleDeg: 60, rise: 4.5, filletLength: 2.4, filletHeight: 0.8 })
  .box({ width: 6, height: 4.5 }) // round 7: 6 m top (was 4): the climb throw leaves the rider forward and a box edge 4 m later is the measured +0.5 / >= 1.5 m drop crash (bot 32 attempts at the 50 deg face's exit)
  .ramp({ length: 24, height: 4.5, direction: 'down' })
  .endSetPiece()
  .flat(12)
  .camera({ mode: 'low' })
  .ramp({ length: 4, height: 0.8 }) // B line for the entry: a ledge 0.4 m under the first cap
  .box({ width: 3, height: 0.8 })
  .poleRow([1.2, 1.35, 1.5, 1.65, 1.8], 1.1) // rear-wheel hops cap to cap (+0.15 m each) over a kill pit: a miss is a restart, not a stall
  .space(0.5)
  .box({ width: 6, height: 1.8 })
  .ramp({ length: 8, height: 1.8, direction: 'down' })
  .flat(12)
  .camera({ mode: 'side' })
  .bumpRow(2, 0.3, 16)
  .flat(6)
  .checkpoint() // ~650 m
  .flat(16)
  .camera({ mode: 'side-tight' })
  .ramp({ length: 8, height: 1.6 }) // B line for the entry: the ledge sits 0.4 m under the caps
  .box({ width: 4, height: 1.6 })
  .camera({ mode: 'low' })
  .poleRow([2.0, 2.0, 2.0], 1.7) // the demand: three caps at height, a 4 m gap onto a downhill plank
  .gap({ width: 4 })
  .plank({ length: 3, angleDeg: -30, height: 1.5 }) // thin downhill landing
  .flat(3)
  .smooth(8, -1.0)
  .camera({ mode: 'side' })
  .flat(6)
  .bumpRow(2, 0.3, 16)
  .setPiece('finish')
  .flat(12)
  .arch({ style: 'finish' })
  .finish();

/**
 * X2 — TEACHES spinning drums as slippery platforms combined with gaps and see-saw drops. DEMANDS
 * see-saw onto a spinning drum, gap, spinning drum, gap. Round 5 (reflex `average` 0 of 3 at 31 %:
 * 107 nose-high deaths at the 3-row log pyramid behind a centre-height ramp, 17 more on the pile,
 * 10 at the first drum-top gap 3 m past the start): `logStep` ramps to the first log's top, every
 * shelf drum has 16 m from its checkpoint (checkpoint rule), the pole between the 2.0 m drum and
 * the platform is gone (a cap hop has no slower line: the drum top steps 0.2 m down onto the box).
 */
export const X2 = course('x2-pipe-dream', 'Pipe Dream', 'extreme')
  .meta({
    biome: 'foundry',
    technique: 'spinning drums with gaps and see-saw drops',
    demands: 'see-saw drop onto a spinning drum shelf, hop a 2 m gap onto another spinning drum, hop a 2 m gap off it',
    attemptsBand: [40, 60],
    targetTimeS: 90, // round 7 gold (physics v2): skill-3 bot 42.48 s x 1.6 (the v1 stranger/bot clean ratio), rounded up to 5 s and kept non-decreasing through the tier; platinum = 0.85 x this (core rules)
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
  .logStep({ radius: 0.3, count: 5, rows: 2 }) // round 7: two rows (was 4 x 3 = 1.34 m, a 50 deg log climb nothing but the bot's hop tops on v2: 47-57 reflex deaths per seed at 62-66 m)
  .flat(6)
  .drumStep({ radius: 0.8, rolls: true }, { exit: true })
  .flat(6)
  .camera({ mode: 'side' })
  .rollers(20, 0.25, 3)
  .flat(4)
  .wave(28, 1.5, 16)
  .flat(4)
  .bumpRow(3, 0.3, 16)
  .flat(6)
  .checkpoint() // ~185 m
  .flat(16)
  .camera({ mode: 'side-tight' })
  .seesawEntry({ length: 8, height: 1.6 }) // 21.8 deg (round 7: was 8 x 2.0 = 29 deg — every 29 deg board crashes every rider on v2); ride it down, then straight up the shelf
  .flat(2)
  .drumStep({ radius: 1.0 }) // shelf 1.4 -> 2.0 m drum
  .box({ width: 15, height: 1.8 }) // step 0.2 m down off the drum top (was a 1.5 m pole cap between: no slower line); 15 m is the run-up the 4 m gap needs
  .ramp({ length: 1.5, height: 0.4, curve: 0.3 }, { base: 1.8 })
  .gap({ width: 4 })
  .drum({ radius: 1.0, rolls: true }) // land on a spinning top from the kicker
  .flat(6)
  .camera({ mode: 'side' })
  .bumpRow(3, 0.3, 16)
  .flat(4)
  .wave(28, 1.5, 16)
  .flat(6)
  .checkpoint() // ~275 m
  .flat(16)
  .camera({ mode: 'high34' })
  .setPiece('balance', 'The Pipe Run')
  // the pipe run: hop-land-balance-hop x5
  .drumStep({ radius: 0.9, rolls: true })
  .gap({ width: 1.5 })
  .drum({ radius: 0.9, rolls: true })
  .gap({ width: 1.5 })
  .drum({ radius: 0.9, rolls: true })
  .gap({ width: 1.5 })
  .drum({ radius: 0.9, rolls: true })
  .gap({ width: 1.5 })
  .drum({ radius: 0.9, rolls: true })
  .endSetPiece()
  .flat(6)
  .camera({ mode: 'side' })
  .rollers(20, 0.25, 3)
  .flat(6)
  .checkpoint() // ~350 m
  .flat(16)
  .camera({ mode: 'side-tight' })
  .seesawEntry({ length: 8, height: 1.6 }) // 21.8 deg (round 7: was 29)
  .flat(2)
  .drumStep({ radius: 1.0, rolls: true })
  .gap({ width: 2 }) // a spinning top cannot be pumped: at ~5 m/s off the see-saw a 3 m drum-to-drum gap was a 34-attempt wall (sweep 3)
  .drum({ radius: 0.8, rolls: true })
  .gap({ width: 2 }) // round 4: 2.5 m off a drum top is a speed gap with no run-up; 2 m is the hop envelope
  .flat(13) // checkpoint rule: 15 m before the kerb hop
  .ledge({ height: 0.5, length: 4 }) // was 0.7; v2 gas-hop band 0.3-0.6
  .camera({ mode: 'side' })
  .flat(12)
  .bumpRow(2, 0.3, 16)
  .setPiece('finish')
  .flat(12)
  .arch({ style: 'finish' })
  .finish();

/**
 * X3 — DEMANDS everything, ONE instance of each taught technique in curriculum order. Round 6:
 * trimmed from 773 m to <= 520 m (the search bot no longer finished 773 m inside a 420 s wall: 8
 * attempts, 89 %, walled at the H2-section lipped chain at 498 m) — one climb, one drop set, one
 * stair flight, one hop ledge, one drum shelf, one see-saw, one lipped gap chain of 3, one fire row,
 * one lip wall + rails, one steep plank, one pole-cap set, each with its mandated run-up, no repeats
 * and no finale. The
 * lipped chain is softened to 0.25 m lips and 2.5 / 2.5 / 2 m gaps (the 0.4 m lips at 3-4 m gaps
 * walled reflex `good` on h2 and x3 alike).
 */
export const X3 = course('x3-gauntlet', 'The Gauntlet', 'extreme')
  .meta({
    biome: 'foundry',
    technique: 'everything, in order',
    demands: '45 deg plank over a kicker foot, drop cascade, 0.15 m stairs into a gap, hop ledge, spinning drum, 22 deg see-saw landing, lip climb + rails, lipped gap chain, fire, 60 deg plank, pole caps',
    attemptsBand: [60, 80],
    targetTimeS: 90, // round 7 gold (physics v2): skill-3 bot 45.08 s x 1.6 (the v1 stranger/bot clean ratio), rounded up to 5 s and kept non-decreasing through the tier; platinum = 0.85 x this (core rules)
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
  .kickerPlank({ angleDeg: 45, rise: 3.7 }) // E1's demand as re-authored for v2 (round 7: was steepPlank 48 — 73 stuck-restarts per seed for the Pro reflex rider; 45 over the kicker foot tops from 8 m/s on both classes)
  .box({ width: 8, height: 3.7 }) // round 7: 8 m on top (was 4): settle after the kicker-foot climb before the cascade (85 reflex `good` deaths on the first cascade box)
  // B2 drop set: down off the climb onto a cascade of 0.5 m drops
  .ramp({ length: 12, height: 2.2, direction: 'down' }, { base: 1.5 })
  .box({ width: 6, height: 1.5 })
  .box({ width: 6, height: 1.0 })
  .box({ width: 6, height: 0.5 })
  .camera({ mode: 'side' })
  .flat(12) // land and settle before the rollers (no rise within 10 m of a drop exit)
  .rollers(20, 0.25, 3)
  .flat(16)
  // E3 stairs: 8 x 0.25 up at speed, 8 x 0.25 down into a 2 m gap
  .stair({ count: 8, height: 0.15, length: 0.6 }) // E3's demand as re-authored in round 8: 0.15 m risers at 14 deg (a 0.25 m riser is a 75 deg face to the wheel — once the front lifts every riser the rear hits accelerates the loop; the r4 strangers looped on plain gas), same footprint
  .box({ width: 4, height: 1.2 })
  .stair({ count: 8, height: 0.15, length: 0.5, direction: 'down' })
  .flat(6) // checkpoint rule: descent + 6 m is 15 m of effective run-up
  .gap({ width: 2 })
  .flat(14) // checkpoint rule: >= 8 m past the landing zone
  .checkpoint() // ~150 m
  .flat(16) // checkpoint rule: 16 m to a 0.5 m hop
  // M1 hop ledge then a hop across
  .camera({ mode: 'side-tight' })
  .ledge({ height: 0.5, length: 4 })
  .gap({ width: 1.5, depth: 2 })
  .flat(16) // checkpoint rule: 16 m to the shelf drum
  // M2 spinning drum from its shelf
  .drumStep({ radius: 0.8, rolls: true }, { exit: true })
  .flat(10)
  .checkpoint() // ~225 m (round 6: a death at the see-saw or the wall was a 100 m walk back through the hop ledge — 53 deaths there for reflex `good`)
  .flat(16) // checkpoint rule: 15 m
  // M3 see-saw landing
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 3 })
  .seesaw({ length: 8, height: 1.6 }) // 21.8 deg (round 7: was 29 deg, the board that crashes every rider on v2)
  .flat(16) // a board leaves ~5 m/s: 16 m to build speed for the lip climb
  // H1 lip climb (A line) or ramp + 0.5 m hop (B line), straight into the rails
  .steppedWall({ height: 1.4, width: 4, lip: 0.2 }, 0.4) // B line: a 0.4 m hop off the ramp (round 7: was 0.5)
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
  .checkpoint() // ~275 m
  .flat(16) // checkpoint rule: 15 m
  // H2 lipped chain of 3 (round 6: 0.25 m lips, gaps 2.5 / 2.5 / 2)
  .camera({ mode: 'side-tight' })
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 2.5 })
  .platform(5.5, 1.0, { landing: 0.25 })
  .gap({ width: 2.5 })
  .platform(5.5, 1.0, { landing: 0.25 })
  .gap({ width: 2 })
  .flat(12)
  .camera({ mode: 'side' })
  .bumpRow(2, 0.3, 16)
  .flat(6)
  .checkpoint() // ~355 m
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
  .flat(14) // checkpoint rule: >= 8 m past the landing zone
  .camera({ mode: 'side-tight' })
  .checkpoint() // ~410 m
  .flat(3)
  // X1 steep plank + pole caps
  .flat(18) // checkpoint rule: 20 m before a steep plank
  .setPiece('climb', 'The Stack')
  .camera({ mode: 'side-tight', pitch: (12 * Math.PI) / 180 })
  .steepPlank({ angleDeg: 60, rise: 3.9 })
  .ramp({ length: 2, height: 0.6, curve: -0.4 }, { base: 3.9 }) // round 8: a convex crest rolls the 60 deg face over onto the box. On R4/R5 the skill-3 Rookie bot no longer cleared x3 (50 attempts, 47 identical crashes at 477.0 m = 0.8 m past the plank top: it launches off the top edge, and from the CP5 spawn its player memory bans every line it has, so it plays gas into the same crash); the finale fixture (scratch tracks8/x3fin.mts) clears in 1 / 1 / 2 with this crest at 20 / 24 / 30 m run-ins where the plain top looped 15 x at 30 m and a 2 x 0.8 / curve -0.5 crest stuck the bot at the caps
  .box({ width: 3, height: 4.5 })
  .camera({ mode: 'low' })
  .poleRow([4.5, 4.5, 4.5], 1.7)
  .gap({ width: 4 })
  .plank({ length: 3, angleDeg: -30, height: 1.5 }) // round 7: the plank's foot meets the ground (was 2.0: a 0.5 m step off a -30 deg plank at speed; the WIP bot died there 15 times in a row on the shifted geometry)
  .flat(4)
  .setPiece('finish')
  .camera({ mode: 'side' })
  .flat(12)
  .arch({ style: 'finish' })
  .finish();
