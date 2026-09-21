import fs from 'node:fs';
import path from 'node:path';

import { decodeJSON, expandFrames, type InputRecording } from '../../../../../src/core/replay';
import { createSimFor } from '../../../../../harness/lib/sim';
import { makeRiderRigPose, riderRigFromCOM, RIDER_TORSO_REST } from '../../../../../src/core/riderGeometry';
import { type BikePhysicsWorldV2 } from '../../../../../src/physics/v2/bike';

const HZ = 120;
const DT = 1 / HZ;
const G = 9.81;
const INPUTS = path.resolve('harness/inputs');
const BAND_PSI = 0.35;
const BAND_COM = 0.15;
const RECOVER_TICKS = 60;
const DEMAND_W = 6;
const EXCURSION_M = 0.35;
// R8: 0.05 (worst 0.046 under the seat line on 46 goldens). R9 (physics.md v2 status R9): 0.08 - the x1 / x3 Pro goldens that
// R8 could not search land the tracks' 5 m deck drop rear-first at -10 m/s (x1 599 m: seat impulse 768 N s, hips 0.130 = 7.0 cm
// under the line; x3 528 m: 213 N s, 2.6 cm). The velocity-bias limit's penetration under that slam is what it is (F dt^2 / (m beta));
// the sit is the seat taking the body, and the drawn pose (riderBody.drawn) never draws it below the seat.
const SLOP = 0.08;


function goldens(): { file: string; rec: InputRecording }[] {
  const out: { file: string; rec: InputRecording }[] = [];
  for (const dir of fs.readdirSync(INPUTS, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const name of ['bot-3.json', 'bot-3-pro.json']) {
      const file = path.join(INPUTS, dir.name, name);
      if (!fs.existsSync(file)) continue;
      const rec = decodeJSON(fs.readFileSync(file, 'utf8'));
      if (rec.header.physics === 'v1') continue;
      out.push({ file: `${dir.name}/${name}`, rec });
    }
  }
  return out;
}

interface Sample { tick:number; since:number; com:number; psiErr:number; demand:number; demandAng:number; sinceAvailable:number; [key:string]:unknown }
interface Row {
  file: string;
  finished: boolean;
  riding: number;
  overDemand: number;
  /** envelope violations beyond SLOP and the worst of each (m) */
  belowSeat: number;
  pastTank: number;
  legOver: number;
  armOver: number;
  minHipY: number;
  maxHipX: number;
  maxLeg: number;
  maxArm: number;
  /** COM band */
  outCom: number;
  maxCom: number;
  recovered: number;
  outRecovered: number;
  maxComRecovered: number;
  maxPsiRecovered: number;
  longestExcursion: number;
  longestExcursionAt: number;
  /** COM residual samples for the printed distribution: all, and by time since the last over-demand tick */
  com: number[];
  buckets: number[][];
  faults: string[]; samples: Sample[]; bad: Sample[];
}

const BUCKETS = [12, 30, 60, 120, 1e9];

async function replay(rec: InputRecording, file: string): Promise<Row> {
  const sim = await createSimFor(rec);
  const w = sim.world as unknown as BikePhysicsWorldV2 & { F: Float64Array; axleOrgX: number; axleOrgY: number };
  const r = w.tuning.rider;
  const h = r.hold;
  const geometry = makeRiderRigPose();
  const row: Row = {
    file,
    finished: false,
    riding: 0,
    overDemand: 0,
    belowSeat: 0,
    pastTank: 0,
    legOver: 0,
    armOver: 0,
    minHipY: 1e9,
    maxHipX: -1e9,
    maxLeg: 0,
    maxArm: 0,
    outCom: 0,
    maxCom: 0,
    recovered: 0,
    outRecovered: 0,
    maxComRecovered: 0,
    maxPsiRecovered: 0,
    longestExcursion: 0,
    longestExcursionAt: -1,
    com: [],
    buckets: BUCKETS.map(() => []),
    faults: [], samples: [], bad: [],
  };
  const demandG = r.Fmax / (r.mass * G);
  // R9: the angular demand too - the servo's torque limit over the body's inertia (300 / 9 = 33 rad/s^2). R8's conditioner read only
  // the linear demand, so an air whip whose chassis turns at 300 deg/s with the lean toggling (x3 Pro, 355-359 m: torque at +-300
  // N m, COM on target at 0.04 m, angle 0.73 rad behind) counted as recovered ticks the servo could not have recovered on.
  const demandA = r.tauMax / r.inertia;
  // Account for the very first input's demand from the stationary spawn.
  // NaN history incorrectly credited recovery before any acceleration sample.
  const initial = sim.state(), ic = Math.cos(initial.bike.angle), isn = Math.sin(initial.bike.angle);
  let ptx = initial.bike.pos.x + w.F[6]! * ic - w.F[7]! * isn;
  let pty = initial.bike.pos.y + w.F[6]! * isn + w.F[7]! * ic;
  let pta = initial.bike.angle + w.F[8]!;
  const vhx: number[] = Array(DEMAND_W + 1).fill(0);
  const vhy: number[] = Array(DEMAND_W + 1).fill(0);
  const vha: number[] = Array(DEMAND_W + 1).fill(0);
  let lastOver = -1e9, lastAvailableOver = -1e9;
  let tick = 0;
  let excursion = 0;
  let excursionAt = -1;
  let prevPhase = 'riding';
  const endExcursion = (): void => {
    if (excursion > row.longestExcursion) {
      row.longestExcursion = excursion;
      row.longestExcursionAt = excursionAt;
    }
    excursion = 0;
  };
  for (const f of expandFrames(rec)) {
    sim.step(f);
    tick++;
    const s = sim.state();
    const ph = sim.phase();
    if (ph === 'crashed' && prevPhase === 'riding') row.faults.push(`@${tick} ${w.debug().crashCause ?? '?'}`);
    prevPhase = ph;
    if (ph !== 'riding' || !s.riderBody) {
      ptx = Number.NaN;
      pta = Number.NaN;
      vhx.length = 0;
      vhy.length = 0;
      vha.length = 0;
      lastOver = -1e9;
      endExcursion();
      continue;
    }
    const c = Math.cos(s.bike.angle);
    const sn = Math.sin(s.bike.angle);
    const dx = s.riderBody.pos.x - s.bike.pos.x;
    const dy = s.riderBody.pos.y - s.bike.pos.y;
    const lx = dx * c + dy * sn;
    const ly = -dx * sn + dy * c;
    const tx = w.F[6]!;
    const ty = w.F[7]!;
    const tpsi = w.F[8]!;
    const twx = s.bike.pos.x + tx * c - ty * sn;
    const twy = s.bike.pos.y + tx * sn + ty * c;
    const twa = s.bike.angle + tpsi;
    let demand = NaN, demandAng = NaN;
    if (!Number.isNaN(ptx)) {
      vhx.push((twx - ptx) / DT);
      vhy.push((twy - pty) / DT);
      vha.push((twa - pta) / DT);
      if (vhx.length > DEMAND_W + 1) {
        vhx.shift();
        vhy.shift();
        vha.shift();
      }
      if (vhx.length === DEMAND_W + 1) {
        demand = Math.hypot((vhx[DEMAND_W]! - vhx[0]!) / (DEMAND_W * DT), (vhy[DEMAND_W]! - vhy[0]!) / (DEMAND_W * DT) + G) / G;
        demandAng = Math.abs((vha[DEMAND_W]! - vha[0]!) / (DEMAND_W * DT));
        if (demand > demandG || demandAng > demandA) {
          lastOver = tick;
          row.overDemand++;
        }
      }
    }
    ptx = twx;
    pty = twy;
    pta = twa;
    // the envelope in the chassis frame
    const rel = s.riderBody.angle - s.bike.angle;
    // The shared articulated mass map replaced the old rigid COM-to-hip/chest
    // offsets. Measure the actual physical endpoints used by solveHold, keeping
    // the original reach/support and recovery tolerances unchanged.
    riderRigFromCOM(lx - w.axleOrgX, ly - w.axleOrgY, RIDER_TORSO_REST + rel, geometry);
    const hx = geometry.hips.x + w.axleOrgX;
    const hy = geometry.hips.y + w.axleOrgY;
    const leg = Math.hypot(geometry.hips.x - geometry.ankle.x, geometry.hips.y - geometry.ankle.y);
    const arm = Math.hypot(geometry.shoulders.x - geometry.wrist.x, geometry.shoulders.y - geometry.wrist.y);
    row.riding++;
    row.minHipY = Math.min(row.minHipY, hy);
    row.maxHipX = Math.max(row.maxHipX, hx);
    row.maxLeg = Math.max(row.maxLeg, leg);
    row.maxArm = Math.max(row.maxArm, arm);
    if (hy < h.seatY - SLOP) row.belowSeat++;
    if (hx > h.tankX + SLOP) row.pastTank++;
    if (leg > h.legReach + SLOP) row.legOver++;
    if (arm > h.armReach + SLOP) row.armOver++;
    // the band
    const psiErr = Math.abs(rel - tpsi);
    const com = Math.hypot(lx - tx, ly - ty);
    row.com.push(com);
    const since = tick - lastOver;
    for (let b = 0; b < BUCKETS.length; b++) {
      if (since < BUCKETS[b]!) {
        row.buckets[b]!.push(com);
        break;
      }
    }
    if (com > BAND_COM) row.outCom++;
    row.maxCom = Math.max(row.maxCom, com);
    const db = w.debug();
    const availableDemandG=demandG*db.rider.legFrac;
    if(demand>availableDemandG || demandAng>demandA)lastAvailableOver=tick;
    const sample = { availableDemandG,sinceAvailable:tick-lastAvailableOver,transferBlend:w.F[38], leanEdgeAir:w.F[35], airLimit:w.F[34], tick, since, com, psiErr, demand, demandAng, demandG, demandA, input:f, local:{lx,ly,tx,ty,rel,tpsi}, bike:s.bike, grounded:{rear:s.wheels.rear.grounded,front:s.wheels.front.grounded}, rider:db.rider,suspension:db.suspension};
    row.samples.push(sample);
    if (since >= RECOVER_TICKS && (com > BAND_COM || psiErr > BAND_PSI)) row.bad.push(sample);
    if (since >= RECOVER_TICKS) {
      row.recovered++;
      if (com > BAND_COM || psiErr > BAND_PSI) row.outRecovered++;
      row.maxComRecovered = Math.max(row.maxComRecovered, com);
      row.maxPsiRecovered = Math.max(row.maxPsiRecovered, psiErr);
    }
    if (com > EXCURSION_M) {
      if (excursion === 0) excursionAt = tick;
      excursion++;
    } else endExcursion();
  }
  endExcursion();
  row.finished = sim.phase() === 'finished';
  return row;
}

const rows=[];
for(const g of goldens()) {
 const row=await replay(g.rec,g.file);
 const {samples,com:_com,buckets:_buckets,...summary}=row;
 const availability={recovered:samples.filter(s=>s.sinceAvailable>=60).length,bad:samples.filter(s=>s.sinceAvailable>=60&&(s.com>.15||s.psiErr>.35)).map(s=>({tick:s.tick,com:s.com,psiErr:s.psiErr,sinceAvailable:s.sinceAvailable}))};
 const selected=samples.filter(s=>row.bad.some(b=>s.tick>=b.tick-100&&s.tick<=b.tick+20));
 fs.writeFileSync(new URL('./'+g.file.replace('/','--'),import.meta.url),JSON.stringify({...summary,availability,selected},null,2)+'\n');
 rows.push({...summary,availability,bad:summary.bad.map(({tick,since,com,psiErr,demand,demandAng})=>({tick,since,com,psiErr,demand,demandAng}))});
 console.info(g.file,row.outRecovered,row.maxComRecovered,row.maxPsiRecovered);
}
fs.writeFileSync(new URL('./summary.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');
