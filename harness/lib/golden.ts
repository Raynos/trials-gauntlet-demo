/**
 * Golden recordings: which `harness/inputs/<track>/bot-*.json` to trust.
 *
 * The bot stamps `src=<fingerprint>` (harness/lib/metrics.ts srcFingerprint, FNV over
 * src/physics, src/tracks, src/core, src/game/rules.ts in the working tree) into every
 * recording's header note. A golden is picked by that stamp, not by mtime: a file
 * touched by a checkout or a copy says nothing about which physics produced it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expandFrames, type InputRecording } from '../../src/core/replay';
import { srcFingerprint, fingerprintMatches } from './metrics';
import { HARNESS_DIR } from './paths';
import { loadRecording, saveRecording } from './recording';
import { mapPool } from './pool';
import { createSimFor, type Sim } from './sim';
import { DEFAULT_BIKE, type BikeClass } from '../../src/core/types';

export const GOLDEN_ORDER = ['bot-oracle.json', 'bot-3.json', 'bot-2.json', 'bot-1.json', 'bot-0.json'] as const;

/** `bot-3.json` is the Rookie golden (as it always was); Pro goldens are `bot-3-pro.json` next to it. */
export function goldenSuffix(bike: BikeClass | undefined): string {
  return bike && bike !== DEFAULT_BIKE ? `-${bike}` : '';
}

/** Candidate golden file names for a class, best first. */
export function goldenOrder(bike: BikeClass = DEFAULT_BIKE): string[] {
  const sfx = goldenSuffix(bike);
  return GOLDEN_ORDER.map((n) => n.replace(/\.json$/, `${sfx}.json`));
}

/** Class a golden file name encodes (`bot-3-pro.json` -> pro). */
export function goldenBike(file: string): BikeClass {
  return path.basename(file).endsWith('-pro.json') ? 'pro' : DEFAULT_BIKE;
}

/** `src=<8 hex>` from a recording's header note, or null when unstamped/unreadable. */
export function recordingFingerprint(file: string): string | null {
  try {
    const note = loadRecording(file).header.note ?? '';
    return /\bsrc=([0-9a-f]{8})\b/.exec(note)?.[1] ?? null;
  } catch {
    return null;
  }
}

export interface GoldenChoice {
  file: string;
  /** True when the recording's stamp equals the working tree's fingerprint. */
  fresh: boolean;
  stamp: string | null;
  candidates: number;
}

/**
 * Highest-skill golden whose stamp matches the working tree (oracle > 3 > 2 > 1 > 0).
 * With no match: the newest file by mtime, flagged `fresh: false` — the gate's
 * `clear.*` / D8 checks then fail on purpose until `harness:bot` is re-run.
 */
export function chooseGolden(trackId: string, bike: BikeClass = DEFAULT_BIKE): GoldenChoice | null {
  const dir = path.join(HARNESS_DIR, 'inputs', trackId);
  const present = goldenOrder(bike).map((name) => path.join(dir, name)).filter((f) => fs.existsSync(f));
  const fp = srcFingerprint();
  const stamped = present.map((file) => ({ file, stamp: recordingFingerprint(file) }));
  const match = stamped.find((s) => fingerprintMatches(s.stamp, fp));
  if (match) return { file: match.file, fresh: true, stamp: match.stamp, candidates: present.length };
  const newest = [...stamped].sort((a, b) => fs.statSync(b.file).mtimeMs - fs.statSync(a.file).mtimeMs)[0];
  if (newest) return { file: newest.file, fresh: false, stamp: newest.stamp, candidates: present.length };
  const legacy = path.join(HARNESS_DIR, 'inputs', `${trackId}-clear.json`);
  return bike === DEFAULT_BIKE && fs.existsSync(legacy) ? { file: legacy, fresh: false, stamp: null, candidates: 1 } : null;
}

export interface GoldenRefresh {
  trackId: string;
  file: string;
  stamp: string | null;
  /** 'fresh' = already stamped with the working tree; 'restamped' = replays to a finish node == browser, stamp updated; 'stale' = no longer finishes or node != browser (re-run the bot). */
  result: 'fresh' | 'restamped' | 'stale';
  finishTime: number | null;
  attempts: number;
  nodeHash: string;
  browserHash: string | null;
  note: string;
}

/**
 * The src fingerprint is coarse on purpose (one FNV over src/physics, src/tracks, src/core,
 * src/game/rules.ts): editing one track file un-stamps every golden. This re-proves each
 * `bot-*.json` on the physics in the working tree — replay in node, browser hash must match,
 * the run must still finish — and only then rewrites its stamp (`src=<new> restamped-from=<old>`).
 * A golden that no longer finishes, or that node and browser disagree on, stays as it is and
 * is reported `stale`: that one needs `pnpm harness:bot <track>` again.
 */
export async function refreshGoldens(
  trackIds: string[],
  verify: (rec: InputRecording) => Promise<{ hash: string; finishTime: number | null; faults: number }>,
  log: (l: string) => void = () => undefined,
  o: { jobs?: number } = {},
): Promise<GoldenRefresh[]> {
  const fp = srcFingerprint();
  // Pass 1 (node, in order): every golden replays here first; only the ones that still finish on a stale stamp
  // need the browser. Pass 2 runs those `jobs` at a time (round 12: one Chromium, one context per recording).
  const pending: Array<{ row: GoldenRefresh; rec: InputRecording; name: string; physicsVersion: Sim["physicsVersion"] }> = [];
  const out: GoldenRefresh[] = [];
  const line = (row: GoldenRefresh, name: string): string => `${row.result.toUpperCase().padEnd(9)} ${row.trackId.padEnd(20)} ${name.padEnd(14)} ${row.note}`;
  for (const trackId of trackIds) {
    const dir = path.join(HARNESS_DIR, 'inputs', trackId);
    for (const name of [...goldenOrder('rookie'), ...goldenOrder('pro')]) {
      const file = path.join(dir, name);
      if (!fs.existsSync(file)) continue;
      const rec = loadRecording(file);
      if (!rec.header.bike) rec.header.bike = goldenBike(file);
      const stamp = /\bsrc=([0-9a-f]{8})\b/.exec(rec.header.note ?? '')?.[1] ?? null;
      const sim = await createSimFor(rec);
      const frames = expandFrames(rec);
      let faults = 0;
      for (const f of frames) for (const e of sim.step(f)) if (e.type === 'fault') faults++;
      const nodeHash = sim.hash();
      const finished = sim.phase() === 'finished';
      const finishTime = finished ? sim.runTime() : null;
      const row: GoldenRefresh = { trackId, file, stamp, result: 'stale', finishTime, attempts: 1 + faults, nodeHash, browserHash: null, note: '' };
      out.push(row);
      if (fingerprintMatches(stamp, fp) && rec.header.physics === sim.physicsVersion) {
        row.result = 'fresh';
        row.note = 'already stamped with the working tree (src + physics)';
      } else if (!finished) {
        row.note = `no longer finishes on src=${fp} (${(sim.state().bike.pos.x).toFixed(1)} m, ${row.attempts} attempts)`;
      } else {
        pending.push({ row, rec, name, physicsVersion: sim.physicsVersion });
        continue;
      }
      log(line(row, name));
    }
  }
  if (pending.length) log(`${pending.length} golden(s) to re-prove in the browser, ${Math.max(1, o.jobs ?? 1)} at a time`);
  await mapPool(pending, Math.max(1, o.jobs ?? 1), async ({ row, rec, name, physicsVersion }) => {
    const b = await verify(rec);
    row.browserHash = b.hash;
    if (b.hash !== row.nodeHash) row.note = `node ${row.nodeHash} != browser ${b.hash} (stale dist? pass --build)`;
    else {
      const stamp = row.stamp;
      const note = `${(rec.header.note ?? '').replace(/\s*\bsrc=[0-9a-f]{8}\b/, '').replace(/\s*\brestamped-from=[0-9a-f]{8}\b/, '')} src=${fp} restamped-from=${stamp ?? 'unstamped'}`.trim();
      // A re-proved golden also gains the solver stamp it now demonstrably runs on (core r7 `header.physics`).
      saveRecording(row.file, { ...rec, header: { ...rec.header, ...(physicsVersion ? { physics: physicsVersion } : {}), note } });
      row.result = 'restamped';
      row.note = `finish ${row.finishTime?.toFixed(3)} s, ${row.attempts} attempt(s), node == browser; ${stamp ?? 'unstamped'} -> ${fp}`;
    }
    log(line(row, name));
  });
  return out;
}

/** chooseGolden + one log line explaining the choice. */
export function pickGolden(trackId: string, log: (l: string) => void = () => undefined, bike: BikeClass = DEFAULT_BIKE): string | null {
  const c = chooseGolden(trackId, bike);
  if (!c) return null;
  const fp = srcFingerprint();
  if (c.fresh) log(`golden: ${path.basename(c.file)} (${bike}; src=${fp} matches the working tree; ${c.candidates} candidate(s))`);
  else log(`golden: WARNING nothing under harness/inputs/${trackId}/ is a ${bike} golden stamped src=${fp}; using newest ${path.basename(c.file)} (src=${c.stamp ?? 'unstamped'}) — re-run pnpm harness:bot ${trackId}${bike === DEFAULT_BIKE ? '' : ` --bike ${bike}`}`);
  return c.file;
}
