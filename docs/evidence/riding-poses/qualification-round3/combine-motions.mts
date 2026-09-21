import fs from 'node:fs';
import {InputRecorder,iterateFrames,decodeJSON,encodeJSON} from '../../../../src/core/replay';
import {createProductionSim,equalProductionSnapshots} from '../../../../harness/lib/production-sim';
const dir='docs/evidence/riding-poses/qualification-round3/inputs';const rows=[];
for(const cls of ['rookie','pro'] as const){
const hop=decodeJSON(fs.readFileSync(`${dir}/hop-${cls}.json`,'utf8'));
const crash=decodeJSON(fs.readFileSync(`${dir}/crash-restart-${cls}.json`,'utf8'));
const out=new InputRecorder({...hop.header,note:'Actual input-only hop, restart, crash, restart sequence; frozen1255af7f.'});
for(const f of iterateFrames(hop))out.push(f);
out.push({throttle:0,brake:0,lean:0,hop:false,restart:true});
for(const f of iterateFrames(crash))out.push(f);
while(out.frameCount%4)out.push({throttle:0,brake:0,lean:0,hop:false,restart:false});
const rec=out.toRecording(),a=createProductionSim('flat-test',cls),b=createProductionSim('flat-test',cls);let faults=0;const faultReasons:string[]=[];
for(const f of iterateFrames(rec)){for(const e of a.step(f))if(e.type==='fault'){faults++;faultReasons.push(e.reason);}b.step(f);if(!equalProductionSnapshots(a.snap(),b.snap()))throw Error('Replay differs');}
fs.writeFileSync(`${dir}/hop-crash-${cls}.json`,encodeJSON(rec)+'\n');rows.push({cls,ticks:out.frameCount,faults,faultReasons,finalHash:a.hash(),allSnapshotsByteEqual:true});
}fs.writeFileSync(`${dir}/combined-report.json`,JSON.stringify(rows,null,2));console.info(rows);
