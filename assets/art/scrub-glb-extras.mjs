#!/usr/bin/env node
// Store release ip-audit (STORE_RELEASE.md bar 1): rewrite the retired franchise name out of the hero GLBs'
// provenance extras (scene.extras hero_revision / heroSourceSchema), and nothing else. The JSON chunk is
// re-serialised with only those strings replaced, re-padded to 4 bytes; the BIN chunk is copied byte for byte,
// so geometry, textures and the decoded mesh are untouched. Each <name>.source.json `exportSha256` and
// `verified.{bytes,sha256}` are restamped to the new file (the build's model-catalog hashes the served bytes).
//   node assets/art/scrub-glb-extras.mjs [--check]
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/models');
const check = process.argv.includes('--check');
const REPLACE = [
  ['angular factory trials reconstruction', 'angular factory reconstruction'],
  ['trials.bike.authoring.v1', 'rockhop.bike.authoring.v1'],
  ['trials.rider.authoring.v1', 'rockhop.rider.authoring.v1'],
];
const DENY = /trials|gauntlet|ubisoft|redlynx|evolution|rising|fusion|no fear|demo/i;
const sha = (b) => createHash('sha256').update(b).digest('hex');
let bad = 0;
for (const f of readdirSync(dir).filter((n) => n.endsWith('.glb')).sort()) {
  const p = join(dir, f);
  const buf = readFileSync(p);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${f}: not a GLB`);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const rest = buf.subarray(20 + jsonLen); // BIN chunk header + body, copied verbatim
  let changed = 0;
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== 'object') return;
    if (o.extras && typeof o.extras === 'object') for (const [k, v] of Object.entries(o.extras)) {
      if (typeof v !== 'string') continue;
      let s = v;
      for (const [a, b] of REPLACE) s = s.split(a).join(b);
      if (s !== v) { o.extras[k] = s; changed++; }
    }
    for (const v of Object.values(o)) walk(v);
  };
  walk(json);
  // Replace in the raw text (no re-serialisation: every number keeps its exact spelling), then prove the
  // result parses to exactly the walked JSON, i.e. only extras strings moved.
  let text = buf.subarray(20, 20 + jsonLen).toString('utf8').replace(/\s+$/, '');
  for (const [a, b] of REPLACE) text = text.split(JSON.stringify(a).slice(1, -1)).join(JSON.stringify(b).slice(1, -1));
  if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(json)) throw new Error(`${f}: a replaced string sits outside extras`);
  if (DENY.test(text)) { console.log(f, 'STILL HITS', text.match(DENY)[0]); bad++; }
  if (check || !changed) { console.log(f.padEnd(40), changed ? `${changed} extras to rewrite` : 'clean'); continue; }
  while (Buffer.byteLength(text) % 4) text += ' ';
  const jb = Buffer.from(text, 'utf8');
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(buf.readUInt32LE(4), 4);
  head.writeUInt32LE(20 + jb.length + rest.length, 8);
  head.writeUInt32LE(jb.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  const out = Buffer.concat([head, jb, rest]);
  writeFileSync(p, out);
  const src = p.replace(/\.glb$/, '.source.json');
  if (existsSync(src)) {
    const a = JSON.parse(readFileSync(src, 'utf8'));
    const digest = sha(out);
    a.exportSha256 = digest;
    if (a.verified) { a.verified.sha256 = digest; a.verified.bytes = out.length; }
    a.extrasScrub ??= { script: 'assets/art/scrub-glb-extras.mjs', previousSha256: sha(buf), note: 'provenance extras only; BIN chunk byte-identical' };
    writeFileSync(src, JSON.stringify(a, null, 2) + '\n');
  }
  console.log(f.padEnd(40), `${changed} extras rewritten`, buf.length, '->', out.length);
}
process.exit(bad ? 1 : 0);
