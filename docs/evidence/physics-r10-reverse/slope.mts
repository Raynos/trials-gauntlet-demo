// Reverse on a grade: bike facing uphill on a straight slope; brake tap (0.125 s) must hold it; a 3 s hold creeps back
// without running away; release after the creep stops it (the governor), then it rolls under gravity with no brake.
import { createBikePhysicsV2 } from '../../../src/physics/v2/bike';
import { makeTrack } from '../../../src/physics/testTracks';
import { stepN } from '../../../src/physics/controllers';
const HZ = 120;
for (const degS of [8, 15, 25]) {
  const a = (degS * Math.PI) / 180;
  const k = Math.tan(a);
  for (const bike of ['rookie', 'pro'] as const) {
    const w = createBikePhysicsV2(HZ);
    w.loadTrack(makeTrack({ finishX: 1e9, profile: [{ x: -60, y: -60 * k }, { x: 400, y: 400 * k }], start: { pos: { x: 0, y: 0.05 }, angle: a } }), 1, { bike });
    stepN(w, { brake: 1 }, 240); // sit on the brake: does a 2 s hold (past engageS) roll it? that's reverse by design
    const s0 = w.getState();
    // tap: release, then a 15-tick tap, then release
    stepN(w, {}, 30);
    const x1 = w.getState().bike.pos.x;
    stepN(w, { brake: 1 }, 15);
    const x2 = w.getState().bike.pos.x;
    stepN(w, { brake: 1 }, HZ * 3);
    const s3 = w.getState();
    const vAlong = s3.bike.vel.x * Math.cos(a) + s3.bike.vel.y * Math.sin(a);
    stepN(w, {}, HZ * 1.5);
    const s4 = w.getState();
    const v4 = s4.bike.vel.x * Math.cos(a) + s4.bike.vel.y * Math.sin(a);
    console.log(`${degS} deg ${bike}: after 2 s brake-from-load vx=${s0.bike.vel.x.toFixed(2)} rev=${w.debug().engine.reverse.toFixed(2)} | tap moved ${(x2 - x1).toFixed(3)} m | 3 s hold vAlong=${vAlong.toFixed(2)} pitch=${(s3.bike.angle * 57.3 - degS).toFixed(1)} fault=${s3.faulted} | 1.5 s after release vAlong=${v4.toFixed(2)} rev=${w.debug().engine.reverse.toFixed(2)} fault=${s4.faulted}`);
  }
}
