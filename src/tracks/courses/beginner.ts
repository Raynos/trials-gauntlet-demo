/**
 * Beginner tier — biome industrial (warehouse amber), HUD hints on, camera side.
 * Attempts band 1-2. One technique each: throttle, weight shift, the jump.
 *
 * Round 3: no bare logs or drums anywhere in the tier (physics 12.3: a bare 0.3 m log
 * needs a front lift, which is not a beginner input); bumps are `hump` or `bumpDrum`
 * (0.3 m proud, rolls at any speed). Every track is a rhythm: flow (rollers, humps,
 * waves, tabletops) between the taught obstacles, a set piece at the end, ~35-45 s of
 * bot-clean riding, checkpoints every ~12-18 s of bot time (~20-35 s for a stranger).
 * Hints name the technique in <= 6 words, in obstacle order.
 */
import { course } from '../author';

/**
 * B1 — TEACHES throttle control: go / hold steady / slow down. DEMANDS a slow roll over a speed
 * bump after a descent. Round 4 (strangers: median 3 against band 1-1; deaths at 199 = flying
 * off the 8.5 deg tabletop lip at speed, 303 = launched off the crest of a 20 m x 2.0 m wave,
 * "full throttle on the face pitched the bike nose-up and airborne over the crest"): nothing
 * on B1 can leave the ground at top speed. Every rise and fall is a cosine with crest radius
 * >= v^2/g at 20 m/s, top speed (`plateau`, `wave(..., 20)`, `descent`, `bumpRow`): no ramp kink
 * anywhere, no convex hump (physics round 8: a flat-out rider at 18.5 m/s nosed down through one). Half
 * gas and lean forward on the climbs clears it; there is no jump to level.
 */
export const B1 = course('b1-first-ride', 'First Ride', 'beginner')
  .meta({
    biome: 'industrial',
    technique: 'throttle control',
    demands: 'slow down after the long descent for a speed hump and a low plateau, then hold the gas home',
    attemptsBand: [1, 1],
    targetTimeS: 45,
  })
  .hint('Hold the gas up the hill')
  .hint('Steady gas over the rollers')
  .hint('Off the gas down the descent')
  .hint('Brake before the hump')
  .camera({ mode: 'side' })
  .flat(20)
  .smooth(16, 1.2) // first hill (peak 6.7 deg), grounded at 20 m/s: hold the gas
  .flat(8)
  .descent(16, 1.2, 20)
  .flat(6)
  .checkpoint() // ~62 m
  .flat(6)
  .rollers(20, 0.25, 3) // steady throttle; first suspension squash (a 0.25 m skip at most)
  .flat(5)
  .plateau(15, 8, 1.0, 15, 20) // the old 6/8/1.0 tabletop: an 8.5 deg lip is a 7 m flight at 16 m/s, a 15 m cosine is grounded at top speed
  .flat(6)
  // flow: humps and a long berm roll keep the speed up
  .bumpRow(3, 0.25, 20) // physics round 8: a flat-out rider at 18.5 m/s nosed down through a 0.25 m convex hump row here
  .flat(4)
  .wave(36, 1.5, 20)
  .flat(8)
  .checkpoint() // ~225 m
  .flat(6)
  .plateau(16, 10, 1.2, 16, 20) // longer top, same crest rule
  .flat(8)
  .bumpRow(2, 0.25, 20)
  .flat(6)
  .wave(42, 2.0, 20) // was 20 x 2.0 (crest radius 10 m): the stranger death at 303
  .flat(4)
  .bumpRow(2, 0.25, 20)
  .flat(8)
  .checkpoint() // ~370 m
  .flat(6)
  .descent(21, 2.0, 20) // the long descent builds speed (peak 8.5 deg), grounded at 20 m/s
  .flat(8) // brake zone: measured 4.47 m from 10 m/s, authored 8
  .bumpRow(1, 0.3, 20) // the speed bump: a 0.3 m cosine bump grounded at top speed
  .flat(6)
  .plateau(11, 4, 0.5, 11, 20) // low plateau: throttle to climb it, that is all
  .flat(8)
  // set piece: the long roller-coaster home
  .wave(46, 2.5, 20)
  .flat(4)
  .rollers(20, 0.25, 4)
  .flat(10)
  .finish();

/**
 * B2 — TEACHES weight shift: lean back on bumps and drops. DEMANDS a 1.8 m drop onto a landing ramp.
 * Round 5 (reflex `average` 4/8/5 against band 1-2, deaths at 6-9 m/s with the bike fully flipped:
 * the 0.3 m convex hump row at 123 right after 5 m-pitch rollers (x3, nose-low), the 7 deg ramp
 * onto the first kerb (x2), a loop on the 14 deg cascade ramp at 240, the 12.7 deg set-piece ramp
 * at 354 from a standing start, rollers 8 m after the 1.8 m drop): every up-ramp is <= 6 deg
 * (5.7 deg kink at 8-10 m/s is a 0.1 m skip, not a flight), every drop lands on a straight
 * down-ramp of 8 x height (the reflex probe: box -> down-ramp 1,1,1 at 0.5 / 1.0 / 1.8 m against
 * 1,2,4 onto flat), flow is `bumpRow` / grounded waves / 6.7 m-pitch rollers like B1, and no rise
 * starts within 12 m of a drop exit.
 */
export const B2 = course('b2-lean-back', 'Lean Back', 'beginner')
  .meta({
    biome: 'industrial',
    technique: 'weight shift on drops',
    demands: '1.8 m drop onto a landing ramp: lean back or nose in',
    attemptsBand: [1, 2],
    targetTimeS: 50,
  })
  .hint('Lean back over the bumps')
  .hint('Lean back off the drop')
  .hint('No brakes down the stairs')
  .hint('Lean back, gas off the big drop')
  .camera({ mode: 'side' })
  .flat(18)
  .bumpDrum(0.5, 0.3) // round speed bump, 0.3 m proud (rolls at any speed; the old bare 0.3 m logs needed a front lift)
  .flat(8)
  .bumpDrum(0.5, 0.3)
  .flat(8)
  .bumpRow(1, 0.3, 16) // was a 1.5 m convex hump between two drums 3-5 m apart: a 200 ms player got out of phase and looped at 40 m
  .flat(6)
  .checkpoint() // ~52 m
  .flat(6)
  .ramp({ length: 8, height: 0.5 }) // 3.6 deg (was 4 x 0.5 = 7 deg: nose-low endo on the ramp at 7 m/s)
  .ledge({ height: 0.5, length: 10 }) // first drop: 0.5
  .ramp({ length: 4, height: 0.5, direction: 'down' }) // 7 deg landing ramp under the drop
  .flat(12) // land and settle before the next ramp: an up-ramp 6 m after a drop is a rising landing = endo (sweep 3)
  .ramp({ length: 10, height: 1.0 }) // 5.7 deg
  .box({ width: 10, height: 1.0 }) // drop 1.0
  .ramp({ length: 8, height: 1.0, direction: 'down' }) // 7 deg landing ramp
  .flat(12)
  // flow
  .rollers(20, 0.25, 3) // B1's rollers (6.7 m pitch): the 5 m-pitch 0.3 m rollers launched at 7 m/s
  .flat(6)
  .bumpRow(2, 0.3, 16)
  .flat(6)
  .wave(28, 1.5, 16)
  .flat(4)
  .rollers(20, 0.25, 3)
  .flat(8)
  .checkpoint() // ~215 m
  .flat(6)
  .ramp({ length: 12, height: 1.2 }) // 5.7 deg (was 6 x 1.2 = 11.3 deg: looped at the box lip at 6 m/s)
  .box({ width: 4, height: 1.2 })
  .stair({ count: 4, height: 0.3, length: 0.6, direction: 'down' }) // lean back, no brake
  .flat(12)
  .wave(26, 1.2, 16)
  .flat(6)
  .stepDowns(15, 6, [1.5, 1.0, 0.5]) // cascade: three 0.5 m drops in a row (was a 14 deg ramp up: looped on the face at 8 m/s)
  .flat(12)
  .rollers(20, 0.25, 3)
  .flat(8)
  .checkpoint() // ~330 m
  .flat(6)
  .ramp({ length: 10, height: 1.0 })
  .box({ width: 8, height: 1.0 })
  .stair({ count: 3, height: 0.33, length: 0.6, direction: 'down' })
  .flat(12)
  .bumpRow(2, 0.3, 16)
  .flat(6)
  .wave(28, 1.5, 16)
  .flat(8)
  .checkpoint() // ~445 m
  .flat(6)
  .camera({ mode: 'low' })
  .ramp({ length: 18, height: 1.8 }) // 5.7 deg (was 8 x 1.8 = 12.7 deg from a standing start 4 m past the checkpoint: looped on the face)
  .box({ width: 10, height: 1.8 }) // the set piece: the 1.8 m drop
  .ramp({ length: 14, height: 1.8, direction: 'down' }) // 7.3 deg landing ramp under the drop
  .camera({ mode: 'side' })
  .flat(12) // was 8 m then 5 m-pitch rollers: a nose-down landing on rising ground
  .rollers(20, 0.25, 3)
  .flat(10)
  .finish();

/**
 * B3 — TEACHES the jump: gas to the ramp, off the gas at the lip, lean forward to level, land
 * rear first. DEMANDS a kicker over a 5 m gap. Round 4 (strangers: median 11.5 against band
 * 1-2; 5 deaths at the first kicker 3 m past the checkpoint, 8 at the 5 x 2.0 kicker over a
 * barrel pit into a 2 m wall: "checkpoint 1 respawns 2-3 m before the kicker with no room to
 * build speed; full gas mid-ramp backflips"): every kicker is >= 16 m past its checkpoint and
 * lands on flat or a ground downslope, so under-speed rolls off the lip and over-speed lands
 * long; the pit-and-wall and the barrels are gone; the 22 deg kicker is 5 x 1.5.
 */
export const B3 = course('b3-kicker-row', 'Kicker Row', 'beginner')
  .meta({
    biome: 'industrial',
    technique: 'jump and level in the air',
    demands: 'kicker over a 5 m gap: speed to the lip, off the gas in the air',
    attemptsBand: [1, 2],
    targetTimeS: 55,
  })
  .hint('Gas to the ramp, off at the lip')
  .hint('Lean forward to level')
  .hint('Land rear wheel first')
  .hint('Hold speed to clear the gap')
  .camera({ mode: 'side' })
  .flat(20)
  .checkpoint() // 20 m
  .flat(16) // run-up: ~9.7 m/s from the spawn
  .ramp({ length: 4, height: 0.8, curve: 0.3 }) // first kicker: a 14 deg hop onto flat, lands 4-12 m out
  .flat(18)
  .ramp({ length: 4, height: 1.0, curve: 0.3 })
  .flat(8) // under-speed lands here
  .slope(14, -1.0) // over-speed lands on the downslope (round 6: 4 deg and long enough that a 12 m/s launch still lands on it)
  .flat(10)
  .rollers(20, 0.25, 3)
  .flat(8)
  .checkpoint() // ~118 m
  .flat(16)
  .ramp({ length: 4, height: 1.2, curve: 0.3 }) // ~17 deg: level the bike in the air
  .flat(8)
  .slope(16, -1.2)
  .flat(10)
  .bumpRow(2, 0.25, 16) // round 6: was a convex humpRow — the novice reflex player launched nose-down off it 10 m before the 1.5 kicker
  .flat(6)
  .camera({ mode: 'high34', zoomBias: 0.4 })
  .ramp({ length: 5, height: 1.5, curve: 0.3 }) // ~22 deg exit, the biggest lip on B3
  .flat(8)
  .slope(20, -1.5) // round 6: the 22 deg lip at 12 m/s flew past a 12 m slope and landed nose-down on the flat (novice: 4 deaths at 197-224)
  .camera({ mode: 'side' })
  .flat(10)
  .wave(28, 1.5, 16)
  .flat(8)
  .checkpoint() // ~250 m
  .flat(16)
  .smallGap(4, 1.0, 2) // first gap: 2 m from a 14 deg kicker, 16 m of run-up
  .flat(14)
  .smallGap(4, 1.2, 3)
  .flat(14)
  .rollers(20, 0.25, 3)
  .flat(8)
  .checkpoint() // ~340 m
  .flat(16) // run-up: ~9.7 m/s from the spawn; a 5 m gap from a 22 deg lip needs ~8
  .camera({ mode: 'high34', zoomBias: 0.4 })
  .ramp({ length: 5, height: 1.5, curve: 0.3 }) // the set piece
  .gap({ width: 4 }) // round 6: was 5 m — the novice reflex player (9 m/s cruise) landed in the pit short of any landing shape
  .gapLanding(0.6, 8, 6, 10) // round 6: an up-ramp at the far lip, not a box edge (reflex `novice` 11 x2: air-gas-nose-up into the 0.4 m box face); 6 + 8 m before the down-ramp so a full-gas 16 m/s launch (~15 m) still lands on it
  .camera({ mode: 'side' })
  .flat(8)
  .rollers(20, 0.25, 3)
  .flat(10)
  .finish();
