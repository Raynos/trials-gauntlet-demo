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
import { srcFingerprint } from './metrics';
import { HARNESS_DIR } from './paths';
import { loadRecording, saveRecording } from './recording';
import { createSim } from './sim';

export const GOLDEN_ORDER = ['bot-oracle.json', 'bot-3.json', 'bot-2.json', 'bot-1.json', 'bot-0.json'] as const;

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
export function chooseGolden(trackId: string): GoldenChoice | null {
  const dir = path.join(HARNESS_DIR, 'inputs', trackId);
  const present = GOLDEN_ORDER.map((name) => path.join(dir, name)).filter((f) => fs.existsSync(f));
  const fp = srcFingerprint();
  const stamped = present.map((file) => ({ file, stamp: recordingFingerprint(file) }));
  const match = stamped.find((s) => s.stamp === fp);
  if (match) return { file: match.file, fresh: true, stamp: match.stamp, candidates: present.length };
  const newest = [...stamped].sort((a, b) => fs.statSync(b.file).mtimeMs - fs.statSync(a.file).mtimeMs)[0];
  if (newest) return { file: newest.file, fresh: false, stamp: newest.stamp, candidates: present.length };
  const legacy = path.join(HARNESS_DIR, 'inputs', `${trackId}-clear.json`);
  return fs.existsSync(legacy) ? { file: legacy, fresh: false, stamp: null, candidates: 1 } : null;
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
): Promise<GoldenRefresh[]> {
  const fp = srcFingerprint();
  const out: GoldenRefresh[] = [];
  for (const trackId of trackIds) {
    const dir = path.join(HARNESS_DIR, 'inputs', trackId);
    for (const name of GOLDEN_ORDER) {
      const file = path.join(dir, name);
      if (!fs.existsSync(file)) continue;
      const rec = loadRecording(file);
      const stamp = /\bsrc=([0-9a-f]{8})\b/.exec(rec.header.note ?? '')?.[1] ?? null;
      const sim = await createSim(rec.header.trackId, rec.header.seed, rec.header.physicsHz);
      const frames = expandFrames(rec);
      let faults = 0;
      for (const f of frames) for (const e of sim.step(f)) if (e.type === 'fault') faults++;
      const nodeHash = sim.hash();
      const finished = sim.phase() === 'finished';
      const finishTime = finished ? sim.runTime() : null;
      const row: GoldenRefresh = { trackId, file, stamp, result: 'stale', finishTime, attempts: 1 + faults, nodeHash, browserHash: null, note: '' };
      if (stamp === fp) {
        row.result = 'fresh';
        row.note = 'already stamped with the working tree';
      } else if (!finished) {
        row.note = `no longer finishes on src=${fp} (${(sim.state().bike.pos.x).toFixed(1)} m, ${row.attempts} attempts)`;
      } else {
        const b = await verify(rec);
        row.browserHash = b.hash;
        if (b.hash !== nodeHash) row.note = `node ${nodeHash} != browser ${b.hash} (stale dist? pass --build)`;
        else {
          const note = `${(rec.header.note ?? '').replace(/\s*\bsrc=[0-9a-f]{8}\b/, '').replace(/\s*\brestamped-from=[0-9a-f]{8}\b/, '')} src=${fp} restamped-from=${stamp ?? 'unstamped'}`.trim();
          saveRecording(file, { ...rec, header: { ...rec.header, note } });
          row.result = 'restamped';
          row.note = `finish ${finishTime?.toFixed(3)} s, ${row.attempts} attempt(s), node == browser; ${stamp ?? 'unstamped'} -> ${fp}`;
        }
      }
      log(`${row.result.toUpperCase().padEnd(9)} ${trackId.padEnd(20)} ${name.padEnd(14)} ${row.note}`);
      out.push(row);
    }
  }
  return out;
}

/** chooseGolden + one log line explaining the choice. */
export function pickGolden(trackId: string, log: (l: string) => void = () => undefined): string | null {
  const c = chooseGolden(trackId);
  if (!c) return null;
  const fp = srcFingerprint();
  if (c.fresh) log(`golden: ${path.basename(c.file)} (src=${fp} matches the working tree; ${c.candidates} candidate(s))`);
  else log(`golden: WARNING nothing under harness/inputs/${trackId}/ is stamped src=${fp}; using newest ${path.basename(c.file)} (src=${c.stamp ?? 'unstamped'}) — re-run pnpm harness:bot ${trackId}`);
  return c.file;
}
