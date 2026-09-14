/**
 * Per-round check the parent runs:
 *
 *   pnpm harness:round [--build] [--skill 3] [--seeds 1] [--quick] [--pin] [--tracks flat-test,gap-test,b1-first-ride]
 *
 *   1. bot on flat-test (+ --crash-probe), gap-test, b1-first-ride  -> goldens, out/metrics/<track>.json
 *   2. determinism on the flat-test golden                          -> out/gate/determinism.json
 *   3. ship gate                                                    -> out/metrics/ship-gate.json
 *
 * Each step is a child process so one crash cannot take the others down; the
 * summary lists PASS/FAIL per step and the exit code is the number of failures.
 * `--build` rebuilds dist first (do this after any src change: the gate serves a
 * frozen copy of dist/ and node runs src/ directly).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { flagBool, flagNum, flagStr, parseArgs } from './lib/args';
import { HARNESS_DIR, REPO_ROOT } from './lib/paths';

interface StepResult {
  name: string;
  ok: boolean;
  ms: number;
  code: number | null;
}

function runStep(name: string, script: string, args: string[]): Promise<StepResult> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    console.log(`\n### ${name}: tsx ${script} ${args.join(' ')}`);
    const child = spawn(path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx'), [path.join(HARNESS_DIR, script), ...args], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
    child.on('close', (code) => resolve({ name, ok: code === 0, ms: performance.now() - t0, code }));
    child.on('error', () => resolve({ name, ok: false, ms: performance.now() - t0, code: null }));
  });
}

async function main(): Promise<void> {
  const { flags } = parseArgs();
  const build = flagBool(flags, 'build');
  const skill = String(flagNum(flags, 'skill', 3));
  const seeds = String(flagNum(flags, 'seeds', 1));
  const tracks = flagStr(flags, 'tracks', 'flat-test,gap-test,b1-first-ride').split(',');
  const results: StepResult[] = [];
  const t0 = performance.now();

  for (const [i, track] of tracks.entries()) {
    const args = [track, '--skill', skill, '--seeds', seeds, ...(i === 0 ? ['--crash-probe'] : []), ...(build && i === 0 ? ['--build'] : [])];
    results.push(await runStep(`bot ${track}`, 'bot/bot.ts', args));
  }
  const first = tracks[0]!;
  const golden = [`bot-oracle.json`, `bot-${skill}.json`].map((f) => path.join(HARNESS_DIR, 'inputs', first, f)).find((f) => fs.existsSync(f));
  if (golden) results.push(await runStep('determinism', 'gate/determinism.ts', [golden, '--loads', '3', ...(flagBool(flags, 'pin') ? ['--pin'] : [])]));
  else results.push({ name: 'determinism', ok: false, ms: 0, code: null });
  results.push(
    await runStep('gate', 'gate/ship-gate.ts', [
      '--track',
      first,
      ...(flagBool(flags, 'quick') ? ['--quick'] : []),
      ...(flagBool(flags, 'pin') ? ['--pin'] : []),
    ]),
  );

  console.log('\n### round summary');
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(20)} ${(r.ms / 1000).toFixed(1)}s${r.code && r.code > 1 ? `  (exit ${r.code})` : ''}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`  ${failed === 0 ? 'ROUND OK' : `ROUND: ${failed} step(s) failed`} in ${((performance.now() - t0) / 1000).toFixed(0)}s; metrics under harness/out/metrics/`);
  process.exit(failed);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
