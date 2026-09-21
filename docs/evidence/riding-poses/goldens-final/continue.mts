import fs from 'node:fs';
import path from 'node:path';
import { expandFrames, InputRecorder } from '../../../../src/core/replay.ts';
import { loadRecording, recordingHeader, saveRecording } from '../../../../harness/lib/recording.ts';
import { createSimFor } from '../../../../harness/lib/sim.ts';
import { srcFingerprint } from '../../../../harness/lib/metrics.ts';
import { playTrack } from '../../../../harness/bot/play.ts';
const [prefixFile,outBase,seconds='240'] = process.argv.slice(2);
if(!prefixFile || !outBase || fs.existsSync(`${outBase}.json`)) throw new Error('prefix.rec.json new-output-base [wallSeconds]');
const prefix=loadRecording(prefixFile); const fp=srcFingerprint();
if(!prefix.header.note?.includes(`src=${fp}`)) throw new Error('Stale prefix');
const sim=await createSimFor(prefix); const frames=expandFrames(prefix); let prefixFaults=0;
for(const frame of frames) for(const event of sim.step(frame)) if(event.type==='fault') prefixFaults++;
const startHash=sim.hash();
const play=playTrack(sim,{skill:3,limits:{maxWallMs:Number(seconds)*1000},log:console.log});
const recorder=new InputRecorder(recordingHeader(sim,`bot skill=3 continued-from=${path.basename(prefixFile)} planner-history-reset=true outcome=${play.outcome}`));
for(const frame of frames) recorder.push(frame);
for(const frame of play.frames) recorder.push(frame);
const rec=recorder.toRecording(); saveRecording(`${outBase}.rec.json`,rec);
const fresh=await createSimFor(rec); let faults=0; let prefixTick=0; const mismatches:number[]=[];
for(const frame of expandFrames(rec)){for(const e of fresh.step(frame)) if(e.type==='fault') faults++; if(prefixTick>=frames.length && fresh.hash()!==play.hashes[prefixTick-frames.length]) mismatches.push(prefixTick);prefixTick++;}
const report={fingerprint:fp,prefixFile,prefixFrames:frames.length,prefixFaults,startHash,outcome:play.outcome,maxX:play.maxX,finishTime:play.finishTime,attempts:1+faults,continuationAttempts:play.attempts,wallMs:play.wallMs,nodeHash:fresh.hash(),playHash:sim.hash(),mismatches,finished:fresh.phase()==='finished',recordingFile:`${outBase}.rec.json`};
fs.writeFileSync(`${outBase}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
if(fp!==srcFingerprint() || mismatches.length || fresh.hash()!==sim.hash()) throw new Error('Replay/source mismatch');
if(report.finished){const target=`harness/inputs/${rec.header.trackId}/bot-3${rec.header.bike==='pro'?'-pro':''}.json`;saveRecording(target,rec);console.log(`SAVED node-only ${target}; requires browser verification`);}
