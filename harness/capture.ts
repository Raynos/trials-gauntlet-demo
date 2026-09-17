/**
 * Evidence clip: drive the game deterministically from a recording and
 * capture every rendered frame at a fixed cadence, then encode with ffmpeg.
 *
 *   pnpm harness:capture <input-file> [--out harness/out/capture/<name>/clip.mp4]
 *        [--fps 60] [--width 1280] [--height 720] [--tail 1] [--no-stop-on-finish]
 *        [--mode screenshot|canvas] [--keep-frames] [--dev] [--quality high] [--from-tick N] [--to-tick N]
 *        [--rider-probe]   (round 13b: per-frame simulated-vs-drawn rider torso → rider-probe.json, summary in capture.json)
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
import type { InputFrame, PhysicsState, QualityTier } from '../src/core/types';

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
  /** Renderer quality tier applied after loadTrack (harness:clip uses 'high'). */
  quality?: QualityTier;
  /**
   * Physics-tick window to render. Ticks before `startTick` are simulated without
   * rendering (the same recording, so the state is identical); rendering stops after
   * `endTick` (exclusive) or at the finish tail. Both default to the whole recording.
   */
  startTick?: number;
  endTick?: number;
  /** Contact sheet grid (default 4x2). */
  sheetCols?: number;
  sheetRows?: number;
  /** Per-frame `camera()` check (default on): bike inside the CAMERA_BOX, |roll| < 1e-6, clamped-frame count. */
  cameraCheck?: boolean;
  /**
   * Round 13b (Rider on Glass H): per rendered frame, read the simulated rider body against the drawn one —
   * physics `riderBody.angle − chassis angle`, the hero chain's `torsoAngle`, the chest bone's world pitch in
   * the bike frame and `GltfRider.debug.physicalPose` — through `window.__render`. Off by default; `--rider-probe`.
   */
  riderProbe?: boolean;
}

/** One rendered frame of the rider probe (`CaptureOptions.riderProbe`). Angles in radians. */
export interface RiderProbeRow {
  frame: number;
  tick: number;
  phase: string;
  /** `PhysicsState.riderBody` was present this tick. */
  present: boolean;
  /** Physics: rider body angle minus chassis angle (the lag the hero is meant to draw). */
  physRel: number;
  /** Render: the hero chain's torso angle (bike frame; `GltfRider.chain.torsoAngle`), NaN without a chain. */
  chainTorso: number;
  /** Render: the skinned chest bone's up axis, expressed in the bike frame, as a lean from the frame's up (NaN when no bone). */
  meshTorso: number;
  /** `GltfRider.debug.physicalPose` — the body-driven path (chainFromBody) posed this frame. */
  physicalPose: boolean;
  additiveWeight: number;
}

export interface RiderProbe {
  rows: RiderProbeRow[];
  /** Frames on which `physicalPose` was true / riderBody was present. */
  physicalPoseFrames: number;
  presentFrames: number;
  /** Population std-dev over the clip, radians. */
  stdPhysRel: number;
  stdChainTorso: number;
  stdMeshTorso: number;
  /** Pearson r between physRel and chainTorso / meshTorso over frames where both are finite. */
  rChainPhys: number;
  rMeshPhys: number;
  min: { physRel: number; meshTorso: number };
  max: { physRel: number; meshTorso: number };
}

/** The screen-space band the followed bike must stay in (rig.ts: "the bike stays inside the central [0.2, 0.8] box"). */
export const CAMERA_BOX = { min: 0.2, max: 0.8 } as const;
export const CAMERA_ROLL_MAX = 1e-6;

export interface CameraFrameViolation {
  frame: number;
  tick: number;
  x: number;
  y: number;
  roll: number;
  state: string | null;
  clamped: boolean;
}

/** Aggregate of `camera()` over every rendered frame of a clip. */
export interface CameraCheck {
  frames: number;
  box: { min: number; max: number };
  /** Frames whose bike centre left the box (any phase). */
  outOfBox: number;
  /** ... of which while riding (the ones that matter; crash/finish hold states are reported separately). */
  outOfBoxRiding: number;
  rollViolations: number;
  maxAbsRoll: number;
  /** Frames the rig had to clamp its position to the track's camera bounds. */
  clamped: number;
  clampedPct: number;
  /** Frames per rig state name. */
  states: Record<string, number>;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** First few offending frames. */
  violations: CameraFrameViolation[];
  /** Windowed clips (startTick > 0) start the rig cold: the first 0.5 s of frames are counted here and not judged. */
  settleExcluded: number;
  pass: boolean;
}

/** Rig settle time excluded from the assertion when a clip starts mid-recording (the prefix ran without rendering). */
export const CAMERA_SETTLE_S = 0.5;

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
  /** Null when the renderer has no `camera()` or the check was turned off. */
  camera: CameraCheck | null;
  /** Null unless `riderProbe` was requested (and the page exposes `window.__render`). */
  rider: RiderProbe | null;
}

type RiderSample = { present: boolean; physRel: number; chainTorso: number; meshTorso: number; physicalPose: boolean; additiveWeight: number } | null;

function stats(xs: number[]): { mean: number; std: number } {
  const n = xs.length;
  if (n === 0) return { mean: NaN, std: NaN };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const v = xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  return { mean, std: Math.sqrt(v) };
}

function pearson(xs: number[], ys: number[]): number {
  const pairs = xs.map((x, i) => [x, ys[i]!] as const).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return NaN;
  const a = stats(pairs.map((p) => p[0]));
  const b = stats(pairs.map((p) => p[1]));
  if (a.std === 0 || b.std === 0) return NaN;
  let c = 0;
  for (const [x, y] of pairs) c += (x - a.mean) * (y - b.mean);
  return c / pairs.length / (a.std * b.std);
}

function finishRider(rows: RiderProbeRow[]): RiderProbe {
  const phys = rows.map((r) => r.physRel);
  const chain = rows.map((r) => r.chainTorso);
  const mesh = rows.map((r) => r.meshTorso);
  const fin = (xs: number[]) => xs.filter((x) => Number.isFinite(x));
  const r4 = (x: number) => (Number.isFinite(x) ? +x.toFixed(4) : x);
  return {
    rows,
    physicalPoseFrames: rows.filter((r) => r.physicalPose).length,
    presentFrames: rows.filter((r) => r.present).length,
    stdPhysRel: r4(stats(fin(phys)).std),
    stdChainTorso: r4(stats(fin(chain)).std),
    stdMeshTorso: r4(stats(fin(mesh)).std),
    rChainPhys: r4(pearson(phys, chain)),
    rMeshPhys: r4(pearson(phys, mesh)),
    min: { physRel: r4(Math.min(...fin(phys))), meshTorso: r4(Math.min(...fin(mesh))) },
    max: { physRel: r4(Math.max(...fin(phys))), meshTorso: r4(Math.max(...fin(mesh))) },
  };
}

type CamSample = { bikeScreenX: number; bikeScreenY: number; roll?: number | undefined; state?: string | undefined; clamped?: boolean | undefined; phase?: string | undefined } | null;

function newCameraCheck(): CameraCheck {
  return { frames: 0, box: { ...CAMERA_BOX }, outOfBox: 0, outOfBoxRiding: 0, rollViolations: 0, maxAbsRoll: 0, clamped: 0, clampedPct: 0, states: {}, minX: 1, maxX: 0, minY: 1, maxY: 0, violations: [], settleExcluded: 0, pass: true };
}

function accumulateCamera(c: CameraCheck, s: NonNullable<CamSample>, frame: number, tick: number, settle: boolean): void {
  c.frames++;
  if (settle) {
    c.settleExcluded++;
    return;
  }
  const x = s.bikeScreenX;
  const y = s.bikeScreenY;
  const roll = Math.abs(s.roll ?? 0);
  const state = s.state ?? null;
  c.states[state ?? 'n/a'] = (c.states[state ?? 'n/a'] ?? 0) + 1;
  if (x < c.minX) c.minX = x;
  if (x > c.maxX) c.maxX = x;
  if (y < c.minY) c.minY = y;
  if (y > c.maxY) c.maxY = y;
  if (roll > c.maxAbsRoll) c.maxAbsRoll = roll;
  if (s.clamped) c.clamped++;
  const out = x < CAMERA_BOX.min || x > CAMERA_BOX.max || y < CAMERA_BOX.min || y > CAMERA_BOX.max;
  const rollBad = roll >= CAMERA_ROLL_MAX;
  if (out) {
    c.outOfBox++;
    if (s.phase === 'riding') c.outOfBoxRiding++;
  }
  if (rollBad) c.rollViolations++;
  if ((out || rollBad) && c.violations.length < 12) c.violations.push({ frame, tick, x: +x.toFixed(3), y: +y.toFixed(3), roll: +roll.toExponential(2), state, clamped: s.clamped === true });
}

function finishCamera(c: CameraCheck | null): CameraCheck | null {
  if (!c || c.frames === 0) return null;
  c.clampedPct = +((100 * c.clamped) / c.frames).toFixed(1);
  c.minX = +c.minX.toFixed(3);
  c.maxX = +c.maxX.toFixed(3);
  c.minY = +c.minY.toFixed(3);
  c.maxY = +c.maxY.toFixed(3);
  // Pass = the bike never left the box while riding and the camera never rolled. Crash / finish
  // hold states may frame the tumble differently; they are counted, not failed.
  c.pass = c.outOfBoxRiding === 0 && c.rollViolations === 0;
  return c;
}

/** One line for reports: `camera: PASS 312 frames, box x 0.41..0.52 y 0.46..0.61, clamped 0 (0%), roll<1e-6, states side:300 finish:12`. */
export function describeCamera(c: CameraCheck | null): string {
  if (!c) return 'camera: n/a (renderer has no camera() or check off)';
  const states = Object.entries(c.states)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(' ');
  return `camera: ${c.pass ? 'PASS' : 'FAIL'} ${c.frames} frames${c.settleExcluded ? ` (${c.settleExcluded} settle excluded)` : ''}, bike x ${c.minX}..${c.maxX} y ${c.minY}..${c.maxY} (box ${c.box.min}..${c.box.max}; out ${c.outOfBox}, riding ${c.outOfBoxRiding}), clamped ${c.clamped} (${c.clampedPct}%), max|roll| ${c.maxAbsRoll.toExponential(1)}${c.rollViolations ? ` ROLL x${c.rollViolations}` : ''}, states ${states}${c.violations.length ? `; first: ${c.violations.slice(0, 3).map((v) => `f${v.frame}@t${v.tick} (${v.x},${v.y}) ${v.state ?? ''}`).join(', ')}` : ''}`;
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
    if (o.recording.header.bike && o.recording.header.bike !== 'rookie') await hook.setBike(o.recording.header.bike);
    if (!(await hook.loadTrack(o.recording.header.trackId, o.recording.header.seed))) {
      throw new Error(`unknown track ${o.recording.header.trackId}`);
    }
    await hook.resize(width, height);
    if (o.quality) await hook.setQuality(o.quality);

    // Tick window: simulate the prefix without rendering, in one round trip per 5 s.
    const startTick = Math.max(0, Math.min(frames.length, Math.floor((o.startTick ?? 0) / ticksPerFrame) * ticksPerFrame));
    const endTick = Math.min(frames.length, Math.max(startTick, o.endTick ?? frames.length));
    for (let t = 0; t < startTick; t += hz * 5) {
      const slice: InputFrame[] = frames.slice(t, Math.min(startTick, t + hz * 5));
      await page.evaluate((inputs) => {
        const tr = window.__trials!;
        for (const f of inputs) {
          tr.setInput(f);
          tr.step(1);
        }
      }, slice);
    }

    const framePaths: string[] = [];
    let finishedAt = -1;
    let lastState: PhysicsState | null = null;
    const cameraCheck = o.cameraCheck ?? true;
    let camera: CameraCheck | null = cameraCheck ? newCameraCheck() : null;
    const riderRows: RiderProbeRow[] = [];
    const riderProbe = o.riderProbe ?? false;
    const firstVideoFrame = startTick / ticksPerFrame;
    const totalVideoFrames = Math.ceil(endTick / ticksPerFrame);
    // Run the recording to its end; when the run finishes early (and
    // stopOnFinish is set) stop after the tail; when it finishes on the
    // last recorded frame, extend by the tail so the outcome is visible.
    for (let k = firstVideoFrame; k < totalVideoFrames || (finishedAt >= 0 && k - finishedAt < tailFrames); k++) {
      if (o.endTick !== undefined && k * ticksPerFrame >= endTick && finishedAt < 0) break;
      const slice: InputFrame[] = frames.slice(k * ticksPerFrame, (k + 1) * ticksPerFrame);
      // Step this frame's ticks and render in one round trip.
      const res = await page.evaluate(
        ([inputs, n, grab, cam, rp]) => {
          const t = window.__trials!;
          for (const f of inputs) {
            t.setInput(f);
            t.step(1);
          }
          if (inputs.length < n) t.step(n - inputs.length); // tail: hold last input
          t.render();
          const state = t.getState();
          const dataUrl = grab ? (document.querySelector('canvas') as HTMLCanvasElement).toDataURL('image/png') : null;
          let camera: CamSample = null;
          if (cam && typeof t.camera === 'function') {
            const c = t.camera() as { bikeScreenX: number; bikeScreenY: number; roll?: number; state?: string; clamped?: boolean };
            camera = { bikeScreenX: c.bikeScreenX, bikeScreenY: c.bikeScreenY, roll: c.roll ?? 0, state: c.state ?? 'n/a', clamped: c.clamped === true, phase: t.phase() };
          }
          let rider: RiderSample = null;
          if (rp) {
            /* eslint-disable @typescript-eslint/no-explicit-any -- the renderer's private handles through window.__render (as hero-webkit.mts) */
            const r = (window as any).__render;
            const rb = state.riderBody;
            const physRel = rb ? Math.atan2(Math.sin(rb.angle - state.bike.angle), Math.cos(rb.angle - state.bike.angle)) : NaN;
            let chainTorso = NaN, meshTorso = NaN, physicalPose = false, additiveWeight = NaN;
            const hero = r?.riderRef;
            const bike = r?.bikeRef;
            if (hero && hero.chain) chainTorso = hero.chain.torsoAngle;
            if (hero && hero.debug) {
              physicalPose = hero.debug.physicalPose === true;
              additiveWeight = hero.debug.additiveWeight;
            }
            const chest = hero?.bones?.get?.('chest');
            if (chest && bike?.frame && r.debug?.THREE) {
              const THREE = r.debug.THREE;
              chest.updateWorldMatrix(true, false);
              bike.frame.updateWorldMatrix(true, false);
              const q = new THREE.Quaternion();
              chest.getWorldQuaternion(q);
              const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
              const qb = new THREE.Quaternion();
              bike.frame.getWorldQuaternion(qb);
              up.applyQuaternion(qb.invert());
              meshTorso = Math.atan2(up.x, up.y);
            }
            rider = { present: !!rb, physRel, chainTorso, meshTorso, physicalPose, additiveWeight };
            /* eslint-enable @typescript-eslint/no-explicit-any */
          }
          return { state, dataUrl, camera, rider };
        },
        [slice, ticksPerFrame, mode === 'canvas', cameraCheck, riderProbe] as const,
      );
      if (riderProbe && res.rider) riderRows.push({ frame: k - firstVideoFrame, tick: res.state.tick, phase: res.camera?.phase ?? 'n/a', ...res.rider });
      lastState = res.state;
      if (camera && res.camera) accumulateCamera(camera, res.camera, k - firstVideoFrame, res.state.tick, startTick > 0 && k - firstVideoFrame < Math.round(CAMERA_SETTLE_S * fps));
      else if (camera && cameraCheck && k === firstVideoFrame) camera = null; // renderer without camera(): nothing to assert
      const file = path.join(framesDir, `frame-${String(k - firstVideoFrame).padStart(5, '0')}.png`);
      if (mode === 'canvas' && res.dataUrl) {
        fs.writeFileSync(file, Buffer.from(res.dataUrl.split(',')[1]!, 'base64'));
      } else {
        await page.screenshot({ path: file, type: 'png', animations: 'disabled', caret: 'hide' });
      }
      framePaths.push(file);
      // PhysicsState.finished is "run over" (finish OR fault); only a real finish ends the clip early.
      if (res.state.finishTime !== null && finishedAt < 0) finishedAt = k;
      if (stopOnFinish && finishedAt >= 0 && k - finishedAt >= tailFrames) break;
    }
    const finalHash = await hook.hashState();

    await encodeMp4({ fps, pattern: path.join(framesDir, 'frame-%05d.png'), out: o.outMp4 });
    const sheet = path.join(outDir, 'sheet.jpg');
    await contactSheet({ frames: framePaths, out: sheet, cols: o.sheetCols ?? 4, rows: o.sheetRows ?? 2 });
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
      camera: finishCamera(camera),
      rider: riderProbe ? finishRider(riderRows) : null,
    };
  } finally {
    // The clip is already on disk here; a teardown failure (browser pipe, preview server socket) is not a capture failure.
    await launched.close().catch((e: unknown) => console.error(`capture: browser close failed (ignored): ${e instanceof Error ? e.message : String(e)}`));
    await server.close().catch((e: unknown) => console.error(`capture: server close failed (ignored): ${e instanceof Error ? e.message : String(e)}`));
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
    ...(flagStr(flags, 'quality', '') ? { quality: flagStr(flags, 'quality', '') as QualityTier } : {}),
    ...(flags['from-tick'] !== undefined ? { startTick: flagNum(flags, 'from-tick', 0) } : {}),
    ...(flags['to-tick'] !== undefined ? { endTick: flagNum(flags, 'to-tick', 0) } : {}),
    riderProbe: flagBool(flags, 'rider-probe'),
  });
  const reportFile = path.join(path.dirname(outMp4), 'capture.json');
  const { rider, ...rest } = result;
  writeJson(reportFile, { input: path.resolve(inputFile), header: recording.header, ...rest, rider: rider ? { ...rider, rows: undefined, rowsFile: 'rider-probe.json' } : null });
  if (rider) writeJson(path.join(path.dirname(outMp4), 'rider-probe.json'), rider);
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
    if (result.rider) {
      const r = result.rider;
      printKV('rider probe', {
        'frames present / physicalPose / total': `${r.presentFrames} / ${r.physicalPoseFrames} / ${r.rows.length}`,
        'std physRel / chainTorso / meshTorso (rad)': `${r.stdPhysRel} / ${r.stdChainTorso} / ${r.stdMeshTorso}`,
        'r(chain,phys) / r(mesh,phys)': `${r.rChainPhys} / ${r.rMeshPhys}`,
        'physRel range': `${r.min.physRel} .. ${r.max.physRel}`,
        'meshTorso range': `${r.min.meshTorso} .. ${r.max.meshTorso}`,
      });
    }
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
