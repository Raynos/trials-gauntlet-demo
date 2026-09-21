import fs from 'node:fs';
import { decodeJSON, expandFrames } from '../../../../src/core/replay';
import { createSimFor } from '../../../../harness/lib/sim';
import type { BikePhysicsWorldV2 } from '../../../../src/physics/v2/bike';
const rec=decodeJSON(fs.readFileSync(process.argv[2] ?? 'harness/inputs/b1-first-ride/bot-3.json','utf8')),sim=await createSimFor(rec);
const w=sim.world as BikePhysicsWorldV2 & {F:Float64Array};
const rows=[];let px=NaN,py=NaN,last=-1e9,tick=0;const vx:number[]=[],vy:number[]=[];
for(const input of expandFrames(rec)){
 sim.step(input);tick++;const s=sim.state();if(sim.phase()!=='riding'||!s.riderBody)continue;
 const c=Math.cos(s.bike.angle),sn=Math.sin(s.bike.angle),tx=w.F[6]!,ty=w.F[7]!,wx=s.bike.pos.x+tx*c-ty*sn,wy=s.bike.pos.y+tx*sn+ty*c;
 let demand=0;if(!Number.isNaN(px)){vx.push((wx-px)*120);vy.push((wy-py)*120);if(vx.length>7){vx.shift();vy.shift();}if(vx.length===7){demand=Math.hypot((vx[6]!-vx[0]!)*20,(vy[6]!-vy[0]!)*20+9.81);if(demand>w.tuning.rider.Fmax/w.tuning.rider.mass)last=tick;}}px=wx;py=wy;
 const dx=s.riderBody.pos.x-s.bike.pos.x,dy=s.riderBody.pos.y-s.bike.pos.y,lx=dx*c+dy*sn,ly=-dx*sn+dy*c,com=Math.hypot(lx-tx,ly-ty);
 rows.push({tick,input,since:tick-last,demand,com,local:{lx,ly,tx,ty},s,debug:w.debug()});
}
const bad=rows.filter(r=>r.since>=120&&r.com>.15);const selected=rows.filter(r=>bad.some(b=>Math.abs(b.tick-r.tick)<20));
fs.writeFileSync(process.argv[3] ?? new URL('./recovery-probe.json',import.meta.url),JSON.stringify({bad:bad.map(r=>({tick:r.tick,com:r.com,since:r.since})),selected},null,2)+'\n');
console.info(bad.map(r=>({tick:r.tick,com:r.com,since:r.since,input:r.input,local:r.local,debug:r.debug})));
