/**
 * UI trailer capture (ask 63): drives the game's *screens* — menu, world map, garage,
 * HUD, results — and writes one PNG per output frame.
 *
 * The trick is the same one `harness/reflex/browser.ts` uses for the live-game reflex
 * runs: Playwright's fake clock is installed and then paused, and every frame is one
 * `clock.runFor(1000/fps)` — exactly one rAF, exactly one app frame. A SwiftShader page
 * that paints at 3 fps in real time therefore still yields a silky 30 fps clip, and the
 * capture is deterministic: the same shot script gives the same frames. `recordVideo`
 * (what `harness/e2e/worldmap-clip.mts` uses for evidence) cannot do this — it records
 * the wall clock, so the UI tweens stutter.
 *
 *   npx tsx harness/trailer/capture-ui.ts harness/trailer/shots-ui.json \
 *     [--only id,id] [--fps 30] [--width 1280] [--height 720] [--out harness/out/trailer/ui] [--dev]
 *
 * Each shot in the JSON is `{ id, geom?, dpr?, phone?, quality?, steps: Step[] }`; a Step is
 * one of the `act` cases in `runStep` below. Frames are only written by the `roll` step, so
 * a shot can set itself up (taps, waits, settles) without spending frames on it.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, CDPSession, Page } from 'playwright';
import { flagNum, flagStr, parseArgs } from '../lib/args';
import { launchBrowser } from '../lib/browser';
import { encodeMp4 } from '../lib/ffmpeg';
import { startServer } from '../lib/server';

/** Local progress seed: medals on the beginner rows so the map and the menu read like a played save. */
const SEED = `(() => {
  const mk = (time, medal) => JSON.stringify({ time, faults: 0, medal });
  localStorage.setItem('rockhop.best.b1-first-ride', mk(41.2, 'gold'));
  localStorage.setItem('rockhop.best.b2-lean-back', mk(47.9, 'silver'));
  localStorage.setItem('rockhop.best.b3-kicker-row', mk(58.1, 'bronze'));
  localStorage.setItem('rockhop.best.e1-uphill-weight', mk(52.4, 'silver'));
  localStorage.setItem('rockhop.best.e2-rear-wheel-first', mk(66.8, 'bronze'));
  localStorage.setItem('rockhop.best.e3-stairway@pro', mk(61.3, 'silver'));
  localStorage.setItem('rockhop.onboarded', '1');
})()`;

export type Step =
  /** Step n frames, writing a PNG for each. The only step that costs output frames. */
  | { act: 'roll'; frames: number; note?: string }
  /** Advance the clock without writing frames (settle a tween, let a fetch land). */
  | { act: 'skip'; frames: number }
  /** Tap the centre of a selector (touch on phone shots, mouse otherwise). Fails the shot when absent. */
  | { act: 'tap'; sel: string; optional?: boolean }
  /**
   * Tap a viewport point rather than an element. The world map needs this: its `pointermove`
   * handler focuses whatever marker is under the pointer, so a *mouse* click aimed at a marker
   * arrives when that marker is already focused — and an already-focused marker launches the
   * track (`worldMapScreen.ts` click handler). Clicking open land while the map is zoomed out
   * flies to the nearest marker instead, which is the shot we actually want.
   */
  | { act: 'tapAt'; at: [number, number]; note?: string }
  /** Wait for a selector, pumping the paused clock while polling (see `pumpUntil`). */
  | { act: 'wait'; sel: string; timeoutMs?: number }
  /** Wait for an arbitrary page predicate (a JS expression string), pumping the clock. */
  | { act: 'waitFn'; expr: string; timeoutMs?: number }
  /** Evaluate a JS expression string in the page (navigation via the hook, quality pins, …). */
  | { act: 'eval'; expr: string }
  /**
   * Key press held for `holdFrames` app frames, then released, `times` over. The app polls keys
   * once per frame and steps on the edge, so one press is one step however long it is held.
   * `capture: true` writes those frames (a world-map fly starts on the press).
   */
  | { act: 'key'; key: string; times?: number; holdFrames?: number; capture?: boolean }
  /**
   * A one-finger drag spread over `frames` captured frames — the touch move and the clock
   * step interleave, so the map's own inertia integrates against our virtual frame time.
   */
  | { act: 'drag'; from: [number, number]; by: [number, number]; frames: number }
  /** A two-finger pinch from gap `s0` to `s1` over `frames` captured frames. */
  | { act: 'pinch'; at: [number, number]; from: number; to: number; frames: number }
  /** Wheel zoom spread over `frames` captured frames (the desktop map's zoom gesture). */
  | { act: 'wheel'; at: [number, number]; dy: number; frames: number }
  /** Move the mouse (hover states) without clicking. */
  | { act: 'hover'; sel: string; optional?: boolean };

export interface Shot {
  id: string;
  /** "1280x720"; defaults to the run geometry. */
  geom?: string;
  dpr?: number;
  /** Capture in an iPhone-geometry mobile context (coarse pointer → the touch layer draws). */
  phone?: boolean;
  quality?: 'low' | 'medium' | 'high';
  /** Extra URL query for the page this shot opens. */
  query?: Record<string, string>;
  /**
   * Playback rate for *declarative* CSS animations and transitions. The fake clock fakes
   * `Date`/timers/rAF, not the compositor's animation timeline, so a 380 ms CSS transition
   * would finish inside one captured frame (each costs ~1.7 s of wall time on SwiftShader)
   * and read as a snap. The game's own camera work is rAF and unaffected; this is only for
   * the CSS garnish (the card rise, the fog lift). 0 freezes them; ~0.02 stretches them to
   * roughly one virtual frame per real frame. Omit to leave them alone.
   */
  cssRate?: number;
  steps: Step[];
}

interface Ctx {
  page: Page;
  cdp: CDPSession | null;
  context: BrowserContext;
  dir: string;
  /** Output frames written so far by this shot. */
  k: number;
  frameMs: number;
  shot: Shot;
  log: { i: number; note?: string | undefined }[];
  /** Note stamped on frames until the next `roll` changes it (read when trimming the cut). */
  note?: string | undefined;
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs();
  const listFile = positional[0] ?? 'harness/trailer/shots-ui.json';
  const shots = JSON.parse(fs.readFileSync(listFile, 'utf8')) as Shot[];
  const only = typeof flags['only'] === 'string' ? new Set(flags['only'].split(',')) : null;
  const fps = flagNum(flags, 'fps', 30);
  const frameMs = 1000 / fps;
  const width = flagNum(flags, 'width', 1280);
  const height = flagNum(flags, 'height', 720);
  const outRoot = path.resolve(flagStr(flags, 'out', 'harness/out/trailer/ui'));
  fs.mkdirSync(outRoot, { recursive: true });

  const server = await startServer({ dev: flags['dev'] === true });
  const launched = await launchBrowser({ width, height });
  console.log(`[ui] server ${server.url} · renderer ${launched.probe.renderer} · ${fps} fps`);
  const manifest: Record<string, unknown>[] = [];

  try {
    for (const shot of shots) {
      if (only && !only.has(shot.id)) continue;
      const t0 = performance.now();
      const [W, H] = (shot.geom ?? `${width}x${height}`).split('x').map(Number) as [number, number];
      const dir = path.join(outRoot, shot.id);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });

      const context = await launched.browser.newContext({
        viewport: { width: W, height: H },
        deviceScaleFactor: shot.dpr ?? (shot.phone ? 2 : 1),
        ...(shot.phone
          ? {
              isMobile: true,
              hasTouch: true,
              userAgent:
                'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            }
          : {}),
      });
      await context.addInitScript(SEED);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));

      // The clock runs in real time through boot (fetches, glTF parse, the first paint) and is
      // paused only once the menu is live — a clock paused during boot never delivers the rAF
      // that `App.start()` waits behind (reflex/browser.ts round 11).
      const clock0 = Date.now();
      await page.clock.install({ time: clock0 });
      const url = new URL(server.url);
      url.searchParams.set('sw', '0');
      for (const [k, v] of Object.entries(shot.query ?? {})) url.searchParams.set(k, v);
      await page.goto(url.toString(), { waitUntil: 'commit' });
      await page.waitForFunction(() => !document.getElementById('loader'), undefined, { timeout: 240_000 });
      await page.waitForFunction(() => window.__rockhop?.ready === true, undefined, { timeout: 120_000 });
      // Let the first real frames land, then freeze: from here the page only moves when we step it.
      await page.waitForTimeout(1500);
      await page.clock.pauseAt(Math.max(clock0, Date.now()) + 2000);
      await page.evaluate(`window.__rockhop.setQuality(${JSON.stringify(shot.quality ?? 'high')})`);
      // The fps meter is drawn on every screen except the menu; a trailer frame must not carry it.
      await page.addStyleTag({ content: '.fpsmeter, .perf, .trace { display: none !important; }' });

      const cdpSession = await context.newCDPSession(page).catch(() => null);
      if (cdpSession && shot.cssRate !== undefined) {
        await cdpSession.send('Animation.enable');
        await cdpSession.send('Animation.setPlaybackRate', { playbackRate: shot.cssRate });
      }
      const ctx: Ctx = {
        page,
        cdp: cdpSession,
        context,
        dir,
        k: 0,
        frameMs,
        shot,
        log: [],
      };

      // A bad selector in one shot must not throw away the shots already captured — a full run is
      // ~45 min of SwiftShader. The shot is reported as failed and `--only <id>` re-runs just it.
      let failed: string | null = null;
      try {
        for (const s of shot.steps) await runStep(ctx, s);
      } catch (e) {
        failed = String(e).slice(0, 300);
        console.log(`[ui] ${shot.id}: FAILED after ${ctx.k} frames — ${failed}`);
      }

      const frames = ctx.k;
      fs.writeFileSync(path.join(dir, 'log.json'), `${JSON.stringify({ fps, frames, log: ctx.log })}\n`);
      writeSilentWav(path.join(dir, 'audio.wav'), frames / fps);
      const mp4 = path.join(dir, 'shot.mp4');
      if (frames > 0) await encodeMp4({ pattern: path.join(dir, 'frame-%05d.png'), out: mp4, fps, crf: 16, preset: 'slow' });
      const wall = (performance.now() - t0) / 1000;
      console.log(
        `[ui] ${shot.id.padEnd(14)} ${String(frames).padStart(4)} frames (${(frames / fps).toFixed(2)} s) ` +
          `${W}x${H} in ${wall.toFixed(0)} s (${(wall / Math.max(1, frames)).toFixed(2)} s/frame)` +
          (errors.length ? ` · ${errors.length} page errors` : ''),
      );
      if (errors.length) for (const e of errors.slice(0, 3)) console.log(`      page error: ${e.slice(0, 200)}`);
      manifest.push({ id: shot.id, frames, seconds: frames / fps, geom: `${W}x${H}`, wallS: wall, failed, errors: errors.slice(0, 5) });
      await context.close();
    }
  } finally {
    fs.writeFileSync(path.join(outRoot, 'manifest.json'), `${JSON.stringify({ fps, shots: manifest }, null, 2)}\n`);
    await launched.close();
    await server.close();
  }
}

/**
 * One output frame. Named `frame-NNNNN.png` and logged alongside a `log.json` / silent
 * `audio.wav` so the directory IS an `edit.py` beat — the cut inherits the cards, the
 * music mix and the contact sheet without a second editor.
 */
async function shotFrame(ctx: Ctx, note?: string): Promise<void> {
  // 180 s: a world-map frame on SwiftShader rasterises several 2k painted plates, well past
  // Playwright's 30 s default.
  await ctx.page.screenshot({ path: path.join(ctx.dir, `frame-${String(ctx.k).padStart(5, '0')}.png`), caret: 'hide', timeout: 180_000 });
  ctx.log.push({ i: ctx.k, note: note ?? ctx.note });
  ctx.k++;
}

/** Advance the paused clock by `n` app frames, writing a PNG per frame when `capture`. */
async function step(ctx: Ctx, n: number, capture: boolean): Promise<void> {
  for (let i = 0; i < n; i++) {
    await ctx.page.clock.runFor(ctx.frameMs);
    if (capture) await shotFrame(ctx);
  }
}

/**
 * Poll a page predicate while STEPPING the paused clock.
 *
 * Plain `waitForFunction` deadlocks here: the app only advances when we call `runFor`, and
 * most of what a UI wait is waiting for is time-driven — `.live` is set 150 ms after a screen
 * is drawn (`src/ui/live.ts`), a fly is a 380 ms rAF tween. With the clock frozen those timers
 * never fire, so the predicate can never come true. Network work (the world map's region
 * plates) still lands in real time, which is why this also yields to the real clock.
 */
async function pumpUntil(ctx: Ctx, expr: string, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await ctx.page.evaluate(`!!(${expr})`)) return;
    if (Date.now() > deadline) throw new Error(`shot ${ctx.shot.id}: timed out waiting for ${what}`);
    await ctx.page.clock.runFor(ctx.frameMs);
    await ctx.page.waitForTimeout(20);
  }
}

async function runStep(ctx: Ctx, s: Step): Promise<void> {
  const { page, cdp, shot } = ctx;
  switch (s.act) {
    case 'roll':
      ctx.note = s.note;
      await step(ctx, s.frames, true);
      return;
    case 'skip':
      await step(ctx, s.frames, false);
      return;
    case 'wait':
      await pumpUntil(ctx, `!!document.querySelector(${JSON.stringify(s.sel)})`, s.timeoutMs ?? 60_000, `selector ${s.sel}`);
      return;
    case 'waitFn':
      await pumpUntil(ctx, s.expr, s.timeoutMs ?? 60_000, s.expr);
      return;
    case 'eval':
      await page.evaluate(s.expr);
      return;
    case 'tap': {
      const c = await centre(page, s.sel);
      if (!c) {
        if (s.optional) return;
        throw new Error(`shot ${shot.id}: selector not found: ${s.sel}`);
      }
      if (shot.phone) await page.touchscreen.tap(c.x, c.y);
      else await page.mouse.click(c.x, c.y);
      return;
    }
    case 'tapAt': {
      const [x, y] = s.at;
      if (shot.phone) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
      return;
    }
    case 'key':
      for (let i = 0; i < (s.times ?? 1); i++) {
        await page.keyboard.down(s.key);
        await step(ctx, s.holdFrames ?? 2, s.capture ?? false);
        await page.keyboard.up(s.key);
        await step(ctx, 1, s.capture ?? false);
      }
      return;
    case 'drag': {
      const [x0, y0] = s.from;
      const [dx, dy] = s.by;
      const n = Math.max(1, s.frames);
      await pointer(ctx, 'down', [{ x: x0, y: y0 }]);
      for (let i = 1; i <= n; i++) {
        await pointer(ctx, 'move', [{ x: x0 + (dx * i) / n, y: y0 + (dy * i) / n }]);
        await step(ctx, 1, true);
      }
      await pointer(ctx, 'up', [{ x: x0 + dx, y: y0 + dy }]);
      return;
    }
    case 'wheel': {
      const [x, y] = s.at;
      const n = Math.max(1, s.frames);
      await page.mouse.move(x, y);
      for (let i = 0; i < n; i++) {
        await page.mouse.wheel(0, s.dy / n);
        await step(ctx, 1, true);
      }
      return;
    }
    case 'hover': {
      const c = await centre(page, s.sel);
      if (!c) {
        if (s.optional) return;
        throw new Error(`shot ${shot.id}: selector not found: ${s.sel}`);
      }
      await page.mouse.move(c.x, c.y);
      return;
    }
    case 'pinch': {
      if (!cdp) throw new Error(`shot ${shot.id}: pinch needs a CDP session (chromium only)`);
      const [cx, cy] = s.at;
      const n = Math.max(1, s.frames);
      const at = (gap: number) => [
        { x: cx - gap / 2, y: cy },
        { x: cx + gap / 2, y: cy },
      ];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(s.from).map((p, id) => ({ ...p, id })) });
      for (let i = 1; i <= n; i++) {
        const gap = s.from + ((s.to - s.from) * i) / n;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(gap).map((p, id) => ({ ...p, id })) });
        await step(ctx, 1, true);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      return;
    }
  }
}

async function pointer(ctx: Ctx, kind: 'down' | 'move' | 'up', pts: { x: number; y: number }[]): Promise<void> {
  const { page, cdp, shot } = ctx;
  if (shot.phone && cdp) {
    const type = kind === 'down' ? 'touchStart' : kind === 'move' ? 'touchMove' : 'touchEnd';
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: kind === 'up' ? [] : pts.map((p, id) => ({ ...p, id })) });
    return;
  }
  const p = pts[0]!;
  if (kind === 'down') {
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
  } else if (kind === 'move') await page.mouse.move(p.x, p.y);
  else await page.mouse.up();
}

/** 48 kHz stereo silence: a UI shot carries no game audio, and `edit.py`'s Beat wants a wav. */
function writeSilentWav(out: string, seconds: number): void {
  const sr = 48_000;
  const n = Math.max(1, Math.round(seconds * sr)) * 2 * 2;
  const buf = Buffer.alloc(44 + n);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n, 40);
  fs.writeFileSync(out, buf);
}

function centre(page: Page, sel: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
