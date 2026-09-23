#!/usr/bin/env node
// Store listing check (docs/plans/STORE_RELEASE.md Phase 6): every field of store/metadata within the store's limit,
// and no word a reviewer or a rights holder could point at. Exit 1 on any failure. Runs in CI (store job).
//
//   node scripts/store-metadata.mjs
//
// Limits: App Store Connect (name 30, subtitle 30, promotional text 170, description 4000, keywords 100 bytes,
// release notes 4000) and Play Console (title 30, short description 80, full description 4000, release notes 500).
// Denylist: the franchise and competitor names (Apple 2.3.7 bars them from metadata), the words the plan retires
// ("trial" reads as a trial version, Apple 2.1/2.3; "demo"), and "Rockhopper" (Specialized's mark, D17).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const meta = join(repo, 'store', 'metadata');

const LIMITS = {
  'ios/en-US/name.txt': 30,
  'ios/en-US/subtitle.txt': 30,
  'ios/en-US/promotional_text.txt': 170,
  'ios/en-US/description.txt': 4000,
  'ios/en-US/keywords.txt': 100,
  'ios/en-US/release_notes.txt': 4000,
  'ios/en-US/support_url.txt': 255,
  'ios/en-US/privacy_url.txt': 255,
  'android/en-US/title.txt': 30,
  'android/en-US/short_description.txt': 80,
  'android/en-US/full_description.txt': 4000,
  'android/en-US/changelogs/1.txt': 500,
};

/** Whole-word, case-insensitive. "trail" is fine; "trial(s)" is not. */
const DENY = ['trials?', 'gauntlet', 'demo', 'rockhopper', 'ubisoft', 'redlynx', 'evolution', 'rising', 'fusion', 'no fear', 'hill climb', 'bike race', 'moto x3m', 'bmx', 'specialized', 'red bull', 'monster energy', 'free trial', 'beta'];

const failures = [];
const rows = [];
const text = (rel) => readFileSync(join(meta, rel), 'utf8').replace(/\n$/, '');

for (const [rel, max] of Object.entries(LIMITS)) {
  if (!existsSync(join(meta, rel))) {
    failures.push(`${rel}: missing`);
    continue;
  }
  const t = text(rel);
  const n = rel.endsWith('keywords.txt') ? Buffer.byteLength(t) : Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(t)).length;
  rows.push([rel, n, max]);
  if (n > max) failures.push(`${rel}: ${n} > ${max}`);
  if (n === 0) failures.push(`${rel}: empty`);
}

const kw = text('ios/en-US/keywords.txt');
if (/,\s/.test(kw)) failures.push('ios keywords: no spaces after commas (they count against the 100)');
const nameWords = new Set(text('ios/en-US/name.txt').toLowerCase().split(/[^a-z]+/).filter(Boolean));
for (const k of kw.split(',')) if (nameWords.has(k.trim().toLowerCase())) failures.push(`ios keywords: "${k}" repeats a word of the name (already indexed)`);

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
for (const f of walk(meta).filter((p) => p.endsWith('.txt'))) {
  const t = readFileSync(f, 'utf8');
  for (const w of DENY) {
    const m = new RegExp(`\\b${w}\\b`, 'i').exec(t);
    if (m) failures.push(`${relative(repo, f)}: denied term "${m[0]}"`);
  }
}

for (const [rel, n, max] of rows) console.info(`${String(n).padStart(5)} / ${String(max).padEnd(5)} ${rel}`);
if (failures.length) {
  console.error(`\nstore-metadata: ${failures.length} failure(s)\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.info('\nstore-metadata: OK');
