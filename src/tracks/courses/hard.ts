/**
 * Hard tier — night city (H1, H2) and foundry (H3). Attempts band 10-25, measured at
 * bot skill 3. `loop` is cut from the vocabulary (CONTRACT §2.1), so H3 is the
 * speed-commit track: fire barrels cleared at speed, then a hard stop.
 * Round 3: flow sections between the technical ones; checkpoints every ~15 s of bot time.
 * Round 9 (tracks-storyboards.md §1-3, physics v2 R5): the courses are the storyboards — H1 climbs the
 * roofline and drops into the scaffold tunnel, H2 climbs the container stack to the crane jump, H3 runs
 * the pour tunnel's fire pair — every shape held to the reflex `good` 9-seed probes in `tracks.md` §0/§2.
 */
import { course } from '../author';

/** Rail slots: kill pits 0.7 m wide that catch a grounded front wheel; ride them on the rear wheel. */
function slots(b: ReturnType<typeof course>, count: number, pitch: number): ReturnType<typeof course> {
  for (let i = 0; i < count; i++) b.gap({ width: 0.7, depth: 1.5, hazard: 'kill' }).flat(pitch - 0.7);
  return b;
}

/**
 * H1 "Rooftop Wire" — TEACHES the sustained wheelie / rear-wheel balance across slotted rails, and the lip
 * climb. The roofline climbs 2 m per section (`smooth(28, 2)`, crest-grounded at 16 m/s) so every wall
 * stands at the foot of the next roof; the demand is the parapet wire (10 slots at 2.0 m) straight after
 * the tallest lip, and then the roof ends: a 40 deg roll-off into a 7 deg descent through the scaffold
 * tunnel (the panic-drop table: coast + lean back rides a >= 8 x h down-ramp; fast = 0.7 s of air onto
 * falling ground). Every wall is a `steppedWall`: the lip is the A line (front wheel onto the lip, hop
 * the rear), the ramp in front leaves a 0.3 m hop as the B line (round 9 probe from 16 m, reflex `good`
 * 9 seeds: step 0.4 clears 8/9, 0.3 and 0.2 clear 9/9 median 2; 0.3 keeps the hop a hop).
 */
export const H1 = (() => {
  const b = course('h1-wheelie-wire', 'Rooftop Wire', 'hard')
    .meta({
      biome: 'nightCity',
      technique: 'sustained wheelie and the lip climb',
      demands: '1.4 m lip climb (or the 0.3 m hop off its ramp) straight into the parapet wire: 10 rail slots at 2.0 m, then the roof ends in a 40 deg roll-off',
      attemptsBand: [10, 18],
      targetTimeS: 85, // round 9 gold: skill-3 bot 50.5 s (2 attempts) x 1.6, rounded up to 5 s, non-decreasing through the tier (tracks.md round-9 table); platinum = 0.85 x this (core rules)
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
  slots(b, 8, 2.5); // beat 2, the first wire: 8 slots at 2.5 on the ground level
  b.flat(6).wave(28, 1.5, 16).flat(4).bumpRow(3, 0.3, 16).flat(6).smooth(28, 2).flat(6).checkpoint(); // beat 3: up one roof (+2); CP1 on the new level
  b.flat(16).steppedWall({ height: 1.0, width: 6, lip: 0.15 }, 0.3).flat(3); // beat 4: 16 m from the spawn; lip climb, or the ramp + a 0.3 m hop
  slots(b, 6, 3.0); // the wider pitch is the lesson: you may drop the front between slots here
  b.flat(6).rollers(20, 0.25, 3).flat(4).tabletop(6, 8, 1.0).flat(6).smooth(28, 2).flat(6).checkpoint(); // beat 5: up two roofs (+4)
  b.flat(16).steppedWall({ height: 1.2, width: 5, lip: 0.15 }, 0.3).flat(3);
  slots(b, 6, 2.5);
  b.flat(6).wave(28, 1.5, 16).flat(4).bumpRow(2, 0.3, 16).flat(6).smooth(28, 2).flat(6).checkpoint(); // the roofline is now +6
  b.flat(16).setPiece('balance', 'The Wire').camera({ mode: 'low', cut: true }).steppedWall({ height: 1.4, width: 8, lip: 0.2 }, 0.3).flat(3); // beat 6, the demand: the tallest lip straight into the parapet wire (round 9: an 8 m top — on a 4 m top the hop landed straight into the first 2.0 m slots, 58 of 76 `good` deaths)
  slots(b, 4, 2.5); // the wire narrows over the street: 2.5 m for four slots (round 9: ten at 2.0 straight off the hop was 46 of 67 `good` deaths), then
  slots(b, 4, 2.0); // 2.0 m for six
  b.arch({ style: 'crowd' }); // the crowd bridge over slot 8
  slots(b, 2, 2.0);
  b.endSetPiece()
    .flat(4)
    .setPiece('drop', 'The Drop') // beat 7: the roof ends — 40 deg roll-off, 7 deg descent through the scaffold tunnel
    .camera({ mode: 'high34', cut: true })
    .tunnel({ length: 30, style: 'scaffold', lit: true })
    .slope(3.6, -3) // 39.8 deg roll-off: slow = ride it (B line), fast = 0.7 s of air onto the descent (reflex `good` probe from 24 m: 2 attempts, 9/9)
    .slope(24, -3) // 7.1 deg, 8 x the drop: the panic-drop rule's down-ramp
    .endSetPiece()
    .camera({ mode: 'side-tight' })
    .flat(8) // checkpoint rule: >= 8 m past the landing zone
    .checkpoint() // the tunnel exit (the roofline is back at 0)
    .flat(3)
    .camera({ mode: 'side' })
    .bumpRow(2, 0.3, 16)
    .flat(6)
    .arch({ style: 'crowd' })
    .setPiece('finish')
    .flat(12)
    .arch({ style: 'finish' });
  return b.finish();
})();

/**
 * H2 "Container Yard" — TEACHES precision gaps with speed control: read the width, set the speed, on
 * kicker platforms. Round 9: every platform kicker is a STRAIGHT 2 x 0.4 (11 deg) lip — the curve-0.3
 * 1.5 x 0.4 lip launched the gas-through-the-lip rider nose-up onto the next platform's landing lip
 * (chain B probe, reflex `good` 9 seeds: 2/9 -> 8/9, median 99 -> 1); chain B steps up 0.3 per platform
 * (rear-first mandatory), the flow climbs the stack (`smooth(30, 2.4)`) to the crane apron and the set
 * piece is the apron jump — a 6 x 1.5 kicker over 5 m of water onto a `gapLanding` (probe: 6 m clears in
 * 1, 8 m in 4; on the track 7 m from 26 m was a wall: §0 sizes it at 5 m; the 22 deg 5 x 2.0 of the storyboard costs 6 / 9 / walled at 6 / 8 / 10 m); the demand is
 * chain C: three platforms at 1.0 and a last gap onto a landing incline (the storyboard's 5.5 m platforms and its see-saw finish walled every seed; see the beat-8 note).
 */
export const H2 = course('h2-gap-chain', 'Container Yard', 'hard')
  .meta({
    biome: 'nightCity',
    technique: 'gap chains: read the width, set the speed',
    demands: 'the crane jump (6 x 1.5 kicker over 5 m of water from the apron), then three 8 m platforms at 1.0 with 3 m gaps and the last gap onto a landing incline',
    attemptsBand: [14, 22],
    targetTimeS: 85, // round 9 gold: skill-3 bot 45.7 s x 1.6, rounded up to 5 s, non-decreasing through the tier (tracks.md round-9 table); platinum = 0.85 x this (core rules)
  })
  .camera({ mode: 'high34' })
  .setPiece('start', 'Container Yard')
  .flat(6)
  .arch({ style: 'girder' }) // the start gantry at x = 3 (an arch is centred 3 m behind the cursor)
  .flat(22)
  .endSetPiece()
  .checkpoint() // 28 m
  .flat(16) // 15 m from the spawn (checkpoint rule)
  // chain A: 8 m platforms with landing lips, every one ending in a straight 2 x 0.4 kicker; gaps 3 / 3 / 3 / 2
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 3 })
  .platform(8, 0.8, { landing: 0.4, landingLength: 3, length: 2, curve: 0 })
  .gap({ width: 3 })
  .platform(8, 0.8, { landing: 0.4, landingLength: 3, length: 2, curve: 0 })
  .gap({ width: 3 })
  .platform(8, 0.8, { landing: 0.4, landingLength: 3, length: 2, curve: 0 })
  .gap({ width: 2 })
  .flat(12)
  .camera({ mode: 'side' })
  .rollers(20, 0.25, 3)
  .flat(4)
  .setPiece('tunnel', 'Under the Stacks') // beat 3: the flow runs through a 30 m concrete tunnel under the container stacks
  .tunnel({ length: 30, style: 'concrete', lit: false })
  .wave(28, 1.5, 16)
  .flat(2)
  .endSetPiece()
  .flat(2)
  .bumpRow(3, 0.3, 16)
  .flat(6)
  .checkpoint() // ~210 m
  .flat(16)
  .camera({ mode: 'high34' })
  // chain B: landing 0.3 above launch every time -> rear first mandatory; 8 m platforms with lips, straight kickers
  .ramp({ length: 5, height: 1.2 })
  .gap({ width: 4 })
  .platform(8, 1.2, { landing: 0.4, landingLength: 3, length: 2, curve: 0 })
  .gap({ width: 3 })
  .platform(8, 1.5, { landing: 0.4, landingLength: 3, length: 2, curve: 0 })
  .gap({ width: 3 })
  .platform(8, 1.8, { landing: 0.4, landingLength: 3, length: 2, curve: 0 })
  .gap({ width: 2 })
  .platform(8, 2.1, { landing: 0.4, landingLength: 3, length: 2, curve: 0 })
  .gap({ width: 3 })
  .ramp({ length: 2, height: 0.4 }, { base: 2.0 })
  .box({ width: 5, height: 2.4 })
  .ramp({ length: 10, height: 2.4, curve: 0.3, direction: 'down' })
  .flat(12)
  .camera({ mode: 'side' })
  .bumpRow(3, 0.3, 16)
  .flat(4)
  .smooth(30, 2.4) // beat 5: up the stack onto the crane apron (crest-grounded at 16 m/s: half-length >= 11 m for 2.4 m)
  .flat(6)
  .checkpoint() // ~330 m, on the apron
  .flat(30) // the apron: 30 m of flat, FEEL.speedAfter = 12.1 m/s at the margin
  .camera({ mode: 'high34' })
  .setPiece('air', 'The Crane Jump') // beat 6: full gas from the spawn, off the gas at the lip, level, rear-first on the incline
  .ramp({ length: 6, height: 1.5 }) // 14 deg (the 22 deg 5 x 2.0 costs 6-9 attempts over 6-8 m; this one 1 over 6 m, 4 over 8 m)
  .gap({ width: 5 }) // §0 sizing: 0.7 x jumpRange(12.1 m/s, 14 deg) = 5.1 m (a 7 m gap from 26 m wanted 12.5 m/s raw and was 70 of 100 `good` deaths on the track: the rider who holds back is short)
  .gapLanding(1.0, 6, 6, 8)
  .endSetPiece()
  .flat(6)
  .camera({ mode: 'side' })
  .smooth(30, -2.4) // beat 7: back down to the yard
  .flat(4)
  .rollers(20, 0.25, 3)
  .flat(3)
  .arch({ style: 'crowd' }) // the stands face the jump
  .flat(6)
  .checkpoint() // ~460 m
  .flat(16)
  .camera({ mode: 'high34' })
  .setPiece('air', 'Chain C') // beat 8, the demand: chain A's rhythm at 1.0 m — three platforms, 3 m gaps, one bike length of slack — and off the last kicker over 3 m onto the rear-first landing incline. (Round 9, reflex `good` 9 seeds on the track: the storyboard's 5.5 m platforms 0/9; 7 / 8 m LEVEL platforms with any 4 m gap 0/9; a second stepping chain 2/9; a see-saw finish 0/9 with 75 deaths on the board — the see-saw is the m3 trace's missing controller model, so the demand ends on a landing incline, not a board.)
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 3 })
  .platform(8, 1.0, { landing: 0.4, landingLength: 3, length: 2, curve: 0 })
  .gap({ width: 3 })
  .platform(8, 1.0, { landing: 0.4, landingLength: 3, length: 2, curve: 0 })
  .gap({ width: 3 })
  .platform(8, 1.0, { landing: 0.4, landingLength: 3, length: 2, curve: 0 })
  .gap({ width: 3 })
  .gapLanding(1.0, 6, 6, 10)
  .endSetPiece()
  .camera({ mode: 'side', cut: true })
  .flat(12)
  .bumpRow(2, 0.3, 16)
  .setPiece('finish')
  .flat(12)
  .arch({ style: 'finish' })
  .finish();

/**
 * H3 "The Pour" — TEACHES speed commitment: clear a row of burning barrels from a straight 22 deg kicker
 * onto a 14 deg landing ramp, then brake hard into a technical stop. Rows 4 -> 5 + stop -> 5 + 6 inside
 * the casting tunnel 22 m apart (the set piece: land, do NOT brake, second lip at ~11 m/s; reflex `good`
 * probe 1, 9/9) -> 6 into the stop (the demand). Round 9: the demand's 2 m hop-gap after the hump is gone
 * (reflex `good` probe: 22 attempts, 6/9 — a hop-preload into the pit; without it 3, 8/9): the stop is
 * brake zone, hump, the 0.45 kerb and the 0.7 kerb (a 0.25 step) onto a down-ramp.
 */
export const H3 = course('h3-fire-line', 'The Pour', 'hard')
  .meta({
    biome: 'foundry',
    technique: 'commit at speed over fire, then stop hard',
    demands: 'two fire rows 22 m apart inside the pour tunnel without a brake between them; then six barrels straight into an 8 m brake zone, a hump and a 0.45 + 0.25 m stepped kerb',
    attemptsBand: [18, 25],
    targetTimeS: 85, // round 9 gold: skill-3 bot 47.1 s x 1.6, rounded up to 5 s, non-decreasing through the tier (tracks.md round-9 table); platinum = 0.85 x this (core rules)
  })
  .camera({ mode: 'side', zoomBias: 0.4 })
  .setPiece('start', 'The Hall Door')
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
  .barrel({ count: 5, spacing: 0.8 })
  .flat(2)
  .ramp({ length: 8, height: 2.0, direction: 'down' })
  .endSetPiece()
  .flat(8) // brake zone: v2 measured 5.9 m from 10 m/s hard-back (7.1 neutral), authored 8
  .ledge({ height: 0.45, length: 4 }) // the stop-and-hop (round 9 probe: 8 m + 0.45 kerb, reflex `good` 2 attempts 9/9)
  .flat(12)
  .wave(28, 1.5, 16)
  .flat(4)
  .smooth(28, -2) // beat 5: down into the casting tunnel mouth (a descent is flow: credited run-up)
  .flat(6)
  .checkpoint() // ~300 m, just inside the tunnel
  .flat(3)
  .setPiece('tunnel', 'The Pour') // beat 6: 60 m foundry tunnel, the floor lit by the melt, two rows 22 m apart
  .tunnel({ length: 60, style: 'foundry', lit: true })
  .flat(20)
  .setPiece('fire', 'The Pour')
  .ramp({ length: 5, height: 2.0 })
  .flat(1)
  .barrel({ count: 5, spacing: 0.8 })
  .flat(2)
  .ramp({ length: 8, height: 2.0, direction: 'down' })
  .flat(12) // land, do NOT brake: 12 m of flat from a rolling ~8 m/s exit is enough for the second lip
  .ramp({ length: 5, height: 2.0 })
  .flat(1)
  .barrel({ count: 6, spacing: 0.8 })
  .flat(2)
  .ramp({ length: 8, height: 2.0, direction: 'down' })
  .endSetPiece()
  .flat(6)
  .arch({ style: 'crowd' }) // beat 7: the tunnel exit into the crowd
  .flat(6)
  .rollers(20, 0.25, 3)
  .flat(6)
  .checkpoint() // ~420 m
  .flat(3)
  .flat(20)
  .camera({ mode: 'high34', zoomBias: 0.4 })
  .setPiece('fire', 'Ladle 4')
  .ramp({ length: 5, height: 2.0 })
  .flat(1)
  .barrel({ count: 6, spacing: 0.8 }) // 4.6 m of fire (6.6 m was 111 hazard deaths in 3 seeds; the demand is the stop after, not the row)
  .flat(2)
  .ramp({ length: 8, height: 2.0, direction: 'down' })
  .camera({ mode: 'side-tight' })
  .flat(8) // brake zone
  .hump(0.3, 3) // speed hump at the end of the brake zone
  .flat(3)
  .ledge({ height: 0.45, length: 3 }) // the stepped kerb: 0.45 now, 0.25 more in 3 m
  .ledge({ height: 0.7, length: 4 })
  .ramp({ length: 6, height: 0.7, direction: 'down' })
  .endSetPiece()
  .camera({ mode: 'side' })
  .flat(12)
  .smooth(40, -2) // beat 9: glide down to the yard
  .flat(6)
  .bumpRow(2, 0.3, 16)
  .setPiece('finish')
  .flat(12)
  .arch({ style: 'finish' })
  .finish();
