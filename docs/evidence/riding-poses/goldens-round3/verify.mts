import fs from 'node:fs';
import crypto from 'node:crypto';
import { expandFrames, encodeJSON } from '../../../../src/core/replay.ts';
import { loadRecording } from '../../../../harness/lib/recording.ts';
import { createSimFor } from '../../../../harness/lib/sim.ts';
import { srcFingerprint } from '../../../../harness/lib/metrics.ts';
import { preview } from 'vite';
import { launchBrowser } from '../../../../harness/lib/browser.ts';
import { openGame } from '../../../../harness/lib/hook.ts';
const out = process.argv[2];
if (!out || fs.existsSync(out)) throw new Error('Supply a new output JSON path');
const requested = process.argv.slice(3);
const files = requested.length ? requested : fs.readdirSync('harness/inputs').flatMap(dir => ['bot-3.json','bot-3-pro.json'].map(n => `harness/inputs/${dir}/${n}`)).filter(f => fs.existsSync(f));
const fp = srcFingerprint();
const server = await preview({configFile:false,build:{outDir:'/tmp/trials-poses-round3/dist'},preview:{host:'127.0.0.1',port:0}});
const launched = await launchBrowser();
const verifier={
 async run(rec: ReturnType<typeof loadRecording>) {
  const context=await launched.browser.newContext({viewport:{width:1280,height:720},reducedMotion:'reduce'});
  const page=await context.newPage();
  try {
   await openGame(page,server.resolvedUrls!.local[0]!);
   return await page.evaluate(j=>{
    const t=window.__trials!;t.drainEvents();
    const state=(window.__trialsRunAs??t.runRecording)(j);
    return {hash:t.hashState(),finishTime:state.finishTime,runTime:t.runTime(),faults:t.faults()};
   },encodeJSON(rec));
  }finally{await context.close();}
 },
 async close(){await launched.close();await new Promise<void>((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve()));}
};
const rows: unknown[] = [];
const bits = (n: number | null) => { if (n === null) return null; const b=Buffer.alloc(8); b.writeDoubleLE(n); return b.toString('hex'); };
let failed = false;
try {
 for (const file of files) {
  const rec = loadRecording(file); const sim = await createSimFor(rec); let faults=0;
  for (const f of expandFrames(rec)) for (const e of sim.step(f)) if (e.type === 'fault') faults++;
  const nodeFinish = sim.state().finishTime;
  const nodeRunTime = sim.runTime();
  const browser = await verifier.run(rec);
  const sameHash = sim.hash() === browser.hash;
  const sameFinishBits = bits(nodeFinish) === bits(browser.finishTime);
  const fresh = rec.header.note?.includes(`src=${fp}`) ?? false;
  const sameRunTimeBits = bits(nodeRunTime) === bits(browser.runTime);
  const passed = fresh && nodeFinish !== null && sameHash && sameFinishBits && sameRunTimeBits && faults === browser.faults;
  failed ||= !passed;
  const row = {file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),fresh,passed,nodeHash:sim.hash(),browserHash:browser.hash,nodeFinish,browserFinish:browser.finishTime,nodeRunTime,browserRunTime:browser.runTime,nodeRunTimeBits:bits(nodeRunTime),browserRunTimeBits:bits(browser.runTime),nodeFinishBits:bits(nodeFinish),browserFinishBits:bits(browser.finishTime),nodeFaults:faults,browserFaults:browser.faults};
  rows.push(row); console.log(JSON.stringify(row));
  fs.writeFileSync(out,JSON.stringify({fingerprint:fp,rows},null,2)+'\n');
 }
} finally { await verifier.close(); }
if (srcFingerprint() !== fp) throw new Error('Simulation changed during verification');
process.exitCode = failed ? 1 : 0;
