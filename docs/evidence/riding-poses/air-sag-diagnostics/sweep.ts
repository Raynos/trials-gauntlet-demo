import {writeFileSync} from 'node:fs';
import {quantizeInput} from '../../../../src/core/replay';
import type {InputFrame} from '../../../../src/core/types';
import {createBikePhysicsV2 as createBikePhysics,type BikePhysicsWorldV2} from '../../../../src/physics/v2/bike';
import {makeTrack} from '../../../../src/physics/testTracks';
import {runController,wheelieHoldV3,type Controller,stepN} from '../../../../src/physics/controllers';
import {type BikeClassV2,type PartialTuningV2} from '../../../../src/physics/v2/tuning';
const HZ=120, DEG=180/Math.PI,deg=(x:number)=>x*DEG;
let current:PartialTuningV2={};
function normalize(cls:BikeClassV2,over?:PartialTuningV2){if(cls!=='pro'||!over)return over;return {...over,...(over.chassis?.inertia===11.9?{chassis:{...over.chassis,inertia:11}}:{}),...(over.rider?.Katt===280?{rider:{...over.rider,Katt:260}}:{})};}
function flatWorld(finishX = 1e9): BikePhysicsWorldV2 {
  const w = createBikePhysics(HZ,current);
  w.loadTrack(makeTrack({ finishX }), 1, { bike: 'rookie' });
  stepN(w, {}, 60);
  return w;
}

function cruiseTo(w: BikePhysicsWorldV2, v: number, seconds = 8, lean = 0.3): void {
  for (let i = 0; i < HZ * seconds; i++) {
    const s = w.getState();
    w.step(quantizeInput({ throttle: Math.max(0, Math.min(1, 0.1 + 0.3 * (v - s.bike.vel.x))), lean }));
  }
}

  function air(v: number, input: Partial<InputFrame>): number {
    const w = flatWorld();
    cruiseTo(w, v);
    const s0 = w.getState();
    w.teleport({ pos: { x: s0.wheels.rear.pos.x, y: s0.wheels.rear.pos.y + 4 }, angle: 0, vel: { x: s0.bike.vel.x, y: 3 } });
    stepN(w, {}, 6);
    const p0 = deg(w.getState().bike.angle);
    const s = stepN(w, input, HZ * 0.5);

    return deg(s.bike.angle) - p0;
  }
function ramp(cls: BikeClassV2, angleDeg: number, v: number, lean: number, thr = 1, len = 6, over?: PartialTuningV2): { overSlope: number; lipPitch: number; lipRate: number; lipV: number; assistMax: number } {
  const x0 = 30;
  const a = (angleDeg * Math.PI) / 180;
  const w = createBikePhysics(HZ, normalize(cls,over));
  const lipX = x0 + len * Math.cos(a);
  const lipY = len * Math.sin(a);
  w.loadTrack(makeTrack({ profile: [{ x: -30, y: 0 }, { x: x0, y: 0 }, { x: lipX, y: lipY }, { x: lipX + 40, y: lipY - 8 }, { x: 400, y: -8 }], finishX: 1e9 }), 1, { bike: cls });
  stepN(w, {}, 60);
  w.teleport({ pos: { x: 5, y: 0.34 }, angle: 0, vel: { x: v, y: 0 } });
  let st = w.getState();
  while (st.wheels.rear.pos.x < x0 - 0.5) st = stepN(w, { throttle: st.bike.vel.x < v ? 1 : 0, lean: 0.3 }, 1);
  const o = { overSlope: -99, lipPitch: NaN, lipRate: NaN, lipV: NaN, assistMax: 0 };
  stepN(w, { throttle: thr, lean }, HZ * 1.5, (q) => {
    const p = q.bike.angle * DEG;
    const rx = q.wheels.rear.pos.x;
    o.assistMax = Math.max(o.assistMax, w.debug().engine.assist);
    // the ramp proper: past the base transition (the first 1.5 m is the geometric 150 deg/s rotation onto the slope)
    if (rx > x0 + 1.5 && rx < lipX && q.wheels.rear.grounded) o.overSlope = Math.max(o.overSlope, p - angleDeg);
    if (Number.isNaN(o.lipPitch) && rx >= lipX) {
      o.lipPitch = p;
      o.lipRate = q.bike.angVel * DEG;
      o.lipV = Math.hypot(q.bike.vel.x, q.bike.vel.y);
    }
  });
  return o;
}


function flatClass(cls: BikeClassV2, over?: PartialTuningV2): BikePhysicsWorldV2 {
  const chosen=over ?? current; const w = createBikePhysics(HZ, normalize(cls,chosen));
  w.loadTrack(makeTrack({ finishX: 1e9 }), 1, { bike: cls });
  stepN(w, {}, 60);
  return w;
}

  function hold(cls: BikeClassV2, ctrl: Controller, target: number, decisionHz: number, latencyMs: number, over?: PartialTuningV2): { inBand: number; loop: boolean; vmax: number } {
    const w = flatClass(cls, over);
    let leanPark = 1;
    for (let l = -1; l <= 1.001; l += 0.01) {
      if (deg(w.balancePitch(l, 0)) >= target + 1) {
        leanPark = l;
        break;
      }
    }
    stepN(w, { lean: leanPark }, 60);
    const s0 = w.getState();
    w.teleport({ pos: { x: s0.wheels.rear.pos.x, y: s0.wheels.rear.pos.y }, angle: (target * Math.PI) / 180, vel: { x: 4, y: 0 } });
    let inBand = 0;
    let loop = false;
    let vmax = 0;
    runController(w, ctrl, {
      ticks: HZ * 12.5,
      decisionHz,
      latencyMs,
      onTick: (s) => {
        const p = deg(s.bike.angle);
        if (s.time > 0.5 && !s.wheels.front.grounded && Math.abs(p - target) <= 8) inBand++;
        if (p > 90) loop = true;
        vmax = Math.max(vmax, s.bike.vel.x);
      },
      stopWhen: (s) => s.faulted !== null,
    });
    return { inBand: inBand / HZ, loop, vmax };
  }
  function run(cls: BikeClassV2, input: (t: number) => Partial<InputFrame>, secs = 6, pre?: (w: BikePhysicsWorldV2) => void): { maxP: number; loopT: number; t16: number } {
    const w = flatClass(cls);
    pre?.(w);
    let maxP = -99;
    let loopT = NaN;
    let t16 = NaN;
    for (let i = 0; i < HZ * secs; i++) {
      const t = i / HZ;
      w.step(quantizeInput(input(t)));
      const s = w.getState();
      if (s.faulted) break;
      const p = deg(s.bike.angle);
      maxP = Math.max(maxP, p);
      if (Number.isNaN(t16) && s.bike.vel.x >= 16) t16 = t;
      if (Number.isNaN(loopT) && p > 90) loopT = t;
    }
    return { maxP, loopT, t16 };
  }

const DT=1/HZ;
function cruise(w: BikePhysicsWorldV2, v: number): number {
  for (let i = 0; i < HZ * 10; i++) {
    const s = w.getState();
    if (Math.abs(s.bike.vel.x - v) < 0.05 && i > HZ * 3) break;
    w.step(quantizeInput({ throttle: Math.max(0, Math.min(1, 0.1 + 0.3 * (v - s.bike.vel.x))), lean: 0 }));
  }
  return w.getState().bike.vel.x;
}

interface BrakeOut {
  v0: number;
  stopT: number;
  minPitch: number;
  rearOffS: number;
  firstRearOffS: number;
  fault: string | null;
}

/** Cruise to v, then full brake at `lean` for `holdS` (then `after` input) for up to 4 s. */
function brake(cls: BikeClassV2, v: number, lean: number, brace: number, holdS = 4, after: { brake: number; lean: number } = { brake: 1, lean }, liftControl?: number): BrakeOut {
  const w = flatClass(cls, {...current,rider:{...current.rider,brakeBrace:brace},brakes:{...current.brakes,...(liftControl === undefined ? {} : { liftControl })} });
  const v0 = cruise(w, v);
  const o: BrakeOut = { v0, stopT: Number.NaN, minPitch: 99, rearOffS: 0, firstRearOffS: Number.NaN, fault: null };
  for (let i = 0; i < HZ * 4; i++) {
    const t = i / HZ;
    w.step(quantizeInput(t < holdS ? { brake: 1, lean } : after));
    const s = w.getState();
    if (s.faulted) {
      o.fault = `${s.faulted}@${t.toFixed(2)}s`;
      break;
    }
    o.minPitch = Math.min(o.minPitch, deg(s.bike.angle));
    if (!s.wheels.rear.grounded) {
      o.rearOffS += DT;
      if (Number.isNaN(o.firstRearOffS)) o.firstRearOffS = t;
    }
    if (Number.isNaN(o.stopT) && Math.abs(s.bike.vel.x) < 0.2) o.stopT = t;
  }
  return o;
}


function touchdown(cls: BikeClassV2, vn: number, thr: number, pitchOver = 20): { peakStep: number; peakN: number } {
  const a = (20 * Math.PI) / 180;
  const w = createBikePhysics(HZ,normalize(cls,current));
  w.loadTrack(makeTrack({ profile: [{ x: -30, y: -20 }, { x: 0, y: -20 }, { x: 0, y: 0 }, { x: 40 * Math.cos(a), y: 40 * Math.sin(a) }, { x: 400, y: 40 * Math.sin(a) }], finishX: 1e9 }), 1, { bike: cls });
  stepN(w, {}, 60);
  const rx = 20;
  const ry = rx * Math.tan(a) + 0.34 + 0.6;
  const along = 10;
  w.teleport({ pos: { x: rx, y: ry }, angle: a + (pitchOver * Math.PI) / 180, vel: { x: along * Math.cos(a) + vn * Math.sin(a), y: along * Math.sin(a) - vn * Math.cos(a) } });
  stepN(w, { throttle: thr }, 12);
  let prev = w.getState().bike.angVel * DEG;
  const o = { peakStep: 0, peakN: 0 };
  stepN(w, { throttle: thr }, 60, (st) => {
    const r = st.bike.angVel * DEG;
    if (Math.abs(r - prev) > Math.abs(o.peakStep)) o.peakStep = r - prev;
    prev = r;
    for (const c of w.debug().contacts) if (c.body === 'rearWheel') o.peakN = Math.max(o.peakN, c.lambdaN * HZ);
  });
  return o;
}

function monotone(){return [.4,.7,1].map(throttle=>{const pitches=[1,.75,.5,.25,0,-.25,-.5,-.75,-1].map(lean=>{const w=flatWorld();let maxP=-999;stepN(w,{throttle,lean},HZ*4,s=>{if(s.faulted)maxP=Math.max(maxP,180);else if(s.time>.5)maxP=Math.max(maxP,deg(s.bike.angle));});return maxP;});return {throttle,pitches,maxInversion:Math.max(...pitches.slice(1).map((v,i)=>pitches[i]-v))};});}
function slam(cls:BikeClassV2,ang:number,rate:number){const w=flatClass(cls);const s0=w.getState();w.teleport({pos:{x:s0.wheels.rear.pos.x,y:s0.wheels.rear.pos.y+1},angle:ang/DEG,vel:{x:10,y:-8},angVel:rate});let faultT=NaN,maxGrip=0;for(let i=0;i<HZ;i++){w.step(quantizeInput({throttle:0,lean:0}));maxGrip=Math.max(maxGrip,w.debug().rider.hold.gripF);if(w.getState().faulted){faultT=i/HZ;break;}}return{fault:w.getState().faulted,cause:w.debug().crashCause,faultT,maxGrip};}
const mode=process.argv[2]??'air';
const variants:[string,PartialTuningV2][]=[['base',{}]];
if(mode==='combined')variants.push(['combined',{brakes:{brakeTau:.015},rider:{Katt:280},suspension:{rear:{k:10400}},engine:{wheelieControl:{margin0:.25,margin1:.4}}}]);
if(mode==='brake')for(const brakeTau of [.025,.02,.015,.01,.005])variants.push([`tau${brakeTau}`,{brakes:{brakeTau}}]);
if(mode==='ecu')for(const margin0 of [.21,.23,.25,.27])for(const leanFull of [.1,.15,.2])variants.push([`m${margin0}lf${leanFull}`,{engine:{wheelieControl:{margin0,margin1:.4,leanFull}}}]);
if(mode==='inertia')for(const inertia of [11.25,11.5,12,12.5,13])variants.push([`I${inertia}`,{chassis:{inertia}}]);
if(mode==='fine')for(const inertia of [11.6,11.7,11.8,11.9,11.95])variants.push([`I${inertia}`,{chassis:{inertia}}]);
if(mode==='mono')for(const [key,values]of Object.entries({kd:[3800,4500,5000],targetRateAng:[4,5],kpsi:[2000,2200]}))for(const value of values)variants.push([`${key}${value}`,{rider:{[key]:value}}]);
if(mode==='mono2'){variants.push(['I11.9R-only',{chassis:{inertia:11.9}}]);for(const targetRateAng of [3.5,3.75,4])for(const kd of [4200,4500])variants.push([`ang${targetRateAng}kd${kd}`,{chassis:{inertia:11.9},rider:{targetRateAng,kd}}]);}
if(mode==='air') for(const Katt of [280,290,295])for(const cAtt of [33,35,37])variants.push([`K${Katt}c${cAtt}`,{rider:{Katt,cAtt}}]);
if(mode==='sag') for(const k of [10480,10450,10400,10350])variants.push([`rearK${k}`,{suspension:{rear:{k}}}]);
if(mode==='ramp') for(const margin0 of [.21,.23,.25,.28])for(const margin1 of [.4,.42,.45])variants.push([`m${margin0}-${margin1}`,{engine:{wheelieControl:{margin0,margin1}}}]);
const rows=[];
for(const [name,over]of variants){current=over;const row:Record<string,unknown>={name,over};
if(mode==='air'||mode==='combined'||mode==='inertia'||mode==='fine'||mode==='mono'||mode==='mono2')row.air=[8,14,20].map(v=>({v,none:air(v,{}),back:air(v,{lean:-1}),forward:air(v,{lean:1}),throttle:air(v,{throttle:1}),brake:air(v,{brake:1})}));
if(mode==='sag'){const w=flatWorld();const s=stepN(w,{},180);row.sag={rear:s.wheels.rear.compression*100,front:s.wheels.front.compression*100,pitch:deg(s.bike.angle),speed:Math.hypot(s.bike.vel.x,s.bike.vel.y)};}
if(mode!=='air')row.ramp=['rookie','pro'].flatMap(cls=>[0,.2,.4,1].map(lean=>({cls,lean,...ramp(cls as BikeClassV2,20,10,lean,1,6,over)})));
if(mode==='brake'||mode==='combined')row.brake=['rookie','pro'].map(cls=>({cls,stoppie:brake(cls as BikeClassV2,10,1,.5,.2,{brake:0,lean:0}),unbraced:brake(cls as BikeClassV2,10,1,0,.2,{brake:0,lean:0}),stops:[6,10,15].map(v=>({v,...brake(cls as BikeClassV2,v,0,.5)}))}));
if(mode==='ramp'||mode==='combined'||mode==='ecu'||mode==='inertia'){row.ladder=['rookie','pro'].flatMap(cls=>[-1,-.5,-.25,0,.25,.5,1].map(lean=>({cls,lean,...run(cls as BikeClassV2,()=>({throttle:1,lean}),8)})));row.launch=['rookie','pro'].flatMap(cls=>[0,1,2].map(rampS=>({cls,rampS,...run(cls as BikeClassV2,t=>({throttle:rampS?Math.min(1,t/rampS):1,lean:0}),8)})));row.hold=['rookie','pro'].map(cls=>({cls,...hold(cls as BikeClassV2,wheelieHoldV3(40,4),40,60,100)}));}if(mode==='inertia'||mode==='fine'||mode==='mono'||mode==='mono2'){row.slam=['rookie','pro'].flatMap(cls=>[[50,3],[40,2]].map(([ang,rate])=>({cls,ang,rate,...slam(cls as BikeClassV2,ang,rate)})));row.monotone=monotone();row.touchdown=['rookie','pro'].flatMap(cls=>[1,2].flatMap(vn=>[0,1].map(thr=>({cls,vn,thr,...touchdown(cls as BikeClassV2,vn,thr)}))));}rows.push(row);console.log(JSON.stringify(row));}
writeFileSync(new URL(`./${mode}-results.json`,import.meta.url),JSON.stringify(rows,null,2));
