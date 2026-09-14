/**
 * Emit the exact prompt for a blind critic, given a pair id.
 *
 *   pnpm exec tsx harness/compare/critic-prompt.ts <pair-id> [--out harness/out/compare/pair-<id>.prompt.md]
 *
 * The prompt is self-contained: the manoeuvre tag, the absolute sheet and mp4
 * paths, the relevant RUBRIC sections (general + the tag) and the JSON answer
 * shape. It never touches `pair-<id>.answer.json`, and it tells the critic
 * not to either. The parent hands the text to a fresh agent unchanged, then
 * feeds the agent's JSON to `pnpm harness:log-verdict <pair-id> --verdict '<json>'`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { flagStr, parseArgs } from '../lib/args';
import { HARNESS_DIR } from '../lib/paths';
import { fail } from '../lib/report';

const COMPARE_OUT = path.join(HARNESS_DIR, 'out', 'compare');
const RUBRIC = path.join(HARNESS_DIR, 'compare', 'RUBRIC.md');

/** `<tag>-<yyyymmdd>-<hhmmss>-<hex4>` -> tag. */
export function tagOfPairId(id: string): string {
  const m = /^(.*)-\d{8}-\d{6}-[0-9a-f]{4}$/i.exec(id);
  return m ? m[1]! : id;
}

function section(md: string, heading: string): string | null {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading.trim());
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,3} /.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

export function buildCriticPrompt(pairId: string, outDir = COMPARE_OUT): { prompt: string; sheet: string; mp4: string; tag: string } {
  const sheet = path.join(outDir, `pair-${pairId}-sheet.jpg`);
  const mp4 = path.join(outDir, `pair-${pairId}.mp4`);
  if (!fs.existsSync(sheet) || !fs.existsSync(mp4)) throw new Error(`pair ${pairId} not found under ${outDir} (need ${path.basename(sheet)} and ${path.basename(mp4)})`);
  const tag = tagOfPairId(pairId);
  const rubric = fs.readFileSync(RUBRIC, 'utf8');
  const looking = section(rubric, '## What you are looking at') ?? '';
  const how = section(rubric, '## How to judge') ?? '';
  const output = section(rubric, '## Output (exact shape)') ?? '';
  const vocab = section(rubric, '## Vocabulary') ?? '';
  const general = section(rubric, '### `general` — applied to every pair') ?? '';
  const tagSection = section(rubric, `### \`${tag}\``) ?? section(rubric, '## Other tags') ?? '';

  const prompt = `You are a blind critic for a 2.5D motorbike trials game. Two clips of the same manoeuvre are shown side by side; one is a shipped Trials title, one is a prototype. You do not know which is which and must not try to find out. Decide which side looks more like a shipped AAA trials game, in MOTION terms (timing, weight, settle, camera, cut) — not art budget.

Manoeuvre tag: \`${tag}\`
Contact sheet (view this image first): ${sheet}
Video (watch it; you may extract frames with ffmpeg at /opt/homebrew/bin/ffmpeg, e.g. \`ffmpeg -i "${mp4}" -vf fps=10 /tmp/critic-%03d.png\` or \`-ss <t> -frames:v 1\`): ${mp4}

Do NOT open, list, read or guess at any file ending in \`.answer.json\`, any \`work/\` directory, or any other file in that folder. Do not read the game's source or the harness. Only A and B exist.

${looking}

${how}

${vocab}

## Criteria to score (1–5 for A and for B; 5 = indistinguishable from a shipped Trials title, 1 = obviously a prototype)

${general}

${tagSection}

${output}

Reply with that JSON object and nothing else: no prose before or after it, no code fence. Include every criterion id listed above under "criteria".`;

  return { prompt, sheet, mp4, tag };
}

function main(): void {
  const { positional, flags } = parseArgs();
  const id = positional[0];
  if (!id) fail('usage: harness/compare/critic-prompt.ts <pair-id> [--out file.md]');
  const { prompt, tag } = buildCriticPrompt(id);
  const out = flagStr(flags, 'out', path.join(COMPARE_OUT, `pair-${id}.prompt.md`));
  fs.writeFileSync(out, prompt + '\n');
  process.stdout.write(prompt + '\n');
  console.error(`\n[critic-prompt] tag=${tag} written to ${out}; after the critic answers: pnpm harness:log-verdict ${id} --verdict '<json>' --critic <name>`);
}

const isEntry = process.argv[1] !== undefined && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isEntry) main();
