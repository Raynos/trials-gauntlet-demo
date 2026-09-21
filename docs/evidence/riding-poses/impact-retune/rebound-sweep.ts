import { writeFile } from 'node:fs/promises';
import { quantizeInput } from '../../../../src/core/replay';
import type { InputFrame } from '../../../../src/core/types';
import { createBikePhysicsV2 as createBikePhysics, type BikePhysicsWorldV2 } from '../../../../src/physics/v2/bike';
import { makeTrack } from '../../../../src/physics/testTracks';
import { stepN } from '../../../../src/physics/controllers';
import { type BikeClassV2, type PartialTuningV2 } from '../../../../src/physics/v2/tuning';
const HZ=120, deg=(r:number)=>r*180/Math.PI;
function flatWorld(cls: BikeClassV2, over?: PartialTuningV2): BikePhysicsWorldV2 {
  const w = createBikePhysics(HZ, over);
  w.loadTrack(makeTrack({ finishX: 1e9 }), 1, { bike: cls });
  stepN(w, {}, 60);
  return w;
}

function hop(cls: BikeClassV2, h: { preLean?: number; snapRate?: number; snapS?: number } = {}, over?: PartialTuningV2): { apexR: number; first: string; landPitch: number; bothOff: number; fault: string | null } {
  const P = 0.3;
  const preLean = h.preLean ?? -1;
  const rate = h.snapRate ?? Infinity;
  const snapS = h.snapS ?? 0.22;
  const w = flatWorld(cls, over);
  const ry0 = w.getState().wheels.rear.pos.y;
  const o = { apexR: 0, first: '', landPitch: NaN, bothOff: 0, fault: null as string | null };
  let lean = preLean;
  let wasBothOff = false;
  for (let i = 0; i < HZ * 3; i++) {
    const t = i / HZ;
    let inp: Partial<InputFrame>;
    if (t < P) inp = { throttle: 0.3, lean: preLean };
    else if (t < P + snapS) {
      lean = Math.min(1, lean + rate / HZ);
      inp = { throttle: 0.3, lean };
    } else if (t < P + snapS + 0.1) inp = { throttle: 0.2, lean: -1 };
    else inp = { throttle: 0.2, lean: 0 };
    w.step(quantizeInput(inp));
    const s = w.getState();
    if (s.faulted) {
      o.fault = s.faulted;
      break;
    }
    o.apexR = Math.max(o.apexR, s.wheels.rear.pos.y - ry0);
    const rg = s.wheels.rear.grounded;
    const fg = s.wheels.front.grounded;
    if (t > P && !o.first && (!rg || !fg)) o.first = !fg ? 'front' : 'rear';
    if (!rg && !fg) {
      o.bothOff++;
      wasBothOff = true;
    } else if (wasBothOff && Number.isNaN(o.landPitch)) o.landPitch = deg(s.bike.angle);
  }
  o.bothOff /= HZ;
  return o;
}

/** Teleport a level bike `h` above flat dirt at `v` m/s with the rider holding `lean`, throttle 0.2; what the landing does. */
function drop(cls: BikeClassV2, h: number, v: number, lean: number, over?: PartialTuningV2): { maxRear: number; minPitch: number; maxPitch: number; fault: string | null; rebound: number; airAfter: number; endV: number } {
  const w = flatWorld(cls, over);
  const s0 = w.getState();
  w.teleport({ pos: { x: s0.wheels.rear.pos.x, y: s0.wheels.rear.pos.y + h }, angle: (5 * Math.PI) / 180, vel: { x: v, y: 0 } });
  let maxRear = 0;
  let minPitch = 99;
  let maxPitch = -99;
  let landed = false;
  let rebound = 0;
  let airAfter = 0;
  let y0 = NaN;
  const s = stepN(w, { throttle: 0.2, lean }, HZ * 3, (st) => {
    const g = st.wheels.rear.grounded || st.wheels.front.grounded;
    if (g) landed = true;
    if (landed) {
      maxRear = Math.max(maxRear, st.wheels.rear.compression);
      minPitch = Math.min(minPitch, deg(st.bike.angle));
      maxPitch = Math.max(maxPitch, deg(st.bike.angle));
      if (!g) airAfter++;
      if (Number.isNaN(y0)) y0 = st.wheels.rear.pos.y;
      rebound = Math.max(rebound, st.wheels.rear.pos.y - y0);
    }
  });
  return { maxRear, minPitch, maxPitch, fault: s.faulted, rebound, airAfter: airAfter / HZ, endV: s.bike.vel.x };
}

const rows=[];
for(const cReb of [350,400,450,500,600,800])for(const servoMinFrac of [.3,.2,.1]){
 const over={suspension:{rear:{cReb},front:{cReb}},rider:{servoMinFrac}};
 rows.push({cReb,servoMinFrac,hop:hop('rookie',{},over),slow:hop('rookie',{snapRate:8,snapS:.25},over),drop:drop('pro',3,6,0,over)});
}
await writeFile(new URL('./rebound-sweep.json',import.meta.url),JSON.stringify(rows,null,2));console.info(rows);
