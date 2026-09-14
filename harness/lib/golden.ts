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
import { srcFingerprint } from './metrics';
import { HARNESS_DIR } from './paths';
import { loadRecording } from './recording';

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

/** chooseGolden + one log line explaining the choice. */
export function pickGolden(trackId: string, log: (l: string) => void = () => undefined): string | null {
  const c = chooseGolden(trackId);
  if (!c) return null;
  const fp = srcFingerprint();
  if (c.fresh) log(`golden: ${path.basename(c.file)} (src=${fp} matches the working tree; ${c.candidates} candidate(s))`);
  else log(`golden: WARNING nothing under harness/inputs/${trackId}/ is stamped src=${fp}; using newest ${path.basename(c.file)} (src=${c.stamp ?? 'unstamped'}) — re-run pnpm harness:bot ${trackId}`);
  return c.file;
}
