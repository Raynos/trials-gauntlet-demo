/**
 * Browser-side verification of a recording: the same bytes through
 * `window.__rockhop.runRecording` must hash identically to the node sim
 * (`__trialsRunAs`, lib/hook.ts, routes a Pro recording onto the Pro bike).
 * Reuses one server + browser across calls.
 */
import { encodeJSON, type InputRecording } from '../../src/core/replay';
import type { GameEvent, PhysicsState } from '../../src/core/types';
import { launchBrowser, type LaunchedBrowser } from './browser';
import { openGame } from './hook';
import { distIsStale, startServer, type GameServer } from './server';

export interface BrowserRun {
  hash: string;
  state: PhysicsState;
  finishTime: number | null;
  runTime: number;
  faults: number;
  events: GameEvent[];
  wallMs: number;
}

export class BrowserVerifier {
  private server: GameServer | null = null;
  private launched: LaunchedBrowser | null = null;
  private opening: Promise<{ server: GameServer; launched: LaunchedBrowser }> | null = null;

  constructor(private readonly opts: { dev?: boolean; build?: boolean; verbose?: boolean } = {}) {}

  /**
   * One server + one browser no matter how many `run()`s start together (round 12: five concurrent runs each
   * saw `launched == null`, launched five Chromiums + five preview servers, and the four that were never
   * closed kept the process alive after the work was done).
   */
  open(): Promise<{ server: GameServer; launched: LaunchedBrowser }> {
    return (this.opening ??= this.openOnce());
  }

  private async openOnce(): Promise<{ server: GameServer; launched: LaunchedBrowser }> {
    if (!this.server) {
      this.server = await startServer({ dev: this.opts.dev ?? false, forceBuild: this.opts.build ?? false, freeze: !this.opts.dev });
      const st = distIsStale();
      if (!this.opts.dev && st.stale) {
        console.error(`WARNING dist/ is older than src/ (dist ${new Date(st.distMtime).toISOString()}, src ${new Date(st.srcMtime).toISOString()}): node and browser may run different code; pass --build`);
      }
    }
    if (!this.launched) this.launched = await launchBrowser({ logConsole: this.opts.verbose ?? false });
    return { server: this.server, launched: this.launched };
  }

  /**
   * Fresh context + page per run so nothing leaks between recordings — and so `run` can be called
   * concurrently (round 12: `refreshGoldens` / the gate verify N recordings at once on one Chromium;
   * pages in one context would share storage and the game's settings/PB writes).
   */
  async run(rec: InputRecording): Promise<BrowserRun> {
    const { server, launched } = await this.open();
    const ctx = await launched.browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    try {
      // A recording stamped v1 is replayed on the page's v1 solver (`?physics=v1`, src/main.ts); everything else on the default.
      await openGame(page, server.url, rec.header.physics === 'v1' ? { query: { physics: 'v1' } } : {});
      const json = encodeJSON(rec);
      return await page.evaluate((j) => {
        const t = window.__rockhop!;
        const t0 = performance.now();
        t.drainEvents();
        const state = (window.__trialsRunAs ?? t.runRecording)(j);
        const events = t.drainEvents();
        return {
          hash: t.hashState(),
          state,
          finishTime: state.finishTime,
          runTime: t.runTime(),
          faults: t.faults(),
          events,
          wallMs: performance.now() - t0,
        };
      }, json);
    } finally {
      await page.close();
      await ctx.close();
    }
  }

  async close(): Promise<void> {
    await this.launched?.close();
    await this.server?.close();
    this.launched = null;
    this.server = null;
    this.opening = null;
  }
}
