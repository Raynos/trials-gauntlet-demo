#!/usr/bin/env -S npx tsx
/**
 * Track thumbnails from real renders (not generated art).
 *
 *   npx tsx assets/art/thumbs.mts [--tracks a,b] [--build] [--width 1280] [--height 720] [--out 768]
 *
 * For every curriculum track: pick the best recording under harness/inputs/<track>/ (the same
 * ranking `harness:clip` uses), find the first tick the bike passes the track's set-piece x
 * (table below, from docs/design/tracks.md / describeTrack), simulate to it in the headless
 * game with `setQuality('high')`, render one frame at 1280x720 and write
 * public/art/thumbs/<track>.webp at 768x432 (<= 60 KB), plus a 1280x720 PNG proof in
 * assets/art/raw/thumbs/. Re-run every release; `node assets/art/build.mjs` then folds the
 * thumbs into the art manifests (runtime-manifest.mjs) (kind `thumb`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expandFrames } from '../../src/core/replay';
import type { InputFrame } from '../../src/core/types';
import { candidateRecordings, pickBestRecording, tickAtX } from '../../harness/clip';
import { flagBool, flagNum, flagStr, parseArgs } from '../../harness/lib/args';
import { launchBrowser } from '../../harness/lib/browser';
import { HookClient, openGame } from '../../harness/lib/hook';
import { loadRecording } from '../../harness/lib/recording';
import { startServer } from '../../harness/lib/server';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

/**
 * Set-piece x per ROCKHOP course (store release round 2): where the bike is when the shot is taken — about 4 m
 * before the course's signature zone prop (docs/evidence/store-release/world/README.md prop table), so the prop
 * fills the right of the frame. The retired curriculum's thumbs left with its tracks (46fa2d44).
 */
export const THUMB_X: Record<string, { x: number; what: string }> = {
  'c1-low-tide': { x: 307.7, what: 'the container steps on the quay' },
  'c2-crane-hop': { x: 46, what: 'onto the timber pier over the harbour' },
  'c3-hull-breach': { x: 62, what: 'the rusted hull ramp' },
  'a1-sawdust': { x: 280, what: 'the water flume on trestles' },
  'a2-log-jam': { x: 115, what: 'the log teetering on the jam' },
  'a3-timberline': { x: 247.3, what: 'the logging truck bed' },
  'd1-dust-devil': { x: 27, what: 'the cut sandstone blocks under the gantry' },
  'd2-conveyor': { x: 57.3, what: 'the belt conveyor ramp' },
  'd3-rope-walk': { x: 349.4, what: 'the rope bridge' },
  's1-lift-line': { x: 353.9, what: 'the lift tower platform' },
  's2-cornice': { x: 139.9, what: 'the wind cornice' },
  's3-whiteout': { x: 197, what: 'the avalanche fence ledge' },
  'p-coast': { x: 278, what: 'the container yard' },
  'p-alpine': { x: 141.6, what: 'the log see-saw' },
  'p-quarry': { x: 58.4, what: 'the conveyor' },
  'p-snowline': { x: 109.5, what: 'the snow-cat' },
};

const sh = (cmd: string, args: string[]): string => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

async function main(): Promise<void> {
  const { flags } = parseArgs();
  const only = flagStr(flags, 'tracks', '');
  const width = flagNum(flags, 'width', 1280);
  const height = flagNum(flags, 'height', 720);
  const outW = flagNum(flags, 'out', 768);
  const ids = Object.keys(THUMB_X).filter((id) => !only || only.split(',').includes(id));
  const pubDir = path.join(repo, 'public/art/thumbs');
  const rawDir = path.join(here, 'raw/thumbs');
  fs.mkdirSync(pubDir, { recursive: true });
  fs.mkdirSync(rawDir, { recursive: true });

  const server = await startServer({ forceBuild: flagBool(flags, 'build') });
  const launched = await launchBrowser({ width, height });
  const report: Record<string, unknown>[] = [];
  try {
    const { page } = launched;
    await openGame(page, server.url);
    const hook = new HookClient(page);
    for (const id of ids) {
      const t0 = performance.now();
      const best = await pickBestRecording(id);
      if (!best) {
        console.log('SKIP', id, 'no recording');
        continue;
      }
      const { x, what } = THUMB_X[id]!;
      // The best recording first; if it never reaches x (a fresh bot run that walled early while the
      // physics owner retunes), fall back to any other recording under inputs/<track>/ that does.
      let rec = loadRecording(best.file);
      let tick = await tickAtX(rec, x);
      let file = best.file;
      if (tick === null) {
        for (const f of candidateRecordings(id).filter((f) => f !== best.file)) {
          const r = loadRecording(f);
          const t = await tickAtX(r, x);
          if (t !== null) {
            rec = r;
            tick = t;
            file = f;
            break;
          }
        }
      }
      if (tick === null) {
        console.log('SKIP', id, `no recording under harness/inputs/${id}/ reaches x=${x}`);
        continue;
      }
      if (!(await hook.loadTrack(id, rec.header.seed))) throw new Error(`unknown track ${id}`);
      await hook.resize(width, height);
      await hook.setQuality('high');
      // Let the art pack settle (renderer.whenReady is not on the hook) without rendering: the first
      // render must be the hard cut after the prefix, or the rig primes at x=0 and a 30 s dt wrecks it.
      await page.waitForTimeout(3500);
      const hz = rec.header.physicsHz;
      const warm = Math.round(hz * 0.3);
      const all = expandFrames(rec);
      const prefix = all.slice(0, Math.max(0, tick - warm));
      for (let t = 0; t < prefix.length; t += hz * 5) {
        const slice: InputFrame[] = prefix.slice(t, Math.min(prefix.length, t + hz * 5));
        await page.evaluate((inputs) => {
          const tr = window.__rockhop!;
          for (const f of inputs) {
            tr.setInput(f);
            tr.step(1);
          }
        }, slice);
      }
      // Rendered run-in to the target tick: frame 1 is the cut (rig snaps), the rest warm the follow.
      const warmFrames = all.slice(prefix.length, tick);
      let state = await hook.getState();
      for (let k = 0; k < warmFrames.length; k += 2) {
        const slice: InputFrame[] = warmFrames.slice(k, k + 2);
        state = await page.evaluate((inputs) => {
          const tr = window.__rockhop!;
          for (const f of inputs) {
            tr.setInput(f);
            tr.step(1);
          }
          tr.render();
          return tr.getState();
        }, slice);
      }
      await hook.render(true);
      const dataUrl = await page.evaluate(() => (document.querySelector('canvas') as HTMLCanvasElement).toDataURL('image/png'));
      const rawPng = path.join(rawDir, `${id}.png`);
      fs.writeFileSync(rawPng, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
      const out = path.join(pubDir, `${id}.webp`);
      const outH = Math.round((outW * height) / width);
      const tmp = path.join(rawDir, `.${id}-resized.png`);
      sh('magick', [rawPng, '-strip', '-filter', 'Lanczos', '-resize', `${outW}x${outH}!`, '-unsharp', '0x0.6+0.5+0.02', 'PNG24:' + tmp]);
      let q = 78;
      for (;;) {
        sh('cwebp', ['-quiet', '-q', String(q), '-m', '6', '-sharp_yuv', '-metadata', 'none', tmp, '-o', out]);
        if (fs.statSync(out).size <= 60 * 1024 || q <= 40) break;
        q -= 6;
      }
      fs.rmSync(tmp, { force: true });
      const kb = (fs.statSync(out).size / 1024).toFixed(0);
      const line = { id, x, what, tick, bikeX: +state.bike.pos.x.toFixed(1), recording: path.relative(repo, file), q, bytes: fs.statSync(out).size, wallS: +((performance.now() - t0) / 1000).toFixed(1) };
      report.push(line);
      console.log(`${id.padEnd(22)} x=${x} tick=${tick} bike.x=${line.bikeX} q=${q} ${kb} KB ${line.wallS}s`);
    }
  } finally {
    await launched.close();
    await server.close();
  }
  // Merge into the existing table so a partial --tracks run keeps the other entries.
  const metaFile = path.join(rawDir, 'thumbs.json');
  const prev: Record<string, unknown>[] = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')).thumbs ?? [] : [];
  const merged = Object.keys(THUMB_X).map((id) => report.find((r) => r.id === id) ?? prev.find((r) => r.id === id)).filter(Boolean);
  fs.writeFileSync(metaFile, JSON.stringify({ generatedAt: new Date().toISOString(), width, height, outW, thumbs: merged }, null, 1));
  await foldIntoManifests(merged as { id: string; x: number; what: string; recording: string }[]);
}

/**
 * Fold the thumbs into both art manifests (kind `thumb`, the card lookup `ArtManifest.thumbFor`) without re-running
 * the whole art build: every existing `thumb` entry is replaced by this table's, with the file's own `v` hash and
 * the course's zone and tier; the full manifest's summary and the prompt-free runtime copy are re-derived.
 */
async function foldIntoManifests(thumbs: { id: string; x: number; what: string; recording: string }[]): Promise<void> {
  const { createHash } = await import('node:crypto');
  const { fullManifest, writeManifests, FULL_MANIFEST } = (await import('./runtime-manifest.mjs')) as unknown as { fullManifest(a: unknown[], r: unknown, g?: string): unknown; writeManifests(f: unknown): void; FULL_MANIFEST: string };
  const { ROCKHOP_ALL, rockhopMeta } = await import('../../src/tracks/rockhop');
  const full = JSON.parse(fs.readFileSync(FULL_MANIFEST, 'utf8')) as { assets: Record<string, unknown>[]; rejected: unknown };
  const kept = full.assets.filter((a) => a.kind !== 'thumb');
  for (const t of thumbs) {
    const rel = `thumbs/${t.id}.webp`;
    const f = path.join(repo, 'public/art', rel);
    if (!fs.existsSync(f)) continue;
    const def = ROCKHOP_ALL.find((d) => d.id === t.id);
    const dims = sh('magick', ['identify', '-format', '%w %h', f]).split(' ').map(Number);
    const buf = fs.readFileSync(f);
    kept.push({ id: `thumb-${t.id}`, path: 'art/' + rel, kind: 'thumb', track: t.id, tier: def?.tier, biome: def?.meta?.biome, zone: def ? rockhopMeta(def).zone : undefined, atX: t.x, shot: t.what, recording: t.recording, rendered: true, w: dims[0], h: dims[1], bytes: buf.length, src: 'thumbs.mts', prompt: '', v: createHash('sha256').update(buf).digest('hex').slice(0, 8) });
  }
  writeManifests(fullManifest(kept, full.rejected));
  console.log(`art manifests: ${thumbs.length} thumbs folded in`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
