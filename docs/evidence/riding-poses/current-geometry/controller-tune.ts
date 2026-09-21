import { writeFile } from 'node:fs/promises';
import { quantizeInput } from '../../../../src/core/replay';
import type { InputFrame } from '../../../../src/core/types';
import { createBikePhysicsV2 as createBikePhysics, type BikePhysicsWorldV2 } from '../../../../src/physics/v2/bike';
import { makeTrack } from '../../../../src/physics/testTracks';
import { stepN, runController } from '../../../../src/physics/controllers';
import { type BikeClassV2, type PartialTuningV2 } from '../../../../src/physics/v2/tuning';
const HZ=120, deg=(r:number)=>r*180/Math.PI;
function flatWorld(cls: BikeClassV2, over?: PartialTuningV2): BikePhysicsWorldV2 {
  const w = createBikePhysics(HZ, over);
  w.loadTrack(makeTrack({ finishX: 1e9 }), 1, { bike: cls });
  stepN(w, {}, 60);
  return w;
}

function _hop(cls: BikeClassV2, h: { preLean?: number; snapRate?: number; snapS?: number } = {}, over?: PartialTuningV2): { apexR: number; first: string; landPitch: number; bothOff: number; fault: string | null } {
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
function _drop(cls: BikeClassV2, h: number, v: number, lean: number, over?: PartialTuningV2): { maxRear: number; minPitch: number; maxPitch: number; fault: string | null; rebound: number; airAfter: number; endV: number } {
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


import { riderRigFromCOM, RIDER_TORSO_REST, makeRiderRigPose } from '../../../../src/core/riderGeometry';
import { compileTrack } from '../../../../src/tracks/compile';
import { LAB_PHYSICS_TEST, LAB_TAKEOFF } from '../../../../src/tracks/courses/lab';
const lipX = 40 + LAB_TAKEOFF.length + LAB_TAKEOFF.lip;
const ledgeX = lipX + 3;
const ledgeY = 1.6;
function labRun(cls: BikeClassV2, speed: number, over?: PartialTuningV2): { cleared: boolean; margin: number; fault: string | null; landPitch: number; apex: number; cause:string|null; faultX:number; reach:{arm:number;leg:number};pose:unknown } {
  const w = createBikePhysics(HZ,over);
  w.loadTrack(compileTrack(LAB_PHYSICS_TEST), 1, { bike: cls });
  stepN(w, {}, 60);
  let apex = 0;
  let margin = Infinity;
  let landPitch = NaN;
  let wasAir = false;
  let cleared = false;
  const r = runController(w, adaptedLipHopper(lipX, speed, 0.3, 0.22, 0.1, true), {
    ticks: HZ * 16,
    decisionHz: 60,
    latencyMs: 50,
    onTick: (s) => {
      const g = s.wheels.rear.grounded || s.wheels.front.grounded;
      if (s.wheels.front.pos.x > lipX) {
        if (!g) {
          wasAir = true;
          apex = Math.max(apex, s.wheels.rear.pos.y - 0.34);
        } else if (wasAir && Number.isNaN(landPitch)) landPitch = deg(s.bike.angle);
        if (Math.abs(s.wheels.rear.pos.x - ledgeX) < 0.2) margin = Math.min(margin, s.wheels.rear.pos.y - 0.34 - ledgeY);
      }
      if (s.wheels.rear.pos.x > ledgeX + 1 && s.wheels.rear.grounded && s.wheels.rear.pos.y > ledgeY) cleared = true;
    },
    stopWhen: (s) => s.faulted !== null || s.wheels.rear.pos.x > ledgeX + 8 || (s.wheels.rear.pos.x > lipX && s.wheels.rear.pos.y < 0 && s.bike.vel.x < 0.5),
  });
  const dbg=w.debug();
  const body=r.last.riderBody!,cc=Math.cos(r.last.bike.angle),ss=Math.sin(r.last.bike.angle),dx=body.pos.x-r.last.bike.pos.x,dy=body.pos.y-r.last.bike.pos.y;
  const rig=riderRigFromCOM(dx*cc+dy*ss-.065,-dx*ss+dy*cc+.21,RIDER_TORSO_REST+body.angle-r.last.bike.angle,makeRiderRigPose());
  return { cleared, margin, fault: r.last.faulted, landPitch, apex, cause:dbg.crashCause,faultX:r.last.bike.pos.x,reach:{arm:rig.armReach,leg:rig.legReach},pose:{bike:r.last.bike,body,chain:dbg.riderChain,torso:rig.torsoAngle} };
}



import type { Controller } from '../../../../src/physics/controllers';
let landingTarget=0,kpLand=0,kdLand=0,leanRate=Infinity;
function adaptedLipHopper(lipX: number, speed = 8.5, preloadS = 0.3, snapS = 0.22, tuckS = 0.1, hop = true, o: { preLean?: number; thrPre?: number; snapLead?: number; snapLean?: number; thrSnap?: number } = {}): Controller {
  let airLean = 0;
  const preLean = o.preLean ?? -0.8;
  const snapLean = o.snapLean ?? 1;
  const thrSnap = o.thrSnap ?? 0.5;
  const snapLead = o.snapLead ?? 1.0; // the REAR wheel this far before the lip's edge: the push leaves the ramp through the rear
  let snapT = NaN;
  let preT = NaN;
  return (ob) => {
    const rearX = ob.state.wheels.rear.pos.x;
    const v = Math.max(1, ob.speed);
    const hold = Math.max(0, Math.min(1, 0.15 + 0.3 * (speed - ob.speed)));
    // approach with the weight forward (R3: the Pro loops at lean 0 under the hold throttle from a standstill)
    const approachLean = ob.speed < speed - 1 ? 0.5 : 0;
    if (!hop) {
      if (rearX < lipX) return { throttle: hold, lean: approachLean };
      return { throttle: 0.25, lean: ob.pitchDeg < -10 ? -0.8 : 0 };
    }
    if (Number.isNaN(preT) && rearX >= lipX - snapLead - preloadS * v) preT = ob.t;
    if (Number.isNaN(preT)) return { throttle: hold, lean: approachLean };
    if (Number.isNaN(snapT) && (rearX >= lipX - snapLead || ob.t - preT >= preloadS + 0.15)) snapT = ob.t;
    if (Number.isNaN(snapT)) return { throttle: o.thrPre ?? hold, lean: preLean };
    const t = ob.t - snapT;
    if (t < snapS) return { throttle: thrSnap, lean: snapLean };
    if (t < snapS + tuckS) return { throttle: 0.3, lean: -1 };
    // fly it: hold the lean back (K_att nose-up) while the nose is dropping, forward against a rising nose
    // Keep landing recovery through a front-wheel-only touchdown: straightening the rider before
    // the rear wheel arrives transfers the torso's angular momentum into a forward endo.
    if (ob.airborne || !ob.state.wheels.rear.grounded) {
      const want=Math.max(-1,Math.min(1,(ob.pitchDeg-landingTarget)*kpLand+ob.pitchRateDeg*kdLand));
      airLean+=Math.max(-leanRate/60,Math.min(leanRate/60,want-airLean));
      return {throttle:.3,lean:airLean};
    }
    return { throttle: 0.3, lean: ob.pitchDeg > 15 ? 0.8 : 0 };
  };
}


const rows=[];
for(const target of [0,10,20])for(const kp of [.025,.05,.1])for(const kd of [.003,.006,.012])for(const rate of [4,8,Infinity]){
 landingTarget=target;kpLand=kp;kdLand=kd;leanRate=rate;
 const rookie8=labRun('rookie',8),rookie9=labRun('rookie',9),pro8=labRun('pro',8),pro9=labRun('pro',9);
 rows.push({target,kp,kd,rate,rookie8,rookie9,pro8,pro9,clears:[rookie8,rookie9,pro8,pro9].filter(r=>r.cleared&&!r.fault).length});
}
rows.sort((a,b)=>b.clears-a.clears);
await writeFile(new URL('./controller-tune.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');
console.info(JSON.stringify(rows.slice(0,3),null,2));
