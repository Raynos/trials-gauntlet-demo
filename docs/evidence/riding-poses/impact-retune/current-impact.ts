import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createBikePhysicsV2 } from '../../../../src/physics/v2/bike';
import { makeTrack } from '../../../../src/physics/testTracks';
import { stepN } from '../../../../src/physics/controllers';
import { quantizeInput } from '../../../../src/core/replay';
const rows=[];
for(const bike of ['rookie','pro'] as const)for(const height of [1.5,3]){
const w=createBikePhysicsV2(120);w.loadTrack(makeTrack({finishX:1e9}),1,{bike});stepN(w,{},60);const s0=w.getState();const teleport={pos:{x:s0.wheels.rear.pos.x,y:s0.wheels.rear.pos.y+height},angle:5*Math.PI/180,vel:{x:6,y:0}};w.teleport(teleport);
const ticks=[];let maxSink=0,minTorso=Infinity,minHipY=Infinity;
for(let i=0;i<360;i++){const input=quantizeInput({throttle:.2});w.step(input);const state=w.getState(),debug=w.debug();ticks.push({i,input,state,debug});maxSink=Math.max(maxSink,state.rider.crouch);minTorso=Math.min(minTorso,state.riderBody!.drawn!.torso);minHipY=Math.min(minHipY,state.riderBody!.drawn!.hips.y);if(state.faulted)break;}
rows.push({bike,height,teleport,tuning:w.tuning,summary:{maxSink,comSinkM:maxSink*.3,minTorsoDegrees:minTorso*180/Math.PI,minHipY,fault:ticks.at(-1)!.state.faulted},ticks});}
const label=process.env.POSE_LABEL;if(!label)throw new Error('Set a unique POSE_LABEL to preserve earlier evidence');writeFileSync(new URL(`./${label}.json.gz`,import.meta.url),gzipSync(JSON.stringify(rows)));writeFileSync(new URL(`./${label}-summary.json`,import.meta.url),JSON.stringify(rows.map(({ticks: _ticks,...r})=>r),null,2)+'\n');console.log(rows.map(({bike,height,summary})=>({bike,height,...summary})));
