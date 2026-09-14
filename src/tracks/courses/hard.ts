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

/** H1 — TEACHES sustained wheelie / rear-wheel balance across slotted rails, and the lip climb. DEMANDS a lip climb straight into rails ending at a gap. */
export const H1 = (() => {
  const b = course('h1-wheelie-wire', 'Wheelie Wire', 'hard')
    .meta({
      biome: 'nightCity',
      technique: 'sustained wheelie and the lip climb',
      demands: '1.4 m lip climb from a 6 m run-up straight into 5 rail slots and a 3 m gap from the rear wheel',
      attemptsBand: [10, 18],
      targetTimeS: 110,
    })
    .camera({ mode: 'side', zoomBias: -0.3 })
    .flat(28)
    .checkpoint() // 28 m
    .flat(3)
    .rollers(16, 0.15, 6) // front wheel DOWN over rollers: throttle modulation warm-up
    .flat(4);
  slots(b, 8, 2.5); // wheelie section 1
  b.flat(6).wave(16, 1.5).flat(4).humpRow(3, 0.3, 8).flat(6).checkpoint(); // ~130 m
  b.flat(3).flat(13).wall({ height: 1.0, width: 6, lip: 0.15 }).flat(4); // 15 m run-up from the spawn (checkpoint rule), front wheel onto the lip/s, hop the rear up
  slots(b, 6, 3.0);
  b.flat(6).rollers(20, 0.3, 4).flat(4).tabletop(6, 8, 1.0).flat(6).wave(20, 2.0).flat(4).humpRow(2, 0.3, 8).flat(6).checkpoint(); // ~285 m
  b.flat(3).flat(13).wall({ height: 1.2, width: 5, lip: 0.15 }).flat(3);
  slots(b, 6, 2.5);
  b.flat(6).wave(20, 2.0).flat(4).humpRow(2, 0.3, 8).flat(6).checkpoint(); // ~320 m
  b.flat(3).flat(13);
  slots(b, 10, 2.0); // the long wire: 10 slots at 2.0 m
  b.flat(6).rollers(15, 0.3, 3).flat(6).checkpoint(); // ~380 m
  b.flat(3).flat(13).camera({ mode: 'low', cut: true }).wall({ height: 1.4, width: 4, lip: 0.2 }).flat(3); // checkpoint rule: wall top + slots = 15 m to the closing 3 m gap
  slots(b, 5, 2.0);
  return b.gap({ width: 3 }).camera({ mode: 'side' }).flat(8).humpRow(2, 0.3, 8).flat(12).finish();
})();

/** H2 — TEACHES precision gaps with speed control: read the width, set the speed, on 3-5 m platforms. DEMANDS a 7-gap chain on 3.5 m platforms ending on a see-saw launch. */
export const H2 = course('h2-gap-chain', 'Gap Chain', 'hard')
  .meta({
    biome: 'nightCity',
    technique: 'gap chains: read the width, set the speed',
    demands: '7 gaps on 3.5 m kicker platforms, last one launched from a see-saw',
    attemptsBand: [14, 22],
    targetTimeS: 120,
  })
  .camera({ mode: 'high34' })
  .flat(28)
  .checkpoint() // 28 m
  .flat(3)
  // chain A: every platform ends in a 1.5 x 0.4 kicker; speeds ~8, 6, 9, 5 m/s
  .flat(13) // 15 m from the spawn (checkpoint rule)
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 4 })
  .platform(5, 0.8)
  .gap({ width: 3 })
  .platform(4.5, 1.2)
  .gap({ width: 5 })
  .platform(5, 1.0)
  .gap({ width: 2 })
  .flat(8)
  .camera({ mode: 'side' })
  .rollers(15, 0.3, 3)
  .flat(4)
  .wave(16, 1.5)
  .flat(4)
  .humpRow(3, 0.3, 8)
  .flat(4)
  .wave(20, 2.0)
  .flat(6)
  .checkpoint() // ~175 m
  .flat(3)
  .flat(13)
  .camera({ mode: 'high34' })
  // chain B: landing 0.3 above launch every time -> rear first mandatory
  .ramp({ length: 5, height: 1.2 })
  .gap({ width: 4 })
  .platform(6, 1.2)
  .gap({ width: 3 })
  .platform(6, 1.5)
  .gap({ width: 4 })
  .platform(6, 1.8)
  .gap({ width: 2 })
  .platform(6, 2.1)
  .gap({ width: 3 })
  .box({ width: 5, height: 2.4 })
  .ramp({ length: 8, height: 2.4, curve: 0.3, direction: 'down' })
  .flat(6)
  .camera({ mode: 'side' })
  .humpRow(3, 0.3, 8)
  .flat(4)
  .tabletop(6, 8, 1.0)
  .flat(8)
  .checkpoint() // ~225 m
  .flat(3)
  .flat(13)
  .camera({ mode: 'high34' })
  // chain D: fast and wide, 5 m platforms, gaps 5/4/5
  .ramp({ length: 5, height: 1.5 })
  .gap({ width: 5 })
  .platform(5, 1.2)
  .gap({ width: 4 })
  .platform(5, 1.2)
  .gap({ width: 5 })
  .box({ width: 6, height: 1.0 })
  .ramp({ length: 5, height: 1.0, curve: 0.3, direction: 'down' })
  .flat(6)
  .camera({ mode: 'side' })
  .rollers(20, 0.3, 4)
  .flat(6)
  .checkpoint() // ~305 m
  .flat(3)
  .flat(13)
  .camera({ mode: 'high34' })
  // chain C: 3.5 m platforms (1.5 of it kicker), one bike length of slack
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
  .platform(3.5, 1.0)
  .gap({ width: 5 })
  .seesaw({ length: 5, height: 1.0 }) // land on the resting end; it tips as you ride out
  .gap({ width: 3 })
  .camera({ mode: 'side', cut: true })
  .flat(8)
  .humpRow(2, 0.3, 8)
  .flat(12)
  .finish();

/** H3 — TEACHES speed commitment: clear a row of burning barrels from a kicker, then brake hard into a technical stop. DEMANDS fire over a gap then brake-and-hop. */
export const H3 = course('h3-fire-line', 'Fire Line', 'hard')
  .meta({
    biome: 'foundry',
    technique: 'commit at speed over fire, then stop hard',
    demands: '20 m run-up, kicker over a gap and six burning barrels, brake to walking pace in 8 m, hop a 0.7 m kerb',
    attemptsBand: [18, 25],
    targetTimeS: 125,
  })
  .camera({ mode: 'side', zoomBias: 0.4 })
  .flat(28)
  .checkpoint() // 28 m
  .flat(3)
  .flat(20) // ~13 m/s: the 22 deg lip at 11 m/s clears 2.0 m of fire for 8 m
  .ramp({ length: 5, height: 2.0, curve: 0.3 })
  .flat(1)
  .barrel({ count: 4, spacing: 0.8 }) // 3.0 m of fire, 0.9-1.5 m: any body part in it = hazard fault
  .flat(8)
  .smooth(8, -1.0)
  .flat(6)
  .rollers(15, 0.3, 3)
  .flat(4)
  .humpRow(2, 0.3, 8)
  .flat(4)
  .wave(20, 2.0)
  .flat(4)
  .tabletop(6, 8, 1.0)
  .flat(8)
  .checkpoint() // ~190 m
  .flat(3)
  .flat(20)
  .ramp({ length: 5, height: 2.0, curve: 0.3 })
  .flat(1)
  .barrel({ count: 6, spacing: 0.8 })
  .flat(2)
  .ramp({ length: 6, height: 2.0, direction: 'down' }) // landing ramp, short = its face
  .flat(8) // brake zone: measured 4.47 m from 10 m/s, authored 8
  .ledge({ height: 0.7, length: 4 }) // rolling hop
  .flat(8)
  .wave(16, 1.5)
  .flat(4)
  .tabletop(6, 8, 1.0)
  .flat(8)
  .checkpoint() // ~230 m
  .flat(3)
  .flat(20)
  .ramp({ length: 5, height: 2.0, curve: 0.3 })
  .flat(1)
  .barrel({ count: 5, spacing: 0.8 })
  .flat(2)
  .ramp({ length: 6, height: 2.0, direction: 'down' })
  .flat(8) // brake zone
  .hump(0.3, 3)
  .flat(3)
  .ledge({ height: 0.5, length: 4 }) // a lower kerb: the stop-and-hop at half stakes
  .flat(6)
  .rollers(20, 0.3, 4)
  .flat(6)
  .checkpoint() // ~330 m
  .flat(3)
  .flat(20)
  .camera({ mode: 'high34', zoomBias: 0.4 })
  .ramp({ length: 5, height: 2.0, curve: 0.3 })
  .gap({ width: 2 })
  .barrel({ count: 6, spacing: 0.8 })
  .flat(2)
  .ramp({ length: 6, height: 2.0, direction: 'down' })
  .camera({ mode: 'side-tight' })
  .flat(8) // brake zone
  .hump(0.3, 3) // speed hump at the end of the brake zone
  .flat(3)
  .gap({ width: 2, depth: 2 }) // low-speed hop
  .flat(3)
  .ledge({ height: 0.7, length: 4 })
  .camera({ mode: 'side' })
  .flat(8)
  .humpRow(2, 0.3, 8)
  .flat(12)
  .finish();
