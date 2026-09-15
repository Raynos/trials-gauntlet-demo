/**
 * Determinism gate (harness-metrics.md §6).
 *
 *   pnpm harness:determinism <recording> [--loads 3] [--pin] [--tail-s 3] [--dev] [--build]
 *
 *   --tail-s N  append N s of full-throttle / full-lean frames after the recording's last
 *               tick: a golden ends on the finish tick, so this is what proves the
 *               post-finish coast (throttle 0 / lean 0 / quantised brake ramp, post-line
 *               fault undone and frozen — `Game.stepFinishCoast`) is mirrored in node
 *               (`harness/lib/rules.ts`). The finished game must ignore the appended input.
 *
 *   D1  cross-load       same recording in N fresh page loads: identical hash / finishTime / tick
 *   D2  cross-encoding   .json vs .bin decode to identical frames and hash (node)
 *   D3  node vs browser  createSim().run(rec).hash == browser hash (the bot's whole premise)
 *   D4  snapshot (node)  run k, snap, run m == restore, run m; also via the base64 hook encoding
 *   D4b snapshot (page)  hook.snapshot()/restore(b64) round trip
 *   D5  chunking         step(1)×N == step(n) chunks == runRecording (browser)
 *   D7  no state leak    load other seed, run 600, then the recording -> same hash as cold
 *   D8  pinned hash      1200-tick canonical run hash == gate/expected.json (pinned on first run)
 *
 * On a D3 mismatch the tool bisects to the first divergent tick and prints
 * the differing state paths. Output harness/out/gate/determinism.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { InputRecorder, decodeBinary, encodeBinary, encodeJSON, expandFrames, frameCount, quantizeInput, type InputRecording } from '../../src/core/replay';
import type { InputFrame, PhysicsState } from '../../src/core/types';
import { decodeSnapshot, encodeSnapshot } from '../../src/game/hook';
import { flagBool, flagNum, parseArgs } from '../lib/args';
import { closeIsolated, isolatedPage } from '../lib/browser';
import { openGame } from '../lib/hook';
import { diffState, runMeta } from '../lib/metrics';
import { HARNESS_DIR } from '../lib/paths';
import { loadRecording } from '../lib/recording';
import { ensureOut, writeJson } from '../lib/report';
import type { DeterminismCheck, DeterminismReport } from '../lib/schema';
import { createSimFor } from '../lib/sim';
import { synthesizeRecording } from '../lib/synth';
import { BrowserVerifier } from '../lib/verify';

export const EXPECTED_FILE = path.join(HARNESS_DIR, 'gate', 'expected.json');

export interface ExpectedEntry {
  golden?: { file: string; finishTime: number | null; hash: string; ticks: number; physics: string };
  canonical1200?: { hash: string; physics: string };
}
export type Expected = Record<string, ExpectedEntry>;

/** `expected.json` key: `<trackId>` for Rookie (unchanged from every earlier pin), `<trackId>:pro` for Pro. */
export function expectedKey(trackId: string, bike?: string | undefined): string {
  return bike && bike !== 'rookie' ? `${trackId}:${bike}` : trackId;
}

export function loadExpected(): Expected {
  if (!fs.existsSync(EXPECTED_FILE)) return {};
  return JSON.parse(fs.readFileSync(EXPECTED_FILE, 'utf8')) as Expected;
}
export function saveExpected(e: Expected): void {
  writeJson(EXPECTED_FILE, e);
}

interface BrowserRunResult {
  hash: string;
  finishTime: number | null;
  tick: number;
  state: PhysicsState;
}

async function runInPage(page: Page, json: string): Promise<BrowserRunResult> {
  return page.evaluate((j) => {
    const t = window.__trials!;
    const state = (window.__trialsRunAs ?? t.runRecording)(j);
    return { hash: t.hashState(), finishTime: state.finishTime, tick: state.tick, state };
  }, json);
}

/** Per-tick browser hashes over [from, to) of the recording (fresh load of the track first). */
async function pageHashesRange(page: Page, rec: InputRecording, every: number, to: number): Promise<string[]> {
  const frames = expandFrames(rec).slice(0, to);
  return page.evaluate(
    ([fr, ev, id, seed, bike]) => {
      const t = window.__trials!;
      if (t.setBike) t.setBike(bike);
      t.loadTrack(id, seed);
      const out: string[] = [];
      for (let i = 0; i < fr.length; i++) {
        t.setInput(fr[i]!);
        t.step(1);
        if ((i + 1) % ev === 0) out.push(t.hashState());
      }
      return out;
    },
    [frames, every, rec.header.trackId, rec.header.seed, rec.header.bike ?? 'rookie'] as const,
  );
}

async function bisectNodeVsBrowser(page: Page, rec: InputRecording): Promise<{ firstDivergentTick: number; diffPaths: string[] }> {
  const frames = expandFrames(rec);
  const n = frames.length;
  const sim = await createSimFor(rec);
  const nodeHashes: string[] = [];
  const nodeStates: PhysicsState[] = [];
  for (let i = 0; i < n; i++) {
    sim.step(frames[i]!);
    nodeHashes.push(sim.hash());
    nodeStates.push(sim.state());
  }
  const every = 60;
  const coarse = await pageHashesRange(page, rec, every, n);
  let bucket = -1;
  for (let b = 0; b < coarse.length; b++) {
    if (coarse[b] !== nodeHashes[(b + 1) * every - 1]) {
      bucket = b;
      break;
    }
  }
  const from = bucket < 0 ? Math.floor(n / every) * every : bucket * every;
  const to = Math.min(n, from + every);
  const fine = await pageHashesRange(page, rec, 1, to);
  let first = -1;
  for (let i = from; i < to; i++) {
    if (fine[i] !== nodeHashes[i]) {
      first = i;
      break;
    }
  }
  if (first < 0) return { firstDivergentTick: -1, diffPaths: ['<no per-tick divergence found; final hash differs — check drainEvents/post-run state>'] };
  const browserState = await page.evaluate(
    ([fr, id, seed, upto, bike]) => {
      const t = window.__trials!;
      if (t.setBike) t.setBike(bike);
      t.loadTrack(id, seed);
      for (let i = 0; i <= upto; i++) {
        t.setInput(fr[i]!);
        t.step(1);
      }
      return t.getState();
    },
    [frames.slice(0, first + 1), rec.header.trackId, rec.header.seed, first, rec.header.bike ?? 'rookie'] as const,
  );
  return { firstDivergentTick: first, diffPaths: diffState(nodeStates[first], browserState) };
}

/** The recording plus `seconds` of full-throttle / full-lean frames (the noisiest legal input) after its last tick. */
export function withTail(rec: InputRecording, seconds: number): InputRecording {
  const n = Math.round(seconds * rec.header.physicsHz);
  if (n <= 0) return rec;
  const r = new InputRecorder({ ...rec.header, note: `${rec.header.note ?? ''} tail=${seconds}s`.trim() });
  for (const f of expandFrames(rec)) r.push(f);
  const tail = quantizeInput({ throttle: 1, brake: 0, lean: 1, hop: false, restart: false });
  for (let i = 0; i < n; i++) r.push(tail);
  return r.toRecording();
}

export interface DeterminismOptions {
  loads?: number;
  pin?: boolean;
  verifier: BrowserVerifier;
  log?: (line: string) => void;
}

export async function runDeterminism(rec: InputRecording, recordingFile: string, o: DeterminismOptions): Promise<DeterminismReport> {
  const started = new Date();
  const log = o.log ?? ((l: string) => console.log(l));
  const loads = Math.max(2, o.loads ?? 3);
  const checks: DeterminismCheck[] = [];
  const json = encodeJSON(rec);
  const frames = expandFrames(rec);
  const { server, launched } = await o.verifier.open();
  const push = (c: DeterminismCheck): void => {
    checks.push(c);
    log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.id.padEnd(4)} ${c.name.padEnd(18)} ${c.hashes.slice(0, 3).join(' ')}${c.note ? `  (${c.note})` : ''}`);
  };

  // D1 cross-load
  const loadsRes: BrowserRunResult[] = [];
  for (let i = 0; i < loads; i++) {
    const page = await isolatedPage(launched);
    await openGame(page, server.url);
    loadsRes.push(await runInPage(page, json));
    await closeIsolated(page);
  }
  const first = loadsRes[0]!;
  push({
    id: 'D1',
    name: 'cross-load',
    pass: loadsRes.every((r) => r.hash === first.hash && r.finishTime === first.finishTime && r.tick === first.tick),
    hashes: loadsRes.map((r) => r.hash),
    note: `${loads} loads, finish=${first.finishTime}`,
  });

  // D2 cross-encoding (node)
  // The binary layout carries no bike field (src/core/replay.ts): D2 is a frame-encoding check, so the class is carried over.
  const viaBin = decodeBinary(encodeBinary(rec));
  if (rec.header.bike) viaBin.header.bike = rec.header.bike;
  const simA = await createSimFor(rec);
  const simB = await createSimFor(viaBin);
  const hA = simA.run(frames).hash;
  const hB = simB.run(expandFrames(viaBin)).hash;
  push({ id: 'D2', name: 'cross-encoding', pass: hA === hB && frameCount(viaBin) === frames.length, hashes: [hA, hB] });

  // D3 node vs browser
  let d3: DeterminismCheck = { id: 'D3', name: 'node-vs-browser', pass: hA === first.hash, hashes: [hA, first.hash], note: `physics=${simA.physicsName}` };
  if (!d3.pass) {
    const page = await isolatedPage(launched);
    await openGame(page, server.url);
    const b = await bisectNodeVsBrowser(page, rec);
    await closeIsolated(page);
    d3 = { ...d3, firstDivergentTick: b.firstDivergentTick, diffPaths: b.diffPaths, note: `first divergent tick ${b.firstDivergentTick}: ${b.diffPaths.slice(0, 6).join(', ')}` };
  }
  push(d3);

  // D4 snapshot round trip (node), incl. base64 hook encoding
  const pairs: Array<[number, number]> = [
    [0, 1],
    [37, 7],
    [500, 120],
    [1000, 1200],
  ];
  const d4Hashes: string[] = [];
  let d4Pass = true;
  let d4Note = '';
  const drive = (i: number): InputFrame => frames[i % Math.max(1, frames.length)] ?? frames[frames.length - 1]!;
  for (const [k, m] of pairs) {
    const sim = await createSimFor(rec);
    for (let i = 0; i < k; i++) sim.step(drive(i));
    const snap = sim.snap();
    const b64 = encodeSnapshot(snap.physics, snap.counters);
    for (let i = 0; i < m; i++) sim.step(drive(k + i));
    const h1 = sim.hash();
    const s1 = sim.state();
    sim.restore(snap);
    for (let i = 0; i < m; i++) sim.step(drive(k + i));
    const h2 = sim.hash();
    const dec = decodeSnapshot(b64);
    sim.restore({ physics: dec.physics, counters: dec.counters ?? snap.counters });
    for (let i = 0; i < m; i++) sim.step(drive(k + i));
    const h3 = sim.hash();
    d4Hashes.push(h1);
    if (h1 !== h2 || h1 !== h3) {
      d4Pass = false;
      d4Note += `(${k},${m}) diverges: ${diffState(s1, sim.state()).slice(0, 5).join(',')}; `;
    }
  }
  push({ id: 'D4', name: 'snapshot-node', pass: d4Pass, hashes: d4Hashes, ...(d4Note ? { note: d4Note } : {}) });

  // D4c foreign snapshot (round 7): a snapshot taken in sim A restored into a *fresh* sim B (never stepped,
  // same track/seed/class) must continue exactly like A — the snapshot is the whole world, not a delta on
  // an instance's private caches. Physics v2 is accepted against this, not only against the same-instance D4.
  {
    const hashes: string[] = [];
    let pass = true;
    let note = '';
    for (const [k, m] of pairs) {
      const A = await createSimFor(rec);
      for (let i = 0; i < k; i++) A.step(drive(i));
      const snap = A.snap();
      const B = await createSimFor(rec);
      B.restore(snap);
      if (A.hash() !== B.hash()) {
        pass = false;
        note += `(${k}) restore into a fresh sim differs before any step: ${diffState(A.state(), B.state()).slice(0, 5).join(',')}; `;
      }
      for (let i = 0; i < m; i++) {
        A.step(drive(k + i));
        B.step(drive(k + i));
      }
      hashes.push(A.hash());
      if (A.hash() !== B.hash()) {
        pass = false;
        note += `(${k},${m}) diverges after ${m} ticks: ${diffState(A.state(), B.state()).slice(0, 5).join(',')}; `;
      }
    }
    push({ id: 'D4c', name: 'foreign-snapshot', pass, hashes, ...(note ? { note } : {}) });
  }

  // D4b snapshot round trip in the browser through the hook's base64 path
  {
    const page = await isolatedPage(launched);
    await openGame(page, server.url);
    const r = await page.evaluate(
      ([fr, id, seed, bike]) => {
        const t = window.__trials!;
        if (t.setBike) t.setBike(bike);
        const out: string[] = [];
        for (const [k, m] of [
          [0, 1],
          [37, 7],
          [500, 120],
        ] as const) {
          t.loadTrack(id, seed);
          for (let i = 0; i < k; i++) {
            t.setInput(fr[i % fr.length]!);
            t.step(1);
          }
          const s = t.snapshot();
          for (let i = 0; i < m; i++) {
            t.setInput(fr[(k + i) % fr.length]!);
            t.step(1);
          }
          const h1 = t.hashState();
          t.restore(s);
          for (let i = 0; i < m; i++) {
            t.setInput(fr[(k + i) % fr.length]!);
            t.step(1);
          }
          out.push(h1, t.hashState());
        }
        return out;
      },
      [frames, rec.header.trackId, rec.header.seed, rec.header.bike ?? 'rookie'] as const,
    );
    await closeIsolated(page);
    let pass = true;
    for (let i = 0; i < r.length; i += 2) if (r[i] !== r[i + 1]) pass = false;
    push({ id: 'D4b', name: 'snapshot-browser', pass, hashes: r.filter((_, i) => i % 2 === 0) });
  }

  // D5 chunking (browser)
  {
    const page = await isolatedPage(launched);
    await openGame(page, server.url);
    const r = await page.evaluate(
      ([runs, id, seed, j, bike]) => {
        const t = window.__trials!;
        if (t.setBike) t.setBike(bike);
        const out: string[] = [];
        for (const chunk of [1, 7, 15, 120]) {
          t.loadTrack(id, seed);
          for (const [count, tt, b, l, flags] of runs) {
            t.setInput({ throttle: tt / 255, brake: b / 255, lean: l / 127, hop: (flags & 1) !== 0, restart: (flags & 2) !== 0 });
            let left = count;
            while (left > 0) {
              const n = Math.min(chunk, left);
              t.step(n);
              left -= n;
            }
          }
          out.push(t.hashState());
        }
        (window.__trialsRunAs ?? t.runRecording)(j);
        out.push(t.hashState());
        return out;
      },
      [rec.runs, rec.header.trackId, rec.header.seed, json, rec.header.bike ?? 'rookie'] as const,
    );
    await closeIsolated(page);
    push({ id: 'D5', name: 'chunking', pass: r.every((h) => h === r[0]), hashes: r, note: 'chunks 1,7,15,120 + runRecording' });
  }

  // D7 no state leak (browser): other seed, 600 ticks, then the recording
  {
    const page = await isolatedPage(launched);
    await openGame(page, server.url);
    const r = await page.evaluate(
      ([id, seed, j, bike]) => {
        const t = window.__trials!;
        // Leak probe on the *other* class too: a Pro golden runs 600 ticks of Rookie first, and vice versa.
        if (t.setBike) t.setBike(bike === 'pro' ? 'rookie' : 'pro');
        t.loadTrack(id, (seed + 1) >>> 0);
        t.setInput({ throttle: 1, lean: -0.5 });
        t.step(600);
        (window.__trialsRunAs ?? t.runRecording)(j);
        return t.hashState();
      },
      [rec.header.trackId, rec.header.seed, json, rec.header.bike ?? 'rookie'] as const,
    );
    await closeIsolated(page);
    push({ id: 'D7', name: 'no-state-leak', pass: r === first.hash, hashes: [r, first.hash] });
  }

  // D8 pinned canonical hash (node): 1200 ticks of the synthesized wiggle input
  {
    const sim = await createSimFor(rec);
    const canon = synthesizeRecording({ trackId: rec.header.trackId, seed: rec.header.seed, physicsHz: rec.header.physicsHz, seconds: 1200 / rec.header.physicsHz, style: 'wiggle' });
    const h = sim.run(expandFrames(canon)).hash;
    const expected = loadExpected();
    const entry = (expected[expectedKey(rec.header.trackId, rec.header.bike)] ??= {});
    const pinned = entry.canonical1200;
    if (!pinned || o.pin || pinned.physics !== sim.physicsName) {
      entry.canonical1200 = { hash: h, physics: sim.physicsName };
      saveExpected(expected);
      push({ id: 'D8', name: 'pinned-hash', pass: true, hashes: [h], note: pinned ? (o.pin ? 're-pinned (--pin)' : `re-pinned: physics implementation changed ${pinned.physics} -> ${sim.physicsName}`) : 'pinned now (first run)' });
    } else {
      const same = pinned.hash === h;
      push({ id: 'D8', name: 'pinned-hash', pass: same, hashes: [h, pinned.hash], note: same ? `pinned physics=${pinned.physics}` : `physics changed since pin (${pinned.physics}); re-pin deliberately with --pin` });
    }
  }

  const report: DeterminismReport = {
    ...runMeta('determinism', started, { chromium: launched.browser.version(), physics: simA.physicsName }),
    kind: 'determinism',
    recordingFile: path.resolve(recordingFile),
    ticks: frames.length,
    checks,
    pass: checks.every((c) => c.pass),
  };
  return report;
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs();
  const file = positional[0] ?? path.join(HARNESS_DIR, 'inputs', 'flat-test', 'bot-oracle.json');
  const tailS = flagNum(flags, 'tail-s', 0);
  const rec = withTail(loadRecording(file), tailS);
  if (tailS > 0) console.log(`tail: +${tailS} s of throttle 1 / lean 1 after tick ${frameCount(rec) - Math.round(tailS * rec.header.physicsHz)} (the finished game must ignore it)`);
  const verifier = new BrowserVerifier({ dev: flagBool(flags, 'dev'), build: flagBool(flags, 'build'), verbose: flagBool(flags, 'verbose') });
  try {
    const report = await runDeterminism(rec, file, { loads: flagNum(flags, 'loads', 3), pin: flagBool(flags, 'pin'), verifier });
    const out = path.join(ensureOut('gate'), 'determinism.json');
    writeJson(out, report);
    console.log(`${report.pass ? 'DETERMINISTIC' : 'NON-DETERMINISTIC'}: ${report.checks.filter((c) => c.pass).length}/${report.checks.length} checks, ${report.ticks} ticks, physics=${report.physics}`);
    console.log(`report: ${out}`);
    if (!report.pass) process.exitCode = 1;
  } finally {
    await verifier.close();
  }
}

const isEntry = process.argv[1] !== undefined && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isEntry) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
