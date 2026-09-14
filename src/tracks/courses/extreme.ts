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
 * DEMANDS a 60 deg plank then three pole caps at 4.5 m. Round 5 (reflex `average` 0 of 3 at 11 %:
 * 91 + 30 deaths at the 50 deg plank 20 m past the start; the `good` probe: planks 50 / 55 / 60 deg
 * clear in 2,1,1 / 2,6,6 / 7,walled,7, a pole-cap row is walled for every reflex skill — the cap hop
 * is the one technique with no slower line): the planks run 50 -> 55 -> 55 (lip wall) -> 60 with the
 * flow between, and both pole rows sit in the last third, after the 60 deg plank, so a player
 * without the cap hop still rides two thirds of the track.
 */
export const X1 = course('x1-vertical-limit', 'Vertical Limit', 'extreme')
  .meta({
    biome: 'snow',
    technique: 'near-vertical planks and pole-top hops',
    demands: '60 deg plank from a 20 m run-in, then pole caps 1.2 -> 1.8 and three caps at 4.5 m with a 4 m gap onto a downhill plank',
    attemptsBand: [30, 45],
    targetTimeS: 140,
  })
  .camera({ mode: 'side-tight' })
  .flat(24)
  .checkpoint() // 24 m
  .flat(20) // checkpoint rule: 20 m before a steep plank
  .steepPlank({ angleDeg: 50, rise: 3.8 })
  .box({ width: 4, height: 3.8 })
  .ramp({ length: 22, height: 3.8, direction: 'down' }) // was a -40 deg plank: the reflex probe lands a 9.5 deg ramp
  .flat(12)
  .steepPlank({ angleDeg: 55, rise: 4.0 })
  .box({ width: 4, height: 4.0 })
  .ramp({ length: 22, height: 4.0, direction: 'down' })
  .flat(12)
  .camera({ mode: 'side' })
  .rollers(20, 0.25, 3)
  .flat(4)
  .wave(28, 1.5, 16)
  .flat(4)
  .bumpRow(3, 0.3, 16)
  .flat(6)
  .checkpoint() // ~190 m
  .flat(20)
  .camera({ mode: 'side-tight' })
  .steepPlank({ angleDeg: 55, rise: 3.6 })
  .box({ width: 4, height: 3.6 })
  .ramp({ length: 20, height: 3.6, direction: 'down' })
  .flat(12)
  .camera({ mode: 'side' })
  .bumpRow(3, 0.3, 16)
  .flat(4)
  .tabletop(6, 8, 1.0)
  .flat(8)
  .checkpoint() // ~300 m
  .flat(3) // a lip climb is a ~5 m/s technique: from 16 m the skill-3 bot stalled at this wall, from 3 m it clears (round 4)
  .camera({ mode: 'side-tight' })
  .wall({ height: 1.2, width: 4, lip: 0.2 })
  .steepPlank({ angleDeg: 56, rise: 3.5 }, { base: 1.2 })
  .box({ width: 4, height: 4.7 })
  .ramp({ length: 24, height: 4.7, direction: 'down' })
  .flat(12)
  .camera({ mode: 'side' })
  .rollers(20, 0.25, 3)
  .flat(4)
  .wave(28, 1.5, 16)
  .flat(6)
  .checkpoint() // ~400 m
  .flat(3)
  .camera({ mode: 'side-tight' })
  .flat(18) // 20 m run-in (checkpoint rule): hop at the foot to carry speed up the face
  .steepPlank({ angleDeg: 60, rise: 4.5 })
  .box({ width: 4, height: 4.5 })
  .ramp({ length: 24, height: 4.5, direction: 'down' })
  .flat(12)
  .camera({ mode: 'low' })
  .poleRow([1.2, 1.35, 1.5, 1.65, 1.8], 1.1) // rear-wheel hops cap to cap (+0.15 m each) over a kill pit: a miss is a restart, not a stall
  .space(0.5)
  .box({ width: 6, height: 1.8 })
  .ramp({ length: 8, height: 1.8, direction: 'down' })
  .flat(12)
  .camera({ mode: 'side' })
  .bumpRow(2, 0.3, 16)
  .flat(6)
  .checkpoint() // ~530 m
  .flat(16)
  .camera({ mode: 'side-tight' })
  .ramp({ length: 8, height: 2.0 })
  .box({ width: 4, height: 2.0 })
  .camera({ mode: 'low' })
  .poleRow([2.0, 2.0, 2.0], 1.7) // the demand: three caps at height, a 4 m gap onto a downhill plank
  .gap({ width: 4 })
  .plank({ length: 3, angleDeg: -30, height: 1.5 }) // thin downhill landing
  .flat(3)
  .smooth(8, -1.0)
  .camera({ mode: 'side' })
  .flat(6)
  .bumpRow(2, 0.3, 16)
  .flat(12)
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
    targetTimeS: 150,
  })
  .camera({ mode: 'side-tight' })
  .flat(24)
  .checkpoint() // 24 m
  .flat(16) // checkpoint rule: a shelf drum is a momentum feature
  .drumStep({ radius: 0.8, rolls: true }) // shelf 1.2 -> spinning 1.6 m drum (was a bare drum behind a 0.5 m kicker: unrideable)
  .gap({ width: 2 }) // round 4: 2 m is the drum-top hop envelope (a spinning top cannot be pumped)
  .box({ width: 4, height: 0.8 })
  .ramp({ length: 4, height: 0.8, direction: 'down' })
  .flat(6)
  .logStep({ radius: 0.3, count: 4, rows: 3 })
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
  .seesawEntry({ length: 8, height: 2.0 }) // ride it down, then straight up the shelf
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
  .flat(6)
  .camera({ mode: 'side' })
  .rollers(20, 0.25, 3)
  .flat(6)
  .checkpoint() // ~350 m
  .flat(16)
  .camera({ mode: 'side-tight' })
  .seesawEntry({ length: 8, height: 2.0 })
  .flat(2)
  .drumStep({ radius: 1.0, rolls: true })
  .gap({ width: 2 }) // a spinning top cannot be pumped: at ~5 m/s off the see-saw a 3 m drum-to-drum gap was a 34-attempt wall (sweep 3)
  .drum({ radius: 0.8, rolls: true })
  .gap({ width: 2 }) // round 4: 2.5 m off a drum top is a speed gap with no run-up; 2 m is the hop envelope
  .flat(13) // checkpoint rule: 15 m before the kerb hop
  .ledge({ height: 0.5, length: 4 }) // was 0.7: the reflex hop clears 0.45-0.55
  .camera({ mode: 'side' })
  .flat(12)
  .bumpRow(2, 0.3, 16)
  .flat(12)
  .finish();

/**
 * X3 — DEMANDS everything, one instance of each taught technique in curriculum order, then an
 * unseen combination. Round 5: every section carries its parent track's round-5 shape (gap
 * landings on ramps, 0.25 m stair risers, `logStep` 2r, stepped walls, platform lips, fire landing
 * ramps, 16 m run-ups to momentum features); the pole rows stay the X1 section and the finale.
 */
export const X3 = course('x3-gauntlet', 'The Gauntlet', 'extreme')
  .meta({
    biome: 'foundry',
    technique: 'everything, in order',
    demands: 'kicker gap, 48 deg plank, double gap, stairs, hops, spinning drum, see-saw landing, lip climb + rails, gap chain, fire, 60 deg plank, poles, drum chain, then the finale',
    attemptsBand: [60, 80],
    targetTimeS: 200,
  })
  .camera({ mode: 'side' })
  .flat(28)
  .checkpoint() // 28 m
  .flat(16) // checkpoint rule: 15 m
  // B3 kicker + gap
  .ramp({ length: 5, height: 2.0, curve: 0.3 })
  .gap({ width: 5 })
  .box({ width: 8, height: 0.4 })
  .flat(12)
  .rollers(20, 0.25, 3)
  .flat(4)
  // E1 plank
  .steepPlank({ angleDeg: 48, rise: 3.7 })
  .box({ width: 4, height: 3.7 })
  .ramp({ length: 22, height: 3.7, direction: 'down' })
  .flat(12)
  // E2 double gap
  .ramp({ length: 5, height: 1.5 })
  .gap({ width: 5 })
  .ramp({ length: 5, height: 0.6 })
  .box({ width: 8, height: 0.6 })
  .ramp({ length: 3, height: 1.0 }, { base: 0.6 })
  .gap({ width: 5 })
  .gapLanding(1.0, 6, 8, 10)
  .flat(14) // checkpoint rule: >= 8 m past the landing zone
  .checkpoint() // ~200 m
  .flat(16)
  // E3 stairs
  .stair({ count: 8, height: 0.25, length: 0.5 })
  .box({ width: 3, height: 2.0 })
  .stair({ count: 8, height: 0.25, length: 0.4, direction: 'down' })
  .flat(6) // checkpoint rule: descent + 6 m is 15 m of effective run-up
  .gap({ width: 2 })
  .flat(8)
  // M1 hops
  .ledge({ height: 0.55, length: 1.5 })
  .gap({ width: 1.5, depth: 2 })
  .flat(16) // checkpoint rule: 16 m to the shelf drum
  // M2 spinning drum from its shelf
  .drumStep({ radius: 0.8, rolls: true }, { exit: true })
  .flat(12)
  .wave(28, 1.5, 16)
  .flat(6)
  .checkpoint() // ~310 m
  .flat(16) // checkpoint rule: 15 m
  // M3 see-saw landing
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 3 })
  .seesaw({ length: 8, height: 2.0 })
  .flat(10)
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 3 })
  .plank({ length: 5, height: 1.0 })
  .ramp({ length: 3, height: 1.0, direction: 'down' })
  .flat(16)
  // H1 lip climb + rails
  .steppedWall({ height: 1.4, width: 4, lip: 0.2 })
  .flat(2)
  .gap({ width: 0.7, depth: 1.5, hazard: 'kill' })
  .flat(1.3)
  .gap({ width: 0.7, depth: 1.5, hazard: 'kill' })
  .flat(1.3)
  .gap({ width: 0.7, depth: 1.5, hazard: 'kill' })
  .flat(1.3)
  .gap({ width: 0.7, depth: 1.5, hazard: 'kill' })
  .flat(14) // checkpoint rule: >= 8 m past the landing zone
  .checkpoint() // ~410 m
  .flat(16) // checkpoint rule: 15 m
  // H2 chain
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 4 })
  .platform(5.5, 1.0, { landing: 0.4 })
  .gap({ width: 4 })
  .platform(5.5, 1.0, { landing: 0.4 })
  .gap({ width: 3 })
  .platform(5.5, 1.0, { landing: 0.4 })
  .gap({ width: 4 })
  .platform(5.5, 1.0, { landing: 0.4 })
  .gap({ width: 2 })
  .flat(12)
  .bumpRow(2, 0.3, 16)
  .flat(6)
  .checkpoint() // ~490 m
  .flat(3)
  // H3 fire
  .flat(20)
  .camera({ mode: 'high34', zoomBias: 0.4 })
  .ramp({ length: 5, height: 2.0, curve: 0.3 })
  .flat(1)
  .barrel({ count: 6, spacing: 0.8 })
  .flat(2)
  .ramp({ length: 8, height: 2.0, direction: 'down' })
  .flat(8) // brake zone
  .ledge({ height: 0.5, length: 4 })
  .flat(14) // checkpoint rule: >= 8 m past the landing zone
  .camera({ mode: 'side-tight' })
  .checkpoint() // ~560 m
  .flat(3)
  // X1 plank + poles
  .flat(18) // checkpoint rule: 20 m before a steep plank
  .steepPlank({ angleDeg: 60, rise: 4.5 })
  .box({ width: 3, height: 4.5 })
  .poleRow([4.5, 4.5, 4.5], 1.7)
  .gap({ width: 4 })
  .plank({ length: 3, angleDeg: -30, height: 2.0 })
  .flat(16) // checkpoint rule: 16 m to the shelf drum
  // X2 drum chain
  .seesawEntry({ length: 8, height: 2.0 })
  .flat(2)
  .drumStep({ radius: 1.0, rolls: true })
  .gap({ width: 2 })
  .drum({ radius: 0.8, rolls: true })
  .gap({ width: 2 }) // round 4: the drum-top hop envelope
  .flat(14) // checkpoint rule: >= 8 m past the landing zone
  .checkpoint() // ~660 m
  .flat(16) // checkpoint rule: 15 m
  // finale: unseen combination
  .camera({ mode: 'low', cut: true })
  .ramp({ length: 6, height: 2.5, curve: 0.3 })
  .gap({ width: 6 })
  .seesaw({ length: 8, height: 1.0 }) // land at ~12 m/s: it catapults unless you brake on the board
  .flat(2)
  .drumStep({ radius: 1.0, rolls: true })
  .gap({ width: 2 })
  .poleRow([1.8, 1.8, 1.8], 1.9) // caps 0.2 under the drum top
  .gap({ width: 3 })
  .plank({ length: 4, angleDeg: -25, height: 1.8 })
  .flat(4)
  .camera({ mode: 'side' })
  .flat(10)
  .finish();
