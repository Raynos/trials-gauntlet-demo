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

/** Set-piece x per track: where the bike is when the shot is taken (the feature fills the right of the frame). */
export const THUMB_X: Record<string, { x: number; what: string }> = {
  'b1-first-ride': { x: 470, what: 'the 21 m descent into the brake zone and low plateau' },
  'b2-lean-back': { x: 535.5, what: 'leaving the 1.8 m container drop onto the landing ramp' },
  'b3-kicker-row': { x: 391, what: 'launched off the 5x1.5 kicker over the 4 m gap' },
  'e1-uphill-weight': { x: 437.5, what: 'on the 48 deg plank' },
  'e2-rear-wheel-first': { x: 487.5, what: 'leaving the kicker lip toward the 5 m gap' },
  'e3-stairway': { x: 404, what: 'climbing the eight-step stair' },
  'm1-hop-up': { x: 379.5, what: 'the 2 m hop across from the 0.9 m ledge' },
  'm2-drum-roll': { x: 301, what: 'drum top before the 2 m gap' },
  'm3-see-saw': { x: 389, what: 'gap onto the see-saw' },
  'h1-wheelie-wire': { x: 539, what: 'wheelie along the rail slots after the 1.4 m lip' },
  'h2-gap-chain': { x: 525.5, what: 'the kicker lip into the lipped gap chain' },
  'h3-fire-line': { x: 459, what: 'the kicker lip before the six burning barrels' },
  'x1-vertical-limit': { x: 531, what: 'on the 60 deg plank' },
  'x2-pipe-dream': { x: 365, what: 'the spinning drum shelf over molten metal' },
  'x3-gauntlet': { x: 414.5, what: 'the kicker lip before the fire line' },
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
          const tr = window.__trials!;
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
          const tr = window.__trials!;
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
