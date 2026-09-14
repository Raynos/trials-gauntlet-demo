/**
 * Capture one built commit: serve its dist, open `?harness=1&track=…`, hold
 * full gas with a half lean forward, and record
 *   (a) stills at simulated 0.5 s / 2.0 s / 4.0 s (still-0.5s.png …), and
 *   (b) a 4 s, 30 fps clip from t=0 (clip.mp4, h264 crf 20),
 * both at 1280×720 with the DOM HUD. Whatever the build does (mock physics,
 * loop-out, crash, blank canvas) is captured as-is — that IS the history.
 *
 *   npx tsx harness/timelapse/capture-commit.mts <sha> <dist> [<outdir>] [--track b1-first-ride] [--seconds 4]
 *
 * Never throws for a bad build: the result records status ok|partial|failed
 * with notes; a boot failure still screenshots the page.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { launchBrowser } from '../lib/browser';
import { CAPTURES_DIR, ffmpeg, log, resolveSha, serveDist } from './lib.mjs';

export interface CaptureOptions {
  track?: string | undefined;
  fallbackTracks?: string[] | undefined;
  seconds?: number | undefined;
  fps?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
  /** Per-frame evaluate+screenshot budget before the clip is cut short. */
  frameTimeoutMs?: number | undefined;
  keepFrames?: boolean | undefined;
}

export interface CaptureResult {
  status: 'ok' | 'partial' | 'failed';
  sha: string;
  track?: string | undefined;
  reason?: string | undefined;
  stills: Record<string, string>;
  clip?: string | undefined;
  clipFrames: number;
  wallMs: number;
  notes: string[];
}

const STILL_TIMES = [0.5, 2.0, 4.0];

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what}: timeout after ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function screenshot(page: Page, file: string, ms: number): Promise<void> {
  await withTimeout(page.screenshot({ path: file, type: 'png', animations: 'disabled', caret: 'hide' }), ms, 'screenshot');
}

export async function captureCommit(ref: string, dist: string, outdir = CAPTURES_DIR, o: CaptureOptions = {}): Promise<CaptureResult> {
  const t0 = performance.now();
  const sha = await resolveSha(ref);
  const short = sha.slice(0, 7);
  const seconds = o.seconds ?? 4;
  const fps = o.fps ?? 30;
  const width = o.width ?? 1280;
  const height = o.height ?? 720;
  const frameTimeoutMs = o.frameTimeoutMs ?? 90_000;
  const wanted = o.track ?? 'b1-first-ride';
  const fallbacks = o.fallbackTracks ?? ['flat-test'];
  const target = path.join(outdir, sha);
  const framesDir = path.join(target, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });
  const notes: string[] = [];
  const stills: Record<string, string> = {};
  const result: CaptureResult = { status: 'failed', sha, stills, clipFrames: 0, wallMs: 0, notes };
  const finish = (): CaptureResult => {
    result.wallMs = performance.now() - t0;
    fs.writeFileSync(path.join(target, 'capture.json'), JSON.stringify(result, null, 2));
    return result;
  };

  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    result.reason = `no dist/index.html at ${dist}`;
    return finish();
  }

  const server = await serveDist(dist);
  let launched: Awaited<ReturnType<typeof launchBrowser>> | null = null;
  try {
    launched = await launchBrowser({ width, height });
    const { page } = launched;
    page.on('pageerror', (e) => notes.push(`pageerror: ${e.message.slice(0, 300)}`));
    page.on('console', (m) => {
      if (m.type() === 'error') notes.push(`console.error: ${m.text().slice(0, 300)}`);
    });

    const url = new URL(server.url);
    url.searchParams.set('harness', '1');
    url.searchParams.set('track', wanted);
    log(`capture ${short}: open ${url}`);
    await page.goto(url.toString(), { waitUntil: 'commit', timeout: 30_000 });
    let booted = true;
    try {
      await page.waitForFunction(() => (window as unknown as { __trials?: { ready?: boolean } }).__trials?.ready === true, undefined, {
        timeout: 45_000,
      });
    } catch (err) {
      booted = false;
      notes.push(`boot: __trials.ready not observed (${err instanceof Error ? err.message.split('\n')[0] : String(err)})`);
    }
    if (!booted) {
      // Still record what the page looks like: a blank or broken boot is history too.
      const file = path.join(target, 'still-boot-failed.png');
      await screenshot(page, file, 30_000).catch((e) => notes.push(`screenshot: ${String(e)}`));
      if (fs.existsSync(file)) for (const t of STILL_TIMES) stills[t.toFixed(1)] = file;
      result.reason = 'hook never became ready';
      return finish();
    }

    // Pick the track: wanted, else fallbacks, else whatever is loaded.
    const setup = await withTimeout(
      page.evaluate(
        ([want, fbs, w, h]) => {
          const tr = (window as unknown as { __trials: Record<string, (...a: never[]) => unknown> }).__trials as unknown as {
            listTracks?: () => string[];
            loadTrack: (id: string, seed?: number) => boolean;
            info: () => { trackId?: string; physicsHz?: number };
            resize?: (w: number, h: number) => void;
            setQuality?: (q: string) => void;
          };
          const notes: string[] = [];
          let tracks: string[] = [];
          try {
            tracks = tr.listTracks ? tr.listTracks() : [];
          } catch (e) {
            notes.push(`listTracks threw: ${String(e)}`);
          }
          let track = tr.info().trackId ?? '';
          const candidates = [want, ...fbs];
          for (const c of candidates) {
            if (tracks.length === 0 || tracks.includes(c)) {
              try {
                if (track !== c && tr.loadTrack(c)) track = c;
                else if (track === c) track = c;
                if (track === c) break;
              } catch (e) {
                notes.push(`loadTrack(${c}) threw: ${String(e)}`);
              }
            }
          }
          if (!candidates.includes(track)) notes.push(`fell back to loaded track "${track}" (tracks: ${tracks.join(',')})`);
          try {
            tr.resize?.(w, h);
          } catch (e) {
            notes.push(`resize threw: ${String(e)}`);
          }
          let quality = 'default';
          if (typeof tr.setQuality === 'function') {
            try {
              tr.setQuality('high');
              quality = 'high';
            } catch (e) {
              notes.push(`setQuality threw: ${String(e)}`);
            }
          }
          const hz = tr.info().physicsHz ?? 120;
          return { track, hz, quality, notes, tracks };
        },
        [wanted, fallbacks, width, height] as const,
      ),
      60_000,
      'setup',
    );
    notes.push(...setup.notes);
    result.track = setup.track;
    const hz = setup.hz;
    const ticksPerFrame = Math.max(1, Math.round(hz / fps));
    log(`capture ${short}: track=${setup.track} hz=${hz} quality=${setup.quality} (${setup.tracks.length} tracks)`);

    // Render frame 0 once so the first clip frame is not a blank canvas.
    await withTimeout(
      page.evaluate(() => {
        const tr = (window as unknown as { __trials: { setInput: (f: unknown) => void; render: (s?: boolean) => unknown } }).__trials;
        tr.setInput({ throttle: 1, brake: 0, lean: 0.5 });
        tr.render(true);
      }),
      frameTimeoutMs,
      'first render',
    ).catch((e) => notes.push(`first render: ${String(e)}`));

    const totalFrames = Math.round(seconds * fps);
    const stillFrames = new Map<number, string>();
    for (const t of STILL_TIMES) stillFrames.set(Math.round(t * fps) - 1, t.toFixed(1));
    const framePaths: string[] = [];
    for (let k = 0; k < totalFrames; k++) {
      const file = path.join(framesDir, `frame-${String(k).padStart(5, '0')}.png`);
      try {
        await withTimeout(
          page.evaluate((n) => {
            const tr = (window as unknown as { __trials: { setInput: (f: unknown) => void; step: (n: number) => unknown; render: (s?: boolean) => unknown } })
              .__trials;
            tr.setInput({ throttle: 1, brake: 0, lean: 0.5 });
            tr.step(n);
            tr.render(true);
          }, ticksPerFrame),
          frameTimeoutMs,
          `frame ${k} step/render`,
        );
        await screenshot(page, file, frameTimeoutMs);
        framePaths.push(file);
      } catch (err) {
        notes.push(`frame ${k}: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
        // Hold the last good frame so the clip keeps its length; stop asking the page.
        const last = framePaths[framePaths.length - 1];
        if (!last) break;
        for (let j = k; j < totalFrames; j++) {
          const f = path.join(framesDir, `frame-${String(j).padStart(5, '0')}.png`);
          fs.copyFileSync(last, f);
          framePaths.push(f);
        }
        break;
      }
      const stillKey = stillFrames.get(k);
      if (stillKey) {
        const still = path.join(target, `still-${stillKey}s.png`);
        fs.copyFileSync(file, still);
        stills[stillKey] = still;
      }
      if (k % 30 === 29) log(`capture ${short}: ${k + 1}/${totalFrames} frames, ${((performance.now() - t0) / 1000).toFixed(0)} s`);
    }
    result.clipFrames = framePaths.length;
    // Fill any still missing (clip cut short) with the last frame we have.
    const last = framePaths[framePaths.length - 1];
    if (last) for (const [, key] of stillFrames) if (!stills[key]) {
      const still = path.join(target, `still-${key}s.png`);
      fs.copyFileSync(last, still);
      stills[key] = still;
      notes.push(`still ${key}s: substituted last captured frame`);
    }

    if (framePaths.length > 0) {
      const clip = path.join(target, 'clip.mp4');
      await ffmpeg([
        '-framerate', String(fps),
        '-i', path.join(framesDir, 'frame-%05d.png'),
        '-frames:v', String(framePaths.length),
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-vf', `scale=${width}:${height}:flags=lanczos,format=yuv420p`,
        '-movflags', '+faststart',
        clip,
      ]);
      result.clip = clip;
    }
    const clipOk = framePaths.length === totalFrames && !notes.some((n) => n.startsWith('frame '));
    result.status = framePaths.length === 0 ? 'failed' : clipOk ? 'ok' : 'partial';
    if (!clipOk) result.reason = notes.find((n) => n.startsWith('frame ')) ?? 'clip cut short';
    log(`capture ${short}: ${result.status}, ${framePaths.length} frames in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  } catch (err) {
    result.reason = err instanceof Error ? err.message.split('\n')[0] : String(err);
    notes.push(`fatal: ${result.reason}`);
    log(`capture ${short}: FAILED ${result.reason}`);
  } finally {
    await launched?.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    if (!(o.keepFrames ?? false) && fs.existsSync(framesDir)) {
      // No rm -r: frames are small and named; unlink them one by one, then the dir.
      for (const f of fs.readdirSync(framesDir)) fs.unlinkSync(path.join(framesDir, f));
      fs.rmdirSync(framesDir);
    }
  }
  return finish();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i]!.startsWith('--')) {
      i++;
      continue;
    }
    positional.push(args[i]!);
  }
  if (!positional[0] || !positional[1]) {
    console.error('usage: capture-commit.mts <sha> <dist> [<outdir>] [--track id] [--seconds 4] [--fps 30]');
    process.exit(2);
  }
  const res = await captureCommit(positional[0], positional[1], positional[2] ?? CAPTURES_DIR, {
    track: flag('track'),
    seconds: flag('seconds') ? Number(flag('seconds')) : undefined,
    fps: flag('fps') ? Number(flag('fps')) : undefined,
    keepFrames: args.includes('--keep-frames'),
  });
  console.log(JSON.stringify(res));
  process.exit(res.status === 'failed' ? 1 : 0);
}
