import { writeFileSync } from 'node:fs';
import { createBikePhysicsV2 } from '../../../../src/physics/v2/bike';
import { makeTrack } from '../../../../src/physics/testTracks';
import { stepN } from '../../../../src/physics/controllers';
import { quantizeInput } from '../../../../src/core/replay';
const rows=[];
for(const cReb of [350,375,400,425,450])for(const kp of [40000,42000,43000,44000,45000]){
 const over={suspension:{rear:{cReb},front:{cReb}},rider:{kp}};
 const outcomes=[];
 for(const mild of [true,false]){
 const w=createBikePhysicsV2(120,over);w.loadTrack(makeTrack({finishX:1e9}),1,{bike:'pro'});stepN(w,{},60);const s0=w.getState();w.teleport({pos:{x:s0.wheels.rear.pos.x,y:s0.wheels.rear.pos.y+(mild?1:3)},angle:(mild?40:5)*Math.PI/180,vel:{x:mild?10:6,y:mild?-8:0},angVel:mild?2:0});let landed=false,y0=0,rebound=0;
 for(let i=0;i<(mild?120:360);i++){w.step(quantizeInput({throttle:mild?0:.2}));const s=w.getState(),ground=s.wheels.rear.grounded||s.wheels.front.grounded;if(ground&&!landed){landed=true;y0=s.wheels.rear.pos.y;}if(landed)rebound=Math.max(rebound,s.wheels.rear.pos.y-y0);if(s.faulted)break;}
 outcomes.push({mild,fault:w.getState().faulted,cause:w.debug().crashCause,rebound});
 }
 rows.push({cReb,kp,outcomes});}
writeFileSync(new URL('./pro-mild-sweep1.json',import.meta.url),JSON.stringify(rows,null,2));console.log(rows.filter(r=>r.outcomes.every(o=>!o.fault&&(o.mild||o.rebound<.15))));
