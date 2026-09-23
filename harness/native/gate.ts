/**
 * The native gate (docs/plans/STORE_RELEASE.md bar 3 + bar 5, harness/native/README.md).
 *
 *   node scripts/store-build.mjs debug --ios --android      # once per bundle change
 *   npx tsx harness/native/gate.ts [web,ios,ipad,android] [--no-clip] [--evidence]
 *
 * Runs the in-app gate runner (src/platform/gate.ts) on each platform — cold boot → start a track on the player's
 * path → every golden recording replayed to its finish → one replayed paced and rendered (the clip) → the crash
 * recording → the restart mash back to control → 20 instant restarts — and compares bar 3: each recording's finish
 * time as the float's own 8 bytes, and the final state hash, identical on web, iOS WKWebView and Android WebView.
 * Checks use harness/gate/thresholds.json (the real-hardware limits; the emulator's software GL reads its timing
 * rows informationally). `--evidence` writes docs/evidence/store-release/native/<stamp>/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../lib/paths';
import { runAndroid } from './android';
import { runIos } from './ios';
import { buildMode, buildSource, compareBar3, EVIDENCE_DIR, messagesFromOut, OUT, stamp, type PlatformRun } from './lib';
import { runWeb } from './web';

const args = process.argv.slice(2);
// Web legs render on the Mac's GPU (the user's load rule, harness/native/README.md): SwiftShader only when asked.
if (process.platform === 'darwin') process.env['TRIALS_BROWSER_BACKEND'] ??= 'metal';
// Android only when named: the emulator is off by the user's rule on this host (harness/native/README.md).
const which = (args.find((a) => !a.startsWith('--')) ?? 'web,ios').split(',');
const record = !args.includes('--no-clip');
const evidence = args.includes('--evidence');
/** Re-report the last runs from harness/out/native/<platform>/ without launching anything. */
const fromOut = args.includes('--from-out');

const thresholds = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'harness', 'gate', 'thresholds.json'), 'utf8')) as Record<string, number | boolean>;
const lim = (k: string): number => Number(thresholds[k]);

interface Check {
  id: string;
  value: unknown;
  limit: unknown;
  pass: boolean;
  informational?: boolean;
  note?: string | undefined;
}

function checks(run: PlatformRun): Check[] {
  const out: Check[] = [];
  const boot = run.messages['boot'] as Record<string, unknown> | undefined;
  const res = run.messages['result'] as Record<string, unknown> | undefined;
  const soft = run.platform === 'android'; // the emulator renders with software GL: timing rows are informational
  out.push({ id: 'gate.completed', value: !!res, limit: true, pass: !!res, note: run.messages['error'] ? String(run.messages['error']['error']) : undefined });
  if (boot) {
    out.push({ id: 'boot.toMenuMs', value: boot['loaderGoneMs'], limit: 'menu', pass: typeof boot['loaderGoneMs'] === 'number', informational: true, note: `cold start → the loader gone over the menu (the whole offline pack is read from the app bundle; hook at ${String(boot['hookMs'])} ms)` });
    out.push({ id: 'start.toRiding', value: boot['startToRidingMs'], limit: 'riding', pass: boot['startToRidingMs'] !== null, note: `app.play('${String(boot['track'])}') through the countdown` });
    out.push({ id: 'silent.audioContexts', value: boot['audioContexts'], limit: 0, pass: boot['audioContexts'] === 0 && boot['webdriver'] === true, note: 'navigator.webdriver under the gate; AudioContexts constructed' });
  }
  if (res) {
    const clear = (res['clear'] ?? []) as { file: string; cleared: boolean; finishTime: number | null }[];
    out.push({ id: 'clear.golden', value: clear.map((c) => `${c.file}: ${c.cleared ? c.finishTime : 'NOT CLEARED'}`).join('; '), limit: 'all cleared', pass: clear.length > 0 && clear.every((c) => c.cleared) });
    const crash = res['crash'] as { fault: { time: number; reason: string } | null; toControlMs: number | null } | null;
    out.push({ id: 'crash.faultWithinS', value: crash?.fault?.time ?? null, limit: lim('crash.faultWithinS'), pass: !!crash?.fault && crash.fault.time <= lim('crash.faultWithinS'), note: crash?.fault?.reason });
    out.push({ id: 'fault.toControlMs', value: crash?.toControlMs ?? null, limit: lim('fault.toControlMs'), pass: crash?.toControlMs != null && crash.toControlMs <= lim('fault.toControlMs') });
    const r = res['restart'] as { ticksOk: boolean; wallMsP95: number; frameMsP95: number; movesAfterTicks: number } | null;
    out.push({ id: 'restart.ticks', value: r?.ticksOk ? 1 : -1, limit: 1, pass: !!r?.ticksOk });
    out.push({ id: 'restart.wallMsP95', value: r?.wallMsP95, limit: lim('restart.wallMsP95'), pass: (r?.wallMsP95 ?? Infinity) <= lim('restart.wallMsP95'), informational: soft });
    out.push({ id: 'restart.frameMsP95', value: r?.frameMsP95, limit: lim('restart.frameMsP95'), pass: (r?.frameMsP95 ?? Infinity) <= lim('restart.frameMsP95'), informational: soft || run.platform === 'web', note: 'restart → synced frame' });
    out.push({ id: 'restart.noCountdown', value: r?.movesAfterTicks, limit: lim('restart.movesWithinTicks'), pass: (r?.movesAfterTicks ?? Infinity) <= lim('restart.movesWithinTicks') });
    out.push({ id: 'silent.audioContexts.harness', value: res['audioContexts'], limit: 0, pass: res['audioContexts'] === 0 });
  }
  return out;
}

async function main(): Promise<void> {
  if (!fromOut && buildMode() !== 'debug') throw new Error(`store/build is a ${buildMode()} bundle: run \`node scripts/store-build.mjs debug --ios --android\``);
  console.info(`native gate: bundle source ${buildSource()}`);
  const runs: PlatformRun[] = [];
  for (const p of which) {
    console.info(`native gate: ${p} …`);
    if (fromOut) {
      const dir = path.join(OUT, p);
      const messages = messagesFromOut(dir);
      const clip = fs.existsSync(path.join(dir, 'clip.mp4')) ? path.join(dir, 'clip.mp4') : null;
      runs.push({ platform: p as PlatformRun['platform'], device: (messages['boot']?.['userAgent'] as string | undefined) ?? p, ok: !!messages['result'] && !messages['error'], messages, clip, wallS: 0, notes: ['from harness/out/native (not re-run)'] });
      continue;
    }
    const run = p === 'web' ? await runWeb() : p === 'ios' ? await runIos({ record }) : p === 'ipad' ? await runIos({ record, ipad: true }) : p === 'android' ? await runAndroid({ record }) : null;
    if (!run) throw new Error(`unknown platform ${p}`);
    runs.push(run);
    console.info(`native gate: ${p} ${run.ok ? 'completed' : 'FAILED'} in ${run.wallS} s${run.notes.length ? ` (${run.notes.join('; ')})` : ''}`);
  }
  const bar3 = compareBar3(runs);
  const report = {
    at: new Date().toISOString(),
    /** The commit the bundle was built from (store/build/SOURCE): a gate run is evidence for that sha only. */
    source: buildSource(),
    runs: runs.map((r) => ({ platform: r.platform, device: r.device, ok: r.ok, wallS: r.wallS, clip: r.clip && path.relative(REPO_ROOT, r.clip), notes: r.notes, checks: checks(r), boot: r.messages['boot'] ?? null, result: r.messages['result'] ?? null })),
    bar3,
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'gate.json'), `${JSON.stringify(report, null, 1)}\n`);
  for (const r of report.runs) {
    console.info(`\n${r.platform} — ${r.device}`);
    for (const c of r.checks) console.info(`  ${c.pass ? 'PASS' : c.informational ? 'info' : 'FAIL'}  ${c.id.padEnd(30)} ${JSON.stringify(c.value)}  (limit ${JSON.stringify(c.limit)})${c.note ? `  ${c.note}` : ''}`);
  }
  console.info('\nbar 3 — finish time (float64 bytes) and state hash per platform');
  for (const row of bar3) {
    const cells = Object.entries(row.byPlatform).map(([p, v]) => `${p} ${v ? `${v.finishTime} [${v.finishTimeHex}] ${v.hash}` : '—'}`);
    console.info(`  ${row.identical ? 'IDENTICAL' : 'DIFFERENT'}  ${row.recording}\n      ${cells.join('\n      ')}`);
  }
  if (evidence) {
    const dir = path.join(EVIDENCE_DIR, stamp());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'gate.json'), `${JSON.stringify(report, null, 1)}\n`);
    for (const r of runs) {
      if (!r.clip) continue;
      fs.copyFileSync(r.clip, path.join(dir, `${r.platform}-clip.mp4`));
      const sheet = path.join(path.dirname(r.clip), 'sheet.jpg');
      if (fs.existsSync(sheet)) fs.copyFileSync(sheet, path.join(dir, `${r.platform}-sheet.jpg`));
    }
    console.info(`\nevidence: ${path.relative(REPO_ROOT, dir)}`);
  }
  const failed = report.runs.flatMap((r) => r.checks.filter((c) => !c.pass && !c.informational)).length + bar3.filter((b) => !b.identical).length;
  process.exitCode = failed ? 1 : 0;
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 2;
});
