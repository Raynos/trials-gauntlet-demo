import { writeFile } from 'node:fs/promises';
import { quantizeInput } from '../../../../src/core/replay';
import type { InputFrame } from '../../../../src/core/types';
import { createBikePhysicsV2 as createBikePhysics, type BikePhysicsWorldV2 } from '../../../../src/physics/v2/bike';
import { makeTrack } from '../../../../src/physics/testTracks';
import { stepN } from '../../../../src/physics/controllers';
import { type BikeClassV2, type PartialTuningV2, BIKE_GEOMETRY_V2 } from '../../../../src/physics/v2/tuning';
import { makeRiderRigPose, riderRigFromHips } from '../../../../src/render/hero/riderRig';
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

// Existing r3 reference hop/drop measurement code above is copied unchanged, with tuning injection.
type HipPose = {hipX:number;hipY:number;torso:number};
const neutral: HipPose = {hipX:-.34,hipY:.732,torso:65};
const lerp=(a:HipPose,b:HipPose,t:number):HipPose=>({hipX:a.hipX+(b.hipX-a.hipX)*t,hipY:a.hipY+(b.hipY-a.hipY)*t,torso:a.torso+(b.torso-a.torso)*t});
function geometry(back:HipPose,forward:HipPose){
 const hips=[back,{hipX:-.60,hipY:neutral.hipY,torso:40},neutral,lerp(neutral,forward,.5),forward];
 const rigs=hips.map(p=>riderRigFromHips(p.hipX,p.hipY,p.torso*Math.PI/180,makeRiderRigPose()));
 const poses=Array.from({length:41},(_,i)=>{const lean=-1+i/20, segment=Math.min(3,Math.floor(i/10)), t=(i-segment*10)/10, u=t*t*(3-2*t); const p=lerp(hips[segment]!,hips[segment+1]!,u); const r=riderRigFromHips(p.hipX,p.hipY,p.torso*Math.PI/180,makeRiderRigPose()); return {lean,x:r.com.x+BIKE_GEOMETRY_V2.chassisToAxle.x,y:r.com.y+BIKE_GEOMETRY_V2.chassisToAxle.y,psi:(p.torso-65)*Math.PI/180};});
 return {hips,rigs,poses};
}
const candidates=[];
for(const backX of [-.62,-.66,-.72]) for(const backY of [.4,.46,.52]) for(const backTorso of [40,50,60]) for(const frontX of [-.24,-.18,-.12]) for(const frontY of [.90,.94]) for(const frontTorso of [24,30]){
 const g=geometry({hipX:backX,hipY:backY,torso:backTorso},{hipX:frontX,hipY:frontY,torso:frontTorso});
 const dense = g.hips.slice(1).flatMap((b,i)=>Array.from({length:21},(_,j)=>lerp(g.hips[i]!,b,j/20))).map(p=>riderRigFromHips(p.hipX,p.hipY,p.torso*Math.PI/180,makeRiderRigPose()));
 if(dense.some(r=>r.armReach>.98||r.legReach>.98))continue;
 if(g.poses.some((p,i)=>i>0&&p.x<=g.poses[i-1]!.x))continue;
 const over={rider:{poses:g.poses}};
 const rookie=hop('rookie',{},over),pro=hop('pro',{},over);
 candidates.push({back:g.hips[0],neutral,forward:g.hips[4],poses:g.poses,reach:g.rigs.map(r=>({arm:r.armReach,leg:r.legReach})),rookie,pro,score:Math.min(rookie.apexR,pro.apexR),hopPass:[rookie,pro].every(r=>!r.fault&&r.apexR>=.45&&r.first==='front'&&Math.abs(r.landPitch)<20)});
}
const results=candidates;results.sort((a,b)=>Number(b.hopPass)-Number(a.hopPass)||b.score-a.score);
const baseline={rookie:hop('rookie'),pro:hop('pro'),dropRookie:drop('rookie',3,8,0),dropPro:drop('pro',3,8,0)};
const retunes=[];
for(const c of results.slice(0,8))for(const Fmax of [3200,4000,4800])for(const rate of [3,5,7]){
 const over={rider:{poses:c.poses,Fmax,targetRateLin:rate}};
 const rookie=hop('rookie',{},over),pro=hop('pro',{},over);
 const pass=[rookie,pro].every(r=>!r.fault&&r.apexR>=.45&&r.first==='front'&&Math.abs(r.landPitch)<20);
 retunes.push({back:c.back,forward:c.forward,Fmax,rate,rookie,pro,pass,dropRookie:drop('rookie',3,8,0,over),dropPro:drop('pro',3,8,0,over)});
}
await writeFile(new URL('./sweep-results.json',import.meta.url),JSON.stringify({warning:'Target-table-only prototype: legacy hold/sensors still active, results do not validate shared geometry migration. psi zero at seated 65 degrees for target sweep; existing fixed anchor approximation remains.',neutral,baseline,candidates:results,retunes},null,2)+'\n');
console.info(JSON.stringify({baseline,count:results.length,passes:results.filter(r=>r.hopPass).length,best:results.slice(0,3),retunePass:retunes.filter(r=>r.pass).length},null,2));
