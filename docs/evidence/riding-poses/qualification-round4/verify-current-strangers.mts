/** Prove the 12 blind B1-E3 recordings on the final Rockhop track source without restamping their original sessions. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { expandFrames } from '../../../../src/core/replay';
import { createSimFor } from '../../../../harness/lib/sim';
import { BrowserVerifier } from '../../../../harness/lib/verify';
import { loadRecording } from '../../../../harness/lib/recording';
import { freshFingerprint } from '../../../../harness/lib/metrics';

const oldCommit = 'a736a26f';
const newCommit = 'a7ed0716';
const oldStamp = '207404d3';
const expectedStamp = '2249b7bb';
const tracks = ['b1-first-ride', 'b2-lean-back', 'b3-kicker-row', 'e1-uphill-weight', 'e2-rear-wheel-first', 'e3-stairway'];
const output = path.resolve(process.argv[2] ?? 'docs/evidence/riding-poses/qualification-round4/current-source-strangers.json');
if (fs.existsSync(output)) throw new Error(`Refusing to overwrite ${output}`);
const scope = ['src/physics', 'src/tracks', 'src/game/rules.ts', 'src/core/hash.ts', 'src/core/replay.ts', 'src/core/rng.ts', 'src/core/riderGeometry.ts'];
const changed = execFileSync('git', ['diff', '--name-only', `${oldCommit}..${newCommit}`, '--', ...scope], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
if (changed.some(file => !file.startsWith('src/tracks/rockhop/') && file !== 'src/tracks/golden.json')) {
  throw new Error(`A core or B1-E3 source changed: ${changed.join(', ')}`);
}
const startStamp = freshFingerprint();
if (startStamp !== expectedStamp) throw new Error(`Source moved before verification: ${startStamp}`);
const bits = (n: number | null): string | null => {
  if (n === null) return null;
  const b = Buffer.alloc(8); b.writeDoubleLE(n); return b.toString('hex');
};
const hash = (file: string): string => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
// A Vite dev server serves the working-tree simulation directly; it avoids the unrelated
// in-progress store UI bundle budget while Node/browser hashes still prove this physics.
const verifier = new BrowserVerifier({ dev: true });
const rows: Array<{ pass: boolean }> = [];
try {
  for (const track of tracks) {
    const metrics = JSON.parse(fs.readFileSync(`harness/out/metrics/${track}.stranger.json`, 'utf8')) as {
      sessions: Array<{ sessionId: string; status: string; srcFingerprint: string | null; cleared: boolean; strangerAttempts: number; finishTime: number | null; recordingFile: string | null }>;
    };
    const sessions = metrics.sessions.filter(s => s.status === 'done' && s.srcFingerprint === oldStamp);
    if (sessions.length !== 2 || sessions.some(s => !s.cleared || !s.recordingFile)) throw new Error(`${track}: expected two finished blind sessions`);
    for (const s of sessions) {
      const file = s.recordingFile!;
      const rec = loadRecording(file);
      const sim = await createSimFor(rec);
      let faults = 0;
      for (const input of expandFrames(rec)) for (const event of sim.step(input)) if (event.type === 'fault') faults++;
      const browser = await verifier.run(rec);
      const row = {
        track, sessionId: s.sessionId, originalStamp: s.srcFingerprint, verifiedStamp: expectedStamp,
        recording: file, recordingSha256: hash(file), attempts: s.strangerAttempts,
        originalRunClockRounded: s.finishTime, nodeFinishBits: bits(sim.state().finishTime), browserFinishBits: bits(browser.finishTime),
        nodeRunClockBits: bits(sim.runTime()), browserRunClockBits: bits(browser.runTime),
        nodeHash: sim.hash(), browserHash: browser.hash, nodeFaults: faults, browserFaults: browser.faults,
        runClockMatchesOriginalRounded: Number(sim.runTime().toFixed(4)) === s.finishTime,
        pass: sim.phase() === 'finished' && Number(sim.runTime().toFixed(4)) === s.finishTime
          && bits(sim.state().finishTime) === bits(browser.finishTime)
          && bits(sim.runTime()) === bits(browser.runTime)
          && sim.hash() === browser.hash && faults === browser.faults,
      };
      rows.push(row);
      console.log(`${row.pass ? 'PASS' : 'FAIL'} ${track} ${s.sessionId} attempts=${s.strangerAttempts} hash=${sim.hash()}`);
    }
  }
} finally {
  await verifier.close();
}
const endStamp = freshFingerprint();
const report = { oldCommit, newCommit, oldStamp, verifiedStamp: expectedStamp, changedSourceFiles: changed,
  coreAndB1E3SourceUnchanged: true, startStamp, endStamp, rows,
  pass: endStamp === startStamp && rows.length === 12 && rows.every(r => r.pass) };
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(`${report.pass ? 'PASS' : 'FAIL'} ${rows.length}/12 exact Node/browser blind replays; source ${startStamp} -> ${endStamp}`);
if (!report.pass) process.exitCode = 1;
