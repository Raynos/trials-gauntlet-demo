import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preview } from 'vite';
import { expandFrames, encodeJSON } from '../../../../src/core/replay.ts';
import { loadRecording } from '../../../../harness/lib/recording.ts';
import { createSimFor } from '../../../../harness/lib/sim.ts';
import { freshFingerprint } from '../../../../harness/lib/metrics.ts';
import { webkit } from 'playwright';
import { PAGE_RUN_AS_SRC } from '../../../../harness/lib/hook.ts';

/** Complete recorded clears compared against production simulation in headless WebKit. */
const out = process.argv[2];
const files = process.argv.slice(3);
if (!out || fs.existsSync(out) || !files.length) throw new Error('Supply new output path and recordings');
const buildDir = '/tmp/trials-poses-round3/dist';
const root = process.cwd();
const fingerprint = freshFingerprint();
if (fingerprint !== '1255af7f') throw new Error(`Physics changed: ${fingerprint}`);
const digest = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const buildFiles = fs.readdirSync(buildDir, {recursive:true}).map(String).filter(p => fs.statSync(path.join(buildDir,p)).isFile());
const buildHashes = Object.fromEntries(buildFiles.map(p => [p,digest(path.join(buildDir,p))]));
const server = await preview({root,configFile:path.join(root,'vite.config.ts'),logLevel:'warn',build:{outDir:buildDir},preview:{host:'127.0.0.1',port:0}});
const browserEngine = await webkit.launch({headless:true});
const launched = {browser:browserEngine,close:()=>browserEngine.close()};
const bits = (n: number | null) => { if (n===null) return null; const b=Buffer.alloc(8); b.writeDoubleLE(n); return b.toString('hex'); };
const rows: unknown[] = [];
let failed = false;
try {
 for (const file of files) {
  const rec=loadRecording(file); const sim=await createSimFor(rec); let faults=0;
  for (const f of expandFrames(rec)) for (const e of sim.step(f)) if(e.type==='fault') faults++;
  const ctx=await launched.browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,reducedMotion:'reduce'});
  let browser;
  try {
   const page=await ctx.newPage();
   const url=new URL(server.resolvedUrls!.local[0]!);url.searchParams.set('harness','1');
   await page.goto(url.toString(),{waitUntil:'commit'});
   await page.waitForFunction(()=>window.__trials?.ready===true,undefined,{timeout:60000});
   await page.evaluate(PAGE_RUN_AS_SRC);
   browser=await page.evaluate(json => {
    const t=window.__trials!; t.drainEvents();
    const state=(window.__trialsRunAs ?? t.runRecording)(json);
    return {hash:t.hashState(),finishTime:state.finishTime,runTime:t.runTime(),faults:t.faults()};
   },encodeJSON(rec));
  } finally {await ctx.close();}
  const fresh=rec.header.note?.includes(`src=${fingerprint}`) ?? false;
  const nodeFinish=sim.state().finishTime; const nodeRunTime=sim.runTime();
  const passed=fresh && nodeFinish!==null && sim.hash()===browser.hash && bits(nodeFinish)===bits(browser.finishTime) && bits(nodeRunTime)===bits(browser.runTime) && faults===browser.faults;
  failed ||= !passed;
  const row={file,sha256:digest(file),fresh,passed,nodeHash:sim.hash(),browserHash:browser.hash,nodeFinish,browserFinish:browser.finishTime,nodeRunTime,browserRunTime:browser.runTime,nodeFinishBits:bits(nodeFinish),browserFinishBits:bits(browser.finishTime),nodeRunTimeBits:bits(nodeRunTime),browserRunTimeBits:bits(browser.runTime),nodeFaults:faults,browserFaults:browser.faults};
  rows.push(row); console.log(JSON.stringify(row));
  fs.writeFileSync(out,JSON.stringify({fingerprint,buildDir,buildHashes,rows},null,2)+'\n');
 }
} finally {
 await launched.close();
 await new Promise<void>((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve()));
}
if(freshFingerprint()!==fingerprint) throw new Error('Physics changed during verification');
if(buildFiles.some(p=>digest(path.join(buildDir,p))!==buildHashes[p])) throw new Error('Frozen build changed during verification');
process.exitCode=failed?1:0;
