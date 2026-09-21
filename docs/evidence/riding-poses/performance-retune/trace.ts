import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { decodeJSON, expandFrames } from '../../../../src/core/replay';
import { createSimFor } from '../../../../harness/lib/sim';
const files = ['hero-r15/seated-forward-back.json', 'h2-gap-chain/bot-3.json', 'h2-gap-chain/bot-3-pro.json', 'x3-gauntlet/bot-3.json', 'x3-gauntlet/bot-3-pro.json'];
const rows=[];
for(const file of files){
 const raw=fs.readFileSync('docs/evidence/riding-poses/performance-retune/inputs/'+file,'utf8');
 const rec=decodeJSON(raw); const sim=await createSimFor(rec); const hash=createHash('sha256');let ticks=0;
 for(const frame of expandFrames(rec)){sim.step(frame);hash.update(JSON.stringify(sim.snap()));ticks++;}
 rows.push({file,inputSha256:createHash('sha256').update(raw).digest('hex'),ticks,traceSha256:hash.digest('hex'),stateHash:sim.hash(),time:sim.runTime(),faults:sim.faults()});
}
console.info(JSON.stringify(rows,null,2));
