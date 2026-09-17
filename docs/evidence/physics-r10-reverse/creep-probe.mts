
import { quantizeInput } from '../../../src/core/replay';
import { createBikePhysicsV2 } from '../../../src/physics/v2/bike';
import { makeTrack } from '../../../src/physics/testTracks';
import { stepN } from '../../../src/physics/controllers';
const HZ = 120;
(() => {
  for (const bike of ['rookie', 'pro'] as const) {
    const w = createBikePhysicsV2(HZ);
    w.loadTrack(makeTrack({ finishX: 1e9 }), 1, { bike });
    stepN(w, {}, 240);
    const x0 = w.getState().bike.pos.x;
    const rows: string[] = [];
    for (let i = 0; i < HZ * 3; i++) {
      w.step(quantizeInput({ brake: 1 }));
      const s = w.getState(); const d = w.debug();
      if (i % 12 === 0 || i === HZ*2-1) rows.push(`${(i / HZ).toFixed(2)} vx=${s.bike.vel.x.toFixed(3)} rev=${d.engine.reverse.toFixed(2)} thr=${d.engine.thrustN.toFixed(0)} rb=${d.brakes.rearTorqueNm.toFixed(0)} fb=${d.brakes.frontTorqueNm.toFixed(0)} pitch=${(s.bike.angle*57.3).toFixed(1)} rearG=${s.wheels.rear.grounded} spin=${s.wheels.rear.spinVel.toFixed(2)}`);
    }
    const s2 = w.getState();
    rows.push(`after 3 s hold: x-x0=${(s2.bike.pos.x - x0).toFixed(3)} vx=${s2.bike.vel.x.toFixed(3)} fault=${s2.faulted}`);
    for (let i = 0; i < HZ * 1.5; i++) {
      w.step(quantizeInput({}));
      const s = w.getState(); const d = w.debug();
      if (i % 12 === 0) rows.push(`release ${(i / HZ).toFixed(2)} vx=${s.bike.vel.x.toFixed(3)} rev=${d.engine.reverse.toFixed(2)} thr=${d.engine.thrustN.toFixed(0)}`);
    }
    console.log(bike + '\n' + rows.join('\n'));
  }
})();
