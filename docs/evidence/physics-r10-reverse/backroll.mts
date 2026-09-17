// A bike already rolling backwards at -6 m/s (spawned with velocity) with the brake held: the calipers must stay on
// (caliper factor ~1 while the roll is past 2 x vmax) and the bike must slow into the creep, not be driven.
import { createBikePhysicsV2 } from '../../../src/physics/v2/bike';
import { makeTrack } from '../../../src/physics/testTracks';
import { stepN } from '../../../src/physics/controllers';
const HZ = 120;
for (const [bike, off] of [['rookie', false], ['rookie', true], ['pro', false], ['pro', true]] as const) {
  const w = createBikePhysicsV2(HZ, off ? { engine: { reverse: { engageS: 1e9 } } } : undefined);
  // an 8 deg grade, bike facing uphill, released at rest without brake so it rolls back under gravity first
  const a = (12 * Math.PI) / 180;
  const k = Math.tan(a);
  w.loadTrack(makeTrack({ finishX: 1e9, profile: [{ x: -200, y: -200 * k }, { x: 400, y: 400 * k }], start: { pos: { x: 0, y: 0.05 }, angle: a } }), 1, { bike });
  stepN(w, {}, HZ * 4); // roll back 4 s free
  const v0 = w.getState().bike.vel.x * Math.cos(a) + w.getState().bike.vel.y * Math.sin(a);
  const rows: string[] = [];
  for (let i = 0; i < HZ * 4; i++) {
    w.step({ throttle: 0, brake: 1, lean: 0, hop: false, restart: false });
    if (i % 24 === 0) {
      const s = w.getState();
      const d = w.debug();
      rows.push(`${(i / HZ).toFixed(1)} v=${(s.bike.vel.x * Math.cos(a) + s.bike.vel.y * Math.sin(a)).toFixed(2)} rev=${d.engine.reverse.toFixed(2)} thr=${d.engine.thrustN.toFixed(0)} rb=${d.brakes.rearTorqueNm.toFixed(0)} fb=${d.brakes.frontTorqueNm.toFixed(0)} fault=${s.faulted}`);
    }
  }
  console.log(`${bike} reverseOff=${off}: free roll-back 4 s on 12 deg -> v=${v0.toFixed(2)}; then brake held:\n` + rows.join('\n'));
}
