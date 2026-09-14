/**
 * Trailer beat capture: one headless browser, many beats. Each beat is a recording
 * plus a physics-tick window; frames are rendered at `fps` (physicsHz / fps ticks per
 * frame) with setQuality('high') at width x height and written as PNGs, plus a
 * per-frame camera()/state log (for trimming) and an h264 intermediate.
 *
 *   npx tsx harness/trailer/capture-beats.ts harness/trailer/beats.json [--only id,id] [--fps 60] [--out harness/out/trailer/beats]
 *
 * beats.json: [{ id, recording, startTick, endTick, countdown?: boolean, hud?: boolean }]
 *   countdown: open the page with ?countdown=1 so the 3-2-1-GO plays before the recording (adds 3 s of ticks).
 *   hud: page.screenshot (DOM HUD included) instead of canvas grab (default true).
 */
import fs from 'node:fs';
import path from 'node:path';
import { expandFrames } from '../../src/core/replay';
import type { InputFrame } from '../../src/core/types';
import { flagNum, flagStr, parseArgs } from '../lib/args';
import { launchBrowser } from '../lib/browser';
import { encodeMp4 } from '../lib/ffmpeg';
import { HookClient, openGame } from '../lib/hook';
import { loadRecording } from '../lib/recording';
import { startServer } from '../lib/server';

interface Beat {
  id: string;
  recording: string;
  startTick: number;
  endTick: number;
  countdown?: boolean;
  hud?: boolean;
  quality?: 'low' | 'medium' | 'high';
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs();
  const listFile = positional[0];
  if (!listFile) throw new Error('usage: capture-beats.ts beats.json');
  const beats = JSON.parse(fs.readFileSync(listFile, 'utf8')) as Beat[];
  const only = typeof flags['only'] === 'string' ? new Set(flags['only'].split(',')) : null;
  const fps = flagNum(flags, 'fps', 60);
  const width = flagNum(flags, 'width', 1280);
  const height = flagNum(flags, 'height', 720);
  const outRoot = path.resolve(flagStr(flags, 'out', 'harness/out/trailer/beats'));
  fs.mkdirSync(outRoot, { recursive: true });

  const server = await startServer({ dev: false });
  const launched = await launchBrowser({ width, height });
  const pages = new Map<string, { hook: HookClient; page: typeof launched.page }>();
  const pageFor = async (countdown: boolean) => {
    const key = countdown ? 'cd' : 'plain';
    let p = pages.get(key);
    if (!p) {
      const page = key === 'plain' ? launched.page : await launched.context.newPage();
      await openGame(page, server.url, { query: countdown ? { countdown: '1' } : {} });
      p = { hook: new HookClient(page), page };
      pages.set(key, p);
    }
    return p;
  };
  try {
    for (const beat of beats) {
      if (only && !only.has(beat.id)) continue;
      const t0 = performance.now();
      const rec = loadRecording(beat.recording);
      const hz = rec.header.physicsHz;
      const tpf = hz / fps;
      const frames = expandFrames(rec);
      const { hook, page } = await pageFor(beat.countdown ?? false);
      if (!(await hook.loadTrack(rec.header.trackId, rec.header.seed))) throw new Error(`unknown track ${rec.header.trackId}`);
      await hook.resize(width, height);
      await hook.setQuality(beat.quality ?? 'high');
      // Countdown pages: the first 3 s of ticks are the countdown (input ignored) — prepend neutral frames.
      const preroll = beat.countdown ? 3 * hz : 0;
      const neutral: InputFrame = { ...frames[0]!, throttle: 0, brake: 0, lean: 0, restart: false } as InputFrame;
      const seq: InputFrame[] = preroll ? [...Array.from({ length: preroll }, () => neutral), ...frames] : [...frames];
      // Past the recording's end (finish-line tails) keep stepping with neutral input: the bike coasts.
      while (seq.length < beat.endTick) seq.push(neutral);
      const start = Math.floor(beat.startTick / tpf) * tpf;
      const end = Math.min(seq.length, beat.endTick);
      for (let t = 0; t < start; t += hz * 5) {
        const slice = seq.slice(t, Math.min(start, t + hz * 5));
        await page.evaluate((inputs) => {
          const tr = window.__trials!;
          for (const f of inputs) {
            tr.setInput(f);
            tr.step(1);
          }
        }, slice);
      }
      const dir = path.join(outRoot, beat.id);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const log: unknown[] = [];
      let k = 0;
      for (let t = start; t < end; t += tpf, k++) {
        const slice = seq.slice(t, t + tpf);
        const res = await page.evaluate(
          ([inputs, n, grab]) => {
            const tr = window.__trials!;
            for (const f of inputs) {
              tr.setInput(f);
              tr.step(1);
            }
            if (inputs.length < n) tr.step(n - inputs.length);
            tr.render();
            const s = tr.getState();
            const cam = tr.camera();
            const dataUrl = grab ? (document.querySelector('canvas') as HTMLCanvasElement).toDataURL('image/png') : null;
            return {
              tick: s.tick,
              x: s.bike.pos.x,
              y: s.bike.pos.y,
              vx: s.bike.vel.x,
              vy: s.bike.vel.y,
              angle: s.bike.angle,
              air: s.contacts.rear === null && s.contacts.front === null,
              faulted: s.faulted,
              finish: s.finishTime,
              phase: tr.phase(),
              runTime: tr.runTime(),
              cam,
              dataUrl,
            };
          },
          [slice, tpf, !(beat.hud ?? true)] as const,
        );
        const file = path.join(dir, `frame-${String(k).padStart(5, '0')}.png`);
        if (res.dataUrl) fs.writeFileSync(file, Buffer.from(res.dataUrl.split(',')[1]!, 'base64'));
        else await page.screenshot({ path: file, type: 'png', animations: 'disabled', caret: 'hide' });
        const { dataUrl: _d, ...rest } = res;
        log.push({ frame: k, absTick: t + tpf, ...rest });
      }
      fs.writeFileSync(path.join(dir, 'log.json'), JSON.stringify({ beat, fps, frames: k, log }, null, 1));
      await encodeMp4({ fps, pattern: path.join(dir, 'frame-%05d.png'), out: path.join(dir, 'beat.mp4') });
      console.log(`beat ${beat.id}: ${k} frames (${(k / fps).toFixed(2)} s) in ${((performance.now() - t0) / 1000).toFixed(0)} s -> ${dir}`);
    }
  } finally {
    await launched.close();
    await server.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
