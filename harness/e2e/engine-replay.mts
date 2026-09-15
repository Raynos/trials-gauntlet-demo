/** Compare every raw production snapshot and complete Game counters in Node, V8 and JSC.
 * CPU-only headless browser harness; this is not a GPU, performance or actual-iOS check.
 * Usage: tsx harness/e2e/engine-replay.mts output-directory recording.json [...recording.json]
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright';
import { decodeJSON, iterateFrames, type InputRecording } from '../../src/core/replay';
import { createProductionSim } from '../lib/production-sim';

interface Row { raw: string; counters: string }
interface ProbeWindow extends Window { replayProbe(recording: InputRecording): Row[] }
const [out, ...inputs] = process.argv.slice(2);
if (!out || !inputs.length) throw new Error('output-directory and at least one recording required');
await mkdir(out, { recursive: false });
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve('vite'))('esbuild') as {
  build(options: Record<string, unknown>): Promise<{ outputFiles: { text: string }[]; metafile: { inputs: Record<string, unknown> } }>;
};
const entry = `import { createProductionSim } from './harness/lib/production-sim';
import { iterateFrames } from './src/core/replay';
globalThis.replayProbe = recording => {
 const sim = createProductionSim(recording.header.trackId, recording.header.bike ?? 'rookie', recording.header.seed, recording.header.physicsHz), rows = [];
 for (const input of iterateFrames(recording)) {
  sim.step(input); const s = sim.snap();
  const f64 = new Uint8Array(s.physics.f64.buffer, s.physics.f64.byteOffset, s.physics.f64.byteLength);
  rows.push({raw: btoa(String.fromCharCode(...f64, ...s.physics.u8)), counters: JSON.stringify(s.counters, (_k,v) => Object.is(v,-0) ? {negativeZero:true} : v)});
 }
 return rows;
};`;
const result = await esbuild.build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', metafile: true });
const code = result.outputFiles[0]!.text;
const sha = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const sources = Object.keys(result.metafile.inputs).filter(p => p !== '<stdin>');
sources.push('harness/e2e/engine-replay.mts');
async function fingerprint(): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all(sources.map(async p => [p, sha(await readFile(p))])));
}
const sourceSha256 = await fingerprint();
await writeFile(`${out}/physics.js`, code);
const recordings = await Promise.all(inputs.map(async path => {
  const bytes = await readFile(path), recording = decodeJSON(bytes.toString());
  assert.equal(recording.header.version, 1); assert.equal(recording.header.physics, 'v2');
  assert.equal(recording.header.physicsHz, 120);
  return { path: resolve(path), sha256: sha(bytes), recording };
}));
const nodeRows = recordings.map(({ recording }) => {
  const sim = createProductionSim(recording.header.trackId, recording.header.bike ?? 'rookie', recording.header.seed, recording.header.physicsHz);
  const rows: Row[] = [];
  for (const input of iterateFrames(recording)) {
    sim.step(input); const s = sim.snap();
    rows.push({ raw: Buffer.concat([Buffer.from(s.physics.f64.buffer, s.physics.f64.byteOffset, s.physics.f64.byteLength), Buffer.from(s.physics.u8)]).toString('base64'),
      counters: JSON.stringify(s.counters, (_key: string, value: unknown) => Object.is(value, -0) ? { negativeZero: true } : value) });
  }
  return rows;
});
const rows: { browser: string; browserVersion: string; input: string; inputSha256: string; ticks: number; allRawBytesAndCountersEqual: boolean; firstDifference: unknown; reportSha256: string }[] = [];
for (const [name, type] of [['chromium', chromium], ['webkit', webkit]] as const) {
  const browser = await type.launch({ headless: true });
  try {
    for (let i = 0; i < recordings.length; i++) {
      const input = recordings[i]!, expected = nodeRows[i]!, page = await browser.newPage();
      await page.addScriptTag({ content: code });
      const actual = await page.evaluate(recording => (window as unknown as ProbeWindow).replayProbe(recording), input.recording);
      assert.equal(actual.length, expected.length);
      const first = expected.findIndex((row, tick) => row.raw !== actual[tick]!.raw || row.counters !== actual[tick]!.counters);
      const bytes = JSON.stringify(actual);
      await writeFile(`${out}/${name}-${i}.json`, bytes);
      rows.push({ browser: name, browserVersion: browser.version(), input: input.path, inputSha256: input.sha256,
        ticks: actual.length, allRawBytesAndCountersEqual: first < 0,
        firstDifference: first < 0 ? null : { inputTick: first + 1, node: expected[first], browser: actual[first] }, reportSha256: sha(bytes) });
      await page.close();
    }
  } finally { await browser.close(); }
}
const sourceUnchanged = JSON.stringify(sourceSha256) === JSON.stringify(await fingerprint());
const report = { method: 'Every float64 byte, uint8 byte and complete Game counter compared directly against Node at every recorded tick; negative zero retained.',
  scope: 'Headless desktop V8 and JavaScriptCore; not actual iOS', nodeVersion: process.version, compiledSha256: sha(code), sourceSha256, sourceUnchanged, rows };
await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ sourceUnchanged, rows: rows.map(({ firstDifference, ...row }) => ({ ...row, firstDifferenceInputTick: firstDifference ? (firstDifference as { inputTick: number }).inputTick : null })) }));
assert(sourceUnchanged, 'source changed during the replay comparison');
assert(rows.every(row => row.allRawBytesAndCountersEqual), 'cross-engine raw replay differs; see report');
