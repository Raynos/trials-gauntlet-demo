#!/usr/bin/env node
// IP audit of the store artefacts (docs/plans/STORE_RELEASE.md bar 1, P0.4).
//
//   node scripts/ip-audit.mjs [--strict] [--json] [dir ...]
//
// Scans the BUILT store artefacts — `dist/` from `pnpm build:store`, plus `ios/`, `android/` and `store/` when
// they exist (or the dirs given) — for case-insensitive hits of the denylist: the Trials / Ubisoft / RedLynx
// names, "gauntlet", "no fear", "demo", and every level name that ships today (all of them retire, D6; read
// from src/tracks). Internal code and docs are out of scope; what a reviewer or player can extract is in.
//
// Text files are read whole; a .glb's JSON chunk is read (node and material names ship in it). Other binaries
// (images, audio, fonts) are skipped. Reports hits per term and per file. Exits 1 on any hit only with
// --strict: until the rename (Phase 1) and the new levels (Phase 3) land it is a baseline, not a gate.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const asJson = args.includes('--json');
const dirsArg = args.filter((a) => !a.startsWith('--'));
const dirs = (dirsArg.length ? dirsArg : ['dist', 'ios', 'android', 'store']).map((d) => resolve(repo, d)).filter((d) => existsSync(d));

const BASE_TERMS = ['trials', 'gauntlet', 'ubisoft', 'redlynx', 'evolution', 'rising', 'fusion', 'no fear', 'demo'];

/** Every track name authored in src/tracks: `course('<id>', '<Name>'`, `playground('<id>', '<Name>'` and `name: '<Name>'`. */
function levelNames() {
  const names = new Set();
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) {
        const src = readFileSync(p, 'utf8');
        for (const m of src.matchAll(/\b(?:course|playground)\(\s*'[^']+',\s*'([^']+)'/g)) names.add(m[1]);
        for (const m of src.matchAll(/^\s*name: '([^']+)',/gm)) names.add(m[1]);
      }
    }
  };
  walk(join(repo, 'src', 'tracks', 'courses'));
  return [...names].sort((a, b) => a.localeCompare(b));
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

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const levels = levelNames();
const terms = [...BASE_TERMS, ...levels.filter((n) => !BASE_TERMS.includes(n.toLowerCase()))];
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
    const rel = relative(repo, f);
    for (const t of terms) {
      const n = (text.match(new RegExp(escape(t), 'gi')) ?? []).length;
      if (!n) continue;
      byTerm[t] += n;
      (byFile[rel] ??= {})[t] = n;
    }
  }
}

const total = Object.values(byTerm).reduce((a, b) => a + b, 0);
if (asJson) {
  console.log(JSON.stringify({ dirs: dirs.map((d) => relative(repo, d)), scanned, total, byTerm, byFile }, null, 1));
} else {
  if (!dirs.length) console.log('ip-audit: nothing to scan (run `pnpm build:store` first)');
  console.log(`ip-audit: ${total} hits in ${Object.keys(byFile).length} of ${scanned} files scanned (${dirs.map((d) => relative(repo, d)).join(', ')})`);
  console.log('\nby term');
  for (const t of terms) if (byTerm[t]) console.log(`  ${String(byTerm[t]).padStart(6)}  ${t}`);
  console.log('\nby file');
  for (const [f, hits] of Object.entries(byFile).sort((a, b) => sum(b[1]) - sum(a[1]))) {
    console.log(`  ${String(sum(hits)).padStart(6)}  ${f}  (${Object.entries(hits).map(([t, n]) => `${t} ${n}`).join(', ')})`);
  }
  console.log(strict ? '' : '\n(baseline mode: exit 0; --strict fails on any hit)');
}
function sum(o) {
  return Object.values(o).reduce((a, b) => a + b, 0);
}
if (strict && total > 0) process.exit(1);
if (!dirs.length && strict) process.exit(1);
