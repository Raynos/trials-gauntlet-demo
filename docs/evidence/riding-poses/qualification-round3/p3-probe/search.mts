import fs from 'node:fs';
import {expandFrames,InputRecorder,quantizeInput,encodeJSON} from '../../../../../src/core/replay';
import {loadRecording,recordingHeader} from '../../../../../harness/lib/recording';
import {createSimFor} from '../../../../../harness/lib/sim';
const dir=process.argv[2]??'docs/evidence/riding-poses/qualification-round3/p3-probe';
fs.mkdirSync(dir,{recursive:true});
const rec=loadRecording('harness/out/bot/p3-snow-line/20260921-064010-325164-skill3.rec.json'),sim=await createSimFor(rec),prefix=[];
for(const f of expandFrames(rec)){sim.step(f);prefix.push(f);if(sim.state().bike.pos.x>=196&&!sim.state().faulted)break;}
const root=sim.snap(),rows=[];let bestX=-Infinity,success=false;
outer:for(const speed of [6,8,10,12])for(const throttle of [.35,.6,1])for(const target of [0,.15,.3,.5,.75])for(const kp of [1,2,4])for(const kd of [.2,.5,1]){
 sim.restore(root);const controls=[];let maxX=sim.state().bike.pos.x,fault=null;
 for(let tick=0;tick<2400;tick++){
  const b=sim.state().bike;
  const f=quantizeInput({throttle:b.vel.x>speed?0:throttle,brake:b.vel.x>speed+2?.25:0,lean:Math.max(-1,Math.min(1,(b.angle-target)*kp+b.angVel*kd))});
  sim.step(f);controls.push(f);const s=sim.state();maxX=Math.max(maxX,s.bike.pos.x);if(s.faulted){fault=s.faulted;break;}if(s.bike.pos.x>255){success=true;break;}
 }
 rows.push({speed,throttle,target,kp,kd,maxX,fault,ticks:controls.length,hash:sim.hash()});
 const candidate=new InputRecorder(recordingHeader(sim,'Reproducible input-only PD diagnostic candidate from real skill3 prefix.'));for(const f of prefix)candidate.push(f);for(const f of controls)candidate.push(f);
 fs.writeFileSync(`${dir}/candidate-${rows.length}.rec.json`,encodeJSON(candidate.toRecording())+'\n');
 if(maxX>bestX){bestX=maxX;const output=new InputRecorder(recordingHeader(sim,'Input-only PD diagnostic branch from real skill3 prefix; not a pure skill3 search.'));for(const f of prefix)output.push(f);for(const f of controls)output.push(f);fs.writeFileSync(`${dir}/best-prefix.rec.json`,encodeJSON(output.toRecording())+'\n');console.log(JSON.stringify(rows.at(-1)));}
 if(success)break outer;
}
fs.writeFileSync(`${dir}/search.json`,JSON.stringify({prefixTicks:prefix.length,success,bestX,rows},null,2)+'\n');
