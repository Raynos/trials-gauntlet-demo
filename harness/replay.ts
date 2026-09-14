/**
 * Determinism gate. Loads a recording, replays it in two *fresh page loads*,
 * and asserts the final state hashes and finish times are byte-identical.
 *
 *   pnpm harness:replay <input-file> [--dev] [--runs 2] [--json]
 *
 * Exit code 0 = deterministic, 1 = mismatch or error.
 */
import path from 'node:path';
import { encodeJSON } from '../src/core/replay';
import { flagBool, flagNum, parseArgs } from './lib/args';
import { launchBrowser } from './lib/browser';
import { HookClient, openGame } from './lib/hook';
import { describeRecording, loadRecording } from './lib/recording';
import { ensureOut, fail, printKV, writeJson } from './lib/report';
import { startServer } from './lib/server';

async function main(): Promise<void> {
  const { positional, flags } = parseArgs();
  const inputFile = positional[0];
  if (!inputFile) fail('usage: harness/replay.ts <input-file> [--runs 2]');
  const runs = Math.max(2, flagNum(flags, 'runs', 2));
  const rec = loadRecording(inputFile);
  const json = encodeJSON(rec);
  console.log(`recording: ${describeRecording(rec)}`);

  const server = await startServer({ dev: flagBool(flags, 'dev'), forceBuild: flagBool(flags, 'build') });
  const launched = await launchBrowser({ logConsole: flagBool(flags, 'verbose') });
  try {
    const results: Array<{ hash: string; finishTime: number | null; tick: number; wallMs: number; x: number }> = [];
    for (let i = 0; i < runs; i++) {
      // Fresh page per run so no in-page state can leak between attempts.
      const page = await launched.context.newPage();
      await openGame(page, server.url);
      const hook = new HookClient(page);
      const info = await hook.info();
      if (info.physicsHz !== rec.header.physicsHz) {
        fail(`recording hz ${rec.header.physicsHz} != game hz ${info.physicsHz} (pass ?hz via the page)`);
      }
      const r = await hook.runRecording(json);
      results.push({ hash: r.hash, finishTime: r.state.finishTime, tick: r.state.tick, wallMs: r.wallMs, x: r.state.bike.pos.x });
      await page.close();
    }
    const first = results[0]!;
    const identical = results.every((r) => r.hash === first.hash && r.finishTime === first.finishTime && r.tick === first.tick);
    const report = { input: path.resolve(inputFile), header: rec.header, runs: results, deterministic: identical };
    const outFile = path.join(ensureOut('replay'), `${path.basename(inputFile).replace(/\.[^.]+$/, '')}.json`);
    writeJson(outFile, report);
    if (flagBool(flags, 'json')) console.log(JSON.stringify(report));
    else {
      results.forEach((r, i) =>
        printKV(`run ${i + 1}`, {
          hash: r.hash,
          'finish time (s)': r.finishTime,
          ticks: r.tick,
          'final x': r.x.toFixed(4),
          'replay wall ms': r.wallMs.toFixed(1),
        }),
      );
      console.log(identical ? `DETERMINISTIC: ${runs} runs, hash ${first.hash}` : 'MISMATCH: runs diverged');
      console.log(`report: ${outFile}`);
    }
    if (!identical) process.exitCode = 1;
  } finally {
    await launched.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
