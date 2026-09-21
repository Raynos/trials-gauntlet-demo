import fs from 'node:fs';
import { decodeJSON,expandFrames } from '../../../../../src/core/replay';
import { createSimFor } from '../../../../../harness/lib/sim';
import type { BikePhysicsWorldV2 } from '../../../../../src/physics/v2/bike';
const rec=decodeJSON(fs.readFileSync('harness/inputs/m1-hop-up/bot-3.json','utf8'));
const frames=[...expandFrames(rec)], origin=await createSimFor(rec);
for(let i=0;i<3840;i++)origin.step(frames[i]!);
const snap=origin.snap(),rows=[];
for(const mode of ['baseline','cap-disabled','target-stays-air-rate']){
 const sim=await createSimFor(rec);sim.restore(snap);
 const w=sim.world as BikePhysicsWorldV2 & {F:Float64Array};
 if(mode==='cap-disabled')w.tuning.rider.servoMinFrac=1;
 if(mode==='target-stays-air-rate')w.tuning.rider.targetRateLin=w.tuning.rider.airRateLin;
 const samples=[];
 for(let i=3840;i<3930;i++){
  sim.step(frames[i]!);const s=sim.state(),db=w.debug();
  const c=Math.cos(s.bike.angle),sn=Math.sin(s.bike.angle),dx=s.riderBody!.pos.x-s.bike.pos.x,dy=s.riderBody!.pos.y-s.bike.pos.y;
  samples.push({tick:i+1,com:Math.hypot(dx*c+dy*sn-w.F[6]!, -dx*sn+dy*c-w.F[7]!),legFrac:db.rider.legFrac,intent:db.rider.intent,force:Math.hypot(db.rider.servoForce.x,db.rider.servoForce.y),grounded:s.wheels.rear.grounded,phase:sim.phase(),leanEdgeAir:w.F[35],transferBlend:w.F[38]});
 }
 rows.push({mode,maxCom:Math.max(...samples.map(s=>s.com)),badTicks:samples.filter(s=>s.com>.15).length,samples});
}
fs.writeFileSync(new URL('./counterfactual.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');
console.info(rows.map(({samples:_samples,...r})=>r));
