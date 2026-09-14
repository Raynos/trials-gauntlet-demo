/**
 * Hard tier — night city (H1, H2) and foundry (H3). Attempts band 10-25, measured at
 * bot skill 3. `loop` is cut from the vocabulary (CONTRACT §2.1), so H3 is the
 * speed-commit track: fire barrels cleared at speed, then a hard stop.
 * Round 3: flow sections between the technical ones; checkpoints every ~15 s of bot time.
 */
import { course } from '../author';

/** Rail slots: kill pits 0.7 m wide that catch a grounded front wheel; ride them on the rear wheel. */
function slots(b: ReturnType<typeof course>, count: number, pitch: number): ReturnType<typeof course> {
  for (let i = 0; i < count; i++) b.gap({ width: 0.7, depth: 1.5, hazard: 'kill' }).flat(pitch - 0.7);
  return b;
}

/**
 * H1 — TEACHES sustained wheelie / rear-wheel balance across slotted rails, and the lip climb.
 * DEMANDS a lip climb straight into rails ending at a gap. Round 5 (reflex `average` 0 of 3, best
 * 29 %: 137 identical stuck-restarts at the 1.0 m lip wall 15 m past checkpoint 1 — a wall of one
 * death means the feature has no fallback line; the reflex probe: lip walls 1.0 / 1.2 / 1.4 walled
 * even for `good`, a 0.5 m step in front 2,2,2): every wall is a `steppedWall` — the lip stays for
 * the A line (front wheel onto the lip at speed, hop the rear), and a ramp in front leaves a 0.5 m
 * hop from its top as the slower B line. The slot rows start <= 3 m after each wall (checkpoint
 * rule: a kill-slot row is a hazard that wants the run-up unless it is entered off a wall top).
 */
export const H1 = (() => {
  const b = course('h1-wheelie-wire', 'Wheelie Wire', 'hard')
    .meta({
      biome: 'nightCity',
      technique: 'sustained wheelie and the lip climb',
      demands: '1.4 m lip climb (or the 0.4 m hop off its ramp) straight into 5 rail slots and a 3 m gap from the rear wheel',
      attemptsBand: [10, 18],
      targetTimeS: 75, // round 7 gold (physics v2): skill-3 bot 44.57 s x 1.6 (the v1 stranger/bot clean ratio), rounded up to 5 s and kept non-decreasing through the tier; platinum = 0.85 x this (core rules)
    })
    .camera({ mode: 'side', zoomBias: -0.3 })
    .setPiece('start', 'The Grid') // storyboard §1 beat 1: start gantry + crowd
    .flat(6)
    .arch({ style: 'girder' }) // the start gantry at x = 3 (an arch is centred 3 m behind the cursor)
    .flat(22)
    .endSetPiece()
    .checkpoint() // 28 m
    .flat(3)
    .rollers(16, 0.15, 6) // front wheel DOWN over rollers: throttle modulation warm-up
    .flat(4);
  slots(b, 8, 2.5); // wheelie section 1
  b.flat(6).wave(28, 1.5, 16).flat(4).bumpRow(3, 0.3, 16).flat(6).checkpoint(); // ~150 m
  b.flat(16).steppedWall({ height: 1.0, width: 6, lip: 0.15 }, 0.4).flat(3); // 16 m run-up from the spawn; lip climb, or ramp + 0.4 m hop (round 7 / physics v2: the B-line step was 0.5 — the v2 gas-hop's >= 0.1 m band tops out at 0.6 and the 0.5 step was 97 nose-low deaths per seed for reflex `good`)
  slots(b, 6, 3.0);
  b.flat(6).rollers(20, 0.25, 3).flat(4).tabletop(6, 8, 1.0).flat(6).wave(28, 1.5, 16).flat(4).bumpRow(2, 0.3, 16).flat(6).checkpoint(); // ~300 m
  b.flat(16).steppedWall({ height: 1.2, width: 5, lip: 0.15 }, 0.4).flat(3);
  slots(b, 6, 2.5);
  b.flat(6).wave(28, 1.5, 16).flat(4).bumpRow(2, 0.3, 16).flat(6).checkpoint(); // ~380 m
  b.flat(16);
  slots(b, 10, 2.0); // the long wire: 10 slots at 2.0 m
  b.flat(6).rollers(20, 0.25, 3).flat(6).checkpoint(); // ~440 m
  b.flat(16).setPiece('balance', 'The Wire').camera({ mode: 'low', cut: true }).steppedWall({ height: 1.4, width: 4, lip: 0.2 }, 0.4).flat(3); // the demand: 1.4 m lip, or the ramp and a 0.4 m hop
  slots(b, 5, 2.0);
  b.arch({ style: 'crowd' }); // storyboard §1 beat 6: the crowd bridge over the last slots
  return b.gap({ width: 3 }).endSetPiece().camera({ mode: 'side' }).flat(8).bumpRow(2, 0.3, 16).setPiece('finish').flat(12).arch({ style: 'finish' }).finish();
})();

/**
 * H2 — TEACHES precision gaps with speed control: read the width, set the speed, on kicker
 * platforms. DEMANDS a 6-gap chain on 5.5 m platforms ending on a see-saw launch. Round 5 (reflex
 * `average` capped 51 x 3 at 44 %, 50 + 36 deaths at chain A's first two box edges; the `good`
 * probe: chain A as authored walled, 8 m platforms with landing lips 1,14,8, chain B with lips
 * 11-15): every platform now has a landing lip at its front edge (a short jump meets a 6-11 deg
 * incline, not a face), the teaching chains are 8 / 7 m platforms with 3 m lips and 3 m gaps, the
 * demand chain 5.5 m with 2 m lips.
 */
export const H2 = course('h2-gap-chain', 'Gap Chain', 'hard')
  .meta({
    biome: 'nightCity',
    technique: 'gap chains: read the width, set the speed',
    demands: '6 gaps on 5.5 m kicker platforms with landing lips, last one launched from a see-saw',
    attemptsBand: [14, 22],
    targetTimeS: 75, // round 7 gold (physics v2): skill-3 bot 46.28 s x 1.6 (the v1 stranger/bot clean ratio), rounded up to 5 s and kept non-decreasing through the tier; platinum = 0.85 x this (core rules)
  })
  .camera({ mode: 'high34' })
  .setPiece('start', 'Container Yard')
  .flat(6)
  .arch({ style: 'girder' }) // the start gantry at x = 3 (an arch is centred 3 m behind the cursor)
  .flat(22)
  .endSetPiece()
  .checkpoint() // 28 m
  .flat(16) // 15 m from the spawn (checkpoint rule)
  // chain A: 8 m platforms with landing lips, every one ending in a 1.5 x 0.4 kicker; gaps 4 / 3 / 4 / 2
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 3 })
  .platform(8, 0.8, { landing: 0.4, landingLength: 3 })
  .gap({ width: 3 })
  .platform(8, 0.8, { landing: 0.4, landingLength: 3 })
  .gap({ width: 3 })
  .platform(8, 0.8, { landing: 0.4, landingLength: 3 })
  .gap({ width: 2 })
  .flat(12)
  .camera({ mode: 'side' })
  .rollers(20, 0.25, 3)
  .flat(4)
  .wave(28, 1.5, 16)
  .flat(4)
  .bumpRow(3, 0.3, 16)
  .flat(4)
  .wave(28, 1.5, 16)
  .flat(6)
  .checkpoint() // ~215 m
  .flat(16)
  .camera({ mode: 'high34' })
  // chain B: landing 0.3 above launch every time -> rear first mandatory; 7 m platforms with lips
  .ramp({ length: 5, height: 1.2 })
  .gap({ width: 4 })
  .platform(7, 1.2, { landing: 0.4, landingLength: 3 })
  .gap({ width: 3 })
  .platform(7, 1.5, { landing: 0.4, landingLength: 3 })
  .gap({ width: 3 })
  .platform(7, 1.8, { landing: 0.4, landingLength: 3 })
  .gap({ width: 2 })
  .platform(7, 2.1, { landing: 0.4, landingLength: 3 })
  .gap({ width: 3 })
  .ramp({ length: 2, height: 0.4 }, { base: 2.0 })
  .box({ width: 5, height: 2.4 })
  .ramp({ length: 10, height: 2.4, curve: 0.3, direction: 'down' })
  .flat(12)
  .camera({ mode: 'side' })
  .bumpRow(3, 0.3, 16)
  .flat(4)
  .tabletop(6, 8, 1.0)
  .flat(8)
  .checkpoint() // ~330 m
  .flat(16)
  .camera({ mode: 'high34' })
  // chain D: fast and wide, 6 m platforms, gaps 5 / 4 / 5
  .ramp({ length: 5, height: 1.5 })
  .gap({ width: 5 })
  .platform(6, 1.2, { landing: 0.4 })
  .gap({ width: 4 })
  .platform(6, 1.2, { landing: 0.4 })
  .gap({ width: 5 })
  .gapLanding(1.0, 6, 6, 8)
  .flat(12)
  .camera({ mode: 'side' })
  .rollers(20, 0.25, 3)
  .flat(6)
  .checkpoint() // ~430 m
  .flat(16)
  .camera({ mode: 'high34' })
  .setPiece('air', 'Chain C') // storyboard §2: the set piece is the last chain into the see-saw
  // chain C: 5.5 m platforms (2 of lip, 1.5 of kicker), one bike length of slack
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
  .platform(5.5, 1.0, { landing: 0.4 })
  .gap({ width: 4 })
  .seesaw({ length: 5, height: 1.0 }) // 22 deg: land on the resting end; it tips as you ride out (v2: <= 22 deg boards ride at every speed with a cruise rider)
  .gap({ width: 3 })
  .endSetPiece()
  .camera({ mode: 'side', cut: true })
  .flat(12)
  .bumpRow(2, 0.3, 16)
  .setPiece('finish')
  .flat(12)
  .arch({ style: 'finish' })
  .finish();

/**
 * H3 — TEACHES speed commitment: clear a row of burning barrels from a kicker, then brake hard into
 * a technical stop. DEMANDS a fire line straight into brake, hop-gap and kerb. Round 5 (reflex `average` capped
 * 51 x 3: 84 deaths landing past the first barrel row on flat ground, 15 more on the flat after it,
 * 15 at the demand's 18 deg landing ramp; the `good` probe: kicker + 4 barrels onto flat 2,walled,4;
 * onto an 8 x 2.0 landing ramp 2 m past the barrels 1,1,1): every fire line lands on a 14 deg ramp
 * whose top is 2 m past the last barrel; the brake zones and kerb hops after are unchanged.
 */
export const H3 = course('h3-fire-line', 'Fire Line', 'hard')
  .meta({
    biome: 'foundry',
    technique: 'commit at speed over fire, then stop hard',
    demands: '20 m run-up, straight 22 deg kicker over six burning barrels onto a landing ramp, brake to walking pace in 8 m, hop a 2 m gap and a 0.45 + 0.25 m kerb',
    attemptsBand: [18, 25],
    targetTimeS: 75, // round 7 gold (physics v2): skill-3 bot 45.1 s x 1.6 (the v1 stranger/bot clean ratio), rounded up to 5 s and kept non-decreasing through the tier; platinum = 0.85 x this (core rules)
  })
  .camera({ mode: 'side', zoomBias: 0.4 })
  .setPiece('start', 'The Pour')
  .flat(6)
  .arch({ style: 'girder' }) // the start gantry at x = 3 (an arch is centred 3 m behind the cursor)
  .flat(22)
  .endSetPiece()
  .checkpoint() // 28 m
  .flat(3)
  .flat(20) // v2: 13.5 m/s at the lip; the 22 deg lip at 12-14 m/s flies 9-11 m over 3-4.6 m of fire onto the down-ramp
  .setPiece('fire', 'Ladle 1')
  .ramp({ length: 5, height: 2.0 }) // straight 21.8 deg (round 7: the curve-0.3 lip is gone — v2 loops a rider who holds the gas through a curved 22 deg+ lip below 10 m/s; the straight lip is survivable from 12 m/s, which the 23 m run-up gives)
  .flat(1)
  .barrel({ count: 4, spacing: 0.8 }) // 3.0 m of fire, 0.9-1.5 m: any body part in it = hazard fault
  .flat(2)
  .ramp({ length: 8, height: 2.0, direction: 'down' }) // landing ramp (was 8 m of flat: 84 deaths)
  .endSetPiece()
  .flat(12)
  .rollers(20, 0.25, 3)
  .flat(4)
  .bumpRow(2, 0.3, 16)
  .flat(4)
  .wave(28, 1.5, 16)
  .flat(4)
  .tabletop(6, 8, 1.0)
  .flat(8)
  .checkpoint() // ~200 m
  .flat(3)
  .flat(20)
  .setPiece('fire', 'Ladle 2')
  .ramp({ length: 5, height: 2.0 })
  .flat(1)
  .barrel({ count: 6, spacing: 0.8 })
  .flat(2)
  .ramp({ length: 8, height: 2.0, direction: 'down' }) // landing ramp (was 6 m = 18 deg)
  .endSetPiece()
  .flat(8) // brake zone: v2 measured 5.9 m from 10 m/s hard-back (7.1 neutral), authored 8
  .ledge({ height: 0.45, length: 4 }) // the stop-and-hop (round 7: 0.45, the v2 gas-hop's safe band is 0.3-0.6; was 0.5, once 0.7)
  .flat(12)
  .wave(28, 1.5, 16)
  .flat(4)
  .tabletop(6, 8, 1.0)
  .flat(8)
  .checkpoint() // ~310 m
  .flat(3)
  .flat(20)
  .setPiece('fire', 'Ladle 3')
  .ramp({ length: 5, height: 2.0 })
  .flat(1)
  .barrel({ count: 5, spacing: 0.8 })
  .flat(2)
  .ramp({ length: 8, height: 2.0, direction: 'down' })
  .endSetPiece()
  .flat(8) // brake zone
  .hump(0.3, 3)
  .flat(3)
  .ledge({ height: 0.45, length: 4 }) // the stop-and-hop at half stakes
  .flat(12)
  .rollers(20, 0.25, 3)
  .flat(6)
  .checkpoint() // ~410 m
  .flat(3)
  .flat(20)
  .camera({ mode: 'high34', zoomBias: 0.4 })
  .setPiece('fire', 'The Pour')
  .ramp({ length: 5, height: 2.0 })
  .flat(1)
  .barrel({ count: 6, spacing: 0.8 }) // 4.6 m of fire (was 6 barrels behind a 2 m pit = 6.6 m: from a 23 m run-up the reflex player launches at ~11 m/s and 6.2+ m of fire is a hazard death every time, 111 in 3 seeds; the demand is the stop after, not the row)
  .flat(2)
  .ramp({ length: 8, height: 2.0, direction: 'down' })
  .camera({ mode: 'side-tight' })
  .flat(8) // brake zone
  .hump(0.3, 3) // speed hump at the end of the brake zone
  .flat(3)
  .gap({ width: 2, depth: 2 }) // low-speed hop
  .flat(3)
  .ledge({ height: 0.45, length: 3 }) // the B line: 0.45 now, 0.25 in 3 m
  .ledge({ height: 0.7, length: 4 })
  .endSetPiece()
  .camera({ mode: 'side' })
  .flat(12)
  .bumpRow(2, 0.3, 16)
  .setPiece('finish')
  .flat(12)
  .arch({ style: 'finish' })
  .finish();
