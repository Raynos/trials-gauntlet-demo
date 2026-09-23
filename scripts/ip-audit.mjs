#!/usr/bin/env node
// IP audit of the store artefacts (docs/plans/STORE_RELEASE.md bar 1, P0.4).
//
//   node scripts/ip-audit.mjs [--strict] [--json] [dir ...]
//
// Scans the BUILT store artefacts — `dist/` from `pnpm build:store`, plus `ios/`, `android/` and `store/` when
// they exist (or the dirs given) — for the denylist: the franchise terms (the Trials / Ubisoft / RedLynx names,
// "gauntlet", "no fear", "demo") and the name of every retired level, read from src/tracks `RETIRED_TRACKS` (the
// curriculum, the `p<n>-*` playgrounds, the Labs; loaded through tsx, the tracks are TypeScript). Internal code and
// docs are out of scope; what a reviewer or player can extract is in.
//
// How a term matches (whole words; franchise terms case-insensitive, level names case-sensitive, the generic riding
// names only as a title) is documented and implemented in scripts/ip-audit-rules.mjs and pinned by
// scripts/ip-audit.test.mjs.
//
// Text files are read whole; a .glb's JSON chunk is read (node and material names ship in it). Other binaries
// (images, audio, fonts) are skipped. Reports hits per term and per file. `--strict` exits 1 on any hit (or when
// there is nothing to scan): CI runs it strict on the store build (.github/workflows/deploy.yml).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { FRANCHISE_TERMS, GENERIC_LEVEL_NAMES, auditText } from './ip-audit-rules.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const asJson = args.includes('--json');
const dirsArg = args.filter((a) => !a.startsWith('--'));
const dirs = (dirsArg.length ? dirsArg : ['dist', 'ios', 'android', 'store']).map((d) => resolve(repo, d)).filter((d) => existsSync(d));

/** The retired level names: `RETIRED_TRACKS` (src/tracks), deduplicated. */
async function levelNames() {
  const { RETIRED_TRACKS } = await tsImport(join(repo, 'src', 'tracks', 'index.ts'), import.meta.url);
  if (!RETIRED_TRACKS?.length) throw new Error('ip-audit: src/tracks RETIRED_TRACKS is empty');
  return [...new Set(RETIRED_TRACKS.map((t) => t.name))];
}

const TEXT = /\.(js|mjs|cjs|html|htm|css|json|webmanifest|txt|md|xml|plist|strings|svg|gltf|entitlements|storyboard|xib|gradle|properties|kt|java|swift|pbxproj|xcprivacy)$/i;

/** The JSON chunk of a binary glTF (magic, version, length, then chunk 0 = JSON). */
function glbJson(buf) {
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) return '';
  const len = buf.readUInt32LE(12);
  return buf.subarray(20, 20 + len).toString('utf8');
}

function files(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'build' || e.name === 'Pods' || e.name === '.gradle') continue;
        walk(p);
      } else out.push(p);
    }
  };
  walk(dir);
  return out;
}

const levels = await levelNames();
const terms = [...FRANCHISE_TERMS, ...levels.filter((n) => !FRANCHISE_TERMS.includes(n.toLowerCase()))];
const byTerm = Object.fromEntries(terms.map((t) => [t, 0]));
const byFile = {};
let scanned = 0;

for (const dir of dirs) {
  for (const f of files(dir)) {
    let text = '';
    if (TEXT.test(f)) text = readFileSync(f, 'utf8');
    else if (f.endsWith('.glb')) text = glbJson(readFileSync(f));
    else continue;
    scanned += 1;
    const hits = auditText(text, levels);
    if (!Object.keys(hits).length) continue;
    byFile[relative(repo, f)] = hits;
    for (const [t, n] of Object.entries(hits)) byTerm[t] += n;
  }
}

const total = Object.values(byTerm).reduce((a, b) => a + b, 0);
if (asJson) {
  console.log(JSON.stringify({ dirs: dirs.map((d) => relative(repo, d)), scanned, total, levelNames: levels, genericLevelNames: levels.filter((n) => GENERIC_LEVEL_NAMES.has(n)), byTerm, byFile }, null, 1));
} else {
  if (!dirs.length) console.log('ip-audit: nothing to scan (run `pnpm build:store` first)');
  console.log(`ip-audit: ${total} hits in ${Object.keys(byFile).length} of ${scanned} files scanned (${dirs.map((d) => relative(repo, d)).join(', ')})`);
  console.log(`terms: ${FRANCHISE_TERMS.length} franchise + ${levels.length} retired level names (${levels.filter((n) => GENERIC_LEVEL_NAMES.has(n)).length} generic: title context only)`);
  console.log('\nby term');
  for (const t of terms) if (byTerm[t]) console.log(`  ${String(byTerm[t]).padStart(6)}  ${t}`);
  console.log('\nby file');
  for (const [f, hits] of Object.entries(byFile).sort((a, b) => sum(b[1]) - sum(a[1]))) {
    console.log(`  ${String(sum(hits)).padStart(6)}  ${f}  (${Object.entries(hits).map(([t, n]) => `${t} ${n}`).join(', ')})`);
  }
  console.log(strict ? '' : '\n(report mode: exit 0; --strict fails on any hit)');
}
function sum(o) {
  return Object.values(o).reduce((a, b) => a + b, 0);
}
if (strict && total > 0) process.exit(1);
if (!dirs.length && strict) process.exit(1);
