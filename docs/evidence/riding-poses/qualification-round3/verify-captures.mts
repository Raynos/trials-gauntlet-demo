/** Independent production-Game replay of every sampled browser capture state. */
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { decodeJSON, iterateFrames } from '../../../../src/core/replay';
import { createProductionSim } from '../../../../harness/lib/production-sim';
import { srcFingerprint } from '../../../../harness/lib/metrics';
interface Capture { recording:string; recordingSha256:string; trace:{inputTick:number;stateHash:string;stateJson:string;runTime:number;renderedTime:number;stateTime:number}[] }
const [captureDir, output] = process.argv.slice(2);
if (!captureDir || !output || fs.existsSync(output)) throw Error('Capture directory and fresh output path required');
const fingerprint=srcFingerprint(),rows=[];
for(const name of fs.readdirSync(captureDir)){
 const dir=path.join(captureDir,name),plain=path.join(dir,'evidence.json'),gz=plain+'.gz';
 if(!fs.existsSync(plain)&&!fs.existsSync(gz))continue;
 const report=JSON.parse((fs.existsSync(plain)?fs.readFileSync(plain):gunzipSync(fs.readFileSync(gz))).toString()) as Capture;
 const raw=fs.readFileSync(report.recording);
 if(createHash('sha256').update(raw).digest('hex')!==report.recordingSha256)throw Error(`${name}: recording changed`);
 const recording=decodeJSON(raw.toString()),sim=createProductionSim(recording.header.trackId,recording.header.bike,recording.header.seed,recording.header.physicsHz);
 const samples=new Map(report.trace.map(row=>[row.inputTick,row]));let tick=0,checked=0;
 for(const input of iterateFrames(recording)){
  sim.step(input);tick++;const row=samples.get(tick);if(!row)continue;
  if(sim.hash()!==row.stateHash||JSON.stringify(sim.state())!==row.stateJson||!Object.is(sim.runTime(),row.runTime)||row.renderedTime!==row.stateTime)throw Error(`${name}: browser/Node or displayed-time mismatch at ${tick}`);
  checked++;
 }
 if(checked!==samples.size)throw Error(`${name}: missing trace samples`);
 rows.push({capture:name,checked,exactPhysicsHash:true,fullStateJsonEqual:true,runClockIdentical:true,displayTimeIdentical:true});
}
if(srcFingerprint()!==fingerprint)throw Error('Physics changed during verification');
fs.writeFileSync(output,JSON.stringify({fingerprint,rows},null,2)+'\n');console.info('Verified',rows.length,'captures',rows.reduce((n,r)=>n+r.checked,0),'samples');
