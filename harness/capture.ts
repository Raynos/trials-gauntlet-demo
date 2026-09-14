/**
 * Evidence clip: drive the game deterministically from a recording and
 * capture every rendered frame at a fixed cadence, then encode with ffmpeg.
 *
 *   pnpm harness:capture <input-file> [--out harness/out/capture/<name>/clip.mp4]
 *        [--fps 60] [--width 1280] [--height 720] [--tail 1] [--no-stop-on-finish]
 *        [--mode screenshot|canvas] [--keep-frames] [--dev]
 *
 * Emits: clip.mp4 (h264 yuv420p), sheet.jpg (4x2 contact sheet), capture.json.
 * `screenshot` mode includes the DOM HUD; `canvas` mode grabs the WebGL
 * canvas via toDataURL (faster, no HUD).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandFrames, type InputRecording } from '../src/core/replay';
import { flagBool, flagNum, flagStr, parseArgs } from './lib/args';
import { launchBrowser } from './lib/browser';
import { contactSheet, encodeMp4, probeVideo } from './lib/ffmpeg';
import { HookClient, openGame } from './lib/hook';
import { describeRecording, loadRecording } from './lib/recording';
import { ensureOut, fail, printKV, writeJson } from './lib/report';
import { startServer } from './lib/server';
import type { InputFrame, PhysicsState } from '../src/core/types';

export interface CaptureOptions {
  recording: InputRecording;
  outMp4: string;
  fps?: number;
  width?: number;
  height?: number;
  /** Seconds to keep recording after finish/fault (shows the outcome). */
  tailSeconds?: number;
  stopOnFinish?: boolean;
  mode?: 'screenshot' | 'canvas';
  keepFrames?: boolean;
  dev?: boolean;
  build?: boolean;
  verbose?: boolean;
}

export interface CaptureResult {
  mp4: string;
  sheet: string;
  frames: number;
  seconds: number;
  /** Hash at the end of the clip (includes tail ticks after finish). */
  finalHash: string;
  ticksSimulated: number;
  finishTime: number | null;
  probe: Awaited<ReturnType<typeof probeVideo>>;
  wallMs: number;
}

export async function captureClip(o: CaptureOptions): Promise<CaptureResult> {
  const fps = o.fps ?? 60;
  const width = o.width ?? 1280;
  const height = o.height ?? 720;
  const hz = o.recording.header.physicsHz;
  if (hz % fps !== 0) throw new Error(`physicsHz ${hz} must be a multiple of fps ${fps}`);
  const ticksPerFrame = hz / fps;
  const frames = expandFrames(o.recording);
  const tailFrames = Math.round((o.tailSeconds ?? 1) * fps);
  const stopOnFinish = o.stopOnFinish ?? true;
  const mode = o.mode ?? 'screenshot';

  const outDir = path.dirname(path.resolve(o.outMp4));
  const framesDir = path.join(outDir, 'frames');
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const t0 = performance.now();
  const server = await startServer({ dev: o.dev ?? false, forceBuild: o.build ?? false });
  const launched = await launchBrowser({ width, height, logConsole: o.verbose ?? false });
  try {
    const { page } = launched;
    await openGame(page, server.url);
    const hook = new HookClient(page);
    if (!(await hook.loadTrack(o.recording.header.trackId, o.recording.header.seed))) {
      throw new Error(`unknown track ${o.recording.header.trackId}`);
    }
    await hook.resize(width, height);

    const framePaths: string[] = [];
    let finishedAt = -1;
    let lastState: PhysicsState | null = null;
    const totalVideoFrames = Math.ceil(frames.length / ticksPerFrame);
    // Run the recording to its end; when the run finishes early (and
    // stopOnFinish is set) stop after the tail; when it finishes on the
    // last recorded frame, extend by the tail so the outcome is visible.
    for (let k = 0; k < totalVideoFrames || (finishedAt >= 0 && k - finishedAt < tailFrames); k++) {
      const slice: InputFrame[] = frames.slice(k * ticksPerFrame, (k + 1) * ticksPerFrame);
      // Step this frame's ticks and render in one round trip.
      const res = await page.evaluate(
        ([inputs, n, grab]) => {
          const t = window.__trials!;
          for (const f of inputs) {
            t.setInput(f);
            t.step(1);
          }
          if (inputs.length < n) t.step(n - inputs.length); // tail: hold last input
          t.render();
          const state = t.getState();
          const dataUrl = grab ? (document.querySelector('canvas') as HTMLCanvasElement).toDataURL('image/png') : null;
          return { state, dataUrl };
        },
        [slice, ticksPerFrame, mode === 'canvas'] as const,
      );
      lastState = res.state;
      const file = path.join(framesDir, `frame-${String(k).padStart(5, '0')}.png`);
      if (mode === 'canvas' && res.dataUrl) {
        fs.writeFileSync(file, Buffer.from(res.dataUrl.split(',')[1]!, 'base64'));
      } else {
        await page.screenshot({ path: file, type: 'png', animations: 'disabled', caret: 'hide' });
      }
      framePaths.push(file);
      if (res.state.finished && finishedAt < 0) finishedAt = k;
      if (stopOnFinish && finishedAt >= 0 && k - finishedAt >= tailFrames) break;
    }
    const finalHash = await hook.hashState();

    await encodeMp4({ fps, pattern: path.join(framesDir, 'frame-%05d.png'), out: o.outMp4 });
    const sheet = path.join(outDir, 'sheet.jpg');
    await contactSheet({ frames: framePaths, out: sheet, cols: 4, rows: 2 });
    const probe = await probeVideo(o.outMp4);
    if (!(o.keepFrames ?? false)) fs.rmSync(framesDir, { recursive: true, force: true });

    return {
      mp4: o.outMp4,
      sheet,
      frames: framePaths.length,
      seconds: framePaths.length / fps,
      finalHash,
      ticksSimulated: lastState?.tick ?? 0,
      finishTime: lastState?.finishTime ?? null,
      probe,
      wallMs: performance.now() - t0,
    };
  } finally {
    await launched.close();
    await server.close();
  }
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs();
  const inputFile = positional[0];
  if (!inputFile) fail('usage: harness/capture.ts <input-file> --out clip.mp4');
  const recording = loadRecording(inputFile);
  const name = path.basename(inputFile).replace(/\.[^.]+$/, '');
  const outMp4 = path.resolve(flagStr(flags, 'out', path.join(ensureOut(path.join('capture', name)), 'clip.mp4')));
  console.log(`recording: ${describeRecording(recording)}`);
  const mode = flagStr(flags, 'mode', 'screenshot');
  if (mode !== 'screenshot' && mode !== 'canvas') fail('--mode must be screenshot|canvas');
  const result = await captureClip({
    recording,
    outMp4,
    fps: flagNum(flags, 'fps', 60),
    width: flagNum(flags, 'width', 1280),
    height: flagNum(flags, 'height', 720),
    tailSeconds: flagNum(flags, 'tail', 1),
    stopOnFinish: !flagBool(flags, 'no-stop-on-finish'),
    mode,
    keepFrames: flagBool(flags, 'keep-frames'),
    dev: flagBool(flags, 'dev'),
    build: flagBool(flags, 'build'),
    verbose: flagBool(flags, 'verbose'),
  });
  const reportFile = path.join(path.dirname(outMp4), 'capture.json');
  writeJson(reportFile, { input: path.resolve(inputFile), header: recording.header, ...result });
  if (flagBool(flags, 'json')) console.log(JSON.stringify(result));
  else {
    printKV('capture', {
      mp4: result.mp4,
      sheet: result.sheet,
      'frames captured': result.frames,
      'clip seconds': result.seconds.toFixed(2),
      'finish time (s)': result.finishTime,
      'ticks simulated': result.ticksSimulated,
      'final hash (end of clip)': result.finalHash,
      'wall ms': Math.round(result.wallMs),
    });
    if (result.probe) {
      printKV('ffprobe', {
        codec: result.probe.codec,
        size: `${result.probe.width}x${result.probe.height}`,
        fps: result.probe.fps,
        frames: result.probe.frames,
        'duration s': result.probe.durationSec.toFixed(3),
        bytes: result.probe.sizeBytes,
      });
    }
    console.log(`report: ${reportFile}`);
  }
  if (!result.probe || result.probe.frames !== result.frames) {
    fail(`ffprobe frame count ${result.probe?.frames ?? 'n/a'} != captured ${result.frames}`);
  }
}

const isEntry = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
