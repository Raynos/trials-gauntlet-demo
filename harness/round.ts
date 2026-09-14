/**
 * Per-round check the parent runs:
 *
 *   pnpm harness:round [--build] [--skill 3] [--seeds 1] [--quick] [--pin] [--tracks flat-test,gap-test,b1-first-ride]
 *
 *   1. bot on flat-test (+ --crash-probe), gap-test, b1-first-ride  -> goldens, out/metrics/<track>.json
 *   2. determinism on the first track's golden                      -> out/gate/determinism.json
 *   3. ship gate                                                    -> out/metrics/ship-gate.json
 *
 * Each step is a child process so one crash cannot take the others down; the
 * summary lists PASS/FAIL per step and the exit code is the number of failures.
 * `--build` rebuilds dist first (do this after any src change: the gate serves a
 * frozen copy of dist/ and node runs src/ directly).
 *
 * `--quick` is the < 6 min profile on this machine: skill 2 (1.5 s plans, commit 2),
 * one seed, a 60 s wall cap per bot run, determinism with 2 page loads, and the gate's
 * own --quick (3 boot samples, 10 s heap). The full profile is skill 3 and unbounded.
 * The golden for the determinism step is chosen by src fingerprint (harness/lib/golden.ts),
 * so a stale file from another physics is never the one under test.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { flagBool, flagNum, flagStr, parseArgs } from './lib/args';
import { chooseGolden } from './lib/golden';
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
  const quick = flagBool(flags, 'quick');
  const skill = String(flagNum(flags, 'skill', quick ? 2 : 3));
  const seeds = String(flagNum(flags, 'seeds', 1));
  const tracks = flagStr(flags, 'tracks', 'flat-test,gap-test,b1-first-ride').split(',');
  const results: StepResult[] = [];
  const t0 = performance.now();
  console.log(`round: profile=${quick ? 'quick' : 'full'} skill=${skill} seeds=${seeds} tracks=${tracks.join(',')}${build ? ' (build first)' : ''}`);

  for (const [i, track] of tracks.entries()) {
    const args = [
      track,
      '--skill',
      skill,
      '--seeds',
      seeds,
      ...(quick ? ['--track-wall-s', '60'] : []),
      ...(i === 0 ? ['--crash-probe'] : []),
      ...(build && i === 0 ? ['--build'] : []),
    ];
    results.push(await runStep(`bot ${track}`, 'bot/bot.ts', args));
  }
  const first = tracks[0]!;
  const golden = chooseGolden(first);
  if (golden && !golden.fresh) console.log(`\nWARNING golden ${path.relative(REPO_ROOT, golden.file)} is not stamped with the working tree's src fingerprint (src=${golden.stamp ?? 'unstamped'}); the bot step above should have refreshed it`);
  if (golden) {
    results.push(await runStep('determinism', 'gate/determinism.ts', [golden.file, '--loads', quick ? '2' : '3', ...(flagBool(flags, 'pin') ? ['--pin'] : [])]));
  } else results.push({ name: 'determinism', ok: false, ms: 0, code: null });
  results.push(await runStep('gate', 'gate/ship-gate.ts', ['--track', first, ...(quick ? ['--quick'] : []), ...(flagBool(flags, 'pin') ? ['--pin'] : [])]));

  console.log('\n### round summary');
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(20)} ${(r.ms / 1000).toFixed(1)}s${r.code && r.code > 1 ? `  (exit ${r.code})` : ''}`);
  const failed = results.filter((r) => !r.ok).length;
  const wallS = (performance.now() - t0) / 1000;
  console.log(`  ${failed === 0 ? 'ROUND OK' : `ROUND: ${failed} step(s) failed`} in ${wallS.toFixed(0)}s (${quick ? 'quick' : 'full'} profile${quick && wallS > 360 ? '; over the 6 min budget' : ''}); metrics under harness/out/metrics/`);
  process.exit(failed);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
