import fs from 'node:fs';
import {expandFrames} from '../../../../../src/core/replay';
import {loadRecording} from '../../../../../harness/lib/recording';
import {createSimFor} from '../../../../../harness/lib/sim';
const rec=loadRecording('harness/out/bot/p3-snow-line/20260921-064010-325164-skill3.rec.json'),sim=await createSimFor(rec),rows=[];let i=0;
for(const f of expandFrames(rec)){sim.step(f);i++;const s=sim.state();if(s.bike.pos.x>200&&s.bike.pos.x<244&&i%60===0)rows.push({tick:i,pos:s.bike.pos,vel:s.bike.vel,angle:s.bike.angle,fault:s.faulted,input:f});}
fs.writeFileSync('docs/evidence/riding-poses/qualification-round3/p3-probe/trace.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows.slice(0,40),null,2));console.log(Object.keys(sim.compiled));
