/** Fresh production-Game bot attempts, verified from the serialized inputs on two fresh Games.
 * Does not overwrite goldens. Run: pnpm exec tsx harness/hero-play.ts b1-first-ride rookie [wallSeconds] [outputDir]
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [trackId = 'b1-first-ride', bike = 'rookie', wallSeconds = '60', output = 'harness/out/blender/fresh-play'] = process.argv.slice(2);
if (bike !== 'rookie' && bike !== 'pro') throw new Error('Bike must be rookie or pro');
const maxWallMs = Number(wallSeconds) * 1000;
if (!Number.isFinite(maxWallMs) || maxWallMs <= 0) throw new Error('Positive wall budget in seconds required');
async function fingerprint(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function walk(path: string) {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (file.endsWith('.ts') && !file.endsWith('.test.ts')) result[file] = createHash('sha256').update(await readFile(file)).digest('hex');
    }
  }
  for (const path of ['src/core', 'src/game', 'src/physics', 'src/tracks', 'harness/bot', 'harness/lib']) await walk(path);
  for (const path of ['harness/hero-play.ts', 'package.json', 'pnpm-lock.yaml']) result[path] = createHash('sha256').update(await readFile(path)).digest('hex');
  return result;
}
const sources = await fingerprint();
// Stamp files BEFORE loading their executable modules, then reject any change through the run.
const [{ InputRecorder, decodeJSON, encodeJSON, iterateFrames }, { NEUTRAL_INPUT }, { configFor, playTrack }, { createProductionSim, equalProductionSnapshots }] = await Promise.all([
  import('../src/core/replay'), import('../src/core/types'), import('./bot/play'), import('./lib/production-sim'),
]);
const sim = createProductionSim(trackId, bike);
const root = sim.snap();
const branch = Array.from({ length: 240 }, (_, i) => ({ ...NEUTRAL_INPUT, throttle: .6, lean: i < 80 ? -.5 : .5, restart: i === 120 }));
sim.run(branch); const branchFinish = sim.snap();
sim.restore(root); sim.run(branch);
if (!equalProductionSnapshots(branchFinish, sim.snap())) throw new Error('Production branch restoration is not byte-identical');
sim.reload();
// `main`'s bot never reads `Sim.rules` (the production Game owns the rules); the type still lists it.
const result = playTrack(sim as unknown as Parameters<typeof playTrack>[0], { skill: 3, config: { ...configFor(3, 150), width: 16, depth: 24 },
  limits: { maxAttempts: 15, maxSimSeconds: 240, maxWallMs }, log: line => console.log(`${trackId}/${bike}: ${line}`) });
const recorder = new InputRecorder({ version: 1, trackId, bike, seed: 1, physicsHz: 120, physics: 'v2',
  note: 'Fresh production Game search; repeated serialized input verified with full snapshot/counter bytes. See adjacent report for exact solver source hashes.' });
for (const input of result.frames) recorder.push(input);
const serialized = encodeJSON(recorder.toRecording()) + '\n', replay = decodeJSON(serialized);
const a = createProductionSim(trackId, bike), b = createProductionSim(trackId, bike);
const digest = createHash('sha256');
let ticks = 0, replayMismatch: number | null = null, searchMismatch: number | null = null;
for (const input of iterateFrames(replay)) {
  a.step(input); b.step(input);
  const sa = a.snap(), sb = b.snap();
  if (!equalProductionSnapshots(sa, sb) && replayMismatch === null) replayMismatch = ticks + 1;
  if (a.hash() !== result.hashes[ticks] && searchMismatch === null) searchMismatch = ticks + 1;
  digest.update(Buffer.from(sa.physics.f64.buffer, sa.physics.f64.byteOffset, sa.physics.f64.byteLength));
  digest.update(Buffer.from(sa.physics.u8.buffer, sa.physics.u8.byteOffset, sa.physics.u8.byteLength));
  digest.update(JSON.stringify(sa.counters));
  ticks++;
}
const finalEqual = equalProductionSnapshots(sim.snap(), a.snap());
const clockBytes = (value: number | null) => { if (value === null) return null; const bytes = Buffer.alloc(8); bytes.writeDoubleLE(value); return bytes.toString('hex'); };
const sourceUnchanged = JSON.stringify(sources) === JSON.stringify(await fingerprint());
const report = {
  trackId, bike, sourceSha256: sources, sourceUnchanged, outcome: result.outcome, attempts: 1 + a.faults(), faults: a.faults(),
  cleared: a.game.cleared(), maxX: result.maxX, finishX: a.track.finishX, inputTicks: ticks, wallMs: result.wallMs,
  runTime: a.game.runTime(), runTimeBytes: clockBytes(a.game.runTime()), physicsFinishTime: a.game.finishTime(),
  physicsFinishTimeBytes: clockBytes(a.game.finishTime()), counters: a.game.counters(),
  replayMismatch, searchMismatch, finalEqual, repeatedSnapshotSha256: digest.digest('hex'),
  recordingSha256: createHash('sha256').update(serialized).digest('hex'),
  firstFault: result.faults[0] ?? null,
};
await mkdir(output, { recursive: true });
const stem = join(output, `${trackId}-${bike}`);
await writeFile(`${stem}.rec.json`, serialized);
await writeFile(`${stem}.report.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, sourceSha256: undefined }));
if (!sourceUnchanged || replayMismatch !== null || searchMismatch !== null || !finalEqual) throw new Error('Replay or source identity failed; inspect diagnostic report');
