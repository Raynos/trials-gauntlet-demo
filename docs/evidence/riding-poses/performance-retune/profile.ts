import { createBikePhysicsV2 } from '../../../../src/physics/v2/bike';
import { makeTrack } from '../../../../src/physics/testTracks';
import { stepN } from '../../../../src/physics/controllers';
for(let run=0;run<1500;run++) {
 const w=createBikePhysicsV2(120); w.loadTrack(makeTrack({finishX:1e9}),1,{bike:'rookie'});stepN(w,{},60);
 const s=w.getState();w.teleport({pos:{x:s.wheels.rear.pos.x,y:s.wheels.rear.pos.y+3},angle:0,vel:{x:8,y:0}});
 for(let i=0;i<360;i++)w.step({throttle:i>200?.5:0,brake:0,lean:i<40?-1:i<120?.5:0,restart:false});
}
