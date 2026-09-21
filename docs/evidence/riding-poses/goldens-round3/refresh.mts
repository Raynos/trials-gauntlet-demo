import fs from 'node:fs';
import path from 'node:path';
import { expandFrames } from '../../../../src/core/replay.ts';
import { loadRecording, recordingHeader, saveRecording } from '../../../../harness/lib/recording.ts';
import { createSimFor } from '../../../../harness/lib/sim.ts';
import { srcFingerprint } from '../../../../harness/lib/metrics.ts';
const root='docs/evidence/riding-poses/goldens-round3';
const fingerprint=srcFingerprint();const rows=[];
for(const dir of fs.readdirSync('harness/inputs')) for(const name of ['bot-3.json','bot-3-pro.json']) {
 const file=`harness/inputs/${dir}/${name}`;if(!fs.existsSync(file))continue;
 const before=`${root}/before/${dir}/${name}`;if(fs.existsSync(before))throw new Error('Already backed up');
 fs.mkdirSync(path.dirname(before),{recursive:true});fs.copyFileSync(file,before);
 const rec=loadRecording(file);const sim=await createSimFor(rec);let faults=0;
 for(const f of expandFrames(rec))for(const e of sim.step(f))if(e.type==='fault')faults++;
 const finished=sim.state().finishTime!==null;
 if(finished){rec.header=recordingHeader(sim,'bot skill=3 same-controls-reproved=true');saveRecording(file,rec);}
 rows.push({file,finished,faults,hash:sim.hash(),runTime:sim.runTime(),finishTime:sim.state().finishTime});
}
if(srcFingerprint()!==fingerprint)throw new Error('Source changed');
fs.writeFileSync(`${root}/refresh.json`,JSON.stringify({fingerprint,rows},null,2)+'\n');
console.log(fingerprint,rows.length,rows.filter(r=>r.finished).length);
