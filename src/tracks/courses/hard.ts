/**
 * Hard tier — night city (H1, H2) and foundry (H3). Attempts band 10-25.
 * `loop` is cut from the vocabulary (CONTRACT §2.1), so H3 is the speed-commit
 * track: fire barrels cleared at speed, then a hard stop.
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
      demands: '1.6 m lip climb straight into 5 rail slots and a 3 m gap from the rear wheel',
      attemptsBand: [10, 18],
      targetTimeS: 62,
    })
    .camera({ mode: 'side', zoomBias: -0.3 })
    .flat(28)
    .checkpoint()
    .flat(3)
    .rollers(16, 0.15, 6) // front wheel DOWN over rollers: throttle modulation warm-up
    .flat(4);
  slots(b, 8, 2.5); // wheelie section 1
  b.flat(6).checkpoint().flat(3).wall({ height: 1.2, width: 6, lip: 0.15 }).flat(4); // front wheel onto the lip at ~5 m/s, hop the rear up
  slots(b, 6, 3.0);
  b.flat(6).checkpoint().flat(3).wall({ height: 1.4, width: 5, lip: 0.15 }).flat(3);
  slots(b, 6, 2.5);
  b.flat(6).checkpoint().flat(3).camera({ mode: 'low', cut: true }).wall({ height: 1.6, width: 4, lip: 0.15 }).flat(2);
  slots(b, 5, 2.0);
  return b.gap({ width: 3 }).camera({ mode: 'side' }).flat(12).finish();
})();

/** H2 — TEACHES precision gaps with speed control: read the width, set the speed, on 3-5 m platforms. DEMANDS a 7-gap chain on 3 m platforms ending on a see-saw launch. */
export const H2 = course('h2-gap-chain', 'Gap Chain', 'hard')
  .meta({
    biome: 'nightCity',
    technique: 'gap chains: read the width, set the speed',
    demands: '7 gaps on 3 m platforms, last one launched from a see-saw',
    attemptsBand: [14, 22],
    targetTimeS: 72,
  })
  .camera({ mode: 'high34' })
  .flat(28)
  .checkpoint()
  .flat(3)
  // chain A: speeds ~8, 6, 9, 5 m/s
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 4 })
  .box({ width: 5, height: 0.8 })
  .gap({ width: 3 })
  .box({ width: 4, height: 1.2 })
  .gap({ width: 5 })
  .box({ width: 5, height: 1.0 })
  .gap({ width: 2 })
  .flat(8)
  .checkpoint()
  .flat(3)
  .flat(8)
  // chain B: landing above launch every time -> rear first mandatory
  .ramp({ length: 5, height: 1.2 })
  .gap({ width: 5 })
  .box({ width: 5, height: 1.2 })
  .gap({ width: 3 })
  .box({ width: 5, height: 1.6 })
  .gap({ width: 6 })
  .box({ width: 5, height: 2.0 })
  .gap({ width: 2 })
  .box({ width: 5, height: 2.4 })
  .gap({ width: 4 })
  .box({ width: 5, height: 2.8 })
  .ramp({ length: 8, height: 2.8, curve: 0.3, direction: 'down' })
  .flat(6)
  .checkpoint()
  .flat(3)
  .flat(8)
  // chain C: 3 m platforms, one bike length of slack
  .ramp({ length: 4, height: 1.0 })
  .gap({ width: 4 })
  .box({ width: 3, height: 1.0 })
  .gap({ width: 6 })
  .box({ width: 3, height: 1.0 })
  .gap({ width: 3 })
  .box({ width: 3, height: 1.0 })
  .gap({ width: 5 })
  .box({ width: 3, height: 1.0 })
  .gap({ width: 2 })
  .box({ width: 3, height: 1.0 })
  .gap({ width: 6 })
  .seesaw({ length: 5, height: 1.0 }) // tips as you ride out: launch angle depends on timing
  .gap({ width: 4 })
  .camera({ mode: 'side', cut: true })
  .flat(12)
  .finish();

/** H3 — TEACHES speed commitment: clear a row of burning barrels from a kicker, then brake hard into a technical stop. DEMANDS fire over a gap then brake-and-hop. */
export const H3 = course('h3-fire-line', 'Fire Line', 'hard')
  .meta({
    biome: 'foundry',
    technique: 'commit at speed over fire, then stop hard',
    demands: 'kicker over a gap and six burning barrels, brake to walking pace in 8 m, hop a 0.7 m kerb',
    attemptsBand: [18, 25],
    targetTimeS: 78,
  })
  .camera({ mode: 'side', zoomBias: 0.4 })
  .flat(28)
  .checkpoint()
  .flat(3)
  .flat(12) // ~11 m/s
  .ramp({ length: 5, height: 1.5, curve: 0.3 })
  .barrel({ count: 4, spacing: 0.8 }) // 3.0 m of fire: torso through it = hazard fault
  .flat(8)
  .smooth(8, -1.0)
  .flat(6)
  .checkpoint()
  .flat(3)
  .flat(14) // ~12 m/s
  .ramp({ length: 5, height: 2.0, curve: 0.3 })
  .flat(1)
  .barrel({ count: 6, spacing: 0.8 })
  .flat(2)
  .ramp({ length: 6, height: 2.0, direction: 'down' }) // landing ramp, short = its face
  .flat(8) // brake zone: measured 4.66 m from 10 m/s, authored 8
  .ledge({ height: 0.7, length: 4 }) // rolling hop
  .flat(6)
  .checkpoint()
  .flat(3)
  .flat(16) // ~13 m/s
  .camera({ mode: 'high34', zoomBias: 0.4 })
  .ramp({ length: 5, height: 2.0, curve: 0.3 })
  .gap({ width: 3 })
  .barrel({ count: 6, spacing: 0.8 })
  .flat(2)
  .ramp({ length: 6, height: 2.0, direction: 'down' })
  .camera({ mode: 'side-tight' })
  .flat(8) // brake zone
  .drum({ radius: 0.6, depth: 0.2 }) // speed bump at the end of the brake zone
  .flat(3)
  .gap({ width: 2, depth: 2 }) // low-speed hop
  .flat(3)
  .ledge({ height: 0.7, length: 4 })
  .flat(12)
  .finish();
