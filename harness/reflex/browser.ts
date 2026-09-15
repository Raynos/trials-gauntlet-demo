/**
 * Live-browser driver: the same ReflexController, but its eyes are
 * `window.__trials.getState()` polled over CDP at the skill's glance rate, its
 * hands are `page.keyboard.down/up` on the real arrow keys, and its clock is
 * the wall clock. The page runs the *live* game (no `?harness=1`): the App
 * shell, the 3-2-1-GO countdown, `RafDriver` ticking physics from
 * `requestAnimationFrame`, `KeyboardInput` → `InputMux` → `quantizeInput`.
 * This validates the real input path end to end and yields real-time attempts.
 *
 * Recording: an in-page rAF hook calls `startRecording()` on the first frame
 * it sees `phase() === 'riding'` and notes how many riding ticks had already
 * elapsed (`startTick`; they ran on neutral input because no key is sent
 * before GO). The node replay prepends that many neutral frames and must hash
 * to the browser's live final state — the node ↔ browser round trip.
 */
import { decodeJSON, expandFrames, InputRecorder, quantizeInput, type InputRecording } from '../../src/core/replay';
import type { GameEvent, GamePhase, InputFrame, PhysicsState } from '../../src/core/types';
import { launchBrowser, type LaunchedBrowser } from '../lib/browser';
import { percentileOf } from '../lib/metrics';
import { createSim, type Sim } from '../lib/sim';
import { distIsStale, startServer, type GameServer } from '../lib/server';
import { ReflexController, KEYS_UP, type Keys, type SkillName } from './controller';
import { SectionMemory } from './memory';
import { perceive } from './perceive';
import { buildProfile } from './profile';
import { faultContext, nearestObstacle, type ReflexFault } from './play';

const KEY_CODES: Record<keyof Keys, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', restart: 'Enter' };

const IN_PAGE_HOOK = `(() => {
  const h = window.__trials;
  const r = { started: false, startTick: -1, startAt: 0, frames: 0, t0: performance.now() };
  window.__reflex = r;
  const tick = () => {
    if (!r.started && h.phase() === 'riding') {
      h.startRecording();
      r.started = true;
      r.startTick = h.getState().tick;
      r.startAt = performance.now();
    }
    r.frames++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
})()`;

const GLANCE = `(() => {
  const h = window.__trials;
  const r = window.__reflex;
  return { st: h.getState(), phase: h.phase(), runTime: h.runTime(), events: h.drainEvents(), now: performance.now(), frames: r.frames, started: r.started, startTick: r.startTick };
})()`;

const STOP = `(() => {
  const h = window.__trials;
  const json = h.stopRecording();
  return { json, hash: h.hashState(), state: h.getState(), runTime: h.runTime(), faults: h.faults(), frames: window.__reflex.frames, startTick: window.__reflex.startTick };
})()`;

interface Glance {
  st: PhysicsState;
  phase: GamePhase;
  runTime: number;
  events: GameEvent[];
  now: number;
  frames: number;
  started: boolean;
  startTick: number;
}

export interface BrowserPlayResult {
  outcome: 'finished' | 'maxAttempts' | 'timeout';
  attempts: number;
  finishTime: number | null;
  maxX: number;
  faults: ReflexFault[];
  /** The recording exactly as the page produced it (from `startTick` on). */
  recording: InputRecording;
  /** The recording with `startTick` neutral frames prepended: replayable from GO. */
  fullRecording: InputRecording;
  browserHash: string;
  replayHash: string;
  roundTrip: boolean;
  reactionS: number;
  rules: Record<string, number>;
  live: { fps: number; glanceMsP50: number; glanceMsP95: number; glances: number; keyEvents: number; startTick: number; countdownMs: number; wallS: number; clock: 'virtual' | 'wall'; frameMs: number; wallMsPerFrame: number };
}

export class ReflexBrowser {
  private server: GameServer | null = null;
  private launched: LaunchedBrowser | null = null;

  constructor(
    private readonly opts: {
      dev?: boolean;
      build?: boolean;
      verbose?: boolean;
      width?: number;
      height?: number;
      quality?: 'low' | 'medium' | 'high';
      /**
       * 'virtual' (default): Playwright's fake clock drives rAF/performance.now at a fixed frame period, so the
       * live loop runs at a player's 60 fps regardless of how long SwiftShader takes to raster a frame (~0.3 s
       * here). 'wall': the real clock — on this machine that is a 3–4 fps game, i.e. input sampled every ~280 ms.
       */
      clock?: 'virtual' | 'wall';
      /** Virtual frame period (ms); 16.667 = 60 fps player. */
      frameMs?: number;
    } = {},
  ) {}

  async open(): Promise<{ server: GameServer; launched: LaunchedBrowser }> {
    if (!this.server) {
      this.server = await startServer({ dev: this.opts.dev ?? false, forceBuild: this.opts.build ?? false, freeze: !this.opts.dev });
      const st = distIsStale();
      if (!this.opts.dev && st.stale) console.error(`WARNING dist/ is older than src/: node and browser may run different code; pass --build`);
    }
    // SwiftShader is a CPU rasteriser: the live loop's frame time *is* the input sampling period, so keep the
    // canvas small and the quality low (a real GPU renders 1280x720 high at 60 fps; here 640x360 low ≈ 10 fps).
    if (!this.launched) this.launched = await launchBrowser({ logConsole: this.opts.verbose ?? false, width: this.opts.width ?? 640, height: this.opts.height ?? 360 });
    return { server: this.server, launched: this.launched };
  }

  async close(): Promise<void> {
    await this.launched?.close();
    await this.server?.close();
    this.launched = null;
    this.server = null;
  }

  /** One live run: fresh page, live game, the reflex controller on real keys. */
  async play(trackId: string, o: { skill: SkillName; seed: number; attemptsCap?: number; maxWallS?: number; log?: (l: string) => void }): Promise<BrowserPlayResult> {
    const { server, launched } = await this.open();
    const page = await launched.context.newPage();
    const log = o.log ?? (() => undefined);
    const virtual = (this.opts.clock ?? 'virtual') === 'virtual';
    const frameMs = this.opts.frameMs ?? 1000 / 60;
    try {
      // Fake clock: real speed through boot, then paused a few (virtual) seconds ahead and stepped one frame at a time.
      const clock0 = Date.now();
      if (virtual) await page.clock.install({ time: clock0 });
      const url = new URL(server.url);
      url.searchParams.set('track', trackId);
      // Round 10: `?track=` goes straight to the run, but a first launch ever shows the onboarding card with the game
      // paused (phase 'menu') until a key — a fresh Playwright context is always a first launch, which is the round-9
      // "expected the countdown after pauseAt, got 'menu'". A returning player has `trials.onboarded` set; so does the driver.
      await page.addInitScript(() => {
        try {
          localStorage.setItem('trials.onboarded', '1');
        } catch {
          /* storage unavailable */
        }
      });
      await page.goto(url.toString(), { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__trials?.ready === true, undefined, { timeout: 30_000 });
      // Round 11: `ready` is set when the hook installs (boot step `front`), BEFORE `App.start()` runs in the `track`
      // step behind `nextPaint()` (rAF + setTimeout). With the fake clock installed, `pauseAt` below freezes the clock,
      // so a boot still downloading art when it fires never gets its next paint: `start()` never runs, the screen stays
      // at its initial 'menu' and the nav log is empty — round 9's 'menu', round 10's 'title'. The clock runs in real
      // time until paused, so wait for the run itself (`?track=` -> `play()` -> countdown) before touching it.
      try {
        await page.waitForFunction(() => window.__trials?.phase?.() === 'countdown', undefined, { timeout: 90_000 });
      } catch {
        const why = (await page.evaluate(
          `(() => { const t = window.__trials; const app = t && t.app; return JSON.stringify({ search: location.search, phase: t && t.phase ? t.phase() : null, screen: app && app.screen ? app.screen() : null, nav: t && t.navLog ? t.navLog().slice(-8) : null, boot: (document.getElementById('boot') || document.querySelector('[data-boot]') || {}).textContent || null }); })()`,
        )) as string;
        throw new Error(`live game: \`?track=\` did not reach the countdown within 90 s (app ${why})`);
      }
      if (virtual) {
        // pauseAt fast-forwards to the target (rAF fires sparsely, each frame clamped to 0.25 s of game time by the
        // App), so a target well past the slowest boot costs a little countdown, never the GO.
        await page.clock.pauseAt(Math.max(clock0, Date.now()) + 30_000);
        const ph = (await page.evaluate('window.__trials.phase()')) as string;
        if (ph !== 'countdown') {
          // Round 10: `?track=` lands in `play()` (phase countdown) and something under the fast-forward takes it back to
          // `menu` (`quit()` / `loadBackdrop()` are the only paths) — report the App screen and the nav log with the failure.
          const why = (await page.evaluate(
            `(() => { const t = window.__trials; const app = t && t.app; return JSON.stringify({ screen: app && app.screen ? app.screen() : null, nav: t && t.navLog ? t.navLog().slice(-8) : null }); })()`,
          )) as string;
          throw new Error(`fake clock: expected the countdown after pauseAt, got '${ph}' (app ${why})`);
        }
      }
      await page.evaluate(`window.__trials.setQuality(${JSON.stringify(this.opts.quality ?? 'low')})`);
      await page.evaluate(IN_PAGE_HOOK);
      // Node-side model of the same track for perception (geometry only) and for the replay check.
      const sim = await createSim(trackId);
      const profile = buildProfile(sim.compiled);
      const ctrl = new ReflexController({ skill: o.skill, seed: o.seed, memory: new SectionMemory(), bike: sim.bike });
      const cap = o.attemptsCap ?? 50;
      const maxWallS = o.maxWallS ?? 400;
      const faults: ReflexFault[] = [];
      let keys: Keys = { ...KEYS_UP };
      let keyEvents = 0;
      let glances = 0;
      const glanceMs: number[] = [];
      let maxX = -Infinity;
      let outcome: BrowserPlayResult['outcome'] | null = null;
      let finishTime: number | null = null;
      let finishedAtWall = -1;
      let attempts = 1;
      let goAt = -1;
      let startTick = -1;
      let firstFrames = -1;
      let lastEventTick = -1;
      const wall0 = performance.now();
      let vt = 0; // virtual seconds since the loop started
      const nowS = (): number => (virtual ? vt : (performance.now() - wall0) / 1000);
      const glanceEveryMs = 1000 / ctrl.P.perceiveHz;
      let playerFrames = 0;

      const setKeys = async (k: Keys): Promise<void> => {
        for (const name of Object.keys(KEY_CODES) as (keyof Keys)[]) {
          if (k[name] === keys[name]) continue;
          keyEvents++;
          if (k[name]) await page.keyboard.down(KEY_CODES[name]);
          else await page.keyboard.up(KEY_CODES[name]);
        }
        keys = { ...k };
      };

      while (outcome === null) {
        if (virtual) {
          // One player frame: rAF fires once (App.tickFrame → mux.poll → game.advance → render), clock +frameMs.
          const f0 = performance.now();
          await page.clock.runFor(frameMs);
          playerFrames++;
          vt += frameMs / 1000;
          if (playerFrames % 300 === 0) log(`frame ${playerFrames} vt=${vt.toFixed(1)}s wall/frame=${((performance.now() - wall0) / playerFrames).toFixed(0)}ms (last ${(performance.now() - f0).toFixed(0)}ms)`);
          // Glance only at the perception rate; the hands can still change between glances (taps).
          const due = playerFrames % Math.max(1, Math.round(glanceEveryMs / frameMs)) === 0;
          if (!due && startTick >= 0) {
            if (startTick >= 0) await setKeys(ctrl.keysAt(nowS()));
            if (nowS() > maxWallS) outcome = 'timeout';
            continue;
          }
        }
        const loop0 = performance.now();
        const g = (await page.evaluate(GLANCE)) as Glance;
        glanceMs.push(performance.now() - loop0);
        const tNow = nowS();
        if (g.started && startTick < 0) {
          startTick = g.startTick;
          goAt = tNow;
          firstFrames = g.frames;
          log(`GO at wall ${tNow.toFixed(2)} s; recording from riding tick ${startTick}`);
        }
        if (g.phase !== 'countdown' && g.phase !== 'menu') {
          if (g.st.bike.pos.x > maxX) maxX = g.st.bike.pos.x;
          for (const e of g.events) {
            if (e.type === 'fault') {
              // Events can be re-delivered if drainEvents raced a tick; dedupe on tick.
              if (e.tick === lastEventTick) continue;
              lastEventTick = e.tick;
              const ctx = faultContext(g.st, profile, e.reason, ctrl.lastActed());
              const lesson = ctrl.learn(ctx);
              const f: ReflexFault = {
                attempt: attempts,
                reason: e.reason,
                tick: e.tick,
                simTime: e.time,
                runTime: g.runTime,
                x: g.st.bike.pos.x,
                checkpoint: g.st.checkpoint,
                pitchDeg: ctx.pitchDeg,
                speed: ctx.speed,
                airborne: ctx.airborne,
                rule: e.reason === 'restart' ? 'stuck-restart' : ctrl.currentIntent().rule,
                obstacle: nearestObstacle(sim, g.st.bike.pos.x),
                lesson,
              };
              faults.push(f);
              attempts++;
              log(`fault #${faults.length} ${e.reason} at x=${f.x.toFixed(1)} pitch=${f.pitchDeg.toFixed(0)} rule=${f.rule} run t=${g.runTime.toFixed(2)} → ${lesson.join('; ')}`);
              if (attempts > cap) outcome = 'maxAttempts';
            } else if (e.type === 'restart') {
              ctrl.respawned(tNow);
            } else if (e.type === 'finish') {
              finishTime = g.runTime;
              finishedAtWall = tNow;
              log(`finish at run t=${finishTime.toFixed(3)} attempts=${attempts}`);
            }
          }
          // Only look (and press keys) once the recording has started: everything before GO is neutral.
          if (g.started && ctrl.glanceDue(tNow)) {
            ctrl.observe(perceive(g.st, g.phase, tNow, profile, sim.track));
            glances++;
          }
          if (g.started) await setKeys(ctrl.keysAt(tNow));
        }
        if (finishedAtWall >= 0 && tNow - finishedAtWall > 0.5) outcome = 'finished';
        if (tNow > maxWallS && outcome === null) outcome = 'timeout';
        if (!virtual) {
          const spent = performance.now() - loop0;
          if (spent < glanceEveryMs) await new Promise((r) => setTimeout(r, glanceEveryMs - spent));
        }
      }
      await setKeys({ ...KEYS_UP });
      const stop = (await page.evaluate(STOP)) as { json: string | null; hash: string; state: PhysicsState; runTime: number; faults: number; frames: number; startTick: number };
      if (!stop.json) throw new Error('page produced no recording (GO never observed?)');
      const recording = decodeJSON(stop.json);
      const neutral = quantizeInput({});
      const frames: InputFrame[] = [...new Array<InputFrame>(Math.max(0, startTick)).fill(neutral), ...expandFrames(recording)];
      const fullRecording = framesToRecording(recording, frames, `reflex browser skill=${o.skill} seed=${o.seed} startTick=${startTick}`);
      const fresh = await createSim(trackId, recording.header.seed);
      const rep = fresh.run(frames);
      const wallS = (performance.now() - wall0) / 1000;
      // fps: player frames per second of the *game's* clock (virtual = the frame period by construction; wall = measured).
      const fps = firstFrames >= 0 ? (stop.frames - firstFrames) / Math.max(1e-3, nowS() - goAt) : 0;
      return {
        outcome,
        attempts,
        finishTime,
        maxX: Math.max(maxX, stop.state.bike.pos.x),
        faults,
        recording,
        fullRecording,
        browserHash: stop.hash,
        replayHash: rep.hash,
        roundTrip: rep.hash === stop.hash,
        reactionS: ctrl.reactionS,
        rules: Object.fromEntries(ctrl.ruleCounts),
        live: {
          fps,
          glanceMsP50: percentileOf(glanceMs, 50),
          glanceMsP95: percentileOf(glanceMs, 95),
          glances,
          keyEvents,
          startTick,
          countdownMs: goAt >= 0 ? goAt * 1000 : -1,
          wallS,
          clock: virtual ? 'virtual' : 'wall',
          frameMs,
          wallMsPerFrame: virtual && playerFrames > 0 ? (wallS * 1000) / playerFrames : 1000 / Math.max(1e-3, fps),
        },
      };
    } finally {
      await page.close();
    }
  }
}

function framesToRecording(base: InputRecording, frames: InputFrame[], note: string): InputRecording {
  // Re-encode through the recorder so RLE runs are canonical.
  const rec = new InputRecorder({ ...base.header, note });
  for (const f of frames) rec.push(f);
  return rec.toRecording();
}

export type { Sim };
