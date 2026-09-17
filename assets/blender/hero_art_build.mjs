/** Rebuild the hero-art GLBs in public/models from Astra's delivery (ask 43).
 *
 *  node assets/blender/hero_art_build.mjs [names...] [--lod-only|--full-only] [--stage 0] [--scratch DIR] [--dry]
 *
 *  Per output: decode the Meshopt delivery (Blender cannot import it) -> Blender import/reduce/export uncompressed
 *  (hero_art_import.py) -> hero_art_pack.mjs (high-precision Meshopt) -> verify_hero_art.mjs against the decoded
 *  delivery -> copy into public/models with a <name>.source.json audit. Nothing is published unless verification passes.
 *  Every X.glb needs its X-lod.glb twin (src/boot/model-catalog.ts), so a name always builds both unless told otherwise.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { pack } from './hero_art_pack.mjs';
import { verifyRider, verifyBike } from './verify_hero_art.mjs';
import { glbStats } from './glb_stats.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const BLENDER = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const DELIVERY = 'assets/blender/hero-art/delivery';  // byte-for-byte copies of the selection; manifest.json has the prototype paths + sha256
const UNPACK = 'assets/blender/unpack_meshopt.mjs';

/** Game outputs -> delivery selections (OPUS_HANDOFF.md "Exact selections"; manifest.json in DELIVERY maps back to the prototype). */
export const OUTPUTS = {
  'rider-street-mustard': { kind: 'rider', source: `${DELIVERY}/street01-rider-round33-lossless.glb`, compressed: true, full: { tris: 60000, draws: 8 }, lod: { tris: 8000, draws: 8 } },
  'rider-street-charcoal': { kind: 'rider', source: `${DELIVERY}/street-charcoal.glb`, compressed: true, full: { tris: 60000, draws: 8 }, lod: { tris: 8000, draws: 8 } },
  'rider-street-openface': { kind: 'rider', source: `${DELIVERY}/street-openface-remaster.glb`, compressed: true, full: { tris: 60000, draws: 8 }, lod: { tris: 8000, draws: 8 } },
  'rider-race-bluewhite': { kind: 'rider', source: `${DELIVERY}/race-bluewhite.glb`, compressed: false, full: { tris: 45000, draws: 12 }, lod: { tris: 8000, draws: 12 } },
  'rider-race-charcoalyellow': { kind: 'rider', source: `${DELIVERY}/race-charcoalyellow.glb`, compressed: false, full: { tris: 45000, draws: 12 }, lod: { tris: 8000, draws: 12 } },
  'bike-rookie': { kind: 'bike', source: `${DELIVERY}/bike-rookie-art.glb`, compressed: true, full: { tris: 33500, draws: 24 }, lod: { tris: 6000, draws: 24 } },
  'bike-pro': { kind: 'bike', source: `${DELIVERY}/bike-pro-art.glb`, compressed: true, full: { tris: 33500, draws: 24 }, lod: { tris: 6000, draws: 24 } },
};

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function run(cmd, args, what) {
  const result = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    process.stderr.write(result.stdout.split('\n').filter(l => !/INFO/.test(l)).slice(-40).join('\n') + '\n' + result.stderr);
    throw new Error(`${what} failed (${cmd} exit ${result.status})`);
  }
  return result.stdout;
}

export async function build(name, { lod, stage = 0, scratch, dry = false }) {
  const spec = OUTPUTS[name];
  if (!spec) throw new Error(`unknown output ${name}; known: ${Object.keys(OUTPUTS).join(', ')}`);
  const budget = lod ? spec.lod : spec.full;
  const outName = lod ? `${name}-lod` : name;
  fs.mkdirSync(scratch, { recursive: true });
  const source = path.join(ROOT, spec.source);
  const sourceSha = sha256(source);
  let decoded = source;
  if (spec.compressed) {
    decoded = path.join(scratch, `${name}.decoded.glb`);
    if (!fs.existsSync(decoded) || fs.readFileSync(decoded).length === 0 || (fs.statSync(decoded).mtimeMs < fs.statSync(source).mtimeMs)) {
      run('node', [UNPACK, source, decoded], 'decode delivery');
    }
  }
  const rawOut = path.join(scratch, `${outName}.raw.glb`);
  const report = path.join(scratch, `${outName}.blender.json`);
  const blenderArgs = ['-b', '--python-exit-code', '1', '--python', 'assets/blender/hero_art_import.py', '--',
    '--input', decoded, '--output', rawOut, '--kind', spec.kind, '--tris', String(budget.tris), '--report', report,
    '--stage', String(stage), '--no-meshopt'];
  if (lod) blenderArgs.push('--lod', '--min-tris', spec.kind === 'bike' ? '24' : '120');
  const t0 = Date.now();
  const log = run(BLENDER, blenderArgs, `blender ${outName}`);
  const blenderSeconds = (Date.now() - t0) / 1000;
  const packed = path.join(scratch, `${outName}.glb`);
  const packReport = await pack(rawOut, packed, {});
  const verified = spec.kind === 'bike'
    ? await verifyBike(decoded, packed, { tris: budget.tris, draws: budget.draws })
    : await verifyRider(decoded, packed, { tris: budget.tris, draws: budget.draws });
  const reduce = JSON.parse(fs.readFileSync(report, 'utf8'));
  const stats = glbStats(packed);
  const audit = {
    source: spec.source,
    sourceSha256: sourceSha,
    decodedSha256: spec.compressed ? sha256(decoded) : sourceSha,
    exportSha256: verified.sha256,
    kind: spec.kind,
    lod,
    stage,
    recipe: `node assets/blender/hero_art_build.mjs ${name}${lod ? ' --lod-only' : ' --full-only'} --stage ${stage}`,
    tools: { blender: 'Blender 5.2.1 (io_scene_gltf2 import/export, uncompressed)', pack: 'assets/blender/hero_art_pack.mjs (meshoptimizer JS encoder)', verify: 'assets/blender/verify_hero_art.mjs (three GLTFLoader + MeshoptDecoder, no browser)' },
    budgets: budget,
    reduced: {
      triangles: reduce.triangles,
      dropped: reduce.dropped,
      joined: reduce.joined,
      decimated: reduce.decimated.filter(d => d.before !== d.after),
      images: reduce.images.filter(i => i.from[0] !== i.to[0] || i.from[1] !== i.to[1]),
      clips: reduce.clips ?? null,
      hair: reduce.hair ?? null,
      handFloors: reduce.handFloors ?? null,
      raceHelmet: reduce.raceHelmet ?? null,
      atlas: reduce.atlas ? { size: reduce.atlas.size, parts: reduce.atlas.parts ?? null } : null,
    },
    compression: { positionBits: packReport.positionBits, normalBits: packReport.normalBits, quatBits: packReport.quatBits, lossless: ['indices (triangle order/winding)', 'UV', 'joints', 'weights', 'scale', 'inverse binds', 'clip times'], rawBytes: packReport.inputBytes, packedBytes: packReport.outputBytes },
    verified: { ...verified, sockets: undefined, socketNames: verified.sockets, imageList: stats.imageList.map(i => ({ name: i.name, kind: i.kind, w: i.w, h: i.h, bytes: i.bytes })), meshList: stats.meshList },
    blenderSeconds,
  };
  if (!dry) {
    const dest = path.join(ROOT, 'public', 'models', `${outName}.glb`);
    fs.copyFileSync(packed, dest);
    fs.writeFileSync(path.join(ROOT, 'public', 'models', `${outName}.source.json`), JSON.stringify(audit, null, 2) + '\n');
  }
  return { outName, bytes: verified.bytes, triangles: verified.triangles, draws: verified.draws, images: verified.images, maxTexture: verified.maxTexture, blenderSeconds };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const get = flag => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const names = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--stage', '--scratch'].includes(argv[i - 1])));
  const scratch = path.resolve(get('--scratch') ?? process.env.HERO_ART_SCRATCH ?? path.join(ROOT, 'harness', 'out', 'hero-art'));
  const stage = +(get('--stage') ?? 1);
  const dry = argv.includes('--dry');
  const rows = [];
  for (const name of names.length ? names : Object.keys(OUTPUTS)) {
    for (const lod of [false, true]) {
      if (lod && argv.includes('--full-only')) continue;
      if (!lod && argv.includes('--lod-only')) continue;
      const row = await build(name, { lod, stage, scratch, dry });
      rows.push(row);
      console.log(`${row.outName.padEnd(30)} ${(row.bytes / 1e6).toFixed(2).padStart(6)} MB  ${String(row.triangles).padStart(6)} tris  ${String(row.draws).padStart(3)} draws  ${String(row.images).padStart(2)} images (max ${row.maxTexture})  blender ${row.blenderSeconds.toFixed(0)} s`);
    }
  }
}
