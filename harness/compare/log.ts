/**
 * Log a critic's blind verdict against a pair and unmask it.
 *
 *   tsx harness/compare/log.ts <pair-id> --verdict '<json>' [--critic <name>] [--out harness/out/compare]
 *   tsx harness/compare/log.ts <pair-id> --verdict-file f.json [--critic <name>]
 *
 * Validates the verdict (bad -> winner 'invalid', still logged), reads the sealed
 * pair-<id>.answer.json (chmod 600 -> read -> chmod 000), appends a CompareVerdict
 * line to harness/out/metrics/compare.jsonl and prints the unmasked result plus
 * running stats for the tag.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flagStr, parseArgs } from '../lib/args';
import { OUT_DIR } from '../lib/paths';
import { fail, printKV } from '../lib/report';
import type { CompareVerdict, PairAnswer } from '../lib/schema';

export const COMPARE_JSONL = path.join(OUT_DIR, 'metrics', 'compare.jsonl');

export interface CriticVerdict {
  winner: 'A' | 'B' | 'tie';
  confidence: number;
  reasons: string[];
  nonAAA: string;
  criteria?: Record<string, { A: number; B: number; note?: string }>;
}

export type Validation = { ok: true; verdict: CriticVerdict } | { ok: false; errors: string[]; partial: Partial<CriticVerdict> };

const WINNERS = new Set(['A', 'B', 'tie']);

function isInt1to5(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
}

/** Strict shape check for the critic's JSON (RUBRIC.md "Output"). */
export function validateVerdict(raw: unknown): Validation {
  const errors: string[] = [];
  const partial: Partial<CriticVerdict> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['verdict is not a JSON object'], partial };
  }
  const o = raw as Record<string, unknown>;

  if (typeof o['winner'] === 'string' && WINNERS.has(o['winner'])) partial.winner = o['winner'] as CriticVerdict['winner'];
  else errors.push(`winner must be A|B|tie, got ${JSON.stringify(o['winner'])}`);

  if (typeof o['confidence'] === 'number' && o['confidence'] >= 0 && o['confidence'] <= 1) partial.confidence = o['confidence'];
  else errors.push(`confidence must be a number in 0..1, got ${JSON.stringify(o['confidence'])}`);

  if (Array.isArray(o['reasons']) && o['reasons'].every((r) => typeof r === 'string')) partial.reasons = o['reasons'] as string[];
  else errors.push('reasons must be an array of strings');

  if (typeof o['nonAAA'] === 'string') partial.nonAAA = o['nonAAA'];
  else errors.push('nonAAA must be a string');

  if (o['criteria'] !== undefined) {
    const c = o['criteria'];
    if (typeof c !== 'object' || c === null || Array.isArray(c)) {
      errors.push('criteria must be an object keyed by criterion id');
    } else {
      const out: NonNullable<CriticVerdict['criteria']> = {};
      for (const [id, v] of Object.entries(c as Record<string, unknown>)) {
        if (typeof v !== 'object' || v === null) {
          errors.push(`criteria.${id} must be an object`);
          continue;
        }
        const e = v as Record<string, unknown>;
        if (!isInt1to5(e['A']) || !isInt1to5(e['B'])) {
          errors.push(`criteria.${id}.A/B must be integers 1-5, got ${JSON.stringify(e['A'])}/${JSON.stringify(e['B'])}`);
          continue;
        }
        out[id] = { A: e['A'], B: e['B'], ...(typeof e['note'] === 'string' ? { note: e['note'] } : {}) };
      }
      partial.criteria = out;
    }
  }

  if (errors.length > 0) return { ok: false, errors, partial };
  return {
    ok: true,
    verdict: {
      winner: partial.winner!,
      confidence: partial.confidence!,
      reasons: partial.reasons!,
      nonAAA: partial.nonAAA!,
      ...(partial.criteria ? { criteria: partial.criteria } : {}),
    },
  };
}

/** Read the sealed answer: chmod 600, read, chmod back to 000. */
export function readAnswer(answerFile: string): PairAnswer {
  if (!fs.existsSync(answerFile)) throw new Error(`answer file missing: ${answerFile}`);
  fs.chmodSync(answerFile, 0o600);
  try {
    return JSON.parse(fs.readFileSync(answerFile, 'utf8')) as PairAnswer;
  } finally {
    fs.chmodSync(answerFile, 0o000);
  }
}

/**
 * The sealed answer for a pair id: `pair-<id>.answer.json` (video pairs) or `apair-<id>.answer.json`
 * (audio pairs, harness round 11). A leading `pair-` / `apair-` on the id is tolerated.
 */
export function resolveAnswerFile(outDir: string, pairId: string): string {
  const id = pairId.replace(/^a?pair-/, '');
  const candidates = pairId.startsWith('apair-')
    ? [`apair-${id}.answer.json`, `pair-${id}.answer.json`]
    : [`pair-${id}.answer.json`, `apair-${id}.answer.json`];
  for (const c of candidates) if (fs.existsSync(path.join(outDir, c))) return path.join(outDir, c);
  return path.join(outDir, candidates[0]!);
}

export function unmask(winner: CompareVerdict['winner'], left: 'ours' | 'ref'): CompareVerdict['winnerUnmasked'] {
  if (winner === 'tie' || winner === 'invalid') return winner;
  const right: 'ours' | 'ref' = left === 'ours' ? 'ref' : 'ours';
  return winner === 'A' ? left : right;
}

export interface TagStats {
  tag: string;
  n: number;
  oursWins: number;
  refWins: number;
  ties: number;
  invalid: number;
  /** wins / (n - ties - invalid); null when no decisive verdicts. */
  oursWinRate: number | null;
  /** |P(left wins) - 0.5| over decisive verdicts; null when none. */
  positionBias: number | null;
  leftWins: number;
}

export function readVerdicts(file = COMPARE_JSONL): CompareVerdict[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as CompareVerdict);
}

export function tagStats(verdicts: CompareVerdict[], tag: string): TagStats {
  const vs = verdicts.filter((v) => v.tag === tag);
  const n = vs.length;
  const ties = vs.filter((v) => v.winner === 'tie').length;
  const invalid = vs.filter((v) => v.winner === 'invalid').length;
  const oursWins = vs.filter((v) => v.winnerUnmasked === 'ours').length;
  const refWins = vs.filter((v) => v.winnerUnmasked === 'ref').length;
  const leftWins = vs.filter((v) => v.winner === 'A').length;
  const decisive = n - ties - invalid;
  return {
    tag,
    n,
    oursWins,
    refWins,
    ties,
    invalid,
    leftWins,
    oursWinRate: decisive > 0 ? oursWins / decisive : null,
    positionBias: decisive > 0 ? Math.abs(leftWins / decisive - 0.5) : null,
  };
}

export interface LogOptions {
  critic?: string;
  outDir?: string;
  jsonl?: string;
}

export function logVerdict(pairId: string, raw: unknown, opts: LogOptions = {}): { record: CompareVerdict; validation: Validation; stats: TagStats } {
  const outDir = opts.outDir ?? path.join(OUT_DIR, 'compare');
  const jsonl = opts.jsonl ?? COMPARE_JSONL;
  const answer = readAnswer(resolveAnswerFile(outDir, pairId));
  const validation = validateVerdict(raw);
  const v: Partial<CriticVerdict> = validation.ok ? validation.verdict : validation.partial;
  const winner: CompareVerdict['winner'] = validation.ok ? validation.verdict.winner : 'invalid';
  const record: CompareVerdict = {
    pairId: answer.pairId ?? pairId,
    tag: answer.tag,
    critic: opts.critic ?? 'unknown',
    at: new Date().toISOString(),
    winner,
    confidence: typeof v.confidence === 'number' ? v.confidence : 0,
    reasons: validation.ok ? validation.verdict.reasons : [...(v.reasons ?? []), ...validation.errors.map((e) => `invalid: ${e}`)],
    nonAAA: v.nonAAA ?? '',
    left: answer.left,
    winnerUnmasked: unmask(winner, answer.left),
    ours: answer.ours,
    ref: answer.ref,
  };
  fs.mkdirSync(path.dirname(jsonl), { recursive: true });
  fs.appendFileSync(jsonl, JSON.stringify(record) + '\n');
  return { record, validation, stats: tagStats(readVerdicts(jsonl), answer.tag) };
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs();
  const [pairId] = positional;
  if (!pairId) fail("usage: log.ts <pair-id> --verdict '<json>' | --verdict-file f.json [--critic name] [--out dir]");
  let rawText: string;
  if (typeof flags['verdict-file'] === 'string') rawText = fs.readFileSync(flags['verdict-file'], 'utf8');
  else if (typeof flags['verdict'] === 'string') rawText = flags['verdict'];
  else fail('--verdict <json> or --verdict-file <f.json> is required');
  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch (e) {
    raw = { parseError: e instanceof Error ? e.message : String(e) };
  }
  const outDir = path.resolve(flagStr(flags, 'out', path.join(OUT_DIR, 'compare')));
  const critic = flagStr(flags, 'critic', 'unknown');
  const { record, validation, stats } = logVerdict(pairId, raw, { critic, outDir });

  if (!validation.ok) console.error(`verdict INVALID:\n  - ${validation.errors.join('\n  - ')}`);
  printKV('verdict', {
    pairId,
    tag: record.tag,
    critic,
    said: record.winner,
    left: record.left,
    result: record.winnerUnmasked,
    confidence: record.confidence,
    logged: COMPARE_JSONL,
  });
  printKV(`stats ${record.tag}`, {
    n: stats.n,
    oursWins: stats.oursWins,
    refWins: stats.refWins,
    ties: stats.ties,
    invalid: stats.invalid,
    oursWinRate: stats.oursWinRate === null ? 'n/a' : stats.oursWinRate.toFixed(3),
    positionBias: stats.positionBias === null ? 'n/a' : stats.positionBias.toFixed(3),
  });
  console.log(`result: ${record.winnerUnmasked}`);
}

const isEntry = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
}
