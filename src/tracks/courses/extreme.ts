/**
 * Extreme tier — snow (X1) and foundry (X2, X3). Attempts band 30-80, measured at bot
 * skill 3. Planks here run 50-60 deg: inside the 60 deg sustained-climb envelope but
 * without the 20 % margin the lower tiers keep. Every big drum is entered from a
 * `drumStep` shelf at centre + 0.4 (physics 12.3: a bare r >= 0.6 drum on flat ground is
 * unrideable; x2's old first obstacle was a bare 1.6 m drum). The bot decides.
 */
import { course } from '../author';

/** X1 — TEACHES near-vertical planks (hang over the bars, tap throttle) and pole-top rear-wheel hops. DEMANDS a 60 deg plank then three pole caps at 4.5 m. */
export const X1 = course('x1-vertical-limit', 'Vertical Limit', 'extreme')
  .meta({
    biome: 'snow',
    technique: 'near-vertical planks and pole-top hops',
    demands: '60 deg plank from an 8 m run-in, three pole caps at 4.5 m, 4 m gap onto a downhill plank',
    attemptsBand: [30, 45],
    targetTimeS: 140,
  })
  .camera({ mode: 'side-tight' })
  .flat(24)
  .checkpoint() // 24 m
  .flat(20) // checkpoint rule: 20 m before a steep plank
  .steepPlank({ angleDeg: 50, rise: 3.8 })
  .box({ width: 4, height: 3.8 })
  .plank({ angleDeg: -40, rise: 3.8 }, { base: 3.8 })
  .flat(6)
  .steepPlank({ angleDeg: 55, rise: 4.0 })
  .box({ width: 4, height: 4.0 })
  .ramp({ length: 6, height: 4.0, curve: 0.4, direction: 'down' })
  .flat(6)
  .camera({ mode: 'side' })
  .rollers(15, 0.3, 3)
  .flat(4)
  .wave(16, 1.5)
  .flat(4)
  .humpRow(3, 0.3, 8)
  .flat(4)
  .wave(20, 2.0)
  .flat(6)
  .checkpoint() // ~165 m
  .flat(16) // checkpoint rule: 15 m before the kill pit
  .camera({ mode: 'low' })
  .poleRow([1.2, 1.35, 1.5, 1.65, 1.8], 1.1) // rear-wheel hops cap to cap (+0.15 m each) over a kill pit: a miss is a restart, not a stall (+0.3 m steps at 1.3 m: 50 faults)
  .space(0.5)
  .box({ width: 6, height: 1.8 })
  .ramp({ length: 5, height: 1.8, direction: 'down' })
  .flat(10)
  .camera({ mode: 'side-tight' })
  .steepPlank({ angleDeg: 55, rise: 3.6 }) // was 58 from a 6 m run-in: 50 of 50 faults at the foot under physics 86fd137
  .box({ width: 4, height: 3.6 })
  .ramp({ length: 5, height: 3.6, direction: 'down' })
  .flat(6)
  .camera({ mode: 'side' })
  .humpRow(3, 0.3, 8)
  .flat(4)
  .tabletop(6, 8, 1.0)
  .flat(8)
  .checkpoint() // ~205 m
  .flat(3) // a lip climb is a ~5 m/s technique: from 16 m the skill-3 bot stalled at this wall, from 3 m it clears (round 4)
  .camera({ mode: 'side-tight' })
  .wall({ height: 1.2, width: 4, lip: 0.2 })
  .steepPlank({ angleDeg: 56, rise: 3.5 }, { base: 1.2 })
  .box({ width: 3, height: 4.7 })
  .camera({ mode: 'low' })
  .poleRow([4.4, 3.6, 2.8, 2.0], 1.5)
  .space(2)
  .flat(4)
  .camera({ mode: 'side' })
  .rollers(20, 0.3, 4)
  .flat(4)
  .wave(16, 1.5)
  .flat(6)
  .checkpoint() // ~285 m
  .flat(3)
  .camera({ mode: 'side-tight' })
  .flat(18) // 20 m run-in (checkpoint rule): hop at the foot to carry speed up the face
  .steepPlank({ angleDeg: 60, rise: 4.5 })
  .box({ width: 3, height: 4.5 })
  .camera({ mode: 'low' })
  .poleRow([4.5, 4.5, 4.5], 1.7)
  .gap({ width: 4 })
  .plank({ length: 3, angleDeg: -30, height: 2.0 }) // thin downhill landing
  .flat(3)
  .smooth(8, -1.0)
  .camera({ mode: 'side' })
  .flat(6)
  .humpRow(2, 0.3, 8)
  .flat(12)
  .finish();

/** X2 — TEACHES spinning drums as slippery platforms combined with gaps and see-saw drops. DEMANDS see-saw onto a spinning drum, gap, spinning drum, 4 m gap. */
export const X2 = course('x2-pipe-dream', 'Pipe Dream', 'extreme')
  .meta({
    biome: 'foundry',
    technique: 'spinning drums with gaps and see-saw drops',
    demands: 'see-saw drop onto a spinning drum shelf, hop a 2 m gap onto another spinning drum, hop a 2.5 m gap off it',
    attemptsBand: [40, 60],
    targetTimeS: 150,
  })
  .camera({ mode: 'side-tight' })
  .flat(24)
  .checkpoint() // 24 m
  .flat(3)
  .drumStep({ radius: 0.8, rolls: true }) // shelf 1.2 -> spinning 1.6 m drum (was a bare drum behind a 0.5 m kicker: unrideable)
  .gap({ width: 2 }) // round 4: 2 m is the drum-top hop envelope (a spinning top cannot be pumped); 3 m from a checkpoint spawn had no run-up
  .box({ width: 4, height: 0.8 })
  .ramp({ length: 4, height: 0.8, direction: 'down' })
  .flat(4)
  .logStep({ radius: 0.3, count: 4, rows: 3 })
  .flat(4)
  .drumStep({ radius: 0.8, rolls: true }, { exit: true })
  .flat(6)
  .camera({ mode: 'side' })
  .rollers(15, 0.3, 3)
  .flat(4)
  .wave(20, 2.0)
  .flat(4)
  .humpRow(3, 0.3, 8)
  .flat(6)
  .checkpoint() // ~160 m
  .flat(3)
  .camera({ mode: 'side-tight' })
  .seesawEntry({ length: 8, height: 2.0 }) // ride it down, then straight up the shelf
  .flat(2)
  .drumStep({ radius: 1.0 }) // shelf 1.4 -> 2.0 m drum
  .pole({ height: 1.5 }) // step off the drum across a cap onto the box
  .box({ width: 15, height: 1.8 }) // round 4: 15 m of platform is the run-up the 4 m gap needs (checkpoint rule)
  .ramp({ length: 1.5, height: 0.4, curve: 0.3 }, { base: 1.8 })
  .gap({ width: 4 })
  .drum({ radius: 1.0, rolls: true }) // land on a spinning top from the kicker
  .flat(6)
  .camera({ mode: 'side' })
  .humpRow(3, 0.3, 8)
  .flat(4)
  .wave(16, 1.5)
  .flat(6)
  .checkpoint() // ~195 m
  .flat(3)
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
  .rollers(20, 0.3, 4)
  .flat(6)
  .checkpoint() // ~260 m
  .flat(3)
  .camera({ mode: 'side-tight' })
  .seesawEntry({ length: 8, height: 2.0 })
  .flat(2)
  .drumStep({ radius: 1.0, rolls: true })
  .gap({ width: 2 }) // a spinning top cannot be pumped: at ~5 m/s off the see-saw a 3 m drum-to-drum gap was a 34-attempt wall (sweep 3)
  .drum({ radius: 0.8, rolls: true })
  .gap({ width: 2 }) // round 4: 2.5 m off a drum top is a speed gap with no run-up; 2 m is the hop envelope
  .flat(13) // checkpoint rule: 15 m before the 0.7 m kerb hop
  .ledge({ height: 0.7, length: 4 })
  .camera({ mode: 'side' })
  .flat(8)
  .humpRow(2, 0.3, 8)
  .flat(12)
  .finish();

/** X3 — DEMANDS everything, one instance of each taught technique in curriculum order, then an unseen combination. */
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
  .flat(3)
  // B3 kicker + gap
  .flat(13) // checkpoint rule: 15 m
  .ramp({ length: 5, height: 2.0, curve: 0.3 })
  .gap({ width: 5 })
  .box({ width: 8, height: 0.4 })
  .flat(4)
  .rollers(15, 0.3, 3)
  .flat(4)
  // E1 plank
  .steepPlank({ angleDeg: 48, rise: 3.7 })
  .box({ width: 4, height: 3.7 })
  .plank({ angleDeg: -40, rise: 3.7 }, { base: 3.7 })
  .flat(8)
  // E2 double gap
  .ramp({ length: 5, height: 1.5 })
  .gap({ width: 5 })
  .box({ width: 6, height: 0.6 })
  .ramp({ length: 3, height: 1.0 }, { base: 0.6 })
  .gap({ width: 6 })
  .flat(14) // checkpoint rule: >= 8 m past the landing zone
  .checkpoint() // ~135 m
  .flat(3)
  // E3 stairs
  .stair({ count: 7, height: 0.45, length: 0.4 })
  .box({ width: 3, height: 3.15 })
  .stair({ count: 9, height: 0.35, length: 0.4, direction: 'down' })
  .flat(6) // checkpoint rule: descent + 6 m is 15 m of effective run-up
  .gap({ width: 2 })
  .flat(4)
  // M1 hops
  .ledge({ height: 0.55, length: 1.5 })
  .gap({ width: 1.5, depth: 2 })
  .flat(6)
  // M2 spinning drum from its shelf
  .drumStep({ radius: 0.8, rolls: true }, { exit: true })
  .flat(12)
  .wave(16, 1.5)
  .flat(6)
  .checkpoint() // ~215 m
  .flat(16) // checkpoint rule: 15 m
  // M3 see-saw landing
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 3 })
  .seesaw({ length: 8, height: 2.0 })
  .gap({ width: 3 })
  .plank({ length: 3, height: 2.0 })
  .flat(4)
  // H1 lip climb + rails
  .flat(4)
  .wall({ height: 1.4, width: 4, lip: 0.2 })
  .flat(2)
  .gap({ width: 0.7, depth: 1.5, hazard: 'kill' })
  .flat(1.3)
  .gap({ width: 0.7, depth: 1.5, hazard: 'kill' })
  .flat(1.3)
  .gap({ width: 0.7, depth: 1.5, hazard: 'kill' })
  .flat(1.3)
  .gap({ width: 0.7, depth: 1.5, hazard: 'kill' })
  .flat(14) // checkpoint rule: >= 8 m past the landing zone
  .checkpoint() // ~255 m
  .flat(3)
  .flat(13) // checkpoint rule: 15 m
  // H2 chain
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 4 })
  .platform(3.5, 1.0)
  .gap({ width: 5 })
  .platform(3.5, 1.0)
  .gap({ width: 3 })
  .platform(3.5, 1.0)
  .gap({ width: 4 })
  .platform(3.5, 1.0)
  .gap({ width: 2 })
  .flat(6)
  .humpRow(2, 0.3, 8)
  .flat(6)
  .checkpoint() // ~320 m
  .flat(3)
  // H3 fire
  .flat(20)
  .camera({ mode: 'high34', zoomBias: 0.4 })
  .ramp({ length: 5, height: 2.0, curve: 0.3 })
  .gap({ width: 2 })
  .barrel({ count: 6, spacing: 0.8 })
  .flat(2)
  .ramp({ length: 6, height: 2.0, direction: 'down' })
  .flat(8) // brake zone
  .ledge({ height: 0.7, length: 4 })
  .flat(14) // checkpoint rule: >= 8 m past the landing zone
  .camera({ mode: 'side-tight' })
  .checkpoint() // ~385 m
  .flat(3)
  // X1 plank + poles
  .flat(18) // checkpoint rule: 20 m before a steep plank
  .steepPlank({ angleDeg: 60, rise: 4.5 })
  .box({ width: 3, height: 4.5 })
  .poleRow([4.5, 4.5, 4.5], 1.7)
  .gap({ width: 4 })
  .plank({ length: 3, angleDeg: -30, height: 2.0 })
  .flat(6)
  // X2 drum chain
  .seesawEntry({ length: 8, height: 2.0 })
  .flat(2)
  .drumStep({ radius: 1.0, rolls: true })
  .gap({ width: 2 })
  .drum({ radius: 0.8, rolls: true })
  .gap({ width: 2 }) // round 4: the drum-top hop envelope
  .flat(14) // checkpoint rule: >= 8 m past the landing zone
  .checkpoint() // ~460 m
  .flat(3)
  // finale: unseen combination
  .flat(13) // checkpoint rule: 15 m
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
