/**
 * Ship gate in one command: cold boot → replay determinism → capture clip →
 * perf. Runs each harness command as a child process so a crash in one is
 * isolated, then prints a summary and exits non-zero if anything failed.
 *
 *   pnpm harness:all [--input harness/inputs/flat-test-clear.json] [--dev]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { flagBool, flagStr, parseArgs } from './lib/args';
import { HARNESS_DIR, OUT_DIR, REPO_ROOT } from './lib/paths';

interface StepResult {
  name: string;
  ok: boolean;
  ms: number;
}

function runStep(name: string, script: string, args: string[]): Promise<StepResult> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    console.log(`\n### ${name}: tsx ${script} ${args.join(' ')}`);
    const child = spawn(path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx'), [path.join(HARNESS_DIR, script), ...args], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
    child.on('close', (code) => resolve({ name, ok: code === 0, ms: performance.now() - t0 }));
    child.on('error', () => resolve({ name, ok: false, ms: performance.now() - t0 }));
  });
}

async function main(): Promise<void> {
  const { flags } = parseArgs();
  const passthrough = [...(flagBool(flags, 'dev') ? ['--dev'] : []), ...(flagBool(flags, 'build') ? ['--build'] : [])];
  const defaultInput = path.join(HARNESS_DIR, 'inputs', 'flat-test-clear.json');
  const input = flagStr(flags, 'input', defaultInput);
  const results: StepResult[] = [];

  if (!fs.existsSync(input)) {
    results.push(await runStep('gen-input', 'gen-input.ts', ['--out', input, '--seconds', '12', '--style', 'throttle']));
  }
  results.push(await runStep('boot', 'boot.ts', [...passthrough, '--runs', '3']));
  results.push(await runStep('replay', 'replay.ts', [input, ...passthrough]));
  results.push(await runStep('capture', 'capture.ts', [input, ...passthrough]));
  results.push(await runStep('perf', 'perf.ts', [...passthrough, '--seconds', '5']));

  console.log('\n### summary');
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(10)} ${(r.ms / 1000).toFixed(1)}s`);
  console.log(`  out: ${OUT_DIR}`);
  if (results.some((r) => !r.ok)) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
