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
import { bareId, beatOfAudioTag } from './audio';

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

export interface CriticPrompt {
  prompt: string;
  sheet: string;
  mp4: string;
  tag: string;
  /** `pair` = side-by-side video pair; `apair` = sequential audio pair with a black picture. */
  kind: 'pair' | 'apair';
}

/**
 * The audio prompt (harness round 11). The critic cannot hear: it measures. It is told the picture is black
 * by design, where the two WAVs and the spectrogram sheet are, what it may run, and what it must not read.
 */
export function buildAudioCriticPrompt(pairId: string, outDir = COMPARE_OUT): CriticPrompt {
  const id = bareId(pairId);
  const base = path.join(outDir, `apair-${id}`);
  const sheet = `${base}-sheet.jpg`;
  const mp4 = `${base}.mp4`;
  const wavA = `${base}-A.wav`;
  const wavB = `${base}-B.wav`;
  for (const f of [sheet, mp4, wavA, wavB]) if (!fs.existsSync(f)) throw new Error(`audio pair ${id}: missing ${f}`);
  const tag = tagOfPairId(id);
  const beat = beatOfAudioTag(tag);
  const rubric = fs.readFileSync(RUBRIC, 'utf8');
  const audioGeneral = section(rubric, '## Audio pairs (`apair-<id>`) — "which one is the real game\'s audio?"') ?? '';
  const audioCriteria = section(rubric, '### `audio` — applied to every audio pair') ?? '';
  const beatSection = beat ? (section(rubric, `### \`audio-${beat}\``) ?? '') : '';
  const output = (section(rubric, '## Output (exact shape)') ?? '')
    .replace(
      "short, motion-specific observations with times, e.g. 'B rear wheel lands 3 frames before front (t=2.1s); A lands flat'",
      "short, measured sound observations with times and numbers, e.g. 'B engine fundamental holds 118 Hz +-2 for 3.1 s (t=0.8-3.9 s); A wanders 95-140 Hz'",
    )
    .replace(
      'what most makes the weaker side read as not-AAA, in motion terms (timing, weight, settle, camera, cut)',
      'the one tell that makes the synthetic side synthetic, in sound terms',
    )
    .replace(/Include every criterion listed for the tag plus the\n`general` set\./, '`criteria` is optional for an audio pair; if included, use the `audio` ids.');

  const prompt = `You are a blind critic for a 2.5D motorbike trials game, judging AUDIO ONLY. You are given two short audio clips of the same beat (${beat ?? tag}). One is the audio of a shipped Trials title, one is a prototype's synthesized audio. You do not know which is which and must not try to find out.

Question: **Which of A and B is the real game's audio? Name the one tell that makes the other synthetic.**

Beat tag: \`${tag}\`
The picture in the video is BLACK BY DESIGN (only a label bar and a clock are drawn) — there is nothing to look at, and you must not try to judge visuals. The material is:
- A: ${wavA}
- B: ${wavB}
- Spectrogram sheet (A on top, B below, identical axes, no labels): ${sheet}
- The sequential A / 1 s silence / B file (one audio stream, the bar shows one square during A and two during B): ${mp4}

You cannot listen, so you measure. You may run ffmpeg / ffprobe (/opt/homebrew/bin/ffmpeg, /opt/homebrew/bin/ffprobe), sox if present, and python3 with numpy (and scipy / matplotlib if installed) on the two WAVs: spectrograms of your own, RMS / loudness envelopes over time, onset detection, pitch (fundamental) tracks, spectral centroid and flatness over time, band energies, crest factor, autocorrelation, stereo width — whatever lets you compare the two as a sound designer would. Write any scratch files under /tmp. View the sheet as an image.

Do NOT open, list, read or guess at any file ending in \`.answer.json\`, any \`work/\` directory, any other file in that output folder, the game's source (\`src/\`), \`docs/\`, \`reference/\`, the harness, or any git history. Only A and B exist.

${audioGeneral}

${audioCriteria}

${beatSection}

${output}

For this audio pair: \`winner\` is the side you believe is the REAL game's audio; \`reasons\` are measured observations with times and numbers; \`nonAAA\` is the ONE tell (one sentence, in sound terms) that makes the synthetic side synthetic; \`criteria\` is optional (if present, use the \`audio\` ids above with integers 1–5 for A and B).

Reply with that JSON object and nothing else: no prose before or after it, no code fence.`;

  return { prompt, sheet, mp4, tag, kind: 'apair' };
}

/** True when the id belongs to an `apair-` (audio) pair under `outDir`. */
export function isAudioPairId(pairId: string, outDir = COMPARE_OUT): boolean {
  const id = bareId(pairId);
  return pairId.startsWith('apair-') || (!fs.existsSync(path.join(outDir, `pair-${id}-sheet.jpg`)) && fs.existsSync(path.join(outDir, `apair-${id}-sheet.jpg`)));
}

export function buildCriticPrompt(pairId: string, outDir = COMPARE_OUT): CriticPrompt {
  if (isAudioPairId(pairId, outDir)) return buildAudioCriticPrompt(pairId, outDir);
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

  return { prompt, sheet, mp4, tag, kind: 'pair' };
}

function main(): void {
  const { positional, flags } = parseArgs();
  const id = positional[0];
  if (!id) fail('usage: harness/compare/critic-prompt.ts <pair-id> [--out file.md]');
  const { prompt, tag, kind } = buildCriticPrompt(id);
  const out = flagStr(flags, 'out', path.join(COMPARE_OUT, `${kind}-${bareId(id)}.prompt.md`));
  fs.writeFileSync(out, prompt + '\n');
  process.stdout.write(prompt + '\n');
  console.error(`\n[critic-prompt] tag=${tag} written to ${out}; after the critic answers: pnpm harness:log-verdict ${id} --verdict '<json>' --critic <name>`);
}

const isEntry = process.argv[1] !== undefined && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isEntry) main();
