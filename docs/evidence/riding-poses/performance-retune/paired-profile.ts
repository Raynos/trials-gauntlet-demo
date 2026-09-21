// Diagnostic pair, not the unchanged R3/R5 gate. Source copies have absolute imports.
import { createBikePhysicsV2 as baseline } from '/tmp/bike-perf-baseline';
import { createBikePhysicsV2 as retained } from '/tmp/bike-perf-retained';
import { makeTrack } from '../../../../src/physics/testTracks';
import { stepN } from '../../../../src/physics/controllers';
const track=makeTrack({finishX:1e9});
function batch(factory:typeof baseline) {
 let us=0;
 for(let run=0;run<100;run++){
 const w=factory(120);w.loadTrack(track,1,{bike:'rookie'});stepN(w,{},60);
 const s=w.getState();w.teleport({pos:{x:s.wheels.rear.pos.x,y:s.wheels.rear.pos.y+3},angle:0,vel:{x:8,y:0}});
 const start=performance.now();for(let i=0;i<360;i++)w.step({throttle:i>200?.5:0,brake:0,lean:i<40?-1:i<120?.5:0,restart:false});us+=(performance.now()-start)*1000;
 } return us/36000;
}
const rows=[];for(let i=0;i<12;i++){const order=i%2?[['retained',retained],['baseline',baseline]] as const:[['baseline',baseline],['retained',retained]] as const;for(const [name,f]of order)rows.push({round:i,warmup:i<2,name,meanUs:batch(f)});}console.info(JSON.stringify(rows,null,2));
