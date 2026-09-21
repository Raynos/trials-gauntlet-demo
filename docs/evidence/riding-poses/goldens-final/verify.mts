import fs from 'node:fs';
import crypto from 'node:crypto';
import { expandFrames } from '../../../../src/core/replay.ts';
import { loadRecording } from '../../../../harness/lib/recording.ts';
import { createSimFor } from '../../../../harness/lib/sim.ts';
import { srcFingerprint } from '../../../../harness/lib/metrics.ts';
import { BrowserVerifier } from '../../../../harness/lib/verify.ts';
const out = process.argv[2];
if (!out || fs.existsSync(out)) throw new Error('Supply a new output JSON path');
const requested = process.argv.slice(3);
const files = requested.length ? requested : fs.readdirSync('harness/inputs').flatMap(dir => ['bot-3.json','bot-3-pro.json'].map(n => `harness/inputs/${dir}/${n}`)).filter(f => fs.existsSync(f));
const fp = srcFingerprint();
const verifier = new BrowserVerifier();
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
