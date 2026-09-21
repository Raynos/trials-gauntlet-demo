import { writeFileSync } from 'node:fs';
import { createBikePhysicsV2 } from '../../../../src/physics/v2/bike';
import { makeTrack } from '../../../../src/physics/testTracks';
import { stepN } from '../../../../src/physics/controllers';
import { quantizeInput } from '../../../../src/core/replay';
const all=[];
for(const kpsi of [2500,1800,1000,500,200,0])for(const cpsi of [180,80,30]) {
const w=createBikePhysicsV2(120,{rider:{kpsi,cpsi}});w.loadTrack(makeTrack({finishX:1e9}),1,{bike:'rookie'});stepN(w,{},60);const s0=w.getState();w.teleport({pos:{x:s0.wheels.rear.pos.x,y:s0.wheels.rear.pos.y+1.5},angle:5*Math.PI/180,vel:{x:6,y:0}});
const ticks=[];
for(let i=0;i<360;i++){w.step(quantizeInput({throttle:.2}));const s=w.getState(),d=w.debug();ticks.push({i,crouch:s.rider.crouch,drawn:s.riderBody!.drawn,com:s.riderBody!.pos,angle:s.bike.angle,vel:s.riderBody!.vel,ground:[s.wheels.rear.grounded,s.wheels.front.grounded],comp:[s.wheels.rear.compression,s.wheels.front.compression],hold:d.rider.hold,force:d.rider.servoForce,torque:d.rider.servoTorque,target:d.poseTarget,fault:s.faulted});if(s.faulted)break;}
all.push({kpsi,cpsi,maxSink:Math.max(...ticks.map(t=>t.crouch)),minTorso:Math.min(...ticks.map(t=>t.drawn!.torso*180/Math.PI)),maxTorso:Math.max(...ticks.map(t=>t.drawn!.torso*180/Math.PI)),minHipY:Math.min(...ticks.map(t=>t.drawn!.hips.y)),maxSeat:Math.max(...ticks.map(t=>t.hold.seatJ)),fault:ticks.at(-1)!.fault,ticks});}
const label=process.env.POSE_LABEL??'baseline';writeFileSync(new URL(`./${label}.json`,import.meta.url),JSON.stringify(all,null,2));console.log(all.map(({ticks: _ticks,...r})=>r));
